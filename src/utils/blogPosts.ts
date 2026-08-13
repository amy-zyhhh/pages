export interface BlogPost {
	title: string;
	date: string;
	category: string;
	summary: string;
	body: string;
	slug: string;
	sourcePath: string;
}

export interface BlogHeading {
	depth: number;
	id: string;
	text: string;
}

export type BlogBlock =
	| {
			type: "paragraph";
			text: string;
	  }
	| {
			type: "list";
			items: string[];
	  };

export function parseBlogPosts(modules: Record<string, unknown>) {
	return Object.entries(modules)
		.map(([path, raw]) => parseBlogPost(path, String(raw)))
		.sort((a, b) => b.date.localeCompare(a.date));
}

export function parseMarkdownBlocks(body: string): BlogBlock[] {
	const blocks: BlogBlock[] = [];
	let paragraph: string[] = [];
	let list: string[] = [];

	function flushParagraph() {
		if (paragraph.length === 0) return;
		blocks.push({ type: "paragraph", text: paragraph.join(" ") });
		paragraph = [];
	}

	function flushList() {
		if (list.length === 0) return;
		blocks.push({ type: "list", items: list });
		list = [];
	}

	for (const rawLine of body.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) {
			flushParagraph();
			flushList();
			continue;
		}

		if (line.startsWith("- ")) {
			flushParagraph();
			list.push(line.slice(2).trim());
			continue;
		}

		flushList();
		paragraph.push(line);
	}

	flushParagraph();
	flushList();
	return blocks;
}

export function parseBlogHeadings(body: string): BlogHeading[] {
	const used = new Map<string, number>();
	const headings: BlogHeading[] = [];
	let codeFence: string | null = null;

	for (const rawLine of body.split(/\r?\n/)) {
		const line = rawLine.trim();
		const fence = line.match(/^(`{3,}|~{3,})/);
		if (fence) {
			if (codeFence && fence[1].startsWith(codeFence[0])) {
				codeFence = null;
			} else if (!codeFence) {
				codeFence = fence[1];
			}
			continue;
		}
		if (codeFence) continue;

		const match = rawLine.match(/^(#{1,4})\s+(.+?)\s*#*$/);
		if (!match) continue;

		const text = match[2].replace(/<[^>]+>/g, "").trim();
		if (!text) continue;

		const baseId = slugifyHeading(text);
		const count = used.get(baseId) ?? 0;
		used.set(baseId, count + 1);

		headings.push({
			depth: match[1].length,
			id: count === 0 ? baseId : `${baseId}-${count}`,
			text,
		});
	}

	return headings;
}

function parseBlogPost(path: string, raw: string): BlogPost {
	const slug = path
		.replace(/\\/g, "/")
		.replace(/^.*?\/blogs\//, "")
		.replace(/\.md$/, "")
		.split("/")
		.map(toSlugPart)
		.join("/");
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	const frontmatter = match?.[1] ?? "";
	const body = (match?.[2] ?? raw).trim();

	return {
		slug,
		title: readField(frontmatter, "title") || slug,
		date: normalizeDate(readField(frontmatter, "date")),
		category: readField(frontmatter, "category") || "未分类",
		summary: readField(frontmatter, "summary") || "",
		body,
		sourcePath: path,
	};
}

function toSlugPart(value: string) {
	return value.trim().replace(/\s+/g, "-");
}

function readField(frontmatter: string, key: string) {
	const line = frontmatter
		.split(/\r?\n/)
		.find((item) => item.startsWith(`${key}:`));
	return line?.slice(key.length + 1).trim() ?? "";
}

function normalizeDate(value: string) {
	return value.replace(/\D/g, "").slice(0, 8);
}

function slugifyHeading(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s-]/gu, "")
		.replace(/\s+/g, "-") || "section";
}
