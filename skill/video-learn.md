---
name: video-learn
description: 从视频中学习 — 自动下载、截帧、语音转文字、图文配对分析。支持本地视频、YouTube、B站
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
- `--model <tiny|base|small|medium|large-v3>` — Whisper 模型大小
- `--interval <秒数>` — 截帧间隔
- `--smart` — 使用智能场景检测截帧
- `--lang <zh|en|auto>` — 语言

## 工作流程

当用户触发此 Skill 时，按以下步骤执行：

### Step 1: 解析输入
从用户输入中提取视频路径/URL 和可选参数。

### Step 2: 调用 MCP 工具执行完整流程
调用 `video-learn` MCP 工具，传入视频路径和参数。该工具会自动完成：
1. 下载视频（如果是 URL）
2. 按间隔截取关键帧
3. 语音转文字（生成带时间戳的字幕）
4. 将截图与字幕按时间戳配对

### Step 3: 逐组分析图文内容
工具返回配对结果后，读取 `paired_results.json` 文件。然后对每组图文配对：
1. 使用 Read 工具查看截图图片
2. 结合该时间段的字幕文字
3. 分析画面中的图示、文字、图表含义
4. 提取关键知识点

### Step 4: 生成学习笔记
将所有分析结果整理成结构化的 Markdown 学习笔记，包含：
- 视频标题和基本信息
- 按时间线组织的知识点
- 每个知识点配有截图引用和文字说明
- 关键概念总结

将笔记保存到输出目录下的 `notes.md` 文件。

### Step 5: 向用户报告
告诉用户：
- 处理完成，生成了多少组图文配对
- 笔记文件保存位置
- 展示前几个关键知识点的预览

## 注意事项
- 如果视频较长（>30分钟），提醒用户处理可能需要几分钟
- 如果 MCP 工具未配置，引导用户先运行 install.sh 并配置 MCP Server
- 截帧和转录是最耗时的步骤，给用户适当的进度提示
