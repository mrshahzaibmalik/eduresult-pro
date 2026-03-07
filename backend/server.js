/**
 * EduResult Pro — Backend Server
 * Node.js + Express + JSON file database
 * Zero native compilation — works on ALL Windows/Mac/Linux WITHOUT Visual Studio
 */

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const jwt          = require('jsonwebtoken');
const bcrypt       = require('bcryptjs');
const path         = require('path');
const fs           = require('fs');

const PORT       = process.env.PORT       || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'eduresult_super_secret_2024_CHANGE_ME';
const NODE_ENV   = process.env.NODE_ENV   || 'development';
const DATA_DIR   = process.env.DATA_DIR   || path.join(__dirname, 'data');
const DB_FILE    = path.join(DATA_DIR, 'eduresult.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── Pure-JS JSON Database ────────────────────────────────────────────────────
class JsonDB {
  constructor(filePath) {
    this.filePath = filePath;
    this._data = null;
    this._saveTimer = null;
    this._load();
  }
  _emptySchema() {
    return {
      meta: { version: 1 },
      users: [], settings: [], students: [], subjects: [],
      marks: [], monthlyMarks: [], monthlyAttendance: [], monthlyMeta: [],
      studentPerf: [], extraFieldDefs: [], extraFieldVals: [], perfCatDefs: [],
      auditLog: [], _idCounters: {}
    };
  }
  _load() {
    try {
      if (fs.existsSync(this.filePath))
        this._data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch(e) { console.warn('DB load error:', e.message); }
    if (!this._data) this._data = this._emptySchema();
    const schema = this._emptySchema();
    for (const k of Object.keys(schema))
      if (this._data[k] === undefined) this._data[k] = schema[k];
  }
  save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        const tmp = this.filePath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this._data, null, 2), 'utf8');
        fs.renameSync(tmp, this.filePath);
      } catch(e) { console.error('DB save error:', e.message); }
    }, 200);
  }
  saveSync() {
    clearTimeout(this._saveTimer);
    try {
      const tmp = this.filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this._data, null, 2), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch(e) { console.error('DB save error:', e.message); }
  }
  nextId(table) {
    if (!this._data._idCounters[table]) this._data._idCounters[table] = 0;
    return ++this._data._idCounters[table];
  }
  insert(table, row) {
    row.id = this.nextId(table);
    this._data[table].push(row);
    this.save();
    return row;
  }
  update(table, id, updates) {
    const idx = this._data[table].findIndex(r => r.id === id);
    if (idx === -1) return false;
    this._data[table][idx] = { ...this._data[table][idx], ...updates };
    this.save(); return true;
  }
  delete(table, id) {
    const before = this._data[table].length;
    this._data[table] = this._data[table].filter(r => r.id !== id);
    this.save(); return this._data[table].length < before;
  }
  findOne(table, fn) { return this._data[table].find(fn) || null; }
  findAll(table, fn) { return fn ? this._data[table].filter(fn) : [...this._data[table]]; }
  upsert(table, matchFn, data) {
    const idx = this._data[table].findIndex(matchFn);
    if (idx !== -1) {
      this._data[table][idx] = { ...this._data[table][idx], ...data };
      this.save(); return this._data[table][idx];
    }
    return this.insert(table, data);
  }
}

const db = new JsonDB(DB_FILE);

// Seed default accounts on first run
if (db._data.users.length === 0) {
  const admin   = db.insert('users', { username:'admin',   password: bcrypt.hashSync('admin123',10),   role:'admin',   name:'Administrator', createdAt: new Date().toISOString() });
  const teacher = db.insert('users', { username:'teacher', password: bcrypt.hashSync('teacher123',10), role:'teacher', name:'Class Teacher',  createdAt: new Date().toISOString() });
  db.insert('settings', { userId:admin.id,   school:'',class:'',section:'',session:'',teacher:'',schoolLogo:null,passMarks:33 });
  db.insert('settings', { userId:teacher.id, school:'',class:'',section:'',session:'',teacher:'',schoolLogo:null,passMarks:33 });
  ['English','Urdu','Mathematics','Science','Social Studies','Islamiyat','Computer'].forEach((name,i) => {
    db.insert('subjects', { userId:admin.id, term:'mid',     name, maxMarks:100, sortOrder:i });
    db.insert('subjects', { userId:admin.id, term:'final',   name, maxMarks:100, sortOrder:i });
    db.insert('subjects', { userId:admin.id, term:'monthly', name, maxMarks:25,  sortOrder:i });
  });
  [['Behaviour','behaviour'],['Punctuality','punctuality'],['Participation','participation'],['Handwriting','handwriting']].forEach(([label,catKey],i) => {
    db.insert('perfCatDefs', { userId:admin.id, label, catKey, sortOrder:i });
  });
  db.saveSync();
  console.log('Default accounts: admin/admin123  teacher/teacher123');
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use(helmet({ contentSecurityPolicy:false, crossOriginEmbedderPolicy:false }));
app.use(cors({ origin:'*', credentials:true }));
app.use(express.json({ limit:'20mb' }));
app.use(express.urlencoded({ extended:true, limit:'20mb' }));
app.use('/api', rateLimit({ windowMs:15*60*1000, max:500 }));

const frontendPath = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(frontendPath)) app.use(express.static(frontendPath));

// ─── Auth middleware ──────────────────────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error:'No token' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { res.status(401).json({ error:'Invalid or expired token' }); }
}
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error:'Admin only' });
  next();
}
function audit(uid, action, details='') {
  db.insert('auditLog', { userId:uid, action, details, createdAt: new Date().toISOString() });
}

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/login', rateLimit({ windowMs:15*60*1000, max:20, message:{ error:'Too many attempts' }}), (req, res) => {
  const { username, password } = req.body;
  if (!username||!password) return res.status(400).json({ error:'Username and password required' });
  const user = db.findOne('users', u => u.username === username.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error:'Invalid username or password' });
  const token = jwt.sign({ id:user.id, username:user.username, role:user.role, name:user.name }, JWT_SECRET, { expiresIn:'7d' });
  audit(user.id, 'LOGIN');
  res.json({ token, user:{ id:user.id, username:user.username, role:user.role, name:user.name }});
});

app.post('/api/auth/change-password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword||!newPassword) return res.status(400).json({ error:'Both passwords required' });
  if (newPassword.length < 6) return res.status(400).json({ error:'Min 6 characters' });
  const user = db.findOne('users', u => u.id === req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(401).json({ error:'Current password wrong' });
  db.update('users', req.user.id, { password: bcrypt.hashSync(newPassword,10) });
  res.json({ message:'Password changed' });
});

app.get('/api/auth/me', auth, (req, res) => {
  const u = db.findOne('users', u => u.id === req.user.id);
  if (!u) return res.status(404).json({ error:'Not found' });
  res.json({ id:u.id, username:u.username, role:u.role, name:u.name });
});

// ─── Settings ─────────────────────────────────────────────────────────────────
app.get('/api/settings', auth, (req, res) => {
  res.json(db.findOne('settings', s => s.userId===req.user.id) || {});
});
app.put('/api/settings', auth, (req, res) => {
  const { school, class:cls, section, session, teacher, school_logo, pass_marks } = req.body;
  db.upsert('settings', s => s.userId===req.user.id,
    { userId:req.user.id, school:school||'', class:cls||'', section:section||'',
      session:session||'', teacher:teacher||'', schoolLogo:school_logo||null, passMarks:pass_marks||33 });
  res.json({ message:'Saved' });
});

// ─── Students ─────────────────────────────────────────────────────────────────
app.get('/api/students', auth, (req, res) => {
  const students = db.findAll('students', s => s.userId===req.user.id)
    .sort((a,b) => (a.sortOrder||0)-(b.sortOrder||0) || a.id-b.id);
  const result = students.map(s => {
    const mids = db.findAll('subjects', x => x.userId===req.user.id && x.term==='mid').sort((a,b)=>a.sortOrder-b.sortOrder);
    const fins = db.findAll('subjects', x => x.userId===req.user.id && x.term==='final').sort((a,b)=>a.sortOrder-b.sortOrder);
    return {
      ...s,
      mid:   mids.map(su => { const m=db.findOne('marks',m=>m.studentId===s.id&&m.subjectId===su.id); return m?m.marks:0; }),
      fin:   fins.map(su => { const m=db.findOne('marks',m=>m.studentId===s.id&&m.subjectId===su.id); return m?m.marks:0; }),
      perf:  Object.fromEntries(db.findAll('studentPerf', p=>p.studentId===s.id).map(p=>[p.catKey,p.value])),
      extra: Object.fromEntries(db.findAll('extraFieldVals', e=>e.studentId===s.id).map(e=>[e.fieldKey,e.value])),
    };
  });
  res.json(result);
});
app.post('/api/students', auth, adminOnly, (req, res) => {
  const { roll,name,photo,excellent,improve,comments,perf,extra } = req.body;
  if (!name) return res.status(400).json({ error:'Name required' });
  const s = db.insert('students', { userId:req.user.id, roll:roll||'', name:name.trim(), photo:photo||null, excellent:excellent||'', improve:improve||'', comments:comments||'', midPresent:0, finPresent:0, midTwd:null, finTwd:null, sortOrder:0, createdAt:new Date().toISOString() });
  _savePerf(s.id, perf); _saveExtra(s.id, extra);
  audit(req.user.id,'ADD_STUDENT',name);
  res.status(201).json({ id:s.id });
});
app.put('/api/students/:id', auth, adminOnly, (req, res) => {
  const sid = parseInt(req.params.id);
  if (!db.findOne('students', s=>s.id===sid&&s.userId===req.user.id)) return res.status(404).json({ error:'Not found' });
  const { roll,name,photo,excellent,improve,comments,mid_present,fin_present,mid_twd,fin_twd,perf,extra } = req.body;
  db.update('students', sid, { roll:roll||'',name,photo:photo||null,excellent:excellent||'',improve:improve||'',comments:comments||'',midPresent:mid_present||0,finPresent:fin_present||0,midTwd:mid_twd||null,finTwd:fin_twd||null });
  _savePerf(sid,perf); _saveExtra(sid,extra);
  res.json({ message:'Updated' });
});
app.delete('/api/students/:id', auth, adminOnly, (req, res) => {
  const sid = parseInt(req.params.id);
  const s = db.findOne('students', s=>s.id===sid&&s.userId===req.user.id);
  if (!s) return res.status(404).json({ error:'Not found' });
  db.delete('students', sid);
  ['marks','monthlyMarks','monthlyAttendance','studentPerf','extraFieldVals'].forEach(t => {
    db._data[t] = db._data[t].filter(r => r.studentId !== sid);
  });
  db.save(); audit(req.user.id,'DELETE_STUDENT',s.name);
  res.json({ message:'Deleted' });
});
function _savePerf(sid, perf) {
  if (!perf||typeof perf!=='object') return;
  Object.entries(perf).forEach(([k,v]) => db.upsert('studentPerf', p=>p.studentId===sid&&p.catKey===k, { studentId:sid, catKey:k, value:v }));
}
function _saveExtra(sid, extra) {
  if (!extra||typeof extra!=='object') return;
  Object.entries(extra).forEach(([k,v]) => db.upsert('extraFieldVals', e=>e.studentId===sid&&e.fieldKey===k, { studentId:sid, fieldKey:k, value:v||'' }));
}

// ─── Subjects ─────────────────────────────────────────────────────────────────
app.get('/api/subjects/:term', auth, (req, res) => {
  const { term } = req.params;
  if (!['mid','final','monthly'].includes(term)) return res.status(400).json({ error:'Invalid term' });
  res.json(db.findAll('subjects', s=>s.userId===req.user.id&&s.term===term).sort((a,b)=>a.sortOrder-b.sortOrder));
});
app.post('/api/subjects/:term', auth, adminOnly, (req, res) => {
  const { term } = req.params; const { name, max_marks } = req.body;
  if (!name) return res.status(400).json({ error:'Name required' });
  const maxOrd = db.findAll('subjects', s=>s.userId===req.user.id&&s.term===term).length;
  const s = db.insert('subjects', { userId:req.user.id, term, name:name.trim(), maxMarks:max_marks||50, sortOrder:maxOrd });
  res.status(201).json({ id:s.id });
});
app.put('/api/subjects/bulk/:term', auth, adminOnly, (req, res) => {
  const { term } = req.params; const { subjects } = req.body;
  if (!Array.isArray(subjects)) return res.status(400).json({ error:'Array required' });
  db._data.subjects = db._data.subjects.filter(s=>!(s.userId===req.user.id&&s.term===term));
  subjects.forEach((s,i) => db.insert('subjects', { userId:req.user.id, term, name:s.name, maxMarks:s.max_marks||s.max||50, sortOrder:i }));
  db.save(); res.json({ message:'Updated' });
});
app.put('/api/subjects/:id', auth, adminOnly, (req, res) => {
  const id = parseInt(req.params.id);
  const ex = db.findOne('subjects', s=>s.id===id&&s.userId===req.user.id);
  if (!ex) return res.status(404).json({ error:'Not found' });
  const { name, max_marks, sort_order } = req.body;
  db.update('subjects', id, { name:name||ex.name, maxMarks:max_marks??ex.maxMarks, sortOrder:sort_order??ex.sortOrder });
  res.json({ message:'Updated' });
});
app.delete('/api/subjects/:id', auth, adminOnly, (req, res) => {
  const id = parseInt(req.params.id);
  if (!db.findOne('subjects', s=>s.id===id&&s.userId===req.user.id)) return res.status(404).json({ error:'Not found' });
  db.delete('subjects', id); res.json({ message:'Deleted' });
});

// ─── Marks ────────────────────────────────────────────────────────────────────
app.get('/api/marks/:term', auth, (req, res) => {
  const myStudIds = db.findAll('students', s=>s.userId===req.user.id).map(s=>s.id);
  const mySubIds  = db.findAll('subjects',  s=>s.userId===req.user.id&&s.term===req.params.term).map(s=>s.id);
  res.json(db.findAll('marks', m=>myStudIds.includes(m.studentId)&&mySubIds.includes(m.subjectId)));
});
app.put('/api/marks', auth, (req, res) => {
  const { student_id, subject_id, marks } = req.body;
  if (!db.findOne('students', s=>s.id===student_id&&s.userId===req.user.id)) return res.status(403).json({ error:'Access denied' });
  db.upsert('marks', m=>m.studentId===student_id&&m.subjectId===subject_id, { studentId:student_id, subjectId:subject_id, marks:marks??0 });
  res.json({ message:'Saved' });
});
app.post('/api/marks/bulk', auth, (req, res) => {
  const { marks } = req.body;
  if (!Array.isArray(marks)) return res.status(400).json({ error:'Array required' });
  marks.forEach(m => db.upsert('marks', r=>r.studentId===m.student_id&&r.subjectId===m.subject_id, { studentId:m.student_id, subjectId:m.subject_id, marks:m.marks??0 }));
  db.save(); res.json({ message:`${marks.length} marks saved` });
});

// ─── Monthly ──────────────────────────────────────────────────────────────────
app.get('/api/monthly/:month', auth, (req, res) => {
  const { month } = req.params;
  const myStudIds = db.findAll('students', s=>s.userId===req.user.id).map(s=>s.id);
  res.json({
    meta:       db.findOne('monthlyMeta', m=>m.userId===req.user.id&&m.month===month) || {},
    marks:      db.findAll('monthlyMarks',      m=>myStudIds.includes(m.studentId)&&m.month===month),
    attendance: db.findAll('monthlyAttendance', m=>myStudIds.includes(m.studentId)&&m.month===month),
  });
});
app.put('/api/monthly/:month/mark', auth, (req, res) => {
  const { month } = req.params; const { student_id, subject_id, marks } = req.body;
  if (!db.findOne('students', s=>s.id===student_id&&s.userId===req.user.id)) return res.status(403).json({ error:'Access denied' });
  db.upsert('monthlyMarks', m=>m.studentId===student_id&&m.subjectId===subject_id&&m.month===month, { studentId:student_id, subjectId:subject_id, month, marks:marks??0 });
  res.json({ message:'Saved' });
});
app.put('/api/monthly/:month/attendance', auth, (req, res) => {
  const { month } = req.params; const { student_id, present, twd } = req.body;
  if (!db.findOne('students', s=>s.id===student_id&&s.userId===req.user.id)) return res.status(403).json({ error:'Access denied' });
  db.upsert('monthlyAttendance', m=>m.studentId===student_id&&m.month===month, { studentId:student_id, month, present:present??0, twd:twd??26 });
  res.json({ message:'Saved' });
});
app.put('/api/monthly/:month/meta', auth, adminOnly, (req, res) => {
  const { month } = req.params; const { max_marks, twd } = req.body;
  db.upsert('monthlyMeta', m=>m.userId===req.user.id&&m.month===month, { userId:req.user.id, month, maxMarks:max_marks||25, twd:twd||26 });
  res.json({ message:'Saved' });
});

// ─── Extra fields ─────────────────────────────────────────────────────────────
app.get('/api/extra-fields', auth, (req, res) => res.json(db.findAll('extraFieldDefs', e=>e.userId===req.user.id)));
app.post('/api/extra-fields', auth, adminOnly, (req, res) => {
  const { label, field_key, type } = req.body;
  if (!label||!field_key) return res.status(400).json({ error:'label and field_key required' });
  const r = db.insert('extraFieldDefs', { userId:req.user.id, label, fieldKey:field_key, type:type||'text', sortOrder:0 });
  res.status(201).json({ id:r.id });
});
app.delete('/api/extra-fields/:id', auth, adminOnly, (req, res) => {
  db._data.extraFieldDefs = db._data.extraFieldDefs.filter(e=>!(e.id===parseInt(req.params.id)&&e.userId===req.user.id));
  db.save(); res.json({ message:'Deleted' });
});

// ─── Perf cats ────────────────────────────────────────────────────────────────
app.get('/api/perf-cats', auth, (req, res) => res.json(db.findAll('perfCatDefs', p=>p.userId===req.user.id)));
app.post('/api/perf-cats', auth, adminOnly, (req, res) => {
  const { label, cat_key } = req.body;
  if (!label||!cat_key) return res.status(400).json({ error:'label and cat_key required' });
  const r = db.insert('perfCatDefs', { userId:req.user.id, label, catKey:cat_key, sortOrder:0 });
  res.status(201).json({ id:r.id });
});
app.delete('/api/perf-cats/:id', auth, adminOnly, (req, res) => {
  db._data.perfCatDefs = db._data.perfCatDefs.filter(p=>!(p.id===parseInt(req.params.id)&&p.userId===req.user.id));
  db.save(); res.json({ message:'Deleted' });
});

// ─── Users ────────────────────────────────────────────────────────────────────
app.get('/api/users', auth, adminOnly, (req, res) => res.json(db.findAll('users').map(u=>({ id:u.id, username:u.username, role:u.role, name:u.name }))));
app.post('/api/users', auth, adminOnly, (req, res) => {
  const { username, password, role, name } = req.body;
  if (!username||!password) return res.status(400).json({ error:'Username and password required' });
  if (!['admin','teacher'].includes(role)) return res.status(400).json({ error:'Invalid role' });
  if (db.findOne('users', u=>u.username===username.toLowerCase())) return res.status(409).json({ error:'Username taken' });
  const u = db.insert('users', { username:username.toLowerCase(), password:bcrypt.hashSync(password,10), role, name:name||username, createdAt:new Date().toISOString() });
  db.insert('settings', { userId:u.id, school:'',class:'',section:'',session:'',teacher:'',schoolLogo:null,passMarks:33 });
  res.status(201).json({ id:u.id });
});
app.delete('/api/users/:id', auth, adminOnly, (req, res) => {
  const uid = parseInt(req.params.id);
  if (uid===req.user.id) return res.status(400).json({ error:'Cannot delete yourself' });
  db.delete('users', uid); res.json({ message:'Deleted' });
});

// ─── Backup ───────────────────────────────────────────────────────────────────
app.get('/api/backup', auth, adminOnly, (req, res) => {
  const uid = req.user.id;
  const myStudIds = db.findAll('students', s=>s.userId===uid).map(s=>s.id);
  res.setHeader('Content-Disposition', `attachment; filename="eduresult-backup-${Date.now()}.json"`);
  res.json({
    exportedAt:   new Date().toISOString(),
    settings:     db.findOne('settings', s=>s.userId===uid),
    students:     db.findAll('students', s=>s.userId===uid),
    subjects:     db.findAll('subjects', s=>s.userId===uid),
    marks:        db.findAll('marks', m=>myStudIds.includes(m.studentId)),
    monthlyMarks: db.findAll('monthlyMarks', m=>myStudIds.includes(m.studentId)),
    monthlyAtt:   db.findAll('monthlyAttendance', m=>myStudIds.includes(m.studentId)),
    monthlyMeta:  db.findAll('monthlyMeta', m=>m.userId===uid),
    perf:         db.findAll('studentPerf', p=>myStudIds.includes(p.studentId)),
    extraDefs:    db.findAll('extraFieldDefs', e=>e.userId===uid),
    extraVals:    db.findAll('extraFieldVals', e=>myStudIds.includes(e.studentId)),
    perfCats:     db.findAll('perfCatDefs', p=>p.userId===uid),
  });
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
app.get('/api/dashboard', auth, (req, res) => {
  const uid  = req.user.id;
  const s    = db.findOne('settings', x=>x.userId===uid) || {};
  const pass = s.passMarks || 33;
  const studs = db.findAll('students', x=>x.userId===uid);
  const fins  = db.findAll('subjects', x=>x.userId===uid&&x.term==='final');
  let passed=0, failed=0;
  studs.forEach(st => {
    if (!fins.length) return;
    const ok = fins.every(su => { const m=db.findOne('marks',m=>m.studentId===st.id&&m.subjectId===su.id); return m&&su.maxMarks>0&&(m.marks/su.maxMarks*100)>=pass; });
    if (ok) passed++; else failed++;
  });
  res.json({ total:studs.length, passed, failed, subjectCount:fins.length, passMarks:pass });
});

// ─── Audit ────────────────────────────────────────────────────────────────────
app.get('/api/audit', auth, adminOnly, (req, res) => {
  res.json(db.findAll('auditLog').slice(-200).reverse()
    .map(l=>({ ...l, username: db.findOne('users',u=>u.id===l.userId)?.username||'unknown' })));
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status:'ok', time:new Date().toISOString(), students:db._data.students.length }));

// ─── SPA fallback ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  const f = path.join(frontendPath, 'index.html');
  fs.existsSync(f) ? res.sendFile(f) : res.json({ message:'EduResult Pro API', health:'/api/health' });
});

app.use((err, req, res, _next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: NODE_ENV==='production' ? 'Internal error' : err.message });
});

app.listen(PORT, () => {
  console.log(`\n  EduResult Pro`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Login: admin / admin123\n`);
});

module.exports = app;
