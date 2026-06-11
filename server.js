require('dotenv').config();
const express = require('express');
const path = require('path');
const { getBlessing } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// ============ Middleware ============

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Parse JSON request bodies (needed for Xianyu API routes)
app.use(express.json());

// Serve uploaded photos
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ============ Blessing Templates ============

const TEMPLATES = {
  default: '亲爱的{name}，祝你生日快乐！🎂 愿你新的一岁充满阳光与欢笑，所有的梦想都能一一实现。',
  warm: '{name}，生日快乐！💝 感谢生命中有你，愿你的每一天都如今天般甜蜜温暖，被爱包围。',
  fun: '嘿 {name}！又长大一岁啦～🎉 愿你的生活像蛋糕一样甜，像礼物一样充满惊喜，每天都有好心情！',
  simple: '{name}，生日快乐！🎈 愿你健康、快乐、幸福，每一天都闪闪发光。'
};

function fillTemplate(templateId, name, customMessage) {
  const base = TEMPLATES[templateId] || TEMPLATES['default'];
  if (customMessage && customMessage.trim()) {
    return customMessage.trim().replace(/\{name\}/g, name);
  }
  return base.replace(/\{name\}/g, name);
}

// ============ Routes ============

// Home — creation form
app.get('/', (req, res) => {
  res.render('index', { templates: Object.keys(TEMPLATES), error: null });
});

// ---- Mount Xianyu-integration routers ----
const ordersRouter = require('./routes/orders');
const verifyRouter = require('./routes/verify');
const createRouter = require('./routes/create');
const blessingRouter = require('./routes/blessing');

app.use('/api/orders', ordersRouter);
app.use('/verify', verifyRouter);
app.use('/api/verify', verifyRouter);
app.use('/create', createRouter);
app.use('/api/create', createRouter);  // unified POST endpoint (legacy + Xianyu flows)
app.use('/b', blessingRouter);

// Get blessing JSON
app.get('/api/blessing/:id', (req, res) => {
  const blessing = getBlessing(req.params.id);
  if (!blessing) {
    return res.status(404).json({ error: '祝福不存在' });
  }
  // Render the message
  blessing.message = fillTemplate(blessing.template, blessing.name, blessing.message);
  res.json(blessing);
});

// 404 catch-all
app.use((req, res) => {
  res.status(404).render('404');
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).render('404');
});

// ============ Health check ============

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ============ Crash protection ============

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  // Don't exit — let the error handler deal with it
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

// ============ Start ============

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎂 生日祝福生成器已启动: http://0.0.0.0:${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} in use, retrying...`);
    setTimeout(() => {
      server.close();
      server.listen(PORT, '0.0.0.0');
    }, 1000);
  }
});
