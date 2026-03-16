import type { ChannelOnboardingDmPolicy } from "../../../src/channels/plugins/onboarding-types.js";
import {
  noteChannelLookupFailure,
  noteChannelLookupSummary,
  parseMentionOrPrefixedId,
  patchChannelConfigForAccount,
  promptLegacyChannelAllowFrom,
  resolveOnboardingAccountId,
  setAccountGroupPolicyForChannel,
  setLegacyChannelDmPolicyWithAllowFrom,
  setOnboardingChannelEnabled,
} from "../../../src/channels/plugins/onboarding/helpers.js";
import {
  applyAccountNameToChannelSection,
  migrateBaseNameToDefaultAccount,
} from "../../../src/channels/plugins/setup-helpers.js";
import type {
  ChannelSetupWizard,
  ChannelSetupWizardAllowFromEntry,
} from "../../../src/channels/plugins/setup-wizard.js";
import type { ChannelSetupAdapter } from "../../../src/channels/plugins/types.adapters.js";
import type { OpenClawConfig } from "../../../src/config/config.js";
import { hasConfiguredSecretInput } from "../../../src/config/types.secrets.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../../src/routing/session-key.js";
import { formatDocsLink } from "../../../src/terminal/links.js";
import type { WizardPrompter } from "../../../src/wizard/prompts.js";
import { inspectSlackAccount } from "./account-inspect.js";
import {
  listSlackAccountIds,
  resolveDefaultSlackAccountId,
  resolveSlackAccount,
  type ResolvedSlackAccount,
} from "./accounts.js";
import { resolveSlackChannelAllowlist } from "./resolve-channels.js";
import { resolveSlackUserAllowlist } from "./resolve-users.js";

const channel = "slack" as const;

function buildSlackManifest(botName: string) {
  const safeName = botName.trim() || "OpenClaw";
  const manifest = {
    display_information: {
      name: safeName,
      description: `${safeName} connector for OpenClaw`,
    },
    features: {
      bot_user: {
        display_name: safeName,
        always_online: false,
      },
      app_home: {
        messages_tab_enabled: true,
        messages_tab_read_only_enabled: false,
      },
      slash_commands: [
        {
          command: "/openclaw",
          description: "发送消息到 OpenClaw",
          should_escape: false,
        },
      ],
    },
    oauth_config: {
      scopes: {
        bot: [
          "chat:write",
          "channels:history",
          "channels:read",
          "groups:history",
          "im:history",
          "mpim:history",
          "users:read",
          "app_mentions:read",
          "reactions:read",
          "reactions:write",
          "pins:read",
          "pins:write",
          "emoji:read",
          "commands",
          "files:read",
          "files:write",
        ],
      },
    },
    settings: {
      socket_mode_enabled: true,
      event_subscriptions: {
        bot_events: [
          "app_mention",
          "message.channels",
          "message.groups",
          "message.im",
          "message.mpim",
          "reaction_added",
          "reaction_removed",
          "member_joined_channel",
          "member_left_channel",
          "channel_rename",
          "pin_added",
          "pin_removed",
        ],
      },
    },
  };
  return JSON.stringify(manifest, null, 2);
}

function buildSlackSetupLines(botName = "OpenClaw"): string[] {
  return [
    "1) Slack API -> 创建应用 -> 从头创建或使用 Manifest（使用下方 JSON）",
    "2) 添加 Socket Mode 并启用以获取应用级别令牌 (xapp-...)",
    "3) 将应用安装到工作区以获取 xoxb- 机器人令牌",
    "4) 启用事件订阅（socket）以接收消息事件",
    "5) App Home -> 启用消息标签以支持私信",
    "提示：在环境变量中设置 SLACK_BOT_TOKEN + SLACK_APP_TOKEN。",
    `Docs: ${formatDocsLink("/slack", "slack")}`,
    "",
    "Manifest (JSON):",
    buildSlackManifest(botName),
  ];
}

function setSlackChannelAllowlist(
  cfg: OpenClawConfig,
  accountId: string,
  channelKeys: string[],
): OpenClawConfig {
  const channels = Object.fromEntries(channelKeys.map((key) => [key, { allow: true }]));
  return patchChannelConfigForAccount({
    cfg,
    channel,
    accountId,
    patch: { channels },
  });
}

function enableSlackAccount(cfg: OpenClawConfig, accountId: string): OpenClawConfig {
  return patchChannelConfigForAccount({
    cfg,
    channel,
    accountId,
    patch: { enabled: true },
  });
}

async function resolveSlackAllowFromEntries(params: {
  token?: string;
  entries: string[];
}): Promise<ChannelSetupWizardAllowFromEntry[]> {
  if (!params.token?.trim()) {
    return params.entries.map((input) => ({
      input,
      resolved: false,
      id: null,
    }));
  }
  const resolved = await resolveSlackUserAllowlist({
    token: params.token,
    entries: params.entries,
  });
  return resolved.map((entry) => ({
    input: entry.input,
    resolved: entry.resolved,
    id: entry.id ?? null,
  }));
}

async function promptSlackAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<OpenClawConfig> {
  const accountId = resolveOnboardingAccountId({
    accountId: params.accountId,
    defaultAccountId: resolveDefaultSlackAccountId(params.cfg),
  });
  const resolved = resolveSlackAccount({ cfg: params.cfg, accountId });
  const token = resolved.userToken ?? resolved.botToken ?? "";
  const existing =
    params.cfg.channels?.slack?.allowFrom ?? params.cfg.channels?.slack?.dm?.allowFrom ?? [];
  const parseId = (value: string) =>
    parseMentionOrPrefixedId({
      value,
      mentionPattern: /^<@([A-Z0-9]+)>$/i,
      prefixPattern: /^(slack:|user:)/i,
      idPattern: /^[A-Z][A-Z0-9]+$/i,
      normalizeId: (id) => id.toUpperCase(),
    });

  return promptLegacyChannelAllowFrom({
    cfg: params.cfg,
    channel,
    prompter: params.prompter,
    existing,
    token,
    noteTitle: "Slack 白名单",
    noteLines: [
      "通过用户名将 Slack 私聊加入白名单（我们会解析为用户 ID）。",
      "示例：",
      "- U12345678",
      "- @alice",
      "多个条目：用逗号分隔。",
      `Docs: ${formatDocsLink("/slack", "slack")}`,
    ],
    message: "Slack allowFrom（用户名或 ID）",
    placeholder: "@alice, U12345678",
    parseId,
    invalidWithoutTokenNote: "缺少 Slack 令牌；请仅使用用户 ID（或 @提及格式）。",
    resolveEntries: ({ token, entries }) =>
      resolveSlackUserAllowlist({
        token,
        entries,
      }),
  });
}

const slackDmPolicy: ChannelOnboardingDmPolicy = {
  label: "Slack",
  channel,
  policyKey: "channels.slack.dmPolicy",
  allowFromKey: "channels.slack.allowFrom",
  getCurrent: (cfg) =>
    cfg.channels?.slack?.dmPolicy ?? cfg.channels?.slack?.dm?.policy ?? "pairing",
  setPolicy: (cfg, policy) =>
    setLegacyChannelDmPolicyWithAllowFrom({
      cfg,
      channel,
      dmPolicy: policy,
    }),
  promptAllowFrom: promptSlackAllowFrom,
};

function isSlackAccountConfigured(account: ResolvedSlackAccount): boolean {
  const hasConfiguredBotToken =
    Boolean(account.botToken?.trim()) || hasConfiguredSecretInput(account.config.botToken);
  const hasConfiguredAppToken =
    Boolean(account.appToken?.trim()) || hasConfiguredSecretInput(account.config.appToken);
  return hasConfiguredBotToken && hasConfiguredAppToken;
}

export const slackSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
  applyAccountName: ({ cfg, accountId, name }) =>
    applyAccountNameToChannelSection({
      cfg,
      channelKey: channel,
      accountId,
      name,
    }),
  validateInput: ({ accountId, input }) => {
    if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
      return "Slack 环境变量令牌只能用于默认账户。";
    }
    if (!input.useEnv && (!input.botToken || !input.appToken)) {
      return "Slack 需要 --bot-token 和 --app-token（或 --use-env）。";
    }
    return null;
  },
  applyAccountConfig: ({ cfg, accountId, input }) => {
    const namedConfig = applyAccountNameToChannelSection({
      cfg,
      channelKey: channel,
      accountId,
      name: input.name,
    });
    const next =
      accountId !== DEFAULT_ACCOUNT_ID
        ? migrateBaseNameToDefaultAccount({
            cfg: namedConfig,
            channelKey: channel,
          })
        : namedConfig;
    if (accountId === DEFAULT_ACCOUNT_ID) {
      return {
        ...next,
        channels: {
          ...next.channels,
          slack: {
            ...next.channels?.slack,
            enabled: true,
            ...(input.useEnv
              ? {}
              : {
                  ...(input.botToken ? { botToken: input.botToken } : {}),
                  ...(input.appToken ? { appToken: input.appToken } : {}),
                }),
          },
        },
      };
    }
    return {
      ...next,
      channels: {
        ...next.channels,
        slack: {
          ...next.channels?.slack,
          enabled: true,
          accounts: {
            ...next.channels?.slack?.accounts,
            [accountId]: {
              ...next.channels?.slack?.accounts?.[accountId],
              enabled: true,
              ...(input.botToken ? { botToken: input.botToken } : {}),
              ...(input.appToken ? { appToken: input.appToken } : {}),
            },
          },
        },
      },
    };
  },
};

export const slackSetupWizard: ChannelSetupWizard = {
  channel,
  status: {
    configuredLabel: "已配置",
    unconfiguredLabel: "需要令牌",
    configuredHint: "已配置",
    unconfiguredHint: "需要令牌",
    configuredScore: 2,
    unconfiguredScore: 1,
    resolveConfigured: ({ cfg }) =>
      listSlackAccountIds(cfg).some((accountId) => {
        const account = inspectSlackAccount({ cfg, accountId });
        return account.configured;
      }),
  },
  introNote: {
    title: "Slack Socket Mode 令牌",
    lines: buildSlackSetupLines(),
    shouldShow: ({ cfg, accountId }) =>
      !isSlackAccountConfigured(resolveSlackAccount({ cfg, accountId })),
  },
  envShortcut: {
    prompt: "检测到 SLACK_BOT_TOKEN + SLACK_APP_TOKEN。使用环境变量？",
    preferredEnvVar: "SLACK_BOT_TOKEN",
    isAvailable: ({ cfg, accountId }) =>
      accountId === DEFAULT_ACCOUNT_ID &&
      Boolean(process.env.SLACK_BOT_TOKEN?.trim()) &&
      Boolean(process.env.SLACK_APP_TOKEN?.trim()) &&
      !isSlackAccountConfigured(resolveSlackAccount({ cfg, accountId })),
    apply: ({ cfg, accountId }) => enableSlackAccount(cfg, accountId),
  },
  credentials: [
    {
      inputKey: "botToken",
      providerHint: "slack-bot",
      credentialLabel: "Slack 机器人令牌",
      preferredEnvVar: "SLACK_BOT_TOKEN",
      envPrompt: "检测到 SLACK_BOT_TOKEN。使用环境变量？",
      keepPrompt: "Slack 机器人令牌已配置。保留吗？",
      inputPrompt: "输入 Slack 机器人令牌 (xoxb-...)",
      allowEnv: ({ accountId }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }) => {
        const resolved = resolveSlackAccount({ cfg, accountId });
        return {
          accountConfigured:
            Boolean(resolved.botToken) || hasConfiguredSecretInput(resolved.config.botToken),
          hasConfiguredValue: hasConfiguredSecretInput(resolved.config.botToken),
          resolvedValue: resolved.botToken?.trim() || undefined,
          envValue:
            accountId === DEFAULT_ACCOUNT_ID ? process.env.SLACK_BOT_TOKEN?.trim() : undefined,
        };
      },
      applyUseEnv: ({ cfg, accountId }) => enableSlackAccount(cfg, accountId),
      applySet: ({ cfg, accountId, value }) =>
        patchChannelConfigForAccount({
          cfg,
          channel,
          accountId,
          patch: {
            enabled: true,
            botToken: value,
          },
        }),
    },
    {
      inputKey: "appToken",
      providerHint: "slack-app",
      credentialLabel: "Slack 应用令牌",
      preferredEnvVar: "SLACK_APP_TOKEN",
      envPrompt: "检测到 SLACK_APP_TOKEN。使用环境变量？",
      keepPrompt: "Slack 应用令牌已配置。保留吗？",
      inputPrompt: "输入 Slack 应用令牌 (xapp-...)",
      allowEnv: ({ accountId }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }) => {
        const resolved = resolveSlackAccount({ cfg, accountId });
        return {
          accountConfigured:
            Boolean(resolved.appToken) || hasConfiguredSecretInput(resolved.config.appToken),
          hasConfiguredValue: hasConfiguredSecretInput(resolved.config.appToken),
          resolvedValue: resolved.appToken?.trim() || undefined,
          envValue:
            accountId === DEFAULT_ACCOUNT_ID ? process.env.SLACK_APP_TOKEN?.trim() : undefined,
        };
      },
      applyUseEnv: ({ cfg, accountId }) => enableSlackAccount(cfg, accountId),
      applySet: ({ cfg, accountId, value }) =>
        patchChannelConfigForAccount({
          cfg,
          channel,
          accountId,
          patch: {
            enabled: true,
            appToken: value,
          },
        }),
    },
  ],
  dmPolicy: slackDmPolicy,
  allowFrom: {
    helpTitle: "Slack 白名单",
    helpLines: [
      "通过用户名将 Slack 私聊加入白名单（我们会解析为用户 ID）。",
      "示例：",
      "- U12345678",
      "- @alice",
      "多个条目：用逗号分隔。",
      `Docs: ${formatDocsLink("/slack", "slack")}`,
    ],
    credentialInputKey: "botToken",
    message: "Slack allowFrom（用户名或 ID）",
    placeholder: "@alice, U12345678",
    invalidWithoutCredentialNote: "缺少 Slack 令牌；请仅使用用户 ID（或 @提及格式）。",
    parseId: (value) =>
      parseMentionOrPrefixedId({
        value,
        mentionPattern: /^<@([A-Z0-9]+)>$/i,
        prefixPattern: /^(slack:|user:)/i,
        idPattern: /^[A-Z][A-Z0-9]+$/i,
        normalizeId: (id) => id.toUpperCase(),
      }),
    resolveEntries: async ({ credentialValues, entries }) =>
      await resolveSlackAllowFromEntries({
        token: credentialValues.botToken,
        entries,
      }),
    apply: ({ cfg, accountId, allowFrom }) =>
      patchChannelConfigForAccount({
        cfg,
        channel,
        accountId,
        patch: { dmPolicy: "allowlist", allowFrom },
      }),
  },
  groupAccess: {
    label: "Slack 频道",
    placeholder: "#general, #private, C123",
    currentPolicy: ({ cfg, accountId }) =>
      resolveSlackAccount({ cfg, accountId }).config.groupPolicy ?? "allowlist",
    currentEntries: ({ cfg, accountId }) =>
      Object.entries(resolveSlackAccount({ cfg, accountId }).config.channels ?? {})
        .filter(([, value]) => value?.allow !== false && value?.enabled !== false)
        .map(([key]) => key),
    updatePrompt: ({ cfg, accountId }) =>
      Boolean(resolveSlackAccount({ cfg, accountId }).config.channels),
    setPolicy: ({ cfg, accountId, policy }) =>
      setAccountGroupPolicyForChannel({
        cfg,
        channel,
        accountId,
        groupPolicy: policy,
      }),
    resolveAllowlist: async ({ cfg, accountId, credentialValues, entries, prompter }) => {
      let keys = entries;
      const accountWithTokens = resolveSlackAccount({
        cfg,
        accountId,
      });
      const activeBotToken = accountWithTokens.botToken || credentialValues.botToken || "";
      if (activeBotToken && entries.length > 0) {
        try {
          const resolved = await resolveSlackChannelAllowlist({
            token: activeBotToken,
            entries,
          });
          const resolvedKeys = resolved
            .filter((entry) => entry.resolved && entry.id)
            .map((entry) => entry.id as string);
          const unresolved = resolved
            .filter((entry) => !entry.resolved)
            .map((entry) => entry.input);
          keys = [...resolvedKeys, ...unresolved.map((entry) => entry.trim()).filter(Boolean)];
          await noteChannelLookupSummary({
            prompter,
            label: "Slack 频道",
            resolvedSections: [{ title: "已解析", values: resolvedKeys }],
            unresolved,
          });
        } catch (error) {
          await noteChannelLookupFailure({
            prompter,
            label: "Slack 频道",
            error,
          });
        }
      }
      return keys;
    },
    applyAllowlist: ({ cfg, accountId, resolved }) =>
      setSlackChannelAllowlist(cfg, accountId, resolved as string[]),
  },
  disable: (cfg) => setOnboardingChannelEnabled(cfg, channel, false),
};
