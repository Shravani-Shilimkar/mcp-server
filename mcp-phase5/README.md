# 🚀 Phase 5: SSE Transport + Railway Deployment

Your MCP server goes live on the internet!

---

## ⚙️ Local Setup

```bash
cd mcp-phase5
npm install
npm run dev
```

Test locally:
```bash
# Health check
curl http://localhost:3000/health

# Connect via Inspector
npx @modelcontextprotocol/inspector --cli http://localhost:3000/sse
```

---

## 🚀 Deploy to Railway (Step by Step)

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Phase 5: SSE MCP server"
git remote add origin https://github.com/YOUR_USERNAME/mcp-phase5.git
git push -u origin main
```

### Step 2 — Create Railway account
Go to https://railway.app → Sign up with GitHub

### Step 3 — Deploy
1. Railway dashboard → **New Project**
2. **Deploy from GitHub repo** → select `mcp-phase5`
3. Railway auto-detects Dockerfile and deploys!

### Step 4 — Set environment variables
In Railway dashboard → your service → **Variables**:
```
GITHUB_TOKEN=your_github_token   (optional)
MCP_AUTH_TOKEN=some_secret       (optional, for security)
```

### Step 5 — Get your URL
Railway dashboard → your service → **Settings** → **Domains**
Click **Generate Domain** → you get a URL like:
`https://mcp-phase5-production.up.railway.app`

### Step 6 — Test your live server
```bash
curl https://your-url.railway.app/health
```

---

## 🔗 Connect to Claude.ai

1. Go to claude.ai → **Settings** → **Integrations**
2. Click **Add Integration**
3. Enter your Railway URL: `https://your-url.railway.app/sse`
4. Click Connect — your tools appear in Claude! 🎉

---

## 🧠 Key Concepts Learned

### stdio vs SSE
```
stdio: Claude Desktop spawns your server locally
  Claude Desktop → stdin/stdout → your server

SSE: Your server runs on the web
  Claude.ai → HTTP → your server → SSE stream → Claude.ai
```

### Session management
Each client that connects gets a unique sessionId.
Multiple clients can use your server simultaneously.

### Health checks
Deployment platforms ping /health to verify your server is alive.
If it returns non-200, the platform restarts your server.

### Environment variables in production
Never commit secrets. Set them in Railway's dashboard.
Your code reads them with process.env.VARIABLE_NAME.

---

## 🔑 The Transport Comparison

| Feature | stdio (Phase 1-4) | SSE (Phase 5) |
|---|---|---|
| Who connects | Claude Desktop only | Anyone with the URL |
| Where it runs | Your local machine | Any server/cloud |
| Multiple clients | ❌ One at a time | ✅ Many simultaneous |
| Accessible from | Local only | Anywhere |
| Setup | Simple | Needs Express |

---

## ➡️ What's Next: Phase 6 (Capstone)

Build your own MCP server that solves a real problem you have!
Ideas: personal finance tracker, study notes assistant,
project management tool, recipe manager, habit tracker...
