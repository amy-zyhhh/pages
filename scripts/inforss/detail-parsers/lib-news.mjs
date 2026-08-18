const LIB_HOST = "lib.tsinghua.edu.cn";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

export function isLibNewsUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === LIB_HOST && /^\/info\/\d+\/\d+\.htm$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export async function fetchAndParseLibNews(url, { source, item, fallback = {} } = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "User-Agent": USER_AGENT,
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Library detail request failed: ${response.status} ${response.statusText}`);
  }

  const finalUrl = response.url || url;
  const html = await decodeResponse(response);
  return parseLibNewsHtml(html, finalUrl, { source, item, fallback });
}

export function parseLibNewsHtml(html, sourceUrl, { source, item, fallback = {} } = {}) {
  const normalizedHtml = String(html || "");
  const title = cleanText(matchFirst(normalizedHtml, /<h2\b[^>]*>([\s\S]*?)<\/h2>/i) || titleFromHead(normalizedHtml) || fallback.title || item?.bt_show || item?.bt || "Untitled");
  const category = cleanText(matchFirst(normalizedHtml, /<div\b[^>]*class=["'][^"']*\bcolumn\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)) || fallback.category || item?.lmmc_show || item?.lmmc || "direct-detail";
  const description = decodeHtml(matchFirst(normalizedHtml, /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i));
  const dateText = cleanText(matchFirst(normalizedHtml, /<div\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i));
  const date = normalizeDate(dateText) || normalizeDate(normalizedHtml) || normalizeDate(fallback.date || item?.time || "");
  const time = date ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : fallback.time || item?.time || "";
  const contentInner = matchFirst(normalizedHtml, /<div\b[^>]*id=["']vsb_content["'][^>]*>\s*<div\b[^>]*class=["']v_news_content["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  const contentHtml = cleanContentHtml(contentInner, sourceUrl);
  const contentText = htmlToText(contentHtml);
  const attachments = extractAttachments(contentHtml, sourceUrl);
  const summary = fallback.summary || makePreview(description);
  const id = buildStableId(sourceUrl, item);

  return {
    id,
    xxid: item?.xxid || id,
    slug: id,
    title,
    date,
    time,
    category,
    department: fallback.department || item?.dwmc_show || item?.dwmc || "",
    sourceId: source?.id || fallback.sourceId || "",
    sourceName: source?.name || fallback.sourceName || "",
    source: source?.name || fallback.source || "",
    sourceUrl,
    summary,
    preview: summary,
    contentHtml,
    contentText,
    attachments,
    searchText: `${title} ${date} ${time} ${description} ${contentText}`.trim(),
    fetchedAt: new Date().toISOString(),
    cacheVersion: fallback.cacheVersion,
  };
}

async function decodeResponse(response) {
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "";
  const headerCharset = contentType.match(/charset=([^;\s]+)/i)?.[1];
  const utf8Preview = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const metaCharset = utf8Preview.match(/charset\s*=\s*["']?([a-z0-9-]+)/i)?.[1];
  const charset = normalizeCharset(metaCharset || headerCharset || "utf-8");
  return new TextDecoder(charset, { fatal: false }).decode(buffer);
}

function normalizeCharset(value) {
  const charset = String(value || "").trim().toLowerCase();
  if (charset === "gb2312" || charset === "gbk" || charset === "gb18030") return "gb18030";
  return charset || "utf-8";
}

function titleFromHead(html) {
  return cleanText(matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i).replace(/-\s*.*$/, ""));
}

function cleanContentHtml(value, baseUrl) {
  let html = decodeHtml(value)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?span\b[^>]*>/gi, "")
    .replace(/\s*class=["'][^"']*["']/gi, "")
    .replace(/\s*id=["'][^"']*["']/gi, "")
    .replace(/\s*style=["'][^"']*["']/gi, "")
    .replace(/\s*mso-[^:;"]+\s*:\s*[^;"]+;?/gi, "")
    .replace(/<br\s*\/?>/gi, "<br>")
    .trim();

  html = absolutizeAttributes(html, baseUrl);
  return html;
}

function extractAttachments(html, baseUrl) {
  const attachments = [];
  const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html || ""))) {
    const attrs = match[1] || "";
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1] || "";
    const name = cleanText(match[2] || "");
    if (!href || /^javascript:/i.test(href)) continue;
    if (!isAttachmentLike(href, name)) continue;
    attachments.push({
      id: "",
      name: name || href.split("/").pop() || "attachment",
      url: new URL(decodeHtml(href), baseUrl).toString(),
      path: "",
      size: "",
    });
  }
  return attachments;
}

function isAttachmentLike(href, name) {
  return /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z)(?:[?#]|$)/i.test(`${href} ${name}`);
}

function absolutizeAttributes(html, baseUrl) {
  return html.replace(/\b(src|href)=["']([^"']+)["']/gi, (full, attr, value) => {
    if (/^(?:https?:|data:|mailto:|javascript:|#)/i.test(value)) return full;
    return `${attr}="${new URL(decodeHtml(value), baseUrl).toString()}"`;
  });
}

function buildStableId(sourceUrl, item) {
  const match = new URL(sourceUrl).pathname.match(/\/info\/(\d+)\/(\d+)\.htm$/i);
  if (match) return `lib-news-${match[1]}-${match[2]}`;
  return item?.xxid || `lib-news-${hashString(sourceUrl)}`;
}

function hashString(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}

function normalizeDate(value) {
  const text = String(value || "");
  const zh = text.match(/(\d{4})\s*[\u5e74]\s*(\d{1,2})\s*[\u6708]\s*(\d{1,2})\s*[\u65e5]?/);
  if (zh) return `${zh[1]}${zh[2].padStart(2, "0")}${zh[3].padStart(2, "0")}`;
  const date = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  return date ? `${date[1]}${date[2].padStart(2, "0")}${date[3].padStart(2, "0")}` : "";
}

function makePreview(text, maxLength = 150) {
  const clean = cleanText(text);
  return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
}

function htmlToText(html) {
  return cleanText(
    decodeHtml(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function cleanText(value) {
  return decodeHtml(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchFirst(text, pattern) {
  return String(text || "").match(pattern)?.[1] || "";
}

function decodeHtml(value) {
  let text = String(value || "");
  for (let index = 0; index < 4; index += 1) {
    const decoded = text
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&ldquo;/g, "\u201c")
      .replace(/&rdquo;/g, "\u201d")
      .replace(/&lsquo;/g, "\u2018")
      .replace(/&rsquo;/g, "\u2019")
      .replace(/&mdash;/g, "\u2014")
      .replace(/&ndash;/g, "\u2013")
      .replace(/&middot;/g, "\u00b7")
      .replace(/&copy;/g, "\u00a9")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
    if (decoded === text) return decoded;
    text = decoded;
  }
  return text;
}
