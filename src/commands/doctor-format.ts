import { formatCliCommand } from "../cli/command-format.js";
import {
  resolveGatewayLaunchAgentLabel,
  resolveGatewaySystemdServiceName,
  resolveGatewayWindowsTaskName,
} from "../daemon/constants.js";
import { formatRuntimeStatus } from "../daemon/runtime-format.js";
import { buildPlatformRuntimeLogHints } from "../daemon/runtime-hints.js";
import type { GatewayServiceRuntime } from "../daemon/service-runtime.js";
import {
  isSystemdUnavailableDetail,
  renderSystemdUnavailableHints,
} from "../daemon/systemd-hints.js";
import { t } from "../i18n/index.js";
import { isWSLEnv } from "../infra/wsl.js";
import { getResolvedLoggerSettings } from "../logging.js";

type RuntimeHintOptions = {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
};

export function formatGatewayRuntimeSummary(
  runtime: GatewayServiceRuntime | undefined,
): string | null {
  return formatRuntimeStatus(runtime);
}

export function buildGatewayRuntimeHints(
  runtime: GatewayServiceRuntime | undefined,
  options: RuntimeHintOptions = {},
): string[] {
  const hints: string[] = [];
  if (!runtime) {
    return hints;
  }
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const fileLog = (() => {
    try {
      return getResolvedLoggerSettings().file;
    } catch {
      return null;
    }
  })();
  if (platform === "linux" && isSystemdUnavailableDetail(runtime.detail)) {
    hints.push(...renderSystemdUnavailableHints({ wsl: isWSLEnv() }));
    if (fileLog) {
      hints.push(t("commands.doctorFormat.fileLogs", { path: fileLog }));
    }
    return hints;
  }
  if (runtime.cachedLabel && platform === "darwin") {
    const label = resolveGatewayLaunchAgentLabel(env.OPENCLAW_PROFILE);
    hints.push(
      t("commands.doctorFormat.launchAgentCachedPlistMissing", { label }),
    );
    hints.push(t("commands.doctorFormat.thenReinstall", { command: formatCliCommand("openclaw gateway install", env) }));
  }
  if (runtime.missingUnit) {
    hints.push(t("commands.doctorFormat.serviceNotInstalled", { command: formatCliCommand("openclaw gateway install", env) }));
    if (fileLog) {
      hints.push(t("commands.doctorFormat.fileLogs", { path: fileLog }));
    }
    return hints;
  }
  if (runtime.status === "stopped") {
    hints.push(t("commands.doctorFormat.serviceLoadedNotRunning"));
    if (fileLog) {
      hints.push(t("commands.doctorFormat.fileLogs", { path: fileLog }));
    }
    hints.push(
      ...buildPlatformRuntimeLogHints({
        platform,
        env,
        systemdServiceName: resolveGatewaySystemdServiceName(env.OPENCLAW_PROFILE),
        windowsTaskName: resolveGatewayWindowsTaskName(env.OPENCLAW_PROFILE),
      }),
    );
  }
  return hints;
}
