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
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
