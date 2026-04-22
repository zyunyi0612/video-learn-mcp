import { execFile } from "child_process";
import { promisify } from "util";
import { resolve } from "path";
import { mkdir, readdir } from "fs/promises";
import { ExtractorConfig } from "./config.js";

const execFileAsync = promisify(execFile);

export interface ExtractResult {
  framesDir: string;
  frameFiles: string[];
  frameCount: number;
  timestamps: number[];
}

export async function extractFrames(
  videoPath: string,
  outputDir: string,
  config: ExtractorConfig
): Promise<ExtractResult> {
  const framesDir = resolve(outputDir, "frames");
  await mkdir(framesDir, { recursive: true });

  const outputPattern = resolve(framesDir, "frame_%05d.png");

  const args = buildFfmpegArgs(videoPath, outputPattern, config);

  await execFileAsync("ffmpeg", args, {
    timeout: 600_000,
    maxBuffer: 10 * 1024 * 1024,
  });

  const files = await readdir(framesDir);
  const frameFiles = files
    .filter((f) => f.startsWith("frame_") && f.endsWith(`.${config.image_format}`))
    .sort();

  const timestamps = frameFiles.map((f) => {
    const num = parseInt(f.replace("frame_", "").replace(`.${config.image_format}`, ""), 10);
    return (num - 1) * config.interval_seconds;
  });

  return {
    framesDir,
    frameFiles: frameFiles.map((f) => resolve(framesDir, f)),
    frameCount: frameFiles.length,
    timestamps,
  };
}

function buildFfmpegArgs(
  videoPath: string,
  outputPattern: string,
  config: ExtractorConfig
): string[] {
  const args: string[] = ["-i", videoPath, "-y"];

  if (config.mode === "smart") {
    args.push(
      "-vf", `select='gt(scene\\,${config.scene_threshold})'`,
      "-vsync", "vfr"
    );
  } else {
    args.push("-vf", `fps=1/${config.interval_seconds}`);
  }

  args.push(
    "-q:v", String(Math.max(1, Math.min(31, Math.round((100 - config.image_quality) * 31 / 100)))),
    outputPattern
  );

  return args;
}
