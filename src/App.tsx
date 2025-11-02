import { useState, useCallback } from "react";
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
• Price predictions, analyst opinions, sentiment analysis
• "May", "could", "might", "potentially", "expects" statements
• Fear/Greed index updates

**Categories:**

📊 **MACRO** (HIGHEST PRIORITY - affects entire market):
  • Fed rate decisions, Powell speeches with policy shifts
  • CPI/PCE/PPI data (inflation surprises)
  • NFP, unemployment (employment data)
  • US-China trade (tariffs, deals, sanctions)
  • Traditional markets (S&P circuit breakers, VIX spikes)
  • Central banks (ECB, BoJ, BoE decisions)
  • Crypto policy (executive orders, legislation)

🔥 **TOKENOMICS** (Corporate demand is CRITICAL):
  • **Corporate Treasury Purchases**: MicroStrategy, Tesla, Block, Marathon buying BTC/crypto
  • **DAT/Buybacks**: Dutch Auction Tenders, official buyback programs
  • Token burns ≥ $10M value
  • Major unlocks with dates

📜 REGULATION | 💱 EXCHANGE | 💰 FUNDING | 🔥 TOKENOMICS | 🐋 ON-CHAIN | 📢 INFLUENCER | ⚠️ SECURITY

</SIGNIFICANCE_CRITERIA>

<OUTPUT_FORMAT>
**Quality over quantity.** Report ONLY truly significant catalysts.

• If 1-3 major events → report 1-3 items
• If 5-7 significant events → report 5-7 items
• If 10+ critical events → cap at 10 maximum
• If ZERO significant events → respond exactly: NO_SIGNIFICANT_NEWS

Format each item:
1. [EMOJI] [CATEGORY] | $[TICKER]: [concise summary ≤20 words]
   Link: [URL]

**Example:**
1. 📊 MACRO | CRYPTO MARKET: Fed cuts rates 50 bps unexpectedly, Powell signals dovish stance
   Link: https://federalreserve.gov/...

2. 📊 MACRO | CRYPTO MARKET: US-China announce 90-day tariff pause, risk-on rally
   Link: https://reuters.com/...

3. 📜 REGULATION | $BTC: SEC approves BlackRock spot Bitcoin ETF, trading starts Monday
   Link: https://sec.gov/...

4. 📜 REGULATION | $SOL: Solana spot ETF draws $200M inflows in debut week
   Link: https://bloomberg.com/...

5. 🔥 TOKENOMICS | $BTC: MicroStrategy purchases 5,000 BTC for $250M, holdings reach 152K BTC
   Link: https://microstrategy.com/...

6. 🐋 ON-CHAIN | $ETH: Whale transferred $180M to Kraken after 5 years dormant
   Link: https://etherscan.io/...

**Rules:**
• Blank line between items
• Max 10 items (report fewer if appropriate)
• ALWAYS use $TICKER for tokens
• No duplicates (one item per token)
• NO predictions, opinions, or sentiment
• If none qualify: NO_SIGNIFICANT_NEWS

</OUTPUT_FORMAT>

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
          const [historicalPrice, currentPrice] = await Promise.all([
            getBinanceHistoricalPrice(binanceSymbol, newsTimestamp),
            getBinancePrice(binanceSymbol),
          ]);

          if (historicalPrice && currentPrice && historicalPrice > 0) {
            const change =
              ((currentPrice - historicalPrice) / historicalPrice) * 100;
            result.priceChange = change;
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
  { label: "🌅 Утро (12ч)", hours: 12 },
  { label: "📅 Вчера (24ч)", hours: 24 },
  { label: "🎯 Активный день (48ч)", hours: 48 },
  { label: "🏖️ Выходные (72ч)", hours: 72 },
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
  const [activeChart, setActiveChart] = useState<number | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);

  const handleShowChart = useCallback(
    async (idx: number, item: EnrichedHighlight) => {
      if (activeChart === idx) {
        setActiveChart(null);
        setChartData([]);
        return;
      }

      if (!item.symbol || !item.newsTimestamp) {
        return;
      }

      setActiveChart(idx);
      setChartData([]);

      const endTime = Date.now();
      const startTime = item.newsTimestamp;

      const data = await getBinanceChartData(item.symbol, startTime, endTime);
      setChartData(data);
    },
    [activeChart]
  );

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

              // Extract category emoji and token
              const emojiMatch = mainText.match(
                /^(\d+\.\s*)?([📜💱💰🔥🐋📊📢⚠️])/
              );
              const emoji = emojiMatch ? emojiMatch[2] : "📰";

              return (
                <div key={idx} className="news-card">
                  <div className="news-card-header">
                    <span className="news-emoji">{emoji}</span>
                    <span className="news-number">#{idx + 1}</span>
                  </div>

                  <div className="news-card-body">
                    <p className="news-text">{mainText.replace(/^\d+\.\s*/, "")}</p>

                    <div className="news-meta">
                      {item.priceChange !== undefined && (
                        <>
                          <button
                            className={`price-badge clickable ${item.priceChange >= 0 ? 'positive' : 'negative'}`}
                            onClick={() => handleShowChart(idx, item)}
                            title="Показать график"
                          >
                            {formatPriceEmoji(item.priceChange)}{" "}
                            {item.priceChange > 0 ? "+" : ""}
                            {item.priceChange.toFixed(1)}%
                            {item.symbol && " 📊"}
                          </button>
                        </>
                      )}
                      {item.timeAgo && (
                        <span className="time-badge">⏱ {item.timeAgo}</span>
                      )}
                    </div>

                    {/* Price Chart */}
                    {activeChart === idx && item.newsTimestamp && (
                      <div className="chart-container">
                        {chartData.length > 0 ? (
                          <MiniChart
                            data={chartData}
                            newsTimestamp={item.newsTimestamp}
                          />
                        ) : (
                          <div className="chart-loading">
                            <div className="loading-spinner"></div>
                            Загрузка графика...
                          </div>
                        )}
                      </div>
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
