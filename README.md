# Synax Open CLI with MCP

Synax is an open-source command-line interface (CLI) tool designed to connect to Large Language Models (LLMs) via Ollama. It allows you to send prompts and receive streaming responses directly in your terminal.

This project is open source, and the main goal is to connect to an MCP (Multi-Agent Communication Protocol) server to provide tools to the LLM.

## Project Architecture

Here is the project's file structure:

```
/Synax/
├───.gitignore
├───src
│   └───index.ts
├───package-lock.json
├───package.json
├───tsconfig.json
├───.git/
├───build/
└───node_modules/
```

-   `src/index.ts`: The application's entry point, written in TypeScript. It handles the CLI logic, argument parsing, and communication with Ollama.
-   `package.json`: Defines the project's metadata, dependencies (`ollama`, `commander`), and scripts (`build`, `start`, `dev`).
-   `tsconfig.json`: Configuration file for the TypeScript compiler.
-   `build/`: Output directory for the compiled JavaScript code.

## Prerequisites

Before you begin, ensure you have the following installed:

1.  **Node.js**: [https://nodejs.org/](https://nodejs.org/)
2.  **Ollama**: [https://ollama.com/](https://ollama.com/)

Make sure your Ollama instance is running and that you have downloaded a model. By default, this CLI uses the `mistral` model.

```sh
ollama pull mistral
```

## Installation

1.  Clone the repository:
    ```sh
    git clone <REPOSITORY_URL>
    cd Synax
    ```
2.  Install the NPM dependencies:
    ```sh
    npm install
    ```

## Configuration

Before running the application, you need to configure the path to the MCP server. Create a `config.json` file in the root of the project and add the following content:

```json
{
    "mcp": {
        "mcp-personnal-tool": {
            "command": "node",
            "args": ["/path/to/your/mcp/server.js"]
        }
    }
}
```

Replace `/path/to/your/mcp/server.js` with the actual path to your MCP server script.

## Usage

### 1. Running in Development Mode

To run the CLI directly with `ts-node` without prior compilation:

```sh
npm run dev -- "Your prompt here"
```

**Example:**

```sh
npm run dev -- "Why is the sky blue?"
```

### 2. Running in Production Mode

First, compile the TypeScript code to JavaScript:

```sh
npm run build
```

Then, run the compiled script with Node.js:

```sh
npm start -- "Your prompt here"
```

**Example:**

```sh
npm start -- "Translate 'hello world' into French"
```

The CLI will send the prompt to the `mistral` model via your local Ollama instance and display the real-time response in the console.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the `LICENSE` file for more details.
