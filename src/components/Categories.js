// Categories.js
// 全站共用的商品分類清單（上架、編輯、搜尋篩選都從這裡取，避免各頁不一致）

export const productCategories = [
  '宿舍用品',
  '衣物',
  '配件',
  '運動用品',
  '玩具',
  '電子產品',
  '課外讀物',
  '美妝保養',
  '票券優惠券',
  '家具家電',
  '文具',
  '系所專業用品',
  '樂器',
  '免費'
];

// 搜尋篩選用：最前面多一個「全部」
export const filterCategories = ['全部', ...productCategories];