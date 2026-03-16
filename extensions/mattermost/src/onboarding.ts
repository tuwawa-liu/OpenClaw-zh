import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import {
  buildSingleChannelSecretPromptState,
  hasConfiguredSecretInput,
  promptSingleChannelSecretInput,
  type ChannelOnboardingAdapter,
  type OpenClawConfig,
  type SecretInput,
  type WizardPrompter,
} from "openclaw/plugin-sdk/mattermost";
import {
  listMattermostAccountIds,
  resolveDefaultMattermostAccountId,
  resolveMattermostAccount,
} from "./mattermost/accounts.js";
import { resolveAccountIdForConfigure } from "./onboarding-helpers.js";

const channel = "mattermost" as const;

async function noteMattermostSetup(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) Mattermost 系统控制台 -> 集成 -> 机器人账号",
      "2) 创建机器人并复制令牌",
      "3) 使用你的服务器基础 URL（例如 https://chat.example.com）",
      "提示：机器人必须是你想让它监控的频道的成员。",
      "文档：https://docs.openclaw.ai/channels/mattermost",
    ].join("\n"),
    "Mattermost 机器人令牌",
  );
}

async function promptMattermostBaseUrl(params: {
  prompter: WizardPrompter;
  initialValue?: string;
}): Promise<string> {
  const baseUrl = String(
    await params.prompter.text({
      message: "输入 Mattermost 基础 URL",
      initialValue: params.initialValue,
      validate: (value) => (value?.trim() ? undefined : "必填"),
    }),
  ).trim();
  return baseUrl;
}

export const mattermostOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = listMattermostAccountIds(cfg).some((accountId) => {
      const account = resolveMattermostAccount({
        cfg,
        accountId,
        allowUnresolvedSecretRef: true,
      });
      const tokenConfigured =
        Boolean(account.botToken) || hasConfiguredSecretInput(account.config.botToken);
      return tokenConfigured && Boolean(account.baseUrl);
    });
    return {
      channel,
      configured,
      statusLines: [`Mattermost：${configured ? "已配置" : "需要令牌和 URL"}`],
      selectionHint: configured ? "已配置" : "需要设置",
      quickstartScore: configured ? 2 : 1,
    };
  },
  configure: async ({ cfg, prompter, accountOverrides, shouldPromptAccountIds }) => {
    const defaultAccountId = resolveDefaultMattermostAccountId(cfg);
    const accountId = await resolveAccountIdForConfigure({
      cfg,
      prompter,
      label: "Mattermost",
      accountOverride: accountOverrides.mattermost,
      shouldPromptAccountIds,
      listAccountIds: listMattermostAccountIds,
      defaultAccountId,
    });

    let next = cfg;
    const resolvedAccount = resolveMattermostAccount({
      cfg: next,
      accountId,
      allowUnresolvedSecretRef: true,
    });
    const accountConfigured = Boolean(resolvedAccount.botToken && resolvedAccount.baseUrl);
    const allowEnv = accountId === DEFAULT_ACCOUNT_ID;
    const hasConfigToken = hasConfiguredSecretInput(resolvedAccount.config.botToken);
    const hasConfigValues = hasConfigToken || Boolean(resolvedAccount.config.baseUrl);
    const tokenPromptState = buildSingleChannelSecretPromptState({
      accountConfigured,
      hasConfigToken,
      allowEnv: allowEnv && !hasConfigValues,
      envValue:
        process.env.MATTERMOST_BOT_TOKEN?.trim() && process.env.MATTERMOST_URL?.trim()
          ? process.env.MATTERMOST_BOT_TOKEN
          : undefined,
    });

    let botToken: SecretInput | null = null;
    let baseUrl: string | null = null;

    if (!accountConfigured) {
      await noteMattermostSetup(prompter);
    }

    const botTokenResult = await promptSingleChannelSecretInput({
      cfg: next,
      prompter,
      providerHint: "mattermost",
      credentialLabel: "机器人令牌",
      accountConfigured: tokenPromptState.accountConfigured,
      canUseEnv: tokenPromptState.canUseEnv,
      hasConfigToken: tokenPromptState.hasConfigToken,
      envPrompt: "检测到 MATTERMOST_BOT_TOKEN + MATTERMOST_URL。使用环境变量？",
      keepPrompt: "Mattermost 机器人令牌已配置。保留吗？",
      inputPrompt: "输入 Mattermost 机器人令牌",
      preferredEnvVar: "MATTERMOST_BOT_TOKEN",
    });
    if (botTokenResult.action === "keep") {
      return { cfg: next, accountId };
    }

    if (botTokenResult.action === "use-env") {
      if (accountId === DEFAULT_ACCOUNT_ID) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            mattermost: {
              ...next.channels?.mattermost,
              enabled: true,
            },
          },
        };
      }
      return { cfg: next, accountId };
    }

    botToken = botTokenResult.value;
    baseUrl = await promptMattermostBaseUrl({
      prompter,
      initialValue: resolvedAccount.baseUrl ?? process.env.MATTERMOST_URL?.trim(),
    });

    if (accountId === DEFAULT_ACCOUNT_ID) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          mattermost: {
            ...next.channels?.mattermost,
            enabled: true,
            botToken,
            baseUrl,
          },
        },
      };
    } else {
      next = {
        ...next,
        channels: {
          ...next.channels,
          mattermost: {
            ...next.channels?.mattermost,
            enabled: true,
            accounts: {
              ...next.channels?.mattermost?.accounts,
              [accountId]: {
                ...next.channels?.mattermost?.accounts?.[accountId],
                enabled: next.channels?.mattermost?.accounts?.[accountId]?.enabled ?? true,
                botToken,
                baseUrl,
              },
            },
          },
        },
      };
    }

    return { cfg: next, accountId };
  },
  disable: (cfg: OpenClawConfig) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      mattermost: { ...cfg.channels?.mattermost, enabled: false },
    },
  }),
};
