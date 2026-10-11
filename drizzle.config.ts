import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
dotenv.config();

const migrationUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!migrationUrl) {
  throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required for drizzle-kit");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: migrationUrl,
  },
});
