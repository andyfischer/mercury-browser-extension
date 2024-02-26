import WebSocket from 'ws';
import HTTP from 'http'
import Fs from 'fs/promises'
import Path from 'path'
import { ClientMessage, ServerMessage, ProtocolDetails } from '../protocol/StationAPI'
import { compileSchema, Stream, c_item, randomHex, StreamEvent, c_delta } from '../rqe'
import { Connection, ManagedAPI } from '../rqe/remote'
import { WebSocketServer } from '../rqe/node/server/WebSocketServer'
import { createNestedLoggerStream } from '../rqe/logger'
import { ActiveTabs, SingleConnectionActiveTabsSchema } from './ActiveTabs'
import { CaptureFrames } from '../domcapture'
import { createTenantTable } from '../rqe/derivedtables/TenantTable';
import { setupAPIServer } from '../api-server/setupAPIServer'
import { ServerMessage as MessageToContentScript } from '../protocol/ContentToBackground'

export const ActiveConnections = compileSchema<Connection<ServerMessage,ClientMessage>>({
    name: 'ActiveConnections',
    funcs: [
        'each',
        'first',
        'listAll',
        'get(connectionId)',
        'delete(connectionId)',
        'deleteAll',
        'listen',
    ]
}).createTable();

function basePath(path) {
    return Path.resolve(__dirname, '../..', path);
}

function findConnectionForTab(tabId: string | number) {
    tabId = parseInt(tabId as string);

    const activeTabInfo = ActiveTabs.get_with_tabId(tabId);
    if (!activeTabInfo) {
        throw new Error("Not found: tab with id: " + tabId);
    }

    // console.log({activeTabInfo})

    const connection: Connection<ServerMessage,ClientMessage> = ActiveConnections.get_with_connectionId(activeTabInfo.connectionId);

    if (!connection) {
        console.error('ListenToLiveStream: connection not found: ' + activeTabInfo.connectionId);
        throw new Error(`Not found: connection with id: ` + activeTabInfo.connectionId)
    }

    return connection;
}

function sendContentScriptRequest(tabId: number, request: MessageToContentScript) {
    const connection = findConnectionForTab(tabId);

    const response = connection.sendRequest({
        t: 'ContentScriptRequest',
        tabId,
        request,
    })

    return response;
}

function createServerAPI() {
    const api = new ManagedAPI({
        name: 'StationServer',
        protocolDetails: ProtocolDetails
    });

    api.handlers.insert({
        name: 'ListLiveTabs',
        callback() {
            return ActiveTabs.listen({getInitialData: true});
        }
    });

    const functionsThatAreSentToTabContentScript = [
        'GetHTMLForTab',
        'GetTabInfo',
        'GetHTMLForElement',
    ];

    for (const func of functionsThatAreSentToTabContentScript) {
        api.handlers.insert({
            name: func,
            callback(params) {
                const { tabId } = params;
                return sendContentScriptRequest(tabId, { t: func as any, ...params });
            }
        });
    }

    api.handlers.insert({
        name: 'VersionCheck',
        async callback({buildId}) {
            if (!buildId)
                throw new Error("missing buildId");

            const extensionBuildReport = await getExtensionBuildReport();
            if (!extensionBuildReport) {
                return;
            }

            if (buildId !== extensionBuildReport.buildId) {
                console.log(`client needs to upgrade, has buildId=${buildId}, latest buildId=${extensionBuildReport.buildId}`);
                return {
                    t: 'needToUpgrade',
                    latestBuildId: process.env.BUILD_ID,
                }
            }
        }
    });

    async function getExtensionBuildReport() {
        try {
            return JSON.parse(await Fs.readFile(basePath('chrome-extension/dist/buildReport.json'), 'utf8'));
        } catch (e) {
            console.warn(`couldn't read extension's build report`, e);
            return null;
        }
    }

    api.handlers.insert({
        name: 'ListenToLiveStream',
        callback({tabId}) {
            tabId = parseInt(tabId);

            const activeTabInfo = ActiveTabs.get_with_tabId(tabId);
            if (!activeTabInfo) {
                throw new Error("not found: " + tabId);
            }

            // console.log({activeTabInfo})

            const connection = ActiveConnections.get_with_connectionId(activeTabInfo.connectionId);

            if (!connection) {
                console.error('ListenToLiveStream: connection not found: ' + activeTabInfo.connectionId);
                throw new Error(`couldn't find connection: ` + activeTabInfo.connectionId)
            }

            // console.log('ListenToLiveStream:', activeTabInfo);

            const recordingSessionId = 'live-' + randomHex(12);

            const out = new Stream();

            (connection.sendRequest({
                t: 'RecordPage',
                tabId: activeTabInfo.tabId,
                recordingSessionId
            })).sendTo((evt) => {
                switch (evt.t) {
                    case c_item:
                        const capture: CaptureFrames = evt.item;
                        for (const frame of capture.frames)
                            out.put(frame);
                }
            });

            return out;
        }
    });


    return api;
}

export function startHttpServer({port}) {
    const httpServer = HTTP.createServer();
    const wsServer = new WebSocket.Server({
        server: httpServer
    });

    const log = createNestedLoggerStream('WebSocketServer');

    const serverAPI = createServerAPI();

    const wsServerConn = new WebSocketServer({
        wsServer,
        api: serverAPI,
        activeConnections: ActiveConnections,
        logStream: log,
    });

    ActiveConnections.listen({deletionIndexName:'connectionId'}).sendTo(evt => {
        switch (evt.t) {
            case c_item: {
                // Start listening to a new connection
                const connection = evt.item;
                const { connectionId } = connection;
                console.log('New socket connection: ' + connection.connectionId);

                // Listen to tables
                const localActiveTabs = createTenantTable({
                    schema: SingleConnectionActiveTabsSchema.get(),
                    tenantAttr: 'connectionId', 
                    tenantAttrValue: connectionId,
                    baseTable: ActiveTabs,
                });

                const upstreamActiveTabs = connection.getSyncClient().addListeningStream('ActiveTabs', {
                    deletionIndexName: 'tabId',
                });
                localActiveTabs.listenToStream(upstreamActiveTabs);

                break;
            }
            case c_delta: {
                ActiveTabs.delete_with_connectionId(evt.params[0]);
                console.log('socket connection closed: ' + evt.params[0]);
                break;
            }
        }
    });

    httpServer.on('request', setupAPIServer(serverAPI));
    httpServer.listen(port);

    console.log('API server is now listening on port: ' + port);
    console.log('Links:')
    console.log('  Swagger: http://localhost:' + port + '/docs');
}

export function getBrowserConnection() {
    const connection = ActiveConnections.first();
    if (!connection)
        throw new Error("connection not found");

    // todo: assert that this is actually a browser connection
    return connection;
}
