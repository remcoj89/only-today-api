import * as fs from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { config } from "../config";

const migrationsDir = path.resolve(__dirname, "./migrations");

async function ensureMigrationsTable(client: Client) {
  await client.query(`
    create table if not exists public.schema_migrations (
      id serial primary key,
      filename text not null unique,
      applied_at timestamptz not null default now()
    );
  `);
}

async function applyMigration(client: Client, filename: string) {
  const sql = await fs.readFile(path.join(migrationsDir, filename), "utf8");
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("insert into public.schema_migrations (filename) values ($1)", [
      filename
    ]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function rollbackMigration(client: Client, filename: string) {
  const rollbackFile = filename.replace(/\.sql$/, ".down.sql");
  const rollbackPath = path.join(migrationsDir, rollbackFile);
  const rollbackSql = await fs.readFile(rollbackPath, "utf8");
  await client.query("begin");
  try {
    await client.query(rollbackSql);
    await client.query("delete from public.schema_migrations where filename = $1", [
      filename
    ]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function run() {
  const client = new Client({ connectionString: config.databaseUrl });
  await client.connect();

  await ensureMigrationsTable(client);

  const appliedResult = await client.query(
    "select filename from public.schema_migrations order by id asc"
  );
  const applied = new Set(appliedResult.rows.map((row) => row.filename));

  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql"));
  const sorted = files.sort();

  const shouldRollback = process.argv.includes("--rollback");

  if (shouldRollback) {
    const last = appliedResult.rows[appliedResult.rows.length - 1];
    if (!last) {
      throw new Error("No migrations to rollback");
    }
    await rollbackMigration(client, last.filename);
    await client.end();
    return;
  }

  for (const file of sorted) {
    if (applied.has(file) || file.endsWith(".down.sql")) {
      continue;
    }
    await applyMigration(client, file);
  }

  await client.end();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
