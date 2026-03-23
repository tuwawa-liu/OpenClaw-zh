---
read_when:
  - 为回复启用文本转语音
  - 配置 TTS 提供商或限制
  - 使用 /tts 命令
summary: 出站回复的文本转语音（TTS）
title: 文本转语音
x-i18n:
  generated_at: "2026-02-03T10:13:55Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: 070ff0cc8592f64c6c9e4ddaddc7e8fba82f0692ceded6fe833ec9ba5b61e6fb
  source_path: tts.md
  workflow: 15
---

# 文本转语音（TTS）

OpenClaw can convert outbound replies into audio using ElevenLabs, Microsoft, or OpenAI.
It works anywhere OpenClaw can send audio; Telegram gets a round voice-note bubble.

## 支持的服务

- **ElevenLabs** (primary or fallback provider)
- **Microsoft** (primary or fallback provider; current bundled implementation uses `node-edge-tts`, default when no API keys)
- **OpenAI** (primary or fallback provider; also used for summaries)

### Microsoft speech notes

The bundled Microsoft speech provider currently uses Microsoft Edge's online
neural TTS service via the `node-edge-tts` library. It's a hosted service (not
local), uses Microsoft endpoints, and does not require an API key.
`node-edge-tts` exposes speech configuration options and output formats, but
not all options are supported by the service. Legacy config and directive input
using `edge` still works and is normalized to `microsoft`.

Because this path is a public web service without a published SLA or quota,
treat it as best-effort. If you need guaranteed limits and support, use OpenAI
or ElevenLabs.

## 可选密钥

如果你想使用 OpenAI 或 ElevenLabs：

- `ELEVENLABS_API_KEY`（或 `XI_API_KEY`）
- `OPENAI_API_KEY`

Microsoft speech does **not** require an API key. If no API keys are found,
OpenClaw defaults to Microsoft (unless disabled via
`messages.tts.microsoft.enabled=false` or `messages.tts.edge.enabled=false`).

如果配置了多个提供商，首先使用选定的提供商，其他作为备用选项。自动摘要使用配置的 `summaryModel`（或 `agents.defaults.model.primary`），所以如果你启用摘要，该提供商也必须经过认证。

## 服务链接

- [OpenAI 文本转语音指南](https://platform.openai.com/docs/guides/text-to-speech)
- [OpenAI 音频 API 参考](https://platform.openai.com/docs/api-reference/audio)
- [ElevenLabs 文本转语音](https://elevenlabs.io/docs/api-reference/text-to-speech)
- [ElevenLabs 认证](https://elevenlabs.io/docs/api-reference/authentication)
- [node-edge-tts](https://github.com/SchneeHertz/node-edge-tts)
- [Microsoft 语音输出格式](https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech#audio-outputs)

## 默认启用吗？

不是。自动 TTS 默认**关闭**。在配置中使用 `messages.tts.auto` 或在每个会话中使用 `/tts always`（别名：`/tts on`）启用它。

Microsoft speech **is** enabled by default once TTS is on, and is used automatically
when no OpenAI or ElevenLabs API keys are available.

## 配置

TTS 配置位于 `openclaw.json` 中的 `messages.tts` 下。完整 schema 在 [Gateway 网关配置](/gateway/configuration)中。

### 最小配置（启用 + 提供商）

```json5
{
  messages: {
    tts: {
      auto: "always",
      provider: "elevenlabs",
    },
  },
}
```

### OpenAI 主要，ElevenLabs 备用

```json5
{
  messages: {
    tts: {
      auto: "always",
      provider: "openai",
      summaryModel: "openai/gpt-4.1-mini",
      modelOverrides: {
        enabled: true,
      },
      openai: {
        apiKey: "openai_api_key",
        model: "gpt-4o-mini-tts",
        voice: "alloy",
      },
      elevenlabs: {
        apiKey: "elevenlabs_api_key",
        baseUrl: "https://api.elevenlabs.io",
        voiceId: "voice_id",
        modelId: "eleven_multilingual_v2",
        seed: 42,
        applyTextNormalization: "auto",
        languageCode: "en",
        voiceSettings: {
          stability: 0.5,
          similarityBoost: 0.75,
          style: 0.0,
          useSpeakerBoost: true,
          speed: 1.0,
        },
      },
    },
  },
}
```

### Microsoft primary (no API key)

```json5
{
  messages: {
    tts: {
      auto: "always",
      provider: "microsoft",
      microsoft: {
        enabled: true,
        voice: "en-US-MichelleNeural",
        lang: "en-US",
        outputFormat: "audio-24khz-48kbitrate-mono-mp3",
        rate: "+10%",
        pitch: "-5%",
      },
    },
  },
}
```

### Disable Microsoft speech

```json5
{
  messages: {
    tts: {
      microsoft: {
        enabled: false,
      },
    },
  },
}
```

### 自定义限制 + 偏好路径

```json5
{
  messages: {
    tts: {
      auto: "always",
      maxTextLength: 4000,
      timeoutMs: 30000,
      prefsPath: "~/.openclaw/settings/tts.json",
    },
  },
}
```

### 仅在收到语音消息后用音频回复

```json5
{
  messages: {
    tts: {
      auto: "inbound",
    },
  },
}
```

### 禁用长回复的自动摘要

```json5
{
  messages: {
    tts: {
      auto: "always",
    },
  },
}
```

然后运行：

```
/tts summary off
```

### 字段说明

- `auto`: auto‑TTS mode (`off`, `always`, `inbound`, `tagged`).
  - `inbound` only sends audio after an inbound voice note.
  - `tagged` only sends audio when the reply includes `[[tts]]` tags.
- `enabled`: legacy toggle (doctor migrates this to `auto`).
- `mode`: `"final"` (default) or `"all"` (includes tool/block replies).
- `provider`: speech provider id such as `"elevenlabs"`, `"microsoft"`, or `"openai"` (fallback is automatic).
- If `provider` is **unset**, OpenClaw prefers `openai` (if key), then `elevenlabs` (if key),
  otherwise `microsoft`.
- Legacy `provider: "edge"` still works and is normalized to `microsoft`.
- `summaryModel`: optional cheap model for auto-summary; defaults to `agents.defaults.model.primary`.
  - Accepts `provider/model` or a configured model alias.
- `modelOverrides`: allow the model to emit TTS directives (on by default).
  - `allowProvider` defaults to `false` (provider switching is opt-in).
- `maxTextLength`: hard cap for TTS input (chars). `/tts audio` fails if exceeded.
- `timeoutMs`: request timeout (ms).
- `prefsPath`: override the local prefs JSON path (provider/limit/summary).
- `apiKey` values fall back to env vars (`ELEVENLABS_API_KEY`/`XI_API_KEY`, `OPENAI_API_KEY`).
- `elevenlabs.baseUrl`: override ElevenLabs API base URL.
- `openai.baseUrl`: override the OpenAI TTS endpoint.
  - Resolution order: `messages.tts.openai.baseUrl` -> `OPENAI_TTS_BASE_URL` -> `https://api.openai.com/v1`
  - Non-default values are treated as OpenAI-compatible TTS endpoints, so custom model and voice names are accepted.
- `elevenlabs.voiceSettings`:
  - `stability`, `similarityBoost`, `style`: `0..1`
  - `useSpeakerBoost`: `true|false`
  - `speed`: `0.5..2.0` (1.0 = normal)
- `elevenlabs.applyTextNormalization`: `auto|on|off`
- `elevenlabs.languageCode`: 2-letter ISO 639-1 (e.g. `en`, `de`)
- `elevenlabs.seed`: integer `0..4294967295` (best-effort determinism)
- `microsoft.enabled`: allow Microsoft speech usage (default `true`; no API key).
- `microsoft.voice`: Microsoft neural voice name (e.g. `en-US-MichelleNeural`).
- `microsoft.lang`: language code (e.g. `en-US`).
- `microsoft.outputFormat`: Microsoft output format (e.g. `audio-24khz-48kbitrate-mono-mp3`).
  - See Microsoft Speech output formats for valid values; not all formats are supported by the bundled Edge-backed transport.
- `microsoft.rate` / `microsoft.pitch` / `microsoft.volume`: percent strings (e.g. `+10%`, `-5%`).
- `microsoft.saveSubtitles`: write JSON subtitles alongside the audio file.
- `microsoft.proxy`: proxy URL for Microsoft speech requests.
- `microsoft.timeoutMs`: request timeout override (ms).
- `edge.*`: legacy alias for the same Microsoft settings.

## 模型驱动覆盖（默认开启）

默认情况下，模型**可以**为单个回复发出 TTS 指令。当 `messages.tts.auto` 为 `tagged` 时，需要这些指令来触发音频。

启用后，模型可以发出 `[[tts:...]]` 指令来覆盖单个回复的语音，加上可选的 `[[tts:text]]...[[/tts:text]]` 块来提供表达性标签（笑声、唱歌提示等），这些仅应出现在音频中。

示例回复负载：

```
Here you go.

[[tts:provider=elevenlabs voiceId=pMsXgVXv3BLzUgSXRplE model=eleven_v3 speed=1.1]]
[[tts:text]](laughs) Read the song once more.[[/tts:text]]
```

可用指令键（启用时）：

- `provider` (registered speech provider id, for example `openai`, `elevenlabs`, or `microsoft`; requires `allowProvider: true`)
- `voice` (OpenAI voice) or `voiceId` (ElevenLabs)
- `model` (OpenAI TTS model or ElevenLabs model id)
- `stability`, `similarityBoost`, `style`, `speed`, `useSpeakerBoost`
- `applyTextNormalization` (`auto|on|off`)
- `languageCode` (ISO 639-1)
- `seed`

禁用所有模型覆盖：

```json5
{
  messages: {
    tts: {
      modelOverrides: {
        enabled: false,
      },
    },
  },
}
```

可选白名单（禁用特定覆盖同时保持标签启用）：

```json5
{
  messages: {
    tts: {
      modelOverrides: {
        enabled: true,
        allowProvider: false,
        allowSeed: false,
      },
    },
  },
}
```

## 单用户偏好

斜杠命令将本地覆盖写入 `prefsPath`（默认：`~/.openclaw/settings/tts.json`，可通过 `OPENCLAW_TTS_PREFS` 或 `messages.tts.prefsPath` 覆盖）。

存储的字段：

- `enabled`
- `provider`
- `maxLength`（摘要阈值；默认 1500 字符）
- `summarize`（默认 `true`）

这些为该主机覆盖 `messages.tts.*`。

## 输出格式（固定）

- **Telegram**: Opus voice note (`opus_48000_64` from ElevenLabs, `opus` from OpenAI).
  - 48kHz / 64kbps is a good voice-note tradeoff and required for the round bubble.
- **Other channels**: MP3 (`mp3_44100_128` from ElevenLabs, `mp3` from OpenAI).
  - 44.1kHz / 128kbps is the default balance for speech clarity.
- **Microsoft**: uses `microsoft.outputFormat` (default `audio-24khz-48kbitrate-mono-mp3`).
  - The bundled transport accepts an `outputFormat`, but not all formats are available from the service.
  - Output format values follow Microsoft Speech output formats (including Ogg/WebM Opus).
  - Telegram `sendVoice` accepts OGG/MP3/M4A; use OpenAI/ElevenLabs if you need
    guaranteed Opus voice notes. citeturn1search1
  - If the configured Microsoft output format fails, OpenClaw retries with MP3.

OpenAI/ElevenLabs 格式是固定的；Telegram 期望 Opus 以获得语音消息用户体验。

## 自动 TTS 行为

启用后，OpenClaw：

- 如果回复已包含媒体或 `MEDIA:` 指令，则跳过 TTS。
- 跳过非常短的回复（< 10 字符）。
- 启用时使用 `agents.defaults.model.primary`（或 `summaryModel`）对长回复进行摘要。
- 将生成的音频附加到回复中。

如果回复超过 `maxLength` 且摘要关闭（或没有摘要模型的 API 密钥），则跳过音频并发送正常的文本回复。

## 流程图

```
回复 -> TTS 启用？
  否  -> 发送文本
  是  -> 有媒体 / MEDIA: / 太短？
          是 -> 发送文本
          否 -> 长度 > 限制？
                   否  -> TTS -> 附加音频
                   是  -> 摘要启用？
                            否  -> 发送文本
                            是  -> 摘要（summaryModel 或 agents.defaults.model.primary）
                                      -> TTS -> 附加音频
```

## 斜杠命令用法

只有一个命令：`/tts`。参见[斜杠命令](/tools/slash-commands)了解启用详情。

Discord 注意：`/tts` 是 Discord 的内置命令，所以 OpenClaw 在那里注册 `/voice` 作为原生命令。文本 `/tts ...` 仍然有效。

```
/tts off
/tts always
/tts inbound
/tts tagged
/tts status
/tts provider openai
/tts limit 2000
/tts summary off
/tts audio Hello from OpenClaw
```

注意事项：

- 命令需要授权发送者（白名单/所有者规则仍然适用）。
- 必须启用 `commands.text` 或原生命令注册。
- `off|always|inbound|tagged` 是单会话开关（`/tts on` 是 `/tts always` 的别名）。
- `limit` 和 `summary` 存储在本地偏好中，不在主配置中。
- `/tts audio` 生成一次性音频回复（不会开启 TTS）。

## 智能体工具

`tts` 工具将文本转换为语音并返回 `MEDIA:` 路径。当结果与 Telegram 兼容时，工具包含 `[[audio_as_voice]]`，以便 Telegram 发送语音气泡。

## Gateway 网关 RPC

Gateway 网关方法：

- `tts.status`
- `tts.enable`
- `tts.disable`
- `tts.convert`
- `tts.setProvider`
- `tts.providers`
