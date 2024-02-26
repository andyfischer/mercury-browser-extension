
import Fs from 'fs/promises'
import Path from 'path'

interface Options {
    ignorePath?: (path: string) => boolean
}

export async function* recursiveWalk(path: string, options: Options = {}) {
    if (options.ignorePath && options.ignorePath(path))
        return;

    if ((await Fs.lstat(path)).isDirectory()) {
        const dir = path;

        let dirContents: string[];

        try {
            dirContents = await Fs.readdir(dir);
        } catch (e) {
            throw new Error(`Failed to read directory: ${dir} (${e})`)
        }

        for (const directoryFile of dirContents) {
            const relativePath = Path.join(dir, directoryFile);
            for await (const recursiveFile of recursiveWalk(relativePath, options))
                yield recursiveFile;
        }
    } else {
        yield path;
    }
}

export async function* recursiveWalkRelative(basePath: string, options: Options = {}) {

    async function* recursiveCheck(subPath: string) {
        if (options.ignorePath && options.ignorePath(subPath))
            return;

        const actualPath = Path.join(basePath, subPath);

        if (!(await Fs.lstat(actualPath)).isDirectory()) {
            yield subPath;
            return;
        }

        // Recursively list directory
        let dirContents: string[];

        try {
            dirContents = await Fs.readdir(actualPath);
        } catch (e) {
            throw new Error(`Failed to read directory: ${actualPath} (${e})`)
        }

        for (const directoryFile of dirContents) {
            const relativePath = Path.join(subPath, directoryFile);

            for await (const recursiveFile of recursiveCheck(relativePath))
                yield recursiveFile;
        }
    }

    for await (const path of recursiveCheck('.'))
        yield path;
}

