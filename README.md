# Aguipuntos

## Arquitectura de producción

- Frontend React/Vite: `https://aguipunt.vercel.app`
- API: Supabase Edge Function `api`
- Base de datos: Supabase PostgreSQL
- Tareas programadas: Supabase Cron

Railway ya no forma parte de la arquitectura de producción.

## Desarrollo local

Frontend:

```bash
cd frontend
npm install
npm run dev
```

La URL predeterminada de la API es:

```text
https://dqymnwbfnuimjfdnwaqb.supabase.co/functions/v1/api
```

Puede reemplazarse localmente con `VITE_API_URL`.

El backend Express dentro de `backend/` se conserva temporalmente como referencia
durante la transición, pero Vercel ya no lo compila ni lo despliega.

## Supabase

Validar la Edge Function:

```bash
npx deno check --config supabase/functions/api/deno.json supabase/functions/api/index.ts
```

Desplegar funciones y migraciones:

```bash
npx supabase functions deploy api --use-api --no-verify-jwt
npx supabase db push
```

Health check:

```text
GET /api/health
```
