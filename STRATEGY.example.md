---
name: "Kalshi NBA Value Hunter"
author: "alph.bot"
tags: [nba, kalshi, prediction-markets, player-props, injury-mispricing, momentum-lag, live-trading, value-betting, regulated-exchange]
market: [prediction-markets]
asset: [nba]
risk_profile: conservative
version: 1
---

# STRATEGY.md — Kalshi NBA Value Hunter

### Analysis
- Conviction model defined in this file.
- Player prop fair value model: compare Shipp player stat projections against Kalshi contract prices.
- Closing line value tracker: log your entry price versus final pre-game price to measure if you're consistently beating the close.

### Kalshi-Specific Characteristics

**Liquidity is uneven.** Marquee matchups (national TV games, playoff implications) have deep order books and tight spreads. Midweek games between small-market teams are thin — wider spreads, harder to enter and exit. Focus hunting on high-volume games unless you spot a clear mispricing on a thin market worth the spread cost.

**Player props are the newest market.** Kalshi added NBA player props in November 2025 — points, rebounds, assists, three-pointers over/unders. These markets are less mature than game outcomes, which means pricing is less efficient. This is where the easiest edge lives right now.

**Contracts are binary.** You're not betting a spread — you're buying a contract that pays $1.00 if the outcome happens, $0.00 if it doesn't. A contract priced at $0.62 implies a 62% probability. If your model says the true probability is 72%, you have a 10-cent edge on a $0.62 contract. That's significant.

**Live pricing lags during games.** Kalshi's in-game pricing adjusts slower than sportsbook odds during fast-moving game states. Scoring runs, ejections, and injury events create windows where Kalshi prices haven't caught up to reality. This lag is your primary in-game edge.

**Volume is growing fast.** Kalshi's overall market volume grew from ~$2B in 2024 to ~$24B in 2025. NBA markets are a growing segment. More volume means better liquidity over time, but also means the pricing inefficiencies will close as the market matures. Hunt aggressively now.

## Finding Alpha

### Core Thesis

Kalshi's NBA markets are a young, regulated prediction exchange with three exploitable inefficiencies:

1. **Player prop mispricing.** These markets launched recently and are populated by retail participants using gut feel rather than statistical models. A simple projection model based on recent performance, matchup data, and minutes expectations can identify contracts that are mispriced by 5-15 cents.

2. **Information lag on injury news.** When a player's status changes (especially late scratches or game-time decisions), sportsbooks reprice in seconds. Kalshi's game outcome and player prop markets take minutes. The window between announcement and Kalshi repricing is alpha.

3. **In-game momentum lag.** During live games, Kalshi's contract prices adjust slower than real-time game state warrants. A 15-0 run in the third quarter should dramatically shift win probability, but Kalshi prices drift rather than jump. If you see it in the play-by-play before Kalshi prices it, you're first.

### Signals

**Player prop fair value gap** — Compare projected player stat line (based on season averages, recent trend, matchup, and minutes projection) against Kalshi contract price. If the gap between your projected probability and Kalshi's implied probability exceeds 8 cents, there's a trade. Source: `shipp/nba/player_stats` + `kalshi/api` for current prices. Speed: pre-game, update 30 minutes before tip.

**Injury status change** — Player moves from probable → questionable, questionable → out, or surprise late scratch. Cross-reference against player impact rating. If the player is high-impact (top-3 on their team in usage or minutes) and Kalshi hasn't repriced game outcome or related player props within 90 seconds, there's a window. Source: `shipp/nba/injuries`. Speed: act within 60 seconds.

**Sharp line divergence** — Sportsbook lines move sharply (>1.5 points on spread, >3 points on total) while Kalshi game outcome contracts remain flat. Sharp money has information Kalshi hasn't absorbed. Source: `shipp/nba/odds` cross-referenced with `kalshi/api`. Speed: act within 90 seconds of detecting divergence.

**Live momentum shift** — Scoring run of 10+ points in under 3 minutes during a live game. Check Kalshi's live game outcome contract — if the price hasn't moved proportionally to the expected win probability shift, there's edge. Source: `shipp/nba/play_by_play` + `kalshi/api` live prices. Speed: act within 30 seconds.

**Spread-price misalignment** — Kalshi offers both game outcome (moneyline) and spread contracts. Sometimes these are internally inconsistent — the implied probability from the spread contract doesn't match the moneyline contract for the same game. When they diverge by more than 5 cents, one of them is wrong. Source: `kalshi/api` (compare related contracts). Speed: pre-game scan, update hourly.

### Conviction Model

Additive weighted model with time decay.

| Signal | Conviction Boost | Conditions |
|---|---|---|
| Player prop fair value gap ≥ 8¢ | +0.30 | Model projects probability differs from Kalshi price by ≥ $0.08 |
| Player prop fair value gap ≥ 12¢ | +0.40 | Strong mispricing — increase weight |
| Injury status change | +0.30 | Player impact > 0.6, Kalshi adjustment < 50% of expected within 90s |
| Sharp line divergence | +0.25 | Book line moves > 1.5pts, Kalshi game outcome flat for > 60s |
| Live momentum shift | +0.20 | Run > 10pts in < 3min, Kalshi price lag > $0.03 from expected |
| Spread-price misalignment | +0.15 | Internal Kalshi contract divergence > $0.05 |
| Multiple signals aligned | +0.10 bonus | Two or more signals confirm same direction |

Decay: conviction drops 0.05 per minute without new confirming signal. Player prop conviction decays slower (0.03/min) because those markets adjust slower.

Surface to user at 0.55 with context. Recommend action at 0.65. Flag as high conviction at 0.80.

### Pre-Computed Patterns

Build these before tip-off. When live data confirms, react instantly.

**Player props:**
- Player averaging 25+ PPG, facing bottom-5 defense, Kalshi "over" priced below $0.55 → likely mispriced. Check minutes projection and recent trend to confirm.
- Player on back-to-back, averaging 30+ MPG, Kalshi "over" priced above $0.55 → likely overpriced. Minutes restriction expected.
- Player returning from 3+ game absence, Kalshi props set near season average → likely overpriced. First game back typically underperforms by 15-25%.

**Game outcomes:**
- Star player (top-3 in team usage) ruled out within 2 hours of tip → game outcome should shift 3-7%. If Kalshi moves < 2%, edge exists on both game outcome and player prop markets.
- Back-to-back road game for favorite, opponent well-rested → historical underperformance of 2-4%. If Kalshi doesn't reflect rest differential, there's value on the underdog.
- Team on 7+ game win streak, heavy public favorite on Kalshi → look for overpricing. Public money inflates streaking teams beyond fair value.

**In-game:**
- Blowout developing (20+ point lead entering Q4) → starters sit. Player prop "over" contracts for starters on the leading team become overpriced. Player props for bench players on trailing team may become underpriced if they get extended run.
- Star player picks up 4th foul before halftime → minutes projection drops significantly. If Kalshi prop price doesn't adjust, sell the "over."

### Reactive Logic

```
ON injury_news.status_change
  WHERE player.impact > 0.6
  AND kalshi.game_outcome.price_change < expected * 0.5
  AND time_since_announcement < 90s
  → BOOST conviction +0.30
  → SURFACE game outcome AND related player prop opportunities
  → URGENCY: high
  → NOTE: check both sides — the injured player's prop "over" is now overpriced, opposing players may see usage boost

ON odds.sharp_move
  WHERE book_line.delta > 1.5
  AND kalshi.game_outcome.delta < $0.02
  AND time_since_move < 300s
  → BOOST conviction +0.25
  → SURFACE with sportsbook vs Kalshi comparison
  → URGENCY: high

ON play_by_play.scoring_run
  WHERE run.points > 10
  AND run.duration_minutes < 3
  AND kalshi.live_price.lag > $0.03 from expected_probability
  → BOOST conviction +0.20
  → SURFACE as live game outcome opportunity
  → URGENCY: immediate

ON player_stats.projection_update
  WHERE abs(projected_probability - kalshi.prop_price) > $0.08
  AND game.time_to_tip < 30min
  → BOOST conviction +0.30
  → SURFACE player prop opportunity with projection detail
  → URGENCY: standard (pre-game)

ON kalshi.internal_divergence
  WHERE abs(moneyline_implied - spread_implied) > $0.05
  → BOOST conviction +0.15
  → SURFACE misalignment with both contract prices
  → URGENCY: standard
  → NOTE: buy the underpriced side, consider selling the overpriced side if you hold it
```

## Learning Loop

After each game, run the slow cycle.

**Frequency:** end of each game day.

**Track:**
- Conviction accuracy — did opportunities above 0.65 conviction resolve profitably?
- Speed-to-surface — seconds between signal firing and opportunity surfaced. Target: < 30s for in-game, < 60s for injury, < 5min for pre-game props.
- Edge realized — was the predicted mispricing real? Did the Kalshi price eventually move to where your model predicted?
- Closing line value — was your entry price better than the final pre-game price? Consistently beating the close is the strongest indicator of real edge.
- Signal contribution — which signals drove winning predictions? Which contributed noise?
- Spread cost — how much edge did bid-ask spreads eat? Track effective edge (gross edge minus spread cost and fees).

**Actions:**
- Adjust signal weights based on realized contribution over rolling 30-game window.
- If player prop fair value model consistently overestimates or underestimates, recalibrate projection methodology.
- Prune pre-computed patterns that fail to produce edge over 20+ observations.
- Track which game types (national TV, division rivalry, back-to-back) produce the most consistent edge.
- Log every opportunity: entry price, exit/settlement, conviction at entry, signals that fired, time-to-market-correction, spread cost, fees. This log is how you evolve.
- As Kalshi's NBA markets mature and liquidity deepens, expect pricing inefficiencies to shrink. The learning loop should flag when historical edges are closing so you can shift focus.

**The rule:** fast cycle hunts. Slow cycle sharpens the hunter.

---

*This is the vanilla Kalshi NBA strategy. Fork it. Sharpen the player prop model. Add your own pre-computed patterns. Teach Alph how you see the game. The soul stays the same. The strategy evolves.*
