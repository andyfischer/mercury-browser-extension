
import { Stream, StreamEvent, c_done, c_close, c_fail, } from '../Stream'
import { Table, lazySchema } from '../table'
import { callbackToStream } from '../handler'
import { ErrorExtended } from '../Errors'
import { warn } from '../logger'
import { LogEvent, c_log_warn, c_log_error } from '../logger'
import { ProtocolDetailsItem } from './ProtocolDetails'
import { compileSchema } from '../table'

interface SetupParams {
    name: string
    handlers?: Table
    protocolDetails?: Table<ProtocolDetailsItem>
    logStream?: Stream<LogEvent>
    onRequest?: (req: any) => void
}

export class ManagedAPI {
    name: string
    protocolDetails?: Table<ProtocolDetailsItem>
    handlers: Table
    logStream: Stream<LogEvent>
    onRequest?: (req: any) => void

    constructor(params: SetupParams) {
        if (params.handlers) {
            params.handlers.assertSupport('get_with_name');
        }

        if (params.protocolDetails) {
            params.protocolDetails.assertSupport('get_with_name');
        }

        this.name = params.name;
        this.handlers = params.handlers;
        this.protocolDetails = params.protocolDetails;
        this.logStream = params.logStream || Stream.newNullStream();
        this.onRequest = params.onRequest;
        
        if (!this.handlers) {
            this.handlers = compileSchema({
                name: params.name + '.handlers',
                funcs: [
                    'each',
                    'get(name)'
                ]
            }).createTable();
        }
    }

    wrapOutgoingStream(req: any, output: Stream) {
        const wrapped = new Stream();
        const requestDetails: ProtocolDetailsItem = this.protocolDetails && this.protocolDetails.get_with_name(req.t);

        let timeoutCheck = null;

        if (requestDetails?.isLongRunning) {
        } else {
            timeoutCheck = setTimeout((() => {
                this.logStream.put({ level: c_log_warn, message: "Request still unresolved after 5 seconds", req });
            }), 5000);
        }

        wrapped.sendTo(evt => {
            switch (evt.t) {
            case c_fail:
                this.logStream.put({ level: c_log_error, message: `API error response (${req.t})`, cause: evt.error, req });
                clearTimeout(timeoutCheck);
                break;
            case c_done:
            case c_close:
                clearTimeout(timeoutCheck);
            }

            output.receive(evt);
        });

        return wrapped;
    }

    handleRequest(req: any, connection, output: Stream) {
        output = this.wrapOutgoingStream(req, output);

        callbackToStream(() => {
            if (!req.t) {
                this.logStream.put({ level: c_log_warn, message: 'bad request, missing .t: ', req });
                throw new ErrorExtended({ errorType: "bad_request", errorMessage: "request object missing .t"});
            }

            const handler = this.handlers.get_with_name(req.t);

            if (this.onRequest)
                this.onRequest(req);

            if (handler)
                return handler.callback(req, connection);

            // Unhandled case
            
            // Trigger some default handlers.
            if (req.t === "Ping") {
                return {
                    t: 'Pong'
                }
            }

            warn(`ManagedAPI '${this.name}: unrecognized request: ${req.t}`);
            throw new ErrorExtended({
                errorType: "unhandled_request",
                errorMessage: `Managed API '${this.name}' doesn't have a handler for: ${req.t}`
            });
        }, output);
    }
}
