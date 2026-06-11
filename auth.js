const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Base62 character set (0-9, a-z, A-Z)
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Derive a human-friendly 8-character password from an order number using HMAC-SHA256.
// The password is base62-encoded for easy typing.
function derivePassword(orderNo) {
  const secret = process.env.HMAC_SECRET || 'change-me-to-a-random-string';
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(orderNo);
  const digest = hmac.digest(); // 32 bytes

  // Convert 8 bytes of the digest into an 8-char base62 string
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += BASE62[digest[i] % 62];
  }
  return password;
}

// Check user input against all active orders.
// Returns the matching order object, or null if no match.
function verifyPassword(input, orders) {
  for (const order of orders) {
    const expected = derivePassword(order.order_no);
    if (input === expected) {
      return order;
    }
  }
  return null;
}

// Sign a JWT with { order_id } payload, expiring in 1 hour
function signToken(payload) {
  const secret = process.env.JWT_SECRET || 'change-me-to-another-random-string';
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

// Verify a JWT and return its payload, or null if invalid/expired
function verifyToken(token) {
  const secret = process.env.JWT_SECRET || 'change-me-to-another-random-string';
  try {
    return jwt.verify(token, secret);
  } catch (err) {
    return null;
  }
}

module.exports = {
  derivePassword,
  verifyPassword,
  signToken,
  verifyToken
};
