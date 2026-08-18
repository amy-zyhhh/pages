# Navigation Page

一个基于 Astro 的个人导航、博客和信息归档项目。它把常用网页入口、加密导航、Markdown 博客和本地缓存的 InfoRSS 信息集中到一个静态站点中，适合部署到 GitHub Pages 这类静态托管平台。

## 功能概览

- 首页按分类展示导航卡片，支持置顶入口和当前页链接搜索。
- 加密页展示私有导航，并可以搜索加密导航、blogs 和 InfoRSS。
- blogs 使用根目录 `blogs/` 统一管理，支持子文件夹整理、分类入口、日期归档、全文检索和详情页目录。
- Markdown 文章支持相对路径图片，也兼容常见 HTML 图片写法。
- InfoRSS 支持抓取列表和详情正文，形成长期本地归档。
- InfoRSS 列表页默认只展示今天和昨天的信息；搜索、筛选和日期检索会覆盖全部归档。
- 所有搜索都支持点击“搜索”按钮或按回车提交；按 `/` 只负责展开并聚焦当前页搜索框，不会自动输入 `/`。
- 站点可以静态构建，生成的页面不依赖运行时服务器。

## 本地使用

安装依赖：

```powershell
npm.cmd install
```

启动本地预览：

```powershell
npx.cmd astro dev --background
```

开发服务管理：

```powershell
npx.cmd astro dev status
npx.cmd astro dev logs
npx.cmd astro dev stop
```

常用本地地址：

```text
http://localhost:4321/pages/
http://localhost:4321/pages/blogs/
http://localhost:4321/pages/inforss/
```

构建检查：

```powershell
npm.cmd run build
```

## 导航维护

首页导航数据：

```text
src/data/links.yaml
```

加密页导航数据：

```text
src/data/protected-links.yaml
```

新增链接示例：

```yaml
- name: 示例网站
  url: https://example.com
  category: 常用工具
  description: 用于搜索匹配的简短说明
  tag: 示例
  order: 80
  pinned: false
  icon: example.com
```

字段说明：

- `name`：卡片显示名称。
- `url`：点击后打开的地址。
- `category`：分类名称，同名分类会自动合并。
- `description`：搜索用说明，不显示在卡片主体中。
- `tag`：搜索用标签。
- `order`：排序数字，数字越小越靠前。
- `pinned`：是否出现在首页置顶区域。
- `icon`：favicon 使用的域名；加载失败时会显示文字标识。
- `target`：打开方式，站内链接可使用 `_self`。

## 加密导航

相关配置：

```text
src/data/settings.json
```

`protectedAccess.passwordHash` 是口令的 SHA-256 值，`maxAttempts` 是允许错误次数，`lockMinutes` 是临时锁定分钟数。

生成新口令哈希：

```powershell
node -e "console.log(require('crypto').createHash('sha256').update('你的口令').digest('hex'))"
```

注意：加密导航是前端校验，只适合避免随手打开，不适合保存真正敏感的信息。

## Blogs

博客内容集中放在项目根目录：

```text
blogs/
```

可以直接放 `.md` 文件，也可以放进子文件夹。子文件夹只用于个人整理，不会体现在网页层级或分类里；网页会递归收录 `blogs/` 下的全部 Markdown 文件。

文章示例：

```md
---
title: 示例标题
date: 20260731
category: 项目
summary: 一句话摘要，会显示在博客预览里。
---

这里写正文。
```

字段说明：

- `title`：文章标题。
- `date`：8 位数字日期，格式为 `YYYYMMDD`。
- `category`：分类入口，用于整理归档。
- `summary`：列表页和搜索结果里的预览摘要；没有 `summary` 时不显示摘要。

### 博客图片

推荐使用 Markdown 相对路径：

```md
![图片说明](./文章名.assets/01.png)
```

也兼容常见 HTML 图片写法：

```html
<img src="./文章名.assets/01.png" alt="图片说明" style="zoom:33%;" />
```

图片可以放在文章旁边的 `.assets` 文件夹中，例如：

```text
blogs/分类/
  示例文章.md
  示例文章.assets/
    01.png
```

HTML 图片目前主要读取整体缩放百分比，例如 `style="zoom:33%;"`，并转换成网页可用的图片宽度。建议图片保留 `.png`、`.jpg`、`.jpeg`、`.webp` 等常见扩展名。

## InfoRSS

InfoRSS 用于把外部信息源内容抓取到本地，生成可部署的静态归档。

抓取命令：

```powershell
npm.cmd run fetch:inforss
```

日常抓取命令：

```powershell
npm.cmd run fetch:inforss:daily
```

日常抓取按日期窗口运行，只抓取运行当天、昨天和前一天共三天的信息。抓取完成后会和全部历史归档按原文链接去重，重复链接直接跳过。

手动指定日期范围：

```powershell
node scripts/inforss/fetch.mjs --from 20260810 --to 20260812
```

按月补抓一个月：

```powershell
npm.cmd run fetch:inforss:month
```

按月补抓脚本会从当前月份开始，向前推进；每次运行只抓取一个月的信息，并把下一次要抓取的月份记录在：

```text
scripts/inforss/month-state.json
```

指定某个月份补抓：

```powershell
node scripts/inforss/fetch-month.mjs --month 202608
```

配置入口：

```text
scripts/inforss/sources.json
```

抓取源示例：

```json
{
  "id": "source-example",
  "name": "示例信息源",
  "enabled": true,
  "type": "tsinghua-info",
  "listPageUrl": "https://example.com/list",
  "apiBaseUrl": "https://example.com",
  "pages": 3,
  "backfillPages": 40,
  "detailConcurrency": 6,
  "params": {
    "oType": "mr",
    "lmid": "all",
    "lydw": "",
    "length": 30,
    "xxflid": ""
  }
}
```

字段说明：

- `pages`：日常抓取扫描的列表页数，建议保持较小。
- `backfillPages`：按日期或按月补抓时扫描的列表页数，用于翻到更早内容。
- `detailConcurrency`：详情页并发请求数量。
- `params`：列表接口参数，不同栏目通常通过这里区分。

抓取逻辑：

- 先访问列表页，获取请求接口需要的令牌或 Cookie。
- 再请求列表接口，得到文章列表。
- 如果指定了日期范围，只处理范围内的列表项；列表翻到早于范围的日期后会提前停止。
- 对新文章请求详情接口，并缓存详情正文。
- 只保存附件链接，不下载附件文件。
- 正文、摘要、分类、来源、附件链接等内容会写入本地归档。

生成内容：

```text
data-generated/inforss/index.json
data-generated/inforss/items/*.json
```

长期归档规则：

- 以文章原文链接 `sourceUrl` 作为唯一标准去重。
- 如果新抓取结果的链接已存在于全部归档中，直接跳过。
- 已归档内容不会被新内容覆盖。
- 不在最新列表里的旧内容会继续保留，用于长期检索和归档。

页面展示规则：

- `/pages/inforss/` 默认只显示今天和昨天两天的信息。
- 输入关键词、选择日期或使用分类筛选时，检索范围是全部归档内容。
- 详情页显示本地缓存正文，并保留“查看原文”按钮。

## 搜索范围

项目刻意使用显式搜索范围。以后新增内容类型时，不能自动进入任意搜索框，必须在对应页面代码中明确接入。

- 首页：只搜索首页当前导航链接；手动输入 `/关键词` 并提交时触发网页搜索。
- 加密页：搜索加密导航、blogs 和 InfoRSS；链接结果优先显示，blogs 和 InfoRSS 使用文章预览样式。
- Blogs 页：只搜索 blogs，范围包括标题、日期、分类、摘要和正文全文。
- InfoRSS 页：默认展示今天和昨天；“全部内容（含正文）”会搜索正文缓存，“标题与摘要”用于快速筛选。

快捷键：

- `/`：展开并聚焦当前页面搜索框，不会自动输入 `/` 字符。
- `Esc`：清空搜索并取消聚焦。

网页搜索配置：

```text
src/data/settings.json
```

如需更换搜索引擎，修改 `webSearch.url`，保留 `{query}` 作为关键词占位符。

## 自动归档

安装每日抓取计划任务：

```powershell
npm.cmd run install:inforss-task
```

每日任务默认在本机 03:00 运行：

```powershell
npm.cmd run daily:inforss
```

每日任务会执行：

1. 抓取当天、昨天和前一天共三天的信息。
2. 构建 Astro 静态页面。
3. 暂存 `data-generated/inforss` 归档数据。
4. 如果归档数据有变化，就提交并推送当前分支。
5. 如果没有新归档内容，就不提交。

注意：每日任务不会自动提交 `src/`、`scripts/`、`README.md`、`package.json` 等代码和配置改动。页面代码、抓取配置、README 的修改仍然需要手动提交。

安装按月补抓计划任务：

```powershell
npm.cmd run install:inforss-backfill-task
```

按月补抓任务默认在本机 03:30 运行：

```powershell
npm.cmd run backfill:inforss:month
```

它每次只补抓一个月的信息，抓完后会构建、提交 `data-generated/inforss` 和 `scripts/inforss/month-state.json`，然后推送当前分支。等历史内容补全后，可以停止这个任务：

```powershell
npm.cmd run uninstall:inforss-backfill-task
```

修改每日任务时间：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/inforss/install-daily-task.ps1 -Time "21:30"
```

手动试跑每日任务：

```powershell
npm.cmd run daily:inforss
```

查看任务日志：

```text
logs/inforss/
```

## 部署

构建静态页面：

```powershell
npm.cmd run build
```

GitHub Actions 配置：

```text
.github/workflows/deploy.yml
```

Astro 部署配置：

```text
astro.config.mjs
```

如果部署到项目页，通常需要配置 `base`；如果部署到用户或组织主页，通常不需要配置 `base`。调整部署地址时，同步检查 `site` 和 `base`。

## 关键文件

```text
src/pages/index.astro                       首页
src/pages/protected.astro                   加密导航页
src/pages/blogs/index.astro                 博客列表页
src/pages/blogs/[...slug].astro             博客详情页
src/pages/blogs/category/[category].astro   博客分类页
src/pages/inforss/index.astro               InfoRSS 列表页
src/pages/inforss/[...slug].astro           InfoRSS 详情页
src/components/Topbar.astro                 统一顶栏壳层
src/components/LinkCard.astro               首页导航卡片
src/components/ProtectedCard.astro          加密页导航卡片
src/components/ArticlePreviewCard.astro     blogs 和 InfoRSS 共用预览卡片
src/components/MobilePanelScript.astro      移动端搜索和筛选展开逻辑
src/styles/shared.css                       全站共享样式
src/utils/blogPosts.ts                      博客解析和全文索引
src/utils/infoRssPosts.ts                   InfoRSS 解析和实体清理
src/utils/searchItems.ts                    搜索项目转换
src/utils/remarkLooseImages.mjs             博客图片兼容处理
scripts/inforss/fetch.mjs                   InfoRSS 抓取入口
scripts/inforss/fetch-month.mjs             InfoRSS 按月补抓入口
scripts/inforss/sources.json                InfoRSS 抓取源配置
scripts/inforss/adapters/                   InfoRSS 站点适配器
scripts/inforss/daily-update.ps1            本地抓取、构建、提交和推送
scripts/inforss/install-daily-task.ps1      安装 Windows 每日计划任务
scripts/inforss/install-monthly-backfill-task.ps1  安装 Windows 按月补抓计划任务
scripts/inforss/uninstall-monthly-backfill-task.ps1  停止 Windows 按月补抓计划任务
scripts/inforss/month-state.json            按月补抓进度
data-generated/inforss/                     InfoRSS 本地归档数据
```

## 维护建议

- 每次改导航、博客、样式或抓取逻辑后，先运行 `npm.cmd run build`。
- InfoRSS 归档数据建议一起提交到 GitHub，这样部署页面不依赖运行时抓取。
- 新增内容类型时，先决定它进入哪个页面、哪个搜索框、是否参与全文索引，再写代码。
- 长期归档优先保持“旧内容不覆盖、重复链接跳过”的规则，避免误改历史记录。
- 如果 InfoRSS 信息量继续增大，可以考虑分页、虚拟列表或独立搜索索引。

## 后续优化方向

这些事项不是当前必须完成的问题，而是后续继续扩展时值得优先考虑的改进。

1. 抽出统一搜索组件

   首页、加密页、Blogs 和 InfoRSS 都已经具备搜索、展开、聚焦、按钮提交和回车提交能力，但页面内仍各自维护部分脚本。后续可以抽成统一搜索组件或工具函数，让每个页面只声明搜索范围和筛选函数。

2. 建立独立搜索索引

   当前搜索文本主要随卡片或页面数据一起加载。内容继续增多后，可以在构建阶段生成轻量 JSON 搜索索引，页面按需加载。这样加密页搜索 InfoRSS、Blogs 全文检索和 InfoRSS 正文检索都会更轻。

3. InfoRSS 按月份分层归档

   长期归档会让 `data-generated/inforss/index.json` 持续变大。后续可以改为按月份拆分，例如 `data-generated/inforss/2026/08.json`，再生成一个轻量总索引，用于列表、检索和部署构建。

4. 统一文章卡片数据模型

   Blogs 和 InfoRSS 都使用文章预览卡片，但数据来源不同。可以进一步统一为稳定结构，例如 `title`、`date`、`category`、`summary`、`href`、`searchText`、`sourceType`，以后增加新内容类型时更容易接入。

5. 优化移动端筛选面板

   InfoRSS 的搜索范围、日期、分类和清空按钮在移动端仍然偏功能密集。可以把搜索、范围、日期和分类分组展示，顶部只放图标，展开后再显示完整筛选面板。

6. 增加抓取状态页或日志摘要

   可以增加一个本地状态页或日志摘要，显示最近一次抓取时间、新增数量、跳过重复数量、错误数量和错误来源。这样排查计划任务、网络异常和接口变化会更直观。

7. 处理代码高亮语言别名

   构建时如果出现 `maple` 语言不存在的提示，可以建立语言别名或统一回退规则，例如把 `maple` 映射到 `plaintext` 或接近的高亮语言，减少构建日志噪音。

8. 增加跨设备阅读状态同步

   如果以后需要同步“已读 / 未读”状态，可以在本地 `localStorage` 之外增加可选同步层。同步内容建议只保存文章链接标识和阅读状态，不保存敏感正文。
