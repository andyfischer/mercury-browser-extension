
import { Stream, StreamEvent, c_close } from '../../Stream'
import { PostedRequest, RequestMessage, } from '../../remote/HttpClient'
import type { ClientRequest as HttpRequest, ServerResponse as HttpResponse } from 'http'

const VerboseLogHttpServer = false;

interface ResponseEvent {
    requestId: number
    evt: StreamEvent
}

interface HandlePostParams<RequestType> {
    requestBody: PostedRequest<RequestType>
    originalHttpRequest: HttpRequest
    handleOneMessage: (req: RequestType, originalHttpRequest: HttpRequest, output: Stream) => void
    sendData: (event: ResponseEvent) => void
    closeResponse: () => void
}

export interface HandlerSetupOptions<RequestType> {
    handleOneMessage: (req: RequestType, originalHttpRequest: HttpRequest, output: Stream) => void
}

export function handlePostedRequest<RequestType>({ requestBody, originalHttpRequest, handleOneMessage, sendData, closeResponse }: HandlePostParams<RequestType>) {
    const openRequests = new Map();

    // afterStreamDone - Called once a single request stream is done.
    function afterStreamDone(requestId) {
        if (VerboseLogHttpServer)
            console.log('HTTPServer afterStreamDone on request: ' + requestId);

        openRequests.delete(requestId);
        if (openRequests.size === 0) {
            if (VerboseLogHttpServer)
                console.log('HTTPServer all requests done, closing');
            closeResponse();
        }
    }

    // Set up the openRequests map before handling anything (otherwise we risk a 
    // premature exit).
    for (const message of requestBody.messages) {
        const requestId = message.requestId;
        openRequests.set(requestId, true);
    }

    // Handle all incoming requests
    for (const message of requestBody.messages) {
        const stream = new Stream();
        const requestId = message.requestId;

        stream.sendTo({
            receive(evt) {
                sendData({
                    requestId,
                    evt,
                });

                if (evt.t === c_close)
                    afterStreamDone(requestId);
            }
        });

        if (VerboseLogHttpServer)
            console.log('HTTPServer starting handleOneMessage for request: ' + requestId, message.request);

        handleOneMessage(message.request, originalHttpRequest, stream);
    }
}

/*
 * getStreamingHttpHandler
 *
 * Return an HTTP handler function with inputs: (HttpRequest,HttpResponse)
 *
 * The handler will break apart the incoming requests, call handleOneMessage for each request,
 * and stream the results back as they are completed.
 */

export function getStreamingHttpHandler<RequestType>({ handleOneMessage }: HandlerSetupOptions<RequestType>) {
    return (httpReq: HttpRequest, httpRes: HttpResponse) => {
        function startHandling(bodyStr: string) {

            let body: PostedRequest<RequestType> = null;

            try {
                body = JSON.parse(bodyStr);
            } catch (e) {
                httpRes.writeHead(400);
                httpRes.end("expected body to be parsable as JSON");
                return;
            }

            if (!body.messages) {
                httpRes.writeHead(400);
                httpRes.end("expected JSON body to contain { messages }");
                return;
            }

            httpRes.writeHead(200, {
                'Content-Type': 'application/json',
                'Transfer-Encoding': 'chunked',
            });

            handlePostedRequest({
                requestBody: body,
                originalHttpRequest: httpReq,
                handleOneMessage,
                sendData: (responseEvent) => {
                    httpRes.write(JSON.stringify(responseEvent));
                },
                closeResponse: () => {
                    httpRes.end();
                }
            });
        }

        // Read incoming data into one buffer
        //
        // Future: Try parsing the partial JSON buffer and start handling any individual messages as soon
        // as they are complete.

        let body = '';
        httpReq.on('data', chunk => {
            body += chunk;
        });
        httpReq.on('end', chunk => {
            startHandling(body);
        });
    }
}
