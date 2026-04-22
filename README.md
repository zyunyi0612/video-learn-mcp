# Video-Learn-MCP

Claude Code 插件 — 从视频中学习。自动下载视频、截取关键帧、语音转文字、图文配对，帮你高效学习视频课程内容。

## 支持的视频源

| 平台 | 支持情况 |
|------|----------|
| 本地视频文件 | 完全支持 |
| YouTube | 完全支持 |
| B站 (Bilibili) | 完全支持 |

## 安装

### 插件安装（推荐）

```bash
# 1. 添加插件仓库
claude plugin marketplace add zyunyi0612/video-learn-mcp

# 2. 安装插件
claude plugin install video-learn
```

安装后重启 Claude Code，MCP Server 和 `/video-learn` Skill 会自动加载，无需手动配置。

### 外部依赖（自动检测）

首次运行 `/video-learn` 时，Skill 会自动检测以下依赖是否已安装，缺少的会自动安装：

| 依赖 | 用途 | 自动安装方式 |
|------|------|-------------|
| ffmpeg | 视频截帧、音频提取 | `brew install ffmpeg` / `apt-get install ffmpeg` |
| yt-dlp | 下载 YouTube/B站视频 | `pip3 install yt-dlp[default]` |
| faster-whisper | 语音转文字 | `pip3 install faster-whisper` |
| cryptography | YouTube cookies 自动导出 | `pip3 install cryptography` |
| certifi | 解决 macOS SSL 证书问题 | `pip3 install certifi` |

> Python 3.10+ 是必需的（faster-whisper 要求）。Python 3.12+ 的 pip 安装会自动加 `--break-system-packages` 参数。

如果你想提前手动安装，也可以运行：

```bash
# macOS
brew install ffmpeg
pip3 install yt-dlp faster-whisper cryptography certifi

# Linux
sudo apt-get install ffmpeg
pip3 install yt-dlp faster-whisper cryptography certifi
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
/video-learn <URL> --proxy http://127.0.0.1:7890  # 代理地址
```

## 工作流程

使用 `/video-learn` 命令后，Skill 会通过任务系统**分步调用** MCP 工具，每步完成后实时展示进度：

```
[Task 1] 依赖检查（video-check-deps）→ 自动检测并安装缺失的依赖
[Task 2] 下载视频（video-download）  → 报告视频标题、时长
[Task 3] 截取关键帧（video-extract-frames）→ 报告截帧数量
[Task 4] 语音转文字（video-transcribe）→ 报告转录段数、语言、文字预览
[Task 5] 图文配对（video-assemble）  → 报告配对组数
分析 + 生成学习笔记                   → 输出 notes.md
```

每个任务通过 TaskCreate/TaskUpdate 管理，确保严格顺序执行，不会重复调用。

每个 MCP 工具内置了 **Lock 文件 + 指纹** 幂等机制：相同参数的重复调用会自动返回缓存结果，不会重复执行耗时操作。

## MCP 工具

| 工具名 | 功能 |
|--------|------|
| `video-check-deps` | 检查系统依赖是否已安装（ffmpeg、yt-dlp、Python 3.10+、faster-whisper 等） |
| `video-download` | 下载或获取视频文件 |
| `video-extract-frames` | 从视频中提取关键帧图片 |
| `video-transcribe` | 将视频语音转录为带时间戳的文字 |
| `video-assemble` | 将截帧图片与转录文字按时间戳配对 |

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

**Q: pip3 install 报错 "externally-managed-environment"？**
A: Python 3.12+ 需要加 `--break-system-packages` 参数。Skill 的自动安装已处理此问题，手动安装时请加上此参数。

**Q: yt-dlp 安装后找不到命令？**
A: pip 安装的可执行文件可能不在 PATH 中。Skill 会自动创建软链接到 `~/.local/bin/`。手动解决：`export PATH="$HOME/.local/bin:$PATH"`

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
