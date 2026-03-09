import fs from "node:fs/promises";
import type { Command } from "commander";
import { t } from "../../i18n/index.js";
import { defaultRuntime } from "../../runtime.js";
import { shortenHomePath } from "../../utils.js";
import { writeBase64ToFile } from "../nodes-camera.js";
import { canvasSnapshotTempPath, parseCanvasSnapshotPayload } from "../nodes-canvas.js";
import { parseTimeoutMs } from "../nodes-run.js";
import { buildA2UITextJsonl, validateA2UIJsonl } from "./a2ui-jsonl.js";
import { getNodesTheme, runNodesCommand } from "./cli-utils.js";
import { buildNodeInvokeParams, callGatewayCli, nodesCallOpts, resolveNodeId } from "./rpc.js";
import type { NodesRpcOpts } from "./types.js";

async function invokeCanvas(opts: NodesRpcOpts, command: string, params?: Record<string, unknown>) {
  const nodeId = await resolveNodeId(opts, String(opts.node ?? ""));
  const timeoutMs = parseTimeoutMs(opts.invokeTimeout);
  return await callGatewayCli(
    "node.invoke",
    opts,
    buildNodeInvokeParams({
      nodeId,
      command,
      params,
      timeoutMs: typeof timeoutMs === "number" ? timeoutMs : undefined,
    }),
  );
}

export function registerNodesCanvasCommands(nodes: Command) {
  const canvas = nodes.command("canvas").description(t("nodesCanvasCli.description"));

  nodesCallOpts(
    canvas
      .command("snapshot")
      .description(t("nodesCanvasCli.snapshotDescription"))
      .requiredOption("--node <idOrNameOrIp>", t("nodesStatusCli.nodeOpt"))
      .option("--format <png|jpg|jpeg>", t("nodesCanvasCli.formatOpt"), "jpg")
      .option("--max-width <px>", t("nodesCanvasCli.maxWidthOpt"))
      .option("--quality <0-1>", t("nodesCanvasCli.qualityOpt"))
      .option("--invoke-timeout <ms>", t("nodesCanvasCli.invokeTimeoutOpt20s"), "20000")
      .action(async (opts: NodesRpcOpts) => {
        await runNodesCommand("canvas snapshot", async () => {
          const formatOpt = String(opts.format ?? "jpg")
            .trim()
            .toLowerCase();
          const formatForParams =
            formatOpt === "jpg" ? "jpeg" : formatOpt === "jpeg" ? "jpeg" : "png";
          if (formatForParams !== "png" && formatForParams !== "jpeg") {
            throw new Error(`invalid format: ${String(opts.format)} (expected png|jpg|jpeg)`);
          }

          const maxWidth = opts.maxWidth ? Number.parseInt(String(opts.maxWidth), 10) : undefined;
          const quality = opts.quality ? Number.parseFloat(String(opts.quality)) : undefined;
          const raw = await invokeCanvas(opts, "canvas.snapshot", {
            format: formatForParams,
            maxWidth: Number.isFinite(maxWidth) ? maxWidth : undefined,
            quality: Number.isFinite(quality) ? quality : undefined,
          });
          const res = typeof raw === "object" && raw !== null ? (raw as { payload?: unknown }) : {};
          const payload = parseCanvasSnapshotPayload(res.payload);
          const filePath = canvasSnapshotTempPath({
            ext: payload.format === "jpeg" ? "jpg" : payload.format,
          });
          await writeBase64ToFile(filePath, payload.base64);

          if (opts.json) {
            defaultRuntime.log(
              JSON.stringify({ file: { path: filePath, format: payload.format } }, null, 2),
            );
            return;
          }
          defaultRuntime.log(`MEDIA:${shortenHomePath(filePath)}`);
        });
      }),
    { timeoutMs: 60_000 },
  );

  nodesCallOpts(
    canvas
      .command("present")
      .description(t("nodesCanvasCli.presentDescription"))
      .requiredOption("--node <idOrNameOrIp>", t("nodesStatusCli.nodeOpt"))
      .option("--target <urlOrPath>", t("nodesCanvasCli.targetOpt"))
      .option("--x <px>", t("nodesCanvasCli.xOpt"))
      .option("--y <px>", t("nodesCanvasCli.yOpt"))
      .option("--width <px>", t("nodesCanvasCli.widthOpt"))
      .option("--height <px>", t("nodesCanvasCli.heightOpt"))
      .option("--invoke-timeout <ms>", t("nodesCanvasCli.invokeTimeoutOpt"))
      .action(async (opts: NodesRpcOpts) => {
        await runNodesCommand("canvas present", async () => {
          const placement = {
            x: opts.x ? Number.parseFloat(opts.x) : undefined,
            y: opts.y ? Number.parseFloat(opts.y) : undefined,
            width: opts.width ? Number.parseFloat(opts.width) : undefined,
            height: opts.height ? Number.parseFloat(opts.height) : undefined,
          };
          const params: Record<string, unknown> = {};
          if (opts.target) {
            params.url = String(opts.target);
          }
          if (
            Number.isFinite(placement.x) ||
            Number.isFinite(placement.y) ||
            Number.isFinite(placement.width) ||
            Number.isFinite(placement.height)
          ) {
            params.placement = placement;
          }
          await invokeCanvas(opts, "canvas.present", params);
          if (!opts.json) {
            const { ok } = getNodesTheme();
            defaultRuntime.log(ok("canvas present ok"));
          }
        });
      }),
  );

  nodesCallOpts(
    canvas
      .command("hide")
      .description(t("nodesCanvasCli.hideDescription"))
      .requiredOption("--node <idOrNameOrIp>", t("nodesStatusCli.nodeOpt"))
      .option("--invoke-timeout <ms>", t("nodesCanvasCli.invokeTimeoutOpt"))
      .action(async (opts: NodesRpcOpts) => {
        await runNodesCommand("canvas hide", async () => {
          await invokeCanvas(opts, "canvas.hide", undefined);
          if (!opts.json) {
            const { ok } = getNodesTheme();
            defaultRuntime.log(ok("canvas hide ok"));
          }
        });
      }),
  );

  nodesCallOpts(
    canvas
      .command("navigate")
      .description(t("nodesCanvasCli.navigateDescription"))
      .argument("<url>", t("nodesCanvasCli.urlArg"))
      .requiredOption("--node <idOrNameOrIp>", t("nodesStatusCli.nodeOpt"))
      .option("--invoke-timeout <ms>", t("nodesCanvasCli.invokeTimeoutOpt"))
      .action(async (url: string, opts: NodesRpcOpts) => {
        await runNodesCommand("canvas navigate", async () => {
          await invokeCanvas(opts, "canvas.navigate", { url });
          if (!opts.json) {
            const { ok } = getNodesTheme();
            defaultRuntime.log(ok("canvas navigate ok"));
          }
        });
      }),
  );

  nodesCallOpts(
    canvas
      .command("eval")
      .description(t("nodesCanvasCli.evalDescription"))
      .argument("[js]", t("nodesCanvasCli.jsArg"))
      .option("--js <code>", t("nodesCanvasCli.jsOpt"))
      .requiredOption("--node <idOrNameOrIp>", t("nodesStatusCli.nodeOpt"))
      .option("--invoke-timeout <ms>", t("nodesCanvasCli.invokeTimeoutOpt"))
      .action(async (jsArg: string | undefined, opts: NodesRpcOpts) => {
        await runNodesCommand("canvas eval", async () => {
          const js = opts.js ?? jsArg;
          if (!js) {
            throw new Error("missing --js or <js>");
          }
          const raw = await invokeCanvas(opts, "canvas.eval", {
            javaScript: js,
          });
          if (opts.json) {
            defaultRuntime.log(JSON.stringify(raw, null, 2));
            return;
          }
          const payload =
            typeof raw === "object" && raw !== null
              ? (raw as { payload?: { result?: string } }).payload
              : undefined;
          if (payload?.result) {
            defaultRuntime.log(payload.result);
          } else {
            const { ok } = getNodesTheme();
            defaultRuntime.log(ok("canvas eval ok"));
          }
        });
      }),
  );

  const a2ui = canvas.command("a2ui").description(t("nodesCanvasCli.a2uiDescription"));

  nodesCallOpts(
    a2ui
      .command("push")
      .description(t("nodesCanvasCli.a2uiPushDescription"))
      .option("--jsonl <path>", t("nodesCanvasCli.jsonlOpt"))
      .option("--text <text>", t("nodesCanvasCli.textOpt"))
      .requiredOption("--node <idOrNameOrIp>", t("nodesStatusCli.nodeOpt"))
      .option("--invoke-timeout <ms>", t("nodesCanvasCli.invokeTimeoutOpt"))
      .action(async (opts: NodesRpcOpts) => {
        await runNodesCommand("canvas a2ui push", async () => {
          const hasJsonl = Boolean(opts.jsonl);
          const hasText = typeof opts.text === "string";
          if (hasJsonl === hasText) {
            throw new Error("provide exactly one of --jsonl or --text");
          }

          const jsonl = hasText
            ? buildA2UITextJsonl(String(opts.text ?? ""))
            : await fs.readFile(String(opts.jsonl), "utf8");
          const { version, messageCount } = validateA2UIJsonl(jsonl);
          if (version === "v0.9") {
            throw new Error(
              "Detected A2UI v0.9 JSONL (createSurface). OpenClaw currently supports v0.8 only.",
            );
          }
          await invokeCanvas(opts, "canvas.a2ui.pushJSONL", { jsonl });
          if (!opts.json) {
            const { ok } = getNodesTheme();
            defaultRuntime.log(
              ok(
                `canvas a2ui push ok (v0.8, ${messageCount} message${messageCount === 1 ? "" : "s"})`,
              ),
            );
          }
        });
      }),
  );

  nodesCallOpts(
    a2ui
      .command("reset")
      .description(t("nodesCanvasCli.a2uiResetDescription"))
      .requiredOption("--node <idOrNameOrIp>", t("nodesStatusCli.nodeOpt"))
      .option("--invoke-timeout <ms>", t("nodesCanvasCli.invokeTimeoutOpt"))
      .action(async (opts: NodesRpcOpts) => {
        await runNodesCommand("canvas a2ui reset", async () => {
          await invokeCanvas(opts, "canvas.a2ui.reset", undefined);
          if (!opts.json) {
            const { ok } = getNodesTheme();
            defaultRuntime.log(ok("canvas a2ui reset ok"));
          }
        });
      }),
  );
}
