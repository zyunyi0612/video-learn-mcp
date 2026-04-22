---
name: video-learn
description: 从视频中学习 — 自动下载、截帧、语音转文字、图文配对分析。支持本地视频、YouTube、B站。当用户提到学习视频、看视频、视频笔记时使用此技能
user_invocable: true
---

# Video Learn Skill

从视频中提取图文配对的学习材料，帮助理解结合画图讲解的课程内容。

## 使用方法

用户输入 `/video-learn <视频路径或URL>` 触发此 Skill。

## 支持的输入源
- 本地视频文件路径（如 `/path/to/video.mp4`）
- YouTube URL（如 `https://www.youtube.com/watch?v=xxx`）
- B站 URL（如 `https://www.bilibili.com/video/BVxxx`）

## 可选参数
用户可以在 URL 后面追加参数：
- `--model <tiny|base|small|medium|large-v3>` — Whisper 模型大小（默认 large-v3）
- `--interval <秒数>` — 截帧间隔（默认 30 秒）
- `--smart` — 使用智能场景检测截帧
- `--lang <zh|en|auto>` — 语言（默认 auto）
- `--proxy <地址>` — 代理地址

## 工作流程

当用户触发此 Skill 时，按以下步骤**分步执行**，每步完成后立即向用户报告进度：

### Step 1: 解析输入
从用户输入中提取视频路径/URL 和可选参数（--model, --interval, --smart, --lang, --proxy）。

### Step 1.5: 检查依赖
在开始处理之前，使用 Bash 工具检查所有必需的系统依赖是否已安装。运行以下检查脚本：

```bash
echo "=== 检查依赖 ===" && \
MISSING="" && \
# 检查 ffmpeg
if command -v ffmpeg &>/dev/null; then echo "ffmpeg: OK ($(ffmpeg -version 2>&1 | head -1 | awk '{print $3}'))"; else MISSING="$MISSING ffmpeg"; echo "ffmpeg: 未安装"; fi && \
# 检查 yt-dlp
if command -v yt-dlp &>/dev/null; then echo "yt-dlp: OK ($(yt-dlp --version 2>&1))"; else MISSING="$MISSING yt-dlp"; echo "yt-dlp: 未安装"; fi && \
# 检查 Python 版本（需要 3.10+）
PY_OK=0 && \
if command -v python3 &>/dev/null; then
  PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null)
  PY_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)" 2>/dev/null)
  if [ "$PY_MINOR" -ge 10 ] 2>/dev/null; then echo "python3: OK ($PY_VER)"; PY_OK=1; else MISSING="$MISSING python3.10+"; echo "python3: 版本过低 ($PY_VER)，需要 3.10+"; fi
else MISSING="$MISSING python3"; echo "python3: 未安装"; fi && \
# 检查 faster-whisper
if python3 -c "from faster_whisper import WhisperModel" &>/dev/null 2>&1; then echo "faster-whisper: OK"; else MISSING="$MISSING faster-whisper"; echo "faster-whisper: 未安装"; fi && \
# 检查 cryptography（YouTube cookies 需要）
if python3 -c "from cryptography.hazmat.primitives.ciphers import Cipher" &>/dev/null 2>&1; then echo "cryptography: OK"; else echo "cryptography: 未安装（YouTube cookies 自动导出将不可用）"; fi && \
# 检查 certifi（SSL 证书）
if python3 -c "import certifi" &>/dev/null 2>&1; then echo "certifi: OK"; else echo "certifi: 未安装（可能遇到 SSL 错误）"; fi && \
echo "=== MISSING:$MISSING ==="
```

根据检查结果处理：

**如果有缺失的依赖**，告诉用户缺少哪些依赖，然后用 Bash 自动安装。按以下顺序安装：

1. **ffmpeg**（如果缺失）：
   - macOS: `brew install ffmpeg`
   - Linux: `sudo apt-get update && sudo apt-get install -y ffmpeg`

2. **Python 3.10+**（如果缺失或版本过低）：
   - macOS: `brew install python@3.11`
   - Linux: `sudo apt-get install -y python3.11 python3.11-venv python3.11-pip`

3. **yt-dlp**（如果缺失）：
   - 先判断 Python 版本决定是否需要 `--break-system-packages`：
   ```bash
   PY_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")
   if [ "$PY_MINOR" -ge 12 ]; then
     pip3 install --break-system-packages --upgrade "yt-dlp[default]"
   else
     pip3 install --upgrade "yt-dlp[default]"
   fi
   ```
   - 安装后如果 `command -v yt-dlp` 找不到，需要创建软链接：
   ```bash
   YT_DLP_BIN=$(python3 -c "import site; print(site.getusersitepackages().replace('/lib/python/site-packages', '/bin'))" 2>/dev/null)/yt-dlp
   if [ -f "$YT_DLP_BIN" ] && ! command -v yt-dlp &>/dev/null; then
     mkdir -p "$HOME/.local/bin"
     ln -sf "$YT_DLP_BIN" "$HOME/.local/bin/yt-dlp"
     export PATH="$HOME/.local/bin:$PATH"
   fi
   ```

4. **faster-whisper**（如果缺失）：
   ```bash
   PY_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")
   if [ "$PY_MINOR" -ge 12 ]; then
     pip3 install --break-system-packages faster-whisper
   else
     pip3 install faster-whisper
   fi
   ```

5. **cryptography**（如果缺失，用于 YouTube cookies 自动导出）：
   ```bash
   PY_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")
   if [ "$PY_MINOR" -ge 12 ]; then
     pip3 install --break-system-packages cryptography
   else
     pip3 install cryptography
   fi
   ```

6. **certifi**（如果缺失，解决 macOS SSL 证书问题）：
   ```bash
   PY_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")
   if [ "$PY_MINOR" -ge 12 ]; then
     pip3 install --break-system-packages certifi
   else
     pip3 install certifi
   fi
   ```

安装完成后，再次运行检查脚本验证所有依赖都已就位。如果仍有关键依赖（ffmpeg、yt-dlp、python3、faster-whisper）缺失，告诉用户具体哪个安装失败，并停止后续步骤。

**如果所有依赖都已安装**，告诉用户："依赖检查通过，开始处理视频..."

### Step 2: 下载视频
先告诉用户：**"Step 1/4: 开始下载视频..."**

调用 `video-download` MCP 工具：
- `input`: 视频路径或 URL
- `output_dir`: （可选）自定义输出目录
- `proxy`: （可选）代理地址

完成后告诉用户：
- 视频标题
- 视频时长
- 保存路径
- 例如："视频下载完成！标题：xxx，时长：xx分xx秒，保存在 /path/to/output/"

记住返回的 `videoPath` 和 `outputDir`，后续步骤需要用到。

### Step 3: 截取关键帧
先告诉用户：**"Step 2/4: 开始截取关键帧..."**

调用 `video-extract-frames` MCP 工具：
- `video_path`: Step 2 返回的 videoPath
- `output_dir`: Step 2 返回的 outputDir
- `mode`: 如果用户指定了 --smart 则传 "smart"，否则传 "interval"
- `interval_seconds`: 用户指定的间隔秒数（如果有）

完成后告诉用户：
- 截取了多少帧
- 例如："关键帧截取完成！共截取 xx 帧"

记住返回的 `framesDir`。

### Step 4: 语音转文字
先告诉用户：**"Step 3/4: 开始语音转文字（这一步可能需要几分钟）..."**

如果用户指定了 --model，告诉用户正在使用哪个模型。

调用 `video-transcribe` MCP 工具：
- `video_path`: Step 2 返回的 videoPath
- `output_dir`: Step 2 返回的 outputDir
- `model`: 用户指定的模型（默认 large-v3）
- `language`: 用户指定的语言（默认不传，让工具自动检测）

完成后告诉用户：
- 转录了多少段文字
- 检测到的语言
- 文字预览（前 200 字）
- 例如："语音转文字完成！共转录 xx 段，语言：中文"

记住返回的 `outputFile`（转录结果 JSON 文件路径）。

### Step 5: 图文配对
先告诉用户：**"Step 4/4: 开始图文配对..."**

调用 `video-assemble` MCP 工具：
- `frames_dir`: Step 3 返回的 framesDir
- `transcript_file`: Step 4 返回的 outputFile
- `output_dir`: Step 2 返回的 outputDir
- `interval_seconds`: 截帧间隔秒数

完成后告诉用户：
- 配对了多少组图文
- 例如："图文配对完成！共生成 xx 组图文配对"

记住返回的 `outputFile`（paired_results.json 路径）。

### Step 6: 逐组分析图文内容
告诉用户：**"所有处理步骤完成！开始分析图文内容并生成学习笔记..."**

读取 `paired_results.json` 文件。然后对每组图文配对：
1. 使用 Read 工具查看截图图片
2. 结合该时间段的字幕文字
3. 分析画面中的图示、文字、图表含义
4. 提取关键知识点

### Step 7: 生成学习笔记
将所有分析结果整理成结构化的 Markdown 学习笔记，包含：
- 视频标题和基本信息
- 按时间线组织的知识点
- 每个知识点配有截图引用和文字说明
- 关键概念总结

将笔记保存到输出目录下的 `notes.md` 文件。

### Step 8: 向用户报告
告诉用户：
- 处理完成，生成了多少组图文配对
- 笔记文件保存位置
- 展示前几个关键知识点的预览

## 注意事项
- 每一步完成后都要立即向用户报告进度，不要等所有步骤完成后才汇报
- 如果视频较长（>30分钟），在 Step 4 开始前提醒用户转录可能需要较长时间
- 如果某一步失败，立即告诉用户哪一步失败了以及错误原因，不要继续后续步骤
- 每步之间传递的参数（videoPath, outputDir, framesDir, outputFile）要准确，从上一步的返回结果中获取
