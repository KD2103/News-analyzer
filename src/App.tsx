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

async function summarizeWithOpenAI(
  apiKey: string,
  payload: PreparedNewsItem[],
  model = "gpt-3.5-turbo"
): Promise<{ summary: string; usage?: Usage }> {
  const systemPrompt =
    "You are an expert crypto news summarizer. Provide concise bullet points of significant market-moving events.";
  const userPrompt =
    `Analyze the following JSON array of crypto news messages (max 1500, newest first). Highlight only SIGNIFICANT events that could affect crypto markets. Ignore noise, duplicates, unrelated topics. Output up to 10 bullet points. Each bullet: which tokens/companies, what happened, why important.`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
    { role: "user", content: JSON.stringify(payload) },
  ];

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.3 }),
  });

  if (!resp.ok) {
    throw new Error(`OpenAI error: ${resp.status}`);
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
