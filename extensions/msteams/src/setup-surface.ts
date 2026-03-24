import {
  createTopLevelChannelAllowFromSetter,
  createTopLevelChannelDmPolicy,
  createTopLevelChannelGroupPolicySetter,
  createStandardChannelSetupStatus,
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  mergeAllowFromEntries,
  splitSetupEntries,
  type ChannelSetupDmPolicy,
  type ChannelSetupWizard,
  type OpenClawConfig,
  type WizardPrompter,
} from "openclaw/plugin-sdk/setup";
import type { MSTeamsTeamConfig } from "../runtime-api.js";
import {
  parseMSTeamsTeamEntry,
  resolveMSTeamsChannelAllowlist,
  resolveMSTeamsUserAllowlist,
} from "./resolve-allowlist.js";
import { normalizeSecretInputString } from "./secret-input.js";
import { msteamsSetupAdapter } from "./setup-core.js";
import { hasConfiguredMSTeamsCredentials, resolveMSTeamsCredentials } from "./token.js";

const channel = "msteams" as const;
const setMSTeamsAllowFrom = createTopLevelChannelAllowFromSetter({
  channel,
});
const setMSTeamsGroupPolicy = createTopLevelChannelGroupPolicySetter({
  channel,
  enabled: true,
});

function looksLikeGuid(value: string): boolean {
  return /^[0-9a-fA-F-]{16,}$/.test(value);
}

async function promptMSTeamsCredentials(prompter: WizardPrompter): Promise<{
  appId: string;
  appPassword: string;
  tenantId: string;
}> {
  const appId = String(
    await prompter.text({
      message: "输入 MS Teams App ID",
      validate: (value) => (value?.trim() ? undefined : "必填"),
    }),
  ).trim();
  const appPassword = String(
    await prompter.text({
      message: "输入 MS Teams App 密码",
      validate: (value) => (value?.trim() ? undefined : "必填"),
    }),
  ).trim();
  const tenantId = String(
    await prompter.text({
      message: "输入 MS Teams 租户 ID",
      validate: (value) => (value?.trim() ? undefined : "必填"),
    }),
  ).trim();
  return { appId, appPassword, tenantId };
}

async function promptMSTeamsAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
}): Promise<OpenClawConfig> {
  const existing = params.cfg.channels?.msteams?.allowFrom ?? [];
  await params.prompter.note(
    [
      "通过显示名称、UPN/邮箱或用户 ID 将 MS Teams 私聊加入白名单。",
      "当凭据允许时，我们会通过 Microsoft Graph 将名称解析为用户 ID。",
      "Examples:",
      "- alex@example.com",
      "- Alex Johnson",
      "- 00000000-0000-0000-0000-000000000000",
    ].join("\n"),
    "MS Teams 白名单",
  );

  while (true) {
    const entry = await params.prompter.text({
      message: "MS Teams allowFrom（用户名或 ID）",
      placeholder: "alex@example.com, Alex Johnson",
      initialValue: existing[0] ? String(existing[0]) : undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });
    const parts = splitSetupEntries(String(entry));
    if (parts.length === 0) {
      await params.prompter.note("请至少输入一个用户。", "MS Teams 白名单");
      continue;
    }

    const resolved = await resolveMSTeamsUserAllowlist({
      cfg: params.cfg,
      entries: parts,
    }).catch(() => null);

    if (!resolved) {
      const ids = parts.filter((part) => looksLikeGuid(part));
      if (ids.length !== parts.length) {
        await params.prompter.note(
          "Graph 查找不可用。请仅使用用户 ID。",
          "MS Teams 白名单",
        );
        continue;
      }
      const unique = mergeAllowFromEntries(existing, ids);
      return setMSTeamsAllowFrom(params.cfg, unique);
    }

    const unresolved = resolved.filter((item) => !item.resolved || !item.id);
    if (unresolved.length > 0) {
      await params.prompter.note(
        `无法解析：${unresolved.map((item) => item.input).join(", ")}`,
        "MS Teams 白名单",
      );
      continue;
    }

    const ids = resolved.map((item) => item.id as string);
    const unique = mergeAllowFromEntries(existing, ids);
    return setMSTeamsAllowFrom(params.cfg, unique);
  }
}

async function noteMSTeamsCredentialHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) Azure Bot registration -> get App ID + Tenant ID",
      "2) Add a client secret (App Password)",
      "3) Set webhook URL + messaging endpoint",
      "Tip: you can also set MSTEAMS_APP_ID / MSTEAMS_APP_PASSWORD / MSTEAMS_TENANT_ID.",
      `Docs: ${formatDocsLink("/channels/msteams", "msteams")}`,
    ].join("\n"),
    "MS Teams 凭据",
  );
}

function setMSTeamsTeamsAllowlist(
  cfg: OpenClawConfig,
  entries: Array<{ teamKey: string; channelKey?: string }>,
): OpenClawConfig {
  const baseTeams = cfg.channels?.msteams?.teams ?? {};
  const teams: Record<string, { channels?: Record<string, unknown> }> = { ...baseTeams };
  for (const entry of entries) {
    const teamKey = entry.teamKey;
    if (!teamKey) {
      continue;
    }
    const existing = teams[teamKey] ?? {};
    if (entry.channelKey) {
      const channels = { ...existing.channels };
      channels[entry.channelKey] = channels[entry.channelKey] ?? {};
      teams[teamKey] = { ...existing, channels };
    } else {
      teams[teamKey] = existing;
    }
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      msteams: {
        ...cfg.channels?.msteams,
        enabled: true,
        teams: teams as Record<string, MSTeamsTeamConfig>,
      },
    },
  };
}

function listMSTeamsGroupEntries(cfg: OpenClawConfig): string[] {
  return Object.entries(cfg.channels?.msteams?.teams ?? {}).flatMap(([teamKey, value]) => {
    const channels = value?.channels ?? {};
    const channelKeys = Object.keys(channels);
    if (channelKeys.length === 0) {
      return [teamKey];
    }
    return channelKeys.map((channelKey) => `${teamKey}/${channelKey}`);
  });
}

async function resolveMSTeamsGroupAllowlist(params: {
  cfg: OpenClawConfig;
  entries: string[];
  prompter: Pick<WizardPrompter, "note">;
}): Promise<Array<{ teamKey: string; channelKey?: string }>> {
  let resolvedEntries = params.entries
    .map((entry) => parseMSTeamsTeamEntry(entry))
    .filter(Boolean) as Array<{ teamKey: string; channelKey?: string }>;
  if (params.entries.length === 0 || !resolveMSTeamsCredentials(params.cfg.channels?.msteams)) {
    return resolvedEntries;
  }
  try {
    const lookups = await resolveMSTeamsChannelAllowlist({
      cfg: params.cfg,
      entries: params.entries,
    });
    const resolvedChannels = lookups.filter(
      (entry) => entry.resolved && entry.teamId && entry.channelId,
    );
    const resolvedTeams = lookups.filter(
      (entry) => entry.resolved && entry.teamId && !entry.channelId,
    );
    const unresolved = lookups.filter((entry) => !entry.resolved).map((entry) => entry.input);
    resolvedEntries = [
      ...resolvedChannels.map((entry) => ({
        teamKey: entry.teamId as string,
        channelKey: entry.channelId as string,
      })),
      ...resolvedTeams.map((entry) => ({
        teamKey: entry.teamId as string,
      })),
      ...unresolved.map((entry) => parseMSTeamsTeamEntry(entry)).filter(Boolean),
    ] as Array<{ teamKey: string; channelKey?: string }>;
    const summary: string[] = [];
    if (resolvedChannels.length > 0) {
      summary.push(
        `Resolved channels: ${resolvedChannels
          .map((entry) => entry.channelId)
          .filter(Boolean)
          .join(", ")}`,
      );
    }
    if (resolvedTeams.length > 0) {
      summary.push(
        `Resolved teams: ${resolvedTeams
          .map((entry) => entry.teamId)
          .filter(Boolean)
          .join(", ")}`,
      );
    }
    if (unresolved.length > 0) {
      summary.push(`Unresolved (kept as typed): ${unresolved.join(", ")}`);
    }
    if (summary.length > 0) {
      await params.prompter.note(summary.join("\n"), "MS Teams channels");
    }
    return resolvedEntries;
  } catch (err) {
    await params.prompter.note(
      `Channel lookup failed; keeping entries as typed. ${String(err)}`,
      "MS Teams channels",
    );
    return resolvedEntries;
  }
}

const msteamsGroupAccess: NonNullable<ChannelSetupWizard["groupAccess"]> = {
  label: "MS Teams channels",
  placeholder: "Team Name/Channel Name, teamId/conversationId",
  currentPolicy: ({ cfg }) => cfg.channels?.msteams?.groupPolicy ?? "allowlist",
  currentEntries: ({ cfg }) => listMSTeamsGroupEntries(cfg),
  updatePrompt: ({ cfg }) => Boolean(cfg.channels?.msteams?.teams),
  setPolicy: ({ cfg, policy }) => setMSTeamsGroupPolicy(cfg, policy),
  resolveAllowlist: async ({ cfg, entries, prompter }) =>
    await resolveMSTeamsGroupAllowlist({ cfg, entries, prompter }),
  applyAllowlist: ({ cfg, resolved }) =>
    setMSTeamsTeamsAllowlist(cfg, resolved as Array<{ teamKey: string; channelKey?: string }>),
};

const msteamsDmPolicy: ChannelSetupDmPolicy = createTopLevelChannelDmPolicy({
  label: "MS Teams",
  channel,
  policyKey: "channels.msteams.dmPolicy",
  allowFromKey: "channels.msteams.allowFrom",
  getCurrent: (cfg) => cfg.channels?.msteams?.dmPolicy ?? "pairing",
  promptAllowFrom: promptMSTeamsAllowFrom,
});

export { msteamsSetupAdapter } from "./setup-core.js";

export const msteamsSetupWizard: ChannelSetupWizard = {
  channel,
  resolveAccountIdForConfigure: () => DEFAULT_ACCOUNT_ID,
  resolveShouldPromptAccountIds: () => false,
  status: createStandardChannelSetupStatus({
    channelLabel: "MS Teams",
    configuredLabel: "configured",
    unconfiguredLabel: "needs app credentials",
    configuredHint: "configured",
    unconfiguredHint: "needs app creds",
    configuredScore: 2,
    unconfiguredScore: 0,
    includeStatusLine: true,
    resolveConfigured: ({ cfg }) =>
      Boolean(resolveMSTeamsCredentials(cfg.channels?.msteams)) ||
      hasConfiguredMSTeamsCredentials(cfg.channels?.msteams),
  }),
  credentials: [],
  finalize: async ({ cfg, prompter }) => {
    const resolved = resolveMSTeamsCredentials(cfg.channels?.msteams);
    const hasConfigCreds = hasConfiguredMSTeamsCredentials(cfg.channels?.msteams);
    const canUseEnv = Boolean(
      !hasConfigCreds &&
      normalizeSecretInputString(process.env.MSTEAMS_APP_ID) &&
      normalizeSecretInputString(process.env.MSTEAMS_APP_PASSWORD) &&
      normalizeSecretInputString(process.env.MSTEAMS_TENANT_ID),
    );

    let next = cfg;
    let appId: string | null = null;
    let appPassword: string | null = null;
    let tenantId: string | null = null;

    if (!resolved && !hasConfigCreds) {
      await noteMSTeamsCredentialHelp(prompter);
    }

    if (canUseEnv) {
      const keepEnv = await prompter.confirm({
        message:
          "检测到 MSTEAMS_APP_ID + MSTEAMS_APP_PASSWORD + MSTEAMS_TENANT_ID 环境变量。是否使用？",
        initialValue: true,
      });
      if (keepEnv) {
        next = msteamsSetupAdapter.applyAccountConfig({
          cfg: next,
          accountId: DEFAULT_ACCOUNT_ID,
          input: {},
        });
      } else {
        ({ appId, appPassword, tenantId } = await promptMSTeamsCredentials(prompter));
      }
    } else if (hasConfigCreds) {
      const keep = await prompter.confirm({
        message: "MS Teams 凭据已配置。保留吗？",
        initialValue: true,
      });
      if (!keep) {
        ({ appId, appPassword, tenantId } = await promptMSTeamsCredentials(prompter));
      }
    } else {
      ({ appId, appPassword, tenantId } = await promptMSTeamsCredentials(prompter));
    }

    if (appId && appPassword && tenantId) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          msteams: {
            ...next.channels?.msteams,
            enabled: true,
            appId,
            appPassword,
            tenantId,
          },
        },
      };
    }

    return { cfg: next, accountId: DEFAULT_ACCOUNT_ID };
  },
  dmPolicy: msteamsDmPolicy,
  groupAccess: msteamsGroupAccess,
  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      msteams: { ...cfg.channels?.msteams, enabled: false },
    },
  }),
};
