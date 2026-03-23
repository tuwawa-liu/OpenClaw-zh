import { resolveSandboxConfigForAgent } from "../agents/sandbox/config.js";
import { isDangerousNetworkMode, normalizeNetworkMode } from "../agents/sandbox/network-mode.js";
/**
 * Synchronous security audit collector functions.
 *
 * These functions analyze config-based security properties without I/O.
 */
import { resolveSandboxToolPolicyForAgent } from "../agents/sandbox/tool-policy.js";
import type { SandboxToolPolicy } from "../agents/sandbox/types.js";
import { getBlockedBindReason } from "../agents/sandbox/validate-sandbox-security.js";
import { isToolAllowedByPolicies } from "../agents/tool-policy-match.js";
import { resolveToolProfilePolicy } from "../agents/tool-policy.js";
import { resolveBrowserConfig } from "../browser/config.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import {
  resolveAgentModelFallbackValues,
  resolveAgentModelPrimaryValue,
} from "../config/model-input.js";
import type { AgentToolsConfig } from "../config/types.tools.js";
import { resolveGatewayAuth } from "../gateway/auth.js";
import { resolveAllowedAgentIds } from "../gateway/hooks-policy.js";
import {
  DEFAULT_DANGEROUS_NODE_COMMANDS,
  resolveNodeCommandAllowlist,
} from "../gateway/node-command-policy.js";
import { inferParamBFromIdOrName } from "../shared/model-param-b.js";
import { pickSandboxToolPolicy } from "./audit-tool-policy.js";

export type SecurityAuditFinding = {
  checkId: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
  remediation?: string;
};

const SMALL_MODEL_PARAM_B_MAX = 300;

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function summarizeGroupPolicy(cfg: OpenClawConfig): {
  open: number;
  allowlist: number;
  other: number;
} {
  const channels = cfg.channels as Record<string, unknown> | undefined;
  if (!channels || typeof channels !== "object") {
    return { open: 0, allowlist: 0, other: 0 };
  }
  let open = 0;
  let allowlist = 0;
  let other = 0;
  for (const value of Object.values(channels)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const section = value as Record<string, unknown>;
    const policy = section.groupPolicy;
    if (policy === "open") {
      open += 1;
    } else if (policy === "allowlist") {
      allowlist += 1;
    } else {
      other += 1;
    }
  }
  return { open, allowlist, other };
}

function isProbablySyncedPath(p: string): boolean {
  const s = p.toLowerCase();
  return (
    s.includes("icloud") ||
    s.includes("dropbox") ||
    s.includes("google drive") ||
    s.includes("googledrive") ||
    s.includes("onedrive")
  );
}

function looksLikeEnvRef(value: string): boolean {
  const v = value.trim();
  return v.startsWith("${") && v.endsWith("}");
}

function isGatewayRemotelyExposed(cfg: OpenClawConfig): boolean {
  const bind = typeof cfg.gateway?.bind === "string" ? cfg.gateway.bind : "loopback";
  if (bind !== "loopback") {
    return true;
  }
  const tailscaleMode = cfg.gateway?.tailscale?.mode ?? "off";
  return tailscaleMode === "serve" || tailscaleMode === "funnel";
}

type ModelRef = { id: string; source: string };

function addModel(models: ModelRef[], raw: unknown, source: string) {
  if (typeof raw !== "string") {
    return;
  }
  const id = raw.trim();
  if (!id) {
    return;
  }
  models.push({ id, source });
}

function collectModels(cfg: OpenClawConfig): ModelRef[] {
  const out: ModelRef[] = [];
  addModel(
    out,
    resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model),
    "agents.defaults.model.primary",
  );
  for (const f of resolveAgentModelFallbackValues(cfg.agents?.defaults?.model)) {
    addModel(out, f, "agents.defaults.model.fallbacks");
  }
  addModel(
    out,
    resolveAgentModelPrimaryValue(cfg.agents?.defaults?.imageModel),
    "agents.defaults.imageModel.primary",
  );
  for (const f of resolveAgentModelFallbackValues(cfg.agents?.defaults?.imageModel)) {
    addModel(out, f, "agents.defaults.imageModel.fallbacks");
  }

  const list = Array.isArray(cfg.agents?.list) ? cfg.agents?.list : [];
  for (const agent of list ?? []) {
    if (!agent || typeof agent !== "object") {
      continue;
    }
    const id =
      typeof (agent as { id?: unknown }).id === "string" ? (agent as { id: string }).id : "";
    const model = (agent as { model?: unknown }).model;
    if (typeof model === "string") {
      addModel(out, model, `agents.list.${id}.model`);
    } else if (model && typeof model === "object") {
      addModel(out, (model as { primary?: unknown }).primary, `agents.list.${id}.model.primary`);
      const fallbacks = (model as { fallbacks?: unknown }).fallbacks;
      if (Array.isArray(fallbacks)) {
        for (const f of fallbacks) {
          addModel(out, f, `agents.list.${id}.model.fallbacks`);
        }
      }
    }
  }
  return out;
}

const LEGACY_MODEL_PATTERNS: Array<{ id: string; re: RegExp; label: string }> = [
  { id: "openai.gpt35", re: /\bgpt-3\.5\b/i, label: "GPT-3.5 family" },
  { id: "anthropic.claude2", re: /\bclaude-(instant|2)\b/i, label: "Claude 2/Instant family" },
  { id: "openai.gpt4_legacy", re: /\bgpt-4-(0314|0613)\b/i, label: "Legacy GPT-4 snapshots" },
];

const WEAK_TIER_MODEL_PATTERNS: Array<{ id: string; re: RegExp; label: string }> = [
  { id: "anthropic.haiku", re: /\bhaiku\b/i, label: "Haiku tier (smaller model)" },
];

function isGptModel(id: string): boolean {
  return /\bgpt-/i.test(id);
}

function isGpt5OrHigher(id: string): boolean {
  return /\bgpt-5(?:\b|[.-])/i.test(id);
}

function isClaudeModel(id: string): boolean {
  return /\bclaude-/i.test(id);
}

function isClaude45OrHigher(id: string): boolean {
  // Match claude-*-4-5+, claude-*-45+, claude-*4.5+, or future 5.x+ majors.
  return /\bclaude-[^\s/]*?(?:-4-?(?:[5-9]|[1-9]\d)\b|4\.(?:[5-9]|[1-9]\d)\b|-[5-9](?:\b|[.-]))/i.test(
    id,
  );
}

function extractAgentIdFromSource(source: string): string | null {
  const match = source.match(/^agents\.list\.([^.]*)\./);
  return match?.[1] ?? null;
}

function hasConfiguredDockerConfig(
  docker: Record<string, unknown> | undefined | null,
): docker is Record<string, unknown> {
  if (!docker || typeof docker !== "object") {
    return false;
  }
  return Object.values(docker).some((value) => value !== undefined);
}

function normalizeNodeCommand(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function listKnownNodeCommands(cfg: OpenClawConfig): Set<string> {
  const baseCfg: OpenClawConfig = {
    ...cfg,
    gateway: {
      ...cfg.gateway,
      nodes: {
        ...cfg.gateway?.nodes,
        denyCommands: [],
      },
    },
  };
  const out = new Set<string>();
  for (const platform of ["ios", "android", "macos", "linux", "windows", "unknown"]) {
    const allow = resolveNodeCommandAllowlist(baseCfg, { platform });
    for (const cmd of allow) {
      const normalized = normalizeNodeCommand(cmd);
      if (normalized) {
        out.add(normalized);
      }
    }
  }
  return out;
}

function looksLikeNodeCommandPattern(value: string): boolean {
  if (!value) {
    return false;
  }
  if (/[?*[\]{}(),|]/.test(value)) {
    return true;
  }
  if (
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.startsWith("^") ||
    value.endsWith("$")
  ) {
    return true;
  }
  return /\s/.test(value) || value.includes("group:");
}

function editDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (!a) {
    return b.length;
  }
  if (!b) {
    return a.length;
  }

  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }

  return dp[b.length];
}

function suggestKnownNodeCommands(unknown: string, known: Set<string>): string[] {
  const needle = unknown.trim();
  if (!needle) {
    return [];
  }

  // Fast path: prefix-ish suggestions.
  const prefix = needle.includes(".") ? needle.split(".").slice(0, 2).join(".") : needle;
  const prefixHits = Array.from(known)
    .filter((cmd) => cmd.startsWith(prefix))
    .slice(0, 3);
  if (prefixHits.length > 0) {
    return prefixHits;
  }

  // Fuzzy: Levenshtein over a small-ish known set.
  const ranked = Array.from(known)
    .map((cmd) => ({ cmd, d: editDistance(needle, cmd) }))
    .toSorted((a, b) => a.d - b.d || a.cmd.localeCompare(b.cmd));

  const best = ranked[0]?.d ?? Infinity;
  const threshold = Math.max(2, Math.min(4, best));
  return ranked
    .filter((r) => r.d <= threshold)
    .slice(0, 3)
    .map((r) => r.cmd);
}

function resolveToolPolicies(params: {
  cfg: OpenClawConfig;
  agentTools?: AgentToolsConfig;
  sandboxMode?: "off" | "non-main" | "all";
  agentId?: string | null;
}): SandboxToolPolicy[] {
  const policies: SandboxToolPolicy[] = [];
  const profile = params.agentTools?.profile ?? params.cfg.tools?.profile;
  const profilePolicy = resolveToolProfilePolicy(profile);
  if (profilePolicy) {
    policies.push(profilePolicy);
  }

  const globalPolicy = pickSandboxToolPolicy(params.cfg.tools ?? undefined);
  if (globalPolicy) {
    policies.push(globalPolicy);
  }

  const agentPolicy = pickSandboxToolPolicy(params.agentTools);
  if (agentPolicy) {
    policies.push(agentPolicy);
  }

  if (params.sandboxMode === "all") {
    const sandboxPolicy = resolveSandboxToolPolicyForAgent(params.cfg, params.agentId ?? undefined);
    policies.push(sandboxPolicy);
  }

  return policies;
}

function hasWebSearchKey(cfg: OpenClawConfig, env: NodeJS.ProcessEnv): boolean {
  const search = cfg.tools?.web?.search;
  return Boolean(
    search?.apiKey || search?.perplexity?.apiKey || env.BRAVE_API_KEY || env.PERPLEXITY_API_KEY,
  );
}

function isWebSearchEnabled(cfg: OpenClawConfig, env: NodeJS.ProcessEnv): boolean {
  const enabled = cfg.tools?.web?.search?.enabled;
  if (enabled === false) {
    return false;
  }
  if (enabled === true) {
    return true;
  }
  return hasWebSearchKey(cfg, env);
}

function isWebFetchEnabled(cfg: OpenClawConfig): boolean {
  const enabled = cfg.tools?.web?.fetch?.enabled;
  if (enabled === false) {
    return false;
  }
  return true;
}

function isBrowserEnabled(cfg: OpenClawConfig): boolean {
  try {
    return resolveBrowserConfig(cfg.browser, cfg).enabled;
  } catch {
    return true;
  }
}

function listGroupPolicyOpen(cfg: OpenClawConfig): string[] {
  const out: string[] = [];
  const channels = cfg.channels as Record<string, unknown> | undefined;
  if (!channels || typeof channels !== "object") {
    return out;
  }
  for (const [channelId, value] of Object.entries(channels)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const section = value as Record<string, unknown>;
    if (section.groupPolicy === "open") {
      out.push(`channels.${channelId}.groupPolicy`);
    }
    const accounts = section.accounts;
    if (accounts && typeof accounts === "object") {
      for (const [accountId, accountVal] of Object.entries(accounts)) {
        if (!accountVal || typeof accountVal !== "object") {
          continue;
        }
        const acc = accountVal as Record<string, unknown>;
        if (acc.groupPolicy === "open") {
          out.push(`channels.${channelId}.accounts.${accountId}.groupPolicy`);
        }
      }
    }
  }
  return out;
}

function hasConfiguredGroupTargets(section: Record<string, unknown>): boolean {
  const groupKeys = ["groups", "guilds", "channels", "rooms"];
  return groupKeys.some((key) => {
    const value = section[key];
    return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
  });
}

function listPotentialMultiUserSignals(cfg: OpenClawConfig): string[] {
  const out = new Set<string>();
  const channels = cfg.channels as Record<string, unknown> | undefined;
  if (!channels || typeof channels !== "object") {
    return [];
  }

  const inspectSection = (section: Record<string, unknown>, basePath: string) => {
    const groupPolicy = typeof section.groupPolicy === "string" ? section.groupPolicy : null;
    if (groupPolicy === "open") {
      out.add(`${basePath}.groupPolicy="open"`);
    } else if (groupPolicy === "allowlist" && hasConfiguredGroupTargets(section)) {
      out.add(`${basePath}.groupPolicy="allowlist" with configured group targets`);
    }

    const dmPolicy = typeof section.dmPolicy === "string" ? section.dmPolicy : null;
    if (dmPolicy === "open") {
      out.add(`${basePath}.dmPolicy="open"`);
    }

    const allowFrom = Array.isArray(section.allowFrom) ? section.allowFrom : [];
    if (allowFrom.some((entry) => String(entry).trim() === "*")) {
      out.add(`${basePath}.allowFrom includes "*"`);
    }

    const groupAllowFrom = Array.isArray(section.groupAllowFrom) ? section.groupAllowFrom : [];
    if (groupAllowFrom.some((entry) => String(entry).trim() === "*")) {
      out.add(`${basePath}.groupAllowFrom includes "*"`);
    }

    const dm = section.dm;
    if (dm && typeof dm === "object") {
      const dmSection = dm as Record<string, unknown>;
      const dmLegacyPolicy = typeof dmSection.policy === "string" ? dmSection.policy : null;
      if (dmLegacyPolicy === "open") {
        out.add(`${basePath}.dm.policy="open"`);
      }
      const dmAllowFrom = Array.isArray(dmSection.allowFrom) ? dmSection.allowFrom : [];
      if (dmAllowFrom.some((entry) => String(entry).trim() === "*")) {
        out.add(`${basePath}.dm.allowFrom includes "*"`);
      }
    }
  };

  for (const [channelId, value] of Object.entries(channels)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const section = value as Record<string, unknown>;
    inspectSection(section, `channels.${channelId}`);
    const accounts = section.accounts;
    if (!accounts || typeof accounts !== "object") {
      continue;
    }
    for (const [accountId, accountValue] of Object.entries(accounts)) {
      if (!accountValue || typeof accountValue !== "object") {
        continue;
      }
      inspectSection(
        accountValue as Record<string, unknown>,
        `channels.${channelId}.accounts.${accountId}`,
      );
    }
  }

  return Array.from(out);
}

function collectRiskyToolExposureContexts(cfg: OpenClawConfig): {
  riskyContexts: string[];
  hasRuntimeRisk: boolean;
} {
  const contexts: Array<{
    label: string;
    agentId?: string;
    tools?: AgentToolsConfig;
  }> = [{ label: "agents.defaults" }];
  for (const agent of cfg.agents?.list ?? []) {
    if (!agent || typeof agent !== "object" || typeof agent.id !== "string") {
      continue;
    }
    contexts.push({
      label: `agents.list.${agent.id}`,
      agentId: agent.id,
      tools: agent.tools,
    });
  }

  const riskyContexts: string[] = [];
  let hasRuntimeRisk = false;
  for (const context of contexts) {
    const sandboxMode = resolveSandboxConfigForAgent(cfg, context.agentId).mode;
    const policies = resolveToolPolicies({
      cfg,
      agentTools: context.tools,
      sandboxMode,
      agentId: context.agentId ?? null,
    });
    const runtimeTools = ["exec", "process"].filter((tool) =>
      isToolAllowedByPolicies(tool, policies),
    );
    const fsTools = ["read", "write", "edit", "apply_patch"].filter((tool) =>
      isToolAllowedByPolicies(tool, policies),
    );
    const fsWorkspaceOnly = context.tools?.fs?.workspaceOnly ?? cfg.tools?.fs?.workspaceOnly;
    const runtimeUnguarded = runtimeTools.length > 0 && sandboxMode !== "all";
    const fsUnguarded = fsTools.length > 0 && sandboxMode !== "all" && fsWorkspaceOnly !== true;
    if (!runtimeUnguarded && !fsUnguarded) {
      continue;
    }
    if (runtimeUnguarded) {
      hasRuntimeRisk = true;
    }
    riskyContexts.push(
      `${context.label} (sandbox=${sandboxMode}; runtime=[${runtimeTools.join(", ") || "off"}]; fs=[${fsTools.join(", ") || "off"}]; fs.workspaceOnly=${
        fsWorkspaceOnly === true ? "true" : "false"
      })`,
    );
  }

  return { riskyContexts, hasRuntimeRisk };
}

// --------------------------------------------------------------------------
// Exported collectors
// --------------------------------------------------------------------------

export function collectAttackSurfaceSummaryFindings(cfg: OpenClawConfig): SecurityAuditFinding[] {
  const group = summarizeGroupPolicy(cfg);
  const elevated = cfg.tools?.elevated?.enabled !== false;
  const webhooksEnabled = cfg.hooks?.enabled === true;
  const internalHooksEnabled = cfg.hooks?.internal?.enabled === true;
  const browserEnabled = cfg.browser?.enabled ?? true;

  const detail =
    `groups: open=${group.open}, allowlist=${group.allowlist}` +
    `\n` +
    `tools.elevated: ${elevated ? "已启用" : "已禁用"}` +
    `\n` +
    `hooks.webhooks: ${webhooksEnabled ? "已启用" : "已禁用"}` +
    `\n` +
    `hooks.internal: ${internalHooksEnabled ? "已启用" : "已禁用"}` +
    `\n` +
    `browser control: ${browserEnabled ? "已启用" : "已禁用"}` +
    `\n` +
    "信任模型：个人助理（单一受信操作者边界），非共享网关上的敌对多租户";

  return [
    {
      checkId: "summary.attack_surface",
      severity: "info",
      title: "攻击面摘要",
      detail,
    },
  ];
}

export function collectSyncedFolderFindings(params: {
  stateDir: string;
  configPath: string;
}): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  if (isProbablySyncedPath(params.stateDir) || isProbablySyncedPath(params.configPath)) {
    findings.push({
      checkId: "fs.synced_dir",
      severity: "warn",
      title: "状态/配置路径疑似同步文件夹",
      detail: `stateDir=${params.stateDir}, configPath=${params.configPath}。同步文件夹（iCloud/Dropbox/OneDrive/Google Drive）可能会将令牌和对话记录泄露到其他设备。`,
      remediation: `请将 OPENCLAW_STATE_DIR 设置在仅本地卷上，并重新运行 "${formatCliCommand("openclaw security audit --fix")}"。`,
    });
  }
  return findings;
}

export function collectSecretsInConfigFindings(cfg: OpenClawConfig): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  const password =
    typeof cfg.gateway?.auth?.password === "string" ? cfg.gateway.auth.password.trim() : "";
  if (password && !looksLikeEnvRef(password)) {
    findings.push({
      checkId: "config.secrets.gateway_password_in_config",
      severity: "warn",
      title: "网关密码存储在配置文件中",
      detail:
        "gateway.auth.password 已在配置文件中设置；建议尽可能使用环境变量来存储密钥。",
      remediation:
        "建议使用 OPENCLAW_GATEWAY_PASSWORD（环境变量），并从磁盘上的配置文件中移除 gateway.auth.password。",
    });
  }

  const hooksToken = typeof cfg.hooks?.token === "string" ? cfg.hooks.token.trim() : "";
  if (cfg.hooks?.enabled === true && hooksToken && !looksLikeEnvRef(hooksToken)) {
    findings.push({
      checkId: "config.secrets.hooks_token_in_config",
      severity: "info",
      title: "Hooks 令牌存储在配置文件中",
      detail:
        "hooks.token 已在配置文件中设置；请确保配置文件权限严格，并将其视为 API 密钥。",
    });
  }

  return findings;
}

export function collectHooksHardeningFindings(
  cfg: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  if (cfg.hooks?.enabled !== true) {
    return findings;
  }

  const token = typeof cfg.hooks?.token === "string" ? cfg.hooks.token.trim() : "";
  if (token && token.length < 24) {
    findings.push({
      checkId: "hooks.token_too_short",
      severity: "warn",
      title: "Hooks 令牌过短",
      detail: `hooks.token 长度为 ${token.length} 个字符；建议使用较长的随机令牌。`,
    });
  }

  const gatewayAuth = resolveGatewayAuth({
    authConfig: cfg.gateway?.auth,
    tailscaleMode: cfg.gateway?.tailscale?.mode ?? "off",
    env,
  });
  const openclawGatewayToken =
    typeof env.OPENCLAW_GATEWAY_TOKEN === "string" && env.OPENCLAW_GATEWAY_TOKEN.trim()
      ? env.OPENCLAW_GATEWAY_TOKEN.trim()
      : null;
  const gatewayToken =
    gatewayAuth.mode === "token" &&
    typeof gatewayAuth.token === "string" &&
    gatewayAuth.token.trim()
      ? gatewayAuth.token.trim()
      : openclawGatewayToken
        ? openclawGatewayToken
        : null;
  if (token && gatewayToken && token === gatewayToken) {
    findings.push({
      checkId: "hooks.token_reuse_gateway_token",
      severity: "critical",
      title: "Hooks 令牌复用了网关令牌",
      detail:
        "hooks.token 与 gateway.auth 令牌相同；一旦 hooks 泄露，影响范围将扩展到网关 API。",
      remediation: "请使用专用于 Hook 入口的独立 hooks.token。",
    });
  }

  const rawPath = typeof cfg.hooks?.path === "string" ? cfg.hooks.path.trim() : "";
  if (rawPath === "/") {
    findings.push({
      checkId: "hooks.path_root",
      severity: "critical",
      title: "Hooks 基础路径为 '/'",
      detail: "hooks.path='/' 会遮蔽其他 HTTP 端点，存在安全风险。",
      remediation: "请使用专用路径，如 '/hooks'。",
    });
  }

  const allowRequestSessionKey = cfg.hooks?.allowRequestSessionKey === true;
  const defaultSessionKey =
    typeof cfg.hooks?.defaultSessionKey === "string" ? cfg.hooks.defaultSessionKey.trim() : "";
  const allowedAgentIds = resolveAllowedAgentIds(cfg.hooks?.allowedAgentIds);
  const allowedPrefixes = Array.isArray(cfg.hooks?.allowedSessionKeyPrefixes)
    ? cfg.hooks.allowedSessionKeyPrefixes
        .map((prefix) => prefix.trim())
        .filter((prefix) => prefix.length > 0)
    : [];
  const remoteExposure = isGatewayRemotelyExposed(cfg);

  if (!defaultSessionKey) {
    findings.push({
      checkId: "hooks.default_session_key_unset",
      severity: "warn",
      title: "hooks.defaultSessionKey 未配置",
      detail:
        "Hook 代理未设置显式 sessionKey，将为每次请求生成密钥。请设置 hooks.defaultSessionKey 以将 Hook 入口限制在已知会话范围内。",
      remediation: '请设置 hooks.defaultSessionKey（例如 "hook:ingress"）。',
    });
  }

  if (allowedAgentIds === undefined) {
    findings.push({
      checkId: "hooks.allowed_agent_ids_unrestricted",
      severity: remoteExposure ? "critical" : "warn",
      title: "Hook agent routing allows any configured agent",
      detail:
        "hooks.allowedAgentIds is unset or includes '*', so authenticated hook callers may route to any configured agent id.",
      remediation:
        'Set hooks.allowedAgentIds to an explicit allowlist (for example, ["hooks", "main"]) or [] to deny explicit agent routing.',
    });
  }

  if (allowRequestSessionKey) {
    findings.push({
      checkId: "hooks.request_session_key_enabled",
      severity: remoteExposure ? "critical" : "warn",
      title: "外部 Hook 载荷可能覆盖 sessionKey",
      detail:
        "hooks.allowRequestSessionKey=true 允许 `/hooks/agent` 调用者选择会话密钥。除非同时限制前缀，否则应将 Hook 令牌持有者视为完全受信。",
      remediation:
        "建议设置 hooks.allowRequestSessionKey=false（推荐），或限制 hooks.allowedSessionKeyPrefixes。",
    });
  }

  if (allowRequestSessionKey && allowedPrefixes.length === 0) {
    findings.push({
      checkId: "hooks.request_session_key_prefixes_missing",
      severity: remoteExposure ? "critical" : "warn",
      title: "请求 sessionKey 覆盖已启用但无前缀限制",
      detail:
        "hooks.allowRequestSessionKey=true 且 hooks.allowedSessionKeyPrefixes 未设置/为空，因此请求载荷可以指定任意会话密钥格式。",
      remediation:
        '请设置 hooks.allowedSessionKeyPrefixes（例如 ["hook:"]）或禁用请求覆盖。',
    });
  }

  return findings;
}

export function collectGatewayHttpSessionKeyOverrideFindings(
  cfg: OpenClawConfig,
): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  const chatCompletionsEnabled = cfg.gateway?.http?.endpoints?.chatCompletions?.enabled === true;
  const responsesEnabled = cfg.gateway?.http?.endpoints?.responses?.enabled === true;
  if (!chatCompletionsEnabled && !responsesEnabled) {
    return findings;
  }

  const enabledEndpoints = [
    chatCompletionsEnabled ? "/v1/chat/completions" : null,
    responsesEnabled ? "/v1/responses" : null,
  ].filter((entry): entry is string => Boolean(entry));

  findings.push({
    checkId: "gateway.http.session_key_override_enabled",
    severity: "info",
    title: "HTTP API session-key 覆盖已启用",
    detail:
      `${enabledEndpoints.join(", ")} 接受 x-openclaw-session-key 进行每请求会话路由。` +
      "请将 API 凭据持有者视为受信主体。",
  });

  return findings;
}

export function collectGatewayHttpNoAuthFindings(
  cfg: OpenClawConfig,
  env: NodeJS.ProcessEnv,
): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  const tailscaleMode = cfg.gateway?.tailscale?.mode ?? "off";
  const auth = resolveGatewayAuth({ authConfig: cfg.gateway?.auth, tailscaleMode, env });
  if (auth.mode !== "none") {
    return findings;
  }

  const chatCompletionsEnabled = cfg.gateway?.http?.endpoints?.chatCompletions?.enabled === true;
  const responsesEnabled = cfg.gateway?.http?.endpoints?.responses?.enabled === true;
  const enabledEndpoints = [
    "/tools/invoke",
    chatCompletionsEnabled ? "/v1/chat/completions" : null,
    responsesEnabled ? "/v1/responses" : null,
  ].filter((entry): entry is string => Boolean(entry));

  const remoteExposure = isGatewayRemotelyExposed(cfg);
  findings.push({
    checkId: "gateway.http.no_auth",
    severity: remoteExposure ? "critical" : "warn",
    title: "网关 HTTP API 无需认证即可访问",
    detail:
      `gateway.auth.mode="none" 使 ${enabledEndpoints.join(", ")} 无需共享密钥即可调用。` +
      "请仅在受信本地环境使用，避免将网关暴露到回环地址以外。",
    remediation:
      "建议将 gateway.auth.mode 设置为 token/password（推荐）。如果您有意保持 mode=none，请保持 gateway.bind=loopback 并禁用可选 HTTP 端点。",
  });

  return findings;
}

export function collectSandboxDockerNoopFindings(cfg: OpenClawConfig): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  const configuredPaths: string[] = [];
  const agents = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];

  const defaultsSandbox = cfg.agents?.defaults?.sandbox;
  const hasDefaultDocker = hasConfiguredDockerConfig(
    defaultsSandbox?.docker as Record<string, unknown> | undefined,
  );
  const defaultMode = defaultsSandbox?.mode ?? "off";
  const hasAnySandboxEnabledAgent = agents.some((entry) => {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string") {
      return false;
    }
    return resolveSandboxConfigForAgent(cfg, entry.id).mode !== "off";
  });
  if (hasDefaultDocker && defaultMode === "off" && !hasAnySandboxEnabledAgent) {
    configuredPaths.push("agents.defaults.sandbox.docker");
  }

  for (const entry of agents) {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string") {
      continue;
    }
    if (!hasConfiguredDockerConfig(entry.sandbox?.docker as Record<string, unknown> | undefined)) {
      continue;
    }
    if (resolveSandboxConfigForAgent(cfg, entry.id).mode === "off") {
      configuredPaths.push(`agents.list.${entry.id}.sandbox.docker`);
    }
  }

  if (configuredPaths.length === 0) {
    return findings;
  }

  findings.push({
    checkId: "sandbox.docker_config_mode_off",
    severity: "warn",
    title: "沙箱 Docker 设置已配置但沙箱模式处于关闭状态",
    detail:
      "以下 Docker 设置在启用沙箱模式前不会生效：\n" +
      configuredPaths.map((entry) => `- ${entry}`).join("\n"),
    remediation:
      '请在需要的地方启用沙箱模式（`agents.defaults.sandbox.mode="non-main"` 或 `"all"`），或移除未使用的 Docker 设置。',
  });

  return findings;
}

export function collectSandboxDangerousConfigFindings(cfg: OpenClawConfig): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  const agents = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];

  const configs: Array<{ source: string; docker: Record<string, unknown> }> = [];
  const defaultDocker = cfg.agents?.defaults?.sandbox?.docker;
  if (defaultDocker && typeof defaultDocker === "object") {
    configs.push({
      source: "agents.defaults.sandbox.docker",
      docker: defaultDocker as Record<string, unknown>,
    });
  }
  for (const entry of agents) {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string") {
      continue;
    }
    const agentDocker = entry.sandbox?.docker;
    if (agentDocker && typeof agentDocker === "object") {
      configs.push({
        source: `agents.list.${entry.id}.sandbox.docker`,
        docker: agentDocker as Record<string, unknown>,
      });
    }
  }

  for (const { source, docker } of configs) {
    const binds = Array.isArray(docker.binds) ? docker.binds : [];
    for (const bind of binds) {
      if (typeof bind !== "string") {
        continue;
      }
      const blocked = getBlockedBindReason(bind);
      if (!blocked) {
        continue;
      }
      if (blocked.kind === "non_absolute") {
        findings.push({
          checkId: "sandbox.bind_mount_non_absolute",
          severity: "warn",
          title: "沙箱绑定挂载使用了非绝对源路径",
          detail:
            `${source}.binds 包含 "${bind}"，其源路径为 "${blocked.sourcePath}"。` +
            "非绝对绑定源路径难以安全验证，可能会以意外的方式解析。",
          remediation: `请将 "${bind}" 改写为绝对主机路径（例如：/home/user/project:/project:ro）。`,
        });
        continue;
      }
      if (blocked.kind !== "covers" && blocked.kind !== "targets") {
        continue;
      }
      const verb = blocked.kind === "covers" ? "covers" : "targets";
      findings.push({
        checkId: "sandbox.dangerous_bind_mount",
        severity: "critical",
        title: "沙箱配置中存在危险的绑定挂载",
        detail:
          `${source}.binds 包含 "${bind}"，它${verb}了被阻止的路径 "${blocked.blockedPath}"。` +
          "这可能会将主机系统目录或 Docker 套接字暴露给沙箱容器。",
        remediation: `请从 ${source}.binds 中移除 "${bind}"。改用项目特定路径。`,
      });
    }

    const network = typeof docker.network === "string" ? docker.network : undefined;
    const normalizedNetwork = normalizeNetworkMode(network);
    if (isDangerousNetworkMode(network)) {
      const modeLabel = normalizedNetwork === "host" ? '"host"' : `"${network}"`;
      const detail =
        normalizedNetwork === "host"
          ? `${source}.network 为 "host"，这将完全绕过容器网络隔离。`
          : `${source}.network 为 ${modeLabel}，将加入另一个容器的命名空间，可能绕过沙箱网络隔离。`;
      findings.push({
        checkId: "sandbox.dangerous_network_mode",
        severity: "critical",
        title: "沙箱配置中存在危险的网络模式",
        detail,
        remediation:
          `请将 ${source}.network 设置为 "bridge"、"none" 或自定义桥接网络名称。` +
          ` 仅在您完全信任此运行时时，使用 ${source}.dangerouslyAllowContainerNamespaceJoin=true 作为紧急覆盖。`,
      });
    }

    const seccompProfile =
      typeof docker.seccompProfile === "string" ? docker.seccompProfile : undefined;
    if (seccompProfile && seccompProfile.trim().toLowerCase() === "unconfined") {
      findings.push({
        checkId: "sandbox.dangerous_seccomp_profile",
        severity: "critical",
        title: "沙箱配置中 Seccomp 设为 unconfined",
        detail: `${source}.seccompProfile 为 "unconfined"，这将禁用系统调用过滤。`,
        remediation: `请移除 ${source}.seccompProfile 或使用自定义 seccomp 配置文件。`,
      });
    }

    const apparmorProfile =
      typeof docker.apparmorProfile === "string" ? docker.apparmorProfile : undefined;
    if (apparmorProfile && apparmorProfile.trim().toLowerCase() === "unconfined") {
      findings.push({
        checkId: "sandbox.dangerous_apparmor_profile",
        severity: "critical",
        title: "沙箱配置中 AppArmor 设为 unconfined",
        detail: `${source}.apparmorProfile 为 "unconfined"，这将禁用 AppArmor 强制执行。`,
        remediation: `请移除 ${source}.apparmorProfile 或使用命名的 AppArmor 配置文件。`,
      });
    }
  }

  const browserExposurePaths: string[] = [];
  const defaultBrowser = resolveSandboxConfigForAgent(cfg).browser;
  if (
    defaultBrowser.enabled &&
    defaultBrowser.network.trim().toLowerCase() === "bridge" &&
    !defaultBrowser.cdpSourceRange?.trim()
  ) {
    browserExposurePaths.push("agents.defaults.sandbox.browser");
  }
  for (const entry of agents) {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string") {
      continue;
    }
    const browser = resolveSandboxConfigForAgent(cfg, entry.id).browser;
    if (!browser.enabled) {
      continue;
    }
    if (browser.network.trim().toLowerCase() !== "bridge") {
      continue;
    }
    if (browser.cdpSourceRange?.trim()) {
      continue;
    }
    browserExposurePaths.push(`agents.list.${entry.id}.sandbox.browser`);
  }
  if (browserExposurePaths.length > 0) {
    findings.push({
      checkId: "sandbox.browser_cdp_bridge_unrestricted",
      severity: "warn",
      title: "沙箱浏览器 CDP 可能被对等容器访问",
      detail:
        "以下沙箱浏览器配置使用 Docker 桥接网络且未限制 CDP 来源：\n" +
        browserExposurePaths.map((entry) => `- ${entry}`).join("\n"),
      remediation:
        "建议将 sandbox.browser.network 设置为专用桥接网络（推荐默认值：openclaw-sandbox-browser），" +
        "或设置 sandbox.browser.cdpSourceRange（例如 172.21.0.1/32）以限制容器边缘的 CDP 入口。",
    });
  }

  return findings;
}

export function collectNodeDenyCommandPatternFindings(cfg: OpenClawConfig): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  const denyListRaw = cfg.gateway?.nodes?.denyCommands;
  if (!Array.isArray(denyListRaw) || denyListRaw.length === 0) {
    return findings;
  }

  const denyList = denyListRaw.map(normalizeNodeCommand).filter(Boolean);
  if (denyList.length === 0) {
    return findings;
  }

  const knownCommands = listKnownNodeCommands(cfg);
  const patternLike = denyList.filter((entry) => looksLikeNodeCommandPattern(entry));
  const unknownExact = denyList.filter(
    (entry) => !looksLikeNodeCommandPattern(entry) && !knownCommands.has(entry),
  );
  if (patternLike.length === 0 && unknownExact.length === 0) {
    return findings;
  }

  const detailParts: string[] = [];
  if (patternLike.length > 0) {
    detailParts.push(
      `类似模式的条目（精确匹配不支持）：${patternLike.join(", ")}`,
    );
  }
  if (unknownExact.length > 0) {
    const unknownDetails = unknownExact
      .map((entry) => {
        const suggestions = suggestKnownNodeCommands(entry, knownCommands);
        if (suggestions.length === 0) {
          return entry;
        }
        return `${entry} (did you mean: ${suggestions.join(", ")})`;
      })
      .join(", ");

    detailParts.push(`未知命令名称（不在 defaults/allowCommands 中）：${unknownDetails}`);
  }
  const examples = Array.from(knownCommands).slice(0, 8);

  findings.push({
    checkId: "gateway.nodes.deny_commands_ineffective",
    severity: "warn",
    title: "部分 gateway.nodes.denyCommands 条目无效",
    detail:
      "gateway.nodes.denyCommands 仅使用精确的节点命令名称匹配（例如 `system.run`），而非命令载荷中的 shell 文本过滤。\n" +
      detailParts.map((entry) => `- ${entry}`).join("\n"),
    remediation:
      `请使用精确命令名称（例如：${examples.join(", ")}）。` +
      "如需更广泛的限制，请从 allowCommands/默认工作流中移除有风险的命令 ID，并收紧 tools.exec 策略。",
  });

  return findings;
}

export function collectNodeDangerousAllowCommandFindings(
  cfg: OpenClawConfig,
): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  const allowRaw = cfg.gateway?.nodes?.allowCommands;
  if (!Array.isArray(allowRaw) || allowRaw.length === 0) {
    return findings;
  }

  const allow = new Set(allowRaw.map(normalizeNodeCommand).filter(Boolean));
  if (allow.size === 0) {
    return findings;
  }

  const deny = new Set((cfg.gateway?.nodes?.denyCommands ?? []).map(normalizeNodeCommand));
  const dangerousAllowed = DEFAULT_DANGEROUS_NODE_COMMANDS.filter(
    (cmd) => allow.has(cmd) && !deny.has(cmd),
  );
  if (dangerousAllowed.length === 0) {
    return findings;
  }

  findings.push({
    checkId: "gateway.nodes.allow_commands_dangerous",
    severity: isGatewayRemotelyExposed(cfg) ? "critical" : "warn",
    title: "危险的节点命令已被显式启用",
    detail:
      `gateway.nodes.allowCommands 包含：${dangerousAllowed.join(", ")}。` +
      "这些命令可触发高影响的设备操作（摄像头/屏幕/联系人/日历/提醒/短信）。",
    remediation:
      "建议从 gateway.nodes.allowCommands 中移除这些条目（推荐）。" +
      "如需保留，请将网关认证视为完整操作员访问权限，并保持网关暴露仅限本地/Tailscale 网络。",
  });

  return findings;
}

export function collectMinimalProfileOverrideFindings(cfg: OpenClawConfig): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  if (cfg.tools?.profile !== "minimal") {
    return findings;
  }

  const overrides = (cfg.agents?.list ?? [])
    .filter((entry): entry is { id: string; tools?: AgentToolsConfig } => {
      return Boolean(
        entry &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        entry.tools?.profile &&
        entry.tools.profile !== "minimal",
      );
    })
    .map((entry) => `${entry.id}=${entry.tools?.profile}`);

  if (overrides.length === 0) {
    return findings;
  }

  findings.push({
    checkId: "tools.profile_minimal_overridden",
    severity: "warn",
    title: "全局 tools.profile=minimal 被代理配置覆盖",
    detail:
      "全局已设置 minimal 配置文件，但以下代理配置文件优先级更高：\n" +
      overrides.map((entry) => `- agents.list.${entry}`).join("\n"),
    remediation:
      '如果您希望全局强制执行 minimal 工具，请将这些代理设置为 `tools.profile="minimal"`（或移除代理覆盖）。',
  });

  return findings;
}

export function collectModelHygieneFindings(cfg: OpenClawConfig): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  const models = collectModels(cfg);
  if (models.length === 0) {
    return findings;
  }

  const weakMatches = new Map<string, { model: string; source: string; reasons: string[] }>();
  const addWeakMatch = (model: string, source: string, reason: string) => {
    const key = `${model}@@${source}`;
    const existing = weakMatches.get(key);
    if (!existing) {
      weakMatches.set(key, { model, source, reasons: [reason] });
      return;
    }
    if (!existing.reasons.includes(reason)) {
      existing.reasons.push(reason);
    }
  };

  for (const entry of models) {
    for (const pat of WEAK_TIER_MODEL_PATTERNS) {
      if (pat.re.test(entry.id)) {
        addWeakMatch(entry.id, entry.source, pat.label);
        break;
      }
    }
    if (isGptModel(entry.id) && !isGpt5OrHigher(entry.id)) {
      addWeakMatch(entry.id, entry.source, "Below GPT-5 family");
    }
    if (isClaudeModel(entry.id) && !isClaude45OrHigher(entry.id)) {
      addWeakMatch(entry.id, entry.source, "Below Claude 4.5");
    }
  }

  const matches: Array<{ model: string; source: string; reason: string }> = [];
  for (const entry of models) {
    for (const pat of LEGACY_MODEL_PATTERNS) {
      if (pat.re.test(entry.id)) {
        matches.push({ model: entry.id, source: entry.source, reason: pat.label });
        break;
      }
    }
  }

  if (matches.length > 0) {
    const lines = matches
      .slice(0, 12)
      .map((m) => `- ${m.model} (${m.reason}) @ ${m.source}`)
      .join("\n");
    const more = matches.length > 12 ? `\n…${matches.length - 12} more` : "";
    findings.push({
      checkId: "models.legacy",
      severity: "warn",
      title: "部分已配置的模型为旧版",
      detail:
        "较旧/旧版模型对提示注入和工具滥用的防御能力较弱。\n" +
        lines +
        more,
      remediation: "建议为任何可运行工具的机器人使用现代、指令强化型模型。",
    });
  }

  if (weakMatches.size > 0) {
    const lines = Array.from(weakMatches.values())
      .slice(0, 12)
      .map((m) => `- ${m.model} (${m.reasons.join("; ")}) @ ${m.source}`)
      .join("\n");
    const more = weakMatches.size > 12 ? `\n…${weakMatches.size - 12} more` : "";
    findings.push({
      checkId: "models.weak_tier",
      severity: "warn",
      title: "部分已配置的模型低于推荐等级",
      detail:
        "较小/较旧的模型通常更容易受到提示注入和工具滥用的影响。\n" +
        lines +
        more,
      remediation:
        "建议为任何带有工具或不受信收件箱的机器人使用最新顶级模型。避免使用 Haiku 等级；建议使用 GPT-5+ 和 Claude 4.5+。",
    });
  }

  return findings;
}

export function collectSmallModelRiskFindings(params: {
  cfg: OpenClawConfig;
  env: NodeJS.ProcessEnv;
}): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  const models = collectModels(params.cfg).filter((entry) => !entry.source.includes("imageModel"));
  if (models.length === 0) {
    return findings;
  }

  const smallModels = models
    .map((entry) => {
      const paramB = inferParamBFromIdOrName(entry.id);
      if (!paramB || paramB > SMALL_MODEL_PARAM_B_MAX) {
        return null;
      }
      return { ...entry, paramB };
    })
    .filter((entry): entry is { id: string; source: string; paramB: number } => Boolean(entry));

  if (smallModels.length === 0) {
    return findings;
  }

  let hasUnsafe = false;
  const modelLines: string[] = [];
  const exposureSet = new Set<string>();
  for (const entry of smallModels) {
    const agentId = extractAgentIdFromSource(entry.source);
    const sandboxMode = resolveSandboxConfigForAgent(params.cfg, agentId ?? undefined).mode;
    const agentTools =
      agentId && params.cfg.agents?.list
        ? params.cfg.agents.list.find((agent) => agent?.id === agentId)?.tools
        : undefined;
    const policies = resolveToolPolicies({
      cfg: params.cfg,
      agentTools,
      sandboxMode,
      agentId,
    });
    const exposed: string[] = [];
    if (isWebSearchEnabled(params.cfg, params.env)) {
      if (isToolAllowedByPolicies("web_search", policies)) {
        exposed.push("web_search");
      }
    }
    if (isWebFetchEnabled(params.cfg)) {
      if (isToolAllowedByPolicies("web_fetch", policies)) {
        exposed.push("web_fetch");
      }
    }
    if (isBrowserEnabled(params.cfg)) {
      if (isToolAllowedByPolicies("browser", policies)) {
        exposed.push("browser");
      }
    }
    for (const tool of exposed) {
      exposureSet.add(tool);
    }
    const sandboxLabel = sandboxMode === "all" ? "sandbox=all" : `sandbox=${sandboxMode}`;
    const exposureLabel = exposed.length > 0 ? ` web=[${exposed.join(", ")}]` : " web=[off]";
    const safe = sandboxMode === "all" && exposed.length === 0;
    if (!safe) {
      hasUnsafe = true;
    }
    const statusLabel = safe ? "ok" : "unsafe";
    modelLines.push(
      `- ${entry.id} (${entry.paramB}B) @ ${entry.source} (${statusLabel}; ${sandboxLabel};${exposureLabel})`,
    );
  }

  const exposureList = Array.from(exposureSet);
  const exposureDetail =
    exposureList.length > 0
      ? `允许的不受控输入工具：${exposureList.join(", ")}。`
      : "未检测到这些模型的 web/浏览器工具。";

  findings.push({
    checkId: "models.small_params",
    severity: hasUnsafe ? "critical" : "info",
    title: "小模型需要启用沙箱并禁用网络工具",
    detail:
      `检测到小模型（<=${SMALL_MODEL_PARAM_B_MAX}B 参数）：\n` +
      modelLines.join("\n") +
      `\n` +
      exposureDetail +
      `\n` +
      "不建议小模型用于不受信的输入。",
    remediation:
      '如果必须使用小模型，请为所有会话启用沙箱（agents.defaults.sandbox.mode="all"）并禁用 web_search/web_fetch/browser（tools.deny=["group:web","browser"]）。',
  });

  return findings;
}

export function collectExposureMatrixFindings(cfg: OpenClawConfig): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  const openGroups = listGroupPolicyOpen(cfg);
  if (openGroups.length === 0) {
    return findings;
  }

  const elevatedEnabled = cfg.tools?.elevated?.enabled !== false;
  if (elevatedEnabled) {
    findings.push({
      checkId: "security.exposure.open_groups_with_elevated",
      severity: "critical",
      title: "开放 groupPolicy 且已启用提权工具",
      detail:
        `发现 groupPolicy="open" 位于：\n${openGroups.map((p) => `- ${p}`).join("\n")}\n` +
        "在启用 tools.elevated 的情况下，这些房间中的提示注入可能成为高影响事件。",
      remediation: `请设置 groupPolicy="allowlist" 并保持提权允许列表极度严格。`,
    });
  }

  const { riskyContexts, hasRuntimeRisk } = collectRiskyToolExposureContexts(cfg);

  if (riskyContexts.length > 0) {
    findings.push({
      checkId: "security.exposure.open_groups_with_runtime_or_fs",
      severity: hasRuntimeRisk ? "critical" : "warn",
      title: "开放 groupPolicy 且暴露了运行时/文件系统工具",
      detail:
        `发现 groupPolicy="open" 位于：\n${openGroups.map((p) => `- ${p}`).join("\n")}\n` +
        `有风险的工具暴露上下文：\n${riskyContexts.map((line) => `- ${line}`).join("\n")}\n` +
        "开放组中的提示注入可能在这些上下文中触发命令/文件操作。",
      remediation:
        '对于开放组，建议使用 tools.profile="messaging"（或禁止 group:runtime/group:fs），设置 tools.fs.workspaceOnly=true，并为暴露的代理使用 agents.defaults.sandbox.mode="all"。',
    });
  }

  return findings;
}

export function collectLikelyMultiUserSetupFindings(cfg: OpenClawConfig): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  const signals = listPotentialMultiUserSignals(cfg);
  if (signals.length === 0) {
    return findings;
  }

  const { riskyContexts, hasRuntimeRisk } = collectRiskyToolExposureContexts(cfg);
  const impactLine = hasRuntimeRisk
    ? "运行时/进程工具在至少一个上下文中被暴露且未完全沙箱化。"
    : "此启发式检测未发现无防护的运行时/进程工具。";
  const riskyContextsDetail =
    riskyContexts.length > 0
      ? `潜在高影响工具暴露上下文：\n${riskyContexts.map((line) => `- ${line}`).join("\n")}`
      : "未检测到无防护的运行时/文件系统上下文。";

  findings.push({
    checkId: "security.trust_model.multi_user_heuristic",
    severity: "warn",
    title: "检测到潜在的多用户配置（个人助理模型警告）",
    detail:
      "启发式信号表明此网关可能被多个用户访问：\n" +
      signals.map((signal) => `- ${signal}`).join("\n") +
      `\n${impactLine}\n${riskyContextsDetail}\n` +
      "OpenClaw 的默认安全模型是个人助理（单一受信操作者边界），而非在单一共享网关上的敌对多租户隔离。",
    remediation:
      '如果用户之间可能互不信任，请分离信任边界（独立网关 + 凭据，理想情况下使用独立的操作系统用户/主机）。如果您有意运行共享用户访问，请设置 agents.defaults.sandbox.mode="all"，保持 tools.fs.workspaceOnly=true，禁止 runtime/fs/web 工具（除非必需），并确保个人/私密身份和凭据不在该运行时上。',
  });

  return findings;
}
