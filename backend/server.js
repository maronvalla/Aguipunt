// backend/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const customersRoutes = require("./routes/customers");
const pointsRoutes = require("./routes/points");
const prizesRoutes = require("./routes/prizes");
const usersRoutes = require("./routes/users"); // si existe
// const reportsRoutes = require("./routes/reports"); // si existe
// const transactionsRoutes = require("./routes/transactions"); // si existe

const requireAuth = require("./middleware/auth"); // tu middleware JWT

const app = express();

// ---------- Middlewares base ----------
app.use(express.json());

// CORS: en prod poné el dominio del frontend en CORS_ORIGIN (coma-separado si son varios)
const corsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// En dev, permitir localhost vite por defecto
const devOrigins = ["http://localhost:5173", "http://localhost:5174"];
const allowedOrigins = corsOrigins.length ? corsOrigins : devOrigins;

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

import cors from "cors";

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://aguipunt.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());


// ---------- Rutas públicas ----------
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Auth debe ser PUBLICO (NO requireAuth acá)
app.use("/api/auth", authRoutes);

// ---------- Middleware de auth para el resto ----------
// Todo lo que esté después de esta línea requiere token
app.use("/api", requireAuth);

// ---------- Rutas protegidas ----------
app.use("/api/customers", customersRoutes);
app.use("/api/points", pointsRoutes);
app.use("/api/prizes", prizesRoutes);
app.use("/api/users", usersRoutes);

// Si tenés estas rutas, descomentá:
// app.use("/api/reports", reportsRoutes);
// app.use("/api/transactions", transactionsRoutes);

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
