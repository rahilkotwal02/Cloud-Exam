(() => {
  const view = document.getElementById("view");
  const nav = document.getElementById("nav");
  const modalContainer = document.getElementById("modal-container");

  const state = {
    token: sessionStorage.getItem("token"),
    id: sessionStorage.getItem("id"),
    name: sessionStorage.getItem("name"),
    roll_no: sessionStorage.getItem("roll_no"),
    role: sessionStorage.getItem("role"),
    department: sessionStorage.getItem("department"),
    year_semester: sessionStorage.getItem("year_semester"),
    timer: null,
    examState: null,
    tabWarningShown: false,
  };

  const el = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  };

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function api(path, opts = {}) {
    const headers = { "Content-Type": "application/json" };
    if (state.token) headers["Authorization"] = "Bearer " + state.token;

    let res;
    try {
      res = await fetch("/api" + path, {
        method: opts.method || "GET",
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch {
      throw new Error("Unable to connect to the examination server. Please check your connection.");
    }

    if (res.status === 401 && state.token) {
      signOut("Your session has expired. Please sign in again.");
      throw new Error("Session expired.");
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  function setSession(d) {
    state.token = d.token;
    state.id = d.id;
    state.name = d.name;
    state.roll_no = d.roll_no;
    state.role = d.role;
    state.department = d.department;
    state.year_semester = d.year_semester;

    sessionStorage.setItem("token", d.token);
    sessionStorage.setItem("id", d.id || "");
    sessionStorage.setItem("name", d.name || "");
    sessionStorage.setItem("roll_no", d.roll_no || "");
    sessionStorage.setItem("role", d.role || "");
    sessionStorage.setItem("department", d.department || "");
    sessionStorage.setItem("year_semester", d.year_semester || "");
  }

  function signOut(msg) {
    clearInterval(state.timer);
    state.token = state.id = state.name = state.roll_no = state.role = state.department = state.year_semester = null;
    state.examState = null;
    sessionStorage.clear();
    location.hash = "#/login" + (msg ? `?msg=${encodeURIComponent(msg)}` : "");
  }

  function renderNav() {
    nav.innerHTML = "";
    if (!state.token) return;

    const whoBox = el(`
      <div class="who">
        <span class="who-name">${esc(state.name)}</span>
        <span class="who-roll">${esc(state.roll_no || (state.role === "admin" ? "Staff Administrator" : "Candidate"))}</span>
      </div>
    `);
    nav.append(whoBox);

    if (state.role === "admin") {
      nav.append(el(`<a class="btn ghost" href="#/admin">Dashboard</a>`));
    } else {
      nav.append(el(`<a class="btn ghost" href="#/">My Exams</a>`));
      nav.append(el(`<a class="btn ghost" href="#/results">My Results</a>`));
      nav.append(el(`<a class="btn ghost" href="#/profile">Profile</a>`));
    }

    const outBtn = el(`<button class="ghost">Sign out</button>`);
    outBtn.onclick = () => signOut();
    nav.append(outBtn);
  }

  function show(node) {
    modalContainer.innerHTML = "";
    view.replaceChildren(node);
    view.focus();
    renderNav();
  }

  function openModal(contentNode) {
    modalContainer.innerHTML = "";
    const overlay = el(`<div class="modal-overlay"></div>`);
    const modal = el(`<div class="modal" role="dialog" aria-modal="true"></div>`);
    modal.append(contentNode);
    overlay.append(modal);
    overlay.onclick = (e) => {
      if (e.target === overlay) closeModal();
    };
    modalContainer.append(overlay);
  }

  function closeModal() {
    modalContainer.innerHTML = "";
  }

  // ==========================================
  // VIEW 1: LOGIN & REGISTRATION
  // ==========================================
  function loginView() {
    const urlParams = new URLSearchParams(location.hash.includes("?") ? location.hash.split("?")[1] : "");
    const initialMsg = urlParams.get("msg") || "";

    const n = el(`
      <section class="panel" style="max-width:480px; margin:20px auto;">
        <h1>University Examination Portal</h1>
        <p class="sub">Sign in with your university credentials or register as a new student.</p>

        <div class="tabs" role="tablist">
          <button role="tab" aria-selected="true" data-m="login">Sign In</button>
          <button role="tab" aria-selected="false" data-m="register">Student Registration</button>
        </div>

        <form id="authForm" onsubmit="return false;">
          <div id="regFields" hidden>
            <label for="regName">Full Legal Name</label>
            <input id="regName" placeholder="e.g. Aarav Sharma" autocomplete="name">

            <label for="regRoll">University Roll / ID Number</label>
            <input id="regRoll" placeholder="e.g. 2024CS001" style="text-transform:uppercase;">

            <label for="regDept">Department</label>
            <select id="regDept">
              <option value="Computer Science">Computer Science & Engineering</option>
              <option value="Information Technology">Information Technology</option>
              <option value="Electronics & Communication">Electronics & Communication</option>
              <option value="Electrical Engineering">Electrical Engineering</option>
              <option value="Mechanical Engineering">Mechanical Engineering</option>
              <option value="Civil Engineering">Civil Engineering</option>
              <option value="General Science">General Science</option>
            </select>

            <label for="regYear">Year / Semester</label>
            <select id="regYear">
              <option value="1st Year">1st Year (Semester 1/2)</option>
              <option value="2nd Year">2nd Year (Semester 3/4)</option>
              <option value="3rd Year">3rd Year (Semester 5/6)</option>
              <option value="4th Year">4th Year (Semester 7/8)</option>
              <option value="Postgraduate">Postgraduate</option>
            </select>
          </div>

          <label for="loginId" id="idLabel">Email or University Roll Number</label>
          <input id="loginId" placeholder="Enter roll number or email" autocomplete="username">

          <label for="pw">Password</label>
          <input id="pw" type="password" placeholder="Minimum 8 characters" autocomplete="current-password">

          <div id="strengthBox" hidden>
            <div class="strength-bar"><div class="strength-fill" id="sFill"></div></div>
            <div class="strength-hint" id="sHint">Password strength: too short</div>
          </div>

          <p class="msg" id="err" role="alert">${esc(initialMsg)}</p>

          <button id="go" style="width:100%; margin-top:16px;">Sign In</button>
        </form>
      </section>
    `);

    let mode = "login";
    const pwInput = n.querySelector("#pw");
    const sBox = n.querySelector("#strengthBox");
    const sFill = n.querySelector("#sFill");
    const sHint = n.querySelector("#sHint");

    pwInput.oninput = () => {
      if (mode !== "register") return;
      const v = pwInput.value;
      let score = 0;
      if (v.length >= 8) score++;
      if (/[A-Z]/.test(v)) score++;
      if (/[0-9]/.test(v)) score++;
      if (/[^A-Za-z0-9]/.test(v)) score++;

      if (v.length < 8) {
        sFill.style.width = "25%";
        sFill.style.backgroundColor = "var(--bad)";
        sHint.textContent = "Password strength: too short (min 8 chars required)";
      } else if (score <= 2) {
        sFill.style.width = "50%";
        sFill.style.backgroundColor = "var(--warn)";
        sHint.textContent = "Password strength: moderate (add numbers/symbols for security)";
      } else {
        sFill.style.width = "100%";
        sFill.style.backgroundColor = "var(--good)";
        sHint.textContent = "Password strength: strong";
      }
    };

    n.querySelectorAll(".tabs button").forEach((b) => {
      b.onclick = () => {
        mode = b.dataset.m;
        n.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-selected", x === b));
        n.querySelector("#regFields").hidden = mode === "login";
        sBox.hidden = mode === "login";
        n.querySelector("#idLabel").textContent = mode === "login" ? "Email or University Roll Number" : "Email Address";
        n.querySelector("#go").textContent = mode === "login" ? "Sign In" : "Register Student Account";
        n.querySelector("#err").textContent = "";
      };
    });

    const handleAuthSubmit = async (e) => {
      if (e) e.preventDefault();
      const btn = n.querySelector("#go");
      const err = n.querySelector("#err");
      btn.disabled = true;
      err.textContent = "";

      try {
        if (mode === "login") {
          const body = {
            login_id: n.querySelector("#loginId").value.trim(),
            password: n.querySelector("#pw").value,
          };
          const res = await api("/auth/login", { method: "POST", body });
          setSession(res);
          location.hash = res.role === "admin" ? "#/admin" : "#/";
        } else {
          const body = {
            name: n.querySelector("#regName").value.trim(),
            roll_no: n.querySelector("#regRoll").value.trim(),
            department: n.querySelector("#regDept").value,
            year_semester: n.querySelector("#regYear").value,
            email: n.querySelector("#loginId").value.trim(),
            password: n.querySelector("#pw").value,
          };
          const res = await api("/auth/register", { method: "POST", body });
          setSession(res);
          location.hash = "#/";
        }
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        btn.disabled = false;
      }
    };

    n.querySelector("#go").onclick = handleAuthSubmit;
    n.querySelector("#authForm").onsubmit = handleAuthSubmit;

    show(n);
  }

  // ==========================================
  // VIEW 2: STUDENT EXAM LIST
  // ==========================================
  async function examsView() {
    if (state.role === "admin") {
      location.hash = "#/admin";
      return;
    }
    const exams = await api("/exams");

    const n = el(`
      <section>
        <div class="id-card">
          <div class="id-avatar">${esc((state.name || "S")[0].toUpperCase())}</div>
          <div class="id-info">
            <div class="id-name">${esc(state.name)}</div>
            <div class="id-roll">Roll No: ${esc(state.roll_no || "Unassigned")}</div>
            <div class="id-meta">
              <span><strong>Department:</strong> ${esc(state.department || "General")}</span>
              <span><strong>Level:</strong> ${esc(state.year_semester || "1st Year")}</span>
            </div>
          </div>
          <div class="id-seal">Verified Candidate</div>
        </div>

        <h1>Examinations Schedule</h1>
        <p class="sub">Select an examination to read instructions and begin. Each paper allows exactly one submission.</p>

        <div class="panel" id="list"></div>
      </section>
    `);

    const list = n.querySelector("#list");
    if (!exams.length) {
      list.innerHTML = `<p class="m">No scheduled examinations are currently published.</p>`;
    }

    exams.forEach((e) => {
      const isCompleted = e.is_submitted === 1;
      const isPass = e.is_pass;
      const isEligible = e.is_eligible !== false;
      const targetYear = e.allowed_year || "4th Year";

      const card = el(`
        <div class="row">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="t">${esc(e.title)}</span>
              <span class="badge ${targetYear === "All" ? "neutral" : "info"}" style="font-size:11px;">🎯 Cohort: ${esc(targetYear)}</span>
            </div>
            <div class="m" style="margin-top:2px;">
              ${e.question_count} questions &bull; ${e.duration_min} minutes &bull; Pass Mark: ${e.pass_percentage}%
            </div>
            ${e.description ? `<div style="font-size:12px; color:var(--muted); margin-top:4px;">${esc(e.description)}</div>` : ""}
          </div>
          <div style="text-align:right;"></div>
        </div>
      `);

      const rightBox = card.querySelector("div:last-child");

      if (isCompleted) {
        rightBox.append(
          el(`
            <div>
              <span class="badge ${isPass ? "pass" : "fail"}">${isPass ? "PASS" : "FAIL"} (${e.score}/${e.total})</span>
              <div style="margin-top:6px;">
                <a class="btn ghost" style="font-size:12px; padding:4px 10px;" href="#/slip/${e.id}">View Result Slip</a>
              </div>
            </div>
          `)
        );
      } else if (!isEligible) {
        rightBox.append(
          el(`
            <div>
              <span class="badge fail" style="display:inline-block; margin-bottom:4px;">Ineligible (${esc(targetYear)} Only)</span>
              <div>
                <a class="btn ghost danger" style="font-size:12px; padding:4px 10px;" href="#/exam/${e.id}">Check Eligibility &rarr;</a>
              </div>
            </div>
          `)
        );
      } else {
        rightBox.append(el(`<a class="btn" href="#/exam/${e.id}">Proceed to Paper</a>`));
      }

      list.append(card);
    });

    show(n);
  }

  // ==========================================
  // VIEW 3: PRE-EXAM INSTRUCTIONS & CODE OF CONDUCT
  // ==========================================
  async function instructionsView(examId) {
    let data;
    try {
      data = await api(`/exams/${examId}`);
    } catch (e) {
      alert(e.message);
      location.hash = "#/";
      return;
    }

    if (data.attempt && data.attempt.is_submitted) {
      location.hash = `#/slip/${examId}`;
      return;
    }

    const isResuming = Boolean(data.attempt && !data.attempt.is_submitted);
    const isEligible = data.is_eligible !== false;
    const targetYear = data.allowed_year || "4th Year";

    const n = el(`
      <section>
        <div class="id-card">
          <div class="id-avatar">${esc((data.student.name || "S")[0].toUpperCase())}</div>
          <div class="id-info">
            <div class="id-name">${esc(data.student.name)}</div>
            <div class="id-roll">Roll No: ${esc(data.student.roll_no)}</div>
            <div class="id-meta">
              <span><strong>Department:</strong> ${esc(data.student.department)}</span>
              <span><strong>Year:</strong> ${esc(data.student.year_semester)}</span>
              <span><strong>Email:</strong> ${esc(data.student.email)}</span>
            </div>
          </div>
          <div class="id-seal">${isResuming ? "Session In Progress" : (isEligible ? "Candidate Verified" : "Eligibility Blocked")}</div>
        </div>

        <section class="panel">
          ${
            !isEligible
              ? `
            <div style="background:#fee2e2; border:1.5px solid #ef4444; border-radius:8px; padding:16px 20px; margin-bottom:20px; color:#991b1b;">
              <strong style="font-size:15px; display:flex; align-items:center; gap:8px;">
                <span>⛔ Role-Based Access Control (RBAC) Policy Violation</span>
              </strong>
              <p style="margin:6px 0 0; font-size:13.5px; line-height:1.5;">
                This examination is strictly restricted to <strong>${esc(targetYear)}</strong> candidates only.
                Your registered candidate record is <strong>${esc(data.student.year_semester)}</strong>.
                You do not hold the required academic privileges to attend or attempt this paper.
              </p>
            </div>
          `
              : `
            <div style="background:#ecfdf5; border:1.5px solid #10b981; border-radius:8px; padding:12px 18px; margin-bottom:20px; color:#065f46; display:flex; align-items:center; gap:10px;">
              <span style="font-size:18px;">✅</span>
              <span style="font-size:13px; font-weight:600;">Academic RBAC Cleared: Candidate enrolled in ${esc(data.student.year_semester)} meets the requirement for ${esc(targetYear)}.</span>
            </div>
          `
          }

          ${
            isResuming
              ? `
            <div style="background:var(--mark-soft); border:1.5px solid var(--mark); padding:16px 20px; border-radius:8px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong style="color:var(--mark); font-size:15px;">Active Examination Session In Progress</strong>
                <p style="margin:2px 0 0; font-size:13px; color:var(--muted);">You have an ongoing attempt. Your timer and saved answers are active on the server.</p>
              </div>
              <span class="badge pass">● Active Live</span>
            </div>
          `
              : ""
          }

          <h1>${esc(data.title)}</h1>
          <p class="sub">${data.description ? esc(data.description) : "Official University Examination Session"}</p>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px; margin-bottom:20px; background:var(--sheet); padding:14px; border-radius:6px; border:1px solid var(--line);">
            <div><span class="slip-k">Duration</span><div class="slip-v">${data.duration_min} Minutes</div></div>
            <div><span class="slip-k">Total Questions</span><div class="slip-v">${data.question_count} MCQs</div></div>
            <div><span class="slip-k">Passing Criteria</span><div class="slip-v">${data.pass_percentage}% Minimum</div></div>
            <div><span class="slip-k">Target Cohort</span><div class="slip-v">${esc(targetYear)}</div></div>
          </div>

          <h2>Mandatory Examination Code of Conduct</h2>
          <ol style="font-size:14px; color:var(--ink); padding-left:20px; line-height:1.7;">
            <li><strong>Timer Enforcement:</strong> The examination countdown is synchronized and enforced by the central university server. At expiration, the session will automatically submit.</li>
            <li><strong>Proctor Anomaly Tracking:</strong> Switching browser tabs, right-clicking, or attempting clipboard copy/paste triggers instant warnings and logs to the invigilator radar.</li>
            <li><strong>Continuous Autosave:</strong> Every choice is securely transmitted to the cloud database instantly. Refreshing resumes with your exact remaining time.</li>
            <li><strong>Academic Integrity:</strong> Any unauthorized aids or collaborative attempts will invalidate your score.</li>
          </ol>

          <div id="pledgeBox" style="margin:24px 0 16px; padding:16px; background:#fff; border:1.5px solid var(--mark); border-radius:6px; ${isResuming || !isEligible ? "display:none;" : ""}">
            <label style="display:flex; align-items:flex-start; gap:12px; cursor:pointer; font-weight:600; margin:0;">
              <input type="checkbox" id="confirmRules" style="width:20px; height:20px; margin-top:2px;" ${isResuming ? "checked" : ""}>
              <span>I confirm that the candidate identity details displayed above belong to me, and I pledge to abide by the university examination regulations without malpractice.</span>
            </label>
          </div>

          <p class="msg" id="err" role="alert"></p>

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <a class="btn ghost" href="#/">Return to Dashboard</a>
            <button id="startBtn" ${isResuming ? "" : "disabled"}>${
              !isEligible
                ? `Attendance Blocked (${esc(targetYear)} Only)`
                : isResuming
                ? "Resume Examination Paper &rarr;"
                : "Start Examination"
            }</button>
          </div>
        </section>
      </section>
    `);

    const chk = n.querySelector("#confirmRules");
    const startBtn = n.querySelector("#startBtn");
    const err = n.querySelector("#err");

    if (!isEligible) {
      startBtn.disabled = true;
      startBtn.classList.add("danger");
      startBtn.style.cursor = "not-allowed";
    } else if (chk) {
      chk.onchange = () => {
        startBtn.disabled = !chk.checked;
      };
    }

    startBtn.onclick = async () => {
      startBtn.disabled = true;
      err.textContent = "";
      try {
        const session = await api(`/exams/${examId}/start`, { method: "POST" });
        takeExamView(examId, session);
      } catch (ex) {
        err.textContent = ex.message;
        startBtn.disabled = false;
      }
    };

    show(n);
  }

  // ==========================================
  // VIEW 4: LIVE EXAMINATION PAPER
  // ==========================================
  function takeExamView(examId, examData) {
    const questions = examData.questions;
    let currentIdx = 0;
    const answersSaved = { ...examData.answers_saved };
    const markedReview = new Set(examData.marked_review || []);
    let remainingSec = Math.max(0, parseInt(examData.remaining_sec, 10) || (examData.exam?.duration_min ? examData.exam.duration_min * 60 : 600));
    let isSubmitting = false;

    state.examState = { examId, questions, answersSaved, markedReview };

    const telemetry = {
      tab_switches: examData.tab_switches || 0,
      copy_paste_attempts: examData.copy_paste_attempts || 0,
      focus_lost_seconds: examData.focus_lost_seconds || 0,
      right_click_attempts: examData.right_click_attempts || 0,
      risk_score: examData.risk_score || 0,
    };
    let blurTimestamp = null;
    let telemetrySyncTimer = null;

    const n = el(`
      <section>
        <div class="timer-bar" id="tBar">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <strong style="font-size:15px; letter-spacing:-0.01em;">${esc(examData.exam.title)}</strong>
            <span class="autosave-pill" id="autoStatus">Autosaved</span>
            <span class="proctor-pill">🛡️ Proctor Shield Active</span>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <span id="riskPill" class="badge risk-low">Anomaly Risk: ${telemetry.risk_score}%</span>
            <div class="timer-clock" id="clock" title="Remaining examination time">--:--</div>
          </div>
        </div>

        <div id="violationBanner" class="violation-banner" style="display:none;"></div>

        <div class="exam-layout">
          <div class="exam-main">
            <div class="panel" id="qContainer"></div>
          </div>

          <div class="nav-panel">
            <div style="font-weight:700; font-size:14px; margin-bottom:8px; color:var(--ink);">Question Navigator</div>
            <div id="navProgressBox"></div>

            <div class="nav-grid" id="navGrid"></div>

            <div class="legend">
              <div class="legend-item"><div class="legend-dot" style="background:var(--ink);"></div><span>Answered</span></div>
              <div class="legend-item"><div class="legend-dot" style="background:#fff; border-color:var(--line);"></div><span>Unanswered</span></div>
              <div class="legend-item"><div class="legend-dot" style="border-color:var(--warn); background:var(--warn-soft);"></div><span>Marked for Review</span></div>
            </div>

            <button id="finalSubmitBtn" class="danger" style="width:100%; margin-top:20px;">Submit Paper</button>
          </div>
        </div>
      </section>
    `);

    function showViolationNotice(msg) {
      const banner = n.querySelector("#violationBanner");
      if (banner) {
        banner.textContent = msg;
        banner.style.display = "flex";
        clearTimeout(banner._t);
        banner._t = setTimeout(() => {
          banner.style.display = "none";
        }, 4000);
      }
    }

    async function syncTelemetry() {
      if (isSubmitting) return;
      try {
        const res = await api(`/exams/${examId}/telemetry`, {
          method: "POST",
          body: {
            tab_switches: telemetry.tab_switches,
            copy_paste_attempts: telemetry.copy_paste_attempts,
            focus_lost_seconds: telemetry.focus_lost_seconds,
            right_click_attempts: telemetry.right_click_attempts,
          },
        });
        if (res && typeof res.risk_score === "number") {
          telemetry.risk_score = res.risk_score;
          const riskPill = n.querySelector("#riskPill");
          if (riskPill) {
            riskPill.textContent = `Integrity Risk: ${telemetry.risk_score}%`;
            riskPill.className = `badge risk-${res.risk_tier || "low"}`;
          }
        }
      } catch {}
    }

    function scheduleTelemetrySync(immediate = false) {
      if (immediate) {
        clearTimeout(telemetrySyncTimer);
        telemetrySyncTimer = null;
        syncTelemetry();
      } else if (!telemetrySyncTimer) {
        telemetrySyncTimer = setTimeout(() => {
          telemetrySyncTimer = null;
          syncTelemetry();
        }, 1500);
      }
    }

    // 1. Copy/Cut Interception
    const onCopyCut = (e) => {
      e.preventDefault();
      telemetry.copy_paste_attempts++;
      showViolationNotice("⚠️ Action Blocked: Copy/Cut is disabled to prevent exam leakage. Event logged on proctor radar.");
      scheduleTelemetrySync(true);
    };

    // 2. Paste Interception
    const onPaste = (e) => {
      e.preventDefault();
      telemetry.copy_paste_attempts++;
      showViolationNotice("⚠️ Action Blocked: External clipboard pasting is prohibited during examination.");
      scheduleTelemetrySync(true);
    };

    // 3. Right-Click Context Menu Interception
    const onContextMenu = (e) => {
      e.preventDefault();
      telemetry.right_click_attempts++;
      showViolationNotice("⚠️ Action Blocked: Context menu inspection is disabled during examination.");
      scheduleTelemetrySync(true);
    };

    // 4. Window Blur and Focus Tracking
    const onBlur = () => {
      if (isSubmitting) return;
      blurTimestamp = Date.now();
      telemetry.tab_switches++;
      showViolationNotice(`⚠️ Malpractice Alert: Window focus lost (#${telemetry.tab_switches}). Proctor radar notified.`);
      scheduleTelemetrySync(true);
      showTabWarningModal(telemetry.tab_switches);
    };

    const onFocus = () => {
      if (blurTimestamp && !isSubmitting) {
        const lostSec = Math.max(1, Math.round((Date.now() - blurTimestamp) / 1000));
        telemetry.focus_lost_seconds += lostSec;
        blurTimestamp = null;
        scheduleTelemetrySync(true);
      }
    };

    // 5. Visibility Change Detector
    const onVisibilityChange = () => {
      if (document.hidden && !isSubmitting) {
        if (!blurTimestamp) {
          blurTimestamp = Date.now();
          telemetry.tab_switches++;
          scheduleTelemetrySync(true);
          showTabWarningModal(telemetry.tab_switches);
        }
      } else if (!document.hidden && blurTimestamp && !isSubmitting) {
        const lostSec = Math.max(1, Math.round((Date.now() - blurTimestamp) / 1000));
        telemetry.focus_lost_seconds += lostSec;
        blurTimestamp = null;
        scheduleTelemetrySync(true);
      }
    };

    document.addEventListener("copy", onCopyCut);
    document.addEventListener("cut", onCopyCut);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    function showTabWarningModal(count) {
      const modal = el(`
        <div class="modal-alert">
          <h2>Malpractice Warning</h2>
          <p><strong>Tab or Window switch detected (#${count})</strong></p>
          <p style="font-size:13px; color:var(--muted);">
            ExamCloud has logged this event on the server with your student ID (${esc(state.roll_no)}).
            Repeated window switches will result in immediate paper cancellation.
          </p>
          <button class="danger" id="ackBtn">I Understand &amp; Return to Paper</button>
        </div>
      `);
      modal.querySelector("#ackBtn").onclick = closeModal;
      openModal(modal);
    }

    async function triggerAutosave() {
      const pill = n.querySelector("#autoStatus");
      if (pill) pill.textContent = "Saving...";
      try {
        await api(`/exams/${examId}/autosave`, {
          method: "POST",
          body: {
            answers_saved: answersSaved,
            marked_review: Array.from(markedReview),
          },
        });
        if (pill) pill.textContent = "Autosaved";
      } catch (e) {
        if (pill) pill.textContent = "Save pending";
      }
    }

    function renderQuestion() {
      const q = questions[currentIdx];
      const qContainer = n.querySelector("#qContainer");
      const isMarked = markedReview.has(q.q_id);
      const chosen = answersSaved[q.q_id];

      qContainer.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span style="font-size:13px; font-weight:700; color:var(--muted); text-transform:uppercase;">
            Question ${currentIdx + 1} of ${questions.length}
          </span>
          <button class="ghost" id="reviewBtn" style="font-size:12px; padding:4px 8px; ${isMarked ? "background:var(--warn-soft); border-color:var(--warn); color:var(--warn);" : ""}">
            ${isMarked ? "Marked for Review [X]" : "Mark for Review [ ]"}
          </button>
        </div>

        <div class="q-title">${esc(q.text)}</div>

        <div id="optsList">
          ${q.options
            .map(
              (opt) => `
            <label class="opt ${chosen === opt.origKey ? "selected" : ""}" data-key="${opt.origKey}">
              <input type="radio" name="optRadio" value="${opt.origKey}" ${chosen === opt.origKey ? "checked" : ""}>
              <span class="bubble">${opt.letter}</span>
              <span>${esc(opt.text)}</span>
            </label>
          `
            )
            .join("")}
        </div>

        <div class="q-actions">
          <button class="ghost" id="prevBtn" ${currentIdx === 0 ? "disabled" : ""}>&larr; Previous</button>
          <button id="nextBtn">${currentIdx === questions.length - 1 ? "Review &amp; Submit &rarr;" : "Next &rarr;"}</button>
        </div>
      `;

      // Option selection handler
      qContainer.querySelectorAll(".opt").forEach((optEl) => {
        optEl.onclick = (e) => {
          const radio = optEl.querySelector("input");
          if (!radio) return;
          radio.checked = true;
          answersSaved[q.q_id] = radio.value;
          qContainer.querySelectorAll(".opt").forEach((x) => x.classList.toggle("selected", x === optEl));
          updateNavigator();
          triggerAutosave();
        };
      });

      // Mark for review toggle
      const reviewBtn = qContainer.querySelector("#reviewBtn");
      if (reviewBtn) {
        reviewBtn.onclick = () => {
          if (markedReview.has(q.q_id)) markedReview.delete(q.q_id);
          else markedReview.add(q.q_id);
          renderQuestion();
          updateNavigator();
          triggerAutosave();
        };
      }

      // Previous button
      const prevBtn = qContainer.querySelector("#prevBtn");
      if (prevBtn) {
        prevBtn.onclick = () => {
          if (currentIdx > 0) {
            currentIdx--;
            renderQuestion();
            updateNavigator();
          }
        };
      }

      // Next button: on last question, it triggers finalSubmit()
      const nextBtn = qContainer.querySelector("#nextBtn");
      if (nextBtn) {
        nextBtn.onclick = () => {
          if (currentIdx < questions.length - 1) {
            currentIdx++;
            renderQuestion();
            updateNavigator();
          } else {
            finalSubmit();
          }
        };
      }
    }

    function updateNavigator() {
      const grid = n.querySelector("#navGrid");
      grid.innerHTML = "";
      const answeredCount = Object.keys(answersSaved).filter((k) => answersSaved[k]).length;
      const progressPct = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

      const progContainer = n.querySelector("#navProgressBox");
      if (progContainer) {
        progContainer.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; font-weight:700; color:var(--muted); text-transform:uppercase; margin-bottom:4px;">
            <span>Progress</span>
            <span style="color:var(--ink);">${answeredCount} / ${questions.length} Answered (${progressPct}%)</span>
          </div>
          <div class="meter-bar" style="margin-bottom:14px; height:5px;">
            <div class="meter-fill" style="width:${progressPct}%; background:var(--mark);"></div>
          </div>
        `;
      }

      questions.forEach((q, idx) => {
        const isAnswered = q.q_id in answersSaved && answersSaved[q.q_id];
        const isMarked = markedReview.has(q.q_id);
        const isCurrent = idx === currentIdx;

        const btn = el(`<button class="nav-btn">${idx + 1}</button>`);
        if (isAnswered) btn.classList.add("answered");
        if (isMarked) btn.classList.add("marked");
        if (isCurrent) btn.classList.add("current");

        btn.onclick = () => {
          currentIdx = idx;
          renderQuestion();
          updateNavigator();
        };
        grid.append(btn);
      });
    }

    async function finalSubmit() {
      if (isSubmitting) return;
      const answeredCount = Object.keys(answersSaved).filter((k) => answersSaved[k]).length;
      const totalCount = questions.length;

      const confirmModal = el(`
        <div>
          <h2>Submit Final Examination?</h2>
          <p>You have answered <strong>${answeredCount}</strong> out of <strong>${totalCount}</strong> questions.</p>
          ${
            answeredCount < totalCount
              ? `<p style="color:var(--warn); font-size:13px; font-weight:600;">⚠️ Warning: ${totalCount - answeredCount} question(s) remain unanswered!</p>`
              : ""
          }
          <p style="font-size:13px; color:var(--muted);">Once submitted, your answers will be permanently evaluated and graded by the examination authority.</p>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
            <button class="ghost" id="cancelSubmit">Keep Working</button>
            <button class="danger" id="confirmSubmit">Confirm &amp; Submit Paper</button>
          </div>
        </div>
      `);

      confirmModal.querySelector("#cancelSubmit").onclick = closeModal;
      confirmModal.querySelector("#confirmSubmit").onclick = async () => {
        closeModal();
        doSubmit();
      };
      openModal(confirmModal);
    }

    async function doSubmit() {
      if (isSubmitting) return;
      isSubmitting = true;
      clearInterval(state.timer);
      state.timer = null;
      clearTimeout(telemetrySyncTimer);
      document.removeEventListener("copy", onCopyCut);
      document.removeEventListener("cut", onCopyCut);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);

      show(
        el(`
        <section class="panel" style="text-align:center; padding:48px 24px;">
          <h1 style="color:var(--mark);">Grading Examination...</h1>
          <p class="sub" style="max-width:440px; margin:8px auto 0;">Computing score, verifying security telemetry, and compiling your provisional institutional result slip.</p>
        </section>
      `)
      );

      try {
        await api(`/exams/${examId}/submit`, {
          method: "POST",
          body: { answers: answersSaved },
        });
        location.hash = `#/slip/${examId}`;
      } catch (e) {
        alert(e.message);
        location.hash = "#/";
      }
    }

    n.querySelector("#finalSubmitBtn").onclick = finalSubmit;

    // Timer countdown implementation
    const tBar = n.querySelector("#tBar");
    const clock = n.querySelector("#clock");

    const formatTime = (totalSec) => {
      const s = Math.max(0, Math.floor(totalSec));
      const hrs = Math.floor(s / 3600);
      const mins = Math.floor((s % 3600) / 60);
      const secs = s % 60;
      if (hrs > 0) {
        return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      }
      return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    };

    const tick = () => {
      if (clock) clock.textContent = formatTime(remainingSec);

      if (remainingSec <= 120) {
        tBar.classList.add("urgent");
      } else {
        tBar.classList.remove("urgent");
      }

      if (remainingSec <= 0) {
        clearInterval(state.timer);
        state.timer = null;
        doSubmit();
        return;
      }
      remainingSec--;
    };

    // Render questions and navigator first
    renderQuestion();
    updateNavigator();

    // Mount the view into the DOM
    show(n);

    // Start timer AFTER view is mounted so show(n) does not cancel it
    clearInterval(state.timer);
    tick();
    state.timer = setInterval(tick, 1000);
  }

  // ==========================================
  // VIEW 5: OFFICIAL RESULT SLIP
  // ==========================================
  async function slipView(examId) {
    let slip;
    try {
      slip = await api(`/results/slip/${examId}`);
    } catch (e) {
      alert(e.message);
      location.hash = "#/";
      return;
    }

    const n = el(`
      <section>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <a class="btn ghost no-print" href="#/">&larr; Return to Portal</a>
          <button class="btn no-print" id="printBtn">Print Result Slip</button>
        </div>

        <div class="slip">
          <div class="slip-header">
            <div class="slip-title">ExamCloud University Examination Authority</div>
            <div class="slip-sub">Official Transcript &bull; Provisional Statement of Marks</div>
          </div>

          <div class="slip-grid">
            <div><div class="slip-k">Candidate Name</div><div class="slip-v">${esc(slip.student_name)}</div></div>
            <div><div class="slip-k">University Roll / ID</div><div class="slip-v">${esc(slip.roll_no)}</div></div>
            <div><div class="slip-k">Department</div><div class="slip-v">${esc(slip.department)}</div></div>
            <div><div class="slip-k">Year / Semester</div><div class="slip-v">${esc(slip.year_semester)}</div></div>
            <div><div class="slip-k">Examination Paper</div><div class="slip-v">${esc(slip.exam_title)}</div></div>
            <div><div class="slip-k">Date &amp; Time of Submission</div><div class="slip-v">${new Date(slip.submitted_at).toLocaleString()}</div></div>
          </div>

          <div class="slip-score-card">
            <div class="slip-k">Final Evaluated Result</div>
            <div class="slip-score-large">${slip.score} <span style="font-size:24px; color:var(--muted);">/ ${slip.total}</span></div>
            <div style="font-size:16px; margin-bottom:8px;"><strong>Score: ${slip.percentage}%</strong> (Passing Benchmark: ${slip.pass_percentage}%)</div>
            <div class="slip-status" style="color:${slip.is_pass ? "var(--good)" : "var(--bad)"};">
              [ ${slip.is_pass ? "PASSED" : "FAILED"} ]
            </div>
          </div>

          <div style="margin-top:20px; border-top:1px solid var(--line); padding:16px; background:var(--sheet); border-radius:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <div>
                <strong style="font-size:13px; text-transform:uppercase; letter-spacing:0.05em; color:var(--ink);">Institutional Integrity &amp; Cloud Proctoring Audit</strong>
                <div style="font-size:11px; color:var(--muted); margin-top:2px;">Real-time stateless anomaly telemetry certified by AWS RDS</div>
              </div>
              <span class="badge ${slip.is_flagged ? "flagged" : (slip.risk_score >= 50 ? "risk-high" : (slip.risk_score >= 20 ? "risk-mod" : "risk-low"))}">
                ${slip.is_flagged ? "FLAGGED FOR REVIEW" : `Anomaly Risk: ${slip.risk_score || 0}%`}
              </span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:12px; font-size:12px;">
              <div><div style="color:var(--muted); font-size:11px;">Tab Switches</div><strong>${slip.tab_switches || 0} event(s)</strong></div>
              <div><div style="color:var(--muted); font-size:11px;">Clipboard Blocks</div><strong>${slip.copy_paste_attempts || 0} violation(s)</strong></div>
              <div><div style="color:var(--muted); font-size:11px;">Context-Menu Blocks</div><strong>${slip.right_click_attempts || 0} attempt(s)</strong></div>
              <div><div style="color:var(--muted); font-size:11px;">Focus Lost Time</div><strong>${slip.focus_lost_seconds || 0} second(s)</strong></div>
              <div><div style="color:var(--muted); font-size:11px;">Total Exam Duration</div><strong>${Math.floor((slip.time_taken_sec || 0) / 60)}m ${(slip.time_taken_sec || 0) % 60}s</strong></div>
            </div>
          </div>

          ${
            slip.show_review && slip.questions
              ? `
            <div style="margin-top:32px; border-top:2px solid var(--line); padding-top:24px;">
              <h2 style="margin-top:0;">Detailed Answer Review</h2>
              <p class="sub">Review your answers alongside the official evaluation key.</p>
              <div id="reviewList"></div>
            </div>
          `
              : `
            <div style="margin-top:24px; font-size:13px; color:var(--muted); text-align:center;">
              <em>Correct answer key disclosure is disabled by the examination committee for this paper.</em>
            </div>
          `
          }
        </div>
      </section>
    `);

    n.querySelector("#printBtn").onclick = () => window.print();

    if (slip.show_review && slip.questions) {
      const rList = n.querySelector("#reviewList");
      slip.questions.forEach((q, idx) => {
        const item = el(`
          <div style="margin:20px 0; padding:16px; border:1px solid var(--line); border-radius:6px; background:#fafbfc;">
            <div style="font-weight:700; margin-bottom:10px;">${idx + 1}. ${esc(q.text)}</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:13px; margin-bottom:12px;">
              <div>A: ${esc(q.opt_a)}</div>
              <div>B: ${esc(q.opt_b)}</div>
              <div>C: ${esc(q.opt_c)}</div>
              <div>D: ${esc(q.opt_d)}</div>
            </div>
            <div style="font-size:13px;">
              <span>Your choice: <strong>${esc(q.student_answer || "Unanswered")}</strong></span>
              <span style="margin-left:16px;">Correct key: <strong>${esc(q.correct)}</strong></span>
              <span class="badge ${q.is_correct ? "pass" : "fail"}" style="margin-left:12px;">
                ${q.is_correct ? "Correct (+1)" : "Incorrect (0)"}
              </span>
            </div>
          </div>
        `);
        rList.append(item);
      });
    }

    show(n);
  }

  // ==========================================
  // VIEW 6: STUDENT PROFILE
  // ==========================================
  async function profileView() {
    const prof = await api("/profile");
    const n = el(`
      <section>
        <div class="id-card">
          <div class="id-avatar">${esc((prof.name || "S")[0].toUpperCase())}</div>
          <div class="id-info">
            <div class="id-name">${esc(prof.name)}</div>
            <div class="id-roll">Roll No: ${esc(prof.roll_no)}</div>
            <div class="id-meta">
              <span><strong>Department:</strong> ${esc(prof.department)}</span>
              <span><strong>Year:</strong> ${esc(prof.year_semester)}</span>
              <span><strong>Email:</strong> ${esc(prof.email)}</span>
            </div>
          </div>
          <div class="id-seal">Candidate Profile</div>
        </div>

        <h2>Examination Records &amp; Transcripts</h2>
        <div class="panel">
          ${
            prof.attempts && prof.attempts.length
              ? `
            <table>
              <thead>
                <tr>
                  <th>Paper</th>
                  <th>Score</th>
                  <th>Percentage</th>
                  <th>Result</th>
                  <th>Submitted At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${prof.attempts
                  .map(
                    (a) => `
                  <tr>
                    <td><strong>${esc(a.exam_title)}</strong></td>
                    <td>${a.score} / ${a.total}</td>
                    <td>${a.percentage}%</td>
                    <td><span class="badge ${a.is_pass ? "pass" : "fail"}">${a.is_pass ? "PASS" : "FAIL"}</span></td>
                    <td>${new Date(a.submitted_at).toLocaleDateString()}</td>
                    <td><a class="btn ghost" style="padding:3px 8px; font-size:12px;" href="#/slip/${a.exam_id || a.id}">View Slip</a></td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          `
              : `<p class="m">No examination submissions on record yet.</p>`
          }
        </div>
      </section>
    `);
    show(n);
  }

  // ==========================================
  // VIEW 7: MY RESULTS
  // ==========================================
  async function myResultsView() {
    const rows = await api("/results/me");
    const n = el(`
      <section>
        <h1>My Examination Transcripts</h1>
        <p class="sub">Complete record of your submitted assessments and formal grades.</p>
        <div class="panel">
          ${
            rows.length
              ? `
            <table>
              <thead>
                <tr>
                  <th>Paper</th>
                  <th>Score</th>
                  <th>Percentage</th>
                  <th>Status</th>
                  <th>Infractions</th>
                  <th>Date</th>
                  <th>Transcript</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (r) => `
                  <tr>
                    <td><strong>${esc(r.title)}</strong></td>
                    <td>${r.score} / ${r.total}</td>
                    <td>${r.percentage}%</td>
                    <td><span class="badge ${r.is_pass ? "pass" : "fail"}">${r.is_pass ? "PASS" : "FAIL"}</span></td>
                    <td>${r.tab_switches} tab switch(es)</td>
                    <td>${new Date(r.submitted_at).toLocaleString()}</td>
                    <td><a class="btn ghost" style="font-size:12px; padding:3px 8px;" href="#/slip/${r.exam_id}">View Slip</a></td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          `
              : `<p class="m">You have not submitted any examinations yet.</p>`
          }
        </div>
      </section>
    `);
    show(n);
  }

  // ==========================================
  // VIEW 8: ADMIN DASHBOARD & CONTROLS
  // ==========================================
  async function adminView() {
    if (state.role !== "admin") {
      location.hash = "#/";
      return;
    }

    const n = el(`
      <section>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div>
            <h1>Institutional Admin Dashboard</h1>
            <p class="sub" style="margin:0;">Examination Controller &amp; Academic Governance System</p>
          </div>
          <button class="ghost" id="createAdminBtn">+ Add Staff/Admin Account</button>
        </div>

        <div class="tabs" id="adminTabs" role="tablist">
          <button role="tab" aria-selected="true" data-tab="overview">Overview</button>
          <button role="tab" aria-selected="false" data-tab="proctoring">Proctor Radar</button>
          <button role="tab" aria-selected="false" data-tab="students">Students</button>
          <button role="tab" aria-selected="false" data-tab="results">Results</button>
          <button role="tab" aria-selected="false" data-tab="exams">Manage Exams</button>
          <button role="tab" aria-selected="false" data-tab="audit">Audit Log</button>
        </div>

        <div id="tabContent"></div>
      </section>
    `);

    // Tab switching
    n.querySelectorAll("#adminTabs button").forEach((b) => {
      b.onclick = () => {
        n.querySelectorAll("#adminTabs button").forEach((x) => x.setAttribute("aria-selected", x === b));
        loadAdminTab(b.dataset.tab);
      };
    });

    n.querySelector("#createAdminBtn").onclick = () => {
      openAddAdminModal();
    };

    async function loadAdminTab(tab) {
      const container = n.querySelector("#tabContent");
      container.innerHTML = `<p class="m">Loading data...</p>`;

      if (tab === "overview") renderOverviewTab(container);
      else if (tab === "proctoring") renderProctoringTab(container);
      else if (tab === "students") renderStudentsTab(container);
      else if (tab === "results") renderResultsTab(container);
      else if (tab === "exams") renderExamsTab(container);
      else if (tab === "audit") renderAuditTab(container);
    }

    // TAB: INTELLIGENT PROCTORING RADAR
    async function renderProctoringTab(container) {
      container.innerHTML = `
        <div class="panel">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div>
              <h2 style="margin:0;">Live Proctoring Radar</h2>
              <p class="sub" style="margin:2px 0 0;">Real-time candidate telemetry, behavioral anomaly detection &amp; risk scoring</p>
            </div>
            <button class="ghost" id="refreshRadarBtn">🔄 Refresh Radar</button>
          </div>

          <div id="radarCards" class="radar-summary-cards">
            <div class="radar-stat-card"><div class="radar-stat-k">Monitored Candidates</div><div class="radar-stat-v" id="kpiMonitored">--</div></div>
            <div class="radar-stat-card"><div class="radar-stat-k">Active In-Progress</div><div class="radar-stat-v" id="kpiActive" style="color:var(--mark);">--</div></div>
            <div class="radar-stat-card alert"><div class="radar-stat-k">High Risk (&ge;50%)</div><div class="radar-stat-v" id="kpiHighRisk">--</div></div>
            <div class="radar-stat-card alert"><div class="radar-stat-k">Flagged Candidates</div><div class="radar-stat-v" id="kpiFlagged">--</div></div>
            <div class="radar-stat-card"><div class="radar-stat-k">Mean Risk Index</div><div class="radar-stat-v" id="kpiAvgRisk">--%</div></div>
          </div>

          <div class="filter-bar">
            <select id="radarExamFilter"><option value="">All Examination Papers</option></select>
            <select id="radarRiskFilter">
              <option value="">All Candidates</option>
              <option value="high_risk">High Risk (&ge; 50%) Only</option>
              <option value="flagged">Flagged Only</option>
              <option value="active">Active In-Progress Only</option>
            </select>
            <input id="radarSearch" placeholder="Filter by candidate or roll..." style="max-width:240px;">
          </div>

          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>Roll / Candidate</th>
                  <th>Department</th>
                  <th>Paper</th>
                  <th>Status</th>
                  <th>Telemetry Breakdown</th>
                  <th>Risk Score</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="radarTbody">
                <tr><td colspan="7" style="text-align:center; color:var(--muted); padding:24px;">Scanning candidate telemetry...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      `;

      let proctorData = null;

      async function fetchRadar() {
        const examId = container.querySelector("#radarExamFilter").value;
        const filter = container.querySelector("#radarRiskFilter").value;
        const params = new URLSearchParams();
        if (examId) params.set("exam_id", examId);
        if (filter) params.set("filter", filter);

        try {
          proctorData = await api(`/admin/proctoring?${params}`);
          updateKPIs(proctorData.stats);
          renderRows();
        } catch (e) {
          container.querySelector("#radarTbody").innerHTML = `<tr><td colspan="7" style="color:var(--bad); text-align:center;">Failed to load proctoring data: ${esc(e.message)}</td></tr>`;
        }
      }

      function updateKPIs(stats) {
        if (!stats) return;
        container.querySelector("#kpiMonitored").textContent = stats.total_monitored || 0;
        container.querySelector("#kpiActive").textContent = stats.live_in_progress || 0;
        container.querySelector("#kpiHighRisk").textContent = stats.high_risk_count || 0;
        container.querySelector("#kpiFlagged").textContent = stats.flagged_count || 0;
        container.querySelector("#kpiAvgRisk").textContent = `${stats.avg_risk || 0}%`;
      }

      function renderRows() {
        const tbody = container.querySelector("#radarTbody");
        tbody.innerHTML = "";
        const search = (container.querySelector("#radarSearch").value || "").toLowerCase().trim();

        const filtered = (proctorData.attempts || []).filter((a) => {
          if (!search) return true;
          return (
            (a.student_name && a.student_name.toLowerCase().includes(search)) ||
            (a.roll_no && a.roll_no.toLowerCase().includes(search)) ||
            (a.exam_title && a.exam_title.toLowerCase().includes(search))
          );
        });

        if (filtered.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:24px;">No candidates matching criteria.</td></tr>`;
          return;
        }

        filtered.forEach((a) => {
          const risk = a.risk_score || 0;
          const tier = risk >= 50 ? "high" : risk >= 20 ? "mod" : "low";
          const row = el(`
            <tr>
              <td>
                <strong>${esc(a.student_name)}</strong>
                <div style="font-family:ui-monospace, monospace; font-size:12px; color:var(--mark); font-weight:700;">${esc(a.roll_no)}</div>
              </td>
              <td>${esc(a.department)}<div style="font-size:11px; color:var(--muted);">${esc(a.year_semester)}</div></td>
              <td><strong>${esc(a.exam_title)}</strong></td>
              <td>
                ${
                  a.is_submitted
                    ? `<span class="badge neutral">Submitted (${a.score}/${a.total})</span>`
                    : `<span class="badge pass">● Active Live</span>`
                }
                ${a.is_flagged ? `<div style="margin-top:4px;"><span class="badge flagged">FLAGGED</span></div>` : ""}
              </td>
              <td style="font-size:12px;">
                <div><strong>${a.tab_switches || 0}</strong> tab switch(es)</div>
                <div><strong>${a.copy_paste_attempts || 0}</strong> clipboard block(s)</div>
                <div><strong>${a.right_click_attempts || 0}</strong> right-click(s)</div>
                <div style="color:var(--muted);"><strong>${a.focus_lost_seconds || 0}s</strong> focus lost</div>
              </td>
              <td style="min-width:130px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                  <span class="badge risk-${tier}">Risk: ${risk}%</span>
                </div>
                <div class="meter-bar">
                  <div class="meter-fill ${tier}" style="width:${Math.min(100, Math.max(5, risk))}%;"></div>
                </div>
              </td>
              <td>
                <button class="${a.is_flagged ? "ghost" : "danger ghost"} flag-toggle-btn" style="padding:4px 10px; font-size:12px;">
                  ${a.is_flagged ? "Unflag" : "🚩 Flag"}
                </button>
              </td>
            </tr>
          `);

          row.querySelector(".flag-toggle-btn").onclick = async () => {
            const btn = row.querySelector(".flag-toggle-btn");
            btn.disabled = true;
            try {
              const res = await api(`/admin/attempts/${a.attempt_id}/flag`, {
                method: "PATCH",
                body: { is_flagged: !a.is_flagged },
              });
              a.is_flagged = res.is_flagged ? 1 : 0;
              fetchRadar();
            } catch (err) {
              alert(err.message);
              btn.disabled = false;
            }
          };

          tbody.append(row);
        });
      }

      // Populate exam dropdown
      try {
        const exams = await api("/admin/exams");
        const sel = container.querySelector("#radarExamFilter");
        exams.forEach((x) => {
          const opt = document.createElement("option");
          opt.value = x.id;
          opt.textContent = x.title;
          sel.append(opt);
        });
      } catch {}

      container.querySelector("#refreshRadarBtn").onclick = fetchRadar;
      container.querySelector("#radarExamFilter").onchange = fetchRadar;
      container.querySelector("#radarRiskFilter").onchange = fetchRadar;
      container.querySelector("#radarSearch").oninput = renderRows;

      fetchRadar();
      const poll = setInterval(() => {
        if (container.isConnected && !document.hidden) fetchRadar();
        else clearInterval(poll);
      }, 8000);
    }

    // TAB 1: OVERVIEW & PLAIN SVG CHARTS
    async function renderOverviewTab(container) {
      const d = await api("/admin/dashboard");
      container.innerHTML = "";

      const tiles = el(`
        <div class="tiles">
          <div class="tile">
            <div class="tile-k">Total Candidates</div>
            <div class="tile-v">${d.total_students}</div>
            <div class="tile-sub">Registered students</div>
          </div>
          <div class="tile-k-wrapper tile">
            <div class="tile-k">Examination Papers</div>
            <div class="tile-v">${d.total_exams}</div>
            <div class="tile-sub">Configured exams</div>
          </div>
          <div class="tile">
            <div class="tile-k">Submissions</div>
            <div class="tile-v">${d.total_submissions}</div>
            <div class="tile-sub">Graded attempts</div>
          </div>
          <div class="tile">
            <div class="tile-k">Class Average</div>
            <div class="tile-v">${d.avg_score}%</div>
            <div class="tile-sub">Overall mean score</div>
          </div>
          <div class="tile">
            <div class="tile-k">Pass Rate</div>
            <div class="tile-v" style="color:var(--good);">${d.pass_rate}%</div>
            <div class="tile-sub">Meeting benchmark</div>
          </div>
        </div>
      `);

      // SVG Chart 1: Score Distribution Histogram
      const dist = d.distribution;
      const distValues = [dist.b_0_20 || 0, dist.b_20_40 || 0, dist.b_40_60 || 0, dist.b_60_80 || 0, dist.b_80_100 || 0];
      const maxDist = Math.max(1, ...distValues);
      const labels = ["0-20%", "21-40%", "41-60%", "61-80%", "81-100%"];

      let histSvgBars = "";
      distValues.forEach((val, i) => {
        const barH = (val / maxDist) * 120;
        const x = 40 + i * 55;
        const y = 140 - barH;
        histSvgBars += `
          <rect x="${x}" y="${y}" width="40" height="${barH}" fill="var(--mark)" rx="3"/>
          <text x="${x + 20}" y="${y - 6}" font-size="11" font-weight="700" text-anchor="middle" fill="var(--ink)">${val}</text>
          <text x="${x + 20}" y="156" font-size="10" text-anchor="middle" fill="var(--muted)">${labels[i]}</text>
        `;
      });

      // SVG Chart 2: Submissions Per Exam Bar Chart
      const perExam = d.exams_summary || [];
      const maxSub = Math.max(1, ...perExam.map((e) => e.submissions));
      let examBars = "";
      perExam.slice(0, 5).forEach((e, i) => {
        const barW = (e.submissions / maxSub) * 180;
        const y = 20 + i * 28;
        examBars += `
          <text x="10" y="${y + 14}" font-size="11" fill="var(--ink)">${esc(e.title.slice(0, 16))}</text>
          <rect x="120" y="${y}" width="${barW}" height="18" fill="var(--good)" rx="3"/>
          <text x="${126 + barW}" y="${y + 14}" font-size="11" font-weight="700" fill="var(--ink)">${e.submissions}</text>
        `;
      });

      const charts = el(`
        <div class="charts-grid">
          <div class="chart-card">
            <h3>Candidate Score Distribution (Histogram)</h3>
            <svg class="chart" viewBox="0 0 320 170">
              <line x1="30" y1="140" x2="310" y2="140" stroke="var(--line)" stroke-width="1"/>
              ${histSvgBars}
            </svg>
          </div>

          <div class="chart-card">
            <h3>Submissions Per Examination Paper</h3>
            <svg class="chart" viewBox="0 0 320 170">
              ${examBars || `<text x="50" y="80" fill="var(--muted)">No examination submissions yet</text>`}
            </svg>
          </div>
        </div>
      `);

      container.append(tiles);
      container.append(charts);
    }

    // TAB 2: STUDENTS ROSTER & PROFILE MODALS
    async function renderStudentsTab(container, page = 1) {
      container.innerHTML = `
        <div class="panel">
          <div class="filter-bar">
            <input id="stuSearch" placeholder="Search roll no, name, email...">
            <select id="stuDept"><option value="">All Departments</option></select>
            <select id="stuYear"><option value="">All Years</option></select>
            <button id="stuFilterBtn" class="ghost">Apply Filter</button>
          </div>
          <div id="stuTableBox">Loading candidates...</div>
        </div>
      `;

      const searchInput = container.querySelector("#stuSearch");
      const deptSelect = container.querySelector("#stuDept");
      const yearSelect = container.querySelector("#stuYear");

      async function fetchStudents() {
        const q = new URLSearchParams({
          page,
          search: searchInput.value.trim(),
          department: deptSelect.value,
          year: yearSelect.value,
        });
        const res = await api(`/admin/students?${q}`);

        // Populate options once
        if (deptSelect.children.length === 1) {
          res.departments.forEach((d) => deptSelect.append(el(`<option value="${esc(d)}">${esc(d)}</option>`)));
        }
        if (yearSelect.children.length === 1) {
          res.years.forEach((y) => yearSelect.append(el(`<option value="${esc(y)}">${esc(y)}</option>`)));
        }

        const box = container.querySelector("#stuTableBox");
        if (!res.students.length) {
          box.innerHTML = `<p class="m">No candidates found matching criteria.</p>`;
          return;
        }

        box.innerHTML = `
          <table>
            <thead>
              <tr>
                <th>Roll No</th>
                <th>Candidate Name</th>
                <th>Department</th>
                <th>Year</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Mean %</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${res.students
                .map(
                  (s) => `
                <tr>
                  <td><strong>${esc(s.roll_no)}</strong></td>
                  <td>${esc(s.name)}<br><span style="color:var(--muted); font-size:11px;">${esc(s.email)}</span></td>
                  <td>${esc(s.department)}</td>
                  <td>${esc(s.year_semester)}</td>
                  <td><span class="badge ${s.is_active ? "good" : "bad"}">${s.is_active ? "Active" : "Deactivated"}</span></td>
                  <td>${s.attempts_count}</td>
                  <td>${s.avg_percentage ? s.avg_percentage + "%" : "--"}</td>
                  <td>
                    <button class="ghost view-stu" data-id="${s.id}" style="padding:3px 8px; font-size:12px;">View Record</button>
                  </td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
            <span class="m">Page ${res.page} of ${res.pages || 1} (${res.total} students)</span>
            <div>
              <button class="ghost" id="pPrev" ${res.page <= 1 ? "disabled" : ""}>Previous</button>
              <button class="ghost" id="pNext" ${res.page >= res.pages ? "disabled" : ""}>Next</button>
            </div>
          </div>
        `;

        box.querySelectorAll(".view-stu").forEach((b) => {
          b.onclick = () => openStudentModal(b.dataset.id);
        });

        const pPrev = box.querySelector("#pPrev");
        if (pPrev) pPrev.onclick = () => renderStudentsTab(container, page - 1);
        const pNext = box.querySelector("#pNext");
        if (pNext) pNext.onclick = () => renderStudentsTab(container, page + 1);
      }

      container.querySelector("#stuFilterBtn").onclick = () => fetchStudents();
      fetchStudents();
    }

    async function openStudentModal(studentId) {
      const s = await api(`/admin/students/${studentId}`);
      const modal = el(`
        <div>
          <div class="id-card" style="margin-bottom:16px;">
            <div class="id-avatar">${esc((s.name || "S")[0].toUpperCase())}</div>
            <div class="id-info">
              <div class="id-name">${esc(s.name)}</div>
              <div class="id-roll">Roll No: ${esc(s.roll_no)}</div>
              <div class="id-meta">
                <span>Dept: ${esc(s.department)}</span>
                <span>Year: ${esc(s.year_semester)}</span>
                <span>Email: ${esc(s.email)}</span>
              </div>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div>
              Status: <span class="badge ${s.is_active ? "good" : "bad"}">${s.is_active ? "Active" : "Deactivated"}</span>
            </div>
            <button class="${s.is_active ? "danger" : "success"}" id="toggleActiveBtn">
              ${s.is_active ? "Deactivate Student" : "Reactivate Student"}
            </button>
          </div>

          <h3>Examination Submission History</h3>
          ${
            s.attempts && s.attempts.length
              ? `
            <table>
              <thead>
                <tr>
                  <th>Exam</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Infractions</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${s.attempts
                  .map(
                    (a) => `
                  <tr>
                    <td><strong>${esc(a.title)}</strong></td>
                    <td>${a.score} / ${a.total} (${a.percentage}%)</td>
                    <td><span class="badge ${a.is_pass ? "pass" : "fail"}">${a.is_pass ? "PASS" : "FAIL"}</span></td>
                    <td>${a.tab_switches} switch(es)</td>
                    <td>${new Date(a.submitted_at).toLocaleDateString()}</td>
                    <td>
                      <button class="danger ghost reset-att" data-id="${a.attempt_id}" style="padding:2px 6px; font-size:11px;">Reset Attempt</button>
                    </td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          `
              : `<p class="m">No examination submissions on record.</p>`
          }

          <div style="text-align:right; margin-top:20px;">
            <button class="ghost" id="closeStuModal">Close</button>
          </div>
        </div>
      `);

      modal.querySelector("#toggleActiveBtn").onclick = async () => {
        await api(`/admin/students/${studentId}/status`, {
          method: "PATCH",
          body: { is_active: !s.is_active },
        });
        closeModal();
        openStudentModal(studentId);
      };

      modal.querySelectorAll(".reset-att").forEach((b) => {
        b.onclick = async () => {
          if (!confirm("Are you sure you want to reset this attempt? The student will be allowed to retake the paper.")) return;
          await api(`/admin/attempts/${b.dataset.id}/reset`, { method: "POST" });
          alert("Attempt reset successfully.");
          closeModal();
          openStudentModal(studentId);
        };
      });

      modal.querySelector("#closeStuModal").onclick = closeModal;
      openModal(modal);
    }

    // TAB 3: RESULTS WITH FILTERS & CSV EXPORT
    async function renderResultsTab(container) {
      container.innerHTML = `
        <div class="panel">
          <div class="filter-bar">
            <select id="resExam"><option value="">All Examinations</option></select>
            <select id="resDept"><option value="">All Departments</option></select>
            <select id="resStatus">
              <option value="">All Statuses</option>
              <option value="pass">Pass Only</option>
              <option value="fail">Fail Only</option>
            </select>
            <button id="resFilterBtn" class="ghost">Filter</button>
            <button id="resCsvBtn" class="btn" style="margin-left:auto;">Download CSV</button>
          </div>
          <div id="resTableBox">Loading submissions...</div>
        </div>
      `;

      const examSelect = container.querySelector("#resExam");
      const deptSelect = container.querySelector("#resDept");
      const statusSelect = container.querySelector("#resStatus");

      // Load exams for filter
      const exams = await api("/admin/exams");
      exams.forEach((e) => examSelect.append(el(`<option value="${e.id}">${esc(e.title)}</option>`)));

      async function fetchResults() {
        const q = new URLSearchParams({
          exam_id: examSelect.value,
          department: deptSelect.value,
          status: statusSelect.value,
        });
        const rows = await api(`/admin/results?${q}`);
        const box = container.querySelector("#resTableBox");

        if (!rows.length) {
          box.innerHTML = `<p class="m">No examination submissions match the filters.</p>`;
          return;
        }

        box.innerHTML = `
          <table>
            <thead>
              <tr>
                <th>Roll No</th>
                <th>Candidate Name</th>
                <th>Department</th>
                <th>Paper</th>
                <th>Score</th>
                <th>%</th>
                <th>Status</th>
                <th>Time</th>
                <th>Infractions</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                <tr>
                  <td><strong>${esc(r.roll_no)}</strong></td>
                  <td>${esc(r.name)}</td>
                  <td>${esc(r.department)}</td>
                  <td>${esc(r.exam)}</td>
                  <td>${r.score}/${r.total}</td>
                  <td>${r.percentage}%</td>
                  <td><span class="badge ${r.is_pass ? "pass" : "fail"}">${r.is_pass ? "PASS" : "FAIL"}</span></td>
                  <td>${Math.floor((r.time_taken_sec || 0) / 60)}m</td>
                  <td>${r.tab_switches}</td>
                  <td>${new Date(r.submitted_at).toLocaleDateString()}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        `;
      }

      container.querySelector("#resFilterBtn").onclick = fetchResults;

      container.querySelector("#resCsvBtn").onclick = async () => {
        const q = new URLSearchParams({ exam_id: examSelect.value, department: deptSelect.value });
        const res = await fetch(`/api/admin/results.csv?${q}`, {
          headers: { Authorization: "Bearer " + state.token },
        });
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "university_examination_results.csv";
        a.click();
      };

      fetchResults();
    }

    // TAB 4: MANAGE EXAMS (CREATE, BULK, EDIT, ANALYTICS)
    async function renderExamsTab(container) {
      const exams = await api("/admin/exams");
      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h2>Published &amp; Draft Examination Papers</h2>
          <button id="newExamBtn">+ Create New Paper</button>
        </div>

        <div class="panel">
          ${
            exams.length
              ? `
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Duration</th>
                  <th>MCQs</th>
                  <th>Pass Mark</th>
                  <th>Submissions</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${exams
                  .map(
                    (e) => `
                  <tr>
                    <td><strong>${esc(e.title)}</strong></td>
                    <td>${e.duration_min}m</td>
                    <td>${e.question_count}</td>
                    <td>${e.pass_percentage}%</td>
                    <td>${e.submission_count}</td>
                    <td><span class="badge ${e.is_published ? "pass" : "neutral"}">${e.is_published ? "Published" : "Draft"}</span></td>
                    <td style="display:flex; gap:6px;">
                      <button class="ghost exam-analytics" data-id="${e.id}" style="font-size:11px; padding:3px 6px;">Analytics</button>
                      <button class="ghost exam-edit" data-id="${e.id}" style="font-size:11px; padding:3px 6px;">Edit</button>
                      <button class="danger ghost exam-del" data-id="${e.id}" style="font-size:11px; padding:3px 6px;">Delete</button>
                    </td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          `
              : `<p class="m">No examination papers configured yet.</p>`
          }
        </div>
      `;

      container.querySelector("#newExamBtn").onclick = () => openExamEditorModal();

      container.querySelectorAll(".exam-analytics").forEach((b) => {
        b.onclick = () => openExamAnalyticsModal(b.dataset.id);
      });

      container.querySelectorAll(".exam-edit").forEach((b) => {
        b.onclick = () => openExamEditorModal(b.dataset.id);
      });

      container.querySelectorAll(".exam-del").forEach((b) => {
        b.onclick = async () => {
          if (!confirm("Are you sure you want to delete this examination paper and all related candidate submissions?")) return;
          await api(`/admin/exams/${b.dataset.id}`, { method: "DELETE" });
          renderExamsTab(container);
        };
      });
    }

    async function openExamAnalyticsModal(examId) {
      const data = await api(`/admin/exams/${examId}/analytics`);
      const m = data.metrics;
      const modal = el(`
        <div style="max-width:680px;">
          <h2>Paper Analytics: ${esc(data.exam.title)}</h2>
          <p class="sub">Item analysis, pass rate, and question-level difficulty index.</p>

          <div class="tiles" style="margin-bottom:16px;">
            <div class="tile"><div class="tile-k">Submissions</div><div class="tile-v">${m.total_submissions}</div></div>
            <div class="tile"><div class="tile-k">Mean Score</div><div class="tile-v">${m.avg_score}%</div></div>
            <div class="tile"><div class="tile-k">Highest</div><div class="tile-v">${m.highest_score}</div></div>
            <div class="tile"><div class="tile-k">Lowest</div><div class="tile-v">${m.lowest_score}</div></div>
            <div class="tile"><div class="tile-k">Pass Rate</div><div class="tile-v" style="color:var(--good);">${m.pass_rate}%</div></div>
          </div>

          <h3>Question Difficulty &amp; Choice Analysis</h3>
          <div style="max-height:300px; overflow-y:auto; border:1px solid var(--line); border-radius:6px; padding:12px;">
            ${data.question_stats
              .map(
                (q, idx) => `
              <div style="padding:10px 0; border-bottom:1px solid var(--line);">
                <div style="font-weight:700; font-size:13px;">${idx + 1}. ${esc(q.text)}</div>
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:4px;">
                  <span>Correct Key: <strong>${esc(q.correct)}</strong></span>
                  <span>Accuracy: <strong style="color:${q.accuracy_pct < 40 ? "var(--bad)" : "var(--good)"};">${q.accuracy_pct}% of students correct</strong></span>
                </div>
                <div style="display:flex; gap:16px; font-size:11px; color:var(--muted); margin-top:2px;">
                  <span>A: ${q.options.A.count}</span>
                  <span>B: ${q.options.B.count}</span>
                  <span>C: ${q.options.C.count}</span>
                  <span>D: ${q.options.D.count}</span>
                </div>
              </div>
            `
              )
              .join("")}
          </div>

          <div style="text-align:right; margin-top:20px;">
            <button class="ghost" id="closeAnaBtn">Close</button>
          </div>
        </div>
      `);
      modal.querySelector("#closeAnaBtn").onclick = closeModal;
      openModal(modal);
    }

    async function openExamEditorModal(examId) {
      let ex = { title: "", description: "", duration_min: 10, pass_percentage: 40, allowed_year: "4th Year", is_published: 1, show_review: 1 };
      let existingQs = [];

      if (examId) {
        ex = await api(`/exams/${examId}`);
        existingQs = await api(`/admin/exams/${examId}/questions`);
      }

      const bulkTemplate = existingQs.length
        ? existingQs.map((q) => `${q.text} | ${q.opt_a} | ${q.opt_b} | ${q.opt_c} | ${q.opt_d} | ${q.correct}`).join("\n")
        : "";

      const currentYear = ex.allowed_year || "4th Year";

      const modal = el(`
        <div style="max-width:640px;">
          <h2>${examId ? "Edit Examination Paper" : "Create New Examination Paper"}</h2>
          <label for="exTitle">Paper Title</label>
          <input id="exTitle" value="${esc(ex.title)}" placeholder="e.g. Distributed Cloud Computing (Midterm)">

          <label for="exDesc">Paper Description</label>
          <input id="exDesc" value="${esc(ex.description || "")}" placeholder="e.g. Unit 1 to 4 Comprehensive Assessment">

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label for="exDur">Duration (Minutes)</label>
              <input id="exDur" type="number" min="1" value="${ex.duration_min}">
            </div>
            <div>
              <label for="exPass">Passing Criteria (%)</label>
              <input id="exPass" type="number" min="1" max="100" value="${ex.pass_percentage}">
            </div>
          </div>

          <label for="exYear">Target Student Cohort (RBAC Restriction)</label>
          <select id="exYear">
            <option value="4th Year" ${currentYear === "4th Year" ? "selected" : ""}>4th Year (Restricted - Final Year Students Only)</option>
            <option value="3rd Year" ${currentYear === "3rd Year" ? "selected" : ""}>3rd Year (Restricted - 3rd Year Only)</option>
            <option value="2nd Year" ${currentYear === "2nd Year" ? "selected" : ""}>2nd Year (Restricted - 2nd Year Only)</option>
            <option value="1st Year" ${currentYear === "1st Year" ? "selected" : ""}>1st Year (Restricted - 1st Year Only)</option>
            <option value="All" ${currentYear === "All" ? "selected" : ""}>All Years (Open to all academic levels)</option>
          </select>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px;">
            <label style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" id="exPub" ${ex.is_published ? "checked" : ""}>
              <span>Published for Students</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" id="exRev" ${ex.show_review ? "checked" : ""}>
              <span>Allow Answer Review</span>
            </label>
          </div>

          <label for="exBulk">Questions (Question | Option A | Option B | Option C | Option D | Correct Letter)</label>
          <textarea id="exBulk" placeholder="Which service model provides VMs? | SaaS | PaaS | IaaS | FaaS | C">${esc(bulkTemplate)}</textarea>

          <p class="msg" id="exErr" role="alert"></p>

          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
            <button class="ghost" id="cancelExBtn">Cancel</button>
            <button id="saveExBtn">Save Examination Paper</button>
          </div>
        </div>
      `);

      modal.querySelector("#cancelExBtn").onclick = closeModal;

      modal.querySelector("#saveExBtn").onclick = async () => {
        const err = modal.querySelector("#exErr");
        err.textContent = "";

        const questions = modal
          .querySelector("#exBulk")
          .value.split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => {
            const p = l.split("|").map((x) => x.trim());
            return {
              text: p[0],
              options: p.slice(1, 5),
              correct: (p[5] || "").toUpperCase(),
            };
          });

        if (!modal.querySelector("#exTitle").value.trim()) {
          err.textContent = "Please enter an examination title.";
          return;
        }

        if (!questions.length) {
          err.textContent = "Please provide at least one valid question.";
          return;
        }

        const body = {
          title: modal.querySelector("#exTitle").value.trim(),
          description: modal.querySelector("#exDesc").value.trim(),
          duration_min: parseInt(modal.querySelector("#exDur").value, 10),
          pass_percentage: parseInt(modal.querySelector("#exPass").value, 10),
          allowed_year: modal.querySelector("#exYear").value,
          is_published: modal.querySelector("#exPub").checked ? 1 : 0,
          show_review: modal.querySelector("#exRev").checked ? 1 : 0,
          questions,
        };

        try {
          if (examId) {
            await api(`/admin/exams/${examId}`, { method: "PUT", body });
          } else {
            await api("/admin/exams", { method: "POST", body });
          }
          closeModal();
          loadAdminTab("exams");
        } catch (ex) {
          err.textContent = ex.message;
        }
      };

      openModal(modal);
    }

    // TAB 5: AUDIT LOGS
    async function renderAuditTab(container) {
      const logs = await api("/admin/audit-logs");
      container.innerHTML = `
        <div class="panel">
          <h2>Institutional Security Audit Log</h2>
          <p class="sub">Immutable record of logins, exam attempts, security infractions, and administrator activities.</p>

          ${
            logs.length
              ? `
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event Action</th>
                  <th>Candidate / User</th>
                  <th>Details</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                ${logs
                  .map(
                    (l) => `
                  <tr>
                    <td style="white-space:nowrap;">${new Date(l.created_at).toLocaleString()}</td>
                    <td><span class="badge neutral">${esc(l.action)}</span></td>
                    <td>${esc(l.user_name || "Unauthenticated")}${l.roll_no ? ` (${esc(l.roll_no)})` : ""}</td>
                    <td>${esc(l.details || "--")}</td>
                    <td style="font-family:ui-monospace, monospace; font-size:11px;">${esc(l.ip || "--")}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          `
              : `<p class="m">No audit logs recorded yet.</p>`
          }
        </div>
      `;
    }

    function openAddAdminModal() {
      const modal = el(`
        <div>
          <h2>Create Staff / Administrator Account</h2>
          <label for="admName">Full Name</label>
          <input id="admName" placeholder="Dr. Sarah Jenkins">

          <label for="admEmail">Email Address</label>
          <input id="admEmail" placeholder="sarah.jenkins@university.edu">

          <label for="admRole">Account Role</label>
          <select id="admRole">
            <option value="admin">Administrator / Examination Controller</option>
            <option value="student">Student Candidate</option>
          </select>

          <label for="admPw">Temporary Password</label>
          <input id="admPw" type="password" placeholder="Minimum 8 characters">

          <p class="msg" id="admErr" role="alert"></p>

          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
            <button class="ghost" id="cancelAdm">Cancel</button>
            <button id="saveAdm">Create Account</button>
          </div>
        </div>
      `);

      modal.querySelector("#cancelAdm").onclick = closeModal;
      modal.querySelector("#saveAdm").onclick = async () => {
        const err = modal.querySelector("#admErr");
        err.textContent = "";
        try {
          await api("/admin/users", {
            method: "POST",
            body: {
              name: modal.querySelector("#admName").value.trim(),
              email: modal.querySelector("#admEmail").value.trim(),
              role: modal.querySelector("#admRole").value,
              password: modal.querySelector("#admPw").value,
            },
          });
          alert("Account created successfully.");
          closeModal();
        } catch (ex) {
          err.textContent = ex.message;
        }
      };
      openModal(modal);
    }

    loadAdminTab("overview");
    show(n);
  }

  // ==========================================
  // ROUTER
  // ==========================================
  async function route() {
    clearInterval(state.timer);
    state.timer = null;
    const raw = location.hash || "#/";
    const h = raw.split("?")[0];

    // Auth guard
    if (!state.token && h !== "#/login") {
      location.hash = "#/login";
      return;
    }
    if (state.token && h === "#/login") {
      location.hash = state.role === "admin" ? "#/admin" : "#/";
      return;
    }

    // Role guard: students cannot access #/admin
    if (state.role !== "admin" && h.startsWith("#/admin")) {
      location.hash = "#/";
      return;
    }

    try {
      if (h === "#/login") return loginView();
      if (h === "#/profile") return await profileView();
      if (h === "#/results") return await myResultsView();
      if (h.startsWith("#/slip/")) return await slipView(h.split("/")[2]);
      if (h.startsWith("#/exam/")) return await instructionsView(h.split("/")[2]);
      if (h.startsWith("#/admin")) return await adminView();
      return await examsView();
    } catch (e) {
      show(
        el(`
        <section class="panel">
          <h1>Unable to display page</h1>
          <p class="sub">${esc(e.message)}</p>
          <a class="btn" href="#/">Back to home</a>
        </section>
      `)
      );
    }
  }

  window.addEventListener("hashchange", route);
  route();

  // Load balancer node indicator in footer
  fetch("/api/info")
    .then((r) => r.json())
    .then((i) => {
      const s = document.getElementById("served");
      if (s) s.textContent = `${i.institution} • Served by ${i.host}`;
    })
    .catch(() => {});
})();
