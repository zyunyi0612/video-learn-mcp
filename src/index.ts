import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig, getOutputDir } from "./config.js";
import { downloadVideo, detectSourceType } from "./downloader.js";
import { extractFrames } from "./extractor.js";
import { transcribeVideo } from "./transcriber.js";
import { assembleResults } from "./assembler.js";
import { mkdir, writeFile, readFile, unlink, stat } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// --- Lock file mechanism to prevent duplicate tool calls ---

const LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface LockInfo {
  fingerprint: string;
  pid: number;
  startTime: number;
  toolName: string;
  status: "running" | "done";
}

function makeFingerprint(params: Record<string, unknown>): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  return createHash("md5").update(sorted).digest("hex");
}

function lockPath(outputDir: string, toolName: string): string {
  return resolve(outputDir, `.${toolName}.lock`);
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function acquireLock(
  outputDir: string,
  toolName: string,
  fingerprint: string
): Promise<{ acquired: boolean; reason?: string }> {
  const lp = lockPath(outputDir, toolName);

  if (existsSync(lp)) {
    try {
      const raw = await readFile(lp, "utf-8");
      const lock: LockInfo = JSON.parse(raw);

      if (lock.status === "done" && lock.fingerprint === fingerprint) {
        return { acquired: false, reason: "already_done" };
      }

      if (lock.status === "running") {
        const elapsed = Date.now() - lock.startTime;
        const stale = elapsed > LOCK_TIMEOUT_MS || !isPidAlive(lock.pid);

        if (!stale && lock.fingerprint === fingerprint) {
          return { acquired: false, reason: "same_fingerprint_running" };
        }

        if (!stale) {
          return { acquired: false, reason: "different_task_running" };
        }
      }
    } catch {}
  }

  const lock: LockInfo = {
    fingerprint,
    pid: process.pid,
    startTime: Date.now(),
    toolName,
    status: "running",
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(lp, JSON.stringify(lock));
  return { acquired: true };
}

async function completeLock(outputDir: string, toolName: string): Promise<void> {
  const lp = lockPath(outputDir, toolName);
  try {
    const raw = await readFile(lp, "utf-8");
    const lock: LockInfo = JSON.parse(raw);
    lock.status = "done";
    await writeFile(lp, JSON.stringify(lock));
  } catch {}
}

async function removeLock(outputDir: string, toolName: string): Promise<void> {
  await unlink(lockPath(outputDir, toolName)).catch(() => {});
}

const server = new McpServer({
  name: "video-learn",
  version: "1.2.1",
});

let resetIdle: () => void = () => {};
let pauseIdle: () => void = () => {};

async function checkCommand(cmd: string, versionFlag = "--version"): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, [versionFlag], { timeout: 5000 });
    const output = (stdout || stderr).trim().split("\n")[0];
    return output || "installed";
  } catch {
    return null;
  }
}

async function checkPythonModule(pythonCmd: string, module: string, importStatement: string): Promise<boolean> {
  try {
    await execFileAsync(pythonCmd, ["-c", importStatement], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function findBestPython(): Promise<{ cmd: string; version: string } | null> {
  const candidates = [
    "/opt/homebrew/bin/python3.11",
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3.11",
    "/usr/local/bin/python3",
    "python3.11",
    "python3",
  ];
  for (const cmd of candidates) {
    try {
      const { stdout } = await execFileAsync(cmd, ["-c", "import sys; print(sys.version_info.minor)"]);
      const minor = parseInt(stdout.trim(), 10);
      if (minor >= 10) {
        const { stdout: ver } = await execFileAsync(cmd, ["-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"]);
        return { cmd, version: ver.trim() };
      }
    } catch {}
  }
  return null;
}

// 工具0：依赖检查
server.tool(
  "video-check-deps",
  "检查 video-learn 所需的系统依赖是否已安装（ffmpeg、yt-dlp、Python 3.10+、faster-whisper 等）",
  {},
  async () => {
    const deps: { name: string; status: "ok" | "missing" | "warn"; version?: string; detail?: string }[] = [];
    const missing: string[] = [];

    // ffmpeg (uses -version, not --version)
    const ffmpegVer = await checkCommand("ffmpeg", "-version");
    if (ffmpegVer) {
      const match = ffmpegVer.match(/version\s+([\S]+)/);
      deps.push({ name: "ffmpeg", status: "ok", version: match?.[1] || "unknown" });
    } else {
      deps.push({ name: "ffmpeg", status: "missing", detail: "brew install ffmpeg" });
      missing.push("ffmpeg");
    }

    // yt-dlp (may be in ~/.local/bin or Python user bin)
    let ytdlpVer = await checkCommand("yt-dlp");
    if (!ytdlpVer) {
      const homedir = process.env.HOME || "";
      const extraPaths = [
        `${homedir}/.local/bin/yt-dlp`,
        `${homedir}/Library/Python/3.11/bin/yt-dlp`,
        `${homedir}/Library/Python/3.12/bin/yt-dlp`,
      ];
      for (const p of extraPaths) {
        ytdlpVer = await checkCommand(p);
        if (ytdlpVer) break;
      }
    }
    if (ytdlpVer) {
      deps.push({ name: "yt-dlp", status: "ok", version: ytdlpVer });
    } else {
      deps.push({ name: "yt-dlp", status: "missing", detail: "pip3 install yt-dlp[default]" });
      missing.push("yt-dlp");
    }

    // Python 3.10+
    const python = await findBestPython();
    if (python) {
      deps.push({ name: "python3", status: "ok", version: python.version, detail: python.cmd });

      // faster-whisper
      const hasWhisper = await checkPythonModule(python.cmd, "faster-whisper", "from faster_whisper import WhisperModel");
      if (hasWhisper) {
        deps.push({ name: "faster-whisper", status: "ok" });
      } else {
        deps.push({ name: "faster-whisper", status: "missing", detail: "pip3 install faster-whisper" });
        missing.push("faster-whisper");
      }

      // cryptography
      const hasCrypto = await checkPythonModule(python.cmd, "cryptography", "from cryptography.hazmat.primitives.ciphers import Cipher");
      if (hasCrypto) {
        deps.push({ name: "cryptography", status: "ok" });
      } else {
        deps.push({ name: "cryptography", status: "warn", detail: "pip3 install cryptography（YouTube cookies 自动导出需要）" });
      }

      // certifi
      const hasCertifi = await checkPythonModule(python.cmd, "certifi", "import certifi");
      if (hasCertifi) {
        deps.push({ name: "certifi", status: "ok" });
      } else {
        deps.push({ name: "certifi", status: "warn", detail: "pip3 install certifi（macOS SSL 证书需要）" });
      }
    } else {
      deps.push({ name: "python3", status: "missing", detail: "需要 Python 3.10+，brew install python@3.11" });
      missing.push("python3.10+");
      deps.push({ name: "faster-whisper", status: "missing", detail: "需要先安装 Python 3.10+" });
      missing.push("faster-whisper");
    }

    const allOk = missing.length === 0;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          allOk,
          missing,
          deps,
          installHint: allOk ? null : `缺少 ${missing.length} 个关键依赖：${missing.join("、")}`,
        }, null, 2),
      }],
    };
  }
);

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

      const fp = makeFingerprint({ input, output_dir, proxy });
      const lock = await acquireLock(outDir, "video-download", fp);
      if (!lock.acquired) {
        const { readdir } = await import("fs/promises");
        const files = await readdir(outDir).catch(() => [] as string[]);
        const videoFile = files.find(f => /\.(mp4|mkv|webm)$/.test(f));
        if (videoFile) {
          const videoPath = resolve(outDir, videoFile);
          const title = videoFile.replace(/\.(mp4|mkv|webm)$/, "");
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                videoPath,
                title,
                sourceType: detectSourceType(input),
                outputDir: outDir,
                cached: true,
              }, null, 2),
            }],
          };
        }
        return {
          content: [{ type: "text" as const, text: `下载正在进行中，请勿重复调用（${lock.reason}）` }],
        };
      }

      try {
        const result = await downloadVideo(input, outDir, config.downloader);
        await completeLock(outDir, "video-download");

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
        await removeLock(outDir, "video-download");
        throw error;
      }
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

      const fp = makeFingerprint({ video_path, output_dir, mode, interval_seconds });
      const lock = await acquireLock(output_dir, "video-extract-frames", fp);
      if (!lock.acquired) {
        const framesDir = resolve(output_dir, "frames");
        const { readdir } = await import("fs/promises");
        const files = await readdir(framesDir).catch(() => [] as string[]);
        const frameFiles = files.filter(f => f.endsWith(".png") || f.endsWith(".jpg"));
        if (frameFiles.length > 0) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                framesDir,
                frameCount: frameFiles.length,
                timestamps: frameFiles.map((_, i) => i * (interval_seconds || config.extractor.interval_seconds)),
                cached: true,
              }, null, 2),
            }],
          };
        }
        return {
          content: [{ type: "text" as const, text: `截帧正在进行中，请勿重复调用（${lock.reason}）` }],
        };
      }

      try {
        const result = await extractFrames(video_path, output_dir, config.extractor);
        await completeLock(output_dir, "video-extract-frames");

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
        await removeLock(output_dir, "video-extract-frames");
        throw error;
      }
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

      const fp = makeFingerprint({ video_path, output_dir, model, language });
      const lock = await acquireLock(output_dir, "video-transcribe", fp);
      if (!lock.acquired) {
        const transcriptDir = resolve(output_dir, "transcript");
        const transcriptFile = resolve(transcriptDir, "transcript.json");
        if (existsSync(transcriptFile)) {
          const data = JSON.parse(await readFile(transcriptFile, "utf-8"));
          const segments = data.segments || [];
          const fullText = segments.map((s: any) => s.text).join("");
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                segmentCount: segments.length,
                language: data.language || "unknown",
                outputFile: transcriptFile,
                preview: fullText.slice(0, 500),
                cached: true,
              }, null, 2),
            }],
          };
        }
        return {
          content: [{ type: "text" as const, text: `转录正在进行中，请勿重复调用（${lock.reason}）` }],
        };
      }

      try {
        const result = await transcribeVideo(video_path, output_dir, config.whisper);
        await completeLock(output_dir, "video-transcribe");

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
        await removeLock(output_dir, "video-transcribe");
        throw error;
      }
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

// 工具4：图文配对
server.tool(
  "video-assemble",
  "将截帧图片与转录文字按时间戳配对，生成 paired_results.json",
  {
    frames_dir: z.string().describe("截帧图片目录路径"),
    transcript_file: z.string().describe("转录结果 JSON 文件路径"),
    output_dir: z.string().describe("输出目录"),
    interval_seconds: z.number().optional().describe("截帧间隔秒数（用于时间窗口匹配）"),
  },
  async ({ frames_dir, transcript_file, output_dir, interval_seconds }) => {
    pauseIdle();
    try {
      const config = loadConfig();
      const interval = interval_seconds || config.extractor.interval_seconds;

      const fp = makeFingerprint({ frames_dir, transcript_file, output_dir, interval_seconds });
      const lock = await acquireLock(output_dir, "video-assemble", fp);
      if (!lock.acquired) {
        const pairedFile = resolve(output_dir, "paired_results.json");
        if (existsSync(pairedFile)) {
          const data = JSON.parse(await readFile(pairedFile, "utf-8"));
          const items = data.items || data || [];
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                pairedItems: items.length,
                outputFile: pairedFile,
                cached: true,
                preview: (Array.isArray(items) ? items : []).slice(0, 3).map((item: any) => ({
                  time: item.timeLabel,
                  frame: item.framePath,
                  text: (item.text || "").slice(0, 100),
                })),
              }, null, 2),
            }],
          };
        }
        return {
          content: [{ type: "text" as const, text: `配对正在进行中，请勿重复调用（${lock.reason}）` }],
        };
      }

      try {
        const { readFile: rf, readdir: rd } = await import("fs/promises");
        const { resolve: res } = await import("path");

        const transcriptData = JSON.parse(await rf(transcript_file, "utf-8"));
        const segments = transcriptData.segments || [];

        const files = (await rd(frames_dir)).filter(f => f.endsWith(".png") || f.endsWith(".jpg")).sort();
        const frameFiles = files.map(f => res(frames_dir, f));
        const timestamps = files.map((_, i) => i * interval);

        const result = await assembleResults(frameFiles, timestamps, segments, interval, output_dir);
        await completeLock(output_dir, "video-assemble");

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                pairedItems: result.items.length,
                totalFrames: result.totalFrames,
                totalSegments: result.totalSegments,
                outputFile: result.outputFile,
                preview: result.items.slice(0, 3).map((item) => ({
                  time: item.timeLabel,
                  frame: item.framePath,
                  text: item.text.slice(0, 100),
                })),
              }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        await removeLock(output_dir, "video-assemble");
        throw error;
      }
    } catch (error: any) {
      return {
        content: [{ type: "text" as const, text: `配对失败: ${error.message}` }],
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

  // 超时保护：空闲 5 分钟后自动退出，工具执行时 30 分钟超时
  let idleTimer: NodeJS.Timeout;
  let currentTimerTimeout: number = 5 * 60 * 1000; // 默认 5 分钟

  const setIdleTimer = (timeout: number) => {
    clearTimeout(idleTimer);
    currentTimerTimeout = timeout;
    idleTimer = setTimeout(() => {
      console.error(`[video-learn] idle timeout (${timeout / 60000}min), exiting...`);
      process.exit(0);
    }, timeout);
  };

  pauseIdle = () => {
    // 工具执行时完全清除 timer，不计时
    // 等工具返回后由 resetIdle() 重新开始 5 分钟计时
    clearTimeout(idleTimer);
  };
  resetIdle = () => {
    setIdleTimer(5 * 60 * 1000);
  };
  resetIdle();

  // 信号处理：优雅退出（处理 ESC 打断等情况）
  const gracefulShutdown = (signal: string) => {
    console.error(`[video-learn] received ${signal}, cleaning up...`);
    // 清理所有 lock 文件
    // 注意：这里不主动清理，因为工具可能还在执行，让 lock 机制处理
    setTimeout(() => process.exit(0), 2000);
  };
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  process.on('message', resetIdle);
  process.stdin.on('data', resetIdle);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
