const https = require('https');

const REGISTRY = 'registry.npmjs.org';
const GITHUB_API = 'api.github.com';

function getJson(url) {
  const u = new URL(url);
  const options = {
    hostname: u.hostname,
    path: u.pathname + u.search,
    method: 'GET',
    headers: { Accept: 'application/json' },
  };
  if (u.hostname === GITHUB_API) {
    options.headers['User-Agent'] = 'dependor-patent/1.0';
  }
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (res.statusCode === 404) {
        resolve(null);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Request returned ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function parseRepoUrl(pkg) {
  let repo = pkg.repository;
  if (typeof repo === 'string') {
    const m = repo.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
  }
  if (repo && typeof repo === 'object' && repo.url) {
    const m = String(repo.url).match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
  }
  return null;
}

function exponentialStalenessScore(lastPublishMs) {
  if (lastPublishMs == null) return 100;
  const years = lastPublishMs / (365.25 * 24 * 60 * 60 * 1000);
  return Math.min(100, Math.round(100 * (1 - Math.exp(-years * 2))));
}

class MultiDimensionalScorer {
  async analyze(packageName) {
    let meta;
    try {
      meta = await getJson(`https://${REGISTRY}/${encodeURIComponent(packageName)}`);
    } catch (e) {
      throw e;
    }
    if (!meta) throw new Error('Package not found');
    const latest = meta['dist-tags'] && meta['dist-tags'].latest;
    const pkg = meta.versions && latest && meta.versions[latest];
    if (!pkg) {
      return { maintainerRisk: 50, releaseFrequency: 0, stalenessScore: 50, finalRiskScore: 50 };
    }
    const maintainers = meta.maintainers || [];
    const maintainerCount = Array.isArray(maintainers) ? maintainers.length : 0;
    const maintainerRisk = maintainerCount === 0 ? 90 : maintainerCount === 1 ? 50 : Math.max(0, 40 - maintainerCount * 10);
    const versions = meta.versions ? Object.keys(meta.versions) : [];
    const releaseFrequency = versions.length < 2 ? 0 : versions.length / 5;
    const timeMap = meta.time || {};
    const lastPublish = timeMap[latest] ? new Date(timeMap[latest]).getTime() : null;
    const now = Date.now();
    const timeSincePublishMs = lastPublish != null ? now - lastPublish : null;
    const stalenessScore = exponentialStalenessScore(timeSincePublishMs);
    let githubRisk = 50;
    const repo = parseRepoUrl(pkg);
    if (repo) {
      try {
        const gh = await getJson(`https://${GITHUB_API}/repos/${repo.owner}/${repo.repo}`);
        if (gh && gh.stargazers_count != null) {
          const stars = gh.stargazers_count;
          githubRisk = stars > 1000 ? 10 : stars > 100 ? 25 : stars > 10 ? 40 : 60;
        }
      } catch (_) {
      }
    }
    const weights = { maintainer: 0.25, staleness: 0.35, github: 0.25, release: 0.15 };
    const releaseRisk = releaseFrequency > 2 ? 20 : releaseFrequency > 1 ? 40 : 70;
    const finalRiskScore = Math.min(100, Math.round(
      maintainerRisk * weights.maintainer +
      stalenessScore * weights.staleness +
      githubRisk * weights.github +
      releaseRisk * weights.release
    ));
    return {
      maintainerRisk: Math.min(100, Math.round(maintainerRisk)),
      releaseFrequency,
      stalenessScore,
      githubRisk,
      finalRiskScore,
    };
  }
}

module.exports = { MultiDimensionalScorer };
