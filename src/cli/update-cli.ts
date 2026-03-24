import type { Command } from "commander";
import { t } from "../i18n/index.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { inheritOptionFromParent } from "./command-options.js";
import { formatHelpExamples } from "./help-format.js";
import {
  type UpdateCommandOptions,
  type UpdateStatusOptions,
  type UpdateWizardOptions,
} from "./update-cli/shared.js";
import { updateStatusCommand } from "./update-cli/status.js";
import { updateCommand } from "./update-cli/update-command.js";
import { updateWizardCommand } from "./update-cli/wizard.js";

export { updateCommand, updateStatusCommand, updateWizardCommand };
export type { UpdateCommandOptions, UpdateStatusOptions, UpdateWizardOptions };

function inheritedUpdateJson(command?: Command): boolean {
  return Boolean(inheritOptionFromParent<boolean>(command, "json"));
}

function inheritedUpdateTimeout(
  opts: { timeout?: unknown },
  command?: Command,
): string | undefined {
  const timeout = opts.timeout as string | undefined;
  if (timeout) {
    return timeout;
  }
  return inheritOptionFromParent<string>(command, "timeout");
}

export function registerUpdateCli(program: Command) {
  program.enablePositionalOptions();
  const update = program
    .command("update")
    .description(t("cli.update.desc"))
    .option("--json", t("cli.update.optJson"), false)
    .option("--no-restart", t("cli.update.optNoRestart"))
    .option("--dry-run", t("cli.update.optDryRun"), false)
    .option("--channel <stable|beta|dev>", t("cli.update.optChannel"))
    .option("--tag <dist-tag|version>", t("cli.update.optTag"))
    .option("--timeout <seconds>", t("cli.update.optTimeout"))
    .option("--yes", t("cli.update.optYes"), false)
    .addHelpText("after", () => {
      const examples = [
        ["openclaw update", t("cli.update.exUpdate")],
        ["openclaw update --channel beta", t("cli.update.exBeta")],
        ["openclaw update --channel dev", t("cli.update.exDev")],
        ["openclaw update --tag beta", t("cli.update.exTag")],
        ["openclaw update --dry-run", t("cli.update.exDryRun")],
        ["openclaw update --no-restart", t("cli.update.exNoRestart")],
        ["openclaw update --json", t("cli.update.exJson")],
        ["openclaw update --yes", t("cli.update.exYes")],
        ["openclaw update wizard", t("cli.update.exWizard")],
        ["openclaw --update", t("cli.update.exShorthand")],
      ] as const;
      const fmtExamples = examples
        .map(([cmd, desc]) => `  ${theme.command(cmd)} ${theme.muted(`# ${desc}`)}`)
        .join("\n");
      return `
${theme.heading(t("cli.update.helpWhatThisDoes"))}
  ${t("cli.update.helpGit")}
  ${t("cli.update.helpNpm")}

${theme.heading(t("cli.update.helpSwitchChannels"))}
  ${t("cli.update.helpChannelPersist")}
  ${t("cli.update.helpChannelStatus")}
  ${t("cli.update.helpChannelTag")}

${theme.heading(t("cli.update.helpNonInteractive"))}
  ${t("cli.update.helpNonInteractiveYes")}
  ${t("cli.update.helpNonInteractiveCombine")}
  ${t("cli.update.helpNonInteractiveDry")}

${theme.heading(t("cli.update.helpExamples"))}
${fmtExamples}

${theme.heading(t("cli.update.helpNotes"))}
  ${t("cli.update.helpNoteSwitchChannels")}
  ${t("cli.update.helpNoteGlobal")}
  ${t("cli.update.helpNoteDowngrade")}
  ${t("cli.update.helpNoteUncommitted")}

${theme.muted(t("helpDocs"))} ${formatDocsLink("/cli/update", "docs.openclaw.ai/cli/update")}`;
    })
    .action(async (opts) => {
      try {
        await updateCommand({
          json: Boolean(opts.json),
          restart: Boolean(opts.restart),
          dryRun: Boolean(opts.dryRun),
          channel: opts.channel as string | undefined,
          tag: opts.tag as string | undefined,
          timeout: opts.timeout as string | undefined,
          yes: Boolean(opts.yes),
        });
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  update
    .command("wizard")
    .description(t("cli.update.wizard.desc"))
    .option("--timeout <seconds>", t("cli.update.wizard.optTimeout"))
    .addHelpText(
      "after",
      `\n${theme.muted(t("helpDocs"))} ${formatDocsLink("/cli/update", "docs.openclaw.ai/cli/update")}\n`,
    )
    .action(async (opts, command) => {
      try {
        await updateWizardCommand({
          timeout: inheritedUpdateTimeout(opts, command),
        });
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  update
    .command("status")
    .description(t("cli.update.status.desc"))
    .option("--json", t("cli.update.status.optJson"), false)
    .option("--timeout <seconds>", t("cli.update.status.optTimeout"))
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading(t("cli.update.helpExamples"))}\n${formatHelpExamples([
          ["openclaw update status", t("cli.update.status.exStatus")],
          ["openclaw update status --json", t("cli.update.status.exJson")],
          ["openclaw update status --timeout 10", t("cli.update.status.exTimeout")],
        ])}\n\n${theme.heading(t("cli.update.helpNotes"))}\n${theme.muted(
          t("cli.update.status.noteChannel"),
        )}\n${theme.muted(t("cli.update.status.noteGit"))}\n\n${theme.muted(
          t("helpDocs"),
        )} ${formatDocsLink("/cli/update", "docs.openclaw.ai/cli/update")}`,
    )
    .action(async (opts, command) => {
      try {
        await updateStatusCommand({
          json: Boolean(opts.json) || inheritedUpdateJson(command),
          timeout: inheritedUpdateTimeout(opts, command),
        });
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });
}
