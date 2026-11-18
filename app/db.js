const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    roll_no VARCHAR(50) UNIQUE,
    email VARCHAR(150) NOT NULL UNIQUE,
    department VARCHAR(100) DEFAULT 'General',
    year_semester VARCHAR(50) DEFAULT '1st Year',
    password_hash VARCHAR(100) NOT NULL,
    role ENUM('student','admin') NOT NULL DEFAULT 'student',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS exams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    duration_min INT NOT NULL DEFAULT 10,
    pass_percentage INT NOT NULL DEFAULT 40,
    allowed_year VARCHAR(50) NOT NULL DEFAULT '4th Year',
    starts_at TIMESTAMP NULL DEFAULT NULL,
    ends_at TIMESTAMP NULL DEFAULT NULL,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    show_review BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_id INT NOT NULL,
    text VARCHAR(500) NOT NULL,
    opt_a VARCHAR(200) NOT NULL,
    opt_b VARCHAR(200) NOT NULL,
    opt_c VARCHAR(200) NOT NULL,
    opt_d VARCHAR(200) NOT NULL,
    correct CHAR(1) NOT NULL,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    exam_id INT NOT NULL,
    score INT NOT NULL DEFAULT 0,
    total INT NOT NULL DEFAULT 0,
    answers JSON,
    answers_saved JSON,
    marked_review JSON,
    question_order JSON,
    tab_switches INT NOT NULL DEFAULT 0,
    copy_paste_attempts INT NOT NULL DEFAULT 0,
    focus_lost_seconds INT NOT NULL DEFAULT 0,
    right_click_attempts INT NOT NULL DEFAULT 0,
    risk_score INT NOT NULL DEFAULT 0,
    is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
    is_submitted BOOLEAN NOT NULL DEFAULT TRUE,
    started_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY one_attempt (user_id, exam_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT NULL,
    ip VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
];

const DEMO_QUESTIONS = [
  ["Which service model gives you virtual machines and networking to manage yourself?", "SaaS", "PaaS", "IaaS", "FaaS", "C"],
  ["Amazon RDS is an example of which service model?", "Managed database (PaaS)", "Bare-metal hosting", "Desktop software", "On-premise server", "A"],
  ["What does Auto Scaling do when average CPU rises above its target?", "Deletes the database", "Adds more instances", "Closes the load balancer", "Changes the region", "B"],
  ["Which AWS service stores objects such as files and exports?", "EBS snapshots only", "Route 53", "Amazon S3", "CloudTrail", "C"],
  ["What is the main job of an Application Load Balancer?", "Spread requests across healthy servers", "Encrypt the database", "Bill the customer", "Compile code", "A"],
];

async function createPool(cfg) {
  const ssl = cfg.db.ssl ? { rejectUnauthorized: false } : undefined;
  // Create the database if it does not exist, then open the pool on it.
  // Skip gracefully if the managed DB user lacks global CREATE DATABASE privileges.
  try {
    const admin = await mysql.createConnection({
      host: cfg.db.host,
      port: cfg.db.port,
      user: cfg.db.user,
      password: cfg.db.password,
      ssl,
    });
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${cfg.db.name}\` CHARACTER SET utf8mb4`);
    await admin.end();
  } catch (err) {
    console.warn("Skipping CREATE DATABASE (using pre-existing DB):", err.message);
  }
  return mysql.createPool({
    host: cfg.db.host,
    port: cfg.db.port,
    user: cfg.db.user,
    password: cfg.db.password,
    database: cfg.db.name,
    ssl,
    waitForConnections: true,
    connectionLimit: 10,
  });
}

async function ensureColumn(conn, table, column, definition) {
  const [cols] = await conn.query(
    "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  if (cols.length === 0) {
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function runMigrations(conn) {
  // Safe, idempotent migrations against live schema
  await ensureColumn(conn, "users", "roll_no", "VARCHAR(50) UNIQUE NULL");
  await ensureColumn(conn, "users", "department", "VARCHAR(100) DEFAULT 'General'");
  await ensureColumn(conn, "users", "year_semester", "VARCHAR(50) DEFAULT '1st Year'");
  await ensureColumn(conn, "users", "is_active", "BOOLEAN NOT NULL DEFAULT TRUE");
  await ensureColumn(conn, "users", "failed_attempts", "INT NOT NULL DEFAULT 0");
  await ensureColumn(conn, "users", "locked_until", "TIMESTAMP NULL DEFAULT NULL");

  await ensureColumn(conn, "exams", "description", "TEXT NULL");
  await ensureColumn(conn, "exams", "pass_percentage", "INT NOT NULL DEFAULT 40");
  await ensureColumn(conn, "exams", "starts_at", "TIMESTAMP NULL DEFAULT NULL");
  await ensureColumn(conn, "exams", "ends_at", "TIMESTAMP NULL DEFAULT NULL");
  await ensureColumn(conn, "exams", "is_published", "BOOLEAN NOT NULL DEFAULT TRUE");
  await ensureColumn(conn, "exams", "show_review", "BOOLEAN NOT NULL DEFAULT TRUE");
  await ensureColumn(conn, "exams", "allowed_year", "VARCHAR(50) NOT NULL DEFAULT '4th Year'");
  await conn.query("UPDATE exams SET allowed_year = '4th Year' WHERE allowed_year IS NULL OR allowed_year = ''");

  await ensureColumn(conn, "attempts", "started_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn(conn, "attempts", "answers_saved", "JSON NULL");
  await ensureColumn(conn, "attempts", "marked_review", "JSON NULL");
  await ensureColumn(conn, "attempts", "question_order", "JSON NULL");
  await ensureColumn(conn, "attempts", "tab_switches", "INT NOT NULL DEFAULT 0");
  await ensureColumn(conn, "attempts", "copy_paste_attempts", "INT NOT NULL DEFAULT 0");
  await ensureColumn(conn, "attempts", "focus_lost_seconds", "INT NOT NULL DEFAULT 0");
  await ensureColumn(conn, "attempts", "right_click_attempts", "INT NOT NULL DEFAULT 0");
  await ensureColumn(conn, "attempts", "risk_score", "INT NOT NULL DEFAULT 0");
  await ensureColumn(conn, "attempts", "is_flagged", "BOOLEAN NOT NULL DEFAULT FALSE");
  await ensureColumn(conn, "attempts", "is_submitted", "BOOLEAN NOT NULL DEFAULT TRUE");

  // Populate any legacy attempt rows with started_at = submitted_at if null
  await conn.query("UPDATE attempts SET started_at = submitted_at WHERE started_at IS NULL AND submitted_at IS NOT NULL");
}

// Several instances may start together, so a MySQL named lock serialises set-up.
async function initSchema(pool, cfg) {
  const conn = await pool.getConnection();
  try {
    await conn.query("SELECT GET_LOCK('examcloud_init', 60)");
    for (const sql of SCHEMA) await conn.query(sql);

    // Apply incremental migrations to existing live databases
    await runMigrations(conn);

    // Ensure administrator exists
    const [adminRows] = await conn.query("SELECT id, roll_no FROM users WHERE role='admin' LIMIT 1");
    if (adminRows.length === 0) {
      const hash = await bcrypt.hash(cfg.adminPassword, 10);
      await conn.query(
        "INSERT INTO users (name,roll_no,email,department,year_semester,password_hash,role) VALUES (?,?,?,?,?,?, 'admin')",
        ["Administrator", "ADMIN001", cfg.adminEmail, "Administration", "Staff", hash]
      );
    } else if (!adminRows[0].roll_no) {
      await conn.query("UPDATE users SET roll_no='ADMIN001', department='Administration', year_semester='Staff' WHERE id=?", [adminRows[0].id]);
    }

    // Seed demo student (roll 2024CS001) if not present
    const [studentRows] = await conn.query("SELECT id FROM users WHERE roll_no='2024CS001' OR email='student@examcloud.local'");
    if (studentRows.length === 0) {
      const studentHash = await bcrypt.hash("Student@12345", 10);
      await conn.query(
        "INSERT INTO users (name,roll_no,email,department,year_semester,password_hash,role) VALUES (?,?,?,?,?,?, 'student')",
        ["Aarav Sharma", "2024CS001", "student@examcloud.local", "Computer Science", "3rd Year", studentHash]
      );
    }

    // Seed demo exam if none exist
    const [exams] = await conn.query("SELECT COUNT(*) AS n FROM exams");
    if (exams[0].n === 0) {
      const [r] = await conn.query(
        "INSERT INTO exams (title, description, duration_min, pass_percentage, allowed_year, is_published, show_review) VALUES (?,?,?,?,?,?,?)",
        [
          "Cloud Computing Basics (demo)",
          "End-semester examination covering cloud architecture, service models (IaaS/PaaS/SaaS), high availability, and auto-scaling.",
          10,
          40,
          "4th Year",
          1,
          1,
        ]
      );
      for (const q of DEMO_QUESTIONS) {
        await conn.query("INSERT INTO questions (exam_id,text,opt_a,opt_b,opt_c,opt_d,correct) VALUES (?,?,?,?,?,?,?)", [r.insertId, ...q]);
      }
    } else {
      // Ensure existing demo exam has description, pass_percentage, and allowed_year
      await conn.query("UPDATE exams SET pass_percentage=40, is_published=1, show_review=1, allowed_year=IFNULL(allowed_year, '4th Year') WHERE pass_percentage IS NULL OR allowed_year IS NULL");
    }
  } finally {
    await conn.query("SELECT RELEASE_LOCK('examcloud_init')").catch(() => {});
    conn.release();
  }
}

module.exports = { createPool, initSchema };
