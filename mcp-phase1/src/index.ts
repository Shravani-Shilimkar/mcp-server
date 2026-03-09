/**
 * ============================================================
 *  PHASE 1: Hello World MCP Server
 *  Learn: MCP structure, Tools, Resources, and Prompts
 * ============================================================
 *
 * HOW IT WORKS:
 *  1. We create an MCP server with a name and version
 *  2. We register "tools" (functions Claude can call)
 *  3. We register "resources" (data Claude can read)
 *  4. We register "prompts" (templates Claude can use)
 *  5. We connect via stdio transport (stdin/stdout)
 *
 * ⚠️  CRITICAL RULE FOR stdio SERVERS:
 *     NEVER use console.log() — it corrupts the JSON-RPC stream!
 *     ALWAYS use console.error() for debug output instead.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ──────────────────────────────────────────────────────────────
// STEP 1: Create the MCP Server
// ──────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "hello-world-mcp",   // Name shown in Claude Desktop
  version: "1.0.0",
});

// ──────────────────────────────────────────────────────────────
// STEP 2: Register TOOLS
// Tools = functions Claude can call to DO things
//
// Anatomy of a tool:
//   server.tool(name, description, inputSchema, handler)
//   - name: what Claude will call (use snake_case)
//   - description: VERY important — Claude reads this to decide when to use the tool
//   - inputSchema: typed params using Zod
//   - handler: async function that returns { content: [...] }
// ──────────────────────────────────────────────────────────────

// Tool 1: say_hello — simplest possible tool, no inputs needed
server.tool(
  "say_hello",
  "Says hello! Use this tool when the user wants a greeting.",
  {},  // No input parameters
  async () => {
    return {
      content: [
        {
          type: "text",
          text: "👋 Hello from your MCP server! I'm alive and working!",
        },
      ],
    };
  }
);

// Tool 2: greet_person — tool WITH typed inputs
server.tool(
  "greet_person",
  "Greets a specific person by name. Use when the user wants to greet someone.",
  {
    name: z.string().describe("The name of the person to greet"),
    language: z
      .enum(["english", "spanish", "french", "japanese"])
      .optional()
      .describe("Language for the greeting (defaults to english)"),
  },
  async ({ name, language = "english" }) => {
    const greetings: Record<string, string> = {
      english: `Hello, ${name}! Welcome to MCP! 🎉`,
      spanish: `¡Hola, ${name}! Bienvenido a MCP! 🎉`,
      french:  `Bonjour, ${name}! Bienvenue à MCP! 🎉`,
      japanese: `こんにちは、${name}さん！MCPへようこそ！🎉`,
    };

    return {
      content: [
        {
          type: "text",
          text: greetings[language],
        },
      ],
    };
  }
);

// Tool 3: add_numbers — tool that does computation and returns structured data
server.tool(
  "add_numbers",
  "Adds two numbers together. Use for simple arithmetic addition.",
  {
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  },
  async ({ a, b }) => {
    const result = a + b;
    return {
      content: [
        {
          type: "text",
          text: `${a} + ${b} = ${result}`,
        },
      ],
    };
  }
);

// Tool 4: get_server_info — tool that returns metadata about the server itself
server.tool(
  "get_server_info",
  "Returns information about this MCP server — its name, version, and available tools.",
  {},
  async () => {
    const info = {
      name: "hello-world-mcp",
      version: "1.0.0",
      phase: "Phase 1 - Hello World",
      tools: ["say_hello", "greet_person", "add_numbers", "get_server_info"],
      uptime: process.uptime().toFixed(2) + "s",
      timestamp: new Date().toISOString(),
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(info, null, 2),
        },
      ],
    };
  }
);


// Tool 5:
server.tool(
  "get_joke",
  "Returns a random programming joke.",
  {},
  async () => {
    const jokes = [
      "Why do programmers prefer dark mode? Light attracts bugs! 🐛",
      "Why do Java devs wear glasses? Because they don't C#! 👓",
      "A SQL query walks into a bar and asks two tables: 'Can I join you?'",
      "Why did the dev go broke? He used up all his cache! 💸",
      "What's a programmer's favourite hangout? The Foo Bar! 🍺"
    ];
    const random = jokes[Math.floor(Math.random() * jokes.length)];
    return { content: [{ type: "text", text: random }] };
  }
);

// ──────────────────────────────────────────────────────────────
// STEP 3: Register RESOURCES
// Resources = data Claude can READ (like files, APIs, databases)
//
// Each resource has a URI (like a URL) and returns content
// Think of it like: Claude can "open" these like files
// ──────────────────────────────────────────────────────────────

server.resource(
  "readme",                          // Resource name
  "mcp://hello-world/readme",       // URI — how Claude addresses this resource
  async () => {
    return {
      contents: [
        {
          uri: "mcp://hello-world/readme",
          mimeType: "text/plain",
          text: `
# Hello World MCP Server — Phase 1 README

## What is this?
This is your first MCP server! It demonstrates all 3 primitives:
- Tools: Functions Claude can call (say_hello, greet_person, add_numbers, get_server_info)
- Resources: Data Claude can read (this readme!)
- Prompts: Templates Claude can use (see greeting_prompt)

## What you learned in Phase 1:
1. How to create an McpServer instance
2. How to register tools with typed inputs using Zod
3. How to register resources with a URI
4. How to register prompt templates
5. How to connect via StdioServerTransport
6. Why you NEVER use console.log() in stdio servers

## Next Steps (Phase 2):
- Build a Calculator server with more complex math tools
- Build a File Reader server that reads actual files from disk
- Learn about error handling and returning structured errors
          `.trim(),
        },
      ],
    };
  }
);

// ──────────────────────────────────────────────────────────────
// STEP 4: Register PROMPTS
// Prompts = pre-written templates that guide Claude's behavior
// Claude can load these like saved instructions
// ──────────────────────────────────────────────────────────────

// server.prompt(
//   "greeting_prompt",
//   "A prompt template for generating personalized greetings",
//   [
//     {
//       name: "person_name",
//       description: "The name of the person to greet",
//       required: true,
//     },
//   ],
//   async ({ person_name }) => {
server.prompt(
  "greeting_prompt",
  "A prompt template for generating personalized greetings",
  { person_name: z.string().describe("The name of the person to greet") },
  async ({ person_name }) => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please greet ${person_name} warmly, ask how they are doing, and wish them a great day. Be friendly and enthusiastic!`,
          },
        },
      ],
    };
  }
);

// ──────────────────────────────────────────────────────────────
// STEP 5: Connect via Transport and Start the Server
// StdioServerTransport = communicate via stdin/stdout (local)
// This is how Claude Desktop talks to your server
// ──────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();

// Connect and start listening
await server.connect(transport);

// ✅ Use console.error (stderr) NOT console.log (stdout) for debug output!
console.error("✅ Hello World MCP Server is running!");
console.error("   Tools: say_hello, greet_person, add_numbers, get_server_info");
console.error("   Resources: mcp://hello-world/readme");
console.error("   Prompts: greeting_prompt");
