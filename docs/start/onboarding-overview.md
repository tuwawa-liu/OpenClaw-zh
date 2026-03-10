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

- **CLI 向导**：适用于 macOS、Linux 和 Windows（通过 WSL2）。
- **macOS 应用**：适用于在 Apple 芯片或 Intel Mac 上引导式首次运行。

## CLI 入门向导

在终端中运行向导：

```bash
openclaw onboard
```

当你需要完全控制 Gateway、工作区、频道和技能时，请使用 CLI 向导。文档：

- [入门向导（CLI）](/start/wizard)
- [`openclaw onboard` 命令](/cli/onboard)

## macOS 应用入门

当你需要在 macOS 上进行全引导式配置时，请使用 OpenClaw 应用。文档：

- [入门引导（macOS 应用）](/start/onboarding)

## 自定义提供商

如果你需要的端点未在列表中，包括提供标准 OpenAI 或 Anthropic API 的托管服务商，请在 CLI 向导中选择 **Custom Provider（自定义提供商）**。系统会要求你：

- 选择 OpenAI 兼容、Anthropic 兼容，或 **Unknown（未知）**（自动检测）。
- 输入基础 URL 和 API 密钥（如果提供商要求）。
- 提供模型 ID 和可选别名。
- 选择端点 ID，以便多个自定义端点可以共存。

详细步骤请参阅上方的 CLI 入门文档。
