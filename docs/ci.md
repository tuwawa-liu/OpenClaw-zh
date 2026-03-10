---
title: CI 流水线
description: OpenClaw CI 流水线的工作方式
summary: "CI 任务图、范围门控和本地命令等效项"
read_when:
  - 需要了解为什么 CI 任务运行了或没有运行
  - 调试失败的 GitHub Actions 检查
---

# CI 流水线

CI 在每次推送到 `main` 和每个拉取请求时运行。它使用智能范围检测，在仅文档或原生代码更改时跳过昂贵的任务。

## 任务概览

| 任务              | 用途                                           | 运行条件                                 |
| ----------------- | ---------------------------------------------- | ---------------------------------------- |
| `docs-scope`      | 检测仅文档更改                                 | 始终                                     |
| `changed-scope`   | 检测哪些区域更改（node/macos/android/windows） | 非文档 PR                                |
| `check`           | TypeScript 类型、lint、格式                    | 推送到 `main`，或包含 Node 相关更改的 PR |
| `check-docs`      | Markdown lint + 断链检查                       | 文档更改                                 |
| `code-analysis`   | LOC 阈值检查（1000 行）                        | 仅 PR                                    |
| `secrets`         | 检测泄露的密钥                                 | 始终                                     |
| `build-artifacts` | 构建 dist 一次，与其他任务共享                 | 非文档，node 更改                        |
| `release-check`   | 验证 npm pack 内容                             | 构建后                                   |
| `checks`          | Node/Bun 测试 + 协议检查                       | 非文档，node 更改                        |
| `checks-windows`  | Windows 专用测试                               | 非文档，windows 相关更改                 |
| `macos`           | Swift lint/构建/测试 + TS 测试                 | 包含 macos 更改的 PR                     |
| `android`         | Gradle 构建 + 测试                             | 非文档，android 更改                     |

## 快速失败顺序

任务经过排序，使廉价检查在昂贵任务运行前失败：

1. `docs-scope` + `code-analysis` + `check`（并行，约 1-2 分钟）
2. `build-artifacts`（依赖上述任务）
3. `checks`、`checks-windows`、`macos`、`android`（依赖构建）

范围逻辑位于 `scripts/ci-changed-scope.mjs`，并在 `src/scripts/ci-changed-scope.test.ts` 中有单元测试覆盖。

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
