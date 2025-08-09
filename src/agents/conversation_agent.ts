import chalk from 'chalk';
import { addHistory } from '../history/history.js';

export class ConversationAgent {
    private baseUrl: string;
    private model: string;
    private timeout: number;

    constructor(baseUrl: string, model: string, timeout: number = 60000) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.timeout = timeout;
    }

    
    async handleConversation(prompt: string): Promise<void> {

        const conversationPrompt = 'Always answer in same language as the user, and do not translate. Here is the ask of the user: "' + prompt + '"';

        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: conversationPrompt,
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
            let responseAccum = '';

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
                                // Write without cursor manipulation 
                                process.stdout.write(chalk.blue(parsed.response));
                                // Accumulate for a single history entry
                                responseAccum += String(parsed.response);
                            }
                        } catch (e) {
                            console.log('\nError parsing response line:', e);
                            try { addHistory(`Error parsing response line: ${e instanceof Error ? e.message : String(e)}`); } catch {}
                        }
                    }
                }
            } catch (error) {
                console.log('\nError reading response stream:', error instanceof Error ? error.message : 'Unknown error');
                try { addHistory(`Error reading response stream: ${error instanceof Error ? error.message : 'Unknown error'}`); } catch {}
            }            
            
            console.log('\n'); // New line at the end
            if (responseAccum.trim().length > 0) {
                try { addHistory(responseAccum); } catch {}
            }
            
        } catch (error) {
            console.log('\n' + chalk.red('Conversation Error:'), error instanceof Error ? error.message : 'Unknown error');
            try { addHistory(`Conversation Error: ${error instanceof Error ? error.message : 'Unknown error'}`); } catch {}
        }
    }
}