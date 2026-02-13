# Agent α

An intelligent, automated trading bot. 

Trades on Prediction Markets using sport data
from [Shipp.ai](https://docs.shipp.ai).

> [!warning] This Application involves risking real money. Agent α is intended to be a starting point, and should be verified and tested for your usecase.

## Overview

This bot analyzes live game events, calculates probabilities using Claude AI, identifies mispriced markets, 
and executes trades automatically.

This is an early project, and as of now should only be used as a starting point to integrate [Shipp.ai](https://shipp.ai)

If you're interested in a full application using this model, check out [Outsharp](https://apps.apple.com/us/app/outsharp/id6751448529)

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

```bash
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

<div style="cursor: pointer; padding: 12px; border-radius: 4px; background-color: #0b0b0f; display: flex; align-items: center; justify-content: center; gap: 12px; font-family: var(--md-text-font-family, sans-serif); line-height: 1.5;" onclick="()=>window.open('https://shipp.ai', '_blank').focus()">
  
  <span style="font-size: 16px; font-weight: 500; color: #fafafa; opacity: 0.8;">
    Data powered by
  </span>

  <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
    <picture>
      <img 
        src="https://platform.shipp.staging.shippyard-labs.com/logos/shipp-horizontal-dark.svg" 
        alt="Shipp" 
        style="height: 28px; width: auto; display: block;" 
      />
    </picture>

    <span style="
      font-size: 11px; 
      font-weight: 700; 
      text-transform: uppercase; 
      letter-spacing: 0.05em; 
      padding: 2px 8px; 
      border-radius: 12px; 
      background-color: #c026d3; 
      color: #ffffff;
      display: inline-flex;
      align-items: center;
      height: fit-content;
    ">
      Beta
    </span>
  </div>
</div>
