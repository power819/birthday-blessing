require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const QRCode = require('qrcode');
const { createBlessing, getBlessing } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Multer config
const storage = multer.diskStorage({
  destination: path.join(__dirname, 'public', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const audioTypes = ['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm;codecs=opus'];
    if (imageTypes.includes(file.mimetype) || audioTypes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式'));
    }
  }
});

const uploadFields = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'voice', maxCount: 1 }
]);

// Templates
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

// Home — creation form (with account+password gate)
app.get('/', (req, res) => {
  res.render('index');
});

// Create blessing
app.post('/api/create', (req, res) => {
  uploadFields(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: '文件不能超过 10MB' });
      return res.status(400).json({ error: '文件上传失败: ' + err.message });
    }

    try {
      const { name, template, message, sender, birthday } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: '请输入寿星的姓名' });
      }

      const photoPath = req.files?.photo?.[0] ? '/uploads/' + req.files.photo[0].filename : null;
      const voicePath = req.files?.voice?.[0] ? '/uploads/' + req.files.voice[0].filename : null;

      const id = createBlessing({
        name: name.trim(),
        photo: photoPath,
        voice: voicePath,
        template: template || 'default',
        message: message || null,
        sender: sender || null,
        birthday: birthday || null
      });

      const baseUrl = process.env.WEBSITE_URL || `${req.protocol}://${req.get('host')}`;
      const blessingUrl = `${baseUrl}/b/${id}`;
      const qrcodeDataUrl = await QRCode.toDataURL(blessingUrl, {
        width: 400, margin: 2, color: { dark: '#e91e63', light: '#ffffff' }
      });

      res.json({ success: true, id, url: blessingUrl, qrcode: qrcodeDataUrl });
    } catch (e) {
      console.error('Create error:', e);
      res.status(500).json({ error: '创建失败，请稍后重试' });
    }
  });
});

// Blessing display page
app.get('/b/:id', (req, res) => {
  const blessing = getBlessing(req.params.id);
  if (!blessing) return res.status(404).render('404');
  blessing.message = fillTemplate(blessing.template, blessing.name, blessing.message);
  res.render('blessing', { blessing });
});

// Blessing JSON API
app.get('/api/blessing/:id', (req, res) => {
  const blessing = getBlessing(req.params.id);
  if (!blessing) return res.status(404).json({ error: '祝福不存在' });
  blessing.message = fillTemplate(blessing.template, blessing.name, blessing.message);
  res.json(blessing);
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// 404
app.use((req, res) => res.status(404).render('404'));

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).render('404');
});

// Crash protection
process.on('uncaughtException', (err) => console.error('UNCAUGHT:', err));
process.on('unhandledRejection', (reason) => console.error('UNHANDLED:', reason));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎂 生日祝福生成器已启动: http://0.0.0.0:${PORT}`);
});
