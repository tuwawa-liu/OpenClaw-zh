import type { AuthChoice, OnboardOptions } from "./onboard-types.js";

type OnboardProviderAuthOptionKey = keyof Pick<
  OnboardOptions,
  | "anthropicApiKey"
  | "openaiApiKey"
  | "mistralApiKey"
  | "openrouterApiKey"
  | "kilocodeApiKey"
  | "aiGatewayApiKey"
  | "cloudflareAiGatewayApiKey"
  | "moonshotApiKey"
  | "kimiCodeApiKey"
  | "geminiApiKey"
  | "zaiApiKey"
  | "xiaomiApiKey"
  | "minimaxApiKey"
  | "syntheticApiKey"
  | "veniceApiKey"
  | "togetherApiKey"
  | "huggingfaceApiKey"
  | "opencodeZenApiKey"
  | "opencodeGoApiKey"
  | "xaiApiKey"
  | "litellmApiKey"
  | "qianfanApiKey"
  | "modelstudioApiKeyCn"
  | "modelstudioApiKey"
  | "volcengineApiKey"
  | "byteplusApiKey"
>;

export type OnboardProviderAuthFlag = {
  optionKey: OnboardProviderAuthOptionKey;
  authChoice: AuthChoice;
  cliFlag: `--${string}`;
  cliOption: `--${string} <key>`;
  description: string;
};

// Shared source for provider API-key flags used by CLI registration + non-interactive inference.
export const ONBOARD_PROVIDER_AUTH_FLAGS: ReadonlyArray<OnboardProviderAuthFlag> = [
  {
    optionKey: "anthropicApiKey",
    authChoice: "apiKey",
    cliFlag: "--anthropic-api-key",
    cliOption: "--anthropic-api-key <key>",
    description: "Anthropic API 密钥",
  },
  {
    optionKey: "openaiApiKey",
    authChoice: "openai-api-key",
    cliFlag: "--openai-api-key",
    cliOption: "--openai-api-key <key>",
    description: "OpenAI API 密钥",
  },
  {
    optionKey: "mistralApiKey",
    authChoice: "mistral-api-key",
    cliFlag: "--mistral-api-key",
    cliOption: "--mistral-api-key <key>",
    description: "Mistral API 密钥",
  },
  {
    optionKey: "openrouterApiKey",
    authChoice: "openrouter-api-key",
    cliFlag: "--openrouter-api-key",
    cliOption: "--openrouter-api-key <key>",
    description: "OpenRouter API 密钥",
  },
  {
    optionKey: "kilocodeApiKey",
    authChoice: "kilocode-api-key",
    cliFlag: "--kilocode-api-key",
    cliOption: "--kilocode-api-key <key>",
    description: "Kilo Gateway API 密钥",
  },
  {
    optionKey: "aiGatewayApiKey",
    authChoice: "ai-gateway-api-key",
    cliFlag: "--ai-gateway-api-key",
    cliOption: "--ai-gateway-api-key <key>",
    description: "Vercel AI Gateway API 密钥",
  },
  {
    optionKey: "cloudflareAiGatewayApiKey",
    authChoice: "cloudflare-ai-gateway-api-key",
    cliFlag: "--cloudflare-ai-gateway-api-key",
    cliOption: "--cloudflare-ai-gateway-api-key <key>",
    description: "Cloudflare AI Gateway API 密钥",
  },
  {
    optionKey: "moonshotApiKey",
    authChoice: "moonshot-api-key",
    cliFlag: "--moonshot-api-key",
    cliOption: "--moonshot-api-key <key>",
    description: "Moonshot API 密钥",
  },
  {
    optionKey: "kimiCodeApiKey",
    authChoice: "kimi-code-api-key",
    cliFlag: "--kimi-code-api-key",
    cliOption: "--kimi-code-api-key <key>",
    description: "Kimi Coding API 密钥",
  },
  {
    optionKey: "geminiApiKey",
    authChoice: "gemini-api-key",
    cliFlag: "--gemini-api-key",
    cliOption: "--gemini-api-key <key>",
    description: "Gemini API 密钥",
  },
  {
    optionKey: "zaiApiKey",
    authChoice: "zai-api-key",
    cliFlag: "--zai-api-key",
    cliOption: "--zai-api-key <key>",
    description: "Z.AI API 密钥",
  },
  {
    optionKey: "xiaomiApiKey",
    authChoice: "xiaomi-api-key",
    cliFlag: "--xiaomi-api-key",
    cliOption: "--xiaomi-api-key <key>",
    description: "小米 API 密钥",
  },
  {
    optionKey: "minimaxApiKey",
    authChoice: "minimax-api",
    cliFlag: "--minimax-api-key",
    cliOption: "--minimax-api-key <key>",
    description: "MiniMax API 密钥",
  },
  {
    optionKey: "syntheticApiKey",
    authChoice: "synthetic-api-key",
    cliFlag: "--synthetic-api-key",
    cliOption: "--synthetic-api-key <key>",
    description: "Synthetic API 密钥",
  },
  {
    optionKey: "veniceApiKey",
    authChoice: "venice-api-key",
    cliFlag: "--venice-api-key",
    cliOption: "--venice-api-key <key>",
    description: "Venice API 密钥",
  },
  {
    optionKey: "togetherApiKey",
    authChoice: "together-api-key",
    cliFlag: "--together-api-key",
    cliOption: "--together-api-key <key>",
    description: "Together AI API 密钥",
  },
  {
    optionKey: "huggingfaceApiKey",
    authChoice: "huggingface-api-key",
    cliFlag: "--huggingface-api-key",
    cliOption: "--huggingface-api-key <key>",
    description: "Hugging Face API 密钥（HF 令牌）",
  },
  {
    optionKey: "opencodeZenApiKey",
    authChoice: "opencode-zen",
    cliFlag: "--opencode-zen-api-key",
    cliOption: "--opencode-zen-api-key <key>",
description: "OpenCode API 密钥（Zen 目录）",
  },
  {
    optionKey: "opencodeGoApiKey",
    authChoice: "opencode-go",
    cliFlag: "--opencode-go-api-key",
    cliOption: "--opencode-go-api-key <key>",
    description: "OpenCode API 密钥（Go 目录）",
  },
  {
    optionKey: "xaiApiKey",
    authChoice: "xai-api-key",
    cliFlag: "--xai-api-key",
    cliOption: "--xai-api-key <key>",
    description: "xAI API 密钥",
  },
  {
    optionKey: "litellmApiKey",
    authChoice: "litellm-api-key",
    cliFlag: "--litellm-api-key",
    cliOption: "--litellm-api-key <key>",
    description: "LiteLLM API 密钥",
  },
  {
    optionKey: "qianfanApiKey",
    authChoice: "qianfan-api-key",
    cliFlag: "--qianfan-api-key",
    cliOption: "--qianfan-api-key <key>",
    description: "千帆 API 密钥",
  },
  {
    optionKey: "modelstudioApiKeyCn",
    authChoice: "modelstudio-api-key-cn",
    cliFlag: "--modelstudio-api-key-cn",
    cliOption: "--modelstudio-api-key-cn <key>",
    description: "阿里云百炼 Coding Plan API 密钥（中国）",
  },
  {
    optionKey: "modelstudioApiKey",
    authChoice: "modelstudio-api-key",
    cliFlag: "--modelstudio-api-key",
    cliOption: "--modelstudio-api-key <key>",
    description: "阿里云百炼 Coding Plan API 密钥（国际）",
  },
  {
    optionKey: "volcengineApiKey",
    authChoice: "volcengine-api-key",
    cliFlag: "--volcengine-api-key",
    cliOption: "--volcengine-api-key <key>",
    description: "火山引擎 API 密钥",
  },
  {
    optionKey: "byteplusApiKey",
    authChoice: "byteplus-api-key",
    cliFlag: "--byteplus-api-key",
    cliOption: "--byteplus-api-key <key>",
    description: "BytePlus API 密钥",
  },
];
