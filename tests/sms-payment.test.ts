import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { ParkingStore } from "../server/store";
import { CommunityStore } from "../server/community";
import { PostgresParkingStore } from "../server/postgres/store";
import { PostgresCommunityStore } from "../server/postgres/community";
import { postgresSql, type StoreDatabase } from "../server/postgres/database";
import { buildApp } from "../server/app";
import { validatedSmsCandidate, isVerifiedSmsPayment, smsZoneMatches, SMS_PHOTO_TTL_MS, type SmsPaymentCandidate } from "../src/domain/sms-payment";
import { smsOperatorsMatch } from "../server/sms-payment";
import { SignExtractor } from "../server/sign-ai";
import type { Catalog, SignInfo } from "../src/domain/types";

const candidate: SmsPaymentCandidate = {
  mode: "start-stop", destination: "144144", zoneCode: "D8", plateFormat: "compact",
  startTemplate: "{zone} {plate}", stopTemplate: "S", allowedHours: null, maxStayMinutes: null, confidence: .99,
  evidence: { destinationText: "144-144", startExample: "D8 SK1234FF", samplePlate: "SK1234FF", sampleHours: null,
    stopExample: "S", stopInstructionText: "STOP: send S to 144-144", durationText: null },
};
const reading: SignInfo = { isParkingSign:true,confidence:.99,zoneCode:"D8",operator:"Gradski",currency:"MKD",firstHour:25,nextHour:25,
  maxStayMinutes:null,chargingHours:"07–23",paymentInstructions:"START D8 SK1234FF; STOP S",restrictions:null,
  rawText:"ZONE D8\n144-144\nSTART D8 SK1234FF\nSTOP: send S to 144-144",smsPayment:candidate };
const image = {mimeType:"image/png" as const,base64:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGqkAAAAASUVORK5CYII="};
const catalog: Catalog = {generatedAt:new Date().toISOString(),places:[],zones:[],destinations:[],coverage:{complete:false,bounds:[],notes:[]}};
const geometry = {type:"Polygon" as const,coordinates:[[[21.432,41.996],[21.433,41.996],[21.433,41.997],[21.432,41.997],[21.432,41.996]]]};

test("SMS extraction requires complete photographed examples, explicit same-number stop or allowed durations", () => {
  assert.deepEqual(validatedSmsCandidate(reading), candidate);
  for (const patch of [{confidence:.97}, {destination:"1144144"}, {zoneCode:"D9"}, {startTemplate:"{zone} {plate} {hours}"}, {stopTemplate:null}, {plateFormat:"preserve"}])
    assert.equal(validatedSmsCandidate({...reading,smsPayment:{...candidate,...patch} as SmsPaymentCandidate}),null);
  for (const patch of [{stopInstructionText:"STOP: send S"},{stopInstructionText:"STOP: send S to 1144144"},{stopInstructionText:"STOP: send S to 144144 or 111111"},{samplePlate:"SK 1234 FF"}]) {
    const altered = {...candidate,evidence:{...candidate.evidence,...patch}};
    assert.equal(validatedSmsCandidate({...reading,rawText:reading.rawText+"\n"+JSON.stringify(patch),smsPayment:altered}),null);
  }
  assert.equal(validatedSmsCandidate({...reading,rawText:"144144 D8"}),null);
  assert.equal(validatedSmsCandidate({...reading,confidence:.9}),null);
  assert.equal(validatedSmsCandidate({...reading,maxStayMinutes:120}),null);
  const fixed: SmsPaymentCandidate = {...candidate,mode:"fixed-hours",startTemplate:"{zone} {plate} {hours}",stopTemplate:null,
    allowedHours:[1,2,3],evidence:{...candidate.evidence,startExample:"D8 SK1234FF 2",sampleHours:2,stopExample:null,stopInstructionText:null,durationText:"Allowed 1–3 hours"}};
  const fixedInfo={...reading,smsPayment:fixed,rawText:reading.rawText+"\nD8 SK1234FF 2\nAllowed 1–3 hours"};
  assert.deepEqual(validatedSmsCandidate(fixedInfo),fixed);
  assert.equal(validatedSmsCandidate({...fixedInfo,smsPayment:{...fixed,allowedHours:[1,2,3,4]}}),null);
  assert.equal(validatedSmsCandidate({...fixedInfo,smsPayment:{...fixed,evidence:{...fixed.evidence,durationText:"07–23"}}}),null,"opening hours do not authorize a duration");
  const now=Date.now(), verified={...candidate,photoId:"photo",confirmedAt:new Date(now).toISOString(),expiresAt:new Date(now+SMS_PHOTO_TTL_MS).toISOString()};
  assert.equal(isVerifiedSmsPayment(verified,now),true);
  assert.equal(isVerifiedSmsPayment({...verified,destination:"sms:evil"},now),false);
  assert.equal(isVerifiedSmsPayment(verified,now+SMS_PHOTO_TTL_MS),false);
  assert.equal(smsZoneMatches("POC 1","1"),true); assert.equal(smsZoneMatches("Д8","D8"),true);
  assert.equal(smsZoneMatches("POC 0","1"),false); assert.equal(smsZoneMatches("Gradski B1","1"),false);
  assert.equal(smsOperatorsMatch("poc","Градски паркинг"),false);
});

test("an invalid SMS reading gets one careful retry without discarding valid tariff fields", async () => {
  let calls=0;
  const uncertain={...reading,smsPayment:{...candidate,evidence:{...candidate.evidence,stopInstructionText:"invented English translation"}}};
  const extractor=new SignExtractor({geminiKey:"test",geminiModels:["test-model"],fetcher:async()=>{calls++;return Response.json({output_text:JSON.stringify(uncertain)});}});
  const result=await extractor.extract(new Uint8Array(),"image/png");
  assert.equal(calls,2); assert.equal(result.info.smsPayment,null); assert.equal(result.info.firstHour,25); assert.equal(result.info.zoneCode,"D8");
  calls=0;
  const corrected=new SignExtractor({geminiKey:"test",geminiModels:["test-model"],fetcher:async()=>Response.json({output_text:JSON.stringify(++calls===1 ? uncertain : reading)})});
  assert.deepEqual((await corrected.extract(new Uint8Array(),"image/png")).info.smsPayment,candidate); assert.equal(calls,2);
});

for (const backend of ["sqlite","postgres"] as const) test(`${backend}: only immutable photo confirmation enables SMS and stale evidence fails closed`, async t => {
  let now=Date.now(); t.mock.method(Date,"now",()=>now);
  let store: ParkingStore | PostgresParkingStore;
  if (backend === "sqlite") store=new ParkingStore(":memory:",catalog,()=>now,true);
  else {
    const pg=await PGlite.create({parsers:{20:Number}});
    for (const file of readdirSync("supabase/migrations").filter(f=>f.endsWith(".sql")).sort()) await pg.exec(readFileSync(`supabase/migrations/${file}`,"utf8"));
    const local=new AsyncLocalStorage<Transaction>();
    const db:StoreDatabase={prepare(sql){const query=(v:unknown[])=>(local.getStore()??pg).query(postgresSql(sql),v);return {run:(...v)=>query(v),get:async(...v)=>(await query(v)).rows[0],all:async(...v)=>(await query(v)).rows};},transaction:work=>local.getStore()?work():pg.transaction(tx=>local.run(tx,work)),close:()=>pg.close()};
    store=new PostgresParkingStore(db,()=>now,true); await store.seed(catalog);
    const security=await pg.query("SELECT relrowsecurity FROM pg_class WHERE oid='parkskopje.sms_confirmations'::regclass");
    assert.equal((security.rows[0] as {relrowsecurity:boolean}).relrowsecurity,true);
  }
  const app=await buildApp(catalog,store);
  const community=store instanceof ParkingStore ? new CommunityStore(store) : new PostgresCommunityStore(store);
  try {
    const token=(await store.createSession()).token, other=(await store.createSession()).token, headers={authorization:`Bearer ${token}`};
    const place=await community.contribute({requestId:"sms-fixture",name:"Photo zone",coordinate:{latitude:41.9965,longitude:21.4325},geometry,kind:"zone",zoneCode:"D8",firstHour:null,nextHour:null},token);
    const upload=await community.upload(place.id,token,image), id=upload.id;
    const confirm=(body:object={},auth=token)=>app.inject({method:"POST",url:`/v1/signs/${id}/confirm-sms`,headers:{authorization:`Bearer ${auth}`},payload:body});
    const current=()=>app.inject({url:`/v1/places/${place.id}/sms-payment`,headers});
    assert.equal((await confirm()).statusCode,409,"unread photo cannot enable SMS");
    await community.finish(id,reading,"gemini-test");
    const {smsPayment: _candidate,...manual}=reading;
    assert.equal((await app.inject({method:"POST",url:`/v1/signs/${id}/confirm`,headers,payload:reading})).statusCode,400,"manual request cannot submit a protocol");
    await community.confirmSign(id,token,{...manual,smsPayment:{...candidate,destination:"999999"}});
    assert.equal((await current()).json().protocol,null,"even direct editable confirmation cannot enable SMS");
    assert.equal((await confirm({},other)).statusCode,403);
    assert.equal((await confirm({destination:"999999"})).statusCode,400);
    const confirmed=await confirm(); assert.equal(confirmed.statusCode,200,confirmed.body);
    assert.equal(confirmed.json().smsPayment.destination,"144144");
    let live=await current(); assert.equal(live.headers["cache-control"],"no-store");
    assert.equal(live.json().protocol.photoId,id);
    assert.equal((await app.inject(`/v1/places/${place.id}/sms-payment`)).statusCode,401);
    await community.confirmSign(id,token,{...manual,paymentInstructions:"made up new phone 999999"});
    assert.equal((await current()).json().protocol.destination,"144144","edited text cannot replace photographed instructions");
    await community.confirmSign(id,token,{...manual,operator:"POC"});
    assert.equal((await current()).json().protocol,null,"a known conflicting operator correction revokes SMS");
    await assert.rejects(async()=>community.confirmSms(id,token),/matching payment instructions/);
    await community.confirmSign(id,token,manual);
    assert.equal((await current()).json().protocol,null,"restoring the operator does not resurrect a revoked protocol");
    await community.confirmSms(id,token);
    await community.label(place.id,token,"D9"); assert.equal((await current()).json().protocol,null);
    assert.equal((await confirm()).statusCode,409);
    await community.label(place.id,token,"D8"); assert.equal((await current()).json().protocol,null,"restoring code does not resurrect revoked confirmation");
    assert.equal((await confirm()).statusCode,200);
    await community.boundary(place.id,token,geometry); assert.equal((await current()).json().protocol,null,"redrawn coverage requires another confirmation");
    assert.equal((await confirm()).statusCode,200);
    await community.confirmSign(id,token,{...manual,zoneCode:"D9"}); assert.equal((await current()).json().protocol,null);
    await community.confirmSign(id,token,manual); assert.equal((await current()).json().protocol,null);
    await confirm();
    now+=SMS_PHOTO_TTL_MS;
    assert.equal((await current()).json().protocol,null); assert.equal((await confirm()).statusCode,409,"reconfirmation cannot renew old photo");
    const otherPlace=await community.contribute({requestId:"sms-copy",name:"Other zone",coordinate:{latitude:41.9965,longitude:21.4325},kind:"zone",zoneCode:"D8",firstHour:null,nextHour:null},token);
    const copy=await community.upload(otherPlace.id,token,image);
    assert.equal(copy.createdAt,upload.createdAt,"same photo copied to another place cannot renew expiry");
    await store.deleteSession(token);
    await assert.rejects(async()=>community.photo(id),/Photo not found/);
  } finally { await app.close(); }
});

for (const backend of ["sqlite"] as const) test(`${backend}: explicit reupload refreshes only recent legacy AI readings`, async () => {
  const store=new ParkingStore(":memory:",catalog), community=new CommunityStore(store);
  try {
    const token=store.createSession().token;
    const place=community.contribute({requestId:"legacy",name:"Legacy",coordinate:{latitude:42,longitude:21.4},kind:"zone",zoneCode:"D8",firstHour:null,nextHour:null},token);
    const photo=community.upload(place.id,token,image), {smsPayment: _old,...legacy}=reading;
    community.finish(photo.id,legacy,"old-model"); community.confirmSign(photo.id,token,legacy);
    const reread=community.upload(place.id,token,image);
    assert.equal(reread.id,photo.id); assert.equal(reread.status,"queued","review UI keeps polling the legacy refresh even when tariff details were confirmed");
    assert.equal(community.claim()?.id,photo.id,"legacy photo explicitly reuploaded gets fresh extraction");
    assert.equal(community.photo(photo.id).smsPayment,undefined);
    community.finish(photo.id,{...legacy,smsPayment:null},"new-model");
    community.upload(place.id,token,image);
    assert.equal(community.claim(),undefined,"unclear new reading is not retried on every duplicate upload");
  } finally {store.close();}
});
