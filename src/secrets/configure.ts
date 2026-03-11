import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { confirm, select, text } from "@clack/prompts";
import { listAgentIds, resolveAgentDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import type { AuthProfileStore } from "../agents/auth-profiles.js";
import { AUTH_STORE_VERSION } from "../agents/auth-profiles/constants.js";
import { resolveAuthStorePath } from "../agents/auth-profiles/paths.js";
import type { OpenClawConfig } from "../config/config.js";
import type { SecretProviderConfig, SecretRef, SecretRefSource } from "../config/types.secrets.js";
import { isSafeExecutableValue } from "../infra/exec-safety.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { runSecretsApply, type SecretsApplyResult } from "./apply.js";
import { createSecretsConfigIO } from "./config-io.js";
import {
  buildConfigureCandidatesForScope,
  buildSecretsConfigurePlan,
  collectConfigureProviderChanges,
  hasConfigurePlanChanges,
  type ConfigureCandidate,
} from "./configure-plan.js";
import type { SecretsApplyPlan } from "./plan.js";
import { PROVIDER_ENV_VARS } from "./provider-env-vars.js";
import {
  formatExecSecretRefIdValidationMessage,
  isValidExecSecretRefId,
  isValidSecretProviderAlias,
  resolveDefaultSecretProviderAlias,
} from "./ref-contract.js";
import { resolveSecretRefValue } from "./resolve.js";
import { assertExpectedResolvedSecretValue } from "./secret-value.js";
import { isRecord } from "./shared.js";
import { readJsonObjectIfExists } from "./storage-scan.js";

export type SecretsConfigureResult = {
  plan: SecretsApplyPlan;
  preflight: SecretsApplyResult;
};

const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;
const WINDOWS_ABS_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH_PATTERN = /^\\\\[^\\]+\\[^\\]+/;

function isAbsolutePathValue(value: string): boolean {
  return (
    path.isAbsolute(value) ||
    WINDOWS_ABS_PATH_PATTERN.test(value) ||
    WINDOWS_UNC_PATH_PATTERN.test(value)
  );
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseOptionalPositiveInt(value: string, max: number): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) {
    return undefined;
  }
  return parsed;
}

function getSecretProviders(config: OpenClawConfig): Record<string, SecretProviderConfig> {
  if (!isRecord(config.secrets?.providers)) {
    return {};
  }
  return config.secrets.providers;
}

function setSecretProvider(
  config: OpenClawConfig,
  providerAlias: string,
  providerConfig: SecretProviderConfig,
): void {
  config.secrets ??= {};
  if (!isRecord(config.secrets.providers)) {
    config.secrets.providers = {};
  }
  config.secrets.providers[providerAlias] = providerConfig;
}

function removeSecretProvider(config: OpenClawConfig, providerAlias: string): boolean {
  if (!isRecord(config.secrets?.providers)) {
    return false;
  }
  const providers = config.secrets.providers;
  if (!Object.prototype.hasOwnProperty.call(providers, providerAlias)) {
    return false;
  }
  delete providers[providerAlias];
  if (Object.keys(providers).length === 0) {
    delete config.secrets?.providers;
  }

  if (isRecord(config.secrets?.defaults)) {
    const defaults = config.secrets.defaults;
    if (defaults?.env === providerAlias) {
      delete defaults.env;
    }
    if (defaults?.file === providerAlias) {
      delete defaults.file;
    }
    if (defaults?.exec === providerAlias) {
      delete defaults.exec;
    }
    if (
      defaults &&
      defaults.env === undefined &&
      defaults.file === undefined &&
      defaults.exec === undefined
    ) {
      delete config.secrets?.defaults;
    }
  }
  return true;
}

function providerHint(provider: SecretProviderConfig): string {
  if (provider.source === "env") {
    return provider.allowlist?.length ? `env（${provider.allowlist.length} 个已允许）` : "env";
  }
  if (provider.source === "file") {
    return `file（${provider.mode ?? "json"}）`;
  }
  return `exec（${provider.jsonOnly === false ? "json+text" : "json"}）`;
}

function toSourceChoices(config: OpenClawConfig): Array<{ value: SecretRefSource; label: string }> {
  const hasSource = (source: SecretRefSource) =>
    Object.values(config.secrets?.providers ?? {}).some((provider) => provider?.source === source);
  const choices: Array<{ value: SecretRefSource; label: string }> = [
    {
      value: "env",
      label: "env",
    },
  ];
  if (hasSource("file")) {
    choices.push({ value: "file", label: "file" });
  }
  if (hasSource("exec")) {
    choices.push({ value: "exec", label: "exec" });
  }
  return choices;
}

function assertNoCancel<T>(value: T | symbol, message: string): T {
  if (typeof value === "symbol") {
    throw new Error(message);
  }
  return value;
}

const AUTH_PROFILE_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

function validateEnvNameCsv(value: string): string | undefined {
  const entries = parseCsv(value);
  for (const entry of entries) {
    if (!ENV_NAME_PATTERN.test(entry)) {
      return `Invalid env name: ${entry}`;
    }
  }
  return undefined;
}

async function promptEnvNameCsv(params: {
  message: string;
  initialValue: string;
}): Promise<string[]> {
  const raw = assertNoCancel(
    await text({
      message: params.message,
      initialValue: params.initialValue,
      validate: (value) => validateEnvNameCsv(String(value ?? "")),
    }),
    "Secrets 配置已取消。",
  );
  return parseCsv(String(raw ?? ""));
}

async function promptOptionalPositiveInt(params: {
  message: string;
  initialValue?: number;
  max: number;
}): Promise<number | undefined> {
  const raw = assertNoCancel(
    await text({
      message: params.message,
      initialValue: params.initialValue === undefined ? "" : String(params.initialValue),
      validate: (value) => {
        const trimmed = String(value ?? "").trim();
        if (!trimmed) {
          return undefined;
        }
        const parsed = parseOptionalPositiveInt(trimmed, params.max);
        if (parsed === undefined) {
          return `必须是 1 到 ${params.max} 之间的整数`;
        }
        return undefined;
      },
    }),
    "Secrets 配置已取消。",
  );
  const parsed = parseOptionalPositiveInt(String(raw ?? ""), params.max);
  return parsed;
}

function configureCandidateKey(candidate: {
  configFile: "openclaw.json" | "auth-profiles.json";
  path: string;
  agentId?: string;
}): string {
  if (candidate.configFile === "auth-profiles.json") {
    return `auth-profiles:${String(candidate.agentId ?? "").trim()}:${candidate.path}`;
  }
  return `openclaw:${candidate.path}`;
}

function hasSourceChoice(
  sourceChoices: Array<{ value: SecretRefSource; label: string }>,
  source: SecretRefSource,
): boolean {
  return sourceChoices.some((entry) => entry.value === source);
}

function resolveCandidateProviderHint(candidate: ConfigureCandidate): string | undefined {
  if (typeof candidate.authProfileProvider === "string" && candidate.authProfileProvider.trim()) {
    return candidate.authProfileProvider.trim().toLowerCase();
  }
  if (typeof candidate.providerId === "string" && candidate.providerId.trim()) {
    return candidate.providerId.trim().toLowerCase();
  }
  return undefined;
}

function resolveSuggestedEnvSecretId(candidate: ConfigureCandidate): string | undefined {
  const hintedProvider = resolveCandidateProviderHint(candidate);
  if (!hintedProvider) {
    return undefined;
  }
  const envCandidates = PROVIDER_ENV_VARS[hintedProvider];
  if (!Array.isArray(envCandidates) || envCandidates.length === 0) {
    return undefined;
  }
  return envCandidates[0];
}

function resolveConfigureAgentId(config: OpenClawConfig, explicitAgentId?: string): string {
  const knownAgentIds = new Set(listAgentIds(config));
  if (!explicitAgentId) {
    return resolveDefaultAgentId(config);
  }
  const normalized = normalizeAgentId(explicitAgentId);
  if (knownAgentIds.has(normalized)) {
    return normalized;
  }
  const known = [...knownAgentIds].toSorted().join(", ");
  throw new Error(
    `未知代理 ID "${explicitAgentId}"。已知代理：${known || "未配置"}。`,
  );
}

function normalizeAuthStoreForConfigure(
  raw: Record<string, unknown> | null,
  storePath: string,
): AuthProfileStore {
  if (!raw) {
    return {
      version: AUTH_STORE_VERSION,
      profiles: {},
    };
  }
  if (!isRecord(raw.profiles)) {
    throw new Error(
      `Cannot run interactive secrets configure because ${storePath} is invalid (missing "profiles" object).`,
    );
  }
  const version = typeof raw.version === "number" && Number.isFinite(raw.version) ? raw.version : 1;
  return {
    version,
    profiles: raw.profiles as AuthProfileStore["profiles"],
    ...(isRecord(raw.order) ? { order: raw.order as AuthProfileStore["order"] } : {}),
    ...(isRecord(raw.lastGood) ? { lastGood: raw.lastGood as AuthProfileStore["lastGood"] } : {}),
    ...(isRecord(raw.usageStats)
      ? { usageStats: raw.usageStats as AuthProfileStore["usageStats"] }
      : {}),
  };
}

function loadAuthProfileStoreForConfigure(params: {
  config: OpenClawConfig;
  agentId: string;
}): AuthProfileStore {
  const agentDir = resolveAgentDir(params.config, params.agentId);
  const storePath = resolveAuthStorePath(agentDir);
  const parsed = readJsonObjectIfExists(storePath);
  if (parsed.error) {
    throw new Error(
      `Cannot run interactive secrets configure because ${storePath} could not be read: ${parsed.error}`,
    );
  }
  return normalizeAuthStoreForConfigure(parsed.value, storePath);
}

async function promptNewAuthProfileCandidate(agentId: string): Promise<ConfigureCandidate> {
  const profileId = assertNoCancel(
    await text({
      message: "身份配置 ID",
      validate: (value) => {
        const trimmed = String(value ?? "").trim();
        if (!trimmed) {
          return "必填";
        }
        if (!AUTH_PROFILE_ID_PATTERN.test(trimmed)) {
          return '仅允许字母/数字/":"/"_"/"-"。';
        }
        return undefined;
      },
    }),
    "Secrets 配置已取消。",
  );

  const credentialType = assertNoCancel(
    await select({
      message: "身份配置凭据类型",
      options: [
        { value: "api_key", label: "api_key (key/keyRef)" },
        { value: "token", label: "token (token/tokenRef)" },
      ],
    }),
    "Secrets 配置已取消。",
  );

  const provider = assertNoCancel(
    await text({
      message: "提供者 ID",
      validate: (value) => (String(value ?? "").trim().length > 0 ? undefined : "必填"),
    }),
    "Secrets 配置已取消。",
  );

  const profileIdTrimmed = String(profileId).trim();
  const providerTrimmed = String(provider).trim();
  if (credentialType === "token") {
    return {
      type: "auth-profiles.token.token",
      path: `profiles.${profileIdTrimmed}.token`,
      pathSegments: ["profiles", profileIdTrimmed, "token"],
      label: `profiles.${profileIdTrimmed}.token (auth profile, agent ${agentId})`,
      configFile: "auth-profiles.json",
      agentId,
      authProfileProvider: providerTrimmed,
      expectedResolvedValue: "string",
    };
  }
  return {
    type: "auth-profiles.api_key.key",
    path: `profiles.${profileIdTrimmed}.key`,
    pathSegments: ["profiles", profileIdTrimmed, "key"],
    label: `profiles.${profileIdTrimmed}.key (auth profile, agent ${agentId})`,
    configFile: "auth-profiles.json",
    agentId,
    authProfileProvider: providerTrimmed,
    expectedResolvedValue: "string",
  };
}

async function promptProviderAlias(params: { existingAliases: Set<string> }): Promise<string> {
  const alias = assertNoCancel(
    await text({
      message: "提供者别名",
      initialValue: "default",
      validate: (value) => {
        const trimmed = String(value ?? "").trim();
        if (!trimmed) {
          return "必填";
        }
        if (!isValidSecretProviderAlias(trimmed)) {
          return "必须匹配 /^[a-z][a-z0-9_-]{0,63}$/";
        }
        if (params.existingAliases.has(trimmed)) {
          return "别名已存在";
        }
        return undefined;
      },
    }),
    "Secrets 配置已取消。",
  );
  return String(alias).trim();
}

async function promptProviderSource(initial?: SecretRefSource): Promise<SecretRefSource> {
  const source = assertNoCancel(
    await select({
      message: "提供者源",
      options: [
        { value: "env", label: "env" },
        { value: "file", label: "file" },
        { value: "exec", label: "exec" },
      ],
      initialValue: initial,
    }),
    "Secrets 配置已取消。",
  );
  return source as SecretRefSource;
}

async function promptEnvProvider(
  base?: Extract<SecretProviderConfig, { source: "env" }>,
): Promise<Extract<SecretProviderConfig, { source: "env" }>> {
  const allowlist = await promptEnvNameCsv({
    message: "环境变量允许列表（逗号分隔，留空表示不限制）",
    initialValue: base?.allowlist?.join(",") ?? "",
  });
  return {
    source: "env",
    ...(allowlist.length > 0 ? { allowlist } : {}),
  };
}

async function promptFileProvider(
  base?: Extract<SecretProviderConfig, { source: "file" }>,
): Promise<Extract<SecretProviderConfig, { source: "file" }>> {
  const filePath = assertNoCancel(
    await text({
      message: "文件路径（绝对路径）",
      initialValue: base?.path ?? "",
      validate: (value) => {
        const trimmed = String(value ?? "").trim();
        if (!trimmed) {
          return "必填";
        }
        if (!isAbsolutePathValue(trimmed)) {
          return "必须是绝对路径";
        }
        return undefined;
      },
    }),
    "Secrets 配置已取消。",
  );

  const mode = assertNoCancel(
    await select({
      message: "文件模式",
      options: [
        { value: "json", label: "json" },
        { value: "singleValue", label: "singleValue" },
      ],
      initialValue: base?.mode ?? "json",
    }),
    "Secrets 配置已取消。",
  );

  const timeoutMs = await promptOptionalPositiveInt({
    message: "超时毫秒数（留空使用默认值）",
    initialValue: base?.timeoutMs,
    max: 120000,
  });
  const maxBytes = await promptOptionalPositiveInt({
    message: "最大字节数（留空使用默认值）",
    initialValue: base?.maxBytes,
    max: 20 * 1024 * 1024,
  });

  return {
    source: "file",
    path: String(filePath).trim(),
    mode,
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(maxBytes ? { maxBytes } : {}),
  };
}

async function parseArgsInput(rawValue: string): Promise<string[] | undefined> {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
    throw new Error("args must be a JSON array of strings");
  }
  return parsed;
}

async function promptExecProvider(
  base?: Extract<SecretProviderConfig, { source: "exec" }>,
): Promise<Extract<SecretProviderConfig, { source: "exec" }>> {
  const command = assertNoCancel(
    await text({
      message: "命令路径（绝对路径）",
      initialValue: base?.command ?? "",
      validate: (value) => {
        const trimmed = String(value ?? "").trim();
        if (!trimmed) {
          return "必填";
        }
        if (!isAbsolutePathValue(trimmed)) {
          return "必须是绝对路径";
        }
        if (!isSafeExecutableValue(trimmed)) {
          return "命令值不允许";
        }
        return undefined;
      },
    }),
    "Secrets 配置已取消。",
  );

  const argsRaw = assertNoCancel(
    await text({
      message: "参数 JSON 数组（留空表示无）",
      initialValue: JSON.stringify(base?.args ?? []),
      validate: (value) => {
        const trimmed = String(value ?? "").trim();
        if (!trimmed) {
          return undefined;
        }
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
            return "必须是字符串的 JSON 数组";
          }
          return undefined;
        } catch {
          return "必须是有效的 JSON";
        }
      },
    }),
    "Secrets 配置已取消。",
  );

  const timeoutMs = await promptOptionalPositiveInt({
    message: "超时毫秒数（留空使用默认值）",
    initialValue: base?.timeoutMs,
    max: 120000,
  });

  const noOutputTimeoutMs = await promptOptionalPositiveInt({
    message: "无输出超时毫秒数（留空使用默认值）",
    initialValue: base?.noOutputTimeoutMs,
    max: 120000,
  });

  const maxOutputBytes = await promptOptionalPositiveInt({
    message: "最大输出字节数（留空使用默认值）",
    initialValue: base?.maxOutputBytes,
    max: 20 * 1024 * 1024,
  });

  const jsonOnly = assertNoCancel(
    await confirm({
      message: "要求仅 JSON 响应？",
      initialValue: base?.jsonOnly ?? true,
    }),
    "Secrets 配置已取消。",
  );

  const passEnv = await promptEnvNameCsv({
    message: "透传环境变量（逗号分隔，留空表示无）",
    initialValue: base?.passEnv?.join(",") ?? "",
  });

  const trustedDirsRaw = assertNoCancel(
    await text({
      message: "受信目录（逗号分隔的绝对路径，留空表示无）",
      initialValue: base?.trustedDirs?.join(",") ?? "",
      validate: (value) => {
        const entries = parseCsv(String(value ?? ""));
        for (const entry of entries) {
          if (!isAbsolutePathValue(entry)) {
            return `受信目录必须是绝对路径：${entry}`;
          }
        }
        return undefined;
      },
    }),
    "Secrets 配置已取消。",
  );

  const allowInsecurePath = assertNoCancel(
    await confirm({
      message: "允许不安全的命令路径检查？",
      initialValue: base?.allowInsecurePath ?? false,
    }),
    "Secrets 配置已取消。",
  );
  const allowSymlinkCommand = assertNoCancel(
    await confirm({
      message: "允许符号链接命令路径？",
      initialValue: base?.allowSymlinkCommand ?? false,
    }),
    "Secrets 配置已取消。",
  );

  const args = await parseArgsInput(String(argsRaw ?? ""));
  const trustedDirs = parseCsv(String(trustedDirsRaw ?? ""));

  return {
    source: "exec",
    command: String(command).trim(),
    ...(args && args.length > 0 ? { args } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(noOutputTimeoutMs ? { noOutputTimeoutMs } : {}),
    ...(maxOutputBytes ? { maxOutputBytes } : {}),
    ...(jsonOnly ? { jsonOnly } : { jsonOnly: false }),
    ...(passEnv.length > 0 ? { passEnv } : {}),
    ...(trustedDirs.length > 0 ? { trustedDirs } : {}),
    ...(allowInsecurePath ? { allowInsecurePath: true } : {}),
    ...(allowSymlinkCommand ? { allowSymlinkCommand: true } : {}),
    ...(isRecord(base?.env) ? { env: base.env } : {}),
  };
}

async function promptProviderConfig(
  source: SecretRefSource,
  current?: SecretProviderConfig,
): Promise<SecretProviderConfig> {
  if (source === "env") {
    return await promptEnvProvider(current?.source === "env" ? current : undefined);
  }
  if (source === "file") {
    return await promptFileProvider(current?.source === "file" ? current : undefined);
  }
  return await promptExecProvider(current?.source === "exec" ? current : undefined);
}

async function configureProvidersInteractive(config: OpenClawConfig): Promise<void> {
  while (true) {
    const providers = getSecretProviders(config);
    const providerEntries = Object.entries(providers).toSorted(([left], [right]) =>
      left.localeCompare(right),
    );

    const actionOptions: Array<{ value: string; label: string; hint?: string }> = [
      {
        value: "add",
        label: "添加提供者",
        hint: "定义新的 env/file/exec 提供者",
      },
    ];
    if (providerEntries.length > 0) {
      actionOptions.push({
        value: "edit",
        label: "编辑提供者",
        hint: "更新现有提供者",
      });
      actionOptions.push({
        value: "remove",
        label: "移除提供者",
        hint: "删除提供者别名",
      });
    }
    actionOptions.push({
      value: "continue",
      label: "继续",
      hint: "进入凭据映射",
    });

    const action = assertNoCancel(
      await select({
        message:
          providerEntries.length > 0
            ? "配置密钥提供者"
            : "配置密钥提供者（添加 file/exec 提供者后才可使用 env 以外的引用）",
        options: actionOptions,
      }),
      "Secrets 配置已取消。",
    );

    if (action === "continue") {
      return;
    }

    if (action === "add") {
      const source = await promptProviderSource();
      const alias = await promptProviderAlias({
        existingAliases: new Set(providerEntries.map(([providerAlias]) => providerAlias)),
      });
      const providerConfig = await promptProviderConfig(source);
      setSecretProvider(config, alias, providerConfig);
      continue;
    }

    if (action === "edit") {
      const alias = assertNoCancel(
        await select({
          message: "选择要编辑的提供者",
          options: providerEntries.map(([providerAlias, providerConfig]) => ({
            value: providerAlias,
            label: providerAlias,
            hint: providerHint(providerConfig),
          })),
        }),
        "Secrets 配置已取消。",
      );
      const current = providers[alias];
      if (!current) {
        continue;
      }
      const source = await promptProviderSource(current.source);
      const nextProviderConfig = await promptProviderConfig(source, current);
      if (!isDeepStrictEqual(current, nextProviderConfig)) {
        setSecretProvider(config, alias, nextProviderConfig);
      }
      continue;
    }

    if (action === "remove") {
      const alias = assertNoCancel(
        await select({
          message: "选择要移除的提供者",
          options: providerEntries.map(([providerAlias, providerConfig]) => ({
            value: providerAlias,
            label: providerAlias,
            hint: providerHint(providerConfig),
          })),
        }),
        "Secrets 配置已取消。",
      );

      const shouldRemove = assertNoCancel(
        await confirm({
          message: `移除提供者 "${alias}"？`,
          initialValue: false,
        }),
        "Secrets 配置已取消。",
      );
      if (shouldRemove) {
        removeSecretProvider(config, alias);
      }
    }
  }
}

export async function runSecretsConfigureInteractive(
  params: {
    env?: NodeJS.ProcessEnv;
    providersOnly?: boolean;
    skipProviderSetup?: boolean;
    agentId?: string;
  } = {},
): Promise<SecretsConfigureResult> {
  if (!process.stdin.isTTY) {
    throw new Error("secrets configure 需要交互式 TTY。");
  }
  if (params.providersOnly && params.skipProviderSetup) {
    throw new Error("无法同时使用 --providers-only 和 --skip-provider-setup。");
  }

  const env = params.env ?? process.env;
  const io = createSecretsConfigIO({ env });
  const { snapshot } = await io.readConfigFileSnapshotForWrite();
  if (!snapshot.valid) {
    throw new Error("无法运行交互式 secrets configure，因为配置无效。");
  }

  const stagedConfig = structuredClone(snapshot.config);
  if (!params.skipProviderSetup) {
    await configureProvidersInteractive(stagedConfig);
  }

  const providerChanges = collectConfigureProviderChanges({
    original: snapshot.config,
    next: stagedConfig,
  });

  const selectedByPath = new Map<string, ConfigureCandidate & { ref: SecretRef }>();
  if (!params.providersOnly) {
    const configureAgentId = resolveConfigureAgentId(snapshot.config, params.agentId);
    const authStore = loadAuthProfileStoreForConfigure({
      config: snapshot.config,
      agentId: configureAgentId,
    });
    const candidates = buildConfigureCandidatesForScope({
      config: stagedConfig,
      authoredOpenClawConfig: snapshot.resolved,
      authProfiles: {
        agentId: configureAgentId,
        store: authStore,
      },
    });
    if (candidates.length === 0) {
      throw new Error("未找到此代理范围的可配置密钥字段。");
    }

    const sourceChoices = toSourceChoices(stagedConfig);
    const hasDerivedCandidates = candidates.some((candidate) => candidate.isDerived === true);
    let showDerivedCandidates = false;

    while (true) {
      const visibleCandidates = showDerivedCandidates
        ? candidates
        : candidates.filter((candidate) => candidate.isDerived !== true);
      const options = visibleCandidates.map((candidate) => ({
        value: configureCandidateKey(candidate),
        label: candidate.label,
        hint: [
          candidate.configFile === "auth-profiles.json" ? "auth-profiles.json" : "openclaw.json",
          candidate.isDerived === true ? "derived" : undefined,
        ]
          .filter(Boolean)
          .join(" | "),
      }));
      options.push({
        value: "__create_auth_profile__",
        label: "创建身份配置映射",
        hint: `为代理 ${configureAgentId} 添加新的 auth-profiles 目标`,
      });
      if (hasDerivedCandidates) {
        options.push({
          value: "__toggle_derived__",
          label: showDerivedCandidates ? "隐藏派生目标" : "显示派生目标",
          hint: showDerivedCandidates
            ? "仅显示配置中直接编写的字段"
            : "包含规范化/派生的别名",
        });
      }
      if (selectedByPath.size > 0) {
        options.unshift({
          value: "__done__",
          label: "完成",
          hint: "结束并运行预检",
        });
      }

      const selectedPath = assertNoCancel(
        await select({
          message: "选择凭据字段",
          options,
        }),
        "Secrets 配置已取消。",
      );

      if (selectedPath === "__done__") {
        break;
      }
      if (selectedPath === "__create_auth_profile__") {
        const createdCandidate = await promptNewAuthProfileCandidate(configureAgentId);
        const key = configureCandidateKey(createdCandidate);
        const existingIndex = candidates.findIndex((entry) => configureCandidateKey(entry) === key);
        if (existingIndex >= 0) {
          candidates[existingIndex] = createdCandidate;
        } else {
          candidates.push(createdCandidate);
        }
        continue;
      }
      if (selectedPath === "__toggle_derived__") {
        showDerivedCandidates = !showDerivedCandidates;
        continue;
      }

      const candidate = visibleCandidates.find(
        (entry) => configureCandidateKey(entry) === selectedPath,
      );
      if (!candidate) {
        throw new Error(`Unknown configure target: ${selectedPath}`);
      }
      const candidateKey = configureCandidateKey(candidate);
      const priorSelection = selectedByPath.get(candidateKey);
      const existingRef = priorSelection?.ref ?? candidate.existingRef;
      const sourceInitialValue =
        existingRef && hasSourceChoice(sourceChoices, existingRef.source)
          ? existingRef.source
          : undefined;

      const source = assertNoCancel(
        await select({
          message: "密钥源",
          options: sourceChoices,
          initialValue: sourceInitialValue,
        }),
        "Secrets 配置已取消。",
      ) as SecretRefSource;

      const defaultAlias = resolveDefaultSecretProviderAlias(stagedConfig, source, {
        preferFirstProviderForSource: true,
      });
      const providerInitialValue =
        existingRef?.source === source ? existingRef.provider : defaultAlias;
      const provider = assertNoCancel(
        await text({
          message: "提供者别名",
          initialValue: providerInitialValue,
          validate: (value) => {
            const trimmed = String(value ?? "").trim();
            if (!trimmed) {
              return "必填";
            }
            if (!isValidSecretProviderAlias(trimmed)) {
              return "必须匹配 /^[a-z][a-z0-9_-]{0,63}$/";
            }
            return undefined;
          },
        }),
        "Secrets 配置已取消。",
      );
      const providerAlias = String(provider).trim();
      const suggestedIdFromExistingRef =
        existingRef?.source === source ? existingRef.id : undefined;
      let suggestedId = suggestedIdFromExistingRef;
      if (!suggestedId && source === "env") {
        suggestedId = resolveSuggestedEnvSecretId(candidate);
      }
      if (!suggestedId && source === "file") {
        const configuredProvider = stagedConfig.secrets?.providers?.[providerAlias];
        if (configuredProvider?.source === "file" && configuredProvider.mode === "singleValue") {
          suggestedId = "value";
        }
      }
      const id = assertNoCancel(
        await text({
          message: "密钥 ID",
          initialValue: suggestedId,
          validate: (value) => {
            const trimmed = String(value ?? "").trim();
            if (!trimmed) {
              return "必填";
            }
            if (source === "exec" && !isValidExecSecretRefId(trimmed)) {
              return formatExecSecretRefIdValidationMessage();
            }
            return undefined;
          },
        }),
        "Secrets 配置已取消。",
      );
      const ref: SecretRef = {
        source,
        provider: providerAlias,
        id: String(id).trim(),
      };
      const resolved = await resolveSecretRefValue(ref, {
        config: stagedConfig,
        env,
      });
      assertExpectedResolvedSecretValue({
        value: resolved,
        expected: candidate.expectedResolvedValue,
        errorMessage:
          candidate.expectedResolvedValue === "string"
            ? `Ref ${ref.source}:${ref.provider}:${ref.id} did not resolve to a non-empty string.`
            : `Ref ${ref.source}:${ref.provider}:${ref.id} did not resolve to a supported value type.`,
      });

      const next = {
        ...candidate,
        ref,
      };
      selectedByPath.set(candidateKey, next);

      const addMore = assertNoCancel(
        await confirm({
          message: "继续配置另一个凭据？",
          initialValue: true,
        }),
        "Secrets 配置已取消。",
      );
      if (!addMore) {
        break;
      }
    }
  }

  if (!hasConfigurePlanChanges({ selectedTargets: selectedByPath, providerChanges })) {
    throw new Error("未选择任何 secrets 更改。");
  }

  const plan = buildSecretsConfigurePlan({
    selectedTargets: selectedByPath,
    providerChanges,
  });

  const preflight = await runSecretsApply({
    plan,
    env,
    write: false,
  });

  return { plan, preflight };
}
