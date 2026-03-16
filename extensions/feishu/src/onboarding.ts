import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  ClawdbotConfig,
  DmPolicy,
  SecretInput,
  WizardPrompter,
} from "openclaw/plugin-sdk/feishu";
import {
  buildSingleChannelSecretPromptState,
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  hasConfiguredSecretInput,
  mergeAllowFromEntries,
  promptSingleChannelSecretInput,
  setTopLevelChannelAllowFrom,
  setTopLevelChannelDmPolicyWithAllowFrom,
  setTopLevelChannelGroupPolicy,
  splitOnboardingEntries,
} from "openclaw/plugin-sdk/feishu";
import { resolveFeishuCredentials } from "./accounts.js";
import { probeFeishu } from "./probe.js";
import type { FeishuConfig } from "./types.js";

const channel = "feishu" as const;

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function setFeishuDmPolicy(cfg: ClawdbotConfig, dmPolicy: DmPolicy): ClawdbotConfig {
  return setTopLevelChannelDmPolicyWithAllowFrom({
    cfg,
    channel: "feishu",
    dmPolicy,
  }) as ClawdbotConfig;
}

function setFeishuAllowFrom(cfg: ClawdbotConfig, allowFrom: string[]): ClawdbotConfig {
  return setTopLevelChannelAllowFrom({
    cfg,
    channel: "feishu",
    allowFrom,
  }) as ClawdbotConfig;
}

async function promptFeishuAllowFrom(params: {
  cfg: ClawdbotConfig;
  prompter: WizardPrompter;
}): Promise<ClawdbotConfig> {
  const existing = params.cfg.channels?.feishu?.allowFrom ?? [];
  await params.prompter.note(
    [
      "通过 open_id 或 user_id 将飞书私聊加入白名单。",
      "你可以在飞书管理后台或通过 API 找到用户 open_id。",
      "示例：",
      "- ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "- on_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    ].join("\n"),
    "飞书白名单",
  );

  while (true) {
    const entry = await params.prompter.text({
      message: "飞书 allowFrom（用户 open_ids）",
      placeholder: "ou_xxxxx, ou_yyyyy",
      initialValue: existing[0] ? String(existing[0]) : undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });
    const parts = splitOnboardingEntries(String(entry));
    if (parts.length === 0) {
      await params.prompter.note("请至少输入一个用户。", "飞书白名单");
      continue;
    }

    const unique = mergeAllowFromEntries(existing, parts);
    return setFeishuAllowFrom(params.cfg, unique);
  }
}

async function noteFeishuCredentialHelp(prompter: WizardPrompter): Promise<void> {
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
  prompter: WizardPrompter;
  initialValue?: string;
}): Promise<string> {
  const appId = String(
    await params.prompter.text({
      message: "输入飞书 App ID",
      initialValue: params.initialValue,
      validate: (value) => (value?.trim() ? undefined : "必填"),
    }),
  ).trim();
  return appId;
}

function setFeishuGroupPolicy(
  cfg: ClawdbotConfig,
  groupPolicy: "open" | "allowlist" | "disabled",
): ClawdbotConfig {
  return setTopLevelChannelGroupPolicy({
    cfg,
    channel: "feishu",
    groupPolicy,
    enabled: true,
  }) as ClawdbotConfig;
}

function setFeishuGroupAllowFrom(cfg: ClawdbotConfig, groupAllowFrom: string[]): ClawdbotConfig {
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

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Feishu",
  channel,
  policyKey: "channels.feishu.dmPolicy",
  allowFromKey: "channels.feishu.allowFrom",
  getCurrent: (cfg) => (cfg.channels?.feishu as FeishuConfig | undefined)?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setFeishuDmPolicy(cfg, policy),
  promptAllowFrom: promptFeishuAllowFrom,
};

export const feishuOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
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

    const configured = topLevelConfigured || accountConfigured;
    const resolvedCredentials = resolveFeishuCredentials(feishuCfg, {
      allowUnresolvedSecretRef: true,
    });

    // Try to probe if configured
    let probeResult = null;
    if (configured && resolvedCredentials) {
      try {
        probeResult = await probeFeishu(resolvedCredentials);
      } catch {
        // Ignore probe errors
      }
    }

    const statusLines: string[] = [];
    if (!configured) {
      statusLines.push("飞书：需要应用凭据");
    } else if (probeResult?.ok) {
      statusLines.push(`飞书：已连接为 ${probeResult.botName ?? probeResult.botOpenId ?? "bot"}`);
    } else {
      statusLines.push("飞书：已配置（连接未验证）");
    }

    return {
      channel,
      configured,
      statusLines,
      selectionHint: configured ? "已配置" : "需要应用凭据",
      quickstartScore: configured ? 2 : 0,
    };
  },

  configure: async ({ cfg, prompter }) => {
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
      credentialLabel: "应用密钥",
      accountConfigured: appSecretPromptState.accountConfigured,
      canUseEnv: appSecretPromptState.canUseEnv,
      hasConfigToken: appSecretPromptState.hasConfigToken,
      envPrompt: "检测到 FEISHU_APP_ID + FEISHU_APP_SECRET。使用环境变量？",
      keepPrompt: "飞书应用密钥已配置。保留吗？",
      inputPrompt: "输入飞书应用密钥",
      preferredEnvVar: "FEISHU_APP_SECRET",
    });

    if (appSecretResult.action === "use-env") {
      next = {
        ...next,
        channels: {
          ...next.channels,
          feishu: { ...next.channels?.feishu, enabled: true },
        },
      };
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
      next = {
        ...next,
        channels: {
          ...next.channels,
          feishu: {
            ...next.channels?.feishu,
            enabled: true,
            appId,
            appSecret,
          },
        },
      };

      // Test connection
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
    next = {
      ...next,
      channels: {
        ...next.channels,
        feishu: {
          ...next.channels?.feishu,
          connectionMode,
        },
      },
    };

    if (connectionMode === "webhook") {
      const currentVerificationToken = (next.channels?.feishu as FeishuConfig | undefined)
        ?.verificationToken;
      const verificationTokenPromptState = buildSingleChannelSecretPromptState({
        accountConfigured: hasConfiguredSecretInput(currentVerificationToken),
        hasConfigToken: hasConfiguredSecretInput(currentVerificationToken),
        allowEnv: false,
      });
      const verificationTokenResult = await promptSingleChannelSecretInput({
        cfg: next,
        prompter,
        providerHint: "feishu-webhook",
        credentialLabel: "验证令牌",
        accountConfigured: verificationTokenPromptState.accountConfigured,
        canUseEnv: verificationTokenPromptState.canUseEnv,
        hasConfigToken: verificationTokenPromptState.hasConfigToken,
        envPrompt: "",
        keepPrompt: "飞书验证令牌已配置。保留吗？",
        inputPrompt: "输入飞书验证令牌",
        preferredEnvVar: "FEISHU_VERIFICATION_TOKEN",
      });
      if (verificationTokenResult.action === "set") {
        next = {
          ...next,
          channels: {
            ...next.channels,
            feishu: {
              ...next.channels?.feishu,
              verificationToken: verificationTokenResult.value,
            },
          },
        };
      }
      const currentEncryptKey = (next.channels?.feishu as FeishuConfig | undefined)?.encryptKey;
      const encryptKeyPromptState = buildSingleChannelSecretPromptState({
        accountConfigured: hasConfiguredSecretInput(currentEncryptKey),
        hasConfigToken: hasConfiguredSecretInput(currentEncryptKey),
        allowEnv: false,
      });
      const encryptKeyResult = await promptSingleChannelSecretInput({
        cfg: next,
        prompter,
        providerHint: "feishu-webhook",
        credentialLabel: "加密密钥",
        accountConfigured: encryptKeyPromptState.accountConfigured,
        canUseEnv: encryptKeyPromptState.canUseEnv,
        hasConfigToken: encryptKeyPromptState.hasConfigToken,
        envPrompt: "",
        keepPrompt: "飞书加密密钥已配置。保留吗？",
        inputPrompt: "输入飞书加密密钥",
        preferredEnvVar: "FEISHU_ENCRYPT_KEY",
      });
      if (encryptKeyResult.action === "set") {
        next = {
          ...next,
          channels: {
            ...next.channels,
            feishu: {
              ...next.channels?.feishu,
              encryptKey: encryptKeyResult.value,
            },
          },
        };
      }
      const currentWebhookPath = (next.channels?.feishu as FeishuConfig | undefined)?.webhookPath;
      const webhookPath = String(
        await prompter.text({
          message: "飞书 webhook 路径",
          initialValue: currentWebhookPath ?? "/feishu/events",
          validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
        }),
      ).trim();
      next = {
        ...next,
        channels: {
          ...next.channels,
          feishu: {
            ...next.channels?.feishu,
            webhookPath,
          },
        },
      };
    }

    // Domain selection
    const currentDomain = (next.channels?.feishu as FeishuConfig | undefined)?.domain ?? "feishu";
    const domain = await prompter.select({
      message: "选择飞书域名？",
      options: [
        { value: "feishu", label: "飞书 (feishu.cn) - 中国" },
        { value: "lark", label: "Lark (larksuite.com) - 国际版" },
      ],
      initialValue: currentDomain,
    });
    if (domain) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          feishu: {
            ...next.channels?.feishu,
            domain: domain as "feishu" | "lark",
          },
        },
      };
    }

    // Group policy
    const groupPolicy = await prompter.select({
      message: "群聊策略",
      options: [
        { value: "allowlist", label: "白名单 - 仅在特定群组中回复" },
        { value: "open", label: "开放 - 在所有群组中回复（需要被提及）" },
        { value: "disabled", label: "禁用 - 不在群组中回复" },
      ],
      initialValue: (next.channels?.feishu as FeishuConfig | undefined)?.groupPolicy ?? "allowlist",
    });
    if (groupPolicy) {
      next = setFeishuGroupPolicy(next, groupPolicy as "open" | "allowlist" | "disabled");
    }

    // Group allowlist if needed
    if (groupPolicy === "allowlist") {
      const existing = (next.channels?.feishu as FeishuConfig | undefined)?.groupAllowFrom ?? [];
      const entry = await prompter.text({
        message: "群聊白名单（chat_ids）",
        placeholder: "oc_xxxxx, oc_yyyyy",
        initialValue: existing.length > 0 ? existing.map(String).join(", ") : undefined,
      });
      if (entry) {
        const parts = splitOnboardingEntries(String(entry));
        if (parts.length > 0) {
          next = setFeishuGroupAllowFrom(next, parts);
        }
      }
    }

    return { cfg: next, accountId: DEFAULT_ACCOUNT_ID };
  },

  dmPolicy,

  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: { ...cfg.channels?.feishu, enabled: false },
    },
  }),
};
