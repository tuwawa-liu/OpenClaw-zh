---
read_when:
  - 你正在构建一个 OpenClaw 插件
  - 你需要提供插件配置 Schema 或调试插件验证错误
summary: 插件清单及 JSON Schema 要求（严格配置验证）
title: 插件清单
x-i18n:
  generated_at: "2026-02-01T21:34:21Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: 47b3e33c915f47bdd172ae0316af7ef16ca831c317e3f1a7fdfcd67e3bd43f56
  source_path: plugins/manifest.md
  workflow: 15
---

# 插件清单（openclaw.plugin.json）

每个插件都**必须**在**插件根目录**下提供一个 `openclaw.plugin.json` 文件。OpenClaw 使用此清单来**在不执行插件代码的情况下**验证配置。缺失或无效的清单将被视为插件错误，并阻止配置验证。

参阅完整的插件系统指南：[插件](/tools/plugin)。

## 必填字段

```json
{
  "id": "voice-call",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

必填键：

- `id`（字符串）：插件的规范 id。
- `configSchema`（对象）：插件配置的 JSON Schema（内联形式）。

可选键：

- `kind` (string): plugin kind (examples: `"memory"`, `"context-engine"`).
- `channels` (array): channel ids registered by this plugin (example: `["matrix"]`).
- `providers` (array): provider ids registered by this plugin.
- `providerAuthEnvVars` (object): auth env vars keyed by provider id. Use this
  when OpenClaw should resolve provider credentials from env without loading
  plugin runtime first.
- `providerAuthChoices` (array): cheap onboarding/auth-choice metadata keyed by
  provider + auth method. Use this when OpenClaw should show a provider in
  auth-choice pickers, preferred-provider resolution, and CLI help without
  loading plugin runtime first.
- `skills` (array): skill directories to load (relative to the plugin root).
- `name` (string): display name for the plugin.
- `description` (string): short plugin summary.
- `uiHints` (object): config field labels/placeholders/sensitive flags for UI rendering.
- `version` (string): plugin version (informational).

### `providerAuthChoices` shape

Each entry can declare:

- `provider`: provider id
- `method`: auth method id
- `choiceId`: stable onboarding/auth-choice id
- `choiceLabel` / `choiceHint`: picker label + short hint
- `groupId` / `groupLabel` / `groupHint`: grouped onboarding bucket metadata
- `optionKey` / `cliFlag` / `cliOption` / `cliDescription`: optional one-flag
  CLI wiring for simple auth flows such as API keys

Example:

```json
{
  "providerAuthChoices": [
    {
      "provider": "openrouter",
      "method": "api-key",
      "choiceId": "openrouter-api-key",
      "choiceLabel": "OpenRouter API key",
      "groupId": "openrouter",
      "groupLabel": "OpenRouter",
      "optionKey": "openrouterApiKey",
      "cliFlag": "--openrouter-api-key",
      "cliOption": "--openrouter-api-key <key>",
      "cliDescription": "OpenRouter API key"
    }
  ]
}
```

## JSON Schema requirements

- **每个插件都必须提供 JSON Schema**，即使不接受任何配置也是如此。
- 空 Schema 是可以接受的（例如 `{ "type": "object", "additionalProperties": false }`）。
- Schema 在配置读取/写入时进行验证，而非在运行时。

## 验证行为

- 未知的 `channels.*` 键会被视为**错误**，除非该渠道 id 已在插件清单中声明。
- `plugins.entries.<id>`、`plugins.allow`、`plugins.deny` 和 `plugins.slots.*` 必须引用**可发现的**插件 id。未知 id 会被视为**错误**。
- 如果插件已安装但清单或 Schema 损坏或缺失，验证将失败，Doctor 会报告插件错误。
- 如果插件配置存在但插件已**禁用**，配置会被保留，并在 Doctor 和日志中显示**警告**。

## 注意事项

- The manifest is **required for native OpenClaw plugins**, including local filesystem loads.
- Runtime still loads the plugin module separately; the manifest is only for
  discovery + validation.
- `providerAuthEnvVars` is the cheap metadata path for auth probes, env-marker
  validation, and similar provider-auth surfaces that should not boot plugin
  runtime just to inspect env names.
- `providerAuthChoices` is the cheap metadata path for auth-choice pickers,
  `--auth-choice` resolution, preferred-provider mapping, and simple onboarding
  CLI flag registration before provider runtime loads.
- Exclusive plugin kinds are selected through `plugins.slots.*`.
  - `kind: "memory"` is selected by `plugins.slots.memory`.
  - `kind: "context-engine"` is selected by `plugins.slots.contextEngine`
    (default: built-in `legacy`).
- If your plugin depends on native modules, document the build steps and any
  package-manager allowlist requirements (for example, pnpm `allow-build-scripts`
  - `pnpm rebuild <package>`).
