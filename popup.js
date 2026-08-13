const SETTINGS_URL = "https://x.com/settings/muted_keywords";
const PACK_MANIFEST_URL =
	"https://raw.githubusercontent.com/sogud/x-muted-words/main/packs/manifest.json";
const words = document.querySelector("#words");
const editorActions = document.querySelector("#editor-actions");
const saveStatus = document.querySelector("#save-status");
const packStatus = document.querySelector("#pack-status");

function normalize(value) {
	return [
		...new Set(
			value
				.split(/\r?\n/)
				.map((word) => word.trim())
				.filter(Boolean),
		),
	];
}

async function loadPack() {
	const result = await chrome.storage.local.get({ mutedWords: [] });
	words.value = result.mutedWords.join("\n");
}

document.querySelector("#open-settings").addEventListener("click", () => {
	chrome.tabs.create({ url: SETTINGS_URL });
	window.close();
});

function isPack(value) {
	return (
		value &&
		typeof value.id === "string" &&
		Array.isArray(value.words) &&
		value.words.length <= 5000 &&
		value.words.every((word) => typeof word === "string" && word.length <= 100)
	);
}

async function loadRemotePacks() {
	packStatus.textContent = "正在检查词包…";
	const manifestResponse = await fetch(PACK_MANIFEST_URL, { cache: "no-store" });
	if (!manifestResponse.ok) throw new Error(`词包索引加载失败（${manifestResponse.status}）`);
	const manifest = await manifestResponse.json();
	if (!Array.isArray(manifest.packs) || manifest.packs.length > 20) {
		throw new Error("词包索引格式无效");
	}
	const packs = [];
	for (const entry of manifest.packs) {
		if (typeof entry?.url !== "string" || !entry.url.startsWith("https://raw.githubusercontent.com/")) continue;
		const response = await fetch(entry.url, { cache: "no-store" });
		if (!response.ok) continue;
		const pack = await response.json();
		if (isPack(pack)) packs.push(pack);
	}
	const local = await chrome.storage.local.get({ mutedWords: [] });
	const merged = normalize([...local.mutedWords, ...packs.flatMap((pack) => pack.words)].join("\n"));
	await chrome.storage.local.set({ mutedWords: merged, packUpdatedAt: manifest.updatedAt ?? null });
	packStatus.textContent = `已加载 ${packs.length} 个词包，共 ${merged.length} 个词`;
}

document.querySelector("#load-packs").addEventListener("click", async () => {
	try {
		await loadRemotePacks();
	} catch (error) {
		packStatus.textContent = error instanceof Error ? error.message : "词包加载失败";
	}
});

document.querySelector("#edit-pack").addEventListener("click", async () => {
	await loadPack();
	words.hidden = false;
	editorActions.hidden = false;
});

document.querySelector("#save-pack").addEventListener("click", async () => {
	const pack = normalize(words.value);
	await chrome.storage.local.set({ mutedWords: pack });
	words.value = pack.join("\n");
	saveStatus.textContent = `已保存 ${pack.length} 个词`;
});
