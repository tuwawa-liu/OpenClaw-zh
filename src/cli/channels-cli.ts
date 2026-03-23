import type { Command } from "commander";
import { danger } from "../globals.js";
import { t } from "../i18n/index.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { runChannelLogin, runChannelLogout } from "./channel-auth.js";
import { formatCliChannelOptions } from "./channel-options.js";
import { runCommandWithRuntime } from "./cli-utils.js";
import { hasExplicitOptions } from "./command-options.js";
import { formatHelpExamples } from "./help-format.js";

const optionNamesAdd = [
  "channel",
  "account",
  "name",
  "token",
  "privateKey",
  "tokenFile",
  "botToken",
  "appToken",
  "signalNumber",
  "cliPath",
  "dbPath",
  "service",
  "region",
  "authDir",
  "httpUrl",
  "httpHost",
  "httpPort",
  "webhookPath",
  "webhookUrl",
  "audienceType",
  "audience",
  "useEnv",
  "homeserver",
  "userId",
  "accessToken",
  "password",
  "deviceName",
  "initialSyncLimit",
  "ship",
  "url",
  "relayUrls",
  "code",
  "groupChannels",
  "dmAllowlist",
  "autoDiscoverChannels",
] as const;

const optionNamesRemove = ["channel", "account", "delete"] as const;

function runChannelsCommand(action: () => Promise<void>) {
  return runCommandWithRuntime(defaultRuntime, action);
}

function runChannelsCommandWithDanger(action: () => Promise<void>, label: string) {
  return runCommandWithRuntime(defaultRuntime, action, (err) => {
    defaultRuntime.error(danger(`${label}: ${String(err)}`));
    defaultRuntime.exit(1);
  });
}

export function registerChannelsCli(program: Command) {
  const channelNames = formatCliChannelOptions();
  const channels = program
    .command("channels")
    .description(t("cli.channels.desc"))
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading(t("cli.update.helpExamples"))}\n${formatHelpExamples([
          ["openclaw channels list", t("cli.channels.exList")],
          ["openclaw channels status --probe", t("cli.channels.exStatus")],
          [
            "openclaw channels add --channel telegram --token <token>",
            t("cli.channels.exAdd"),
          ],
          ["openclaw channels login --channel whatsapp", t("cli.channels.exLogin")],
        ])}\n\n${theme.muted(t("helpDocs"))} ${formatDocsLink(
          "/cli/channels",
          "docs.openclaw.ai/cli/channels",
        )}\n`,
    );

  channels
    .command("list")
    .description(t("cli.channels.list.desc"))
    .option("--no-usage", t("cli.channels.list.optNoUsage"))
    .option("--json", t("cli.channels.list.optJson"), false)
    .action(async (opts) => {
      await runChannelsCommand(async () => {
        const { channelsListCommand } = await import("../commands/channels.js");
        await channelsListCommand(opts, defaultRuntime);
      });
    });

  channels
    .command("status")
    .description(t("cli.channels.status.desc"))
    .option("--probe", t("cli.channels.status.optProbe"), false)
    .option("--timeout <ms>", t("cli.channels.status.optTimeout"), "10000")
    .option("--json", t("cli.channels.status.optJson"), false)
    .action(async (opts) => {
      await runChannelsCommand(async () => {
        const { channelsStatusCommand } = await import("../commands/channels.js");
        await channelsStatusCommand(opts, defaultRuntime);
      });
    });

  channels
    .command("capabilities")
    .description(t("cli.channels.capabilities.desc"))
    .option("--channel <name>", `${t("cli.channels.capabilities.optChannel")} (${formatCliChannelOptions(["all"])})`)
    .option("--account <id>", t("cli.channels.capabilities.optAccount"))
    .option("--target <dest>", t("cli.channels.capabilities.optTarget"))
    .option("--timeout <ms>", t("cli.channels.capabilities.optTimeout"), "10000")
    .option("--json", t("cli.channels.capabilities.optJson"), false)
    .action(async (opts) => {
      await runChannelsCommand(async () => {
        const { channelsCapabilitiesCommand } = await import("../commands/channels.js");
        await channelsCapabilitiesCommand(opts, defaultRuntime);
      });
    });

  channels
    .command("resolve")
    .description(t("cli.channels.resolve.desc"))
    .argument("<entries...>", "Entries to resolve (names or ids)")
    .option("--channel <name>", `${t("cli.channels.resolve.optChannel")} (${channelNames})`)
    .option("--account <id>", t("cli.channels.resolve.optAccount"))
    .option("--kind <kind>", t("cli.channels.resolve.optKind"), "auto")
    .option("--json", t("cli.channels.resolve.optJson"), false)
    .action(async (entries, opts) => {
      await runChannelsCommand(async () => {
        const { channelsResolveCommand } = await import("../commands/channels.js");
        await channelsResolveCommand(
          {
            channel: opts.channel as string | undefined,
            account: opts.account as string | undefined,
            kind: opts.kind as "auto" | "user" | "group",
            json: Boolean(opts.json),
            entries: Array.isArray(entries) ? entries : [String(entries)],
          },
          defaultRuntime,
        );
      });
    });

  channels
    .command("logs")
    .description(t("cli.channels.logs.desc"))
    .option("--channel <name>", `${t("cli.channels.logs.optChannel")} (${formatCliChannelOptions(["all"])})`, "all")
    .option("--lines <n>", t("cli.channels.logs.optLines"), "200")
    .option("--json", t("cli.channels.logs.optJson"), false)
    .action(async (opts) => {
      await runChannelsCommand(async () => {
        const { channelsLogsCommand } = await import("../commands/channels.js");
        await channelsLogsCommand(opts, defaultRuntime);
      });
    });

  channels
    .command("add")
    .description("Add or update a channel account")
    .option("--channel <name>", `Channel (${channelNames})`)
    .option("--account <id>", "Account id (default when omitted)")
    .option("--name <name>", "Display name for this account")
    .option("--token <token>", "Bot token (Telegram/Discord)")
    .option("--private-key <key>", "Nostr private key (nsec... or hex)")
    .option("--token-file <path>", "Bot token file (Telegram)")
    .option("--bot-token <token>", "Slack bot token (xoxb-...)")
    .option("--app-token <token>", "Slack app token (xapp-...)")
    .option("--signal-number <e164>", "Signal account number (E.164)")
    .option("--cli-path <path>", "CLI path (signal-cli or imsg)")
    .option("--db-path <path>", "iMessage database path")
    .option("--service <service>", "iMessage service (imessage|sms|auto)")
    .option("--region <region>", "iMessage region (for SMS)")
    .option("--auth-dir <path>", "WhatsApp auth directory override")
    .option("--http-url <url>", "Signal HTTP daemon base URL")
    .option("--http-host <host>", "Signal HTTP host")
    .option("--http-port <port>", "Signal HTTP port")
    .option("--webhook-path <path>", "Webhook path (Google Chat/BlueBubbles)")
    .option("--webhook-url <url>", "Google Chat webhook URL")
    .option("--audience-type <type>", "Google Chat audience type (app-url|project-number)")
    .option("--audience <value>", "Google Chat audience value (app URL or project number)")
    .option("--homeserver <url>", "Matrix homeserver URL")
    .option("--user-id <id>", "Matrix user ID")
    .option("--access-token <token>", "Matrix access token")
    .option("--password <password>", "Matrix password")
    .option("--device-name <name>", "Matrix device name")
    .option("--initial-sync-limit <n>", "Matrix initial sync limit")
    .option("--ship <ship>", "Tlon ship name (~sampel-palnet)")
    .option("--url <url>", "Tlon ship URL")
    .option("--relay-urls <list>", "Nostr relay URLs (comma-separated)")
    .option("--code <code>", "Tlon login code")
    .option("--group-channels <list>", "Tlon group channels (comma-separated)")
    .option("--dm-allowlist <list>", "Tlon DM allowlist (comma-separated ships)")
    .option("--auto-discover-channels", "Tlon auto-discover group channels")
    .option("--no-auto-discover-channels", "Disable Tlon auto-discovery")
    .option("--use-env", "Use env token (default account only)", false)
    .action(async (opts, command) => {
      await runChannelsCommand(async () => {
        const { channelsAddCommand } = await import("../commands/channels.js");
        const hasFlags = hasExplicitOptions(command, optionNamesAdd);
        await channelsAddCommand(opts, defaultRuntime, { hasFlags });
      });
    });

  channels
    .command("remove")
    .description(t("cli.channels.remove.desc"))
    .option("--channel <name>", `${t("cli.channels.remove.optChannel")} (${channelNames})`)
    .option("--account <id>", t("cli.channels.remove.optAccount"))
    .option("--delete", t("cli.channels.remove.optDelete"), false)
    .action(async (opts, command) => {
      await runChannelsCommand(async () => {
        const { channelsRemoveCommand } = await import("../commands/channels.js");
        const hasFlags = hasExplicitOptions(command, optionNamesRemove);
        await channelsRemoveCommand(opts, defaultRuntime, { hasFlags });
      });
    });

  channels
    .command("login")
    .description(t("cli.channels.login.desc"))
    .option("--channel <channel>", t("cli.channels.login.optChannel"))
    .option("--account <id>", t("cli.channels.login.optAccount"))
    .option("--verbose", t("cli.channels.login.optVerbose"), false)
    .action(async (opts) => {
      await runChannelsCommandWithDanger(async () => {
        await runChannelLogin(
          {
            channel: opts.channel as string | undefined,
            account: opts.account as string | undefined,
            verbose: Boolean(opts.verbose),
          },
          defaultRuntime,
        );
      }, "通道登录失败");
    });

  channels
    .command("logout")
    .description(t("cli.channels.logout.desc"))
    .option("--channel <channel>", t("cli.channels.logout.optChannel"))
    .option("--account <id>", t("cli.channels.logout.optAccount"))
    .action(async (opts) => {
      await runChannelsCommandWithDanger(async () => {
        await runChannelLogout(
          {
            channel: opts.channel as string | undefined,
            account: opts.account as string | undefined,
          },
          defaultRuntime,
        );
      }, "通道退出失败");
    });
}
