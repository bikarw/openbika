import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://openbika:openbika@localhost:5432/openbika_control",
  },
  out: "./drizzle",
  schema: "./src/schema.ts",
  strict: true,
  verbose: true,
});
