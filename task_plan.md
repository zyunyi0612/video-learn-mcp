# Video-Learn-MCP 项目计划

## 项目概述
构建一个 MCP Server + Claude Code Skill，从视频中提取图文配对的学习材料。

**支持的输入源：** 本地视频文件、YouTube、B站
**核心流程：** 视频获取 → 截帧(ffmpeg) → 语音转文字(whisper) → 图文配对输出

---

## 用户配置需求（已确认）

所有参数均通过配置文件可调：

| 配置项 | 默认值 | 可选值 |
|--------|--------|--------|
| whisper 模型 | `small` | tiny / base / small / medium / large-v3 |
| 截帧间隔 | `5 秒` | 任意秒数 / `smart`（智能场景检测） |
| 输出目录 | `~/Downloads/video-learn/` | 用户自定义路径 |

**一键安装：** install.sh 脚本需包含所有依赖的自动安装。

---

## 阶段规划

### 阶段 1：项目初始化与依赖安装 ✅
- [x] 初始化 npm 项目 (package.json, tsconfig.json)
- [x] 编写 install.sh 一键安装脚本，包含：
  - Homebrew（如果未安装）
  - yt-dlp（brew install）
  - ffmpeg（brew install，已装则跳过）
  - Python3（brew install，已装则跳过）
  - faster-whisper（pip3 install）
  - Node.js 依赖（npm install）
- [x] 创建配置文件 `config.json`（whisper 模型、截帧间隔、输出目录等）
- [x] 安装 MCP SDK 依赖 (@modelcontextprotocol/sdk)

### 阶段 2：MCP Server 核心模块开发 ✅
- [x] **downloader 模块** — 视频下载
- [x] **extractor 模块** — 视频截帧
- [x] **transcriber 模块** — 语音转文字
- [x] **assembler 模块** — 图文配对

### 阶段 3：MCP Server 入口与工具注册 ✅
- [x] 创建 MCP Server 入口 (src/index.ts)
- [x] 注册 MCP 工具：
  - `video-download` — 下载/获取视频
  - `video-extract-frames` — 截帧
  - `video-transcribe` — 语音转文字
  - `video-learn` — 一键完整流程（下载+截帧+转文字+配对）
- [x] 错误处理与进度反馈
- [x] 配置文件读取逻辑

### 阶段 4：Claude Code Skill 开发 ✅
- [x] 创建 Skill 定义文件 (skill/video-learn.md)
- [x] 实现 `/video-learn <url或路径>` 命令
- [x] Skill 调用 MCP 工具获取图文数据
- [x] AI 逐组分析截图+文字，生成结构化学习笔记
- [x] 输出格式化的 Markdown 笔记文件

### 阶段 5：测试与文档 ✅
- [ ] 测试本地视频处理流程（待实际视频测试）
- [ ] 测试 YouTube 视频下载+处理（待实际视频测试）
- [ ] 测试 B站视频下载+处理（待实际视频测试）
- [x] 编写 README.md（安装说明、使用方法、配置说明）
- [x] 验证 install.sh 一键安装流程

---

## 关键决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| MCP Server 语言 | TypeScript | MCP SDK 官方推荐，生态成熟 |
| 视频下载 | yt-dlp | YouTube + B站 支持最好 |
| 截帧工具 | ffmpeg (已安装) | 业界标准 |
| 语音转文字 | faster-whisper (已安装) | 本地运行，无需 API，速度快 |
| 图文配对 | 时间戳对齐 | 简单可靠 |
| 配置管理 | config.json | 所有参数可调，方便用户修改 |
| 一键安装 | install.sh | 自动检测已装工具，缺啥装啥 |

---

## 项目文件结构（最终）

```
~/video-learn-mcp/
├── package.json              # npm 包配置
├── tsconfig.json             # TypeScript 配置
├── config.json               # 用户配置（模型、间隔、输出目录）
├── install.sh                # 一键安装脚本
├── README.md                 # 使用说明
├── src/
│   ├── index.ts              # MCP Server 入口
│   ├── downloader.ts         # 视频下载模块
│   ├── extractor.ts          # 截帧模块
│   ├── transcriber.ts        # 语音转文字模块
│   ├── assembler.ts          # 图文配对模块
│   ├── config.ts             # 配置读取
│   └── scripts/
│       └── transcribe.py     # faster-whisper 转录脚本
├── skill/
│   └── video-learn.md        # Claude Code Skill 定义
├── task_plan.md              # 任务计划
├── findings.md               # 研究发现
└── progress.md               # 进度日志
```

---

## 当前环境

| 工具 | 状态 |
|------|------|
| ffmpeg 7.1.1 | 已安装 |
| faster-whisper 1.2.1 | 已安装 |
| Node.js v24.14.1 | 已安装 |
| npm 11.11.0 | 已安装 |
| Python 3.9.6 | 已安装 |
| yt-dlp | **待安装**（install.sh 会处理） |
