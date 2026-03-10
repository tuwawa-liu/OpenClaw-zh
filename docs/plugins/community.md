---
summary: "社区插件：质量标准、托管要求和 PR 提交路径"
read_when:
  - 想要发布第三方 OpenClaw 插件
  - 想要提议将插件列入文档
title: "社区插件"
---

# 社区插件

本页跟踪高质量的 **社区维护插件**。

当社区插件满足质量标准时，我们接受将其添加到此页面的 PR。

## 列入要求

- 插件包已发布到 npmjs（可通过 `openclaw plugins install <npm-spec>` 安装）。
- 源代码托管在 GitHub（公开仓库）。
- 仓库包含设置/使用文档和问题跟踪器。
- 插件有明确的维护信号（活跃的维护者、近期更新或响应迅速的问题处理）。

## 如何提交

打开一个 PR，将您的插件添加到此页面，包含：

- 插件名称
- npm 包名
- GitHub 仓库 URL
- 一行描述
- 安装命令

## 审查标准

我们偏好实用、有文档且操作安全的插件。
低投入的包装器、不明确的所有权或无人维护的包可能被拒绝。

## 候选格式

添加条目时使用此格式：

- **插件名称** — 简短描述
  npm: `@scope/package`
  repo: `https://github.com/org/repo`
  install: `openclaw plugins install @scope/package`

## 已列入插件

- **WeChat** — 通过 WeChatPadPro（iPad 协议）将 OpenClaw 连接到微信个人账号。支持文本、图片和文件交换，支持关键词触发对话。
  npm: `@icesword760/openclaw-wechat`
  repo: `https://github.com/icesword0760/openclaw-wechat`
  install: `openclaw plugins install @icesword760/openclaw-wechat`
