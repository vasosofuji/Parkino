import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import ts from "typescript";
import { LANGUAGES, isLanguage, translate } from "../src/domain/language";
import translations from "../src/locales/translations.json";

test("every static UI message has Turkish and Albanian translations", () => {
  const keys = new Set<string>();
  function scan(path: string) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = `${path}/${entry.name}`;
      if (entry.isDirectory()) { scan(file); continue; }
      if (!/\.tsx?$/.test(file)) continue;
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node)) {
          const name = node.expression.getText(source);
          const key = node.arguments[name === "t" ? 0 : name === "translate" ? 1 : -1];
          if (key && ts.isStringLiteral(key)) keys.add(key.text);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan("src");
  const dictionary = translations as Record<string, { tr: string; sq: string }>;
  for (const key of keys) {
    assert.ok(dictionary[key]?.tr.trim(), `Missing Turkish: ${key}`);
    assert.ok(dictionary[key]?.sq.trim(), `Missing Albanian: ${key}`);
  }
  assert.ok(keys.size > 400);
});

test("language codes, bundled flags and translation fallback remain valid", () => {
  for (const { code, flag } of LANGUAGES) {
    assert.equal(isLanguage(code), true);
    const bytes = readFileSync(`assets/flags/${flag}.png`);
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.ok(existsSync(`assets/flags/${flag}.png`));
  }
  assert.equal(isLanguage("al"), false);
  assert.equal(isLanguage(null), false);
  assert.equal(translate("mk", "Continue", "Продолжи"), "Продолжи");
  assert.equal(translate("en", "Continue", "Продолжи"), "Continue");
  assert.equal(translate("tr", "Continue", "Продолжи"), "Devam et");
  assert.equal(translate("sq", "Continue", "Продолжи"), "Vazhdo");
  assert.equal(translate("sq", "Future message", "Идна порака"), "Future message");
});
