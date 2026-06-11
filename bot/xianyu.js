// bot/xianyu.js
// Playwright-based Xianyu (闲鱼) client.
// Handles: login check via cookie, order list scraping, IM auto-reply.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',   // Railway: limited /dev/shm
  '--disable-gpu',
  '--single-process',           // Railway: reduce memory
];

class XianyuClient {
  constructor(accountConfig) {
    this.name = accountConfig.name;
    this.cookieFile = path.resolve(accountConfig.cookie_file);
    this.browser = null;
    this.context = null;
    this.page = null;
    this.loggedIn = false;
    this.consecutiveFails = 0;
  }

  log(msg) {
    console.log(`[${this.name}] ${msg}`);
  }

  async init() {
    try {
      this.browser = await chromium.launch({
        headless: true,
        args: BROWSER_ARGS
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      // Load saved cookies if available
      if (fs.existsSync(this.cookieFile)) {
        try {
          const cookies = JSON.parse(fs.readFileSync(this.cookieFile, 'utf-8'));
          await this.context.addCookies(cookies);
          this.log('已加载持久化 Cookie');
        } catch (e) {
          this.log(`Cookie 加载失败: ${e.message}`);
        }
      } else {
        this.log('⚠️ 未找到 Cookie 文件 — 无法登录闲鱼');
      }

      this.page = await this.context.newPage();
      this.consecutiveFails = 0;
      return true;
    } catch (err) {
      this.log(`浏览器初始化失败: ${err.message}`);
      this.browser = null;
      this.context = null;
      this.page = null;
      return false;
    }
  }

  // Recreate browser if it has died
  async ensureAlive() {
    if (this.page && this.browser && this.browser.isConnected()) {
      return true;
    }
    this.log('浏览器已断开，重新初始化...');
    await this.close();
    return await this.init();
  }

  async checkLogin() {
    if (!await this.ensureAlive()) return false;

    try {
      await this.page.goto('https://www.goofish.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await this.page.waitForTimeout(5000);

      const loggedIn = await this.page.evaluate(() => {
        const body = document.body ? document.body.innerText : '';
        const hasUserMenu = document.querySelector('[class*="user"], [class*="avatar"], [class*="User"]');
        return !!hasUserMenu && !body.includes('扫码登录');
      });

      this.loggedIn = loggedIn;
      this.consecutiveFails = loggedIn ? 0 : this.consecutiveFails + 1;
      this.log(loggedIn ? '✅ 已登录' : '⚠️ 登录态已过期');
      return loggedIn;
    } catch (err) {
      this.consecutiveFails++;
      this.log(`登录检查失败: ${err.message}`);
      // If we fail 3x in a row, force browser restart next time
      if (this.consecutiveFails >= 3) {
        this.log('连续失败，强制重启浏览器...');
        await this.close();
      }
      return false;
    }
  }

  async saveCookies() {
    if (!this.context) return;
    try {
      const cookies = await this.context.cookies();
      const dir = path.dirname(this.cookieFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.cookieFile, JSON.stringify(cookies, null, 2));
    } catch (e) {
      this.log(`Cookie 保存失败: ${e.message}`);
    }
  }

  async getOrders() {
    if (!await this.ensureAlive()) return [];
    if (!this.loggedIn) {
      this.log('未登录，跳过订单获取');
      return [];
    }

    try {
      await this.page.goto('https://www.goofish.com/im/sold', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await this.page.waitForTimeout(5000);

      const orders = await this.page.evaluate(() => {
        const seen = new Set();
        const text = document.body ? document.body.innerText : '';
        const matches = text.match(/\b\d{14,22}\b/g);
        if (matches) matches.forEach(m => seen.add(m));
        return Array.from(seen);
      });

      this.log(`发现 ${orders.length} 个候选订单号`);
      return orders;
    } catch (err) {
      this.log(`获取订单列表失败: ${err.message}`);
      return [];
    }
  }

  async sendMessage(orderNo, message) {
    if (!await this.ensureAlive()) return false;
    if (!this.loggedIn) {
      this.log('未登录，无法发送消息');
      return false;
    }

    try {
      await this.page.goto('https://www.goofish.com/im', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await this.page.waitForTimeout(4000);

      const conversationItems = await this.page.$$(
        '[class*="conversation"], [class*="chat-item"], [class*="ChatItem"], [class*="contact"]'
      );

      for (const item of conversationItems) {
        try {
          const text = await item.innerText();
          if (!text.includes(orderNo)) continue;

          await item.click();
          await this.page.waitForTimeout(2000);

          const input = await this.page.$(
            'textarea, [contenteditable="true"], [class*="input"], [class*="Input"]'
          );
          if (!input) continue;

          await input.click();
          await input.fill(message);
          await this.page.waitForTimeout(500);

          const sendBtn = await this.page.$(
            'button[class*="send"], button[class*="Send"], [class*="send-btn"]'
          );
          if (sendBtn) {
            await sendBtn.click();
          } else {
            await this.page.keyboard.press('Enter');
          }
          await this.page.waitForTimeout(1000);

          this.log(`✅ 已发送回复 → 订单 ${orderNo}`);
          return true;
        } catch (e) {
          continue;
        }
      }

      this.log(`⚠️ 未找到订单 ${orderNo} 对应的聊天`);
      return false;
    } catch (err) {
      this.log(`发送消息失败: ${err.message}`);
      return false;
    }
  }

  async close() {
    if (this.page) await this.page.close().catch(() => {});
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}

module.exports = XianyuClient;
