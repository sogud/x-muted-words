const XMW_DEFAULT_FILTER_SETTINGS = Object.freeze({
	enabled: false,
	hideMode: "collapse",
	strictness: "balanced",
	whitelistHandles: [],
	customPatterns: [],
});

const XMW_DEFAULT_FILTER_PATTERNS = Object.freeze([
	{
		id: "adult-solicitation",
		label: "黄色引流",
		score: 5,
		pattern:
			"只入身体|不入生活|约炮|炮友|外围|空降|裸聊|福利姬|色情网站|黄色网站|成人用品|成人视频|找\\s*[炮pP]|同城可约|上门按摩|私密配送|催情|骚货|淫荡|约\\s*啪",
	},
	{
		id: "adult-platform",
		label: "色情平台广告",
		score: 5,
		pattern:
			"入驻.{0,8}平台|真人认证.{0,12}(隐私|平台)|附近的可加[微vV]|小号已禁言.{0,16}大号|隐私安全有保障",
	},
	{
		id: "contact-funnel",
		label: "联系方式引流",
		score: 3.5,
		pattern:
			"加\\s*(微信|微|vx|v信|V信|telegram|电报|tg)|(?:tg|telegram|电报)\\s*[:：@]|联系方式\\s*[:：]|私信.{0,8}(资源|福利|联系|进群)|主页.{0,8}(联系|匹配|资源)",
	},
	{
		id: "promotion-funnel",
		label: "推广引流",
		score: 3,
		pattern:
			"招代理|招商加盟|推广返佣|高佣|邀请码|免费领卡|免费领取|点击.{0,5}(链接|头像|主页)|扫码.{0,5}(加群|领取)|进群|课程代理|日赚|月入",
	},
	{
		id: "crypto-funnel",
		label: "加密推广",
		score: 3,
		pattern:
			"空投|alpha小群|私信tg|钱包邀请码|合约地址|pump\\.fun|DYOR|打新|质押.{0,8}(赚|奖励)",
	},
	{
		id: "profile-solicitation",
		label: "昵称引流",
		score: 5,
		pattern:
			"一对一.{0,4}调教|大一.{0,4}学妹|接主人.{0,4}任务|护士姐姐|女菩萨|真实少妇|单身看我简介|主人看简介|体制内老师.{0,8}(反差|返差)",
	},
	{
		id: "low-information-template",
		label: "低信息模板",
		score: 1.5,
		pattern:
			"^(?:support|agree|interesting|relatable|done|nice|gm|lfg|太真实了|确实|有道理|支持|不错)[.!！。 ]*$",
	},
]);

const XMW_BUNDLED_PACK_MANIFEST_PATH = "packs/manifest.json";
const XMW_REMOTE_PACK_MANIFEST_URL =
	"https://raw.githubusercontent.com/sogud/x-muted-words/main/packs/manifest.json";
const XMW_REMOTE_PACK_CACHE_TTL = 24 * 60 * 60 * 1000;

function xmwNormalizePackWords(value) {
	if (!Array.isArray(value)) return [];
	return [
		...new Set(
			value
				.filter((word) => typeof word === "string")
				.map((word) => word.normalize("NFKC").trim())
				.filter(
					(word) =>
						word.length > 0 &&
						word.length <= 80 &&
						/[\u3400-\u9fff]/.test(word),
				),
		),
	];
}

function xmwPackSummary(pack) {
	const { words: _words, ...summary } = pack;
	const count = Array.isArray(_words) ? _words.length : Number(pack.count) || 0;
	return { ...summary, count };
}

async function xmwFetchPackCollection(manifestUrl, resolveUrl) {
	const manifestResponse = await fetch(manifestUrl, { cache: "no-store" });
	if (!manifestResponse.ok)
		throw new Error(`词包索引请求失败：${manifestResponse.status}`);
	const manifest = await manifestResponse.json();
	if (!Array.isArray(manifest.packs) || manifest.packs.length > 10) {
		throw new Error("词包索引格式无效");
	}
	const packs = await Promise.all(
		manifest.packs.map(async (entry) => {
			const url = resolveUrl(entry);
			if (!url) throw new Error("词包地址无效");
			const response = await fetch(url, { cache: "no-store" });
			if (!response.ok) throw new Error(`词包请求失败：${response.status}`);
			const pack = await response.json();
			const words = xmwNormalizePackWords(pack?.words);
			if (!words.length || words.length > 5000) {
				throw new Error(`词包 ${entry.id || "unknown"} 内容无效`);
			}
			return {
				id: String(pack.id || entry.id || "unknown"),
				name: String(pack.name || entry.name || pack.id || "中文词包"),
				description: String(pack.description || entry.description || ""),
				category: String(pack.category || entry.category || "other"),
				version: String(pack.version || "unknown"),
				url,
				words,
			};
		}),
	);
	return {
		words: [...new Set(packs.flatMap((pack) => pack.words))],
		packs,
		fetchedAt: Date.now(),
		error: "",
	};
}

async function xmwLoadBundledPacks() {
	try {
		const result = await xmwFetchPackCollection(
			chrome.runtime.getURL(XMW_BUNDLED_PACK_MANIFEST_PATH),
			(entry) => {
				const file = String(entry?.file || "");
				if (!/^[a-z0-9._-]+\.json$/i.test(file)) {
					throw new Error("本地词包文件名无效");
				}
				return chrome.runtime.getURL(`packs/${file}`);
			},
		);
		return { ...result, fromCache: true };
	} catch (error) {
		return {
			words: [],
			packs: [],
			fetchedAt: 0,
			fromCache: false,
			error: error instanceof Error ? error.message : "本地词包读取失败",
		};
	}
}

async function xmwLoadRemotePack({ force = false } = {}) {
	const { remotePack: cached } = await chrome.storage.local.get({
		remotePack: null,
	});
	const cacheIsFresh =
		cached &&
		Array.isArray(cached.words) &&
		numberIsRecent(cached.fetchedAt, XMW_REMOTE_PACK_CACHE_TTL);
	if (!force && cacheIsFresh) return { ...cached, fromCache: true };

	try {
		const result = await xmwFetchPackCollection(
			XMW_REMOTE_PACK_MANIFEST_URL,
			(entry) => {
				const url = typeof entry?.url === "string" ? entry.url : "";
				if (
					!url.startsWith(
						"https://raw.githubusercontent.com/sogud/x-muted-words/",
					)
				) {
					throw new Error("词包地址不在允许范围内");
				}
				return url;
			},
		);
		await chrome.storage.local.set({ remotePack: result });
		return result;
	} catch (error) {
		if (cached && Array.isArray(cached.words)) {
			return {
				...cached,
				fromCache: true,
				error: error instanceof Error ? error.message : "远程词包更新失败",
			};
		}
		return {
			words: [],
			packs: [],
			fetchedAt: 0,
			fromCache: false,
			error: error instanceof Error ? error.message : "远程词包更新失败",
		};
	}
}

function numberIsRecent(value, ttl) {
	return Number.isFinite(Number(value)) && Date.now() - Number(value) < ttl;
}

function xmwMergePacks(remotePacks, bundledPacks) {
	const packs = new Map(bundledPacks.map((pack) => [pack.id, pack]));
	for (const pack of remotePacks) {
		const current = packs.get(pack.id);
		if (!current || Number(pack.version) >= Number(current.version)) {
			packs.set(pack.id, pack);
		}
	}
	return [...packs.values()];
}

async function xmwPrepareMutedWords({ force = false } = {}) {
	const [bundled, remote] = await Promise.all([
		xmwLoadBundledPacks(),
		xmwLoadRemotePack({ force }),
	]);
	const stored = await chrome.storage.local.get({
		mutedWords: [],
		customMutedWords: null,
	});
	const selectedPacks = xmwMergePacks(remote.packs, bundled.packs);
	const packWords = [...new Set(selectedPacks.flatMap((pack) => pack.words))];
	const packKeys = new Set(packWords.map((word) => word.normalize("NFKC")));
	const legacyWords = Array.isArray(stored.mutedWords) ? stored.mutedWords : [];
	const customSource = Array.isArray(stored.customMutedWords)
		? stored.customMutedWords
		: legacyWords.filter(
				(word) =>
					typeof word === "string" &&
					!packKeys.has(word.normalize("NFKC").trim()),
			);
	const customMutedWords = [
		...new Set(
			customSource
				.filter((word) => typeof word === "string")
				.map((word) => word.normalize("NFKC").trim())
				.filter((word) => word.length > 0 && word.length <= 80),
		),
	];
	const words = [...new Set([...packWords, ...customMutedWords])];
	await chrome.storage.local.set({ customMutedWords });
	await chrome.storage.local.remove("mutedWords");
	return {
		...remote,
		words,
		packs: selectedPacks.map(xmwPackSummary),
		bundledError: bundled.error,
	};
}

function xmwNormalizeHandle(value) {
	return String(value || "")
		.trim()
		.replace(/^@+/, "")
		.toLowerCase();
}

function xmwSplitLines(value) {
	if (Array.isArray(value)) {
		return value
			.map(String)
			.map((line) => line.trim())
			.filter(Boolean);
	}
	return String(value || "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

function xmwNormalizeFilterSettings(value) {
	const settings = {
		...XMW_DEFAULT_FILTER_SETTINGS,
		...(value && typeof value === "object" ? value : {}),
	};
	if (!["collapse", "hide", "dim"].includes(settings.hideMode)) {
		settings.hideMode = XMW_DEFAULT_FILTER_SETTINGS.hideMode;
	}
	if (!["relaxed", "balanced", "aggressive"].includes(settings.strictness)) {
		settings.strictness = XMW_DEFAULT_FILTER_SETTINGS.strictness;
	}
	settings.enabled = settings.enabled !== false;
	settings.whitelistHandles = xmwSplitLines(settings.whitelistHandles)
		.map(xmwNormalizeHandle)
		.filter(Boolean);
	settings.customPatterns = xmwSplitLines(settings.customPatterns);
	return settings;
}

function xmwEscapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function xmwParsePattern(value) {
	const line = String(value || "").trim();
	if (!line || line.startsWith("#")) return null;
	const regex = line.match(/^\/(.+)\/([a-z]*)$/i);
	if (regex) {
		try {
			const flags = [...new Set(`${regex[2]}iu`.split(""))].join("");
			return new RegExp(regex[1], flags);
		} catch (_error) {
			return null;
		}
	}
	return new RegExp(xmwEscapeRegExp(line), "iu");
}

globalThis.XMW_RULES = Object.freeze({
	loadBundledPacks: xmwLoadBundledPacks,
	DEFAULT_FILTER_SETTINGS: XMW_DEFAULT_FILTER_SETTINGS,
	DEFAULT_FILTER_PATTERNS: XMW_DEFAULT_FILTER_PATTERNS,
	normalizeHandle: xmwNormalizeHandle,
	normalizeSettings: xmwNormalizeFilterSettings,
	parsePattern: xmwParsePattern,
	loadRemotePack: xmwLoadRemotePack,
	prepareMutedWords: xmwPrepareMutedWords,
	remotePackManifestUrl: XMW_REMOTE_PACK_MANIFEST_URL,
});
