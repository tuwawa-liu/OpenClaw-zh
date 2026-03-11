import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  OpenClawConfig,
  SecretInput,
  WizardPrompter,
} from "openclaw/plugin-sdk/zalo";
import {
  buildSingleChannelSecretPromptState,
  DEFAULT_ACCOUNT_ID,
  hasConfiguredSecretInput,
  mergeAllowFromEntries,
  normalizeAccountId,
  promptSingleChannelSecretInput,
  runSingleChannelSecretStep,
  resolveAccountIdForConfigure,
  setTopLevelChannelDmPolicyWithAllowFrom,
} from "openclaw/plugin-sdk/zalo";
import { listZaloAccountIds, resolveDefaultZaloAccountId, resolveZaloAccount } from "./accounts.js";

const channel = "zalo" as const;

type UpdateMode = "polling" | "webhook";

function setZaloDmPolicy(
  cfg: OpenClawConfig,
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled",
) {
  return setTopLevelChannelDmPolicyWithAllowFrom({
    cfg,
    channel: "zalo",
    dmPolicy,
  }) as OpenClawConfig;
}

function setZaloUpdateMode(
  cfg: OpenClawConfig,
  accountId: string,
  mode: UpdateMode,
  webhookUrl?: string,
  webhookSecret?: SecretInput,
  webhookPath?: string,
): OpenClawConfig {
  const isDefault = accountId === DEFAULT_ACCOUNT_ID;
  if (mode === "polling") {
    if (isDefault) {
      const {
        webhookUrl: _url,
        webhookSecret: _secret,
        webhookPath: _path,
        ...rest
      } = cfg.channels?.zalo ?? {};
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          zalo: rest,
        },
      } as OpenClawConfig;
    }
    const accounts = { ...cfg.channels?.zalo?.accounts } as Record<string, Record<string, unknown>>;
    const existing = accounts[accountId] ?? {};
    const { webhookUrl: _url, webhookSecret: _secret, webhookPath: _path, ...rest } = existing;
    accounts[accountId] = rest;
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        zalo: {
          ...cfg.channels?.zalo,
          accounts,
        },
      },
    } as OpenClawConfig;
  }

  if (isDefault) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        zalo: {
          ...cfg.channels?.zalo,
          webhookUrl,
          webhookSecret,
          webhookPath,
        },
      },
    } as OpenClawConfig;
  }

  const accounts = { ...cfg.channels?.zalo?.accounts } as Record<string, Record<string, unknown>>;
  accounts[accountId] = {
    ...accounts[accountId],
    webhookUrl,
    webhookSecret,
    webhookPath,
  };
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      zalo: {
        ...cfg.channels?.zalo,
        accounts,
      },
    },
  } as OpenClawConfig;
}

async function noteZaloTokenHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) 打开 Zalo 机器人平台：https://bot.zaloplatforms.com",
      "2) 创建机器人并获取令牌",
      "3) 令牌格式类似 12345689:abc-xyz",
      "提示：你也可以在环境变量中设置 ZALO_BOT_TOKEN。",
      "文档：https://docs.openclaw.ai/channels/zalo",
    ].join("\n"),
    "Zalo 机器人令牌",
  );
}

async function promptZaloAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<OpenClawConfig> {
  const { cfg, prompter, accountId } = params;
  const resolved = resolveZaloAccount({ cfg, accountId });
  const existingAllowFrom = resolved.config.allowFrom ?? [];
  const entry = await prompter.text({
    message: "Zalo allowFrom（用户 ID）",
    placeholder: "123456789",
    initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
    validate: (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) {
        return "必填";
      }
      if (!/^\d+$/.test(raw)) {
        return "请使用数字 Zalo 用户 ID";
      }
      return undefined;
    },
  });
  const normalized = String(entry).trim();
  const unique = mergeAllowFromEntries(existingAllowFrom, [normalized]);

  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        zalo: {
          ...cfg.channels?.zalo,
          enabled: true,
          dmPolicy: "allowlist",
          allowFrom: unique,
        },
      },
    } as OpenClawConfig;
  }

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      zalo: {
        ...cfg.channels?.zalo,
        enabled: true,
        accounts: {
          ...cfg.channels?.zalo?.accounts,
          [accountId]: {
            ...cfg.channels?.zalo?.accounts?.[accountId],
            enabled: cfg.channels?.zalo?.accounts?.[accountId]?.enabled ?? true,
            dmPolicy: "allowlist",
            allowFrom: unique,
          },
        },
      },
    },
  } as OpenClawConfig;
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Zalo",
  channel,
  policyKey: "channels.zalo.dmPolicy",
  allowFromKey: "channels.zalo.allowFrom",
  getCurrent: (cfg) => (cfg.channels?.zalo?.dmPolicy ?? "pairing") as "pairing",
  setPolicy: (cfg, policy) => setZaloDmPolicy(cfg, policy),
  promptAllowFrom: async ({ cfg, prompter, accountId }) => {
    const id =
      accountId && normalizeAccountId(accountId)
        ? (normalizeAccountId(accountId) ?? DEFAULT_ACCOUNT_ID)
        : resolveDefaultZaloAccountId(cfg);
    return promptZaloAllowFrom({
      cfg: cfg,
      prompter,
      accountId: id,
    });
  },
};

export const zaloOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  dmPolicy,
  getStatus: async ({ cfg }) => {
    const configured = listZaloAccountIds(cfg).some((accountId) => {
      const account = resolveZaloAccount({
        cfg: cfg,
        accountId,
        allowUnresolvedSecretRef: true,
      });
      return (
        Boolean(account.token) ||
        hasConfiguredSecretInput(account.config.botToken) ||
        Boolean(account.config.tokenFile?.trim())
      );
    });
    return {
      channel,
      configured,
      statusLines: [`Zalo：${configured ? "已配置" : "需要令牌"}`],
      selectionHint: configured ? "推荐 · 已配置" : "推荐 · 新手友好",
      quickstartScore: configured ? 1 : 10,
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    const defaultZaloAccountId = resolveDefaultZaloAccountId(cfg);
    const zaloAccountId = await resolveAccountIdForConfigure({
      cfg,
      prompter,
      label: "Zalo",
      accountOverride: accountOverrides.zalo,
      shouldPromptAccountIds,
      listAccountIds: listZaloAccountIds,
      defaultAccountId: defaultZaloAccountId,
    });

    let next = cfg;
    const resolvedAccount = resolveZaloAccount({
      cfg: next,
      accountId: zaloAccountId,
      allowUnresolvedSecretRef: true,
    });
    const accountConfigured = Boolean(resolvedAccount.token);
    const allowEnv = zaloAccountId === DEFAULT_ACCOUNT_ID;
    const hasConfigToken = Boolean(
      hasConfiguredSecretInput(resolvedAccount.config.botToken) || resolvedAccount.config.tokenFile,
    );
    const tokenStep = await runSingleChannelSecretStep({
      cfg: next,
      prompter,
      providerHint: "zalo",
      credentialLabel: "bot token",
      accountConfigured,
      hasConfigToken,
      allowEnv,
      envValue: process.env.ZALO_BOT_TOKEN,
      envPrompt: "检测到 ZALO_BOT_TOKEN 环境变量。是否使用？",
      keepPrompt: "Zalo 令牌已配置。保留吗？",
      inputPrompt: "输入 Zalo 机器人令牌",
      preferredEnvVar: "ZALO_BOT_TOKEN",
      onMissingConfigured: async () => await noteZaloTokenHelp(prompter),
      applyUseEnv: async (cfg) =>
        zaloAccountId === DEFAULT_ACCOUNT_ID
          ? ({
              ...cfg,
              channels: {
                ...cfg.channels,
                zalo: {
                  ...cfg.channels?.zalo,
                  enabled: true,
                },
              },
            } as OpenClawConfig)
          : cfg,
      applySet: async (cfg, value) =>
        zaloAccountId === DEFAULT_ACCOUNT_ID
          ? ({
              ...cfg,
              channels: {
                ...cfg.channels,
                zalo: {
                  ...cfg.channels?.zalo,
                  enabled: true,
                  botToken: value,
                },
              },
            } as OpenClawConfig)
          : ({
              ...cfg,
              channels: {
                ...cfg.channels,
                zalo: {
                  ...cfg.channels?.zalo,
                  enabled: true,
                  accounts: {
                    ...cfg.channels?.zalo?.accounts,
                    [zaloAccountId]: {
                      ...cfg.channels?.zalo?.accounts?.[zaloAccountId],
                      enabled: true,
                      botToken: value,
                    },
                  },
                },
              },
            } as OpenClawConfig),
    });
    next = tokenStep.cfg;

    const wantsWebhook = await prompter.confirm({
      message: "对 Zalo 使用 webhook 模式？",
      initialValue: Boolean(resolvedAccount.config.webhookUrl),
    });
    if (wantsWebhook) {
      const webhookUrl = String(
        await prompter.text({
          message: "Webhook 地址（https://...）",
          initialValue: resolvedAccount.config.webhookUrl,
          validate: (value) =>
            value?.trim()?.startsWith("https://") ? undefined : "需要 HTTPS URL",
        }),
      ).trim();
      const defaultPath = (() => {
        try {
          return new URL(webhookUrl).pathname || "/zalo-webhook";
        } catch {
          return "/zalo-webhook";
        }
      })();
      let webhookSecretResult = await promptSingleChannelSecretInput({
        cfg: next,
        prompter,
        providerHint: "zalo-webhook",
        credentialLabel: "webhook secret",
        ...buildSingleChannelSecretPromptState({
          accountConfigured: hasConfiguredSecretInput(resolvedAccount.config.webhookSecret),
          hasConfigToken: hasConfiguredSecretInput(resolvedAccount.config.webhookSecret),
          allowEnv: false,
        }),
        envPrompt: "",
        keepPrompt: "Zalo webhook 密钥已配置。保留吗？",
        inputPrompt: "Webhook 密钥（8-256 个字符）",
        preferredEnvVar: "ZALO_WEBHOOK_SECRET",
      });
      while (
        webhookSecretResult.action === "set" &&
        typeof webhookSecretResult.value === "string" &&
        (webhookSecretResult.value.length < 8 || webhookSecretResult.value.length > 256)
      ) {
        await prompter.note("Webhook 密钥必须在8到28个字符之间。", "Zalo Webhook 配置");
        webhookSecretResult = await promptSingleChannelSecretInput({
          cfg: next,
          prompter,
          providerHint: "zalo-webhook",
          credentialLabel: "webhook secret",
          ...buildSingleChannelSecretPromptState({
            accountConfigured: false,
            hasConfigToken: false,
            allowEnv: false,
          }),
          envPrompt: "",
          keepPrompt: "Zalo webhook 密钥已配置。保留吗？",
          inputPrompt: "Webhook 密钥（8-256 个字符）",
          preferredEnvVar: "ZALO_WEBHOOK_SECRET",
        });
      }
      const webhookSecret =
        webhookSecretResult.action === "set"
          ? webhookSecretResult.value
          : resolvedAccount.config.webhookSecret;
      const webhookPath = String(
        await prompter.text({
          message: "Webhook 路径（可选）",
          initialValue: resolvedAccount.config.webhookPath ?? defaultPath,
        }),
      ).trim();
      next = setZaloUpdateMode(
        next,
        zaloAccountId,
        "webhook",
        webhookUrl,
        webhookSecret,
        webhookPath || undefined,
      );
    } else {
      next = setZaloUpdateMode(next, zaloAccountId, "polling");
    }

    if (forceAllowFrom) {
      next = await promptZaloAllowFrom({
        cfg: next,
        prompter,
        accountId: zaloAccountId,
      });
    }

    return { cfg: next, accountId: zaloAccountId };
  },
};
