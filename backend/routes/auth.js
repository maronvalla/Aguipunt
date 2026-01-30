const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("../db");
const router = express.Router();

const isBcryptHash = (value) => {
  if (!value) return false;
  return typeof value === "string" && /^\$2[aby]\$/.test(value);
};

router.post("/login", (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Usuario y contraseña requeridos." });
    }

    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
      if (err) {
        console.error("Login DB error:", err);
        if (res.headersSent) return;
        return res.status(500).json({ message: "Error al iniciar sesión." });
      }
      if (!user) {
        return res.status(401).json({ message: "Credenciales inválidas." });
      }

      let passwordOk = false;
      if (isBcryptHash(user.password)) {
        passwordOk = bcrypt.compareSync(password, user.password);
      } else {
        passwordOk = user.password === password;
        if (passwordOk) {
          const hashed = bcrypt.hashSync(password, 10);
          db.run("UPDATE users SET password = ? WHERE id = ?", [
            hashed,
            user.id,
          ]);
        }
      }

      if (!passwordOk) {
        return res.status(401).json({ message: "Credenciales inválidas." });
      }

      const role = user.role || "admin";
      const token = jwt.sign(
        { id: user.id, username: user.username, role },
        process.env.JWT_SECRET || "SECRET_KEY",
        {
          expiresIn: "8h",
        }
      );

      res.json({
        message: "Inicio de sesión exitoso.",
        token,
        role,
      });
    });
  } catch (err) {
    console.error("Login error:", err);
    if (res.headersSent) return;
    return res.status(500).json({ message: "Error al iniciar sesión." });
  }
});

// TEMPORAL: eliminar luego
router.post("/bootstrap-admin", (req, res) => {
  const secret = String(req.body?.secret || "");
  if (secret !== String(process.env.BOOTSTRAP_SECRET || "")) {
    return res.status(403).json({ message: "Forbidden." });
  }

  const username = String(req.body?.username || "Admin").trim() || "Admin";
  const password = String(req.body?.password || "");
  if (!password) {
    return res.status(400).json({ message: "Password requerido." });
  }

  try {
    const cols = db
      .prepare("PRAGMA table_info(users)")
      .all()
      .map((r) => r.name);
    if (!cols.includes("role")) {
      db.run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
    }
  } catch (err) {
    return res.status(500).json({ message: "Error al preparar usuario." });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const existing = db.get("SELECT id FROM users WHERE username = ?", [username]);
  if (existing?.id) {
    db.run(
      "UPDATE users SET password = ?, role = 'admin' WHERE id = ?",
      [hashed, existing.id],
      (err) => {
        if (err) {
          return res.status(500).json({ message: "Error al actualizar." });
        }
        return res.json({ ok: true, username });
      }
    );
  } else {
    db.run(
      "INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')",
      [username, hashed],
      (err) => {
        if (err) {
          return res.status(500).json({ message: "Error al crear." });
        }
        return res.json({ ok: true, username });
      }
    );
  }
});

module.exports = router;
