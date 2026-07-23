require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('Connected.');

  console.log('\n--- StudentProfile Rows ---');
  const res = await client.query('SELECT * FROM "StudentProfile" LIMIT 1;');
  console.log(JSON.stringify(res.rows, null, 2));

  console.log('\n--- User Rows (Students) ---');
  const resUsers = await client.query('SELECT * FROM "User" WHERE role = \'STUDENT\' LIMIT 1;');
  console.log(JSON.stringify(resUsers.rows, null, 2));

  await client.end();
}

main().catch(console.error);
