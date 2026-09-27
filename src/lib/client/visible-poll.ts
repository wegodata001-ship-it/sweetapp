/** Skip a network poll while the browser tab is in the background. */
export function isDocumentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}
