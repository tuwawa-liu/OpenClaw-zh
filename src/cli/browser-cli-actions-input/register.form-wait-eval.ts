import type { Command } from "commander";
import { danger } from "../../globals.js";
import { t } from "../../i18n/index.js";
import { defaultRuntime } from "../../runtime.js";
import type { BrowserParentOpts } from "../browser-cli-shared.js";
import {
  callBrowserAct,
  logBrowserActionResult,
  readFields,
  resolveBrowserActionContext,
} from "./shared.js";

export function registerBrowserFormWaitEvalCommands(
  browser: Command,
  parentOpts: (cmd: Command) => BrowserParentOpts,
) {
  browser
    .command("fill")
    .description(t("browserFormCli.fillDescription"))
    .option("--fields <json>", t("browserFormCli.fieldsOpt"))
    .option("--fields-file <path>", t("browserFormCli.fieldsFileOpt"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (opts, cmd) => {
      const { parent, profile } = resolveBrowserActionContext(cmd, parentOpts);
      try {
        const fields = await readFields({
          fields: opts.fields,
          fieldsFile: opts.fieldsFile,
        });
        const result = await callBrowserAct<{ result?: unknown }>({
          parent,
          profile,
          body: {
            kind: "fill",
            fields,
            targetId: opts.targetId?.trim() || undefined,
          },
        });
        logBrowserActionResult(parent, result, `filled ${fields.length} field(s)`);
      } catch (err) {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(1);
      }
    });

  browser
    .command("wait")
    .description(t("browserFormCli.waitDescription"))
    .argument("[selector]", t("browserFormCli.waitSelectorArg"))
    .option("--time <ms>", t("browserFormCli.waitTimeOpt"), (v: string) => Number(v))
    .option("--text <value>", t("browserFormCli.waitTextOpt"))
    .option("--text-gone <value>", t("browserFormCli.waitTextGoneOpt"))
    .option("--url <pattern>", t("browserFormCli.waitUrlOpt"))
    .option("--load <load|domcontentloaded|networkidle>", t("browserFormCli.waitLoadOpt"))
    .option("--fn <js>", t("browserFormCli.waitFnOpt"))
    .option("--timeout-ms <ms>", t("browserFormCli.waitTimeoutMsOpt"), (v: string) => Number(v))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (selector: string | undefined, opts, cmd) => {
      const { parent, profile } = resolveBrowserActionContext(cmd, parentOpts);
      try {
        const sel = selector?.trim() || undefined;
        const load =
          opts.load === "load" || opts.load === "domcontentloaded" || opts.load === "networkidle"
            ? (opts.load as "load" | "domcontentloaded" | "networkidle")
            : undefined;
        const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : undefined;
        const result = await callBrowserAct<{ result?: unknown }>({
          parent,
          profile,
          body: {
            kind: "wait",
            timeMs: Number.isFinite(opts.time) ? opts.time : undefined,
            text: opts.text?.trim() || undefined,
            textGone: opts.textGone?.trim() || undefined,
            selector: sel,
            url: opts.url?.trim() || undefined,
            loadState: load,
            fn: opts.fn?.trim() || undefined,
            targetId: opts.targetId?.trim() || undefined,
            timeoutMs,
          },
          timeoutMs,
        });
        logBrowserActionResult(parent, result, "wait complete");
      } catch (err) {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(1);
      }
    });

  browser
    .command("evaluate")
    .description(t("browserFormCli.evaluateDescription"))
    .option("--fn <code>", t("browserFormCli.evaluateFnOpt"))
    .option("--ref <id>", t("browserFormCli.evaluateRefOpt"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (opts, cmd) => {
      const { parent, profile } = resolveBrowserActionContext(cmd, parentOpts);
      if (!opts.fn) {
        defaultRuntime.error(danger("Missing --fn"));
        defaultRuntime.exit(1);
        return;
      }
      try {
        const result = await callBrowserAct<{ result?: unknown }>({
          parent,
          profile,
          body: {
            kind: "evaluate",
            fn: opts.fn,
            ref: opts.ref?.trim() || undefined,
            targetId: opts.targetId?.trim() || undefined,
          },
        });
        if (parent?.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
          return;
        }
        defaultRuntime.log(JSON.stringify(result.result ?? null, null, 2));
      } catch (err) {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(1);
      }
    });
}
