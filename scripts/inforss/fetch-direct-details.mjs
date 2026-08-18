import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAndParseCicOathDetail, isCicOathDetailUrl } from "./detail-parsers/cic-oath.mjs";
import { fetchAndParseCareerPosition, isCareerPositionUrl } from "./detail-parsers/career-position.mjs";
import { fetchAndParseGhxtDetail, isGhxtDetailUrl } from "./detail-parsers/ghxt-detail.mjs";
import { fetchAndParseKybgDetail, isKybgDetailUrl } from "./detail-parsers/kybg-detail.mjs";
import { fetchAndParseLibNews, isLibNewsUrl } from "./detail-parsers/lib-news.mjs";
import { fetchAndParseMyhomeNoticeDetail, isMyhomeNoticeDetailUrl } from "./detail-parsers/myhome-notice.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..");
const outputDir = join(projectRoot, "data-generated", "inforss");
const itemsDir = join(outputDir, "items");
const indexPath = join(outputDir, "index.json");
const CACHE_VERSION = 7;

const urls = process.argv.slice(2).filter(Boolean);
if (!urls.length) {
  console.error("Usage: node scripts/inforss/fetch-direct-details.mjs <url> [url...]");
  process.exit(1);
}

await mkdir(itemsDir, { recursive: true });

const existingPayload = await readIndexPayload();
const existingPostsByUrl = await readExistingPosts(itemsDir);
const newPosts = [];
const errors = [];

for (const url of urls) {
  try {
    const post = await fetchDirectDetail(url);
    const key = normalizeUrlKey(post.sourceUrl);
    const existing = existingPostsByUrl.get(key);
    const nextPost = existing ? preserveExistingContext(post, existing) : post;
    for (const oldKey of existing ? postUrlKeys(existing) : []) existingPostsByUrl.delete(oldKey);
    for (const nextKey of postUrlKeys(nextPost)) existingPostsByUrl.delete(nextKey);
    existingPostsByUrl.set(key, nextPost);
    newPosts.push(nextPost);
  } catch (error) {
    errors.push({
      title: url,
      url,
      sourceId: "direct-detail",
      sourceName: "直接详情页",
      stage: "direct-detail",
      message: errorMessage(error),
      createdAt: new Date().toISOString(),
    });
  }
}

const posts = uniquePosts(Array.from(existingPostsByUrl.values())).sort(
  (a, b) => String(b.time || "").localeCompare(String(a.time || "")) || String(a.title || "").localeCompare(String(b.title || "")),
);

await Promise.all(posts.map((post) => writeFile(join(itemsDir, `${post.id}.json`), `${JSON.stringify(post, null, 2)}\n`, "utf-8")));

const generatedAt = new Date().toISOString();
const mergedErrors = mergeErrors(existingPayload.errors || [], errors, urls);
const payload = {
  ...existingPayload,
  generatedAt,
  lastScrapeAt: generatedAt,
  total: posts.length,
  errorCount: mergedErrors.length,
  sources: mergeSources(existingPayload.sources || [], [{ id: "direct-detail", name: "直接详情页" }]),
  tags: Array.from(new Set(posts.map((post) => post.category).filter(Boolean))),
  errors: mergedErrors,
  posts,
};

await writeFile(indexPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

console.log(
  `Fetched ${newPosts.length} direct detail page(s), archived ${posts.length} total post(s), ${errors.length} error(s).`,
);
for (const post of newPosts) {
  console.log(`${post.date || "unknown"} ${post.title} -> /pages/inforss/${post.slug}/`);
}

async function fetchDirectDetail(url) {
  const source = { id: "direct-detail", name: "直接详情页" };
  const fallback = {
    category: "直接详情页",
    sourceId: source.id,
    sourceName: source.name,
    source: source.name,
    cacheVersion: CACHE_VERSION,
  };

  if (isCicOathDetailUrl(url)) {
    return fetchAndParseCicOathDetail(url, { source, fallback });
  }
  if (isCareerPositionUrl(url)) {
    return fetchAndParseCareerPosition(url, { source, fallback });
  }
  if (isGhxtDetailUrl(url)) {
    return fetchAndParseGhxtDetail(url, { source, fallback });
  }
  if (isKybgDetailUrl(url)) {
    return fetchAndParseKybgDetail(url, { source, fallback });
  }
  if (isLibNewsUrl(url)) {
    return fetchAndParseLibNews(url, { source, fallback });
  }
  if (isMyhomeNoticeDetailUrl(url)) {
    return fetchAndParseMyhomeNoticeDetail(url, { source, fallback });
  }
  throw new Error(`Unsupported direct detail URL: ${url}`);
}

async function readIndexPayload() {
  try {
    return JSON.parse(await readFile(indexPath, "utf-8"));
  } catch {
    return {};
  }
}

async function readExistingPosts(dir) {
  const postsByUrl = new Map();
  const files = await readdir(dir, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    files
      .filter((file) => file.isFile() && file.name.endsWith(".json"))
      .map(async (file) => {
        try {
          const post = JSON.parse(await readFile(join(dir, file.name), "utf-8"));
          for (const key of postUrlKeys(post)) postsByUrl.set(key, post);
        } catch {
          // Ignore broken cache files; the next successful fetch can rebuild the index.
        }
      }),
  );
  return postsByUrl;
}

function postUrlKeys(post) {
  return [post.sourceUrl, ...(post.alternateSourceUrls || [])]
    .map((url) => {
      try {
        return normalizeUrlKey(url);
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

function mergeSources(existing, additions) {
  const sourcesById = new Map(existing.map((source) => [source.id, source]));
  additions.forEach((source) => sourcesById.set(source.id, source));
  return Array.from(sourcesById.values());
}

function preserveExistingContext(post, existing) {
  if (isDirectDetailPost(existing)) return post;
  return {
    ...post,
    category: existing.category || post.category,
    department: existing.department || post.department,
    sourceId: existing.sourceId || post.sourceId,
    sourceName: existing.sourceName || post.sourceName,
    source: existing.source || post.source,
    alternateSourceUrls: uniqueStrings([...(post.alternateSourceUrls || []), ...(existing.alternateSourceUrls || []), existing.sourceUrl].filter((url) => url && url !== post.sourceUrl)),
  };
}

function mergeErrors(existingErrors, currentErrors, requestedUrls) {
  const requested = new Set(requestedUrls.map((url) => normalizeUrlKey(url)));
  const kept = existingErrors.filter((error) => {
    try {
      return !requested.has(normalizeUrlKey(error.url));
    } catch {
      return true;
    }
  });
  return [...kept, ...currentErrors];
}

function isDirectDetailPost(post) {
  return post?.sourceId === "direct-detail" || post?.category === "直接详情页";
}

function uniquePosts(posts) {
  const postsByIdentity = new Map();
  for (const post of posts) {
    const key = post.id || post.xxid || normalizeUrlKey(post.sourceUrl);
    if (key && !postsByIdentity.has(key)) postsByIdentity.set(key, post);
  }
  return Array.from(postsByIdentity.values());
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeUrlKey(value) {
  if (!value) return "";
  const url = new URL(value);
  url.hash = "";
  url.searchParams.delete("_csrf");
  return url.toString();
}

function errorMessage(error) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause && typeof cause === "object") {
    const code = "code" in cause ? cause.code : "";
    const message = "message" in cause ? cause.message : "";
    const detail = [code, message].filter(Boolean).join(": ");
    if (detail) return `${error.message} (${detail})`;
  }
  return error.message;
}
