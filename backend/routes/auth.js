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
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Usuario y contraseña requeridos." });
  }

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) {
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
        db.run("UPDATE users SET password = ? WHERE id = ?", [hashed, user.id]);
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
});

module.exports = router;
