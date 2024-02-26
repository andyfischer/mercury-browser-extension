
import type { Table } from '../rqe'

function trySelector(selector: string) {
    const found = document.querySelector(selector);
    return found;
}

function assertSelector(selector: string) {
    const found = document.querySelector(selector);
    if (!found)
        throw new Error("element not found: " + selector);
    return found;
}

function click(selector: string) {
    const el = assertSelector(selector) as HTMLElement;
    el.click();
}

function isVisible(selector: string) {
    const el = trySelector(selector) as HTMLElement;
    if (!el)
        return false;

    if (el.offsetParent === null)
        return false;

    return true;
}

export function setupHandlers(handlers) {
    handlers.insert({ name: 'Automation/Click', callback: click });
    handlers.insert({ name: 'Automation/IsVisible', callback: isVisible });
}
