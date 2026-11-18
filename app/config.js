// Loads configuration from environment variables.
// On AWS, DB credentials and the JWT secret come from Secrets Manager
// (ARNs are passed in as env vars by the EC2 launch template).
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

async function readSecret(client, arn) {
  const out = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  return JSON.parse(out.SecretString);
}

async function loadConfig() {
  const cfg = {
    port: parseInt(process.env.PORT || "3000", 10),
    awsRegion: process.env.AWS_REGION || "ap-south-1",
    db: {
      host: process.env.DB_HOST || "127.0.0.1",
      port: parseInt(process.env.DB_PORT || "3306", 10),
      name: process.env.DB_NAME || "examcloud",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      ssl: process.env.DB_SSL === "true",
    },
    jwtSecret: process.env.JWT_SECRET || "dev-only-secret-change-me",
    s3Bucket: process.env.S3_BUCKET || "",
    sesFrom: process.env.SES_FROM || "",
    adminEmail: process.env.ADMIN_EMAIL || "admin@examcloud.local",
    adminPassword: process.env.ADMIN_PASSWORD || "Admin@12345",
    loginMaxFailedAttempts: parseInt(process.env.LOGIN_MAX_FAILED_ATTEMPTS || "5", 10),
    loginLockoutMinutes: parseInt(process.env.LOGIN_LOCKOUT_MINUTES || "10", 10),
  };

  if (process.env.DATABASE_URL && !process.env.DB_HOST) {
    const u = new URL(process.env.DATABASE_URL);
    cfg.db.host = u.hostname;
    cfg.db.port = parseInt(u.port || "3306", 10);
    cfg.db.name = u.pathname.replace(/^\//, "") || cfg.db.name;
    cfg.db.user = decodeURIComponent(u.username);
    cfg.db.password = decodeURIComponent(u.password);
    const sslParam = (u.searchParams.get("ssl") || u.searchParams.get("ssl-mode") || "").toLowerCase();
    if (sslParam === "true" || sslParam === "required" || sslParam === "verify_ca" || sslParam === "verify_identity") {
      cfg.db.ssl = true;
    }
  }

  if (process.env.DB_SECRET_ARN || process.env.APP_SECRET_ARN) {
    const sm = new SecretsManagerClient({ region: cfg.awsRegion });
    if (process.env.DB_SECRET_ARN) {
      const s = await readSecret(sm, process.env.DB_SECRET_ARN);
      cfg.db.user = s.username;
      cfg.db.password = s.password;
    }
    if (process.env.APP_SECRET_ARN) {
      const s = await readSecret(sm, process.env.APP_SECRET_ARN);
      cfg.jwtSecret = s.jwt_secret;
      cfg.adminPassword = s.admin_password || cfg.adminPassword;
    }
  }
  return cfg;
}

module.exports = { loadConfig };
