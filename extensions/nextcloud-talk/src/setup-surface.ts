import type { ChannelOnboardingDmPolicy } from "../../../src/channels/plugins/onboarding-types.js";
import {
  mergeAllowFromEntries,
  resolveOnboardingAccountId,
  setOnboardingChannelEnabled,
  setTopLevelChannelDmPolicyWithAllowFrom,
} from "../../../src/channels/plugins/onboarding/helpers.js";
import {
  applyAccountNameToChannelSection,
  patchScopedAccountConfig,
} from "../../../src/channels/plugins/setup-helpers.js";
import { type ChannelSetupWizard } from "../../../src/channels/plugins/setup-wizard.js";
import type { ChannelSetupAdapter } from "../../../src/channels/plugins/types.adapters.js";
import type { ChannelSetupInput } from "../../../src/channels/plugins/types.core.js";
import type { OpenClawConfig } from "../../../src/config/config.js";
import { hasConfiguredSecretInput } from "../../../src/config/types.secrets.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../../src/routing/session-key.js";
import { formatDocsLink } from "../../../src/terminal/links.js";
import type { WizardPrompter } from "../../../src/wizard/prompts.js";
import {
  listNextcloudTalkAccountIds,
  resolveDefaultNextcloudTalkAccountId,
  resolveNextcloudTalkAccount,
} from "./accounts.js";
import type { CoreConfig, DmPolicy } from "./types.js";

const channel = "nextcloud-talk" as const;
const CONFIGURE_API_FLAG = "__nextcloudTalkConfigureApiCredentials";

type NextcloudSetupInput = ChannelSetupInput & {
  baseUrl?: string;
  secret?: string;
  secretFile?: string;
};
type NextcloudTalkSection = NonNullable<CoreConfig["channels"]>["nextcloud-talk"];

function normalizeNextcloudTalkBaseUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

function validateNextcloudTalkBaseUrl(value: string): string | undefined {
  if (!value) {
    return "必填";
  }
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return "URL 必须以 http:// 或 https:// 开头";
  }
  return undefined;
}

function setNextcloudTalkDmPolicy(cfg: CoreConfig, dmPolicy: DmPolicy): CoreConfig {
  return setTopLevelChannelDmPolicyWithAllowFrom({
    cfg,
    channel,
    dmPolicy,
  }) as CoreConfig;
}

function setNextcloudTalkAccountConfig(
  cfg: CoreConfig,
  accountId: string,
  updates: Record<string, unknown>,
): CoreConfig {
  return patchScopedAccountConfig({
    cfg,
    channelKey: channel,
    accountId,
    patch: updates,
  }) as CoreConfig;
}

function clearNextcloudTalkAccountFields(
  cfg: CoreConfig,
  accountId: string,
  fields: string[],
): CoreConfig {
  const section = cfg.channels?.["nextcloud-talk"];
  if (!section) {
    return cfg;
  }

  if (accountId === DEFAULT_ACCOUNT_ID) {
    const nextSection = { ...section } as Record<string, unknown>;
    for (const field of fields) {
      delete nextSection[field];
    }
    return {
      ...cfg,
      channels: {
        ...(cfg.channels ?? {}),
        "nextcloud-talk": nextSection as NextcloudTalkSection,
      },
    } as CoreConfig;
  }

  const currentAccount = section.accounts?.[accountId];
  if (!currentAccount) {
    return cfg;
  }

  const nextAccount = { ...currentAccount } as Record<string, unknown>;
  for (const field of fields) {
    delete nextAccount[field];
  }
  return {
    ...cfg,
    channels: {
      ...(cfg.channels ?? {}),
      "nextcloud-talk": {
        ...section,
        accounts: {
          ...section.accounts,
          [accountId]: nextAccount as NonNullable<typeof section.accounts>[string],
        },
      },
    },
  } as CoreConfig;
}

async function promptNextcloudTalkAllowFrom(params: {
  cfg: CoreConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<CoreConfig> {
  const resolved = resolveNextcloudTalkAccount({ cfg: params.cfg, accountId: params.accountId });
  const existingAllowFrom = resolved.config.allowFrom ?? [];
  await params.prompter.note(
    [
      "1) 在 Nextcloud 管理面板中查看用户 ID",
      "2) 或者查看有人发消息时的 webhook 负载日志",
      "3) 用户 ID 通常是 Nextcloud 中的小写用户名",
      `Docs: ${formatDocsLink("/channels/nextcloud-talk", "channels/nextcloud-talk")}`,
    ].join("\n"),
    "Nextcloud Talk 用户 ID",
  );

  let resolvedIds: string[] = [];
  while (resolvedIds.length === 0) {
    const entry = await params.prompter.text({
      message: "Nextcloud Talk allowFrom（用户 ID）",
      placeholder: "username",
      initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });
    resolvedIds = String(entry)
      .split(/[\n,;]+/g)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (resolvedIds.length === 0) {
      await params.prompter.note("请至少输入一个有效的用户 ID。", "Nextcloud Talk");
    }
  }

  return setNextcloudTalkAccountConfig(params.cfg, params.accountId, {
    dmPolicy: "allowlist",
    allowFrom: mergeAllowFromEntries(
      existingAllowFrom.map((value) => String(value).trim().toLowerCase()),
      resolvedIds,
    ),
  });
}

async function promptNextcloudTalkAllowFromForAccount(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<OpenClawConfig> {
  const accountId = resolveOnboardingAccountId({
    accountId: params.accountId,
    defaultAccountId: resolveDefaultNextcloudTalkAccountId(params.cfg as CoreConfig),
  });
  return await promptNextcloudTalkAllowFrom({
    cfg: params.cfg as CoreConfig,
    prompter: params.prompter,
    accountId,
  });
}

const nextcloudTalkDmPolicy: ChannelOnboardingDmPolicy = {
  label: "Nextcloud Talk",
  channel,
  policyKey: "channels.nextcloud-talk.dmPolicy",
  allowFromKey: "channels.nextcloud-talk.allowFrom",
  getCurrent: (cfg) => cfg.channels?.["nextcloud-talk"]?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setNextcloudTalkDmPolicy(cfg as CoreConfig, policy as DmPolicy),
  promptAllowFrom: promptNextcloudTalkAllowFromForAccount,
};

export const nextcloudTalkSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
  applyAccountName: ({ cfg, accountId, name }) =>
    applyAccountNameToChannelSection({
      cfg,
      channelKey: channel,
      accountId,
      name,
    }),
  validateInput: ({ accountId, input }) => {
    const setupInput = input as NextcloudSetupInput;
    if (setupInput.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
      return "NEXTCLOUD_TALK_BOT_SECRET 只能用于默认账户。";
    }
    if (!setupInput.useEnv && !setupInput.secret && !setupInput.secretFile) {
      return "Nextcloud Talk 需要机器人密钥或 --secret-file（或 --use-env）。";
    }
    if (!setupInput.baseUrl) {
      return "Nextcloud Talk 需要 --base-url。";
    }
    return null;
  },
  applyAccountConfig: ({ cfg, accountId, input }) => {
    const setupInput = input as NextcloudSetupInput;
    const namedConfig = applyAccountNameToChannelSection({
      cfg,
      channelKey: channel,
      accountId,
      name: setupInput.name,
    });
    const next = setupInput.useEnv
      ? clearNextcloudTalkAccountFields(namedConfig as CoreConfig, accountId, [
          "botSecret",
          "botSecretFile",
        ])
      : namedConfig;
    const patch = {
      baseUrl: normalizeNextcloudTalkBaseUrl(setupInput.baseUrl),
      ...(setupInput.useEnv
        ? {}
        : setupInput.secretFile
          ? { botSecretFile: setupInput.secretFile }
          : setupInput.secret
            ? { botSecret: setupInput.secret }
            : {}),
    };
    return setNextcloudTalkAccountConfig(next as CoreConfig, accountId, patch);
  },
};

export const nextcloudTalkSetupWizard: ChannelSetupWizard = {
  channel,
  stepOrder: "text-first",
  status: {
    configuredLabel: "已配置",
    unconfiguredLabel: "需要设置",
    configuredHint: "已配置",
    unconfiguredHint: "自托管聊天",
    configuredScore: 1,
    unconfiguredScore: 5,
    resolveConfigured: ({ cfg }) =>
      listNextcloudTalkAccountIds(cfg as CoreConfig).some((accountId) => {
        const account = resolveNextcloudTalkAccount({ cfg: cfg as CoreConfig, accountId });
        return Boolean(account.secret && account.baseUrl);
      }),
  },
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
  disable: (cfg) => setOnboardingChannelEnabled(cfg, channel, false),
};
