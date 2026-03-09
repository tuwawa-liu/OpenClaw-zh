import type { Command } from "commander";
import { t } from "../../i18n/index.js";
import { inheritOptionFromParent } from "../command-options.js";
import {
  runDaemonInstall,
  runDaemonRestart,
  runDaemonStart,
  runDaemonStatus,
  runDaemonStop,
  runDaemonUninstall,
} from "./runners.js";
import type { DaemonInstallOptions, GatewayRpcOpts } from "./types.js";

function resolveInstallOptions(
  cmdOpts: DaemonInstallOptions,
  command?: Command,
): DaemonInstallOptions {
  const parentForce = inheritOptionFromParent<boolean>(command, "force");
  const parentPort = inheritOptionFromParent<string>(command, "port");
  const parentToken = inheritOptionFromParent<string>(command, "token");
  return {
    ...cmdOpts,
    force: Boolean(cmdOpts.force || parentForce),
    port: cmdOpts.port ?? parentPort,
    token: cmdOpts.token ?? parentToken,
  };
}

function resolveRpcOptions(cmdOpts: GatewayRpcOpts, command?: Command): GatewayRpcOpts {
  const parentToken = inheritOptionFromParent<string>(command, "token");
  const parentPassword = inheritOptionFromParent<string>(command, "password");
  return {
    ...cmdOpts,
    token: cmdOpts.token ?? parentToken,
    password: cmdOpts.password ?? parentPassword,
  };
}

export function addGatewayServiceCommands(parent: Command, opts?: { statusDescription?: string }) {
  parent
    .command("status")
    .description(opts?.statusDescription ?? t("daemonCli.statusDescription"))
    .option("--url <url>", t("daemonCli.statusUrlOpt"))
    .option("--token <token>", t("daemonCli.statusTokenOpt"))
    .option("--password <password>", t("daemonCli.statusPasswordOpt"))
    .option("--timeout <ms>", t("daemonCli.statusTimeoutOpt"), "10000")
    .option("--no-probe", t("daemonCli.statusNoProbeOpt"))
    .option("--deep", t("daemonCli.statusDeepOpt"), false)
    .option("--json", t("daemonCli.jsonOpt"), false)
    .action(async (cmdOpts, command) => {
      await runDaemonStatus({
        rpc: resolveRpcOptions(cmdOpts, command),
        probe: Boolean(cmdOpts.probe),
        deep: Boolean(cmdOpts.deep),
        json: Boolean(cmdOpts.json),
      });
    });

  parent
    .command("install")
    .description(t("daemonCli.installDescription"))
    .option("--port <port>", t("daemonCli.installPortOpt"))
    .option("--runtime <runtime>", t("daemonCli.installRuntimeOpt"))
    .option("--token <token>", t("daemonCli.installTokenOpt"))
    .option("--force", t("daemonCli.installForceOpt"), false)
    .option("--json", t("daemonCli.jsonOpt"), false)
    .action(async (cmdOpts, command) => {
      await runDaemonInstall(resolveInstallOptions(cmdOpts, command));
    });

  parent
    .command("uninstall")
    .description(t("daemonCli.uninstallDescription"))
    .option("--json", t("daemonCli.jsonOpt"), false)
    .action(async (cmdOpts) => {
      await runDaemonUninstall(cmdOpts);
    });

  parent
    .command("start")
    .description(t("daemonCli.startDescription"))
    .option("--json", t("daemonCli.jsonOpt"), false)
    .action(async (cmdOpts) => {
      await runDaemonStart(cmdOpts);
    });

  parent
    .command("stop")
    .description(t("daemonCli.stopDescription"))
    .option("--json", t("daemonCli.jsonOpt"), false)
    .action(async (cmdOpts) => {
      await runDaemonStop(cmdOpts);
    });

  parent
    .command("restart")
    .description(t("daemonCli.restartDescription"))
    .option("--json", t("daemonCli.jsonOpt"), false)
    .action(async (cmdOpts) => {
      await runDaemonRestart(cmdOpts);
    });
}
