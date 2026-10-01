import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../src/services/transport';

test('concurrent calls wait for one cold-start probe and send each write once', async () => {
  let now = 0;
  const calls: string[] = [];
  let probes = 0;
  const fetcher = (async (url: string | URL | Request) => {
    const path = String(url);
    calls.push(path);
    if (path.endsWith('/health')) {
      probes++;
      return probes === 1 ? new Response('starting', {status:503}) : Response.json({status:'ok'});
    }
    return Response.json({saved:true});
  }) as typeof fetch;
  const request = createTransport('https://test.example', {fetcher, clock:()=>now, pause:async ms=>{now+=ms;}});
  const results = await Promise.all([request('/report', {method:'POST'}), request('/price', {method:'POST'})]);
  assert.deepEqual(results, [{saved:true},{saved:true}]);
  assert.equal(probes,2);
  assert.equal(calls.filter(p=>p.endsWith('/report')).length,1);
  assert.equal(calls.filter(p=>p.endsWith('/price')).length,1);
});

test('an interrupted write is never automatically replayed', async () => {
  let writes = 0;
  const fetcher = (async (url: string | URL | Request) => {
    if(String(url).endsWith('/health')) return Response.json({status:'ok'});
    writes++;
    throw new Error('socket closed after commit');
  }) as typeof fetch;
  const request = createTransport('https://test.example', {fetcher});
  await assert.rejects(request('/report', {method:'POST'}), /check whether your change was saved/);
  assert.equal(writes,1);
});

test('unavailable database fails within the warm-up budget without sending a write', async () => {
  let now = 0;
  const fetcher = (async (url: string | URL | Request) => {
    assert.ok(String(url).endsWith('/health'));
    return Response.json({status:'unavailable'}, {status:503});
  }) as typeof fetch;
  const request = createTransport('https://test.example', {fetcher, clock:()=>now, pause:async ms=>{now+=ms;}});
  await assert.rejects(request('/report', {method:'POST'}), /Could not connect/);
  assert.equal(now,75000);
});
