#!/bin/bash
set -e

echo "=========================================="
echo "  Video-Learn-MCP 一键安装脚本"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

success() { echo -e "${GREEN}✓ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $1${NC}"; }
fail()    { echo -e "${RED}✗ $1${NC}"; exit 1; }
info()    { echo -e "  $1"; }
question() { echo -e "${BLUE}? $1${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ERRORS=()

# pip3 安装辅助函数（自动处理 --break-system-packages）
pip_install() {
    local PY_MAJOR=$(python3 -c "import sys; print(sys.version_info.minor)")
    if [ "$PY_MAJOR" -ge 12 ]; then
        pip3 install --break-system-packages "$@"
    else
        pip3 install "$@"
    fi
}

# 验证工具是否真正可用（不只是存在）
verify_tool() {
    local name="$1"
    local cmd="$2"
    if eval "$cmd" &>/dev/null; then
        return 0
    else
        return 1
    fi
}

# 1. 检查操作系统
echo "【1/10】检查操作系统..."
OS="$(uname -s)"
case "$OS" in
    Darwin) success "macOS 检测到" ;;
    Linux)  success "Linux 检测到" ;;
    *)      fail "不支持的操作系统：$OS" ;;
esac

# 2. 检查/安装 Homebrew (macOS)
echo ""
echo "【2/10】检查包管理器..."
if [ "$OS" = "Darwin" ]; then
    if command -v brew &>/dev/null; then
        success "Homebrew 已安装"
    else
        warn "Homebrew 未安装，正在安装..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        if command -v brew &>/dev/null; then
            success "Homebrew 安装完成"
        else
            fail "Homebrew 安装失败，请手动安装后重试"
        fi
    fi
fi

# 3. 检查/安装 ffmpeg
echo ""
echo "【3/10】检查 ffmpeg..."
if command -v ffmpeg &>/dev/null; then
    FFMPEG_VER=$(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')
    success "ffmpeg 已安装 (版本：$FFMPEG_VER)"
else
    warn "ffmpeg 未安装，正在安装..."
    if [ "$OS" = "Darwin" ]; then
        brew install ffmpeg
    else
        sudo apt-get update && sudo apt-get install -y ffmpeg
    fi
fi
if verify_tool "ffmpeg" "ffmpeg -version"; then
    success "ffmpeg 验证通过"
else
    ERRORS+=("ffmpeg 安装后无法运行")
    warn "ffmpeg 安装后验证失败"
fi

# 4. 检查/安装 yt-dlp（使用 pip3）
echo ""
echo "【4/10】检查 yt-dlp..."
if command -v yt-dlp &>/dev/null && verify_tool "yt-dlp" "yt-dlp --version"; then
    YT_VER=$(yt-dlp --version 2>&1)
    success "yt-dlp 已安装且可用 (版本：$YT_VER)"
else
    if command -v yt-dlp &>/dev/null; then
        warn "yt-dlp 已安装但无法运行，尝试重新安装..."
    else
        warn "yt-dlp 未安装，正在安装..."
    fi

    pip_install --upgrade "yt-dlp[default]"

    # 确保 yt-dlp 在 PATH 中
    YT_DLP_BIN=$(python3 -c "import site; print(site.getusersitepackages().replace('/lib/python/site-packages', '/bin'))" 2>/dev/null)/yt-dlp
    if [ -f "$YT_DLP_BIN" ] && ! command -v yt-dlp &>/dev/null; then
        LOCAL_BIN="$HOME/.local/bin"
        mkdir -p "$LOCAL_BIN"
        ln -sf "$YT_DLP_BIN" "$LOCAL_BIN/yt-dlp"
        export PATH="$LOCAL_BIN:$PATH"
        info "已将 yt-dlp 链接到 $LOCAL_BIN/yt-dlp"
    fi

    if verify_tool "yt-dlp" "yt-dlp --version"; then
        YT_VER=$(yt-dlp --version 2>&1)
        success "yt-dlp 安装成功 (版本：$YT_VER)"
    else
        ERRORS+=("yt-dlp 安装后无法运行")
        warn "yt-dlp 安装失败，请手动排查"
        info "尝试运行：pip3 install yt-dlp && yt-dlp --version"
    fi
fi

# 5. 检查/安装 Python 依赖
echo ""
echo "【5/10】检查 Python 依赖..."

# 确定使用的 Python 命令（优先 brew python3.11）
PYTHON_CMD="python3"
if [ "$OS" = "Darwin" ]; then
    if command -v /opt/homebrew/bin/python3.11 &>/dev/null; then
        PYTHON_CMD="/opt/homebrew/bin/python3.11"
        success "使用 brew Python 3.11 (/opt/homebrew/bin/python3.11)"
    elif command -v /usr/local/bin/python3.11 &>/dev/null; then
        PYTHON_CMD="/usr/local/bin/python3.11"
        success "使用 brew Python 3.11 (/usr/local/bin/python3.11)"
    fi
fi

# 检查 Python 版本（需要 3.10+）
if command -v $PYTHON_CMD &>/dev/null; then
    PY_VER=$($PYTHON_CMD --version 2>&1)
    PY_MAJOR=$($PYTHON_CMD -c "import sys; print(sys.version_info.major)")
    PY_MINOR=$($PYTHON_CMD -c "import sys; print(sys.version_info.minor)")

    if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 10 ]; then
        success "Python 已安装 ($PY_VER) - 满足 3.10+ 要求"
    else
        warn "Python 版本过低 ($PY_VER)，需要 3.10+，正在安装..."
        if [ "$OS" = "Darwin" ]; then
            brew install python@3.11
            PYTHON_CMD="/opt/homebrew/bin/python3.11"
        else
            sudo apt-get install -y python3.11 python3.11-venv python3.11-pip
            PYTHON_CMD="python3.11"
        fi
        if command -v $PYTHON_CMD &>/dev/null; then
            success "Python 3.11 安装完成"
        else
            ERRORS+=("Python 3.11 安装失败")
            warn "Python 3.11 安装失败，某些功能可能不可用"
        fi
    fi
else
    warn "Python 未安装，正在安装..."
    if [ "$OS" = "Darwin" ]; then
        brew install python3
        PYTHON_CMD="/opt/homebrew/bin/python3"
    else
        sudo apt-get install -y python3 python3-pip
    fi
    if command -v $PYTHON_CMD &>/dev/null; then
        PY_VER=$($PYTHON_CMD --version 2>&1)
        success "Python 安装完成 ($PY_VER)"
    else
        ERRORS+=("Python 安装失败")
        fail "Python 安装失败"
    fi
fi

# 安装 faster-whisper（使用确定的 Python 命令）
if $PYTHON_CMD -c "import faster_whisper" &>/dev/null; then
    FW_VER=$($PYTHON_CMD -m pip show faster-whisper 2>/dev/null | grep Version | awk '{print $2}')
    success "faster-whisper 已安装 (版本：$FW_VER)"
else
    warn "faster-whisper 未安装，正在安装..."
    if [ "$OS" = "Darwin" ]; then
        $PYTHON_CMD -m pip install --break-system-packages faster-whisper
    else
        $PYTHON_CMD -m pip install faster-whisper
    fi
    if $PYTHON_CMD -c "import faster_whisper" &>/dev/null; then
        FW_VER=$($PYTHON_CMD -m pip show faster-whisper 2>/dev/null | grep Version | awk '{print $2}')
        success "faster-whisper 安装成功 (版本：$FW_VER)"
    else
        ERRORS+=("faster-whisper 安装后 import 失败")
        warn "faster-whisper 安装后验证失败"
    fi
fi

# 安装 cryptography（cookies 自动导出需要）
if $PYTHON_CMD -c "from cryptography.hazmat.primitives.ciphers import Cipher" &>/dev/null; then
    success "cryptography 已安装"
else
    warn "cryptography 未安装，正在安装..."
    if [ "$OS" = "Darwin" ]; then
        $PYTHON_CMD -m pip install --break-system-packages cryptography
    else
        $PYTHON_CMD -m pip install cryptography
    fi
    if $PYTHON_CMD -c "from cryptography.hazmat.primitives.ciphers import Cipher" &>/dev/null; then
        success "cryptography 安装成功"
    else
        ERRORS+=("cryptography 安装失败")
        warn "cryptography 安装失败（YouTube cookies 自动导出将不可用）"
    fi
fi

# 安装 certifi（解决 SSL 证书问题）
if $PYTHON_CMD -c "import certifi" &>/dev/null; then
    success "certifi 已安装"
else
    warn "certifi 未安装，正在安装..."
    if [ "$OS" = "Darwin" ]; then
        $PYTHON_CMD -m pip install --break-system-packages certifi
    else
        $PYTHON_CMD -m pip install certifi
    fi
    if $PYTHON_CMD -c "import certifi" &>/dev/null; then
        success "certifi 安装成功"
    else
        warn "certifi 安装失败（YouTube 下载可能遇到 SSL 错误）"
    fi
fi

# 验证转录脚本能加载
if $PYTHON_CMD -c "from faster_whisper import WhisperModel" &>/dev/null; then
    success "faster-whisper WhisperModel 可正常导入"
else
    ERRORS+=("faster-whisper WhisperModel 导入失败")
    warn "faster-whisper WhisperModel 导入失败，可能缺少依赖"
fi

# 6. 安装 Node.js 依赖
echo ""
echo "【6/10】安装 Node.js 依赖..."

# 检查 Node.js
if command -v node &>/dev/null; then
    NODE_VER=$(node --version 2>&1)
    success "Node.js 已安装 ($NODE_VER)"

    # 检查 node 是否在 brew 路径下（解决 Python 找不到 node 的问题）
    NODE_PATH=$(which node)
    if [[ "$NODE_PATH" == *"/opt/homebrew/bin/"* ]] || [[ "$NODE_PATH" == *"/usr/local/bin/"* ]]; then
        success "Node.js 路径正确 ($NODE_PATH)"
    elif [[ "$NODE_PATH" == *"/.nvm/"* ]]; then
        # nvm 安装的 node，创建软链接到 brew 路径
        BREW_BIN="/opt/homebrew/bin"
        [ ! -d "$BREW_BIN" ] && BREW_BIN="/usr/local/bin"

        if [ -w "$BREW_BIN" ]; then
            ln -sf "$NODE_PATH" "$BREW_BIN/node" 2>/dev/null || true
            success "已创建 node 软链接到 $BREW_BIN/node"
        else
            warn "nvm 安装的 node，Python 可能无法找到 JS runtime"
            info "建议运行：sudo ln -sf $NODE_PATH $BREW_BIN/node"
        fi
    fi
else
    warn "Node.js 未安装，正在安装..."
    if [ "$OS" = "Darwin" ]; then
        brew install node
    else
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    if command -v node &>/dev/null; then
        NODE_VER=$(node --version 2>&1)
        success "Node.js 安装完成 ($NODE_VER)"
    else
        ERRORS+=("Node.js 安装失败")
        fail "Node.js 安装失败"
    fi
fi

# npm install
cd "$SCRIPT_DIR"
if [ -f "package.json" ]; then
    npm install
    success "Node.js 依赖安装完成"
else
    fail "找不到 package.json，请确保在项目根目录运行此脚本"
fi

# 编译 TypeScript
echo ""
echo "编译 TypeScript..."
npm run build
if [ -f "dist/index.js" ]; then
    success "编译完成"
else
    ERRORS+=("TypeScript 编译后 dist/index.js 不存在")
    warn "编译可能未成功"
fi

# 创建默认输出目录
OUTPUT_DIR=$(python3 -c "import json,os; c=json.load(open('$SCRIPT_DIR/config.json')); print(os.path.expanduser(c['output']['base_dir']))")
mkdir -p "$OUTPUT_DIR"
success "输出目录已创建：$OUTPUT_DIR"

# 7. 选择 Whisper 模型
echo ""
echo "【7/10】选择 Whisper 转录模型..."
echo ""
echo "  请选择默认使用的 Whisper 模型："
echo ""
echo "  1) small      - 快速 (~1.5 分钟/12 分钟视频)，准确率一般"
echo "  2) medium     - 中等 (~7 分钟/12 分钟视频)，准确率高"
echo "  3) large-v3   - 最慢 (~9 分钟/12 分钟视频)，准确率最高 (推荐)"
echo ""
echo "  模型说明："
echo "  - small:   适合快速处理，对专有名词识别一般"
echo "  - medium:  平衡速度与准确率，但可能输出繁体字"
echo "  - large-v3: 准确率最佳，专有名词识别准确，简体中文输出"
echo ""

while true; do
    question "请输入选择 [1/2/3]，默认 large-v3 [3]："
    read -r MODEL_CHOICE
    MODEL_CHOICE=${MODEL_CHOICE:-3}

    case $MODEL_CHOICE in
        1)
            WHISPER_MODEL="small"
            info "选择：small"
            break
            ;;
        2)
            WHISPER_MODEL="medium"
            info "选择：medium"
            break
            ;;
        3)
            WHISPER_MODEL="large-v3"
            info "选择：large-v3"
            break
            ;;
        *)
            warn "无效选择，请输入 1/2/3"
            ;;
    esac
done

# 更新 config.json 中的模型配置
info "更新配置文件 config.json..."
python3 -c "
import json
with open('$SCRIPT_DIR/config.json', 'r') as f:
    config = json.load(f)
config['whisper']['model'] = '$WHISPER_MODEL'
with open('$SCRIPT_DIR/config.json', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
"
success "已配置默认模型：$WHISPER_MODEL"

# 询问是否预下载模型
echo ""
if [ "$WHISPER_MODEL" = "large-v3" ]; then
    question "是否现在预下载 large-v3 模型？(约 3GB，首次下载需要几分钟) [Y/n]"
else
    question "是否现在预下载 $WHISPER_MODEL 模型？(首次运行会自动下载) [Y/n]"
fi
read -r DOWNLOAD_MODEL
DOWNLOAD_MODEL=${DOWNLOAD_MODEL:-Y}

if [[ "$DOWNLOAD_MODEL" =~ ^[Yy]$ ]]; then
    echo ""
    info "开始下载 $WHISPER_MODEL 模型..."
    echo "  这可能需要几分钟时间，请耐心等待..."
    echo ""

    if $PYTHON_CMD -c "
from faster_whisper import WhisperModel
print('  正在下载 $WHISPER_MODEL 模型...')
try:
    model = WhisperModel('$WHISPER_MODEL', download_root='$HOME/.cache/huggingface/hub')
    print('  下载完成！')
except Exception as e:
    print(f'  下载中断：{e}')
    print('  首次使用时会自动下载')
    exit(1)
" 2>&1; then
        success "$WHISPER_MODEL 模型已预下载"
    else
        warn "模型下载未完成，首次运行 video-learn 时会自动下载"
    fi
else
    info "已跳过预下载，首次使用时会自动下载模型"
fi

# 8. 配置 MCP Server
echo ""
echo "【8/10】配置 MCP Server..."
CLAUDE_DIR="$HOME/.claude"
MCP_JSON="$CLAUDE_DIR/.mcp.json"

mkdir -p "$CLAUDE_DIR"

if [ -f "$MCP_JSON" ]; then
    if python3 -c "import json; c=json.load(open('$MCP_JSON')); exit(0 if 'video-learn' in c.get('mcpServers',{}) else 1)" 2>/dev/null; then
        success "MCP Server 已配置（跳过）"
    else
        python3 -c "
import json
with open('$MCP_JSON', 'r') as f:
    config = json.load(f)
if 'mcpServers' not in config:
    config['mcpServers'] = {}
config['mcpServers']['video-learn'] = {
    'command': 'node',
    'args': ['$SCRIPT_DIR/dist/index.js'],
    'env': {
        'PATH': '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'
    }
}
with open('$MCP_JSON', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
"
        success "MCP Server 配置已追加到 $MCP_JSON"
    fi
else
    cat > "$MCP_JSON" << MCPEOF
{
  "mcpServers": {
    "video-learn": {
      "command": "node",
      "args": ["$SCRIPT_DIR/dist/index.js"],
      "env": {
        "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
MCPEOF
    success "MCP Server 配置已创建：$MCP_JSON"
fi

# 8.1 如果用户在某个项目目录下运行安装，也给该目录加上 .mcp.json
PROJECT_MCP="$PWD/.mcp.json"
if [ "$PWD" != "$HOME" ] && [ "$PROJECT_MCP" != "$MCP_JSON" ]; then
    if [ -f "$PROJECT_MCP" ]; then
        if python3 -c "import json; c=json.load(open('$PROJECT_MCP')); exit(0 if 'video-learn' in c.get('mcpServers',{}) else 1)" 2>/dev/null; then
            success "当前项目 MCP 已配置（跳过）：$PROJECT_MCP"
        else
            python3 -c "
import json
with open('$PROJECT_MCP', 'r') as f:
    config = json.load(f)
if 'mcpServers' not in config:
    config['mcpServers'] = {}
config['mcpServers']['video-learn'] = {
    'command': 'node',
    'args': ['$SCRIPT_DIR/dist/index.js']
}
with open('$PROJECT_MCP', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
"
            success "当前项目 MCP 已追加：$PROJECT_MCP"
        fi
    else
        cat > "$PROJECT_MCP" << MCPEOF2
{
  "mcpServers": {
    "video-learn": {
      "command": "node",
      "args": ["$SCRIPT_DIR/dist/index.js"]
    }
  }
}
MCPEOF2
        success "当前项目 MCP 已创建：$PROJECT_MCP"
    fi
fi

# 9. 安装 Skill
echo ""
echo "【9/10】安装 Claude Code Skill..."
SKILLS_DIR="$CLAUDE_DIR/skills"
SKILL_SRC="$SCRIPT_DIR/skill/video-learn.md"
SKILL_DST_DIR="$SKILLS_DIR/video-learn"
SKILL_DST="$SKILL_DST_DIR/SKILL.md"

mkdir -p "$SKILL_DST_DIR"

if [ -f "$SKILL_SRC" ]; then
    cp "$SKILL_SRC" "$SKILL_DST"
    success "Skill 已安装到 $SKILL_DST"
else
    ERRORS+=("Skill 源文件不存在：$SKILL_SRC")
    warn "Skill 源文件不存在"
fi

# 10. 最终验证
echo ""
echo "【10/10】最终验证..."
echo ""

PASS=0
TOTAL=10

# 检查 Python 版本
PY_MAJOR=$($PYTHON_CMD -c "import sys; print(sys.version_info.major)" 2>/dev/null || echo "0")
PY_MINOR=$($PYTHON_CMD -c "import sys; print(sys.version_info.minor)" 2>/dev/null || echo "0")
if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 10 ]; then
    success "Python 版本 ✓ 3.$PY_MINOR (满足 3.10+)"
    PASS=$((PASS + 1))
else
    warn "Python 版本 ✗ 3.$PY_MINOR (需要 3.10+)"
fi

if verify_tool "ffmpeg" "ffmpeg -version"; then
    success "ffmpeg       ✓ 可用"
    PASS=$((PASS + 1))
else
    warn "ffmpeg       ✗ 不可用"
fi

if verify_tool "yt-dlp" "yt-dlp --version"; then
    success "yt-dlp       ✓ 可用"
    PASS=$((PASS + 1))
else
    warn "yt-dlp       ✗ 不可用"
fi

if $PYTHON_CMD -c "from faster_whisper import WhisperModel" &>/dev/null; then
    success "whisper      ✓ 可用"
    PASS=$((PASS + 1))
else
    warn "whisper      ✗ 不可用"
fi

if $PYTHON_CMD -c "from cryptography.hazmat.primitives.ciphers import Cipher" &>/dev/null; then
    success "cryptography ✓ 可用"
    PASS=$((PASS + 1))
else
    warn "cryptography ✗ 不可用（YouTube cookies 自动导出不可用）"
fi

if $PYTHON_CMD -c "import certifi" &>/dev/null; then
    success "certifi      ✓ 可用"
    PASS=$((PASS + 1))
else
    warn "certifi      ✗ 不可用（YouTube 下载可能遇到 SSL 错误）"
fi

if [ -f "$SCRIPT_DIR/dist/index.js" ]; then
    success "MCP Server   ✓ 已编译"
    PASS=$((PASS + 1))
else
    warn "MCP Server   ✗ 未编译"
fi

if [ -f "$SCRIPT_DIR/dist/scripts/transcribe.py" ]; then
    success "转录脚本     ✓ 已就位"
    PASS=$((PASS + 1))
else
    warn "转录脚本     ✗ 缺失"
fi

if [ -f "$MCP_JSON" ] && python3 -c "import json; c=json.load(open('$MCP_JSON')); exit(0 if 'video-learn' in c.get('mcpServers',{}) else 1)" 2>/dev/null; then
    success "MCP 配置     ✓ 已就位"
    PASS=$((PASS + 1))
else
    warn "MCP 配置     ✗ 未配置"
fi

if [ -f "$SKILL_DST" ]; then
    success "Skill        ✓ 已安装"
    PASS=$((PASS + 1))
else
    warn "Skill        ✗ 未安装"
fi

echo ""

# 汇总
if [ ${#ERRORS[@]} -eq 0 ] && [ $PASS -eq $TOTAL ]; then
    echo "=========================================="
    echo -e "${GREEN}  安装完成！所有 $TOTAL/$TOTAL 项验证通过${NC}"
    echo "=========================================="
else
    echo "=========================================="
    echo -e "${YELLOW}  安装完成，但有 $((TOTAL - PASS))/$TOTAL 项未通过验证${NC}"
    echo "=========================================="
    if [ ${#ERRORS[@]} -gt 0 ]; then
        echo ""
        echo "  问题列表："
        for err in "${ERRORS[@]}"; do
            echo -e "    ${RED}• $err${NC}"
        done
    fi
fi

echo ""
echo "=========================================="
echo "  配置摘要"
echo "=========================================="
echo ""
echo "  默认 Whisper 模型：${BLUE}$WHISPER_MODEL${NC}"
echo "  配置文件：$SCRIPT_DIR/config.json"
echo "  MCP 配置：$MCP_JSON"
echo "  Skill:    $SKILL_DST"
echo "  输出目录：$OUTPUT_DIR"
echo ""
echo "=========================================="
echo "  使用方法"
echo "=========================================="
echo ""
echo "  1. 重启 Claude Code（MCP Server 在启动时加载）"
echo "  2. 使用 /video-learn <url 或路径> 开始学习视频"
echo ""
echo "  修改模型：编辑 config.json，修改 whisper.model 字段"
echo "           small / medium / large-v3"
echo ""
echo "  注意："
echo "    - YouTube 下载需要 Chrome 浏览器登录 Google 账号"
echo "    - 首次下载 YouTube 视频时会请求密钥串权限（用于读取 YouTube cookies）"
echo "    - cookies 仅导出 YouTube/Google 域名，存放在临时目录，用完自动删除"
echo ""
