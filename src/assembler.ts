import { resolve } from "path";
import { writeFile } from "fs/promises";
import { TranscribeSegment } from "./transcriber.js";

export interface PairedItem {
  index: number;
  timestamp: number;
  timeLabel: string;
  framePath: string;
  text: string;
  segments: TranscribeSegment[];
}

export interface AssembleResult {
  items: PairedItem[];
  outputFile: string;
  totalFrames: number;
  totalSegments: number;
}

export async function assembleResults(
  frameFiles: string[],
  frameTimestamps: number[],
  segments: TranscribeSegment[],
  intervalSeconds: number,
  outputDir: string
): Promise<AssembleResult> {
  const items: PairedItem[] = frameFiles.map((framePath, i) => {
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
      segments: matched,
    };
  });

  const outputFile = resolve(outputDir, "paired_results.json");
  await writeFile(outputFile, JSON.stringify({ items, meta: { totalFrames: frameFiles.length, totalSegments: segments.length, intervalSeconds } }, null, 2), "utf-8");

  return {
    items,
    outputFile,
    totalFrames: frameFiles.length,
    totalSegments: segments.length,
  };
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
