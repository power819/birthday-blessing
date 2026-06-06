const express = require('express');
const path = require('path');
const multer = require('multer');
const QRCode = require('qrcode');
const { createBlessing, getBlessing } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ============ Middleware ============

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve uploaded photos
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Multer config for photo upload
const storage = multer.diskStorage({
  destination: path.join(__dirname, 'public', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 JPG、PNG、WebP 格式的图片'));
    }
  }
});

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

// Blessing display page
app.get('/b/:id', (req, res) => {
  const blessing = getBlessing(req.params.id);
  if (!blessing) {
    return res.status(404).render('404');
  }
  // Render the message from template + custom override
  blessing.message = fillTemplate(blessing.template, blessing.name, blessing.message);
  res.render('blessing', { blessing });
});

// Create blessing API
app.post('/api/create', upload.single('photo'), async (req, res) => {
  try {
    const { name, template, message, sender, birthday } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '请输入寿星的姓名' });
    }

    // Build photo path
    const photoPath = req.file ? '/uploads/' + req.file.filename : null;

    // Create in database
    const id = createBlessing({
      name: name.trim(),
      photo: photoPath,
      template: template || 'default',
      message: message || null,
      sender: sender || null,
      birthday: birthday || null
    });

    // Build the full URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const blessingUrl = `${baseUrl}/b/${id}`;

    // Generate QR code as data URL
    const qrcodeDataUrl = await QRCode.toDataURL(blessingUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#e91e63', light: '#ffffff' }
    });

    res.json({
      success: true,
      id,
      url: blessingUrl,
      qrcode: qrcodeDataUrl
    });
  } catch (err) {
    console.error('Create error:', err);
    if (err.message && err.message.includes('格式')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: '创建失败，请稍后重试' });
  }
});

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

// ============ Start ============

app.listen(PORT, () => {
  console.log(`🎂 生日祝福生成器已启动: http://localhost:${PORT}`);
});
