import { withProgress } from "../cli/progress.js";
import { loadConfig } from "../config/config.js";
import { resolveGatewayService } from "../daemon/service.js";
import { t } from "../i18n/index.js";
import { isNonFatalSystemdInstallProbeError } from "../daemon/systemd.js";
import type { RuntimeEnv } from "../runtime.js";
import { note } from "../terminal/note.js";
import { confirm, select } from "./configure.shared.js";
import { buildGatewayInstallPlan, gatewayInstallErrorHint } from "./daemon-install-helpers.js";
import {
  DEFAULT_GATEWAY_DAEMON_RUNTIME,
  GATEWAY_DAEMON_RUNTIME_OPTIONS,
  type GatewayDaemonRuntime,
} from "./daemon-runtime.js";
import { resolveGatewayInstallToken } from "./gateway-install-token.js";
import { guardCancel } from "./onboard-helpers.js";
import { ensureSystemdUserLingerInteractive } from "./systemd-linger.js";

export async function maybeInstallDaemon(params: {
  runtime: RuntimeEnv;
  port: number;
  daemonRuntime?: GatewayDaemonRuntime;
}) {
  const service = resolveGatewayService();
  let loaded = false;
  try {
    loaded = await service.isLoaded({ env: process.env });
  } catch (error) {
    if (!isNonFatalSystemdInstallProbeError(error)) {
      throw error;
    }
    loaded = false;
  }
  let shouldCheckLinger = false;
  let shouldInstall = true;
  let daemonRuntime = params.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME;
  if (loaded) {
    const action = guardCancel(
      await select({
        message: t("commands.configDaemon.alreadyInstalled"),
        options: [
          { value: "restart", label: t("commands.configDaemon.restartLabel") },
          { value: "reinstall", label: t("commands.configDaemon.reinstallLabel") },
          { value: "skip", label: t("commands.configDaemon.skipLabel") },
        ],
      }),
      params.runtime,
    );
    if (action === "restart") {
      await withProgress(
        { label: t("commands.configureDaemon.gatewayService"), indeterminate: true, delayMs: 0 },
        async (progress) => {
          progress.setLabel(t("commands.configDaemon.restarting"));
          await service.restart({
            env: process.env,
            stdout: process.stdout,
          });
          progress.setLabel(t("commands.configDaemon.restarted"));
        },
      );
      shouldCheckLinger = true;
      shouldInstall = false;
    }
    if (action === "skip") {
      return;
    }
    if (action === "reinstall") {
      await withProgress(
        { label: t("commands.configureDaemon.gatewayService"), indeterminate: true, delayMs: 0 },
        async (progress) => {
          progress.setLabel(t("commands.configDaemon.uninstalling"));
          await service.uninstall({ env: process.env, stdout: process.stdout });
          progress.setLabel(t("commands.configDaemon.uninstalled"));
        },
      );
    }
  }

  if (shouldInstall) {
    let installError: string | null = null;
    if (!params.daemonRuntime) {
      if (GATEWAY_DAEMON_RUNTIME_OPTIONS.length === 1) {
        daemonRuntime = GATEWAY_DAEMON_RUNTIME_OPTIONS[0]?.value ?? DEFAULT_GATEWAY_DAEMON_RUNTIME;
      } else {
        daemonRuntime = guardCancel(
          await select({
            message: t("commands.configDaemon.runtimeMsg"),
            options: GATEWAY_DAEMON_RUNTIME_OPTIONS,
            initialValue: DEFAULT_GATEWAY_DAEMON_RUNTIME,
          }),
          params.runtime,
        ) as GatewayDaemonRuntime;
      }
    }
    await withProgress(
      { label: t("commands.configureDaemon.gatewayService"), indeterminate: true, delayMs: 0 },
      async (progress) => {
        progress.setLabel(t("commands.configureDaemon.preparing"));

        const cfg = loadConfig();
        const tokenResolution = await resolveGatewayInstallToken({
          config: cfg,
          env: process.env,
        });
        for (const warning of tokenResolution.warnings) {
          note(warning, t("commands.configDaemon.gatewayTitle"));
        }
        if (tokenResolution.unavailableReason) {
          installError = t("commands.configDaemon.installBlocked", { reason: tokenResolution.unavailableReason });
          progress.setLabel(t("commands.configDaemon.installBlockedLabel"));
          return;
        }
        const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan({
          env: process.env,
          port: params.port,
          runtime: daemonRuntime,
          warn: (message, title) => note(message, title),
          config: cfg,
        });

        progress.setLabel(t("commands.configureDaemon.installing"));
        try {
          await service.install({
            env: process.env,
            stdout: process.stdout,
            programArguments,
            workingDirectory,
            environment,
          });
          progress.setLabel(t("commands.configDaemon.installed"));
        } catch (err) {
          installError = err instanceof Error ? err.message : String(err);
          progress.setLabel(t("commands.configDaemon.installFailed"));
        }
      },
    );
    if (installError) {
      note(t("commands.configDaemon.installFailedNote", { error: installError }), t("commands.configDaemon.gatewayTitle"));
      note(gatewayInstallErrorHint(), t("commands.configDaemon.gatewayTitle"));
      return;
    }
    shouldCheckLinger = true;
  }

  if (shouldCheckLinger) {
    await ensureSystemdUserLingerInteractive({
      runtime: params.runtime,
      prompter: {
        confirm: async (p) => guardCancel(await confirm(p), params.runtime),
        note,
      },
      reason:
        t("commands.configDaemon.lingerReason"),
      requireConfirm: true,
    });
  }
}
