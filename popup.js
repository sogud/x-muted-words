const SETTINGS_URL = "https://x.com/settings/muted_keywords";
const BUILT_IN_WORDS = [
	"加微信", "加V", "加我微信", "扫码加群", "免费领取", "限时优惠",
	"全网最低", "代理加盟", "诚招代理", "课程优惠", "流量扶持",
	"私聊了解", "点击链接", "关注公众号", "送彩金",
];
const words = document.querySelector("#words");
const editorActions = document.querySelector("#editor-actions");
const saveStatus = document.querySelector("#save-status");

function normalize(value) {
	return [...new Set(value.split(/\r?\n/).map((word) => word.trim()).filter(Boolean))];
}

async function ensureBuiltInWords() {
	const result = await chrome.storage.local.get({ mutedWords: [] });
	const merged = normalize([...BUILT_IN_WORDS, ...result.mutedWords].join("\n"));
	await chrome.storage.local.set({ mutedWords: merged });
	return merged;
}

document.querySelector("#open-settings").addEventListener("click", async () => {
	await ensureBuiltInWords();
	chrome.tabs.create({ url: SETTINGS_URL });
	window.close();
});

document.querySelector("#edit-pack").addEventListener("click", async () => {
	const merged = await ensureBuiltInWords();
	words.value = merged.join("\n");
	words.hidden = false;
	editorActions.hidden = false;
});

document.querySelector("#save-pack").addEventListener("click", async () => {
	const pack = normalize(words.value);
	await chrome.storage.local.set({ mutedWords: pack });
	words.value = pack.join("\n");
	saveStatus.textContent = `已保存 ${pack.length} 个词`;
});
