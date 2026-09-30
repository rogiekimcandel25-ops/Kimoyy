const C = window.CONFIG;
const db = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
const STATUSES = ['Active','Pending Submission','For Verification','Compliant','With Deficiency','Probationary','For Renewal','Renewed','Disqualified'];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const range = () => [Math.min(C.GWA_BEST, C.GWA_WORST), Math.max(C.GWA_BEST, C.GWA_WORST)];
let me = null, programs = [];

function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = err ? 'err' : '';
  t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 4000);
}
const fail = (e) => { console.error(e); toast(e.message || String(e), true); };

/* ---------- Compliance rule (documented in README) ---------- */
function evaluate(sub, prog) {
  const reasons = [];
  const gwaOk = C.LOWER_IS_BETTER ? sub.gwa <= prog.required_gwa : sub.gwa >= prog.required_gwa;
  if (!gwaOk) reasons.push(`GWA ${sub.gwa} does not meet required ${prog.required_gwa}`);
  if (sub.units_enrolled < prog.min_units) reasons.push(`Units ${sub.units_enrolled} below minimum ${prog.min_units}`);
  if (!prog.allow_failing_grade && sub.failed_subjects > 0) reasons.push(`${sub.failed_subjects} failed subject(s) not allowed`);
  if (sub.incomplete_subjects > 0) reasons.push(`${sub.incomplete_subjects} incomplete subject(s) unresolved`);
  return { result: reasons.length ? 'With Deficiency' : 'Compliant', notes: reasons.join('; ') || 'All requirements met' };
}

/* ---------- Auth ---------- */
async function boot() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return showLogin();
  const { data, error } = await db.from('profiles').select('*').eq('id', session.user.id).single();
  if (error) { showLogin(); return fail(error); }
  me = data;
  if (!['admin', 'staff'].includes(me.role)) {
    await db.auth.signOut(); showLogin();
    return toast('Your account has no staff access yet. Ask an admin to change your role.', true);
  }
  $('#login').classList.add('hide'); $('#appShell').classList.remove('hide');
  $('#who').textContent = `${me.full_name || 'User'} (${me.role})`;
  await loadPrograms(); show('dashboard');
}
function showLogin() { $('#appShell').classList.add('hide'); $('#login').classList.remove('hide'); }

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { error } = await db.auth.signInWithPassword({ email: $('#email').value, password: $('#password').value });
  if (error) return fail(error); boot();
});
$('#signup').addEventListener('click', async () => {
  const { error } = await db.auth.signUp({ email: $('#email').value, password: $('#password').value });
  error ? fail(error) : toast('Account created. An admin must grant staff access, then sign in.');
});
$('#logout').addEventListener('click', async () => { await db.auth.signOut(); me = null; showLogin(); });
$('#nav').addEventListener('click', (e) => e.target.dataset.v && show(e.target.dataset.v));

async function loadPrograms() {
  const { data, error } = await db.from('scholarship_programs').select('*').order('program_name');
  if (error) return fail(error); programs = data;
}
const progOptions = (sel, activeOnly) => programs.filter(p => !activeOnly || p.active)
  .map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.program_name)}</option>`).join('');

function show(v) {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  ({ dashboard, scholars, programs: programsView, submissions })[v]().catch(fail);
}

/* ---------- Dashboard ---------- */
async function count(table, col, val) {
  let q = db.from(table).select('*', { count: 'exact', head: true });
  if (col) q = q.eq(col, val);
  const { count: n, error } = await q; if (error) throw error; return n;
}
async function dashboard() {
  const [total, pending, verified, ok, bad] = await Promise.all([
    count('scholars'), count('grade_submissions', 'submission_status', 'Pending'),
    count('grade_submissions', 'submission_status', 'Verified'),
    count('scholars', 'status', 'Compliant'), count('scholars', 'status', 'With Deficiency')]);
  $('#view').innerHTML = `<div class="stats">
    <div class="stat"><b>${total}</b><span>Total scholars</span></div>
    <div class="stat"><b>${pending}</b><span>Pending grade submissions</span></div>
    <div class="stat"><b>${verified}</b><span>Verified submissions</span></div>
    <div class="stat ok"><b>${ok}</b><span>Compliant scholars</span></div>
    <div class="stat bad"><b>${bad}</b><span>With deficiency</span></div></div>`;
}

/* ---------- Scholars ---------- */
async function scholars(editing) {
  await loadPrograms();
  const f = editing || {};
  $('#view').innerHTML = `
  <section class="panel"><h2>${f.id ? 'Edit scholar' : 'Register scholar'}</h2>
   <form id="sf" class="grid">
    <label>Student ID<input name="student_id" value="${esc(f.student_id)}"></label>
    <label>Full name<input name="full_name" value="${esc(f.full_name)}" required></label>
    <label>Degree program<input name="degree_program" value="${esc(f.degree_program)}"></label>
    <label>Year level<input type="number" name="year_level" min="1" max="8" value="${f.year_level ?? 1}"></label>
    <label>Scholarship program<select name="scholarship_id"><option value="">Select…</option>${progOptions(f.scholarship_id, true)}</select></label>
    <label>Status<select name="status">${STATUSES.map(s => `<option ${s === (f.status || 'Active') ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <button class="btn" type="submit">${f.id ? 'Save changes' : 'Register scholar'}</button>
    ${f.id ? '<button class="btn alt" type="button" id="cancel">Cancel</button>' : ''}
   </form></section>
  <section class="panel"><h2>Scholars</h2>
   <div class="bar"><input id="q" placeholder="Search by ID or name" size="26">
    <select id="fp"><option value="">All programs</option>${progOptions()}</select>
    <select id="fs"><option value="">All statuses</option>${STATUSES.map(s => `<option>${s}</option>`).join('')}</select></div>
   <div class="tablewrap" id="list"></div></section>`;
  $('#sf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.student_id = d.student_id.trim();
    if (!d.student_id) return toast('Student ID cannot be blank.', true);
    if (!d.scholarship_id) return toast('Select a scholarship program.', true);
    d.year_level = +d.year_level;
    const { error } = f.id ? await db.from('scholars').update(d).eq('id', f.id) : await db.from('scholars').insert(d);
    if (error) return fail(error.code === '23505' ? { message: 'Student ID already exists.' } : error);
    toast('Scholar saved.'); scholars();
  });
  $('#cancel')?.addEventListener('click', () => scholars());
  ['q', 'fp', 'fs'].forEach(id => $('#' + id).addEventListener('input', listScholars));
  listScholars();
}
async function listScholars() {
  let q = db.from('scholars').select('*, scholarship_programs(program_name)').order('full_name');
  const s = $('#q').value.trim().replace(/[,()%]/g, ' ');
  if (s) q = q.or(`student_id.ilike.%${s}%,full_name.ilike.%${s}%`);
  if ($('#fp').value) q = q.eq('scholarship_id', $('#fp').value);
  if ($('#fs').value) q = q.eq('status', $('#fs').value);
  const { data, error } = await q; if (error) return fail(error);
  $('#list').innerHTML = data.length ? `<table><tr><th>Student ID</th><th>Name</th><th>Degree</th><th>Year</th><th>Program</th><th>Status</th><th></th></tr>` +
    data.map(r => `<tr><td>${esc(r.student_id)}</td><td>${esc(r.full_name)}</td><td>${esc(r.degree_program)}</td><td>${r.year_level ?? ''}</td>
    <td>${esc(r.scholarship_programs?.program_name)}</td><td><span class="tag ${r.status === 'Compliant' ? 'ok' : r.status === 'With Deficiency' ? 'bad' : ''}">${esc(r.status)}</span></td>
    <td><button class="btn alt sm" data-id="${r.id}">Edit</button></td></tr>`).join('') + '</table>'
    : '<p class="empty">No scholars match. Register one above.</p>';
  $('#list').querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => { scholars(data.find(r => r.id === b.dataset.id)); scrollTo(0, 0); }));
}

/* ---------- Programs ---------- */
async function programsView() {
  await loadPrograms();
  $('#view').innerHTML = `
  <section class="panel"><h2>Add scholarship program</h2>
   <form id="pf" class="grid">
    <label>Program name<input name="program_name" required></label>
    <label>Required GWA (${C.LOWER_IS_BETTER ? 'maximum allowed' : 'minimum required'})<input type="number" step="0.01" name="required_gwa" required></label>
    <label>Minimum units<input type="number" name="min_units" min="0" value="12" required></label>
    <label>Failing grades<select name="allow_failing_grade"><option value="false">Not allowed</option><option value="true">Allowed</option></select></label>
    <button class="btn" type="submit">Add program</button></form></section>
  <section class="panel"><h2>Programs and requirements</h2><div class="tablewrap"><table>
   <tr><th>Program</th><th>Required GWA</th><th>Min units</th><th>Failing grade</th><th>Status</th><th></th></tr>
   ${programs.map(p => `<tr><td>${esc(p.program_name)}</td><td>${p.required_gwa}</td><td>${p.min_units}</td><td>${p.allow_failing_grade ? 'Allowed' : 'Not allowed'}</td>
   <td>${p.active ? 'Active' : 'Inactive'}</td><td><button class="btn alt sm" data-id="${p.id}">${p.active ? 'Deactivate' : 'Activate'}</button></td></tr>`).join('')}
  </table></div></section>`;
  $('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.required_gwa = +d.required_gwa; d.min_units = +d.min_units; d.allow_failing_grade = d.allow_failing_grade === 'true';
    const [lo, hi] = range();
    if (d.required_gwa < lo || d.required_gwa > hi) return toast(`Required GWA must be between ${lo} and ${hi}.`, true);
    const { error } = await db.from('scholarship_programs').insert(d);
    if (error) return fail(error); toast('Program added.'); programsView();
  });
  $('#view').querySelectorAll('button[data-id]').forEach(b => b.addEventListener('click', async () => {
    const p = programs.find(x => x.id === b.dataset.id);
    const { error } = await db.from('scholarship_programs').update({ active: !p.active }).eq('id', p.id);
    if (error) return fail(error); programsView();
  }));
}

/* ---------- Grade submissions ---------- */
async function submissions() {
  await loadPrograms();
  const { data: sch, error: e1 } = await db.from('scholars').select('id, student_id, full_name').order('full_name');
  if (e1) return fail(e1);
  $('#view').innerHTML = `
  <section class="panel"><h2>Submit semester grades</h2>
   <form id="gf" class="grid">
    <label>Scholar<select name="scholar_id"><option value="">Select…</option>${sch.map(s => `<option value="${s.id}">${esc(s.student_id)} – ${esc(s.full_name)}</option>`).join('')}</select></label>
    <label>Academic year<input name="academic_year" placeholder="2025-2026" pattern="\\d{4}-\\d{4}" required></label>
    <label>Semester<select name="semester"><option>1st</option><option>2nd</option><option>Summer</option></select></label>
    <label>GWA<input type="number" step="0.01" name="gwa" required></label>
    <label>Units enrolled<input type="number" name="units_enrolled" min="0" required></label>
    <label>Failed subjects<input type="number" name="failed_subjects" min="0" value="0" required></label>
    <label>Incomplete subjects<input type="number" name="incomplete_subjects" min="0" value="0" required></label>
    <button class="btn" type="submit">Submit grades</button></form></section>
  <section class="panel"><h2>Submissions</h2>
   <div class="bar"><select id="fst"><option value="">All statuses</option><option>Pending</option><option>Verified</option></select></div>
   <div class="tablewrap" id="slist"></div></section>`;
  $('#gf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    ['gwa', 'units_enrolled', 'failed_subjects', 'incomplete_subjects'].forEach(k => d[k] = +d[k]);
    const [lo, hi] = range();
    if (!d.scholar_id) return toast('Select a scholar.', true);
    if (d.gwa < lo || d.gwa > hi) return toast(`GWA must be between ${lo} and ${hi}.`, true);
    if ([d.units_enrolled, d.failed_subjects, d.incomplete_subjects].some(n => n < 0)) return toast('Counts cannot be negative.', true);
    const { error } = await db.from('grade_submissions').insert({ ...d, submission_status: 'Pending' });
    if (error) return fail(error.code === '23505' ? { message: 'A submission for this scholar, year and semester already exists.' } : error);
    await db.from('scholars').update({ status: 'For Verification' }).eq('id', d.scholar_id);
    toast('Submitted. Awaiting verification.'); submissions();
  });
  $('#fst').addEventListener('input', listSubs); listSubs();
}
async function listSubs() {
  let q = db.from('grade_submissions').select('*, scholars(student_id, full_name, scholarship_id)').order('submitted_at', { ascending: false });
  if ($('#fst').value) q = q.eq('submission_status', $('#fst').value);
  const { data, error } = await q; if (error) return fail(error);
  $('#slist').innerHTML = data.length ? `<table><tr><th>Student</th><th>Term</th><th>GWA</th><th>Units</th><th>Failed</th><th>INC</th><th>Status</th><th>Evaluation</th><th></th></tr>` +
    data.map(r => `<tr><td>${esc(r.scholars?.student_id)} ${esc(r.scholars?.full_name)}</td><td>${esc(r.academic_year)} ${esc(r.semester)}</td>
    <td>${r.gwa}</td><td>${r.units_enrolled}</td><td>${r.failed_subjects}</td><td>${r.incomplete_subjects}</td><td>${r.submission_status}</td>
    <td>${r.evaluation ? `<span class="tag ${r.evaluation === 'Compliant' ? 'ok' : 'bad'}" title="${esc(r.evaluation_notes)}">${r.evaluation}</span>` : '—'}</td>
    <td>${r.submission_status === 'Pending' ? `<button class="btn sm" data-id="${r.id}">Verify</button>` : ''}</td></tr>`).join('') + '</table>'
    : '<p class="empty">No submissions yet.</p>';
  $('#slist').querySelectorAll('button[data-id]').forEach(b => b.addEventListener('click', () => verify(data.find(r => r.id === b.dataset.id))));
}
async function verify(sub) {
  if (!['admin', 'staff'].includes(me.role)) return toast('Only staff can verify.', true);
  const prog = programs.find(p => p.id === sub.scholars.scholarship_id);
  if (!prog) return toast('Scholar has no scholarship program.', true);
  const ev = evaluate(sub, prog);
  const { data, error } = await db.from('grade_submissions').update({
    submission_status: 'Verified', verified_by: me.id, verified_at: new Date().toISOString(),
    evaluation: ev.result, evaluation_notes: ev.notes
  }).eq('id', sub.id).eq('submission_status', 'Pending').select();      // BR-09: no double verification
  if (error) return fail(error);
  if (!data.length) return toast('Already verified.', true);
  await db.from('scholars').update({ status: ev.result }).eq('id', sub.scholar_id);
  toast(`Verified: ${ev.result}. ${ev.notes}`); listSubs();
}

boot();
