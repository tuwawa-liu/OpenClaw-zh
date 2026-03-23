import { spawnSync } from "node:child_process";
import path from "node:path";
import { resolveCliName } from "../cli/cli-name.js";
import {
  completionCacheExists,
  installCompletion,
  isCompletionInstalled,
  resolveCompletionCachePath,
  resolveShellFromEnv,
  usesSlowDynamicCompletion,
} from "../cli/completion-cli.js";
import { t } from "../i18n/index.js";
import { resolveOpenClawPackageRoot } from "../infra/openclaw-root.js";
import type { RuntimeEnv } from "../runtime.js";
import { note } from "../terminal/note.js";
import type { DoctorPrompter } from "./doctor-prompter.js";

type CompletionShell = "zsh" | "bash" | "fish" | "powershell";

/** Generate the completion cache by spawning the CLI. */
async function generateCompletionCache(): Promise<boolean> {
  const root = await resolveOpenClawPackageRoot({
    moduleUrl: import.meta.url,
    argv1: process.argv[1],
    cwd: process.cwd(),
  });
  if (!root) {
    return false;
  }

  const binPath = path.join(root, "openclaw.mjs");
  const result = spawnSync(process.execPath, [binPath, "completion", "--write-state"], {
    cwd: root,
    env: process.env,
    encoding: "utf-8",
  });

  return result.status === 0;
}

export type ShellCompletionStatus = {
  shell: CompletionShell;
  profileInstalled: boolean;
  cacheExists: boolean;
  cachePath: string;
  /** True if profile uses slow dynamic pattern like `source <(openclaw completion ...)` */
  usesSlowPattern: boolean;
};

/** Check the status of shell completion for the current shell. */
export async function checkShellCompletionStatus(
  binName = "openclaw",
): Promise<ShellCompletionStatus> {
  const shell = resolveShellFromEnv() as CompletionShell;
  const profileInstalled = await isCompletionInstalled(shell, binName);
  const cacheExists = await completionCacheExists(shell, binName);
  const cachePath = resolveCompletionCachePath(shell, binName);
  const usesSlowPattern = await usesSlowDynamicCompletion(shell, binName);

  return {
    shell,
    profileInstalled,
    cacheExists,
    cachePath,
    usesSlowPattern,
  };
}

export type DoctorCompletionOptions = {
  nonInteractive?: boolean;
};

/**
 * Doctor check for shell completion.
 * - If profile uses slow dynamic pattern: upgrade to cached version
 * - If profile has completion but no cache: auto-generate cache and upgrade profile
 * - If no completion at all: prompt to install (with user confirmation)
 */
export async function doctorShellCompletion(
  runtime: RuntimeEnv,
  prompter: DoctorPrompter,
  options: DoctorCompletionOptions = {},
): Promise<void> {
  const cliName = resolveCliName();
  const status = await checkShellCompletionStatus(cliName);

  const title = t("commands.doctorCompletion.title");
  const resolveProfile = (shell: CompletionShell) => shell === "zsh" ? "zshrc" : shell === "bash" ? "bashrc" : "config/fish/config.fish";

  // Profile uses slow dynamic pattern - upgrade to cached version
  if (status.usesSlowPattern) {
    note(
      t("commands.doctorCompletion.slowDynamicCompletion", { shell: status.shell }),
      title,
    );

    // Ensure cache exists first
    if (!status.cacheExists) {
      const generated = await generateCompletionCache();
      if (!generated) {
        note(
          t("commands.doctorCompletion.failedGenerateCache", { cliName }),
          title,
        );
        return;
      }
    }

    // Upgrade profile to use cached file
    await installCompletion(status.shell, true, cliName);
    note(
      t("commands.doctorCompletion.upgraded", { profile: resolveProfile(status.shell) }),
      title,
    );
    return;
  }

  // Profile has completion but no cache - auto-fix
  if (status.profileInstalled && !status.cacheExists) {
    note(
      t("commands.doctorCompletion.cacheMissing", { shell: status.shell }),
      title,
    );
    const generated = await generateCompletionCache();
    if (generated) {
      note(t("commands.doctorCompletion.cacheRegenerated", { path: status.cachePath }), title);
    } else {
      note(
        t("commands.doctorCompletion.failedGenerateCache", { cliName }),
        title,
      );
    }
    return;
  }

  // No completion at all - prompt to install
  if (!status.profileInstalled) {
    if (options.nonInteractive) {
      // In non-interactive mode, just note that completion is not installed
      return;
    }

    const shouldInstall = await prompter.confirm({
      message: t("commands.doctorCompletion.enablePrompt", { shell: status.shell, cliName }),
      initialValue: true,
    });

    if (shouldInstall) {
      // First generate the cache
      const generated = await generateCompletionCache();
      if (!generated) {
        note(
          t("commands.doctorCompletion.failedGenerateCache", { cliName }),
          title,
        );
        return;
      }

      // Then install to profile
      await installCompletion(status.shell, true, cliName);
      note(
        t("commands.doctorCompletion.installed", { profile: resolveProfile(status.shell) }),
        title,
      );
    }
  }
}

/**
 * Ensure completion cache exists. Used during setup/update to fix
 * cases where profile has completion but no cache.
 * This is a silent fix - no prompts.
 */
export async function ensureCompletionCacheExists(binName = "openclaw"): Promise<boolean> {
  const shell = resolveShellFromEnv() as CompletionShell;
  const cacheExists = await completionCacheExists(shell, binName);

  if (cacheExists) {
    return true;
  }

  return generateCompletionCache();
}
