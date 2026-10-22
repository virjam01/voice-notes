/* Voice Notes (beta) — web app.
 * Sign in with Google -> the engine checks the invite list.
 * Each user's cases, templates, settings and examples live in "Voice Notes data", a spreadsheet in their own Drive
 * (scope drive.file: the app can only see files it created). Audio and notes go to the engine, which holds the API keys.
 * Nothing clinical is stored in the browser.
 */
(() => {
  'use strict';

  const CFG = window.VOICE_NOTES_CONFIG || {};
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const DATA_NAME = 'Voice Notes data';
  const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
  const DRIVE = 'https://www.googleapis.com/drive/v3/files';
  const CASE_HEADERS = ['id', 'created', 'caseTag', 'noteType', 'templateId', 'templateName', 'side', 'transcript', 'note',
    'flags', 'defaultsUsed', 'corrections', 'logbook', 'status', 'updated', 'personalRef', 'sentAt'];
  const CASE_LAST_COL = 'Q';
  const JSON_FIELDS = ['flags', 'defaultsUsed', 'corrections', 'logbook'];
  const TEMPLATE_HEADERS = ['id', 'name', 'noteType', 'sections', 'defaults', 'checks', 'active'];
  const SETTING_HEADERS = ['key', 'value', 'notes'];
  const EXAMPLE_HEADERS = ['id', 'created', 'noteType', 'templateId', 'templateName', 'note'];
  const EXAMPLES_KEPT = 30;
  const MAX_REC_SECONDS = 600;
  const LOGBOOK_HEADERS = ['', 'AOA App', 'Date', 'Patient Name', 'Patient ID', 'Hospital', 'Consultant', 'Colleague', 'Side',
    'Procedure', 'Body Region', 'Competency', 'Role', 'Notes / Reflections', 'Image Folder Link'];

  const DEFAULT_SETTINGS = [
    ['OP_NOTE_FORMAT', 'Procedure: ####\nIndication: ####\n\nTTO, ##Anaesthetic##, ##Position##, ##Abx##, ##TXA##\n[Complete procedure description, all in shorthand, including closure]\n\nImplants: #### [list every implant here, even if already mentioned above]\n\nPostop instructions:\n####\n\n##Your name##\n##Your role##',
      'House format for EVERY operation note. ## marks a field to fill; [brackets] are instructions to Claude.'],
    ['CLINIC_NOTE_FORMAT', 'Orthopaedic Clinic – ##Your surname## for ##Consultant## (##Present/Reg only##)\n\n##Patient demographics##\n##Presenting issue##\n\nHistory:\n####\n\nExamination:\n####\n\nImaging:\n####\n\nImpression:\n####\n\nPlan:\n####\n\n##Your name##\n##Your role##',
      'House format for EVERY clinic note. ##Patient demographics## is never filled by the app.'],
    ['ADMISSION_NOTE_FORMAT', 'Orthopaedic Admission \u2013 ##Consultant##\n\n##Patient demographics##\n\nPC: ####\nHPC:\n####\n\nPMHx:\n####\nMeds: ####\nAllergies: ####\nSHx / function:\n####\n\nO/E:\n####\n\nImaging:\n####\n\nImpression:\n####\n\nPlan:\n####\n\n##Your name##\n##Your role##',
      'House format for EVERY admission note. ##Patient demographics## is never filled by the app.'],
    ['NOTE_RULES', 'Written in shorthand.\nHashtags (##like this##) mark fields that need editing or filling.\nLeave the hashtags in place where a field is not completed.\nLearn from previous notes (the saved examples).', 'Style rules for every note, one per line.'],
    ['VOCABULARY', 'Exeter, Trinity, Corail, Pinnacle, Triathlon, Attune, Persona, Gamma3, TFNA, DHS, LCP, syndesmosis, Weber, Garden, posterior approach, medial parapatellar, tranexamic acid, cefazolin, Vicryl, Monocryl',
      'Implant systems, approaches and terms. Helps both transcription and note writing. Comma separated.'],
    ['STYLE_EXAMPLES', '', 'Optional: paste notes with ALL identifiers removed. Saved examples (Examples tab) are used automatically.'],
    ['EXAMPLES_PER_NOTE', '3', 'How many saved examples Claude studies each time.'],
    ['RETENTION_DAYS', '14', 'Cases older than this are deleted when you open the app.'],
    ['TEMPLATES_REVIEWED', 'no', 'Set to yes once you have replaced the starter defaults in the Templates tab with your own wording.'],
    ['LOGBOOK_REF_COLUMN', 'Patient ID', 'Logbook column that receives your personal reference. Edit the Logbook tab row 1 to match your own logbook columns.'],
    ['SIGN_OFF_NAME', '', 'Set on first use.'],
    ['SIGN_OFF_ROLE', '', 'Set on first use.'],
    ['STARTER_SET', '2', 'Used by the app to add new starter templates once. Leave as is.'],
  ];
  const FORMAT_KEYS = { op: 'OP_NOTE_FORMAT', clinic: 'CLINIC_NOTE_FORMAT', admission: 'ADMISSION_NOTE_FORMAT' };
  const TYPE_LABEL = { op: 'op', clinic: 'clinic', admission: 'admission' };
  const FREE_ID = '__free';
  const FREE_SECTIONS = 'Free note: no fixed template and no required items. Organise the dictation under short headings that suit its content, in a sensible clinical order. Use only headings the dictation gives content for.';
  const normType = t => { t = String(t || '').toLowerCase(); return t === 'clinic' || t === 'admission' ? t : 'op'; };

  const $ = s => document.querySelector(s);
  const state = {
    idToken: null, idExp: 0, email: '', boot: null,
    driveToken: null, driveExp: 0, tokenClient: null, driveWaiters: [], idWaiters: [],
    ssId: null, casesSheetId: null, templates: [], allTemplates: [], tplType: 'op', tplEditing: null, settings: {}, settingRows: [], examples: [], cases: [], logbookHeaders: LOGBOOK_HEADERS.slice(),
    type: 'op', image: null, current: null, inbox: [], inboxCurrent: null, started: false,
  };

  /* ================================================================ small helpers */

  function el(tag, attrs, text) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (k === 'class') e.className = v; else e.setAttribute(k, v); });
    if (text != null) e.textContent = text;
    return e;
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function busy(on, text) {
    $('#busyText').textContent = text || 'Working…';
    $('#busy').classList.toggle('hidden', !on);
  }
  function showError(err) {
    busy(false);
    const box = $('#errorBox');
    box.textContent = 'Something went wrong: ' + String((err && err.message) ? err.message : err).replace(/^Error:\s*/, '');
    box.classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function clearError() { $('#errorBox').classList.add('hidden'); }
  function ask(message, okLabel) {
    return new Promise(resolve => {
      $('#modalText').textContent = message;
      $('#modalOk').textContent = okLabel || 'Continue';
      $('#modal').classList.remove('hidden');
      const done = answer => {
        $('#modal').classList.add('hidden');
        $('#modalOk').onclick = null;
        $('#modalCancel').onclick = null;
        resolve(answer);
      };
      $('#modalOk').onclick = () => done(true);
      $('#modalCancel').onclick = () => done(false);
    });
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const enc = encodeURIComponent;
  const isOwner = () => !!(state.boot && state.boot.isOwner);
  const ownerFirst = () => ((state.boot && state.boot.ownerName) || 'James').replace(/^Dr\.?\s+/i, '').split(/\s+/)[0];

  /* ================================================================ sign-in */

  window.__gsiReady = () => initGsi();

  function initGsi() {
    if (!window.google || !google.accounts) return;
    if (!CFG.GOOGLE_CLIENT_ID || !CFG.ENGINE_URL) {
      $('#signinMsg').textContent = 'Voice Notes is still being set up.';
      return;
    }
    google.accounts.id.initialize({
      client_id: CFG.GOOGLE_CLIENT_ID, callback: onCredential, auto_select: true,
      cancel_on_tap_outside: false, itp_support: true, use_fedcm_for_prompt: true,
    });
    google.accounts.id.renderButton($('#gsiBtn'), { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with' });
    google.accounts.id.prompt();
  }

  function jwtPayload(t) {
    try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return {}; }
  }

  function onCredential(resp) {
    const p = jwtPayload(resp.credential);
    const email = String(p.email || '').toLowerCase();
    if (state.email && email && email !== state.email) {
      // A different account signed in: start clean.
      location.reload();
      return;
    }
    state.idToken = resp.credential;
    state.idExp = (Number(p.exp) || 0) * 1000;
    state.email = email;
    state.idWaiters.splice(0).forEach(w => w.res());
    if (!state.started) afterSignIn();
  }

  function idValid(marginMs) { return state.idToken && Date.now() < state.idExp - (marginMs || 120000); }

  function ensureIdToken() {
    if (idValid()) return Promise.resolve();
    return new Promise((res, rej) => {
      state.idWaiters.push({ res, rej });
      try { google.accounts.id.prompt(); } catch (e) { /* ignore */ }
      setTimeout(() => {
        const i = state.idWaiters.findIndex(w => w.res === res);
        if (i !== -1) {
          state.idWaiters.splice(i, 1);
          showSignin('Your sign-in expired. Sign in again to continue — your work is saved.');
          rej(new Error('Please sign in again.'));
        }
      }, 15000);
    });
  }

  function showSignin(msg) {
    $('#signin').classList.remove('hidden');
    $('#signinMsg').textContent = msg || '';
    $('#signin').scrollIntoView({ behavior: 'smooth' });
  }

  async function afterSignIn() {
    state.started = true;
    $('#signinMsg').textContent = 'Checking your invite…';
    try {
      state.boot = await api('bootstrap', {});
    } catch (err) {
      state.started = false;
      $('#signinMsg').textContent = String(err.message || err);
      if (/not invited/i.test(String(err.message))) {
        try { google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
      }
      return;
    }
    $('#signin').classList.add('hidden');
    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CFG.GOOGLE_CLIENT_ID, scope: DRIVE_SCOPE, hint: state.email,
      callback: onDriveToken, error_callback: onDriveError,
    });
    $('#connect').classList.remove('hidden');
  }

  /* ================================================================ Drive token */

  function onDriveToken(r) {
    const waiters = state.driveWaiters.splice(0);
    if (r && r.access_token && google.accounts.oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE)) {
      state.driveToken = r.access_token;
      state.driveExp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
      waiters.forEach(w => w.res(state.driveToken));
    } else {
      waiters.forEach(w => w.rej(new Error('Google Drive access was not granted. Voice Notes needs it to save your notes.')));
    }
  }
  function onDriveError(e) {
    const waiters = state.driveWaiters.splice(0);
    const blocked = e && /popup/i.test(e.type || '');
    waiters.forEach(w => w.rej(new Error(blocked ? 'Google needs you to confirm Drive access. Tap Reconnect Drive.' : 'Google Drive access was cancelled.')));
    if (blocked) $('#connect').classList.remove('hidden');
  }
  function driveValid(marginMs) { return state.driveToken && Date.now() < state.driveExp - (marginMs || 60000); }
  function requestDrive() {
    return new Promise((res, rej) => {
      state.driveWaiters.push({ res, rej });
      if (state.driveWaiters.length === 1) state.tokenClient.requestAccessToken({ prompt: '', hint: state.email });
    });
  }
  /** Call first thing in a tap handler: refreshes Drive access while the tap still counts as a user gesture. */
  function primeDrive() {
    if (state.tokenClient && !driveValid(10 * 60000) && !state.driveWaiters.length) requestDrive().catch(() => {});
  }
  function getDrive() {
    if (driveValid()) return Promise.resolve(state.driveToken);
    return requestDrive();
  }

  $('#connectBtn').addEventListener('click', async () => {
    clearError();
    try {
      await requestDrive();
      $('#connect').classList.add('hidden');
      if (!state.ssId) await loadAll(true);
    } catch (err) { showError(err); }
  });

  /* ================================================================ engine */

  async function api(action, payload) {
    await ensureIdToken();
    let r;
    const body = JSON.stringify(Object.assign({ action: action, idToken: state.idToken }, payload));
    const tries = action === 'send' || action === 'inboxDelete' ? 1 : 2;
    for (let attempt = 1; ; attempt++) {
      try {
        r = await fetch(CFG.ENGINE_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body });
        break;
      } catch (e) {
        if (attempt >= tries) throw new Error('Could not reach the Voice Notes engine. Check your signal or Wi-Fi and try again. Nothing has been lost.');
        await new Promise(res => setTimeout(res, 2000));
      }
    }
    let j;
    try { j = await r.json(); } catch (e) { throw new Error('The engine sent an unexpected reply (' + r.status + ').'); }
    if (!j.ok) {
      if (j.code === 'auth') { state.idToken = null; state.idExp = 0; }
      throw new Error(j.error || 'Engine error.');
    }
    return j.data;
  }

  /* ================================================================ Sheets storage */

  async function g(method, url, body) {
    const t = await getDrive();
    const r = await fetch(url, { method: method, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) {
      state.driveExp = 0;
      $('#connect').classList.remove('hidden');
      throw new Error('Google Drive session expired. Tap Reconnect Drive, then try again.');
    }
    if (!r.ok) {
      let m = r.statusText;
      try { m = (await r.json()).error.message; } catch (e) { /* keep */ }
      const err = new Error('Google Drive error: ' + m);
      err.status = r.status;
      throw err;
    }
    return r.status === 204 ? null : r.json();
  }
  const valuesUrl = range => SHEETS + '/' + state.ssId + '/values/' + enc(range);

  async function findOrCreateData() {
    const key = 'vn_ss_' + state.email;
    const saved = lsGet(key);
    if (saved) {
      try {
        await g('GET', SHEETS + '/' + saved + '?fields=spreadsheetId');
        return saved;
      } catch (e) {
        if (e.status !== 404 && e.status !== 403) throw e;
        lsDel(key);
      }
    }
    const q = "name='" + DATA_NAME + "' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
    const list = await g('GET', DRIVE + '?q=' + enc(q) + '&orderBy=createdTime&fields=' + enc('files(id,name)'));
    const id = (list.files && list.files.length) ? list.files[0].id : await createData();
    lsSet(key, id);
    return id;
  }

  async function createData() {
    busy(true, 'Creating your Voice Notes spreadsheet…');
    const ss = await g('POST', SHEETS, {
      properties: { title: DATA_NAME, timeZone: 'Australia/Adelaide' },
      sheets: ['Cases', 'Templates', 'Settings', 'Examples', 'Logbook'].map(t => ({ properties: { title: t, gridProperties: { frozenRowCount: 1 } } })),
    });
    const id = ss.spreadsheetId;
    const data = [
      { range: 'Cases!A1', values: [CASE_HEADERS] },
      { range: 'Templates!A1', values: [TEMPLATE_HEADERS].concat(STARTER_TEMPLATES.map(t => TEMPLATE_HEADERS.map(h => t[h] || ''))) },
      { range: 'Settings!A1', values: [SETTING_HEADERS].concat(DEFAULT_SETTINGS) },
      { range: 'Examples!A1', values: [EXAMPLE_HEADERS] },
      { range: 'Logbook!A1', values: [LOGBOOK_HEADERS] },
    ];
    await g('POST', SHEETS + '/' + id + '/values:batchUpdate', { valueInputOption: 'RAW', data: data });
    return id;
  }

  async function loadAll(first) {
    busy(true, first ? 'Opening your Voice Notes…' : 'Refreshing…');
    try {
      state.ssId = state.ssId || await findOrCreateData();
      const ranges = ['Templates!A2:G', 'Settings!A2:C', 'Examples!A2:F', 'Cases!A2:' + CASE_LAST_COL, 'Logbook!1:1'];
      const res = await g('GET', SHEETS + '/' + state.ssId + '/values:batchGet?' + ranges.map(r => 'ranges=' + enc(r)).join('&') + '&valueRenderOption=UNFORMATTED_VALUE');
      const vr = res.valueRanges.map(v => v.values || []);
      state.allTemplates = vr[0].map(r => rowObj(TEMPLATE_HEADERS, r)).filter(t => t.id && t.name)
        .map(t => Object.assign(t, { noteType: normType(t.noteType) }));
      state.settingRows = vr[1].map(r => [String(r[0] || ''), String(r[1] == null ? '' : r[1]), String(r[2] || '')]);
      const needStarters = !state.settingRows.some(r => r[0] === 'STARTER_SET');
      await ensureSettingRows();
      if (needStarters) await addMissingStarters();
      refreshActiveTemplates();
      if (state.casesSheetId == null) {
        const meta = await g('GET', SHEETS + '/' + state.ssId + '?fields=' + enc('sheets.properties(sheetId,title)'));
        const cs = (meta.sheets || []).find(x => x.properties.title === 'Cases');
        state.casesSheetId = cs ? cs.properties.sheetId : null;
      }
      state.settings = {};
      state.settingRows.forEach(r => { if (r[0]) state.settings[r[0].trim()] = r[1]; });
      state.examples = vr[2].map(r => rowObj(EXAMPLE_HEADERS, r)).filter(e => e.note);
      state.cases = vr[3].map((r, i) => caseFromRow(r, i + 2)).filter(c => c.id);
      if (vr[4][0] && vr[4][0].length) state.logbookHeaders = vr[4][0].map(h => String(h == null ? '' : h));
      await purgeOldCases();
      busy(false);
      if (first) startApp();
      else renderAfterRefresh();
    } catch (err) {
      busy(false);
      throw err;
    }
  }

  function rowObj(headers, r) {
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i] == null ? '' : String(r[i]); });
    return o;
  }
  function caseFromRow(r, rowNum) {
    const c = rowObj(CASE_HEADERS, r);
    JSON_FIELDS.forEach(k => { try { c[k] = c[k] ? JSON.parse(c[k]) : []; } catch (e) { c[k] = []; } });
    c.rowNum = rowNum;
    return c;
  }
  function caseToRow(c) {
    return CASE_HEADERS.map(h => (JSON_FIELDS.indexOf(h) !== -1 ? JSON.stringify(c[h] || []) : String(c[h] == null ? '' : c[h])));
  }

  async function ensureSettingRows() {
    const have = state.settingRows.map(r => r[0]);
    const signName = (state.settingRows.find(r => r[0] === 'SIGN_OFF_NAME') || [])[1];
    const signRole = (state.settingRows.find(r => r[0] === 'SIGN_OFF_ROLE') || [])[1];
    const missing = DEFAULT_SETTINGS.filter(s => have.indexOf(s[0]) === -1).map(s => {
      if (!/_NOTE_FORMAT$/.test(s[0]) || !signName) return s.slice();
      state.settings.SIGN_OFF_NAME = signName; state.settings.SIGN_OFF_ROLE = signRole || '';
      return [s[0], personalise(s[1]), s[2]];
    });
    if (!missing.length) return;
    await g('POST', valuesUrl('Settings!A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: missing });
    state.settingRows = state.settingRows.concat(missing.map(s => s.slice()));
  }

  async function writeSettings() {
    await g('PUT', valuesUrl('Settings!A2:C' + (state.settingRows.length + 1)) + '?valueInputOption=RAW', { values: state.settingRows });
    state.settings = {};
    state.settingRows.forEach(r => { if (r[0]) state.settings[r[0].trim()] = r[1]; });
  }
  function setSetting(key, value) {
    const row = state.settingRows.find(r => r[0] === key);
    if (row) row[1] = value; else state.settingRows.push([key, value, '']);
  }

  function refreshActiveTemplates() {
    state.templates = state.allTemplates.filter(t => String(t.active).toLowerCase() !== 'no');
  }

  async function addMissingStarters() {
    const have = new Set(state.allTemplates.map(t => t.id));
    const missing = STARTER_TEMPLATES.filter(t => !have.has(t.id)).map(t => Object.assign({}, t, { noteType: normType(t.noteType) }));
    if (!missing.length) return;
    await g('POST', valuesUrl('Templates!A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: missing.map(t => TEMPLATE_HEADERS.map(h => t[h] || '')) });
    state.allTemplates = state.allTemplates.concat(missing);
  }

  async function writeAllTemplates() {
    await g('POST', valuesUrl('Templates!A2:G') + ':clear', {});
    if (state.allTemplates.length) {
      await g('PUT', valuesUrl('Templates!A2:G' + (state.allTemplates.length + 1)) + '?valueInputOption=RAW', { values: state.allTemplates.map(t => TEMPLATE_HEADERS.map(h => String(t[h] == null ? '' : t[h]))) });
    }
    refreshActiveTemplates();
  }

  function personalise(text) {
    const name = state.settings.SIGN_OFF_NAME || '';
    if (!name) return text;
    const role = state.settings.SIGN_OFF_ROLE || '';
    const surname = name.replace(/^(dr|mr|mrs|ms|miss|prof|professor|a\/prof)\.?\s+/i, '').split(/\s+/).pop();
    let v = String(text).split('##Your name##').join(name).split('##Your surname##').join(surname);
    return role ? v.split('##Your role##').join(role) : v.split('\n##Your role##').join('');
  }

  async function purgeOldCases() {
    const days = Number(state.settings.RETENTION_DAYS) || 14;
    const cutoff = Date.now() - days * 864e5;
    const keep = state.cases.filter(c => !(Date.parse(c.created) < cutoff));
    if (keep.length === state.cases.length) return;
    await g('POST', valuesUrl('Cases!A2:' + CASE_LAST_COL) + ':clear', {});
    if (keep.length) await g('PUT', valuesUrl('Cases!A2:' + CASE_LAST_COL + (keep.length + 1)) + '?valueInputOption=RAW', { values: keep.map(caseToRow) });
    keep.forEach((c, i) => { c.rowNum = i + 2; });
    state.cases = keep;
  }

  async function appendCase(c) {
    const r = await g('POST', valuesUrl('Cases!A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: [caseToRow(c)] });
    const m = /![A-Z]+(\d+):/.exec((r.updates && r.updates.updatedRange) || '');
    c.rowNum = m ? Number(m[1]) : 0;
    state.cases.push(c);
  }

  async function saveCase(c) {
    c.updated = new Date().toISOString();
    if (c.rowNum) {
      const chk = await g('GET', valuesUrl('Cases!A' + c.rowNum));
      if (chk.values && chk.values[0] && chk.values[0][0] === c.id) {
        await g('PUT', valuesUrl('Cases!A' + c.rowNum + ':' + CASE_LAST_COL + c.rowNum) + '?valueInputOption=RAW', { values: [caseToRow(c)] });
        return;
      }
    }
    // Row moved (e.g. another device purged old cases): find it again.
    const all = await g('GET', valuesUrl('Cases!A2:A'));
    const idx = (all.values || []).findIndex(r => r[0] === c.id);
    if (idx === -1) { await appendCase(c); return; }
    c.rowNum = idx + 2;
    await g('PUT', valuesUrl('Cases!A' + c.rowNum + ':' + CASE_LAST_COL + c.rowNum) + '?valueInputOption=RAW', { values: [caseToRow(c)] });
  }

  async function refreshCasesFromSheet() {
    const r = await g('GET', valuesUrl('Cases!A2:' + CASE_LAST_COL) + '?valueRenderOption=UNFORMATTED_VALUE');
    state.cases = (r.values || []).map((row, i) => caseFromRow(row, i + 2)).filter(c => c.id);
  }

  /* ================================================================ identifier check */

  function findIdentifiers(text) {
    const gd = state.boot.guard;
    const staff = new RegExp(gd.staffContext.source, gd.staffContext.flags);
    const found = [];
    gd.patterns.forEach(p => {
      const re = new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g');
      let m;
      while ((m = re.exec(text)) !== null) {
        if (p.skipStaff && staff.test(text.slice(Math.max(0, m.index - 40), m.index))) continue;
        found.push({ label: p.label, match: m[0] });
        if (found.length >= 20) return;
      }
    });
    return found;
  }
  function confirmIdentifiers(matches) {
    const list = matches.map(m => '• ' + m.label + ': "' + m.match + '"').join('\n');
    return ask('Possible patient identifier found:\n\n' + list + '\n\nCancel to edit (recommended). Continue only if this is not a patient identifier.', 'Not an identifier');
  }
  const identifierColumn = () => new RegExp(state.boot.guard.identifierColumn.source, state.boot.guard.identifierColumn.flags);

  /* ================================================================ app start */

  function startApp() {
    $('#connect').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#nav').classList.remove('hidden');
    if (isOwner()) {
      $('#inboxNav').classList.remove('hidden');
      $('#usageNav').classList.remove('hidden');
      refreshInboxBadge();
    } else {
      $('#sendOwner').textContent = 'Send to ' + ownerFirst() + ' for Sunrise';
      $('#sendOwner').classList.remove('hidden');
    }
    const warn = [];
    if (!state.boot.hasOpenAi) warn.push('Voice transcription is not switched on yet: type, or use keyboard dictation, for now.');
    if (String(state.settings.TEMPLATES_REVIEWED || '').toLowerCase() !== 'yes') warn.push('Templates still hold generic starter defaults. Review them in the Templates tab, then tap "I\'ve reviewed my templates".');
    const b = $('#banner');
    b.innerHTML = '';
    warn.forEach(w => b.appendChild(el('div', {}, w)));
    b.classList.toggle('hidden', !warn.length);
    $('#autoGen').checked = String(lsGet('vn_autogen') || 'yes') === 'yes';
    setType('op');
    renderFooter();
    if (!state.settings.SIGN_OFF_NAME) {
      $('#wName').value = state.boot.googleName || '';
      $('#welcome').classList.remove('hidden');
    }
  }

  function renderAfterRefresh() {
    setType(state.type, true);
    renderFooter();
  }

  function renderFooter() {
    const f = $('#footer');
    f.innerHTML = '';
    f.appendChild(document.createTextNode('Signed in as ' + state.email));
    if (state.ssId) {
      f.appendChild(document.createTextNode(' · '));
      f.appendChild(el('a', { href: 'https://docs.google.com/spreadsheets/d/' + state.ssId + '/edit', target: '_blank', rel: 'noopener' }, 'Your templates & settings'));
    }
    const u = state.boot && state.boot.usage;
    if (u) f.appendChild(document.createTextNode(' · This month: ' + u.audioMinutes + ' of ' + u.audioCap + ' voice minutes'));
    f.appendChild(document.createTextNode(' · '));
    const so = el('button', { class: 'linkbtn', type: 'button' }, 'Sign out');
    so.addEventListener('click', signOut);
    f.appendChild(so);
  }

  function signOut() {
    try { google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
    try { if (state.driveToken) google.accounts.oauth2.revoke(state.driveToken, () => {}); } catch (e) { /* ignore */ }
    location.reload();
  }

  /* ---------- welcome */
  $('#wSave').addEventListener('click', async () => {
    primeDrive();
    const name = $('#wName').value.trim();
    const role = $('#wRole').value.trim();
    if (!name) return toast('Enter your name for the sign-off');
    const surname = name.replace(/^(dr|mr|mrs|ms|miss|prof|professor|a\/prof)\.?\s+/i, '').split(/\s+/).pop();
    busy(true, 'Saving…');
    try {
      ['OP_NOTE_FORMAT', 'CLINIC_NOTE_FORMAT', 'ADMISSION_NOTE_FORMAT'].forEach(k => {
        let v = String(state.settings[k] || '').split('##Your name##').join(name).split('##Your surname##').join(surname);
        v = role ? v.split('##Your role##').join(role) : v.split('\n##Your role##').join('');
        setSetting(k, v);
      });
      setSetting('SIGN_OFF_NAME', name);
      setSetting('SIGN_OFF_ROLE', role);
      await writeSettings();
      busy(false);
      $('#welcome').classList.add('hidden');
      toast('All set');
    } catch (err) {
      busy(false);
      toast(String(err.message || err));
    }
  });

  /* ================================================================ tabs and form */

  document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  function showTab(tab) {
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    ['new', 'cases', 'templates', 'inbox', 'usage'].forEach(t => $('#tab-' + t).classList.toggle('hidden', tab !== t));
    if (tab === 'new') {
      if (state.current) $('#result').classList.remove('hidden');
      return;
    }
    $('#result').classList.add('hidden');
    if (tab === 'cases') loadCases(true);
    if (tab === 'templates') renderTemplatesTab();
    if (tab === 'inbox') loadInbox();
    if (tab === 'usage') loadUsage();
  }

  document.querySelectorAll('#typeSeg button').forEach(b => b.addEventListener('click', () => setType(b.dataset.type)));

  function setType(type, keepTag) {
    state.type = type;
    document.querySelectorAll('#typeSeg button').forEach(b => b.classList.toggle('on', b.dataset.type === type));
    $('#sideWrap').classList.toggle('hidden', type === 'clinic');
    $('#photoWrap').classList.toggle('hidden', type !== 'op');
    const sel = $('#template');
    const prev = sel.value;
    sel.innerHTML = '';
    state.templates.filter(t => t.noteType === type).forEach(t => sel.appendChild(el('option', { value: t.id }, t.name)));
    sel.appendChild(el('option', { value: FREE_ID }, 'Free note (no template)'));
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    if (!keepTag) $('#caseTag').value = defaultTag(type);
  }

  function defaultTag(type) {
    const today = new Date().toDateString();
    const n = state.cases.filter(c => c.noteType === type && new Date(c.created).toDateString() === today).length + 1;
    return new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ' \u2013 ' + (type === 'op' ? 'case ' : type === 'admission' ? 'admission ' : 'clinic ') + n;
  }

  function resetForm() {
    $('#transcript').value = '';
    $('#side').value = '';
    $('#personalRef').value = '';
    clearPhoto();
    state.current = null;
    $('#result').classList.add('hidden');
    $('#form').classList.remove('hidden');
    $('#caseTag').value = defaultTag(state.type);
    window.scrollTo(0, 0);
  }

  /* ================================================================ recording */

  const rec = { mr: null, stream: null, chunks: [], start: 0, timer: null };

  $('#recBtn').addEventListener('click', () => {
    primeDrive();
    if (rec.mr && rec.mr.state === 'recording') stopRecording();
    else startRecording();
  });

  async function startRecording() {
    clearError();
    if (!navigator.mediaDevices || !window.MediaRecorder) return showError(new Error('This browser cannot record audio. Use upload a memo, or type.'));
    try {
      rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (e) {
      return showError(new Error('Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.'));
    }
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    rec.mr = new MediaRecorder(rec.stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
    rec.chunks = [];
    rec.mr.ondataavailable = e => { if (e.data && e.data.size) rec.chunks.push(e.data); };
    rec.mr.onstop = onRecordingStopped;
    rec.mr.start(1000);
    rec.start = Date.now();
    $('#recBtn').classList.add('on');
    $('#recLabel').textContent = 'Stop';
    $('#recBtn').setAttribute('aria-label', 'Stop recording');
    rec.timer = setInterval(tick, 250);
    tick();
  }

  function tick() {
    const s = Math.floor((Date.now() - rec.start) / 1000);
    $('#recTime').textContent = 'Recording ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    if (s >= MAX_REC_SECONDS) stopRecording();
  }

  function stopRecording() {
    clearInterval(rec.timer);
    $('#recBtn').classList.remove('on');
    $('#recLabel').textContent = 'Record';
    $('#recBtn').setAttribute('aria-label', 'Start recording');
    try { rec.mr.stop(); } catch (e) { /* already stopped */ }
    if (rec.stream) rec.stream.getTracks().forEach(t => t.stop());
  }

  async function onRecordingStopped() {
    const seconds = Math.max(1, (Date.now() - rec.start) / 1000);
    const blob = new Blob(rec.chunks, { type: (rec.mr && rec.mr.mimeType) || 'audio/mp4' });
    rec.chunks = [];
    $('#recTime').textContent = '';
    if (seconds < 1.5 || blob.size < 2000) return toast('That recording was too short');
    await transcribeBlob(blob, seconds);
  }

  $('#uploadBtn').addEventListener('click', () => { primeDrive(); $('#memoFile').click(); });
  $('#memoFile').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const seconds = await audioDuration(file);
    await transcribeBlob(file, seconds);
  });

  function audioDuration(file) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const a = new Audio();
      const done = v => { URL.revokeObjectURL(url); resolve(v); };
      a.preload = 'metadata';
      a.onloadedmetadata = () => done(isFinite(a.duration) && a.duration > 0 ? a.duration : Math.round(file.size / 16000));
      a.onerror = () => done(Math.round(file.size / 16000));
      a.src = url;
      setTimeout(() => done(Math.round(file.size / 16000)), 4000);
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(new Error('Could not read the recording.'));
      r.readAsDataURL(blob);
    });
  }

  async function transcribeBlob(blob, seconds) {
    if (blob.size > 20 * 1024 * 1024) return showError(new Error('That memo is too large. Keep memos under about 10 minutes.'));
    busy(true, 'Transcribing your memo…');
    try {
      const b64 = await blobToBase64(blob);
      const res = await api('transcribe', { audio: b64, mimeType: blob.type || 'audio/mp4', seconds: Math.round(seconds), vocabulary: state.settings.VOCABULARY || '' });
      busy(false);
      const ta = $('#transcript');
      ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + (res.text || '');
      if (!res.text) return toast('No speech was recognised in that memo');
      if (state.boot.usage) state.boot.usage.audioMinutes = Math.round((state.boot.usage.audioMinutes + seconds / 60) * 10) / 10;
      renderFooter();
      if ($('#autoGen').checked) generate();
      else toast('Transcript added. Check it, then tap Write note');
    } catch (err) { showError(err); }
  }

  $('#autoGen').addEventListener('change', () => lsSet('vn_autogen', $('#autoGen').checked ? 'yes' : 'no'));

  /* ================================================================ sticker photo */

  $('#photo').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      state.image = await resizeImage(file);
      const img = $('#photoPreview');
      img.src = 'data:' + state.image.mediaType + ';base64,' + state.image.data;
      img.classList.remove('hidden');
      $('#clearPhoto').classList.remove('hidden');
    } catch (err) { showError(new Error('Could not read that photo. Try again.')); }
  });
  $('#clearPhoto').addEventListener('click', clearPhoto);
  function clearPhoto() {
    state.image = null;
    $('#photo').value = '';
    $('#photoPreview').classList.add('hidden');
    $('#clearPhoto').classList.add('hidden');
  }
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ mediaType: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] });
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /* ================================================================ write a note */

  function freeTemplate(type) {
    return { id: 'free-' + type, name: 'Free ' + TYPE_LABEL[type] + ' note', noteType: type, sections: FREE_SECTIONS, defaults: '', checks: '', free: true };
  }
  function templateById(id, type) {
    if (id === FREE_ID || /^free-/.test(id || '')) return freeTemplate(normType(type));
    return state.allTemplates.find(t => t.id === id);
  }
  function currentTemplate() {
    if ($('#template').value === FREE_ID) return freeTemplate(state.type);
    return state.templates.find(t => t.id === $('#template').value) || state.templates.find(t => t.noteType === state.type) || freeTemplate(state.type);
  }
  function settingsForEngine(free) {
    const s = state.settings;
    const out = { NOTE_RULES: s.NOTE_RULES, VOCABULARY: s.VOCABULARY, STYLE_EXAMPLES: s.STYLE_EXAMPLES };
    Object.values(FORMAT_KEYS).forEach(k => { out[k] = free ? '' : s[k]; });
    return out;
  }
  function examplesFor(noteType, templateId) {
    const n = Number(state.settings.EXAMPLES_PER_NOTE) || 3;
    return state.examples.filter(e => e.noteType === noteType)
      .sort((a, b) => ((b.templateId === templateId) - (a.templateId === templateId)) || (Date.parse(b.created) - Date.parse(a.created)))
      .slice(0, n).map(e => ({ templateName: e.templateName, note: e.note }));
  }
  function logbookColumnsForEngine() {
    return state.logbookHeaders.filter(h => h && h.trim()).map(h => ({ column: h, locked: identifierColumn().test(h) || h === state.settings.LOGBOOK_REF_COLUMN }));
  }

  $('#generate').addEventListener('click', () => { primeDrive(); generate(); });

  async function generate() {
    clearError();
    const transcript = $('#transcript').value.trim();
    if (!transcript && !state.image) return toast('Record or type your dictation first');
    const tpl = currentTemplate();
    if (state.type === 'op' && !tpl.free && !$('#side').value && !(await ask('No side selected. Continue anyway?'))) return;
    let override = false;
    const matches = findIdentifiers(transcript);
    if (matches.length) {
      if (!(await confirmIdentifiers(matches))) return;
      override = true;
    }
    const payload = {
      noteType: tpl.noteType,
      template: { id: tpl.id, name: tpl.name, sections: tpl.sections, defaults: tpl.defaults, checks: tpl.checks },
      settings: settingsForEngine(tpl.free),
      examples: examplesFor(tpl.noteType, tpl.id),
      side: tpl.noteType === 'clinic' ? '' : $('#side').value,
      transcript: transcript,
      image: tpl.noteType === 'op' ? state.image : null,
      logbookColumns: tpl.noteType === 'op' ? logbookColumnsForEngine() : [],
      override: override,
    };
    busy(true, 'Writing note…');
    try {
      let res = await api('generate', payload);
      if (res && res.blocked) {
        busy(false);
        if (!(await confirmIdentifiers(res.matches))) return;
        payload.override = true;
        busy(true, 'Writing note…');
        res = await api('generate', payload);
      }
      busy(true, 'Saving to your Drive…');
      const now = new Date().toISOString();
      const c = {
        id: uuid(), created: now, caseTag: $('#caseTag').value.trim(), noteType: tpl.noteType, templateId: tpl.id, templateName: tpl.name,
        side: payload.side, transcript: transcript, note: res.note, flags: res.flags || [], defaultsUsed: res.defaultsUsed || [],
        corrections: res.corrections || [], logbook: res.logbook || [], status: 'draft', updated: now,
        personalRef: $('#personalRef').value.trim(), sentAt: '',
      };
      await appendCase(c);
      busy(false);
      showCase(c);
    } catch (err) { showError(err); }
  }

  /* ================================================================ result */

  function showCase(c) {
    clearError();
    state.current = c;
    $('#form').classList.add('hidden');
    ['cases', 'templates', 'inbox', 'usage'].forEach(t => $('#tab-' + t).classList.add('hidden'));
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === 'new'));
    $('#tab-new').classList.remove('hidden');
    $('#result').classList.remove('hidden');
    $('#resTitle').textContent = c.caseTag || c.templateName;
    setStatus(c.status);
    const when = c.created ? new Date(c.created).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
    $('#resMeta').textContent = [c.templateName, c.side, c.personalRef ? 'Ref ' + c.personalRef : '', when, c.sentAt ? 'sent to ' + ownerFirst() : ''].filter(Boolean).join(' · ');
    $('#note').value = c.note || '';
    renderTodo();
    $('#transcriptView').textContent = c.transcript || '';
    $('#amend').value = '';
    renderFlags(c);
    renderLogbook(c);
    $('#sendOwner').disabled = !!c.sentAt;
    if (!isOwner()) $('#sendOwner').textContent = c.sentAt ? 'Sent to ' + ownerFirst() : 'Send to ' + ownerFirst() + ' for Sunrise';
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setStatus(s) {
    const p = $('#resStatus');
    p.textContent = s || 'draft';
    p.className = 'pill ' + (s || '');
  }

  function renderFlags(c) {
    const box = $('#flags');
    box.innerHTML = '';
    (c.flags || []).forEach(f => box.appendChild(el('div', { class: 'flag ' + (f.severity === 'info' ? 'info' : 'warning') }, (f.severity === 'info' ? '' : 'Check: ') + f.message)));
    if (c.defaultsUsed && c.defaultsUsed.length) box.appendChild(el('div', { class: 'flag info' }, 'Filled from your defaults: ' + c.defaultsUsed.join(', ')));
    if (c.corrections && c.corrections.length) box.appendChild(el('div', { class: 'flag info' }, 'Transcript corrected: ' + c.corrections.map(x => '"' + x.heard + '" → ' + x.correctedTo).join('; ')));
    if (!box.children.length) box.appendChild(el('div', { class: 'flag info' }, 'No flags. Still read the note before pasting.'));
  }

  function renderTodo() {
    const found = $('#note').value.match(/##[^#\n]*##/g) || [];
    const box = $('#todo');
    if (!found.length) { box.classList.add('hidden'); return; }
    const names = [...new Set(found.map(f => (f === '####' ? '####' : f.slice(2, -2))))];
    box.textContent = found.length + (found.length === 1 ? ' field' : ' fields') + ' still to complete (marked ##): ' + names.join(', ');
    box.classList.remove('hidden');
  }
  $('#note').addEventListener('input', renderTodo);

  function renderLogbook(c) {
    const card = $('#logbookCard');
    if (c.noteType !== 'op') { card.classList.add('hidden'); return; }
    const vals = {};
    (c.logbook || []).forEach(l => { vals[l.column] = l.value; });
    const refCol = state.settings.LOGBOOK_REF_COLUMN || '';
    const idCol = identifierColumn();
    const box = $('#logbookFields');
    box.innerHTML = '';
    const cols = state.logbookHeaders.filter(h => h && h.trim());
    if (!cols.length) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    cols.forEach((h, i) => {
      const isRef = h === refCol;
      const locked = !isRef && idCol.test(h);
      box.appendChild(el('div', { class: 'col' }, h + (locked ? ' (fill yourself)' : isRef ? ' (your ref)' : '')));
      const input = el('input', { type: 'text', 'data-col': h, id: 'lb' + i });
      input.value = isRef ? (c.personalRef || '') : locked ? '' : (vals[h] || '');
      if (locked) input.disabled = true;
      box.appendChild(input);
    });
    $('#addLogbook').disabled = c.status === 'logbooked';
    $('#addLogbook').textContent = c.status === 'logbooked' ? 'Already in logbook' : 'Add to logbook';
  }

  $('#note').addEventListener('blur', async () => {
    const c = state.current;
    if (!c || $('#note').value === c.note) return;
    try {
      c.note = $('#note').value;
      await saveCase(c);
      toast('Edits saved');
    } catch (err) { showError(err); }
  });

  async function copyText(text, ta) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      ta.focus();
      ta.select();
      document.execCommand('copy');
    }
  }

  $('#copy').addEventListener('click', async () => {
    primeDrive();
    const c = state.current;
    const ta = $('#note');
    await copyText(ta.value, ta);
    toast('Copied. Paste into Sunrise');
    if (!c) return;
    c.note = ta.value;
    if (c.status === 'draft') { c.status = 'copied'; setStatus(c.status); }
    saveCase(c).catch(() => {});
  });

  $('#sendOwner').addEventListener('click', async () => {
    primeDrive();
    const c = state.current;
    if (!c) return;
    clearError();
    const note = $('#note').value.trim();
    const todo = note.match(/##[^#\n]*##/g) || [];
    if (todo.length && !(await ask(todo.length + ' field(s) are still marked ##. Send to ' + ownerFirst() + ' anyway?', 'Send'))) return;
    const payload = { note: note, caseTag: c.caseTag, noteType: c.noteType, templateName: c.templateName, side: c.side, fromName: state.settings.SIGN_OFF_NAME || state.email };
    busy(true, 'Sending…');
    try {
      let res = await api('send', payload);
      if (res && res.blocked) {
        busy(false);
        if (!(await confirmIdentifiers(res.matches))) return;
        payload.override = true;
        busy(true, 'Sending…');
        res = await api('send', payload);
      }
      c.note = note;
      c.sentAt = new Date().toISOString();
      c.status = 'sent';
      await saveCase(c);
      busy(false);
      showCase(c);
      toast('Sent to ' + ownerFirst());
    } catch (err) { showError(err); }
  });

  $('#teach').addEventListener('click', async () => {
    primeDrive();
    const c = state.current;
    const note = $('#note').value.trim();
    if (!c || !note) return toast('Nothing to save yet');
    clearError();
    const matches = findIdentifiers(note);
    if (matches.length && !(await confirmIdentifiers(matches))) return;
    busy(true, 'Saving example…');
    try {
      const ex = { id: uuid(), created: new Date().toISOString(), noteType: c.noteType, templateId: c.templateId, templateName: c.templateName, note: note };
      state.examples.push(ex);
      const ofType = state.examples.filter(e => e.noteType === c.noteType);
      if (ofType.length > EXAMPLES_KEPT) {
        const drop = new Set(ofType.sort((a, b) => Date.parse(a.created) - Date.parse(b.created)).slice(0, ofType.length - EXAMPLES_KEPT).map(e => e.id));
        state.examples = state.examples.filter(e => !drop.has(e.id));
        await g('POST', valuesUrl('Examples!A2:F') + ':clear', {});
        await g('PUT', valuesUrl('Examples!A2:F' + (state.examples.length + 1)) + '?valueInputOption=RAW', { values: state.examples.map(e => EXAMPLE_HEADERS.map(h => e[h])) });
      } else {
        await g('POST', valuesUrl('Examples!A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: [EXAMPLE_HEADERS.map(h => ex[h])] });
      }
      busy(false);
      toast('Saved. Future ' + TYPE_LABEL[normType(c.noteType)] + ' notes will learn from it');
    } catch (err) { showError(err); }
  });

  $('#amendBtn').addEventListener('click', async () => {
    primeDrive();
    const c = state.current;
    const instruction = $('#amend').value.trim();
    if (!c || !instruction) return toast('Type or dictate the change first');
    clearError();
    let override = false;
    const matches = findIdentifiers(instruction);
    if (matches.length) {
      if (!(await confirmIdentifiers(matches))) return;
      override = true;
    }
    const tpl = templateById(c.templateId, c.noteType) || { id: c.templateId, name: c.templateName, sections: '', defaults: '', checks: '' };
    busy(true, 'Applying amendment…');
    try {
      const res = await api('amend', {
        noteType: c.noteType, template: { id: tpl.id, name: tpl.name, sections: tpl.sections, defaults: tpl.defaults, checks: tpl.checks },
        settings: settingsForEngine(!!tpl.free), examples: examplesFor(c.noteType, c.templateId), transcript: c.transcript,
        note: $('#note').value, logbook: c.logbook, logbookColumns: c.noteType === 'op' ? logbookColumnsForEngine() : [], instruction: instruction, override: override,
      });
      if (res && res.blocked) { busy(false); return toast('Amendment not sent'); }
      c.note = res.note;
      c.flags = res.flags || [];
      c.corrections = (c.corrections || []).concat(res.corrections || []);
      if (c.noteType === 'op') c.logbook = res.logbook || c.logbook;
      c.transcript = c.transcript + '\n\n[Amendment] ' + instruction;
      await saveCase(c);
      busy(false);
      showCase(c);
      toast('Amended');
    } catch (err) { showError(err); }
  });

  $('#addLogbook').addEventListener('click', async () => {
    primeDrive();
    const c = state.current;
    if (!c) return;
    const refCol = state.settings.LOGBOOK_REF_COLUMN || '';
    const idCol = identifierColumn();
    const values = {};
    document.querySelectorAll('#logbookFields input').forEach(i => { if (!i.disabled) values[i.dataset.col] = i.value.trim(); });
    const row = state.logbookHeaders.map(h => (!h || (idCol.test(h) && h !== refCol)) ? '' : (values[h] || ''));
    if (!row.some(v => v)) return toast('All logbook fields are empty');
    busy(true, 'Adding to logbook…');
    try {
      await g('POST', valuesUrl('Logbook!A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: [row] });
      c.logbook = state.logbookHeaders.filter(h => h).map(h => ({ column: h, value: values[h] || '' }));
      c.status = 'logbooked';
      await saveCase(c);
      busy(false);
      setStatus(c.status);
      $('#addLogbook').disabled = true;
      $('#addLogbook').textContent = 'Already in logbook';
      toast('Added to the Logbook tab of your Voice Notes spreadsheet');
    } catch (err) { showError(err); }
  });

  $('#startNew').addEventListener('click', () => { showTab('new'); resetForm(); });

  $('#deleteCase').addEventListener('click', async () => {
    primeDrive();
    const c = state.current;
    if (!c) return;
    if (!(await ask('Delete this note from your Voice Notes? This can\'t be undone.' + (c.sentAt ? '\n\nThe copy already sent to ' + ownerFirst() + ' is not affected.' : ''), 'Delete'))) return;
    busy(true, 'Deleting…');
    try {
      await deleteCaseRow(c);
      state.cases = state.cases.filter(x => x.id !== c.id);
      busy(false);
      resetForm();
      toast('Note deleted');
    } catch (err) { showError(err); }
  });

  async function deleteCaseRow(c) {
    const all = await g('GET', valuesUrl('Cases!A2:A'));
    const idx = (all.values || []).findIndex(r => r[0] === c.id);
    if (idx === -1) return;
    if (state.casesSheetId == null) throw new Error('Could not find the Cases tab in your spreadsheet.');
    await g('POST', SHEETS + '/' + state.ssId + ':batchUpdate', { requests: [{ deleteDimension: { range: { sheetId: state.casesSheetId, dimension: 'ROWS', startIndex: idx + 1, endIndex: idx + 2 } } }] });
    state.cases.forEach(x => { if (x.rowNum > idx + 2) x.rowNum -= 1; });
  }

  /* ================================================================ templates tab */

  document.querySelectorAll('#tplSeg button').forEach(b => b.addEventListener('click', () => { state.tplType = b.dataset.type; state.tplEditing = null; renderTemplatesTab(); }));

  function renderTemplatesTab() {
    document.querySelectorAll('#tplSeg button').forEach(b => b.classList.toggle('on', b.dataset.type === state.tplType));
    const box = $('#tplList');
    box.innerHTML = '';
    const list = state.allTemplates.filter(t => t.noteType === state.tplType);
    if (!list.length) box.appendChild(el('div', { class: 'empty' }, 'No templates of this type yet. Tap + New.'));
    list.forEach(t => {
      const hidden = String(t.active).toLowerCase() === 'no';
      const row = el('div', { class: 'item' });
      const left = el('div');
      left.appendChild(el('div', { class: 't' }, t.name));
      const nChecks = String(t.checks || '').split(';').filter(x => x.trim()).length;
      left.appendChild(el('div', { class: 's' }, (t.defaults ? 'Has defaults' : 'No defaults') + ' · ' + nChecks + (nChecks === 1 ? ' check' : ' checks')));
      row.appendChild(left);
      row.appendChild(el('span', { class: 'pill' + (hidden ? '' : ' done') }, hidden ? 'hidden' : 'shown'));
      row.addEventListener('click', () => openTemplate(t));
      box.appendChild(row);
    });
    $('#reviewedWrap').classList.toggle('hidden', String(state.settings.TEMPLATES_REVIEWED || '').toLowerCase() === 'yes');
    $('#fOp').value = state.settings.OP_NOTE_FORMAT || '';
    $('#fClinic').value = state.settings.CLINIC_NOTE_FORMAT || '';
    $('#fAdmission').value = state.settings.ADMISSION_NOTE_FORMAT || '';
    $('#fRules').value = state.settings.NOTE_RULES || '';
    $('#fVocab').value = state.settings.VOCABULARY || '';
    if (!state.tplEditing) $('#tplEditor').classList.add('hidden');
  }

  function openTemplate(t) {
    state.tplEditing = t || { id: '', name: '', noteType: state.tplType, sections: '', defaults: '', checks: '', active: 'yes' };
    const e = state.tplEditing;
    $('#tplEdTitle').textContent = e.id ? 'Edit template' : 'New template';
    $('#tName').value = e.name;
    $('#tType').value = e.noteType;
    $('#tSections').value = e.sections;
    $('#tDefaults').value = e.defaults;
    $('#tChecks').value = e.checks;
    $('#tActive').checked = String(e.active).toLowerCase() !== 'no';
    $('#tDelete').classList.toggle('hidden', !e.id);
    $('#tplEditor').classList.remove('hidden');
    $('#tplEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('#newTemplate').addEventListener('click', () => { primeDrive(); openTemplate(null); });
  $('#tCancel').addEventListener('click', () => { state.tplEditing = null; $('#tplEditor').classList.add('hidden'); });

  $('#tSave').addEventListener('click', async () => {
    primeDrive();
    const e = state.tplEditing;
    if (!e) return;
    const name = $('#tName').value.trim();
    if (!name) return toast('Give the template a name');
    const updated = {
      id: e.id || ('t-' + uuid().slice(0, 8)), name: name, noteType: normType($('#tType').value), sections: $('#tSections').value.trim(),
      defaults: $('#tDefaults').value.trim(), checks: $('#tChecks').value.trim(), active: $('#tActive').checked ? 'yes' : 'no',
    };
    const matches = findIdentifiers([updated.name, updated.sections, updated.defaults, updated.checks].join('\n'));
    if (matches.length && !(await confirmIdentifiers(matches))) return;
    busy(true, 'Saving template…');
    try {
      const i = state.allTemplates.findIndex(t => t.id === e.id);
      if (i === -1) state.allTemplates.push(updated); else state.allTemplates[i] = updated;
      await writeAllTemplates();
      state.tplEditing = null;
      state.tplType = updated.noteType;
      busy(false);
      renderTemplatesTab();
      setType(state.type, true);
      toast('Template saved');
    } catch (err) { showError(err); }
  });

  $('#tDelete').addEventListener('click', async () => {
    primeDrive();
    const e = state.tplEditing;
    if (!e || !e.id) return;
    if (!(await ask('Delete the template "' + e.name + '"? Notes already written are not affected.', 'Delete'))) return;
    busy(true, 'Deleting template…');
    try {
      state.allTemplates = state.allTemplates.filter(t => t.id !== e.id);
      await writeAllTemplates();
      state.tplEditing = null;
      busy(false);
      renderTemplatesTab();
      setType(state.type, true);
      toast('Template deleted');
    } catch (err) { showError(err); }
  });

  $('#fSave').addEventListener('click', async () => {
    primeDrive();
    const vals = { OP_NOTE_FORMAT: $('#fOp').value, CLINIC_NOTE_FORMAT: $('#fClinic').value, ADMISSION_NOTE_FORMAT: $('#fAdmission').value, NOTE_RULES: $('#fRules').value, VOCABULARY: $('#fVocab').value };
    const matches = findIdentifiers(Object.values(vals).join('\n'));
    if (matches.length && !(await confirmIdentifiers(matches))) return;
    busy(true, 'Saving…');
    try {
      Object.keys(vals).forEach(k => setSetting(k, vals[k]));
      await writeSettings();
      busy(false);
      toast('Format and style saved');
    } catch (err) { showError(err); }
  });

  $('#markReviewed').addEventListener('click', async () => {
    primeDrive();
    busy(true, 'Saving…');
    try {
      setSetting('TEMPLATES_REVIEWED', 'yes');
      await writeSettings();
      busy(false);
      $('#reviewedWrap').classList.add('hidden');
      const b = $('#banner');
      [...b.children].forEach(c => { if (/starter defaults/.test(c.textContent)) c.remove(); });
      b.classList.toggle('hidden', !b.children.length);
      toast('Thanks. The reminder is gone');
    } catch (err) { showError(err); }
  });


  /* ================================================================ cases */

  $('#refreshCases').addEventListener('click', () => { primeDrive(); loadCases(true); });

  async function loadCases(fromSheet) {
    const box = $('#caseList');
    box.innerHTML = '';
    box.appendChild(el('div', { class: 'empty' }, 'Loading…'));
    try {
      if (fromSheet) await refreshCasesFromSheet();
      box.innerHTML = '';
      const cases = state.cases.slice().sort((a, b) => (a.created < b.created ? 1 : -1)).slice(0, 60);
      if (!cases.length) return box.appendChild(el('div', { class: 'empty' }, 'No cases yet.'));
      let lastDay = '';
      cases.forEach(c => {
        const d = new Date(c.created);
        const day = d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
        if (day !== lastDay) { box.appendChild(el('div', { class: 'day' }, day)); lastDay = day; }
        const row = el('div', { class: 'item' });
        const left = el('div');
        left.appendChild(el('div', { class: 't' }, c.caseTag || c.templateName));
        left.appendChild(el('div', { class: 's' }, [c.templateName, c.side, c.personalRef ? 'Ref ' + c.personalRef : '', d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })].filter(Boolean).join(' · ')));
        row.appendChild(left);
        row.appendChild(el('span', { class: 'pill ' + c.status }, c.status));
        row.addEventListener('click', () => showCase(c));
        box.appendChild(row);
      });
    } catch (err) { box.innerHTML = ''; showError(err); }
  }

  /* ================================================================ inbox (owner) */

  $('#refreshInbox').addEventListener('click', loadInbox);

  async function refreshInboxBadge() {
    try {
      state.inbox = await api('inbox', {});
      const n = state.inbox.filter(i => i.status === 'new').length;
      $('#inboxBadge').textContent = String(n);
      $('#inboxBadge').classList.toggle('hidden', !n);
    } catch (e) { /* badge is optional */ }
  }

  async function loadInbox() {
    const box = $('#inboxList');
    box.innerHTML = '';
    box.appendChild(el('div', { class: 'empty' }, 'Loading…'));
    $('#inboxItem').classList.add('hidden');
    try {
      state.inbox = await api('inbox', {});
      box.innerHTML = '';
      const n = state.inbox.filter(i => i.status === 'new').length;
      $('#inboxBadge').textContent = String(n);
      $('#inboxBadge').classList.toggle('hidden', !n);
      if (!state.inbox.length) return box.appendChild(el('div', { class: 'empty' }, 'Nothing sent to you yet.'));
      state.inbox.forEach(it => {
        const d = new Date(it.received);
        const row = el('div', { class: 'item' });
        const left = el('div');
        left.appendChild(el('div', { class: 't' }, it.fromName + ' · ' + (it.caseTag || it.templateName)));
        left.appendChild(el('div', { class: 's' }, [it.templateName, it.side, d.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })].filter(Boolean).join(' · ')));
        row.appendChild(left);
        row.appendChild(el('span', { class: 'pill ' + it.status }, it.status === 'done' ? 'entered' : it.status));
        row.addEventListener('click', () => openInboxItem(it));
        box.appendChild(row);
      });
    } catch (err) { box.innerHTML = ''; showError(err); }
  }

  function openInboxItem(it) {
    state.inboxCurrent = it;
    $('#inboxItem').classList.remove('hidden');
    $('#inboxTitle').textContent = it.fromName + ' · ' + (it.caseTag || it.templateName);
    $('#inboxStatus').textContent = it.status === 'done' ? 'entered' : it.status;
    $('#inboxStatus').className = 'pill ' + it.status;
    $('#inboxMeta').textContent = [it.templateName, it.side, it.fromEmail].filter(Boolean).join(' · ');
    $('#inboxNote').value = it.note;
    $('#inboxItem').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function markInbox(status) {
    const it = state.inboxCurrent;
    if (!it) return;
    try {
      await api('inboxMark', { id: it.id, status: status });
      it.status = status;
      openInboxItem(it);
      loadInbox();
    } catch (err) { showError(err); }
  }
  $('#inboxCopy').addEventListener('click', async () => {
    const ta = $('#inboxNote');
    await copyText(ta.value, ta);
    toast('Copied. Paste into Sunrise');
    if (state.inboxCurrent && state.inboxCurrent.status === 'new') markInbox('copied');
  });
  $('#inboxDone').addEventListener('click', () => markInbox('done'));
  $('#inboxDelete').addEventListener('click', async () => {
    const it = state.inboxCurrent;
    if (!it) return;
    if (!(await ask('Delete this note from your inbox? It stays in ' + (it.fromName || 'the sender') + '\'s own Voice Notes.', 'Delete'))) return;
    try {
      await api('inboxDelete', { id: it.id });
      state.inboxCurrent = null;
      $('#inboxItem').classList.add('hidden');
      toast('Deleted from inbox');
      loadInbox();
    } catch (err) { showError(err); }
  });

  /* ================================================================ usage (owner) */

  $('#refreshUsage').addEventListener('click', loadUsage);

  async function loadUsage() {
    const box = $('#usageBox');
    box.innerHTML = '';
    box.appendChild(el('div', { class: 'empty' }, 'Loading…'));
    try {
      const u = await api('usage', {});
      box.innerHTML = '';
      const t = el('table', { class: 'usage' });
      const head = el('tr');
      ['User', 'Notes', 'Memos', 'Voice min', 'Est. cost'].forEach(h => head.appendChild(el('th', {}, h)));
      t.appendChild(head);
      u.rows.forEach(r => {
        const tr = el('tr');
        tr.appendChild(el('td', {}, r.email + (r.owner ? ' (you)' : r.invited ? '' : ' (removed)')));
        tr.appendChild(el('td', {}, String(r.notes)));
        tr.appendChild(el('td', {}, String(r.memos)));
        tr.appendChild(el('td', {}, String(r.audioMinutes)));
        tr.appendChild(el('td', {}, 'US$' + r.costUsd.toFixed(2)));
        t.appendChild(tr);
      });
      box.appendChild(t);
      $('#usageMeta').textContent = u.month + ' · Caps per colleague: ' + (u.tokenCap ? u.tokenCap.toLocaleString('en-AU') + ' tokens' : 'no token cap') + ', ' +
        (u.audioCap ? u.audioCap + ' voice minutes' : 'no voice cap') + ' a month · Cost is an estimate (Claude US$' + u.prices.inPerMTok + '/' + u.prices.outPerMTok +
        ' per million tokens in/out; transcription US$' + u.prices.perAudioMin + ' a minute).';
    } catch (err) { box.innerHTML = ''; showError(err); }
  }

  /* ================================================================ go */
  if (window.google && google.accounts) initGsi();
})();
