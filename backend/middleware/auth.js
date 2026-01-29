const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: "Token requerido." });

  const token = auth.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY", (err, decoded) => {
    if (err) return res.status(403).json({ message: "Token inválido." });
    req.user = {
      id: decoded?.id,
      username: decoded?.username,
      role: decoded?.role || "admin",
    };
    next();
  });
};
