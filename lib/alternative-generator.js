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

const MICRO_REPLACEMENTS = {
  'left-pad': `function leftPad(str, len, ch) {
  str = String(str);
  ch = ch || ' ';
  while (str.length < len) str = ch + str;
  return str;
}
module.exports = leftPad;`,
  'is-array': `module.exports = Array.isArray;`,
  'is-number': `module.exports = function isNumber(x) { return typeof x === 'number' && !Number.isNaN(x); };`,
  'is-string': `module.exports = function isString(x) { return typeof x === 'string'; };`,
  'is-object': `module.exports = function isObject(x) { return x !== null && typeof x === 'object'; };`,
  'array-flatten': `function flatten(arr) {
  return arr.reduce(function (acc, x) {
    return acc.concat(Array.isArray(x) ? flatten(x) : x);
  }, []);
}
module.exports = flatten;`,
  'strip-bom': `module.exports = function stripBom(s) { return typeof s === 'string' && s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; };`,
  'trim-left': `module.exports = function trimLeft(s) { return String(s).replace(/^\\s+/, ''); };`,
  'trim-right': `module.exports = function trimRight(s) { return String(s).replace(/\\s+$/, ''); };`,
};

function generateGeneric(name, description) {
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
  return `function ${safeName}(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return input;
  return String(input);
}
module.exports = ${safeName};
module.exports.default = ${safeName};`;
}

class AlternativeGenerator {
  async analyze(packageName) {
    let meta;
    try {
      meta = await getJson(`https://${REGISTRY}/${encodeURIComponent(packageName)}`);
    } catch (e) {
      return { code: '', sizeBytes: 0, suggested: generateGeneric(packageName, '') };
    }
    const latest = meta['dist-tags'] && meta['dist-tags'].latest;
    const pkg = meta.versions && latest && meta.versions[latest];
    const description = (pkg && pkg.description) ? String(pkg.description) : '';
    let code = MICRO_REPLACEMENTS[packageName];
    if (!code) {
      code = generateGeneric(packageName, description);
    }
    const sizeBytes = Buffer.byteLength(code, 'utf8');
    return {
      code,
      sizeBytes,
      suggested: code,
    };
  }
}

module.exports = { AlternativeGenerator };
