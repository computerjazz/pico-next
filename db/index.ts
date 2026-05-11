import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";
import dns from "dns/promises";
const { address } = await dns.lookup(process.env.DATABASE_HOST || "", {
  family: 4,
});
const pool = new Pool({
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  host: address, // IPv4 resolved from MagicDNS
  port: 5432,
  database: process.env.DATABASE_NAME,
});

export const db = drizzle(pool, { schema });
