import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  OpenClawConfig,
  DmPolicy,
  WizardPrompter,
} from "openclaw/plugin-sdk/bluebubbles";
import {
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  mergeAllowFromEntries,
  normalizeAccountId,
  patchScopedAccountConfig,
  resolveAccountIdForConfigure,
  setTopLevelChannelDmPolicyWithAllowFrom,
} from "openclaw/plugin-sdk/bluebubbles";
import {
  listBlueBubblesAccountIds,
  resolveBlueBubblesAccount,
  resolveDefaultBlueBubblesAccountId,
} from "./accounts.js";
import { applyBlueBubblesConnectionConfig } from "./config-apply.js";
import { hasConfiguredSecretInput, normalizeSecretInputString } from "./secret-input.js";
import { parseBlueBubblesAllowTarget } from "./targets.js";
import { normalizeBlueBubblesServerUrl } from "./types.js";

const channel = "bluebubbles" as const;

function setBlueBubblesDmPolicy(cfg: OpenClawConfig, dmPolicy: DmPolicy): OpenClawConfig {
  return setTopLevelChannelDmPolicyWithAllowFrom({
    cfg,
    channel: "bluebubbles",
    dmPolicy,
  });
}

function setBlueBubblesAllowFrom(
  cfg: OpenClawConfig,
  accountId: string,
  allowFrom: string[],
): OpenClawConfig {
  return patchScopedAccountConfig({
    cfg,
    channelKey: channel,
    accountId,
    patch: { allowFrom },
    ensureChannelEnabled: false,
    ensureAccountEnabled: false,
  });
}

function parseBlueBubblesAllowFromInput(raw: string): string[] {
  return raw
    .split(/[\n,]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function promptBlueBubblesAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<OpenClawConfig> {
  const accountId =
    params.accountId && normalizeAccountId(params.accountId)
      ? (normalizeAccountId(params.accountId) ?? DEFAULT_ACCOUNT_ID)
      : resolveDefaultBlueBubblesAccountId(params.cfg);
  const resolved = resolveBlueBubblesAccount({ cfg: params.cfg, accountId });
  const existing = resolved.config.allowFrom ?? [];
  await params.prompter.note(
    [
      "通过句柄或聊天目标将 BlueBubbles 私信加入白名单。",
      "示例：",
      "- +15555550123",
      "- user@example.com",
      "- chat_id:123",
      "- chat_guid:iMessage;-;+15555550123",
      "多个条目：用逗号或换行分隔。",
      `Docs: ${formatDocsLink("/channels/bluebubbles", "bluebubbles")}`,
    ].join("\n"),
    "BlueBubbles 白名单",
  );
  const entry = await params.prompter.text({
    message: "BlueBubbles allowFrom（句柄或 chat_id）",
    placeholder: "+15555550123, user@example.com, chat_id:123",
    initialValue: existing[0] ? String(existing[0]) : undefined,
    validate: (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) {
        return "必填";
      }
      const parts = parseBlueBubblesAllowFromInput(raw);
      for (const part of parts) {
        if (part === "*") {
          continue;
        }
        const parsed = parseBlueBubblesAllowTarget(part);
        if (parsed.kind === "handle" && !parsed.handle) {
          return `无效条目: ${part}`;
        }
      }
      return undefined;
    },
  });
  const parts = parseBlueBubblesAllowFromInput(String(entry));
  const unique = mergeAllowFromEntries(undefined, parts);
  return setBlueBubblesAllowFrom(params.cfg, accountId, unique);
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "BlueBubbles",
  channel,
  policyKey: "channels.bluebubbles.dmPolicy",
  allowFromKey: "channels.bluebubbles.allowFrom",
  getCurrent: (cfg) => cfg.channels?.bluebubbles?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setBlueBubblesDmPolicy(cfg, policy),
  promptAllowFrom: promptBlueBubblesAllowFrom,
};

export const blueBubblesOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = listBlueBubblesAccountIds(cfg).some((accountId) => {
      const account = resolveBlueBubblesAccount({ cfg, accountId });
      return account.configured;
    });
    return {
      channel,
      configured,
      statusLines: [`BlueBubbles：${configured ? "已配置" : "需要设置"}`],
      selectionHint: configured ? "已配置" : "通过 BlueBubbles 应用使用 iMessage",
      quickstartScore: configured ? 1 : 0,
    };
  },
  configure: async ({ cfg, prompter, accountOverrides, shouldPromptAccountIds }) => {
    const defaultAccountId = resolveDefaultBlueBubblesAccountId(cfg);
    const accountId = await resolveAccountIdForConfigure({
      cfg,
      prompter,
      label: "BlueBubbles",
      accountOverride: accountOverrides.bluebubbles,
      shouldPromptAccountIds,
      listAccountIds: listBlueBubblesAccountIds,
      defaultAccountId,
    });

    let next = cfg;
    const resolvedAccount = resolveBlueBubblesAccount({ cfg: next, accountId });
    const validateServerUrlInput = (value: unknown): string | undefined => {
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
    };
    const promptServerUrl = async (initialValue?: string): Promise<string> => {
      const entered = await prompter.text({
        message: "BlueBubbles 服务器 URL",
        placeholder: "http://192.168.1.100:1234",
        initialValue,
        validate: validateServerUrlInput,
      });
      return String(entered).trim();
    };

    // Prompt for server URL
    let serverUrl = resolvedAccount.config.serverUrl?.trim();
    if (!serverUrl) {
      await prompter.note(
        [
          "输入 BlueBubbles 服务器 URL（例如 http://192.168.1.100:1234）。",
          "在 BlueBubbles Server 应用的连接设置中查找。",
          `Docs: ${formatDocsLink("/channels/bluebubbles", "bluebubbles")}`,
        ].join("\n"),
        "BlueBubbles 服务器 URL",
      );
      serverUrl = await promptServerUrl();
    } else {
      const keepUrl = await prompter.confirm({
        message: `BlueBubbles 服务器 URL 已设置（${serverUrl}）。保留吗？`,
        initialValue: true,
      });
      if (!keepUrl) {
        serverUrl = await promptServerUrl(serverUrl);
      }
    }

    // Prompt for password
    const existingPassword = resolvedAccount.config.password;
    const existingPasswordText = normalizeSecretInputString(existingPassword);
    const hasConfiguredPassword = hasConfiguredSecretInput(existingPassword);
    let password: unknown = existingPasswordText;
    if (!hasConfiguredPassword) {
      await prompter.note(
        ["输入 BlueBubbles 服务器密码。", "在 BlueBubbles Server 应用的设置中查找。"].join("\n"),
        "BlueBubbles 密码",
      );
      const entered = await prompter.text({
        message: "BlueBubbles 密码",
        validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
      });
      password = String(entered).trim();
    } else {
      const keepPassword = await prompter.confirm({
        message: "BlueBubbles 密码已设置。保留吗？",
        initialValue: true,
      });
      if (!keepPassword) {
        const entered = await prompter.text({
          message: "BlueBubbles 密码",
          validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
        });
        password = String(entered).trim();
      } else if (!existingPasswordText) {
        password = existingPassword;
      }
    }

    // Prompt for webhook path (optional)
    const existingWebhookPath = resolvedAccount.config.webhookPath?.trim();
    const wantsWebhook = await prompter.confirm({
      message: "配置自定义 webhook 路径？（默认：/bluebubbles-webhook）",
      initialValue: Boolean(existingWebhookPath && existingWebhookPath !== "/bluebubbles-webhook"),
    });
    let webhookPath = "/bluebubbles-webhook";
    if (wantsWebhook) {
      const entered = await prompter.text({
        message: "Webhook 路径",
        placeholder: "/bluebubbles-webhook",
        initialValue: existingWebhookPath || "/bluebubbles-webhook",
        validate: (value) => {
          const trimmed = String(value ?? "").trim();
          if (!trimmed) {
            return "必填";
          }
          if (!trimmed.startsWith("/")) {
            return "路径必须以 / 开头";
          }
          return undefined;
        },
      });
      webhookPath = String(entered).trim();
    }

    // Apply config
    next = applyBlueBubblesConnectionConfig({
      cfg: next,
      accountId,
      patch: {
        serverUrl,
        password,
        webhookPath,
      },
      accountEnabled: "preserve-or-true",
    });

    await prompter.note(
      [
        "在 BlueBubbles Server 中配置 webhook URL：",
        "1. 打开 BlueBubbles Server → 设置 → Webhooks",
        "2. 添加你的 OpenClaw 网关地址 + Webhook 路径",
        "   示例：https://your-gateway-host:3000/bluebubbles-webhook",
        "3. 启用 Webhook 并保存",
        "",
        `Docs: ${formatDocsLink("/channels/bluebubbles", "bluebubbles")}`,
      ].join("\n"),
      "BlueBubbles 后续步骤",
    );

    return { cfg: next, accountId };
  },
  dmPolicy,
  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      bluebubbles: { ...cfg.channels?.bluebubbles, enabled: false },
    },
  }),
};
