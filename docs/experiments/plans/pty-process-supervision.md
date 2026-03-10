---
summary: "可靠交互式进程监管（PTY + 非 PTY）的生产计划，包含显式所有权、统一生命周期和确定性清理"
read_when:
  - 处理 exec/进程生命周期所有权和清理
  - 调试 PTY 和非 PTY 监管行为
owner: "openclaw"
status: "in-progress"
last_updated: "2026-02-15"
title: "PTY 和进程监管计划"
---

# PTY 和进程监管计划

## 1. 问题和目标

我们需要一个可靠的长时间运行命令执行生命周期，覆盖：

- `exec` 前台运行
- `exec` 后台运行
- `process` 后续操作（`poll`、`log`、`send-keys`、`paste`、`submit`、`kill`、`remove`）
- CLI 代理运行器子进程

目标不仅仅是支持 PTY。目标是可预测的所有权、取消、超时和清理，不使用不安全的进程匹配启发式。

## 2. 范围和边界

- 将实现保持在 `src/process/supervisor` 内部。
- 不为此创建新包。
- 在实际可行的情况下保持当前行为兼容性。
- 不扩展范围到终端回放或 tmux 风格的会话持久化。

## 3. 本分支中已实现的内容

### 监管器基线已就位

- 监管器模块已存在于 `src/process/supervisor/*` 下。
- Exec 运行时和 CLI 运行器已通过监管器 spawn 和 wait 路由。
- 注册表终结化是幂等的。

### 本轮已完成

1. 显式 PTY 命令合约

- `SpawnInput` 现在是 `src/process/supervisor/types.ts` 中的判别联合类型。
- PTY 运行需要 `ptyCommand` 而不是复用通用 `argv`。
- 监管器不再在 `src/process/supervisor/supervisor.ts` 中从 argv 连接重建 PTY 命令字符串。
- Exec 运行时现在在 `src/agents/bash-tools.exec-runtime.ts` 中直接传递 `ptyCommand`。

2. 进程层类型解耦

- 监管器类型不再从 agents 导入 `SessionStdin`。
- 进程本地 stdin 合约位于 `src/process/supervisor/types.ts`（`ManagedRunStdin`）。
- 适配器现在仅依赖进程级类型：
  - `src/process/supervisor/adapters/child.ts`
  - `src/process/supervisor/adapters/pty.ts`

3. 进程工具生命周期所有权改进

- `src/agents/bash-tools.process.ts` 现在首先通过监管器请求取消。
- `process kill/remove` 现在在监管器查找未命中时使用进程树后备终止。
- `remove` 通过在请求终止后立即删除运行中的会话条目，保持确定性的 remove 行为。

4. 单一来源看门狗默认值

- 在 `src/agents/cli-watchdog-defaults.ts` 中添加了共享默认值。
- `src/agents/cli-backends.ts` 使用共享默认值。
- `src/agents/cli-runner/reliability.ts` 使用相同的共享默认值。

5. 废弃助手清理

- 从 `src/agents/bash-tools.shared.ts` 中移除了未使用的 `killSession` 助手路径。

6. 添加了直接监管器路径测试

- 添加了 `src/agents/bash-tools.process.supervisor.test.ts` 以覆盖通过监管器取消的 kill 和 remove 路由。

7. 可靠性缺口修复已完成

- `src/agents/bash-tools.process.ts` 现在在监管器查找未命中时回退到真实的操作系统级进程终止。
- `src/process/supervisor/adapters/child.ts` 现在对默认的取消/超时终止路径使用进程树终止语义。
- 在 `src/process/kill-tree.ts` 中添加了共享的进程树工具。

8. 添加了 PTY 合约边缘情况覆盖

- 添加了 `src/process/supervisor/supervisor.pty-command.test.ts` 用于原样 PTY 命令转发和空命令拒绝。
- 添加了 `src/process/supervisor/adapters/child.test.ts` 用于子适配器取消中的进程树终止行为。

## 4. 剩余缺口和决策

### 可靠性状态

本轮所需的两个可靠性缺口现已关闭：

- `process kill/remove` 现在在监管器查找未命中时有真实的操作系统终止后备。
- 子进程取消/超时现在对默认终止路径使用进程树终止语义。
- 两种行为都添加了回归测试。

### 持久性和启动协调

重启行为现在明确定义为仅内存生命周期。

- `reconcileOrphans()` 在 `src/process/supervisor/supervisor.ts` 中设计意图上保持无操作。
- 活跃运行在进程重启后不会被恢复。
- 此边界在本实现轮次中是有意为之，以避免部分持久化风险。

### 可维护性后续

1. `src/agents/bash-tools.exec-runtime.ts` 中的 `runExecProcess` 仍然承担多个职责，可以在后续中拆分为专注的助手。

## 5. 实现计划

所需可靠性和合约项的实现轮次已完成。

已完成：

- `process kill/remove` 后备真实终止
- 子适配器默认终止路径的进程树取消
- 后备终止和子适配器终止路径的回归测试
- 显式 `ptyCommand` 下的 PTY 命令边缘情况测试
- 显式内存重启边界，`reconcileOrphans()` 设计意图上为无操作

可选后续：

- 拆分 `runExecProcess` 为专注的助手，不产生行为偏移

## 6. 文件映射

### 进程监管器

- `src/process/supervisor/types.ts` 更新了判别 spawn 输入和进程本地 stdin 合约。
- `src/process/supervisor/supervisor.ts` 更新为使用显式 `ptyCommand`。
- `src/process/supervisor/adapters/child.ts` 和 `src/process/supervisor/adapters/pty.ts` 从代理类型解耦。
- `src/process/supervisor/registry.ts` 幂等终结化保持不变。

### Exec 和进程集成

- `src/agents/bash-tools.exec-runtime.ts` 更新为显式传递 PTY 命令并保留后备路径。
- `src/agents/bash-tools.process.ts` 更新为通过监管器取消并带有真实进程树后备终止。
- `src/agents/bash-tools.shared.ts` 移除了直接终止助手路径。

### CLI 可靠性

- `src/agents/cli-watchdog-defaults.ts` 添加为共享基线。
- `src/agents/cli-backends.ts` 和 `src/agents/cli-runner/reliability.ts` 现在使用相同的默认值。

## 7. 本轮验证运行

单元测试：

- `pnpm vitest src/process/supervisor/registry.test.ts`
- `pnpm vitest src/process/supervisor/supervisor.test.ts`
- `pnpm vitest src/process/supervisor/supervisor.pty-command.test.ts`
- `pnpm vitest src/process/supervisor/adapters/child.test.ts`
- `pnpm vitest src/agents/cli-backends.test.ts`
- `pnpm vitest src/agents/bash-tools.exec.pty-cleanup.test.ts`
- `pnpm vitest src/agents/bash-tools.process.poll-timeout.test.ts`
- `pnpm vitest src/agents/bash-tools.process.supervisor.test.ts`
- `pnpm vitest src/process/exec.test.ts`

端到端目标：

- `pnpm vitest src/agents/cli-runner.test.ts`
- `pnpm vitest run src/agents/bash-tools.exec.pty-fallback.test.ts src/agents/bash-tools.exec.background-abort.test.ts src/agents/bash-tools.process.send-keys.test.ts`

类型检查说明：

- 在此仓库中使用 `pnpm build`（完整 lint/文档门控使用 `pnpm check`）。之前提到 `pnpm tsgo` 的旧说明已过时。

## 8. 保留的运行保证

- Exec 环境加固行为不变。
- 审批和允许列表流程不变。
- 输出净化和输出上限不变。
- PTY 适配器仍然保证在强制终止时等待结算和监听器处置。

## 9. 完成定义

1. 监管器是受管运行的生命周期所有者。
2. PTY spawn 使用显式命令合约，无 argv 重构。
3. 进程层对监管器 stdin 合约没有对代理层的类型依赖。
4. 看门狗默认值为单一来源。
5. 目标单元和端到端测试保持绿色。
6. 重启持久性边界已明确记录或完全实现。

## 10. 总结

本分支现在具有连贯且更安全的监管形态：

- 显式 PTY 合约
- 更清洁的进程分层
- 进程操作的监管器驱动取消路径
- 监管器查找未命中时的真实后备终止
- 子运行默认终止路径的进程树取消
- 统一的看门狗默认值
- 显式内存重启边界（本轮不跨重启进行孤儿协调）
