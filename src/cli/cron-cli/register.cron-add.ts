import type { Command } from "commander";
import type { CronJob } from "../../cron/types.js";
import { t } from "../../i18n/index.js";
import { sanitizeAgentId } from "../../routing/session-key.js";
import { defaultRuntime } from "../../runtime.js";
import type { GatewayRpcOpts } from "../gateway-rpc.js";
import { addGatewayClientOptions, callGatewayFromCli } from "../gateway-rpc.js";
import { parsePositiveIntOrUndefined } from "../program/helpers.js";
import {
  getCronChannelOptions,
  handleCronCliError,
  parseAt,
  parseCronStaggerMs,
  parseDurationMs,
  printCronJson,
  printCronList,
  warnIfCronSchedulerDisabled,
} from "./shared.js";

export function registerCronStatusCommand(cron: Command) {
  addGatewayClientOptions(
    cron
      .command("status")
      .description(t("cronCli.statusDescription"))
      .option("--json", t("cronCli.jsonOpt"), false)
      .action(async (opts) => {
        try {
          const res = await callGatewayFromCli("cron.status", opts, {});
          printCronJson(res);
        } catch (err) {
          handleCronCliError(err);
        }
      }),
  );
}

export function registerCronListCommand(cron: Command) {
  addGatewayClientOptions(
    cron
      .command("list")
      .description(t("cronCli.listDescription"))
      .option("--all", t("cronCli.listAllOpt"), false)
      .option("--json", t("cronCli.jsonOpt"), false)
      .action(async (opts) => {
        try {
          const res = await callGatewayFromCli("cron.list", opts, {
            includeDisabled: Boolean(opts.all),
          });
          if (opts.json) {
            printCronJson(res);
            return;
          }
          const jobs = (res as { jobs?: CronJob[] } | null)?.jobs ?? [];
          printCronList(jobs, defaultRuntime);
        } catch (err) {
          handleCronCliError(err);
        }
      }),
  );
}

export function registerCronAddCommand(cron: Command) {
  addGatewayClientOptions(
    cron
      .command("add")
      .alias("create")
      .description(t("cronCli.addDescription"))
      .requiredOption("--name <name>", t("cronCli.addNameOpt"))
      .option("--description <text>", t("cronCli.addDescriptionOpt"))
      .option("--disabled", t("cronCli.addDisabledOpt"), false)
      .option("--delete-after-run", t("cronCli.addDeleteAfterRunOpt"), false)
      .option("--keep-after-run", t("cronCli.addKeepAfterRunOpt"), false)
      .option("--agent <id>", t("cronCli.addAgentOpt"))
      .option("--session <target>", t("cronCli.addSessionOpt"))
      .option("--session-key <key>", t("cronCli.addSessionKeyOpt"))
      .option("--wake <mode>", t("cronCli.addWakeOpt"), "now")
      .option("--at <when>", t("cronCli.addAtOpt"))
      .option("--every <duration>", t("cronCli.addEveryOpt"))
      .option("--cron <expr>", t("cronCli.addCronOpt"))
      .option("--tz <iana>", t("cronCli.addTzOpt"), "")
      .option("--stagger <duration>", t("cronCli.addStaggerOpt"))
      .option("--exact", t("cronCli.addExactOpt"), false)
      .option("--system-event <text>", t("cronCli.addSystemEventOpt"))
      .option("--message <text>", t("cronCli.addMessageOpt"))
      .option("--thinking <level>", t("cronCli.addThinkingOpt"))
      .option("--model <model>", t("cronCli.addModelOpt"))
      .option("--timeout-seconds <n>", t("cronCli.addTimeoutSecondsOpt"))
      .option("--light-context", t("cronCli.addLightContextOpt"), false)
      .option("--announce", t("cronCli.addAnnounceOpt"), false)
      .option("--deliver", t("cronCli.addDeliverOpt"))
      .option("--no-deliver", t("cronCli.addNoDeliverOpt"))
      .option("--channel <channel>", `Delivery channel (${getCronChannelOptions()})`, "last")
      .option("--to <dest>", t("cronCli.addToOpt"))
      .option("--account <id>", t("cronCli.addAccountOpt"))
      .option("--best-effort-deliver", t("cronCli.addBestEffortDeliverOpt"), false)
      .option("--json", t("cronCli.jsonOpt"), false)
      .action(async (opts: GatewayRpcOpts & Record<string, unknown>, cmd?: Command) => {
        try {
          const staggerRaw = typeof opts.stagger === "string" ? opts.stagger.trim() : "";
          const useExact = Boolean(opts.exact);
          if (staggerRaw && useExact) {
            throw new Error("Choose either --stagger or --exact, not both");
          }

          const schedule = (() => {
            const at = typeof opts.at === "string" ? opts.at : "";
            const every = typeof opts.every === "string" ? opts.every : "";
            const cronExpr = typeof opts.cron === "string" ? opts.cron : "";
            const chosen = [Boolean(at), Boolean(every), Boolean(cronExpr)].filter(Boolean).length;
            if (chosen !== 1) {
              throw new Error("Choose exactly one schedule: --at, --every, or --cron");
            }
            if ((useExact || staggerRaw) && !cronExpr) {
              throw new Error("--stagger/--exact are only valid with --cron");
            }
            if (at) {
              const atIso = parseAt(at);
              if (!atIso) {
                throw new Error("Invalid --at; use ISO time or duration like 20m");
              }
              return { kind: "at" as const, at: atIso };
            }
            if (every) {
              const everyMs = parseDurationMs(every);
              if (!everyMs) {
                throw new Error("Invalid --every; use e.g. 10m, 1h, 1d");
              }
              return { kind: "every" as const, everyMs };
            }
            const staggerMs = parseCronStaggerMs({ staggerRaw, useExact });
            return {
              kind: "cron" as const,
              expr: cronExpr,
              tz: typeof opts.tz === "string" && opts.tz.trim() ? opts.tz.trim() : undefined,
              staggerMs,
            };
          })();

          const wakeModeRaw = typeof opts.wake === "string" ? opts.wake : "now";
          const wakeMode = wakeModeRaw.trim() || "now";
          if (wakeMode !== "now" && wakeMode !== "next-heartbeat") {
            throw new Error("--wake must be now or next-heartbeat");
          }

          const agentId =
            typeof opts.agent === "string" && opts.agent.trim()
              ? sanitizeAgentId(opts.agent.trim())
              : undefined;

          const hasAnnounce = Boolean(opts.announce) || opts.deliver === true;
          const hasNoDeliver = opts.deliver === false;
          const deliveryFlagCount = [hasAnnounce, hasNoDeliver].filter(Boolean).length;
          if (deliveryFlagCount > 1) {
            throw new Error("Choose at most one of --announce or --no-deliver");
          }

          const payload = (() => {
            const systemEvent = typeof opts.systemEvent === "string" ? opts.systemEvent.trim() : "";
            const message = typeof opts.message === "string" ? opts.message.trim() : "";
            const chosen = [Boolean(systemEvent), Boolean(message)].filter(Boolean).length;
            if (chosen !== 1) {
              throw new Error("Choose exactly one payload: --system-event or --message");
            }
            if (systemEvent) {
              return { kind: "systemEvent" as const, text: systemEvent };
            }
            const timeoutSeconds = parsePositiveIntOrUndefined(opts.timeoutSeconds);
            return {
              kind: "agentTurn" as const,
              message,
              model:
                typeof opts.model === "string" && opts.model.trim() ? opts.model.trim() : undefined,
              thinking:
                typeof opts.thinking === "string" && opts.thinking.trim()
                  ? opts.thinking.trim()
                  : undefined,
              timeoutSeconds:
                timeoutSeconds && Number.isFinite(timeoutSeconds) ? timeoutSeconds : undefined,
              lightContext: opts.lightContext === true ? true : undefined,
            };
          })();

          const optionSource =
            typeof cmd?.getOptionValueSource === "function"
              ? (name: string) => cmd.getOptionValueSource(name)
              : () => undefined;
          const sessionSource = optionSource("session");
          const sessionTargetRaw = typeof opts.session === "string" ? opts.session.trim() : "";
          const inferredSessionTarget = payload.kind === "agentTurn" ? "isolated" : "main";
          const sessionTarget =
            sessionSource === "cli" ? sessionTargetRaw || "" : inferredSessionTarget;
          if (sessionTarget !== "main" && sessionTarget !== "isolated") {
            throw new Error("--session must be main or isolated");
          }

          if (opts.deleteAfterRun && opts.keepAfterRun) {
            throw new Error("Choose --delete-after-run or --keep-after-run, not both");
          }

          if (sessionTarget === "main" && payload.kind !== "systemEvent") {
            throw new Error("Main jobs require --system-event (systemEvent).");
          }
          if (sessionTarget === "isolated" && payload.kind !== "agentTurn") {
            throw new Error("Isolated jobs require --message (agentTurn).");
          }
          if (
            (opts.announce || typeof opts.deliver === "boolean") &&
            (sessionTarget !== "isolated" || payload.kind !== "agentTurn")
          ) {
            throw new Error("--announce/--no-deliver require --session isolated.");
          }

          const accountId =
            typeof opts.account === "string" && opts.account.trim()
              ? opts.account.trim()
              : undefined;

          if (accountId && (sessionTarget !== "isolated" || payload.kind !== "agentTurn")) {
            throw new Error("--account requires an isolated agentTurn job with delivery.");
          }

          const deliveryMode =
            sessionTarget === "isolated" && payload.kind === "agentTurn"
              ? hasAnnounce
                ? "announce"
                : hasNoDeliver
                  ? "none"
                  : "announce"
              : undefined;

          const nameRaw = typeof opts.name === "string" ? opts.name : "";
          const name = nameRaw.trim();
          if (!name) {
            throw new Error("--name is required");
          }

          const description =
            typeof opts.description === "string" && opts.description.trim()
              ? opts.description.trim()
              : undefined;

          const sessionKey =
            typeof opts.sessionKey === "string" && opts.sessionKey.trim()
              ? opts.sessionKey.trim()
              : undefined;

          const params = {
            name,
            description,
            enabled: !opts.disabled,
            deleteAfterRun: opts.deleteAfterRun ? true : opts.keepAfterRun ? false : undefined,
            agentId,
            sessionKey,
            schedule,
            sessionTarget,
            wakeMode,
            payload,
            delivery: deliveryMode
              ? {
                  mode: deliveryMode,
                  channel:
                    typeof opts.channel === "string" && opts.channel.trim()
                      ? opts.channel.trim()
                      : undefined,
                  to: typeof opts.to === "string" && opts.to.trim() ? opts.to.trim() : undefined,
                  accountId,
                  bestEffort: opts.bestEffortDeliver ? true : undefined,
                }
              : undefined,
          };

          const res = await callGatewayFromCli("cron.add", opts, params);
          printCronJson(res);
          await warnIfCronSchedulerDisabled(opts);
        } catch (err) {
          handleCronCliError(err);
        }
      }),
  );
}
