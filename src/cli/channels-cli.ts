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
    .description(t("cli.channels.add.desc"))
    .option("--channel <name>", `${t("cli.channels.add.optChannel")} (${channelNames})`)
    .option("--account <id>", t("cli.channels.add.optAccount"))
    .option("--name <name>", t("cli.channels.add.optName"))
    .option("--token <token>", t("cli.channels.add.optToken"))
    .option("--token-file <path>", t("cli.channels.add.optTokenFile"))
    .option("--bot-token <token>", t("cli.channels.add.optBotToken"))
    .option("--app-token <token>", t("cli.channels.add.optAppToken"))
    .option("--signal-number <e164>", t("cli.channels.add.optSignalNumber"))
    .option("--cli-path <path>", t("cli.channels.add.optCliPath"))
    .option("--db-path <path>", t("cli.channels.add.optDbPath"))
    .option("--service <service>", t("cli.channels.add.optService"))
    .option("--region <region>", t("cli.channels.add.optRegion"))
    .option("--auth-dir <path>", t("cli.channels.add.optAuthDir"))
    .option("--http-url <url>", t("cli.channels.add.optHttpUrl"))
    .option("--http-host <host>", t("cli.channels.add.optHttpHost"))
    .option("--http-port <port>", t("cli.channels.add.optHttpPort"))
    .option("--webhook-path <path>", t("cli.channels.add.optWebhookPath"))
    .option("--webhook-url <url>", t("cli.channels.add.optWebhookUrl"))
    .option("--audience-type <type>", t("cli.channels.add.optAudienceType"))
    .option("--audience <value>", t("cli.channels.add.optAudience"))
    .option("--homeserver <url>", t("cli.channels.add.optHomeserver"))
    .option("--user-id <id>", t("cli.channels.add.optUserId"))
    .option("--access-token <token>", t("cli.channels.add.optAccessToken"))
    .option("--password <password>", t("cli.channels.add.optPassword"))
    .option("--device-name <name>", t("cli.channels.add.optDeviceName"))
    .option("--initial-sync-limit <n>", t("cli.channels.add.optInitialSyncLimit"))
    .option("--ship <ship>", t("cli.channels.add.optShip"))
    .option("--url <url>", t("cli.channels.add.optUrl"))
    .option("--code <code>", t("cli.channels.add.optCode"))
    .option("--group-channels <list>", t("cli.channels.add.optGroupChannels"))
    .option("--dm-allowlist <list>", t("cli.channels.add.optDmAllowlist"))
    .option("--auto-discover-channels", t("cli.channels.add.optAutoDiscoverChannels"))
    .option("--no-auto-discover-channels", t("cli.channels.add.optNoAutoDiscoverChannels"))
    .option("--use-env", t("cli.channels.add.optUseEnv"), false)
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
