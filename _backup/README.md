# Backup Setup

Daily PostgreSQL backup to Google Drive with Telegram alerts on failure.

## Setup Steps

### 1. Install rclone
```bash
sudo apt install rclone
```

### 2. Configure Google Drive
```bash
rclone config --config ./rclone.conf
```

Follow the prompts:
1. `n` - new remote
2. Name: `gdrive`
3. Storage type: `drive` (Google Drive)
4. client_id: (leave blank)
5. client_secret: (leave blank)
6. scope: `3` (drive.file - minimal permissions)
7. service_account_file: (leave blank)
8. Edit advanced config: `n`
9. Use web browser: `n`

    Rclone will display a command like:
    ```
    rclone authorize "drive" "eyJ..."
    ```
10. From local SSH with X forwarding to server
    ```
    ssh -X 192.168.1.100
    ```
    and run command which rclone gave you
    ```
    rclone authorize "drive" "eyJ..."
    ```
    cmd+clik on a http link it outputs and it will open browser on local
11. Authorize in browser, copy the token back
12. Configure as team drive: `n`
13. Confirm: `y`

Creates `rclone.conf` in this folder.

### 3. Setup Healthchecks.io + Telegram
1. Create free account at https://healthchecks.io
2. Create a new check (period: 1 day, grace: 1 hour)
3. Go to Integrations → Telegram → connect @healthchecks_bot
4. Copy your ping URL

### 4. Create .env file
```bash
echo 'HC_PING_URL=https://hc-ping.com/your-uuid-here' > .env
```

### 5. Setup daily cron
```bash
chmod +x backup-main-db.sh
crontab -e
# Add:
0 3 * * * /home/kroleg/homelab/_backup/backup-main-db.sh 2>&1 | logger -t backup-main-db
```

## Manual backup
```bash
./backup-main-db.sh
```

## View logs
```bash
journalctl -t backup-main-db
```
