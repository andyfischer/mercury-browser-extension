
import { Connection, MessagePortTransport } from '../rqe/remote'
import { PortConnections } from './PortConnections'
import { createPortServerAPI } from './PortServer'
import { c_item } from '../rqe'
import { startStationClient } from './StationClient'
import { ProjectShortName, ApiPort, LocalWebSocket } from '../Config'
import { ServerMessage, ClientMessage } from '../protocol/ContentToBackground'
import { ActiveTabs, TabsWaitingForConnection } from './ActiveTabs'
import { installDebugMonitorOnWindow } from '../rqe/debug'

function wrapConsoleLog() {
    let originalConsoleLog = console.log;
    console.log = function(...args) {
        originalConsoleLog.apply(this, [`[${ProjectShortName} bkgnd ${(new Date()).toISOString()}]`].concat(args));
    }
}

async function manifestCheck() {
    // Load the local file
    const url = chrome.runtime.getURL("dist/buildReport.json");
    const buildReport = await fetch(url).then(response => response.json());
    if (buildReport.buildId !== process.env.BUILD_ID) {
        console.log("Need to update to latest build: " + buildReport.buildId);
        chrome.runtime.reload();
    }
}

function startup() {
    wrapConsoleLog();
    installDebugMonitorOnWindow();

    chrome.runtime.onConnect.addListener(port => {

        manifestCheck();
        
        const connection = new Connection<ServerMessage,ClientMessage>({
            name: 'ExtensionBackgroundPortServer',
            api: createPortServerAPI(),
            connect() { return new MessagePortTransport(port) },
            enableReconnection: false,
            onClose() {
                PortConnections.delete_with_connectionId(connection.connectionId);
                ActiveTabs.delete_with_connectionId(connection.connectionId);
            }
        });

        connection.getSyncClient().addListeningStream('pageInfo')
        .sendTo(evt => {
            switch (evt.t) {
            case c_item: {
                const pageInfo = evt.item;

                if (!ActiveTabs.has_connectionId(connection.connectionId)) {

                    const tabId = connection?.sender?.tab?.id;

                    if (!tabId) {
                        console.error('missing .sender.tab.id in connection (handling pageInfo)', { connection });
                        return;
                    }

                    ActiveTabs.insert({
                        connectionId: connection.connectionId,
                        tabId,
                        tabUrl: connection.sender.tab.url,
                        windowId: connection.sender.tab.windowId,
                        origin: connection.sender.origin,
                        frameId: connection.sender.frameId,
                    });

                    // console.log(`updated pageInfo (connection ${connection.connectionId})`, pageInfo)

                    const waiting = TabsWaitingForConnection.get_with_tabId(tabId);
                    if (waiting) {
                        for (const { req, output } of waiting.buffer.takeAll()) {
                            connection.sendRequest(req, output);
                        }
                        TabsWaitingForConnection.delete_with_tabId(tabId);
                    }
                }
                break;
            }
            }
        })

        PortConnections.insert(connection);
    });

    /*
    self.addEventListener('fetch', (event) => {
        console.log('fetch event', event);
    })
    */

    /*
    chrome.webRequest.onResponseStarted.addListener(event => {
            console.log('onResponseStarted', event)
    }, {urls: ["<all_urls>"]}, ["responseHeaders","extraHeaders"]);

    chrome.webRequest.onCompleted.addListener(event => {
            console.log('onCompleted', event)
    }, {urls: ["<all_urls>"]}, ["responseHeaders","extraHeaders"]);
    */

    startStationClient({ hostUrl: LocalWebSocket });

    console.log(`started up (version: ${process.env.BUILD_ID})`);
}

startup();
