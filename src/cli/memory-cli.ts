import type { Command } from "commander";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { formatHelpExamples } from "./help-format.js";
import type { MemoryCommandOptions, MemorySearchCommandOptions } from "./memory-cli.types.js";

type MemoryCliRuntime = typeof import("./memory-cli.runtime.js");

let memoryCliRuntimePromise: Promise<MemoryCliRuntime> | null = null;

async function loadMemoryCliRuntime(): Promise<MemoryCliRuntime> {
  memoryCliRuntimePromise ??= import("./memory-cli.runtime.js");
  return await memoryCliRuntimePromise;
}

export async function runMemoryStatus(opts: MemoryCommandOptions) {
  const runtime = await loadMemoryCliRuntime();
  await runtime.runMemoryStatus(opts);
}

async function runMemoryIndex(opts: MemoryCommandOptions) {
  const runtime = await loadMemoryCliRuntime();
  await runtime.runMemoryIndex(opts);
}

async function runMemorySearch(queryArg: string | undefined, opts: MemorySearchCommandOptions) {
  const runtime = await loadMemoryCliRuntime();
  await runtime.runMemorySearch(queryArg, opts);
}

export function registerMemoryCli(program: Command) {
  const memory = program
    .command("memory")
    .description(t("memoryCli.description"))
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading(t("memoryCli.examplesHeading"))}\n${formatHelpExamples([
          ["openclaw memory status", t("memoryCli.exStatus")],
          ["openclaw memory status --deep", t("memoryCli.exDeep")],
          ["openclaw memory index --force", t("memoryCli.exForce")],
          ['openclaw memory search "meeting notes"', t("memoryCli.exSearch")],
          [
            'openclaw memory search --query "deployment" --max-results 20',
            t("memoryCli.exSearchLimit"),
          ],
          ["openclaw memory status --json", t("memoryCli.exJson")],
        ])}\n\n${theme.muted(t("memoryCli.docsLabel"))} ${formatDocsLink("/cli/memory", "docs.openclaw.ai/cli/memory")}\n`,
    );

  memory
    .command("status")
    .description(t("memoryCli.statusDesc"))
    .option("--agent <id>", t("memoryCli.optAgent"))
    .option("--json", t("memoryCli.optJson"))
    .option("--deep", t("memoryCli.optDeep"))
    .option("--index", t("memoryCli.optIndex"))
    .option("--verbose", t("memoryCli.optVerbose"), false)
    .action(async (opts: MemoryCommandOptions & { force?: boolean }) => {
      await runMemoryStatus(opts);
    });

  memory
    .command("index")
    .description(t("memoryCli.indexDesc"))
    .option("--agent <id>", t("memoryCli.optAgent"))
    .option("--force", t("memoryCli.optForce"), false)
    .option("--verbose", t("memoryCli.optVerbose"), false)
    .action(async (opts: MemoryCommandOptions) => {
      await runMemoryIndex(opts);
    });

  memory
    .command("search")
    .description("Search memory files")
    .argument("[query]", "Search query")
    .option("--query <text>", "Search query (alternative to positional argument)")
    .option("--agent <id>", "Agent id (default: default agent)")
    .option("--max-results <n>", "Max results", (value: string) => Number(value))
    .option("--min-score <n>", "Minimum score", (value: string) => Number(value))
    .option("--json", "Print JSON")
    .action(async (queryArg: string | undefined, opts: MemorySearchCommandOptions) => {
      await runMemorySearch(queryArg, opts);
    });
}
