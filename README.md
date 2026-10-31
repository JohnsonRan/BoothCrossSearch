# Booth Cross Search

在 Booth 商品页和 BoothDex（`boothdex.ihtw.moe`）商品详情弹窗里，快速查看同一 Booth 商品 ID 是否已被
VRCPirate / RipperStore 收录。

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

## BoothDex

在 BoothDex 打开任意商品的原生详情弹窗时，商品标题下方会注入同一组 VRCPirate / RipperStore 查询按钮：

- 自动适配 BoothDex 的浅色与深色主题。
- 在详情弹窗内切换同店其他商品时，搜索栏会自动随商品 ID 更新。
- 按 `Esc` 会先关闭展开的搜索结果列表，再按一次才关闭商品详情弹窗。
- 外部源查询保持按单品触发，不会在商品列表上批量扫描卡片。

## 缓存与性能

- VRCPirate / RipperStore 查询结果会按商品 ID 缓存 6 小时。
- 缓存写入使用 `GM_getValue` / `GM_setValue`；如果用户脚本管理器不支持，功能会退化为本次页面内缓存。

## 备注

- 所有跨域请求都通过 `GM_xmlhttpRequest` 发起。
- RipperStore 未登录时按钮会显示红点和登录提示。
- 若使用自建的 BoothDex 实例，可在脚本管理器的自定义匹配地址中加入对应域名。
