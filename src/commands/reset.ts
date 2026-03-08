import { cancel, confirm, isCancel } from "@clack/prompts";
import { formatCliCommand } from "../cli/command-format.js";
import { isNixMode } from "../config/config.js";
import { resolveGatewayService } from "../daemon/service.js";
import { t } from "../i18n/index.js";
import type { RuntimeEnv } from "../runtime.js";
import { selectStyled } from "../terminal/prompt-select-styled.js";
import { stylePromptMessage, stylePromptTitle } from "../terminal/prompt-style.js";
import { resolveCleanupPlanFromDisk } from "./cleanup-plan.js";
import {
  listAgentSessionDirs,
  removePath,
  removeStateAndLinkedPaths,
  removeWorkspaceDirs,
} from "./cleanup-utils.js";

export type ResetScope = "config" | "config+creds+sessions" | "full";

export type ResetOptions = {
  scope?: ResetScope;
  yes?: boolean;
  nonInteractive?: boolean;
  dryRun?: boolean;
};

async function stopGatewayIfRunning(runtime: RuntimeEnv) {
  if (isNixMode) {
    return;
  }
  const service = resolveGatewayService();
  let loaded = false;
  try {
    loaded = await service.isLoaded({ env: process.env });
  } catch (err) {
    runtime.error(t("commands.reset.serviceCheckFailed", { error: String(err) }));
    return;
  }
  if (!loaded) {
    return;
  }
  try {
    await service.stop({ env: process.env, stdout: process.stdout });
  } catch (err) {
    runtime.error(t("commands.reset.stopFailed", { error: String(err) }));
  }
}

function logBackupRecommendation(runtime: RuntimeEnv) {
  runtime.log(`Recommended first: ${formatCliCommand("openclaw backup create")}`);
}

export async function resetCommand(runtime: RuntimeEnv, opts: ResetOptions) {
  const interactive = !opts.nonInteractive;
  if (!interactive && !opts.yes) {
    runtime.error(t("commands.reset.nonInteractiveYes"));
    runtime.exit(1);
    return;
  }

  let scope = opts.scope;
  if (!scope) {
    if (!interactive) {
      runtime.error(t("commands.reset.nonInteractiveScope"));
      runtime.exit(1);
      return;
    }
    const selection = await selectStyled<ResetScope>({
      message: t("commands.reset.scopeMsg"),
      options: [
        {
          value: "config",
          label: t("commands.reset.configOnlyLabel"),
          hint: t("commands.reset.configOnlyHint"),
        },
        {
          value: "config+creds+sessions",
          label: t("commands.reset.configCredsLabel"),
          hint: t("commands.reset.configCredsHint"),
        },
        {
          value: "full",
          label: t("commands.reset.fullResetLabel"),
          hint: t("commands.reset.fullResetHint"),
        },
      ],
      initialValue: "config+creds+sessions",
    });
    if (isCancel(selection)) {
      cancel(stylePromptTitle(t("commands.reset.cancelled")) ?? t("commands.reset.cancelled"));
      runtime.exit(0);
      return;
    }
    scope = selection;
  }

  if (!["config", "config+creds+sessions", "full"].includes(scope)) {
    runtime.error(t("commands.reset.invalidScope"));
    runtime.exit(1);
    return;
  }

  if (interactive && !opts.yes) {
    const ok = await confirm({
      message: stylePromptMessage(t("commands.reset.confirmMsg", { scope })),
    });
    if (isCancel(ok) || !ok) {
      cancel(stylePromptTitle(t("commands.reset.cancelled")) ?? t("commands.reset.cancelled"));
      runtime.exit(0);
      return;
    }
  }

  const dryRun = Boolean(opts.dryRun);
  const { stateDir, configPath, oauthDir, configInsideState, oauthInsideState, workspaceDirs } =
    resolveCleanupPlanFromDisk();

  if (scope !== "config") {
    logBackupRecommendation(runtime);
    if (dryRun) {
      runtime.log(t("commands.reset.dryRunStop"));
    } else {
      await stopGatewayIfRunning(runtime);
    }
  }

  if (scope === "config") {
    await removePath(configPath, runtime, { dryRun, label: configPath });
    return;
  }

  if (scope === "config+creds+sessions") {
    await removePath(configPath, runtime, { dryRun, label: configPath });
    await removePath(oauthDir, runtime, { dryRun, label: oauthDir });
    const sessionDirs = await listAgentSessionDirs(stateDir);
    for (const dir of sessionDirs) {
      await removePath(dir, runtime, { dryRun, label: dir });
    }
    runtime.log(t("commands.reset.nextStep", { cmd: formatCliCommand("openclaw onboard --install-daemon") }));
    return;
  }

  if (scope === "full") {
    await removeStateAndLinkedPaths(
      { stateDir, configPath, oauthDir, configInsideState, oauthInsideState },
      runtime,
      { dryRun },
    );
    await removeWorkspaceDirs(workspaceDirs, runtime, { dryRun });
    runtime.log(t("commands.reset.nextStep", { cmd: formatCliCommand("openclaw onboard --install-daemon") }));
    return;
  }
}
