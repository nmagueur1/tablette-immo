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
const REF     = doc(db, 'wj-realty', 'main');

/* ── DEFAULT DATA ──────────────────────────────────── */
const defaultDB = {
  meta: { nom: 'Dynasty 8', updated: Date.now() },
  membres: [
    // ── PATRONS (2) ──
    { id: 1,  initiales:'EC', nom:'Elijah Carter', pseudo:'ElijahCarter', role:'Patron',      statut:'actif', parts:'25%',   note:'Patron · porteur du projet' },
    { id: 2,  initiales:'SC', nom:'Sidji Carter',  pseudo:'SidjiCarter',  role:'Patron',      statut:'actif', parts:'25%',   note:'Co-Patron · co-dirigeant' },
    // ── EXPÉRIMENTÉS (4) ──
    { id: 3,  initiales:'E1', nom:'[Prénom] [Nom]', pseudo:'[Pseudo]', role:'Expérimenté', statut:'actif', parts:'17,5%', note:'' },
    { id: 4,  initiales:'E2', nom:'[Prénom] [Nom]', pseudo:'[Pseudo]', role:'Expérimenté', statut:'actif', parts:'17,5%', note:'' },
    { id: 5,  initiales:'E3', nom:'[Prénom] [Nom]', pseudo:'[Pseudo]', role:'Expérimenté', statut:'actif', parts:'17,5%', note:'' },
    { id: 6,  initiales:'E4', nom:'[Prénom] [Nom]', pseudo:'[Pseudo]', role:'Expérimenté', statut:'actif', parts:'17,5%', note:'' },
    // ── AGENTS (9) ──
    { id: 7,  initiales:'A1', nom:'[Prénom] [Nom]', pseudo:'[Pseudo]', role:'Agent', statut:'actif', parts:'10%', note:'' },
    { id: 8,  initiales:'A2', nom:'[Prénom] [Nom]', pseudo:'[Pseudo]', role:'Agent', statut:'actif', parts:'10%', note:'' },
    { id: 9,  initiales:'A3', nom:'[Prénom] [Nom]', pseudo:'[Pseudo]', role:'Agent', statut:'actif', parts:'10%', note:'' },
    { id: 10, initiales:'A4', nom:'[Prénom] [Nom]', pseudo:'[Pseudo]', role:'Agent', statut:'actif', parts:'10%', note:'' },
    { id: 11, initiales:'A5', nom:'[Prénom] [Nom]', pseudo:'[Pseudo]', role:'Agent', statut:'actif', parts:'10%', note:'' },
    { id: 12, initiales:'A6', nom:'[Prénom] [Nom]', pseudo:'[Pseudo]', role:'Agent', statut:'actif', parts:'10%', note:'' },
    { id: 13, initiales:'A7', nom:'[Prénom] [Nom]', pseudo:'[Pseudo]', role:'Agent', statut:'actif', parts:'10%', note:'' },
    { id: 14, initiales:'A8', nom:'[Prénom] [Nom]', pseudo:'[Pseudo]', role:'Agent', statut:'actif', parts:'10%', note:'' },
    { id: 15, initiales:'A9', nom:'[Prénom] [Nom]', pseudo:'[Pseudo]', role:'Agent', statut:'actif', parts:'10%', note:'' },
  ],
  finances: { caisse: 0, objectif: 500000, objectifLabel: 'Coffre Dynasty 8', transactions: [] },
  missions: [],
  ventes: [],
  votes: [],
  journal: [],
  catalogue: [],
  avis: []
};

window.DB = {};
let _unsubscribe = null;
window.currentPage = 'dashboard';

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

/* ── RESET COMPLET (efface Firestore + localStorage) ─ */
window.resetDB = async function() {
  const fresh = JSON.parse(JSON.stringify(defaultDB));
  fresh.meta.updated = Date.now();
  window.DB = fresh;
  try { await setDoc(REF, fresh); }
  catch(e) { console.error('resetDB error:', e); throw e; }
  try { localStorage.removeItem('theme'); } catch(_) {}
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
        renderPage(window.currentPage);
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
  dashboard:  'Dashboard',         membres:   'Gestion des membres',
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
  window.currentPage = page;
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
  // Le displayName stocké est le pseudo (ex: "ElijahCarter") ou l'email ("elijah.carter@dynasty8.rp")
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
