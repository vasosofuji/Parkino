import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { validatedSmsCandidate } from "../src/domain/sms-payment";
import { hasSignDetails } from "../src/domain/report-feedback";
import { verified } from "./fixtures/zone-payment";
import type { SignInfo, SignPhoto } from "../src/domain/types";

type Element = { type: string; props: Record<string, any>; children: unknown[] };
const nodes = (value: unknown): Element[] => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === "object" && "children" in value ? [value as Element, ...(value as Element).children.flatMap(nodes)] : [];
function renderReview(confidence = 1) {
  const info: SignInfo = { isParkingSign: true, confidence: 1, zoneCode: "D8", operator: null, currency: "MKD", firstHour: 25, nextHour: 25, maxStayMinutes: null, chargingHours: null, paymentInstructions: null, restrictions: null, rawText: Object.values(verified.evidence).filter(value => typeof value === "string").join("\n"), smsPayment: { ...verified, confidence } };
  const photo: SignPhoto = { id: "photo", placeId: "zone", createdAt: "2026-10-05T00:00:00Z", status: "ready", model: "photo-model", info, uploadedByMe: true };
  const normal: SignInfo[] = [], sms: string[] = [];
  const react = { createElement: (type: string, props: Record<string, any>, ...children: unknown[]): Element => ({ type, props: props ?? {}, children }), useState: (value: any) => [typeof value === "function" ? value() : value, () => {}], useEffect() {} };
  const context = { exports: {} as { default: (props: unknown) => Element }, require(name: string) {
    if (name === "react") return { ...react, default: react, __esModule: true };
    if (name === "react-native") return { Image: "Image", Text: "Text", TextInput: "TextInput", View: "View" };
    if (name === "../state/ParkingContext") return { useParking: () => ({ t: (en: string) => en, refresh: async () => {} }) };
    if (name === "../state/ThemeContext") return { useTheme: () => ({ colors: {} }) };
    if (name === "../state/ContributionFeedback") return { useContributionFeedback: () => ({ thankYou() {} }) };
    if (name === "../domain/report-feedback") return { hasSignDetails };
    if (name === "../domain/sms-payment") return { validatedSmsCandidate };
    if (name === "./ui") return { Button: "Button", Note: "Note", Sheet: "Sheet" };
    if (["./LoadingIndicator", "./DigitalParkingSign", "./PaymentScheduleFields", "./StepActions"].includes(name)) return { default: name, __esModule: true };
    if (name === "../services/api") return { api: { imageUrl: () => "photo-image", confirmSign: async (_id: string, value: SignInfo) => { normal.push(value); return photo; }, confirmSmsSign: async (id: string) => { sms.push(id); return { ...photo, smsPayment: verified }; } } };
    throw new Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync("src/components/SignReviewSheet.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  return { tree: context.exports.default({ initialPhoto: photo, onClose() {}, onConfirmed() {} }), normal, sms };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("a finished unclear real photo explains why SMS remains disabled", () => {
  const view = renderReview(.95);
  assert.ok(nodes(view.tree).some(node => node.type === "Note" && node.children.includes("SMS instructions unclear. Use a clearer photo to enable payment.")));
  assert.equal(nodes(view.tree).some(node => node.type === "Button" && node.props.title === "Photo matches these SMS instructions"), false);
});

test("general tariff confirmation strips SMS data; only the separate photo confirmation requests SMS verification", async () => {
  const view = renderReview();
  assert.ok(nodes(view.tree).some(node => node.type === "Image" && node.props.source.uri === "photo-image"));
  view.tree.props.footer.props.onContinue(); await flush();
  assert.equal(view.normal.length, 1); assert.equal("smsPayment" in view.normal[0], false); assert.equal(view.sms.length, 0);
  nodes(view.tree).find(node => node.type === "Button" && node.props.title === "Photo matches these SMS instructions")!.props.onPress(); await flush();
  assert.deepEqual(view.sms, ["photo"]);
});
