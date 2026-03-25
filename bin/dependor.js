#!/usr/bin/env node

const yargs = require('yargs');
const ora = require('ora');
const chalk = require('chalk');
const { runAnalysis } = require('../lib/index.js');

const argv = yargs
  .command('check <package>', 'Analyze a package for dependency risk', (y) => {
    return y
      .positional('package', {
        describe: 'npm package name to analyze',
        type: 'string',
      });
  })
  .demandCommand(1, 'Use: dependor check <package-name>')
  .help()
  .alias('h', 'help')
  .argv;

async function main() {
  const pkgName = argv.package;
  if (!pkgName || typeof pkgName !== 'string') {
    console.error(chalk.red('Error: package name is required. Use: npx dependor check <package-name>'));
    process.exit(1);
  }

  const spinner = ora(`Analyzing ${chalk.cyan(pkgName)}...`).start();

  try {
    const result = await runAnalysis(pkgName);
    spinner.succeed('Analysis complete');

    console.log(chalk.gray('\n=================================='));
    console.log(chalk.bold('  🔍 DEPENDOR ANALYSIS REPORT\n'));
    console.log(chalk.gray('==================================\n'));
    console.log(chalk.white('Package: ') + chalk.cyan(result.packageName));
    console.log(chalk.white('Conflict Risk: ') + chalk.yellow(result.conflictRisk + '%'));
    console.log(chalk.white('Behavioral Complexity: ') + chalk.yellow(result.behavioralComplexity));
    console.log(chalk.white('Maintainer Risk: ') + chalk.yellow(result.maintainerRisk));
    console.log(chalk.white('Rollback Difficulty: ') + chalk.yellow(result.rollbackDifficulty));
    console.log(chalk.white('\nFinal Risk Score: ') + chalk.bold(result.finalRiskScore + ' / 100\n'));
    if (result.suggestedAlternative) {
      console.log(chalk.white('Suggested Native Alternative:'));
      console.log(chalk.gray(result.suggestedAlternative));
    }
    console.log(chalk.gray('\n==================================\n'));

    process.exit(0);
  } catch (err) {
    spinner.fail('Analysis failed');
    const msg = err && err.message ? err.message : String(err);
    console.error(chalk.red('Error: ' + msg));
    process.exit(1);
  }
}

main();
