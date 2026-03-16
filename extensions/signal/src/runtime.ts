import { createPluginRuntimeStore } from "openclaw/plugin-sdk/compat";
import type { PluginRuntime } from "openclaw/plugin-sdk/signal";

const { setRuntime: setSignalRuntime, getRuntime: getSignalRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Signal 运行时未初始化");
export { getSignalRuntime, setSignalRuntime };
