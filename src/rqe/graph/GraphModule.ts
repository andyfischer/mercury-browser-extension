
import { Handler } from '../handler'
import { Graph } from './Graph'

export class GraphModule {
    graph: Graph

    handlers: Handler[] = []

    constructor(graph: Graph) {
        this.graph = graph;
    }

    redefine(handlers: Handler[]) {
        for (const handler of handlers)
            handler.freeze();

        this.handlers = handlers;
        this.graph.onModuleChange(this);
    }
}
