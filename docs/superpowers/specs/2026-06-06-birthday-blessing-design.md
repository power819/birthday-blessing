# Birthday Blessing Generator — Design Spec

**Date:** 2026-06-06
**Status:** Approved

## Overview

A web application that lets users create personalized birthday blessing pages. Users fill in a form (name, photo, template, custom message, sender name, birthday date), and the system generates a unique URL + QR code. Scanning the QR code opens a beautifully styled blessing page with the recipient's name, photo, and message.

## Architecture

```
Browser
  ├── GET /            → Creation form page
  ├── GET /b/:id       → Blessing display page (what QR code links to)
  ├── POST /api/create → Create blessing, returns {url, qrcode_data_url}
  └── GET /api/blessing/:id → Get blessing JSON data

Express Server (Node.js)
  ├── routes/          → Route handlers
  ├── db.js            → SQLite via better-sqlite3
  ├── public/uploads/  → Uploaded photos
  └── views/           → EJS templates
```

## Data Model

**blessings table (SQLite):**

| Column     | Type | Notes |
|------------|------|-------|
| id         | TEXT PK | 8-char random alphanumeric |
| name       | TEXT | Required |
| photo      | TEXT | File path relative to public/, nullable |
| template   | TEXT | Template ID, default "default" |
| message    | TEXT | Custom message override, nullable |
| sender     | TEXT | Sender signature, nullable |
| birthday   | TEXT | Birthday date, nullable |
| created_at | TEXT | ISO timestamp |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | / | Creation form page |
| GET | /b/:id | Blessing display page |
| POST | /api/create | Multipart form → creates blessing → returns `{id, url, qrcode}` |
| GET | /api/blessing/:id | JSON of blessing data |

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express
- **Database:** SQLite via `better-sqlite3`
- **Templates:** EJS
- **File upload:** `multer`
- **QR Code:** `qrcode` npm package
- **Frontend:** Native HTML + CSS + minimal JS (fetch-based form submission)
- **Deployment:** Vercel / Railway (free tier)

## UI Pages

### Creation Form (/)
- Birthday-themed design (balloons, cake, warm colors)
- Form fields: name (required), photo upload (optional, jpg/png/webp, max 5MB), template selector, custom message (optional), sender name (optional), birthday date (optional)
- On submit: POST /api/create via fetch, show generated QR code + blessing URL
- Copy link button + download QR code button

### Blessing Page (/b/:id)
- Warm, festive design
- Photo prominently displayed (if uploaded)
- Recipient name
- Blessing message (from template + custom)
- Sender signature
- Emoji decorations (🎂🎉🎈🎁)
- Responsive design for mobile (since most scans are from phones)

## Blessing Templates

1. **default** — "亲爱的{name}，祝你生日快乐！愿你新的一岁充满阳光与欢笑，所有的梦想都能一一实现。"
2. **warm** — "{name}，生日快乐！感谢生命中有你，愿你的每一天都如今天般甜蜜温暖。"
3. **fun** — "嘿 {name}！又长大一岁啦～愿你的生活像蛋糕一样甜，像礼物一样充满惊喜！"
4. **simple** — "{name}，生日快乐！愿你健康、快乐、幸福。"

## Error Handling

- Name required: validated both client-side and server-side
- Photo: size limit 5MB, type whitelist (image/jpeg, image/png, image/webp)
- Invalid blessing ID → 404 page with link back to home
- File upload failure → blessing created without photo (graceful degradation)
- Server errors → generic error message (don't leak internals)

## Directory Structure

```
birthday-blessing/
├── server.js              # Entry point
├── db.js                  # Database init + helpers
├── package.json
├── public/
│   └── uploads/           # Uploaded photos
├── views/
│   ├── index.ejs          # Creation form
│   ├── blessing.ejs       # Blessing display page
│   └── 404.ejs            # Not found page
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-06-06-birthday-blessing-design.md
```
