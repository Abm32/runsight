#!/usr/bin/env node
'use strict';

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { runSight } = require('./index');

const argv = yargs(hideBin(process.argv))
  .usage('Usage: runsight [projectPath] [options]')
  .positional('projectPath', {
    describe: 'Path to the project directory',
    type: 'string',
    default: '.'
  })
  .option('headless', {
    type: 'boolean',
    default: true,
    describe: 'Run browser in headless mode'
  })
  .option('video', {
    type: 'boolean',
    default: true,
    describe: 'Record session video'
  })
  .option('max-steps', {
    type: 'number',
    default: 15,
    describe: 'Maximum exploration steps'
  })
  .option('llm-provider', {
    type: 'string',
    choices: ['openai', 'anthropic'],
    describe: 'LLM provider for vision-guided exploration'
  })
  .example('runsight ./my-project', 'Explore a project with defaults')
  .example('runsight . --no-video --max-steps=10', 'Skip video, limit to 10 steps')
  .example('runsight . --llm-provider=openai', 'Use GPT-4o for exploration')
  .epilogue('https://github.com/Abm32/KiroVision')
  .help()
  .alias('h', 'help')
  .version()
  .alias('v', 'version')
  .argv;

async function main() {
  const projectPath = argv._[0] || '.';
  const options = {
    projectPath,
    headless: argv.headless,
    video: argv.video,
    maxSteps: argv.maxSteps,
    llmProvider: argv.llmProvider || null
  };

  try {
    const result = await runSight(options);
    if (result.summary) {
      console.log('\n📋 Summary:', result.summary);
    }
    if (result.screenshots && result.screenshots.length) {
      console.log(`📸 Screenshots: ${result.screenshots.length} captured`);
    }
    if (result.video) {
      console.log(`🎬 Video: ${result.video}`);
    }
    if (result.report) {
      console.log(`📊 Report: ${result.report}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ RunSight failed:', err.message);
    process.exit(1);
  }
}

main();
