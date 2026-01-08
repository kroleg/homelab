# Claude Chat

ChatGPT-like web interface using Claude CLI as backend.

## Requirements

- Node.js 24+
- Claude CLI installed and authenticated on host

## Development

```bash
pnpm install
pnpm start
```

## Production

### Manual start

```bash
node src/server.ts
```

### Systemd service (auto-start on boot)

```bash
sudo ln -s /home/kroleg/homelab/claude-chat/claude-chat.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable claude-chat
sudo systemctl start claude-chat
```

Check status:
```bash
sudo systemctl status claude-chat
```

View logs:
```bash
sudo journalctl -u claude-chat -f
```

## Access

- Direct: http://localhost:3005
- Via Traefik: http://chat.internal
