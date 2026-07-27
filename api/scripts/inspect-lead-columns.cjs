require('dotenv/config');
const { Client } = require('pg');

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const res = await db.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'Lead'`
    );
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await db.end();
  }
})();
