import type { Command } from "commander";
import { danger } from "../globals.js";
import { t } from "../i18n/index.js";
import { defaultRuntime } from "../runtime.js";
import { callBrowserRequest, type BrowserParentOpts } from "./browser-cli-shared.js";
import { inheritOptionFromParent } from "./command-options.js";

function resolveUrl(opts: { url?: string }, command: Command): string | undefined {
  if (typeof opts.url === "string" && opts.url.trim()) {
    return opts.url.trim();
  }
  const inherited = inheritOptionFromParent<string>(command, "url");
  if (typeof inherited === "string" && inherited.trim()) {
    return inherited.trim();
  }
  return undefined;
}

function resolveTargetId(rawTargetId: unknown, command: Command): string | undefined {
  const local = typeof rawTargetId === "string" ? rawTargetId.trim() : "";
  if (local) {
    return local;
  }
  const inherited = inheritOptionFromParent<string>(command, "targetId");
  if (typeof inherited !== "string") {
    return undefined;
  }
  const trimmed = inherited.trim();
  return trimmed ? trimmed : undefined;
}

async function runMutationRequest(params: {
  parent: BrowserParentOpts;
  request: Parameters<typeof callBrowserRequest>[1];
  successMessage: string;
}) {
  try {
    const result = await callBrowserRequest(params.parent, params.request, { timeoutMs: 20000 });
    if (params.parent?.json) {
      defaultRuntime.log(JSON.stringify(result, null, 2));
      return;
    }
    defaultRuntime.log(params.successMessage);
  } catch (err) {
    defaultRuntime.error(danger(String(err)));
    defaultRuntime.exit(1);
  }
}

export function registerBrowserCookiesAndStorageCommands(
  browser: Command,
  parentOpts: (cmd: Command) => BrowserParentOpts,
) {
  const cookies = browser.command("cookies").description(t("browserCookiesCli.cookiesDescription"));

  cookies.option("--target-id <id>", t("browserCli.targetIdOpt")).action(async (opts, cmd) => {
    const parent = parentOpts(cmd);
    const profile = parent?.browserProfile;
    const targetId = resolveTargetId(opts.targetId, cmd);
    try {
      const result = await callBrowserRequest<{ cookies?: unknown[] }>(
        parent,
        {
          method: "GET",
          path: "/cookies",
          query: {
            targetId,
            profile,
          },
        },
        { timeoutMs: 20000 },
      );
      if (parent?.json) {
        defaultRuntime.log(JSON.stringify(result, null, 2));
        return;
      }
      defaultRuntime.log(JSON.stringify(result.cookies ?? [], null, 2));
    } catch (err) {
      defaultRuntime.error(danger(String(err)));
      defaultRuntime.exit(1);
    }
  });

  cookies
    .command("set")
    .description(t("browserCookiesCli.setDescription"))
    .argument("<name>", t("browserCookiesCli.nameArg"))
    .argument("<value>", t("browserCookiesCli.valueArg"))
    .option("--url <url>", t("browserCookiesCli.urlOpt"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (name: string, value: string, opts, cmd) => {
      const parent = parentOpts(cmd);
      const profile = parent?.browserProfile;
      const targetId = resolveTargetId(opts.targetId, cmd);
      const url = resolveUrl(opts, cmd);
      if (!url) {
        defaultRuntime.error(danger("Missing required --url option for cookies set"));
        defaultRuntime.exit(1);
        return;
      }
      await runMutationRequest({
        parent,
        request: {
          method: "POST",
          path: "/cookies/set",
          query: profile ? { profile } : undefined,
          body: {
            targetId,
            cookie: { name, value, url },
          },
        },
        successMessage: t("browserCookies.cookieSet", { name }),
      });
    });

  cookies
    .command("clear")
    .description(t("browserCookiesCli.clearDescription"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (opts, cmd) => {
      const parent = parentOpts(cmd);
      const profile = parent?.browserProfile;
      const targetId = resolveTargetId(opts.targetId, cmd);
      await runMutationRequest({
        parent,
        request: {
          method: "POST",
          path: "/cookies/clear",
          query: profile ? { profile } : undefined,
          body: {
            targetId,
          },
        },
        successMessage: t("browserCookies.cookiesCleared"),
      });
    });

  const storage = browser.command("storage").description(t("browserCookiesCli.storageDescription"));

  function registerStorageKind(kind: "local" | "session") {
    const cmd = storage
      .command(kind)
      .description(t("browserCookiesCli.storageKindDescription", { kind }));

    cmd
      .command("get")
      .description(t("browserCookiesCli.storageGetDescription", { kind }))
      .argument("[key]", t("browserCookiesCli.keyArg"))
      .option("--target-id <id>", t("browserCli.targetIdOpt"))
      .action(async (key: string | undefined, opts, cmd2) => {
        const parent = parentOpts(cmd2);
        const profile = parent?.browserProfile;
        const targetId = resolveTargetId(opts.targetId, cmd2);
        try {
          const result = await callBrowserRequest<{ values?: Record<string, string> }>(
            parent,
            {
              method: "GET",
              path: `/storage/${kind}`,
              query: {
                key: key?.trim() || undefined,
                targetId,
                profile,
              },
            },
            { timeoutMs: 20000 },
          );
          if (parent?.json) {
            defaultRuntime.log(JSON.stringify(result, null, 2));
            return;
          }
          defaultRuntime.log(JSON.stringify(result.values ?? {}, null, 2));
        } catch (err) {
          defaultRuntime.error(danger(String(err)));
          defaultRuntime.exit(1);
        }
      });

    cmd
      .command("set")
      .description(t("browserCookiesCli.storageSetDescription", { kind }))
      .argument("<key>", t("browserCookiesCli.storageKeyArg"))
      .argument("<value>", t("browserCookiesCli.storageValueArg"))
      .option("--target-id <id>", t("browserCli.targetIdOpt"))
      .action(async (key: string, value: string, opts, cmd2) => {
        const parent = parentOpts(cmd2);
        const profile = parent?.browserProfile;
        const targetId = resolveTargetId(opts.targetId, cmd2);
        await runMutationRequest({
          parent,
          request: {
            method: "POST",
            path: `/storage/${kind}/set`,
            query: profile ? { profile } : undefined,
            body: {
              key,
              value,
              targetId,
            },
          },
          successMessage: t("browserCookies.storageSet", { kind, key }),
        });
      });

    cmd
      .command("clear")
      .description(t("browserCookiesCli.storageClearDescription", { kind }))
      .option("--target-id <id>", t("browserCli.targetIdOpt"))
      .action(async (opts, cmd2) => {
        const parent = parentOpts(cmd2);
        const profile = parent?.browserProfile;
        const targetId = resolveTargetId(opts.targetId, cmd2);
        await runMutationRequest({
          parent,
          request: {
            method: "POST",
            path: `/storage/${kind}/clear`,
            query: profile ? { profile } : undefined,
            body: {
              targetId,
            },
          },
          successMessage: t("browserCookies.storageCleared", { kind }),
        });
      });
  }

  registerStorageKind("local");
  registerStorageKind("session");
}
