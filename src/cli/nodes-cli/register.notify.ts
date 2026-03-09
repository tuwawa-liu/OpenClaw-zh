import type { Command } from "commander";
import { randomIdempotencyKey } from "../../gateway/call.js";
import { t } from "../../i18n/index.js";
import { defaultRuntime } from "../../runtime.js";
import { getNodesTheme, runNodesCommand } from "./cli-utils.js";
import { callGatewayCli, nodesCallOpts, resolveNodeId } from "./rpc.js";
import type { NodesRpcOpts } from "./types.js";

export function registerNodesNotifyCommand(nodes: Command) {
  nodesCallOpts(
    nodes
      .command("notify")
      .description(t("nodesNotifyCli.description"))
      .requiredOption("--node <idOrNameOrIp>", t("nodesStatusCli.nodeOpt"))
      .option("--title <text>", t("nodesNotifyCli.titleOpt"))
      .option("--body <text>", t("nodesNotifyCli.bodyOpt"))
      .option("--sound <name>", t("nodesNotifyCli.soundOpt"))
      .option("--priority <passive|active|timeSensitive>", t("nodesNotifyCli.priorityOpt"))
      .option("--delivery <system|overlay|auto>", t("nodesNotifyCli.deliveryOpt"), "system")
      .option("--invoke-timeout <ms>", t("nodesInvokeCli.invokeTimeoutOpt"), "15000")
      .action(async (opts: NodesRpcOpts) => {
        await runNodesCommand("notify", async () => {
          const nodeId = await resolveNodeId(opts, String(opts.node ?? ""));
          const title = String(opts.title ?? "").trim();
          const body = String(opts.body ?? "").trim();
          if (!title && !body) {
            throw new Error("missing --title or --body");
          }
          const invokeTimeout = opts.invokeTimeout
            ? Number.parseInt(String(opts.invokeTimeout), 10)
            : undefined;
          const invokeParams: Record<string, unknown> = {
            nodeId,
            command: "system.notify",
            params: {
              title,
              body,
              sound: opts.sound,
              priority: opts.priority,
              delivery: opts.delivery,
            },
            idempotencyKey: String(opts.idempotencyKey ?? randomIdempotencyKey()),
          };
          if (typeof invokeTimeout === "number" && Number.isFinite(invokeTimeout)) {
            invokeParams.timeoutMs = invokeTimeout;
          }

          const result = await callGatewayCli("node.invoke", opts, invokeParams);
          if (opts.json) {
            defaultRuntime.log(JSON.stringify(result, null, 2));
            return;
          }
          const { ok } = getNodesTheme();
          defaultRuntime.log(ok("notify ok"));
        });
      }),
  );
}
