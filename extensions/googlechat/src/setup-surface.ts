import type { ChannelOnboardingDmPolicy } from "../../../src/channels/plugins/onboarding-types.js";
import {
  addWildcardAllowFrom,
  mergeAllowFromEntries,
  setTopLevelChannelDmPolicyWithAllowFrom,
  splitOnboardingEntries,
} from "../../../src/channels/plugins/onboarding/helpers.js";
import {
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
  migrateBaseNameToDefaultAccount,
} from "../../../src/channels/plugins/setup-helpers.js";
import type { ChannelSetupWizard } from "../../../src/channels/plugins/setup-wizard.js";
import type { ChannelSetupAdapter } from "../../../src/channels/plugins/types.adapters.js";
import type { OpenClawConfig } from "../../../src/config/config.js";
import type { DmPolicy } from "../../../src/config/types.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../../src/routing/session-key.js";
import { formatDocsLink } from "../../../src/terminal/links.js";
import {
  listGoogleChatAccountIds,
  resolveDefaultGoogleChatAccountId,
  resolveGoogleChatAccount,
} from "./accounts.js";

const channel = "googlechat" as const;
const ENV_SERVICE_ACCOUNT = "GOOGLE_CHAT_SERVICE_ACCOUNT";
const ENV_SERVICE_ACCOUNT_FILE = "GOOGLE_CHAT_SERVICE_ACCOUNT_FILE";
const USE_ENV_FLAG = "__googlechatUseEnv";
const AUTH_METHOD_FLAG = "__googlechatAuthMethod";

function setGoogleChatDmPolicy(cfg: OpenClawConfig, policy: DmPolicy) {
  const allowFrom =
    policy === "open" ? addWildcardAllowFrom(cfg.channels?.googlechat?.dm?.allowFrom) : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      googlechat: {
        ...cfg.channels?.googlechat,
        dm: {
          ...cfg.channels?.googlechat?.dm,
          policy,
          ...(allowFrom ? { allowFrom } : {}),
        },
      },
    },
  };
}

async function promptAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: Parameters<NonNullable<ChannelOnboardingDmPolicy["promptAllowFrom"]>>[0]["prompter"];
}): Promise<OpenClawConfig> {
  const current = params.cfg.channels?.googlechat?.dm?.allowFrom ?? [];
  const entry = await params.prompter.text({
    message: "Google Chat allowFrom（users/<id> 或邮箱；避免使用 users/<email>）",
    placeholder: "users/123456789, name@example.com",
    initialValue: current[0] ? String(current[0]) : undefined,
    validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
  });
  const parts = splitOnboardingEntries(String(entry));
  const unique = mergeAllowFromEntries(undefined, parts);
  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      googlechat: {
        ...params.cfg.channels?.googlechat,
        enabled: true,
        dm: {
          ...params.cfg.channels?.googlechat?.dm,
          policy: "allowlist",
          allowFrom: unique,
        },
      },
    },
  };
}

const googlechatDmPolicy: ChannelOnboardingDmPolicy = {
  label: "Google Chat",
  channel,
  policyKey: "channels.googlechat.dm.policy",
  allowFromKey: "channels.googlechat.dm.allowFrom",
  getCurrent: (cfg) => cfg.channels?.googlechat?.dm?.policy ?? "pairing",
  setPolicy: (cfg, policy) => setGoogleChatDmPolicy(cfg, policy),
  promptAllowFrom,
};

export const googlechatSetupAdapter: ChannelSetupAdapter = {
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
      return "GOOGLE_CHAT_SERVICE_ACCOUNT 环境变量只能用于默认账户。";
    }
    if (!input.useEnv && !input.token && !input.tokenFile) {
      return "Google Chat 需要 --token（服务账户 JSON）或 --token-file。";
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
    const patch = input.useEnv
      ? {}
      : input.tokenFile
        ? { serviceAccountFile: input.tokenFile }
        : input.token
          ? { serviceAccount: input.token }
          : {};
    const audienceType = input.audienceType?.trim();
    const audience = input.audience?.trim();
    const webhookPath = input.webhookPath?.trim();
    const webhookUrl = input.webhookUrl?.trim();
    return applySetupAccountConfigPatch({
      cfg: next,
      channelKey: channel,
      accountId,
      patch: {
        ...patch,
        ...(audienceType ? { audienceType } : {}),
        ...(audience ? { audience } : {}),
        ...(webhookPath ? { webhookPath } : {}),
        ...(webhookUrl ? { webhookUrl } : {}),
      },
    });
  },
};

export const googlechatSetupWizard: ChannelSetupWizard = {
  channel,
  status: {
    configuredLabel: "已配置",
    unconfiguredLabel: "需要服务账户",
    configuredHint: "已配置",
    unconfiguredHint: "需要认证",
    resolveConfigured: ({ cfg }) =>
      listGoogleChatAccountIds(cfg).some(
        (accountId) => resolveGoogleChatAccount({ cfg, accountId }).credentialSource !== "none",
      ),
    resolveStatusLines: ({ cfg }) => {
      const configured = listGoogleChatAccountIds(cfg).some(
        (accountId) => resolveGoogleChatAccount({ cfg, accountId }).credentialSource !== "none",
      );
      return [`Google Chat：${configured ? "已配置" : "需要服务账户"}`];
    },
  },
  introNote: {
    title: "Google Chat 设置",
    lines: [
      "Google Chat 应用使用服务账户认证和 HTTPS webhook。",
      "在服务账户中设置 Chat API 范围并配置 Chat 应用 URL。",
      "Webhook 验证需要受众类型 + 受众值。",
      `Docs: ${formatDocsLink("/channels/googlechat", "googlechat")}`,
    ],
  },
  prepare: async ({ cfg, accountId, credentialValues, prompter }) => {
    const envReady =
      accountId === DEFAULT_ACCOUNT_ID &&
      (Boolean(process.env[ENV_SERVICE_ACCOUNT]) || Boolean(process.env[ENV_SERVICE_ACCOUNT_FILE]));
    if (envReady) {
      const useEnv = await prompter.confirm({
        message: "使用 GOOGLE_CHAT_SERVICE_ACCOUNT 环境变量？",
        initialValue: true,
      });
      if (useEnv) {
        return {
          cfg: applySetupAccountConfigPatch({
            cfg,
            channelKey: channel,
            accountId,
            patch: {},
          }),
          credentialValues: {
            ...credentialValues,
            [USE_ENV_FLAG]: "1",
          },
        };
      }
    }

    const method = await prompter.select({
      message: "Google Chat 认证方式",
      options: [
        { value: "file", label: "服务账户 JSON 文件" },
        { value: "inline", label: "粘贴服务账户 JSON" },
      ],
      initialValue: "file",
    });

    return {
      credentialValues: {
        ...credentialValues,
        [USE_ENV_FLAG]: "0",
        [AUTH_METHOD_FLAG]: String(method),
      },
    };
  },
  credentials: [],
  textInputs: [
    {
      inputKey: "tokenFile",
      message: "服务账户 JSON 路径",
      placeholder: "/path/to/service-account.json",
      shouldPrompt: ({ credentialValues }) =>
        credentialValues[USE_ENV_FLAG] !== "1" && credentialValues[AUTH_METHOD_FLAG] === "file",
      validate: ({ value }) => (String(value ?? "").trim() ? undefined : "必填"),
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        applySetupAccountConfigPatch({
          cfg,
          channelKey: channel,
          accountId,
          patch: { serviceAccountFile: value },
        }),
    },
    {
      inputKey: "token",
      message: "服务账户 JSON（单行）",
      placeholder: '{"type":"service_account", ... }',
      shouldPrompt: ({ credentialValues }) =>
        credentialValues[USE_ENV_FLAG] !== "1" && credentialValues[AUTH_METHOD_FLAG] === "inline",
      validate: ({ value }) => (String(value ?? "").trim() ? undefined : "必填"),
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        applySetupAccountConfigPatch({
          cfg,
          channelKey: channel,
          accountId,
          patch: { serviceAccount: value },
        }),
    },
  ],
  finalize: async ({ cfg, accountId, prompter }) => {
    const account = resolveGoogleChatAccount({
      cfg,
      accountId,
    });
    const audienceType = await prompter.select({
      message: "Webhook 受众类型",
      options: [
        { value: "app-url", label: "App URL（推荐）" },
        { value: "project-number", label: "项目编号" },
      ],
      initialValue: account.config.audienceType === "project-number" ? "project-number" : "app-url",
    });
    const audience = await prompter.text({
      message: audienceType === "project-number" ? "项目编号" : "App URL",
      placeholder:
        audienceType === "project-number" ? "1234567890" : "https://your.host/googlechat",
      initialValue: account.config.audience || undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });
    return {
      cfg: migrateBaseNameToDefaultAccount({
        cfg: applySetupAccountConfigPatch({
          cfg,
          channelKey: channel,
          accountId,
          patch: {
            audienceType,
            audience: String(audience).trim(),
          },
        }),
        channelKey: channel,
      }),
    };
  },
  dmPolicy: googlechatDmPolicy,
};
