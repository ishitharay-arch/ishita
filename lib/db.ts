import Database from 'better-sqlite3';
import { join } from 'path';
import { randomUUID } from 'crypto';

const dbPath = join(process.cwd(), 'data', 'eval.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS bots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS prompt_versions (
    id TEXT PRIMARY KEY,
    bot_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    body TEXT NOT NULL,
    is_live INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY,
    bot_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    bot_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('hard', 'soft')),
    body TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS test_cases (
    id TEXT PRIMARY KEY,
    bot_id TEXT NOT NULL,
    spec TEXT NOT NULL,
    approved_by TEXT,
    approved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    bot_id TEXT NOT NULL,
    prompt_version_id TEXT NOT NULL,
    status TEXT NOT NULL,
    bot_model TEXT NOT NULL,
    judge_model TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE,
    FOREIGN KEY (prompt_version_id) REFERENCES prompt_versions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS results (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    test_case_id TEXT NOT NULL,
    passed INTEGER NOT NULL,
    failures TEXT,
    soft_scores TEXT,
    transcript TEXT,
    tools_called TEXT,
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
    FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS error_patterns (
    id TEXT PRIMARY KEY,
    bot_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'major', 'minor')),
    error_type TEXT NOT NULL CHECK (error_type IN ('repetition', 'hallucination', 'wrong_flow', 'missed_intent', 'wrong_data', 'language', 'compliance', 'timeout', 'other')),
    stage TEXT NOT NULL CHECK (stage IN ('greeting', 'identification', 'resolution', 'closing', 'transfer', 'any')),
    detection_method TEXT NOT NULL CHECK (detection_method IN ('keyword', 'regex', 'behavioral')),
    detection_config TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto_detected')),
    active INTEGER NOT NULL DEFAULT 1,
    times_triggered INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS flow_rules (
    id TEXT PRIMARY KEY,
    bot_id TEXT NOT NULL,
    label TEXT NOT NULL,
    test_case_id TEXT,
    match_config TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE,
    FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE SET NULL
  );
`);

export default db;

// Helper functions for UUID generation
export function generateId(): string {
  return randomUUID();
}

// Helper function for JSON operations
export function parseJson<T>(jsonString: string | null): T | null {
  if (!jsonString) return null;
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return null;
  }
}

export function stringifyJson(obj: unknown): string {
  return JSON.stringify(obj);
}
