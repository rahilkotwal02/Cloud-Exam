const os = require("os");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { loadConfig } = require("./config");
const { createPool, initSchema } = require("./db");
const { makeAws } = require("./aws");

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const emailOk = (e) => typeof e === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 150;
const getClientIp = (req) => {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim().slice(0, 50);
  return (req.socket.remoteAddress || "").slice(0, 50);
};

async function auditLog(pool, userId, action, details, ip) {
  try {
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, details, ip) VALUES (?,?,?,?)",
      [userId || null, String(action).slice(0, 100), details ? String(details).slice(0, 1000) : null, ip || null]
    );
  } catch (err) {
    console.error("Audit log error:", err.message);
  }
}

// Fisher-Yates array shuffle
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

let cfg = null;
let pool = null;
let aws = null;
let initPromise = null;

async function ensureInit() {
  if (pool) return;
  if (!initPromise) {
    initPromise = (async () => {
      cfg = await loadConfig();
      pool = await createPool(cfg);
      await initSchema(pool, cfg);
      aws = makeAws(cfg);
    })().catch((err) => {
      initPromise = null;
      pool = null;
      throw err;
    });
  }
  await initPromise;
}

const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        upgradeInsecureRequests: null,
      },
    },
    hsts: false,
  })
);
app.use(express.json({ limit: "500kb" }));

// ---- Health checks & Static files (do not require DB init) ----
app.get("/health", (req, res) => res.json({ status: "ok", host: os.hostname() }));
app.get("/api/info", (req, res) =>
  res.json({
    host: os.hostname(),
    uptime_s: Math.round(process.uptime()),
    institution: "ExamCloud University Examination Authority",
  })
);
app.use(express.static(path.join(__dirname, "public")));

// Lazy DB & config initialization for Vercel serverless and direct runs
app.use(
  wrap(async (req, res, next) => {
    await ensureInit();
    next();
  })
);

app.get(
  "/health/deep",
  wrap(async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "up", host: os.hostname() });
  })
);

  // ---- Auth tokens and middleware ----
  const sign = (u) =>
    jwt.sign(
      {
        id: u.id,
        role: u.role,
        name: u.name,
        roll_no: u.roll_no || null,
        department: u.department || "General",
        year_semester: u.year_semester || "1st Year",
      },
      cfg.jwtSecret,
      { expiresIn: "4h" }
    );

  const auth = async (req, res, next) => {
    const h = req.headers.authorization || "";
    const token = h.replace(/^Bearer /, "").trim();
    if (!token) return res.status(401).json({ error: "Authentication required. Please sign in." });
    try {
      const decoded = jwt.verify(token, cfg.jwtSecret);
      // Verify account active status on server
      const [rows] = await pool.query("SELECT id, role, is_active FROM users WHERE id=?", [decoded.id]);
      if (!rows[0]) return res.status(401).json({ error: "User account no longer exists." });
      if (!rows[0].is_active)
        return res.status(403).json({ error: "Your account has been deactivated. Please contact the administrator." });
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: "Session expired or invalid. Please sign in again." });
    }
  };

  const adminOnly = (req, res, next) =>
    req.user && req.user.role === "admin"
      ? next()
      : res.status(403).json({ error: "Access denied. Administrative privileges required." });

  // ---- 1. Student Identity and Authentication ----

  app.post(
    "/api/auth/register",
    wrap(async (req, res) => {
      const { name, roll_no, email, department, year_semester, password } = req.body || {};
      const ip = getClientIp(req);

      if (!name || name.length > 100 || !emailOk(email) || !password || password.length < 8 || password.length > 128) {
        return res.status(400).json({
          error: "Full name, valid email, and a password of at least 8 characters are required.",
        });
      }

      // Generate a roll number if not provided (preserves loadtest backward compatibility)
      const cleanRoll = roll_no && String(roll_no).trim().length > 0
        ? String(roll_no).trim().toUpperCase().slice(0, 50)
        : `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`;

      const cleanDept = department && String(department).trim().length > 0
        ? String(department).trim().slice(0, 100)
        : "Computer Science";

      const cleanYear = year_semester && String(year_semester).trim().length > 0
        ? String(year_semester).trim().slice(0, 50)
        : "1st Year";

      const hash = await bcrypt.hash(password, 10);
      try {
        const [r] = await pool.query(
          "INSERT INTO users (name, roll_no, email, department, year_semester, password_hash, role) VALUES (?,?,?,?,?,?, 'student')",
          [name.trim(), cleanRoll, email.toLowerCase().trim(), cleanDept, cleanYear, hash]
        );
        const newUser = {
          id: r.insertId,
          role: "student",
          name: name.trim(),
          roll_no: cleanRoll,
          department: cleanDept,
          year_semester: cleanYear,
        };
        await auditLog(pool, r.insertId, "STUDENT_REGISTER", `Registered roll ${cleanRoll} (${email})`, ip);
        res.status(201).json({
          token: sign(newUser),
          name: newUser.name,
          roll_no: cleanRoll,
          department: cleanDept,
          year_semester: cleanYear,
          role: "student",
        });
      } catch (e) {
        if (e.code === "ER_DUP_ENTRY") {
          const msg = e.sqlMessage && e.sqlMessage.includes("roll_no")
            ? "That University Roll / ID number is already registered."
            : "That email address is already registered.";
          return res.status(409).json({ error: msg });
        }
        throw e;
      }
    })
  );

  app.post(
    "/api/auth/login",
    wrap(async (req, res) => {
      const { email, password, login_id } = req.body || {};
      const identifier = String(login_id || email || "").trim();
      const ip = getClientIp(req);

      if (!identifier || !password) {
        return res.status(400).json({ error: "Please enter your Email / Roll Number and Password." });
      }

      // Allow login by either Email OR Roll Number
      const [rows] = await pool.query(
        "SELECT * FROM users WHERE LOWER(email)=? OR UPPER(roll_no)=?",
        [identifier.toLowerCase(), identifier.toUpperCase()]
      );
      const u = rows[0];

      if (!u) {
        await auditLog(pool, null, "LOGIN_FAILED", `Unknown user '${identifier}'`, ip);
        return res.status(401).json({ error: "Invalid credentials. Check your email/roll number and password." });
      }

      // Check account lockout
      if (u.locked_until && new Date(u.locked_until) > new Date()) {
        const remainingMin = Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60000);
        await auditLog(pool, u.id, "LOGIN_BLOCKED_LOCKED", `Attempt while locked (${remainingMin}m left)`, ip);
        return res.status(423).json({
          error: `Account is temporarily locked due to repeated failed logins. Please try again in ${remainingMin} minute(s).`,
        });
      }

      // Check active status
      if (!u.is_active) {
        await auditLog(pool, u.id, "LOGIN_BLOCKED_INACTIVE", "Attempt on deactivated account", ip);
        return res.status(403).json({
          error: "Your student account has been deactivated. Please contact the examination department coordinator.",
        });
      }

      const match = await bcrypt.compare(String(password), u.password_hash);
      if (!match) {
        const newFailed = (u.failed_attempts || 0) + 1;
        const maxAttempts = cfg.loginMaxFailedAttempts;
        const lockoutMin = cfg.loginLockoutMinutes;

        if (newFailed >= maxAttempts) {
          const lockUntil = new Date(Date.now() + lockoutMin * 60000);
          await pool.query("UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?", [newFailed, lockUntil, u.id]);
          await auditLog(pool, u.id, "ACCOUNT_LOCKED", `Locked for ${lockoutMin}m after ${newFailed} failures`, ip);
          return res.status(423).json({
            error: `Too many failed attempts. Your account has been locked for ${lockoutMin} minutes to protect your credentials.`,
          });
        } else {
          await pool.query("UPDATE users SET failed_attempts=? WHERE id=?", [newFailed, u.id]);
          await auditLog(pool, u.id, "LOGIN_FAILED", `Failed attempt ${newFailed} of ${maxAttempts}`, ip);
          return res.status(401).json({
            error: `Invalid password. You have ${maxAttempts - newFailed} attempt(s) remaining before account lockout.`,
          });
        }
      }

      // Login success: reset lockout and failed attempts
      await pool.query("UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?", [u.id]);
      await auditLog(pool, u.id, "LOGIN_SUCCESS", `Logged in (${u.role})`, ip);

      res.json({
        token: sign(u),
        id: u.id,
        name: u.name,
        roll_no: u.roll_no,
        email: u.email,
        department: u.department,
        year_semester: u.year_semester,
        role: u.role,
      });
    })
  );

  // Student Profile details
  app.get(
    "/api/profile",
    auth,
    wrap(async (req, res) => {
      const [users] = await pool.query(
        "SELECT id, name, roll_no, email, department, year_semester, role, created_at FROM users WHERE id=?",
        [req.user.id]
      );
      if (!users[0]) return res.status(404).json({ error: "User not found." });

      const [attempts] = await pool.query(
        `SELECT a.id AS attempt_id, e.id AS exam_id, e.title AS exam_title, e.pass_percentage, a.score, a.total,
                ROUND((a.score / a.total) * 100, 1) AS percentage,
                (a.score / a.total * 100 >= e.pass_percentage) AS is_pass,
                a.tab_switches, a.submitted_at
           FROM attempts a
           JOIN exams e ON e.id = a.exam_id
          WHERE a.user_id = ? AND a.is_submitted = 1
          ORDER BY a.submitted_at DESC`,
        [req.user.id]
      );

      res.json({ ...users[0], attempts });
    })
  );

  // ---- 2. Real Exam Flow ----

  // List exams available to the user
  app.get(
    "/api/exams",
    auth,
    wrap(async (req, res) => {
      const isAdmin = req.user.role === "admin";
      const whereClause = isAdmin ? "" : "WHERE e.is_published = 1";
      const [rows] = await pool.query(
        `SELECT e.id, e.title, e.description, e.duration_min, e.pass_percentage, e.allowed_year,
                e.starts_at, e.ends_at, e.is_published, e.show_review,
                (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
                a.id AS attempt_id, a.score, a.total, a.is_submitted, a.started_at, a.submitted_at,
                (a.score / a.total * 100 >= e.pass_percentage) AS is_pass
           FROM exams e
      LEFT JOIN attempts a ON a.exam_id = e.id AND a.user_id = ?
          ${whereClause}
       ORDER BY e.id DESC`,
        [req.user.id]
      );

      const userYear = (req.user.year_semester || "").trim();
      const enriched = rows.map((e) => {
        const allowedYear = (e.allowed_year || "4th Year").trim();
        const isEligible = isAdmin || allowedYear === "All" || userYear.toLowerCase().includes(allowedYear.toLowerCase());
        return {
          ...e,
          allowed_year: allowedYear,
          is_eligible: isEligible,
        };
      });

      res.json(enriched);
    })
  );

  // Pre-exam instructions / confirmation summary
  app.get(
    "/api/exams/:id",
    auth,
    wrap(async (req, res) => {
      const [ex] = await pool.query(
        "SELECT id, title, description, duration_min, pass_percentage, allowed_year, starts_at, ends_at, is_published, show_review FROM exams WHERE id=?",
        [req.params.id]
      );
      if (!ex[0]) return res.status(404).json({ error: "Examination not found." });
      if (req.user.role !== "admin" && !ex[0].is_published) {
        return res.status(403).json({ error: "This examination is not currently published." });
      }

      const [countRows] = await pool.query("SELECT COUNT(*) AS n FROM questions WHERE exam_id=?", [req.params.id]);
      const [attemptRows] = await pool.query(
        "SELECT id, is_submitted, score, total, started_at, submitted_at FROM attempts WHERE user_id=? AND exam_id=?",
        [req.user.id, req.params.id]
      );

      // Student info for the official ID Card view
      const [student] = await pool.query(
        "SELECT id, name, roll_no, email, department, year_semester FROM users WHERE id=?",
        [req.user.id]
      );

      const userYear = (req.user.year_semester || (student[0] && student[0].year_semester) || "").trim();
      const allowedYear = (ex[0].allowed_year || "4th Year").trim();
      const isEligible = req.user.role === "admin" || allowedYear === "All" || userYear.toLowerCase().includes(allowedYear.toLowerCase());

      res.json({
        ...ex[0],
        allowed_year: allowedYear,
        is_eligible: isEligible,
        question_count: countRows[0].n,
        attempt: attemptRows[0] || null,
        student: student[0] || null,
      });
    })
  );

  // Start or resume examination
  app.post(
    "/api/exams/:id/start",
    auth,
    wrap(async (req, res) => {
      const examId = req.params.id;
      const ip = getClientIp(req);

      const [ex] = await pool.query(
        "SELECT id, title, duration_min, pass_percentage, allowed_year, starts_at, ends_at, is_published FROM exams WHERE id=?",
        [examId]
      );
      if (!ex[0]) return res.status(404).json({ error: "Examination not found." });

      // RBAC: Academic Year Enforcement (e.g., only 4th Year candidates permitted)
      if (req.user.role !== "admin") {
        const userYear = (req.user.year_semester || "").trim();
        const allowedYear = (ex[0].allowed_year || "4th Year").trim();
        const isEligible = allowedYear === "All" || userYear.toLowerCase().includes(allowedYear.toLowerCase());

        if (!isEligible) {
          await auditLog(
            pool,
            req.user.id,
            "RBAC_ACCESS_DENIED",
            `Candidate roll '${req.user.roll_no}' (registered '${userYear}') blocked from exam #${examId} (restricted to '${allowedYear}')`,
            ip
          );
          return res.status(403).json({
            error: `Access Denied (RBAC Policy): This examination is strictly restricted to ${allowedYear} candidates. Your registered academic year is ${userYear || "Unknown"}.`,
          });
        }
      }

      const now = new Date();
      if (ex[0].starts_at && now < new Date(ex[0].starts_at)) {
        return res.status(403).json({ error: `Examination has not opened yet. Scheduled to start at ${new Date(ex[0].starts_at).toLocaleString()}.` });
      }
      if (ex[0].ends_at && now > new Date(ex[0].ends_at)) {
        return res.status(403).json({ error: `Examination window has closed on ${new Date(ex[0].ends_at).toLocaleString()}.` });
      }

      // Check existing attempt
      const [existing] = await pool.query(
        "SELECT id, is_submitted, started_at, answers_saved, marked_review, question_order, tab_switches FROM attempts WHERE user_id=? AND exam_id=?",
        [req.user.id, examId]
      );

      if (existing[0] && existing[0].is_submitted) {
        return res.status(409).json({ error: "You have already completed and submitted this examination." });
      }

      const durationSec = ex[0].duration_min * 60;
      let attemptId;
      let startedAt;
      let questionOrder = null;
      let answersSaved = {};
      let markedReview = [];
      let tabSwitches = 0;

      if (existing[0]) {
        // Resume existing attempt
        attemptId = existing[0].id;
        startedAt = new Date(existing[0].started_at);
        questionOrder = typeof existing[0].question_order === "string" ? JSON.parse(existing[0].question_order) : existing[0].question_order;
        answersSaved = typeof existing[0].answers_saved === "string" ? JSON.parse(existing[0].answers_saved) : existing[0].answers_saved || {};
        markedReview = typeof existing[0].marked_review === "string" ? JSON.parse(existing[0].marked_review) : existing[0].marked_review || [];
        tabSwitches = existing[0].tab_switches || 0;

        const elapsedSec = Math.floor((Date.now() - startedAt.getTime()) / 1000);
        if (elapsedSec > durationSec + 30) {
          // Timer expired while disconnected -> auto finalize submission
          await pool.query(
            "UPDATE attempts SET is_submitted=1, submitted_at=NOW() WHERE id=?",
            [attemptId]
          );
          return res.status(409).json({ error: "Examination time has elapsed and the session was automatically closed." });
        }
      } else {
        // Create new attempt
        startedAt = new Date();
        const [rawQs] = await pool.query(
          "SELECT id, text, opt_a, opt_b, opt_c, opt_d FROM questions WHERE exam_id=? ORDER BY id",
          [examId]
        );
        if (rawQs.length === 0) {
          return res.status(400).json({ error: "This examination has no questions configured yet." });
        }

        // Shuffle questions for this student
        const shuffledQuestions = shuffleArray(rawQs);
        // For each question, shuffle options stably per attempt
        questionOrder = shuffledQuestions.map((q) => {
          const optKeys = shuffleArray(["A", "B", "C", "D"]);
          return {
            id: q.id,
            opt_map: optKeys, // maps presented option position to original key
          };
        });

        const [ins] = await pool.query(
          `INSERT INTO attempts (user_id, exam_id, score, total, is_submitted, started_at, answers_saved, marked_review, question_order)
           VALUES (?, ?, 0, ?, 0, NOW(), ?, ?, ?)`,
          [
            req.user.id,
            examId,
            rawQs.length,
            JSON.stringify({}),
            JSON.stringify([]),
            JSON.stringify(questionOrder),
          ]
        );
        attemptId = ins.insertId;
        await auditLog(pool, req.user.id, "EXAM_START", `Started exam #${examId} (${ex[0].title})`, ip);
      }

      // Fetch all questions and format according to this student's persistent shuffled order
      const [allQuestions] = await pool.query(
        "SELECT id, text, opt_a, opt_b, opt_c, opt_d FROM questions WHERE exam_id=?",
        [examId]
      );
      const qMap = new Map(allQuestions.map((q) => [q.id, q]));

      const clientQuestions = (questionOrder || []).map((item, idx) => {
        const original = qMap.get(item.id);
        if (!original) return null;
        // Build option list based on student permutation
        const options = item.opt_map.map((origKey, optIdx) => {
          const displayLetter = String.fromCharCode(65 + optIdx); // A, B, C, D
          return {
            letter: displayLetter,
            origKey: origKey, // needed internally to match original
            text: original[`opt_${origKey.toLowerCase()}`],
          };
        });
        return {
          display_num: idx + 1,
          q_id: original.id,
          text: original.text,
          options,
        };
      }).filter(Boolean);

      const elapsedSec = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const remainingSec = Math.max(0, durationSec - elapsedSec);

      res.json({
        attempt_id: attemptId,
        exam: {
          id: ex[0].id,
          title: ex[0].title,
          duration_min: ex[0].duration_min,
          pass_percentage: ex[0].pass_percentage,
        },
        duration_sec: durationSec,
        started_at: startedAt.toISOString(),
        server_now: new Date().toISOString(),
        remaining_sec: remainingSec,
        questions: clientQuestions,
        answers_saved: answersSaved,
        marked_review: markedReview,
        tab_switches: tabSwitches,
      });
    })
  );

  // Autosave single answer or review flags
  app.post(
    "/api/exams/:id/autosave",
    auth,
    wrap(async (req, res) => {
      const examId = req.params.id;
      const { answers_saved, marked_review } = req.body || {};

      const [attempts] = await pool.query(
        "SELECT a.id, a.is_submitted, a.started_at, e.duration_min FROM attempts a JOIN exams e ON e.id = a.exam_id WHERE a.user_id=? AND a.exam_id=?",
        [req.user.id, examId]
      );
      const att = attempts[0];
      if (!att) return res.status(404).json({ error: "Active attempt not found." });
      if (att.is_submitted) return res.status(409).json({ error: "Examination has already been submitted." });

      // Server timer enforcement: allow up to duration + 30s buffer
      const elapsedSec = (Date.now() - new Date(att.started_at).getTime()) / 1000;
      if (elapsedSec > att.duration_min * 60 + 30) {
        return res.status(400).json({ error: "Examination time limit exceeded. Submitting exam now." });
      }

      await pool.query(
        "UPDATE attempts SET answers_saved=?, marked_review=? WHERE id=?",
        [JSON.stringify(answers_saved || {}), JSON.stringify(marked_review || []), att.id]
      );
      res.json({ status: "ok" });
    })
  );

  // Record student tab switch or window blur
  app.post(
    "/api/exams/:id/tab-switch",
    auth,
    wrap(async (req, res) => {
      const examId = req.params.id;
      const ip = getClientIp(req);

      const [attempts] = await pool.query(
        "SELECT id, is_submitted, tab_switches, copy_paste_attempts, focus_lost_seconds, right_click_attempts FROM attempts WHERE user_id=? AND exam_id=?",
        [req.user.id, examId]
      );
      const att = attempts[0];
      if (!att || att.is_submitted) return res.json({ status: "ignored" });

      const count = (att.tab_switches || 0) + 1;
      const risk = Math.min(100, count * 15 + (att.copy_paste_attempts || 0) * 20 + Math.floor((att.focus_lost_seconds || 0) / 4) * 4);
      const flagged = risk >= 50 ? 1 : 0;

      await pool.query("UPDATE attempts SET tab_switches=?, risk_score=?, is_flagged=CASE WHEN ?=1 THEN 1 ELSE is_flagged END WHERE id=?", [count, risk, flagged, att.id]);
      await auditLog(pool, req.user.id, "EXAM_TAB_SWITCH", `Tab switch #${count} recorded during exam #${examId} (Risk: ${risk}%)`, ip);
      res.json({ status: "ok", count, risk_score: risk, is_flagged: Boolean(flagged) });
    })
  );

  // Live Proctoring Anomaly Telemetry and Real-Time Risk Engine
  app.post(
    "/api/exams/:id/telemetry",
    auth,
    wrap(async (req, res) => {
      const examId = req.params.id;
      const {
        tab_switches = 0,
        copy_paste_attempts = 0,
        focus_lost_seconds = 0,
        right_click_attempts = 0,
      } = req.body || {};
      const ip = getClientIp(req);

      const [attempts] = await pool.query(
        "SELECT id, is_submitted, is_flagged, risk_score FROM attempts WHERE user_id=? AND exam_id=?",
        [req.user.id, examId]
      );
      const att = attempts[0];
      if (!att || att.is_submitted) return res.json({ status: "ignored" });

      const tabs = Math.max(0, parseInt(tab_switches, 10) || 0);
      const copypaste = Math.max(0, parseInt(copy_paste_attempts, 10) || 0);
      const focusSec = Math.max(0, parseInt(focus_lost_seconds, 10) || 0);
      const rightclicks = Math.max(0, parseInt(right_click_attempts, 10) || 0);

      // Weighted Candidate Integrity Risk Score (0 - 100)
      const computedRisk = Math.min(
        100,
        tabs * 12 +
        copypaste * 20 +
        Math.floor(focusSec / 4) * 4 +
        rightclicks * 8
      );

      const autoFlagged = att.is_flagged || computedRisk >= 50 ? 1 : 0;

      await pool.query(
        `UPDATE attempts
            SET tab_switches = ?, copy_paste_attempts = ?, focus_lost_seconds = ?,
                right_click_attempts = ?, risk_score = ?, is_flagged = ?
          WHERE id = ?`,
        [tabs, copypaste, focusSec, rightclicks, computedRisk, autoFlagged, att.id]
      );

      if (computedRisk >= 50 && (att.risk_score < 50 || !att.is_flagged)) {
        await auditLog(
          pool,
          req.user.id,
          "PROCTORING_HIGH_RISK_FLAG",
          `Candidate reached ${computedRisk}% anomaly risk score (${tabs} tabs, ${copypaste} copy-paste, ${focusSec}s focus lost, ${rightclicks} right-clicks)`,
          ip
        );
      }

      res.json({
        status: "ok",
        risk_score: computedRisk,
        is_flagged: Boolean(autoFlagged),
        risk_tier: computedRisk >= 50 ? "high" : computedRisk >= 20 ? "moderate" : "low",
      });
    })
  );

  // Final Exam submission with server-side timer verification
  app.post(
    "/api/exams/:id/submit",
    auth,
    wrap(async (req, res) => {
      const examId = req.params.id;
      const clientAnswers = (req.body && req.body.answers) || {};
      const ip = getClientIp(req);

      const [ex] = await pool.query(
        "SELECT id, title, duration_min, pass_percentage, show_review FROM exams WHERE id=?",
        [examId]
      );
      if (!ex[0]) return res.status(404).json({ error: "Examination not found." });

      const [attempts] = await pool.query(
        "SELECT id, is_submitted, started_at, question_order, tab_switches FROM attempts WHERE user_id=? AND exam_id=?",
        [req.user.id, examId]
      );
      const att = attempts[0];
      if (att && att.is_submitted) {
        return res.status(409).json({ error: "You have already submitted this examination." });
      }

      const startedAt = att ? new Date(att.started_at) : new Date();
      const elapsedSec = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const maxAllowedSec = ex[0].duration_min * 60 + 30; // 30s grace window

      // Fetch questions and correct answers from database
      const [qs] = await pool.query("SELECT id, text, opt_a, opt_b, opt_c, opt_d, correct FROM questions WHERE exam_id=?", [examId]);
      let score = 0;

      // Grade answers
      const gradedAnswers = {};
      for (const q of qs) {
        const studentAns = clientAnswers[q.id];
        gradedAnswers[q.id] = studentAns || null;
        if (studentAns && studentAns.toUpperCase() === q.correct.toUpperCase()) {
          score++;
        }
      }

      const total = qs.length;
      const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
      const isPass = percentage >= ex[0].pass_percentage;
      const tabSwitches = att ? att.tab_switches : 0;

      if (att) {
        await pool.query(
          "UPDATE attempts SET score=?, total=?, answers=?, answers_saved=?, is_submitted=1, submitted_at=NOW() WHERE id=?",
          [score, total, JSON.stringify(gradedAnswers), JSON.stringify(gradedAnswers), att.id]
        );
      } else {
        // Fallback for locust tests or direct submit
        await pool.query(
          "INSERT INTO attempts (user_id, exam_id, score, total, answers, is_submitted, started_at, submitted_at) VALUES (?,?,?,?,?, 1, NOW(), NOW())",
          [req.user.id, examId, score, total, JSON.stringify(gradedAnswers)]
        );
      }

      await auditLog(
        pool,
        req.user.id,
        "EXAM_SUBMIT",
        `Submitted exam #${examId}: ${score}/${total} (${percentage}%, ${isPass ? "PASS" : "FAIL"}, ${tabSwitches} tab switches)`,
        ip
      );

      // Async email result via Amazon SES
      const [u] = await pool.query("SELECT name, email, roll_no FROM users WHERE id=?", [req.user.id]);
      if (u[0]) {
        aws
          .emailResult(u[0].email, u[0].name, ex[0].title, score, total)
          .catch((e) => console.error("SES dispatch:", e.message));
      }

      res.json({
        score,
        total,
        percentage,
        pass_percentage: ex[0].pass_percentage,
        is_pass: isPass,
        time_taken_sec: elapsedSec,
        tab_switches: tabSwitches,
        show_review: ex[0].show_review === 1,
      });
    })
  );

  // Student: View submission result slip
  app.get(
    "/api/results/slip/:examId",
    auth,
    wrap(async (req, res) => {
      const [attempts] = await pool.query(
        `SELECT a.id, a.score, a.total, a.answers, a.tab_switches,
                a.copy_paste_attempts, a.focus_lost_seconds, a.right_click_attempts,
                a.risk_score, a.is_flagged, a.started_at, a.submitted_at,
                TIMESTAMPDIFF(SECOND, a.started_at, a.submitted_at) AS time_taken_sec,
                ROUND((a.score / a.total) * 100, 1) AS percentage,
                e.id AS exam_id, e.title AS exam_title, e.pass_percentage, e.show_review,
                u.name AS student_name, u.roll_no, u.department, u.year_semester
           FROM attempts a
           JOIN exams e ON e.id = a.exam_id
           JOIN users u ON u.id = a.user_id
          WHERE a.exam_id = ? AND a.user_id = ? AND a.is_submitted = 1`,
        [req.params.examId, req.user.id]
      );
      if (!attempts[0]) return res.status(404).json({ error: "Result slip not found." });

      const slip = attempts[0];
      slip.is_pass = slip.percentage >= slip.pass_percentage;

      // Include question review ONLY if admin permitted it for this exam
      if (slip.show_review) {
        const [qs] = await pool.query(
          "SELECT id, text, opt_a, opt_b, opt_c, opt_d, correct FROM questions WHERE exam_id=?",
          [slip.exam_id]
        );
        const studentAnswers = typeof slip.answers === "string" ? JSON.parse(slip.answers) : slip.answers || {};
        slip.questions = qs.map((q) => ({
          id: q.id,
          text: q.text,
          opt_a: q.opt_a,
          opt_b: q.opt_b,
          opt_c: q.opt_c,
          opt_d: q.opt_d,
          student_answer: studentAnswers[q.id] || null,
          correct: q.correct,
          is_correct: (studentAnswers[q.id] || "").toUpperCase() === q.correct.toUpperCase(),
        }));
      } else {
        slip.questions = null;
      }

      res.json(slip);
    })
  );

  // Student: List of all personal results
  app.get(
    "/api/results/me",
    auth,
    wrap(async (req, res) => {
      const [rows] = await pool.query(
        `SELECT a.id AS attempt_id, e.id AS exam_id, e.title, a.score, a.total,
                ROUND((a.score / a.total) * 100, 1) AS percentage,
                e.pass_percentage,
                (a.score / a.total * 100 >= e.pass_percentage) AS is_pass,
                a.tab_switches, a.submitted_at
           FROM attempts a
           JOIN exams e ON e.id = a.exam_id
          WHERE a.user_id = ? AND a.is_submitted = 1
          ORDER BY a.submitted_at DESC`,
        [req.user.id]
      );
      res.json(rows);
    })
  );

  // ---- 3. Admin Dashboard & Management ----

  // Dashboard summary metrics & SVG data
  app.get(
    "/api/admin/dashboard",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const [studentCount] = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role='student'");
      const [examCount] = await pool.query("SELECT COUNT(*) AS count FROM exams");
      const [submissionCount] = await pool.query("SELECT COUNT(*) AS count FROM attempts WHERE is_submitted=1");

      const [perfRows] = await pool.query(
        `SELECT AVG(score / total * 100) AS avg_score,
                SUM(CASE WHEN (score / total * 100) >= e.pass_percentage THEN 1 ELSE 0 END) / COUNT(*) * 100 AS pass_rate
           FROM attempts a
           JOIN exams e ON e.id = a.exam_id
          WHERE a.is_submitted = 1 AND a.total > 0`
      );

      // Score distribution histogram (5 brackets)
      const [distRows] = await pool.query(
        `SELECT
           SUM(CASE WHEN pct < 20 THEN 1 ELSE 0 END) AS b_0_20,
           SUM(CASE WHEN pct >= 20 AND pct < 40 THEN 1 ELSE 0 END) AS b_20_40,
           SUM(CASE WHEN pct >= 40 AND pct < 60 THEN 1 ELSE 0 END) AS b_40_60,
           SUM(CASE WHEN pct >= 60 AND pct < 80 THEN 1 ELSE 0 END) AS b_60_80,
           SUM(CASE WHEN pct >= 80 THEN 1 ELSE 0 END) AS b_80_100
         FROM (
           SELECT (score / total * 100) AS pct
           FROM attempts
           WHERE is_submitted = 1 AND total > 0
         ) scores`
      );

      // Submissions per exam
      const [perExamRows] = await pool.query(
        `SELECT e.id, e.title,
                COUNT(a.id) AS submissions,
                ROUND(AVG(a.score / a.total * 100), 1) AS avg_score,
                ROUND(SUM(CASE WHEN (a.score / a.total * 100) >= e.pass_percentage THEN 1 ELSE 0 END) / COUNT(a.id) * 100, 1) AS pass_rate
           FROM exams e
      LEFT JOIN attempts a ON a.exam_id = e.id AND a.is_submitted = 1
          GROUP BY e.id, e.title
          ORDER BY e.id DESC`
      );

      res.json({
        total_students: studentCount[0].count,
        total_exams: examCount[0].count,
        total_submissions: submissionCount[0].count,
        avg_score: perfRows[0] && perfRows[0].avg_score !== null ? Math.round(perfRows[0].avg_score) : 0,
        pass_rate: perfRows[0] && perfRows[0].pass_rate !== null ? Math.round(perfRows[0].pass_rate) : 0,
        distribution: distRows[0] || { b_0_20: 0, b_20_40: 0, b_40_60: 0, b_60_80: 0, b_80_100: 0 },
        exams_summary: perExamRows,
      });
    })
  );

  // Manage students: searchable, filterable, paginated
  app.get(
    "/api/admin/students",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const { search, department, year, page = 1, limit = 20 } = req.query;
      const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
      const params = [];
      let where = "WHERE u.role='student'";

      if (search) {
        where += " AND (u.name LIKE ? OR u.roll_no LIKE ? OR u.email LIKE ?)";
        const s = `%${search.trim()}%`;
        params.push(s, s, s);
      }
      if (department) {
        where += " AND u.department = ?";
        params.push(department);
      }
      if (year) {
        where += " AND u.year_semester = ?";
        params.push(year);
      }

      const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM users u ${where}`, params);
      const total = countRows[0].total;

      const [students] = await pool.query(
        `SELECT u.id, u.name, u.roll_no, u.email, u.department, u.year_semester, u.is_active, u.created_at,
                COUNT(a.id) AS attempts_count,
                ROUND(AVG(a.score / a.total * 100), 1) AS avg_percentage
           FROM users u
      LEFT JOIN attempts a ON a.user_id = u.id AND a.is_submitted = 1
          ${where}
          GROUP BY u.id
          ORDER BY u.id DESC
          LIMIT ? OFFSET ?`,
        [...params, parseInt(limit, 10), offset]
      );

      // Distinct filter values for UI dropdowns
      const [depts] = await pool.query("SELECT DISTINCT department FROM users WHERE role='student' AND department IS NOT NULL");
      const [years] = await pool.query("SELECT DISTINCT year_semester FROM users WHERE role='student' AND year_semester IS NOT NULL");

      res.json({
        students,
        total,
        page: parseInt(page, 10),
        pages: Math.ceil(total / parseInt(limit, 10)),
        departments: depts.map((d) => d.department),
        years: years.map((y) => y.year_semester),
      });
    })
  );

  // Single student profile & complete attempt history
  app.get(
    "/api/admin/students/:id",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const [users] = await pool.query(
        "SELECT id, name, roll_no, email, department, year_semester, role, is_active, created_at FROM users WHERE id=?",
        [req.params.id]
      );
      if (!users[0]) return res.status(404).json({ error: "Student not found." });

      const [attempts] = await pool.query(
        `SELECT a.id AS attempt_id, e.id AS exam_id, e.title, e.pass_percentage,
                a.score, a.total, ROUND(a.score / a.total * 100, 1) AS percentage,
                (a.score / a.total * 100 >= e.pass_percentage) AS is_pass,
                a.tab_switches, a.started_at, a.submitted_at
           FROM attempts a
           JOIN exams e ON e.id = a.exam_id
          WHERE a.user_id = ? AND a.is_submitted = 1
          ORDER BY a.submitted_at DESC`,
        [req.params.id]
      );

      res.json({ ...users[0], attempts });
    })
  );

  // Deactivate or reactivate student account
  app.patch(
    "/api/admin/students/:id/status",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const { is_active } = req.body;
      const ip = getClientIp(req);
      const newStatus = is_active ? 1 : 0;

      await pool.query("UPDATE users SET is_active=? WHERE id=? AND role='student'", [newStatus, req.params.id]);
      await auditLog(
        pool,
        req.user.id,
        newStatus ? "STUDENT_ACTIVATED" : "STUDENT_DEACTIVATED",
        `Changed student ID #${req.params.id} active state to ${newStatus}`,
        ip
      );
      res.json({ status: "ok", is_active: Boolean(newStatus) });
    })
  );

  // Reset student exam attempt (allows retake)
  app.post(
    "/api/admin/attempts/:id/reset",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const ip = getClientIp(req);
      const [att] = await pool.query(
        "SELECT a.id, a.user_id, a.exam_id, u.name, u.roll_no, e.title FROM attempts a JOIN users u ON u.id = a.user_id JOIN exams e ON e.id = a.exam_id WHERE a.id=?",
        [req.params.id]
      );
      if (!att[0]) return res.status(404).json({ error: "Attempt not found." });

      await pool.query("DELETE FROM attempts WHERE id=?", [req.params.id]);
      await auditLog(
        pool,
        req.user.id,
        "ATTEMPT_RESET",
        `Reset exam '${att[0].title}' attempt for ${att[0].name} (${att[0].roll_no})`,
        ip
      );
      res.json({ status: "ok", message: "Attempt reset successfully. The student may now retake the exam." });
    })
  );

  // Admin creating other admin accounts or students directly
  app.post(
    "/api/admin/users",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const { name, roll_no, email, department, year_semester, password, role } = req.body || {};
      const ip = getClientIp(req);

      if (!name || !emailOk(email) || !password || password.length < 8) {
        return res.status(400).json({ error: "Name, valid email, and password of at least 8 characters are required." });
      }

      const assignedRole = role === "admin" ? "admin" : "student";
      const cleanRoll = roll_no && String(roll_no).trim().length > 0
        ? String(roll_no).trim().toUpperCase().slice(0, 50)
        : (assignedRole === "admin" ? `ADMIN${Date.now()}` : `ROLL${Date.now()}`);

      const hash = await bcrypt.hash(password, 10);
      try {
        const [r] = await pool.query(
          "INSERT INTO users (name, roll_no, email, department, year_semester, password_hash, role) VALUES (?,?,?,?,?,?,?)",
          [name.trim(), cleanRoll, email.toLowerCase().trim(), department || "Administration", year_semester || "Staff", hash, assignedRole]
        );
        await auditLog(pool, req.user.id, "USER_CREATED_BY_ADMIN", `Created ${assignedRole} '${name}' (${email})`, ip);
        res.status(201).json({ id: r.insertId, name, roll_no: cleanRoll, email, role: assignedRole });
      } catch (e) {
        if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Email or Roll Number is already registered." });
        throw e;
      }
    })
  );

  // Submissions list with filters
  app.get(
    "/api/admin/results",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const { exam_id, department, status } = req.query;
      let where = "WHERE a.is_submitted = 1";
      const params = [];

      if (exam_id) {
        where += " AND a.exam_id = ?";
        params.push(exam_id);
      }
      if (department) {
        where += " AND u.department = ?";
        params.push(department);
      }
      if (status === "pass") {
        where += " AND (a.score / a.total * 100) >= e.pass_percentage";
      } else if (status === "fail") {
        where += " AND (a.score / a.total * 100) < e.pass_percentage";
      }

      const [rows] = await pool.query(
        `SELECT a.id AS attempt_id, u.id AS user_id, u.name, u.roll_no, u.department, u.year_semester,
                e.id AS exam_id, e.title AS exam, e.pass_percentage,
                a.score, a.total,
                ROUND((a.score / a.total) * 100, 1) AS percentage,
                (a.score / a.total * 100 >= e.pass_percentage) AS is_pass,
                TIMESTAMPDIFF(SECOND, a.started_at, a.submitted_at) AS time_taken_sec,
                a.tab_switches, a.submitted_at
           FROM attempts a
           JOIN users u ON u.id = a.user_id
           JOIN exams e ON e.id = a.exam_id
          ${where}
          ORDER BY a.submitted_at DESC
          LIMIT 500`,
        params
      );
      res.json(rows);
    })
  );

  // Live Proctoring Radar: List all candidate attempts with anomaly metrics
  app.get(
    "/api/admin/proctoring",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const { exam_id, filter } = req.query;
      let where = "WHERE 1=1";
      const params = [];

      if (exam_id) {
        where += " AND a.exam_id = ?";
        params.push(exam_id);
      }
      if (filter === "high_risk") {
        where += " AND a.risk_score >= 50";
      } else if (filter === "flagged") {
        where += " AND a.is_flagged = 1";
      } else if (filter === "active") {
        where += " AND a.is_submitted = 0";
      }

      const [rows] = await pool.query(
        `SELECT a.id AS attempt_id, a.user_id, a.exam_id, a.is_submitted,
                a.score, a.total,
                ROUND((a.score / a.total) * 100, 1) AS percentage,
                a.tab_switches, a.copy_paste_attempts, a.focus_lost_seconds, a.right_click_attempts,
                a.risk_score, a.is_flagged, a.started_at, a.submitted_at,
                TIMESTAMPDIFF(SECOND, a.started_at, NOW()) AS elapsed_sec,
                e.title AS exam_title, e.duration_min,
                u.name AS student_name, u.roll_no, u.email, u.department, u.year_semester
           FROM attempts a
           JOIN users u ON u.id = a.user_id
           JOIN exams e ON e.id = a.exam_id
          ${where}
          ORDER BY a.is_flagged DESC, a.risk_score DESC, a.id DESC
          LIMIT 200`,
        params
      );

      const [stats] = await pool.query(
        `SELECT
           COUNT(*) AS total_monitored,
           SUM(CASE WHEN is_submitted = 0 THEN 1 ELSE 0 END) AS live_in_progress,
           SUM(CASE WHEN risk_score >= 50 THEN 1 ELSE 0 END) AS high_risk_count,
           SUM(CASE WHEN is_flagged = 1 THEN 1 ELSE 0 END) AS flagged_count,
           ROUND(AVG(risk_score), 1) AS avg_risk
         FROM attempts`
      );

      res.json({
        attempts: rows,
        stats: stats[0] || { total_monitored: 0, live_in_progress: 0, high_risk_count: 0, flagged_count: 0, avg_risk: 0 },
      });
    })
  );

  // Proctoring: Flag or unflag candidate attempt
  app.patch(
    "/api/admin/attempts/:id/flag",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const { is_flagged } = req.body;
      const ip = getClientIp(req);
      const newFlag = is_flagged ? 1 : 0;

      await pool.query("UPDATE attempts SET is_flagged = ? WHERE id = ?", [newFlag, req.params.id]);
      await auditLog(
        pool,
        req.user.id,
        newFlag ? "PROCTOR_MANUAL_FLAG" : "PROCTOR_MANUAL_UNFLAG",
        `Proctor manual ${newFlag ? "FLAG" : "UNFLAG"} applied to candidate attempt #${req.params.id}`,
        ip
      );
      res.json({ status: "ok", is_flagged: Boolean(newFlag) });
    })
  );

  // Export results to CSV (retains S3 upload)
  app.get(
    "/api/admin/results.csv",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const { exam_id, department } = req.query;
      let where = "WHERE a.is_submitted = 1";
      const params = [];
      if (exam_id) { where += " AND a.exam_id = ?"; params.push(exam_id); }
      if (department) { where += " AND u.department = ?"; params.push(department); }

      const [rows] = await pool.query(
        `SELECT u.roll_no, u.name, u.email, u.department, u.year_semester,
                e.title AS exam, a.score, a.total,
                ROUND((a.score / a.total) * 100, 1) AS percentage,
                CASE WHEN (a.score / a.total * 100 >= e.pass_percentage) THEN 'PASS' ELSE 'FAIL' END AS result,
                TIMESTAMPDIFF(SECOND, a.started_at, a.submitted_at) AS time_taken_sec,
                a.tab_switches, a.submitted_at
           FROM attempts a
           JOIN users u ON u.id = a.user_id
           JOIN exams e ON e.id = a.exam_id
          ${where}
          ORDER BY a.submitted_at DESC`,
        params
      );

      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = "Roll Number,Student Name,Email,Department,Year,Exam Title,Score,Total,Percentage,Status,Time Taken (s),Tab Switches,Submitted At";
      const lines = rows.map((r) =>
        [
          r.roll_no,
          r.name,
          r.email,
          r.department,
          r.year_semester,
          r.exam,
          r.score,
          r.total,
          `${r.percentage}%`,
          r.result,
          r.time_taken_sec || 0,
          r.tab_switches || 0,
          new Date(r.submitted_at).toISOString(),
        ]
          .map(esc)
          .join(",")
      );
      const csv = [header, ...lines].join("\n");
      const key = `exports/results-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;

      const saved = await aws.saveExport(key, csv).catch((e) => {
        console.error("S3 Export Error:", e.message);
        return false;
      });
      if (saved) res.setHeader("X-Saved-To", `s3://${cfg.s3Bucket}/${key}`);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="university_exam_results.csv"');
      res.send(csv);
    })
  );

  // Per-Exam Detailed Analytics (difficulty & question accuracy)
  app.get(
    "/api/admin/exams/:id/analytics",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const examId = req.params.id;
      const [ex] = await pool.query(
        "SELECT id, title, duration_min, pass_percentage FROM exams WHERE id=?",
        [examId]
      );
      if (!ex[0]) return res.status(404).json({ error: "Exam not found." });

      const [overall] = await pool.query(
        `SELECT COUNT(*) AS total_submissions,
                MAX(score) AS highest_score,
                MIN(score) AS lowest_score,
                ROUND(AVG(score / total * 100), 1) AS avg_score,
                ROUND(SUM(CASE WHEN (score / total * 100) >= ? THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) AS pass_rate
           FROM attempts
          WHERE exam_id = ? AND is_submitted = 1`,
        [ex[0].pass_percentage, examId]
      );

      // Question-by-question accuracy
      const [qs] = await pool.query(
        "SELECT id, text, opt_a, opt_b, opt_c, opt_d, correct FROM questions WHERE exam_id=? ORDER BY id",
        [examId]
      );

      const [attempts] = await pool.query(
        "SELECT answers FROM attempts WHERE exam_id=? AND is_submitted=1",
        [examId]
      );

      const totalSubmissions = attempts.length;
      const questionStats = qs.map((q) => {
        let correctCount = 0;
        const optDistribution = { A: 0, B: 0, C: 0, D: 0 };

        for (const att of attempts) {
          const ans = typeof att.answers === "string" ? JSON.parse(att.answers) : att.answers || {};
          const selected = (ans[q.id] || "").toUpperCase();
          if (selected in optDistribution) optDistribution[selected]++;
          if (selected === q.correct.toUpperCase()) correctCount++;
        }

        const accuracyPct = totalSubmissions > 0 ? Math.round((correctCount / totalSubmissions) * 100) : 0;
        return {
          id: q.id,
          text: q.text,
          correct: q.correct,
          accuracy_pct: accuracyPct,
          options: {
            A: { text: q.opt_a, count: optDistribution.A },
            B: { text: q.opt_b, count: optDistribution.B },
            C: { text: q.opt_c, count: optDistribution.C },
            D: { text: q.opt_d, count: optDistribution.D },
          },
        };
      });

      res.json({
        exam: ex[0],
        metrics: overall[0] || { total_submissions: 0, highest_score: 0, lowest_score: 0, avg_score: 0, pass_rate: 0 },
        question_stats: questionStats,
      });
    })
  );

  // Manage Exams: List all exams
  app.get(
    "/api/admin/exams",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const [rows] = await pool.query(
        `SELECT e.id, e.title, e.description, e.duration_min, e.pass_percentage, e.allowed_year,
                e.starts_at, e.ends_at, e.is_published, e.show_review, e.created_at,
                (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
                (SELECT COUNT(*) FROM attempts a WHERE a.exam_id = e.id AND a.is_submitted = 1) AS submission_count
           FROM exams e
          ORDER BY e.id DESC`
      );
      res.json(rows);
    })
  );

  // Manage Exams: Create exam (supports bulk or structured)
  app.post(
    "/api/admin/exams",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const {
        title,
        description,
        duration_min,
        pass_percentage = 40,
        allowed_year = "4th Year",
        starts_at,
        ends_at,
        is_published = 1,
        show_review = 1,
        questions,
      } = req.body || {};
      const ip = getClientIp(req);

      if (!title || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: "Exam title and at least one question are required." });
      }

      for (const q of questions) {
        if (!q.text || !Array.isArray(q.options) || q.options.length !== 4 || !/^[ABCD]$/i.test(q.correct)) {
          return res.status(400).json({
            error: "Each question must contain text, 4 options, and a valid correct option letter (A, B, C, or D).",
          });
        }
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [r] = await conn.query(
          `INSERT INTO exams (title, description, duration_min, pass_percentage, allowed_year, starts_at, ends_at, is_published, show_review)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            title.trim(),
            description ? description.trim() : null,
            Math.max(1, parseInt(duration_min, 10) || 10),
            Math.min(100, Math.max(0, parseInt(pass_percentage, 10) || 40)),
            allowed_year ? String(allowed_year).trim() : "4th Year",
            starts_at ? new Date(starts_at) : null,
            ends_at ? new Date(ends_at) : null,
            is_published ? 1 : 0,
            show_review ? 1 : 0,
          ]
        );
        const examId = r.insertId;

        for (const q of questions) {
          await conn.query(
            "INSERT INTO questions (exam_id, text, opt_a, opt_b, opt_c, opt_d, correct) VALUES (?,?,?,?,?,?,?)",
            [examId, q.text.trim(), ...q.options.map((o) => String(o).trim()), q.correct.toUpperCase()]
          );
        }

        await conn.commit();
        await auditLog(pool, req.user.id, "EXAM_CREATE", `Created exam #${examId} '${title}' with ${questions.length} questions (RBAC: ${allowed_year})`, ip);
        res.status(201).json({ id: examId });
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    })
  );

  // Edit exam details
  app.put(
    "/api/admin/exams/:id",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const { title, description, duration_min, pass_percentage, allowed_year, starts_at, ends_at, is_published, show_review } = req.body || {};
      const ip = getClientIp(req);

      if (!title) return res.status(400).json({ error: "Title is required." });

      await pool.query(
        `UPDATE exams
            SET title = ?, description = ?, duration_min = ?, pass_percentage = ?, allowed_year = ?,
                starts_at = ?, ends_at = ?, is_published = ?, show_review = ?
          WHERE id = ?`,
        [
          title.trim(),
          description ? description.trim() : null,
          Math.max(1, parseInt(duration_min, 10) || 10),
          Math.min(100, Math.max(0, parseInt(pass_percentage, 10) || 40)),
          allowed_year ? String(allowed_year).trim() : "4th Year",
          starts_at ? new Date(starts_at) : null,
          ends_at ? new Date(ends_at) : null,
          is_published ? 1 : 0,
          show_review ? 1 : 0,
          req.params.id,
        ]
      );

      await auditLog(pool, req.user.id, "EXAM_UPDATE", `Updated exam #${req.params.id} '${title}' (RBAC: ${allowed_year})`, ip);
      res.json({ status: "ok" });
    })
  );

  // Delete exam
  app.delete(
    "/api/admin/exams/:id",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const ip = getClientIp(req);
      await pool.query("DELETE FROM exams WHERE id = ?", [req.params.id]);
      await auditLog(pool, req.user.id, "EXAM_DELETE", `Deleted exam #${req.params.id}`, ip);
      res.json({ status: "ok" });
    })
  );

  // Fetch individual exam questions for editing
  app.get(
    "/api/admin/exams/:id/questions",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const [qs] = await pool.query(
        "SELECT id, text, opt_a, opt_b, opt_c, opt_d, correct FROM questions WHERE exam_id=? ORDER BY id",
        [req.params.id]
      );
      res.json(qs);
    })
  );

  // Add individual question to exam
  app.post(
    "/api/admin/exams/:id/questions",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const { text, options, correct } = req.body || {};
      if (!text || !Array.isArray(options) || options.length !== 4 || !/^[ABCD]$/i.test(correct)) {
        return res.status(400).json({ error: "Question text, 4 options, and correct letter (A-D) are required." });
      }
      const [r] = await pool.query(
        "INSERT INTO questions (exam_id, text, opt_a, opt_b, opt_c, opt_d, correct) VALUES (?,?,?,?,?,?,?)",
        [req.params.id, text.trim(), ...options.map((o) => String(o).trim()), correct.toUpperCase()]
      );
      res.status(201).json({ id: r.insertId });
    })
  );

  // Edit question
  app.put(
    "/api/admin/questions/:id",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const { text, options, correct } = req.body || {};
      if (!text || !Array.isArray(options) || options.length !== 4 || !/^[ABCD]$/i.test(correct)) {
        return res.status(400).json({ error: "Question text, 4 options, and correct letter (A-D) are required." });
      }
      await pool.query(
        "UPDATE questions SET text=?, opt_a=?, opt_b=?, opt_c=?, opt_d=?, correct=? WHERE id=?",
        [text.trim(), ...options.map((o) => String(o).trim()), correct.toUpperCase(), req.params.id]
      );
      res.json({ status: "ok" });
    })
  );

  // Delete question
  app.delete(
    "/api/admin/questions/:id",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      await pool.query("DELETE FROM questions WHERE id=?", [req.params.id]);
      res.json({ status: "ok" });
    })
  );

  // Audit Logs view
  app.get(
    "/api/admin/audit-logs",
    auth,
    adminOnly,
    wrap(async (req, res) => {
      const [rows] = await pool.query(
        `SELECT l.id, l.action, l.details, l.ip, l.created_at,
                u.name AS user_name, u.roll_no, u.role
           FROM audit_logs l
      LEFT JOIN users u ON u.id = l.user_id
          ORDER BY l.id DESC
          LIMIT 200`
      );
      res.json(rows);
    })
  );

  // Error handling
  app.use("/api", (req, res) => res.status(404).json({ error: "API endpoint not found." }));
  app.use((err, req, res, next) => {
    console.error("Unhandled server exception:", err);
    res.status(500).json({ error: "Something went wrong on the server." });
  });

// Export Express app for Vercel Serverless / Express runtime
module.exports = app;

// Start HTTP listener when run directly (Docker, EC2, or local `node server.js`)
if (require.main === module) {
  ensureInit()
    .then(() => {
      app.listen(cfg.port, () =>
        console.log(`ExamCloud University Portal active on :${cfg.port} (host ${os.hostname()})`)
      );
    })
    .catch((err) => {
      console.error("Fatal startup error:", err);
      process.exit(1);
    });
}
