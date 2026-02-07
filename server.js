import express from 'express';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

const app = express();
const PORT = 3000;

const DATA_DIR = path.resolve('data');
const HIGHSCORES_PATH = path.join(DATA_DIR, 'highscores.json');

app.use(express.static('public'));
app.use(express.json({ limit: '4kb' }));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

function sanitizeName(name) {
  const raw = String(name ?? '').trim();
  const trimmed = raw.slice(0, 16);
  // Allow letters, numbers, space, underscore, hyphen.
  const cleaned = trimmed.replace(/[^a-zA-Z0-9 _-]/g, '');
  return cleaned || 'Anon';
}

function sanitizeScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < 0) return null;
  if (i > 1_000_000_000) return null;
  return i;
}

async function readHighScores() {
  try {
    const raw = await fs.readFile(HIGHSCORES_PATH, 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.score === 'number' && typeof x.name === 'string')
      .map((x) => ({ name: String(x.name).slice(0, 16), score: Math.floor(x.score), ts: Number(x.ts) || Date.now() }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  } catch {
    return [];
  }
}

async function writeHighScores(list) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = HIGHSCORES_PATH + '.tmp';
  const payload = JSON.stringify(list.slice(0, 10), null, 2) + '\n';
  await fs.writeFile(tmp, payload, 'utf8');
  await fs.rename(tmp, HIGHSCORES_PATH);
}

app.get('/api/highscores', async (_req, res) => {
  const scores = await readHighScores();
  res.json({ scores });
});

app.post('/api/highscores', async (req, res) => {
  const name = sanitizeName(req.body?.name);
  const score = sanitizeScore(req.body?.score);

  if (score === null) {
    res.status(400).json({ ok: false, error: 'invalid_score' });
    return;
  }

  const existing = await readHighScores();
  const candidate = { name, score, ts: Date.now() };
  const merged = existing.concat([candidate]).sort((a, b) => b.score - a.score).slice(0, 10);

  const qualifies = merged.some((x) => x.ts === candidate.ts && x.score === candidate.score && x.name === candidate.name);

  if (!qualifies) {
    res.json({ ok: true, saved: false, scores: existing });
    return;
  }

  await writeHighScores(merged);
  res.json({ ok: true, saved: true, scores: merged });
});

app.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((x) => x && x.family === 'IPv4' && !x.internal)
    .map((x) => x.address);
  const ip = ips[0] || '127.0.0.1';
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`LAN URL: http://${ip}:${PORT}`);
});
