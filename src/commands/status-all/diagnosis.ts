import { t } from "../../i18n/index.js";
import type { ProgressReporter } from "../../cli/progress.js";
import { formatConfigIssueLine } from "../../config/issue-format.js";
import { resolveGatewayLogPaths } from "../../daemon/launchd.js";
import { formatPortDiagnostics } from "../../infra/ports.js";
import {
  type RestartSentinelPayload,
  summarizeRestartSentinel,
} from "../../infra/restart-sentinel.js";
import {
  formatPluginCompatibilityNotice,
  type PluginCompatibilityNotice,
} from "../../plugins/status.js";
import { formatTimeAgo, redactSecrets } from "./format.js";
import { readFileTailLines, summarizeLogTail } from "./gateway.js";

type ConfigIssueLike = { path: string; message: string };
type ConfigSnapshotLike = {
  exists: boolean;
  valid: boolean;
  path?: string | null;
  legacyIssues?: ConfigIssueLike[] | null;
  issues?: ConfigIssueLike[] | null;
};

type PortUsageLike = { listeners: unknown[] };

type TailscaleStatusLike = {
  backendState: string | null;
  dnsName: string | null;
  ips: string[];
  error: string | null;
};

type SkillStatusLike = {
  workspaceDir: string;
  skills: Array<{ eligible: boolean; missing: Record<string, unknown[]> }>;
};

type ChannelIssueLike = {
  channel: string;
  accountId: string;
  kind: string;
  message: string;
  fix?: string;
};

export async function appendStatusAllDiagnosis(params: {
  lines: string[];
  progress: ProgressReporter;
  muted: (text: string) => string;
  ok: (text: string) => string;
  warn: (text: string) => string;
  fail: (text: string) => string;
  connectionDetailsForReport: string;
  snap: ConfigSnapshotLike | null;
  remoteUrlMissing: boolean;
  secretDiagnostics: string[];
  sentinel: { payload?: RestartSentinelPayload | null } | null;
  lastErr: string | null;
  port: number;
  portUsage: PortUsageLike | null;
  tailscaleMode: string;
  tailscale: TailscaleStatusLike;
  tailscaleHttpsUrl: string | null;
  skillStatus: SkillStatusLike | null;
  pluginCompatibility: PluginCompatibilityNotice[];
  channelsStatus: unknown;
  channelIssues: ChannelIssueLike[];
  gatewayReachable: boolean;
  health: unknown;
}) {
  const { lines, muted, ok, warn, fail } = params;

  const emitCheck = (label: string, status: "ok" | "warn" | "fail") => {
    const icon = status === "ok" ? ok("✓") : status === "warn" ? warn("!") : fail("✗");
    const colored = status === "ok" ? ok(label) : status === "warn" ? warn(label) : fail(label);
    lines.push(`${icon} ${colored}`);
  };

  lines.push("");
  lines.push(muted(t("statusAllDiagnosis.gatewayConnectionDetails")));
  for (const line of redactSecrets(params.connectionDetailsForReport)
    .split("\n")
    .map((l) => l.trimEnd())) {
    lines.push(`  ${muted(line)}`);
  }

  lines.push("");
  if (params.snap) {
    const status = !params.snap.exists ? "fail" : params.snap.valid ? "ok" : "warn";
    emitCheck(t("statusAllDiagnosis.configLabel", { path: params.snap.path ?? t("statusAllDiagnosis.configUnknownPath") }), status);
    const issues = [...(params.snap.legacyIssues ?? []), ...(params.snap.issues ?? [])];
    const uniqueIssues = issues.filter(
      (issue, index) =>
        issues.findIndex((x) => x.path === issue.path && x.message === issue.message) === index,
    );
    for (const issue of uniqueIssues.slice(0, 12)) {
      lines.push(`  ${formatConfigIssueLine(issue, "-")}`);
    }
    if (uniqueIssues.length > 12) {
      lines.push(`  ${muted(t("statusAllDiagnosis.moreIssues", { count: String(uniqueIssues.length - 12) }))}`);
    }
  } else {
    emitCheck(t("statusAllDiagnosis.configReadFailed"), "warn");
  }

  if (params.remoteUrlMissing) {
    lines.push("");
    emitCheck(t("statusAllDiagnosis.remoteMisconfigured"), "warn");
    lines.push(`  ${muted(t("statusAllDiagnosis.remoteMisconfiguredFix"))}`);
  }

  emitCheck(
    `Secret diagnostics (${params.secretDiagnostics.length})`,
    params.secretDiagnostics.length === 0 ? "ok" : "warn",
  );
  for (const diagnostic of params.secretDiagnostics.slice(0, 10)) {
    lines.push(`  - ${muted(redactSecrets(diagnostic))}`);
  }
  if (params.secretDiagnostics.length > 10) {
    lines.push(`  ${muted(`… +${params.secretDiagnostics.length - 10} more`)}`);
  }

  if (params.sentinel?.payload) {
    emitCheck(t("statusAllDiagnosis.restartSentinelPresent"), "warn");
    lines.push(
      `  ${muted(`${summarizeRestartSentinel(params.sentinel.payload)} · ${formatTimeAgo(Date.now() - params.sentinel.payload.ts)}`)}`,
    );
  } else {
    emitCheck(t("statusAllDiagnosis.restartSentinelNone"), "ok");
  }

  const lastErrClean = params.lastErr?.trim() ?? "";
  const isTrivialLastErr = lastErrClean.length < 8 || lastErrClean === "}" || lastErrClean === "{";
  if (lastErrClean && !isTrivialLastErr) {
    lines.push("");
    lines.push(muted(t("statusAllDiagnosis.gatewayLastLogLine")));
    lines.push(`  ${muted(redactSecrets(lastErrClean))}`);
  }

  if (params.portUsage) {
    const portOk = params.portUsage.listeners.length === 0;
    emitCheck(t("statusAllDiagnosis.portLabel", { port: String(params.port) }), portOk ? "ok" : "warn");
    if (!portOk) {
      for (const line of formatPortDiagnostics(params.portUsage as never)) {
        lines.push(`  ${muted(line)}`);
      }
    }
  }

  {
    const backend = params.tailscale.backendState ?? "unknown";
    const okBackend = backend === "Running";
    const hasDns = Boolean(params.tailscale.dnsName);
    const label =
      params.tailscaleMode === "off"
        ? `${t("statusAllDiagnosis.tailscaleOff", { backend })}${params.tailscale.dnsName ? ` · ${params.tailscale.dnsName}` : ""}`
        : `${t("statusAllDiagnosis.tailscaleMode", { mode: params.tailscaleMode, backend })}${params.tailscale.dnsName ? ` · ${params.tailscale.dnsName}` : ""}`;
    emitCheck(label, okBackend && (params.tailscaleMode === "off" || hasDns) ? "ok" : "warn");
    if (params.tailscale.error) {
      lines.push(`  ${muted(t("statusAllDiagnosis.errorPrefix", { error: params.tailscale.error }))}`);
    }
    if (params.tailscale.ips.length > 0) {
      lines.push(
        `  ${muted(t("statusAllDiagnosis.ipsPrefix", { ips: params.tailscale.ips.slice(0, 3).join(", ") + (params.tailscale.ips.length > 3 ? "…" : "") }))}`,
      );
    }
    if (params.tailscaleHttpsUrl) {
      lines.push(`  ${muted(t("statusAllDiagnosis.httpsPrefix", { url: params.tailscaleHttpsUrl }))}`);
    }
  }

  if (params.skillStatus) {
    const eligible = params.skillStatus.skills.filter((s) => s.eligible).length;
    const missing = params.skillStatus.skills.filter(
      (s) => s.eligible && Object.values(s.missing).some((arr) => arr.length),
    ).length;
    emitCheck(
      t("statusAllDiagnosis.skillsLabel", { eligible: String(eligible), missing: String(missing), workspaceDir: params.skillStatus.workspaceDir }),
      missing === 0 ? "ok" : "warn",
    );
  }

  emitCheck(
    `Plugin compatibility (${params.pluginCompatibility.length || "none"})`,
    params.pluginCompatibility.length === 0 ? "ok" : "warn",
  );
  for (const notice of params.pluginCompatibility.slice(0, 12)) {
    const severity = notice.severity === "warn" ? "warn" : "info";
    lines.push(`  - [${severity}] ${formatPluginCompatibilityNotice(notice)}`);
  }
  if (params.pluginCompatibility.length > 12) {
    lines.push(`  ${muted(`… +${params.pluginCompatibility.length - 12} more`)}`);
  }

  params.progress.setLabel("Reading logs…");
  const logPaths = (() => {
    try {
      return resolveGatewayLogPaths(process.env);
    } catch {
      return null;
    }
  })();
  if (logPaths) {
    params.progress.setLabel(t("statusAllDiagnosis.readingLogs"));
    const [stderrTail, stdoutTail] = await Promise.all([
      readFileTailLines(logPaths.stderrPath, 40).catch(() => []),
      readFileTailLines(logPaths.stdoutPath, 40).catch(() => []),
    ]);
    if (stderrTail.length > 0 || stdoutTail.length > 0) {
      lines.push("");
      lines.push(muted(t("statusAllDiagnosis.gatewayLogsTail", { logDir: logPaths.logDir })));
      lines.push(`  ${muted(t("statusAllDiagnosis.stderrLabel", { path: logPaths.stderrPath }))}`);
      for (const line of summarizeLogTail(stderrTail, { maxLines: 22 }).map(redactSecrets)) {
        lines.push(`  ${muted(line)}`);
      }
      lines.push(`  ${muted(t("statusAllDiagnosis.stdoutLabel", { path: logPaths.stdoutPath }))}`);
      for (const line of summarizeLogTail(stdoutTail, { maxLines: 22 }).map(redactSecrets)) {
        lines.push(`  ${muted(line)}`);
      }
    }
  }
  params.progress.tick();

  if (params.channelsStatus) {
    emitCheck(
      t("statusAllDiagnosis.channelIssuesLabel", { count: params.channelIssues.length ? String(params.channelIssues.length) : t("statusAllDiagnosis.channelIssuesNone") }),
      params.channelIssues.length === 0 ? "ok" : "warn",
    );
    for (const issue of params.channelIssues.slice(0, 12)) {
      const fixText = issue.fix ? ` · fix: ${issue.fix}` : "";
      lines.push(
        `  - ${issue.channel}[${issue.accountId}] ${issue.kind}: ${issue.message}${fixText}`,
      );
    }
    if (params.channelIssues.length > 12) {
      lines.push(`  ${muted(`… +${params.channelIssues.length - 12} more`)}`);
    }
  } else {
    emitCheck(
      params.gatewayReachable ? t("statusAllDiagnosis.channelIssuesSkippedQueryFailed") : t("statusAllDiagnosis.channelIssuesSkippedUnreachable"),
      "warn",
    );
  }

  const healthErr = (() => {
    if (!params.health || typeof params.health !== "object") {
      return "";
    }
    const record = params.health as Record<string, unknown>;
    if (!("error" in record)) {
      return "";
    }
    const value = record.error;
    if (!value) {
      return "";
    }
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return t("statusAllDiagnosis.unserializableError");
    }
  })();
  if (healthErr) {
    lines.push("");
    lines.push(muted(t("statusAllDiagnosis.gatewayHealth")));
    lines.push(`  ${muted(redactSecrets(healthErr))}`);
  }

  lines.push("");
  lines.push(muted(t("statusAllDiagnosis.pasteableReport")));
  lines.push(t("statusAllDiagnosis.troubleshooting"));
  lines.push("");
}
