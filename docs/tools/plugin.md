---
read_when:
  - 添加或修改插件/扩展
  - 记录插件安装或加载规则
summary: OpenClaw 插件/扩展：发现、配置和安全
title: 插件
x-i18n:
  generated_at: "2026-02-03T07:55:25Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: b36ca6b90ca03eaae25c00f9b12f2717fcd17ac540ba616ee03b398b234c2308
  source_path: tools/plugin.md
  workflow: 15
---

# 插件（扩展）

## 快速开始（插件新手？）

插件只是一个**小型代码模块**，用额外功能（命令、工具和 Gateway 网关 RPC）扩展 OpenClaw。

大多数时候，当你想要一个尚未内置到核心 OpenClaw 的功能（或你想将可选功能排除在主安装之外）时，你会使用插件。

快速路径：

1. 查看已加载的内容：

```bash
openclaw plugins list
```

2. 安装官方插件（例如：Voice Call）：

```bash
openclaw plugins install @openclaw/voice-call
```

3. 重启 Gateway 网关，然后在 `plugins.entries.<id>.config` 下配置。

参见 [Voice Call](/plugins/voice-call) 了解具体的插件示例。

## 可用插件（官方）

See [Voice Call](/plugins/voice-call) for a concrete example plugin.
Looking for third-party listings? See [Community plugins](/plugins/community).
Need the bundle compatibility details? See [Plugin bundles](/plugins/bundles).

For compatible bundles, install from a local directory or archive:

```bash
openclaw plugins install ./my-bundle
openclaw plugins install ./my-bundle.tgz
```

For Claude marketplace installs, list the marketplace first, then install by
marketplace entry name:

```bash
openclaw plugins marketplace list <marketplace-name>
openclaw plugins install <plugin-name>@<marketplace-name>
```

OpenClaw resolves known Claude marketplace names from
`~/.claude/plugins/known_marketplaces.json`. You can also pass an explicit
marketplace source with `--marketplace`.

## Architecture

OpenClaw's plugin system has four layers:

1. **Manifest + discovery**
   OpenClaw finds candidate plugins from configured paths, workspace roots,
   global extension roots, and bundled extensions. Discovery reads native
   `openclaw.plugin.json` manifests plus supported bundle manifests first.
2. **Enablement + validation**
   Core decides whether a discovered plugin is enabled, disabled, blocked, or
   selected for an exclusive slot such as memory.
3. **Runtime loading**
   Native OpenClaw plugins are loaded in-process via jiti and register
   capabilities into a central registry. Compatible bundles are normalized into
   registry records without importing runtime code.
4. **Surface consumption**
   The rest of OpenClaw reads the registry to expose tools, channels, provider
   setup, hooks, HTTP routes, CLI commands, and services.

The important design boundary:

- discovery + config validation should work from **manifest/schema metadata**
  without executing plugin code
- native runtime behavior comes from the plugin module's `register(api)` path

That split lets OpenClaw validate config, explain missing/disabled plugins, and
build UI/schema hints before the full runtime is active.

## Capability ownership model

OpenClaw treats a native plugin as the ownership boundary for a **company** or a
**feature**, not as a grab bag of unrelated integrations.

That means:

- a company plugin should usually own all of that company's OpenClaw-facing
  surfaces
- a feature plugin should usually own the full feature surface it introduces
- channels should consume shared core capabilities instead of re-implementing
  provider behavior ad hoc

Examples:

- the bundled `openai` plugin owns OpenAI model-provider behavior and OpenAI
  speech + media-understanding + image-generation behavior
- the bundled `elevenlabs` plugin owns ElevenLabs speech behavior
- the bundled `microsoft` plugin owns Microsoft speech behavior
- the bundled `google` plugin owns Google model-provider behavior plus Google
  media-understanding + image-generation + web-search behavior
- the bundled `minimax`, `mistral`, `moonshot`, and `zai` plugins own their
  media-understanding backends
- the `voice-call` plugin is a feature plugin: it owns call transport, tools,
  CLI, routes, and runtime, but it consumes core TTS/STT capability instead of
  inventing a second speech stack

The intended end state is:

- OpenAI lives in one plugin even if it spans text models, speech, images, and
  future video
- another vendor can do the same for its own surface area
- channels do not care which vendor plugin owns the provider; they consume the
  shared capability contract exposed by core

This is the key distinction:

- **plugin** = ownership boundary
- **capability** = core contract that multiple plugins can implement or consume

So if OpenClaw adds a new domain such as video, the first question is not
"which provider should hardcode video handling?" The first question is "what is
the core video capability contract?" Once that contract exists, vendor plugins
can register against it and channel/feature plugins can consume it.

If the capability does not exist yet, the right move is usually:

1. define the missing capability in core
2. expose it through the plugin API/runtime in a typed way
3. wire channels/features against that capability
4. let vendor plugins register implementations

This keeps ownership explicit while avoiding core behavior that depends on a
single vendor or a one-off plugin-specific code path.

### Capability layering

Use this mental model when deciding where code belongs:

- **core capability layer**: shared orchestration, policy, fallback, config
  merge rules, delivery semantics, and typed contracts
- **vendor plugin layer**: vendor-specific APIs, auth, model catalogs, speech
  synthesis, image generation, future video backends, usage endpoints
- **channel/feature plugin layer**: Slack/Discord/voice-call/etc. integration
  that consumes core capabilities and presents them on a surface

For example, TTS follows this shape:

- core owns reply-time TTS policy, fallback order, prefs, and channel delivery
- `openai`, `elevenlabs`, and `microsoft` own synthesis implementations
- `voice-call` consumes the telephony TTS runtime helper

That same pattern should be preferred for future capabilities.

### Multi-capability company plugin example

A company plugin should feel cohesive from the outside. If OpenClaw has shared
contracts for models, speech, media understanding, and web search, a vendor can
own all of its surfaces in one place:

```ts
import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk";
import {
  buildOpenAISpeechProvider,
  createPluginBackedWebSearchProvider,
  describeImageWithModel,
  transcribeOpenAiCompatibleAudio,
} from "openclaw/plugin-sdk";

const plugin: OpenClawPluginDefinition = {
  id: "exampleai",
  name: "ExampleAI",
  register(api) {
    api.registerProvider({
      id: "exampleai",
      // auth/model catalog/runtime hooks
    });

    api.registerSpeechProvider(
      buildOpenAISpeechProvider({
        id: "exampleai",
        // vendor speech config
      }),
    );

    api.registerMediaUnderstandingProvider({
      id: "exampleai",
      capabilities: ["image", "audio", "video"],
      async describeImage(req) {
        return describeImageWithModel({
          provider: "exampleai",
          model: req.model,
          input: req.input,
        });
      },
      async transcribeAudio(req) {
        return transcribeOpenAiCompatibleAudio({
          provider: "exampleai",
          model: req.model,
          input: req.input,
        });
      },
    });

    api.registerWebSearchProvider(
      createPluginBackedWebSearchProvider({
        id: "exampleai-search",
        // credential + fetch logic
      }),
    );
  },
};

export default plugin;
```

What matters is not the exact helper names. The shape matters:

- one plugin owns the vendor surface
- core still owns the capability contracts
- channels and feature plugins consume `api.runtime.*` helpers, not vendor code
- contract tests can assert that the plugin registered the capabilities it
  claims to own

### Capability example: video understanding

OpenClaw already treats image/audio/video understanding as one shared
capability. The same ownership model applies there:

1. core defines the media-understanding contract
2. vendor plugins register `describeImage`, `transcribeAudio`, and
   `describeVideo` as applicable
3. channels and feature plugins consume the shared core behavior instead of
   wiring directly to vendor code

That avoids baking one provider's video assumptions into core. The plugin owns
the vendor surface; core owns the capability contract and fallback behavior.

If OpenClaw adds a new domain later, such as video generation, use the same
sequence again: define the core capability first, then let vendor plugins
register implementations against it.

Need a concrete rollout checklist? See
[Capability Cookbook](/tools/capability-cookbook).

## Compatible bundles

OpenClaw also recognizes two compatible external bundle layouts:

- Codex-style bundles: `.codex-plugin/plugin.json`
- Claude-style bundles: `.claude-plugin/plugin.json` or the default Claude
  component layout without a manifest
- Cursor-style bundles: `.cursor-plugin/plugin.json`

Claude marketplace entries can point at any of these compatible bundles, or at
native OpenClaw plugin sources. OpenClaw resolves the marketplace entry first,
then runs the normal install path for the resolved source.

They are shown in the plugin list as `format=bundle`, with a subtype of
`codex` or `claude` in verbose/info output.

See [Plugin bundles](/plugins/bundles) for the exact detection rules, mapping
behavior, and current support matrix.

Today, OpenClaw treats these as **capability packs**, not native runtime
plugins:

- supported now: bundled `skills`
- supported now: Claude `commands/` markdown roots, mapped into the normal
  OpenClaw skill loader
- supported now: Claude bundle `settings.json` defaults for embedded Pi agent
  settings (with shell override keys sanitized)
- supported now: bundle MCP config, merged into embedded Pi agent settings as
  `mcpServers`, with supported stdio bundle MCP tools exposed during embedded
  Pi agent turns
- supported now: Cursor `.cursor/commands/*.md` roots, mapped into the normal
  OpenClaw skill loader
- supported now: Codex bundle hook directories that use the OpenClaw hook-pack
  layout (`HOOK.md` + `handler.ts`/`handler.js`)
- detected but not wired yet: other declared bundle capabilities such as
  agents, Claude hook automation, Cursor rules/hooks metadata, app/LSP
  metadata, output styles

That means bundle install/discovery/list/info/enablement all work, and bundle
skills, Claude command-skills, Claude bundle settings defaults, and compatible
Codex hook directories load when the bundle is enabled. Supported bundle MCP
servers may also run as subprocesses for embedded Pi tool calls when they use
supported stdio transport, but bundle runtime modules are not loaded
in-process.

Bundle hook support is limited to the normal OpenClaw hook directory format
(`HOOK.md` plus `handler.ts`/`handler.js` under the declared hook roots).
Vendor-specific shell/JSON hook runtimes, including Claude `hooks.json`, are
only detected today and are not executed directly.

## Execution model

Native OpenClaw plugins run **in-process** with the Gateway. They are not
sandboxed. A loaded native plugin has the same process-level trust boundary as
core code.

Implications:

- a native plugin can register tools, network handlers, hooks, and services
- a native plugin bug can crash or destabilize the gateway
- a malicious native plugin is equivalent to arbitrary code execution inside
  the OpenClaw process

Compatible bundles are safer by default because OpenClaw currently treats them
as metadata/content packs. In current releases, that mostly means bundled
skills.

Use allowlists and explicit install/load paths for non-bundled plugins. Treat
workspace plugins as development-time code, not production defaults.

Important trust note:

- `plugins.allow` trusts **plugin ids**, not source provenance.
- A workspace plugin with the same id as a bundled plugin intentionally shadows
  the bundled copy when that workspace plugin is enabled/allowlisted.
- This is normal and useful for local development, patch testing, and hotfixes.

## Available plugins (official)

- Microsoft Teams is plugin-only as of 2026.1.15; install `@openclaw/msteams` if you use Teams.
- Memory (Core) — bundled memory search plugin (enabled by default via `plugins.slots.memory`)
- Memory (LanceDB) — bundled long-term memory plugin (auto-recall/capture; set `plugins.slots.memory = "memory-lancedb"`)
- [Voice Call](/plugins/voice-call) — `@openclaw/voice-call`
- [Zalo Personal](/plugins/zalouser) — `@openclaw/zalouser`
- [Matrix](/channels/matrix) — `@openclaw/matrix`
- [Nostr](/channels/nostr) — `@openclaw/nostr`
- [Zalo](/channels/zalo) — `@openclaw/zalo`
- [Microsoft Teams](/channels/msteams) — `@openclaw/msteams`
- Anthropic provider runtime — bundled as `anthropic` (enabled by default)
- BytePlus provider catalog — bundled as `byteplus` (enabled by default)
- Cloudflare AI Gateway provider catalog — bundled as `cloudflare-ai-gateway` (enabled by default)
- Google web search + Gemini CLI OAuth — bundled as `google` (web search auto-loads it; provider auth stays opt-in)
- GitHub Copilot provider runtime — bundled as `github-copilot` (enabled by default)
- Hugging Face provider catalog — bundled as `huggingface` (enabled by default)
- Kilo Gateway provider runtime — bundled as `kilocode` (enabled by default)
- Kimi Coding provider catalog — bundled as `kimi-coding` (enabled by default)
- MiniMax provider catalog + usage + OAuth — bundled as `minimax` (enabled by default; owns `minimax` and `minimax-portal`)
- Mistral provider capabilities — bundled as `mistral` (enabled by default)
- Model Studio provider catalog — bundled as `modelstudio` (enabled by default)
- Moonshot provider runtime — bundled as `moonshot` (enabled by default)
- NVIDIA provider catalog — bundled as `nvidia` (enabled by default)
- ElevenLabs speech provider — bundled as `elevenlabs` (enabled by default)
- Microsoft speech provider — bundled as `microsoft` (enabled by default; legacy `edge` input maps here)
- OpenAI provider runtime — bundled as `openai` (enabled by default; owns both `openai` and `openai-codex`)
- OpenCode Go provider capabilities — bundled as `opencode-go` (enabled by default)
- OpenCode Zen provider capabilities — bundled as `opencode` (enabled by default)
- OpenRouter provider runtime — bundled as `openrouter` (enabled by default)
- Qianfan provider catalog — bundled as `qianfan` (enabled by default)
- Qwen OAuth (provider auth + catalog) — bundled as `qwen-portal-auth` (enabled by default)
- Synthetic provider catalog — bundled as `synthetic` (enabled by default)
- Together provider catalog — bundled as `together` (enabled by default)
- Venice provider catalog — bundled as `venice` (enabled by default)
- Vercel AI Gateway provider catalog — bundled as `vercel-ai-gateway` (enabled by default)
- Volcengine provider catalog — bundled as `volcengine` (enabled by default)
- Xiaomi provider catalog + usage — bundled as `xiaomi` (enabled by default)
- Z.AI provider runtime — bundled as `zai` (enabled by default)
- Copilot Proxy (provider auth) — local VS Code Copilot Proxy bridge; distinct from built-in `github-copilot` device login (bundled, disabled by default)

OpenClaw 插件是通过 jiti 在运行时加载的 **TypeScript 模块**。**配置验证不会执行插件代码**；它使用插件清单和 JSON Schema。参见 [插件清单](/plugins/manifest)。

插件可以注册：

- Gateway RPC methods
- Gateway HTTP routes
- Agent tools
- CLI commands
- Speech providers
- Web search providers
- Background services
- Context engines
- Provider auth flows and model catalogs
- Provider runtime hooks for dynamic model ids, transport normalization, capability metadata, stream wrapping, cache TTL policy, missing-auth hints, built-in model suppression, catalog augmentation, runtime auth exchange, and usage/billing auth + snapshot resolution
- Optional config validation
- **Skills** (by listing `skills` directories in the plugin manifest)
- **Auto-reply commands** (execute without invoking the AI agent)

插件与 Gateway 网关**在同一进程中**运行，因此将它们视为受信任的代码。
工具编写指南：[插件智能体工具](/plugins/agent-tools)。

Think of these registrations as **capability claims**. A plugin is not supposed
to reach into random internals and "just make it work." It should register
against explicit surfaces that OpenClaw understands, validates, and can expose
consistently across config, onboarding, status, docs, and runtime behavior.

## Contracts and enforcement

The plugin API surface is intentionally typed and centralized in
`OpenClawPluginApi`. That contract defines the supported registration points and
the runtime helpers a plugin may rely on.

Why this matters:

- plugin authors get one stable internal standard
- core can reject duplicate ownership such as two plugins registering the same
  provider id
- startup can surface actionable diagnostics for malformed registration
- contract tests can enforce bundled-plugin ownership and prevent silent drift

There are two layers of enforcement:

1. **runtime registration enforcement**
   The plugin registry validates registrations as plugins load. Examples:
   duplicate provider ids, duplicate speech provider ids, and malformed
   registrations produce plugin diagnostics instead of undefined behavior.
2. **contract tests**
   Bundled plugins are captured in contract registries during test runs so
   OpenClaw can assert ownership explicitly. Today this is used for model
   providers, speech providers, web search providers, and bundled registration
   ownership.

The practical effect is that OpenClaw knows, up front, which plugin owns which
surface. That lets core and channels compose seamlessly because ownership is
declared, typed, and testable rather than implicit.

### What belongs in a contract

Good plugin contracts are:

- typed
- small
- capability-specific
- owned by core
- reusable by multiple plugins
- consumable by channels/features without vendor knowledge

Bad plugin contracts are:

- vendor-specific policy hidden in core
- one-off plugin escape hatches that bypass the registry
- channel code reaching straight into a vendor implementation
- ad hoc runtime objects that are not part of `OpenClawPluginApi` or
  `api.runtime`

When in doubt, raise the abstraction level: define the capability first, then
let plugins plug into it.

## Provider runtime hooks

Provider plugins now have two layers:

- manifest metadata: `providerAuthEnvVars` for cheap env-auth lookup before
  runtime load, plus `providerAuthChoices` for cheap onboarding/auth-choice
  labels and CLI flag metadata before runtime load
- config-time hooks: `catalog` / legacy `discovery`
- runtime hooks: `resolveDynamicModel`, `prepareDynamicModel`, `normalizeResolvedModel`, `capabilities`, `prepareExtraParams`, `wrapStreamFn`, `formatApiKey`, `refreshOAuth`, `buildAuthDoctorHint`, `isCacheTtlEligible`, `buildMissingAuthMessage`, `suppressBuiltInModel`, `augmentModelCatalog`, `isBinaryThinking`, `supportsXHighThinking`, `resolveDefaultThinkingLevel`, `isModernModelRef`, `prepareRuntimeAuth`, `resolveUsageAuth`, `fetchUsageSnapshot`

OpenClaw still owns the generic agent loop, failover, transcript handling, and
tool policy. These hooks are the seam for provider-specific behavior without
needing a whole custom inference transport.

Use manifest `providerAuthEnvVars` when the provider has env-based credentials
that generic auth/status/model-picker paths should see without loading plugin
runtime. Use manifest `providerAuthChoices` when onboarding/auth-choice CLI
surfaces should know the provider's choice id, group labels, and simple
one-flag auth wiring without loading provider runtime. Keep provider runtime
`envVars` for operator-facing hints such as onboarding labels or OAuth
client-id/client-secret setup vars.

### Hook order

For model/provider plugins, OpenClaw uses hooks in this rough order:

1. `catalog`
   Publish provider config into `models.providers` during `models.json`
   generation.
2. built-in/discovered model lookup
   OpenClaw tries the normal registry/catalog path first.
3. `resolveDynamicModel`
   Sync fallback for provider-owned model ids that are not in the local
   registry yet.
4. `prepareDynamicModel`
   Async warm-up only on async model resolution paths, then
   `resolveDynamicModel` runs again.
5. `normalizeResolvedModel`
   Final rewrite before the embedded runner uses the resolved model.
6. `capabilities`
   Provider-owned transcript/tooling metadata used by shared core logic.
7. `prepareExtraParams`
   Provider-owned request-param normalization before generic stream option wrappers.
8. `wrapStreamFn`
   Provider-owned stream wrapper after generic wrappers are applied.
9. `formatApiKey`
   Provider-owned auth-profile formatter used when a stored auth profile needs
   to become the runtime `apiKey` string.
10. `refreshOAuth`
    Provider-owned OAuth refresh override for custom refresh endpoints or
    refresh-failure policy.
11. `buildAuthDoctorHint`
    Provider-owned repair hint appended when OAuth refresh fails.
12. `isCacheTtlEligible`
    Provider-owned prompt-cache policy for proxy/backhaul providers.
13. `buildMissingAuthMessage`
    Provider-owned replacement for the generic missing-auth recovery message.
14. `suppressBuiltInModel`
    Provider-owned stale upstream model suppression plus optional user-facing
    error hint.
15. `augmentModelCatalog`
    Provider-owned synthetic/final catalog rows appended after discovery.
16. `isBinaryThinking`
    Provider-owned on/off reasoning toggle for binary-thinking providers.
17. `supportsXHighThinking`
    Provider-owned `xhigh` reasoning support for selected models.
18. `resolveDefaultThinkingLevel`
    Provider-owned default `/think` level for a specific model family.
19. `isModernModelRef`
    Provider-owned modern-model matcher used by live profile filters and smoke
    selection.
20. `prepareRuntimeAuth`
    Exchanges a configured credential into the actual runtime token/key just
    before inference.
21. `resolveUsageAuth`
    Resolves usage/billing credentials for `/usage` and related status
    surfaces.
22. `fetchUsageSnapshot`
    Fetches and normalizes provider-specific usage/quota snapshots after auth
    is resolved.

### Which hook to use

- `catalog`: publish provider config and model catalogs into `models.providers`
- `resolveDynamicModel`: handle pass-through or forward-compat model ids that are not in the local registry yet
- `prepareDynamicModel`: async warm-up before retrying dynamic resolution (for example refresh provider metadata cache)
- `normalizeResolvedModel`: rewrite a resolved model's transport/base URL/compat before inference
- `capabilities`: publish provider-family and transcript/tooling quirks without hardcoding provider ids in core
- `prepareExtraParams`: set provider defaults or normalize provider-specific per-model params before generic stream wrapping
- `wrapStreamFn`: add provider-specific headers/payload/model compat patches while still using the normal `pi-ai` execution path
- `formatApiKey`: turn a stored auth profile into the runtime `apiKey` string without hardcoding provider token blobs in core
- `refreshOAuth`: own OAuth refresh for providers that do not fit the shared `pi-ai` refreshers
- `buildAuthDoctorHint`: append provider-owned auth repair guidance when refresh fails
- `isCacheTtlEligible`: decide whether provider/model pairs should use cache TTL metadata
- `buildMissingAuthMessage`: replace the generic auth-store error with a provider-specific recovery hint
- `suppressBuiltInModel`: hide stale upstream rows and optionally return a provider-owned error for direct resolution failures
- `augmentModelCatalog`: append synthetic/final catalog rows after discovery and config merging
- `isBinaryThinking`: expose binary on/off reasoning UX without hardcoding provider ids in `/think`
- `supportsXHighThinking`: opt specific models into the `xhigh` reasoning level
- `resolveDefaultThinkingLevel`: keep provider/model default reasoning policy out of core
- `isModernModelRef`: keep live/smoke model family inclusion rules with the provider
- `prepareRuntimeAuth`: exchange a configured credential into the actual short-lived runtime token/key used for requests
- `resolveUsageAuth`: resolve provider-owned credentials for usage/billing endpoints without hardcoding token parsing in core
- `fetchUsageSnapshot`: own provider-specific usage endpoint fetch/parsing while core keeps summary fan-out and formatting

Rule of thumb:

- provider owns a catalog or base URL defaults: use `catalog`
- provider accepts arbitrary upstream model ids: use `resolveDynamicModel`
- provider needs network metadata before resolving unknown ids: add `prepareDynamicModel`
- provider needs transport rewrites but still uses a core transport: use `normalizeResolvedModel`
- provider needs transcript/provider-family quirks: use `capabilities`
- provider needs default request params or per-provider param cleanup: use `prepareExtraParams`
- provider needs request headers/body/model compat wrappers without a custom transport: use `wrapStreamFn`
- provider stores extra metadata in auth profiles and needs a custom runtime token shape: use `formatApiKey`
- provider needs a custom OAuth refresh endpoint or refresh failure policy: use `refreshOAuth`
- provider needs provider-owned auth repair guidance after refresh failure: use `buildAuthDoctorHint`
- provider needs proxy-specific cache TTL gating: use `isCacheTtlEligible`
- provider needs a provider-specific missing-auth recovery hint: use `buildMissingAuthMessage`
- provider needs to hide stale upstream rows or replace them with a vendor hint: use `suppressBuiltInModel`
- provider needs synthetic forward-compat rows in `models list` and pickers: use `augmentModelCatalog`
- provider exposes only binary thinking on/off: use `isBinaryThinking`
- provider wants `xhigh` on only a subset of models: use `supportsXHighThinking`
- provider owns default `/think` policy for a model family: use `resolveDefaultThinkingLevel`
- provider owns live/smoke preferred-model matching: use `isModernModelRef`
- provider needs a token exchange or short-lived request credential: use `prepareRuntimeAuth`
- provider needs custom usage/quota token parsing or a different usage credential: use `resolveUsageAuth`
- provider needs a provider-specific usage endpoint or payload parser: use `fetchUsageSnapshot`

If the provider needs a fully custom wire protocol or custom request executor,
that is a different class of extension. These hooks are for provider behavior
that still runs on OpenClaw's normal inference loop.

### Provider Example

```ts
api.registerProvider({
  id: "example-proxy",
  label: "Example Proxy",
  auth: [],
  catalog: {
    order: "simple",
    run: async (ctx) => {
      const apiKey = ctx.resolveProviderApiKey("example-proxy").apiKey;
      if (!apiKey) {
        return null;
      }
      return {
        provider: {
          baseUrl: "https://proxy.example.com/v1",
          apiKey,
          api: "openai-completions",
          models: [{ id: "auto", name: "Auto" }],
        },
      };
    },
  },
  resolveDynamicModel: (ctx) => ({
    id: ctx.modelId,
    name: ctx.modelId,
    provider: "example-proxy",
    api: "openai-completions",
    baseUrl: "https://proxy.example.com/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  }),
  prepareRuntimeAuth: async (ctx) => {
    const exchanged = await exchangeToken(ctx.apiKey);
    return {
      apiKey: exchanged.token,
      baseUrl: exchanged.baseUrl,
      expiresAt: exchanged.expiresAt,
    };
  },
  resolveUsageAuth: async (ctx) => {
    const auth = await ctx.resolveOAuthToken();
    return auth ? { token: auth.token } : null;
  },
  fetchUsageSnapshot: async (ctx) => {
    return await fetchExampleProxyUsage(ctx.token, ctx.timeoutMs, ctx.fetchFn);
  },
});
```

### Built-in examples

- Anthropic uses `resolveDynamicModel`, `capabilities`, `buildAuthDoctorHint`,
  `resolveUsageAuth`, `fetchUsageSnapshot`, `isCacheTtlEligible`,
  `resolveDefaultThinkingLevel`, and `isModernModelRef` because it owns Claude
  4.6 forward-compat, provider-family hints, auth repair guidance, usage
  endpoint integration, prompt-cache eligibility, and Claude default/adaptive
  thinking policy.
- OpenAI uses `resolveDynamicModel`, `normalizeResolvedModel`, and
  `capabilities` plus `buildMissingAuthMessage`, `suppressBuiltInModel`,
  `augmentModelCatalog`, `supportsXHighThinking`, and `isModernModelRef`
  because it owns GPT-5.4 forward-compat, the direct OpenAI
  `openai-completions` -> `openai-responses` normalization, Codex-aware auth
  hints, Spark suppression, synthetic OpenAI list rows, and GPT-5 thinking /
  live-model policy.
- OpenRouter uses `catalog` plus `resolveDynamicModel` and
  `prepareDynamicModel` because the provider is pass-through and may expose new
  model ids before OpenClaw's static catalog updates.
- GitHub Copilot uses `catalog`, `auth`, `resolveDynamicModel`, and
  `capabilities` plus `prepareRuntimeAuth` and `fetchUsageSnapshot` because it
  needs provider-owned device login, model fallback behavior, Claude transcript
  quirks, a GitHub token -> Copilot token exchange, and a provider-owned usage
  endpoint.
- OpenAI Codex uses `catalog`, `resolveDynamicModel`,
  `normalizeResolvedModel`, `refreshOAuth`, and `augmentModelCatalog` plus
  `prepareExtraParams`, `resolveUsageAuth`, and `fetchUsageSnapshot` because it
  still runs on core OpenAI transports but owns its transport/base URL
  normalization, OAuth refresh fallback policy, default transport choice,
  synthetic Codex catalog rows, and ChatGPT usage endpoint integration.
- Google AI Studio and Gemini CLI OAuth use `resolveDynamicModel` and
  `isModernModelRef` because they own Gemini 3.1 forward-compat fallback and
  modern-model matching; Gemini CLI OAuth also uses `formatApiKey`,
  `resolveUsageAuth`, and `fetchUsageSnapshot` for token formatting, token
  parsing, and quota endpoint wiring.
- OpenRouter uses `capabilities`, `wrapStreamFn`, and `isCacheTtlEligible`
  to keep provider-specific request headers, routing metadata, reasoning
  patches, and prompt-cache policy out of core.
- Moonshot uses `catalog` plus `wrapStreamFn` because it still uses the shared
  OpenAI transport but needs provider-owned thinking payload normalization.
- Kilocode uses `catalog`, `capabilities`, `wrapStreamFn`, and
  `isCacheTtlEligible` because it needs provider-owned request headers,
  reasoning payload normalization, Gemini transcript hints, and Anthropic
  cache-TTL gating.
- Z.AI uses `resolveDynamicModel`, `prepareExtraParams`, `wrapStreamFn`,
  `isCacheTtlEligible`, `isBinaryThinking`, `isModernModelRef`,
  `resolveUsageAuth`, and `fetchUsageSnapshot` because it owns GLM-5 fallback,
  `tool_stream` defaults, binary thinking UX, modern-model matching, and both
  usage auth + quota fetching.
- Mistral, OpenCode Zen, and OpenCode Go use `capabilities` only to keep
  transcript/tooling quirks out of core.
- Catalog-only bundled providers such as `byteplus`, `cloudflare-ai-gateway`,
  `huggingface`, `kimi-coding`, `modelstudio`, `nvidia`, `qianfan`,
  `synthetic`, `together`, `venice`, `vercel-ai-gateway`, and `volcengine` use
  `catalog` only.
- Qwen portal uses `catalog`, `auth`, and `refreshOAuth`.
- MiniMax and Xiaomi use `catalog` plus usage hooks because their `/usage`
  behavior is plugin-owned even though inference still runs through the shared
  transports.

## Load pipeline

At startup, OpenClaw does roughly this:

1. discover candidate plugin roots
2. read native or compatible bundle manifests and package metadata
3. reject unsafe candidates
4. normalize plugin config (`plugins.enabled`, `allow`, `deny`, `entries`,
   `slots`, `load.paths`)
5. decide enablement for each candidate
6. load enabled native modules via jiti
7. call native `register(api)` hooks and collect registrations into the plugin registry
8. expose the registry to commands/runtime surfaces

The safety gates happen **before** runtime execution. Candidates are blocked
when the entry escapes the plugin root, the path is world-writable, or path
ownership looks suspicious for non-bundled plugins.

### Manifest-first behavior

The manifest is the control-plane source of truth. OpenClaw uses it to:

- identify the plugin
- discover declared channels/skills/config schema or bundle capabilities
- validate `plugins.entries.<id>.config`
- augment Control UI labels/placeholders
- show install/catalog metadata

For native plugins, the runtime module is the data-plane part. It registers
actual behavior such as hooks, tools, commands, or provider flows.

### What the loader caches

OpenClaw keeps short in-process caches for:

- discovery results
- manifest registry data
- loaded plugin registries

These caches reduce bursty startup and repeated command overhead. They are safe
to think of as short-lived performance caches, not persistence.

## Runtime helpers

Plugins can access selected core helpers via `api.runtime`. For TTS:

```ts
const clip = await api.runtime.tts.textToSpeech({
  text: "Hello from OpenClaw",
  cfg: api.config,
});

const result = await api.runtime.tts.textToSpeechTelephony({
  text: "Hello from OpenClaw",
  cfg: api.config,
});

const voices = await api.runtime.tts.listVoices({
  provider: "elevenlabs",
  cfg: api.config,
});
```

注意事项：

- `textToSpeech` returns the normal core TTS output payload for file/voice-note surfaces.
- Uses core `messages.tts` configuration and provider selection.
- Returns PCM audio buffer + sample rate. Plugins must resample/encode for providers.
- `listVoices` is optional per provider. Use it for vendor-owned voice pickers or setup flows.
- Voice listings can include richer metadata such as locale, gender, and personality tags for provider-aware pickers.
- OpenAI and ElevenLabs support telephony today. Microsoft does not.

Plugins can also register speech providers via `api.registerSpeechProvider(...)`.

```ts
api.registerSpeechProvider({
  id: "acme-speech",
  label: "Acme Speech",
  isConfigured: ({ config }) => Boolean(config.messages?.tts),
  synthesize: async (req) => {
    return {
      audioBuffer: Buffer.from([]),
      outputFormat: "mp3",
      fileExtension: ".mp3",
      voiceCompatible: false,
    };
  },
});
```

Notes:

- Keep TTS policy, fallback, and reply delivery in core.
- Use speech providers for vendor-owned synthesis behavior.
- Legacy Microsoft `edge` input is normalized to the `microsoft` provider id.
- The preferred ownership model is company-oriented: one vendor plugin can own
  text, speech, image, and future media providers as OpenClaw adds those
  capability contracts.

For image/audio/video understanding, plugins register one typed
media-understanding provider instead of a generic key/value bag:

```ts
api.registerMediaUnderstandingProvider({
  id: "google",
  capabilities: ["image", "audio", "video"],
  describeImage: async (req) => ({ text: "..." }),
  transcribeAudio: async (req) => ({ text: "..." }),
  describeVideo: async (req) => ({ text: "..." }),
});
```

Notes:

- Keep orchestration, fallback, config, and channel wiring in core.
- Keep vendor behavior in the provider plugin.
- Additive expansion should stay typed: new optional methods, new optional
  result fields, new optional capabilities.
- If OpenClaw adds a new capability such as video generation later, define the
  core capability contract first, then let vendor plugins register against it.

For media-understanding runtime helpers, plugins can call:

```ts
const image = await api.runtime.mediaUnderstanding.describeImageFile({
  filePath: "/tmp/inbound-photo.jpg",
  cfg: api.config,
  agentDir: "/tmp/agent",
});

const video = await api.runtime.mediaUnderstanding.describeVideoFile({
  filePath: "/tmp/inbound-video.mp4",
  cfg: api.config,
});
```

For audio transcription, plugins can use either the media-understanding runtime
or the older STT alias:

```ts
const { text } = await api.runtime.mediaUnderstanding.transcribeAudioFile({
  filePath: "/tmp/inbound-audio.ogg",
  cfg: api.config,
  // Optional when MIME cannot be inferred reliably:
  mime: "audio/ogg",
});
```

1. 配置路径

- `api.runtime.mediaUnderstanding.*` is the preferred shared surface for
  image/audio/video understanding.
- Uses core media-understanding audio configuration (`tools.media.audio`) and provider fallback order.
- Returns `{ text: undefined }` when no transcription output is produced (for example skipped/unsupported input).
- `api.runtime.stt.transcribeAudioFile(...)` remains as a compatibility alias.

For web search, plugins can consume the shared runtime helper instead of
reaching into the agent tool wiring:

```ts
const providers = api.runtime.webSearch.listProviders({
  config: api.config,
});

const result = await api.runtime.webSearch.search({
  config: api.config,
  args: {
    query: "OpenClaw plugin runtime helpers",
    count: 5,
  },
});
```

Plugins can also register web-search providers via
`api.registerWebSearchProvider(...)`.

Notes:

- Keep provider selection, credential resolution, and shared request semantics in core.
- Use web-search providers for vendor-specific search transports.
- `api.runtime.webSearch.*` is the preferred shared surface for feature/channel plugins that need search behavior without depending on the agent tool wrapper.

## Gateway HTTP routes

Plugins can expose HTTP endpoints with `api.registerHttpRoute(...)`.

```ts
api.registerHttpRoute({
  path: "/acme/webhook",
  auth: "plugin",
  match: "exact",
  handler: async (_req, res) => {
    res.statusCode = 200;
    res.end("ok");
    return true;
  },
});
```

Route fields:

- `path`: route path under the gateway HTTP server.
- `auth`: required. Use `"gateway"` to require normal gateway auth, or `"plugin"` for plugin-managed auth/webhook verification.
- `match`: optional. `"exact"` (default) or `"prefix"`.
- `replaceExisting`: optional. Allows the same plugin to replace its own existing route registration.
- `handler`: return `true` when the route handled the request.

Notes:

- `api.registerHttpHandler(...)` is obsolete. Use `api.registerHttpRoute(...)`.
- Plugin routes must declare `auth` explicitly.
- Exact `path + match` conflicts are rejected unless `replaceExisting: true`, and one plugin cannot replace another plugin's route.
- Overlapping routes with different `auth` levels are rejected. Keep `exact`/`prefix` fallthrough chains on the same auth level only.

## Plugin SDK import paths

Use SDK subpaths instead of the monolithic `openclaw/plugin-sdk` import when
authoring plugins:

- `openclaw/plugin-sdk/core` for the smallest generic plugin-facing contract.
- Domain subpaths such as `openclaw/plugin-sdk/channel-config-helpers`,
  `openclaw/plugin-sdk/channel-config-schema`,
  `openclaw/plugin-sdk/channel-policy`,
  `openclaw/plugin-sdk/reply-history`,
  `openclaw/plugin-sdk/routing`,
  `openclaw/plugin-sdk/runtime-store`, and
  `openclaw/plugin-sdk/directory-runtime` for shared runtime/config helpers.
- `openclaw/plugin-sdk/compat` remains as a legacy migration surface for older
  external plugins. Bundled plugins should not use it.
- `openclaw/plugin-sdk/telegram` for Telegram channel plugin types and shared channel-facing helpers. Built-in Telegram implementation internals stay private to the bundled extension.
- `openclaw/plugin-sdk/discord` for Discord channel plugin types and shared channel-facing helpers. Built-in Discord implementation internals stay private to the bundled extension.
- `openclaw/plugin-sdk/slack` for Slack channel plugin types and shared channel-facing helpers. Built-in Slack implementation internals stay private to the bundled extension.
- `openclaw/plugin-sdk/signal` for Signal channel plugin types and shared channel-facing helpers. Built-in Signal implementation internals stay private to the bundled extension.
- `openclaw/plugin-sdk/imessage` for iMessage channel plugin types and shared channel-facing helpers. Built-in iMessage implementation internals stay private to the bundled extension.
- `openclaw/plugin-sdk/whatsapp` for WhatsApp channel plugin types and shared channel-facing helpers. Built-in WhatsApp implementation internals stay private to the bundled extension.
- `openclaw/plugin-sdk/line` for LINE channel plugins.
- `openclaw/plugin-sdk/msteams` for the bundled Microsoft Teams plugin surface.
- Bundled extension-specific subpaths are also available:
  `openclaw/plugin-sdk/acpx`, `openclaw/plugin-sdk/bluebubbles`,
  `openclaw/plugin-sdk/copilot-proxy`, `openclaw/plugin-sdk/device-pair`,
  `openclaw/plugin-sdk/diagnostics-otel`, `openclaw/plugin-sdk/diffs`,
  `openclaw/plugin-sdk/feishu`, `openclaw/plugin-sdk/googlechat`,
  `openclaw/plugin-sdk/irc`, `openclaw/plugin-sdk/llm-task`,
  `openclaw/plugin-sdk/lobster`, `openclaw/plugin-sdk/matrix`,
  `openclaw/plugin-sdk/mattermost`, `openclaw/plugin-sdk/memory-core`,
  `openclaw/plugin-sdk/memory-lancedb`,
  `openclaw/plugin-sdk/minimax-portal-auth`,
  `openclaw/plugin-sdk/nextcloud-talk`, `openclaw/plugin-sdk/nostr`,
  `openclaw/plugin-sdk/open-prose`, `openclaw/plugin-sdk/phone-control`,
  `openclaw/plugin-sdk/qwen-portal-auth`, `openclaw/plugin-sdk/synology-chat`,
  `openclaw/plugin-sdk/talk-voice`, `openclaw/plugin-sdk/test-utils`,
  `openclaw/plugin-sdk/thread-ownership`, `openclaw/plugin-sdk/tlon`,
  `openclaw/plugin-sdk/twitch`, `openclaw/plugin-sdk/voice-call`,
  `openclaw/plugin-sdk/zalo`, and `openclaw/plugin-sdk/zalouser`.

## Provider catalogs

Provider plugins can define model catalogs for inference with
`registerProvider({ catalog: { run(...) { ... } } })`.

`catalog.run(...)` returns the same shape OpenClaw writes into
`models.providers`:

- `{ provider }` for one provider entry
- `{ providers }` for multiple provider entries

Use `catalog` when the plugin owns provider-specific model ids, base URL
defaults, or auth-gated model metadata.

`catalog.order` controls when a plugin's catalog merges relative to OpenClaw's
built-in implicit providers:

- `simple`: plain API-key or env-driven providers
- `profile`: providers that appear when auth profiles exist
- `paired`: providers that synthesize multiple related provider entries
- `late`: last pass, after other implicit providers

Later providers win on key collision, so plugins can intentionally override a
built-in provider entry with the same provider id.

Compatibility:

- `discovery` still works as a legacy alias
- if both `catalog` and `discovery` are registered, OpenClaw uses `catalog`

Compatibility note:

- `openclaw/plugin-sdk` remains supported for existing external plugins.
- New and migrated bundled plugins should use channel or extension-specific
  subpaths; use `core` plus explicit domain subpaths for generic surfaces, and
  treat `compat` as migration-only.

## Read-only channel inspection

If your plugin registers a channel, prefer implementing
`plugin.config.inspectAccount(cfg, accountId)` alongside `resolveAccount(...)`.

Why:

- `resolveAccount(...)` is the runtime path. It is allowed to assume credentials
  are fully materialized and can fail fast when required secrets are missing.
- Read-only command paths such as `openclaw status`, `openclaw status --all`,
  `openclaw channels status`, `openclaw channels resolve`, and doctor/config
  repair flows should not need to materialize runtime credentials just to
  describe configuration.

Recommended `inspectAccount(...)` behavior:

- Return descriptive account state only.
- Preserve `enabled` and `configured`.
- Include credential source/status fields when relevant, such as:
  - `tokenSource`, `tokenStatus`
  - `botTokenSource`, `botTokenStatus`
  - `appTokenSource`, `appTokenStatus`
  - `signingSecretSource`, `signingSecretStatus`
- You do not need to return raw token values just to report read-only
  availability. Returning `tokenStatus: "available"` (and the matching source
  field) is enough for status-style commands.
- Use `configured_unavailable` when a credential is configured via SecretRef but
  unavailable in the current command path.

This lets read-only commands report “configured but unavailable in this command
path” instead of crashing or misreporting the account as not configured.

Performance note:

- Plugin discovery and manifest metadata use short in-process caches to reduce
  bursty startup/reload work.
- Set `OPENCLAW_DISABLE_PLUGIN_DISCOVERY_CACHE=1` or
  `OPENCLAW_DISABLE_PLUGIN_MANIFEST_CACHE=1` to disable these caches.
- Tune cache windows with `OPENCLAW_PLUGIN_DISCOVERY_CACHE_MS` and
  `OPENCLAW_PLUGIN_MANIFEST_CACHE_MS`.

## Discovery & precedence

OpenClaw scans, in order:

1. Config paths

- `plugins.load.paths` (file or directory)

2. Workspace extensions

- `<workspace>/.openclaw/extensions/*.ts`
- `<workspace>/.openclaw/extensions/*/index.ts`

3. 全局扩展

- `~/.openclaw/extensions/*.ts`
- `~/.openclaw/extensions/*/index.ts`

4. 捆绑扩展（随 OpenClaw 一起发布，**默认禁用**）

- `<openclaw>/extensions/*`

捆绑插件必须通过 `plugins.entries.<id>.enabled` 或 `openclaw plugins enable <id>` 显式启用。已安装的插件默认启用，但可以用相同方式禁用。

每个插件必须在其根目录中包含 `openclaw.plugin.json` 文件。如果路径指向文件，则插件根目录是文件的目录，必须包含清单。

- `byteplus`
- `cloudflare-ai-gateway`
- `device-pair`
- `github-copilot`
- `huggingface`
- `kilocode`
- `kimi-coding`
- `minimax`
- `minimax`
- `modelstudio`
- `moonshot`
- `nvidia`
- `ollama`
- `openai`
- `openrouter`
- `phone-control`
- `qianfan`
- `qwen-portal-auth`
- `sglang`
- `synthetic`
- `talk-voice`
- `together`
- `venice`
- `vercel-ai-gateway`
- `vllm`
- `volcengine`
- `xiaomi`
- active memory slot plugin (default slot: `memory-core`)

### 包集合

插件目录可以包含带有 `openclaw.extensions` 的 `package.json`：

```json
{
  "name": "my-pack",
  "openclaw": {
    "extensions": ["./src/safety.ts", "./src/tools.ts"],
    "setupEntry": "./src/setup-entry.ts"
  }
}
```

每个条目成为一个插件。如果包列出多个扩展，插件 id 变为 `name/<fileBase>`。

如果你的插件导入 npm 依赖，请在该目录中安装它们以便 `node_modules` 可用（`npm install` / `pnpm install`）。

### 渠道目录元数据

渠道插件可以通过 `openclaw.channel` 广播新手引导元数据，通过 `openclaw.install` 广播安装提示。这使核心目录保持无数据。

Optional: `openclaw.setupEntry` can point at a lightweight setup-only module.
When OpenClaw needs setup surfaces for a disabled channel plugin, or
when a channel plugin is enabled but still unconfigured, it loads `setupEntry`
instead of the full plugin entry. This keeps startup and setup lighter
when your main plugin entry also wires tools, hooks, or other runtime-only
code.

Optional: `openclaw.startup.deferConfiguredChannelFullLoadUntilAfterListen`
can opt a channel plugin into the same `setupEntry` path during the gateway's
pre-listen startup phase, even when the channel is already configured.

Use this only when `setupEntry` fully covers the startup surface that must exist
before the gateway starts listening. In practice, that means the setup entry
must register every channel-owned capability that startup depends on, such as:

- channel registration itself
- any HTTP routes that must be available before the gateway starts listening
- any gateway methods, tools, or services that must exist during that same window

If your full entry still owns any required startup capability, do not enable
this flag. Keep the plugin on the default behavior and let OpenClaw load the
full entry during startup.

Example:

```json
{
  "name": "@scope/my-channel",
  "openclaw": {
    "extensions": ["./index.ts"],
    "setupEntry": "./setup-entry.ts",
    "startup": {
      "deferConfiguredChannelFullLoadUntilAfterListen": true
    }
  }
}
```

### Channel catalog metadata

Channel plugins can advertise setup/discovery metadata via `openclaw.channel` and
install hints via `openclaw.install`. This keeps the core catalog data-free.

Example:

```json
{
  "name": "@openclaw/nextcloud-talk",
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {
      "id": "nextcloud-talk",
      "label": "Nextcloud Talk",
      "selectionLabel": "Nextcloud Talk (self-hosted)",
      "docsPath": "/channels/nextcloud-talk",
      "docsLabel": "nextcloud-talk",
      "blurb": "Self-hosted chat via Nextcloud Talk webhook bots.",
      "order": 65,
      "aliases": ["nc-talk", "nc"]
    },
    "install": {
      "npmSpec": "@openclaw/nextcloud-talk",
      "localPath": "extensions/nextcloud-talk",
      "defaultChoice": "npm"
    }
  }
}
```

OpenClaw 还可以合并**外部渠道目录**（例如，MPM 注册表导出）。将 JSON 文件放在以下位置之一：

- `~/.openclaw/mpm/plugins.json`
- `~/.openclaw/mpm/catalog.json`
- `~/.openclaw/plugins/catalog.json`

或将 `OPENCLAW_PLUGIN_CATALOG_PATHS`（或 `OPENCLAW_MPM_CATALOG_PATHS`）指向一个或多个 JSON 文件（逗号/分号/`PATH` 分隔）。每个文件应包含 `{ "entries": [ { "name": "@scope/pkg", "openclaw": { "channel": {...}, "install": {...} } } ] }`。

## 插件 ID

默认插件 id：

- 包集合：`package.json` 的 `name`
- 独立文件：文件基本名称（`~/.../voice-call.ts` → `voice-call`）

如果插件导出 `id`，OpenClaw 会使用它，但当它与配置的 id 不匹配时会发出警告。

## 配置

```json5
{
  plugins: {
    enabled: true,
    allow: ["voice-call"],
    deny: ["untrusted-plugin"],
    load: { paths: ["~/Projects/oss/voice-call-extension"] },
    entries: {
      "voice-call": { enabled: true, config: { provider: "twilio" } },
    },
  },
}
```

字段：

- `enabled`：主开关（默认：true）
- `allow`：允许列表（可选）
- `deny`：拒绝列表（可选；deny 优先）
- `load.paths`：额外的插件文件/目录
- `entries.<id>`：每个插件的开关 + 配置

配置更改**需要重启 Gateway 网关**。

验证规则（严格）：

- `entries`、`allow`、`deny` 或 `slots` 中的未知插件 id 是**错误**。
- 未知的 `channels.<id>` 键是**错误**，除非插件清单声明了渠道 id。
- 插件配置使用嵌入在 `openclaw.plugin.json`（`configSchema`）中的 JSON Schema 进行验证。
- 如果插件被禁用，其配置会保留并发出**警告**。

## 插件槽位（独占类别）

某些插件类别是**独占的**（一次只有一个活跃）。使用 `plugins.slots` 选择哪个插件拥有该槽位：

```json5
{
  plugins: {
    slots: {
      memory: "memory-core", // or "none" to disable memory plugins
    },
  },
}
```

如果多个插件声明 `kind: "memory"`，只有选定的那个加载。其他的被禁用并带有诊断信息。

## 控制界面（schema + 标签）

控制界面使用 `config.schema`（JSON Schema + `uiHints`）来渲染更好的表单。

OpenClaw 在运行时根据发现的插件增强 `uiHints`：

- 为 `plugins.entries.<id>` / `.enabled` / `.config` 添加每插件标签
- 在以下位置合并可选的插件提供的配置字段提示：
  `plugins.entries.<id>.config.<field>`

如果你希望插件配置字段显示良好的标签/占位符（并将密钥标记为敏感），请在插件清单中提供 `uiHints` 和 JSON Schema。

示例：

```json
{
  "id": "my-plugin",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "apiKey": { "type": "string" },
      "region": { "type": "string" }
    }
  },
  "uiHints": {
    "apiKey": { "label": "API Key", "sensitive": true },
    "region": { "label": "Region", "placeholder": "us-east-1" }
  }
}
```

## CLI

```bash
openclaw plugins list
openclaw plugins info <id>
openclaw plugins install <path>                 # copy a local file/dir into ~/.openclaw/extensions/<id>
openclaw plugins install ./extensions/voice-call # relative path ok
openclaw plugins install ./plugin.tgz           # install from a local tarball
openclaw plugins install ./plugin.zip           # install from a local zip
openclaw plugins install -l ./extensions/voice-call # link (no copy) for dev
openclaw plugins install @openclaw/voice-call # install from npm
openclaw plugins update <id>
openclaw plugins update --all
openclaw plugins enable <id>
openclaw plugins disable <id>
openclaw plugins doctor
```

`plugins update` 仅适用于在 `plugins.installs` 下跟踪的 npm 安装。

插件也可以注册自己的顶级命令（例如：`openclaw voicecall`）。

## 插件 API（概述）

插件导出以下之一：

- 函数：`(api) => { ... }`
- 对象：`{ id, name, configSchema, register(api) { ... } }`

## 插件钩子

插件可以附带钩子并在运行时注册它们。这让插件可以捆绑事件驱动的自动化，而无需单独安装钩子包。

- `registerTool`
- `registerHook`
- `on(...)` for typed lifecycle hooks
- `registerChannel`
- `registerProvider`
- `registerSpeechProvider`
- `registerMediaUnderstandingProvider`
- `registerWebSearchProvider`
- `registerHttpRoute`
- `registerCommand`
- `registerCli`
- `registerContextEngine`
- `registerService`

In practice, `register(api)` is also where a plugin declares **ownership**.
That ownership should map cleanly to either:

- a vendor surface such as OpenAI, ElevenLabs, or Microsoft
- a feature surface such as Voice Call

Avoid splitting one vendor's capabilities across unrelated plugins unless there
is a strong product reason to do so. The default should be one plugin per
vendor/feature, with core capability contracts separating shared orchestration
from vendor-specific behavior.

## Adding a new capability

When a plugin needs behavior that does not fit the current API, do not bypass
the plugin system with a private reach-in. Add the missing capability.

Recommended sequence:

1. define the core contract
   Decide what shared behavior core should own: policy, fallback, config merge,
   lifecycle, channel-facing semantics, and runtime helper shape.
2. add typed plugin registration/runtime surfaces
   Extend `OpenClawPluginApi` and/or `api.runtime` with the smallest useful
   typed seam.
3. wire core + channel/feature consumers
   Channels and feature plugins should consume the new capability through core,
   not by importing a vendor implementation directly.
4. register vendor implementations
   Vendor plugins then register their backends against the capability.
5. add contract coverage
   Add tests so ownership and registration shape stay explicit over time.

This is how OpenClaw stays opinionated without becoming hardcoded to one
provider's worldview.

### Capability checklist

When you add a new capability, the implementation should usually touch these
surfaces together:

- core contract types in `src/<capability>/types.ts`
- core runner/runtime helper in `src/<capability>/runtime.ts`
- plugin API registration surface in `src/plugins/types.ts`
- plugin registry wiring in `src/plugins/registry.ts`
- plugin runtime exposure in `src/plugins/runtime/*` when feature/channel
  plugins need to consume it
- capture/test helpers in `src/test-utils/plugin-registration.ts`
- ownership/contract assertions in `src/plugins/contracts/registry.ts`
- operator/plugin docs in `docs/`

If one of those surfaces is missing, that is usually a sign the capability is
not fully integrated yet.

### Capability template

Minimal pattern:

```ts
// core contract
export type VideoGenerationProviderPlugin = {
  id: string;
  label: string;
  generateVideo: (req: VideoGenerationRequest) => Promise<VideoGenerationResult>;
};

// plugin API
api.registerVideoGenerationProvider({
  id: "openai",
  label: "OpenAI",
  async generateVideo(req) {
    return await generateOpenAiVideo(req);
  },
});

// shared runtime helper for feature/channel plugins
const clip = await api.runtime.videoGeneration.generateFile({
  prompt: "Show the robot walking through the lab.",
  cfg,
});
```

Contract test pattern:

```ts
expect(findVideoGenerationProviderIdsForPlugin("openai")).toEqual(["openai"]);
```

That keeps the rule simple:

- core owns the capability contract + orchestration
- vendor plugins own vendor implementations
- feature/channel plugins consume runtime helpers
- contract tests keep ownership explicit

Context engine plugins can also register a runtime-owned context manager:

```ts
export default function (api) {
  api.registerContextEngine("lossless-claw", () => ({
    info: { id: "lossless-claw", name: "Lossless Claw", ownsCompaction: true },
    async ingest() {
      return { ingested: true };
    },
    async assemble({ messages }) {
      return { messages, estimatedTokens: 0 };
    },
    async compact() {
      return { ok: true, compacted: false };
    },
  }));
}
```
import { registerPluginHooksFromDir } from "openclaw/plugin-sdk";

export default function register(api) {
  registerPluginHooksFromDir(api, "./hooks");
}
```

注意事项：

- 钩子目录遵循正常的钩子结构（`HOOK.md` + `handler.ts`）。
- 钩子资格规则仍然适用（操作系统/二进制文件/环境/配置要求）。
- 插件管理的钩子在 `openclaw hooks list` 中显示为 `plugin:<id>`。
- 你不能通过 `openclaw hooks` 启用/禁用插件管理的钩子；而是启用/禁用插件。

## 提供商插件（模型认证）

插件可以注册**模型提供商认证**流程，以便用户可以在 OpenClaw 内运行 OAuth 或 API 密钥设置（无需外部脚本）。

```ts
export default function register(api) {
  api.on(
    "before_prompt_build",
    (event, ctx) => {
      return {
        prependSystemContext: "Follow company style guide.",
      };
    },
    { priority: 10 },
  );
}
```

Important hooks for prompt construction:

- `before_model_resolve`: runs before session load (`messages` are not available). Use this to deterministically override `modelOverride` or `providerOverride`.
- `before_prompt_build`: runs after session load (`messages` are available). Use this to shape prompt input.
- `before_agent_start`: legacy compatibility hook. Prefer the two explicit hooks above.

Core-enforced hook policy:

- Operators can disable prompt mutation hooks per plugin via `plugins.entries.<id>.hooks.allowPromptInjection: false`.
- When disabled, OpenClaw blocks `before_prompt_build` and ignores prompt-mutating fields returned from legacy `before_agent_start` while preserving legacy `modelOverride` and `providerOverride`.

`before_prompt_build` result fields:

- `prependContext`: prepends text to the user prompt for this run. Best for turn-specific or dynamic content.
- `systemPrompt`: full system prompt override.
- `prependSystemContext`: prepends text to the current system prompt.
- `appendSystemContext`: appends text to the current system prompt.

Prompt build order in embedded runtime:

1. Apply `prependContext` to the user prompt.
2. Apply `systemPrompt` override when provided.
3. Apply `prependSystemContext + current system prompt + appendSystemContext`.

Merge and precedence notes:

- Hook handlers run by priority (higher first).
- For merged context fields, values are concatenated in execution order.
- `before_prompt_build` values are applied before legacy `before_agent_start` fallback values.

Migration guidance:

- Move static guidance from `prependContext` to `prependSystemContext` (or `appendSystemContext`) so providers can cache stable system-prefix content.
- Keep `prependContext` for per-turn dynamic context that should stay tied to the user message.

## Provider plugins (model auth)

Plugins can register **model providers** so users can run OAuth or API-key
setup inside OpenClaw, surface provider setup in onboarding/model-pickers, and
contribute implicit provider discovery.

Provider plugins are the modular extension seam for model-provider setup. They
are not just "OAuth helpers" anymore.

### Provider plugin lifecycle

A provider plugin can participate in five distinct phases:

1. **Auth**
   `auth[].run(ctx)` performs OAuth, API-key capture, device code, or custom
   setup and returns auth profiles plus optional config patches.
2. **Non-interactive setup**
   `auth[].runNonInteractive(ctx)` handles `openclaw onboard --non-interactive`
   without prompts. Use this when the provider needs custom headless setup
   beyond the built-in simple API-key paths.
3. **Wizard integration**
   `wizard.setup` adds an entry to `openclaw onboard`.
   `wizard.modelPicker` adds a setup entry to the model picker.
4. **Implicit discovery**
   `discovery.run(ctx)` can contribute provider config automatically during
   model resolution/listing.
5. **Post-selection follow-up**
   `onModelSelected(ctx)` runs after a model is chosen. Use this for provider-
   specific work such as downloading a local model.

This is the recommended split because these phases have different lifecycle
requirements:

- auth is interactive and writes credentials/config
- non-interactive setup is flag/env-driven and must not prompt
- wizard metadata is static and UI-facing
- discovery should be safe, quick, and failure-tolerant
- post-select hooks are side effects tied to the chosen model

### Provider auth contract

`auth[].run(ctx)` returns:

- `profiles`: auth profiles to write
- `configPatch`: optional `openclaw.json` changes
- `defaultModel`: optional `provider/model` ref
- `notes`: optional user-facing notes

Core then:

1. writes the returned auth profiles
2. applies auth-profile config wiring
3. merges the config patch
4. optionally applies the default model
5. runs the provider's `onModelSelected` hook when appropriate

That means a provider plugin owns the provider-specific setup logic, while core
owns the generic persistence and config-merge path.

### Provider non-interactive contract

`auth[].runNonInteractive(ctx)` is optional. Implement it when the provider
needs headless setup that cannot be expressed through the built-in generic
API-key flows.

The non-interactive context includes:

- the current and base config
- parsed onboarding CLI options
- runtime logging/error helpers
- agent/workspace dirs so the provider can persist auth into the same scoped
  store used by the rest of onboarding
- `resolveApiKey(...)` to read provider keys from flags, env, or existing auth
  profiles while honoring `--secret-input-mode`
- `toApiKeyCredential(...)` to convert a resolved key into an auth-profile
  credential with the right plaintext vs secret-ref storage

Use this surface for providers such as:

- self-hosted OpenAI-compatible runtimes that need `--custom-base-url` +
  `--custom-model-id`
- provider-specific non-interactive verification or config synthesis

Do not prompt from `runNonInteractive`. Reject missing inputs with actionable
errors instead.

### Provider wizard metadata

Provider auth/onboarding metadata can live in two layers:

- manifest `providerAuthChoices`: cheap labels, grouping, `--auth-choice`
  ids, and simple CLI flag metadata available before runtime load
- runtime `wizard.setup` / `auth[].wizard`: richer behavior that depends on
  loaded provider code

Use manifest metadata for static labels/flags. Use runtime wizard metadata when
setup depends on dynamic auth methods, method fallback, or runtime validation.

`wizard.setup` controls how the provider appears in grouped onboarding:

- `choiceId`: auth-choice value
- `choiceLabel`: option label
- `choiceHint`: short hint
- `groupId`: group bucket id
- `groupLabel`: group label
- `groupHint`: group hint
- `methodId`: auth method to run
- `modelAllowlist`: optional post-auth allowlist policy (`allowedKeys`, `initialSelections`, `message`)

`wizard.modelPicker` controls how a provider appears as a "set this up now"
entry in model selection:

- `label`
- `hint`
- `methodId`

When a provider has multiple auth methods, the wizard can either point at one
explicit method or let OpenClaw synthesize per-method choices.

OpenClaw validates provider wizard metadata when the plugin registers:

- duplicate or blank auth-method ids are rejected
- wizard metadata is ignored when the provider has no auth methods
- invalid `methodId` bindings are downgraded to warnings and fall back to the
  provider's remaining auth methods

### Provider discovery contract

`discovery.run(ctx)` returns one of:

- `{ provider }`
- `{ providers }`
- `null`

Use `{ provider }` for the common case where the plugin owns one provider id.
Use `{ providers }` when a plugin discovers multiple provider entries.

The discovery context includes:

- the current config
- agent/workspace dirs
- process env
- a helper to resolve the provider API key and a discovery-safe API key value

Discovery should be:

- fast
- best-effort
- safe to skip on failure
- careful about side effects

It should not depend on prompts or long-running setup.

### Discovery ordering

Provider discovery runs in ordered phases:

- `simple`
- `profile`
- `paired`
- `late`

Use:

- `simple` for cheap environment-only discovery
- `profile` when discovery depends on auth profiles
- `paired` for providers that need to coordinate with another discovery step
- `late` for expensive or local-network probing

Most self-hosted providers should use `late`.

### Good provider-plugin boundaries

Good fit for provider plugins:

- local/self-hosted providers with custom setup flows
- provider-specific OAuth/device-code login
- implicit discovery of local model servers
- post-selection side effects such as model pulls

Less compelling fit:

- trivial API-key-only providers that differ only by env var, base URL, and one
  default model

Those can still become plugins, but the main modularity payoff comes from
extracting behavior-rich providers first.

Register a provider via `api.registerProvider(...)`. Each provider exposes one
or more auth methods (OAuth, API key, device code, etc.). Those methods can
power:

- `openclaw models auth login --provider <id> [--method <id>]`
- `openclaw onboard`
- model-picker “custom provider” setup entries
- implicit provider discovery during model resolution/listing

示例：

```ts
api.registerProvider({
  id: "acme",
  label: "AcmeAI",
  auth: [
    {
      id: "oauth",
      label: "OAuth",
      kind: "oauth",
      run: async (ctx) => {
        // Run OAuth flow and return auth profiles.
        return {
          profiles: [
            {
              profileId: "acme:default",
              credential: {
                type: "oauth",
                provider: "acme",
                access: "...",
                refresh: "...",
                expires: Date.now() + 3600 * 1000,
              },
            },
          ],
          defaultModel: "acme/opus-1",
        };
      },
    },
  ],
  wizard: {
    setup: {
      choiceId: "acme",
      choiceLabel: "AcmeAI",
      groupId: "acme",
      groupLabel: "AcmeAI",
      methodId: "oauth",
    },
    modelPicker: {
      label: "AcmeAI (custom)",
      hint: "Connect a self-hosted AcmeAI endpoint",
      methodId: "oauth",
    },
  },
  discovery: {
    order: "late",
    run: async () => ({
      provider: {
        baseUrl: "https://acme.example/v1",
        api: "openai-completions",
        apiKey: "${ACME_API_KEY}",
        models: [],
      },
    }),
  },
});
```

注意事项：

- `run` receives a `ProviderAuthContext` with `prompter`, `runtime`,
  `openUrl`, `oauth.createVpsAwareHandlers`, `secretInputMode`, and
  `allowSecretRefPrompt` helpers/state. Onboarding/configure flows can use
  these to honor `--secret-input-mode` or offer env/file/exec secret-ref
  capture, while `openclaw models auth` keeps a tighter prompt surface.
- `runNonInteractive` receives a `ProviderAuthMethodNonInteractiveContext`
  with `opts`, `agentDir`, `resolveApiKey`, and `toApiKeyCredential` helpers
  for headless onboarding.
- Return `configPatch` when you need to add default models or provider config.
- Return `defaultModel` so `--set-default` can update agent defaults.
- `wizard.setup` adds a provider choice to onboarding surfaces such as
  `openclaw onboard` / `openclaw setup --wizard`.
- `wizard.setup.modelAllowlist` lets the provider narrow the follow-up model
  allowlist prompt during onboarding/configure.
- `wizard.modelPicker` adds a “setup this provider” entry to the model picker.
- `deprecatedProfileIds` lets the provider own `openclaw doctor` cleanup for
  retired auth-profile ids.
- `discovery.run` returns either `{ provider }` for the plugin’s own provider id
  or `{ providers }` for multi-provider discovery.
- `discovery.order` controls when the provider runs relative to built-in
  discovery phases: `simple`, `profile`, `paired`, or `late`.
- `onModelSelected` is the post-selection hook for provider-specific follow-up
  work such as pulling a local model.

### 注册消息渠道

插件可以注册**渠道插件**，其行为类似于内置渠道（WhatsApp、Telegram 等）。渠道配置位于 `channels.<id>` 下，由你的渠道插件代码验证。

```ts
const myChannel = {
  id: "acmechat",
  meta: {
    id: "acmechat",
    label: "AcmeChat",
    selectionLabel: "AcmeChat (API)",
    docsPath: "/channels/acmechat",
    blurb: "demo channel plugin.",
    aliases: ["acme"],
  },
  capabilities: { chatTypes: ["direct"] },
  config: {
    listAccountIds: (cfg) => Object.keys(cfg.channels?.acmechat?.accounts ?? {}),
    resolveAccount: (cfg, accountId) =>
      cfg.channels?.acmechat?.accounts?.[accountId ?? "default"] ?? {
        accountId,
      },
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async () => ({ ok: true }),
  },
};

export default function (api) {
  api.registerChannel({ plugin: myChannel });
}
```

注意事项：

- 将配置放在 `channels.<id>` 下（而不是 `plugins.entries`）。
- `meta.label` 用于 CLI/UI 列表中的标签。
- `meta.aliases` 添加用于规范化和 CLI 输入的备用 id。
- `meta.preferOver` 列出当两者都配置时要跳过自动启用的渠道 id。
- `meta.detailLabel` 和 `meta.systemImage` 让 UI 显示更丰富的渠道标签/图标。

### 编写新的消息渠道（分步指南）

当你想要一个**新的聊天界面**（"消息渠道"）而不是模型提供商时使用此方法。
模型提供商文档位于 `/providers/*` 下。

1. 选择 id + 配置结构

`plugin.setupWizard` is best for channels that fit the shared pattern:

- one account picker driven by `plugin.config.listAccountIds`
- optional preflight/prepare step before prompting (for example installer/bootstrap work)
- optional env-shortcut prompt for bundled credential sets (for example paired bot/app tokens)
- one or more credential prompts, with each step either writing through `plugin.setup.applyAccountConfig` or a channel-owned partial patch
- optional non-secret text prompts (for example CLI paths, base URLs, account ids)
- optional channel/group access allowlist prompts resolved by the host
- optional DM allowlist resolution (for example `@username` -> numeric id)
- optional completion note after setup finishes

### Write a new messaging channel (step‑by‑step)

Use this when you want a **new chat surface** (a "messaging channel"), not a model provider.
Model provider docs live under `/providers/*`.

1. Pick an id + config shape

- All channel config lives under `channels.<id>`.
- Prefer `channels.<id>.accounts.<accountId>` for multi‑account setups.

2. Define the channel metadata

- `meta.label`, `meta.selectionLabel`, `meta.docsPath`, `meta.blurb` control CLI/UI lists.
- `meta.docsPath` should point at a docs page like `/channels/<id>`.
- `meta.preferOver` lets a plugin replace another channel (auto-enable prefers it).
- `meta.detailLabel` and `meta.systemImage` are used by UIs for detail text/icons.

3. Implement the required adapters

- `config.listAccountIds` + `config.resolveAccount`
- `capabilities`（聊天类型、媒体、线程等）
- `outbound.deliveryMode` + `outbound.sendText`（用于基本发送）

4. 根据需要添加可选适配器

- `setup`（向导）、`security`（私信策略）、`status`（健康/诊断）
- `gateway`（启动/停止/登录）、`mentions`、`threading`、`streaming`
- `actions`（消息操作）、`commands`（原生命令行为）

5. 在插件中注册渠道

- `api.registerChannel({ plugin })`

最小配置示例：

```json5
{
  channels: {
    acmechat: {
      accounts: {
        default: { token: "ACME_TOKEN", enabled: true },
      },
    },
  },
}
```

最小渠道插件（仅出站）：

```ts
const plugin = {
  id: "acmechat",
  meta: {
    id: "acmechat",
    label: "AcmeChat",
    selectionLabel: "AcmeChat (API)",
    docsPath: "/channels/acmechat",
    blurb: "AcmeChat messaging channel.",
    aliases: ["acme"],
  },
  capabilities: { chatTypes: ["direct"] },
  config: {
    listAccountIds: (cfg) => Object.keys(cfg.channels?.acmechat?.accounts ?? {}),
    resolveAccount: (cfg, accountId) =>
      cfg.channels?.acmechat?.accounts?.[accountId ?? "default"] ?? {
        accountId,
      },
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ text }) => {
      // deliver `text` to your channel here
      return { ok: true };
    },
  },
};

export default function (api) {
  api.registerChannel({ plugin });
}
```

加载插件（扩展目录或 `plugins.load.paths`），重启 Gateway 网关，然后在配置中配置 `channels.<id>`。

### 智能体工具

参见专门指南：[插件智能体工具](/plugins/agent-tools)。

### 注册 Gateway 网关 RPC 方法

```ts
export default function (api) {
  api.registerGatewayMethod("myplugin.status", ({ respond }) => {
    respond(true, { ok: true });
  });
}
```

### 注册 CLI 命令

```ts
export default function (api) {
  api.registerCli(
    ({ program }) => {
      program.command("mycmd").action(() => {
        console.log("Hello");
      });
    },
    { commands: ["mycmd"] },
  );
}
```

### 注册自动回复命令

插件可以注册自定义斜杠命令，**无需调用 AI 智能体**即可执行。这对于切换命令、状态检查或不需要 LLM 处理的快速操作很有用。

```ts
export default function (api) {
  api.registerCommand({
    name: "mystatus",
    description: "Show plugin status",
    handler: (ctx) => ({
      text: `Plugin is running! Channel: ${ctx.channel}`,
    }),
  });
}
```

命令处理程序上下文：

- `senderId`：发送者的 ID（如可用）
- `channel`：发送命令的渠道
- `isAuthorizedSender`：发送者是否是授权用户
- `args`：命令后传递的参数（如果 `acceptsArgs: true`）
- `commandBody`：完整的命令文本
- `config`：当前 OpenClaw 配置

命令选项：

- `name`：命令名称（不带前导 `/`）
- `description`：命令列表中显示的帮助文本
- `acceptsArgs`：命令是否接受参数（默认：false）。如果为 false 且提供了参数，命令不会匹配，消息会传递给其他处理程序
- `requireAuth`：是否需要授权发送者（默认：true）
- `handler`：返回 `{ text: string }` 的函数（可以是异步的）

带授权和参数的示例：

```ts
api.registerCommand({
  name: "setmode",
  description: "Set plugin mode",
  acceptsArgs: true,
  requireAuth: true,
  handler: async (ctx) => {
    const mode = ctx.args?.trim() || "default";
    await saveMode(mode);
    return { text: `Mode set to: ${mode}` };
  },
});
```

注意事项：

- 插件命令在内置命令和 AI 智能体**之前**处理
- 命令全局注册，适用于所有渠道
- 命令名称不区分大小写（`/MyStatus` 匹配 `/mystatus`）
- 命令名称必须以字母开头，只能包含字母、数字、连字符和下划线
- 保留的命令名称（如 `help`、`status`、`reset` 等）不能被插件覆盖
- 跨插件的重复命令注册将失败并显示诊断错误

### 注册后台服务

```ts
export default function (api) {
  api.registerService({
    id: "my-service",
    start: () => api.logger.info("ready"),
    stop: () => api.logger.info("bye"),
  });
}
```

## 命名约定

- Gateway 网关方法：`pluginId.action`（例如：`voicecall.status`）
- 工具：`snake_case`（例如：`voice_call`）
- CLI 命令：kebab 或 camel，但避免与核心命令冲突

## Skills

插件可以在仓库中附带 Skills（`skills/<name>/SKILL.md`）。
使用 `plugins.entries.<id>.enabled`（或其他配置门控）启用它，并确保它存在于你的工作区/托管 Skills 位置。

## 分发（npm）

推荐的打包方式：

- 主包：`openclaw`（本仓库）
- 插件：`@openclaw/*` 下的独立 npm 包（例如：`@openclaw/voice-call`）

发布契约：

- Plugin `package.json` must include `openclaw.extensions` with one or more entry files.
- Optional: `openclaw.setupEntry` may point at a lightweight setup-only entry for disabled or still-unconfigured channel setup.
- Optional: `openclaw.startup.deferConfiguredChannelFullLoadUntilAfterListen` may opt a channel plugin into using `setupEntry` during pre-listen gateway startup, but only when that setup entry completely covers the plugin's startup-critical surface.
- Entry files can be `.js` or `.ts` (jiti loads TS at runtime).
- `openclaw plugins install <npm-spec>` uses `npm pack`, extracts into `~/.openclaw/extensions/<id>/`, and enables it in config.
- Config key stability: scoped packages are normalized to the **unscoped** id for `plugins.entries.*`.

## 示例插件：Voice Call

本仓库包含一个语音通话插件（Twilio 或 log 回退）：

- 源码：`extensions/voice-call`
- Skills：`skills/voice-call`
- CLI：`openclaw voicecall start|status`
- 工具：`voice_call`
- RPC：`voicecall.start`、`voicecall.status`
- 配置（twilio）：`provider: "twilio"` + `twilio.accountSid/authToken/from`（可选 `statusCallbackUrl`、`twimlUrl`）
- 配置（dev）：`provider: "log"`（无网络）

参见 [Voice Call](/plugins/voice-call) 和 `extensions/voice-call/README.md` 了解设置和用法。

## 安全注意事项

插件与 Gateway 网关在同一进程中运行。将它们视为受信任的代码：

- 只安装你信任的插件。
- 优先使用 `plugins.allow` 允许列表。
- 更改后重启 Gateway 网关。

## 测试插件

插件可以（也应该）附带测试：

- 仓库内插件可以在 `src/**` 下保留 Vitest 测试（例如：`src/plugins/voice-call.plugin.test.ts`）。
- 单独发布的插件应运行自己的 CI（lint/构建/测试）并验证 `openclaw.extensions` 指向构建的入口点（`dist/index.js`）。
