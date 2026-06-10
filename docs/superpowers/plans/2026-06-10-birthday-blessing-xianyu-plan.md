# Birthday Blessing + 闲鱼集成 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a birthday blessing generator website with Xianyu (闲鱼) auto-reply integration — Bot monitors orders, derives passwords via HMAC, auto-replies via Playwright; customers verify passwords on the website to unlock blessing creation.

**Architecture:** Two processes on Railway — Express Website (port 3000) serving EJS templates + REST API, and a Playwright Bot (separate process) polling Xianyu for new orders and calling the Website API internally. SQLite via better-sqlite3 for all persistence.

**Tech Stack:** Node.js, Express, EJS, better-sqlite3, Playwright, JWT (jsonwebtoken), HMAC (node crypto), qrcode, multer, js-yaml

**Spec:** docs/superpowers/specs/2026-06-10-xianyu-integration-design.md

---

## File Structure

```
birthday-blessing/
├── server.js                 # Website entry point
├── db.js                     # Database init + queries
├── auth.js                   # HMAC password + JWT token utilities
├── package.json
├── .env.example
├── bot/
│   ├── bot.js                # Bot entry point
│   ├── config.yaml           # Account config
│   ├── monitor.js            # Order polling loop
│   ├── xianyu.js             # Xianyu Playwright page actions
│   └── storage.js            # Bot-side SQLite for processed orders
├── routes/
│   ├── orders.js             # Bot API routes
│   ├── verify.js             # Password verification routes
│   ├── create.js             # Blessing creation routes
│   └── blessing.js           # Blessing display routes
├── middleware/
│   └── auth.js               # API key + JWT auth middleware
├── public/
│   ├── css/
│   │   └── style.css         # All styles
│   ├── js/
│   │   └── verify.js         # Client-side verify page logic
│   └── uploads/              # Photo uploads (gitignored)
├── views/
│   ├── index.ejs             # Landing page
│   ├── verify.ejs            # Password verification page
│   ├── create.ejs            # Blessing creation form
│   ├── blessing.ejs          # Blessing display page
│   └── 404.ejs               # Not found
└── tests/
    ├── auth.test.js           # HMAC + JWT unit tests
    ├── db.test.js             # Database query tests
    ├── api.test.js            # API endpoint integration tests
    └── helpers.js             # Test utilities
```

**Design decisions:**
- `auth.js` holds both HMAC password derivation and JWT token signing — they're related auth concerns.
- `routes/` split by domain (orders, verify, create, blessing) so each file stays focused and short.
- `middleware/auth.js` handles both API key (for Bot routes) and JWT (for create page access).
- Bot has its own `storage.js` (local SQLite) for processed order tracking, separate from the Website database.
- CSS is a single file — the app has ~5 pages, all sharing the same birthday theme.

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `.env.example`, `.gitignore`
- Create: `public/uploads/.gitkeep`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "birthday-blessing",
  "version": "1.0.0",
  "description": "Birthday blessing generator with Xianyu integration",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "bot": "node bot/bot.js",
    "test": "node --test tests/*.test.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "ejs": "^3.1.10",
    "express": "^4.21.0",
    "jsonwebtoken": "^9.0.2",
    "js-yaml": "^4.1.0",
    "multer": "^1.4.5-lts.1",
    "playwright": "^1.48.0",
    "qrcode": "^1.5.4"
  }
}
```

Run: `cd C:\Users\罗炜\projects\birthday-blessing && npm install`

- [ ] **Step 2: Create .env.example**

```bash
PORT=3000
HMAC_SECRET=change-me-to-a-random-string
JWT_SECRET=change-me-to-another-random-string
API_KEY=change-me-to-a-third-random-string
WEBSITE_URL=http://localhost:3000
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
.env
public/uploads/*
!public/uploads/.gitkeep
bot/cookies/*
!bot/cookies/.gitkeep
bot/storage/
*.db
```

Run: `New-Item -ItemType File -Force "C:\Users\罗炜\projects\birthday-blessing\public\uploads\.gitkeep"` and `New-Item -ItemType File -Force "C:\Users\罗炜\projects\birthday-blessing\bot\cookies\.gitkeep"`

- [ ] **Step 4: Copy .env.example to .env**

Run: `Copy-Item ".env.example" ".env"`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore public/uploads/.gitkeep bot/cookies/.gitkeep
git commit -m "chore: scaffold project with dependencies"
```

---

### Task 2: Database setup

**Files:**
- Create: `db.js`
- Create: `tests/db.test.js`
- Create: `tests/helpers.js`

- [ ] **Step 1: Write the failing test**

Create `tests/helpers.js`:

```js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function testDbPath() {
  return path.join(__dirname, '..', 'test.db');
}

function createTestDb() {
  const dbPath = testDbPath();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return db;
}

function cleanupTestDb() {
  const dbPath = testDbPath();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}

module.exports = { testDbPath, createTestDb, cleanupTestDb };
```

Create `tests/db.test.js`:

```js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { createTestDb, cleanupTestDb } = require('./helpers');

// We'll import db functions after creating them
let db;

describe('Database', () => {
  before(() => {
    db = createTestDb();
  });

  after(() => {
    db.close();
    cleanupTestDb();
  });

  it('should initialize blessings table', () => {
    // This will fail until db.js is created
    const { initDb } = require('../db');
    initDb(db);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all();
    const names = tables.map(t => t.name);
    assert.ok(names.includes('blessings'));
    assert.ok(names.includes('orders'));
  });
});
```

Run: `npm test`
Expected: FAIL — `Cannot find module '../db'`

- [ ] **Step 2: Write db.js**

```js
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initDb(db);
  }
  return db;
}

function initDb(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id          TEXT PRIMARY KEY,
      order_no    TEXT NOT NULL UNIQUE,
      account     TEXT NOT NULL,
      status      TEXT DEFAULT 'pending',
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blessings (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      photo       TEXT,
      template    TEXT DEFAULT 'default',
      message     TEXT,
      sender      TEXT,
      birthday    TEXT,
      order_id    TEXT REFERENCES orders(id),
      verified    INTEGER DEFAULT 0,
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_blessings_order_id ON blessings(order_id);
  `);
}

// --- Order queries ---

function generateId(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function createOrder(orderNo, account) {
  const db = getDb();
  const id = generateId();
  const stmt = db.prepare(
    'INSERT INTO orders (id, order_no, account, status, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(id, orderNo, account, 'pending', new Date().toISOString());
  return { id, order_no: orderNo, account, status: 'pending' };
}

function getOrderByOrderNo(orderNo) {
  const db = getDb();
  return db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
}

function getAllOrdersForPasswordCheck() {
  const db = getDb();
  // Return all orders that are pending or replied (i.e., still within validity window)
  return db.prepare(
    "SELECT * FROM orders WHERE status IN ('pending', 'replied')"
  ).all();
}

function markOrderReplied(id) {
  const db = getDb();
  db.prepare("UPDATE orders SET status = 'replied' WHERE id = ?").run(id);
}

function markOrderExpired(id) {
  const db = getDb();
  db.prepare("UPDATE orders SET status = 'expired' WHERE id = ?").run(id);
}

function expireOldOrders(hours = 24) {
  const db = getDb();
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return db.prepare(
    "UPDATE orders SET status = 'expired' WHERE status = 'pending' AND created_at < ?"
  ).run(cutoff);
}

// --- Blessing queries ---

function createBlessing(data) {
  const db = getDb();
  const id = generateId();
  const { name, photo, template, message, sender, birthday, order_id } = data;
  const stmt = db.prepare(
    `INSERT INTO blessings (id, name, photo, template, message, sender, birthday, order_id, verified, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    id, name, photo || null, template || 'default', message || null,
    sender || null, birthday || null, order_id || null, order_id ? 1 : 0,
    new Date().toISOString()
  );
  return getBlessingById(id);
}

function getBlessingById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM blessings WHERE id = ?').get(id);
}

function getBlessingsByOrderId(orderId) {
  const db = getDb();
  return db.prepare('SELECT * FROM blessings WHERE order_id = ?').all();
}

module.exports = {
  getDb, initDb,
  createOrder, getOrderByOrderNo, getAllOrdersForPasswordCheck,
  markOrderReplied, markOrderExpired, expireOldOrders,
  createBlessing, getBlessingById, getBlessingsByOrderId,
  generateId
};
```

- [ ] **Step 3: Run test — verify it passes**

Run: `npm test`
Expected: PASS (1 test — tables exist)

- [ ] **Step 4: Add query-level tests**

Append to `tests/db.test.js`:

```js
describe('Order queries', () => {
  let db;

  before(() => {
    db = createTestDb();
    const { initDb } = require('../db');
    initDb(db);
  });

  after(() => {
    db.close();
    cleanupTestDb();
  });

  it('createOrder should insert and return order', () => {
    const { createOrder } = require('../db');
    const order = createOrder('1234567890', 'account-a');
    assert.equal(order.order_no, '1234567890');
    assert.equal(order.status, 'pending');
    assert.ok(order.id.length === 8);
  });

  it('getOrderByOrderNo should find existing order', () => {
    const { getOrderByOrderNo } = require('../db');
    const order = getOrderByOrderNo('1234567890');
    assert.ok(order);
    assert.equal(order.account, 'account-a');
  });

  it('getAllOrdersForPasswordCheck should return pending/replied orders', () => {
    const { getAllOrdersForPasswordCheck } = require('../db');
    const orders = getAllOrdersForPasswordCheck();
    assert.ok(orders.length >= 1);
  });

  it('expireOldOrders should expire old orders', () => {
    const { expireOldOrders, getAllOrdersForPasswordCheck } = require('../db');
    // Expire orders older than 0 hours (all)
    expireOldOrders(0);
    const orders = getAllOrdersForPasswordCheck();
    assert.equal(orders.length, 0, 'all orders should be expired');
  });
});

describe('Blessing queries', () => {
  let db;

  before(() => {
    db = createTestDb();
    const { initDb } = require('../db');
    initDb(db);
  });

  after(() => {
    db.close();
    cleanupTestDb();
  });

  it('createBlessing should insert and return blessing', () => {
    const { createBlessing, createOrder } = require('../db');
    const order = createOrder('9876543210', 'account-b');
    const blessing = createBlessing({
      name: '小明',
      template: 'warm',
      order_id: order.id
    });
    assert.equal(blessing.name, '小明');
    assert.equal(blessing.template, 'warm');
    assert.equal(blessing.verified, 1);
  });

  it('getBlessingById should return blessing', () => {
    const { getBlessingById, createBlessing } = require('../db');
    const b = createBlessing({ name: '小红' });
    const found = getBlessingById(b.id);
    assert.equal(found.name, '小红');
  });

  it('getBlessingById should return undefined for missing id', () => {
    const { getBlessingById } = require('../db');
    assert.equal(getBlessingById('nonexistent'), undefined);
  });
});
```

Run: `npm test`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add db.js tests/db.test.js tests/helpers.js
git commit -m "feat: add database layer with orders and blessings tables"
```

---

### Task 3: Auth utilities (HMAC + JWT)

**Files:**
- Create: `auth.js`
- Create: `tests/auth.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/auth.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert');

process.env.HMAC_SECRET = 'test-hmac-secret';
process.env.JWT_SECRET = 'test-jwt-secret';

describe('Auth — HMAC', () => {
  it('derivePassword should produce 8-char base62 string', () => {
    const { derivePassword } = require('../auth');
    const pw = derivePassword('order-123');
    assert.equal(pw.length, 8);
    assert.ok(/^[A-Za-z0-9]{8}$/.test(pw), 'should be 8-char base62');
  });

  it('derivePassword should be deterministic', () => {
    const { derivePassword } = require('../auth');
    const pw1 = derivePassword('order-123');
    const pw2 = derivePassword('order-123');
    assert.equal(pw1, pw2);
  });

  it('verifyPassword should match correct password', () => {
    const { derivePassword, verifyPassword } = require('../auth');
    const pw = derivePassword('order-456');
    const orders = [{ order_no: 'order-456', id: 'id1', created_at: new Date().toISOString() }];
    const result = verifyPassword(pw, orders);
    assert.ok(result);
    assert.equal(result.order_no, 'order-456');
  });

  it('verifyPassword should reject wrong password', () => {
    const { verifyPassword } = require('../auth');
    const orders = [{ order_no: 'order-789', id: 'id1', created_at: new Date().toISOString() }];
    const result = verifyPassword('wrongpw', orders);
    assert.equal(result, null);
  });

  it('verifyPassword should reject expired order (24h)', () => {
    const { derivePassword, verifyPassword } = require('../auth');
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const pw = derivePassword('old-order');
    const orders = [{ order_no: 'old-order', id: 'id1', created_at: oldDate }];
    const result = verifyPassword(pw, orders);
    assert.equal(result, null);
  });
});

describe('Auth — JWT', () => {
  it('signToken should produce a JWT string', () => {
    const { signToken } = require('../auth');
    const token = signToken({ order_id: 'abc123' });
    assert.ok(typeof token === 'string');
    assert.ok(token.split('.').length === 3);
  });

  it('verifyToken should decode valid token', () => {
    const { signToken, verifyToken } = require('../auth');
    const token = signToken({ order_id: 'abc123' });
    const payload = verifyToken(token);
    assert.equal(payload.order_id, 'abc123');
  });

  it('verifyToken should return null for expired token', () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ order_id: 'abc' }, 'test-jwt-secret', { expiresIn: '0s' });
    const { verifyToken } = require('../auth');
    const result = verifyToken(token);
    assert.equal(result, null);
  });
});
```

Run: `npm test`
Expected: FAIL — `Cannot find module '../auth'`

- [ ] **Step 2: Write auth.js**

```js
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const HMAC_SECRET = process.env.HMAC_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = '1h';
const PASSWORD_VALIDITY_HOURS = 24;

// HMAC-SHA256 → base62, first 8 chars
function derivePassword(orderNo) {
  const hmac = crypto.createHmac('sha256', HMAC_SECRET);
  hmac.update(orderNo);
  const hex = hmac.digest('hex');
  return hexToBase62(hex).slice(0, 8);
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function hexToBase62(hex) {
  let num = BigInt('0x' + hex);
  if (num === 0n) return '0';
  let result = '';
  while (num > 0n) {
    result = BASE62[Number(num % 62n)] + result;
    num = num / 62n;
  }
  return result;
}

// Verify password against all active orders
// Returns the matching order object, or null
function verifyPassword(input, orders) {
  const inputClean = input.replace(/\s/g, '').toUpperCase();
  const now = Date.now();
  const validityMs = PASSWORD_VALIDITY_HOURS * 60 * 60 * 1000;

  for (const order of orders) {
    const created = new Date(order.created_at).getTime();
    if (now - created > validityMs) continue;  // expired

    const expected = derivePassword(order.order_no);
    if (expected.toUpperCase() === inputClean) {
      return order;
    }
  }
  return null;
}

// JWT for create-page session
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

module.exports = {
  derivePassword,
  verifyPassword,
  signToken,
  verifyToken,
  PASSWORD_VALIDITY_HOURS
};
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS (all auth tests + db tests)

- [ ] **Step 4: Commit**

```bash
git add auth.js tests/auth.test.js
git commit -m "feat: add HMAC password derivation and JWT auth utilities"
```

---

### Task 4: Express server skeleton + middleware

**Files:**
- Create: `server.js`
- Create: `middleware/auth.js`

- [ ] **Step 1: Write auth middleware**

Create `middleware/auth.js`:

```js
const { verifyToken } = require('../auth');

const API_KEY = process.env.API_KEY;

// Protects Bot API routes — requires X-API-Key header
function requireApiKey(req, res, next) {
  const key = req.get('X-API-Key');
  if (!key || key !== API_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// Protects create page — requires ?token=xxx query param
function requireToken(req, res, next) {
  const token = req.query.token || req.body?.token;
  if (!token) {
    return res.redirect(302, '/verify');
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).render('verify', {
      error: '页面已过期，请重新验证',
      websiteUrl: process.env.WEBSITE_URL || ''
    });
  }
  req.orderId = payload.order_id;
  next();
}

module.exports = { requireApiKey, requireToken };
```

- [ ] **Step 2: Write server.js skeleton**

```js
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes (will be added in subsequent tasks)
app.get('/', (req, res) => {
  res.render('index', { websiteUrl: process.env.WEBSITE_URL || '' });
});

// 404
app.use((req, res) => {
  res.status(404).render('404');
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('404', { message: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`Website running on port ${PORT}`);
});

module.exports = app;
```

- [ ] **Step 3: Create stub views so server boots**

Create `views/index.ejs`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>生日祝福生成器</title>
</head>
<body>
  <h1>🎂 生日祝福生成器</h1>
  <p>已有密钥？<a href="/verify">去验证</a></p>
</body>
</html>
```

Create `views/404.ejs`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>404</title></head>
<body><h1>页面未找到</h1><a href="/">返回首页</a></body>
</html>
```

Create `views/verify.ejs` (stub):

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>验证密钥</title></head>
<body><h1>验证密钥</h1></body>
</html>
```

Create `views/create.ejs` (stub):

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>创建祝福</title></head>
<body><h1>创建祝福</h1></body>
</html>
```

Create `views/blessing.ejs` (stub):

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>生日祝福</title></head>
<body><h1>🎂 生日快乐！</h1></body>
</html>
```

- [ ] **Step 4: Boot test**

Run: `node server.js` (in background, then curl)
Run: `curl http://localhost:3000/`
Expected: Returns index page HTML with "生日祝福生成器"

Stop server after confirming.

- [ ] **Step 5: Commit**

```bash
git add server.js middleware/auth.js views/index.ejs views/404.ejs views/verify.ejs views/create.ejs views/blessing.ejs
git commit -m "feat: add Express server skeleton with EJS views and auth middleware"
```

---

### Task 5: Bot API routes (orders)

**Files:**
- Create: `routes/orders.js`
- Modify: `server.js` (add routes)

- [ ] **Step 1: Write orders route**

Create `routes/orders.js`:

```js
const express = require('express');
const router = express.Router();
const { requireApiKey } = require('../middleware/auth');
const { createOrder, getOrderByOrderNo } = require('../db');
const { derivePassword } = require('../auth');

// POST /api/orders — Bot calls this when it detects a new order
router.post('/', requireApiKey, (req, res) => {
  const { order_no, account } = req.body;

  if (!order_no || !account) {
    return res.status(400).json({ error: 'order_no and account are required' });
  }

  // Idempotent: if order already exists, return existing password
  let order = getOrderByOrderNo(order_no);
  if (order) {
    return res.json({
      id: order.id,
      order_no: order.order_no,
      password: derivePassword(order.order_no),
      status: order.status
    });
  }

  order = createOrder(order_no, account);
  const password = derivePassword(order_no);

  res.status(201).json({
    id: order.id,
    order_no: order.order_no,
    password,
    status: order.status
  });
});

// GET /api/orders/pending — Bot checks which orders still need reply
router.get('/pending', requireApiKey, (req, res) => {
  const { getAllOrdersForPasswordCheck } = require('../db');
  const orders = getAllOrdersForPasswordCheck();
  res.json(orders.map(o => ({
    id: o.id,
    order_no: o.order_no,
    account: o.account,
    password: derivePassword(o.order_no),
    status: o.status,
    created_at: o.created_at
  })));
});

module.exports = router;
```

- [ ] **Step 2: Mount routes in server.js**

Edit `server.js`, add after the `express.urlencoded` line:

```js
// Mount routes
const ordersRouter = require('./routes/orders');
app.use('/api/orders', ordersRouter);
```

- [ ] **Step 3: Write API test**

Create `tests/api.test.js`:

```js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

// Set env before requiring app
process.env.HMAC_SECRET = 'test-hmac-secret';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.API_KEY = 'test-api-key';
process.env.DB_PATH = require('path').join(__dirname, '..', 'test.db');
const { cleanupTestDb, createTestDb } = require('./helpers');

let app, db;

describe('API — /api/orders', () => {
  before(() => {
    db = createTestDb();
    const { initDb } = require('../db');
    initDb(db);
    app = require('../server');
  });

  after(() => {
    db.close();
    cleanupTestDb();
  });

  function fetch(path, options = {}) {
    const http = require('http');
    return new Promise((resolve, reject) => {
      const url = new URL(path, 'http://localhost:3000');
      const req = http.request(url, {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...options.headers }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(body), headers: res.headers }); }
          catch { resolve({ status: res.statusCode, body, headers: res.headers }); }
        });
      });
      req.on('error', reject);
      if (options.body) req.write(JSON.stringify(options.body));
      req.end();
    });
  }

  it('POST /api/orders without API key should return 403', async () => {
    const res = await fetch('/api/orders', {
      method: 'POST',
      body: { order_no: '123', account: 'test' }
    });
    assert.equal(res.status, 403);
  });

  it('POST /api/orders with API key should create order', async () => {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'X-API-Key': 'test-api-key' },
      body: { order_no: 'order-001', account: 'account-a' }
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.password);
    assert.equal(res.body.password.length, 8);
  });

  it('POST /api/orders with same order_no should be idempotent', async () => {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'X-API-Key': 'test-api-key' },
      body: { order_no: 'order-001', account: 'account-a' }
    });
    assert.equal(res.status, 200);
  });

  it('GET /api/orders/pending should return pending orders with passwords', async () => {
    const res = await fetch('/api/orders/pending', {
      headers: { 'X-API-Key': 'test-api-key' }
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});
```

Run: `npm test`
Expected: API tests depend on server — may need to start server separately. Adjust approach: use supertest or test routes in isolation.

**Note:** For simplicity, remove the server-level test, instead test the route handler via direct require. Rewrite test file:

Create `tests/api.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert');

process.env.API_KEY = 'test-api-key';
process.env.HMAC_SECRET = 'test-hmac-secret';

const { cleanupTestDb, createTestDb } = require('./helpers');

describe('API — Orders route', () => {
  let db;

  function mockReq(body = {}, headers = {}) {
    return {
      body,
      get: (name) => headers[name] || null
    };
  }

  function mockRes() {
    const res = {};
    res.statusCode = 200;
    res._json = null;
    res.status = function(code) { this.statusCode = code; return this; };
    res.json = function(data) { this._json = data; return this; };
    return res;
  }

  before(() => {
    db = createTestDb();
    const { initDb } = require('../db');
    initDb(db);
  });

  after(() => {
    db.close();
    cleanupTestDb();
  });

  it('should reject request without API key', () => {
    const { requireApiKey } = require('../middleware/auth');
    const req = mockReq();
    const res = mockRes();
    const next = () => {};
    requireApiKey(req, res, next);
    assert.equal(res.statusCode, 403);
    assert.equal(res._json.error, 'Forbidden');
  });

  it('should create order with valid request', () => {
    const router = require('../routes/orders');
    // Simulate POST handler
    const handler = router.stack.find(l => l.route && l.route.methods.post).route.stack[1].handle;
    const req = mockReq({ order_no: 'test-001', account: 'account-a' });
    const res = mockRes();
    handler(req, res);
    assert.equal(res.statusCode, 201);
    assert.ok(res._json.password);
    assert.equal(res._json.password.length, 8);
  });
});
```

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add routes/orders.js tests/api.test.js server.js
git commit -m "feat: add Bot API routes for order creation and pending queries"
```

---

### Task 6: Verify routes (password verification)

**Files:**
- Create: `routes/verify.js`
- Modify: `server.js` (add verify routes)

- [ ] **Step 1: Write verify route**

Create `routes/verify.js`:

```js
const express = require('express');
const router = express.Router();
const { getAllOrdersForPasswordCheck } = require('../db');
const { verifyPassword, signToken } = require('../auth');

// GET /verify — password input page
router.get('/', (req, res) => {
  res.render('verify', {
    error: null,
    websiteUrl: process.env.WEBSITE_URL || ''
  });
});

// POST /api/verify — check password
router.post('/', (req, res) => {
  const { password } = req.body;

  if (!password || !password.trim()) {
    return res.status(400).json({ error: '请输入密钥' });
  }

  const orders = getAllOrdersForPasswordCheck();
  const matched = verifyPassword(password.trim(), orders);

  if (!matched) {
    return res.status(401).json({ error: '密钥无效或已过期' });
  }

  // Generate session token
  const token = signToken({ order_id: matched.id, order_no: matched.order_no });

  res.json({
    valid: true,
    token,
    redirect: '/create'
  });
});

module.exports = router;
```

- [ ] **Step 2: Mount verify routes in server.js**

Add after the orders mount:

```js
const verifyRouter = require('./routes/verify');
app.use('/verify', verifyRouter);
app.use('/api/verify', verifyRouter);
```

- [ ] **Step 3: Add verify route tests**

Append to `tests/api.test.js`:

```js
describe('API — Verify route', () => {
  let db;

  before(() => {
    db = createTestDb();
    const { initDb, createOrder } = require('../db');
    initDb(db);
    process.env.HMAC_SECRET = 'test-hmac-secret';
    process.env.JWT_SECRET = 'test-jwt-secret';
    createOrder('verify-test-order', 'account-a');
  });

  after(() => {
    db.close();
    cleanupTestDb();
  });

  function mockReq(body = {}) {
    return { body, get: () => null };
  }

  function mockRes() {
    const res = {};
    res.statusCode = 200;
    res._json = null;
    res._rendered = null;
    res.status = function(code) { this.statusCode = code; return this; };
    res.json = function(data) { this._json = data; return this; };
    res.render = function(view, data) { this._rendered = { view, data }; return this; };
    res.redirect = function(url) { this._redirect = url; return this; };
    return res;
  }

  it('should reject empty password', () => {
    const router = require('../routes/verify');
    const handler = router.stack.find(l => l.route && l.route.methods.post).route.stack[1].handle;
    const res = mockRes();
    handler(mockReq({ password: '' }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res._json.error, '请输入密钥');
  });

  it('should reject wrong password', () => {
    const router = require('../routes/verify');
    const handler = router.stack.find(l => l.route && l.route.methods.post).route.stack[1].handle;
    const res = mockRes();
    handler(mockReq({ password: 'wrongpw' }), res);
    assert.equal(res.statusCode, 401);
  });

  it('should accept correct password', () => {
    const { derivePassword } = require('../auth');
    const pw = derivePassword('verify-test-order');
    const router = require('../routes/verify');
    const handler = router.stack.find(l => l.route && l.route.methods.post).route.stack[1].handle;
    const res = mockRes();
    handler(mockReq({ password: pw }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res._json.valid, true);
    assert.ok(res._json.token);
  });
});
```

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add routes/verify.js tests/api.test.js server.js
git commit -m "feat: add password verification routes"
```

---

### Task 7: Create routes (blessing creation)

**Files:**
- Create: `routes/create.js`
- Modify: `server.js` (add create routes)
- Modify: `middleware/auth.js` (update requireToken to support POST body)

- [ ] **Step 1: Write create route**

Create `routes/create.js`:

```js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { requireToken } = require('../middleware/auth');
const { createBlessing, getBlessingById } = require('../db');
const { derivePassword } = require('../auth');
const QRCode = require('qrcode');

// Multer config for photo upload
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },  // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// GET /create — blessing creation form (requires token)
router.get('/', requireToken, (req, res) => {
  res.render('create', {
    token: req.query.token,
    orderId: req.orderId,
    error: null,
    websiteUrl: process.env.WEBSITE_URL || ''
  });
});

// POST /api/create — create blessing
router.post('/', requireToken, upload.single('photo'), async (req, res) => {
  const { name, template, message, sender, birthday } = req.body;

  if (!name || !name.trim()) {
    return res.render('create', {
      token: req.body.token,
      error: '请输入收祝福人的名字',
      websiteUrl: process.env.WEBSITE_URL || ''
    });
  }

  try {
    const blessing = createBlessing({
      name: name.trim(),
      photo: req.file ? '/uploads/' + req.file.filename : null,
      template: template || 'default',
      message: message || null,
      sender: sender || null,
      birthday: birthday || null,
      order_id: req.orderId || null
    });

    const blessingUrl = `${process.env.WEBSITE_URL || ''}/b/${blessing.id}`;
    const qrcodeDataUrl = await QRCode.toDataURL(blessingUrl);

    res.json({
      id: blessing.id,
      url: blessingUrl,
      qrcode: qrcodeDataUrl
    });
  } catch (err) {
    console.error('Create blessing error:', err);
    res.status(500).json({ error: '创建失败，请稍后重试' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount create routes in server.js**

```js
const createRouter = require('./routes/create');
app.use('/create', createRouter);
app.use('/api/create', createRouter);
```

- [ ] **Step 3: Commit**

```bash
git add routes/create.js server.js
git commit -m "feat: add blessing creation routes with photo upload"
```

---

### Task 8: Blessing display route

**Files:**
- Create: `routes/blessing.js`
- Modify: `server.js` (add blessing route)

- [ ] **Step 1: Write blessing route**

Create `routes/blessing.js`:

```js
const express = require('express');
const router = express.Router();
const { getBlessingById } = require('../db');

// GET /b/:id — blessing display page
router.get('/:id', (req, res) => {
  const blessing = getBlessingById(req.params.id);
  if (!blessing) {
    return res.status(404).render('404');
  }

  // Templates
  const templates = {
    default: `亲爱的${blessing.name}，祝你生日快乐！愿你新的一岁充满阳光与欢笑，所有的梦想都能一一实现。`,
    warm: `${blessing.name}，生日快乐！感谢生命中有你，愿你的每一天都如今天般甜蜜温暖。`,
    fun: `嘿 ${blessing.name}！又长大一岁啦～愿你的生活像蛋糕一样甜，像礼物一样充满惊喜！`,
    simple: `${blessing.name}，生日快乐！愿你健康、快乐、幸福。`
  };

  const blessingMessage = blessing.message || templates[blessing.template] || templates.default;

  res.render('blessing', {
    blessing,
    message: blessingMessage,
    websiteUrl: process.env.WEBSITE_URL || ''
  });
});

// GET /api/blessing/:id — JSON data
router.get('/api/:id', (req, res) => {
  const blessing = getBlessingById(req.params.id);
  if (!blessing) {
    return res.status(404).json({ error: 'Blessing not found' });
  }
  res.json(blessing);
});

module.exports = router;
```

- [ ] **Step 2: Mount in server.js**

```js
const blessingRouter = require('./routes/blessing');
app.use('/b', blessingRouter);
app.use('/api/blessing', (req, res, next) => {
  // Route /api/blessing/:id → delegate to blessing router
  const { getBlessingById } = require('./db');
  const id = req.path.replace('/', '');
  const blessing = getBlessingById(id);
  if (!blessing) return res.status(404).json({ error: 'Blessing not found' });
  res.json(blessing);
});
```

Actually, simplify: just mount the router at `/b` for display and add a separate handler for the API route in server.js.

The simpler approach:

```js
app.get('/api/blessing/:id', (req, res) => {
  const { getBlessingById } = require('./db');
  const blessing = getBlessingById(req.params.id);
  if (!blessing) return res.status(404).json({ error: 'Blessing not found' });
  res.json(blessing);
});
```

And mount blessing router at `/b`.

- [ ] **Step 3: Commit**

```bash
git add routes/blessing.js server.js
git commit -m "feat: add blessing display and JSON API routes"
```

---

### Task 9: Views — full page templates

**Files:**
- Overwrite: `views/index.ejs`
- Overwrite: `views/verify.ejs`
- Overwrite: `views/create.ejs`
- Overwrite: `views/blessing.ejs`
- Overwrite: `views/404.ejs`
- Create: `public/css/style.css`

- [ ] **Step 1: Write CSS**

Create `public/css/style.css`:

```css
/* === Reset & Base === */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #fff5f5;
  --card-bg: #ffffff;
  --primary: #e85d75;
  --primary-dark: #d44a62;
  --text: #333;
  --text-light: #666;
  --shadow: 0 4px 24px rgba(0,0,0,0.08);
  --radius: 16px;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', sans-serif;
  background: linear-gradient(135deg, #fff5f5 0%, #ffe0e6 50%, #fff0e0 100%);
  min-height: 100vh;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.container {
  width: 100%;
  max-width: 480px;
}

.card {
  background: var(--card-bg);
  border-radius: var(--radius);
  padding: 40px 32px;
  box-shadow: var(--shadow);
  text-align: center;
}

h1 { font-size: 1.8rem; margin-bottom: 8px; }
h2 { font-size: 1.3rem; margin-bottom: 16px; color: var(--text-light); }

.emoji-hero { font-size: 4rem; margin-bottom: 16px; }

/* === Form === */
.form-group { margin-bottom: 20px; text-align: left; }
.form-group label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 0.95rem; }
.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e8e8e8;
  border-radius: 10px;
  font-size: 1rem;
  transition: border-color 0.2s;
  font-family: inherit;
}
.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--primary);
}

.btn {
  display: inline-block;
  width: 100%;
  padding: 14px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}
.btn:hover { background: var(--primary-dark); }
.btn:active { transform: scale(0.98); }
.btn:disabled { background: #ccc; cursor: not-allowed; }
.btn-secondary {
  background: #fff;
  color: var(--primary);
  border: 2px solid var(--primary);
  margin-top: 12px;
}
.btn-secondary:hover { background: #fff5f5; }

/* === Password Input (verify page) === */
.password-input {
  font-size: 2rem !important;
  text-align: center;
  letter-spacing: 8px;
  font-family: 'SF Mono', 'Consolas', 'Courier New', monospace;
  text-transform: uppercase;
}

/* === Error / Success === */
.error-msg {
  color: #e74c3c;
  font-size: 0.9rem;
  margin-top: 8px;
  min-height: 20px;
}

.success-box {
  background: #f0fff4;
  border: 2px solid #48bb78;
  border-radius: var(--radius);
  padding: 24px;
  margin-top: 20px;
}

.qrcode-img { max-width: 200px; margin: 16px auto; display: block; }
.blessing-url {
  word-break: break-all;
  color: var(--primary);
  font-weight: 600;
}

/* === Blessing Display Page === */
.blessing-card {
  background: var(--card-bg);
  border-radius: var(--radius);
  padding: 48px 32px;
  box-shadow: var(--shadow);
  text-align: center;
  max-width: 480px;
  margin: 0 auto;
}

.blessing-photo {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  object-fit: cover;
  margin: 0 auto 24px;
  border: 4px solid var(--primary);
}

.blessing-name { font-size: 2rem; margin-bottom: 4px; }
.blessing-message { font-size: 1.15rem; line-height: 1.8; color: var(--text-light); margin: 24px 0; }
.blessing-sender { font-size: 0.95rem; color: #999; margin-top: 16px; }
.blessing-emoji { font-size: 2rem; margin: 16px 0; }

/* === Shake animation for error === */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
.shake { animation: shake 0.4s ease; }

/* === Responsive === */
@media (max-width: 480px) {
  .card { padding: 28px 20px; }
  .blessing-card { padding: 32px 20px; }
  .password-input { font-size: 1.5rem; letter-spacing: 4px; }
  h1 { font-size: 1.5rem; }
}
```

- [ ] **Step 2: Write verify.ejs**

Overwrite `views/verify.ejs`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>验证密钥 — 生日祝福生成器</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="emoji-hero">🎂</div>
      <h1>输入你的祝福密钥</h1>
      <p style="color: #999; margin-bottom: 24px;">在闲鱼购买后收到的 8 位密码</p>

      <form id="verify-form">
        <div class="form-group">
          <input
            type="text"
            id="password"
            class="password-input"
            placeholder="Kx7Pq2R9"
            maxlength="8"
            autocomplete="off"
            autofocus
          >
        </div>
        <div class="error-msg" id="error"><%= locals.error || '' %></div>
        <button type="submit" class="btn" id="submit-btn">验证</button>
      </form>
    </div>
  </div>

  <script src="/js/verify.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write verify.js**

Create `public/js/verify.js`:

```js
document.getElementById('verify-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const password = document.getElementById('password').value.trim();
  const errorEl = document.getElementById('error');
  const btn = document.getElementById('submit-btn');
  const input = document.getElementById('password');

  // Clear previous error
  errorEl.textContent = '';
  input.classList.remove('shake');

  if (!password) {
    errorEl.textContent = '请输入密钥';
    input.classList.add('shake');
    return;
  }

  btn.disabled = true;
  btn.textContent = '验证中...';

  try {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || '验证失败';
      input.classList.add('shake');
      input.addEventListener('animationend', () => input.classList.remove('shake'), { once: true });
      btn.disabled = false;
      btn.textContent = '验证';
      return;
    }

    if (data.valid) {
      // Success — redirect to create page
      window.location.href = `/create?token=${encodeURIComponent(data.token)}`;
    }
  } catch (err) {
    errorEl.textContent = '网络错误，请稍后重试';
    btn.disabled = false;
    btn.textContent = '验证';
  }
});

// Auto uppercase
document.getElementById('password').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
});
```

- [ ] **Step 4: Write create.ejs**

Overwrite `views/create.ejs`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>创建生日祝福</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="emoji-hero">🎉</div>
      <h1>创建生日祝福</h1>
      <p style="color: #999; margin-bottom: 24px;">填写信息，生成专属祝福页面</p>

      <% if (locals.error) { %>
        <div id="error-msg" class="error-msg" style="margin-bottom: 16px;"><%= error %></div>
      <% } %>

      <form id="create-form" enctype="multipart/form-data">
        <input type="hidden" name="token" value="<%= token %>">

        <div class="form-group">
          <label for="name">收祝福人名字 *</label>
          <input type="text" id="name" name="name" required placeholder="例如：小明" maxlength="50">
        </div>

        <div class="form-group">
          <label for="photo">照片（可选）</label>
          <input type="file" id="photo" name="photo" accept="image/jpeg,image/png,image/webp">
          <small style="color:#999;">JPG/PNG/WebP，最大 5MB</small>
        </div>

        <div class="form-group">
          <label for="template">祝福模板</label>
          <select id="template" name="template">
            <option value="default">经典温馨</option>
            <option value="warm">甜蜜暖心</option>
            <option value="fun">俏皮可爱</option>
            <option value="simple">简洁真诚</option>
          </select>
        </div>

        <div class="form-group">
          <label for="message">自定义祝福（可选，覆盖模板）</label>
          <textarea id="message" name="message" rows="3" maxlength="500" placeholder="写下你想说的话..."></textarea>
        </div>

        <div class="form-group">
          <label for="sender">你的署名（可选）</label>
          <input type="text" id="sender" name="sender" placeholder="例如：爱你的朋友" maxlength="50">
        </div>

        <div class="form-group">
          <label for="birthday">生日日期（可选）</label>
          <input type="date" id="birthday" name="birthday">
        </div>

        <button type="submit" class="btn" id="submit-btn">🎂 生成祝福</button>
      </form>
    </div>
  </div>

  <script>
    document.getElementById('create-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const form = e.target;
      const btn = document.getElementById('submit-btn');
      const name = document.getElementById('name').value.trim();

      if (!name) {
        alert('请输入收祝福人的名字');
        return;
      }

      btn.disabled = true;
      btn.textContent = '生成中...';

      const formData = new FormData(form);

      try {
        const res = await fetch('/api/create', {
          method: 'POST',
          body: formData
        });

        if (!res.ok) {
          const data = await res.json();
          alert(data.error || '创建失败，请重试');
          btn.disabled = false;
          btn.textContent = '🎂 生成祝福';
          return;
        }

        const data = await res.json();

        // Show result
        form.style.display = 'none';
        document.querySelector('h1').textContent = '祝福已生成！🎉';
        document.querySelector('.emoji-hero').textContent = '✨';

        const resultDiv = document.createElement('div');
        resultDiv.className = 'success-box';
        resultDiv.innerHTML = `
          <p style="margin-bottom:12px;">祝福页面链接：</p>
          <a href="${data.url}" class="blessing-url" target="_blank">${data.url}</a>
          ${data.qrcode ? `<img src="${data.qrcode}" class="qrcode-img" alt="QR Code">` : ''}
          <p style="font-size:0.85rem;color:#999;margin-top:16px;">扫二维码或点击链接查看祝福页面</p>
        `;
        document.querySelector('.card').appendChild(resultDiv);

        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-secondary';
        copyBtn.textContent = '📋 复制链接';
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(data.url).then(() => {
            copyBtn.textContent = '✅ 已复制';
          });
        };
        resultDiv.appendChild(copyBtn);
      } catch (err) {
        alert('网络错误，请稍后重试');
        btn.disabled = false;
        btn.textContent = '🎂 生成祝福';
      }
    });
  </script>
</body>
</html>
```

- [ ] **Step 5: Write index.ejs**

Overwrite `views/index.ejs`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>生日祝福生成器</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="emoji-hero">🎂🎉🎈</div>
      <h1>生日祝福生成器</h1>
      <p style="color: #999; margin-bottom: 32px;">创建独一无二的生日祝福页面，给你的朋友一个惊喜</p>

      <a href="/verify" class="btn" style="text-decoration:none; display:block;">🔑 已有密钥？去验证</a>
      <p style="color: #ccc; margin-top: 16px; font-size: 0.85rem;">
        在闲鱼购买后获得密钥
      </p>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 6: Write blessing.ejs**

Overwrite `views/blessing.ejs`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🎂 <%= blessing.name %> 的生日祝福</title>
  <link rel="stylesheet" href="/css/style.css">
  <meta property="og:title" content="<%= blessing.name %> 的生日祝福">
  <meta property="og:description" content="<%= message %>">
</head>
<body>
  <div class="blessing-card">
    <% if (blessing.photo) { %>
      <img src="<%= blessing.photo %>" alt="<%= blessing.name %>" class="blessing-photo">
    <% } else { %>
      <div class="emoji-hero">🎂</div>
    <% } %>

    <h1 class="blessing-name"><%= blessing.name %></h1>

    <p class="blessing-message"><%= message %></p>

    <% if (blessing.birthday) { %>
      <p style="color:#999;margin-bottom:8px;">🎂 <%= blessing.birthday %></p>
    <% } %>

    <% if (blessing.sender) { %>
      <p class="blessing-sender">— <%= blessing.sender %></p>
    <% } %>

    <div class="blessing-emoji">🎂🎉🎈🎁🎊</div>

    <a href="/" style="color: var(--primary); font-size: 0.9rem;">也来创建一个 →</a>
  </div>
</body>
</html>
```

- [ ] **Step 7: Write 404.ejs**

Overwrite `views/404.ejs`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>页面未找到</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="emoji-hero">🔍</div>
      <h1>页面未找到</h1>
      <p style="color: #999; margin: 16px 0;"><%= locals.message || '你访问的页面不存在' %></p>
      <a href="/" class="btn" style="text-decoration:none; display:block;">返回首页</a>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 8: Boot test**

Run: `node server.js`
Open: `http://localhost:3000/` → see landing page
Open: `http://localhost:3000/verify` → see password input
Open: `http://localhost:3000/create` → redirected to /verify
Open: `http://localhost:3000/b/nonexistent` → 404 page

Stop server.

- [ ] **Step 9: Commit**

```bash
git add views/index.ejs views/verify.ejs views/create.ejs views/blessing.ejs views/404.ejs public/css/style.css public/js/verify.js server.js
git commit -m "feat: complete all views with birthday theme styling and verify flow"
```

---

### Task 10: Bot implementation

**Files:**
- Create: `bot/config.yaml`
- Create: `bot/storage.js`
- Create: `bot/xianyu.js`
- Create: `bot/monitor.js`
- Create: `bot/bot.js`
- Create: `.env.example` (update with bot env vars)

- [ ] **Step 1: Write bot config**

Create `bot/config.yaml`:

```yaml
accounts:
  - name: "主号"
    cookie_file: "./bot/cookies/account-a.json"
  - name: "小号"
    cookie_file: "./bot/cookies/account-b.json"

monitor:
  interval_ms: 60000          # Poll every 60 seconds
  product_url: ""             # Fill in: Xianyu item page URL

reply:
  template: |
    您好，您的祝福密钥是：{password}
    请在 24 小时内访问 {website_url}/verify
    输入密钥即可创建专属生日祝福 🎂🎉

xianyu:
  base_url: "https://www.goofish.com"
  login_url: "https://www.goofish.com"
  sold_items_url: ""          # Fill in: URL for "已卖出的宝贝" page
```

- [ ] **Step 2: Write bot storage.js**

Create `bot/storage.js`:

```js
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'storage', 'processed.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS processed_orders (
        order_no TEXT PRIMARY KEY,
        account TEXT NOT NULL,
        password TEXT,
        status TEXT DEFAULT 'replied',
        created_at TEXT NOT NULL
      )
    `);
  }
  return db;
}

function isProcessed(orderNo) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM processed_orders WHERE order_no = ?').get(orderNo);
  return !!row;
}

function markProcessed(orderNo, account, password) {
  const db = getDb();
  db.prepare(
    'INSERT OR IGNORE INTO processed_orders (order_no, account, password, created_at) VALUES (?, ?, ?, ?)'
  ).run(orderNo, account, password, new Date().toISOString());
}

function getProcessedCount() {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) as count FROM processed_orders').get().count;
}

module.exports = { isProcessed, markProcessed, getProcessedCount };
```

- [ ] **Step 3: Write xianyu.js (Playwright page actions)**

Create `bot/xianyu.js`:

```js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

class XianyuClient {
  constructor(accountConfig) {
    this.name = accountConfig.name;
    this.cookieFile = path.resolve(accountConfig.cookie_file);
    this.browser = null;
    this.context = null;
    this.page = null;
    this.loggedIn = false;
  }

  log(msg) {
    console.log(`[${this.name}] ${msg}`);
  }

  async init() {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    // Load cookies if exist
    if (fs.existsSync(this.cookieFile)) {
      const cookies = JSON.parse(fs.readFileSync(this.cookieFile, 'utf-8'));
      await this.context.addCookies(cookies);
      this.log('已加载 cookie');
    }

    this.page = await this.context.newPage();
  }

  async checkLogin() {
    if (!this.page) return false;
    try {
      // Navigate to Xianyu and check if logged in
      await this.page.goto('https://www.goofish.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await this.page.waitForTimeout(3000);

      // Check for login page indicators — if we see login elements, not logged in
      const loggedInIndicator = await this.page.$('[class*="user"], [class*="avatar"], [class*="profile"]');
      this.loggedIn = !!loggedInIndicator;
      return this.loggedIn;
    } catch (err) {
      this.log(`登录检查失败: ${err.message}`);
      return false;
    }
  }

  async saveCookies() {
    if (!this.context) return;
    const cookies = await this.context.cookies();
    const dir = path.dirname(this.cookieFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.cookieFile, JSON.stringify(cookies, null, 2));
    this.log('Cookie 已保存');
  }

  async getOrders(productUrl) {
    if (!this.page || !this.loggedIn) {
      this.log('未登录，无法获取订单');
      return [];
    }

    try {
      // Navigate to sold items page
      await this.page.goto('https://www.goofish.com/im/sold', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await this.page.waitForTimeout(5000);

      // Extract order numbers from the page
      // Xianyu page structure may vary — this extracts order-like text patterns
      const orders = await this.page.evaluate(() => {
        const orderNumbers = [];
        const text = document.body.innerText;
        // Match Xianyu order number pattern: typically 16-20 digits
        const matches = text.match(/\b(\d{16,20})\b/g);
        if (matches) {
          matches.forEach(m => {
            if (!orderNumbers.includes(m)) orderNumbers.push(m);
          });
        }
        return orderNumbers;
      });

      // Also try clicking into each order to get details
      // This is a simplified approach — real implementation needs to handle
      // Xianyu's specific DOM structure
      this.log(`发现 ${orders.length} 个订单号`);
      return orders;
    } catch (err) {
      this.log(`获取订单失败: ${err.message}`);
      return [];
    }
  }

  async sendMessage(orderNo, message) {
    if (!this.page || !this.loggedIn) {
      this.log('未登录，无法发送消息');
      return false;
    }

    try {
      // Navigate to IM/conversation for this order
      await this.page.goto('https://www.goofish.com/im', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await this.page.waitForTimeout(3000);

      // Find and click the conversation matching this order
      // This needs to be adapted to Xianyu's actual IM UI
      const conversations = await this.page.$$('[class*="conversation"], [class*="chat-item"]');
      for (const conv of conversations) {
        const text = await conv.innerText();
        if (text.includes(orderNo)) {
          await conv.click();
          await this.page.waitForTimeout(1000);

          // Type and send message
          const inputArea = await this.page.$('[class*="input"], textarea, [contenteditable="true"]');
          if (inputArea) {
            await inputArea.click();
            await inputArea.fill(message);
            await this.page.waitForTimeout(500);

            const sendBtn = await this.page.$('[class*="send"], button');
            if (sendBtn) {
              await sendBtn.click();
              this.log(`消息已发送 → 订单 ${orderNo}`);
              return true;
            }
          }
        }
      }

      this.log(`未找到订单 ${orderNo} 的聊天`);
      return false;
    } catch (err) {
      this.log(`发送消息失败: ${err.message}`);
      return false;
    }
  }

  async close() {
    if (this.browser) await this.browser.close();
  }
}

module.exports = XianyuClient;
```

- [ ] **Step 4: Write monitor.js**

Create `bot/monitor.js`:

```js
const { isProcessed, markProcessed } = require('./storage');

async function poll(config, clients, apiBase, apiKey, websiteUrl) {
  const productUrl = config.monitor.product_url;
  const replyTemplate = config.reply.template;

  for (const client of clients) {
    console.log(`--- 轮询账号: ${client.name} ---`);

    // Check login
    const loggedIn = await client.checkLogin();
    if (!loggedIn) {
      console.log(`⚠️ ${client.name} 登录态已过期，需要重新扫码登录`);
      console.log(`   请用浏览器打开 goofish.com 登录，然后保存 cookie`);
      // Notify: log to console (operator can monitor via Railway logs)
      // Optional: add Telegram Bot notification via node-telegram-bot-api
      continue;
    }

    // Save cookies after each successful check
    await client.saveCookies();

    // Get order list
    const orders = await client.getOrders(productUrl);

    for (const orderNo of orders) {
      if (isProcessed(orderNo)) continue;

      console.log(`🆕 新订单: ${orderNo} (账号: ${client.name})`);

      // Call Website API to create order and get password
      try {
        const res = await fetch(`${apiBase}/api/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
          },
          body: JSON.stringify({ order_no: orderNo, account: client.name })
        });

        if (!res.ok) {
          console.error(`API 调用失败: ${res.status}`);
          continue;
        }

        const data = await res.json();
        const password = data.password;

        // Build reply message
        const message = replyTemplate
          .replace('{password}', password)
          .replace('{website_url}', websiteUrl);

        // Send auto-reply
        const sent = await client.sendMessage(orderNo, message);
        if (sent) {
          markProcessed(orderNo, client.name, password);
          console.log(`✅ 订单 ${orderNo} 处理完成`);
        }
      } catch (err) {
        console.error(`订单 ${orderNo} 处理失败: ${err.message}`);
      }
    }
  }
}

module.exports = { poll };
```

- [ ] **Step 5: Write bot.js (entry point)**

Create `bot/bot.js`:

```js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const XianyuClient = require('./xianyu');
const { poll } = require('./monitor');

const CONFIG_PATH = process.env.BOT_CONFIG || path.join(__dirname, 'config.yaml');
const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const API_KEY = process.env.API_KEY;
const WEBSITE_URL = process.env.WEBSITE_URL || 'http://localhost:3000';
const INTERVAL = process.env.BOT_INTERVAL_MS || 60000;

async function main() {
  console.log('=== 生日祝福 Bot 启动 ===');

  // Load config
  const config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  console.log(`已加载 ${config.accounts.length} 个账号配置`);

  // Init clients for each account
  const clients = [];
  for (const acct of config.accounts) {
    const client = new XianyuClient(acct);
    await client.init();
    clients.push(client);
    console.log(`已初始化: ${acct.name}`);
  }

  // Initial check
  console.log('开始首次轮询...');
  await poll(config, clients, API_BASE, API_KEY, WEBSITE_URL);

  // Polling loop
  setInterval(async () => {
    console.log(`\n--- 定时轮询 (${new Date().toISOString()}) ---`);
    try {
      await poll(config, clients, API_BASE, API_KEY, WEBSITE_URL);
    } catch (err) {
      console.error('轮询异常:', err);
    }
  }, parseInt(INTERVAL));

  console.log(`Bot 已就绪，轮询间隔: ${INTERVAL / 1000}s`);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n正在关闭...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n正在关闭...');
  process.exit(0);
});

main().catch(err => {
  console.error('Bot 启动失败:', err);
  process.exit(1);
});
```

- [ ] **Step 6: Update .env.example with bot vars**

```bash
# Bot
BOT_ENABLED=true
BOT_CONFIG=./bot/config.yaml
BOT_INTERVAL_MS=60000
API_BASE=http://localhost:3000
```

- [ ] **Step 7: Commit**

```bash
git add bot/ .env.example
git commit -m "feat: add Xianyu bot with Playwright, multi-account support, and auto-reply"
```

---

### Task 11: Integration & startup

**Files:**
- Create: `Procfile` (for Railway)
- Modify: `package.json` (update scripts)
- Modify: `server.js` (add bot auto-start option)
- Create: `.env.example` (final version)

- [ ] **Step 1: Create Procfile**

Create `Procfile`:

```
web: node server.js
bot: node bot/bot.js
```

- [ ] **Step 2: Add startup script to package.json**

Update `package.json` scripts:

```json
"scripts": {
  "start": "node server.js",
  "bot": "node bot/bot.js",
  "start:all": "concurrently \"npm start\" \"npm run bot\"",
  "test": "node --test tests/*.test.js",
  "dev": "node server.js"
}
```

Note: `concurrently` is optional — in production, Railway Procfile handles this.

- [ ] **Step 3: Final .env.example**

```bash
# Server
PORT=3000
WEBSITE_URL=https://your-domain.railway.app

# Security
HMAC_SECRET=change-me-to-random-32-chars
JWT_SECRET=change-me-to-random-32-chars
API_KEY=change-me-to-random-24-chars

# Bot
BOT_ENABLED=true
BOT_CONFIG=./bot/config.yaml
BOT_INTERVAL_MS=60000
API_BASE=http://localhost:3000

# Database
DB_PATH=./data.db
```

- [ ] **Step 4: Full e2e startup test**

```bash
# Terminal 1
node server.js

# Terminal 2
# Test full flow: create order → verify password → create blessing
$password = (Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/orders" -ContentType "application/json" -Headers @{"X-API-Key"="test-api-key"} -Body '{"order_no":"e2etest123","account":"test"}').password
Write-Output "Password: $password"

# Verify password
$verify = Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/verify" -ContentType "application/json" -Body "{`"password`":`"$password`"}"
Write-Output "Verify: $($verify.valid)"

# Create blessing
$token = $verify.token
```

- [ ] **Step 5: Commit**

```bash
git add Procfile package.json .env.example server.js
git commit -m "chore: add Procfile, startup scripts, and final env template"
```

---

### Task 12: Documentation & deployment notes

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

```markdown
# 🎂 生日祝福生成器

一个带闲鱼自动回复的生日祝福页面生成器。

## 功能

- 闲鱼下单后自动回复顾客祝福密钥
- 顾客输入密钥即可创建专属生日祝福页面
- 支持照片上传、多种祝福模板
- 生成祝福链接 + 二维码
- 响应式设计，手机端友好

## 快速开始

1. 安装依赖：`npm install`
2. 配置环境变量：`cp .env.example .env`，编辑 .env 填入密钥
3. 配置 Bot：编辑 `bot/config.yaml` 填入闲鱼账号信息
4. 启动网站：`npm start`
5. 启动 Bot：`npm run bot`
6. 首次运行需要在 `bot/cookies/` 中提供闲鱼登录 Cookie

## 部署到 Railway

1. Fork 本仓库
2. 在 Railway 新建项目，选择本仓库
3. 设置环境变量（参考 .env.example）
4. 部署完成后，Website 和 Bot 会作为两个服务分别运行

## Cookie 获取方法

1. 用 Chrome 打开 goofish.com 并登录
2. F12 → Application → Cookies → 导出所有 cookie
3. 保存为 JSON 数组格式到 `bot/cookies/account-a.json`
4. Bot 后续会自动维护 cookie

## 技术栈

Node.js / Express / EJS / SQLite / Playwright / JWT
```

- [ ] **Step 2: Final commit**

```bash
git add README.md
git commit -m "docs: add README with setup and deployment instructions"
```

---

## Completion Checklist

- [ ] All 12 tasks committed
- [ ] `npm test` passes
- [ ] Website serves all 5 pages
- [ ] `/api/orders` creates orders and returns passwords
- [ ] `/api/verify` validates passwords correctly
- [ ] `/api/create` generates blessings with QR codes
- [ ] Bot polls, detects orders, and sends replies
- [ ] Cookie persistence works across restarts
- [ ] 24h password expiry functions correctly
