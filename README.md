# Booth Cross Search

在 Booth 商品页快速查询该商品是否已被 VRCPirate / RipperStore 收录。

[点击安装](https://github.com/JohnsonRan/BoothCrossSearch/raw/main/booth-cross-search.user.js)  
[jsDelivr](https://cdn.jsdelivr.net/gh/JohnsonRan/BoothCrossSearch@main/booth-cross-search.user.js)

## 前置要求

需安装用户脚本管理器插件，二选一：

- [Tampermonkey](https://www.tampermonkey.net/)
- [Violentmonkey](https://violentmonkey.github.io/)

## 功能

打开任意 `booth.pm` 商品页（如 `https://booth.pm/en/items/8432632`），标题下方将显示两个按钮：

- **VRCPirate** — 按商品 ID 精确匹配，唯一结果时直接跳转详情页，多个结果时列出供选择
- **RipperStore** — 按商品 ID 搜索论坛帖子，列出匹配的帖子标题，点击跳转对应帖子

按钮左侧圆点状态：

- 灰色闪烁：检测登录状态中
- 绿色：已登录且有搜索结果
- 红色：未登录，或已登录但无搜索结果

未登录时按钮处于禁用状态，鼠标悬停显示提示，页面下方会附上对应站点的登录链接。
