
import { Stream, StreamEvent, c_close } from '../Stream'
import { StreamProtocolValidator } from '../streamUtil/StreamProtocolValidator'
import { recordUnhandledException } from '../Errors'

const VerboseLog = false;

/*
 ActiveStreamSet

 An ActiveStreamSet manages a set of open streams, each with a unique ID. The caller
 can post events to a stream directly using an ID.

 This is useful when sending data across a remote protocol like a socket.

 This class handles a bunch of common responsibilities:

  - Streams are deleted when done
  - Errors are caught (including the BackpressureStop exception)
  - Helper functions can bulk close all streams. (useful when the socket is closed)
  - Stream events are validated using a StreamProtocolValidator.
  - Closed streams are remembered, so that we can ignore messages for recently closed streams.

*/

type StreamId = number | string

export class ActiveStreamSet {
    streams = new Map<StreamId, Stream>();
    validators = new Map<StreamId, StreamProtocolValidator>();
    closedStreamIds = new Set<StreamId>()
    
    startStream(id: StreamId) {
        if (this.streams.has(id))
            throw new Error("ActiveStreamSet protocol error: already have stream with id: " + id);

        if (VerboseLog)
            console.log('ActiveStreamSet - startStream with id: ' + JSON.stringify(id));

        let stream = new Stream();

        this.streams.set(id, stream);
        this.validators.set(id, new StreamProtocolValidator(`stream validator for socket id=${id}`));
        return stream;
    }

    addStream(id: StreamId, stream: Stream) {
        if (!stream) {
            throw new Error("ActiveStreamSet usage error: missing stream");
        }

        if (this.streams.has(id))
            throw new Error("ActiveStreamSet protocol error: already have stream with id: " + id);
        
        if (VerboseLog)
            console.log('ActiveStreamSet - addStream with id: ' + id);

        this.streams.set(id, stream);
        this.validators.set(id, new StreamProtocolValidator(`stream validator for socket id=${id}`));
        return stream;
    }

    isStreamOpen(id: StreamId) {
        return this.streams.has(id);
    }

    receiveMessage(id: StreamId, msg: StreamEvent) {
        if (VerboseLog)
            console.log('ActiveStreamSet - receiveMessage on stream id: ' + id, msg);

        const stream = this.streams.get(id);

        if (!stream) {
            if (this.closedStreamIds.has(id))
                return;

            console.error("ActiveStreamSet protocol error: no stream with id: " + id, msg);
            throw new Error("ActiveStreamSet protocol error: no stream with id: " + id);
        }

        this.validators.get(id).check(msg);

        if (msg.t === c_close) {
            if (VerboseLog)
                console.log('ActiveStreamSet - close event on stream id: ' + id);
            this.streams.delete(id);
            this.validators.delete(id);
            this.closedStreamIds.add(id);
        }

        try {
            stream.receive(msg);
        } catch (e) {
            if (e.backpressure_stop || e.is_backpressure_stop) {
                if (VerboseLog)
                    console.log('ActiveStreamSet - backpressure closed stream id: ' + id);
                this.streams.delete(id);
                this.validators.delete(id);
                this.closedStreamIds.add(id);
                return;
            }

            recordUnhandledException(e);
        }
    }

    closeStream(id: StreamId) {
        const stream = this.streams.get(id);

        if (!stream)
            return;

        this.streams.delete(id);
        this.validators.delete(id);
        this.closedStreamIds.add(id);

        stream.closeByDownstream();
    }

    closeAll() {
        for (const stream of this.streams.values()) {
            try {
                stream.closeByDownstream();
            } catch (e) {
                if (e.backpressure_stop || e._is_backpressure_stop)
                    continue;

                recordUnhandledException(e);
            }
        }

        for (const id of this.streams.keys())
            this.closedStreamIds.add(id);

        this.streams.clear();
        this.validators.clear();
    }
}


