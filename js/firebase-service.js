/* firebase-service.js
 * Firestore への読み書きをまとめたモジュール。
 * window.GomiCloud として公開し、quiz.js / board.js から利用します。
 *
 * Firebase が未設定（YOUR_ のまま）の場合は enabled=false になり、
 * クイズ本体は通常どおり動作します。
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const cfg = window.FIREBASE_CONFIG || {};
const enabled = !!cfg.apiKey && !String(cfg.apiKey).startsWith("YOUR_") &&
                !!cfg.projectId && !String(cfg.projectId).startsWith("YOUR_");

let db = null;
if (enabled) {
  try {
    db = getFirestore(initializeApp(cfg));
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
  const snap = await getDocs(query(collection(db, "streaks"), orderBy("maxStreak", "desc"), limit(200)));
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

window.GomiCloud = { enabled: ok(), addCertificate, addStreak, fetchCertificates, fetchStreakRanking };
window.dispatchEvent(new Event("gomicloud-ready"));
