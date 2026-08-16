#!/usr/bin/env node
/**
 * 在 Emulator 裡塞一組可以用瀏覽器實際操作的假資料。
 *
 * 用途：docs/wiki/回歸測試-功能標準.md 裡有 19 項標「需登入」的案例，
 * 過去只能拿真帳號在正式站上測（會污染正式資料，也不敢隨便改狀態）。
 * 有了這份種子資料，就能在完全隔離的環境裡點完整個 App。
 *
 * 用法（三個終端機）：
 *   1) npm run emu
 *   2) npm run emu:seed
 *   3) npm run dev:emu     然後用下面印出的帳密登入
 *
 * ⚠️ 只會寫進本機 emulator，與正式站 yabuy-2026a 無關。
 */

import {
  emulatorUp,
  resetEmulator,
  createUser,
  setDoc,
} from './emulator-helpers.mjs';

const PASSWORD = 'test1234';
const ACCOUNTS = [
  { email: 'seller@test.au.edu.tw', name: '賣家小明', college: '資訊學院' },
  { email: 'buyer@test.au.edu.tw', name: '買家小華', college: '管理學院' },
  { email: 'stranger@test.au.edu.tw', name: '路人甲', college: '醫學院' },
];

const PRODUCTS = [
  { name: '資料結構與演算法（第三版）', price: 350, isBook: true, category: '教科書', college: '資訊學院', dept: '資訊工程學系', subject: '資料結構' },
  { name: 'microeconomics 個體經濟學', price: 420, isBook: true, category: '教科書', college: '管理學院', dept: '財務金融學系', subject: '個體經濟學' },
  { name: '宿舍用小冰箱', price: 1200, isBook: false, category: '生活用品' },
  { name: '羅技無線滑鼠', price: 300, isBook: false, category: '3C' },
  { name: '單車（9成新）', price: 2500, isBook: false, category: '交通' },
];

const COLOR = ['#f6c8c8', '#c8e0f6', '#d6f6c8', '#f6f0c8', '#e0c8f6'];

(async () => {
  if (!(await emulatorUp())) {
    console.error('\n✗ Emulator 沒在跑。請先另開終端機執行：npm run emu\n');
    process.exit(1);
  }

  console.log('\n清空 emulator 既有資料…');
  await resetEmulator();

  const users = {};
  for (const a of ACCOUNTS) {
    const u = await createUser(a.email, PASSWORD);
    users[a.email] = u;
    await setDoc(
      `users/${u.uid}`,
      {
        id: u.uid,
        displayName: a.name,
        email: a.email,
        college: a.college,
        verify: 'email',
        status: 'active',
        ratingSum: 0,
        ratingCount: 0,
        createdAt: new Date(),
      },
      u.token
    );
  }
  console.log(`建立 ${ACCOUNTS.length} 個帳號`);

  const seller = users['seller@test.au.edu.tw'];
  let n = 0;
  for (const [i, p] of PRODUCTS.entries()) {
    await setDoc(
      `products/seed-${i + 1}`,
      {
        ...p,
        sellerId: seller.uid,
        sellerName: '賣家小明',
        status: 'active',
        url: `https://picsum.photos/seed/yabuy${i}/600/800`,
        color: COLOR[i % COLOR.length],
        desc: '種子資料，僅存在於本機 emulator。',
        createdAt: new Date(Date.now() - i * 3600_000),
      },
      seller.token
    );
    n++;
  }
  console.log(`建立 ${n} 件商品（賣家：賣家小明）`);

  console.log('\n可用帳號（密碼都是 ' + PASSWORD + '）：');
  for (const a of ACCOUNTS) console.log(`  ${a.email.padEnd(30)} ${a.name}`);
  console.log(
    '\n接著跑：npm run dev:emu' +
      '\n然後在 http://localhost:5173 用上面任一組帳密登入。' +
      '\n（資料只在本機 emulator，與正式站無關）\n'
  );
})().catch((e) => {
  console.error(`\n✗ 失敗：${e.message}\n`);
  process.exit(1);
});
