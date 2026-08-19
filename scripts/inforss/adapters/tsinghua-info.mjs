const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const CACHE_VERSION = 7;

import { fetchAndParseCicOathDetail, isCicOathDetailUrl } from "../detail-parsers/cic-oath.mjs";
import { fetchAndParseCareerPosition, isCareerPositionUrl } from "../detail-parsers/career-position.mjs";
import { fetchAndParseGhxtDetail, isGhxtDetailUrl } from "../detail-parsers/ghxt-detail.mjs";
import { fetchAndParseKybgDetail, isKybgDetailUrl } from "../detail-parsers/kybg-detail.mjs";
import { fetchAndParseLibNews, isLibNewsUrl } from "../detail-parsers/lib-news.mjs";
import { fetchAndParseMyhomeNoticeDetail, isMyhomeNoticeDetailUrl } from "../detail-parsers/myhome-notice.mjs";

export async function fetchTsinghuaInfo(source, options = {}) {
  const cookieJar = new Map();
  const errors = [];
  const posts = [];
  const seenUrlKeys = options.seenUrlKeys || new Set();
  const existingPostsByUrl = options.existingPostsByUrl || new Map();
  const dateRange = options.dateRange || null;

  try {
    const listPage = await requestPage(source.listPageUrl, { cookieJar });
    const csrf = cookieJar.get("XSRF-TOKEN");
    if (!csrf) {
      throw new Error(
        `\u672a\u80fd\u4ece\u5217\u8868\u9875 Cookie \u4e2d\u8bfb\u53d6 XSRF-TOKEN\uff08HTTP ${listPage.status} ${listPage.statusText}\uff09`,
      );
    }

    const pages = getPageLimit(source, dateRange);
    const detailConcurrency = Number(source.detailConcurrency || 6);
    for (let page = 1; page <= pages; page += 1) {
      const listUrl = buildApiUrl(source, "/b/info/xxfb_fg/xnzx/template/more", {
        ...(source.params || {}),
        currentPage: page,
        _csrf: csrf,
      });

      const listPayload = await requestJson(listUrl, {
        cookieJar,
        referer: source.listPageUrl,
      });
      const items = listPayload?.object?.dataList || [];
      let hasOlderItem = false;

      const pagePosts = await mapLimit(items, detailConcurrency, async (item) => {
        if (!item?.xxid) return;
        const itemDate = normalizeDate(item.time || item.fbsj || item.time_mobile || "");
        const rangeState = getDateRangeState(itemDate, dateRange);
        if (rangeState === "older") {
          hasOlderItem = true;
          return;
        }
        if (rangeState === "newer" || rangeState === "unknown") return;

        const urlKey = normalizeUrlKey(getItemSourceUrl(source, item));
        if (!urlKey) return;
        if (seenUrlKeys.has(urlKey)) return;
        seenUrlKeys.add(urlKey);

        try {
          return await fetchDetail(source, item, csrf, cookieJar, existingPostsByUrl);
        } catch (error) {
          errors.push(buildError(item, source, "detail", error));
        }
      });

      posts.push(...pagePosts.filter(Boolean));
      if (dateRange && hasOlderItem) break;
    }
  } catch (error) {
    errors.push({
      title: source.name,
      url: source.listPageUrl,
      sourceId: source.id,
      sourceName: source.name,
      stage: "list",
      message: errorMessage(error),
      createdAt: new Date().toISOString(),
    });
  }

  return { posts, errors };
}

function getDateRangeState(date, dateRange) {
  if (!dateRange) return "in-range";
  if (!date) return "unknown";
  if (date < dateRange.from) return "older";
  if (date > dateRange.to) return "newer";
  return "in-range";
}

function getPageLimit(source, dateRange) {
  const configuredPages = Number(source.pages || 3);
  if (!dateRange) return configuredPages;
  return Number(source.backfillPages || source.dateRangePages || configuredPages);
}

async function mapLimit(items, limit, task) {
  const results = [];
  const workers = Array.from({ length: Math.max(1, limit) }, async (_, workerIndex) => {
    for (let index = workerIndex; index < items.length; index += Math.max(1, limit)) {
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchDetail(source, item, csrf, cookieJar, existingPostsByUrl) {
  const detailPayload = await requestPortalDetail(source, item.xxid, csrf, cookieJar, {
    referer: absoluteUrl(source.apiBaseUrl, item.url || source.listPageUrl),
  });
  const detail = detailPayload?.object?.xxDto || item;
  const contentHtml = decodeHtml(detail.nr_show || detail.nr || item.nr_show || item.nr || "");
  const title = decodeHtml(detail.bt_show || detail.bt || item.bt_show || item.bt || "\u672a\u547d\u540d\u901a\u77e5");
  const time = detail.time || item.time || normalizeTimestamp(detail.fbsj || item.fbsj) || "";
  const date = normalizeDate(time);
  const sourceUrl = getDetailSourceUrl(source, detail, item);
  const attachments = normalizeAttachments(source.apiBaseUrl, detail.fjs_template || []);
  const contentText = htmlToText(contentHtml);
  const listSummary = htmlToText(decodeHtml(item.nr_show || item.nr || ""));
  const summary = makePreview(listSummary);
  const category = detail.lmmc_show || detail.lmmc || item.lmmc_show || item.lmmc || "\u672a\u5206\u7c7b";
  const department = detail.lydw_show || detail.lydw || item.dwmc_show || item.dwmc || "";

  const context = {
    category,
    department,
    sourceId: source.id,
    sourceName: source.name,
    source: source.name,
  };
  const fallback = {
    title,
    date,
    time,
    category,
    department,
    summary,
    sourceId: source.id,
    sourceName: source.name,
    source: source.name,
    cacheVersion: CACHE_VERSION,
  };
  const basePost = buildPortalPost({
    item,
    detail,
    title,
    date,
    time,
    category,
    department,
    source,
    sourceUrl,
    summary,
    contentHtml,
    contentText,
    attachments,
  });

  const finalDetail = shouldResolveFinalDetail(contentText, sourceUrl) ? await resolveFinalDetail(sourceUrl) : null;
  if (finalDetail?.type === "portal-detail" && normalizeUrlKey(finalDetail.url) !== normalizeUrlKey(sourceUrl)) {
    const finalPayload = await requestPortalDetail(source, finalDetail.xxid, csrf, cookieJar, {
      referer: sourceUrl,
    });
    const finalPortalDetail = finalPayload?.object?.xxDto || {};
    const finalContentHtml = decodeHtml(finalPortalDetail.nr_show || finalPortalDetail.nr || "");
    const finalContentText = htmlToText(finalContentHtml);
    return {
      ...buildPortalPost({
        item,
        detail: finalPortalDetail,
        title: decodeHtml(finalPortalDetail.bt_show || finalPortalDetail.bt || title),
        date,
        time,
        category,
        department,
        source,
        sourceUrl: finalDetail.url,
        summary,
        contentHtml: finalContentHtml,
        contentText: finalContentText,
        attachments: normalizeAttachments(source.apiBaseUrl, finalPortalDetail.fjs_template || []),
      }),
      xxid: finalDetail.xxid,
      alternateSourceUrls: uniqueStrings([sourceUrl]),
    };
  }

  if (finalDetail && finalDetail.type !== "portal-detail") {
    const cachedExternalPost = existingPostsByUrl.get(normalizeUrlKey(finalDetail.url));
    const parseExternalDetail = getExternalDetailParser(finalDetail.type);
    if (!parseExternalDetail) return null;
    const externalPost = await parseExternalDetail(finalDetail.url, {
      source,
      item,
      fallback,
    });
    return withListContext(preserveExistingContext(externalPost, cachedExternalPost), context, [sourceUrl]);
  }

  return basePost;
}

async function requestPortalDetail(source, xxid, csrf, cookieJar, { referer } = {}) {
  const detailUrl = buildApiUrl(source, "/b/info/xxfb_fg/xnzx/template/detail", {
    xxid,
    preview: "",
    language_manage: "",
    _csrf: csrf,
  });

  return requestJson(detailUrl, {
    cookieJar,
    referer,
  });
}

function buildPortalPost({
  item,
  detail,
  title,
  date,
  time,
  category,
  department,
  source,
  sourceUrl,
  summary,
  contentHtml,
  contentText,
  attachments,
}) {
  return {
    id: item.xxid,
    xxid: detail.xxid || item.xxid,
    slug: item.xxid,
    title,
    date,
    time,
    category,
    department,
    sourceId: source.id,
    sourceName: source.name,
    source: source.name,
    sourceUrl,
    summary,
    preview: summary,
    contentHtml,
    contentText,
    attachments,
    searchText: `${title} ${date} ${time} ${contentText}`.trim(),
    fetchedAt: new Date().toISOString(),
    cacheVersion: CACHE_VERSION,
  };
}

function preserveExistingContext(post, existing) {
  if (!existing || isDirectDetailPost(existing)) return post;
  return {
    ...post,
    category: existing.category || post.category,
    department: existing.department || post.department,
    sourceId: existing.sourceId || post.sourceId,
    sourceName: existing.sourceName || post.sourceName,
    source: existing.source || post.source,
    alternateSourceUrls: uniqueStrings([
      ...(post.alternateSourceUrls || []),
      ...(existing.alternateSourceUrls || []),
      existing.sourceUrl,
    ].filter((url) => url && url !== post.sourceUrl)),
  };
}

function withListContext(post, context, aliases = []) {
  const alternateSourceUrls = uniqueStrings([...(post.alternateSourceUrls || []), ...aliases].filter((url) => url && url !== post.sourceUrl));
  return {
    ...post,
    category: context.category || post.category,
    department: context.department || post.department,
    sourceId: context.sourceId || post.sourceId,
    sourceName: context.sourceName || post.sourceName,
    source: context.source || post.source,
    alternateSourceUrls,
  };
}

function isDirectDetailPost(post) {
  return post?.sourceId === "direct-detail" || post?.category === "\u76f4\u63a5\u8be6\u60c5\u9875";
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function shouldResolveFinalDetail(contentText, sourceUrl) {
  return !contentText || Boolean(classifyExternalDetailUrl(sourceUrl));
}

async function resolveFinalDetail(sourceUrl) {
  if (!sourceUrl) return "";
  const directDetail = classifyFinalDetailUrl(sourceUrl);
  if (directDetail) return directDetail;

  if (!shouldProbeDetailRedirect(sourceUrl)) return "";

  const response = await requestHtml(sourceUrl);
  const finalDetail = classifyFinalDetailUrl(response.url);
  if (finalDetail) return finalDetail;

  const clientRedirectUrl = extractClientRedirectUrl(response.html, response.url);
  return classifyFinalDetailUrl(clientRedirectUrl);
}

function classifyFinalDetailUrl(url) {
  const portalDetail = classifyPortalDetailUrl(url);
  if (portalDetail) return portalDetail;
  return classifyExternalDetailUrl(url);
}

function classifyPortalDetailUrl(value) {
  try {
    const url = new URL(value);
    const xxid = url.searchParams.get("xxid") || "";
    if (
      url.hostname === "info.tsinghua.edu.cn" &&
      /\/f\/info\/xxfb_fg\/xnzx\/template\/detail/.test(url.pathname) &&
      xxid
    ) {
      return { type: "portal-detail", url: url.toString(), xxid };
    }
  } catch {
    return null;
  }
  return null;
}

function classifyExternalDetailUrl(url) {
  if (isCicOathDetailUrl(url)) return { type: "cic-oath", url };
  if (isCareerPositionUrl(url)) return { type: "career-position", url };
  if (isGhxtDetailUrl(url)) return { type: "ghxt-detail", url };
  if (isKybgDetailUrl(url)) return { type: "kybg-detail", url };
  if (isLibNewsUrl(url)) return { type: "lib-news", url };
  if (isMyhomeNoticeDetailUrl(url)) return { type: "myhome-notice", url };
  return null;
}

function getExternalDetailParser(type) {
  if (type === "cic-oath") return fetchAndParseCicOathDetail;
  if (type === "career-position") return fetchAndParseCareerPosition;
  if (type === "ghxt-detail") return fetchAndParseGhxtDetail;
  if (type === "kybg-detail") return fetchAndParseKybgDetail;
  if (type === "lib-news") return fetchAndParseLibNews;
  if (type === "myhome-notice") return fetchAndParseMyhomeNoticeDetail;
  return null;
}

function shouldProbeDetailRedirect(value) {
  try {
    const url = new URL(value);
    return (
      url.hostname === "info.tsinghua.edu.cn" &&
      (/\/f\/info\/xxfb_fg\/xnzx\/template\/detail/.test(url.pathname) || url.pathname === "/f/info/route")
    );
  } catch {
    return false;
  }
}

async function requestHtml(url) {
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
    throw new Error(`Detail page request failed: ${response.status} ${response.statusText}`);
  }
  return {
    url: response.url || url,
    html: await response.text(),
  };
}

async function requestPage(url, { cookieJar } = {}) {
  const headers = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "User-Agent": USER_AGENT,
  };
  if (cookieJar?.size) headers.Cookie = serializeCookies(cookieJar);

  const response = await fetch(url, {
    method: "GET",
    headers,
    redirect: "follow",
  });
  updateCookies(cookieJar, response.headers);
  return response;
}

function extractClientRedirectUrl(html, baseUrl) {
  const text = String(html || "");
  const meta = text.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^"']*url=([^"']+)["']/i)?.[1];
  if (meta) return absoluteUrl(baseUrl, meta.trim());

  const script = text.match(/(?:window\.)?(?:location\.href|location)\s*=\s*["']([^"']+)["']/i)?.[1];
  if (script) return absoluteUrl(baseUrl, script.trim());

  return "";
}

function buildApiUrl(source, pathname, params) {
  const url = new URL(pathname, source.apiBaseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value ?? ""));
  });
  return url.toString();
}

async function requestJson(url, options) {
  const response = await request(url, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function request(url, { cookieJar, referer } = {}) {
  const headers = {
    Accept: "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Content-Type": "application/json;charset=utf-8",
    "User-Agent": USER_AGENT,
    "X-Requested-With": "XMLHttpRequest",
  };
  if (referer) headers.Referer = referer;
  if (cookieJar?.size) headers.Cookie = serializeCookies(cookieJar);

  const response = await fetch(url, {
    method: "POST",
    headers,
  });
  updateCookies(cookieJar, response.headers);
  return response;
}

function updateCookies(cookieJar, headers) {
  if (!cookieJar) return;
  const setCookie =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : splitSetCookieHeader(headers.get("set-cookie") || "");
  setCookie.forEach((cookie) => {
    const [pair] = cookie.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) cookieJar.set(pair.slice(0, eq), pair.slice(eq + 1));
  });
}

function splitSetCookieHeader(value) {
  if (!value) return [];
  return String(value).split(/,(?=\s*[^;,=\s]+=[^;,]*)/g);
}

function serializeCookies(cookieJar) {
  return Array.from(cookieJar.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function absoluteUrl(base, value) {
  if (!value) return "";
  return new URL(value, base).toString();
}

function getItemSourceUrl(source, item) {
  return absoluteUrl(source.apiBaseUrl, item.zxurl || item.url || `/f/info/xxfb_fg/xnzx/template/detail?xxid=${item.xxid}`);
}

function getDetailSourceUrl(source, detail, item) {
  return absoluteUrl(
    source.apiBaseUrl,
    detail.zxurl || detail.url || item.zxurl || item.url || `/f/info/xxfb_fg/xnzx/template/detail?xxid=${item.xxid}`,
  );
}

function normalizeUrlKey(value) {
  if (!value) return "";
  const url = new URL(value);
  url.hash = "";
  url.searchParams.delete("_csrf");
  return url.toString();
}

function normalizeDate(value) {
  if (!value) return "";
  if (typeof value === "number") return normalizeDate(normalizeTimestamp(value));
  const match = String(value).match(/\d{4}[-/]\d{2}[-/]\d{2}/);
  return match ? match[0].replaceAll("-", "").replaceAll("/", "") : "";
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function normalizeAttachments(base, attachments) {
  return attachments.map((attachment) => ({
    id: attachment.fjid || attachment.id || "",
    name: decodeHtml(attachment.wjmc || ""),
    url: absoluteUrl(base, `/f/wj/view?wjid=${encodeURIComponent(attachment.wjid || "")}`),
    path: attachment.wjlj || "",
    size: attachment.transform_wjdx || String(attachment.wjdx || ""),
  }));
}

function makePreview(text, maxLength = 150) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
}

function htmlToText(html) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
    if (decoded === text) return decoded;
    text = decoded;
  }
  return text;
}
function buildError(item, source, stage, error) {
  return {
    title: item.bt_show || item.bt || item.xxid || source.name,
    url: item.url ? absoluteUrl(source.apiBaseUrl, item.url) : source.listPageUrl,
    sourceId: source.id,
    sourceName: source.name,
    stage,
    message: errorMessage(error),
    createdAt: new Date().toISOString(),
  };
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

