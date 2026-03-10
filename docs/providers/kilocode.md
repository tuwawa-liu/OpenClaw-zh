---
summary: "使用 Kilo Gateway 的统一 API 在 OpenClaw 中访问多种模型"
read_when:
  - 想要用一个 API 密钥访问多个 LLM
  - 想要通过 Kilo Gateway 在 OpenClaw 中运行模型
---

# Kilo Gateway

Kilo Gateway 提供**统一 API**，通过单一端点和 API 密钥将请求路由到多种模型。它兼容 OpenAI，因此大多数 OpenAI SDK 只需切换基础 URL 即可使用。

## 获取 API 密钥

1. 前往 [app.kilo.ai](https://app.kilo.ai)
2. 登录或创建账号
3. 导航到 API 密钥页面并生成新密钥

## CLI 设置

```bash
openclaw onboard --kilocode-api-key <key>
```

或设置环境变量：

```bash
export KILOCODE_API_KEY="your-api-key"
```

## 配置示例

```json5
{
  env: { KILOCODE_API_KEY: "sk-..." },
  agents: {
    defaults: {
      model: { primary: "kilocode/anthropic/claude-opus-4.6" },
    },
  },
}
```

## 公开的模型引用

内置的 Kilo Gateway 目录当前公开以下模型引用：

- `kilocode/anthropic/claude-opus-4.6`（默认）
- `kilocode/z-ai/glm-5:free`
- `kilocode/minimax/minimax-m2.5:free`
- `kilocode/anthropic/claude-sonnet-4.5`
- `kilocode/openai/gpt-5.2`
- `kilocode/google/gemini-3-pro-preview`
- `kilocode/google/gemini-3-flash-preview`
- `kilocode/x-ai/grok-code-fast-1`
- `kilocode/moonshotai/kimi-k2.5`

## 说明

- 模型引用格式为 `kilocode/<provider>/<model>`（例如 `kilocode/anthropic/claude-opus-4.6`）。
- 默认模型：`kilocode/anthropic/claude-opus-4.6`
- 基础 URL：`https://api.kilo.ai/api/gateway/`
- 更多模型/提供商选项请参见 [/concepts/model-providers](/concepts/model-providers)。
- Kilo Gateway 在底层使用 Bearer 令牌和您的 API 密钥。
