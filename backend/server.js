// backend/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const customersRoutes = require("./routes/customers");
const pointsRoutes = require("./routes/points");
const prizesRoutes = require("./routes/prizes");
const usersRoutes = require("./routes/users");

const requireAuth = require("./middleware/auth");

const app = express();

// ---------- Middlewares base ----------
app.use(express.json());

// ---------- CORS (una sola vez) ----------
const envOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const devOrigins = ["http://localhost:5173", "http://localhost:5174"];
const allowedOrigins = envOrigins.length ? envOrigins : devOrigins;

const corsOptions = {
  origin: (origin, cb) => {
    // Permitir requests sin Origin (curl/postman/healthchecks)
    if (!origin) return cb(null, true);

    // Permitir solo los orígenes aprobados
    if (allowedOrigins.includes(origin)) return cb(null, true);

    // NO tirar error (evita comportamientos raros/restarts). Simplemente bloquear.
    return cb(null, false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false, // JWT por header, no cookies
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ---------- Rutas públicas ----------
app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true, time: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);

// ---------- Auth para el resto ----------
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