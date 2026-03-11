import path from "node:path";
import { loginWeb } from "../../../channel-web.js";
import { formatCliCommand } from "../../../cli/command-format.js";
import type { OpenClawConfig } from "../../../config/config.js";
import { mergeWhatsAppConfig } from "../../../config/merge-config.js";
import type { DmPolicy } from "../../../config/types.js";
import { DEFAULT_ACCOUNT_ID } from "../../../routing/session-key.js";
import type { RuntimeEnv } from "../../../runtime.js";
import { t } from "../../../i18n/index.js";
import { formatDocsLink } from "../../../terminal/links.js";
import { normalizeE164, pathExists } from "../../../utils.js";
import {
  listWhatsAppAccountIds,
  resolveDefaultWhatsAppAccountId,
  resolveWhatsAppAuthDir,
} from "../../../web/accounts.js";
import type { WizardPrompter } from "../../../wizard/prompts.js";
import type { ChannelOnboardingAdapter } from "../onboarding-types.js";
import {
  normalizeAllowFromEntries,
  resolveAccountIdForConfigure,
  resolveOnboardingAccountId,
  splitOnboardingEntries,
} from "./helpers.js";

const channel = "whatsapp" as const;

function setWhatsAppDmPolicy(cfg: OpenClawConfig, dmPolicy: DmPolicy): OpenClawConfig {
  return mergeWhatsAppConfig(cfg, { dmPolicy });
}

function setWhatsAppAllowFrom(cfg: OpenClawConfig, allowFrom?: string[]): OpenClawConfig {
  return mergeWhatsAppConfig(cfg, { allowFrom }, { unsetOnUndefined: ["allowFrom"] });
}

function setWhatsAppSelfChatMode(cfg: OpenClawConfig, selfChatMode: boolean): OpenClawConfig {
  return mergeWhatsAppConfig(cfg, { selfChatMode });
}

async function detectWhatsAppLinked(cfg: OpenClawConfig, accountId: string): Promise<boolean> {
  const { authDir } = resolveWhatsAppAuthDir({ cfg, accountId });
  const credsPath = path.join(authDir, "creds.json");
  return await pathExists(credsPath);
}

async function promptWhatsAppOwnerAllowFrom(params: {
  prompter: WizardPrompter;
  existingAllowFrom: string[];
}): Promise<{ normalized: string; allowFrom: string[] }> {
  const { prompter, existingAllowFrom } = params;

  await prompter.note(
    "我们需要发送者/所有者号码，以便 OpenClaw 将您加入白名单。",
    "WhatsApp 号码",
  );
  const entry = await prompter.text({
    message: "您的个人 WhatsApp 号码（您将用来发送消息的手机）",
    placeholder: "+15555550123",
    initialValue: existingAllowFrom[0],
    validate: (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) {
        return "必填";
      }
      const normalized = normalizeE164(raw);
      if (!normalized) {
        return `无效号码：${raw}`;
      }
      return undefined;
    },
  });

  const normalized = normalizeE164(String(entry).trim());
  if (!normalized) {
    throw new Error("无效的 WhatsApp 所有者号码（验证后应为 E.164 格式）。");
  }
  const allowFrom = normalizeAllowFromEntries(
    [...existingAllowFrom.filter((item) => item !== "*"), normalized],
    normalizeE164,
  );
  return { normalized, allowFrom };
}

async function applyWhatsAppOwnerAllowlist(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  existingAllowFrom: string[];
  title: string;
  messageLines: string[];
}): Promise<OpenClawConfig> {
  const { normalized, allowFrom } = await promptWhatsAppOwnerAllowFrom({
    prompter: params.prompter,
    existingAllowFrom: params.existingAllowFrom,
  });
  let next = setWhatsAppSelfChatMode(params.cfg, true);
  next = setWhatsAppDmPolicy(next, "allowlist");
  next = setWhatsAppAllowFrom(next, allowFrom);
  await params.prompter.note(
    [...params.messageLines, `- allowFrom includes ${normalized}`].join("\n"),
    params.title,
  );
  return next;
}

function parseWhatsAppAllowFromEntries(raw: string): { entries: string[]; invalidEntry?: string } {
  const parts = splitOnboardingEntries(raw);
  if (parts.length === 0) {
    return { entries: [] };
  }
  const entries: string[] = [];
  for (const part of parts) {
    if (part === "*") {
      entries.push("*");
      continue;
    }
    const normalized = normalizeE164(part);
    if (!normalized) {
      return { entries: [], invalidEntry: part };
    }
    entries.push(normalized);
  }
  return { entries: normalizeAllowFromEntries(entries, normalizeE164) };
}

async function promptWhatsAppAllowFrom(
  cfg: OpenClawConfig,
  _runtime: RuntimeEnv,
  prompter: WizardPrompter,
  options?: { forceAllowlist?: boolean },
): Promise<OpenClawConfig> {
  const existingPolicy = cfg.channels?.whatsapp?.dmPolicy ?? "pairing";
  const existingAllowFrom = cfg.channels?.whatsapp?.allowFrom ?? [];
  const existingLabel = existingAllowFrom.length > 0 ? existingAllowFrom.join(", ") : "unset";

  if (options?.forceAllowlist) {
    return await applyWhatsAppOwnerAllowlist({
      cfg,
      prompter,
      existingAllowFrom,
      title: "WhatsApp 白名单",
      messageLines: ["白名单模式已启用。"],
    });
  }

  await prompter.note(
    [
      "WhatsApp 私聊受 `channels.whatsapp.dmPolicy` + `channels.whatsapp.allowFrom` 控制。",
      "- pairing（默认）：未知发送者获得配对码；所有者审批",
      "- allowlist：未知发送者被阻止",
      '- open：公开的入站私信（需要 allowFrom 包含 "*"）',
      "- disabled：忽略 WhatsApp 私信",
      "",
      `当前：dmPolicy=${existingPolicy}, allowFrom=${existingLabel}`,
      `Docs: ${formatDocsLink("/whatsapp", "whatsapp")}`,
    ].join("\n"),
    "WhatsApp 私信访问",
  );

  const phoneMode = await prompter.select({
    message: "WhatsApp 手机设置",
    options: [
      { value: "personal", label: "这是我的个人手机号码" },
      { value: "separate", label: "专门用于 OpenClaw 的独立手机" },
    ],
  });

  if (phoneMode === "personal") {
    return await applyWhatsAppOwnerAllowlist({
      cfg,
      prompter,
      existingAllowFrom,
      title: "WhatsApp 个人手机",
      messageLines: [
        "个人手机模式已启用。",
        "- dmPolicy 设置为白名单（跳过配对）",
      ],
    });
  }

  const policy = (await prompter.select({
    message: "WhatsApp 私信策略",
    options: [
      { value: "pairing", label: "配对（推荐）" },
      { value: "allowlist", label: "仅限白名单（阻止未知发送者）" },
      { value: "open", label: "开放（公开入站私信）" },
      { value: "disabled", label: "禁用（忽略 WhatsApp 私信）" },
    ],
  })) as DmPolicy;

  let next = setWhatsAppSelfChatMode(cfg, false);
  next = setWhatsAppDmPolicy(next, policy);
  if (policy === "open") {
    const allowFrom = normalizeAllowFromEntries(["*", ...existingAllowFrom], normalizeE164);
    next = setWhatsAppAllowFrom(next, allowFrom.length > 0 ? allowFrom : ["*"]);
    return next;
  }
  if (policy === "disabled") {
    return next;
  }

  const allowOptions =
    existingAllowFrom.length > 0
      ? ([
          { value: "keep", label: "保留当前 allowFrom" },
          {
            value: "unset",
            label: "取消 allowFrom（仅使用配对审批）",
          },
          { value: "list", label: "将 allowFrom 设置为特定号码" },
        ] as const)
      : ([
          { value: "unset", label: "取消 allowFrom（默认）" },
          { value: "list", label: "将 allowFrom 设置为特定号码" },
        ] as const);

  const mode = await prompter.select({
    message: "WhatsApp allowFrom（可选预白名单）",
    options: allowOptions.map((opt) => ({
      value: opt.value,
      label: opt.label,
    })),
  });

  if (mode === "keep") {
    // Keep allowFrom as-is.
  } else if (mode === "unset") {
    next = setWhatsAppAllowFrom(next, undefined);
  } else {
    const allowRaw = await prompter.text({
      message: "允许的发送者号码（逗号分隔，E.164 格式）",
      placeholder: "+15555550123, +447700900123",
      validate: (value) => {
        const raw = String(value ?? "").trim();
        if (!raw) {
          return "必填";
        }
        const parsed = parseWhatsAppAllowFromEntries(raw);
        if (parsed.entries.length === 0 && !parsed.invalidEntry) {
          return "必填";
        }
        if (parsed.invalidEntry) {
          return `无效号码：${parsed.invalidEntry}`;
        }
        return undefined;
      },
    });

    const parsed = parseWhatsAppAllowFromEntries(String(allowRaw));
    next = setWhatsAppAllowFrom(next, parsed.entries);
  }

  return next;
}

export const whatsappOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg, accountOverrides }) => {
    const defaultAccountId = resolveDefaultWhatsAppAccountId(cfg);
    const accountId = resolveOnboardingAccountId({
      accountId: accountOverrides.whatsapp,
      defaultAccountId,
    });
    const linked = await detectWhatsAppLinked(cfg, accountId);
    const accountLabel = accountId === DEFAULT_ACCOUNT_ID ? "default" : accountId;
    return {
      channel,
      configured: linked,
      statusLines: [`WhatsApp (${accountLabel}): ${linked ? "已关联" : "未关联"}`],
      selectionHint: linked ? "已关联" : "未关联",
      quickstartScore: linked ? 5 : 4,
    };
  },
  configure: async ({
    cfg,
    runtime,
    prompter,
    options,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    const accountId = await resolveAccountIdForConfigure({
      cfg,
      prompter,
      label: "WhatsApp",
      accountOverride: accountOverrides.whatsapp,
      shouldPromptAccountIds: Boolean(shouldPromptAccountIds || options?.promptWhatsAppAccountId),
      listAccountIds: listWhatsAppAccountIds,
      defaultAccountId: resolveDefaultWhatsAppAccountId(cfg),
    });

    let next = cfg;
    if (accountId !== DEFAULT_ACCOUNT_ID) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          whatsapp: {
            ...next.channels?.whatsapp,
            accounts: {
              ...next.channels?.whatsapp?.accounts,
              [accountId]: {
                ...next.channels?.whatsapp?.accounts?.[accountId],
                enabled: next.channels?.whatsapp?.accounts?.[accountId]?.enabled ?? true,
              },
            },
          },
        },
      };
    }

    const linked = await detectWhatsAppLinked(next, accountId);
    const { authDir } = resolveWhatsAppAuthDir({
      cfg: next,
      accountId,
    });

    if (!linked) {
      await prompter.note(
        [
          "用手机上的 WhatsApp 扫描二维码。",
          `凭据存储在 ${authDir}/ 下，供后续运行使用。`,
          `文档：${formatDocsLink("/whatsapp", "whatsapp")}`,
        ].join("\n"),
        "WhatsApp 关联",
      );
    }
    const wantsLink = await prompter.confirm({
      message: linked ? "WhatsApp 已关联。现在重新关联？" : "现在关联 WhatsApp（二维码）？",
      initialValue: !linked,
    });
    if (wantsLink) {
      try {
        await loginWeb(false, undefined, runtime, accountId);
      } catch (err) {
        runtime.error(t("whatsappOnboarding.loginFailed", { error: String(err) }));
        await prompter.note(`文档：${formatDocsLink("/whatsapp", "whatsapp")}`, "WhatsApp 帮助");
      }
    } else if (!linked) {
      await prompter.note(
        `稍后运行 \`${formatCliCommand("openclaw channels login")}\` 来关联 WhatsApp。`,
        "WhatsApp",
      );
    }

    next = await promptWhatsAppAllowFrom(next, runtime, prompter, {
      forceAllowlist: forceAllowFrom,
    });

    return { cfg: next, accountId };
  },
  onAccountRecorded: (accountId, options) => {
    options?.onWhatsAppAccountId?.(accountId);
  },
};
