import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// Owner authorization remains fail-closed and is scoped to the named
// 'smart-hsr-owner-session' Firebase app instance shared by owner.html and
// owner-login.html. This only answers the fact question (is this uid an
// active owner) — each caller keeps its own response to a denial
// (owner.html redirects away; owner-login.html shows an inline error).
export async function isAuthorizedOwner({ db, uid }) {
  const snap = await getDoc(doc(db, 'owners', uid));
  return snap.exists() && snap.data()?.active !== false;
}
