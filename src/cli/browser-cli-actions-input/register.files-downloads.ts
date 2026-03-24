import type { Command } from "commander";
import { DEFAULT_UPLOAD_DIR, resolveExistingPathsWithinRoot } from "../../browser/paths.js";
import { danger } from "../../globals.js";
import { t } from "../../i18n/index.js";
import { defaultRuntime } from "../../runtime.js";
import { shortenHomePath } from "../../utils.js";
import { callBrowserRequest, type BrowserParentOpts } from "../browser-cli-shared.js";
import { resolveBrowserActionContext } from "./shared.js";

async function normalizeUploadPaths(paths: string[]): Promise<string[]> {
  const result = await resolveExistingPathsWithinRoot({
    rootDir: DEFAULT_UPLOAD_DIR,
    requestedPaths: paths,
    scopeLabel: `uploads directory (${DEFAULT_UPLOAD_DIR})`,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.paths;
}

async function runBrowserPostAction<T>(params: {
  parent: BrowserParentOpts;
  profile: string | undefined;
  path: string;
  body: Record<string, unknown>;
  timeoutMs: number;
  describeSuccess: (result: T) => string;
}): Promise<void> {
  try {
    const result = await callBrowserRequest<T>(
      params.parent,
      {
        method: "POST",
        path: params.path,
        query: params.profile ? { profile: params.profile } : undefined,
        body: params.body,
      },
      { timeoutMs: params.timeoutMs },
    );
    if (params.parent?.json) {
      defaultRuntime.writeJson(result);
      return;
    }
    defaultRuntime.log(params.describeSuccess(result));
  } catch (err) {
    defaultRuntime.error(danger(String(err)));
    defaultRuntime.exit(1);
  }
}

export function registerBrowserFilesAndDownloadsCommands(
  browser: Command,
  parentOpts: (cmd: Command) => BrowserParentOpts,
) {
  const resolveTimeoutAndTarget = (opts: { timeoutMs?: unknown; targetId?: unknown }) => {
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? Number(opts.timeoutMs) : undefined;
    const targetId =
      typeof opts.targetId === "string" ? opts.targetId.trim() || undefined : undefined;
    return { timeoutMs, targetId };
  };

  const runDownloadCommand = async (
    cmd: Command,
    opts: { timeoutMs?: unknown; targetId?: unknown },
    request: { path: string; body: Record<string, unknown> },
  ) => {
    const { parent, profile } = resolveBrowserActionContext(cmd, parentOpts);
    const { timeoutMs, targetId } = resolveTimeoutAndTarget(opts);
    await runBrowserPostAction<{ download: { path: string } }>({
      parent,
      profile,
      path: request.path,
      body: {
        ...request.body,
        targetId,
        timeoutMs,
      },
      timeoutMs: timeoutMs ?? 20000,
      describeSuccess: (result) => `downloaded: ${shortenHomePath(result.download.path)}`,
    });
  };

  browser
    .command("upload")
    .description(t("browserFilesCli.uploadDescription"))
    .argument(
      "<paths...>",
      t("browserFilesCli.uploadPathsArg"),
    )
    .option("--ref <ref>", t("browserFilesCli.refClickOpt"))
    .option("--input-ref <ref>", t("browserFilesCli.inputRefOpt"))
    .option("--element <selector>", t("browserFilesCli.elementSelectorOpt"))
    .option("--target-id <id>", t("browserNavCli.cdpTargetIdOpt"))
    .option(
      "--timeout-ms <ms>",
      t("browserFilesCli.fileChooserTimeoutOpt"),
      (v: string) => Number(v),
    )
    .action(async (paths: string[], opts, cmd) => {
      const { parent, profile } = resolveBrowserActionContext(cmd, parentOpts);
      const normalizedPaths = await normalizeUploadPaths(paths);
      const { timeoutMs, targetId } = resolveTimeoutAndTarget(opts);
      await runBrowserPostAction({
        parent,
        profile,
        path: "/hooks/file-chooser",
        body: {
          paths: normalizedPaths,
          ref: opts.ref?.trim() || undefined,
          inputRef: opts.inputRef?.trim() || undefined,
          element: opts.element?.trim() || undefined,
          targetId,
          timeoutMs,
        },
        timeoutMs: timeoutMs ?? 20000,
        describeSuccess: () => t("browserFilesCli.uploadArmed", { count: String(paths.length) }),
      });
    });

  browser
    .command("waitfordownload")
    .description(t("browserFilesCli.waitForDownloadDescription"))
    .argument(
      "[path]",
      t("browserFilesCli.downloadSavePathArg"),
    )
    .option("--target-id <id>", t("browserNavCli.cdpTargetIdOpt"))
    .option(
      "--timeout-ms <ms>",
      t("browserFilesCli.downloadTimeoutOpt"),
      (v: string) => Number(v),
    )
    .action(async (outPath: string | undefined, opts, cmd) => {
      await runDownloadCommand(cmd, opts, {
        path: "/wait/download",
        body: {
          path: outPath?.trim() || undefined,
        },
      });
    });

  browser
    .command("download")
    .description(t("browserFilesCli.downloadDescription"))
    .argument("<ref>", t("browserFilesCli.downloadRefArg"))
    .argument(
      "<path>",
      t("browserFilesCli.downloadPathArg"),
    )
    .option("--target-id <id>", t("browserNavCli.cdpTargetIdOpt"))
    .option(
      "--timeout-ms <ms>",
      t("browserFilesCli.downloadStartTimeoutOpt"),
      (v: string) => Number(v),
    )
    .action(async (ref: string, outPath: string, opts, cmd) => {
      await runDownloadCommand(cmd, opts, {
        path: "/download",
        body: {
          ref,
          path: outPath,
        },
      });
    });

  browser
    .command("dialog")
    .description(t("browserFilesCli.dialogDescription"))
    .option("--accept", t("browserFilesCli.dialogAcceptOpt"), false)
    .option("--dismiss", t("browserFilesCli.dialogDismissOpt"), false)
    .option("--prompt <text>", t("browserFilesCli.dialogPromptOpt"))
    .option("--target-id <id>", t("browserNavCli.cdpTargetIdOpt"))
    .option(
      "--timeout-ms <ms>",
      t("browserFilesCli.dialogTimeoutOpt"),
      (v: string) => Number(v),
    )
    .action(async (opts, cmd) => {
      const { parent, profile } = resolveBrowserActionContext(cmd, parentOpts);
      const accept = opts.accept ? true : opts.dismiss ? false : undefined;
      if (accept === undefined) {
        defaultRuntime.error(danger(t("browserFilesCli.specifyAcceptOrDismiss")));
        defaultRuntime.exit(1);
        return;
      }
      const { timeoutMs, targetId } = resolveTimeoutAndTarget(opts);
      await runBrowserPostAction({
        parent,
        profile,
        path: "/hooks/dialog",
        body: {
          accept,
          promptText: opts.prompt?.trim() || undefined,
          targetId,
          timeoutMs,
        },
        timeoutMs: timeoutMs ?? 20000,
        describeSuccess: () => t("browserFilesCli.dialogArmed"),
      });
    });
}
