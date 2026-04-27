import { dbConnection } from './lib/db';

async function main() {
  console.log("Initializing database...");
  try {
    await dbConnection.initTables();
    console.log("✅ Tables initialized successfully!");
  } catch (error) {
    console.error("❌ Database initialization failed:");
    console.error(error);
    process.exit(1);
  }
  process.exit(0);
}

main();
