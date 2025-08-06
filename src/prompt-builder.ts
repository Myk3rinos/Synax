import { Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

export function buildPromptWithTools(promptRules: string, tools: Tool[], userInput: string): string {
    const toolDefinitions = tools.map(tool => {
        return `
<tool>
    <name>${tool.name}</name>
    <description>${tool.description}</description>
    <parameters>
        ${JSON.stringify(tool.input_schema, null, 2)}
    </parameters>
</tool>
`;
    }).join('\n');

    const prompt = `
TOOLS:
You have access to the following tools:
${toolDefinitions}

You must respond in one of two ways:
1. If you can answer the user's request without using any tools, provide a direct answer.
2. If you need to use a tool, you must respond with a JSON object in the following format:
{
    "tool_name": "the_name_of_the_tool_to_use",
    "parameters": {
        "parameter_name_1": "parameter_value_1",
        "parameter_name_2": "parameter_value_2"
    }
}

RULES:
${promptRules}

USER INPUT:
${userInput}
`;

    return prompt;
}
