# Booth Cross Search

在 Booth 商品页和 VRCatalogue 商品卡片弹窗里，快速查看同一 Booth 商品 ID 是否已被
VRCPirate / RipperStore 收录，并补上 Booth 浏览历史、收藏同步和商品详情预览。

[点击安装](https://github.com/JohnsonRan/BoothCrossSearch/raw/main/booth-cross-search.user.js)  
[镜像加速](https://raw.ihtw.moe/github.com/JohnsonRan/BoothCrossSearch/raw/main/booth-cross-search.user.js)

## 前置要求

需安装用户脚本管理器插件，二选一：

- [Tampermonkey](https://www.tampermonkey.net/)
- [Violentmonkey](https://violentmonkey.github.io/)

## 状态说明

VRCPirate / RipperStore 按钮左侧圆点含义：

- 灰色闪烁：查询中
- 绿色：有搜索结果
- 红色：无搜索结果，或 RipperStore 未登录
- 黄色：网络或接口异常，点击按钮可重试

## Booth 商品页

打开任意 Booth 商品页，商品标题下方会显示两个按钮：

- **VRCPirate**：按 Booth 商品 ID 精确匹配；唯一结果会直接打开详情页，多个结果会列出供选择，无需登录。
- **RipperStore**：按 Booth 商品 ID 搜索论坛帖子；会列出匹配帖子标题，点击跳转原帖。登录状态从搜索接口返回值判断。

商品页还会自动处理长内容：

- 长商品说明折叠为预览，点击可展开。
- 变体数量较多时只显示前几项，其余收起到按钮后面。

## VRCatalogue

点击商品卡片图片后，脚本会拦截原站图片预览并打开 Booth 商品详情弹窗：

- 弹窗先使用卡片上已有的标题和图片，避免空白等待。
- 随后读取 Booth 商品 JSON，补全商品说明、标签、价格、变体和多图图库。
- 弹窗内同样显示 VRCPirate / RipperStore 查询按钮。
- 主图优先加载 Booth CDN 的中等尺寸图，点开放大查看时再加载原图。

VRCatalogue 页面右下角还有“最近看过”入口：

- 最近看过来自 Booth 账号自己的浏览历史。
- 收藏来自 Booth 账号自己的「スキ!」列表，不使用本地收藏副本。
- 商品卡片、历史面板和弹窗里的星标会同步 Booth 收藏状态。
- 已看商品会在卡片图片上显示灰色遮罩和「已看」标签。
- 历史面板支持按标题、店铺和价格筛选，并记录最近的筛选词。
- 清空历史会删除 Booth 账号的浏览历史，按钮需要二次确认。

外部源查询保持按单品触发：脚本不会在 VRCatalogue 列表上批量扫描所有卡片的
VRCPirate / RipperStore 状态。

## 缓存与性能

- VRCPirate / RipperStore 查询结果会按商品 ID 缓存 6 小时。
- Booth 商品 JSON 会按商品 ID 缓存 24 小时，并只保存弹窗需要的字段。
- 最近看过面板每次打开都会重新向 Booth 拉取收藏和历史，确保已同步到 Booth 的变化能及时显示。
- 缓存写入使用 `GM_getValue` / `GM_setValue`；如果用户脚本管理器不支持，功能会退化为本次页面内缓存。
- VRCatalogue 卡片标记使用增量队列和分帧处理，避免 SPA 大量 DOM 变动时全页反复扫描。

## 备注

- 所有跨域请求都通过 `GM_xmlhttpRequest` 发起。
- R18 或需要登录的 Booth 商品详情可能读取失败，此时弹窗会提示去 Booth 官网查看。
- RipperStore 未登录时按钮会显示红点和登录提示。
