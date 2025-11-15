/* app.js
 Prototype "sans React" :
  - pan/zoom custom (transform)
  - p5 canvas background (traits / image troll)
  - marqueurs projets DOM
  - panneau détail + votes + commentaires (JSON backend)
*/

// ==== CONFIG PROTOTYPE ====
const WORLD_W = 2000, WORLD_H = 1400; // taille de la "toile"
const PADDING = 120; // marge interne pour ne pas coller aux bords
const MIN_SCALE = 0.25, MAX_SCALE = 2.5;

// Tableau projet chargé depuis le CSV
let projects = [];

// votes & commentaires chargés depuis JSON
let votesData = [];     // [{ projectId, pseudo, humour, participatif }]
let commentsData = [];  // [{ projectId, pseudo, commentaire, date }]

// état du viewport
let scale = 1, offsetX = 0, offsetY = 0;
let isDragging = false, dragStartX = 0, dragStartY = 0, startOffsetX = 0, startOffsetY = 0;

// éléments DOM
let mapContainer, mapInner, leftPanel, projectDetail, closePanelBtn;

// utilisateur local (pseudo)
let localUser = { id: null, name: null };

// localStorage uniquement pour stocker le pseudo généré
const LS_KEY_USER = 'proto_user';

const API_BASE = 'http://localhost:3000';
// const API_BASE = 'https://ton-backend.onrender.com';
const COMMENTS_URL = `${API_BASE}/api/comments`;
const VOTES_URL = `${API_BASE}/api/votes`;

document.addEventListener('DOMContentLoaded', async () => {
  mapContainer = document.getElementById('mapContainer');
  mapInner = document.getElementById('mapInner');
  leftPanel = document.getElementById('leftPanel');
  projectDetail = document.getElementById('projectDetail');
  closePanelBtn = document.getElementById('closePanel');

  initLocalUser();
  setupPanZoom();

  // 1) CSV
  await loadProjectsFromCSV();
  // 2) JSON votes + commentaires
  await loadVotesFromServer();
  await loadCommentsFromServer();
  // 3) Calcul des moyennes
  recomputeProjectStats();
  // 4) Création des marqueurs
  createMarkers();

  closePanelBtn.addEventListener('click', () => leftPanel.classList.add('hidden'));
});

/* ---------------------------
   Charger les projets depuis le CSV
----------------------------*/
async function loadProjectsFromCSV() {
  const response = await fetch('./public/projets-app-carte.csv');
  const csvText = await response.text();

  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  projects = lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = cols[i]);
    const baseHumour = parseFloat(obj['Humour']) || 0;
    const baseParticip = parseFloat(obj['Participativité']) || 0;

    return {
      id: obj['Id'],
      title: obj['Titre'],
      baseHumour,
      baseParticip,
      // valeurs de moyenne initialisées à la valeur de base
      avgHumour: baseHumour,
      avgParticip: baseParticip,
      auteur: obj['Auteur-trice(s)'] || '',
      url: obj['Url'] || '',
      file: obj['Fichier'] || '',
      desc: obj['Description'] || '',
      img: `./public/images/carte/projets/${obj['Fichier']}`
    };
  });
}

/* ---------------------------
   Charger votes & commentaires depuis JSON
----------------------------*/
async function loadVotesFromServer() {
  try {
    const res = await fetch(VOTES_URL);
    if (!res.ok) throw new Error('Erreur chargement votes');
    votesData = await res.json();
    if (!Array.isArray(votesData)) votesData = [];
  } catch (e) {
    console.error(e);
    votesData = [];
  }
}

async function loadCommentsFromServer() {
  try {
    const res = await fetch(COMMENTS_URL);
    if (!res.ok) throw new Error('Erreur chargement comments');
    commentsData = await res.json();
    if (!Array.isArray(commentsData)) commentsData = [];
  } catch (e) {
    console.error(e);
    commentsData = [];
  }
}

/* ---------------------------
   Recalcul des moyennes par projet
   moyenne = (valeurCSV + sommeVotes) / (1 + nbVotes)
----------------------------*/
function recomputeProjectStats() {
  for (const p of projects) {
    const votesForProject = votesData.filter(v => v.projectId === p.id);

    if (votesForProject.length === 0) {
      p.avgHumour = p.baseHumour;
      p.avgParticip = p.baseParticip;
      continue;
    }

    const sumHum = votesForProject.reduce((sum, v) => sum + (Number(v.humour) || 0), p.baseHumour);
    const sumPar = votesForProject.reduce((sum, v) => sum + (Number(v.participatif) || 0), p.baseParticip);
    const count = votesForProject.length + 1; // +1 pour la valeur provenant du CSV

    p.avgHumour = sumHum / count;
    p.avgParticip = sumPar / count;
  }
}

/* ---------------------------
   UTIL: conversion coord -> px
   humour: 0..10 (0 = pas drôle -> Bas)
   particip: 0..10 (0 = individuel -> Gauche)
----------------------------*/
function coordToPx(humour, particip) {
  const x = PADDING + (particip / 10) * (WORLD_W - 2 * PADDING);
  const y = PADDING + ((10 - humour) / 10) * (WORLD_H - 2 * PADDING);
  return { x, y };
}

/* ---------------------------
   Créer marqueurs DOM
----------------------------*/
function createMarkers() {
  const coordCount = {}; // clé = `${humour}_${particip}`, valeur = nb de projets déjà placés

  for (const p of projects) {
    const pos = coordToPx(p.avgHumour, p.avgParticip);

    const key = `${Math.round(p.avgHumour)}_${Math.round(p.avgParticip)}`;
    const stackIndex = coordCount[key] || 0;
    coordCount[key] = stackIndex + 1;

    const yOffset = stackIndex * 56;

    const wrap = document.createElement('div');
    wrap.className = 'marker-wrap';
    wrap.style.position = 'absolute';
    wrap.style.left = `${pos.x - 28}px`;
    wrap.style.top = `${pos.y - 28 + yOffset}px`;

    const el = document.createElement('div');
    el.className = 'marker';

    const img = document.createElement('img');
    img.src = p.img;
    img.alt = p.title;
    el.appendChild(img);

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = p.title;

    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      openDetail(p);
    });

    wrap.appendChild(el);
    wrap.appendChild(label);
    mapInner.appendChild(wrap);
  }
}

/* ---------------------------
   Panneau détail
----------------------------*/
function openDetail(proj) {
  leftPanel.classList.remove('hidden');
  renderDetail(proj);
}

function renderDetail(proj) {
  const votesForProject = votesData.filter(v => v.projectId === proj.id);
  const commentsForProject = commentsData.filter(c => c.projectId === proj.id);

  const avgHumour = proj.avgHumour ?? proj.baseHumour;
  const avgParticip = proj.avgParticip ?? proj.baseParticip;

  // vote de l'utilisateur actuel s'il existe
  const myVote = votesForProject.find(v => v.pseudo === localUser.name);
  const initialHum = myVote ? myVote.humour : Math.round(avgHumour);
  const initialPar = myVote ? myVote.participatif : Math.round(avgParticip);

  projectDetail.innerHTML = `
    <img src="${proj.img}" alt="">
    <div class="detail-title">${proj.title}</div>
    <div class="detail-row" id="author">${escapeHtml(proj.auteur)}</div>
    <div class="detail-row">${escapeHtml(proj.desc || '')}</div>
    ${proj.url ? `<div class="detail-row"><button onclick="window.open('${proj.url}', '_blank')" class="btn-link">Voir plus</button></div>` : ''}
    <hr>
    <div class="detail-row"><strong>Humour :</strong> <span id="avg-humour">${avgHumour.toFixed(1)}</span>/10</div>
    <div class="detail-row"><strong>Participatif :</strong> <span id="avg-part">${avgParticip.toFixed(1)}</span>/10</div>

    <div class="detail-row">
      <label>Ton vote (Humour) : </label>
      <div class="vote-controls">
        <button data-action="humour-decr"> - </button>
        <input id="slider-humour" type="range" min="0" max="10" step="1" value="${initialHum}">
        <button data-action="humour-incr"> + </button>
      </div>
    </div>

    <div class="detail-row">
      <label>Ton vote (Participatif) : </label>
      <div class="vote-controls">
        <button data-action="particip-decr"> - </button>
        <input id="slider-part" type="range" min="0" max="10" step="1" value="${initialPar}">
        <button data-action="particip-incr"> + </button>
      </div>
    </div>

    <div class="detail-row">
      <button id="submitVote">Enregistrer mon vote</button>
    </div>
    <hr>

    <div class="comments">
      <h4>Commentaires</h4>
      <div style="margin-top:8px;">
        <textarea id="newComment" rows="3" style="width:100%" placeholder="Ajouter un commentaire (pseudo généré : ${localUser.name})"></textarea>
        <div style="margin-top:6px;"><button id="postComment">Poster</button></div>
      </div>
      <br>
      <div id="commentsList">
        ${commentsForProject.map(c => `
          <div class="comment">
            <strong>${escapeHtml(c.pseudo)}</strong>
            <div>${escapeHtml(c.commentaire)}</div>
            <small>${new Date(c.date).toLocaleString([], {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit"
            })}</small>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const sliderHum = document.getElementById('slider-humour');
  const sliderPart = document.getElementById('slider-part');

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.getAttribute('data-action');
      if (a === 'humour-decr') sliderHum.value = Math.max(0, +sliderHum.value - 1);
      if (a === 'humour-incr') sliderHum.value = Math.min(10, +sliderHum.value + 1);
      if (a === 'particip-decr') sliderPart.value = Math.max(0, +sliderPart.value - 1);
      if (a === 'particip-incr') sliderPart.value = Math.min(10, +sliderPart.value + 1);
    });
  });

  document.getElementById('submitVote').addEventListener('click', async () => {
    const newHum = Number(sliderHum.value);
    const newPar = Number(sliderPart.value);
    await saveVote(proj.id, localUser.name, newHum, newPar);
    recomputeProjectStats();
    repositionMarker(proj.id);
    // mettre à jour affichage (nouvelle moyenne)
    const updatedProj = projects.find(p => p.id === proj.id) || proj;
    document.getElementById('avg-humour').textContent = updatedProj.avgHumour.toFixed(1);
    document.getElementById('avg-part').textContent = updatedProj.avgParticip.toFixed(1);
    alert('Ton vote a été enregistré.');
  });

  document.getElementById('postComment').addEventListener('click', async () => {
    const txt = document.getElementById('newComment').value.trim();
    if (!txt) return alert('Écris un commentaire !');
    await postComment(proj.id, localUser.name, txt);
    renderDetail(proj); // re-render pour afficher le nouveau commentaire
  });
}

/* positionne la bulle si les coordonnées changent (via moyenne) */
function repositionMarker(projectId) {
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return;
  const proj = projects[idx];

  const pos = coordToPx(proj.avgHumour, proj.avgParticip);
  const wrapEls = document.querySelectorAll('.marker-wrap');
  const wrap = wrapEls[idx];
  if (!wrap) return;

  // on ne gère pas ici le décalage vertical de "pile" (pour rester simple)
  wrap.style.left = `${pos.x - 28}px`;
  wrap.style.top = `${pos.y - 28}px`;
}

/* ---------------------------
   Backend helpers (votes & commentaires)
   À adapter selon tes routes backend réelles
----------------------------*/
async function saveVote(projectId, pseudo, humour, participatif) {
  const existingIndex = votesData.findIndex(v => v.projectId === projectId && v.pseudo === pseudo);
  const newVote = { projectId, pseudo, humour, participatif };

  if (existingIndex >= 0) {
    votesData[existingIndex] = newVote;
  } else {
    votesData.push(newVote);
  }

  try {
    await fetch(VOTES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newVote)
    });
  } catch (e) {
    console.error('Erreur lors de l’enregistrement du vote côté serveur :', e);
  }
}

async function postComment(projectId, pseudo, text) {
  const nowIso = new Date().toISOString();
  const newComment = {
    projectId,
    pseudo,
    commentaire: text,
    date: nowIso
  };

  commentsData.push(newComment);

  try {
    await fetch(COMMENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newComment)
    });
  } catch (e) {
    console.error('Erreur lors de l’enregistrement du commentaire côté serveur :', e);
  }
}


/* ---------------------------
   localStorage: user (pseudo uniquement)
----------------------------*/
function initLocalUser() {
  const raw = localStorage.getItem(LS_KEY_USER);
  if (raw) {
    localUser = JSON.parse(raw);
    return;
  }
  const name = (Math.random() < 0.5 ? 'Farfadet' : 'Farfadette') + Math.floor(Math.random() * 1000);
  localUser = { id: 'local_' + Date.now(), name };
  localStorage.setItem(LS_KEY_USER, JSON.stringify(localUser));
}

/* ---------------------------
   Pan / Zoom + SVG stroke
----------------------------*/
const mapThin = document.getElementById('mapThin');
const mapThick = document.getElementById('mapThick');

function applyTransform() {
  mapInner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

  window.currentZoom = scale;
  if (window.redrawP5) window.redrawP5();

  updateSvgStroke(mapThin, scale);
  updateSvgStroke(mapThick, scale);
}

function updateSvgStroke(bgObject, scale) {
  if (!bgObject || !bgObject.contentDocument) return;

  const svg = bgObject.contentDocument.querySelector('svg');
  if (!svg) return;

  svg.querySelectorAll('*').forEach(el => {
    let originalWidth = parseFloat(el.getAttribute('data-original-width'));

    if (!originalWidth) {
      const attrWidth = parseFloat(el.getAttribute('stroke-width'));
      const styleMatch = el.getAttribute('style')?.match(/stroke-width\s*:\s*([\d.]+)/);

      originalWidth = attrWidth || (styleMatch ? parseFloat(styleMatch[1]) : null);

      if (originalWidth) {
        el.setAttribute('data-original-width', originalWidth);
      }
    }

    if (originalWidth) {
      const newWidth = originalWidth / (scale * 4);

      if (el.hasAttribute('stroke-width')) {
        el.setAttribute('stroke-width', newWidth);
      }

      const style = el.getAttribute('style');
      if (style?.includes('stroke-width')) {
        const newStyle = style.replace(/stroke-width\s*:\s*[\d.]+/, `stroke-width:${newWidth}`);
        el.setAttribute('style', newStyle);
      }
    }
  });
}

function setupPanZoom() {
  const initialX = (window.innerWidth - WORLD_W) / 2;
  const initialY = (window.innerHeight - WORLD_H) / 2;
  offsetX = initialX;
  offsetY = initialY;
  applyTransform();

  mapContainer.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startOffsetX = offsetX;
    startOffsetY = offsetY;
    mapContainer.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    offsetX = startOffsetX + (e.clientX - dragStartX);
    offsetY = startOffsetY + (e.clientY - dragStartY);
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    mapContainer.style.cursor = 'default';
  });

  mapContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = mapContainer.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const prevScale = scale;
    const delta = -e.deltaY;
    const zoomFactor = Math.pow(1.0015, delta);
    let newScale = prevScale * zoomFactor;
    newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));

    const dx = mx - offsetX;
    const dy = my - offsetY;
    offsetX = mx - (dx * newScale / prevScale);
    offsetY = my - (dy * newScale / prevScale);
    scale = newScale;
    applyTransform();
  }, { passive: false });

  mapContainer.addEventListener('click', () => {
    leftPanel.classList.add('hidden');
  });

  window.addEventListener('resize', () => applyTransform());

  [mapThin, mapThick].forEach(obj => {
    if (obj) obj.addEventListener('load', () => {
      updateSvgStroke(obj, scale);
      applyTransform();
    });
  });

  // === TOUCH EVENTS pour mobile ===
  let lastTouchDistance = 0;
  let isTouchDragging = false;
  let touchStartX = 0;
  let touchStartY = 0;

  mapContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isTouchDragging = true;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      startOffsetX = offsetX;
      startOffsetY = offsetY;
    } else if (e.touches.length === 2) {
      isTouchDragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDistance = Math.hypot(dx, dy);
    }
  });

  mapContainer.addEventListener('touchmove', (e) => {
    e.preventDefault();

    if (e.touches.length === 1 && isTouchDragging) {
      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;
      offsetX = startOffsetX + dx;
      offsetY = startOffsetY + dy;
      applyTransform();
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      if (!lastTouchDistance) lastTouchDistance = newDist;

      const zoomFactor = newDist / lastTouchDistance;
      let newScale = scale * zoomFactor;
      newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));

      const rect = mapContainer.getBoundingClientRect();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

      const dxCenter = cx - offsetX;
      const dyCenter = cy - offsetY;

      offsetX = cx - (dxCenter * newScale / scale);
      offsetY = cy - (dyCenter * newScale / scale);

      scale = newScale;
      applyTransform();
      lastTouchDistance = newDist;
    }
  }, { passive: false });

  mapContainer.addEventListener('touchend', () => {
    isTouchDragging = false;
    lastTouchDistance = 0;
  });
}

/* ---------------------------
   petites utilitaires
----------------------------*/
function escapeHtml(s) {
  return ('' + s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}
