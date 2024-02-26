
import Fs from 'fs/promises'
import Path from 'path'

class Control {
    _skipContents = false

    skipContents() {
        this._skipContents = true
    }
}

type Callback = (path: string, control?: Control) => void | Promise<void>

export async function recursiveWalk(path: string, callback: Callback) {

    const control = new Control();
    await callback(path, control);

    if ((await Fs.lstat(path)).isDirectory() && !control._skipContents) {
        const dir = path;

        let dirContents: string[];

        try {
            dirContents = await Fs.readdir(dir);
        } catch (e) {
            throw new Error(`Failed to read directory: ${dir} (${e})`)
        }

        for (const directoryFile of dirContents) {
            const control = new Control();
            const relativePath = Path.join(dir, directoryFile);

            await recursiveWalk(relativePath, callback);
        }
    }
}

