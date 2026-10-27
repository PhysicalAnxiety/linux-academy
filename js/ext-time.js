/* Linux Academy: a virtual clock ("time machine") so that cron, at and systemd timers can really fire; crontab, at, date, mail */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS } = LX;
  const U = LX.U;
  const P = LX.Shell.prototype;
  const RealDate = Date;
  LX.clock = { offset: 0, installed: false };
  const realNow = () => RealDate.now();
  const nowMs = () => RealDate.now() + LX.clock.offset;
  function installClock() {
    if (LX.clock.installed) return;
    LX.clock.installed = true;
    class FakeDate extends RealDate {
      constructor(...a) {
        if (a.length === 0) super(RealDate.now() + LX.clock.offset);
        else super(...a);
      }
      static now() {
        return RealDate.now() + LX.clock.offset;
      }
    }
    FakeDate.__fake = true;
    globalThis.Date = FakeDate;
  }
  const setClock = (ms) => {
    LX.clock.offset = ms - realNow();
  };
  const prevInvoke = P.invoke;
  P.invoke = function (d, name, args, io) {
    LX.clock.offset = this.timeOffset || 0;
    return prevInvoke.call(this, d, name, args, io);
  };

  /* ---------- cron expressions ---------- */
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  function parseField(f, lo, hi, names) {
    const out = new Set();
    for (const part of f.split(',')) {
      const m = /^(\*|[0-9]+|[a-zA-Z]{3})(?:-([0-9]+|[a-zA-Z]{3}))?(?:\/([0-9]+))?$/.exec(part);
      if (!m) return null;
      const val = (x) => {
        if (/^\d+$/.test(x)) return +x;
        const i = names ? names.indexOf(x.toLowerCase()) : -1;
        return i < 0 ? NaN : i + (names === MON ? 1 : 0);
      };
      let a;
      let b;
      if (m[1] === '*') { a = lo; b = hi; } else { a = val(m[1]); b = m[2] !== undefined ? val(m[2]) : m[3] !== undefined ? hi : a; }
      const step = m[3] ? +m[3] : 1;
      if (Number.isNaN(a) || Number.isNaN(b) || a < lo || b > hi + (names === DOW ? 1 : 0) || a > b || step < 1) return null;
      for (let i = a; i <= b; i += step) out.add(names === DOW && i === 7 ? 0 : i);
    }
    return out;
  }
  const SPECIAL = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *' };
  /** parse one crontab line; withUser = /etc/crontab style */
  function parseCronLine(raw, withUser) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return { kind: 'skip' };
    let m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m && !/^[0-9*]/.test(line)) return { kind: 'env', k: m[1], v: m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1') };
    let rest = line;
    let spec;
    if (line.startsWith('@')) {
      const w = line.split(/\s+/)[0];
      if (w === '@reboot') { rest = line.slice(w.length).trim(); spec = { reboot: true }; } else if (SPECIAL[w]) { rest = line.slice(w.length).trim(); spec = parseSpec(SPECIAL[w].split(' ')); } else return { kind: 'err', msg: 'bad command' };
    } else {
      const parts = line.split(/\s+/);
      if (parts.length < 6) return { kind: 'err', msg: parts.length < 5 ? 'bad minute' : 'bad command' };
      spec = parseSpec(parts.slice(0, 5));
      if (spec.err) return { kind: 'err', msg: spec.err };
      rest = line.replace(/^\s*(\S+\s+){5}/, '');
    }
    if (spec.err) return { kind: 'err', msg: spec.err };
    let user = null;
    if (withUser) {
      const um = /^(\S+)\s+(.*)$/.exec(rest);
      if (!um) return { kind: 'err', msg: 'bad username' };
      user = um[1];
      rest = um[2];
    }
    if (!rest) return { kind: 'err', msg: 'bad command' };
    return { kind: 'job', spec, user, cmd: rest, raw: line };
  }
  function parseSpec(p) {
    const mi = parseField(p[0], 0, 59);
    if (!mi) return { err: 'bad minute' };
    const h = parseField(p[1], 0, 23);
    if (!h) return { err: 'bad hour' };
    const d = parseField(p[2], 1, 31);
    if (!d) return { err: 'bad day-of-month' };
    const mo = parseField(p[3], 1, 12, MON);
    if (!mo) return { err: 'bad month' };
    const w = parseField(p[4], 0, 6, DOW);
    if (!w) return { err: 'bad day-of-week' };
    return { mi, h, d, mo, w, domStar: p[2].startsWith('*'), dowStar: p[4].startsWith('*') };
  }
  function due(spec, dt) {
    if (spec.reboot) return false;
    if (!spec.mi.has(dt.getMinutes()) || !spec.h.has(dt.getHours()) || !spec.mo.has(dt.getMonth() + 1)) return false;
    const dm = spec.d.has(dt.getDate());
    const dw = spec.w.has(dt.getDay());
    if (!spec.domStar && !spec.dowStar) return dm || dw;
    return dm && dw;
  }
  const homeOf = (sh, user) => (sh.users[user] ? sh.users[user].home : '/');
  LX.cronParse = parseCronLine;

  /* ---------- running jobs ---------- */
  const splitPercent = (cmd) => {
    let i = 0;
    let first = -1;
    let out = '';
    for (; i < cmd.length; i++) {
      if (cmd[i] === '\\' && cmd[i + 1] === '%') { out += '%'; i++; continue; }
      if (cmd[i] === '%' && first < 0) { first = out.length; out += '\n'; continue; }
      if (cmd[i] === '%') { out += '\n'; continue; }
      out += cmd[i];
    }
    if (first < 0) return { cmd: out, stdin: '' };
    return { cmd: out.slice(0, first), stdin: out.slice(first + 1) };
  };
  const fmtMbox = (sh, user, subject, body) => {
    const d = new Date();
    return `From ${user}@${sh.hostname || 'linux-school'}  ${U.strftime('%a %b %e %H:%M:%S %Y', d)}\nReturn-path: <${user}@${sh.hostname || 'linux-school'}>\nDate: ${U.strftime('%a, %e %b %Y %H:%M:%S %z', d)}\nFrom: root@${sh.hostname || 'linux-school'} (Cron Daemon)\nTo: ${user}@${sh.hostname || 'linux-school'}\nSubject: ${subject}\n\n${body}\n`;
  };
  async function runJob(sh, job, label) {
    const user = job.user;
    const env = Object.assign({ SHELL: '/bin/sh', PATH: '/usr/bin:/bin', LOGNAME: user, HOME: homeOf(sh, user) }, job.env || {});
    const sp = splitPercent(job.cmd);
    let out = '';
    const io = { stdin: sp.stdin, stdout: (s) => { out += s; }, stderr: (s) => { out += s; }, tty: false };
    const snap = sh.snap();
    const prev = { user: sh.user, eu: sh._eu, cwd: sh.cwd, fast: sh.fast };
    let st = 0;
    try {
      sh.user = user;
      sh._eu = null;
      sh.cwd = job.cwd || homeOf(sh, user);
      sh.vars = Object.assign({}, env);
      sh.exported = new Set(Object.keys(env));
      sh.fast = true;
      sh.logEvent('cron.service', 6, `(${user}) CMD (${job.cmd})`, { ident: 'CRON', pid: sh.nextPid++ });
      try {
        st = await sh.runSource(sp.cmd, io);
      } catch (e) {
        if (e instanceof LX.AbortSig) throw e;
        out += String(e.message || e) + '\n';
        st = 1;
      }
    } finally {
      sh.restoreSnap(snap);
      sh.user = prev.user;
      sh._eu = prev.eu;
      sh.cwd = prev.cwd;
      sh.fast = prev.fast;
    }
    const to = job.env && job.env.MAILTO !== undefined ? job.env.MAILTO : user;
    if (out.trim() && to && sh.users[to]) {
      const mbox = `/var/mail/${to}`;
      const prevEu = sh._eu;
      sh._eu = 'root';
      try {
        const old = sh.fs.lookup(mbox) ? sh.readFile(mbox) : '';
        sh.fs.mkdirp('/var/mail', { owner: 'root', group: 'mail', mode: 0o2775 });
        sh.writeFile(mbox, old + fmtMbox(sh, to, `${label || 'Cron'} <${user}@${sh.hostname || 'linux-school'}> ${job.cmd}`, out.replace(/\n$/, '')), false);
        const mn = sh.fs.lookup(mbox);
        mn.owner = to;
        mn.group = 'mail';
        mn.mode = 0o660;
      } finally {
        sh._eu = prevEu;
      }
    }
    return { st, out };
  }

  /* collect every scheduled cron job on the machine */
  function collectCron(sh) {
    const jobs = [];
    const add = (text, defaultUser, withUser, src) => {
      const env = {};
      text.split('\n').forEach((raw, i) => {
        const e = parseCronLine(raw, withUser);
        if (e.kind === 'env') env[e.k] = e.v;
        else if (e.kind === 'job') jobs.push({ spec: e.spec, user: withUser ? e.user : defaultUser, cmd: e.cmd, env: Object.assign({}, env), src, line: i + 1 });
      });
    };
    const ct = sh.fs.lookup('/etc/crontab');
    if (ct && ct.t === 'f') add(ct.content || '', 'root', true, '/etc/crontab');
    const cd = sh.fs.lookup('/etc/cron.d');
    if (cd && cd.kids) for (const k of Object.keys(cd.kids).sort()) if (/^[A-Za-z0-9_-]+$/.test(k) && cd.kids[k].t === 'f') add(cd.kids[k].content || '', 'root', true, '/etc/cron.d/' + k);
    const sp = sh.fs.lookup('/var/spool/cron/crontabs');
    if (sp && sp.kids) for (const k of Object.keys(sp.kids)) if (sh.users[k] && sp.kids[k].t === 'f') add(sp.kids[k].content || '', k, false, '/var/spool/cron/crontabs/' + k);
    return jobs;
  }

  /* ---------- run-parts ---------- */
  def('run-parts', async (c, args) => {
    const sh = c.sh;
    const dir = args.filter((a) => !a.startsWith('-')).pop();
    const test = args.includes('--test');
    const report = args.includes('--report');
    const d = dir && sh.fs.lookup(c.abs(dir));
    if (!d || d.t !== 'd') { c.err(`run-parts: ${dir || ''}: No such file or directory\n`); return 1; }
    let st = 0;
    for (const k of Object.keys(d.kids).sort()) {
      const n = d.kids[k];
      if (!/^[A-Za-z0-9_-]+$/.test(k) || n.t !== 'f' || !(n.mode & 0o111)) continue;
      if (test) { c.out(`${dir.replace(/\/$/, '')}/${k}\n`); continue; }
      let out = '';
      const r = await sh.runSource(`${dir.replace(/\/$/, '')}/${k}`, { stdin: '', stdout: (s) => { out += s; }, stderr: (s) => { out += s; }, tty: false });
      if (report && out) c.out(`${dir.replace(/\/$/, '')}/${k}:\n`);
      c.out(out);
      if (r) { c.err(`run-parts: ${dir.replace(/\/$/, '')}/${k} exited with return code ${r}\n`); st = 1; }
    }
    return st;
  });

  /* ---------- crontab ---------- */
  def('crontab', async (c, args) => {
    const sh = c.sh;
    let who = sh.eu();
    const rest = [];
    let mode = null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-u') who = args[++i];
      else if (a === '-l') mode = 'l';
      else if (a === '-r') mode = 'r';
      else if (a === '-e') mode = 'e';
      else if (a === '-i') continue;
      else if (a === '-') rest.push('-');
      else if (a.startsWith('-')) { c.err(`crontab: invalid option -- '${a.replace(/^-+/, '')}'\nusage: crontab [-u user] file\n       crontab [-u user] [-e | -l | -r]\n`); return 1; }
      else rest.push(a);
    }
    if (who !== sh.eu() && sh.eu() !== 'root') { c.err(`must be privileged to use -u\n`); return 1; }
    if (!sh.users[who]) { c.err(`crontab: user \`${who}' unknown\n`); return 1; }
    // access control
    const allow = sh.fs.lookup('/etc/cron.allow');
    const deny = sh.fs.lookup('/etc/cron.deny');
    const listed = (n) => (n.content || '').split('\n').map((x) => x.trim()).filter(Boolean);
    if (sh.eu() !== 'root' && ((allow && !listed(allow).includes(who)) || (!allow && deny && listed(deny).includes(who)))) {
      c.err(`You (${who}) are not allowed to use this program (crontab)\nSee crontab(1) for more information\n`);
      return 1;
    }
    const path = `/var/spool/cron/crontabs/${who}`;
    const n = sh.fs.lookup(path);
    const install = (text) => {
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const e = parseCronLine(lines[i], false);
        if (e.kind === 'err') return { ok: false, msg: `"${rest[0] || '-'}":${i + 1}: ${e.msg}\nerrors in crontab file, can't install.\n` };
      }
      sh.fs.mkdirp('/var/spool/cron/crontabs', { owner: 'root', group: 'crontab', mode: 0o1730 });
      sh.fs.put(path, text.endsWith('\n') || !text ? text : text + '\n', { owner: who, group: 'crontab', mode: 0o600 });
      sh.logEvent('cron.service', 6, `(${who}) REPLACE (${who})`, { ident: 'crontab', pid: sh.nextPid++ });
      return { ok: true };
    };
    if (mode === 'l') {
      if (!n) { c.err(`no crontab for ${who}\n`); return 1; }
      c.out(n.content);
      return 0;
    }
    if (mode === 'r') {
      if (!n) { c.err(`no crontab for ${who}\n`); return 1; }
      delete sh.fs.lookup('/var/spool/cron/crontabs').kids[who];
      return 0;
    }
    if (mode === 'e') {
      const header = '# Edit this file to introduce tasks to be run by cron.\n#\n# Each task to run has to be defined through a single line\n# indicating with different fields when the task will be run\n# and what command to run for the task\n#\n# To define the time you can provide concrete values for\n# minute (m), hour (h), day of month (dom), month (mon),\n# and day of week (dow) or use \'*\' in these fields (for \'any\').\n#\n# Notice that tasks will be started based on the cron\'s system\n# daemon\'s notion of time and timezones.\n#\n# Output of the crontab jobs (including errors) is sent through\n# email to the user the crontab file belongs to (unless redirected).\n#\n# For example, you can run a backup of all your user accounts\n# at 5 a.m every week with:\n# 0 5 * * 1 tar -zcf /var/backups/home.tgz /home/\n#\n# For more information see the manual pages of crontab(5) and cron(8)\n#\n# m h  dom mon dow   command\n';
      if (!sh.hooks.edit) { c.err('crontab: the editor only opens in the browser terminal. Use  crontab file  or  echo "..." | crontab -  instead.\n'); return 1; }
      if (!n) c.out('no crontab for ' + who + ' - using an empty one\n');
      let content = n ? n.content : header;
      for (;;) {
        const res = await sh.hooks.edit({ name: 'nano', path: '/tmp/crontab.' + Math.random().toString(36).slice(2, 8) + '/crontab', content, readonly: false });
        if (res === null || res === undefined) { c.out('No modification made\n'); return 0; }
        const r = install(res);
        if (r.ok) { c.out('crontab: installing new crontab\n'); return 0; }
        c.err(r.msg);
        content = res;
        const a = sh.hooks.readLine ? await sh.hooks.readLine('Do you want to retry the same edit? (y/n) ') : 'n';
        if (a === null || !/^y/i.test(a)) { c.err('crontab: edits left in /tmp/crontab.edit\n'); return 1; }
      }
    }
    // install from file or stdin
    if (rest.length || (c.stdin !== null && c.stdin !== undefined && c.stdin !== '')) {
      let text;
      if (rest[0] && rest[0] !== '-') {
        const fn = sh.fs.lookup(c.abs(rest[0]));
        if (!fn) { c.err(`${rest[0]}: No such file or directory\n`); return 1; }
        text = sh.readFile(c.abs(rest[0]));
      } else text = await c.slurp();
      const r = install(text);
      if (!r.ok) { c.err(r.msg); return 1; }
      return 0;
    }
    c.err('usage: crontab [-u user] file\n       crontab [-u user] [-e | -l | -r]\n                (default operation is replace, per 1003.2)\n\t-e\t(edit user\'s crontab)\n\t-l\t(list user\'s crontab)\n\t-r\t(delete user\'s crontab)\n\t-i\t(prompt before deleting user\'s crontab)\n');
    return 1;
  });

  /* ---------- at ---------- */
  function parseAtTime(spec, base) {
    let s = spec.trim().toLowerCase();
    const d = LX.zdate(base);
    let m;
    if ((m = /^now\s*(?:\+\s*(\d+)\s*(minute|min|hour|day|week|month)s?)?$/.exec(s))) {
      const n = m[1] ? +m[1] : 0;
      const mult = { minute: 60000, min: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000 }[m[2] || 'minute'];
      return base + n * mult;
    }
    let dayShift = null;
    s = s.replace(/\b(today|tomorrow)\b/, (x) => { dayShift = x === 'tomorrow' ? 1 : 0; return ''; }).trim();
    const wd = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/.exec(s);
    if (wd) { s = s.replace(wd[0], '').trim(); const target = DOW.indexOf(wd[1]); let diff = (target - d.getDay() + 7) % 7; if (diff === 0) diff = 7; dayShift = diff; }
    s = s.replace(/\bnext\s+(day)\b/, () => { dayShift = 1; return ''; }).trim();
    let h = null;
    let mi = 0;
    if (/^noon$/.test(s)) { h = 12; s = ''; } else if (/^midnight$/.test(s)) { h = 0; s = ''; if (dayShift === null) dayShift = 1; } else if (/^teatime$/.test(s)) { h = 16; s = ''; } else if ((m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(s))) {
      h = +m[1];
      mi = m[2] ? +m[2] : 0;
      if (m[3] === 'pm' && h < 12) h += 12;
      if (m[3] === 'am' && h === 12) h = 0;
      if (h > 23 || mi > 59) return null;
      s = '';
    } else if (s === '' && dayShift !== null) { h = d.getHours(); mi = d.getMinutes(); } else if ((m = /^(\d{1,2}):(\d{2})\s+(\d{4})-(\d{2})-(\d{2})$/.exec(s))) return LX.zmake(+m[3], +m[4] - 1, +m[5], +m[1], +m[2], 0);
    else return null;
    if (s !== '') return null;
    const t = LX.zmake(d.getFullYear(), d.getMonth(), d.getDate() + (dayShift || 0), h, mi, 0);
    if (t <= base && dayShift === null) return t + 86400000;
    return t;
  }
  const atState = (sh) => {
    sh.atJobs = sh.atJobs || [];
    sh.atSeq = sh.atSeq || sh.atJobs.reduce((m, j) => Math.max(m, j.id), 0);
    return sh;
  };
  def('at', async (c, args) => {
    const sh = atState(c.sh);
    if (args.includes('-l')) return await LX.cmds.atq.run(c, []);
    if (args.includes('-d')) return await LX.cmds.atrm.run(c, args.filter((a) => a !== '-d'));
    let file = null;
    const words = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-f') file = args[++i];
      else if (args[i] === '-m' || args[i] === '-q') { if (args[i] === '-q') i++; } else if (!args[i].startsWith('-')) words.push(args[i]);
    }
    const spec = words.join(' ');
    if (!spec) { c.err('Usage: at [-V] [-q x] [-f file] [-mMlbv] timespec ...\n       at [-V] [-q x] [-f file] [-mMlbv] -t time\n       at -c job ...\n       atq [-V] [-q x]\n       at [ -rd ] job ...\n       atrm [-V] job ...\n       batch\n'); return 1; }
    const t = parseAtTime(spec, nowMs());
    if (t === null) { c.err('Garbled time\n'); return 1; }
    let body;
    if (file) {
      const fn = sh.fs.lookup(c.abs(file));
      if (!fn) { c.err(`${file}: No such file or directory\n`); return 1; }
      body = sh.readFile(c.abs(file));
    } else if (c.stdin !== null && c.stdin !== undefined && c.stdin !== '') body = c.stdin;
    else if (sh.hooks.readLine) {
      c.err('warning: commands will be executed using /bin/sh\n');
      const lines = [];
      for (;;) {
        const l = await sh.hooks.readLine('at> ');
        sh.checkAbort();
        if (l === null || l === undefined) break;
        lines.push(l);
      }
      body = lines.join('\n');
      c.out('<EOT>\n');
    } else body = '';
    if (!body.trim()) { c.err('Garbled time\n'); return 1; }
    if (file || (c.stdin !== null && c.stdin !== undefined && c.stdin !== '')) c.err('warning: commands will be executed using /bin/sh\n');
    const id = ++sh.atSeq;
    sh.atJobs.push({ id, t, cmd: body.trim(), user: sh.eu(), cwd: sh.cwd });
    c.out(`job ${id} at ${U.strftime('%a %b %e %H:%M:%S %Y', new Date(t))}\n`);
    return 0;
  }, { pkg: 'at' });
  def('atq', async (c) => {
    const sh = atState(c.sh);
    sh.atJobs.filter((j) => sh.eu() === 'root' || j.user === sh.eu()).sort((a, b) => a.t - b.t).forEach((j) => c.out(`${j.id}\t${U.strftime('%a %b %e %H:%M:%S %Y', new Date(j.t))} a ${j.user}\n`));
    return 0;
  }, { pkg: 'at' });
  def('atrm', async (c, args) => {
    const sh = atState(c.sh);
    let st = 0;
    for (const a of args.filter((x) => !x.startsWith('-'))) {
      const j = sh.atJobs.find((x) => String(x.id) === a && (sh.eu() === 'root' || x.user === sh.eu()));
      if (!j) { c.err(`Cannot find jobid ${a}\n`); st = 1; continue; }
      sh.atJobs = sh.atJobs.filter((x) => x !== j);
    }
    return st;
  }, { pkg: 'at' });
  def('batch', async (c, args) => LX.cmds.at.run(c, ['now', ...args]), { pkg: 'at' });

  /* ---------- date ---------- */
  const NAMED = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const UNIT = { sec: 1000, second: 1000, min: 60000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000, fortnight: 1209600000 };
  function parseDateStr(str, base) {
    let s = String(str).trim().toLowerCase();
    if (!s || s === 'now') return base;
    let m;
    if ((m = /^@(-?\d+)$/.exec(s))) return +m[1] * 1000;
    // wall-clock state in the machine's zone
    const z = LX.zdate(base);
    const st = { y: z.getFullYear(), mo: z.getMonth(), d: z.getDate(), h: z.getHours(), mi: z.getMinutes(), s: z.getSeconds() };
    const toMs = () => LX.zmake(st.y, st.mo, st.d, st.h, st.mi, st.s);
    if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\s+(.*))?$/.exec(s))) {
      st.y = +m[1]; st.mo = +m[2] - 1; st.d = +m[3]; st.h = m[4] ? +m[4] : 0; st.mi = m[5] ? +m[5] : 0; st.s = m[6] ? +m[6] : 0;
      const t = toMs();
      return m[7] ? parseDateStr(m[7], t) : t;
    }
    const dow = () => LX.zdate(toMs()).getDay();
    const tokens = s.split(/\s+/);
    let i = 0;
    while (i < tokens.length) {
      const w = tokens[i];
      if (w === 'now') { i++; continue; }
      if (w === 'today' || w === 'midnight') { st.h = st.mi = st.s = 0; i++; continue; }
      if (w === 'noon') { st.h = 12; st.mi = st.s = 0; i++; continue; }
      if (w === 'tomorrow') { st.d += 1; i++; continue; }
      if (w === 'yesterday') { st.d -= 1; i++; continue; }
      if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(w))) { st.h = +m[1]; st.mi = +m[2]; st.s = m[3] ? +m[3] : 0; i++; continue; }
      if ((w === 'next' || w === 'last') && tokens[i + 1]) {
        const word = tokens[i + 1];
        const u = word.replace(/s$/, '');
        const dir = w === 'next' ? 1 : -1;
        if (NAMED[word] !== undefined || NAMED[u] !== undefined) {
          const target = NAMED[word] !== undefined ? NAMED[word] : NAMED[u];
          let diff = target - dow();
          diff = dir > 0 ? (diff <= 0 ? diff + 7 : diff) : (diff >= 0 ? diff - 7 : diff);
          st.d += diff;
          st.h = st.mi = st.s = 0;
        } else if (u === 'month') st.mo += dir;
        else if (u === 'year') st.y += dir;
        else if (UNIT[u]) { const t = toMs() + dir * UNIT[u]; const zz = LX.zdate(t); Object.assign(st, { y: zz.getFullYear(), mo: zz.getMonth(), d: zz.getDate(), h: zz.getHours(), mi: zz.getMinutes(), s: zz.getSeconds() }); } else return null;
        i += 2;
        continue;
      }
      if ((m = /^([+-]?\d+)$/.exec(w)) && tokens[i + 1]) {
        let n = +m[1];
        const u = tokens[i + 1].replace(/s$/, '');
        let k = i + 2;
        if (tokens[k] === 'ago') { n = -n; k++; }
        if (u === 'month') st.mo += n;
        else if (u === 'year') st.y += n;
        else if (u === 'day') st.d += n;
        else if (UNIT[u]) { const t = toMs() + n * UNIT[u]; const zz = LX.zdate(t); Object.assign(st, { y: zz.getFullYear(), mo: zz.getMonth(), d: zz.getDate(), h: zz.getHours(), mi: zz.getMinutes(), s: zz.getSeconds() }); } else return null;
        i = k;
        continue;
      }
      if (NAMED[w] !== undefined) { st.d += (NAMED[w] - dow() + 7) % 7; st.h = st.mi = st.s = 0; i++; continue; }
      const dd = new RealDate(tokens.slice(i).join(' '));
      if (!Number.isNaN(dd.getTime())) return dd.getTime();
      return null;
    }
    return toMs();
  }
  LX.parseDateStr = parseDateStr;
  def('date', async (c, args) => {
    const sh = c.sh;
    let fmt = null;
    let utc = false;
    let dstr = null;
    let ref = null;
    let setTo = null;
    let iso = null;
    let rfc = false;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.startsWith('+')) fmt = a.slice(1);
      else if (a === '-u' || a === '--utc' || a === '--universal') utc = true;
      else if (a === '-d' || a === '--date') dstr = args[++i];
      else if (a.startsWith('--date=')) dstr = a.slice(7);
      else if (a === '-r' || a === '--reference') ref = args[++i];
      else if (a === '-s' || a === '--set') setTo = args[++i];
      else if (a.startsWith('--set=')) setTo = a.slice(6);
      else if (a === '-I' || a === '--iso-8601') iso = 'date';
      else if (/^-I(date|hours|minutes|seconds|ns)$/.test(a)) iso = a.slice(2);
      else if (a.startsWith('--iso-8601=')) iso = a.slice(11);
      else if (a === '-R' || a === '--rfc-email') rfc = true;
      else if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) { c.err(`date: invalid option -- '${a.replace(/^-+/, '')}'\nTry 'date --help' for more information.\n`); return 1; }
      else if (/^\d{8,12}$/.test(a)) { c.err(`date: cannot set date: Operation not permitted\n`); return 1; }
    }
    const base = nowMs();
    if (setTo !== null) {
      if (sh.eu() !== 'root') { c.err(`date: cannot set date: Operation not permitted\n${U.strftime('%a %b %e %H:%M:%S %Z %Y', new Date(parseDateStr(setTo, base) || base))}\n`); return 1; }
      const t = parseDateStr(setTo, base);
      if (t === null) { c.err(`date: invalid date ‘${setTo}’\n`); return 1; }
      installClock();
      sh.timeOffset = t - realNow();
      LX.clock.offset = sh.timeOffset;
      c.out(U.strftime('%a %b %e %H:%M:%S %Z %Y', new Date(t)) + '\n');
      return 0;
    }
    let t = base;
    if (ref) { const n = sh.fs.lookup(c.abs(ref)); if (!n) { c.err(`date: ${ref}: No such file or directory\n`); return 1; } t = n.mtime; }
    if (dstr !== null) {
      const p = parseDateStr(dstr, base);
      if (p === null) { c.err(`date: invalid date ‘${dstr}’\n`); return 1; }
      t = p;
    }
    const d = new Date(t);
    let f = fmt;
    if (rfc) f = '%a, %d %b %Y %H:%M:%S %z';
    else if (iso) f = { date: '%F', hours: '%FT%H%:z', minutes: '%FT%H:%M%:z', seconds: '%FT%H:%M:%S%:z', ns: '%FT%H:%M:%S,%N%:z' }[iso] || '%F';
    if (f === null) f = '%a %b %e %H:%M:%S %Z %Y';
    f = f.replace(/%:z/g, () => { const z = U.strftime('%z', d, utc); return z.slice(0, 3) + ':' + z.slice(3); }).replace(/%N/g, '000000000').replace(/%P/g, () => (d.getHours() < 12 ? 'am' : 'pm')).replace(/%k/g, () => String(d.getHours()).padStart(2, ' ')).replace(/%l/g, () => String(d.getHours() % 12 || 12).padStart(2, ' ')).replace(/%w/g, () => String(d.getDay())).replace(/%u/g, () => String(d.getDay() || 7)).replace(/%C/g, () => String(Math.floor(d.getFullYear() / 100)));
    c.out(U.strftime(f, d, utc) + '\n');
    return 0;
  }, { builtin: false });

  /* ---------- mail (tiny reader for cron output) ---------- */
  def('mail', async (c, args) => {
    const sh = c.sh;
    const box = `/var/mail/${sh.eu()}`;
    const n = sh.fs.lookup(box);
    if (!n || !(n.content || '').trim()) { c.out('No mail for ' + sh.eu() + '\n'); return 1; }
    const msgs = (n.content || '').split(/^From /m).filter(Boolean);
    if (args.includes('-p') || args.includes('-P')) { msgs.forEach((m) => c.out('From ' + m + '\n')); return 0; }
    c.out(`"/var/mail/${sh.eu()}": ${msgs.length} message${msgs.length > 1 ? 's' : ''}\n`);
    msgs.forEach((m, i) => {
      const subj = (/^Subject: (.*)$/m.exec(m) || [, ''])[1];
      const fr = (/^From: (.*)$/m.exec(m) || [, 'root'])[1].split(' ')[0];
      c.out(`${i ? ' ' : '>'}N ${String(i + 1).padStart(2)} ${fr.padEnd(22)} ${U.strftime('%a %b %e %H:%M', new Date())}  ${String(m.split('\n').length).padStart(3)}/${String(m.length).padStart(4)} ${subj}\n`);
    });
    c.out('\x1b[2m(mail -p prints the messages. Plain  cat /var/mail/' + sh.eu() + '  works too.)\x1b[0m\n');
    return 0;
  });

  /* ---------- the time machine ---------- */
  const parseDur = (s) => {
    const m = /^(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|hour|d|day|w|week)s?$/i.exec(String(s).trim());
    if (!m) return null;
    return +m[1] * { s: 1000, sec: 1000, m: 60000, min: 60000, h: 3600000, hr: 3600000, hour: 3600000, d: 86400000, day: 86400000, w: 604800000, week: 604800000 }[m[2].toLowerCase()];
  };
  def('timewarp', async (c, args) => {
    const sh = c.sh;
    atState(sh);
    if (args.includes('--reset')) { sh.timeOffset = 0; LX.clock.offset = 0; c.out('Clock back to the real time.\n'); return 0; }
    const spec = args.filter((a) => !a.startsWith('-')).join(' ');
    if (!spec) {
      c.out('timewarp: the sandbox "time machine". (This is not a real Linux command.)\n\nReal servers just wait. Here you can jump the clock forward so that cron jobs, at jobs and\nsystemd timers actually fire:\n\n  timewarp 5m        jump 5 minutes\n  timewarp 2h        jump 2 hours\n  timewarp 1d        jump a day (max 31 days at once)\n  timewarp --reset   back to the real time\n');
      return 0;
    }
    let dur = parseDur(spec);
    if (dur === null) {
      const t = parseDateStr(spec, nowMs());
      dur = t === null ? null : t - nowMs();
    }
    if (dur === null || dur <= 0) { c.err(`timewarp: I do not understand '${spec}'. Try  timewarp 10m  or  timewarp 2h .\n`); return 1; }
    if (dur > 31 * 86400000) { c.err('timewarp: please jump at most 31 days at a time.\n'); return 1; }
    installClock();
    const start = nowMs();
    const end = start + dur;
    const cronUp = !!(sh.services.cron && sh.services.cron.active);
    const atUp = !!(sh.services.atd && sh.services.atd.active);
    const jobs = collectCron(sh);
    const fired = [];
    const timers = Object.entries(sh.timers || {}).filter(([, o]) => o.active);
    // remember the next elapse of each timer at the start
    setClock(start);
    for (const [, o] of timers) o._nx = LX.timerNext(sh, o);
    let cronSkipped = 0;
    c.out(`\x1b[2m[sandbox time machine] jumping ${dur >= 86400000 ? (dur / 86400000).toFixed(dur % 86400000 ? 1 : 0) + ' day(s)' : dur >= 3600000 ? (dur / 3600000).toFixed(dur % 3600000 ? 1 : 0) + ' hour(s)' : Math.round(dur / 60000) + ' minute(s)'} forward: ${U.strftime('%a %H:%M', new Date(start))} → ${U.strftime('%a %b %e %H:%M', new Date(end))}\x1b[0m\n`);
    const firstMinute = Math.floor(start / 60000) * 60000 + 60000;
    for (let m = firstMinute; m <= end; m += 60000) {
      sh.checkAbort();
      setClock(m);
      sh.timeOffset = LX.clock.offset;
      const dt = new RealDate(m);
      const zd = LX.zdate(m);
      for (const j of jobs) {
        if (!due(j.spec, zd)) continue;
        if (!cronUp) { cronSkipped++; continue; }
        const r = await runJob(sh, j, 'Cron');
        fired.push(`${U.strftime('%H:%M', dt)}  cron   ${j.user.padEnd(8)} ${j.cmd.length > 52 ? j.cmd.slice(0, 51) + '…' : j.cmd}${r.st ? `  \x1b[31m(exit ${r.st})\x1b[0m` : ''}`);
      }
      for (const aj of sh.atJobs.slice()) {
        if (aj.t > m) continue;
        sh.atJobs = sh.atJobs.filter((x) => x !== aj);
        if (!atUp) { fired.push(`${U.strftime('%H:%M', dt)}  at     job ${aj.id} skipped: atd is not running`); continue; }
        const r = await runJob(sh, { user: aj.user, cmd: aj.cmd, cwd: aj.cwd, env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' } }, 'Output from your job ' + String(aj.id).padStart(8));
        fired.push(`${U.strftime('%H:%M', dt)}  at     job ${aj.id} (${aj.user})  ${aj.cmd.split('\n')[0].slice(0, 44)}`);
      }
      for (const [name, o] of timers) {
        if (!o.active || !o._nx || o._nx > m) continue;
        const svc = ((o.ini && o.ini.Timer && o.ini.Timer.Unit) || name.replace(/\.timer$/, '.service')).replace(/\.service$/, '');
        o.last = m;
        sh.logEvent('systemd', 6, `Starting ${svc}.service...`, { ident: 'systemd', pid: 1 });
        let ok = true;
        if (sh.services[svc] || sh.loadUnit(svc)) {
          const r = await sh.startService(svc);
          ok = !r || r.ok !== false;
        } else ok = false;
        o._nx = LX.timerNext(sh, o);
        if (!BUILTIN_TIMERS.has(name)) fired.push(`${U.strftime('%H:%M', dt)}  timer  ${name} → ${svc}.service${ok ? '' : '  \x1b[31m(failed)\x1b[0m'}`);
      }
      if (fired.length > 300) break;
    }
    setClock(end);
    sh.timeOffset = LX.clock.offset;
    if (fired.length) fired.slice(0, 60).forEach((l) => c.out('  ' + l + '\n'));
    else c.out('  (nothing was scheduled in that time)\n');
    if (fired.length > 60) c.out(`  ... and ${fired.length - 60} more\n`);
    if (cronSkipped) c.out(`\x1b[33m  cron is not running, so ${cronSkipped} job run(s) were skipped. Start it with: sudo systemctl start cron\x1b[0m\n`);
    c.out(`\x1b[2m  The clock now says: ${U.strftime('%a %b %e %H:%M:%S %Z %Y', new Date(end))}\x1b[0m\n`);
    return 0;
  });
  const BUILTIN_TIMERS = new Set(['logrotate.timer', 'apt-daily.timer', 'fstrim.timer', 'man-db.timer', 'apt-daily-upgrade.timer', 'systemd-tmpfiles-clean.timer']);

  /* sensible defaults on a fresh machine */
  LX.initHooks.push((sh) => {
    sh.timeOffset = 0;
    sh.atJobs = [];
    const prior = sh.onInstall;
    sh.onInstall = (p, meta) => {
      if (p === 'at' && sh.services.at) { sh.services.atd = sh.services.at; delete sh.services.at; sh.services.atd.proc = 'atd'; }
      if (prior) prior.call(sh, p, meta);
    };
    sh.fs.mkdirp('/var/mail', { owner: 'root', group: 'mail', mode: 0o2775 });
    sh.fs.mkdirp('/etc/ssl/certs', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/etc/ssl/private', { owner: 'root', group: 'root', mode: 0o710 });
    sh.fs.mkdirp('/usr/local/share/ca-certificates', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/crontab', '# /etc/crontab: system-wide crontab\n# Unlike any other crontab you don\'t have to run the `crontab\'\n# command to install the new version when you edit this file\n# and files in /etc/cron.d. These files also have username fields,\n# that none of the other crontabs do.\n\nSHELL=/bin/sh\n\n# Example of job definition:\n# .---------------- minute (0 - 59)\n# |  .------------- hour (0 - 23)\n# |  |  .---------- day of month (1 - 31)\n# |  |  |  .------- month (1 - 12) OR jan,feb,mar,apr ...\n# |  |  |  |  .---- day of week (0 - 6) (Sunday=0 or 7) OR sun,mon,tue,wed,thu,fri,sat\n# |  |  |  |  |\n# *  *  *  *  * user-name command to be executed\n17 *\t* * *\troot    cd / && run-parts --report /etc/cron.hourly\n25 6\t* * *\troot\ttest -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.daily; }\n47 6\t* * 7\troot\ttest -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.weekly; }\n52 6\t1 * *\troot\ttest -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.monthly; }\n#\n', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/rsyslog.conf', '# /etc/rsyslog.conf configuration file for rsyslog\n#\n# For more information install rsyslog-doc and see\n# /usr/share/doc/rsyslog-doc/html/configuration/index.html\n\nmodule(load="imuxsock") # provides support for local system logging\nmodule(load="imklog" permitnonkernelfacility="on")\n\n$ActionFileDefaultTemplate RSYSLOG_TraditionalFileFormat\n$RepeatedMsgReduction on\n$FileOwner syslog\n$FileGroup adm\n$FileCreateMode 0640\n$DirCreateMode 0755\n$Umask 0022\n$PrivDropToUser syslog\n$PrivDropToGroup syslog\n$WorkDirectory /var/spool/rsyslog\n$IncludeConfig /etc/rsyslog.d/*.conf\n', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/etc/rsyslog.d', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/rsyslog.d/50-default.conf', '# Default rules for rsyslog.\n#\n#                       For more information see rsyslog.conf(5) and /etc/rsyslog.conf\n\n#\n# First some standard log files.  Log by facility.\n#\nauth,authpriv.*\t\t\t/var/log/auth.log\n*.*;auth,authpriv.none\t\t-/var/log/syslog\nkern.*\t\t\t\t-/var/log/kern.log\nmail.*\t\t\t\t-/var/log/mail.log\n\n#\n# Emergencies are sent to everybody logged in.\n#\n*.emerg\t\t\t\t:omusrmsg:*\n', { owner: 'root', group: 'root' });
  });
})();
