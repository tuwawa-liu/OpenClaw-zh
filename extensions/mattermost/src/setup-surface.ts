import {
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
  DEFAULT_ACCOUNT_ID,
  hasConfiguredSecretInput,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/mattermost";
import { type ChannelSetupWizard } from "../../../src/channels/plugins/setup-wizard.js";
import type { ChannelSetupAdapter } from "../../../src/channels/plugins/types.adapters.js";
import { formatDocsLink } from "../../../src/terminal/links.js";
import {
  listMattermostAccountIds,
  resolveMattermostAccount,
  type ResolvedMattermostAccount,
} from "./mattermost/accounts.js";
import { normalizeMattermostBaseUrl } from "./mattermost/client.js";

const channel = "mattermost" as const;

function isMattermostConfigured(account: ResolvedMattermostAccount): boolean {
  const tokenConfigured =
    Boolean(account.botToken?.trim()) || hasConfiguredSecretInput(account.config.botToken);
  return tokenConfigured && Boolean(account.baseUrl);
}

function resolveMattermostAccountWithSecrets(cfg: OpenClawConfig, accountId: string) {
  return resolveMattermostAccount({
    cfg,
    accountId,
    allowUnresolvedSecretRef: true,
  });
}

export const mattermostSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
  applyAccountName: ({ cfg, accountId, name }) =>
    applyAccountNameToChannelSection({
      cfg,
      channelKey: channel,
      accountId,
      name,
    }),
  validateInput: ({ accountId, input }) => {
    const token = input.botToken ?? input.token;
    const baseUrl = normalizeMattermostBaseUrl(input.httpUrl);
    if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
      return "Mattermost 环境变量只能用于默认账户。";
    }
    if (!input.useEnv && (!token || !baseUrl)) {
      return "Mattermost 需要 --bot-token 和 --http-url（或 --use-env）。";
    }
    if (input.httpUrl && !baseUrl) {
      return "Mattermost --http-url 必须包含有效的基础 URL。";
    }
    return null;
  },
  applyAccountConfig: ({ cfg, accountId, input }) => {
    const token = input.botToken ?? input.token;
    const baseUrl = normalizeMattermostBaseUrl(input.httpUrl);
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
    return applySetupAccountConfigPatch({
      cfg: next,
      channelKey: channel,
      accountId,
      patch: input.useEnv
        ? {}
        : {
            ...(token ? { botToken: token } : {}),
            ...(baseUrl ? { baseUrl } : {}),
          },
    });
  },
};

export const mattermostSetupWizard: ChannelSetupWizard = {
  channel,
  status: {
    configuredLabel: "已配置",
    unconfiguredLabel: "需要令牌 + URL",
    configuredHint: "已配置",
    unconfiguredHint: "需要设置",
    configuredScore: 2,
    unconfiguredScore: 1,
    resolveConfigured: ({ cfg }) =>
      listMattermostAccountIds(cfg).some((accountId) =>
        isMattermostConfigured(resolveMattermostAccountWithSecrets(cfg, accountId)),
      ),
  },
  introNote: {
    title: "Mattermost 机器人令牌",
    lines: [
      "1) Mattermost 系统控制台 -> 集成 -> 机器人账户",
      "2) 创建机器人 + 复制其令牌",
      "3) 使用你的服务器基础 URL（例如 https://chat.example.com）",
      "提示：机器人必须是你想要监控的任何频道的成员。",
      `Docs: ${formatDocsLink("/mattermost", "mattermost")}`,
    ],
    shouldShow: ({ cfg, accountId }) =>
      !isMattermostConfigured(resolveMattermostAccountWithSecrets(cfg, accountId)),
  },
  envShortcut: {
    prompt: "检测到 MATTERMOST_BOT_TOKEN + MATTERMOST_URL。使用环境变量？",
    preferredEnvVar: "MATTERMOST_BOT_TOKEN",
    isAvailable: ({ cfg, accountId }) => {
      if (accountId !== DEFAULT_ACCOUNT_ID) {
        return false;
      }
      const resolvedAccount = resolveMattermostAccountWithSecrets(cfg, accountId);
      const hasConfigValues =
        hasConfiguredSecretInput(resolvedAccount.config.botToken) ||
        Boolean(resolvedAccount.config.baseUrl?.trim());
      return Boolean(
        process.env.MATTERMOST_BOT_TOKEN?.trim() &&
        process.env.MATTERMOST_URL?.trim() &&
        !hasConfigValues,
      );
    },
    apply: ({ cfg, accountId }) =>
      applySetupAccountConfigPatch({
        cfg,
        channelKey: channel,
        accountId,
        patch: {},
      }),
  },
  credentials: [
    {
      inputKey: "botToken",
      providerHint: channel,
      credentialLabel: "机器人令牌",
      preferredEnvVar: "MATTERMOST_BOT_TOKEN",
      envPrompt: "检测到 MATTERMOST_BOT_TOKEN + MATTERMOST_URL。使用环境变量？",
      keepPrompt: "Mattermost 机器人令牌已配置。保留吗？",
      inputPrompt: "输入 Mattermost 机器人令牌",
      inspect: ({ cfg, accountId }) => {
        const resolvedAccount = resolveMattermostAccountWithSecrets(cfg, accountId);
        return {
          accountConfigured: isMattermostConfigured(resolvedAccount),
          hasConfiguredValue: hasConfiguredSecretInput(resolvedAccount.config.botToken),
        };
      },
    },
  ],
  textInputs: [
    {
      inputKey: "httpUrl",
      message: "输入 Mattermost 基础 URL",
      confirmCurrentValue: false,
      currentValue: ({ cfg, accountId }) =>
        resolveMattermostAccountWithSecrets(cfg, accountId).baseUrl ??
        process.env.MATTERMOST_URL?.trim(),
      initialValue: ({ cfg, accountId }) =>
        resolveMattermostAccountWithSecrets(cfg, accountId).baseUrl ??
        process.env.MATTERMOST_URL?.trim(),
      shouldPrompt: ({ cfg, accountId, credentialValues, currentValue }) => {
        const resolvedAccount = resolveMattermostAccountWithSecrets(cfg, accountId);
        const tokenConfigured =
          Boolean(resolvedAccount.botToken?.trim()) ||
          hasConfiguredSecretInput(resolvedAccount.config.botToken);
        return Boolean(credentialValues.botToken) || !tokenConfigured || !currentValue;
      },
      validate: ({ value }) =>
        normalizeMattermostBaseUrl(value)
          ? undefined
          : "Mattermost 基础 URL 必须包含有效的基础 URL。",
      normalizeValue: ({ value }) => normalizeMattermostBaseUrl(value) ?? value.trim(),
    },
  ],
  disable: (cfg: OpenClawConfig) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      mattermost: {
        ...cfg.channels?.mattermost,
        enabled: false,
      },
    },
  }),
};
