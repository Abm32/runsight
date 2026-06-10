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
  .option('mode', {
    type: 'string',
    choices: ['llm', 'heuristic'],
    describe: 'Exploration mode: llm (best understanding, needs API key) or heuristic (free, offline). Prompts if omitted.'
  })
  .option('llm-provider', {
    type: 'string',
    choices: ['openai', 'anthropic'],
    describe: 'LLM provider for vision-guided exploration (implies --mode=llm)'
  })
  .option('model', {
    type: 'string',
    describe: 'Model id (e.g. gpt-4o, gpt-4o-mini, claude-sonnet-4-20250514). Prompts if omitted in llm mode.'
  })
  .option('coverage', {
    type: 'string',
    choices: ['happy', 'full'],
    default: 'happy',
    describe: 'happy = focused demo story (default); full = breadth-first crawl of every page'
  })
  .example('runsight ./my-project', 'Interactive: choose mode/model, then explore + record a demo')
  .example('runsight . --mode=heuristic --no-video', 'Free offline mode, skip video')
  .example('runsight . --llm-provider=openai --model=gpt-4o-mini', 'LLM mode with a cheap vision model')
  .example('runsight . --coverage=full', 'Crawl every reachable page')
  .epilogue('https://github.com/Abm32/runsight')
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
    mode: argv.mode || null,
    llmProvider: argv.llmProvider || null,
    model: argv.model || null,
    coverage: argv.coverage || 'happy'
  };

  try {
    const result = await runSight(options);
    if (result.summary) console.log('\n📋 Summary:', result.summary);
    if (result.screenshots && result.screenshots.length) {
      console.log(`📸 Screenshots: ${result.screenshots.length} captured`);
    }
    if (result.video) console.log(`🎬 Video: ${result.video}`);
    if (result.flow) console.log(`📝 Flow: ${result.flow}`);
    if (result.report) console.log(`📊 Report: ${result.report}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ RunSight failed:', err.message);
    process.exit(1);
  }
}

main();
