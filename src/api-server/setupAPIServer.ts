import express from 'express'
import swaggerUi from 'swagger-ui-express'
import cors from 'cors';

import { ManagedAPI, Stream, captureException, StreamEvent } from '../rqe'
import { APIPaths, APIPath } from './Paths'
import { c_close, c_done, c_fail, c_item, c_schema } from '../rqe/Stream';

function generateSwaggerDocument() {
    const document = {
        swagger: '2.0',
        info: {
            version: '1.0.0',
            title: 'Mercury PageAPI',
        },
        schemes: [
            "http"
        ],
        basePath: '/api',
        consumes: [
            'application/json',
        ],
        produces: [
            'application/json',
        ],
        paths: {
            // filled in below
        }
    }

    for (const path of APIPaths.each()) {
        document.paths[path.path] = document.paths[path.path] || {};

        document.paths[path.path][path.method] = {
            description: path.description,
            parameters: path.parameters || [],
            responses: {
                200: {
                    description: "OK",
                    schema: {
                        type: 'object',
                        properties: {
                            items: {
                                type: 'array'
                            }
                        }
                    }
                },
                ...path.responses,
            }
        }
    }

    return document;
}

function httpHandlerForApiPath(path: APIPath, server: ManagedAPI) {
    return (req, res) => {
        if (!path.internalRequestName) {
            res.status(500);
            res.contentType('application/json');
            res.end(JSON.stringify({ error: "API path is not implemented" }));
            return;
        }

        const internalRequest = {
            t: path.internalRequestName,

            // include all the URL params
            ...req.params,
        }

        const output = new Stream();
        streamToHttpResponse(output, res);
        server.handleRequest(internalRequest, {}, output);
    }
}

async function streamToHttpResponse(stream: Stream, res) {
    let items = [];
    let schema = null;

    stream.sendTo((evt: StreamEvent) => {
        switch (evt.t) {
            case c_schema:
                schema = evt.schema;
                break;
            case c_item:
                items.push(evt.item);
                break;
            case c_done: {
                res.status(200);
                res.contentType('application/json');

                if (schema && schema.hint === 'value') {
                    res.end(JSON.stringify(items[0]));
                } else {
                    res.end(JSON.stringify({ items }));
                }

                stream.closeByDownstream();
                break;
            }
            case c_fail: {
                let errorCode = 500;

                switch (evt.error.errorType) {
                    case 'not_found':
                        errorCode = 404;
                        break;
                }

                res.status(errorCode);
                res.contentType('application/json');
                res.end(JSON.stringify({ error: evt.error }));
                stream.closeByDownstream();
                break;
            }

            case c_close: {
                console.error('streamToHttpResponse error - not expecting a close event');
                console.error(new Error())
                break;
            }
        }
    });
}

function convertSwaggerPathToExpressPath(swaggerPath: string) {
    // convert /path/{param} to /path/:param
    return swaggerPath.replace(/{([^}]+)}/g, ':$1');
}

export function setupAPIImplementation(api: ManagedAPI) {
    const app = express();

    for (const path of APIPaths.each()) {
        const expressPath = convertSwaggerPathToExpressPath(path.path);
        app.get(expressPath, httpHandlerForApiPath(path, api));
    }

    return app;
}

export function setupAPIServer(api: ManagedAPI) {
    const app = express();

    app.use(cors({ origin: true, credentials: true }));

    function jsonReply(res, status, data) {
        res.status(status);
        res.contentType('application/json');
        res.end(JSON.stringify(data));
    }

    const swaggerDocument = generateSwaggerDocument();
    // console.log(swaggerDocument)

    // Swagger docs
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

    // API implementation
    app.use('/api', setupAPIImplementation(api));

    // Fallthrough: 404
    app.use((req, res, next) => {
        jsonReply(res, 404, {errorMessage:"not found"});
    });

    return app;
}
