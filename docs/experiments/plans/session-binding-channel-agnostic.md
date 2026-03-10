---
summary: "频道无关的会话绑定架构和迭代 1 交付范围"
read_when:
  - 重构频道无关的会话路由和绑定
  - 调查跨频道的重复、过期或缺失会话交付
owner: "onutc"
status: "in-progress"
last_updated: "2026-02-21"
title: "频道无关会话绑定计划"
---

# 频道无关会话绑定计划

## 概述

本文档定义了长期的频道无关会话绑定模型和下一个实现迭代的具体范围。

目标：

- 使子代理绑定会话路由成为核心功能
- 将频道特定行为保留在适配器中
- 避免正常 Discord 行为的回归

## 为什么存在这个计划

当前行为混合了：

- 补全内容策略
- 目标路由策略
- Discord 特定细节

这导致了以下边缘情况：

- 在并发运行的主频道和线程中重复交付
- 在复用绑定管理器时使用过期令牌
- webhook 发送缺少活动记账

## 迭代 1 范围

本迭代有意限制范围。

### 1. 添加频道无关的核心接口

添加绑定和路由的核心类型和服务接口。

提议的核心类型：

```ts
export type BindingTargetKind = "subagent" | "session";
export type BindingStatus = "active" | "ending" | "ended";

export type ConversationRef = {
  channel: string;
  accountId: string;
  conversationId: string;
  parentConversationId?: string;
};

export type SessionBindingRecord = {
  bindingId: string;
  targetSessionKey: string;
  targetKind: BindingTargetKind;
  conversation: ConversationRef;
  status: BindingStatus;
  boundAt: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
};
```

核心服务合约：

```ts
export interface SessionBindingService {
  bind(input: {
    targetSessionKey: string;
    targetKind: BindingTargetKind;
    conversation: ConversationRef;
    metadata?: Record<string, unknown>;
    ttlMs?: number;
  }): Promise<SessionBindingRecord>;

  listBySession(targetSessionKey: string): SessionBindingRecord[];
  resolveByConversation(ref: ConversationRef): SessionBindingRecord | null;
  touch(bindingId: string, at?: number): void;
  unbind(input: {
    bindingId?: string;
    targetSessionKey?: string;
    reason: string;
  }): Promise<SessionBindingRecord[]>;
}
```

### 2. 为子代理补全添加一个核心交付路由器

为补全事件添加单一的目标解析路径。

路由器合约：

```ts
export interface BoundDeliveryRouter {
  resolveDestination(input: {
    eventKind: "task_completion";
    targetSessionKey: string;
    requester?: ConversationRef;
    failClosed: boolean;
  }): {
    binding: SessionBindingRecord | null;
    mode: "bound" | "fallback";
    reason: string;
  };
}
```

在本迭代中：

- 只有 `task_completion` 通过此新路径路由
- 其他事件类型的现有路径保持原样

### 3. 保持 Discord 作为适配器

Discord 仍然是第一个适配器实现。

适配器职责：

- 创建/复用线程会话
- 通过 webhook 或频道发送发送绑定消息
- 验证线程状态（已归档/已删除）
- 映射适配器元数据（webhook 身份、线程 ID）

### 4. 修复当前已知的正确性问题

本迭代必须修复：

- 复用现有线程绑定管理器时刷新令牌使用
- 为基于 webhook 的 Discord 发送记录出站活动
- 在会话模式补全选择绑定线程目标时，停止隐式的主频道后备

### 5. 保持当前运行时安全默认值

对禁用线程绑定 spawn 的用户无行为变更。

默认值保持：

- `channels.discord.threadBindings.spawnSubagentSessions = false`

结果：

- 普通 Discord 用户保持当前行为
- 新核心路径仅影响已启用的绑定会话补全路由

## 不在迭代 1 中

明确推迟：

- ACP 绑定目标（`targetKind: "acp"`）
- Discord 之外的新频道适配器
- 全面替换所有交付路径（`spawn_ack`、未来的 `subagent_message`）
- 协议级变更
- 所有绑定持久性的存储迁移/版本重设计

关于 ACP 的说明：

- 接口设计为 ACP 保留了空间
- 本迭代不开始 ACP 实现

## 路由不变量

这些不变量在迭代 1 中是强制性的。

- 目标选择和内容生成是独立步骤
- 如果会话模式补全解析到活跃的绑定目标，交付必须针对该目标
- 不从绑定目标隐式重路由到主频道
- 后备行为必须是显式的且可观察的

## 兼容性和推出

兼容性目标：

- 对关闭线程绑定 spawn 的用户无回归
- 本迭代不改变非 Discord 频道

推出：

1. 在当前功能门控后着陆接口和路由器。
2. 通过路由器路由 Discord 补全模式绑定交付。
3. 保留非绑定流的旧路径。
4. 通过定向测试和金丝雀运行时日志验证。

## 迭代 1 所需的测试

所需的单元和集成覆盖：

- 管理器令牌轮换在管理器复用后使用最新令牌
- webhook 发送更新频道活动时间戳
- 同一请求者频道中两个活跃的绑定会话不重复到主频道
- 绑定会话模式运行的补全仅解析到线程目标
- 禁用 spawn 标志保持旧行为不变

## 提议的实现文件

核心：

- `src/infra/outbound/session-binding-service.ts`（新建）
- `src/infra/outbound/bound-delivery-router.ts`（新建）
- `src/agents/subagent-announce.ts`（补全目标解析集成）

Discord 适配器和运行时：

- `src/discord/monitor/thread-bindings.manager.ts`
- `src/discord/monitor/reply-delivery.ts`
- `src/discord/send.outbound.ts`

测试：

- `src/discord/monitor/provider*.test.ts`
- `src/discord/monitor/reply-delivery.test.ts`
- `src/agents/subagent-announce.format.test.ts`

## 迭代 1 完成标准

- 核心接口已存在并用于补全路由
- 上述正确性修复已合并并带有测试
- 会话模式绑定运行中无主频道和线程的重复补全交付
- 禁用绑定 spawn 的部署无行为变更
- ACP 明确推迟
