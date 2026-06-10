# Birthday Blessing Generator — 闲鱼集成设计

**Date:** 2026-06-10
**Status:** Draft — 待用户审阅
**Base:** 2026-06-06-birthday-blessing-design.md（原生日祝福生成器设计）

## 概述

在原有生日祝福生成器网站基础上，增加闲鱼（Xianyu）App 全流程自动化集成：

1. Bot 监控闲鱼多个账号的指定商品订单
2. 检测到新订单 → 调 Website API，HMAC-SHA256 从订单号派生密码
3. Bot 在闲鱼 IM 自动回复顾客（密码 + 网站链接）
4. 顾客拿密码访问网站 `/verify` → 验证通过 → 进入 `/create` 创建祝福
5. 密码 24 小时有效

---

## 整体架构

```
┌──────────────────────────────────────────────────┐
│              云服务器 (Railway)                    │
│                                                    │
│  ┌─────────────────────┐  ┌──────────────────────┐│
│  │  Express Website     │  │  Playwright Bot       ││
│  │  (端口 3000)         │◄─│  (独立进程)            ││
│  │                      │  │                       ││
│  │  GET  /              │  │  多账号轮询            ││
│  │  GET  /verify        │  │  检测新订单 → 调 API   ││
│  │  GET  /create?token= │  │  IM 自动回复密码       ││
│  │  GET  /b/:id         │  │  Cookie 持久化         ││
│  │  POST /api/create    │  │                       ││
│  │  POST /api/verify    │  └──────────────────────┘│
│  │  POST /api/orders    │                          │
│  │  GET  /api/orders/pending │                     │
│  └─────────────────────┘                          │
└──────────────────────────────────────────────────┘
         ▲                          │
         │                          ▼
    顾客访问网站             闲鱼 App/Web
    (输入密码→创建祝福)       (顾客下单→收到密码)
```

两个进程同台服务器，Website 对外暴露端口，Bot 仅内部调用 Website API。

---

## 密码系统

```
订单号 "1234567890"
    │
    ▼
HMAC-SHA256(order_no, SECRET_KEY)
    │
    ▼
取前 8 位 base62 → "Kx7Pq2R9"
    │
    ▼
顾客在 /verify 输入 "Kx7Pq2R9"
    │
    ▼
Website 遍历 orders 表中所有未过期订单号，
逐个 HMAC 比对 → 匹配成功则验证通过
    │
    ▼
有效期检查：created_at + 24h > now？
    ├─ 是 → 创建 session token，跳转 /create
    └─ 否 → "密钥已过期，请联系卖家重新获取"
```

### 密码配置

| 参数 | 值 | 说明 |
|------|-----|------|
| 算法 | HMAC-SHA256 | 单向不可逆 |
| 编码 | base62 | 大小写字母+数字，无歧义字符 |
| 长度 | 8 位 | 碰撞风险极低（62^8 ≈ 2×10^14） |
| 有效期 | 24 小时 | 可配置 |
| 密钥 | 环境变量 `HMAC_SECRET` | 服务器端唯一 |

---

## 数据库

### 新增表: orders

```sql
CREATE TABLE orders (
    id          TEXT PRIMARY KEY,          -- 8-char random alphanumeric
    order_no    TEXT NOT NULL UNIQUE,      -- 闲鱼订单号
    account     TEXT NOT NULL,             -- 哪个闲鱼账号的订单
    status      TEXT DEFAULT 'pending',    -- pending | replied | expired
    created_at  TEXT NOT NULL              -- ISO timestamp
);
```

### 修改表: blessings

在原有 blessings 表上新增字段：

```sql
ALTER TABLE blessings ADD COLUMN order_id TEXT REFERENCES orders(id);
ALTER TABLE blessings ADD COLUMN verified  INTEGER DEFAULT 0;  -- 0=未验证密码, 1=已验证
```

### 完整 blessings 表结构

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | 8-char random alphanumeric |
| name | TEXT | 祝福接收人姓名 |
| photo | TEXT | 照片路径，可为空 |
| template | TEXT | 模板 ID，默认 "default" |
| message | TEXT | 自定义祝福消息 |
| sender | TEXT | 发送者署名 |
| birthday | TEXT | 生日日期 |
| order_id | TEXT FK → orders.id | 关联订单，可为空（直接访问创建的不需要） |
| verified | INTEGER | 密码验证标记，默认 0 |
| created_at | TEXT | ISO timestamp |

---

## 路由设计

### Website 路由（完整）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | / | 无 | 首页（引导到 /verify 或 /b/:id） |
| GET | /verify | 无 | 密码验证页 |
| POST | /api/verify | 无 | 提交密码 → 返回 {valid, token, redirect} |
| GET | /create?token=xxx | token | 创建祝福表单页，无 token 重定向 /verify |
| POST | /api/create | token | 创建祝福 → 返回 {url, qrcode} |
| GET | /b/:id | 无 | 祝福展示页 |
| GET | /api/blessing/:id | 无 | 祝福 JSON 数据 |
| GET | /404 | 无 | 404 页面 |

### Bot 专用路由（内部，建议加 API Key）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/orders | Bot 传入 {order_no, account} → 创建记录 + 返回 {password} |
| GET | /api/orders/pending | Bot 查待回复订单 → 返回 [{order_no, password, account}] |

### Session Token

- JWT，有效期 1 小时（创建祝福的窗口时间）
- 携带 order_id，创建祝福时绑定订单关系
- 验证通过后由 `/api/verify` 签发

---

## Bot 设计

### 多账号架构

```
Bot 进程
├── Account A (主号)
│   ├── Playwright BrowserContext → cookie 独立存储
│   └── 轮询：https://goofish.com/... → 订单列表
│
└── Account B (小号)
    ├── Playwright BrowserContext → cookie 独立存储
    └── 轮询：同商品 → 订单列表
```

### 主循环

```
每 60 秒：
  for each account:
    ① 检查 cookie 是否有效 → 无效则跳过并通知
    ② 打开"已卖出的宝贝"页面
    ③ 解析订单列表，提取订单号
    ④ 对比本地 SQLite（已处理集合）
    ⑤ 发现新订单 → POST /api/orders → 拿到密码
    ⑥ 进入该订单聊天 → 发送回复模板
    ⑦ 标记已处理
```

### 回复模板

```
您好，您的祝福密钥是：{password}
请在 24 小时内访问 {website_url}/verify
输入密钥即可创建专属生日祝福 🎂🎉
```

### 失败处理

| 场景 | 处理 |
|------|------|
| Cookie 过期 | 标记该账号暂停，记录日志，发送通知 |
| 订单列表解析失败 | 重试 3 次，仍失败则跳过本轮 |
| API 调用失败 | 重试 3 次，仍失败则跳过该订单（下一轮重试） |
| IM 发送失败 | 订单标记为 replied=false，下轮重试 |
| 浏览器崩溃 | 重启浏览器实例 |

### 通知渠道

Cookie 过期、连续失败等异常通过以下方式通知卖家：
- Telegram Bot（首选，免费）
- 或写入日志文件，配合 Monitor 监控

---

## UI 页面

### /verify — 密码验证页

```
┌──────────────────────────┐
│   🎂                      │
│                          │
│   输入你的祝福密钥        │
│                          │
│   ┌──────────────────┐   │
│   │ K x 7 P q 2 R 9  │   │  ← 大字号等宽，自动转大写
│   └──────────────────┘   │
│                          │
│   [ 验证 ]               │
│                          │
│   错误："密钥无效或已过期" │  ← 红色 + 抖动动画
└──────────────────────────┘
```

- 手机端优先设计（顾客大多在手机上操作）
- 输入自动转大写，去除空格
- 验证失败抖动动画
- 验证成功 300ms 后跳转

### /create — 创建祝福（修改）

- 原有表单设计不变
- 必须带 `?token=xxx` 参数才能访问
- 无 token → 302 重定向到 /verify
- 表单提交时附带 token
- 后端验证 token → 提取 order_id → 创建 blessing 并关联

### / — 首页（修改）

原来直接是创建表单，改为引导页：
- 显示简短介绍
- "已有密钥？去验证" 按钮 → /verify
- "查看祝福" 链接 → 输入祝福 ID

---

## 目录结构（最终）

```
birthday-blessing/
├── server.js                 # Website 入口
├── db.js                     # 数据库初始化 + 查询
├── package.json
├── .env                      # HMAC_SECRET, API_KEY
├── bot/
│   ├── bot.js                # Bot 入口进程
│   ├── config.yaml           # 账号配置、轮询间隔等
│   ├── monitor.js            # 订单监控逻辑
│   ├── xianyu.js             # 闲鱼页面交互封装
│   ├── cookies/              # 持久化 cookie
│   │   ├── account-a.json
│   │   └── account-b.json
│   └── storage/              # Bot 本地状态
│       └── processed.db      # 已处理订单号（SQLite）
├── public/
│   ├── css/
│   ├── js/
│   └── uploads/
├── views/
│   ├── index.ejs             # 首页（改）
│   ├── verify.ejs            # 密码验证页（新增）
│   ├── create.ejs            # 创建祝福页（改，加 token 守卫）
│   ├── blessing.ejs          # 祝福展示页（不变）
│   └── 404.ejs
└── docs/
    └── superpowers/
        └── specs/
            ├── 2026-06-06-birthday-blessing-design.md
            └── 2026-06-10-xianyu-integration-design.md
```

---

## 错误处理（新增）

| 场景 | 响应 |
|------|------|
| 密码为空 | 400 "请输入密钥" |
| 密码格式错误 | 400 "密钥格式不正确" |
| 密码无效 | 401 "密钥无效或已过期" |
| 密码已过期 (>24h) | 410 "密钥已过期，请联系卖家获取新密钥" |
| Token 缺失访问 /create | 302 → /verify |
| Token 无效或过期 | 401 "页面已过期，请重新验证" |
| API Key 缺失（Bot 接口） | 403 |
| 订单号重复 | 200（幂等，返回已有密码） |

---

## 环境变量

```bash
PORT=3000
HMAC_SECRET=xxxx          # 密码派生密钥（必填）
JWT_SECRET=xxxx           # Session token 密钥（必填）
API_KEY=xxxx              # Bot API 认证密钥（必填）
BOT_ENABLED=true          # 是否启动 Bot
BOT_CONFIG=./bot/config.yaml
```

---

## 技术选型补充

| 用途 | 选型 | 说明 |
|------|------|------|
| Bot 浏览器自动化 | Playwright (Node.js) | 与 Website 同语言，同进程管理 |
| Session Token | JWT (jsonwebtoken) | 轻量，无需服务端 session |
| HMAC | Node.js 内置 crypto | 零依赖 |
| Bot 配置 | YAML (js-yaml) | 可读性好 |
| Bot 通知 | node-telegram-bot-api | 可选，Cookie 过期通知 |
