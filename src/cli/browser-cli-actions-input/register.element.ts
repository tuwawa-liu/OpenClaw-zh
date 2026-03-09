import type { Command } from "commander";
import { danger } from "../../globals.js";
import { t } from "../../i18n/index.js";
import { defaultRuntime } from "../../runtime.js";
import type { BrowserParentOpts } from "../browser-cli-shared.js";
import {
  callBrowserAct,
  logBrowserActionResult,
  requireRef,
  resolveBrowserActionContext,
} from "./shared.js";

export function registerBrowserElementCommands(
  browser: Command,
  parentOpts: (cmd: Command) => BrowserParentOpts,
) {
  const runElementAction = async (params: {
    cmd: Command;
    body: Record<string, unknown>;
    successMessage: string | ((result: unknown) => string);
    timeoutMs?: number;
  }): Promise<void> => {
    const { parent, profile } = resolveBrowserActionContext(params.cmd, parentOpts);
    try {
      const result = await callBrowserAct({
        parent,
        profile,
        body: params.body,
        timeoutMs: params.timeoutMs,
      });
      const successMessage =
        typeof params.successMessage === "function"
          ? params.successMessage(result)
          : params.successMessage;
      logBrowserActionResult(parent, result, successMessage);
    } catch (err) {
      defaultRuntime.error(danger(String(err)));
      defaultRuntime.exit(1);
    }
  };

  browser
    .command("click")
    .description(t("browserElementCli.clickDescription"))
    .argument("<ref>", t("browserElementCli.refArg"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .option("--double", t("browserElementCli.doubleOpt"), false)
    .option("--button <left|right|middle>", t("browserElementCli.buttonOpt"))
    .option("--modifiers <list>", t("browserElementCli.modifiersOpt"))
    .action(async (ref: string | undefined, opts, cmd) => {
      const refValue = requireRef(ref);
      if (!refValue) {
        return;
      }
      const modifiers = opts.modifiers
        ? String(opts.modifiers)
            .split(",")
            .map((v: string) => v.trim())
            .filter(Boolean)
        : undefined;
      await runElementAction({
        cmd,
        body: {
          kind: "click",
          ref: refValue,
          targetId: opts.targetId?.trim() || undefined,
          doubleClick: Boolean(opts.double),
          button: opts.button?.trim() || undefined,
          modifiers,
        },
        successMessage: (result) => {
          const url = (result as { url?: unknown }).url;
          const suffix = typeof url === "string" && url ? ` on ${url}` : "";
          return t("browserElement.clickedRef", { ref: refValue, suffix });
        },
      });
    });

  browser
    .command("type")
    .description(t("browserElementCli.typeDescription"))
    .argument("<ref>", t("browserElementCli.refArg"))
    .argument("<text>", t("browserElementCli.textArg"))
    .option("--submit", t("browserElementCli.submitOpt"), false)
    .option("--slowly", t("browserElementCli.slowlyOpt"), false)
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (ref: string | undefined, text: string, opts, cmd) => {
      const refValue = requireRef(ref);
      if (!refValue) {
        return;
      }
      await runElementAction({
        cmd,
        body: {
          kind: "type",
          ref: refValue,
          text,
          submit: Boolean(opts.submit),
          slowly: Boolean(opts.slowly),
          targetId: opts.targetId?.trim() || undefined,
        },
        successMessage: t("browserElement.typedIntoRef", { ref: refValue }),
      });
    });

  browser
    .command("press")
    .description(t("browserElementCli.pressDescription"))
    .argument("<key>", t("browserElementCli.keyArg"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (key: string, opts, cmd) => {
      await runElementAction({
        cmd,
        body: { kind: "press", key, targetId: opts.targetId?.trim() || undefined },
        successMessage: t("browserElement.pressed", { key }),
      });
    });

  browser
    .command("hover")
    .description(t("browserElementCli.hoverDescription"))
    .argument("<ref>", t("browserElementCli.refArg"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (ref: string, opts, cmd) => {
      await runElementAction({
        cmd,
        body: { kind: "hover", ref, targetId: opts.targetId?.trim() || undefined },
        successMessage: t("browserElement.hoveredRef", { ref }),
      });
    });

  browser
    .command("scrollintoview")
    .description(t("browserElementCli.scrollIntoViewDescription"))
    .argument("<ref>", t("browserElementCli.refArg"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .option("--timeout-ms <ms>", t("browserElementCli.timeoutMsOpt"), (v: string) => Number(v))
    .action(async (ref: string | undefined, opts, cmd) => {
      const refValue = requireRef(ref);
      if (!refValue) {
        return;
      }
      const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : undefined;
      await runElementAction({
        cmd,
        body: {
          kind: "scrollIntoView",
          ref: refValue,
          targetId: opts.targetId?.trim() || undefined,
          timeoutMs,
        },
        timeoutMs,
        successMessage: t("browserElement.scrolledIntoView", { ref: refValue }),
      });
    });

  browser
    .command("drag")
    .description(t("browserElementCli.dragDescription"))
    .argument("<startRef>", t("browserElementCli.startRefArg"))
    .argument("<endRef>", t("browserElementCli.endRefArg"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (startRef: string, endRef: string, opts, cmd) => {
      await runElementAction({
        cmd,
        body: {
          kind: "drag",
          startRef,
          endRef,
          targetId: opts.targetId?.trim() || undefined,
        },
        successMessage: t("browserElement.dragged", { startRef, endRef }),
      });
    });

  browser
    .command("select")
    .description(t("browserElementCli.selectDescription"))
    .argument("<ref>", t("browserElementCli.refArg"))
    .argument("<values...>", t("browserElementCli.valuesArg"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (ref: string, values: string[], opts, cmd) => {
      await runElementAction({
        cmd,
        body: {
          kind: "select",
          ref,
          values,
          targetId: opts.targetId?.trim() || undefined,
        },
        successMessage: t("browserElement.selected", { values: values.join(", ") }),
      });
    });
}
