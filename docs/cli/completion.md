---
summary: "`openclaw completion` 的 CLI 参考（生成/安装 Shell 补全脚本）"
read_when:
  - 想要 zsh/bash/fish/PowerShell 的 Shell 补全
  - 需要将补全脚本缓存到 OpenClaw 状态目录
title: "completion"
---

# `openclaw completion`

生成 Shell 补全脚本并可选择性地安装到你的 Shell 配置文件中。

## 用法

```bash
openclaw completion
openclaw completion --shell zsh
openclaw completion --install
openclaw completion --shell fish --install
openclaw completion --write-state
openclaw completion --shell bash --write-state
```

## 选项

- `-s, --shell <shell>`：Shell 目标（`zsh`、`bash`、`powershell`、`fish`；默认：`zsh`）
- `-i, --install`：通过在 Shell 配置文件中添加 source 行来安装补全
- `--write-state`：将补全脚本写入 `$OPENCLAW_STATE_DIR/completions`，不输出到 stdout
- `-y, --yes`：跳过安装确认提示

## 说明

- `--install` 会在你的 Shell 配置文件中写入一个小的 "OpenClaw Completion" 块，并指向缓存的脚本。
- 不使用 `--install` 或 `--write-state` 时，命令将脚本输出到 stdout。
- 补全生成会预先加载命令树，以包含嵌套的子命令。
