
import * as Repl from 'repl'
import * as Path from 'path'
import * as os from 'os'

import { Graph, GraphLike, } from '../graph'
import { getCompletions } from '../repl/Completer'
import { ConsoleFormatter } from '../repl/ConsoleFormatter'
import { gracefulExit } from './ProcessExit'
import { Stream, isStream, c_fail } from '../Stream'
import { toQuery } from '../query'

export interface ReplOptions {
    graph?: GraphLike
    prompt?: string
}

function setupHelpLayer(target: GraphLike): Graph {
    const graph = new Graph();

    graph.exposeFunc('help', function*() {
        let hasPrintedHeader = false;

        const lines = [];

        for (const handler of target.eachHandler()) {
            lines.push('  ' + handler.toDeclString());
        }

        lines.sort();

        if (lines.length === 0) {
            yield { line: "No commands found!" }
            return;
        }

        for (const line of lines)
            yield { line };
    });

    return graph;
}

class LayeredGraph implements GraphLike {
    graphs: GraphLike[] = []

    constructor(graphs: GraphLike[]) {
        this.graphs = graphs;
    }

    *eachHandler() {
        for (const graph of this.graphs) {
            yield* graph.eachHandler();
        }
    }

    query(queryLike, params?): Stream {
        let graphIndex = 0;

        let result = new Stream();

        const anyNext = () => {
            return graphIndex < this.graphs.length;
        }

        const tryNext = () => {
            if (!anyNext()) {
                result.closeWithError({
                    errorType: 'no_handler_found',
                    fromQuery: queryLike,
                });
                return;
            }

            let thisClosed = false;

            const thisResult = this.graphs[graphIndex].query(queryLike, params);

            //console.log('query returned', { thisResult }, this.graphs[graphIndex])

            thisResult.sendTo(evt => {
                try {
                if (thisClosed) 
                    throw new Error("internal stream error: got message after thisClosed")

                switch (evt.t) {
                case c_fail:
                    if (evt.error.errorType === 'no_handler_found') {
                        if (anyNext()) {
                            thisClosed = true;
                            thisResult.closeByDownstream();

                            // future: this is recursive, maybe change to non-recursive.
                            graphIndex++;
                            tryNext();
                            return;
                        }
                    }
                break;
                }

                result.receive(evt);
                } catch (e) {
                    console.error(e)
                }
            });
        }

        tryNext();

        return result;
    }
}

export function startConsoleRepl(opts: ReplOptions = {}) {

    let enableConsoleOverwrite = true;
    let repl;
    let graph = new LayeredGraph([setupHelpLayer(opts.graph), opts.graph]);
    let prompt = opts.prompt || 'rqe~ ';

    let consoleLog = console.log;

    const formatter = new ConsoleFormatter({
        graph,
        log: consoleLog,
        prompt,
        printPrompt: () => repl.displayPrompt(),
        setPrompt: (s) => repl.setPrompt(s),
    });

    if (enableConsoleOverwrite) {
        console.log = (...args) => {
            formatter.preemptiveLog.apply(formatter, args);
        }
    }

    repl = Repl.start({
        prompt,
        eval: line => {
            if (!line || line.trim() === '') {
                formatter.touch();
                return;
            }

            let stream: Stream;

            const query = toQuery(line);
            stream = graph.query(line);

            if (!stream || !isStream(stream))
                throw new Error("internal error: graph didn't return a stream")

            const task = formatter.newTask();
            stream.sendTo(task.incoming);
        },

        completer(line: string) {
            const completions = getCompletions(graph, line);
            return [completions, line];
        }
    });

    try {
        repl.setupHistory(Path.join(os.homedir(), '.rqe_history'), () => {});
    } catch (e) { }

    repl.on('exit', () => {
        gracefulExit(0);
    });

    return repl;
}
