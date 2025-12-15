# Calendar

Web app for displaying Apple/Google calendars on iPad.

## Setup

1. Get calendar ICS URL:
   - **Apple**: iCloud Calendar → Share Calendar → Public Calendar → copy webcal:// URL (change to https://)
   - **Google**: Calendar Settings → "Secret address in iCal format"

2. Create `.env` with calendar URLs:
```bash
CALENDAR_CONFIG_FAMILY_URL=https://...
```

3. Configure in `docker-compose.yml`:
```yaml
environment:
  - CALENDAR_IDS=FAMILY
  - CALENDAR_CONFIG_FAMILY_NAME=Семья
  - CALENDAR_CONFIG_FAMILY_COLOR=#FF383C
```

4. Start:
```bash
docker compose up -d calendar
```

5. Access at `http://calendar.internal/`

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `CALENDAR_IDS` | Comma-separated list of calendar IDs | required |
| `CALENDAR_CONFIG_<ID>_URL` | ICS URL for calendar | required |
| `CALENDAR_CONFIG_<ID>_NAME` | Display name | ID |
| `CALENDAR_CONFIG_<ID>_COLOR` | Hex color | auto |
| `PORT` | Server port | 3003 |
| `CACHE_TTL_MINUTES` | Cache duration | 5 |
| `TIMEZONE` | Timezone offset | +03:00 |

## API

- `GET /` - Calendar UI
- `GET /api/events?start=YYYY-MM-DD&end=YYYY-MM-DD` - Events JSON
- `GET /api/calendars` - List calendars
- `GET /api/health` - Health check
- `POST /api/refresh` - Invalidate cache
