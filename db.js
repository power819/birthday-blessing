const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'blessings.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

// Create table
db.exec(`
  CREATE TABLE IF NOT EXISTS blessings (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    photo      TEXT,
    voice      TEXT,
    template   TEXT DEFAULT 'default',
    message    TEXT,
    sender     TEXT,
    birthday   TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Add voice column if not exists (migration for existing DB)
try {
  db.exec('ALTER TABLE blessings ADD COLUMN voice TEXT');
} catch (e) {
  // Column already exists, ignore
}

// ---- Orders table (Xianyu integration) ----
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id         TEXT PRIMARY KEY,
    order_no   TEXT NOT NULL UNIQUE,
    account    TEXT NOT NULL,
    status     TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Create an order record
function createOrder(orderNo, account) {
  const id = require('crypto').randomBytes(4).toString('hex');
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO orders (id, order_no, account, status, created_at)
    VALUES (?, ?, ?, 'pending', datetime('now'))
  `);
  stmt.run(id, orderNo, account);
  // Return the order (either newly inserted or existing)
  return db.prepare('SELECT id, order_no, account, status FROM orders WHERE order_no = ?').get(orderNo);
}

// Get an order by its order number
function getOrderByOrderNo(orderNo) {
  return db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
}

// Get all orders that are still valid for password verification (pending or replied)
function getAllOrdersForPasswordCheck() {
  return db.prepare("SELECT * FROM orders WHERE status IN ('pending', 'replied')").all();
}

// Mark an order as replied (customer has created a blessing)
function markOrderReplied(id) {
  db.prepare("UPDATE orders SET status = 'replied' WHERE id = ? AND status = 'pending'").run(id);
}

// Expire orders older than N hours
function expireOldOrders(hours = 24) {
  const result = db.prepare(`
    UPDATE orders SET status = 'expired'
    WHERE status IN ('pending', 'replied')
    AND datetime(created_at, '+' || ? || ' hours') < datetime('now')
  `).run(hours);
  return result.changes;
}

// Generate a unique 8-character ID
function generateId() {
  return crypto.randomBytes(4).toString('hex'); // 8 hex chars
}

// Insert a new blessing
function createBlessing({ name, photo, voice, template, message, sender, birthday }) {
  let id;
  do {
    id = generateId();
  } while (db.prepare('SELECT 1 FROM blessings WHERE id = ?').get(id));

  const stmt = db.prepare(`
    INSERT INTO blessings (id, name, photo, voice, template, message, sender, birthday)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, name, photo || null, voice || null, template || 'default', message || null, sender || null, birthday || null);
  return id;
}

// Get a blessing by ID
function getBlessing(id) {
  return db.prepare('SELECT * FROM blessings WHERE id = ?').get(id);
}

module.exports = {
  createBlessing,
  getBlessing,
  createOrder,
  getOrderByOrderNo,
  getAllOrdersForPasswordCheck,
  markOrderReplied,
  expireOldOrders
};
