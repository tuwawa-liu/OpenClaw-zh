import type { PluginRuntime } from "openclaw/plugin-sdk/nostr";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setNostrRuntime, getRuntime: getNostrRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Nostr 运行时未初始化");
export { getNostrRuntime, setNostrRuntime };
