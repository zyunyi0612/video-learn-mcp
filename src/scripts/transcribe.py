#!/usr/bin/env python3
"""
使用 faster-whisper 将视频/音频转录为带时间戳的文本。
"""

import argparse
import json
import sys


def main():
    parser = argparse.ArgumentParser(description="Transcribe video/audio using faster-whisper")
    parser.add_argument("--input", required=True, help="Input video/audio file path")
    parser.add_argument("--output", required=True, help="Output JSON file path")
    parser.add_argument("--model", default="small", help="Whisper model size")
    parser.add_argument("--language", default="zh", help="Language code")
    parser.add_argument("--device", default="auto", help="Device: auto/cpu/cuda")
    parser.add_argument("--compute-type", default="int8", help="Compute type: int8/float16/float32")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("Error: faster-whisper not installed. Run: pip3 install faster-whisper", file=sys.stderr)
        sys.exit(1)

    device = args.device
    if device == "auto":
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            device = "cpu"

    print(f"Loading model '{args.model}' on {device}...", file=sys.stderr)
    model = WhisperModel(args.model, device=device, compute_type=args.compute_type)

    print(f"Transcribing '{args.input}'...", file=sys.stderr)
    segments_gen, info = model.transcribe(
        args.input,
        language=args.language if args.language != "auto" else None,
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
    )

    segments = []
    for seg in segments_gen:
        segments.append({
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip(),
        })
        print(f"  [{seg.start:.1f}s - {seg.end:.1f}s] {seg.text.strip()}", file=sys.stderr)

    result = {
        "language": info.language,
        "language_probability": round(info.language_probability, 3),
        "duration": round(info.duration, 2),
        "segments": segments,
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Transcription saved to '{args.output}' ({len(segments)} segments)", file=sys.stderr)


if __name__ == "__main__":
    main()
