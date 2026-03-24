import type { Command } from "commander";
import { danger } from "../globals.js";
import { t } from "../i18n/index.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import type { GatewayRpcOpts } from "./gateway-rpc.js";
import { addGatewayClientOptions, callGatewayFromCli } from "./gateway-rpc.js";

type SystemEventOpts = GatewayRpcOpts & { text?: string; mode?: string; json?: boolean };
type SystemGatewayOpts = GatewayRpcOpts & { json?: boolean };

const normalizeWakeMode = (raw: unknown) => {
  const mode = typeof raw === "string" ? raw.trim() : "";
  if (!mode) {
    return "next-heartbeat" as const;
  }
  if (mode === "now" || mode === "next-heartbeat") {
    return mode;
  }
  throw new Error(t("system.invalidMode"));
};

async function runSystemGatewayCommand(
  opts: SystemGatewayOpts,
  action: () => Promise<unknown>,
  successText?: string,
): Promise<void> {
  try {
    const result = await action();
    if (opts.json || successText === undefined) {
      defaultRuntime.writeJson(result);
    } else {
      defaultRuntime.log(successText);
    }
  } catch (err) {
    defaultRuntime.error(danger(String(err)));
    defaultRuntime.exit(1);
  }
}

export function registerSystemCli(program: Command) {
  const system = program
    .command("system")
    .description(t("systemCli.description"))
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/system", "docs.openclaw.ai/cli/system")}\n`,
    );

  addGatewayClientOptions(
    system
      .command("event")
      .description(t("systemCli.eventDescription"))
      .requiredOption("--text <text>", t("systemCli.eventTextOpt"))
      .option("--mode <mode>", t("systemCli.eventModeOpt"), "next-heartbeat")
      .option("--json", t("systemCli.outputJson"), false),
  ).action(async (opts: SystemEventOpts) => {
    await runSystemGatewayCommand(
      opts,
      async () => {
        const text = typeof opts.text === "string" ? opts.text.trim() : "";
        if (!text) {
          throw new Error(t("system.textRequired"));
        }
        const mode = normalizeWakeMode(opts.mode);
        return await callGatewayFromCli("wake", opts, { mode, text }, { expectFinal: false });
      },
      "ok",
    );
  });

  const heartbeat = system.command("heartbeat").description(t("systemCli.heartbeatDescription"));

  addGatewayClientOptions(
    heartbeat
      .command("last")
      .description(t("systemCli.heartbeatLastDescription"))
      .option("--json", t("systemCli.outputJson"), false),
  ).action(async (opts: SystemGatewayOpts) => {
    await runSystemGatewayCommand(opts, async () => {
      return await callGatewayFromCli("last-heartbeat", opts, undefined, {
        expectFinal: false,
      });
    });
  });

  addGatewayClientOptions(
    heartbeat
      .command("enable")
      .description(t("systemCli.heartbeatEnableDescription"))
      .option("--json", t("systemCli.outputJson"), false),
  ).action(async (opts: SystemGatewayOpts) => {
    await runSystemGatewayCommand(opts, async () => {
      return await callGatewayFromCli(
        "set-heartbeats",
        opts,
        { enabled: true },
        { expectFinal: false },
      );
    });
  });

  addGatewayClientOptions(
    heartbeat
      .command("disable")
      .description(t("systemCli.heartbeatDisableDescription"))
      .option("--json", t("systemCli.outputJson"), false),
  ).action(async (opts: SystemGatewayOpts) => {
    await runSystemGatewayCommand(opts, async () => {
      return await callGatewayFromCli(
        "set-heartbeats",
        opts,
        { enabled: false },
        { expectFinal: false },
      );
    });
  });

  addGatewayClientOptions(
    system
      .command("presence")
      .description(t("systemCli.presenceDescription"))
      .option("--json", t("systemCli.outputJson"), false),
  ).action(async (opts: SystemGatewayOpts) => {
    await runSystemGatewayCommand(opts, async () => {
      return await callGatewayFromCli("system-presence", opts, undefined, {
        expectFinal: false,
      });
    });
  });
}
