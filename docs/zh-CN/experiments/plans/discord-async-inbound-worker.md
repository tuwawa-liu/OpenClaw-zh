---
summary: "将 Discord 网关监听器与长时间运行代理回合解耦的状态和后续步骤，使用 Discord 专用的入站 worker"
owner: "openclaw"
status: "in_progress"
last_updated: "2026-03-05"
title: "Discord 异步入站 Worker 计划"
---

# Discord 异步入站 Worker 计划

## 目标

通过使入站 Discord 回合异步化，消除 Discord 监听器超时作为面向用户的故障模式：

1. 网关监听器快速接受并规范化入站事件。
2. Discord 运行队列按与我们今天使用的相同排序边界键存储序列化作业。
3. Worker 在 Carbon 监听器生命周期之外执行实际代理回合。
4. 运行完成后将回复交付回原始频道或线程。

这是长期修复排队的 Discord 运行在 `channels.discord.eventQueue.listenerTimeout` 超时而代理运行本身仍在进行的问题。

## 当前状态

本计划已部分实现。

已完成：

- Discord 监听器超时和 Discord 运行超时现在是独立的设置。
- 已接受的入站 Discord 回合被排入 `src/discord/monitor/inbound-worker.ts`。
- Worker 现在拥有长时间运行的回合而不是 Carbon 监听器。
- 现有的每路由排序得到保留。
- Discord worker 路径存在超时回归覆盖。

简单来说：

- 生产超时 bug 已修复
- 长时间运行的回合不再仅因为 Discord 监听器预算到期而死亡
- worker 架构尚未完成

仍然缺失的：

- `DiscordInboundJob` 仍然只是部分规范化，仍携带实时运行时引用
- 命令语义（`stop`、`new`、`reset`、未来会话控制）尚未完全 worker 本地化
- worker 可观测性和运维状态仍然很少
- 仍然没有重启持久性

## 为什么存在这个计划

当前行为将完整的代理回合与监听器生命周期绑定：

- `src/discord/monitor/listeners.ts` 应用超时和中止边界。
- `src/discord/monitor/message-handler.ts` 将排队的运行保持在该边界内。
- `src/discord/monitor/message-handler.process.ts` 内联执行媒体加载、路由、分发、打字状态、草稿流和最终回复交付。

该架构有两个不好的特性：

- 长但健康的回合可能被监听器看门狗中止
- 即使下游运行时本会产生回复，用户也可能看不到回复

增加超时有帮助但不改变故障模式。

## 非目标

- 本轮不重新设计非 Discord 频道。
- 在首次实现中不将其扩展为通用的全频道 worker 框架。
- 尚不提取共享的跨频道入站 worker 抽象；仅在重复明显时共享低级原语。
- 首轮不添加持久崩溃恢复，除非安全着陆必需。
- 不改变路由选择、绑定语义或 ACP 策略。

## 当前约束

当前的 Discord 处理路径仍然依赖一些不应留在长期作业负载内的实时运行时对象：

- Carbon `Client`
- 原始 Discord 事件结构
- 内存中的公会历史映射
- 线程绑定管理器回调
- 实时打字和草稿流状态

我们已经将执行移到了 worker 队列上，但规范化边界仍然不完整。现在 worker 是"稍后在同一进程中运行，带有一些相同的实时对象"，而不是一个完全数据化的作业边界。

## 目标架构

### 1. 监听器阶段

`DiscordMessageListener` 仍然是入口点，但其工作变为：

- 运行预检和策略检查
- 将接受的输入规范化为可序列化的 `DiscordInboundJob`
- 将作业排入每会话或每频道的异步队列
- 排入成功后立即返回给 Carbon

监听器不应再拥有端到端的 LLM 回合生命周期。

### 2. 规范化的作业负载

引入一个可序列化的作业描述符，仅包含稍后运行回合所需的数据。

最小结构：

- 路由身份
  - `agentId`
  - `sessionKey`
  - `accountId`
  - `channel`
- 交付身份
  - 目标频道 ID
  - 回复目标消息 ID
  - 线程 ID（如果存在）
- 发送者身份
  - 发送者 ID、标签、用户名、tag
- 频道上下文
  - 公会 ID
  - 频道名称或 slug
  - 线程元数据
  - 解析的系统提示覆盖
- 规范化的消息体
  - 基础文本
  - 有效消息文本
  - 附件描述符或已解析的媒体引用
- 门控决策
  - 提及要求结果
  - 命令授权结果
  - 绑定会话或代理元数据（如适用）

作业负载不得包含实时 Carbon 对象或可变闭包。

当前实现状态：

- 部分完成
- `src/discord/monitor/inbound-job.ts` 已存在并定义了 worker 交接
- 负载仍包含实时 Discord 运行时上下文，应进一步精简

### 3. Worker 阶段

添加一个 Discord 专用的 worker 运行器，负责：

- 从 `DiscordInboundJob` 重建回合上下文
- 加载媒体和运行所需的任何额外频道元数据
- 分发代理回合
- 交付最终回复负载
- 更新状态和诊断

推荐位置：

- `src/discord/monitor/inbound-worker.ts`
- `src/discord/monitor/inbound-job.ts`

### 4. 排序模型

对于给定的路由边界，排序必须保持与当前等效。

推荐键：

- 使用与 `resolveDiscordRunQueueKey(...)` 相同的队列键逻辑

这保持了现有行为：

- 一个绑定代理的会话不会与自身交错
- 不同的 Discord 频道仍然可以独立进行

### 5. 超时模型

切换后有两个独立的超时类别：

- 监听器超时
  - 仅覆盖规范化和排入
  - 应该很短
- 运行超时
  - 可选的、worker 拥有的、显式的、用户可见的
  - 不应从 Carbon 监听器设置中意外继承

这消除了"Discord 网关监听器保持活跃"和"代理运行是否健康"之间的当前意外耦合。

## 推荐的实现阶段

### 阶段 1：规范化边界

- 状态：部分实现
- 已完成：
  - 提取了 `buildDiscordInboundJob(...)`
  - 添加了 worker 交接测试
- 剩余：
  - 使 `DiscordInboundJob` 仅为纯数据
  - 将实时运行时依赖移至 worker 拥有的服务而非每作业负载
  - 停止通过将实时监听器引用缝合回作业来重建进程上下文

### 阶段 2：内存 worker 队列

- 状态：已实现
- 已完成：
  - 添加了按解析的运行队列键分键的 `DiscordInboundWorkerQueue`
  - 监听器排入作业而不是直接等待 `processDiscordMessage(...)`
  - Worker 在进程内、仅内存中执行作业

这是第一个功能性切换。

### 阶段 3：进程拆分

- 状态：未开始
- 将交付、打字和草稿流所有权移至面向 worker 的适配器之后。
- 用 worker 上下文重建替换对实时预检上下文的直接使用。
- 如需要暂时保留 `processDiscordMessage(...)` 作为外观，然后拆分它。

### 阶段 4：命令语义

- 状态：未开始
  确保 Discord 原生命令在工作排队时仍然正确行为：

- `stop`
- `new`
- `reset`
- 任何未来的会话控制命令

Worker 队列必须公开足够的运行状态，使命令可以定位活跃或排队的回合。

### 阶段 5：可观测性和运维用户体验

- 状态：未开始
- 将队列深度和活跃 worker 计数发送到监控状态
- 记录排入时间、开始时间、完成时间和超时或取消原因
- 在日志中清晰地展示 worker 拥有的超时或交付失败

### 阶段 6：可选持久性后续

- 状态：未开始
  仅在内存版本稳定后：

- 决定排队的 Discord 作业是否应在网关重启后存活
- 如果是，持久化作业描述符和交付检查点
- 如果否，明确记录内存边界

这应该是单独的后续，除非着陆需要重启恢复。

## 文件影响

当前主要文件：

- `src/discord/monitor/listeners.ts`
- `src/discord/monitor/message-handler.ts`
- `src/discord/monitor/message-handler.preflight.ts`
- `src/discord/monitor/message-handler.process.ts`
- `src/discord/monitor/status.ts`

当前 worker 文件：

- `src/discord/monitor/inbound-job.ts`
- `src/discord/monitor/inbound-worker.ts`
- `src/discord/monitor/inbound-job.test.ts`
- `src/discord/monitor/message-handler.queue.test.ts`

可能的下一个接触点：

- `src/auto-reply/dispatch.ts`
- `src/discord/monitor/reply-delivery.ts`
- `src/discord/monitor/thread-bindings.ts`
- `src/discord/monitor/native-command.ts`

## 当前下一步

下一步是使 worker 边界成为真实而非部分的。

接下来做这些：

1. 将实时运行时依赖移出 `DiscordInboundJob`
2. 将这些依赖保留在 Discord worker 实例上
3. 将排队的作业减少为纯 Discord 特定数据：
   - 路由身份
   - 交付目标
   - 发送者信息
   - 规范化消息快照
   - 门控和绑定决策
4. 在 worker 内部从该纯数据重建 worker 执行上下文

实际上，这意味着：

- `client`
- `threadBindings`
- `guildHistories`
- `discordRestFetch`
- 其他可变的仅运行时句柄

应该停止存在于每个排队的作业上，转而存在于 worker 本身或 worker 拥有的适配器之后。

完成后，下一个后续应该是 `stop`、`new` 和 `reset` 的命令状态清理。

## 测试计划

保留以下现有的超时重现覆盖：

- `src/discord/monitor/message-handler.queue.test.ts`

添加新测试：

1. 监听器在排入后返回，无需等待完整回合
2. 保留每路由排序
3. 不同频道仍然并发运行
4. 回复交付到原始消息目的地
5. `stop` 取消活跃的 worker 拥有的运行
6. Worker 失败产生可见的诊断而不阻塞后续作业
7. ACP 绑定的 Discord 频道在 worker 执行下仍然正确路由

## 风险和缓解

- 风险：命令语义偏离当前同步行为
  缓解：在同一次切换中着陆命令状态管道，而不是以后

- 风险：回复交付丢失线程或回复目标上下文
  缓解：使交付身份成为 `DiscordInboundJob` 中的一等公民

- 风险：重试或队列重启期间的重复发送
  缓解：首轮保持仅内存，或在持久化之前添加显式交付幂等性

- 风险：`message-handler.process.ts` 在迁移期间变得更难理解
  缓解：在 worker 切换之前或期间拆分为规范化、执行和交付助手

## 验收标准

计划在以下条件下完成：

1. Discord 监听器超时不再中止健康的长时间运行回合。
2. 监听器生命周期和代理回合生命周期在代码中是独立概念。
3. 现有的每会话排序得到保留。
4. ACP 绑定的 Discord 频道通过相同的 worker 路径工作。
5. `stop` 定位 worker 拥有的运行而不是旧的监听器拥有的调用栈。
6. 超时和交付失败成为显式的 worker 结果，而不是静默的监听器丢弃。

## 剩余着陆策略

在后续 PR 中完成：

1. 使 `DiscordInboundJob` 仅为纯数据，将实时运行时引用移到 worker 上
2. 清理 `stop`、`new` 和 `reset` 的命令状态所有权
3. 添加 worker 可观测性和运维状态
4. 决定是否需要持久性，或明确记录内存边界

如果保持仅 Discord 专用且继续避免过早的跨频道 worker 抽象，这仍然是一个有界的后续工作。
