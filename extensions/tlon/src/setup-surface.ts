import {
  applyAccountNameToChannelSection,
  patchScopedAccountConfig,
} from "../../../src/channels/plugins/setup-helpers.js";
import type { ChannelSetupWizard } from "../../../src/channels/plugins/setup-wizard.js";
import type { ChannelSetupAdapter } from "../../../src/channels/plugins/types.adapters.js";
import type { ChannelSetupInput } from "../../../src/channels/plugins/types.core.js";
import type { OpenClawConfig } from "../../../src/config/config.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../../src/routing/session-key.js";
import { formatDocsLink } from "../../../src/terminal/links.js";
import { buildTlonAccountFields } from "./account-fields.js";
import { normalizeShip } from "./targets.js";
import { listTlonAccountIds, resolveTlonAccount, type TlonResolvedAccount } from "./types.js";
import { isBlockedUrbitHostname, validateUrbitBaseUrl } from "./urbit/base-url.js";

const channel = "tlon" as const;

type TlonSetupInput = ChannelSetupInput & {
  ship?: string;
  url?: string;
  code?: string;
  allowPrivateNetwork?: boolean;
  groupChannels?: string[];
  dmAllowlist?: string[];
  autoDiscoverChannels?: boolean;
  ownerShip?: string;
};

function isConfigured(account: TlonResolvedAccount): boolean {
  return Boolean(account.ship && account.url && account.code);
}

function parseList(value: string): string[] {
  return value
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function applyTlonSetupConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  input: TlonSetupInput;
}): OpenClawConfig {
  const { cfg, accountId, input } = params;
  const useDefault = accountId === DEFAULT_ACCOUNT_ID;
  const namedConfig = applyAccountNameToChannelSection({
    cfg,
    channelKey: channel,
    accountId,
    name: input.name,
  });
  const base = namedConfig.channels?.tlon ?? {};
  const payload = buildTlonAccountFields(input);

  if (useDefault) {
    return {
      ...namedConfig,
      channels: {
        ...namedConfig.channels,
        tlon: {
          ...base,
          enabled: true,
          ...payload,
        },
      },
    };
  }

  return patchScopedAccountConfig({
    cfg: namedConfig,
    channelKey: channel,
    accountId,
    patch: { enabled: base.enabled ?? true },
    accountPatch: {
      enabled: true,
      ...payload,
    },
    ensureChannelEnabled: false,
    ensureAccountEnabled: false,
  });
}

export const tlonSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
  applyAccountName: ({ cfg, accountId, name }) =>
    applyAccountNameToChannelSection({
      cfg,
      channelKey: channel,
      accountId,
      name,
    }),
  validateInput: ({ cfg, accountId, input }) => {
    const setupInput = input as TlonSetupInput;
    const resolved = resolveTlonAccount(cfg, accountId ?? undefined);
    const ship = setupInput.ship?.trim() || resolved.ship;
    const url = setupInput.url?.trim() || resolved.url;
    const code = setupInput.code?.trim() || resolved.code;
    if (!ship) {
      return "Tlon 需要 --ship。";
    }
    if (!url) {
      return "Tlon 需要 --url。";
    }
    if (!code) {
      return "Tlon 需要 --code。";
    }
    return null;
  },
  applyAccountConfig: ({ cfg, accountId, input }) =>
    applyTlonSetupConfig({
      cfg,
      accountId,
      input: input as TlonSetupInput,
    }),
};

export const tlonSetupWizard: ChannelSetupWizard = {
  channel,
  status: {
    configuredLabel: "已配置",
    unconfiguredLabel: "需要设置",
    configuredHint: "已配置",
    unconfiguredHint: "Urbit 即时通讯",
    configuredScore: 1,
    unconfiguredScore: 4,
    resolveConfigured: ({ cfg }) => {
      const accountIds = listTlonAccountIds(cfg);
      return accountIds.length > 0
        ? accountIds.some((accountId) => isConfigured(resolveTlonAccount(cfg, accountId)))
        : isConfigured(resolveTlonAccount(cfg, DEFAULT_ACCOUNT_ID));
    },
    resolveStatusLines: ({ cfg }) => {
      const accountIds = listTlonAccountIds(cfg);
      const configured =
        accountIds.length > 0
          ? accountIds.some((accountId) => isConfigured(resolveTlonAccount(cfg, accountId)))
          : isConfigured(resolveTlonAccount(cfg, DEFAULT_ACCOUNT_ID));
      return [`Tlon：${configured ? "已配置" : "需要设置"}`];
    },
  },
  introNote: {
    title: "Tlon 设置",
    lines: [
      "你需要你的 Urbit ship URL 和登录码。",
      "示例 URL：https://your-ship-host",
      "示例 ship：~sampel-palnet",
      "如果你的 ship URL 在私有网络（LAN/localhost）上，你必须在设置期间明确允许。",
      `Docs: ${formatDocsLink("/channels/tlon", "channels/tlon")}`,
    ],
  },
  credentials: [],
  textInputs: [
    {
      inputKey: "ship",
      message: "Ship 名称",
      placeholder: "~sampel-palnet",
      currentValue: ({ cfg, accountId }) => resolveTlonAccount(cfg, accountId).ship ?? undefined,
      validate: ({ value }) => (String(value ?? "").trim() ? undefined : "必填"),
      normalizeValue: ({ value }) => normalizeShip(String(value).trim()),
      applySet: async ({ cfg, accountId, value }) =>
        applyTlonSetupConfig({
          cfg,
          accountId,
          input: { ship: value },
        }),
    },
    {
      inputKey: "url",
      message: "Ship URL",
      placeholder: "https://your-ship-host",
      currentValue: ({ cfg, accountId }) => resolveTlonAccount(cfg, accountId).url ?? undefined,
      validate: ({ value }) => {
        const next = validateUrbitBaseUrl(String(value ?? ""));
        if (!next.ok) {
          return next.error;
        }
        return undefined;
      },
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        applyTlonSetupConfig({
          cfg,
          accountId,
          input: { url: value },
        }),
    },
    {
      inputKey: "code",
      message: "登录码",
      placeholder: "lidlut-tabwed-pillex-ridrup",
      currentValue: ({ cfg, accountId }) => resolveTlonAccount(cfg, accountId).code ?? undefined,
      validate: ({ value }) => (String(value ?? "").trim() ? undefined : "必填"),
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        applyTlonSetupConfig({
          cfg,
          accountId,
          input: { code: value },
        }),
    },
  ],
  finalize: async ({ cfg, accountId, prompter }) => {
    let next = cfg;
    const resolved = resolveTlonAccount(next, accountId);
    const validatedUrl = validateUrbitBaseUrl(resolved.url ?? "");
    if (!validatedUrl.ok) {
      throw new Error(`Invalid URL: ${validatedUrl.error}`);
    }

    let allowPrivateNetwork = resolved.allowPrivateNetwork ?? false;
    if (isBlockedUrbitHostname(validatedUrl.hostname)) {
      allowPrivateNetwork = await prompter.confirm({
        message: "Ship URL 看起来是私有/内部主机。允许私有网络访问？（SSRF 风险）",
        initialValue: allowPrivateNetwork,
      });
      if (!allowPrivateNetwork) {
        throw new Error("拒绝未经明确批准的私有/内部 Ship URL");
      }
    }
    next = applyTlonSetupConfig({
      cfg: next,
      accountId,
      input: { allowPrivateNetwork },
    });

    const currentGroups = resolved.groupChannels;
    const wantsGroupChannels = await prompter.confirm({
      message: "手动添加群组频道？（可选）",
      initialValue: currentGroups.length > 0,
    });
    if (wantsGroupChannels) {
      const entry = await prompter.text({
        message: "群组频道（逗号分隔）",
        placeholder: "chat/~host-ship/general, chat/~host-ship/support",
        initialValue: currentGroups.join(", ") || undefined,
      });
      next = applyTlonSetupConfig({
        cfg: next,
        accountId,
        input: { groupChannels: parseList(String(entry ?? "")) },
      });
    }

    const currentAllowlist = resolved.dmAllowlist;
    const wantsAllowlist = await prompter.confirm({
      message: "使用白名单限制私信？",
      initialValue: currentAllowlist.length > 0,
    });
    if (wantsAllowlist) {
      const entry = await prompter.text({
        message: "私信白名单（逗号分隔的 ship 名称）",
        placeholder: "~zod, ~nec",
        initialValue: currentAllowlist.join(", ") || undefined,
      });
      next = applyTlonSetupConfig({
        cfg: next,
        accountId,
        input: {
          dmAllowlist: parseList(String(entry ?? "")).map((ship) => normalizeShip(ship)),
        },
      });
    }

    const autoDiscoverChannels = await prompter.confirm({
      message: "启用群组频道自动发现？",
      initialValue: resolved.autoDiscoverChannels ?? true,
    });
    next = applyTlonSetupConfig({
      cfg: next,
      accountId,
      input: { autoDiscoverChannels },
    });

    return { cfg: next };
  },
};
