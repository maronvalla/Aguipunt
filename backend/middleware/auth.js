const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  // 🔓 RUTAS PÚBLICAS (NO requieren token)
  const publicRoutes = [
    "/api/auth/login",
    "/api/auth/bootstrap-admin"
  ];

  if (publicRoutes.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Token requerido." });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Token inválido." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token inválido." });
  }
};
