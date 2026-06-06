# 时光礼物 · 设计规格书

**日期**: 2026-06-06
**状态**: 已确认
**技术栈**: Next.js (App Router) + TailwindCSS + Framer Motion + GSAP

---

## 1. 项目概述

《时光礼物》是一个高端生日纪念网站。创建者上传照片/语音/视频/祝福信，生成二维码分享给寿星。寿星扫码后，体验像观看一部专属微电影——从电影级开场动画到烟花结尾，整个过程如同翻阅一本精致的时光画册。

## 2. 入口架构

- `/create` — 创建者页面：上传表单，生成二维码
- `/b/[id]` — 观看者页面：微电影长卷轴体验
- `/` — 重定向到 `/create`
- API:
  - `POST /api/create` — 上传媒体文件 + 写入 SQLite，返回 ID 和二维码
  - `GET /api/blessing/[id]` — 返回 blessing JSON

## 3. 数据模型

### SQLite 表

```sql
CREATE TABLE blessings (
  id          TEXT PRIMARY KEY,           -- 8位 hex
  name        TEXT NOT NULL,              -- 主角姓名
  birthday    TEXT,                       -- 生日日期 (YYYY-MM-DD)
  photos      TEXT,                       -- JSON 数组: ["/uploads/p1.jpg",...]
  voice       TEXT,                       -- 语音文件路径
  video_url   TEXT,                       -- 视频 URL 或路径
  letter      TEXT,                       -- 生日信文本 (支持简单 Markdown)
  easter_egg  TEXT,                       -- 彩蛋配置 JSON
  sender      TEXT,                       -- 发送人署名
  created_at  TEXT DEFAULT (datetime('now'))
);
```

### TypeScript 类型

```typescript
interface Blessing {
  id: string;
  name: string;
  birthday: string | null;
  photos: string[];          // 最多12张
  voice: string | null;
  videoUrl: string | null;
  letter: string | null;
  easterEgg: EasterEgg | null;
  sender: string | null;
  createdAt: string;
}

interface EasterEgg {
  trigger: string;           // 按钮文字
  type: 'confetti' | 'message' | 'animation' | 'surprise';
  content: string;           // 彩蛋内容
}
```

### 配置 JSON 示例

```json
{
  "name": "小萱",
  "birthday": "2025-06-06",
  "photos": ["/uploads/photo1.jpg"],
  "voice": "/uploads/blessing.webm",
  "videoUrl": null,
  "letter": "亲爱的小萱...\n\n生日快乐！",
  "easterEgg": { "trigger": "点击蛋糕", "type": "confetti", "content": "" },
  "sender": "爱你的朋友们"
}
```

## 4. 项目结构

```
birthday-blessing/              # 新建在 projects 下独立目录
├── src/
│   ├── app/
│   │   ├── layout.tsx              # 全局 layout
│   │   ├── page.tsx                # → redirect /create
│   │   ├── globals.css             # Tailwind + CSS 变量
│   │   ├── create/
│   │   │   └── page.tsx            # 创建者表单页
│   │   ├── b/
│   │   │   └── [id]/
│   │   │       └── page.tsx        # 微电影观看页
│   │   └── api/
│   │       ├── create/route.ts     # POST 上传+存储
│   │       └── blessing/[id]/route.ts  # GET blessing 数据
│   ├── components/
│   │   ├── film/
│   │   │   ├── FilmContainer.tsx   # 总编排：scroll-driven 动画
│   │   │   ├── IntroSequence.tsx   # 帧1：电影级开场
│   │   │   ├── BirthdayHero.tsx    # 帧2：主角展示
│   │   │   ├── VoiceBlessing.tsx   # 帧3：语音播放器
│   │   │   ├── PhotoTimeline.tsx   # 帧4：照片时间轴
│   │   │   ├── VideoMessage.tsx    # 帧5：视频祝福
│   │   │   ├── BirthdayLetter.tsx  # 帧6：生日信
│   │   │   ├── EasterEgg.tsx       # 帧7：彩蛋互动
│   │   │   └── FireworksFinale.tsx # 帧8：烟花结尾
│   │   ├── ui/
│   │   │   ├── ParticleField.tsx   # 粒子系统
│   │   │   ├── SparkleText.tsx     # 闪光文字
│   │   │   ├── ParallaxLayer.tsx   # 视差层
│   │   │   ├── FadeReveal.tsx      # 淡入显形
│   │   │   └── AudioVisualizer.tsx # 音频波形
│   │   └── create/
│   │       ├── UploadForm.tsx      # 主表单
│   │       ├── PhotoUploader.tsx   # 照片上传
│   │       ├── VoiceRecorder.tsx   # 浏览器录音
│   │       ├── VideoUploader.tsx   # 视频上传
│   │       └── QrCodeCard.tsx      # 结果卡片
│   ├── lib/
│   │   ├── db.ts                   # better-sqlite3 封装
│   │   ├── types.ts                # TypeScript 类型
│   │   └── config.ts               # 默认配置
│   └── app/globals.css
├── public/uploads/                 # 媒体文件存储
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.ts
```

## 5. 视觉设计系统

### 5.1 色彩

| Token | 值 | 用途 |
|-------|-----|------|
| `bg-deep` | `#0a0a0f` | 最深背景（开场、烟花） |
| `bg-base` | `#13131a` | 主体背景 |
| `bg-elevated` | `#1c1c26` | 卡片、信息区 |
| `text-primary` | `#f0f0f5` | 主要文字 |
| `text-secondary` | `#8a8a9a` | 辅助信息 |
| `text-muted` | `#4a4a5a` | 时间戳、小标注 |
| `accent-gold` | `#d4a843` | 名字高亮、重要按钮 |
| `accent-warm` | `#e07040` | 语音波、信纸边缘 |
| `accent-cool` | `#60a0c0` | 时间轴标注 |

### 5.2 字体层级

| 层级 | 大小 | 字重 | 用途 |
|------|------|------|------|
| Heading XL | 48px (5xl) | 300 | 主角名字 |
| Heading L | 30px (3xl) | 300 | 章节标题 |
| Body | 16px (base) | 400 | 正文 |
| Caption | 14px (sm) | 400 | 辅助说明 |
| Label | 12px (xs) | 400 | 标签、tracking-widest |

### 5.3 间距与布局

- 基础间距：8px 网格
- 帧间距：每帧 100vh（占满一屏）
- 最大内容宽度：640px（移动端舒适阅读宽度）
- 水平内边距：24px（移动）/ 40px（桌面）
- 纵向内边距：20vh（帧内内容不贴边）

### 5.4 材质

- 卡片：`bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl`
- 照片框：`border border-white/15 rounded-xl`
- 按钮：`bg-white/10 hover:bg-white/15 backdrop-blur transition-colors`
- 信纸底：`bg-[#1a1a24] rounded-xl p-8 border-l-2 border-accent-warm`

### 5.5 禁用清单

- ❌ 粉色系 → ✅ 暗色 + 金色点缀
- ❌ emoji → ✅ 内联 SVG 图标
- ❌ 线性渐变背景 → ✅ 径向光晕 + 粒子
- ❌ 卡通插画 → ✅ 抽象几何/光影/照片
- ❌ 廉价阴影 `box-shadow` → ✅ 微妙的 `border` + `backdrop-blur`
- ❌ Comic Sans / 手写体 → ✅ 系统字体栈

## 6. 动画编排

### 6.1 工具分工

| 工具 | 用途 |
|------|------|
| **GSAP ScrollTrigger** | 滚动驱动的帧进出、parallax、时间轴绑定 |
| **Framer Motion** | 交互反馈（按钮 hover/tap）、元素进出、彩蛋动效 |
| **Canvas 2D** | 粒子系统、烟花（为性能定制） |

### 6.2 逐帧时间线

| 帧 | 名称 | 触发 | 描述 |
|----|------|------|------|
| 1 | 开场 | 页面加载 | 粒子从中心散开，标题淡入，光晕缩小，引导箭头 |
| 2 | 主角 | 进入视口 30% | 名字从模糊→清晰 (filter: blur → 0)，生日数字翻转 |
| 3 | 语音 | 进入视口 40% | 音频波形从底部升起，播放按钮呼吸脉冲 |
| 4 | 照片 | 进入视口 30% | 水平滚动胶片感，每张依次放大→复位 (scrub) |
| 5 | 视频 | 进入视口 50% | 设备边框降下，视频自动静音播放，离开暂停 |
| 6 | 生日信 | 进入视口 30% | 信纸从信封抽出，文字逐段淡入 (stagger 0.15s) |
| 7 | 彩蛋 | 进入视口 40% | 按钮悬浮脉冲，点击触发惊喜（五彩纸屑/隐藏消息） |
| 8 | 烟花 | 进入视口 60% | Canvas 粒子烟花自动循环，用户可继续滚动结束 |

### 6.3 过渡逻辑

- 帧间：当前帧 opacity 0.3→0，下一帧从下方淡入 (y: 40px→0, opacity 0→1)
- 帧内元素：stagger 0.1s–0.3s 延迟
- Parallax：背景 0.5x 滚动速度，前景 1x

### 6.4 性能策略

- `will-change` 仅用于当前正在动画的元素
- ScrollTrigger 使用 `scrub: true` 平滑跟手
- 移动端粒子数上限 60（桌面 200）
- 视频仅进入视口 50%+ 时加载（IntersectionObserver）
- 照片使用 Next.js `next/image` 自动优化

## 7. 技术决策

### 7.1 存储

本地文件系统存储媒体文件 (`public/uploads/`)，SQLite 存元数据。与现有项目保持一致。后续可迁移至 Supabase Storage。

### 7.2 二维码

使用 `qrcode` npm 包在服务端生成 data URL，创建页面展示并支持下载。

### 7.3 移动端优先

- 设计基准宽度：375px（iPhone SE）
- 所有帧在 320px–430px 宽度内完美呈现
- 使用 `touch-action: pan-y` 确保滚动流畅
- 音频/视频自动播放需处理移动端限制（显示手动触发按钮）

## 8. 未纳入功能（YAGNI）

以下功能在本次不实现，后续视需求迭代：
- 多语言支持
- 社交媒体直接分享（除二维码外）
- 用户账户系统 / 登录
- 统计访问量
- 评论功能
- 多个祝福合集页
- 管理后台
