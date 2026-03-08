import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_BOOTSTRAP_FILENAME } from "../agents/workspace.js";
import { formatCliCommand } from "../cli/command-format.js";
import {
  buildGatewayInstallPlan,
  gatewayInstallErrorHint,
} from "../commands/daemon-install-helpers.js";
import {
  DEFAULT_GATEWAY_DAEMON_RUNTIME,
  GATEWAY_DAEMON_RUNTIME_OPTIONS,
} from "../commands/daemon-runtime.js";
import { resolveGatewayInstallToken } from "../commands/gateway-install-token.js";
import { formatHealthCheckFailure } from "../commands/health-format.js";
import { healthCommand } from "../commands/health.js";
import {
  detectBrowserOpenSupport,
  formatControlUiSshHint,
  openUrl,
  probeGatewayReachable,
  waitForGatewayReachable,
  resolveControlUiLinks,
} from "../commands/onboard-helpers.js";
import type { OnboardOptions } from "../commands/onboard-types.js";
import type { OpenClawConfig } from "../config/config.js";
import { resolveGatewayService } from "../daemon/service.js";
import { isSystemdUserServiceAvailable } from "../daemon/systemd.js";
import { ensureControlUiAssetsBuilt } from "../infra/control-ui-assets.js";
import { t } from "../i18n/index.js";
import type { RuntimeEnv } from "../runtime.js";
import { restoreTerminalState } from "../terminal/restore.js";
import { runTui } from "../tui/tui.js";
import { resolveUserPath } from "../utils.js";
import { setupOnboardingShellCompletion } from "./onboarding.completion.js";
import { resolveOnboardingSecretInputString } from "./onboarding.secret-input.js";
import type { GatewayWizardSettings, WizardFlow } from "./onboarding.types.js";
import type { WizardPrompter } from "./prompts.js";

type FinalizeOnboardingOptions = {
  flow: WizardFlow;
  opts: OnboardOptions;
  baseConfig: OpenClawConfig;
  nextConfig: OpenClawConfig;
  workspaceDir: string;
  settings: GatewayWizardSettings;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
};

export async function finalizeOnboardingWizard(
  options: FinalizeOnboardingOptions,
): Promise<{ launchedTui: boolean }> {
  const { flow, opts, baseConfig, nextConfig, settings, prompter, runtime } = options;

  const withWizardProgress = async <T>(
    label: string,
    options: { doneMessage?: string },
    work: (progress: { update: (message: string) => void }) => Promise<T>,
  ): Promise<T> => {
    const progress = prompter.progress(label);
    try {
      return await work(progress);
    } finally {
      progress.stop(options.doneMessage);
    }
  };

  const systemdAvailable =
    process.platform === "linux" ? await isSystemdUserServiceAvailable() : true;
  if (process.platform === "linux" && !systemdAvailable) {
    await prompter.note(
      t("wizard.finalize.systemdUnavailable"),
      t("wizard.finalize.systemdNoteTitle"),
    );
  }

  if (process.platform === "linux" && systemdAvailable) {
    const { ensureSystemdUserLingerInteractive } = await import("../commands/systemd-linger.js");
    await ensureSystemdUserLingerInteractive({
      runtime,
      prompter: {
        confirm: prompter.confirm,
        note: prompter.note,
      },
      reason:
        t("wizard.finalize.lingerReason"),
      requireConfirm: false,
    });
  }

  const explicitInstallDaemon =
    typeof opts.installDaemon === "boolean" ? opts.installDaemon : undefined;
  let installDaemon: boolean;
  if (explicitInstallDaemon !== undefined) {
    installDaemon = explicitInstallDaemon;
  } else if (process.platform === "linux" && !systemdAvailable) {
    installDaemon = false;
  } else if (flow === "quickstart") {
    installDaemon = true;
  } else {
    installDaemon = await prompter.confirm({
      message: t("wizard.finalize.installServiceConfirm"),
      initialValue: true,
    });
  }

  if (process.platform === "linux" && !systemdAvailable && installDaemon) {
    await prompter.note(
      t("wizard.finalize.systemdSkipInstall"),
      t("wizard.finalize.gatewayServiceTitle"),
    );
    installDaemon = false;
  }

  if (installDaemon) {
    const daemonRuntime =
      flow === "quickstart"
        ? DEFAULT_GATEWAY_DAEMON_RUNTIME
        : await prompter.select({
            message: t("wizard.finalize.serviceRuntimeMsg"),
            options: GATEWAY_DAEMON_RUNTIME_OPTIONS,
            initialValue: opts.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME,
          });
    if (flow === "quickstart") {
      await prompter.note(
        t("wizard.finalize.quickstartNodeNote"),
        t("wizard.finalize.serviceRuntimeNoteTitle"),
      );
    }
    const service = resolveGatewayService();
    const loaded = await service.isLoaded({ env: process.env });
    if (loaded) {
      const action = await prompter.select({
        message: t("wizard.finalize.serviceAlreadyInstalled"),
        options: [
          { value: "restart", label: t("wizard.finalize.restartLabel") },
          { value: "reinstall", label: t("wizard.finalize.reinstallLabel") },
          { value: "skip", label: t("wizard.finalize.skipLabel") },
        ],
      });
      if (action === "restart") {
        await withWizardProgress(
          t("wizard.finalize.gatewayServiceTitle"),
          { doneMessage: t("wizard.finalize.serviceRestarted") },
          async (progress) => {
            progress.update(t("wizard.finalize.restartingService"));
            await service.restart({
              env: process.env,
              stdout: process.stdout,
            });
          },
        );
      } else if (action === "reinstall") {
        await withWizardProgress(
          t("wizard.finalize.gatewayServiceTitle"),
          { doneMessage: t("wizard.finalize.serviceUninstalled") },
          async (progress) => {
            progress.update(t("wizard.finalize.uninstallingService"));
            await service.uninstall({ env: process.env, stdout: process.stdout });
          },
        );
      }
    }

    if (!loaded || (loaded && !(await service.isLoaded({ env: process.env })))) {
      const progress = prompter.progress(t("wizard.finalize.gatewayServiceTitle"));
      let installError: string | null = null;
      try {
        progress.update(t("wizard.finalize.preparingService"));
        const tokenResolution = await resolveGatewayInstallToken({
          config: nextConfig,
          env: process.env,
        });
        for (const warning of tokenResolution.warnings) {
          await prompter.note(warning, t("wizard.finalize.gatewayServiceTitle"));
        }
        if (tokenResolution.unavailableReason) {
          installError = t("wizard.finalize.installBlocked", { reason: tokenResolution.unavailableReason });
        } else {
          const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan(
            {
              env: process.env,
              port: settings.port,
              runtime: daemonRuntime,
              warn: (message, title) => prompter.note(message, title),
              config: nextConfig,
            },
          );

          progress.update(t("wizard.finalize.installingService"));
          await service.install({
            env: process.env,
            stdout: process.stdout,
            programArguments,
            workingDirectory,
            environment,
          });
        }
      } catch (err) {
        installError = err instanceof Error ? err.message : String(err);
      } finally {
        progress.stop(
          installError ? t("wizard.finalize.installFailed") : t("wizard.finalize.installSuccess"),
        );
      }
      if (installError) {
        await prompter.note(`${t("wizard.finalize.installFailedDetail", { error: installError })}`, t("wizard.finalize.gatewayNoteTitle"));
        await prompter.note(gatewayInstallErrorHint(), t("wizard.finalize.gatewayNoteTitle"));
      }
    }
  }

  if (!opts.skipHealth) {
    const probeLinks = resolveControlUiLinks({
      bind: nextConfig.gateway?.bind ?? "loopback",
      port: settings.port,
      customBindHost: nextConfig.gateway?.customBindHost,
      basePath: undefined,
    });
    // Daemon install/restart can briefly flap the WS; wait a bit so health check doesn't false-fail.
    await waitForGatewayReachable({
      url: probeLinks.wsUrl,
      token: settings.gatewayToken,
      deadlineMs: 15_000,
    });
    try {
      await healthCommand({ json: false, timeoutMs: 10_000 }, runtime);
    } catch (err) {
      runtime.error(formatHealthCheckFailure(err));
      await prompter.note(
        [
          "Docs:",
          "https://docs.openclaw.ai/gateway/health",
          "https://docs.openclaw.ai/gateway/troubleshooting",
        ].join("\n"),
        t("wizard.finalize.healthCheckHelpTitle"),
      );
    }
  }

  const controlUiEnabled =
    nextConfig.gateway?.controlUi?.enabled ?? baseConfig.gateway?.controlUi?.enabled ?? true;
  if (!opts.skipUi && controlUiEnabled) {
    const controlUiAssets = await ensureControlUiAssetsBuilt(runtime);
    if (!controlUiAssets.ok && controlUiAssets.message) {
      runtime.error(controlUiAssets.message);
    }
  }

  await prompter.note(
    [
      t("wizard.finalize.optionalAppsIntro"),
      t("wizard.finalize.optionalAppsLines"),
    ].join("\n"),
    t("wizard.finalize.optionalAppsTitle"),
  );

  const controlUiBasePath =
    nextConfig.gateway?.controlUi?.basePath ?? baseConfig.gateway?.controlUi?.basePath;
  const links = resolveControlUiLinks({
    bind: settings.bind,
    port: settings.port,
    customBindHost: settings.customBindHost,
    basePath: controlUiBasePath,
  });
  const authedUrl =
    settings.authMode === "token" && settings.gatewayToken
      ? `${links.httpUrl}#token=${encodeURIComponent(settings.gatewayToken)}`
      : links.httpUrl;
  let resolvedGatewayPassword = "";
  if (settings.authMode === "password") {
    try {
      resolvedGatewayPassword =
        (await resolveOnboardingSecretInputString({
          config: nextConfig,
          value: nextConfig.gateway?.auth?.password,
          path: "gateway.auth.password",
          env: process.env,
        })) ?? "";
    } catch (error) {
      await prompter.note(
        [
          t("wizard.finalize.passwordSecretRefError"),
          error instanceof Error ? error.message : String(error),
        ].join("\n"),
        t("wizard.finalize.gatewayAuthNoteTitle"),
      );
    }
  }

  const gatewayProbe = await probeGatewayReachable({
    url: links.wsUrl,
    token: settings.authMode === "token" ? settings.gatewayToken : undefined,
    password: settings.authMode === "password" ? resolvedGatewayPassword : "",
  });
  const gatewayStatusLine = gatewayProbe.ok
    ? t("wizard.finalize.gatewayReachable")
    : gatewayProbe.detail
      ? t("wizard.finalize.gatewayNotDetectedDetail", { detail: gatewayProbe.detail })
      : t("wizard.finalize.gatewayNotDetected");
  const bootstrapPath = path.join(
    resolveUserPath(options.workspaceDir),
    DEFAULT_BOOTSTRAP_FILENAME,
  );
  const hasBootstrap = await fs
    .access(bootstrapPath)
    .then(() => true)
    .catch(() => false);

  await prompter.note(
    [
      t("wizard.finalize.webUiLabel", { url: links.httpUrl }),
      settings.authMode === "token" && settings.gatewayToken
        ? t("wizard.finalize.webUiTokenLabel", { url: authedUrl })
        : undefined,
      t("wizard.finalize.gatewayWsLabel", { url: links.wsUrl }),
      gatewayStatusLine,
      "Docs: https://docs.openclaw.ai/web/control-ui",
    ]
      .filter(Boolean)
      .join("\n"),
    t("wizard.finalize.controlUiTitle"),
  );

  let controlUiOpened = false;
  let controlUiOpenHint: string | undefined;
  let seededInBackground = false;
  let hatchChoice: "tui" | "web" | "later" | null = null;
  let launchedTui = false;

  if (!opts.skipUi && gatewayProbe.ok) {
    if (hasBootstrap) {
      await prompter.note(
        [
          t("wizard.finalize.tuiDefiningAction"),
          t("wizard.finalize.tuiTakeYourTime"),
          t("wizard.finalize.tuiMoreIsBetter"),
          t("wizard.finalize.tuiWakeUpQuote"),
        ].join("\n"),
        t("wizard.finalize.startTuiTitle"),
      );
    }

    await prompter.note(
      [
        t("wizard.finalize.tokenSharedAuth"),
        t("wizard.finalize.tokenStoredIn"),
        t("wizard.finalize.tokenViewCmd", { cmd: formatCliCommand("openclaw config get gateway.auth.token") }),
        t("wizard.finalize.tokenGenCmd", { cmd: formatCliCommand("openclaw doctor --generate-gateway-token") }),
        t("wizard.finalize.tokenLocalStorage"),
        t("wizard.finalize.tokenOpenDashboard", { cmd: formatCliCommand("openclaw dashboard --no-open") }),
        t("wizard.finalize.tokenPasteHint"),
      ].join("\n"),
      t("wizard.finalize.tokenNoteTitle"),
    );

    hatchChoice = await prompter.select({
      message: t("wizard.finalize.hatchBotMsg"),
      options: [
        { value: "tui", label: t("wizard.finalize.hatchTui") },
        { value: "web", label: t("wizard.finalize.hatchWeb") },
        { value: "later", label: t("wizard.finalize.hatchLater") },
      ],
      initialValue: "tui",
    });

    if (hatchChoice === "tui") {
      restoreTerminalState("pre-onboarding tui", { resumeStdinIfPaused: true });
      await runTui({
        url: links.wsUrl,
        token: settings.authMode === "token" ? settings.gatewayToken : undefined,
        password: settings.authMode === "password" ? resolvedGatewayPassword : "",
        // Safety: onboarding TUI should not auto-deliver to lastProvider/lastTo.
        deliver: false,
        message: hasBootstrap ? t("wizard.finalize.wakeUpMessage") : undefined,
      });
      launchedTui = true;
    } else if (hatchChoice === "web") {
      const browserSupport = await detectBrowserOpenSupport();
      if (browserSupport.ok) {
        controlUiOpened = await openUrl(authedUrl);
        if (!controlUiOpened) {
          controlUiOpenHint = formatControlUiSshHint({
            port: settings.port,
            basePath: controlUiBasePath,
            token: settings.authMode === "token" ? settings.gatewayToken : undefined,
          });
        }
      } else {
        controlUiOpenHint = formatControlUiSshHint({
          port: settings.port,
          basePath: controlUiBasePath,
          token: settings.authMode === "token" ? settings.gatewayToken : undefined,
        });
      }
      await prompter.note(
        [
          t("wizard.finalize.dashboardLink", { url: authedUrl }),
          controlUiOpened
            ? t("wizard.finalize.dashboardOpened")
            : t("wizard.finalize.dashboardCopyPaste"),
          controlUiOpenHint,
        ]
          .filter(Boolean)
          .join("\n"),
        t("wizard.finalize.dashboardReadyTitle"),
      );
    } else {
      await prompter.note(
        t("wizard.finalize.laterHint", { cmd: formatCliCommand("openclaw dashboard --no-open") }),
        t("wizard.finalize.laterTitle"),
      );
    }
  } else if (opts.skipUi) {
    await prompter.note(t("wizard.finalize.skipControlUi"), t("wizard.finalize.controlUiSkipTitle"));
  }

  await prompter.note(
    [
      t("wizard.finalize.backupWorkspace"),
      "Docs: https://docs.openclaw.ai/concepts/agent-workspace",
    ].join("\n"),
    t("wizard.finalize.workspaceBackupTitle"),
  );

  await prompter.note(
    t("wizard.finalize.securityHardening"),
    t("wizard.finalize.securityNoteTitle"),
  );

  await setupOnboardingShellCompletion({ flow, prompter });

  const shouldOpenControlUi =
    !opts.skipUi &&
    settings.authMode === "token" &&
    Boolean(settings.gatewayToken) &&
    hatchChoice === null;
  if (shouldOpenControlUi) {
    const browserSupport = await detectBrowserOpenSupport();
    if (browserSupport.ok) {
      controlUiOpened = await openUrl(authedUrl);
      if (!controlUiOpened) {
        controlUiOpenHint = formatControlUiSshHint({
          port: settings.port,
          basePath: controlUiBasePath,
          token: settings.gatewayToken,
        });
      }
    } else {
      controlUiOpenHint = formatControlUiSshHint({
        port: settings.port,
        basePath: controlUiBasePath,
        token: settings.gatewayToken,
      });
    }

    await prompter.note(
      [
        t("wizard.finalize.dashboardLink", { url: authedUrl }),
        controlUiOpened
          ? t("wizard.finalize.dashboardOpened")
          : t("wizard.finalize.dashboardCopyPaste"),
        controlUiOpenHint,
      ]
        .filter(Boolean)
        .join("\n"),
      t("wizard.finalize.dashboardReadyTitle"),
    );
  }

  const webSearchProvider = nextConfig.tools?.web?.search?.provider;
  const webSearchEnabled = nextConfig.tools?.web?.search?.enabled;
  if (webSearchProvider) {
    const { SEARCH_PROVIDER_OPTIONS, resolveExistingKey, hasExistingKey, hasKeyInEnv } =
      await import("../commands/onboard-search.js");
    const entry = SEARCH_PROVIDER_OPTIONS.find((e) => e.value === webSearchProvider);
    const label = entry?.label ?? webSearchProvider;
    const storedKey = resolveExistingKey(nextConfig, webSearchProvider);
    const keyConfigured = hasExistingKey(nextConfig, webSearchProvider);
    const envAvailable = entry ? hasKeyInEnv(entry) : false;
    const hasKey = keyConfigured || envAvailable;
    const keySource = storedKey
      ? t("wizard.finalize.keyStoredInConfig")
      : keyConfigured
        ? t("wizard.finalize.keyViaSecretRef")
        : envAvailable
          ? t("wizard.finalize.keyViaEnv", { envVars: entry?.envKeys.join(" / ") ?? "" })
          : undefined;
    if (webSearchEnabled !== false && hasKey) {
      await prompter.note(
        [
          t("wizard.finalize.webSearchEnabled"),
          "",
          `${t("wizard.finalize.providerLabel")}: ${label}`,
          ...(keySource ? [keySource] : []),
          "Docs: https://docs.openclaw.ai/tools/web",
        ].join("\n"),
        t("wizard.finalize.webSearchTitle"),
      );
    } else if (!hasKey) {
      await prompter.note(
        [
          t("wizard.finalize.providerNoKey", { label }),
          t("wizard.finalize.webSearchWontWork"),
          `  ${formatCliCommand("openclaw configure --section web")}`,
          "",
          t("wizard.finalize.getKeyAt", { url: entry?.signupUrl ?? "https://docs.openclaw.ai/tools/web" }),
          "Docs: https://docs.openclaw.ai/tools/web",
        ].join("\n"),
        t("wizard.finalize.webSearchTitle"),
      );
    } else {
      await prompter.note(
        [
          t("wizard.finalize.webSearchDisabled", { label }),
          t("wizard.finalize.reEnable", { cmd: formatCliCommand("openclaw configure --section web") }),
          "",
          "Docs: https://docs.openclaw.ai/tools/web",
        ].join("\n"),
        t("wizard.finalize.webSearchTitle"),
      );
    }
  } else {
    // Legacy configs may have a working key (e.g. apiKey or BRAVE_API_KEY) without
    // an explicit provider. Runtime auto-detects these, so avoid saying "skipped".
    const { SEARCH_PROVIDER_OPTIONS, hasExistingKey, hasKeyInEnv } =
      await import("../commands/onboard-search.js");
    const legacyDetected = SEARCH_PROVIDER_OPTIONS.find(
      (e) => hasExistingKey(nextConfig, e.value) || hasKeyInEnv(e),
    );
    if (legacyDetected) {
      await prompter.note(
        [
          t("wizard.finalize.webSearchAutoDetected", { label: legacyDetected.label }),
          "Docs: https://docs.openclaw.ai/tools/web",
        ].join("\n"),
        t("wizard.finalize.webSearchTitle"),
      );
    } else {
      await prompter.note(
        [
          t("wizard.finalize.webSearchSkipped"),
          `  ${formatCliCommand("openclaw configure --section web")}`,
          "",
          "Docs: https://docs.openclaw.ai/tools/web",
        ].join("\n"),
        t("wizard.finalize.webSearchTitle"),
      );
    }
  }

  await prompter.note(
    t("wizard.finalize.whatNow"),
    t("wizard.finalize.whatNowTitle"),
  );

  await prompter.outro(
    controlUiOpened
      ? t("wizard.finalize.outroWithDashboard")
      : seededInBackground
        ? t("wizard.finalize.outroWithSeed")
        : t("wizard.finalize.outroDefault"),
  );

  return { launchedTui };
}
