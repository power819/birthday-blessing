// routes/verify.js
// Password verification flow for Xianyu customers.

const express = require('express');
const router = express.Router();
const { verifyPassword, signToken } = require('../auth');
const { getAllOrdersForPasswordCheck } = require('../db');

// GET /verify — Render the password input page
router.get('/', (req, res) => {
  res.render('verify', {
    error: req.query.error === 'expired'
      ? '验证已过期，请重新输入密钥'
      : (req.query.error || null)
  });
});

// POST /api/verify — Check the submitted password against active orders
router.post('/', (req, res) => {
  const { password } = req.body;

  if (!password || !password.trim()) {
    return res.status(400).json({ error: '请输入密钥' });
  }

  try {
    const orders = getAllOrdersForPasswordCheck();
    if (orders.length === 0) {
      return res.status(400).json({ error: '当前没有可用的订单，请联系客服' });
    }

    const matched = verifyPassword(password.trim(), orders);
    if (!matched) {
      return res.status(400).json({ error: '密钥不正确，请检查后重试' });
    }

    const token = signToken({ order_id: matched.id, order_no: matched.order_no });
    res.json({ valid: true, token, redirect: '/create' });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: '验证失败，请稍后重试' });
  }
});

module.exports = router;
