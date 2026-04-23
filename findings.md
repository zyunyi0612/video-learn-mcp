# 研究与发现

## 环境调查

### 已安装工具
- **ffmpeg 7.1.1** — 通过 Homebrew 安装在 `/opt/homebrew/bin/ffmpeg`，可直接用于截帧
- **faster-whisper 1.2.1** — Python 包已安装，比 OpenAI 原版 whisper 快 4 倍，内存占用更低
- **Node.js v24.14.1 / npm 11.11.0** — 版本很新，可使用最新 MCP SDK
- **Python 3.9.6** — 系统 Python，用于运行 faster-whisper

### 待安装工具
- **yt-dlp** — `brew install yt-dlp` 或 `pip3 install yt-dlp`，用于 YouTube 和 B站视频下载

---

## 技术调研

### MCP Server 开发
- MCP SDK: `@modelcontextprotocol/sdk` npm 包
- 入口模式：stdio transport（最通用）
- 工具定义：使用 `server.tool()` 注册工具

### yt-dlp 对各平台的支持
- **YouTube** — 完美支持，最成熟的平台
- **B站** — 支持良好，需注意：
  - 部分高清视频需要登录 cookie
  - B站视频可能是分段的（音视频分离），yt-dlp 自动合并
- **本地文件** — 不需要 yt-dlp，直接读取

### faster-whisper 使用方式
- 通过 Python 调用：`from faster_whisper import WhisperModel`
- 模型选择：tiny(最快) → base → small → medium → large-v3(最准)
- 中文支持：medium 及以上效果较好
- 输出格式：带时间戳的 segments

### ffmpeg 截帧方案
- 按时间间隔截帧：`ffmpeg -i input.mp4 -vf "fps=1/5" output_%04d.png`（每 5 秒一帧）
- 场景变化检测截帧：`ffmpeg -i input.mp4 -vf "select='gt(scene,0.3)'" output_%04d.png`
- 推荐：先用固定间隔，后期可加场景检测优化

### 图文配对策略
- 截帧文件名包含时间戳（如 `frame_00005.png` = 第 5 秒）
- whisper 输出的 segments 包含 start/end 时间
- 按时间窗口匹配：每张截图关联该时间段内的所有字幕文本

---

## 架构发现

### 项目目录结构（已创建）
```
~/video-learn-mcp/
├── src/           # MCP Server 代码（TypeScript）
├── skill/         # Claude Code Skill 文件
├── task_plan.md   # 任务计划
├── findings.md    # 研究发现
└── progress.md    # 进度日志
```

### MCP Server 与 Skill 的分工
- **MCP Server**：提供 4 个工具（download, extract-frames, transcribe, learn）
- **Skill**：调用 MCP 工具，用 AI 分析图文内容，生成结构化笔记
