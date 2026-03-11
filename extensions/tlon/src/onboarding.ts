import type { OpenClawConfig } from "openclaw/plugin-sdk/tlon";
import {
  formatDocsLink,
  patchScopedAccountConfig,
  resolveAccountIdForConfigure,
  DEFAULT_ACCOUNT_ID,
  type ChannelOnboardingAdapter,
  type WizardPrompter,
} from "openclaw/plugin-sdk/tlon";
import { buildTlonAccountFields } from "./account-fields.js";
import type { TlonResolvedAccount } from "./types.js";
import { listTlonAccountIds, resolveTlonAccount } from "./types.js";
import { isBlockedUrbitHostname, validateUrbitBaseUrl } from "./urbit/base-url.js";

const channel = "tlon" as const;

function isConfigured(account: TlonResolvedAccount): boolean {
  return Boolean(account.ship && account.url && account.code);
}

function applyAccountConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  input: {
    name?: string;
    ship?: string;
    url?: string;
    code?: string;
    allowPrivateNetwork?: boolean;
    groupChannels?: string[];
    dmAllowlist?: string[];
    autoDiscoverChannels?: boolean;
  };
}): OpenClawConfig {
  const { cfg, accountId, input } = params;
  const nextValues = {
    enabled: true,
    ...(input.name ? { name: input.name } : {}),
    ...buildTlonAccountFields(input),
  };
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return patchScopedAccountConfig({
      cfg,
      channelKey: channel,
      accountId,
      patch: nextValues,
      ensureChannelEnabled: false,
      ensureAccountEnabled: false,
    });
  }
  return patchScopedAccountConfig({
    cfg,
    channelKey: channel,
    accountId,
    patch: { enabled: cfg.channels?.tlon?.enabled ?? true },
    accountPatch: nextValues,
    ensureChannelEnabled: false,
    ensureAccountEnabled: false,
  });
}

async function noteTlonHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "你需要你的 Urbit ship URL 和登录码。",
      "示例 URL：https://your-ship-host",
      "示例 ship：~sampel-palnet",
      "如果你的 ship URL 在私有网络（LAN/localhost）上，你必须在设置期间明确允许。",
      `Docs: ${formatDocsLink("/channels/tlon", "channels/tlon")}`,
    ].join("\n"),
    "Tlon 设置",
  );
}

function parseList(value: string): string[] {
  return value
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const tlonOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const accountIds = listTlonAccountIds(cfg);
    const configured =
      accountIds.length > 0
        ? accountIds.some((accountId) => isConfigured(resolveTlonAccount(cfg, accountId)))
        : isConfigured(resolveTlonAccount(cfg, DEFAULT_ACCOUNT_ID));

    return {
      channel,
      configured,
      statusLines: [`Tlon：${configured ? "已配置" : "需要设置"}`],
      selectionHint: configured ? "已配置" : "Urbit 即时通讯",
      quickstartScore: configured ? 1 : 4,
    };
  },
  configure: async ({ cfg, prompter, accountOverrides, shouldPromptAccountIds }) => {
    const defaultAccountId = DEFAULT_ACCOUNT_ID;
    const accountId = await resolveAccountIdForConfigure({
      cfg,
      prompter,
      label: "Tlon",
      accountOverride: accountOverrides[channel],
      shouldPromptAccountIds,
      listAccountIds: listTlonAccountIds,
      defaultAccountId,
    });

    const resolved = resolveTlonAccount(cfg, accountId);
    await noteTlonHelp(prompter);

    const ship = await prompter.text({
      message: "Ship 名称",
      placeholder: "~sampel-palnet",
      initialValue: resolved.ship ?? undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });

    const url = await prompter.text({
      message: "Ship URL",
      placeholder: "https://your-ship-host",
      initialValue: resolved.url ?? undefined,
      validate: (value) => {
        const next = validateUrbitBaseUrl(String(value ?? ""));
        if (!next.ok) {
          return next.error;
        }
        return undefined;
      },
    });

    const validatedUrl = validateUrbitBaseUrl(String(url).trim());
    if (!validatedUrl.ok) {
      throw new Error(`Invalid URL: ${validatedUrl.error}`);
    }

    let allowPrivateNetwork = resolved.allowPrivateNetwork ?? false;
    if (isBlockedUrbitHostname(validatedUrl.hostname)) {
      allowPrivateNetwork = await prompter.confirm({
        message:
          "Ship URL 看起来是私有/内部主机。允许私有网络访问？（SSRF 风险）",
        initialValue: allowPrivateNetwork,
      });
      if (!allowPrivateNetwork) {
        throw new Error("拒绝未经明确批准的私有/内部 Ship URL");
      }
    }

    const code = await prompter.text({
      message: "登录码",
      placeholder: "lidlut-tabwed-pillex-ridrup",
      initialValue: resolved.code ?? undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });

    const wantsGroupChannels = await prompter.confirm({
      message: "手动添加群组频道？（可选）",
      initialValue: false,
    });

    let groupChannels: string[] | undefined;
    if (wantsGroupChannels) {
      const entry = await prompter.text({
        message: "群组频道（逗号分隔）",
        placeholder: "chat/~host-ship/general, chat/~host-ship/support",
      });
      const parsed = parseList(String(entry ?? ""));
      groupChannels = parsed.length > 0 ? parsed : undefined;
    }

    const wantsAllowlist = await prompter.confirm({
      message: "使用白名单限制私信？",
      initialValue: false,
    });

    let dmAllowlist: string[] | undefined;
    if (wantsAllowlist) {
      const entry = await prompter.text({
        message: "私信白名单（逗号分隔的 ship 名称）",
        placeholder: "~zod, ~nec",
      });
      const parsed = parseList(String(entry ?? ""));
      dmAllowlist = parsed.length > 0 ? parsed : undefined;
    }

    const autoDiscoverChannels = await prompter.confirm({
      message: "启用群组频道自动发现？",
      initialValue: resolved.autoDiscoverChannels ?? true,
    });

    const next = applyAccountConfig({
      cfg,
      accountId,
      input: {
        ship: String(ship).trim(),
        url: String(url).trim(),
        code: String(code).trim(),
        allowPrivateNetwork,
        groupChannels,
        dmAllowlist,
        autoDiscoverChannels,
      },
    });

    return { cfg: next, accountId };
  },
};
