import type { ChannelSetupInput } from "openclaw/plugin-sdk/channel-setup";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/routing";
import { hasConfiguredSecretInput } from "openclaw/plugin-sdk/secret-input";
import {
  createStandardChannelSetupStatus,
  formatDocsLink,
  setSetupChannelEnabled,
  type ChannelSetupWizard,
} from "openclaw/plugin-sdk/setup";
import { listNextcloudTalkAccountIds, resolveNextcloudTalkAccount } from "./accounts.js";
import {
  clearNextcloudTalkAccountFields,
  nextcloudTalkDmPolicy,
  nextcloudTalkSetupAdapter,
  normalizeNextcloudTalkBaseUrl,
  setNextcloudTalkAccountConfig,
  validateNextcloudTalkBaseUrl,
} from "./setup-core.js";
import type { CoreConfig, DmPolicy } from "./types.js";

const channel = "nextcloud-talk" as const;
const CONFIGURE_API_FLAG = "__nextcloudTalkConfigureApiCredentials";

export const nextcloudTalkSetupWizard: ChannelSetupWizard = {
  channel,
  stepOrder: "text-first",
  status: createStandardChannelSetupStatus({
    channelLabel: "Nextcloud Talk",
    configuredLabel: "configured",
    unconfiguredLabel: "needs setup",
    configuredHint: "configured",
    unconfiguredHint: "self-hosted chat",
    configuredScore: 1,
    unconfiguredScore: 5,
    resolveConfigured: ({ cfg }) =>
      listNextcloudTalkAccountIds(cfg as CoreConfig).some((accountId) => {
        const account = resolveNextcloudTalkAccount({ cfg: cfg as CoreConfig, accountId });
        return Boolean(account.secret && account.baseUrl);
      }),
  }),
  introNote: {
    title: "Nextcloud Talk 机器人设置",
    lines: [
      "1) SSH 登录到你的 Nextcloud 服务器",
      '2) 运行：./occ talk:bot:install "OpenClaw" "<shared-secret>" "<webhook-url>" --feature reaction',
      "3) 复制你在命令中使用的共享密钥",
      "4) 在 Nextcloud Talk 房间设置中启用机器人",
      "提示：你也可以在环境变量中设置 NEXTCLOUD_TALK_BOT_SECRET。",
      `Docs: ${formatDocsLink("/channels/nextcloud-talk", "channels/nextcloud-talk")}`,
    ],
    shouldShow: ({ cfg, accountId }) => {
      const account = resolveNextcloudTalkAccount({ cfg: cfg as CoreConfig, accountId });
      return !account.secret || !account.baseUrl;
    },
  },
  prepare: async ({ cfg, accountId, credentialValues, prompter }) => {
    const resolvedAccount = resolveNextcloudTalkAccount({ cfg: cfg as CoreConfig, accountId });
    const hasApiCredentials = Boolean(
      resolvedAccount.config.apiUser?.trim() &&
      (hasConfiguredSecretInput(resolvedAccount.config.apiPassword) ||
        resolvedAccount.config.apiPasswordFile),
    );
    const configureApiCredentials = await prompter.confirm({
      message: "配置可选的 Nextcloud Talk API 凭据以进行房间查找？",
      initialValue: hasApiCredentials,
    });
    if (!configureApiCredentials) {
      return;
    }
    return {
      credentialValues: {
        ...credentialValues,
        [CONFIGURE_API_FLAG]: "1",
      },
    };
  },
  credentials: [
    {
      inputKey: "token",
      providerHint: channel,
      credentialLabel: "机器人密钥",
      preferredEnvVar: "NEXTCLOUD_TALK_BOT_SECRET",
      envPrompt: "检测到 NEXTCLOUD_TALK_BOT_SECRET。使用环境变量？",
      keepPrompt: "Nextcloud Talk 机器人密钥已配置。保留吗？",
      inputPrompt: "输入 Nextcloud Talk 机器人密钥",
      allowEnv: ({ accountId }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }) => {
        const resolvedAccount = resolveNextcloudTalkAccount({ cfg: cfg as CoreConfig, accountId });
        return {
          accountConfigured: Boolean(resolvedAccount.secret && resolvedAccount.baseUrl),
          hasConfiguredValue: Boolean(
            hasConfiguredSecretInput(resolvedAccount.config.botSecret) ||
            resolvedAccount.config.botSecretFile,
          ),
          resolvedValue: resolvedAccount.secret || undefined,
          envValue:
            accountId === DEFAULT_ACCOUNT_ID
              ? process.env.NEXTCLOUD_TALK_BOT_SECRET?.trim() || undefined
              : undefined,
        };
      },
      applyUseEnv: async (params) => {
        const resolvedAccount = resolveNextcloudTalkAccount({
          cfg: params.cfg as CoreConfig,
          accountId: params.accountId,
        });
        const cleared = clearNextcloudTalkAccountFields(
          params.cfg as CoreConfig,
          params.accountId,
          ["botSecret", "botSecretFile"],
        );
        return setNextcloudTalkAccountConfig(cleared, params.accountId, {
          baseUrl: resolvedAccount.baseUrl,
        });
      },
      applySet: async (params) =>
        setNextcloudTalkAccountConfig(
          clearNextcloudTalkAccountFields(params.cfg as CoreConfig, params.accountId, [
            "botSecret",
            "botSecretFile",
          ]),
          params.accountId,
          {
            botSecret: params.value,
          },
        ),
    },
    {
      inputKey: "password",
      providerHint: "nextcloud-talk-api",
      credentialLabel: "API 密码",
      preferredEnvVar: "NEXTCLOUD_TALK_API_PASSWORD",
      envPrompt: "",
      keepPrompt: "Nextcloud Talk API 密码已配置。保留吗？",
      inputPrompt: "输入 Nextcloud Talk API 密码",
      inspect: ({ cfg, accountId }) => {
        const resolvedAccount = resolveNextcloudTalkAccount({ cfg: cfg as CoreConfig, accountId });
        const apiUser = resolvedAccount.config.apiUser?.trim();
        const apiPasswordConfigured = Boolean(
          hasConfiguredSecretInput(resolvedAccount.config.apiPassword) ||
          resolvedAccount.config.apiPasswordFile,
        );
        return {
          accountConfigured: Boolean(apiUser && apiPasswordConfigured),
          hasConfiguredValue: apiPasswordConfigured,
        };
      },
      shouldPrompt: ({ credentialValues }) => credentialValues[CONFIGURE_API_FLAG] === "1",
      applySet: async (params) =>
        setNextcloudTalkAccountConfig(
          clearNextcloudTalkAccountFields(params.cfg as CoreConfig, params.accountId, [
            "apiPassword",
            "apiPasswordFile",
          ]),
          params.accountId,
          {
            apiPassword: params.value,
          },
        ),
    },
  ],
  textInputs: [
    {
      inputKey: "httpUrl",
      message: "输入 Nextcloud 实例 URL（例如 https://cloud.example.com）",
      currentValue: ({ cfg, accountId }) =>
        resolveNextcloudTalkAccount({ cfg: cfg as CoreConfig, accountId }).baseUrl || undefined,
      shouldPrompt: ({ currentValue }) => !currentValue,
      validate: ({ value }) => validateNextcloudTalkBaseUrl(value),
      normalizeValue: ({ value }) => normalizeNextcloudTalkBaseUrl(value),
      applySet: async (params) =>
        setNextcloudTalkAccountConfig(params.cfg as CoreConfig, params.accountId, {
          baseUrl: params.value,
        }),
    },
    {
      inputKey: "userId",
      message: "Nextcloud Talk API 用户",
      currentValue: ({ cfg, accountId }) =>
        resolveNextcloudTalkAccount({ cfg: cfg as CoreConfig, accountId }).config.apiUser?.trim() ||
        undefined,
      shouldPrompt: ({ credentialValues }) => credentialValues[CONFIGURE_API_FLAG] === "1",
      validate: ({ value }) => (value ? undefined : "必填"),
      applySet: async (params) =>
        setNextcloudTalkAccountConfig(params.cfg as CoreConfig, params.accountId, {
          apiUser: params.value,
        }),
    },
  ],
  dmPolicy: nextcloudTalkDmPolicy,
  disable: (cfg) => setSetupChannelEnabled(cfg, channel, false),
};

export { nextcloudTalkSetupAdapter };
