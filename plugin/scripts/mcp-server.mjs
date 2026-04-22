// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// src/config.ts
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
var __dirname = dirname(fileURLToPath(import.meta.url));
var CONFIG_PATH = resolve(__dirname, "..", "config.json");
function loadConfig(overrides) {
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  const config = { ...raw, ...overrides };
  config.output.base_dir = config.output.base_dir.replace(/^~/, homedir());
  return config;
}
function getOutputDir(config, videoName) {
  const sanitized = videoName.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_").slice(0, 80);
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return resolve(config.output.base_dir, `${timestamp}_${sanitized}`);
}

// src/downloader.ts
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { resolve as resolve2, basename } from "path";
import { mkdir, readdir } from "fs/promises";
import { homedir as homedir2 } from "os";
var execFileAsync = promisify(execFile);
function detectSourceType(input) {
  if (input.includes("youtube.com") || input.includes("youtu.be")) return "youtube";
  if (input.includes("bilibili.com") || input.includes("b23.tv")) return "bilibili";
  return "local";
}
async function downloadVideo(input, outputDir, config) {
  await mkdir(outputDir, { recursive: true });
  const sourceType = detectSourceType(input);
  if (sourceType === "local") {
    return handleLocalFile(input);
  }
  return handleRemoteVideo(input, outputDir, sourceType, config);
}
function handleLocalFile(filePath) {
  const resolved = resolve2(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`\u672C\u5730\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${resolved}`);
  }
  return {
    videoPath: resolved,
    title: basename(resolved, ".mp4"),
    sourceType: "local"
  };
}
var YT_DLP_PATH = resolve2(homedir2(), "Library/Python/3.11/bin/yt-dlp");
function getYtDlpCommand() {
  if (existsSync(YT_DLP_PATH)) return YT_DLP_PATH;
  return "yt-dlp";
}
function getCertEnv() {
  try {
    const certPath = resolve2(
      homedir2(),
      "Library/Python/3.11/lib/python/site-packages/certifi/cacert.pem"
    );
    if (existsSync(certPath)) {
      return { SSL_CERT_FILE: certPath };
    }
  } catch {
  }
  return {};
}
async function handleRemoteVideo(url, outputDir, sourceType, config) {
  const outputTemplate = resolve2(outputDir, "%(title)s.%(ext)s");
  const ytdlp = getYtDlpCommand();
  const args = [
    url,
    "-o",
    outputTemplate,
    "--no-playlist",
    "-f",
    `bestvideo[height<=${config.max_resolution.replace("p", "")}]+bestaudio/best[height<=${config.max_resolution.replace("p", "")}]`,
    "--merge-output-format",
    config.prefer_format,
    "--print",
    "after_move:filepath",
    "--no-simulate"
  ];
  if (sourceType === "youtube") {
    args.push("--js-runtimes", "node");
    args.push("--no-check-certificates");
    args.push("--cookies-from-browser", "chrome");
    args.push("--write-sub", "--write-auto-sub");
    args.push("--sub-langs", "zh-Hans,zh-CN,en");
    args.push("--convert-subs", "vtt");
  }
  if (config.proxy) {
    args.push("--proxy", config.proxy);
  }
  if (sourceType !== "youtube" && config.cookies_file && existsSync(config.cookies_file)) {
    args.push("--cookies", config.cookies_file);
  }
  const env = { ...process.env, ...getCertEnv() };
  try {
    const { stdout, stderr } = await execFileAsync(ytdlp, args, {
      timeout: 6e5,
      maxBuffer: 10 * 1024 * 1024,
      env
    });
    const lines = stdout.trim().split("\n").filter((line) => line.trim() && !line.startsWith("["));
    let videoPath = lines.find((line) => existsSync(line)) || null;
    if (!videoPath) {
      const files = await readdir(outputDir);
      const videoFiles = files.filter((f) => f.endsWith(".mp4") || f.endsWith(".mkv") || f.endsWith(".webm"));
      if (videoFiles.length > 0) {
        const filesWithStat = await Promise.all(videoFiles.map(async (f) => {
          const stat = await import("fs/promises").then((fs) => fs.stat(resolve2(outputDir, f)));
          return { name: f, mtime: stat.mtime };
        }));
        filesWithStat.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
        videoPath = resolve2(outputDir, filesWithStat[0].name);
      }
    }
    if (!videoPath || !existsSync(videoPath)) {
      throw new Error(`\u4E0B\u8F7D\u5B8C\u6210\u4F46\u6587\u4EF6\u4E0D\u5B58\u5728\uFF0C\u8F93\u51FA\u76EE\u5F55\uFF1A${outputDir}`);
    }
    const title = basename(videoPath).replace(/\.(mp4|mkv|webm)$/, "");
    const durationMatch = stderr.match(/Duration:\s+(\d+):(\d+):(\d+)/);
    let duration;
    if (durationMatch) {
      duration = parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseInt(durationMatch[3]);
    }
    return { videoPath, title, sourceType, duration };
  } finally {
  }
}

// src/extractor.ts
import { execFile as execFile2 } from "child_process";
import { promisify as promisify2 } from "util";
import { resolve as resolve3 } from "path";
import { mkdir as mkdir2, readdir as readdir2 } from "fs/promises";
var execFileAsync2 = promisify2(execFile2);
async function extractFrames(videoPath, outputDir, config) {
  const framesDir = resolve3(outputDir, "frames");
  await mkdir2(framesDir, { recursive: true });
  const outputPattern = resolve3(framesDir, "frame_%05d.png");
  const args = buildFfmpegArgs(videoPath, outputPattern, config);
  await execFileAsync2("ffmpeg", args, {
    timeout: 6e5,
    maxBuffer: 10 * 1024 * 1024
  });
  const files = await readdir2(framesDir);
  const frameFiles = files.filter((f) => f.startsWith("frame_") && f.endsWith(`.${config.image_format}`)).sort();
  const timestamps = frameFiles.map((f) => {
    const num = parseInt(f.replace("frame_", "").replace(`.${config.image_format}`, ""), 10);
    return (num - 1) * config.interval_seconds;
  });
  return {
    framesDir,
    frameFiles: frameFiles.map((f) => resolve3(framesDir, f)),
    frameCount: frameFiles.length,
    timestamps
  };
}
function buildFfmpegArgs(videoPath, outputPattern, config) {
  const args = ["-i", videoPath, "-y"];
  if (config.mode === "smart") {
    args.push(
      "-vf",
      `select='gt(scene\\,${config.scene_threshold})'`,
      "-vsync",
      "vfr"
    );
  } else {
    args.push("-vf", `fps=1/${config.interval_seconds}`);
  }
  args.push(
    "-q:v",
    String(Math.max(1, Math.min(31, Math.round((100 - config.image_quality) * 31 / 100)))),
    outputPattern
  );
  return args;
}

// src/transcriber.ts
import { execFile as execFile3 } from "child_process";
import { promisify as promisify3 } from "util";
import { resolve as resolve4, dirname as dirname2, basename as basename2 } from "path";
import { mkdir as mkdir3, readFile, writeFile } from "fs/promises";
import { fileURLToPath as fileURLToPath2 } from "url";
var execFileAsync3 = promisify3(execFile3);
var __dirname2 = dirname2(fileURLToPath2(import.meta.url));
async function readYoutubeSubs(videoPath) {
  const dir = dirname2(videoPath);
  const base = basename2(videoPath, ".mp4");
  const langCodes = ["zh-Hans", "zh-CN", "zh", "en"];
  const extensions = ["vtt", "srv3", "json", "srt"];
  for (const lang of langCodes) {
    for (const ext of extensions) {
      const subPath = resolve4(dir, `${base}.${lang}.${ext}`);
      try {
        const content = await readFile(subPath, "utf-8");
        let segments = [];
        if (ext === "vtt") {
          segments = parseVtt(content);
        } else if (ext === "srv3" || ext === "json") {
          segments = parseYouTubeJson(content);
        } else if (ext === "srt") {
          segments = parseSrt(content);
        }
        if (segments.length > 0) {
          console.log(`\u627E\u5230 YouTube \u5B57\u5E55 (${lang}.${ext}): ${segments.length} \u6761`);
          return segments;
        }
      } catch (e) {
      }
    }
  }
  return null;
}
function parseVtt(content) {
  const segments = [];
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].includes("-->")) {
    i++;
  }
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes("-->")) {
      const timeMatch = line.match(/(\d+):(\d+):(\d+)[.:](\d+)\s*-->\s*(\d+):(\d+):(\d+)[.:](\d+)/);
      if (timeMatch) {
        const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1e3;
        const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1e3;
        i++;
        const textLines = [];
        while (i < lines.length && lines[i].trim() !== "" && !lines[i].includes("-->")) {
          textLines.push(lines[i].trim());
          i++;
        }
        const text = textLines.join(" ").trim();
        if (text) {
          segments.push({ start, end, text, source: "youtube-sub" });
        }
      } else {
        i++;
      }
    } else {
      i++;
    }
  }
  return segments;
}
function parseYouTubeJson(content) {
  const segments = [];
  try {
    const subs = JSON.parse(content);
    if (subs.events && Array.isArray(subs.events)) {
      for (const event of subs.events) {
        if (!event.segs) continue;
        const start = (event.tStartMs || 0) / 1e3;
        const duration = (event.dDurationMs || 0) / 1e3;
        const text = event.segs.map((s) => s.utf8 || "").join("");
        if (text.trim()) {
          segments.push({ start, end: start + duration, text: text.trim(), source: "youtube-sub" });
        }
      }
    }
  } catch (e) {
  }
  return segments;
}
function parseSrt(content) {
  const segments = [];
  const blocks = content.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;
    const timeMatch = lines[1].match(/(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)/);
    if (timeMatch) {
      const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1e3;
      const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1e3;
      const text = lines.slice(2).join(" ").trim();
      if (text) {
        segments.push({ start, end, text, source: "youtube-sub" });
      }
    }
  }
  return segments;
}
async function transcribeVideo(videoPath, outputDir, config) {
  const transcriptDir = resolve4(outputDir, "transcript");
  await mkdir3(transcriptDir, { recursive: true });
  const outputFile = resolve4(transcriptDir, "transcript.json");
  const scriptPath = resolve4(__dirname2, "scripts", "transcribe.py");
  const youtubeSubs = await readYoutubeSubs(videoPath);
  let segments;
  let language = config.language;
  let hasYoutubeSubs = false;
  if (youtubeSubs && youtubeSubs.length > 0) {
    segments = youtubeSubs;
    hasYoutubeSubs = true;
    try {
      const { stdout } = await execFileAsync3(
        "python3",
        [
          scriptPath,
          "--input",
          videoPath,
          "--output",
          outputFile + ".whisper.json",
          "--model",
          config.model,
          "--language",
          config.language,
          "--device",
          config.device,
          "--compute-type",
          config.compute_type
        ],
        {
          timeout: 18e5,
          maxBuffer: 50 * 1024 * 1024
        }
      );
      const whisperResult = JSON.parse(await readFile(outputFile + ".whisper.json", "utf-8"));
      const whisperSegments = (whisperResult.segments || []).map((s) => ({
        ...s,
        source: "whisper"
      }));
      segments = mergeSubs(youtubeSubs, whisperSegments);
      language = whisperResult.language || config.language;
    } catch (e) {
      console.log("Whisper \u8F6C\u5F55\u5931\u8D25\uFF0C\u4EC5\u4F7F\u7528 YouTube \u5B57\u5E55");
    }
  } else {
    hasYoutubeSubs = false;
    const { stdout } = await execFileAsync3(
      "python3",
      [
        scriptPath,
        "--input",
        videoPath,
        "--output",
        outputFile,
        "--model",
        config.model,
        "--language",
        config.language,
        "--device",
        config.device,
        "--compute-type",
        config.compute_type
      ],
      {
        timeout: 18e5,
        maxBuffer: 50 * 1024 * 1024
      }
    );
    const result = JSON.parse(await readFile(outputFile, "utf-8"));
    segments = (result.segments || []).map((s) => ({ ...s, source: "whisper" }));
    language = result.language || config.language;
  }
  const resultData = {
    segments,
    language,
    hasYoutubeSubs,
    sourceBreakdown: {
      youtube: segments.filter((s) => s.source === "youtube-sub").length,
      whisper: segments.filter((s) => s.source === "whisper").length
    }
  };
  await writeFile(outputFile, JSON.stringify(resultData, null, 2));
  return {
    segments,
    fullText: segments.map((s) => s.text).join(""),
    language,
    outputFile,
    hasYoutubeSubs
  };
}
function mergeSubs(youtubeSegs, whisperSegs) {
  const result = [];
  const youtubeCovered = youtubeSegs.map((s) => ({ start: s.start, end: s.end }));
  for (const ws of whisperSegs) {
    const isCovered = youtubeCovered.some(
      (yc) => ws.start >= yc.start - 0.5 && ws.end <= yc.end + 0.5
    );
    if (!isCovered) {
      youtubeSegs.push({ ...ws, source: "whisper" });
    }
  }
  return youtubeSegs.sort((a, b) => a.start - b.start);
}

// src/assembler.ts
import { resolve as resolve5 } from "path";
import { writeFile as writeFile2 } from "fs/promises";
async function assembleResults(frameFiles, frameTimestamps, segments, intervalSeconds, outputDir) {
  const items = frameFiles.map((framePath, i) => {
    const ts = frameTimestamps[i];
    const windowStart = ts;
    const windowEnd = ts + intervalSeconds;
    const matched = segments.filter(
      (seg) => seg.end > windowStart && seg.start < windowEnd
    );
    const text = matched.map((s) => s.text).join("");
    return {
      index: i + 1,
      timestamp: ts,
      timeLabel: formatTime(ts),
      framePath,
      text: text.trim(),
      segments: matched
    };
  });
  const outputFile = resolve5(outputDir, "paired_results.json");
  await writeFile2(outputFile, JSON.stringify({ items, meta: { totalFrames: frameFiles.length, totalSegments: segments.length, intervalSeconds } }, null, 2), "utf-8");
  return {
    items,
    outputFile,
    totalFrames: frameFiles.length,
    totalSegments: segments.length
  };
}
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// src/index.ts
import { mkdir as mkdir4 } from "fs/promises";
var server = new McpServer({
  name: "video-learn",
  version: "1.0.0"
});
var resetIdle = () => {
};
var pauseIdle = () => {
};
server.tool(
  "video-download",
  "\u4E0B\u8F7D\u6216\u83B7\u53D6\u89C6\u9891\u6587\u4EF6\u3002\u652F\u6301\u672C\u5730\u8DEF\u5F84\u3001YouTube URL\u3001B\u7AD9 URL",
  {
    input: z.string().describe("\u89C6\u9891\u8DEF\u5F84\u6216 URL"),
    output_dir: z.string().optional().describe("\u8F93\u51FA\u76EE\u5F55\uFF08\u53EF\u9009\uFF0C\u9ED8\u8BA4\u4F7F\u7528\u914D\u7F6E\uFF09"),
    proxy: z.string().optional().describe("\u4EE3\u7406\u5730\u5740\uFF08\u53EF\u9009\uFF09")
  },
  async ({ input, output_dir, proxy }) => {
    pauseIdle();
    try {
      const config = loadConfig();
      if (proxy) config.downloader.proxy = proxy;
      const outDir = output_dir || getOutputDir(config, input);
      await mkdir4(outDir, { recursive: true });
      const sourceType = detectSourceType(input);
      const result = await downloadVideo(input, outDir, config.downloader);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              videoPath: result.videoPath,
              title: result.title,
              sourceType: result.sourceType,
              duration: result.duration,
              outputDir: outDir
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `\u4E0B\u8F7D\u5931\u8D25: ${error.message}` }],
        isError: true
      };
    } finally {
      resetIdle();
    }
  }
);
server.tool(
  "video-extract-frames",
  "\u4ECE\u89C6\u9891\u4E2D\u63D0\u53D6\u5173\u952E\u5E27\u56FE\u7247\u3002\u652F\u6301\u56FA\u5B9A\u95F4\u9694\u548C\u667A\u80FD\u573A\u666F\u68C0\u6D4B\u4E24\u79CD\u6A21\u5F0F",
  {
    video_path: z.string().describe("\u89C6\u9891\u6587\u4EF6\u8DEF\u5F84"),
    output_dir: z.string().describe("\u8F93\u51FA\u76EE\u5F55"),
    mode: z.enum(["interval", "smart"]).optional().describe("\u622A\u5E27\u6A21\u5F0F\uFF1Ainterval\uFF08\u56FA\u5B9A\u95F4\u9694\uFF09\u6216 smart\uFF08\u667A\u80FD\u68C0\u6D4B\uFF09"),
    interval_seconds: z.number().optional().describe("\u622A\u5E27\u95F4\u9694\u79D2\u6570\uFF08\u4EC5 interval \u6A21\u5F0F\uFF09")
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
            type: "text",
            text: JSON.stringify({
              success: true,
              framesDir: result.framesDir,
              frameCount: result.frameCount,
              timestamps: result.timestamps
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `\u622A\u5E27\u5931\u8D25: ${error.message}` }],
        isError: true
      };
    } finally {
      resetIdle();
    }
  }
);
server.tool(
  "video-transcribe",
  "\u5C06\u89C6\u9891\u4E2D\u7684\u8BED\u97F3\u8F6C\u5F55\u4E3A\u5E26\u65F6\u95F4\u6233\u7684\u6587\u5B57\u3002\u4F7F\u7528 faster-whisper \u672C\u5730\u6A21\u578B",
  {
    video_path: z.string().describe("\u89C6\u9891\u6587\u4EF6\u8DEF\u5F84"),
    output_dir: z.string().describe("\u8F93\u51FA\u76EE\u5F55"),
    model: z.string().optional().describe("Whisper \u6A21\u578B\u5927\u5C0F\uFF1Atiny/base/small/medium/large-v3"),
    language: z.string().optional().describe("\u8BED\u8A00\u4EE3\u7801\uFF0C\u5982 zh/en/auto")
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
            type: "text",
            text: JSON.stringify({
              success: true,
              segmentCount: result.segments.length,
              language: result.language,
              outputFile: result.outputFile,
              preview: result.fullText.slice(0, 500)
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `\u8F6C\u5F55\u5931\u8D25: ${error.message}` }],
        isError: true
      };
    } finally {
      resetIdle();
    }
  }
);
server.tool(
  "video-assemble",
  "\u5C06\u622A\u5E27\u56FE\u7247\u4E0E\u8F6C\u5F55\u6587\u5B57\u6309\u65F6\u95F4\u6233\u914D\u5BF9\uFF0C\u751F\u6210 paired_results.json",
  {
    frames_dir: z.string().describe("\u622A\u5E27\u56FE\u7247\u76EE\u5F55\u8DEF\u5F84"),
    transcript_file: z.string().describe("\u8F6C\u5F55\u7ED3\u679C JSON \u6587\u4EF6\u8DEF\u5F84"),
    output_dir: z.string().describe("\u8F93\u51FA\u76EE\u5F55"),
    interval_seconds: z.number().optional().describe("\u622A\u5E27\u95F4\u9694\u79D2\u6570\uFF08\u7528\u4E8E\u65F6\u95F4\u7A97\u53E3\u5339\u914D\uFF09")
  },
  async ({ frames_dir, transcript_file, output_dir, interval_seconds }) => {
    pauseIdle();
    try {
      const config = loadConfig();
      const interval = interval_seconds || config.extractor.interval_seconds;
      const { readFile: readFile2, readdir: readdir4 } = await import("fs/promises");
      const { resolve: resolve6 } = await import("path");
      const transcriptData = JSON.parse(await readFile2(transcript_file, "utf-8"));
      const segments = transcriptData.segments || [];
      const files = (await readdir4(frames_dir)).filter((f) => f.endsWith(".png") || f.endsWith(".jpg")).sort();
      const frameFiles = files.map((f) => resolve6(frames_dir, f));
      const timestamps = files.map((_, i) => i * interval);
      const result = await assembleResults(frameFiles, timestamps, segments, interval, output_dir);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              pairedItems: result.items.length,
              totalFrames: result.totalFrames,
              totalSegments: result.totalSegments,
              outputFile: result.outputFile,
              preview: result.items.slice(0, 3).map((item) => ({
                time: item.timeLabel,
                frame: item.framePath,
                text: item.text.slice(0, 100)
              }))
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `\u914D\u5BF9\u5931\u8D25: ${error.message}` }],
        isError: true
      };
    } finally {
      resetIdle();
    }
  }
);
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stdin.on("end", () => {
    console.error("[video-learn] stdin closed, exiting...");
    setTimeout(() => process.exit(0), 1e3);
  });
  let idleTimer;
  pauseIdle = () => {
    clearTimeout(idleTimer);
  };
  resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      console.error("[video-learn] idle timeout, exiting...");
      process.exit(0);
    }, 5 * 60 * 1e3);
  };
  resetIdle();
  process.on("message", resetIdle);
  process.stdin.on("data", resetIdle);
}
main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
