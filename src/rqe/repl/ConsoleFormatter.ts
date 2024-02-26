
import { Stream, StreamEvent, c_done, c_fail, c_item, c_close, c_schema } from '../Stream'
import { StringIDSource } from '../utils/IDSource'
import { ErrorItem } from '../Errors'
import { TableFormatState, newTableFormatState, formatItems, updateStateForItems,
    formatHeader, printItems } from './TableFormatter';
import { GraphLike } from '../graph';
import { Table } from '../table'
import { terminalFormatError } from './consoleOutput'

type Item = any

interface Task {
    id: string
    incoming: Stream
    buffer: Item[]
    flushTimer: any
    formatState: TableFormatState
}

interface Settings {
    graph?: GraphLike
    log?: (...items: any[]) => void
    printPrompt?: () => void
    prompt?: string
    setPrompt?: (s: string) => void
}

type MostRecentOutput = 'none' | 'log' | 'prompt' | 'submitted' | { t: 'dataWithHeader', header: string }

export class ConsoleFormatter {
    // expose a interface for incoming Streams
    // keep track of whether the prompt is visible
    // show in-progress tasks
    // use ansi redrawing

    // more details
    //
    // incoming rows will go into a timed holding cell as we prepare to format them.
    //
    // If there's any user input then flush what we have
    //
    // Support both ansi and no-ansi mode?

    graph: GraphLike
    nextTaskId = new StringIDSource();
    activeTasks = new Map();
    flushDelayMs = 1000;
    log: (...items: any[]) => void
    prompt: string
    mostRecentOutput: MostRecentOutput
    settings: Settings
    header: Item

    constructor(settings: Settings) {
        this.graph = settings.graph;
        this.log = settings.log || console.log;
        this.prompt = settings.prompt;
        this.settings = settings;
        this.mostRecentOutput = 'none';
    }

    newTask(): Task {
        const id = this.nextTaskId.take();
        const incoming = new Stream();
        this.mostRecentOutput = 'submitted';

        const task: Task  = {
            id,
            incoming,
            buffer: [],
            flushTimer: null,
            formatState: newTableFormatState({}),
        };

        this.activeTasks.set(id, task);

        incoming.sendTo({
            receive: (msg: StreamEvent) => {
                switch (msg.t) {
                case c_schema:
                    task.formatState.schema = msg.schema;

                    // check for (...console_format_options) on this schema
                    /*
                    if (this.graph) {
                        this.graph.query([{ attrs: { ...msg.item, console_format_options: null } }])
                        .sendTo({
                            receive: (msg) => {
                                switch (msg.t) {
                                    case 'item':
                                        task.formatState.options = msg.item.console_format_options;
                                        break;
                                }
                            }
                        });
                    }*/
                    
                    break;
                case c_item:
                    task.buffer.push(msg.item);

                    if (!task.flushTimer)
                        task.flushTimer = setTimeout(() => this.flushTaskBuffer(task.id), this.flushDelayMs);

                    break;
                case c_fail:
                    this.logError(msg.error);
                    break;
                case c_done:
                case c_close:
                    this.finishTask(id);
                    break;
                }
            }
        });

        return task;
    }

    logError(error: ErrorItem) {
        this.log(terminalFormatError(error));
    }

    printTable(table: Table) {
        const task = this.newTask();
        for (const item of table.each())
            task.incoming.put(item);
        task.incoming.done();
    }

    touch() {
        this.flushAllTasks();
        this.printPrompt();
    }

    flushAllTasks() {
        for (const task of this.activeTasks.values()) {
            this.flushTaskBuffer(task.id);
        }
    }

    flushTaskBuffer(id: string) {
        if (!id)
            throw new Error("missing id");

        const task = this.activeTasks.get(id);
        if (!task) {
            // Task was already finished.
            return;
        }

        if (task.flushTimer) {
            clearTimeout(task.flushTimer);
            task.flushTimer = null;
        }

        if (task.buffer.length === 0)
            return;

        const items = task.buffer;
        task.buffer = [];

        const formatted = formatItems(task.formatState, items);
        updateStateForItems(task.formatState, formatted);
        const header = formatHeader(task.formatState);

        const skipHeader = (this.mostRecentOutput as any).t === 'dataWithHeader'
            && (this.mostRecentOutput as any).header == header.key;

        const wasPrompt = this.mostRecentOutput === 'prompt';
        if (this.mostRecentOutput === 'prompt')
            this.log();

        if (!skipHeader)
            header.print(this.log);

        printItems(task.formatState, formatted, this.log);
        this.mostRecentOutput = { t: 'dataWithHeader', header: header.key };

        if (wasPrompt)
            this.printPrompt();
    }

    preemptiveLog(...args) {
        this.flushAllTasks();
        this.log.apply(null, args);

        if (this.mostRecentOutput === 'prompt') {
            this.mostRecentOutput = 'log';
            this.maybePrintPrompt();
        }
    }

    finishTask(id: string) {
        this.flushTaskBuffer(id);
        // this.log(`(task done ${id})`);
        this.activeTasks.delete(id);

        this.printPrompt();
    }
    
    printPrompt() {

        let prompt = this.prompt;
        
        const taskCount = this.activeTasks.size;
        if (taskCount == 1) {
            prompt = '1 task running~ ';
        } else if (taskCount > 1) {
            prompt = `${taskCount} tasks running~ `;
        }

        if (this.settings.setPrompt)
            this.settings.setPrompt(prompt);

        if (this.settings.printPrompt)
            this.settings.printPrompt();

        this.mostRecentOutput = 'prompt';
    }

    maybePrintPrompt() {
        if (this.mostRecentOutput === 'prompt')
            return;

        this.printPrompt();
    }
}
