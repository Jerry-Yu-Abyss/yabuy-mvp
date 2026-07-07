<template>
  <div class="map-fullscreen-container">
    
    <button class="back-btn" @click="$emit('back-home')">
      <span class="back-arrow">←</span> 返回
    </button>
    
    <div class="map-box">
      <img src="@/assets/map/AU-Map-01.jpg" alt="AU Map" class="map-img" />
    </div>
    
  </div>
</template>

<script setup>
defineEmits(['back-home']);
</script>

<style scoped>
/* 容器自動填滿已被放大的主舞台 */
.map-fullscreen-container {
  width: 100%;
  height: 100%;
  background-color: #111; /* 深色背景看地圖更有質感 */
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 懸浮返回按鈕 */
.back-btn {
  position: absolute;
  /* 使用 safe-area 確保不會被瀏海擋住 */
  top: max(env(safe-area-inset-top), 20px); 
  left: 20px;
  background: rgba(255, 255, 255, 0.15); 
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 10;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  cursor: pointer;
}

.back-btn:active {
  background: rgba(255, 255, 255, 0.3);
}

.back-arrow {
  font-size: 20px;
  line-height: 1;
  padding-bottom: 2px;
}

/* 地圖展示區 */
.map-box {
  flex-grow: 1;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 確保地圖等比例縮放且不出格 */
.map-img {
  width: 100%;
  height: 100%;
  object-fit: contain; 
}
</style>