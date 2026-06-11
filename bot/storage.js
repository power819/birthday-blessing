// bot/storage.js
// Lightweight SQLite store for tracking which orders the bot has already processed.
// Separate from the Website database — bot keeps its own state.

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, 'storage');
const DB_PATH = path.join(DB_DIR, 'processed.db');

let db;

function getDb() {
  if (!db) {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS processed_orders (
        order_no  TEXT PRIMARY KEY,
        account   TEXT NOT NULL,
        password  TEXT,
        status    TEXT DEFAULT 'replied',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }
  return db;
}

function isProcessed(orderNo) {
  return !!getDb().prepare('SELECT 1 FROM processed_orders WHERE order_no = ?').get(orderNo);
}

function markProcessed(orderNo, account, password) {
  getDb().prepare(
    'INSERT OR IGNORE INTO processed_orders (order_no, account, password) VALUES (?, ?, ?)'
  ).run(orderNo, account, password);
}

function getProcessedCount() {
  return getDb().prepare('SELECT COUNT(*) as count FROM processed_orders').get().count;
}

module.exports = { isProcessed, markProcessed, getProcessedCount };
