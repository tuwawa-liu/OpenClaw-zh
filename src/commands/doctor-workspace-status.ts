import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { buildWorkspaceSkillStatus } from "../agents/skills-status.js";
import type { OpenClawConfig } from "../config/config.js";
import { t } from "../i18n/index.js";
import { loadOpenClawPlugins } from "../plugins/loader.js";
import { buildPluginCompatibilityWarnings } from "../plugins/status.js";
import { note } from "../terminal/note.js";
import { detectLegacyWorkspaceDirs, formatLegacyWorkspaceWarning } from "./doctor-workspace.js";

export function noteWorkspaceStatus(cfg: OpenClawConfig) {
  const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
  const legacyWorkspace = detectLegacyWorkspaceDirs({ workspaceDir });
  if (legacyWorkspace.legacyDirs.length > 0) {
    note(formatLegacyWorkspaceWarning(legacyWorkspace), t("commands.doctorWorkspaceStatus.titleExtraWorkspace"));
  }

  const skillsReport = buildWorkspaceSkillStatus(workspaceDir, { config: cfg });
  note(
    [
      t("commands.doctorWorkspaceStatus.eligible", { count: String(skillsReport.skills.filter((s) => s.eligible).length) }),
      t("commands.doctorWorkspaceStatus.missingRequirements", { count: String(
        skillsReport.skills.filter((s) => !s.eligible && !s.disabled && !s.blockedByAllowlist)
          .length
      ) }),
      t("commands.doctorWorkspaceStatus.blockedByAllowlist", { count: String(skillsReport.skills.filter((s) => s.blockedByAllowlist).length) }),
    ].join("\n"),
    t("commands.doctorWorkspaceStatus.titleSkillsStatus"),
  );

  const pluginRegistry = loadOpenClawPlugins({
    config: cfg,
    workspaceDir,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  });
  if (pluginRegistry.plugins.length > 0) {
    const loaded = pluginRegistry.plugins.filter((p) => p.status === "loaded");
    const disabled = pluginRegistry.plugins.filter((p) => p.status === "disabled");
    const errored = pluginRegistry.plugins.filter((p) => p.status === "error");

    const lines = [
      t("commands.doctorWorkspaceStatus.pluginsLoaded", { count: String(loaded.length) }),
      t("commands.doctorWorkspaceStatus.pluginsDisabled", { count: String(disabled.length) }),
      t("commands.doctorWorkspaceStatus.pluginsErrors", { count: String(errored.length) }),
      errored.length > 0
        ? `- ${errored
            .slice(0, 10)
            .map((p) => p.id)
            .join("\n- ")}${errored.length > 10 ? "\n- ..." : ""}`
        : null,
    ].filter((line): line is string => Boolean(line));

    const bundlePlugins = loaded.filter(
      (p) => p.format === "bundle" && (p.bundleCapabilities?.length ?? 0) > 0,
    );
    if (bundlePlugins.length > 0) {
      const allCaps = new Set(bundlePlugins.flatMap((p) => p.bundleCapabilities ?? []));
      lines.push(`Bundle plugins: ${bundlePlugins.length} (${[...allCaps].toSorted().join(", ")})`);
    }

    note(lines.join("\n"), "Plugins");
  }
  const compatibilityWarnings = buildPluginCompatibilityWarnings({
    config: cfg,
    workspaceDir,
    report: {
      workspaceDir,
      ...pluginRegistry,
    },
  });
  if (compatibilityWarnings.length > 0) {
    note(compatibilityWarnings.map((line) => `- ${line}`).join("\n"), "Plugin compatibility");
  }
  if (pluginRegistry.diagnostics.length > 0) {
    const lines = pluginRegistry.diagnostics.map((diag) => {
      const prefix = diag.level.toUpperCase();
      const plugin = diag.pluginId ? ` ${diag.pluginId}` : "";
      const source = diag.source ? ` (${diag.source})` : "";
      return `- ${prefix}${plugin}: ${diag.message}${source}`;
    });
    note(lines.join("\n"), t("commands.doctorWorkspaceStatus.titlePluginDiagnostics"));
  }

  return { workspaceDir };
}
