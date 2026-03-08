import { buildWorkspaceSkillStatus } from "../agents/skills-status.js";
import { formatCliCommand } from "../cli/command-format.js";
import { resolveCommandSecretRefsViaGateway } from "../cli/command-secret-gateway.js";
import { getStatusCommandSecretTargetIds } from "../cli/command-secret-targets.js";
import { withProgress } from "../cli/progress.js";
import {
  readBestEffortConfig,
  readConfigFileSnapshot,
  resolveGatewayPort,
} from "../config/config.js";
import { readLastGatewayErrorLine } from "../daemon/diagnostics.js";
import { resolveNodeService } from "../daemon/node-service.js";
import type { GatewayService } from "../daemon/service.js";
import { resolveGatewayService } from "../daemon/service.js";
import { buildGatewayConnectionDetails, callGateway } from "../gateway/call.js";
import { normalizeControlUiBasePath } from "../gateway/control-ui-shared.js";
import { resolveGatewayProbeAuthSafe } from "../gateway/probe-auth.js";
import { probeGateway } from "../gateway/probe.js";
import { t } from "../i18n/index.js";
import { collectChannelStatusIssues } from "../infra/channels-status-issues.js";
import { resolveOpenClawPackageRoot } from "../infra/openclaw-root.js";
import { resolveOsSummary } from "../infra/os-summary.js";
import { inspectPortUsage } from "../infra/ports.js";
import { readRestartSentinel } from "../infra/restart-sentinel.js";
import { getRemoteSkillEligibility } from "../infra/skills-remote.js";
import { readTailscaleStatusJson } from "../infra/tailscale.js";
import { normalizeUpdateChannel, resolveUpdateChannelDisplay } from "../infra/update-channels.js";
import { checkUpdateStatus, formatGitInstallLabel } from "../infra/update-check.js";
import { runExec } from "../process/exec.js";
import type { RuntimeEnv } from "../runtime.js";
import { VERSION } from "../version.js";
import { resolveControlUiLinks } from "./onboard-helpers.js";
import { getAgentLocalStatuses } from "./status-all/agents.js";
import { buildChannelsTable } from "./status-all/channels.js";
import { formatDurationPrecise, formatGatewayAuthUsed } from "./status-all/format.js";
import { pickGatewaySelfPresence } from "./status-all/gateway.js";
import { buildStatusAllReportLines } from "./status-all/report-lines.js";
import { readServiceStatusSummary } from "./status.service-summary.js";
import { formatUpdateOneLiner } from "./status.update.js";

export async function statusAllCommand(
  runtime: RuntimeEnv,
  opts?: { timeoutMs?: number },
): Promise<void> {
  await withProgress({ label: t("commands.statusAll.scanning"), total: 11 }, async (progress) => {
    progress.setLabel(t("commands.statusAll.loadingConfig"));
    const loadedRaw = await readBestEffortConfig();
    const { resolvedConfig: cfg } = await resolveCommandSecretRefsViaGateway({
      config: loadedRaw,
      commandName: "status --all",
      targetIds: getStatusCommandSecretTargetIds(),
      mode: "summary",
    });
    const osSummary = resolveOsSummary();
    const snap = await readConfigFileSnapshot().catch(() => null);
    progress.tick();

    progress.setLabel(t("commands.statusAll.checkingTailscale"));
    const tailscaleMode = cfg.gateway?.tailscale?.mode ?? "off";
    const tailscale = await (async () => {
      try {
        const parsed = await readTailscaleStatusJson(runExec, {
          timeoutMs: 1200,
        });
        const backendState = typeof parsed.BackendState === "string" ? parsed.BackendState : null;
        const self =
          typeof parsed.Self === "object" && parsed.Self !== null
            ? (parsed.Self as Record<string, unknown>)
            : null;
        const dnsNameRaw = self && typeof self.DNSName === "string" ? self.DNSName : null;
        const dnsName = dnsNameRaw ? dnsNameRaw.replace(/\.$/, "") : null;
        const ips =
          self && Array.isArray(self.TailscaleIPs)
            ? (self.TailscaleIPs as unknown[])
                .filter((v) => typeof v === "string" && v.trim().length > 0)
                .map((v) => (v as string).trim())
            : [];
        return { ok: true as const, backendState, dnsName, ips, error: null };
      } catch (err) {
        return {
          ok: false as const,
          backendState: null,
          dnsName: null,
          ips: [] as string[],
          error: String(err),
        };
      }
    })();
    const tailscaleHttpsUrl =
      tailscaleMode !== "off" && tailscale.dnsName
        ? `https://${tailscale.dnsName}${normalizeControlUiBasePath(cfg.gateway?.controlUi?.basePath)}`
        : null;
    progress.tick();

    progress.setLabel(t("commands.statusAll.checkingUpdates"));
    const root = await resolveOpenClawPackageRoot({
      moduleUrl: import.meta.url,
      argv1: process.argv[1],
      cwd: process.cwd(),
    });
    const update = await checkUpdateStatus({
      root,
      timeoutMs: 6500,
      fetchGit: true,
      includeRegistry: true,
    });
    const configChannel = normalizeUpdateChannel(cfg.update?.channel);
    const channelInfo = resolveUpdateChannelDisplay({
      configChannel,
      installKind: update.installKind,
      gitTag: update.git?.tag ?? null,
      gitBranch: update.git?.branch ?? null,
    });
    const channelLabel = channelInfo.label;
    const gitLabel = formatGitInstallLabel(update);
    progress.tick();

    progress.setLabel(t("commands.statusAll.probingGateway"));
    const connection = buildGatewayConnectionDetails({ config: cfg });
    const isRemoteMode = cfg.gateway?.mode === "remote";
    const remoteUrlRaw =
      typeof cfg.gateway?.remote?.url === "string" ? cfg.gateway.remote.url.trim() : "";
    const remoteUrlMissing = isRemoteMode && !remoteUrlRaw;
    const gatewayMode = isRemoteMode ? "remote" : "local";

    const localProbeAuthResolution = resolveGatewayProbeAuthSafe({ cfg, mode: "local" });
    const remoteProbeAuthResolution = resolveGatewayProbeAuthSafe({ cfg, mode: "remote" });
    const probeAuthResolution =
      isRemoteMode && !remoteUrlMissing ? remoteProbeAuthResolution : localProbeAuthResolution;
    const probeAuth = probeAuthResolution.auth;

    const gatewayProbe = await probeGateway({
      url: connection.url,
      auth: probeAuth,
      timeoutMs: Math.min(5000, opts?.timeoutMs ?? 10_000),
    }).catch(() => null);
    const gatewayReachable = gatewayProbe?.ok === true;
    const gatewaySelf = pickGatewaySelfPresence(gatewayProbe?.presence ?? null);
    progress.tick();

    progress.setLabel(t("commands.statusAll.checkingServices"));
    const readServiceSummary = async (service: GatewayService) => {
      try {
        const summary = await readServiceStatusSummary(service, service.label);
        return {
          label: summary.label,
          installed: summary.installed,
          managedByOpenClaw: summary.managedByOpenClaw,
          loaded: summary.loaded,
          loadedText: summary.loadedText,
          runtime: summary.runtime,
        };
      } catch {
        return null;
      }
    };
    const daemon = await readServiceSummary(resolveGatewayService());
    const nodeService = await readServiceSummary(resolveNodeService());
    progress.tick();

    progress.setLabel(t("commands.statusAll.scanningAgents"));
    const agentStatus = await getAgentLocalStatuses(cfg);
    progress.tick();
    progress.setLabel(t("commands.statusAll.summarizingChannels"));
    const channels = await buildChannelsTable(cfg, {
      showSecrets: false,
      sourceConfig: loadedRaw,
    });
    progress.tick();

    const connectionDetailsForReport = (() => {
      if (!remoteUrlMissing) {
        return connection.message;
      }
      const bindMode = cfg.gateway?.bind ?? "loopback";
      const configPath = snap?.path?.trim() ? snap.path.trim() : t("commands.statusAll.unknownConfigPath");
      return [
        t("commands.statusAll.gatewayModeRemote"),
        t("commands.statusAll.gatewayTargetMissing"),
        t("commands.statusAll.gatewayConfig", { path: configPath }),
        t("commands.statusAll.gatewayBind", { bind: bindMode }),
        t("commands.statusAll.localFallback", { url: connection.url }),
        t("commands.statusAll.fixRemoteUrl"),
      ].join("\n");
    })();

    const callOverrides = remoteUrlMissing
      ? {
          url: connection.url,
          token: localProbeAuthResolution.auth.token,
          password: localProbeAuthResolution.auth.password,
        }
      : {};

    progress.setLabel(t("commands.statusAll.queryingGateway"));
    const health = gatewayReachable
      ? await callGateway({
          config: cfg,
          method: "health",
          timeoutMs: Math.min(8000, opts?.timeoutMs ?? 10_000),
          ...callOverrides,
        }).catch((err) => ({ error: String(err) }))
      : { error: gatewayProbe?.error ?? "gateway unreachable" };

    const channelsStatus = gatewayReachable
      ? await callGateway({
          config: cfg,
          method: "channels.status",
          params: { probe: false, timeoutMs: opts?.timeoutMs ?? 10_000 },
          timeoutMs: Math.min(8000, opts?.timeoutMs ?? 10_000),
          ...callOverrides,
        }).catch(() => null)
      : null;
    const channelIssues = channelsStatus ? collectChannelStatusIssues(channelsStatus) : [];
    progress.tick();

    progress.setLabel(t("commands.statusAll.checkingLocalState"));
    const sentinel = await readRestartSentinel().catch(() => null);
    const lastErr = await readLastGatewayErrorLine(process.env).catch(() => null);
    const port = resolveGatewayPort(cfg);
    const portUsage = await inspectPortUsage(port).catch(() => null);
    progress.tick();

    const defaultWorkspace =
      agentStatus.agents.find((a) => a.id === agentStatus.defaultId)?.workspaceDir ??
      agentStatus.agents[0]?.workspaceDir ??
      null;
    const skillStatus =
      defaultWorkspace != null
        ? (() => {
            try {
              return buildWorkspaceSkillStatus(defaultWorkspace, {
                config: cfg,
                eligibility: { remote: getRemoteSkillEligibility() },
              });
            } catch {
              return null;
            }
          })()
        : null;

    const controlUiEnabled = cfg.gateway?.controlUi?.enabled ?? true;
    const dashboard = controlUiEnabled
      ? resolveControlUiLinks({
          port,
          bind: cfg.gateway?.bind,
          customBindHost: cfg.gateway?.customBindHost,
          basePath: cfg.gateway?.controlUi?.basePath,
        }).httpUrl
      : null;

    const updateLine = formatUpdateOneLiner(update).replace(/^Update:\s*/i, "");

    const gatewayTarget = remoteUrlMissing ? t("commands.statusAll.fallback", { url: connection.url }) : connection.url;
    const gatewayStatus = gatewayReachable
      ? t("commands.statusAll.reachable", { latency: formatDurationPrecise(gatewayProbe?.connectLatencyMs ?? 0) })
      : gatewayProbe?.error
        ? t("commands.statusAll.unreachableReason", { reason: gatewayProbe.error })
        : t("commands.statusAll.unreachable");
    const gatewayAuth = gatewayReachable ? ` · auth ${formatGatewayAuthUsed(probeAuth)}` : "";
    const gatewaySelfLine =
      gatewaySelf?.host || gatewaySelf?.ip || gatewaySelf?.version || gatewaySelf?.platform
        ? [
            gatewaySelf.host ? gatewaySelf.host : null,
            gatewaySelf.ip ? `(${gatewaySelf.ip})` : null,
            gatewaySelf.version ? `app ${gatewaySelf.version}` : null,
            gatewaySelf.platform ? gatewaySelf.platform : null,
          ]
            .filter(Boolean)
            .join(" ")
        : null;

    const aliveThresholdMs = 10 * 60_000;
    const aliveAgents = agentStatus.agents.filter(
      (a) => a.lastActiveAgeMs != null && a.lastActiveAgeMs <= aliveThresholdMs,
    ).length;

    const overviewRows = [
      { Item: t("commands.statusAll.version"), Value: VERSION },
      { Item: t("commands.statusAll.os"), Value: osSummary.label },
      { Item: t("commands.statusAll.node"), Value: process.versions.node },
      {
        Item: t("commands.statusAll.config"),
        Value: snap?.path?.trim() ? snap.path.trim() : t("commands.statusAll.unknownConfigPath"),
      },
      dashboard
        ? { Item: t("commands.statusAll.dashboard"), Value: dashboard }
        : { Item: t("commands.statusAll.dashboard"), Value: t("commands.statusAll.disabled") },
      {
        Item: t("commands.statusAll.tailscale"),
        Value:
          tailscaleMode === "off"
            ? `off${tailscale.backendState ? ` · ${tailscale.backendState}` : ""}${tailscale.dnsName ? ` · ${tailscale.dnsName}` : ""}`
            : tailscale.dnsName && tailscaleHttpsUrl
              ? `${tailscaleMode} · ${tailscale.backendState ?? t("commands.statusAll.unknown")} · ${tailscale.dnsName} · ${tailscaleHttpsUrl}`
              : `${tailscaleMode} · ${tailscale.backendState ?? t("commands.statusAll.unknown")} · magicdns ${t("commands.statusAll.unknown")}`,
      },
      { Item: t("commands.statusAll.channel"), Value: channelLabel },
      ...(gitLabel ? [{ Item: t("commands.statusAll.git"), Value: gitLabel }] : []),
      { Item: t("commands.statusAll.update"), Value: updateLine },
      {
        Item: t("commands.statusAll.gateway"),
        Value: `${gatewayMode}${remoteUrlMissing ? ` ${t("commands.statusAll.remoteUrlMissing")}` : ""} · ${gatewayTarget} (${connection.urlSource}) · ${gatewayStatus}${gatewayAuth}`,
      },
      ...(probeAuthResolution.warning
        ? [{ Item: t("commands.statusAll.gatewayAuthWarning"), Value: probeAuthResolution.warning }]
        : []),
      { Item: t("commands.statusAll.security"), Value: t("commands.statusAll.securityRun", { command: formatCliCommand("openclaw security audit --deep") }) },
      gatewaySelfLine
        ? { Item: t("commands.statusAll.gatewaySelf"), Value: gatewaySelfLine }
        : { Item: t("commands.statusAll.gatewaySelf"), Value: t("commands.statusAll.unknown") },
      daemon
        ? {
            Item: t("commands.statusAll.gatewayService"),
            Value: !daemon.installed
              ? t("commands.statusAll.notInstalled", { label: daemon.label })
              : `${daemon.label} ${daemon.managedByOpenClaw ? `${t("commands.statusAll.installed")} · ` : ""}${daemon.loadedText}${daemon.runtime?.status ? ` · ${daemon.runtime.status}` : ""}${daemon.runtime?.pid ? ` (pid ${daemon.runtime.pid})` : ""}`,
          }
        : { Item: t("commands.statusAll.gatewayService"), Value: t("commands.statusAll.unknown") },
      nodeService
        ? {
            Item: t("commands.statusAll.nodeService"),
            Value: !nodeService.installed
              ? t("commands.statusAll.notInstalled", { label: nodeService.label })
              : `${nodeService.label} ${nodeService.managedByOpenClaw ? `${t("commands.statusAll.installed")} · ` : ""}${nodeService.loadedText}${nodeService.runtime?.status ? ` · ${nodeService.runtime.status}` : ""}${nodeService.runtime?.pid ? ` (pid ${nodeService.runtime.pid})` : ""}`,
          }
        : { Item: t("commands.statusAll.nodeService"), Value: t("commands.statusAll.unknown") },
      {
        Item: t("commands.statusAll.agents"),
        Value: t("commands.statusAll.agentsSummary", { total: String(agentStatus.agents.length), bootstrapping: String(agentStatus.bootstrapPendingCount), active: String(aliveAgents), sessions: String(agentStatus.totalSessions) }),
      },
    ];

    const lines = await buildStatusAllReportLines({
      progress,
      overviewRows,
      channels,
      channelIssues: channelIssues.map((issue) => ({
        channel: issue.channel,
        message: issue.message,
      })),
      agentStatus,
      connectionDetailsForReport,
      diagnosis: {
        snap,
        remoteUrlMissing,
        sentinel,
        lastErr,
        port,
        portUsage,
        tailscaleMode,
        tailscale,
        tailscaleHttpsUrl,
        skillStatus,
        channelsStatus,
        channelIssues,
        gatewayReachable,
        health,
      },
    });

    progress.setLabel(t("commands.statusAll.rendering"));
    runtime.log(lines.join("\n"));
    progress.tick();
  });
}
