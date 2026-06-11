# 🎂 生日祝福生成器

一个带闲鱼自动回复的生日祝福页面生成器。

## 功能

- 闲鱼下单后 Bot 自动回复顾客 8 位祝福密钥
- 顾客输入密钥验证后创建专属生日祝福页面
- 支持照片上传、语音录制、多种祝福模板
- 自动生成祝福链接 + 二维码
- 响应式设计，手机端友好

## 快速开始

```bash
npm install
cp .env.example .env   # 编辑 .env 填入密钥
# 编辑 bot/config.yaml 填入闲鱼账号配置
npm start              # 启动网站 → http://localhost:3000
npm run bot            # 启动 Bot（另一个终端）
```

## 闲鱼 Bot 使用

1. 用 Chrome 打开 [goofish.com](https://www.goofish.com) 并登录
2. F12 → Application → Cookies → 导出为 JSON
3. 保存到 `bot/cookies/account-a.json`
4. `npm run bot` 启动自动回复

## 部署 Railway

1. Fork 本仓库
2. Railway 新建项目 → 选择仓库
3. 设置环境变量（`.env.example`）
4. Procfile 自动运行 `web` + `bot` 两个服务

## 技术栈

Node.js · Express · EJS · SQLite · Playwright · JWT · QRCode
