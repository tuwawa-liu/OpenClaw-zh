import type { SkillStatusEntry, SkillStatusReport } from "../agents/skills-status.js";
import { t } from "../i18n/index.js";
import { stripAnsi } from "../terminal/ansi.js";
import { getTerminalTableWidth, renderTable } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";
import { shortenHomePath } from "../utils.js";
import { formatCliCommand } from "./command-format.js";

export type SkillsListOptions = {
  json?: boolean;
  eligible?: boolean;
  verbose?: boolean;
};

export type SkillInfoOptions = {
  json?: boolean;
};

export type SkillsCheckOptions = {
  json?: boolean;
};

function appendClawHubHint(output: string, json?: boolean): string {
  if (json) {
    return output;
  }
  return `${output}\n\nTip: use \`openclaw skills search\`, \`openclaw skills install\`, and \`openclaw skills update\` for ClawHub-backed skills.`;
}

function formatSkillStatus(skill: SkillStatusEntry): string {
  if (skill.eligible) {
    return theme.success(t("skillsFormat.readyLower"));
  }
  if (skill.disabled) {
    return theme.warn(t("skillsFormat.disabledLower"));
  }
  if (skill.blockedByAllowlist) {
    return theme.warn(t("skillsFormat.blockedLower"));
  }
  return theme.error(t("skillsFormat.missingLower"));
}

function normalizeSkillEmoji(emoji?: string): string {
  return (emoji ?? "📦").replaceAll("\uFE0E", "\uFE0F");
}

const REMAINING_ESC_SEQUENCE_REGEX = new RegExp(
  String.raw`\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])`,
  "g",
);
const JSON_CONTROL_CHAR_REGEX = new RegExp(String.raw`[\u0000-\u001f\u007f-\u009f]`, "g");

function sanitizeJsonString(value: string): string {
  return stripAnsi(value)
    .replace(REMAINING_ESC_SEQUENCE_REGEX, "")
    .replace(JSON_CONTROL_CHAR_REGEX, "");
}

function sanitizeJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeJsonString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, sanitizeJsonValue(entryValue)]),
    );
  }
  return value;
}
function formatSkillName(skill: SkillStatusEntry): string {
  const emoji = normalizeSkillEmoji(skill.emoji);
  return `${emoji} ${theme.command(skill.name)}`;
}

function formatSkillMissingSummary(skill: SkillStatusEntry): string {
  const missing: string[] = [];
  if (skill.missing.bins.length > 0) {
    missing.push(`bins: ${skill.missing.bins.join(", ")}`);
  }
  if (skill.missing.anyBins.length > 0) {
    missing.push(`anyBins: ${skill.missing.anyBins.join(", ")}`);
  }
  if (skill.missing.env.length > 0) {
    missing.push(`env: ${skill.missing.env.join(", ")}`);
  }
  if (skill.missing.config.length > 0) {
    missing.push(`config: ${skill.missing.config.join(", ")}`);
  }
  if (skill.missing.os.length > 0) {
    missing.push(`os: ${skill.missing.os.join(", ")}`);
  }
  return missing.join("; ");
}

export function formatSkillsList(report: SkillStatusReport, opts: SkillsListOptions): string {
  const skills = opts.eligible ? report.skills.filter((s) => s.eligible) : report.skills;

  if (opts.json) {
    const jsonReport = sanitizeJsonValue({
      workspaceDir: report.workspaceDir,
      managedSkillsDir: report.managedSkillsDir,
      skills: skills.map((s) => ({
        name: s.name,
        description: s.description,
        emoji: s.emoji,
        eligible: s.eligible,
        disabled: s.disabled,
        blockedByAllowlist: s.blockedByAllowlist,
        source: s.source,
        bundled: s.bundled,
        primaryEnv: s.primaryEnv,
        homepage: s.homepage,
        missing: s.missing,
      })),
    });
    return JSON.stringify(jsonReport, null, 2);
  }

  if (skills.length === 0) {
    const message = opts.eligible
      ? t("skillsFormat.noEligibleSkills", { command: formatCliCommand("openclaw skills list") })
      : t("skillsFormat.noSkillsFound");
    return appendClawHubHint(message, opts.json);
  }

  const eligible = skills.filter((s) => s.eligible);
  const tableWidth = getTerminalTableWidth();
  const rows = skills.map((skill) => {
    const missing = formatSkillMissingSummary(skill);
    return {
      Status: formatSkillStatus(skill),
      Skill: formatSkillName(skill),
      Description: theme.muted(skill.description),
      Source: skill.source ?? "",
      Missing: missing ? theme.warn(missing) : "",
    };
  });

  const columns = [
    { key: "Status", header: t("skillsFormat.statusHeader"), minWidth: 10 },
    { key: "Skill", header: t("skillsFormat.skillHeader"), minWidth: 22 },
    { key: "Description", header: t("skillsFormat.descriptionHeader"), minWidth: 24, flex: true },
    { key: "Source", header: t("skillsFormat.sourceHeader"), minWidth: 10 },
  ];
  if (opts.verbose) {
    columns.push({ key: "Missing", header: t("skillsFormat.missingHeader"), minWidth: 18, flex: true });
  }

  const lines: string[] = [];
  lines.push(
    `${theme.heading(t("skillsFormat.skillsHeading"))} ${theme.muted(`(${t("skillsFormat.readyCount", { eligible: String(eligible.length), total: String(skills.length) })})`)}`,
  );
  lines.push(
    renderTable({
      width: tableWidth,
      columns,
      rows,
    }).trimEnd(),
  );

  return appendClawHubHint(lines.join("\n"), opts.json);
}

export function formatSkillInfo(
  report: SkillStatusReport,
  skillName: string,
  opts: SkillInfoOptions,
): string {
  const skill = report.skills.find((s) => s.name === skillName || s.skillKey === skillName);

  if (!skill) {
    if (opts.json) {
      return JSON.stringify({ error: "not found", skill: skillName }, null, 2);
    }
    return appendClawHubHint(
      t("skillsFormat.skillNotFound", { name: skillName, command: formatCliCommand("openclaw skills list") }),
      opts.json,
    );
  }

  if (opts.json) {
    return JSON.stringify(sanitizeJsonValue(skill), null, 2);
  }

  const lines: string[] = [];
  const emoji = normalizeSkillEmoji(skill.emoji);
  const status = skill.eligible
    ? theme.success(t("skillsFormat.readyUpper"))
    : skill.disabled
      ? theme.warn(t("skillsFormat.disabledUpper"))
      : skill.blockedByAllowlist
        ? theme.warn(t("skillsFormat.blockedByAllowlistUpper"))
        : theme.error(t("skillsFormat.missingReqsUpper"));

  lines.push(`${emoji} ${theme.heading(skill.name)} ${status}`);
  lines.push("");
  lines.push(skill.description);
  lines.push("");

  lines.push(theme.heading(t("skillsFormat.detailsHeading")));
  lines.push(`${theme.muted(t("skillsFormat.sourceLabel"))} ${skill.source}`);
  lines.push(`${theme.muted(t("skillsFormat.pathLabel"))} ${shortenHomePath(skill.filePath)}`);
  if (skill.homepage) {
    lines.push(`${theme.muted(t("skillsFormat.homepageLabel"))} ${skill.homepage}`);
  }
  if (skill.primaryEnv) {
    lines.push(`${theme.muted(t("skillsFormat.primaryEnvLabel"))} ${skill.primaryEnv}`);
  }

  const hasRequirements =
    skill.requirements.bins.length > 0 ||
    skill.requirements.anyBins.length > 0 ||
    skill.requirements.env.length > 0 ||
    skill.requirements.config.length > 0 ||
    skill.requirements.os.length > 0;

  if (hasRequirements) {
    lines.push("");
    lines.push(theme.heading(t("skillsFormat.requirementsHeading")));
    if (skill.requirements.bins.length > 0) {
      const binsStatus = skill.requirements.bins.map((bin) => {
        const missing = skill.missing.bins.includes(bin);
        return missing ? theme.error(`✗ ${bin}`) : theme.success(`✓ ${bin}`);
      });
      lines.push(`${theme.muted(t("skillsFormat.binariesLabel"))} ${binsStatus.join(", ")}`);
    }
    if (skill.requirements.anyBins.length > 0) {
      const anyBinsMissing = skill.missing.anyBins.length > 0;
      const anyBinsStatus = skill.requirements.anyBins.map((bin) => {
        const missing = anyBinsMissing;
        return missing ? theme.error(`✗ ${bin}`) : theme.success(`✓ ${bin}`);
      });
      lines.push(`${theme.muted(t("skillsFormat.anyBinariesLabel"))} ${anyBinsStatus.join(", ")}`);
    }
    if (skill.requirements.env.length > 0) {
      const envStatus = skill.requirements.env.map((env) => {
        const missing = skill.missing.env.includes(env);
        return missing ? theme.error(`✗ ${env}`) : theme.success(`✓ ${env}`);
      });
      lines.push(`${theme.muted(t("skillsFormat.environmentLabel"))} ${envStatus.join(", ")}`);
    }
    if (skill.requirements.config.length > 0) {
      const configStatus = skill.requirements.config.map((cfg) => {
        const missing = skill.missing.config.includes(cfg);
        return missing ? theme.error(`✗ ${cfg}`) : theme.success(`✓ ${cfg}`);
      });
      lines.push(`${theme.muted(t("skillsFormat.configLabel"))} ${configStatus.join(", ")}`);
    }
    if (skill.requirements.os.length > 0) {
      const osStatus = skill.requirements.os.map((osName) => {
        const missing = skill.missing.os.includes(osName);
        return missing ? theme.error(`✗ ${osName}`) : theme.success(`✓ ${osName}`);
      });
      lines.push(`${theme.muted(t("skillsFormat.osLabel"))} ${osStatus.join(", ")}`);
    }
  }

  if (skill.install.length > 0 && !skill.eligible) {
    lines.push("");
    lines.push(theme.heading(t("skillsFormat.installOptionsHeading")));
    for (const inst of skill.install) {
      lines.push(`  ${theme.warn("→")} ${inst.label}`);
    }
  }

  return appendClawHubHint(lines.join("\n"), opts.json);
}

export function formatSkillsCheck(report: SkillStatusReport, opts: SkillsCheckOptions): string {
  const eligible = report.skills.filter((s) => s.eligible);
  const disabled = report.skills.filter((s) => s.disabled);
  const blocked = report.skills.filter((s) => s.blockedByAllowlist && !s.disabled);
  const missingReqs = report.skills.filter(
    (s) => !s.eligible && !s.disabled && !s.blockedByAllowlist,
  );

  if (opts.json) {
    return JSON.stringify(
      sanitizeJsonValue({
        summary: {
          total: report.skills.length,
          eligible: eligible.length,
          disabled: disabled.length,
          blocked: blocked.length,
          missingRequirements: missingReqs.length,
        },
        eligible: eligible.map((s) => s.name),
        disabled: disabled.map((s) => s.name),
        blocked: blocked.map((s) => s.name),
        missingRequirements: missingReqs.map((s) => ({
          name: s.name,
          missing: s.missing,
          install: s.install,
        })),
      }),
      null,
      2,
    );
  }

  const lines: string[] = [];
  lines.push(theme.heading(t("skillsFormat.statusCheckHeading")));
  lines.push("");
  lines.push(`${theme.muted(t("skillsFormat.totalLabel"))} ${report.skills.length}`);
  lines.push(`${theme.success("✓")} ${theme.muted(t("skillsFormat.eligibleLabel"))} ${eligible.length}`);
  lines.push(`${theme.warn("⏸")} ${theme.muted(t("skillsFormat.disabledLabel"))} ${disabled.length}`);
  lines.push(`${theme.warn("🚫")} ${theme.muted(t("skillsFormat.blockedByAllowlistLabel"))} ${blocked.length}`);
  lines.push(`${theme.error("✗")} ${theme.muted(t("skillsFormat.missingReqsLabel"))} ${missingReqs.length}`);

  if (eligible.length > 0) {
    lines.push("");
    lines.push(theme.heading(t("skillsFormat.readyToUseHeading")));
    for (const skill of eligible) {
      const emoji = normalizeSkillEmoji(skill.emoji);
      lines.push(`  ${emoji} ${skill.name}`);
    }
  }

  if (missingReqs.length > 0) {
    lines.push("");
    lines.push(theme.heading(t("skillsFormat.missingRequirementsHeading")));
    for (const skill of missingReqs) {
      const emoji = normalizeSkillEmoji(skill.emoji);
      const missing = formatSkillMissingSummary(skill);
      lines.push(`  ${emoji} ${skill.name} ${theme.muted(`(${missing})`)}`);
    }
  }

  return appendClawHubHint(lines.join("\n"), opts.json);
}
