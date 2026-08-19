export interface InfoRssError {
	title: string;
	url: string;
	sourceId?: string;
	sourceName?: string;
	stage: string;
	message: string;
	createdAt: string;
}

export interface InfoRssSource {
	id: string;
	name: string;
}

export interface InfoRssPost {
	id?: string;
	title: string;
	date: string;
	time?: string;
	category: string;
	summary: string;
	department: string;
	sourceId?: string;
	sourceName?: string;
	source: string;
	xxid: string;
	slug: string;
	htmlPath?: string;
	preview: string;
	titleSummaryText?: string;
	searchText: string;
	sourceUrl?: string;
	contentHtml?: string;
	contentText?: string;
	attachments?: InfoRssAttachment[];
	fetchedAt?: string;
}

export interface InfoRssAttachment {
	id: string;
	name: string;
	url: string;
	path: string;
	size: string;
}

export interface InfoRssIndex {
	generatedAt: string;
	lastScrapeAt: string;
	total: number;
	errorCount: number;
	sources: InfoRssSource[];
	tags: string[];
	errors: InfoRssError[];
	posts: InfoRssPost[];
}

export function parseInfoRssIndex(raw: string): InfoRssPost[] {
	return parseInfoRssPayload(raw).posts;
}

export function parseInfoRssPayload(raw: string): InfoRssIndex {
	const parsed = JSON.parse(raw) as InfoRssPost[] | Partial<InfoRssIndex>;
	const posts = (Array.isArray(parsed) ? parsed : parsed.posts || []).map(normalizePost);
	const sortedPosts = posts.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
	const tags = Array.isArray(parsed) ? buildTags(sortedPosts) : parsed.tags || buildTags(sortedPosts);
	const sources = Array.isArray(parsed)
		? buildSources(sortedPosts)
		: normalizeSources(parsed.sources) || buildSources(sortedPosts);

	return {
		generatedAt: Array.isArray(parsed) ? "" : parsed.generatedAt || "",
		lastScrapeAt: Array.isArray(parsed) ? "" : parsed.lastScrapeAt || "",
		total: Array.isArray(parsed) ? sortedPosts.length : parsed.total || sortedPosts.length,
		errorCount: Array.isArray(parsed) ? 0 : parsed.errorCount || parsed.errors?.length || 0,
		sources,
		tags,
		errors: Array.isArray(parsed) ? [] : parsed.errors || [],
		posts: sortedPosts,
	};
}

export function infoRssPostSearchText(post: InfoRssPost) {
	return `${post.title} ${post.date} ${post.time || ""} ${post.category} ${post.department} ${displaySourceName(post.sourceId, post.sourceName)} ${post.searchText} ${post.contentText || ""}`.toLowerCase();
}

export function infoRssTitleSummarySearchText(post: InfoRssPost) {
	return `${post.title} ${post.summary} ${post.preview} ${post.titleSummaryText || ""}`.toLowerCase();
}

export function infoRssPreviewText(post: InfoRssPost, maxLength = 150) {
	const text = (post.summary || post.preview || "")
		.replace(/\s+/g, " ")
		.trim();

	return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function buildTags(posts: InfoRssPost[]) {
	const tags: string[] = [];
	posts.forEach((post) => {
		const tag = post.category?.trim();
		if (tag && !tags.includes(tag)) tags.push(tag);
	});
	return tags;
}

function buildSources(posts: InfoRssPost[]) {
	const sources: InfoRssSource[] = [];
	posts.forEach((post) => {
		const id = post.sourceId || "info_all";
		const name = displaySourceName(id, post.sourceName);
		if (!sources.some((source) => source.id === id)) {
			sources.push({ id, name });
		}
	});
	return sources;
}

function normalizeSources(sources?: InfoRssSource[]) {
	if (!sources?.length) return null;
	return sources.map((source) => ({
		id: source.id,
		name: displaySourceName(source.id, source.name),
	}));
}

function displaySourceName(id = "", name = "") {
	if (id === "info_all" && (!name || name === id)) return "清华信息门户-全部";
	if (name) return name;
	return id;
}

function normalizePost(post: InfoRssPost): InfoRssPost {
	const contentHtml = decodeInfoRssEntities(post.contentHtml || "");
	return {
		...post,
		title: decodeInfoRssEntities(post.title),
		summary: decodeInfoRssEntities(post.summary),
		preview: decodeInfoRssEntities(post.preview),
		titleSummaryText: decodeInfoRssEntities(post.titleSummaryText || ""),
		searchText: decodeInfoRssEntities(post.searchText),
		contentHtml: normalizeContentResourceUrls(contentHtml, post.sourceUrl),
		contentText: decodeInfoRssEntities(post.contentText || ""),
		attachments: post.attachments?.map((attachment) => ({
			...attachment,
			name: decodeInfoRssEntities(attachment.name),
		})),
	};
}

function normalizeContentResourceUrls(html: string, sourceUrl = "") {
	if (!html || !sourceUrl) return html;
	return html.replace(
		/(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)(\2)/gi,
		(match, prefix: string, quote: string, src: string, suffix: string) => {
			const absoluteSrc = toAbsoluteUrl(src, sourceUrl);
			return absoluteSrc ? `${prefix}${quote}${absoluteSrc}${suffix}` : match;
		},
	);
}

function toAbsoluteUrl(value: string, baseUrl: string) {
	const src = value.trim();
	if (!src || /^(?:data:|blob:|mailto:|tel:)/i.test(src)) return src;
	try {
		return new URL(src, baseUrl).toString();
	} catch {
		return "";
	}
}

export function decodeInfoRssEntities(value = "") {
	let text = String(value || "");
	for (let index = 0; index < 4; index += 1) {
		const decoded = text
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, "\"")
			.replace(/&#34;/g, "\"")
			.replace(/&#39;/g, "'")
			.replace(/&apos;/g, "'")
			.replace(/&ldquo;/g, "\u201c")
			.replace(/&rdquo;/g, "\u201d")
			.replace(/&lsquo;/g, "\u2018")
			.replace(/&rsquo;/g, "\u2019")
			.replace(/&mdash;/g, "\u2014")
			.replace(/&ndash;/g, "\u2013")
			.replace(/&middot;/g, "\u00b7")
			.replace(/&nbsp;/g, " ")
			.replace(/&amp;/g, "&");
		if (decoded === text) return decoded;
		text = decoded;
	}
	return text;
}
