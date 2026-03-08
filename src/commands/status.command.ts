import { formatCliCommand } from "../cli/command-format.js";
import { withProgress } from "../cli/progress.js";
import { resolveGatewayPort } from "../config/config.js";
import { buildGatewayConnectionDetails, callGateway } from "../gateway/call.js";
import { info } from "../globals.js";
import { formatTimeAgo } from "../infra/format-time/format-relative.ts";
import type { HeartbeatEventPayload } from "../infra/heartbeat-events.js";
import { formatUsageReportLines, loadProviderUsageSummary } from "../infra/provider-usage.js";
import { normalizeUpdateChannel, resolveUpdateChannelDisplay } from "../infra/update-channels.js";
import { formatGitInstallLabel } from "../infra/update-check.js";
import { t } from "../i18n/index.js";
import {
  resolveMemoryCacheSummary,
  resolveMemoryFtsState,
  resolveMemoryVectorState,
  type Tone,
} from "../memory/status-format.js";
import type { RuntimeEnv } from "../runtime.js";
import { runSecurityAudit } from "../security/audit.js";
import { renderTable } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";
import { formatHealthChannelLines, type HealthSummary } from "./health.js";
import { resolveControlUiLinks } from "./onboard-helpers.js";
import { statusAllCommand } from "./status-all.js";
import { groupChannelIssuesByChannel } from "./status-all/channel-issues.js";
import { formatGatewayAuthUsed } from "./status-all/format.js";
import { getDaemonStatusSummary, getNodeDaemonStatusSummary } from "./status.daemon.js";
import {
  formatDuration,
  formatKTokens,
  formatTokensCompact,
  shortenText,
} from "./status.format.js";
import { scanStatus } from "./status.scan.js";
import {
  formatUpdateAvailableHint,
  formatUpdateOneLiner,
  resolveUpdateAvailability,
} from "./status.update.js";

function resolvePairingRecoveryContext(params: {
  error?: string | null;
  closeReason?: string | null;
}): { requestId: string | null } | null {
  const sanitizeRequestId = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    // Keep CLI guidance injection-safe: allow only compact id characters.
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(trimmed)) {
      return null;
    }
    return trimmed;
  };
  const source = [params.error, params.closeReason]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join(" ");
  if (!source || !/pairing required/i.test(source)) {
    return null;
  }
  const requestIdMatch = source.match(/requestId:\s*([^\s)]+)/i);
  const requestId =
    requestIdMatch && requestIdMatch[1] ? sanitizeRequestId(requestIdMatch[1]) : null;
  return { requestId: requestId || null };
}

export async function statusCommand(
  opts: {
    json?: boolean;
    deep?: boolean;
    usage?: boolean;
    timeoutMs?: number;
    verbose?: boolean;
    all?: boolean;
  },
  runtime: RuntimeEnv,
) {
  if (opts.all && !opts.json) {
    await statusAllCommand(runtime, { timeoutMs: opts.timeoutMs });
    return;
  }

  const scan = await scanStatus(
    { json: opts.json, timeoutMs: opts.timeoutMs, all: opts.all },
    runtime,
  );
  const securityAudit = opts.json
    ? await runSecurityAudit({
        config: scan.cfg,
        sourceConfig: scan.sourceConfig,
        deep: false,
        includeFilesystem: true,
        includeChannelSecurity: true,
      })
    : await withProgress(
        {
          label: t("commands.status.securityAudit"),
          indeterminate: true,
          enabled: true,
        },
        async () =>
          await runSecurityAudit({
            config: scan.cfg,
            sourceConfig: scan.sourceConfig,
            deep: false,
            includeFilesystem: true,
            includeChannelSecurity: true,
          }),
      );
  const {
    cfg,
    osSummary,
    tailscaleMode,
    tailscaleDns,
    tailscaleHttpsUrl,
    update,
    gatewayConnection,
    remoteUrlMissing,
    gatewayMode,
    gatewayProbeAuth,
    gatewayProbeAuthWarning,
    gatewayProbe,
    gatewayReachable,
    gatewaySelf,
    channelIssues,
    agentStatus,
    channels,
    summary,
    secretDiagnostics,
    memory,
    memoryPlugin,
  } = scan;

  const usage = opts.usage
    ? await withProgress(
        {
          label: t("commands.status.fetchUsage"),
          indeterminate: true,
          enabled: opts.json !== true,
        },
        async () => await loadProviderUsageSummary({ timeoutMs: opts.timeoutMs }),
      )
    : undefined;
  const health: HealthSummary | undefined = opts.deep
    ? await withProgress(
        {
          label: t("commands.status.checkHealth"),
          indeterminate: true,
          enabled: opts.json !== true,
        },
        async () =>
          await callGateway<HealthSummary>({
            method: "health",
            params: { probe: true },
            timeoutMs: opts.timeoutMs,
            config: scan.cfg,
          }),
      )
    : undefined;
  const lastHeartbeat =
    opts.deep && gatewayReachable
      ? await callGateway<HeartbeatEventPayload | null>({
          method: "last-heartbeat",
          params: {},
          timeoutMs: opts.timeoutMs,
          config: scan.cfg,
        }).catch(() => null)
      : null;

  const configChannel = normalizeUpdateChannel(cfg.update?.channel);
  const channelInfo = resolveUpdateChannelDisplay({
    configChannel,
    installKind: update.installKind,
    gitTag: update.git?.tag ?? null,
    gitBranch: update.git?.branch ?? null,
  });

  if (opts.json) {
    const [daemon, nodeDaemon] = await Promise.all([
      getDaemonStatusSummary(),
      getNodeDaemonStatusSummary(),
    ]);
    runtime.log(
      JSON.stringify(
        {
          ...summary,
          os: osSummary,
          update,
          updateChannel: channelInfo.channel,
          updateChannelSource: channelInfo.source,
          memory,
          memoryPlugin,
          gateway: {
            mode: gatewayMode,
            url: gatewayConnection.url,
            urlSource: gatewayConnection.urlSource,
            misconfigured: remoteUrlMissing,
            reachable: gatewayReachable,
            connectLatencyMs: gatewayProbe?.connectLatencyMs ?? null,
            self: gatewaySelf,
            error: gatewayProbe?.error ?? null,
            authWarning: gatewayProbeAuthWarning ?? null,
          },
          gatewayService: daemon,
          nodeService: nodeDaemon,
          agents: agentStatus,
          securityAudit,
          secretDiagnostics,
          ...(health || usage || lastHeartbeat ? { health, usage, lastHeartbeat } : {}),
        },
        null,
        2,
      ),
    );
    return;
  }

  const rich = true;
  const muted = (value: string) => (rich ? theme.muted(value) : value);
  const ok = (value: string) => (rich ? theme.success(value) : value);
  const warn = (value: string) => (rich ? theme.warn(value) : value);

  if (opts.verbose) {
    const details = buildGatewayConnectionDetails({ config: scan.cfg });
    runtime.log(info(t("commands.status.gatewayConnection")));
    for (const line of details.message.split("\n")) {
      runtime.log(`  ${line}`);
    }
    runtime.log("");
  }

  const tableWidth = Math.max(60, (process.stdout.columns ?? 120) - 1);

  if (secretDiagnostics.length > 0) {
    runtime.log(theme.warn("Secret diagnostics:"));
    for (const entry of secretDiagnostics) {
      runtime.log(`- ${entry}`);
    }
    runtime.log("");
  }

  const dashboard = (() => {
    const controlUiEnabled = cfg.gateway?.controlUi?.enabled ?? true;
    if (!controlUiEnabled) {
      return t("statusCommand.disabled");
    }
    const links = resolveControlUiLinks({
      port: resolveGatewayPort(cfg),
      bind: cfg.gateway?.bind,
      customBindHost: cfg.gateway?.customBindHost,
      basePath: cfg.gateway?.controlUi?.basePath,
    });
    return links.httpUrl;
  })();

  const gatewayValue = (() => {
    const target = remoteUrlMissing
      ? t("statusCommand.fallback", { url: gatewayConnection.url })
      : `${gatewayConnection.url}${gatewayConnection.urlSource ? ` (${gatewayConnection.urlSource})` : ""}`;
    const reach = remoteUrlMissing
      ? warn(t("statusCommand.misconfiguredRemote"))
      : gatewayReachable
        ? ok(t("statusCommand.reachable", { duration: formatDuration(gatewayProbe?.connectLatencyMs) }))
        : warn(gatewayProbe?.error ? t("statusCommand.unreachableDetail", { error: gatewayProbe.error }) : t("statusCommand.unreachable"));
    const auth =
      gatewayReachable && !remoteUrlMissing
        ? t("statusCommand.authLabel", { auth: formatGatewayAuthUsed(gatewayProbeAuth) })
        : "";
    const self =
      gatewaySelf?.host || gatewaySelf?.version || gatewaySelf?.platform
        ? [
            gatewaySelf?.host ? gatewaySelf.host : null,
            gatewaySelf?.ip ? `(${gatewaySelf.ip})` : null,
            gatewaySelf?.version ? t("statusCommand.appPrefix", { version: gatewaySelf.version }) : null,
            gatewaySelf?.platform ? gatewaySelf.platform : null,
          ]
            .filter(Boolean)
            .join(" ")
        : null;
    const suffix = self ? ` · ${self}` : "";
    return `${gatewayMode} · ${target} · ${reach}${auth}${suffix}`;
  })();
  const pairingRecovery = resolvePairingRecoveryContext({
    error: gatewayProbe?.error ?? null,
    closeReason: gatewayProbe?.close?.reason ?? null,
  });

  const agentsValue = (() => {
    const pending =
      agentStatus.bootstrapPendingCount > 0
        ? t("commands.status.bootstrapPresent", { count: String(agentStatus.bootstrapPendingCount) })
        : t("commands.status.noBootstrap");
    const def = agentStatus.agents.find((a) => a.id === agentStatus.defaultId);
    const defActive = def?.lastActiveAgeMs != null ? formatTimeAgo(def.lastActiveAgeMs) : t("statusCommand.unknownValue");
    const defSuffix = def ? t("statusCommand.defaultAgentActive", { id: def.id, active: defActive }) : "";
    return `${agentStatus.agents.length} · ${pending}${t("statusCommand.sessionsCount", { count: String(agentStatus.totalSessions) })}${defSuffix}`;
  })();

  const [daemon, nodeDaemon] = await Promise.all([
    getDaemonStatusSummary(),
    getNodeDaemonStatusSummary(),
  ]);
  const daemonValue = (() => {
    if (daemon.installed === false) {
      return `${daemon.label} ${t("statusCommand.notInstalled")}`;
    }
    const installedPrefix = daemon.managedByOpenClaw ? t("statusCommand.installed") : "";
    return `${daemon.label} ${installedPrefix}${daemon.loadedText}${daemon.runtimeShort ? ` · ${daemon.runtimeShort}` : ""}`;
  })();
  const nodeDaemonValue = (() => {
    if (nodeDaemon.installed === false) {
      return `${nodeDaemon.label} ${t("statusCommand.notInstalled")}`;
    }
    const installedPrefix = nodeDaemon.managedByOpenClaw ? t("statusCommand.installed") : "";
    return `${nodeDaemon.label} ${installedPrefix}${nodeDaemon.loadedText}${nodeDaemon.runtimeShort ? ` · ${nodeDaemon.runtimeShort}` : ""}`;
  })();

  const defaults = summary.sessions.defaults;
  const defaultCtx = defaults.contextTokens
    ? ` (${formatKTokens(defaults.contextTokens)} ctx)`
    : "";
  const eventsValue =
    summary.queuedSystemEvents.length > 0 ? t("statusCommand.queuedEvents", { count: String(summary.queuedSystemEvents.length) }) : t("statusCommand.noEvents");

  const probesValue = health ? ok(t("statusCommand.probesEnabled")) : muted(t("statusCommand.probesSkipped"));

  const heartbeatValue = (() => {
    const parts = summary.heartbeat.agents
      .map((agent) => {
        if (!agent.enabled || !agent.everyMs) {
          return t("statusCommand.heartbeatDisabledAgent", { agentId: agent.agentId });
        }
        const everyLabel = agent.every;
        return `${everyLabel} (${agent.agentId})`;
      })
      .filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : t("statusCommand.heartbeatDisabled");
  })();
  const lastHeartbeatValue = (() => {
    if (!opts.deep) {
      return null;
    }
    if (!gatewayReachable) {
      return warn(t("statusCommand.heartbeatUnavailable"));
    }
    if (!lastHeartbeat) {
      return muted(t("statusCommand.heartbeatNone"));
    }
    const age = formatTimeAgo(Date.now() - lastHeartbeat.ts);
    const channel = lastHeartbeat.channel ?? t("statusCommand.unknownValue");
    const accountLabel = lastHeartbeat.accountId ? t("statusCommand.heartbeatAccount", { accountId: lastHeartbeat.accountId }) : null;
    return [lastHeartbeat.status, `${age} ago`, channel, accountLabel].filter(Boolean).join(" · ");
  })();

  const storeLabel =
    summary.sessions.paths.length > 1
      ? t("statusCommand.storesCount", { count: String(summary.sessions.paths.length) })
      : (summary.sessions.paths[0] ?? t("statusCommand.unknownValue"));

  const memoryValue = (() => {
    if (!memoryPlugin.enabled) {
      const suffix = memoryPlugin.reason ? ` (${memoryPlugin.reason})` : "";
      return muted(t("statusCommand.memoryDisabled") + suffix);
    }
    if (!memory) {
      const slot = memoryPlugin.slot ? t("statusCommand.memoryPlugin", { slot: memoryPlugin.slot }) : "plugin";
      // Custom (non-built-in) memory plugins can't be probed — show enabled, not unavailable
      if (memoryPlugin.slot && memoryPlugin.slot !== "memory-core") {
        return t("statusCommand.memoryEnabled", { slot });
      }
      return muted(t("statusCommand.memoryEnabledUnavailable", { slot }));
    }
    const parts: string[] = [];
    const dirtySuffix = memory.dirty ? ` · ${warn(t("statusCommand.memoryDirty"))}` : "";
    parts.push(t("statusCommand.memoryFiles", { files: String(memory.files), chunks: String(memory.chunks) }) + dirtySuffix);
    if (memory.sources?.length) {
      parts.push(t("statusCommand.memorySources", { sources: memory.sources.join(", ") }));
    }
    if (memoryPlugin.slot) {
      parts.push(t("statusCommand.memoryPlugin", { slot: memoryPlugin.slot }));
    }
    const colorByTone = (tone: Tone, text: string) =>
      tone === "ok" ? ok(text) : tone === "warn" ? warn(text) : muted(text);
    const vector = memory.vector;
    if (vector) {
      const state = resolveMemoryVectorState(vector);
      const label = state.state === "disabled" ? t("statusCommand.memoryVectorOff") : t("statusCommand.memoryVector", { state: state.state });
      parts.push(colorByTone(state.tone, label));
    }
    const fts = memory.fts;
    if (fts) {
      const state = resolveMemoryFtsState(fts);
      const label = state.state === "disabled" ? t("statusCommand.memoryFtsOff") : t("statusCommand.memoryFts", { state: state.state });
      parts.push(colorByTone(state.tone, label));
    }
    const cache = memory.cache;
    if (cache) {
      const summary = resolveMemoryCacheSummary(cache);
      parts.push(colorByTone(summary.tone, summary.text));
    }
    return parts.join(" · ");
  })();

  const updateAvailability = resolveUpdateAvailability(update);
  const updateLine = formatUpdateOneLiner(update).replace(/^Update:\s*/i, "");
  const channelLabel = channelInfo.label;
  const gitLabel = formatGitInstallLabel(update);

  const overviewRows = [
    { Item: t("statusCommand.itemDashboard"), Value: dashboard },
    { Item: t("statusCommand.itemOS"), Value: `${osSummary.label} · ${t("statusCommand.nodeVersion", { version: process.versions.node })}` },
    {
      Item: t("statusCommand.itemTailscale"),
      Value:
        tailscaleMode === "off"
          ? muted(t("statusCommand.tailscaleOff"))
          : tailscaleDns && tailscaleHttpsUrl
            ? `${tailscaleMode} · ${tailscaleDns} · ${tailscaleHttpsUrl}`
            : warn(t("statusCommand.tailscaleMagicdnsUnknown", { mode: tailscaleMode })),
    },
    { Item: t("statusCommand.itemChannel"), Value: channelLabel },
    ...(gitLabel ? [{ Item: t("statusCommand.itemGit"), Value: gitLabel }] : []),
    {
      Item: t("statusCommand.itemUpdate"),
      Value: updateAvailability.available ? warn(t("statusCommand.updateAvailable", { update: updateLine })) : updateLine,
    },
    { Item: t("statusCommand.itemGateway"), Value: gatewayValue },
    ...(gatewayProbeAuthWarning
      ? [{ Item: t("statusCommand.itemGatewayAuthWarning"), Value: warn(gatewayProbeAuthWarning) }]
      : []),
    { Item: t("statusCommand.itemGatewayService"), Value: daemonValue },
    { Item: t("statusCommand.itemNodeService"), Value: nodeDaemonValue },
    { Item: t("statusCommand.itemAgents"), Value: agentsValue },
    { Item: t("statusCommand.itemMemory"), Value: memoryValue },
    { Item: t("statusCommand.itemProbes"), Value: probesValue },
    { Item: t("statusCommand.itemEvents"), Value: eventsValue },
    { Item: t("statusCommand.itemHeartbeat"), Value: heartbeatValue },
    ...(lastHeartbeatValue ? [{ Item: t("statusCommand.itemLastHeartbeat"), Value: lastHeartbeatValue }] : []),
    {
      Item: t("statusCommand.itemSessions"),
      Value: t("statusCommand.sessionsValue", { count: String(summary.sessions.count), model: defaults.model ?? t("statusCommand.unknownValue"), ctx: defaultCtx, store: storeLabel }),
    },
  ];

  runtime.log(theme.heading(t("commands.status.heading")));
  runtime.log("");
  runtime.log(theme.heading(t("commands.status.overview")));
  runtime.log(
    renderTable({
      width: tableWidth,
      columns: [
        { key: "Item", header: t("statusCommand.tableHeaderItem"), minWidth: 12 },
        { key: "Value", header: t("statusCommand.tableHeaderValue"), flex: true, minWidth: 32 },
      ],
      rows: overviewRows,
    }).trimEnd(),
  );

  if (pairingRecovery) {
    runtime.log("");
    runtime.log(theme.warn(t("commands.status.pairingRequired")));
    if (pairingRecovery.requestId) {
      runtime.log(
        theme.muted(
          `${t("statusCommand.recoveryPrefix")}${formatCliCommand(`openclaw devices approve ${pairingRecovery.requestId}`)}`,
        ),
      );
    }
    runtime.log(theme.muted(`${t("statusCommand.fallbackPrefix")}${formatCliCommand("openclaw devices approve --latest")}`));
    runtime.log(theme.muted(`${t("statusCommand.inspectPrefix")}${formatCliCommand("openclaw devices list")}`));
  }

  runtime.log("");
  runtime.log(theme.heading(t("commands.status.securityHeading")));
  const fmtSummary = (value: { critical: number; warn: number; info: number }) => {
    const parts = [
      theme.error(t("statusCommand.criticalCount", { count: String(value.critical) })),
      theme.warn(t("statusCommand.warnCount", { count: String(value.warn) })),
      theme.muted(t("statusCommand.infoCount", { count: String(value.info) })),
    ];
    return parts.join(" · ");
  };
  runtime.log(theme.muted(`${t("statusCommand.summaryPrefix")}${fmtSummary(securityAudit.summary)}`));
  const importantFindings = securityAudit.findings.filter(
    (f) => f.severity === "critical" || f.severity === "warn",
  );
  if (importantFindings.length === 0) {
    runtime.log(theme.muted(t("commands.status.noFindings")));
  } else {
    const severityLabel = (sev: "critical" | "warn" | "info") => {
      if (sev === "critical") {
        return theme.error(t("statusCommand.severityCritical"));
      }
      if (sev === "warn") {
        return theme.warn(t("statusCommand.severityWarn"));
      }
      return theme.muted(t("statusCommand.severityInfo"));
    };
    const sevRank = (sev: "critical" | "warn" | "info") =>
      sev === "critical" ? 0 : sev === "warn" ? 1 : 2;
    const sorted = [...importantFindings].toSorted(
      (a, b) => sevRank(a.severity) - sevRank(b.severity),
    );
    const shown = sorted.slice(0, 6);
    for (const f of shown) {
      runtime.log(`  ${severityLabel(f.severity)} ${f.title}`);
      runtime.log(`    ${shortenText(f.detail.replaceAll("\n", " "), 160)}`);
      if (f.remediation?.trim()) {
        runtime.log(`    ${theme.muted(t("statusCommand.fixPrefix", { fix: f.remediation.trim() }))}`);
      }
    }
    if (sorted.length > shown.length) {
      runtime.log(theme.muted(t("statusCommand.moreItems", { count: String(sorted.length - shown.length) })));
    }
  }
  runtime.log(theme.muted(`${t("statusCommand.fullReport")}${formatCliCommand("openclaw security audit")}`));
  runtime.log(theme.muted(`${t("statusCommand.deepProbe")}${formatCliCommand("openclaw security audit --deep")}`));

  runtime.log("");
  runtime.log(theme.heading(t("commands.status.channelsHeading")));
  const channelIssuesByChannel = groupChannelIssuesByChannel(channelIssues);
  runtime.log(
    renderTable({
      width: tableWidth,
      columns: [
        { key: "Channel", header: t("statusCommand.tableHeaderChannel"), minWidth: 10 },
        { key: "Enabled", header: t("statusCommand.tableHeaderEnabled"), minWidth: 7 },
        { key: "State", header: t("statusCommand.tableHeaderState"), minWidth: 8 },
        { key: "Detail", header: t("statusCommand.tableHeaderDetail"), flex: true, minWidth: 24 },
      ],
      rows: channels.rows.map((row) => {
        const issues = channelIssuesByChannel.get(row.id) ?? [];
        const effectiveState = row.state === "off" ? "off" : issues.length > 0 ? "warn" : row.state;
        const issueSuffix =
          issues.length > 0
            ? ` · ${warn(t("statusCommand.gatewayIssue", { message: shortenText(issues[0]?.message ?? "issue", 84) }))}`
            : "";
        return {
          Channel: row.label,
          Enabled: row.enabled ? ok(t("statusCommand.statusOn")) : muted(t("statusCommand.statusOff")),
          State:
            effectiveState === "ok"
              ? ok(t("statusCommand.statusOk"))
              : effectiveState === "warn"
                ? warn(t("statusCommand.statusWarn"))
                : effectiveState === "off"
                  ? muted(t("statusCommand.statusOff"))
                  : theme.accentDim(t("statusCommand.statusSetup")),
          Detail: `${row.detail}${issueSuffix}`,
        };
      }),
    }).trimEnd(),
  );

  runtime.log("");
  runtime.log(theme.heading(t("commands.status.sessionsHeading")));
  runtime.log(
    renderTable({
      width: tableWidth,
      columns: [
        { key: "Key", header: t("statusCommand.tableHeaderKey"), minWidth: 20, flex: true },
        { key: "Kind", header: t("statusCommand.tableHeaderKind"), minWidth: 6 },
        { key: "Age", header: t("statusCommand.tableHeaderAge"), minWidth: 9 },
        { key: "Model", header: t("statusCommand.tableHeaderModel"), minWidth: 14 },
        { key: "Tokens", header: t("statusCommand.tableHeaderTokens"), minWidth: 16 },
      ],
      rows:
        summary.sessions.recent.length > 0
          ? summary.sessions.recent.map((sess) => ({
              Key: shortenText(sess.key, 32),
              Kind: sess.kind,
              Age: sess.updatedAt ? formatTimeAgo(sess.age) : t("statusCommand.noActivity"),
              Model: sess.model ?? t("statusCommand.unknownValue"),
              Tokens: formatTokensCompact(sess),
            }))
          : [
              {
                Key: muted(t("statusCommand.noSessionsYet")),
                Kind: "",
                Age: "",
                Model: "",
                Tokens: "",
              },
            ],
    }).trimEnd(),
  );

  if (summary.queuedSystemEvents.length > 0) {
    runtime.log("");
    runtime.log(theme.heading(t("commands.status.eventsHeading")));
    runtime.log(
      renderTable({
        width: tableWidth,
        columns: [{ key: "Event", header: t("statusCommand.tableHeaderEvent"), flex: true, minWidth: 24 }],
        rows: summary.queuedSystemEvents.slice(0, 5).map((event) => ({
          Event: event,
        })),
      }).trimEnd(),
    );
    if (summary.queuedSystemEvents.length > 5) {
      runtime.log(muted(t("statusCommand.moreItems", { count: String(summary.queuedSystemEvents.length - 5) })));
    }
  }

  if (health) {
    runtime.log("");
    runtime.log(theme.heading(t("commands.status.healthHeading")));
    const rows: Array<Record<string, string>> = [];
    rows.push({
      Item: t("statusCommand.healthGateway"),
      Status: ok(t("statusCommand.healthReachable")),
      Detail: `${health.durationMs}ms`,
    });

    for (const line of formatHealthChannelLines(health, { accountMode: "all" })) {
      const colon = line.indexOf(":");
      if (colon === -1) {
        continue;
      }
      const item = line.slice(0, colon).trim();
      const detail = line.slice(colon + 1).trim();
      const normalized = detail.toLowerCase();
      const status = (() => {
        if (normalized.startsWith("ok")) {
          return ok(t("statusCommand.statusOk"));
        }
        if (normalized.startsWith("failed")) {
          return warn(t("statusCommand.statusWarn"));
        }
        if (normalized.startsWith("not configured")) {
          return muted(t("statusCommand.statusOff"));
        }
        if (normalized.startsWith("configured")) {
          return ok(t("statusCommand.statusOk"));
        }
        if (normalized.startsWith("linked")) {
          return ok(t("statusCommand.statusLinked"));
        }
        if (normalized.startsWith("not linked")) {
          return warn(t("statusCommand.statusUnlinked"));
        }
        return warn(t("statusCommand.statusWarn"));
      })();
      rows.push({ Item: item, Status: status, Detail: detail });
    }

    runtime.log(
      renderTable({
        width: tableWidth,
        columns: [
          { key: "Item", header: t("statusCommand.tableHeaderItem"), minWidth: 10 },
          { key: "Status", header: t("statusCommand.tableHeaderStatus"), minWidth: 8 },
          { key: "Detail", header: t("statusCommand.tableHeaderDetail"), flex: true, minWidth: 28 },
        ],
        rows,
      }).trimEnd(),
    );
  }

  if (usage) {
    runtime.log("");
    runtime.log(theme.heading(t("commands.status.usageHeading")));
    for (const line of formatUsageReportLines(usage)) {
      runtime.log(line);
    }
  }

  runtime.log("");
  runtime.log(t("commands.status.faqLink"));
  runtime.log(t("commands.status.troubleLink"));
  runtime.log("");
  const updateHint = formatUpdateAvailableHint(update);
  if (updateHint) {
    runtime.log(theme.warn(updateHint));
    runtime.log("");
  }
  runtime.log(t("commands.status.nextSteps"));
  runtime.log(`  ${t("commands.status.needShare")}      ${formatCliCommand("openclaw status --all")}`);
  runtime.log(`  ${t("commands.status.needDebug")} ${formatCliCommand("openclaw logs --follow")}`);
  if (gatewayReachable) {
    runtime.log(`  ${t("commands.status.needTest")} ${formatCliCommand("openclaw status --deep")}`);
  } else {
    runtime.log(`  ${t("commands.status.fixReachability")} ${formatCliCommand("openclaw gateway probe")}`);
  }
}
