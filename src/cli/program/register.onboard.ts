import type { Command } from "commander";
import { formatAuthChoiceChoicesForCli } from "../../commands/auth-choice-options.js";
import type { GatewayDaemonRuntime } from "../../commands/daemon-runtime.js";
import { CORE_ONBOARD_AUTH_FLAGS } from "../../commands/onboard-core-auth-flags.js";
import type {
  AuthChoice,
  GatewayAuthChoice,
  GatewayBind,
  NodeManagerChoice,
  ResetScope,
  SecretInputMode,
  TailscaleMode,
} from "../../commands/onboard-types.js";
import { setupWizardCommand } from "../../commands/onboard.js";
import { resolveManifestProviderOnboardAuthFlags } from "../../plugins/provider-auth-choices.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";

function resolveInstallDaemonFlag(
  command: unknown,
  opts: { installDaemon?: boolean },
): boolean | undefined {
  if (!command || typeof command !== "object") {
    return undefined;
  }
  const getOptionValueSource =
    "getOptionValueSource" in command ? command.getOptionValueSource : undefined;
  if (typeof getOptionValueSource !== "function") {
    return undefined;
  }

  // Commander doesn't support option conflicts natively; keep original behavior.
  // If --skip-daemon is explicitly passed, it wins.
  if (getOptionValueSource.call(command, "skipDaemon") === "cli") {
    return false;
  }
  if (getOptionValueSource.call(command, "installDaemon") === "cli") {
    return Boolean(opts.installDaemon);
  }
  return undefined;
}

const AUTH_CHOICE_HELP = formatAuthChoiceChoicesForCli({
  includeLegacyAliases: true,
  includeSkip: true,
});

const ONBOARD_AUTH_FLAGS = [
  ...CORE_ONBOARD_AUTH_FLAGS,
  ...resolveManifestProviderOnboardAuthFlags(),
] as const;

function pickOnboardProviderAuthOptionValues(
  opts: Record<string, unknown>,
): Partial<Record<string, string | undefined>> {
  return Object.fromEntries(
    ONBOARD_AUTH_FLAGS.map((flag) => [flag.optionKey, opts[flag.optionKey] as string | undefined]),
  );
}

export function registerOnboardCommand(program: Command) {
  const command = program
    .command("onboard")
    .description("Interactive onboarding for the gateway, workspace, and skills")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted(t("helpDocs"))} ${formatDocsLink("/cli/onboard", "docs.openclaw.ai/cli/onboard")}\n`,
    )
    .option("--workspace <dir>", t("cli.onboard.optWorkspace"))
    .option(
      "--reset",
      "Reset config + credentials + sessions before running onboard (workspace only with --reset-scope full)",
    )
    .option("--reset-scope <scope>", t("cli.onboard.optResetScope"))
    .option("--non-interactive", t("cli.onboard.optNonInteractive"), false)
    .option(
      "--accept-risk",
      t("cli.onboard.optAcceptRisk"),
      false,
    )
    .option("--flow <flow>", "Onboard flow: quickstart|advanced|manual")
    .option("--mode <mode>", "Onboard mode: local|remote")
    .option("--auth-choice <choice>", `Auth: ${AUTH_CHOICE_HELP}`)
    .option(
      "--token-provider <id>",
      t("cli.onboard.optTokenProvider"),
    )
    .option("--token <token>", t("cli.onboard.optToken"))
    .option(
      "--token-profile-id <id>",
      t("cli.onboard.optTokenProfileId"),
    )
    .option("--token-expires-in <duration>", t("cli.onboard.optTokenExpiresIn"))
    .option(
      "--secret-input-mode <mode>",
      t("cli.onboard.optSecretInputMode"),
    )
    .option("--cloudflare-ai-gateway-account-id <id>", t("cli.onboard.optCfAccountId"))
    .option("--cloudflare-ai-gateway-gateway-id <id>", t("cli.onboard.optCfGatewayId"));

  for (const providerFlag of ONBOARD_AUTH_FLAGS) {
    command.option(providerFlag.cliOption, providerFlag.description);
  }

  command
    .option("--custom-base-url <url>", t("cli.onboard.optCustomBaseUrl"))
    .option("--custom-api-key <key>", t("cli.onboard.optCustomApiKey"))
    .option("--custom-model-id <id>", t("cli.onboard.optCustomModelId"))
    .option("--custom-provider-id <id>", t("cli.onboard.optCustomProviderId"))
    .option(
      "--custom-compatibility <mode>",
      t("cli.onboard.optCustomCompatibility"),
    )
    .option("--gateway-port <port>", t("cli.onboard.optGatewayPort"))
    .option("--gateway-bind <mode>", t("cli.onboard.optGatewayBind"))
    .option("--gateway-auth <mode>", t("cli.onboard.optGatewayAuth"))
    .option("--gateway-token <token>", t("cli.onboard.optGatewayToken"))
    .option(
      "--gateway-token-ref-env <name>",
      t("cli.onboard.optGatewayTokenRefEnv"),
    )
    .option("--gateway-password <password>", t("cli.onboard.optGatewayPassword"))
    .option("--remote-url <url>", t("cli.onboard.optRemoteUrl"))
    .option("--remote-token <token>", t("cli.onboard.optRemoteToken"))
    .option("--tailscale <mode>", t("cli.onboard.optTailscale"))
    .option("--tailscale-reset-on-exit", t("cli.onboard.optTailscaleReset"))
    .option("--install-daemon", t("cli.onboard.optInstallDaemon"))
    .option("--no-install-daemon", t("cli.onboard.optNoInstallDaemon"))
    .option("--skip-daemon", t("cli.onboard.optSkipDaemon"))
    .option("--daemon-runtime <runtime>", t("cli.onboard.optDaemonRuntime"))
    .option("--skip-channels", t("cli.onboard.optSkipChannels"))
    .option("--skip-skills", t("cli.onboard.optSkipSkills"))
    .option("--skip-search", t("cli.onboard.optSkipSearch"))
    .option("--skip-health", t("cli.onboard.optSkipHealth"))
    .option("--skip-ui", t("cli.onboard.optSkipUi"))
    .option("--node-manager <name>", t("cli.onboard.optNodeManager"))
    .option("--json", t("cli.onboard.optJson"), false);

  command.action(async (opts, commandRuntime) => {
    await runCommandWithRuntime(defaultRuntime, async () => {
      const installDaemon = resolveInstallDaemonFlag(commandRuntime, {
        installDaemon: Boolean(opts.installDaemon),
      });
      const gatewayPort =
        typeof opts.gatewayPort === "string" ? Number.parseInt(opts.gatewayPort, 10) : undefined;
      const providerAuthOptionValues = pickOnboardProviderAuthOptionValues(
        opts as Record<string, unknown>,
      );
      await setupWizardCommand(
        {
          workspace: opts.workspace as string | undefined,
          nonInteractive: Boolean(opts.nonInteractive),
          acceptRisk: Boolean(opts.acceptRisk),
          flow: opts.flow as "quickstart" | "advanced" | "manual" | undefined,
          mode: opts.mode as "local" | "remote" | undefined,
          authChoice: opts.authChoice as AuthChoice | undefined,
          tokenProvider: opts.tokenProvider as string | undefined,
          token: opts.token as string | undefined,
          tokenProfileId: opts.tokenProfileId as string | undefined,
          tokenExpiresIn: opts.tokenExpiresIn as string | undefined,
          secretInputMode: opts.secretInputMode as SecretInputMode | undefined,
          ...providerAuthOptionValues,
          cloudflareAiGatewayAccountId: opts.cloudflareAiGatewayAccountId as string | undefined,
          cloudflareAiGatewayGatewayId: opts.cloudflareAiGatewayGatewayId as string | undefined,
          customBaseUrl: opts.customBaseUrl as string | undefined,
          customApiKey: opts.customApiKey as string | undefined,
          customModelId: opts.customModelId as string | undefined,
          customProviderId: opts.customProviderId as string | undefined,
          customCompatibility: opts.customCompatibility as "openai" | "anthropic" | undefined,
          gatewayPort:
            typeof gatewayPort === "number" && Number.isFinite(gatewayPort)
              ? gatewayPort
              : undefined,
          gatewayBind: opts.gatewayBind as GatewayBind | undefined,
          gatewayAuth: opts.gatewayAuth as GatewayAuthChoice | undefined,
          gatewayToken: opts.gatewayToken as string | undefined,
          gatewayTokenRefEnv: opts.gatewayTokenRefEnv as string | undefined,
          gatewayPassword: opts.gatewayPassword as string | undefined,
          remoteUrl: opts.remoteUrl as string | undefined,
          remoteToken: opts.remoteToken as string | undefined,
          tailscale: opts.tailscale as TailscaleMode | undefined,
          tailscaleResetOnExit: Boolean(opts.tailscaleResetOnExit),
          reset: Boolean(opts.reset),
          resetScope: opts.resetScope as ResetScope | undefined,
          installDaemon,
          daemonRuntime: opts.daemonRuntime as GatewayDaemonRuntime | undefined,
          skipChannels: Boolean(opts.skipChannels),
          skipSkills: Boolean(opts.skipSkills),
          skipSearch: Boolean(opts.skipSearch),
          skipHealth: Boolean(opts.skipHealth),
          skipUi: Boolean(opts.skipUi),
          nodeManager: opts.nodeManager as NodeManagerChoice | undefined,
          json: Boolean(opts.json),
        },
        defaultRuntime,
      );
    });
  });
}
