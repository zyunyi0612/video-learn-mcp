import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, "..", "config.json");
export function loadConfig(overrides) {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    const config = { ...raw, ...overrides };
    config.output.base_dir = config.output.base_dir.replace(/^~/, homedir());
    return config;
}
export function getOutputDir(config, videoName) {
    const sanitized = videoName.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_").slice(0, 80);
    const timestamp = new Date().toISOString().slice(0, 10);
    return resolve(config.output.base_dir, `${timestamp}_${sanitized}`);
}
//# sourceMappingURL=config.js.map