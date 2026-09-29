// Refuses connections to private, loopback, link-local and other non-public
// addresses — the targets of server-side request forgery.
//
// Every server-side fetch of a URL that didn't come from our own code goes
// through this: a project's source video can be any https URL the public API
// was given, and third-party provider URLs can redirect anywhere. A hostname
// check alone isn't enough (a public name can resolve to 10.0.0.5, or change
// what it resolves to between check and connect), so the check runs on the
// address the socket is actually about to connect to, via http.get's
// `lookup` hook — and separately on IP-literal hosts, which never reach it.

import dns from "dns";
import net from "net";
import type { LookupFunction } from "net";

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(addr, prefix, "ipv6");

/** True for any address a server-side fetch must never connect to. */
export function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) {
    // IPv4-mapped (::ffff:10.0.0.1) would otherwise dodge the v4 ranges.
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1], "ipv4");
    return blocked.check(address, "ipv6");
  }
  return false;
}

/** For an IP-literal hostname (lookup is skipped for those): is it private? */
export function isPrivateHostLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "");
  return net.isIP(bare) !== 0 && isPrivateAddress(bare);
}

/** A dns lookup that fails instead of returning a private address. */
export const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (bad || list.length === 0) {
      return callback(new Error(`Refusing to connect to a non-public address for ${hostname}`), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};
