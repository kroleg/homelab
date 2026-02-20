# MTG Proxy

MTProto proxy for Telegram using [mtg](https://github.com/9seconds/mtg).

## Setup

### 1. Generate secret

```bash
docker run --rm ghcr.io/9seconds/mtg:2 generate-secret --hex api.telegram.org
```

Add to `.env`:
```
MTG_PROXY_SECRET=ee...generated_secret...
```

### 2. Start the container

```bash
docker compose up -d mtg-proxy
```

### 3. Configure Keenetic

### 3.1 KeenDNS

- register domain
- select `Direct access`

### 3.2 Port forwarding

Enable portforwarding TCP 8443->8443 to this machine

### 3.3 Static IP

If still doesn't work make then you need to request `Static IP` feature from your ISP

### 4. Telegram link

```
tg://proxy?server=your-domain.netcraze.club&port=8443&secret=YOUR_SECRET
```

## Verification

Post link above to `Saved Message` in tg and click on link from your phone/other device
