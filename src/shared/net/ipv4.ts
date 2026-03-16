import { isCanonicalDottedDecimalIPv4 } from "./ip.js";

export function validateDottedDecimalIPv4Input(value: string | undefined): string | undefined {
  if (!value) {
    return "自定义绑定模式需要 IP 地址";
  }
  if (isCanonicalDottedDecimalIPv4(value)) {
    return undefined;
  }
  return "无效的 IPv4 地址（如 192.168.1.100）";
}

// Backward-compatible alias for callers using the old helper name.
export function validateIPv4AddressInput(value: string | undefined): string | undefined {
  return validateDottedDecimalIPv4Input(value);
}
