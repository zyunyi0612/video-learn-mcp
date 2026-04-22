import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig, getOutputDir } from "./config.js";
import { downloadVideo, detectSourceType } from "./downloader.js";
import { extractFrames } from "./extractor.js";
import { transcribeVideo } from "./transcriber.js";
import { assembleResults } from "./assembler.js";
import { mkdir } from "fs/promises";

const server = new McpServer({
  name: "video-learn",
  version: "1.0.0",
});

let resetIdle: () => void = () => {};
let pauseIdle: () => void = () => {};

// 工具1：视频下载
server.tool(
  "video-download",
  "下载或获取视频文件。支持本地路径、YouTube URL、B站 URL",
  {
    input: z.string().describe("视频路径或 URL"),
    output_dir: z.string().optional().describe("输出目录（可选，默认使用配置）"),
    proxy: z.string().optional().describe("代理地址（可选）"),
  },
  async ({ input, output_dir, proxy }) => {
    pauseIdle();
    try {
      const config = loadConfig();
      if (proxy) config.downloader.proxy = proxy;

      const outDir = output_dir || getOutputDir(config, input);
      await mkdir(outDir, { recursive: true });

      const sourceType = detectSourceType(input);
      const result = await downloadVideo(input, outDir, config.downloader);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              videoPath: result.videoPath,
              title: result.title,
              sourceType: result.sourceType,
              duration: result.duration,
              outputDir: outDir,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text" as const, text: `下载失败: ${error.message}` }],
        isError: true,
      };
    } finally {
      resetIdle();
    }
  }
);

// 工具2：视频截帧
server.tool(
  "video-extract-frames",
  "从视频中提取关键帧图片。支持固定间隔和智能场景检测两种模式",
  {
    video_path: z.string().describe("视频文件路径"),
    output_dir: z.string().describe("输出目录"),
    mode: z.enum(["interval", "smart"]).optional().describe("截帧模式：interval（固定间隔）或 smart（智能检测）"),
    interval_seconds: z.number().optional().describe("截帧间隔秒数（仅 interval 模式）"),
  },
  async ({ video_path, output_dir, mode, interval_seconds }) => {
    pauseIdle();
    try {
      const config = loadConfig();
      if (mode) config.extractor.mode = mode;
      if (interval_seconds) config.extractor.interval_seconds = interval_seconds;

      const result = await extractFrames(video_path, output_dir, config.extractor);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              framesDir: result.framesDir,
              frameCount: result.frameCount,
              timestamps: result.timestamps,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text" as const, text: `截帧失败: ${error.message}` }],
        isError: true,
      };
    } finally {
      resetIdle();
    }
  }
);

// 工具3：语音转文字
server.tool(
  "video-transcribe",
  "将视频中的语音转录为带时间戳的文字。使用 faster-whisper 本地模型",
  {
    video_path: z.string().describe("视频文件路径"),
    output_dir: z.string().describe("输出目录"),
    model: z.string().optional().describe("Whisper 模型大小：tiny/base/small/medium/large-v3"),
    language: z.string().optional().describe("语言代码，如 zh/en/auto"),
  },
  async ({ video_path, output_dir, model, language }) => {
    pauseIdle();
    try {
      const config = loadConfig();
      if (model) config.whisper.model = model;
      if (language) config.whisper.language = language;

      const result = await transcribeVideo(video_path, output_dir, config.whisper);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              segmentCount: result.segments.length,
              language: result.language,
              outputFile: result.outputFile,
              preview: result.fullText.slice(0, 500),
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text" as const, text: `转录失败: ${error.message}` }],
        isError: true,
      };
    } finally {
      resetIdle();
    }
  }
);

// 工具4：一键完整流程
server.tool(
  "video-learn",
  "一键完整流程：下载视频 → 截帧 → 语音转文字 → 图文配对。支持本地文件、YouTube、B站",
  {
    input: z.string().describe("视频路径或 URL"),
    output_dir: z.string().optional().describe("输出目录（可选）"),
    model: z.string().optional().describe("Whisper 模型：tiny/base/small/medium/large-v3"),
    language: z.string().optional().describe("语言：zh/en/auto"),
    mode: z.enum(["interval", "smart"]).optional().describe("截帧模式"),
    interval_seconds: z.number().optional().describe("截帧间隔秒数"),
    proxy: z.string().optional().describe("代理地址"),
  },
  async ({ input, output_dir, model, language, mode, interval_seconds, proxy }) => {
    pauseIdle();
    try {
      const config = loadConfig();
      if (model) config.whisper.model = model;
      if (language) config.whisper.language = language;
      if (mode) config.extractor.mode = mode;
      if (interval_seconds) config.extractor.interval_seconds = interval_seconds;
      if (proxy) config.downloader.proxy = proxy;

      const outDir = output_dir || getOutputDir(config, input);
      await mkdir(outDir, { recursive: true });

      // Step 1: 下载视频
      const downloadResult = await downloadVideo(input, outDir, config.downloader);

      // Step 2: 截帧
      const extractResult = await extractFrames(
        downloadResult.videoPath,
        outDir,
        config.extractor
      );

      // Step 3: 语音转文字
      const transcribeResult = await transcribeVideo(
        downloadResult.videoPath,
        outDir,
        config.whisper
      );

      // Step 4: 图文配对
      const assembleResult = await assembleResults(
        extractResult.frameFiles,
        extractResult.timestamps,
        transcribeResult.segments,
        config.extractor.interval_seconds,
        outDir
      );

      // 构建摘要
      const summary = {
        success: true,
        title: downloadResult.title,
        sourceType: downloadResult.sourceType,
        outputDir: outDir,
        stats: {
          frames: extractResult.frameCount,
          segments: transcribeResult.segments.length,
          pairedItems: assembleResult.items.length,
        },
        files: {
          video: downloadResult.videoPath,
          framesDir: extractResult.framesDir,
          transcript: transcribeResult.outputFile,
          pairedResults: assembleResult.outputFile,
        },
        preview: assembleResult.items.slice(0, 3).map((item) => ({
          time: item.timeLabel,
          frame: item.framePath,
          text: item.text.slice(0, 100),
        })),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text" as const, text: `处理失败: ${error.message}` }],
        isError: true,
      };
    } finally {
      resetIdle();
    }
  }
);

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // 检测 stdin 关闭，自动退出（防止进程残留）
  process.stdin.on('end', () => {
    console.error('[video-learn] stdin closed, exiting...');
    setTimeout(() => process.exit(0), 1000);
  });

  // 超时保护：空闲 5 分钟后自动退出（工具执行期间暂停）
  let idleTimer: NodeJS.Timeout;
  pauseIdle = () => {
    clearTimeout(idleTimer);
  };
  resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      console.error('[video-learn] idle timeout, exiting...');
      process.exit(0);
    }, 5 * 60 * 1000);
  };
  resetIdle();
  process.on('message', resetIdle);
  process.stdin.on('data', resetIdle);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
