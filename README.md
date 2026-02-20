![Logo](./logo.png)

# Alph Bot

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

## How to Use

If you're a human using claude code or agents to build for you, fork the project

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
  - [Polymarket](https://polymarket.com) - Prediction market
  - [Anthropic](https://console.anthropic.com) - Claude AI

## Kalshi Demo Account
You can create a [Demo Account](https://help.kalshi.com/account/demo-account)
on Kalshi to the integration. Recommended before trading. 

### Start Trading

```console
# Clone repository
git clone https://gitlab.com/outsharp/shipp/agent-alpha.git
cd agent-alpha

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
# Don't need all, but keep secrets here
vim .env

yarn migrate

./index.ts available-games --sport NBA

# select a game you want to bet on
# copy the ID ex: 01KHA58Y81SG3RQD3HZ4X31NYR

./index.ts value-bet -d --game 01KHA58Y81SG3RQD3HZ4X31NYR
```

Data Powered By

<img src="https://platform.shipp.ai/logos/shipp-horizontal-dark.svg" height="96px" width="auto">
