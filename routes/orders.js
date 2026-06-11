// routes/orders.js
// Bot API endpoints for managing Xianyu orders.
// Protected by requireApiKey middleware.

const express = require('express');
const router = express.Router();
const { requireApiKey } = require('../middleware/auth');
const { createOrder, getAllOrdersForPasswordCheck } = require('../db');
const { derivePassword } = require('../auth');

// POST /api/orders — Create an order record and return the derived password.
// Idempotent: if the order_no already exists, returns the existing record.
router.post('/', requireApiKey, (req, res) => {
  const { order_no, account } = req.body;

  if (!order_no || !account) {
    return res.status(400).json({ error: 'Missing required fields: order_no, account' });
  }

  try {
    const order = createOrder(order_no, account);
    const password = derivePassword(order.order_no);

    res.json({
      id: order.id,
      order_no: order.order_no,
      password,
      status: order.status
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// GET /api/orders/pending — List all pending orders with their passwords.
// Useful for the bot to show active orders.
router.get('/pending', requireApiKey, (req, res) => {
  try {
    const orders = getAllOrdersForPasswordCheck();
    const result = orders.map(order => ({
      id: order.id,
      order_no: order.order_no,
      account: order.account,
      password: derivePassword(order.order_no),
      status: order.status,
      created_at: order.created_at
    }));
    res.json({ orders: result });
  } catch (err) {
    console.error('List orders error:', err);
    res.status(500).json({ error: 'Failed to list orders' });
  }
});

module.exports = router;
