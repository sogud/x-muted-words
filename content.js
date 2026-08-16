const PANEL_ID = "x-muted-words-panel";

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

function normalizeKey(value) {
	return String(value || "")
		.normalize("NFKC")
		.toLocaleLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

function isVisible(node) {
	return (
		node instanceof HTMLElement &&
		!node.hidden &&
		node.getClientRects().length > 0
	);
}

function findMutedWordsHeading(root = document) {
	return [
		...root.querySelectorAll(
			'h1, h2, h3, [role="heading"], main div, main span',
		),
	].find((node) => {
		const text = (node.textContent || "").trim();
		return text === "已隐藏的字词" || text.toLowerCase() === "muted words";
	});
}

function findPageContainer() {
	const heading = findMutedWordsHeading();
	let node = heading;
	while (node?.parentElement) {
		const rect = node.getBoundingClientRect();
		if (
			rect.width >= 600 &&
			node.scrollHeight >= 240 &&
			node.children.length >= 2
		) {
			return node;
		}
		node = node.parentElement;
	}
	return (
		document.querySelector('[data-testid="primaryColumn"]') ||
		document.querySelector('main[role="main"]') ||
		document.querySelector("main") ||
		document.body
	);
}

function isMutedWordsListPage() {
	return /^\/settings\/muted_keywords\/?$/.test(location.pathname);
}

function isMutedDuration(value) {
	return /^(永久|forever|24\s*(hours?|小时)|1\s*(day|天)|7\s*(days|天)|30\s*(days|天))$/i.test(
		value,
	);
}

function isMutedRowLabel(value) {
	return (
		value.length > 80 ||
		/^(muted words?|屏蔽词|已隐藏的字词|删除|移除|取消屏蔽|remove|delete|永久|forever)$/i.test(
			value,
		)
	);
}

function addMutedLinkWords(words) {
	for (const link of document.querySelectorAll('a, [role="link"]')) {
		const lines = normalize(link.innerText || link.textContent || "");
		const durationIndex = lines.findIndex(isMutedDuration);
		if (durationIndex > 0 && !isMutedRowLabel(lines[durationIndex - 1])) {
			words.add(lines[durationIndex - 1]);
			continue;
		}

		const labels = [
			link.innerText,
			link.textContent,
			link.getAttribute("aria-label"),
		].filter(Boolean);
		for (const label of labels) {
			const compact = label.replace(/\s+/g, "").trim();
			const match = compact.match(
				/^(.{1,100}?)(?:永久|forever|24(?:hours?|小时)|1(?:day|天)|7(?:days|天)|30(?:days|天))(?:取消隐藏|unmute)?$/i,
			);
			if (match && !isMutedRowLabel(match[1])) {
				words.add(match[1].trim());
				break;
			}
		}
	}
}

function addMutedRowWords(container, words) {
	const pageLines = normalize(
		container.innerText || container.textContent || "",
	);
	for (let index = 1; index < pageLines.length; index += 1) {
		if (
			isMutedDuration(pageLines[index]) &&
			!isMutedRowLabel(pageLines[index - 1])
		) {
			words.add(pageLines[index - 1]);
		}
	}

	const rows = [
		...container.querySelectorAll(
			'[data-testid="cellInnerDiv"], [role="listitem"], li',
		),
	];
	for (const row of rows) {
		const lines = normalize(row.innerText || row.textContent || "");
		if (!lines.some(isMutedDuration)) continue;
		const label = lines.find((line) => !isMutedRowLabel(line));
		if (label) words.add(label);
	}

	const durationNodes = [...container.querySelectorAll("span, div")].filter(
		(node) => isMutedDuration((node.textContent || "").trim()),
	);
	for (const durationNode of durationNodes) {
		let row = durationNode.parentElement;
		for (let level = 0; row && row !== container && level < 6; level += 1) {
			const lines = normalize(row.innerText || row.textContent || "");
			if (
				lines.length >= 2 &&
				lines.length <= 4 &&
				lines.some(isMutedDuration)
			) {
				const label = lines.find((line) => !isMutedRowLabel(line));
				if (label) words.add(label);
				break;
			}
			row = row.parentElement;
		}
	}
}

function getExistingMutedWords() {
	if (!isMutedWordsListPage()) return [];
	const words = new Set();
	addMutedLinkWords(words);
	addMutedRowWords(findPageContainer(), words);
	const controls = [
		...document.querySelectorAll('button, [role="button"]'),
	].filter((node) =>
		/remove|delete|unmute|删除|移除|取消屏蔽/i.test(
			[
				node.textContent,
				node.getAttribute("aria-label"),
				node.getAttribute("title"),
			]
				.filter(Boolean)
				.join(" "),
		),
	);

	for (const control of controls) {
		const row =
			control.closest('[role="listitem"], li, [data-testid="cellInnerDiv"]') ||
			control.parentElement?.parentElement;
		if (!row) continue;
		const candidates = normalize(row.innerText || row.textContent || "").filter(
			(word) =>
				word.length <= 100 &&
				!/^(muted words?|屏蔽词|删除|移除|取消屏蔽|remove|delete|永久|forever)$/i.test(
					word,
				),
		);
		for (const word of candidates) words.add(word);
	}
	return [...words];
}

function renderWordList(list, words, emptyText) {
	list.replaceChildren();
	if (!words.length) {
		const empty = document.createElement("span");
		empty.className = "x-muted-empty";
		empty.textContent = emptyText;
		list.append(empty);
		return;
	}
	for (const word of words) {
		const item = document.createElement("span");
		item.textContent = word;
		list.append(item);
	}
}

function createPanel(words) {
	document.querySelector(`#${PANEL_ID}`)?.remove();
	const panel = document.createElement("section");
	panel.id = PANEL_ID;
	const title = document.createElement("h2");
	title.textContent = "X屏蔽词助手";
	const version = chrome.runtime.getManifest().version;
	const description = document.createElement("p");
	description.className = "x-muted-description";
	description.textContent = `词包用于 X 原生屏蔽词，添加后手机端也会生效。当前版本 ${version}。`;
	const summary = document.createElement("p");
	summary.className = "x-muted-summary";

	const currentPreview = document.createElement("details");
	currentPreview.className = "x-muted-current";
	currentPreview.open = true;
	const currentTitle = document.createElement("summary");
	const currentList = document.createElement("div");
	currentList.className = "x-muted-list";
	currentPreview.append(currentTitle, currentList);

	const pendingPreview = document.createElement("details");
	pendingPreview.className = "x-muted-pending";
	const pendingTitle = document.createElement("summary");
	const pendingList = document.createElement("div");
	pendingList.className = "x-muted-list";
	pendingPreview.append(pendingTitle, pendingList);

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
	status.setAttribute("role", "status");
	panel.append(
		title,
		description,
		summary,
		currentPreview,
		pendingPreview,
		actions,
		status,
	);
	findPageContainer().prepend(panel);

	let missing = [];
	const render = () => {
		const currentWords = getExistingMutedWords();
		const currentKeys = new Set(currentWords.map(normalizeKey));
		missing = words.filter((word) => !currentKeys.has(normalizeKey(word)));
		currentTitle.textContent = `当前已屏蔽词（${currentWords.length}）`;
		pendingTitle.textContent = `待添加词条（${missing.length}）`;
		summary.textContent = `当前已屏蔽 ${currentWords.length} 个词，还可添加 ${missing.length} 个。`;
		addButton.textContent = missing.length
			? `开始屏蔽 ${missing.length} 个词`
			: "已全部屏蔽";
		addButton.disabled = missing.length === 0;
		if (!missing.length) status.textContent = "词包已全部添加。";
		renderWordList(currentList, currentWords, "暂时没有识别到已屏蔽词。");
		renderWordList(pendingList, missing, "没有需要添加的词。");
	};

	chrome.runtime.onMessage.addListener((message) => {
		if (message?.type !== "XMW_IMPORT_PROGRESS") return;
		status.textContent = `正在添加 ${message.current} / ${message.total}：${message.word}`;
	});
	addButton.addEventListener("click", async () => {
		render();
		const queue = [...missing];
		addButton.disabled = true;
		refreshButton.disabled = true;
		status.textContent = `正在添加 1 / ${queue.length}……`;
		try {
			const result = await chrome.runtime.sendMessage({
				type: "XMW_IMPORT_WORDS",
				words: queue,
			});
			if (result?.ok) {
				status.textContent = `已成功添加 ${result.added} 个词。`;
			} else {
				status.textContent = `[v${version}] 添加“${result?.failedWord || queue[0]}”失败：${result?.error || "未知错误"}。`;
			}
		} catch (error) {
			status.textContent = `[v${version}] 导入失败：${error instanceof Error ? error.message : "未知错误"}。`;
		} finally {
			refreshButton.disabled = false;
			render();
		}
	});
	refreshButton.addEventListener("click", render);
	render();
	window.setTimeout(render, 1000);
	window.setTimeout(render, 3000);
}

if (isMutedWordsListPage()) {
	globalThis.XMW_RULES.prepareMutedWords().then(({ words }) => {
		createPanel(normalize(words.join("\n")));
	});
}
