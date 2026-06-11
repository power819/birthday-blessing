// routes/create.js
// Blessing creation — unified endpoint for both flows:
//   - Xianyu flow: requires valid JWT token (from /verify)
//   - Legacy flow: no token (index.ejs has its own account+password gate)
// Mounted at /create (GET form) and /api/create (POST endpoint)

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const QRCode = require('qrcode');
const { verifyToken } = require('../auth');
const { createBlessing, markOrderReplied } = require('../db');

// Multer setup (shared uploads directory with server.js)
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'uploads'),
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

// Optional token check — attaches orderPayload if valid token present,
// but doesn't block requests without one (legacy index.ejs flow).
function optionalToken(req, res, next) {
  const token = req.query.token || (req.body && req.body.token);

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.orderPayload = payload;
    }
    // If token is present but invalid, we still allow (client-side handles error)
  }
  next();
}

// GET /create — Render the creation form.
// With token → Xianyu flow. Without token → redirect to /verify.
router.get('/', (req, res) => {
  const token = req.query.token;

  if (!token) {
    return res.redirect('/verify');
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.redirect('/verify?error=expired');
  }

  res.render('create', {
    token,
    templates: ['default', 'warm', 'fun', 'simple']
  });
});

// POST /api/create (when mounted at /api/create) or POST /create (when mounted at /create)
// Unified create endpoint — works for both legacy and Xianyu flows.
router.post('/', optionalToken, function (req, res) {
  uploadFields(req, res, async function (err) {
    if (err) {
      console.error('Upload error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '文件不能超过 10MB' });
      }
      return res.status(400).json({ error: '文件上传失败: ' + err.message });
    }

    try {
      const { name, template, message, sender, birthday } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: '请输入寿星的姓名' });
      }

      const photoPath = req.files && req.files.photo && req.files.photo[0]
        ? '/uploads/' + req.files.photo[0].filename : null;
      const voicePath = req.files && req.files.voice && req.files.voice[0]
        ? '/uploads/' + req.files.voice[0].filename : null;

      const id = createBlessing({
        name: name.trim(),
        photo: photoPath,
        voice: voicePath,
        template: template || 'default',
        message: message || null,
        sender: sender || null,
        birthday: birthday || null
      });

      // Xianyu flow: mark the order as replied
      if (req.orderPayload && req.orderPayload.order_id) {
        markOrderReplied(req.orderPayload.order_id);
      }

      const baseUrl = process.env.WEBSITE_URL || `${req.protocol}://${req.get('host')}`;
      const blessingUrl = `${baseUrl}/b/${id}`;

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
});

module.exports = router;
