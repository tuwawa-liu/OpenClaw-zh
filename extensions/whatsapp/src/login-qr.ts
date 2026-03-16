import { randomUUID } from "node:crypto";
import { DisconnectReason } from "@whiskeysockets/baileys";
import { loadConfig } from "../../../src/config/config.js";
import { danger, info, success } from "../../../src/globals.js";
import { logInfo } from "../../../src/logger.js";
import { defaultRuntime, type RuntimeEnv } from "../../../src/runtime.js";
import { resolveWhatsAppAccount } from "./accounts.js";
import { renderQrPngBase64 } from "./qr-image.js";
import {
  createWaSocket,
  formatError,
  getStatusCode,
  logoutWeb,
  readWebSelfId,
  waitForCredsSaveQueueWithTimeout,
  waitForWaConnection,
  webAuthExists,
} from "./session.js";

type WaSocket = Awaited<ReturnType<typeof createWaSocket>>;

type ActiveLogin = {
  accountId: string;
  authDir: string;
  isLegacyAuthDir: boolean;
  id: string;
  sock: WaSocket;
  startedAt: number;
  qr?: string;
  qrDataUrl?: string;
  connected: boolean;
  error?: string;
  errorStatus?: number;
  waitPromise: Promise<void>;
  restartAttempted: boolean;
  verbose: boolean;
};

const ACTIVE_LOGIN_TTL_MS = 3 * 60_000;
const activeLogins = new Map<string, ActiveLogin>();

function closeSocket(sock: WaSocket) {
  try {
    sock.ws?.close();
  } catch {
    // ignore
  }
}

async function resetActiveLogin(accountId: string, reason?: string) {
  const login = activeLogins.get(accountId);
  if (login) {
    closeSocket(login.sock);
    activeLogins.delete(accountId);
  }
  if (reason) {
    logInfo(reason);
  }
}

function isLoginFresh(login: ActiveLogin) {
  return Date.now() - login.startedAt < ACTIVE_LOGIN_TTL_MS;
}

function attachLoginWaiter(accountId: string, login: ActiveLogin) {
  login.waitPromise = waitForWaConnection(login.sock)
    .then(() => {
      const current = activeLogins.get(accountId);
      if (current?.id === login.id) {
        current.connected = true;
      }
    })
    .catch((err) => {
      const current = activeLogins.get(accountId);
      if (current?.id !== login.id) {
        return;
      }
      current.error = formatError(err);
      current.errorStatus = getStatusCode(err);
    });
}

async function restartLoginSocket(login: ActiveLogin, runtime: RuntimeEnv) {
  if (login.restartAttempted) {
    return false;
  }
  login.restartAttempted = true;
  runtime.log(info("WhatsApp 配对后要求重启（代码 515）；正在重试连接…"));
  closeSocket(login.sock);
  await waitForCredsSaveQueueWithTimeout(login.authDir);
  try {
    const sock = await createWaSocket(false, login.verbose, {
      authDir: login.authDir,
    });
    login.sock = sock;
    login.connected = false;
    login.error = undefined;
    login.errorStatus = undefined;
    attachLoginWaiter(login.accountId, login);
    return true;
  } catch (err) {
    login.error = formatError(err);
    login.errorStatus = getStatusCode(err);
    return false;
  }
}

export async function startWebLoginWithQr(
  opts: {
    verbose?: boolean;
    timeoutMs?: number;
    force?: boolean;
    accountId?: string;
    runtime?: RuntimeEnv;
  } = {},
): Promise<{ qrDataUrl?: string; message: string }> {
  const runtime = opts.runtime ?? defaultRuntime;
  const cfg = loadConfig();
  const account = resolveWhatsAppAccount({ cfg, accountId: opts.accountId });
  const hasWeb = await webAuthExists(account.authDir);
  const selfId = readWebSelfId(account.authDir);
  if (hasWeb && !opts.force) {
    const who = selfId.e164 ?? selfId.jid ?? "unknown";
    return {
      message: `WhatsApp 已关联（${who}）。如需重新关联，请说“relink”。`,
    };
  }

  const existing = activeLogins.get(account.accountId);
  if (existing && isLoginFresh(existing) && existing.qrDataUrl) {
    return {
      qrDataUrl: existing.qrDataUrl,
      message: "QR 已激活。在 WhatsApp → 已关联设备 中扫描。",
    };
  }

  await resetActiveLogin(account.accountId);

  let resolveQr: ((qr: string) => void) | null = null;
  let rejectQr: ((err: Error) => void) | null = null;
  const qrPromise = new Promise<string>((resolve, reject) => {
    resolveQr = resolve;
    rejectQr = reject;
  });

  const qrTimer = setTimeout(
    () => {
      rejectQr?.(new Error("Timed out waiting for WhatsApp QR"));
    },
    Math.max(opts.timeoutMs ?? 30_000, 5000),
  );

  let sock: WaSocket;
  let pendingQr: string | null = null;
  try {
    sock = await createWaSocket(false, Boolean(opts.verbose), {
      authDir: account.authDir,
      onQr: (qr: string) => {
        if (pendingQr) {
          return;
        }
        pendingQr = qr;
        const current = activeLogins.get(account.accountId);
        if (current && !current.qr) {
          current.qr = qr;
        }
        clearTimeout(qrTimer);
        runtime.log(info("WhatsApp QR 码已收到。"));
        resolveQr?.(qr);
      },
    });
  } catch (err) {
    clearTimeout(qrTimer);
    await resetActiveLogin(account.accountId);
    return {
      message: `启动 WhatsApp 登录失败：${String(err)}`,
    };
  }
  const login: ActiveLogin = {
    accountId: account.accountId,
    authDir: account.authDir,
    isLegacyAuthDir: account.isLegacyAuthDir,
    id: randomUUID(),
    sock,
    startedAt: Date.now(),
    connected: false,
    waitPromise: Promise.resolve(),
    restartAttempted: false,
    verbose: Boolean(opts.verbose),
  };
  activeLogins.set(account.accountId, login);
  if (pendingQr && !login.qr) {
    login.qr = pendingQr;
  }
  attachLoginWaiter(account.accountId, login);

  let qr: string;
  try {
    qr = await qrPromise;
  } catch (err) {
    clearTimeout(qrTimer);
    await resetActiveLogin(account.accountId);
    return {
      message: `获取 QR 码失败：${String(err)}`,
    };
  }

  const base64 = await renderQrPngBase64(qr);
  login.qrDataUrl = `data:image/png;base64,${base64}`;
  return {
    qrDataUrl: login.qrDataUrl,
    message: "在 WhatsApp → 已关联设备 中扫描此 QR 码。",
  };
}

export async function waitForWebLogin(
  opts: { timeoutMs?: number; runtime?: RuntimeEnv; accountId?: string } = {},
): Promise<{ connected: boolean; message: string }> {
  const runtime = opts.runtime ?? defaultRuntime;
  const cfg = loadConfig();
  const account = resolveWhatsAppAccount({ cfg, accountId: opts.accountId });
  const activeLogin = activeLogins.get(account.accountId);
  if (!activeLogin) {
    return {
      connected: false,
      message: "没有正在进行的 WhatsApp 登录。",
    };
  }

  const login = activeLogin;
  if (!isLoginFresh(login)) {
    await resetActiveLogin(account.accountId);
    return {
      connected: false,
      message: "登录 QR 码已过期。请让我生成新的。",
    };
  }
  const timeoutMs = Math.max(opts.timeoutMs ?? 120_000, 1000);
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return {
        connected: false,
        message: "仍在等待扫描 QR 码。扫完后告诉我。",
      };
    }
    const timeout = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), remaining),
    );
    const result = await Promise.race([login.waitPromise.then(() => "done"), timeout]);

    if (result === "timeout") {
      return {
        connected: false,
        message: "仍在等待扫描 QR 码。扫完后告诉我。",
      };
    }

    if (login.error) {
      if (login.errorStatus === DisconnectReason.loggedOut) {
        await logoutWeb({
          authDir: login.authDir,
          isLegacyAuthDir: login.isLegacyAuthDir,
          runtime,
        });
        const message = "WhatsApp 报告会话已注销。已清除缓存的 Web 会话；请扫描新的 QR 码。";
        await resetActiveLogin(account.accountId, message);
        runtime.log(danger(message));
        return { connected: false, message };
      }
      if (login.errorStatus === 515) {
        const restarted = await restartLoginSocket(login, runtime);
        if (restarted && isLoginFresh(login)) {
          continue;
        }
      }
      const message = `WhatsApp 登录失败：${login.error}`;
      await resetActiveLogin(account.accountId, message);
      runtime.log(danger(message));
      return { connected: false, message };
    }

    if (login.connected) {
      const message = "✅ 关联成功！WhatsApp 已就绪。";
      runtime.log(success(message));
      await resetActiveLogin(account.accountId);
      return { connected: true, message };
    }

    return { connected: false, message: "登录结束但未建立连接。" };
  }
}
