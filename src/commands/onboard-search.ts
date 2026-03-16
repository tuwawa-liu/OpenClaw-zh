import type { OpenClawConfig } from "../config/config.js";
import {
  DEFAULT_SECRET_PROVIDER_ALIAS,
  type SecretInput,
  type SecretRef,
  hasConfiguredSecretInput,
  normalizeSecretInputString,
} from "../config/types.secrets.js";
import { t } from "../i18n/index.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import type { SecretInputMode } from "./onboard-types.js";

export type SearchProvider = string;

type SearchProviderEntry = {
  value: SearchProvider;
  label: string;
  hint: string;
  envKeys: string[];
  placeholder: string;
  signupUrl: string;
};

export const SEARCH_PROVIDER_OPTIONS: readonly SearchProviderEntry[] = [
  {
    value: "brave",
    label: "Brave 搜索",
    hint: t("onboardSearch.braveHint"),
    envKeys: ["BRAVE_API_KEY"],
    placeholder: "BSA...",
    signupUrl: "https://brave.com/search/api/",
  },
  {
    value: "gemini",
    label: "Gemini（Google 搜索）",
    hint: t("onboardSearch.geminiHint"),
    envKeys: ["GEMINI_API_KEY"],
    placeholder: "AIza...",
    signupUrl: "https://aistudio.google.com/apikey",
  },
  {
    value: "grok",
    label: "Grok (xAI)",
    hint: t("onboardSearch.grokHint"),
    envKeys: ["XAI_API_KEY"],
    placeholder: "xai-...",
    signupUrl: "https://console.x.ai/",
  },
  {
    value: "kimi",
    label: "Kimi (Moonshot)",
    hint: t("onboardSearch.kimiHint"),
    envKeys: ["KIMI_API_KEY", "MOONSHOT_API_KEY"],
    placeholder: "sk-...",
    signupUrl: "https://platform.moonshot.cn/",
  },
  {
    value: "perplexity",
    label: "Perplexity 搜索",
    hint: t("onboardSearch.perplexityHint"),
    envKeys: ["PERPLEXITY_API_KEY"],
    placeholder: "pplx-...",
    signupUrl: "https://www.perplexity.ai/settings/api",
  },
] as const;

export function hasKeyInEnv(entry: SearchProviderEntry): boolean {
  return entry.envKeys.some((k) => Boolean(process.env[k]?.trim()));
}

function rawKeyValue(config: OpenClawConfig, provider: SearchProvider): unknown {
  const search = config.tools?.web?.search;
  const entry = resolvePluginWebSearchProviders({
    config,
    bundledAllowlistCompat: true,
  }).find((candidate) => candidate.id === provider);
  return entry?.getCredentialValue(search as Record<string, unknown> | undefined);
}

/** Returns the plaintext key string, or undefined for SecretRefs/missing. */
export function resolveExistingKey(
  config: OpenClawConfig,
  provider: SearchProvider,
): string | undefined {
  return normalizeSecretInputString(rawKeyValue(config, provider));
}

/** Returns true if a key is configured (plaintext string or SecretRef). */
export function hasExistingKey(config: OpenClawConfig, provider: SearchProvider): boolean {
  return hasConfiguredSecretInput(rawKeyValue(config, provider));
}

/** Build an env-backed SecretRef for a search provider. */
function buildSearchEnvRef(provider: SearchProvider): SecretRef {
  const entry = SEARCH_PROVIDER_OPTIONS.find((e) => e.value === provider);
  const envVar = entry?.envKeys.find((k) => Boolean(process.env[k]?.trim())) ?? entry?.envKeys[0];
  if (!envVar) {
    throw new Error(
      `No env var mapping for search provider "${provider}" in secret-input-mode=ref.`,
    );
  }
  return { source: "env", provider: DEFAULT_SECRET_PROVIDER_ALIAS, id: envVar };
}

/** Resolve a plaintext key into the appropriate SecretInput based on mode. */
function resolveSearchSecretInput(
  provider: SearchProvider,
  key: string,
  secretInputMode?: SecretInputMode,
): SecretInput {
  const useSecretRefMode = secretInputMode === "ref"; // pragma: allowlist secret
  if (useSecretRefMode) {
    return buildSearchEnvRef(provider);
  }
  return key;
}

export function applySearchKey(
  config: OpenClawConfig,
  provider: SearchProvider,
  key: SecretInput,
): OpenClawConfig {
  const search = { ...config.tools?.web?.search, provider, enabled: true };
  const entry = resolvePluginWebSearchProviders({
    config,
    bundledAllowlistCompat: true,
  }).find((candidate) => candidate.id === provider);
  if (entry) {
    entry.setCredentialValue(search as Record<string, unknown>, key);
  }
  return {
    ...config,
    tools: {
      ...config.tools,
      web: { ...config.tools?.web, search },
    },
  };
}

function applyProviderOnly(config: OpenClawConfig, provider: SearchProvider): OpenClawConfig {
  return {
    ...config,
    tools: {
      ...config.tools,
      web: {
        ...config.tools?.web,
        search: {
          ...config.tools?.web?.search,
          provider,
          enabled: true,
        },
      },
    },
  };
}

function preserveDisabledState(original: OpenClawConfig, result: OpenClawConfig): OpenClawConfig {
  if (original.tools?.web?.search?.enabled !== false) {
    return result;
  }
  return {
    ...result,
    tools: {
      ...result.tools,
      web: { ...result.tools?.web, search: { ...result.tools?.web?.search, enabled: false } },
    },
  };
}

export type SetupSearchOptions = {
  quickstartDefaults?: boolean;
  secretInputMode?: SecretInputMode;
};

export async function setupSearch(
  config: OpenClawConfig,
  _runtime: RuntimeEnv,
  prompter: WizardPrompter,
  opts?: SetupSearchOptions,
): Promise<OpenClawConfig> {
  await prompter.note(
    [
      t("onboardSearch.webSearchIntro"),
      t("onboardSearch.chooseProvider"),
      t("onboardSearch.docsLink"),
    ].join("\n"),
    t("onboardSearch.webSearch"),
  );

  const existingProvider = config.tools?.web?.search?.provider;

  const options = SEARCH_PROVIDER_OPTIONS.map((entry) => {
    const configured = hasExistingKey(config, entry.value) || hasKeyInEnv(entry);
    const hint = configured ? `${entry.hint} · ${t("onboardSearch.configured")}` : entry.hint;
    return { value: entry.value, label: entry.label, hint };
  });

  const defaultProvider: SearchProvider = (() => {
    if (existingProvider && SEARCH_PROVIDER_OPTIONS.some((e) => e.value === existingProvider)) {
      return existingProvider;
    }
    const detected = SEARCH_PROVIDER_OPTIONS.find(
      (e) => hasExistingKey(config, e.value) || hasKeyInEnv(e),
    );
    if (detected) {
      return detected.value;
    }
    return SEARCH_PROVIDER_OPTIONS[0].value;
  })();

  type PickerValue = string;
  const choice = await prompter.select<PickerValue>({
    message: t("onboardSearch.searchProvider"),
    options: [
      ...options,
      {
        value: "__skip__" as const,
        label: t("onboardSearch.skipForNow"),
        hint: t("onboardSearch.skipHint"),
      },
    ],
    initialValue: defaultProvider,
  });

  if (choice === "__skip__") {
    return config;
  }

  const entry = SEARCH_PROVIDER_OPTIONS.find((e) => e.value === choice)!;
  const existingKey = resolveExistingKey(config, choice);
  const keyConfigured = hasExistingKey(config, choice);
  const envAvailable = hasKeyInEnv(entry);

  if (opts?.quickstartDefaults && (keyConfigured || envAvailable)) {
    const result = existingKey
      ? applySearchKey(config, choice, existingKey)
      : applyProviderOnly(config, choice);
    return preserveDisabledState(config, result);
  }

  const useSecretRefMode = opts?.secretInputMode === "ref"; // pragma: allowlist secret
  if (useSecretRefMode) {
    if (keyConfigured) {
      return preserveDisabledState(config, applyProviderOnly(config, choice));
    }
    const ref = buildSearchEnvRef(choice);
    await prompter.note(
      [
        t("onboardSearch.secretRefsEnabled"),
        `${t("onboardSearch.envVar")}: ${ref.id}${envAvailable ? ` (${t("onboardSearch.detected")})` : ""}.`,
        ...(envAvailable ? [] : [t("onboardSearch.setEnvVar", { id: ref.id })]),
        t("onboardSearch.docsLink"),
      ].join("\n"),
      t("onboardSearch.webSearch"),
    );
    return applySearchKey(config, choice, ref);
  }

  const keyInput = await prompter.text({
    message: keyConfigured
      ? `${entry.label} API 密钥（留空以保留当前值）`
      : envAvailable
        ? `${entry.label} API 密钥（留空以使用环境变量）`
        : `${entry.label} API 密钥`,
    placeholder: keyConfigured ? "留空以保留当前值" : entry.placeholder,
  });

  const key = keyInput?.trim() ?? "";
  if (key) {
    const secretInput = resolveSearchSecretInput(choice, key, opts?.secretInputMode);
    return applySearchKey(config, choice, secretInput);
  }

  if (existingKey) {
    return preserveDisabledState(config, applySearchKey(config, choice, existingKey));
  }

  if (keyConfigured || envAvailable) {
    return preserveDisabledState(config, applyProviderOnly(config, choice));
  }

  await prompter.note(
    [
      t("onboardSearch.noApiKey"),
      `${t("onboardSearch.getKeyAt")}: ${entry.signupUrl}`,
      t("onboardSearch.docsLink"),
    ].join("\n"),
    t("onboardSearch.webSearch"),
  );

  return {
    ...config,
    tools: {
      ...config.tools,
      web: {
        ...config.tools?.web,
        search: {
          ...config.tools?.web?.search,
          provider: choice,
        },
      },
    },
  };
}
