import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { resolve, basename } from "path";
import { mkdir, readdir } from "fs/promises";
import { homedir } from "os";
import { DownloaderConfig } from "./config.js";

const execFileAsync = promisify(execFile);

export type SourceType = "local" | "youtube" | "bilibili";

export interface DownloadResult {
  videoPath: string;
  title: string;
  sourceType: SourceType;
  duration?: number;
}

export function detectSourceType(input: string): SourceType {
  if (input.includes("youtube.com") || input.includes("youtu.be")) return "youtube";
  if (input.includes("bilibili.com") || input.includes("b23.tv")) return "bilibili";
  return "local";
}

export async function downloadVideo(
  input: string,
  outputDir: string,
  config: DownloaderConfig
): Promise<DownloadResult> {
  await mkdir(outputDir, { recursive: true });
  const sourceType = detectSourceType(input);

  if (sourceType === "local") {
    return handleLocalFile(input);
  }

  return handleRemoteVideo(input, outputDir, sourceType, config);
}

function handleLocalFile(filePath: string): DownloadResult {
  const resolved = resolve(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`本地文件不存在：${resolved}`);
  }
  return {
    videoPath: resolved,
    title: basename(resolved, ".mp4"),
    sourceType: "local",
  };
}

const YT_DLP_PATH = resolve(homedir(), "Library/Python/3.11/bin/yt-dlp");

function getYtDlpCommand(): string {
  if (existsSync(YT_DLP_PATH)) return YT_DLP_PATH;
  return "yt-dlp";
}

function getCertEnv(): Record<string, string> {
  try {
    const certPath = resolve(
      homedir(),
      "Library/Python/3.11/lib/python/site-packages/certifi/cacert.pem"
    );
    if (existsSync(certPath)) {
      return { SSL_CERT_FILE: certPath };
    }
  } catch {}
  return {};
}

async function handleRemoteVideo(
  url: string,
  outputDir: string,
  sourceType: SourceType,
  config: DownloaderConfig
): Promise<DownloadResult> {
  const outputTemplate = resolve(outputDir, "%(title)s.%(ext)s");
  const ytdlp = getYtDlpCommand();

  const args: string[] = [
    url,
    "-o", outputTemplate,
    "--no-playlist",
    "-f", `bestvideo[height<=${config.max_resolution.replace("p", "")}]+bestaudio/best[height<=${config.max_resolution.replace("p", "")}]`,
    "--merge-output-format", config.prefer_format,
    "--print", "after_move:filepath",
    "--no-simulate",
  ];

  if (sourceType === "youtube") {
    args.push("--js-runtimes", "node");
    args.push("--no-check-certificates");
    args.push("--cookies-from-browser", "chrome");
    // 下载 YouTube 字幕（优先中文，其次英文，最后自动生成）
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
      timeout: 600_000,
      maxBuffer: 10 * 1024 * 1024,
      env,
    });

    // yt-dlp 把 --print 输出到 stdout，但可能有日志混杂
    const lines = stdout.trim().split("\n").filter(line => line.trim() && !line.startsWith("["));
    let videoPath = lines.find(line => existsSync(line)) || null;

    // 如果 stdout 没找到，在输出目录中找最新的视频文件
    if (!videoPath) {
      const files = await readdir(outputDir);
      const videoFiles = files.filter(f => f.endsWith(".mp4") || f.endsWith(".mkv") || f.endsWith(".webm"));
      if (videoFiles.length > 0) {
        // 按修改时间排序，取最新的
        const filesWithStat = await Promise.all(videoFiles.map(async (f) => {
          const stat = await import("fs/promises").then(fs => fs.stat(resolve(outputDir, f)));
          return { name: f, mtime: stat.mtime };
        }));
        filesWithStat.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
        videoPath = resolve(outputDir, filesWithStat[0].name);
      }
    }

    if (!videoPath || !existsSync(videoPath)) {
      throw new Error(`下载完成但文件不存在，输出目录：${outputDir}`);
    }

    const title = basename(videoPath).replace(/\.(mp4|mkv|webm)$/, "");

    // 从 stderr 提取时长
    const durationMatch = stderr.match(/Duration:\s+(\d+):(\d+):(\d+)/);
    let duration: number | undefined;
    if (durationMatch) {
      duration = parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseInt(durationMatch[3]);
    }

    return { videoPath, title, sourceType, duration };
  } finally {
  }
}
