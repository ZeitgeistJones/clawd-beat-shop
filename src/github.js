export function parseRepo(input) {
  let value = String(input || '').trim();
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password) {
      throw new Error('Use an HTTPS github.com repository link or owner/repo.');
    }
    value = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    if (value.split('/').length !== 2) throw new Error('Paste the repository home link, not a file or branch link.');
  }
  value = value.replace(/\.git$/, '');
  const parts = value.split('/');
  if (parts.length !== 2 || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(parts[0]) ||
      !/^[a-zA-Z0-9_.-]{1,100}$/.test(parts[1]) || ['.', '..'].includes(parts[1])) {
    throw new Error('Enter a repository like clawdbotatg/clawd-vesting.');
  }
  return {owner:parts[0], name:parts[1], fullName:parts.join('/'), url:`https://github.com/${parts.join('/')}`};
}

async function request(path, {fetchImpl, signal, raw = false}) {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    headers: {Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json'},
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(18000)]) : AbortSignal.timeout(18000)
  });
  if (!response.ok) {
    const error = new Error(response.status === 404 ? 'Repository or source not found; this tool reads public repos only.' :
      [403,429].includes(response.status) ? 'GitHub access is limited right now. Try later, or paste a README below.' :
      `GitHub returned ${response.status}. Try again or paste a README.`);
    error.status = response.status;
    throw error;
  }
  return raw ? response.text() : response.json();
}

export async function loadRepo(input, {fetchImpl = globalThis.fetch.bind(globalThis), signal} = {}) {
  const parsed = parseRepo(input);
  const base = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.name)}`;
  const metadata = await request(base, {fetchImpl,signal});
  // GitHub can redirect renamed repositories: keep the canonical public identity.
  const repo = parseRepo(metadata.full_name || parsed.fullName);
  const canonicalBase = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
  const warnings = [];
  let commits = [];
  try { commits = await request(`${canonicalBase}/commits?per_page=5`, {fetchImpl,signal}); }
  catch (error) { if (signal?.aborted) throw error; warnings.push(`Recent commits unavailable: ${error.message}`); }
  const revision = commits[0]?.sha || metadata.default_branch || 'HEAD';
  let readme = '';
  try { readme = await request(`${canonicalBase}/readme?ref=${encodeURIComponent(revision)}`, {fetchImpl,signal,raw:true}); }
  catch (error) { if (signal?.aborted) throw error; warnings.push(`README unavailable: ${error.message}`); }
  if (readme.length > 24000) warnings.push('README shortened to the first 24,000 characters.');
  return {...repo, description:String(metadata.description || ''), topics:metadata.topics || [],
    language:metadata.language || '', readme:readme.slice(0,24000), revision,
    readmeUrl:`${repo.url}/tree/${encodeURIComponent(revision)}`,
    commits:commits.map(c=>({sha:c.sha, message:String(c.commit?.message || '').split('\n')[0],
      url:`${repo.url}/commit/${encodeURIComponent(c.sha)}`})), warnings, source:'github', loadedAt:new Date().toISOString()};
}

export async function listClawdRepos({fetchImpl = globalThis.fetch.bind(globalThis), signal} = {}) {
  return request('/users/clawdbotatg/repos?sort=pushed&per_page=100', {fetchImpl,signal});
}
