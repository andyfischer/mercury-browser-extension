
import { ClientMessage, ServerMessage } from '../protocol/StationAPI'
import { ServerMessage as RequestToContentScript } from '../protocol/ContentToBackground'
import { Connection, WebSocketClient, MessageBuffer, TableSyncServer, ManagedAPI } from '../rqe/remote'
import { compileSchema } from '../rqe'
import { ActiveTabs, NamedTabs, TabsWaitingForConnection } from './ActiveTabs'
import { Stream } from '../rqe'
import { PortConnections } from './PortConnections'

let _client: Connection<ClientMessage,ServerMessage>;
let _keepaliveTimer;

function createStationClient() {
    const api = new ManagedAPI({
        name: 'StationClient',
    });

    api.handlers.insert({
        name: 'RecordPage',
        callback({tabId, ...req}) {
            return contentScriptRequest(tabId, req as any);
        }
    });

    api.handlers.insert({
        name: 'ContentScriptRequest',
        callback(req) {
            const tabId = parseInt(req.tabId as any);

            const tab = ActiveTabs.get_with_tabId(tabId);

            if (!tab) {
                console.log('all tabs: ', ActiveTabs.listAll());
                throw new Error("tab not found: " + tabId);
            }

            const connection = PortConnections.get_with_connectionId(tab.connectionId);

            if (!connection)
                throw new Error("connection not found");

            const output = new Stream();
            //connection.sendRequest(req.request, output);
            connection.sendRequest({
                hasFunctionAttempt: true,
                functionSendAttempt() { console.log('trying to send afunction') },
                ...req.request}, output);
            return output;
        }
    });

    api.handlers.insert({
        name: 'CreateTab',
        async callback(req) {
            const { url, name } = req;
            const result = await chrome.tabs.create({ url });
            const tabId = result.id;

            if (name) {
                NamedTabs.insert({ name, tabId });
            }

            return {
                name,
                tabId,
                windowId: result.windowId,
            }
        }
    });

    api.handlers.insert({
        name: 'RemoveTab',
        async callback({tabId}) {
            const result = await chrome.tabs.remove(tabId);
            return result;
        }
    });

    api.handlers.insert({
        name: 'FindTab',
        callback(req) {
            const { name } = req;

            if (!name)
                return;

            const { tabId } = NamedTabs.get_by_name(name);
            return { tabId };
        }
    });

    api.handlers.insert({
        name: 'UpdateTab',
        async callback(req) {
            const { tabId, update } = req;
            return await chrome.tabs.update(tabId, update);
        }
    });

    return api;
}

function contentScriptRequest(tabId: string | number, req: RequestToContentScript) {
    tabId = parseInt(tabId as any);

    const tab = ActiveTabs.get_with_tabId(tabId);

    if (!tab) {
        if (!TabsWaitingForConnection.get_with_tabId(tabId)) {
            TabsWaitingForConnection.insert({
                tabId,
                buffer: new MessageBuffer()
            });
        }

        const output = new Stream();
        TabsWaitingForConnection.get_with_tabId(tabId).buffer.push(req, output);
        return output;
    }

    const connection = PortConnections.get_with_connectionId(tab.connectionId);

    if (!connection)
        throw new Error("connection not found");

    return connection.sendRequest(req);
}

function keepaliveTick() {
    if (_client.status === 'give_up')
        return;

    _client.sendRequest({ t: 'Ping' });

    clearTimeout(_keepaliveTimer);
    _keepaliveTimer = setTimeout(keepaliveTick, 5000);
}

export function startStationClient({hostUrl}) {
    _client = new Connection<ClientMessage,ServerMessage>({
        name: 'BkndStationClient',
        connect() {
            const socket = new WebSocket(hostUrl);
            return new WebSocketClient(socket);
        },
        api: createStationClient(),
        onEstablish(connection) {
            console.log('Established connection to base station');
            keepaliveTick();

            (async () => {
                for await (const resp of connection.sendRequest({ t: 'VersionCheck', buildId: process.env.BUILD_ID })) {
                    switch (resp.t) {
                        case 'needToUpgrade':
                            const selfInfo = await chrome.management.getSelf()
                            if (selfInfo.installType === 'development') {
                                console.log('Server says we need to upgrade to: ', resp.latestBuildId);
                                chrome.runtime.reload();
                            }
                            break;
                        default:
                            console.warn("VersionCheck unexpected response", resp);
                    }
                }
            })();
        },
        onClose() {
            console.log('Lost connection to base station');
        },
        reconnectSchedule: {
            delayMsForAttempt: function (attempt: number) {
                switch (attempt) {
                    case 1: return 1000;
                    case 2: return 2000;
                    case 3: case 4: return 5000;
                    case 5: case 6: case 7: case 8: return 10000;
                    case 9: case 10: return 30000;
                    default: return 'give_up';
                }
            }
        }
    });

    _client.serveData(ActiveTabs);

    console.log('starting WS client to connect to: ' + hostUrl);
}

export function getStationClient() {
    if (!_client)
        throw new Error('getStationClient - not set up yet');

    return _client;
}
