---
summary: "OpenClaw 入门选项和流程概览"
read_when:
  - 选择入门路径
  - 设置新环境
title: "入门概览"
sidebarTitle: "入门概览"
---

# 入门概览

OpenClaw 支持多种入门路径，取决于 Gateway 运行的位置以及你偏好的提供商配置方式。

## 选择入门路径

- **CLI onboarding** for macOS, Linux, and Windows (via WSL2).
- **macOS app** for a guided first run on Apple silicon or Intel Macs.

## CLI onboarding

Run onboarding in a terminal:

```bash
openclaw onboard
```

Use CLI onboarding when you want full control of the Gateway, workspace,
channels, and skills. Docs:

- [Onboarding (CLI)](/start/wizard)
- [`openclaw onboard` command](/cli/onboard)

## macOS 应用入门

当你需要在 macOS 上进行全引导式配置时，请使用 OpenClaw 应用。文档：

- [入门引导（macOS 应用）](/start/onboarding)

## 自定义提供商

If you need an endpoint that is not listed, including hosted providers that
expose standard OpenAI or Anthropic APIs, choose **Custom Provider** in the
CLI onboarding. You will be asked to:

- 选择 OpenAI 兼容、Anthropic 兼容，或 **Unknown（未知）**（自动检测）。
- 输入基础 URL 和 API 密钥（如果提供商要求）。
- 提供模型 ID 和可选别名。
- 选择端点 ID，以便多个自定义端点可以共存。

详细步骤请参阅上方的 CLI 入门文档。
