// Extract a room code from a Kadi deep link. Handles both the verified App Link
// (https://kadi.olininnovations.co.ke/join/ABCD) and the custom-scheme fallback
// (kadi://join/ABCD). Returns the uppercased code, or null if the URL isn't a
// join link.
export function parseJoinCode(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/join\/([A-Za-z0-9]{4,10})/i);
  return m ? m[1].toUpperCase() : null;
}
