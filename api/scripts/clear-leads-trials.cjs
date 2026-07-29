require('dotenv/config');
const { Client } = require('pg');

(async () => {
  const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!conn) throw new Error('DATABASE_URL / DIRECT_URL is not set');

  const client = new Client({ connectionString: conn });
  await client.connect();

  try {
    console.log("Starting deletion of all leads, trials, and activities...");
    
    const resActivities = await client.query('DELETE FROM "LeadActivity"');
    console.log(`Deleted ${resActivities.rowCount} lead activities.`);

    const resTrials = await client.query('DELETE FROM "LeadTrial"');
    console.log(`Deleted ${resTrials.rowCount} lead trials.`);

    const resLeads = await client.query('DELETE FROM "Lead"');
    console.log(`Deleted ${resLeads.rowCount} leads.`);

    console.log("Success! Database cleared of all trials and leads.");
  } catch (error) {
    console.error("Error clearing database:", error);
  } finally {
    await client.end();
  }
})();
