import { t } from "../i18n/index.js";
import { formatTimeAgo } from "../infra/format-time/format-relative.ts";
import { formatTokenCount } from "../utils/usage-format.js";
import { formatContextUsageLine } from "./tui-formatters.js";
import type { GatewayStatusSummary } from "./tui-types.js";

export function formatStatusSummary(summary: GatewayStatusSummary) {
  const lines: string[] = [];
  lines.push(t("gtwStatus.title"));
  if (summary.runtimeVersion) {
    lines.push(`${t("gtwStatus.version")}: ${summary.runtimeVersion}`);
  }

  if (!summary.linkChannel) {
    lines.push(t("gtwStatus.linkUnknown"));
  } else {
    const linkLabel = summary.linkChannel.label ?? "Link channel";
    const linked = summary.linkChannel.linked === true;
    const authAge =
      linked && typeof summary.linkChannel.authAgeMs === "number"
        ? ` (${t("gtwStatus.lastRefreshed", { ago: formatTimeAgo(summary.linkChannel.authAgeMs) })})`
        : "";
    lines.push(`${linkLabel}: ${linked ? t("gtwStatus.linked") : t("gtwStatus.notLinked")}${authAge}`);
  }

  const providerSummary = Array.isArray(summary.providerSummary) ? summary.providerSummary : [];
  if (providerSummary.length > 0) {
    lines.push("");
    lines.push(t("gtwStatus.systemSection"));
    for (const line of providerSummary) {
      lines.push(`  ${line}`);
    }
  }

  const heartbeatAgents = summary.heartbeat?.agents ?? [];
  if (heartbeatAgents.length > 0) {
    const heartbeatParts = heartbeatAgents.map((agent) => {
      const agentId = agent.agentId ?? "unknown";
      if (!agent.enabled || !agent.everyMs) {
        return t("gtwStatus.disabled", { agentId });
      }
      return `${agent.every ?? "unknown"} (${agentId})`;
    });
    lines.push("");
    lines.push(t("gtwStatus.heartbeat", { parts: heartbeatParts.join(", ") }));
  }

  const sessionPaths = summary.sessions?.paths ?? [];
  if (sessionPaths.length === 1) {
    lines.push(t("gtwStatus.sessionStore", { path: sessionPaths[0] }));
  } else if (sessionPaths.length > 1) {
    lines.push(t("gtwStatus.sessionStores", { count: String(sessionPaths.length) }));
  }

  const defaults = summary.sessions?.defaults;
  const defaultModel = defaults?.model ?? "unknown";
  const defaultCtx =
    typeof defaults?.contextTokens === "number"
      ? ` (${formatTokenCount(defaults.contextTokens)} ctx)`
      : "";
  lines.push(t("gtwStatus.defaultModel", { model: defaultModel, ctx: defaultCtx }));

  const sessionCount = summary.sessions?.count ?? 0;
  lines.push(t("gtwStatus.activeSessions", { count: String(sessionCount) }));

  const recent = Array.isArray(summary.sessions?.recent) ? summary.sessions?.recent : [];
  if (recent.length > 0) {
    lines.push(t("gtwStatus.recentSessions"));
    for (const entry of recent) {
      const ageLabel = typeof entry.age === "number" ? formatTimeAgo(entry.age) : t("gtwStatus.noActivity");
      const model = entry.model ?? "unknown";
      const usage = formatContextUsageLine({
        total: entry.totalTokens ?? null,
        context: entry.contextTokens ?? null,
        remaining: entry.remainingTokens ?? null,
        percent: entry.percentUsed ?? null,
      });
      const flags = entry.flags?.length ? ` | flags: ${entry.flags.join(", ")}` : "";
      lines.push(
        `- ${entry.key}${entry.kind ? ` [${entry.kind}]` : ""} | ${ageLabel} | model ${model} | ${usage}${flags}`,
      );
    }
  }

  const queued = Array.isArray(summary.queuedSystemEvents) ? summary.queuedSystemEvents : [];
  if (queued.length > 0) {
    const preview = queued.slice(0, 3).join(" | ");
    lines.push(t("gtwStatus.queuedEvents", { count: String(queued.length), preview }));
  }

  return lines;
}
