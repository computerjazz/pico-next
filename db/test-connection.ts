import { Pool } from "pg";
import dns from "dns/promises";

async function createPool() {
  const { address } = await dns.lookup("pi-coboy.quoll-jazz.ts.net", {
    family: 4,
  });
  const pool = new Pool({
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    host: address, // IPv4 resolved from MagicDNS
    port: 5432,
    database: process.env.DATABASE_NAME,
  });

  return pool;
}

async function testConnection() {
  const pool = await createPool();
  try {
    const res = await pool.query("SELECT NOW() AS now");
    console.log("✅ Connection OK:", res.rows[0].now);
  } catch (err) {
    console.error("❌ Connection failed:", err);
  } finally {
    await pool.end();
  }
}

testConnection();
