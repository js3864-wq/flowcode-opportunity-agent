import fs from "node:fs";
import path from "node:path";

/** Minimal .env / .env.local loader for the CLI scripts (Next.js loads these on its own). */
export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    // Split on \r?\n so files saved on Windows (CRLF) don't leave "\r" on the end of the key.
    for (const line of fs.readFileSync(p, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      const value = m?.[2].replace(/^["']|["']$/g, "").trim();
      if (m && value && !process.env[m[1]]) process.env[m[1]] = value;
    }
  }
}
