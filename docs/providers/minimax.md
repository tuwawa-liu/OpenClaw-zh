---
summary: "Use MiniMax models in OpenClaw"
read_when:
  - 你想在 OpenClaw 中使用 MiniMax 模型
  - 你需要 MiniMax 设置指南
summary: 在 OpenClaw 中使用 MiniMax M2.1
title: MiniMax
x-i18n:
  generated_at: "2026-02-03T10:08:52Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: 861e1ddc3c24be88f716bfb72d6015d62875a9087f8e89ea4ba3a35f548c7fae
  source_path: providers/minimax.md
  workflow: 15
---

# MiniMax

OpenClaw's MiniMax provider defaults to **MiniMax M2.7** and keeps
**MiniMax M2.5** in the catalog for compatibility.

## Model lineup

- `MiniMax-M2.7`: default hosted text model.
- `MiniMax-M2.7-highspeed`: faster M2.7 text tier.
- `MiniMax-M2.5`: previous text model, still available in the MiniMax catalog.
- `MiniMax-M2.5-highspeed`: faster M2.5 text tier.
- `MiniMax-VL-01`: vision model for text + image inputs.

## 选择设置方式

### MiniMax OAuth (Coding Plan) - recommended

**适用于：** 通过 OAuth 快速设置 MiniMax 编程计划，无需 API 密钥。

启用内置 OAuth 插件并进行认证：

```bash
openclaw plugins enable minimax  # skip if already loaded.
openclaw gateway restart  # restart if gateway is already running
openclaw onboard --auth-choice minimax-portal
```

系统会提示你选择端点：

- **Global** - 国际用户（`api.minimax.io`）
- **CN** - 中国用户（`api.minimaxi.com`）

See [MiniMax plugin README](https://github.com/openclaw/openclaw/tree/main/extensions/minimax) for details.

### MiniMax M2.7 (API key)

**适用于：** 使用 Anthropic 兼容 API 的托管 MiniMax。

通过 CLI 配置：

- Run `openclaw configure`
- Select **Model/auth**
- Choose a **MiniMax** auth option

```json5
{
  env: { MINIMAX_API_KEY: "sk-..." },
  agents: { defaults: { model: { primary: "minimax/MiniMax-M2.7" } } },
  models: {
    mode: "merge",
    providers: {
      minimax: {
        baseUrl: "https://api.minimax.io/anthropic",
        apiKey: "${MINIMAX_API_KEY}",
        api: "anthropic-messages",
        models: [
          {
            id: "MiniMax-M2.7",
            name: "MiniMax M2.7",
            reasoning: true,
            input: ["text"],
            cost: { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0.12 },
            contextWindow: 200000,
            maxTokens: 8192,
          },
          {
            id: "MiniMax-M2.7-highspeed",
            name: "MiniMax M2.7 Highspeed",
            reasoning: true,
            input: ["text"],
            cost: { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0.12 },
            contextWindow: 200000,
            maxTokens: 8192,
          },
          {
            id: "MiniMax-M2.5",
            name: "MiniMax M2.5",
            reasoning: true,
            input: ["text"],
            cost: { input: 15, output: 60, cacheRead: 2, cacheWrite: 10 },
            contextWindow: 200000,
            maxTokens: 8192,
          },
        ],
      },
    },
  },
}
```

### MiniMax M2.7 as fallback (example)

**Best for:** keep your strongest latest-generation model as primary, fail over to MiniMax M2.7.
Example below uses Opus as a concrete primary; swap to your preferred latest-gen primary model.

```json5
{
  env: { MINIMAX_API_KEY: "sk-..." },
  agents: {
    defaults: {
      models: {
        "anthropic/claude-opus-4-6": { alias: "primary" },
        "minimax/MiniMax-M2.7": { alias: "minimax" },
      },
      model: {
        primary: "anthropic/claude-opus-4-6",
        fallbacks: ["minimax/MiniMax-M2.7"],
      },
    },
  },
}
```

### 可选：通过 LM Studio 本地运行（手动）

**适用于：** 使用 LM Studio 进行本地推理。
我们在强大硬件（例如台式机/服务器）上使用 LM Studio 的本地服务器运行 MiniMax M2.1 时看到了出色的效果。

通过 `openclaw.json` 手动配置：

```json5
{
  agents: {
    defaults: {
      model: { primary: "lmstudio/minimax-m2.1-gs32" },
      models: { "lmstudio/minimax-m2.1-gs32": { alias: "Minimax" } },
    },
  },
  models: {
    mode: "merge",
    providers: {
      lmstudio: {
        baseUrl: "http://127.0.0.1:1234/v1",
        apiKey: "lmstudio",
        api: "openai-responses",
        models: [
          {
            id: "minimax-m2.1-gs32",
            name: "MiniMax M2.1 GS32",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 196608,
            maxTokens: 8192,
          },
        ],
      },
    },
  },
}
```

## 通过 `openclaw configure` 配置

使用交互式配置向导设置 MiniMax，无需编辑 JSON：

1. Run `openclaw configure`.
2. Select **Model/auth**.
3. Choose a **MiniMax** auth option.
4. Pick your default model when prompted.

## 配置选项

- `models.providers.minimax.baseUrl`：推荐使用 `https://api.minimax.io/anthropic`（Anthropic 兼容）；`https://api.minimax.io/v1` 可选用于 OpenAI 兼容的负载。
- `models.providers.minimax.api`：推荐使用 `anthropic-messages`；`openai-completions` 可选用于 OpenAI 兼容的负载。
- `models.providers.minimax.apiKey`：MiniMax API 密钥（`MINIMAX_API_KEY`）。
- `models.providers.minimax.models`：定义 `id`、`name`、`reasoning`、`contextWindow`、`maxTokens`、`cost`。
- `agents.defaults.models`：为你想要在允许列表中的模型设置别名。
- `models.mode`：如果你想将 MiniMax 与内置模型一起添加，保持 `merge`。

## 注意事项

- Model refs are `minimax/<model>`.
- Default text model: `MiniMax-M2.7`.
- Alternate text models: `MiniMax-M2.7-highspeed`, `MiniMax-M2.5`, `MiniMax-M2.5-highspeed`.
- Coding Plan usage API: `https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains` (requires a coding plan key).
- Update pricing values in `models.json` if you need exact cost tracking.
- Referral link for MiniMax Coding Plan (10% off): [https://platform.minimax.io/subscribe/coding-plan?code=DbXJTRClnb&source=link](https://platform.minimax.io/subscribe/coding-plan?code=DbXJTRClnb&source=link)
- See [/concepts/model-providers](/concepts/model-providers) for provider rules.
- Use `openclaw models list` and `openclaw models set minimax/MiniMax-M2.7` to switch.

## 故障排除

### "Unknown model: minimax/MiniMax-M2.7"

This usually means the **MiniMax provider isn’t configured** (no provider entry
and no MiniMax auth profile/env key found). A fix for this detection is in
**2026.1.12**. Fix by:

- Upgrading to **2026.1.12** (or run from source `main`), then restarting the gateway.
- Running `openclaw configure` and selecting a **MiniMax** auth option, or
- Adding the `models.providers.minimax` block manually, or
- Setting `MINIMAX_API_KEY` (or a MiniMax auth profile) so the provider can be injected.

确保模型 id **区分大小写**：

- `minimax/MiniMax-M2.7`
- `minimax/MiniMax-M2.7-highspeed`
- `minimax/MiniMax-M2.5`
- `minimax/MiniMax-M2.5-highspeed`

然后重新检查：

```bash
openclaw models list
```
