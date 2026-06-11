// bot/monitor.js
// Order polling loop: for each account, check login → get orders →
// call Website API → send auto-reply → mark processed.

const { isProcessed, markProcessed } = require('./storage');

async function poll(config, clients, apiBase, apiKey, websiteUrl) {
  const replyTemplate = config.reply.template;
  let newOrdersFound = 0;

  for (const client of clients) {
    console.log(`\n--- 轮询账号: ${client.name} ---`);

    // 1. Check login status
    const loggedIn = await client.checkLogin();
    if (!loggedIn) {
      console.log(`⚠️  ${client.name} — 登录态已过期，跳过本轮`);
      console.log(`   请在浏览器登录 goofish.com 后导出 Cookie 到 ${client.cookieFile}`);
      continue;
    }

    // 2. Persist cookies (refresh expiry)
    await client.saveCookies();

    // 3. Get order list
    const orders = await client.getOrders();
    if (orders.length === 0) {
      console.log(`  无新订单`);
      continue;
    }

    // 4. Process each new order
    for (const orderNo of orders) {
      if (isProcessed(orderNo)) continue;

      console.log(`  🆕 新订单: ${orderNo}`);

      try {
        // Call Website API to register the order and get its password
        const res = await fetch(`${apiBase}/api/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
          },
          body: JSON.stringify({ order_no: orderNo, account: client.name })
        });

        if (!res.ok) {
          console.error(`  ❌ API 错误 (${res.status}): ${await res.text()}`);
          continue;
        }

        const data = await res.json();
        const password = data.password;

        // Build the reply message from template
        const message = replyTemplate
          .replace(/\{password\}/g, password)
          .replace(/\{website_url\}/g, websiteUrl);

        // Send auto-reply via Xianyu IM
        const sent = await client.sendMessage(orderNo, message);
        if (sent) {
          markProcessed(orderNo, client.name, password);
          newOrdersFound++;
          console.log(`  ✅ 订单 ${orderNo} 处理完毕`);
        } else {
          console.log(`  ⚠️ 订单 ${orderNo} 回复发送失败，下轮重试`);
        }
      } catch (err) {
        console.error(`  ❌ 订单 ${orderNo} 处理异常: ${err.message}`);
      }
    }
  }

  return newOrdersFound;
}

module.exports = { poll };
