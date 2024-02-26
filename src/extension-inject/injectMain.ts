

const projectName = 'autoext'

function print(...args) {
    console.log.apply(null, [
        `%c${projectName}%c`,
        'border-radius:3px; padding: 2px; background: rgba(75, 132, 243, 1); color: white',
        'background: inherit; color: inherit',
    ].concat(args));
}

// Insert hooks to watch for insertRule & deleteRule (CSSOM)
const injectHook = Symbol('autoext_inject_hook');

if (CSSStyleSheet.prototype
    && CSSStyleSheet.prototype.insertRule
    && !CSSStyleSheet.prototype.insertRule[injectHook]) {

    function cssInsertRule() {
        // todo: debouce
    }
}

export {}

// print('inject script started successfully');

