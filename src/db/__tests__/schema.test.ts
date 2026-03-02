import { lookup } from "node:dns/promises";
import * as fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

type TableExpectation = {
  table: string;
  columns: string[];
};

const migrationsDir = path.resolve(__dirname, "../migrations");

async function runMigrations(client: Client) {
  const files = (await fs.readdir(migrationsDir)).sort();
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    try {
      await client.query(sql);
    } catch (error) {
      throw error;
    }
  }
}

describe("database schema", () => {
  it("creates tables and enables RLS", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for schema tests");
    }

    let client: Client | null = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOTFOUND") {
        console.warn("Skipping schema test: database host not resolvable");
        return;
      }
      if (nodeError?.code !== "ENETUNREACH") {
        throw error;
      }
      const url = new URL(databaseUrl);
      try {
        const result = await lookup(url.hostname, { family: 4 });
        client = new Client({
          connectionString: databaseUrl,
          host: result.address
        });
        await client.connect();
      } catch (lookupError) {
        const lookupNodeError = lookupError as NodeJS.ErrnoException;
        if (lookupNodeError?.code === "ENOTFOUND") {
          console.warn("Skipping schema test: database host not resolvable");
          return;
        }
        throw lookupError;
      }
    }

    if (!client) {
      return;
    }

    await runMigrations(client);

    const expectedTables: TableExpectation[] = [
      {
        table: "users",
        columns: ["id", "created_at"]
      },
      {
        table: "user_settings",
        columns: [
          "user_id",
          "day_start_reminder_time",
          "day_close_reminder_time",
          "push_enabled",
          "email_for_escalations_enabled",
          "timezone",
          "subscription_status",
          "account_start_date",
          "created_at",
          "updated_at"
        ]
      },
      {
        table: "journal_documents",
        columns: [
          "id",
          "user_id",
          "doc_type",
          "doc_key",
          "schema_version",
          "status",
          "content",
          "client_updated_at",
          "server_received_at",
          "device_id"
        ]
      },
      {
        table: "accountability_pairs",
        columns: ["id", "user_a_id", "user_b_id", "created_at"]
      },
      {
        table: "accountability_daily_checkins",
        columns: [
          "id",
          "pair_id",
          "author_user_id",
          "target_date",
          "message",
          "created_at"
        ]
      },
      {
        table: "daily_status_summary",
        columns: [
          "user_id",
          "date",
          "day_closed",
          "one_thing_done",
          "reflection_present",
          "updated_at"
        ]
      },
      {
        table: "notification_log",
        columns: [
          "id",
          "user_id",
          "type",
          "target_date",
          "sent_at",
          "provider_message_id",
          "status"
        ]
      },
      {
        table: "admin_user_actions",
        columns: [
          "id",
          "admin_id",
          "action_type",
          "target_user_id",
          "created_at",
          "metadata"
        ]
      }
    ];

    for (const { table, columns } of expectedTables) {
      const result = await client.query(
        "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
        [table]
      );
      const columnNames = result.rows.map((row) => row.column_name);
      for (const column of columns) {
        expect(columnNames).toContain(column);
      }
    }

    const rlsResult = await client.query(
      "select relname, relrowsecurity from pg_class where relname = any($1)",
      [expectedTables.map((entry) => entry.table)]
    );

    for (const row of rlsResult.rows) {
      expect(row.relrowsecurity).toBe(true);
    }

    await client.end();
  }, 20000);
});
