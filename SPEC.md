# Aurora Face · 颜值评分系统 · 设计规范

## 1. Concept & Vision

**「镜花水月」** — 一个如同在极光深处的神秘水晶球中窥见自己容颜的体验。
不是冷冰冰的打分，而是一场关于"美"的仪式感旅程。深邃的夜空背景、流光溢彩的极光色彩、如同水晶折射般的粒子动画，让用户在上传照片或拍照的那一刻就感受到：这不是普通的脸部识别，这是一次与自己的超维邂逅。

美学方向：**极光水晶 · 宇宙神秘 · 精致奢华**
差异化：全球首创「水晶球评分」视觉隐喻，极光粒子系统 + 虹彩玻璃态 + 仪式感逐帧动画。

---

## 2. Design Language

### Aesthetic Direction
极光水晶（Aurora Crystal）— 深邃宇宙 + 流光极光 + 玻璃态拟物。灵感来源：极光现象、水晶折射、iPhone 动态壁纸的流体质感。

### Color Palette
| Role | Hex | Usage |
|---|---|---|
| Background | `#050510` | 夜空深色底 |
| Surface | `#0d0d2b` | 卡片背景 |
| Aurora Violet | `#a78bfa` | 主强调色 |
| Aurora Cyan | `#22d3ee` | 辅强调色 |
| Aurora Rose | `#fb7185` | 高亮点缀 |
| Aurora Gold | `#fbbf24` | 分数高光 |
| Glass Border | `rgba(167,139,250,0.2)` | 玻璃边框 |
| Text Primary | `#f8fafc` | 主文字 |
| Text Secondary | `#94a3b8` | 辅助文字 |

### Typography
- **Display**: `Cinzel` (Google Fonts) — 典雅衬线，用于标题和分数
- **Body**: `Noto Sans SC` (Google Fonts) — 中文正文
- **Mono**: `JetBrains Mono` — 数字和技术展示

### Motion Philosophy
- **页眉渐入**: 元素依次从下方淡入上升，stagger 100ms
- **极光背景**: 三层渐变 blob 持续缓慢漂移，营造活的光效
- **粒子系统**: Canvas 星空 + 连线动画（80粒子，鼠标排斥）
- **水晶球效果**: 圆形容器内图片变形折射
- **分数揭示**: 环形进度 + 数字逐位跳动 + 评语淡入
- **所有悬停**: `cubic-bezier(0.34, 1.56, 0.64, 1)` 弹性曲线

---

## 3. Layout & Structure

```
[极光动态背景层 — 全屏 canvas星粒子 + 三色blob漂移]
[噪声纹理叠加层 — 微妙的颗粒感]

[顶部导航栏] — Logo + 标题 + 语言切换
    ↓
[Hero区] — 主标题 + 副标题
    ↓
[功能卡片区] — 极光水晶美学 / AI人脸检测 / 五维颜值评分
    ↓
[上传区 — 水晶球形态] — 点击/拖拽上传
    ↓
[极光取景区 — 玻璃态卡片] — 摄像头拍照（本地处理）
    ↓
[预览区] — 上传后：人脸检测 + 特征点标注 + 分析动画
    ↓
[评分区 — 水晶球揭示]
    [分析过程: 三项子维度 + 进度动画]
    [分数揭示: 环形进度 → 分数 + 评语 + 五维雷达图]
    ↓
[分享区] — 社交分享按钮
    ↓
[底部] — 版权 + 致谢
```

---

## 4. Features & Interactions

### 核心功能

**① 照片上传**
- 拖拽上传（dragover 极光发光边框）
- 点击选择文件
- 支持格式：JPG / PNG / WebP，≤ 10MB
- 支持摄像头拍照（getUserMedia，前置自拍）

**② 人脸检测与分析**
- face-api.js（TinyFaceDetector + 68点landmark，本地 TensorFlow.js）
- 分析维度：
  - 对称度 Symmetry：左右面部关键点偏移
  - 协调度 Harmony：五官比例接近黄金比例程度
  - 精致度 Refinement：下颚宽度与面高的比例质量
- 总体分数 = 三项加权平均，映射到 0-99

**③ 水晶球评分揭示**
- 环形进度 SVG 动画（stroke-dashoffset）
- 数字逐位跳动（easeOut 缓动）
- 五维雷达图 Canvas 动画绘制

**④ 极光取景（拍照）**
- 调用设备摄像头（前置自拍模式）
- 实时预览（镜像显示）
- 拍摄取景 → 翻转镜像 → 转为 JPEG → 交给人脸分析链
- 所有处理本地完成，不上传任何数据

**⑤ 分享**
- Web Share API（移动端原生分享）
- 降级：复制到剪贴板 + Toast 轻提示

### 状态处理
- **未上传**: 水晶球静态极光动画
- **检测中**: 水晶球旋转加载态 + 维度进度条逐一亮起
- **完成**: 完整揭示动画
- **无脸**: 优雅报错 + 重新上传提示
- **摄像头无权限**: 友好提示文案

---

## 5. Technical Approach

### 架构
- 前后端分离：前端静态页面 + 后端 Node.js API
- 前端继续使用 face-api.js CDN + Google Fonts CDN
- 后端负责高分照片持久化与静态资源托管

### 人脸分析算法
```
symmetryScore = 基于68关键点，计算鼻梁与眼中心X轴偏移，越小越对称
harmonyScore = 眼鼻比例与黄金比例的接近程度
refinementScore = 下颚宽度/面高比例质量

totalScore = symmetry(0.35) + harmony(0.35) + refinement(0.30) → 0-99
radarScores = 5维：对称美/协调美/精致美/气质美/魅力值（带随机波动）
```

### 浏览器兼容性
- Chrome / Edge / Firefox / Safari 最新版
- 摄像头需要 HTTPS 或 localhost 环境
- face-api.js 模型加载需要稳定网络（首次约 1MB）

### 数据保存策略
- 人脸检测与评分仍在前端本地完成
- 当总分 **大于 75 分** 时，前端会将当前照片自动提交给后端保存
- 后端保存原始图片文件及对应评分元数据，供后续筛选与管理
