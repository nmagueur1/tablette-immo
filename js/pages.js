/* ═══════════════════════════════════════════════════
   pages.js — all page renderers
═══════════════════════════════════════════════════ */

function renderDashboard() {
  const actifs = DB.membres.filter(m => m.statut === 'actif').length;
  const caisse = DB.finances.caisse;
  const obj    = DB.finances.objectif;
  const pct    = obj > 0 ? Math.min(100, Math.round((caisse / obj) * 100)) : 0;
  const missionsActives = DB.missions.filter(m => !m.done).length;
  const journalCount    = DB.journal.length;

  document.getElementById('dash-membres').textContent  = actifs;
  document.getElementById('dash-caisse').textContent   = fmtMoney(caisse);
  document.getElementById('dash-missions').textContent = missionsActives;
  document.getElementById('dash-journal').textContent  = journalCount;

  const circ = 2 * Math.PI * 36;
  const ring = document.getElementById('dash-ring');
  if (ring) { ring.style.strokeDasharray = circ; ring.style.strokeDashoffset = circ - (pct/100)*circ; }
  const pctEl = document.getElementById('dash-pct');
  if (pctEl) pctEl.textContent = pct + '%';

  const recent = [...DB.journal].sort((a,b) => b.ts - a.ts).slice(0,4);
  const jEl = document.getElementById('dash-journal-list');
  if (jEl) {
    jEl.innerHTML = !recent.length
      ? `<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">Aucune entrée</div></div>`
      : recent.map(e => `
        <div class="journal-entry">
          <div class="journal-entry-head">
            <span class="journal-entry-title">${e.titre}</span>
            <span class="journal-entry-date">${fmtDateShort(e.ts)}</span>
          </div>
          <div class="journal-entry-body">${e.contenu.slice(0,120)}${e.contenu.length>120?'…':''}</div>
        </div>`).join('');
  }

  const rMissions = DB.missions.filter(m => !m.done).slice(0,3);
  const mEl = document.getElementById('dash-missions-list');
  if (mEl) {
    mEl.innerHTML = !rMissions.length
      ? `<div class="empty"><div class="empty-icon">🎯</div><div class="empty-text">Aucune mission active</div></div>`
      : rMissions.map(m => `
        <div class="mission-card" style="margin-bottom:0.5rem;">
          <div class="mission-check${m.done?' done':''}"></div>
          <div class="mission-body">
            <div class="mission-title">${m.titre}</div>
            <div class="mission-meta">
              <span class="tag tag-${phaseTag(m.phase)}">${m.phase}</span>
              ${m.assignee ? `<span style="font-size:11px;color:var(--c-faint)">${m.assignee}</span>` : ''}
            </div>
          </div>
        </div>`).join('');
  }
}

/* ── TEMPS ACTIF ─────────────────────────────────── */
function getWeekStart() {
  const now = new Date();
  const diff = (now.getDay() === 0 ? -6 : 1 - now.getDay());
  const mon = new Date(now);
  mon.setHours(0,0,0,0);
  mon.setDate(now.getDate() + diff);
  return mon.getTime();
}

function getTempsActifSemaine(m) {
  const weekStart = getWeekStart();
  let total = 0;
  for (const s of (m.sessions || [])) {
    if (s.fin && s.fin >= weekStart) total += s.fin - Math.max(s.debut, weekStart);
  }
  if (m.statut === 'actif' && m.sessionDebut) {
    total += Date.now() - Math.max(m.sessionDebut, weekStart);
  }
  return total;
}

function fmtDuree(ms) {
  if (ms <= 0) return '0h 00m';
  const h   = Math.floor(ms / 3600000);
  const min = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${String(min).padStart(2,'0')}m`;
}

let _timerInterval = null;
function startLiveTimers() {
  clearInterval(_timerInterval);
  _timerInterval = setInterval(() => {
    DB.membres.forEach(m => {
      if (m.statut === 'actif' && m.sessionDebut) {
        const el = document.getElementById(`timer-${m.id}`);
        if (el) el.textContent = fmtDuree(getTempsActifSemaine(m));
      }
    });
  }, 10000);
}

function changerStatut(id, nouveau) {
  const m = DB.membres.find(x => x.id === id);
  if (!m || m.statut === nouveau) return;
  const ancien = m.statut;
  if (nouveau === 'actif') {
    m.sessionDebut = Date.now();
    m.statut = 'actif';
    DB.journal.push({ id: uid(), ts: Date.now(), titre: `En service : ${m.nom}`, contenu: `${m.pseudo} est maintenant actif en service.`, tags: ['membre'], auteur: 'Système' });
    toast(`${m.nom} est maintenant en service !`);
  } else {
    if (ancien === 'actif' && m.sessionDebut) {
      if (!m.sessions) m.sessions = [];
      m.sessions.push({ debut: m.sessionDebut, fin: Date.now() });
      m.sessionDebut = null;
      const duree = fmtDuree(getTempsActifSemaine(m));
      DB.journal.push({ id: uid(), ts: Date.now(), titre: `Session terminée : ${m.nom}`, contenu: `${m.pseudo} a quitté le jeu. Total semaine : ${duree}`, tags: ['membre'], auteur: 'Système' });
      toast(`${m.nom} — session terminée. Total semaine : ${duree}`);
    }
    m.statut = nouveau;
  }
  saveDB();
  renderMembres();
  if (currentPage === 'dashboard') renderDashboard();
}

function resetSemaine() {
  if (!confirm('Remettre tous les compteurs à zéro pour la nouvelle semaine ?')) return;
  DB.membres.forEach(m => {
    if (m.statut === 'actif' && m.sessionDebut) {
      if (!m.sessions) m.sessions = [];
      m.sessions.push({ debut: m.sessionDebut, fin: Date.now() });
      m.sessionDebut = null;
    }
    m.sessions = [];
  });
  saveDB();
  renderMembres();
  toast('Compteurs remis à zéro ✓');
}

/* ── MEMBRES ─────────────────────────────────────── */
function renderMembres() {
  const tbody = document.getElementById('membres-tbody');
  if (!tbody) return;
  if (!DB.membres.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-icon">👥</div><div class="empty-text">Aucun membre</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = DB.membres.map(m => {
    const isActif  = m.statut === 'actif';
    const tempsStr = fmtDuree(getTempsActifSemaine(m));
    return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:0.75rem;cursor:pointer;" onclick="openFicheMembre(${m.id})" title="Voir la fiche">
          <div class="avatar" style="position:relative;transition:border-color 0.2s;" onmouseover="this.style.borderColor='var(--c-gold)'" onmouseout="this.style.borderColor=''">
            ${m.initiales}
            ${isActif ? `<span style="position:absolute;bottom:0;right:0;width:9px;height:9px;border-radius:50%;background:var(--c-green);border:2px solid var(--c-card);"></span>` : ''}
          </div>
          <div>
            <div style="font-weight:500;">${m.nom}</div>
            <div style="font-size:11px;color:var(--c-muted);">${m.pseudo}</div>
          </div>
        </div>
      </td>
      <td><span class="tag tag-gold">${m.role}</span></td>
      <td style="font-family:var(--f-display);font-size:18px;color:var(--c-gold);">${m.parts}</td>
      <td>
        <select class="statut-select" data-id="${m.id}"
          style="background:var(--c-surface);border:1px solid var(--c-border-m);border-radius:var(--r-md);
                 padding:4px 8px;font-size:12px;color:var(--c-white);outline:none;cursor:pointer;">
          <option value="actif"   ${isActif             ?'selected':''}>🟢 Actif</option>
          <option value="absent"  ${m.statut==='absent'  ?'selected':''}>🔴 Absent</option>
          <option value="inactif" ${m.statut==='inactif' ?'selected':''}>⚪ Inactif</option>
        </select>
      </td>
      <td>
        <div style="display:flex;flex-direction:column;gap:2px;">
          <span id="timer-${m.id}" style="font-family:var(--f-display);font-size:18px;color:${isActif?'var(--c-green)':'var(--c-muted)'};">${tempsStr}</span>
          <span style="font-size:10px;color:var(--c-faint);letter-spacing:0.1em;">cette semaine</span>
        </div>
      </td>
      <td style="color:var(--c-muted);font-size:12px;">${m.note || '—'}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn-secondary patron-only" style="padding:0.3rem 0.65rem;font-size:11px;" onclick="editMembre(${m.id})">Modifier</button>
          <button class="btn-danger patron-only" onclick="deleteMembre(${m.id})">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.querySelectorAll('.statut-select').forEach(sel => {
    sel.addEventListener('change', () => changerStatut(parseInt(sel.dataset.id), sel.value));
  });
  startLiveTimers();
}

function editMembre(id) {
  const m = DB.membres.find(x => x.id === id);
  if (!m) return;
  document.getElementById('m-id').value        = m.id;
  document.getElementById('m-nom').value       = m.nom;
  document.getElementById('m-pseudo').value    = m.pseudo;
  document.getElementById('m-initiales').value = m.initiales;
  document.getElementById('m-role').value      = m.role;
  document.getElementById('m-parts').value     = m.parts;
  document.getElementById('m-statut').value    = m.statut;
  document.getElementById('m-note').value      = m.note || '';
  document.getElementById('modal-membre-title').textContent = 'Modifier le membre';
  openModal('modal-membre');
}

function newMembre() {
  document.getElementById('m-id').value        = '';
  document.getElementById('m-nom').value       = '';
  document.getElementById('m-pseudo').value    = '';
  document.getElementById('m-initiales').value = '';
  document.getElementById('m-role').value      = 'Membre';
  document.getElementById('m-parts').value     = '0%';
  document.getElementById('m-statut').value    = 'actif';
  document.getElementById('m-note').value      = '';
  document.getElementById('modal-membre-title').textContent = 'Nouveau membre';
  openModal('modal-membre');
}

function saveMembre() {
  const id  = document.getElementById('m-id').value;
  const nom = document.getElementById('m-nom').value.trim();
  if (!nom) { toast('Le nom est requis.'); return; }
  const data = {
    nom,
    pseudo:    document.getElementById('m-pseudo').value.trim(),
    initiales: document.getElementById('m-initiales').value.trim() || initiales(nom),
    role:      document.getElementById('m-role').value,
    parts:     document.getElementById('m-parts').value.trim(),
    statut:    document.getElementById('m-statut').value,
    note:      document.getElementById('m-note').value.trim(),
  };
  if (id) {
    const idx = DB.membres.findIndex(m => m.id === parseInt(id));
    if (idx >= 0) DB.membres[idx] = { ...DB.membres[idx], ...data };
    DB.journal.push({ id: uid(), ts: Date.now(), titre: `Membre modifié : ${nom}`, contenu: `Rôle : ${data.role} · Parts : ${data.parts} · Statut : ${data.statut}${data.note ? ' · Note : ' + data.note : ''}`, tags: ['membre'], auteur: 'Système' });
  } else {
    DB.membres.push({ id: Date.now(), ...data });
    DB.journal.push({ id: uid(), ts: Date.now(), titre: `Nouveau membre : ${nom}`, contenu: `${data.pseudo} a rejoint la famille. Rôle : ${data.role} · Parts : ${data.parts}`, tags: ['membre'], auteur: 'Système' });
  }
  saveDB();
  closeModal('modal-membre');
  renderMembres();
  toast('Membre sauvegardé.');
}

function deleteMembre(id) {
  if (!confirm('Supprimer ce membre ?')) return;
  const m = DB.membres.find(x => x.id === id);
  if (m) DB.journal.push({ id: uid(), ts: Date.now(), titre: `Membre supprimé : ${m.nom}`, contenu: `${m.pseudo} a été retiré de la famille.`, tags: ['membre'], auteur: 'Système' });
  DB.membres = DB.membres.filter(m => m.id !== id);
  saveDB();
  renderMembres();
  toast('Membre supprimé.');
}

/* ── FINANCES ────────────────────────────────────── */
function renderFinances() {
  const { caisse, objectif, transactions } = DB.finances;
  const pct = objectif > 0 ? Math.min(100, Math.round((caisse / objectif) * 100)) : 0;

  document.getElementById('fin-caisse').textContent   = fmtMoney(caisse);
  document.getElementById('fin-objectif').textContent = fmtMoney(objectif);
  document.getElementById('fin-pct').textContent      = pct + '%';
  document.getElementById('fin-bar').style.width      = pct + '%';

  const subEl = document.getElementById('fin-objectif-sub');
  if (subEl) subEl.textContent = DB.finances.objectifLabel || 'à atteindre';

  const splitEl = document.getElementById('fin-split');
  if (splitEl) {
    splitEl.innerHTML = DB.membres.map(m => {
      const share = (caisse * 0.25 * (parseFloat(m.parts) || 0)) / 100;
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem 1.25rem;border-bottom:1px solid var(--c-border);background:var(--c-card);">
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <div class="avatar">${m.initiales}</div>
          <div>
            <div style="font-size:13px;font-weight:500;">${m.nom}</div>
            <div style="font-size:11px;color:var(--c-muted);">${m.parts}</div>
          </div>
        </div>
        <div style="font-family:var(--f-display);font-size:20px;color:var(--c-gold);">${fmtMoney(share)}</div>
      </div>`;
    }).join('');
  }

  const txEl = document.getElementById('fin-transactions');
  if (txEl) {
    const sorted = [...transactions].sort((a,b) => b.ts - a.ts).slice(0,20);
    txEl.innerHTML = !sorted.length
      ? `<tr><td colspan="4"><div class="empty"><div class="empty-icon">💸</div><div class="empty-text">Aucune transaction</div></div></td></tr>`
      : sorted.map(t => `
        <tr>
          <td style="color:var(--c-muted);font-size:12px;">${fmtDate(t.ts)}</td>
          <td>${t.label}</td>
          <td><span class="tag tag-${t.type==='entree'?'green':'red'}">${t.type==='entree'?'Entrée':'Sortie'}</span></td>
          <td style="font-family:var(--f-display);font-size:18px;color:${t.type==='entree'?'var(--c-green)':'var(--c-red)'};">
            ${t.type==='entree'?'+':'−'}${fmtMoney(Math.abs(t.montant))}
          </td>
          <td><button class="btn-danger patron-only" onclick="deleteTransaction('${t.id}')">✕</button></td>
        </tr>`).join('');
  }
}

function addTransaction() {
  const label   = document.getElementById('tx-label').value.trim();
  const montant = parseFloat(document.getElementById('tx-montant').value);
  const type    = document.getElementById('tx-type').value;
  const note    = document.getElementById('tx-note').value.trim();
  if (!label || isNaN(montant) || montant <= 0) { toast('Remplis tous les champs.'); return; }

  DB.finances.transactions.push({ id: uid(), label, montant, type, note, ts: Date.now() });
  if (type === 'entree') DB.finances.caisse += montant;
  else                   DB.finances.caisse -= montant;

  DB.journal.push({
    id: uid(), ts: Date.now(),
    titre: `Transaction : ${label}`,
    contenu: `${type === 'entree' ? 'Entrée' : 'Sortie'} de ${fmtMoney(montant)}${note ? ' — ' + note : ''}`,
    tags: ['finances'], auteur: 'Système'
  });

  saveDB();
  closeModal('modal-transaction');
  renderFinances();
  toast('Transaction enregistrée.');
  ['tx-label','tx-montant','tx-note'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('tx-type').value = 'entree';
}

function updateObjectif() {
  const val   = parseFloat(document.getElementById('fin-objectif-input').value);
  const label = document.getElementById('fin-objectif-label').value.trim();
  if (isNaN(val) || val <= 0) { toast('Montant invalide.'); return; }
  DB.finances.objectif = val;
  if (label) DB.finances.objectifLabel = label;
  DB.journal.push({ id: uid(), ts: Date.now(), titre: `Objectif mis à jour`, contenu: `Nouvel objectif : ${new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(val)} $${label ? ' · ' + label : ''}`, tags: ['finances'], auteur: 'Système' });
  saveDB();
  closeModal('modal-objectif');
  renderFinances();
  toast('Objectif mis à jour.');
}

/* ── MISSIONS ────────────────────────────────────── */
function phaseTag(p) {
  if (p === 'Court terme') return 'green';
  if (p === 'Moyen terme') return 'gold';
  if (p === 'Long terme')  return 'blue';
  return 'gray';
}

function renderMissions() {
  ['Court terme','Moyen terme','Long terme'].forEach(phase => {
    const key = phase.toLowerCase().replace(' ','_');
    const el  = document.getElementById('missions-' + key);
    if (!el) return;
    const items = DB.missions.filter(m => m.phase === phase);
    el.innerHTML = !items.length
      ? `<div class="empty" style="padding:2rem;"><div class="empty-icon">🎯</div><div class="empty-text">Aucune mission</div></div>`
      : items.map(m => `
        <div class="mission-card">
          <div class="mission-check${m.done?' done':''}" onclick="toggleMission('${m.id}')"></div>
          <div class="mission-body">
            <div class="mission-title${m.done?' done':''}">${m.titre}</div>
            ${m.desc ? `<div class="mission-desc">${m.desc}</div>` : ''}
            <div class="mission-meta">
              <span class="tag tag-${phaseTag(m.phase)}">${m.phase}</span>
              ${m.assignee ? `<span style="font-size:11px;color:var(--c-faint)">→ ${m.assignee}</span>` : ''}
            </div>
          </div>
          <div class="mission-actions">
            <button class="btn-secondary patron-only" style="padding:0.3rem 0.65rem;font-size:11px;" onclick="editMission('${m.id}')">✏</button>
            <button class="btn-danger patron-only" onclick="deleteMission('${m.id}')">✕</button>
          </div>
        </div>`).join('');
  });
  const total = DB.missions.length;
  const done  = DB.missions.filter(m => m.done).length;
  const pctEl = document.getElementById('missions-progress');
  if (pctEl) pctEl.textContent = total ? `${done} / ${total} complétées` : 'Aucune mission';
}

function toggleMission(id) {
  const m = DB.missions.find(x => x.id === id);
  if (!m) return;
  m.done = !m.done;
  if (m.done) {
    DB.journal.push({
      id: uid(), ts: Date.now(),
      titre: `Mission complétée : ${m.titre}`,
      contenu: `La mission "${m.titre}" a été marquée comme accomplie.`,
      tags: ['mission', m.phase.toLowerCase()], auteur: 'Système'
    });
  }
  saveDB();
  renderMissions();
  if (m.done) toast('Mission marquée complète ✓');
}

function newMission() {
  document.getElementById('mis-id').value       = '';
  document.getElementById('mis-titre').value    = '';
  document.getElementById('mis-desc').value     = '';
  document.getElementById('mis-phase').value    = 'Court terme';
  document.getElementById('mis-assignee').value = '';
  document.getElementById('modal-mission-title').textContent = 'Nouvelle mission';
  openModal('modal-mission');
}

function editMission(id) {
  const m = DB.missions.find(x => x.id === id);
  if (!m) return;
  document.getElementById('mis-id').value       = m.id;
  document.getElementById('mis-titre').value    = m.titre;
  document.getElementById('mis-desc').value     = m.desc || '';
  document.getElementById('mis-phase').value    = m.phase;
  document.getElementById('mis-assignee').value = m.assignee || '';
  document.getElementById('modal-mission-title').textContent = 'Modifier la mission';
  openModal('modal-mission');
}

function saveMission() {
  const id    = document.getElementById('mis-id').value;
  const titre = document.getElementById('mis-titre').value.trim();
  if (!titre) { toast('Le titre est requis.'); return; }
  const data = {
    titre,
    desc:     document.getElementById('mis-desc').value.trim(),
    phase:    document.getElementById('mis-phase').value,
    assignee: document.getElementById('mis-assignee').value.trim(),
  };
  if (id) {
    const idx = DB.missions.findIndex(m => m.id === id);
    if (idx >= 0) DB.missions[idx] = { ...DB.missions[idx], ...data };
    DB.journal.push({ id: uid(), ts: Date.now(), titre: `Mission modifiée : ${titre}`, contenu: `Phase : ${data.phase}${data.assignee ? ' · Assignée à : ' + data.assignee : ''}`, tags: ['mission'], auteur: 'Système' });
  } else {
    DB.missions.push({ id: uid(), done: false, ...data });
    DB.journal.push({ id: uid(), ts: Date.now(), titre: `Nouvelle mission : ${titre}`, contenu: `Phase : ${data.phase}${data.assignee ? ' · Assignée à : ' + data.assignee : ''}${data.desc ? ' · ' + data.desc : ''}`, tags: ['mission'], auteur: 'Système' });
  }
  saveDB();
  closeModal('modal-mission');
  renderMissions();
  toast('Mission sauvegardée.');
}

function deleteMission(id) {
  if (!confirm('Supprimer cette mission ?')) return;
  const m = DB.missions.find(x => x.id === id);
  if (m) DB.journal.push({ id: uid(), ts: Date.now(), titre: `Mission supprimée : ${m.titre}`, contenu: `La mission "${m.titre}" (${m.phase}) a été supprimée.`, tags: ['mission'], auteur: 'Système' });
  DB.missions = DB.missions.filter(m => m.id !== id);
  saveDB();
  renderMissions();
  toast('Mission supprimée.');
}

/* ── JOURNAL ─────────────────────────────────────── */
function renderJournal() {
  const el = document.getElementById('journal-list');
  if (!el) return;
  const filter = document.getElementById('journal-filter')?.value || 'all';
  let entries = [...DB.journal].sort((a,b) => b.ts - a.ts);
  if (filter !== 'all') entries = entries.filter(e => e.tags?.includes(filter));
  document.getElementById('journal-count').textContent = entries.length + ' entrée' + (entries.length > 1 ? 's' : '');
  el.innerHTML = !entries.length
    ? `<div class="empty"><div class="empty-icon">📓</div><div class="empty-text">Aucune entrée dans le journal</div></div>`
    : entries.map(e => `
      <div class="journal-entry">
        <div class="journal-entry-head">
          <span class="journal-entry-title">${e.titre}</span>
          <div style="display:flex;align-items:center;gap:0.75rem;">
            <span class="journal-entry-date">${fmtDate(e.ts)}</span>
            <button class="btn-danger patron-only" style="padding:0.2rem 0.5rem;font-size:10px;" onclick="deleteJournal('${e.id}')">✕</button>
          </div>
        </div>
        <div class="journal-entry-body">${e.contenu}</div>
        ${e.auteur ? `<div style="font-size:11px;color:var(--c-faint);margin-top:0.4rem;">Par : ${e.auteur}</div>` : ''}
        ${e.tags?.length ? `<div class="journal-entry-tags">${e.tags.map(t=>`<span class="tag tag-gray">${t}</span>`).join('')}</div>` : ''}
      </div>`).join('');
}

function newJournal() {
  ['j-titre','j-contenu','j-auteur','j-tags'].forEach(id => document.getElementById(id).value = '');
  openModal('modal-journal');
}

function saveJournal() {
  const titre   = document.getElementById('j-titre').value.trim();
  const contenu = document.getElementById('j-contenu').value.trim();
  if (!titre || !contenu) { toast('Titre et contenu requis.'); return; }
  const tagsRaw = document.getElementById('j-tags').value.trim();
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
  DB.journal.push({
    id: uid(), ts: Date.now(), titre, contenu,
    auteur: document.getElementById('j-auteur').value.trim() || 'Inconnu',
    tags
  });
  saveDB();
  closeModal('modal-journal');
  renderJournal();
  toast('Entrée ajoutée au journal.');
}

function deleteJournal(id) {
  if (!confirm('Supprimer cette entrée ?')) return;
  DB.journal = DB.journal.filter(e => e.id !== id);
  saveDB();
  renderJournal();
  toast('Entrée supprimée.');
}

function deleteTransaction(id) {
  if (!confirm('Supprimer cette transaction ?')) return;
  const t = DB.finances.transactions.find(x => x.id === id);
  if (t) {
    if (t.type === 'entree') DB.finances.caisse -= t.montant;
    else                     DB.finances.caisse += t.montant;
  }
  DB.finances.transactions = DB.finances.transactions.filter(x => x.id !== id);
  saveDB();
  renderFinances();
  toast('Transaction supprimée.');
}

window.renderDashboard = renderDashboard;
window.renderMembres   = renderMembres;
window.renderFinances  = renderFinances;
window.renderMissions  = renderMissions;
window.renderJournal   = renderJournal;

/* ═══════════════════════════════════════════════════
   PROPRIÉTÉS IMMOBILIÈRES
═══════════════════════════════════════════════════ */

function statutPropTag(s) {
  if (s === 'loué')     return 'green';
  if (s === 'en vente') return 'gold';
  return 'gray';
}

function renderVentes() {
  const tbody = document.getElementById('vente-tbody');
  if (!tbody) return;

  const ventes = DB.ventes || [];
  const ca     = ventes.reduce((s, v) => s + (v.montant || 0), 0);
  const moy    = ventes.length ? Math.round(ca / ventes.length) : 0;

  // Top vendeur ce mois
  const now    = new Date();
  const moisCo = ventes.filter(v => { const d = new Date(v.ts); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const scoreVend = {};
  moisCo.forEach(v => { const k = v.vendeur || '—'; scoreVend[k] = (scoreVend[k] || 0) + (v.montant || 0); });
  const topVend = Object.entries(scoreVend).sort((a, b) => b[1] - a[1])[0];

  document.getElementById('vente-stat-nb').textContent  = ventes.length;
  document.getElementById('vente-stat-ca').textContent  = fmtMoney(ca);
  document.getElementById('vente-stat-moy').textContent = ventes.length ? fmtMoney(moy) : '—';
  document.getElementById('vente-stat-top').textContent = topVend ? topVend[0] : '—';

  tbody.innerHTML = !ventes.length
    ? `<tr><td colspan="8"><div class="empty"><div class="empty-icon">🏠</div><div class="empty-text">Aucune vente enregistrée</div></div></td></tr>`
    : [...ventes].sort((a, b) => b.ts - a.ts).map(v => `
      <tr>
        <td style="font-size:12px;color:var(--c-muted);">${fmtDateShort(v.ts)}</td>
        <td style="font-weight:500;">${v.bien || '—'}</td>
        <td><span class="tag tag-gray">${v.type || '—'}</span></td>
        <td style="font-family:var(--f-display);font-size:18px;color:var(--c-gold);">${fmtMoney(v.montant || 0)}</td>
        <td style="font-weight:500;">${v.vendeur || '—'}</td>
        <td style="color:var(--c-muted);">${v.acheteur || '—'}</td>
        <td style="color:var(--c-muted);font-size:12px;">${v.note || '—'}</td>
        <td>
          <button class="btn-danger patron-only" onclick="deleteVente('${v.id}')">✕</button>
        </td>
      </tr>`).join('');
}

function newVente() {
  ['vt-id','vt-bien','vt-montant','vt-acheteur','vt-note'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('vt-type').value = 'Appartement';
  // Populate vendeur select from membres
  const sel = document.getElementById('vt-vendeur');
  sel.innerHTML = (DB.membres || []).map(m => `<option value="${m.pseudo || m.nom}">${m.pseudo || m.nom} (${m.role})</option>`).join('');
  document.getElementById('modal-vente-title').innerHTML = 'Nouvelle <em>vente</em>';
  openModal('modal-vente');
}

window.saveVente = function() {
  const bien    = document.getElementById('vt-bien').value.trim();
  if (!bien) { toast('Le nom du bien est requis.'); return; }
  const montant = parseFloat(document.getElementById('vt-montant').value) || 0;
  const vendeur = document.getElementById('vt-vendeur').value;
  const data = {
    id:       uid(),
    ts:       Date.now(),
    bien,
    type:     document.getElementById('vt-type').value,
    montant,
    vendeur,
    acheteur: document.getElementById('vt-acheteur').value.trim(),
    note:     document.getElementById('vt-note').value.trim(),
  };
  if (!DB.ventes) DB.ventes = [];
  DB.ventes.push(data);

  // Ajoute automatiquement une transaction en caisse
  if (!DB.finances.transactions) DB.finances.transactions = [];
  DB.finances.transactions.push({ id: uid(), ts: Date.now(), label: `Vente : ${bien}`, montant, type: 'entree', note: `Vendeur : ${vendeur}` });
  DB.finances.caisse += montant;

  DB.journal.push({ id: uid(), ts: Date.now(), titre: `Vente : ${bien}`, contenu: `${vendeur} a vendu "${bien}" pour ${fmtMoney(montant)}.`, tags: ['vente'], auteur: 'Système' });
  saveDB();
  closeModal('modal-vente');
  renderVentes();
  if (typeof renderFinances === 'function') renderFinances();
  toast('Vente enregistrée.');
};

window.deleteVente = function(id) {
  if (!confirm('Supprimer cette vente ?')) return;
  const v = (DB.ventes || []).find(x => x.id === id);
  if (v) DB.journal.push({ id: uid(), ts: Date.now(), titre: `Vente supprimée : ${v.bien}`, contenu: `Vente de "${v.bien}" retirée.`, tags: ['vente'], auteur: 'Système' });
  DB.ventes = (DB.ventes || []).filter(x => x.id !== id);
  saveDB();
  renderVentes();
  toast('Vente supprimée.');
};

window.renderVentes = renderVentes;
window.newVente     = newVente;

/* ═══════════════════════════════════════════════════
   VOTES & DÉCISIONS
═══════════════════════════════════════════════════ */

function renderVotes() {
  const el = document.getElementById('votes-list');
  if (!el) return;
  const votes   = DB.votes || [];
  const ouverts = votes.filter(v => v.statut === 'ouvert').length;
  document.getElementById('votes-count').textContent =
    ouverts ? `${ouverts} vote${ouverts > 1 ? 's' : ''} ouvert${ouverts > 1 ? 's' : ''}` : 'Aucun vote ouvert';

  el.innerHTML = !votes.length
    ? `<div class="empty"><div class="empty-icon">🗳</div><div class="empty-text">Aucun vote enregistré</div></div>`
    : [...votes].sort((a, b) => b.ts - a.ts).map(v => {
        const bulletins = v.bulletins || [];
        const pour      = bulletins.filter(b => b.choix === 'pour').length;
        const contre    = bulletins.filter(b => b.choix === 'contre').length;
        const abst      = bulletins.filter(b => b.choix === 'abstention').length;
        const isOpen    = v.statut === 'ouvert';
        const pct       = bulletins.length ? Math.round((pour / bulletins.length) * 100) : 0;
        return `
        <div class="journal-entry" style="border-left:3px solid ${isOpen ? 'var(--c-green)' : 'var(--c-faint)'};margin-bottom:1rem;">
          <div class="journal-entry-head">
            <div>
              <span class="journal-entry-title">${v.titre}</span>
              <div style="display:flex;gap:0.5rem;align-items:center;margin-top:5px;">
                <span class="tag tag-${isOpen ? 'green' : 'gray'}">${isOpen ? 'Ouvert' : 'Clôturé'}</span>
                <span class="tag tag-gray">${v.type}</span>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
              <span style="font-size:11px;color:var(--c-muted);">${fmtDateShort(v.ts)}</span>
              ${isOpen ? `<button class="btn-primary" style="padding:0.3rem 0.65rem;font-size:11px;" onclick="ouvrirModalVoter('${v.id}')">Voter</button>` : ''}
              ${isOpen ? `<button class="btn-secondary patron-only" style="padding:0.3rem 0.65rem;font-size:11px;" onclick="cloturerVote('${v.id}')">Clôturer</button>` : ''}
              <button class="btn-danger patron-only" onclick="deleteVote('${v.id}')">✕</button>
            </div>
          </div>
          ${v.description ? `<div class="journal-entry-body" style="margin-top:0.75rem;">${v.description}</div>` : ''}
          <div style="display:flex;gap:2rem;margin-top:1rem;align-items:center;flex-wrap:wrap;">
            <div style="display:flex;align-items:baseline;gap:0.4rem;">
              <span style="font-family:var(--f-display);font-size:24px;color:var(--c-green);">${pour}</span>
              <span style="font-size:11px;color:var(--c-muted);">Pour</span>
            </div>
            <div style="display:flex;align-items:baseline;gap:0.4rem;">
              <span style="font-family:var(--f-display);font-size:24px;color:var(--c-red);">${contre}</span>
              <span style="font-size:11px;color:var(--c-muted);">Contre</span>
            </div>
            <div style="display:flex;align-items:baseline;gap:0.4rem;">
              <span style="font-family:var(--f-display);font-size:24px;color:var(--c-faint);">${abst}</span>
              <span style="font-size:11px;color:var(--c-muted);">Abstention</span>
            </div>
            ${bulletins.length ? `
            <div style="flex:1;min-width:120px;">
              <div style="height:4px;background:var(--c-border-m);border-radius:2px;overflow:hidden;margin-bottom:4px;">
                <div style="height:100%;width:${pct}%;background:var(--c-green);border-radius:2px;transition:width 0.4s;"></div>
              </div>
              <div style="font-size:10px;color:var(--c-faint);">${bulletins.map(b => `${b.membre} (${b.choix})`).join(' · ')}</div>
            </div>` : ''}
          </div>
          ${!isOpen && v.resultat ? `<div style="margin-top:0.75rem;padding:0.6rem 1rem;background:var(--c-surface);border-radius:var(--r-md);font-size:12px;color:var(--c-gold);">Résultat : ${v.resultat}</div>` : ''}
        </div>`;
      }).join('');
}

function newVote() {
  ['vo-id','vo-titre','vo-description'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('vo-type').value = 'décision';
  openModal('modal-vote');
}

function saveVote() {
  const titre = document.getElementById('vo-titre').value.trim();
  if (!titre) { toast('Le titre est requis.'); return; }
  if (!DB.votes) DB.votes = [];
  const vote = {
    id: uid(), ts: Date.now(), titre,
    description: document.getElementById('vo-description').value.trim(),
    type:        document.getElementById('vo-type').value,
    statut:      'ouvert',
    bulletins:   [],
  };
  DB.votes.push(vote);
  DB.journal.push({ id: uid(), ts: Date.now(), titre: `Vote ouvert : ${titre}`, contenu: `Type : ${vote.type}${vote.description ? ' · ' + vote.description : ''}`, tags: ['vote'], auteur: 'Système' });
  saveDB();
  closeModal('modal-vote');
  renderVotes();
  toast('Vote créé.');
}

function ouvrirModalVoter(id) {
  document.getElementById('voter-id').value   = id;
  document.getElementById('voter-choix').value = 'pour';
  const sel = document.getElementById('voter-membre');
  sel.innerHTML = DB.membres.map(m => `<option value="${m.nom}">${m.nom}</option>`).join('');
  openModal('modal-voter');
}

function soumettreBulletin() {
  const id     = document.getElementById('voter-id').value;
  const membre = document.getElementById('voter-membre').value;
  const choix  = document.getElementById('voter-choix').value;
  if (!DB.votes) DB.votes = [];
  const vote = DB.votes.find(v => v.id === id);
  if (!vote) return;
  if (!vote.bulletins) vote.bulletins = [];
  if (vote.bulletins.some(b => b.membre === membre)) {
    toast('Ce membre a déjà voté.'); return;
  }
  vote.bulletins.push({ membre, choix });
  saveDB();
  closeModal('modal-voter');
  renderVotes();
  toast(`Vote de ${membre} enregistré.`);
}

function cloturerVote(id) {
  const vote = (DB.votes || []).find(v => v.id === id);
  if (!vote) return;
  const bulletins = vote.bulletins || [];
  const pour      = bulletins.filter(b => b.choix === 'pour').length;
  const contre    = bulletins.filter(b => b.choix === 'contre').length;
  let resultat;
  if (!bulletins.length)  resultat = 'Aucun vote exprimé';
  else if (pour > contre) resultat = `✅ Approuvé (${pour} pour, ${contre} contre)`;
  else if (contre > pour) resultat = `❌ Rejeté (${contre} contre, ${pour} pour)`;
  else                    resultat = `⚖ Égalité — décision au Patron (${pour} pour, ${contre} contre)`;
  vote.statut   = 'clôturé';
  vote.resultat = resultat;
  DB.journal.push({ id: uid(), ts: Date.now(), titre: `Vote clôturé : ${vote.titre}`, contenu: resultat, tags: ['vote'], auteur: 'Système' });
  saveDB();
  renderVotes();
  toast('Vote clôturé.');
}

function deleteVote(id) {
  if (!confirm('Supprimer ce vote ?')) return;
  DB.votes = (DB.votes || []).filter(v => v.id !== id);
  saveDB();
  renderVotes();
  toast('Vote supprimé.');
}

window.renderVotes = renderVotes;
/* ══════════════════════════════════════════════════
   FICHE MEMBRE
══════════════════════════════════════════════════ */
function openFicheMembre(id) {
  const m = DB.membres.find(x => x.id === id);
  if (!m) return;

  /* ── Stats ───────────────────────────────────── */
  const tempsSemaine = fmtDuree(getTempsActifSemaine(m));
  const sessions     = m.sessions || [];
  const totalTemps   = fmtDuree(sessions.reduce((acc, s) => acc + (s.fin - s.debut), 0));
  const nbSessions   = sessions.length;

  const missionsLiees = DB.missions.filter(mis => {
    const a = (mis.assignee || '').toLowerCase();
    return a.includes(m.pseudo.toLowerCase()) || a.includes(m.nom.toLowerCase());
  });
  const missionsDone  = missionsLiees.filter(mis => mis.done).length;

  /* ── Ventes ──────────────────────────────────── */
  const ventesLiees = (DB.ventes || []).filter(v =>
    (v.vendeur || '').toLowerCase() === m.pseudo.toLowerCase() ||
    (v.vendeur || '').toLowerCase() === m.nom.toLowerCase()
  ).sort((a, b) => b.ts - a.ts);
  const caVentes = ventesLiees.reduce((s, v) => s + (v.montant || 0), 0);

  /* ── Journal ─────────────────────────────────── */
  const journalLie = DB.journal.filter(e => {
    const txt = (e.titre + ' ' + e.contenu).toLowerCase();
    return txt.includes(m.pseudo.toLowerCase()) || txt.includes(m.nom.toLowerCase());
  }).sort((a,b) => b.ts - a.ts).slice(0, 6);

  /* ── Missions list ───────────────────────────── */
  const missionsHTML = missionsLiees.length
    ? missionsLiees.map(mis => `
        <div class="fiche-row">
          <div class="fiche-row-icon">${mis.done ? '✅' : '🎯'}</div>
          <div class="fiche-row-main">
            <div class="fiche-row-title">${mis.titre}</div>
            <div class="fiche-row-sub">${mis.phase || ''}${mis.done ? ' · Terminée' : ' · En cours'}</div>
          </div>
        </div>`).join('')
    : `<div class="fiche-empty">Aucune mission assignée</div>`;

  /* ── Journal list ────────────────────────────── */
  const journalHTML = journalLie.length
    ? journalLie.map(e => `
        <div class="fiche-row">
          <div class="fiche-row-icon">📋</div>
          <div class="fiche-row-main">
            <div class="fiche-row-title">${e.titre}</div>
            <div class="fiche-row-sub">${fmtDateShort(e.ts)} · ${e.auteur || 'Système'}</div>
          </div>
        </div>`).join('')
    : `<div class="fiche-empty">Aucune entrée de journal</div>`;

  /* ── Dernières sessions ──────────────────────── */
  const lastSessions = [...sessions].sort((a,b) => b.debut - a.debut).slice(0, 5);
  const sessionsHTML = lastSessions.length
    ? lastSessions.map(s => {
        const duree = fmtDuree(s.fin - s.debut);
        const date  = fmtDateShort(s.debut);
        return `
          <div class="fiche-row">
            <div class="fiche-row-icon">🕹</div>
            <div class="fiche-row-main">
              <div class="fiche-row-title">Session du ${date}</div>
              <div class="fiche-row-sub">Durée : ${duree}</div>
            </div>
          </div>`;
      }).join('')
    : `<div class="fiche-empty">Aucune session enregistrée</div>`;

  /* ── Statut dot color ────────────────────────── */
  const dotColor = m.statut === 'actif' ? 'var(--c-green)'
                 : m.statut === 'absent' ? 'var(--c-red)'
                 : 'var(--c-faint)';

  /* ── Render ──────────────────────────────────── */
  document.getElementById('fiche-panel').innerHTML = `
    <div class="fiche-head">
      <div class="fiche-avatar-lg">
        ${m.initiales}
        <span class="fiche-status-dot" style="background:${dotColor};"></span>
      </div>
      <div>
        <div class="fiche-nom">${m.nom}</div>
        <div class="fiche-pseudo">${m.pseudo}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <span class="tag tag-gold">${m.role}</span>
          <span class="tag" style="font-size:10px;">${m.parts}</span>
        </div>
      </div>
      <button class="fiche-close" onclick="closeFiche()">✕</button>
    </div>

    <div class="fiche-body">

      <div class="fiche-stats">
        <div class="fiche-stat">
          <div class="fiche-stat-val">${tempsSemaine}</div>
          <div class="fiche-stat-label">Temps<br>cette semaine</div>
        </div>
        <div class="fiche-stat">
          <div class="fiche-stat-val">${totalTemps}</div>
          <div class="fiche-stat-label">Temps<br>total</div>
        </div>
        <div class="fiche-stat">
          <div class="fiche-stat-val">${missionsLiees.length}</div>
          <div class="fiche-stat-label">Missions<br>assignées</div>
        </div>
        <div class="fiche-stat">
          <div class="fiche-stat-val">${missionsDone}</div>
          <div class="fiche-stat-label">Missions<br>terminées</div>
        </div>
      </div>

      ${m.note ? `
      <div class="fiche-section">
        <div class="fiche-section-title">Note</div>
        <div style="font-size:13px;color:var(--c-muted);line-height:1.7;padding:0.85rem 1rem;background:var(--c-card);border:1px solid var(--c-border);border-radius:var(--r-md);">
          ${m.note}
        </div>
      </div>` : ''}

      <div class="fiche-section">
        <div class="fiche-section-title">Missions</div>
        ${missionsHTML}
      </div>

      <div class="fiche-section">
        <div class="fiche-section-title">Ventes (${ventesLiees.length}${ventesLiees.length ? ' · CA : ' + fmtMoney(caVentes) : ''})</div>
        ${ventesLiees.length ? ventesLiees.slice(0,5).map(v => `
          <div class="fiche-row">
            <div class="fiche-row-icon">🏠</div>
            <div class="fiche-row-main">
              <div class="fiche-row-title">${v.bien} — ${fmtMoney(v.montant)}</div>
              <div class="fiche-row-sub">${fmtDateShort(v.ts)} · ${v.acheteur || 'Acheteur inconnu'}</div>
            </div>
          </div>`).join('') : '<div class="fiche-empty">Aucune vente enregistrée</div>'}
      </div>

      <div class="fiche-section">
        <div class="fiche-section-title">Journal</div>
        ${journalHTML}
      </div>

      <div class="fiche-section">
        <div class="fiche-section-title">Historique sessions</div>
        ${sessionsHTML}
      </div>

    </div>`;

  document.getElementById('fiche-overlay').classList.add('open');
}

function closeFiche(e) {
  if (!e || e.target === document.getElementById('fiche-overlay')) {
    document.getElementById('fiche-overlay').classList.remove('open');
  }
}

window.openFicheMembre = openFicheMembre;
window.closeFiche      = closeFiche;
