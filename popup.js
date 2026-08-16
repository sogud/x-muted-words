const SETTINGS_URL = "https://x.com/settings/muted_keywords";
const packStatus = document.querySelector("#pack-status");
const packList = document.querySelector("#pack-list");
const customWord = document.querySelector("#custom-word");
const customStatus = document.querySelector("#custom-status");
const filterEnabled = document.querySelector("#filter-enabled");
const filterMode = document.querySelector("#filter-mode");
const filterStrictness = document.querySelector("#filter-strictness");
const whitelistHandle = document.querySelector("#whitelist-handle");
const customPatterns = document.querySelector("#custom-patterns");
const filterStats = document.querySelector("#filter-stats");
const filterSettingsDefaults = globalThis.XMW_RULES.DEFAULT_FILTER_SETTINGS;

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

function renderPackList(packs) {
	packList.replaceChildren();
	for (const pack of packs) {
		const item = document.createElement("div");
		item.className = "pack-item";
		item.title = pack.description || "";
		const name = document.createElement("strong");
		name.textContent = pack.name;
		const meta = document.createElement("span");
		const category =
			{
				spam: "广告引流",
				adult: "黄色推广",
				other: "其他",
			}[pack.category] ||
			pack.category ||
			"其他";
		meta.textContent = `${category} · ${pack.count} 个词 · v${pack.version}`;
		item.append(name, meta);
		packList.append(item);
	}
}

async function refreshRemotePack(force = false) {
	packStatus.textContent = force ? "正在更新远程词包……" : "正在检查远程词包……";
	const result = await globalThis.XMW_RULES.prepareMutedWords({ force });
	renderPackList(result.packs);
	if (result.error) {
		packStatus.textContent = `远程词包更新失败，继续使用本机缓存（${result.words.length} 个词）。`;
		return result;
	}
	packStatus.textContent = `已加载 ${result.words.length} 个词，${result.packs.length} 个词包。`;
	return result;
}

async function ensureBuiltInWords() {
	return refreshRemotePack(false);
}

async function activeTab() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	return tab;
}

async function sendToActiveTab(type) {
	try {
		const tab = await activeTab();
		if (!tab?.id || !tab.url?.startsWith("https://x.com/")) return null;
		return await chrome.tabs.sendMessage(tab.id, { type });
	} catch (_error) {
		return null;
	}
}

async function renderFilterSettings() {
	const result = await chrome.storage.local.get({
		filterSettings: filterSettingsDefaults,
		filterStats: { total: 0, scanned: 0, hidden: 0, dimmed: 0 },
	});
	const settings = globalThis.XMW_RULES.normalizeSettings(
		result.filterSettings,
	);
	filterEnabled.checked = settings.enabled;
	filterMode.value = settings.hideMode;
	filterStrictness.value = settings.strictness;
	customPatterns.value = settings.customPatterns.join("\n");
	const stats = result.filterStats;
	filterStats.textContent = `本页扫描 ${stats.scanned || 0} 条，当前隐藏 ${
		(stats.hidden || 0) + (stats.dimmed || 0)
	} 条。`;
}

async function updateFilterSettings(patch) {
	const result = await chrome.storage.local.get({
		filterSettings: filterSettingsDefaults,
	});
	const settings = globalThis.XMW_RULES.normalizeSettings({
		...result.filterSettings,
		...patch,
	});
	await chrome.storage.local.set({ filterSettings: settings });
	await renderFilterSettings();
}

filterEnabled.addEventListener("change", () =>
	updateFilterSettings({ enabled: filterEnabled.checked }),
);
filterMode.addEventListener("change", () =>
	updateFilterSettings({ hideMode: filterMode.value }),
);
filterStrictness.addEventListener("change", () =>
	updateFilterSettings({ strictness: filterStrictness.value }),
);
document.querySelector("#add-whitelist").addEventListener("click", async () => {
	const handle = globalThis.XMW_RULES.normalizeHandle(whitelistHandle.value);
	if (!handle) {
		filterStats.textContent = "请输入要信任的账号。";
		return;
	}
	const result = await chrome.storage.local.get({
		filterSettings: filterSettingsDefaults,
	});
	const settings = globalThis.XMW_RULES.normalizeSettings(
		result.filterSettings,
	);
	settings.whitelistHandles = [
		...new Set([...settings.whitelistHandles, handle]),
	];
	await chrome.storage.local.set({ filterSettings: settings });
	whitelistHandle.value = "";
	filterStats.textContent = `已信任 @${handle}。`;
});
document
	.querySelector("#save-filter-rules")
	.addEventListener("click", async () => {
		await updateFilterSettings({ customPatterns: customPatterns.value });
		filterStats.textContent = "已保存自定义过滤规则。";
	});
document.querySelector("#rescan-filter").addEventListener("click", async () => {
	await sendToActiveTab("XMW_RESCAN");
	window.setTimeout(renderFilterSettings, 400);
});
document.querySelector("#reveal-all").addEventListener("click", async () => {
	await sendToActiveTab("XMW_REVEAL_ALL");
	await renderFilterSettings();
});

document.querySelector("#update-pack").addEventListener("click", () => {
	refreshRemotePack(true);
});
refreshRemotePack(false);
renderFilterSettings();

document.querySelector("#open-settings").addEventListener("click", async () => {
	await ensureBuiltInWords();
	chrome.tabs.create({ url: SETTINGS_URL });
	window.close();
});

document
	.querySelector("#add-custom-word")
	.addEventListener("click", async () => {
		const value = customWord.value.trim();
		if (!value) {
			customStatus.textContent = "请输入要屏蔽的词";
			return;
		}
		const result = await globalThis.XMW_RULES.prepareMutedWords();
		const words = normalize(result.words.join("\n"));
		if (words.includes(value)) {
			customStatus.textContent = "这个词已经存在";
			return;
		}
		const { customMutedWords = [] } = await chrome.storage.local.get({
			customMutedWords: [],
		});
		await chrome.storage.local.set({
			customMutedWords: [...new Set([...customMutedWords, value])],
		});
		customWord.value = "";
		customStatus.textContent = `已添加“${value}”，下次开始屏蔽时生效`;
	});

customWord.addEventListener("keydown", (event) => {
	if (event.key === "Enter") document.querySelector("#add-custom-word").click();
});
