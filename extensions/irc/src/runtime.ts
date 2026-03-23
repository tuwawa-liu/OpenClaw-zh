import type { PluginRuntime } from "openclaw/plugin-sdk/irc";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setIrcRuntime, getRuntime: getIrcRuntime } =
  createPluginRuntimeStore<PluginRuntime>("IRC 运行时未初始化");
export { getIrcRuntime, setIrcRuntime };
