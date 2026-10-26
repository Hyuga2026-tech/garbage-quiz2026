/* firebase-service.js
 * Firestore への読み書きをまとめたモジュール。
 * window.GomiCloud として公開し、quiz.js / board.js から利用します。
 *
 * Firebase が未設定（YOUR_ のまま）の場合は enabled=false になり、
 * クイズ本体は通常どおり動作します。
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp,
  doc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const cfg = window.FIREBASE_CONFIG || {};
const ADMIN_EMAIL = window.FIREBASE_ADMIN_EMAIL || "admin@gomi-quiz.example.com";
// Firebase のパスワードは6文字以上が必要なため、管理者が入力した文字の前に固定の文字を付けます。
// （管理者画面で「0104」と入力 → Firebaseには「gomi-0104」として送信）
const PASSWORD_PREFIX = "gomi-";
const enabled = !!cfg.apiKey && !String(cfg.apiKey).startsWith("YOUR_") &&
                !!cfg.projectId && !String(cfg.projectId).startsWith("YOUR_");

let db = null;
let auth = null;
if (enabled) {
  try {
    const app = initializeApp(cfg);
    db = getFirestore(app);
    auth = getAuth(app);
  } catch (e) {
    console.error("Firebase の初期化に失敗しました", e);
  }
}

const ok = () => enabled && db;

function cleanName(name) {
  const n = String(name || "").trim().slice(0, 24);
  return n || "ななしさん";
}

/** 修了証の獲得を登録（合格者のみ呼ぶ） */
async function addCertificate({ name, score, total }) {
  if (!ok()) throw new Error("Firebase is not configured");
  await addDoc(collection(db, "certificates"), {
    name: cleanName(name),
    score: Number(score),
    total: Number(total),
    createdAt: serverTimestamp()
  });
}

/** 連続正解数ランキングへ登録 */
async function addStreak({ name, maxStreak, score, total }) {
  if (!ok()) throw new Error("Firebase is not configured");
  await addDoc(collection(db, "streaks"), {
    name: cleanName(name),
    maxStreak: Number(maxStreak),
    score: Number(score),
    total: Number(total),
    createdAt: serverTimestamp()
  });
}

/** 修了証獲得者（新しい順） */
async function fetchCertificates(n = 50) {
  if (!ok()) return [];
  const snap = await getDocs(query(collection(db, "certificates"), orderBy("createdAt", "desc"), limit(n)));
  return snap.docs.map(d => {
    const v = d.data();
    return {
      id: d.id,
      name: v.name,
      score: v.score,
      total: v.total,
      date: v.createdAt && v.createdAt.toDate ? v.createdAt.toDate() : null
    };
  });
}

/** 連続正解ランキング（連続数が多い順、同数なら早く達成した順）
 *  複合インデックスを避けるため、上位をまとめて取得してから並べ替えます。 */
async function fetchStreakRanking(n = 20) {
  if (!ok()) return [];
  const snap = await getDocs(query(collection(db, "streaks"), orderBy("maxStreak", "desc"), limit(Math.max(200, n))));
  const rows = snap.docs.map(d => {
    const v = d.data();
    return {
      id: d.id,
      name: v.name,
      maxStreak: v.maxStreak,
      score: v.score,
      total: v.total,
      date: v.createdAt && v.createdAt.toDate ? v.createdAt.toDate() : null
    };
  });
  rows.sort((a, b) =>
    (b.maxStreak - a.maxStreak) ||
    ((a.date ? a.date.getTime() : 0) - (b.date ? b.date.getTime() : 0))
  );
  return rows.slice(0, n);
}

/* ---------- 管理者用（要ログイン。権限は firestore.rules で制限） ---------- */

/** 管理者ログイン。ブラウザのタブを閉じるとログアウトされます。 */
async function adminSignIn(password) {
  if (!ok() || !auth) throw new Error("Firebase is not configured");
  await setPersistence(auth, browserSessionPersistence);
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, PASSWORD_PREFIX + String(password));
}

async function adminSignOut() {
  if (auth) await signOut(auth);
}

const isAdminSignedIn = () => !!(auth && auth.currentUser);

function collectionName(kind) {
  if (kind === "certificates" || kind === "streaks") return kind;
  throw new Error("unknown collection");
}

/** 記録を削除（管理者のみ） */
async function adminDelete(kind, id) {
  if (!ok()) throw new Error("Firebase is not configured");
  await deleteDoc(doc(db, collectionName(kind), id));
}

/** 名前を変更（管理者のみ。name 以外は書き換えられません） */
async function adminRename(kind, id, newName) {
  if (!ok()) throw new Error("Firebase is not configured");
  await updateDoc(doc(db, collectionName(kind), id), { name: cleanName(newName) });
}

window.GomiCloud = {
  enabled: ok(),
  addCertificate, addStreak, fetchCertificates, fetchStreakRanking,
  adminSignIn, adminSignOut, isAdminSignedIn, adminDelete, adminRename
};
window.dispatchEvent(new Event("gomicloud-ready"));
