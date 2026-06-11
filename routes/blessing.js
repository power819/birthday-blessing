// routes/blessing.js
// Blessing display page (extracted from server.js for clean separation).

const express = require('express');
const router = express.Router();
const { getBlessing } = require('../db');

// Template messages (mirrors server.js TEMPLATES)
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

// GET /b/:id — Blessing display page
router.get('/:id', (req, res) => {
  const blessing = getBlessing(req.params.id);
  if (!blessing) {
    return res.status(404).render('404');
  }
  blessing.message = fillTemplate(blessing.template, blessing.name, blessing.message);
  res.render('blessing', { blessing });
});

module.exports = router;
