/**
 * Where an address sits in the browser's address space, which decides whether the Foundry page
 * is allowed to talk to the table at all.
 *
 * Browsers gate "local network access": a page may only make a request into a more private
 * address space than its own from a secure context, and then only with the user's permission.
 * A Foundry server reached over plain http:// at a public address is not a secure context, so
 * its requests to a table on the LAN are refused before they are ever sent. The browser reports
 * that as a CORS error, which it is not -- no response header from the table server can lift
 * it, and the table server's CORS policy is irrelevant to it.
 *
 * See https://developer.chrome.com/blog/local-network-access.
 */

export const ADDRESS_SPACE_PUBLIC = "public";
export const ADDRESS_SPACE_LOCAL = "local";
export const ADDRESS_SPACE_LOOPBACK = "loopback";

/**
 * A name which could resolve either way. The browser classifies by resolved address and we can
 * only read the name, so anything we cannot place with certainty lands here and is never used
 * to claim a request was blocked.
 */
export const ADDRESS_SPACE_UNKNOWN = "unknown";

/** Most private last; a request may travel down this list but not up it. */
const PRIVACY_ORDER = [ADDRESS_SPACE_PUBLIC, ADDRESS_SPACE_LOCAL, ADDRESS_SPACE_LOOPBACK];

/**
 * Classifies a hostname the way the browser does, as far as the name alone allows. Only
 * literal addresses and names which can only mean one thing are placed; an ordinary domain
 * name is left unknown, because it may well resolve to an address on the local network.
 */
export function classifyAddressSpace(hostname) {
    if (typeof hostname !== "string" || !hostname) {
        return ADDRESS_SPACE_PUBLIC;
    }
    // URL#hostname brackets IPv6 literals; a fully qualified name may have a trailing dot.
    const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");

    if (host === "localhost" || host.endsWith(".localhost") || host === "::1") {
        return ADDRESS_SPACE_LOOPBACK;
    }
    // RFC 6762 multicast DNS names are always on the local link.
    if (host.endsWith(".local")) {
        return ADDRESS_SPACE_LOCAL;
    }

    const octets = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (octets) {
        const [a, b] = octets.slice(1, 3).map(Number);
        if (octets.slice(1).map(Number).some(n => n > 255)) {
            return ADDRESS_SPACE_PUBLIC;
        }
        if (a === 127) return ADDRESS_SPACE_LOOPBACK;
        if (a === 10) return ADDRESS_SPACE_LOCAL;
        if (a === 172 && b >= 16 && b <= 31) return ADDRESS_SPACE_LOCAL;
        if (a === 192 && b === 168) return ADDRESS_SPACE_LOCAL;
        if (a === 169 && b === 254) return ADDRESS_SPACE_LOCAL;
        // RFC 6598 shared address space, which is also the range Tailscale hands out.
        if (a === 100 && b >= 64 && b <= 127) return ADDRESS_SPACE_LOCAL;
        return ADDRESS_SPACE_PUBLIC;
    }

    if (/^f[cd][0-9a-f]{2}:/.test(host)) return ADDRESS_SPACE_LOCAL;   // fc00::/7, unique local
    if (/^fe[89ab][0-9a-f]:/.test(host)) return ADDRESS_SPACE_LOCAL;   // fe80::/10, link local

    // A single label with no dot is a name only the local network can resolve -- a router's
    // DNS, mDNS or a tailnet's MagicDNS -- so the address behind it is a local one.
    if (!host.includes(".")) {
        return ADDRESS_SPACE_LOCAL;
    }

    // An ordinary domain name. It usually means the public internet, but plenty of people
    // point one at a machine on their own LAN, and guessing wrong here would mean telling a
    // working setup that it is broken.
    return ADDRESS_SPACE_UNKNOWN;
}

/**
 * Whether reaching `target` from `source` certainly means crossing into a more private
 * network. False whenever either end is a name we could not place.
 */
export function isMorePrivate(target, source) {
    const to = PRIVACY_ORDER.indexOf(target);
    const from = PRIVACY_ORDER.indexOf(source);
    return to >= 0 && from >= 0 && to > from;
}

function currentContext() {
    return {
        isSecureContext: globalThis.isSecureContext !== false,
        hostname: globalThis.location?.hostname ?? ""
    };
}

/**
 * Explains why the browser refused to send a request, when it is certain that it did. Returns
 * null whenever the failure could just as well be an unplugged table, so that the module never
 * blames the browser for an ordinary outage.
 */
export function diagnoseAddressSpace(target, context) {
    let url;
    try {
        url = new URL(target);
    } catch {
        return null;
    }

    const { isSecureContext, hostname } = context ?? currentContext();
    const to = classifyAddressSpace(url.hostname);
    const from = classifyAddressSpace(hostname);

    if (isSecureContext || !isMorePrivate(to, from)) {
        return null;
    }

    return `The browser refused to send this request rather than the table failing to answer: ` +
        `Foundry is being served insecurely over http:// from a ${from} address, which is not a ` +
        `secure context, and the table at ${url.hostname} is on the ${to} network. Browsers ` +
        `block that outright and report it as a CORS error, but no setting on the table server ` +
        `can allow it. Either open Foundry at an address on the same network as the table, or ` +
        `serve Foundry over https://. See "Reaching the table from a hosted Foundry server" in ` +
        `the module's README.`;
}
