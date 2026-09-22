import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FirestoreCollection } from '../src/db/firestore.js';

describe('FirestoreCollection compound unique selectors', () => {
  const byDealerPlatform = (dealer_id: string, platform: string) => ({
    dealer_id_platform: { dealer_id, platform },
  });

  it('upserts only the record for that dealer and platform', async () => {
    const connections = new FirestoreCollection('test_platform_connections');
    const save = (dealer_id: string, platform: string, access_token: string) =>
      connections.upsert({
        where: byDealerPlatform(dealer_id, platform),
        create: { dealer_id, platform, access_token },
        update: { access_token },
      });

    await save('dealer-a', 'facebook', 'token-a');
    await save('dealer-b', 'facebook', 'token-b');
    await save('dealer-a', 'facebook', 'token-a2');

    assert.equal(await connections.count(), 2);
    assert.equal((await connections.findFirst({ where: byDealerPlatform('dealer-a', 'facebook') }))?.access_token, 'token-a2');
    assert.equal((await connections.findFirst({ where: byDealerPlatform('dealer-b', 'facebook') }))?.access_token, 'token-b');
    assert.equal(await connections.findFirst({ where: byDealerPlatform('dealer-a', 'instagram') }), null);
  });
});
