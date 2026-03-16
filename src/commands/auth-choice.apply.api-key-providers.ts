import { ensureAuthProfileStore, resolveAuthProfileOrder } from "../agents/auth-profiles.js";
import type { SecretInput } from "../config/types.secrets.js";
import { normalizeApiKeyInput, validateApiKeyInput } from "./auth-choice.api-key.js";
import { ensureApiKeyFromOptionEnvOrPrompt } from "./auth-choice.apply-helpers.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import type { ApiKeyStorageOptions } from "./onboard-auth.credentials.js";
import {
  applyAuthProfileConfig,
  applyKilocodeConfig,
  applyKilocodeProviderConfig,
  applyKimiCodeConfig,
  applyKimiCodeProviderConfig,
  applyLitellmConfig,
  applyLitellmProviderConfig,
  applyMistralConfig,
  applyMistralProviderConfig,
  applyModelStudioConfig,
  applyModelStudioConfigCn,
  applyModelStudioProviderConfig,
  applyModelStudioProviderConfigCn,
  applyMoonshotConfig,
  applyMoonshotConfigCn,
  applyMoonshotProviderConfig,
  applyMoonshotProviderConfigCn,
  applyOpencodeGoConfig,
  applyOpencodeGoProviderConfig,
  applyOpencodeZenConfig,
  applyOpencodeZenProviderConfig,
  applyQianfanConfig,
  applyQianfanProviderConfig,
  applySyntheticConfig,
  applySyntheticProviderConfig,
  applyTogetherConfig,
  applyTogetherProviderConfig,
  applyVeniceConfig,
  applyVeniceProviderConfig,
  applyVercelAiGatewayConfig,
  applyVercelAiGatewayProviderConfig,
  applyXiaomiConfig,
  applyXiaomiProviderConfig,
  KILOCODE_DEFAULT_MODEL_REF,
  KIMI_CODING_MODEL_REF,
  LITELLM_DEFAULT_MODEL_REF,
  MISTRAL_DEFAULT_MODEL_REF,
  MODELSTUDIO_DEFAULT_MODEL_REF,
  MOONSHOT_DEFAULT_MODEL_REF,
  QIANFAN_DEFAULT_MODEL_REF,
  setKilocodeApiKey,
  setKimiCodingApiKey,
  setLitellmApiKey,
  setMistralApiKey,
  setModelStudioApiKey,
  setMoonshotApiKey,
  setOpencodeGoApiKey,
  setOpencodeZenApiKey,
  setQianfanApiKey,
  setSyntheticApiKey,
  setTogetherApiKey,
  setVeniceApiKey,
  setVercelAiGatewayApiKey,
  setXiaomiApiKey,
  SYNTHETIC_DEFAULT_MODEL_REF,
  TOGETHER_DEFAULT_MODEL_REF,
  VENICE_DEFAULT_MODEL_REF,
  VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF,
  XIAOMI_DEFAULT_MODEL_REF,
} from "./onboard-auth.js";
import type { AuthChoice, SecretInputMode } from "./onboard-types.js";
import { OPENCODE_GO_DEFAULT_MODEL_REF } from "./opencode-go-model-default.js";
import { OPENCODE_ZEN_DEFAULT_MODEL } from "./opencode-zen-model-default.js";

type ApiKeyProviderConfigApplier = (
  config: ApplyAuthChoiceParams["config"],
) => ApplyAuthChoiceParams["config"];

type ApplyProviderDefaultModel = (args: {
  defaultModel: string;
  applyDefaultConfig: ApiKeyProviderConfigApplier;
  applyProviderConfig: ApiKeyProviderConfigApplier;
  noteDefault?: string;
}) => Promise<void>;

type ApplyApiKeyProviderParams = {
  params: ApplyAuthChoiceParams;
  authChoice: AuthChoice;
  config: ApplyAuthChoiceParams["config"];
  setConfig: (config: ApplyAuthChoiceParams["config"]) => void;
  getConfig: () => ApplyAuthChoiceParams["config"];
  normalizedTokenProvider?: string;
  requestedSecretInputMode?: SecretInputMode;
  applyProviderDefaultModel: ApplyProviderDefaultModel;
  getAgentModelOverride: () => string | undefined;
};

type SimpleApiKeyProviderFlow = {
  provider: Parameters<typeof ensureApiKeyFromOptionEnvOrPrompt>[0]["provider"];
  profileId: string;
  expectedProviders: string[];
  envLabel: string;
  promptMessage: string;
  setCredential: (
    apiKey: SecretInput,
    agentDir?: string,
    options?: ApiKeyStorageOptions,
  ) => void | Promise<void>;
  defaultModel: string;
  applyDefaultConfig: ApiKeyProviderConfigApplier;
  applyProviderConfig: ApiKeyProviderConfigApplier;
  tokenProvider?: string;
  normalize?: (value: string) => string;
  validate?: (value: string) => string | undefined;
  noteDefault?: string;
  noteMessage?: string;
  noteTitle?: string;
};

const SIMPLE_API_KEY_PROVIDER_FLOWS: Partial<Record<AuthChoice, SimpleApiKeyProviderFlow>> = {
  "ai-gateway-api-key": {
    provider: "vercel-ai-gateway",
    profileId: "vercel-ai-gateway:default",
    expectedProviders: ["vercel-ai-gateway"],
    envLabel: "AI_GATEWAY_API_KEY",
    promptMessage: "输入 Vercel AI Gateway API 密钥",
    setCredential: setVercelAiGatewayApiKey,
    defaultModel: VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF,
    applyDefaultConfig: applyVercelAiGatewayConfig,
    applyProviderConfig: applyVercelAiGatewayProviderConfig,
    noteDefault: VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF,
  },
  "moonshot-api-key": {
    provider: "moonshot",
    profileId: "moonshot:default",
    expectedProviders: ["moonshot"],
    envLabel: "MOONSHOT_API_KEY",
    promptMessage: "输入 Moonshot API 密钥",
    setCredential: setMoonshotApiKey,
    defaultModel: MOONSHOT_DEFAULT_MODEL_REF,
    applyDefaultConfig: applyMoonshotConfig,
    applyProviderConfig: applyMoonshotProviderConfig,
  },
  "moonshot-api-key-cn": {
    provider: "moonshot",
    profileId: "moonshot:default",
    expectedProviders: ["moonshot"],
    envLabel: "MOONSHOT_API_KEY",
    promptMessage: "输入 Moonshot API 密钥（.cn）",
    setCredential: setMoonshotApiKey,
    defaultModel: MOONSHOT_DEFAULT_MODEL_REF,
    applyDefaultConfig: applyMoonshotConfigCn,
    applyProviderConfig: applyMoonshotProviderConfigCn,
  },
  "kimi-code-api-key": {
    provider: "kimi-coding",
    profileId: "kimi-coding:default",
    expectedProviders: ["kimi-code", "kimi-coding"],
    envLabel: "KIMI_API_KEY",
    promptMessage: "输入 Kimi Coding API 密钥",
    setCredential: setKimiCodingApiKey,
    defaultModel: KIMI_CODING_MODEL_REF,
    applyDefaultConfig: applyKimiCodeConfig,
    applyProviderConfig: applyKimiCodeProviderConfig,
    noteDefault: KIMI_CODING_MODEL_REF,
    noteMessage: [
      "Kimi Coding 使用专用端点和 API 密钥。",
      "在此获取你的 API 密钥：https://www.kimi.com/code/en",
    ].join("\n"),
    noteTitle: "Kimi Coding",
  },
  "xiaomi-api-key": {
    provider: "xiaomi",
    profileId: "xiaomi:default",
    expectedProviders: ["xiaomi"],
    envLabel: "XIAOMI_API_KEY",
    promptMessage: "输入小米 API 密钥",
    setCredential: setXiaomiApiKey,
    defaultModel: XIAOMI_DEFAULT_MODEL_REF,
    applyDefaultConfig: applyXiaomiConfig,
    applyProviderConfig: applyXiaomiProviderConfig,
    noteDefault: XIAOMI_DEFAULT_MODEL_REF,
  },
  "mistral-api-key": {
    provider: "mistral",
    profileId: "mistral:default",
    expectedProviders: ["mistral"],
    envLabel: "MISTRAL_API_KEY",
    promptMessage: "输入 Mistral API 密钥",
    setCredential: setMistralApiKey,
    defaultModel: MISTRAL_DEFAULT_MODEL_REF,
    applyDefaultConfig: applyMistralConfig,
    applyProviderConfig: applyMistralProviderConfig,
    noteDefault: MISTRAL_DEFAULT_MODEL_REF,
  },
  "venice-api-key": {
    provider: "venice",
    profileId: "venice:default",
    expectedProviders: ["venice"],
    envLabel: "VENICE_API_KEY",
    promptMessage: "输入 Venice AI API 密钥",
    setCredential: setVeniceApiKey,
    defaultModel: VENICE_DEFAULT_MODEL_REF,
    applyDefaultConfig: applyVeniceConfig,
    applyProviderConfig: applyVeniceProviderConfig,
    noteDefault: VENICE_DEFAULT_MODEL_REF,
    noteMessage: [
      "Venice AI 提供注重隐私的推理服务，支持无审查模型。",
      "在此获取你的 API 密钥：https://venice.ai/settings/api",
      "支持 'private'（完全私密）和 'anonymized'（代理）模式。",
    ].join("\n"),
    noteTitle: "Venice AI",
  },
  "opencode-zen": {
    provider: "opencode",
    profileId: "opencode:default",
    expectedProviders: ["opencode", "opencode-go"],
    envLabel: "OPENCODE_API_KEY",
    promptMessage: "输入 OpenCode API 密钥",
    setCredential: setOpencodeZenApiKey,
    defaultModel: OPENCODE_ZEN_DEFAULT_MODEL,
    applyDefaultConfig: applyOpencodeZenConfig,
    applyProviderConfig: applyOpencodeZenProviderConfig,
    noteDefault: OPENCODE_ZEN_DEFAULT_MODEL,
    noteMessage: [
      "OpenCode 在 Zen 和 Go 目录中使用同一个 API 密钥。",
      "Zen 提供对 Claude、GPT、Gemini 等更多模型的访问。",
      "在此获取你的 API 密钥：https://opencode.ai/auth",
      "选择 Zen 目录当你需要精选的多模型代理时。",
    ].join("\n"),
    noteTitle: "OpenCode",
  },
  "opencode-go": {
    provider: "opencode-go",
    profileId: "opencode-go:default",
    expectedProviders: ["opencode", "opencode-go"],
    envLabel: "OPENCODE_API_KEY",
    promptMessage: "输入 OpenCode API 密钥",
    setCredential: setOpencodeGoApiKey,
    defaultModel: OPENCODE_GO_DEFAULT_MODEL_REF,
    applyDefaultConfig: applyOpencodeGoConfig,
    applyProviderConfig: applyOpencodeGoProviderConfig,
    noteDefault: OPENCODE_GO_DEFAULT_MODEL_REF,
    noteMessage: [
      "OpenCode 在 Zen 和 Go 目录中使用同一个 API 密钥。",
      "Go 通过 Go 目录提供对 Kimi、GLM 和 MiniMax 模型的访问。",
      "在此获取你的 API 密钥：https://opencode.ai/auth",
      "选择 Go 目录当你需要 OpenCode 托管的 Kimi/GLM/MiniMax 模型系列时。",
    ].join("\n"),
    noteTitle: "OpenCode",
  },
  "together-api-key": {
    provider: "together",
    profileId: "together:default",
    expectedProviders: ["together"],
    envLabel: "TOGETHER_API_KEY",
    promptMessage: "输入 Together AI API 密钥",
    setCredential: setTogetherApiKey,
    defaultModel: TOGETHER_DEFAULT_MODEL_REF,
    applyDefaultConfig: applyTogetherConfig,
    applyProviderConfig: applyTogetherProviderConfig,
    noteDefault: TOGETHER_DEFAULT_MODEL_REF,
    noteMessage: [
      "Together AI 提供对领先开源模型的访问，包括 Llama、DeepSeek、Qwen 等。",
      "在此获取你的 API 密钥：https://api.together.xyz/settings/api-keys",
    ].join("\n"),
    noteTitle: "Together AI",
  },
  "qianfan-api-key": {
    provider: "qianfan",
    profileId: "qianfan:default",
    expectedProviders: ["qianfan"],
    envLabel: "QIANFAN_API_KEY",
    promptMessage: "输入千帆 API 密钥",
    setCredential: setQianfanApiKey,
    defaultModel: QIANFAN_DEFAULT_MODEL_REF,
    applyDefaultConfig: applyQianfanConfig,
    applyProviderConfig: applyQianfanProviderConfig,
    noteDefault: QIANFAN_DEFAULT_MODEL_REF,
    noteMessage: [
      "在此获取你的 API 密钥：https://console.bce.baidu.com/qianfan/ais/console/apiKey",
      "API 密钥格式：bce-v3/ALTAK-...",
    ].join("\n"),
    noteTitle: "千帆",
  },
  "kilocode-api-key": {
    provider: "kilocode",
    profileId: "kilocode:default",
    expectedProviders: ["kilocode"],
    envLabel: "KILOCODE_API_KEY",
    promptMessage: "输入 Kilo Gateway API 密钥",
    setCredential: setKilocodeApiKey,
    defaultModel: KILOCODE_DEFAULT_MODEL_REF,
    applyDefaultConfig: applyKilocodeConfig,
    applyProviderConfig: applyKilocodeProviderConfig,
    noteDefault: KILOCODE_DEFAULT_MODEL_REF,
  },
  "modelstudio-api-key-cn": {
    provider: "modelstudio",
    profileId: "modelstudio:default",
    expectedProviders: ["modelstudio"],
    envLabel: "MODELSTUDIO_API_KEY",
    promptMessage: "输入阿里云百炼编码计划 API 密钥（中国）",
    setCredential: setModelStudioApiKey,
    defaultModel: MODELSTUDIO_DEFAULT_MODEL_REF,
    applyDefaultConfig: applyModelStudioConfigCn,
    applyProviderConfig: applyModelStudioProviderConfigCn,
    noteDefault: MODELSTUDIO_DEFAULT_MODEL_REF,
    noteMessage: [
      "在此获取你的 API 密钥：https://bailian.console.aliyun.com/",
      "端点：coding.dashscope.aliyuncs.com",
      "模型：qwen3.5-plus、glm-4.7、kimi-k2.5、MiniMax-M2.5 等",
    ].join("\n"),
    noteTitle: "阿里云百炼编码计划（中国）",
    normalize: (value) => String(value ?? "").trim(),
    validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
  },
  "modelstudio-api-key": {
    provider: "modelstudio",
    profileId: "modelstudio:default",
    expectedProviders: ["modelstudio"],
    envLabel: "MODELSTUDIO_API_KEY",
    promptMessage: "输入阿里云百炼编码计划 API 密钥（国际）",
    setCredential: setModelStudioApiKey,
    defaultModel: MODELSTUDIO_DEFAULT_MODEL_REF,
    applyDefaultConfig: applyModelStudioConfig,
    applyProviderConfig: applyModelStudioProviderConfig,
    noteDefault: MODELSTUDIO_DEFAULT_MODEL_REF,
    noteMessage: [
      "在此获取你的 API 密钥：https://bailian.console.aliyun.com/",
      "端点：coding-intl.dashscope.aliyuncs.com",
      "模型：qwen3.5-plus、glm-4.7、kimi-k2.5、MiniMax-M2.5 等",
    ].join("\n"),
    noteTitle: "阿里云百炼编码计划（国际）",
    normalize: (value) => String(value ?? "").trim(),
    validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
  },
  "synthetic-api-key": {
    provider: "synthetic",
    profileId: "synthetic:default",
    expectedProviders: ["synthetic"],
    envLabel: "SYNTHETIC_API_KEY",
    promptMessage: "输入 Synthetic API 密钥",
    setCredential: setSyntheticApiKey,
    defaultModel: SYNTHETIC_DEFAULT_MODEL_REF,
    applyDefaultConfig: applySyntheticConfig,
    applyProviderConfig: applySyntheticProviderConfig,
    normalize: (value) => String(value ?? "").trim(),
    validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
  },
};

async function applyApiKeyProviderWithDefaultModel({
  params,
  config,
  setConfig,
  getConfig,
  normalizedTokenProvider,
  requestedSecretInputMode,
  applyProviderDefaultModel,
  getAgentModelOverride,
  provider,
  profileId,
  expectedProviders,
  envLabel,
  promptMessage,
  setCredential,
  defaultModel,
  applyDefaultConfig,
  applyProviderConfig,
  noteMessage,
  noteTitle,
  tokenProvider = normalizedTokenProvider,
  normalize = normalizeApiKeyInput,
  validate = validateApiKeyInput,
  noteDefault = defaultModel,
}: ApplyApiKeyProviderParams & {
  provider: Parameters<typeof ensureApiKeyFromOptionEnvOrPrompt>[0]["provider"];
  profileId: string;
  expectedProviders: string[];
  envLabel: string;
  promptMessage: string;
  setCredential: (apiKey: SecretInput, mode?: SecretInputMode) => void | Promise<void>;
  defaultModel: string;
  applyDefaultConfig: ApiKeyProviderConfigApplier;
  applyProviderConfig: ApiKeyProviderConfigApplier;
  noteMessage?: string;
  noteTitle?: string;
  tokenProvider?: string;
  normalize?: (value: string) => string;
  validate?: (value: string) => string | undefined;
  noteDefault?: string;
}): Promise<ApplyAuthChoiceResult> {
  let nextConfig = config;

  await ensureApiKeyFromOptionEnvOrPrompt({
    token: params.opts?.token,
    provider,
    tokenProvider,
    secretInputMode: requestedSecretInputMode,
    config: nextConfig,
    expectedProviders,
    envLabel,
    promptMessage,
    setCredential: async (apiKey, mode) => {
      await setCredential(apiKey, mode);
    },
    noteMessage,
    noteTitle,
    normalize,
    validate,
    prompter: params.prompter,
  });

  nextConfig = applyAuthProfileConfig(nextConfig, {
    profileId,
    provider,
    mode: "api_key",
  });
  setConfig(nextConfig);
  await applyProviderDefaultModel({
    defaultModel,
    applyDefaultConfig,
    applyProviderConfig,
    noteDefault,
  });

  return { config: getConfig(), agentModelOverride: getAgentModelOverride() };
}

export async function applyLiteLlmApiKeyProvider({
  params,
  authChoice,
  config,
  setConfig,
  getConfig,
  normalizedTokenProvider,
  requestedSecretInputMode,
  applyProviderDefaultModel,
  getAgentModelOverride,
}: ApplyApiKeyProviderParams): Promise<ApplyAuthChoiceResult | null> {
  if (authChoice !== "litellm-api-key") {
    return null;
  }

  let nextConfig = config;
  const store = ensureAuthProfileStore(params.agentDir, { allowKeychainPrompt: false });
  const profileOrder = resolveAuthProfileOrder({ cfg: nextConfig, store, provider: "litellm" });
  const existingProfileId = profileOrder.find((profileId) => Boolean(store.profiles[profileId]));
  const existingCred = existingProfileId ? store.profiles[existingProfileId] : undefined;
  let profileId = "litellm:default";
  let hasCredential = Boolean(existingProfileId && existingCred?.type === "api_key");
  if (hasCredential && existingProfileId) {
    profileId = existingProfileId;
  }

  if (!hasCredential) {
    await ensureApiKeyFromOptionEnvOrPrompt({
      token: params.opts?.token,
      tokenProvider: normalizedTokenProvider,
      secretInputMode: requestedSecretInputMode,
      config: nextConfig,
      expectedProviders: ["litellm"],
      provider: "litellm",
      envLabel: "LITELLM_API_KEY",
      promptMessage: "输入 LiteLLM API 密钥",
      normalize: normalizeApiKeyInput,
      validate: validateApiKeyInput,
      prompter: params.prompter,
      setCredential: async (apiKey, mode) =>
        setLitellmApiKey(apiKey, params.agentDir, { secretInputMode: mode }),
      noteMessage:
        "LiteLLM 提供统一的 API 接口，支持 100+ LLM 提供商。\n从你的 LiteLLM 代理或 https://litellm.ai 获取 API 密钥\n默认代理运行在 http://localhost:4000",
      noteTitle: "LiteLLM",
    });
    hasCredential = true;
  }

  if (hasCredential) {
    nextConfig = applyAuthProfileConfig(nextConfig, {
      profileId,
      provider: "litellm",
      mode: "api_key",
    });
  }
  setConfig(nextConfig);
  await applyProviderDefaultModel({
    defaultModel: LITELLM_DEFAULT_MODEL_REF,
    applyDefaultConfig: applyLitellmConfig,
    applyProviderConfig: applyLitellmProviderConfig,
    noteDefault: LITELLM_DEFAULT_MODEL_REF,
  });
  return { config: getConfig(), agentModelOverride: getAgentModelOverride() };
}

export async function applySimpleAuthChoiceApiProvider({
  params,
  authChoice,
  config,
  setConfig,
  getConfig,
  normalizedTokenProvider,
  requestedSecretInputMode,
  applyProviderDefaultModel,
  getAgentModelOverride,
}: ApplyApiKeyProviderParams): Promise<ApplyAuthChoiceResult | null> {
  const simpleApiKeyProviderFlow = SIMPLE_API_KEY_PROVIDER_FLOWS[authChoice];
  if (!simpleApiKeyProviderFlow) {
    return null;
  }

  return await applyApiKeyProviderWithDefaultModel({
    params,
    authChoice,
    config,
    setConfig,
    getConfig,
    normalizedTokenProvider,
    requestedSecretInputMode,
    applyProviderDefaultModel,
    getAgentModelOverride,
    provider: simpleApiKeyProviderFlow.provider,
    profileId: simpleApiKeyProviderFlow.profileId,
    expectedProviders: simpleApiKeyProviderFlow.expectedProviders,
    envLabel: simpleApiKeyProviderFlow.envLabel,
    promptMessage: simpleApiKeyProviderFlow.promptMessage,
    setCredential: async (apiKey, mode) =>
      simpleApiKeyProviderFlow.setCredential(apiKey, params.agentDir, {
        secretInputMode: mode ?? requestedSecretInputMode,
      }),
    defaultModel: simpleApiKeyProviderFlow.defaultModel,
    applyDefaultConfig: simpleApiKeyProviderFlow.applyDefaultConfig,
    applyProviderConfig: simpleApiKeyProviderFlow.applyProviderConfig,
    noteDefault: simpleApiKeyProviderFlow.noteDefault,
    noteMessage: simpleApiKeyProviderFlow.noteMessage,
    noteTitle: simpleApiKeyProviderFlow.noteTitle,
    tokenProvider: simpleApiKeyProviderFlow.tokenProvider,
    normalize: simpleApiKeyProviderFlow.normalize,
    validate: simpleApiKeyProviderFlow.validate,
  });
}
