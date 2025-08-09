import readline from 'readline';
import chalk from 'chalk';

/**
 * Asks the user to confirm command execution using arrow keys ←/→ or ↑/↓
 * @param {string} cmd - The command to execute
 * @returns {Promise<boolean>} true if the user confirms, false otherwise
 */
const confirmExecution = (cmd) => {
    return new Promise(resolve => {
        const stdin = process.stdin;
        const stdout = process.stdout;

        if (!stdin.isTTY) {
            // Simple fallback if not in TTY
            const rl = readline.createInterface({ input: stdin, output: stdout });
            rl.question(chalk.yellow(`\nAuthorize execution of "${cmd}"? (y/N): `), answer => {
                rl.close();
                resolve(['y', 'o'].includes(answer.trim().toLowerCase()));
            });
            return;
        }

        const choices = [`Execute command`, 'Cancel'];
        let index = 0;
        let lastRenderHeight = 0;

        function render() {
            // Save cursor position
            stdout.cursorTo(0);
            
            // Calculate how many lines to clear
            const linesToClear = lastRenderHeight || 0; // By default, clear 5 lines
            
            // Clear previous lines
            for (let i = 0; i < linesToClear; i++) {
                stdout.clearLine(0);
                if (i < linesToClear - 1) {
                    stdout.cursorTo(0);
                    stdout.moveCursor(0, -1);
                }
            }
            
            // Return to the beginning of the render area
            stdout.cursorTo(0);
            
            //-----------------------------
            // Display the message and command
            // const message = `${chalk.magenta(` Authorize execution of:`)}${chalk.gray(`\n "${cmd}" \n`)}\n`;
            const message = `${chalk.yellow(` Authorize execution of:`)}${chalk.gray(` ${cmd}\n`)}`;
            
            // Display choices
            const choicesText = choices.map((c, i) => 
                i === index ? chalk.blue(`> ${c}`) : `  ${c}`
            ).join('\n');
            
            const fullText = message + choicesText;
            stdout.write(fullText);
            
            // Mettre à jour la hauteur du rendu actuel
            lastRenderHeight = fullText.split('\n').length;
        }

        function cleanup(res) {
            // Effacer les lignes affichées
            for (let i = 0; i < lastRenderHeight + 2; i++) {
                stdout.cursorTo(0);
                stdout.clearLine(0);
                if (i < lastRenderHeight + 2 - 1) {
                    stdout.moveCursor(0, -1);
                }
            }
            // Aller au début de la ligne et effacer le saut de ligne inutile
            stdout.cursorTo(0);
            stdout.clearLine(0);
            // -------------------------------------------- 
            stdin.setRawMode(true);
            stdin.removeListener('data', onData);
            resolve(res);
        }

        function onData(data) {
            const s = data.toString();
            if (s === '\u0003') { // Ctrl+C
                cleanup(false);
                return;
            }
            if (s === '\r') { // Enter
                cleanup(index === 0); // true si "Exécuter"
                return;
            }
            if (s.startsWith('\u001b')) { // sequence
                // Arrow keys
                if (s === '\u001b[A' || s === '\u001b[D') {
                    index = (index + choices.length - 1) % choices.length; // left/up
                    render();
                } else if (s === '\u001b[B' || s === '\u001b[C') {
                    index = (index + 1) % choices.length; // right/down
                    render();
                }
            }
        }

        stdout.write('\n');
        stdin.setRawMode(true);
        stdin.resume();
        stdin.on('data', onData);
        render();
    });
};

export default confirmExecution;
