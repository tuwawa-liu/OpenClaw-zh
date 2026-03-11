import type { AuthProfileStore } from "../agents/auth-profiles.js";
import { t } from "../i18n/index.js";
import { AUTH_CHOICE_LEGACY_ALIASES_FOR_CLI } from "./auth-choice-legacy.js";
import { ONBOARD_PROVIDER_AUTH_FLAGS } from "./onboard-provider-auth-flags.js";
import type { AuthChoice, AuthChoiceGroupId } from "./onboard-types.js";

export type { AuthChoiceGroupId };

export type AuthChoiceOption = {
  value: AuthChoice;
  label: string;
  hint?: string;
};
export type AuthChoiceGroup = {
  value: AuthChoiceGroupId;
  label: string;
  hint?: string;
  options: AuthChoiceOption[];
};

function getAuthChoiceGroupDefs(): {
  value: AuthChoiceGroupId;
  label: string;
  hint?: string;
  choices: AuthChoice[];
}[] {
  return [
    {
      value: "openai",
      label: "OpenAI",
      hint: t("authChoiceOptions.groupHintOpenai"),
      choices: ["openai-codex", "openai-api-key"],
    },
    {
      value: "anthropic",
      label: "Anthropic",
      hint: t("authChoiceOptions.groupHintAnthropic"),
      choices: ["token", "apiKey"],
    },
    {
      value: "chutes",
      label: "Chutes",
      hint: t("authChoiceOptions.groupHintOauth"),
      choices: ["chutes"],
    },
    {
      value: "vllm",
      label: "vLLM",
      hint: t("authChoiceOptions.groupHintVllm"),
      choices: ["vllm"],
    },
    {
      value: "minimax",
      label: "MiniMax",
      hint: t("authChoiceOptions.groupHintMinimax"),
      choices: ["minimax-portal", "minimax-api", "minimax-api-key-cn", "minimax-api-lightning"],
    },
    {
      value: "moonshot",
      label: "Moonshot AI (Kimi K2.5)",
      hint: t("authChoiceOptions.groupHintMoonshot"),
      choices: ["moonshot-api-key", "moonshot-api-key-cn", "kimi-code-api-key"],
    },
    {
      value: "google",
      label: "Google",
      hint: t("authChoiceOptions.groupHintGoogle"),
      choices: ["gemini-api-key", "google-gemini-cli"],
    },
    {
      value: "xai",
      label: "xAI (Grok)",
      hint: t("authChoiceOptions.groupHintApiKey"),
      choices: ["xai-api-key"],
    },
    {
      value: "mistral",
      label: "Mistral AI",
      hint: t("authChoiceOptions.groupHintApiKey"),
      choices: ["mistral-api-key"],
    },
    {
      value: "volcengine",
      label: "Volcano Engine",
      hint: t("authChoiceOptions.groupHintVolcengine"),
      choices: ["volcengine-api-key"],
    },
    {
      value: "byteplus",
      label: "BytePlus",
      hint: t("authChoiceOptions.groupHintByteplus"),
      choices: ["byteplus-api-key"],
    },
    {
      value: "openrouter",
      label: "OpenRouter",
      hint: t("authChoiceOptions.groupHintOpenrouter"),
      choices: ["openrouter-api-key"],
    },
    {
      value: "kilocode",
      label: "Kilo Gateway",
      hint: t("authChoiceOptions.groupHintKilocode"),
      choices: ["kilocode-api-key"],
    },
    {
      value: "qwen",
      label: "Qwen",
      hint: t("authChoiceOptions.groupHintQwen"),
      choices: ["qwen-portal"],
    },
    {
      value: "zai",
      label: "Z.AI",
      hint: t("authChoiceOptions.groupHintZai"),
      choices: ["zai-coding-global", "zai-coding-cn", "zai-global", "zai-cn"],
    },
    {
      value: "qianfan",
      label: "Qianfan",
      hint: t("authChoiceOptions.groupHintQianfan"),
      choices: ["qianfan-api-key"],
    },
    {
      value: "modelstudio",
      label: "Alibaba Cloud Model Studio",
      hint: t("authChoiceOptions.groupHintModelstudio"),
      choices: ["modelstudio-api-key-cn", "modelstudio-api-key"],
    },
    {
      value: "copilot",
      label: "Copilot",
      hint: t("authChoiceOptions.groupHintCopilot"),
      choices: ["github-copilot", "copilot-proxy"],
    },
    {
      value: "ai-gateway",
      label: "Vercel AI Gateway",
      hint: t("authChoiceOptions.groupHintAiGateway"),
      choices: ["ai-gateway-api-key"],
    },
    {
      value: "opencode-zen",
      label: "OpenCode Zen",
      hint: t("authChoiceOptions.groupHintOpenCodeZen"),
      choices: ["opencode-zen"],
    },
    {
      value: "xiaomi",
      label: "Xiaomi",
      hint: t("authChoiceOptions.groupHintXiaomi"),
      choices: ["xiaomi-api-key"],
    },
    {
      value: "synthetic",
      label: "Synthetic",
      hint: t("authChoiceOptions.groupHintSynthetic"),
      choices: ["synthetic-api-key"],
    },
    {
      value: "together",
      label: "Together AI",
      hint: t("authChoiceOptions.groupHintTogether"),
      choices: ["together-api-key"],
    },
    {
      value: "huggingface",
      label: "Hugging Face",
      hint: t("authChoiceOptions.groupHintHuggingface"),
      choices: ["huggingface-api-key"],
    },
    {
      value: "venice",
      label: "Venice AI",
      hint: t("authChoiceOptions.groupHintVenice"),
      choices: ["venice-api-key"],
    },
    {
      value: "litellm",
      label: "LiteLLM",
      hint: t("authChoiceOptions.groupHintLitellm"),
      choices: ["litellm-api-key"],
    },
    {
      value: "cloudflare-ai-gateway",
      label: "Cloudflare AI Gateway",
      hint: t("authChoiceOptions.groupHintCloudflareAiGateway"),
      choices: ["cloudflare-ai-gateway-api-key"],
    },
    {
      value: "custom",
      label: "自定义提供商",
      hint: t("authChoiceOptions.groupHintCustom"),
      choices: ["custom-api-key"],
    },
  ];
}

function getProviderAuthChoiceOptionHints(): Partial<Record<AuthChoice, string>> {
  return {
    "litellm-api-key": t("authChoiceOptions.providerHintLitellm"),
    "cloudflare-ai-gateway-api-key": t("authChoiceOptions.providerHintCloudflare"),
    "venice-api-key": t("authChoiceOptions.providerHintVenice"),
    "together-api-key": t("authChoiceOptions.providerHintTogether"),
    "huggingface-api-key": t("authChoiceOptions.providerHintHuggingface"),
  };
}

function getProviderAuthChoiceOptionLabels(): Partial<Record<AuthChoice, string>> {
  return {
    "moonshot-api-key": t("authChoiceOptions.labelMoonshotApi"),
    "moonshot-api-key-cn": t("authChoiceOptions.labelMoonshotApiCn"),
    "kimi-code-api-key": t("authChoiceOptions.labelKimiCode"),
    "cloudflare-ai-gateway-api-key": t("authChoiceOptions.labelCloudflare"),
  };
}

function buildProviderAuthChoiceOptions(): AuthChoiceOption[] {
  const hints = getProviderAuthChoiceOptionHints();
  const labels = getProviderAuthChoiceOptionLabels();
  return ONBOARD_PROVIDER_AUTH_FLAGS.map((flag) => ({
    value: flag.authChoice,
    label: labels[flag.authChoice] ?? flag.description,
    ...(hints[flag.authChoice] ? { hint: hints[flag.authChoice] } : {}),
  }));
}

function getBaseAuthChoiceOptions(): ReadonlyArray<AuthChoiceOption> {
  return [
    {
      value: "token",
      label: t("authChoiceOptions.labelToken"),
      hint: t("authChoiceOptions.hintToken"),
    },
    {
      value: "openai-codex",
      label: t("authChoiceOptions.labelOpenaiCodex"),
    },
    { value: "chutes", label: t("authChoiceOptions.labelChutes") },
    {
      value: "vllm",
      label: t("authChoiceOptions.labelVllm"),
      hint: t("authChoiceOptions.hintVllm"),
    },
    ...buildProviderAuthChoiceOptions(),
    {
      value: "moonshot-api-key-cn",
      label: t("authChoiceOptions.labelMoonshotApiCnBase"),
    },
    {
      value: "github-copilot",
      label: t("authChoiceOptions.labelGithubCopilot"),
      hint: t("authChoiceOptions.hintGithubCopilot"),
    },
    { value: "gemini-api-key", label: t("authChoiceOptions.labelGeminiApiKey") },
    {
      value: "google-gemini-cli",
      label: t("authChoiceOptions.labelGoogleGeminiCli"),
      hint: t("authChoiceOptions.hintGoogleGeminiCli"),
    },
    { value: "zai-api-key", label: t("authChoiceOptions.labelZaiApiKey") },
    {
      value: "zai-coding-global",
      label: t("authChoiceOptions.labelZaiCodingGlobal"),
      hint: t("authChoiceOptions.hintZaiCodingGlobal"),
    },
    {
      value: "zai-coding-cn",
      label: t("authChoiceOptions.labelZaiCodingCn"),
      hint: t("authChoiceOptions.hintZaiCodingCn"),
    },
    {
      value: "zai-global",
      label: t("authChoiceOptions.labelZaiGlobal"),
      hint: t("authChoiceOptions.hintZaiGlobal"),
    },
    {
      value: "zai-cn",
      label: t("authChoiceOptions.labelZaiCn"),
      hint: t("authChoiceOptions.hintZaiCn"),
    },
    {
      value: "xiaomi-api-key",
      label: t("authChoiceOptions.labelXiaomiApiKey"),
    },
    {
      value: "minimax-portal",
      label: t("authChoiceOptions.labelMinimaxPortal"),
      hint: t("authChoiceOptions.hintMinimaxPortal"),
    },
    { value: "qwen-portal", label: t("authChoiceOptions.labelQwenPortal") },
    {
      value: "copilot-proxy",
      label: t("authChoiceOptions.labelCopilotProxy"),
      hint: t("authChoiceOptions.hintCopilotProxy"),
    },
    { value: "apiKey", label: t("authChoiceOptions.labelApiKey") },
    {
      value: "opencode-zen",
      label: t("authChoiceOptions.labelOpenCodeZen"),
      hint: t("authChoiceOptions.hintOpenCodeZen"),
    },
    { value: "minimax-api", label: t("authChoiceOptions.labelMinimaxApi") },
    {
      value: "minimax-api-key-cn",
      label: t("authChoiceOptions.labelMinimaxApiKeyCn"),
      hint: t("authChoiceOptions.hintMinimaxApiKeyCn"),
    },
    {
      value: "minimax-api-lightning",
      label: t("authChoiceOptions.labelMinimaxApiLightning"),
      hint: t("authChoiceOptions.hintMinimaxApiLightning"),
    },
    { value: "qianfan-api-key", label: t("authChoiceOptions.labelQianfanApiKey") },
    {
      value: "modelstudio-api-key-cn",
      label: t("authChoiceOptions.labelModelstudioApiKeyCn"),
      hint: t("authChoiceOptions.hintModelstudioApiKeyCn"),
    },
    {
      value: "modelstudio-api-key",
      label: t("authChoiceOptions.labelModelstudioApiKey"),
      hint: t("authChoiceOptions.hintModelstudioApiKey"),
    },
    { value: "custom-api-key", label: t("authChoiceOptions.labelCustomApiKey") },
  ];
}

export function formatAuthChoiceChoicesForCli(params?: {
  includeSkip?: boolean;
  includeLegacyAliases?: boolean;
}): string {
  const includeSkip = params?.includeSkip ?? true;
  const includeLegacyAliases = params?.includeLegacyAliases ?? false;
  const values = getBaseAuthChoiceOptions().map((opt) => opt.value);

  if (includeSkip) {
    values.push("skip");
  }
  if (includeLegacyAliases) {
    values.push(...AUTH_CHOICE_LEGACY_ALIASES_FOR_CLI);
  }

  return values.join("|");
}

export function buildAuthChoiceOptions(params: {
  store: AuthProfileStore;
  includeSkip: boolean;
}): AuthChoiceOption[] {
  void params.store;
  const options: AuthChoiceOption[] = [...getBaseAuthChoiceOptions()];

  if (params.includeSkip) {
    options.push({ value: "skip", label: t("commands.authOptions.skipForNow") });
  }

  return options;
}

export function buildAuthChoiceGroups(params: { store: AuthProfileStore; includeSkip: boolean }): {
  groups: AuthChoiceGroup[];
  skipOption?: AuthChoiceOption;
} {
  const options = buildAuthChoiceOptions({
    ...params,
    includeSkip: false,
  });
  const optionByValue = new Map<AuthChoice, AuthChoiceOption>(
    options.map((opt) => [opt.value, opt]),
  );

  const groups = getAuthChoiceGroupDefs().map((group) => ({
    ...group,
    options: group.choices
      .map((choice) => optionByValue.get(choice))
      .filter((opt): opt is AuthChoiceOption => Boolean(opt)),
  }));

  const skipOption = params.includeSkip
    ? ({ value: "skip", label: t("commands.authOptions.skipForNow") } satisfies AuthChoiceOption)
    : undefined;

  return { groups, skipOption };
}
