# YaBuy（亞大校園二手交易平台）

Vue 3 + Firebase 打造的校園二手交易 PWA。
本文件為**操作手冊**，涵蓋：新電腦環境設定、日常啟用、更新推送、部署上線、版本查看。

- **正式網站**：https://yabuy-2026a.web.app
- **GitHub**：https://github.com/Jerry-Yu-Abyss/yabuy-mvp
- **Firebase 專案 ID**：yabuy-2026a

---

## 技術棧

| 項目 | 使用 |
|---|---|
| 前端框架 | Vue 3（Composition API, `<script setup>`, JavaScript） |
| 建置工具 | Vite |
| 後端服務 | Firebase（Auth / Firestore / Storage / Hosting / Functions） |
| 後端函式 | Cloud Functions（TypeScript，位於 `functions/`） |

---

## 一、在新電腦上設定環境（第一次）

### 前置需求（先確認這三個都裝好）
```bash
node --version     # 需要 Node.js（建議 LTS）
npm --version
git --version
```
- 沒有 Node → 到 https://nodejs.org 裝 LTS 版
- 沒有 Git → Windows 到 https://git-scm.com ；Mac 跑 git 會提示安裝

### 步驟
```bash
# 1. 取得專案原始碼
git clone https://github.com/Jerry-Yu-Abyss/yabuy-mvp.git
cd yabuy-mvp

# 2. 安裝前端套件
npm install

# 3. 安裝並編譯 Cloud Functions（獨立子專案）
cd functions
npm install
npm run build
cd ..
```

> **關於 GitHub 登入**：clone 私有倉庫時，密碼欄不是輸入 GitHub 密碼，而是輸入
> **Personal Access Token**（GitHub → Settings → Developer settings →
> Personal access tokens → Tokens (classic) → 勾 `repo` 權限產生，只顯示一次請存好）。

> **安裝時的警告可忽略**：出現 `X vulnerabilities` 或 `EBADENGINE` 警告屬正常，
> **不要**執行 `npm audit fix`（可能改壞套件版本）。

---

## 二、日常啟用（每次開始開發）

```bash
cd yabuy-mvp
npm run dev
```
瀏覽器打開終端機顯示的網址（通常 http://localhost:5173 ）即可看到本機畫面。
修改程式碼會即時熱更新。結束按 `Ctrl + C`。

---

## 三、更新推送（改完程式碼後）

> 重點觀念：`git push`（存版本 / 同步）與 `firebase deploy`（更新正式站）
> 是**兩件事**。push 不會讓使用者看到新版；要上線必須另外 deploy。

### A. 存版本並同步到 GitHub（每次改動都做）
```bash
git status                       # 看改了哪些檔案
git add .
git commit -m "清楚說明這次改了什麼"
git push
```
> commit 訊息要具體，例如「修正商品編輯無法更改系所的問題」，
> 不要只寫「update」，方便日後追查。

### B. 從另一台電腦接續開發（拉取最新版）
```bash
git pull
npm install        # 若這次更新有新增套件才需要
```

### C. 還原指定檔案
```bash
git restore <path>
```
---

## 四、部署上線（讓使用者看到新版）

### 首次在新電腦部署前，先登入
```bash
firebase login             # 用專案擁有者 Google 帳號
firebase use yabuy-2026a   # 確認使用正確專案
```

### 部署前端網站（Hosting）
```bash
npm run build
firebase deploy --only hosting
```
成功後會顯示 Hosting URL，即為正式網址。

### 部署後端函式（Cloud Functions，改了 functions/ 才需要）
```bash
cd functions
npm run build
cd ..
firebase deploy --only functions
```

### 標準「更新 + 上線」完整流程
```bash
git add . && git commit -m "說明" && git push    # 存版本
npm run build && firebase deploy --only hosting  # 上線
```

---

## 五、查看版本差異

| 需求 | 指令 / 方式 |
|---|---|
| 快速看歷史版本 | `git log --oneline` |
| 看完整歷史（含說明） | `git log` |
| 看目前未提交的改動 | `git diff` |
| 看每次 commit 改了什麼 | `git log -p` |
| **最直覺（推薦）** | GitHub 網頁 → 倉庫 → **Commits** 頁面，用顏色顯示每版差異 |

---

## 六、專案結構

```
yabuy-mvp/
├── src/                  # 前端原始碼（.vue 元件、firebase.js）
│   ├── components/       # 各頁面與元件
│   └── firebase.js       # Firebase 連線設定
├── functions/            # Cloud Functions（TypeScript）
│   └── src/index.ts      # 後端函式原始碼（管理員 Custom Claims）
├── public/               # 靜態資源
├── index.html            # 進入點
├── vite.config.js        # Vite 設定
├── firebase.json         # Firebase 設定
├── .firebaserc           # Firebase 專案連結
└── firestore.indexes.json
```

> `node_modules/`、`dist/`、`functions/lib/` 為自動生成，不進版本控制（見 `.gitignore`），
> 在新電腦用 `npm install` / `npm run build` 重新生成即可。

---

## 七、常見狀況速查

| 狀況 | 處理 |
|---|---|
| clone 要求密碼但輸入密碼失敗 | 改用 Personal Access Token（見第一節） |
| `npm run dev` 找不到 package.json | 確認人在專案根目錄（有 package.json 那層） |
| 部署後網站沒更新 | 確認有先 `npm run build` 再 `firebase deploy` |
| 改了 functions 沒生效 | functions 要單獨 `firebase deploy --only functions` |
| 相機 / 登入在本機怪怪的 | 相機等功能需在 HTTPS 正式站測試，非本機 IP |

---

## 開發工具建議（IDE）

- **編輯器**：VS Code + Vue (Official / Volar) 擴充（並停用舊的 Vetur）
- **瀏覽器**：安裝 Vue.js devtools 擴充，除錯更方便