const https = require('https');
const semver = require('semver');

const REGISTRY = 'registry.npmjs.org';

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      if (res.statusCode === 404) {
        reject(new Error('Package not found'));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Registry returned ${res.statusCode}`));
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
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Registry request timeout')); });
  });
}

function extractDependencyRanges(deps) {
  if (!deps || typeof deps !== 'object') return [];
  return Object.entries(deps).map(([name, range]) => ({ name, range: String(range) }));
}

function rangeIntersects(a, b) {
  try {
    const rangeA = new semver.Range(a);
    const rangeB = new semver.Range(b);
    return semver.intersects(rangeA, rangeB);
  } catch (_) {
    return false;
  }
}

class ConflictPredictor {
  async analyze(packageName) {
    const meta = await get(`https://${REGISTRY}/${encodeURIComponent(packageName)}`);
    const latestVersion = meta['dist-tags'] && meta['dist-tags'].latest;
    if (!latestVersion) {
      return { conflictRisk: 0, conflicts: [], dependencies: [] };
    }
    const latest = meta.versions && meta.versions[latestVersion];
    if (!latest) {
      return { conflictRisk: 0, conflicts: [], dependencies: [] };
    }
    const deps = extractDependencyRanges(latest.dependencies);
    const conflicts = [];
    for (let i = 0; i < deps.length; i++) {
      for (let j = i + 1; j < deps.length; j++) {
        if (deps[i].name !== deps[j].name) continue;
        if (!rangeIntersects(deps[i].range, deps[j].range)) {
          conflicts.push({
            package: deps[i].name,
            range1: deps[i].range,
            range2: deps[j].range,
          });
        }
      }
    }
    for (const dep of deps) {
      try {
        const depMeta = await get(`https://${REGISTRY}/${encodeURIComponent(dep.name)}`);
        const depLatest = depMeta['dist-tags'] && depMeta['dist-tags'].latest;
        if (!depLatest) continue;
        const depPkg = depMeta.versions && depMeta.versions[depLatest];
        if (!depPkg || !depPkg.peerDependencies) continue;
        const peerEntries = Object.entries(depPkg.peerDependencies);
        for (const [peerName, peerRange] of peerEntries) {
          const inDeps = deps.find((d) => d.name === peerName);
          if (inDeps && !rangeIntersects(inDeps.range, peerRange)) {
            conflicts.push({
              package: peerName,
              context: `peer of ${dep.name}`,
              required: peerRange,
              provided: inDeps.range,
            });
          }
        }
      } catch (_) {
      }
    }
    const conflictRisk = deps.length === 0 ? 0 : Math.min(100, Math.round((conflicts.length / Math.max(deps.length, 1)) * 50 + (deps.length > 20 ? 20 : deps.length)));
    return {
      conflictRisk: Math.min(100, conflictRisk),
      conflicts,
      dependencies: deps.map((d) => ({ name: d.name, range: d.range })),
    };
  }
}

module.exports = { ConflictPredictor };
