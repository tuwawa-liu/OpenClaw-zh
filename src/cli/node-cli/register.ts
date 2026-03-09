import type { Command } from "commander";
import { t } from "../../i18n/index.js";
import { loadNodeHostConfig } from "../../node-host/config.js";
import { runNodeHost } from "../../node-host/runner.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { parsePort } from "../daemon-cli/shared.js";
import { formatHelpExamples } from "../help-format.js";
import {
  runNodeDaemonInstall,
  runNodeDaemonRestart,
  runNodeDaemonStatus,
  runNodeDaemonStop,
  runNodeDaemonUninstall,
} from "./daemon.js";

function parsePortWithFallback(value: unknown, fallback: number): number {
  const parsed = parsePort(value);
  return parsed ?? fallback;
}

export function registerNodeCli(program: Command) {
  const node = program
    .command("node")
    .description(t("nodeCli.description"))
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          [
            "openclaw node run --host 127.0.0.1 --port 18789",
            "Run the node host in the foreground.",
          ],
          ["openclaw node status", "Check node host service status."],
          ["openclaw node install", "Install the node host service."],
          ["openclaw node restart", "Restart the installed node host service."],
        ])}\n\n${theme.muted("Docs:")} ${formatDocsLink("/cli/node", "docs.openclaw.ai/cli/node")}\n`,
    );

  node
    .command("run")
    .description(t("nodeCli.runDescription"))
    .option("--host <host>", t("nodeCli.runHostOpt"))
    .option("--port <port>", t("nodeCli.runPortOpt"))
    .option("--tls", t("nodeCli.runTlsOpt"), false)
    .option("--tls-fingerprint <sha256>", t("nodeCli.runTlsFingerprintOpt"))
    .option("--node-id <id>", t("nodeCli.runNodeIdOpt"))
    .option("--display-name <name>", t("nodeCli.runDisplayNameOpt"))
    .action(async (opts) => {
      const existing = await loadNodeHostConfig();
      const host =
        (opts.host as string | undefined)?.trim() || existing?.gateway?.host || "127.0.0.1";
      const port = parsePortWithFallback(opts.port, existing?.gateway?.port ?? 18789);
      await runNodeHost({
        gatewayHost: host,
        gatewayPort: port,
        gatewayTls: Boolean(opts.tls) || Boolean(opts.tlsFingerprint),
        gatewayTlsFingerprint: opts.tlsFingerprint,
        nodeId: opts.nodeId,
        displayName: opts.displayName,
      });
    });

  node
    .command("status")
    .description(t("nodeCli.statusDescription"))
    .option("--json", t("nodeCli.jsonOpt"), false)
    .action(async (opts) => {
      await runNodeDaemonStatus(opts);
    });

  node
    .command("install")
    .description(t("nodeCli.installDescription"))
    .option("--host <host>", t("nodeCli.runHostOpt"))
    .option("--port <port>", t("nodeCli.runPortOpt"))
    .option("--tls", t("nodeCli.runTlsOpt"), false)
    .option("--tls-fingerprint <sha256>", t("nodeCli.runTlsFingerprintOpt"))
    .option("--node-id <id>", t("nodeCli.runNodeIdOpt"))
    .option("--display-name <name>", t("nodeCli.runDisplayNameOpt"))
    .option("--runtime <runtime>", t("nodeCli.installRuntimeOpt"))
    .option("--force", t("nodeCli.installForceOpt"), false)
    .option("--json", t("nodeCli.jsonOpt"), false)
    .action(async (opts) => {
      await runNodeDaemonInstall(opts);
    });

  node
    .command("uninstall")
    .description(t("nodeCli.uninstallDescription"))
    .option("--json", t("nodeCli.jsonOpt"), false)
    .action(async (opts) => {
      await runNodeDaemonUninstall(opts);
    });

  node
    .command("stop")
    .description(t("nodeCli.stopDescription"))
    .option("--json", t("nodeCli.jsonOpt"), false)
    .action(async (opts) => {
      await runNodeDaemonStop(opts);
    });

  node
    .command("restart")
    .description(t("nodeCli.restartDescription"))
    .option("--json", t("nodeCli.jsonOpt"), false)
    .action(async (opts) => {
      await runNodeDaemonRestart(opts);
    });
}
