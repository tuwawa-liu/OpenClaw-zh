#!/bin/bash
set -e

echo "=========================================="
echo "  OpenClaw 完整卸载脚本"
echo "=========================================="
echo ""

# 1. 停止并卸载 launchd 守护进程
echo ">>> [1/5] 停止并移除 launchd 守护进程..."
PLIST="$HOME/Library/LaunchAgents/ai.openclaw.gateway.plist"
if launchctl list 2>/dev/null | grep -q "ai.openclaw.gateway"; then
    launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
    echo "    ✓ 守护进程已停止"
else
    echo "    - 守护进程未在运行，跳过"
fi

if [ -f "$PLIST" ]; then
    rm -f "$PLIST"
    echo "    ✓ 已删除 $PLIST"
else
    echo "    - plist 文件不存在，跳过"
fi

# 2. 杀死残留的 openclaw 进程
echo ""
echo ">>> [2/5] 终止残留的 openclaw 进程..."
PIDS=$(pgrep -f "openclaw" 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill 2>/dev/null || true
    echo "    ✓ 已终止进程: $PIDS"
else
    echo "    - 无残留进程"
fi

# 3. 卸载旧的全局 npm 包（检查所有 Node 版本）
echo ""
echo ">>> [3/5] 卸载全局 npm/pnpm 包..."

# 加载 nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# 检查所有已安装的 Node 版本下的全局包
for NODE_DIR in "$HOME/.nvm/versions/node"/*/; do
    if [ -d "$NODE_DIR" ]; then
        NODE_VER=$(basename "$NODE_DIR")
        NPM_BIN="$NODE_DIR/bin/npm"
        GLOBAL_DIR="$NODE_DIR/lib/node_modules"

        # 检查是否有 openclaw 相关全局包
        for PKG in $(ls "$GLOBAL_DIR" 2>/dev/null | grep -i "claw\|openclaw" || true); do
            echo "    发现全局包: $PKG (Node $NODE_VER)"
            "$NPM_BIN" uninstall -g "$PKG" 2>/dev/null && \
                echo "    ✓ 已卸载 $PKG (Node $NODE_VER)" || \
                echo "    ⚠ 卸载失败，尝试直接删除..."
            # 兜底：直接删除目录
            if [ -d "$GLOBAL_DIR/$PKG" ]; then
                rm -rf "$GLOBAL_DIR/$PKG"
                # 同时清理 bin 链接
                find "$NODE_DIR/bin" -lname "*$PKG*" -delete 2>/dev/null || true
                echo "    ✓ 已直接删除 $GLOBAL_DIR/$PKG"
            fi
        done

        # 检查 @qingchencloud scope 下的包
        if [ -d "$GLOBAL_DIR/@qingchencloud" ]; then
            for PKG in $(ls "$GLOBAL_DIR/@qingchencloud" 2>/dev/null); do
                echo "    发现全局包: @qingchencloud/$PKG (Node $NODE_VER)"
                "$NPM_BIN" uninstall -g "@qingchencloud/$PKG" 2>/dev/null || true
                rm -rf "$GLOBAL_DIR/@qingchencloud/$PKG" 2>/dev/null || true
                echo "    ✓ 已卸载 @qingchencloud/$PKG"
            done
            # 如果 scope 目录为空则删除
            rmdir "$GLOBAL_DIR/@qingchencloud" 2>/dev/null || true
        fi
    fi
done

# 检查 pnpm 全局包
if command -v pnpm &>/dev/null; then
    PNPM_CLAW=$(pnpm list -g 2>/dev/null | grep -i "claw" || true)
    if [ -n "$PNPM_CLAW" ]; then
        echo "    发现 pnpm 全局包: $PNPM_CLAW"
        pnpm remove -g $(echo "$PNPM_CLAW" | awk '{print $1}') 2>/dev/null || true
        echo "    ✓ 已从 pnpm 全局卸载"
    fi
fi

echo "    ✓ 全局包清理完成"

# 4. 删除配置和数据目录
echo ""
echo ">>> [4/5] 删除 ~/.openclaw 配置和数据目录..."
if [ -d "$HOME/.openclaw" ]; then
    # 先备份配置文件
    if [ -f "$HOME/.openclaw/openclaw.json" ]; then
        cp "$HOME/.openclaw/openclaw.json" "$HOME/openclaw.json.backup.$(date +%s)"
        echo "    ✓ 已备份配置到 ~/openclaw.json.backup.*"
    fi
    rm -rf "$HOME/.openclaw"
    echo "    ✓ 已删除 ~/.openclaw"
else
    echo "    - ~/.openclaw 不存在，跳过"
fi

# 5. 清除其他残留
echo ""
echo ">>> [5/5] 清除其他残留..."

# npx 缓存中的 openclaw
NPX_CACHE="$HOME/.npm/_npx"
if [ -d "$NPX_CACHE" ]; then
    for D in "$NPX_CACHE"/*/; do
        if [ -d "$D" ] && ls "$D/node_modules" 2>/dev/null | grep -qi "claw"; then
            rm -rf "$D"
            echo "    ✓ 已清除 npx 缓存: $D"
        fi
    done
fi

# pnpm store 中的缓存（可选，不删除整个 store）
echo "    - pnpm store 保留（仅影响磁盘空间，不影响冲突）"

echo ""
echo "=========================================="
echo "  ✅ 卸载完成！"
echo ""
echo "  已清理："
echo "    • launchd 守护进程 (ai.openclaw.gateway)"
echo "    • 全局 npm 包 (@qingchencloud/openclaw-zh 等)"
echo "    • 配置目录 (~/.openclaw)"
echo "    • 残留进程"
echo ""
echo "  配置文件已备份到: ~/openclaw.json.backup.*"
echo ""
echo "  重新安装中文版："
echo "    cd $(pwd)"
echo "    pnpm openclaw onboard --install-daemon"
echo "=========================================="
