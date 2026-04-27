import { execFile } from "child_process";
import { promisify } from "util";
import { resolve, dirname, basename } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
async function findPython3() {
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
            if (parseInt(stdout.trim(), 10) >= 10)
                return cmd;
        }
        catch { }
    }
    return "python3";
}
/**
 * 尝试读取 YouTube 字幕文件
 * 支持多种格式：vtt, srv3 (YouTube JSON), srt
 */
async function readYoutubeSubs(videoPath) {
    const dir = dirname(videoPath);
    const base = basename(videoPath, ".mp4");
    const langCodes = ["zh-Hans", "zh-CN", "zh", "en"];
    const extensions = ["vtt", "srv3", "json", "srt"];
    for (const lang of langCodes) {
        for (const ext of extensions) {
            const subPath = resolve(dir, `${base}.${lang}.${ext}`);
            try {
                const content = await readFile(subPath, "utf-8");
                let segments = [];
                if (ext === "vtt") {
                    segments = parseVtt(content);
                }
                else if (ext === "srv3" || ext === "json") {
                    segments = parseYouTubeJson(content);
                }
                else if (ext === "srt") {
                    segments = parseSrt(content);
                }
                if (segments.length > 0) {
                    console.log(`找到 YouTube 字幕 (${lang}.${ext}): ${segments.length} 条`);
                    return segments;
                }
            }
            catch (e) {
                // 文件不存在或解析失败，继续尝试下一个
            }
        }
    }
    return null;
}
/**
 * 解析 VTT 字幕格式
 */
function parseVtt(content) {
    const segments = [];
    const lines = content.split('\n');
    let i = 0;
    // 跳过 WEBVTT 头
    while (i < lines.length && !lines[i].includes('-->')) {
        i++;
    }
    while (i < lines.length) {
        const line = lines[i].trim();
        if (line.includes('-->')) {
            const timeMatch = line.match(/(\d+):(\d+):(\d+)[.:](\d+)\s*-->\s*(\d+):(\d+):(\d+)[.:](\d+)/);
            if (timeMatch) {
                const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
                const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
                i++;
                const textLines = [];
                while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
                    textLines.push(lines[i].trim());
                    i++;
                }
                const text = textLines.join(' ').trim();
                if (text) {
                    segments.push({ start, end, text, source: 'youtube-sub' });
                }
            }
            else {
                i++;
            }
        }
        else {
            i++;
        }
    }
    return segments;
}
/**
 * 解析 YouTube JSON 字幕格式 (srv3)
 */
function parseYouTubeJson(content) {
    const segments = [];
    try {
        const subs = JSON.parse(content);
        if (subs.events && Array.isArray(subs.events)) {
            for (const event of subs.events) {
                if (!event.segs)
                    continue;
                const start = (event.tStartMs || 0) / 1000;
                const duration = (event.dDurationMs || 0) / 1000;
                const text = event.segs.map((s) => s.utf8 || "").join("");
                if (text.trim()) {
                    segments.push({ start, end: start + duration, text: text.trim(), source: 'youtube-sub' });
                }
            }
        }
    }
    catch (e) {
        // 解析失败
    }
    return segments;
}
/**
 * 解析 SRT 字幕格式
 */
function parseSrt(content) {
    const segments = [];
    const blocks = content.split(/\n\n+/);
    for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length < 3)
            continue;
        // 解析时间行：00:00:01,000 --> 00:00:03,000
        const timeMatch = lines[1].match(/(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)/);
        if (timeMatch) {
            const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
            const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
            const text = lines.slice(2).join(' ').trim();
            if (text) {
                segments.push({ start, end, text, source: 'youtube-sub' });
            }
        }
    }
    return segments;
}
export async function transcribeVideo(videoPath, outputDir, config) {
    const transcriptDir = resolve(outputDir, "transcript");
    await mkdir(transcriptDir, { recursive: true });
    const outputFile = resolve(transcriptDir, "transcript.json");
    const scriptPath = resolve(__dirname, "transcribe.py");
    // 先尝试读取 YouTube 字幕
    const youtubeSubs = await readYoutubeSubs(videoPath);
    let segments;
    let language = config.language;
    let hasYoutubeSubs = false;
    if (youtubeSubs && youtubeSubs.length > 0) {
        // 有 YouTube 字幕，仍然运行 Whisper 进行对比
        segments = youtubeSubs;
        hasYoutubeSubs = true;
        // 运行 Whisper 转录用于对比
        try {
            const pythonCmd = await findPython3();
            const { stdout } = await execFileAsync(pythonCmd, [
                scriptPath,
                "--input", videoPath,
                "--output", outputFile + ".whisper.json",
                "--model", config.model,
                "--language", config.language,
                "--device", config.device,
                "--compute-type", config.compute_type,
            ], {
                timeout: 1_800_000,
                maxBuffer: 50 * 1024 * 1024,
            });
            const whisperResult = JSON.parse(await readFile(outputFile + ".whisper.json", "utf-8"));
            const whisperSegments = (whisperResult.segments || []).map((s) => ({
                ...s,
                source: "whisper"
            }));
            // 对比并合并：优先使用 YouTube 字幕，Whisper 补充空白区间
            segments = mergeSubs(youtubeSubs, whisperSegments);
            language = whisperResult.language || config.language;
        }
        catch (e) {
            // Whisper 失败，只用 YouTube 字幕
            console.log("Whisper 转录失败，仅使用 YouTube 字幕");
        }
    }
    else {
        // 没有 YouTube 字幕，用 Whisper
        hasYoutubeSubs = false;
        const pythonCmd = await findPython3();
        const { stdout } = await execFileAsync(pythonCmd, [
            scriptPath,
            "--input", videoPath,
            "--output", outputFile,
            "--model", config.model,
            "--language", config.language,
            "--device", config.device,
            "--compute-type", config.compute_type,
        ], {
            timeout: 1_800_000,
            maxBuffer: 50 * 1024 * 1024,
        });
        const result = JSON.parse(await readFile(outputFile, "utf-8"));
        segments = (result.segments || []).map((s) => ({ ...s, source: "whisper" }));
        language = result.language || config.language;
    }
    // 保存结果
    const resultData = {
        segments,
        language,
        hasYoutubeSubs,
        sourceBreakdown: {
            youtube: segments.filter(s => s.source === "youtube-sub").length,
            whisper: segments.filter(s => s.source === "whisper").length
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
/**
 * 合并 YouTube 字幕和 Whisper 转录
 * 策略：
 * 1. 优先使用 YouTube 字幕
 * 2. Whisper 补充 YouTube 字幕没有覆盖的时间段
 * 3. 对于重叠部分，如果文本相似度高则合并，否则保留 YouTube 字幕
 */
function mergeSubs(youtubeSegs, whisperSegs) {
    const result = [];
    // 简单策略：以 YouTube 字幕为主，Whisper 填充空白
    const youtubeCovered = youtubeSegs.map(s => ({ start: s.start, end: s.end }));
    for (const ws of whisperSegs) {
        // 检查 Whisper 段是否已经被 YouTube 覆盖
        const isCovered = youtubeCovered.some(yc => ws.start >= yc.start - 0.5 && ws.end <= yc.end + 0.5);
        if (!isCovered) {
            youtubeSegs.push({ ...ws, source: "whisper" });
        }
    }
    // 按时间排序
    return youtubeSegs.sort((a, b) => a.start - b.start);
}
//# sourceMappingURL=transcriber.js.map