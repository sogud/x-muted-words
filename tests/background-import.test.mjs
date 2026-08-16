import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(projectRoot, "background.js"), "utf8");
const calls = [];
let messageListener;
let installedListener;
const chrome = {
	debugger: {
		async attach(target, version) {
			calls.push(["attach", target, version]);
		},
		async detach(target) {
			calls.push(["detach", target]);
		},
		async sendCommand(target, method, params) {
			calls.push([method, target, params]);
			if (method !== "Runtime.evaluate") return {};
			const expression = params.expression;
			if (expression.includes("link.scrollIntoView")) {
				return { result: { value: { x: 100, y: 100 } } };
			}
			if (expression.includes("button.scrollIntoView")) {
				return { result: { value: { x: 200, y: 200 } } };
			}
			if (expression.includes("input.scrollIntoView")) {
				return { result: { value: { x: 150, y: 150 } } };
			}
			return { result: { value: true } };
		},
	},
	runtime: {
		onInstalled: {
			addListener(listener) {
				installedListener = listener;
			},
		},
		onMessage: {
			addListener(listener) {
				messageListener = listener;
			},
		},
	},
	tabs: {
		async query() {
			return [];
		},
		async reload() {},
		async sendMessage(tabId, message) {
			calls.push(["progress", { tabId }, message]);
		},
	},
};

runInNewContext(source, {
	chrome,
	Date,
	Error,
	Number,
	Promise,
	Set,
	clearTimeout,
	setTimeout,
});

assert.equal(typeof installedListener, "function");
const response = await new Promise((resolveResponse) => {
	const keepOpen = messageListener(
		{ type: "XMW_IMPORT_WORDS", words: ["加我微信"] },
		{ tab: { id: 42, url: "https://x.com/settings/muted_keywords" } },
		resolveResponse,
	);
	assert.equal(keepOpen, true);
});
assert.deepEqual(structuredClone(response), { ok: true, added: 1 });
const insertIndex = calls.findIndex((call) => call[0] === "Input.insertText");
assert.ok(insertIndex > 0);
assert.equal(calls[insertIndex - 1][0], "Input.dispatchMouseEvent");
assert.equal(calls[insertIndex - 1][2].type, "mouseReleased");
assert.ok(calls.some((call) => call[0] === "Input.dispatchMouseEvent"));
assert.deepEqual(structuredClone(calls.at(0)), [
	"attach",
	{ tabId: 42 },
	"1.3",
]);
assert.deepEqual(structuredClone(calls.at(-1)), ["detach", { tabId: 42 }]);

console.log("PASS background importer performs CDP input and clicks");
