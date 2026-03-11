import { formatCliCommand } from "../../../cli/command-format.js";
import type { OpenClawConfig } from "../../../config/config.js";
import { hasConfiguredSecretInput } from "../../../config/types.secrets.js";
import { DEFAULT_ACCOUNT_ID } from "../../../routing/session-key.js";
import { inspectTelegramAccount } from "../../../telegram/account-inspect.js";
import {
  listTelegramAccountIds,
  resolveDefaultTelegramAccountId,
  resolveTelegramAccount,
} from "../../../telegram/accounts.js";
import { formatDocsLink } from "../../../terminal/links.js";
import type { WizardPrompter } from "../../../wizard/prompts.js";
import { fetchTelegramChatId } from "../../telegram/api.js";
import type { ChannelOnboardingAdapter, ChannelOnboardingDmPolicy } from "../onboarding-types.js";
import {
  applySingleTokenPromptResult,
  patchChannelConfigForAccount,
  promptResolvedAllowFrom,
  resolveAccountIdForConfigure,
  resolveOnboardingAccountId,
  runSingleChannelSecretStep,
  setChannelDmPolicyWithAllowFrom,
  setOnboardingChannelEnabled,
  splitOnboardingEntries,
} from "./helpers.js";

const channel = "telegram" as const;

async function noteTelegramTokenHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) 打开 Telegram 并与 @BotFather 聊天",
      "2) 运行 /newbot（或 /mybots）",
      "3) 复制令牌（形如 123456:ABC...）",
      "提示：您也可以在环境变量中设置 TELEGRAM_BOT_TOKEN。",
      `文档：${formatDocsLink("/telegram")}`,
      "Website: https://openclaw.ai",
    ].join("\n"),
    "Telegram 机器人令牌",
  );
}

async function noteTelegramUserIdHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      `1) 给您的机器人发私信，然后在 \`${formatCliCommand("openclaw logs --follow")}\` 中读取 from.id（最安全）`,
      "2) 或者访问 https://api.telegram.org/bot<bot_token>/getUpdates 并读取 message.from.id",
      "3) 第三方：给 @userinfobot 或 @getidsbot 发私信",
      `文档：${formatDocsLink("/telegram")}`,
      "Website: https://openclaw.ai",
    ].join("\n"),
    "Telegram 用户 ID",
  );
}

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

async function promptTelegramAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId: string;
  tokenOverride?: string;
}): Promise<OpenClawConfig> {
  const { cfg, prompter, accountId } = params;
  const resolved = resolveTelegramAccount({ cfg, accountId });
  const existingAllowFrom = resolved.config.allowFrom ?? [];
  await noteTelegramUserIdHelp(prompter);

  const token = params.tokenOverride?.trim() || resolved.token;
  if (!token) {
    await prompter.note("缺少 Telegram 令牌；无法查找用户名。", "Telegram");
  }
  const unique = await promptResolvedAllowFrom({
    prompter,
    existing: existingAllowFrom,
    token,
    message: "Telegram allowFrom（数字发送者 ID；@用户名会解析为 ID）",
    placeholder: "@username",
    label: "Telegram 白名单",
    parseInputs: splitOnboardingEntries,
    parseId: parseTelegramAllowFromId,
    invalidWithoutTokenNote:
      "缺少 Telegram 令牌；请使用数字发送者 ID（用户名需要机器人令牌）。",
    resolveEntries: async ({ token: tokenValue, entries }) => {
      const results = await Promise.all(
        entries.map(async (entry) => {
          const numericId = parseTelegramAllowFromId(entry);
          if (numericId) {
            return { input: entry, resolved: true, id: numericId };
          }
          const stripped = normalizeTelegramAllowFromInput(entry);
          if (!stripped) {
            return { input: entry, resolved: false, id: null };
          }
          const username = stripped.startsWith("@") ? stripped : `@${stripped}`;
          const id = await fetchTelegramChatId({ token: tokenValue, chatId: username });
          return { input: entry, resolved: Boolean(id), id };
        }),
      );
      return results;
    },
  });

  return patchChannelConfigForAccount({
    cfg,
    channel: "telegram",
    accountId,
    patch: { dmPolicy: "allowlist", allowFrom: unique },
  });
}

async function promptTelegramAllowFromForAccount(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<OpenClawConfig> {
  const accountId = resolveOnboardingAccountId({
    accountId: params.accountId,
    defaultAccountId: resolveDefaultTelegramAccountId(params.cfg),
  });
  return promptTelegramAllowFrom({
    cfg: params.cfg,
    prompter: params.prompter,
    accountId,
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
      channel: "telegram",
      dmPolicy: policy,
    }),
  promptAllowFrom: promptTelegramAllowFromForAccount,
};

export const telegramOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = listTelegramAccountIds(cfg).some((accountId) => {
      const account = inspectTelegramAccount({ cfg, accountId });
      return account.configured;
    });
    return {
      channel,
      configured,
      statusLines: [`Telegram: ${configured ? "已配置" : "需要令牌"}`],
      selectionHint: configured ? "推荐 · 已配置" : "推荐 · 新手友好",
      quickstartScore: configured ? 1 : 10,
    };
  },
  configure: async ({
    cfg,
    prompter,
    options,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    const defaultTelegramAccountId = resolveDefaultTelegramAccountId(cfg);
    const telegramAccountId = await resolveAccountIdForConfigure({
      cfg,
      prompter,
      label: "Telegram",
      accountOverride: accountOverrides.telegram,
      shouldPromptAccountIds,
      listAccountIds: listTelegramAccountIds,
      defaultAccountId: defaultTelegramAccountId,
    });

    let next = cfg;
    const resolvedAccount = resolveTelegramAccount({
      cfg: next,
      accountId: telegramAccountId,
    });
    const hasConfiguredBotToken = hasConfiguredSecretInput(resolvedAccount.config.botToken);
    const hasConfigToken =
      hasConfiguredBotToken || Boolean(resolvedAccount.config.tokenFile?.trim());
    const allowEnv = telegramAccountId === DEFAULT_ACCOUNT_ID;
    const tokenStep = await runSingleChannelSecretStep({
      cfg: next,
      prompter,
      providerHint: "telegram",
      credentialLabel: "Telegram 机器人令牌",
      secretInputMode: options?.secretInputMode,
      accountConfigured: Boolean(resolvedAccount.token) || hasConfigToken,
      hasConfigToken,
      allowEnv,
      envValue: process.env.TELEGRAM_BOT_TOKEN,
      envPrompt: "检测到 TELEGRAM_BOT_TOKEN。使用环境变量？",
      keepPrompt: "Telegram 令牌已配置。保留它？",
      inputPrompt: "输入 Telegram 机器人令牌",
      preferredEnvVar: allowEnv ? "TELEGRAM_BOT_TOKEN" : undefined,
      onMissingConfigured: async () => await noteTelegramTokenHelp(prompter),
      applyUseEnv: async (cfg) =>
        applySingleTokenPromptResult({
          cfg,
          channel: "telegram",
          accountId: telegramAccountId,
          tokenPatchKey: "botToken",
          tokenResult: { useEnv: true, token: null },
        }),
      applySet: async (cfg, value) =>
        applySingleTokenPromptResult({
          cfg,
          channel: "telegram",
          accountId: telegramAccountId,
          tokenPatchKey: "botToken",
          tokenResult: { useEnv: false, token: value },
        }),
    });
    next = tokenStep.cfg;

    if (forceAllowFrom) {
      next = await promptTelegramAllowFrom({
        cfg: next,
        prompter,
        accountId: telegramAccountId,
        tokenOverride: tokenStep.resolvedValue,
      });
    }

    return { cfg: next, accountId: telegramAccountId };
  },
  dmPolicy,
  disable: (cfg) => setOnboardingChannelEnabled(cfg, channel, false),
};
