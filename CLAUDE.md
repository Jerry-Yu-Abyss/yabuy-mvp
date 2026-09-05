# YaBuy — Agent 專用專案情境檔

> 本檔案給 AI Agent 讀，不是給人看的操作手冊（人看 [README.md](README.md)）。
> 目的：新對話開始時省去重新探索專案的 token，直接進入現況。
> **深入細節一律連到 `docs/wiki/`，這裡只放濃縮重點，不要重複展開內容。**

## 專案是什麼

亞洲大學校園二手交易 PWA。Vue 3（Composition API / `<script setup>` / 無 TypeScript）+ Firebase（Auth／Firestore／Storage／Hosting／Functions，無自建後端 API）。

- 正式站：https://yabuy-2026a.web.app
- Firebase 專案 ID：`yabuy-2026a`
- GitHub：https://github.com/Jerry-Yu-Abyss/yabuy-mvp
- 一句話定位：滑卡瀏覽（首頁）＋條件搜尋＋校園面交（實體 QR 驗證）＋管理後台

## 先讀這個索引，不要自己重新探索

`docs/wiki/Home.md` 是完整 Wiki 的總索引（Obsidian 結構，`[[連結]]` 互相參照）。依任務挑讀，不用全讀：

| 要做什麼 | 讀哪份 |
|---|---|
| 改動任何程式碼前 | [[回歸測試-已知事故]] —— 這個專案真實踩過的 12 個坑，改到相關區域一定要先看 |
| 交易流程／狀態機 | [[交易生命週期]]、[[新交易流程規格]] |
| Firestore 欄位／索引 | [[資料模型]] |
| 安全規則／權限判定 | [[驗證與權限]] |
| 元件找不到在哪 | [[元件目錄]]、[[專案結構]] |
| 部署／自訂網域／寄信 | [[部署與環境]]、[[自訂網域與寄信設定]] |
| 改完要不要驗證 | [[回歸測試-功能標準]] —— 40 項 Check List，標明誰能執行 |
| 已知但還沒修的技術債 | [[已知問題]] |
| **改動 agent 工作流本身**（加檢查／加閘門／換驗證方式） | [Harness Engineering.md](Harness%20Engineering.md) —— 組件清冊，不在 wiki 裡 |

## 鐵則（不在程式碼裡看得出來，但一定要遵守）

1. **不能代替使用者登入**，任何情況都不行。需要登入才能驗的功能，明確說出哪一段沒驗到，不要含糊帶過或假裝驗過。
2. **commit／push 需要使用者明確要求**才做。工作流是：改程式碼 → `npm run build` → `firebase deploy --only hosting`（改 `functions/` 或 `firestore.rules` 要另外部署）→ 驗證 → 等指示。
3. 使用者說「我手動測試就好」時，不要再自己跑瀏覽器驗證。
4. commit 訊息用繁體中文，格式 `動詞: 簡述`（`修復:`／`新增:`／`移除:`／`修改:`），內文寫根因不是只描述改了什麼。
5. 改完程式碼先跑 `npm run check:code`（全離線、約 2 秒，只驗工作目錄）。**這條已由 commit 閘門強制**：`git commit` 會自動跑一次，沒過就擋下。部署後另跑 `npm run check:prod` 驗正式站。細節見 [Harness Engineering.md](Harness%20Engineering.md)。

## 專案歷史

需要時跑 `git log --oneline`。**不要在這裡維護進度表** —— 它會單調成長、每輪都要付 token，而 git 已經是唯一事實來源。

## 目前狀態速覽

- 兩份回歸測試都在：`npm run check:bugs`（事故驅動，39 項全過）／`npm run check:func`（功能標準，40 項，4 自動 + 需人工驗證的分區清楚標在腳本輸出裡）
- 檢查已拆成離線／線上兩條：`check:code`（F1 原始碼 16 項 + F2 靜態案例 + F5 交易流程，commit 閘門用這條）／`check:prod`（規則、線上資料、部署產物 23 項）；`npm run check` 兩者都跑
- **第三份檢查 `npm run check:trade`（87 項）需要 Firebase Emulator**：驗交易狀態機與安全規則，是唯一能用「第三個登入帳號」測隔離的一層。先 `npm run emu`（需 JDK）再跑；沒開 emulator 時 `check:code` 會自動 skip，不會擋 commit。第 9 節驗 Cloud Function 的逾期記次，要用 `npm run emu:fn`（含 functions emulator）才跑得到，只開 `emu` 會註記略過
- Firestore 規則已版控（`firestore.rules`）；**Storage 規則尚未版控**，看不到現況，見 [[已知問題]]
- 已知死碼：`Heart.vue`／`activeTab === 'heart'` 沒有任何按鈕會觸發，收藏功能改走 `User.vue` 的「喜愛」分頁
- 8 支 Cloud Functions（`functions/src/index.ts`）：callable 是 `addAdminRole`、`backfillUserDocs`、`getRankingStats`、`getPublicStats`、`purgeProduct`（管理端刪商品時的連鎖刪除）；Firestore trigger 是 `onReviewCreated`、`onOrderExpired`、`onOrderCancelled`（後兩支負責記次）
