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

module.exports = { authenticateToken };
