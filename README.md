# Aguipuntos

Nota de encoding: Todos los archivos deben guardarse en UTF-8 (sin BOM).

## Desarrollo local

Backend:
- `cd backend`
- `npm i`
- `npm start`

Frontend:
- `cd frontend`
- `npm i`
- `npm run dev`

## Deploy

Backend (Railway/Render):
- Variables de entorno:
  - `PORT`
  - `JWT_SECRET`
  - `CORS_ORIGIN` (lista separada por coma, ej: `https://tu-frontend.com`)
  - `SQLITE_PATH` (ej: `/data/aguipuntos.db` con volumen persistente)
- Health check: `GET /api/health`

Frontend (Vercel/Netlify):
- Variable de entorno:
  - `VITE_API_URL` (ej: `https://tu-backend.com/api`)

## Health check

- `GET /api/health` retorna `{ ok: true, time: "..." }`
