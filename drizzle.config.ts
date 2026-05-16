export default {
  schema: "./src/persistence/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./.local/hrcore-dev.sqlite",
  },
  strict: true,
  verbose: true,
};
