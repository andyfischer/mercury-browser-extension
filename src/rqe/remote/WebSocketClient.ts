
import { TransportConnection, TransportMessage, TransportEventType } from './TransportTypes'
import { Stream } from '../Stream'

const VerboseLogMessages = false;

interface SetupOptions {
    // Whether this socket connection is already successfully open. This 
    // is used by WebSocketServer when setting up an incoming connection.
    alreadyConnected?: boolean
}

// Small interface to describe the standard WebSocket client interface.
interface WebSocket {
    addEventListener(name: string, callback: any): void
    removeEventListener(name: string, callback: any): void
    send(msg: string): void
    close(): void
    readyState: number
}

export class WebSocketClient<RequestType,ResponseType> implements TransportConnection<RequestType> {
    socket: WebSocket
    incomingEvents: Stream<TransportMessage<RequestType>> = new Stream();
    name = "WebSocketClient"

    constructor(socket: WebSocket, { alreadyConnected }: SetupOptions = {}) {
        this.socket = socket;

        if (alreadyConnected) {
            this.incomingEvents.put({ t: TransportEventType.connection_established })
        } else {
            socket.addEventListener('open', evt => {
                if (this.incomingEvents.isClosed()) {
                    // console.log('WebSocketClient got message but incomingEvents is closed', evt);
                    return;
                }
                this.incomingEvents.put({ t: TransportEventType.connection_established })
            });
        }

        socket.addEventListener('close', evt => {
            if (this.incomingEvents.isClosed()) {
                // console.log('WebSocketClient got message but incomingEvents is closed', evt);
                return;
            }
            this.incomingEvents.put({t: TransportEventType.connection_lost})
        });
        socket.addEventListener('error', evt => {
            if (this.incomingEvents.isClosed()) {
                // console.log('WebSocketClient got message but incomingEvents is closed', evt);
                return;
            }
            this.incomingEvents.put({t: TransportEventType.connection_lost})
        });
        socket.addEventListener('message', evt => {
            if (this.incomingEvents.isClosed()) {
                // console.log('WebSocketClient got message but incomingEvents is closed', evt);
                return;
            }

            const message = JSON.parse(evt.data);

            if (VerboseLogMessages)
                console.log(`${this.name} got message`, message);

            switch (message.t) {
            case TransportEventType.request:
            case TransportEventType.connection_level_request:
            case TransportEventType.close_request:
            case TransportEventType.response:
                this.incomingEvents.put(message);
                break;

            default:
                console.error('WebSocketClientTransport: unhandled transport message', message);
            }
        });
    }

    send(message: TransportMessage<RequestType>) {

        if (VerboseLogMessages)
            console.log(`${this.name} sending`, message);

        const json = JSON.stringify(message);
        this.socket.send(json);
    }

    close() {
        this.socket.close();
        this.socket = null;
    }
}
