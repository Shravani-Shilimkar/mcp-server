# 🚀 Phase 1: Hello World MCP Server

Your first MCP server! This project teaches you the 3 core primitives of MCP:
**Tools**, **Resources**, and **Prompts**.

---

## 📁 Project Structure

```
mcp-phase1/
├── src/
│   └── index.ts               ← Main server file (read every comment!)
├── package.json
├── tsconfig.json
└── claude_desktop_config.example.json
```

---

## ⚙️ Setup (3 steps)

### Step 1 — Install dependencies
```bash
cd mcp-phase1
npm install
```

### Step 2 — Run with the MCP Inspector (best for learning!)
The Inspector is a browser UI that lets you call your tools and see exactly what's happening.
```bash
npm run inspect
```
Then open `http://localhost:5173` in your browser.

### Step 3 — Connect to Claude Desktop (to use it for real)
```bash
# First, build the TypeScript to JavaScript
npm run build

# Find your absolute path
pwd   # Copy this output!
```

Then open your Claude Desktop config:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Paste this (replacing `/YOUR/PATH`):
```json
{
  "mcpServers": {
    "hello-world": {
      "command": "node",
      "args": ["/YOUR/PATH/mcp-phase1/build/index.js"]
    }
  }
}
```

Restart Claude Desktop. You'll see a 🔌 icon confirming your server is connected!

---

## 🧪 Testing Your Tools

Once connected to Claude Desktop, try these prompts:

| What to type to Claude | What it triggers |
|---|---|
| "Say hello" | `say_hello` tool |
| "Greet Alice in Spanish" | `greet_person` tool |
| "What is 42 + 58?" | `add_numbers` tool |
| "Tell me about this server" | `get_server_info` tool |
| "Show me the readme" | `readme` resource |

---

## 🧠 Key Concepts Learned

### 1. Tools — Claude can DO things
```typescript
server.tool("tool_name", "description for Claude", { inputSchema }, async (inputs) => {
  return { content: [{ type: "text", text: "result" }] };
});
```

### 2. Resources — Claude can READ data
```typescript
server.resource("name", "uri://path", async () => {
  return { contents: [{ uri, mimeType, text: "data" }] };
});
```

### 3. Prompts — Claude gets templates
```typescript
server.prompt("name", "description", [{ name, required }], async (args) => {
  return { messages: [{ role: "user", content: { type: "text", text: "..." } }] };
});
```

### 4. ⚠️ The #1 Gotcha
```typescript
// ❌ NEVER — breaks the JSON-RPC stream!
console.log("something");

// ✅ ALWAYS — uses stderr, safe
console.error("something");
```

---

## 🔬 Understanding the Architecture

```
You (Claude Desktop)
     │
     │  JSON-RPC messages over stdin/stdout
     ▼
StdioServerTransport  ← handles message framing
     │
     ▼
McpServer             ← routes to correct tool/resource/prompt
     │
     ├── say_hello()
     ├── greet_person()
     ├── add_numbers()
     └── get_server_info()
```

---

## ➡️ What's Next: Phase 2

You'll build:
- **Calculator server** — more complex math with error handling
- **File Reader server** — actually reading files from disk using Node's `fs` module

Challenge before Phase 2:
> Add a new tool called `get_joke` that returns a random joke from a hardcoded list of 5 jokes. No inputs needed. Test it in the MCP Inspector!

---

## 📚 Resources

- Official MCP Docs: https://modelcontextprotocol.io
- TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- MCP Inspector: run `npm run inspect`
- Microsoft MCP for Beginners: https://github.com/microsoft/mcp-for-beginners
