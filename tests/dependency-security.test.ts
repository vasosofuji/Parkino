import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

test("Expo Router query parameters retain CommonJS and Cyrillic decoding", () => {
  const query = require("query-string") as {parse:(s:string)=>Record<string,unknown>;stringify:(v:object)=>string};
  const values={zone:"Б2",cost:"40",name:"Скопје + parking"};
  assert.deepEqual({...query.parse(query.stringify(values))},values);
});

test("malformed encoded input cannot pin URL parsing in exponential recursion", () => {
  const result=spawnSync(process.execPath,["-e", "const q=require('query-string'); const p=q.parse('zone='+('%FE%FF%41%80'.repeat(3000))); if(typeof p.zone!=='string') process.exit(2);"],{timeout:3000,encoding:"utf8"});
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stderr);
});

test("Expo's xcode UUID adapter still produces native project identifiers", () => {
  const project=require("xcode").project("unused-test.pbxproj");
  project.hash={project:{objects:{}}};
  const a=project.generateUuid(),b=project.generateUuid();
  assert.match(a,/^[A-F0-9]{24}$/);assert.notEqual(a,b);
});
