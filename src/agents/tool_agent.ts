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
        User want to use tools to answer his request.
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
            // Envoyer la requête à Ollama sans stream pour analyser la réponse
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: toolPrompt,
                    stream: false,
                    options: {
                        temperature: 0.3, // Température plus basse pour plus de précision
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
            console.log(chalk.gray(aiResponse));
            
            // Analyser la réponse de l'IA pour extraire les appels d'outils
            const toolCalls = await this.parseToolCall(aiResponse);
            console.log(chalk.magenta(toolCalls?.tool));
            console.log(chalk.magenta('Arguments:', toolCalls?.arguments));
            
            if (aiResponse.length === 0) {
                console.log(chalk.blue(aiResponse));
                return;
            }

            // Exécuter l'outil demandé
            if (toolCalls?.tool && toolCalls?.arguments) {
                await this.callTool(toolCalls.tool, toolCalls.arguments);
            }

        } catch (error) {
            console.error('\n' + chalk.red('Tool Error:'), error instanceof Error ? error.message : 'Unknown error');
        }
    }

    // Fonction pour formatter les outils disponibles pour Mistral
    private formatToolsForMistral(tools: any[]) {
        if (!tools || tools.length === 0) return "";
        
        let toolsDescription = "\n\nOutils disponibles :\n";
        tools.forEach(tool => {
            toolsDescription += `- ${tool.name}: ${tool.description}\n`;
            if (tool.inputSchema && tool.inputSchema.properties) {
                toolsDescription += `  Paramètres requis:\n`;
                Object.entries(tool.inputSchema.properties).forEach(([key, value]: [string, any]) => {
                    toolsDescription += `    - ${key}: ${value.description || value.type}\n`;
                });
            }
        });
        console.log(toolsDescription); 
        toolsDescription += `\nPour utiliser un outil, répondez EXACTEMENT avec le format JSON suivant en utilisant les noms de paramètres corrects :
        {
            "tool": "nom_de_l_outil",
            "arguments": {
                "nom_param_exact": "valeur"
            }
        }`;
        
        return toolsDescription;
    }

    // Fonction pour détecter si la réponse contient un appel d'outil
    private async parseToolCall(response: string) {
        try {
            // Chercher un JSON dans la réponse
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

    // Fonction pour mapper les paramètres selon l'outil
    private mapArguments(toolName: string, args: any): any {
        // Mapping spécifique pour certains outils
        const mappings: Record<string, Record<string, string>> = {
            'add-note': {
                'note': 'text',
                'content': 'text',
                'message': 'text'
            }
            // Ajouter d'autres mappings si nécessaire
        };

        if (mappings[toolName]) {
            const mapped: any = {};
            const toolMapping = mappings[toolName];
            
            for (const [key, value] of Object.entries(args)) {
                const mappedKey = toolMapping[key] || key;
                mapped[mappedKey] = value;
            }
            
            return mapped;
        }
        
        return args;
    }

    // Fonction pour exécuter un outil MCP
    private async callTool(toolName: string, args: any) {
        try {
            console.log(`\n🔧 Exécution de l'outil: ${toolName}`);
            console.log(`🔧 Arguments originaux:`, args);

            // Mapper les arguments selon l'outil
            const mappedArgs = this.mapArguments(toolName, args);
            console.log(`🔧 Arguments mappés:`, mappedArgs);

            // Passer directement l'objet args, ne pas le convertir en string
            const result = await this.mcp.callTool({
                name: toolName,
                arguments: mappedArgs // Utiliser les arguments mappés
            });
            
            // console.log(chalk.green('✅ Outil exécuté avec succès'));
            // if (result.content) {
            //     for (const content of result.content) {
            //         if (content.type === 'text') {
            //             console.log(chalk.white(content.text));
            //         }
            //     }
            // }
            
        } catch (error) {
            console.error(`❌ Erreur lors de l'exécution de ${toolName}:`, error);
            throw error;
        }
    }
}