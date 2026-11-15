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
  .option('voice', {
    type: 'boolean',
    describe: 'Spoken narration via OpenAI text-to-speech (needs OPENAI_API_KEY). On by default in llm mode when the key is set; --no-voice disables'
  })
  .option('music', {
    type: 'string',
    describe: 'Path to a background music file to mix under the demo'
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
    coverage: argv.coverage || 'happy',
    voice: argv.voice,
    music: argv.music || null
  };

  try {
    const result = await runSight(options);
    printHeroSummary(result);
    process.exit(0);
  } catch (err) {
    console.error('❌ RunSight failed:', err.message);
    process.exit(1);
  }
}

/**
 * Print a clear, scannable "here's your demo" block at the end of a run.
 * The video + flow narrative are the hero artifacts — they're what you'd
 * actually share — so they're surfaced first and boxed for visibility.
 * @param {Object} result - return value of runSight()
 */
function printHeroSummary(result) {
  const line = '─'.repeat(56);
  console.log(`\n${line}`);
  console.log('  ✅ Your demo is ready');
  console.log(line);
  if (result.video) console.log(`  🎬 Video      ${result.video}`);
  if (result.flow) console.log(`  📝 Walkthrough ${result.flow}`);
  if (result.screenshots && result.screenshots.length) {
    console.log(`  📸 Screenshots ${result.screenshots.length} captured`);
  }
  if (result.report) console.log(`  📊 Report      ${result.report}`);
  console.log(line);
  if (result.summary) console.log(`  ${result.summary}`);
  console.log(`${line}\n`);
}

main();
