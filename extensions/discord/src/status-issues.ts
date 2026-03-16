import {
  appendMatchMetadata,
  asString,
  isRecord,
  resolveEnabledConfiguredAccountId,
} from "../../../src/channels/plugins/status-issues/shared.js";
import type {
  ChannelAccountSnapshot,
  ChannelStatusIssue,
} from "../../../src/channels/plugins/types.js";

type DiscordIntentSummary = {
  messageContent?: "enabled" | "limited" | "disabled";
};

type DiscordApplicationSummary = {
  intents?: DiscordIntentSummary;
};

type DiscordAccountStatus = {
  accountId?: unknown;
  enabled?: unknown;
  configured?: unknown;
  application?: unknown;
  audit?: unknown;
};

type DiscordPermissionsAuditSummary = {
  unresolvedChannels?: number;
  channels?: Array<{
    channelId: string;
    ok?: boolean;
    missing?: string[];
    error?: string | null;
    matchKey?: string;
    matchSource?: string;
  }>;
};

function readDiscordAccountStatus(value: ChannelAccountSnapshot): DiscordAccountStatus | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    accountId: value.accountId,
    enabled: value.enabled,
    configured: value.configured,
    application: value.application,
    audit: value.audit,
  };
}

function readDiscordApplicationSummary(value: unknown): DiscordApplicationSummary {
  if (!isRecord(value)) {
    return {};
  }
  const intentsRaw = value.intents;
  if (!isRecord(intentsRaw)) {
    return {};
  }
  return {
    intents: {
      messageContent:
        intentsRaw.messageContent === "enabled" ||
        intentsRaw.messageContent === "limited" ||
        intentsRaw.messageContent === "disabled"
          ? intentsRaw.messageContent
          : undefined,
    },
  };
}

function readDiscordPermissionsAuditSummary(value: unknown): DiscordPermissionsAuditSummary {
  if (!isRecord(value)) {
    return {};
  }
  const unresolvedChannels =
    typeof value.unresolvedChannels === "number" && Number.isFinite(value.unresolvedChannels)
      ? value.unresolvedChannels
      : undefined;
  const channelsRaw = value.channels;
  const channels = Array.isArray(channelsRaw)
    ? (channelsRaw
        .map((entry) => {
          if (!isRecord(entry)) {
            return null;
          }
          const channelId = asString(entry.channelId);
          if (!channelId) {
            return null;
          }
          const ok = typeof entry.ok === "boolean" ? entry.ok : undefined;
          const missing = Array.isArray(entry.missing)
            ? entry.missing.map((v) => asString(v)).filter(Boolean)
            : undefined;
          const error = asString(entry.error) ?? null;
          const matchKey = asString(entry.matchKey) ?? undefined;
          const matchSource = asString(entry.matchSource) ?? undefined;
          return {
            channelId,
            ok,
            missing: missing?.length ? missing : undefined,
            error,
            matchKey,
            matchSource,
          };
        })
        .filter(Boolean) as DiscordPermissionsAuditSummary["channels"])
    : undefined;
  return { unresolvedChannels, channels };
}

export function collectDiscordStatusIssues(
  accounts: ChannelAccountSnapshot[],
): ChannelStatusIssue[] {
  const issues: ChannelStatusIssue[] = [];
  for (const entry of accounts) {
    const account = readDiscordAccountStatus(entry);
    if (!account) {
      continue;
    }
    const accountId = resolveEnabledConfiguredAccountId(account);
    if (!accountId) {
      continue;
    }

    const app = readDiscordApplicationSummary(account.application);
    const messageContent = app.intents?.messageContent;
    if (messageContent === "disabled") {
      issues.push({
        channel: "discord",
        accountId,
        kind: "intent",
        message: "Message Content Intent 已禁用。机器人可能无法读取普通频道消息。",
        fix: "请在 Discord 开发者门户 → Bot → Privileged Gateway Intents 中启用 Message Content Intent，或仅使用提及模式。",
      });
    }

    const audit = readDiscordPermissionsAuditSummary(account.audit);
    if (audit.unresolvedChannels && audit.unresolvedChannels > 0) {
      issues.push({
        channel: "discord",
        accountId,
        kind: "config",
        message: `部分已配置的公会频道不是数字 ID（unresolvedChannels=${audit.unresolvedChannels}）。权限审计只能检查数字频道 ID。`,
        fix: "请在 channels.discord.guilds.*.channels 中使用数字频道 ID 作为键（然后重新运行 channels status --probe）。",
      });
    }
    for (const channel of audit.channels ?? []) {
      if (channel.ok === true) {
        continue;
      }
      const missing = channel.missing?.length ? ` 缺少 ${channel.missing.join(", ")}` : "";
      const error = channel.error ? `: ${channel.error}` : "";
      const baseMessage = `频道 ${channel.channelId} 权限检查失败。${missing}${error}`;
      issues.push({
        channel: "discord",
        accountId,
        kind: "permissions",
        message: appendMatchMetadata(baseMessage, {
          matchKey: channel.matchKey,
          matchSource: channel.matchSource,
        }),
        fix: "请确保机器人角色可以查看和发送此频道的消息（并确保频道覆盖没有拒绝它）。",
      });
    }
  }
  return issues;
}
