#!/usr/bin/env node

import readline from 'readline';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
// import { Anthropic } from "@modelcontextprotocol/sdk/anthropic.js";
import { MessageParam, Tool, } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { getMcpConfig } from './mcp-config.js';
import { buildPromptWithTools } from './prompt-builder.js';
import { PROMPT_RULES } from './promptRules2.js';

const DEFAULT_MODEL: string = 'mistral';
let modelName: string = DEFAULT_MODEL;

class SynaxCLI {
    private baseUrl: string;
    private model: string;
    private timeout: number;
    private rl: readline.Interface;
    private lastDir: string;

    private mcp: Client;
    // private anthropic: Anthropic;
    private transport: StdioClientTransport | null = null;
    private tools: Tool[] = [];
    private mcpConnected: boolean = false;


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

        console.log(chalk.gray('\n\n\n\n\n'));
        console.log(chalk.gray(' Type "exit" or "quit" to quit, "clear" to clear history'));
        console.log(chalk.gray(' Type "help" to see available commands\n'));
    }

    async connectToMCPServer(serverScriptPath: string, mcpCommand: string) {
        try {
            // const isJs = serverScriptPath.endsWith(".js");
            // const isPy = serverScriptPath.endsWith(".py");
            // if (!isJs && !isPy) {
            //     throw new Error("Server script must be a .js or .py file");
            // }
            // const command = isPy
            // ? process.platform === "win32"
            //   ? "python"
            //   : "python3"
            // : process.execPath;
      
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
            console.log("MCP tools:",this.tools.map(({ name }) => name));
        } catch (e) {
            console.log("Failed to connect to MCP server: ", e);
            throw e;
        }
    }

    async cleanup() {
        await this.mcp.close();
    }

    async sendToOllama(prompt: string): Promise<void> {
        try {
            // console.log(chalk.gray('Sending request to Ollama...'));
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: prompt,
                    stream: true,
                    options: {
                        temperature: 0.7,
                        top_p: 0.9,
                        top_k: 40
                    }
                }),
                signal: AbortSignal.timeout(this.timeout)
            });

            if (!response.ok) {
                try {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.error || `HTTP error! status: ${response.status}`);
                } catch (e) {
                    throw new Error(`Failed to parse error response: ${response.status} ${response.statusText}`);
                }
            }

            if (!response.body) {
                throw new Error('No response body received from the server');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            // let responseText = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (!value) continue;
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n').filter(line => line.trim() !== '');
                    
                    for (const line of lines) {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.response !== undefined) {
                                // Display the response as it comes in
                                process.stdout.write(chalk.blue(parsed.response));
                                // responseText += parsed.response;
                            }
                        } catch (e) {
                            console.error('\nError parsing response line:', e);
                        }
                    }
                }
            } catch (error) {
                console.error('\nError reading response stream:', error instanceof Error ? error.message : 'Unknown error');
            }
            
            // Add a newline after the response
            console.log('\n');
            this.updateBottomLine();
            this.rl.prompt();
        } catch (error) {
            console.error('\n' + chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
            this.updateBottomLine();
            this.rl.prompt();
        }
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
            await this.processInput(input);
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
            // Not a git repository or other git error
            console.error('Git branch error:', e);
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

    private async processInput(input: string): Promise<void> {
        input = input.trim();

        if (input === 'exit' || input === 'quit') {
            this.rl.close();
            return;
        }

        if (input === 'clear') {
            console.clear();
            this.rl.prompt();
            return;
        }

        if (input === 'help') {
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
            this.updateBottomLine();
            let prompt = input;
            if (this.mcpConnected && this.tools.length > 0) {
                prompt = buildPromptWithTools(PROMPT_RULES, this.tools, input);
            }
            await this.sendToOllama(prompt);
            this.updateBottomLine();

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
