import "./env";

console.log("Credentials raw:", process.env.GOOGLE_CREDENTIALS_JSON);
console.log("Token raw:", process.env.GOOGLE_TOKEN_JSON);

try {
  const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!);
  const token = JSON.parse(process.env.GOOGLE_TOKEN_JSON!);
  console.log("Parsed credentials client_id:", creds.installed.client_id);
  console.log("Parsed token scope:", token.scope);
  console.log("✅ JSON parsing succeeded");
} catch (err) {
  console.error("❌ Failed to parse JSON:", err);
}
