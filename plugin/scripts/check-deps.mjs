#!/usr/bin/env node
// video-learn plugin setup: check external dependencies

import { execSync } from "child_process";

function check(cmd, label) {
  try {
    execSync(cmd, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const missing = [];

if (!check("ffmpeg -version")) missing.push("ffmpeg");
if (!check("yt-dlp --version")) missing.push("yt-dlp");
if (!check("python3 -c 'from faster_whisper import WhisperModel'"))
  missing.push("faster-whisper (pip3 install faster-whisper)");

if (missing.length > 0) {
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: false,
    status: `video-learn: missing dependencies: ${missing.join(", ")}. Run: curl -fsSL https://raw.githubusercontent.com/zhangyunyi/video-learn-mcp/main/install-deps.sh | bash`
  }));
} else {
  console.log(JSON.stringify({ continue: true, suppressOutput: true, status: "ready" }));
}
