const PANEL_ID = "x-muted-words-panel";
const BUILT_IN_WORDS = [
	"加微信", "加V", "加我微信", "扫码加群", "免费领取", "限时优惠",
	"全网最低", "代理加盟", "诚招代理", "课程优惠", "流量扶持",
	"私聊了解", "点击链接", "关注公众号", "送彩金",
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

function pageText() {
	return document.body?.innerText?.toLocaleLowerCase() ?? "";
}

function isVisible(node) {
	return node instanceof HTMLElement && node.offsetParent !== null;
}

function findButton(pattern) {
	return [...document.querySelectorAll('button, [role="button"]')].find((node) => {
		if (!isVisible(node)) return false;
		const label = [node.textContent, node.getAttribute("aria-label"), node.getAttribute("title")]
			.filter(Boolean)
			.join(" ");
		return pattern.test(label.trim());
	});
}

function findTextInput() {
	return [...document.querySelectorAll('input[type="text"], input:not([type]), textarea]')]
		.find(isVisible);
}

async function addWord(word) {
	const addButton = findButton(/^(add|添加|屏蔽词|mute)/i);
	if (!addButton) throw new Error("找不到“添加屏蔽词”按钮");
	addButton.click();
	await sleep(300);
	const input = findTextInput();
	if (!input) throw new Error("找不到屏蔽词输入框");
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
	const title = document.createElement("strong");
	title.textContent = "清净词";
	const summary = document.createElement("span");
	summary.className = "x-muted-summary";
	const list = document.createElement("div");
	list.className = "x-muted-list";
	const closeButton = document.createElement("button");
	closeButton.className = "x-muted-close";
	closeButton.type = "button";
	closeButton.setAttribute("aria-label", "关闭 X Muted Words");
	closeButton.textContent = "×";
	const actions = document.createElement("div");
	actions.className = "x-muted-actions";
	const refreshButton = document.createElement("button");
	refreshButton.dataset.action = "refresh";
	refreshButton.textContent = "重新扫描";
	const addButton = document.createElement("button");
	addButton.dataset.action = "add";
	addButton.className = "x-muted-primary";
	addButton.textContent = "添加选中的词";
	const note = document.createElement("small");
	note.textContent = "默认全选。确认无误后点击上方按钮；不会自动删除已有词。";
	actions.append(refreshButton, addButton);
	const header = document.createElement("div");
	header.className = "x-muted-header";
	header.append(title, closeButton);
	panel.append(header, summary, actions, list, note);
	document.body.append(panel);
	const render = () => {
		const existingText = pageText();
		const missing = words.filter(
			(word) => !existingText.includes(word.toLocaleLowerCase()),
		);
		summary.textContent = `已找到 ${missing.length} 个可添加的词（共 ${words.length} 个）`;
		list.replaceChildren();
		if (missing.length) {
			for (const word of missing) {
				const label = document.createElement("label");
				const checkbox = document.createElement("input");
				checkbox.type = "checkbox";
				checkbox.checked = true;
				checkbox.value = word;
				label.append(checkbox, document.createTextNode(` ${word}`));
				list.append(label);
			}
		} else {
			const empty = document.createElement("span");
			empty.textContent = "没有检测到缺失词，或页面尚未加载完成。";
			list.append(empty);
		}
		return missing;
	};
	closeButton.addEventListener("click", () => panel.remove());
	refreshButton.addEventListener("click", render);
	addButton.addEventListener("click", async (event) => {
		const button = event.currentTarget;
		const selected = [...list.querySelectorAll("input:checked")].map(
			(input) => input.value,
		);
		button.disabled = true;
		for (const word of selected) {
			try {
				await addWord(word);
			} catch (error) {
				console.error(`[X Muted Words] ${word}`, error);
			}
		}
		button.disabled = false;
		render();
	});
	render();
}

chrome.storage.local.get({ mutedWords: [] }).then(({ mutedWords }) => {
	const words = normalize([...BUILT_IN_WORDS, ...mutedWords].join("\n"));
	createPanel(words);
});
