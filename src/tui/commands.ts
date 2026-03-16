import type { SlashCommand } from "@mariozechner/pi-tui";
import { listChatCommands, listChatCommandsForConfig } from "../auto-reply/commands-registry.js";
import { formatThinkingLevels, listThinkingLevelLabels } from "../auto-reply/thinking.js";
import type { OpenClawConfig } from "../config/types.js";
import { t } from "../i18n/index.js";

const VERBOSE_LEVELS = ["on", "off"];
const FAST_LEVELS = ["status", "on", "off"];
const REASONING_LEVELS = ["on", "off"];
const ELEVATED_LEVELS = ["on", "off", "ask", "full"];
const ACTIVATION_LEVELS = ["mention", "always"];
const USAGE_FOOTER_LEVELS = ["off", "tokens", "full"];

export type ParsedCommand = {
  name: string;
  args: string;
};

export type SlashCommandOptions = {
  cfg?: OpenClawConfig;
  provider?: string;
  model?: string;
};

const COMMAND_ALIASES: Record<string, string> = {
  elev: "elevated",
};

function createLevelCompletion(
  levels: string[],
): NonNullable<SlashCommand["getArgumentCompletions"]> {
  return (prefix) =>
    levels
      .filter((value) => value.startsWith(prefix.toLowerCase()))
      .map((value) => ({
        value,
        label: value,
      }));
}

export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.replace(/^\//, "").trim();
  if (!trimmed) {
    return { name: "", args: "" };
  }
  const [name, ...rest] = trimmed.split(/\s+/);
  const normalized = name.toLowerCase();
  return {
    name: COMMAND_ALIASES[normalized] ?? normalized,
    args: rest.join(" ").trim(),
  };
}

export function getSlashCommands(options: SlashCommandOptions = {}): SlashCommand[] {
  const thinkLevels = listThinkingLevelLabels(options.provider, options.model);
  const verboseCompletions = createLevelCompletion(VERBOSE_LEVELS);
  const fastCompletions = createLevelCompletion(FAST_LEVELS);
  const reasoningCompletions = createLevelCompletion(REASONING_LEVELS);
  const usageCompletions = createLevelCompletion(USAGE_FOOTER_LEVELS);
  const elevatedCompletions = createLevelCompletion(ELEVATED_LEVELS);
  const activationCompletions = createLevelCompletion(ACTIVATION_LEVELS);
  const commands: SlashCommand[] = [
    { name: "help", description: t("tui.cmdHelp") },
    { name: "status", description: t("tui.cmdStatus") },
    { name: "agent", description: t("tui.cmdAgent") },
    { name: "agents", description: t("tui.cmdAgents") },
    { name: "session", description: t("tui.cmdSession") },
    { name: "sessions", description: t("tui.cmdSessions") },
    {
      name: "model",
      description: t("tui.cmdModel"),
    },
    { name: "models", description: t("tui.cmdModels") },
    {
      name: "think",
      description: t("tui.cmdThink"),
      getArgumentCompletions: (prefix) =>
        thinkLevels
          .filter((v) => v.startsWith(prefix.toLowerCase()))
          .map((value) => ({ value, label: value })),
    },
    {
      name: "fast",
      description: "设置快速模式 on/off",
      getArgumentCompletions: fastCompletions,
    },
    {
      name: "verbose",
      description: t("tui.cmdVerbose"),
      getArgumentCompletions: verboseCompletions,
    },
    {
      name: "reasoning",
      description: t("tui.cmdReasoning"),
      getArgumentCompletions: reasoningCompletions,
    },
    {
      name: "usage",
      description: t("tui.cmdUsage"),
      getArgumentCompletions: usageCompletions,
    },
    {
      name: "elevated",
      description: t("tui.cmdElevated"),
      getArgumentCompletions: elevatedCompletions,
    },
    {
      name: "elev",
      description: t("tui.cmdElev"),
      getArgumentCompletions: elevatedCompletions,
    },
    {
      name: "activation",
      description: t("tui.cmdActivation"),
      getArgumentCompletions: activationCompletions,
    },
    { name: "abort", description: t("tui.cmdAbort") },
    { name: "new", description: t("tui.cmdNew") },
    { name: "reset", description: t("tui.cmdReset") },
    { name: "settings", description: t("tui.cmdSettings") },
    { name: "exit", description: t("tui.cmdExit") },
    { name: "quit", description: t("tui.cmdQuit") },
  ];

  const seen = new Set(commands.map((command) => command.name));
  const gatewayCommands = options.cfg ? listChatCommandsForConfig(options.cfg) : listChatCommands();
  for (const command of gatewayCommands) {
    const aliases = command.textAliases.length > 0 ? command.textAliases : [`/${command.key}`];
    for (const alias of aliases) {
      const name = alias.replace(/^\//, "").trim();
      if (!name || seen.has(name)) {
        continue;
      }
      seen.add(name);
      commands.push({ name, description: command.description });
    }
  }

  return commands;
}

export function helpText(options: SlashCommandOptions = {}): string {
  const thinkLevels = formatThinkingLevels(options.provider, options.model, "|");
  return [
    t("tui.helpTitle"),
    "/help",
    "/commands",
    "/status",
    "/agent <id> (or /agents)",
    "/session <key> (or /sessions)",
    "/model <provider/model> (or /models)",
    `/think <${thinkLevels}>`,
    "/fast <status|on|off>",
    "/verbose <on|off>",
    "/reasoning <on|off>",
    "/usage <off|tokens|full>",
    "/elevated <on|off|ask|full>",
    "/elev <on|off|ask|full>",
    "/activation <mention|always>",
    "/new or /reset",
    "/abort",
    "/settings",
    "/exit",
  ].join("\n");
}
