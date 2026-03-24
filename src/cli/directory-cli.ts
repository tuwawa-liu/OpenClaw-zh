import type { Command } from "commander";
import { resolveChannelDefaultAccountId } from "../channels/plugins/helpers.js";
import { getChannelPlugin } from "../channels/plugins/index.js";
import { resolveInstallableChannelPlugin } from "../commands/channel-setup/channel-plugin-resolution.js";
import { loadConfig, writeConfigFile } from "../config/config.js";
import { danger } from "../globals.js";
import { t } from "../i18n/index.js";
import { resolveMessageChannelSelection } from "../infra/outbound/channel-selection.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { getTerminalTableWidth, renderTable } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";
import { formatHelpExamples } from "./help-format.js";

function parseLimit(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) {
      return null;
    }
    return Math.floor(value);
  }
  if (typeof value !== "string") {
    return null;
  }
  const raw = value.trim();
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function buildRows(entries: Array<{ id: string; name?: string | undefined }>) {
  return entries.map((entry) => ({
    ID: entry.id,
    Name: entry.name?.trim() ?? "",
  }));
}

function printDirectoryList(params: {
  title: string;
  emptyMessage: string;
  entries: Array<{ id: string; name?: string | undefined }>;
}): void {
  if (params.entries.length === 0) {
    defaultRuntime.log(theme.muted(params.emptyMessage));
    return;
  }

  const tableWidth = getTerminalTableWidth();
  defaultRuntime.log(`${theme.heading(params.title)} ${theme.muted(`(${params.entries.length})`)}`);
  defaultRuntime.log(
    renderTable({
      width: tableWidth,
      columns: [
        { key: "ID", header: "ID", minWidth: 16, flex: true },
        { key: "Name", header: "Name", minWidth: 18, flex: true },
      ],
      rows: buildRows(params.entries),
    }).trimEnd(),
  );
}

export function registerDirectoryCli(program: Command) {
  const directory = program
    .command("directory")
    .description(t("directoryCli.description"))
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading(t("directoryCli.examplesHeading"))}\n${formatHelpExamples([
          ["openclaw directory self --channel slack", t("directoryCli.exSelf")],
          [
            'openclaw directory peers list --channel slack --query "alice"',
            t("directoryCli.exPeers"),
          ],
          ["openclaw directory groups list --channel discord", t("directoryCli.exGroups")],
          [
            "openclaw directory groups members --channel discord --group-id <id>",
            t("directoryCli.exMembers"),
          ],
        ])}\n\n${theme.muted(t("directoryCli.docsLabel"))} ${formatDocsLink(
          "/cli/directory",
          "docs.openclaw.ai/cli/directory",
        )}\n`,
    )
    .action(() => {
      directory.help({ error: true });
    });

  const withChannel = (cmd: Command) =>
    cmd
      .option("--channel <name>", t("directoryCli.optChannel"))
      .option("--account <id>", t("directoryCli.optAccount"))
      .option("--json", t("directoryCli.optJson"), false);

  const resolve = async (opts: { channel?: string; account?: string }) => {
    let cfg = loadConfig();
    const explicitChannel = opts.channel?.trim();
    const resolvedExplicit = explicitChannel
      ? await resolveInstallableChannelPlugin({
          cfg,
          runtime: defaultRuntime,
          rawChannel: explicitChannel,
          allowInstall: true,
          supports: (plugin) => Boolean(plugin.directory),
        })
      : null;
    if (resolvedExplicit?.configChanged) {
      cfg = resolvedExplicit.cfg;
      await writeConfigFile(cfg);
    }
    const selection = explicitChannel
      ? {
          channel: resolvedExplicit?.channelId,
        }
      : await resolveMessageChannelSelection({
          cfg,
          channel: opts.channel ?? null,
        });
    const channelId = selection.channel;
    const plugin =
      resolvedExplicit?.plugin ?? (channelId ? getChannelPlugin(channelId) : undefined);
    if (!plugin) {
      throw new Error(t("directoryCli.unsupportedChannel", { channelId: String(channelId) }));
    }
    const accountId = opts.account?.trim() || resolveChannelDefaultAccountId({ plugin, cfg });
    return { cfg, channelId, accountId, plugin };
  };

  const runDirectoryList = async (params: {
    opts: {
      channel?: unknown;
      account?: unknown;
      query?: unknown;
      limit?: unknown;
      json?: unknown;
    };
    action: "listPeers" | "listGroups";
    unsupported: string;
    title: string;
    emptyMessage: string;
  }) => {
    const { cfg, channelId, accountId, plugin } = await resolve({
      channel: params.opts.channel as string | undefined,
      account: params.opts.account as string | undefined,
    });
    const fn =
      params.action === "listPeers" ? plugin.directory?.listPeers : plugin.directory?.listGroups;
    if (!fn) {
      throw new Error(t("directoryCli.channelNoSupport", { channelId, unsupported: params.unsupported }));
    }
    const result = await fn({
      cfg,
      accountId,
      query: (params.opts.query as string | undefined) ?? null,
      limit: parseLimit(params.opts.limit),
      runtime: defaultRuntime,
    });
    if (params.opts.json) {
      defaultRuntime.writeJson(result);
      return;
    }
    printDirectoryList({ title: params.title, emptyMessage: params.emptyMessage, entries: result });
  };

  withChannel(directory.command("self").description(t("directoryCli.selfDesc"))).action(
    async (opts) => {
      try {
        const { cfg, channelId, accountId, plugin } = await resolve({
          channel: opts.channel as string | undefined,
          account: opts.account as string | undefined,
        });
        const fn = plugin.directory?.self;
        if (!fn) {
          throw new Error(t("directoryCli.channelNoSupport", { channelId, unsupported: "self" }));
        }
        const result = await fn({ cfg, accountId, runtime: defaultRuntime });
        if (opts.json) {
          defaultRuntime.writeJson(result);
          return;
        }
        if (!result) {
          defaultRuntime.log(theme.muted(t("directoryCli.notAvailable")));
          return;
        }
        const tableWidth = getTerminalTableWidth();
        defaultRuntime.log(theme.heading(t("directoryCli.selfLabel")));
        defaultRuntime.log(
          renderTable({
            width: tableWidth,
            columns: [
              { key: "ID", header: "ID", minWidth: 16, flex: true },
              { key: "Name", header: "Name", minWidth: 18, flex: true },
            ],
            rows: buildRows([result]),
          }).trimEnd(),
        );
      } catch (err) {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(1);
      }
    },
  );

  const peers = directory.command("peers").description(t("directoryCli.peersDesc"));
  withChannel(peers.command("list").description(t("directoryCli.listPeersDesc")))
    .option("--query <text>", t("directoryCli.optQuery"))
    .option("--limit <n>", t("directoryCli.optLimit"))
    .action(async (opts) => {
      try {
        await runDirectoryList({
          opts,
          action: "listPeers",
          unsupported: "peers",
          title: t("directoryCli.peersTitle"),
          emptyMessage: t("directoryCli.noPeersFound"),
        });
      } catch (err) {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(1);
      }
    });

  const groups = directory.command("groups").description(t("directoryCli.groupsDesc"));
  withChannel(groups.command("list").description(t("directoryCli.listGroupsDesc")))
    .option("--query <text>", t("directoryCli.optQuery"))
    .option("--limit <n>", t("directoryCli.optLimit"))
    .action(async (opts) => {
      try {
        await runDirectoryList({
          opts,
          action: "listGroups",
          unsupported: "groups",
          title: t("directoryCli.groupsTitle"),
          emptyMessage: t("directoryCli.noGroupsFound"),
        });
      } catch (err) {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(1);
      }
    });

  withChannel(
    groups
      .command("members")
      .description(t("directoryCli.listMembersDesc"))
      .requiredOption("--group-id <id>", t("directoryCli.optGroupId")),
  )
    .option("--limit <n>", t("directoryCli.optLimit"))
    .action(async (opts) => {
      try {
        const { cfg, channelId, accountId, plugin } = await resolve({
          channel: opts.channel as string | undefined,
          account: opts.account as string | undefined,
        });
        const fn = plugin.directory?.listGroupMembers;
        if (!fn) {
          throw new Error(t("directoryCli.channelNoSupport", { channelId, unsupported: "group members listing" }));
        }
        const groupId = String(opts.groupId ?? "").trim();
        if (!groupId) {
          throw new Error(t("directoryCli.missingGroupId"));
        }
        const result = await fn({
          cfg,
          accountId,
          groupId,
          limit: parseLimit(opts.limit),
          runtime: defaultRuntime,
        });
        if (opts.json) {
          defaultRuntime.writeJson(result);
          return;
        }
        printDirectoryList({
          title: t("directoryCli.groupMembersTitle"),
          emptyMessage: t("directoryCli.noGroupMembersFound"),
          entries: result,
        });
      } catch (err) {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(1);
      }
    });
}
