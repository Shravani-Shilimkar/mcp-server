# 🚀 Phase 3: Note-taking (JSON) + SQLite MCP Server

The big leap — your first **stateful** MCP server. Data persists between tool calls.

---

## ⚙️ Setup

```bash
cd mcp-phase3
npm install
npm run inspect
```

---

## 📝 Notes Server (JSON Database) — 6 tools

All notes stored in `~/mcp-data/notes.json`

| Tool | What it does |
|---|---|
| `create_note` | Creates a note with title, content, tags |
| `list_notes` | Lists all notes, filterable by tag |
| `get_note` | Gets full content of a note by ID |
| `update_note` | Partial update — only change what you provide |
| `delete_note` | Permanently deletes a note |
| `search_notes` | Keyword search across title + content |

### Test sequence:
```
1. create_note → title: "MCP Learning", content: "Phase 3 teaches state!", tags: ["learning", "mcp"]
2. create_note → title: "Shopping list", content: "Milk, eggs, bread", tags: ["personal"]
3. list_notes                          → see both notes
4. list_notes  → tag: "learning"       → see only first note
5. search_notes → query: "state"       → finds first note
6. get_note    → id: (copy from list)  → full content
7. update_note → id: same, content: "Updated content!"
8. get_note    → same id              → see updated content
9. delete_note → id: second note
10. list_notes                         → only first note remains
```

---

## 🗄️ SQLite Server — 6 tools

Real SQL database stored in `~/mcp-data/tasks.db`

| Tool | What it does |
|---|---|
| `add_task` | Creates a task with priority + category |
| `list_tasks` | Lists tasks, filterable by status/priority |
| `update_task_status` | Moves task: todo → in_progress → done |
| `delete_task` | Deletes a task by ID |
| `get_stats` | Shows counts by status and priority |
| `run_query` | Run any custom SELECT SQL query |

### Test sequence:
```
1. add_task → title: "Build Phase 4", priority: "high", category: "MCP"
2. add_task → title: "Buy groceries", priority: "low", category: "Personal"
3. add_task → title: "Review notes", priority: "medium", category: "MCP"
4. list_tasks                              → all tasks
5. list_tasks → status: "todo"             → filtered
6. list_tasks → priority: "high"           → only urgent tasks
7. update_task_status → id: 1, status: "in_progress"
8. update_task_status → id: 1, status: "done"
9. get_stats                               → see the counts change!
10. run_query → "SELECT * FROM tasks JOIN categories ON tasks.category_id = categories.id"
```

---

## 🧠 New Concepts in Phase 3

### 1. Statefulness
```typescript
// Phase 1 & 2: stateless — every call starts fresh
// Phase 3: stateful — data written in one call is available in the next

await writeNotes(db);        // persist to disk
const db = await readNotes(); // read it back next call
```

### 2. JSON as a database
```typescript
// Read → modify in memory → write back
const db = await readNotes();
db.notes.push(newNote);
await writeNotes(db);
```

### 3. SQLite — real relational database
```typescript
// Initialize once at startup
const db = new Database("tasks.db");

// Create tables
db.exec(`CREATE TABLE IF NOT EXISTS tasks (...)`);

// Query data
const tasks = db.prepare("SELECT * FROM tasks WHERE status = ?").all("todo");
```

### 4. Partial updates
```typescript
// Only update fields the user provided — keep the rest unchanged
if (title !== undefined) note.title = title;
if (content !== undefined) note.content = content;
// updatedAt always changes
note.updatedAt = new Date().toISOString();
```

### 5. Table relationships
```sql
-- tasks.category_id references categories.id
-- JOIN lets you combine data from both tables
SELECT tasks.*, categories.name
FROM tasks
LEFT JOIN categories ON tasks.category_id = categories.id
```

---

## 🏆 Phase 3 Challenge

Add a `get_note_count_by_tag` tool that returns how many notes exist per tag:
```
learning: 3
personal: 1
work: 5
```
Hint: loop through all notes and count tag occurrences.

---

## ➡️ What's Next: Phase 4

- **Weather server** — wraps a real public API
- **GitHub server** — list repos, read files, create issues
- Learn: HTTP requests, API keys, async data fetching

---

## 📚 Resources
- better-sqlite3 docs: https://github.com/WiseLibs/better-sqlite3
- SQLite tutorial: https://www.sqlitetutorial.net
- MCP Docs: https://modelcontextprotocol.io
