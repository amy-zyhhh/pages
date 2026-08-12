import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchTsinghuaInfo } from "./adapters/tsinghua-info.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..");
const sourcesPath = join(__dirname, "sources.json");
const outputDir = join(projectRoot, "data-generated", "inforss");
const itemsDir = join(outputDir, "items");

const adapters = {
  "tsinghua-info": fetchTsinghuaInfo,
};

const runOptions = parseArgs(process.argv.slice(2));

await mkdir(itemsDir, { recursive: true });

const sources = JSON.parse(await readFile(sourcesPath, "utf-8")).filter((source) => source.enabled !== false);
const existingPostsByUrl = await readExistingPosts(itemsDir);
const seenUrlKeys = new Set(existingPostsByUrl.keys());
const allPosts = [];
const allErrors = [];

for (const source of sources) {
  const adapter = adapters[source.type];
  if (!adapter) {
    allErrors.push({
      title: source.name || source.id,
      url: source.listPageUrl || "",
      sourceId: source.id,
      sourceName: source.name,
      stage: "source",
      message: `未知信息源类型：${source.type}`,
      createdAt: new Date().toISOString(),
    });
    continue;
  }

  const result = await adapter(source, {
    existingPostsByUrl,
    seenUrlKeys,
    dateRange: runOptions.dateRange,
  });
  allPosts.push(...result.posts);
  allErrors.push(...result.errors);
}

const postsByUrl = new Map(existingPostsByUrl);
for (const post of allPosts) {
  const key = normalizeUrlKey(post.sourceUrl);
  if (key && !postsByUrl.has(key)) postsByUrl.set(key, post);
}

const posts = Array.from(postsByUrl.values()).sort(
  (a, b) => b.time.localeCompare(a.time) || a.title.localeCompare(b.title),
);

await mkdir(itemsDir, { recursive: true });
await mapLimit(
  posts,
  50,
  (post) => writeFile(join(itemsDir, `${post.id}.json`), `${JSON.stringify(post, null, 2)}\n`, "utf-8"),
);

const generatedAt = new Date().toISOString();
const payload = {
  generatedAt,
  lastScrapeAt: generatedAt,
  total: posts.length,
  errorCount: allErrors.length,
  sources: sources.map((source) => ({ id: source.id, name: source.name })),
  tags: Array.from(new Set(posts.map((post) => post.category).filter(Boolean))),
  errors: allErrors,
  posts,
};

await writeFile(join(outputDir, "index.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

console.log(
  `InfoRSS archived ${posts.length} posts (${allPosts.length} new this run${formatDateRangeLog(runOptions.dateRange)}) with ${allErrors.length} error(s).`,
);

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--daily") {
      options.dateRange = recentDateRange(2);
      continue;
    }
    if (arg === "--from") {
      options.from = args[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--to") {
      options.to = args[index + 1] || "";
      index += 1;
    }
  }

  if (options.from || options.to) {
    options.dateRange = normalizeDateRange(options.from, options.to);
  }

  return options;
}

function recentDateRange(daysBack) {
  return normalizeDateRange(dateKeyFromOffset(daysBack * -1), dateKeyFromOffset(0));
}

function dateKeyFromOffset(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return dateKey(date);
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function normalizeDateRange(from, to) {
  const start = normalizeDateKey(from);
  const end = normalizeDateKey(to);
  if (!start || !end) {
    throw new Error("Date range requires YYYYMMDD values for both --from and --to.");
  }
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

function normalizeDateKey(value) {
  const text = String(value || "").replace(/\D/g, "");
  return /^\d{8}$/.test(text) ? text : "";
}

function formatDateRangeLog(dateRange) {
  return dateRange ? `, range ${dateRange.from}-${dateRange.to}` : "";
}

function normalizeUrlKey(value) {
  if (!value) return "";
  const url = new URL(value);
  url.hash = "";
  url.searchParams.delete("_csrf");
  return url.toString();
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
          const key = normalizeUrlKey(post.sourceUrl);
          if (key) postsByUrl.set(key, post);
        } catch {
          // Ignore broken cache files; the next successful fetch will replace them.
        }
      }),
  );

  return postsByUrl;
}

async function mapLimit(items, limit, task) {
  const results = [];
  const concurrency = Math.max(1, limit);
  const workers = Array.from({ length: concurrency }, async (_, workerIndex) => {
    for (let index = workerIndex; index < items.length; index += concurrency) {
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
