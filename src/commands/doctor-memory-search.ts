import fsSync from "node:fs";
import { resolveAgentDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { resolveMemorySearchConfig } from "../agents/memory-search.js";
import { resolveApiKeyForProvider } from "../agents/model-auth.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import { resolveMemoryBackendConfig } from "../memory/backend-config.js";
import { DEFAULT_LOCAL_MODEL } from "../memory/embeddings.js";
import { hasConfiguredMemorySecretInput } from "../memory/secret-input.js";
import { t } from "../i18n/index.js";
import { note } from "../terminal/note.js";
import { resolveUserPath } from "../utils.js";

/**
 * Check whether memory search has a usable embedding provider.
 * Runs as part of `openclaw doctor` — config-only, no network calls.
 */
export async function noteMemorySearchHealth(
  cfg: OpenClawConfig,
  opts?: {
    gatewayMemoryProbe?: {
      checked: boolean;
      ready: boolean;
      error?: string;
    };
  },
): Promise<void> {
  const agentId = resolveDefaultAgentId(cfg);
  const agentDir = resolveAgentDir(cfg, agentId);
  const resolved = resolveMemorySearchConfig(cfg, agentId);
  const hasRemoteApiKey = hasConfiguredMemorySecretInput(resolved?.remote?.apiKey);

  if (!resolved) {
    note(t("commands.doctorMemorySearch.disabled"), t("commands.doctorMemorySearch.title"));
    return;
  }

  // QMD backend handles embeddings internally (e.g. embeddinggemma) — no
  // separate embedding provider is needed. Skip the provider check entirely.
  const backendConfig = resolveMemoryBackendConfig({ cfg, agentId });
  if (backendConfig.backend === "qmd") {
    return;
  }

  // If a specific provider is configured (not "auto"), check only that one.
  if (resolved.provider !== "auto") {
    if (resolved.provider === "local") {
      if (hasLocalEmbeddings(resolved.local, true)) {
        // Model path looks valid (explicit file, hf: URL, or default model).
        // If a gateway probe is available and reports not-ready, warn anyway —
        // the model download or node-llama-cpp setup may have failed at runtime.
        if (opts?.gatewayMemoryProbe?.checked && !opts.gatewayMemoryProbe.ready) {
          const detail = opts.gatewayMemoryProbe.error?.trim();
          note(
            [
              t("commands.doctorMemorySearch.localNotReady"),
              detail ? t("commands.doctorMemorySearch.gatewayProbeDetail", { detail }) : null,
              "",
              t("commands.doctorMemorySearch.verifyCommand", { command: formatCliCommand("openclaw memory status --deep") }),
            ]
              .filter(Boolean)
              .join("\n"),
            t("commands.doctorMemorySearch.title"),
          );
        }
        return;
      }
      note(
        [
          t("commands.doctorMemorySearch.localNoModel"),
          "",
          t("commands.doctorMemorySearch.fixPickOne"),
          t("commands.doctorMemorySearch.installLlama"),
          t("commands.doctorMemorySearch.switchRemoteProvider", { command: formatCliCommand("openclaw config set agents.defaults.memorySearch.provider openai") }),
          "",
          t("commands.doctorMemorySearch.verifyCommand", { command: formatCliCommand("openclaw memory status --deep") }),
        ].join("\n"),
        t("commands.doctorMemorySearch.title"),
      );
      return;
    }
    // Remote provider — check for API key
    if (hasRemoteApiKey || (await hasApiKeyForProvider(resolved.provider, cfg, agentDir))) {
      return;
    }
    if (opts?.gatewayMemoryProbe?.checked && opts.gatewayMemoryProbe.ready) {
      note(
        [
          t("commands.doctorMemorySearch.apiKeyNotFoundCli", { provider: resolved.provider }),
          t("commands.doctorMemorySearch.gatewayReportsReady"),
          t("commands.doctorMemorySearch.verifyCommand", { command: formatCliCommand("openclaw memory status --deep") }),
        ].join("\n"),
        t("commands.doctorMemorySearch.title"),
      );
      return;
    }
    const gatewayProbeWarning = buildGatewayProbeWarning(opts?.gatewayMemoryProbe);
    const envVar = providerEnvVar(resolved.provider);
    note(
      [
        t("commands.doctorMemorySearch.noApiKeyFound", { provider: resolved.provider }),
        t("commands.doctorMemorySearch.semanticRecallWontWork"),
        gatewayProbeWarning ? gatewayProbeWarning : null,
        "",
        t("commands.doctorMemorySearch.fixPickOne"),
        t("commands.doctorMemorySearch.setEnvVar", { envVar }),
        t("commands.doctorMemorySearch.configureCreds", { command: formatCliCommand("openclaw configure --section model") }),
        t("commands.doctorMemorySearch.toDisable", { command: formatCliCommand("openclaw config set agents.defaults.memorySearch.enabled false") }),
        "",
        t("commands.doctorMemorySearch.verifyCommand", { command: formatCliCommand("openclaw memory status --deep") }),
      ].join("\n"),
      t("commands.doctorMemorySearch.title"),
    );
    return;
  }

  // provider === "auto": check all providers in resolution order
  if (hasLocalEmbeddings(resolved.local)) {
    return;
  }
  for (const provider of ["openai", "gemini", "voyage", "mistral"] as const) {
    if (hasRemoteApiKey || (await hasApiKeyForProvider(provider, cfg, agentDir))) {
      return;
    }
  }

  if (opts?.gatewayMemoryProbe?.checked && opts.gatewayMemoryProbe.ready) {
    note(
      [
        t("commands.doctorMemorySearch.autoNoApiKeyCli"),
        t("commands.doctorMemorySearch.gatewayReportsReady"),
        t("commands.doctorMemorySearch.verifyCommand", { command: formatCliCommand("openclaw memory status --deep") }),
      ].join("\n"),
      t("commands.doctorMemorySearch.title"),
    );
    return;
  }
  const gatewayProbeWarning = buildGatewayProbeWarning(opts?.gatewayMemoryProbe);

  note(
    [
      "Memory search is enabled, but no embedding provider is ready.",
      "Semantic recall needs at least one embedding provider.",
      gatewayProbeWarning ? gatewayProbeWarning : null,
      "",
      t("commands.doctorMemorySearch.fixPickOne"),
      t("commands.doctorMemorySearch.setAnyApiKey"),
      t("commands.doctorMemorySearch.configureCreds", { command: formatCliCommand("openclaw configure --section model") }),
      t("commands.doctorMemorySearch.forLocalEmbeddings"),
      t("commands.doctorMemorySearch.toDisable", { command: formatCliCommand("openclaw config set agents.defaults.memorySearch.enabled false") }),
      "",
      t("commands.doctorMemorySearch.verifyCommand", { command: formatCliCommand("openclaw memory status --deep") }),
    ].join("\n"),
    t("commands.doctorMemorySearch.title"),
  );
}

/**
 * Check whether local embeddings are available.
 *
 * When `useDefaultFallback` is true (explicit `provider: "local"`), an empty
 * modelPath is treated as available because the runtime falls back to
 * DEFAULT_LOCAL_MODEL (an auto-downloaded HuggingFace model).
 *
 * When false (provider: "auto"), we only consider local available if the user
 * explicitly configured a local file path — matching `canAutoSelectLocal()`
 * in the runtime, which skips local for empty/hf: model paths.
 */
function hasLocalEmbeddings(local: { modelPath?: string }, useDefaultFallback = false): boolean {
  const modelPath =
    local.modelPath?.trim() || (useDefaultFallback ? DEFAULT_LOCAL_MODEL : undefined);
  if (!modelPath) {
    return false;
  }
  // Remote/downloadable models (hf: or http:) aren't pre-resolved on disk,
  // so we can't confirm availability without a network call. Treat as
  // potentially available — the user configured it intentionally.
  if (/^(hf:|https?:)/i.test(modelPath)) {
    return true;
  }
  const resolved = resolveUserPath(modelPath);
  try {
    return fsSync.statSync(resolved).isFile();
  } catch {
    return false;
  }
}

async function hasApiKeyForProvider(
  provider: "openai" | "gemini" | "voyage" | "mistral" | "ollama",
  cfg: OpenClawConfig,
  agentDir: string,
): Promise<boolean> {
  // Map embedding provider names to model-auth provider names
  const authProvider = provider === "gemini" ? "google" : provider;
  try {
    await resolveApiKeyForProvider({ provider: authProvider, cfg, agentDir });
    return true;
  } catch {
    return false;
  }
}

function providerEnvVar(provider: string): string {
  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "gemini":
      return "GEMINI_API_KEY";
    case "voyage":
      return "VOYAGE_API_KEY";
    default:
      return `${provider.toUpperCase()}_API_KEY`;
  }
}

function buildGatewayProbeWarning(
  probe:
    | {
        checked: boolean;
        ready: boolean;
        error?: string;
      }
    | undefined,
): string | null {
  if (!probe?.checked || probe.ready) {
    return null;
  }
  const detail = probe.error?.trim();
  return detail
    ? t("commands.doctorMemorySearch.gatewayProbeNotReady", { detail })
    : t("commands.doctorMemorySearch.gatewayProbeNotReadyShort");
}
