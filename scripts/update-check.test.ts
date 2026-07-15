// Verifies the launch-time update check (src/api/appUpdate.ts):
//  - a strictly-newer manifest versionCode → returns UpdateInfo,
//  - an equal or older versionCode → null (never nag),
//  - a non-OK response / network error / bad JSON → null (fails soft).
// Run: npx tsx scripts/update-check.test.ts
import { BUILD_VERSION_CODE } from '../src/appVersion';
import { checkForUpdate } from '../src/api/appUpdate';

function assert(c: boolean, m: string): void {
  if (!c) {
    console.error('FAIL:', m);
    process.exit(1);
  }
  console.log('ok:', m);
}

// Swap global.fetch for a stub that returns a chosen manifest / failure.
function stubFetch(
  behaviour:
    | { kind: 'json'; body: unknown; ok?: boolean }
    | { kind: 'throw' }
): void {
  (globalThis as unknown as { fetch: unknown }).fetch = async () => {
    if (behaviour.kind === 'throw') throw new Error('network down');
    return {
      ok: behaviour.ok ?? true,
      json: async () => behaviour.body,
    } as Response;
  };
}

async function main() {
  const newer = BUILD_VERSION_CODE + 5;

  stubFetch({ kind: 'json', body: { versionCode: newer, versionName: '9.9.9' } });
  const a = await checkForUpdate();
  assert(a !== null && a.versionCode === newer, 'newer manifest returns UpdateInfo');
  assert(a?.versionName === '9.9.9', 'carries the remote versionName');
  assert(
    a?.url === 'https://kadi.olininnovations.co.ke/download',
    'falls back to the default download url'
  );

  stubFetch({ kind: 'json', body: { versionCode: BUILD_VERSION_CODE } });
  assert((await checkForUpdate()) === null, 'equal versionCode → no update');

  stubFetch({ kind: 'json', body: { versionCode: BUILD_VERSION_CODE - 1 } });
  assert((await checkForUpdate()) === null, 'older versionCode → no update');

  stubFetch({ kind: 'json', body: { versionCode: newer }, ok: false });
  assert((await checkForUpdate()) === null, 'non-OK response → no update');

  stubFetch({ kind: 'json', body: { nope: true } });
  assert((await checkForUpdate()) === null, 'manifest without versionCode → no update');

  stubFetch({ kind: 'throw' });
  assert((await checkForUpdate()) === null, 'network error → no update (fails soft)');

  console.log('\nPASS: launch update check verified.');
}

void main();
