import path from "node:path";
import { fileURLToPath } from "node:url";

export function validateSupabaseTarget(projectUrl, databaseUrl) {
  let project;
  let database;
  try {
    project = new URL(projectUrl);
    database = new URL(databaseUrl);
  } catch {
    throw new Error("Invalid Supabase backup URL.");
  }
  const match = /^([a-z0-9]+)\.supabase\.co$/.exec(project.hostname);
  if (project.protocol !== "https:" || !match || !["postgres:", "postgresql:"].includes(database.protocol)) {
    throw new Error("Invalid Supabase backup target.");
  }
  const ref = match[1];
  const direct = database.hostname === `db.${ref}.supabase.co`;
  const sessionPooler = database.username === `postgres.${ref}` && database.hostname.endsWith(".pooler.supabase.com") && database.port === "5432";
  if (!direct && !sessionPooler) throw new Error("Database connection and Storage URL target different Supabase projects, or the wrong pooler mode was selected.");
  return ref;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_DB_URL) throw new Error("Missing Supabase backup configuration.");
  validateSupabaseTarget(process.env.SUPABASE_URL, process.env.SUPABASE_DB_URL);
  console.log("Supabase database and Storage target match.");
}
