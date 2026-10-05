// ?cmd=<*command> and ?run=<app> run things at start-up. They are for development on this computer only: from any
// other host name a link on another web site could use them to run commands against the desktop's discs.
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** May this page's host name use the ?cmd and ?run URL parameters? */
export const devParamsAllowed = (hostname) => typeof hostname === 'string' && LOOPBACK.has(hostname.toLowerCase());
