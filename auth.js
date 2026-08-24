/* =========================================================================
   Personal Routine Customizer — auth.js
   Optional account system: a single username + password field that logs
   the user in if the account exists, or creates it instantly if it doesn't
   — no separate login/register tabs. Uses Firebase Authentication under
   the hood via the "fake email" trick (username -> `${username}@routine-
   customizer.local`), so there's no real email involved.

   This file is entirely self-contained and only activates the account
   icon in the top bar if a valid Firebase config is present below. If you
   don't want this feature, either leave firebaseConfig blank/unset or
   delete the <script type="module" src="auth.js"> tag in index.html —
   the rest of the app (which is plain, non-module JS in app.js) does not
   depend on this file at all.

   CLOUD SYNC: once signed in, the routine (days, times, courses,
   placements, etc. — the same object app.js keeps in localStorage) is
   also mirrored to Firestore under routines/{uid}, and kept in sync
   continuously while signed in. app.js exposes a tiny bridge for this
   (window.getRoutineState / window.replaceRoutineState / the
   window.__onRoutineStateSaved hook) so this file never needs to know
   the internal shape of app.js beyond that.
   ========================================================================= */

/* ---------- 1. Firebase config — fill this in to enable the feature ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyCa0QcLb8HsYNSaNLT0Mdr5QRYEEsmRw0g",
  authDomain: "rijwanul-hoque.firebaseapp.com",
  databaseURL: "https://rijwanul-hoque.firebaseio.com",
  projectId: "rijwanul-hoque",
  storageBucket: "rijwanul-hoque.firebasestorage.app",
  messagingSenderId: "227102045449",
  appId: "1:227102045449:web:1840b52f0f38a6668fcfd8",
  measurementId: "G-606ZQL8DQB"
};

/* ---------- 2. Constants ---------- */
const FIREBASE_SDK_VERSION = "12.18.0";
const FAKE_EMAIL_DOMAIN = "routine-customizer.local";
const USERNAME_MIN_LENGTH = 4;
const PASSWORD_MIN_LENGTH = 6;
const AUTH_SESSION_KEY = "routineCustomizer.auth.lastUsername";

function isConfigured() {
  return !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId
    && !String(firebaseConfig.apiKey).includes("YOUR_") );
}

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${FAKE_EMAIL_DOMAIN}`;
}

function normalizeUsername(raw) {
  return String(raw || "").trim();
}

function usernameDocId(username) {
  // Firestore doc IDs can't contain '/', and we lowercase for case-insensitive
  // uniqueness (Anisha vs anisha shouldn't be two different accounts).
  return normalizeUsername(username).toLowerCase();
}

/* ---------- 3. Lazy-load the Firebase SDK only if configured ---------- */
let _firebaseModules = null;
async function loadFirebase() {
  if (_firebaseModules) return _firebaseModules;
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  const [{ initializeApp }, authMod, fsMod] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`)
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = fsMod.getFirestore(app);
  _firebaseModules = { app, auth, db, authMod, fsMod };
  return _firebaseModules;
}

/* ---------- 4. Account operations ---------- */

function validateCredentials(uname, password) {
  if (uname.length < USERNAME_MIN_LENGTH) {
    throw new Error(`Username must be at least ${USERNAME_MIN_LENGTH} characters.`);
  }
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
}

/** Registers a brand-new account (used internally as the fallback when
    login fails because the account doesn't exist yet). */
async function registerAccount(username, password) {
  const uname = normalizeUsername(username);
  validateCredentials(uname, password);
  const { auth, db, authMod, fsMod } = await loadFirebase();
  const docId = usernameDocId(uname);
  const usernameRef = fsMod.doc(db, "usernames", docId);

  // Uniqueness check against the reserved-usernames collection. This is a
  // best-effort client-side check (a matching Firestore security rule that
  // only allows creating a usernames/{id} doc when it doesn't already
  // exist is what actually enforces this against races/abuse).
  const existing = await fsMod.getDoc(usernameRef);
  if (existing.exists()) {
    throw new Error("That username is already taken.");
  }

  const email = usernameToEmail(uname);
  let cred;
  try {
    cred = await authMod.createUserWithEmailAndPassword(auth, email, password);
  } catch (e) {
    throw new Error(friendlyAuthError(e));
  }

  try {
    await fsMod.setDoc(usernameRef, {
      uid: cred.user.uid,
      username: uname,
      createdAt: fsMod.serverTimestamp()
    });
  } catch (e) {
    // Roll back the auth account if we couldn't reserve the username, so we
    // don't leave an orphaned account with no reservation record.
    try { await cred.user.delete(); } catch (_) {}
    throw new Error("Could not reserve that username. Please try again.");
  }

  localStorage.setItem(AUTH_SESSION_KEY, uname);
  return { username: uname, uid: cred.user.uid };
}

async function loginAccount(username, password) {
  const uname = normalizeUsername(username);
  validateCredentials(uname, password);
  const { auth, authMod } = await loadFirebase();
  const email = usernameToEmail(uname);
  const cred = await authMod.signInWithEmailAndPassword(auth, email, password);
  localStorage.setItem(AUTH_SESSION_KEY, uname);
  return { username: uname, uid: cred.user.uid };
}

/** Single entry point for the "Continue" button: try to log in; if the
    account doesn't exist, register it instead. Any other failure (wrong
    password, bad username, network, etc.) is surfaced as-is. */
async function loginOrRegister(username, password) {
  const uname = normalizeUsername(username);
  validateCredentials(uname, password);
  try {
    return { user: await loginAccount(uname, password), created: false };
  } catch (e) {
    const code = e && e.code ? String(e.code) : "";
    const notFound = code.includes("user-not-found") || code.includes("invalid-credential") || code.includes("invalid-login-credentials");
    // We can't always distinguish "wrong password" from "no such account" —
    // newer Firebase SDKs intentionally blur this for security
    // (invalid-credential covers both). So: only fall back to registration
    // when we get a login error AND a follow-up check shows this username
    // has no reservation doc yet (i.e. it truly doesn't exist).
    if (!notFound) throw new Error(friendlyAuthError(e));
    const { db, fsMod } = await loadFirebase();
    const docId = usernameDocId(uname);
    const existing = await fsMod.getDoc(fsMod.doc(db, "usernames", docId));
    if (existing.exists()) {
      // Username IS taken — this really was a wrong password.
      throw new Error("Incorrect username or password.");
    }
    return { user: await registerAccount(uname, password), created: true };
  }
}

async function logoutAccount() {
  const { auth, authMod } = await loadFirebase();
  await authMod.signOut(auth);
  localStorage.removeItem(AUTH_SESSION_KEY);
}

function friendlyAuthError(e) {
  const code = e && e.code ? String(e.code) : "";
  if (code.includes("wrong-password") || code.includes("invalid-credential") || code.includes("invalid-login-credentials")) {
    return "Incorrect username or password.";
  }
  if (code.includes("user-not-found")) {
    return "No account with that username.";
  }
  if (code.includes("email-already-in-use")) {
    return "That username is already taken.";
  }
  if (code.includes("weak-password")) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (code.includes("network-request-failed")) {
    return "Network error — check your connection and try again.";
  }
  if (code.includes("too-many-requests")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (code.includes("permission-denied") || code.includes("missing-permissions") || /missing or insufficient permissions/i.test((e && e.message) || "")) {
    return "Server permissions error — please try again in a moment.";
  }
  return "Something went wrong. Please try again.";
}

/* ---------- 5. Cloud routine sync (routines/{uid}) ---------- */

let cloudSyncActive = false;
let cloudUid = null;
let cloudSaveTimer = null;
let isPublicShareOn = false; // mirrors routines/{uid}.public; included in every write below so
                              // continuous auto-sync doesn't clobber it back to false

/* ---- Sync status badge (visible only while signed in) ---- */
function syncBadgeEl() { return document.getElementById("syncBadge"); }

const SYNC_ICONS = {
  saved: '<i data-lucide="cloud-check"></i>',
  saving: '<i data-lucide="loader-2" class="spin"></i>',
  error: '<i data-lucide="cloud-alert"></i>'
};
const SYNC_TITLES = {
  saved: "Synced to cloud",
  saving: "Saving to cloud…",
  error: navigator.onLine ? "Could not sync to cloud" : "Offline — not synced to cloud"
};

function setSyncBadge(state) {
  const el = syncBadgeEl();
  if (!el) return;
  if (!state) { el.hidden = true; return; }
  el.hidden = false;
  el.dataset.state = state;
  el.title = state === "error" ? (navigator.onLine ? SYNC_TITLES.error : "Offline — not synced to cloud") : SYNC_TITLES[state];
  el.innerHTML = SYNC_ICONS[state];
  if (window.lucide) lucide.createIcons();
}

/** Good enough to tell "nothing meaningful to reconcile" apart from "these
    differ" — used only to skip showing the conflict prompt when cloud and
    local are already identical. */
function statesLookEqual(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
}

async function fetchCloudRoutine(uid) {
  const { db, fsMod } = await loadFirebase();
  const ref = fsMod.doc(db, "routines", uid);
  const snap = await fsMod.getDoc(ref);
  return snap.exists() ? snap.data().state : null;
}

/** Public (unauthenticated-readable) fetch, used by the /import/<username>
    flow. Resolves the username to a uid via the usernames collection
    (readable by anyone per the existing Firestore rule), then reads
    routines/{uid} — which itself is only readable by anyone when that
    routine's `public` field is true (enforced by the Firestore rule; see
    the setup note at the bottom of this file). */
async function fetchPublicRoutineByUsername(username) {
  const { db, fsMod } = await loadFirebase();
  const docId = usernameDocId(username);
  const unameSnap = await fsMod.getDoc(fsMod.doc(db, "usernames", docId));
  if (!unameSnap.exists()) return { notFound: true };
  const targetUid = unameSnap.data().uid;
  const routineSnap = await fsMod.getDoc(fsMod.doc(db, "routines", targetUid));
  if (!routineSnap.exists() || !routineSnap.data().public) return { notPublic: true };
  return { state: routineSnap.data().state, username: unameSnap.data().username };
}

async function pushRoutineToCloud(uid, state) {
  setSyncBadge("saving");
  const { db, fsMod } = await loadFirebase();
  const ref = fsMod.doc(db, "routines", uid);
  try {
    await fsMod.setDoc(ref, { state, public: isPublicShareOn, updatedAt: fsMod.serverTimestamp() });
    setSyncBadge("saved");
  } catch (e) {
    setSyncBadge("error");
    throw e;
  }
}

/** Flips the public-import flag for the signed-in user's own routine doc. */
async function setPublicShare(on) {
  if (!currentUser) throw new Error("Sign in first.");
  isPublicShareOn = !!on;
  const { db, fsMod } = await loadFirebase();
  const ref = fsMod.doc(db, "routines", currentUser.uid);
  await fsMod.setDoc(ref, { public: isPublicShareOn }, { merge: true });
}

/** Starts mirroring every local save up to Firestore for this uid.
    Debounced independently from app.js's own localStorage save so a burst
    of edits doesn't spam network writes. */
function startCloudSync(uid) {
  cloudSyncActive = true;
  cloudUid = uid;
  setSyncBadge("saved"); // assume in sync the moment we take over; the next real save will re-confirm
  window.__onRoutineStateSaved = (state) => {
    if (!cloudSyncActive) return;
    clearTimeout(cloudSaveTimer);
    setSyncBadge("saving");
    cloudSaveTimer = setTimeout(() => {
      pushRoutineToCloud(cloudUid, state).catch(e => {
        console.warn("Cloud sync failed:", e);
      });
    }, 400);
  };
  window.addEventListener("online", () => { if (cloudSyncActive) setSyncBadge("saved"); });
  window.addEventListener("offline", () => { if (cloudSyncActive) setSyncBadge("error"); });
  // Restore whatever the public-share flag currently is on the cloud doc,
  // so it isn't silently reset to false by the next auto-sync write.
  loadFirebase().then(({ db, fsMod }) => fsMod.getDoc(fsMod.doc(db, "routines", uid)))
    .then(snap => { isPublicShareOn = !!(snap.exists() && snap.data().public); refreshShareUI(); })
    .catch(() => {});
}

function stopCloudSync() {
  cloudSyncActive = false;
  cloudUid = null;
  isPublicShareOn = false;
  clearTimeout(cloudSaveTimer);
  if (window.__onRoutineStateSaved) delete window.__onRoutineStateSaved;
  setSyncBadge(null);
  refreshShareUI();
}

/** Called right after a successful login/registration. Decides whether we
    need to ask the user which routine to keep, or can just proceed. */
async function reconcileRoutineAfterAuth(uid, justRegistered) {
  if (justRegistered) {
    // Brand-new account: nothing in the cloud yet, so local data (if any)
    // becomes the starting point.
    const local = window.getRoutineState ? window.getRoutineState() : null;
    if (local) await pushRoutineToCloud(uid, local).catch(e => console.warn("Initial cloud push failed:", e));
    startCloudSync(uid);
    return;
  }

  const cloud = await fetchCloudRoutine(uid).catch(() => null);
  const local = window.getRoutineState ? window.getRoutineState() : null;

  if (!cloud) {
    // Existing account but nothing saved to the cloud yet — push local up.
    if (local) await pushRoutineToCloud(uid, local).catch(e => console.warn("Initial cloud push failed:", e));
    startCloudSync(uid);
    return;
  }

  if (!local || statesLookEqual(cloud, local)) {
    // Nothing to reconcile — just adopt the cloud copy (covers the "no
    // local data yet" and "already identical" cases) and start syncing.
    if (window.replaceRoutineState) window.replaceRoutineState(cloud);
    startCloudSync(uid);
    return;
  }

  // Both exist and differ — ask the user which one to keep.
  await promptRoutineConflict(uid, cloud, local);
}

/* ---------- 6. UI wiring ---------- */

let currentUser = null;     // { username, uid } | null
let pendingConflict = null; // { uid, cloud, local } while the conflict choice is showing

function els() {
  return {
    btnAccount: document.getElementById("btnAccount"),
    overlay: document.getElementById("accountOverlay"),
    btnClose: document.getElementById("btnCloseAccount"),
    btnCancel: document.getElementById("btnCancelAccount"),
    btnSubmit: document.getElementById("btnSubmitAccount"),
    btnLogout: document.getElementById("btnLogout"),
    username: document.getElementById("accountUsername"),
    password: document.getElementById("accountPassword"),
    error: document.getElementById("accountError"),
    signedOut: document.getElementById("accountSignedOut"),
    signedIn: document.getElementById("accountSignedIn"),
    currentUsernameEl: document.getElementById("accountCurrentUsername"),
    conflict: document.getElementById("accountConflict"),
    btnKeepCloud: document.getElementById("btnKeepCloud"),
    btnKeepLocal: document.getElementById("btnKeepLocal")
  };
}

function showError(msg) {
  const { error } = els();
  error.textContent = msg;
  error.hidden = false;
}
function clearError() {
  const { error } = els();
  error.hidden = true;
  error.textContent = "";
}

function renderSignedInState() {
  const { signedOut, signedIn, conflict, btnLogout, btnSubmit, currentUsernameEl, btnAccount } = els();
  if (pendingConflict) {
    signedOut.hidden = true;
    signedIn.hidden = true;
    conflict.hidden = false;
    btnLogout.hidden = true;
    btnSubmit.hidden = true;
    return;
  }
  conflict.hidden = true;
  if (currentUser) {
    signedOut.hidden = true;
    signedIn.hidden = false;
    btnLogout.hidden = false;
    btnSubmit.hidden = true;
    currentUsernameEl.textContent = currentUser.username;
    if (btnAccount) {
      btnAccount.title = `Signed in as ${currentUser.username}`;
      btnAccount.classList.add("is-signed-in");
    }
  } else {
    signedOut.hidden = false;
    signedIn.hidden = true;
    btnLogout.hidden = true;
    btnSubmit.hidden = false;
    if (btnAccount) {
      btnAccount.title = "Account";
      btnAccount.classList.remove("is-signed-in");
    }
  }
  const btnShare = document.getElementById("btnShareRoutine");
  const settingsRow = document.getElementById("settingsPublicShareRow");
  if (btnShare) btnShare.hidden = !currentUser;
  if (settingsRow) settingsRow.hidden = !currentUser;
}

function openAccountModal() {
  const { overlay, username, password } = els();
  clearError();
  if (!currentUser && !pendingConflict) {
    username.value = "";
    password.value = "";
  }
  renderSignedInState();
  overlay.hidden = false;
  if (window.lucide) lucide.createIcons();
  if (!currentUser && !pendingConflict) username.focus();
}

function closeAccountModal() {
  els().overlay.hidden = true;
}

async function promptRoutineConflict(uid, cloud, local) {
  pendingConflict = { uid, cloud, local };
  const { overlay } = els();
  renderSignedInState();
  overlay.hidden = false;
  if (window.lucide) lucide.createIcons();
}

async function resolveConflict(choice) {
  if (!pendingConflict) return;
  const { uid, cloud, local } = pendingConflict;
  if (choice === "cloud") {
    if (window.replaceRoutineState) window.replaceRoutineState(cloud);
  } else {
    await pushRoutineToCloud(uid, local).catch(e => console.warn("Push local to cloud failed:", e));
  }
  pendingConflict = null;
  startCloudSync(uid);
  if (window.showToast) showToast(choice === "cloud" ? "Loaded your saved routine." : "Kept this device's routine.");
  renderSignedInState();
}

async function handleSubmit() {
  const { username, password, btnSubmit } = els();
  clearError();
  const uname = normalizeUsername(username.value);
  const pass = password.value;

  try {
    validateCredentials(uname, pass);
  } catch (e) {
    showError(e.message);
    return;
  }

  btnSubmit.disabled = true;
  const originalHtml = btnSubmit.innerHTML;
  btnSubmit.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Please wait…';
  if (window.lucide) lucide.createIcons();

  try {
    const { user, created } = await loginOrRegister(uname, pass);
    currentUser = user;
    if (window.showToast) showToast(created ? `Account created — welcome, ${user.username}.` : `Logged in as ${user.username}.`);
    await reconcileRoutineAfterAuth(user.uid, created);
    renderSignedInState();
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    showError(e.message || "Something went wrong.");
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = originalHtml;
    if (window.lucide) lucide.createIcons();
  }
}

async function handleLogout() {
  try {
    await logoutAccount();
    stopCloudSync();
    currentUser = null;
    renderSignedInState();
    if (window.showToast) showToast("Logged out.");
    closeAccountModal();
  } catch (e) {
    if (window.showToast) showToast("Could not log out — try again.", "error");
  }
}

function wireAccountUI() {
  const { btnAccount, btnClose, btnCancel, btnSubmit, btnLogout, overlay, username, password, btnKeepCloud, btnKeepLocal } = els();

  btnAccount.addEventListener("click", openAccountModal);
  btnClose.addEventListener("click", closeAccountModal);
  btnCancel.addEventListener("click", closeAccountModal);
  overlay.addEventListener("click", (e) => { if (e.target.id === "accountOverlay") closeAccountModal(); });
  btnSubmit.addEventListener("click", handleSubmit);
  btnLogout.addEventListener("click", handleLogout);
  btnKeepCloud.addEventListener("click", () => resolveConflict("cloud"));
  btnKeepLocal.addEventListener("click", () => resolveConflict("local"));
  [username, password].forEach(inp => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); handleSubmit(); }
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden && !pendingConflict) closeAccountModal();
  });
}

/* ---------- 7. Share / import-link UI ---------- */

function shareEls() {
  return {
    btn: document.getElementById("btnShareRoutine"),
    overlay: document.getElementById("shareOverlay"),
    btnClose: document.getElementById("btnCloseShare"),
    btnClose2: document.getElementById("btnCloseShare2"),
    toggle: document.getElementById("setPublicShare"),
    settingsToggle: document.getElementById("setPublicShareSettings"),
    linkBlock: document.getElementById("shareLinkBlock"),
    linkInput: document.getElementById("shareLinkInput"),
    btnCopy: document.getElementById("btnCopyShareLink"),
    error: document.getElementById("shareError")
  };
}

function buildShareLink() {
  if (!currentUser) return "";
  return `${location.origin}/import/${encodeURIComponent(currentUser.username)}`;
}

/** Keeps the share icon's active state, the share modal's toggle+link, and
    the mirrored Settings toggle all in sync with isPublicShareOn. Safe to
    call anytime (e.g. right after startCloudSync restores the flag from
    Firestore, or after the user flips it). */
function refreshShareUI() {
  const { btn, toggle, settingsToggle, linkBlock, linkInput } = shareEls();
  if (btn) btn.classList.toggle("is-signed-in", isPublicShareOn);
  if (toggle) toggle.checked = isPublicShareOn;
  if (settingsToggle) settingsToggle.checked = isPublicShareOn;
  if (linkBlock) linkBlock.hidden = !isPublicShareOn;
  if (linkInput) linkInput.value = buildShareLink();
}

async function togglePublicShare(on) {
  const { error } = shareEls();
  error.hidden = true;
  try {
    await setPublicShare(on);
    refreshShareUI();
    if (window.showToast) showToast(on ? "Your import link is live." : "Import link turned off.");
  } catch (e) {
    error.textContent = "Could not update sharing — please try again.";
    error.hidden = false;
    refreshShareUI(); // revert any checkbox that got ahead of itself
  }
}

function openShareModal() {
  refreshShareUI();
  shareEls().overlay.hidden = false;
  if (window.lucide) lucide.createIcons();
}
function closeShareModal() { shareEls().overlay.hidden = true; }

function wireShareUI() {
  const { btn, btnClose, btnClose2, overlay, toggle, settingsToggle, btnCopy } = shareEls();
  if (!btn) return;
  btn.addEventListener("click", openShareModal);
  btnClose.addEventListener("click", closeShareModal);
  btnClose2.addEventListener("click", closeShareModal);
  overlay.addEventListener("click", (e) => { if (e.target.id === "shareOverlay") closeShareModal(); });
  toggle.addEventListener("change", (e) => togglePublicShare(e.target.checked));
  if (settingsToggle) settingsToggle.addEventListener("change", (e) => togglePublicShare(e.target.checked));
  btnCopy.addEventListener("click", async () => {
    const link = buildShareLink();
    try {
      await navigator.clipboard.writeText(link);
      if (window.showToast) showToast("Import link copied.");
    } catch (e) {
      if (window.showToast) showToast("Could not copy — select and copy manually.", "error");
    }
  });
}

/* ---------- 8. Import flow — via baseURL/import/<username> link, or
   manually from the Import/Export menu > "Import from Username" ---------- */

function importEls() {
  return {
    overlay: document.getElementById("importOverlay"),
    btnClose: document.getElementById("btnCloseImport"),
    btnCancel: document.getElementById("btnCancelImport"),
    btnConfirm: document.getElementById("btnConfirmImport"),
    mainLabel: document.getElementById("importMainLabel"),
    usernameField: document.getElementById("importUsernameField"),
    usernameInput: document.getElementById("importUsernameInput"),
    btnLookup: document.getElementById("btnImportLookup"),
    enabledToggle: document.getElementById("setImportEnabled"),
    optionsBlock: document.getElementById("importOptionsBlock"),
    appendToggle: document.getElementById("setImportAppend"),
    replaceSettingsToggle: document.getElementById("setImportReplaceSettings"),
    error: document.getElementById("importError")
  };
}

let pendingImport = null; // { state, username }

function closeImportModal() {
  importEls().overlay.hidden = true;
  // Clean the /import/username path out of the URL so a refresh doesn't
  // re-trigger the prompt after the user has already decided.
  if (location.pathname.startsWith("/import/")) {
    history.replaceState(null, "", "/");
  }
  pendingImport = null;
}

/** Looks up a username and, if it has a public routine, arms the confirm
    button. Shared by both entry points (URL route and manual lookup). */
async function beginImportForUsername(username) {
  const els_ = importEls();
  els_.mainLabel.textContent = `Import ${username}'s routine and settings`;
  els_.error.hidden = true;
  els_.optionsBlock.style.opacity = ".5";
  els_.btnConfirm.disabled = true;
  pendingImport = null;

  try {
    const result = await fetchPublicRoutineByUsername(username);
    if (result.notFound) throw new Error(`No account found for "${username}".`);
    if (result.notPublic) throw new Error(`${username} hasn't made their routine importable.`);
    pendingImport = { state: result.state, username: result.username };
    els_.optionsBlock.style.opacity = "1";
    els_.btnConfirm.disabled = false;
  } catch (e) {
    els_.error.textContent = e.message || "Could not load that routine.";
    els_.error.hidden = false;
    els_.btnConfirm.disabled = true;
  }
}

/** Entry point 1: visiting baseURL/import/<username>. Username comes from
    the URL, so the manual-entry field stays hidden. */
async function maybeHandleImportRoute() {
  const match = location.pathname.match(/^\/import\/([^/]+)\/?$/);
  if (!match) return;
  const username = decodeURIComponent(match[1]);

  const els_ = importEls();
  els_.usernameField.hidden = true;
  els_.overlay.hidden = false;
  if (window.lucide) lucide.createIcons();

  await beginImportForUsername(username);
}

/** Entry point 2: "Import from Username" in the Import/Export menu. Shows
    the manual username field + lookup button instead of assuming one. */
function openManualImportPrompt() {
  const els_ = importEls();
  els_.usernameField.hidden = false;
  els_.usernameInput.value = "";
  els_.mainLabel.textContent = "Import this routine and settings";
  els_.error.hidden = true;
  els_.optionsBlock.style.opacity = ".5";
  els_.btnConfirm.disabled = true;
  pendingImport = null;
  els_.overlay.hidden = false;
  if (window.lucide) lucide.createIcons();
  els_.usernameInput.focus();
}

function wireImportUI() {
  const { overlay, btnClose, btnCancel, btnConfirm, enabledToggle, optionsBlock, usernameInput, btnLookup } = importEls();
  btnClose.addEventListener("click", closeImportModal);
  btnCancel.addEventListener("click", closeImportModal);
  overlay.addEventListener("click", (e) => { if (e.target.id === "importOverlay") closeImportModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) closeImportModal();
  });
  enabledToggle.addEventListener("change", (e) => {
    optionsBlock.style.display = e.target.checked ? "" : "none";
  });

  const runLookup = () => {
    const uname = normalizeUsername(usernameInput.value);
    if (uname.length < USERNAME_MIN_LENGTH) {
      const { error } = importEls();
      error.textContent = `Enter a username (at least ${USERNAME_MIN_LENGTH} characters).`;
      error.hidden = false;
      return;
    }
    beginImportForUsername(uname);
  };
  btnLookup.addEventListener("click", runLookup);
  usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); runLookup(); }
  });

  btnConfirm.addEventListener("click", () => {
    const { enabledToggle, appendToggle, replaceSettingsToggle, error } = importEls();
    if (!enabledToggle.checked || !pendingImport) { closeImportModal(); return; }
    if (!window.importRoutineState) {
      error.textContent = "Import isn't available right now — please try again.";
      error.hidden = false;
      return;
    }
    const append = appendToggle.checked;
    const replaceSettings = replaceSettingsToggle.checked;
    const result = window.importRoutineState(pendingImport.state, { replace: !append, replaceSettings });
    if (!result.error) {
      const skippedNote = result.skippedPlacements ? ` (${result.skippedPlacements} placement${result.skippedPlacements===1?'':'s'} skipped — no matching day/time)` : "";
      if (window.showToast) showToast(`Imported ${result.importedCourses} course${result.importedCourses===1?'':'s'} from ${pendingImport.username}.${skippedNote}`);
    }
    closeImportModal();
  });
}

/* ---------- 9. Init — only show the account icon if configured ---------- */
(async function initAuth() {
  // The import route works regardless of whether the account feature is
  // configured/signed in — it's a public, read-only flow.
  wireImportUI();
  maybeHandleImportRoute();

  if (!isConfigured()) return; // account feature stays completely hidden/off
  const btnAccount = document.getElementById("btnAccount");
  if (!btnAccount) return;

  wireAccountUI();
  wireShareUI();
  btnAccount.hidden = false;
  if (window.lucide) lucide.createIcons();

  // Reveal "Import from Username" in the Import/Export menu — only makes
  // sense once the account/Firestore feature is actually configured.
  const menuImportUsername = document.getElementById("menuImportUsername");
  const menuImportUsernameDivider = document.getElementById("menuImportUsernameDivider");
  if (menuImportUsername) {
    menuImportUsername.hidden = false;
    if (menuImportUsernameDivider) menuImportUsernameDivider.hidden = false;
    menuImportUsername.addEventListener("click", () => {
      document.getElementById("exportMenu").hidden = true;
      openManualImportPrompt();
    });
  }

  // Restore session across refreshes (Firebase Auth persists sessions in
  // IndexedDB by default, so onAuthStateChanged will fire with the
  // already-signed-in user without requiring a fresh login).
  try {
    const { auth, authMod } = await loadFirebase();
    authMod.onAuthStateChanged(auth, (user) => {
      if (user) {
        const lastUsername = localStorage.getItem(AUTH_SESSION_KEY);
        currentUser = { username: lastUsername || (user.email || "").split("@")[0], uid: user.uid };
        // Re-establish cloud sync on refresh. We don't re-run the conflict
        // prompt here (that's a first-login-of-the-session concern) — we
        // just resume mirroring local saves up to this uid's cloud doc.
        startCloudSync(user.uid);
      } else {
        currentUser = null;
        stopCloudSync();
      }
      renderSignedInState();
    });
  } catch (e) {
    // Firebase failed to load (offline, blocked domain, bad config, etc.) —
    // fail silently and just leave the account icon non-functional rather
    // than breaking the rest of the app.
    console.warn("Account feature unavailable:", e);
  }
})();
