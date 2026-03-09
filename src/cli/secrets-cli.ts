import fs from "node:fs";
import { confirm } from "@clack/prompts";
import type { Command } from "commander";
import { danger } from "../globals.js";
import { t } from "../i18n/index.js";
import { defaultRuntime } from "../runtime.js";
import { runSecretsApply } from "../secrets/apply.js";
import { resolveSecretsAuditExitCode, runSecretsAudit } from "../secrets/audit.js";
import { runSecretsConfigureInteractive } from "../secrets/configure.js";
import { isSecretsApplyPlan, type SecretsApplyPlan } from "../secrets/plan.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { addGatewayClientOptions, callGatewayFromCli, type GatewayRpcOpts } from "./gateway-rpc.js";

type SecretsReloadOptions = GatewayRpcOpts & { json?: boolean };
type SecretsAuditOptions = {
  check?: boolean;
  json?: boolean;
};
type SecretsConfigureOptions = {
  apply?: boolean;
  yes?: boolean;
  planOut?: string;
  providersOnly?: boolean;
  skipProviderSetup?: boolean;
  agent?: string;
  json?: boolean;
};
type SecretsApplyOptions = {
  from: string;
  dryRun?: boolean;
  json?: boolean;
};

function readPlanFile(pathname: string): SecretsApplyPlan {
  const raw = fs.readFileSync(pathname, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isSecretsApplyPlan(parsed)) {
    throw new Error(`Invalid secrets plan file: ${pathname}`);
  }
  return parsed;
}

export function registerSecretsCli(program: Command) {
  const secrets = program
    .command("secrets")
    .description(t("secretsCli.description"))
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/gateway/security", "docs.openclaw.ai/gateway/security")}\n`,
    );

  addGatewayClientOptions(
    secrets
      .command("reload")
      .description(t("secretsCli.reloadDescription"))
      .option("--json", t("secretsCli.jsonOpt"), false),
  ).action(async (opts: SecretsReloadOptions) => {
    try {
      const result = await callGatewayFromCli("secrets.reload", opts, undefined, {
        expectFinal: false,
      });
      if (opts.json) {
        defaultRuntime.log(JSON.stringify(result, null, 2));
        return;
      }
      const warningCount = Number(
        (result as { warningCount?: unknown } | undefined)?.warningCount ?? 0,
      );
      if (Number.isFinite(warningCount) && warningCount > 0) {
        defaultRuntime.log(t("secretsCli.reloadedWithWarnings", { count: String(warningCount) }));
        return;
      }
      defaultRuntime.log(t("secretsCli.reloaded"));
    } catch (err) {
      defaultRuntime.error(danger(String(err)));
      defaultRuntime.exit(1);
    }
  });

  secrets
    .command("audit")
    .description(t("secretsCli.auditDescription"))
    .option("--check", t("secretsCli.auditCheckOpt"), false)
    .option("--json", t("secretsCli.jsonOpt"), false)
    .action(async (opts: SecretsAuditOptions) => {
      try {
        const report = await runSecretsAudit();
        if (opts.json) {
          defaultRuntime.log(JSON.stringify(report, null, 2));
        } else {
          defaultRuntime.log(
            t("secretsCli.auditSummary", {
              status: report.status,
              plaintext: String(report.summary.plaintextCount),
              unresolved: String(report.summary.unresolvedRefCount),
              shadowed: String(report.summary.shadowedRefCount),
              legacy: String(report.summary.legacyResidueCount),
            }),
          );
          if (report.findings.length > 0) {
            for (const finding of report.findings.slice(0, 20)) {
              defaultRuntime.log(
                t("secretsCli.auditFinding", {
                  code: finding.code,
                  file: finding.file,
                  jsonPath: finding.jsonPath,
                  message: finding.message,
                }),
              );
            }
            if (report.findings.length > 20) {
              defaultRuntime.log(
                t("secretsCli.auditMoreFindings", { count: String(report.findings.length - 20) }),
              );
            }
          }
        }
        const exitCode = resolveSecretsAuditExitCode(report, Boolean(opts.check));
        if (exitCode !== 0) {
          defaultRuntime.exit(exitCode);
        }
      } catch (err) {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(2);
      }
    });

  secrets
    .command("configure")
    .description(t("secretsCli.configureDescription"))
    .option("--apply", t("secretsCli.configureApplyOpt"), false)
    .option("--yes", t("secretsCli.configureYesOpt"), false)
    .option("--providers-only", t("secretsCli.configureProvidersOnlyOpt"), false)
    .option("--skip-provider-setup", t("secretsCli.configureSkipProviderSetupOpt"), false)
    .option("--agent <id>", t("secretsCli.configureAgentOpt"))
    .option("--plan-out <path>", t("secretsCli.configurePlanOutOpt"))
    .option("--json", t("secretsCli.jsonOpt"), false)
    .action(async (opts: SecretsConfigureOptions) => {
      try {
        const configured = await runSecretsConfigureInteractive({
          providersOnly: Boolean(opts.providersOnly),
          skipProviderSetup: Boolean(opts.skipProviderSetup),
          agentId: typeof opts.agent === "string" ? opts.agent : undefined,
        });
        if (opts.planOut) {
          fs.writeFileSync(opts.planOut, `${JSON.stringify(configured.plan, null, 2)}\n`, "utf8");
        }
        if (opts.json) {
          defaultRuntime.log(
            JSON.stringify(
              {
                plan: configured.plan,
                preflight: configured.preflight,
              },
              null,
              2,
            ),
          );
        } else {
          defaultRuntime.log(
            t("secretsCli.preflightSummary", {
              changed: String(configured.preflight.changed),
              files: String(configured.preflight.changedFiles.length),
              warnings: String(configured.preflight.warningCount),
            }),
          );
          if (configured.preflight.warningCount > 0) {
            for (const warning of configured.preflight.warnings) {
              defaultRuntime.log(t("secretsCli.preflightWarning", { warning }));
            }
          }
          const providerUpserts = Object.keys(configured.plan.providerUpserts ?? {}).length;
          const providerDeletes = configured.plan.providerDeletes?.length ?? 0;
          defaultRuntime.log(
            t("secretsCli.planSummary", {
              targets: String(configured.plan.targets.length),
              providerUpserts: String(providerUpserts),
              providerDeletes: String(providerDeletes),
            }),
          );
          if (opts.planOut) {
            defaultRuntime.log(t("secretsCli.planWrittenTo", { path: opts.planOut }));
          }
        }

        let shouldApply = Boolean(opts.apply);
        if (!shouldApply && !opts.json) {
          const approved = await confirm({
            message: t("secretsCli.applyPlanNow"),
            initialValue: true,
          });
          if (typeof approved === "boolean") {
            shouldApply = approved;
          }
        }
        if (shouldApply) {
          const needsIrreversiblePrompt = Boolean(opts.apply);
          if (needsIrreversiblePrompt && !opts.yes && !opts.json) {
            const confirmed = await confirm({
              message: t("secretsCli.migrationOneWay"),
              initialValue: true,
            });
            if (confirmed !== true) {
              defaultRuntime.log(t("secretsCli.applyCancelled"));
              return;
            }
          }
          const result = await runSecretsApply({
            plan: configured.plan,
            write: true,
          });
          if (opts.json) {
            defaultRuntime.log(JSON.stringify(result, null, 2));
            return;
          }
          defaultRuntime.log(
            result.changed
              ? t("secretsCli.secretsApplied", { count: String(result.changedFiles.length) })
              : t("secretsCli.secretsNoChanges"),
          );
        }
      } catch (err) {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(1);
      }
    });

  secrets
    .command("apply")
    .description(t("secretsCli.applyDescription"))
    .requiredOption("--from <path>", t("secretsCli.applyFromOpt"))
    .option("--dry-run", t("secretsCli.applyDryRunOpt"), false)
    .option("--json", t("secretsCli.jsonOpt"), false)
    .action(async (opts: SecretsApplyOptions) => {
      try {
        const plan = readPlanFile(opts.from);
        const result = await runSecretsApply({
          plan,
          write: !opts.dryRun,
        });
        if (opts.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
          return;
        }
        if (opts.dryRun) {
          defaultRuntime.log(
            result.changed
              ? t("secretsCli.dryRunChanged", { count: String(result.changedFiles.length) })
              : t("secretsCli.dryRunNoChanges"),
          );
          return;
        }
        defaultRuntime.log(
          result.changed
            ? t("secretsCli.secretsApplied", { count: String(result.changedFiles.length) })
            : t("secretsCli.secretsNoChanges"),
        );
      } catch (err) {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(1);
      }
    });
}
