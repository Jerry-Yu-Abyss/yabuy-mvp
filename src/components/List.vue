<template>
  <!-- 從左側滑入、覆蓋整個 App 容器的功能選單 -->
  <aside class="list-panel">
    <div class="panel-safe-top"></div>

    <header class="panel-head">
      <h2 class="panel-title">功能選單</h2>
      <button class="close-btn" type="button" aria-label="關閉" @click="$emit('close')">✕</button>
    </header>

    <div class="panel-body">
      <section v-for="group in menuGroups" :key="group.title" class="menu-group">
        <p class="group-title">{{ group.title }}</p>

        <ul class="menu-list">
          <li v-for="item in group.items" :key="item.key">
            <button
              class="menu-item"
              type="button"
              :disabled="!item.ready"
              @click="item.ready && $emit('select', item.key)"
            >
              <span class="item-icon">{{ item.icon }}</span>
              <span class="item-text">
                <span class="item-label">{{ item.label }}</span>
                <span v-if="item.desc" class="item-desc">{{ item.desc }}</span>
              </span>
              <span v-if="item.ready" class="item-arrow">›</span>
              <span v-else class="item-soon">待新增</span>
            </button>
          </li>
        </ul>
      </section>

      <p class="panel-foot">其他功能陸續新增中…</p>
    </div>
  </aside>
</template>

<script setup>
defineEmits(['close', 'select']);

// ready: false 的項目僅先佔位，點擊不動作（避免給出假的可用功能）
const menuGroups = [
  {
    title: '帳號',
    items: [
      {
        key: 'profile',
        icon: '👤',
        label: '更改個人資料',
        desc: '名字、頭像',
        ready: true
      }
    ]
  }
];
</script>

<style scoped>
/* ── 從左滑入的過場（類別由 App.vue 的 <Transition name="slide-panel"> 掛上）── */
.slide-panel-enter-active,
.slide-panel-leave-active {
  transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.slide-panel-enter-from,
.slide-panel-leave-to {
  transform: translateX(-100%);
}

/* 蓋滿整個 App 容器（.native-app-container 已是 position: relative） */
.list-panel {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  background: #f6f8f4;
  transform: translateX(0);   /* 明確的靜止狀態，過場結束後有基準可回歸 */
  will-change: transform;
}

/* 瀏海安全區：與 App.vue 的 .safe-area-spacer 同一套處理 */
.panel-safe-top {
  height: env(safe-area-inset-top, 48px);
  flex-shrink: 0;
  background: #d1d9c6;
}

.panel-head {
  flex-shrink: 0;
  height: 56px;
  padding: 0 16px;
  background: #d1d9c6;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #2f4a3a;
}

.close-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  color: #2f4a3a;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.close-btn:active { background: rgba(255, 255, 255, 0.9); }

.panel-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  padding: 18px 16px calc(env(safe-area-inset-bottom, 0px) + 28px);
}

.menu-group + .menu-group { margin-top: 22px; }

.group-title {
  margin: 0 0 8px 4px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #7f8c8d;
}

.menu-list {
  margin: 0;
  padding: 0;
  list-style: none;
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(47, 74, 58, 0.06);
}

.menu-list li + li { border-top: 1px solid #eef1ec; }

.menu-item {
  width: 100%;
  padding: 15px 16px;
  border: none;
  background: none;
  display: flex;
  align-items: center;
  gap: 13px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}
.menu-item:active:not(:disabled) { background: #f4f7f2; }
.menu-item:disabled { cursor: default; opacity: 0.55; }

.item-icon { font-size: 20px; flex-shrink: 0; }

.item-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.item-label { font-size: 15px; font-weight: 700; color: #2f4a3a; }
.item-desc { font-size: 12px; color: #8a958d; }

.item-arrow { font-size: 20px; color: #b9c3ba; flex-shrink: 0; }

.item-soon {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: #8a958d;
  background: #eef1ec;
  padding: 3px 9px;
  border-radius: 999px;
}

.panel-foot {
  margin: 22px 0 0;
  text-align: center;
  font-size: 12px;
  color: #a8b2a9;
}
</style>
