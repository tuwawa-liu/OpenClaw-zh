# ACP 持久绑定：Discord 频道和 Telegram 话题

状态：草案

## 摘要

引入持久 ACP 绑定，映射：

- Discord 频道（和现有线程，在需要时），以及
- 群组/超级群组中的 Telegram 论坛话题（`chatId:topic:topicId`）

到长期 ACP 会话，绑定状态存储在顶级 `bindings[]` 条目中，使用显式绑定类型。

这使得在高流量消息频道中的 ACP 使用可预测且持久，用户可以创建专用频道/话题，如 `codex`、`claude-1` 或 `claude-myrepo`。

## 为什么

当前线程绑定的 ACP 行为针对临时 Discord 线程工作流进行了优化。Telegram 没有相同的线程模型；它在群组/超级群组中有论坛话题。用户需要在聊天界面中有稳定的、始终开启的 ACP "工作区"，而不仅是临时线程会话。

## 目标

- 支持以下场景的持久 ACP 绑定：
  - Discord 频道/线程
  - Telegram 论坛话题（群组/超级群组）
- 使绑定的事实来源由配置驱动。
- 保持 `/acp`、`/new`、`/reset`、`/focus` 和交付行为在 Discord 和 Telegram 之间一致。
- 保留现有的临时绑定流用于临时使用。

## 非目标

- 全面重新设计 ACP 运行时/会话内部。
- 移除现有的临时绑定流。
- 在第一次迭代中扩展到每个频道。
- 在本阶段实现 Telegram 频道私信话题（`direct_messages_topic_id`）。
- 在本阶段实现 Telegram 私聊话题变体。

## 用户体验方向

### 1) 两种绑定类型

- **持久绑定**：保存在配置中，启动时协调，用于"命名工作区"频道/话题。
- **临时绑定**：仅运行时，按空闲/最大时长策略过期。

### 2) 命令行为

- `/acp spawn ... --thread here|auto|off` 仍然可用。
- 添加显式绑定生命周期控制：
  - `/acp bind [session|agent] [--persist]`
  - `/acp unbind [--persist]`
  - `/acp status` 包含绑定是 `persistent` 还是 `temporary`。
- 在绑定的会话中，`/new` 和 `/reset` 就地重置绑定的 ACP 会话并保持绑定。

### 3) 会话身份

- 使用规范会话 ID：
  - Discord：频道/线程 ID。
  - Telegram 话题：`chatId:topic:topicId`。
- 永远不要仅通过裸话题 ID 来键控 Telegram 绑定。

## 配置模型（提议）

统一路由和持久 ACP 绑定配置在顶级 `bindings[]` 中，使用显式 `type` 判别器：

```jsonc
{
  "agents": {
    "list": [
      {
        "id": "main",
        "default": true,
        "workspace": "~/.openclaw/workspace-main",
        "runtime": { "type": "embedded" },
      },
      {
        "id": "codex",
        "workspace": "~/.openclaw/workspace-codex",
        "runtime": {
          "type": "acp",
          "acp": {
            "agent": "codex",
            "backend": "acpx",
            "mode": "persistent",
            "cwd": "/workspace/repo-a",
          },
        },
      },
      {
        "id": "claude",
        "workspace": "~/.openclaw/workspace-claude",
        "runtime": {
          "type": "acp",
          "acp": {
            "agent": "claude",
            "backend": "acpx",
            "mode": "persistent",
            "cwd": "/workspace/repo-b",
          },
        },
      },
    ],
  },
  "acp": {
    "enabled": true,
    "backend": "acpx",
    "allowedAgents": ["codex", "claude"],
  },
  "bindings": [
    // 路由绑定（现有行为）
    {
      "type": "route",
      "agentId": "main",
      "match": { "channel": "discord", "accountId": "default" },
    },
    {
      "type": "route",
      "agentId": "main",
      "match": { "channel": "telegram", "accountId": "default" },
    },
    // 持久 ACP 会话绑定
    {
      "type": "acp",
      "agentId": "codex",
      "match": {
        "channel": "discord",
        "accountId": "default",
        "peer": { "kind": "channel", "id": "222222222222222222" },
      },
      "acp": {
        "label": "codex-main",
        "mode": "persistent",
        "cwd": "/workspace/repo-a",
        "backend": "acpx",
      },
    },
    {
      "type": "acp",
      "agentId": "claude",
      "match": {
        "channel": "discord",
        "accountId": "default",
        "peer": { "kind": "channel", "id": "333333333333333333" },
      },
      "acp": {
        "label": "claude-repo-b",
        "mode": "persistent",
        "cwd": "/workspace/repo-b",
      },
    },
    {
      "type": "acp",
      "agentId": "codex",
      "match": {
        "channel": "telegram",
        "accountId": "default",
        "peer": { "kind": "group", "id": "-1001234567890:topic:42" },
      },
      "acp": {
        "label": "tg-codex-42",
        "mode": "persistent",
      },
    },
  ],
  "channels": {
    "discord": {
      "guilds": {
        "111111111111111111": {
          "channels": {
            "222222222222222222": {
              "enabled": true,
              "requireMention": false,
            },
            "333333333333333333": {
              "enabled": true,
              "requireMention": false,
            },
          },
        },
      },
    },
    "telegram": {
      "groups": {
        "-1001234567890": {
          "topics": {
            "42": {
              "requireMention": false,
            },
          },
        },
      },
    },
  },
}
```

### 最小示例（无每绑定 ACP 覆盖）

```jsonc
{
  "agents": {
    "list": [
      { "id": "main", "default": true, "runtime": { "type": "embedded" } },
      {
        "id": "codex",
        "runtime": {
          "type": "acp",
          "acp": { "agent": "codex", "backend": "acpx", "mode": "persistent" },
        },
      },
      {
        "id": "claude",
        "runtime": {
          "type": "acp",
          "acp": { "agent": "claude", "backend": "acpx", "mode": "persistent" },
        },
      },
    ],
  },
  "acp": { "enabled": true, "backend": "acpx" },
  "bindings": [
    {
      "type": "route",
      "agentId": "main",
      "match": { "channel": "discord", "accountId": "default" },
    },
    {
      "type": "route",
      "agentId": "main",
      "match": { "channel": "telegram", "accountId": "default" },
    },

    {
      "type": "acp",
      "agentId": "codex",
      "match": {
        "channel": "discord",
        "accountId": "default",
        "peer": { "kind": "channel", "id": "222222222222222222" },
      },
    },
    {
      "type": "acp",
      "agentId": "claude",
      "match": {
        "channel": "discord",
        "accountId": "default",
        "peer": { "kind": "channel", "id": "333333333333333333" },
      },
    },
    {
      "type": "acp",
      "agentId": "codex",
      "match": {
        "channel": "telegram",
        "accountId": "default",
        "peer": { "kind": "group", "id": "-1009876543210:topic:5" },
      },
    },
  ],
}
```

备注：

- `bindings[].type` 是显式的：
  - `route`：正常的代理路由。
  - `acp`：匹配会话的持久 ACP 运行时绑定。
- 对于 `type: "acp"`，`match.peer.id` 是规范的会话键：
  - Discord 频道/线程：原始频道/线程 ID。
  - Telegram 话题：`chatId:topic:topicId`。
- `bindings[].acp.backend` 是可选的。后端回退顺序：
  1. `bindings[].acp.backend`
  2. `agents.list[].runtime.acp.backend`
  3. 全局 `acp.backend`
- `mode`、`cwd` 和 `label` 遵循相同的覆盖模式（`绑定覆盖 -> 代理运行时默认值 -> 全局/默认行为`）。
- 保留现有的 `session.threadBindings.*` 和 `channels.discord.threadBindings.*` 用于临时绑定策略。
- 持久条目声明期望状态；运行时协调到实际的 ACP 会话/绑定。
- 每个会话节点一个活跃的 ACP 绑定是预期模型。
- 向后兼容：缺少 `type` 的视为 `route` 以兼容旧版条目。

### 后端选择

- ACP 会话初始化在 spawn 期间已使用配置的后端选择（今天的 `acp.backend`）。
- 本提案扩展 spawn/协调逻辑以优先使用类型化的 ACP 绑定覆盖：
  - `bindings[].acp.backend` 用于会话级覆盖。
  - `agents.list[].runtime.acp.backend` 用于每代理默认值。
- 如果没有覆盖，保持当前行为（`acp.backend` 默认值）。

## 在当前系统中的架构适配

### 复用现有组件

- `SessionBindingService` 已支持频道无关的会话引用。
- ACP spawn/绑定流已通过服务 API 支持绑定。
- Telegram 已通过 `MessageThreadId` 和 `chatId` 携带话题/线程上下文。

### 新增/扩展组件

- **Telegram 绑定适配器**（与 Discord 适配器并行）：
  - 按 Telegram 账户注册适配器，
  - 按规范会话 ID 解析/列出/绑定/解绑/刷新。
- **类型化绑定解析器/索引**：
  - 将 `bindings[]` 拆分为 `route` 和 `acp` 视图，
  - `resolveAgentRoute` 仅在 `route` 绑定上，
  - 仅从 `acp` 绑定解析持久 ACP 意图。
- **Telegram 的入站绑定解析**：
  - 在路由最终确定前解析绑定会话（Discord 已做到这一点）。
- **持久绑定协调器**：
  - 启动时：加载配置的顶级 `type: "acp"` 绑定，确保 ACP 会话存在，确保绑定存在。
  - 配置变更时：安全地应用增量。
- **切换模型**：
  - 不读取频道本地 ACP 绑定后备，
  - 持久 ACP 绑定仅从顶级 `bindings[].type="acp"` 条目获取。

## 分阶段交付

### 阶段 1：类型化绑定模式基础

- 扩展配置模式以支持 `bindings[].type` 判别器：
  - `route`，
  - `acp` 带可选 `acp` 覆盖对象（`mode`、`backend`、`cwd`、`label`）。
- 扩展代理模式以带有运行时描述符标记 ACP 原生代理（`agents.list[].runtime.type`）。
- 添加路由 vs ACP 绑定的解析器/索引拆分。

### 阶段 2：运行时解析 + Discord/Telegram 对等

- 从顶级 `type: "acp"` 条目解析持久 ACP 绑定，用于：
  - Discord 频道/线程，
  - Telegram 论坛话题（`chatId:topic:topicId` 规范 ID）。
- 实现 Telegram 绑定适配器和入站绑定会话覆盖与 Discord 的对等。
- 本阶段不包含 Telegram 直接/私聊话题变体。

### 阶段 3：命令对等和重置

- 在绑定的 Telegram/Discord 会话中对齐 `/acp`、`/new`、`/reset` 和 `/focus` 的行为。
- 确保绑定按配置在重置流程中存活。

### 阶段 4：强化

- 更好的诊断（`/acp status`、启动协调日志）。
- 冲突处理和健康检查。

## 防护栏和策略

- 严格遵守 ACP 启用和沙箱限制，与当前一致。
- 保持显式的账户范围（`accountId`）以避免跨账户渗透。
- 在模糊路由时关闭失败。
- 保持每频道配置中提及/访问策略行为显式。

## 测试计划

- 单元测试：
  - 会话 ID 规范化（特别是 Telegram 话题 ID），
  - 协调器的创建/更新/删除路径，
  - `/acp bind --persist` 和解绑流程。
- 集成测试：
  - 入站 Telegram 话题 -> 绑定 ACP 会话解析，
  - 入站 Discord 频道/线程 -> 持久绑定优先级。
- 回归测试：
  - 临时绑定继续工作，
  - 未绑定的频道/话题保持当前路由行为。

## 开放问题

- `/acp spawn --thread auto` 在 Telegram 话题中是否应默认为 `here`？
- 持久绑定是否应始终在绑定会话中绕过提及门控，还是需要显式 `requireMention=false`？
- `/focus` 是否应获得 `--persist` 作为 `/acp bind --persist` 的别名？

## 推出

- 作为每会话的可选功能发布（存在 `bindings[].type="acp"` 条目）。
- 仅从 Discord + Telegram 开始。
- 添加带有以下示例的文档：
  - "每个代理一个频道/话题"
  - "同一代理的多个频道/话题使用不同的 `cwd`"
  - "团队命名模式（`codex-1`、`claude-repo-x`）"。
