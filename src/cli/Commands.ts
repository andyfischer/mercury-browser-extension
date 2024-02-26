import { buildExtension } from "../build/buildExtension";
import { exposeFunc } from "../rqe";
import { ActiveConnections } from "../station/StationServer";

exposeFunc('update-extension', async () => {
    await buildExtension();
    
    // Disconnect all connections to trigger the extension to reload.
    // TODO: only close connections from extensions.
    for (const connection of ActiveConnections.listAll()) {
        connection.close();
    }
});