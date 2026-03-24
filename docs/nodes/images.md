---
read_when:
  - 修改媒体管道或附件
summary: 发送、Gateway 网关和智能体回复的图像和媒体处理规则
title: 图像和媒体支持
x-i18n:
  generated_at: "2026-02-03T07:50:42Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: 971aed398ea01078efbad7a8a4bca17f2a975222a2c4db557565e4334c9450e0
  source_path: nodes/images.md
  workflow: 15
---

# Image & Media Support (2025-12-05)

WhatsApp 渠道通过 **Baileys Web** 运行。本文档记录了发送、Gateway 网关和智能体回复的当前媒体处理规则。

## 目标

- 通过 `openclaw message send --media` 发送带可选标题的媒体。
- 允许来自网页收件箱的自动回复在文本旁边包含媒体。
- 保持每种类型的限制合理且可预测。

## CLI 接口

- `openclaw message send --media <path-or-url> [--message <caption>]`
  - `--media` 可选；标题可以为空以进行纯媒体发送。
  - `--dry-run` 打印解析后的负载；`--json` 输出 `{ channel, to, messageId, mediaUrl, caption }`。

## WhatsApp Web 渠道行为

- Input: local file path **or** HTTP(S) URL.
- Flow: load into a Buffer, detect media kind, and build the correct payload:
  - **Images:** resize & recompress to JPEG (max side 2048px) targeting `channels.whatsapp.mediaMaxMb` (default: 50 MB).
  - **Audio/Voice/Video:** pass-through up to 16 MB; audio is sent as a voice note (`ptt: true`).
  - **Documents:** anything else, up to 100 MB, with filename preserved when available.
- WhatsApp GIF-style playback: send an MP4 with `gifPlayback: true` (CLI: `--gif-playback`) so mobile clients loop inline.
- MIME detection prefers magic bytes, then headers, then file extension.
- Caption comes from `--message` or `reply.text`; empty caption is allowed.
- Logging: non-verbose shows `↩️`/`✅`; verbose includes size and source path/URL.

## 自动回复管道

- `getReplyFromConfig` 返回 `{ text?, mediaUrl?, mediaUrls? }`。
- 当存在媒体时，网页发送器使用与 `openclaw message send` 相同的管道解析本地路径或 URL。
- 如果提供多个媒体条目，则按顺序发送。

## 入站媒体到命令（Pi）

- 当入站网页消息包含媒体时，OpenClaw 下载到临时文件并暴露模板变量：
  - `{{MediaUrl}}` 入站媒体的伪 URL。
  - `{{MediaPath}}` 运行命令前写入的本地临时路径。
- 当启用每会话 Docker 沙箱时，入站媒体被复制到沙箱工作区，`MediaPath`/`MediaUrl` 被重写为相对路径如 `media/inbound/<filename>`。
- 媒体理解（如果通过 `tools.media.*` 或共享的 `tools.media.models` 配置）在模板化之前运行，可以将 `[Image]`、`[Audio]` 和 `[Video]` 块插入 `Body`。
  - 音频设置 `{{Transcript}}` 并使用转录进行命令解析，因此斜杠命令仍然有效。
  - 视频和图像描述保留任何标题文本用于命令解析。
- 默认情况下只处理第一个匹配的图像/音频/视频附件；设置 `tools.media.<cap>.attachments` 以处理多个附件。

## 限制与错误

**出站发送上限（WhatsApp 网页发送）**

- Images: up to `channels.whatsapp.mediaMaxMb` (default: 50 MB) after recompression.
- Audio/voice/video: 16 MB cap; documents: 100 MB cap.
- Oversize or unreadable media → clear error in logs and the reply is skipped.

**媒体理解上限（转录/描述）**

- 图像默认：10 MB（`tools.media.image.maxBytes`）。
- 音频默认：20 MB（`tools.media.audio.maxBytes`）。
- 视频默认：50 MB（`tools.media.video.maxBytes`）。
- 超大媒体跳过理解，但回复仍然使用原始正文通过。

## 测试说明

- 覆盖图像/音频/文档情况的发送 + 回复流程。
- 验证图像的重新压缩（大小限制）和音频的语音消息标志。
- 确保多媒体回复作为顺序发送扇出。
