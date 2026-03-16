import path from "node:path";
import { loginWeb } from "../../../src/channel-web.js";
import {
  normalizeAllowFromEntries,
  splitOnboardingEntries,
} from "../../../src/channels/plugins/onboarding/helpers.js";
import { setOnboardingChannelEnabled } from "../../../src/channels/plugins/onboarding/helpers.js";
import type { ChannelSetupWizard } from "../../../src/channels/plugins/setup-wizard.js";
import { formatCliCommand } from "../../../src/cli/command-format.js";
import type { OpenClawConfig } from "../../../src/config/config.js";
import { mergeWhatsAppConfig } from "../../../src/config/merge-config.js";
import type { DmPolicy } from "../../../src/config/types.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../../src/routing/session-key.js";
import { formatDocsLink } from "../../../src/terminal/links.js";
import { normalizeE164, pathExists } from "../../../src/utils.js";
import { listWhatsAppAccountIds, resolveWhatsAppAuthDir } from "./accounts.js";
import { whatsappSetupAdapter } from "./setup-core.js";

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
  existingAllowFrom: string[];
  prompter: Parameters<NonNullable<ChannelSetupWizard["finalize"]>>[0]["prompter"];
}): Promise<{ normalized: string; allowFrom: string[] }> {
  const { prompter, existingAllowFrom } = params;

  await prompter.note(
    "我们需要发送者/所有者号码，以便 OpenClaw 可以将你加入白名单。",
    "WhatsApp 号码",
  );
  const entry = await prompter.text({
    message: "你的个人 WhatsApp 号码（你用来发消息的手机）",
    placeholder: "+15555550123",
    initialValue: existingAllowFrom[0],
    validate: (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) {
        return "必填";
      }
      const normalized = normalizeE164(raw);
      if (!normalized) {
        return `无效号码: ${raw}`;
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
  existingAllowFrom: string[];
  messageLines: string[];
  prompter: Parameters<NonNullable<ChannelSetupWizard["finalize"]>>[0]["prompter"];
  title: string;
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

async function promptWhatsAppDmAccess(params: {
  cfg: OpenClawConfig;
  forceAllowFrom: boolean;
  prompter: Parameters<NonNullable<ChannelSetupWizard["finalize"]>>[0]["prompter"];
}): Promise<OpenClawConfig> {
  const existingPolicy = params.cfg.channels?.whatsapp?.dmPolicy ?? "pairing";
  const existingAllowFrom = params.cfg.channels?.whatsapp?.allowFrom ?? [];
  const existingLabel = existingAllowFrom.length > 0 ? existingAllowFrom.join(", ") : "unset";

  if (params.forceAllowFrom) {
    return await applyWhatsAppOwnerAllowlist({
      cfg: params.cfg,
      prompter: params.prompter,
      existingAllowFrom,
      title: "WhatsApp 白名单",
      messageLines: ["白名单模式已启用。"],
    });
  }

  await params.prompter.note(
    [
      "WhatsApp 私聊受 `channels.whatsapp.dmPolicy` + `channels.whatsapp.allowFrom` 控制。",
      "- pairing（默认）：未知发送者获得配对码；所有者审批",
      "- allowlist：未知发送者被屏蔽",
      '- open：公开接收私信（需要 allowFrom 包含 "*"）',
      "- disabled：忽略 WhatsApp 私信",
      "",
      `当前：dmPolicy=${existingPolicy}, allowFrom=${existingLabel}`,
      `Docs: ${formatDocsLink("/whatsapp", "whatsapp")}`,
    ].join("\n"),
    "WhatsApp 私信访问",
  );

  const phoneMode = await params.prompter.select({
    message: "WhatsApp 手机设置",
    options: [
      { value: "personal", label: "这是我的个人手机号码" },
      { value: "separate", label: "OpenClaw 专用的独立手机" },
    ],
  });

  if (phoneMode === "personal") {
    return await applyWhatsAppOwnerAllowlist({
      cfg: params.cfg,
      prompter: params.prompter,
      existingAllowFrom,
      title: "WhatsApp 个人手机",
      messageLines: ["个人手机模式已启用。", "- dmPolicy 设为 allowlist（跳过配对）"],
    });
  }

  const policy = (await params.prompter.select({
    message: "WhatsApp 私信策略",
    options: [
      { value: "pairing", label: "配对（推荐）" },
      { value: "allowlist", label: "仅白名单（屏蔽未知发送者）" },
      { value: "open", label: "开放（公开接收私信）" },
      { value: "disabled", label: "禁用（忽略 WhatsApp 私信）" },
    ],
  })) as DmPolicy;

  let next = setWhatsAppSelfChatMode(params.cfg, false);
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
            label: "取消设置 allowFrom（仅使用配对审批）",
          },
          { value: "list", label: "设置 allowFrom 为指定号码" },
        ] as const)
      : ([
          { value: "unset", label: "取消设置 allowFrom（默认）" },
          { value: "list", label: "设置 allowFrom 为指定号码" },
        ] as const);

  const mode = await params.prompter.select({
    message: "WhatsApp allowFrom（可选预白名单）",
    options: allowOptions.map((opt) => ({
      value: opt.value,
      label: opt.label,
    })),
  });

  if (mode === "keep") {
    return next;
  }
  if (mode === "unset") {
    return setWhatsAppAllowFrom(next, undefined);
  }

  const allowRaw = await params.prompter.text({
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
        return `无效号码: ${parsed.invalidEntry}`;
      }
      return undefined;
    },
  });

  const parsed = parseWhatsAppAllowFromEntries(String(allowRaw));
  return setWhatsAppAllowFrom(next, parsed.entries);
}

export const whatsappSetupWizard: ChannelSetupWizard = {
  channel,
  status: {
    configuredLabel: "已链接",
    unconfiguredLabel: "未链接",
    configuredHint: "已链接",
    unconfiguredHint: "未链接",
    configuredScore: 5,
    unconfiguredScore: 4,
    resolveConfigured: async ({ cfg }) => {
      for (const accountId of listWhatsAppAccountIds(cfg)) {
        if (await detectWhatsAppLinked(cfg, accountId)) {
          return true;
        }
      }
      return false;
    },
    resolveStatusLines: async ({ cfg, configured }) => {
      const linkedAccountId = (
        await Promise.all(
          listWhatsAppAccountIds(cfg).map(async (accountId) => ({
            accountId,
            linked: await detectWhatsAppLinked(cfg, accountId),
          })),
        )
      ).find((entry) => entry.linked)?.accountId;
      const label = linkedAccountId
        ? `WhatsApp (${linkedAccountId === DEFAULT_ACCOUNT_ID ? "default" : linkedAccountId})`
        : "WhatsApp";
      return [`${label}：${configured ? "已链接" : "未链接"}`];
    },
  },
  resolveShouldPromptAccountIds: ({ options, shouldPromptAccountIds }) =>
    Boolean(shouldPromptAccountIds || options?.promptWhatsAppAccountId),
  credentials: [],
  finalize: async ({ cfg, accountId, forceAllowFrom, prompter, runtime }) => {
    let next =
      accountId === DEFAULT_ACCOUNT_ID
        ? cfg
        : whatsappSetupAdapter.applyAccountConfig({
            cfg,
            accountId,
            input: {},
          });

    const linked = await detectWhatsAppLinked(next, accountId);
    const { authDir } = resolveWhatsAppAuthDir({
      cfg: next,
      accountId,
    });

    if (!linked) {
      await prompter.note(
        [
          "用手机上的 WhatsApp 扫描二维码。",
          `凭据存储在 ${authDir}/ 下，以便下次运行使用。`,
          `Docs: ${formatDocsLink("/whatsapp", "whatsapp")}`,
        ].join("\n"),
        "WhatsApp 链接",
      );
    }

    const wantsLink = await prompter.confirm({
      message: linked ? "WhatsApp 已链接。重新链接？" : "现在链接 WhatsApp（二维码）？",
      initialValue: !linked,
    });
    if (wantsLink) {
      try {
        await loginWeb(false, undefined, runtime, accountId);
      } catch (error) {
        runtime.error(`WhatsApp login failed: ${String(error)}`);
        await prompter.note(`Docs: ${formatDocsLink("/whatsapp", "whatsapp")}`, "WhatsApp 帮助");
      }
    } else if (!linked) {
      await prompter.note(
        `稍后运行 \`${formatCliCommand("openclaw channels login")}\` 来链接 WhatsApp。`,
        "WhatsApp",
      );
    }

    next = await promptWhatsAppDmAccess({
      cfg: next,
      forceAllowFrom,
      prompter,
    });
    return { cfg: next };
  },
  disable: (cfg) => setOnboardingChannelEnabled(cfg, channel, false),
  onAccountRecorded: (accountId, options) => {
    options?.onWhatsAppAccountId?.(accountId);
  },
};
