# ADR-001: DNS Interception Bypass for Docker Containers

## Status
Accepted

## Date
2026-01-28

## Context

Jellyfin was unable to fetch metadata and images from TheMovieDB (TMDb). Investigation revealed:

1. **Symptom**: `getent hosts api.themoviedb.org` returned `::1` (localhost) inside Docker containers
2. **Direct connection worked**: Using `curl --resolve api.themoviedb.org:443:18.173.219.5` successfully connected to TMDb

### Root Cause

Two separate issues combined:

**1. ISP-level DNS interception**

ISP intercepts all port 53 (UDP/TCP) traffic and returns localhost for blocked domains (e.g., TMDb):

```bash
# Both router and direct 8.8.8.8 queries get intercepted
$ dig @8.8.8.8 api.themoviedb.org A +short
127.0.0.1  # ISP intercepts!

$ dig @192.168.1.1 api.themoviedb.org A +short
127.0.0.1  # Also intercepted!

# dns-proxy (192.168.1.100) uses DNS over TLS - bypasses interception
$ dig @192.168.1.100 api.themoviedb.org A +short
18.173.219.5  # Correct IP
```

**2. Docker hairpin NAT limitation**

Containers cannot reach services published on the host's external IP:

```bash
# From inside container - ping works
$ ping 192.168.1.100
PING 192.168.1.100: 1 packets transmitted, 1 received

# But DNS query to host IP times out (hairpin NAT issue)
$ dig @192.168.1.100 api.themoviedb.org
;; connection timed out; no servers could be reached

# Direct container IP works
$ dig @192.168.80.53 api.themoviedb.org
18.173.219.5  # Works!
```

Docker's embedded DNS (127.0.0.11) couldn't reach dns-proxy at 192.168.1.100, fell back to 192.168.1.1 (router), which returned ISP-intercepted localhost responses.

## Decision

Configure containers requiring external DNS resolution to use dns-proxy directly:

1. Assign static IP to dns-proxy on the default network (`192.168.80.53`)
2. Configure affected containers with `dns: [192.168.80.53]`
3. Disable IPv6 in containers with `sysctls: [net.ipv6.conf.all.disable_ipv6=1]`

This routes DNS queries through dns-proxy's DNS over TLS (DoT) connection to Cloudflare, bypassing ISP interception.

### IPv6 Issue

After fixing DNS resolution, a secondary issue appeared: containers resolved TMDb to IPv6 addresses (AAAA records) but had no IPv6 connectivity, causing "Resource temporarily unavailable" errors.

```
System.Net.Sockets.SocketException (11): Resource temporarily unavailable
   at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.ThrowException
```

Docker's default bridge networks don't have IPv6 connectivity. When DNS returns both A (IPv4) and AAAA (IPv6) records, .NET prefers IPv6, which then fails.

Solution: Disable IPv6 at the container level using sysctl, forcing the application to use IPv4.

## Consequences

### Positive
- Containers can resolve blocked domains correctly
- No hardcoded IPs needed (extra_hosts)
- Centralized DNS configuration via dns-proxy

### Negative
- Containers depend on dns-proxy being available
- Static IP assignment adds network configuration complexity
- Only containers explicitly configured will bypass interception

### Neutral
- Other containers using default Docker DNS will still be affected by interception (may be acceptable for services not needing blocked domains)

## Affected Services

- `jellyfin` - requires TMDb access for metadata/images

### Configuration Template

For future services needing access to blocked domains:

```yaml
service-name:
  dns: [192.168.80.53]
  sysctls:
    - net.ipv6.conf.all.disable_ipv6=1
```
