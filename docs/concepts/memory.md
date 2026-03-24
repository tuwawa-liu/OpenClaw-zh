---
read_when:
  - 你想了解记忆文件布局和工作流程
  - 你想调整自动压缩前的记忆刷新
summary: OpenClaw 记忆的工作原理（工作空间文件 + 自动记忆刷新）
title: 记忆
x-i18n:
  generated_at: "2026-02-03T07:47:38Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: f3a7f5d9f61f9742eb3a8adbc3ccaddeadb7e48ceccdfb595327d6d1f55cd00e
  source_path: concepts/memory.md
  workflow: 15
---

# 记忆

OpenClaw 记忆是**智能体工作空间中的纯 Markdown 文件**。这些文件是唯一的事实来源；模型只"记住"写入磁盘的内容。

记忆搜索工具由活动的记忆插件提供（默认：`memory-core`）。使用 `plugins.slots.memory = "none"` 禁用记忆插件。

## 记忆文件（Markdown）

默认工作空间布局使用两个记忆层：

- `memory/YYYY-MM-DD.md`
  - Daily log (append-only).
  - Read today + yesterday at session start.
- `MEMORY.md` (optional)
  - Curated long-term memory.
  - If both `MEMORY.md` and `memory.md` exist at the workspace root, OpenClaw loads both (deduplicated by realpath so symlinks pointing to the same file are not injected twice).
  - **Only load in the main, private session** (never in group contexts).

这些文件位于工作空间下（`agents.defaults.workspace`，默认 `~/.openclaw/workspace`）。完整布局参见[智能体工作空间](/concepts/agent-workspace)。

## 何时写入记忆

- 决策、偏好和持久性事实写入 `MEMORY.md`。
- 日常笔记和运行上下文写入 `memory/YYYY-MM-DD.md`。
- 如果有人说"记住这个"，就写下来（不要只保存在内存中）。
- 这个领域仍在发展中。提醒模型存储记忆会有帮助；它会知道该怎么做。
- 如果你想让某些内容持久保存，**请要求机器人将其写入**记忆。

- `memory_search` -- semantic recall over indexed snippets.
- `memory_get` -- targeted read of a specific Markdown file/line range.

当会话**接近自动压缩**时，OpenClaw 会触发一个**静默的智能体回合**，提醒模型在上下文被压缩**之前**写入持久记忆。默认提示明确说明模型*可以回复*，但通常 `NO_REPLY` 是正确的响应，因此用户永远不会看到这个回合。

这由 `agents.defaults.compaction.memoryFlush` 控制：

```json5
{
  agents: {
    defaults: {
      compaction: {
        reserveTokensFloor: 20000,
        memoryFlush: {
          enabled: true,
          softThresholdTokens: 4000,
          systemPrompt: "Session nearing compaction. Store durable memories now.",
          prompt: "Write any lasting notes to memory/YYYY-MM-DD.md; reply with NO_REPLY if nothing to store.",
        },
      },
    },
  },
}
```

详情：

- **软阈值**：当会话 token 估计超过 `contextWindow - reserveTokensFloor - softThresholdTokens` 时触发刷新。
- 默认**静默**：提示包含 `NO_REPLY`，因此不会发送任何内容。
- **两个提示**：一个用户提示加一个系统提示附加提醒。
- **每个压缩周期刷新一次**（在 `sessions.json` 中跟踪）。
- **工作空间必须可写**：如果会话以 `workspaceAccess: "ro"` 或 `"none"` 在沙箱中运行，则跳过刷新。

完整的压缩生命周期参见[会话管理 + 压缩](/reference/session-management-compaction)。

## 向量记忆搜索

OpenClaw can build a small vector index over `MEMORY.md` and `memory/*.md` so
semantic queries can find related notes even when wording differs. Hybrid search
(BM25 + vector) is available for combining semantic matching with exact keyword
lookups.

Memory search supports multiple embedding providers (OpenAI, Gemini, Voyage,
Mistral, Ollama, and local GGUF models), an optional QMD sidecar backend for
advanced retrieval, and post-processing features like MMR diversity re-ranking
and temporal decay.

For the full configuration reference -- including embedding provider setup, QMD
backend, hybrid search tuning, multimodal memory, and all config knobs -- see
[Memory configuration reference](/reference/memory-config).
