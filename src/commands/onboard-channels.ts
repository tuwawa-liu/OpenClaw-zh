import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { listChannelPluginCatalogEntries } from "../channels/plugins/catalog.js";
import { resolveChannelDefaultAccountId } from "../channels/plugins/helpers.js";
import {
  getChannelSetupPlugin,
  listChannelSetupPlugins,
} from "../channels/plugins/setup-registry.js";
import type { ChannelMeta, ChannelPlugin } from "../channels/plugins/types.js";
import {
  formatChannelPrimerLine,
  formatChannelSelectionLine,
  listChatChannels,
} from "../channels/registry.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import { isChannelConfigured } from "../config/plugin-auto-enable.js";
import type { DmPolicy } from "../config/types.js";
import { t } from "../i18n/index.js";
import { enablePluginInConfig } from "../plugins/enable.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";
import type { RuntimeEnv } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import type { WizardPrompter, WizardSelectOption } from "../wizard/prompts.js";
import type { ChannelChoice } from "./onboard-types.js";
import {
  ensureOnboardingPluginInstalled,
  loadOnboardingPluginRegistrySnapshotForChannel,
} from "./onboarding/plugin-install.js";
import {
  getChannelOnboardingAdapter,
  listChannelOnboardingAdapters,
} from "./onboarding/registry.js";
import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingConfiguredResult,
  ChannelOnboardingDmPolicy,
  ChannelOnboardingResult,
  ChannelOnboardingStatus,
  SetupChannelsOptions,
} from "./onboarding/types.js";

type ConfiguredChannelAction = "update" | "disable" | "delete" | "skip";

type ChannelStatusSummary = {
  installedPlugins: ReturnType<typeof listChannelSetupPlugins>;
  catalogEntries: ReturnType<typeof listChannelPluginCatalogEntries>;
  statusByChannel: Map<ChannelChoice, ChannelOnboardingStatus>;
  statusLines: string[];
};

function formatAccountLabel(accountId: string): string {
  return accountId === DEFAULT_ACCOUNT_ID ? t("commands.channels.defaultAccount") : accountId;
}

async function promptConfiguredAction(params: {
  prompter: WizardPrompter;
  label: string;
  supportsDisable: boolean;
  supportsDelete: boolean;
}): Promise<ConfiguredChannelAction> {
  const { prompter, label, supportsDisable, supportsDelete } = params;
  const updateOption: WizardSelectOption<ConfiguredChannelAction> = {
    value: "update",
    label: t("commands.channels.modifyLabel"),
  };
  const disableOption: WizardSelectOption<ConfiguredChannelAction> = {
    value: "disable",
    label: t("commands.channels.disableLabel"),
  };
  const deleteOption: WizardSelectOption<ConfiguredChannelAction> = {
    value: "delete",
    label: t("commands.channels.deleteLabel"),
  };
  const skipOption: WizardSelectOption<ConfiguredChannelAction> = {
    value: "skip",
    label: t("commands.channels.skipLabel"),
  };
  const options: Array<WizardSelectOption<ConfiguredChannelAction>> = [
    updateOption,
    ...(supportsDisable ? [disableOption] : []),
    ...(supportsDelete ? [deleteOption] : []),
    skipOption,
  ];
  return await prompter.select({
    message: t("commands.channels.alreadyConfigured", { label }),
    options,
    initialValue: "update",
  });
}

async function promptRemovalAccountId(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  label: string;
  channel: ChannelChoice;
  plugin?: ChannelPlugin;
}): Promise<string> {
  const { cfg, prompter, label, channel } = params;
  const plugin = params.plugin ?? getChannelSetupPlugin(channel);
  if (!plugin) {
    return DEFAULT_ACCOUNT_ID;
  }
  const accountIds = plugin.config.listAccountIds(cfg).filter(Boolean);
  const defaultAccountId = resolveChannelDefaultAccountId({ plugin, cfg, accountIds });
  if (accountIds.length <= 1) {
    return defaultAccountId;
  }
  const selected = await prompter.select({
    message: t("commands.channels.accountSelect", { label }),
    options: accountIds.map((accountId) => ({
      value: accountId,
      label: formatAccountLabel(accountId),
    })),
    initialValue: defaultAccountId,
  });
  return normalizeAccountId(selected) ?? defaultAccountId;
}

async function collectChannelStatus(params: {
  cfg: OpenClawConfig;
  options?: SetupChannelsOptions;
  accountOverrides: Partial<Record<ChannelChoice, string>>;
  installedPlugins?: ReturnType<typeof listChannelSetupPlugins>;
}): Promise<ChannelStatusSummary> {
  const installedPlugins = params.installedPlugins ?? listChannelSetupPlugins();
  const installedIds = new Set(installedPlugins.map((plugin) => plugin.id));
  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, resolveDefaultAgentId(params.cfg));
  const catalogEntries = listChannelPluginCatalogEntries({ workspaceDir }).filter(
    (entry) => !installedIds.has(entry.id),
  );
  const statusEntries = await Promise.all(
    listChannelOnboardingAdapters().map((adapter) =>
      adapter.getStatus({
        cfg: params.cfg,
        options: params.options,
        accountOverrides: params.accountOverrides,
      }),
    ),
  );
  const statusByChannel = new Map(statusEntries.map((entry) => [entry.channel, entry]));
  const fallbackStatuses = listChatChannels()
    .filter((meta) => !statusByChannel.has(meta.id))
    .map((meta) => {
      const configured = isChannelConfigured(params.cfg, meta.id);
      const statusLabel = configured ? t("onboardChannels.configuredPluginDisabled") : t("onboardChannels.notConfigured");
      return {
        channel: meta.id,
        configured,
        statusLines: [`${meta.label}: ${statusLabel}`],
        selectionHint: configured ? t("onboardChannels.configuredPluginDisabledHint") : t("onboardChannels.notConfigured"),
        quickstartScore: 0,
      };
    });
  const catalogStatuses = catalogEntries.map((entry) => ({
    channel: entry.id,
    configured: false,
    statusLines: [`${entry.meta.label}: ${t("onboardChannels.installPluginToEnable")}`],
    selectionHint: t("onboardChannels.pluginInstallHint"),
    quickstartScore: 0,
  }));
  const combinedStatuses = [...statusEntries, ...fallbackStatuses, ...catalogStatuses];
  const mergedStatusByChannel = new Map(combinedStatuses.map((entry) => [entry.channel, entry]));
  const statusLines = combinedStatuses.flatMap((entry) => entry.statusLines);
  return {
    installedPlugins,
    catalogEntries,
    statusByChannel: mergedStatusByChannel,
    statusLines,
  };
}

export async function noteChannelStatus(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  options?: SetupChannelsOptions;
  accountOverrides?: Partial<Record<ChannelChoice, string>>;
}): Promise<void> {
  const { statusLines } = await collectChannelStatus({
    cfg: params.cfg,
    options: params.options,
    accountOverrides: params.accountOverrides ?? {},
  });
  if (statusLines.length > 0) {
    await params.prompter.note(statusLines.join("\n"), t("commands.channels.channelStatusTitle"));
  }
}

async function noteChannelPrimer(
  prompter: WizardPrompter,
  channels: Array<{ id: ChannelChoice; blurb: string; label: string }>,
): Promise<void> {
  const channelLines = channels.map((channel) =>
    formatChannelPrimerLine({
      id: channel.id,
      label: channel.label,
      selectionLabel: channel.label,
      docsPath: "/",
      blurb: channel.blurb,
    }),
  );
  await prompter.note(
    [
      t("onboardChannels.dmSecurityDefault"),
      t("onboardChannels.dmSecurityApprove", { cmd: formatCliCommand("openclaw pairing approve <channel> <code>") }),
      t("onboardChannels.dmSecurityPublic"),
      t("onboardChannels.dmSecurityMultiUser", { cmd: formatCliCommand('openclaw config set session.dmScope "per-channel-peer"') }) +
        t("onboardChannels.dmSecurityMultiUserSuffix"),
      t("onboardChannels.dmSecurityDocs", { link: formatDocsLink("/channels/pairing", "channels/pairing") }),
      "",
      ...channelLines,
    ].join("\n"),
    t("commands.channels.dmSecurityTitle"),
  );
}

function resolveQuickstartDefault(
  statusByChannel: Map<ChannelChoice, { quickstartScore?: number }>,
): ChannelChoice | undefined {
  let best: { channel: ChannelChoice; score: number } | null = null;
  for (const [channel, status] of statusByChannel) {
    if (status.quickstartScore == null) {
      continue;
    }
    if (!best || status.quickstartScore > best.score) {
      best = { channel, score: status.quickstartScore };
    }
  }
  return best?.channel;
}

async function maybeConfigureDmPolicies(params: {
  cfg: OpenClawConfig;
  selection: ChannelChoice[];
  prompter: WizardPrompter;
  accountIdsByChannel?: Map<ChannelChoice, string>;
  resolveAdapter?: (channel: ChannelChoice) => ChannelOnboardingAdapter | undefined;
}): Promise<OpenClawConfig> {
  const { selection, prompter, accountIdsByChannel } = params;
  const resolve = params.resolveAdapter ?? getChannelOnboardingAdapter;
  const dmPolicies = selection
    .map((channel) => resolve(channel)?.dmPolicy)
    .filter(Boolean) as ChannelOnboardingDmPolicy[];
  if (dmPolicies.length === 0) {
    return params.cfg;
  }

  const wants = await prompter.confirm({
    message: t("commands.channels.configureDmConfirm"),
    initialValue: false,
  });
  if (!wants) {
    return params.cfg;
  }

  let cfg = params.cfg;
  const selectPolicy = async (policy: ChannelOnboardingDmPolicy) => {
    await prompter.note(
      [
        t("onboardChannels.dmPolicyDefault"),
        t("onboardChannels.dmPolicyApprove", { cmd: formatCliCommand(`openclaw pairing approve ${policy.channel} <code>`) }),
        t("onboardChannels.dmPolicyAllowlist", { policyKey: policy.policyKey, allowFromKey: policy.allowFromKey }),
        t("onboardChannels.dmPolicyPublic", { policyKey: policy.policyKey, allowFromKey: policy.allowFromKey }),
        t("onboardChannels.dmPolicyMultiUser", { cmd: formatCliCommand('openclaw config set session.dmScope "per-channel-peer"') }) +
          t("onboardChannels.dmPolicyMultiUserSuffix"),
        t("onboardChannels.dmPolicyDocs", { link: formatDocsLink("/channels/pairing", "channels/pairing") }),
      ].join("\n"),
      t("onboardChannels.dmAccessTitle", { label: policy.label }),
    );
    return (await prompter.select({
      message: t("commands.channels.dmPolicyMsg", { label: policy.label }),
      options: [
        { value: "pairing", label: t("commands.channels.pairingLabel") },
        { value: "allowlist", label: t("commands.channels.allowlistLabel") },
        { value: "open", label: t("commands.channels.openLabel") },
        { value: "disabled", label: t("commands.channels.disabledLabel") },
      ],
    })) as DmPolicy;
  };

  for (const policy of dmPolicies) {
    const current = policy.getCurrent(cfg);
    const nextPolicy = await selectPolicy(policy);
    if (nextPolicy !== current) {
      cfg = policy.setPolicy(cfg, nextPolicy);
    }
    if (nextPolicy === "allowlist" && policy.promptAllowFrom) {
      cfg = await policy.promptAllowFrom({
        cfg,
        prompter,
        accountId: accountIdsByChannel?.get(policy.channel),
      });
    }
  }

  return cfg;
}

// Channel-specific prompts moved into onboarding adapters.

export async function setupChannels(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
  options?: SetupChannelsOptions,
): Promise<OpenClawConfig> {
  let next = cfg;
  const forceAllowFromChannels = new Set(options?.forceAllowFromChannels ?? []);
  const accountOverrides: Partial<Record<ChannelChoice, string>> = {
    ...options?.accountIds,
  };
  const scopedPluginsById = new Map<ChannelChoice, ChannelPlugin>();
  const resolveWorkspaceDir = () => resolveAgentWorkspaceDir(next, resolveDefaultAgentId(next));
  const rememberScopedPlugin = (plugin: ChannelPlugin) => {
    const channel = plugin.id;
    scopedPluginsById.set(channel, plugin);
    options?.onResolvedPlugin?.(channel, plugin);
  };
  const getVisibleChannelPlugin = (channel: ChannelChoice): ChannelPlugin | undefined =>
    scopedPluginsById.get(channel) ?? getChannelSetupPlugin(channel);
  const listVisibleInstalledPlugins = (): ChannelPlugin[] => {
    const merged = new Map<string, ChannelPlugin>();
    for (const plugin of listChannelSetupPlugins()) {
      merged.set(plugin.id, plugin);
    }
    for (const plugin of scopedPluginsById.values()) {
      merged.set(plugin.id, plugin);
    }
    return Array.from(merged.values());
  };
  const loadScopedChannelPlugin = (
    channel: ChannelChoice,
    pluginId?: string,
  ): ChannelPlugin | undefined => {
    const existing = getVisibleChannelPlugin(channel);
    if (existing) {
      return existing;
    }
    const snapshot = loadOnboardingPluginRegistrySnapshotForChannel({
      cfg: next,
      runtime,
      channel,
      ...(pluginId ? { pluginId } : {}),
      workspaceDir: resolveWorkspaceDir(),
    });
    const plugin = snapshot.channels.find((entry) => entry.plugin.id === channel)?.plugin;
    if (plugin) {
      rememberScopedPlugin(plugin);
    }
    return plugin;
  };
  const getVisibleOnboardingAdapter = (channel: ChannelChoice) => {
    const adapter = getChannelOnboardingAdapter(channel);
    if (adapter) {
      return adapter;
    }
    return scopedPluginsById.get(channel)?.onboarding;
  };
  const preloadConfiguredExternalPlugins = () => {
    // Keep onboarding memory bounded by snapshot-loading only configured external plugins.
    const workspaceDir = resolveWorkspaceDir();
    for (const entry of listChannelPluginCatalogEntries({ workspaceDir })) {
      const channel = entry.id as ChannelChoice;
      if (getVisibleChannelPlugin(channel)) {
        continue;
      }
      const explicitlyEnabled =
        next.plugins?.entries?.[entry.pluginId ?? channel]?.enabled === true;
      if (!explicitlyEnabled && !isChannelConfigured(next, channel)) {
        continue;
      }
      loadScopedChannelPlugin(channel, entry.pluginId);
    }
  };
  if (options?.whatsappAccountId?.trim()) {
    accountOverrides.whatsapp = options.whatsappAccountId.trim();
  }
  preloadConfiguredExternalPlugins();

  const { installedPlugins, catalogEntries, statusByChannel, statusLines } =
    await collectChannelStatus({
      cfg: next,
      options,
      accountOverrides,
      installedPlugins: listVisibleInstalledPlugins(),
    });
  if (!options?.skipStatusNote && statusLines.length > 0) {
    await prompter.note(statusLines.join("\n"), t("commands.channels.channelStatusTitle"));
  }

  const shouldConfigure = options?.skipConfirm
    ? true
    : await prompter.confirm({
        message: t("commands.channels.configureChatsConfirm"),
        initialValue: true,
      });
  if (!shouldConfigure) {
    return cfg;
  }

  const corePrimer = listChatChannels().map((meta) => ({
    id: meta.id,
    label: meta.label,
    blurb: meta.blurb,
  }));
  const coreIds = new Set(corePrimer.map((entry) => entry.id));
  const primerChannels = [
    ...corePrimer,
    ...installedPlugins
      .filter((plugin) => !coreIds.has(plugin.id))
      .map((plugin) => ({
        id: plugin.id,
        label: plugin.meta.label,
        blurb: plugin.meta.blurb,
      })),
    ...catalogEntries
      .filter((entry) => !coreIds.has(entry.id as ChannelChoice))
      .map((entry) => ({
        id: entry.id as ChannelChoice,
        label: entry.meta.label,
        blurb: entry.meta.blurb,
      })),
  ];
  await noteChannelPrimer(prompter, primerChannels);

  const quickstartDefault =
    options?.initialSelection?.[0] ?? resolveQuickstartDefault(statusByChannel);

  const shouldPromptAccountIds = options?.promptAccountIds === true;
  const accountIdsByChannel = new Map<ChannelChoice, string>();
  const recordAccount = (channel: ChannelChoice, accountId: string) => {
    options?.onAccountId?.(channel, accountId);
    const adapter = getVisibleOnboardingAdapter(channel);
    adapter?.onAccountRecorded?.(accountId, options);
    accountIdsByChannel.set(channel, accountId);
  };

  const selection: ChannelChoice[] = [];
  const addSelection = (channel: ChannelChoice) => {
    if (!selection.includes(channel)) {
      selection.push(channel);
    }
  };

  const resolveDisabledHint = (channel: ChannelChoice): string | undefined => {
    if (
      typeof (next.channels as Record<string, { enabled?: boolean }> | undefined)?.[channel]
        ?.enabled === "boolean"
    ) {
      return (next.channels as Record<string, { enabled?: boolean }>)[channel]?.enabled === false
        ? "disabled"
        : undefined;
    }
    const plugin = getVisibleChannelPlugin(channel);
    if (!plugin) {
      if (next.plugins?.entries?.[channel]?.enabled === false) {
        return t("onboardChannels.pluginDisabled");
      }
      if (next.plugins?.enabled === false) {
        return t("onboardChannels.pluginsDisabled");
      }
      return undefined;
    }
    const accountId = resolveChannelDefaultAccountId({ plugin, cfg: next });
    const account = plugin.config.resolveAccount(next, accountId);
    let enabled: boolean | undefined;
    if (plugin.config.isEnabled) {
      enabled = plugin.config.isEnabled(account, next);
    } else if (typeof (account as { enabled?: boolean })?.enabled === "boolean") {
      enabled = (account as { enabled?: boolean }).enabled;
    }
    return enabled === false ? t("onboardChannels.disabledHint") : undefined;
  };

  const buildSelectionOptions = (
    entries: Array<{
      id: ChannelChoice;
      meta: { id: string; label: string; selectionLabel?: string };
    }>,
  ) =>
    entries.map((entry) => {
      const status = statusByChannel.get(entry.id);
      const disabledHint = resolveDisabledHint(entry.id);
      const hint = [status?.selectionHint, disabledHint].filter(Boolean).join(" · ") || undefined;
      return {
        value: entry.meta.id,
        label: entry.meta.selectionLabel ?? entry.meta.label,
        ...(hint ? { hint } : {}),
      };
    });

  const getChannelEntries = () => {
    const core = listChatChannels();
    const installed = listVisibleInstalledPlugins();
    const installedIds = new Set(installed.map((plugin) => plugin.id));
    const workspaceDir = resolveWorkspaceDir();
    const catalog = listChannelPluginCatalogEntries({ workspaceDir }).filter(
      (entry) => !installedIds.has(entry.id),
    );
    const metaById = new Map<string, ChannelMeta>();
    for (const meta of core) {
      metaById.set(meta.id, meta);
    }
    for (const plugin of installed) {
      metaById.set(plugin.id, plugin.meta);
    }
    for (const entry of catalog) {
      if (!metaById.has(entry.id)) {
        metaById.set(entry.id, entry.meta);
      }
    }
    const entries = Array.from(metaById, ([id, meta]) => ({
      id: id as ChannelChoice,
      meta,
    }));
    return {
      entries,
      catalog,
      catalogById: new Map(catalog.map((entry) => [entry.id as ChannelChoice, entry])),
    };
  };

  const refreshStatus = async (channel: ChannelChoice) => {
    const adapter = getVisibleOnboardingAdapter(channel);
    if (!adapter) {
      return;
    }
    const status = await adapter.getStatus({ cfg: next, options, accountOverrides });
    statusByChannel.set(channel, status);
  };

  const enableBundledPluginForSetup = async (channel: ChannelChoice): Promise<boolean> => {
    if (getVisibleChannelPlugin(channel)) {
      await refreshStatus(channel);
      return true;
    }
    const result = enablePluginInConfig(next, channel);
    next = result.config;
    if (!result.enabled) {
      await prompter.note(
        t("commands.channels.cannotEnable", { channel, reason: result.reason ?? t("onboardChannels.pluginDisabled") }),
        t("commands.channels.channelSetupTitle"),
      );
      return false;
    }
    const adapter = getVisibleOnboardingAdapter(channel);
    const plugin = loadScopedChannelPlugin(channel);
    if (!plugin) {
      if (adapter) {
        await prompter.note(
          t("commands.channels.pluginNotAvailableContinue", { channel }) + ` ${formatCliCommand(
            "openclaw plugins list",
          )} / ${formatCliCommand("openclaw plugins enable " + channel)}`,
          t("commands.channels.channelSetupTitle"),
        );
        await refreshStatus(channel);
        return true;
      }
      await prompter.note(t("commands.channels.pluginNotAvailable", { channel }), t("commands.channels.channelSetupTitle"));
      return false;
    }
    await refreshStatus(channel);
    return true;
  };

  const applyOnboardingResult = async (channel: ChannelChoice, result: ChannelOnboardingResult) => {
    next = result.cfg;
    if (result.accountId) {
      recordAccount(channel, result.accountId);
    }
    addSelection(channel);
    await refreshStatus(channel);
  };

  const applyCustomOnboardingResult = async (
    channel: ChannelChoice,
    result: ChannelOnboardingConfiguredResult,
  ) => {
    if (result === "skip") {
      return false;
    }
    await applyOnboardingResult(channel, result);
    return true;
  };

  const configureChannel = async (channel: ChannelChoice) => {
    const adapter = getVisibleOnboardingAdapter(channel);
    if (!adapter) {
      await prompter.note(t("commands.channels.noOnboarding", { channel }), t("commands.channels.channelSetupTitle"));
      return;
    }
    const result = await adapter.configure({
      cfg: next,
      runtime,
      prompter,
      options,
      accountOverrides,
      shouldPromptAccountIds,
      forceAllowFrom: forceAllowFromChannels.has(channel),
    });
    await applyOnboardingResult(channel, result);
  };

  const handleConfiguredChannel = async (channel: ChannelChoice, label: string) => {
    const plugin = getVisibleChannelPlugin(channel);
    const adapter = getVisibleOnboardingAdapter(channel);
    if (adapter?.configureWhenConfigured) {
      const custom = await adapter.configureWhenConfigured({
        cfg: next,
        runtime,
        prompter,
        options,
        accountOverrides,
        shouldPromptAccountIds,
        forceAllowFrom: forceAllowFromChannels.has(channel),
        configured: true,
        label,
      });
      if (!(await applyCustomOnboardingResult(channel, custom))) {
        return;
      }
      return;
    }
    const supportsDisable = Boolean(
      options?.allowDisable && (plugin?.config.setAccountEnabled || adapter?.disable),
    );
    const supportsDelete = Boolean(options?.allowDisable && plugin?.config.deleteAccount);
    const action = await promptConfiguredAction({
      prompter,
      label,
      supportsDisable,
      supportsDelete,
    });

    if (action === "skip") {
      return;
    }
    if (action === "update") {
      await configureChannel(channel);
      return;
    }
    if (!options?.allowDisable) {
      return;
    }

    if (action === "delete" && !supportsDelete) {
      await prompter.note(t("commands.channels.removeNotSupported", { label }), t("commands.channels.removeTitle"));
      return;
    }

    const shouldPromptAccount =
      action === "delete"
        ? Boolean(plugin?.config.deleteAccount)
        : Boolean(plugin?.config.setAccountEnabled);
    const accountId = shouldPromptAccount
      ? await promptRemovalAccountId({
          cfg: next,
          prompter,
          label,
          channel,
          plugin,
        })
      : DEFAULT_ACCOUNT_ID;
    const resolvedAccountId =
      normalizeAccountId(accountId) ??
      (plugin ? resolveChannelDefaultAccountId({ plugin, cfg: next }) : DEFAULT_ACCOUNT_ID);
    const accountLabel = formatAccountLabel(resolvedAccountId);

    if (action === "delete") {
      const confirmed = await prompter.confirm({
        message: t("commands.channels.deleteConfirm", { label, account: accountLabel }),
        initialValue: false,
      });
      if (!confirmed) {
        return;
      }
      if (plugin?.config.deleteAccount) {
        next = plugin.config.deleteAccount({ cfg: next, accountId: resolvedAccountId });
      }
      await refreshStatus(channel);
      return;
    }

    if (plugin?.config.setAccountEnabled) {
      next = plugin.config.setAccountEnabled({
        cfg: next,
        accountId: resolvedAccountId,
        enabled: false,
      });
    } else if (adapter?.disable) {
      next = adapter.disable(next);
    }
    await refreshStatus(channel);
  };

  const handleChannelChoice = async (channel: ChannelChoice) => {
    const { catalogById } = getChannelEntries();
    const catalogEntry = catalogById.get(channel);
    if (catalogEntry) {
      const workspaceDir = resolveWorkspaceDir();
      const result = await ensureOnboardingPluginInstalled({
        cfg: next,
        entry: catalogEntry,
        prompter,
        runtime,
        workspaceDir,
      });
      next = result.cfg;
      if (!result.installed) {
        return;
      }
      loadScopedChannelPlugin(channel, result.pluginId ?? catalogEntry.pluginId);
      await refreshStatus(channel);
    } else {
      const enabled = await enableBundledPluginForSetup(channel);
      if (!enabled) {
        return;
      }
    }

    const plugin = getVisibleChannelPlugin(channel);
    const adapter = getVisibleOnboardingAdapter(channel);
    const label = plugin?.meta.label ?? catalogEntry?.meta.label ?? channel;
    const status = statusByChannel.get(channel);
    const configured = status?.configured ?? false;
    if (adapter?.configureInteractive) {
      const custom = await adapter.configureInteractive({
        cfg: next,
        runtime,
        prompter,
        options,
        accountOverrides,
        shouldPromptAccountIds,
        forceAllowFrom: forceAllowFromChannels.has(channel),
        configured,
        label,
      });
      if (!(await applyCustomOnboardingResult(channel, custom))) {
        return;
      }
      return;
    }
    if (configured) {
      await handleConfiguredChannel(channel, label);
      return;
    }
    await configureChannel(channel);
  };

  if (options?.quickstartDefaults) {
    const { entries } = getChannelEntries();
    const choice = (await prompter.select({
      message: t("commands.channels.selectQuickstart"),
      options: [
        ...buildSelectionOptions(entries),
        {
          value: "__skip__",
          label: t("onboardChannels.skipForNow"),
          hint: t("onboardChannels.skipHint", { cmd: formatCliCommand("openclaw channels add") }),
        },
      ],
      initialValue: quickstartDefault,
    })) as ChannelChoice | "__skip__";
    if (choice !== "__skip__") {
      await handleChannelChoice(choice);
    }
  } else {
    const doneValue = "__done__" as const;
    const initialValue = options?.initialSelection?.[0] ?? quickstartDefault;
    while (true) {
      const { entries } = getChannelEntries();
      const choice = (await prompter.select({
        message: t("commands.channels.selectChannel"),
        options: [
          ...buildSelectionOptions(entries),
          {
            value: doneValue,
            label: t("commands.channels.finishedLabel"),
            hint: selection.length > 0 ? t("onboardChannels.doneHint") : t("onboardChannels.skipForNow"),
          },
        ],
        initialValue,
      })) as ChannelChoice | typeof doneValue;
      if (choice === doneValue) {
        break;
      }
      await handleChannelChoice(choice);
    }
  }

  options?.onSelection?.(selection);

  const selectionNotes = new Map<string, string>();
  const { entries: selectionEntries } = getChannelEntries();
  for (const entry of selectionEntries) {
    selectionNotes.set(entry.id, formatChannelSelectionLine(entry.meta, formatDocsLink));
  }
  const selectedLines = selection
    .map((channel) => selectionNotes.get(channel))
    .filter((line): line is string => Boolean(line));
  if (selectedLines.length > 0) {
    await prompter.note(selectedLines.join("\n"), t("commands.channels.selectedTitle"));
  }

  if (!options?.skipDmPolicyPrompt) {
    next = await maybeConfigureDmPolicies({
      cfg: next,
      selection,
      prompter,
      accountIdsByChannel,
      resolveAdapter: getVisibleOnboardingAdapter,
    });
  }

  return next;
}
