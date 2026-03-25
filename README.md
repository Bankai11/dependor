# 🔍 Dependor

> **Intelligent npm dependency risk analyzer** — analyze any npm package before you install it.

[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/badge/npm-registry-red)](https://www.npmjs.com/)

---

## What is Dependor?

Dependor is a CLI tool that analyzes npm packages **before** you install them. It surfaces hidden risks — version conflicts, behavioral complexity, maintainer health, and rollback difficulty — all in one report.

No more surprise breaking changes or abandoned packages in your production code.

---

## Features

| Technology | What it does |
|---|---|
| 🧩 **Conflict Predictor** | Detects version range conflicts and peer dependency mismatches across all transitive deps |
| 🧬 **Behavioral Fingerprinter** | Analyzes tarball structure, file entropy, and entry point complexity |
| 🔄 **Alternative Generator** | Suggests native code alternatives to avoid the dependency entirely |
| 📊 **Multi-Dimensional Scorer** | Computes a weighted risk score from maintainer activity, download trends & more |
| 🧯 **Rollback Simulator** | Estimates how hard the package would be to remove from your project |

---

## Installation

```bash
# Clone the repo
git clone https://github.com/Bankai11/dependor.git
cd dependor

# Install dependencies
npm install

# Link globally (optional, to use `dependor` anywhere)
npm link
```

---

## Usage

```bash
# Analyze any npm package
dependor check <package-name>

# Examples
dependor check lodash
dependor check express
dependor check left-pad
```

### Example Output

```
==================================
  🔍 DEPENDOR ANALYSIS REPORT

==================================

Package:               lodash
Conflict Risk:         12%
Behavioral Complexity: 48
Maintainer Risk:       21
Rollback Difficulty:   35

Final Risk Score: 28 / 100

==================================
```

**Risk Score guide:**
- `0 – 30` → ✅ Low risk — safe to install
- `31 – 60` → ⚠️ Medium risk — review before installing
- `61 – 100` → 🚨 High risk — consider alternatives

---

## How the Risk Score is Calculated

```
Final Risk Score =
  (Conflict Risk      × 0.20) +
  (Behavioral Complexity × 0.20) +
  (Maintainer Risk    × 0.30) +
  (Rollback Difficulty× 0.30)
```

All values are normalized to a 0–100 scale.

---

## Project Structure

```
dependor-patent/
├── bin/
│   └── dependor.js          # CLI entry point (yargs)
├── lib/
│   ├── index.js              # Orchestrates all analyzers
│   ├── conflict-predictor.js # Version & peer conflict detection
│   ├── behavioral-fingerprint.js # Tarball structure analysis
│   ├── alternative-generator.js  # Native code suggestion engine
│   ├── multi-dimensional-scorer.js # Weighted risk scoring
│   └── rollback-simulator.js     # Removal complexity estimator
├── package.json
└── .gitignore
```

---

## Requirements

- **Node.js** >= 18.0.0
- Internet access (fetches live data from the npm registry)

---

## License

MIT © [Bankai11](https://github.com/Bankai11)
