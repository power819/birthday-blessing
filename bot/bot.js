#!/usr/bin/env node
// bot/bot.js
// Xianyu Bot 入口 — 多账号轮询闲鱼订单，自动回复祝福密钥。

const fs = require('fs');
const path = require('path');
const http = require('http');
const yaml = require('js-yaml');
const XianyuClient = require('./xianyu');
const { poll } = require('./monitor');

const CONFIG_PATH = process.env.BOT_CONFIG || path.join(__dirname, 'config.yaml');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// If BOT_COOKIE env var is set, decode and write the cookie file.
// This allows passing cookies via Railway environment variables (base64-encoded JSON).
function ensureCookieFile() {
  const cookieEnv = process.env.BOT_COOKIE;
  if (!cookieEnv) return; // No env var — use local file

  const targetPath = path.resolve(__dirname, 'cookies', 'account-a.json');
  if (fs.existsSync(targetPath)) return; // Already exists

  try {
    const json = Buffer.from(cookieEnv, 'base64').toString('utf-8');
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(targetPath, json, 'utf-8');
    console.log('✅ 已从 BOT_COOKIE 环境变量还原 Cookie 文件');
  } catch (e) {
    console.error('❌ BOT_COOKIE 解码失败:', e.message);
  }
}
ensureCookieFile();

const API_KEY = process.env.API_KEY || 'change-me';
const WEBSITE_URL = process.env.WEBSITE_URL || 'http://localhost:3000';
const API_BASE = process.env.API_BASE || WEBSITE_URL;
const POLL_INTERVAL = parseInt(process.env.BOT_INTERVAL_MS || '60000', 10);
const HEALTH_PORT = parseInt(process.env.BOT_HEALTH_PORT || '3001', 10);

// ---- Health check server ----
// Railway kills containers that don't listen on $PORT.
// The bot exposes a tiny HTTP server on BOT_HEALTH_PORT so Railway knows it's alive.

function startHealthServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('bot ok\n');
  });
  server.listen(HEALTH_PORT, () => {
    console.log(`💓 健康检查: http://0.0.0.0:${HEALTH_PORT}`);
  });
  return server;
}

// ---- Main ----

async function main() {
  console.log('╔═══════════════════════════╗');
  console.log('║  🎂 生日祝福 Bot 启动     ║');
  console.log('╚═══════════════════════════╝');
  console.log(`API:    ${API_BASE}`);
  console.log(`网站:   ${WEBSITE_URL}`);
  console.log(`间隔:   ${POLL_INTERVAL / 1000}s`);
  console.log(`健康:   :${HEALTH_PORT}\n`);

  // Health check — keep Railway happy
  const healthServer = startHealthServer();

  // Load config
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`❌ 配置文件不存在: ${CONFIG_PATH}`);
    process.exit(1);
  }
  const config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  console.log(`已加载 ${config.accounts.length} 个账号配置`);

  // Initialize clients — don't crash if one fails
  let clients = [];
  for (const acct of config.accounts) {
    const client = new XianyuClient(acct);
    const ok = await client.init();
    if (ok) {
      clients.push(client);
      console.log(`✅ 已初始化账号: ${acct.name}`);
    } else {
      console.log(`⚠️ 账号 ${acct.name} 初始化失败，将定期重试`);
      // Keep the failed client so we can retry later
      clients.push(client);
    }
  }

  // ---- Polling loop ----

  async function runPoll() {
    const timestamp = new Date().toISOString();
    console.log(`\n━━━ 轮询 ${timestamp} ━━━`);

    // Retry failed clients
    for (const client of clients) {
      if (!client.page) {
        console.log(`🔄 重试初始化: ${client.name}`);
        await client.init();
      }
    }

    const activeClients = clients.filter(c => c.page);
    if (activeClients.length === 0) {
      console.log('⚠️ 无可用浏览器，等待下次轮询...');
      return;
    }

    try {
      const count = await poll(config, activeClients, API_BASE, API_KEY, WEBSITE_URL);
      if (count > 0) console.log(`📊 本轮处理 ${count} 个新订单`);
    } catch (err) {
      console.error('轮询异常:', err.message);
    }
  }

  // Initial poll
  await runPoll();

  // Schedule recurring polls
  setInterval(runPoll, POLL_INTERVAL);
  console.log(`\n⏰ 定时器已启动，每 ${POLL_INTERVAL / 1000}s 轮询一次`);

  // ---- Graceful shutdown ----
  async function shutdown(signal) {
    console.log(`\n收到 ${signal}，正在关闭...`);
    healthServer.close();
    for (const client of clients) {
      await client.close().catch(() => {});
    }
    console.log('Bot 已停止');
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(err => {
  console.error('Bot 启动失败:', err);
  process.exit(1);
});
