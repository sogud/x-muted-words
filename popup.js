const SETTINGS_URL = "https://x.com/settings/muted_keywords";
const BUILT_IN_WORDS = [
	"加微信",
	"加V",
	"加我微信",
	"扫码加群",
	"免费领取",
	"限时优惠",
	"全网最低",
	"代理加盟",
	"诚招代理",
	"课程优惠",
	"流量扶持",
	"私聊了解",
	"点击链接",
	"关注公众号",
	"送彩金",
	"私信我", "评论区留言", "后台回复", "点击头像", "主页有惊喜",
	"链接在简介", "扫码领取", "进群领取", "免费咨询", "优惠券领取",
	"低价秒杀", "招代理", "招商加盟", "兼职日结", "在家赚钱",
	"轻松月入", "无门槛加入", "官方授权", "独家资源", "内部资料",
	"加群了解", "推广返佣", "课程代理",
];
const customWord = document.querySelector("#custom-word");
const customStatus = document.querySelector("#custom-status");

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

async function ensureBuiltInWords() {
	const result = await chrome.storage.local.get({ mutedWords: [] });
	const merged = normalize(
		[...BUILT_IN_WORDS, ...result.mutedWords].join("\n"),
	);
	await chrome.storage.local.set({ mutedWords: merged });
}

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
		const result = await chrome.storage.local.get({ mutedWords: [] });
		const words = normalize(
			[...BUILT_IN_WORDS, ...result.mutedWords].join("\n"),
		);
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
