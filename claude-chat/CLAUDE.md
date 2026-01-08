# Claude Chat

Web chat interface for Claude CLI.

## Stack

- Node.js + Express + Pug
- Uses `execSync` to call `claude -p` CLI
- Runs on host (not Docker) to use local Claude CLI credentials

## Run

```bash
# Development
pnpm start

# Production (systemd)
sudo ln -s /home/kroleg/homelab/claude-chat/claude-chat.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable claude-chat
sudo systemctl start claude-chat
```

## API

POST /api/chat
- Body: `{ message: string, history?: Array<{role: 'user'|'assistant', content: string}> }`
- Response: `{ response: string }`
