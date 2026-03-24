---
read_when:
  - 你需要按提供商分类的模型设置参考
  - 你需要模型提供商的示例配置或 CLI 新手引导命令
summary: 模型提供商概述，包含示例配置和 CLI 流程
title: 模型提供商
x-i18n:
  generated_at: "2026-02-03T07:46:28Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: 14f73e5a9f9b7c6f017d59a54633942dba95a3eb50f8848b836cfe0b9f6d7719
  source_path: concepts/model-providers.md
  workflow: 15
---

# 模型提供商

本页介绍 **LLM/模型提供商**（不是 WhatsApp/Telegram 等聊天渠道）。
关于模型选择规则，请参阅 [/concepts/models](/concepts/models)。

## 快速规则

- Model refs use `provider/model` (example: `opencode/claude-opus-4-6`).
- If you set `agents.defaults.models`, it becomes the allowlist.
- CLI helpers: `openclaw onboard`, `openclaw models list`, `openclaw models set <provider/model>`.
- Provider plugins can inject model catalogs via `registerProvider({ catalog })`;
  OpenClaw merges that output into `models.providers` before writing
  `models.json`.
- Provider manifests can declare `providerAuthEnvVars` so generic env-based
  auth probes do not need to load plugin runtime. The remaining core env-var
  map is now just for non-plugin/core providers and a few generic-precedence
  cases such as Anthropic API-key-first onboarding.
- Provider plugins can also own provider runtime behavior via
  `resolveDynamicModel`, `prepareDynamicModel`, `normalizeResolvedModel`,
  `capabilities`, `prepareExtraParams`, `wrapStreamFn`, `formatApiKey`,
  `refreshOAuth`, `buildAuthDoctorHint`,
  `isCacheTtlEligible`, `buildMissingAuthMessage`,
  `suppressBuiltInModel`, `augmentModelCatalog`, `isBinaryThinking`,
  `supportsXHighThinking`, `resolveDefaultThinkingLevel`,
  `isModernModelRef`, `prepareRuntimeAuth`, `resolveUsageAuth`, and
  `fetchUsageSnapshot`.
- Note: provider runtime `capabilities` is shared runner metadata (provider
  family, transcript/tooling quirks, transport/cache hints). It is not the
  same as the [public capability model](/plugins/architecture#public-capability-model)
  which describes what a plugin registers (text inference, speech, etc.).

## 内置提供商（pi-ai 目录）

Provider plugins can now own most provider-specific logic while OpenClaw keeps
the generic inference loop.

Typical split:

- `auth[].run` / `auth[].runNonInteractive`: provider owns onboarding/login
  flows for `openclaw onboard`, `openclaw models auth`, and headless setup
- `wizard.setup` / `wizard.modelPicker`: provider owns auth-choice labels,
  legacy aliases, onboarding allowlist hints, and setup entries in onboarding/model pickers
- `catalog`: provider appears in `models.providers`
- `resolveDynamicModel`: provider accepts model ids not present in the local
  static catalog yet
- `prepareDynamicModel`: provider needs a metadata refresh before retrying
  dynamic resolution
- `normalizeResolvedModel`: provider needs transport or base URL rewrites
- `capabilities`: provider publishes transcript/tooling/provider-family quirks
- `prepareExtraParams`: provider defaults or normalizes per-model request params
- `wrapStreamFn`: provider applies request headers/body/model compat wrappers
- `formatApiKey`: provider formats stored auth profiles into the runtime
  `apiKey` string expected by the transport
- `refreshOAuth`: provider owns OAuth refresh when the shared `pi-ai`
  refreshers are not enough
- `buildAuthDoctorHint`: provider appends repair guidance when OAuth refresh
  fails
- `isCacheTtlEligible`: provider decides which upstream model ids support prompt-cache TTL
- `buildMissingAuthMessage`: provider replaces the generic auth-store error
  with a provider-specific recovery hint
- `suppressBuiltInModel`: provider hides stale upstream rows and can return a
  vendor-owned error for direct resolution failures
- `augmentModelCatalog`: provider appends synthetic/final catalog rows after
  discovery and config merging
- `isBinaryThinking`: provider owns binary on/off thinking UX
- `supportsXHighThinking`: provider opts selected models into `xhigh`
- `resolveDefaultThinkingLevel`: provider owns default `/think` policy for a
  model family
- `isModernModelRef`: provider owns live/smoke preferred-model matching
- `prepareRuntimeAuth`: provider turns a configured credential into a short
  lived runtime token
- `resolveUsageAuth`: provider resolves usage/quota credentials for `/usage`
  and related status/reporting surfaces
- `fetchUsageSnapshot`: provider owns the usage endpoint fetch/parsing while
  core still owns the summary shell and formatting

Current bundled examples:

- `anthropic`: Claude 4.6 forward-compat fallback, auth repair hints, usage
  endpoint fetching, and cache-TTL/provider-family metadata
- `openrouter`: pass-through model ids, request wrappers, provider capability
  hints, and cache-TTL policy
- `github-copilot`: onboarding/device login, forward-compat model fallback,
  Claude-thinking transcript hints, runtime token exchange, and usage endpoint
  fetching
- `openai`: GPT-5.4 forward-compat fallback, direct OpenAI transport
  normalization, Codex-aware missing-auth hints, Spark suppression, synthetic
  OpenAI/Codex catalog rows, thinking/live-model policy, and
  provider-family metadata
- `google` and `google-gemini-cli`: Gemini 3.1 forward-compat fallback and
  modern-model matching; Gemini CLI OAuth also owns auth-profile token
  formatting, usage-token parsing, and quota endpoint fetching for usage
  surfaces
- `moonshot`: shared transport, plugin-owned thinking payload normalization
- `kilocode`: shared transport, plugin-owned request headers, reasoning payload
  normalization, Gemini transcript hints, and cache-TTL policy
- `zai`: GLM-5 forward-compat fallback, `tool_stream` defaults, cache-TTL
  policy, binary-thinking/live-model policy, and usage auth + quota fetching
- `mistral`, `opencode`, and `opencode-go`: plugin-owned capability metadata
- `byteplus`, `cloudflare-ai-gateway`, `huggingface`, `kimi-coding`,
  `modelstudio`, `nvidia`, `qianfan`, `synthetic`, `together`, `venice`,
  `vercel-ai-gateway`, and `volcengine`: plugin-owned catalogs only
- `qwen-portal`: plugin-owned catalog, OAuth login, and OAuth refresh
- `minimax` and `xiaomi`: plugin-owned catalogs plus usage auth/snapshot logic

The bundled `openai` plugin now owns both provider ids: `openai` and
`openai-codex`.

That covers providers that still fit OpenClaw's normal transports. A provider
that needs a totally custom request executor is a separate, deeper extension
surface.

## API key rotation

- Supports generic provider rotation for selected providers.
- Configure multiple keys via:
  - `OPENCLAW_LIVE_<PROVIDER>_KEY` (single live override, highest priority)
  - `<PROVIDER>_API_KEYS` (comma or semicolon list)
  - `<PROVIDER>_API_KEY` (primary key)
  - `<PROVIDER>_API_KEY_*` (numbered list, e.g. `<PROVIDER>_API_KEY_1`)
- For Google providers, `GOOGLE_API_KEY` is also included as fallback.
- Key selection order preserves priority and deduplicates values.
- Requests are retried with the next key only on rate-limit responses (for example `429`, `rate_limit`, `quota`, `resource exhausted`).
- Non-rate-limit failures fail immediately; no key rotation is attempted.
- When all candidate keys fail, the final error is returned from the last attempt.

## Built-in providers (pi-ai catalog)

OpenClaw ships with the pi‑ai catalog. These providers require **no**
`models.providers` config; just set auth + pick a model.

### OpenAI

- 提供商：`openai`
- 认证：`OPENAI_API_KEY`
- 示例模型：`openai/gpt-5.2`
- CLI：`openclaw onboard --auth-choice openai-api-key`

```json5
{
  agents: { defaults: { model: { primary: "openai/gpt-5.2" } } },
}
```

### Anthropic

- 提供商：`anthropic`
- 认证：`ANTHROPIC_API_KEY` 或 `claude setup-token`
- 示例模型：`anthropic/claude-opus-4-5`
- CLI：`openclaw onboard --auth-choice token`（粘贴 setup-token）或 `openclaw models auth paste-token --provider anthropic`

```json5
{
  agents: { defaults: { model: { primary: "anthropic/claude-opus-4-5" } } },
}
```

### OpenAI Code (Codex)

- 提供商：`openai-codex`
- 认证：OAuth (ChatGPT)
- 示例模型：`openai-codex/gpt-5.2`
- CLI：`openclaw onboard --auth-choice openai-codex` 或 `openclaw models auth login --provider openai-codex`

```json5
{
  agents: { defaults: { model: { primary: "openai-codex/gpt-5.2" } } },
}
```

### OpenCode

- 认证：`OPENCODE_API_KEY`（或 `OPENCODE_ZEN_API_KEY`）
- Zen 运行时提供商：`opencode`
- Go 运行时提供商：`opencode-go`
- 示例模型：`opencode/claude-opus-4-6`、`opencode-go/kimi-k2.5`
- CLI：`openclaw onboard --auth-choice opencode-zen` 或 `openclaw onboard --auth-choice opencode-go`

```json5
{
  agents: { defaults: { model: { primary: "opencode/claude-opus-4-5" } } },
}
```

### Google Gemini（API 密钥）

- 提供商：`google`
- 认证：`GEMINI_API_KEY`
- 可选轮转：`GEMINI_API_KEYS`、`GEMINI_API_KEY_1`、`GEMINI_API_KEY_2`、`GOOGLE_API_KEY` 回退，以及 `OPENCLAW_LIVE_GEMINI_KEY`（单一覆盖）
- 示例模型：`google/gemini-3.1-pro-preview`、`google/gemini-3-flash-preview`
- 兼容性：使用 `google/gemini-3.1-flash-preview` 的旧版 OpenClaw 配置会规范化为 `google/gemini-3-flash-preview`
- CLI：`openclaw onboard --auth-choice gemini-api-key`

### Google Vertex and Gemini CLI

- Providers: `google-vertex`, `google-gemini-cli`
- Auth: Vertex uses gcloud ADC; Gemini CLI uses its OAuth flow
- Caution: Gemini CLI OAuth in OpenClaw is an unofficial integration. Some users have reported Google account restrictions after using third-party clients. Review Google terms and use a non-critical account if you choose to proceed.
- Gemini CLI OAuth is shipped as part of the bundled `google` plugin.
  - Enable: `openclaw plugins enable google`
  - Login: `openclaw models auth login --provider google-gemini-cli --set-default`
  - Note: you do **not** paste a client id or secret into `openclaw.json`. The CLI login flow stores
    tokens in auth profiles on the gateway host.

### Z.AI (GLM)

- 提供商：`zai`
- 认证：`ZAI_API_KEY`
- 示例模型：`zai/glm-4.7`
- CLI：`openclaw onboard --auth-choice zai-api-key`
  - 别名：`z.ai/*` 和 `z-ai/*` 规范化为 `zai/*`

### Vercel AI Gateway

- 提供商：`vercel-ai-gateway`
- 认证：`AI_GATEWAY_API_KEY`
- 示例模型：`vercel-ai-gateway/anthropic/claude-opus-4.5`
- CLI：`openclaw onboard --auth-choice ai-gateway-api-key`

### 其他内置提供商

- OpenRouter：`openrouter`（`OPENROUTER_API_KEY`）
- 示例模型：`openrouter/anthropic/claude-sonnet-4-5`
- xAI：`xai`（`XAI_API_KEY`）
- Groq：`groq`（`GROQ_API_KEY`）
- Cerebras：`cerebras`（`CEREBRAS_API_KEY`）
  - Cerebras 上的 GLM 模型使用 ID `zai-glm-4.7` 和 `zai-glm-4.6`。
  - OpenAI 兼容的基础 URL：`https://api.cerebras.ai/v1`。
- Mistral：`mistral`（`MISTRAL_API_KEY`）
- GitHub Copilot：`github-copilot`（`COPILOT_GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN`）

## 通过 `models.providers` 配置的提供商（自定义/基础 URL）

### Other bundled provider plugins

- OpenRouter: `openrouter` (`OPENROUTER_API_KEY`)
- Example model: `openrouter/anthropic/claude-sonnet-4-6`
- Kilo Gateway: `kilocode` (`KILOCODE_API_KEY`)
- Example model: `kilocode/anthropic/claude-opus-4.6`
- MiniMax: `minimax` (`MINIMAX_API_KEY`)
- Moonshot: `moonshot` (`MOONSHOT_API_KEY`)
- Kimi Coding: `kimi-coding` (`KIMI_API_KEY` or `KIMICODE_API_KEY`)
- Qianfan: `qianfan` (`QIANFAN_API_KEY`)
- Model Studio: `modelstudio` (`MODELSTUDIO_API_KEY`)
- NVIDIA: `nvidia` (`NVIDIA_API_KEY`)
- Together: `together` (`TOGETHER_API_KEY`)
- Venice: `venice` (`VENICE_API_KEY`)
- Xiaomi: `xiaomi` (`XIAOMI_API_KEY`)
- Vercel AI Gateway: `vercel-ai-gateway` (`AI_GATEWAY_API_KEY`)
- Hugging Face Inference: `huggingface` (`HUGGINGFACE_HUB_TOKEN` or `HF_TOKEN`)
- Cloudflare AI Gateway: `cloudflare-ai-gateway` (`CLOUDFLARE_AI_GATEWAY_API_KEY`)
- Volcengine: `volcengine` (`VOLCANO_ENGINE_API_KEY`)
- BytePlus: `byteplus` (`BYTEPLUS_API_KEY`)
- xAI: `xai` (`XAI_API_KEY`)
- Mistral: `mistral` (`MISTRAL_API_KEY`)
- Example model: `mistral/mistral-large-latest`
- CLI: `openclaw onboard --auth-choice mistral-api-key`
- Groq: `groq` (`GROQ_API_KEY`)
- Cerebras: `cerebras` (`CEREBRAS_API_KEY`)
  - GLM models on Cerebras use ids `zai-glm-4.7` and `zai-glm-4.6`.
  - OpenAI-compatible base URL: `https://api.cerebras.ai/v1`.
- GitHub Copilot: `github-copilot` (`COPILOT_GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN`)
- Hugging Face Inference example model: `huggingface/deepseek-ai/DeepSeek-R1`; CLI: `openclaw onboard --auth-choice huggingface-api-key`. See [Hugging Face (Inference)](/providers/huggingface).

## Providers via `models.providers` (custom/base URL)

Use `models.providers` (or `models.json`) to add **custom** providers or
OpenAI/Anthropic‑compatible proxies.

Many of the bundled provider plugins below already publish a default catalog.
Use explicit `models.providers.<id>` entries only when you want to override the
default base URL, headers, or model list.

### Moonshot AI (Kimi)

Moonshot 使用 OpenAI 兼容端点，因此将其配置为自定义提供商：

- 提供商：`moonshot`
- 认证：`MOONSHOT_API_KEY`
- 示例模型：`moonshot/kimi-k2.5`

Kimi K2 模型 ID：

{/_ moonshot-kimi-k2-model-refs:start _/ && null}

- `moonshot/kimi-k2.5`
- `moonshot/kimi-k2-0905-preview`
- `moonshot/kimi-k2-turbo-preview`
- `moonshot/kimi-k2-thinking`
- `moonshot/kimi-k2-thinking-turbo`
  {/_ moonshot-kimi-k2-model-refs:end _/ && null}

```json5
{
  agents: {
    defaults: { model: { primary: "moonshot/kimi-k2.5" } },
  },
  models: {
    mode: "merge",
    providers: {
      moonshot: {
        baseUrl: "https://api.moonshot.ai/v1",
        apiKey: "${MOONSHOT_API_KEY}",
        api: "openai-completions",
        models: [{ id: "kimi-k2.5", name: "Kimi K2.5" }],
      },
    },
  },
}
```

### Kimi Coding

Kimi Coding 使用 Moonshot AI 的 Anthropic 兼容端点：

- 提供商：`kimi-coding`
- 认证：`KIMI_API_KEY`
- 示例模型：`kimi-coding/k2p5`

```json5
{
  env: { KIMI_API_KEY: "sk-..." },
  agents: {
    defaults: { model: { primary: "kimi-coding/k2p5" } },
  },
}
```

### Qwen OAuth（免费层级）

Qwen 通过设备码流程提供对 Qwen Coder + Vision 的 OAuth 访问。
启用捆绑插件，然后登录：

```bash
openclaw models auth login --provider qwen-portal --set-default
```

模型引用：

- `qwen-portal/coder-model`
- `qwen-portal/vision-model`

参见 [/providers/qwen](/providers/qwen) 了解设置详情和注意事项。

### Synthetic

Synthetic 通过 `synthetic` 提供商提供 Anthropic 兼容模型：

- 提供商：`synthetic`
- 认证：`SYNTHETIC_API_KEY`
- 示例模型：`synthetic/hf:MiniMaxAI/MiniMax-M2.1`
- CLI：`openclaw onboard --auth-choice synthetic-api-key`

```json5
{
  agents: {
    defaults: { model: { primary: "synthetic/hf:MiniMaxAI/MiniMax-M2.1" } },
  },
  models: {
    mode: "merge",
    providers: {
      synthetic: {
        baseUrl: "https://api.synthetic.new/anthropic",
        apiKey: "${SYNTHETIC_API_KEY}",
        api: "anthropic-messages",
        models: [{ id: "hf:MiniMaxAI/MiniMax-M2.1", name: "MiniMax M2.1" }],
      },
    },
  },
}
```

### MiniMax

MiniMax 通过 `models.providers` 配置，因为它使用自定义端点：

- MiniMax（Anthropic 兼容）：`--auth-choice minimax-api`
- 认证：`MINIMAX_API_KEY`

参见 [/providers/minimax](/providers/minimax) 了解设置详情、模型选项和配置片段。

### Ollama

Ollama 是提供 OpenAI 兼容 API 的本地 LLM 运行时：

- 提供商：`ollama`
- 认证：无需（本地服务器）
- 示例模型：`ollama/llama3.3`
- 安装：[https://ollama.com/download](https://ollama.com/download)

```bash
# Install Ollama, then pull a model:
ollama pull llama3.3
```

```json5
{
  agents: {
    defaults: { model: { primary: "ollama/llama3.3" } },
  },
}
```

当你通过 `OLLAMA_API_KEY` 启用时，Ollama 会在本地 `http://127.0.0.1:11434` 自动检测，`openclaw onboard` 可以直接将其配置为一等提供商。参见 [/providers/ollama](/providers/ollama) 了解引导、云端/本地模式和自定义配置。

### 本地代理（LM Studio、vLLM、LiteLLM 等）

示例（OpenAI 兼容）：

```json5
{
  agents: {
    defaults: {
      model: { primary: "lmstudio/minimax-m2.1-gs32" },
      models: { "lmstudio/minimax-m2.1-gs32": { alias: "Minimax" } },
    },
  },
  models: {
    providers: {
      lmstudio: {
        baseUrl: "http://localhost:1234/v1",
        apiKey: "LMSTUDIO_KEY",
        api: "openai-completions",
        models: [
          {
            id: "minimax-m2.1-gs32",
            name: "MiniMax M2.1",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200000,
            maxTokens: 8192,
          },
        ],
      },
    },
  },
}
```

注意事项：

- 对于自定义提供商，`reasoning`、`input`、`cost`、`contextWindow` 和 `maxTokens` 是可选的。
  省略时，OpenClaw 默认为：
  - `reasoning: false`
  - `input: ["text"]`
  - `cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }`
  - `contextWindow: 200000`
  - `maxTokens: 8192`
- 建议：设置与你的代理/模型限制匹配的显式值。

## CLI 示例

```bash
openclaw onboard --auth-choice opencode-zen
openclaw models set opencode/claude-opus-4-5
openclaw models list
```

另请参阅：[/gateway/configuration](/gateway/configuration) 了解完整配置示例。
