#!/usr/bin/env -S yarn exec tsx

import yargs from "yargs";
import { hideBin } from 'yargs/helpers'
import pkg from './package.json' with {type: 'json'}

import 'dotenv/config'

import { AgentAlpha } from "./src/agent-alpha.js";

await main()

async function main() {
  // setup CLI parser

  await yargs()
    .scriptName('agent-alpha')
    .usage('$0 <cmd> [args]')
    .help()
    .epilogue('All args can also be set via environment variables prefixed with AGENT_ALPHA_.\n' +
      'For example, --ai-provider-api-key can be set as AGENT_ALPHA_AI_PROVIDER_API_KEY.\n\n' +
      'Created by https://shipp.ai')
    .alias('help', 'h')
    .strict()
    .recommendCommands()
    .version(pkg.version)
    .env('AGENT_ALPHA')
    .options({
      demo: {
        alias: 'd',
        describe: 'Enable demo credentials and apis',
        type: 'boolean',
        default: false
      },
      paper: {
        alias: 'p',
        describe: "don't execute orders",
        type: 'boolean',
        default: false
      },
      'db-filename': {
        alias: 'f',
        describe: 'sqlite database filename',
        type: 'string',
        default: 'db.sqlite'
      },
    })
    .command('value-bet', 'Value Bet against configured games', {
      'game': {
        describe: 'Game Id',
        type: 'array'
      },
      'event-contract-exchange': {
        describe: 'the exchange(s) to place orders. Only kalshi is supported right now.',
        type: 'array',
        choices: ['kalshi'],
        default: 'kalshi'
      },
      'kalshi-api-key-id': {
        describe: 'Api Key Id',
        type: 'string',
        // required: true,
      },
      'kalshi-private-key-path': {
        describe: 'Private Key for Kalshi',
        type: 'string',
        // required: true,
      },
      'ai-model': {
        describe: 'AI Model Name (should match the api docs for provider)',
        default: 'claude-opus-4-6',
        type: 'string'
      },
      'ai-provider': {
        describe: 'provider for AI services. Right now, only anthropic',
        default: 'anthropic',
        type: 'string',
        choices: ['anthropic']
      },
      'ai-provider-api-key': {
        describe: 'API Key for the AI Provider',
        type: 'string',
        required: true
      },
      'ai-model-temperature': {
        describe: 'temperature setting for the model',
        type: 'number',
        default: 0.2
      },
      'shipp_api_key': {
        describe: 'API Key from Shipp.ai (https://platform.shipp.ai)',
        type: 'string'
      },
      'min-edge-pct': {
        describe: 'Minimum Edge Percentage to execute a trade',
        type: 'number',
        default: 5
      },
      'min-confidence': {
        describe: 'Minimum AI Confidence to rely on analyzing edge',
        type: 'string',
        default: 'medium',
        choices: ['low', 'medium', 'high']
      },
      'kelly-fraction': {
        describe: 'Kelly Criterion position size',
        type: 'number',
        default: '0.25',
      },
      'max-total-exposure-usd': {
        describe: 'Maximum total exposure in USD',
        type: 'number',
        default: 10000,
      },
      'max-position-size-usd': {
        describe: 'Maximum position size in USD',
        type: 'number',
        default: 1000,
      },
      'max-single-market-percent': {
        describe: 'Maximum percentage of exposure in a single market',
        type: 'number',
        default: 20,
      },
      'max-daily-loss-usd': {
        describe: 'Maximum daily loss in USD',
        type: 'number',
        default: 500,
      },
      'max-daily-trades': {
        describe: 'Maximum number of trades per day',
        type: 'number',
        default: 50,
      },
      'min-account-balance-usd': {
        describe: 'Minimum account balance in USD before halting trades',
        type: 'number',
        default: 100,
      },

    }, (argv) => new AgentAlpha(argv).valueBet())
    .command('available-games', 'Get list of available games', {
      'sport': {
        describe: 'Sport / League supported by Shipp',
        default: 'NBA',
        type: 'string',
        choices: ['NBA', 'NFL', 'NCAAFB', 'MLB', 'Soccer']
      }
    }, (argv) => new AgentAlpha(argv).availableGames())
    .parse(hideBin(process.argv))
}
