import chalk from 'chalk';
import { Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

export async function agentRouteRequest(
    userInput: string,
    baseUrl: string,
    model: string,
    timeout: number,
    mcpConnected: boolean,
    tools: Tool[]
): Promise<'CONVERSATION' | 'TOOL'> {
    if (!mcpConnected || tools.length === 0) {
        return 'CONVERSATION';
    }

    const routingPrompt = `You are a routing agent. Your job is to determine if the user wants to:
1. Have a normal conversation (CONVERSATION)
2. Execute a tool/function (TOOL)

Available tools: ${tools.map(t => `${t.name}: ${t.description}`).join(', ')}

User input: "${userInput}"

Analyze the user input and respond with EXACTLY one word at the beginning of your response:
- "CONVERSATION" if the user wants to chat, ask questions, or have a discussion
- "TOOL" if the user wants to execute a specific action, use a tool, or perform a task that matches one of the available tools

Your response format should be: CONVERSATION or TOOL followed by a brief explanation.`;

    try {
        const response = await fetch(`${baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                prompt: routingPrompt,
                stream: false,
                options: {
                    temperature: 0.1,
                    top_p: 0.9,
                    top_k: 10
                }
            }),
            signal: AbortSignal.timeout(timeout)
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
