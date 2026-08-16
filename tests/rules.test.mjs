import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(projectRoot, "rules.js"), "utf8");
const state = {
	remotePack: null,
	mutedWords: [],
	customMutedWords: [],
};
const chrome = {
	runtime: {
		getURL(path) {
			return `chrome-extension://test/${path}`;
		},
	},
	storage: {
		local: {
			async get(defaults) {
				return { ...defaults, ...state };
			},
			async set(value) {
				Object.assign(state, value);
			},
			async remove(key) {
				delete state[key];
			},
		},
	},
};

async function fetch(url) {
	const local = url.startsWith("chrome-extension://");
	if (url.endsWith("manifest.json")) {
		return {
			ok: true,
			async json() {
				return {
					packs: [
						{
							id: "test-pack",
							file: "test.json",
							url: "https://raw.githubusercontent.com/sogud/x-muted-words/main/packs/test.json",
						},
					],
				};
			},
		};
	}
	return {
		ok: true,
		async json() {
			return local
				? { id: "test-pack", version: 1, words: ["旧词", "共同词"] }
				: { id: "test-pack", version: 2, words: ["新词", "共同词"] };
		},
	};
}

const context = {
	chrome,
	fetch,
	console,
	Date,
	Error,
	Map,
	Number,
	Object,
	RegExp,
	Set,
	String,
};
context.globalThis = context;
runInNewContext(source, context);

const patterns = context.XMW_RULES.DEFAULT_FILTER_PATTERNS.map(
	(rule) => new RegExp(rule.pattern, "iu"),
);
assert.ok(patterns.some((pattern) => pattern.test("加 微信")));
assert.ok(patterns.some((pattern) => pattern.test("pump.fun")));
assert.ok(!patterns.some((pattern) => pattern.test("pumpXfun")));
assert.ok(patterns.some((pattern) => pattern.test("真实少妇（单身看我简介")));

const prepared = await context.XMW_RULES.prepareMutedWords();
assert.deepEqual(structuredClone(prepared.words), ["新词", "共同词"]);
assert.deepEqual(structuredClone(prepared.packs.map((pack) => pack.version)), [
	"2",
]);
assert.equal("mutedWords" in state, false);

console.log("PASS rules preserve regex escapes and prefer newer remote packs");
