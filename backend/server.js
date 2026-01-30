// backend/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const customersRoutes = require("./routes/customers");
const pointsRoutes = require("./routes/points");
const prizesRoutes = require("./routes/prizes");
const usersRoutes = require("./routes/users"); // si existe

const requireAuth = require("./middleware/auth");

const app = express();

// ---------- Middlewares base ----------
app.use(express.json());

// ---------- CORS (UNA sola vez, consistente) ----------
// En prod: setear CORS_ORIGIN como lista separada por comas
// Ej: CORS_ORIGIN=https://aguipunt.vercel.app,https://otro-dominio.com
const corsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// En dev, permitir localhost
const devOrigins = ["http://localhost:5173", "http://localhost:5174"];

const allowedOrigins = corsOrigins.length ? corsOrigins : devOrigins;

app.use(
  cors({
    origin: (origin, cb) => {
      // Permite requests sin Origin (curl/postman/healthchecks)
      if (!origin) return cb(null, true);

      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false, // si no usás cookies, dejalo false (JWT en header)
  })
);

// Responder preflight
app.options("*", cors());

// ---------- Rutas públicas ----------
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Auth PUBLICO
app.use("/api/auth", authRoutes);

// ---------- Middleware de auth para el resto ----------
app.use("/api", requireAuth);

// ---------- Rutas protegidas ----------
app.use("/api/customers", customersRoutes);
app.use("/api/points", pointsRoutes);
app.use("/api/prizes", prizesRoutes);
app.use("/api/users", usersRoutes);

// ---------- 404 ----------
app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

// ---------- Error handler ----------
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});
