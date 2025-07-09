// BEGIN NEW APP COMPONENT
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
  time: string | null;
  source: string;
  title: string;
  body: string;
  url: string;
  author?: string;
}

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

async function fetchTreeNews(limit = 1500): Promise<RawNewsItem[]> {
  const resp = await fetch(
    `https://news.treeofalpha.com/api/news?limit=${limit}`
  );
  if (!resp.ok) throw new Error(`TreeNews API error: ${resp.status}`);
  return resp.json();
}

function prepareMessagesForAI(messages: RawNewsItem[]): PreparedNewsItem[] {
  return messages.map((msg) => {
    let source = msg.source ?? "NO_SOURCE";
    if (
      source === "NO_SOURCE" &&
      (msg.url ?? "").startsWith("https://twitter.com/")
    ) {
      source = "TWITTER";
    }
    const ts = msg.time ?? msg.sendTime;
    const msgTime = ts ? new Date(ts).toISOString().slice(0, 19).replace("T", " ") : null;

    if (source === "Twitter" || source === "TWITTER") {
      const parts = (msg.title ?? "").split(":", 1);
      const author = parts.length > 1 ? parts[0].trim() : "";
      const bodyText = parts.length > 1 ? (msg.title ?? "").slice(parts[0].length + 1).trim() : msg.title ?? "";
      return {
        time: msgTime,
        source,
        title: (author || msg.title) ?? "",
        body: bodyText,
        url: msg.url ?? "",
        author,
      };
    }
    return {
      time: msgTime,
      source,
      title: msg.title ?? "",
      body: msg.body ?? msg.title ?? "",
      url: msg.url ?? "",
    };
  });
}

// Формируем блок текста без сжатия, в стиле Python функции
function buildBlockText(items: PreparedNewsItem[]): string {
  return items
    .map((n) => {
      const parts: string[] = [];
      if (n.time) parts.push(n.time);
      parts.push(`(${n.source})`);
      parts.push(n.title || n.body);
      if (n.url) parts.push(n.url);
      return parts.join(" | ");
    })
    .join("\n");
}

async function summarizeWithOpenAI(
  apiKey: string,
  payload: PreparedNewsItem[],
  model = "gpt-4o-mini"
): Promise<{ summary: string; usage?: Usage }> {
  const systemPrompt = `
<System_Prompt>
<Persona>
You are the senior crypto-macro analyst on a high-frequency trading desk.
</Persona>

<SIGNIFICANCE_CRITERIA>
Treat an item as SIGNIFICANT only if it contains NEW information with high,
near-term price impact on major tokens or the broader crypto market.

• **Regulation/Governance**: SEC, CFTC, ESMA, ETF (19b-4, S-1, 40-F),
  approvals/denials, lawsuits, subpoenas, sanctions.
• **Exchange / Infrastructure**: new product launches, listings,
  delistings, outages, hacks, acquisitions, bankruptcies.
• **Funding / Corporate**: rounds ≥ $10 M, mergers, partnerships with
  household-name firms (Visa, PayPal, Microsoft …), DAO governance votes
  that pass and unlock funds.
• **Revenue Models & Business Fundamentals**: revenue switch activation,
  fee-sharing mechanisms launch, token buyback programs, profit distribution
  to holders, transition from inflationary to deflationary tokenomics.
• **On-chain / Tokenomics**: whale moves ≥ $100 M, token unlocks ≥ 1 %
  of circulating supply, critical mainnet upgrades/forks.
• **Macro & Politics**: surprises in Fed/ECB/Boj rate decisions (≥ 25 bps),
  US CPI beats/misses, US payrolls shocks, sharp moves or trading halts in
  S&P 500 / Nasdaq futures, election results if historically crypto-linked.
• **Influencer Impact**:
  - **High-Impact Individual Signals**: Trading calls from verified top-tier traders:
    Birds of a Feather (@BirdrsTrades), 0xENAS (@0xENAS), Joshua Deuk (@JoshuaDeuk),
    Hsaka (@HsakaTrades), Nacho (@NachoTrades), Rewkang (@Rewkang), Definalist (@definalist),
    Bluntz Capital (@Bluntz_Capital), Mac (@MacnBTC), KSI Crypto (@ksicrypto),
    Defi Squared (@DefiSquared), GCR (@GCR), Blknoiz (@blknoiz06),
    Dark Crypto Lord (@DarkCryptoLord), Murad (@MustStopMurad)
  - **Multiple Influencer Convergence**: When 2+ different influencers/traders
    (not necessarily from the above list) independently shill or signal the same token
    within the current batch. Format: "Multiple traders signal <TOKEN>: [list names]"
  Key signal types to track:
  - Explicit position entries/exits
  - Clear directional calls  
  - Timeframe specifications
  
Ignore commentary or opinion without fresh facts.
</SIGNIFICANCE_CRITERIA>

<OUTPUT_FORMAT>
If ≥1 significant items exist, format each news item as follows:

1. <TOKEN/Theme>: <concise one-sentence summary ≤ 25 words>
   Link: <URL>

2. <TOKEN/Theme>: <concise one-sentence summary ≤ 25 words>
   Link: <URL>

• Add a blank line between each news item for better readability
• Remove exact or near-duplicate items (same token + same fact); keep the
  most reputable source (e.g., Bloomberg > CoinTelegraph > random blog)
• Max 15 items total
• Number items sequentially (1, 2, 3, etc.)

If none qualify: respond exactly NO_SIGNIFICANT_NEWS
No explanations or extra text.
</OUTPUT_FORMAT>

<THINKING_PROCESS>
Think step-by-step privately.  
Build a set of (TOKEN, FACT) pairs to avoid duplicates before composing
the final answer.  
Output ONLY the formatted list described in <OUTPUT_FORMAT>.
</THINKING_PROCESS>
</System_Prompt>`;

  const blockText = buildBlockText(payload);

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `<BATCH>\n${blockText}\n</BATCH>` },
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
      max_tokens: 1000,
      top_p: 1,
    }),
  });

  if (!resp.ok) {
    // Попробуем извлечь подробности (может быть JSON или просто текст)
    const rawText = await resp.text();
    let detail = rawText;
    try {
      const errJson = JSON.parse(rawText);
      detail = errJson?.error?.message ?? JSON.stringify(errJson);
    } catch {
      // rawText не является JSON
    }
    throw new Error(`OpenAI error ${resp.status}: ${detail}`);
  }
  const data = await resp.json();

  return {
    summary: data.choices?.[0]?.message?.content ?? "",
    usage: data.usage as Usage,
  };
}

function App() {
  const [apiKey, setApiKey] = useState<string>("");
  const [hoursBack, setHoursBack] = useState<number>(2);
  const [summary, setSummary] = useState<string>("");
  const [usage, setUsage] = useState<Usage | undefined>();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [stats, setStats] = useState<{ total: number; oldest: number; newest: number } | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (!apiKey) {
      setError("Please provide OpenAI API Key");
      return;
    }
    setError("");
    setLoading(true);
    setSummary("");
    try {
      const raw = await fetchTreeNews();
      const cutoffMs = Date.now() - hoursBack * 60 * 60 * 1000;
      const filtered = raw
        .sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
        .filter((item) => (item.time ?? 0) >= cutoffMs);
      const prepared = prepareMessagesForAI(filtered);
      const { summary: res, usage: u } = await summarizeWithOpenAI(apiKey, prepared);
      setSummary(res);
      setUsage(u);
      // Store stats
      setStats({ total: filtered.length, oldest: filtered.at(-1)?.time ?? 0, newest: filtered[0]?.time ?? 0 });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiKey, hoursBack]);

  return (
    <div className="container">
      {/* Header Section */}
      <header className="header">
        <h1 className="app-title">📈 TreeNews History Analyzer</h1>
        <p className="app-subtitle">Анализируйте крипто-новости с помощью ИИ для принятия торговых решений</p>
      </header>

      {/* Form Section */}
      <section className="form-section">
        <div className="form">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                🔑 OpenAI API Key
              </label>
              <input
                type="password"
                className="form-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-proj-..."
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                ⏰ Часы назад
              </label>
              <input
                type="number"
                className="form-input"
                min={0.5}
                step={0.5}
                value={hoursBack}
                onChange={(e) => setHoursBack(parseFloat(e.target.value))}
              />
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
                <>
                  🔍 Анализировать
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      {/* Results Section */}
      {(summary || stats) && (
        <section className="results-section">
          {/* Summary Card */}
          {summary && (
            <div className="summary-card">
              <div className="summary-header">
                <span className="summary-icon">📰</span>
                <h2 className="summary-title">Сводка значимых новостей</h2>
              </div>
              {(() => {
                const lines = summary.split(/\n+/).map((l) => l.trim()).filter(Boolean);
                const bullets = lines.filter((l) => l.startsWith("-") || l.startsWith("•"));
                return bullets.length ? (
                  <ul className="news-list">
                    {bullets.map((line, idx) => (
                      <li key={idx} className="news-item">
                        <div className="news-content">
                          {line.replace(/^[-•]\s*/, "")}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <pre className="news-pre">{summary}</pre>
                );
              })()}
            </div>
          )}

          {/* Stats Card */}
          {stats && (
            <div className="stats-card">
              <div className="stats-header">
                <span className="summary-icon">📊</span>
                <h3 className="stats-title">Статистика анализа</h3>
              </div>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{stats.total}</div>
                  <div className="stat-label">Новостей проанализировано</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">
                    {new Date(stats.newest).toLocaleTimeString('ru-RU', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                  <div className="stat-label">Самая свежая новость</div>
                  <div className="stat-time">
                    {new Date(stats.newest).toLocaleDateString('ru-RU')}
                  </div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">
                    {new Date(stats.oldest).toLocaleTimeString('ru-RU', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                  <div className="stat-label">Самая старая новость</div>
                  <div className="stat-time">
                    {new Date(stats.oldest).toLocaleDateString('ru-RU')}
                  </div>
                </div>
                {usage && (
                  <div className="stat-item">
                    <div className="stat-value">{usage.total_tokens ?? "?"}</div>
                    <div className="stat-label">Токенов использовано</div>
                    <div className="stat-time">
                      prompt: {usage.prompt_tokens}, completion: {usage.completion_tokens}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
// END NEW APP COMPONENT
