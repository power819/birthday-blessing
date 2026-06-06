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
    template   TEXT DEFAULT 'default',
    message    TEXT,
    sender     TEXT,
    birthday   TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Generate a unique 8-character ID
function generateId() {
  return crypto.randomBytes(4).toString('hex'); // 8 hex chars
}

// Insert a new blessing
function createBlessing({ name, photo, template, message, sender, birthday }) {
  let id;
  // Ensure unique ID (collision is extremely unlikely but check anyway)
  do {
    id = generateId();
  } while (db.prepare('SELECT 1 FROM blessings WHERE id = ?').get(id));

  const stmt = db.prepare(`
    INSERT INTO blessings (id, name, photo, template, message, sender, birthday)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, name, photo || null, template || 'default', message || null, sender || null, birthday || null);
  return id;
}

// Get a blessing by ID
function getBlessing(id) {
  return db.prepare('SELECT * FROM blessings WHERE id = ?').get(id);
}

module.exports = { createBlessing, getBlessing };
