import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import { t } from "../i18n/index.js";
import { resolveGatewayPort } from "../config/config.js";
import {
  resolveGatewayLaunchAgentLabel,
  resolveNodeLaunchAgentLabel,
} from "../daemon/constants.js";
import { readLastGatewayErrorLine } from "../daemon/diagnostics.js";
import {
  isLaunchAgentListed,
  isLaunchAgentLoaded,
  launchAgentPlistExists,
  repairLaunchAgentBootstrap,
} from "../daemon/launchd.js";
import { resolveGatewayService } from "../daemon/service.js";
import { renderSystemdUnavailableHints } from "../daemon/systemd-hints.js";
import { isSystemdUserServiceAvailable } from "../daemon/systemd.js";
import { formatPortDiagnostics, inspectPortUsage } from "../infra/ports.js";
import { isWSL } from "../infra/wsl.js";
import type { RuntimeEnv } from "../runtime.js";
import { note } from "../terminal/note.js";
import { sleep } from "../utils.js";
import { buildGatewayInstallPlan, gatewayInstallErrorHint } from "./daemon-install-helpers.js";
import {
  DEFAULT_GATEWAY_DAEMON_RUNTIME,
  GATEWAY_DAEMON_RUNTIME_OPTIONS,
  type GatewayDaemonRuntime,
} from "./daemon-runtime.js";
import { buildGatewayRuntimeHints, formatGatewayRuntimeSummary } from "./doctor-format.js";
import type { DoctorOptions, DoctorPrompter } from "./doctor-prompter.js";
import { resolveGatewayInstallToken } from "./gateway-install-token.js";
import { formatHealthCheckFailure } from "./health-format.js";
import { healthCommand } from "./health.js";

async function maybeRepairLaunchAgentBootstrap(params: {
  env: Record<string, string | undefined>;
  title: string;
  runtime: RuntimeEnv;
  prompter: DoctorPrompter;
}): Promise<boolean> {
  if (process.platform !== "darwin") {
    return false;
  }

  const listed = await isLaunchAgentListed({ env: params.env });
  if (!listed) {
    return false;
  }

  const loaded = await isLaunchAgentLoaded({ env: params.env });
  if (loaded) {
    return false;
  }

  const plistExists = await launchAgentPlistExists(params.env);
  if (!plistExists) {
    return false;
  }

  note(t("commands.doctorGatewayDaemon.launchAgentNotLoaded"), t("commands.doctorGatewayDaemon.titleLaunchAgent", { title: params.title }));

  const shouldFix = await params.prompter.confirmSkipInNonInteractive({
    message: t("commands.doctorGatewayDaemon.repairLaunchAgentPrompt", { title: params.title }),
    initialValue: true,
  });
  if (!shouldFix) {
    return false;
  }

  params.runtime.log(t("commands.doctorGatewayDaemon.bootstrappingLaunchAgent", { title: params.title }));
  const repair = await repairLaunchAgentBootstrap({ env: params.env });
  if (!repair.ok) {
    params.runtime.error(
      t("commands.doctorGatewayDaemon.launchAgentBootstrapFailed", { title: params.title, error: repair.detail ?? "unknown error" }),
    );
    return false;
  }

  const verified = await isLaunchAgentLoaded({ env: params.env });
  if (!verified) {
    params.runtime.error(t("commands.doctorGatewayDaemon.launchAgentStillNotLoaded", { title: params.title }));
    return false;
  }

  note(t("commands.doctorGatewayDaemon.launchAgentRepaired", { title: params.title }), t("commands.doctorGatewayDaemon.titleLaunchAgent", { title: params.title }));
  return true;
}

export async function maybeRepairGatewayDaemon(params: {
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  prompter: DoctorPrompter;
  options: DoctorOptions;
  gatewayDetailsMessage: string;
  healthOk: boolean;
}) {
  if (params.healthOk) {
    return;
  }

  const service = resolveGatewayService();
  // systemd can throw in containers/WSL; treat as "not loaded" and fall back to hints.
  let loaded = false;
  try {
    loaded = await service.isLoaded({ env: process.env });
  } catch {
    loaded = false;
  }
  let serviceRuntime: Awaited<ReturnType<typeof service.readRuntime>> | undefined;
  if (loaded) {
    serviceRuntime = await service.readRuntime(process.env).catch(() => undefined);
  }

  if (process.platform === "darwin" && params.cfg.gateway?.mode !== "remote") {
    const gatewayRepaired = await maybeRepairLaunchAgentBootstrap({
      env: process.env,
      title: "Gateway",
      runtime: params.runtime,
      prompter: params.prompter,
    });
    await maybeRepairLaunchAgentBootstrap({
      env: {
        ...process.env,
        OPENCLAW_LAUNCHD_LABEL: resolveNodeLaunchAgentLabel(),
      },
      title: "Node",
      runtime: params.runtime,
      prompter: params.prompter,
    });
    if (gatewayRepaired) {
      loaded = await service.isLoaded({ env: process.env });
      if (loaded) {
        serviceRuntime = await service.readRuntime(process.env).catch(() => undefined);
      }
    }
  }

  if (params.cfg.gateway?.mode !== "remote") {
    const port = resolveGatewayPort(params.cfg, process.env);
    const diagnostics = await inspectPortUsage(port);
    if (diagnostics.status === "busy") {
      note(formatPortDiagnostics(diagnostics).join("\n"), t("commands.doctorGatewayDaemon.titleGatewayPort"));
    } else if (loaded && serviceRuntime?.status === "running") {
      const lastError = await readLastGatewayErrorLine(process.env);
      if (lastError) {
        note(t("commands.doctorGatewayDaemon.lastGatewayError", { error: lastError }), t("commands.doctorGatewayDaemon.titleGateway"));
      }
    }
  }

  if (!loaded) {
    if (process.platform === "linux") {
      const systemdAvailable = await isSystemdUserServiceAvailable().catch(() => false);
      if (!systemdAvailable) {
        const wsl = await isWSL();
        note(renderSystemdUnavailableHints({ wsl }).join("\n"), t("commands.doctorGatewayDaemon.titleGateway"));
        return;
      }
    }
    note(t("commands.doctorGatewayDaemon.serviceNotInstalled"), t("commands.doctorGatewayDaemon.titleGateway"));
    if (params.cfg.gateway?.mode !== "remote") {
      const install = await params.prompter.confirmSkipInNonInteractive({
        message: t("commands.doctorGatewayDaemon.installServicePrompt"),
        initialValue: true,
      });
      if (install) {
        const daemonRuntime = await params.prompter.select<GatewayDaemonRuntime>(
          {
            message: t("commands.doctorGatewayDaemon.serviceRuntimeLabel"),
            options: GATEWAY_DAEMON_RUNTIME_OPTIONS,
            initialValue: DEFAULT_GATEWAY_DAEMON_RUNTIME,
          },
          DEFAULT_GATEWAY_DAEMON_RUNTIME,
        );
        const tokenResolution = await resolveGatewayInstallToken({
          config: params.cfg,
          env: process.env,
        });
        for (const warning of tokenResolution.warnings) {
          note(warning, t("commands.doctorGatewayDaemon.titleGateway"));
        }
        if (tokenResolution.unavailableReason) {
          note(
            [
              t("commands.doctorGatewayDaemon.installAborted"),
              tokenResolution.unavailableReason,
              t("commands.doctorGatewayDaemon.fixAuthConfigHint"),
            ].join("\n"),
            t("commands.doctorGatewayDaemon.titleGateway"),
          );
          return;
        }
        const port = resolveGatewayPort(params.cfg, process.env);
        const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan({
          env: process.env,
          port,
          runtime: daemonRuntime,
          warn: (message, title) => note(message, title),
          config: params.cfg,
        });
        try {
          await service.install({
            env: process.env,
            stdout: process.stdout,
            programArguments,
            workingDirectory,
            environment,
          });
        } catch (err) {
          note(t("commands.doctorGatewayDaemon.installFailed", { error: String(err) }), t("commands.doctorGatewayDaemon.titleGateway"));
          note(gatewayInstallErrorHint(), t("commands.doctorGatewayDaemon.titleGateway"));
        }
      }
    }
    return;
  }

  const summary = formatGatewayRuntimeSummary(serviceRuntime);
  const hints = buildGatewayRuntimeHints(serviceRuntime, {
    platform: process.platform,
    env: process.env,
  });
  if (summary || hints.length > 0) {
    const lines: string[] = [];
    if (summary) {
      lines.push(t("commands.doctorGatewayDaemon.runtimeSummary", { summary }));
    }
    lines.push(...hints);
    note(lines.join("\n"), t("commands.doctorGatewayDaemon.titleGateway"));
  }

  if (serviceRuntime?.status !== "running") {
    const start = await params.prompter.confirmSkipInNonInteractive({
      message: t("commands.doctorGatewayDaemon.startServicePrompt"),
      initialValue: true,
    });
    if (start) {
      await service.restart({
        env: process.env,
        stdout: process.stdout,
      });
      await sleep(1500);
    }
  }

  if (process.platform === "darwin") {
    const label = resolveGatewayLaunchAgentLabel(process.env.OPENCLAW_PROFILE);
    note(
      t("commands.doctorGatewayDaemon.launchAgentLoadedStopHint", { command: formatCliCommand("openclaw gateway stop"), label }),
      t("commands.doctorGatewayDaemon.titleGateway"),
    );
  }

  if (serviceRuntime?.status === "running") {
    const restart = await params.prompter.confirmSkipInNonInteractive({
      message: t("commands.doctorGatewayDaemon.restartServicePrompt"),
      initialValue: true,
    });
    if (restart) {
      await service.restart({
        env: process.env,
        stdout: process.stdout,
      });
      await sleep(1500);
      try {
        await healthCommand({ json: false, timeoutMs: 10_000 }, params.runtime);
      } catch (err) {
        const message = String(err);
        if (message.includes("gateway closed")) {
          note(t("commands.doctorGatewayDaemon.gatewayNotRunning"), t("commands.doctorGatewayDaemon.titleGateway"));
          note(params.gatewayDetailsMessage, t("commands.doctorGatewayDaemon.titleGatewayConnection"));
        } else {
          params.runtime.error(formatHealthCheckFailure(err));
        }
      }
    }
  }
}
