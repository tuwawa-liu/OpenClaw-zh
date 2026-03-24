---
read_when:
  - 添加或更改 webhook 端点
  - 将外部系统接入 OpenClaw
summary: 用于唤醒和隔离智能体运行的 Webhook 入口
title: Webhooks
x-i18n:
  generated_at: "2026-02-03T07:43:23Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: f26b88864567be82366b1f66a4772ef2813c7846110c62fce6caf7313568265e
  source_path: automation/webhook.md
  workflow: 15
---

# Webhooks

Gateway 网关可以暴露一个小型 HTTP webhook 端点用于外部触发。

## 启用

```json5
{
  hooks: {
    enabled: true,
    token: "shared-secret",
    path: "/hooks",
  },
}
```

注意事项：

- 当 `hooks.enabled=true` 时，`hooks.token` 为必填项。
- `hooks.path` 默认为 `/hooks`。

## 认证

每个请求必须包含 hook 令牌。推荐使用请求头：

- `Authorization: Bearer <token>`（推荐）
- `x-openclaw-token: <token>`
- Query-string tokens are rejected (`?token=...` returns `400`).
- Treat `hooks.token` holders as full-trust callers for the hook ingress surface on that gateway. Hook payload content is still untrusted, but this is not a separate non-owner auth boundary.

## 端点

### `POST /hooks/wake`

请求体：

```json
{ "text": "System line", "mode": "now" }
```

- `text` **必填**（字符串）：事件描述（例如"收到新邮件"）。
- `mode` 可选（`now` | `next-heartbeat`）：是否立即触发心跳（默认 `now`）或等待下一次定期检查。

效果：

- 为**主**会话加入一个系统事件队列
- 如果 `mode=now`，则立即触发心跳

### `POST /hooks/agent`

请求体：

```json
{
  "message": "Run this",
  "name": "Email",
  "sessionKey": "hook:email:msg-123",
  "wakeMode": "now",
  "deliver": true,
  "channel": "last",
  "to": "+15551234567",
  "model": "openai/gpt-5.2-mini",
  "thinking": "low",
  "timeoutSeconds": 120
}
```

- `message` **required** (string): The prompt or message for the agent to process.
- `name` optional (string): Human-readable name for the hook (e.g., "GitHub"), used as a prefix in session summaries.
- `agentId` optional (string): Route this hook to a specific agent. Unknown IDs fall back to the default agent. When set, the hook runs using the resolved agent's workspace and configuration.
- `sessionKey` optional (string): The key used to identify the agent's session. By default this field is rejected unless `hooks.allowRequestSessionKey=true`.
- `wakeMode` optional (`now` | `next-heartbeat`): Whether to trigger an immediate heartbeat (default `now`) or wait for the next periodic check.
- `deliver` optional (boolean): If `true`, the agent's response will be sent to the messaging channel. Defaults to `true`. Responses that are only heartbeat acknowledgments are automatically skipped.
- `channel` optional (string): The messaging channel for delivery. Core channels: `last`, `whatsapp`, `telegram`, `discord`, `slack`, `signal`, `imessage`, `irc`, `googlechat`, `line`. Extension channels (plugins): `msteams`, `mattermost`, and others. Defaults to `last`.
- `to` optional (string): The recipient identifier for the channel (e.g., phone number for WhatsApp/Signal, chat ID for Telegram, channel ID for Discord/Slack/Mattermost (plugin), conversation ID for Microsoft Teams). Defaults to the last recipient in the main session.
- `model` optional (string): Model override (e.g., `anthropic/claude-sonnet-4-6` or an alias). Must be in the allowed model list if restricted.
- `thinking` optional (string): Thinking level override (e.g., `low`, `medium`, `high`).
- `timeoutSeconds` optional (number): Maximum duration for the agent run in seconds.

效果：

- 运行一个**隔离的**智能体回合（独立的会话键）
- 始终在**主**会话中发布摘要
- 如果 `wakeMode=now`，则立即触发心跳

### `POST /hooks/<name>`（映射）

自定义 hook 名称通过 `hooks.mappings` 解析（见配置）。映射可以将任意请求体转换为 `wake` 或 `agent` 操作，支持可选的模板或代码转换。

映射选项（摘要）：

- `hooks.presets: ["gmail"]` 启用内置的 Gmail 映射。
- `hooks.mappings` 允许你在配置中定义 `match`、`action` 和模板。
- `hooks.transformsDir` + `transform.module` 加载 JS/TS 模块用于自定义逻辑。
- 使用 `match.source` 保持通用的接收端点（基于请求体的路由）。
- TS 转换需要 TS 加载器（例如 `bun` 或 `tsx`）或运行时预编译的 `.js`。
- 在映射上设置 `deliver: true` + `channel`/`to` 可将回复路由到聊天界面（`channel` 默认为 `last`，回退到 WhatsApp）。
- `allowUnsafeExternalContent: true` 禁用该 hook 的外部内容安全包装（危险；仅用于受信任的内部来源）。
- `openclaw webhooks gmail setup` 为 `openclaw webhooks gmail run` 写入 `hooks.gmail` 配置。完整的 Gmail 监听流程请参阅 [Gmail Pub/Sub](/automation/gmail-pubsub)。

## 响应

- `200` 用于 `/hooks/wake`
- `202` 用于 `/hooks/agent`（异步运行已启动）
- `401` 认证失败
- `400` 请求体无效
- `413` 请求体过大

## 示例

```bash
curl -X POST http://127.0.0.1:18789/hooks/wake \
  -H 'Authorization: Bearer SECRET' \
  -H 'Content-Type: application/json' \
  -d '{"text":"New email received","mode":"now"}'
```

```bash
curl -X POST http://127.0.0.1:18789/hooks/agent \
  -H 'x-openclaw-token: SECRET' \
  -H 'Content-Type: application/json' \
  -d '{"message":"Summarize inbox","name":"Email","wakeMode":"next-heartbeat"}'
```

### 使用不同的模型

在智能体请求体（或映射）中添加 `model` 以覆盖该次运行的模型：

```bash
curl -X POST http://127.0.0.1:18789/hooks/agent \
  -H 'x-openclaw-token: SECRET' \
  -H 'Content-Type: application/json' \
  -d '{"message":"Summarize inbox","name":"Email","model":"openai/gpt-5.2-mini"}'
```

如果你启用了 `agents.defaults.models` 限制，请确保覆盖的模型包含在其中。

```bash
curl -X POST http://127.0.0.1:18789/hooks/gmail \
  -H 'Authorization: Bearer SECRET' \
  -H 'Content-Type: application/json' \
  -d '{"source":"gmail","messages":[{"from":"Ada","subject":"Hello","snippet":"Hi"}]}'
```

## 安全

- Keep hook endpoints behind loopback, tailnet, or trusted reverse proxy.
- Use a dedicated hook token; do not reuse gateway auth tokens.
- Prefer a dedicated hook agent with strict `tools.profile` and sandboxing so hook ingress has a narrower blast radius.
- Repeated auth failures are rate-limited per client address to slow brute-force attempts.
- If you use multi-agent routing, set `hooks.allowedAgentIds` to limit explicit `agentId` selection.
- Keep `hooks.allowRequestSessionKey=false` unless you require caller-selected sessions.
- If you enable request `sessionKey`, restrict `hooks.allowedSessionKeyPrefixes` (for example, `["hook:"]`).
- Avoid including sensitive raw payloads in webhook logs.
- Hook payloads are treated as untrusted and wrapped with safety boundaries by default.
  If you must disable this for a specific hook, set `allowUnsafeExternalContent: true`
  in that hook's mapping (dangerous).
