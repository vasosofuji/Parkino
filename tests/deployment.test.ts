import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkingStore } from '../server/store';
import { buildApp } from '../server/app';
import seed from '../data/catalog.json';
import type { Catalog } from '../src/domain/types';

test('health reports database failure without exposing database errors', async t => {
  const store = new ParkingStore(':memory:', seed as Catalog);
  const app = await buildApp(seed as Catalog, store);
  try {
    assert.equal((await app.inject('/health')).statusCode,200);
    t.mock.method(store.db, 'prepare', () => { throw new Error('private connection details'); });
    const response = await app.inject('/health');
    assert.equal(response.statusCode,503);
    assert.deepEqual(response.json(), {status:'unavailable'});
  } finally { t.mock.restoreAll(); await app.close(); }
});

test('proxy headers cannot bypass rate limits when the connecting peer is untrusted', async () => {
  const store = new ParkingStore(':memory:', seed as Catalog);
  const app = await buildApp(seed as Catalog, store, {trustedProxies:['loopback','uniquelocal']});
  try {
    for (let n=0;n<60;n++) {
      const response=await app.inject({url:'/v1/usernames/availability?username=DemoCheck', remoteAddress:'203.0.113.9', headers:{'x-forwarded-for':`198.51.100.${n%250+1}`}});
      assert.equal(response.statusCode,200);
    }
    const response=await app.inject({url:'/v1/usernames/availability?username=DemoCheck', remoteAddress:'203.0.113.9',headers:{'x-forwarded-for':'198.51.100.251'}});
    assert.equal(response.statusCode,429);
    assert.equal((await app.inject('/health')).statusCode,200);
  } finally {await app.close();}
});
