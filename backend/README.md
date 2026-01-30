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
