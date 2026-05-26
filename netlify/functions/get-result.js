// netlify/functions/get-result.js
// Checks if the OCR result file exists in the GitHub repo yet.
// Returns { ready: true, text: "..." } or { ready: false }

const REPO  = process.env.GITHUB_REPO;
const TOKEN = process.env.GITHUB_TOKEN;
const API   = 'https://api.github.com';

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Accept':        'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Cache-Control': 'no-store'
};

// ── Handler ──────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { resultPath } = JSON.parse(event.body);

    if (!resultPath) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing resultPath' }) };
    }

    if (!REPO || !TOKEN) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured: env vars missing' }) };
    }

    const res = await fetch(`${API}/repos/${REPO}/contents/${resultPath}`, { headers });

    // Not ready yet — workflow still running
    if (res.status === 404) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ready: false })
      };
    }

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`);
    }

    const data = await res.json();

    // Content is base64-encoded by GitHub API
    const text = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');

    return {
      statusCode: 200,
      body: JSON.stringify({ ready: true, text })
    };

  } catch (err) {
    console.error('get-result error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};