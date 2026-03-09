import type { Command } from "commander";
import { danger } from "../globals.js";
import {
  type GmailRunOptions,
  type GmailSetupOptions,
  runGmailService,
  runGmailSetup,
} from "../hooks/gmail-ops.js";
import {
  DEFAULT_GMAIL_LABEL,
  DEFAULT_GMAIL_MAX_BYTES,
  DEFAULT_GMAIL_RENEW_MINUTES,
  DEFAULT_GMAIL_SERVE_BIND,
  DEFAULT_GMAIL_SERVE_PATH,
  DEFAULT_GMAIL_SERVE_PORT,
  DEFAULT_GMAIL_SUBSCRIPTION,
  DEFAULT_GMAIL_TOPIC,
} from "../hooks/gmail.js";
import { t } from "../i18n/index.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";

export function registerWebhooksCli(program: Command) {
  const webhooks = program
    .command("webhooks")
    .description(t("webhooksCli.description"))
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/webhooks", "docs.openclaw.ai/cli/webhooks")}\n`,
    );

  const gmail = webhooks.command("gmail").description(t("webhooksCli.gmailDescription"));

  gmail
    .command("setup")
    .description(t("webhooksCli.setupDescription"))
    .requiredOption("--account <email>", t("webhooksCli.accountOpt"))
    .option("--project <id>", t("webhooksCli.projectOpt"))
    .option("--topic <name>", t("webhooksCli.topicOpt"), DEFAULT_GMAIL_TOPIC)
    .option("--subscription <name>", t("webhooksCli.subscriptionOpt"), DEFAULT_GMAIL_SUBSCRIPTION)
    .option("--label <label>", t("webhooksCli.labelOpt"), DEFAULT_GMAIL_LABEL)
    .option("--hook-url <url>", t("webhooksCli.hookUrlOpt"))
    .option("--hook-token <token>", t("webhooksCli.hookTokenOpt"))
    .option("--push-token <token>", t("webhooksCli.pushTokenOpt"))
    .option("--bind <host>", t("webhooksCli.bindOpt"), DEFAULT_GMAIL_SERVE_BIND)
    .option("--port <port>", t("webhooksCli.portOpt"), String(DEFAULT_GMAIL_SERVE_PORT))
    .option("--path <path>", t("webhooksCli.pathOpt"), DEFAULT_GMAIL_SERVE_PATH)
    .option("--include-body", t("webhooksCli.includeBodyOpt"), true)
    .option("--max-bytes <n>", t("webhooksCli.maxBytesOpt"), String(DEFAULT_GMAIL_MAX_BYTES))
    .option(
      "--renew-minutes <n>",
      t("webhooksCli.renewMinutesOpt"),
      String(DEFAULT_GMAIL_RENEW_MINUTES),
    )
    .option("--tailscale <mode>", t("webhooksCli.tailscaleOpt"), "funnel")
    .option("--tailscale-path <path>", t("webhooksCli.tailscalePathOpt"))
    .option("--tailscale-target <target>", t("webhooksCli.tailscaleTargetOpt"))
    .option("--push-endpoint <url>", t("webhooksCli.pushEndpointOpt"))
    .option("--json", t("webhooksCli.jsonOpt"), false)
    .action(async (opts) => {
      try {
        const parsed = parseGmailSetupOptions(opts);
        await runGmailSetup(parsed);
      } catch (err) {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(1);
      }
    });

  gmail
    .command("run")
    .description(t("webhooksCli.runDescription"))
    .option("--account <email>", t("webhooksCli.runAccountOpt"))
    .option("--topic <topic>", t("webhooksCli.runTopicOpt"))
    .option("--subscription <name>", t("webhooksCli.runSubscriptionOpt"))
    .option("--label <label>", t("webhooksCli.runLabelOpt"))
    .option("--hook-url <url>", t("webhooksCli.runHookUrlOpt"))
    .option("--hook-token <token>", t("webhooksCli.runHookTokenOpt"))
    .option("--push-token <token>", t("webhooksCli.runPushTokenOpt"))
    .option("--bind <host>", t("webhooksCli.runBindOpt"))
    .option("--port <port>", t("webhooksCli.runPortOpt"))
    .option("--path <path>", t("webhooksCli.runPathOpt"))
    .option("--include-body", t("webhooksCli.runIncludeBodyOpt"))
    .option("--max-bytes <n>", t("webhooksCli.runMaxBytesOpt"))
    .option("--renew-minutes <n>", t("webhooksCli.runRenewMinutesOpt"))
    .option("--tailscale <mode>", t("webhooksCli.runTailscaleOpt"))
    .option("--tailscale-path <path>", t("webhooksCli.runTailscalePathOpt"))
    .option("--tailscale-target <target>", t("webhooksCli.runTailscaleTargetOpt"))
    .action(async (opts) => {
      try {
        const parsed = parseGmailRunOptions(opts);
        await runGmailService(parsed);
      } catch (err) {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(1);
      }
    });
}

function parseGmailSetupOptions(raw: Record<string, unknown>): GmailSetupOptions {
  const accountRaw = raw.account;
  const account = typeof accountRaw === "string" ? accountRaw.trim() : "";
  if (!account) {
    throw new Error("--account is required");
  }
  const common = parseGmailCommonOptions(raw);
  return {
    account,
    project: stringOption(raw.project),
    ...gmailOptionsFromCommon(common),
    pushEndpoint: stringOption(raw.pushEndpoint),
    json: Boolean(raw.json),
  };
}

function parseGmailRunOptions(raw: Record<string, unknown>): GmailRunOptions {
  const common = parseGmailCommonOptions(raw);
  return {
    account: stringOption(raw.account),
    ...gmailOptionsFromCommon(common),
  };
}

function parseGmailCommonOptions(raw: Record<string, unknown>) {
  return {
    topic: stringOption(raw.topic),
    subscription: stringOption(raw.subscription),
    label: stringOption(raw.label),
    hookUrl: stringOption(raw.hookUrl),
    hookToken: stringOption(raw.hookToken),
    pushToken: stringOption(raw.pushToken),
    bind: stringOption(raw.bind),
    port: numberOption(raw.port),
    path: stringOption(raw.path),
    includeBody: booleanOption(raw.includeBody),
    maxBytes: numberOption(raw.maxBytes),
    renewEveryMinutes: numberOption(raw.renewMinutes),
    tailscaleRaw: stringOption(raw.tailscale),
    tailscalePath: stringOption(raw.tailscalePath),
    tailscaleTarget: stringOption(raw.tailscaleTarget),
  };
}

function gmailOptionsFromCommon(
  common: ReturnType<typeof parseGmailCommonOptions>,
): Omit<GmailRunOptions, "account"> {
  return {
    topic: common.topic,
    subscription: common.subscription,
    label: common.label,
    hookUrl: common.hookUrl,
    hookToken: common.hookToken,
    pushToken: common.pushToken,
    bind: common.bind,
    port: common.port,
    path: common.path,
    includeBody: common.includeBody,
    maxBytes: common.maxBytes,
    renewEveryMinutes: common.renewEveryMinutes,
    tailscale: common.tailscaleRaw as GmailRunOptions["tailscale"],
    tailscalePath: common.tailscalePath,
    tailscaleTarget: common.tailscaleTarget,
  };
}

function stringOption(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function numberOption(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return undefined;
  }
  return Math.floor(n);
}

function booleanOption(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return Boolean(value);
}
