// netlify/functions/upload-image.js
// Receives image from frontend, pushes it to GitHub repo.
// Token lives in Netlify env vars — never exposed to the browser.

const REPO    = process.env.GITHUB_REPO;   // e.g. ST10438409-Emeris/ST10438409-Emeris.github.io
const TOKEN   = process.env.GITHUB_TOKEN;  // ghp_xxxx  (repo read/write scope)
const API     = 'https://api.github.com';

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Accept':        'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type':  'application/json'
};

// Get SHA of existing file (required to overwrite)
async function getFileSHA(path) {
  const res = await fetch(`${API}/repos/${REPO}/contents/${path}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`SHA check failed: ${res.status}`);
  const data = await res.json();
  return data.sha || null;
}

// Push file to GitHub
async function pushFile(path, base64Content, message) {
  const sha = await getFileSHA(path);
  const body = { message, content: base64Content };
  if (sha) body.sha = sha;

  const res = await fetch(`${API}/repos/${REPO}/contents/${path}`, {
    method:  'PUT',
    headers,
    body:    JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Push failed: ${res.status}`);
  }

  return await res.json();
}

// ── Handler ──────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { username, filename, base64, mimeType } = JSON.parse(event.body);

    if (!username || !filename || !base64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    if (!REPO || !TOKEN) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured: env vars missing' }) };
    }

    // Sanitise filename just in case
    const safeFilename = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const imagePath    = `images/${safeFilename}`;

    // Derive the result path the workflow will write to
    const nameNoExt  = safeFilename.replace(/\.[^.]+$/, '');
    const resultPath = `results/${nameNoExt}.txt`;

    await pushFile(imagePath, base64, `OCR upload: ${safeFilename}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, imagePath, resultPath })
    };

  } catch (err) {
    console.error('upload-image error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};