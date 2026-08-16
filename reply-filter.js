(() => {
	"use strict";

	if (!globalThis.XMW_RULES) return;
	if (/^\/settings\/muted_keywords/.test(location.pathname)) return;

	const ARTICLE_SELECTOR = 'article[data-testid="tweet"]';
	const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
	const EXCLUDED_PATHS = new Set([
		"compose",
		"explore",
		"home",
		"i",
		"messages",
		"notifications",
		"search",
		"settings",
	]);

	let settings = globalThis.XMW_RULES.normalizeSettings();
	let compiledPatterns = [];
	let observer;
	let scanTimer = 0;
	let scanId = 0;
	let route = location.href;
	let articleId = 0;
	let revealed = new WeakSet();
	let stats = { total: 0, scanned: 0, hidden: 0, dimmed: 0 };

	function normalizeText(value) {
		return String(value || "")
			.normalize("NFKC")
			.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
			.replace(/\s+/g, " ")
			.trim();
	}

	function compactText(value) {
		return normalizeText(value)
			.toLocaleLowerCase()
			.replace(/https?:\/\/\S+/g, "")
			.replace(/[@＠][a-z0-9_]{1,15}/gi, "@")
			.replace(/[^\p{Letter}\p{Number}@]+/gu, "");
	}

	function fingerprint(value) {
		return compactText(value).slice(0, 120);
	}

	function isStatusPage() {
		return /\/status\/\d+/.test(location.pathname);
	}

	function extractHandle(article, userText) {
		const fromText = userText.match(/@([A-Za-z0-9_]{1,15})/);
		if (fromText) return globalThis.XMW_RULES.normalizeHandle(fromText[1]);

		for (const link of article.querySelectorAll('a[href^="/"]')) {
			const path = new URL(link.getAttribute("href"), location.origin).pathname;
			const first = path.split("/").filter(Boolean)[0] || "";
			if (HANDLE_RE.test(first) && !EXCLUDED_PATHS.has(first.toLowerCase())) {
				return globalThis.XMW_RULES.normalizeHandle(first);
			}
		}
		return "";
	}

	function extractArticle(article, index) {
		const textElement = article.querySelector('[data-testid="tweetText"]');
		const userElement = article.querySelector('[data-testid="User-Name"]');
		const text = normalizeText(textElement?.innerText || "");
		const userText = normalizeText(userElement?.innerText || "");
		const handle = extractHandle(article, userText);
		const mentions = text.match(/(^|[^\w])@[A-Za-z0-9_]{1,15}/g) || [];
		const isReply = isStatusPage()
			? index > 0
			: /^@[A-Za-z0-9_]{1,15}\b/.test(text);

		return {
			text,
			compact: compactText(text),
			handle,
			userText,
			mentionCount: mentions.length,
			isReply,
			hasLink: Boolean(
				article.querySelector('a[href*="t.co"], a[href*="/i/redirect"]'),
			),
			fingerprint: fingerprint(text),
		};
	}

	function buildFingerprintCounts(items) {
		const counts = new Map();
		for (const item of items) {
			if (item.data.fingerprint.length < 8) continue;
			counts.set(
				item.data.fingerprint,
				(counts.get(item.data.fingerprint) || 0) + 1,
			);
		}
		return counts;
	}

	function compilePatterns() {
		const builtIn = globalThis.XMW_RULES.DEFAULT_FILTER_PATTERNS.map(
			(rule) => ({
				...rule,
				regex: new RegExp(rule.pattern, "iu"),
			}),
		);
		const custom = settings.customPatterns
			.map((line, index) => ({
				id: `custom-${index}`,
				label: "自定义规则",
				score: 3,
				pattern: line,
				regex: globalThis.XMW_RULES.parsePattern(line),
			}))
			.filter((rule) => rule.regex);
		compiledPatterns = [...builtIn, ...custom];
	}

	function scoreArticle(data, duplicateCounts) {
		const reasons = [];
		let score = 0;
		const candidates = [data.text, data.compact, data.userText];

		if (settings.whitelistHandles.includes(data.handle)) {
			return { score: 0, reasons: ["白名单"] };
		}

		for (const rule of compiledPatterns) {
			if (candidates.some((value) => rule.regex.test(value))) {
				score += rule.score;
				reasons.push(rule.label);
			}
		}

		if (data.mentionCount > 0 && data.text.length <= 48) {
			score += 1.2;
			reasons.push("短@回复");
		}

		if (data.hasLink && data.text.length <= 80) {
			score += 1.1;
			reasons.push("短文本带链接");
		}

		const duplicateCount = duplicateCounts.get(data.fingerprint) || 0;
		if (duplicateCount >= 2) {
			score += Math.min(3, 1.8 + (duplicateCount - 2) * 0.6);
			reasons.push(`重复模板×${duplicateCount}`);
		}

		if (/[a-z]{3,}\d{2,}[a-z0-9_]*$/i.test(data.handle)) {
			score += 0.7;
			reasons.push("随机账号特征");
		}

		if (
			data.handle.includes("_") &&
			/\d/.test(data.handle) &&
			data.text.length < 80
		) {
			score += 0.4;
			reasons.push("账号含数字下划线");
		}

		if (settings.strictness === "aggressive") score += 0.7;
		if (settings.strictness === "relaxed") score -= 0.8;

		return {
			score: Math.max(0, score),
			reasons: [...new Set(reasons)],
		};
	}

	function threshold() {
		if (settings.strictness === "aggressive") return 4;
		if (settings.strictness === "relaxed") return 6.5;
		return 5;
	}

	function removePlaceholder(article) {
		const previous = article.previousElementSibling;
		if (previous?.classList.contains("xmw-placeholder")) previous.remove();
	}

	function restoreArticle(article) {
		article.removeAttribute("data-xmw-hidden");
		article.removeAttribute("data-xmw-dimmed");
		article.removeAttribute("data-xmw-score");
		article.removeAttribute("data-xmw-reasons");
		removePlaceholder(article);
	}

	async function addWhitelist(handle, article) {
		if (!handle) return;
		settings.whitelistHandles = [
			...new Set([...settings.whitelistHandles, handle]),
		];
		await chrome.storage.local.set({ filterSettings: settings });
		revealed.add(article);
		restoreArticle(article);
		scheduleScan("whitelist");
	}

	function ensurePlaceholder(article, data, result) {
		if (!article.dataset.xmwId) article.dataset.xmwId = String(++articleId);

		let placeholder = article.previousElementSibling;
		if (!placeholder?.classList.contains("xmw-placeholder")) {
			placeholder = document.createElement("div");
			placeholder.className = "xmw-placeholder";
			placeholder.dataset.xmwFor = article.dataset.xmwId;

			const message = document.createElement("span");
			message.className = "xmw-placeholder-message";
			const showButton = document.createElement("button");
			showButton.type = "button";
			showButton.className = "xmw-placeholder-button";
			showButton.textContent = "显示";
			showButton.addEventListener("click", () => {
				revealed.add(article);
				restoreArticle(article);
			});
			const trustButton = document.createElement("button");
			trustButton.type = "button";
			trustButton.className = "xmw-placeholder-button";
			trustButton.textContent = "信任账号";
			trustButton.addEventListener("click", () =>
				addWhitelist(data.handle, article),
			);
			placeholder.append(message, showButton, trustButton);
			article.parentNode.insertBefore(placeholder, article);
		}

		const message = placeholder.querySelector(".xmw-placeholder-message");
		const handle = data.handle ? ` @${data.handle}` : "";
		message.textContent = `已折叠疑似垃圾回复${handle} · ${result.reasons.slice(0, 3).join("、")}`;
	}

	function applyResult(article, data, result) {
		article.dataset.xmwScore = result.score.toFixed(1);
		article.dataset.xmwReasons = result.reasons.join(",");

		if (settings.hideMode === "dim") {
			article.dataset.xmwDimmed = "true";
			article.removeAttribute("data-xmw-hidden");
			removePlaceholder(article);
			return;
		}

		article.dataset.xmwHidden = "true";
		article.removeAttribute("data-xmw-dimmed");
		if (settings.hideMode === "collapse")
			ensurePlaceholder(article, data, result);
		else removePlaceholder(article);
	}

	function updateStats(total, scanned, hidden, dimmed) {
		stats = { total, scanned, hidden, dimmed };
		chrome.storage.local.set({ filterStats: stats });
	}

	function clearMarks() {
		document
			.querySelectorAll(
				`${ARTICLE_SELECTOR}[data-xmw-hidden], ${ARTICLE_SELECTOR}[data-xmw-dimmed]`,
			)
			.forEach(restoreArticle);
		document
			.querySelectorAll(".xmw-placeholder")
			.forEach((node) => node.remove());
		updateStats(0, 0, 0, 0);
	}

	function scanPage() {
		if (!settings.enabled) {
			clearMarks();
			return;
		}

		scanId += 1;
		const articles = [...document.querySelectorAll(ARTICLE_SELECTOR)];
		const candidates = articles
			.map((article, index) => ({
				article,
				data: extractArticle(article, index),
			}))
			.filter(({ data }) => data.text.length > 0 || data.userText.length > 0);
		const duplicateCounts = buildFingerprintCounts(candidates);
		let hidden = 0;
		let dimmed = 0;

		for (const item of candidates) {
			item.article.dataset.xmwScan = String(scanId);
			const result = scoreArticle(item.data, duplicateCounts);
			if (
				result.score >= threshold() &&
				!revealed.has(item.article) &&
				result.reasons[0] !== "白名单"
			) {
				applyResult(item.article, item.data, result);
				if (settings.hideMode === "dim") dimmed += 1;
				else hidden += 1;
			} else {
				restoreArticle(item.article);
			}
		}

		for (const article of articles) {
			if (article.dataset.xmwScan !== String(scanId)) restoreArticle(article);
		}
		updateStats(articles.length, candidates.length, hidden, dimmed);
	}

	function scheduleScan() {
		if (scanTimer) return;
		scanTimer = window.setTimeout(() => {
			scanTimer = 0;
			scanPage();
		}, 180);
	}

	function patchHistory() {
		if (window.__xmwHistoryPatched) return;
		window.__xmwHistoryPatched = true;
		for (const method of ["pushState", "replaceState"]) {
			const original = history[method];
			history[method] = function patchedHistory() {
				const result = original.apply(this, arguments);
				window.dispatchEvent(new Event("xmw:urlchange"));
				return result;
			};
		}
	}

	function resetForNavigation() {
		if (route === location.href) return;
		route = location.href;
		revealed = new WeakSet();
		clearMarks();
		scheduleScan("navigation");
	}

	function installMessages() {
		chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
			if (message?.type === "XMW_GET_STATS") {
				sendResponse({ ok: true, stats });
				return false;
			}
			if (message?.type === "XMW_RESCAN") {
				scheduleScan("popup");
				sendResponse({ ok: true });
				return false;
			}
			if (message?.type === "XMW_REVEAL_ALL") {
				document
					.querySelectorAll(
						`${ARTICLE_SELECTOR}[data-xmw-hidden], ${ARTICLE_SELECTOR}[data-xmw-dimmed]`,
					)
					.forEach((article) => {
						revealed.add(article);
						restoreArticle(article);
					});
				updateStats(stats.total, stats.scanned, 0, 0);
				sendResponse({ ok: true });
				return false;
			}
			return false;
		});

		chrome.storage.onChanged.addListener((changes, area) => {
			if (area !== "local" || !changes.filterSettings) return;
			settings = globalThis.XMW_RULES.normalizeSettings(
				changes.filterSettings.newValue,
			);
			compilePatterns();
			clearMarks();
			scheduleScan("settings");
		});
	}

	async function init() {
		const result = await chrome.storage.local.get({
			filterSettings: globalThis.XMW_RULES.DEFAULT_FILTER_SETTINGS,
		});
		settings = globalThis.XMW_RULES.normalizeSettings(result.filterSettings);
		compilePatterns();
		patchHistory();
		installMessages();
		observer = new MutationObserver(scheduleScan);
		observer.observe(document.documentElement, {
			childList: true,
			subtree: true,
		});
		window.addEventListener("xmw:urlchange", resetForNavigation, true);
		window.addEventListener("popstate", resetForNavigation, true);
		document.addEventListener("visibilitychange", () => {
			if (!document.hidden) scheduleScan("visible");
		});
		scheduleScan("init");
	}

	init();
})();
