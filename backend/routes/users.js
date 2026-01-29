const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

const normalizeRole = (role) => {
  if (role === "admin" || role === "cashier") return role;
  return "cashier";
};

router.get("/users", requireRole("admin"), (req, res) => {
  db.all("SELECT id, username, role FROM users ORDER BY id ASC", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Error al listar usuarios." });
    }
    res.json(rows || []);
  });
});

router.post("/users", requireRole("admin"), (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const role = normalizeRole(String(req.body?.role || "").trim());

  if (!username || username.length < 3 || username.length > 30) {
    return res
      .status(400)
      .json({ message: "Usuario invÃ¡lido (3-30 caracteres)." });
  }
  if (!password || password.length < 4) {
    return res
      .status(400)
      .json({ message: "ContraseÃ±a invÃ¡lida (mÃ­nimo 4)." });
  }

  db.get("SELECT id FROM users WHERE username = ?", [username], (err, existing) => {
    if (err) {
      return res.status(500).json({ message: "Error al validar usuario." });
    }
    if (existing) {
      return res.status(409).json({ message: "Usuario ya existe." });
    }

    const hashed = bcrypt.hashSync(password, 10);
    db.run(
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
      [username, hashed, role],
      function () {
        res.status(201).json({ id: this.lastID, username, role });
      }
    );
  });
});

router.patch("/users/:id/password", requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  const password = String(req.body?.password || "");

  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "ID invÃ¡lido." });
  }
  if (!password || password.length < 4) {
    return res
      .status(400)
      .json({ message: "ContraseÃ±a invÃ¡lida (mÃ­nimo 4)." });
  }

  const hashed = bcrypt.hashSync(password, 10);
  db.run(
    "UPDATE users SET password = ? WHERE id = ?",
    [hashed, id],
    function () {
      if (this.changes === 0) {
        return res.status(404).json({ message: "Usuario no encontrado." });
      }
      res.json({ ok: true });
    }
  );
});

router.delete("/users/:id", requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "ID invÃ¡lido." });
  }

  db.run("DELETE FROM users WHERE id = ?", [id], function () {
    if (this.changes === 0) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }
    res.json({ ok: true });
  });
});

module.exports = router;
