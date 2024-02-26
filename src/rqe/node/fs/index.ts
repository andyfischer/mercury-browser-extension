import Fs from 'fs/promises'
import Path from 'path'

export { recursiveWalk, recursiveWalkRelative } from './RecursiveWalk'

export async function fileExists(path: string) {
    try {
        await Fs.stat(path);
        return true;
    } catch (err) {
        return false;
    }
}

export async function ensureDir(path: string) {
    if (!path)
        return;

    const parent = Path.dirname(path);

    if (parent && parent != path)
        await ensureDir(parent);

    let stat;

    try {
        stat = await Fs.stat(path);
    } catch (e) {
        // file not found, create it
        await Fs.mkdir(path);
        return;
    }

    if (!stat.isDirectory())
        throw new Error('Path is not a directory' + path);
}

export async function ensureParentDir(path: string) {
    return ensureDir(Path.dirname(path));
}
