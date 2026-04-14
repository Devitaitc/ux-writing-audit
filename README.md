# UX Writing 审计工具

AI 驱动的游戏界面文案审计工具，上传设计稿截图后自动识别占位文案与表意不清的文案，并直接生成可粘贴使用的替换文案，告别人工逐屏排查。

---

## 📥 下载文件

| 文件 | 说明 | 下载 |
|------|------|------|
| ux-writing-audit.html | 工具前端页面 | [下载](https://github.com/Devitaitc/ux-writing-audit/releases/download/v1.0.0/ux-writing-audit.html) |
| ux-audit-server.js | 后端服务程序 | [下载](https://github.com/Devitaitc/ux-writing-audit/releases/download/v1.0.0/ux-audit-server.js) |

---

## ⚙️ 安装准备（仅需做一次）

### 1. 安装 Node.js

前往 https://nodejs.org，下载并安装 LTS 版本。安装完成后打开终端（Windows 按 Win+R 输入 cmd，Mac 按 Command+空格 输入 Terminal），输入以下命令验证：

`node -v`

看到版本号（如 v20.0.0）即表示安装成功。

### 2. 安装 CodeMaker CLI

`npm install -g @netease/codemaker-cli`

---

## 🚀 每次使用步骤

### 第一步：准备文件

将下载的两个文件放到同一个文件夹，例如桌面新建 ux-audit 文件夹。

### 第二步：启动后端服务

打开终端，切换到文件所在目录并启动服务：

```
cd C:\Users\你的用户名\Desktop\ux-audit
node ux-audit-server.js
```

看到 `UX Audit server running on http://127.0.0.1:7788` 说明启动成功。终端窗口保持开启不要关闭。

### 第三步：打开工具页面

浏览器地址栏输入：`http://127.0.0.1:7788/ux-writing-audit.html`

### 第四步：上传截图并分析

1. **上传截图**：点击上传区域或拖拽设计稿截图（支持多张，顺序即为界面流程）
2. **选择分析方式**：
   - 「跳过标注，直接分析」适合单张图或快速使用
   - 「识别交互文案」适合多界面流程，可手动标注跳转关系
3. **查看结果**：左侧图片带序号标注，右侧是对应替换文案
4. **复制使用**：点击「复制替换文案」粘贴到设计稿即可

---

## 配置说明

| 配置项 | 说明 |
|--------|------|
| 活动风格 | 选择与设计稿匹配的风格，AI 据此调整文案调性 |
| 模型 | 推荐默认 claude-sonnet，追求更高质量可选 opus（消耗更多 token） |
