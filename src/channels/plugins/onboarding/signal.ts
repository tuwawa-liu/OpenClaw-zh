import { formatCliCommand } from "../../../cli/command-format.js";
import { detectBinary } from "../../../commands/onboard-helpers.js";
import { installSignalCli } from "../../../commands/signal-install.js";
import type { OpenClawConfig } from "../../../config/config.js";
import {
  listSignalAccountIds,
  resolveDefaultSignalAccountId,
  resolveSignalAccount,
} from "../../../signal/accounts.js";
import { formatDocsLink } from "../../../terminal/links.js";
import { normalizeE164 } from "../../../utils.js";
import type { WizardPrompter } from "../../../wizard/prompts.js";
import type { ChannelOnboardingAdapter, ChannelOnboardingDmPolicy } from "../onboarding-types.js";
import * as onboardingHelpers from "./helpers.js";

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
  return onboardingHelpers.parseOnboardingEntriesAllowingWildcard(raw, (entry) => {
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
      return { error: `无效条目：${entry}` };
    }
    return { value: normalized };
  });
}

async function promptSignalAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<OpenClawConfig> {
  return onboardingHelpers.promptParsedAllowFromForScopedChannel({
    cfg: params.cfg,
    channel: "signal",
    accountId: params.accountId,
    defaultAccountId: resolveDefaultSignalAccountId(params.cfg),
    prompter: params.prompter,
    noteTitle: "Signal 白名单",
    noteLines: [
      "通过发送者 ID 将 Signal 私信加入白名单。",
      "示例：",
      "- +15555550123",
      "- uuid:123e4567-e89b-12d3-a456-426614174000",
      "多个条目：逗号分隔。",
      `文档：${formatDocsLink("/signal", "signal")}`,
    ],
    message: "Signal allowFrom（E.164 或 uuid）",
    placeholder: "+15555550123, uuid:123e4567-e89b-12d3-a456-426614174000",
    parseEntries: parseSignalAllowFromEntries,
    getExistingAllowFrom: ({ cfg, accountId }) => {
      const resolved = resolveSignalAccount({ cfg, accountId });
      return resolved.config.allowFrom ?? [];
    },
  });
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Signal",
  channel,
  policyKey: "channels.signal.dmPolicy",
  allowFromKey: "channels.signal.allowFrom",
  getCurrent: (cfg) => cfg.channels?.signal?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) =>
    onboardingHelpers.setChannelDmPolicyWithAllowFrom({
      cfg,
      channel: "signal",
      dmPolicy: policy,
    }),
  promptAllowFrom: promptSignalAllowFrom,
};

export const signalOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = listSignalAccountIds(cfg).some(
      (accountId) => resolveSignalAccount({ cfg, accountId }).configured,
    );
    const signalCliPath = cfg.channels?.signal?.cliPath ?? "signal-cli";
    const signalCliDetected = await detectBinary(signalCliPath);
    return {
      channel,
      configured,
      statusLines: [
        `Signal: ${configured ? "已配置" : "需要设置"}`,
        `signal-cli: ${signalCliDetected ? "已找到" : "缺失"} (${signalCliPath})`,
      ],
      selectionHint: signalCliDetected ? "已找到 signal-cli" : "缺失 signal-cli",
      quickstartScore: signalCliDetected ? 1 : 0,
    };
  },
  configure: async ({
    cfg,
    runtime,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    options,
  }) => {
    const defaultSignalAccountId = resolveDefaultSignalAccountId(cfg);
    const signalAccountId = await onboardingHelpers.resolveAccountIdForConfigure({
      cfg,
      prompter,
      label: "Signal",
      accountOverride: accountOverrides.signal,
      shouldPromptAccountIds,
      listAccountIds: listSignalAccountIds,
      defaultAccountId: defaultSignalAccountId,
    });

    let next = cfg;
    const resolvedAccount = resolveSignalAccount({
      cfg: next,
      accountId: signalAccountId,
    });
    const accountConfig = resolvedAccount.config;
    let resolvedCliPath = accountConfig.cliPath ?? "signal-cli";
    let cliDetected = await detectBinary(resolvedCliPath);
    if (options?.allowSignalInstall) {
      const wantsInstall = await prompter.confirm({
        message: cliDetected
          ? "检测到 signal-cli。现在重新安装/更新？"
          : "未找到 signal-cli。现在安装？",
        initialValue: !cliDetected,
      });
      if (wantsInstall) {
        try {
          const result = await installSignalCli(runtime);
          if (result.ok && result.cliPath) {
            cliDetected = true;
            resolvedCliPath = result.cliPath;
            await prompter.note(`已安装 signal-cli 到 ${result.cliPath}`, "Signal");
          } else if (!result.ok) {
            await prompter.note(result.error ?? "signal-cli 安装失败。", "Signal");
          }
        } catch (err) {
          await prompter.note(`signal-cli 安装失败：${String(err)}`, "Signal");
        }
      }
    }

    if (!cliDetected) {
      await prompter.note(
        "未找到 signal-cli。请安装后重新运行此步骤，或设置 channels.signal.cliPath。",
        "Signal",
      );
    }

    let account = accountConfig.account ?? "";
    if (account) {
      const normalizedExisting = normalizeSignalAccountInput(account);
      if (!normalizedExisting) {
        await prompter.note(
          "现有 Signal 账号不是有效的 E.164 号码。请重新输入。",
          "Signal",
        );
        account = "";
      } else {
        account = normalizedExisting;
        const keep = await prompter.confirm({
          message: `Signal 账号已设置 (${account})。保留它？`,
          initialValue: true,
        });
        if (!keep) {
          account = "";
        }
      }
    }

    if (!account) {
      const rawAccount = String(
        await prompter.text({
          message: "Signal 机器人号码（E.164）",
          validate: (value) =>
            normalizeSignalAccountInput(String(value ?? ""))
              ? undefined
              : INVALID_SIGNAL_ACCOUNT_ERROR,
        }),
      );
      account = normalizeSignalAccountInput(rawAccount) ?? "";
    }

    if (account) {
      next = onboardingHelpers.patchChannelConfigForAccount({
        cfg: next,
        channel: "signal",
        accountId: signalAccountId,
        patch: {
          account,
          cliPath: resolvedCliPath ?? "signal-cli",
        },
      });
    }

    await prompter.note(
      [
        '关联设备：signal-cli link -n "OpenClaw"',
        "在 Signal → 已关联设备中扫描二维码",
        `然后运行：${formatCliCommand("openclaw gateway call channels.status --params '{\"probe\":true}'")}`,
        `文档：${formatDocsLink("/signal", "signal")}`,
      ].join("\n"),
      "Signal 后续步骤",
    );

    return { cfg: next, accountId: signalAccountId };
  },
  dmPolicy,
  disable: (cfg) => onboardingHelpers.setOnboardingChannelEnabled(cfg, channel, false),
};
