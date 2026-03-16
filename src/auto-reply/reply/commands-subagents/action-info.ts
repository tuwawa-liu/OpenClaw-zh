import { countPendingDescendantRuns } from "../../../agents/subagent-registry.js";
import { loadSessionStore, resolveStorePath } from "../../../config/sessions.js";
import { formatDurationCompact } from "../../../shared/subagents-format.js";
import type { CommandHandlerResult } from "../commands-types.js";
import { formatRunLabel } from "../subagents-utils.js";
import {
  type SubagentsCommandContext,
  formatTimestampWithAge,
  loadSubagentSessionEntry,
  resolveDisplayStatus,
  resolveSubagentEntryForToken,
  stopWithText,
} from "./shared.js";

export function handleSubagentsInfoAction(ctx: SubagentsCommandContext): CommandHandlerResult {
  const { params, runs, restTokens } = ctx;
  const target = restTokens[0];
  if (!target) {
    return stopWithText("ℹ️ 用法：/subagents info <id|#>");
  }

  const targetResolution = resolveSubagentEntryForToken(runs, target);
  if ("reply" in targetResolution) {
    return targetResolution.reply;
  }

  const run = targetResolution.entry;
  const { entry: sessionEntry } = loadSubagentSessionEntry(params, run.childSessionKey, {
    loadSessionStore,
    resolveStorePath,
  });
  const runtime =
    run.startedAt && Number.isFinite(run.startedAt)
      ? (formatDurationCompact((run.endedAt ?? Date.now()) - run.startedAt) ?? "n/a")
      : "n/a";
  const outcome = run.outcome
    ? `${run.outcome.status}${run.outcome.error ? ` (${run.outcome.error})` : ""}`
    : "n/a";

  const lines = [
    "ℹ️ 子代理信息",
    `状态：${resolveDisplayStatus(run, { pendingDescendants: countPendingDescendantRuns(run.childSessionKey) })}`,
    `标签：${formatRunLabel(run)}`,
    `任务：${run.task}`,
    `运行：${run.runId}`,
    `会话：${run.childSessionKey}`,
    `会话ID：${sessionEntry?.sessionId ?? "n/a"}`,
    `记录：${sessionEntry?.sessionFile ?? "n/a"}`,
    `运行时长：${runtime}`,
    `创建时间：${formatTimestampWithAge(run.createdAt)}`,
    `开始时间：${formatTimestampWithAge(run.startedAt)}`,
    `结束时间：${formatTimestampWithAge(run.endedAt)}`,
    `清理：${run.cleanup}`,
    run.archiveAtMs ? `归档：${formatTimestampWithAge(run.archiveAtMs)}` : undefined,
    run.cleanupHandled ? "清理已处理：是" : undefined,
    `结果：${outcome}`,
  ].filter(Boolean);

  return stopWithText(lines.join("\n"));
}
