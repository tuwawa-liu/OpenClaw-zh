---
read_when:
  - 你想通过 Ollama 使用本地模型运行 OpenClaw
  - 你需要 Ollama 的安装和配置指导
summary: 通过 Ollama（本地 LLM 运行时）运行 OpenClaw
title: Ollama
x-i18n:
  generated_at: "2026-02-01T21:35:22Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: 157080ad90f449f622260a5f5bd293f79c15800527d36b15596e8ca232e3c957
  source_path: providers/ollama.md
  workflow: 15
---

# Ollama

Ollama 是一个本地 LLM 运行时，可以轻松在你的机器上运行开源模型。OpenClaw 通过 Ollama 的原生 API（`/api/chat`）进行集成，支持流式传输和工具调用，并且当你通过 `OLLAMA_API_KEY`（或认证配置）启用且未定义显式的 `models.providers.ollama` 条目时，可以**自动发现本地 Ollama 模型**。

## 快速开始

1. 安装 Ollama：https://ollama.ai

### Onboarding (recommended)

The fastest way to set up Ollama is through onboarding:

```bash
openclaw onboard
```

Select **Ollama** from the provider list. Onboarding will:

1. Ask for the Ollama base URL where your instance can be reached (default `http://127.0.0.1:11434`).
2. Let you choose **Cloud + Local** (cloud models and local models) or **Local** (local models only).
3. Open a browser sign-in flow if you choose **Cloud + Local** and are not signed in to ollama.com.
4. Discover available models and suggest defaults.
5. Auto-pull the selected model if it is not available locally.

Non-interactive mode is also supported:

```bash
openclaw onboard --non-interactive \
  --auth-choice ollama \
  --accept-risk
```

Optionally specify a custom base URL or model:

```bash
openclaw onboard --non-interactive \
  --auth-choice ollama \
  --custom-base-url "http://ollama-host:11434" \
  --custom-model-id "qwen3.5:27b" \
  --accept-risk
```

### Manual setup

1. Install Ollama: [https://ollama.com/download](https://ollama.com/download)

2. Pull a local model if you want local inference:

```bash
ollama pull glm-4.7-flash
# 或
ollama pull gpt-oss:20b
# 或
ollama pull llama3.3
```

3. 如果也想使用 Ollama 云端模型，请登录：

```bash
ollama signin
```

4. 运行引导并选择 `Ollama`：

```bash
openclaw onboard
```

- `Local`：仅本地模型
- `Cloud + Local`：本地模型加 Ollama 云端模型
- 云端模型如 `kimi-k2.5:cloud`、`minimax-m2.5:cloud` 和 `glm-5:cloud` **不**需要本地 `ollama pull`

OpenClaw 当前建议：

- 本地默认：`glm-4.7-flash`
- 云端默认：`kimi-k2.5:cloud`、`minimax-m2.5:cloud`、`glm-5:cloud`

5. 如果你偏好手动设置，直接为 OpenClaw 启用 Ollama（任意值即可；Ollama 不需要真实密钥）：

```bash
# 设置环境变量
export OLLAMA_API_KEY="ollama-local"

# 或在配置文件中设置
openclaw config set models.providers.ollama.apiKey "ollama-local"
```

6. 检查或切换模型：

```bash
openclaw models list
openclaw models set ollama/glm-4.7-flash
```

7. 或在配置中设置默认值：

```json5
{
  agents: {
    defaults: {
      model: { primary: "ollama/glm-4.7-flash" },
    },
  },
}
```

## 模型发现（隐式提供商）

当你设置了 `OLLAMA_API_KEY`（或认证配置）且**未**定义 `models.providers.ollama` 时，OpenClaw 会从本地 Ollama 实例 `http://127.0.0.1:11434` 发现模型：

- 查询 `/api/tags`
- 使用尽力而为的 `/api/show` 查找来读取可用的 `contextWindow`
- 通过模型名称启发式（`r1`、`reasoning`、`think`）标记 `reasoning`
- 将 `maxTokens` 设置为 OpenClaw 使用的默认 Ollama 最大令牌上限
- 所有费用设置为 `0`

这样无需手动配置模型条目，同时保持目录与本地 Ollama 实例对齐。

查看可用模型：

```bash
ollama list
openclaw models list
```

要添加新模型，只需通过 Ollama 拉取：

```bash
ollama pull mistral
```

新模型将被自动发现并可供使用。

如果你显式设置了 `models.providers.ollama`，自动发现将被跳过，你必须手动定义模型（见下文）。

## 配置

### 基本设置（隐式发现）

启用 Ollama 最简单的方式是通过环境变量：

```bash
export OLLAMA_API_KEY="ollama-local"
```

### 显式设置（手动模型）

在以下情况使用显式配置：

- Ollama 运行在其他主机/端口上。
- 你想强制指定上下文窗口或模型列表。
- 你想完全手动定义模型。

```json5
{
  models: {
    providers: {
      ollama: {
        // 使用包含 /v1 的主机地址以兼容 OpenAI API
        baseUrl: "http://ollama-host:11434/v1",
        apiKey: "ollama-local",
        api: "openai-completions",
        models: [
          {
            id: "llama3.3",
            name: "Llama 3.3",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 8192,
            maxTokens: 8192 * 10
          }
        ]
      }
    }
  }
}
```

如果设置了 `OLLAMA_API_KEY`，你可以在提供商条目中省略 `apiKey`，OpenClaw 会自动填充以进行可用性检查。

### 自定义基础 URL（显式配置）

如果 Ollama 运行在不同的主机或端口上（显式配置会禁用自动发现，因此需要手动定义模型）：

```json5
{
  models: {
    providers: {
      ollama: {
        apiKey: "ollama-local",
        baseUrl: "http://ollama-host:11434/v1",
      },
    },
  },
}
```

### 模型选择

配置完成后，所有 Ollama 模型即可使用：

```json5
{
  agents: {
    defaults: {
      model: {
        primary: "ollama/llama3.3",
        fallbacks: ["ollama/qwen2.5-coder:32b"],
      },
    },
  },
}
```

## 高级用法

### 推理模型

To use cloud models, select **Cloud + Local** mode during setup. The wizard checks whether you are signed in and opens a browser sign-in flow when needed. If authentication cannot be verified, the wizard falls back to local model defaults.

You can also sign in directly at [ollama.com/signin](https://ollama.com/signin).

## Advanced

### Reasoning models

OpenClaw treats models with names such as `deepseek-r1`, `reasoning`, or `think` as reasoning-capable by default:

```bash
ollama pull deepseek-r1:32b
```

### 模型费用

Ollama 免费且在本地运行，因此所有模型费用均设置为 $0。

### 上下文窗口

对于自动发现的模型，OpenClaw 会使用 Ollama 报告的上下文窗口（如果可用），否则默认为 `8192`。你可以在显式提供商配置中覆盖 `contextWindow` 和 `maxTokens`。

## 故障排除

### Ollama 未被检测到

如果你需要使用 OpenAI 兼容端点（例如，在仅支持 OpenAI 格式的代理后面），请显式设置 `api: "openai-completions"`：

```json5
{
  models: {
    providers: {
      ollama: {
        baseUrl: "http://ollama-host:11434/v1",
        api: "openai-completions",
        injectNumCtxForOpenAICompat: true, // 默认：true
        apiKey: "ollama-local",
        models: [...]
      }
    }
  }
}
```

此模式可能不支持同时进行流式传输和工具调用。你可能需要在模型配置中使用 `params: { streaming: false }` 禁用流式传输。

当在 Ollama 上使用 `api: "openai-completions"` 时，OpenClaw 默认会注入 `options.num_ctx`，以防 Ollama 静默回退到 4096 上下文窗口。如果你的代理/上游拒绝未知的 `options` 字段，请禁用此行为：

```json5
{
  models: {
    providers: {
      ollama: {
        baseUrl: "http://ollama-host:11434/v1",
        api: "openai-completions",
        injectNumCtxForOpenAICompat: false,
        apiKey: "ollama-local",
        models: [...]
      }
    }
  }
}
```

### 上下文窗口

对于自动发现的模型，OpenClaw 会使用 Ollama 报告的上下文窗口（如果可用），否则回退到 OpenClaw 使用的默认 Ollama 上下文窗口。你可以在显式提供商配置中覆盖 `contextWindow` 和 `maxTokens`。

## 故障排除

### Ollama 未被检测到

确保 Ollama 正在运行，且你已设置 `OLLAMA_API_KEY`（或认证配置），并且**未**定义显式的 `models.providers.ollama` 条目：

```bash
ollama serve
```

同时确认 API 可访问：

```bash
curl http://localhost:11434/api/tags
```

### 没有可用模型

如果你的模型未列出，可以：

- 在本地拉取该模型，或
- 在 `models.providers.ollama` 中显式定义该模型。

添加模型：

```bash
ollama list  # 查看已安装的模型
ollama pull glm-4.7-flash
ollama pull gpt-oss:20b
ollama pull llama3.3     # 或其他模型
```

### 连接被拒绝

检查 Ollama 是否在正确的端口上运行：

```bash
# 检查 Ollama 是否在运行
ps aux | grep ollama

# 或重启 Ollama
ollama serve
```

## 另请参阅

- [模型提供商](/concepts/model-providers) - 所有提供商概览
- [模型选择](/concepts/models) - 如何选择模型
- [配置](/gateway/configuration) - 完整配置参考
