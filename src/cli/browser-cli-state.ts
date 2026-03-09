import type { Command } from "commander";
import { danger } from "../globals.js";
import { t } from "../i18n/index.js";
import { defaultRuntime } from "../runtime.js";
import { parseBooleanValue } from "../utils/boolean.js";
import { runBrowserResizeWithOutput } from "./browser-cli-resize.js";
import { callBrowserRequest, type BrowserParentOpts } from "./browser-cli-shared.js";
import { registerBrowserCookiesAndStorageCommands } from "./browser-cli-state.cookies-storage.js";
import { runCommandWithRuntime } from "./cli-utils.js";

function parseOnOff(raw: string): boolean | null {
  const parsed = parseBooleanValue(raw);
  return parsed === undefined ? null : parsed;
}

function runBrowserCommand(action: () => Promise<void>) {
  return runCommandWithRuntime(defaultRuntime, action, (err) => {
    defaultRuntime.error(danger(String(err)));
    defaultRuntime.exit(1);
  });
}

async function runBrowserSetRequest(params: {
  parent: BrowserParentOpts;
  path: string;
  body: Record<string, unknown>;
  successMessage: string;
}) {
  await runBrowserCommand(async () => {
    const profile = params.parent?.browserProfile;
    const result = await callBrowserRequest(
      params.parent,
      {
        method: "POST",
        path: params.path,
        query: profile ? { profile } : undefined,
        body: params.body,
      },
      { timeoutMs: 20000 },
    );
    if (params.parent?.json) {
      defaultRuntime.log(JSON.stringify(result, null, 2));
      return;
    }
    defaultRuntime.log(params.successMessage);
  });
}

export function registerBrowserStateCommands(
  browser: Command,
  parentOpts: (cmd: Command) => BrowserParentOpts,
) {
  registerBrowserCookiesAndStorageCommands(browser, parentOpts);

  const set = browser.command("set").description(t("browserStateCli.setDescription"));

  set
    .command("viewport")
    .description(t("browserStateCli.viewportDescription"))
    .argument("<width>", t("browserStateCli.viewportWidthArg"), (v: string) => Number(v))
    .argument("<height>", t("browserStateCli.viewportHeightArg"), (v: string) => Number(v))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (width: number, height: number, opts, cmd) => {
      const parent = parentOpts(cmd);
      const profile = parent?.browserProfile;
      await runBrowserCommand(async () => {
        await runBrowserResizeWithOutput({
          parent,
          profile,
          width,
          height,
          targetId: opts.targetId,
          timeoutMs: 20000,
          successMessage: t("browserState.viewportSet", {
            width: String(width),
            height: String(height),
          }),
        });
      });
    });

  set
    .command("offline")
    .description(t("browserStateCli.offlineDescription"))
    .argument("<on|off>", t("browserStateCli.onOffArg"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (value: string, opts, cmd) => {
      const parent = parentOpts(cmd);
      const offline = parseOnOff(value);
      if (offline === null) {
        defaultRuntime.error(danger("Expected on|off"));
        defaultRuntime.exit(1);
        return;
      }
      await runBrowserSetRequest({
        parent,
        path: "/set/offline",
        body: {
          offline,
          targetId: opts.targetId?.trim() || undefined,
        },
        successMessage: t("browserState.offline", { offline: String(offline) }),
      });
    });

  set
    .command("headers")
    .description(t("browserStateCli.headersDescription"))
    .argument("[headersJson]", t("browserStateCli.headersJsonArg"))
    .option("--headers-json <json>", t("browserStateCli.headersJsonOpt"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (headersJson: string | undefined, opts, cmd) => {
      const parent = parentOpts(cmd);
      await runBrowserCommand(async () => {
        const headersJsonValue =
          (typeof opts.headersJson === "string" && opts.headersJson.trim()) ||
          (headersJson?.trim() ? headersJson.trim() : undefined);
        if (!headersJsonValue) {
          throw new Error("Missing headers JSON (pass --headers-json or positional JSON argument)");
        }
        const parsed = JSON.parse(String(headersJsonValue)) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Headers JSON must be a JSON object");
        }
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === "string") {
            headers[k] = v;
          }
        }
        const profile = parent?.browserProfile;
        const result = await callBrowserRequest(
          parent,
          {
            method: "POST",
            path: "/set/headers",
            query: profile ? { profile } : undefined,
            body: {
              headers,
              targetId: opts.targetId?.trim() || undefined,
            },
          },
          { timeoutMs: 20000 },
        );
        if (parent?.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
          return;
        }
        defaultRuntime.log(t("browserState.headersSet"));
      });
    });

  set
    .command("credentials")
    .description(t("browserStateCli.credentialsDescription"))
    .option("--clear", t("browserStateCli.clearCredentialsOpt"), false)
    .argument("[username]", t("browserStateCli.usernameArg"))
    .argument("[password]", t("browserStateCli.passwordArg"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (username: string | undefined, password: string | undefined, opts, cmd) => {
      const parent = parentOpts(cmd);
      await runBrowserSetRequest({
        parent,
        path: "/set/credentials",
        body: {
          username: username?.trim() || undefined,
          password,
          clear: Boolean(opts.clear),
          targetId: opts.targetId?.trim() || undefined,
        },
        successMessage: opts.clear
          ? t("browserState.credentialsCleared")
          : t("browserState.credentialsSet"),
      });
    });

  set
    .command("geo")
    .description(t("browserStateCli.geoDescription"))
    .option("--clear", t("browserStateCli.clearGeoOpt"), false)
    .argument("[latitude]", t("browserStateCli.latitudeArg"), (v: string) => Number(v))
    .argument("[longitude]", t("browserStateCli.longitudeArg"), (v: string) => Number(v))
    .option("--accuracy <m>", t("browserStateCli.accuracyOpt"), (v: string) => Number(v))
    .option("--origin <origin>", t("browserStateCli.originOpt"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (latitude: number | undefined, longitude: number | undefined, opts, cmd) => {
      const parent = parentOpts(cmd);
      await runBrowserSetRequest({
        parent,
        path: "/set/geolocation",
        body: {
          latitude: Number.isFinite(latitude) ? latitude : undefined,
          longitude: Number.isFinite(longitude) ? longitude : undefined,
          accuracy: Number.isFinite(opts.accuracy) ? opts.accuracy : undefined,
          origin: opts.origin?.trim() || undefined,
          clear: Boolean(opts.clear),
          targetId: opts.targetId?.trim() || undefined,
        },
        successMessage: opts.clear
          ? t("browserState.geolocationCleared")
          : t("browserState.geolocationSet"),
      });
    });

  set
    .command("media")
    .description(t("browserStateCli.mediaDescription"))
    .argument("<dark|light|none>", t("browserStateCli.darkLightNoneArg"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (value: string, opts, cmd) => {
      const parent = parentOpts(cmd);
      const v = value.trim().toLowerCase();
      const colorScheme =
        v === "dark" ? "dark" : v === "light" ? "light" : v === "none" ? "none" : null;
      if (!colorScheme) {
        defaultRuntime.error(danger("Expected dark|light|none"));
        defaultRuntime.exit(1);
        return;
      }
      await runBrowserSetRequest({
        parent,
        path: "/set/media",
        body: {
          colorScheme,
          targetId: opts.targetId?.trim() || undefined,
        },
        successMessage: t("browserState.mediaColorScheme", { colorScheme }),
      });
    });

  set
    .command("timezone")
    .description(t("browserStateCli.timezoneDescription"))
    .argument("<timezoneId>", t("browserStateCli.timezoneIdArg"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (timezoneId: string, opts, cmd) => {
      const parent = parentOpts(cmd);
      await runBrowserSetRequest({
        parent,
        path: "/set/timezone",
        body: {
          timezoneId,
          targetId: opts.targetId?.trim() || undefined,
        },
        successMessage: t("browserState.timezone", { timezoneId }),
      });
    });

  set
    .command("locale")
    .description(t("browserStateCli.localeDescription"))
    .argument("<locale>", t("browserStateCli.localeArg"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (locale: string, opts, cmd) => {
      const parent = parentOpts(cmd);
      await runBrowserSetRequest({
        parent,
        path: "/set/locale",
        body: {
          locale,
          targetId: opts.targetId?.trim() || undefined,
        },
        successMessage: t("browserState.locale", { locale }),
      });
    });

  set
    .command("device")
    .description(t("browserStateCli.deviceDescription"))
    .argument("<name>", t("browserStateCli.deviceNameArg"))
    .option("--target-id <id>", t("browserCli.targetIdOpt"))
    .action(async (name: string, opts, cmd) => {
      const parent = parentOpts(cmd);
      await runBrowserSetRequest({
        parent,
        path: "/set/device",
        body: {
          name,
          targetId: opts.targetId?.trim() || undefined,
        },
        successMessage: t("browserState.device", { name }),
      });
    });
}
