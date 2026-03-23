import { resolveChannelDefaultAccountId } from "../../channels/plugins/helpers.js";
import {
  getChannelPlugin,
  listChannelPlugins,
  normalizeChannelId,
} from "../../channels/plugins/index.js";
import { type OpenClawConfig, writeConfigFile } from "../../config/config.js";
import { t } from "../../i18n/index.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../routing/session-key.js";
import { defaultRuntime, type RuntimeEnv } from "../../runtime.js";
import { createClackPrompter } from "../../wizard/clack-prompter.js";
import { type ChatChannel, channelLabel, requireValidConfig, shouldUseWizard } from "./shared.js";

export type ChannelsRemoveOptions = {
  channel?: string;
  account?: string;
  delete?: boolean;
};

function listAccountIds(cfg: OpenClawConfig, channel: ChatChannel): string[] {
  const plugin = getChannelPlugin(channel);
  if (!plugin) {
    return [];
  }
  return plugin.config.listAccountIds(cfg);
}

export async function channelsRemoveCommand(
  opts: ChannelsRemoveOptions,
  runtime: RuntimeEnv = defaultRuntime,
  params?: { hasFlags?: boolean },
) {
  const cfg = await requireValidConfig(runtime);
  if (!cfg) {
    return;
  }

  const useWizard = shouldUseWizard(params);
  const prompter = useWizard ? createClackPrompter() : null;
  let channel: ChatChannel | null = normalizeChannelId(opts.channel);
  let accountId = normalizeAccountId(opts.account);
  const deleteConfig = Boolean(opts.delete);

  if (useWizard && prompter) {
    await prompter.intro(t("commands.channelsRemove.removeChannelAccount"));
    const selectedChannel = await prompter.select({
      message: t("commands.channelsRemove.channel"),
      options: listChannelPlugins().map((plugin) => ({
        value: plugin.id,
        label: plugin.meta.label,
      })),
    });
    channel = selectedChannel;

    accountId = await (async () => {
      const ids = listAccountIds(cfg, selectedChannel);
      const choice = await prompter.select({
        message: t("commands.channelsRemove.account"),
        options: ids.map((id) => ({
          value: id,
          label: id === DEFAULT_ACCOUNT_ID ? t("commands.channelsRemove.defaultPrimary") : id,
        })),
        initialValue: ids[0] ?? DEFAULT_ACCOUNT_ID,
      });
      return normalizeAccountId(choice);
    })();

    const wantsDisable = await prompter.confirm({
      message: t("commands.channelsRemove.disableConfirm", { label: channelLabel(selectedChannel), accountId }),
      initialValue: true,
    });
    if (!wantsDisable) {
      await prompter.outro(t("commands.channelsRemove.cancelled"));
      return;
    }
  } else {
    if (!channel) {
      runtime.error(t("commands.channelsRemove.channelRequired"));
      runtime.exit(1);
      return;
    }
    if (!deleteConfig) {
      const confirm = createClackPrompter();
      const ok = await confirm.confirm({
        message: t("commands.channelsRemove.disableConfirm", { label: channelLabel(channel), accountId }),
        initialValue: true,
      });
      if (!ok) {
        return;
      }
    }
  }

  const plugin = getChannelPlugin(channel);
  if (!plugin) {
    runtime.error(t("commands.channelsRemove.unknownChannel", { channel }));
    runtime.exit(1);
    return;
  }

  const resolvedAccountId =
    normalizeAccountId(accountId) ?? resolveChannelDefaultAccountId({ plugin, cfg });
  const accountKey = resolvedAccountId || DEFAULT_ACCOUNT_ID;

  let next = { ...cfg };
  const prevCfg = cfg;
  if (deleteConfig) {
    if (!plugin.config.deleteAccount) {
      runtime.error(t("commands.channelsRemove.noSupportDelete", { channel }));
      runtime.exit(1);
      return;
    }
    next = plugin.config.deleteAccount({
      cfg: next,
      accountId: resolvedAccountId,
    });
    await plugin.lifecycle?.onAccountRemoved?.({
      prevCfg,
      accountId: resolvedAccountId,
      runtime,
    });
  } else {
    if (!plugin.config.setAccountEnabled) {
      runtime.error(t("commands.channelsRemove.noSupportDisable", { channel }));
      runtime.exit(1);
      return;
    }
    next = plugin.config.setAccountEnabled({
      cfg: next,
      accountId: resolvedAccountId,
      enabled: false,
    });
    await plugin.lifecycle?.onAccountConfigChanged?.({
      prevCfg,
      nextCfg: next,
      accountId: resolvedAccountId,
      runtime,
    });
  }

  await writeConfigFile(next);
  if (useWizard && prompter) {
    await prompter.outro(
      deleteConfig
        ? t("commands.channelsRemove.deleted", { label: channelLabel(channel), accountKey })
        : t("commands.channelsRemove.disabled", { label: channelLabel(channel), accountKey }),
    );
  } else {
    runtime.log(
      deleteConfig
        ? t("commands.channelsRemove.deleted", { label: channelLabel(channel), accountKey })
        : t("commands.channelsRemove.disabled", { label: channelLabel(channel), accountKey }),
    );
  }
}
