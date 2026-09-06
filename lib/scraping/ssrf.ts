import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Server-Side Request Forgery protection for the scraping system.
 *
 * Only public, real-world http(s) hosts are fetchable. Loopback, private,
 * link-local, cloud-metadata (169.254.x.x), multicast and other reserved
 * ranges are rejected, including all hosts a given hostname resolves to.
 */

export function isHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Return true when the address belongs to a private/reserved range that must
 * never be reachable from the server.
 */
export function isRestrictedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 0) return true; // Not an IP - treat as unsafe

  if (version === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return true;
    const [a, b] = parts;

    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF protocol assignments
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
    return a >= 224; // 224.0.0.0/4 multicast + reserved
  }

  const normalized = ip.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true; // unspecified + loopback
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true; // fe80::/10 link-local
  }
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // fc00::/7 unique local
  if (normalized.startsWith('ff')) return true; // multicast
  if (normalized.startsWith('2001:db8')) return true; // documentation range
  return false;
}

async function resolveHostname(hostname: string): Promise<string[]> {
  // URL.hostname keeps the IPv6 bracket notation (e.g. `[::1]`); strip it for
  // the address checks.
  const host = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  const literalVersion = isIP(host);
  if (literalVersion !== 0) return [host];

  try {
    const resolved = await lookup(host, { all: true });
    return resolved.map((entry) => entry.address);
  } catch {
    throw new Error(`Host could not be resolved: ${hostname}`);
  }
}

/**
 * Reject URLs that are not http(s) or that resolve (fully or partially) into a
 * private/reserved address range. Throws for unsafe targets.
 */
export async function assertSafeScrapeUrl(input: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Invalid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are allowed');
  }

  const addresses = await resolveHostname(url.hostname);
  if (addresses.length === 0) {
    throw new Error(`Host resolved to no addresses: ${url.hostname}`);
  }

  for (const address of addresses) {
    if (isRestrictedIp(address)) {
      throw new Error('Requested URL points to a private or reserved address range');
    }
  }

  return url;
}