#!/bin/bash
set -euo pipefail

KEENETIC_API="http://localhost:3000/api"
TELEGRAM_API="http://localhost:3008/api"

# Send Telegram notification
curl -sf -X POST "$TELEGRAM_API/send" \
  -H "Content-Type: application/json" \
  -d '{"text": "🔄 Keenetic router weekly reboot initiated"}' || true

# Trigger reboot
curl -sf -X POST "$KEENETIC_API/reboot"
