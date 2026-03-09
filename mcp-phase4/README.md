# 🚀 Phase 4: Weather + GitHub API MCP Server

Your server now talks to the real internet! No local files — pure external API calls.

---

## ⚙️ Setup

```bash
cd mcp-phase4
npm install
npm run inspect
```

---

## 🌤️ Weather Tools (3 tools) — no API key needed!

| Tool | What it does |
|---|---|
| `get_current_weather` | Current weather for any city |
| `get_weather_forecast` | 1-7 day forecast |
| `compare_weather` | Side-by-side comparison of two cities |

### Test sequence:
```
1. get_current_weather → city: "Tokyo"
2. get_current_weather → city: "London", units: "fahrenheit"
3. get_weather_forecast → city: "Mumbai", days: 7
4. compare_weather → city1: "New York", city2: "Los Angeles"
```

---

## 🐙 GitHub Tools (5 tools)

Public endpoints work without a token. For full access:

```bash
# Get token: github.com → Settings → Developer settings → Personal access tokens
export GITHUB_TOKEN=your_token_here
# Then restart: npm run inspect
```

| Tool | Needs token? |
|---|---|
| `get_github_user` | No (public profiles) |
| `list_user_repos` | No (public repos) |
| `get_repo_info` | No (public repos) |
| `list_repo_issues` | No (public repos) |
| `search_github_repos` | No (public search) |
| `get_readme` | No (public repos) |

### Test sequence:
```
1. get_github_user → username: "torvalds"
2. list_user_repos → username: "microsoft", limit: 5
3. get_repo_info → owner: "facebook", repo: "react"
4. list_repo_issues → owner: "microsoft", repo: "vscode", limit: 5
5. search_github_repos → query: "mcp server typescript", sort: "stars"
6. get_readme → owner: "anthropics", repo: "anthropic-cookbook"
```

---

## 🧠 New Concepts in Phase 4

### 1. fetch() — making HTTP requests
```typescript
const response = await fetch("https://api.example.com/data");
const data = await response.json();
```

### 2. Error handling for HTTP responses
```typescript
if (!response.ok) {
  if (response.status === 401) // unauthorized
  if (response.status === 404) // not found
  if (response.status === 429) // rate limited
}
```

### 3. Timeouts — don't wait forever
```typescript
signal: AbortSignal.timeout(10000) // fail after 10 seconds
```

### 4. Chained API calls — geocoding then weather
```typescript
// Step 1: city name → coordinates
const geo = await fetch(`geocoding?name=${city}`);
// Step 2: coordinates → weather
const weather = await fetch(`weather?lat=${lat}&lon=${lon}`);
```

### 5. Parallel API calls with Promise.all
```typescript
// Fetch two cities AT THE SAME TIME (2x faster than sequential)
const [city1, city2] = await Promise.all([
  fetch(url1),
  fetch(url2),
]);
```

### 6. Environment variables for secrets
```typescript
// NEVER hardcode tokens in your code!
const token = process.env.GITHUB_TOKEN;
// Set it: export GITHUB_TOKEN=your_token
```

---

## 🏆 Phase 4 Challenge

Add a `get_trending_repos` tool that fetches repos created in the last week with the most stars:
```
query: "created:>2025-01-01 stars:>100"
sort: "stars"
```
Hint: use `search_github_repos` logic with a date filter in the query.

---

## ➡️ What's Next: Phase 5

- Convert your server from stdio → SSE (web-accessible!)
- Host it on a public URL
- Connect via Claude.ai integrations (not just Claude Desktop)
- Learn: SSE transport, deployment, authentication

---

## 📚 Resources
- open-meteo docs: https://open-meteo.com/en/docs
- GitHub API docs: https://docs.github.com/en/rest
- MCP Docs: https://modelcontextprotocol.io
