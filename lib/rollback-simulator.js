const https = require('https');

const REGISTRY = 'registry.npmjs.org';

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
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

function searchDependents(packageName) {
  return new Promise((resolve) => {
    const path = `/-/v1/search?text=${encodeURIComponent(packageName)}&size=250`;
    const req = https.get(
      { hostname: REGISTRY, path, headers: { Accept: 'application/json' } },
      (res) => {
        if (res.statusCode !== 200) {
          resolve(0);
          return;
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            const total = (j.total != null) ? j.total : 0;
            resolve(typeof total === 'number' ? total : 0);
          } catch (_) {
            resolve(0);
          }
        });
      }
    );
    req.on('error', () => resolve(0));
    req.setTimeout(10000, () => { req.destroy(); resolve(0); });
  });
}

class RollbackSimulator {
  async analyze(packageName) {
    let meta;
    try {
      meta = await getJson(`https://${REGISTRY}/${encodeURIComponent(packageName)}`);
    } catch (e) {
      return { dependentCount: 0, removalComplexityScore: 50 };
    }
    const versions = meta.versions ? Object.keys(meta.versions) : [];
    const versionCount = versions.length;
    const latest = meta['dist-tags'] && meta['dist-tags'].latest;
    const pkg = meta.versions && latest && meta.versions[latest];
    const depCount = pkg && pkg.dependencies ? Object.keys(pkg.dependencies).length : 0;
    const dependentApprox = await searchDependents(packageName);
    const complexityFromDeps = Math.min(50, depCount * 3 + (dependentApprox > 0 ? Math.min(40, Math.log2(dependentApprox + 1) * 8) : 0));
    const complexityFromVersions = Math.min(30, versionCount);
    const removalComplexityScore = Math.min(100, Math.round(complexityFromDeps + complexityFromVersions + 20));
    return {
      dependentCount: dependentApprox,
      depCount,
      versionCount,
      removalComplexityScore,
    };
  }
}

module.exports = { RollbackSimulator };
