/**
 * ============================================================
 *  PHASE 4: Weather + GitHub API MCP Server
 * ============================================================
 *
 * WHAT'S NEW IN PHASE 4 vs PHASE 3:
 *  ✅ HTTP requests — fetching data from the real internet
 *  ✅ Public APIs — no auth needed (Weather via open-meteo)
 *  ✅ Authenticated APIs — GitHub API with a personal token
 *  ✅ API key management — reading secrets from environment variables
 *  ✅ Rate limiting awareness — handling API limits gracefully
 *  ✅ Response parsing — turning raw API JSON into useful output
 *  ✅ Error handling for network failures — timeouts, 404s, 401s
 *
 * THE BIG CONCEPT: YOUR SERVER TALKS TO THE INTERNET
 *  Phase 3 tools read/wrote local files.
 *  Phase 4 tools make HTTP requests to external services.
 *  This is how 99% of production MCP servers work —
 *  they're essentially API wrappers that Claude can call.
 *
 * TWO SERVERS IN ONE:
 *  1. 🌤️  Weather Server — open-meteo.com (completely free, no key)
 *  2. 🐙 GitHub Server — api.github.com (free, needs a token)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "phase4-weather-github",
  version: "1.0.0",
});

// ──────────────────────────────────────────────────────────────
// 🌍 HELPER: Generic fetch with error handling
//
// NEW CONCEPT: Wrapping fetch() with proper error handling
// Every HTTP call can fail in different ways:
//   - Network error (no internet, timeout)
//   - 4xx errors (bad request, unauthorized, not found)
//   - 5xx errors (server crashed)
// We handle all of these gracefully.
// ──────────────────────────────────────────────────────────────

async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "mcp-phase4-server", // GitHub API requires a User-Agent
        ...options.headers,
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      // Handle specific HTTP error codes
      if (response.status === 401) return { data: null, error: "Unauthorized — check your API token." };
      if (response.status === 403) return { data: null, error: "Forbidden — rate limit hit or insufficient permissions." };
      if (response.status === 404) return { data: null, error: "Not found — check the resource name." };
      return { data: null, error: `API error: HTTP ${response.status}` };
    }

    // const data = await response.json() as T;
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json() as T
      : await response.text() as T;
    return { data, error: null };

  } catch (err: unknown) {
    const error = err as Error;
    if (error.name === "TimeoutError") return { data: null, error: "Request timed out after 10 seconds." };
    if (error.name === "TypeError") return { data: null, error: "Network error — check your internet connection." };
    return { data: null, error: `Unexpected error: ${error.message}` };
  }
}

// ──────────────────────────────────────────────────────────────
// 🌤️ SECTION 1: WEATHER SERVER
//
// Uses open-meteo.com — completely free, no API key required!
// Two-step process:
//   1. Geocoding API: city name → latitude/longitude
//   2. Weather API: latitude/longitude → weather data
//
// This teaches: chained API calls, data transformation,
// working with coordinates and units
// ──────────────────────────────────────────────────────────────

// Weather code descriptions (WMO standard codes)
const WMO_CODES: Record<number, string> = {
  0: "Clear sky ☀️", 1: "Mainly clear 🌤️", 2: "Partly cloudy ⛅", 3: "Overcast ☁️",
  45: "Foggy 🌫️", 48: "Icy fog 🌫️",
  51: "Light drizzle 🌦️", 53: "Moderate drizzle 🌦️", 55: "Dense drizzle 🌦️",
  61: "Slight rain 🌧️", 63: "Moderate rain 🌧️", 65: "Heavy rain 🌧️",
  71: "Slight snow 🌨️", 73: "Moderate snow 🌨️", 75: "Heavy snow ❄️",
  77: "Snow grains ❄️",
  80: "Slight showers 🌦️", 81: "Moderate showers 🌦️", 82: "Violent showers ⛈️",
  85: "Slight snow showers 🌨️", 86: "Heavy snow showers ❄️",
  95: "Thunderstorm ⛈️", 96: "Thunderstorm with hail ⛈️", 99: "Thunderstorm with heavy hail ⛈️",
};

interface GeocodingResult {
  results?: Array<{ latitude: number; longitude: number; name: string; country: string; timezone: string }>;
}

interface WeatherResult {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    weather_code: number;
    apparent_temperature: number;
    precipitation: number;
  };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    time: string[];
    precipitation_sum: number[];
  };
}

// Tool 1: get_current_weather
server.tool(
  "get_current_weather",
  "Gets the current weather for any city in the world. Returns temperature, humidity, wind speed, and conditions.",
  {
    city: z.string().describe("City name e.g. 'London', 'Tokyo', 'New York'"),
    units: z.enum(["celsius", "fahrenheit"]).optional().describe("Temperature units (default: celsius)"),
  },
  async ({ city, units = "celsius" }) => {
    // Step 1: Geocode city name to coordinates
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
    const geo = await apiFetch<GeocodingResult>(geoUrl);

    if (geo.error) return { content: [{ type: "text", text: `Geocoding error: ${geo.error}` }], isError: true };
    if (!geo.data?.results?.length) {
      return { content: [{ type: "text", text: `City "${city}" not found. Try a different spelling.` }], isError: true };
    }

    const { latitude, longitude, name, country, timezone } = geo.data.results[0];
    const tempUnit = units === "celsius" ? "celsius" : "fahrenheit";
    const unitSymbol = units === "celsius" ? "°C" : "°F";

    // Step 2: Fetch current weather using coordinates
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature,precipitation&temperature_unit=${tempUnit}&wind_speed_unit=kmh&timezone=${encodeURIComponent(timezone)}`;
    const weather = await apiFetch<WeatherResult>(weatherUrl);

    if (weather.error) return { content: [{ type: "text", text: `Weather error: ${weather.error}` }], isError: true };

    const c = weather.data!.current;
    const condition = WMO_CODES[c.weather_code] || "Unknown";

    return {
      content: [{
        type: "text",
        text: `🌍 Weather in ${name}, ${country}
${"─".repeat(35)}
Condition:    ${condition}
Temperature:  ${c.temperature_2m}${unitSymbol} (feels like ${c.apparent_temperature}${unitSymbol})
Humidity:     ${c.relative_humidity_2m}%
Wind Speed:   ${c.wind_speed_10m} km/h
Precipitation: ${c.precipitation} mm
Timezone:     ${timezone}`,
      }],
    };
  }
);

// Tool 2: get_weather_forecast
server.tool(
  "get_weather_forecast",
  "Gets a multi-day weather forecast for any city. Returns daily high/low temperatures and conditions.",
  {
    city: z.string().describe("City name"),
    days: z.number().min(1).max(7).optional().describe("Number of forecast days (1-7, default: 5)"),
    units: z.enum(["celsius", "fahrenheit"]).optional().describe("Temperature units"),
  },
  async ({ city, days = 5, units = "celsius" }) => {
    // Geocode first
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
    const geo = await apiFetch<GeocodingResult>(geoUrl);

    if (geo.error || !geo.data?.results?.length) {
      return { content: [{ type: "text", text: `City "${city}" not found.` }], isError: true };
    }

    const { latitude, longitude, name, country, timezone } = geo.data.results[0];
    const tempUnit = units === "celsius" ? "celsius" : "fahrenheit";
    const unitSymbol = units === "celsius" ? "°C" : "°F";

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum&temperature_unit=${tempUnit}&timezone=${encodeURIComponent(timezone)}&forecast_days=${days}`;
    const weather = await apiFetch<WeatherResult>(weatherUrl);

    if (weather.error) return { content: [{ type: "text", text: `Forecast error: ${weather.error}` }], isError: true };

    const d = weather.data!.daily;
    const forecastLines = d.time.map((date, i) => {
      const condition = WMO_CODES[d.weather_code[i]] || "Unknown";
      return `  ${date}  ${condition}\n             High: ${d.temperature_2m_max[i]}${unitSymbol} | Low: ${d.temperature_2m_min[i]}${unitSymbol} | Rain: ${d.precipitation_sum[i]}mm`;
    }).join("\n\n");

    return {
      content: [{
        type: "text",
        text: `📅 ${days}-Day Forecast for ${name}, ${country}\n${"─".repeat(40)}\n\n${forecastLines}`,
      }],
    };
  }
);

// Tool 3: compare_weather
server.tool(
  "compare_weather",
  "Compares current weather between two cities side by side.",
  {
    city1: z.string().describe("First city"),
    city2: z.string().describe("Second city"),
    units: z.enum(["celsius", "fahrenheit"]).optional().describe("Temperature units"),
  },
  async ({ city1, city2, units = "celsius" }) => {
    // Fetch both cities in parallel — NEW CONCEPT: Promise.all for concurrent API calls
    const [geo1, geo2] = await Promise.all([
      apiFetch<GeocodingResult>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city1)}&count=1`),
      apiFetch<GeocodingResult>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city2)}&count=1`),
    ]);

    if (!geo1.data?.results?.length) return { content: [{ type: "text", text: `City "${city1}" not found.` }], isError: true };
    if (!geo2.data?.results?.length) return { content: [{ type: "text", text: `City "${city2}" not found.` }], isError: true };

    const loc1 = geo1.data.results[0];
    const loc2 = geo2.data.results[0];
    const tempUnit = units === "celsius" ? "celsius" : "fahrenheit";
    const unitSymbol = units === "celsius" ? "°C" : "°F";

    const [w1, w2] = await Promise.all([
      apiFetch<WeatherResult>(`https://api.open-meteo.com/v1/forecast?latitude=${loc1.latitude}&longitude=${loc1.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature&temperature_unit=${tempUnit}&timezone=${encodeURIComponent(loc1.timezone)}`),
      apiFetch<WeatherResult>(`https://api.open-meteo.com/v1/forecast?latitude=${loc2.latitude}&longitude=${loc2.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature&temperature_unit=${tempUnit}&timezone=${encodeURIComponent(loc2.timezone)}`),
    ]);

    if (w1.error || w2.error) return { content: [{ type: "text", text: "Error fetching weather data." }], isError: true };

    const c1 = w1.data!.current;
    const c2 = w2.data!.current;

    return {
      content: [{
        type: "text",
        text: `🌍 Weather Comparison
${"─".repeat(45)}
                    ${loc1.name.padEnd(15)} ${loc2.name}
Condition:          ${(WMO_CODES[c1.weather_code] || "?").padEnd(15)} ${WMO_CODES[c2.weather_code] || "?"}
Temperature:        ${String(c1.temperature_2m + unitSymbol).padEnd(15)} ${c2.temperature_2m}${unitSymbol}
Feels like:         ${String(c1.apparent_temperature + unitSymbol).padEnd(15)} ${c2.apparent_temperature}${unitSymbol}
Humidity:           ${String(c1.relative_humidity_2m + "%").padEnd(15)} ${c2.relative_humidity_2m}%
Wind:               ${String(c1.wind_speed_10m + " km/h").padEnd(15)} ${c2.wind_speed_10m} km/h`,
      }],
    };
  }
);

// ──────────────────────────────────────────────────────────────
// 🐙 SECTION 2: GITHUB SERVER
//
// Uses api.github.com
//
// NEW CONCEPT: API Authentication
// GitHub's API is free but requires a Personal Access Token (PAT)
// for most operations. We read it from an environment variable —
// NEVER hardcode secrets in your code!
//
// How to get a token:
//   1. Go to github.com → Settings → Developer settings
//   2. Personal access tokens → Tokens (classic) → Generate new token
//   3. Select scopes: repo, read:user
//   4. Copy the token
//   5. Set it: export GITHUB_TOKEN=your_token_here
//
// Public endpoints (no token needed): search repos, get public user info
// Private endpoints (token needed): your repos, create issues, etc.
// ──────────────────────────────────────────────────────────────

function getGitHubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  updated_at: string;
  open_issues_count: number;
  private: boolean;
}

interface GitHubUser {
  login: string;
  name: string | null;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
  company: string | null;
  location: string | null;
  html_url: string;
  created_at: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  created_at: string;
  user: { login: string };
  labels: Array<{ name: string }>;
  body: string | null;
}

interface GitHubSearchResult {
  total_count: number;
  items: GitHubRepo[];
}

// Tool 4: get_github_user
server.tool(
  "get_github_user",
  "Gets public profile information for any GitHub user.",
  {
    username: z.string().describe("GitHub username e.g. 'torvalds', 'gaearon'"),
  },
  async ({ username }) => {
    const result = await apiFetch<GitHubUser>(
      `https://api.github.com/users/${username}`,
      { headers: getGitHubHeaders() }
    );

    if (result.error) return { content: [{ type: "text", text: `GitHub error: ${result.error}` }], isError: true };
    const u = result.data!;

    return {
      content: [{
        type: "text",
        text: `🐙 GitHub User: ${u.login}
${"─".repeat(35)}
Name:         ${u.name || "not set"}
Bio:          ${u.bio || "not set"}
Company:      ${u.company || "not set"}
Location:     ${u.location || "not set"}
Public Repos: ${u.public_repos}
Followers:    ${u.followers}
Following:    ${u.following}
Member since: ${new Date(u.created_at).toLocaleDateString()}
Profile URL:  ${u.html_url}`,
      }],
    };
  }
);

// Tool 5: list_user_repos
server.tool(
  "list_user_repos",
  "Lists public repositories for any GitHub user, sorted by most recently updated.",
  {
    username: z.string().describe("GitHub username"),
    limit: z.number().min(1).max(20).optional().describe("Number of repos to return (default: 10)"),
  },
  async ({ username, limit = 10 }) => {
    const result = await apiFetch<GitHubRepo[]>(
      `https://api.github.com/users/${username}/repos?sort=updated&per_page=${limit}`,
      { headers: getGitHubHeaders() }
    );

    if (result.error) return { content: [{ type: "text", text: `GitHub error: ${result.error}` }], isError: true };
    const repos = result.data!;

    if (repos.length === 0) return { content: [{ type: "text", text: `No public repos found for ${username}.` }] };

    const list = repos.map((r, i) =>
      `${i + 1}. ${r.name} ⭐${r.stargazers_count}\n   ${r.description || "No description"}\n   Language: ${r.language || "unknown"} | Forks: ${r.forks_count} | Issues: ${r.open_issues_count}\n   ${r.html_url}`
    ).join("\n\n");

    return {
      content: [{
        type: "text",
        text: `📦 ${repos.length} repos for ${username}:\n\n${list}`,
      }],
    };
  }
);

// Tool 6: get_repo_info
server.tool(
  "get_repo_info",
  "Gets detailed information about a specific GitHub repository.",
  {
    owner: z.string().describe("Repository owner username"),
    repo: z.string().describe("Repository name"),
  },
  async ({ owner, repo }) => {
    const result = await apiFetch<GitHubRepo>(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers: getGitHubHeaders() }
    );

    if (result.error) return { content: [{ type: "text", text: `GitHub error: ${result.error}` }], isError: true };
    const r = result.data!;

    return {
      content: [{
        type: "text",
        text: `📦 ${r.full_name}
${"─".repeat(40)}
Description:  ${r.description || "none"}
Language:     ${r.language || "unknown"}
Stars:        ⭐ ${r.stargazers_count}
Forks:        🍴 ${r.forks_count}
Open Issues:  🐛 ${r.open_issues_count}
Visibility:   ${r.private ? "🔒 Private" : "🌐 Public"}
Last updated: ${new Date(r.updated_at).toLocaleDateString()}
URL:          ${r.html_url}`,
      }],
    };
  }
);

// Tool 7: list_repo_issues
server.tool(
  "list_repo_issues",
  "Lists open issues for a GitHub repository.",
  {
    owner: z.string().describe("Repository owner"),
    repo: z.string().describe("Repository name"),
    limit: z.number().min(1).max(20).optional().describe("Number of issues to return (default: 10)"),
    state: z.enum(["open", "closed", "all"]).optional().describe("Issue state (default: open)"),
  },
  async ({ owner, repo, limit = 10, state = "open" }) => {
    const result = await apiFetch<GitHubIssue[]>(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=${state}&per_page=${limit}`,
      { headers: getGitHubHeaders() }
    );

    if (result.error) return { content: [{ type: "text", text: `GitHub error: ${result.error}` }], isError: true };
    const issues = result.data!.filter(i => !(i as unknown as { pull_request?: unknown }).pull_request); // exclude PRs

    if (issues.length === 0) return { content: [{ type: "text", text: `No ${state} issues found in ${owner}/${repo}.` }] };

    const list = issues.map(i =>
      `#${i.number} ${i.title}\n   By: ${i.user.login} | Labels: ${i.labels.map(l => l.name).join(", ") || "none"}\n   ${i.html_url}`
    ).join("\n\n");

    return {
      content: [{
        type: "text",
        text: `🐛 ${issues.length} ${state} issue(s) in ${owner}/${repo}:\n\n${list}`,
      }],
    };
  }
);

// Tool 8: search_github_repos
server.tool(
  "search_github_repos",
  "Searches GitHub for repositories matching a query. Useful for finding popular projects.",
  {
    query: z.string().describe("Search query e.g. 'mcp server typescript', 'react hooks'"),
    limit: z.number().min(1).max(10).optional().describe("Number of results (default: 5)"),
    sort: z.enum(["stars", "forks", "updated"]).optional().describe("Sort by (default: stars)"),
  },
  async ({ query, limit = 5, sort = "stars" }) => {
    const result = await apiFetch<GitHubSearchResult>(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&per_page=${limit}`,
      { headers: getGitHubHeaders() }
    );

    if (result.error) return { content: [{ type: "text", text: `Search error: ${result.error}` }], isError: true };

    const { total_count, items } = result.data!;
    if (items.length === 0) return { content: [{ type: "text", text: `No repos found for "${query}".` }] };

    const list = items.map((r, i) =>
      `${i + 1}. ${r.full_name} ⭐${r.stargazers_count}\n   ${r.description || "No description"}\n   Language: ${r.language || "unknown"}\n   ${r.html_url}`
    ).join("\n\n");

    return {
      content: [{
        type: "text",
        text: `🔍 Top ${items.length} of ${total_count.toLocaleString()} results for "${query}":\n\n${list}`,
      }],
    };
  }
);

// Tool 9: get_readme
server.tool(
  "get_readme",
  "Fetches and displays the README of a GitHub repository.",
  {
    owner: z.string().describe("Repository owner"),
    repo: z.string().describe("Repository name"),
  },
  async ({ owner, repo }) => {
    const result = await apiFetch<string>(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      {
        headers: {
          ...getGitHubHeaders(),
          "Accept": "application/vnd.github.v3.raw", // get raw text, not JSON
        },
      }
    );

    if (result.error) return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };

    const readme = result.data as string;
    const truncated = readme.length > 2000
      ? readme.slice(0, 2000) + "\n\n... (truncated)"
      : readme;

    return {
      content: [{
        type: "text",
        text: `📖 README for ${owner}/${repo}:\n\n${truncated}`,
      }],
    };
  }
);

// ──────────────────────────────────────────────────────────────
// RESOURCE: API status — shows which APIs are configured
// ──────────────────────────────────────────────────────────────
server.resource(
  "api_status",
  "mcp://phase4/status",
  async () => {
    const hasGitHubToken = !!process.env.GITHUB_TOKEN;
    return {
      contents: [{
        uri: "mcp://phase4/status",
        mimeType: "text/plain",
        text: `
Phase 4 API Status
==================
🌤️  Weather API (open-meteo): ✅ Ready — no key needed
🐙 GitHub API: ${hasGitHubToken ? "✅ Token configured" : "⚠️  No token — public endpoints only"}

Tools available:
  Weather: get_current_weather, get_weather_forecast, compare_weather
  GitHub:  get_github_user, list_user_repos, get_repo_info, list_repo_issues, search_github_repos, get_readme

To add GitHub token:
  export GITHUB_TOKEN=your_token_here
  (then restart the server)
        `.trim(),
      }],
    };
  }
);

// ── Start server ──
const transport = new StdioServerTransport();
await server.connect(transport);

const hasToken = !!process.env.GITHUB_TOKEN;
console.error("✅ Phase 4 MCP Server running!");
console.error("   🌤️  Weather: get_current_weather, get_weather_forecast, compare_weather");
console.error("   🐙 GitHub: get_github_user, list_user_repos, get_repo_info, list_repo_issues, search_github_repos, get_readme");
console.error(`   🔑 GitHub token: ${hasToken ? "✅ configured" : "⚠️  not set (public endpoints only)"}`);
