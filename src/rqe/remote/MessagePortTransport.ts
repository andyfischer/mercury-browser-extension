
import { Port } from '../utils/Port'
import { Stream } from '../Stream'
import { TransportMessage, TransportConnection, TransportEventType } from './TransportTypes'

const VerboseLog = false;

export class MessagePortTransport<RequestType, ResponseType> implements TransportConnection<RequestType>{
    port: Port
    incomingEvents: Stream<TransportMessage<RequestType>> = new Stream()
    onClose?: () => void
    hasRecordedSender = false

    constructor(port: Port) {
        this.port = port;

        const onMessage = (message, connection?) => {

            if (VerboseLog)
                console.log('Message port received: ', message);

            if (connection?.sender && !this.hasRecordedSender) {
                this.incomingEvents.put({
                    t: TransportEventType.set_connection_metadata,
                    sender: connection.sender
                });
                this.hasRecordedSender = true;
            }

            this.onMessage(message);
        }

        port.onMessage.addListener(onMessage);
        this.onClose = () => {
            port.onMessage.removeListener(onMessage);
            this.onClose = null;
        }

        this.incomingEvents.put({t: TransportEventType.connection_established });

        port.onDisconnect.addListener(() => {
            if (VerboseLog)
                console.log('Message port disconnected');

            // console.log('message port disconnect', port)
            this.incomingEvents.put({t: TransportEventType.connection_lost });
        });
    }

    onMessage(message: TransportMessage<RequestType>) {
        switch (message.t) {
            case TransportEventType.request:
            case TransportEventType.connection_level_request:
            case TransportEventType.close_request:
            case TransportEventType.response:
                this.incomingEvents.put(message);
                break;

        default:
            console.warn('MessagePortTransport unhandled: ', message);
        }
    }

    send(message: TransportMessage<RequestType>) {
        try {

            if (VerboseLog)
                console.log('Message port sending:', message);

            this.port.postMessage(message);
        } catch (e) {
            const expected = e.message.indexOf("Extension context invalidated") !== -1;
            if (!expected)
                console.error('MessagePortTransport unexpected error', e);

            this.incomingEvents.put({t: TransportEventType.connection_lost});
        }
    }

    close() {
        if (this.onClose)
            this.onClose();
    }
}
