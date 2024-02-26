
import { Stream, c_close, c_fail } from '../Stream'
import { splitJson } from '../utils/splitJson'
import { ActiveStreamSet, RequestClient } from '../remote'
import { captureException } from '../Errors'

const VerboseLogHttpClient = false;

interface QueuedMessage<RequestType> {
    output: Stream
    message: RequestMessage<RequestType>
}

export interface RequestMessage<RequestType> {
    requestId: number
    request: RequestType
}

export interface PostedRequest<RequestType> {
    messages: RequestMessage<RequestType>[]
}

export interface PostResponse<RequestType> {
    requests: RequestMessage<RequestType>[]
}

interface Config {
    fetch(fetchOptions: { method: 'POST', headers: any, body: string}): any
}

class JsonMessageDecoder {
    buffer: string = null;

    *receive(str: string) {
        if (this.buffer) {
            str = this.buffer + str;
        }

        for (const result of splitJson(str)) {
            if (result.t === 'unfinished') {
                this.buffer = result.remaining;
                return;
            }

            if (result.t === 'item') {
                yield JSON.parse(result.str);
            }
        }
    }
}

export class HttpClient<RequestType> implements RequestClient<RequestType> {
    queuedMessages: QueuedMessage<RequestType>[] = []
    streams = new ActiveStreamSet()
    flushTimer = null;
    flushDelayMs = 50;
    nextRequestId = 1;
    config: Config

    constructor(config: Config) {
        this.config = config;
    }

    close() {
        // implement RequestClient
    }

    _takeQueuedMessages() {
        const queue = this.queuedMessages;
        this.queuedMessages = [];
        return queue;
    }

    flushPendingRequests() {
        const outgoingMessages = this._takeQueuedMessages();

        const postRequestData: PostedRequest<RequestType> = {
            messages: outgoingMessages.map(queued => queued.message)
        }

        for (const message of outgoingMessages) {
            this.streams.addStream(message.message.requestId, message.output);

            if (VerboseLogHttpClient)
                console.log(`HttpClient sending request #${message.message.requestId}`, message.message.request);
        }

        const jsonMessageDecoder = new JsonMessageDecoder();

        (async () => {

            let fetchResponse;

            try {
                fetchResponse = await this.config.fetch({
                    method: 'POST',
                    headers: {
                        'content-type': 'text/plain',
                    },
                    body: JSON.stringify(postRequestData),
                });
            } catch (e) {
                // Protocol error when trying to call fetch(). Kill all requests with an error.
                const error = {
                    ...captureException(e),
                    errorLayer: 'http_client',
                };

                if (VerboseLogHttpClient)
                    console.log('HttpClient got a fetch exception, closing all with error', { e });

                for (const message of outgoingMessages) {
                    this.streams.receiveMessage(message.message.requestId, { t: c_fail, error });
                    this.streams.receiveMessage(message.message.requestId, { t: c_close });
                }

                return;
            }

            // Handle a failure status code
            if (fetchResponse.status !== 200) {
                const error = {
                    errorType: 'http_error_status',
                    errorLayer: 'http_client',
                    message: `HTTP request had failure status code (${fetchResponse.status})`,
                }

                if (VerboseLogHttpClient)
                    console.log('HttpClient got an error code, closing all with error');

                for (const message of outgoingMessages) {
                    this.streams.receiveMessage(message.message.requestId, { t: c_fail, error });
                    this.streams.receiveMessage(message.message.requestId, { t: c_close });
                }

                return;
            }

            const receiveTextChunk = (str: string) => {
                if (VerboseLogHttpClient)
                    console.log('HttpClient receiveTextChunk', str)

                if (!str)
                    return;

                try {
                    for (const data of jsonMessageDecoder.receive(str)) {
                        if (VerboseLogHttpClient)
                            console.log(`HttpClient received message for request #${data.requestId}`, data.evt);

                        this.streams.receiveMessage(data.requestId, data.evt);
                    }
                } catch (err) {
                    console.error('http client: uncaught error while parsing received data', { err, str });
                }
            }

            const onResponseStreamDone = () => {
                if (VerboseLogHttpClient)
                    console.log('HttpClient onResponseStreamDone')

                for (const message of outgoingMessages) {
                    if (this.streams.isStreamOpen(message.message.requestId)) {
                        if (VerboseLogHttpClient)
                            console.log(`HttpClient injecting a close stream for request #${message.message.requestId}`);
                        this.streams.receiveMessage(message.message.requestId, { t: c_close });
                    }
                }
            }

            if (fetchResponse.body.getReader) {
                // Browser standard support for streaming fetch.
                const reader = fetchResponse.body.getReader();
                const decoder = new TextDecoder();

                while (true) {
                  const { value, done } = await reader.read();
                  if (done) {
                      onResponseStreamDone();
                      return;
                  }

                  const text = decoder.decode(value);
                  receiveTextChunk(text);
                }
            } else {
                // Node.js polyfill for streaming fetch.
                fetchResponse.body.on('readable', () => {
                    while (true) {
                        const chunk = fetchResponse.body.read();
                        if (!chunk) {
                            onResponseStreamDone();
                            return;
                        }
                        receiveTextChunk(chunk.toString());
                    }
                });
            }
        })();
    }

    sendRequest(request: RequestType, output: Stream) {
        const requestId = this.nextRequestId;
        this.nextRequestId++;

        this.queuedMessages.push({ message: { requestId, request }, output });

        if (!this.flushTimer) {
            this.flushTimer = setTimeout((() => {
                clearTimeout(this.flushTimer);
                this.flushTimer = null;

                this.flushPendingRequests();
            }), this.flushDelayMs);
        }
        return output;
    }
}

