import { fetch as nativeFetch } from "@tauri-apps/plugin-http";

export function validateProviderUrl(input: string): string {
  const url = new URL(input);
  const loopback = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.username || url.password || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new Error("Providers require HTTPS, or HTTP on this computer (localhost).");
  }
  return url.href;
}

export async function providerFetch(url: string, options: RequestInit): Promise<Response> {
  return nativeFetch(validateProviderUrl(url), {
    ...options,
    // A provider redirect must never forward a prompt, audio, or credential.
    maxRedirections: 0,
    connectTimeout: 30_000,
  });
}
