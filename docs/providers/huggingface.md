---
summary: "Hugging Face Inference 设置（认证 + 模型选择）"
read_when:
  - 想要在 OpenClaw 中使用 Hugging Face Inference
  - 需要 HF 令牌环境变量或 CLI 认证选择
title: "Hugging Face (Inference)"
---

# Hugging Face (Inference)

[Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers) 通过单一路由器 API 提供 OpenAI 兼容的聊天补全。您可以用一个令牌访问许多模型（DeepSeek、Llama 等）。OpenClaw 使用 **OpenAI 兼容端点**（仅聊天补全）；文本生成图像、嵌入或语音请直接使用 [HF inference 客户端](https://huggingface.co/docs/api-inference/quicktour)。

- 提供商：`huggingface`
- 认证：`HUGGINGFACE_HUB_TOKEN` 或 `HF_TOKEN`（具有 **Make calls to Inference Providers** 权限的细粒度令牌）
- API：OpenAI 兼容（`https://router.huggingface.co/v1`）
- 计费：单一 HF 令牌；[定价](https://huggingface.co/docs/inference-providers/pricing)遵循提供商费率，含免费层。

## 快速开始

1. 在 [Hugging Face → 设置 → 令牌](https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained) 创建具有 **Make calls to Inference Providers** 权限的细粒度令牌。
2. 运行入门并在提供商下拉菜单中选择 **Hugging Face**，然后在提示时输入您的 API 密钥：

```bash
openclaw onboard --auth-choice huggingface-api-key
```

3. 在 **默认 Hugging Face 模型** 下拉菜单中，选择您想要的模型（当您有有效令牌时，列表从 Inference API 加载；否则显示内置列表）。您的选择将保存为默认模型。
4. 您也可以稍后在配置中设置或更改默认模型：

```json5
{
  agents: {
    defaults: {
      model: { primary: "huggingface/deepseek-ai/DeepSeek-R1" },
    },
  },
}
```

## 非交互示例

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice huggingface-api-key \
  --huggingface-api-key "$HF_TOKEN"
```

这将设置 `huggingface/deepseek-ai/DeepSeek-R1` 为默认模型。

## 环境说明

如果 Gateway 作为守护进程运行（launchd/systemd），请确保 `HUGGINGFACE_HUB_TOKEN` 或 `HF_TOKEN` 对该进程可用（例如，放在 `~/.openclaw/.env` 中或通过 `env.shellEnv`）。

## 模型发现和入门下拉菜单

OpenClaw 通过直接调用 **Inference 端点** 发现模型：

```bash
GET https://router.huggingface.co/v1/models
```

（可选：发送 `Authorization: Bearer $HUGGINGFACE_HUB_TOKEN` 或 `$HF_TOKEN` 获取完整列表；某些端点在不认证时返回子集。）响应为 OpenAI 格式 `{ "object": "list", "data": [ { "id": "Qwen/Qwen3-8B", "owned_by": "Qwen", ... }, ... ] }`。

当您配置了 Hugging Face API 密钥（通过入门、`HUGGINGFACE_HUB_TOKEN` 或 `HF_TOKEN`），OpenClaw 使用此 GET 请求发现可用的聊天补全模型。在**交互式入门**期间，输入令牌后您会看到从该列表填充的**默认 Hugging Face 模型**下拉菜单（或在请求失败时使用内置目录）。在运行时（例如 Gateway 启动），当密钥存在时，OpenClaw 再次调用 **GET** `https://router.huggingface.co/v1/models` 刷新目录。该列表与内置目录合并（用于上下文窗口和成本等元数据）。如果请求失败或未设置密钥，则仅使用内置目录。

## 模型名称和可编辑选项

- **来自 API 的名称：** 当 API 返回 `name`、`title` 或 `display_name` 时，模型显示名称从 **GET /v1/models** 获取；否则从模型 ID 派生（例如 `deepseek-ai/DeepSeek-R1` → "DeepSeek R1"）。
- **覆盖显示名称：** 您可以在配置中为每个模型设置自定义标签，使其在 CLI 和 UI 中按您想要的方式显示：

```json5
{
  agents: {
    defaults: {
      models: {
        "huggingface/deepseek-ai/DeepSeek-R1": { alias: "DeepSeek R1 (fast)" },
        "huggingface/deepseek-ai/DeepSeek-R1:cheapest": {
          alias: "DeepSeek R1 (cheap)",
        },
      },
    },
  },
}
```

- **提供商/策略选择：** 在**模型 ID** 后附加后缀以选择路由器如何选择后端：
  - **`:fastest`** — 最高吞吐量（路由器选择；提供商选择**锁定** — 不显示交互式后端选择器）。
  - **`:cheapest`** — 每输出令牌最低成本（路由器选择；提供商选择**锁定**）。
  - **`:provider`** — 强制特定后端（例如 `:sambanova`、`:together`）。

  当您选择 **:cheapest** 或 **:fastest**（例如在入门模型下拉菜单中），提供商被锁定：路由器按成本或速度决定，不显示可选的"偏好特定后端"步骤。您可以在 `models.providers.huggingface.models` 中将这些作为单独条目添加，或使用带后缀的 `model.primary`。您也可以在 [Inference Provider 设置](https://hf.co/settings/inference-providers) 中设置默认顺序（无后缀 = 使用该顺序）。

- **配置合并：** `models.providers.huggingface.models` 中的现有条目（例如在 `models.json` 中）在配置合并时保留。因此您在那里设置的任何自定义 `name`、`alias` 或模型选项都会保留。

## 模型 ID 和配置示例

模型引用使用 `huggingface/<org>/<model>` 格式（Hub 风格 ID）。以下列表来自 **GET** `https://router.huggingface.co/v1/models`；您的目录可能包含更多。

**示例 ID（来自 inference 端点）：**

| 模型                   | 引用（前缀加 `huggingface/`）       |
| ---------------------- | ----------------------------------- |
| DeepSeek R1            | `deepseek-ai/DeepSeek-R1`           |
| DeepSeek V3.2          | `deepseek-ai/DeepSeek-V3.2`         |
| Qwen3 8B               | `Qwen/Qwen3-8B`                     |
| Qwen2.5 7B Instruct    | `Qwen/Qwen2.5-7B-Instruct`          |
| Qwen3 32B              | `Qwen/Qwen3-32B`                    |
| Llama 3.3 70B Instruct | `meta-llama/Llama-3.3-70B-Instruct` |
| Llama 3.1 8B Instruct  | `meta-llama/Llama-3.1-8B-Instruct`  |
| GPT-OSS 120B           | `openai/gpt-oss-120b`               |
| GLM 4.7                | `zai-org/GLM-4.7`                   |
| Kimi K2.5              | `moonshotai/Kimi-K2.5`              |

您可以在模型 ID 后附加 `:fastest`、`:cheapest` 或 `:provider`（例如 `:together`、`:sambanova`）。在 [Inference Provider 设置](https://hf.co/settings/inference-providers) 中设置默认顺序；参见 [Inference Providers](https://huggingface.co/docs/inference-providers) 和 **GET** `https://router.huggingface.co/v1/models` 获取完整列表。

### 完整配置示例

**DeepSeek R1 为主，Qwen 回退：**

```json5
{
  agents: {
    defaults: {
      model: {
        primary: "huggingface/deepseek-ai/DeepSeek-R1",
        fallbacks: ["huggingface/Qwen/Qwen3-8B"],
      },
      models: {
        "huggingface/deepseek-ai/DeepSeek-R1": { alias: "DeepSeek R1" },
        "huggingface/Qwen/Qwen3-8B": { alias: "Qwen3 8B" },
      },
    },
  },
}
```

**Qwen 为默认，带 :cheapest 和 :fastest 变体：**

```json5
{
  agents: {
    defaults: {
      model: { primary: "huggingface/Qwen/Qwen3-8B" },
      models: {
        "huggingface/Qwen/Qwen3-8B": { alias: "Qwen3 8B" },
        "huggingface/Qwen/Qwen3-8B:cheapest": { alias: "Qwen3 8B (cheapest)" },
        "huggingface/Qwen/Qwen3-8B:fastest": { alias: "Qwen3 8B (fastest)" },
      },
    },
  },
}
```

**DeepSeek + Llama + GPT-OSS 带别名：**

```json5
{
  agents: {
    defaults: {
      model: {
        primary: "huggingface/deepseek-ai/DeepSeek-V3.2",
        fallbacks: [
          "huggingface/meta-llama/Llama-3.3-70B-Instruct",
          "huggingface/openai/gpt-oss-120b",
        ],
      },
      models: {
        "huggingface/deepseek-ai/DeepSeek-V3.2": { alias: "DeepSeek V3.2" },
        "huggingface/meta-llama/Llama-3.3-70B-Instruct": {
          alias: "Llama 3.3 70B",
        },
        "huggingface/openai/gpt-oss-120b": { alias: "GPT-OSS 120B" },
      },
    },
  },
}
```

**使用 :provider 强制特定后端：**

```json5
{
  agents: {
    defaults: {
      model: { primary: "huggingface/deepseek-ai/DeepSeek-R1:together" },
      models: {
        "huggingface/deepseek-ai/DeepSeek-R1:together": {
          alias: "DeepSeek R1 (Together)",
        },
      },
    },
  },
}
```

**多个 Qwen 和 DeepSeek 模型带策略后缀：**

```json5
{
  agents: {
    defaults: {
      model: { primary: "huggingface/Qwen/Qwen2.5-7B-Instruct:cheapest" },
      models: {
        "huggingface/Qwen/Qwen2.5-7B-Instruct": { alias: "Qwen2.5 7B" },
        "huggingface/Qwen/Qwen2.5-7B-Instruct:cheapest": {
          alias: "Qwen2.5 7B (cheap)",
        },
        "huggingface/deepseek-ai/DeepSeek-R1:fastest": {
          alias: "DeepSeek R1 (fast)",
        },
        "huggingface/meta-llama/Llama-3.1-8B-Instruct": {
          alias: "Llama 3.1 8B",
        },
      },
    },
  },
}
```
