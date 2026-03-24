---
read_when:
  - 你想了解 OpenClaw 支持的完整功能列表
summary: OpenClaw 在渠道、路由、媒体和用户体验方面的功能。
title: 功能
x-i18n:
  generated_at: "2026-02-04T17:53:22Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: 1b6aee0bfda751824cb6b3a99080b4c80c00ffb355a96f9cff1b596d55d15ed4
  source_path: concepts/features.md
  workflow: 15
---

# Features

## Highlights

<Columns>
  <Card title="渠道" icon="message-square">
    通过单个 Gateway 网关支持 WhatsApp、Telegram、Discord 和 iMessage。
  </Card>
  <Card title="插件" icon="plug">
    通过扩展添加 Mattermost 等更多平台。
  </Card>
  <Card title="路由" icon="route">
    多智能体路由，支持隔离会话。
  </Card>
  <Card title="媒体" icon="image">
    支持图片、音频和文档的收发。
  </Card>
  <Card title="应用与界面" icon="monitor">
    Web 控制界面和 macOS 配套应用。
  </Card>
  <Card title="移动节点" icon="smartphone">
    iOS 和 Android 节点，支持 Canvas。
  </Card>
</Columns>

## 完整列表

**Channels:**

- WhatsApp, Telegram, Discord, iMessage (built-in)
- Mattermost, Matrix, Microsoft Teams, Nostr, and more (plugins)
- Group chat support with mention-based activation
- DM safety with allowlists and pairing

**Agent:**

- Embedded agent runtime with tool streaming
- Multi-agent routing with isolated sessions per workspace or sender
- Sessions: direct chats collapse into shared `main`; groups are isolated
- Streaming and chunking for long responses

**Auth and providers:**

- 35+ model providers (Anthropic, OpenAI, Google, and more)
- Subscription auth via OAuth (e.g. OpenAI Codex)
- Custom and self-hosted provider support (vLLM, SGLang, Ollama, and any OpenAI-compatible or Anthropic-compatible endpoint)

**Media:**

- Images, audio, video, and documents in and out
- Voice note transcription
- Text-to-speech with multiple providers

**Apps and interfaces:**

- WebChat and browser Control UI
- macOS menu bar companion app
- iOS node with pairing, Canvas, camera, screen recording, location, and voice
- Android node with pairing, chat, voice, Canvas, camera, and device commands

**Tools and automation:**

- Browser automation, exec, sandboxing
- Web search (Brave, Perplexity, Gemini, Grok, Kimi, Firecrawl)
- Cron jobs and heartbeat scheduling
- Skills, plugins, and workflow pipelines (Lobster)
