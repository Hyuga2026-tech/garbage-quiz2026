/* Firebase の設定ファイル
 *
 * Firebaseコンソール →（プロジェクトの設定）→「マイアプリ」→ ウェブアプリ を追加すると
 * 下記の形式の設定値が表示されます。それをそのまま貼り付けてください。
 *
 * ※ この値（apiKey など）は秘密情報ではなく、公開しても問題ない設計です。
 *    不正な書き込みは firestore.rules（セキュリティルール）で制限します。
 * ※ YOUR_ のままの場合は「未設定」とみなされ、クイズ自体は通常どおり動きますが、
 *    獲得者一覧・ランキング機能は無効になります。
 */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCY7pOiNgN9gqtFCeSFV-HLqxCqnitf7EY",
  authDomain: "garbage-quiz2026.firebaseapp.com",
  projectId: "garbage-quiz2026",
  storageBucket: "garbage-quiz2026.firebasestorage.app",
  messagingSenderId: "878433880035",
  appId: "1:878433880035:web:c493b2c65d2bf4a59302d6",
  measurementId: "G-K7DXEC2QY8"
};

/* 管理者ログイン用のメールアドレス（Firebase Authenticationに作る管理者アカウント）。
 * ランキングの削除・名前変更は、このアカウントでログインしたときだけ許可されます。
 * firestore.rules 内の同じアドレスと必ず一致させてください。
 * 実在するメールでなくてもかまいません（受信は行いません）。 */
window.FIREBASE_ADMIN_EMAIL = "admin@gomi-quiz.example.com";
