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

## 鐵則（不在程式碼裡看得出來，但一定要遵守）

1. **不能代替使用者登入**，任何情況都不行。需要登入才能驗的功能，明確說出哪一段沒驗到，不要含糊帶過或假裝驗過。
2. **commit／push 需要使用者明確要求**才做。工作流是：改程式碼 → `npm run build` → `firebase deploy --only hosting`（改 `functions/` 或 `firestore.rules` 要另外部署）→ 驗證 → 等指示。
3. 使用者說「我手動測試就好」時，不要再自己跑瀏覽器驗證。
4. commit 訊息用繁體中文，格式 `動詞: 簡述`（`修復:`／`新增:`／`移除:`／`修改:`），內文寫根因不是只描述改了什麼。
5. 改完程式碼先跑 `npm run check`（= `check:bugs` + `check:func`），細節見上面兩份回歸測試文件。

## 工作進度（依 git log 整理，非逐筆 commit）

| 時期 | 完成內容 |
|---|---|
| 2026-07-08 | 專案初始化（Vue 3 + Firebase），README 操作手冊 |
| 07-09 ～ 07-12 | Landing 導覽頁響應式改版、底部液態玻璃選單（含水滴效果） |
| 07-14 ～ 07-17 | 上架頁（Cam.vue）調整、個人主頁加入喜愛清單與點選交易 |
| 07-30 | 修復多處選單被遮蔽、iPhone 瀏海安全區跑版 |
| 08-01 | Email 登入、List 選單個人資料編輯、買入請求可取消、**Wiki 建立**（docs/wiki/，Obsidian 結構） |
| 08-02 ～ 08-05 | 個人資料設定學院、**排行榜**（院所交易直方圖／交易王 TOP 10／循環利用累計）、面交流程狀態同步修復、**簡化版安全交易流程**（罐頭訊息、取消次數限制、實體 QR 掃碼取代人對人掃碼） |
| 08-05 | 查看登入狀態＋密碼重設、**廣告投放功能**（首頁卡片穿插、管理員後台管理） |
| 08-06 | Map 頁交易點卡片瀏覽、**PWA 圖示與 iOS 加入主畫面支援**、商品巡邏統計、**修復 Google 首次登入未建檔**（Landing.vue 漏呼叫 upsertUserDoc）、**修復交易按鈕防連點** |
| 08-06 | 修復交易按鈕「感覺遲緩」（`ensureVerified` 對已驗證帳號短路，跳過多餘 `reload()`） |
| 08-07 | 補齊缺失用戶資料（Auth／Firestore 對齊用的 Cloud Function）、**收緊 Firestore 規則**（讀寫範圍從「登入就行」改成「本人/當事人/管理員」，含 `orders`/`favorites`/`messages`/`audit_logs`/`users`）、Landing 頁公開統計（`getPublicStats`，聚合值不外洩原始資料）、教科書專區不顯示賣家名字 |
| 08-08 | 修復 SVG icon 裁切（SVGO `removeViewBox` 問題，修在 `vite.config.js` 載入器層級）、**建立兩份回歸測試**（[[回歸測試-已知事故]] 事故驅動 / [[回歸測試-功能標準]] 40 項 Check List） |
| 08-13 | 我的賣場：已售出商品移除編輯/下架按鈕，改顯示成交明細（實際售價/地點/時間，回頭查 `orders.finalPrice`） |
| 08-13 | 個人頁快速統計、個人貢獻度機制（5 級，抽出 `contribution.js` 共用等級判定）、個人頁貢獻度徽章 |
| 08-14 | **修復廣告重複顯示**：只有 1 則有效廣告、商品清單夠長時，`pickNextAd()` 沒排除同一次 recompute 已用過的廣告，導致同一疊卡片裡塞進兩個插槽；回歸測試補上這個案例（39 項） |

## 目前狀態速覽

- 兩份回歸測試都在：`npm run check:bugs`（事故驅動，39 項全過）／`npm run check:func`（功能標準，40 項，4 自動 + 需人工驗證的分區清楚標在腳本輸出裡）
- Firestore 規則已版控（`firestore.rules`）；**Storage 規則尚未版控**，看不到現況，見 [[已知問題]]
- 已知死碼：`Heart.vue`／`activeTab === 'heart'` 沒有任何按鈕會觸發，收藏功能改走 `User.vue` 的「喜愛」分頁
- 4 支 Cloud Functions（`functions/src/index.ts`）：`addAdminRole`、`backfillUserDocs`、`getRankingStats`、`getPublicStats`
