# Alph Bot

![Logo](./logo.png)

An intelligent, automated trading bot. 

Trades on Prediction Markets using sport data
from [Shipp.ai](https://docs.shipp.ai).

> [!WARNING] 
> This Application involves risking real money. Alph Bot is intended to be a starting point, and should be verified and tested for your usecase.

## Overview

This bot analyzes live game events, calculates probabilities using Claude AI, identifies mispriced markets, 
and executes trades automatically.

This is an early project, and as of now should only be used as a starting point to integrate [Shipp.ai](https://shipp.ai)

If you're interested in a full application using this model, check out [Outsharp](https://apps.apple.com/us/app/outsharp/id6751448529)

## First-Time Humans

* [Sign up](https://kalshi.com/sign-up) to Kalshi and [Create an API Key](https://alph.bot/posts/kalshi-api-key/)
* Sign up to [Shipp](https://shipp.ai) for 5,000 credits free a day!
* Tell claude `Start running a game!`

### Key Features

- [x]  **Real-time game data** from Shipp.ai (NBA, NFL, MLB, NHL, Soccer)
- [x]  **AI-powered probability estimation** using Claude
- [ ]  **Automated Trading** 
  - [x] kalshi
  - [ ] polymarket
- [ ]  **Multiple strategies** 
  - [x] value betting
  - [ ] arbitrage
- [x] **Risk Management** 
  - [x] Position Limits
  - [x] Circuit Breaker (max loss)
- [x] **Paper trading mode** for safe testing
- [ ] **Live dashboard** for real-time monitoring
- [ ] **Complete audit trail**
  - [ ] Decision w/ why
  - [ ] Searchable
  - [ ] Comprehensive

## 🚀 Quick Start

### Prerequisites

- Node.js 24+
- API keys for:
  - [Shipp.ai](https://shipp.ai) - Real-time sports data
  - [Kalshi](https://kalshi.com) - Prediction market
  - (Coming Soon) [Polymarket](https://polymarket.com) - Prediction market
  - [Anthropic](https://console.anthropic.com) - Claude AI

## Start Trading

```console
# Clone repository
git clone https://github.com/Outsharp/alph-bot.git
cd alph-bot

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
# Don't need all, but keep secrets here
vim .env

yarn
yarn migrate

./index.ts available-games --sport NBA

# select a game you want to bet on
# copy the ID ex: 01KHA58Y81SG3RQD3HZ4X31NYR

./index.ts value-bet -d --game 01KHA58Y81SG3RQD3HZ4X31NYR
```

## Kalshi Demo Account
You can create a [Demo Account](https://help.kalshi.com/account/demo-account)
on Kalshi to the integration. Recommended before trading. 

Data Powered By

<img src="https://platform.shipp.ai/logos/shipp-horizontal-dark.svg" height="96px" width="auto">
