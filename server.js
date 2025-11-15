// server.js
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// autoriser les appels depuis GitHub Pages + localhost
app.use(cors()); // pour un proto c'est ok d'ouvrir à tous les domaines

// pour parser le JSON dans les requêtes POST
app.use(express.json());


app.get('/carte.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'carte.html'));
});

app.get('/carte', (req, res) => {
  res.sendFile(path.join(__dirname, 'carte.html'));
});

// servir les fichiers statiques si tu testes en local (carte.html, public/...)
app.use(express.static(__dirname));

// chemins vers les fichiers JSON
const COMMENTS_PATH = path.join(__dirname, 'public', 'comments.json');
const VOTES_PATH = path.join(__dirname, 'public', 'votes.json');

// util pour lire un JSON
async function readJson(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// util pour écrire un JSON
async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/* ---- COMMENTS ---- */

app.get('/api/comments', async (req, res) => {
  try {
    const comments = await readJson(COMMENTS_PATH);
    res.json(comments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lecture comments.json' });
  }
});

app.post('/api/comments', async (req, res) => {
  const { projectId, pseudo, commentaire, date } = req.body;
  if (!projectId || !pseudo || !commentaire) {
    return res.status(400).json({ error: 'projectId, pseudo et commentaire sont requis' });
  }

  const now = date || new Date().toISOString();
  const newComment = { projectId, pseudo, commentaire, date: now };

  try {
    const comments = await readJson(COMMENTS_PATH);
    comments.push(newComment);
    await writeJson(COMMENTS_PATH, comments);
    res.status(201).json(newComment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur écriture comments.json' });
  }
});

/* ---- VOTES ---- */

app.get('/api/votes', async (req, res) => {
  try {
    const votes = await readJson(VOTES_PATH);
    res.json(votes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lecture votes.json' });
  }
});

app.post('/api/votes', async (req, res) => {
  const { projectId, pseudo, humour, participatif } = req.body;
  if (!projectId || !pseudo) {
    return res.status(400).json({ error: 'projectId et pseudo sont requis' });
  }

  try {
    const votes = await readJson(VOTES_PATH);

    const index = votes.findIndex(
      v => v.projectId === projectId && v.pseudo === pseudo
    );

    const newVote = {
      projectId,
      pseudo,
      humour: Number(humour) || 0,
      participatif: Number(participatif) || 0
    };

    if (index >= 0) {
      votes[index] = newVote;
    } else {
      votes.push(newVote);
    }

    await writeJson(VOTES_PATH, votes);
    res.status(201).json(newVote);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur écriture votes.json' });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
