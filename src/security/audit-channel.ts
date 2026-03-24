import {
  hasConfiguredUnavailableCredentialStatus,
  hasResolvedCredentialValue,
} from "../channels/account-snapshot-fields.js";
import { resolveChannelDefaultAccountId } from "../channels/plugins/helpers.js";
import type { listChannelPlugins } from "../channels/plugins/index.js";
import type { ChannelId } from "../channels/plugins/types.js";
import { inspectReadOnlyChannelAccount } from "../channels/read-only-account-inspect.js";
import { formatCliCommand } from "../cli/command-format.js";
import { resolveNativeCommandsEnabled, resolveNativeSkillsEnabled } from "../config/commands.js";
import type { OpenClawConfig } from "../config/config.js";
import { isDangerousNameMatchingEnabled } from "../config/dangerous-name-matching.js";
import { formatErrorMessage } from "../infra/errors.js";
import { createLazyRuntimeSurface } from "../shared/lazy-runtime.js";
import { normalizeStringEntries } from "../shared/string-normalization.js";
import type { SecurityAuditFinding, SecurityAuditSeverity } from "./audit.js";
import { resolveDmAllowState } from "./dm-policy-shared.js";

const loadAuditChannelDiscordRuntimeModule = createLazyRuntimeSurface(
  () => import("./audit-channel.discord.runtime.js"),
  ({ auditChannelDiscordRuntime }) => auditChannelDiscordRuntime,
);

const loadAuditChannelAllowFromRuntimeModule = createLazyRuntimeSurface(
  () => import("./audit-channel.allow-from.runtime.js"),
  ({ auditChannelAllowFromRuntime }) => auditChannelAllowFromRuntime,
);

const loadAuditChannelTelegramRuntimeModule = createLazyRuntimeSurface(
  () => import("./audit-channel.telegram.runtime.js"),
  ({ auditChannelTelegramRuntime }) => auditChannelTelegramRuntime,
);

const loadAuditChannelZalouserRuntimeModule = createLazyRuntimeSurface(
  () => import("./audit-channel.zalouser.runtime.js"),
  ({ auditChannelZalouserRuntime }) => auditChannelZalouserRuntime,
);

function normalizeAllowFromList(list: Array<string | number> | undefined | null): string[] {
  return normalizeStringEntries(Array.isArray(list) ? list : undefined);
}

function addDiscordNameBasedEntries(params: {
  target: Set<string>;
  values: unknown;
  source: string;
  isDiscordMutableAllowEntry: (value: string) => boolean;
}): void {
  if (!Array.isArray(params.values)) {
    return;
  }
  for (const value of params.values) {
    if (!params.isDiscordMutableAllowEntry(String(value))) {
      continue;
    }
    const text = String(value).trim();
    if (!text) {
      continue;
    }
    params.target.add(`${params.source}:${text}`);
  }
}

function addZalouserMutableGroupEntries(params: {
  target: Set<string>;
  groups: unknown;
  source: string;
  isZalouserMutableGroupEntry: (value: string) => boolean;
}): void {
  if (!params.groups || typeof params.groups !== "object" || Array.isArray(params.groups)) {
    return;
  }
  for (const key of Object.keys(params.groups as Record<string, unknown>)) {
    if (!params.isZalouserMutableGroupEntry(key)) {
      continue;
    }
    params.target.add(`${params.source}:${key}`);
  }
}

async function collectInvalidTelegramAllowFromEntries(params: {
  entries: unknown;
  target: Set<string>;
}): Promise<void> {
  if (!Array.isArray(params.entries)) {
    return;
  }
  const { isNumericTelegramUserId, normalizeTelegramAllowFromEntry } =
    await loadAuditChannelTelegramRuntimeModule();
  for (const entry of params.entries) {
    const normalized = normalizeTelegramAllowFromEntry(entry);
    if (!normalized || normalized === "*") {
      continue;
    }
    if (!isNumericTelegramUserId(normalized)) {
      params.target.add(normalized);
    }
  }
}

function classifyChannelWarningSeverity(message: string): SecurityAuditSeverity {
  const s = message.toLowerCase();
  if (
    s.includes("dms: open") ||
    s.includes('grouppolicy="open"') ||
    s.includes('dmpolicy="open"')
  ) {
    return "critical";
  }
  if (s.includes("allows any") || s.includes("anyone can dm") || s.includes("public")) {
    return "critical";
  }
  if (s.includes("locked") || s.includes("disabled")) {
    return "info";
  }
  return "warn";
}

function dedupeFindings(findings: SecurityAuditFinding[]): SecurityAuditFinding[] {
  const seen = new Set<string>();
  const out: SecurityAuditFinding[] = [];
  for (const finding of findings) {
    const key = [
      finding.checkId,
      finding.severity,
      finding.title,
      finding.detail ?? "",
      finding.remediation ?? "",
    ].join("\n");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(finding);
  }
  return out;
}

function hasExplicitProviderAccountConfig(
  cfg: OpenClawConfig,
  provider: string,
  accountId: string,
): boolean {
  const channel = cfg.channels?.[provider];
  if (!channel || typeof channel !== "object") {
    return false;
  }
  const accounts = (channel as { accounts?: Record<string, unknown> }).accounts;
  if (!accounts || typeof accounts !== "object") {
    return false;
  }
  return Object.hasOwn(accounts, accountId);
}

function formatChannelAccountNote(params: {
  orderedAccountIds: string[];
  hasExplicitAccountPath: boolean;
  accountId: string;
}): string {
  return params.orderedAccountIds.length > 1 || params.hasExplicitAccountPath
    ? ` (account: ${params.accountId})`
    : "";
}

export async function collectChannelSecurityFindings(params: {
  cfg: OpenClawConfig;
  sourceConfig?: OpenClawConfig;
  plugins: ReturnType<typeof listChannelPlugins>;
}): Promise<SecurityAuditFinding[]> {
  const findings: SecurityAuditFinding[] = [];
  const sourceConfig = params.sourceConfig ?? params.cfg;

  const inspectChannelAccount = async (
    plugin: (typeof params.plugins)[number],
    cfg: OpenClawConfig,
    accountId: string,
  ) =>
    plugin.config.inspectAccount?.(cfg, accountId) ??
    (await inspectReadOnlyChannelAccount({
      channelId: plugin.id,
      cfg,
      accountId,
    }));

  const asAccountRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  const resolveChannelAuditAccount = async (
    plugin: (typeof params.plugins)[number],
    accountId: string,
  ) => {
    const diagnostics: string[] = [];
    const sourceInspectedAccount = await inspectChannelAccount(plugin, sourceConfig, accountId);
    const resolvedInspectedAccount = await inspectChannelAccount(plugin, params.cfg, accountId);
    const sourceInspection = sourceInspectedAccount as {
      enabled?: boolean;
      configured?: boolean;
    } | null;
    const resolvedInspection = resolvedInspectedAccount as {
      enabled?: boolean;
      configured?: boolean;
    } | null;
    let resolvedAccount = resolvedInspectedAccount;
    if (!resolvedAccount) {
      try {
        resolvedAccount = plugin.config.resolveAccount(params.cfg, accountId);
      } catch (error) {
        diagnostics.push(
          `${plugin.id}:${accountId}: failed to resolve account (${formatErrorMessage(error)}).`,
        );
      }
    }
    if (!resolvedAccount && sourceInspectedAccount) {
      resolvedAccount = sourceInspectedAccount;
    }
    if (!resolvedAccount) {
      return {
        account: {},
        enabled: false,
        configured: false,
        diagnostics,
      };
    }
    const useSourceUnavailableAccount = Boolean(
      sourceInspectedAccount &&
      hasConfiguredUnavailableCredentialStatus(sourceInspectedAccount) &&
      (!hasResolvedCredentialValue(resolvedAccount) ||
        (sourceInspection?.configured === true && resolvedInspection?.configured === false)),
    );
    const account = useSourceUnavailableAccount ? sourceInspectedAccount : resolvedAccount;
    const selectedInspection = useSourceUnavailableAccount ? sourceInspection : resolvedInspection;
    const accountRecord = asAccountRecord(account);
    let enabled =
      typeof selectedInspection?.enabled === "boolean"
        ? selectedInspection.enabled
        : typeof accountRecord?.enabled === "boolean"
          ? accountRecord.enabled
          : true;
    if (
      typeof selectedInspection?.enabled !== "boolean" &&
      typeof accountRecord?.enabled !== "boolean" &&
      plugin.config.isEnabled
    ) {
      try {
        enabled = plugin.config.isEnabled(account, params.cfg);
      } catch (error) {
        enabled = false;
        diagnostics.push(
          `${plugin.id}:${accountId}: failed to evaluate enabled state (${formatErrorMessage(error)}).`,
        );
      }
    }

    let configured =
      typeof selectedInspection?.configured === "boolean"
        ? selectedInspection.configured
        : typeof accountRecord?.configured === "boolean"
          ? accountRecord.configured
          : true;
    if (
      typeof selectedInspection?.configured !== "boolean" &&
      typeof accountRecord?.configured !== "boolean" &&
      plugin.config.isConfigured
    ) {
      try {
        configured = await plugin.config.isConfigured(account, params.cfg);
      } catch (error) {
        configured = false;
        diagnostics.push(
          `${plugin.id}:${accountId}: failed to evaluate configured state (${formatErrorMessage(error)}).`,
        );
      }
    }

    return { account, enabled, configured, diagnostics };
  };

  const coerceNativeSetting = (value: unknown): boolean | "auto" | undefined => {
    if (value === true) {
      return true;
    }
    if (value === false) {
      return false;
    }
    if (value === "auto") {
      return "auto";
    }
    return undefined;
  };

  const warnDmPolicy = async (input: {
    label: string;
    provider: ChannelId;
    accountId: string;
    dmPolicy: string;
    allowFrom?: Array<string | number> | null;
    policyPath?: string;
    allowFromPath: string;
    normalizeEntry?: (raw: string) => string;
  }) => {
    const policyPath = input.policyPath ?? `${input.allowFromPath}policy`;
    const { hasWildcard, isMultiUserDm } = await resolveDmAllowState({
      provider: input.provider,
      accountId: input.accountId,
      allowFrom: input.allowFrom,
      normalizeEntry: input.normalizeEntry,
    });
    const dmScope = params.cfg.session?.dmScope ?? "main";

    if (input.dmPolicy === "open") {
      const allowFromKey = `${input.allowFromPath}allowFrom`;
      findings.push({
        checkId: `channels.${input.provider}.dm.open`,
        severity: "critical",
        title: `${input.label} 私信为开放状态`,
        detail: `${policyPath}="open" 允许任何人向机器人发送私信。`,
        remediation: `请使用配对/允许列表；如果确实需要开放私信，请确保 ${allowFromKey} 包含 "*"。`,
      });
      if (!hasWildcard) {
        findings.push({
          checkId: `channels.${input.provider}.dm.open_invalid`,
          severity: "warn",
          title: `${input.label} 私信配置看起来不一致`,
          detail: `"open" 要求 ${allowFromKey} 包含 "*"。`,
        });
      }
    }

    if (input.dmPolicy === "disabled") {
      findings.push({
        checkId: `channels.${input.provider}.dm.disabled`,
        severity: "info",
        title: `${input.label} 私信已禁用`,
        detail: `${policyPath}="disabled" 将忽略入站私信。`,
      });
      return;
    }

    if (dmScope === "main" && isMultiUserDm) {
      findings.push({
        checkId: `channels.${input.provider}.dm.scope_main_multiuser`,
        severity: "warn",
        title: `${input.label} 私信共享主会话`,
        detail:
          "多个私信发送者当前共享主会话，这可能导致用户之间的上下文泄露。",
        remediation:
          "请运行：" +
          formatCliCommand('openclaw config set session.dmScope "per-channel-peer"') +
          '（或对多账户频道使用 "per-account-channel-peer"）以按发送者隔离私信会话。',
      });
    }
  };

  for (const plugin of params.plugins) {
    if (!plugin.security) {
      continue;
    }
    const accountIds = plugin.config.listAccountIds(sourceConfig);
    const defaultAccountId = resolveChannelDefaultAccountId({
      plugin,
      cfg: sourceConfig,
      accountIds,
    });
    const orderedAccountIds = Array.from(new Set([defaultAccountId, ...accountIds]));

    for (const accountId of orderedAccountIds) {
      const hasExplicitAccountPath = hasExplicitProviderAccountConfig(
        sourceConfig,
        plugin.id,
        accountId,
      );
      const { account, enabled, configured, diagnostics } = await resolveChannelAuditAccount(
        plugin,
        accountId,
      );
      for (const diagnostic of diagnostics) {
        findings.push({
          checkId: `channels.${plugin.id}.account.read_only_resolution`,
          severity: "warn",
          title: `${plugin.meta.label ?? plugin.id} account could not be fully resolved`,
          detail: diagnostic,
          remediation:
            "Ensure referenced secrets are available in this shell or run with a running gateway snapshot so security audit can inspect the full channel configuration.",
        });
      }
      if (!enabled) {
        continue;
      }
      if (!configured) {
        continue;
      }

      const accountConfig = (account as { config?: Record<string, unknown> } | null | undefined)
        ?.config;
      if (isDangerousNameMatchingEnabled(accountConfig)) {
        const accountNote = formatChannelAccountNote({
          orderedAccountIds,
          hasExplicitAccountPath,
          accountId,
        });
        findings.push({
          checkId: `channels.${plugin.id}.allowFrom.dangerous_name_matching_enabled`,
          severity: "info",
          title: `${plugin.meta.label ?? plugin.id} 已启用危险的名称匹配${accountNote}`,
          detail:
            "dangerouslyAllowNameMatching=true 重新启用了可变名称/邮箱/标签匹配进行发送者授权。这是一个紧急兼容模式，而非强化的默认设置。",
          remediation:
            "建议在允许列表中使用稳定的发送者 ID，然后禁用 dangerouslyAllowNameMatching。",
        });
      }

      if (
        plugin.id === "synology-chat" &&
        (account as { dangerouslyAllowNameMatching?: unknown } | null)
          ?.dangerouslyAllowNameMatching === true
      ) {
        const accountNote = formatChannelAccountNote({
          orderedAccountIds,
          hasExplicitAccountPath,
          accountId,
        });
        findings.push({
          checkId: "channels.synology-chat.reply.dangerous_name_matching_enabled",
          severity: "info",
          title: `Synology Chat dangerous name matching is enabled${accountNote}`,
          detail:
            "dangerouslyAllowNameMatching=true re-enables mutable username/nickname matching for reply delivery. This is a break-glass compatibility mode, not a hardened default.",
          remediation:
            "Prefer stable numeric Synology Chat user IDs for reply delivery, then disable dangerouslyAllowNameMatching.",
        });
      }

      if (plugin.id === "discord") {
        const { isDiscordMutableAllowEntry } = await loadAuditChannelDiscordRuntimeModule();
        const { readChannelAllowFromStore } = await loadAuditChannelAllowFromRuntimeModule();
        const discordCfg =
          (account as { config?: Record<string, unknown> } | null)?.config ??
          ({} as Record<string, unknown>);
        const dangerousNameMatchingEnabled = isDangerousNameMatchingEnabled(discordCfg);
        const storeAllowFrom = await readChannelAllowFromStore(
          "discord",
          process.env,
          accountId,
        ).catch(() => []);
        const discordNameBasedAllowEntries = new Set<string>();
        const discordPathPrefix =
          orderedAccountIds.length > 1 || hasExplicitAccountPath
            ? `channels.discord.accounts.${accountId}`
            : "channels.discord";
        addDiscordNameBasedEntries({
          target: discordNameBasedAllowEntries,
          values: discordCfg.allowFrom,
          source: `${discordPathPrefix}.allowFrom`,
          isDiscordMutableAllowEntry,
        });
        addDiscordNameBasedEntries({
          target: discordNameBasedAllowEntries,
          values: (discordCfg.dm as { allowFrom?: unknown } | undefined)?.allowFrom,
          source: `${discordPathPrefix}.dm.allowFrom`,
          isDiscordMutableAllowEntry,
        });
        addDiscordNameBasedEntries({
          target: discordNameBasedAllowEntries,
          values: storeAllowFrom,
          source: "~/.openclaw/credentials/discord-allowFrom.json",
          isDiscordMutableAllowEntry,
        });
        const discordGuildEntries =
          (discordCfg.guilds as Record<string, unknown> | undefined) ?? {};
        for (const [guildKey, guildValue] of Object.entries(discordGuildEntries)) {
          if (!guildValue || typeof guildValue !== "object") {
            continue;
          }
          const guild = guildValue as Record<string, unknown>;
          addDiscordNameBasedEntries({
            target: discordNameBasedAllowEntries,
            values: guild.users,
            source: `${discordPathPrefix}.guilds.${guildKey}.users`,
            isDiscordMutableAllowEntry,
          });
          const channels = guild.channels;
          if (!channels || typeof channels !== "object") {
            continue;
          }
          for (const [channelKey, channelValue] of Object.entries(
            channels as Record<string, unknown>,
          )) {
            if (!channelValue || typeof channelValue !== "object") {
              continue;
            }
            const channel = channelValue as Record<string, unknown>;
            addDiscordNameBasedEntries({
              target: discordNameBasedAllowEntries,
              values: channel.users,
              source: `${discordPathPrefix}.guilds.${guildKey}.channels.${channelKey}.users`,
              isDiscordMutableAllowEntry,
            });
          }
        }
        if (discordNameBasedAllowEntries.size > 0) {
          const examples = Array.from(discordNameBasedAllowEntries).slice(0, 5);
          const more =
            discordNameBasedAllowEntries.size > examples.length
              ? ` (+${discordNameBasedAllowEntries.size - examples.length} more)`
              : "";
          findings.push({
            checkId: "channels.discord.allowFrom.name_based_entries",
            severity: dangerousNameMatchingEnabled ? "info" : "warn",
            title: dangerousNameMatchingEnabled
              ? "Discord 允许列表使用紧急名称/标签匹配"
              : "Discord 允许列表包含名称或标签条目",
            detail: dangerousNameMatchingEnabled
              ? "Discord 名称/标签允许列表匹配已通过 dangerouslyAllowNameMatching 显式启用。此可变身份模式是操作员选择的紧急行为，本身不属于漏洞报告范围。" +
                `发现：${examples.join(", ")}${more}。`
              : "Discord 名称/标签允许列表匹配使用规范化别名，可能在用户之间发生冲突。" +
                `发现：${examples.join(", ")}${more}。`,
            remediation: dangerousNameMatchingEnabled
              ? "建议使用稳定的 Discord ID（或 <@id>/user:<id>/pk:<id>），然后禁用 dangerouslyAllowNameMatching。"
              : "建议在 channels.discord.allowFrom 和 channels.discord.guilds.*.users 中使用稳定的 Discord ID（或 <@id>/user:<id>/pk:<id>），或显式启用 dangerouslyAllowNameMatching=true 接受风险。",
          });
        }
        const nativeEnabled = resolveNativeCommandsEnabled({
          providerId: "discord",
          providerSetting: coerceNativeSetting(
            (discordCfg.commands as { native?: unknown } | undefined)?.native,
          ),
          globalSetting: params.cfg.commands?.native,
        });
        const nativeSkillsEnabled = resolveNativeSkillsEnabled({
          providerId: "discord",
          providerSetting: coerceNativeSetting(
            (discordCfg.commands as { nativeSkills?: unknown } | undefined)?.nativeSkills,
          ),
          globalSetting: params.cfg.commands?.nativeSkills,
        });
        const slashEnabled = nativeEnabled || nativeSkillsEnabled;
        if (slashEnabled) {
          const defaultGroupPolicy = params.cfg.channels?.defaults?.groupPolicy;
          const groupPolicy =
            (discordCfg.groupPolicy as string | undefined) ?? defaultGroupPolicy ?? "allowlist";
          const guildEntries = discordGuildEntries;
          const guildsConfigured = Object.keys(guildEntries).length > 0;
          const hasAnyUserAllowlist = Object.values(guildEntries).some((guild) => {
            if (!guild || typeof guild !== "object") {
              return false;
            }
            const g = guild as Record<string, unknown>;
            if (Array.isArray(g.users) && g.users.length > 0) {
              return true;
            }
            const channels = g.channels;
            if (!channels || typeof channels !== "object") {
              return false;
            }
            return Object.values(channels as Record<string, unknown>).some((channel) => {
              if (!channel || typeof channel !== "object") {
                return false;
              }
              const c = channel as Record<string, unknown>;
              return Array.isArray(c.users) && c.users.length > 0;
            });
          });
          const dmAllowFromRaw = (discordCfg.dm as { allowFrom?: unknown } | undefined)?.allowFrom;
          const dmAllowFrom = Array.isArray(dmAllowFromRaw) ? dmAllowFromRaw : [];
          const ownerAllowFromConfigured =
            normalizeAllowFromList([...dmAllowFrom, ...storeAllowFrom]).length > 0;

          const useAccessGroups = params.cfg.commands?.useAccessGroups !== false;
          if (
            !useAccessGroups &&
            groupPolicy !== "disabled" &&
            guildsConfigured &&
            !hasAnyUserAllowlist
          ) {
            findings.push({
              checkId: "channels.discord.commands.native.unrestricted",
              severity: "critical",
              title: "Discord 斜杠命令无限制",
              detail:
                "commands.useAccessGroups=false 禁用了 Discord 斜杠命令的发送者允许列表，除非配置了每公会/频道的 users 允许列表；未配置 users 允许列表时，允许公会频道中的任何用户都可以调用 /… 命令。",
              remediation:
                "建议设置 commands.useAccessGroups=true（推荐），或配置 channels.discord.guilds.<id>.users（或 channels.discord.guilds.<id>.channels.<channel>.users）。",
            });
          } else if (
            useAccessGroups &&
            groupPolicy !== "disabled" &&
            guildsConfigured &&
            !ownerAllowFromConfigured &&
            !hasAnyUserAllowlist
          ) {
            findings.push({
              checkId: "channels.discord.commands.native.no_allowlists",
              severity: "warn",
              title: "Discord 斜杠命令无允许列表",
              detail:
                "Discord 斜杠命令已启用，但既未配置所有者 allowFrom 列表，也未配置任何每公会/频道的 users 允许列表；/… 命令将拒绝所有人。",
              remediation:
                "请将您的用户 ID 添加到 channels.discord.allowFrom（或通过配对批准自己），或配置 channels.discord.guilds.<id>.users。",
            });
          }
        }
      }

      if (plugin.id === "zalouser") {
        const { isZalouserMutableGroupEntry } = await loadAuditChannelZalouserRuntimeModule();
        const zalouserCfg =
          (account as { config?: Record<string, unknown> } | null)?.config ??
          ({} as Record<string, unknown>);
        const dangerousNameMatchingEnabled = isDangerousNameMatchingEnabled(zalouserCfg);
        const zalouserPathPrefix =
          orderedAccountIds.length > 1 || hasExplicitAccountPath
            ? `channels.zalouser.accounts.${accountId}`
            : "channels.zalouser";
        const mutableGroupEntries = new Set<string>();
        addZalouserMutableGroupEntries({
          target: mutableGroupEntries,
          groups: zalouserCfg.groups,
          source: `${zalouserPathPrefix}.groups`,
          isZalouserMutableGroupEntry,
        });
        if (mutableGroupEntries.size > 0) {
          const examples = Array.from(mutableGroupEntries).slice(0, 5);
          const more =
            mutableGroupEntries.size > examples.length
              ? ` (+${mutableGroupEntries.size - examples.length} more)`
              : "";
          findings.push({
            checkId: "channels.zalouser.groups.mutable_entries",
            severity: dangerousNameMatchingEnabled ? "info" : "warn",
            title: dangerousNameMatchingEnabled
              ? "Zalouser group routing uses break-glass name matching"
              : "Zalouser group routing contains mutable group entries",
            detail: dangerousNameMatchingEnabled
              ? "Zalouser group-name routing is explicitly enabled via dangerouslyAllowNameMatching. This mutable-identity mode is operator-selected break-glass behavior and out-of-scope for vulnerability reports by itself. " +
                `Found: ${examples.join(", ")}${more}.`
              : "Zalouser group auth is ID-only by default, so unresolved group-name or slug entries are ignored for auth and can drift from the intended trusted group. " +
                `Found: ${examples.join(", ")}${more}.`,
            remediation: dangerousNameMatchingEnabled
              ? "Prefer stable Zalo group IDs (for example group:<id> or provider-native g- ids), then disable dangerouslyAllowNameMatching."
              : "Prefer stable Zalo group IDs in channels.zalouser.groups, or explicitly opt in with dangerouslyAllowNameMatching=true if you accept mutable group-name matching.",
          });
        }
      }

      if (plugin.id === "slack") {
        const { readChannelAllowFromStore } = await loadAuditChannelAllowFromRuntimeModule();
        const slackCfg =
          (account as { config?: Record<string, unknown>; dm?: Record<string, unknown> } | null)
            ?.config ?? ({} as Record<string, unknown>);
        const nativeEnabled = resolveNativeCommandsEnabled({
          providerId: "slack",
          providerSetting: coerceNativeSetting(
            (slackCfg.commands as { native?: unknown } | undefined)?.native,
          ),
          globalSetting: params.cfg.commands?.native,
        });
        const nativeSkillsEnabled = resolveNativeSkillsEnabled({
          providerId: "slack",
          providerSetting: coerceNativeSetting(
            (slackCfg.commands as { nativeSkills?: unknown } | undefined)?.nativeSkills,
          ),
          globalSetting: params.cfg.commands?.nativeSkills,
        });
        const slashCommandEnabled =
          nativeEnabled ||
          nativeSkillsEnabled ||
          (slackCfg.slashCommand as { enabled?: unknown } | undefined)?.enabled === true;
        if (slashCommandEnabled) {
          const useAccessGroups = params.cfg.commands?.useAccessGroups !== false;
          if (!useAccessGroups) {
            findings.push({
              checkId: "channels.slack.commands.slash.useAccessGroups_off",
              severity: "critical",
              title: "Slack 斜杠命令绕过访问组",
              detail:
                "Slack 斜杠/原生命令已启用且 commands.useAccessGroups=false；这可能允许未明确授权的频道/用户不受限制地执行 /… 命令。",
              remediation: "建议设置 commands.useAccessGroups=true（推荐）。",
            });
          } else {
            const allowFromRaw = (
              account as
                | { config?: { allowFrom?: unknown }; dm?: { allowFrom?: unknown } }
                | null
                | undefined
            )?.config?.allowFrom;
            const legacyAllowFromRaw = (
              account as { dm?: { allowFrom?: unknown } } | null | undefined
            )?.dm?.allowFrom;
            const allowFrom = Array.isArray(allowFromRaw)
              ? allowFromRaw
              : Array.isArray(legacyAllowFromRaw)
                ? legacyAllowFromRaw
                : [];
            const storeAllowFrom = await readChannelAllowFromStore(
              "slack",
              process.env,
              accountId,
            ).catch(() => []);
            const ownerAllowFromConfigured =
              normalizeAllowFromList([...allowFrom, ...storeAllowFrom]).length > 0;
            const channels = (slackCfg.channels as Record<string, unknown> | undefined) ?? {};
            const hasAnyChannelUsersAllowlist = Object.values(channels).some((value) => {
              if (!value || typeof value !== "object") {
                return false;
              }
              const channel = value as Record<string, unknown>;
              return Array.isArray(channel.users) && channel.users.length > 0;
            });
            if (!ownerAllowFromConfigured && !hasAnyChannelUsersAllowlist) {
              findings.push({
                checkId: "channels.slack.commands.slash.no_allowlists",
                severity: "warn",
                title: "Slack 斜杠命令无允许列表",
                detail:
                  "Slack 斜杠/原生命令已启用，但既未配置所有者 allowFrom 列表，也未配置任何 channels.<id>.users 允许列表；/… 命令将拒绝所有人。",
                remediation:
                  "请通过配对批准自己（推荐），或设置 channels.slack.allowFrom 和/或 channels.slack.channels.<id>.users。",
              });
            }
          }
        }
      }

      const dmPolicy = plugin.security.resolveDmPolicy?.({
        cfg: params.cfg,
        accountId,
        account,
      });
      if (dmPolicy) {
        await warnDmPolicy({
          label: plugin.meta.label ?? plugin.id,
          provider: plugin.id,
          accountId,
          dmPolicy: dmPolicy.policy,
          allowFrom: dmPolicy.allowFrom,
          policyPath: dmPolicy.policyPath,
          allowFromPath: dmPolicy.allowFromPath,
          normalizeEntry: dmPolicy.normalizeEntry,
        });
      }

      if (plugin.security.collectWarnings) {
        const warnings = await plugin.security.collectWarnings({
          cfg: params.cfg,
          accountId,
          account,
        });
        for (const message of warnings ?? []) {
          const trimmed = String(message).trim();
          if (!trimmed) {
            continue;
          }
          findings.push({
            checkId: `channels.${plugin.id}.warning.${findings.length + 1}`,
            severity: classifyChannelWarningSeverity(trimmed),
            title: `${plugin.meta.label ?? plugin.id} 安全警告`,
            detail: trimmed.replace(/^-\s*/, ""),
          });
        }
      }

      if (plugin.id !== "telegram") {
        continue;
      }

      const allowTextCommands = params.cfg.commands?.text !== false;
      if (!allowTextCommands) {
        continue;
      }

      const telegramCfg =
        (account as { config?: Record<string, unknown> } | null)?.config ??
        ({} as Record<string, unknown>);
      const defaultGroupPolicy = params.cfg.channels?.defaults?.groupPolicy;
      const groupPolicy =
        (telegramCfg.groupPolicy as string | undefined) ?? defaultGroupPolicy ?? "allowlist";
      const groups = telegramCfg.groups as Record<string, unknown> | undefined;
      const groupsConfigured = Boolean(groups) && Object.keys(groups ?? {}).length > 0;
      const groupAccessPossible =
        groupPolicy === "open" || (groupPolicy === "allowlist" && groupsConfigured);
      if (!groupAccessPossible) {
        continue;
      }

      const { readChannelAllowFromStore } = await loadAuditChannelAllowFromRuntimeModule();
      const storeAllowFrom = await readChannelAllowFromStore(
        "telegram",
        process.env,
        accountId,
      ).catch(() => []);
      const storeHasWildcard = storeAllowFrom.some((value) => String(value).trim() === "*");
      const invalidTelegramAllowFromEntries = new Set<string>();
      await collectInvalidTelegramAllowFromEntries({
        entries: storeAllowFrom,
        target: invalidTelegramAllowFromEntries,
      });
      const groupAllowFrom = Array.isArray(telegramCfg.groupAllowFrom)
        ? telegramCfg.groupAllowFrom
        : [];
      const groupAllowFromHasWildcard = groupAllowFrom.some((v) => String(v).trim() === "*");
      await collectInvalidTelegramAllowFromEntries({
        entries: groupAllowFrom,
        target: invalidTelegramAllowFromEntries,
      });
      const dmAllowFrom = Array.isArray(telegramCfg.allowFrom) ? telegramCfg.allowFrom : [];
      await collectInvalidTelegramAllowFromEntries({
        entries: dmAllowFrom,
        target: invalidTelegramAllowFromEntries,
      });
      let anyGroupOverride = false;
      if (groups) {
        for (const value of Object.values(groups)) {
          if (!value || typeof value !== "object") {
            continue;
          }
          const group = value as Record<string, unknown>;
          const allowFrom = Array.isArray(group.allowFrom) ? group.allowFrom : [];
          if (allowFrom.length > 0) {
            anyGroupOverride = true;
            await collectInvalidTelegramAllowFromEntries({
              entries: allowFrom,
              target: invalidTelegramAllowFromEntries,
            });
          }
          const topics = group.topics;
          if (!topics || typeof topics !== "object") {
            continue;
          }
          for (const topicValue of Object.values(topics as Record<string, unknown>)) {
            if (!topicValue || typeof topicValue !== "object") {
              continue;
            }
            const topic = topicValue as Record<string, unknown>;
            const topicAllow = Array.isArray(topic.allowFrom) ? topic.allowFrom : [];
            if (topicAllow.length > 0) {
              anyGroupOverride = true;
            }
            await collectInvalidTelegramAllowFromEntries({
              entries: topicAllow,
              target: invalidTelegramAllowFromEntries,
            });
          }
        }
      }

      const hasAnySenderAllowlist =
        storeAllowFrom.length > 0 || groupAllowFrom.length > 0 || anyGroupOverride;

      if (invalidTelegramAllowFromEntries.size > 0) {
        const examples = Array.from(invalidTelegramAllowFromEntries).slice(0, 5);
        const more =
          invalidTelegramAllowFromEntries.size > examples.length
            ? ` (+${invalidTelegramAllowFromEntries.size - examples.length} more)`
            : "";
        findings.push({
          checkId: "channels.telegram.allowFrom.invalid_entries",
          severity: "warn",
          title: "Telegram 允许列表包含非数字条目",
          detail:
            "Telegram 发送者授权需要数字的 Telegram 用户 ID。" +
            `发现非数字的 allowFrom 条目：${examples.join(", ")}${more}。`,
          remediation:
            "Replace @username entries with numeric Telegram user IDs (use setup to resolve), then re-run the audit.",
        });
      }

      if (storeHasWildcard || groupAllowFromHasWildcard) {
        findings.push({
          checkId: "channels.telegram.groups.allowFrom.wildcard",
          severity: "critical",
          title: "Telegram 组允许列表包含通配符",
          detail:
            'Telegram 组发送者允许列表包含 "*"，这允许任何组成员运行 /… 命令和控制指令。',
          remediation:
            '请从 channels.telegram.groupAllowFrom 和配对存储中移除 "*"；建议使用明确的数字 Telegram 用户 ID。',
        });
        continue;
      }

      if (!hasAnySenderAllowlist) {
        const providerSetting = (telegramCfg.commands as { nativeSkills?: unknown } | undefined)
          // oxlint-disable-next-line typescript/no-explicit-any
          ?.nativeSkills as any;
        const skillsEnabled = resolveNativeSkillsEnabled({
          providerId: "telegram",
          providerSetting,
          globalSetting: params.cfg.commands?.nativeSkills,
        });
        findings.push({
          checkId: "channels.telegram.groups.allowFrom.missing",
          severity: "critical",
          title: "Telegram 组命令无发送者允许列表",
          detail:
            `Telegram 组访问已启用但未配置发送者允许列表；这允许任何组成员调用 /… 命令` +
            (skillsEnabled ? "（包括技能命令）。" : "。"),
          remediation:
            "请通过配对批准自己（推荐），或设置 channels.telegram.groupAllowFrom（或每组 groups.<id>.allowFrom）。",
        });
      }
    }
  }

  return dedupeFindings(findings);
}
