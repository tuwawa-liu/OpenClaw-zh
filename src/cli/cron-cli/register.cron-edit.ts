import type { Command } from "commander";
import type { CronJob } from "../../cron/types.js";
import { danger } from "../../globals.js";
import { t } from "../../i18n/index.js";
import { sanitizeAgentId } from "../../routing/session-key.js";
import { defaultRuntime } from "../../runtime.js";
import { addGatewayClientOptions, callGatewayFromCli } from "../gateway-rpc.js";
import {
  getCronChannelOptions,
  parseAt,
  parseCronStaggerMs,
  parseDurationMs,
  warnIfCronSchedulerDisabled,
} from "./shared.js";

const assignIf = (
  target: Record<string, unknown>,
  key: string,
  value: unknown,
  shouldAssign: boolean,
) => {
  if (shouldAssign) {
    target[key] = value;
  }
};

export function registerCronEditCommand(cron: Command) {
  addGatewayClientOptions(
    cron
      .command("edit")
      .description(t("cronEditCli.description"))
      .argument("<id>", t("cronEditCli.idArg"))
      .option("--name <name>", t("cronEditCli.nameOpt"))
      .option("--description <text>", t("cronEditCli.descriptionOpt"))
      .option("--enable", t("cronEditCli.enableOpt"), false)
      .option("--disable", t("cronEditCli.disableOpt"), false)
      .option("--delete-after-run", t("cronCli.addDeleteAfterRunOpt"), false)
      .option("--keep-after-run", t("cronCli.addKeepAfterRunOpt"), false)
      .option("--session <target>", t("cronCli.addSessionOpt"))
      .option("--agent <id>", t("cronEditCli.agentOpt"))
      .option("--clear-agent", t("cronEditCli.clearAgentOpt"), false)
      .option("--session-key <key>", t("cronEditCli.sessionKeyOpt"))
      .option("--clear-session-key", t("cronEditCli.clearSessionKeyOpt"), false)
      .option("--wake <mode>", t("cronCli.addWakeOpt"))
      .option("--at <when>", t("cronEditCli.atOpt"))
      .option("--every <duration>", t("cronEditCli.everyOpt"))
      .option("--cron <expr>", t("cronEditCli.cronOpt"))
      .option("--tz <iana>", t("cronCli.addTzOpt"))
      .option("--stagger <duration>", t("cronCli.addStaggerOpt"))
      .option("--exact", t("cronCli.addExactOpt"))
      .option("--system-event <text>", t("cronEditCli.systemEventOpt"))
      .option("--message <text>", t("cronEditCli.messageOpt"))
      .option("--thinking <level>", t("cronEditCli.thinkingOpt"))
      .option("--model <model>", t("cronEditCli.modelOpt"))
      .option("--timeout-seconds <n>", t("cronCli.addTimeoutSecondsOpt"))
      .option("--light-context", t("cronEditCli.lightContextOpt"))
      .option("--no-light-context", t("cronEditCli.noLightContextOpt"))
      .option("--announce", t("cronCli.addAnnounceOpt"))
      .option("--deliver", t("cronCli.addDeliverOpt"))
      .option("--no-deliver", t("cronEditCli.noDeliverOpt"))
      .option("--channel <channel>", `投递渠道 (${getCronChannelOptions()})`)
      .option("--to <dest>", t("cronCli.addToOpt"))
      .option("--account <id>", t("cronCli.addAccountOpt"))
      .option("--best-effort-deliver", t("cronEditCli.bestEffortDeliverOpt"))
      .option("--no-best-effort-deliver", t("cronEditCli.noBestEffortDeliverOpt"))
      .option("--failure-alert", t("cronEditCli.failureAlertOpt"))
      .option("--no-failure-alert", t("cronEditCli.noFailureAlertOpt"))
      .option("--failure-alert-after <n>", t("cronEditCli.failureAlertAfterOpt"))
      .option(
        "--failure-alert-channel <channel>",
        `Failure alert channel (${getCronChannelOptions()})`,
      )
      .option("--failure-alert-to <dest>", t("cronEditCli.failureAlertToOpt"))
      .option("--failure-alert-cooldown <duration>", t("cronEditCli.failureAlertCooldownOpt"))
      .option("--failure-alert-mode <mode>", t("cronEditCli.failureAlertModeOpt"))
      .option("--failure-alert-account-id <id>", t("cronEditCli.failureAlertAccountIdOpt"))
      .action(async (id, opts) => {
        try {
          if (opts.session === "main" && opts.message) {
            throw new Error(t("cronEdit.mainJobsCannotUseMessage"));
          }
          if (opts.session === "isolated" && opts.systemEvent) {
            throw new Error(t("cronEdit.isolatedJobsCannotUseSystemEvent"));
          }
          if (opts.announce && typeof opts.deliver === "boolean") {
            throw new Error(t("cronEdit.chooseAnnounceOrNoDeliver"));
          }
          const staggerRaw = typeof opts.stagger === "string" ? opts.stagger.trim() : "";
          const useExact = Boolean(opts.exact);
          if (staggerRaw && useExact) {
            throw new Error(t("cronEdit.chooseStaggerOrExact"));
          }
          const requestedStaggerMs = parseCronStaggerMs({ staggerRaw, useExact });

          const patch: Record<string, unknown> = {};
          if (typeof opts.name === "string") {
            patch.name = opts.name;
          }
          if (typeof opts.description === "string") {
            patch.description = opts.description;
          }
          if (opts.enable && opts.disable) {
            throw new Error("请选择 --enable 或 --disable，不能同时使用");
          }
          if (opts.enable) {
            patch.enabled = true;
          }
          if (opts.disable) {
            patch.enabled = false;
          }
          if (opts.deleteAfterRun && opts.keepAfterRun) {
            throw new Error("请选择 --delete-after-run 或 --keep-after-run，不能同时使用");
          }
          if (opts.deleteAfterRun) {
            patch.deleteAfterRun = true;
          }
          if (opts.keepAfterRun) {
            patch.deleteAfterRun = false;
          }
          if (typeof opts.session === "string") {
            patch.sessionTarget = opts.session;
          }
          if (typeof opts.wake === "string") {
            patch.wakeMode = opts.wake;
          }
          if (opts.agent && opts.clearAgent) {
            throw new Error("请使用 --agent 或 --clear-agent，不能同时使用");
          }
          if (typeof opts.agent === "string" && opts.agent.trim()) {
            patch.agentId = sanitizeAgentId(opts.agent.trim());
          }
          if (opts.clearAgent) {
            patch.agentId = null;
          }
          if (opts.sessionKey && opts.clearSessionKey) {
            throw new Error("请使用 --session-key 或 --clear-session-key，不能同时使用");
          }
          if (typeof opts.sessionKey === "string" && opts.sessionKey.trim()) {
            patch.sessionKey = opts.sessionKey.trim();
          }
          if (opts.clearSessionKey) {
            patch.sessionKey = null;
          }

          const scheduleChosen = [opts.at, opts.every, opts.cron].filter(Boolean).length;
          if (scheduleChosen > 1) {
            throw new Error("最多只能选择一种调度更改");
          }
          if (
            (requestedStaggerMs !== undefined || typeof opts.tz === "string") &&
            (opts.at || opts.every)
          ) {
            throw new Error("--stagger/--exact/--tz are only valid for cron schedules");
          }
          if (opts.at) {
            const atIso = parseAt(String(opts.at));
            if (!atIso) {
              throw new Error("无效的 --at");
            }
            patch.schedule = { kind: "at", at: atIso };
          } else if (opts.every) {
            const everyMs = parseDurationMs(String(opts.every));
            if (!everyMs) {
              throw new Error("无效的 --every");
            }
            patch.schedule = { kind: "every", everyMs };
          } else if (opts.cron) {
            patch.schedule = {
              kind: "cron",
              expr: String(opts.cron),
              tz: typeof opts.tz === "string" && opts.tz.trim() ? opts.tz.trim() : undefined,
              staggerMs: requestedStaggerMs,
            };
          } else if (requestedStaggerMs !== undefined || typeof opts.tz === "string") {
            const listed = (await callGatewayFromCli("cron.list", opts, {
              includeDisabled: true,
            })) as { jobs?: CronJob[] } | null;
            const existing = (listed?.jobs ?? []).find((job) => job.id === id);
            if (!existing) {
              throw new Error(`unknown cron job id: ${id}`);
            }
            if (existing.schedule.kind !== "cron") {
              throw new Error("当前任务不是 cron 调度；请先使用 --cron 进行转换");
            }
            const tz =
              typeof opts.tz === "string" ? opts.tz.trim() || undefined : existing.schedule.tz;
            patch.schedule = {
              kind: "cron",
              expr: existing.schedule.expr,
              tz,
              staggerMs:
                requestedStaggerMs !== undefined ? requestedStaggerMs : existing.schedule.staggerMs,
            };
          }

          const hasSystemEventPatch = typeof opts.systemEvent === "string";
          const model =
            typeof opts.model === "string" && opts.model.trim() ? opts.model.trim() : undefined;
          const thinking =
            typeof opts.thinking === "string" && opts.thinking.trim()
              ? opts.thinking.trim()
              : undefined;
          const timeoutSeconds = opts.timeoutSeconds
            ? Number.parseInt(String(opts.timeoutSeconds), 10)
            : undefined;
          const hasTimeoutSeconds = Boolean(timeoutSeconds && Number.isFinite(timeoutSeconds));
          const hasDeliveryModeFlag = opts.announce || typeof opts.deliver === "boolean";
          const hasDeliveryTarget = typeof opts.channel === "string" || typeof opts.to === "string";
          const hasDeliveryAccount = typeof opts.account === "string";
          const hasBestEffort = typeof opts.bestEffortDeliver === "boolean";
          const hasAgentTurnPatch =
            typeof opts.message === "string" ||
            Boolean(model) ||
            Boolean(thinking) ||
            hasTimeoutSeconds ||
            typeof opts.lightContext === "boolean" ||
            hasDeliveryModeFlag ||
            hasDeliveryTarget ||
            hasDeliveryAccount ||
            hasBestEffort;
          if (hasSystemEventPatch && hasAgentTurnPatch) {
            throw new Error("最多只能选择一种负载更改");
          }
          if (hasSystemEventPatch) {
            patch.payload = {
              kind: "systemEvent",
              text: String(opts.systemEvent),
            };
          } else if (hasAgentTurnPatch) {
            const payload: Record<string, unknown> = { kind: "agentTurn" };
            assignIf(payload, "message", String(opts.message), typeof opts.message === "string");
            assignIf(payload, "model", model, Boolean(model));
            assignIf(payload, "thinking", thinking, Boolean(thinking));
            assignIf(payload, "timeoutSeconds", timeoutSeconds, hasTimeoutSeconds);
            assignIf(
              payload,
              "lightContext",
              opts.lightContext,
              typeof opts.lightContext === "boolean",
            );
            patch.payload = payload;
          }

          if (hasDeliveryModeFlag || hasDeliveryTarget || hasDeliveryAccount || hasBestEffort) {
            const delivery: Record<string, unknown> = {};
            if (hasDeliveryModeFlag) {
              delivery.mode = opts.announce || opts.deliver === true ? "announce" : "none";
            } else if (hasBestEffort) {
              // Back-compat: toggling best-effort alone has historically implied announce mode.
              delivery.mode = "announce";
            }
            if (typeof opts.channel === "string") {
              const channel = opts.channel.trim();
              delivery.channel = channel ? channel : undefined;
            }
            if (typeof opts.to === "string") {
              const to = opts.to.trim();
              delivery.to = to ? to : undefined;
            }
            if (typeof opts.account === "string") {
              const account = opts.account.trim();
              delivery.accountId = account ? account : undefined;
            }
            if (typeof opts.bestEffortDeliver === "boolean") {
              delivery.bestEffort = opts.bestEffortDeliver;
            }
            patch.delivery = delivery;
          }

          const hasFailureAlertAfter = typeof opts.failureAlertAfter === "string";
          const hasFailureAlertChannel = typeof opts.failureAlertChannel === "string";
          const hasFailureAlertTo = typeof opts.failureAlertTo === "string";
          const hasFailureAlertCooldown = typeof opts.failureAlertCooldown === "string";
          const hasFailureAlertMode = typeof opts.failureAlertMode === "string";
          const hasFailureAlertAccountId = typeof opts.failureAlertAccountId === "string";
          const hasFailureAlertFields =
            hasFailureAlertAfter ||
            hasFailureAlertChannel ||
            hasFailureAlertTo ||
            hasFailureAlertCooldown ||
            hasFailureAlertMode ||
            hasFailureAlertAccountId;
          const failureAlertFlag =
            typeof opts.failureAlert === "boolean" ? opts.failureAlert : undefined;
          if (failureAlertFlag === false && hasFailureAlertFields) {
            throw new Error(
              "请单独使用 --no-failure-alert（不要与 failure-alert-* 选项同时使用）。",
            );
          }
          if (failureAlertFlag === false) {
            patch.failureAlert = false;
          } else if (failureAlertFlag === true || hasFailureAlertFields) {
            const failureAlert: Record<string, unknown> = {};
            if (hasFailureAlertAfter) {
              const after = Number.parseInt(String(opts.failureAlertAfter), 10);
              if (!Number.isFinite(after) || after <= 0) {
                throw new Error("无效的 --failure-alert-after（必须是正整数）。");
              }
              failureAlert.after = after;
            }
            if (hasFailureAlertChannel) {
              const channel = String(opts.failureAlertChannel).trim().toLowerCase();
              failureAlert.channel = channel ? channel : undefined;
            }
            if (hasFailureAlertTo) {
              const to = String(opts.failureAlertTo).trim();
              failureAlert.to = to ? to : undefined;
            }
            if (hasFailureAlertCooldown) {
              const cooldownMs = parseDurationMs(String(opts.failureAlertCooldown));
              if (!cooldownMs && cooldownMs !== 0) {
                throw new Error("无效的 --failure-alert-cooldown。");
              }
              failureAlert.cooldownMs = cooldownMs;
            }
            if (hasFailureAlertMode) {
              const mode = String(opts.failureAlertMode).trim().toLowerCase();
              if (mode !== "announce" && mode !== "webhook") {
                throw new Error("无效的 --failure-alert-mode（必须为 'announce' 或 'webhook'）。");
              }
              failureAlert.mode = mode;
            }
            if (hasFailureAlertAccountId) {
              const accountId = String(opts.failureAlertAccountId).trim();
              failureAlert.accountId = accountId ? accountId : undefined;
            }
            patch.failureAlert = failureAlert;
          }

          const res = await callGatewayFromCli("cron.update", opts, {
            id,
            patch,
          });
          defaultRuntime.log(JSON.stringify(res, null, 2));
          await warnIfCronSchedulerDisabled(opts);
        } catch (err) {
          defaultRuntime.error(danger(String(err)));
          defaultRuntime.exit(1);
        }
      }),
  );
}
