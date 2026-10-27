/* Linux Academy: mandatory access control. SELinux (labels, booleans, ports, AVC denials) and AppArmor (profiles, enforce/complain, denials) */
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

  /* =============================== SELinux =============================== */
  const BUILTIN = [
    [/^\/var\/www(\/|$)/, 'httpd_sys_content_t'], [/^\/usr\/share\/nginx(\/|$)/, 'httpd_sys_content_t'], [/^\/var\/log\/(nginx|httpd|apache2)(\/|$)/, 'httpd_log_t'], [/^\/etc\/(nginx|httpd|apache2)(\/|$)/, 'httpd_config_t'],
    [/^\/usr\/sbin\/nginx$/, 'httpd_exec_t'], [/^\/usr\/bin\/nginx$/, 'httpd_exec_t'], [/^\/usr\/sbin\/sshd$/, 'sshd_exec_t'], [/^\/etc\/shadow$/, 'shadow_t'], [/^\/etc\/passwd$/, 'passwd_file_t'],
    [/^\/home\/[^/]+\/\.ssh(\/|$)/, 'ssh_home_t'], [/^\/root\/\.ssh(\/|$)/, 'ssh_home_t'], [/^\/home\/[^/]+(\/|$)/, 'user_home_t'], [/^\/home$/, 'home_root_t'], [/^\/root(\/|$)/, 'admin_home_t'],
    [/^\/var\/lib\/mysql(\/|$)/, 'mysqld_db_t'], [/^\/var\/lib(\/|$)/, 'var_lib_t'], [/^\/var\/spool\/cron(\/|$)/, 'user_cron_spool_t'], [/^\/var\/tmp(\/|$)/, 'tmp_t'], [/^\/var\/log(\/|$)/, 'var_log_t'], [/^\/var\/run(\/|$)/, 'var_run_t'], [/^\/run(\/|$)/, 'var_run_t'],
    [/^\/etc(\/|$)/, 'etc_t'], [/^\/tmp(\/|$)/, 'tmp_t'], [/^\/(usr\/)?s?bin(\/|$)/, 'bin_t'], [/^\/usr\/local(\/|$)/, 'usr_t'], [/^\/usr(\/|$)/, 'usr_t'], [/^\/opt(\/|$)/, 'usr_t'], [/^\/mnt(\/|$)/, 'mnt_t'], [/^\/media(\/|$)/, 'mnt_t'],
    [/^\/dev(\/|$)/, 'device_t'], [/^\/proc(\/|$)/, 'proc_t'], [/^\/sys(\/|$)/, 'sysfs_t'], [/^\/srv(\/|$)/, 'var_t'], [/^\/var(\/|$)/, 'var_t'], [/^\/boot(\/|$)/, 'boot_t'], [/^\/$/, 'root_t'],
  ];
  const userPart = (abs) => (abs.startsWith('/home/') || abs.startsWith('/root') ? 'unconfined_u' : 'system_u');
  const builtinCtx = (abs) => {
    for (const [re, t] of BUILTIN) if (re.test(abs)) return `${userPart(abs)}:object_r:${t}:s0`;
    return 'system_u:object_r:default_t:s0';
  };
  const fcRegex = (re) => new RegExp('^' + re.replace(/\(\/\.\*\)\?/g, '(/.*)?').replace(/\.\*/g, '.*') + '$');
  const policyCtx = (sh, abs) => {
    const fcs = (sh.selinux && sh.selinux.fcontexts) || [];
    for (let i = fcs.length - 1; i >= 0; i--) {
      try {
        if (fcRegex(fcs[i].re).test(abs)) return `${userPart(abs)}:object_r:${fcs[i].type}:s0`;
      } catch (e) { /* bad regex */ }
    }
    return builtinCtx(abs);
  };
  /** the label a file really has: its own, or the one inherited from the nearest labelled folder, or the default for its path */
  LX.ctxOf = function (sh, node, abs, policy) {
    if (policy) return policyCtx(sh, abs);
    if (node && node.ctx) return node.ctx;
    let a = abs;
    while (a && a !== '/') {
      a = VFS.dirname(a);
      const pn = sh.fs.lookup(a);
      if (pn && pn.ctx) return pn.ctx;
    }
    return builtinCtx(abs);
  };
  const typeOf = (ctx) => ctx.split(':')[2];
  const walkAll = (sh, abs, fn) => {
    const n = sh.fs.lookup(abs);
    if (!n) return;
    fn(abs, n);
    if (n.t === 'd') for (const k of Object.keys(n.kids)) walkAll(sh, abs === '/' ? '/' + k : abs + '/' + k, fn);
  };
  const freezeChildren = (sh, abs) => {
    const n = sh.fs.lookup(abs);
    if (!n || n.t !== 'd') return;
    for (const [k, kid] of Object.entries(n.kids)) if (!kid.ctx && kid.t !== 'l') kid.ctx = LX.ctxOf(sh, kid, abs === '/' ? '/' + k : abs + '/' + k);
  };
  // a moved file keeps its label: freeze it at the old place
  const origMv = LX.cmds.mv.run;
  def('mv', async (c, args) => {
    const srcs = args.filter((a) => !a.startsWith('-')).slice(0, -1);
    for (const s of srcs) {
      try {
        const abs = c.abs(s);
        const n = c.sh.fs.lookup(abs);
        if (n && !n.ctx && n.t !== 'l') n.ctx = LX.ctxOf(c.sh, n, abs);
      } catch (e) { /* ignore */ }
    }
    return origMv(c, args);
  });

  const parseFlags = (args, valued) => {
    const o = {};
    const rest = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (valued.includes(a)) o[a.replace(/^-+/, '')] = args[++i];
      else if (/^--\w[\w-]*=/.test(a)) o[a.slice(2, a.indexOf('='))] = a.slice(a.indexOf('=') + 1);
      else if (a.startsWith('--')) o[a.slice(2)] = true;
      else if (/^-[a-zA-Z]+$/.test(a)) for (const ch of a.slice(1)) o[ch] = true;
      else rest.push(a);
    }
    return { o, rest };
  };
  def('chcon', async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, 'chcon: failed to change context of ' + (args.filter((a) => !a.startsWith('-')).pop() || 'file') + ' to ‘system_u:object_r:x:s0’: Operation not permitted\n')) return 1;
    if (!sh.selinux || sh.selinux.mode === 'disabled') { c.err('chcon: failed to change context: Operation not supported\n'); return 1; }
    const { o, rest } = parseFlags(args, ['-t', '-u', '-r', '--reference', '--type']);
    const type = o.t || o.type;
    let files = rest;
    let refCtx = null;
    if (o.reference) {
      const rn = sh.fs.lookup(c.abs(o.reference));
      if (!rn) { c.err(`chcon: failed to get security context of '${o.reference}': No such file or directory\n`); return 1; }
      refCtx = LX.ctxOf(sh, rn, c.abs(o.reference));
    } else if (!type && !o.u && !o.r && files.length) {
      // chcon CONTEXT FILE...
      const full = files[0];
      if (full.split(':').length >= 3) { refCtx = full; files = files.slice(1); }
    }
    if (!files.length) { c.err('chcon: missing operand after ‘' + (type || '') + '’\nTry \'chcon --help\' for more information.\n'); return 1; }
    for (const f of files) {
      const abs = c.abs(f);
      const n = sh.fs.lookup(abs);
      if (!n) { c.err(`chcon: cannot access '${f}': No such file or directory\n`); return 1; }
      const apply = (p, nd) => {
        const cur = (refCtx || LX.ctxOf(sh, nd, p)).split(':');
        if (type) cur[2] = type;
        if (o.u) cur[0] = o.u;
        if (o.r) cur[1] = o.r;
        nd.ctx = cur.join(':');
        if (o.v) c.out(`changing security context of '${p}'\n`);
      };
      if (o.R) {
        const items = [];
        walkAll(sh, abs, (p, nd) => items.push([p, nd, LX.ctxOf(sh, nd, p)]));
        items.forEach(([p, nd, cur]) => { nd.ctx = cur; });
        items.forEach(([p, nd]) => apply(p, nd));
      } else {
        freezeChildren(sh, abs);
        apply(abs, n);
      }
    }
    return 0;
  });
  def('restorecon', async (c, args) => {
    const sh = c.sh;
    const { o, rest } = parseFlags(args, ['-e']);
    if (!rest.length) { c.err('usage:  restorecon [-iIDFmnprRv0] [-e excludedir] pathname...\n'); return 1; }
    if (needRoot(c, 'restorecon:  Could not set context for ' + rest[0] + ':  Permission denied\n')) return 1;
    if (!sh.selinux || sh.selinux.mode === 'disabled') return 0;
    for (const f of rest) {
      const abs = c.abs(f);
      const n = sh.fs.lookup(abs);
      if (!n) { c.err(`restorecon: Could not stat ${f}\n`); return 1; }
      const items = [];
      if (o.R || o.r) walkAll(sh, abs, (p, nd) => items.push([p, nd, LX.ctxOf(sh, nd, p)]));
      else {
        items.push([abs, n, LX.ctxOf(sh, n, abs)]);
        freezeChildren(sh, abs);
      }
      for (const [p, nd, cur] of items) {
        const want = policyCtx(sh, p);
        const keepUser = o.F ? want : want.replace(/^[^:]+/, cur.split(':')[0]);
        if (cur !== keepUser) {
          if (o.v || o.n) c.out(`${o.n ? 'Would relabel' : 'Relabeled'} ${p} from ${cur} to ${keepUser}\n`);
          if (!o.n) nd.ctx = keepUser;
        } else if (!o.n) nd.ctx = cur;
      }
    }
    return 0;
  });
  def('matchpathcon', async (c, args) => {
    for (const f of args.filter((a) => !a.startsWith('-'))) {
      const abs = c.abs(f);
      c.out(`${abs}\t${policyCtx(c.sh, abs)}\n`);
    }
  });

  /* ---- booleans, ports, fcontexts ---- */
  const BOOLS = {
    httpd_can_network_connect: ['off', 'Allow HTTPD scripts and modules to connect to the network using TCP.'],
    httpd_can_network_connect_db: ['off', 'Allow HTTPD scripts and modules to connect to databases over the network.'],
    httpd_can_sendmail: ['off', 'Allow http daemon to send mail'],
    httpd_enable_homedirs: ['off', 'Allow httpd to read home directories'],
    httpd_use_nfs: ['off', 'Allow httpd to access nfs file systems'],
    httpd_unified: ['off', 'Unify HTTPD handling of all content files.'],
    ftpd_anon_write: ['off', 'Allow ftp servers to upload files, used for public file transfer services. Directories must be labeled public_content_rw_t.'],
    samba_enable_home_dirs: ['off', 'Allow samba to share users home directories.'],
    allow_ssh_pam: ['on', 'Allow ssh to use pam'],
  };
  const PORT_DEFAULTS = { http_port_t: [80, 81, 443, 488, 8008, 8009, 8443, 9000], http_cache_port_t: [3128, 8080, 8118, 8123], ssh_port_t: [22], mysqld_port_t: [1186, 3306, 63132], postgresql_port_t: [5432], smtp_port_t: [25, 465, 587], dns_port_t: [53], pop_port_t: [110, 995], redis_port_t: [6379, 16379, 26379], memcache_port_t: [11211], ntp_port_t: [123], syslogd_port_t: [514, 6514] };
  const BOOL_DEFAULT = Object.fromEntries(Object.entries(BOOLS).map(([k, v]) => [k, v[0] === 'on']));
  LX.initHooks.push((sh) => {
    const s = sh.selinux;
    if (!s) return;
    s.bools = Object.assign({}, BOOL_DEFAULT, s.bools);
    s.bpersist = Object.assign({}, s.bools);
    s.ports = {};
    for (const [k, v] of Object.entries(PORT_DEFAULTS)) s.ports[k] = v.slice();
    s.portsLocal = [];
    s.fcontexts = [];
    s.seq = 100;
    sh.rebootHooks = sh.rebootHooks || [];
    sh.rebootHooks.push((x) => {
      const cfg = ((x.fs.lookup('/etc/selinux/config') || {}).content) || '';
      const m = /^SELINUX=(\w+)/m.exec(cfg);
      if (m && x.selinux) {
        x.selinux.configMode = m[1];
        x.selinux.mode = m[1];
        x.selinux.bools = Object.assign({}, x.selinux.bpersist);
      }
    });
  });
  const portType = (sh, port) => {
    for (const [t, ps] of Object.entries(sh.selinux.ports)) if (ps.includes(port)) return t;
    return port < 1024 ? 'reserved_port_t' : 'unreserved_port_t';
  };
  const HTTP_TYPES = ['http_port_t', 'http_cache_port_t', 'pegasus_http_port_t', 'pegasus_https_port_t'];
  // --- AVC records ---
  LX.avc = function (sh, o) {
    const s = sh.selinux;
    const ts = Date.now() / 1000;
    const id = ++s.seq;
    const sctx = 'system_u:system_r:httpd_t:s0';
    let body;
    if (o.tclass === 'tcp_socket' && o.src) body = `avc:  denied  { name_bind } for  pid=${o.pid || 2401} comm="${o.comm}" src=${o.src} scontext=${sctx} tcontext=${o.tctx} tclass=tcp_socket permissive=${o.enforcing ? 0 : 1}`;
    else if (o.tclass === 'tcp_socket') body = `avc:  denied  { name_connect } for  pid=${o.pid || 881} comm="${o.comm}" dest=${o.dest} scontext=${sctx} tcontext=${o.tctx} tclass=tcp_socket permissive=${o.enforcing ? 0 : 1}`;
    else body = `avc:  denied  { ${o.perm} } for  pid=${o.pid || 881} comm="${o.comm}" name="${o.name}" dev="sda1" ino=${o.ino} scontext=${sctx} tcontext=${o.tctx} tclass=${o.tclass} permissive=${o.enforcing ? 0 : 1}`;
    const line = `type=AVC msg=audit(${ts.toFixed(3)}:${id}): ${body}\n`;
    if (!sh.fs.lookup('/var/log/audit')) sh.fs.mkdirp('/var/log/audit', { owner: 'root', group: 'root', mode: 0o700 });
    let au = sh.fs.lookup('/var/log/audit/audit.log');
    if (!au) au = sh.fs.put('/var/log/audit/audit.log', '', { owner: 'root', group: 'root', mode: 0o600 });
    au.content = (au.content || '') + line;
    sh.logEvent('kernel', 3, `audit: type=1400 audit(${ts.toFixed(3)}:${id}): ${body}`, { ident: 'audit' });
  };
  LX.selinuxPortCheck = function (sh, port, comm) {
    const s = sh.selinux;
    if (!s || s.mode === 'disabled') return true;
    const t = portType(sh, port);
    if (HTTP_TYPES.includes(t)) return true;
    const enforcing = s.mode === 'enforcing';
    LX.avc(sh, { src: port, comm, tctx: `system_u:object_r:${t}:s0`, tclass: 'tcp_socket', enforcing, pid: 2401 });
    return !enforcing;
  };
  LX.selinuxConnectCheck = function (sh, port, comm) {
    const s = sh.selinux;
    if (!s || s.mode === 'disabled') return true;
    const t = portType(sh, port);
    if (HTTP_TYPES.includes(t) || s.bools.httpd_can_network_connect) return true;
    const enforcing = s.mode === 'enforcing';
    LX.avc(sh, { dest: port, comm, tctx: `system_u:object_r:${t}:s0`, tclass: 'tcp_socket', enforcing, pid: 881 });
    return !enforcing;
  };

  def('setenforce', async (c, args) => {
    const sh = c.sh;
    const v = (args[0] || '').toLowerCase();
    if (!sh.selinux || sh.selinux.mode === 'disabled') {
      c.err('setenforce: SELinux is disabled\n');
      return 1;
    }
    if (needRoot(c, 'setenforce:  setenforce() failed\n')) return 1;
    if (['1', 'enforcing'].includes(v)) sh.selinux.mode = 'enforcing';
    else if (['0', 'permissive'].includes(v)) sh.selinux.mode = 'permissive';
    else {
      c.err('usage:  setenforce [ Enforcing | Permissive | 1 | 0 ]\n');
      return 1;
    }
    sh.logEvent('kernel', 5, `SELinux:  enforcing mode set to ${sh.selinux.mode}`, { ident: 'audit' });
    return 0;
  });
  def('getenforce', async (c) => {
    const m = c.sh.selinux.mode;
    c.out(({ enforcing: 'Enforcing', permissive: 'Permissive', disabled: 'Disabled' })[m] + '\n');
  });
  def('sestatus', async (c, args) => {
    const s = c.sh.selinux;
    if (s.mode === 'disabled') return c.out('SELinux status:                 disabled\n');
    let t = `SELinux status:                 enabled\nSELinuxfs mount:                /sys/fs/selinux\nSELinux root directory:         /etc/selinux\nLoaded policy name:             targeted\nCurrent mode:                   ${s.mode}\nMode from config file:          ${s.configMode}\nPolicy MLS status:              enabled\nPolicy deny_unknown status:     allowed\nMemory protection checking:     actual (secure)\nMax kernel policy version:      33\n`;
    if (args.includes('-b')) t += '\nPolicy booleans:\n' + Object.keys(s.bools).sort().map((k) => `${k.padEnd(31)} ${s.bools[k] ? 'on' : 'off'}`).join('\n') + '\n';
    c.out(t);
  });
  def('getsebool', async (c, args) => {
    const b = c.sh.selinux.bools;
    const names = args.includes('-a') ? Object.keys(b).sort() : args.filter((a) => !a.startsWith('-'));
    if (!names.length) { c.err('Usage: getsebool [-a] [boolean]\n'); return 1; }
    for (const n of names) {
      if (b[n] === undefined) { c.err(`getsebool:  SELinux boolean ${n} does not exist.\n`); return 1; }
      c.out(`${n} --> ${b[n] ? 'on' : 'off'}\n`);
    }
    return 0;
  });
  def('setsebool', async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, 'Could not change active booleans. Please try as root.\n')) return 1;
    const persist = args.includes('-P');
    const rest = args.filter((a) => !a.startsWith('-'));
    const pairs = [];
    if (rest.length === 1 && rest[0].includes('=')) pairs.push(rest[0].split('='));
    else if (rest.length >= 2) pairs.push([rest[0], rest[1]]);
    else { c.err('Usage: setsebool [ -P ] boolean value | bool1=val1 bool2=val2...\n'); return 1; }
    for (const [k, v] of pairs) {
      if (sh.selinux.bools[k] === undefined) { c.err(`Boolean ${k} is not defined\n`); return 1; }
      const on = ['on', '1', 'true'].includes(String(v).toLowerCase());
      if (!['on', '1', 'true', 'off', '0', 'false'].includes(String(v).toLowerCase())) { c.err('Usage: setsebool [ -P ] boolean value | bool1=val1 bool2=val2...\n'); return 1; }
      sh.selinux.bools[k] = on;
      if (persist) sh.selinux.bpersist[k] = on;
    }
    return 0;
  });

  def('semanage', async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, 'ValueError: SELinux policy management requires root. Try sudo.\n'.replace('ValueError: ', 'ValueError: ')) ) return 1;
    const s = sh.selinux;
    const sub = args[0];
    const { o, rest } = parseFlags(args.slice(1), ['-t', '-p', '-f', '-r', '-s', '--type', '--proto']);
    for (const [long, short] of [['add', 'a'], ['delete', 'd'], ['modify', 'm'], ['list', 'l'], ['locallist', 'C']]) if (o[long]) o[short] = true;
    const type = o.t || o.type;
    const proto = o.p || o.proto || 'tcp';
    if (sub === 'port') {
      if (o.l) {
        c.out('SELinux Port Type              Proto    Port Number\n\n');
        const rows = [];
        for (const [t, ps] of Object.entries(s.ports)) {
          const local = s.portsLocal.filter((x) => x.type === t).map((x) => x.port);
          if (o.C && !local.length) continue;
          rows.push(`${t.padEnd(30)} tcp      ${(o.C ? local : ps).join(', ')}`);
        }
        c.out(rows.join('\n') + (rows.length ? '\n' : ''));
        return 0;
      }
      const spec = rest[0];
      if (!spec && (o.a || o.d || o.m)) { c.err('ValueError: Port is required\n'); return 1; }
      if (!/^\d+(-\d+)?$/.test(spec || '0')) { c.err('ValueError: Invalid port\n'); return 1; }
      const port = +String(spec).split('-')[0];
      if (o.a || o.m) {
        if (!type) { c.err('ValueError: Type is required\n'); return 1; }
        if (!s.ports[type] && !/_port_t$/.test(type)) { c.err(`ValueError: Type ${type} is invalid, must be a port type\n`); return 1; }
        const have = Object.entries(s.ports).find(([, ps]) => ps.includes(port));
        if (o.a && have) { c.err(`ValueError: Port ${proto}/${port} already defined\n`); return 1; }
        if (o.m && !have) { c.err(`ValueError: Port ${proto}/${port} is not defined\n`); return 1; }
        if (have) s.ports[have[0]] = s.ports[have[0]].filter((x) => x !== port);
        (s.ports[type] = s.ports[type] || []).push(port);
        s.portsLocal.push({ type, port });
        return 0;
      }
      if (o.d) {
        const have = Object.entries(s.ports).find(([, ps]) => ps.includes(port));
        if (!have) { c.err(`ValueError: Port ${proto}/${port} is not defined\n`); return 1; }
        if (!s.portsLocal.some((x) => x.port === port)) { c.err(`ValueError: Port ${proto}/${port} is defined in policy, cannot be deleted\n`); return 1; }
        s.ports[have[0]] = s.ports[have[0]].filter((x) => x !== port);
        s.portsLocal = s.portsLocal.filter((x) => x.port !== port);
        return 0;
      }
    }
    if (sub === 'fcontext') {
      if (o.l) {
        c.out('SELinux fcontext                                   type               Context\n\n');
        const custom = s.fcontexts.map((f) => `${f.re.padEnd(50)} all files          system_u:object_r:${f.type}:s0 `);
        if (!o.C) {
          ['/var/www(/.*)?', '/var/log/nginx(/.*)?', '/etc/nginx(/.*)?', '/home/[^/]+/\\.ssh(/.*)?', '/srv(/.*)?'].forEach((re) => c.out(`${re.padEnd(50)} all files          ${builtinCtx(re.replace(/\(.*$/, '').replace(/\[\^\/\]\+/, 'x').replace(/\\/g, '')).replace(/^[^:]+/, 'system_u')} \n`));
        }
        custom.forEach((l) => c.out(l + '\n'));
        return 0;
      }
      const re = rest[0];
      if (o.a) {
        if (!re) { c.err('ValueError: File spec is required\n'); return 1; }
        if (!type) { c.err('ValueError: SELinux Type is required\n'); return 1; }
        if (s.fcontexts.some((f) => f.re === re)) { c.err(`ValueError: File context for ${re} already defined\n`); return 1; }
        s.fcontexts.push({ re, type });
        return 0;
      }
      if (o.m) {
        const f = s.fcontexts.find((x) => x.re === re);
        if (!f) { c.err(`ValueError: File context for ${re} is not defined\n`); return 1; }
        f.type = type || f.type;
        return 0;
      }
      if (o.d) {
        const i = s.fcontexts.findIndex((x) => x.re === re);
        if (i < 0) { c.err(`ValueError: File context for ${re} is not defined\n`); return 1; }
        s.fcontexts.splice(i, 1);
        return 0;
      }
    }
    if (sub === 'boolean') {
      if (o.l) {
        c.out('SELinux boolean                State  Default Description\n\n');
        for (const k of Object.keys(s.bools).sort()) {
          if (o.C && s.bools[k] === BOOL_DEFAULT[k]) continue;
          c.out(`${k.padEnd(30)} (${s.bools[k] ? 'on ' : 'off'}  ,  ${s.bpersist[k] ? 'on ' : 'off'})  ${(BOOLS[k] || ['', k.replace(/_/g, ' ')])[1]}\n`);
        }
        return 0;
      }
      if (o.m) {
        const name = rest[0];
        if (s.bools[name] === undefined) { c.err(`ValueError: Boolean ${name} is not defined\n`); return 1; }
        const on = !!o.on || (!o.off && ['1', 'on'].includes(rest[1]));
        s.bools[name] = on;
        s.bpersist[name] = on;
        return 0;
      }
    }
    if (sub === 'login' && o.l) { c.out('Login Name           SELinux User         MLS/MCS Range        Service\n\n__default__          unconfined_u         s0-s0:c0.c1023       *\nroot                 unconfined_u         s0-s0:c0.c1023       *\n'); return 0; }
    if (sub === 'module' && o.l) { c.out('Module Name                    Priority  Language\naccountsd                      100       pp\napache                         100       pp\nopenssh                        100       pp\n'); return 0; }
    c.err('usage: semanage [-h] {import,export,login,user,port,ibpkey,ibendport,interface,module,node,fcontext,boolean,permissive,dontaudit} ...\n');
    return 1;
  });

  /* ---- reading denials ---- */
  const avcLines = (sh) => ((sh.fs.lookup('/var/log/audit/audit.log') || {}).content || '').split('\n').filter((l) => /type=AVC/.test(l));
  const classify = (l) => {
    const m = (k) => (new RegExp(k + '=("?)([^"\\s]+)\\1').exec(l) || [])[2];
    const perm = (/\{ (\w+) \}/.exec(l) || [])[1];
    return { perm, comm: m('comm'), name: m('name'), src: m('src'), dest: m('dest'), scontext: m('scontext'), tcontext: m('tcontext'), tclass: m('tclass') };
  };
  const origAusearch = LX.cmds.ausearch.run;
  def('ausearch', async (c, args) => {
    const mI = args.findIndex((a) => a === '-m' || a === '--message');
    if (mI >= 0 && /avc/i.test(args[mI + 1] || '')) {
      if (needRoot(c, 'You must be root to run this program.\n')) return 1;
      const cI = args.indexOf('-c');
      let lines = avcLines(c.sh);
      if (cI >= 0) lines = lines.filter((l) => l.includes(`comm="${args[cI + 1]}"`));
      if (!lines.length) { c.out('<no matches>\n'); return 1; }
      for (const l of lines) {
        const ts = +(/audit\((\d+)/.exec(l) || [0, 0])[1];
        c.out(`----\ntime->${U.strftime('%a %b %e %H:%M:%S %Y', new Date(ts * 1000))}\n${l}\n`);
      }
      return 0;
    }
    return origAusearch(c, args);
  }, { pkg: 'auditd' });
  const audit2 = (why) => async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, 'Error: you need to be root to run this program\n')) return 1;
    let text;
    const iI = args.findIndex((a) => a === '-i' || a === '-i');
    if (args.includes('-a') || args.includes('--all')) text = avcLines(sh).join('\n');
    else if (iI >= 0) text = (sh.fs.lookup(c.abs(args[iI + 1])) || {}).content || '';
    else text = await c.slurp();
    const recs = text.split('\n').filter((l) => /type=AVC/.test(l)).map(classify);
    if (!recs.length) { c.err('Nothing to do\n'); return 1; }
    if (why) {
      for (const r of recs) {
        const line = text.split('\n').find((l) => l.includes(`comm="${r.comm}"`) && /type=AVC/.test(l));
        c.out(line + '\n\n\tWas caused by:\n');
        if (r.perm === 'name_connect') c.out('\tThe boolean httpd_can_network_connect was set incorrectly. \n\tDescription:\n\tAllow HTTPD scripts and modules to connect to the network using TCP.\n\n\tAllow access by executing:\n\t# setsebool -P httpd_can_network_connect 1\n\n');
        else c.out('\t\tMissing type enforcement (TE) allow rule.\n\n\t\tYou can use audit2allow to generate a loadable module to allow this access.\n\n');
      }
      return 0;
    }
    const groups = {};
    for (const r of recs) {
      const sd = typeOf(r.scontext || 'a:b:unknown_t:s0');
      const td = typeOf(r.tcontext || 'a:b:unknown_t:s0');
      const key = `${sd}`;
      (groups[key] = groups[key] || new Set()).add(r.perm === 'name_connect' ? `#!!!! This avc can be allowed using the boolean 'httpd_can_network_connect'\nallow ${sd} ${td}:tcp_socket name_connect;` : r.perm === 'name_bind' ? `allow ${sd} ${td}:tcp_socket name_bind;` : `allow ${sd} ${td}:${r.tclass} { getattr open read };`);
    }
    for (const [sd, rules] of Object.entries(groups)) c.out(`\n#============= ${sd} ==============\n${[...rules].join('\n')}\n`);
    return 0;
  };
  def('audit2why', audit2(true));
  def('audit2allow', audit2(false));
  def('sealert', async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, 'sealert: you must be root\n')) return 1;
    const lines = avcLines(sh);
    if (!lines.length) { c.out('100% done\nfound 0 alerts in /var/log/audit/audit.log\n'); return 0; }
    c.out(`100% done\nfound ${lines.length} alerts in /var/log/audit/audit.log\n`);
    const sep = '-'.repeat(80);
    for (const l of lines) {
      const r = classify(l);
      c.out(`${sep}\n\n`);
      if (r.perm === 'name_bind') c.out(`SELinux is preventing /usr/sbin/${r.comm} from name_bind access on the tcp_socket port ${r.src}.\n\n*****  Plugin bind_ports (99.5 confidence) suggests   ************************\n\nIf you want to allow /usr/sbin/${r.comm} to bind to network port ${r.src}\nThen you need to modify the port type.\nDo\n# semanage port -a -t PORT_TYPE -p tcp ${r.src}\n    where PORT_TYPE is one of the following: http_port_t, http_cache_port_t, ...\n\n`);
      else if (r.perm === 'name_connect') c.out(`SELinux is preventing /usr/sbin/${r.comm} from name_connect access on the tcp_socket port ${r.dest}.\n\n*****  Plugin catchall_boolean (89.3 confidence) suggests   ******************\n\nIf you want to allow httpd to can network connect\nThen you must tell SELinux about this by enabling the 'httpd_can_network_connect' boolean.\n\nDo\nsetsebool -P httpd_can_network_connect 1\n\n`);
      else c.out(`SELinux is preventing /usr/sbin/${r.comm} from ${r.perm} access on the file ${r.name}.\n\n*****  Plugin catchall_labels (83.8 confidence) suggests   *******************\n\nIf you want to allow ${r.comm} to have ${r.perm} access on the ${r.name} file\nThen you need to change the label on ${r.name}\nDo\n# semanage fcontext -a -t FILE_TYPE '${r.name}'\nwhere FILE_TYPE is one of the following: httpd_sys_content_t, httpd_sys_rw_content_t, ...\nThen execute:\nrestorecon -v '${r.name}'\n\n`);
    }
    return 0;
  });

  /* ---- ps -Z ---- */
  const LABELS = { nginx: 'system_u:system_r:httpd_t:s0', httpd: 'system_u:system_r:httpd_t:s0', apache2: 'system_u:system_r:httpd_t:s0', ssh: 'system_u:system_r:sshd_t:s0-s0:c0.c1023', sshd: 'system_u:system_r:sshd_t:s0-s0:c0.c1023', cron: 'system_u:system_r:crond_t:s0-s0:c0.c1023', rsyslog: 'system_u:system_r:syslogd_t:s0' };
  const labelFor = (p) => {
    const nm = p.svc || '';
    if (LABELS[nm]) return LABELS[nm];
    if (/\[kthreadd\]|^\[/.test(p.cmd)) return 'system_u:system_r:kernel_t:s0';
    if (/init|systemd/.test(p.cmd) && p.pid <= 700) return 'system_u:system_r:init_t:s0';
    if (/rsyslog/.test(p.cmd)) return LABELS.rsyslog;
    if (p.mine) return 'unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023';
    return 'system_u:system_r:unconfined_service_t:s0';
  };
  const origPs = LX.cmds.ps.run;
  def('ps', async (c, args) => {
    const flat = args.join(' ');
    if (/(^|\s)-?[a-zA-Z]*Z[a-zA-Z]*(\s|$)/.test(flat)) {
      const sh = c.sh;
      const all = sh.procList();
      const rows = /e|ax|A/.test(flat.replace(/-?Z/g, '')) ? all : all.filter((p) => p.mine);
      if (/aux/.test(flat)) {
        c.out('LABEL                               USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n');
        rows.forEach((p) => c.out(`${labelFor(p).padEnd(35)} ${p.user.padEnd(9)} ${String(p.pid).padStart(6)}  ${p.cpu.toFixed(1)}  ${p.mem.toFixed(1)} ${String(Math.round(p.mem * 40467 * 4 + 12000)).padStart(6)} ${String(Math.round(p.mem * 40467)).padStart(5)} ${p.tty.padEnd(8)} ${p.stat.padEnd(4)} 08:00   0:00 ${p.cmd}\n`));
      } else {
        c.out('LABEL                               PID TTY          TIME CMD\n');
        rows.forEach((p) => c.out(`${labelFor(p).padEnd(35)} ${String(p.pid).padStart(5)} ${p.tty.padEnd(8)} 00:00:00 ${VFS.base(p.cmd.split(' ')[0]).replace(/^-/, '')}\n`));
      }
      return 0;
    }
    return origPs(c, args);
  });

  /* ============================== AppArmor ============================== */
  const AA_DIR = '/etc/apparmor.d';
  const TCPDUMP_PROFILE = '# Profile for tcpdump (simplified)\n#include <tunables/global>\n\nprofile tcpdump /usr/bin/tcpdump {\n  #include <abstractions/base>\n  #include <abstractions/nameservice>\n\n  capability net_raw,\n  capability setuid,\n  capability setgid,\n  capability dac_override,\n  network raw,\n  network packet,\n\n  # for -w and -r: only the home directories and /tmp are allowed\n  @{HOME}/ r,\n  @{HOME}/** rw,\n  /tmp/** rw,\n  /usr/bin/tcpdump mr,\n\n  #include if exists <local/usr.bin.tcpdump>\n}\n';
  const BASE_PROFILES = { 'usr.bin.man': ['/usr/bin/man', '/usr/bin/man'], lsb_release: ['lsb_release', '/usr/bin/lsb_release'], nvidia_modprobe: ['nvidia_modprobe', '/usr/bin/nvidia-modprobe'], 'usr.sbin.cups-browsed': ['/usr/sbin/cups-browsed', '/usr/sbin/cups-browsed'] };
  LX.initHooks.push((sh) => {
    const o = { owner: 'root', group: 'root' };
    for (const d of [AA_DIR, AA_DIR + '/tunables', AA_DIR + '/abstractions', AA_DIR + '/local', AA_DIR + '/disable', AA_DIR + '/force-complain']) sh.fs.mkdirp(d, o);
    sh.fs.put(AA_DIR + '/tunables/global', '# Variables used by profiles\n@{HOME}=@{HOMEDIRS}/*/ /root/\n@{HOMEDIRS}=/home/\n@{PROC}=/proc/\n', o);
    sh.fs.put(AA_DIR + '/abstractions/base', '# common rules for all programs\n  /lib/** mr,\n  /usr/lib/** mr,\n', o);
    sh.fs.put(AA_DIR + '/abstractions/nameservice', '# name service lookups\n  /etc/hosts r,\n  /etc/resolv.conf r,\n', o);
    for (const [f, [name, path]] of Object.entries(BASE_PROFILES)) sh.fs.put(`${AA_DIR}/${f}`, `#include <tunables/global>\n\nprofile ${name} ${path} {\n  #include <abstractions/base>\n  ${path} mr,\n}\n`, o);
    sh.aa = { modes: {}, loaded: {} };
    aaReload(sh);
    sh.services.apparmor = { desc: 'Load AppArmor profiles', active: true, enabled: true, pid: 0, proc: 'apparmor', since: Date.now(), oneshot: true, unit: '/usr/lib/systemd/system/apparmor.service' };
    sh.serviceHooks = sh.serviceHooks || {};
    sh.serviceHooks.apparmor = async (c, action) => {
      const r = aaReload(sh, true);
      if (r.err) {
        sh.logEvent('apparmor.service', 3, r.err, { ident: 'apparmor' });
        if (c.err) c.err(r.err + '\n');
        return { ok: false, code: 1 };
      }
      return { ok: true };
    };
    sh.rebootHooks = sh.rebootHooks || [];
    sh.rebootHooks.push((x) => aaReload(x, true));
  });
  const PROFILE_RE = /^\s*(?:profile\s+(\S+)\s+)?(\/\S+|\S+)\s*(?:flags=\(([^)]*)\)\s*)?\{\s*$/;
  /** parse one profile file; returns {name,path,rules,flags} or {err} */
  function parseProfile(sh, file) {
    const text = (sh.fs.lookup(file) || {}).content || '';
    const lines = text.split('\n');
    let prof = null;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const l = raw.replace(/#(?!include).*$/, '').trim();
      if (!l) continue;
      const inc = /^#include\s+(if exists\s+)?<([^>]+)>/.exec(raw.trim());
      if (inc) {
        if (prof && inc[2].startsWith('local/')) {
          const lf = sh.fs.lookup(AA_DIR + '/' + inc[2]);
          if (lf) {
            const sub = parseRules(lf.content || '', AA_DIR + '/' + inc[2]);
            if (sub.err) return sub;
            prof.rules.push(...sub.rules);
          }
        }
        continue;
      }
      if (!prof) {
        if (/^#?\s*include/.test(l) || /^@\{/.test(l)) continue;
        const m = /^(?:profile\s+(\S+)\s+)?(\/\S+)\s*(?:flags=\(([^)]*)\)\s*)?\{$/.exec(l);
        if (m) prof = { name: m[1] || m[2], path: m[2], flags: m[3] || '', rules: [], file };
        continue;
      }
      if (l === '}') return prof;
      const r = parseRules(l, file, i + 1);
      if (r.err) return r;
      prof.rules.push(...r.rules);
    }
    return prof || { err: `AppArmor parser error for ${file} in ${file}: no profile found` };
  }
  function parseRules(text, file, startLine) {
    const rules = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].replace(/#.*$/, '').trim();
      if (!l) continue;
      if (/^(capability|network|signal|ptrace|unix|dbus|mount|umount|pivot_root|change_profile|include)\b/.test(l)) {
        if (!/,$/.test(l)) return { err: `AppArmor parser error for ${file} in ${file} at line ${(startLine || 1) + i}: syntax error, unexpected TOK_ID, expecting TOK_COMMA` };
        continue;
      }
      const m = /^(audit\s+)?(deny\s+)?(owner\s+)?(\S+)\s+([a-zA-Z]+)\s*,$/.exec(l);
      if (!m) {
        if (/^(\/|@\{|audit|deny|owner)/.test(l)) return { err: `AppArmor parser error for ${file} in ${file} at line ${(startLine || 1) + i}: syntax error, unexpected TOK_ID, expecting TOK_COMMA` };
        continue;
      }
      rules.push({ deny: !!m[2], path: m[4], perms: m[5] });
    }
    return { rules };
  }
  function aaReload(sh, strict) {
    const aa = sh.aa;
    const dir = sh.fs.lookup(AA_DIR);
    const loaded = {};
    for (const [k, n] of Object.entries((dir && dir.kids) || {})) {
      if (n.t !== 'f' || k.startsWith('.')) continue;
      if (sh.fs.lookup(AA_DIR + '/disable/' + k)) continue;
      const p = parseProfile(sh, AA_DIR + '/' + k);
      if (p.err) {
        if (strict) return { err: p.err };
        continue;
      }
      let mode = aa.modes[p.name];
      if (!mode) mode = /complain/.test(p.flags) || sh.fs.lookup(AA_DIR + '/force-complain/' + k) ? 'complain' : 'enforce';
      loaded[p.name] = { name: p.name, path: p.path, rules: p.rules, file: AA_DIR + '/' + k, mode };
    }
    aa.loaded = loaded;
    return { ok: true };
  }
  LX.aaReloadSh = (sh) => aaReload(sh);
  const globRe = (g) => {
    const home = '(?:/root|/home/[^/]+)';
    let re = g.replace(/@\{HOME\}/g, '\u0001').replace(/[.+^$()|\\]/g, '\\$&').replace(/\?/g, '[^/]').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*').replace(/\u0002/g, '.*').replace(/\u0001/g, home);
    return new RegExp('^' + re + '$');
  };
  /** may the confined program at exePath use filePath with mask (r/w)? returns {ok, profile, mode} */
  LX.aaCheck = function (sh, exePath, filePath, mask) {
    const prof = Object.values((sh.aa && sh.aa.loaded) || {}).find((p) => p.path === exePath);
    if (!prof) return { ok: true };
    let allowed = false;
    let denied = false;
    for (const r of prof.rules) {
      if (!globRe(r.path).test(filePath) && !globRe(r.path.replace(/\/$/, '')).test(filePath)) continue;
      const hasAll = [...mask].every((m) => r.perms.includes(m) || (m === 'c' && r.perms.includes('w')));
      if (r.deny && [...mask].some((m) => r.perms.includes(m))) denied = true;
      else if (!r.deny && hasAll) allowed = true;
    }
    const ok = allowed && !denied;
    return { ok: ok || prof.mode === 'complain', profile: prof, wouldDeny: !ok, mode: prof.mode };
  };
  LX.aaLog = function (sh, c, prof, file, mask, comm) {
    const complain = prof.mode === 'complain';
    const ts = (Date.now() / 1000).toFixed(3);
    const msg = `audit: type=${complain ? 1400 : 1400} audit(${ts}:${++sh.selinux.seq}): apparmor="${complain ? 'ALLOWED' : 'DENIED'}" operation="open" class="file" profile="${prof.name}" name="${file}" pid=${sh.nextPid} comm="${comm}" requested_mask="${mask}" ${complain ? 'denied_mask' : 'denied_mask'}="${mask}" fsuid=0 ouid=0`;
    sh.logEvent('kernel', complain ? 5 : 4, msg, { ident: 'kernel' });
    const fs = sh.fs.lookup('/var/log/kern.log');
    if (fs) fs.content += `${U.strftime('%b %e %H:%M:%S', new Date())} ${sh.hostname || 'linux-school'} kernel: ${msg}\n`;
  };
  const origOnInstall = P.onInstall;
  P.onInstall = function (p, pk) {
    origOnInstall.call(this, p, pk);
    if (p === 'tcpdump') {
      this.fs.put(AA_DIR + '/usr.bin.tcpdump', TCPDUMP_PROFILE, { owner: 'root', group: 'root' });
      this.fs.put(AA_DIR + '/local/usr.bin.tcpdump', '# Site-specific additions and overrides for usr.bin.tcpdump.\n# For more details, please see /etc/apparmor.d/local/README.\n', { owner: 'root', group: 'root' });
      aaReload(this);
    }
  };
  const onRemove0 = P.onRemove;
  P.onRemove = function (p) {
    if (onRemove0) onRemove0.call(this, p);
    if (p === 'tcpdump') {
      const d = this.fs.lookup(AA_DIR);
      if (d) delete d.kids['usr.bin.tcpdump'];
      aaReload(this);
    }
  };
  LX.PKGS.tcpdump = LX.PKGS.tcpdump || { ver: '4.99.4-3ubuntu4', desc: 'command-line network traffic analyzer', size: 460, bins: ['tcpdump'] };

  const findProfile = (sh, arg) => {
    const all = Object.values(sh.aa.loaded);
    const disabled = [];
    const d = sh.fs.lookup(AA_DIR + '/disable');
    return all.find((p) => p.name === arg || p.path === arg || p.file === arg || p.file === AA_DIR + '/' + arg || VFS.base(p.file) === VFS.base(arg)) || null;
  };
  const aaStatus = async (c) => {
    const sh = c.sh;
    if (needRoot(c, 'You need to be root to run this program.\n')) return 1;
    const ps = Object.values(sh.aa.loaded).sort((a, b) => a.name.localeCompare(b.name));
    const enf = ps.filter((p) => p.mode === 'enforce');
    const com = ps.filter((p) => p.mode === 'complain');
    c.out(`apparmor module is loaded.\n${ps.length} profiles are loaded.\n${enf.length} profiles are in enforce mode.\n${enf.map((p) => '   ' + p.name).join('\n')}${enf.length ? '\n' : ''}${com.length} profiles are in complain mode.\n${com.map((p) => '   ' + p.name).join('\n')}${com.length ? '\n' : ''}0 profiles are in kill mode.\n0 profiles are in unconfined mode.\n0 processes have profiles defined.\n0 processes are in enforce mode.\n0 processes are in complain mode.\n0 processes are unconfined but have a profile defined.\n0 processes are in mixed mode.\n0 processes are in kill mode.\n`);
    return 0;
  };
  def('aa-status', aaStatus);
  def('apparmor_status', aaStatus);
  def('aa-enabled', async (c) => c.out('Yes\n'));
  const modeCmd = (mode) => async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, `ERROR: Cannot read profile ${args[0] || ''}: Permission denied\n`.replace('ERROR: Cannot read profile', 'AppArmor: you must be root; cannot read profile')) ) return 1;
    const targets = args.filter((a) => !a.startsWith('-'));
    if (!targets.length) { c.err(`usage: aa-${mode} [options] [program]\n`); return 1; }
    let st = 0;
    for (const t of targets) {
      let p = findProfile(sh, t);
      if (!p) {
        const dd = sh.fs.lookup(AA_DIR + '/disable');
        const bn = Object.keys((dd && dd.kids) || {}).find((k) => t.includes(k.replace(/\./g, '/')) || k === VFS.base(t));
        if (mode !== 'disable' && bn) {
          delete dd.kids[bn];
          aaReload(sh);
          p = findProfile(sh, t);
        }
      }
      if (!p) { c.err(`Profile for ${t} not found, skipping\n`); st = 1; continue; }
      if (mode === 'disable') {
        c.out(`Disabling ${p.file}.\n`);
        sh.fs.mkdirp(AA_DIR + '/disable', { owner: 'root', group: 'root' });
        sh.fs.lookup(AA_DIR + '/disable').kids[VFS.base(p.file)] = sh.fs.mk('l', { target: p.file, owner: 'root', group: 'root', mode: 0o777 });
        delete sh.aa.modes[p.name];
        aaReload(sh);
      } else {
        c.out(`Setting ${p.file} to ${mode} mode.\n`);
        sh.aa.modes[p.name] = mode;
        p.mode = mode;
      }
    }
    return st;
  };
  def('aa-enforce', modeCmd('enforce'));
  def('aa-complain', modeCmd('complain'));
  def('aa-disable', modeCmd('disable'));
  def('aa-unconfined', async (c) => {
    const sh = c.sh;
    if (needRoot(c, 'You need to be root to run this program.\n')) return 1;
    for (const [port, l] of Object.entries(sh.listeners)) {
      if (!l.proc) continue;
      const exe = l.proc === 'sshd' ? '/usr/sbin/sshd' : `/usr/sbin/${l.proc}`;
      c.out(`${l.pid || 880} ${exe} not confined\n`);
    }
    return 0;
  });
  def('apparmor_parser', async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, 'apparmor_parser: Permission denied\n')) return 1;
    const f = args.filter((a) => !a.startsWith('-')).pop();
    if (!f) { c.err('apparmor_parser: no profile specified\n'); return 1; }
    const n = sh.fs.lookup(c.abs(f));
    if (!n) { c.err(`File ${f} not found, skipping...\n`); return 1; }
    const p = parseProfile(sh, c.abs(f));
    if (p.err) { c.err(p.err + '\n'); return 1; }
    if (args.includes('-R')) {
      delete sh.aa.loaded[p.name];
      return 0;
    }
    let mode = sh.aa.modes[p.name] || (/complain/.test(p.flags) ? 'complain' : 'enforce');
    sh.aa.loaded[p.name] = { name: p.name, path: p.path, rules: p.rules, file: c.abs(f), mode };
    return 0;
  });

  /* tcpdump -w / -r under AppArmor */
  const origTcpdump = LX.cmds.tcpdump.run;
  def('tcpdump', async (c, args) => {
    const sh = c.sh;
    const wI = args.indexOf('-w');
    const rI = args.indexOf('-r');
    if (wI < 0 && rI < 0) return origTcpdump(c, args);
    if (sh.eu() !== 'root') { c.err('tcpdump: eth0: You don\'t have permission to perform this capture on that device\n(socket: Operation not permitted)\n'); return 1; }
    const f = args[(wI >= 0 ? wI : rI) + 1];
    if (!f) { c.err('tcpdump: option requires an argument -- ' + (wI >= 0 ? 'w' : 'r') + '\n'); return 1; }
    const abs = c.abs(f);
    const mask = wI >= 0 ? 'wc' : 'r';
    const dir = sh.fs.lookup(VFS.dirname(abs));
    if (wI >= 0 && (!dir || dir.t !== 'd')) { c.err(`tcpdump: ${f}: No such file or directory\n`); return 1; }
    if (rI >= 0 && !sh.fs.lookup(abs)) { c.err(`tcpdump: ${f}: No such file or directory\n`); return 1; }
    const chk = LX.aaCheck(sh, '/usr/bin/tcpdump', abs, mask);
    if (chk.profile && chk.wouldDeny) {
      LX.aaLog(sh, c, chk.profile, abs, mask, 'tcpdump');
      if (chk.mode === 'enforce') { c.err(`tcpdump: ${f}: Permission denied\n`); return 1; }
    }
    const cI = args.indexOf('-c');
    const n = cI >= 0 ? +args[cI + 1] || 3 : 3;
    if (wI >= 0) {
      sh.writeFile(abs, 'ÔÃ²¡(pcap capture data)', false);
      const nd = sh.fs.lookup(abs);
      nd.bin = true;
      nd.size = 24 + n * 96;
      c.err(`tcpdump: listening on eth0, link-type EN10MB (Ethernet), snapshot length 262144 bytes\n${n} packets captured\n${n} packets received by filter\n0 packets dropped by kernel\n`);
      return 0;
    }
    const t = U.strftime('%H:%M:%S', new Date());
    c.err('reading from file ' + f + ', link-type EN10MB (Ethernet), snapshot length 262144\n');
    for (let i = 0; i < Math.min(n, 3); i++) c.out(`${t}.10${i}233 IP 192.168.1.5.52244 > 192.168.1.10.22: Flags [P.], seq ${1 + i * 36}:${37 + i * 36}, ack 1, win 501, length 36\n`);
    return 0;
  }, { pkg: 'tcpdump' });
})();
