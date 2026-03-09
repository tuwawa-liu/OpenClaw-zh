import type { Command } from "commander";
import { danger } from "../globals.js";
import { t } from "../i18n/index.js";
import { defaultRuntime } from "../runtime.js";
import { shortenHomePath } from "../utils.js";
import { callBrowserRequest, type BrowserParentOpts } from "./browser-cli-shared.js";
import { runCommandWithRuntime } from "./cli-utils.js";

const BROWSER_DEBUG_TIMEOUT_MS = 20000;

type BrowserRequestParams = Parameters<typeof callBrowserRequest>[1];

type DebugContext = {
  parent: BrowserParentOpts;
  profile?: string;
};

function runBrowserDebug(action: () => Promise<void>) {
  return runCommandWithRuntime(defaultRuntime, action, (err) => {
    defaultRuntime.error(danger(String(err)));
    defaultRuntime.exit(1);
  });
}

async function withDebugContext(
  cmd: Command,
  parentOpts: (cmd: Command) => BrowserParentOpts,
  action: (context: DebugContext) => Promise<void>,
) {
  const parent = parentOpts(cmd);
  await runBrowserDebug(() =>
    action({
      parent,
      profile: parent.browserProfile,
    }),
  );
}

function printJsonResult(parent: BrowserParentOpts, result: unknown): boolean {
  if (!parent.json) {
    return false;
  }
  defaultRuntime.log(JSON.stringify(result, null, 2));
  return true;
}

async function callDebugRequest<T>(
  parent: BrowserParentOpts,
  params: BrowserRequestParams,
): Promise<T> {
  return callBrowserRequest<T>(parent, params, { timeoutMs: BROWSER_DEBUG_TIMEOUT_MS });
}

function resolveProfileQuery(profile?: string) {
  return profile ? { profile } : undefined;
}

function resolveDebugQuery(params: {
  targetId?: unknown;
  clear?: unknown;
  profile?: string;
  filter?: unknown;
}) {
  return {
    targetId: typeof params.targetId === "string" ? params.targetId.trim() || undefined : undefined,
    filter: typeof params.filter === "string" ? params.filter.trim() || undefined : undefined,
    clear: Boolean(params.clear),
    profile: params.profile,
  };
}

export function registerBrowserDebugCommands(
  browser: Command,
  parentOpts: (cmd: Command) => BrowserParentOpts,
) {
  browser
    .command("highlight")
    .description(t("browserDebugCli.highlightDescription"))
    .argument("<ref>", t("browserDebugCli.refArg"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (ref: string, opts, cmd) => {
      await withDebugContext(cmd, parentOpts, async ({ parent, profile }) => {
        const result = await callDebugRequest(parent, {
          method: "POST",
          path: "/highlight",
          query: resolveProfileQuery(profile),
          body: {
            ref: ref.trim(),
            targetId: opts.targetId?.trim() || undefined,
          },
        });
        if (printJsonResult(parent, result)) {
          return;
        }
        defaultRuntime.log(`highlighted ${ref.trim()}`);
      });
    });

  browser
    .command("errors")
    .description(t("browserDebugCli.errorsDescription"))
    .option("--clear", t("browserDebugCli.clearOpt"), false)
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (opts, cmd) => {
      await withDebugContext(cmd, parentOpts, async ({ parent, profile }) => {
        const result = await callDebugRequest<{
          errors: Array<{ timestamp: string; name?: string; message: string }>;
        }>(parent, {
          method: "GET",
          path: "/errors",
          query: resolveDebugQuery({
            targetId: opts.targetId,
            clear: opts.clear,
            profile,
          }),
        });
        if (printJsonResult(parent, result)) {
          return;
        }
        if (!result.errors.length) {
          defaultRuntime.log("No page errors.");
          return;
        }
        defaultRuntime.log(
          result.errors
            .map((e) => `${e.timestamp} ${e.name ? `${e.name}: ` : ""}${e.message}`)
            .join("\n"),
        );
      });
    });

  browser
    .command("requests")
    .description(t("browserDebugCli.requestsDescription"))
    .option("--filter <text>", t("browserDebugCli.filterOpt"))
    .option("--clear", t("browserDebugCli.clearOpt"), false)
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (opts, cmd) => {
      await withDebugContext(cmd, parentOpts, async ({ parent, profile }) => {
        const result = await callDebugRequest<{
          requests: Array<{
            timestamp: string;
            method: string;
            status?: number;
            ok?: boolean;
            url: string;
            failureText?: string;
          }>;
        }>(parent, {
          method: "GET",
          path: "/requests",
          query: resolveDebugQuery({
            targetId: opts.targetId,
            filter: opts.filter,
            clear: opts.clear,
            profile,
          }),
        });
        if (printJsonResult(parent, result)) {
          return;
        }
        if (!result.requests.length) {
          defaultRuntime.log("No requests recorded.");
          return;
        }
        defaultRuntime.log(
          result.requests
            .map((r) => {
              const status = typeof r.status === "number" ? ` ${r.status}` : "";
              const ok = r.ok === true ? " ok" : r.ok === false ? " fail" : "";
              const fail = r.failureText ? ` (${r.failureText})` : "";
              return `${r.timestamp} ${r.method}${status}${ok} ${r.url}${fail}`;
            })
            .join("\n"),
        );
      });
    });

  const trace = browser.command("trace").description(t("browserDebugCli.traceDescription"));

  trace
    .command("start")
    .description(t("browserDebugCli.traceStartDescription"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .option("--no-screenshots", t("browserDebugCli.noScreenshotsOpt"))
    .option("--no-snapshots", t("browserDebugCli.noSnapshotsOpt"))
    .option("--sources", t("browserDebugCli.sourcesOpt"), false)
    .action(async (opts, cmd) => {
      await withDebugContext(cmd, parentOpts, async ({ parent, profile }) => {
        const result = await callDebugRequest(parent, {
          method: "POST",
          path: "/trace/start",
          query: resolveProfileQuery(profile),
          body: {
            targetId: opts.targetId?.trim() || undefined,
            screenshots: Boolean(opts.screenshots),
            snapshots: Boolean(opts.snapshots),
            sources: Boolean(opts.sources),
          },
        });
        if (printJsonResult(parent, result)) {
          return;
        }
        defaultRuntime.log("trace started");
      });
    });

  trace
    .command("stop")
    .description(t("browserDebugCli.traceStopDescription"))
    .option("--out <path>", t("browserDebugCli.traceOutOpt"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (opts, cmd) => {
      await withDebugContext(cmd, parentOpts, async ({ parent, profile }) => {
        const result = await callDebugRequest<{ path: string }>(parent, {
          method: "POST",
          path: "/trace/stop",
          query: resolveProfileQuery(profile),
          body: {
            targetId: opts.targetId?.trim() || undefined,
            path: opts.out?.trim() || undefined,
          },
        });
        if (printJsonResult(parent, result)) {
          return;
        }
        defaultRuntime.log(`TRACE:${shortenHomePath(result.path)}`);
      });
    });
}
