# 进度日志

## 2026-04-21

### 会话 1：项目规划

**完成：**
- 创建项目目录结构：`~/video-learn-mcp/`（src/ + skill/）
- 环境调查：ffmpeg、faster-whisper 已安装，yt-dlp 待安装
- 完成技术调研：MCP SDK、yt-dlp 平台支持、截帧方案、图文配对策略
- 编写完整任务计划（5 个阶段）
- 用户要求：安装脚本需包含所有依赖的一键安装

### 会话 2：全部开发完成

**阶段 1 — 项目初始化与依赖安装：**
- 创建 package.json、tsconfig.json、config.json
- 编写 install.sh 一键安装脚本（自动检测并安装 yt-dlp、ffmpeg、Python3、faster-whisper、Node 依赖）
- 安装 npm 依赖（MCP SDK、zod、TypeScript）
- 安装 yt-dlp（修复了 ca-certificates 证书问题）

**阶段 2 — MCP Server 核心模块：**
- `src/config.ts` — 配置读取，所有参数可通过 config.json 调整
- `src/downloader.ts` — 视频下载（自动识别本地/YouTube/B站）
- `src/extractor.ts` — 视频截帧（固定间隔 + 智能场景检测）
- `src/transcriber.ts` — 语音转文字（调用 faster-whisper Python 脚本）
- `src/assembler.ts` — 图文配对（时间戳对齐）
- `src/scripts/transcribe.py` — faster-whisper 转录脚本

**阶段 3 — MCP Server 入口：**
- `src/index.ts` — 注册 4 个 MCP 工具：video-download、video-extract-frames、video-transcribe、video-learn
- TypeScript 编译通过，输出到 dist/

**阶段 4 — Skill：**
- `skill/video-learn.md` — Claude Code Skill 定义，支持 /video-learn 命令

**阶段 5 — 文档：**
- `README.md` — 完整的安装说明、使用方法、配置说明
- `install.sh` — 一键安装脚本

**状态：所有 5 个阶段开发完成，待实际视频测试。**
