/**
 * ============================================================
 *  PHASE 2: Calculator + File Reader MCP Server
 * ============================================================
 *
 * WHAT'S NEW IN PHASE 2 vs PHASE 1:
 *  ✅ Error handling — tools can fail gracefully
 *  ✅ Input validation — rejecting bad inputs with clear messages
 *  ✅ Real file system access — reading/writing actual files on disk
 *  ✅ More complex tool logic — chained operations, edge cases
 *  ✅ isError flag — how MCP signals errors back to Claude
 *
 * TWO SERVERS IN ONE FILE:
 *  1. 🧮 Calculator — math operations with full error handling
 *  2. 📁 File Reader — read/write/list files on your actual Mac
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

// ──────────────────────────────────────────────────────────────
// Create the server
// ──────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "phase2-calculator-filereader",
  version: "1.0.0",
});

// ──────────────────────────────────────────────────────────────
// 🧮 SECTION 1: CALCULATOR TOOLS
//
// NEW CONCEPT: Error Handling in MCP
// When a tool fails, return { content: [...], isError: true }
// Claude reads isError and knows something went wrong —
// it can then decide to retry, ask the user, or explain the error.
// ──────────────────────────────────────────────────────────────

// Tool 1: add
server.tool(
  "add",
  "Adds two or more numbers together. Accepts an array of numbers.",
  {
    numbers: z.array(z.number()).min(2).describe("Array of numbers to add together. Must have at least 2."),
  },
  async ({ numbers }) => {
    const result = numbers.reduce((sum, n) => sum + n, 0);
    const expression = numbers.join(" + ");
    return {
      content: [{ type: "text", text: `${expression} = ${result}` }],
    };
  }
);

// Tool 2: subtract
server.tool(
  "subtract",
  "Subtracts the second number from the first.",
  {
    a: z.number().describe("The number to subtract from"),
    b: z.number().describe("The number to subtract"),
  },
  async ({ a, b }) => {
    return {
      content: [{ type: "text", text: `${a} - ${b} = ${a - b}` }],
    };
  }
);

// Tool 3: multiply
server.tool(
  "multiply",
  "Multiplies two or more numbers together.",
  {
    numbers: z.array(z.number()).min(2).describe("Array of numbers to multiply together."),
  },
  async ({ numbers }) => {
    const result = numbers.reduce((product, n) => product * n, 1);
    const expression = numbers.join(" × ");
    return {
      content: [{ type: "text", text: `${expression} = ${result}` }],
    };
  }
);

// Tool 4: divide — demonstrates error handling for division by zero
server.tool(
  "divide",
  "Divides the first number by the second. Returns an error if dividing by zero.",
  {
    a: z.number().describe("The dividend (number to be divided)"),
    b: z.number().describe("The divisor (number to divide by)"),
  },
  async ({ a, b }) => {
    // 🆕 NEW CONCEPT: Input validation + isError
    if (b === 0) {
      return {
        content: [{ type: "text", text: "Error: Cannot divide by zero." }],
        isError: true,  // ← tells Claude this tool call failed
      };
    }
    const result = a / b;
    return {
      content: [{ type: "text", text: `${a} ÷ ${b} = ${result}` }],
    };
  }
);

// Tool 5: power
server.tool(
  "power",
  "Raises a base number to an exponent (base^exponent).",
  {
    base: z.number().describe("The base number"),
    exponent: z.number().describe("The exponent to raise the base to"),
  },
  async ({ base, exponent }) => {
    const result = Math.pow(base, exponent);
    return {
      content: [{ type: "text", text: `${base}^${exponent} = ${result}` }],
    };
  }
);

// Tool 6: square_root — error handling for negative numbers
server.tool(
  "square_root",
  "Calculates the square root of a number. Returns an error for negative numbers.",
  {
    number: z.number().describe("The number to find the square root of"),
  },
  async ({ number }) => {
    if (number < 0) {
      return {
        content: [{ type: "text", text: `Error: Cannot calculate square root of a negative number (${number}).` }],
        isError: true,
      };
    }
    const result = Math.sqrt(number);
    return {
      content: [{ type: "text", text: `√${number} = ${result}` }],
    };
  }
);

// Tool 7: percentage
server.tool(
  "percentage",
  "Calculates what percentage one number is of another, or calculates a percentage of a number.",
  {
    value: z.number().describe("The value to calculate percentage for"),
    total: z.number().describe("The total/base number"),
    mode: z
      .enum(["of_total", "from_total"])
      .describe(
        "'of_total' = what % is value of total (e.g. 25 of 200 = 12.5%). " +
        "'from_total' = calculate value% of total (e.g. 25% of 200 = 50)"
      ),
  },
  async ({ value, total, mode }) => {
    if (total === 0) {
      return {
        content: [{ type: "text", text: "Error: Total cannot be zero." }],
        isError: true,
      };
    }

    if (mode === "of_total") {
      const pct = (value / total) * 100;
      return {
        content: [{ type: "text", text: `${value} is ${pct.toFixed(2)}% of ${total}` }],
      };
    } else {
      const result = (value / 100) * total;
      return {
        content: [{ type: "text", text: `${value}% of ${total} = ${result}` }],
      };
    }
  }
);

// Tool 8: calculate — a flexible expression evaluator
server.tool(
  "calculate",
  "Evaluates a mathematical expression string. Supports +, -, *, /, parentheses. Example: '(10 + 5) * 2'",
  {
    expression: z.string().describe("The mathematical expression to evaluate. E.g. '(10 + 5) * 2 / 3'"),
  },
  async ({ expression }) => {
    // Safety: only allow numbers, operators, spaces, parentheses, and dots
    const safePattern = /^[0-9+\-*/.() \t]+$/;
    if (!safePattern.test(expression)) {
      return {
        content: [{ type: "text", text: `Error: Expression contains invalid characters. Only numbers and +, -, *, /, (, ) are allowed.` }],
        isError: true,
      };
    }

    try {
      // Safe eval using Function constructor — restricted to math only
      const result = Function(`"use strict"; return (${expression})`)();
      if (!isFinite(result)) {
        return {
          content: [{ type: "text", text: `Error: Expression resulted in an invalid number (${result}).` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `${expression} = ${result}` }],
      };
    } catch {
      return {
        content: [{ type: "text", text: `Error: Could not evaluate expression "${expression}". Check the syntax.` }],
        isError: true,
      };
    }
  }
);

// ──────────────────────────────────────────────────────────────
// 📁 SECTION 2: FILE READER TOOLS
//
// NEW CONCEPT: Real file system access via Node's fs module
// These tools actually read/write files on your Mac!
//
// SAFETY: We restrict all operations to a "sandbox" folder
// (~/mcp-files) so tools can't accidentally touch system files.
// This is a real pattern used in production MCP servers.
// ──────────────────────────────────────────────────────────────

// The sandbox folder — all file operations are restricted here
const SANDBOX_DIR = path.join(process.env.HOME || "~", "mcp-files");

// Helper: ensure the sandbox folder exists
async function ensureSandbox(): Promise<void> {
  await fs.mkdir(SANDBOX_DIR, { recursive: true });
}

// Helper: resolve a filename safely inside the sandbox
// This prevents path traversal attacks (e.g. "../../etc/passwd")
function safePath(filename: string): string {
  // Strip any path separators — only allow plain filenames
  const basename = path.basename(filename);
  return path.join(SANDBOX_DIR, basename);
}

// Tool 9: read_file — reads a file from the sandbox
server.tool(
  "read_file",
  "Reads the contents of a text file from the mcp-files folder in your home directory.",
  {
    filename: z.string().describe("The name of the file to read (e.g. 'notes.txt'). File must be in ~/mcp-files/"),
  },
  async ({ filename }) => {
    await ensureSandbox();
    const filePath = safePath(filename);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const stats = await fs.stat(filePath);
      return {
        content: [{
          type: "text",
          text: `📄 File: ${filename}\n📦 Size: ${stats.size} bytes\n📅 Modified: ${stats.mtime.toLocaleString()}\n\n──────────────\n${content}\n──────────────`,
        }],
      };
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        return {
          content: [{ type: "text", text: `Error: File "${filename}" not found in ~/mcp-files/. Use list_files to see available files.` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `Error reading file: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Tool 10: write_file — creates or overwrites a file in the sandbox
server.tool(
  "write_file",
  "Writes text content to a file in the mcp-files folder. Creates the file if it doesn't exist, overwrites if it does.",
  {
    filename: z.string().describe("The name of the file to write (e.g. 'notes.txt')"),
    content: z.string().describe("The text content to write into the file"),
  },
  async ({ filename, content }) => {
    await ensureSandbox();
    const filePath = safePath(filename);

    try {
      await fs.writeFile(filePath, content, "utf-8");
      return {
        content: [{
          type: "text",
          text: `✅ Successfully wrote ${content.length} characters to "${filename}" in ~/mcp-files/`,
        }],
      };
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      return {
        content: [{ type: "text", text: `Error writing file: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Tool 11: list_files — lists all files in the sandbox
server.tool(
  "list_files",
  "Lists all files available in the mcp-files folder.",
  {},
  async () => {
    await ensureSandbox();

    try {
      const files = await fs.readdir(SANDBOX_DIR);

      if (files.length === 0) {
        return {
          content: [{
            type: "text",
            text: `📁 ~/mcp-files/ is empty.\nUse write_file to create your first file!`,
          }],
        };
      }

      // Get file details for each file
      const fileDetails = await Promise.all(
        files.map(async (file) => {
          const stats = await fs.stat(path.join(SANDBOX_DIR, file));
          return `  📄 ${file} (${stats.size} bytes, modified ${stats.mtime.toLocaleDateString()})`;
        })
      );

      return {
        content: [{
          type: "text",
          text: `📁 Files in ~/mcp-files/ (${files.length} total):\n\n${fileDetails.join("\n")}`,
        }],
      };
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      return {
        content: [{ type: "text", text: `Error listing files: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Tool 12: delete_file — deletes a file from the sandbox
server.tool(
  "delete_file",
  "Deletes a file from the mcp-files folder. This cannot be undone.",
  {
    filename: z.string().describe("The name of the file to delete"),
  },
  async ({ filename }) => {
    await ensureSandbox();
    const filePath = safePath(filename);

    try {
      await fs.unlink(filePath);
      return {
        content: [{ type: "text", text: `🗑️ Successfully deleted "${filename}" from ~/mcp-files/` }],
      };
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        return {
          content: [{ type: "text", text: `Error: File "${filename}" not found. Use list_files to see available files.` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `Error deleting file: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Tool 13: append_to_file — adds content to end of existing file
server.tool(
  "append_to_file",
  "Appends text to the end of an existing file without overwriting it. Creates the file if it doesn't exist.",
  {
    filename: z.string().describe("The name of the file to append to"),
    content: z.string().describe("The text content to append"),
  },
  async ({ filename, content }) => {
    await ensureSandbox();
    const filePath = safePath(filename);

    try {
      await fs.appendFile(filePath, content, "utf-8");
      return {
        content: [{ type: "text", text: `✅ Appended ${content.length} characters to "${filename}"` }],
      };
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      return {
        content: [{ type: "text", text: `Error appending to file: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// ──────────────────────────────────────────────────────────────
// RESOURCE: Expose sandbox directory listing as a resource
// New concept: Resources can be dynamic (computed at read time)
// ──────────────────────────────────────────────────────────────

server.resource(
  "sandbox_info",
  "mcp://phase2/sandbox",
  async () => {
    await ensureSandbox();
    let files: string[] = [];
    try {
      files = await fs.readdir(SANDBOX_DIR);
    } catch {
      files = [];
    }

    return {
      contents: [{
        uri: "mcp://phase2/sandbox",
        mimeType: "text/plain",
        text: `
Phase 2 MCP Server — Sandbox Info
===================================
Sandbox directory: ${SANDBOX_DIR}
Files available: ${files.length}
${files.length > 0 ? files.map(f => `  - ${f}`).join("\n") : "  (empty)"}

Tools available:
  🧮 Calculator: add, subtract, multiply, divide, power, square_root, percentage, calculate
  📁 File Reader: read_file, write_file, list_files, delete_file, append_to_file
        `.trim(),
      }],
    };
  }
);

// ──────────────────────────────────────────────────────────────
// Start the server
// ──────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);

console.error("✅ Phase 2 MCP Server running!");
console.error(`   🧮 Calculator tools: add, subtract, multiply, divide, power, square_root, percentage, calculate`);
console.error(`   📁 File tools: read_file, write_file, list_files, delete_file, append_to_file`);
console.error(`   📁 Sandbox: ${SANDBOX_DIR}`);
