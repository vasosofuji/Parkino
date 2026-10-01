# CommonJS compatibility for the upstream security fix

This is the MIT-licensed `decode-uri-component` v0.5.0 implementation from
https://github.com/SamVerschueren/decode-uri-component/tree/v0.5.0.
Only its final `export default function` declaration is changed to
`module.exports = function`. The upstream license is included unchanged.

Expo Router SDK 57 depends on CommonJS `query-string` 7, which calls
`require('decode-uri-component')` directly as a function. Upstream v0.5.0 is
ESM-only, so simply overriding that dependency breaks routing. Upgrading
query-string to its ESM-only major version also breaks the router's named
imports. This local compatibility package preserves the existing interface
while taking the upstream fix for CVE-2026-45822 / GHSA-vcc3-ghjq-m6fr.

Remove the override when a compatible Expo Router update includes the fix.
Regression checks exercise the actual installed query-string dependency with
normal Cyrillic parameters and malformed encoded input in a timed subprocess.
