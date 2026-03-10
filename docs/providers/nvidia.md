---
summary: "在 OpenClaw 中使用 NVIDIA 的 OpenAI 兼容 API"
read_when:
  - 想要在 OpenClaw 中使用 NVIDIA 模型
  - 需要 NVIDIA_API_KEY 设置
title: "NVIDIA"
---

# NVIDIA

NVIDIA 在 `https://integrate.api.nvidia.com/v1` 提供 OpenAI 兼容 API，支持 Nemotron 和 NeMo 模型。使用来自 [NVIDIA NGC](https://catalog.ngc.nvidia.com/) 的 API 密钥进行认证。

## CLI 设置

导出密钥后运行入门并设置 NVIDIA 模型：

```bash
export NVIDIA_API_KEY="nvapi-..."
openclaw onboard --auth-choice skip
openclaw models set nvidia/nvidia/llama-3.1-nemotron-70b-instruct
```

如果您仍然传递 `--token`，请注意它会出现在 shell 历史和 `ps` 输出中；尽可能使用环境变量。

## 配置示例

```json5
{
  env: { NVIDIA_API_KEY: "nvapi-..." },
  models: {
    providers: {
      nvidia: {
        baseUrl: "https://integrate.api.nvidia.com/v1",
        api: "openai-completions",
      },
    },
  },
  agents: {
    defaults: {
      model: { primary: "nvidia/nvidia/llama-3.1-nemotron-70b-instruct" },
    },
  },
}
```

## 模型 ID

- `nvidia/llama-3.1-nemotron-70b-instruct`（默认）
- `meta/llama-3.3-70b-instruct`
- `nvidia/mistral-nemo-minitron-8b-8k-instruct`

## 说明

- OpenAI 兼容 `/v1` 端点；使用来自 NVIDIA NGC 的 API 密钥。
- 设置 `NVIDIA_API_KEY` 后提供商自动启用；使用静态默认值（131,072 令牌上下文窗口，4,096 最大令牌数）。
