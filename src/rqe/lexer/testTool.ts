
import fs from 'fs/promises'
import { LexedText } from './LexedText'

async function main() {

    const args = process.argv.slice(2);
    const filename = args.find(arg => !arg.startsWith('--'));

    const contents = await fs.readFile(filename, 'utf8');
    const lexed = new LexedText(contents);

    if (args.includes('--lines')) {
        for (const line of lexed.lines.each()) {
            const lineText = lexed.getText(line).replace('\n', '\\n');
            console.log(`line #${line.lineNumber}: ${lineText}`);
        }
    }

    if (args.includes('--tokens')) {
        lexed.tokens.consoleLog();
    }
}

main()
.catch(console.error);
