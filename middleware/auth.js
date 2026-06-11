// middleware/auth.js
// Authentication middleware for the birthday blessing server.

// Check X-API-Key header against the configured API_KEY (for bot endpoints)
function requireApiKey(req, res, next) {
  const apiKey = process.env.API_KEY || 'change-me-to-a-third-random-string';
  const token = req.headers['x-api-key'];
  if (!token || token !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Check for a valid JWT token (for /create page access).
// Token can be passed as ?token=xxx query param or body.token field.
// If missing/invalid, redirect to /verify.
function requireToken(req, res, next) {
  const token = req.query.token || (req.body && req.body.token);

  if (!token) {
    return res.redirect('/verify');
  }

  const { verifyToken } = require('../auth');
  const payload = verifyToken(token);

  if (!payload) {
    return res.redirect('/verify?error=expired');
  }

  // Attach the decoded payload for downstream use
  req.orderPayload = payload;
  next();
}

module.exports = { requireApiKey, requireToken };
