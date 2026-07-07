import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)

// --- 自動註冊圖標開始 ---
// 1. 找到 assets/icons 資料夾下所有的 .vue 檔案
const icons = import.meta.glob('./assets/icons/*.vue', { eager: true })

Object.entries(icons).forEach(([path, definition]) => {
  // 2. 從路徑中提取檔案名稱 (例如從 "./assets/icons/IconHome.vue" 提取出 "IconHome")
  const componentName = path
    .split('/')
    .pop()
    .replace(/\.\w+$/, '')

  // 3. 註冊為全域組件
  app.component(componentName, definition.default)
})
// --- 自動註冊圖標結束 ---

app.mount('#app')
