# Agent α

An intelligent, automated trading bot. 

Trades on Prediction Markets (Polymarket & Kalshi) using sport data
from [Shipp.ai](https://docs.shipp.ai).

> [!warning] This Application involves risking real money. Agent α is intended to be a starting point, and should be verified and tested for your usecase.

## Overview

This bot analyzes live game events, calculates probabilities using Claude AI, identifies mispriced markets, 
and executes trades automatically.

This is an early project, and as of now should only be used as a starting point to integrate [Shipp.ai](https://shipp.ai)

If you're interested in full application using this model, check out [Outsharp](https://apps.apple.com/us/app/outsharp/id6751448529)

### Key Features

- ✅ **Real-time game data** from Shipp.ai (NBA, NFL, MLB, NHL, Soccer)
- ✅ **AI-powered probability estimation** using Claude Opus 4.6
- ✅ **Multi-market support** (Kalshi & Polymarket)
- ✅ **Multiple strategies** (value betting, arbitrage)
- ✅ **Comprehensive risk management** (position limits, circuit breakers)
- ✅ **Paper trading mode** for safe testing
- ✅ **Live dashboard** for real-time monitoring
- ✅ **Complete audit trail** with DuckDB

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
on Kalshi to the integration

### Installation

```bash
# Clone repository
git clone https://gitlab.com/outsharp/shipp/agent-alpha.git
cd agent-alpha

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
vim .env

# Initialize database
yarn run init

# Build the project
yarn run build
```
