import chalk from 'chalk';

import os from 'os';
import { execSync } from 'child_process';

function getFileSystemTree(homeDir: string): string {
    try {
        // Utiliser ls avec options pour afficher la structure des dossiers
        const output = execSync(`ls -la ${homeDir}`, { 
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024
        });
        return output || "No directory structure found.";
    } catch (error) {
        if (error instanceof Error) {
            return `Error getting directory structure: ${error.message}`;
        }
        return "An unknown error occurred while getting the file system tree.";
    }
}

const USER_NAME = os.userInfo().username || "User";
const OS_PLATFORM = os.platform();
const OS_ARCH = os.arch();
const OS_RELEASE = os.release();
const OS_HOMEDIR = os.homedir();
const OS_TMPDIR = os.tmpdir();
const CPU_CORES = os.cpus().length;
const TOTAL_MEMORY_GB = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
const FREE_MEMORY_GB = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
const UPTIME_HOURS = (os.uptime() / 3600).toFixed(1);
const NETWORK_INTERFACES = os.networkInterfaces();
const OS_LANGUAGE = process.env.LANG || 'en_US.UTF-8';

export class ControlAgent {
    private baseUrl: string;
    private model: string;
    private timeout: number;

    constructor(baseUrl: string, model: string, timeout: number = 60000) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.timeout = timeout;
    }

    async controlToolAgent(previousPrompt: string, error: string): Promise<string> {
        const controlPrompt = `
You are a control agent. Your role is to analyze the error from the previous tool execution and refine the prompt to ensure the next attempt is successful.

**System Information:**
- User: ${USER_NAME}
- OS: ${OS_PLATFORM} ${OS_ARCH} (${OS_RELEASE})
- CPU Cores: ${CPU_CORES}
- Memory: ${FREE_MEMORY_GB}GB free of ${TOTAL_MEMORY_GB}GB total
- Uptime: ${UPTIME_HOURS} hours
- Home Directory: ${OS_HOMEDIR}
- Temp Directory: ${OS_TMPDIR}
- System Language: ${OS_LANGUAGE}

**File System Structure:**
${getFileSystemTree(OS_HOMEDIR)}

**Previous Prompt:**
${previousPrompt}

**Error:**
${error}

**Instructions:**
1.  Analyze the error and the previous prompt.
2.  Identify the reason for the failure (e.g., missing parameters, incorrect format, incorrect path, etc.).
3.  Generate a new, corrected prompt that addresses the error.
4.  Ensure the new prompt is clear, complete, and follows all the rules of the original prompt.
5.  Respond with ONLY the new prompt.

**New Prompt:**
`;
        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: controlPrompt,
                    stream: false,
                    options: {
                        temperature: 0.5,
                        top_p: 0.9,
                        top_k: 40
                    }
                }),
                signal: AbortSignal.timeout(this.timeout)
            });

            if (!response.ok) {
                const errorDetails = await response.json().catch(() => ({}));
                throw new Error(errorDetails.error || `HTTP error! status: ${response.status}`);
            }
// await this.toolAgent.handleToolExecution(this.tools, currentPrompt);
            const result = await response.json();
            console.log(chalk.yellow('🧠 Control agent generated a new prompt...'));
            return result.response;

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            console.error(chalk.red('Control Agent Error:'), errorMessage);
            // In case of failure, return the original prompt to avoid breaking the loop
            return previousPrompt;
        }
    }
}