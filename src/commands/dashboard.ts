import { readConfigFileSnapshot, resolveGatewayPort } from "../config/config.js";
import type { OpenClawConfig } from "../config/types.js";
import { readGatewayTokenEnv } from "../gateway/credentials.js";
import { resolveConfiguredSecretInputWithFallback } from "../gateway/resolve-configured-secret-input-string.js";
import { t } from "../i18n/index.js";
import { copyToClipboard } from "../infra/clipboard.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import {
  detectBrowserOpenSupport,
  formatControlUiSshHint,
  openUrl,
  resolveControlUiLinks,
} from "./onboard-helpers.js";

type DashboardOptions = {
  noOpen?: boolean;
};

async function resolveDashboardToken(
  cfg: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  token?: string;
  source?: "config" | "env" | "secretRef";
  unresolvedRefReason?: string;
  tokenSecretRefConfigured: boolean;
}> {
  const resolved = await resolveConfiguredSecretInputWithFallback({
    config: cfg,
    env,
    value: cfg.gateway?.auth?.token,
    path: "gateway.auth.token",
    readFallback: () => readGatewayTokenEnv(env),
  });
  return {
    token: resolved.value,
    source:
      resolved.source === "config"
        ? "config"
        : resolved.source === "secretRef"
          ? "secretRef"
          : resolved.source === "fallback"
            ? "env"
            : undefined,
    unresolvedRefReason: resolved.unresolvedRefReason,
    tokenSecretRefConfigured: resolved.secretRefConfigured,
  };
}

export async function dashboardCommand(
  runtime: RuntimeEnv = defaultRuntime,
  options: DashboardOptions = {},
) {
  const snapshot = await readConfigFileSnapshot();
  const cfg = snapshot.valid ? snapshot.config : {};
  const port = resolveGatewayPort(cfg);
  const bind = cfg.gateway?.bind ?? "loopback";
  const basePath = cfg.gateway?.controlUi?.basePath;
  const customBindHost = cfg.gateway?.customBindHost;
  const resolvedToken = await resolveDashboardToken(cfg, process.env);
  const token = resolvedToken.token ?? "";

  // LAN URLs fail secure-context checks in browsers.
  // Coerce only lan->loopback and preserve other bind modes.
  const links = resolveControlUiLinks({
    port,
    bind: bind === "lan" ? "loopback" : bind,
    customBindHost,
    basePath,
  });
  // Avoid embedding externally managed SecretRef tokens in terminal/clipboard/browser args.
  const includeTokenInUrl = token.length > 0 && !resolvedToken.tokenSecretRefConfigured;
  // Prefer URL fragment to avoid leaking auth tokens via query params.
  const dashboardUrl = includeTokenInUrl
    ? `${links.httpUrl}#token=${encodeURIComponent(token)}`
    : links.httpUrl;

  runtime.log(t("commands.dashboard.dashboardUrl", { url: dashboardUrl }));
  if (resolvedToken.tokenSecretRefConfigured && token) {
    runtime.log(t("commands.dashboard.secretRefDisabled"));
  }
  if (resolvedToken.unresolvedRefReason) {
    runtime.log(t("commands.dashboard.autoAuthUnavailable", { reason: resolvedToken.unresolvedRefReason }));
    runtime.log(t("commands.dashboard.setTokenHint"));
  }

  const copied = await copyToClipboard(dashboardUrl).catch(() => false);
  runtime.log(copied ? t("commands.dashboard.copiedClipboard") : t("commands.dashboard.clipboardUnavailable"));

  let opened = false;
  let hint: string | undefined;
  if (!options.noOpen) {
    const browserSupport = await detectBrowserOpenSupport();
    if (browserSupport.ok) {
      opened = await openUrl(dashboardUrl);
    }
    if (!opened) {
      hint = formatControlUiSshHint({
        port,
        basePath,
        token: includeTokenInUrl ? token || undefined : undefined,
      });
    }
  } else {
    hint = t("commands.dashboard.browserDisabled");
  }

  if (opened) {
    runtime.log(t("commands.dashboard.browserOpened"));
  } else if (hint) {
    runtime.log(hint);
  }
}
