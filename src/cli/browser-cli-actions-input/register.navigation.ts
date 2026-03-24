import type { Command } from "commander";
import { danger } from "../../globals.js";
import { t } from "../../i18n/index.js";
import { defaultRuntime } from "../../runtime.js";
import { runBrowserResizeWithOutput } from "../browser-cli-resize.js";
import { callBrowserRequest, type BrowserParentOpts } from "../browser-cli-shared.js";
import { requireRef, resolveBrowserActionContext } from "./shared.js";

export function registerBrowserNavigationCommands(
  browser: Command,
  parentOpts: (cmd: Command) => BrowserParentOpts,
) {
  browser
    .command("navigate")
    .description(t("browserNavCli.navigateDescription"))
    .argument("<url>", t("browserNavCli.urlArg"))
    .option("--target-id <id>", t("browserNavCli.cdpTargetIdOpt"))
    .action(async (url: string, opts, cmd) => {
      const { parent, profile } = resolveBrowserActionContext(cmd, parentOpts);
      try {
        const result = await callBrowserRequest<{ url?: string }>(
          parent,
          {
            method: "POST",
            path: "/navigate",
            query: profile ? { profile } : undefined,
            body: {
              url,
              targetId: opts.targetId?.trim() || undefined,
            },
          },
          { timeoutMs: 20000 },
        );
        if (parent?.json) {
          defaultRuntime.writeJson(result);
          return;
        }
        defaultRuntime.log(t("browserNavCli.navigatedTo", { url: result.url ?? url }));
      } catch (err) {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(1);
      }
    });

  browser
    .command("resize")
    .description(t("browserNavCli.resizeDescription"))
    .argument("<width>", t("browserNavCli.widthArg"), (v: string) => Number(v))
    .argument("<height>", t("browserNavCli.heightArg"), (v: string) => Number(v))
    .option("--target-id <id>", t("browserNavCli.cdpTargetIdOpt"))
    .action(async (width: number, height: number, opts, cmd) => {
      const { parent, profile } = resolveBrowserActionContext(cmd, parentOpts);
      try {
        await runBrowserResizeWithOutput({
          parent,
          profile,
          width,
          height,
          targetId: opts.targetId,
          timeoutMs: 20000,
          successMessage: t("browserNavCli.resizedTo", { width: String(width), height: String(height) }),
        });
      } catch (err) {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(1);
      }
    });

  // Keep `requireRef` reachable; shared utilities are intended for other modules too.
  void requireRef;
}
