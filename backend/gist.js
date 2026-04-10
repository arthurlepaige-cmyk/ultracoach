/**
 * GitHub Gist — push/pull menus nutrition entre deux instances Ultra Coach
 */
const https = require('https');

function githubRequest(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'User-Agent': 'UltraCoach/1.0',
      'Accept': 'application/vnd.github.v3+json',
      ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
    };
    if (token) headers['Authorization'] = `token ${token}`;

    const options = { hostname: 'api.github.com', path, method, headers };
    const req = https.request(options, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/**
 * Pousse les menus de la semaine vers un Gist GitHub secret.
 * Crée le Gist s'il n'existe pas encore (gistId null) → retourne le nouvel ID.
 */
async function pushToGist(token, gistId, content) {
  const files = {
    'ultracoach-menus.json': { content: JSON.stringify(content, null, 2) },
  };
  const description = `UltraCoach — Menus semaine ${content.week || ''}`;

  let r;
  if (gistId) {
    r = await githubRequest('PATCH', `/gists/${gistId}`, token, { files, description });
    if (r.status !== 200) throw new Error(`GitHub API ${r.status}: ${JSON.stringify(r.data?.message || r.data)}`);
  } else {
    r = await githubRequest('POST', '/gists', token, { files, description, public: false });
    if (r.status !== 201) throw new Error(`GitHub API ${r.status}: ${JSON.stringify(r.data?.message || r.data)}`);
  }

  return { gist_id: r.data.id, url: r.data.html_url };
}

/**
 * Tire les menus depuis un Gist (URL complète ou ID seul).
 * Fonctionne sans token — les Gist "secrets" sont accessibles par leur ID.
 */
async function pullFromGist(gistIdOrUrl) {
  // Extrait l'ID : "https://gist.github.com/user/ID" ou "ID" directement
  const gistId = gistIdOrUrl.trim().replace(/.*\//, '').split('?')[0];
  const r = await githubRequest('GET', `/gists/${gistId}`, null);
  if (r.status !== 200) throw new Error(`GitHub API ${r.status} — Gist introuvable ou accès refusé`);

  const fileContent = r.data.files?.['ultracoach-menus.json']?.content;
  if (!fileContent) throw new Error('Fichier ultracoach-menus.json introuvable dans ce Gist');

  return JSON.parse(fileContent);
}

module.exports = { pushToGist, pullFromGist };
