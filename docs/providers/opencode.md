---
summary: "在 OpenClaw 中使用 OpenCode Zen 和 Go 目录"
read_when:
  - 你想通过 OpenCode 托管访问模型
  - 你想在 Zen 和 Go 目录之间选择
title: "OpenCode"
---

# OpenCode

OpenCode 在 OpenClaw 中提供两个托管目录：

- `opencode/...` 用于 **Zen** 目录
- `opencode-go/...` 用于 **Go** 目录

两个目录使用相同的 OpenCode API 密钥。OpenClaw 保持运行时提供商 ID 分离以确保上游按模型路由正确，但引导和文档将它们视为一个 OpenCode 设置。

## CLI 设置

### Zen 目录

```bash
openclaw onboard --auth-choice opencode-zen
openclaw onboard --opencode-zen-api-key "$OPENCODE_API_KEY"
```

### Go 目录

```bash
openclaw onboard --auth-choice opencode-go
openclaw onboard --opencode-go-api-key "$OPENCODE_API_KEY"
```

## 配置片段

```json5
{
  env: { OPENCODE_API_KEY: "sk-..." },
  agents: { defaults: { model: { primary: "opencode/claude-opus-4-5" } } },
}
```

## 目录

### Zen

- 运行时提供商：`opencode`
- 示例模型：`opencode/claude-opus-4-6`、`opencode/gpt-5.2`、`opencode/gemini-3-pro`
- 当你需要精选的 OpenCode 多模型代理时选择

### Go

- 运行时提供商：`opencode-go`
- 示例模型：`opencode-go/kimi-k2.5`、`opencode-go/glm-5`、`opencode-go/minimax-m2.5`
- 当你需要 OpenCode 托管的 Kimi/GLM/MiniMax 系列时选择

## 注意事项

- 也支持 `OPENCODE_ZEN_API_KEY`。
- 在引导过程中输入一个 OpenCode 密钥会同时为两个运行时提供商存储凭据。
- 你需要登录 OpenCode，添加账单信息，然后复制你的 API 密钥。
- 账单和目录可用性在 OpenCode 控制面板中管理。
