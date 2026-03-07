import {
  promptSecretRefForOnboarding,
  resolveSecretInputModeForEnvSelection,
} from "../commands/auth-choice.apply-helpers.js";
import {
  normalizeGatewayTokenInput,
  randomToken,
  validateGatewayPasswordInput,
} from "../commands/onboard-helpers.js";
import type { GatewayAuthChoice, SecretInputMode } from "../commands/onboard-types.js";
import type { GatewayBindMode, GatewayTailscaleMode, OpenClawConfig } from "../config/config.js";
import { ensureControlUiAllowedOriginsForNonLoopbackBind } from "../config/gateway-control-ui-origins.js";
import {
  normalizeSecretInputString,
  resolveSecretInputRef,
  type SecretInput,
} from "../config/types.secrets.js";
import {
  maybeAddTailnetOriginToControlUiAllowedOrigins,
  TAILSCALE_DOCS_LINES,
  TAILSCALE_EXPOSURE_OPTIONS,
  TAILSCALE_MISSING_BIN_NOTE_LINES,
} from "../gateway/gateway-config-prompts.shared.js";
import { DEFAULT_DANGEROUS_NODE_COMMANDS } from "../gateway/node-command-policy.js";
import { t } from "../i18n/index.js";
import { findTailscaleBinary } from "../infra/tailscale.js";
import type { RuntimeEnv } from "../runtime.js";
import { validateIPv4AddressInput } from "../shared/net/ipv4.js";
import { resolveOnboardingSecretInputString } from "./onboarding.secret-input.js";
import type {
  GatewayWizardSettings,
  QuickstartGatewayDefaults,
  WizardFlow,
} from "./onboarding.types.js";
import type { WizardPrompter } from "./prompts.js";

type ConfigureGatewayOptions = {
  flow: WizardFlow;
  baseConfig: OpenClawConfig;
  nextConfig: OpenClawConfig;
  localPort: number;
  quickstartGateway: QuickstartGatewayDefaults;
  secretInputMode?: SecretInputMode;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
};

type ConfigureGatewayResult = {
  nextConfig: OpenClawConfig;
  settings: GatewayWizardSettings;
};

export async function configureGatewayForOnboarding(
  opts: ConfigureGatewayOptions,
): Promise<ConfigureGatewayResult> {
  const { flow, localPort, quickstartGateway, prompter } = opts;
  let { nextConfig } = opts;

  const port =
    flow === "quickstart"
      ? quickstartGateway.port
      : Number.parseInt(
          String(
            await prompter.text({
              message: t("wizard.gateway.portMsg"),
              initialValue: String(localPort),
              validate: (value) => (Number.isFinite(Number(value)) ? undefined : t("wizard.gateway.invalidPort")),
            }),
          ),
          10,
        );

  let bind: GatewayWizardSettings["bind"] =
    flow === "quickstart"
      ? quickstartGateway.bind
      : await prompter.select<GatewayWizardSettings["bind"]>({
          message: t("wizard.gateway.bindMsg"),
          options: [
            { value: "loopback", label: t("wizard.gateway.bindLoopback") },
            { value: "lan", label: t("wizard.gateway.bindLan") },
            { value: "tailnet", label: t("wizard.gateway.bindTailnet") },
            { value: "auto", label: t("wizard.gateway.bindAuto") },
            { value: "custom", label: t("wizard.gateway.bindCustom") },
          ],
        });

  let customBindHost = quickstartGateway.customBindHost;
  if (bind === "custom") {
    const needsPrompt = flow !== "quickstart" || !customBindHost;
    if (needsPrompt) {
      const input = await prompter.text({
        message: t("wizard.gateway.customIpMsg"),
        placeholder: t("wizard.gateway.customIpPlaceholder"),
        initialValue: customBindHost ?? "",
        validate: validateIPv4AddressInput,
      });
      customBindHost = typeof input === "string" ? input.trim() : undefined;
    }
  }

  let authMode =
    flow === "quickstart"
      ? quickstartGateway.authMode
      : ((await prompter.select({
          message: t("wizard.gateway.authMsg"),
          options: [
            {
              value: "token",
              label: t("wizard.gateway.authToken"),
              hint: t("wizard.gateway.authTokenHint"),
            },
            { value: "password", label: t("wizard.gateway.authPassword") },
          ],
          initialValue: "token",
        })) as GatewayAuthChoice);

  const tailscaleMode: GatewayWizardSettings["tailscaleMode"] =
    flow === "quickstart"
      ? quickstartGateway.tailscaleMode
      : await prompter.select<GatewayWizardSettings["tailscaleMode"]>({
          message: t("wizard.gateway.tailscaleMsg"),
          options: [...TAILSCALE_EXPOSURE_OPTIONS],
        });

  // Detect Tailscale binary before proceeding with serve/funnel setup.
  // Persist the path so getTailnetHostname can reuse it for origin injection.
  let tailscaleBin: string | null = null;
  if (tailscaleMode !== "off") {
    tailscaleBin = await findTailscaleBinary();
    if (!tailscaleBin) {
      await prompter.note(TAILSCALE_MISSING_BIN_NOTE_LINES.join("\n"), t("wizard.gateway.tailscaleWarningTitle"));
    }
  }

  let tailscaleResetOnExit = flow === "quickstart" ? quickstartGateway.tailscaleResetOnExit : false;
  if (tailscaleMode !== "off" && flow !== "quickstart") {
    await prompter.note(TAILSCALE_DOCS_LINES.join("\n"), t("wizard.gateway.tailscaleNoteTitle"));
    tailscaleResetOnExit = Boolean(
      await prompter.confirm({
        message: t("wizard.gateway.tailscaleResetConfirm"),
        initialValue: false,
      }),
    );
  }

  // Safety + constraints:
  // - Tailscale wants bind=loopback so we never expose a non-loopback server + tailscale serve/funnel at once.
  // - Funnel requires password auth.
  if (tailscaleMode !== "off" && bind !== "loopback") {
    await prompter.note(t("wizard.gateway.tailscaleBindAdjust"), t("wizard.gateway.noteTitle"));
    bind = "loopback";
    customBindHost = undefined;
  }

  if (tailscaleMode === "funnel" && authMode !== "password") {
    await prompter.note(t("wizard.gateway.tailscaleFunnelAuth"), t("wizard.gateway.noteTitle"));
    authMode = "password";
  }

  let gatewayToken: string | undefined;
  let gatewayTokenInput: SecretInput | undefined;
  if (authMode === "token") {
    const quickstartTokenString = normalizeSecretInputString(quickstartGateway.token);
    const quickstartTokenRef = resolveSecretInputRef({
      value: quickstartGateway.token,
      defaults: nextConfig.secrets?.defaults,
    }).ref;
    const tokenMode =
      flow === "quickstart" && opts.secretInputMode !== "ref" // pragma: allowlist secret
        ? quickstartTokenRef
          ? "ref"
          : "plaintext"
        : await resolveSecretInputModeForEnvSelection({
            prompter,
            explicitMode: opts.secretInputMode,
            copy: {
              modeMessage: t("wizard.gateway.tokenModeMsg"),
              plaintextLabel: t("wizard.gateway.tokenPlaintext"),
              plaintextHint: t("wizard.gateway.tokenPlaintextHint"),
              refLabel: t("wizard.gateway.tokenRef"),
              refHint: t("wizard.gateway.tokenRefHint"),
            },
          });
    if (tokenMode === "ref") {
      if (flow === "quickstart" && quickstartTokenRef) {
        gatewayTokenInput = quickstartTokenRef;
        gatewayToken = await resolveOnboardingSecretInputString({
          config: nextConfig,
          value: quickstartTokenRef,
          path: "gateway.auth.token",
          env: process.env,
        });
      } else {
        const resolved = await promptSecretRefForOnboarding({
          provider: "gateway-auth-token",
          config: nextConfig,
          prompter,
          preferredEnvVar: "OPENCLAW_GATEWAY_TOKEN",
          copy: {
            sourceMessage: t("wizard.gateway.tokenSourceMsg"),
            envVarPlaceholder: "OPENCLAW_GATEWAY_TOKEN",
          },
        });
        gatewayTokenInput = resolved.ref;
        gatewayToken = resolved.resolvedValue;
      }
    } else if (flow === "quickstart") {
      gatewayToken =
        (quickstartTokenString ?? normalizeGatewayTokenInput(process.env.OPENCLAW_GATEWAY_TOKEN)) ||
        randomToken();
      gatewayTokenInput = gatewayToken;
    } else {
      const tokenInput = await prompter.text({
        message: t("wizard.gateway.tokenInputMsg"),
        placeholder: t("wizard.gateway.tokenInputPlaceholder"),
        initialValue:
          quickstartTokenString ??
          normalizeGatewayTokenInput(process.env.OPENCLAW_GATEWAY_TOKEN) ??
          "",
      });
      gatewayToken = normalizeGatewayTokenInput(tokenInput) || randomToken();
      gatewayTokenInput = gatewayToken;
    }
  }

  if (authMode === "password") {
    let password: SecretInput | undefined =
      flow === "quickstart" && quickstartGateway.password ? quickstartGateway.password : undefined;
    if (!password) {
      const selectedMode = await resolveSecretInputModeForEnvSelection({
        prompter,
        explicitMode: opts.secretInputMode,
        copy: {
          modeMessage: t("wizard.gateway.passwordModeMsg"),
          plaintextLabel: t("wizard.gateway.passwordPlaintext"),
          plaintextHint: t("wizard.gateway.passwordPlaintextHint"),
        },
      });
      if (selectedMode === "ref") {
        const resolved = await promptSecretRefForOnboarding({
          provider: "gateway-auth-password",
          config: nextConfig,
          prompter,
          preferredEnvVar: "OPENCLAW_GATEWAY_PASSWORD",
          copy: {
            sourceMessage: t("wizard.gateway.passwordSourceMsg"),
            envVarPlaceholder: "OPENCLAW_GATEWAY_PASSWORD",
          },
        });
        password = resolved.ref;
      } else {
        password = String(
          (await prompter.text({
            message: t("wizard.gateway.passwordInputMsg"),
            validate: validateGatewayPasswordInput,
          })) ?? "",
        ).trim();
      }
    }
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        auth: {
          ...nextConfig.gateway?.auth,
          mode: "password",
          password,
        },
      },
    };
  } else if (authMode === "token") {
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        auth: {
          ...nextConfig.gateway?.auth,
          mode: "token",
          token: gatewayTokenInput,
        },
      },
    };
  }

  nextConfig = {
    ...nextConfig,
    gateway: {
      ...nextConfig.gateway,
      port,
      bind: bind as GatewayBindMode,
      ...(bind === "custom" && customBindHost ? { customBindHost } : {}),
      tailscale: {
        ...nextConfig.gateway?.tailscale,
        mode: tailscaleMode as GatewayTailscaleMode,
        resetOnExit: tailscaleResetOnExit,
      },
    },
  };

  nextConfig = ensureControlUiAllowedOriginsForNonLoopbackBind(nextConfig, {
    requireControlUiEnabled: true,
  }).config;
  nextConfig = await maybeAddTailnetOriginToControlUiAllowedOrigins({
    config: nextConfig,
    tailscaleMode,
    tailscaleBin,
  });

  // If this is a new gateway setup (no existing gateway settings), start with a
  // denylist for high-risk node commands. Users can arm these temporarily via
  // /phone arm ... (phone-control plugin).
  if (
    !quickstartGateway.hasExisting &&
    nextConfig.gateway?.nodes?.denyCommands === undefined &&
    nextConfig.gateway?.nodes?.allowCommands === undefined &&
    nextConfig.gateway?.nodes?.browser === undefined
  ) {
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        nodes: {
          ...nextConfig.gateway?.nodes,
          denyCommands: [...DEFAULT_DANGEROUS_NODE_COMMANDS],
        },
      },
    };
  }

  return {
    nextConfig,
    settings: {
      port,
      bind: bind as GatewayBindMode,
      customBindHost: bind === "custom" ? customBindHost : undefined,
      authMode,
      gatewayToken,
      tailscaleMode: tailscaleMode as GatewayTailscaleMode,
      tailscaleResetOnExit,
    },
  };
}
