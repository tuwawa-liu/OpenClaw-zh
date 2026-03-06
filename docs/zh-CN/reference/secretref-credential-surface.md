---
summary: "SecretRef 凭证支持范围的权威定义"
read_when:
  - 验证 SecretRef 凭证覆盖范围
  - 审计凭证是否符合 `secrets configure` 或 `secrets apply` 的条件
  - 验证凭证在支持范围之外的原因
title: "SecretRef 凭证表面"
---

# SecretRef 凭证表面

本页面定义了 SecretRef 凭证的权威支持范围。

范围意图：

- 范围内：严格限于用户提供的、OpenClaw 不自行签发或轮换的凭证。
- 范围外：运行时签发或轮换的凭证、OAuth 刷新材料和类会话制品。

## 支持的凭证

### `openclaw.json` 目标（`secrets configure` + `secrets apply` + `secrets audit`）

[//]: # "secretref-supported-list-start"

- `models.providers.*.apiKey`
- `skills.entries.*.apiKey`
- `agents.defaults.memorySearch.remote.apiKey`
- `agents.list[].memorySearch.remote.apiKey`
- `talk.apiKey`
- `talk.providers.*.apiKey`
- `messages.tts.elevenlabs.apiKey`
- `messages.tts.openai.apiKey`
- `tools.web.search.apiKey`
- `tools.web.search.gemini.apiKey`
- `tools.web.search.grok.apiKey`
- `tools.web.search.kimi.apiKey`
- `tools.web.search.perplexity.apiKey`
- `gateway.auth.password`
- `gateway.auth.token`
- `gateway.remote.token`
- `gateway.remote.password`
- `cron.webhookToken`
- `channels.telegram.botToken`
- `channels.telegram.webhookSecret`
- `channels.telegram.accounts.*.botToken`
- `channels.telegram.accounts.*.webhookSecret`
- `channels.slack.botToken`
- `channels.slack.appToken`
- `channels.slack.userToken`
- `channels.slack.signingSecret`
- `channels.slack.accounts.*.botToken`
- `channels.slack.accounts.*.appToken`
- `channels.slack.accounts.*.userToken`
- `channels.slack.accounts.*.signingSecret`
- `channels.discord.token`
- `channels.discord.pluralkit.token`
- `channels.discord.voice.tts.elevenlabs.apiKey`
- `channels.discord.voice.tts.openai.apiKey`
- `channels.discord.accounts.*.token`
- `channels.discord.accounts.*.pluralkit.token`
- `channels.discord.accounts.*.voice.tts.elevenlabs.apiKey`
- `channels.discord.accounts.*.voice.tts.openai.apiKey`
- `channels.irc.password`
- `channels.irc.nickserv.password`
- `channels.irc.accounts.*.password`
- `channels.irc.accounts.*.nickserv.password`
- `channels.bluebubbles.password`
- `channels.bluebubbles.accounts.*.password`
- `channels.feishu.appSecret`
- `channels.feishu.verificationToken`
- `channels.feishu.accounts.*.appSecret`
- `channels.feishu.accounts.*.verificationToken`
- `channels.msteams.appPassword`
- `channels.mattermost.botToken`
- `channels.mattermost.accounts.*.botToken`
- `channels.matrix.password`
- `channels.matrix.accounts.*.password`
- `channels.nextcloud-talk.botSecret`
- `channels.nextcloud-talk.apiPassword`
- `channels.nextcloud-talk.accounts.*.botSecret`
- `channels.nextcloud-talk.accounts.*.apiPassword`
- `channels.zalo.botToken`
- `channels.zalo.webhookSecret`
- `channels.zalo.accounts.*.botToken`
- `channels.zalo.accounts.*.webhookSecret`
- `channels.googlechat.serviceAccount` 通过同级 `serviceAccountRef`（兼容性例外）
- `channels.googlechat.accounts.*.serviceAccount` 通过同级 `serviceAccountRef`（兼容性例外）

### `auth-profiles.json` 目标（`secrets configure` + `secrets apply` + `secrets audit`）

- `profiles.*.keyRef`（`type: "api_key"`）
- `profiles.*.tokenRef`（`type: "token"`）

[//]: # "secretref-supported-list-end"

备注：

- 认证配置文件计划目标需要 `agentId`。
- 计划条目的目标路径为 `profiles.*.key` / `profiles.*.token`，并写入同级引用（`keyRef` / `tokenRef`）。
- 认证配置文件引用包含在运行时解析和审计覆盖中。
- 对于 Web 搜索：
  - 在显式提供商模式下（设置了 `tools.web.search.provider`），仅选定提供商的密钥处于活跃状态。
  - 在自动模式下（未设置 `tools.web.search.provider`），`tools.web.search.apiKey` 和特定提供商的密钥均处于活跃状态。

## 不支持的凭证

超出范围的凭证包括：

[//]: # "secretref-unsupported-list-start"

- `commands.ownerDisplaySecret`
- `channels.matrix.accessToken`
- `channels.matrix.accounts.*.accessToken`
- `hooks.token`
- `hooks.gmail.pushToken`
- `hooks.mappings[].sessionKey`
- `auth-profiles.oauth.*`
- `discord.threadBindings.*.webhookToken`
- `whatsapp.creds.json`

[//]: # "secretref-unsupported-list-end"

原因：

- 这些凭证属于签发型、轮换型、会话承载型或 OAuth 持久型类别，不适合只读的外部 SecretRef 解析。
