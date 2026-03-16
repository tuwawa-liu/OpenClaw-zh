import type { ChannelOnboardingDmPolicy } from "../../../src/channels/plugins/onboarding-types.js";
import {
  parseOnboardingEntriesAllowingWildcard,
  promptParsedAllowFromForScopedChannel,
  setChannelDmPolicyWithAllowFrom,
  setOnboardingChannelEnabled,
} from "../../../src/channels/plugins/onboarding/helpers.js";
import {
  applyAccountNameToChannelSection,
  migrateBaseNameToDefaultAccount,
} from "../../../src/channels/plugins/setup-helpers.js";
import { type ChannelSetupWizard } from "../../../src/channels/plugins/setup-wizard.js";
import type { ChannelSetupAdapter } from "../../../src/channels/plugins/types.adapters.js";
import { detectBinary } from "../../../src/commands/onboard-helpers.js";
import type { OpenClawConfig } from "../../../src/config/config.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../../src/routing/session-key.js";
import { formatDocsLink } from "../../../src/terminal/links.js";
import type { WizardPrompter } from "../../../src/wizard/prompts.js";
import {
  listIMessageAccountIds,
  resolveDefaultIMessageAccountId,
  resolveIMessageAccount,
} from "./accounts.js";
import { normalizeIMessageHandle } from "./targets.js";

const channel = "imessage" as const;

export function parseIMessageAllowFromEntries(raw: string): { entries: string[]; error?: string } {
  return parseOnboardingEntriesAllowingWildcard(raw, (entry) => {
    const lower = entry.toLowerCase();
    if (lower.startsWith("chat_id:")) {
      const id = entry.slice("chat_id:".length).trim();
      if (!/^\d+$/.test(id)) {
        return { error: `Invalid chat_id: ${entry}` };
      }
      return { value: entry };
    }
    if (lower.startsWith("chat_guid:")) {
      if (!entry.slice("chat_guid:".length).trim()) {
        return { error: "无效的 chat_guid 条目" };
      }
      return { value: entry };
    }
    if (lower.startsWith("chat_identifier:")) {
      if (!entry.slice("chat_identifier:".length).trim()) {
        return { error: "无效的 chat_identifier 条目" };
      }
      return { value: entry };
    }
    if (!normalizeIMessageHandle(entry)) {
      return { error: `无效的句柄：${entry}` };
    }
    return { value: entry };
  });
}

function buildIMessageSetupPatch(input: {
  cliPath?: string;
  dbPath?: string;
  service?: "imessage" | "sms" | "auto";
  region?: string;
}) {
  return {
    ...(input.cliPath ? { cliPath: input.cliPath } : {}),
    ...(input.dbPath ? { dbPath: input.dbPath } : {}),
    ...(input.service ? { service: input.service } : {}),
    ...(input.region ? { region: input.region } : {}),
  };
}

async function promptIMessageAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<OpenClawConfig> {
  return promptParsedAllowFromForScopedChannel({
    cfg: params.cfg,
    channel,
    accountId: params.accountId,
    defaultAccountId: resolveDefaultIMessageAccountId(params.cfg),
    prompter: params.prompter,
    noteTitle: "iMessage 白名单",
    noteLines: [
      "通过句柄或聊天目标将 iMessage 私信加入白名单。",
      "示例：",
      "- +15555550123",
      "- user@example.com",
      "- chat_id:123",
      "- chat_guid:... 或 chat_identifier:...",
      "多个条目：用逗号分隔。",
      `Docs: ${formatDocsLink("/imessage", "imessage")}`,
    ],
    message: "iMessage allowFrom（句柄或 chat_id）",
    placeholder: "+15555550123, user@example.com, chat_id:123",
    parseEntries: parseIMessageAllowFromEntries,
    getExistingAllowFrom: ({ cfg, accountId }) =>
      resolveIMessageAccount({ cfg, accountId }).config.allowFrom ?? [],
  });
}

const imessageDmPolicy: ChannelOnboardingDmPolicy = {
  label: "iMessage",
  channel,
  policyKey: "channels.imessage.dmPolicy",
  allowFromKey: "channels.imessage.allowFrom",
  getCurrent: (cfg) => cfg.channels?.imessage?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) =>
    setChannelDmPolicyWithAllowFrom({
      cfg,
      channel,
      dmPolicy: policy,
    }),
  promptAllowFrom: promptIMessageAllowFrom,
};

export const imessageSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
  applyAccountName: ({ cfg, accountId, name }) =>
    applyAccountNameToChannelSection({
      cfg,
      channelKey: channel,
      accountId,
      name,
    }),
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
          imessage: {
            ...next.channels?.imessage,
            enabled: true,
            ...buildIMessageSetupPatch(input),
          },
        },
      };
    }
    return {
      ...next,
      channels: {
        ...next.channels,
        imessage: {
          ...next.channels?.imessage,
          enabled: true,
          accounts: {
            ...next.channels?.imessage?.accounts,
            [accountId]: {
              ...next.channels?.imessage?.accounts?.[accountId],
              enabled: true,
              ...buildIMessageSetupPatch(input),
            },
          },
        },
      },
    };
  },
};

export const imessageSetupWizard: ChannelSetupWizard = {
  channel,
  status: {
    configuredLabel: "已配置",
    unconfiguredLabel: "需要设置",
    configuredHint: "imsg 已找到",
    unconfiguredHint: "imsg 未找到",
    configuredScore: 1,
    unconfiguredScore: 0,
    resolveConfigured: ({ cfg }) =>
      listIMessageAccountIds(cfg).some((accountId) => {
        const account = resolveIMessageAccount({ cfg, accountId });
        return Boolean(
          account.config.cliPath ||
          account.config.dbPath ||
          account.config.allowFrom ||
          account.config.service ||
          account.config.region,
        );
      }),
    resolveStatusLines: async ({ cfg, configured }) => {
      const cliPath = cfg.channels?.imessage?.cliPath ?? "imsg";
      const cliDetected = await detectBinary(cliPath);
      return [
        `iMessage：${configured ? "已配置" : "需要设置"}`,
        `imsg：${cliDetected ? "已找到" : "未找到"} (${cliPath})`,
      ];
    },
    resolveSelectionHint: async ({ cfg }) => {
      const cliPath = cfg.channels?.imessage?.cliPath ?? "imsg";
      return (await detectBinary(cliPath)) ? "imsg 已找到" : "imsg 未找到";
    },
    resolveQuickstartScore: async ({ cfg }) => {
      const cliPath = cfg.channels?.imessage?.cliPath ?? "imsg";
      return (await detectBinary(cliPath)) ? 1 : 0;
    },
  },
  credentials: [],
  textInputs: [
    {
      inputKey: "cliPath",
      message: "imsg CLI 路径",
      initialValue: ({ cfg, accountId }) =>
        resolveIMessageAccount({ cfg, accountId }).config.cliPath ?? "imsg",
      currentValue: ({ cfg, accountId }) =>
        resolveIMessageAccount({ cfg, accountId }).config.cliPath ?? "imsg",
      shouldPrompt: async ({ currentValue }) => !(await detectBinary(currentValue ?? "imsg")),
      confirmCurrentValue: false,
      applyCurrentValue: true,
      helpTitle: "iMessage",
      helpLines: ["启用 iMessage 需要 imsg CLI 路径。"],
    },
  ],
  completionNote: {
    title: "iMessage 后续步骤",
    lines: [
      "此功能仍在开发中。",
      "确保 OpenClaw 对消息数据库有完全磁盘访问权限。",
      "提示时授予消息应用的自动化权限。",
      "列出聊天：imsg chats --limit 20",
      `Docs: ${formatDocsLink("/imessage", "imessage")}`,
    ],
  },
  dmPolicy: imessageDmPolicy,
  disable: (cfg) => setOnboardingChannelEnabled(cfg, channel, false),
};
