import chalk from 'chalk';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

export class ToolAgent {
    private baseUrl: string;
    private model: string;
    private timeout: number;
    private mcp: Client;
    private tools: Tool[];

    constructor(baseUrl: string, model: string, mcp: Client, tools: Tool[], timeout: number = 60000) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.timeout = timeout;
        this.mcp = mcp;
        this.tools = tools;
    }

    async handleToolExecution(tools: Tool[], prompt: string): Promise<void> {
        const toolsDescription = this.formatToolsForMistral(tools); 
        const toolPrompt = `
        ** TOOLS:**
        You have access to the following tools:
        ${toolsDescription}
        
        ** RULES:**
        - User want to use tools to answer his request.
        - If the user doesn't provide all required arguments, you must generate them intelligently:
          * For paths: Is user provide a incomplite path based on french linux file system structure, rebuild the full correct path based on the context, 
          * For text fields: Generate a relevant placeholder value
          * For booleans: Use a sensible default (true/false)
          * For numbers: Use a reasonable default value
        - If the user provides only a partial path, try to complete it with the most likely directory structure
        - Always include all required parameters, even if you need to generate them
        
        ** RESPONSE FORMAT:**
        You must respond with a JSON object in the following format:
        {
            "tool": "the_name_of_the_tool_to_use",
            "arguments": {
                "param1": "value1",
                "param2": "value2"
            }
        }
        
        ${prompt}
        
        `;

        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: toolPrompt,
                    stream: false,
                    options: {
                        temperature: 0.3,
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

            const result = await response.json();
            const aiResponse = result.response;

            console.log(chalk.yellow('🔧 Tool execution requested...'));
            
            const toolCalls = await this.parseToolCall(aiResponse);
            
            if (toolCalls?.tool && toolCalls?.arguments) {
                await this.callTool(toolCalls.tool, toolCalls.arguments);
            } else if (aiResponse.length === 0) {
                console.log(chalk.blue(aiResponse));
            }

        } catch (error) {
            console.error('\n' + chalk.red('Tool Error:'), error instanceof Error ? error.message : 'Unknown error');
        }
    }

    private formatToolsForMistral(tools: any[]) {
        if (!tools || tools.length === 0) return "";
        
        let toolsDescription = "\n\nOutils disponibles :\n";
        tools.forEach(tool => {
            toolsDescription += `- ${tool.name}: ${tool.description}\n`;
            if (tool.input_schema && tool.input_schema.properties) {
                toolsDescription += `  Paramètres requis:\n`;
                Object.entries(tool.input_schema.properties).forEach(([key, value]: [string, any]) => {
                    toolsDescription += `    - ${key}: ${value.description || value.type}\n`;
                });
            }
        });
        
        toolsDescription += `\nFor tool execution, respond EXACTLY with the following JSON format using the correct parameter names :
        {
            "tool": "nom_de_l_outil",
            "arguments": {
                "nom_param_exact": "valeur"
            }
        }`;
        return toolsDescription;
    }

    private async parseToolCall(response: string) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;
            
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.tool && parsed.arguments) {
                return {
                    tool: parsed.tool,
                    arguments: parsed.arguments
                };
            }
        } catch (error) {
            return null;
        }
        return null;
    }

    private async callTool(toolName: string, args: any) {
        try {
            console.log(`\n🔧 Exécution de l'outil: ` + chalk.blue(toolName));

            const result = await this.mcp.callTool({
                name: toolName,
                arguments: args
            });

            if (result.content) {
                for (const content of result.content as any[]) {
                    if (content.type === 'text') {
                        console.log(chalk.magenta(content.text));
                    }
                }
            }
            
        } catch (error) {
            console.error(chalk.red(`❌ Erreur lors de l'exécution de ${toolName}:`), error);
            throw error;
        }
    }
}