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
import { formatCliCommand } from "../../../src/cli/command-format.js";
import { detectBinary } from "../../../src/commands/onboard-helpers.js";
import { installSignalCli } from "../../../src/commands/signal-install.js";
import type { OpenClawConfig } from "../../../src/config/config.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../../src/routing/session-key.js";
import { formatDocsLink } from "../../../src/terminal/links.js";
import { normalizeE164 } from "../../../src/utils.js";
import type { WizardPrompter } from "../../../src/wizard/prompts.js";
import {
  listSignalAccountIds,
  resolveDefaultSignalAccountId,
  resolveSignalAccount,
} from "./accounts.js";

const channel = "signal" as const;
const MIN_E164_DIGITS = 5;
const MAX_E164_DIGITS = 15;
const DIGITS_ONLY = /^\d+$/;
const INVALID_SIGNAL_ACCOUNT_ERROR =
  "无效的 E.164 电话号码（必须以 + 和国家代码开头，例如 +15555550123）";

export function normalizeSignalAccountInput(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = normalizeE164(trimmed);
  const digits = normalized.slice(1);
  if (!DIGITS_ONLY.test(digits)) {
    return null;
  }
  if (digits.length < MIN_E164_DIGITS || digits.length > MAX_E164_DIGITS) {
    return null;
  }
  return `+${digits}`;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function parseSignalAllowFromEntries(raw: string): { entries: string[]; error?: string } {
  return parseOnboardingEntriesAllowingWildcard(raw, (entry) => {
    if (entry.toLowerCase().startsWith("uuid:")) {
      const id = entry.slice("uuid:".length).trim();
      if (!id) {
        return { error: "无效的 uuid 条目" };
      }
      return { value: `uuid:${id}` };
    }
    if (isUuidLike(entry)) {
      return { value: `uuid:${entry}` };
    }
    const normalized = normalizeSignalAccountInput(entry);
    if (!normalized) {
      return { error: `无效的条目：${entry}` };
    }
    return { value: normalized };
  });
}

function buildSignalSetupPatch(input: {
  signalNumber?: string;
  cliPath?: string;
  httpUrl?: string;
  httpHost?: string;
  httpPort?: string;
}) {
  return {
    ...(input.signalNumber ? { account: input.signalNumber } : {}),
    ...(input.cliPath ? { cliPath: input.cliPath } : {}),
    ...(input.httpUrl ? { httpUrl: input.httpUrl } : {}),
    ...(input.httpHost ? { httpHost: input.httpHost } : {}),
    ...(input.httpPort ? { httpPort: Number(input.httpPort) } : {}),
  };
}

async function promptSignalAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<OpenClawConfig> {
  return promptParsedAllowFromForScopedChannel({
    cfg: params.cfg,
    channel,
    accountId: params.accountId,
    defaultAccountId: resolveDefaultSignalAccountId(params.cfg),
    prompter: params.prompter,
    noteTitle: "Signal 白名单",
    noteLines: [
      "通过发送者 ID 将 Signal 私信加入白名单。",
      "示例：",
      "- +15555550123",
      "- uuid:123e4567-e89b-12d3-a456-426614174000",
      "多个条目：用逗号分隔。",
      `Docs: ${formatDocsLink("/signal", "signal")}`,
    ],
    message: "Signal allowFrom（E.164 或 uuid）",
    placeholder: "+15555550123, uuid:123e4567-e89b-12d3-a456-426614174000",
    parseEntries: parseSignalAllowFromEntries,
    getExistingAllowFrom: ({ cfg, accountId }) =>
      resolveSignalAccount({ cfg, accountId }).config.allowFrom ?? [],
  });
}

const signalDmPolicy: ChannelOnboardingDmPolicy = {
  label: "Signal",
  channel,
  policyKey: "channels.signal.dmPolicy",
  allowFromKey: "channels.signal.allowFrom",
  getCurrent: (cfg) => cfg.channels?.signal?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) =>
    setChannelDmPolicyWithAllowFrom({
      cfg,
      channel,
      dmPolicy: policy,
    }),
  promptAllowFrom: promptSignalAllowFrom,
};

export const signalSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
  applyAccountName: ({ cfg, accountId, name }) =>
    applyAccountNameToChannelSection({
      cfg,
      channelKey: channel,
      accountId,
      name,
    }),
  validateInput: ({ input }) => {
    if (
      !input.signalNumber &&
      !input.httpUrl &&
      !input.httpHost &&
      !input.httpPort &&
      !input.cliPath
    ) {
      return "Signal 需要 --signal-number 或 --http-url/--http-host/--http-port/--cli-path。";
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
          signal: {
            ...next.channels?.signal,
            enabled: true,
            ...buildSignalSetupPatch(input),
          },
        },
      };
    }
    return {
      ...next,
      channels: {
        ...next.channels,
        signal: {
          ...next.channels?.signal,
          enabled: true,
          accounts: {
            ...next.channels?.signal?.accounts,
            [accountId]: {
              ...next.channels?.signal?.accounts?.[accountId],
              enabled: true,
              ...buildSignalSetupPatch(input),
            },
          },
        },
      },
    };
  },
};

export const signalSetupWizard: ChannelSetupWizard = {
  channel,
  status: {
    configuredLabel: "已配置",
    unconfiguredLabel: "需要设置",
    configuredHint: "signal-cli 已找到",
    unconfiguredHint: "signal-cli 未找到",
    configuredScore: 1,
    unconfiguredScore: 0,
    resolveConfigured: ({ cfg }) =>
      listSignalAccountIds(cfg).some(
        (accountId) => resolveSignalAccount({ cfg, accountId }).configured,
      ),
    resolveStatusLines: async ({ cfg, configured }) => {
      const signalCliPath = cfg.channels?.signal?.cliPath ?? "signal-cli";
      const signalCliDetected = await detectBinary(signalCliPath);
      return [
        `Signal：${configured ? "已配置" : "需要设置"}`,
        `signal-cli：${signalCliDetected ? "已找到" : "未找到"} (${signalCliPath})`,
      ];
    },
    resolveSelectionHint: async ({ cfg }) => {
      const signalCliPath = cfg.channels?.signal?.cliPath ?? "signal-cli";
      return (await detectBinary(signalCliPath)) ? "signal-cli 已找到" : "signal-cli 未找到";
    },
    resolveQuickstartScore: async ({ cfg }) => {
      const signalCliPath = cfg.channels?.signal?.cliPath ?? "signal-cli";
      return (await detectBinary(signalCliPath)) ? 1 : 0;
    },
  },
  prepare: async ({ cfg, accountId, credentialValues, runtime, prompter, options }) => {
    if (!options?.allowSignalInstall) {
      return;
    }
    const currentCliPath =
      (typeof credentialValues.cliPath === "string" ? credentialValues.cliPath : undefined) ??
      resolveSignalAccount({ cfg, accountId }).config.cliPath ??
      "signal-cli";
    const cliDetected = await detectBinary(currentCliPath);
    const wantsInstall = await prompter.confirm({
      message: cliDetected
        ? "signal-cli 已检测到。重新安装/更新？"
        : "signal-cli 未找到。立即安装？",
      initialValue: !cliDetected,
    });
    if (!wantsInstall) {
      return;
    }
    try {
      const result = await installSignalCli(runtime);
      if (result.ok && result.cliPath) {
        await prompter.note(`已安装 signal-cli 到 ${result.cliPath}`, "Signal");
        return {
          credentialValues: {
            cliPath: result.cliPath,
          },
        };
      }
      if (!result.ok) {
        await prompter.note(result.error ?? "signal-cli 安装失败。", "Signal");
      }
    } catch (error) {
      await prompter.note(`signal-cli 安装失败：${String(error)}`, "Signal");
    }
  },
  credentials: [],
  textInputs: [
    {
      inputKey: "cliPath",
      message: "signal-cli 路径",
      currentValue: ({ cfg, accountId, credentialValues }) =>
        (typeof credentialValues.cliPath === "string" ? credentialValues.cliPath : undefined) ??
        resolveSignalAccount({ cfg, accountId }).config.cliPath ??
        "signal-cli",
      initialValue: ({ cfg, accountId, credentialValues }) =>
        (typeof credentialValues.cliPath === "string" ? credentialValues.cliPath : undefined) ??
        resolveSignalAccount({ cfg, accountId }).config.cliPath ??
        "signal-cli",
      shouldPrompt: async ({ currentValue }) => !(await detectBinary(currentValue ?? "signal-cli")),
      confirmCurrentValue: false,
      applyCurrentValue: true,
      helpTitle: "Signal",
      helpLines: [
        "signal-cli 未找到。请安装它，然后重新运行此步骤或设置 channels.signal.cliPath。",
      ],
    },
    {
      inputKey: "signalNumber",
      message: "Signal 机器人号码 (E.164)",
      currentValue: ({ cfg, accountId }) =>
        normalizeSignalAccountInput(resolveSignalAccount({ cfg, accountId }).config.account) ??
        undefined,
      keepPrompt: (value) => `Signal 账户已设置 (${value})。保留吗？`,
      validate: ({ value }) =>
        normalizeSignalAccountInput(value) ? undefined : INVALID_SIGNAL_ACCOUNT_ERROR,
      normalizeValue: ({ value }) => normalizeSignalAccountInput(value) ?? value,
    },
  ],
  completionNote: {
    title: "Signal 后续步骤",
    lines: [
      '链接设备：signal-cli link -n "OpenClaw"',
      "在 Signal -> 已链接设备中扫描二维码",
      `然后运行：${formatCliCommand("openclaw gateway call channels.status --params '{\"probe\":true}'")}`,
      `Docs: ${formatDocsLink("/signal", "signal")}`,
    ],
  },
  dmPolicy: signalDmPolicy,
  disable: (cfg) => setOnboardingChannelEnabled(cfg, channel, false),
};
