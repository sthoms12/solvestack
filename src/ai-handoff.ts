/**
 * One-click AI handoffs (F3). Two destinations accept a prefilled prompt
 * via a `?q=` URL parameter — an undocumented vendor convention, not a
 * contract, and one that has broken before. The design therefore treats
 * the clipboard as the reliable channel (the caller copies the full paste
 * pack first) and the prefilled URL as a bonus: if the prefill silently
 * fails, the user lands in an empty chat with the pack already copied.
 *
 * Gemini and Microsoft Copilot have no working prefill (Copilot's was
 * removed in late 2025), so they are not destinations here; they keep the
 * ZIP / paste-pack formats.
 */

export type AiHandoff = {
  id: string;
  label: string;
  /** Plain chat URL, used when the prefilled URL would be too long. */
  chatUrl: string;
  /** Prefill endpoint; the encoded prompt is appended to this. */
  prefillBase: string;
};

export const AI_HANDOFFS: AiHandoff[] = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    chatUrl: "https://chatgpt.com/",
    prefillBase: "https://chatgpt.com/?q=",
  },
  {
    id: "claude",
    label: "Claude",
    chatUrl: "https://claude.ai/new",
    prefillBase: "https://claude.ai/new?q=",
  },
];

export function aiHandoffById(id: string | null | undefined): AiHandoff | undefined {
  return AI_HANDOFFS.find((handoff) => handoff.id === id);
}

/**
 * Conservative ceiling for a prefilled URL. The task prompt is normally
 * ~1.5–2.5k characters encoded; the cap leaves headroom while staying far
 * under the ~32k at which some edges reject URLs outright. Returns null
 * past the cap so the caller can open the plain chat URL instead — the
 * pack is on the clipboard either way.
 */
export const HANDOFF_URL_CAP = 8000;

export function buildHandoffUrl(
  handoff: AiHandoff,
  prompt: string,
): string | null {
  const url = handoff.prefillBase + encodeURIComponent(prompt);
  return url.length <= HANDOFF_URL_CAP ? url : null;
}
