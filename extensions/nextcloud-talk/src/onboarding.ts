import {
  formatDocsLink,
  hasConfiguredSecretInput,
  mapAllowFromEntries,
  mergeAllowFromEntries,
  patchScopedAccountConfig,
  runSingleChannelSecretStep,
  resolveAccountIdForConfigure,
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  setTopLevelChannelDmPolicyWithAllowFrom,
  type ChannelOnboardingAdapter,
  type ChannelOnboardingDmPolicy,
  type OpenClawConfig,
  type WizardPrompter,
} from "openclaw/plugin-sdk/nextcloud-talk";
import {
  listNextcloudTalkAccountIds,
  resolveDefaultNextcloudTalkAccountId,
  resolveNextcloudTalkAccount,
} from "./accounts.js";
import type { CoreConfig, DmPolicy } from "./types.js";

const channel = "nextcloud-talk" as const;

function setNextcloudTalkDmPolicy(cfg: CoreConfig, dmPolicy: DmPolicy): CoreConfig {
  return setTopLevelChannelDmPolicyWithAllowFrom({
    cfg,
    channel: "nextcloud-talk",
    dmPolicy,
    getAllowFrom: (inputCfg) =>
      mapAllowFromEntries(inputCfg.channels?.["nextcloud-talk"]?.allowFrom),
  }) as CoreConfig;
}

function setNextcloudTalkAccountConfig(
  cfg: CoreConfig,
  accountId: string,
  updates: Record<string, unknown>,
): CoreConfig {
  return patchScopedAccountConfig({
    cfg,
    channelKey: channel,
    accountId,
    patch: updates,
  }) as CoreConfig;
}

async function noteNextcloudTalkSecretHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) SSH 登录到你的 Nextcloud 服务器",
      '2) 运行：./occ talk:bot:install "OpenClaw" "<shared-secret>" "<webhook-url>" --feature reaction',
      "3) 复制你在命令中使用的共享密钥",
      "4) 在 Nextcloud Talk 房间设置中启用机器人",
      "提示：你也可以在环境变量中设置 NEXTCLOUD_TALK_BOT_SECRET。",
      `Docs: ${formatDocsLink("/channels/nextcloud-talk", "channels/nextcloud-talk")}`,
    ].join("\n"),
    "Nextcloud Talk 机器人设置",
  );
}

async function noteNextcloudTalkUserIdHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) 在 Nextcloud 管理面板中查看用户 ID",
      "2) Or look at the webhook payload logs when someone messages",
      "3) 用户 ID 通常是 Nextcloud 中的小写用户名",
      `Docs: ${formatDocsLink("/channels/nextcloud-talk", "channels/nextcloud-talk")}`,
    ].join("\n"),
    "Nextcloud Talk 用户 ID",
  );
}

async function promptNextcloudTalkAllowFrom(params: {
  cfg: CoreConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<CoreConfig> {
  const { cfg, prompter, accountId } = params;
  const resolved = resolveNextcloudTalkAccount({ cfg, accountId });
  const existingAllowFrom = resolved.config.allowFrom ?? [];
  await noteNextcloudTalkUserIdHelp(prompter);

  const parseInput = (value: string) =>
    value
      .split(/[\n,;]+/g)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);

  let resolvedIds: string[] = [];
  while (resolvedIds.length === 0) {
    const entry = await prompter.text({
      message: "Nextcloud Talk allowFrom（用户 ID）",
      placeholder: "username",
      initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });
    resolvedIds = parseInput(String(entry));
    if (resolvedIds.length === 0) {
      await prompter.note("请至少输入一个有效的用户 ID。", "Nextcloud Talk 白名单");
    }
  }

  const merged = [
    ...existingAllowFrom.map((item) => String(item).trim().toLowerCase()).filter(Boolean),
    ...resolvedIds,
  ];
  const unique = mergeAllowFromEntries(undefined, merged);

  return setNextcloudTalkAccountConfig(cfg, accountId, {
    dmPolicy: "allowlist",
    allowFrom: unique,
  });
}

async function promptNextcloudTalkAllowFromForAccount(params: {
  cfg: CoreConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<CoreConfig> {
  const accountId =
    params.accountId && normalizeAccountId(params.accountId)
      ? (normalizeAccountId(params.accountId) ?? DEFAULT_ACCOUNT_ID)
      : resolveDefaultNextcloudTalkAccountId(params.cfg);
  return promptNextcloudTalkAllowFrom({
    cfg: params.cfg,
    prompter: params.prompter,
    accountId,
  });
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Nextcloud Talk 频道",
  channel,
  policyKey: "channels.nextcloud-talk.dmPolicy",
  allowFromKey: "channels.nextcloud-talk.allowFrom",
  getCurrent: (cfg) => cfg.channels?.["nextcloud-talk"]?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setNextcloudTalkDmPolicy(cfg as CoreConfig, policy as DmPolicy),
  promptAllowFrom: promptNextcloudTalkAllowFromForAccount as (params: {
    cfg: OpenClawConfig;
    prompter: WizardPrompter;
    accountId?: string | undefined;
  }) => Promise<OpenClawConfig>,
};

export const nextcloudTalkOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = listNextcloudTalkAccountIds(cfg as CoreConfig).some((accountId) => {
      const account = resolveNextcloudTalkAccount({ cfg: cfg as CoreConfig, accountId });
      return Boolean(account.secret && account.baseUrl);
    });
    return {
      channel,
      configured,
      statusLines: [`Nextcloud Talk：${configured ? "已配置" : "需要设置"}`],
      selectionHint: configured ? "已配置" : "自托管聊天",
      quickstartScore: configured ? 1 : 5,
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    const defaultAccountId = resolveDefaultNextcloudTalkAccountId(cfg as CoreConfig);
    const accountId = await resolveAccountIdForConfigure({
      cfg,
      prompter,
      label: "Nextcloud Talk 频道",
      accountOverride: accountOverrides["nextcloud-talk"],
      shouldPromptAccountIds,
      listAccountIds: listNextcloudTalkAccountIds as (cfg: OpenClawConfig) => string[],
      defaultAccountId,
    });

    let next = cfg as CoreConfig;
    const resolvedAccount = resolveNextcloudTalkAccount({
      cfg: next,
      accountId,
    });
    const accountConfigured = Boolean(resolvedAccount.secret && resolvedAccount.baseUrl);
    const allowEnv = accountId === DEFAULT_ACCOUNT_ID;
    const hasConfigSecret = Boolean(
      hasConfiguredSecretInput(resolvedAccount.config.botSecret) ||
      resolvedAccount.config.botSecretFile,
    );

    let baseUrl = resolvedAccount.baseUrl;
    if (!baseUrl) {
      baseUrl = String(
        await prompter.text({
          message: "输入 Nextcloud 实例 URL（例如 https://cloud.example.com）",
          validate: (value) => {
            const v = String(value ?? "").trim();
            if (!v) {
              return "必填";
            }
            if (!v.startsWith("http://") && !v.startsWith("https://")) {
              return "URL 必须以 http:// 或 https:// 开头";
            }
            return undefined;
          },
        }),
      ).trim();
    }

    const secretStep = await runSingleChannelSecretStep({
      cfg: next,
      prompter,
      providerHint: "nextcloud-talk",
      credentialLabel: "bot secret",
      accountConfigured,
      hasConfigToken: hasConfigSecret,
      allowEnv,
      envValue: process.env.NEXTCLOUD_TALK_BOT_SECRET,
      envPrompt: "检测到 NEXTCLOUD_TALK_BOT_SECRET 环境变量。是否使用？",
      keepPrompt: "Nextcloud Talk 机器人密钥已配置。保留吗？",
      inputPrompt: "输入 Nextcloud Talk 机器人密钥",
      preferredEnvVar: "NEXTCLOUD_TALK_BOT_SECRET",
      onMissingConfigured: async () => await noteNextcloudTalkSecretHelp(prompter),
      applyUseEnv: async (cfg) =>
        setNextcloudTalkAccountConfig(cfg as CoreConfig, accountId, {
          baseUrl,
        }),
      applySet: async (cfg, value) =>
        setNextcloudTalkAccountConfig(cfg as CoreConfig, accountId, {
          baseUrl,
          botSecret: value,
        }),
    });
    next = secretStep.cfg as CoreConfig;

    if (secretStep.action === "keep" && baseUrl !== resolvedAccount.baseUrl) {
      next = setNextcloudTalkAccountConfig(next, accountId, {
        baseUrl,
      });
    }

    const existingApiUser = resolvedAccount.config.apiUser?.trim();
    const existingApiPasswordConfigured = Boolean(
      hasConfiguredSecretInput(resolvedAccount.config.apiPassword) ||
      resolvedAccount.config.apiPasswordFile,
    );
    const configureApiCredentials = await prompter.confirm({
      message: "配置可选的 Nextcloud Talk API 凭据以进行房间查找？",
      initialValue: Boolean(existingApiUser && existingApiPasswordConfigured),
    });
    if (configureApiCredentials) {
      const apiUser = String(
        await prompter.text({
          message: "Nextcloud Talk API 用户",
          initialValue: existingApiUser,
          validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
        }),
      ).trim();
      const apiPasswordStep = await runSingleChannelSecretStep({
        cfg: next,
        prompter,
        providerHint: "nextcloud-talk-api",
        credentialLabel: "API password",
        accountConfigured: Boolean(existingApiUser && existingApiPasswordConfigured),
        hasConfigToken: existingApiPasswordConfigured,
        allowEnv: false,
        envPrompt: "",
        keepPrompt: "Nextcloud Talk API 密码已配置。保留吗？",
        inputPrompt: "输入 Nextcloud Talk API 密码",
        preferredEnvVar: "NEXTCLOUD_TALK_API_PASSWORD",
        applySet: async (cfg, value) =>
          setNextcloudTalkAccountConfig(cfg as CoreConfig, accountId, {
            apiUser,
            apiPassword: value,
          }),
      });
      next =
        apiPasswordStep.action === "keep"
          ? setNextcloudTalkAccountConfig(next, accountId, { apiUser })
          : (apiPasswordStep.cfg as CoreConfig);
    }

    if (forceAllowFrom) {
      next = await promptNextcloudTalkAllowFrom({
        cfg: next,
        prompter,
        accountId,
      });
    }

    return { cfg: next, accountId };
  },
  dmPolicy,
  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      "nextcloud-talk": { ...cfg.channels?.["nextcloud-talk"], enabled: false },
    },
  }),
};
