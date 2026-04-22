#!/bin/bash
set -e

echo "=== Video-Learn 依赖安装 ==="

OS="$(uname -s)"

# ffmpeg
if ! command -v ffmpeg &>/dev/null; then
  echo "安装 ffmpeg..."
  if [ "$OS" = "Darwin" ]; then
    brew install ffmpeg
  else
    sudo apt-get update && sudo apt-get install -y ffmpeg
  fi
fi

# yt-dlp
if ! command -v yt-dlp &>/dev/null; then
  echo "安装 yt-dlp..."
  pip3 install --break-system-packages "yt-dlp[default]" 2>/dev/null || pip3 install "yt-dlp[default]"
fi

# faster-whisper
if ! python3 -c "from faster_whisper import WhisperModel" &>/dev/null; then
  echo "安装 faster-whisper..."
  pip3 install --break-system-packages faster-whisper 2>/dev/null || pip3 install faster-whisper
fi

echo "=== 依赖安装完成 ==="
