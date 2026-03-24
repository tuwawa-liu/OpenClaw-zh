---
title: CI Pipeline
summary: "CI job graph, scope gates, and local command equivalents"
read_when:
  - 需要了解为什么 CI 任务运行了或没有运行
  - 调试失败的 GitHub Actions 检查
---

# CI 流水线

CI 在每次推送到 `main` 和每个拉取请求时运行。它使用智能范围检测，在仅文档或原生代码更改时跳过昂贵的任务。

## 任务概览

| Job               | Purpose                                                                   | When it runs                                     |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| `preflight`       | Docs scope, change scope, key scan, workflow audit, prod dependency audit | Always; node-based audit only on non-doc changes |
| `docs-scope`      | Detect docs-only changes                                                  | Always                                           |
| `changed-scope`   | Detect which areas changed (node/macos/android/windows)                   | Non-doc changes                                  |
| `check`           | TypeScript types, lint, format                                            | Non-docs, node changes                           |
| `check-docs`      | Markdown lint + broken link check                                         | Docs changed                                     |
| `secrets`         | Detect leaked secrets                                                     | Always                                           |
| `build-artifacts` | Build dist once, share with `release-check`                               | Pushes to `main`, node changes                   |
| `release-check`   | Validate npm pack contents                                                | Pushes to `main` after build                     |
| `checks`          | Node tests + protocol check on PRs; Bun compat on push                    | Non-docs, node changes                           |
| `compat-node22`   | Minimum supported Node runtime compatibility                              | Pushes to `main`, node changes                   |
| `checks-windows`  | Windows-specific tests                                                    | Non-docs, windows-relevant changes               |
| `macos`           | Swift lint/build/test + TS tests                                          | PRs with macos changes                           |
| `android`         | Gradle build + tests                                                      | Non-docs, android changes                        |

## 快速失败顺序

任务经过排序，使廉价检查在昂贵任务运行前失败：

1. `docs-scope` + `code-analysis` + `check`（并行，约 1-2 分钟）
2. `build-artifacts`（依赖上述任务）
3. `checks`、`checks-windows`、`macos`、`android`（依赖构建）

Scope logic lives in `scripts/ci-changed-scope.mjs` and is covered by unit tests in `src/scripts/ci-changed-scope.test.ts`.
The same shared scope module also drives the separate `install-smoke` workflow through a narrower `changed-smoke` gate, so Docker/install smoke only runs for install, packaging, and container-relevant changes.

## 运行器

| 运行器                           | 任务                            |
| -------------------------------- | ------------------------------- |
| `blacksmith-16vcpu-ubuntu-2404`  | 大多数 Linux 任务，包括范围检测 |
| `blacksmith-32vcpu-windows-2025` | `checks-windows`                |
| `macos-latest`                   | `macos`、`ios`                  |

## 本地等效命令

```bash
pnpm check          # 类型 + lint + 格式
pnpm test           # vitest 测试
pnpm check:docs     # 文档格式 + lint + 断链
pnpm release:check  # 验证 npm pack
```
