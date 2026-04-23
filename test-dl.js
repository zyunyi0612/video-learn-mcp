import { downloadVideo } from "./dist/downloader.js";

const config = {
  max_resolution: "720p",
  prefer_format: "mp4",
};

const url = process.argv[2] || "https://youtu.be/3DlXq9nsQOE";
const outputDir = process.argv[3] || "/Users/zhangyunyi/Downloads/video-learn/test-mcp";

console.log(`下载视频：${url}`);
console.log(`输出目录：${outputDir}`);

try {
  const result = await downloadVideo(url, outputDir, config);
  console.log("\n下载成功!");
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("\n下载失败:", error.message);
  if (error.stack) console.error(error.stack);
  process.exit(1);
}
