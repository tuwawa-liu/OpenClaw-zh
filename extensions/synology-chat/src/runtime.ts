import { createPluginRuntimeStore } from "openclaw/plugin-sdk/compat";
import type { PluginRuntime } from "openclaw/plugin-sdk/synology-chat";

const { setRuntime: setSynologyRuntime, getRuntime: getSynologyRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Synology Chat 运行时未初始化 - 插件未注册");
export { getSynologyRuntime, setSynologyRuntime };
