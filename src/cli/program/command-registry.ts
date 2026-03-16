import type { Command } from "commander";
import { getPrimaryCommand, hasHelpOrVersion } from "../argv.js";
import { t } from "../../i18n/index.js";
import { reparseProgramFromActionArgs } from "./action-reparse.js";
import { removeCommandByName } from "./command-tree.js";
import type { ProgramContext } from "./context.js";
import { registerSubCliCommands } from "./register.subclis.js";

type CommandRegisterParams = {
  program: Command;
  ctx: ProgramContext;
  argv: string[];
};

export type CommandRegistration = {
  id: string;
  register: (params: CommandRegisterParams) => void;
};

type CoreCliCommandDescriptor = {
  name: string;
  description: string;
  hasSubcommands: boolean;
};

type CoreCliEntry = {
  commands: CoreCliCommandDescriptor[];
  register: (params: CommandRegisterParams) => Promise<void> | void;
};

const shouldRegisterCorePrimaryOnly = (argv: string[]) => {
  if (hasHelpOrVersion(argv)) {
    return false;
  }
  return true;
};

// Note for humans and agents:
// If you update the list of commands, also check whether they have subcommands
// and set the flag accordingly.
const coreEntries: CoreCliEntry[] = [
  {
    commands: [
      {
        name: "setup",
        description: t("commandRegistry.setup"),
        hasSubcommands: false,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.setup.js");
      mod.registerSetupCommand(program);
    },
  },
  {
    commands: [
      {
        name: "onboard",
        description: t("commandRegistry.onboard"),
        hasSubcommands: false,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.onboard.js");
      mod.registerOnboardCommand(program);
    },
  },
  {
    commands: [
      {
        name: "configure",
        description:
          t("commandRegistry.configure"),
        hasSubcommands: false,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.configure.js");
      mod.registerConfigureCommand(program);
    },
  },
  {
    commands: [
      {
        name: "config",
        description:
          t("commandRegistry.config"),
        hasSubcommands: true,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("../config-cli.js");
      mod.registerConfigCli(program);
    },
  },
  {
    commands: [
      {
        name: "backup",
        description: t("commandRegistry.backup"),
        hasSubcommands: true,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.backup.js");
      mod.registerBackupCommand(program);
    },
  },
  {
    commands: [
      {
        name: "doctor",
        description: t("commandRegistry.doctor"),
        hasSubcommands: false,
      },
      {
        name: "dashboard",
        description: t("commandRegistry.dashboard"),
        hasSubcommands: false,
      },
      {
        name: "reset",
        description: t("commandRegistry.reset"),
        hasSubcommands: false,
      },
      {
        name: "uninstall",
        description: t("commandRegistry.uninstall"),
        hasSubcommands: false,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.maintenance.js");
      mod.registerMaintenanceCommands(program);
    },
  },
  {
    commands: [
      {
        name: "message",
        description: t("commandRegistry.message"),
        hasSubcommands: true,
      },
    ],
    register: async ({ program, ctx }) => {
      const mod = await import("./register.message.js");
      mod.registerMessageCommands(program, ctx);
    },
  },
  {
    commands: [
      {
        name: "memory",
        description: t("commandRegistry.memory"),
        hasSubcommands: true,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("../memory-cli.js");
      mod.registerMemoryCli(program);
    },
  },
  {
    commands: [
      {
        name: "agent",
        description: t("commandRegistry.agent"),
        hasSubcommands: false,
      },
      {
        name: "agents",
        description: t("commandRegistry.agents"),
        hasSubcommands: true,
      },
    ],
    register: async ({ program, ctx }) => {
      const mod = await import("./register.agent.js");
      mod.registerAgentCommands(program, {
        agentChannelOptions: ctx.agentChannelOptions,
      });
    },
  },
  {
    commands: [
      {
        name: "status",
        description: t("commandRegistry.status"),
        hasSubcommands: false,
      },
      {
        name: "health",
        description: t("commandRegistry.health"),
        hasSubcommands: false,
      },
      {
        name: "sessions",
        description: t("commandRegistry.sessions"),
        hasSubcommands: true,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.status-health-sessions.js");
      mod.registerStatusHealthSessionsCommands(program);
    },
  },
  {
    commands: [
      {
        name: "browser",
        description: t("commandRegistry.browser"),
        hasSubcommands: true,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("../browser-cli.js");
      mod.registerBrowserCli(program);
    },
  },
];

function collectCoreCliCommandNames(predicate?: (command: CoreCliCommandDescriptor) => boolean) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of coreEntries) {
    for (const command of entry.commands) {
      if (predicate && !predicate(command)) {
        continue;
      }
      if (seen.has(command.name)) {
        continue;
      }
      seen.add(command.name);
      names.push(command.name);
    }
  }
  return names;
}

export function getCoreCliCommandDescriptors(): ReadonlyArray<CoreCliCommandDescriptor> {
  return coreEntries.flatMap((entry) => entry.commands);
}

export function getCoreCliCommandNames(): string[] {
  return collectCoreCliCommandNames();
}

export function getCoreCliCommandsWithSubcommands(): string[] {
  return collectCoreCliCommandNames((command) => command.hasSubcommands);
}

function removeEntryCommands(program: Command, entry: CoreCliEntry) {
  // Some registrars install multiple top-level commands (e.g. status/health/sessions).
  // Remove placeholders/old registrations for all names in the entry before re-registering.
  for (const cmd of entry.commands) {
    removeCommandByName(program, cmd.name);
  }
}

function registerLazyCoreCommand(
  program: Command,
  ctx: ProgramContext,
  entry: CoreCliEntry,
  command: CoreCliCommandDescriptor,
) {
  const placeholder = program.command(command.name).description(command.description);
  placeholder.allowUnknownOption(true);
  placeholder.allowExcessArguments(true);
  placeholder.action(async (...actionArgs) => {
    removeEntryCommands(program, entry);
    await entry.register({ program, ctx, argv: process.argv });
    await reparseProgramFromActionArgs(program, actionArgs);
  });
}

export async function registerCoreCliByName(
  program: Command,
  ctx: ProgramContext,
  name: string,
  argv: string[] = process.argv,
): Promise<boolean> {
  const entry = coreEntries.find((candidate) =>
    candidate.commands.some((cmd) => cmd.name === name),
  );
  if (!entry) {
    return false;
  }

  removeEntryCommands(program, entry);
  await entry.register({ program, ctx, argv });
  return true;
}

export function registerCoreCliCommands(program: Command, ctx: ProgramContext, argv: string[]) {
  const primary = getPrimaryCommand(argv);
  if (primary && shouldRegisterCorePrimaryOnly(argv)) {
    const entry = coreEntries.find((candidate) =>
      candidate.commands.some((cmd) => cmd.name === primary),
    );
    if (entry) {
      const cmd = entry.commands.find((c) => c.name === primary);
      if (cmd) {
        registerLazyCoreCommand(program, ctx, entry, cmd);
      }
      return;
    }
  }

  for (const entry of coreEntries) {
    for (const cmd of entry.commands) {
      registerLazyCoreCommand(program, ctx, entry, cmd);
    }
  }
}

export function registerProgramCommands(
  program: Command,
  ctx: ProgramContext,
  argv: string[] = process.argv,
) {
  registerCoreCliCommands(program, ctx, argv);
  registerSubCliCommands(program, argv);
}
