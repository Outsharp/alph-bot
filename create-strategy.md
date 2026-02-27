# How to Create Strategy

This skill helps you write effective STRATEGY.md files for Alph trading bots.

SOUL.md defines who the bot is. STRATEGY.md defines how it thinks. This skill teaches you how to write the thinking.

## Strategy Discoverability

**Coming soon** — The Alph.bot Strategy Registry is under development. The tagging system below is forward-compatible and will be indexed when the directory launches.

Every STRATEGY.md should define tags in a metadata block at the top of the file. These tags allow the strategy to be found, filtered, and recommended in the Alph.bot Strategy Directory — a community-maintained catalog of strategies that users can browse, fork, and deploy.

**Required metadata block** (place at the very top of STRATEGY.md):

```markdown
---
name: "Vanilla Value Hunter"
author: "Joe"
tags: [nba, prediction-markets, polymarket, injury-news, live-betting, value-betting]
market: [prediction-markets]
asset: [nba]
risk_profile: conservative
version: 1
---
```

**Tag guidelines:**
- Use lowercase, hyphenated tags
- Include market type, asset class, specific platform, and edge type
- Add descriptive tags for the core thesis (e.g., `momentum-lag`, `injury-mispricing`, `sentiment-overreaction`)
- `risk_profile` accepts: `conservative`, `moderate`, `aggressive`
- The more specific the tags, the easier it is for other hunters to find and build on your work

When the Strategy Directory launches, users will be able to search by tag, filter by market and risk profile, and see community ratings and performance metrics for published strategies.

## Architecture

A STRATEGY.md has five sections. Each one builds on the last.

### 1. Tools & Skills

What the bot has access to. Data feeds, APIs, execution tools, analysis capabilities. Be specific — list every tool by name and describe when to use it.

The bot can only act on what it can see. This section defines its senses.

**What belongs here:**
- Real-time data APIs (e.g., Shipp NBA play-by-play, odds feeds, injury reports)
- Market execution tools (e.g., Polymarket API, exchange connectors)
- Analysis tools (e.g., statistical models, sentiment scrapers)
- When to use each tool and what to expect back

**Example:**
```markdown
## Tools & Skills

### Data Feeds
- `shipp/nba/play_by_play` — real-time game events, ~250ms latency
- `shipp/nba/odds` — live line movements across books
- `shipp/nba/injuries` — player status changes as they're announced

### Execution
- `polymarket/api` — place and manage positions on prediction markets
- Execution is handled by the execution layer — your job is to surface opportunities with conviction levels

### Analysis
- Statistical models defined in this file
- Historical pattern matching from learning loop outputs
```

### 2. Risk & Bankroll Management

How to stay alive. Position sizing, drawdown limits, Kelly Criterion parameters, and bankroll rules.

This section can reference config values or define them directly. The key principle: the bot should never risk more than it can afford to lose on any single opportunity.

**What belongs here:**
- Bankroll definition (total capital allocated)
- Unit sizing (what constitutes one "unit" — user-defined)
- Kelly Criterion parameters or alternative sizing methods
- Maximum exposure limits (per-opportunity and total)
- Drawdown circuit breakers (when to stop trading)
- Risk-adjusted conviction thresholds

**Example:**
```markdown
## Risk & Bankroll Management

- Bankroll: defined in config
- Unit: 1% of bankroll (adjustable in config)
- Sizing method: fractional Kelly (0.25x Kelly recommended)
- Max single position: 5 units
- Max total exposure: 20 units
- Drawdown breaker: pause trading if bankroll drops 15% in a session
- Minimum conviction to act: 0.65 (adjustable per strategy)
```

### 3. Market & Asset

What you're trading and where. Each Alph instance operates on a specific market or asset. This section scopes the bot's focus.

**What belongs here:**
- Market type (prediction markets, sports betting, crypto, equities)
- Specific asset or event (e.g., NBA game, Bitcoin price contract)
- Platform (e.g., Polymarket, specific exchange)
- Timeframe (real-time, intraday, event-based)
- Market characteristics the bot should be aware of (liquidity, volatility patterns, settlement rules)

**Example:**
```markdown
## Market & Asset

- Market: Prediction markets (Polymarket)
- Asset: NBA game outcomes and player props
- Timeframe: real-time, event-based (pre-game through final whistle)
- Characteristics: Liquidity varies heavily by market size. Popular games have tight spreads. Player props are thinner and slower to adjust — that's where edge lives.
```

### 4. Finding Alpha

This is the heart of the strategy. It combines what you're looking for, how you detect it, how you build conviction, and how you act on it — all in one coherent narrative.

This section should flow naturally from thesis to detection to conviction to action. Don't fragment these ideas into separate sections — they're one continuous thought process.

**What belongs here:**

**Core Thesis** — What market inefficiency are you exploiting? Be specific. "Markets misprice injury news" is better than "find value." Describe the edge hypothesis clearly.

**Signal Detection** — What data points confirm your thesis? Define each signal, its source, how fast it arrives, and what it tells you. Signals should be concrete and measurable.

**Conviction Building** — How do signals combine into a conviction score? Define the model: weighted sum, bayesian updating, ensemble, or custom logic. Set thresholds for surfacing opportunities versus auto-executing.

**Pre-Computed Logic** — Patterns and hypotheses you've figured out ahead of time. When live data matches a pre-computed pattern, you react instantly — no thinking required.

**Reactive Logic** — How you respond to unexpected signals in real-time. Triggers, conditions, and actions. This is the fast cycle.

#### Builder Guidance: How to Help Users Write This Section

This is the section users struggle with most. Don't leave them staring at a blank page. The builder's job is to actively help the user construct their alpha thesis with the least input possible. Ask the right questions, surface relevant ideas, and draft the section collaboratively.

**Step 1: Understand the user's market.** Ask what market they're trading, what asset, and what timeframe. This narrows everything that follows.

**Step 2: Surface ideas from available sources.** Don't wait for the user to come up with a thesis from scratch. Pull from these sources to propose edge hypotheses:

- **Alph.bot Strategy Directory** (community-maintained) — Browse existing strategies tagged for the user's market. Suggest forks or adaptations of proven strategies. If a user is building an NBA strategy, show them what other NBA hunters have built and what's working.
- **TradingView** — Technical analysis ideas, indicator-based strategies, community scripts and published ideas relevant to the user's asset class.
- **Seeking Alpha** — Fundamental analysis, earnings-based theses, sector rotation ideas, contrarian positions with documented reasoning.
- **Research papers and quantitative sources** — Academic edge hypotheses (momentum, mean reversion, sentiment lag) adapted for prediction markets.
- **Platform-specific intelligence** — Polymarket volume patterns, order book dynamics, historical settlement data.

> **Note:** We maintain a running list of approved research sources and skills for alpha generation. Check `references/alpha-sources.md` for the current list. This list grows as the community contributes new sources and the Shipp data catalog expands.

**Step 3: Draft the thesis together.** Once the user picks a direction (or even just says "I want to trade NBA games"), the builder should draft a core thesis, propose 3-5 relevant signals based on available data feeds, and sketch a conviction model. Present this to the user for refinement — not as a finished product, but as a starting point they can shape.

**Step 4: Make it concrete.** Every signal needs a source, a latency tolerance, and a weight. Every pattern needs an expected edge and an action. Push the user toward specificity — vague strategies produce vague results.

**The principle:** The user brings the market intuition. The builder brings the structure, the sources, and the drafting. Together they produce a strategy that's specific, actionable, and ready to hunt.

**Example:**
```markdown
## Finding Alpha

### Core Thesis
NBA prediction markets are slow to price injury news and in-game momentum shifts. The lag between a real-world event and the market adjustment creates a window — usually 30 seconds to 3 minutes — where the true probability has shifted but the price hasn't. That window is alpha.

### Signals
- **Injury status changes**: Player ruled out or downgraded. Source: `shipp/nba/injuries`. Impact: immediate repricing of game outcome. Speed: critical — act within 60 seconds of announcement.
- **Line movement**: Sharp moves on major books before prediction markets adjust. Source: `shipp/nba/odds`. Indicates smart money positioning.
- **Live momentum**: A 12-0 run in under 3 minutes. Source: `shipp/nba/play_by_play`. Live odds lag by 30-90 seconds during runs.
- **Volume spikes**: Sudden increase in prediction market volume without corresponding price movement. Indicates incoming information the market hasn't priced.

### Conviction Model
Weighted sum with decay:
- Injury signal confirmed + market hasn't moved = +0.30 conviction
- Sharp line movement + prediction market lag = +0.25 conviction
- Live momentum shift + odds lag > 30s = +0.20 conviction
- Volume spike without price move = +0.15 conviction
- Conviction decays at 0.05 per minute without new confirming signal
- Surface to execution layer at 0.60 conviction
- Auto-execute (if enabled) at 0.80 conviction

### Pre-Computed Patterns
- Star player ruled out → game outcome shifts 3-7% depending on player impact rating. If market moves < 2%, there's edge.
- Back-to-back road game for favorite → historical underperformance of 2-4%. Check if line reflects this.
- Blowout developing (15+ point lead in Q3) → live player prop markets get thin and mispriced.

### Reactive Logic
- ON injury_news.status_change WHERE player.impact > 0.7 AND market.move < 1%:
  → BOOST conviction +0.30, SURFACE immediately
- ON play_by_play.run WHERE points > 10 AND minutes < 3 AND odds.lag > 30s:
  → BOOST conviction +0.20, SURFACE as live opportunity
- ON odds.sharp_move WHERE prediction_market.lag > 60s:
  → BOOST conviction +0.25, SURFACE with urgency flag
```

### 5. Learning Loop

How the strategy improves over time. This is the slow cycle — after opportunities resolve, analyze what worked and what didn't.

**What belongs here:**
- How often learning runs (per session, daily, weekly)
- What metrics to track (conviction accuracy, speed-to-surface, edge realized, signal contribution)
- What actions to take based on learning (adjust signal weights, prune bad signals, add new hypotheses)
- How to log outcomes for future reference

**Example:**
```markdown
## Learning Loop

- Frequency: after each trading session
- Track:
  - Conviction accuracy: did high conviction = good outcome?
  - Speed-to-surface: how fast did we catch the opportunity?
  - Edge realized: did the predicted edge actually exist?
  - Signal contribution: which signals drove correct predictions?
- Actions:
  - Adjust signal weights based on realized contribution
  - Prune signals that consistently contribute noise
  - Log new patterns observed during session for pre-computation
  - If a signal source degrades in speed or accuracy, flag for review
```

## Writing Principles

When writing a STRATEGY.md, follow these principles:

1. **Be specific.** "Find value in NBA markets" is useless. "NBA prediction markets lag 30-90 seconds behind injury news — exploit that window" is actionable.

2. **Be brief.** The bot reads this file into its context window. Every wasted word is a wasted token. Write like you're paying per character — because you are.

3. **Be concrete.** Define signals with sources, thresholds, and expected behaviors. Define conviction as numbers, not vibes.

4. **Think in two cycles.** Fast cycle: react, build conviction, surface. Slow cycle: learn, adjust, improve. Don't mix them.

5. **Test your thesis.** Before writing a full strategy, articulate the edge hypothesis in one sentence. If you can't, the strategy isn't ready.

The soul stays the same. The strategy evolves.
