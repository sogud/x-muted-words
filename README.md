# X Muted Words

Chrome / Edge Manifest V3 插件，帮助你在 X 的屏蔽词设置页检查并批量添加本地词包。

## MVP 功能

- 只在 `https://x.com/settings/muted_keywords` 运行
- 词包保存在浏览器本地 `chrome.storage.local`
- 扫描页面并展示未检测到的词
- 用户确认后逐个添加
- 只添加，不自动删除
- 不读取或上传 Cookie，不调用 X 私有 API

## 安装开发版

1. 打开扩展管理页：`chrome://extensions` 或 `edge://extensions`
2. 打开“开发者模式”
3. 选择“加载已解压的扩展程序”
4. 选择本仓库目录
5. 点击扩展图标编辑本地词包，再打开 X 屏蔽词设置页

## 开发检查

本项目是无构建步骤的原生 Manifest V3 插件，提交前运行：

```bash
node --check popup.js
node --check content.js
python3 -m json.tool manifest.json >/dev/null
```

## 隐私边界

插件只在用户明确打开的 X 屏蔽词设置页运行。词包仅存本机；不会上传 Cookie、账号信息或页面内容。
