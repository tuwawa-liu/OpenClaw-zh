---
summary: "如何在 OpenClaw 的 AI 代理工作流中配置提示缓存"
read_when:
  - 配置 cacheRetention 参数以减少令牌成本
  - 调试缓存行为或查看缓存诊断日志
  - 了解提供商级别的提示缓存支持
title: "提示缓存"
---

# 提示缓存

提示缓存可以让提供商在多次轮次之间缓存系统/开发者提示块，从而减少令牌成本和延迟。OpenClaw 通过 `cacheRetention` 参数来控制此行为。

## 快速开始

在代理默认值中设置模型级别的 `cacheRetention`：

```yaml
agents:
  defaults:
    models:
      "anthropic/claude-opus-4-6":
        params:
          cacheRetention: "short" # 5分钟 TTL
```

有效值：

| 值        | 含义                            |
| --------- | ------------------------------- |
| `"short"` | 较短的缓存窗口（通常约 5 分钟） |
| `"long"`  | 较长的缓存窗口（通常约 1 小时） |
| `"none"`  | 禁用缓存（不注入缓存控制标记）  |

## 配置层级

`cacheRetention` 可以设置在模型参数和代理参数级别。

合并顺序：

1. `agents.defaults.models["provider/model"].params`
2. `agents.list[].params`（匹配的代理 ID；按键覆盖）

### 旧版 `cacheControlTtl`

旧版值仍然可用并被映射：

- `5m` -> `short`
- `1h` -> `long`

新配置建议使用 `cacheRetention`。

### `contextPruning.mode: "cache-ttl"`

在缓存 TTL 窗口之后裁剪旧的工具结果上下文，这样空闲后的请求不会重新缓存过大的历史记录。

```yaml
agents:
  defaults:
    contextPruning:
      mode: "cache-ttl"
      ttl: "1h"
```

参见[会话裁剪](/concepts/session-pruning)了解完整行为。

### 心跳保温

心跳可以保持缓存窗口活跃，减少空闲间隙后重复的缓存写入。

```yaml
agents:
  defaults:
    heartbeat:
      every: "55m"
```

支持在 `agents.list[].heartbeat` 进行每代理心跳配置。

## 提供商行为

### Anthropic（直接 API）

- 支持 `cacheRetention`。
- 使用 Anthropic API 密钥认证配置时，OpenClaw 在未设置时为 Anthropic 模型引用默认设置 `cacheRetention: "short"`。

### Amazon Bedrock

- Anthropic Claude 模型引用（`amazon-bedrock/*anthropic.claude*`）支持显式 `cacheRetention` 直通。
- 非 Anthropic 的 Bedrock 模型在运行时被强制设为 `cacheRetention: "none"`。

### OpenRouter Anthropic 模型

对于 `openrouter/anthropic/*` 模型引用，OpenClaw 在系统/开发者提示块上注入 Anthropic `cache_control` 以提高提示缓存复用率。

### 其他提供商

如果提供商不支持此缓存模式，`cacheRetention` 不会生效。

## 调优模式

### 混合流量（推荐默认值）

在主代理上保持长期基线，在突发通知代理上禁用缓存：

```yaml
agents:
  defaults:
    model:
      primary: "anthropic/claude-opus-4-6"
    models:
      "anthropic/claude-opus-4-6":
        params:
          cacheRetention: "long"
  list:
    - id: "research"
      default: true
      heartbeat:
        every: "55m"
    - id: "alerts"
      params:
        cacheRetention: "none"
```

### 成本优先基线

- 设置基线 `cacheRetention: "short"`。
- 启用 `contextPruning.mode: "cache-ttl"`。
- 仅对受益于热缓存的代理将心跳间隔保持低于 TTL。

## 缓存诊断

OpenClaw 为内嵌代理运行提供专用的缓存跟踪诊断。

### `diagnostics.cacheTrace` 配置

```yaml
diagnostics:
  cacheTrace:
    enabled: true
    filePath: "~/.openclaw/logs/cache-trace.jsonl" # 可选
    includeMessages: false # 默认 true
    includePrompt: false # 默认 true
    includeSystem: false # 默认 true
```

默认值：

- `filePath`：`$OPENCLAW_STATE_DIR/logs/cache-trace.jsonl`
- `includeMessages`：`true`
- `includePrompt`：`true`
- `includeSystem`：`true`

### 环境变量开关（一次性调试）

- `OPENCLAW_CACHE_TRACE=1` 启用缓存跟踪。
- `OPENCLAW_CACHE_TRACE_FILE=/path/to/cache-trace.jsonl` 覆盖输出路径。
- `OPENCLAW_CACHE_TRACE_MESSAGES=0|1` 切换完整消息负载捕获。
- `OPENCLAW_CACHE_TRACE_PROMPT=0|1` 切换提示文本捕获。
- `OPENCLAW_CACHE_TRACE_SYSTEM=0|1` 切换系统提示捕获。

### 检查内容

- 缓存跟踪事件为 JSONL 格式，包含 `session:loaded`、`prompt:before`、`stream:context` 和 `session:after` 等分阶段快照。
- 每轮缓存令牌影响可通过 `cacheRead` 和 `cacheWrite` 在常规使用界面中查看（例如 `/usage full` 和会话使用摘要）。

## 快速故障排除

- 大多数轮次 `cacheWrite` 偏高：检查是否有易变的系统提示输入，并验证模型/提供商是否支持您的缓存设置。
- `cacheRetention` 无效果：确认模型键匹配 `agents.defaults.models["provider/model"]`。
- Bedrock Nova/Mistral 请求带有缓存设置：预期运行时强制为 `none`。

相关文档：

- [Anthropic](/providers/anthropic)
- [令牌使用与成本](/reference/token-use)
- [会话裁剪](/concepts/session-pruning)
- [网关配置参考](/gateway/configuration-reference)
