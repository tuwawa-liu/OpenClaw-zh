---
read_when:
  - 运行或修复测试
summary: 如何在本地运行测试（vitest）以及何时使用 force/coverage 模式
title: 测试
x-i18n:
  generated_at: "2026-02-03T10:09:52Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: be7b751fb81c8c94b1293624bdca6582e60a26084960d1df9558061969502e6f
  source_path: reference/test.md
  workflow: 15
---

# 测试

- 完整测试套件（测试集、实时测试、Docker）：[测试](/help/testing)

- `pnpm test:force`: Kills any lingering gateway process holding the default control port, then runs the full Vitest suite with an isolated gateway port so server tests don’t collide with a running instance. Use this when a prior gateway run left port 18789 occupied.
- `pnpm test:coverage`: Runs the unit suite with V8 coverage (via `vitest.unit.config.ts`). Global thresholds are 70% lines/branches/functions/statements. Coverage excludes integration-heavy entrypoints (CLI wiring, gateway/telegram bridges, webchat static server) to keep the target focused on unit-testable logic.
- `pnpm test:coverage:changed`: Runs unit coverage only for files changed since `origin/main`.
- `pnpm test:changed`: runs the wrapper with `--changed origin/main`. The base Vitest config treats the wrapper manifests/config files as `forceRerunTriggers` so scheduler changes still rerun broadly when needed.
- `pnpm test`: runs the full wrapper. It keeps only a small behavioral override manifest in git, then uses a checked-in timing snapshot to peel the heaviest measured unit files into dedicated lanes.
- Unit files default to `threads` in the wrapper; keep fork-only exceptions documented in `test/fixtures/test-parallel.behavior.json`.
- `pnpm test:channels` now defaults to `threads` via `vitest.channels.config.ts`; the March 22, 2026 direct full-suite control run passed clean without channel-specific fork exceptions.
- `pnpm test:extensions` runs through the wrapper and keeps documented extension fork-only exceptions in `test/fixtures/test-parallel.behavior.json`; the shared extension lane still defaults to `threads`.
- `pnpm test:extensions`: runs extension/plugin suites.
- `pnpm test:perf:imports`: enables Vitest import-duration + import-breakdown reporting for the wrapper.
- `pnpm test:perf:imports:changed`: same import profiling, but only for files changed since `origin/main`.
- `pnpm test:perf:profile:main`: writes a CPU profile for the Vitest main thread (`.artifacts/vitest-main-profile`).
- `pnpm test:perf:profile:runner`: writes CPU + heap profiles for the unit runner (`.artifacts/vitest-runner-profile`).
- `pnpm test:perf:update-timings`: refreshes the checked-in slow-file timing snapshot used by `scripts/test-parallel.mjs`.
- Gateway integration: opt-in via `OPENCLAW_TEST_INCLUDE_GATEWAY=1 pnpm test` or `pnpm test:gateway`.
- `pnpm test:e2e`: Runs gateway end-to-end smoke tests (multi-instance WS/HTTP/node pairing). Defaults to `forks` + adaptive workers in `vitest.e2e.config.ts`; tune with `OPENCLAW_E2E_WORKERS=<n>` and set `OPENCLAW_E2E_VERBOSE=1` for verbose logs.
- `pnpm test:live`: Runs provider live tests (minimax/zai). Requires API keys and `LIVE=1` (or provider-specific `*_LIVE_TEST=1`) to unskip.

## 模型延迟基准测试（本地密钥）

脚本：[`scripts/bench-model.ts`](https://github.com/openclaw/openclaw/blob/main/scripts/bench-model.ts)

- `pnpm check`
- `pnpm build`
- `pnpm test`
- `pnpm check:docs`

If `pnpm test` flakes on a loaded host, rerun once before treating it as a regression, then isolate with `pnpm vitest run <path/to/test>`. For memory-constrained hosts, use:

- `OPENCLAW_TEST_PROFILE=low OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test`
- `OPENCLAW_VITEST_FS_MODULE_CACHE=0 pnpm test:changed`

## Model latency bench (local keys)

Script: [`scripts/bench-model.ts`](https://github.com/openclaw/openclaw/blob/main/scripts/bench-model.ts)

Usage:

- `source ~/.profile && pnpm tsx scripts/bench-model.ts --runs 10`
- 可选环境变量：`MINIMAX_API_KEY`、`MINIMAX_BASE_URL`、`MINIMAX_MODEL`、`ANTHROPIC_API_KEY`
- 默认提示词："Reply with a single word: ok. No punctuation or extra text."

上次运行（2025-12-31，20 次）：

- minimax 中位数 1279ms（最小 1114，最大 2431）
- opus 中位数 2454ms（最小 1224，最大 3170）

## 新手引导 E2E（Docker）

Docker 是可选的；这仅用于容器化的新手引导冒烟测试。

在干净的 Linux 容器中完整的冷启动流程：

```bash
scripts/e2e/onboard-docker.sh
```

此脚本通过伪终端驱动交互式向导，验证配置/工作区/会话文件，然后启动 Gateway 网关并运行 `openclaw health`。

## QR 导入冒烟测试（Docker）

确保 `qrcode-terminal` 在 Docker 中的 Node 22+ 下加载：

```bash
pnpm test:docker:qr
```
