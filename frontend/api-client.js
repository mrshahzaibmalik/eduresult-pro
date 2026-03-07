/**
 * EduResult Pro — API Client
 * Drop this <script> tag at the bottom of index.html (before </body>)
 * It intercepts saveDB / loadDB and syncs with the backend.
 *
 * Usage in index.html:
 *   <script src="api-client.js"></script>
 */

(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  // In production set window.API_BASE or it defaults to same origin
  const API_BASE = window.API_BASE || '';

  // ── Token storage ─────────────────────────────────────────────────────────
  let _token = sessionStorage.getItem('edu_token') || localStorage.getItem('edu_token') || null;

  function setToken(t) {
    _token = t;
    if (t) {
      localStorage.setItem('edu_token', t);
      sessionStorage.setItem('edu_token', t);
    } else {
      localStorage.removeItem('edu_token');
      sessionStorage.removeItem('edu_token');
    }
  }

  // ── Core fetch wrapper ─────────────────────────────────────────────────────
  async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (_token) headers['Authorization'] = 'Bearer ' + _token;
    const resp = await fetch(API_BASE + '/api' + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (resp.status === 401) {
      setToken(null);
      window.location.reload();
      return;
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    return data;
  }

  // ── Public API client ─────────────────────────────────────────────────────
  window.ApiClient = {
    // Auth
    async login(username, password) {
      const d = await api('POST', '/auth/login', { username, password });
      setToken(d.token);
      return d;
    },
    logout() { setToken(null); },
    isLoggedIn() { return !!_token; },
    getToken() { return _token; },

    // Settings
    getSettings:  () => api('GET',  '/settings'),
    saveSettings: (s)  => api('PUT',  '/settings', s),

    // Students
    getStudents:   ()      => api('GET',    '/students'),
    addStudent:    (s)     => api('POST',   '/students', s),
    updateStudent: (id, s) => api('PUT',    '/students/' + id, s),
    deleteStudent: (id)    => api('DELETE', '/students/' + id),

    // Subjects
    getSubjects:      (term) => api('GET',  '/subjects/' + term),
    addSubject:       (term, s) => api('POST', '/subjects/' + term, s),
    updateSubject:    (id, s)   => api('PUT',  '/subjects/' + id, s),
    deleteSubject:    (id)      => api('DELETE','/subjects/' + id),
    bulkSaveSubjects: (term, arr) => api('PUT', '/subjects/bulk/' + term, { subjects: arr }),

    // Marks
    saveMark:    (data) => api('PUT',  '/marks', data),
    bulkMarks:   (arr)  => api('POST', '/marks/bulk', { marks: arr }),

    // Monthly
    getMonthly:         (month) => api('GET', '/monthly/' + month),
    saveMonthlyMark:    (month, d) => api('PUT', '/monthly/' + month + '/mark', d),
    saveMonthlyAtt:     (month, d) => api('PUT', '/monthly/' + month + '/attendance', d),
    saveMonthlyMeta:    (month, d) => api('PUT', '/monthly/' + month + '/meta', d),

    // Backup
    downloadBackup: async () => {
      const resp = await fetch(API_BASE + '/api/backup', { headers: { Authorization: 'Bearer ' + _token } });
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'eduresult-backup-' + Date.now() + '.json'; a.click();
      URL.revokeObjectURL(url);
    },

    // Dashboard stats
    getDashboard: () => api('GET', '/dashboard'),

    // Health
    health: () => api('GET', '/health'),
  };

  // ── Auto-sync: override saveDB / loadDB ───────────────────────────────────
  // The original frontend stores everything in localStorage under key 'eduDB'.
  // We keep that working AND additionally push to the server.

  const _origSaveDB = window.saveDB;
  const _origLoadDB = window.loadDB;

  let _syncTimeout = null;

  function schedulePush() {
    clearTimeout(_syncTimeout);
    _syncTimeout = setTimeout(pushDBToServer, 800);
  }

  async function pushDBToServer() {
    if (!window.ApiClient.isLoggedIn() || !window.DB) return;
    try {
      const db = window.DB;

      // Save settings
      await ApiClient.saveSettings({
        school:      db.school      || '',
        class:       db.class       || '',
        section:     db.section     || '',
        session:     db.session     || '',
        teacher:     db.teacher     || '',
        school_logo: db.schoolLogo  || null,
        pass_marks:  db.passMarks   || 33,
      });

      // Save subjects for all terms
      for (const term of ['mid', 'final', 'monthly']) {
        const arr = term === 'mid' ? db.midSubjects : term === 'final' ? db.finSubjects : db.monthlySubjects;
        if (arr && arr.length) {
          await ApiClient.bulkSaveSubjects(term, arr.map((s, i) => ({ name: s.name, max_marks: s.max, sort_order: i })));
        }
      }

    } catch (e) {
      console.warn('[API] Sync error (non-fatal):', e.message);
    }
  }

  // Patch saveDB
  window.saveDB = function () {
    if (typeof _origSaveDB === 'function') _origSaveDB();
    schedulePush();
  };

  // ── Login flow integration ─────────────────────────────────────────────────
  // Override the existing doLogin() so it hits the real server
  window._origDoLogin = window.doLogin;

  window.doLogin = async function () {
    const uEl = document.getElementById('login-user');
    const pEl = document.getElementById('login-pass');
    const errEl = document.getElementById('login-err');
    if (!uEl || !pEl) return;

    const username = uEl.value.trim();
    const password = pEl.value;
    if (!username || !password) {
      if (errEl) { errEl.textContent = 'Enter username and password'; errEl.style.display = 'block'; }
      return;
    }

    try {
      const d = await ApiClient.login(username, password);
      // Set role so the existing app logic works
      window.currentRole = d.user.role;
      window.currentUser = d.user;

      // Hide login screen
      const ls = document.getElementById('login-screen');
      const ap = document.getElementById('app');
      if (ls) ls.style.display = 'none';
      if (ap) { ap.classList.add('visible'); }

      // Load server data into DB
      await loadFromServer();

      if (typeof renderDashboard === 'function')  renderDashboard();
      if (typeof updateBadge     === 'function')  updateBadge();

    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Login failed'; errEl.style.display = 'block'; }
    }
  };

  async function loadFromServer() {
    if (!ApiClient.isLoggedIn()) return;
    try {
      const [settings, students, midSubjs, finSubjs, monthSubjs] = await Promise.all([
        ApiClient.getSettings(),
        ApiClient.getStudents(),
        ApiClient.getSubjects('mid'),
        ApiClient.getSubjects('final'),
        ApiClient.getSubjects('monthly'),
      ]);

      if (!window.DB) window.DB = {};
      const db = window.DB;

      // Apply settings
      db.school      = settings.school   || '';
      db.class       = settings.class    || '';
      db.section     = settings.section  || '';
      db.session     = settings.session  || '';
      db.teacher     = settings.teacher  || '';
      db.schoolLogo  = settings.school_logo || null;
      db.passMarks   = settings.pass_marks  || 33;

      // Apply subjects
      db.midSubjects     = midSubjs.map(s  => ({ name: s.name, max: s.max_marks, _id: s.id }));
      db.finSubjects     = finSubjs.map(s  => ({ name: s.name, max: s.max_marks, _id: s.id }));
      db.monthlySubjects = monthSubjs.map(s => ({ name: s.name, max: s.max_marks, _id: s.id }));

      // Apply students (map backend format → frontend DB format)
      db.students = students.map(s => ({
        _id:        s.id,
        roll:       s.roll       || '',
        name:       s.name,
        photo:      s.photo      || null,
        excellent:  s.excellent  || '',
        improve:    s.improve    || '',
        comments:   s.comments   || '',
        midPresent: s.mid_present || 0,
        finPresent: s.fin_present || 0,
        midTWD:     s.mid_twd    || null,
        finTWD:     s.fin_twd    || null,
        mid:        s.mid        || db.midSubjects.map(() => 0),
        fin:        s.fin        || db.finSubjects.map(() => 0),
        perf:       s.perf       || {},
        extra:      s.extra      || {},
      }));

      // Persist to localStorage so offline works
      if (typeof saveDB === 'function') {
        const orig = window.saveDB;
        window.saveDB = function () {
          try { localStorage.setItem('eduDB', JSON.stringify(db)); } catch {}
        };
        saveDB();
        window.saveDB = orig;
      }

      console.log('[API] Loaded from server:', db.students.length, 'students');
    } catch (e) {
      console.warn('[API] Load error:', e.message, '— falling back to localStorage');
    }
  }

  // ── Auto-login if token exists ─────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', async () => {
    if (!ApiClient.isLoggedIn()) return;

    // Verify token is still valid
    try {
      await ApiClient.health();
      // Token valid — simulate a "session restore"
      await loadFromServer();
      const ls = document.getElementById('login-screen');
      const ap = document.getElementById('app');
      if (ls) ls.style.display = 'none';
      if (ap) ap.classList.add('visible');
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof updateBadge     === 'function') updateBadge();
      if (typeof showPage        === 'function') showPage('dashboard', null);
    } catch {
      setToken(null); // expired
    }
  });

  // ── Patch student save to also call API ───────────────────────────────────
  const _origSaveStudentModal = window.saveStudentModal;
  window.saveStudentModal = async function () {
    // Let original run first (updates window.DB)
    if (typeof _origSaveStudentModal === 'function') _origSaveStudentModal();

    // Then push to server
    await pushDBToServer();
  };

  console.log('[EduResult Pro] API client loaded. Server:', API_BASE || 'same-origin');
})();
