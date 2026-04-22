# Video-Learn-MCP 配置说明

## 快速开始

### 安装时选择模型

运行 `install.sh` 安装时会提示选择默认模型：

```
请选择默认使用的 Whisper 模型：

1) small      - 快速 (~1.5 分钟/12 分钟视频)，准确率一般
2) medium     - 中等 (~7 分钟/12 分钟视频)，准确率高
3) large-v3   - 最慢 (~9 分钟/12 分钟视频)，准确率最高 (推荐)
```

安装过程中还会询问是否预下载模型（约 3GB），选择 `Y` 可避免首次使用时的长时间等待。

---

## 配置文件位置

`config.json` 位于项目根目录。

## 配置项说明

### 1. Whisper 转录配置 (`whisper`)

```json
{
  "whisper": {
    "model": "large-v3",        // Whisper 模型大小
    "language": "zh",            // 语言代码：zh/en/auto
    "device": "auto",            // 运行设备：auto/cpu/cuda
    "compute_type": "int8"       // 计算精度：int8/float16/float32
  }
}
```

**模型选择指南**：

| 模型 | 速度 | 准确率 | 适用场景 |
|------|------|--------|----------|
| `tiny` | 最快 (~30 秒/12 分钟视频) | 最低 | 快速测试 |
| `base` | 快 (~45 秒) | 一般 | 日常快速处理 |
| `small` | 中 (~1.3 分钟) | 中等 | 平衡速度与准确率 |
| `medium` | 慢 (~7.5 分钟) | 高 | 重要视频 |
| `large-v3` | 最慢 (~8.5 分钟) | 最高 | 学习笔记/正式使用（推荐） |

**语言代码**：
- `zh` - 中文（自动识别简体/繁体）
- `en` - 英文
- `auto` - 自动检测语言

**设备选择**：
- `auto` - 自动检测（有 NVIDIA GPU 用 CUDA，否则 CPU）
- `cpu` - 强制 CPU
- `cuda` - 强制 NVIDIA GPU

**计算精度**：
- `int8` - 最快，精度略低（推荐）
- `float16` - 平衡
- `float32` - 最慢，精度最高

---

### 2. 视频截帧配置 (`extractor`)

```json
{
  "extractor": {
    "mode": "interval",              // 截帧模式：interval(固定间隔) / smart(智能场景检测)
    "interval_seconds": 5,           // 截帧间隔（秒，仅 interval 模式）
    "scene_threshold": 0.3,          // 场景切换阈值（仅 smart 模式）
    "image_format": "png",           // 图片格式：png/jpg
    "image_quality": 90              // 图片质量 (1-100)
  }
}
```

---

### 3. 输出配置 (`output`)

```json
{
  "output": {
    "base_dir": "~/Downloads/video-learn",  // 输出基础目录
    "keep_video": true,                      // 保留视频文件
    "keep_audio": false                      // 保留音频文件
  }
}
```

---

### 4. 下载器配置 (`downloader`)

```json
{
  "downloader": {
    "proxy": "",                              // 代理地址（可选）
    "cookies_file": "",                       // Cookies 文件路径（可选）
    "max_resolution": "1080p",                // 最大分辨率：1080p/1440p/2160p
    "prefer_format": "mp4"                    // 首选格式：mp4/mkv/webm
  }
}
```

**YouTube 下载说明**：
- 自动从 Chrome 浏览器读取 cookies（用于登录 Google 账号）
- 首次运行会请求密钥串权限
- 支持中文、英文字幕自动下载

---

## 修改配置的方法

1. 用文本编辑器打开 `config.json`
2. 修改对应的配置值
3. 保存文件
4. 下次运行 `/video-learn` 时自动生效

**示例**：将转录模型改为 `medium`：

```json
{
  "whisper": {
    "model": "medium",
    "language": "zh",
    "device": "auto",
    "compute_type": "int8"
  }
}
```

---

## 环境变量（可选）

可以通过 MCP 配置设置环境变量：

`~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "video-learn": {
      "command": "node",
      "args": ["/Users/zhangyunyi/video-learn-mcp/dist/index.js"],
      "env": {
        "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

---

## 常见问题

### Q: 如何加快转录速度？
A: 将 `whisper.model` 改为 `small` 或 `base`，速度会显著提升，但准确率会降低。

### Q: 如何获得最准确的转录结果？
A: 使用 `large-v3` 模型，确保有足够的处理时间（约 8-9 分钟/12 分钟视频）。

### Q: YouTube 视频无法下载？
A: 检查 Chrome 浏览器是否登录了 Google 账号，首次运行需要授权读取 cookies。

### Q: 转录结果是繁体字？
A: Whisper 的 `medium` 模型可能会输出繁体，建议使用 `large-v3` 并指定 `language: "zh"`。

### Q: 首次运行提示下载模型很慢？
A: 可以使用代理加速，或者重新运行 `install.sh` 选择预下载模型。

### Q: 如何切换模型？
A: 编辑 `config.json`，修改 `whisper.model` 字段，下次运行 `/video-learn` 自动生效。

### Q: 不同模型需要多少空间？
- `small`: 约 500MB
- `medium`: 约 1.5GB
- `large-v3`: 约 3GB

---

*最后更新：2026-04-22*
