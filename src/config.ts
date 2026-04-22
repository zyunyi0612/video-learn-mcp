import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, "..", "config.json");

export interface WhisperConfig {
  model: string;
  language: string;
  device: string;
  compute_type: string;
}

export interface ExtractorConfig {
  mode: "interval" | "smart";
  interval_seconds: number;
  scene_threshold: number;
  image_format: string;
  image_quality: number;
}

export interface OutputConfig {
  base_dir: string;
  keep_video: boolean;
  keep_audio: boolean;
}

export interface DownloaderConfig {
  proxy: string;
  cookies_file: string;
  max_resolution: string;
  prefer_format: string;
}

export interface AppConfig {
  whisper: WhisperConfig;
  extractor: ExtractorConfig;
  output: OutputConfig;
  downloader: DownloaderConfig;
}

export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  const config: AppConfig = { ...raw, ...overrides };
  config.output.base_dir = config.output.base_dir.replace(/^~/, homedir());
  return config;
}

export function getOutputDir(config: AppConfig, videoName: string): string {
  const sanitized = videoName.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_").slice(0, 80);
  const timestamp = new Date().toISOString().slice(0, 10);
  return resolve(config.output.base_dir, `${timestamp}_${sanitized}`);
}
