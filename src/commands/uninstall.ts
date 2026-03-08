import path from "node:path";
import { cancel, confirm, isCancel, multiselect } from "@clack/prompts";
import { formatCliCommand } from "../cli/command-format.js";
import { isNixMode } from "../config/config.js";
import { resolveGatewayService } from "../daemon/service.js";
import { t } from "../i18n/index.js";
import type { RuntimeEnv } from "../runtime.js";
import { stylePromptHint, stylePromptMessage, stylePromptTitle } from "../terminal/prompt-style.js";
import { resolveHomeDir } from "../utils.js";
import { resolveCleanupPlanFromDisk } from "./cleanup-plan.js";
import { removePath, removeStateAndLinkedPaths, removeWorkspaceDirs } from "./cleanup-utils.js";

type UninstallScope = "service" | "state" | "workspace" | "app";

export type UninstallOptions = {
  service?: boolean;
  state?: boolean;
  workspace?: boolean;
  app?: boolean;
  all?: boolean;
  yes?: boolean;
  nonInteractive?: boolean;
  dryRun?: boolean;
};

const multiselectStyled = <T>(params: Parameters<typeof multiselect<T>>[0]) =>
  multiselect({
    ...params,
    message: stylePromptMessage(params.message),
    options: params.options.map((opt) =>
      opt.hint === undefined ? opt : { ...opt, hint: stylePromptHint(opt.hint) },
    ),
  });

function buildScopeSelection(opts: UninstallOptions): {
  scopes: Set<UninstallScope>;
  hadExplicit: boolean;
} {
  const hadExplicit = Boolean(opts.all || opts.service || opts.state || opts.workspace || opts.app);
  const scopes = new Set<UninstallScope>();
  if (opts.all || opts.service) {
    scopes.add("service");
  }
  if (opts.all || opts.state) {
    scopes.add("state");
  }
  if (opts.all || opts.workspace) {
    scopes.add("workspace");
  }
  if (opts.all || opts.app) {
    scopes.add("app");
  }
  return { scopes, hadExplicit };
}

async function stopAndUninstallService(runtime: RuntimeEnv): Promise<boolean> {
  if (isNixMode) {
    runtime.error(t("commands.uninstall.nixDetected"));
    return false;
  }
  const service = resolveGatewayService();
  let loaded = false;
  try {
    loaded = await service.isLoaded({ env: process.env });
  } catch (err) {
    runtime.error(t("commands.uninstall.serviceCheckFailed", { error: String(err) }));
    return false;
  }
  if (!loaded) {
    runtime.log(t("commands.uninstall.serviceNotLoaded", { text: service.notLoadedText }));
    return true;
  }
  try {
    await service.stop({ env: process.env, stdout: process.stdout });
  } catch (err) {
    runtime.error(t("commands.uninstall.stopFailed", { error: String(err) }));
  }
  try {
    await service.uninstall({ env: process.env, stdout: process.stdout });
    return true;
  } catch (err) {
    runtime.error(t("commands.uninstall.uninstallFailed", { error: String(err) }));
    return false;
  }
}

async function removeMacApp(runtime: RuntimeEnv, dryRun?: boolean) {
  if (process.platform !== "darwin") {
    return;
  }
  await removePath("/Applications/OpenClaw.app", runtime, {
    dryRun,
    label: "/Applications/OpenClaw.app",
  });
}

function logBackupRecommendation(runtime: RuntimeEnv) {
  runtime.log(`Recommended first: ${formatCliCommand("openclaw backup create")}`);
}

export async function uninstallCommand(runtime: RuntimeEnv, opts: UninstallOptions) {
  const { scopes, hadExplicit } = buildScopeSelection(opts);
  const interactive = !opts.nonInteractive;
  if (!interactive && !opts.yes) {
    runtime.error(t("commands.uninstall.nonInteractiveYes"));
    runtime.exit(1);
    return;
  }

  if (!hadExplicit) {
    if (!interactive) {
      runtime.error(t("commands.uninstall.nonInteractiveScope"));
      runtime.exit(1);
      return;
    }
    const selection = await multiselectStyled<UninstallScope>({
      message: t("commands.uninstall.selectComponents"),
      options: [
        {
          value: "service",
          label: t("commands.uninstall.serviceLabel"),
          hint: t("commands.uninstall.serviceHint"),
        },
        { value: "state", label: t("commands.uninstall.stateLabel"), hint: t("commands.uninstall.stateHint") },
        { value: "workspace", label: t("commands.uninstall.workspaceLabel"), hint: t("commands.uninstall.workspaceHint") },
        {
          value: "app",
          label: t("commands.uninstall.macAppLabel"),
          hint: t("commands.uninstall.macAppHint"),
        },
      ],
      initialValues: ["service", "state", "workspace"],
    });
    if (isCancel(selection)) {
      cancel(stylePromptTitle(t("commands.uninstall.cancelled")) ?? t("commands.uninstall.cancelled"));
      runtime.exit(0);
      return;
    }
    for (const value of selection) {
      scopes.add(value);
    }
  }

  if (scopes.size === 0) {
    runtime.log(t("commands.uninstall.nothingSelected"));
    return;
  }

  if (interactive && !opts.yes) {
    const ok = await confirm({
      message: stylePromptMessage(t("commands.uninstall.confirmMsg")),
    });
    if (isCancel(ok) || !ok) {
      cancel(stylePromptTitle(t("commands.uninstall.cancelled")) ?? t("commands.uninstall.cancelled"));
      runtime.exit(0);
      return;
    }
  }

  const dryRun = Boolean(opts.dryRun);
  const { stateDir, configPath, oauthDir, configInsideState, oauthInsideState, workspaceDirs } =
    resolveCleanupPlanFromDisk();

  if (scopes.has("state") || scopes.has("workspace")) {
    logBackupRecommendation(runtime);
  }

  if (scopes.has("service")) {
    if (dryRun) {
      runtime.log(t("commands.uninstall.dryRunService"));
    } else {
      await stopAndUninstallService(runtime);
    }
  }

  if (scopes.has("state")) {
    await removeStateAndLinkedPaths(
      { stateDir, configPath, oauthDir, configInsideState, oauthInsideState },
      runtime,
      { dryRun },
    );
  }

  if (scopes.has("workspace")) {
    await removeWorkspaceDirs(workspaceDirs, runtime, { dryRun });
  }

  if (scopes.has("app")) {
    await removeMacApp(runtime, dryRun);
  }

  runtime.log(t("commands.uninstall.cliHint"));

  if (scopes.has("state") && !scopes.has("workspace")) {
    const home = resolveHomeDir();
    if (home && workspaceDirs.some((dir) => dir.startsWith(path.resolve(home)))) {
      runtime.log(t("commands.uninstall.workspacePreserved"));
    }
  }
}
