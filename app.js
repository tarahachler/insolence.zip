/* app.js
 Prototype "sans React" :
  - pan/zoom custom (transform)
  - p5 canvas background (traits / image troll)
  - marqueurs projets DOM
  - panneau détail + votes + commentaires (localStorage prototype)
*/

// ==== CONFIG PROTOTYPE ====
const WORLD_W = 2000, WORLD_H = 1400; // taille de la "toile"
const PADDING = 120; // marge interne pour ne pas coller aux bords
const MIN_SCALE = 0.25, MAX_SCALE = 2.5;

// Tableau supprimé (on le chargera depuis le CSV)
let projects = [];

// état du viewport
let scale = 1, offsetX = 0, offsetY = 0;
let isDragging = false, dragStartX = 0, dragStartY = 0, startOffsetX = 0, startOffsetY = 0;

// éléments DOM
let mapContainer, mapInner, leftPanel, projectDetail, closePanelBtn;

// utilisateur local (pseudo)
let localUser = { id: null, name: null };

// stocke les votes et commentaires localement (pendant prototypage)
const LS_KEY_USER = 'proto_user';
const LS_KEY_VOTES = 'proto_votes'; // { projectId: { humour: 7, particip: 5 } }
const LS_KEY_COMMS = 'proto_comments'; // { projectId: [ { user, text, ts } ] }
document.addEventListener('DOMContentLoaded', async () => {
  mapContainer = document.getElementById('mapContainer');
  mapInner = document.getElementById('mapInner');
  leftPanel = document.getElementById('leftPanel');
  projectDetail = document.getElementById('projectDetail');
  closePanelBtn = document.getElementById('closePanel');

  initLocalUser();
  setupPanZoom();

  // charger le CSV avant de créer les marqueurs
  await loadProjectsFromCSV();
  createMarkers();

  closePanelBtn.addEventListener('click', () => leftPanel.classList.add('hidden'));
});

/* ---------------------------
   Charger les projets depuis le CSV
----------------------------*/
async function loadProjectsFromCSV() {
  const response = await fetch('./public/projets-app-carte.csv');
  const csvText = await response.text();

  // découper lignes / colonnes
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  projects = lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = cols[i]);
    return {
      id: obj.id,
      title: obj['Titre'],
      humour: parseFloat(obj['Humour']) || 0,
      particip: parseFloat(obj['Participativité']) || 0,
      auteur: obj['Auteur-trice(s)'] || '',
      url: obj['Url'] || '',
      file: obj['Fichier'] || '',
      desc: obj['Description'] || '',
      img: `./public/images/carte/projets/${obj['Fichier']}` // chemin relatif vers le dossier images
    };
  });
}
/* ---------------------------
   UTIL: conversion coord -> px
   humour: 0..10 (0 = pas drôle -> Bas)
   particip: 0..10 (0 = individuel -> Gauche)
   On mapInner (0..WORLD_W) , y = inversé parce que Nord = drôle (haut)
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
  for (const p of projects) {
    const pos = coordToPx(p.humour, p.particip);
    const el = document.createElement('div');
    el.className = 'marker';
    el.style.left = `${pos.x - 28}px`;
    el.style.top = `${pos.y - 28}px`;

    const img = document.createElement('img');
    img.src = p.img;
    img.alt = p.title;
    el.appendChild(img);

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = p.title; // 👈 uniquement le titre
    el.appendChild(label);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openDetail(p);
    });

    mapInner.appendChild(el);
  }
}


/* ---------------------------
   Panneau détail (local)
----------------------------*/
function openDetail(proj) {
  leftPanel.classList.remove('hidden');
  renderDetail(proj);
}

function renderDetail(proj) {
  // récupération votes locaux
  const votes = JSON.parse(localStorage.getItem(LS_KEY_VOTES) || '{}');
  const projVotes = votes[proj.id] || { humour: proj.humour, particip: proj.particip };

  const comms = JSON.parse(localStorage.getItem(LS_KEY_COMMS) || '{}');
  const projComms = comms[proj.id] || [];

projectDetail.innerHTML = `
  <img src="${proj.img}" alt="">
  <div class="detail-title">${proj.title}</div>
  <div class="detail-row"><strong>Auteur-trice(s) :</strong> ${escapeHtml(proj.auteur)}</div>
  <div class="detail-row">${escapeHtml(proj.desc || '')}</div>
  ${proj.url ? `<div class="detail-row"><a href="${proj.url}" target="_blank" class="btn-link">Voir plus →</a></div>` : ''}
    <div class="detail-row"><strong>Humour :</strong> <span id="avg-humour">${projVotes.humour.toFixed(1)}</span>/10</div>
    <div class="detail-row"><strong>Participatif :</strong> <span id="avg-part">${projVotes.particip.toFixed(1)}</span>/10</div>

    <div class="detail-row">
      <label>Ton vote (Humour) : </label>
      <div class="vote-controls">
        <button data-action="humour-decr">Moins</button>
        <input id="slider-humour" type="range" min="0" max="10" step="1" value="${Math.round(projVotes.humour)}">
        <button data-action="humour-incr">Plus</button>
      </div>
    </div>

    <div class="detail-row">
      <label>Ton vote (Participatif) : </label>
      <div class="vote-controls">
        <button data-action="particip-decr">Moins</button>
        <input id="slider-part" type="range" min="0" max="10" step="1" value="${Math.round(projVotes.particip)}">
        <button data-action="particip-incr">Plus</button>
      </div>
    </div>

    <div class="detail-row">
      <button id="submitVote">Enregistrer mon vote</button>
    </div>

    <div class="comments">
      <h4>Commentaires</h4>
      <div id="commentsList">
        ${projComms.map(c=> `<div class="comment"><strong>${escapeHtml(c.user)}</strong><div>${escapeHtml(c.text)}</div><small>${new Date(c.ts).toLocaleString()}</small></div>`).join('')}
      </div>
      <div style="margin-top:8px;">
        <textarea id="newComment" rows="3" style="width:100%" placeholder="Ajouter un commentaire (anonyme)"></textarea>
        <div style="margin-top:6px;"><button id="postComment">Poster (pseudo généré : ${localUser.name})</button></div>
      </div>
    </div>
  `;

  // interactions vote
  const sliderHum = document.getElementById('slider-humour');
  const sliderPart = document.getElementById('slider-part');
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const a = btn.getAttribute('data-action');
      if (a === 'humour-decr') sliderHum.value = Math.max(0, +sliderHum.value - 1);
      if (a === 'humour-incr') sliderHum.value = Math.min(10, +sliderHum.value + 1);
      if (a === 'particip-decr') sliderPart.value = Math.max(0, +sliderPart.value - 1);
      if (a === 'particip-incr') sliderPart.value = Math.min(10, +sliderPart.value + 1);
    });
  });

  document.getElementById('submitVote').addEventListener('click', () => {
    const newHum = Number(sliderHum.value);
    const newPar = Number(sliderPart.value);
    saveLocalVote(proj.id, newHum, newPar);
    // mettre à jour affichage
    document.getElementById('avg-humour').textContent = newHum.toFixed(1);
    document.getElementById('avg-part').textContent = newPar.toFixed(1);
    // repositionner éventuellement la bulle (si coords changent)
    repositionMarker(proj.id, newHum, newPar);
    alert('Ton vote a été enregistré localement (prototype).');
  });

  document.getElementById('postComment').addEventListener('click', () => {
    const txt = document.getElementById('newComment').value.trim();
    if (!txt) return alert('Écris un commentaire !');
    postLocalComment(proj.id, localUser.name, txt);
    renderDetail(proj); // re-render pour afficher le commentaire
  });
}

/* positionne la bulle si les coordonnées changent */
function repositionMarker(projectId, newHum, newPar) {
  // repère l'élément marker correspondant (par titre/ordre c'est simplifié)
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return;
  projects[idx].humour = newHum;
  projects[idx].particip = newPar;
  // reposition DOM
  const markerEl = document.querySelectorAll('.marker')[idx];
  const pos = coordToPx(newHum, newPar);
  markerEl.style.left = `${pos.x - 28}px`;
  markerEl.style.top = `${pos.y - 28}px`;
}

/* ---------------------------
   localStorage: user / votes / comments
----------------------------*/
function initLocalUser() {
  const raw = localStorage.getItem(LS_KEY_USER);
  if (raw) {
    localUser = JSON.parse(raw);
    return;
  }
  // créer pseudo 'Farfadet' ou 'Farfadette' + num
  const name = (Math.random() < 0.5 ? 'Farfadet' : 'Farfadette') + Math.floor(Math.random()*1000);
  localUser = { id: 'local_' + Date.now(), name };
  localStorage.setItem(LS_KEY_USER, JSON.stringify(localUser));
}

function saveLocalVote(projectId, humour, particip) {
  const cur = JSON.parse(localStorage.getItem(LS_KEY_VOTES) || '{}');
  cur[projectId] = { humour, particip };
  localStorage.setItem(LS_KEY_VOTES, JSON.stringify(cur));
}

function postLocalComment(projectId, user, text) {
  const cur = JSON.parse(localStorage.getItem(LS_KEY_COMMS) || '{}');
  if (!cur[projectId]) cur[projectId] = [];
  cur[projectId].push({ user, text, ts: Date.now() });
  localStorage.setItem(LS_KEY_COMMS, JSON.stringify(cur));
}

/* ---------------------------
   Pan / Zoom
----------------------------*/
/* ---------------------------
   Pan / Zoom + SVG stroke
----------------------------*/
// références aux SVG
const mapThin = document.getElementById('mapThin');
const mapThick = document.getElementById('mapThick');

function applyTransform() {
  mapInner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

  // prévenir p5 que zoom a changé (pour ajuster strokeWeight)
  window.currentZoom = scale;
  if (window.redrawP5) window.redrawP5();

  // met à jour les SVG (si chargés)
  updateSvgStroke(mapThin, scale);
  updateSvgStroke(mapThick, scale);
}

function updateSvgStroke(bgObject, scale) {
  if (!bgObject || !bgObject.contentDocument) return;

  const svg = bgObject.contentDocument.querySelector('svg');
  if (!svg) return;

  // Parcourt tous les éléments du SVG
  svg.querySelectorAll('*').forEach(el => {
    let originalWidth = parseFloat(el.getAttribute('data-original-width'));

    // Si on n’a pas encore mémorisé l’épaisseur originale :
    if (!originalWidth) {
      // Essaye d’abord l’attribut stroke-width
      const attrWidth = parseFloat(el.getAttribute('stroke-width'));

      // Sinon, cherche dans le style inline
      const styleMatch = el.getAttribute('style')?.match(/stroke-width\s*:\s*([\d.]+)/);

      originalWidth = attrWidth || (styleMatch ? parseFloat(styleMatch[1]) : null);

      if (originalWidth) {
        el.setAttribute('data-original-width', originalWidth);
      }
    }

    // Si on a bien trouvé une valeur originale, on la redimensionne
    if (originalWidth) {
      const newWidth = originalWidth / (scale*4);

      // met à jour l’attribut direct si présent
      if (el.hasAttribute('stroke-width')) {
        el.setAttribute('stroke-width', newWidth);
      }

      // met à jour le style inline si présent
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

  // drag
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

  // wheel -> zoom sous la souris
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

    // maintenir le point sous le curseur
    const dx = mx - offsetX;
    const dy = my - offsetY;
    offsetX = mx - (dx * newScale / prevScale);
    offsetY = my - (dy * newScale / prevScale);
    scale = newScale;
    applyTransform();
  }, { passive: false });

  // click sur fond ferme le panel
  mapContainer.addEventListener('click', () => {
    leftPanel.classList.add('hidden');
  });

  // resize
  window.addEventListener('resize', () => applyTransform());

  // attendre que les SVG soient chargés
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
    // Pan à un doigt
    isTouchDragging = true;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    startOffsetX = offsetX;
    startOffsetY = offsetY;
  } else if (e.touches.length === 2) {
    // Pinch à deux doigts
    isTouchDragging = false; // on bloque le pan pendant le pinch
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    lastTouchDistance = Math.hypot(dx, dy);
  }
});

mapContainer.addEventListener('touchmove', (e) => {
  e.preventDefault(); // bloque le scroll natif

  if (e.touches.length === 1 && isTouchDragging) {
    // Pan à un doigt
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    offsetX = startOffsetX + dx;
    offsetY = startOffsetY + dy;
    applyTransform();
  } else if (e.touches.length === 2) {
    // Pinch zoom
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const newDist = Math.hypot(dx, dy);
    if (!lastTouchDistance) lastTouchDistance = newDist;

    const zoomFactor = newDist / lastTouchDistance;
    let newScale = scale * zoomFactor;
    newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));

    // centre du pinch
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
function escapeHtml(s){ return (''+s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

