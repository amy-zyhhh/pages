const CIC_OATH_HOST = "xxbg.cic.tsinghua.edu.cn";
const CIC_OATH_PATH = "/oath/detail_xxtg.jsp";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

export function isCicOathDetailUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === CIC_OATH_HOST && url.pathname === CIC_OATH_PATH;
  } catch {
    return false;
  }
}

export async function fetchAndParseCicOathDetail(url, { source, item, fallback = {} } = {}) {
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
    throw new Error(`CIC detail request failed: ${response.status} ${response.statusText}`);
  }

  const finalUrl = response.url || url;
  const html = await decodeResponse(response);
  return parseCicOathDetailHtml(html, finalUrl, { source, item, fallback });
}

export function parseCicOathDetailHtml(html, sourceUrl, { source, item, fallback = {} } = {}) {
  const normalizedHtml = String(html || "");
  const title = cleanText(
    matchFirst(normalizedHtml, /<div[^>]*class=["']?TD1["']?[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*<\/div>/i) ||
      fallback.title ||
      item?.bt_show ||
      item?.bt ||
      "未命名通知",
  );
  const subtitle = cleanText(
    matchFirst(
      normalizedHtml,
      /<div[^>]*class=["']?TD1["']?[^>]*style=["'][^"']*color\s*:\s*rgb\(128,\s*128,\s*128\)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    ),
  );
  const metaText = cleanText(normalizedHtml.match(/发布时间：[\s\S]*?访问计数：\s*\d+/i)?.[0] || "");
  const date = normalizeDate(matchFirst(metaText, /发布时间：\s*(\d{4}[-/]\d{2}[-/]\d{2})/i) || fallback.date || item?.time || "");
  const department =
    cleanText(matchFirst(metaText, /供稿单位：\s*([^　\s]+(?:\s*[^　\s]+)*?)\s*访问计数/i) || fallback.department || item?.dwmc_show || item?.dwmc || "") ||
    "";
  const contentInner = matchFirst(normalizedHtml, /<td[^>]*class=["']?td111["']?[^>]*>([\s\S]*?)<\/td>/i) || "";
  const contentHtml = cleanContentHtml(contentInner, sourceUrl);
  const contentText = htmlToText(contentHtml);
  const summary = makePreview(subtitle || fallback.summary || "");
  const attachments = extractAttachments(normalizedHtml, sourceUrl);
  const id = buildStableId(sourceUrl, item);
  const time = date ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : fallback.time || item?.time || "";

  return {
    id,
    xxid: item?.xxid || id,
    slug: id,
    title,
    date,
    time,
    category: fallback.category || item?.lmmc_show || item?.lmmc || "未分类",
    department,
    sourceId: source?.id || fallback.sourceId || "",
    sourceName: source?.name || fallback.sourceName || "",
    source: source?.name || fallback.source || "",
    sourceUrl,
    summary,
    preview: summary,
    contentHtml,
    contentText,
    attachments,
    searchText: `${title} ${date} ${time} ${department} ${subtitle} ${contentText}`.trim(),
    fetchedAt: new Date().toISOString(),
    cacheVersion: fallback.cacheVersion,
  };
}

async function decodeResponse(response) {
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "";
  const headerCharset = contentType.match(/charset=([^;\s]+)/i)?.[1];
  const utf8Preview = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const metaCharset = utf8Preview.match(/<meta[^>]+charset=["']?([^"'\s>]+)/i)?.[1];
  const charset = normalizeCharset(headerCharset || metaCharset || "utf-8");
  return new TextDecoder(charset, { fatal: false }).decode(buffer);
}

function normalizeCharset(value) {
  const charset = String(value || "").trim().toLowerCase();
  if (charset === "gb2312" || charset === "gbk" || charset === "gb18030") return "gb18030";
  return charset || "utf-8";
}

function cleanContentHtml(value, baseUrl) {
  let html = decodeHtml(value)
    .replace(/<p>\s*(?:&nbsp;|\s)*<\/p>/gi, "")
    .replace(/\s*class=["']?td111["']?/gi, "")
    .replace(/<br\s*\/?>/gi, "<br>")
    .trim();

  html = absolutizeAttributes(html, baseUrl);
  return html;
}

function extractAttachments(html, baseUrl) {
  const attachments = [];
  const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html))) {
    const attrs = match[1] || "";
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1] || "";
    const name = cleanText(match[2] || "");
    if (!href || /^javascript:/i.test(href)) continue;
    if (!isAttachmentLike(href, name)) continue;
    attachments.push({
      id: "",
      name: name || href.split("/").pop() || "附件",
      url: new URL(decodeHtml(href), baseUrl).toString(),
      path: "",
      size: "",
    });
  }
  return attachments;
}

function isAttachmentLike(href, name) {
  const text = `${href} ${name}`.toLowerCase();
  return /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z)(?:[?#]|$)/i.test(text) || text.includes("download") || text.includes("附件");
}

function absolutizeAttributes(html, baseUrl) {
  return html.replace(/\b(src|href)=["']([^"']+)["']/gi, (match, attr, value) => {
    if (/^(?:https?:|mailto:|javascript:|#)/i.test(value)) return match;
    return `${attr}="${new URL(decodeHtml(value), baseUrl).toString()}"`;
  });
}

function buildStableId(sourceUrl, item) {
  const url = new URL(sourceUrl);
  const boardid = url.searchParams.get("boardid") || "";
  const seq = url.searchParams.get("seq") || "";
  if (boardid && seq) return `cic-${boardid}-${seq}`;
  return item?.xxid || `cic-${hashString(sourceUrl)}`;
}

function hashString(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}

function normalizeDate(value) {
  const match = String(value || "").match(/\d{4}[-/]\d{2}[-/]\d{2}/);
  return match ? match[0].replaceAll("-", "").replaceAll("/", "") : "";
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
      .replace(/&ldquo;/g, "“")
      .replace(/&rdquo;/g, "”")
      .replace(/&lsquo;/g, "‘")
      .replace(/&rsquo;/g, "’")
      .replace(/&mdash;/g, "—")
      .replace(/&ndash;/g, "–")
      .replace(/&middot;/g, "·")
      .replace(/&copy;/g, "©")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
    if (decoded === text) return decoded;
    text = decoded;
  }
  return text;
}
