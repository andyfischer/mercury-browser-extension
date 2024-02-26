
import { PageObserver } from '../domcapture/PageObserver'
import { entirePage } from '../domcapture/TargetSpec'
import { isInsideIframe } from '../domcapture/domUtils'
import { ClientMessage, ServerMessage, ProtocolDetails } from '../protocol/ContentToBackground'
import { RequestClient, MessagePortTransport, Connection, ManagedAPI } from '../rqe/remote'
import { Stream, compileSchema, callbackToStream } from '../rqe'
import { ProjectShortName } from '../Config'
import { ClientScriptHelper } from '../automation/ClientScriptHelper'
import { setupHandlers as clientScriptSetupHandlers } from '../automation/ClientScriptAPI'
import { installDebugMonitorOnWindow } from '../rqe/debug'

let _backgroundPort: Connection<ClientMessage>

function createContentPortAPI() {
    const api = new ManagedAPI({
        name: 'ContentPort',
        protocolDetails: ProtocolDetails,
    });

    api.handlers.insert({
        name: 'RecordPage',
        callback({ recordingSessionId }) {
            console.log('start recording: ' + recordingSessionId);
            const output = new Stream();

            const pageObserver = new PageObserver({
                targetSpec: entirePage(),
                onCapture: evt => {
                    if (output.isClosed() && pageObserver.isRunning) {
                        console.log('finished recording: ' + recordingSessionId);
                        pageObserver.stop();
                        return;
                    }

                    output.put(evt);
                },
                useFlushDelay: true,
                recordingSessionId,
            });

            pageObserver.start();

            return output;
        }
    });

    api.handlers.insert({
        name: 'RunFunction',
        callback({ functionStr, params, ...other }) {
            console.log('RunFunction request', other);
            const helper = new ClientScriptHelper();
            helper.runCallback(functionStr, params);
            return helper.output;
        }
    });

    api.handlers.insert({
        name: 'GetHTMLForTab',
        callback() {
            const html = document.documentElement.outerHTML;
            return { html };
        }
    });

    api.handlers.insert({
        name: 'GetTabInfo',
        callback() {
            return { 
                url: window.location.href,
                title: document.title,
            }
        }
    });

    api.handlers.insert({
        name: 'GetHTMLForElement',
        callback({selector}) {
            const el = document.querySelector(selector);
            if (!el) {
                throw new Error("Not found: element with selector: " + selector);
            }

            return { 
                html: el.outerHTML,
            }
        }
    });


    clientScriptSetupHandlers(api.handlers);

    return api;
}

function wrapConsoleLog() {
    let originalConsoleLog = console.log;
    console.log = function(...args) {
        originalConsoleLog.apply(this, [`[${ProjectShortName} bkgnd ${(new Date()).toISOString()}]`].concat(args));
    }
}

function sendRequest(req: ClientMessage) {
    // console.log('sendRequest', req)
    const output = new Stream();
    _backgroundPort.sendRequest(req, output);
    return output;
}

async function startup() {
    wrapConsoleLog();
    installDebugMonitorOnWindow();

    _backgroundPort = new Connection({
        name: 'MessagePortToBackground',
        api: createContentPortAPI(),
        protocolDetails: ProtocolDetails,
        connect: () => new MessagePortTransport(chrome.runtime.connect()),
        enableReconnection: false,
    });

    _backgroundPort.getServedData('pageInfo').set({
        isIframe: isInsideIframe(),
        href: window.location.href,
    });

    let msg = 'mercury startup';
    if (isInsideIframe()) {
        msg += ` (inside iframe ${window.location.href})`;
    } else {
        msg += ` (main)`;
    }
    msg += ` (version: ${process.env.BUILD_ID})`;
    console.log(msg);
}

startup();

