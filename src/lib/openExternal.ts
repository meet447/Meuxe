/** Open a URL in the system browser (Tauri) or a new tab (web dev). */
export async function openExternalUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;

  if ("__TAURI_INTERNALS__" in window || "__TAURI__" in window) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(trimmed);
    return;
  }

  window.open(trimmed, "_blank", "noopener,noreferrer");
}
