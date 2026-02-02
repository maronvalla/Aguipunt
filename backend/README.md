# Backend verification

Minimal curl checks for health and CORS preflight.

```bash
# 1) Health
curl -i https://aguipunt-production.up.railway.app/api/health

# 2) CORS preflight (login)
curl -i -X OPTIONS https://aguipunt-production.up.railway.app/api/auth/login \
  -H "Origin: https://aguipunt.vercel.app" \
  -H "Access-Control-Request-Method: POST"
```

Expected: the preflight response includes `Access-Control-Allow-Origin: https://aguipunt.vercel.app`.

## Telegram bot resumen diario

### Variables de entorno

```bash
TELEGRAM_BOT_TOKEN=...   # token del bot
TELEGRAM_CHAT_ID=...     # opcional, se guarda al recibir /start
BOT_SECRET=...           # secreto para endpoint diario
TZ=America/Argentina/Tucuman
DAILY_SUMMARY_ENABLED=true  # habilita el scheduler interno (opcional)
```

### Registrar chat_id

Si se configura un webhook en Telegram, el admin debe enviar `/start` al bot para registrar el chat:

```bash
curl -X POST https://<host>/api/bot/telegram-webhook \
  -H "Content-Type: application/json" \
  -d '{"message":{"text":"/start","chat":{"id":"123"}}}'
```

También se puede registrar manualmente con `chatId`:

```bash
curl -X POST https://<host>/api/bot/register \
  -H "Content-Type: application/json" \
  -d '{"chatId":"123"}'
```

### Disparar resumen diario

```bash
curl -X POST "https://<host>/api/bot/daily-summary?secret=BOT_SECRET"
```

El endpoint está pensado para ejecutarse desde un scheduler externo (por ejemplo, cron-job.org a las 21:00).
Si querés usar el scheduler interno del backend, definí `DAILY_SUMMARY_ENABLED=true`.
