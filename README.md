# Aurora Face · 颜值评分系统

> 如同在极光深处的水晶球中窥见自己的容颜——不是冷冰冰的打分，而是一场关于「美」的仪式感旅程。

基于 AI 视觉模型的人脸美学分析系统，从对称美、协调美、精致美、气质美、魅力值五个维度给出评分，并附上个性化评语。

## 功能特性

- **照片上传** — 支持拖拽上传和点击选择（JPG / PNG / WebP）
- **摄像头拍照** — 调用前置摄像头实时取景
- **AI 五维评分** — 豆包 Vision 模型分析，0-99 综合评分
- **水晶球动画** — 极光粒子 + 虹彩玻璃态 + 仪式感逐帧揭示
- **高分照片画廊** — 评分超过阈值自动存档
- **Web 分享** — 支持 Web Share API 一键分享

## 技术栈

- **前端**: 纯 HTML + CSS + JavaScript，face-api.js 人脸检测
- **后端**: Node.js 原生 HTTP 服务，无框架依赖
- **AI 模型**: 豆包 ARK Vision API（doubao-seed-2-0）
- **动效**: Canvas 星空粒子、CSS 极光渐变、SVG 环形进度

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/wuqds/ai-.git
cd ai-
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入你的豆包 ARK API Key：

```
ARK_API_KEY=your-api-key-here
```

### 4. 启动服务

```bash
npm start
```

访问 http://127.0.0.1:3000 即可使用。

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `PORT` | 否 | `3000` | 服务端口 |
| `ARK_API_KEY` | **是** | — | 豆包 ARK API 密钥 |
| `SAVED_PHOTOS_DIR` | 否 | `saved-photos/` | 高分照片存储目录 |

## 项目结构

```
├── backend/server.js      # Node.js 后端服务
├── frontend/index.html    # 前端单页应用
├── .env.example           # 环境变量模板
└── package.json
```

## 许可

MIT
