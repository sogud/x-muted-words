const PANEL_ID = "x-muted-words-panel";
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function isVisible(node) {
	return node instanceof HTMLElement && node.offsetParent !== null;
}

function pageText() {
	return document.body?.innerText?.toLocaleLowerCase() ?? "";
}

function findButton(pattern) {
	return [...document.querySelectorAll('button, [role="button"]')].find(
		(node) => {
			if (!isVisible(node)) return false;
			const label = [
				node.textContent,
				node.getAttribute("aria-label"),
				node.getAttribute("title"),
			]
				.filter(Boolean)
				.join(" ");
			return pattern.test(label.trim());
		},
	);
}

function findTextInput() {
	return [
		...document.querySelectorAll(
			'input[type="text"], input:not([type]), textarea',
		),
	].find(isVisible);
}

function findPageContainer() {
	return (
		document.querySelector('[role="main"]') ||
		document.querySelector("main") ||
		document.body
	);
}

async function addWord(word) {
	const addButton = findButton(/^(add|添加|屏蔽词|mute)/i);
	if (!addButton) throw new Error("找不到添加按钮");
	addButton.click();
	await sleep(300);
	const input = findTextInput();
	if (!input) throw new Error("找不到输入框");
	const setter = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)?.set;
	if (setter && input instanceof HTMLInputElement) setter.call(input, word);
	else input.value = word;
	input.dispatchEvent(new Event("input", { bubbles: true }));
	await sleep(100);
	const saveButton = findButton(/^(save|保存|done|完成|添加)$/i);
	if (!saveButton) throw new Error("找不到保存按钮");
	saveButton.click();
	await sleep(500);
}

function createPanel(words) {
	document.querySelector(`#${PANEL_ID}`)?.remove();
	const panel = document.createElement("section");
	panel.id = PANEL_ID;
	const title = document.createElement("h2");
	title.textContent = "X屏蔽词助手";
	const description = document.createElement("p");
	description.className = "x-muted-description";
	description.textContent = "把常见广告和引流词添加到你的 X 屏蔽词。";
	const summary = document.createElement("p");
	summary.className = "x-muted-summary";
	const preview = document.createElement("details");
	const previewTitle = document.createElement("summary");
	previewTitle.textContent = "查看待添加词条";
	const list = document.createElement("div");
	list.className = "x-muted-list";
	preview.append(previewTitle, list);
	const actions = document.createElement("div");
	actions.className = "x-muted-actions";
	const addButton = document.createElement("button");
	addButton.type = "button";
	addButton.className = "x-muted-primary";
	const refreshButton = document.createElement("button");
	refreshButton.type = "button";
	refreshButton.className = "x-muted-secondary";
	refreshButton.textContent = "重新检查";
	actions.append(addButton, refreshButton);
	const status = document.createElement("p");
	status.className = "x-muted-status";
	panel.append(title, description, summary, preview, actions, status);
	findPageContainer().prepend(panel);

	let missing = [];
	const render = () => {
		const existingText = pageText();
		missing = words.filter(
			(word) => !existingText.includes(word.toLocaleLowerCase()),
		);
		summary.textContent = missing.length
			? `已准备 ${missing.length} 个词，确认后将逐个添加。`
			: "这些词已经添加过了。";
		addButton.textContent = missing.length
			? `开始屏蔽 ${missing.length} 个词`
			: "已全部屏蔽";
		addButton.disabled = missing.length === 0;
		list.replaceChildren();
		for (const word of missing) {
			const item = document.createElement("span");
			item.textContent = word;
			list.append(item);
		}
		if (!missing.length) {
			const empty = document.createElement("span");
			empty.textContent = "没有需要添加的词。";
			list.append(empty);
		}
	};

	refreshButton.addEventListener("click", render);
	addButton.addEventListener("click", async () => {
		addButton.disabled = true;
		refreshButton.disabled = true;
		let added = 0;
		for (const [index, word] of missing.entries()) {
			status.textContent = `正在添加 ${index + 1} / ${missing.length}：${word}`;
			try {
				await addWord(word);
				added += 1;
			} catch (error) {
				status.textContent = `添加“${word}”失败，请检查 X 页面后重试。`;
				console.error(`[X屏蔽词助手] ${word}`, error);
				break;
			}
		}
		status.textContent = added ? `已添加 ${added} 个词。` : "没有添加词条。";
		refreshButton.disabled = false;
		render();
	});

	render();
}

chrome.storage.local.get({ mutedWords: [] }).then(({ mutedWords }) => {
	createPanel(normalize([...BUILT_IN_WORDS, ...mutedWords].join("\n")));
});
