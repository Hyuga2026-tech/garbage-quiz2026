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
  doc, updateDoc, deleteDoc, getDoc, writeBatch
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

/* ---------- 問題データ（全員に共通で表示される「公開中」の内容） ----------
 *  settings/site      … サイト名・修了証の設定
 *  questions/{id}     … 問題1件ずつ（order で並び順を保持）
 */

/** 公開中のクイズを取得。まだ公開されていなければ null */
async function fetchQuiz() {
  if (!ok()) return null;
  const [siteSnap, qSnap] = await Promise.all([
    getDoc(doc(db, "settings", "site")),
    getDocs(collection(db, "questions"))
  ]);
  const questions = qSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(({ order, ...q }) => q);
  if (!questions.length) return null;
  const site = siteSnap.exists() ? siteSnap.data() : {};
  return {
    siteTitle: site.siteTitle,
    siteSubtitle: site.siteSubtitle,
    certificate: site.certificate,
    questions
  };
}

/** 問題とサイト設定を公開（管理者のみ）。含まれない既存の問題は削除されます。 */
async function publishQuiz(data) {
  if (!ok()) throw new Error("Firebase is not configured");
  const existing = await getDocs(collection(db, "questions"));
  const keep = new Set();
  const batch = writeBatch(db);

  batch.set(doc(db, "settings", "site"), {
    siteTitle: String(data.siteTitle || ""),
    siteSubtitle: String(data.siteSubtitle || ""),
    certificate: {
      title: String((data.certificate && data.certificate.title) || ""),
      message: String((data.certificate && data.certificate.message) || ""),
      passPercent: Number((data.certificate && data.certificate.passPercent) || 0)
    }
  });

  data.questions.forEach((q, i) => {
    const id = String(q.id);
    keep.add(id);
    batch.set(doc(db, "questions", id), {
      text: String(q.text || ""),
      image: String(q.image || ""),
      choices: q.choices.map(c => String(c)),
      correctIndex: Number(q.correctIndex) || 0,
      trivia: String(q.trivia || ""),
      order: i
    });
  });
  existing.docs.forEach(d => { if (!keep.has(d.id)) batch.delete(d.ref); });

  await batch.commit(); // まとめて1回で反映（途中で失敗しても中途半端な状態にならない）
}

window.GomiCloud = {
  enabled: ok(),
  addCertificate, addStreak, fetchCertificates, fetchStreakRanking,
  adminSignIn, adminSignOut, isAdminSignedIn, adminDelete, adminRename,
  fetchQuiz, publishQuiz
};
window.dispatchEvent(new Event("gomicloud-ready"));
