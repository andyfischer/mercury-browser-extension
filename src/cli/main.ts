
import 'source-map-support/register'
import { startHttpServer } from '../station/StationServer'
import { runCommandLineProcess } from '../rqe/node'
import { ApiPort } from '../Config'
import './Commands'
import '../station/BrowserTest'
import { installDebugMonitorOnWindow } from '../rqe/debug'

async function main() {
    installDebugMonitorOnWindow();

    let enableRepl = true;

    startHttpServer({port: ApiPort});

    runCommandLineProcess({
        startRepl: enableRepl ? {
            prompt: 'mercury-basestation~ ',
        } : false,
        terminal: {
            title: 'mercury'
        }
    });
}

main()
.catch(console.error);
