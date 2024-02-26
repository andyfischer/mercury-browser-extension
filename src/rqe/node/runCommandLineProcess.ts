
import { startConsoleRepl, ReplOptions } from './consoleRepl'
import { overrideProcessExit } from './ProcessExit'
import { parseCommandLineArgs } from './parseCommandLineArgs'
import { ConsoleFormatter } from '../repl/ConsoleFormatter'
import { Graph } from '../graph'
import { getGraph } from '../globalState'

export { startConsoleRepl } from './consoleRepl'

export interface StartOptions {
    graph?: Graph

    processName?: string

    // Called while setting up the graph
    setupGraph?(graph: Graph): void

    // Called once setup is done
    onReady?(graph: Graph): void | Promise<void>
    // runWhenReady?: QueryLike[]

    loadFiles?: string[]
    loadModules?: any[]
    startRepl?: boolean | ReplOptions
    terminal?: {
        title?: string
    }
    runFromStdin?: boolean
    standardCommandLineArgHandling?: boolean
    enableLoggingCategories?: string[]
}

/*
 Start running this process as a command-line application.

 This does various process-wide things like:

   - Read command line options from process.argv.
   - Override process.exit for graceful shutdown.
*/

function optionsWithCommandLine(options: StartOptions) {
    const args = parseCommandLineArgs(process.argv.slice(2));

    for (const tag of args.tags){
        if (tag.attr === 'subprocess') {
            throw new Error("fix: subprocess?")
            /*
            options.loadSubprocesses = options.loadSubprocesses || [];
            options.loadSubprocesses.push(toShellCommand(flag.value));
            */
        }

        if (tag.attr === 'enable-logging') {
            options.enableLoggingCategories = options.enableLoggingCategories || [];
            options.enableLoggingCategories.push(tag.getStringValue());
        }

        if (tag.attr === 'stdin') {
            options.runFromStdin = true;
        }
    }

    return options;
}

function optionsWithDefaults(options: StartOptions) {
    if (options.runFromStdin && options.startRepl === undefined)
        options.startRepl = false;

    if (options.startRepl === undefined)
        options.startRepl = true;

    return options;
}

function runFromStdin(graph: Graph) {
    const formatter = new ConsoleFormatter({ graph });

    process.stdin.on('data', chunk => {
        let query = chunk.toString();
        if (query[query.length -1] === '\n')
            query = query.slice(0, query.length - 1);

        graph.query(query).sendTo(formatter.newTask().incoming);
    });
}

function setTerminalTitle(title) {
  process.stdout.write(
    String.fromCharCode(27) + "]0;" + title + String.fromCharCode(7)
  );
}

export async function runCommandLineProcess(options: StartOptions = {}) {

    require('source-map-support').install();

    try {
        overrideProcessExit();

        options = optionsWithCommandLine(options);
        options = optionsWithDefaults(options);

        const graph = options.graph || getGraph();

        if (options.terminal?.title || options.processName) {
            setTerminalTitle(options.terminal?.title || options.processName);
        }

        if (options.onReady) {
            await options.onReady(graph);
        }

        if (options.startRepl) {
            const replOptions = (options.startRepl && typeof options.startRepl === 'object') ? options.startRepl : {};
            if (replOptions.prompt === undefined && options.processName)
                replOptions.prompt = `${options.processName}~ `;
            startConsoleRepl({ graph, ...replOptions });
        }

        if (options.runFromStdin) {
            runFromStdin(graph);
        }

        return graph;
    } catch (err) {
        process.exitCode = -1;
        console.error(err.stack || err);
    }
}

if (require.main === module) {
    runCommandLineProcess({
        standardCommandLineArgHandling: false
    });
}
