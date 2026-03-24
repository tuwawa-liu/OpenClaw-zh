import { CONTEXT_WINDOW_HARD_MIN_TOKENS } from "../agents/context-window-guard.js";
import { DEFAULT_PROVIDER } from "../agents/defaults.js";
import { buildModelAliasIndex, modelKey } from "../agents/model-selection.js";
import { OLLAMA_DEFAULT_BASE_URL } from "../agents/ollama-defaults.js";
import type { OpenClawConfig } from "../config/config.js";
import type { ModelProviderConfig } from "../config/types.models.js";
import { isSecretRef, type SecretInput } from "../config/types.secrets.js";
import { t } from "../i18n/index.js";
import type { RuntimeEnv } from "../runtime.js";
import { fetchWithTimeout } from "../utils/fetch-timeout.js";
import {
  normalizeSecretInput,
  normalizeOptionalSecretInput,
} from "../utils/normalize-secret-input.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { ensureApiKeyFromEnvOrPrompt } from "./auth-choice.apply-helpers.js";
import { applyPrimaryModel } from "./model-picker.js";
import { normalizeAlias } from "./models/shared.js";
import type { SecretInputMode } from "./onboard-types.js";

const DEFAULT_CONTEXT_WINDOW = CONTEXT_WINDOW_HARD_MIN_TOKENS;
const DEFAULT_MAX_TOKENS = 4096;
// Azure OpenAI uses the Responses API which supports larger defaults
const AZURE_DEFAULT_CONTEXT_WINDOW = 400_000;
const AZURE_DEFAULT_MAX_TOKENS = 16_384;
const VERIFY_TIMEOUT_MS = 30_000;

function normalizeContextWindowForCustomModel(value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
  return parsed >= CONTEXT_WINDOW_HARD_MIN_TOKENS ? parsed : CONTEXT_WINDOW_HARD_MIN_TOKENS;
}

function isAzureFoundryUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    const host = url.hostname.toLowerCase();
    return host.endsWith(".services.ai.azure.com");
  } catch {
    return false;
  }
}

function isAzureOpenAiUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    const host = url.hostname.toLowerCase();
    return host.endsWith(".openai.azure.com");
  } catch {
    return false;
  }
}

function isAzureUrl(baseUrl: string): boolean {
  return isAzureFoundryUrl(baseUrl) || isAzureOpenAiUrl(baseUrl);
}

/**
 * Transforms an Azure AI Foundry/OpenAI URL to include the deployment path.
 * Azure requires: https://host/openai/deployments/<model-id>/chat/completions?api-version=2024-xx-xx-preview
 * But we can't add query params here, so we just add the path prefix.
 * The api-version will be handled by the Azure OpenAI client or as a query param.
 *
 * Example:
 *   https://my-resource.services.ai.azure.com + gpt-5-nano
 *   => https://my-resource.services.ai.azure.com/openai/deployments/gpt-5-nano
 */
function transformAzureUrl(baseUrl: string, modelId: string): string {
  const normalizedUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  // Check if the URL already includes the deployment path
  if (normalizedUrl.includes("/openai/deployments/")) {
    return normalizedUrl;
  }
  return `${normalizedUrl}/openai/deployments/${modelId}`;
}

/**
 * Transforms an Azure URL into the base URL stored in config.
 *
 * Example:
 *   https://my-resource.openai.azure.com
 *   => https://my-resource.openai.azure.com/openai/v1
 */
function transformAzureConfigUrl(baseUrl: string): string {
  const normalizedUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  if (normalizedUrl.endsWith("/openai/v1")) {
    return normalizedUrl;
  }
  // Strip a full deployment path back to the base origin
  const deploymentIdx = normalizedUrl.indexOf("/openai/deployments/");
  const base = deploymentIdx !== -1 ? normalizedUrl.slice(0, deploymentIdx) : normalizedUrl;
  return `${base}/openai/v1`;
}

function hasSameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.toLowerCase() === new URL(b).hostname.toLowerCase();
  } catch {
    return false;
  }
}

export type CustomApiCompatibility = "openai" | "anthropic";
type CustomApiCompatibilityChoice = CustomApiCompatibility | "unknown";
export type CustomApiResult = {
  config: OpenClawConfig;
  providerId?: string;
  modelId?: string;
  providerIdRenamedFrom?: string;
};

export type ApplyCustomApiConfigParams = {
  config: OpenClawConfig;
  baseUrl: string;
  modelId: string;
  compatibility: CustomApiCompatibility;
  apiKey?: SecretInput;
  providerId?: string;
  alias?: string;
};

export type ParseNonInteractiveCustomApiFlagsParams = {
  baseUrl?: string;
  modelId?: string;
  compatibility?: string;
  apiKey?: string;
  providerId?: string;
};

export type ParsedNonInteractiveCustomApiFlags = {
  baseUrl: string;
  modelId: string;
  compatibility: CustomApiCompatibility;
  apiKey?: string;
  providerId?: string;
};

export type CustomApiErrorCode =
  | "missing_required"
  | "invalid_compatibility"
  | "invalid_base_url"
  | "invalid_model_id"
  | "invalid_provider_id"
  | "invalid_alias";

export class CustomApiError extends Error {
  readonly code: CustomApiErrorCode;

  constructor(code: CustomApiErrorCode, message: string) {
    super(message);
    this.name = "CustomApiError";
    this.code = code;
  }
}

export type ResolveCustomProviderIdParams = {
  config: OpenClawConfig;
  baseUrl: string;
  providerId?: string;
};

export type ResolvedCustomProviderId = {
  providerId: string;
  providerIdRenamedFrom?: string;
};

const COMPATIBILITY_OPTIONS: Array<{
  value: CustomApiCompatibilityChoice;
  label: string;
  hint: string;
}> = [
  {
    value: "openai",
    label: t("commands.custom.openaiCompat"),
    hint: t("commands.custom.openaiCompatHint"),
  },
  {
    value: "anthropic",
    label: t("commands.custom.anthropicCompat"),
    hint: t("commands.custom.anthropicCompatHint"),
  },
  {
    value: "unknown",
    label: t("commands.custom.unknownCompat"),
    hint: t("commands.custom.unknownCompatHint"),
  },
];

function normalizeEndpointId(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildEndpointIdFromUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const host = url.hostname.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const port = url.port ? `-${url.port}` : "";
    const candidate = `custom-${host}${port}`;
    return normalizeEndpointId(candidate) || "custom";
  } catch {
    return "custom";
  }
}

function resolveUniqueEndpointId(params: {
  requestedId: string;
  baseUrl: string;
  providers: Record<string, ModelProviderConfig | undefined>;
}) {
  const normalized = normalizeEndpointId(params.requestedId) || "custom";
  const existing = params.providers[normalized];
  if (
    !existing?.baseUrl ||
    existing.baseUrl === params.baseUrl ||
    (isAzureUrl(params.baseUrl) && hasSameHost(existing.baseUrl, params.baseUrl))
  ) {
    return { providerId: normalized, renamed: false };
  }
  let suffix = 2;
  let candidate = `${normalized}-${suffix}`;
  while (params.providers[candidate]) {
    suffix += 1;
    candidate = `${normalized}-${suffix}`;
  }
  return { providerId: candidate, renamed: true };
}

function resolveAliasError(params: {
  raw: string;
  cfg: OpenClawConfig;
  modelRef: string;
}): string | undefined {
  const trimmed = params.raw.trim();
  if (!trimmed) {
    return undefined;
  }
  let normalized: string;
  try {
    normalized = normalizeAlias(trimmed);
  } catch (err) {
    return err instanceof Error ? err.message : "别名无效。";
  }
  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg,
    defaultProvider: DEFAULT_PROVIDER,
  });
  const aliasKey = normalized.toLowerCase();
  const existing = aliasIndex.byAlias.get(aliasKey);
  if (!existing) {
    return undefined;
  }
  const existingKey = modelKey(existing.ref.provider, existing.ref.model);
  if (existingKey === params.modelRef) {
    return undefined;
  }
  return `Alias ${normalized} already points to ${existingKey}.`;
}

function buildAzureOpenAiHeaders(apiKey: string) {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["api-key"] = apiKey;
  }
  return headers;
}

function buildOpenAiHeaders(apiKey: string) {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function buildAnthropicHeaders(apiKey: string) {
  const headers: Record<string, string> = {
    "anthropic-version": "2023-06-01",
  };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

function formatVerificationError(error: unknown): string {
  if (!error) {
    return "unknown error";
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown error";
  }
}

type VerificationResult = {
  ok: boolean;
  status?: number;
  error?: unknown;
};

function normalizeOptionalProviderApiKey(value: unknown): SecretInput | undefined {
  if (isSecretRef(value)) {
    return value;
  }
  return normalizeOptionalSecretInput(value);
}

function resolveVerificationEndpoint(params: {
  baseUrl: string;
  modelId: string;
  endpointPath: "chat/completions" | "messages";
}) {
  const resolvedUrl = isAzureUrl(params.baseUrl)
    ? transformAzureUrl(params.baseUrl, params.modelId)
    : params.baseUrl;
  const endpointUrl = new URL(
    params.endpointPath,
    resolvedUrl.endsWith("/") ? resolvedUrl : `${resolvedUrl}/`,
  );
  if (isAzureUrl(params.baseUrl)) {
    endpointUrl.searchParams.set("api-version", "2024-10-21");
  }
  return endpointUrl.href;
}

async function requestVerification(params: {
  endpoint: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}): Promise<VerificationResult> {
  try {
    const res = await fetchWithTimeout(
      params.endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...params.headers,
        },
        body: JSON.stringify(params.body),
      },
      VERIFY_TIMEOUT_MS,
    );
    return { ok: res.ok, status: res.status };
  } catch (error) {
    return { ok: false, error };
  }
}

async function requestOpenAiVerification(params: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}): Promise<VerificationResult> {
  const isBaseUrlAzureUrl = isAzureUrl(params.baseUrl);
  const headers = isBaseUrlAzureUrl
    ? buildAzureOpenAiHeaders(params.apiKey)
    : buildOpenAiHeaders(params.apiKey);
  if (isAzureOpenAiUrl(params.baseUrl)) {
    const endpoint = new URL(
      "responses",
      transformAzureConfigUrl(params.baseUrl).replace(/\/?$/, "/"),
    ).href;
    return await requestVerification({
      endpoint,
      headers,
      body: {
        model: params.modelId,
        input: "Hi",
        max_output_tokens: 16,
        stream: false,
      },
    });
  } else {
    const endpoint = resolveVerificationEndpoint({
      baseUrl: params.baseUrl,
      modelId: params.modelId,
      endpointPath: "chat/completions",
    });
    return await requestVerification({
      endpoint,
      headers,
      body: {
        model: params.modelId,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1,
        stream: false,
      },
    });
  }
}

async function requestAnthropicVerification(params: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}): Promise<VerificationResult> {
  // Use a base URL with /v1 injected for this raw fetch only. The rest of the app uses the
  // Anthropic client, which appends /v1 itself; config should store the base URL
  // without /v1 to avoid /v1/v1/messages at runtime. See docs/gateway/configuration-reference.md.
  const baseUrlForRequest = /\/v1\/?$/.test(params.baseUrl.trim())
    ? params.baseUrl.trim()
    : params.baseUrl.trim().replace(/\/?$/, "") + "/v1";
  const endpoint = resolveVerificationEndpoint({
    baseUrl: baseUrlForRequest,
    modelId: params.modelId,
    endpointPath: "messages",
  });
  return await requestVerification({
    endpoint,
    headers: buildAnthropicHeaders(params.apiKey),
    body: {
      model: params.modelId,
      max_tokens: 1,
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
    },
  });
}

async function promptBaseUrlAndKey(params: {
  prompter: WizardPrompter;
  config: OpenClawConfig;
  secretInputMode?: SecretInputMode;
  initialBaseUrl?: string;
}): Promise<{ baseUrl: string; apiKey?: SecretInput; resolvedApiKey: string }> {
  const baseUrlInput = await params.prompter.text({
    message: t("commands.custom.baseUrlMsg"),
    initialValue: params.initialBaseUrl ?? OLLAMA_DEFAULT_BASE_URL,
    placeholder: t("commands.custom.baseUrlPlaceholder"),
    validate: (val) => {
      try {
        new URL(val);
        return undefined;
      } catch {
        return t("commands.custom.baseUrlValidate");
      }
    },
  });
  const baseUrl = baseUrlInput.trim();
  const providerHint = buildEndpointIdFromUrl(baseUrl) || "custom";
  let apiKeyInput: SecretInput | undefined;
  const resolvedApiKey = await ensureApiKeyFromEnvOrPrompt({
    config: params.config,
    provider: providerHint,
    envLabel: "CUSTOM_API_KEY",
    promptMessage: t("commands.custom.apiKeyMsg"),
    normalize: normalizeSecretInput,
    validate: () => undefined,
    prompter: params.prompter,
    secretInputMode: params.secretInputMode,
    setCredential: async (apiKey) => {
      apiKeyInput = apiKey;
    },
  });
  return {
    baseUrl,
    apiKey: normalizeOptionalProviderApiKey(apiKeyInput),
    resolvedApiKey: normalizeSecretInput(resolvedApiKey),
  };
}

type CustomApiRetryChoice = "baseUrl" | "model" | "both";

async function promptCustomApiRetryChoice(prompter: WizardPrompter): Promise<CustomApiRetryChoice> {
  return await prompter.select({
    message: t("commands.custom.changeMsg"),
    options: [
      { value: "baseUrl", label: t("commands.custom.changeUrl") },
      { value: "model", label: t("commands.custom.changeModel") },
      { value: "both", label: t("commands.custom.changeUrlModel") },
    ],
  });
}

async function promptCustomApiModelId(prompter: WizardPrompter): Promise<string> {
  return (
    await prompter.text({
      message: t("commands.custom.modelIdMsg"),
      placeholder: t("commands.custom.modelIdPlaceholder"),
      validate: (val) => (val.trim() ? undefined : t("commands.custom.modelIdRequired")),
    })
  ).trim();
}

async function applyCustomApiRetryChoice(params: {
  prompter: WizardPrompter;
  config: OpenClawConfig;
  secretInputMode?: SecretInputMode;
  retryChoice: CustomApiRetryChoice;
  current: { baseUrl: string; apiKey?: SecretInput; resolvedApiKey: string; modelId: string };
}): Promise<{ baseUrl: string; apiKey?: SecretInput; resolvedApiKey: string; modelId: string }> {
  let { baseUrl, apiKey, resolvedApiKey, modelId } = params.current;
  if (params.retryChoice === "baseUrl" || params.retryChoice === "both") {
    const retryInput = await promptBaseUrlAndKey({
      prompter: params.prompter,
      config: params.config,
      secretInputMode: params.secretInputMode,
      initialBaseUrl: baseUrl,
    });
    baseUrl = retryInput.baseUrl;
    apiKey = retryInput.apiKey;
    resolvedApiKey = retryInput.resolvedApiKey;
  }
  if (params.retryChoice === "model" || params.retryChoice === "both") {
    modelId = await promptCustomApiModelId(params.prompter);
  }
  return { baseUrl, apiKey, resolvedApiKey, modelId };
}

function resolveProviderApi(
  compatibility: CustomApiCompatibility,
): "openai-completions" | "anthropic-messages" {
  return compatibility === "anthropic" ? "anthropic-messages" : "openai-completions";
}

function parseCustomApiCompatibility(raw?: string): CustomApiCompatibility {
  const compatibilityRaw = raw?.trim().toLowerCase();
  if (!compatibilityRaw) {
    return "openai";
  }
  if (compatibilityRaw !== "openai" && compatibilityRaw !== "anthropic") {
    throw new CustomApiError(
      "invalid_compatibility",
      'Invalid --custom-compatibility (use "openai" or "anthropic").',
    );
  }
  return compatibilityRaw;
}

export function resolveCustomProviderId(
  params: ResolveCustomProviderIdParams,
): ResolvedCustomProviderId {
  const providers = params.config.models?.providers ?? {};
  const baseUrl = params.baseUrl.trim();
  const explicitProviderId = params.providerId?.trim();
  if (explicitProviderId && !normalizeEndpointId(explicitProviderId)) {
    throw new CustomApiError(
      "invalid_provider_id",
      "自定义提供者 ID 必须包含字母、数字或连字符。",
    );
  }
  const requestedProviderId = explicitProviderId || buildEndpointIdFromUrl(baseUrl);
  const providerIdResult = resolveUniqueEndpointId({
    requestedId: requestedProviderId,
    baseUrl,
    providers,
  });

  return {
    providerId: providerIdResult.providerId,
    ...(providerIdResult.renamed
      ? {
          providerIdRenamedFrom: normalizeEndpointId(requestedProviderId) || "custom",
        }
      : {}),
  };
}

export function parseNonInteractiveCustomApiFlags(
  params: ParseNonInteractiveCustomApiFlagsParams,
): ParsedNonInteractiveCustomApiFlags {
  const baseUrl = params.baseUrl?.trim() ?? "";
  const modelId = params.modelId?.trim() ?? "";
  if (!baseUrl || !modelId) {
    throw new CustomApiError(
      "missing_required",
      [
        'Auth choice "custom-api-key" requires a base URL and model ID.',
        "使用 --custom-base-url 和 --custom-model-id。",
      ].join("\n"),
    );
  }

  const apiKey = params.apiKey?.trim();
  const providerId = params.providerId?.trim();
  if (providerId && !normalizeEndpointId(providerId)) {
    throw new CustomApiError(
      "invalid_provider_id",
      "Custom provider ID must include letters, numbers, or hyphens.",
    );
  }
  return {
    baseUrl,
    modelId,
    compatibility: parseCustomApiCompatibility(params.compatibility),
    ...(apiKey ? { apiKey } : {}),
    ...(providerId ? { providerId } : {}),
  };
}

export function applyCustomApiConfig(params: ApplyCustomApiConfigParams): CustomApiResult {
  const baseUrl = params.baseUrl.trim();
  try {
    new URL(baseUrl);
  } catch {
    throw new CustomApiError("invalid_base_url", "自定义提供者基础 URL 必须是有效的 URL。");
  }

  if (params.compatibility !== "openai" && params.compatibility !== "anthropic") {
    throw new CustomApiError(
      "invalid_compatibility",
      'Custom provider compatibility must be "openai" or "anthropic".',
    );
  }

  const modelId = params.modelId.trim();
  if (!modelId) {
    throw new CustomApiError("invalid_model_id", "需要自定义提供者模型 ID。");
  }

  const isAzure = isAzureUrl(baseUrl);
  const isAzureOpenAi = isAzureOpenAiUrl(baseUrl);
  const resolvedBaseUrl = isAzure ? transformAzureConfigUrl(baseUrl) : baseUrl;

  const providerIdResult = resolveCustomProviderId({
    config: params.config,
    baseUrl: resolvedBaseUrl,
    providerId: params.providerId,
  });
  const providerId = providerIdResult.providerId;
  const providers = params.config.models?.providers ?? {};

  const modelRef = modelKey(providerId, modelId);
  const alias = params.alias?.trim() ?? "";
  const aliasError = resolveAliasError({
    raw: alias,
    cfg: params.config,
    modelRef,
  });
  if (aliasError) {
    throw new CustomApiError("invalid_alias", aliasError);
  }

  const existingProvider = providers[providerId];
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  const hasModel = existingModels.some((model) => model.id === modelId);
  const isLikelyReasoningModel = isAzure && /\b(o[134]|gpt-([5-9]|\d{2,}))\b/i.test(modelId);
  const nextModel = isAzure
    ? {
        id: modelId,
        name: `${modelId} (Custom Provider)`,
        contextWindow: AZURE_DEFAULT_CONTEXT_WINDOW,
        maxTokens: AZURE_DEFAULT_MAX_TOKENS,
        input: isLikelyReasoningModel
          ? (["text", "image"] as Array<"text" | "image">)
          : (["text"] as ["text"]),
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        reasoning: isLikelyReasoningModel,
        compat: { supportsStore: false },
      }
    : {
        id: modelId,
        name: `${modelId} (Custom Provider)`,
        contextWindow: DEFAULT_CONTEXT_WINDOW,
        maxTokens: DEFAULT_MAX_TOKENS,
        input: ["text"] as ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        reasoning: false,
      };
  const mergedModels = hasModel
    ? existingModels.map((model) =>
        model.id === modelId
          ? {
              ...model,
              ...(isAzure ? nextModel : {}),
              name: model.name ?? nextModel.name,
              cost: model.cost ?? nextModel.cost,
              contextWindow: normalizeContextWindowForCustomModel(model.contextWindow),
              maxTokens: model.maxTokens ?? nextModel.maxTokens,
            }
          : model,
      )
    : [...existingModels, nextModel];
  const { apiKey: existingApiKey, ...existingProviderRest } = existingProvider ?? {};
  const normalizedApiKey =
    normalizeOptionalProviderApiKey(params.apiKey) ??
    normalizeOptionalProviderApiKey(existingApiKey);

  const providerApi = isAzureOpenAi
    ? ("openai-responses" as const)
    : resolveProviderApi(params.compatibility);
  const azureHeaders = isAzure && normalizedApiKey ? { "api-key": normalizedApiKey } : undefined;

  let config: OpenClawConfig = {
    ...params.config,
    models: {
      ...params.config.models,
      mode: params.config.models?.mode ?? "merge",
      providers: {
        ...providers,
        [providerId]: {
          ...existingProviderRest,
          baseUrl: resolvedBaseUrl,
          api: providerApi,
          ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
          ...(isAzure ? { authHeader: false } : {}),
          ...(azureHeaders ? { headers: azureHeaders } : {}),
          models: mergedModels.length > 0 ? mergedModels : [nextModel],
        },
      },
    },
  };

  config = applyPrimaryModel(config, modelRef);
  if (isAzure && isLikelyReasoningModel) {
    const existingPerModelThinking = config.agents?.defaults?.models?.[modelRef]?.params?.thinking;
    if (!existingPerModelThinking) {
      config = {
        ...config,
        agents: {
          ...config.agents,
          defaults: {
            ...config.agents?.defaults,
            models: {
              ...config.agents?.defaults?.models,
              [modelRef]: {
                ...config.agents?.defaults?.models?.[modelRef],
                params: {
                  ...config.agents?.defaults?.models?.[modelRef]?.params,
                  thinking: "medium",
                },
              },
            },
          },
        },
      };
    }
  }
  if (alias) {
    config = {
      ...config,
      agents: {
        ...config.agents,
        defaults: {
          ...config.agents?.defaults,
          models: {
            ...config.agents?.defaults?.models,
            [modelRef]: {
              ...config.agents?.defaults?.models?.[modelRef],
              alias,
            },
          },
        },
      },
    };
  }

  return {
    config,
    providerId,
    modelId,
    ...(providerIdResult.providerIdRenamedFrom
      ? { providerIdRenamedFrom: providerIdResult.providerIdRenamedFrom }
      : {}),
  };
}

export async function promptCustomApiConfig(params: {
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  config: OpenClawConfig;
  secretInputMode?: SecretInputMode;
}): Promise<CustomApiResult> {
  const { prompter, runtime, config } = params;

  const baseInput = await promptBaseUrlAndKey({
    prompter,
    config,
    secretInputMode: params.secretInputMode,
  });
  let baseUrl = baseInput.baseUrl;
  let apiKey = baseInput.apiKey;
  let resolvedApiKey = baseInput.resolvedApiKey;

  const compatibilityChoice = await prompter.select({
    message: t("commands.custom.compatMsg"),
    options: COMPATIBILITY_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      hint: option.hint,
    })),
  });

  let modelId = await promptCustomApiModelId(prompter);

  let compatibility: CustomApiCompatibility | null =
    compatibilityChoice === "unknown" ? null : compatibilityChoice;

  while (true) {
    let verifiedFromProbe = false;
    if (!compatibility) {
      const probeSpinner = prompter.progress(t("commands.custom.detecting"));
      const openaiProbe = await requestOpenAiVerification({
        baseUrl,
        apiKey: resolvedApiKey,
        modelId,
      });
      if (openaiProbe.ok) {
        probeSpinner.stop(t("commands.custom.detectedOpenai"));
        compatibility = "openai";
        verifiedFromProbe = true;
      } else {
        const anthropicProbe = await requestAnthropicVerification({
          baseUrl,
          apiKey: resolvedApiKey,
          modelId,
        });
        if (anthropicProbe.ok) {
          probeSpinner.stop(t("commands.custom.detectedAnthropic"));
          compatibility = "anthropic";
          verifiedFromProbe = true;
        } else {
          probeSpinner.stop(t("commands.custom.detectFailed"));
          await prompter.note(
            t("commands.custom.detectFailedNote"),
            t("commands.custom.detectFailedTitle"),
          );
          const retryChoice = await promptCustomApiRetryChoice(prompter);
          ({ baseUrl, apiKey, resolvedApiKey, modelId } = await applyCustomApiRetryChoice({
            prompter,
            config,
            secretInputMode: params.secretInputMode,
            retryChoice,
            current: { baseUrl, apiKey, resolvedApiKey, modelId },
          }));
          continue;
        }
      }
    }

    if (verifiedFromProbe) {
      break;
    }

    const verifySpinner = prompter.progress(t("commands.custom.verifying"));
    const result =
      compatibility === "anthropic"
        ? await requestAnthropicVerification({ baseUrl, apiKey: resolvedApiKey, modelId })
        : await requestOpenAiVerification({ baseUrl, apiKey: resolvedApiKey, modelId });
    if (result.ok) {
      verifySpinner.stop(t("commands.custom.verifySuccess"));
      break;
    }
    if (result.status !== undefined) {
      verifySpinner.stop(t("commands.custom.verifyFailedStatus", { status: String(result.status) }));
    } else {
      verifySpinner.stop(t("commands.custom.verifyFailedError", { error: formatVerificationError(result.error) }));
    }
    const retryChoice = await promptCustomApiRetryChoice(prompter);
    ({ baseUrl, apiKey, resolvedApiKey, modelId } = await applyCustomApiRetryChoice({
      prompter,
      config,
      secretInputMode: params.secretInputMode,
      retryChoice,
      current: { baseUrl, apiKey, resolvedApiKey, modelId },
    }));
    if (compatibilityChoice === "unknown") {
      compatibility = null;
    }
  }

  const providers = config.models?.providers ?? {};
  const suggestedId = buildEndpointIdFromUrl(baseUrl);
  const providerIdInput = await prompter.text({
    message: t("commands.custom.endpointIdMsg"),
    initialValue: suggestedId,
    placeholder: "custom",
    validate: (value) => {
      const normalized = normalizeEndpointId(value);
      if (!normalized) {
        return t("commands.custom.endpointIdRequired");
      }
      return undefined;
    },
  });
  const aliasInput = await prompter.text({
    message: t("commands.custom.modelAliasMsg"),
    placeholder: t("commands.custom.modelAliasPlaceholder"),
    initialValue: "",
    validate: (value) => {
      const requestedId = normalizeEndpointId(providerIdInput) || "custom";
      const providerIdResult = resolveUniqueEndpointId({
        requestedId,
        baseUrl,
        providers,
      });
      const modelRef = modelKey(providerIdResult.providerId, modelId);
      return resolveAliasError({ raw: value, cfg: config, modelRef });
    },
  });
  const resolvedCompatibility = compatibility ?? "openai";
  const result = applyCustomApiConfig({
    config,
    baseUrl,
    modelId,
    compatibility: resolvedCompatibility,
    apiKey,
    providerId: providerIdInput,
    alias: aliasInput,
  });

  if (result.providerIdRenamedFrom && result.providerId) {
    await prompter.note(
      t("commands.custom.endpointRenamedNote", { from: result.providerIdRenamedFrom, to: result.providerId }),
      t("commands.custom.endpointRenamedTitle"),
    );
  }

  runtime.log(t("commands.custom.configuredLog", { provider: result.providerId, model: result.modelId }));
  return result;
}
