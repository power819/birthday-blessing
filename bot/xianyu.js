// bot/xianyu.js
// Playwright-based Xianyu (闲鱼) client.
// Handles: login check via cookie, order list scraping, IM auto-reply.

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
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
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
      this.log('未找到 Cookie 文件，请先手动登录并导出 Cookie');
    }

    this.page = await this.context.newPage();
  }

  async checkLogin() {
    if (!this.page) return false;
    try {
      await this.page.goto('https://www.goofish.com', {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });
      await this.page.waitForTimeout(4000);

      // Check if we see logged-in indicators (user menu, avatar, etc.)
      const loggedIn = await this.page.evaluate(() => {
        const body = document.body.innerText || '';
        // If the page shows "登录" prominently and no user info, we're logged out
        const hasLoginButton = document.querySelector('[class*="login"], [class*="Login"]');
        const hasUserMenu = document.querySelector('[class*="user"], [class*="avatar"], [class*="User"]');
        // Heuristic: if there's user-related element and no prominent login prompt
        return !!hasUserMenu && !body.includes('扫码登录');
      });

      this.loggedIn = loggedIn;
      this.log(loggedIn ? '✅ 已登录' : '⚠️ 登录态已过期');
      return loggedIn;
    } catch (err) {
      this.log(`登录检查失败: ${err.message}`);
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
      this.log('Cookie 已保存');
    } catch (e) {
      this.log(`Cookie 保存失败: ${e.message}`);
    }
  }

  // Scrape order numbers from the sold items page.
  // Returns an array of unique order number strings.
  async getOrders() {
    if (!this.page || !this.loggedIn) {
      this.log('未登录，跳过订单获取');
      return [];
    }

    try {
      // Navigate to the sold items page
      await this.page.goto('https://www.goofish.com/im/sold', {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });
      await this.page.waitForTimeout(5000);

      // Extract order numbers from the page.
      // Xianyu order numbers are typically long digit strings.
      const orders = await this.page.evaluate(() => {
        const seen = new Set();
        const text = document.body.innerText || '';
        // Match digit strings of 14-22 chars (typical order number length)
        const matches = text.match(/\b\d{14,22}\b/g);
        if (matches) {
          matches.forEach(m => seen.add(m));
        }
        return Array.from(seen);
      });

      this.log(`发现 ${orders.length} 个候选订单号`);
      return orders;
    } catch (err) {
      this.log(`获取订单列表失败: ${err.message}`);
      return [];
    }
  }

  // Send an auto-reply message to the buyer of a specific order.
  async sendMessage(orderNo, message) {
    if (!this.page || !this.loggedIn) {
      this.log('未登录，无法发送消息');
      return false;
    }

    try {
      // Go to IM page
      await this.page.goto('https://www.goofish.com/im', {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });
      await this.page.waitForTimeout(4000);

      // Try to find the conversation containing this order number
      const conversationItems = await this.page.$$(
        '[class*="conversation"], [class*="chat-item"], [class*="ChatItem"], [class*="contact"]'
      );

      for (const item of conversationItems) {
        try {
          const text = await item.innerText();
          if (text.includes(orderNo)) {
            await item.click();
            await this.page.waitForTimeout(2000);

            // Find the message input
            const input = await this.page.$(
              'textarea, [contenteditable="true"], [class*="input"], [class*="Input"]'
            );
            if (!input) {
              this.log('未找到消息输入框');
              continue;
            }

            await input.click();
            await input.fill(message);
            await this.page.waitForTimeout(500);

            // Find and click send button
            const sendBtn = await this.page.$(
              'button[class*="send"], button[class*="Send"], [class*="send-btn"]'
            );
            if (sendBtn) {
              await sendBtn.click();
              await this.page.waitForTimeout(1000);
              this.log(`✅ 已发送回复 → 订单 ${orderNo}`);
              return true;
            }

            // Try pressing Enter as fallback
            await this.page.keyboard.press('Enter');
            await this.page.waitForTimeout(1000);
            this.log(`✅ 已发送回复(Enter) → 订单 ${orderNo}`);
            return true;
          }
        } catch (e) {
          // Individual conversation parsing failure is non-fatal
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
  }
}

module.exports = XianyuClient;
