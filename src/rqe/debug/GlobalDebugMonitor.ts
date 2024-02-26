import { Table } from "../table";
import { MultiMap } from "../utils";

let _monitor: GlobalDebugMonitor = null;
let _hasInstalledOnWindow = false;
let _hasWarnedForCount = false;
let _monitorDisabledAtRuntime = false;

const WarnAtCount = 200;

class GlobalDebugMonitor {
    tables: Table[] = []
    tablesByName = new MultiMap<string,Table>()

    addTable(table: Table) {
        this.tables.push(table)
        this.tablesByName.add(table.schema.name, table);

        if (this.tables.length > WarnAtCount && !_hasWarnedForCount) {
            console.warn(`RQE GlobalDebugMonitor has more than ${WarnAtCount} tables - possible memory leak`);
            _hasWarnedForCount = true;
        }
    }
}

function getGlobalMonitor() {
    if (!_monitor)
        _monitor = new GlobalDebugMonitor()
    return _monitor;
}

export function addCreatedTable(table: Table) {
    if (_monitorDisabledAtRuntime)
        return;

    getGlobalMonitor().addTable(table);
}

export function disableDebugMonitor() {
    _monitor = null;
    _monitorDisabledAtRuntime = true;
}

export function installDebugMonitorOnWindow() {
    if (_monitorDisabledAtRuntime)
        return;

    const monitor = getGlobalMonitor();
    if (_hasInstalledOnWindow)
        return;

    let _window: any;

    if (typeof window !== 'undefined') {
        _window = window;
    }

    else if (typeof global !== 'undefined') {
        _window = global;
    }

    else if (typeof globalThis !== 'undefined') { 
        _window = globalThis;
    }

    if (!_window) {
        console.warn("RQE installOnWindow failed - could not find a global object");
        return;
    }

    if (_window.rqe) {
        console.warn("RQE installOnWindow failed - already have a global monitor");
        return;
    }

    _window.rqe = monitor;
    _hasInstalledOnWindow = true;
}
