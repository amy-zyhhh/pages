const MYHOME_HOST = "myhome.tsinghua.edu.cn";
const MYHOME_NOTICE_PATH = "/Netweb_List/News_notice_Detail.aspx";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

export function isMyhomeNoticeDetailUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === MYHOME_HOST && url.pathname.toLowerCase() === MYHOME_NOTICE_PATH.toLowerCase();
  } catch {
    return false;
  }
}

export async function fetchAndParseMyhomeNoticeDetail(url, { source, item, fallback = {} } = {}) {
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
    throw new Error(`Myhome detail request failed: ${response.status} ${response.statusText}`);
  }

  const finalUrl = response.url || url;
  const html = await decodeResponse(response);
  return parseMyhomeNoticeDetailHtml(html, finalUrl, { source, item, fallback });
}

export function parseMyhomeNoticeDetailHtml(html, sourceUrl, { source, item, fallback = {} } = {}) {
  const normalizedHtml = String(html || "");
  const title = cleanText(
    extractSpan(normalizedHtml, "News_notice_DetailCtrl1_lblTitle") ||
      fallback.title ||
      item?.bt_show ||
      item?.bt ||
      "未命名通知",
  );
  const metaText = cleanText(extractSpan(normalizedHtml, "News_notice_DetailCtrl1_lbladd_time") || "");
  const department = cleanText(matchFirst(metaText, /^(.+?)\s*发布于/i) || fallback.department || item?.dwmc_show || item?.dwmc || "");
  const date = normalizeDate(matchFirst(metaText, /发布于\s*(\d{4}年\d{2}月\d{2}日)/i) || fallback.date || item?.time || "");
  const time = normalizeTime(metaText, date, fallback.time || item?.time || "");
  const contentInner = extractSpan(normalizedHtml, "News_notice_DetailCtrl1_lblquality_content");
  const contentHtml = cleanContentHtml(contentInner, sourceUrl);
  const contentText = htmlToText(contentHtml);
  const attachments = [
    ...extractAttachments(extractSpan(normalizedHtml, "News_notice_DetailCtrl1_lblattachment1"), sourceUrl),
    ...extractAttachments(extractSpan(normalizedHtml, "News_notice_DetailCtrl1_lblattachment"), sourceUrl),
  ];
  const id = buildStableId(sourceUrl, item);

  return {
    id,
    xxid: item?.xxid || id,
    slug: id,
    title,
    date,
    time,
    category: fallback.category || item?.lmmc_show || item?.lmmc || "最新公告",
    department,
    sourceId: source?.id || fallback.sourceId || "",
    sourceName: source?.name || fallback.sourceName || "",
    source: source?.name || fallback.source || "",
    sourceUrl,
    summary: fallback.summary || "",
    preview: fallback.summary || "",
    contentHtml,
    contentText,
    attachments,
    searchText: `${title} ${date} ${time} ${department} ${contentText}`.trim(),
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
  const charset = normalizeCharset(headerCharset || metaCharset || "utf-8");
  return new TextDecoder(charset, { fatal: false }).decode(buffer);
}

function normalizeCharset(value) {
  const charset = String(value || "").trim().toLowerCase();
  if (charset === "gb2312" || charset === "gbk" || charset === "gb18030") return "gb18030";
  return charset || "utf-8";
}

function extractSpan(html, id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return matchFirst(html, new RegExp(`<span\\b[^>]*id=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/span>`, "i"));
}

function cleanContentHtml(value, baseUrl) {
  return absolutizeAttributes(decodeHtml(value).trim(), baseUrl);
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

function absolutizeAttributes(html, baseUrl) {
  return html.replace(/\b(src|href)=["']([^"']+)["']/gi, (match, attr, value) => {
    if (/^(?:https?:|data:|mailto:|javascript:|#)/i.test(value)) return match;
    return `${attr}="${new URL(decodeHtml(value), baseUrl).toString()}"`;
  });
}

function buildStableId(sourceUrl, item) {
  const url = new URL(sourceUrl);
  const code = url.searchParams.get("code") || "";
  if (code) return `myhome-notice-${code}`;
  return item?.xxid || `myhome-notice-${hashString(sourceUrl)}`;
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
  const zh = text.match(/(\d{4})年(\d{2})月(\d{2})日/);
  if (zh) return `${zh[1]}${zh[2]}${zh[3]}`;
  const date = text.match(/\d{4}[-/]\d{2}[-/]\d{2}/);
  return date ? date[0].replaceAll("-", "").replaceAll("/", "") : "";
}

function normalizeTime(metaText, date, fallback) {
  const clock = String(metaText || "").match(/(\d{2}:\d{2})/)?.[1] || "";
  if (date && clock) return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} ${clock}`;
  if (date) return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  return fallback;
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
