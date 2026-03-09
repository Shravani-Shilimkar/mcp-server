/**
 * ============================================================
 *  PHASE 5: SSE Transport + Deployment
 * ============================================================
 *
 * WHAT'S NEW IN PHASE 5 vs PHASE 4:
 *  ✅ SSE Transport — server runs as HTTP web server
 *  ✅ Express.js — handles HTTP routing
 *  ✅ Multiple sessions — many clients can connect at once
 *  ✅ CORS — allows browsers/Claude.ai to connect
 *  ✅ Health check endpoint — for deployment platforms
 *  ✅ Environment-based config — PORT, tokens from env vars
 *  ✅ Production-ready — deployable to Railway, Fly.io, etc.
 *
 * THE KEY DIFFERENCE FROM PHASE 1-4:
 *
 *  stdio (Phases 1-4):
 *    Claude Desktop spawns your server as a child process
 *    Communication: stdin → your server → stdout
 *    One connection, one client, local only
 *
 *  SSE (Phase 5):
 *    Your server runs as a web server, always listening
 *    Communication: HTTP POST (client→server) + SSE stream (server→client)
 *    Multiple connections, many clients, accessible from anywhere
 *
 * HOW SSE WORKS:
 *  Client connects to GET /sse → opens a persistent event stream
 *  Client sends messages to POST /messages?sessionId=xxx
 *  Server pushes responses back through the SSE stream
 *  This is how Claude.ai talks to remote MCP servers!
 *
 * SAME TOOLS, DIFFERENT TRANSPORT:
 *  Notice how ALL the tool logic is identical to Phase 4.
 *  Only the server setup at the bottom changes.
 *  This proves MCP tools are transport-agnostic. ✅
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import { z } from "zod";

// ──────────────────────────────────────────────────────────────
// Configuration from environment variables
// In production (Railway), these are set in the dashboard
// Locally, you can set them in your terminal
// ──────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "3000");
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || ""; // optional auth

// ──────────────────────────────────────────────────────────────
// Create MCP Server — identical to before!
// ──────────────────────────────────────────────────────────────
const mcpServer = new McpServer({
  name: "phase5-sse-server",
  version: "1.0.0",
});

// ──────────────────────────────────────────────────────────────
// HELPER: Generic fetch with error handling (same as Phase 4)
// ──────────────────────────────────────────────────────────────
async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "User-Agent": "mcp-phase5-server",
        ...options.headers,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 401) return { data: null, error: "Unauthorized — check your API token." };
      if (response.status === 403) return { data: null, error: "Forbidden — rate limit or insufficient permissions." };
      if (response.status === 404) return { data: null, error: "Not found — check the resource name." };
      return { data: null, error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json() as T
      : await response.text() as T;

    return { data, error: null };
  } catch (err: unknown) {
    const error = err as Error;
    if (error.name === "TimeoutError") return { data: null, error: "Request timed out." };
    return { data: null, error: `Network error: ${error.message}` };
  }
}

function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
  };
  if (GITHUB_TOKEN) headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}

// ──────────────────────────────────────────────────────────────
// TOOLS — 100% identical to Phase 4!
// This is the proof that tools are transport-agnostic.
// ──────────────────────────────────────────────────────────────

// WMO weather codes
const WMO_CODES: Record<number, string> = {
  0: "Clear sky ☀️", 1: "Mainly clear 🌤️", 2: "Partly cloudy ⛅", 3: "Overcast ☁️",
  45: "Foggy 🌫️", 51: "Light drizzle 🌦️", 61: "Slight rain 🌧️", 63: "Moderate rain 🌧️",
  65: "Heavy rain 🌧️", 71: "Slight snow 🌨️", 73: "Moderate snow 🌨️", 75: "Heavy snow ❄️",
  80: "Slight showers 🌦️", 81: "Moderate showers 🌦️", 95: "Thunderstorm ⛈️",
};

interface GeoResult {
  results?: Array<{ latitude: number; longitude: number; name: string; country: string; timezone: string }>;
}
interface WeatherResult {
  current: { temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number; apparent_temperature: number; precipitation: number };
  daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[]; time: string[]; precipitation_sum: number[] };
}
interface GitHubRepo { name: string; full_name: string; description: string | null; html_url: string; stargazers_count: number; forks_count: number; language: string | null; updated_at: string; open_issues_count: number; private: boolean }
interface GitHubUser { login: string; name: string | null; bio: string | null; public_repos: number; followers: number; following: number; location: string | null; html_url: string; created_at: string }
interface GitHubSearchResult { total_count: number; items: GitHubRepo[] }

// 🌤️ WEATHER TOOLS

mcpServer.tool("get_current_weather",
  "Gets current weather for any city. Returns temperature, humidity, wind, and conditions.",
  { city: z.string().describe("City name"), units: z.enum(["celsius", "fahrenheit"]).optional() },
  async ({ city, units = "celsius" }) => {
    const geo = await apiFetch<GeoResult>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
    if (geo.error || !geo.data?.results?.length) return { content: [{ type: "text", text: `City "${city}" not found.` }], isError: true };
    const { latitude, longitude, name, country, timezone } = geo.data.results[0];
    const tempUnit = units === "celsius" ? "celsius" : "fahrenheit";
    const sym = units === "celsius" ? "°C" : "°F";
    const weather = await apiFetch<WeatherResult>(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature,precipitation&temperature_unit=${tempUnit}&wind_speed_unit=kmh&timezone=${encodeURIComponent(timezone)}`);
    if (weather.error) return { content: [{ type: "text", text: `Weather error: ${weather.error}` }], isError: true };
    const c = weather.data!.current;
    return { content: [{ type: "text", text: `🌍 Weather in ${name}, ${country}\n${"─".repeat(35)}\nCondition:    ${WMO_CODES[c.weather_code] || "Unknown"}\nTemperature:  ${c.temperature_2m}${sym} (feels like ${c.apparent_temperature}${sym})\nHumidity:     ${c.relative_humidity_2m}%\nWind Speed:   ${c.wind_speed_10m} km/h\nPrecipitation: ${c.precipitation} mm` }] };
  }
);

mcpServer.tool("get_weather_forecast",
  "Gets a multi-day weather forecast for any city.",
  { city: z.string(), days: z.number().min(1).max(7).optional(), units: z.enum(["celsius", "fahrenheit"]).optional() },
  async ({ city, days = 5, units = "celsius" }) => {
    const geo = await apiFetch<GeoResult>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
    if (geo.error || !geo.data?.results?.length) return { content: [{ type: "text", text: `City "${city}" not found.` }], isError: true };
    const { latitude, longitude, name, country, timezone } = geo.data.results[0];
    const tempUnit = units === "celsius" ? "celsius" : "fahrenheit";
    const sym = units === "celsius" ? "°C" : "°F";
    const weather = await apiFetch<WeatherResult>(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum&temperature_unit=${tempUnit}&timezone=${encodeURIComponent(timezone)}&forecast_days=${days}`);
    if (weather.error) return { content: [{ type: "text", text: `Forecast error: ${weather.error}` }], isError: true };
    const d = weather.data!.daily;
    const lines = d.time.map((date, i) => `  ${date}  ${WMO_CODES[d.weather_code[i]] || "Unknown"}\n             High: ${d.temperature_2m_max[i]}${sym} | Low: ${d.temperature_2m_min[i]}${sym} | Rain: ${d.precipitation_sum[i]}mm`).join("\n\n");
    return { content: [{ type: "text", text: `📅 ${days}-Day Forecast for ${name}, ${country}\n${"─".repeat(40)}\n\n${lines}` }] };
  }
);

mcpServer.tool("compare_weather",
  "Compares weather between two cities side by side.",
  { city1: z.string(), city2: z.string(), units: z.enum(["celsius", "fahrenheit"]).optional() },
  async ({ city1, city2, units = "celsius" }) => {
    const [geo1, geo2] = await Promise.all([
      apiFetch<GeoResult>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city1)}&count=1`),
      apiFetch<GeoResult>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city2)}&count=1`),
    ]);
    if (!geo1.data?.results?.length) return { content: [{ type: "text", text: `City "${city1}" not found.` }], isError: true };
    if (!geo2.data?.results?.length) return { content: [{ type: "text", text: `City "${city2}" not found.` }], isError: true };
    const loc1 = geo1.data.results[0];
    const loc2 = geo2.data.results[0];
    const tempUnit = units === "celsius" ? "celsius" : "fahrenheit";
    const sym = units === "celsius" ? "°C" : "°F";
    const [w1, w2] = await Promise.all([
      apiFetch<WeatherResult>(`https://api.open-meteo.com/v1/forecast?latitude=${loc1.latitude}&longitude=${loc1.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature&temperature_unit=${tempUnit}&timezone=${encodeURIComponent(loc1.timezone)}`),
      apiFetch<WeatherResult>(`https://api.open-meteo.com/v1/forecast?latitude=${loc2.latitude}&longitude=${loc2.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature&temperature_unit=${tempUnit}&timezone=${encodeURIComponent(loc2.timezone)}`),
    ]);
    if (w1.error || w2.error) return { content: [{ type: "text", text: "Error fetching weather." }], isError: true };
    const c1 = w1.data!.current; const c2 = w2.data!.current;
    return { content: [{ type: "text", text: `🌍 Weather Comparison\n${"─".repeat(45)}\n                    ${loc1.name.padEnd(15)} ${loc2.name}\nCondition:          ${(WMO_CODES[c1.weather_code] || "?").padEnd(15)} ${WMO_CODES[c2.weather_code] || "?"}\nTemperature:        ${String(c1.temperature_2m + sym).padEnd(15)} ${c2.temperature_2m}${sym}\nHumidity:           ${String(c1.relative_humidity_2m + "%").padEnd(15)} ${c2.relative_humidity_2m}%\nWind:               ${String(c1.wind_speed_10m + " km/h").padEnd(15)} ${c2.wind_speed_10m} km/h` }] };
  }
);

// 🐙 GITHUB TOOLS

mcpServer.tool("get_github_user",
  "Gets public profile for any GitHub user.",
  { username: z.string().describe("GitHub username") },
  async ({ username }) => {
    const result = await apiFetch<GitHubUser>(`https://api.github.com/users/${username}`, { headers: getGitHubHeaders() });
    if (result.error) return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
    const u = result.data!;
    return { content: [{ type: "text", text: `🐙 ${u.login}\n${"─".repeat(30)}\nName: ${u.name || "not set"}\nBio: ${u.bio || "not set"}\nLocation: ${u.location || "not set"}\nRepos: ${u.public_repos} | Followers: ${u.followers}\nMember since: ${new Date(u.created_at).toLocaleDateString()}\n${u.html_url}` }] };
  }
);

mcpServer.tool("list_user_repos",
  "Lists public repos for a GitHub user.",
  { username: z.string(), limit: z.number().min(1).max(20).optional() },
  async ({ username, limit = 10 }) => {
    const result = await apiFetch<GitHubRepo[]>(`https://api.github.com/users/${username}/repos?sort=updated&per_page=${limit}`, { headers: getGitHubHeaders() });
    if (result.error) return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
    const repos = result.data!;
    if (!repos.length) return { content: [{ type: "text", text: `No repos found for ${username}.` }] };
    const list = repos.map((r, i) => `${i + 1}. ${r.name} ⭐${r.stargazers_count}\n   ${r.description || "No description"}\n   ${r.html_url}`).join("\n\n");
    return { content: [{ type: "text", text: `📦 ${repos.length} repos for ${username}:\n\n${list}` }] };
  }
);

mcpServer.tool("get_repo_info",
  "Gets details about a GitHub repository.",
  { owner: z.string(), repo: z.string() },
  async ({ owner, repo }) => {
    const result = await apiFetch<GitHubRepo>(`https://api.github.com/repos/${owner}/${repo}`, { headers: getGitHubHeaders() });
    if (result.error) return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
    const r = result.data!;
    return { content: [{ type: "text", text: `📦 ${r.full_name}\n${"─".repeat(35)}\n${r.description || "No description"}\nLanguage: ${r.language || "unknown"} | ⭐ ${r.stargazers_count} | 🍴 ${r.forks_count}\nIssues: ${r.open_issues_count} | ${r.private ? "🔒 Private" : "🌐 Public"}\nUpdated: ${new Date(r.updated_at).toLocaleDateString()}\n${r.html_url}` }] };
  }
);

mcpServer.tool("search_github_repos",
  "Searches GitHub for repositories matching a query.",
  { query: z.string(), limit: z.number().min(1).max(10).optional(), sort: z.enum(["stars", "forks", "updated"]).optional() },
  async ({ query, limit = 5, sort = "stars" }) => {
    const result = await apiFetch<GitHubSearchResult>(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&per_page=${limit}`, { headers: getGitHubHeaders() });
    if (result.error) return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
    const { total_count, items } = result.data!;
    const list = items.map((r, i) => `${i + 1}. ${r.full_name} ⭐${r.stargazers_count}\n   ${r.description || "No description"}\n   ${r.html_url}`).join("\n\n");
    return { content: [{ type: "text", text: `🔍 Top ${items.length} of ${total_count.toLocaleString()} for "${query}":\n\n${list}` }] };
  }
);

mcpServer.tool("get_readme",
  "Fetches the README of a GitHub repository.",
  { owner: z.string(), repo: z.string() },
  async ({ owner, repo }) => {
    const result = await apiFetch<string>(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: { ...getGitHubHeaders(), "Accept": "application/vnd.github.v3.raw" },
    });
    if (result.error) return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
    const readme = result.data as string;
    const truncated = readme.length > 2000 ? readme.slice(0, 2000) + "\n\n...(truncated)" : readme;
    return { content: [{ type: "text", text: `📖 README for ${owner}/${repo}:\n\n${truncated}` }] };
  }
);

// ──────────────────────────────────────────────────────────────
// 🆕 EXPRESS + SSE TRANSPORT SETUP
//
// THIS is what's new in Phase 5.
// Instead of StdioServerTransport, we use SSEServerTransport.
// Express handles the HTTP layer.
//
// Two endpoints:
//   GET  /sse      → client connects, gets a session ID + event stream
//   POST /messages → client sends a message for a specific session
//   GET  /health   → deployment platforms ping this to check server is alive
// ──────────────────────────────────────────────────────────────

const app = express();

// CORS — allows Claude.ai (and any browser) to connect to your server
app.use(cors({
  origin: "*", // In production you'd restrict this to specific domains
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());

// Track active sessions — each connected client gets their own transport
// This is how multiple clients can use your server simultaneously
const sessions = new Map<string, SSEServerTransport>();

// 🏥 Health check — Railway pings this to know your server is running
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: "phase5-mcp-sse",
    version: "1.0.0",
    activeSessions: sessions.size,
    tools: ["get_current_weather", "get_weather_forecast", "compare_weather", "get_github_user", "list_user_repos", "get_repo_info", "search_github_repos", "get_readme"],
    timestamp: new Date().toISOString(),
  });
});

// 🔌 SSE endpoint — client connects here to establish a session
app.get("/sse", async (req, res) => {
  console.error(`New SSE connection from ${req.ip}`);

  // Optional auth check
  if (AUTH_TOKEN) {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token !== AUTH_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  // Create a new SSE transport for this client
  // Each client gets their own transport instance
  const transport = new SSEServerTransport("/messages", res);
  sessions.set(transport.sessionId, transport);

  console.error(`Session started: ${transport.sessionId} (total: ${sessions.size})`);

  // Clean up when client disconnects
  req.on("close", () => {
    sessions.delete(transport.sessionId);
    console.error(`Session ended: ${transport.sessionId} (total: ${sessions.size})`);
  });

  // Connect this transport to the MCP server
  await mcpServer.connect(transport);
});

// 📨 Messages endpoint — client sends messages here
app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    res.status(400).json({ error: "Missing sessionId" });
    return;
  }

  const transport = sessions.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: `Session ${sessionId} not found` });
    return;
  }

  await transport.handlePostMessage(req, res);
});

// 🚀 Start the Express server
app.listen(PORT, () => {
  console.error(`✅ Phase 5 MCP SSE Server running on port ${PORT}`);
  console.error(`   🏥 Health: http://localhost:${PORT}/health`);
  console.error(`   🔌 SSE:    http://localhost:${PORT}/sse`);
  console.error(`   📨 Msgs:   http://localhost:${PORT}/messages`);
  console.error(`   🔑 GitHub token: ${GITHUB_TOKEN ? "✅ set" : "⚠️  not set"}`);
  console.error(`   🔒 Auth token: ${AUTH_TOKEN ? "✅ set" : "⚠️  not set (open access)"}`);
});
