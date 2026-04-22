# Video-Learn-MCP

从视频中学习的 MCP Server + Claude Code Skill。自动下载视频、截取关键帧、语音转文字、图文配对，帮你高效学习视频课程内容。

## 支持的视频源

| 平台 | 支持情况 |
|------|----------|
| 本地视频文件 | 完全支持 |
| YouTube | 完全支持 |
| B站 (Bilibili) | 完全支持 |

## 快速开始

### 1. 一键安装

```bash
git clone <repo-url> ~/video-learn-mcp
cd ~/video-learn-mcp
chmod +x install.sh
./install.sh
```

安装脚本会自动检测并安装以下依赖：
- **yt-dlp** — 视频下载
- **ffmpeg** — 视频截帧
- **faster-whisper** — 语音转文字（本地运行）
- **Node.js 依赖** — MCP SDK

### 2. 配置 MCP Server

在 Claude Code 的设置中添加 MCP Server：

**方式一：全局配置**（所有项目可用）

编辑 `~/.claude/settings.json`：

```json
{
  "mcpServers": {
    "video-learn": {
      "command": "node",
      "args": ["/Users/<your-username>/video-learn-mcp/dist/index.js"]
    }
  }
}
```

**方式二：项目配置**

在项目目录下创建 `.claude/settings.json`：

```json
{
  "mcpServers": {
    "video-learn": {
      "command": "node",
      "args": ["/Users/<your-username>/video-learn-mcp/dist/index.js"]
    }
  }
}
```

### 3. 安装 Skill（可选）

```bash
cp -r ~/video-learn-mcp/skill/video-learn.md ~/.claude/skills/
```

安装后可以使用 `/video-learn` 命令。

### 4. 使用

**通过 Skill 命令：**
```
/video-learn https://www.youtube.com/watch?v=xxxxx
/video-learn /path/to/local/video.mp4
/video-learn https://www.bilibili.com/video/BVxxxxx
```

**通过 MCP 工具直接调用：**
在 Claude Code 中让 AI 调用 `video-learn` 工具即可。

## 配置说明

编辑 `config.json` 自定义参数：

```json
{
  "whisper": {
    "model": "small",        // 模型：tiny/base/small/medium/large-v3
    "language": "zh",        // 语言：zh/en/auto
    "device": "auto",        // 设备：auto/cpu/cuda
    "compute_type": "int8"   // 计算精度：int8/float16/float32
  },
  "extractor": {
    "mode": "interval",      // 截帧模式：interval（固定间隔）/ smart（智能检测）
    "interval_seconds": 5,   // 截帧间隔（秒）
    "scene_threshold": 0.3,  // 场景变化阈值（smart 模式）
    "image_format": "png",   // 图片格式
    "image_quality": 90      // 图片质量
  },
  "output": {
    "base_dir": "~/Downloads/video-learn",  // 输出目录
    "keep_video": true,      // 保留下载的视频
    "keep_audio": false      // 保留提取的音频
  },
  "downloader": {
    "proxy": "",             // 代理地址（如 http://127.0.0.1:7890）
    "cookies_file": "",      // Cookie 文件路径（B站高清视频可能需要）
    "max_resolution": "1080p", // 最大分辨率
    "prefer_format": "mp4"   // 首选格式
  }
}
```

## MCP 工具列表

| 工具名 | 功能 |
|--------|------|
| `video-download` | 下载视频（支持本地/YouTube/B站） |
| `video-extract-frames` | 从视频提取关键帧 |
| `video-transcribe` | 语音转文字 |
| `video-learn` | 一键完整流程（推荐） |

## 输出结构

处理完成后，输出目录结构如下：

```
~/Downloads/video-learn/2026-04-21_视频标题/
├── 视频标题.mp4              # 下载的视频
├── frames/                   # 截帧图片
│   ├── frame_00001.png
│   ├── frame_00002.png
│   └── ...
├── transcript/               # 转录结果
│   └── transcript.json
├── paired_results.json       # 图文配对数据
└── notes.md                  # AI 生成的学习笔记（通过 Skill）
```

## 系统要求

- macOS 或 Linux
- Python 3.9+
- Node.js 18+
- 约 1GB 磁盘空间（用于 Whisper 模型缓存）

## 常见问题

**Q: B站高清视频下载失败？**
A: 部分高清视频需要登录。在浏览器登录 B站后，导出 Cookie 文件，在 `config.json` 中设置 `cookies_file` 路径。

**Q: 转录速度很慢？**
A: 可以在 `config.json` 中将 `whisper.model` 改为 `tiny` 或 `base`，牺牲准确度换取速度。

**Q: 截帧图片太多/太少？**
A: 调整 `extractor.interval_seconds`，或使用 `"mode": "smart"` 让 ffmpeg 根据画面变化自动截帧。
