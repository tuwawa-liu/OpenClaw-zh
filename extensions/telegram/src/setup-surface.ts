import { type ChannelOnboardingDmPolicy } from "../../../src/channels/plugins/onboarding-types.js";
import {
  patchChannelConfigForAccount,
  promptResolvedAllowFrom,
  resolveOnboardingAccountId,
  setChannelDmPolicyWithAllowFrom,
  setOnboardingChannelEnabled,
  splitOnboardingEntries,
} from "../../../src/channels/plugins/onboarding/helpers.js";
import {
  applyAccountNameToChannelSection,
  migrateBaseNameToDefaultAccount,
} from "../../../src/channels/plugins/setup-helpers.js";
import { type ChannelSetupWizard } from "../../../src/channels/plugins/setup-wizard.js";
import type { ChannelSetupAdapter } from "../../../src/channels/plugins/types.adapters.js";
import { formatCliCommand } from "../../../src/cli/command-format.js";
import type { OpenClawConfig } from "../../../src/config/config.js";
import { hasConfiguredSecretInput } from "../../../src/config/types.secrets.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../../src/routing/session-key.js";
import { formatDocsLink } from "../../../src/terminal/links.js";
import { inspectTelegramAccount } from "./account-inspect.js";
import {
  listTelegramAccountIds,
  resolveDefaultTelegramAccountId,
  resolveTelegramAccount,
} from "./accounts.js";
import { fetchTelegramChatId } from "./api-fetch.js";

const channel = "telegram" as const;

const TELEGRAM_TOKEN_HELP_LINES = [
  "1) 打开 Telegram 并与 @BotFather 聊天",
  "2) 运行 /newbot（或 /mybots）",
  "3) 复制令牌（形如 123456:ABC...）",
  "提示：你也可以在环境变量中设置 TELEGRAM_BOT_TOKEN。",
  `Docs: ${formatDocsLink("/telegram")}`,
  "Website: https://openclaw.ai",
];

const TELEGRAM_USER_ID_HELP_LINES = [
  `1) 给你的机器人发私信，然后在 \`${formatCliCommand("openclaw logs --follow")}\` 中查看 from.id（最安全）`,
  "2) 或访问 https://api.telegram.org/bot<bot_token>/getUpdates 并查看 message.from.id",
  "3) 第三方：给 @userinfobot 或 @getidsbot 发消息",
  `Docs: ${formatDocsLink("/telegram")}`,
  "Website: https://openclaw.ai",
];

export function normalizeTelegramAllowFromInput(raw: string): string {
  return raw
    .trim()
    .replace(/^(telegram|tg):/i, "")
    .trim();
}

export function parseTelegramAllowFromId(raw: string): string | null {
  const stripped = normalizeTelegramAllowFromInput(raw);
  return /^\d+$/.test(stripped) ? stripped : null;
}

async function resolveTelegramAllowFromEntries(params: {
  entries: string[];
  credentialValue?: string;
}) {
  return await Promise.all(
    params.entries.map(async (entry) => {
      const numericId = parseTelegramAllowFromId(entry);
      if (numericId) {
        return { input: entry, resolved: true, id: numericId };
      }
      const stripped = normalizeTelegramAllowFromInput(entry);
      if (!stripped || !params.credentialValue?.trim()) {
        return { input: entry, resolved: false, id: null };
      }
      const username = stripped.startsWith("@") ? stripped : `@${stripped}`;
      const id = await fetchTelegramChatId({
        token: params.credentialValue,
        chatId: username,
      });
      return { input: entry, resolved: Boolean(id), id };
    }),
  );
}

async function promptTelegramAllowFromForAccount(params: {
  cfg: OpenClawConfig;
  prompter: Parameters<NonNullable<ChannelOnboardingDmPolicy["promptAllowFrom"]>>[0]["prompter"];
  accountId?: string;
}): Promise<OpenClawConfig> {
  const accountId = resolveOnboardingAccountId({
    accountId: params.accountId,
    defaultAccountId: resolveDefaultTelegramAccountId(params.cfg),
  });
  const resolved = resolveTelegramAccount({ cfg: params.cfg, accountId });
  await params.prompter.note(TELEGRAM_USER_ID_HELP_LINES.join("\n"), "Telegram 用户 ID");
  if (!resolved.token?.trim()) {
    await params.prompter.note("Telegram 令牌缺失；用户名查找不可用。", "Telegram");
  }
  const unique = await promptResolvedAllowFrom({
    prompter: params.prompter,
    existing: resolved.config.allowFrom ?? [],
    token: resolved.token,
    message: "Telegram allowFrom（数字发送者 ID；@用户名会解析为 ID）",
    placeholder: "@username",
    label: "Telegram 白名单",
    parseInputs: splitOnboardingEntries,
    parseId: parseTelegramAllowFromId,
    invalidWithoutTokenNote: "Telegram 令牌缺失；请使用数字发送者 ID（用户名需要机器人令牌）。",
    resolveEntries: async ({ entries, token }) =>
      resolveTelegramAllowFromEntries({
        credentialValue: token,
        entries,
      }),
  });
  return patchChannelConfigForAccount({
    cfg: params.cfg,
    channel,
    accountId,
    patch: { dmPolicy: "allowlist", allowFrom: unique },
  });
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Telegram",
  channel,
  policyKey: "channels.telegram.dmPolicy",
  allowFromKey: "channels.telegram.allowFrom",
  getCurrent: (cfg) => cfg.channels?.telegram?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) =>
    setChannelDmPolicyWithAllowFrom({
      cfg,
      channel,
      dmPolicy: policy,
    }),
  promptAllowFrom: promptTelegramAllowFromForAccount,
};

export const telegramSetupAdapter: ChannelSetupAdapter = {
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
      return "TELEGRAM_BOT_TOKEN 只能用于默认账户。";
    }
    if (!input.useEnv && !input.token && !input.tokenFile) {
      return "Telegram 需要令牌或 --token-file（或 --use-env）。";
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
          telegram: {
            ...next.channels?.telegram,
            enabled: true,
            ...(input.useEnv
              ? {}
              : input.tokenFile
                ? { tokenFile: input.tokenFile }
                : input.token
                  ? { botToken: input.token }
                  : {}),
          },
        },
      };
    }
    return {
      ...next,
      channels: {
        ...next.channels,
        telegram: {
          ...next.channels?.telegram,
          enabled: true,
          accounts: {
            ...next.channels?.telegram?.accounts,
            [accountId]: {
              ...next.channels?.telegram?.accounts?.[accountId],
              enabled: true,
              ...(input.tokenFile
                ? { tokenFile: input.tokenFile }
                : input.token
                  ? { botToken: input.token }
                  : {}),
            },
          },
        },
      },
    };
  },
};

export const telegramSetupWizard: ChannelSetupWizard = {
  channel,
  status: {
    configuredLabel: "已配置",
    unconfiguredLabel: "需要令牌",
    configuredHint: "推荐 · 已配置",
    unconfiguredHint: "推荐 · 新手友好",
    configuredScore: 1,
    unconfiguredScore: 10,
    resolveConfigured: ({ cfg }) =>
      listTelegramAccountIds(cfg).some((accountId) => {
        const account = inspectTelegramAccount({ cfg, accountId });
        return account.configured;
      }),
  },
  credentials: [
    {
      inputKey: "token",
      providerHint: channel,
      credentialLabel: "Telegram 机器人令牌",
      preferredEnvVar: "TELEGRAM_BOT_TOKEN",
      helpTitle: "Telegram 机器人令牌",
      helpLines: TELEGRAM_TOKEN_HELP_LINES,
      envPrompt: "检测到 TELEGRAM_BOT_TOKEN。使用环境变量？",
      keepPrompt: "Telegram 令牌已配置。保留吗？",
      inputPrompt: "输入 Telegram 机器人令牌",
      allowEnv: ({ accountId }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }) => {
        const resolved = resolveTelegramAccount({ cfg, accountId });
        const hasConfiguredBotToken = hasConfiguredSecretInput(resolved.config.botToken);
        const hasConfiguredValue =
          hasConfiguredBotToken || Boolean(resolved.config.tokenFile?.trim());
        return {
          accountConfigured: Boolean(resolved.token) || hasConfiguredValue,
          hasConfiguredValue,
          resolvedValue: resolved.token?.trim() || undefined,
          envValue:
            accountId === DEFAULT_ACCOUNT_ID
              ? process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined
              : undefined,
        };
      },
    },
  ],
  allowFrom: {
    helpTitle: "Telegram 用户 ID",
    helpLines: TELEGRAM_USER_ID_HELP_LINES,
    credentialInputKey: "token",
    message: "Telegram allowFrom（数字发送者 ID；@用户名会解析为 ID）",
    placeholder: "@username",
    invalidWithoutCredentialNote:
      "Telegram 令牌缺失；请使用数字发送者 ID（用户名需要机器人令牌）。",
    parseInputs: splitOnboardingEntries,
    parseId: parseTelegramAllowFromId,
    resolveEntries: async ({ credentialValues, entries }) =>
      resolveTelegramAllowFromEntries({
        credentialValue: credentialValues.token,
        entries,
      }),
    apply: async ({ cfg, accountId, allowFrom }) =>
      patchChannelConfigForAccount({
        cfg,
        channel,
        accountId,
        patch: { dmPolicy: "allowlist", allowFrom },
      }),
  },
  dmPolicy,
  disable: (cfg) => setOnboardingChannelEnabled(cfg, channel, false),
};
