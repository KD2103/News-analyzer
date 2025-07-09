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

  const [stats, setStats] = useState<{ total: number; oldest: number; newest: number } | null>(null);

  return (
    <div className="container">
      <h1>TreeNews History Analyzer</h1>
      <div className="form">
        <label>
          OpenAI API Key:
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Hours back:
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={hoursBack}
            onChange={(e) => setHoursBack(parseFloat(e.target.value))}
          />
        </label>
        <button onClick={handleAnalyze} disabled={loading}>
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </div>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {summary && (
        <div className="summary">
          <h2>Significant News Summary</h2>
          <pre>{summary}</pre>
          {stats && (
            <div className="stats">
              <h3>Analysis Statistics</h3>
              <ul>
                <li>Total news analyzed: {stats.total}</li>
                <li>
                  Time range: {new Date(stats.oldest).toLocaleString()} – {" "}
                  {new Date(stats.newest).toLocaleString()}
                </li>
                {usage && (
                  <li>
                    Tokens: {usage.total_tokens ?? "?"} (prompt {usage.prompt_tokens}, completion {usage.completion_tokens})
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
// END NEW APP COMPONENT
