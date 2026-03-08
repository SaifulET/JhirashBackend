// src/middlewares/requireAuth.js
import jwt from "jsonwebtoken";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access_secret";

export function requireAuth(req, res, next) {
  try {

    const header = req.headers.authorization || "";
    
    const [type, token] = header.split(" ");

    if (type !== "Bearer" || !token) {
      return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing token" } });
    }
    

    const payload = jwt.verify(token, JWT_ACCESS_SECRET);
    req.auth = { userId: payload.sub, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid token" } });
  }
}