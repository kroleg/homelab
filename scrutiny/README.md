# Scrutiny Setup

HDD/SSD health monitoring with SMART data.

Web UI: http://disk-monitor.internal

## Telegram Notifications

Create `config/scrutiny.yaml`:

```yaml
notify:
  urls:
    - "telegram://BOT_TOKEN@telegram?chats=CHAT_ID"
```

Replace:
- `BOT_TOKEN` - your Telegram bot token from @BotFather
- `CHAT_ID` - your chat ID (get from @userinfobot)

Restart after changes:
```bash
docker compose restart scrutiny
```

Test notifications:
```bash
docker exec scrutiny curl -s -X POST http://localhost:8080/api/health/notify
```

## Other Notification Services

Scrutiny uses [shoutrrr](https://containrrr.dev/shoutrrr/). Supported services:
- Discord: `discord://token@id`
- Slack: `slack://token@channel`
- Email: `smtp://user:pass@host:port/?to=recipient`
- Pushover: `pushover://token@user`

See full list: https://containrrr.dev/shoutrrr/services/overview/
