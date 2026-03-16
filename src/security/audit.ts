import { isIP } from "node:net";
import path from "node:path";
import { resolveSandboxConfigForAgent } from "../agents/sandbox.js";
import { execDockerRaw } from "../agents/sandbox/docker.js";
import { redactCdpUrl } from "../browser/cdp.helpers.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { resolveBrowserControlAuth } from "../browser/control-auth.js";
import { listChannelPlugins } from "../channels/plugins/index.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { ConfigFileSnapshot, OpenClawConfig } from "../config/config.js";
import { resolveConfigPath, resolveStateDir } from "../config/paths.js";
import { hasConfiguredSecretInput } from "../config/types.secrets.js";
import { resolveGatewayAuth } from "../gateway/auth.js";
import { buildGatewayConnectionDetails } from "../gateway/call.js";
import { resolveGatewayProbeAuthSafe } from "../gateway/probe-auth.js";
import { probeGateway } from "../gateway/probe.js";
import {
  listInterpreterLikeSafeBins,
  resolveMergedSafeBinProfileFixtures,
} from "../infra/exec-safe-bin-runtime-policy.js";
import { normalizeTrustedSafeBinDirs } from "../infra/exec-safe-bin-trust.js";
import { isBlockedHostnameOrIp, isPrivateNetworkAllowedByPolicy } from "../infra/net/ssrf.js";
import { collectChannelSecurityFindings } from "./audit-channel.js";
import {
  collectAttackSurfaceSummaryFindings,
  collectExposureMatrixFindings,
  collectGatewayHttpNoAuthFindings,
  collectGatewayHttpSessionKeyOverrideFindings,
  collectHooksHardeningFindings,
  collectIncludeFilePermFindings,
  collectInstalledSkillsCodeSafetyFindings,
  collectLikelyMultiUserSetupFindings,
  collectSandboxBrowserHashLabelFindings,
  collectMinimalProfileOverrideFindings,
  collectModelHygieneFindings,
  collectNodeDangerousAllowCommandFindings,
  collectNodeDenyCommandPatternFindings,
  collectSmallModelRiskFindings,
  collectSandboxDangerousConfigFindings,
  collectSandboxDockerNoopFindings,
  collectPluginsTrustFindings,
  collectSecretsInConfigFindings,
  collectPluginsCodeSafetyFindings,
  collectStateDeepFilesystemFindings,
  collectSyncedFolderFindings,
  collectWorkspaceSkillSymlinkEscapeFindings,
  readConfigSnapshotForAudit,
} from "./audit-extra.js";
import {
  formatPermissionDetail,
  formatPermissionRemediation,
  inspectPathPermissions,
} from "./audit-fs.js";
import { collectEnabledInsecureOrDangerousFlags } from "./dangerous-config-flags.js";
import { DEFAULT_GATEWAY_HTTP_TOOL_DENY } from "./dangerous-tools.js";
import type { ExecFn } from "./windows-acl.js";

export type SecurityAuditSeverity = "info" | "warn" | "critical";

export type SecurityAuditFinding = {
  checkId: string;
  severity: SecurityAuditSeverity;
  title: string;
  detail: string;
  remediation?: string;
};

export type SecurityAuditSummary = {
  critical: number;
  warn: number;
  info: number;
};

export type SecurityAuditReport = {
  ts: number;
  summary: SecurityAuditSummary;
  findings: SecurityAuditFinding[];
  deep?: {
    gateway?: {
      attempted: boolean;
      url: string | null;
      ok: boolean;
      error: string | null;
      close?: { code: number; reason: string } | null;
    };
  };
};

export type SecurityAuditOptions = {
  config: OpenClawConfig;
  sourceConfig?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  deep?: boolean;
  includeFilesystem?: boolean;
  includeChannelSecurity?: boolean;
  /** Override where to check state (default: resolveStateDir()). */
  stateDir?: string;
  /** Override config path check (default: resolveConfigPath()). */
  configPath?: string;
  /** Time limit for deep gateway probe. */
  deepTimeoutMs?: number;
  /** Dependency injection for tests. */
  plugins?: ReturnType<typeof listChannelPlugins>;
  /** Dependency injection for tests. */
  probeGatewayFn?: typeof probeGateway;
  /** Dependency injection for tests (Windows ACL checks). */
  execIcacls?: ExecFn;
  /** Dependency injection for tests (Docker label checks). */
  execDockerRawFn?: typeof execDockerRaw;
  /** Optional preloaded config snapshot to skip audit-time config file reads. */
  configSnapshot?: ConfigFileSnapshot | null;
  /** Optional cache for code-safety summaries across repeated deep audits. */
  codeSafetySummaryCache?: Map<string, Promise<unknown>>;
};

type AuditExecutionContext = {
  cfg: OpenClawConfig;
  sourceConfig: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  includeFilesystem: boolean;
  includeChannelSecurity: boolean;
  deep: boolean;
  deepTimeoutMs: number;
  stateDir: string;
  configPath: string;
  execIcacls?: ExecFn;
  execDockerRawFn?: typeof execDockerRaw;
  probeGatewayFn?: typeof probeGateway;
  plugins?: ReturnType<typeof listChannelPlugins>;
  configSnapshot: ConfigFileSnapshot | null;
  codeSafetySummaryCache: Map<string, Promise<unknown>>;
};

function countBySeverity(findings: SecurityAuditFinding[]): SecurityAuditSummary {
  let critical = 0;
  let warn = 0;
  let info = 0;
  for (const f of findings) {
    if (f.severity === "critical") {
      critical += 1;
    } else if (f.severity === "warn") {
      warn += 1;
    } else {
      info += 1;
    }
  }
  return { critical, warn, info };
}

function normalizeAllowFromList(list: Array<string | number> | undefined | null): string[] {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.map((v) => String(v).trim()).filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isFeishuDocToolEnabled(cfg: OpenClawConfig): boolean {
  const channels = asRecord(cfg.channels);
  const feishu = asRecord(channels?.feishu);
  if (!feishu || feishu.enabled === false) {
    return false;
  }

  const baseTools = asRecord(feishu.tools);
  const baseDocEnabled = baseTools?.doc !== false;
  const baseAppId = hasNonEmptyString(feishu.appId);
  const baseAppSecret = hasConfiguredSecretInput(feishu.appSecret, cfg.secrets?.defaults);
  const baseConfigured = baseAppId && baseAppSecret;

  const accounts = asRecord(feishu.accounts);
  if (!accounts || Object.keys(accounts).length === 0) {
    return baseDocEnabled && baseConfigured;
  }

  for (const accountValue of Object.values(accounts)) {
    const account = asRecord(accountValue) ?? {};
    if (account.enabled === false) {
      continue;
    }
    const accountTools = asRecord(account.tools);
    const effectiveTools = accountTools ?? baseTools;
    const docEnabled = effectiveTools?.doc !== false;
    if (!docEnabled) {
      continue;
    }
    const accountConfigured =
      (hasNonEmptyString(account.appId) || baseAppId) &&
      (hasConfiguredSecretInput(account.appSecret, cfg.secrets?.defaults) || baseAppSecret);
    if (accountConfigured) {
      return true;
    }
  }

  return false;
}

async function collectFilesystemFindings(params: {
  stateDir: string;
  configPath: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  execIcacls?: ExecFn;
}): Promise<SecurityAuditFinding[]> {
  const findings: SecurityAuditFinding[] = [];

  const stateDirPerms = await inspectPathPermissions(params.stateDir, {
    env: params.env,
    platform: params.platform,
    exec: params.execIcacls,
  });
  if (stateDirPerms.ok) {
    if (stateDirPerms.isSymlink) {
      findings.push({
        checkId: "fs.state_dir.symlink",
        severity: "warn",
        title: "状态目录是符号链接",
        detail: `${params.stateDir} 是符号链接；请将其视为额外的信任边界。`,
      });
    }
    if (stateDirPerms.worldWritable) {
      findings.push({
        checkId: "fs.state_dir.perms_world_writable",
        severity: "critical",
        title: "状态目录全局可写",
        detail: `${formatPermissionDetail(params.stateDir, stateDirPerms)}；其他用户可以写入你的 OpenClaw 状态。`,
        remediation: formatPermissionRemediation({
          targetPath: params.stateDir,
          perms: stateDirPerms,
          isDir: true,
          posixMode: 0o700,
          env: params.env,
        }),
      });
    } else if (stateDirPerms.groupWritable) {
      findings.push({
        checkId: "fs.state_dir.perms_group_writable",
        severity: "warn",
        title: "状态目录组可写",
        detail: `${formatPermissionDetail(params.stateDir, stateDirPerms)}；组用户可以写入你的 OpenClaw 状态。`,
        remediation: formatPermissionRemediation({
          targetPath: params.stateDir,
          perms: stateDirPerms,
          isDir: true,
          posixMode: 0o700,
          env: params.env,
        }),
      });
    } else if (stateDirPerms.groupReadable || stateDirPerms.worldReadable) {
      findings.push({
        checkId: "fs.state_dir.perms_readable",
        severity: "warn",
        title: "状态目录可被他人读取",
        detail: `${formatPermissionDetail(params.stateDir, stateDirPerms)}；建议限制为 700。`,
        remediation: formatPermissionRemediation({
          targetPath: params.stateDir,
          perms: stateDirPerms,
          isDir: true,
          posixMode: 0o700,
          env: params.env,
        }),
      });
    }
  }

  const configPerms = await inspectPathPermissions(params.configPath, {
    env: params.env,
    platform: params.platform,
    exec: params.execIcacls,
  });
  if (configPerms.ok) {
    const skipReadablePermWarnings = configPerms.isSymlink;
    if (configPerms.isSymlink) {
      findings.push({
        checkId: "fs.config.symlink",
        severity: "warn",
        title: "配置文件是符号链接",
        detail: `${params.configPath} 是符号链接；请确保你信任其目标。`,
      });
    }
    if (configPerms.worldWritable || configPerms.groupWritable) {
      findings.push({
        checkId: "fs.config.perms_writable",
        severity: "critical",
        title: "配置文件可被他人写入",
        detail: `${formatPermissionDetail(params.configPath, configPerms)}；其他用户可能更改网关/认证/工具策略。`,
        remediation: formatPermissionRemediation({
          targetPath: params.configPath,
          perms: configPerms,
          isDir: false,
          posixMode: 0o600,
          env: params.env,
        }),
      });
    } else if (!skipReadablePermWarnings && configPerms.worldReadable) {
      findings.push({
        checkId: "fs.config.perms_world_readable",
        severity: "critical",
        title: "配置文件全局可读",
        detail: `${formatPermissionDetail(params.configPath, configPerms)}；配置可能包含令牌和私有设置。`,
        remediation: formatPermissionRemediation({
          targetPath: params.configPath,
          perms: configPerms,
          isDir: false,
          posixMode: 0o600,
          env: params.env,
        }),
      });
    } else if (!skipReadablePermWarnings && configPerms.groupReadable) {
      findings.push({
        checkId: "fs.config.perms_group_readable",
        severity: "warn",
        title: "配置文件组可读",
        detail: `${formatPermissionDetail(params.configPath, configPerms)}；配置可能包含令牌和私有设置。`,
        remediation: formatPermissionRemediation({
          targetPath: params.configPath,
          perms: configPerms,
          isDir: false,
          posixMode: 0o600,
          env: params.env,
        }),
      });
    }
  }

  return findings;
}

function collectGatewayConfigFindings(
  cfg: OpenClawConfig,
  env: NodeJS.ProcessEnv,
): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];

  const bind = typeof cfg.gateway?.bind === "string" ? cfg.gateway.bind : "loopback";
  const tailscaleMode = cfg.gateway?.tailscale?.mode ?? "off";
  const auth = resolveGatewayAuth({ authConfig: cfg.gateway?.auth, tailscaleMode, env });
  const controlUiEnabled = cfg.gateway?.controlUi?.enabled !== false;
  const controlUiAllowedOrigins = (cfg.gateway?.controlUi?.allowedOrigins ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  const dangerouslyAllowHostHeaderOriginFallback =
    cfg.gateway?.controlUi?.dangerouslyAllowHostHeaderOriginFallback === true;
  const trustedProxies = Array.isArray(cfg.gateway?.trustedProxies)
    ? cfg.gateway.trustedProxies
    : [];
  const hasToken = typeof auth.token === "string" && auth.token.trim().length > 0;
  const hasPassword = typeof auth.password === "string" && auth.password.trim().length > 0;
  const envTokenConfigured =
    hasNonEmptyString(env.OPENCLAW_GATEWAY_TOKEN) || hasNonEmptyString(env.CLAWDBOT_GATEWAY_TOKEN);
  const envPasswordConfigured =
    hasNonEmptyString(env.OPENCLAW_GATEWAY_PASSWORD) ||
    hasNonEmptyString(env.CLAWDBOT_GATEWAY_PASSWORD);
  const tokenConfiguredFromConfig = hasConfiguredSecretInput(
    cfg.gateway?.auth?.token,
    cfg.secrets?.defaults,
  );
  const passwordConfiguredFromConfig = hasConfiguredSecretInput(
    cfg.gateway?.auth?.password,
    cfg.secrets?.defaults,
  );
  const remoteTokenConfigured = hasConfiguredSecretInput(
    cfg.gateway?.remote?.token,
    cfg.secrets?.defaults,
  );
  const explicitAuthMode = cfg.gateway?.auth?.mode;
  const tokenCanWin =
    hasToken || envTokenConfigured || tokenConfiguredFromConfig || remoteTokenConfigured;
  const passwordCanWin =
    explicitAuthMode === "password" ||
    (explicitAuthMode !== "token" &&
      explicitAuthMode !== "none" &&
      explicitAuthMode !== "trusted-proxy" &&
      !tokenCanWin);
  const tokenConfigured = tokenCanWin;
  const passwordConfigured =
    hasPassword || (passwordCanWin && (envPasswordConfigured || passwordConfiguredFromConfig));
  const hasSharedSecret =
    explicitAuthMode === "token"
      ? tokenConfigured
      : explicitAuthMode === "password"
        ? passwordConfigured
        : explicitAuthMode === "none" || explicitAuthMode === "trusted-proxy"
          ? false
          : tokenConfigured || passwordConfigured;
  const hasTailscaleAuth = auth.allowTailscale && tailscaleMode === "serve";
  const hasGatewayAuth = hasSharedSecret || hasTailscaleAuth;
  const allowRealIpFallback = cfg.gateway?.allowRealIpFallback === true;
  const mdnsMode = cfg.discovery?.mdns?.mode ?? "minimal";

  // HTTP /tools/invoke is intended for narrow automation, not session orchestration/admin operations.
  // If operators opt-in to re-enabling these tools over HTTP, warn loudly so the choice is explicit.
  const gatewayToolsAllowRaw = Array.isArray(cfg.gateway?.tools?.allow)
    ? cfg.gateway?.tools?.allow
    : [];
  const gatewayToolsAllow = new Set(
    gatewayToolsAllowRaw
      .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
      .filter(Boolean),
  );
  const reenabledOverHttp = DEFAULT_GATEWAY_HTTP_TOOL_DENY.filter((name) =>
    gatewayToolsAllow.has(name),
  );
  if (reenabledOverHttp.length > 0) {
    const extraRisk = bind !== "loopback" || tailscaleMode === "funnel";
    findings.push({
      checkId: "gateway.tools_invoke_http.dangerous_allow",
      severity: extraRisk ? "critical" : "warn",
      title: "网关 HTTP /tools/invoke 重新启用了危险工具",
      detail:
        `gateway.tools.allow 包含 ${reenabledOverHttp.join(", ")} ，这将它们从默认 HTTP 拒绝列表中移除。` +
        "这可能允许通过 HTTP 进行远程会话生成/控制平面操作，并增加网关可达时的 RCE 爆炸半径。",
      remediation:
        "从 gateway.tools.allow 中移除这些条目（推荐）。" +
        "如果保留启用，请保持 gateway.bind 为本地回环（或仅 tailnet），限制网络暴露，并将网关令牌/密码视为完全管理权限。",
    });
  }
  if (bind !== "loopback" && !hasSharedSecret && auth.mode !== "trusted-proxy") {
    findings.push({
      checkId: "gateway.bind_no_auth",
      severity: "critical",
      title: "网关绑定超出本地回环但无认证",
      detail: `gateway.bind="${bind}" 但未配置 gateway.auth 令牌/密码。`,
      remediation: `设置 gateway.auth（推荐令牌）或绑定到本地回环。`,
    });
  }

  if (bind === "loopback" && controlUiEnabled && trustedProxies.length === 0) {
    findings.push({
      checkId: "gateway.trusted_proxies_missing",
      severity: "warn",
      title: "反向代理头未被信任",
      detail:
        "gateway.bind 为本地回环且 gateway.trustedProxies 为空。" +
        "如果通过反向代理暴露控制 UI，请配置受信任代理" +
        "以防止本地客户端检查被伪造。",
      remediation:
        "将 gateway.trustedProxies 设置为你的代理 IP，或保持控制 UI 仅本地访问。",
    });
  }

  if (bind === "loopback" && controlUiEnabled && !hasGatewayAuth) {
    findings.push({
      checkId: "gateway.loopback_no_auth",
      severity: "critical",
      title: "本地回环网关缺少认证",
      detail:
        "gateway.bind 为本地回环但未配置网关认证密钥。" +
        "如果控制 UI 通过反向代理暴露，可能存在未认证访问。",
      remediation: "设置 gateway.auth（推荐令牌）或保持控制 UI 仅本地访问。",
    });
  }
  if (
    bind !== "loopback" &&
    controlUiEnabled &&
    controlUiAllowedOrigins.length === 0 &&
    !dangerouslyAllowHostHeaderOriginFallback
  ) {
    findings.push({
      checkId: "gateway.control_ui.allowed_origins_required",
      severity: "critical",
      title: "非本地回环控制 UI 缺少明确的允许源",
      detail:
        "控制 UI 在非本地回环绑定上启用但 gateway.controlUi.allowedOrigins 为空。" +
        "严格源策略要求非本地回环部署必须有明确的允许源。",
      remediation:
        "将 gateway.controlUi.allowedOrigins 设置为完整的受信任源（例如 https://control.example.com）。" +
        "如果你的部署有意依赖 Host 头源回退，请设置 gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback=true。",
    });
  }
  if (controlUiAllowedOrigins.includes("*")) {
    const exposed = bind !== "loopback";
    findings.push({
      checkId: "gateway.control_ui.allowed_origins_wildcard",
      severity: exposed ? "critical" : "warn",
      title: "控制 UI 允许源包含通配符",
      detail:
        'gateway.controlUi.allowedOrigins 包含 "*"，这实际上禁用了控制 UI/WebChat 请求的源允许列表。',
      remediation:
        "用明确的受信任源替换通配符源（例如 https://control.example.com）。",
    });
  }
  if (dangerouslyAllowHostHeaderOriginFallback) {
    const exposed = bind !== "loopback";
    findings.push({
      checkId: "gateway.control_ui.host_header_origin_fallback",
      severity: exposed ? "critical" : "warn",
      title: "危险：Host 头源回退已启用",
      detail:
        "gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback=true 启用了 Host 头源回退" +
        "，削弱了控制 UI/WebChat WebSocket 检查的 DNS 重绑定保护。",
      remediation:
        "禁用 gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback 并配置明确的 gateway.controlUi.allowedOrigins。",
    });
  }

  if (allowRealIpFallback) {
    const hasNonLoopbackTrustedProxy = trustedProxies.some(
      (proxy) => !isStrictLoopbackTrustedProxyEntry(proxy),
    );
    const exposed =
      bind !== "loopback" || (auth.mode === "trusted-proxy" && hasNonLoopbackTrustedProxy);
    findings.push({
      checkId: "gateway.real_ip_fallback_enabled",
      severity: exposed ? "critical" : "warn",
      title: "X-Real-IP 回退已启用",
      detail:
        "gateway.allowRealIpFallback=true 在受信任代理省略 X-Forwarded-For 时信任 X-Real-IP。" +
        "配置错误的代理转发客户端提供的 X-Real-IP 可能伪造源 IP 和本地客户端检查。",
      remediation:
        "保持 gateway.allowRealIpFallback=false（默认）。仅在你的受信任代理" +
        "始终覆写 X-Real-IP 且无法提供 X-Forwarded-For 时启用。",
    });
  }

  if (mdnsMode === "full") {
    const exposed = bind !== "loopback";
    findings.push({
      checkId: "discovery.mdns_full_mode",
      severity: exposed ? "critical" : "warn",
      title: "mDNS 完整模式可能泄露主机元数据",
      detail:
        'discovery.mdns.mode="full" 在局域网 TXT 记录中发布 cliPath/sshPort。' +
        "这可能暴露用户名、文件系统布局和管理端口。",
      remediation:
        '优先使用 discovery.mdns.mode="minimal"（推荐）或 "off"，特别是当 gateway.bind 不是本地回环时。',
    });
  }

  if (tailscaleMode === "funnel") {
    findings.push({
      checkId: "gateway.tailscale_funnel",
      severity: "critical",
      title: "Tailscale Funnel 暴露已启用",
      detail: `gateway.tailscale.mode="funnel" 将网关公开暴露；请保持严格认证并视为面向互联网。`,
      remediation: `优先使用 tailscale.mode="serve"（仅 tailnet）或设置 tailscale.mode="off"。`,
    });
  } else if (tailscaleMode === "serve") {
    findings.push({
      checkId: "gateway.tailscale_serve",
      severity: "info",
      title: "Tailscale Serve 暴露已启用",
      detail: `gateway.tailscale.mode="serve" 将网关暴露到你的 tailnet（Tailscale 后的本地回环）。`,
    });
  }

  if (cfg.gateway?.controlUi?.allowInsecureAuth === true) {
    findings.push({
      checkId: "gateway.control_ui.insecure_auth",
      severity: "warn",
      title: "控制 UI 不安全认证开关已启用",
      detail:
        "gateway.controlUi.allowInsecureAuth=true 不会绕过安全上下文或设备身份检查；只有 dangerouslyDisableDeviceAuth 才会禁用控制 UI 设备身份检查。",
      remediation: "禁用它或切换到 HTTPS（Tailscale Serve）或 localhost。",
    });
  }

  if (cfg.gateway?.controlUi?.dangerouslyDisableDeviceAuth === true) {
    findings.push({
      checkId: "gateway.control_ui.device_auth_disabled",
      severity: "critical",
      title: "危险：控制 UI 设备认证已禁用",
      detail:
        "gateway.controlUi.dangerouslyDisableDeviceAuth=true 禁用了控制 UI 的设备身份检查。",
      remediation: "禁用它，除非你处于短期紧急处理场景。",
    });
  }

  if (isFeishuDocToolEnabled(cfg)) {
    findings.push({
      checkId: "channels.feishu.doc_owner_open_id",
      severity: "warn",
      title: "飞书文档创建可能授予请求者权限",
      detail:
        'channels.feishu 工具包含 "doc"；feishu_doc 操作 "create" 可以向受信任的请求飞书用户授予文档访问权限。',
      remediation:
        "不需要时禁用 channels.feishu.tools.doc，并限制不受信任提示的工具访问。",
    });
  }

  const enabledDangerousFlags = collectEnabledInsecureOrDangerousFlags(cfg);
  if (enabledDangerousFlags.length > 0) {
    findings.push({
      checkId: "config.insecure_or_dangerous_flags",
      severity: "warn",
      title: "已启用不安全或危险的配置标志",
      detail: `检测到 ${enabledDangerousFlags.length} 个已启用的标志：${enabledDangerousFlags.join(", ")}。`,
      remediation:
        "在未进行调试时禁用这些标志，或将部署范围限制为受信任/仅本地网络。",
    });
  }

  const token =
    typeof auth.token === "string" && auth.token.trim().length > 0 ? auth.token.trim() : null;
  if (auth.mode === "token" && token && token.length < 24) {
    findings.push({
      checkId: "gateway.token_too_short",
      severity: "warn",
      title: "网关令牌看起来过短",
      detail: `网关认证令牌为 ${token.length} 个字符；建议使用较长的随机令牌。`,
    });
  }

  if (auth.mode === "trusted-proxy") {
    const trustedProxies = cfg.gateway?.trustedProxies ?? [];
    const trustedProxyConfig = cfg.gateway?.auth?.trustedProxy;

    findings.push({
      checkId: "gateway.trusted_proxy_auth",
      severity: "critical",
      title: "受信任代理认证模式已启用",
      detail:
        'gateway.auth.mode="trusted-proxy" 将认证委托给反向代理。' +
        "确保你的代理（Pomerium、Caddy、nginx）正确处理认证，且 gateway.trustedProxies " +
        "仅包含实际代理服务器的 IP。",
      remediation:
        "验证：(1) 你的代理终止 TLS 并认证用户。" +
        "(2) gateway.trustedProxies 仅限代理 IP。" +
        "(3) 防火墙阻止对网关端口的直接访问。" +
        "参见 /gateway/trusted-proxy-auth 获取设置指南。",
    });

    if (trustedProxies.length === 0) {
      findings.push({
        checkId: "gateway.trusted_proxy_no_proxies",
        severity: "critical",
        title: "受信任代理认证已启用但未配置受信任代理",
        detail:
          'gateway.auth.mode="trusted-proxy" 但 gateway.trustedProxies 为空。' +
          "所有请求将被拒绝。",
        remediation: "将 gateway.trustedProxies 设置为你的反向代理 IP。",
      });
    }

    if (!trustedProxyConfig?.userHeader) {
      findings.push({
        checkId: "gateway.trusted_proxy_no_user_header",
        severity: "critical",
        title: "受信任代理认证缺少 userHeader 配置",
        detail:
          'gateway.auth.mode="trusted-proxy" 但未配置 gateway.auth.trustedProxy.userHeader。',
        remediation:
          "将 gateway.auth.trustedProxy.userHeader 设置为你的代理使用的头名称" +
          '（例如 "x-forwarded-user"、"x-pomerium-claim-email"）。',
      });
    }

    const allowUsers = trustedProxyConfig?.allowUsers ?? [];
    if (allowUsers.length === 0) {
      findings.push({
        checkId: "gateway.trusted_proxy_no_allowlist",
        severity: "warn",
        title: "受信任代理认证允许所有已认证用户",
        detail:
          "gateway.auth.trustedProxy.allowUsers 为空，因此你的代理认证的任何用户都可以访问网关。",
        remediation:
          "考虑设置 gateway.auth.trustedProxy.allowUsers 以限制特定用户的访问" +
          '（例如 ["nick@example.com"]）。',
      });
    }
  }

  if (bind !== "loopback" && auth.mode !== "trusted-proxy" && !cfg.gateway?.auth?.rateLimit) {
    findings.push({
      checkId: "gateway.auth_no_rate_limit",
      severity: "warn",
      title: "未配置认证速率限制",
      detail:
        "gateway.bind 不是本地回环但未配置 gateway.auth.rateLimit。" +
        "没有速率限制，暴力认证攻击无法被缓解。",
      remediation:
        "设置 gateway.auth.rateLimit（例如 { maxAttempts: 10, windowMs: 60000, lockoutMs: 300000 }）。",
    });
  }

  return findings;
}

// Keep this stricter than isLoopbackAddress on purpose: this check is for
// trust boundaries, so only explicit localhost proxy hops are treated as local.
function isStrictLoopbackTrustedProxyEntry(entry: string): boolean {
  const candidate = entry.trim();
  if (!candidate) {
    return false;
  }
  if (!candidate.includes("/")) {
    return candidate === "127.0.0.1" || candidate.toLowerCase() === "::1";
  }

  const [rawIp, rawPrefix] = candidate.split("/", 2);
  if (!rawIp || !rawPrefix) {
    return false;
  }
  const ipVersion = isIP(rawIp.trim());
  const prefix = Number.parseInt(rawPrefix.trim(), 10);
  if (!Number.isInteger(prefix)) {
    return false;
  }
  if (ipVersion === 4) {
    return rawIp.trim() === "127.0.0.1" && prefix === 32;
  }
  if (ipVersion === 6) {
    return prefix === 128 && rawIp.trim().toLowerCase() === "::1";
  }
  return false;
}

function collectBrowserControlFindings(
  cfg: OpenClawConfig,
  env: NodeJS.ProcessEnv,
): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];

  let resolved: ReturnType<typeof resolveBrowserConfig>;
  try {
    resolved = resolveBrowserConfig(cfg.browser, cfg);
  } catch (err) {
    findings.push({
      checkId: "browser.control_invalid_config",
      severity: "warn",
      title: "浏览器控制配置看起来无效",
      detail: String(err),
      remediation: `Fix browser.cdpUrl in ${resolveConfigPath()} and re-run "${formatCliCommand("openclaw security audit --deep")}".`,
    });
    return findings;
  }

  if (!resolved.enabled) {
    return findings;
  }

  const browserAuth = resolveBrowserControlAuth(cfg, env);
  const explicitAuthMode = cfg.gateway?.auth?.mode;
  const tokenConfigured =
    Boolean(browserAuth.token) ||
    hasNonEmptyString(env.OPENCLAW_GATEWAY_TOKEN) ||
    hasNonEmptyString(env.CLAWDBOT_GATEWAY_TOKEN) ||
    hasConfiguredSecretInput(cfg.gateway?.auth?.token, cfg.secrets?.defaults);
  const passwordCanWin =
    explicitAuthMode === "password" ||
    (explicitAuthMode !== "token" &&
      explicitAuthMode !== "none" &&
      explicitAuthMode !== "trusted-proxy" &&
      !tokenConfigured);
  const passwordConfigured =
    Boolean(browserAuth.password) ||
    (passwordCanWin &&
      (hasNonEmptyString(env.OPENCLAW_GATEWAY_PASSWORD) ||
        hasNonEmptyString(env.CLAWDBOT_GATEWAY_PASSWORD) ||
        hasConfiguredSecretInput(cfg.gateway?.auth?.password, cfg.secrets?.defaults)));
  if (!tokenConfigured && !passwordConfigured) {
    findings.push({
      checkId: "browser.control_no_auth",
      severity: "critical",
      title: "浏览器控制无认证",
      detail:
        "浏览器控制 HTTP 路由已启用但未配置 gateway.auth 令牌/密码。" +
        "任何本地进程（或 SSRF 到本地回环）都可以调用浏览器控制端点。",
      remediation:
        "设置 gateway.auth.token（推荐）或 gateway.auth.password 以使浏览器控制 HTTP 路由需要认证。启用浏览器控制时重启网关将自动生成 gateway.auth.token。",
    });
  }

  for (const name of Object.keys(resolved.profiles)) {
    const profile = resolveProfile(resolved, name);
    if (!profile || profile.cdpIsLoopback) {
      continue;
    }
    let url: URL;
    try {
      url = new URL(profile.cdpUrl);
    } catch {
      continue;
    }
    const redactedCdpUrl = redactCdpUrl(profile.cdpUrl) ?? profile.cdpUrl;
    if (url.protocol === "http:") {
      findings.push({
        checkId: "browser.remote_cdp_http",
        severity: "warn",
        title: "远程 CDP 使用 HTTP",
        detail: `浏览器配置文件 "${name}" 使用 http CDP（${profile.cdpUrl}）；仅在 tailnet 内或加密隧道后才可接受。`,
        remediation: `优先使用 HTTPS/TLS 或仅 tailnet 端点作为远程 CDP。`,
      });
    }
    if (
      isPrivateNetworkAllowedByPolicy(resolved.ssrfPolicy) &&
      isBlockedHostnameOrIp(url.hostname)
    ) {
      findings.push({
        checkId: "browser.remote_cdp_private_host",
        severity: "warn",
        title: "Remote CDP targets a private/internal host",
        detail:
          `browser profile "${name}" points at a private/internal CDP host (${redactedCdpUrl}). ` +
          "This is expected for LAN/tailnet/WSL-style setups, but treat it as a trusted-network endpoint.",
        remediation:
          "Prefer a tailnet or tunnel for remote CDP. If you want strict blocking, set browser.ssrfPolicy.dangerouslyAllowPrivateNetwork=false and allow only explicit hosts.",
      });
    }
  }

  return findings;
}

function collectLoggingFindings(cfg: OpenClawConfig): SecurityAuditFinding[] {
  const redact = cfg.logging?.redactSensitive;
  if (redact !== "off") {
    return [];
  }
  return [
    {
      checkId: "logging.redact_off",
      severity: "warn",
      title: "工具摘要编辑已禁用",
      detail: `logging.redactSensitive="off" 可能将密钥泄露到日志和状态输出中。`,
      remediation: `设置 logging.redactSensitive="tools"。`,
    },
  ];
}

function collectElevatedFindings(cfg: OpenClawConfig): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  const enabled = cfg.tools?.elevated?.enabled;
  const allowFrom = cfg.tools?.elevated?.allowFrom ?? {};
  const anyAllowFromKeys = Object.keys(allowFrom).length > 0;

  if (enabled === false) {
    return findings;
  }
  if (!anyAllowFromKeys) {
    return findings;
  }

  for (const [provider, list] of Object.entries(allowFrom)) {
    const normalized = normalizeAllowFromList(list);
    if (normalized.includes("*")) {
      findings.push({
        checkId: `tools.elevated.allowFrom.${provider}.wildcard`,
        severity: "critical",
        title: "提权执行允许列表包含通配符",
        detail: `tools.elevated.allowFrom.${provider} 包含 "*"，这实际上批准了该频道上所有人的提权模式。`,
      });
    } else if (normalized.length > 25) {
      findings.push({
        checkId: `tools.elevated.allowFrom.${provider}.large`,
        severity: "warn",
        title: "提权执行允许列表过大",
        detail: `tools.elevated.allowFrom.${provider} 有 ${normalized.length} 个条目；建议收紧提权访问。`,
      });
    }
  }

  return findings;
}

function collectExecRuntimeFindings(cfg: OpenClawConfig): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  const globalExecHost = cfg.tools?.exec?.host;
  const defaultSandboxMode = resolveSandboxConfigForAgent(cfg).mode;
  const defaultHostIsExplicitSandbox = globalExecHost === "sandbox";

  if (defaultHostIsExplicitSandbox && defaultSandboxMode === "off") {
    findings.push({
      checkId: "tools.exec.host_sandbox_no_sandbox_defaults",
      severity: "warn",
      title: "执行主机为沙箱但沙箱模式已关闭",
      detail:
        "tools.exec.host 显式设置为 sandbox 但 agents.defaults.sandbox.mode=off。" +
        "在此模式下，执行直接在网关主机上运行。",
      remediation:
        '启用沙箱模式（`agents.defaults.sandbox.mode="non-main"` 或 `"all"`）或设置 tools.exec.host 为 "gateway" 并启用审批。',
    });
  }

  const agents = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];
  const riskyAgents = agents
    .filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        entry.tools?.exec?.host === "sandbox" &&
        resolveSandboxConfigForAgent(cfg, entry.id).mode === "off",
    )
    .map((entry) => entry.id)
    .slice(0, 5);

  if (riskyAgents.length > 0) {
    findings.push({
      checkId: "tools.exec.host_sandbox_no_sandbox_agents",
      severity: "warn",
      title: "代理执行主机使用沙箱但沙箱模式已关闭",
      detail:
        `agents.list.*.tools.exec.host 对以下代理设置为 sandbox：${riskyAgents.join(", ")}。` +
        "沙箱模式关闭时，执行直接在网关主机上运行。",
      remediation:
        '为这些代理启用沙箱模式（`agents.list[].sandbox.mode`）或设置它们的 tools.exec.host 为 "gateway"。',
    });
  }

  const normalizeConfiguredSafeBins = (entries: unknown): string[] => {
    if (!Array.isArray(entries)) {
      return [];
    }
    return Array.from(
      new Set(
        entries
          .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
          .filter((entry) => entry.length > 0),
      ),
    ).toSorted();
  };
  const normalizeConfiguredTrustedDirs = (entries: unknown): string[] => {
    if (!Array.isArray(entries)) {
      return [];
    }
    return normalizeTrustedSafeBinDirs(
      entries.filter((entry): entry is string => typeof entry === "string"),
    );
  };
  const classifyRiskySafeBinTrustedDir = (entry: string): string | null => {
    const raw = entry.trim();
    if (!raw) {
      return null;
    }
    if (!path.isAbsolute(raw)) {
      return "relative path (trust boundary depends on process cwd)";
    }
    const normalized = path.resolve(raw).replace(/\\/g, "/").toLowerCase();
    if (
      normalized === "/tmp" ||
      normalized.startsWith("/tmp/") ||
      normalized === "/var/tmp" ||
      normalized.startsWith("/var/tmp/") ||
      normalized === "/private/tmp" ||
      normalized.startsWith("/private/tmp/")
    ) {
      return "temporary directory is mutable and easy to poison";
    }
    if (
      normalized === "/usr/local/bin" ||
      normalized === "/opt/homebrew/bin" ||
      normalized === "/opt/local/bin" ||
      normalized === "/home/linuxbrew/.linuxbrew/bin"
    ) {
      return "package-manager bin directory (often user-writable)";
    }
    if (
      normalized.startsWith("/users/") ||
      normalized.startsWith("/home/") ||
      normalized.includes("/.local/bin")
    ) {
      return "home-scoped bin directory (typically user-writable)";
    }
    if (/^[a-z]:\/users\//.test(normalized)) {
      return "home-scoped bin directory (typically user-writable)";
    }
    return null;
  };

  const globalExec = cfg.tools?.exec;
  const riskyTrustedDirHits: string[] = [];
  const collectRiskyTrustedDirHits = (scopePath: string, entries: unknown): void => {
    for (const entry of normalizeConfiguredTrustedDirs(entries)) {
      const reason = classifyRiskySafeBinTrustedDir(entry);
      if (!reason) {
        continue;
      }
      riskyTrustedDirHits.push(`- ${scopePath}.safeBinTrustedDirs: ${entry} (${reason})`);
    }
  };
  collectRiskyTrustedDirHits("tools.exec", globalExec?.safeBinTrustedDirs);
  for (const entry of agents) {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string") {
      continue;
    }
    collectRiskyTrustedDirHits(
      `agents.list.${entry.id}.tools.exec`,
      entry.tools?.exec?.safeBinTrustedDirs,
    );
  }

  const interpreterHits: string[] = [];
  const globalSafeBins = normalizeConfiguredSafeBins(globalExec?.safeBins);
  if (globalSafeBins.length > 0) {
    const merged = resolveMergedSafeBinProfileFixtures({ global: globalExec }) ?? {};
    const interpreters = listInterpreterLikeSafeBins(globalSafeBins).filter((bin) => !merged[bin]);
    if (interpreters.length > 0) {
      interpreterHits.push(`- tools.exec.safeBins: ${interpreters.join(", ")}`);
    }
  }

  for (const entry of agents) {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string") {
      continue;
    }
    const agentExec = entry.tools?.exec;
    const agentSafeBins = normalizeConfiguredSafeBins(agentExec?.safeBins);
    if (agentSafeBins.length === 0) {
      continue;
    }
    const merged =
      resolveMergedSafeBinProfileFixtures({
        global: globalExec,
        local: agentExec,
      }) ?? {};
    const interpreters = listInterpreterLikeSafeBins(agentSafeBins).filter((bin) => !merged[bin]);
    if (interpreters.length === 0) {
      continue;
    }
    interpreterHits.push(
      `- agents.list.${entry.id}.tools.exec.safeBins: ${interpreters.join(", ")}`,
    );
  }

  if (interpreterHits.length > 0) {
    findings.push({
      checkId: "tools.exec.safe_bins_interpreter_unprofiled",
      severity: "warn",
      title: "safeBins 包含无显式配置文件的解释器/运行时二进制",
      detail:
        `检测到缺少显式配置文件的解释器类 safeBins 条目：\n${interpreterHits.join("\n")}\n` +
        "这些条目在与宽松的 argv 配置文件一起使用时可能将 safeBins 变成广泛的执行面。",
      remediation:
        "从 safeBins 中移除解释器/运行时二进制（优先使用允许列表条目）或定义加固的 tools.exec.safeBinProfiles.<bin> 规则。",
    });
  }

  if (riskyTrustedDirHits.length > 0) {
    findings.push({
      checkId: "tools.exec.safe_bin_trusted_dirs_risky",
      severity: "warn",
      title: "safeBinTrustedDirs 包含有风险的可变目录",
      detail:
        `检测到有风险的 safeBinTrustedDirs 条目：\n${riskyTrustedDirHits.slice(0, 10).join("\n")}` +
        (riskyTrustedDirHits.length > 10
          ? `\n- +${riskyTrustedDirHits.length - 10} 个更多条目。`
          : ""),
      remediation:
        "优先使用 root 拥有的不可变二进制，保持默认信任目录（/bin、/usr/bin），避免信任临时/主目录/包管理器路径，除非严格控制。",
    });
  }

  return findings;
}

async function maybeProbeGateway(params: {
  cfg: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  probe: typeof probeGateway;
}): Promise<{
  deep: SecurityAuditReport["deep"];
  authWarning?: string;
}> {
  const connection = buildGatewayConnectionDetails({ config: params.cfg });
  const url = connection.url;
  const isRemoteMode = params.cfg.gateway?.mode === "remote";
  const remoteUrlRaw =
    typeof params.cfg.gateway?.remote?.url === "string" ? params.cfg.gateway.remote.url.trim() : "";
  const remoteUrlMissing = isRemoteMode && !remoteUrlRaw;

  const authResolution =
    !isRemoteMode || remoteUrlMissing
      ? resolveGatewayProbeAuthSafe({ cfg: params.cfg, env: params.env, mode: "local" })
      : resolveGatewayProbeAuthSafe({ cfg: params.cfg, env: params.env, mode: "remote" });
  const res = await params
    .probe({ url, auth: authResolution.auth, timeoutMs: params.timeoutMs })
    .catch((err) => ({
      ok: false,
      url,
      connectLatencyMs: null,
      error: String(err),
      close: null,
      health: null,
      status: null,
      presence: null,
      configSnapshot: null,
    }));

  if (authResolution.warning && !res.ok) {
    res.error = res.error ? `${res.error}; ${authResolution.warning}` : authResolution.warning;
  }

  return {
    deep: {
      gateway: {
        attempted: true,
        url,
        ok: res.ok,
        error: res.ok ? null : res.error,
        close: res.close ? { code: res.close.code, reason: res.close.reason } : null,
      },
    },
    authWarning: authResolution.warning,
  };
}

async function createAuditExecutionContext(
  opts: SecurityAuditOptions,
): Promise<AuditExecutionContext> {
  const cfg = opts.config;
  const sourceConfig = opts.sourceConfig ?? opts.config;
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const includeFilesystem = opts.includeFilesystem !== false;
  const includeChannelSecurity = opts.includeChannelSecurity !== false;
  const deep = opts.deep === true;
  const deepTimeoutMs = Math.max(250, opts.deepTimeoutMs ?? 5000);
  const stateDir = opts.stateDir ?? resolveStateDir(env);
  const configPath = opts.configPath ?? resolveConfigPath(env, stateDir);
  const configSnapshot = includeFilesystem
    ? opts.configSnapshot !== undefined
      ? opts.configSnapshot
      : await readConfigSnapshotForAudit({ env, configPath }).catch(() => null)
    : null;
  return {
    cfg,
    sourceConfig,
    env,
    platform,
    includeFilesystem,
    includeChannelSecurity,
    deep,
    deepTimeoutMs,
    stateDir,
    configPath,
    execIcacls: opts.execIcacls,
    execDockerRawFn: opts.execDockerRawFn,
    probeGatewayFn: opts.probeGatewayFn,
    plugins: opts.plugins,
    configSnapshot,
    codeSafetySummaryCache: opts.codeSafetySummaryCache ?? new Map<string, Promise<unknown>>(),
  };
}

export async function runSecurityAudit(opts: SecurityAuditOptions): Promise<SecurityAuditReport> {
  const findings: SecurityAuditFinding[] = [];
  const context = await createAuditExecutionContext(opts);
  const { cfg, env, platform, stateDir, configPath } = context;

  findings.push(...collectAttackSurfaceSummaryFindings(cfg));
  findings.push(...collectSyncedFolderFindings({ stateDir, configPath }));

  findings.push(...collectGatewayConfigFindings(cfg, env));
  findings.push(...collectBrowserControlFindings(cfg, env));
  findings.push(...collectLoggingFindings(cfg));
  findings.push(...collectElevatedFindings(cfg));
  findings.push(...collectExecRuntimeFindings(cfg));
  findings.push(...collectHooksHardeningFindings(cfg, env));
  findings.push(...collectGatewayHttpNoAuthFindings(cfg, env));
  findings.push(...collectGatewayHttpSessionKeyOverrideFindings(cfg));
  findings.push(...collectSandboxDockerNoopFindings(cfg));
  findings.push(...collectSandboxDangerousConfigFindings(cfg));
  findings.push(...collectNodeDenyCommandPatternFindings(cfg));
  findings.push(...collectNodeDangerousAllowCommandFindings(cfg));
  findings.push(...collectMinimalProfileOverrideFindings(cfg));
  findings.push(...collectSecretsInConfigFindings(cfg));
  findings.push(...collectModelHygieneFindings(cfg));
  findings.push(...collectSmallModelRiskFindings({ cfg, env }));
  findings.push(...collectExposureMatrixFindings(cfg));
  findings.push(...collectLikelyMultiUserSetupFindings(cfg));

  if (context.includeFilesystem) {
    findings.push(
      ...(await collectFilesystemFindings({
        stateDir,
        configPath,
        env,
        platform,
        execIcacls: context.execIcacls,
      })),
    );
    if (context.configSnapshot) {
      findings.push(
        ...(await collectIncludeFilePermFindings({
          configSnapshot: context.configSnapshot,
          env,
          platform,
          execIcacls: context.execIcacls,
        })),
      );
    }
    findings.push(
      ...(await collectStateDeepFilesystemFindings({
        cfg,
        env,
        stateDir,
        platform,
        execIcacls: context.execIcacls,
      })),
    );
    findings.push(...(await collectWorkspaceSkillSymlinkEscapeFindings({ cfg })));
    findings.push(
      ...(await collectSandboxBrowserHashLabelFindings({
        execDockerRawFn: context.execDockerRawFn,
      })),
    );
    findings.push(...(await collectPluginsTrustFindings({ cfg, stateDir })));
    if (context.deep) {
      findings.push(
        ...(await collectPluginsCodeSafetyFindings({
          stateDir,
          summaryCache: context.codeSafetySummaryCache,
        })),
      );
      findings.push(
        ...(await collectInstalledSkillsCodeSafetyFindings({
          cfg,
          stateDir,
          summaryCache: context.codeSafetySummaryCache,
        })),
      );
    }
  }

  if (context.includeChannelSecurity) {
    const plugins = context.plugins ?? listChannelPlugins();
    findings.push(
      ...(await collectChannelSecurityFindings({
        cfg,
        sourceConfig: context.sourceConfig,
        plugins,
      })),
    );
  }

  const deepProbeResult = context.deep
    ? await maybeProbeGateway({
        cfg,
        env,
        timeoutMs: context.deepTimeoutMs,
        probe: context.probeGatewayFn ?? probeGateway,
      })
    : undefined;
  const deep = deepProbeResult?.deep;

  if (deep?.gateway?.attempted && !deep.gateway.ok) {
    findings.push({
      checkId: "gateway.probe_failed",
      severity: "warn",
      title: "网关探测失败（深度）",
      detail: deep.gateway.error ?? "网关不可达",
      remediation: `Run "${formatCliCommand("openclaw status --all")}" to debug connectivity/auth, then re-run "${formatCliCommand("openclaw security audit --deep")}".`,
    });
  }
  if (deepProbeResult?.authWarning) {
    findings.push({
      checkId: "gateway.probe_auth_secretref_unavailable",
      severity: "warn",
      title: "网关探测认证 SecretRef 不可用",
      detail: deepProbeResult.authWarning,
      remediation: `Set OPENCLAW_GATEWAY_TOKEN/OPENCLAW_GATEWAY_PASSWORD in this shell or resolve the external secret provider, then re-run "${formatCliCommand("openclaw security audit --deep")}".`,
    });
  }

  const summary = countBySeverity(findings);
  return { ts: Date.now(), summary, findings, deep };
}
