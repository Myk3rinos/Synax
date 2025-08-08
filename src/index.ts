#!/usr/bin/env node

import readline from 'readline';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Tool, } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { getMcpConfig } from './mcp/mcp-config.js';
import { ConversationAgent } from './agents/conversation_agent.js';
import { ToolAgent } from './agents/tool_agent.js';

const DEFAULT_MODEL: string = 'mistral';
let modelName: string = DEFAULT_MODEL;

class SynaxCLI {
    private baseUrl: string;
    private model: string;
    private timeout: number;
    private rl: readline.Interface;
    private lastDir: string;

    private mcp: Client;
    private transport: StdioClientTransport | null = null;
    private tools: Tool[] = [];
    private mcpConnected: boolean = false;

    private conversationAgent: ConversationAgent;
    private toolAgent: ToolAgent | null = null;

    constructor(baseUrl: string = "http://localhost:11434", model: string | null = null) {
        this.mcp = new Client({
            name: "mcp-client-cli",
            version: "1.0.0" 
        },
        {
            capabilities: {sampling: {},},
        },
        );
        
        this.baseUrl = baseUrl;
        this.model = model || modelName;
        this.timeout = 60000;
        
        // Initialiser l'agent de conversation
        this.conversationAgent = new ConversationAgent(this.baseUrl, this.model, this.timeout);

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.rl.setPrompt(chalk.magenta(' > '));

        this.lastDir = process.cwd();
        setInterval(() => {
            const currentDir = process.cwd();
            if (currentDir !== this.lastDir) {
                this.lastDir = currentDir;
            }
        }, 1000);
        
        // Limit the display area to avoid the last line
        process.stdout.write(`\x1b[1;${process.stdout.rows - 2}r`);
        this.updateBottomLine();
        // Add a listener for terminal resize events in the constructor :
        process.stdout.on('resize', () => {
            // Redefine the display area
            process.stdout.write(`\x1b[1;${process.stdout.rows - 2}r`);
            this.updateBottomLine();
        });

        console.log(chalk.gray('\n\n\n\n'));
        console.log(chalk.gray(' Type "exit" or "quit" to quit, "clear" to clear history'));
        console.log(chalk.gray(' Type "help" to see available commands\n'));
    }

    async connectToMCPServer(serverScriptPath: string, mcpCommand: string) {
        try {
            this.transport = new StdioClientTransport({
                command: mcpCommand,
                args: [serverScriptPath],
                stderr: "ignore"
            });
            await this.mcp.connect(this.transport);

            this.mcpConnected = true;

            const toolsResult = await this.mcp.listTools();
            this.tools = toolsResult.tools.map((tool) => {
                return {
                    name: tool.name,
                    description: tool.description,
                    input_schema: tool.inputSchema,
                };
            });
            
            // Initialiser l'agent d'outils maintenant que MCP est connecté
            this.toolAgent = new ToolAgent(this.baseUrl, this.model, this.mcp, this.tools, this.timeout);
  
            console.log("MCP tools:",this.tools.map(({ name }) => name));
        } catch (e) {
            console.log("Failed to connect to MCP server: ", e);
            throw e;
        }
    }

    async cleanup() {
        await this.mcp.close();
    }

    async agentRouteRequest(userInput: string): Promise<'CONVERSATION' | 'TOOL'> {
        if (!this.mcpConnected || this.tools.length === 0) {
            return 'CONVERSATION';
        }

        const routingPrompt = `You are a routing agent. Your job is to determine if the user wants to:
1. Have a normal conversation (CONVERSATION)
2. Execute a tool/function (TOOL)

Available tools: ${this.tools.map(t => `${t.name}: ${t.description}`).join(', ')}

User input: "${userInput}"

Analyze the user input and respond with EXACTLY one word at the beginning of your response:
- "CONVERSATION" if the user wants to chat, ask questions, or have a discussion
- "TOOL" if the user wants to execute a specific action, use a tool, or perform a task that matches one of the available tools

Your response format should be: CONVERSATION or TOOL followed by a brief explanation.`;

        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: routingPrompt,
                    stream: false,
                    options: {
                        temperature: 0.1,
                        top_p: 0.9,
                        top_k: 10
                    }
                }),
                signal: AbortSignal.timeout(this.timeout)
            });

            if (!response.ok) {
                console.error(chalk.red('Routing error, defaulting to conversation'));
                return 'CONVERSATION';
            }

            const result = await response.json();
            const decision = result.response.trim().toUpperCase();
            
            if (decision.startsWith('TOOL')) {
                // console.log(chalk.gray('🤖 Routing to tool agent...'));
                return 'TOOL';
            } else {
                // console.log(chalk.gray('💬 Routing to conversation agent...'));
                return 'CONVERSATION';
            }
            
        } catch (error) {
            console.error(chalk.red('Error in routing decision, defaulting to conversation:'), error);
            return 'CONVERSATION';
        }
    }

    async processUserInput(input: string): Promise<void> {
        try {
            // Determine which agent to use
            const routingDecision = await this.agentRouteRequest(input);
            // console.log(chalk.gray(`Routing decision: ${routingDecision}`)); 
            if (routingDecision === 'TOOL' && this.toolAgent) {
                await this.toolAgent.handleToolExecution(this.tools, input);
            } else {
                await this.conversationAgent.handleConversation(input);
            }

            setTimeout(() => {
                this.updateBottomLine();
            }, 100); 

        } catch (error) {
            console.error('\n' + chalk.red('Processing Error:'), error instanceof Error ? error.message : 'Unknown error');
        }
        
        this.updateBottomLine();
        this.rl.prompt();
    }

    showHelp(): void {
        console.log(chalk.cyan('\nAvailable commands:'));
        console.log(chalk.gray('  exit/quit - Exit the application'));
        console.log(chalk.gray('  clear     - Clear conversation history'));
        console.log(chalk.gray('  help      - Display this help'));
        console.log(chalk.gray('  status    - Check connection to the model'));
        console.log(chalk.gray('  tools     - List available tools'));
        this.updateBottomLine();
        this.rl.prompt();
    }

    start(): void {
        console.log(chalk.green(` ${this.model} CLI started!`));
        console.log(chalk.gray(' Type "help" to see available commands\n'));
        this.rl.prompt();
        this.updateBottomLine();

        this.rl.on('line', async (input: string) => {
            await this.handleCommand(input);
        });

        this.rl.on('close', () => {
            console.log(chalk.yellow('\nGoodbye! 👋'));
            process.exit(0);
        });
    }

    private updateBottomLine(): void {
        // Save actual cursor position
        process.stdout.write('\x1b[s');
        // Go to last line
        process.stdout.write(`\x1b[${process.stdout.rows - 1};1H`);
        // Clear line
        process.stdout.write('\x1b[2K');

        // Get current git branch name if in a git repository
        let gitBranch = '';
        try {
            const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { 
                encoding: 'utf-8',
                cwd: this.lastDir // Use the current directory of the application
            }).trim();
            gitBranch = branch ? ` (${branch})` : '';
        } catch (e) {
            // Not a git repository or other git error - silently ignore
        }
       
        // Display MCP server connection status
        let mcpConnect = '';
        if (this.mcpConnected) {
            const statusIcon = chalk.green('●');
            mcpConnect += `       | ${statusIcon} MCP |       `;
        }

        // Display full bottom line
        process.stdout.write(chalk.gray(` -> ${this.lastDir}`) + chalk.magenta(gitBranch) + chalk.gray(mcpConnect) + chalk.green(this.model));
        // Restore cursor position
        process.stdout.write('\x1b[u');
    }

    private async handleCommand(input: string): Promise<void> {
        input = input.trim();

        if (input === 'exit' || input === 'quit') {
            this.rl.close();
            return;
        }

        if (input === 'clear') {
            console.clear();
            this.updateBottomLine();
            this.rl.prompt();
            return;
        }

        if (input === 'help') {
            this.updateBottomLine();
            this.showHelp();
            return;
        }

        if (input === 'status') {
            console.log(chalk.blue('Checking connection to model...'));
            try {
                await fetch(`${this.baseUrl}/api/tags`);
                console.log(chalk.green('✓ Connected to Ollama'));
            } catch (error) {
                console.error(chalk.red('✗ Could not connect to Ollama. Is it running?'));
            }
            this.updateBottomLine();
            this.rl.prompt();
            return;
        }
        
        if (input === 'tools') {
            console.log(chalk.blue('Checking connection to MCP...'));
            try {
                const toolsResult = await this.mcp.listTools();
                console.log(chalk.green('✓ Connected to MCP'));
                console.log(chalk.green('Tools: ', toolsResult.tools.map(({ name }) => name)));
            } catch (error) {
                console.error(chalk.red('✗ Could not connect to MCP. Is it running?'));
            }
            this.updateBottomLine();
            this.rl.prompt();
            return;
        }

        if (input) {
            await this.processUserInput(input);
        } else {
            this.updateBottomLine();
            this.rl.prompt();
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    let baseUrl = "http://localhost:11434";
    let model: string | null = null;

    // Parser les arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--url' && i + 1 < args.length) {
            baseUrl = args[++i];
        } else if (args[i] === '--model' && i + 1 < args.length) {
            model = args[++i];
        }
    }

    const cli = new SynaxCLI(baseUrl, model);
    
    const mcpConfig = getMcpConfig();
    if (mcpConfig) {
        const mcpSettings = mcpConfig['mcp-personnal-tool'];
        if (mcpSettings) {
            const { command, args } = mcpSettings;
            if (command && args && args.length > 0) {
                try {
                    await cli.connectToMCPServer(args[0], command);
                } catch (error) {
                    console.error(chalk.red('Could not connect to MCP server.'));
                }
            }
        }
    }

    cli.start();
}

main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
});
