const { dbConnection } = require('./lib/db');

async function main() {
  await dbConnection.initTables();
  console.log("Tables initialized!");
  process.exit(0);
}

main().catch(console.error);
