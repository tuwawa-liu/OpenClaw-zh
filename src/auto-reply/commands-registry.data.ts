import { listChannelDocks } from "../channels/dock.js";
import { t } from "../i18n/index.js";
import { getActivePluginRegistry } from "../plugins/runtime.js";
import { COMMAND_ARG_FORMATTERS } from "./commands-args.js";
import type {
  ChatCommandDefinition,
  CommandCategory,
  CommandScope,
} from "./commands-registry.types.js";
import { listThinkingLevels } from "./thinking.js";

type DefineChatCommandInput = {
  key: string;
  nativeName?: string;
  description: string;
  args?: ChatCommandDefinition["args"];
  argsParsing?: ChatCommandDefinition["argsParsing"];
  formatArgs?: ChatCommandDefinition["formatArgs"];
  argsMenu?: ChatCommandDefinition["argsMenu"];
  acceptsArgs?: boolean;
  textAlias?: string;
  textAliases?: string[];
  scope?: CommandScope;
  category?: CommandCategory;
};

function defineChatCommand(command: DefineChatCommandInput): ChatCommandDefinition {
  const aliases = (command.textAliases ?? (command.textAlias ? [command.textAlias] : []))
    .map((alias) => alias.trim())
    .filter(Boolean);
  const scope =
    command.scope ?? (command.nativeName ? (aliases.length ? "both" : "native") : "text");
  const acceptsArgs = command.acceptsArgs ?? Boolean(command.args?.length);
  const argsParsing = command.argsParsing ?? (command.args?.length ? "positional" : "none");
  return {
    key: command.key,
    nativeName: command.nativeName,
    description: command.description,
    acceptsArgs,
    args: command.args,
    argsParsing,
    formatArgs: command.formatArgs,
    argsMenu: command.argsMenu,
    textAliases: aliases,
    scope,
    category: command.category,
  };
}

type ChannelDock = ReturnType<typeof listChannelDocks>[number];

function defineDockCommand(dock: ChannelDock): ChatCommandDefinition {
  return defineChatCommand({
    key: `dock:${dock.id}`,
    nativeName: `dock_${dock.id}`,
    description: t("chatCmd.dock", { id: dock.id }),
    textAliases: [`/dock-${dock.id}`, `/dock_${dock.id}`],
    category: "docks",
  });
}

function registerAlias(commands: ChatCommandDefinition[], key: string, ...aliases: string[]): void {
  const command = commands.find((entry) => entry.key === key);
  if (!command) {
    throw new Error(`registerAlias: unknown command key: ${key}`);
  }
  const existing = new Set(command.textAliases.map((alias) => alias.trim().toLowerCase()));
  for (const alias of aliases) {
    const trimmed = alias.trim();
    if (!trimmed) {
      continue;
    }
    const lowered = trimmed.toLowerCase();
    if (existing.has(lowered)) {
      continue;
    }
    existing.add(lowered);
    command.textAliases.push(trimmed);
  }
}

function assertCommandRegistry(commands: ChatCommandDefinition[]): void {
  const keys = new Set<string>();
  const nativeNames = new Set<string>();
  const textAliases = new Set<string>();
  for (const command of commands) {
    if (keys.has(command.key)) {
      throw new Error(`Duplicate command key: ${command.key}`);
    }
    keys.add(command.key);

    const nativeName = command.nativeName?.trim();
    if (command.scope === "text") {
      if (nativeName) {
        throw new Error(`Text-only command has native name: ${command.key}`);
      }
      if (command.textAliases.length === 0) {
        throw new Error(`Text-only command missing text alias: ${command.key}`);
      }
    } else if (!nativeName) {
      throw new Error(`Native command missing native name: ${command.key}`);
    } else {
      const nativeKey = nativeName.toLowerCase();
      if (nativeNames.has(nativeKey)) {
        throw new Error(`Duplicate native command: ${nativeName}`);
      }
      nativeNames.add(nativeKey);
    }

    if (command.scope === "native" && command.textAliases.length > 0) {
      throw new Error(`Native-only command has text aliases: ${command.key}`);
    }

    for (const alias of command.textAliases) {
      if (!alias.startsWith("/")) {
        throw new Error(`Command alias missing leading '/': ${alias}`);
      }
      const aliasKey = alias.toLowerCase();
      if (textAliases.has(aliasKey)) {
        throw new Error(`Duplicate command alias: ${alias}`);
      }
      textAliases.add(aliasKey);
    }
  }
}

let cachedCommands: ChatCommandDefinition[] | null = null;
let cachedRegistry: ReturnType<typeof getActivePluginRegistry> | null = null;
let cachedNativeCommandSurfaces: Set<string> | null = null;
let cachedNativeRegistry: ReturnType<typeof getActivePluginRegistry> | null = null;

function buildChatCommands(): ChatCommandDefinition[] {
  const commands: ChatCommandDefinition[] = [
    defineChatCommand({
      key: "help",
      nativeName: "help",
      description: t("chatCmd.help.desc"),
      textAlias: "/help",
      category: "status",
    }),
    defineChatCommand({
      key: "commands",
      nativeName: "commands",
      description: t("chatCmd.commands.desc"),
      textAlias: "/commands",
      category: "status",
    }),
    defineChatCommand({
      key: "skill",
      nativeName: "skill",
      description: t("chatCmd.skill.desc"),
      textAlias: "/skill",
      category: "tools",
      args: [
        {
          name: "name",
          description: t("chatCmd.skill.argName"),
          type: "string",
          required: true,
        },
        {
          name: "input",
          description: t("chatCmd.skill.argInput"),
          type: "string",
          captureRemaining: true,
        },
      ],
    }),
    defineChatCommand({
      key: "status",
      nativeName: "status",
      description: t("chatCmd.status.desc"),
      textAlias: "/status",
      category: "status",
    }),
    defineChatCommand({
      key: "allowlist",
      description: t("chatCmd.allowlist.desc"),
      textAlias: "/allowlist",
      acceptsArgs: true,
      scope: "text",
      category: "management",
    }),
    defineChatCommand({
      key: "approve",
      nativeName: "approve",
      description: t("chatCmd.approve.desc"),
      textAlias: "/approve",
      acceptsArgs: true,
      category: "management",
    }),
    defineChatCommand({
      key: "context",
      nativeName: "context",
      description: t("chatCmd.context.desc"),
      textAlias: "/context",
      acceptsArgs: true,
      category: "status",
    }),
    defineChatCommand({
      key: "export-session",
      nativeName: "export-session",
      description: t("chatCmd.exportSession.desc"),
      textAliases: ["/export-session", "/export"],
      acceptsArgs: true,
      category: "status",
      args: [
        {
          name: "path",
          description: t("chatCmd.exportSession.argPath"),
          type: "string",
          required: false,
        },
      ],
    }),
    defineChatCommand({
      key: "tts",
      nativeName: "tts",
      description: t("chatCmd.tts.desc"),
      textAlias: "/tts",
      category: "media",
      args: [
        {
          name: "action",
          description: t("chatCmd.tts.argAction"),
          type: "string",
          choices: [
            { value: "on", label: "开启" },
            { value: "off", label: "关闭" },
            { value: "status", label: "状态" },
            { value: "provider", label: "提供者" },
            { value: "limit", label: "限制" },
            { value: "summary", label: "摘要" },
            { value: "audio", label: "音频" },
            { value: "help", label: "帮助" },
          ],
        },
        {
          name: "value",
          description: t("chatCmd.tts.argValue"),
          type: "string",
          captureRemaining: true,
        },
      ],
      argsMenu: {
        arg: "action",
        title: t("chatCmd.tts.menuTitle"),
      },
    }),
    defineChatCommand({
      key: "whoami",
      nativeName: "whoami",
      description: t("chatCmd.whoami.desc"),
      textAlias: "/whoami",
      category: "status",
    }),
    defineChatCommand({
      key: "session",
      nativeName: "session",
      description: t("chatCmd.session.desc"),
      textAlias: "/session",
      category: "session",
      args: [
        {
          name: "action",
          description: t("chatCmd.session.argAction"),
          type: "string",
          choices: ["idle", "max-age"],
        },
        {
          name: "value",
          description: t("chatCmd.session.argValue"),
          type: "string",
          captureRemaining: true,
        },
      ],
      argsMenu: "auto",
    }),
    defineChatCommand({
      key: "subagents",
      nativeName: "subagents",
      description: t("chatCmd.subagents.desc"),
      textAlias: "/subagents",
      category: "management",
      args: [
        {
          name: "action",
          description: t("chatCmd.subagents.argAction"),
          type: "string",
          choices: ["list", "kill", "log", "info", "send", "steer", "spawn"],
        },
        {
          name: "target",
          description: t("chatCmd.subagents.argTarget"),
          type: "string",
        },
        {
          name: "value",
          description: t("chatCmd.subagents.argValue"),
          type: "string",
          captureRemaining: true,
        },
      ],
      argsMenu: "auto",
    }),
    defineChatCommand({
      key: "acp",
      nativeName: "acp",
      description: t("chatCmd.acp.desc"),
      textAlias: "/acp",
      category: "management",
      args: [
        {
          name: "action",
          description: t("chatCmd.acp.argAction"),
          type: "string",
          preferAutocomplete: true,
          choices: [
            "spawn",
            "cancel",
            "steer",
            "close",
            "sessions",
            "status",
            "set-mode",
            "set",
            "cwd",
            "permissions",
            "timeout",
            "model",
            "reset-options",
            "doctor",
            "install",
            "help",
          ],
        },
        {
          name: "value",
          description: t("chatCmd.acp.argValue"),
          type: "string",
          captureRemaining: true,
        },
      ],
      argsMenu: "auto",
    }),
    defineChatCommand({
      key: "focus",
      nativeName: "focus",
      description:
        t("chatCmd.focus.desc"),
      textAlias: "/focus",
      category: "management",
      args: [
        {
          name: "target",
          description: t("chatCmd.focus.argTarget"),
          type: "string",
          captureRemaining: true,
        },
      ],
    }),
    defineChatCommand({
      key: "unfocus",
      nativeName: "unfocus",
      description: t("chatCmd.unfocus.desc"),
      textAlias: "/unfocus",
      category: "management",
    }),
    defineChatCommand({
      key: "agents",
      nativeName: "agents",
      description: t("chatCmd.agents.desc"),
      textAlias: "/agents",
      category: "management",
    }),
    defineChatCommand({
      key: "kill",
      nativeName: "kill",
      description: t("chatCmd.kill.desc"),
      textAlias: "/kill",
      category: "management",
      args: [
        {
          name: "target",
          description: t("chatCmd.kill.argTarget"),
          type: "string",
        },
      ],
      argsMenu: "auto",
    }),
    defineChatCommand({
      key: "steer",
      nativeName: "steer",
      description: t("chatCmd.steer.desc"),
      textAlias: "/steer",
      category: "management",
      args: [
        {
          name: "target",
          description: t("chatCmd.steer.argTarget"),
          type: "string",
        },
        {
          name: "message",
          description: t("chatCmd.steer.argMessage"),
          type: "string",
          captureRemaining: true,
        },
      ],
    }),
    defineChatCommand({
      key: "config",
      nativeName: "config",
      description: t("chatCmd.config.desc"),
      textAlias: "/config",
      category: "management",
      args: [
        {
          name: "action",
          description: t("chatCmd.config.argAction"),
          type: "string",
          choices: ["show", "get", "set", "unset"],
        },
        {
          name: "path",
          description: t("chatCmd.config.argPath"),
          type: "string",
        },
        {
          name: "value",
          description: t("chatCmd.config.argValue"),
          type: "string",
          captureRemaining: true,
        },
      ],
      argsParsing: "none",
      formatArgs: COMMAND_ARG_FORMATTERS.config,
    }),
    defineChatCommand({
      key: "debug",
      nativeName: "debug",
      description: t("chatCmd.debug.desc"),
      textAlias: "/debug",
      category: "management",
      args: [
        {
          name: "action",
          description: t("chatCmd.debug.argAction"),
          type: "string",
          choices: ["show", "reset", "set", "unset"],
        },
        {
          name: "path",
          description: t("chatCmd.debug.argPath"),
          type: "string",
        },
        {
          name: "value",
          description: t("chatCmd.debug.argValue"),
          type: "string",
          captureRemaining: true,
        },
      ],
      argsParsing: "none",
      formatArgs: COMMAND_ARG_FORMATTERS.debug,
    }),
    defineChatCommand({
      key: "usage",
      nativeName: "usage",
      description: t("chatCmd.usage.desc"),
      textAlias: "/usage",
      category: "options",
      args: [
        {
          name: "mode",
          description: t("chatCmd.usage.argMode"),
          type: "string",
          choices: ["off", "tokens", "full", "cost"],
        },
      ],
      argsMenu: "auto",
    }),
    defineChatCommand({
      key: "stop",
      nativeName: "stop",
      description: t("chatCmd.stop.desc"),
      textAlias: "/stop",
      category: "session",
    }),
    defineChatCommand({
      key: "restart",
      nativeName: "restart",
      description: t("chatCmd.restart.desc"),
      textAlias: "/restart",
      category: "tools",
    }),
    defineChatCommand({
      key: "activation",
      nativeName: "activation",
      description: t("chatCmd.activation.desc"),
      textAlias: "/activation",
      category: "management",
      args: [
        {
          name: "mode",
          description: t("chatCmd.activation.argMode"),
          type: "string",
          choices: ["mention", "always"],
        },
      ],
      argsMenu: "auto",
    }),
    defineChatCommand({
      key: "send",
      nativeName: "send",
      description: t("chatCmd.send.desc"),
      textAlias: "/send",
      category: "management",
      args: [
        {
          name: "mode",
          description: t("chatCmd.send.argMode"),
          type: "string",
          choices: ["on", "off", "inherit"],
        },
      ],
      argsMenu: "auto",
    }),
    defineChatCommand({
      key: "reset",
      nativeName: "reset",
      description: t("chatCmd.reset.desc"),
      textAlias: "/reset",
      acceptsArgs: true,
      category: "session",
    }),
    defineChatCommand({
      key: "new",
      nativeName: "new",
      description: t("chatCmd.new.desc"),
      textAlias: "/new",
      acceptsArgs: true,
      category: "session",
    }),
    defineChatCommand({
      key: "compact",
      nativeName: "compact",
      description: t("chatCmd.compact.desc"),
      textAlias: "/compact",
      category: "session",
      args: [
        {
          name: "instructions",
          description: t("chatCmd.compact.argInstructions"),
          type: "string",
          captureRemaining: true,
        },
      ],
    }),
    defineChatCommand({
      key: "think",
      nativeName: "think",
      description: t("chatCmd.think.desc"),
      textAlias: "/think",
      category: "options",
      args: [
        {
          name: "level",
          description: t("chatCmd.think.argLevel"),
          type: "string",
          choices: ({ provider, model }) => listThinkingLevels(provider, model),
        },
      ],
      argsMenu: "auto",
    }),
    defineChatCommand({
      key: "verbose",
      nativeName: "verbose",
      description: t("chatCmd.verbose.desc"),
      textAlias: "/verbose",
      category: "options",
      args: [
        {
          name: "mode",
          description: t("chatCmd.verbose.argMode"),
          type: "string",
          choices: ["on", "off"],
        },
      ],
      argsMenu: "auto",
    }),
    defineChatCommand({
      key: "reasoning",
      nativeName: "reasoning",
      description: t("chatCmd.reasoning.desc"),
      textAlias: "/reasoning",
      category: "options",
      args: [
        {
          name: "mode",
          description: t("chatCmd.reasoning.argMode"),
          type: "string",
          choices: ["on", "off", "stream"],
        },
      ],
      argsMenu: "auto",
    }),
    defineChatCommand({
      key: "elevated",
      nativeName: "elevated",
      description: t("chatCmd.elevated.desc"),
      textAlias: "/elevated",
      category: "options",
      args: [
        {
          name: "mode",
          description: t("chatCmd.elevated.argMode"),
          type: "string",
          choices: ["on", "off", "ask", "full"],
        },
      ],
      argsMenu: "auto",
    }),
    defineChatCommand({
      key: "exec",
      nativeName: "exec",
      description: t("chatCmd.exec.desc"),
      textAlias: "/exec",
      category: "options",
      args: [
        {
          name: "host",
          description: t("chatCmd.exec.argHost"),
          type: "string",
          choices: ["sandbox", "gateway", "node"],
        },
        {
          name: "security",
          description: t("chatCmd.exec.argSecurity"),
          type: "string",
          choices: ["deny", "allowlist", "full"],
        },
        {
          name: "ask",
          description: t("chatCmd.exec.argAsk"),
          type: "string",
          choices: ["off", "on-miss", "always"],
        },
        {
          name: "node",
          description: t("chatCmd.exec.argNode"),
          type: "string",
        },
      ],
      argsParsing: "none",
      formatArgs: COMMAND_ARG_FORMATTERS.exec,
    }),
    defineChatCommand({
      key: "model",
      nativeName: "model",
      description: t("chatCmd.model.desc"),
      textAlias: "/model",
      category: "options",
      args: [
        {
          name: "model",
          description: t("chatCmd.model.argModel"),
          type: "string",
        },
      ],
    }),
    defineChatCommand({
      key: "models",
      nativeName: "models",
      description: t("chatCmd.models.desc"),
      textAlias: "/models",
      argsParsing: "none",
      acceptsArgs: true,
      category: "options",
    }),
    defineChatCommand({
      key: "queue",
      nativeName: "queue",
      description: t("chatCmd.queue.desc"),
      textAlias: "/queue",
      category: "options",
      args: [
        {
          name: "mode",
          description: t("chatCmd.queue.argMode"),
          type: "string",
          choices: ["steer", "interrupt", "followup", "collect", "steer-backlog"],
        },
        {
          name: "debounce",
          description: t("chatCmd.queue.argDebounce"),
          type: "string",
        },
        {
          name: "cap",
          description: t("chatCmd.queue.argCap"),
          type: "number",
        },
        {
          name: "drop",
          description: t("chatCmd.queue.argDrop"),
          type: "string",
          choices: ["old", "new", "summarize"],
        },
      ],
      argsParsing: "none",
      formatArgs: COMMAND_ARG_FORMATTERS.queue,
    }),
    defineChatCommand({
      key: "bash",
      description: t("chatCmd.bash.desc"),
      textAlias: "/bash",
      scope: "text",
      category: "tools",
      args: [
        {
          name: "command",
          description: t("chatCmd.bash.argCommand"),
          type: "string",
          captureRemaining: true,
        },
      ],
    }),
    ...listChannelDocks()
      .filter((dock) => dock.capabilities.nativeCommands)
      .map((dock) => defineDockCommand(dock)),
  ];

  registerAlias(commands, "whoami", "/id");
  registerAlias(commands, "think", "/thinking", "/t");
  registerAlias(commands, "verbose", "/v");
  registerAlias(commands, "reasoning", "/reason");
  registerAlias(commands, "elevated", "/elev");
  registerAlias(commands, "steer", "/tell");

  assertCommandRegistry(commands);
  return commands;
}

export function getChatCommands(): ChatCommandDefinition[] {
  const registry = getActivePluginRegistry();
  if (cachedCommands && registry === cachedRegistry) {
    return cachedCommands;
  }
  const commands = buildChatCommands();
  cachedCommands = commands;
  cachedRegistry = registry;
  cachedNativeCommandSurfaces = null;
  return commands;
}

export function getNativeCommandSurfaces(): Set<string> {
  const registry = getActivePluginRegistry();
  if (cachedNativeCommandSurfaces && registry === cachedNativeRegistry) {
    return cachedNativeCommandSurfaces;
  }
  cachedNativeCommandSurfaces = new Set(
    listChannelDocks()
      .filter((dock) => dock.capabilities.nativeCommands)
      .map((dock) => dock.id),
  );
  cachedNativeRegistry = registry;
  return cachedNativeCommandSurfaces;
}
