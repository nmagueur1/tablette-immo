/* ═══════════════════════════════════════════════════
   pages.js — all page renderers
═══════════════════════════════════════════════════ */

/* ── COMMISSION RATES ──────────────────────────────
   Taux de commission par rôle (appliqué au bénéfice net).
   Patron : 25 % · Expérimenté : 17,5 % · Agent : 10 %
──────────────────────────────────────────────────── */
function rateForRole(role) {
  const r = (role || '').toLowerCase().trim();
  if (r === 'patron')        return 0.25;
  if (r === 'expérimenté' || r === 'experimente' || r === 'experimenté' || r === 'expérimente') return 0.175;
  return 0.10; // Agent par défaut
}
window.rateForRole = rateForRole;

function renderDashboard() {
  const actifs = DB.membres.filter(m => m.statut === 'actif').length;
  const caisse = DB.finances.caisse;
  const obj    = DB.finances.objectif;
  const pct    = obj > 0 ? Math.min(100, Math.round((caisse / obj) * 100)) : 0;
  const missionsActives = DB.missions.filter(m => !m.done).length;

  // Note globale calculée depuis les avis
  const avisArr    = DB.avis || [];
  const noteGlobale = avisArr.length
    ? (avisArr.reduce((s, a) => s + a.note, 0) / avisArr.length).toFixed(1)
    : '—';

  document.getElementById('dash-membres').textContent   = actifs;
  document.getElementById('dash-caisse').textContent    = fmtMoney(caisse);
  document.getElementById('dash-missions').textContent  = missionsActives;
  document.getElementById('dash-note-globale').textContent = noteGlobale;

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
  // Priorité à debutSemaine (défini au dernier reset), sinon lundi de la semaine courante
  const weekStart = m.debutSemaine || getWeekStart();
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
  if (window.currentPage === 'dashboard') renderDashboard();
}

function resetSemaine() {
  if (!confirm('Remettre tous les compteurs à zéro pour la nouvelle semaine ?')) return;
  const now = Date.now();
  DB.membres.forEach(m => {
    if (!m.sessions) m.sessions = [];
    // Clôture la session en cours si active
    if (m.statut === 'actif' && m.sessionDebut) {
      m.sessions.push({ debut: m.sessionDebut, fin: now });
      m.sessionDebut = null;
      m.statut = 'inactif';
    }
    // Marque le début de la nouvelle semaine (les sessions avant cette date sont "anciennes")
    m.debutSemaine = now;
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
  document.getElementById('m-role').value      = 'Agent';
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

  // Somme des bénéfices de toutes les prestations enregistrées
  const prestations = (transactions || []).filter(t => t.type === 'prestation');

  const nbEl = document.getElementById('fin-nb-prest');
  if (nbEl) nbEl.textContent = prestations.length;

  // Commission = uniquement pour le vendeur de chaque prestation
  const splitEl = document.getElementById('fin-split');
  if (splitEl) {
    splitEl.innerHTML = DB.membres.map(m => {
      const rate    = rateForRole(m.role);
      const rateLbl = `${(rate*100).toString().replace('.',',')} % · ${m.role || 'Agent'}`;
      const memberKey = m.pseudo || m.nom;
      // Ne cumule que les prestations où CE membre est le vendeur
      const mesPrestas = prestations.filter(t => (t.vendeur || '') === memberKey);
      const cumul = mesPrestas.reduce((s, t) => s + (parseFloat(t.benefice) || 0) * rate, 0);
      const nb = mesPrestas.length;
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem 1.25rem;border-bottom:1px solid var(--c-border);background:var(--c-card);">
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <div class="avatar">${m.initiales}</div>
          <div>
            <div style="font-size:13px;font-weight:500;">${m.nom}</div>
            <div style="font-size:11px;color:var(--c-muted);">${rateLbl} · ${nb} presta${nb>1?'s':''}</div>
          </div>
        </div>
        <div style="font-family:var(--f-display);font-size:20px;color:var(--c-gold);">${cumul > 0 ? fmtMoney(cumul) : '—'}</div>
      </div>`;
    }).join('');
  }

  const txEl = document.getElementById('fin-transactions');
  if (txEl) {
    const sorted = [...transactions].sort((a,b) => b.ts - a.ts).slice(0,20);
    txEl.innerHTML = !sorted.length
      ? `<tr><td colspan="5"><div class="empty"><div class="empty-icon">💸</div><div class="empty-text">Aucune transaction</div></div></td></tr>`
      : sorted.map(t => {
          if (t.type === 'prestation') {
            return `
              <tr>
                <td style="color:var(--c-muted);font-size:12px;">${fmtDate(t.ts)}</td>
                <td>
                  ${t.label}
                  <div style="font-size:10px;color:var(--c-muted);margin-top:2px;">
                    Bien ${fmtMoney(t.prixBien||0)} · Revente ${fmtMoney(t.prixRevente||0)} · Bénéfice ${fmtMoney(t.benefice||0)}
                  </div>
                </td>
                <td><span class="tag" style="background:var(--c-gold);color:#000;">Prestation</span></td>
                <td style="font-family:var(--f-display);font-size:18px;color:var(--c-green);">
                  +${fmtMoney(t.benefice||0)}
                </td>
                <td><button class="btn-danger patron-only" onclick="deleteTransaction('${t.id}')">✕</button></td>
              </tr>`;
          }
          return `
            <tr>
              <td style="color:var(--c-muted);font-size:12px;">${fmtDate(t.ts)}</td>
              <td>${t.label}</td>
              <td><span class="tag tag-${t.type==='entree'?'green':'red'}">${t.type==='entree'?'Entrée':'Sortie'}</span></td>
              <td style="font-family:var(--f-display);font-size:18px;color:${t.type==='entree'?'var(--c-green)':'var(--c-red)'};">
                ${t.type==='entree'?'+':'−'}${fmtMoney(Math.abs(t.montant))}
              </td>
              <td><button class="btn-danger patron-only" onclick="deleteTransaction('${t.id}')">✕</button></td>
            </tr>`;
        }).join('');
  }
}

/* ── TRANSACTION MODAL helpers ───────────────────── */
window.openTransactionModal = function() {
  // Populate vendeur select from membres
  const sel = document.getElementById('tx-vendeur');
  if (sel) {
    sel.innerHTML = (DB.membres || []).map(m => `<option value="${m.pseudo || m.nom}">${m.nom} (${m.role})</option>`).join('');
  }
  // Reset preview
  ['tx-avance','tx-benef','tx-commi'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '0 $'; });
  openModal('modal-transaction');
  toggleTxType();
};

window.toggleTxType = function() {
  const type = document.getElementById('tx-type').value;
  document.getElementById('tx-prestation-fields').style.display = (type === 'prestation') ? '' : 'none';
  document.getElementById('tx-libre-fields').style.display       = (type === 'prestation') ? 'none' : '';
};

window.recalcPrestation = function() {
  const prixRevente = parseFloat(document.getElementById('tx-prix-revente').value) || 0;
  // Prix d'achat calculé automatiquement : 50 % du prix de vente
  const prixBien = prixRevente * 0.5;
  const avance   = prixBien; // l'avance = le prix d'achat (50 % du prix de vente)
  const benefice = Math.max(0, prixRevente - avance);

  const vendeurKey = document.getElementById('tx-vendeur').value;
  const vendeurM   = DB.membres.find(m => (m.pseudo || m.nom) === vendeurKey);
  const rate       = rateForRole(vendeurM?.role);
  const commi      = benefice * rate;

  document.getElementById('tx-avance').textContent = fmtMoney(avance);
  document.getElementById('tx-benef').textContent  = fmtMoney(benefice);
  document.getElementById('tx-commi').textContent  = fmtMoney(commi);
  const lbl = document.getElementById('tx-commi-label');
  if (lbl) lbl.textContent = vendeurM
    ? `Commission ${(rate*100).toString().replace('.',',')} % · ${vendeurM.nom}`
    : 'Commission vendeur';
};

function addTransaction() {
  const label = document.getElementById('tx-label').value.trim();
  const type  = document.getElementById('tx-type').value;
  const note  = document.getElementById('tx-note').value.trim();
  if (!label) { toast('Ajoute un libellé.'); return; }

  if (type === 'prestation') {
    const prixRevente = parseFloat(document.getElementById('tx-prix-revente').value);
    const vendeur     = document.getElementById('tx-vendeur').value;
    if (isNaN(prixRevente) || prixRevente <= 0) {
      toast('Prix de vente requis.'); return;
    }
    if (!vendeur) { toast('Choisis un vendeur.'); return; }
    // Prix d'achat calculé automatiquement : 50 % du prix de vente
    const prixBien = prixRevente * 0.5;
    const avance   = prixBien;
    const benefice = Math.max(0, prixRevente - avance);

    const vendeurM = DB.membres.find(m => (m.pseudo || m.nom) === vendeur);
    const rate     = rateForRole(vendeurM?.role);
    const commi    = benefice * rate;

    DB.finances.transactions.push({
      id: uid(), label, type: 'prestation',
      prixBien, prixRevente, avance, benefice,
      montant: benefice, vendeur, note, ts: Date.now()
    });
    DB.finances.caisse += benefice;

    DB.journal.push({
      id: uid(), ts: Date.now(),
      titre: `Prestation : ${label}`,
      contenu: `Bien ${fmtMoney(prixBien)} · avance ${fmtMoney(avance)} · revente ${fmtMoney(prixRevente)} → bénéfice ${fmtMoney(benefice)}. Vendeur : ${vendeur} → commission ${fmtMoney(commi)} (${(rate*100).toString().replace('.',',')} % · ${vendeurM?.role || 'Agent'})${note ? ' — ' + note : ''}`,
      tags: ['finances','prestation'], auteur: 'Système'
    });
  } else {
    const montant = parseFloat(document.getElementById('tx-montant').value);
    if (isNaN(montant) || montant <= 0) { toast('Montant invalide.'); return; }
    DB.finances.transactions.push({ id: uid(), label, montant, type, note, ts: Date.now() });
    if (type === 'entree') DB.finances.caisse += montant;
    else                   DB.finances.caisse -= montant;
    DB.journal.push({
      id: uid(), ts: Date.now(),
      titre: `Transaction : ${label}`,
      contenu: `${type === 'entree' ? 'Entrée' : 'Sortie'} de ${fmtMoney(montant)}${note ? ' — ' + note : ''}`,
      tags: ['finances'], auteur: 'Système'
    });
  }

  saveDB();
  closeModal('modal-transaction');
  renderFinances();
  toast('Transaction enregistrée.');
  ['tx-label','tx-montant','tx-note','tx-prix-revente'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['tx-avance','tx-benef','tx-commi'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '0 $';
  });
  document.getElementById('tx-type').value = 'prestation';
  toggleTxType();
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
    if (t.type === 'prestation')  DB.finances.caisse -= (parseFloat(t.benefice) || 0);
    else if (t.type === 'entree') DB.finances.caisse -= t.montant;
    else                          DB.finances.caisse += t.montant;
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
  ['vt-avance','vt-benef','vt-commi'].forEach(id => { const el = document.getElementById(id); if(el) el.textContent = '0 $'; });
  document.getElementById('vt-type').value = 'Appartement';
  // Populate vendeur select from membres
  const sel = document.getElementById('vt-vendeur');
  sel.innerHTML = (DB.membres || []).map(m => `<option value="${m.pseudo || m.nom}">${m.pseudo || m.nom} (${m.role})</option>`).join('');
  document.getElementById('modal-vente-title').innerHTML = 'Nouvelle <em>vente</em>';
  openModal('modal-vente');
}

window.recalcVente = function() {
  const prixRevente = parseFloat(document.getElementById('vt-montant').value) || 0;
  // Prix d'achat calculé automatiquement : 50 % du prix de vente
  const prixAchat = prixRevente * 0.5;
  const avance    = prixAchat;
  const benefice  = Math.max(0, prixRevente - avance);

  const vendeurKey = document.getElementById('vt-vendeur').value;
  const vendeurM   = DB.membres.find(m => (m.pseudo || m.nom) === vendeurKey);
  const rate       = rateForRole(vendeurM?.role);
  const commi      = benefice * rate;

  document.getElementById('vt-avance').textContent = fmtMoney(prixAchat);
  document.getElementById('vt-benef').textContent  = fmtMoney(benefice);
  document.getElementById('vt-commi').textContent  = fmtMoney(commi);
};

window.saveVente = function() {
  const bien    = document.getElementById('vt-bien').value.trim();
  if (!bien) { toast('Le nom du bien est requis.'); return; }
  const prixRevente = parseFloat(document.getElementById('vt-montant').value);
  if (isNaN(prixRevente) || prixRevente <= 0) {
    toast("Prix de vente requis."); return;
  }
  // Prix d'achat calculé automatiquement : 50 % du prix de vente
  const prixAchat = prixRevente * 0.5;
  const avance    = prixAchat;
  const benefice  = Math.max(0, prixRevente - avance);
  const vendeur   = document.getElementById('vt-vendeur').value;

  const data = {
    id:       uid(),
    ts:       Date.now(),
    bien,
    type:     document.getElementById('vt-type').value,
    prixAchat,
    prixRevente,
    avance,
    benefice,
    montant:  benefice,
    vendeur,
    acheteur: document.getElementById('vt-acheteur').value.trim(),
    note:     document.getElementById('vt-note').value.trim(),
  };
  if (!DB.ventes) DB.ventes = [];
  DB.ventes.push(data);

  // Ajoute automatiquement une prestation dans les finances (commissions déclenchées)
  if (!DB.finances.transactions) DB.finances.transactions = [];
  DB.finances.transactions.push({
    id: uid(), ts: Date.now(),
    label: `Prestation : ${bien}`,
    type: 'prestation',
    prixBien: prixAchat,
    prixRevente,
    avance,
    benefice,
    montant: benefice,
    vendeur,
    note: `Vendeur : ${vendeur}`
  });
  DB.finances.caisse += benefice;

  const vendeurM = DB.membres.find(m => (m.pseudo || m.nom) === vendeur);
  const rate     = rateForRole(vendeurM?.role);
  const commi    = benefice * rate;
  const rateLabel = (rate * 100).toString().replace('.', ',') + ' %';
  const roleLabel = vendeurM?.role || 'Agent';
  DB.journal.push({
    id: uid(), ts: Date.now(),
    titre: `Prestation : ${bien}`,
    contenu: `${vendeur} a signé la prestation "${bien}". Prix de vente ${fmtMoney(prixRevente)} · prix d'achat auto ${fmtMoney(prixAchat)} → bénéfice ${fmtMoney(benefice)}. Commission vendeur : ${fmtMoney(commi)} (${rateLabel} · ${roleLabel}).`,
    tags: ['vente','prestation'], auteur: 'Système'
  });
  saveDB();
  closeModal('modal-vente');
  renderVentes();
  if (typeof renderFinances === 'function') renderFinances();
  toast(`Vente enregistrée · bénéfice ${fmtMoney(benefice)}`);
};

window.deleteVente = function(id) {
  if (!confirm('Supprimer cette vente ?')) return;
  const v = (DB.ventes || []).find(x => x.id === id);
  if (v) {
    // Retire la prestation correspondante des transactions et débite la caisse
    const benef = parseFloat(v.benefice) || 0;
    if (benef > 0) {
      DB.finances.caisse -= benef;
      DB.finances.transactions = (DB.finances.transactions || []).filter(t =>
        !(t.type === 'prestation' && t.label === `Prestation : ${v.bien}` && parseFloat(t.benefice) === benef)
      );
    }
    DB.journal.push({ id: uid(), ts: Date.now(), titre: `Vente supprimée : ${v.bien}`, contenu: `Vente de "${v.bien}" retirée (caisse débitée de ${fmtMoney(benef)}).`, tags: ['vente'], auteur: 'Système' });
  }
  DB.ventes = (DB.ventes || []).filter(x => x.id !== id);
  saveDB();
  renderVentes();
  if (typeof renderFinances === 'function') renderFinances();
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
        const bulletins    = v.bulletins || [];
        const propositions = v.propositions && v.propositions.length ? v.propositions : ['Pour', 'Contre', 'Abstention'];
        const isOpen       = v.statut === 'ouvert';
        const total        = bulletins.length;

        // Compte par proposition
        const scores = propositions.map(p => ({
          label: p,
          nb:    bulletins.filter(b => b.choix === p).length,
        }));
        const maxNb = Math.max(...scores.map(s => s.nb), 1);

        const barsHTML = scores.map(s => {
          const pct   = Math.round((s.nb / (total || 1)) * 100);
          const isMax = s.nb === maxNb && s.nb > 0;
          return `
          <div style="display:flex;align-items:center;gap:0.75rem;min-width:160px;">
            <div style="font-size:11px;color:var(--c-muted);width:80px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${s.label}">${s.label}</div>
            <div style="flex:1;height:6px;background:var(--c-border-m);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:${isMax ? 'var(--c-gold)' : 'var(--c-surface)'};border-radius:3px;transition:width 0.4s;"></div>
            </div>
            <span style="font-family:var(--f-display);font-size:16px;color:${isMax ? 'var(--c-gold)' : 'var(--c-faint)'};">${s.nb}</span>
          </div>`;
        }).join('');

        return `
        <div class="journal-entry" style="border-left:3px solid ${isOpen ? 'var(--c-green)' : 'var(--c-faint)'};margin-bottom:1rem;">
          <div class="journal-entry-head">
            <div>
              <span class="journal-entry-title">${v.titre}</span>
              <div style="display:flex;gap:0.5rem;align-items:center;margin-top:5px;">
                <span class="tag tag-${isOpen ? 'green' : 'gray'}">${isOpen ? 'Ouvert' : 'Clôturé'}</span>
                <span class="tag tag-gray">${v.type}</span>
                <span style="font-size:10px;color:var(--c-faint);">${total} vote${total > 1 ? 's' : ''}</span>
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
          <div style="display:flex;flex-direction:column;gap:0.5rem;margin-top:1rem;">
            ${barsHTML}
          </div>
          ${total ? `<div style="font-size:10px;color:var(--c-faint);margin-top:0.5rem;">${bulletins.map(b => `${b.membre} → ${b.choix}`).join(' · ')}</div>` : ''}
          ${!isOpen && v.resultat ? `<div style="margin-top:0.75rem;padding:0.6rem 1rem;background:var(--c-surface);border-radius:var(--r-md);font-size:12px;color:var(--c-gold);">Résultat : ${v.resultat}</div>` : ''}
        </div>`;
      }).join('');
}

window.addProposition = function() {
  const container = document.getElementById('vo-propositions');
  const idx = container.children.length;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:0.5rem;align-items:center;';
  row.innerHTML = `
    <input class="form-input" placeholder="Option ${idx + 1}…" style="flex:1;" />
    <button type="button" onclick="this.parentElement.remove()" style="flex-shrink:0;background:none;border:none;color:var(--c-red);font-size:16px;cursor:pointer;padding:0 0.25rem;">✕</button>`;
  container.appendChild(row);
  row.querySelector('input').focus();
};

function newVote() {
  ['vo-id','vo-titre','vo-description'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('vo-type').value = 'décision';
  // Propositions par défaut : Pour / Contre
  const container = document.getElementById('vo-propositions');
  container.innerHTML = '';
  ['Pour', 'Contre', 'Abstention'].forEach(label => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:0.5rem;align-items:center;';
    row.innerHTML = `
      <input class="form-input" value="${label}" style="flex:1;" />
      <button type="button" onclick="this.parentElement.remove()" style="flex-shrink:0;background:none;border:none;color:var(--c-red);font-size:16px;cursor:pointer;padding:0 0.25rem;">✕</button>`;
    container.appendChild(row);
  });
  openModal('modal-vote');
}

function saveVote() {
  const titre = document.getElementById('vo-titre').value.trim();
  if (!titre) { toast('Le titre est requis.'); return; }
  // Récupère les propositions
  const propositions = [...document.getElementById('vo-propositions').querySelectorAll('input')]
    .map(el => el.value.trim()).filter(Boolean);
  if (propositions.length < 2) { toast('Ajoute au moins 2 propositions.'); return; }
  if (!DB.votes) DB.votes = [];
  const vote = {
    id: uid(), ts: Date.now(), titre,
    description:  document.getElementById('vo-description').value.trim(),
    type:         document.getElementById('vo-type').value,
    propositions,
    statut:       'ouvert',
    bulletins:    [],
  };
  DB.votes.push(vote);
  DB.journal.push({ id: uid(), ts: Date.now(), titre: `Vote ouvert : ${titre}`, contenu: `Options : ${propositions.join(', ')}`, tags: ['vote'], auteur: 'Système' });
  saveDB();
  closeModal('modal-vote');
  renderVotes();
  toast('Vote créé.');
}

function ouvrirModalVoter(id) {
  const vote = (DB.votes || []).find(v => v.id === id);
  if (!vote) return;
  document.getElementById('voter-id').value = id;
  // Membres
  const selMembre = document.getElementById('voter-membre');
  selMembre.innerHTML = DB.membres.map(m => `<option value="${m.nom}">${m.nom}</option>`).join('');
  // Propositions dynamiques
  const propositions = vote.propositions && vote.propositions.length ? vote.propositions : ['Pour', 'Contre', 'Abstention'];
  const selChoix = document.getElementById('voter-choix');
  selChoix.innerHTML = propositions.map(p => `<option value="${p}">${p}</option>`).join('');
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
  const bulletins    = vote.bulletins || [];
  const propositions = vote.propositions && vote.propositions.length ? vote.propositions : ['Pour', 'Contre', 'Abstention'];
  let resultat;
  if (!bulletins.length) {
    resultat = 'Aucun vote exprimé';
  } else {
    // Compte par proposition
    const scores = propositions.map(p => ({ label: p, nb: bulletins.filter(b => b.choix === p).length }));
    scores.sort((a, b) => b.nb - a.nb);
    const [first, second] = scores;
    if (first.nb === (second?.nb ?? -1)) {
      resultat = `⚖ Égalité entre "${first.label}" et "${second.label}" — décision au Patron`;
    } else {
      resultat = `🏆 "${first.label}" remporte le vote (${first.nb} voix) · ${scores.slice(1).map(s => `${s.label} : ${s.nb}`).join(', ')}`;
    }
  }
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
          <div class="fiche-stat-val">${ventesLiees.length}</div>
          <div class="fiche-stat-label">Nombre<br>de ventes</div>
        </div>
        <div class="fiche-stat">
          <div class="fiche-stat-val" style="font-size:14px;">${ventesLiees.length ? fmtMoney(Math.round(caVentes / ventesLiees.length)) : '—'}</div>
          <div class="fiche-stat-label">Panier<br>moyen</div>
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

/* ═══════════════════════════════════════════════════
   CATALOGUE IMMOBILIER
═══════════════════════════════════════════════════ */

function statutBienTag(s) {
  if (s === 'disponible') return 'green';
  if (s === 'reserve')    return 'gold';
  if (s === 'vendu')      return 'gray';
  return 'gray';
}

function statutBienLabel(s) {
  if (s === 'disponible') return 'Disponible';
  if (s === 'reserve')    return 'Réservé';
  if (s === 'vendu')      return 'Vendu';
  return s || '—';
}

function renderCatalogue() {
  if (!DB.catalogue) DB.catalogue = [];
  const biens = DB.catalogue;

  // Stats
  const statsEl = document.getElementById('cat-stats');
  if (statsEl) {
    const nb   = biens.length;
    const dispo = biens.filter(b => b.statut === 'disponible').length;
    const reserve = biens.filter(b => b.statut === 'reserve').length;
    const vendu = biens.filter(b => b.statut === 'vendu').length;
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-label">Biens au catalogue</div><div class="stat-value">${nb}</div><div class="stat-sub">références</div></div>
      <div class="stat-card"><div class="stat-label">Disponibles</div><div class="stat-value" style="color:var(--c-green)">${dispo}</div><div class="stat-sub">à vendre</div></div>
      <div class="stat-card"><div class="stat-label">Réservés</div><div class="stat-value" style="color:var(--c-gold)">${reserve}</div><div class="stat-sub">en cours</div></div>
      <div class="stat-card"><div class="stat-label">Vendus</div><div class="stat-value" style="color:var(--c-muted)">${vendu}</div><div class="stat-sub">finalisés</div></div>
    `;
  }

  // Filtres
  const search     = (document.getElementById('cat-search')?.value || '').toLowerCase();
  const filterType = document.getElementById('cat-filter-type')?.value || '';
  const filterStat = document.getElementById('cat-filter-statut')?.value || '';

  let filtered = [...biens];
  if (search)     filtered = filtered.filter(b => (b.titre + b.adresse + b.ref + b.type).toLowerCase().includes(search));
  if (filterType) filtered = filtered.filter(b => b.type === filterType);
  if (filterStat) filtered = filtered.filter(b => b.statut === filterStat);
  filtered.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const grid = document.getElementById('cat-grid');
  if (!grid) return;

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;"><div class="empty-icon">🏢</div><div class="empty-text">${biens.length ? 'Aucun bien ne correspond aux filtres.' : 'Aucun bien dans le catalogue.'}</div></div>`;
    return;
  }

  grid.innerHTML = filtered.map(b => {
    const tag    = statutBienTag(b.statut);
    const label  = statutBienLabel(b.statut);
    const photos = getPhotos(b);
    const cover  = photos[0] || '';
    const photoBg = cover
      ? `background-image:url('${cover}');background-size:cover;background-position:center;`
      : `background:var(--c-surface);display:flex;align-items:center;justify-content:center;`;
    const photoContent = cover ? '' : `<span style="font-size:32px;opacity:0.3;">🏠</span>`;
    const multiBadge = photos.length > 1
      ? `<span style="position:absolute;top:0.5rem;left:0.5rem;background:rgba(0,0,0,0.6);color:#fff;font-size:10px;letter-spacing:0.08em;padding:2px 7px;border-radius:10px;">📷 ${photos.length}</span>`
      : '';

    return `
    <div class="cat-card" onclick="ouvrirDetailBien('${b.id}')" style="cursor:pointer;">
      <div class="cat-card-img" style="${photoBg}position:relative;">${photoContent}${multiBadge}</div>
      <div class="cat-card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem;">
          <span class="tag tag-${tag}">${label}</span>
          <span style="font-size:10px;color:var(--c-muted);letter-spacing:0.12em;">${b.ref || ''}</span>
        </div>
        <div class="cat-card-titre">${b.titre || '—'}</div>
        <div class="cat-card-adresse">📍 ${b.adresse || '—'}</div>
        <div style="display:flex;gap:1rem;margin:0.6rem 0;font-size:11px;color:var(--c-muted);">
          ${b.surface ? `<span>⬛ ${b.surface} m²</span>` : ''}
          ${b.pieces  ? `<span>🚪 ${b.pieces} pièces</span>` : ''}
          <span style="margin-left:auto;font-family:var(--f-display);font-size:13px;color:var(--c-gold);">${b.type || ''}</span>
        </div>
        <div class="cat-card-prix">${b.prix ? fmtMoney(b.prix) : '—'}</div>
        <div style="display:flex;gap:0.5rem;margin-top:0.75rem;" class="patron-only">
          <button class="btn-secondary" style="flex:1;font-size:11px;padding:0.35rem 0.5rem;" onclick="event.stopPropagation();editBien('${b.id}')">✏ Modifier</button>
          <button class="btn-danger" style="font-size:11px;padding:0.35rem 0.5rem;" onclick="event.stopPropagation();deleteBien('${b.id}')">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function ouvrirDetailBien(id) {
  const b = (DB.catalogue || []).find(x => x.id === id);
  if (!b) return;

  const tag    = statutBienTag(b.statut);
  const label  = statutBienLabel(b.statut);
  const photos = getPhotos(b);

  buildCarousel(photos);

  document.getElementById('bien-detail-ref').textContent = b.ref || '';
  document.getElementById('bien-detail-titre').textContent = b.titre || '—';
  document.getElementById('bien-detail-adresse').textContent = b.adresse ? '📍 ' + b.adresse : '';
  document.getElementById('bien-detail-prix').textContent = b.prix ? fmtMoney(b.prix) : '—';
  document.getElementById('bien-detail-description').textContent = b.description || '';

  const badge = document.getElementById('bien-detail-statut-badge');
  if (badge) {
    badge.textContent = label;
    const colors = { green: '#4a9068', gold: '#c9a96e', gray: '#555' };
    badge.style.background = colors[tag] || '#555';
    badge.style.color = '#fff';
  }

  const specs = document.getElementById('bien-detail-specs');
  if (specs) {
    specs.innerHTML = [
      b.type    ? `<span style="font-size:12px;color:var(--c-muted);">${b.type}</span>` : '',
      b.surface ? `<span style="font-size:12px;color:var(--c-muted);">⬛ ${b.surface} m²</span>` : '',
      b.pieces  ? `<span style="font-size:12px;color:var(--c-muted);">🚪 ${b.pieces} p.</span>` : '',
    ].filter(Boolean).join('<span style="color:var(--c-faint);margin:0 4px;">·</span>');
  }

  const isPatron = document.body.classList.contains('is-patron');
  const actions  = document.getElementById('bien-detail-actions');
  if (actions) {
    actions.innerHTML = isPatron
      ? `<button class="btn-secondary" onclick="closeModal('modal-bien-detail');editBien('${b.id}')">✏ Modifier</button>
         <button class="btn-danger" onclick="closeModal('modal-bien-detail');deleteBien('${b.id}')">✕ Supprimer</button>`
      : `<button class="btn-secondary" onclick="closeModal('modal-bien-detail')">Fermer</button>`;
  }

  openModal('modal-bien-detail');
}

/* ── HELPERS PHOTOS (carrousel) ─────────────────── */
function getPhotos(b) {
  if (!b) return [];
  if (Array.isArray(b.photos) && b.photos.length) return b.photos.filter(Boolean);
  if (b.photo) return [b.photo];
  return [];
}

let _carouselIndex = 0;
let _carouselPhotos = [];

function buildCarousel(photos) {
  _carouselPhotos = photos.slice();
  _carouselIndex  = 0;

  const track = document.getElementById('bien-detail-track');
  const dots  = document.getElementById('bien-detail-dots');
  const prev  = document.getElementById('bien-detail-prev');
  const next  = document.getElementById('bien-detail-next');
  if (!track) return;

  if (!photos.length) {
    track.innerHTML = `<div style="flex:0 0 100%;display:flex;align-items:center;justify-content:center;background:var(--c-surface);"><span style="font-size:48px;opacity:0.25;">🏠</span></div>`;
    track.style.transform = 'translateX(0)';
    if (dots) dots.innerHTML = '';
    if (prev) prev.style.display = 'none';
    if (next) next.style.display = 'none';
    return;
  }

  track.innerHTML = photos.map(url =>
    `<div style="flex:0 0 100%;height:100%;background-image:url('${url}');background-size:cover;background-position:center;background-color:var(--c-surface);"></div>`
  ).join('');
  track.style.transform = 'translateX(0)';

  if (dots) {
    dots.innerHTML = photos.length > 1
      ? photos.map((_, i) =>
          `<button onclick="carouselGoto(${i})" aria-label="Photo ${i+1}" style="width:7px;height:7px;border-radius:50%;border:none;padding:0;cursor:pointer;background:${i === 0 ? '#fff' : 'rgba(255,255,255,0.4)'};transition:background 0.2s;" data-dot="${i}"></button>`
        ).join('')
      : '';
  }
  if (prev) prev.style.display = photos.length > 1 ? 'flex' : 'none';
  if (next) next.style.display = photos.length > 1 ? 'flex' : 'none';
}

function carouselGoto(i) {
  if (!_carouselPhotos.length) return;
  _carouselIndex = (i + _carouselPhotos.length) % _carouselPhotos.length;
  const track = document.getElementById('bien-detail-track');
  if (track) track.style.transform = `translateX(-${_carouselIndex * 100}%)`;
  const dots = document.getElementById('bien-detail-dots');
  if (dots) dots.querySelectorAll('[data-dot]').forEach((d, idx) => {
    d.style.background = idx === _carouselIndex ? '#fff' : 'rgba(255,255,255,0.4)';
  });
}
function carouselNext() { carouselGoto(_carouselIndex + 1); }
function carouselPrev() { carouselGoto(_carouselIndex - 1); }
window.carouselGoto = carouselGoto;
window.carouselNext = carouselNext;
window.carouselPrev = carouselPrev;

// Navigation clavier quand le modal-detail est ouvert
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('modal-bien-detail');
  if (!modal || !modal.classList.contains('open')) return;
  if (e.key === 'ArrowRight') carouselNext();
  if (e.key === 'ArrowLeft')  carouselPrev();
});

function newBien() {
  document.getElementById('modal-bien-title').innerHTML = 'Nouveau <em>bien</em>';
  ['bien-id','bien-ref','bien-titre','bien-adresse','bien-prix','bien-surface','bien-pieces','bien-description','bien-photos'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('bien-type').value   = 'Appartement';
  document.getElementById('bien-statut').value = 'disponible';
  openModal('modal-bien');
}

function editBien(id) {
  const b = (DB.catalogue || []).find(x => x.id === id);
  if (!b) return;
  document.getElementById('modal-bien-title').innerHTML = 'Modifier le <em>bien</em>';
  document.getElementById('bien-id').value          = b.id;
  document.getElementById('bien-ref').value         = b.ref || '';
  document.getElementById('bien-titre').value       = b.titre || '';
  document.getElementById('bien-adresse').value     = b.adresse || '';
  document.getElementById('bien-prix').value        = b.prix || '';
  document.getElementById('bien-surface').value     = b.surface || '';
  document.getElementById('bien-pieces').value      = b.pieces || '';
  document.getElementById('bien-description').value = b.description || '';
  document.getElementById('bien-photos').value      = getPhotos(b).join('\n');
  document.getElementById('bien-type').value        = b.type || 'Appartement';
  document.getElementById('bien-statut').value      = b.statut || 'disponible';
  openModal('modal-bien');
}

function saveBien() {
  const titre = document.getElementById('bien-titre').value.trim();
  if (!titre) { toast('Le titre est requis.'); return; }
  if (!DB.catalogue) DB.catalogue = [];

  const id  = document.getElementById('bien-id').value.trim();
  const photosRaw = document.getElementById('bien-photos').value || '';
  const photos = photosRaw.split('\n').map(s => s.trim()).filter(Boolean);

  const data = {
    id:          id || uid(),
    ref:         document.getElementById('bien-ref').value.trim(),
    titre,
    type:        document.getElementById('bien-type').value,
    adresse:     document.getElementById('bien-adresse').value.trim(),
    prix:        parseFloat(document.getElementById('bien-prix').value) || 0,
    surface:     parseFloat(document.getElementById('bien-surface').value) || 0,
    pieces:      parseInt(document.getElementById('bien-pieces').value) || 0,
    description: document.getElementById('bien-description').value.trim(),
    photos,                     // nouveau — tableau
    photo:       photos[0] || '', // rétro-compat lecteurs legacy
    statut:      document.getElementById('bien-statut').value,
    ts:          id ? (DB.catalogue.find(b => b.id === id)?.ts || Date.now()) : Date.now(),
  };

  if (id) {
    const idx = DB.catalogue.findIndex(b => b.id === id);
    if (idx !== -1) DB.catalogue[idx] = data;
    toast('Bien mis à jour.');
  } else {
    DB.catalogue.push(data);
    DB.journal.push({ id: uid(), ts: Date.now(), titre: `Bien ajouté : ${titre}`, contenu: `Ref: ${data.ref || '—'} — ${data.type} — ${fmtMoney(data.prix)}`, tags: ['immobilier'], auteur: 'Système' });
    toast('Bien ajouté au catalogue.');
  }
  saveDB();
  closeModal('modal-bien');
  renderCatalogue();
}

function deleteBien(id) {
  if (!confirm('Retirer ce bien du catalogue ?')) return;
  const b = (DB.catalogue || []).find(x => x.id === id);
  if (b) DB.journal.push({ id: uid(), ts: Date.now(), titre: `Bien retiré : ${b.titre}`, contenu: `Référence ${b.ref || '—'} retirée du catalogue.`, tags: ['immobilier'], auteur: 'Système' });
  DB.catalogue = (DB.catalogue || []).filter(x => x.id !== id);
  saveDB();
  renderCatalogue();
  toast('Bien retiré du catalogue.');
}

window.renderCatalogue = renderCatalogue;
window.newBien         = newBien;
window.editBien        = editBien;
window.saveBien        = saveBien;
window.deleteBien      = deleteBien;
window.ouvrirDetailBien = ouvrirDetailBien;
