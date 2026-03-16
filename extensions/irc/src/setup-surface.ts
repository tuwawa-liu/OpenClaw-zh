import type { ChannelOnboardingDmPolicy } from "../../../src/channels/plugins/onboarding-types.js";
import {
  resolveOnboardingAccountId,
  setOnboardingChannelEnabled,
  setTopLevelChannelAllowFrom,
  setTopLevelChannelDmPolicyWithAllowFrom,
} from "../../../src/channels/plugins/onboarding/helpers.js";
import {
  applyAccountNameToChannelSection,
  patchScopedAccountConfig,
} from "../../../src/channels/plugins/setup-helpers.js";
import type { ChannelSetupWizard } from "../../../src/channels/plugins/setup-wizard.js";
import type { ChannelSetupAdapter } from "../../../src/channels/plugins/types.adapters.js";
import type { ChannelSetupInput } from "../../../src/channels/plugins/types.core.js";
import type { DmPolicy } from "../../../src/config/types.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../../src/routing/session-key.js";
import { formatDocsLink } from "../../../src/terminal/links.js";
import type { WizardPrompter } from "../../../src/wizard/prompts.js";
import { listIrcAccountIds, resolveDefaultIrcAccountId, resolveIrcAccount } from "./accounts.js";
import {
  isChannelTarget,
  normalizeIrcAllowEntry,
  normalizeIrcMessagingTarget,
} from "./normalize.js";
import type { CoreConfig, IrcAccountConfig, IrcNickServConfig } from "./types.js";

const channel = "irc" as const;
const USE_ENV_FLAG = "__ircUseEnv";
const TLS_FLAG = "__ircTls";

type IrcSetupInput = ChannelSetupInput & {
  host?: string;
  port?: number | string;
  tls?: boolean;
  nick?: string;
  username?: string;
  realname?: string;
  channels?: string[];
  password?: string;
};

function parseListInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePort(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function normalizeGroupEntry(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === "*") {
    return "*";
  }
  const normalized = normalizeIrcMessagingTarget(trimmed) ?? trimmed;
  if (isChannelTarget(normalized)) {
    return normalized;
  }
  return `#${normalized.replace(/^#+/, "")}`;
}

function updateIrcAccountConfig(
  cfg: CoreConfig,
  accountId: string,
  patch: Partial<IrcAccountConfig>,
): CoreConfig {
  return patchScopedAccountConfig({
    cfg,
    channelKey: channel,
    accountId,
    patch,
    ensureChannelEnabled: false,
    ensureAccountEnabled: false,
  }) as CoreConfig;
}

function setIrcDmPolicy(cfg: CoreConfig, dmPolicy: DmPolicy): CoreConfig {
  return setTopLevelChannelDmPolicyWithAllowFrom({
    cfg,
    channel,
    dmPolicy,
  }) as CoreConfig;
}

function setIrcAllowFrom(cfg: CoreConfig, allowFrom: string[]): CoreConfig {
  return setTopLevelChannelAllowFrom({
    cfg,
    channel,
    allowFrom,
  }) as CoreConfig;
}

function setIrcNickServ(
  cfg: CoreConfig,
  accountId: string,
  nickserv?: IrcNickServConfig,
): CoreConfig {
  return updateIrcAccountConfig(cfg, accountId, { nickserv });
}

function setIrcGroupAccess(
  cfg: CoreConfig,
  accountId: string,
  policy: "open" | "allowlist" | "disabled",
  entries: string[],
): CoreConfig {
  if (policy !== "allowlist") {
    return updateIrcAccountConfig(cfg, accountId, { enabled: true, groupPolicy: policy });
  }
  const normalizedEntries = [
    ...new Set(entries.map((entry) => normalizeGroupEntry(entry)).filter(Boolean)),
  ];
  const groups = Object.fromEntries(normalizedEntries.map((entry) => [entry, {}]));
  return updateIrcAccountConfig(cfg, accountId, {
    enabled: true,
    groupPolicy: "allowlist",
    groups,
  });
}

async function promptIrcAllowFrom(params: {
  cfg: CoreConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<CoreConfig> {
  const existing = params.cfg.channels?.irc?.allowFrom ?? [];

  await params.prompter.note(
    [
      "通过发送者将 IRC 私信加入白名单。",
      "示例：",
      "- alice",
      "- alice!ident@example.org",
      "多个条目：用逗号分隔。",
    ].join("\n"),
    "IRC 白名单",
  );

  const raw = await params.prompter.text({
    message: "IRC allowFrom（昵称或 昵称!用户@主机）",
    placeholder: "alice, bob!ident@example.org",
    initialValue: existing[0] ? String(existing[0]) : undefined,
    validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
  });

  const parsed = parseListInput(String(raw));
  const normalized = [
    ...new Set(
      parsed
        .map((entry) => normalizeIrcAllowEntry(entry))
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
  return setIrcAllowFrom(params.cfg, normalized);
}

async function promptIrcNickServConfig(params: {
  cfg: CoreConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<CoreConfig> {
  const resolved = resolveIrcAccount({ cfg: params.cfg, accountId: params.accountId });
  const existing = resolved.config.nickserv;
  const hasExisting = Boolean(existing?.password || existing?.passwordFile);
  const wants = await params.prompter.confirm({
    message: hasExisting ? "更新 NickServ 设置？" : "配置 NickServ 身份验证/注册？",
    initialValue: hasExisting,
  });
  if (!wants) {
    return params.cfg;
  }

  const service = String(
    await params.prompter.text({
      message: "NickServ 服务昵称",
      initialValue: existing?.service || "NickServ",
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    }),
  ).trim();

  const useEnvPassword =
    params.accountId === DEFAULT_ACCOUNT_ID &&
    Boolean(process.env.IRC_NICKSERV_PASSWORD?.trim()) &&
    !(existing?.password || existing?.passwordFile)
      ? await params.prompter.confirm({
          message: "检测到 IRC_NICKSERV_PASSWORD。使用环境变量？",
          initialValue: true,
        })
      : false;

  const password = useEnvPassword
    ? undefined
    : String(
        await params.prompter.text({
          message: "NickServ 密码（留空以禁用 NickServ 认证）",
          validate: () => undefined,
        }),
      ).trim();

  if (!password && !useEnvPassword) {
    return setIrcNickServ(params.cfg, params.accountId, {
      enabled: false,
      service,
    });
  }

  const register = await params.prompter.confirm({
    message: "连接时发送 NickServ REGISTER？",
    initialValue: existing?.register ?? false,
  });
  const registerEmail = register
    ? String(
        await params.prompter.text({
          message: "NickServ 注册邮箱",
          initialValue:
            existing?.registerEmail ||
            (params.accountId === DEFAULT_ACCOUNT_ID
              ? process.env.IRC_NICKSERV_REGISTER_EMAIL
              : undefined),
          validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
        }),
      ).trim()
    : undefined;

  return setIrcNickServ(params.cfg, params.accountId, {
    enabled: true,
    service,
    ...(password ? { password } : {}),
    register,
    ...(registerEmail ? { registerEmail } : {}),
  });
}

const ircDmPolicy: ChannelOnboardingDmPolicy = {
  label: "IRC",
  channel,
  policyKey: "channels.irc.dmPolicy",
  allowFromKey: "channels.irc.allowFrom",
  getCurrent: (cfg) => (cfg as CoreConfig).channels?.irc?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setIrcDmPolicy(cfg as CoreConfig, policy),
  promptAllowFrom: async ({ cfg, prompter, accountId }) =>
    await promptIrcAllowFrom({
      cfg: cfg as CoreConfig,
      prompter,
      accountId: resolveOnboardingAccountId({
        accountId,
        defaultAccountId: resolveDefaultIrcAccountId(cfg as CoreConfig),
      }),
    }),
};

export const ircSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
  applyAccountName: ({ cfg, accountId, name }) =>
    applyAccountNameToChannelSection({
      cfg,
      channelKey: channel,
      accountId,
      name,
    }),
  validateInput: ({ input }) => {
    const setupInput = input as IrcSetupInput;
    if (!setupInput.host?.trim()) {
      return "IRC 需要主机。";
    }
    if (!setupInput.nick?.trim()) {
      return "IRC 需要昵称。";
    }
    return null;
  },
  applyAccountConfig: ({ cfg, accountId, input }) => {
    const setupInput = input as IrcSetupInput;
    const namedConfig = applyAccountNameToChannelSection({
      cfg,
      channelKey: channel,
      accountId,
      name: setupInput.name,
    });
    const portInput =
      typeof setupInput.port === "number" ? String(setupInput.port) : String(setupInput.port ?? "");
    const patch: Partial<IrcAccountConfig> = {
      enabled: true,
      host: setupInput.host?.trim(),
      port: portInput ? parsePort(portInput, setupInput.tls === false ? 6667 : 6697) : undefined,
      tls: setupInput.tls,
      nick: setupInput.nick?.trim(),
      username: setupInput.username?.trim(),
      realname: setupInput.realname?.trim(),
      password: setupInput.password?.trim(),
      channels: setupInput.channels,
    };
    return patchScopedAccountConfig({
      cfg: namedConfig,
      channelKey: channel,
      accountId,
      patch,
    }) as CoreConfig;
  },
};

export const ircSetupWizard: ChannelSetupWizard = {
  channel,
  status: {
    configuredLabel: "已配置",
    unconfiguredLabel: "需要主机 + 昵称",
    configuredHint: "已配置",
    unconfiguredHint: "需要主机 + 昵称",
    configuredScore: 1,
    unconfiguredScore: 0,
    resolveConfigured: ({ cfg }) =>
      listIrcAccountIds(cfg as CoreConfig).some(
        (accountId) => resolveIrcAccount({ cfg: cfg as CoreConfig, accountId }).configured,
      ),
    resolveStatusLines: ({ configured }) => [`IRC：${configured ? "已配置" : "需要主机 + 昵称"}`],
  },
  introNote: {
    title: "IRC 设置",
    lines: [
      "IRC 需要服务器主机 + 机器人昵称。",
      "推荐：在端口 6697 上使用 TLS。",
      "可选：NickServ 身份验证/注册可在基本账户字段后配置。",
      '设置 channels.irc.groupPolicy="allowlist" 和 channels.irc.groups 以更严格地控制频道。',
      '注意：IRC 频道默认需要被提及才回复。如需允许未提及的回复，请设置 channels.irc.groups["#channel"].requireMention=false（或 "*" 对全部生效）。',
      "支持的环境变量：IRC_HOST, IRC_PORT, IRC_TLS, IRC_NICK, IRC_USERNAME, IRC_REALNAME, IRC_PASSWORD, IRC_CHANNELS, IRC_NICKSERV_PASSWORD, IRC_NICKSERV_REGISTER_EMAIL。",
      `Docs: ${formatDocsLink("/channels/irc", "channels/irc")}`,
    ],
    shouldShow: ({ cfg, accountId }) =>
      !resolveIrcAccount({ cfg: cfg as CoreConfig, accountId }).configured,
  },
  prepare: async ({ cfg, accountId, credentialValues, prompter }) => {
    const resolved = resolveIrcAccount({ cfg: cfg as CoreConfig, accountId });
    const isDefaultAccount = accountId === DEFAULT_ACCOUNT_ID;
    const envHost = isDefaultAccount ? process.env.IRC_HOST?.trim() : "";
    const envNick = isDefaultAccount ? process.env.IRC_NICK?.trim() : "";
    const envReady = Boolean(envHost && envNick && !resolved.config.host && !resolved.config.nick);

    if (envReady) {
      const useEnv = await prompter.confirm({
        message: "检测到 IRC_HOST 和 IRC_NICK。使用环境变量？",
        initialValue: true,
      });
      if (useEnv) {
        return {
          cfg: updateIrcAccountConfig(cfg as CoreConfig, accountId, { enabled: true }),
          credentialValues: {
            ...credentialValues,
            [USE_ENV_FLAG]: "1",
          },
        };
      }
    }

    const tls = await prompter.confirm({
      message: "IRC 使用 TLS？",
      initialValue: resolved.config.tls ?? true,
    });
    return {
      cfg: updateIrcAccountConfig(cfg as CoreConfig, accountId, {
        enabled: true,
        tls,
      }),
      credentialValues: {
        ...credentialValues,
        [USE_ENV_FLAG]: "0",
        [TLS_FLAG]: tls ? "1" : "0",
      },
    };
  },
  credentials: [],
  textInputs: [
    {
      inputKey: "httpHost",
      message: "IRC 服务器主机",
      currentValue: ({ cfg, accountId }) =>
        resolveIrcAccount({ cfg: cfg as CoreConfig, accountId }).config.host || undefined,
      shouldPrompt: ({ credentialValues }) => credentialValues[USE_ENV_FLAG] !== "1",
      validate: ({ value }) => (String(value ?? "").trim() ? undefined : "必填"),
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        updateIrcAccountConfig(cfg as CoreConfig, accountId, {
          enabled: true,
          host: value,
        }),
    },
    {
      inputKey: "httpPort",
      message: "IRC 服务器端口",
      currentValue: ({ cfg, accountId }) =>
        String(resolveIrcAccount({ cfg: cfg as CoreConfig, accountId }).config.port ?? ""),
      shouldPrompt: ({ credentialValues }) => credentialValues[USE_ENV_FLAG] !== "1",
      initialValue: ({ cfg, accountId, credentialValues }) => {
        const resolved = resolveIrcAccount({ cfg: cfg as CoreConfig, accountId });
        const tls = credentialValues[TLS_FLAG] === "0" ? false : true;
        const defaultPort = resolved.config.port ?? (tls ? 6697 : 6667);
        return String(defaultPort);
      },
      validate: ({ value }) => {
        const parsed = Number.parseInt(String(value ?? "").trim(), 10);
        return Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535
          ? undefined
          : "请使用 1 到 65535 之间的端口";
      },
      normalizeValue: ({ value }) => String(parsePort(String(value), 6697)),
      applySet: async ({ cfg, accountId, value }) =>
        updateIrcAccountConfig(cfg as CoreConfig, accountId, {
          enabled: true,
          port: parsePort(String(value), 6697),
        }),
    },
    {
      inputKey: "token",
      message: "IRC 昵称",
      currentValue: ({ cfg, accountId }) =>
        resolveIrcAccount({ cfg: cfg as CoreConfig, accountId }).config.nick || undefined,
      shouldPrompt: ({ credentialValues }) => credentialValues[USE_ENV_FLAG] !== "1",
      validate: ({ value }) => (String(value ?? "").trim() ? undefined : "必填"),
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        updateIrcAccountConfig(cfg as CoreConfig, accountId, {
          enabled: true,
          nick: value,
        }),
    },
    {
      inputKey: "userId",
      message: "IRC 用户名",
      currentValue: ({ cfg, accountId }) =>
        resolveIrcAccount({ cfg: cfg as CoreConfig, accountId }).config.username || undefined,
      shouldPrompt: ({ credentialValues }) => credentialValues[USE_ENV_FLAG] !== "1",
      initialValue: ({ cfg, accountId, credentialValues }) =>
        resolveIrcAccount({ cfg: cfg as CoreConfig, accountId }).config.username ||
        credentialValues.token ||
        "openclaw",
      validate: ({ value }) => (String(value ?? "").trim() ? undefined : "必填"),
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        updateIrcAccountConfig(cfg as CoreConfig, accountId, {
          enabled: true,
          username: value,
        }),
    },
    {
      inputKey: "deviceName",
      message: "IRC real name",
      currentValue: ({ cfg, accountId }) =>
        resolveIrcAccount({ cfg: cfg as CoreConfig, accountId }).config.realname || undefined,
      shouldPrompt: ({ credentialValues }) => credentialValues[USE_ENV_FLAG] !== "1",
      initialValue: ({ cfg, accountId }) =>
        resolveIrcAccount({ cfg: cfg as CoreConfig, accountId }).config.realname || "OpenClaw",
      validate: ({ value }) => (String(value ?? "").trim() ? undefined : "必填"),
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        updateIrcAccountConfig(cfg as CoreConfig, accountId, {
          enabled: true,
          realname: value,
        }),
    },
    {
      inputKey: "groupChannels",
      message: "Auto-join IRC channels (optional, comma-separated)",
      placeholder: "#openclaw, #ops",
      required: false,
      applyEmptyValue: true,
      currentValue: ({ cfg, accountId }) =>
        resolveIrcAccount({ cfg: cfg as CoreConfig, accountId }).config.channels?.join(", "),
      shouldPrompt: ({ credentialValues }) => credentialValues[USE_ENV_FLAG] !== "1",
      normalizeValue: ({ value }) =>
        parseListInput(String(value))
          .map((entry) => normalizeGroupEntry(entry))
          .filter((entry): entry is string => Boolean(entry && entry !== "*"))
          .filter((entry) => isChannelTarget(entry))
          .join(", "),
      applySet: async ({ cfg, accountId, value }) => {
        const channels = parseListInput(String(value))
          .map((entry) => normalizeGroupEntry(entry))
          .filter((entry): entry is string => Boolean(entry && entry !== "*"))
          .filter((entry) => isChannelTarget(entry));
        return updateIrcAccountConfig(cfg as CoreConfig, accountId, {
          enabled: true,
          channels: channels.length > 0 ? channels : undefined,
        });
      },
    },
  ],
  groupAccess: {
    label: "IRC 频道",
    placeholder: "#openclaw, #ops, *",
    currentPolicy: ({ cfg, accountId }) =>
      resolveIrcAccount({ cfg: cfg as CoreConfig, accountId }).config.groupPolicy ?? "allowlist",
    currentEntries: ({ cfg, accountId }) =>
      Object.keys(resolveIrcAccount({ cfg: cfg as CoreConfig, accountId }).config.groups ?? {}),
    updatePrompt: ({ cfg, accountId }) =>
      Boolean(resolveIrcAccount({ cfg: cfg as CoreConfig, accountId }).config.groups),
    setPolicy: ({ cfg, accountId, policy }) =>
      setIrcGroupAccess(cfg as CoreConfig, accountId, policy, []),
    resolveAllowlist: async ({ entries }) =>
      [...new Set(entries.map((entry) => normalizeGroupEntry(entry)).filter(Boolean))] as string[],
    applyAllowlist: ({ cfg, accountId, resolved }) =>
      setIrcGroupAccess(cfg as CoreConfig, accountId, "allowlist", resolved as string[]),
  },
  allowFrom: {
    helpTitle: "IRC 白名单",
    helpLines: [
      "通过发送者将 IRC 私信加入白名单。",
      "示例：",
      "- alice",
      "- alice!ident@example.org",
      "多个条目：用逗号分隔。",
    ],
    message: "IRC allowFrom（昵称或 昵称!用户@主机）",
    placeholder: "alice, bob!ident@example.org",
    invalidWithoutCredentialNote: "使用 IRC 昵称或 昵称!用户@主机 条目。",
    parseId: (raw) => {
      const normalized = normalizeIrcAllowEntry(raw);
      return normalized || null;
    },
    resolveEntries: async ({ entries }) =>
      entries.map((entry) => {
        const normalized = normalizeIrcAllowEntry(entry);
        return {
          input: entry,
          resolved: Boolean(normalized),
          id: normalized || null,
        };
      }),
    apply: async ({ cfg, allowFrom }) => setIrcAllowFrom(cfg as CoreConfig, allowFrom),
  },
  finalize: async ({ cfg, accountId, prompter }) => {
    let next = cfg as CoreConfig;

    const resolvedAfterGroups = resolveIrcAccount({ cfg: next, accountId });
    if (resolvedAfterGroups.config.groupPolicy === "allowlist") {
      const groupKeys = Object.keys(resolvedAfterGroups.config.groups ?? {});
      if (groupKeys.length > 0) {
        const wantsMentions = await prompter.confirm({
          message: "在 IRC 频道中需要 @提及才回复？",
          initialValue: true,
        });
        if (!wantsMentions) {
          const groups = resolvedAfterGroups.config.groups ?? {};
          const patched = Object.fromEntries(
            Object.entries(groups).map(([key, value]) => [
              key,
              { ...value, requireMention: false },
            ]),
          );
          next = updateIrcAccountConfig(next, accountId, { groups: patched });
        }
      }
    }

    next = await promptIrcNickServConfig({
      cfg: next,
      prompter,
      accountId,
    });
    return { cfg: next };
  },
  completionNote: {
    title: "IRC 后续步骤",
    lines: [
      "下一步：重启网关并验证状态。",
      "命令：openclaw channels status --probe",
      `Docs: ${formatDocsLink("/channels/irc", "channels/irc")}`,
    ],
  },
  dmPolicy: ircDmPolicy,
  disable: (cfg) => setOnboardingChannelEnabled(cfg, channel, false),
};
