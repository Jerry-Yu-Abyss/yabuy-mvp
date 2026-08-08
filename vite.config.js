import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import svgLoader from 'vite-svg-loader'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    // 🐛 svgLoader 預設用 SVGO 的 preset-default，裡面的 removeViewBox 外掛
    // 會在 viewBox 剛好等於 width/height 時把 viewBox 整個拿掉（例如
    // send.svg 的 viewBox="0 0 24 24"、width="24" height="24"）。
    // 少了 viewBox，icon 元件之後被 CSS 縮到跟原生尺寸不同（例如 .send-icon
    // 設 22px），瀏覽器不會等比例縮放內容，而是直接照 22x22 裁切座標系，
    // 圖示的一部分就被切掉——這是全站所有透過 ?component 載入的 icon
    // 共通的風險，不是單一圖示的問題，所以在載入器層級關掉這個外掛修正。
    svgLoader({
      svgoConfig: {
        plugins: [
          {
            name: 'preset-default',
            params: { overrides: { removeViewBox: false } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    host: true, // ✅ 允許 172.20.10.4 這種區網 IP 連線
    // (已經把 ngrok 專用的 hmr 與 allowedHosts 刪除了，恢復乾淨狀態)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    }
  },
})