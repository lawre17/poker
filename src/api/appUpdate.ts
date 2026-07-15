// Lightweight "is there a newer APK?" check, run once on launch.
//
// The app is distributed as a directly-downloaded APK (not via the Play Store),
// so it can't auto-update itself — instead we fetch a tiny version manifest the
// deploy step publishes alongside the APK, compare it to the running build, and
// (if newer) nudge the user to the download page. Everything here fails soft:
// offline, a missing manifest, a timeout, or bad JSON just means "no update".
import { BUILD_VERSION_CODE, BUILD_VERSION_NAME } from '../appVersion';

// Static file served from the site's public/ dir (see scripts/deploy-apk.sh).
const MANIFEST_URL = 'https://kadi.olininnovations.co.ke/mobile/latest.json';
// Where "Update" sends the user — the Laravel /download route serving the APK.
const DEFAULT_DOWNLOAD_URL = 'https://kadi.olininnovations.co.ke/download';
const TIMEOUT_MS = 6000;

export interface UpdateInfo {
  versionCode: number;
  versionName: string;
  url: string; // where to download the new APK
  currentVersionName: string; // the running build, for the prompt
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(MANIFEST_URL, {
        signal: controller.signal,
        headers: { 'cache-control': 'no-cache' },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;

    const data = (await res.json()) as {
      versionCode?: unknown;
      versionName?: unknown;
      url?: unknown;
    };
    const remoteCode = Number(data?.versionCode);
    // Only a strictly-newer build counts — never nag a matching/older manifest.
    if (!Number.isFinite(remoteCode) || remoteCode <= BUILD_VERSION_CODE) {
      return null;
    }
    return {
      versionCode: remoteCode,
      versionName:
        typeof data?.versionName === 'string' && data.versionName
          ? data.versionName
          : String(remoteCode),
      url: typeof data?.url === 'string' && data.url ? data.url : DEFAULT_DOWNLOAD_URL,
      currentVersionName: BUILD_VERSION_NAME,
    };
  } catch {
    return null; // offline / aborted / non-JSON — silently skip
  }
}
