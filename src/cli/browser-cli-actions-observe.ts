import type { Command } from "commander";
import { danger } from "../globals.js";
import { t } from "../i18n/index.js";
import { defaultRuntime } from "../runtime.js";
import { shortenHomePath } from "../utils.js";
import { callBrowserRequest, type BrowserParentOpts } from "./browser-cli-shared.js";
import { runCommandWithRuntime } from "./cli-utils.js";

function runBrowserObserve(action: () => Promise<void>) {
  return runCommandWithRuntime(defaultRuntime, action, (err) => {
    defaultRuntime.error(danger(String(err)));
    defaultRuntime.exit(1);
  });
}

export function registerBrowserActionObserveCommands(
  browser: Command,
  parentOpts: (cmd: Command) => BrowserParentOpts,
) {
  browser
    .command("console")
    .description(t("browserObserveCli.consoleDescription"))
    .option("--level <level>", t("browserObserveCli.levelOpt"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (opts, cmd) => {
      const parent = parentOpts(cmd);
      const profile = parent?.browserProfile;
      await runBrowserObserve(async () => {
        const result = await callBrowserRequest<{ messages: unknown[] }>(
          parent,
          {
            method: "GET",
            path: "/console",
            query: {
              level: opts.level?.trim() || undefined,
              targetId: opts.targetId?.trim() || undefined,
              profile,
            },
          },
          { timeoutMs: 20000 },
        );
        if (parent?.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
          return;
        }
        defaultRuntime.log(JSON.stringify(result.messages, null, 2));
      });
    });

  browser
    .command("pdf")
    .description(t("browserObserveCli.pdfDescription"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (opts, cmd) => {
      const parent = parentOpts(cmd);
      const profile = parent?.browserProfile;
      await runBrowserObserve(async () => {
        const result = await callBrowserRequest<{ path: string }>(
          parent,
          {
            method: "POST",
            path: "/pdf",
            query: profile ? { profile } : undefined,
            body: { targetId: opts.targetId?.trim() || undefined },
          },
          { timeoutMs: 20000 },
        );
        if (parent?.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
          return;
        }
        defaultRuntime.log(`PDF: ${shortenHomePath(result.path)}`);
      });
    });

  browser
    .command("responsebody")
    .description(t("browserObserveCli.responsebodyDescription"))
    .argument("<url>", t("browserObserveCli.urlArg"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .option("--timeout-ms <ms>", t("browserObserveCli.timeoutMsOpt"), (v: string) => Number(v))
    .option("--max-chars <n>", t("browserObserveCli.maxCharsOpt"), (v: string) => Number(v))
    .action(async (url: string, opts, cmd) => {
      const parent = parentOpts(cmd);
      const profile = parent?.browserProfile;
      await runBrowserObserve(async () => {
        const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : undefined;
        const maxChars = Number.isFinite(opts.maxChars) ? opts.maxChars : undefined;
        const result = await callBrowserRequest<{ response: { body: string } }>(
          parent,
          {
            method: "POST",
            path: "/response/body",
            query: profile ? { profile } : undefined,
            body: {
              url,
              targetId: opts.targetId?.trim() || undefined,
              timeoutMs,
              maxChars,
            },
          },
          { timeoutMs: timeoutMs ?? 20000 },
        );
        if (parent?.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
          return;
        }
        defaultRuntime.log(result.response.body);
      });
    });
}
