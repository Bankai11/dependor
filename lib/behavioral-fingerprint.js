const https = require('https');
const zlib = require('zlib');
const tar = require('tar-stream');

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

function shannonEntropy(input) {
  if (!input || input.length === 0) return 0;
  const freq = Object.create(null);
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    freq[c] = (freq[c] || 0) + 1;
  }
  let h = 0;
  const len = input.length;
  for (const k of Object.keys(freq)) {
    const p = freq[k] / len;
    h -= p * Math.log2(p);
  }
  return Math.round(h * 100) / 100;
}

function detectEntryPoints(entry, pkg) {
  const entryPoints = [];
  if (pkg.main && typeof pkg.main === 'string') entryPoints.push(pkg.main);
  if (pkg.module && typeof pkg.module === 'string') entryPoints.push(pkg.module);
  if (pkg.bin && typeof pkg.bin === 'object') {
    const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin);
    bins.forEach((b) => entryPoints.push(b));
  }
  if (pkg.exports) {
    if (typeof pkg.exports === 'string') entryPoints.push(pkg.exports);
    else if (typeof pkg.exports === 'object') {
      const collect = (obj) => {
        if (typeof obj === 'string') entryPoints.push(obj);
        else if (obj && typeof obj === 'object') {
          if (obj.default || obj.import || obj.require) {
            [obj.default, obj.import, obj.require].forEach((v) => v && entryPoints.push(v));
          }
          Object.values(obj).forEach(collect);
        }
      };
      collect(pkg.exports);
    }
  }
  const normalized = [...new Set(entryPoints.map((p) => p.replace(/^\.\//, '')))];
  return normalized;
}

class BehavioralFingerprinter {
  async analyze(packageName) {
    let meta;
    try {
      meta = await getJson(`https://${REGISTRY}/${encodeURIComponent(packageName)}`);
    } catch (e) {
      throw e;
    }
    const latest = meta['dist-tags'] && meta['dist-tags'].latest;
    if (!latest) {
      return { fileCount: 0, entryPoints: [], entropy: 0, complexity: 0 };
    }
    const versionMeta = meta.versions && meta.versions[latest];
    const tarballUrl = versionMeta && versionMeta.dist && versionMeta.dist.tarball;
    if (!tarballUrl) {
      const entryPoints = versionMeta ? detectEntryPoints(null, versionMeta) : [];
      return { fileCount: 0, entryPoints, entropy: 0, complexity: entryPoints.length * 5 };
    }
    const paths = [];
    let totalSize = 0;
    const extract = tar.extract();
    return new Promise((resolve, reject) => {
      extract.on('entry', (header, stream, next) => {
        const name = header.name.replace(/^[^/]+\//, '');
        if (header.type === 'file' && !name.includes('..')) {
          paths.push(name);
          stream.on('data', (chunk) => { totalSize += chunk.length; });
        }
        stream.on('end', next);
        stream.resume();
      });
      extract.on('finish', () => {
        const entryPoints = versionMeta ? detectEntryPoints(null, versionMeta) : [];
        const pathString = paths.join('');
        const entropy = shannonEntropy(pathString || ' ');
        const complexity = Math.min(100, paths.length + Math.round(entropy * 2) + entryPoints.length * 3);
        resolve({
          fileCount: paths.length,
          entryPoints,
          entropy,
          totalSize,
          complexity,
        });
      });
      extract.on('error', (err) => {
        const entryPoints = versionMeta ? detectEntryPoints(null, versionMeta) : [];
        resolve({
          fileCount: paths.length,
          entryPoints,
          entropy: 0,
          totalSize,
          complexity: Math.min(100, paths.length + entryPoints.length * 3),
          partial: true,
          error: err.message,
        });
      });
      const req = https.get(tarballUrl, (res) => {
        if (res.statusCode !== 200) {
          const entryPoints = versionMeta ? detectEntryPoints(null, versionMeta) : [];
          resolve({
            fileCount: 0,
            entryPoints,
            entropy: 0,
            complexity: entryPoints.length * 5,
            partial: true,
            error: `Tarball returned ${res.statusCode}`,
          });
          return;
        }
        const gunzip = zlib.createGunzip();
        res.pipe(gunzip).pipe(extract);
        gunzip.on('error', (err) => {
          const entryPoints = versionMeta ? detectEntryPoints(null, versionMeta) : [];
          resolve({
            fileCount: paths.length,
            entryPoints,
            entropy: 0,
            totalSize,
            complexity: Math.min(100, paths.length + entryPoints.length * 3),
            partial: true,
            error: err.message,
          });
        });
      });
      req.on('error', (err) => {
        const entryPoints = versionMeta ? detectEntryPoints(null, versionMeta) : [];
        resolve({
          fileCount: 0,
          entryPoints,
          entropy: 0,
          complexity: entryPoints.length * 5,
          partial: true,
          error: err.message,
        });
      });
      req.setTimeout(20000, () => {
        req.destroy();
        const entryPoints = versionMeta ? detectEntryPoints(null, versionMeta) : [];
        resolve({
          fileCount: paths.length,
          entryPoints,
          entropy,
          totalSize,
          complexity: Math.min(100, paths.length + Math.round((entropy || 0) * 2) + entryPoints.length * 3),
          partial: true,
          error: 'Tarball stream timeout',
        });
      });
    });
  }
}

module.exports = { BehavioralFingerprinter };
