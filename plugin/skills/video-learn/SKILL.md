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

当用户触发此 Skill 时，严格按以下流程执行。**使用 TaskCreate 创建任务列表，用 TaskUpdate 标记进度，确保每个任务只执行一次。**

### Phase 1: 初始化

1. 从用户输入中提取视频路径/URL 和可选参数（--model, --interval, --smart, --lang, --proxy）。

2. 使用 TaskCreate 创建以下 5 个任务（一次性全部创建）：
   - 任务 1: "检查系统依赖"
   - 任务 2: "下载视频"
   - 任务 3: "截取关键帧"
   - 任务 4: "语音转文字"
   - 任务 5: "图文配对"

3. 使用 TaskUpdate 设置依赖关系：任务 3 blockedBy 任务 2，任务 4 blockedBy 任务 2，任务 5 blockedBy 任务 3 和 任务 4。

### Phase 2: 逐任务执行

**严格规则：用 TaskUpdate 将任务标记为 in_progress → 执行对应的 MCP 工具（只调用一次）→ 用 TaskUpdate 标记为 completed → 进入下一个任务。**

#### 任务 1: 检查系统依赖
- TaskUpdate: status → in_progress
- 调用 `video-check-deps` MCP 工具
- 如果 `allOk` 为 true：告诉用户"依赖检查通过"
- 如果 `allOk` 为 false：告诉用户缺少哪些依赖，用 Bash 自动安装（Python 3.12+ 需加 `--break-system-packages`，yt-dlp 可能需要软链接到 `~/.local/bin/`），安装后再次调用 `video-check-deps` 验证
- TaskUpdate: status → completed

#### 任务 2: 下载视频
- TaskUpdate: status → in_progress
- 告诉用户：**"Step 1/4: 开始下载视频..."**
- 调用 `video-download` MCP 工具，参数：input=视频URL, proxy=代理地址（如有）
- 完成后告诉用户视频标题、时长、保存路径
- 记住返回的 `videoPath` 和 `outputDir`
- TaskUpdate: status → completed

#### 任务 3: 截取关键帧
- TaskUpdate: status → in_progress
- 告诉用户：**"Step 2/4: 开始截取关键帧..."**
- 调用 `video-extract-frames` MCP 工具，参数：video_path, output_dir, mode, interval_seconds
- 完成后告诉用户截取了多少帧
- 记住返回的 `framesDir`
- TaskUpdate: status → completed

#### 任务 4: 语音转文字
- TaskUpdate: status → in_progress
- 告诉用户：**"Step 3/4: 开始语音转文字（这一步可能需要几分钟）..."**
- 调用 `video-transcribe` MCP 工具，参数：video_path, output_dir, model, language
- 完成后告诉用户转录段数、语言、文字预览（前 200 字）
- 记住返回的 `outputFile`
- TaskUpdate: status → completed

#### 任务 5: 图文配对
- TaskUpdate: status → in_progress
- 告诉用户：**"Step 4/4: 开始图文配对..."**
- 调用 `video-assemble` MCP 工具，参数：frames_dir, transcript_file, output_dir, interval_seconds
- 完成后告诉用户配对了多少组
- 记住返回的 `outputFile`（paired_results.json 路径）
- TaskUpdate: status → completed

### Phase 3: 分析与笔记生成

告诉用户：**"所有处理步骤完成！开始分析图文内容并生成学习笔记..."**

1. 读取 `paired_results.json` 文件
2. 对每组图文配对：
   - 使用 Read 工具查看截图图片
   - 结合该时间段的字幕文字
   - 分析画面中的图示、文字、图表含义
   - 提取关键知识点
3. 整理成结构化的 Markdown 学习笔记，包含：
   - 视频标题和基本信息
   - 按时间线组织的知识点
   - 每个知识点配有截图引用和文字说明
   - 关键概念总结
4. 保存到输出目录下的 `notes.md` 文件

### Phase 4: 向用户报告

告诉用户：
- 处理完成，生成了多少组图文配对
- 笔记文件保存位置
- 展示前几个关键知识点的预览

## 注意事项
- **必须使用 TaskCreate/TaskUpdate 管理任务流程，确保每个 MCP 工具只调用一次**
- 每个任务必须先 TaskUpdate 为 in_progress，执行完后 TaskUpdate 为 completed，再进入下一个
- 如果某一步失败，立即告诉用户哪一步失败了以及错误原因，不要继续后续步骤
- 每步之间传递的参数（videoPath, outputDir, framesDir, outputFile）要准确，从上一步的返回结果中获取
- 如果视频较长（>30分钟），在任务 4 开始前提醒用户转录可能需要较长时间
