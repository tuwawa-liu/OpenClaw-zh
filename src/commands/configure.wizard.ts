import fsPromises from "node:fs/promises";
import nodePath from "node:path";
import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import { readConfigFileSnapshot, resolveGatewayPort, writeConfigFile } from "../config/config.js";
import { logConfigUpdated } from "../config/logging.js";
import { t } from "../i18n/index.js";
import { ensureControlUiAssetsBuilt } from "../infra/control-ui-assets.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { note } from "../terminal/note.js";
import { resolveUserPath } from "../utils.js";
import { createClackPrompter } from "../wizard/clack-prompter.js";
import { resolveOnboardingSecretInputString } from "../wizard/onboarding.secret-input.js";
import { WizardCancelledError } from "../wizard/prompts.js";
import { removeChannelConfigWizard } from "./configure.channels.js";
import { maybeInstallDaemon } from "./configure.daemon.js";
import { promptAuthConfig } from "./configure.gateway-auth.js";
import { promptGatewayConfig } from "./configure.gateway.js";
import type {
  ChannelsWizardMode,
  ConfigureWizardParams,
  WizardSection,
} from "./configure.shared.js";
import {
  CONFIGURE_SECTION_OPTIONS,
  confirm,
  intro,
  outro,
  select,
  text,
} from "./configure.shared.js";
import { formatHealthCheckFailure } from "./health-format.js";
import { healthCommand } from "./health.js";
import { noteChannelStatus, setupChannels } from "./onboard-channels.js";
import {
  applyWizardMetadata,
  DEFAULT_WORKSPACE,
  ensureWorkspaceAndSessions,
  guardCancel,
  printWizardHeader,
  probeGatewayReachable,
  resolveControlUiLinks,
  summarizeExistingConfig,
  waitForGatewayReachable,
} from "./onboard-helpers.js";
import { promptRemoteGatewayConfig } from "./onboard-remote.js";
import { setupSkills } from "./onboard-skills.js";

type ConfigureSectionChoice = WizardSection | "__continue";

async function resolveGatewaySecretInputForWizard(params: {
  cfg: OpenClawConfig;
  value: unknown;
  path: string;
}): Promise<string | undefined> {
  try {
    return await resolveOnboardingSecretInputString({
      config: params.cfg,
      value: params.value,
      path: params.path,
      env: process.env,
    });
  } catch {
    return undefined;
  }
}

async function runGatewayHealthCheck(params: {
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  port: number;
}): Promise<void> {
  const localLinks = resolveControlUiLinks({
    bind: params.cfg.gateway?.bind ?? "loopback",
    port: params.port,
    customBindHost: params.cfg.gateway?.customBindHost,
    basePath: undefined,
  });
  const remoteUrl = params.cfg.gateway?.remote?.url?.trim();
  const wsUrl = params.cfg.gateway?.mode === "remote" && remoteUrl ? remoteUrl : localLinks.wsUrl;
  const configuredToken = await resolveGatewaySecretInputForWizard({
    cfg: params.cfg,
    value: params.cfg.gateway?.auth?.token,
    path: "gateway.auth.token",
  });
  const configuredPassword = await resolveGatewaySecretInputForWizard({
    cfg: params.cfg,
    value: params.cfg.gateway?.auth?.password,
    path: "gateway.auth.password",
  });
  const token =
    process.env.OPENCLAW_GATEWAY_TOKEN ?? process.env.CLAWDBOT_GATEWAY_TOKEN ?? configuredToken;
  const password =
    process.env.OPENCLAW_GATEWAY_PASSWORD ??
    process.env.CLAWDBOT_GATEWAY_PASSWORD ??
    configuredPassword;

  await waitForGatewayReachable({
    url: wsUrl,
    token,
    password,
    deadlineMs: 15_000,
  });

  try {
    await healthCommand({ json: false, timeoutMs: 10_000 }, params.runtime);
  } catch (err) {
    params.runtime.error(formatHealthCheckFailure(err));
    note(
      [
        t("commands.configureWizard.docs"),
        "https://docs.openclaw.ai/gateway/health",
        "https://docs.openclaw.ai/gateway/troubleshooting",
      ].join("\n"),
      t("commands.configureWizard.healthCheckHelp"),
    );
  }
}

async function promptConfigureSection(
  runtime: RuntimeEnv,
  hasSelection: boolean,
): Promise<ConfigureSectionChoice> {
  return guardCancel(
    await select<ConfigureSectionChoice>({
      message: t("commands.configWiz.selectSections"),
      options: [
        ...CONFIGURE_SECTION_OPTIONS,
        {
          value: "__continue",
          label: t("commands.configWiz.continueLabel"),
          hint: hasSelection ? t("commands.configWiz.doneHint") : t("commands.configWiz.skipHint"),
        },
      ],
      initialValue: CONFIGURE_SECTION_OPTIONS[0]?.value,
    }),
    runtime,
  );
}

async function promptChannelMode(runtime: RuntimeEnv): Promise<ChannelsWizardMode> {
  return guardCancel(
    await select({
      message: t("commands.configWiz.channelsMsg"),
      options: [
        {
          value: "configure",
          label: t("commands.configWiz.configureLink"),
          hint: t("commands.configWiz.configureLinkHint"),
        },
        {
          value: "remove",
          label: t("commands.configWiz.removeConfig"),
          hint: t("commands.configWiz.removeConfigHint"),
        },
      ],
      initialValue: "configure",
    }),
    runtime,
  ) as ChannelsWizardMode;
}

async function promptWebToolsConfig(
  nextConfig: OpenClawConfig,
  runtime: RuntimeEnv,
): Promise<OpenClawConfig> {
  const existingSearch = nextConfig.tools?.web?.search;
  const existingFetch = nextConfig.tools?.web?.fetch;
  const {
    SEARCH_PROVIDER_OPTIONS,
    resolveExistingKey,
    hasExistingKey,
    applySearchKey,
    hasKeyInEnv,
  } = await import("./onboard-search.js");
  type SP = (typeof SEARCH_PROVIDER_OPTIONS)[number]["value"];

  const hasKeyForProvider = (provider: string): boolean => {
    const entry = SEARCH_PROVIDER_OPTIONS.find((e) => e.value === provider);
    if (!entry) {
      return false;
    }
    return hasExistingKey(nextConfig, provider as SP) || hasKeyInEnv(entry);
  };

  const existingProvider: string = (() => {
    const stored = existingSearch?.provider;
    if (stored && SEARCH_PROVIDER_OPTIONS.some((e) => e.value === stored)) {
      return stored;
    }
    return SEARCH_PROVIDER_OPTIONS.find((e) => hasKeyForProvider(e.value))?.value ?? "brave";
  })();

  note(
    t("commands.configWiz.webSearchNote"),
    t("commands.configWiz.webSearchTitle"),
  );

  const enableSearch = guardCancel(
    await confirm({
      message: t("commands.configWiz.enableWebSearch"),
      initialValue:
        existingSearch?.enabled ?? SEARCH_PROVIDER_OPTIONS.some((e) => hasKeyForProvider(e.value)),
    }),
    runtime,
  );

  let nextSearch: Record<string, unknown> = {
    ...existingSearch,
    enabled: enableSearch,
  };

  if (enableSearch) {
    const providerOptions = SEARCH_PROVIDER_OPTIONS.map((entry) => {
      const configured = hasKeyForProvider(entry.value);
      return {
        value: entry.value,
        label: entry.label,
        hint: configured ? `${entry.hint} · ${t("commands.configWiz.configured")}` : entry.hint,
      };
    });

    const providerChoice = guardCancel(
      await select({
        message: t("commands.configWiz.chooseProvider"),
        options: providerOptions,
        initialValue: existingProvider,
      }),
      runtime,
    );

    nextSearch = { ...nextSearch, provider: providerChoice };

    const entry = SEARCH_PROVIDER_OPTIONS.find((e) => e.value === providerChoice)!;
    const existingKey = resolveExistingKey(nextConfig, providerChoice as SP);
    const keyConfigured = hasExistingKey(nextConfig, providerChoice as SP);
    const envAvailable = entry.envKeys.some((k) => Boolean(process.env[k]?.trim()));
    const envVarNames = entry.envKeys.join(" / ");

    const keyInput = guardCancel(
      await text({
        message: keyConfigured
          ? envAvailable
            ? t("commands.configWiz.apiKeyKeepOrEnv", { label: entry.label, envVars: envVarNames })
            : t("commands.configWiz.apiKeyKeep", { label: entry.label })
          : envAvailable
            ? t("commands.configWiz.apiKeyPasteOrEnv", { label: entry.label, envVars: envVarNames })
            : t("commands.configWiz.apiKeyPaste", { label: entry.label }),
        placeholder: keyConfigured ? t("commands.configWiz.keepCurrent") : entry.placeholder,
      }),
      runtime,
    );
    const key = String(keyInput ?? "").trim();

    if (key || existingKey) {
      const applied = applySearchKey(nextConfig, providerChoice as SP, (key || existingKey)!);
      nextSearch = { ...applied.tools?.web?.search };
    } else if (keyConfigured || envAvailable) {
      nextSearch = { ...nextSearch };
    } else {
      note(
        [
          t("commands.configWiz.noKeyStored"),
          t("commands.configWiz.storeKeyOrEnv", { envVars: envVarNames }),
          t("commands.configWiz.getApiKeyAt", { url: entry.signupUrl }),
          `${t("commands.configureWizard.docs")} https://docs.openclaw.ai/tools/web`,
        ].join("\n"),
        t("commands.configWiz.webSearchTitle"),
      );
    }
  }

  const enableFetch = guardCancel(
    await confirm({
      message: t("commands.configWiz.enableFetch"),
      initialValue: existingFetch?.enabled ?? true,
    }),
    runtime,
  );

  const nextFetch = {
    ...existingFetch,
    enabled: enableFetch,
  };

  return {
    ...nextConfig,
    tools: {
      ...nextConfig.tools,
      web: {
        ...nextConfig.tools?.web,
        search: nextSearch,
        fetch: nextFetch,
      },
    },
  };
}

export async function runConfigureWizard(
  opts: ConfigureWizardParams,
  runtime: RuntimeEnv = defaultRuntime,
) {
  try {
    printWizardHeader(runtime);
    intro(opts.command === "update" ? t("commands.configWiz.updateWizard") : t("commands.configWiz.configure"));
    const prompter = createClackPrompter();

    const snapshot = await readConfigFileSnapshot();
    const baseConfig: OpenClawConfig = snapshot.valid ? snapshot.config : {};

    if (snapshot.exists) {
      const title = snapshot.valid ? t("commands.configWiz.existingConfig") : t("commands.configWiz.invalidConfig");
      note(summarizeExistingConfig(baseConfig), title);
      if (!snapshot.valid && snapshot.issues.length > 0) {
        note(
          [
            ...snapshot.issues.map((iss) => `- ${iss.path}: ${iss.message}`),
            "",
            `${t("commands.configureWizard.docs")} https://docs.openclaw.ai/gateway/configuration`,
          ].join("\n"),
          t("commands.configWiz.configIssuesTitle"),
        );
      }
      if (!snapshot.valid) {
        outro(
          t("commands.configWiz.configInvalid", { cmd: formatCliCommand("openclaw doctor") }),
        );
        runtime.exit(1);
        return;
      }
    }

    const localUrl = "ws://127.0.0.1:18789";
    const baseLocalProbeToken = await resolveGatewaySecretInputForWizard({
      cfg: baseConfig,
      value: baseConfig.gateway?.auth?.token,
      path: "gateway.auth.token",
    });
    const baseLocalProbePassword = await resolveGatewaySecretInputForWizard({
      cfg: baseConfig,
      value: baseConfig.gateway?.auth?.password,
      path: "gateway.auth.password",
    });
    const localProbe = await probeGatewayReachable({
      url: localUrl,
      token:
        process.env.OPENCLAW_GATEWAY_TOKEN ??
        process.env.CLAWDBOT_GATEWAY_TOKEN ??
        baseLocalProbeToken,
      password:
        process.env.OPENCLAW_GATEWAY_PASSWORD ??
        process.env.CLAWDBOT_GATEWAY_PASSWORD ??
        baseLocalProbePassword,
    });
    const remoteUrl = baseConfig.gateway?.remote?.url?.trim() ?? "";
    const baseRemoteProbeToken = await resolveGatewaySecretInputForWizard({
      cfg: baseConfig,
      value: baseConfig.gateway?.remote?.token,
      path: "gateway.remote.token",
    });
    const remoteProbe = remoteUrl
      ? await probeGatewayReachable({
          url: remoteUrl,
          token: baseRemoteProbeToken,
        })
      : null;

    const mode = guardCancel(
      await select({
        message: t("commands.configWiz.whereGateway"),
        options: [
          {
            value: "local",
            label: t("commands.configWiz.localLabel"),
            hint: localProbe.ok
              ? t("commands.configWiz.gatewayReachable", { url: localUrl })
              : t("commands.configWiz.noGateway", { url: localUrl }),
          },
          {
            value: "remote",
            label: t("commands.configWiz.remoteLabel"),
            hint: !remoteUrl
              ? t("commands.configWiz.noRemoteUrl")
              : remoteProbe?.ok
                ? t("commands.configWiz.gatewayReachable", { url: remoteUrl })
                : t("commands.configWiz.remoteUnreachable", { url: remoteUrl }),
          },
        ],
      }),
      runtime,
    );

    if (mode === "remote") {
      let remoteConfig = await promptRemoteGatewayConfig(baseConfig, prompter);
      remoteConfig = applyWizardMetadata(remoteConfig, {
        command: opts.command,
        mode,
      });
      await writeConfigFile(remoteConfig);
      logConfigUpdated(runtime);
      outro(t("commands.configWiz.remoteConfigured"));
      return;
    }

    let nextConfig = { ...baseConfig };
    let didSetGatewayMode = false;
    if (nextConfig.gateway?.mode !== "local") {
      nextConfig = {
        ...nextConfig,
        gateway: {
          ...nextConfig.gateway,
          mode: "local",
        },
      };
      didSetGatewayMode = true;
    }
    let workspaceDir =
      nextConfig.agents?.defaults?.workspace ??
      baseConfig.agents?.defaults?.workspace ??
      DEFAULT_WORKSPACE;
    let gatewayPort = resolveGatewayPort(baseConfig);

    const persistConfig = async () => {
      nextConfig = applyWizardMetadata(nextConfig, {
        command: opts.command,
        mode,
      });
      await writeConfigFile(nextConfig);
      logConfigUpdated(runtime);
    };

    const configureWorkspace = async () => {
      const workspaceInput = guardCancel(
        await text({
          message: t("commands.configWiz.workspaceDir"),
          initialValue: workspaceDir,
        }),
        runtime,
      );
      workspaceDir = resolveUserPath(String(workspaceInput ?? "").trim() || DEFAULT_WORKSPACE);
      if (!snapshot.exists) {
        const indicators = ["MEMORY.md", "memory", ".git"].map((name) =>
          nodePath.join(workspaceDir, name),
        );
        const hasExistingContent = (
          await Promise.all(
            indicators.map(async (candidate) => {
              try {
                await fsPromises.access(candidate);
                return true;
              } catch {
                return false;
              }
            }),
          )
        ).some(Boolean);
        if (hasExistingContent) {
          note(
            t("commands.configWiz.existingWorkspaceNote", { dir: workspaceDir }),
            t("commands.configWiz.existingWorkspaceTitle"),
          );
        }
      }
      nextConfig = {
        ...nextConfig,
        agents: {
          ...nextConfig.agents,
          defaults: {
            ...nextConfig.agents?.defaults,
            workspace: workspaceDir,
          },
        },
      };
      await ensureWorkspaceAndSessions(workspaceDir, runtime);
    };

    const configureChannelsSection = async () => {
      await noteChannelStatus({ cfg: nextConfig, prompter });
      const channelMode = await promptChannelMode(runtime);
      if (channelMode === "configure") {
        nextConfig = await setupChannels(nextConfig, runtime, prompter, {
          allowDisable: true,
          allowSignalInstall: true,
          skipConfirm: true,
          skipStatusNote: true,
        });
      } else {
        nextConfig = await removeChannelConfigWizard(nextConfig, runtime);
      }
    };

    const promptDaemonPort = async () => {
      const portInput = guardCancel(
        await text({
          message: t("commands.configWiz.daemonPort"),
          initialValue: String(gatewayPort),
          validate: (value) => (Number.isFinite(Number(value)) ? undefined : t("commands.configWiz.invalidPort")),
        }),
        runtime,
      );
      gatewayPort = Number.parseInt(String(portInput), 10);
    };

    if (opts.sections) {
      const selected = opts.sections;
      if (!selected || selected.length === 0) {
        outro(t("commands.configWiz.noChanges"));
        return;
      }

      if (selected.includes("workspace")) {
        await configureWorkspace();
      }

      if (selected.includes("model")) {
        nextConfig = await promptAuthConfig(nextConfig, runtime, prompter);
      }

      if (selected.includes("web")) {
        nextConfig = await promptWebToolsConfig(nextConfig, runtime);
      }

      if (selected.includes("gateway")) {
        const gateway = await promptGatewayConfig(nextConfig, runtime);
        nextConfig = gateway.config;
        gatewayPort = gateway.port;
      }

      if (selected.includes("channels")) {
        await configureChannelsSection();
      }

      if (selected.includes("skills")) {
        const wsDir = resolveUserPath(workspaceDir);
        nextConfig = await setupSkills(nextConfig, wsDir, runtime, prompter);
      }

      await persistConfig();

      if (selected.includes("daemon")) {
        if (!selected.includes("gateway")) {
          await promptDaemonPort();
        }

        await maybeInstallDaemon({ runtime, port: gatewayPort });
      }

      if (selected.includes("health")) {
        await runGatewayHealthCheck({ cfg: nextConfig, runtime, port: gatewayPort });
      }
    } else {
      let ranSection = false;
      let didConfigureGateway = false;

      while (true) {
        const choice = await promptConfigureSection(runtime, ranSection);
        if (choice === "__continue") {
          break;
        }
        ranSection = true;

        if (choice === "workspace") {
          await configureWorkspace();
          await persistConfig();
        }

        if (choice === "model") {
          nextConfig = await promptAuthConfig(nextConfig, runtime, prompter);
          await persistConfig();
        }

        if (choice === "web") {
          nextConfig = await promptWebToolsConfig(nextConfig, runtime);
          await persistConfig();
        }

        if (choice === "gateway") {
          const gateway = await promptGatewayConfig(nextConfig, runtime);
          nextConfig = gateway.config;
          gatewayPort = gateway.port;
          didConfigureGateway = true;
          await persistConfig();
        }

        if (choice === "channels") {
          await configureChannelsSection();
          await persistConfig();
        }

        if (choice === "skills") {
          const wsDir = resolveUserPath(workspaceDir);
          nextConfig = await setupSkills(nextConfig, wsDir, runtime, prompter);
          await persistConfig();
        }

        if (choice === "daemon") {
          if (!didConfigureGateway) {
            await promptDaemonPort();
          }
          await maybeInstallDaemon({
            runtime,
            port: gatewayPort,
          });
        }

        if (choice === "health") {
          await runGatewayHealthCheck({ cfg: nextConfig, runtime, port: gatewayPort });
        }
      }

      if (!ranSection) {
        if (didSetGatewayMode) {
          await persistConfig();
          outro(t("commands.configWiz.gatewayModeLocal"));
          return;
        }
        outro(t("commands.configWiz.noChanges"));
        return;
      }
    }

    const controlUiAssets = await ensureControlUiAssetsBuilt(runtime);
    if (!controlUiAssets.ok && controlUiAssets.message) {
      runtime.error(controlUiAssets.message);
    }

    const bind = nextConfig.gateway?.bind ?? "loopback";
    const links = resolveControlUiLinks({
      bind,
      port: gatewayPort,
      customBindHost: nextConfig.gateway?.customBindHost,
      basePath: nextConfig.gateway?.controlUi?.basePath,
    });
    // Try both new and old passwords since gateway may still have old config.
    const newPassword =
      process.env.OPENCLAW_GATEWAY_PASSWORD ??
      process.env.CLAWDBOT_GATEWAY_PASSWORD ??
      (await resolveGatewaySecretInputForWizard({
        cfg: nextConfig,
        value: nextConfig.gateway?.auth?.password,
        path: "gateway.auth.password",
      }));
    const oldPassword =
      process.env.OPENCLAW_GATEWAY_PASSWORD ??
      process.env.CLAWDBOT_GATEWAY_PASSWORD ??
      (await resolveGatewaySecretInputForWizard({
        cfg: baseConfig,
        value: baseConfig.gateway?.auth?.password,
        path: "gateway.auth.password",
      }));
    const token =
      process.env.OPENCLAW_GATEWAY_TOKEN ??
      process.env.CLAWDBOT_GATEWAY_TOKEN ??
      (await resolveGatewaySecretInputForWizard({
        cfg: nextConfig,
        value: nextConfig.gateway?.auth?.token,
        path: "gateway.auth.token",
      }));

    let gatewayProbe = await probeGatewayReachable({
      url: links.wsUrl,
      token,
      password: newPassword,
    });
    // If new password failed and it's different from old password, try old too.
    if (!gatewayProbe.ok && newPassword !== oldPassword && oldPassword) {
      gatewayProbe = await probeGatewayReachable({
        url: links.wsUrl,
        token,
        password: oldPassword,
      });
    }
    const gatewayStatusLine = gatewayProbe.ok
      ? t("commands.configWiz.gatewayReachableStatus")
      : `${t("commands.configWiz.gatewayNotDetected")}${gatewayProbe.detail ? ` (${gatewayProbe.detail})` : ""}`;

    note(
      [
        `${t("commands.configureWizard.webUi")} ${links.httpUrl}`,
        `${t("commands.configureWizard.gatewayWs")} ${links.wsUrl}`,
        gatewayStatusLine,
        `${t("commands.configureWizard.docs")} https://docs.openclaw.ai/web/control-ui`,
      ].join("\n"),
      t("commands.configWiz.controlUiTitle"),
    );

    outro(t("commands.configWiz.configureComplete"));
  } catch (err) {
    if (err instanceof WizardCancelledError) {
      runtime.exit(1);
      return;
    }
    throw err;
  }
}
