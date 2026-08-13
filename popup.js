const SETTINGS_URL = "https://x.com/settings/muted_keywords";
const BUILT_IN_WORDS = [
	"加微信", "加V", "加我微信", "扫码加群", "免费领取", "限时优惠",
	"全网最低", "代理加盟", "诚招代理", "课程优惠", "流量扶持",
	"私聊了解", "点击链接", "关注公众号", "送彩金",
];
const customWord = document.querySelector("#custom-word");
const customStatus = document.querySelector("#custom-status");

function normalize(value) {
	return [...new Set(value.split(/\r?\n/).map((word) => word.trim()).filter(Boolean))];
}

async function ensureBuiltInWords() {
	const result = await chrome.storage.local.get({ mutedWords: [] });
	const merged = normalize([...BUILT_IN_WORDS, ...result.mutedWords].join("\n"));
	await chrome.storage.local.set({ mutedWords: merged });
}

document.querySelector("#open-settings").addEventListener("click", async () => {
	await ensureBuiltInWords();
	chrome.tabs.create({ url: SETTINGS_URL });
	window.close();
});

document.querySelector("#add-custom-word").addEventListener("click", async () => {
	const value = customWord.value.trim();
	if (!value) {
		customStatus.textContent = "请输入要屏蔽的词";
		return;
	}
	const result = await chrome.storage.local.get({ mutedWords: [] });
	const words = normalize([...BUILT_IN_WORDS, ...result.mutedWords].join("\n"));
	if (words.includes(value)) {
		customStatus.textContent = "这个词已经存在";
		return;
	}
	await chrome.storage.local.set({ mutedWords: [...words, value] });
	customWord.value = "";
	customStatus.textContent = `已添加“${value}”，下次点击“开始添加”时生效`;
});

customWord.addEventListener("keydown", (event) => {
	if (event.key === "Enter") document.querySelector("#add-custom-word").click();
});
