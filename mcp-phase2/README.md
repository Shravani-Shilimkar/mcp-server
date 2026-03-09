# 🚀 Phase 2: Calculator + File Reader MCP Server

Building on Phase 1, this server teaches **error handling**, **input validation**, and **real file system access**.

---

## 📁 Project Structure

```
mcp-phase2/
├── src/
│   └── index.ts        ← Main server (read every comment!)
├── package.json
├── tsconfig.json
└── README.md
```

---

## ⚙️ Setup

```bash
cd mcp-phase2
npm install
npm run inspect
```

---

## 🧮 Calculator Tools (8 tools)

| Tool | What it does | New concept |
|---|---|---|
| `add` | Adds array of numbers | Array inputs |
| `subtract` | a - b | Basic tool |
| `multiply` | Multiplies array of numbers | Array inputs |
| `divide` | a ÷ b | `isError` on divide by zero |
| `power` | base^exponent | Math.pow |
| `square_root` | √number | `isError` on negative input |
| `percentage` | % calculations | Enum mode switching |
| `calculate` | Evaluates expressions like "(10+5)*2" | Safety validation |

---

## 📁 File Reader Tools (5 tools)

All file operations are sandboxed to `~/mcp-files/` for safety.

| Tool | What it does | New concept |
|---|---|---|
| `read_file` | Reads a file | fs.readFile, error codes |
| `write_file` | Creates/overwrites a file | fs.writeFile |
| `list_files` | Lists all files | fs.readdir + Promise.all |
| `delete_file` | Deletes a file | fs.unlink |
| `append_to_file` | Adds to end of file | fs.appendFile |

---

## 🧪 Test Sequences in the Inspector

### Calculator tests:
```
add         → numbers: [10, 20, 30]           → 60
divide      → a: 10, b: 0                     → isError: true ✅
square_root → number: -4                      → isError: true ✅
calculate   → expression: "(100 + 50) * 2"   → 300
percentage  → value: 25, total: 200, mode: of_total → 12.5%
```

### File tests (run in this order):
```
1. list_files                                    → empty sandbox
2. write_file  → filename: test.txt, content: "Hello MCP Phase 2!"
3. list_files                                    → shows test.txt
4. read_file   → filename: test.txt             → shows content
5. append_to_file → filename: test.txt, content: "\nLine 2 added!"
6. read_file   → filename: test.txt             → shows both lines
7. delete_file → filename: test.txt
8. list_files                                    → empty again
```

---

## 🧠 New Concepts Learned in Phase 2

### 1. Error Handling with isError
```typescript
// When a tool fails, signal it with isError: true
// Claude reads this and knows to handle the failure gracefully
return {
  content: [{ type: "text", text: "Error: Cannot divide by zero." }],
  isError: true,
};
```

### 2. Real File System Access
```typescript
import fs from "fs/promises";
import path from "path";

// Always use async fs methods — never the sync versions
const content = await fs.readFile(filePath, "utf-8");
```

### 3. Sandboxing for Safety
```typescript
// Restrict all file operations to one safe directory
const SANDBOX_DIR = path.join(process.env.HOME, "mcp-files");

// Prevent path traversal attacks
function safePath(filename: string): string {
  return path.join(SANDBOX_DIR, path.basename(filename));
}
```

### 4. Error Code Handling
```typescript
// Node.js file errors have a .code property
if (error.code === "ENOENT") {
  // File not found — give a helpful message
}
```

---

## 🏆 Phase 2 Challenge

Before moving to Phase 3, add this tool yourself:

```typescript
// word_count — reads a file and counts words, lines, and characters
server.tool(
  "word_count",
  "Counts the words, lines, and characters in a file.",
  { filename: z.string().describe("File to count") },
  async ({ filename }) => {
    // Hint: use read_file logic, then split by spaces/newlines
  }
);
```

---

## ➡️ What's Next: Phase 3

- **Note-taking server** — CRUD with a JSON database
- **SQLite server** — real database queries via tools
- Learn: stateful servers, persisting data between tool calls

---

## 📚 Resources
- Node.js fs docs: https://nodejs.org/api/fs.html
- MCP SDK: https://github.com/modelcontextprotocol/typescript-sdk
- MCP Docs: https://modelcontextprotocol.io
