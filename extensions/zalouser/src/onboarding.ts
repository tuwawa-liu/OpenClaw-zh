import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  OpenClawConfig,
  WizardPrompter,
} from "openclaw/plugin-sdk/zalouser";
import {
  DEFAULT_ACCOUNT_ID,
  formatResolvedUnresolvedNote,
  mergeAllowFromEntries,
  normalizeAccountId,
  patchScopedAccountConfig,
  promptChannelAccessConfig,
  resolveAccountIdForConfigure,
  setTopLevelChannelDmPolicyWithAllowFrom,
} from "openclaw/plugin-sdk/zalouser";
import {
  listZalouserAccountIds,
  resolveDefaultZalouserAccountId,
  resolveZalouserAccountSync,
  checkZcaAuthenticated,
} from "./accounts.js";
import { writeQrDataUrlToTempFile } from "./qr-temp-file.js";
import {
  logoutZaloProfile,
  resolveZaloAllowFromEntries,
  resolveZaloGroupsByEntries,
  startZaloQrLogin,
  waitForZaloQrLogin,
} from "./zalo-js.js";

const channel = "zalouser" as const;

function setZalouserAccountScopedConfig(
  cfg: OpenClawConfig,
  accountId: string,
  defaultPatch: Record<string, unknown>,
  accountPatch: Record<string, unknown> = defaultPatch,
): OpenClawConfig {
  return patchScopedAccountConfig({
    cfg,
    channelKey: channel,
    accountId,
    patch: defaultPatch,
    accountPatch,
  }) as OpenClawConfig;
}

function setZalouserDmPolicy(
  cfg: OpenClawConfig,
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled",
): OpenClawConfig {
  return setTopLevelChannelDmPolicyWithAllowFrom({
    cfg,
    channel: "zalouser",
    dmPolicy,
  }) as OpenClawConfig;
}

async function noteZalouserHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "Zalo 个人账户通过二维码登录。",
      "",
      "此插件直接使用 zca-js（无外部 CLI 依赖）。",
      "",
      "文档：https://docs.openclaw.ai/channels/zalouser",
    ].join("\n"),
    "Zalo 个人版设置",
  );
}

async function promptZalouserAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<OpenClawConfig> {
  const { cfg, prompter, accountId } = params;
  const resolved = resolveZalouserAccountSync({ cfg, accountId });
  const existingAllowFrom = resolved.config.allowFrom ?? [];
  const parseInput = (raw: string) =>
    raw
      .split(/[\n,;]+/g)
      .map((entry) => entry.trim())
      .filter(Boolean);

  while (true) {
    const entry = await prompter.text({
      message: "Zalouser allowFrom（名称或用户 ID）",
      placeholder: "Alice, 123456789",
      initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });
    const parts = parseInput(String(entry));
    const resolvedEntries = await resolveZaloAllowFromEntries({
      profile: resolved.profile,
      entries: parts,
    });

    const unresolved = resolvedEntries.filter((item) => !item.resolved).map((item) => item.input);
    if (unresolved.length > 0) {
      await prompter.note(
        `无法解析：${unresolved.join(", ")}。请使用数字用户 ID 或精确的好友名称。`,
        "Zalo 个人版白名单",
      );
      continue;
    }

    const resolvedIds = resolvedEntries
      .filter((item) => item.resolved && item.id)
      .map((item) => item.id as string);
    const unique = mergeAllowFromEntries(existingAllowFrom, resolvedIds);

    const notes = resolvedEntries
      .filter((item) => item.note)
      .map((item) => `${item.input} -> ${item.id} (${item.note})`);
    if (notes.length > 0) {
      await prompter.note(notes.join("\n"), "Zalo 个人版白名单");
    }

    return setZalouserAccountScopedConfig(cfg, accountId, {
      dmPolicy: "allowlist",
      allowFrom: unique,
    });
  }
}

function setZalouserGroupPolicy(
  cfg: OpenClawConfig,
  accountId: string,
  groupPolicy: "open" | "allowlist" | "disabled",
): OpenClawConfig {
  return setZalouserAccountScopedConfig(cfg, accountId, {
    groupPolicy,
  });
}

function setZalouserGroupAllowlist(
  cfg: OpenClawConfig,
  accountId: string,
  groupKeys: string[],
): OpenClawConfig {
  const groups = Object.fromEntries(groupKeys.map((key) => [key, { allow: true }]));
  return setZalouserAccountScopedConfig(cfg, accountId, {
    groups,
  });
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Zalo 个人版",
  channel,
  policyKey: "channels.zalouser.dmPolicy",
  allowFromKey: "channels.zalouser.allowFrom",
  getCurrent: (cfg) => (cfg.channels?.zalouser?.dmPolicy ?? "pairing") as "pairing",
  setPolicy: (cfg, policy) => setZalouserDmPolicy(cfg, policy),
  promptAllowFrom: async ({ cfg, prompter, accountId }) => {
    const id =
      accountId && normalizeAccountId(accountId)
        ? (normalizeAccountId(accountId) ?? DEFAULT_ACCOUNT_ID)
        : resolveDefaultZalouserAccountId(cfg);
    return promptZalouserAllowFrom({
      cfg,
      prompter,
      accountId: id,
    });
  },
};

export const zalouserOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  dmPolicy,
  getStatus: async ({ cfg }) => {
    const ids = listZalouserAccountIds(cfg);
    let configured = false;
    for (const accountId of ids) {
      const account = resolveZalouserAccountSync({ cfg, accountId });
      const isAuth = await checkZcaAuthenticated(account.profile);
      if (isAuth) {
        configured = true;
        break;
      }
    }
    return {
      channel,
      configured,
      statusLines: [`Zalo 个人版：${configured ? "已登录" : "需要二维码登录"}`],
      selectionHint: configured ? "推荐 · 已登录" : "推荐 · 二维码登录",
      quickstartScore: configured ? 1 : 15,
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    const defaultAccountId = resolveDefaultZalouserAccountId(cfg);
    const accountId = await resolveAccountIdForConfigure({
      cfg,
      prompter,
      label: "Zalo 个人版",
      accountOverride: accountOverrides.zalouser,
      shouldPromptAccountIds,
      listAccountIds: listZalouserAccountIds,
      defaultAccountId,
    });

    let next = cfg;
    const account = resolveZalouserAccountSync({ cfg: next, accountId });
    const alreadyAuthenticated = await checkZcaAuthenticated(account.profile);

    if (!alreadyAuthenticated) {
      await noteZalouserHelp(prompter);

      const wantsLogin = await prompter.confirm({
        message: "现在通过二维码登录？",
        initialValue: true,
      });

      if (wantsLogin) {
        const start = await startZaloQrLogin({ profile: account.profile, timeoutMs: 35_000 });
        if (start.qrDataUrl) {
          const qrPath = await writeQrDataUrlToTempFile(start.qrDataUrl, account.profile);
          await prompter.note(
            [
              start.message,
              qrPath
                ? `二维码图片已保存到：${qrPath}`
                : "无法写入二维码图片文件；请使用网关 Web 登录界面。",
              "在手机上扫描并确认，然后继续。",
            ].join("\n"),
            "二维码登录",
          );
          const scanned = await prompter.confirm({
            message: "你是否已在手机上扫描并确认二维码？",
            initialValue: true,
          });
          if (scanned) {
            const waited = await waitForZaloQrLogin({
              profile: account.profile,
              timeoutMs: 120_000,
            });
            await prompter.note(waited.message, waited.connected ? "成功" : "登录等待中");
          }
        } else {
          await prompter.note(start.message, "登录等待中");
        }
      }
    } else {
      const keepSession = await prompter.confirm({
        message: "Zalo 个人版已登录。保留会话吗？",
        initialValue: true,
      });
      if (!keepSession) {
        await logoutZaloProfile(account.profile);
        const start = await startZaloQrLogin({
          profile: account.profile,
          force: true,
          timeoutMs: 35_000,
        });
        if (start.qrDataUrl) {
          const qrPath = await writeQrDataUrlToTempFile(start.qrDataUrl, account.profile);
          await prompter.note(
            [start.message, qrPath ? `二维码图片已保存到：${qrPath}` : undefined]
              .filter(Boolean)
              .join("\n"),
            "二维码登录",
          );
          const waited = await waitForZaloQrLogin({ profile: account.profile, timeoutMs: 120_000 });
          await prompter.note(waited.message, waited.connected ? "成功" : "登录等待中");
        }
      }
    }

    next = setZalouserAccountScopedConfig(
      next,
      accountId,
      { profile: account.profile !== "default" ? account.profile : undefined },
      { profile: account.profile, enabled: true },
    );

    if (forceAllowFrom) {
      next = await promptZalouserAllowFrom({
        cfg: next,
        prompter,
        accountId,
      });
    }

    const updatedAccount = resolveZalouserAccountSync({ cfg: next, accountId });
    const accessConfig = await promptChannelAccessConfig({
      prompter,
      label: "Zalo 群组",
      currentPolicy: updatedAccount.config.groupPolicy ?? "allowlist",
      currentEntries: Object.keys(updatedAccount.config.groups ?? {}),
      placeholder: "Family, Work, 123456789",
      updatePrompt: Boolean(updatedAccount.config.groups),
    });

    if (accessConfig) {
      if (accessConfig.policy !== "allowlist") {
        next = setZalouserGroupPolicy(next, accountId, accessConfig.policy);
      } else {
        let keys = accessConfig.entries;
        if (accessConfig.entries.length > 0) {
          try {
            const resolved = await resolveZaloGroupsByEntries({
              profile: updatedAccount.profile,
              entries: accessConfig.entries,
            });
            const resolvedIds = resolved
              .filter((entry) => entry.resolved && entry.id)
              .map((entry) => entry.id as string);
            const unresolved = resolved
              .filter((entry) => !entry.resolved)
              .map((entry) => entry.input);
            keys = [...resolvedIds, ...unresolved.map((entry) => entry.trim()).filter(Boolean)];
            const resolution = formatResolvedUnresolvedNote({
              resolved: resolvedIds,
              unresolved,
            });
            if (resolution) {
              await prompter.note(resolution, "Zalo 群组");
            }
          } catch (err) {
            await prompter.note(
              `Group lookup failed; keeping entries as typed. ${String(err)}`,
              "Zalo 群组",
            );
          }
        }
        next = setZalouserGroupPolicy(next, accountId, "allowlist");
        next = setZalouserGroupAllowlist(next, accountId, keys);
      }
    }

    return { cfg: next, accountId };
  },
};
