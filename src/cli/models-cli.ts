import type { Command } from "commander";
import {
  githubCopilotLoginCommand,
  modelsAliasesAddCommand,
  modelsAliasesListCommand,
  modelsAliasesRemoveCommand,
  modelsAuthAddCommand,
  modelsAuthLoginCommand,
  modelsAuthOrderClearCommand,
  modelsAuthOrderGetCommand,
  modelsAuthOrderSetCommand,
  modelsAuthPasteTokenCommand,
  modelsAuthSetupTokenCommand,
  modelsFallbacksAddCommand,
  modelsFallbacksClearCommand,
  modelsFallbacksListCommand,
  modelsFallbacksRemoveCommand,
  modelsImageFallbacksAddCommand,
  modelsImageFallbacksClearCommand,
  modelsImageFallbacksListCommand,
  modelsImageFallbacksRemoveCommand,
  modelsListCommand,
  modelsScanCommand,
  modelsSetCommand,
  modelsSetImageCommand,
  modelsStatusCommand,
} from "../commands/models.js";
import { t } from "../i18n/index.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { resolveOptionFromCommand, runCommandWithRuntime } from "./cli-utils.js";

function runModelsCommand(action: () => Promise<void>) {
  return runCommandWithRuntime(defaultRuntime, action);
}

export function registerModelsCli(program: Command) {
  const models = program
    .command("models")
    .description(t("cli.models.desc"))
    .option("--status-json", t("cli.models.optStatusJson"), false)
    .option("--status-plain", t("cli.models.optStatusPlain"), false)
    .option("--agent <id>", t("cli.models.optAgent"))
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted(t("helpDocs"))} ${formatDocsLink("/cli/models", "docs.openclaw.ai/cli/models")}\n`,
    );

  models
    .command("list")
    .description(t("cli.models.list.desc"))
    .option("--all", t("cli.models.list.optAll"), false)
    .option("--local", t("cli.models.list.optLocal"), false)
    .option("--provider <name>", t("cli.models.list.optProvider"))
    .option("--json", t("cli.models.list.optJson"), false)
    .option("--plain", t("cli.models.list.optPlain"), false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsListCommand(opts, defaultRuntime);
      });
    });

  models
    .command("status")
    .description(t("cli.models.status.desc"))
    .option("--json", t("cli.models.status.optJson"), false)
    .option("--plain", t("cli.models.status.optPlain"), false)
    .option("--check", t("cli.models.status.optCheck"), false)
    .option("--probe", t("cli.models.status.optProbe"), false)
    .option("--probe-provider <name>", t("cli.models.status.optProbeProvider"))
    .option("--probe-profile <id>", t("cli.models.status.optProbeProfile"), (value, previous) => {
      const next = Array.isArray(previous) ? previous : previous ? [previous] : [];
      next.push(value);
      return next;
    })
    .option("--probe-timeout <ms>", t("cli.models.status.optProbeTimeout"))
    .option("--probe-concurrency <n>", t("cli.models.status.optProbeConcurrency"))
    .option("--probe-max-tokens <n>", t("cli.models.status.optProbeMaxTokens"))
    .option("--agent <id>", t("cli.models.status.optAgent"))
    .action(async (opts, command) => {
      const agent =
        resolveOptionFromCommand<string>(command, "agent") ?? (opts.agent as string | undefined);
      await runModelsCommand(async () => {
        await modelsStatusCommand(
          {
            json: Boolean(opts.json),
            plain: Boolean(opts.plain),
            check: Boolean(opts.check),
            probe: Boolean(opts.probe),
            probeProvider: opts.probeProvider as string | undefined,
            probeProfile: opts.probeProfile as string | string[] | undefined,
            probeTimeout: opts.probeTimeout as string | undefined,
            probeConcurrency: opts.probeConcurrency as string | undefined,
            probeMaxTokens: opts.probeMaxTokens as string | undefined,
            agent,
          },
          defaultRuntime,
        );
      });
    });

  models
    .command("set")
    .description(t("cli.models.set.desc"))
    .argument("<model>", t("cli.models.modelArg"))
    .action(async (model: string) => {
      await runModelsCommand(async () => {
        await modelsSetCommand(model, defaultRuntime);
      });
    });

  models
    .command("set-image")
    .description(t("cli.models.setImage.desc"))
    .argument("<model>", t("cli.models.modelArg"))
    .action(async (model: string) => {
      await runModelsCommand(async () => {
        await modelsSetImageCommand(model, defaultRuntime);
      });
    });

  const aliases = models.command("aliases").description(t("cli.models.aliases.desc"));

  aliases
    .command("list")
    .description(t("cli.models.aliases.list.desc"))
    .option("--json", t("cli.models.aliases.list.optJson"), false)
    .option("--plain", t("cli.models.aliases.list.optPlain"), false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsAliasesListCommand(opts, defaultRuntime);
      });
    });

  aliases
    .command("add")
    .description(t("cli.models.aliases.add.desc"))
    .argument("<alias>", t("cli.models.aliasArg"))
    .argument("<model>", t("cli.models.modelArg"))
    .action(async (alias: string, model: string) => {
      await runModelsCommand(async () => {
        await modelsAliasesAddCommand(alias, model, defaultRuntime);
      });
    });

  aliases
    .command("remove")
    .description(t("cli.models.aliases.remove.desc"))
    .argument("<alias>", t("cli.models.aliasArg"))
    .action(async (alias: string) => {
      await runModelsCommand(async () => {
        await modelsAliasesRemoveCommand(alias, defaultRuntime);
      });
    });

  const fallbacks = models.command("fallbacks").description(t("cli.models.fallbacks.desc"));

  fallbacks
    .command("list")
    .description(t("cli.models.fallbacks.list.desc"))
    .option("--json", t("cli.models.fallbacks.list.optJson"), false)
    .option("--plain", t("cli.models.fallbacks.list.optPlain"), false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsFallbacksListCommand(opts, defaultRuntime);
      });
    });

  fallbacks
    .command("add")
    .description(t("cli.models.fallbacks.add.desc"))
    .argument("<model>", t("cli.models.modelArg"))
    .action(async (model: string) => {
      await runModelsCommand(async () => {
        await modelsFallbacksAddCommand(model, defaultRuntime);
      });
    });

  fallbacks
    .command("remove")
    .description(t("cli.models.fallbacks.remove.desc"))
    .argument("<model>", t("cli.models.modelArg"))
    .action(async (model: string) => {
      await runModelsCommand(async () => {
        await modelsFallbacksRemoveCommand(model, defaultRuntime);
      });
    });

  fallbacks
    .command("clear")
    .description(t("cli.models.fallbacks.clear.desc"))
    .action(async () => {
      await runModelsCommand(async () => {
        await modelsFallbacksClearCommand(defaultRuntime);
      });
    });

  const imageFallbacks = models
    .command("image-fallbacks")
    .description(t("cli.models.imageFallbacks.desc"));

  imageFallbacks
    .command("list")
    .description(t("cli.models.imageFallbacks.list.desc"))
    .option("--json", t("cli.models.imageFallbacks.list.optJson"), false)
    .option("--plain", t("cli.models.imageFallbacks.list.optPlain"), false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsImageFallbacksListCommand(opts, defaultRuntime);
      });
    });

  imageFallbacks
    .command("add")
    .description(t("cli.models.imageFallbacks.add.desc"))
    .argument("<model>", t("cli.models.modelArg"))
    .action(async (model: string) => {
      await runModelsCommand(async () => {
        await modelsImageFallbacksAddCommand(model, defaultRuntime);
      });
    });

  imageFallbacks
    .command("remove")
    .description(t("cli.models.imageFallbacks.remove.desc"))
    .argument("<model>", t("cli.models.modelArg"))
    .action(async (model: string) => {
      await runModelsCommand(async () => {
        await modelsImageFallbacksRemoveCommand(model, defaultRuntime);
      });
    });

  imageFallbacks
    .command("clear")
    .description(t("cli.models.imageFallbacks.clear.desc"))
    .action(async () => {
      await runModelsCommand(async () => {
        await modelsImageFallbacksClearCommand(defaultRuntime);
      });
    });

  models
    .command("scan")
    .description(t("cli.models.scan.desc"))
    .option("--min-params <b>", t("cli.models.scan.optMinParams"))
    .option("--max-age-days <days>", t("cli.models.scan.optMaxAgeDays"))
    .option("--provider <name>", t("cli.models.scan.optProvider"))
    .option("--max-candidates <n>", t("cli.models.scan.optMaxCandidates"), "6")
    .option("--timeout <ms>", t("cli.models.scan.optTimeout"))
    .option("--concurrency <n>", t("cli.models.scan.optConcurrency"))
    .option("--no-probe", t("cli.models.scan.optNoProbe"))
    .option("--yes", t("cli.models.scan.optYes"), false)
    .option("--no-input", t("cli.models.scan.optNoInput"))
    .option("--set-default", t("cli.models.scan.optSetDefault"), false)
    .option("--set-image", t("cli.models.scan.optSetImage"), false)
    .option("--json", t("cli.models.scan.optJson"), false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsScanCommand(opts, defaultRuntime);
      });
    });

  models.action(async (opts) => {
    await runModelsCommand(async () => {
      await modelsStatusCommand(
        {
          json: Boolean(opts?.statusJson),
          plain: Boolean(opts?.statusPlain),
          agent: opts?.agent as string | undefined,
        },
        defaultRuntime,
      );
    });
  });

  const auth = models.command("auth").description(t("cli.models.auth.desc"));
  auth.option("--agent <id>", t("cli.models.auth.agentOpt"));
  auth.action(() => {
    auth.help();
  });

  auth
    .command("add")
    .description(t("cli.models.auth.add.desc"))
    .action(async () => {
      await runModelsCommand(async () => {
        await modelsAuthAddCommand({}, defaultRuntime);
      });
    });

  auth
    .command("login")
    .description(t("cli.models.auth.login.desc"))
    .option("--provider <id>", t("cli.models.auth.login.optProvider"))
    .option("--method <id>", t("cli.models.auth.login.optMethod"))
    .option("--set-default", t("cli.models.auth.login.optSetDefault"), false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsAuthLoginCommand(
          {
            provider: opts.provider as string | undefined,
            method: opts.method as string | undefined,
            setDefault: Boolean(opts.setDefault),
          },
          defaultRuntime,
        );
      });
    });

  auth
    .command("setup-token")
    .description(t("cli.models.auth.setupToken.desc"))
    .option("--provider <name>", t("cli.models.auth.setupToken.optProvider"))
    .option("--yes", t("cli.models.auth.setupToken.optYes"), false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsAuthSetupTokenCommand(
          {
            provider: opts.provider as string | undefined,
            yes: Boolean(opts.yes),
          },
          defaultRuntime,
        );
      });
    });

  auth
    .command("paste-token")
    .description(t("cli.models.auth.pasteToken.desc"))
    .requiredOption("--provider <name>", t("cli.models.auth.pasteToken.optProvider"))
    .option("--profile-id <id>", t("cli.models.auth.pasteToken.optProfileId"))
    .option("--expires-in <duration>", t("cli.models.auth.pasteToken.optExpiresIn"))
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsAuthPasteTokenCommand(
          {
            provider: opts.provider as string | undefined,
            profileId: opts.profileId as string | undefined,
            expiresIn: opts.expiresIn as string | undefined,
          },
          defaultRuntime,
        );
      });
    });

  auth
    .command("login-github-copilot")
    .description(t("cli.models.auth.loginGithubCopilot.desc"))
    .option("--profile-id <id>", t("cli.models.auth.loginGithubCopilot.optProfileId"))
    .option("--yes", t("cli.models.auth.loginGithubCopilot.optYes"), false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await githubCopilotLoginCommand(
          {
            profileId: opts.profileId as string | undefined,
            yes: Boolean(opts.yes),
          },
          defaultRuntime,
        );
      });
    });

  const order = auth.command("order").description(t("cli.models.auth.order.desc"));

  order
    .command("get")
    .description(t("cli.models.auth.order.get.desc"))
    .requiredOption("--provider <name>", t("cli.models.auth.order.get.optProvider"))
    .option("--agent <id>", t("cli.models.auth.order.get.optAgent"))
    .option("--json", t("cli.models.auth.order.get.optJson"), false)
    .action(async (opts, command) => {
      const agent =
        resolveOptionFromCommand<string>(command, "agent") ?? (opts.agent as string | undefined);
      await runModelsCommand(async () => {
        await modelsAuthOrderGetCommand(
          {
            provider: opts.provider as string,
            agent,
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });

  order
    .command("set")
    .description(t("cli.models.auth.order.set.desc"))
    .requiredOption("--provider <name>", t("cli.models.auth.order.set.optProvider"))
    .option("--agent <id>", t("cli.models.auth.order.set.optAgent"))
    .argument("<profileIds...>", t("cli.models.auth.order.set.profileIdsArg"))
    .action(async (profileIds: string[], opts, command) => {
      const agent =
        resolveOptionFromCommand<string>(command, "agent") ?? (opts.agent as string | undefined);
      await runModelsCommand(async () => {
        await modelsAuthOrderSetCommand(
          {
            provider: opts.provider as string,
            agent,
            order: profileIds,
          },
          defaultRuntime,
        );
      });
    });

  order
    .command("clear")
    .description(t("cli.models.auth.order.clear.desc"))
    .requiredOption("--provider <name>", t("cli.models.auth.order.clear.optProvider"))
    .option("--agent <id>", t("cli.models.auth.order.clear.optAgent"))
    .action(async (opts, command) => {
      const agent =
        resolveOptionFromCommand<string>(command, "agent") ?? (opts.agent as string | undefined);
      await runModelsCommand(async () => {
        await modelsAuthOrderClearCommand(
          {
            provider: opts.provider as string,
            agent,
          },
          defaultRuntime,
        );
      });
    });
}
