import test from "node:test";
import assert from "node:assert/strict";
import { apiEndpoint, PUBLIC_API_URL } from "../src/services/apiEndpoint";

test("installed builds default to hosted HTTPS rather than the phone's localhost", () => {
  assert.equal(apiEndpoint({development:false,host:"localhost"}),PUBLIC_API_URL);
  assert.throws(()=>apiEndpoint({development:false,host:"localhost",configured:"http://127.0.0.1:3002"}));
  assert.throws(()=>apiEndpoint({development:false,host:"localhost",configured:"https://localhost"}));
  for (const host of ["localhost.","sub.localhost","127.4.3.2","192.168.1.5","10.0.0.1","[::ffff:7f00:1]","example.local"])
    assert.throws(()=>apiEndpoint({development:false,host:"localhost",configured:`https://${host}`}));
});
test("USB API is explicit and cannot permit arbitrary cleartext endpoints", () => {
  assert.equal(apiEndpoint({development:false,host:"localhost",usbTest:true,configured:"http://127.0.0.1:3002"}),"http://127.0.0.1:3002");
  assert.throws(()=>apiEndpoint({development:false,host:"localhost",usbTest:true,configured:"http://untrusted.example"}));
  assert.equal(apiEndpoint({development:true,host:"192.168.1.5"}),"http://192.168.1.5:3001");
});
test("API configuration refuses credential-bearing URLs and normalizes trailing slash", () => {
  for (const configured of ["https://user:secret@example.com","https://example.com?secret=value","https://example.com/#secret"])
    assert.throws(()=>apiEndpoint({development:false,host:"localhost",configured}));
  assert.equal(apiEndpoint({development:false,host:"localhost",configured:PUBLIC_API_URL+"/"}),PUBLIC_API_URL);
});
