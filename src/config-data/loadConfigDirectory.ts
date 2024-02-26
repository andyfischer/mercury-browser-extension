
import fs from 'fs/promises'
import Path from 'path'

interface Handlers {
    [name: string]: (data: any) => void
}

export async function* loadConfigDirectory(dir: string): any {

    throw new Error("fix this function to use RQE syntax");

    /*
    const actualDir = Path.join(__dirname, '../..', dir);

    // Load all files from the directory
    const files = await fs.readdir(actualDir);
    
    // Filter for .kdl files
    const kdlFiles = files.filter(file => file.endsWith('.kdl'));
    
    for (const file of kdlFiles) {
        const filename = Path.join(dir, file);

        // Read the file content
        const content = await fs.readFile(filename, 'utf-8');
        
        // Parse the file content and yield the results
        const parsed = parse(content);

        if (parsed.errors.length > 0) {
            for (const error of parsed.errors) {
                console.error(`KDL parse error on ${filename}: ${error}`);
            }

            throw new Error("KDL parse error");
        }

        yield* parsed.output;
    }
    */
}

function nodeIntoSimpleValue(node: any) {
    if (node.values.length === 1)
        return node.values[0];

    else
        return node.values;
}

function nodesIntoSimpleObject(nodes: any[]) {
    const output = {};

    for (const node of nodes) {
        output[node.name] = nodeIntoSimpleValue(node);
    }

    return output;
}

export async function readConfigs(dir: string, handlers: Handlers) {
    for await (const node of loadConfigDirectory(dir)) {
        if (handlers[node.name]) {
            const data = nodesIntoSimpleObject(node.children);
            handlers[node.name](data);
            continue;
        }

        throw new Error("unhandled node type: " + node.name);
    }
}
