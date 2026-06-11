#!/usr/bin/env node
// bot/bot.js
// Xianyu Bot 入口 — 多账号轮询闲鱼订单，自动回复祝福密钥。

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const XianyuClient = require('./xianyu');
const { poll } = require('./monitor');

// Resolve paths relative to the bot/ directory
const CONFIG_PATH = process.env.BOT_CONFIG || path.join(__dirname, 'config.yaml');

// These come from the shared .env (loaded by dotenv in server.js; bot loads its own)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const API_KEY = process.env.API_KEY || 'change-me';
const WEBSITE_URL = process.env.WEBSITE_URL || 'http://localhost:3000';
const API_BASE = process.env.API_BASE || WEBSITE_URL;
const POLL_INTERVAL = parseInt(process.env.BOT_INTERVAL_MS || '60000', 10);

// ---- Main ----

async function main() {
  console.log('╔═══════════════════════════╗');
  console.log('║  🎂 生日祝福 Bot 启动     ║');
  console.log('╚═══════════════════════════╝');
  console.log(`API:  ${API_BASE}`);
  console.log(`网站: ${WEBSITE_URL}`);
  console.log(`间隔: ${POLL_INTERVAL / 1000}s\n`);

  // Load config
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`❌ 配置文件不存在: ${CONFIG_PATH}`);
    process.exit(1);
  }

  const config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  console.log(`已加载 ${config.accounts.length} 个账号配置`);

  // Initialize clients for each account
  const clients = [];
  for (const acct of config.accounts) {
    const client = new XianyuClient(acct);
    await client.init();
    clients.push(client);
    console.log(`✅ 已初始化账号: ${acct.name}`);
  }

  // ---- Polling loop ----

  async function runPoll() {
    const timestamp = new Date().toISOString();
    console.log(`\n━━━ 轮询 ${timestamp} ━━━`);
    try {
      const count = await poll(config, clients, API_BASE, API_KEY, WEBSITE_URL);
      if (count > 0) {
        console.log(`\n📊 本轮处理 ${count} 个新订单`);
      }
    } catch (err) {
      console.error('轮询异常:', err);
    }
  }

  // Initial poll
  await runPoll();

  // Schedule recurring polls
  const timer = setInterval(runPoll, POLL_INTERVAL);
  console.log(`\n⏰ 定时器已启动，每 ${POLL_INTERVAL / 1000}s 轮询一次`);

  // ---- Graceful shutdown ----
  async function shutdown(signal) {
    console.log(`\n收到 ${signal}，正在关闭...`);
    clearInterval(timer);
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
