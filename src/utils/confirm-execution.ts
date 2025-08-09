import readline from 'readline';
import chalk from 'chalk';

/**
 * Asks the user to confirm command execution using arrow keys ←/→ or ↑/↓
 * @param cmd - The command to execute
 * @returns Promise<boolean> true if the user confirms, false otherwise
 */
const confirmExecution = (cmd: string): Promise<boolean> => {
  return new Promise<boolean>((resolve) => {
    const stdin = process.stdin as NodeJS.ReadStream;
    const stdout = process.stdout as NodeJS.WriteStream;

    if (!stdin.isTTY) {
      // Simple fallback if not in TTY
      const rl = readline.createInterface({ input: stdin, output: stdout });
      rl.question(
        chalk.yellow(`\nAuthorize execution of "${cmd}"? (y/N): `),
        (answer: string) => {
          rl.close();
          resolve(['y', 'o'].includes(answer.trim().toLowerCase()));
        }
      );
      return;
    }

    const choices = ['Execute command', 'Cancel'];
    let index = 0;
    let lastRenderHeight = 0;

    const render = (): void => {
      // Move to start of line
      stdout.cursorTo(0);

      // Clear previous lines
      const linesToClear = lastRenderHeight || 0;
      for (let i = 0; i < linesToClear; i++) {
        stdout.clearLine(0);
        if (i < linesToClear - 1) {
          stdout.cursorTo(0);
          stdout.moveCursor(0, -1);
        }
      }

      // Return to the beginning of the render area
      stdout.cursorTo(0);

      // Display the message and command
      const message = `${chalk.yellow(' Authorize execution of:')}${chalk.gray(` ${cmd}\n`)}`;

      // Display choices
      const choicesText = choices
        .map((c, i) => (i === index ? chalk.blue(`> ${c}`) : `  ${c}`))
        .join('\n');

      const fullText = message + choicesText;
      stdout.write(fullText);

      // Update measured render height
      lastRenderHeight = fullText.split('\n').length;
    };

    const cleanup = (res: boolean): void => {
      // Clear displayed lines
      for (let i = 0; i < lastRenderHeight + 2; i++) {
        stdout.cursorTo(0);
        stdout.clearLine(0);
        if (i < lastRenderHeight + 1) {
          stdout.moveCursor(0, -1);
        }
      }
      stdout.cursorTo(0);
      stdout.clearLine(0);

      // Restore terminal state
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.removeListener('data', onData);

      resolve(res);
    };

    const onData = (data: Buffer): void => {
      const s = data.toString();
      if (s === '\u0003') {
        // Ctrl+C
        cleanup(false);
        return;
      }
      if (s === '\r') {
        // Enter
        cleanup(index === 0);
        return;
      }
      if (s.startsWith('\u001b')) {
        // Escape sequences - Arrow keys
        if (s === '\u001b[A' || s === '\u001b[D') {
          // up/left
          index = (index + choices.length - 1) % choices.length;
          render();
        } else if (s === '\u001b[B' || s === '\u001b[C') {
          // down/right
          index = (index + 1) % choices.length;
          render();
        }
      }
    };

    stdout.write('\n');
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
    render();
  });
};

export default confirmExecution;
