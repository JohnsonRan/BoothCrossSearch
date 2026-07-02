# Booth Cross Search

在 Booth 商品页快速查询该商品是否已被 VRCPirate / RipperStore 收录。

[点击安装](https://github.com/JohnsonRan/BoothCrossSearch/raw/main/booth-cross-search.user.js)  
[jsDelivr](https://raw.ihtw.moe/github.com/JohnsonRan/BoothCrossSearch/raw/main/booth-cross-search.user.js)

## 前置要求

需安装用户脚本管理器插件，二选一：

- [Tampermonkey](https://www.tampermonkey.net/)
- [Violentmonkey](https://violentmonkey.github.io/)

## 功能

### Booth 商品页

打开任意 `booth.pm` 商品页（如 `https://booth.pm/en/items/8432632`），标题下方将显示两个按钮：

- **VRCPirate** — 按商品 ID 精确匹配，唯一结果时直接跳转详情页，多个结果时列出供选择，无需登录
- **RipperStore** — 按商品 ID 搜索论坛帖子，列出匹配的帖子标题，点击跳转对应帖子

按钮左侧圆点状态：

- 灰色闪烁：查询中
- 绿色：有搜索结果
- 红色：无搜索结果，或（RipperStore）未登录
- 黄色：网络/接口异常，点击按钮重试

RipperStore 未登录时按钮禁用，鼠标悬停显示提示，页面下方附登录链接。

### VRCatalogue

在 `vrcatalogue.com` 点击商品图片，弹出详情弹窗：大图 + 缩略图切换、价格与变体列表（默认折叠）、商品描述（默认折叠）、标签列表（默认折叠）。
