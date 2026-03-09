import type { Command } from "commander";
import { t } from "../../i18n/index.js";
import { defaultRuntime } from "../../runtime.js";
import { addGatewayClientOptions, callGatewayFromCli } from "../gateway-rpc.js";
import { handleCronCliError, printCronJson, warnIfCronSchedulerDisabled } from "./shared.js";

function registerCronToggleCommand(params: {
  cron: Command;
  name: "enable" | "disable";
  description: string;
  enabled: boolean;
}) {
  addGatewayClientOptions(
    params.cron
      .command(params.name)
      .description(params.description)
      .argument("<id>", t("cronCli.jobIdArg"))
      .action(async (id, opts) => {
        try {
          const res = await callGatewayFromCli("cron.update", opts, {
            id,
            patch: { enabled: params.enabled },
          });
          printCronJson(res);
          await warnIfCronSchedulerDisabled(opts);
        } catch (err) {
          handleCronCliError(err);
        }
      }),
  );
}

export function registerCronSimpleCommands(cron: Command) {
  addGatewayClientOptions(
    cron
      .command("rm")
      .alias("remove")
      .alias("delete")
      .description(t("cronSimpleCli.rmDescription"))
      .argument("<id>", t("cronCli.jobIdArg"))
      .option("--json", t("cronCli.jsonOpt"), false)
      .action(async (id, opts) => {
        try {
          const res = await callGatewayFromCli("cron.remove", opts, { id });
          printCronJson(res);
        } catch (err) {
          handleCronCliError(err);
        }
      }),
  );

  registerCronToggleCommand({
    cron,
    name: "enable",
    description: t("cronSimpleCli.enableDescription"),
    enabled: true,
  });
  registerCronToggleCommand({
    cron,
    name: "disable",
    description: t("cronSimpleCli.disableDescription"),
    enabled: false,
  });

  addGatewayClientOptions(
    cron
      .command("runs")
      .description(t("cronSimpleCli.runsDescription"))
      .requiredOption("--id <id>", t("cronCli.jobIdArg"))
      .option("--limit <n>", t("cronSimpleCli.runsLimitOpt"), "50")
      .action(async (opts) => {
        try {
          const limitRaw = Number.parseInt(String(opts.limit ?? "50"), 10);
          const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;
          const id = String(opts.id);
          const res = await callGatewayFromCli("cron.runs", opts, {
            id,
            limit,
          });
          printCronJson(res);
        } catch (err) {
          handleCronCliError(err);
        }
      }),
  );

  addGatewayClientOptions(
    cron
      .command("run")
      .description(t("cronSimpleCli.runDescription"))
      .argument("<id>", t("cronCli.jobIdArg"))
      .option("--due", t("cronSimpleCli.runDueOpt"), false)
      .action(async (id, opts, command) => {
        try {
          if (command.getOptionValueSource("timeout") === "default") {
            opts.timeout = "600000";
          }
          const res = await callGatewayFromCli("cron.run", opts, {
            id,
            mode: opts.due ? "due" : "force",
          });
          printCronJson(res);
          const result = res as { ok?: boolean; ran?: boolean; enqueued?: boolean } | undefined;
          defaultRuntime.exit(result?.ok && (result?.ran || result?.enqueued) ? 0 : 1);
        } catch (err) {
          handleCronCliError(err);
        }
      }),
  );
}
