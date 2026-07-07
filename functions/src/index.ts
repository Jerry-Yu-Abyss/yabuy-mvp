// functions/src/index.ts
// 管理員 Custom Claim 設定。創辦人可把任何人設為/取消管理員；其他現有管理員亦可。
// firebase-functions v2 + TypeScript

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp();

// 創辦人 email：永遠擁有最高權限，可授權他人
const FOUNDER_EMAIL = "reso950211zxc@gmail.com";

export const addAdminRole = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) {
    throw new HttpsError("unauthenticated", "請先登入再操作。");
  }

  const callerEmail = (caller.token.email as string) || "";
  const callerIsFounder = callerEmail === FOUNDER_EMAIL;
  // 呼叫者必須是創辦人，或本身已是管理員（管理員僅能確認自己，見下方）
  const callerIsAdmin = callerIsFounder || caller.token.admin === true;
  if (!callerIsAdmin) {
    throw new HttpsError("permission-denied", "只有管理員可以執行此操作。");
  }

  const data = (request.data || {}) as { email?: string; makeAdmin?: boolean };
  const targetEmail = data.email;
  const makeAdmin = data.makeAdmin !== false; // 預設 true；傳 false 則取消管理員

  // 沒帶 email → 把「自己」設為管理員（給創辦人第一次 bootstrap / 確認權限用）
  if (!targetEmail) {
    // 只有創辦人能透過此通道取得 admin；一般人即使呼叫也不會被設為管理員
    if (!callerIsFounder) {
      throw new HttpsError("permission-denied", "只有創辦人能取得管理員權限。");
    }
    await admin.auth().setCustomUserClaims(caller.uid, {
      admin: true,
      founder: true,
    });
    await admin.firestore().collection("users").doc(caller.uid)
      .set({isAdmin: true, isFounder: true}, {merge: true});
    return {message: "歡迎回來，創辦人！最高權限已確認。", uid: caller.uid, admin: true};
  }

  // 新增/取消「他人」的管理員權限 → 僅限創辦人
  if (!callerIsFounder) {
    throw new HttpsError("permission-denied", "只有創辦人可以新增或取消管理員。");
  }

  // 安全保護：不可取消創辦人的權限
  if (targetEmail === FOUNDER_EMAIL && makeAdmin === false) {
    throw new HttpsError("permission-denied", "不可取消創辦人的管理員權限。");
  }

  // 把指定 email 的使用者設為/取消管理員
  const targetUser = await admin.auth().getUserByEmail(targetEmail);
  await admin.auth().setCustomUserClaims(targetUser.uid, {admin: makeAdmin});
  // 鏡像一份 isAdmin 到 Firestore 用戶文件（僅供後台列表顯示，安全仍以 claim 為準）
  await admin.firestore().collection("users").doc(targetUser.uid)
    .set({isAdmin: makeAdmin}, {merge: true});

  return {
    message: makeAdmin ?
      `已將 ${targetEmail} 設為管理員。` :
      `已取消 ${targetEmail} 的管理員權限。`,
    uid: targetUser.uid,
    admin: makeAdmin,
  };
});
