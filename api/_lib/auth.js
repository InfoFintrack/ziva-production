const jwt = require('jsonwebtoken');

/**
 * Verifies the Bearer token in the Authorization header.
 * Returns the decoded payload on success, or sends a 401 and returns null.
 */
function authenticateToken(req, res) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    return null;
  }

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    return null;
  }
}

/**
 * Role-checking middleware factory.
 * Usage (Express): router.use(requireRole('Admin', 'Accounts'))
 * In serverless handlers use inline: if (!roles.includes(user.role)) ...
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  next();
};

module.exports = { authenticateToken, requireRole };
