import {
  buildSingleChannelSecretPromptState,
  createTopLevelChannelAllowFromSetter,
  createTopLevelChannelDmPolicy,
  createTopLevelChannelGroupPolicySetter,
  createTopLevelChannelParsedAllowFromPrompt,
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  hasConfiguredSecretInput,
  mergeAllowFromEntries,
  patchTopLevelChannelConfigSection,
  promptSingleChannelSecretInput,
  splitSetupEntries,
  type ChannelSetupDmPolicy,
  type ChannelSetupWizard,
  type OpenClawConfig,
  type SecretInput,
} from "openclaw/plugin-sdk/setup";
import { listFeishuAccountIds, resolveFeishuCredentials } from "./accounts.js";
import { probeFeishu } from "./probe.js";
import { feishuSetupAdapter } from "./setup-core.js";
import type { FeishuConfig } from "./types.js";

const channel = "feishu" as const;
const setFeishuAllowFrom = createTopLevelChannelAllowFromSetter({
  channel,
});
const setFeishuGroupPolicy = createTopLevelChannelGroupPolicySetter({
  channel,
  enabled: true,
});

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function setFeishuGroupAllowFrom(cfg: OpenClawConfig, groupAllowFrom: string[]): OpenClawConfig {
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: {
        ...cfg.channels?.feishu,
        groupAllowFrom,
      },
    },
  };
}

function isFeishuConfigured(cfg: OpenClawConfig): boolean {
  const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;

  const isAppIdConfigured = (value: unknown): boolean => {
    const asString = normalizeString(value);
    if (asString) {
      return true;
    }
    if (!value || typeof value !== "object") {
      return false;
    }
    const rec = value as Record<string, unknown>;
    const source = normalizeString(rec.source)?.toLowerCase();
    const id = normalizeString(rec.id);
    if (source === "env" && id) {
      return Boolean(normalizeString(process.env[id]));
    }
    return hasConfiguredSecretInput(value);
  };

  const topLevelConfigured = Boolean(
    isAppIdConfigured(feishuCfg?.appId) && hasConfiguredSecretInput(feishuCfg?.appSecret),
  );

  const accountConfigured = Object.values(feishuCfg?.accounts ?? {}).some((account) => {
    if (!account || typeof account !== "object") {
      return false;
    }
    const hasOwnAppId = Object.prototype.hasOwnProperty.call(account, "appId");
    const hasOwnAppSecret = Object.prototype.hasOwnProperty.call(account, "appSecret");
    const accountAppIdConfigured = hasOwnAppId
      ? isAppIdConfigured((account as Record<string, unknown>).appId)
      : isAppIdConfigured(feishuCfg?.appId);
    const accountSecretConfigured = hasOwnAppSecret
      ? hasConfiguredSecretInput((account as Record<string, unknown>).appSecret)
      : hasConfiguredSecretInput(feishuCfg?.appSecret);
    return Boolean(accountAppIdConfigured && accountSecretConfigured);
  });

  return topLevelConfigured || accountConfigured;
}

const promptFeishuAllowFrom = createTopLevelChannelParsedAllowFromPrompt({
  channel,
  defaultAccountId: DEFAULT_ACCOUNT_ID,
  noteTitle: "Feishu allowlist",
  noteLines: [
    "Allowlist Feishu DMs by open_id or user_id.",
    "You can find user open_id in Feishu admin console or via API.",
    "Examples:",
    "- ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "- on_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  ],
  message: "Feishu allowFrom (user open_ids)",
  placeholder: "ou_xxxxx, ou_yyyyy",
  parseEntries: (raw) => ({ entries: splitSetupEntries(raw) }),
  mergeEntries: ({ existing, parsed }) => mergeAllowFromEntries(existing, parsed),
});

async function noteFeishuCredentialHelp(
  prompter: Parameters<NonNullable<ChannelSetupWizard["finalize"]>>[0]["prompter"],
): Promise<void> {
  await prompter.note(
    [
      "1) 前往飞书开放平台 (open.feishu.cn)",
      "2) 创建一个自建应用",
      "3) 从凭据页面获取 App ID 和 App Secret",
      "4) 启用必要权限：im:message, im:chat, contact:user.base:readonly",
      "5) 发布应用或将其添加到测试群组",
      "提示：你也可以设置 FEISHU_APP_ID / FEISHU_APP_SECRET 环境变量。",
      `Docs: ${formatDocsLink("/channels/feishu", "feishu")}`,
    ].join("\n"),
    "飞书凭据",
  );
}

async function promptFeishuAppId(params: {
  prompter: Parameters<NonNullable<ChannelSetupWizard["finalize"]>>[0]["prompter"];
  initialValue?: string;
}): Promise<string> {
  return String(
    await params.prompter.text({
      message: "输入飞书 App ID",
      initialValue: params.initialValue,
      validate: (value) => (value?.trim() ? undefined : "必填"),
    }),
  ).trim();
}

const feishuDmPolicy: ChannelSetupDmPolicy = createTopLevelChannelDmPolicy({
  label: "Feishu",
  channel,
  policyKey: "channels.feishu.dmPolicy",
  allowFromKey: "channels.feishu.allowFrom",
  getCurrent: (cfg) => (cfg.channels?.feishu as FeishuConfig | undefined)?.dmPolicy ?? "pairing",
  promptAllowFrom: promptFeishuAllowFrom,
});

export { feishuSetupAdapter } from "./setup-core.js";

export const feishuSetupWizard: ChannelSetupWizard = {
  channel,
  resolveAccountIdForConfigure: () => DEFAULT_ACCOUNT_ID,
  resolveShouldPromptAccountIds: () => false,
  status: {
    configuredLabel: "configured",
    unconfiguredLabel: "needs app credentials",
    configuredHint: "configured",
    unconfiguredHint: "needs app creds",
    configuredScore: 2,
    unconfiguredScore: 0,
    resolveConfigured: ({ cfg }) => isFeishuConfigured(cfg),
    resolveStatusLines: async ({ cfg, configured }) => {
      const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
      const resolvedCredentials = resolveFeishuCredentials(feishuCfg, {
        allowUnresolvedSecretRef: true,
      });
      let probeResult = null;
      if (configured && resolvedCredentials) {
        try {
          probeResult = await probeFeishu(resolvedCredentials);
        } catch {}
      }
      if (!configured) {
        return ["Feishu: needs app credentials"];
      }
      if (probeResult?.ok) {
        return [`Feishu: connected as ${probeResult.botName ?? probeResult.botOpenId ?? "bot"}`];
      }
      return ["Feishu: configured (connection not verified)"];
    },
  },
  credentials: [],
  finalize: async ({ cfg, prompter, options }) => {
    const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
    const resolved = resolveFeishuCredentials(feishuCfg, {
      allowUnresolvedSecretRef: true,
    });
    const hasConfigSecret = hasConfiguredSecretInput(feishuCfg?.appSecret);
    const hasConfigCreds = Boolean(
      typeof feishuCfg?.appId === "string" && feishuCfg.appId.trim() && hasConfigSecret,
    );
    const appSecretPromptState = buildSingleChannelSecretPromptState({
      accountConfigured: Boolean(resolved),
      hasConfigToken: hasConfigSecret,
      allowEnv: !hasConfigCreds && Boolean(process.env.FEISHU_APP_ID?.trim()),
      envValue: process.env.FEISHU_APP_SECRET,
    });

    let next = cfg;
    let appId: string | null = null;
    let appSecret: SecretInput | null = null;
    let appSecretProbeValue: string | null = null;

    if (!resolved) {
      await noteFeishuCredentialHelp(prompter);
    }

    const appSecretResult = await promptSingleChannelSecretInput({
      cfg: next,
      prompter,
      providerHint: "feishu",
      credentialLabel: "App Secret",
      secretInputMode: options?.secretInputMode,
      accountConfigured: appSecretPromptState.accountConfigured,
      canUseEnv: appSecretPromptState.canUseEnv,
      hasConfigToken: appSecretPromptState.hasConfigToken,
      envPrompt: "检测到 FEISHU_APP_ID + FEISHU_APP_SECRET。使用环境变量？",
      keepPrompt: "飞书应用密钥已配置。保留吗？",
      inputPrompt: "输入飞书应用密钥",
      preferredEnvVar: "FEISHU_APP_SECRET",
    });

    if (appSecretResult.action === "use-env") {
      next = patchTopLevelChannelConfigSection({
        cfg: next,
        channel,
        enabled: true,
        patch: {},
      }) as OpenClawConfig;
    } else if (appSecretResult.action === "set") {
      appSecret = appSecretResult.value;
      appSecretProbeValue = appSecretResult.resolvedValue;
      appId = await promptFeishuAppId({
        prompter,
        initialValue:
          normalizeString(feishuCfg?.appId) ?? normalizeString(process.env.FEISHU_APP_ID),
      });
    }

    if (appId && appSecret) {
      next = patchTopLevelChannelConfigSection({
        cfg: next,
        channel,
        enabled: true,
        patch: {
          appId,
          appSecret,
        },
      }) as OpenClawConfig;

      try {
        const probe = await probeFeishu({
          appId,
          appSecret: appSecretProbeValue ?? undefined,
          domain: (next.channels?.feishu as FeishuConfig | undefined)?.domain,
        });
        if (probe.ok) {
          await prompter.note(
            `已连接为 ${probe.botName ?? probe.botOpenId ?? "bot"}`,
            "飞书连接测试",
          );
        } else {
          await prompter.note(`连接失败：${probe.error ?? "未知错误"}`, "飞书连接测试");
        }
      } catch (err) {
        await prompter.note(`连接测试失败：${String(err)}`, "飞书连接测试");
      }
    }

    const currentMode =
      (next.channels?.feishu as FeishuConfig | undefined)?.connectionMode ?? "websocket";
    const connectionMode = (await prompter.select({
      message: "飞书连接模式",
      options: [
        { value: "websocket", label: "WebSocket（默认）" },
        { value: "webhook", label: "Webhook" },
      ],
      initialValue: currentMode,
    })) as "websocket" | "webhook";
    next = patchTopLevelChannelConfigSection({
      cfg: next,
      channel,
      patch: { connectionMode },
    }) as OpenClawConfig;

    if (connectionMode === "webhook") {
      const currentVerificationToken = (next.channels?.feishu as FeishuConfig | undefined)
        ?.verificationToken;
      const verificationTokenResult = await promptSingleChannelSecretInput({
        cfg: next,
        prompter,
        providerHint: "feishu-webhook",
        credentialLabel: "verification token",
        secretInputMode: options?.secretInputMode,
        ...buildSingleChannelSecretPromptState({
          accountConfigured: hasConfiguredSecretInput(currentVerificationToken),
          hasConfigToken: hasConfiguredSecretInput(currentVerificationToken),
          allowEnv: false,
        }),
        envPrompt: "",
        keepPrompt: "飞书验证令牌已配置。保留吗？",
        inputPrompt: "输入飞书验证令牌",
        preferredEnvVar: "FEISHU_VERIFICATION_TOKEN",
      });
      if (verificationTokenResult.action === "set") {
        next = patchTopLevelChannelConfigSection({
          cfg: next,
          channel,
          patch: { verificationToken: verificationTokenResult.value },
        }) as OpenClawConfig;
      }

      const currentEncryptKey = (next.channels?.feishu as FeishuConfig | undefined)?.encryptKey;
      const encryptKeyResult = await promptSingleChannelSecretInput({
        cfg: next,
        prompter,
        providerHint: "feishu-webhook",
        credentialLabel: "encrypt key",
        secretInputMode: options?.secretInputMode,
        ...buildSingleChannelSecretPromptState({
          accountConfigured: hasConfiguredSecretInput(currentEncryptKey),
          hasConfigToken: hasConfiguredSecretInput(currentEncryptKey),
          allowEnv: false,
        }),
        envPrompt: "",
        keepPrompt: "飞书加密密钥已配置。保留吗？",
        inputPrompt: "输入飞书加密密钥",
        preferredEnvVar: "FEISHU_ENCRYPT_KEY",
      });
      if (encryptKeyResult.action === "set") {
        next = patchTopLevelChannelConfigSection({
          cfg: next,
          channel,
          patch: { encryptKey: encryptKeyResult.value },
        }) as OpenClawConfig;
      }

      const currentWebhookPath = (next.channels?.feishu as FeishuConfig | undefined)?.webhookPath;
      const webhookPath = String(
        await prompter.text({
          message: "飞书 webhook 路径",
          initialValue: currentWebhookPath ?? "/feishu/events",
          validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
        }),
      ).trim();
      next = patchTopLevelChannelConfigSection({
        cfg: next,
        channel,
        patch: { webhookPath },
      }) as OpenClawConfig;
    }

    const currentDomain = (next.channels?.feishu as FeishuConfig | undefined)?.domain ?? "feishu";
    const domain = await prompter.select({
      message: "选择飞书域名？",
      options: [
        { value: "feishu", label: "飞书 (feishu.cn) - 中国" },
        { value: "lark", label: "Lark (larksuite.com) - 国际版" },
      ],
      initialValue: currentDomain,
    });
    next = patchTopLevelChannelConfigSection({
      cfg: next,
      channel,
      patch: { domain: domain as "feishu" | "lark" },
    }) as OpenClawConfig;

    const groupPolicy = (await prompter.select({
      message: "Group chat policy",
      options: [
        { value: "allowlist", label: "白名单 - 仅在特定群组中回复" },
        { value: "open", label: "开放 - 在所有群组中回复（需要被提及）" },
        { value: "disabled", label: "禁用 - 不在群组中回复" },
      ],
      initialValue: (next.channels?.feishu as FeishuConfig | undefined)?.groupPolicy ?? "allowlist",
    })) as "allowlist" | "open" | "disabled";
    next = setFeishuGroupPolicy(next, groupPolicy);

    if (groupPolicy === "allowlist") {
      const existing = (next.channels?.feishu as FeishuConfig | undefined)?.groupAllowFrom ?? [];
      const entry = await prompter.text({
        message: "群聊白名单（chat_ids）",
        placeholder: "oc_xxxxx, oc_yyyyy",
        initialValue: existing.length > 0 ? existing.map(String).join(", ") : undefined,
      });
      if (entry) {
        const parts = splitSetupEntries(String(entry));
        if (parts.length > 0) {
          next = setFeishuGroupAllowFrom(next, parts);
        }
      }
    }

    return { cfg: next };
  },
  dmPolicy: feishuDmPolicy,
  disable: (cfg) =>
    patchTopLevelChannelConfigSection({
      cfg,
      channel,
      patch: { enabled: false },
    }),
};
