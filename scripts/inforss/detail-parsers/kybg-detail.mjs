const KYBG_HOST = "kyybgxx.cic.tsinghua.edu.cn";
const KYBG_DETAIL_PATH = "/kybg/detail.jsp";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

export function isKybgDetailUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === KYBG_HOST && url.pathname === KYBG_DETAIL_PATH;
  } catch {
    return false;
  }
}

export async function fetchAndParseKybgDetail(url, { source, item, fallback = {} } = {}) {
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
    throw new Error(`KYBG detail request failed: ${response.status} ${response.statusText}`);
  }

  const finalUrl = response.url || url;
  const html = await decodeResponse(response);
  return parseKybgDetailHtml(html, finalUrl, { source, item, fallback });
}

export function parseKybgDetailHtml(html, sourceUrl, { source, item, fallback = {} } = {}) {
  const normalizedHtml = String(html || "");
  const titleValues = extractStyleTitles(normalizedHtml);
  const title = cleanText(titleValues[0] || fallback.title || item?.bt_show || item?.bt || "Untitled");
  const subtitle = cleanText(titleValues[1] || "");
  const contentInner = extractContentInner(normalizedHtml, titleValues);
  const contentHtml = cleanContentHtml(contentInner, sourceUrl);
  const contentText = htmlToText(contentHtml);
  const attachments = extractAttachments(contentHtml, sourceUrl);
  const date = normalizeDate(
    matchFirst(normalizedHtml, /\[(\d{4}[-/]\d{1,2}[-/]\d{1,2})[\s&nbsp;]*/i) || fallback.date || item?.time || "",
  );
  const time = date ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : fallback.time || item?.time || "";
  const id = buildStableId(sourceUrl, item);
  const summary = makePreview(subtitle || fallback.summary || "");

  return {
    id,
    xxid: item?.xxid || id,
    slug: id,
    title,
    date,
    time,
    category: fallback.category || item?.lmmc_show || item?.lmmc || "\u79d1\u7814\u529e\u516c",
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
    searchText: `${title} ${date} ${time} ${subtitle} ${contentText}`.trim(),
    fetchedAt: new Date().toISOString(),
    cacheVersion: fallback.cacheVersion,
  };
}

async function decodeResponse(response) {
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "";
  const headerCharset = contentType.match(/charset=([^;\s]+)/i)?.[1];
  const utf8Preview = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const metaCharset = utf8Preview.match(/<meta[^>]+charset=["']?([^"'\s/>]+)/i)?.[1];
  const charset = normalizeCharset(metaCharset || headerCharset || "utf-8");
  return new TextDecoder(charset, { fatal: false }).decode(buffer);
}

function normalizeCharset(value) {
  const charset = String(value || "").trim().toLowerCase();
  if (charset === "gb2312" || charset === "gbk" || charset === "gb18030") return "gb18030";
  return charset || "utf-8";
}

function extractStyleTitles(html) {
  const titles = [];
  const pattern = /<span\b[^>]*class=["']?style1["']?[^>]*>([\s\S]*?)<\/span>/gi;
  let match;
  while ((match = pattern.exec(html)) && titles.length < 2) {
    const text = cleanText(match[1]);
    if (text) titles.push(text);
  }
  return titles;
}

function extractContentInner(html) {
  const titlePattern = /<span\b[^>]*class=["']?style1["']?[^>]*>[\s\S]*?<\/span>/gi;
  let titleEnd = 0;
  let match;
  while ((match = titlePattern.exec(html))) {
    titleEnd = titlePattern.lastIndex;
  }

  const tail = html.slice(titleEnd || 0);
  const contentMatch = tail.match(/<td\b[^>]*>\s*((?:<P\b[\s\S]*?))<\/td>\s*<\/tr>\s*<tr>\s*<td\b[^>]*height=["']?1["']?/i);
  if (contentMatch) return contentMatch[1];

  return matchFirst(tail, /<td\b[^>]*>\s*((?:<P\b[\s\S]*?)<\/td>)/i).replace(/<\/td>\s*$/i, "");
}

function cleanContentHtml(value, baseUrl) {
  let html = decodeHtml(value)
    .replace(/<\?xml:[^>]*>/gi, "")
    .replace(/<\/?o:p\b[^>]*>/gi, "")
    .replace(/\s*mso-[^:;"]+\s*:\s*[^;"]+;?/gi, "")
    .replace(/\s*class=["']?MsoNormal["']?/gi, "")
    .replace(/\s*lang=["']?EN-US["']?/gi, "")
    .replace(/<font\b[^>]*>/gi, "")
    .replace(/<\/font>/gi, "")
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
      name: name || href.split("/").pop() || "\u9644\u4ef6",
      url: new URL(decodeHtml(href), baseUrl).toString(),
      path: "",
      size: "",
    });
  }
  return attachments;
}

function isAttachmentLike(href, name) {
  const text = `${href} ${name}`.toLowerCase();
  return /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z)(?:[?#]|$)/i.test(text) || text.includes("download");
}

function absolutizeAttributes(html, baseUrl) {
  return html.replace(/\b(src|href)=["']([^"']+)["']/gi, (full, attr, value) => {
    if (/^(?:https?:|data:|mailto:|javascript:|#)/i.test(value)) return full;
    return `${attr}="${new URL(decodeHtml(value), baseUrl).toString()}"`;
  });
}

function buildStableId(sourceUrl, item) {
  const url = new URL(sourceUrl);
  const boardid = url.searchParams.get("boardid") || "";
  const seq = url.searchParams.get("seq") || "";
  if (boardid && seq) return `kybg-${boardid}-${seq}`;
  return item?.xxid || `kybg-${hashString(sourceUrl)}`;
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
  const date = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (date) return `${date[1]}${date[2].padStart(2, "0")}${date[3].padStart(2, "0")}`;
  const zh = text.match(/(\d{4})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})/);
  return zh ? `${zh[1]}${zh[2].padStart(2, "0")}${zh[3].padStart(2, "0")}` : "";
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
