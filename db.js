const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'blessings.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

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

// Migration for existing DBs
try { db.exec('ALTER TABLE blessings ADD COLUMN voice TEXT'); } catch (e) {}

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

function createBlessing({ name, photo, voice, template, message, sender, birthday }) {
  let id;
  do { id = generateId(); } while (db.prepare('SELECT 1 FROM blessings WHERE id = ?').get(id));
  db.prepare(`
    INSERT INTO blessings (id, name, photo, voice, template, message, sender, birthday)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, photo || null, voice || null, template || 'default', message || null, sender || null, birthday || null);
  return id;
}

function getBlessing(id) {
  return db.prepare('SELECT * FROM blessings WHERE id = ?').get(id);
}

module.exports = { createBlessing, getBlessing };
