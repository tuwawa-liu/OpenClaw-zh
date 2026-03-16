import { createPluginRuntimeStore, type PluginRuntime } from "openclaw/plugin-sdk/whatsapp";

const { setRuntime: setWhatsAppRuntime, getRuntime: getWhatsAppRuntime } =
  createPluginRuntimeStore<PluginRuntime>("WhatsApp 运行时未初始化");
export { getWhatsAppRuntime, setWhatsAppRuntime };
