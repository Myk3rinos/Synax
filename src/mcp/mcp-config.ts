
import config from '../../config.json' with { type: 'json' };

interface McpConfig {
    "mcp-personnal-tool": {
        type: string;
        command: string;
        args: string[];
        env: {
            [key: string]: string;
        };
    };
}

export function getMcpConfig(): McpConfig | null {
    if (config && 'mcp' in config) {
        return config.mcp as McpConfig;
    }
    return null;
}
