
export interface Location {
    href: string
    protocol: string
    hostname: string
}

export function getWindowLocation(): Location {
    return {
        href: window.location.href,
        protocol: window.location.protocol,
        hostname: window.location.hostname,
    };
}
