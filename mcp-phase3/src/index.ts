/**
 * ============================================================
 *  PHASE 3: Note-taking (JSON DB) + SQLite MCP Server
 * ============================================================
 *
 * WHAT'S NEW IN PHASE 3 vs PHASE 2:
 *  ✅ STATE — data persists between tool calls
 *  ✅ JSON as a database — store structured data in a .json file
 *  ✅ SQLite via sql.js — real SQL database, pure JavaScript
 *  ✅ CRUD operations — Create, Read, Update, Delete
 *  ✅ Server startup logic — initializing DB on boot
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import initSqlJs from "sql.js";

const server = new McpServer({
  name: "phase3-notes-sqlite",
  version: "1.0.0",
});

// ──────────────────────────────────────────────────────────────
// 📝 SECTION 1: NOTE-TAKING SERVER (JSON Database)
// ──────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.env.HOME || "~", "mcp-data");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");
const DB_FILE = path.join(DATA_DIR, "tasks.db");

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface NotesDB {
  notes: Note[];
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function readNotes(): Promise<NotesDB> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(NOTES_FILE, "utf-8");
    return JSON.parse(raw) as NotesDB;
  } catch {
    return { notes: [] };
  }
}

async function writeNotes(db: NotesDB): Promise<void> {
  await fs.writeFile(NOTES_FILE, JSON.stringify(db, null, 2), "utf-8");
}

// ── NOTE TOOLS ──

server.tool("create_note", "Creates a new note with a title, content, and optional tags.",
  {
    title: z.string().min(1).describe("Title of the note"),
    content: z.string().describe("Content/body of the note"),
    tags: z.array(z.string()).optional().describe("Optional list of tags e.g. ['work', 'ideas']"),
  },
  async ({ title, content, tags = [] }) => {
    const db = await readNotes();
    const note: Note = {
      id: generateId(), title, content, tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.notes.push(note);
    await writeNotes(db);
    return {
      content: [{ type: "text", text: `✅ Note created!\n\nID: ${note.id}\nTitle: ${note.title}\nTags: ${note.tags.join(", ") || "none"}` }],
    };
  }
);

server.tool("list_notes", "Lists all notes. Can filter by tag.",
  { tag: z.string().optional().describe("Optional tag to filter notes by") },
  async ({ tag }) => {
    const db = await readNotes();
    let notes = db.notes;
    if (tag) notes = notes.filter(n => n.tags.includes(tag));
    if (notes.length === 0) {
      return { content: [{ type: "text", text: tag ? `No notes with tag "${tag}".` : "No notes yet. Use create_note!" }] };
    }
    const list = notes.map((n, i) =>
      `${i + 1}. [${n.id}] ${n.title}\n   Tags: ${n.tags.join(", ") || "none"} | Created: ${new Date(n.createdAt).toLocaleDateString()}`
    ).join("\n\n");
    return { content: [{ type: "text", text: `📝 ${notes.length} note(s):\n\n${list}` }] };
  }
);

server.tool("get_note", "Gets the full content of a note by its ID.",
  { id: z.string().describe("The ID of the note to retrieve") },
  async ({ id }) => {
    const db = await readNotes();
    const note = db.notes.find(n => n.id === id);
    if (!note) return { content: [{ type: "text", text: `Error: Note "${id}" not found.` }], isError: true };
    return {
      content: [{ type: "text", text: `📄 ${note.title}\n${"─".repeat(40)}\n${note.content}\n${"─".repeat(40)}\nID: ${note.id}\nTags: ${note.tags.join(", ") || "none"}\nCreated: ${new Date(note.createdAt).toLocaleString()}` }],
    };
  }
);

server.tool("update_note", "Updates a note's title, content, or tags by ID.",
  {
    id: z.string().describe("The ID of the note to update"),
    title: z.string().optional().describe("New title"),
    content: z.string().optional().describe("New content"),
    tags: z.array(z.string()).optional().describe("New tags"),
  },
  async ({ id, title, content, tags }) => {
    const db = await readNotes();
    const index = db.notes.findIndex(n => n.id === id);
    if (index === -1) return { content: [{ type: "text", text: `Error: Note "${id}" not found.` }], isError: true };
    if (title !== undefined) db.notes[index].title = title;
    if (content !== undefined) db.notes[index].content = content;
    if (tags !== undefined) db.notes[index].tags = tags;
    db.notes[index].updatedAt = new Date().toISOString();
    await writeNotes(db);
    return { content: [{ type: "text", text: `✅ Note "${db.notes[index].title}" updated!` }] };
  }
);

server.tool("delete_note", "Permanently deletes a note by ID.",
  { id: z.string().describe("The ID of the note to delete") },
  async ({ id }) => {
    const db = await readNotes();
    const index = db.notes.findIndex(n => n.id === id);
    if (index === -1) return { content: [{ type: "text", text: `Error: Note "${id}" not found.` }], isError: true };
    const title = db.notes[index].title;
    db.notes.splice(index, 1);
    await writeNotes(db);
    return { content: [{ type: "text", text: `🗑️ Note "${title}" deleted.` }] };
  }
);

server.tool("search_notes", "Searches notes by keyword in title or content.",
  { query: z.string().min(1).describe("Search keyword") },
  async ({ query }) => {
    const db = await readNotes();
    const lower = query.toLowerCase();
    const results = db.notes.filter(n =>
      n.title.toLowerCase().includes(lower) || n.content.toLowerCase().includes(lower)
    );
    if (results.length === 0) return { content: [{ type: "text", text: `No notes matching "${query}".` }] };
    const list = results.map(n => `[${n.id}] ${n.title}\n   ${n.content.slice(0, 80)}...`).join("\n\n");
    return { content: [{ type: "text", text: `🔍 ${results.length} result(s):\n\n${list}` }] };
  }
);

// ──────────────────────────────────────────────────────────────
// 🗄️ SECTION 2: SQLITE SERVER (using sql.js — pure JS, no native deps)
//
// sql.js works differently from better-sqlite3:
// - It runs entirely in memory
// - We manually save/load the .db file on each operation
// - Same SQL syntax, just cross-platform compatible
// ──────────────────────────────────────────────────────────────

// Initialize sql.js
const SQL = await initSqlJs();
await fs.mkdir(DATA_DIR, { recursive: true });

// Helper: load DB from disk (or create fresh)
async function loadDb() {
  try {
    const fileBuffer = await fs.readFile(DB_FILE);
    return new SQL.Database(fileBuffer);
  } catch {
    // DB doesn't exist yet — create fresh
    const db = new SQL.Database();
    db.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#808080',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'todo',
        priority TEXT DEFAULT 'medium',
        category_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
    await saveDb(db);
    return db;
  }
}

// Helper: save DB back to disk
async function saveDb(db: InstanceType<typeof SQL.Database>) {
  const data = db.export();
  await fs.writeFile(DB_FILE, Buffer.from(data));
  db.close();
}

// ── SQLITE TOOLS ──

server.tool("add_task", "Adds a new task with title, priority, and optional category.",
  {
    title: z.string().min(1).describe("Title of the task"),
    description: z.string().optional().describe("Task description"),
    priority: z.enum(["low", "medium", "high"]).optional().describe("Priority (default: medium)"),
    category: z.string().optional().describe("Category name (auto-created if new)"),
  },
  async ({ title, description = "", priority = "medium", category }) => {
    const db = await loadDb();
    let categoryId: number | null = null;

    if (category) {
      db.run("INSERT OR IGNORE INTO categories (name) VALUES (?)", [category]);
      const result = db.exec("SELECT id FROM categories WHERE name = ?", [category]);
      if (result[0]?.values[0]) categoryId = result[0].values[0][0] as number;
    }

    db.run(
      "INSERT INTO tasks (title, description, priority, category_id) VALUES (?, ?, ?, ?)",
      [title, description, priority, categoryId]
    );

    const idResult = db.exec("SELECT last_insert_rowid() as id");
    const newId = idResult[0]?.values[0]?.[0];
    await saveDb(db);

    return {
      content: [{ type: "text", text: `✅ Task added!\n\nID: ${newId}\nTitle: ${title}\nPriority: ${priority}\nCategory: ${category || "none"}\nStatus: todo` }],
    };
  }
);

server.tool("list_tasks", "Lists tasks, filterable by status or priority.",
  {
    status: z.enum(["todo", "in_progress", "done", "all"]).optional().describe("Filter by status"),
    priority: z.enum(["low", "medium", "high", "all"]).optional().describe("Filter by priority"),
  },
  async ({ status = "all", priority = "all" }) => {
    const db = await loadDb();
    let sql = "SELECT t.id, t.title, t.status, t.priority, c.name as category_name FROM tasks t LEFT JOIN categories c ON t.category_id = c.id WHERE 1=1";
    const params: string[] = [];
    if (status !== "all") { sql += " AND t.status = ?"; params.push(status); }
    if (priority !== "all") { sql += " AND t.priority = ?"; params.push(priority); }
    sql += " ORDER BY t.id DESC";

    const result = db.exec(sql, params);
    db.close();

    if (!result[0]?.values?.length) {
      return { content: [{ type: "text", text: "No tasks found." }] };
    }

    const priorityEmoji: Record<string, string> = { high: "🔴", medium: "🟡", low: "🟢" };
    const statusEmoji: Record<string, string> = { todo: "⬜", in_progress: "🔄", done: "✅" };

    const list = result[0].values.map(row => {
      const [id, title, taskStatus, taskPriority, categoryName] = row as [number, string, string, string, string | null];
      return `${statusEmoji[taskStatus]} [${id}] ${title} ${priorityEmoji[taskPriority]}\n   Status: ${taskStatus} | Category: ${categoryName || "none"}`;
    }).join("\n\n");

    return { content: [{ type: "text", text: `📋 ${result[0].values.length} task(s):\n\n${list}` }] };
  }
);

server.tool("update_task_status", "Updates a task's status: todo → in_progress → done.",
  {
    id: z.number().describe("Task ID"),
    status: z.enum(["todo", "in_progress", "done"]).describe("New status"),
  },
  async ({ id, status }) => {
    const db = await loadDb();
    const check = db.exec("SELECT title FROM tasks WHERE id = ?", [id]);
    if (!check[0]?.values?.length) {
      db.close();
      return { content: [{ type: "text", text: `Error: Task ${id} not found.` }], isError: true };
    }
    const title = check[0].values[0][0] as string;
    db.run("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
    await saveDb(db);
    const emoji: Record<string, string> = { todo: "⬜", in_progress: "🔄", done: "✅" };
    return { content: [{ type: "text", text: `${emoji[status]} Task "${title}" marked as ${status}!` }] };
  }
);

server.tool("delete_task", "Deletes a task by ID.",
  { id: z.number().describe("Task ID to delete") },
  async ({ id }) => {
    const db = await loadDb();
    const check = db.exec("SELECT title FROM tasks WHERE id = ?", [id]);
    if (!check[0]?.values?.length) {
      db.close();
      return { content: [{ type: "text", text: `Error: Task ${id} not found.` }], isError: true };
    }
    const title = check[0].values[0][0] as string;
    db.run("DELETE FROM tasks WHERE id = ?", [id]);
    await saveDb(db);
    return { content: [{ type: "text", text: `🗑️ Task "${title}" deleted.` }] };
  }
);

server.tool("get_stats", "Returns task statistics — counts by status and priority.",
  {},
  async () => {
    const db = await loadDb();
    const total = db.exec("SELECT COUNT(*) FROM tasks")[0]?.values[0]?.[0] ?? 0;
    const byStatus = db.exec("SELECT status, COUNT(*) as count FROM tasks GROUP BY status");
    const byPriority = db.exec("SELECT priority, COUNT(*) as count FROM tasks GROUP BY priority");
    db.close();

    const statusLines = byStatus[0]?.values.map(r => `  ${r[0]}: ${r[1]}`).join("\n") || "  (none)";
    const priorityLines = byPriority[0]?.values.map(r => `  ${r[0]}: ${r[1]}`).join("\n") || "  (none)";

    return {
      content: [{ type: "text", text: `📊 Task Stats\n${"─".repeat(25)}\nTotal: ${total}\n\nBy Status:\n${statusLines}\n\nBy Priority:\n${priorityLines}` }],
    };
  }
);

server.tool("run_query", "Runs a custom SELECT SQL query. Tables: tasks, categories.",
  { query: z.string().describe("A SELECT SQL query") },
  async ({ query }) => {
    if (!query.trim().toUpperCase().startsWith("SELECT")) {
      return { content: [{ type: "text", text: "Error: Only SELECT queries allowed." }], isError: true };
    }
    try {
      const db = await loadDb();
      const result = db.exec(query);
      db.close();
      if (!result[0]?.values?.length) return { content: [{ type: "text", text: "No results." }] };
      return { content: [{ type: "text", text: `${result[0].values.length} row(s):\n\n${JSON.stringify(result[0], null, 2)}` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `SQL Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ── Start server ──
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("✅ Phase 3 running!");
console.error("   📝 Notes: create_note, list_notes, get_note, update_note, delete_note, search_notes");
console.error("   🗄️  SQLite: add_task, list_tasks, update_task_status, delete_task, get_stats, run_query");
console.error(`   💾 Data: ${DATA_DIR}`);
