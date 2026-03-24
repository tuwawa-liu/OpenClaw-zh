import {
  createAllowFromSection,
  createPromptParsedAllowFromForAccount,
  createStandardChannelSetupStatus,
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  type ChannelSetupDmPolicy,
  type ChannelSetupWizard,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/setup";
import {
  listBlueBubblesAccountIds,
  resolveBlueBubblesAccount,
  resolveDefaultBlueBubblesAccountId,
} from "./accounts.js";
import { applyBlueBubblesConnectionConfig } from "./config-apply.js";
import { hasConfiguredSecretInput, normalizeSecretInputString } from "./secret-input.js";
import {
  blueBubblesSetupAdapter,
  setBlueBubblesAllowFrom,
  setBlueBubblesDmPolicy,
} from "./setup-core.js";
import { parseBlueBubblesAllowTarget } from "./targets.js";
import { normalizeBlueBubblesServerUrl } from "./types.js";
import { DEFAULT_WEBHOOK_PATH } from "./webhook-shared.js";

const channel = "bluebubbles" as const;
const CONFIGURE_CUSTOM_WEBHOOK_FLAG = "__bluebubblesConfigureCustomWebhookPath";

function parseBlueBubblesAllowFromInput(raw: string): string[] {
  return raw
    .split(/[\n,]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function validateBlueBubblesAllowFromEntry(value: string): string | null {
  try {
    if (value === "*") {
      return value;
    }
    const parsed = parseBlueBubblesAllowTarget(value);
    if (parsed.kind === "handle" && !parsed.handle) {
      return null;
    }
    return value.trim() || null;
  } catch {
    return null;
  }
}

const promptBlueBubblesAllowFrom = createPromptParsedAllowFromForAccount({
  defaultAccountId: (cfg) => resolveDefaultBlueBubblesAccountId(cfg),
  noteTitle: "BlueBubbles allowlist",
  noteLines: [
    "Allowlist BlueBubbles DMs by handle or chat target.",
    "Examples:",
    "- +15555550123",
    "- user@example.com",
    "- chat_id:123",
    "- chat_guid:iMessage;-;+15555550123",
    "Multiple entries: comma- or newline-separated.",
    `Docs: ${formatDocsLink("/channels/bluebubbles", "bluebubbles")}`,
  ],
  message: "BlueBubbles allowFrom (handle or chat_id)",
  placeholder: "+15555550123, user@example.com, chat_id:123",
  parseEntries: (raw) => {
    const entries = parseBlueBubblesAllowFromInput(raw);
    for (const entry of entries) {
      if (!validateBlueBubblesAllowFromEntry(entry)) {
        return { entries: [], error: `Invalid entry: ${entry}` };
      }
    }
    return { entries };
  },
  getExistingAllowFrom: ({ cfg, accountId }) =>
    resolveBlueBubblesAccount({ cfg, accountId }).config.allowFrom ?? [],
  applyAllowFrom: ({ cfg, accountId, allowFrom }) =>
    setBlueBubblesAllowFrom(cfg, accountId, allowFrom),
});

function validateBlueBubblesServerUrlInput(value: unknown): string | undefined {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "必填";
  }
  try {
    const normalized = normalizeBlueBubblesServerUrl(trimmed);
    new URL(normalized);
    return undefined;
  } catch {
    return "无效的 URL 格式";
  }
}

function applyBlueBubblesSetupPatch(
  cfg: OpenClawConfig,
  accountId: string,
  patch: {
    serverUrl?: string;
    password?: unknown;
    webhookPath?: string;
  },
): OpenClawConfig {
  return applyBlueBubblesConnectionConfig({
    cfg,
    accountId,
    patch,
    onlyDefinedFields: true,
    accountEnabled: "preserve-or-true",
  });
}

function resolveBlueBubblesServerUrl(cfg: OpenClawConfig, accountId: string): string | undefined {
  return resolveBlueBubblesAccount({ cfg, accountId }).config.serverUrl?.trim() || undefined;
}

function resolveBlueBubblesWebhookPath(cfg: OpenClawConfig, accountId: string): string | undefined {
  return resolveBlueBubblesAccount({ cfg, accountId }).config.webhookPath?.trim() || undefined;
}

function validateBlueBubblesWebhookPath(value: string): string | undefined {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "必填";
  }
  if (!trimmed.startsWith("/")) {
    return "路径必须以 / 开头";
  }
  return undefined;
}

const dmPolicy: ChannelSetupDmPolicy = {
  label: "BlueBubbles",
  channel,
  policyKey: "channels.bluebubbles.dmPolicy",
  allowFromKey: "channels.bluebubbles.allowFrom",
  getCurrent: (cfg) => cfg.channels?.bluebubbles?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setBlueBubblesDmPolicy(cfg, policy),
  promptAllowFrom: promptBlueBubblesAllowFrom,
};

export const blueBubblesSetupWizard: ChannelSetupWizard = {
  channel,
  stepOrder: "text-first",
  status: {
    ...createStandardChannelSetupStatus({
      channelLabel: "BlueBubbles",
      configuredLabel: "configured",
      unconfiguredLabel: "needs setup",
      configuredHint: "configured",
      unconfiguredHint: "iMessage via BlueBubbles app",
      configuredScore: 1,
      unconfiguredScore: 0,
      includeStatusLine: true,
      resolveConfigured: ({ cfg }) =>
        listBlueBubblesAccountIds(cfg).some((accountId) => {
          const account = resolveBlueBubblesAccount({ cfg, accountId });
          return account.configured;
        }),
    }),
    resolveSelectionHint: ({ configured }) =>
      configured ? "已配置" : "通过 BlueBubbles 应用使用 iMessage",
  },
  prepare: async ({ cfg, accountId, prompter, credentialValues }) => {
    const existingWebhookPath = resolveBlueBubblesWebhookPath(cfg, accountId);
    const wantsCustomWebhook = await prompter.confirm({
      message: `配置自定义 webhook 路径？（默认：${DEFAULT_WEBHOOK_PATH}）`,
      initialValue: Boolean(existingWebhookPath && existingWebhookPath !== DEFAULT_WEBHOOK_PATH),
    });
    return {
      cfg: wantsCustomWebhook
        ? cfg
        : applyBlueBubblesSetupPatch(cfg, accountId, { webhookPath: DEFAULT_WEBHOOK_PATH }),
      credentialValues: {
        ...credentialValues,
        [CONFIGURE_CUSTOM_WEBHOOK_FLAG]: wantsCustomWebhook ? "1" : "0",
      },
    };
  },
  credentials: [
    {
      inputKey: "password",
      providerHint: channel,
      credentialLabel: "服务器密码",
      helpTitle: "BlueBubbles 密码",
      helpLines: ["输入 BlueBubbles 服务器密码。", "在 BlueBubbles Server 应用的设置中查找。"],
      envPrompt: "",
      keepPrompt: "BlueBubbles 密码已设置。保留吗？",
      inputPrompt: "BlueBubbles 密码",
      inspect: ({ cfg, accountId }) => {
        const existingPassword = resolveBlueBubblesAccount({ cfg, accountId }).config.password;
        return {
          accountConfigured: resolveBlueBubblesAccount({ cfg, accountId }).configured,
          hasConfiguredValue: hasConfiguredSecretInput(existingPassword),
          resolvedValue: normalizeSecretInputString(existingPassword) ?? undefined,
        };
      },
      applySet: async ({ cfg, accountId, value }) =>
        applyBlueBubblesSetupPatch(cfg, accountId, {
          password: value,
        }),
    },
  ],
  textInputs: [
    {
      inputKey: "httpUrl",
      message: "BlueBubbles 服务器 URL",
      placeholder: "http://192.168.1.100:1234",
      helpTitle: "BlueBubbles 服务器 URL",
      helpLines: [
        "输入 BlueBubbles 服务器 URL（例如 http://192.168.1.100:1234）。",
        "在 BlueBubbles Server 应用的连接设置中查找。",
        `Docs: ${formatDocsLink("/channels/bluebubbles", "bluebubbles")}`,
      ],
      currentValue: ({ cfg, accountId }) => resolveBlueBubblesServerUrl(cfg, accountId),
      validate: ({ value }) => validateBlueBubblesServerUrlInput(value),
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        applyBlueBubblesSetupPatch(cfg, accountId, {
          serverUrl: value,
        }),
    },
    {
      inputKey: "webhookPath",
      message: "Webhook 路径",
      placeholder: DEFAULT_WEBHOOK_PATH,
      currentValue: ({ cfg, accountId }) => {
        const value = resolveBlueBubblesWebhookPath(cfg, accountId);
        return value && value !== DEFAULT_WEBHOOK_PATH ? value : undefined;
      },
      shouldPrompt: ({ credentialValues }) =>
        credentialValues[CONFIGURE_CUSTOM_WEBHOOK_FLAG] === "1",
      validate: ({ value }) => validateBlueBubblesWebhookPath(value),
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        applyBlueBubblesSetupPatch(cfg, accountId, {
          webhookPath: value,
        }),
    },
  ],
  completionNote: {
    title: "BlueBubbles 后续步骤",
    lines: [
      "在 BlueBubbles Server 中配置 webhook URL：",
      "1. 打开 BlueBubbles Server → 设置 → Webhooks",
      "2. 添加你的 OpenClaw 网关地址 + webhook 路径",
      `   示例：https://your-gateway-host:3000${DEFAULT_WEBHOOK_PATH}`,
      "3. 启用 webhook 并保存",
      "",
      `Docs: ${formatDocsLink("/channels/bluebubbles", "bluebubbles")}`,
    ],
  },
  dmPolicy,
  allowFrom: createAllowFromSection({
    helpTitle: "BlueBubbles allowlist",
    helpLines: [
      "通过句柄或聊天目标将 BlueBubbles 私信加入白名单。",
      "示例：",
      "- +15555550123",
      "- user@example.com",
      "- chat_id:123",
      "- chat_guid:iMessage;-;+15555550123",
      "多个条目：用逗号或换行分隔。",
      `Docs: ${formatDocsLink("/channels/bluebubbles", "bluebubbles")}`,
    ],
    message: "BlueBubbles allowFrom（句柄或 chat_id）",
    placeholder: "+15555550123, user@example.com, chat_id:123",
    invalidWithoutCredentialNote:
      "使用 BlueBubbles 句柄或聊天目标，如 +15555550123 或 chat_id:123。",
    parseInputs: parseBlueBubblesAllowFromInput,
    parseId: (raw) => validateBlueBubblesAllowFromEntry(raw),
    apply: async ({ cfg, accountId, allowFrom }) =>
      setBlueBubblesAllowFrom(cfg, accountId, allowFrom),
  }),
  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      bluebubbles: {
        ...cfg.channels?.bluebubbles,
        enabled: false,
      },
    },
  }),
};

export { blueBubblesSetupAdapter };
