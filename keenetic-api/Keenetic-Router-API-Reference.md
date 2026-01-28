# Keenetic Router API Reference

> Complete reference for Keenetic router RCI (Remote Command Interface) HTTP API.
> Use this document to build libraries that interact with Keenetic routers.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [API Conventions](#2-api-conventions)
3. [System](#3-system)
4. [Devices & Hosts](#4-devices--hosts)
5. [Network Interfaces](#5-network-interfaces)
6. [Internet & WAN](#6-internet--wan)
7. [Wi-Fi](#7-wi-fi)
8. [DHCP](#8-dhcp)
9. [Routing](#9-routing)
10. [NAT & Port Forwarding](#10-nat--port-forwarding)
11. [Firewall](#11-firewall)
12. [VPN](#12-vpn)
13. [USB & Storage](#13-usb--storage)
14. [DNS](#14-dns)
15. [Dynamic DNS](#15-dynamic-dns)
16. [Schedules](#16-schedules)
17. [Users](#17-users)
18. [Logs](#18-logs)
19. [Diagnostics](#19-diagnostics)
20. [System Operations](#20-system-operations)
21. [Components](#21-components)
22. [Mesh Wi-Fi System](#22-mesh-wi-fi-system)
23. [QoS & Traffic Control](#23-qos--traffic-control)
24. [IPv6](#24-ipv6)

---

## 1. Authentication

### Overview

Keenetic uses a challenge-response authentication mechanism with session cookies.

### Authentication Flow

```
Step 1: GET /auth
        Response: HTTP 401
        Headers: X-NDM-Challenge, X-NDM-Realm
        Cookies: Set-Cookie (save these)

Step 2: Calculate hash
        md5_hash = MD5(login + ":" + realm + ":" + password)
        auth_hash = SHA256(challenge + md5_hash)

Step 3: POST /auth
        Body: {"login": "admin", "password": "<auth_hash>"}
        Response: HTTP 200 (success)
        Cookies: Session cookie set
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth` | Get authentication challenge (returns 401 with headers) |
| `POST` | `/auth` | Submit credentials |

### Request Example

```http
POST /auth HTTP/1.1
Content-Type: application/json
Cookie: <cookies from step 1>

{"login": "admin", "password": "<sha256_hash>"}
```

### Response Example

```json
{}
```

HTTP 200 indicates success. Session maintained via cookies.

---

## 2. API Conventions

### Base URL

```
http://<router_ip>/rci/
```

### HTTP Methods

| Method | Usage |
|--------|-------|
| `GET` | Read data (append path to `/rci/show/`) |
| `POST` | Write/execute commands (append path to `/rci/`) |

### Request Format

- Content-Type: `application/json`
- All POST bodies must be valid JSON
- Empty objects `{}` are valid for commands without parameters

### Response Format

- Content-Type: `application/json`
- Success: Returns requested data or empty object
- Error: Returns error object with `error` and `message` fields

### Key Naming Convention

- API uses **kebab-case** for JSON keys (e.g., `first-seen`, `last-change`)
- Convert to snake_case in your library

### Boolean Values

May be returned as:
- `true` / `false` (boolean)
- `"true"` / `"false"` (string)

Always check for both when parsing.

### Batch Requests (IMPORTANT)

**All write commands MUST be sent as arrays to `/rci/`:**

```http
POST /rci/ HTTP/1.1
Content-Type: application/json

[
  {"show": {"system": {}}},
  {"show": {"ip": {"hotspot": {}}}}
]
```

Response is an array in the same order.

> **⚠️ Critical**: Even single write commands must be wrapped in an array.
> The simplified paths like `POST /rci/ip/hotspot/host` do NOT work for write operations.

### MAC Address Format

- **Always use lowercase** MAC addresses in write operations
- Example: `aa:bb:cc:dd:ee:ff` (not `AA:BB:CC:DD:EE:FF`)
- Colons required, not hyphens

### Command Structure

Write commands use nested JSON objects representing the command path:

```json
[{"ip": {"hotspot": {"host": {"mac": "aa:bb:cc:dd:ee:ff", "permit": true}}}}]
```

This is equivalent to CLI command: `ip hotspot host aa:bb:cc:dd:ee:ff permit`

---

## 3. System

### 3.1 System Status

**Purpose**: Get CPU, memory, swap usage and uptime.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/system` |
| **Method** | GET |

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `hostname` | string | Router hostname |
| `domainname` | string | Domain name |
| `cpuload` | integer | CPU usage percentage (0-100) |
| `memtotal` | integer | Total RAM in bytes |
| `memfree` | integer | Free RAM in bytes |
| `membuffers` | integer | Buffer memory in bytes |
| `memcache` | integer | Cached memory in bytes |
| `swaptotal` | integer | Total swap in bytes |
| `swapfree` | integer | Free swap in bytes |
| `uptime` | integer | Uptime in seconds |

**Response Example**:

```json
{
  "hostname": "Keenetic",
  "domainname": "local",
  "cpuload": 15,
  "memtotal": 536870912,
  "memfree": 268435456,
  "membuffers": 10485760,
  "memcache": 41943040,
  "swaptotal": 0,
  "swapfree": 0,
  "uptime": 86400
}
```

---

### 3.2 Firmware & Hardware Info

**Purpose**: Get router model, firmware version, and hardware details.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/version` |
| **Method** | GET |

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `model` | string | Router model name (e.g., "Keenetic Viva") |
| `device` | string | Device code (e.g., "KN-1912") |
| `manufacturer` | string | Manufacturer name |
| `vendor` | string | Vendor name |
| `hw_version` | string | Hardware revision |
| `hw_id` | string | Hardware identifier |
| `title` | string | Firmware title |
| `release` | string | Firmware version string |
| `arch` | string | CPU architecture (e.g., "mips", "aarch64") |
| `ndm` | object | NDM version info (`version`, `exact`) |
| `ndw` | object | NDW version info (`version`) |
| `components` | array | List of installed components |
| `sandbox` | string | Sandbox mode status |

**Response Example**:

```json
{
  "model": "Keenetic Viva",
  "device": "KN-1912",
  "manufacturer": "Keenetic Ltd.",
  "vendor": "Keenetic",
  "hw_version": "A",
  "hw_id": "KN-1912",
  "title": "Keenetic Viva",
  "release": "4.01.C.7.0-0",
  "arch": "mips",
  "ndm": {
    "version": "4.01",
    "exact": "4.01.C.7.0-0"
  },
  "ndw": {
    "version": "4.3.7"
  },
  "components": ["dhcp-server", "wifi", "vpn-server"],
  "sandbox": "disabled"
}
```

---

### 3.3 System Defaults

**Purpose**: Get default system configuration values.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/defaults` |
| **Method** | GET |

---

### 3.4 License Information

**Purpose**: Get license status and enabled features.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/license` |
| **Method** | GET |

---

## 4. Devices & Hosts

### 4.1 List All Devices

**Purpose**: Get all registered devices (hotspot hosts).

| | |
|---|---|
| **Endpoint** | `GET /rci/show/ip/hotspot` |
| **Method** | GET |

**Response Structure**:

```json
{
  "host": [...]
}
```

**Host Object Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `mac` | string | MAC address (uppercase, colon-separated) |
| `name` | string | User-assigned device name |
| `hostname` | string | Device-reported hostname |
| `ip` | string | Current IP address |
| `interface` | string/object | Connected interface ID or object |
| `via` | string | Connection path |
| `active` | boolean | Currently connected |
| `registered` | boolean | Is a registered device |
| `access` | string | Access policy ("permit", "deny") |
| `schedule` | string | Schedule name for access control |
| `rxbytes` | integer | Total bytes received |
| `txbytes` | integer | Total bytes transmitted |
| `uptime` | integer | Current session uptime in seconds |
| `first-seen` | string | First seen timestamp |
| `last-seen` | string | Last seen timestamp |
| `link` | string | Link type |

**Response Example**:

```json
{
  "host": [
    {
      "mac": "AA:BB:CC:DD:EE:FF",
      "name": "My Phone",
      "hostname": "iphone",
      "ip": "192.168.1.100",
      "interface": "Bridge0",
      "via": "WifiMaster0/AccessPoint0",
      "active": true,
      "registered": true,
      "access": "permit",
      "schedule": "",
      "rxbytes": 1073741824,
      "txbytes": 536870912,
      "uptime": 3600,
      "first-seen": "2024-01-01T00:00:00Z",
      "last-seen": "2024-01-15T12:00:00Z",
      "link": "wifi"
    }
  ]
}
```

---

### 4.2 Update Device Name

**Purpose**: Update user-assigned device name.

| | |
|---|---|
| **Endpoint** | `POST /rci/` |
| **Method** | POST (array format) |

> **⚠️ Important**: Device names are set via `known.host`, NOT `ip.hotspot.host`

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mac` | string | Yes | Device MAC address (lowercase) |
| `name` | string | Yes | New device name |

**Request Example**:

```json
[{"known": {"host": {"mac": "aa:bb:cc:dd:ee:ff", "name": "Living Room TV"}}}]
```

**Response Example** (success):

```json
[{"known": {"host": {"status": [{"status": "message", "code": "9175042", "ident": "Core::KnownHosts", "message": "host \"Living Room TV\" has been updated."}]}}}]
```

---

### 4.3 Update Device Access Policy

**Purpose**: Update device access policy (permit/deny) and schedule.

| | |
|---|---|
| **Endpoint** | `POST /rci/` |
| **Method** | POST (array format) |

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mac` | string | Yes | Device MAC address (lowercase) |
| `permit` | boolean | No | Set to `true` to permit access |
| `deny` | boolean | No | Set to `true` to deny access |
| `schedule` | string | No | Schedule name for access control |
| `priority` | integer | No | Device priority (1-9) |

**Request Example** (permit access):

```json
[{"ip": {"hotspot": {"host": {"mac": "aa:bb:cc:dd:ee:ff", "permit": true}}}}]
```

**Request Example** (deny access):

```json
[{"ip": {"hotspot": {"host": {"mac": "aa:bb:cc:dd:ee:ff", "deny": true}}}}]
```

**Response Example** (success):

```json
[{"ip": {"hotspot": {"host": {"permit": {"status": [{"status": "message", "message": "rule \"permit\" applied to host \"aa:bb:cc:dd:ee:ff\"."}]}}}}}]
```

---

### 4.4 Combined Device Update

**Purpose**: Update both name and access policy in one request.

When updating multiple properties, send multiple commands in the array:

```json
[
  {"known": {"host": {"mac": "aa:bb:cc:dd:ee:ff", "name": "Living Room TV"}}},
  {"ip": {"hotspot": {"host": {"mac": "aa:bb:cc:dd:ee:ff", "permit": true, "priority": 6}}}}
]
```

---

### 4.5 Delete Device Registration

**Purpose**: Remove a device from the registered list.

| | |
|---|---|
| **Endpoint** | `POST /rci/` |
| **Method** | POST (array format) |

**Request Example**:

```json
[{"ip": {"hotspot": {"host": {"mac": "aa:bb:cc:dd:ee:ff", "no": true}}}}]
```

---

### 4.6 Full Device Update (as sent by Keenetic Web UI)

The Keenetic web interface sends a comprehensive update with multiple commands:

```json
[
  {"interface": {"mac": {"band": {"mac": "aa:bb:cc:dd:ee:ff", "no": true}}, "name": "Bridge0"}},
  {"interface": {"mac": {"band": {"mac": "aa:bb:cc:dd:ee:ff", "no": true}}, "name": "Bridge2"}},
  {"known": {"host": {"name": "Device Name", "mac": "aa:bb:cc:dd:ee:ff"}}},
  {"ip": {"dhcp": {"host": {"mac": "aa:bb:cc:dd:ee:ff", "no": true}}}},
  {"ip": {"hotspot": {"host": {"mac": "aa:bb:cc:dd:ee:ff", "conform": true, "permit": true, "policy": {"no": true}, "schedule": {"no": true}}}}},
  {"ip": {"hotspot": {"host": {"mac": "aa:bb:cc:dd:ee:ff", "priority": 6}}}},
  {"ip": {"traffic-shape": {"host": {"mac": "aa:bb:cc:dd:ee:ff", "no": true}}}},
  {"system": {"configuration": {"save": {}}}}
]
```

Key commands explained:
- `known.host`: Sets the device name
- `ip.hotspot.host.permit`: Permits device access
- `ip.hotspot.host.deny`: Denies device access
- `ip.hotspot.host.priority`: Sets device priority
- `ip.hotspot.host.policy`: Assigns routing policy (VPN, etc.)
- `ip.hotspot.host.schedule`: Assigns access schedule
- `ip.traffic-shape.host`: Traffic shaping settings
- `system.configuration.save`: Saves configuration to flash

---

## 5. Network Interfaces

### 5.1 List All Interfaces

**Purpose**: Get all network interfaces (Ethernet, Wi-Fi, bridges, tunnels, etc.).

| | |
|---|---|
| **Endpoint** | `GET /rci/show/interface` |
| **Method** | GET |

**Response Structure**:

Object with interface IDs as keys:

```json
{
  "GigabitEthernet0": {...},
  "Bridge0": {...},
  "WifiMaster0": {...}
}
```

**Interface Object Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Interface identifier |
| `description` | string | Human-readable name |
| `type` | string | Interface type (see below) |
| `mac` | string | MAC address |
| `mtu` | integer | Maximum transmission unit |
| `state` | string | Administrative state |
| `link` | boolean | Physical link status |
| `connected` | boolean | Logical connection status |
| `address` | string | IP address |
| `mask` | string | Network mask |
| `gateway` | string | Gateway address |
| `defaultgw` | boolean | Is default gateway |
| `uptime` | integer | Connection uptime in seconds |
| `rxbytes` | integer | Bytes received |
| `txbytes` | integer | Bytes transmitted |
| `rxpackets` | integer | Packets received |
| `txpackets` | integer | Packets transmitted |
| `speed` | integer | Link speed in Mbps |
| `duplex` | string | "full" or "half" |
| `security-level` | string | "public" or "private" |
| `global` | boolean | Has global (public) IP |

**Interface Types**:

| Type | Description |
|------|-------------|
| `GigabitEthernet` | Gigabit Ethernet port |
| `FastEthernet` | Fast Ethernet port |
| `Bridge` | Network bridge |
| `AccessPoint` | Wi-Fi access point |
| `WifiMaster` | Wi-Fi radio interface |
| `PPPoE` | PPPoE connection |
| `PPTP` | PPTP tunnel |
| `L2TP` | L2TP tunnel |
| `OpenVPN` | OpenVPN tunnel |
| `WireGuard` | WireGuard tunnel |
| `IPsec` | IPsec tunnel |
| `GRE` | GRE tunnel |
| `EoIP` | EoIP tunnel |

---

### 5.2 Interface Statistics

**Purpose**: Get detailed traffic statistics for all interfaces.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/interface/stat` |
| **Method** | GET |

**Additional Fields** (beyond standard interface fields):

| Field | Type | Description |
|-------|------|-------------|
| `rxerrors` | integer | Receive errors |
| `txerrors` | integer | Transmit errors |
| `rxdrops` | integer | Dropped received packets |
| `txdrops` | integer | Dropped transmitted packets |
| `collisions` | integer | Collision count |
| `media` | string | Media type |

---

### 5.3 Configure Interface

**Purpose**: Modify interface settings.

| | |
|---|---|
| **Endpoint** | `POST /rci/interface/<interface_id>` |
| **Method** | POST |

**Request Example** (enable/disable):

```json
{
  "up": true
}
```

---

## 6. Internet & WAN

### 6.1 Internet Status

**Purpose**: Check internet connectivity status.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/internet/status` |
| **Method** | GET |

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `internet` | boolean | Internet is reachable |
| `gateway` | string | Default gateway IP |
| `dns` | array | DNS server addresses |
| `checked` | string | Last check timestamp |
| `checking` | boolean | Check in progress |
| `interface` | string | Active WAN interface |
| `address` | string | WAN IP address |

**Response Example**:

```json
{
  "internet": true,
  "gateway": "10.0.0.1",
  "dns": ["8.8.8.8", "8.8.4.4"],
  "checked": "2024-01-15T12:00:00Z",
  "checking": false,
  "interface": "ISP",
  "address": "203.0.113.50"
}
```

---

### 6.2 Configure WAN Connection

**Purpose**: Set up or modify WAN connection.

| | |
|---|---|
| **Endpoint** | `POST /rci/interface/<wan_interface_id>` |
| **Method** | POST |

**PPPoE Configuration**:

```json
{
  "pppoe": {
    "service": "ISP",
    "username": "user@isp.com",
    "password": "secret"
  },
  "up": true
}
```

**Static IP Configuration**:

```json
{
  "address": "203.0.113.50",
  "mask": "255.255.255.0",
  "gateway": "203.0.113.1"
}
```

**DHCP (IPoE) Configuration**:

```json
{
  "ip": {
    "dhcp": true
  }
}
```

---

## 7. Wi-Fi

### 7.1 Wi-Fi Access Points

Wi-Fi interfaces are included in the standard interface list with additional fields.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/interface` |
| **Method** | GET |

**Wi-Fi Specific Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `ssid` | string | Network name |
| `channel` | integer | Channel number |
| `band` | string | Frequency band ("2.4GHz", "5GHz") |
| `authentication` | string | Security mode |
| `encryption` | string | Encryption type |
| `station-count` | integer | Connected client count |
| `txpower` | integer | Transmit power in dBm |
| `width` | string | Channel width ("20", "40", "80", "160") |

**Authentication Types**:

| Value | Description |
|-------|-------------|
| `open` | No security |
| `wpa-psk` | WPA Personal |
| `wpa2-psk` | WPA2 Personal |
| `wpa3-psk` | WPA3 Personal |
| `wpa2/wpa3-psk` | WPA2/WPA3 mixed |

---

### 7.2 Wi-Fi Clients (Associations)

**Purpose**: Get connected Wi-Fi clients with signal info.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/associations` |
| **Method** | GET |

**Response Structure**:

```json
{
  "station": [...]
}
```

**Station Object Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `mac` | string | Client MAC address |
| `ap` | string | Connected access point interface |
| `authenticated` | boolean | Authentication status |
| `txrate` | integer | TX rate in Kbps |
| `rxrate` | integer | RX rate in Kbps |
| `uptime` | integer | Connection duration in seconds |
| `txbytes` | integer | Bytes transmitted |
| `rxbytes` | integer | Bytes received |
| `rssi` | integer | Signal strength in dBm (negative) |
| `mcs` | integer | MCS index |
| `ht` | boolean | HT (802.11n) mode |
| `vht` | boolean | VHT (802.11ac) mode |
| `he` | boolean | HE (802.11ax) mode |
| `mode` | string | Wi-Fi mode |
| `gi` | string | Guard interval |

**Response Example**:

```json
{
  "station": [
    {
      "mac": "AA:BB:CC:DD:EE:FF",
      "ap": "WifiMaster0/AccessPoint0",
      "authenticated": true,
      "txrate": 866700,
      "rxrate": 780000,
      "uptime": 3600,
      "txbytes": 1073741824,
      "rxbytes": 536870912,
      "rssi": -45,
      "mcs": 9,
      "ht": false,
      "vht": true,
      "mode": "ac",
      "gi": "short"
    }
  ]
}
```

---

### 7.3 Configure Wi-Fi

**Purpose**: Modify Wi-Fi settings.

| | |
|---|---|
| **Endpoint** | `POST /rci/interface/<wifi_interface_id>` |
| **Method** | POST |

**Request Example**:

```json
{
  "ssid": "MyNetwork",
  "authentication": "wpa2-psk",
  "encryption": "aes",
  "key": "mysecretpassword",
  "channel": 6,
  "up": true
}
```

---

### 7.4 Enable/Disable Wi-Fi

| | |
|---|---|
| **Endpoint** | `POST /rci/interface/<wifi_interface_id>` |
| **Method** | POST |

```json
{"up": true}
```

```json
{"up": false}
```

---

## 8. DHCP

### 8.1 DHCP Leases

**Purpose**: Get active DHCP leases.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/ip/dhcp/lease` |
| **Method** | GET |

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `ip` | string | Leased IP address |
| `mac` | string | Client MAC address |
| `hostname` | string | Client hostname |
| `expires` | integer | Lease expiry timestamp |

---

### 8.2 Static DHCP Bindings

**Purpose**: Get static IP reservations.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/ip/dhcp/binding` |
| **Method** | GET |

---

### 8.3 Add Static DHCP Binding

**Purpose**: Create IP reservation for a device.

| | |
|---|---|
| **Endpoint** | `POST /rci/ip/dhcp/host` |
| **Method** | POST |

**Request Example**:

```json
{
  "mac": "AA:BB:CC:DD:EE:FF",
  "ip": "192.168.1.100",
  "name": "My Server"
}
```

---

### 8.4 Delete Static DHCP Binding

| | |
|---|---|
| **Endpoint** | `POST /rci/ip/dhcp/host` |
| **Method** | POST |

```json
{
  "mac": "AA:BB:CC:DD:EE:FF",
  "no": true
}
```

---

## 9. Routing

### 9.1 Routing Table

**Purpose**: Get IP routing table.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/ip/route` |
| **Method** | GET |

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `destination` | string | Destination network |
| `mask` | string | Network mask |
| `gateway` | string | Next hop address |
| `interface` | string | Output interface |
| `metric` | integer | Route metric |
| `flags` | string | Route flags |
| `auto` | boolean | Auto-generated route |

---

### 9.2 Add Static Route

| | |
|---|---|
| **Endpoint** | `POST /rci/ip/route` |
| **Method** | POST |

**Request Example**:

```json
{
  "destination": "10.0.0.0",
  "mask": "255.0.0.0",
  "gateway": "192.168.1.1",
  "interface": "ISP"
}
```

---

### 9.3 ARP Table

**Purpose**: Get ARP cache.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/ip/arp` |
| **Method** | GET |

---

### 9.4 Routing Policies

**Purpose**: Get configured routing policies (VPN tunnels, traffic routing rules).

| | |
|---|---|
| **Endpoint** | `POST /rci/` (batch) |
| **Method** | POST |

**Request Body**:

```json
[{"show":{"sc":{"ip":{"policy":{}}}}}]
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `Policy0..N` | object | Policy object keyed by ID |
| `description` | string | Policy name (prefix `!` removed for display) |
| `permit` | array | List of permitted interfaces |
| `permit[].interface` | string | Interface name (e.g., `Wireguard0`) |
| `permit[].enabled` | boolean | Whether this interface is active |
| `permit[].no` | boolean | If true, interface is disabled |

**Response Example**:

```json
[{
  "show": {
    "sc": {
      "ip": {
        "policy": {
          "Policy0": {
            "description": "!Latvia",
            "permit": [
              { "interface": "Wireguard0", "enabled": true },
              { "interface": "ISP", "enabled": false }
            ]
          },
          "Policy1": {
            "description": "!Germany",
            "permit": [
              { "interface": "OpenVPN0", "enabled": true }
            ]
          }
        }
      }
    }
  }
}]
```

---

### 9.5 Device Policy Assignments

**Purpose**: Get which devices are assigned to which routing policies.

| | |
|---|---|
| **Endpoint** | `POST /rci/` (batch) |
| **Method** | POST |

**Request Body**:

```json
[{"show":{"sc":{"ip":{"hotspot":{"host":{}}}}}}]
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `host` | array | List of hosts with policy assignments |
| `host[].mac` | string | Device MAC address |
| `host[].policy` | string | Policy ID assigned to device (e.g., `Policy0`) |

**Response Example**:

```json
[{
  "show": {
    "sc": {
      "ip": {
        "hotspot": {
          "host": [
            { "mac": "00:11:22:33:44:55", "policy": "Policy0" },
            { "mac": "AA:BB:CC:DD:EE:FF", "policy": "Policy1" }
          ]
        }
      }
    }
  }
}]
```

---

## 10. NAT & Port Forwarding

### 10.1 List NAT Rules

**Purpose**: Get port forwarding rules.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/ip/nat` |
| **Method** | GET |

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `index` | integer | Rule index/priority |
| `description` | string | Rule description |
| `protocol` | string | "tcp", "udp", or "any" |
| `interface` | string | WAN interface |
| `port` | integer | External port |
| `end-port` | integer | End of port range |
| `to-host` | string | Internal host IP |
| `to-port` | integer | Internal port |
| `enabled` | boolean | Rule is active |

---

### 10.2 Add Port Forward

| | |
|---|---|
| **Endpoint** | `POST /rci/ip/nat` |
| **Method** | POST |

**Request Example**:

```json
{
  "index": 1,
  "description": "Web Server",
  "protocol": "tcp",
  "interface": "ISP",
  "port": 8080,
  "to-host": "192.168.1.100",
  "to-port": 80,
  "enabled": true
}
```

---

### 10.3 Delete Port Forward

| | |
|---|---|
| **Endpoint** | `POST /rci/ip/nat` |
| **Method** | POST |

```json
{
  "index": 1,
  "no": true
}
```

---

### 10.4 UPnP Mappings

**Purpose**: Get automatic UPnP port mappings.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/upnp/redirect` |
| **Method** | GET |

---

## 11. Firewall

### 11.1 Firewall Policies

| | |
|---|---|
| **Endpoint** | `GET /rci/show/ip/policy` |
| **Method** | GET |

---

### 11.2 Access Lists

| | |
|---|---|
| **Endpoint** | `GET /rci/show/access-list` |
| **Method** | GET |

---

### 11.3 Add Firewall Rule

| | |
|---|---|
| **Endpoint** | `POST /rci/ip/policy` |
| **Method** | POST |

---

## 12. VPN

### 12.1 VPN Server Status

| | |
|---|---|
| **Endpoint** | `GET /rci/show/vpn-server` |
| **Method** | GET |

---

### 12.2 VPN Server Clients

**Purpose**: Get connected VPN clients.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/vpn-server/clients` |
| **Method** | GET |

---

### 12.3 IPsec Status

| | |
|---|---|
| **Endpoint** | `GET /rci/show/crypto/ipsec/sa` |
| **Method** | GET |

---

### 12.4 Configure VPN Server

| | |
|---|---|
| **Endpoint** | `POST /rci/vpn-server` |
| **Method** | POST |

**PPTP/L2TP Configuration**:

```json
{
  "type": "pptp",
  "enabled": true,
  "pool-start": "192.168.1.200",
  "pool-end": "192.168.1.210"
}
```

---

## 13. USB & Storage

### 13.1 USB Devices

**Purpose**: Get connected USB devices.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/usb` |
| **Method** | GET |

**Response Structure**:

```json
{
  "device": [...]
}
```

**Device Object Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `port` | integer | USB port number |
| `manufacturer` | string | Device manufacturer |
| `product` | string | Product name |
| `serial` | string | Serial number |
| `class` | integer | USB device class |
| `speed` | string | USB speed |
| `connected` | boolean | Currently connected |

---

### 13.2 Storage/Media

**Purpose**: Get mounted storage partitions.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/media` |
| **Method** | GET |

**Response Structure**:

```json
{
  "media": [...]
}
```

**Media Object Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Device name |
| `label` | string | Volume label |
| `uuid` | string | Volume UUID |
| `fs` | string | Filesystem type |
| `mountpoint` | string | Mount path |
| `total` | integer | Total bytes |
| `used` | integer | Used bytes |
| `free` | integer | Free bytes |

---

### 13.3 Safely Eject USB

| | |
|---|---|
| **Endpoint** | `POST /rci/usb/eject` |
| **Method** | POST |

```json
{
  "port": 1
}
```

---

## 14. DNS

### 14.1 DNS Servers

| | |
|---|---|
| **Endpoint** | `GET /rci/show/ip/name-server` |
| **Method** | GET |

---

### 14.2 DNS Cache

| | |
|---|---|
| **Endpoint** | `GET /rci/show/dns/cache` |
| **Method** | GET |

---

### 14.3 DNS Proxy Settings

| | |
|---|---|
| **Endpoint** | `GET /rci/show/dns/proxy` |
| **Method** | GET |

---

### 14.4 Clear DNS Cache

| | |
|---|---|
| **Endpoint** | `POST /rci/dns/cache/clear` |
| **Method** | POST |

```json
{}
```

---

## 15. Dynamic DNS

### 15.1 KeenDNS Status

| | |
|---|---|
| **Endpoint** | `GET /rci/show/rc/ip/http/dyndns` |
| **Method** | GET |

---

### 15.2 Configure KeenDNS

| | |
|---|---|
| **Endpoint** | `POST /rci/ip/http/dyndns` |
| **Method** | POST |

---

### 15.3 Third-Party DDNS

| | |
|---|---|
| **Endpoint** | `GET /rci/show/dyndns` |
| **Method** | GET |

---

## 16. Schedules

### 16.1 List Schedules

**Purpose**: Get access control schedules.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/schedule` |
| **Method** | GET |

---

### 16.2 Create Schedule

| | |
|---|---|
| **Endpoint** | `POST /rci/schedule` |
| **Method** | POST |

**Request Example**:

```json
{
  "name": "kids_bedtime",
  "entries": [
    {
      "days": "mon,tue,wed,thu,fri",
      "start": "22:00",
      "end": "07:00",
      "action": "deny"
    }
  ]
}
```

---

### 16.3 Delete Schedule

| | |
|---|---|
| **Endpoint** | `POST /rci/schedule` |
| **Method** | POST |

```json
{
  "name": "kids_bedtime",
  "no": true
}
```

---

## 17. Users

### 17.1 List Users

| | |
|---|---|
| **Endpoint** | `GET /rci/show/user` |
| **Method** | GET |

---

### 17.2 Create User

| | |
|---|---|
| **Endpoint** | `POST /rci/user` |
| **Method** | POST |

**Request Example**:

```json
{
  "name": "guest",
  "password": "guestpass",
  "tag": ["http", "cifs"]
}
```

**Tags** (permissions):

| Tag | Description |
|-----|-------------|
| `http` | Web interface access |
| `cli` | CLI/Telnet access |
| `cifs` | File sharing access |
| `ftp` | FTP access |
| `vpn` | VPN access |

---

### 17.3 Delete User

| | |
|---|---|
| **Endpoint** | `POST /rci/user` |
| **Method** | POST |

```json
{
  "name": "guest",
  "no": true
}
```

---

## 18. Logs

### 18.1 System Log

**Purpose**: Get system event log.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/log` |
| **Method** | GET |

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `time` | string | Timestamp |
| `level` | string | Log level |
| `message` | string | Log message |
| `facility` | string | Log facility |

---

### 18.2 Filtered Log

| | |
|---|---|
| **Endpoint** | `POST /rci/show/log` |
| **Method** | POST |

**Request Example**:

```json
{
  "level": "error",
  "limit": 100
}
```

---

## 19. Diagnostics

### 19.1 Ping

| | |
|---|---|
| **Endpoint** | `POST /rci/tools/ping` |
| **Method** | POST |

**Request Example**:

```json
{
  "host": "8.8.8.8",
  "count": 4
}
```

---

### 19.2 Traceroute

| | |
|---|---|
| **Endpoint** | `POST /rci/tools/traceroute` |
| **Method** | POST |

**Request Example**:

```json
{
  "host": "google.com"
}
```

---

### 19.3 DNS Lookup

| | |
|---|---|
| **Endpoint** | `POST /rci/tools/nslookup` |
| **Method** | POST |

**Request Example**:

```json
{
  "host": "google.com"
}
```

---

## 20. System Operations

### 20.1 Reboot

| | |
|---|---|
| **Endpoint** | `POST /rci/system/reboot` |
| **Method** | POST |

```json
{}
```

---

### 20.2 Save Configuration

| | |
|---|---|
| **Endpoint** | `POST /rci/system/configuration/save` |
| **Method** | POST |

```json
{}
```

---

### 20.3 Factory Reset

| | |
|---|---|
| **Endpoint** | `POST /rci/system/default` |
| **Method** | POST |

```json
{}
```

---

### 20.4 Check for Updates

| | |
|---|---|
| **Endpoint** | `GET /rci/show/system/update` |
| **Method** | GET |

---

### 20.5 Apply Firmware Update

| | |
|---|---|
| **Endpoint** | `POST /rci/system/update` |
| **Method** | POST |

---

### 20.6 LED Control

| | |
|---|---|
| **Endpoint** | `POST /rci/system/led` |
| **Method** | POST |

**Request Example**:

```json
{
  "mode": "off"
}
```

**Modes**: `on`, `off`, `auto`

---

### 20.7 Button Configuration

| | |
|---|---|
| **Endpoint** | `GET /rci/show/button` |
| **Method** | GET |

---

## 21. Components

### 21.1 Installed Components

| | |
|---|---|
| **Endpoint** | `GET /rci/show/components` |
| **Method** | GET |

---

### 21.2 Available Components

| | |
|---|---|
| **Endpoint** | `GET /rci/show/components/available` |
| **Method** | GET |

---

### 21.3 Install Component

| | |
|---|---|
| **Endpoint** | `POST /rci/components/install` |
| **Method** | POST |

**Request Example**:

```json
{
  "name": "transmission"
}
```

---

### 21.4 Remove Component

| | |
|---|---|
| **Endpoint** | `POST /rci/components/remove` |
| **Method** | POST |

**Request Example**:

```json
{
  "name": "transmission"
}
```

---

## 22. Mesh Wi-Fi System

### 22.1 Mesh Status

| | |
|---|---|
| **Endpoint** | `GET /rci/show/mws` |
| **Method** | GET |

---

### 22.2 Mesh Members

**Purpose**: Get connected mesh nodes/extenders.

| | |
|---|---|
| **Endpoint** | `GET /rci/show/mws/member` |
| **Method** | GET |

---

## 23. QoS & Traffic Control

### 23.1 Traffic Shaper Status

| | |
|---|---|
| **Endpoint** | `GET /rci/show/ip/traffic-control` |
| **Method** | GET |

---

### 23.2 IntelliQoS Settings

| | |
|---|---|
| **Endpoint** | `GET /rci/show/ip/qos` |
| **Method** | GET |

---

### 23.3 Traffic Statistics by Host

| | |
|---|---|
| **Endpoint** | `GET /rci/show/ip/hotspot/summary` |
| **Method** | GET |

---

## 24. IPv6

### 24.1 IPv6 Interfaces

| | |
|---|---|
| **Endpoint** | `GET /rci/show/ipv6/interface` |
| **Method** | GET |

---

### 24.2 IPv6 Routes

| | |
|---|---|
| **Endpoint** | `GET /rci/show/ipv6/route` |
| **Method** | GET |

---

### 24.3 IPv6 Neighbors

| | |
|---|---|
| **Endpoint** | `GET /rci/show/ipv6/neighbor` |
| **Method** | GET |

---

## Appendix A: Complete Endpoint List

### READ Endpoints (GET)

| Endpoint | Description |
|----------|-------------|
| `/rci/show/system` | System status (CPU, memory, uptime) |
| `/rci/show/version` | Firmware and hardware info |
| `/rci/show/defaults` | Default configuration |
| `/rci/show/license` | License information |
| `/rci/show/interface` | All network interfaces |
| `/rci/show/interface/stat` | Interface statistics |
| `/rci/show/internet/status` | Internet connectivity |
| `/rci/show/ip/hotspot` | All registered devices |
| `/rci/show/ip/hotspot/active` | Active devices only |
| `/rci/show/ip/hotspot/summary` | Traffic summary by device |
| `/rci/show/associations` | Wi-Fi client associations |
| `/rci/show/ip/dhcp/lease` | DHCP leases |
| `/rci/show/ip/dhcp/binding` | Static DHCP bindings |
| `/rci/show/ip/route` | Routing table |
| `/rci/show/ip/arp` | ARP table |
| `/rci/show/ip/nat` | NAT/port forwarding rules |
| `/rci/show/ip/policy` | Firewall policies |
| `/rci/show/access-list` | Access control lists |
| `/rci/show/upnp/redirect` | UPnP port mappings |
| `/rci/show/vpn-server` | VPN server status |
| `/rci/show/vpn-server/clients` | VPN clients |
| `/rci/show/crypto/ipsec/sa` | IPsec security associations |
| `/rci/show/usb` | USB devices |
| `/rci/show/media` | Storage partitions |
| `/rci/show/ip/name-server` | DNS servers |
| `/rci/show/dns/cache` | DNS cache |
| `/rci/show/dns/proxy` | DNS proxy settings |
| `/rci/show/rc/ip/http/dyndns` | KeenDNS status |
| `/rci/show/dyndns` | Third-party DDNS |
| `/rci/show/schedule` | Access schedules |
| `/rci/show/user` | Users |
| `/rci/show/log` | System log |
| `/rci/show/system/update` | Update availability |
| `/rci/show/button` | Button configuration |
| `/rci/show/components` | Installed components |
| `/rci/show/components/available` | Available components |
| `/rci/show/mws` | Mesh Wi-Fi status |
| `/rci/show/mws/member` | Mesh members |
| `/rci/show/ip/traffic-control` | Traffic shaper |
| `/rci/show/ip/qos` | QoS settings |
| `/rci/show/ipv6/interface` | IPv6 interfaces |
| `/rci/show/ipv6/route` | IPv6 routes |
| `/rci/show/ipv6/neighbor` | IPv6 neighbors |

### WRITE Endpoints (POST)

| Endpoint | Description |
|----------|-------------|
| `/rci/ip/hotspot/host` | Update/delete device |
| `/rci/interface/<id>` | Configure interface |
| `/rci/ip/dhcp/host` | Add/delete DHCP binding |
| `/rci/ip/route` | Add/delete static route |
| `/rci/ip/nat` | Add/delete NAT rule |
| `/rci/ip/policy` | Add/delete firewall rule |
| `/rci/vpn-server` | Configure VPN server |
| `/rci/usb/eject` | Eject USB device |
| `/rci/dns/cache/clear` | Clear DNS cache |
| `/rci/ip/http/dyndns` | Configure KeenDNS |
| `/rci/schedule` | Create/delete schedule |
| `/rci/user` | Create/delete user |
| `/rci/tools/ping` | Run ping test |
| `/rci/tools/traceroute` | Run traceroute |
| `/rci/tools/nslookup` | Run DNS lookup |
| `/rci/system/reboot` | Reboot router |
| `/rci/system/configuration/save` | Save configuration |
| `/rci/system/default` | Factory reset |
| `/rci/system/update` | Apply firmware update |
| `/rci/system/led` | Control LEDs |
| `/rci/components/install` | Install component |
| `/rci/components/remove` | Remove component |

---

## Appendix B: Error Responses

### Error Object

```json
{
  "error": "error_code",
  "message": "Human readable description"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `unauthorized` | 401 | Authentication required |
| `forbidden` | 403 | Permission denied |
| `not-found` | 404 | Resource not found |
| `invalid-request` | 400 | Malformed request |
| `conflict` | 409 | Resource conflict |
| `internal-error` | 500 | Server error |

---

## Appendix C: Data Types Reference

### MAC Address Format

- Uppercase with colons: `AA:BB:CC:DD:EE:FF`

### IP Address Format

- IPv4: `192.168.1.1`
- IPv6: `fe80::1`

### Timestamp Formats

- Unix timestamp (integer seconds)
- ISO 8601 string: `2024-01-15T12:00:00Z`

### Byte Values

- Always integers
- Memory/storage in bytes
- Convert to human-readable as needed

---

*Document Version: 1.0*
*Last Updated: January 2025*
*Compatible with: KeeneticOS 4.x*
