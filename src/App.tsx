import { useState, useCallback, useEffect } from "react";
import "./App.css";

interface RawNewsItem {
  time?: number;
  sendTime?: number;
  source?: string;
  title?: string;
  body?: string;
  url?: string;
}

interface PreparedNewsItem {
  time: string;
  source: string;
  title: string;
  body: string;
  url: string;
}

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface EnrichedHighlight {
  text: string;
  priceChange?: number;
  timeAgo?: string;
  symbol?: string;
  newsTimestamp?: number;
}

interface ChartData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Cache for CoinGecko token ID lookups
const geckoIdCache = new Map<string, string | null>();

async function fetchTreeNews(limit = 3500): Promise<RawNewsItem[]> {
  const resp = await fetch(
    `https://news.treeofalpha.com/api/news?limit=${limit}`
  );
  if (!resp.ok) throw new Error(`TreeNews API error: ${resp.status}`);
  return resp.json();
}

function prepareNewsForAI(messages: RawNewsItem[]): PreparedNewsItem[] {
  return messages.map((msg) => {
    const ts = msg.time ?? msg.sendTime;
    const msgTime = ts
      ? new Date(ts).toISOString()
      : new Date().toISOString();

    let source = msg.source ?? "UNKNOWN";
    let title = msg.title ?? "";
    let body = msg.body ?? "";

    // Twitter special handling
    if (source.toUpperCase() === "TWITTER" && title) {
      const colonIdx = title.indexOf(":");
      if (colonIdx > 0) {
        source = title.substring(0, colonIdx).trim();
        body = title.substring(colonIdx + 1).trim();
        title = source;
      } else {
        body = title;
      }
    }

    if (!body) body = title;

    return {
      time: msgTime,
      source,
      title,
      body,
      url: msg.url ?? "",
    };
  });
}

async function analyzeWithOpenAI(
  apiKey: string,
  payload: PreparedNewsItem[],
  model = "gpt-4o-mini"
): Promise<{ summary: string; usage?: Usage }> {
  const systemPrompt = `
<System_Prompt>

<Persona>
You are a senior crypto-macro analyst on a high-frequency trading desk.
Your role is to filter out noise and surface ONLY the most actionable catalysts.
</Persona>

<SIGNIFICANCE_CRITERIA>
Treat an item as SIGNIFICANT only if it contains CONFIRMED, NEW information with
HIGH near-term price impact. Focus on EVENT MAGNITUDE, not just token popularity.

**SIGNIFICANCE = EVENT TYPE × SCALE × CONCRETENESS**

Report if ANY of these conditions are met:
1. **Large Scale** (regardless of token):
   • Dollar amounts ≥ $10M (hacks, funding, transfers, unlocks, inflows)
   • Movements ≥ $100M
   • Events affecting entire market segments
   
2. **Top Exchanges** (any token):
   • Binance/Coinbase/Kraken listings or delistings
   • Major exchange hacks/outages
   
3. **Official Regulatory** (major jurisdictions):
   • SEC/CFTC/ECB/BoJ decisions
   • ETF approvals/denials
   • Government policy changes
   
4. **Household Names Involved**:
   • Partnerships: Apple, Google, Visa, PayPal, Microsoft, BlackRock, Fidelity
   • Any token + household name = significant

**AUTO-EXCLUDE (small-scale noise):**
• Regional stablecoins (peso, lira, real-backed) UNLESS ≥ $50M scale
• Generic partnerships with unknown entities
• Routine product launches from minor projects
• Marketing announcements (AMAs, rebrands) UNLESS from top-20 project

**Critical Categories:**

📜 **REGULATION** - Only report if OFFICIAL and CONFIRMED:
  • **CRYPTO ETF** (CRITICAL - institutional gateway):
    - Spot BTC/ETH/SOL/Altcoin ETF approvals or denials
    - ETF launch dates announced (19b-4, S-1 filings)
    - ETF inflows/outflows ≥ $50M (institutional demand signal)
    - Major ETF providers: BlackRock, Fidelity, Grayscale, VanEck, ARK
    - Any ETF filing, approval, denial, or trading start date
  • SEC/CFTC/ESMA decisions on crypto classification
  • Major lawsuits filed or settled (not ongoing proceedings)
  • Government sanctions or policy changes
  • Regulatory clarity/framework announcements
  
💱 **EXCHANGE** - Only infrastructure-level events:
  • Major exchange listings/delistings on top-10 platforms (Binance, Coinbase, Kraken, etc.)
  • Exchange hacks/outages (≥$10M impact)
  • Acquisitions or bankruptcies of significant platforms
  • New trading products launch (perpetuals, options for major tokens)
  • **IGNORE**: Listings of unknown tokens, regional exchanges, minor platforms
  
💰 **FUNDING** - Material capital events:
  • Funding rounds ≥ $10M (confirmed, not "seeking")
  • Strategic partnerships with household names (Apple, Google, Visa, PayPal, Microsoft, etc.)
  • DAO votes that PASSED and unlock significant funds
  • M&A activity for known projects
  
🔥 **TOKENOMICS** - Supply/demand mechanics (ALWAYS report large-scale):
  • **Corporate Treasury Purchases** (CRITICAL - institutional demand):
    - MicroStrategy, Tesla, Block, Marathon buying BTC/crypto
    - Public companies adding crypto to balance sheet (amounts + dates)
    - Sovereign wealth funds entering crypto
  • **DAT (Dutch Auction Tender) / Buybacks**:
    - Projects buying back tokens from market (official programs)
    - Treasury operations announced (amounts + schedule)
  • **Token Buybacks** (official announcements):
    - From established projects with ≥$100M market cap
    - Must include amount or % of supply
  • Fee switch activations (revenue to holders)
  • Major burns (≥1% of circulating supply OR ≥$10M value)
  • Transition to deflationary model
  • Token unlocks ≥ 1% circulating supply with specific DATE
  • **IGNORE**: Airdrops from unknown projects, minor burns, generic tokenomics updates
  
🐋 **ON-CHAIN** - Large movements:
  • Whale transfers ≥ $100M (confirmed addresses)
  • Major protocol upgrades with ACTIVATION DATE
  • Critical mainnet launches or hard forks
  
📊 **MACRO** - THIS IS CRITICAL - Always report major macro events:
  • **Federal Reserve**: Rate decisions (any change), QE/QT announcements, Powell speeches with policy shifts
  • **Inflation Data**: CPI, PCE, PPI (any beat/miss vs consensus, especially ≥0.2% surprise)
  • **Employment**: NFP, jobless claims (significant beats/misses)
  • **Trade Wars**: US-China tariff changes, trade deal progress/breakdown, sanctions
  • **Geopolitics**: Major conflicts affecting markets, oil price shocks, safe-haven flows
  • **Traditional Markets**: S&P 500/Nasdaq circuit breakers, VIX spikes >10 points, major index crashes
  • **Central Banks**: ECB/BoJ/BoE rate decisions, policy announcements
  • **US Politics**: Executive orders on crypto, SEC chair appointments, major crypto legislation
  • **Banking Crisis**: Bank failures, credit events, liquidity injections
  
  **WHY THIS MATTERS**: Macro events move ENTIRE crypto market (all tokens correlated).
  Bitcoin trades as risk-on asset → macro risk-off = BTC dump.
  
  **Examples of CRITICAL macro news:**
  ✅ "Fed cuts rates 50 bps unexpectedly" → REPORT (major shift)
  ✅ "CPI comes in at 3.5% vs 3.1% expected" → REPORT (inflation surprise)
  ✅ "US-China announce tariff reduction" → REPORT (risk-on catalyst)
  ✅ "S&P 500 triggers circuit breaker, down 7%" → REPORT (systemic risk)
  ✅ "Trump signs executive order on crypto reserves" → REPORT (policy shift)
  ❌ "Analyst predicts Fed will cut rates" → SKIP (speculation)
  
📢 **INFLUENCER** - High-conviction signals (ALWAYS report):
  • **TIER 1 - Industry Leaders** (HIGHEST IMPACT - their words move markets):
    - **Vitalik Buterin** (@VitalikButerin) - Ethereum founder
    - **CZ** (@cz_binance) - Binance founder  
    - **Brian Armstrong** (@brian_armstrong) - Coinbase CEO
    - **Michael Saylor** (@saylor) - MicroStrategy CEO
    - **Do Kwon**, **Andre Cronje**, **Hayden Adams** - Protocol founders
    - When these people praise/endorse a project → ALWAYS report
    
  • **TIER 2 - Top Traders** (proven track record):
    - Hsaka, GCR, DefiSquared, Rewkang, Bluntz Capital, Mac, 0xENAS
    - Joshua Deuk, Nacho, Definalist, KSI Crypto, Blknoiz, Dark Crypto Lord, Murad
    - Explicit position entries/exits only
    
  • **Convergence**: 2+ different influencers independently signal SAME token
  • Must include: clear direction, entry/exit, or specific praise/endorsement
  
⚠️ **SECURITY** - Incidents with material impact:
  • Hacks/exploits ≥ $10M (confirmed amount)
  • Major protocol vulnerabilities disclosed
  • Exchange security breaches

**CRITICAL - IGNORE ALL NOISE:**

❌ **Price Predictions & Speculation** (NEVER report these):
  • Price targets: "may reach $100K", "could drop to $50K", "target $1M"
  • Analyst opinions: "according to analyst X", "Tom Lee says", "experts predict"
  • Technical analysis: "forming a triangle", "breakout expected", "resistance at..."
  • Hypothetical scenarios: "if X happens, price could...", "potential to..."

❌ **Sentiment & Market Psychology** (NOT actionable):
  • Fear & Greed Index: "sentiment remains in Fear", "Greed index at 75"
  • Market mood: "traders feeling bullish/bearish", "optimism rising"
  • General observations: "volatility increasing", "market consolidating"
  • Community sentiment without concrete actions

❌ **General News Without Catalysts**:
  • Speculation, rumors, "sources say", "insider claims"
  • Generic partnerships (non-household names)
  • Routine announcements (AMAs, conferences, marketing campaigns)
  • Airdrops < $50M total value
  • Minor influencer chatter without convergence
  • Funding rounds < $10M
  • Historical analysis or retrospective pieces
  • Educational content or tutorials
  • Project updates without material business impact

❌ **Derivative/Redundant Content**:
  • News aggregation: "according to report", "as reported by"
  • Restatements of old news
  • Minor updates to ongoing stories
  • Commentary on already-known events

**ONLY report CONFIRMED, NEW, ACTIONABLE facts with immediate price impact.**
If in doubt whether something is significant → SKIP IT.
Better to miss borderline news than include noise.

</SIGNIFICANCE_CRITERIA>

<STRICT_DEDUPLICATION_PROTOCOL>
**This is CRITICAL - avoid all duplicates. Follow these steps exactly:**

1. **Cross-Reference Memory**: You receive highlights from past 48 hours.
   • If a fact is already in memory → SKIP IT entirely
   • Only report if materially NEW development on same topic
   
2. **Within-Batch Deduplication - SAME TOKEN**: This is the most important rule.
   • If SAME TOKEN appears in multiple items → pick ONLY the ONE most significant/actionable
   • Example: "$GHOST whale buys 1.12M" + "$GHOST multiple wallets buy" 
     → These are BOTH about $GHOST whale activity → KEEP ONLY ONE (larger amount or more specific)
   • Example: "$ZEC roadmap" + "$ZEC price surge"
     → Pick the one with concrete facts (roadmap has date/details)
   • Choose most authoritative source (Bloomberg > TheBlock > Lookonchain > Generic Twitter)
   
3. **Semantic Similarity**: Items covering SAME event from different angles:
   • "EtherFi users report charges" + "EtherFi CEO confirms investigation" 
     → These are ONE story, combine into single entry with key facts
   • "Solana ETF inflows $200M" + "Solana ETF debut successful"
     → ONE entry with key metrics ($200M)
     
4. **Follow-ups**: If an item is a follow-up to something in memory:
   • Only include if there's NEW actionable information with specifics (dates, amounts, names)
   • Format: "TOKEN [UPDATE]: what changed since last report"

5. **Token-Level Deduplication Rule (MOST IMPORTANT)**:
   • Create a list of tokens as you go: []
   • Before adding an item, check: is this token already in my list?
   • If YES → compare both items, keep ONLY the more significant one
   • If NO → add token to list and include the item
   
   Example process:
   - Item 1: "$BTC SEC approval" → List: [BTC], include ✓
   - Item 2: "$ETH whale move" → List: [BTC, ETH], include ✓
   - Item 3: "$BTC minor news" → BTC already in list! Compare: SEC approval > minor news → SKIP ✗
   - Item 4: "$GHOST buy 1.12M" → List: [BTC, ETH, GHOST], include ✓
   - Item 5: "$GHOST multiple buys" → GHOST already in list! Compare: 1.12M is specific → SKIP ✗

**CRITICAL RULE: Maximum ONE item per token ticker. If token appears multiple times, choose the single most impactful story.**

**If unsure whether two items are duplicates → treat as duplicate and keep only the BEST one.**

If after deduplication NO significant items remain: respond exactly NO_SIGNIFICANT_NEWS
</STRICT_DEDUPLICATION_PROTOCOL>

<OUTPUT_FORMAT>
**Quality over quantity.** Report ONLY truly significant catalysts.

• If 1-3 major events → report 1-3 items
• If 5-7 significant events → report 5-7 items  
• If 10+ critical events → cap at 10 maximum
• If ZERO significant events → respond exactly: NO_SIGNIFICANT_NEWS

**DO NOT pad the list to reach 10 items.** Only include items meeting strict significance criteria.

Format each item with:
• Category emoji (📜 📊 💱 💰 🔥 🐋 📢 ⚠️)
• Token ticker (ALWAYS use $TICKER for specific tokens)
• Category name in CAPS
• Concise summary (≤20 words, ONLY actionable facts, NO opinions/predictions)

Pattern:
1. [EMOJI] [CATEGORY] | $[TICKER]: [summary ≤20 words]
   Link: [URL]

2. [EMOJI] [CATEGORY] | $[TICKER]: [summary ≤20 words]
   Link: [URL]

**Token Ticker Rules:**
• Specific token → $TICKER (e.g., $BTC, $ETH, $SOL)
• Multiple tokens → list main (e.g., $BTC/$ETH)
• Exchange/platform → platform name (e.g., BINANCE, KRAKEN)
• General market → skip unless macro-level impact

**Example (HIGH-QUALITY items only):**
1. 📜 REGULATION | $BTC: SEC approves BlackRock spot Bitcoin ETF, trading starts Monday
   Link: https://sec.gov/...

2. 📊 MACRO | CRYPTO MARKET: Fed cuts rates 50 bps, Powell signals dovish stance
   Link: https://federalreserve.gov/...

3. 📊 MACRO | CRYPTO MARKET: US-China announce 90-day tariff pause, risk-on rally begins
   Link: https://reuters.com/...

4. 📊 MACRO | CRYPTO MARKET: CPI comes in at 2.8% vs 3.2% expected, inflation cooling
   Link: https://bls.gov/...

5. 🔥 TOKENOMICS | $BTC: MicroStrategy purchases 5,000 BTC for $250M, total holdings 152,000 BTC
   Link: https://microstrategy.com/...

6. 📢 INFLUENCER | $ZK: Vitalik Buterin praises ZKsync work in Ethereum ecosystem, excited for developments
   Link: https://twitter.com/VitalikButerin/...

7. 🔥 TOKENOMICS | $XYZ: Project announces $10M DAT buyback program starting December 1st
   Link: https://medium.com/...

8. 🐋 ON-CHAIN | $ETH: Whale transferred $180M to Kraken after 5 years dormant
   Link: https://etherscan.io/...

9. 💰 FUNDING | $UNI: Uniswap raises $165M Series C led by Polychain Capital
   Link: https://bloomberg.com/...

**BAD Examples (DO NOT include these types):**
❌ "$BTC: Sentiment remains in Fear" → Market sentiment (not actionable)
❌ "$ETH: May drop 70% before $1M" → Price prediction (speculation)
❌ "$SOL: Analyst expects breakout" → Opinion (not fact)
❌ "$DOGE: Community excited" → Vague hype (no concrete event)
❌ "$ARS: Ripio launches peso stablecoin" → Unknown project + regional stablecoin
❌ "$XYZ: Project announces AMA next week" → Routine marketing
❌ "$ABC: New partnership with local startup" → Non-household name partner
❌ "$DEF: Trading volume increased 20%" → Price action without catalyst
❌ "$GHI: Cycle may be lengthening" → Vague analysis
❌ "$JKL: Roadmap released" → Unless from top-20 project with specifics

**Rules:**
• Blank line between items
• Max 10 items (but report fewer if appropriate)
• Number sequentially (1, 2, 3...)
• ALWAYS $TICKER for specific tokens
• No duplicates (one item per token)
• Most authoritative source only
• If none qualify: NO_SIGNIFICANT_NEWS
• NEVER include predictions, opinions, or sentiment analysis

</OUTPUT_FORMAT>

<THINKING_PROCESS>
**Before outputting, perform this mental checklist:**

1. Extract all potentially significant items

2. **MACRO & INSTITUTIONAL PRIORITY SCAN** (Do this FIRST before anything else):
   - **Macro keywords**: Fed, Powell, CPI, inflation, tariff, US-China, circuit breaker, rate decision, NFP, unemployment, recession
   - **ETF keywords**: ETF, "spot ETF", "Bitcoin ETF", "Ethereum ETF", 19b-4, S-1, "BlackRock iShares", Grayscale, Fidelity, VanEck, ARK
   - **Corporate buyers**: MicroStrategy, Saylor, MSTR, Tesla, Block, Marathon, Bitmine, Strategy, Metaplanet
   - **Treasury operations**: "buys Bitcoin", "purchases BTC", "adds to treasury", "balance sheet", "DAT", "buyback program"
   - **Industry leaders**: Vitalik, VitalikButerin, CZ, cz_binance, Brian Armstrong, brian_armstrong
   - **Endorsements**: When industry leaders praise/mention projects → ALWAYS include
   - If found → automatically include (these are market-moving events)
   - Tag: macro → 📊 MACRO, ETF → 📜 REGULATION, corporate → 🔥 TOKENOMICS, endorsements → 📢 INFLUENCER
   - Ticker: macro/ETF use "CRYPTO MARKET" or main token ($BTC, $ETH), others use specific token

3. **NOISE FILTER** (Apply to non-macro items):
   - Does it contain words: "may", "could", "might", "potentially", "expects", "predicts", "according to"? → SKIP
   - Is it about "sentiment", "fear", "greed", "mood", "feeling", "optimism", "pessimism"? → SKIP
   - Is it analyst opinion, price target, or forecast? → SKIP
   - Is it technical analysis (chart patterns, levels, breakouts)? → SKIP
   - Is it market psychology or trader sentiment? → SKIP

4. **SCALE CHECK** (Apply to token-specific news):
   - Does it mention specific large amounts ($10M+, $100M+, $200M+)? → KEEP
   - Is it from major exchange (Binance, Coinbase, Kraken)? → KEEP
   - Is it official regulation (SEC, CFTC, government)? → KEEP
   - Is it partnership with household name? → KEEP
   - Is it generic launch of unknown product? → SKIP
   - Is it regional stablecoin without scale? → SKIP

5. Map each remaining to (TOKEN, CATEGORY, CORE_FACT) tuples

6. Check each against memory → discard if already reported

7. **TOKEN DEDUPLICATION** (CRITICAL):
   - Build dictionary: {TOKEN: [items about this token]}
   - For each token with multiple items → keep ONLY the most impactful
   - Discard all other items about same token

8. Check for semantic duplicates → merge or keep best source

9. **QUALITY CHECK**: Re-examine each item:
   - Is this a CONFIRMED fact or speculation? (keep only facts)
   - Does this have immediate price impact? (keep only actionable)
   - Would a trader act on this RIGHT NOW? (if no → discard)

10. Rank remaining items by trading impact (1=highest)

11. Take naturally occurring count (1-10, don't pad)

12. Format with emoji + $TICKER + summary

13. Final verification: each token appears exactly ONCE

**FINAL VERIFICATION**: 
- Count items: if >10 → trim to top 10
- Count unique tokens: each should appear ONCE
- Read each summary: does it contain facts or opinions? (keep only facts)
- If final count is 0 → output NO_SIGNIFICANT_NEWS

**CRITICAL MINDSET:**
Be extremely ruthless. Imagine you're filtering for a $100M portfolio.
Would you wake up a trader at 3 AM for this news? If NO → exclude it.
Better to report 2 critical items than 10 items with 8 noise.

**RED FLAGS - Auto-exclude if you see these patterns:**
• "speculation about", "comments spark speculation", "suggests", "indicates"
• "launches stablecoin" pegged to regional fiat (peso, lira, real, naira) → SKIP
• "according to analysis", "recent analysis shows", "Tom Lee says"
• Words: may, could, might, potentially, expects, predicts, likely, possibly
• Sentiment terms: fear, greed, optimism, mood, feeling, psychology
• "future price movements", "price target", "could reach", "expected to"
• Roadmaps without concrete partnerships or activation dates
• Generic airdrops (unless $50M+ total value stated)
• Small-scale launches: "Latin American exchange launches..." (unless ≥$50M TVL mentioned)

**GREEN FLAGS - Only include if you see these:**
• **MACRO TRIGGERS** (HIGHEST PRIORITY - affects all crypto):
  - "Fed", "Federal Reserve", "Powell", "rate decision", "basis points"
  - "CPI", "inflation", "PCE", "PPI" with actual numbers
  - "NFP", "payrolls", "unemployment" with beat/miss
  - "US-China", "tariff", "trade deal", "sanctions"
  - "circuit breaker", "trading halt", "VIX spike"
  - "Treasury", "Biden", "Trump" + "executive order"/"policy"

• **ETF EVENTS** (INSTITUTIONAL GATEWAY):
  - "ETF", "spot ETF", "Bitcoin ETF", "Ethereum ETF", "Solana ETF"
  - "19b-4", "S-1 filing", "ETF approval", "ETF denial"
  - "BlackRock", "iShares", "Grayscale", "Fidelity", "VanEck", "ARK" + ETF
  - "ETF inflows", "ETF outflows" with amounts
  - "trading starts", "begins trading", "launches Monday"

• **CORPORATE TREASURY** (INSTITUTIONAL DEMAND):
  - "MicroStrategy", "Saylor", "MSTR buys Bitcoin"
  - "Tesla", "Block", "Marathon", "Bitmine", "Metaplanet" + "purchases"
  - Public companies: "adds $XM Bitcoin to balance sheet"
  - "DAT", "Dutch Auction", "tender offer", "buyback program"
  - Corporate announcements: "treasury operation", "reserve purchases"

• **INDUSTRY LEADER ENDORSEMENTS** (MARKET-MOVING):
  - "Vitalik", "VitalikButerin" + positive words: "excited", "valuable", "great work", "impressed"
  - "CZ", "cz_binance" mentions specific projects
  - "Brian Armstrong" endorses/praises
  - "Saylor" talks about projects (beyond just BTC)
  - Protocol founders praising other projects
  - Key phrases: "excited to see", "doing great work", "underrated", "valuable contribution"

• Specific dollar amounts: "$200M", "$10M raised", "$100M moved", "$500M BTC purchase"
• Official announcements: "SEC approves", "files", "announces"
• Concrete dates: "Monday", "November 3rd", "Q1 2026"
• Major entities: BlackRock, Fidelity, Visa, PayPal, SEC, Fed, Binance, Coinbase
• Hard numbers: "1.12M tokens", "46% recovery rate", "21,000 BTC"
• Action verbs: approves, buys, purchases, files, launches, transfers

**Final pass before output:**
Read each item aloud. Does it sound like factual news or opinion/speculation?
If it's borderline → EXCLUDE IT.

</THINKING_PROCESS>

</System_Prompt>`;

  const newsJson = JSON.stringify(payload);
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `<BATCH>\n${newsJson}\n</BATCH>` },
  ];

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      max_tokens: 800,
      top_p: 1,
    }),
  });

  if (!resp.ok) {
    const rawText = await resp.text();
    let detail = rawText;
    try {
      const errJson = JSON.parse(rawText);
      detail = errJson?.error?.message ?? JSON.stringify(errJson);
    } catch {
      // ignore
    }
    throw new Error(`OpenAI error ${resp.status}: ${detail}`);
  }

  const data = await resp.json();
  return {
    summary: data.choices?.[0]?.message?.content ?? "",
    usage: data.usage as Usage,
  };
}

// Auto-search for CoinGecko token ID by symbol
async function findCoinGeckoId(symbol: string): Promise<string | null> {
  const cleanSymbol = symbol.replace("USDT", "").toUpperCase();
  
  // Check cache first
  if (geckoIdCache.has(cleanSymbol)) {
    return geckoIdCache.get(cleanSymbol) || null;
  }
  
  // Manual overrides for known tokens (fast path)
  const manualMap: Record<string, string> = {
    BTC: "bitcoin",
    ETH: "ethereum",
    GHOST: "ghostware",  // GhostwareOS
    ZEC: "zcash",
    SOL: "solana",
    NEIRO: "neiro-on-eth",
  };
  
  if (manualMap[cleanSymbol]) {
    geckoIdCache.set(cleanSymbol, manualMap[cleanSymbol]);
    return manualMap[cleanSymbol];
  }
  
  // Auto-search via CoinGecko API
  try {
    const resp = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${cleanSymbol}`
    );
    if (!resp.ok) {
      console.log(`CoinGecko search failed for ${cleanSymbol}: ${resp.status}`);
      geckoIdCache.set(cleanSymbol, null);
      return null;
    }
    
    const data = await resp.json();
    const coins = data.coins || [];
    
    console.log(`CoinGecko search results for ${cleanSymbol}:`, coins.slice(0, 3).map((c: any) => ({
      symbol: c.symbol,
      id: c.id,
      name: c.name
    })));
    
    // Find exact symbol match
    const match = coins.find((coin: any) => 
      coin.symbol?.toUpperCase() === cleanSymbol
    );
    
    if (match && match.id) {
      console.log(`✅ Auto-found CoinGecko ID for ${cleanSymbol}: ${match.id} (${match.name})`);
      geckoIdCache.set(cleanSymbol, match.id);
      return match.id;
    }
    
    console.log(`❌ No exact match found for ${cleanSymbol}`);
    geckoIdCache.set(cleanSymbol, null);
    return null;
  } catch (err) {
    console.log(`CoinGecko search error for ${cleanSymbol}:`, err);
    geckoIdCache.set(cleanSymbol, null);
    return null;
  }
}

async function getCoinGeckoPrice(
  symbol: string
): Promise<{ price: number | null; change24h: number | null }> {
  try {
    const geckoId = await findCoinGeckoId(symbol);
    if (!geckoId) return { price: null, change24h: null };

    const resp = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd&include_24hr_change=true`
    );
    if (!resp.ok) return { price: null, change24h: null };
    const data = await resp.json();
    
    const price = data[geckoId]?.usd ?? null;
    const change24h = data[geckoId]?.usd_24h_change ?? null;
    
    return { price, change24h };
  } catch {
    return { price: null, change24h: null };
  }
}

async function getBinancePrice(symbol: string): Promise<number | null> {
  try {
    const resp = await fetch(
      `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return parseFloat(data.price);
  } catch {
    return null;
  }
}

async function getBinanceHistoricalPrice(
  symbol: string,
  timestamp: number
): Promise<number | null> {
  try {
    const resp = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&startTime=${timestamp}&limit=1`
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && data.length > 0) {
      return parseFloat(data[0][4]); // close price
    }
    return null;
  } catch {
    return null;
  }
}

async function getBinanceChartData(
  symbol: string,
  startTime: number,
  endTime: number
): Promise<ChartData[]> {
  try {
    // Use 15m interval for better visibility
    const resp = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=15m&startTime=${startTime}&endTime=${endTime}&limit=100`
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    
    return data.map((candle: any) => ({
      timestamp: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
    }));
  } catch {
    return [];
  }
}

async function getCoinGeckoChartData(
  token: string,
  startTime: number,
  endTime: number
): Promise<ChartData[]> {
  try {
    console.log(`Getting CoinGecko chart for token: ${token}`);
    const geckoId = await findCoinGeckoId(token);
    if (!geckoId) {
      console.log(`No CoinGecko ID found for ${token}`);
      return [];
    }
    console.log(`Using CoinGecko ID: ${geckoId} for chart`);

    // Calculate days difference
    const now = Date.now();
    const daysAgo = Math.ceil((now - startTime) / (1000 * 60 * 60 * 24));
    const days = Math.min(daysAgo, 90); // CoinGecko limit

    const resp = await fetch(
      `https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`
    );
    
    if (!resp.ok) return [];
    const data = await resp.json();
    
    // CoinGecko returns: { prices: [[timestamp, price], ...] }
    const prices = data.prices || [];
    
    // Filter to our time range and convert to ChartData format
    return prices
      .filter((point: [number, number]) => {
        const ts = point[0];
        return ts >= startTime && ts <= endTime;
      })
      .map((point: [number, number]) => ({
        timestamp: point[0],
        open: point[1],
        high: point[1],
        low: point[1],
        close: point[1],
      }));
  } catch (err) {
    console.log(`CoinGecko chart error for ${token}:`, err);
    return [];
  }
}

function extractToken(highlight: string): string | null {
  // Extract token from format: "1. 📜 REGULATION | $BTC: text"
  const match = highlight.match(/\$([A-Z0-9]+)/);
  return match ? match[1] : null;
}

function normalizeTokenToBinance(token: string): string | null {
  const mapping: Record<string, string> = {
    SOLANA: "SOL",
    BITCOIN: "BTC",
    ETHEREUM: "ETH",
    ETHERFI: "ETHFI",
  };
  const normalized = mapping[token.toUpperCase()] || token.toUpperCase();
  return `${normalized}USDT`;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const delta = (now - timestamp) / 1000; // seconds

  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

async function enrichHighlights(
  highlights: string[],
  newsItems: PreparedNewsItem[]
): Promise<EnrichedHighlight[]> {
  const enriched: EnrichedHighlight[] = [];

  for (const highlight of highlights) {
    const token = extractToken(highlight);
    const result: EnrichedHighlight = { text: highlight };

    if (!token) {
      enriched.push(result);
      continue;
    }

    // Find timestamp for this token's news
    let newsTimestamp: number | null = null;
    for (const news of newsItems) {
      if (
        news.title.toUpperCase().includes(token) ||
        news.body.toUpperCase().includes(token)
      ) {
        newsTimestamp = new Date(news.time).getTime();
        break;
      }
    }

    if (!newsTimestamp && newsItems.length > 0) {
      newsTimestamp = new Date(newsItems[0].time).getTime();
    }

    if (newsTimestamp) {
      result.timeAgo = formatTimeAgo(newsTimestamp);
      result.newsTimestamp = newsTimestamp;

      // Try to get price change
      const binanceSymbol = normalizeTokenToBinance(token);
      if (binanceSymbol) {
        result.symbol = binanceSymbol;
        try {
          const [historicalPrice, currentPriceBinance] = await Promise.all([
            getBinanceHistoricalPrice(binanceSymbol, newsTimestamp),
            getBinancePrice(binanceSymbol),
          ]);

          if (historicalPrice && currentPriceBinance && historicalPrice > 0) {
            // Binance success - calculate from news time
            const change =
              ((currentPriceBinance - historicalPrice) / historicalPrice) * 100;
            result.priceChange = change;
          } else {
            // Fallback to CoinGecko 24h change (for tokens not on Binance like GHOST)
            const geckoData = await getCoinGeckoPrice(token);
            if (geckoData.change24h !== null) {
              result.priceChange = geckoData.change24h;
              console.log(`Using CoinGecko 24h change for ${token}: ${geckoData.change24h.toFixed(2)}%`);
            }
          }
        } catch (err) {
          console.log(`Price fetch error for ${token}:`, err);
        }
      }
    }

    enriched.push(result);
  }

  return enriched;
}

function formatPriceEmoji(change: number): string {
  if (change > 10) return "🟢🟢🚀";
  if (change > 5) return "🟢🟢";
  if (change > 0) return "🟢";
  if (change < -10) return "🔴🔴🔻";
  if (change < -5) return "🔴🔴";
  if (change < 0) return "🔴";
  return "⚪";
}

// Price Chart Component with auto-loading
function PriceChart({ symbol, newsTimestamp }: { symbol: string; newsTimestamp: number }) {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'binance' | 'coingecko' | null>(null);

  useEffect(() => {
    const loadChart = async () => {
      setLoading(true);
      const endTime = Date.now();
      const startTime = newsTimestamp;
      
      // Try Binance first
      let data = await getBinanceChartData(symbol, startTime, endTime);
      
      if (data.length > 0) {
        setSource('binance');
        setChartData(data);
        setLoading(false);
        return;
      }
      
      // Fallback to CoinGecko
      const token = symbol.replace('USDT', '');
      data = await getCoinGeckoChartData(token, startTime, endTime);
      
      if (data.length > 0) {
        setSource('coingecko');
        console.log(`Using CoinGecko chart for ${token}`);
      }
      
      setChartData(data);
      setLoading(false);
    };
    loadChart();
  }, [symbol, newsTimestamp]);

  if (loading) {
    return (
      <div className="chart-container">
        <div className="chart-loading">
          <div className="loading-spinner"></div>
          Загрузка графика...
        </div>
      </div>
    );
  }

  if (chartData.length === 0) return null;

  return (
    <div className="chart-container">
      <MiniChart data={chartData} newsTimestamp={newsTimestamp} />
      {source && (
        <div className="chart-source">
          {source === 'binance' ? '📊 Binance' : '🦎 CoinGecko'}
        </div>
      )}
    </div>
  );
}

// Mini Chart Component
function MiniChart({
  data,
  newsTimestamp,
}: {
  data: ChartData[];
  newsTimestamp: number;
}) {
  if (data.length === 0) return null;

  const width = 300;
  const height = 150;
  const padding = { top: 10, right: 10, bottom: 20, left: 10 };

  const prices = data.flatMap((d) => [d.high, d.low]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate news marker position
  const newsIndex = data.findIndex((d) => d.timestamp >= newsTimestamp);
  const newsX =
    newsIndex >= 0
      ? padding.left + (newsIndex / (data.length - 1)) * chartWidth
      : null;

  return (
    <svg width={width} height={height} className="mini-chart-svg">
      <defs>
        <linearGradient id="priceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {/* Price line */}
      <polyline
        points={data
          .map((d, i) => {
            const x = padding.left + (i / (data.length - 1)) * chartWidth;
            const y =
              padding.top +
              chartHeight -
              ((d.close - minPrice) / priceRange) * chartHeight;
            return `${x},${y}`;
          })
          .join(" ")}
        fill="none"
        stroke="#6366f1"
        strokeWidth="2"
      />

      {/* Fill area */}
      <polygon
        points={
          data
            .map((d, i) => {
              const x = padding.left + (i / (data.length - 1)) * chartWidth;
              const y =
                padding.top +
                chartHeight -
                ((d.close - minPrice) / priceRange) * chartHeight;
              return `${x},${y}`;
            })
            .join(" ") +
          ` ${width - padding.right},${height - padding.bottom} ${padding.left},${height - padding.bottom}`
        }
        fill="url(#priceGradient)"
      />

      {/* News marker line */}
      {newsX && (
        <>
          <line
            x1={newsX}
            y1={padding.top}
            x2={newsX}
            y2={height - padding.bottom}
            stroke="#f59e0b"
            strokeWidth="2"
            strokeDasharray="4,2"
          />
          <circle cx={newsX} cy={padding.top + 5} r={4} fill="#f59e0b" />
          <text
            x={newsX}
            y={padding.top - 2}
            fontSize="10"
            fill="#f59e0b"
            textAnchor="middle"
          >
            📰
          </text>
        </>
      )}

      {/* Time labels */}
      <text
        x={padding.left}
        y={height - 5}
        fontSize="10"
        fill="#94a3b8"
        textAnchor="start"
      >
        {formatTimeAgo(data[0].timestamp)}
      </text>
      <text
        x={width - padding.right}
        y={height - 5}
        fontSize="10"
        fill="#94a3b8"
        textAnchor="end"
      >
        Now
      </text>
    </svg>
  );
}

// Common presets for different scenarios
const TIME_PRESETS = [
  { label: "12H", hours: 12 },
  { label: "1D", hours: 24 },
  { label: "2D", hours: 48 },
  { label: "3D", hours: 72 },
];

function App() {
  const [apiKey, setApiKey] = useState<string>("");
  const [hoursBack, setHoursBack] = useState<number>(12);
  const [summary, setSummary] = useState<string>("");
  const [enrichedNews, setEnrichedNews] = useState<EnrichedHighlight[]>([]);
  const [usage, setUsage] = useState<Usage | undefined>();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [stats, setStats] = useState<{
    total: number;
    oldest: number;
    newest: number;
  } | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (!apiKey) {
      setError("Введите OpenAI API ключ");
      return;
    }
    setError("");
    setLoading(true);
    setSummary("");
    setEnrichedNews([]);
    setStats(null);

    try {
      // Fetch news
      const raw = await fetchTreeNews();
      const cutoffMs = Date.now() - hoursBack * 60 * 60 * 1000;
      const filtered = raw.filter((item) => (item.time ?? 0) >= cutoffMs);
      filtered.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));

      if (filtered.length === 0) {
        setError(`Нет новостей за последние ${hoursBack}ч`);
        setLoading(false);
        return;
      }

      // Check coverage (warn if data might be incomplete)
      const oldestFetched = raw.length > 0 ? Math.min(...raw.map(r => r.time ?? Date.now())) : Date.now();
      const coverageHours = (Date.now() - oldestFetched) / (1000 * 60 * 60);
      
      if (coverageHours < hoursBack && filtered.length === raw.length) {
        console.warn(`⚠️ Coverage: ${coverageHours.toFixed(1)}h < requested ${hoursBack}h. Increase limit.`);
      }

      const prepared = prepareNewsForAI(filtered);

      // AI Analysis
      const { summary: res, usage: u } = await analyzeWithOpenAI(
        apiKey,
        prepared,
        "gpt-4o-mini"
      );
      setSummary(res);
      setUsage(u);

      // Extract highlights
      const lines = res.split("\n").map((l) => l.trim()).filter(Boolean);
      const highlights = lines.filter(
        (l) => l.match(/^\d+\./) && l.includes(":")
      );

      // Enrich with prices
      if (highlights.length > 0) {
        const enriched = await enrichHighlights(highlights, prepared);
        setEnrichedNews(enriched);
      }

      setStats({
        total: filtered.length,
        oldest: filtered[0]?.time ?? 0,
        newest: filtered[filtered.length - 1]?.time ?? 0,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiKey, hoursBack]);

  return (
    <div className="container">
      {/* Header */}
      <header className="header">
        <h1 className="app-title">🔍 Crypto News Analyzer</h1>
        <p className="app-subtitle">
          Утренний обзор значимых крипто-событий с AI-фильтрацией и графиками цен
        </p>
      </header>

      {/* Form */}
      <section className="form-section">
        <div className="form">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">🔑 OpenAI API Key</label>
              <input
                type="password"
                className="form-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-proj-..."
              />
            </div>
            <div className="form-group hours-input">
              <label className="form-label">⏰ Период анализа</label>
              <input
                type="number"
                className="form-input"
                min={0.5}
                step={0.5}
                value={hoursBack}
                onChange={(e) => setHoursBack(parseFloat(e.target.value))}
              />
              <span className="hours-label">часов</span>
            </div>
            <button
              className="analyze-button"
              onClick={handleAnalyze}
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="loading-spinner"></div>
                  Анализирую...
                </>
              ) : (
                <>🚀 Анализировать</>
              )}
            </button>
          </div>

          {/* Quick Presets */}
          <div className="presets-row">
            <span className="presets-label">Быстрый выбор:</span>
            <div className="preset-buttons">
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset.hours}
                  className={`preset-button ${hoursBack === preset.hours ? 'active' : ''}`}
                  onClick={() => setHoursBack(preset.hours)}
                  disabled={loading}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Error */}
      {error && <div className="error-message">⚠️ {error}</div>}

      {/* Results */}
      {enrichedNews.length > 0 && (
        <section className="results-section">
          {/* Stats */}
          {stats && (
            <div className="stats-card">
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{stats.total}</div>
                  <div className="stat-label">Новостей проанализировано</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{enrichedNews.length}</div>
                  <div className="stat-label">Значимых событий</div>
                </div>
                {usage && (
                  <div className="stat-item">
                    <div className="stat-value">
                      {usage.total_tokens ?? "?"}
                    </div>
                    <div className="stat-label">Токенов использовано</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* News Cards */}
          <div className="news-cards">
            {enrichedNews.map((item, idx) => {
              const parts = item.text.split("\n");
              const mainText = parts[0];
              const link = parts
                .find((p) => p.trim().startsWith("Link:"))
                ?.replace("Link:", "")
                .trim();

              // Extract token symbol (exclude dollar amounts like $600M, $10M)
              const tokenMatch = mainText.match(/\$([A-Z]{2,10})(?![0-9MBK])/);
              const tokenSymbol = tokenMatch ? tokenMatch[1] : null;
              
              // For chart: prefer token from text, then item.symbol, then default to BTC
              const chartSymbol = tokenSymbol 
                ? `${tokenSymbol}USDT`
                : (item.symbol || "BTCUSDT");

              return (
                <div key={idx} className="news-card">
                  <div className="news-card-header">
                    {tokenSymbol ? (
                      <span className="news-token">${tokenSymbol}</span>
                    ) : (
                      <span className="news-token-generic">CRYPTO MARKET</span>
                    )}
                    <span className="news-number">#{idx + 1}</span>
                  </div>

                  <div className="news-card-body">
                    <p className="news-text">{mainText.replace(/^\d+\.\s*/, "").replace(/\$[A-Z0-9]+:\s*/, "")}</p>

                    <div className="news-meta">
                      {item.priceChange !== undefined && (
                        <span className={`price-badge ${item.priceChange >= 0 ? 'positive' : 'negative'}`}>
                          {formatPriceEmoji(item.priceChange)}{" "}
                          {item.priceChange > 0 ? "+" : ""}
                          {item.priceChange.toFixed(1)}%
                        </span>
                      )}
                      {item.timeAgo && (
                        <span className="time-badge">⏱ {item.timeAgo}</span>
                      )}
                    </div>

                    {/* Price Chart - always show for all news */}
                    {item.newsTimestamp && chartSymbol && (
                      <PriceChart symbol={chartSymbol} newsTimestamp={item.newsTimestamp} />
                    )}

                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="news-link"
                      >
                        🔗 Источник
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* No significant news */}
      {summary === "NO_SIGNIFICANT_NEWS" && (
        <div className="no-news-message">
          ✅ Значимых новостей за последние {hoursBack}ч не обнаружено
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <p>
          🔒 API ключ хранится только в браузере и не отправляется на сервер
        </p>
        <p>
          📊 Данные: <a href="https://news.treeofalpha.com" target="_blank">TreeNews</a> |
          Цены: Binance Futures
        </p>
      </footer>
    </div>
  );
}

export default App;
