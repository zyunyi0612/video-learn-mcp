# Video-Learn-MCP

Claude Code 插件 — 从视频中学习。自动下载视频、截取关键帧、语音转文字、图文配对，帮你高效学习视频课程内容。

## 支持的视频源

| 平台 | 支持情况 |
|------|----------|
| 本地视频文件 | 完全支持 |
| YouTube | 完全支持 |
| B站 (Bilibili) | 完全支持 |

## 安装

### 一键安装（推荐）

```bash
claude plugin add zyunyi0612/video-learn-mcp
```

安装后 Claude Code 会自动加载 MCP Server 和 `/video-learn` Skill，无需手动配置。

### 安装外部依赖

插件依赖以下系统工具，首次使用前需安装：

```bash
# macOS
brew install ffmpeg
pip3 install yt-dlp faster-whisper

# Linux
sudo apt-get install ffmpeg
pip3 install yt-dlp faster-whisper
```

或者使用一键脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/zyunyi0612/video-learn-mcp/main/install-deps.sh | bash
```

### 手动安装（不使用插件系统）

如果不想通过插件安装，也可以手动安装：

```bash
git clone https://github.com/zyunyi0612/video-learn-mcp.git ~/video-learn-mcp
cd ~/video-learn-mcp
chmod +x install.sh
./install.sh
```

安装脚本会自动处理所有依赖、编译、MCP 配置和 Skill 安装。

## 使用方法

在 Claude Code 中输入：

```
/video-learn https://www.youtube.com/watch?v=xxxxx
/video-learn /path/to/local/video.mp4
/video-learn https://www.bilibili.com/video/BVxxxxx
```

### 可选参数

```
/video-learn <URL> --model large-v3    # 指定 Whisper 模型
/video-learn <URL> --interval 10       # 截帧间隔（秒）
/video-learn <URL> --smart             # 智能场景检测截帧
/video-learn <URL> --lang en           # 指定语言
```

## MCP 工具

| 工具名 | 功能 |
|--------|------|
| `video-learn` | 一键完整流程（推荐） |
| `video-download` | 下载视频 |
| `video-extract-frames` | 提取关键帧 |
| `video-transcribe` | 语音转文字 |

## 输出结构

```
~/Downloads/video-learn/2026-04-21_视频标题/
├── 视频标题.mp4              # 下载的视频
├── frames/                   # 截帧图片
│   ├── frame_00001.png
│   └── ...
├── transcript/               # 转录结果
│   └── transcript.json
├── paired_results.json       # 图文配对数据
└── notes.md                  # AI 生成的学习笔记
```

## 配置

编辑插件目录下的 `config.json`（或手动安装时项目根目录的 `config.json`）：

```json
{
  "whisper": {
    "model": "large-v3",
    "language": "zh",
    "device": "auto",
    "compute_type": "int8"
  },
  "extractor": {
    "mode": "interval",
    "interval_seconds": 5,
    "scene_threshold": 0.3
  },
  "output": {
    "base_dir": "~/Downloads/video-learn",
    "keep_video": true
  },
  "downloader": {
    "proxy": "",
    "cookies_file": "",
    "max_resolution": "1080p"
  }
}
```

### Whisper 模型选择

| 模型 | 速度 | 准确率 | 适用场景 |
|------|------|--------|----------|
| `small` | 快 | 一般 | 快速处理 |
| `medium` | 中等 | 高 | 平衡选择 |
| `large-v3` | 慢 | 最高 | 专有名词多、需要高准确率 |

## 系统要求

- macOS 或 Linux
- Python 3.10+
- Node.js 18+
- 约 1-3GB 磁盘空间（Whisper 模型缓存）

## 常见问题

**Q: YouTube 下载失败？**
A: 需要 Chrome 浏览器登录 Google 账号，插件会自动读取 cookies。

**Q: B站高清视频下载失败？**
A: 部分高清视频需要登录。在浏览器登录 B站后，在 `config.json` 中设置 `cookies_file` 路径。

**Q: 转录速度很慢？**
A: 将 `whisper.model` 改为 `small`，牺牲准确度换取速度。

**Q: 截帧图片太多/太少？**
A: 调整 `extractor.interval_seconds`，或使用 `"mode": "smart"` 自动检测画面变化。

## License

MIT
