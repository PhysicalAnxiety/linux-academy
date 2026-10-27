/* Linux Academy: a small MariaDB / MySQL: service, mysql client (interactive, -e, scripts), users and grants, mysqldump and restore, mysqladmin */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS } = LX;
  const U = LX.U;
  const P = LX.Shell.prototype;
  const needRoot = (c, msg) => {
    if (c.sh.eu() === 'root') return false;
    c.err(msg);
    return true;
  };

  const FLAVORS = {
    mariadb: { svc: 'mariadb', daemon: 'mariadbd', banner: 'MariaDB', version: '10.11.8-MariaDB-0ubuntu0.24.04.1', cnf: '/etc/mysql/mariadb.conf.d/50-server.cnf', aa: 'usr.sbin.mariadbd', exe: '/usr/sbin/mariadbd', prompt: 'MariaDB' },
    mysql: { svc: 'mysql', daemon: 'mysqld', banner: 'MySQL', version: '8.0.39-0ubuntu0.24.04.2', cnf: '/etc/mysql/mysql.conf.d/mysqld.cnf', aa: 'usr.sbin.mysqld', exe: '/usr/sbin/mysqld', prompt: 'mysql' },
  };
  const CLIENT_BINS = ['mysql', 'mysqldump', 'mysqladmin'];
  LX.PKGS['mariadb-server'] = { ver: '1:10.11.8-0ubuntu0.24.04.1', desc: 'MariaDB database server binaries', size: 5800, bins: CLIENT_BINS.concat(['mariadb', 'mariadb-dump']), service: { desc: 'MariaDB 10.11.8 database server', proc: 'mariadbd', name: 'mariadb' }, flavor: 'mariadb' };
  LX.PKGS['mysql-server'] = { ver: '8.0.39-0ubuntu0.24.04.2', desc: 'MySQL database server (metapackage depending on the latest version)', size: 6100, bins: CLIENT_BINS, service: { desc: 'MySQL Community Server', proc: 'mysqld', name: 'mysql' }, flavor: 'mysql' };
  LX.PKGS['mariadb-client'] = { ver: '1:10.11.8-0ubuntu0.24.04.1', desc: 'MariaDB database client binaries', size: 1900, bins: CLIENT_BINS.concat(['mariadb', 'mariadb-dump']) };
  LX.PKGS['mysql-client'] = { ver: '8.0.39-0ubuntu0.24.04.2', desc: 'MySQL database client binaries', size: 1500, bins: CLIENT_BINS };

  /* ---------- state ---------- */
  const SYSTEM_DBS = ['information_schema', 'mysql', 'performance_schema', 'sys'];
  const dbState = (sh) => {
    if (!sh.db) {
      sh.db = { dbs: {}, users: [{ user: 'root', host: 'localhost', pw: null, auth: 'socket', grants: [{ priv: 'ALL PRIVILEGES', db: '*', grant: true }] }], conn: 30, up: Date.now(), q: 0, flavor: 'mariadb' };
      for (const d of SYSTEM_DBS) sh.db.dbs[d] = { tables: {} };
    }
    return sh.db;
  };
  const flavorOf = (sh) => FLAVORS[dbState(sh).flavor];
  const syncDisk = (sh) => {
    const st = dbState(sh);
    const dd = datadirOf(sh);
    if (!sh.fs.lookup(dd)) return;
    for (const [name, d] of Object.entries(st.dbs)) {
      if (SYSTEM_DBS.includes(name)) continue;
      sh.fs.mkdirp(`${dd}/${name}`, { owner: 'mysql', group: 'mysql', mode: 0o750 });
      const dn = sh.fs.lookup(`${dd}/${name}`);
      dn.kids = {};
      for (const t of Object.keys(d.tables)) dn.kids[t + '.ibd'] = sh.fs.mk('f', { owner: 'mysql', group: 'mysql', mode: 0o640, size: 114688 });
    }
    const root = sh.fs.lookup(dd);
    for (const k of Object.keys(root.kids)) if (root.kids[k].t === 'd' && !SYSTEM_DBS.includes(k) && !['#innodb_redo', '#innodb_temp'].includes(k) && !st.dbs[k]) delete root.kids[k];
  };
  const readCnf = (sh) => {
    const fl = flavorOf(sh);
    const cfg = { datadir: '/var/lib/mysql', 'bind-address': '127.0.0.1', port: '3306' };
    const files = [];
    const walk = (dir) => {
      const d = sh.fs.lookup(dir);
      if (!d || d.t !== 'd') return;
      for (const k of Object.keys(d.kids).sort()) {
        const n = d.kids[k];
        if (n.t === 'd') walk(dir + '/' + k);
        else if (/\.cnf$/.test(k) || k === 'my.cnf') files.push(dir + '/' + k);
      }
    };
    walk('/etc/mysql');
    for (const f of files) {
      let sect = '';
      for (const l of ((sh.fs.lookup(f) || {}).content || '').split('\n')) {
        const t = l.replace(/[#;].*$/, '').trim();
        const sm = /^\[(.+)\]$/.exec(t);
        if (sm) { sect = sm[1]; continue; }
        const m = /^([\w-]+)\s*=\s*(.*)$/.exec(t);
        if (m && ['mysqld', 'server', 'mariadbd', 'mariadb'].includes(sect)) cfg[m[1].replace(/_/g, '-')] = m[2].trim();
      }
    }
    return cfg;
  };
  const datadirOf = (sh) => readCnf(sh).datadir || '/var/lib/mysql';
  const isUp = (sh) => {
    const fl = flavorOf(sh);
    const s = sh.services[fl.svc];
    return !!(s && s.active);
  };

  /* ---------- install / service ---------- */
  const startHook = (sh) => async (c, action) => {
    const fl = flavorOf(sh);
    if (action === 'stop') {
      delete sh.listeners[3306];
      return { ok: true };
    }
    const cfg = readCnf(sh);
    const dd = cfg.datadir;
    const dn = sh.fs.lookup(dd);
    const fail = (msg) => {
      sh.logEvent(`${fl.svc}.service`, 3, msg, { ident: fl.daemon, pid: 1100 });
      if (c && c.err) c.err('');
      return { ok: false, code: 1 };
    };
    if (!dn || dn.t !== 'd') {
      sh.logEvent(`${fl.svc}.service`, 3, `[ERROR] InnoDB: Operating system error number 2 in a file operation. The error means the system cannot find the path specified: ${dd}`, { ident: fl.daemon, pid: 1100 });
      sh.logEvent(`${fl.svc}.service`, 3, `[ERROR] Can't create/write to file '${dd}/ibdata1' (Errcode: 2 "No such file or directory")`, { ident: fl.daemon, pid: 1100 });
      return { ok: false, code: 1 };
    }
    if (dd !== '/var/lib/mysql' && LX.aaCheck) {
      const chk = LX.aaCheck(sh, fl.exe, dd + '/ibdata1', 'rw');
      if (chk.profile && chk.wouldDeny) {
        LX.aaLog(sh, c || { out() {} }, chk.profile, dd + '/ibdata1', 'rw', fl.daemon);
        if (chk.mode === 'enforce') {
          sh.logEvent(`${fl.svc}.service`, 3, `[ERROR] mariadbd: Can't create/write to file '${dd}/ibdata1' (Errcode: 13 "Permission denied")`, { ident: fl.daemon, pid: 1100 });
          sh.logEvent(`${fl.svc}.service`, 3, '[ERROR] InnoDB: Cannot open datafile ./ibdata1', { ident: fl.daemon, pid: 1100 });
          return { ok: false, code: 1 };
        }
      }
    }
    if (dn.owner !== 'mysql') {
      sh.logEvent(`${fl.svc}.service`, 3, `[ERROR] mariadbd: Can't create/write to file '${dd}/ibdata1' (Errcode: 13 "Permission denied")`, { ident: fl.daemon, pid: 1100 });
      return { ok: false, code: 1 };
    }
    const ex = sh.listeners[3306];
    if (ex && ex.proc !== fl.daemon) {
      sh.logEvent(`${fl.svc}.service`, 3, "[ERROR] Can't start server: Bind on TCP/IP port. Got error: 98: Address already in use", { ident: fl.daemon, pid: 1100 });
      return { ok: false, code: 1 };
    }
    sh.listeners[3306] = { proto: 'tcp', proc: fl.daemon, pid: 1100, user: 'mysql', addr: cfg['bind-address'] === '0.0.0.0' || cfg['bind-address'] === '*' ? '0.0.0.0' : cfg['bind-address'], handler: async () => ({ status: 200, headers: {}, body: '\u0005\u0000\u0000\u0000\n' + fl.version + '\u0000' }) };
    syncDisk(sh);
    sh.logEvent(`${fl.svc}.service`, 6, `[Note] ${fl.daemon}: ready for connections. Version: '${fl.version}'  socket: '/run/mysqld/mysqld.sock'  port: ${cfg.port}`, { ident: fl.daemon, pid: 1100 });
    return { ok: true };
  };
  const origOnInstall = P.onInstall;
  P.onInstall = function (p, pk) {
    origOnInstall.call(this, p, pk);
    if (p === 'mariadb-server' || p === 'mysql-server') {
      const st = dbState(this);
      st.flavor = pk.flavor;
      const fl = FLAVORS[pk.flavor];
      this.fs.mkdirp('/etc/mysql/conf.d', { owner: 'root', group: 'root' });
      this.fs.mkdirp(fl.cnf.replace(/\/[^/]+$/, ''), { owner: 'root', group: 'root' });
      this.fs.put(fl.cnf, `#\n# These groups are read by MariaDB server.\n# Use it for options that only the server (but not clients) should see\n\n[mysqld]\n\nuser                    = mysql\npid-file                = /run/mysqld/mysqld.pid\nbasedir                 = /usr\ndatadir                 = /var/lib/mysql\ntmpdir                  = /tmp\nbind-address            = 127.0.0.1\n`, { owner: 'root', group: 'root' });
      this.fs.mkdirp('/var/lib/mysql', { owner: 'mysql', group: 'mysql', mode: 0o755 });
      for (const f of ['ibdata1', 'ib_logfile0', 'aria_log.00000001']) this.fs.put('/var/lib/mysql/' + f, '', { owner: 'mysql', group: 'mysql', mode: 0o660, size: 12582912 });
      for (const d of ['mysql', 'performance_schema', 'sys']) this.fs.mkdirp('/var/lib/mysql/' + d, { owner: 'mysql', group: 'mysql', mode: 0o750 });
      this.fs.mkdirp('/run/mysqld', { owner: 'mysql', group: 'mysql', mode: 0o755 });
      this.fs.mkdirp('/var/log/mysql', { owner: 'mysql', group: 'adm', mode: 0o750 });
      this.serviceHooks = this.serviceHooks || {};
      this.serviceHooks[fl.svc] = startHook(this);
      // AppArmor profile that confines the daemon
      if (this.aa) {
        this.fs.put(`/etc/apparmor.d/${fl.aa}`, `#include <tunables/global>\n\n/usr/sbin/${fl.daemon} {\n  #include <abstractions/base>\n  capability dac_override,\n  capability setgid,\n  capability setuid,\n  /etc/mysql/** r,\n  /var/lib/mysql/ r,\n  /var/lib/mysql/** rwk,\n  /run/mysqld/** rw,\n  /var/log/mysql/** rw,\n  /tmp/** rw,\n  /usr/sbin/${fl.daemon} mr,\n\n  #include if exists <local/${fl.aa}>\n}\n`, { owner: 'root', group: 'root' });
        this.fs.put(`/etc/apparmor.d/local/${fl.aa}`, `# Site-specific additions and overrides for ${fl.aa}.\n`, { owner: 'root', group: 'root' });
        if (LX.aaReloadSh) LX.aaReloadSh(this);
      }
      delete this.services[p];
      const sv = this.services[fl.svc];
      if (sv) { sv.active = true; sv.enabled = true; sv.pid = 1100; sv.since = Date.now(); }
      syncDisk(this);
      this.serviceHooks[fl.svc](null, 'start');
    }
  };
  const origRemove = P.onRemove;
  P.onRemove = function (p) {
    if (origRemove) origRemove.call(this, p);
    if (p === 'mariadb-server' || p === 'mysql-server') {
      delete this.listeners[3306];
      delete this.services[FLAVORS[LX.PKGS[p].flavor].svc];
    }
  };

  /* ---------- SQL engine ---------- */
  class SqlErr extends Error {
    constructor(code, state, msg) {
      super(msg);
      this.code = code;
      this.state = state;
    }
  }
  const clean = (s) => s.replace(/`/g, '').trim();
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '').replace(/^\s*#.*$/gm, '');
  const splitStatements = (text) => {
    const out = [];
    let cur = '';
    let q = null;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        cur += ch;
        if (ch === '\\' && q !== '`') { cur += text[++i] || ''; continue; }
        if (ch === q) {
          if (text[i + 1] === q) { cur += text[++i]; continue; }
          q = null;
        }
      } else if (ch === "'" || ch === '"' || ch === '`') {
        q = ch;
        cur += ch;
      } else if (ch === ';') {
        if (cur.trim()) out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const splitTop = (s, sep) => {
    const out = [];
    let depth = 0;
    let q = null;
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        cur += ch;
        if (ch === '\\') { cur += s[++i] || ''; continue; }
        if (ch === q) q = null;
      } else if (ch === "'" || ch === '"' || ch === '`') { q = ch; cur += ch; }
      else if (ch === '(') { depth++; cur += ch; }
      else if (ch === ')') { depth--; cur += ch; }
      else if (ch === sep && depth === 0) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    if (cur.trim() || out.length) out.push(cur.trim());
    return out;
  };
  const unq = (v) => {
    const m = /^(['"])([\s\S]*)\1$/.exec(v);
    if (!m) return null;
    return m[2].replace(/\\(.)/g, (x, ch) => ({ n: '\n', t: '\t', r: '\r', 0: '\0' }[ch] || ch)).replace(new RegExp(m[1] + m[1], 'g'), m[1]);
  };
  const evalValue = (ctx, v, row, cols) => {
    v = v.trim();
    if (/^null$/i.test(v)) return null;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    const s = unq(v);
    if (s !== null) return s;
    if (/^now\(\)$|^current_timestamp(\(\))?$/i.test(v)) return U.strftime('%F %T', new Date());
    if (/^curdate\(\)$|^current_date(\(\))?$/i.test(v)) return U.strftime('%F', new Date());
    if (/^version\(\)$/i.test(v)) return flavorOf(ctx.sh).version;
    if (/^database\(\)$/i.test(v)) return ctx.db || null;
    if (/^(user|current_user|session_user)\(\)$/i.test(v)) return `${ctx.user}@${ctx.host}`;
    if (/^connection_id\(\)$/i.test(v)) return 31;
    if (/^true$/i.test(v)) return 1;
    if (/^false$/i.test(v)) return 0;
    const col = clean(v);
    if (cols && cols.indexOf(col) >= 0) return row[cols.indexOf(col)];
    const arith = /^(.+?)\s*([+\-*/])\s*(.+)$/.exec(v);
    if (arith) {
      const a = evalValue(ctx, arith[1], row, cols);
      const b = evalValue(ctx, arith[3], row, cols);
      if (typeof a === 'number' && typeof b === 'number') return arith[2] === '+' ? a + b : arith[2] === '-' ? a - b : arith[2] === '*' ? a * b : b ? a / b : null;
    }
    const fn = /^(\w+)\((.*)\)$/.exec(v);
    if (fn) {
      const a = fn[2] ? evalValue(ctx, fn[2], row, cols) : null;
      const f = fn[1].toLowerCase();
      if (f === 'upper' || f === 'ucase') return String(a).toUpperCase();
      if (f === 'lower' || f === 'lcase') return String(a).toLowerCase();
      if (f === 'length') return String(a).length;
      if (f === 'md5') return 'd41d8cd98f00b204e9800998ecf8427e';
    }
    throw new SqlErr(1054, '42S22', `Unknown column '${clean(v)}' in 'field list'`);
  };
  const cmpVals = (a, b) => (a === null || b === null ? null : typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }));
  const likeRe = (p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
  const condition = (ctx, expr, row, cols) => {
    expr = expr.trim();
    const ors = splitKeyword(expr, 'or');
    if (ors.length > 1) return ors.some((x) => condition(ctx, x, row, cols));
    const ands = splitKeyword(expr, 'and');
    if (ands.length > 1) return ands.every((x) => condition(ctx, x, row, cols));
    if (/^\(.*\)$/.test(expr)) return condition(ctx, expr.slice(1, -1), row, cols);
    let m;
    if ((m = /^(.+?)\s+is\s+not\s+null$/i.exec(expr))) return evalValue(ctx, m[1], row, cols) !== null;
    if ((m = /^(.+?)\s+is\s+null$/i.exec(expr))) return evalValue(ctx, m[1], row, cols) === null;
    if ((m = /^(.+?)\s+(not\s+)?in\s*\((.*)\)$/i.exec(expr))) {
      const v = evalValue(ctx, m[1], row, cols);
      const hit = splitTop(m[3], ',').some((x) => cmpVals(v, evalValue(ctx, x, row, cols)) === 0);
      return m[2] ? !hit : hit;
    }
    if ((m = /^(.+?)\s+(not\s+)?like\s+(.+)$/i.exec(expr))) {
      const v = evalValue(ctx, m[1], row, cols);
      const hit = v !== null && likeRe(String(evalValue(ctx, m[3], row, cols))).test(String(v));
      return m[2] ? !hit : hit;
    }
    if ((m = /^(.+?)\s*(<=|>=|<>|!=|=|<|>)\s*(.+)$/.exec(expr))) {
      const c = cmpVals(evalValue(ctx, m[1], row, cols), evalValue(ctx, m[3], row, cols));
      if (c === null) return false;
      return { '=': c === 0, '!=': c !== 0, '<>': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 }[m[2]];
    }
    throw new SqlErr(1064, '42000', `You have an error in your SQL syntax; check the manual that corresponds to your ${flavorOf(ctx.sh).banner} server version for the right syntax to use near '${expr}' at line 1`);
  };
  function splitKeyword(s, kw) {
    const out = [];
    let cur = '';
    let q = null;
    let depth = 0;
    const re = new RegExp('^\\s' + kw + '\\s', 'i');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { cur += ch; if (ch === '\\') cur += s[++i] || ''; else if (ch === q) q = null; continue; }
      if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth === 0 && re.test(s.slice(i - 1, i + kw.length + 2))) {
        out.push(cur);
        cur = '';
        i += kw.length;
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.length > 1 ? out : [s];
  }
  const typeKind = (t) => (/int|decimal|numeric|float|double|bool/i.test(t) ? 'num' : 'str');
  const fmtType = (t) => (/^int$/i.test(t) ? 'int(11)' : /^bigint$/i.test(t) ? 'bigint(20)' : /^tinyint$/i.test(t) ? 'tinyint(4)' : t.toLowerCase());
  const tableOf = (ctx, name, create) => {
    const parts = clean(name).split('.');
    const dbn = parts.length > 1 ? parts[0] : ctx.db;
    const tn = parts[parts.length - 1];
    if (!dbn) throw new SqlErr(1046, '3D000', 'No database selected');
    const d = dbState(ctx.sh).dbs[dbn];
    if (!d) throw new SqlErr(1049, '42000', `Unknown database '${dbn}'`);
    if (dbn === 'mysql' && tn === 'user') return { virtual: 'user', db: dbn, name: tn };
    if (!d.tables[tn] && !create) throw new SqlErr(1146, '42S02', `Table '${dbn}.${tn}' doesn't exist`);
    return { d, db: dbn, name: tn, t: d.tables[tn] };
  };
  const allowed = (ctx, dbn, priv) => {
    const st = dbState(ctx.sh);
    const u = st.users.find((x) => x.user === ctx.user && (x.host === ctx.hostMatch));
    if (!u) return false;
    return u.grants.some((g) => (g.db === '*' || g.db === dbn) && (/^ALL/i.test(g.priv) || g.priv.split(',').map((x) => x.trim().toUpperCase()).includes(priv)));
  };
  const needPriv = (ctx, dbn, priv) => {
    if (SYSTEM_DBS.includes(dbn) && ctx.user !== 'root' && dbn !== 'information_schema') throw new SqlErr(1044, '42000', `Access denied for user '${ctx.user}'@'${ctx.host}' to database '${dbn}'`);
    if (!allowed(ctx, dbn, priv)) throw new SqlErr(1044, '42000', `Access denied for user '${ctx.user}'@'${ctx.host}' to database '${dbn}'`);
  };
  const result = (cols, rows) => ({ kind: 'rows', cols, rows });
  const ok = (msg) => ({ kind: 'ok', msg });
  const showTable = (cols, rows, tty) => {
    if (!tty) return [cols.join('\t')].concat(rows.map((r) => r.map((v) => (v === null ? 'NULL' : String(v))).join('\t'))).join('\n') + '\n';
    const cells = rows.map((r) => r.map((v) => (v === null ? 'NULL' : String(v))));
    const w = cols.map((c, i) => Math.max(c.length, ...cells.map((r) => r[i].length)));
    const numeric = cols.map((c, i) => rows.length && rows.every((r) => typeof r[i] === 'number' || r[i] === null));
    const line = '+' + w.map((x) => '-'.repeat(x + 2)).join('+') + '+\n';
    const fmtRow = (r, head) => '| ' + r.map((v, i) => (!head && numeric[i] ? v.padStart(w[i]) : v.padEnd(w[i]))).join(' | ') + ' |\n';
    return line + fmtRow(cols, true) + line + cells.map((r) => fmtRow(r, false)).join('') + line;
  };
  const createSql = (name, t) => {
    const cols = t.cols.map((c) => `  \`${c.name}\` ${fmtType(c.type)}${c.notnull || c.key === 'PRI' ? ' NOT NULL' : ' DEFAULT NULL'}${c.auto ? ' AUTO_INCREMENT' : ''}${c.def !== undefined && c.def !== null && !c.notnull && !c.key ? '' : ''}`);
    const pk = t.cols.filter((c) => c.key === 'PRI');
    const body = cols.concat(pk.length ? [`  PRIMARY KEY (${pk.map((c) => '`' + c.name + '`').join(',')})`] : []).join(',\n');
    return `CREATE TABLE \`${name}\` (\n${body}\n) ENGINE=InnoDB${t.ai > 1 ? ' AUTO_INCREMENT=' + t.ai : ''} DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`;
  };
  const sqlLit = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'");

  function exec(ctx, stmt) {
    const sh = ctx.sh;
    const st = dbState(sh);
    st.q++;
    let s = stmt.trim().replace(/\s+/g, (m) => (m.includes('\n') ? ' ' : m));
    let m;
    const low = s.toLowerCase();
    if (/^(lock|unlock)\s+tables?/i.test(s) || /^set\s+/i.test(s) && !/^set\s+password/i.test(s) || /^flush\s/i.test(s) || /^commit$|^start transaction|^begin$/i.test(s)) return ok('Query OK, 0 rows affected');
    if ((m = /^use\s+(\S+)$/i.exec(s))) {
      const n = clean(m[1]);
      if (!st.dbs[n]) throw new SqlErr(1049, '42000', `Unknown database '${n}'`);
      needPriv(ctx, n, 'SELECT');
      ctx.db = n;
      return { kind: 'msg', msg: 'Database changed' };
    }
    if (/^show\s+databases$/i.test(s) || /^show\s+schemas$/i.test(s)) {
      const names = Object.keys(st.dbs).filter((n) => ctx.user === 'root' || allowed(ctx, n, 'SELECT') || n === 'information_schema').sort();
      return result(['Database'], names.map((n) => [n]));
    }
    if ((m = /^create\s+(database|schema)\s+(if\s+not\s+exists\s+)?(\S+?)(\s+.*)?$/i.exec(s))) {
      const n = clean(m[3]);
      if (ctx.user !== 'root' && !allowed(ctx, n, 'CREATE')) throw new SqlErr(1044, '42000', `Access denied for user '${ctx.user}'@'${ctx.host}' to database '${n}'`);
      if (st.dbs[n]) {
        if (m[2]) return ok('Query OK, 0 rows affected, 1 warning');
        throw new SqlErr(1007, 'HY000', `Can't create database '${n}'; database exists`);
      }
      st.dbs[n] = { tables: {} };
      syncDisk(sh);
      return ok('Query OK, 1 row affected');
    }
    if ((m = /^drop\s+(database|schema)\s+(if\s+exists\s+)?(\S+)$/i.exec(s))) {
      const n = clean(m[3]);
      if (!st.dbs[n]) {
        if (m[2]) return ok('Query OK, 0 rows affected, 1 warning');
        throw new SqlErr(1008, 'HY000', `Can't drop database '${n}'; database doesn't exist`);
      }
      if (ctx.user !== 'root' && !allowed(ctx, n, 'DROP')) throw new SqlErr(1044, '42000', `Access denied for user '${ctx.user}'@'${ctx.host}' to database '${n}'`);
      if (SYSTEM_DBS.includes(n)) throw new SqlErr(1044, '42000', `Access denied for user '${ctx.user}'@'${ctx.host}' to database '${n}'`);
      const nt = Object.keys(st.dbs[n].tables).length;
      delete st.dbs[n];
      if (ctx.db === n) ctx.db = null;
      syncDisk(sh);
      return ok(`Query OK, ${nt} rows affected`);
    }
    if (/^show\s+tables$/i.test(s) || (m = /^show\s+tables\s+(?:from|in)\s+(\S+)$/i.exec(s))) {
      const dbn = m ? clean(m[1]) : ctx.db;
      if (!dbn) throw new SqlErr(1046, '3D000', 'No database selected');
      if (!st.dbs[dbn]) throw new SqlErr(1049, '42000', `Unknown database '${dbn}'`);
      needPriv(ctx, dbn, 'SELECT');
      return result([`Tables_in_${dbn}`], Object.keys(st.dbs[dbn].tables).sort().map((t) => [t]));
    }
    if ((m = /^(?:describe|desc|show\s+(?:full\s+)?columns\s+from)\s+(\S+)$/i.exec(s))) {
      const t = tableOf(ctx, m[1]);
      needPriv(ctx, t.db, 'SELECT');
      return result(['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'], t.t.cols.map((c) => [c.name, fmtType(c.type), c.notnull || c.key ? 'NO' : 'YES', c.key === 'PRI' ? 'PRI' : '', c.def !== undefined ? c.def : null, c.auto ? 'auto_increment' : '']));
    }
    if ((m = /^show\s+create\s+table\s+(\S+)$/i.exec(s))) {
      const t = tableOf(ctx, m[1]);
      return result(['Table', 'Create Table'], [[t.name, createSql(t.name, t.t)]]);
    }
    if ((m = /^create\s+table\s+(if\s+not\s+exists\s+)?(\S+?)\s*\(([\s\S]*)\)\s*(?:engine.*|default.*|charset.*|collate.*|auto_increment.*)?$/i.exec(s))) {
      const t = tableOf(ctx, m[2], true);
      needPriv(ctx, t.db, 'CREATE');
      if (t.t) {
        if (m[1]) return ok('Query OK, 0 rows affected, 1 warning');
        throw new SqlErr(1050, '42S01', `Table '${t.name}' already exists`);
      }
      const cols = [];
      let pk = [];
      for (const part of splitTop(m[3], ',')) {
        let pm;
        if ((pm = /^primary\s+key\s*\(([^)]*)\)/i.exec(part))) { pk = pm[1].split(',').map(clean); continue; }
        if (/^(unique\s+)?(key|index|constraint|foreign\s+key|fulltext)\b/i.test(part)) continue;
        const cm = /^(`?[\w$]+`?)\s+([\w]+(?:\([^)]*\))?(?:\s+unsigned)?)(.*)$/i.exec(part);
        if (!cm) throw new SqlErr(1064, '42000', `You have an error in your SQL syntax; check the manual that corresponds to your ${flavorOf(sh).banner} server version for the right syntax to use near '${part}' at line 1`);
        const mods = cm[3] || '';
        const dm = /default\s+('(?:[^']|'')*'|[\w.()-]+)/i.exec(mods);
        cols.push({ name: clean(cm[1]), type: cm[2].replace(/\s+unsigned/i, '').replace(/\(\d+\)$/, (x) => (/^int|^bigint|^tinyint/i.test(cm[2]) ? '' : x)), notnull: /not\s+null/i.test(mods), auto: /auto_increment/i.test(mods), key: /primary\s+key/i.test(mods) ? 'PRI' : '', def: dm ? (unq(dm[1]) !== null ? unq(dm[1]) : /^null$/i.test(dm[1]) ? null : Number(dm[1])) : undefined });
      }
      pk.forEach((k) => { const c = cols.find((x) => x.name === k); if (c) { c.key = 'PRI'; c.notnull = true; } });
      cols.filter((c) => c.key === 'PRI').forEach((c) => (c.notnull = true));
      t.d.tables[t.name] = { cols, rows: [], ai: 1 };
      syncDisk(sh);
      return ok('Query OK, 0 rows affected');
    }
    if ((m = /^drop\s+table\s+(if\s+exists\s+)?(\S+)$/i.exec(s))) {
      let t;
      try { t = tableOf(ctx, m[2]); } catch (e) { if (m[1] && e.code === 1146) return ok('Query OK, 0 rows affected, 1 warning'); throw e; }
      needPriv(ctx, t.db, 'DROP');
      delete t.d.tables[t.name];
      syncDisk(sh);
      return ok('Query OK, 0 rows affected');
    }
    if ((m = /^insert\s+(?:ignore\s+)?into\s+(\S+?)\s*(?:\(([^)]*)\))?\s*values\s*([\s\S]+)$/i.exec(s))) {
      const t = tableOf(ctx, m[1]);
      needPriv(ctx, t.db, 'INSERT');
      const tb = t.t;
      const names = m[2] ? m[2].split(',').map(clean) : tb.cols.map((c) => c.name);
      for (const n of names) if (!tb.cols.some((c) => c.name === n)) throw new SqlErr(1054, '42S22', `Unknown column '${n}' in 'field list'`);
      const tuples = splitTop(m[3].trim(), ',').map((x) => x.trim()).filter(Boolean);
      let n = 0;
      for (const tup of tuples) {
        if (!/^\(.*\)$/s.test(tup)) throw new SqlErr(1064, '42000', `You have an error in your SQL syntax; check the manual that corresponds to your ${flavorOf(sh).banner} server version for the right syntax to use near '${tup}' at line 1`);
        const vals = splitTop(tup.slice(1, -1), ',').map((v) => evalValue(ctx, v));
        if (vals.length !== names.length) throw new SqlErr(1136, '21S01', "Column count doesn't match value count at row " + (n + 1));
        const row = tb.cols.map((c) => {
          const i = names.indexOf(c.name);
          let v = i >= 0 ? vals[i] : undefined;
          if ((v === undefined || v === null) && c.auto) v = tb.ai++;
          else if (c.auto && typeof v === 'number') tb.ai = Math.max(tb.ai, v + 1);
          if (v === undefined) v = c.def !== undefined ? c.def : null;
          if (v === null && c.notnull && !c.auto) throw new SqlErr(i >= 0 ? 1048 : 1364, i >= 0 ? '23000' : 'HY000', i >= 0 ? `Column '${c.name}' cannot be null` : `Field '${c.name}' doesn't have a default value`);
          if (typeKind(c.type) === 'num' && typeof v === 'string' && v !== '' && !isNaN(Number(v))) v = Number(v);
          if (typeKind(c.type) === 'num' && typeof v === 'string') throw new SqlErr(1366, 'HY000', `Incorrect integer value: '${v}' for column \`${t.db}\`.\`${t.name}\`.\`${c.name}\` at row ${n + 1}`);
          return v;
        });
        const pk = tb.cols.findIndex((c) => c.key === 'PRI');
        if (pk >= 0 && tb.rows.some((r) => r[pk] === row[pk])) throw new SqlErr(1062, '23000', `Duplicate entry '${row[pk]}' for key 'PRIMARY'`);
        tb.rows.push(row);
        n++;
      }
      return ok(`Query OK, ${n} row${n === 1 ? '' : 's'} affected${n > 1 ? `\nRecords: ${n}  Duplicates: 0  Warnings: 0` : ''}`);
    }
    if ((m = /^update\s+(\S+)\s+set\s+([\s\S]+?)(?:\s+where\s+([\s\S]+))?$/i.exec(s))) {
      const t = tableOf(ctx, m[1]);
      needPriv(ctx, t.db, 'UPDATE');
      const cols = t.t.cols.map((c) => c.name);
      const sets = splitTop(m[2], ',').map((x) => /^([`\w]+)\s*=\s*([\s\S]+)$/.exec(x.trim()));
      let n = 0;
      for (const row of t.t.rows) {
        if (m[3] && !condition(ctx, m[3], row, cols)) continue;
        for (const sm of sets) {
          if (!sm) throw new SqlErr(1064, '42000', 'You have an error in your SQL syntax near \'SET\' at line 1');
          const i = cols.indexOf(clean(sm[1]));
          if (i < 0) throw new SqlErr(1054, '42S22', `Unknown column '${clean(sm[1])}' in 'field list'`);
          row[i] = evalValue(ctx, sm[2], row, cols);
        }
        n++;
      }
      return ok(`Query OK, ${n} row${n === 1 ? '' : 's'} affected\nRows matched: ${n}  Changed: ${n}  Warnings: 0`);
    }
    if ((m = /^delete\s+from\s+(\S+)(?:\s+where\s+([\s\S]+))?$/i.exec(s))) {
      const t = tableOf(ctx, m[1]);
      needPriv(ctx, t.db, 'DELETE');
      const cols = t.t.cols.map((c) => c.name);
      const before = t.t.rows.length;
      t.t.rows = m[2] ? t.t.rows.filter((r) => !condition(ctx, m[2], r, cols)) : [];
      const n = before - t.t.rows.length;
      return ok(`Query OK, ${n} row${n === 1 ? '' : 's'} affected`);
    }
    if ((m = /^truncate\s+(?:table\s+)?(\S+)$/i.exec(s))) {
      const t = tableOf(ctx, m[1]);
      needPriv(ctx, t.db, 'DROP');
      t.t.rows = [];
      t.t.ai = 1;
      return ok('Query OK, 0 rows affected');
    }
    if ((m = /^select\s+([\s\S]+?)(?:\s+from\s+(\S+))?(?:\s+where\s+([\s\S]+?))?(?:\s+order\s+by\s+([\s\S]+?))?(?:\s+limit\s+(\d+))?$/i.exec(s))) {
      const items = splitTop(m[1], ',');
      if (!m[2]) {
        const cols = items.map((it) => { const am = /^([\s\S]+?)\s+as\s+(\S+)$/i.exec(it); return am ? clean(am[2]) : it.trim(); });
        return result(cols, [items.map((it) => { const am = /^([\s\S]+?)\s+as\s+(\S+)$/i.exec(it); return evalValue(ctx, am ? am[1] : it); })]);
      }
      const t = tableOf(ctx, m[2]);
      let cols;
      let rows;
      if (t.virtual === 'user') {
        needPriv(ctx, 'mysql', 'SELECT');
        cols = ['Host', 'User', 'plugin'];
        rows = st.users.map((u) => [u.host, u.user, u.auth === 'socket' ? 'unix_socket' : 'mysql_native_password']);
      } else {
        needPriv(ctx, t.db, 'SELECT');
        cols = t.t.cols.map((c) => c.name);
        rows = t.t.rows.map((r) => r.slice());
      }
      if (m[3]) rows = rows.filter((r) => condition(ctx, m[3], r, cols));
      if (m[4]) {
        const keys = splitTop(m[4], ',').map((k) => { const km = /^(\S+)(?:\s+(asc|desc))?$/i.exec(k.trim()); return { i: cols.indexOf(clean(km ? km[1] : k)), d: km && /desc/i.test(km[2] || '') ? -1 : 1 }; });
        rows.sort((a, b) => { for (const k of keys) { const c = cmpVals(a[k.i], b[k.i]); if (c) return c * k.d; } return 0; });
      }
      const agg = items.length === 1 && /^(count|max|min|sum|avg)\(/i.exec(items[0].trim());
      if (agg) {
        const am = /^(\w+)\((.*)\)(?:\s+as\s+(\S+))?$/i.exec(items[0].trim());
        const f = am[1].toLowerCase();
        const arg = am[2].trim();
        const vals = arg === '*' ? rows.map(() => 1) : rows.map((r) => r[cols.indexOf(clean(arg))]).filter((v) => v !== null);
        const nums = vals.map(Number);
        const v = f === 'count' ? vals.length : !nums.length ? null : f === 'max' ? Math.max(...nums) : f === 'min' ? Math.min(...nums) : f === 'sum' ? nums.reduce((a, b) => a + b, 0) : Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10000) / 10000;
        return result([am[3] ? clean(am[3]) : items[0].trim()], [[v]]);
      }
      if (m[5]) rows = rows.slice(0, +m[5]);
      if (items.length === 1 && items[0].trim() === '*') return result(cols, rows);
      const idx = items.map((it) => { const am = /^([\s\S]+?)\s+as\s+(\S+)$/i.exec(it.trim()); return { e: am ? am[1] : it.trim(), n: am ? clean(am[2]) : clean(it.trim()) }; });
      return result(idx.map((x) => x.n), rows.map((r) => idx.map((x) => (x.e === '*' ? null : evalValue(ctx, x.e, r, cols)))));
    }
    if ((m = /^create\s+user\s+(if\s+not\s+exists\s+)?(\S+?)(?:\s+identified\s+by\s+('(?:[^']|'')*'|"[^"]*"))?$/i.exec(s))) {
      if (ctx.user !== 'root' && !allowed(ctx, '*', 'CREATE USER')) throw new SqlErr(1227, '42000', 'Access denied; you need (at least one of) the CREATE USER privilege(s) for this operation');
      const [u, h] = parseAccount(m[2]);
      if (st.users.some((x) => x.user === u && x.host === h)) {
        if (m[1]) return ok('Query OK, 0 rows affected, 1 warning');
        throw new SqlErr(1396, 'HY000', `Operation CREATE USER failed for '${u}'@'${h}'`);
      }
      st.users.push({ user: u, host: h, pw: m[3] ? unq(m[3]) : '', auth: 'password', grants: [{ priv: 'USAGE', db: '*' }] });
      return ok('Query OK, 0 rows affected');
    }
    if ((m = /^(?:alter\s+user|set\s+password\s+for)\s+(\S+?)\s+(?:identified\s+by|=\s*password\()\s*('(?:[^']|'')*'|"[^"]*")\)?$/i.exec(s))) {
      const [u, h] = parseAccount(m[1]);
      const us = st.users.find((x) => x.user === u && x.host === h);
      if (!us) throw new SqlErr(1396, 'HY000', `Operation ALTER USER failed for '${u}'@'${h}'`);
      us.pw = unq(m[2]);
      us.auth = 'password';
      return ok('Query OK, 0 rows affected');
    }
    if ((m = /^drop\s+user\s+(if\s+exists\s+)?(\S+)$/i.exec(s))) {
      const [u, h] = parseAccount(m[2]);
      const i = st.users.findIndex((x) => x.user === u && x.host === h);
      if (i < 0) {
        if (m[1]) return ok('Query OK, 0 rows affected, 1 warning');
        throw new SqlErr(1396, 'HY000', `Operation DROP USER failed for '${u}'@'${h}'`);
      }
      st.users.splice(i, 1);
      return ok('Query OK, 0 rows affected');
    }
    if ((m = /^grant\s+([\s\S]+?)\s+on\s+(\S+)\s+to\s+(\S+?)(?:\s+identified\s+by\s+('(?:[^']|'')*'))?(?:\s+with\s+grant\s+option)?$/i.exec(s))) {
      if (ctx.user !== 'root') throw new SqlErr(1045, '28000', `Access denied for user '${ctx.user}'@'${ctx.host}' (using password: YES)`);
      const [u, h] = parseAccount(m[3]);
      let us = st.users.find((x) => x.user === u && x.host === h);
      if (!us) {
        if (!m[4]) throw new SqlErr(1133, '42000', "Can't find any matching row in the user table");
        us = { user: u, host: h, pw: unq(m[4]), auth: 'password', grants: [] };
        st.users.push(us);
      }
      const dbn = clean(m[2]).split('.')[0];
      if (dbn !== '*' && !st.dbs[dbn] && !/\*/.test(dbn)) { /* MySQL allows grants on future databases */ }
      us.grants = us.grants.filter((g) => !(g.priv === 'USAGE'));
      us.grants.push({ priv: m[1].trim().toUpperCase(), db: dbn });
      return ok('Query OK, 0 rows affected');
    }
    if ((m = /^revoke\s+([\s\S]+?)\s+on\s+(\S+)\s+from\s+(\S+)$/i.exec(s))) {
      const [u, h] = parseAccount(m[3]);
      const us = st.users.find((x) => x.user === u && x.host === h);
      if (!us) throw new SqlErr(1141, '42000', `There is no such grant defined for user '${u}' on host '${h}'`);
      const dbn = clean(m[2]).split('.')[0];
      us.grants = us.grants.filter((g) => g.db !== dbn);
      if (!us.grants.length) us.grants.push({ priv: 'USAGE', db: '*' });
      return ok('Query OK, 0 rows affected');
    }
    if ((m = /^show\s+grants(?:\s+for\s+(\S+))?$/i.exec(s))) {
      const [u, h] = m[1] ? parseAccount(m[1]) : [ctx.user, ctx.hostMatch];
      const us = st.users.find((x) => x.user === u && x.host === h);
      if (!us) throw new SqlErr(1141, '42000', `There is no such grant defined for user '${u}' on host '${h}'`);
      const head = `Grants for ${u}@${h}`;
      return result([head], us.grants.map((g) => [`GRANT ${g.priv} ON ${g.db === '*' ? '*.*' : '`' + g.db + '`.*'} TO \`${u}\`@\`${h}\`${us.auth === 'password' ? ' IDENTIFIED BY PASSWORD \'*' + 'A4B6157319038724E3560894F7F932C8886EBFCF' + '\'' : ''}${g.grant ? ' WITH GRANT OPTION' : ''}`]));
    }
    if ((m = /^show\s+(?:global\s+)?variables(?:\s+like\s+('[^']*'))?$/i.exec(s))) {
      const cfg = readCnf(sh);
      const vars = [['bind_address', cfg['bind-address']], ['datadir', cfg.datadir + '/'], ['port', cfg.port], ['version', flavorOf(sh).version], ['max_connections', '151'], ['character_set_server', 'utf8mb4']];
      const pat = m[1] ? likeRe(unq(m[1])) : null;
      return result(['Variable_name', 'Value'], vars.filter((v) => !pat || pat.test(v[0])));
    }
    if (/^show\s+(full\s+)?processlist$/i.test(s)) return result(['Id', 'User', 'Host', 'db', 'Command', 'Time', 'State', 'Info'], [[31, ctx.user, ctx.host + ':41234', ctx.db, 'Query', 0, 'starting', 'show processlist']]);
    if (/^show\s+status$/i.test(s) || /^show\s+(global\s+)?status\s+like/i.test(s)) return result(['Variable_name', 'Value'], [['Uptime', Math.floor((Date.now() - st.up) / 1000) + 3600], ['Threads_connected', 1], ['Questions', st.q]]);
    if (/^(source|\\.)\s/i.test(s)) throw new SqlErr(1064, '42000', 'source is only available in the interactive mysql shell');
    throw new SqlErr(1064, '42000', `You have an error in your SQL syntax; check the manual that corresponds to your ${flavorOf(sh).banner} server version for the right syntax to use near '${s.length > 40 ? s.slice(0, 40) : s}' at line 1`);
  }
  function parseAccount(a) {
    const m = /^['"`]?([^'"`@]+)['"`]?(?:@['"`]?([^'"`]*)['"`]?)?$/.exec(a.trim());
    return [m ? m[1] : a, m && m[2] ? m[2] : '%'];
  }

  /* ---------- the client ---------- */
  const secs = () => (Math.random() * 0.02).toFixed(3);
  async function connect(c, o) {
    const sh = c.sh;
    const st = dbState(sh);
    const fl = flavorOf(sh);
    const host = o.host || 'localhost';
    const ip = sh.resolveHost(host);
    if (host !== 'localhost' && !ip) throw new SqlErr(2005, 'HY000', `Unknown server host '${host}' (-2)`);
    const local = host === 'localhost' || sh.ownIps().includes(ip);
    if (!local) {
      const port = LX.portState(sh, ip, o.port || 3306);
      if (port === 'filtered') throw new SqlErr(2002, 'HY000', `Can't connect to server on '${host}' (110)`);
      throw new SqlErr(2002, 'HY000', `Can't connect to server on '${host}' (111)`);
    }
    if (!isUp(sh)) {
      if (host === 'localhost' && !o.port) throw new SqlErr(2002, 'HY000', "Can't connect to local server through socket '/run/mysqld/mysqld.sock' (2)");
      throw new SqlErr(2002, 'HY000', `Can't connect to server on '${host}' (111)`);
    }
    const lst = sh.listeners[3306];
    const viaSocket = host === 'localhost' && !o.port;
    if (!viaSocket && lst && lst.addr === '127.0.0.1' && !ip.startsWith('127.')) throw new SqlErr(2002, 'HY000', `Can't connect to server on '${host}' (111)`);
    if (!viaSocket && ip && !ip.startsWith('127.')) {
      const dec = LX.fwDecision ? LX.fwDecision(sh, 3306, 'tcp', false, '192.168.1.5') : 'ACCEPT';
      if (dec === 'DROP') throw new SqlErr(2002, 'HY000', `Can't connect to server on '${host}' (110)`);
      if (dec === 'REJECT') throw new SqlErr(2002, 'HY000', `Can't connect to server on '${host}' (111)`);
    }
    const user = o.user || sh.eu();
    const us = st.users.filter((x) => x.user === user && (x.host === 'localhost' || x.host === '%' || x.host === '127.0.0.1' || (!viaSocket && x.host === '%')));
    const us1 = us.find((x) => x.host === 'localhost') || us[0];
    const deny = (pw) => new SqlErr(viaSocket && user === 'root' && !pw ? 1698 : 1045, '28000', `Access denied for user '${user}'@'${host === 'localhost' ? 'localhost' : '192.168.1.5'}'${viaSocket && user === 'root' ? '' : ` (using password: ${pw ? 'YES' : 'NO'})`}`);
    if (!us1) throw deny(!!o.pw);
    if (us1.auth === 'socket') {
      // unix_socket plugin: you must be the same operating-system user (root)
      if (!(viaSocket && sh.eu() === user)) throw new SqlErr(1698, '28000', `Access denied for user '${user}'@'localhost'`);
    } else if ((us1.pw || '') !== (o.pw || '')) throw deny(o.pw !== undefined && o.pw !== '');
    st.conn++;
    return { sh, user, host: us1.host === '%' && !viaSocket ? 'localhost' : 'localhost', hostMatch: us1.host, db: o.db || null, tty: !!c.io.tty };
  }
  const printErr = (c, e, line) => c.err(`ERROR ${e.code} (${e.state})${line ? ' at line ' + line : ''}: ${e.message}\n`);
  const runStatements = (c, ctx, stmts, opts) => {
    let status = 0;
    let lineNo = 1;
    for (const s of stmts) {
      try {
        const r = exec(ctx, s);
        if (r.kind === 'rows') {
          if (!r.rows.length) {
            if (opts.interactive) c.out('Empty set (' + secs() + ' sec)\n\n');
          } else {
            let txt = showTable(r.cols, r.rows, opts.interactive || ctx.tty || opts.table);
            if (opts.nocol && !(opts.interactive || ctx.tty || opts.table)) txt = txt.split('\n').slice(1).join('\n');
            c.out(txt);
            if (opts.interactive) c.out(`${r.rows.length} row${r.rows.length === 1 ? '' : 's'} in set (${secs()} sec)\n\n`);
          }
        } else if (r.kind === 'ok') {
          if (opts.interactive) c.out(r.msg + ` (${secs()} sec)\n\n`);
        } else if (r.kind === 'msg') {
          if (opts.interactive) c.out(r.msg + '\n');
        }
      } catch (e) {
        if (!(e instanceof SqlErr)) throw e;
        printErr(c, e, opts.interactive ? 0 : lineNo);
        if (!opts.interactive) return 1;
        status = 1;
      }
      lineNo++;
    }
    return status;
  };
  const parseClientArgs = async (c, args) => {
    const o = { positional: [] };
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-u' || a === '--user') o.user = args[++i];
      else if (a.startsWith('-u') && a.length > 2) o.user = a.slice(2);
      else if (a.startsWith('--user=')) o.user = a.slice(7);
      else if (a === '-p' || a === '--password') o.askPw = true;
      else if (a.startsWith('-p') && a.length > 2) o.pw = a.slice(2);
      else if (a.startsWith('--password=')) o.pw = a.slice(11);
      else if (a === '-h' || a === '--host') o.host = args[++i];
      else if (a.startsWith('--host=')) o.host = a.slice(7);
      else if (a.startsWith('-h') && a.length > 2) o.host = a.slice(2);
      else if (a === '-P' || a === '--port') o.port = +args[++i];
      else if (a === '-e' || a === '--execute') o.exec = args[++i];
      else if (a.startsWith('--execute=')) o.exec = a.slice(10);
      else if (a === '-D' || a === '--database') o.db = args[++i];
      else if (a === '-t' || a === '--table') o.table = true;
      else if (a === '-B' || a === '--batch') o.batch = true;
      else if (a === '-N' || a === '--skip-column-names') o.nocol = true;
      else if (a === '-s' || a === '--silent') o.silent = true;
      else if (a === '--databases' || a === '-B') o.databasesFlag = true;
      else if (a.startsWith('-')) o[a.replace(/^-+/, '')] = true;
      else o.positional.push(a);
    }
    if (o.askPw) {
      if (c.sh.hooks.readLine) {
        o.pw = await c.sh.hooks.readLine('Enter password: ', { secret: true });
        c.sh.checkAbort();
        if (o.pw === null) return null;
      } else o.pw = '';
    }
    return o;
  };
  const clientMain = async (c, args) => {
    const sh = c.sh;
    const o = await parseClientArgs(c, args);
    if (!o) return 1;
    if (o.version || o.V) { c.out(`mysql  Ver 15.1 Distrib ${flavorOf(sh).version.split('-')[0]}-MariaDB, for debian-linux-gnu (x86_64) using  EditLine wrapper\n`); return 0; }
    if (!sh.installed.has('mariadb-server') && !sh.installed.has('mysql-server') && !sh.installed.has('mariadb-client') && !sh.installed.has('mysql-client')) { c.err('mysql: command not found\n'); return 127; }
    o.db = o.db || o.positional[0];
    let ctx;
    try {
      ctx = await connect(c, o);
      if (o.db) {
        const st = dbState(sh);
        if (!st.dbs[o.db]) throw new SqlErr(1049, '42000', `Unknown database '${o.db}'`);
        needPriv(ctx, o.db, 'SELECT');
      }
    } catch (e) {
      if (!(e instanceof SqlErr)) throw e;
      printErr(c, e);
      return 1;
    }
    ctx.db = o.db || null;
    // -e "sql" or script on stdin
    if (o.exec !== undefined || typeof c.io.stdin === 'string' && c.io.stdin !== '') {
      const text = o.exec !== undefined ? o.exec : c.io.stdin;
      const stmts = splitStatements(stripComments(text).replace(/^\s*delimiter\s.*$/gim, ''));
      ctx.tty = !!c.io.tty && o.exec !== undefined && !o.batch;
      return runStatements(c, ctx, stmts, { table: o.table, nocol: o.nocol });
    }
    // interactive
    if (!sh.hooks.readLine) { c.out('(interactive mode needs a terminal)\n'); return 0; }
    const fl = flavorOf(sh);
    c.out(`Welcome to the ${fl.banner} monitor.  Commands end with ; or \\g.\nYour ${fl.banner} connection id is ${dbState(sh).conn}\nServer version: ${fl.version} Ubuntu 24.04\n\nCopyright (c) 2000, 2018, Oracle, MariaDB Corporation Ab and others.\n\nType 'help;' or '\\h' for help. Type '\\c' to clear the current input statement.\n\n`);
    ctx.tty = true;
    let buf = '';
    for (;;) {
      const prompt = buf ? '    -> ' : `${fl.prompt} [${ctx.db || '(none)'}]> `;
      const line = await sh.hooks.readLine(prompt);
      sh.checkAbort();
      if (line === null || line === undefined) { c.out('Bye\n'); return 0; }
      const t = line.trim();
      if (!buf && /^(exit|quit|\\q)\s*;?$/i.test(t)) { c.out('Bye\n'); return 0; }
      if (!buf && (t === 'help' || t === '\\h' || /^help;$/.test(t))) { c.out('General information about MariaDB can be found at https://mariadb.org\n\nList of all client commands:\nNote that all text commands must be first on line and end with \';\'\n?         (\\?) Synonym for `help\'.\nexit      (\\q) Exit mysql. Same as quit.\nsource    (\\.) Execute an SQL script file. Takes a file name as an argument.\nuse       (\\u) Use another database. Takes database name as argument.\n'); continue; }
      if (!buf && /^source\s+/i.test(t)) {
        const f = t.replace(/^source\s+/i, '').replace(/;$/, '');
        try {
          const text = sh.readFile(sh.abs(f));
          runStatements(c, ctx, splitStatements(stripComments(text)), { interactive: true });
        } catch (e) {
          if (!(e instanceof FsErr)) throw e;
          c.out(`ERROR: Failed to open file '${f}', error: 2\n`);
        }
        continue;
      }
      if (t === '\\c') { buf = ''; continue; }
      buf += (buf ? '\n' : '') + line;
      if (/;\s*$/.test(buf.trim())) {
        const stmts = splitStatements(buf);
        buf = '';
        runStatements(c, ctx, stmts, { interactive: true });
      }
    }
  };
  for (const nm of ['mysql', 'mariadb']) def(nm, clientMain);

  /* ---------- mysqldump ---------- */
  const dumpMain = async (c, args) => {
    const sh = c.sh;
    const o = await parseClientArgs(c, args);
    if (!o) return 1;
    let ctx;
    try { ctx = await connect(c, o); } catch (e) { if (!(e instanceof SqlErr)) throw e; c.err(`mysqldump: Got error: ${e.code}: "${e.message}" when trying to connect\n`); return 2; }
    const st = dbState(sh);
    const all = o.A || o['all-databases'];
    const dbsFlag = o.databasesFlag || o.B || o.databases;
    let dbNames = all ? Object.keys(st.dbs).filter((n) => !SYSTEM_DBS.includes(n)) : dbsFlag ? o.positional : [o.positional[0]];
    if (!dbNames[0]) { c.err('Usage: mysqldump [OPTIONS] database [tables]\nOR     mysqldump [OPTIONS] --databases [OPTIONS] DB1 [DB2 DB3...]\nOR     mysqldump [OPTIONS] --all-databases [OPTIONS]\nFor more options, use mysqldump --help\n'); return 1; }
    const fl = flavorOf(sh);
    const noData = o['no-data'] || o.d;
    let out = `-- ${fl.banner} dump 10.19  Distrib ${fl.version.split('-')[0]}-MariaDB, for debian-linux-gnu (x86_64)\n--\n-- Host: ${o.host || 'localhost'}    Database: ${dbNames.join(',')}\n-- ------------------------------------------------------\n-- Server version\t${fl.version}\n\n/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;\n/*!40101 SET NAMES utf8mb4 */;\n/*!40103 SET TIME_ZONE='+00:00' */;\n\n`;
    for (const dn of dbNames) {
      const d = st.dbs[dn];
      if (!d) { c.err(`mysqldump: Got error: 1049: "Unknown database '${dn}'" when selecting the database\n`); return 2; }
      try { needPriv(ctx, dn, 'SELECT'); } catch (e) { c.err(`mysqldump: Got error: ${e.code}: "${e.message}" when selecting the database\n`); return 2; }
      if (all || dbsFlag) out += `--\n-- Current Database: \`${dn}\`\n--\n\nCREATE DATABASE /*!32312 IF NOT EXISTS*/ \`${dn}\` /*!40100 DEFAULT CHARACTER SET utf8mb4 */;\n\nUSE \`${dn}\`;\n\n`;
      const only = !all && !dbsFlag ? o.positional.slice(1) : [];
      for (const tn of Object.keys(d.tables).sort()) {
        if (only.length && !only.includes(tn)) continue;
        const t = d.tables[tn];
        out += `--\n-- Table structure for table \`${tn}\`\n--\n\nDROP TABLE IF EXISTS \`${tn}\`;\n${createSql(tn, t)};\n\n`;
        if (!noData && t.rows.length) out += `--\n-- Dumping data for table \`${tn}\`\n--\n\nLOCK TABLES \`${tn}\` WRITE;\n/*!40000 ALTER TABLE \`${tn}\` DISABLE KEYS */;\nINSERT INTO \`${tn}\` VALUES ${t.rows.map((r) => '(' + r.map(sqlLit).join(',') + ')').join(',')};\n/*!40000 ALTER TABLE \`${tn}\` ENABLE KEYS */;\nUNLOCK TABLES;\n\n`;
      }
    }
    out += `-- Dump completed on ${U.strftime('%F %T', new Date())}\n`;
    c.out(out);
    return 0;
  };
  for (const nm of ['mysqldump', 'mariadb-dump']) def(nm, dumpMain);

  /* ---------- mysqladmin ---------- */
  def('mysqladmin', async (c, args) => {
    const sh = c.sh;
    const o = await parseClientArgs(c, args);
    if (!o) return 1;
    const fl = flavorOf(sh);
    const cmdw = o.positional[0];
    if (cmdw === 'ping') {
      if (!isUp(sh)) { c.err(`mysqladmin: connect to server at 'localhost' failed\nerror: 'Can't connect to local server through socket '/run/mysqld/mysqld.sock' (2)'\nCheck that the server is running.\n`); return 1; }
      c.out(`${fl.daemon} is alive\n`);
      return 0;
    }
    let ctx;
    try { ctx = await connect(c, o); } catch (e) { if (!(e instanceof SqlErr)) throw e; c.err(`mysqladmin: connect to server at '${o.host || 'localhost'}' failed\nerror: '${e.message}'\n`); return 1; }
    const st = dbState(sh);
    if (cmdw === 'status') { c.out(`Uptime: ${Math.floor((Date.now() - st.up) / 1000) + 3600}  Threads: 1  Questions: ${st.q}  Slow queries: 0  Opens: 17  Open tables: 10  Queries per second avg: 0.365\n`); return 0; }
    if (cmdw === 'version') { c.out(`mysqladmin  Ver 9.1 Distrib ${fl.version.split('-')[0]}-MariaDB, for debian-linux-gnu on x86_64\nServer version\t\t${fl.version}\nProtocol version\t10\nConnection\t\tLocalhost via UNIX socket\nUNIX socket\t\t/run/mysqld/mysqld.sock\nUptime:\t\t\t1 hour\n`); return 0; }
    if (cmdw === 'create' || cmdw === 'drop') { try { exec(ctx, `${cmdw} database ${o.positional[1]}`); c.out(cmdw === 'create' ? '' : ''); return 0; } catch (e) { c.err(`mysqladmin: ${cmdw} database failed\nerror: '${e.message}'\n`); return 1; } }
    if (cmdw === 'password') { try { exec(ctx, `ALTER USER '${ctx.user}'@'localhost' IDENTIFIED BY '${o.positional[1] || ''}'`); return 0; } catch (e) { c.err(e.message + '\n'); return 1; } }
    if (cmdw === 'processlist') { c.out(showTable(['Id', 'User', 'Host', 'db', 'Command', 'Time', 'State', 'Info'], [[31, ctx.user, 'localhost', null, 'Query', 0, 'starting', 'show processlist']], true)); return 0; }
    c.err(`mysqladmin: unknown command: '${cmdw || ''}'\n`);
    return 1;
  });
  def('mysql_secure_installation', async (c) => {
    if (needRoot(c, 'mysql_secure_installation: must be run as root\n')) return 1;
    c.out('NOTE: RUNNING ALL PARTS OF THIS SCRIPT IS RECOMMENDED FOR ALL MariaDB\n      SERVERS IN PRODUCTION USE!  PLEASE READ EACH STEP CAREFULLY!\n\n(sandbox) In a real run it asks: set root password? remove anonymous users? disallow root login remotely? remove test database? reload privileges?\nAnswer Y to all on a server that is reachable from a network.\n');
    return 0;
  });
  LX.mysqlState = dbState;
})();
