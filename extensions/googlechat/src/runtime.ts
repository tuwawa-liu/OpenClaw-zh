import type { PluginRuntime } from "openclaw/plugin-sdk/googlechat";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setGoogleChatRuntime, getRuntime: getGoogleChatRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Google Chat 运行时未初始化");
export { getGoogleChatRuntime, setGoogleChatRuntime };
