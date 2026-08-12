# Navigation Page

这是一个基于 Astro 的个人导航与归档页面，用来集中管理常用入口、加密导航、个人博客和 InfoRSS 信息归档。

线上地址：

```text
https://amy-zyhhh.github.io/pages/
```

## 功能概览

- 首页按分类展示导航卡片，支持置顶入口、主题切换和本页搜索。
- 首页搜索框输入 `/关键词` 后回车，可以跳转到网页搜索。
- 加密页展示私有导航，并可同时搜索加密导航和 blogs。
- blogs 支持根目录集中管理、子文件夹整理、分类入口、日期归档、全文检索和详情页目录。
- Markdown 文章支持相对路径图片，也兼容常见 HTML 图片写法。
- InfoRSS 支持从清华信息门户抓取列表与详情，形成长期本地归档。
- InfoRSS 默认只展示今天和昨天的信息，但搜索、筛选和日期检索会覆盖全部归档内容。
- 项目已配置 GitHub Actions，推送到 `main` 后会自动部署到 GitHub Pages。

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
- `description`：搜索用说明，不显示在卡片主体里。
- `tag`：搜索用标签。
- `order`：排序数字，数字越小越靠前。
- `pinned`：是否出现在首页置顶区域。
- `icon`：favicon 使用的域名；加载失败时会显示文字标识。
- `target`：打开方式，站内链接可用 `_self`。

## 加密导航

首页“其他”分类里的加密入口会提示输入口令，验证通过后进入：

```text
https://amy-zyhhh.github.io/pages/protected/
```

相关配置：

```text
src/data/settings.json
```

`protectedAccess.passwordHash` 是口令的 SHA-256 值，`maxAttempts` 是允许错误次数，`lockMinutes` 是临时锁定分钟数。

生成新口令哈希：

```powershell
node -e "console.log(require('crypto').createHash('sha256').update('你的口令').digest('hex'))"
```

注意：加密导航是前端校验，只适合防止随手打开，不适合保存真正敏感的信息。

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
- `summary`：列表页和搜索结果里的预览摘要。

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
blogs/学者/
  Prof. Alexander Hartmaier.md
  Prof. Alexander Hartmaier.assets/
    01.png
```

HTML 图片目前主要读取整体缩放百分比，例如 `style="zoom:33%;"`，并转换成网页可用的图片宽度。建议图片保留 `.png`、`.jpg`、`.jpeg`、`.webp` 等常见扩展名。

## InfoRSS

InfoRSS 用于把信息门户内容抓取到本地，生成可部署的静态归档。旧的独立 `InfoRSS` 页面已经被当前 Astro 页面替换。

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

按月补抓脚本会从当前月份开始，向前推进；每次运行只抓取一个月的信息，并把下一次要抓取的月份记录在 `scripts/inforss/month-state.json` 中。这个状态文件会随归档一起提交，确保无人值守任务每天都能继续向前补抓。

指定某个月份补抓：

```powershell
node scripts/inforss/fetch-month.mjs --month 202608
```

配置入口：

```text
scripts/inforss/sources.json
```

抓取逻辑：

- 先访问列表页，获取请求接口需要的 `XSRF-TOKEN`。
- 再请求列表接口 `/b/info/xxfb_fg/xnzx/template/more`。
- 如果指定了日期范围，只处理范围内的列表项；列表翻到早于范围的日期后会提前停止。
- 对新文章请求详情接口 `/b/info/xxfb_fg/xnzx/template/detail`。
- 只保存附件链接，不下载附件文件。
- 正文、摘要、分类、来源、附件链接等内容缓存到本地。

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

新增同类抓取源时，在 `sources.json` 里追加配置即可：

```json
{
  "id": "tsinghua-info-example",
  "name": "清华信息门户",
  "enabled": true,
  "type": "tsinghua-info",
  "listPageUrl": "https://info.tsinghua.edu.cn/f/info/xxfb_fg/xnzx/template/more?lmid=LM_BGTG",
  "apiBaseUrl": "https://info.tsinghua.edu.cn",
  "pages": 3,
  "detailConcurrency": 6,
  "params": {
    "oType": "xs",
    "lmid": "all",
    "lydw": "",
    "length": 30,
    "xxflid": ""
  }
}
```

如果后续信息量明显变大，优先考虑这些优化：

- 给 InfoRSS 列表页增加分页或虚拟列表，避免一次渲染过多卡片。
- 把全文搜索索引拆成独立 JSON，页面按需加载。
- 为抓取结果增加失败日志页面，方便发现某个来源是否失效。
- 给 `sources.json` 增加分组字段，便于同时管理多个站点或栏目。

## 搜索范围

项目刻意使用显式搜索范围。以后新增内容类型时，不能自动进入任何一个搜索框，必须在对应页面代码中明确接入。

- 首页：只搜索首页当前导航链接；`/关键词` 可触发网页搜索。
- 加密页：搜索加密导航和 blogs；链接结果优先显示，blogs 使用博客预览样式。
- Blogs 页：只搜索 blogs，范围包括标题、日期、分类、摘要和正文全文。
- InfoRSS 页：默认展示今天和昨天，但搜索、分类筛选和日期筛选覆盖全部归档。

快捷键：

- `/`：聚焦搜索框。
- `Esc`：清空搜索并取消聚焦。
- `t`：切换主题。

网页搜索配置：

```text
src/data/settings.json
```

如需更换搜索引擎，修改 `webSearch.url`，保留 `{query}` 作为关键词占位符。

## 部署与归档流程

手动更新 InfoRSS 并推送：

```powershell
npm.cmd run fetch:inforss
npm.cmd run build
git add data-generated scripts src package.json README.md
git commit -m "Update InfoRSS archive"
git push
```

每天在本地自动运行并推送：

```powershell
npm.cmd run install:inforss-task
```

默认会注册一个 Windows 计划任务：

```text
Pages InfoRSS Daily Update
```

计划任务每天 03:00 在本机运行：

```powershell
npm.cmd run daily:inforss
```

每日任务会执行：

1. 抓取 InfoRSS。
   日常自动任务只抓取当天、昨天和前一天共三天的信息。
2. 构建 Astro 静态页面。
3. 只暂存 `data-generated/inforss` 归档数据。
4. 如果归档数据有变化，就提交并推送当前分支到 GitHub。
5. 如果没有新归档内容，就不提交。

注意：日常任务不会自动提交 `src/`、`scripts/`、`README.md`、`package.json` 等代码和配置改动。页面代码、抓取配置、README 的修改仍然需要你手动提交，避免把未完成的代码一起推送。

安装按月补抓计划任务：

```powershell
npm.cmd run install:inforss-backfill-task
```

默认会注册一个 Windows 计划任务：

```text
Pages InfoRSS Monthly Backfill
```

按月补抓任务每天 03:30 在本机运行：

```powershell
npm.cmd run backfill:inforss:month
```

它每次只补抓一个月的信息，抓完后会构建、提交 `data-generated/inforss` 和 `scripts/inforss/month-state.json`，然后推送当前分支。等历史内容补全后，可以停止这个任务：

```powershell
npm.cmd run uninstall:inforss-backfill-task
```

修改计划任务时间：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/inforss/install-daily-task.ps1 -Time "21:30"
```

手动试跑每日任务：

```powershell
npm.cmd run daily:inforss
```

查看每日任务日志：

```text
logs/inforss/
```

GitHub Actions 配置：

```text
.github/workflows/deploy.yml
```

Astro 部署配置：

```text
astro.config.mjs
```

当前配置适用于仓库名为 `pages` 的 GitHub Pages：

```js
export default defineConfig({
  site: "https://amy-zyhhh.github.io",
  base: "/pages",
});
```

如果以后复制到其他仓库，需要同步修改 `site` 和 `base`。如果仓库名是 `用户名.github.io`，通常不需要配置 `base`。

## 关键文件

```text
src/pages/index.astro                       首页
src/pages/protected.astro                   加密导航页
src/pages/blogs/index.astro                 博客列表页
src/pages/blogs/[...slug].astro             博客详情页
src/pages/blogs/category/[category].astro   博客分类页
src/pages/inforss/index.astro               InfoRSS 列表页
src/pages/inforss/[...slug].astro           InfoRSS 详情页
src/components/LinkCard.astro               导航卡片
src/components/BlogPreviewCard.astro        博客预览卡片
src/utils/blogPosts.ts                      博客解析和全文索引
src/utils/infoRssPosts.ts                   InfoRSS 解析和实体清理
src/utils/searchItems.ts                    搜索项目转换
src/utils/remarkLooseImages.mjs             博客图片兼容处理
scripts/inforss/fetch.mjs                   InfoRSS 抓取入口
scripts/inforss/sources.json                InfoRSS 抓取源配置
scripts/inforss/adapters/                   InfoRSS 站点适配器
scripts/inforss/daily-update.ps1            每日本地抓取、构建、提交和推送
scripts/inforss/install-daily-task.ps1       安装 Windows 每日计划任务
scripts/inforss/install-monthly-backfill-task.ps1  安装 Windows 按月补抓计划任务
scripts/inforss/uninstall-monthly-backfill-task.ps1  停止 Windows 按月补抓计划任务
scripts/inforss/month-state.json             按月补抓进度
data-generated/inforss/                     InfoRSS 本地归档数据
```

## 维护建议

- 每次改导航、博客或抓取逻辑后，先运行 `npm.cmd run build`。
- InfoRSS 归档数据建议一起提交到 GitHub，这样部署页面不依赖运行时抓取。
- 新增内容类型时，先决定它应该进入哪个页面、哪个搜索框、是否参与全文索引，再写代码。
- 对于长期归档，优先保持“旧内容不覆盖、重复链接跳过”的规则，避免误改历史记录。
