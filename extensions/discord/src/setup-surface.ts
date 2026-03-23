import {
  formatDocsLink,
  type OpenClawConfig,
  promptLegacyChannelAllowFrom,
  resolveSetupAccountId,
  type WizardPrompter,
} from "openclaw/plugin-sdk/setup";
import { type ChannelSetupWizard } from "openclaw/plugin-sdk/setup";
import { resolveDefaultDiscordAccountId, resolveDiscordAccount } from "./accounts.js";
import { normalizeDiscordSlug } from "./monitor/allow-list.js";
import {
  resolveDiscordChannelAllowlist,
  type DiscordChannelResolution,
} from "./resolve-channels.js";
import { resolveDiscordUserAllowlist } from "./resolve-users.js";
import {
  createDiscordSetupWizardBase,
  DISCORD_TOKEN_HELP_LINES,
  parseDiscordAllowFromId,
  setDiscordGuildChannelAllowlist,
} from "./setup-core.js";

const channel = "discord" as const;

async function resolveDiscordAllowFromEntries(params: { token?: string; entries: string[] }) {
  if (!params.token?.trim()) {
    return params.entries.map((input) => ({
      input,
      resolved: false,
      id: null,
    }));
  }
  const resolved = await resolveDiscordUserAllowlist({
    token: params.token,
    entries: params.entries,
  });
  return resolved.map((entry) => ({
    input: entry.input,
    resolved: entry.resolved,
    id: entry.id ?? null,
  }));
}

async function promptDiscordAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<OpenClawConfig> {
  const accountId = resolveSetupAccountId({
    accountId: params.accountId,
    defaultAccountId: resolveDefaultDiscordAccountId(params.cfg),
  });
  const resolved = resolveDiscordAccount({ cfg: params.cfg, accountId });
  return promptLegacyChannelAllowFrom({
    cfg: params.cfg,
    channel,
    prompter: params.prompter,
    existing: resolved.config.allowFrom ?? resolved.config.dm?.allowFrom ?? [],
    token: resolved.token,
    noteTitle: "Discord 白名单",
    noteLines: [
      "通过用户名将 Discord 私聊加入白名单（我们会解析为用户 ID）。",
      "示例：",
      "- 123456789012345678",
      "- @alice",
      "- alice#1234",
      "多个条目：用逗号分隔。",
      `Docs: ${formatDocsLink("/discord", "discord")}`,
    ],
    message: "Discord allowFrom（用户名或 ID）",
    placeholder: "@alice, 123456789012345678",
    parseId: parseDiscordAllowFromId,
    invalidWithoutTokenNote: "缺少 Bot 令牌；请仅使用数字用户 ID（或 @提及格式）。",
    resolveEntries: ({ token, entries }) =>
      resolveDiscordUserAllowlist({
        token,
        entries,
      }),
  });
}

async function resolveDiscordGroupAllowlist(params: {
  cfg: OpenClawConfig;
  accountId: string;
  credentialValues: { token?: string };
  entries: string[];
}) {
  const token =
    resolveDiscordAccount({ cfg: params.cfg, accountId: params.accountId }).token ||
    (typeof params.credentialValues.token === "string" ? params.credentialValues.token : "");
  if (!token || params.entries.length === 0) {
    return params.entries.map((input) => ({
      input,
      resolved: false,
    }));
  }
  return await resolveDiscordChannelAllowlist({
    token,
    entries: params.entries,
  });
}

export const discordSetupWizard: ChannelSetupWizard = createDiscordSetupWizardBase({
  promptAllowFrom: promptDiscordAllowFrom,
  resolveAllowFromEntries: async ({ cfg, accountId, credentialValues, entries }) =>
    await resolveDiscordAllowFromEntries({
      token:
        resolveDiscordAccount({ cfg, accountId }).token ||
        (typeof credentialValues.token === "string" ? credentialValues.token : ""),
      entries,
    }),
  resolveGroupAllowlist: async ({ cfg, accountId, credentialValues, entries }) =>
    await resolveDiscordGroupAllowlist({
      cfg,
      accountId,
      credentialValues,
      entries,
    }),
});
