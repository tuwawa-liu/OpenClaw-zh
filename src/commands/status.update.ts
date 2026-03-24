import { formatCliCommand } from "../cli/command-format.js";
import { t } from "../i18n/index.js";
import { resolveOpenClawPackageRoot } from "../infra/openclaw-root.js";
import {
  checkUpdateStatus,
  compareSemverStrings,
  type UpdateCheckResult,
} from "../infra/update-check.js";
import { VERSION } from "../version.js";

export async function getUpdateCheckResult(params: {
  timeoutMs: number;
  fetchGit: boolean;
  includeRegistry: boolean;
}): Promise<UpdateCheckResult> {
  const root = await resolveOpenClawPackageRoot({
    moduleUrl: import.meta.url,
    argv1: process.argv[1],
    cwd: process.cwd(),
  });
  return await checkUpdateStatus({
    root,
    timeoutMs: params.timeoutMs,
    fetchGit: params.fetchGit,
    includeRegistry: params.includeRegistry,
  });
}

export type UpdateAvailability = {
  available: boolean;
  hasGitUpdate: boolean;
  hasRegistryUpdate: boolean;
  latestVersion: string | null;
  gitBehind: number | null;
};

export function resolveUpdateAvailability(update: UpdateCheckResult): UpdateAvailability {
  const latestVersion = update.registry?.latestVersion ?? null;
  const registryCmp = latestVersion ? compareSemverStrings(VERSION, latestVersion) : null;
  const hasRegistryUpdate = registryCmp != null && registryCmp < 0;
  const gitBehind =
    update.installKind === "git" && typeof update.git?.behind === "number"
      ? update.git.behind
      : null;
  const hasGitUpdate = gitBehind != null && gitBehind > 0;

  return {
    available: hasGitUpdate || hasRegistryUpdate,
    hasGitUpdate,
    hasRegistryUpdate,
    latestVersion: hasRegistryUpdate ? latestVersion : null,
    gitBehind,
  };
}

export function formatUpdateAvailableHint(update: UpdateCheckResult): string | null {
  const availability = resolveUpdateAvailability(update);
  if (!availability.available) {
    return null;
  }

  const details: string[] = [];
  if (availability.hasGitUpdate && availability.gitBehind != null) {
    details.push(t("commands.statusUpdate.gitBehindDetail", { count: String(availability.gitBehind) }));
  }
  if (availability.hasRegistryUpdate && availability.latestVersion) {
    details.push(t("commands.statusUpdate.npmDetail", { version: availability.latestVersion }));
  }
  const suffix = details.length > 0 ? ` (${details.join(" · ")})` : "";
  return t("commands.statusUpdate.updateAvailable", { suffix, command: formatCliCommand("openclaw update") });
}

export function formatUpdateOneLiner(update: UpdateCheckResult): string {
  const parts: string[] = [];

  const appendRegistryUpdateSummary = () => {
    if (update.registry?.latestVersion) {
      const cmp = compareSemverStrings(VERSION, update.registry.latestVersion);
      if (cmp === 0) {
        if (update.installKind !== "git") {
          parts.push("up to date");
        }
        parts.push(`npm latest ${update.registry.latestVersion}`);
      } else if (cmp != null && cmp < 0) {
        parts.push(t("commands.statusUpdate.npmUpdate", { version: update.registry.latestVersion }));
      } else {
        parts.push(t("commands.statusUpdate.npmLocalNewer", { version: update.registry.latestVersion }));
      }
      return;
    }
    if (update.registry?.error) {
      parts.push(t("commands.statusUpdate.npmLatestUnknown"));
    }
  };

  if (update.installKind === "git" && update.git) {
    const branch = update.git.branch ? `git ${update.git.branch}` : "git";
    parts.push(branch);
    if (update.git.upstream) {
      parts.push(`↔ ${update.git.upstream}`);
    }
    if (update.git.dirty === true) {
      parts.push(t("commands.statusUpdate.dirty"));
    }
    if (update.git.behind != null && update.git.ahead != null) {
      if (update.git.behind === 0 && update.git.ahead === 0) {
        parts.push(t("commands.statusUpdate.upToDate"));
      } else if (update.git.behind > 0 && update.git.ahead === 0) {
        parts.push(t("commands.statusUpdate.behind", { count: String(update.git.behind) }));
      } else if (update.git.behind === 0 && update.git.ahead > 0) {
        parts.push(t("commands.statusUpdate.ahead", { count: String(update.git.ahead) }));
      } else if (update.git.behind > 0 && update.git.ahead > 0) {
        parts.push(t("commands.statusUpdate.diverged", { ahead: String(update.git.ahead), behind: String(update.git.behind) }));
      }
    }
    if (update.git.fetchOk === false) {
      parts.push(t("commands.statusUpdate.fetchFailed"));
    }
    appendRegistryUpdateSummary();
  } else {
    parts.push(update.packageManager !== "unknown" ? update.packageManager : "pkg");
    appendRegistryUpdateSummary();
  }

  if (update.deps) {
    if (update.deps.status === "ok") {
      parts.push(t("commands.statusUpdate.depsOk"));
    }
    if (update.deps.status === "missing") {
      parts.push(t("commands.statusUpdate.depsMissing"));
    }
    if (update.deps.status === "stale") {
      parts.push(t("commands.statusUpdate.depsStale"));
    }
  }
  return `${t("commands.statusUpdate.updatePrefix")}${parts.join(" · ")}`;
}
