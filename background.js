const PROTOCOL_VERSION = "1.3";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

chrome.runtime.onInstalled.addListener(() => {
	chrome.tabs
		.query({ url: "https://x.com/settings/*" })
		.then((tabs) =>
			Promise.all(
				tabs.map((tab) =>
					Number.isInteger(tab.id) ? chrome.tabs.reload(tab.id) : undefined,
				),
			),
		)
		.catch(() => undefined);
});

function createImporter(chromeApi) {
	function send(tabId, method, params) {
		return chromeApi.debugger.sendCommand({ tabId }, method, params);
	}

	async function evaluate(tabId, expression) {
		const response = await send(tabId, "Runtime.evaluate", {
			expression,
			returnByValue: true,
			awaitPromise: true,
			userGesture: false,
		});
		if (response.exceptionDetails) {
			throw new Error(response.exceptionDetails.text || "X 页面执行失败");
		}
		return response.result?.value;
	}

	async function waitFor(
		tabId,
		expression,
		timeoutMs = 8_000,
		timeoutMessage = "等待 X 页面更新超时",
	) {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			if (await evaluate(tabId, expression)) return;
			await sleep(150);
		}
		throw new Error(timeoutMessage);
	}

	async function clickPoint(tabId, point) {
		if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
			throw new Error("找不到可点击的 X 页面控件");
		}
		await send(tabId, "Input.dispatchMouseEvent", {
			type: "mouseMoved",
			x: point.x,
			y: point.y,
		});
		await send(tabId, "Input.dispatchMouseEvent", {
			type: "mousePressed",
			x: point.x,
			y: point.y,
			button: "left",
			clickCount: 1,
		});
		await send(tabId, "Input.dispatchMouseEvent", {
			type: "mouseReleased",
			x: point.x,
			y: point.y,
			button: "left",
			clickCount: 1,
		});
	}

	async function clickAddLink(tabId) {
		const point = await evaluate(
			tabId,
			`(() => {
				const link = [...document.querySelectorAll('a, [role="link"]')].find((node) => {
					const label = [node.textContent, node.getAttribute('aria-label')].filter(Boolean).join(' ').trim();
					return /添加.*(?:隐藏|屏蔽).*(?:字词|词语|短语)|add.*muted.*(?:word|phrase)/i.test(label);
				});
				if (!link) return null;
				link.scrollIntoView({ block: 'center' });
				const rect = link.getBoundingClientRect();
				return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
			})()`,
		);
		await clickPoint(tabId, point);
	}

	async function prepareInput(tabId) {
		return evaluate(
			tabId,
			`(() => {
				const input = [...document.querySelectorAll('input[type="text"], input:not([type]), textarea')].find((node) => {
					const label = [node.getAttribute('aria-label'), node.getAttribute('placeholder')].filter(Boolean).join(' ');
					return /输入.*(?:字词|词语|短语)|enter.*(?:word|phrase)/i.test(label) && node.getClientRects().length > 0;
				});
				if (!input) return null;
				input.scrollIntoView({ block: 'center' });
				const prototype = input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
				Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, '');
				input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
				input.dispatchEvent(new Event('change', { bubbles: true }));
				const rect = input.getBoundingClientRect();
				return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
			})()`,
		);
	}

	async function saveButtonPoint(tabId) {
		return evaluate(
			tabId,
			`(() => {
				const button = [...document.querySelectorAll('button, [role="button"]')].find((node) => {
					const label = [node.textContent, node.getAttribute('aria-label')].filter(Boolean).join(' ').trim();
					return /^(?:保存|save|完成|done|添加)$/i.test(label) && node.getClientRects().length > 0;
				});
				if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return null;
				button.scrollIntoView({ block: 'center' });
				const rect = button.getBoundingClientRect();
				return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
			})()`,
		);
	}

	async function addWord(tabId, word) {
		await waitFor(
			tabId,
			`location.pathname === '/settings/muted_keywords' && [...document.querySelectorAll('a, [role="link"]')].some((node) => /添加.*(?:隐藏|屏蔽).*(?:字词|词语|短语)|add.*muted.*(?:word|phrase)/i.test([node.textContent, node.getAttribute('aria-label')].filter(Boolean).join(' ').trim()))`,
			8_000,
			"X 屏蔽词列表尚未加载完成",
		);
		await clickAddLink(tabId);
		await waitFor(
			tabId,
			`location.pathname.includes('/settings/add_muted_keyword') && [...document.querySelectorAll('input, textarea')].some((node) => /输入.*(?:字词|词语|短语)|enter.*(?:word|phrase)/i.test([node.getAttribute('aria-label'), node.getAttribute('placeholder')].filter(Boolean).join(' ')))`,
			8_000,
			"点击添加后，X 没有显示词条输入框",
		);
		const inputPoint = await prepareInput(tabId);
		if (!inputPoint) throw new Error("找不到 X 词条输入框");
		await clickPoint(tabId, inputPoint);
		await send(tabId, "Input.insertText", { text: word });
		const escapedWord = JSON.stringify(word);
		await waitFor(
			tabId,
			`(() => {
				const input = [...document.querySelectorAll('input, textarea')].find((node) => /输入.*(?:字词|词语|短语)|enter.*(?:word|phrase)/i.test([node.getAttribute('aria-label'), node.getAttribute('placeholder')].filter(Boolean).join(' ')));
				const button = [...document.querySelectorAll('button, [role="button"]')].find((node) => /^(?:保存|save|完成|done|添加)$/i.test([node.textContent, node.getAttribute('aria-label')].filter(Boolean).join(' ').trim()));
				return input?.value === ${escapedWord} && button && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
			})()`,
			5_000,
			"已打开输入框，但浏览器没有写入词条",
		);
		await clickPoint(tabId, await saveButtonPoint(tabId));
		await waitFor(
			tabId,
			`location.pathname === '/settings/muted_keywords'`,
			10_000,
			"点击保存后，X 没有返回屏蔽词列表",
		);
	}

	async function importWords(tabId, words) {
		await chromeApi.debugger.attach({ tabId }, PROTOCOL_VERSION);
		let added = 0;
		try {
			await Promise.all([
				send(tabId, "Page.enable"),
				send(tabId, "Runtime.enable"),
				send(tabId, "DOM.enable"),
			]);
			for (const [index, word] of words.entries()) {
				await chromeApi.tabs
					.sendMessage(tabId, {
						type: "XMW_IMPORT_PROGRESS",
						current: index + 1,
						total: words.length,
						word,
					})
					.catch(() => undefined);
				try {
					await addWord(tabId, word);
					added += 1;
				} catch (error) {
					return {
						ok: false,
						added,
						failedWord: word,
						error: error instanceof Error ? error.message : "未知错误",
					};
				}
			}
			return { ok: true, added };
		} finally {
			await chromeApi.debugger.detach({ tabId }).catch(() => undefined);
		}
	}

	return { importWords };
}

const importer = createImporter(chrome);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type !== "XMW_IMPORT_WORDS") return false;
	const tabId = sender.tab?.id;
	const words = Array.isArray(message.words)
		? message.words
				.filter((word) => typeof word === "string")
				.map((word) => word.trim())
				.filter((word) => word && word.length <= 80)
				.slice(0, 200)
		: [];
	if (
		!Number.isInteger(tabId) ||
		!sender.tab?.url?.startsWith("https://x.com/settings/") ||
		!words.length
	) {
		sendResponse({ ok: false, added: 0, error: "导入请求无效" });
		return false;
	}
	importer.importWords(tabId, words).then(sendResponse, (error) => {
		sendResponse({
			ok: false,
			added: 0,
			error: error instanceof Error ? error.message : "Chrome 调试输入失败",
		});
	});
	return true;
});
