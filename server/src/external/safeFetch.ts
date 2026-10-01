/**
 * Fetching a page someone pasted a link to, safely.
 *
 * Recipe import makes this server fetch any address a person types, which is
 * how servers get turned against their own network: a link to 127.0.0.1, to a
 * private address on the host's network, to the cloud provider's metadata
 * service, or to a harmless-looking page that redirects to one of those. So
 * every address a link resolves to is checked at the moment of connecting
 * (after any DNS trickery, not before it), every redirect is followed by hand
 * and checked again, only the web's ordinary ports are allowed, and a page
 * stops being read once it is bigger than any recipe page needs to be.
 */
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import type { Readable } from 'node:stream';

export class BlockedAddressError extends Error {
  constructor() {
    super('That address is not on the public internet.');
  }
}

const blocked = new BlockList();
// loopback, private networks, link-local (the metadata services live here), carrier-grade NAT,
// documentation, benchmarking, multicast and the reserved rest
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 127], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(net, prefix, 'ipv6');

/** True for any address that is not a public one, including an IPv4 address wrapped in IPv6. */
export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return blocked.check(mapped[1]!, 'ipv4');
  const family = isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) return blocked.check(address, 'ipv6');
  return true;
}

/** DNS, with every answer checked before a connection is made to it. */
function publicOnlyLookup(
  hostname: string,
  options: LookupOptions,
  callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) return callback(new BlockedAddressError(), []);
    if (options.all) return callback(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
}

function checkUrl(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BlockedAddressError();
  if (url.username || url.password) throw new BlockedAddressError();
  if (url.port && url.port !== '80' && url.port !== '443') throw new BlockedAddressError();
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // a literal address never goes through DNS, so it is checked here
  if (isIP(host) && isPrivateAddress(host)) throw new BlockedAddressError();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new BlockedAddressError();
}

export interface FetchedPage {
  status: number;
  contentType: string;
  body: string;
}

export class PageTooLargeError extends Error {}

function decoded(stream: Readable, encoding: string | undefined): Readable {
  if (encoding === 'gzip' || encoding === 'x-gzip') return stream.pipe(createGunzip());
  if (encoding === 'deflate') return stream.pipe(createInflate());
  if (encoding === 'br') return stream.pipe(createBrotliDecompress());
  return stream;
}

/**
 * GET a public web page as text, following up to five redirects, within the
 * time and size given. Throws BlockedAddressError for anything not public,
 * PageTooLargeError past the size, and an AbortError on timeout.
 */
export async function fetchPublicPage(
  address: string,
  { timeoutMs, maxBytes, headers }: { timeoutMs: number; maxBytes: number; headers: Record<string, string> },
): Promise<FetchedPage> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = new URL(address);
  for (let hop = 0; hop <= 5; hop++) {
    checkUrl(url);
    const page = await new Promise<FetchedPage | { redirect: string }>((resolve, reject) => {
      const client = url.protocol === 'https:' ? https : http;
      const request = client.get(url, { headers: { ...headers, 'Accept-Encoding': 'gzip, deflate, br' }, lookup: publicOnlyLookup, signal }, (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        if (status >= 300 && status < 400 && location) {
          response.resume();
          resolve({ redirect: location });
          return;
        }
        const body = decoded(response, response.headers['content-encoding']);
        const chunks: Buffer[] = [];
        let size = 0;
        body.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            request.destroy();
            reject(new PageTooLargeError('That page is too big to read.'));
            return;
          }
          chunks.push(chunk);
        });
        body.on('end', () => resolve({ status, contentType: String(response.headers['content-type'] ?? ''), body: Buffer.concat(chunks).toString('utf8') }));
        body.on('error', reject);
      });
      request.on('error', reject);
    });
    if ('redirect' in page) {
      url = new URL(page.redirect, url);
      continue;
    }
    return page;
  }
  throw new BlockedAddressError();
}
