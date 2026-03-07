import { listChannelPlugins } from "../channels/plugins/index.js";
import type { ChannelId } from "../channels/plugins/types.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig, GatewayBindMode } from "../config/config.js";
import type { AgentConfig } from "../config/types.agents.js";
import { hasConfiguredSecretInput } from "../config/types.secrets.js";
import { resolveGatewayAuth } from "../gateway/auth.js";
import { t } from "../i18n/index.js";
import { isLoopbackHost, resolveGatewayBindHost } from "../gateway/net.js";
import { resolveDmAllowState } from "../security/dm-policy-shared.js";
import { note } from "../terminal/note.js";
import { resolveDefaultChannelAccountContext } from "./channel-account-context.js";

function collectImplicitHeartbeatDirectPolicyWarnings(cfg: OpenClawConfig): string[] {
  const warnings: string[] = [];

  const maybeWarn = (params: {
    label: string;
    heartbeat: AgentConfig["heartbeat"] | undefined;
    pathHint: string;
  }) => {
    const heartbeat = params.heartbeat;
    if (!heartbeat || heartbeat.target === undefined || heartbeat.target === "none") {
      return;
    }
    if (heartbeat.directPolicy !== undefined) {
      return;
    }
    warnings.push(
      `- ${params.label}: heartbeat delivery is configured while ${params.pathHint} is unset.`,
      '  Heartbeat now allows direct/DM targets by default. Set it explicitly to "allow" or "block" to pin upgrade behavior.',
    );
  };

  maybeWarn({
    label: "Heartbeat defaults",
    heartbeat: cfg.agents?.defaults?.heartbeat,
    pathHint: "agents.defaults.heartbeat.directPolicy",
  });

  for (const agent of cfg.agents?.list ?? []) {
    maybeWarn({
      label: `Heartbeat agent "${agent.id}"`,
      heartbeat: agent.heartbeat,
      pathHint: `heartbeat.directPolicy for agent "${agent.id}"`,
    });
  }

  return warnings;
}

export async function noteSecurityWarnings(cfg: OpenClawConfig) {
  const warnings: string[] = [];
  const auditHint = t("commands.doctorSecurity.auditHint", { command: formatCliCommand("openclaw security audit --deep") });

  if (cfg.approvals?.exec?.enabled === false) {
    warnings.push(
      t("commands.doctorSecurity.approvalsNote"),
      t("commands.doctorSecurity.hostExecGating"),
      t("commands.doctorSecurity.checkLocalPolicy", { command: formatCliCommand("openclaw approvals get --gateway") }),
    );
  }

  warnings.push(...collectImplicitHeartbeatDirectPolicyWarnings(cfg));

  // ===========================================
  // GATEWAY NETWORK EXPOSURE CHECK
  // ===========================================
  // Check for dangerous gateway binding configurations
  // that expose the gateway to network without proper auth

  const gatewayBind = (cfg.gateway?.bind ?? "loopback") as string;
  const customBindHost = cfg.gateway?.customBindHost?.trim();
  const bindModes: GatewayBindMode[] = ["auto", "lan", "loopback", "custom", "tailnet"];
  const bindMode = bindModes.includes(gatewayBind as GatewayBindMode)
    ? (gatewayBind as GatewayBindMode)
    : undefined;
  const resolvedBindHost = bindMode
    ? await resolveGatewayBindHost(bindMode, customBindHost)
    : "0.0.0.0";
  const isExposed = !isLoopbackHost(resolvedBindHost);

  const resolvedAuth = resolveGatewayAuth({
    authConfig: cfg.gateway?.auth,
    env: process.env,
    tailscaleMode: cfg.gateway?.tailscale?.mode ?? "off",
  });
  const authToken = resolvedAuth.token?.trim() ?? "";
  const authPassword = resolvedAuth.password?.trim() ?? "";
  const hasToken =
    authToken.length > 0 ||
    hasConfiguredSecretInput(cfg.gateway?.auth?.token, cfg.secrets?.defaults);
  const hasPassword =
    authPassword.length > 0 ||
    hasConfiguredSecretInput(cfg.gateway?.auth?.password, cfg.secrets?.defaults);
  const hasSharedSecret =
    (resolvedAuth.mode === "token" && hasToken) ||
    (resolvedAuth.mode === "password" && hasPassword);
  const bindDescriptor = `"${gatewayBind}" (${resolvedBindHost})`;
  const saferRemoteAccessLines = [
    t("commands.doctorSecurity.saferRemoteAccess"),
    t("commands.doctorSecurity.exampleTunnel"),
    t("commands.doctorSecurity.docsLink"),
  ];

  if (isExposed) {
    if (!hasSharedSecret) {
      const authFixLines =
        resolvedAuth.mode === "password"
          ? [
              `  Fix: ${formatCliCommand("openclaw configure")} to set a password`,
              `  Or switch to token: ${formatCliCommand("openclaw config set gateway.auth.mode token")}`,
            ]
          : [
              `  Fix: ${formatCliCommand("openclaw doctor --fix")} to generate a token`,
              `  Or set token directly: ${formatCliCommand(
                "openclaw config set gateway.auth.mode token",
              )}`,
            ];
      warnings.push(
        t("commands.doctorSecurity.criticalNoAuth", { bind: bindDescriptor }),
        t("commands.doctorSecurity.anyoneCanControl"),
        t("commands.doctorSecurity.fixBindLoopback", { command: formatCliCommand("openclaw config set gateway.bind loopback") }),
        ...saferRemoteAccessLines,
        ...authFixLines,
      );
    } else {
      // Auth is configured, but still warn about network exposure
      warnings.push(
        t("commands.doctorSecurity.warningNetworkAccessible", { bind: bindDescriptor }),
        t("commands.doctorSecurity.ensureStrongAuth"),
        ...saferRemoteAccessLines,
      );
    }
  }

  const warnDmPolicy = async (params: {
    label: string;
    provider: ChannelId;
    accountId: string;
    dmPolicy: string;
    allowFrom?: Array<string | number> | null;
    policyPath?: string;
    allowFromPath: string;
    approveHint: string;
    normalizeEntry?: (raw: string) => string;
  }) => {
    const dmPolicy = params.dmPolicy;
    const policyPath = params.policyPath ?? `${params.allowFromPath}policy`;
    const { hasWildcard, allowCount, isMultiUserDm } = await resolveDmAllowState({
      provider: params.provider,
      accountId: params.accountId,
      allowFrom: params.allowFrom,
      normalizeEntry: params.normalizeEntry,
    });
    const dmScope = cfg.session?.dmScope ?? "main";

    if (dmPolicy === "open") {
      const allowFromPath = `${params.allowFromPath}allowFrom`;
      warnings.push(t("commands.doctorSecurity.dmOpen", { label: params.label, policyPath }));
      if (!hasWildcard) {
        warnings.push(
          t("commands.doctorSecurity.dmOpenInvalid", { label: params.label, allowFromPath }),
        );
      }
    }

    if (dmPolicy === "disabled") {
      warnings.push(t("commands.doctorSecurity.dmDisabled", { label: params.label, policyPath }));
      return;
    }

    if (dmPolicy !== "open" && allowCount === 0) {
      warnings.push(
        t("commands.doctorSecurity.dmLocked", { label: params.label, policyPath, dmPolicy }),
      );
      warnings.push(`  ${params.approveHint}`);
    }

    if (dmScope === "main" && isMultiUserDm) {
      warnings.push(
        t("commands.doctorSecurity.dmMultipleSenders", {
          label: params.label,
          command: formatCliCommand('openclaw config set session.dmScope "per-channel-peer"'),
        }),
      );
    }
  };

  for (const plugin of listChannelPlugins()) {
    if (!plugin.security) {
      continue;
    }
    const { defaultAccountId, account, enabled, configured } =
      await resolveDefaultChannelAccountContext(plugin, cfg);
    if (!enabled) {
      continue;
    }
    if (!configured) {
      continue;
    }
    const dmPolicy = plugin.security.resolveDmPolicy?.({
      cfg,
      accountId: defaultAccountId,
      account,
    });
    if (dmPolicy) {
      await warnDmPolicy({
        label: plugin.meta.label ?? plugin.id,
        provider: plugin.id,
        accountId: defaultAccountId,
        dmPolicy: dmPolicy.policy,
        allowFrom: dmPolicy.allowFrom,
        policyPath: dmPolicy.policyPath,
        allowFromPath: dmPolicy.allowFromPath,
        approveHint: dmPolicy.approveHint,
        normalizeEntry: dmPolicy.normalizeEntry,
      });
    }
    if (plugin.security.collectWarnings) {
      const extra = await plugin.security.collectWarnings({
        cfg,
        accountId: defaultAccountId,
        account,
      });
      if (extra?.length) {
        warnings.push(...extra);
      }
    }
  }

  const lines = warnings.length > 0 ? warnings : [t("commands.doctorSecurity.noWarnings")];
  lines.push(auditHint);
  note(lines.join("\n"), t("commands.doctorSecurity.title"));
}
