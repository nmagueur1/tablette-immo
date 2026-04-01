/* ═══════════════════════════════════════════════════
   app.js — data store, routing, utilities (Firebase)
═══════════════════════════════════════════════════ */

import { initializeApp }                                 from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

/* ── FIREBASE CONFIG ───────────────────────────────── */
const firebaseConfig = {
  apiKey:            "AIzaSyCZkJC56cCzq5qzrPV9_ndmJSEOvH9RGHw",
  authDomain:        "famille-rp-db7b5.firebaseapp.com",
  projectId:         "famille-rp-db7b5",
  storageBucket:     "famille-rp-db7b5.firebasestorage.app",
  messagingSenderId: "678859690728",
  appId:             "1:678859690728:web:75d49f0763a6d3c5beef5d"
};

const fireApp = initializeApp(firebaseConfig);
const db      = getFirestore(fireApp);
const REF     = doc(db, 'famille', 'main');

/* ── DEFAULT DATA ──────────────────────────────────── */
const defaultDB = {
  meta: { nom: '[Nom de famille]', updated: Date.now() },
  membres: [
    { id: 1, initiales:'P1', nom:'Patron 1', pseudo:'[Pseudo]', role:'Patron', statut:'actif', parts:'..%', note:'' },
    { id: 2, initiales:'P2', nom:'Patron 2', pseudo:'[Pseudo]', role:'Patron', statut:'actif', parts:'..%', note:'' },
    { id: 3, initiales:'M3', nom:'Membre 3', pseudo:'[Pseudo]', role:'Membre', statut:'actif', parts:'..%', note:'' },
    { id: 4, initiales:'M4', nom:'Membre 4', pseudo:'[Pseudo]', role:'Membre', statut:'actif', parts:'..%', note:'' },
    { id: 5, initiales:'M5', nom:'Membre 5', pseudo:'[Pseudo]', role:'Membre', statut:'actif', parts:'..%', note:'' },
  ],
  finances: { caisse: 0, objectif: 500000, objectifLabel: 'Rachat des parts', transactions: [] },
  missions: [],
  ventes: [],
  votes: [],
  journal: [],
  catalogue: []
};

window.DB = {};
let _unsubscribe = null;
let currentPage = 'dashboard';

/* ── FIREBASE LOAD ─────────────────────────────────── */
async function loadDB() {
  try {
    const snap = await getDoc(REF);
    if (snap.exists()) {
      window.DB = snap.data();
    } else {
      window.DB = JSON.parse(JSON.stringify(defaultDB));
      await setDoc(REF, window.DB);
    }
  } catch(e) {
    console.error('loadDB error:', e);
    window.DB = JSON.parse(JSON.stringify(defaultDB));
  }
}

/* ── FIREBASE SAVE ─────────────────────────────────── */
window.saveDB = async function() {
  window.DB.meta.updated = Date.now();
  try { await setDoc(REF, window.DB); }
  catch(e) { console.error('saveDB error:', e); window.toast('⚠ Erreur de sauvegarde'); }
};

/* ── REALTIME SYNC ─────────────────────────────────── */
function startRealtimeSync() {
  if (_unsubscribe) _unsubscribe();
  _unsubscribe = onSnapshot(REF, snap => {
    if (snap.exists()) {
      const d = snap.data();
      if (d.meta?.updated !== window.DB.meta?.updated) {
        window.DB = d;
        detectRole();
        renderPage(currentPage);
      }
    }
  });
}

/* ── THEME ─────────────────────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = saved === 'dark' ? '☀' : '☾';
}
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = next === 'dark' ? '☀' : '☾';
}

/* ── ROUTING ───────────────────────────────────────── */
const PAGE_TITLES = {
  dashboard:  'Tableau de bord',   membres:   'Gestion des membres',
  finances:   'Caisse & Finances', missions:  'Objectifs & Missions',
  journal:    'Journal des actions',
  ventes:     'Ventes',            votes:     'Votes & Décisions',
  catalogue:  'Catalogue Immobilier',
};

function renderPage(page) {
  if (page === 'dashboard')  window.renderDashboard?.();
  if (page === 'membres')    window.renderMembres?.();
  if (page === 'finances')   window.renderFinances?.();
  if (page === 'missions')   window.renderMissions?.();
  if (page === 'journal')    window.renderJournal?.();
  if (page === 'ventes')     window.renderVentes?.();
  if (page === 'votes')      window.renderVotes?.();
  if (page === 'catalogue')  window.renderCatalogue?.();
}

window.navigate = function(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  const t = document.getElementById('topbar-title');
  if (t) t.textContent = PAGE_TITLES[page] || '';
  renderPage(page);
};

/* ── TOAST ─────────────────────────────────────────── */
let toastTimer;
window.toast = function(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
};

/* ── MODAL ─────────────────────────────────────────── */
window.openModal  = id => document.getElementById(id).classList.add('open');
window.closeModal = id => document.getElementById(id).classList.remove('open');

/* ── UTILS ─────────────────────────────────────────── */
window.uid          = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
window.fmtMoney     = n  => new Intl.NumberFormat('fr-FR', { maximumFractionDigits:0 }).format(n) + ' $';
window.fmtDate      = ts => new Date(ts).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
window.fmtDateShort = ts => new Date(ts).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
window.initiales    = str => str.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);

/* ── CLOCK ─────────────────────────────────────────── */
function startClock() {
  const el = document.getElementById('sidebar-time');
  if (!el) return;
  const tick = () => { el.textContent = new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }); };
  tick(); setInterval(tick, 1000);
}

/* ── DÉTECTION DU RÔLE ─────────────────────────────── */
function detectRole() {
  const raw    = sessionStorage.getItem('tablette-user') || '';
  // Le displayName stocké est le pseudo (ex: "MasonKnox") ou l'email ("mason.knox@famille.rp")
  const pseudo = raw.includes('@') ? raw.split('@')[0].replace(/\./g, ' ') : raw;
  const p      = pseudo.toLowerCase().trim();

  // Cherche le membre correspondant (matching souple sur pseudo et nom)
  const match = DB.membres.find(m => {
    const mPs  = (m.pseudo || '').toLowerCase().trim();
    const mNom = (m.nom    || '').toLowerCase().trim();
    return (
      mPs  === p ||
      mNom === p ||
      mPs.replace(/\s/g, '')  === p.replace(/\s/g, '') ||
      mNom.replace(/\s/g, '') === p.replace(/\s/g, '')
    );
  });

  // Patron si : aucune correspondance trouvée (DB pas encore remplie) ou rôle = Patron
  const isPatron = !match || match.role === 'Patron';
  document.body.classList.toggle('is-patron', isPatron);

  // Badge rôle dans la sidebar
  const badge = document.getElementById('sidebar-role-badge');
  if (badge) {
    const label = match ? match.role : '—';
    badge.textContent = label;
    badge.className   = 'role-badge ' + (isPatron ? 'patron' : 'membre');
  }
}

/* ── INIT ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  startClock();
  const t = document.getElementById('topbar-title');
  if (t) t.textContent = 'Chargement…';

  await loadDB();
  detectRole();
  startRealtimeSync();

  document.querySelectorAll('.nav-item[data-page]').forEach(item =>
    item.addEventListener('click', () => window.navigate(item.dataset.page))
  );
  document.getElementById('btn-theme')?.addEventListener('click', toggleTheme);
  document.querySelectorAll('.modal-bg').forEach(bg =>
    bg.addEventListener('click', e => { if (e.target === bg) bg.classList.remove('open'); })
  );
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
  });

  window.navigate('dashboard');
});
