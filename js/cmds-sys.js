/* Linux Academy: shell builtins, users, processes, packages, network */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS, ExitSig, LoopSig, RetSig, AbortSig, CmdErr } = LX;
  const U = LX.U;
  const base = VFS.base;

  /* ============ builtins ============ */
  def(':', async () => 0, { builtin: true });
  def('true', async () => 0, { builtin: true, bin: true });
  def('false', async () => 1, { builtin: true, bin: true });
  def(
    'exit',
    async (c, args) => {
      throw new ExitSig(args[0] !== undefined ? parseInt(args[0], 10) || 0 : c.sh.status);
    },
    { builtin: true }
  );
  def('logout', (c, a) => LX.cmds.exit.run(c, a), { builtin: true });
  def(
    'return',
    async (c, args) => {
      throw new RetSig(args[0] !== undefined ? parseInt(args[0], 10) || 0 : c.sh.status);
    },
    { builtin: true }
  );
  def('break', async (c, args) => {
    throw new LoopSig('break', +(args[0] || 1));
  }, { builtin: true });
  def('continue', async (c, args) => {
    throw new LoopSig('continue', +(args[0] || 1));
  }, { builtin: true });
  def(
    'shift',
    async (c, args) => {
      const fr = c.sh.argStack[c.sh.argStack.length - 1];
      if (fr) fr.args.splice(0, args[0] ? parseInt(args[0], 10) || 1 : 1);
    },
    { builtin: true }
  );
  def(
    'local',
    async (c, args) => {
      const top = c.sh.localStack[c.sh.localStack.length - 1];
      for (const a of args) {
        const [k, v] = a.split(/=(.*)/s);
        if (top) top[k] = v === undefined ? '' : v;
        else c.sh.vars[k] = v === undefined ? '' : v;
      }
    },
    { builtin: true }
  );
  def(
    'let',
    async (c, args) => {
      let last = 0;
      for (const a of args) {
        const m = /^([A-Za-z_]\w*)\s*(\+=|-=|\*=|=)\s*(.*)$/.exec(a);
        if (m) {
          let v = Number(c.sh.arith(m[3]));
          const cur = Number(c.sh.getVar(m[1])) || 0;
          if (m[2] === '+=') v = cur + v;
          if (m[2] === '-=') v = cur - v;
          if (m[2] === '*=') v = cur * v;
          c.sh.setVar(m[1], String(v));
          last = v;
        } else last = Number(c.sh.arith(a));
      }
      return last === 0 ? 1 : 0;
    },
    { builtin: true }
  );
  def(
    'export',
    async (c, args) => {
      const sh = c.sh;
      if (!args.length || args[0] === '-p') {
        for (const k of [...sh.exported].sort()) c.out(`declare -x ${k}="${sh.getVar(k) ?? ''}"\n`);
        return 0;
      }
      for (const a of args) {
        const [k, v] = a.split(/=(.*)/s);
        if (!/^[A-Za-z_]\w*$/.test(k)) {
          c.err(`bash: export: \`${a}': not a valid identifier\n`);
          return 1;
        }
        if (v !== undefined) sh.setVar(k, v);
        sh.exported.add(k);
      }
      return 0;
    },
    { builtin: true }
  );
  def(
    'unset',
    async (c, args) => {
      for (const a of args) {
        if (a === '-f' || a === '-v') continue;
        delete c.sh.vars[a];
        delete c.sh.funcs[a];
        c.sh.exported.delete(a);
      }
    },
    { builtin: true }
  );
  def(
    'alias',
    async (c, args) => {
      const sh = c.sh;
      if (!args.length) {
        for (const [k, v] of Object.entries(sh.aliases).sort()) c.out(`alias ${k}='${v}'\n`);
        return 0;
      }
      let st = 0;
      for (const a of args) {
        const i = a.indexOf('=');
        if (i < 0) {
          if (sh.aliases[a]) c.out(`alias ${a}='${sh.aliases[a]}'\n`);
          else {
            c.err(`bash: alias: ${a}: not found\n`);
            st = 1;
          }
        } else sh.aliases[a.slice(0, i)] = a.slice(i + 1);
      }
      return st;
    },
    { builtin: true }
  );
  def(
    'unalias',
    async (c, args) => {
      let st = 0;
      for (const a of args) {
        if (a === '-a') c.sh.aliases = {};
        else if (c.sh.aliases[a]) delete c.sh.aliases[a];
        else {
          c.err(`bash: unalias: ${a}: not found\n`);
          st = 1;
        }
      }
      return st;
    },
    { builtin: true }
  );
  def(
    'history',
    async (c, args) => {
      const h = c.sh.history;
      if (args[0] === '-c') {
        h.length = 0;
        return 0;
      }
      const n = args[0] && /^\d+$/.test(args[0]) ? +args[0] : h.length;
      const start = Math.max(0, h.length - n);
      h.slice(start).forEach((l, i) => c.out(`${String(start + i + 1).padStart(5)}  ${l}\n`));
    },
    { builtin: true }
  );
  const sourceFn = async (c, args) => {
    if (!args.length) {
      c.err('bash: source: filename argument required\n');
      return 2;
    }
    const abs = c.abs(args[0]);
    try {
      const text = c.sh.readFile(abs);
      const saveFrame = c.sh.argStack.length;
      return await c.sh.runScript(text, args.slice(1), c.io, args[0], true);
    } catch (e) {
      if (!(e instanceof FsErr)) throw e;
      c.err(`bash: ${args[0]}: ${U.errTxt(e)}\n`);
      return 1;
    }
  };
  def('source', sourceFn, { builtin: true });
  def('.', sourceFn, { builtin: true });
  def(
    'eval',
    async (c, args) => {
      return await c.sh.runSource(args.join(' '), c.io);
    },
    { builtin: true }
  );
  def(
    'read',
    async (c, args) => {
      const sh = c.sh;
      let prompt = '';
      let secret = false;
      let raw = false;
      let arrName = null;
      let delim = '\n';
      let nchars = null;
      const names = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-p') prompt = args[++i];
        else if (a === '-a') arrName = args[++i];
        else if (a === '-d') delim = args[++i] === '' ? '\0' : args[i];
        else if (a === '-n' || a === '-N') nchars = +args[++i];
        else if (a === '-t' || a === '-u') i++;
        else if (/^-[a-zA-Z]+$/.test(a)) {
          for (let k = 1; k < a.length; k++) {
            const ch = a[k];
            if (ch === 's') secret = true;
            else if (ch === 'r') raw = true;
            else if (ch === 'p' && k === a.length - 1) prompt = args[++i];
            else if (ch === 'a' && k === a.length - 1) arrName = args[++i];
            else if (ch === 'd' && k === a.length - 1) delim = args[++i] === '' ? '\0' : args[i];
            else if ((ch === 'n' || ch === 'N') && k === a.length - 1) nchars = +args[++i];
            else if ((ch === 't' || ch === 'u') && k === a.length - 1) i++;
          }
        } else names.push(a);
      }
      let line = null;
      if (c.io.stdin !== null && c.io.stdin !== undefined) {
        if (c.io.stdin === '') return 1;
        if (nchars) {
          line = c.io.stdin.slice(0, nchars);
          c.io.stdin = c.io.stdin.slice(nchars);
        } else {
          const i = c.io.stdin.indexOf(delim);
          line = i < 0 ? c.io.stdin : c.io.stdin.slice(0, i);
          c.io.stdin = i < 0 ? '' : c.io.stdin.slice(i + delim.length);
          if (i < 0 && !line) return 1;
        }
      } else if (sh.hooks.readLine) {
        line = await sh.hooks.readLine(prompt, { secret });
        sh.checkAbort();
      } else return 1;
      if (line === null) return 1;
      if (!raw) line = line.replace(/\\(.)/g, '$1');
      if (!names.length && !arrName) {
        sh.setVar('REPLY', line);
        return 0;
      }
      const ifs = sh.vars.IFS !== undefined ? String(sh.vars.IFS) : ' \t\n';
      const W = [...ifs].filter((ch) => ' \t\n'.includes(ch)).join('').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
      const NW = [...ifs].filter((ch) => !' \t\n'.includes(ch)).join('').replace(/[\]\\^-]/g, '\\$&');
      const wsRe = W ? new RegExp('^[' + W + ']+') : null;
      const wsEnd = W ? new RegExp('[' + W + ']+$') : null;
      let sepSrc = [];
      if (NW) sepSrc.push((W ? '[' + W + ']*' : '') + '[' + NW + ']' + (W ? '[' + W + ']*' : ''));
      if (W) sepSrc.push('[' + W + ']+');
      const sep = sepSrc.length ? new RegExp(sepSrc.join('|')) : null;
      let rest = wsRe ? line.replace(wsRe, '') : line;
      const take = (limit) => {
        const out = [];
        while (rest !== '' && (limit === null || out.length < limit - 1) && sep) {
          const m = sep.exec(rest);
          if (!m) break;
          out.push(rest.slice(0, m.index));
          rest = rest.slice(m.index + m[0].length);
        }
        if (limit === null || out.length === limit - 1) {
          if (limit !== null) {
            const tail = wsEnd ? rest.replace(wsEnd, '') : rest;
            out.push(tail);
          } else if (rest !== '') out.push(wsEnd ? rest.replace(wsEnd, '') : rest);
        } else if (rest !== '') out.push(rest);
        return out;
      };
      if (arrName) {
        const fields = ifs === '' ? [line] : take(null);
        sh.arrays[arrName] = fields;
        return 0;
      }
      const fields = ifs === '' ? [line] : take(names.length);
      names.forEach((n, i) => sh.setVar(n, fields[i] !== undefined ? fields[i] : ''));
      return 0;
    },
    { builtin: true }
  );
  def(
    'set',
    async (c, args) => {
      if (!args.length) for (const [k, v] of Object.entries(c.sh.vars)) c.out(`${k}=${v}\n`);
      return 0;
    },
    { builtin: true }
  );
  def('wait', async () => 0, { builtin: true });
  def('nohup', async (c, args) => c.sh.dispatch(args, c.io), { bin: true });

  /* ---- test / [ ---- */
  function testExpr(c, a) {
    const sh = c.sh;
    const un = (op, x) => {
      const n = sh.stat(x);
      switch (op) {
        case '-e': return !!n;
        case '-f': return !!n && n.t === 'f';
        case '-d': return !!n && n.t === 'd';
        case '-L': case '-h': return !!sh.stat(x, false) && sh.stat(x, false).t === 'l';
        case '-r': return !!n && sh.can(n, 4);
        case '-w': return !!n && sh.can(n, 2);
        case '-x': return !!n && sh.can(n, 1);
        case '-s': return !!n && VFS.size(n) > 0;
        case '-z': return x === '';
        case '-n': return x !== '';
      }
      throw new CmdErr(`unary operator expected`);
    };
    const bin = (x, op, y) => {
      const nx = parseInt(x, 10);
      const ny = parseInt(y, 10);
      switch (op) {
        case '=': case '==': return x === y;
        case '!=': return x !== y;
        case '<': return x < y;
        case '>': return x > y;
        case '-eq': return nx === ny;
        case '-ne': return nx !== ny;
        case '-lt': return nx < ny;
        case '-le': return nx <= ny;
        case '-gt': return nx > ny;
        case '-ge': return nx >= ny;
        case '=~': return new RegExp(y).test(x);
      }
      throw new CmdErr(`${op}: binary operator expected`);
    };
    let p = 0;
    const isBinOp = (t) => ['=', '==', '!=', '<', '>', '-eq', '-ne', '-lt', '-le', '-gt', '-ge', '=~'].includes(t);
    function prim() {
      const t = a[p];
      if (t === '!') {
        p++;
        return !prim();
      }
      if (t === '(') {
        p++;
        const v = or();
        p++;
        return v;
      }
      if (a[p + 1] !== undefined && isBinOp(a[p + 1]) && a[p + 2] !== undefined) {
        const r = bin(a[p], a[p + 1], a[p + 2]);
        p += 3;
        return r;
      }
      if (/^-[a-zA-Z]$/.test(t) && a[p + 1] !== undefined) {
        const r = un(t, a[p + 1]);
        p += 2;
        return r;
      }
      p++;
      return t !== undefined && t !== '';
    }
    function and() {
      let v = prim();
      while (a[p] === '-a' || a[p] === '&&') {
        p++;
        const r = prim();
        v = v && r;
      }
      return v;
    }
    function or() {
      let v = and();
      while (a[p] === '-o' || a[p] === '||') {
        p++;
        const r = and();
        v = v || r;
      }
      return v;
    }
    return a.length ? or() : false;
  }
  for (const nm of ['test', '[', '[[']) {
    def(
      nm,
      async (c, args) => {
        let a = args.slice();
        if (nm === '[' || nm === '[[') {
          const close = nm === '[' ? ']' : ']]';
          if (a[a.length - 1] !== close) {
            c.err(`bash: ${nm}: missing \`${close}'\n`);
            return 2;
          }
          a.pop();
        }
        try {
          return testExpr(c, a) ? 0 : 1;
        } catch (e) {
          if (e instanceof CmdErr) {
            c.err(`bash: ${nm}: ${e.message}\n`);
            return 2;
          }
          throw e;
        }
      },
      { builtin: true, bin: nm === 'test' || nm === '[' }
    );
  }

  /* ---- identity ---- */
  def('whoami', async (c) => c.out(c.sh.eu() + '\n'));
  def('logname', async (c) => c.out(c.sh.user + '\n'));
  const GIDS = { root: 0, adm: 4, sudo: 27, users: 100, shadow: 42, 'www-data': 33 };
  const gidOf = (sh, g) => (GIDS[g] !== undefined ? GIDS[g] : sh.users[g] ? sh.users[g].gid : 999);
  def('id', async (c, args) => {
    const sh = c.sh;
    const name = args.find((a) => !a.startsWith('-')) || sh.eu();
    const u = sh.users[name];
    if (!u) {
      c.err(`id: ‘${name}’: no such user\n`);
      return 1;
    }
    if (args.includes('-u')) return c.out(u.uid + '\n');
    if (args.includes('-un')) return c.out(name + '\n');
    if (args.includes('-gn')) return c.out(u.groups[0] + '\n');
    if (args.includes('-Gn')) return c.out(u.groups.join(' ') + '\n');
    c.out(`uid=${u.uid}(${name}) gid=${u.gid}(${u.groups[0]}) groups=${u.groups.map((g) => `${gidOf(sh, g)}(${g})`).join(',')}\n`);
  });
  def('groups', async (c, args) => {
    const name = args[0] || c.sh.eu();
    const u = c.sh.users[name];
    if (!u) {
      c.err(`groups: ‘${name}’: no such user\n`);
      return 1;
    }
    c.out((args[0] ? name + ' : ' : '') + u.groups.join(' ') + '\n');
  });
  def('who', async (c) => c.out(`${c.sh.user.padEnd(9)}pts/0        ${U.strftime('%F %H:%M', new Date(Date.now() - 3600000))} (192.168.1.5)\n`));
  def('users', async (c) => c.out(c.sh.user + '\n'));
  def('hostname', async (c, args) => {
    if (args.includes('-I') || args.includes('-i')) return c.out('192.168.1.10 \n');
    const nm = args.find((x) => !x.startsWith('-'));
    if (nm) {
      if (c.sh.eu() !== 'root') {
        c.err('hostname: you must be root to change the host name\n');
        return 1;
      }
      c.sh.hostname = nm;
      return 0;
    }
    c.out((c.sh.hostname || 'linux-school') + '\n');
  });
  def('uname', async (c, args) => {
    const f = args.join(' ');
    const parts = { s: 'Linux', n: c.sh.hostname || 'linux-school', r: '6.8.0-45-generic', v: '#45-Ubuntu SMP PREEMPT_DYNAMIC Fri Aug 30 12:02:04 UTC 2024', m: 'x86_64', o: 'GNU/Linux' };
    if (!args.length) return c.out('Linux\n');
    if (/-a|--all/.test(f)) return c.out(`Linux linux-school 6.8.0-45-generic ${parts.v} x86_64 x86_64 x86_64 GNU/Linux\n`);
    const out = [];
    for (const k of 'snrvmo') if (new RegExp('-[a-z]*' + k).test(f)) out.push(parts[k]);
    c.out(out.join(' ') + '\n');
  });
  def('nproc', async (c) => c.out('2\n'));
  def('lsb_release', async (c, args) => {
    if (args.includes('-a')) c.out('No LSB modules are available.\nDistributor ID:\tUbuntu\nDescription:\tUbuntu 24.04.1 LTS\nRelease:\t24.04\nCodename:\tnoble\n');
    else if (args.includes('-d')) c.out('Description:\tUbuntu 24.04.1 LTS\n');
    else c.out('No LSB modules are available.\n');
  });
  def('uptime', async (c, args) => {
    const ms = Date.now() - c.sh.startTime;
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (args.includes('-p')) return c.out(`up ${d} day${d === 1 ? '' : 's'}, ${h} hour${h === 1 ? '' : 's'}, ${m} minute${m === 1 ? '' : 's'}\n`);
    c.out(` ${U.strftime('%H:%M:%S', new Date())} up ${d} day${d === 1 ? '' : 's'}, ${h}:${String(m).padStart(2, '0')},  1 user,  load average: 0.08, 0.03, 0.01\n`);
  });
  def('free', async (c, args) => {
    const kib = { total: 4046772, used: 1262340, free: 1523008, shared: 18432, cache: 1261424, avail: 2690112 };
    const sw = { total: 2097148, used: 0, free: 2097148 };
    const f = args.join(' ');
    const fmt = (v) => (/-h|--human/.test(f) ? (v >= 1048576 ? (v / 1048576).toFixed(1) + 'Gi' : v >= 1024 ? Math.round(v / 1024) + 'Mi' : v ? v + 'Ki' : '0B') : /-m/.test(f) ? String(Math.round(v / 1024)) : /-g/.test(f) ? String(Math.round(v / 1048576)) : String(v));
    const row = (n, a) => n.padEnd(8) + a.map((x) => fmt(x).padStart(12)).join('') + '\n';
    c.out('               total        used        free      shared  buff/cache   available\n');
    c.out(row('Mem:', [kib.total, kib.used, kib.free, kib.shared, kib.cache, kib.avail]));
    c.out('Swap:'.padEnd(8) + [sw.total, sw.used, sw.free].map((x) => fmt(x).padStart(12)).join('') + '\n');
  });
  def('df', async (c, args) => {
    const h = /-h/.test(args.join(' '));
    const rows = h
      ? [['Filesystem', 'Size', 'Used', 'Avail', 'Use%', 'Mounted on'], ['tmpfs', '395M', '1.5M', '393M', '1%', '/run'], ['/dev/sda1', '25G', '8.4G', '16G', '35%', '/'], ['tmpfs', '2.0G', '0', '2.0G', '0%', '/dev/shm'], ['/dev/sda15', '105M', '6.1M', '99M', '6%', '/boot/efi']]
      : [['Filesystem', '1K-blocks', 'Used', 'Available', 'Use%', 'Mounted on'], ['tmpfs', '404680', '1540', '403140', '1%', '/run'], ['/dev/sda1', '25672112', '8808328', '16847000', '35%', '/'], ['tmpfs', '2023384', '0', '2023384', '0%', '/dev/shm'], ['/dev/sda15', '106832', '6186', '100646', '6%', '/boot/efi']];
    const w = [0, 1, 2, 3, 4].map((i) => Math.max(...rows.map((r) => r[i].length)));
    for (const r of rows) c.out(r[0].padEnd(w[0]) + ' ' + r.slice(1, 5).map((x, i) => x.padStart(w[i + 1])).join(' ') + ' ' + r[5] + '\n');
  });
  def('clear', async (c) => {
    if (c.sh.hooks.clear) c.sh.hooks.clear();
  });
  def('reset', async (c) => {
    if (c.sh.hooks.clear) c.sh.hooks.clear();
  });

  /* ---- env / which / type ---- */
  def('env', async (c, args) => {
    const sh = c.sh;
    const sets = [];
    let i = 0;
    while (i < args.length && /^[A-Za-z_]\w*=/.test(args[i])) sets.push(args[i++].split(/=(.*)/s));
    if (i < args.length) {
      const saved = sets.map(([k]) => [k, sh.vars[k]]);
      sets.forEach(([k, v]) => (sh.vars[k] = v));
      try {
        return await sh.dispatch(args.slice(i), c.io);
      } finally {
        saved.forEach(([k, v]) => (v === undefined ? delete sh.vars[k] : (sh.vars[k] = v)));
      }
    }
    for (const k of sh.exported) if (sh.vars[k] !== undefined) c.out(`${k}=${sh.vars[k]}\n`);
    c.out(`PWD=${sh.cwd}\n`);
    for (const [k, v] of sets) c.out(`${k}=${v}\n`);
  });
  def('printenv', async (c, args) => {
    if (!args.length) return LX.cmds.env.run(c, []);
    let st = 0;
    for (const a of args) {
      const v = c.sh.getVar(a);
      if (v === undefined || (!c.sh.exported.has(a) && a !== 'PWD')) st = 1;
      else c.out(v + '\n');
    }
    return st;
  });
  function findBin(sh, name) {
    for (const d of (sh.vars.PATH || '').split(':')) {
      const n = sh.fs.lookup(sh.abs(d + '/' + name));
      if (n && n.t === 'f') return VFS.norm(d + '/' + name, '/');
    }
    return null;
  }
  def('which', async (c, args) => {
    let st = 0;
    for (const a of args.filter((x) => !x.startsWith('-'))) {
      const p = findBin(c.sh, a);
      if (p && (!LX.cmds[a] || !LX.cmds[a].pkg || c.sh.installed.has(LX.cmds[a].pkg))) c.out(p + '\n');
      else st = 1;
    }
    return st;
  });
  def('whereis', async (c, args) => {
    for (const a of args) {
      const p = findBin(c.sh, a);
      c.out(`${a}:${p ? ' ' + p + ` /usr/share/man/man1/${a}.1.gz` : ''}\n`);
    }
  });
  def(
    'type',
    async (c, args) => {
      const sh = c.sh;
      let st = 0;
      for (const a of args.filter((x) => !x.startsWith('-'))) {
        if (sh.aliases[a]) c.out(`${a} is aliased to \`${sh.aliases[a]}'\n`);
        else if (sh.funcs[a]) c.out(`${a} is a function\n`);
        else if (LX.cmds[a] && LX.cmds[a].builtin && !['echo', 'pwd', 'true', 'false', 'test', '['].includes(a)) c.out(`${a} is a shell builtin\n`);
        else if (LX.cmds[a] && LX.cmds[a].builtin) c.out(`${a} is a shell builtin\n`);
        else {
          const p = findBin(sh, a);
          if (p) c.out(`${a} is ${p}\n`);
          else {
            c.err(`bash: type: ${a}: not found\n`);
            st = 1;
          }
        }
      }
      return st;
    },
    { builtin: true }
  );
  def(
    'command',
    async (c, args) => {
      if (args[0] === '-v' || args[0] === '-V') {
        let st = 0;
        for (const a of args.slice(1)) {
          if (c.sh.aliases[a]) c.out(`alias ${a}='${c.sh.aliases[a]}'\n`);
          else if (LX.cmds[a] && LX.cmds[a].builtin) c.out(a + '\n');
          else if (findBin(c.sh, a)) c.out(findBin(c.sh, a) + '\n');
          else st = 1;
        }
        return st;
      }
      return await c.sh.dispatch(args, c.io);
    },
    { builtin: true }
  );

  /* ---- help / man ---- */
  def('help', async (c, args) => {
    if (args.length) {
      const h = LX.HELP[args[0]];
      if (h) return c.out(LX.helpText(args[0]));
      c.err(`bash: help: no help topics match \`${args[0]}'.  Try \`help help' or \`man -k ${args[0]}' or \`info ${args[0]}'.\n`);
      return 1;
    }
    c.out(
      'Linux Academy sandbox. Commands you can practise here:\n\n' +
        '  Look around   : pwd  ls  cd  tree  file  stat  du  df\n' +
        '  Files/folders : mkdir  touch  cp  mv  rm  rmdir  ln\n' +
        '  Read & write  : cat  less  head  tail  wc  echo  nano  tee\n' +
        '  Search        : find  grep  which  whereis\n' +
        '  Text tools    : sort  uniq  cut  tr  sed  awk  diff  xargs\n' +
        '  Permissions   : chmod  chown  sudo  su  id  whoami  useradd\n' +
        '  Processes     : ps  top  kill  jobs  fg  bg  sleep  systemctl\n' +
        '  Software      : apt  tar  gzip  zip  unzip\n' +
        '  Network       : ping  curl  wget  ip  ss  nslookup  ssh  scp\n' +
        '  Scripting     : bash  export  alias  if  for  while  read\n' +
        '  Help          : man  --help  history  type  apropos\n\n' +
        'Tip: type  man ls  or  ls --help  to learn more about any command.\n'
    );
  }, { builtin: true });
  def('man', async (c, args) => {
    const names = args.filter((a) => !a.startsWith('-') && !/^\d$/.test(a));
    if (!names.length) {
      c.err('What manual page do you want?\nFor example, try \'man man\'.\n');
      return 1;
    }
    let st = 0;
    for (const n of names) {
      if (!LX.HELP[n]) {
        c.err(`No manual entry for ${n}\n`);
        st = 16;
        continue;
      }
      c.out(LX.manPage(n));
    }
    if (c.tty && !st) c.out('\x1b[7m (END) \u2014 in a real terminal man opens a viewer: Space = next page, / = search, q = quit \x1b[0m\n');
    return st;
  });
  def('whatis', async (c, args) => {
    for (const a of args) c.out(LX.HELP[a] ? `${a.padEnd(16)}- ${LX.HELP[a].n}\n` : `${a}: nothing appropriate.\n`);
  });
  def('apropos', async (c, args) => {
    const q = (args[args.length - 1] || '').toLowerCase();
    if (!q) {
      c.err('apropos what?\n');
      return 1;
    }
    let found = 0;
    for (const [k, h] of Object.entries(LX.HELP)) {
      if (k.includes(q) || h.n.toLowerCase().includes(q)) {
        c.out(`${(k + ' (1)').padEnd(20)}- ${h.n}\n`);
        found++;
      }
    }
    if (!found) {
      c.err(`${q}: nothing appropriate.\n`);
      return 16;
    }
  });

  /* ============ users & sudo ============ */
  async function authenticate(c, nonInteractive) {
    const sh = c.sh;
    if (sh.eu() === 'root' || sh.user === 'root') return true;
    if (Date.now() < (sh.sudoUntil || 0)) return true;
    if (LX.sudoNoPass && LX.sudoNoPass(sh)) return true;
    if (nonInteractive) return false;
    if (sh.hooks.readLine) {
      const a = await sh.hooks.readLine(`[sudo] password for ${sh.user}: `, { secret: true });
      sh.checkAbort();
      if (a === null) return false;
    }
    sh.sudoUntil = Date.now() + 15 * 60000;
    return true;
  }
  def('sudo', async (c, args) => {
    const sh = c.sh;
    const g = U.getopts('sudo', c, args, 'isEkvlHnK', 'uU', { user: 'u' }, false, true);
    if (!g) return 1;
    const { o, rest } = g;
    if (LX.sudoersProblems) {
      const bad = LX.sudoersProblems(sh);
      if (bad.length) {
        const b = bad[0];
        c.err(`sudo: >>> ${b.file}: syntax error near line ${b.bad} <<<\nsudo: parse error in ${b.file} near line ${b.bad}\nsudo: no valid sudoers sources found, quitting\nsudo: unable to initialize policy plugin\n`);
        return 1;
      }
    }
    if (!(LX.sudoOk ? LX.sudoOk(sh, null) : sh.users[sh.user].groups.includes('sudo') || sh.user === 'root')) {
      c.err(`${sh.user} is not in the sudoers file.\n`);
      if (sh.logEvent) sh.logEvent('sudo', 4, `${sh.user} : user NOT in sudoers ; TTY=pts/0 ; PWD=${sh.cwd} ; USER=root ; COMMAND=${rest.join(' ')}`, { ident: 'sudo', auth: true });
      return 1;
    }
    if (o.k) {
      sh.sudoUntil = 0;
      return 0;
    }
    if (o.l && LX.sudoList) {
      LX.sudoList(c, o.U);
      return 0;
    }
    if (o.l) {
      c.out(`Matching Defaults entries for ${sh.user} on linux-school:\n    env_reset, mail_badpass\n\nUser ${sh.user} may run the following commands on linux-school:\n    (ALL : ALL) ALL\n`);
      return 0;
    }
    if (!rest.length && !o.i && !o.s && !o.v) {
      c.err('usage: sudo -h | -K | -k | -V\nusage: sudo -v [-ABkNnS] [-g group] [-h host] [-p prompt] [-u user]\n');
      return 1;
    }
    if (rest.length && LX.sudoOk && !LX.sudoOk(sh, rest)) {
      c.err(`Sorry, user ${sh.user} is not allowed to execute '${rest.join(' ')}' as root on linux-school.\n`);
      if (sh.logEvent) sh.logEvent('sudo', 4, `${sh.user} : command not allowed ; TTY=pts/0 ; PWD=${sh.cwd} ; USER=root ; COMMAND=${rest.join(' ')}`, { ident: 'sudo', auth: true });
      return 1;
    }
    if (!(await authenticate(c, o.n))) {
      c.err(o.n ? 'sudo: a password is required\n' : 'sudo: no password was provided\nsudo: a password is required\n');
      return 1;
    }
    if (o.v) return 0;
    const target = o.u || 'root';
    if (sh.logEvent && rest.length) sh.logEvent('sudo', 6, `${sh.user} : TTY=pts/0 ; PWD=${sh.cwd} ; USER=${target} ; COMMAND=${rest.join(' ')}`, { ident: 'sudo', auth: true });
    if (!sh.users[target]) {
      c.err(`sudo: unknown user ${target}\n`);
      return 1;
    }
    if (o.i || o.s || (rest[0] === 'su' && rest.length === 1)) {
      sh.userStack.push({ user: sh.user, cwd: sh.cwd });
      sh.user = target;
      sh._eu = null;
      if (o.i || rest[0] === 'su') sh.cwd = sh.users[target].home;
      return 0;
    }
    const prev = sh._eu;
    sh._eu = target;
    try {
      return await sh.dispatch(rest, c.io);
    } finally {
      sh._eu = prev;
    }
  }, { bin: true });
  def('su', async (c, args) => {
    const sh = c.sh;
    let name = null;
    let cmdline = null;
    let login = false;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-' || a === '-l' || a === '--login') login = true;
      else if (a === '-c' || a === '--command') cmdline = args[++i];
      else if (a === '-s' || a === '--shell') i++;
      else if (a.startsWith('-')) continue;
      else if (!name) name = a;
    }
    name = name || 'root';
    if (!sh.users[name]) {
      c.err(`su: user ${name} does not exist or the user entry does not contain all the required fields\n`);
      return 1;
    }
    if (sh.eu() !== 'root') {
      if (sh.hooks.readLine) {
        const a = await sh.hooks.readLine('Password: ', { secret: true });
        sh.checkAbort();
        if (a === null) return 1;
        if (a === '') {
          c.err('su: Authentication failure\n');
          return 1;
        }
      }
    }
    if (cmdline !== null) {
      const prevUser = sh.user;
      const prevEu = sh._eu;
      const prevCwd = sh.cwd;
      sh.user = name;
      sh._eu = null;
      if (login) sh.cwd = sh.users[name].home;
      try {
        return await sh.runSource(cmdline, c.io);
      } finally {
        sh.user = prevUser;
        sh._eu = prevEu;
        sh.cwd = prevCwd;
      }
    }
    sh.userStack.push({ user: sh.user, cwd: sh.cwd });
    sh.user = name;
    sh._eu = null;
    if (login) sh.cwd = sh.users[name].home;
    return 0;
  });
  function needRoot(c, cmd, msg) {
    if (c.sh.eu() === 'root') return false;
    c.err(msg || `${cmd}: Permission denied.\n${cmd}: cannot lock /etc/passwd; try again later.\n`);
    return true;
  }
  def('useradd', async (c, args) => {
    const g = U.getopts('useradd', c, args, 'mrU', 'sdgGcu', {});
    if (!g) return 1;
    if (needRoot(c, 'useradd')) return 1;
    const name = g.rest[0];
    if (!name) {
      c.err('Usage: useradd [options] LOGIN\n');
      return 2;
    }
    if (c.sh.users[name]) {
      c.err(`useradd: user '${name}' already exists\n`);
      return 9;
    }
    mkUser(c.sh, name, !!g.o.m || false);
    return 0;
  });
  function mkUser(sh, name, home) {
    const uid = 1001 + Object.keys(sh.users).filter((n) => !['root', 'learner'].includes(n)).length;
    sh.users[name] = { uid, gid: uid, home: '/home/' + name, groups: [name], gecos: name };
    if (home) sh.fs.mkdirp('/home/' + name, { owner: name, group: name, mode: 0o755 });
    sh.writePasswd();
  }
  def('adduser', async (c, args) => {
    const name = args.find((a) => !a.startsWith('-'));
    if (c.sh.eu() !== 'root') {
      c.err('adduser: Only root may add a user or group to the system.\n');
      return 1;
    }
    if (!name) {
      c.err('adduser: Only one or two names allowed.\n');
      return 1;
    }
    if (c.sh.users[name]) {
      c.err(`adduser: The user \`${name}' already exists.\n`);
      return 1;
    }
    mkUser(c.sh, name, true);
    const u = c.sh.users[name];
    c.out(`info: Adding user \`${name}' ...\ninfo: Selecting UID/GID from range 1000 to 59999 ...\ninfo: Adding new group \`${name}' (${u.gid}) ...\ninfo: Adding new user \`${name}' (${u.uid}) with group \`${name} (${u.gid})' ...\ninfo: Creating home directory \`/home/${name}' ...\ninfo: Copying files from \`/etc/skel' ...\n(sandbox: the password step is skipped)\ninfo: Adding new user \`${name}' to supplemental / extra groups \`users' ...\n`);
    return 0;
  });
  def('userdel', async (c, args) => {
    if (needRoot(c, 'userdel', 'userdel: Permission denied.\nuserdel: cannot lock /etc/passwd; try again later.\n')) return 1;
    const name = args.find((a) => !a.startsWith('-'));
    if (!name || !c.sh.users[name] || ['root', 'learner'].includes(name)) {
      c.err(`userdel: user '${name}' does not exist\n`);
      return 6;
    }
    delete c.sh.users[name];
    if (args.includes('-r')) {
      const h = c.sh.fs.lookup('/home');
      delete h.kids[name];
    }
    c.sh.writePasswd();
    return 0;
  });
  def('usermod', async (c, args) => {
    if (needRoot(c, 'usermod', 'usermod: Permission denied.\nusermod: cannot lock /etc/passwd; try again later.\n')) return 1;
    const gi = args.findIndex((a) => a === '-aG' || a === '-G' || a === '-a');
    const group = args[gi === -1 ? 0 : args[gi] === '-a' ? gi + 2 : gi + 1];
    const name = args[args.length - 1];
    if (!c.sh.users[name]) {
      c.err(`usermod: user '${name}' does not exist\n`);
      return 6;
    }
    if (group && !c.sh.users[name].groups.includes(group)) c.sh.users[name].groups.push(group);
    c.sh.writePasswd();
    return 0;
  });
  def('groupadd', async (c, args) => {
    if (needRoot(c, 'groupadd', 'groupadd: Permission denied.\ngroupadd: cannot lock /etc/group; try again later.\n')) return 1;
    return 0;
  });
  def('passwd', async (c, args) => {
    const who = args[0] || c.sh.user;
    if (who !== c.sh.user && c.sh.eu() !== 'root') {
      c.err('passwd: You may not view or modify password information for ' + who + '.\n');
      return 1;
    }
    if (!c.sh.users[who]) {
      c.err(`passwd: user '${who}' does not exist\n`);
      return 1;
    }
    c.out(`(sandbox) pretend we asked for a new password for ${who}...\npasswd: password updated successfully\n`);
  });

  /* ============ processes ============ */
  function procs(sh) {
    if (sh.procList) return sh.procList();
    const list = [
      { pid: 1, ppid: 0, user: 'root', cmd: '/sbin/init splash', tty: '?', stat: 'Ss', cpu: 0.0, mem: 0.3 },
      { pid: 2, ppid: 0, user: 'root', cmd: '[kthreadd]', tty: '?', stat: 'S', cpu: 0, mem: 0 },
      { pid: 412, ppid: 1, user: 'root', cmd: '/usr/sbin/sshd -D', tty: '?', stat: 'Ss', cpu: 0, mem: 0.2, svc: 'ssh' },
      { pid: 530, ppid: 1, user: 'root', cmd: '/usr/sbin/cron -f', tty: '?', stat: 'Ss', cpu: 0, mem: 0.1, svc: 'cron' },
      { pid: 688, ppid: 1, user: 'syslog', cmd: '/usr/sbin/rsyslogd -n', tty: '?', stat: 'Ssl', cpu: 0, mem: 0.1 },
    ];
    if (sh.services.nginx && sh.services.nginx.active) {
      list.push({ pid: 880, ppid: 1, user: 'root', cmd: 'nginx: master process /usr/sbin/nginx', tty: '?', stat: 'Ss', cpu: 0, mem: 0.1, svc: 'nginx' });
      list.push({ pid: 881, ppid: 880, user: 'www-data', cmd: 'nginx: worker process', tty: '?', stat: 'S', cpu: 0, mem: 0.1, svc: 'nginx' });
    }
    list.push({ pid: 1189, ppid: 1, user: sh.user, cmd: '-bash', tty: 'pts/0', stat: 'Ss', cpu: 0.0, mem: 0.2, mine: true, name: 'bash' });
    for (const j of sh.jobs) list.push({ pid: j.pid, ppid: 1189, user: sh.user, cmd: j.proc || j.cmd, tty: 'pts/0', stat: j.state === 'Stopped' ? 'T' : 'S', cpu: 0, mem: 0, mine: true, job: j, name: (j.proc || j.cmd).split(' ')[0] });
    return list;
  }
  def('ps', async (c, args) => {
    const sh = c.sh;
    const f = args.join(' ');
    const all = procs(sh);
    const me = { pid: sh.nextPid++, ppid: 1189, user: sh.user, cmd: 'ps' + (args.length ? ' ' + args.join(' ') : ''), tty: 'pts/0', stat: 'R+', cpu: 0, mem: 0, mine: true, name: 'ps' };
    all.push(me);
    const time = '00:00:00';
    if (/aux|-aux/.test(f) || /\bau\b/.test(f) || /-ax|\bax\b/.test(f)) {
      c.out('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n');
      for (const p of all) c.out(`${p.user.padEnd(8).slice(0, 8)} ${String(p.pid).padStart(6)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${String(p.mem ? 12000 + p.pid * 3 : 0).padStart(6)} ${String(p.mem ? 3000 + p.pid : 0).padStart(5)} ${p.tty.padEnd(8)} ${p.stat.padEnd(4)} 08:00   0:00 ${p.cmd}\n`);
    } else if (/-ef|-e\b|-A/.test(f)) {
      c.out('UID          PID    PPID  C STIME TTY          TIME CMD\n');
      for (const p of all) c.out(`${p.user.padEnd(8).slice(0, 8)} ${String(p.pid).padStart(7)} ${String(p.ppid).padStart(7)}  0 08:00 ${p.tty.padEnd(8)} ${time} ${p.cmd}\n`);
    } else {
      const mine = all.filter((p) => p.mine);
      c.out('    PID TTY          TIME CMD\n');
      for (const p of mine) c.out(`${String(p.pid).padStart(7)} ${p.tty.padEnd(8)} ${time} ${p.name || p.cmd.split(' ')[0]}\n`);
    }
    return 0;
  });
  function topSnapshot(c, name) {
    const sh = c.sh;
    const all = procs(sh);
    const t = U.strftime('%H:%M:%S', new Date());
    c.out(`${name} - ${t} up 3 days,  2:11,  1 user,  load average: 0.08, 0.03, 0.01\n`);
    c.out(`Tasks: ${String(all.length + 70).padStart(3)} total,   1 running, ${String(all.length + 69).padStart(3)} sleeping,   0 stopped,   0 zombie\n`);
    c.out('%Cpu(s):  1.3 us,  0.7 sy,  0.0 ni, 97.8 id,  0.2 wa,  0.0 hi,  0.0 si,  0.0 st\n');
    c.out('MiB Mem :   3951.8 total,   1487.5 free,   1232.8 used,   1231.9 buff/cache\n');
    c.out('MiB Swap:   2048.0 total,   2048.0 free,      0.0 used.   2627.3 avail Mem \n\n');
    c.out('    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n');
    for (const p of all.slice(0, 12)) c.out(`${String(p.pid).padStart(7)} ${p.user.padEnd(9).slice(0, 9)} 20   0 ${String(12000 + p.pid * 3).padStart(7)} ${String(3000 + p.pid).padStart(6)} ${String(2000).padStart(6)} S ${p.cpu.toFixed(1).padStart(5)} ${p.mem.toFixed(1).padStart(5)}   0:00.${String(p.pid % 90 + 10)} ${p.cmd.split(' ')[0].replace(/^.*\//, '')}\n`);
    c.out('\n\x1b[2m(This is a one-time snapshot. Real ' + name + ' keeps refreshing every few seconds; press q to quit.)\x1b[0m\n');
  }
  def('top', async (c) => topSnapshot(c, 'top'));
  def('htop', async (c) => topSnapshot(c, 'htop'), { pkg: 'htop' });
  function findTargets(sh, spec) {
    if (/^%\d+$/.test(spec)) return sh.jobs.filter((j) => j.id === +spec.slice(1));
    return sh.jobs.filter((j) => j.pid === +spec);
  }
  const SIG = { 1: 'HUP', 2: 'INT', 3: 'QUIT', 9: 'KILL', 15: 'TERM', 18: 'CONT', 19: 'STOP', 20: 'TSTP' };
  function signal(c, job, sig) {
    const sh = c.sh;
    const name = SIG[sig] || sig;
    if (name === 'STOP' || name === 'TSTP') {
      job.state = 'Stopped';
      sh.notices.push(`\n[${job.id}]+  Stopped                 ${job.cmd}\n`);
      return;
    }
    if (name === 'CONT') {
      job.state = 'Running';
      return;
    }
    sh.jobs = sh.jobs.filter((j) => j !== job);
    if (job.port && sh.listeners) delete sh.listeners[job.port];
    sh.notices.push(`[${job.id}]+  ${name === 'KILL' ? 'Killed' : name === 'INT' ? 'Interrupt' : name === 'HUP' ? 'Hangup' : 'Terminated'}              ${job.cmd}\n`);
  }
  def(
    'kill',
    async (c, args) => {
      const sh = c.sh;
      if (args[0] === '-l') {
        c.out(' 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t 9) SIGKILL\t15) SIGTERM\n18) SIGCONT\t19) SIGSTOP\t20) SIGTSTP\n');
        return 0;
      }
      let sig = 15;
      const targets = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-s') {
          sig = parseSig(args[++i]);
        } else if (/^-/.test(a) && !/^-\d+$/.test(a.slice(0)) || /^-\d+$/.test(a)) sig = parseSig(a.slice(1));
        else targets.push(a);
      }
      if (!targets.length) {
        c.err('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]\n');
        return 2;
      }
      let st = 0;
      for (const t of targets) {
        const job = findTargets(sh, t)[0];
        if (job) {
          signal(c, job, sig);
          continue;
        }
        const pid = +t;
        const sys = procs(sh).find((p) => p.pid === pid);
        if (sys && !sys.job) {
          if (sh.eu() !== 'root' && sys.user !== sh.eu()) {
            c.err(`bash: kill: (${pid}) - Operation not permitted\n`);
            st = 1;
          } else if (pid === 1189) {
            c.out('\x1b[2m(That is your own shell. Killing it would close this window, so the sandbox ignores it.)\x1b[0m\n');
          } else if (pid <= 2) {
            c.err(`bash: kill: (${pid}) - Operation not permitted\n`);
            st = 1;
          } else if (sys.svc && sh.services[sys.svc]) {
            if (sh.stopService) sh.stopService(sys.svc);
            else sh.services[sys.svc].active = false;
            if (sh.serviceHooks && sh.serviceHooks[sys.svc]) sh.serviceHooks[sys.svc]({ out() {}, err() {} }, 'stop');
          }
          continue;
        }
        c.err(/^%/.test(t) ? `bash: kill: ${t}: no such job\n` : `bash: kill: (${t}) - No such process\n`);
        st = 1;
      }
      return st;
    },
    { builtin: true, bin: true }
  );
  function parseSig(s) {
    if (/^\d+$/.test(s)) return +s;
    const n = s.replace(/^SIG/, '').toUpperCase();
    const hit = Object.entries(SIG).find(([, v]) => v === n);
    return hit ? +hit[0] : 15;
  }
  async function killByName(c, args, cmd) {
    const sh = c.sh;
    const names = args.filter((a) => !a.startsWith('-'));
    let sig = 15;
    for (const a of args) if (a.startsWith('-') && a.length > 1) sig = parseSig(a.slice(1));
    let hit = 0;
    for (const n of names) {
      for (const j of sh.jobs.filter((j) => (j.proc || j.cmd).split(' ')[0] === n)) {
        signal(c, j, sig);
        hit++;
      }
      const sys = procs(sh).filter((p) => !p.job && p.cmd.replace(/^.*\//, '').split(' ')[0].replace(/^-/, '') === n && p.svc);
      for (const p of sys) {
        if (sh.eu() !== 'root') {
          c.err(`${cmd}: Operation not permitted\n`);
          return 1;
        }
        sh.services[p.svc].active = false;
        hit++;
      }
    }
    if (!hit) {
      if (cmd === 'killall') c.err(`killall: ${names[0]}: no process found\n`);
      return 1;
    }
    return 0;
  }
  def('killall', (c, a) => killByName(c, a, 'killall'));
  def('pkill', (c, a) => killByName(c, a, 'pkill'));
  def('pgrep', async (c, args) => {
    const names = args.filter((a) => !a.startsWith('-'));
    const long = args.includes('-l') || args.includes('-a');
    let hit = 0;
    for (const p of procs(c.sh)) {
      const nm = p.cmd.replace(/^.*\//, '').split(' ')[0].replace(/^-/, '');
      if (names.some((n) => nm.includes(n) || p.cmd.includes(n))) {
        c.out(String(p.pid) + (long ? ' ' + nm : '') + '\n');
        hit++;
      }
    }
    return hit ? 0 : 1;
  });
  def(
    'jobs',
    async (c, args) => {
      const js = c.sh.jobs;
      js.forEach((j, i) => c.out(`[${j.id}]${i === js.length - 1 ? '+' : i === js.length - 2 ? '-' : ' '}  ${args.includes('-l') ? j.pid + ' ' : ''}${j.state.padEnd(22)}${j.cmd}${j.state === 'Running' && !/&$/.test(j.cmd) ? ' &' : ''}\n`));
    },
    { builtin: true }
  );
  def(
    'fg',
    async (c, args) => {
      const sh = c.sh;
      const job = args[0] ? findTargets(sh, args[0])[0] : sh.jobs[sh.jobs.length - 1];
      if (!job) {
        c.err(`bash: fg: ${args[0] ? args[0] + ': no such job' : 'current: no such job'}\n`);
        return 1;
      }
      c.out(job.cmd.replace(/\s*&$/, '') + '\n');
      job.state = 'Running';
      try {
        await sh.waitMs(Math.min(60, (parseFloat((job.proc || '').split(' ')[1]) || 3)) * 1000);
      } catch (e) {
        if (e instanceof AbortSig && e.sig === 'TSTP') {
          job.state = 'Stopped';
          sh.aborted = false;
          c.out(`\n[${job.id}]+  Stopped                 ${job.cmd.replace(/\s*&$/, '')}\n`);
          return 148;
        }
        sh.jobs = sh.jobs.filter((j) => j !== job);
        throw e;
      }
      sh.jobs = sh.jobs.filter((j) => j !== job);
      return 0;
    },
    { builtin: true }
  );
  def(
    'bg',
    async (c, args) => {
      const sh = c.sh;
      const job = args[0] ? findTargets(sh, args[0])[0] : [...sh.jobs].reverse().find((j) => j.state === 'Stopped') || sh.jobs[sh.jobs.length - 1];
      if (!job) {
        c.err('bash: bg: current: no such job\n');
        return 1;
      }
      job.state = 'Running';
      c.out(`[${job.id}]+ ${job.cmd.replace(/\s*&$/, '')} &\n`);
    },
    { builtin: true }
  );

  /* ============ systemctl ============ */
  const svcName = (n) => (n || '').replace(/\.service$/, '');
  async function systemctl(c, args) {
    const sh = c.sh;
    const sub = args.find((a) => !a.startsWith('-'));
    const name = svcName(args.filter((a) => !a.startsWith('-'))[1]);
    if (!sub) {
      c.out('UNIT                  LOAD   ACTIVE SUB     DESCRIPTION\n');
      for (const [k, s] of Object.entries(sh.services)) c.out(`${(k + '.service').padEnd(21)} loaded ${s.active ? 'active ' : 'inactive'} ${s.active ? 'running' : 'dead   '} ${s.desc}\n`);
      return 0;
    }
    if (sub === 'list-units') return systemctl(c, []);
    const s = sh.services[name];
    if (!name) {
      c.err('Too few arguments.\n');
      return 1;
    }
    if (!s) {
      c.err(sub === 'status' ? `Unit ${name}.service could not be found.\n` : `Failed to ${sub} ${name}.service: Unit ${name}.service not found.\n`);
      return sub === 'status' ? 4 : 5;
    }
    switch (sub) {
      case 'status': {
        const dot = s.active ? '\x1b[32m●\x1b[0m' : '○';
        c.out(`${dot} ${name}.service - ${s.desc}\n     Loaded: loaded (/usr/lib/systemd/system/${name}.service; ${s.enabled ? 'enabled' : 'disabled'}; preset: enabled)\n     Active: ${s.active ? '\x1b[32mactive (running)\x1b[0m since ' + U.strftime('%a %F %H:%M:%S %Z', new Date(s.since || sh.startTime)) + '; ' + (s.since ? 'a moment ago' : '3 days ago') : 'inactive (dead)'}\n`);
        if (s.active) c.out(`   Main PID: ${s.pid} (${s.proc})\n      Tasks: 3 (limit: 4600)\n     Memory: 3.2M\n`);
        return s.active ? 0 : 3;
      }
      case 'is-active':
        c.out(s.active ? 'active\n' : 'inactive\n');
        return s.active ? 0 : 3;
      case 'is-enabled':
        c.out(s.enabled ? 'enabled\n' : 'disabled\n');
        return s.enabled ? 0 : 1;
      case 'start': case 'stop': case 'restart': case 'reload': case 'enable': case 'disable': {
        if (sh.eu() !== 'root') {
          c.err(`Failed to ${sub} ${name}.service: Interactive authentication required.\nSee system logs and 'systemctl status ${name}.service' for details.\n`);
          return 1;
        }
        if (sub === 'start' || sub === 'restart' || sub === 'reload') {
          s.active = true;
          s.since = Date.now();
          if (!s.pid) s.pid = 880;
        }
        if (sub === 'stop') s.active = false;
        if (sub === 'enable') {
          s.enabled = true;
          c.out(`Synchronizing state of ${name}.service with SysV service script with /usr/lib/systemd/systemd-sysv-install.\nExecuting: /usr/lib/systemd/systemd-sysv-install enable ${name}\nCreated symlink /etc/systemd/system/multi-user.target.wants/${name}.service → /usr/lib/systemd/system/${name}.service.\n`);
        }
        if (sub === 'disable') {
          s.enabled = false;
          c.out(`Removed "/etc/systemd/system/multi-user.target.wants/${name}.service".\n`);
        }
        return 0;
      }
    }
    c.err(`Unknown command verb '${sub}'.\n`);
    return 1;
  }
  def('systemctl', systemctl);
  def('service', async (c, args) => {
    if (args.length < 2) {
      c.err('Usage: service < option > | --status-all | [ service_name [ command | --full-restart ] ]\n');
      return 1;
    }
    return systemctl(c, [args[1], args[0]]);
  });

  /* ============ editors / cron ============ */
  def(['nano', 'vi', 'vim', 'pico'], async (c, args) => {
    const sh = c.sh;
    const file = args.find((a) => !a.startsWith('-') && !a.startsWith('+')) || '';
    const abs = file ? c.abs(file) : null;
    let content = '';
    let readonly = false;
    if (abs) {
      const n = sh.fs.lookup(abs);
      if (n) {
        if (n.t === 'd') {
          c.err(`${c.name}: ${file}: Is a directory\n`);
          return 1;
        }
        try {
          content = sh.readFile(abs);
        } catch (e) {
          if (!(e instanceof FsErr)) throw e;
          c.err(`${c.name}: ${file}: ${U.errTxt(e)}\n`);
          return 1;
        }
        readonly = !sh.can(n, 2);
      }
    }
    if (!sh.hooks.edit) {
      c.err(`${c.name}: the text editor only opens in the browser terminal. Use  echo 'text' > ${file || 'file'}  instead.\n`);
      return 1;
    }
    const res = await sh.hooks.edit({ name: c.name, path: file, content, readonly, exists: !!(abs && sh.fs.lookup(abs)) });
    if (res !== null && res !== undefined && abs) {
      try {
        sh.writeFile(abs, res, false);
        c.out(`\x1b[2m[ Wrote ${U.lines(res).length} lines to ${file} ]\x1b[0m\n`);
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`Error writing ${file}: ${U.errTxt(e)}\n`);
        return 1;
      }
    }
    return 0;
  }, { builtin: false });
  def('crontab', async (c, args) => {
    const sh = c.sh;
    const path = `/var/spool/cron/crontabs/${sh.eu()}`;
    const n = sh.fs.lookup(path);
    if (args.includes('-l')) {
      if (!n) {
        c.err(`no crontab for ${sh.eu()}\n`);
        return 1;
      }
      c.out(n.content);
      return 0;
    }
    if (args.includes('-r')) {
      if (n) delete sh.fs.lookup('/var/spool/cron/crontabs').kids[sh.eu()];
      else c.err(`no crontab for ${sh.eu()}\n`);
      return 0;
    }
    if (args.includes('-e')) {
      const header = '# Edit this file to introduce tasks to be run by cron.\n#\n# m h  dom mon dow   command\n# Example: run a backup every day at 2:30 AM\n# 30 2 * * * /home/learner/backup.sh\n';
      const res = sh.hooks.edit ? await sh.hooks.edit({ name: 'nano', path: 'crontab', content: n ? n.content : header, readonly: false }) : null;
      if (res !== null && res !== undefined) {
        sh.fs.mkdirp('/var/spool/cron/crontabs', { owner: 'root', group: 'crontab' });
        sh.fs.put(path, res, { owner: sh.eu(), group: 'crontab', mode: 0o600 });
        c.out(`crontab: installing new crontab\n`);
      }
      return 0;
    }
    c.err('usage: crontab [-u user] file\n       crontab [-u user] [-e | -l | -r]\n');
    return 1;
  });

  /* ============ bash / scripts ============ */
  def('bash', async (c, args) => {
    const sh = c.sh;
    const flags = {};
    let i = 0;
    for (; i < args.length; i++) {
      const a = args[i];
      if (a === '--version') {
        c.out('GNU bash, version 5.2.21(1)-release (x86_64-pc-linux-gnu)\n');
        return 0;
      }
      if (a === '-c') break;
      if (a === '-o') {
        const name = args[++i];
        if (name === 'pipefail') flags.pipefail = true;
        else if (name === 'errexit') flags.e = true;
        else if (name === 'nounset') flags.u = true;
        else if (name === 'xtrace') flags.x = true;
        continue;
      }
      if (a === '--') {
        i++;
        break;
      }
      if (/^-[a-zA-Z]+$/.test(a)) {
        for (const ch of a.slice(1)) flags[ch] = true;
        continue;
      }
      break;
    }
    const exec = async (text, rest, name) => {
      if (flags.n) {
        try {
          LX.parse(text.replace(/^#!.*\n/, '\n'));
        } catch (e) {
          if (e instanceof LX.SyntaxErr || e instanceof LX.Incomplete) {
            c.err(`${name}: ${e instanceof LX.Incomplete ? 'line ' + (text.split('\n').length + 1) + ': syntax error: unexpected end of file' : e.message}\n`);
            return 2;
          }
          throw e;
        }
        return 0;
      }
      const saved = { ...sh.opts };
      if (flags.x) sh.opts.x = true;
      if (flags.e) sh.opts.e = true;
      if (flags.u) sh.opts.u = true;
      if (flags.pipefail) sh.opts.pipefail = true;
      try {
        return await sh.runScript(text, rest, c.io, name);
      } finally {
        sh.opts = saved;
      }
    };
    if (args[i] === '-c') return await exec(args[i + 1] || '', args.slice(i + 2), 'bash');
    const f = args[i];
    if (f === undefined) {
      if (typeof c.io.stdin === 'string' && c.io.stdin) return await exec(c.io.stdin, [], 'bash');
      c.out('\x1b[2m(A new bash shell would start here. In this sandbox just keep typing in the current one.)\x1b[0m\n');
      return 0;
    }
    try {
      const text = sh.readFile(c.abs(f));
      return await exec(text, args.slice(i + 1), f);
    } catch (e) {
      if (!(e instanceof FsErr)) throw e;
      c.err(`bash: ${f}: ${U.errTxt(e)}\n`);
      return 127;
    }
  });
  def('sh', (c, a) => LX.cmds.bash.run(c, a));
  def('python3', async (c, args) => {
    if (args[0] === '--version' || args[0] === '-V') return c.out('Python 3.12.3\n');
    const f = args.find((a) => !a.startsWith('-'));
    if (args[0] === '-c') {
      const m = /^print\((.*)\)$/s.exec(args[1] || '');
      if (m) {
        try {
          const v = Function('"use strict";return (' + m[1].replace(/^(["'])(.*)\1$/s, '"$2"') + ')')();
          return c.out(String(v) + '\n');
        } catch (e) {}
      }
    }
    if (f) {
      const n = c.sh.stat(f);
      if (!n) {
        c.err(`python3: can't open file '${c.abs(f)}': [Errno 2] No such file or directory\n`);
        return 2;
      }
      const pr = /print\((["'])(.*?)\1\)/g;
      let m;
      let any = false;
      while ((m = pr.exec(n.content || ''))) {
        c.out(m[2] + '\n');
        any = true;
      }
      if (!any) c.out('\x1b[2m(This sandbox only understands simple print("...") lines in Python files.)\x1b[0m\n');
      return 0;
    }
    c.out('Python 3.12.3 (main) [GCC 13.2.0] on linux\n\x1b[2m(The interactive Python prompt is not available here.)\x1b[0m\n');
  });

  /* ============ packages ============ */
  LX.DEFAULT_PKGS = ['bash', 'coreutils', 'grep', 'sed', 'gawk', 'findutils', 'tar', 'gzip', 'nano', 'curl', 'wget', 'python3', 'openssh-client', 'procps', 'iputils-ping', 'sudo', 'apt', 'util-linux', 'cron', 'less', 'man-db', 'passwd', 'diffutils', 'dnsutils-lite'];
  LX.PKGS = {
    tree: { ver: '2.1.1-2ubuntu3', desc: 'displays directory tree, in color', size: 47, bins: ['tree'] },
    cowsay: { ver: '3.03+dfsg2-8', desc: 'configurable talking characters in ASCII art', size: 19, bins: ['cowsay'] },
    htop: { ver: '3.3.0-4', desc: 'interactive processes viewer', size: 171, bins: ['htop'] },
    neofetch: { ver: '7.1.0-4', desc: 'Shows Linux System Information with Distribution Logo', size: 90, bins: ['neofetch'] },
    sl: { ver: '5.02-1', desc: 'Correct you if you type `sl\' by mistake', size: 18, bins: ['sl'] },
    'fortune-mod': { ver: '1:1.99.1-7.1', desc: 'provides fortune cookies on demand', size: 41, bins: ['fortune'] },
    'net-tools': { ver: '2.10-0.1ubuntu4', desc: 'NET-3 networking toolkit', size: 204, bins: ['ifconfig', 'netstat'] },
    nginx: { ver: '1.24.0-2ubuntu7', desc: 'small, powerful, scalable web/proxy server', size: 564, bins: ['nginx'], service: { desc: 'A high performance web server and a reverse proxy server', proc: 'nginx' } },
    zip: { ver: '3.0-13ubuntu0.1', desc: 'Archiver for .zip files', size: 175, bins: ['zip'] },
    unzip: { ver: '6.0-28ubuntu4', desc: 'De-archiver for .zip files', size: 174, bins: ['unzip'] },
    bc: { ver: '1.07.1-3build1', desc: 'GNU bc arbitrary precision calculator language', size: 86, bins: ['bc'] },
    git: { ver: '1:2.43.0-1ubuntu7', desc: 'fast, scalable, distributed revision control system', size: 3680, bins: ['git'] },
    vim: { ver: '2:9.1.0016-1ubuntu7', desc: 'Vi IMproved - enhanced vi editor', size: 1881, bins: [] },
    jq: { ver: '1.7.1-3build1', desc: 'lightweight and flexible command-line JSON processor', size: 65, bins: ['jq'] },
    figlet: { ver: '2.2.5-3', desc: 'Make large character ASCII banners out of ordinary text', size: 125, bins: ['figlet'] },
    cmatrix: { ver: '2.0-3', desc: 'simulates the display from "The Matrix"', size: 30, bins: ['cmatrix'] },
    lolcat: { ver: '100.0.1-2', desc: 'colorful cat', size: 12, bins: ['lolcat'] },
    ncdu: { ver: '1.19-0.1', desc: 'ncurses disk usage viewer', size: 52, bins: ['ncdu'] },
    tmux: { ver: '3.4-1ubuntu0.1', desc: 'terminal multiplexer', size: 440, bins: ['tmux'] },
    dnsutils: { ver: '1:9.18.28-0ubuntu0.24.04.1', desc: 'Transitional package for bind9-dnsutils', size: 2, bins: ['dig'] },
  };
  // preinstall nothing from the table above; register stub commands for packages without behaviour
  const STUB_NOTE = (n) => `\x1b[2m(${n} is installed, but this sandbox cannot run it. On a real Linux machine it works!)\x1b[0m\n`;
  for (const [pkg, p] of Object.entries(LX.PKGS)) {
    for (const b of p.bins) {
      if (!LX.cmds[b]) {
        def(b, async (c, args) => {
          if (b === 'git' && args[0] === '--version') return c.out('git version 2.43.0\n');
          if (b === 'figlet') {
            const t = args.join(' ') || 'Hi';
            return c.out(t.toUpperCase().split('').join(' ') + '\n' + '='.repeat(t.length * 2 - 1) + '\n');
          }
          if (b === 'lolcat') return c.out(await c.slurp());
          c.out(STUB_NOTE(b));
        }, { pkg });
      } else LX.cmds[b].pkg = LX.cmds[b].pkg || pkg;
    }
  }
  LX.cmds.nano.pkg = 'nano';
  LX.cmds.vim.pkg = 'vim';
  LX.cmds.vi.pkg = null;
  LX.cmds.pico.pkg = 'nano';

  Object.assign(LX.cmds.bc, { pkg: 'bc' });
  Object.assign(LX.cmds.tree, { pkg: 'tree' });
  Object.assign(LX.cmds.zip, { pkg: 'zip' });
  Object.assign(LX.cmds.unzip, { pkg: 'unzip' });
  Object.assign(LX.cmds.htop, { pkg: 'htop' });

  def('cowsay', async (c, args) => {
    const text = (args.join(' ') || (await c.slurp()).trim() || 'Moo!').replace(/\s+/g, ' ');
    const lines = [];
    let cur = '';
    for (const w of text.split(' ')) {
      if ((cur + ' ' + w).trim().length > 39) {
        lines.push(cur);
        cur = w;
      } else cur = (cur + ' ' + w).trim();
    }
    if (cur) lines.push(cur);
    const w = Math.max(...lines.map((l) => l.length));
    let out = ' ' + '_'.repeat(w + 2) + '\n';
    if (lines.length === 1) out += `< ${lines[0]} >\n`;
    else lines.forEach((l, i) => (out += (i === 0 ? '/' : i === lines.length - 1 ? '\\' : '|') + ' ' + l.padEnd(w) + ' ' + (i === 0 ? '\\' : i === lines.length - 1 ? '/' : '|') + '\n'));
    out += ' ' + '-'.repeat(w + 2) + '\n';
    out += '        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||\n';
    c.out(out);
  }, { pkg: 'cowsay' });
  def('sl', async (c) => {
    c.out('      ====        ________                ___________\n  _D _|  |_______/        \\__I_I_____===__|_________|\n   |(_)---  |   H\\________/ |   |        =|___ ___|\n   /     |  |   H  |  |     |   |         ||_| |_||\n  |      |  |   H  |__--------------------| [___] |\n  | ________|___H__/__|_____/[][]~\\_______|       |\n  |/ |   |-----------I_____I [][] []  D   |=======|__\n\n\x1b[2mChoo choo! You typed sl instead of ls, a classic mistake.\x1b[0m\n');
  }, { pkg: 'sl' });
  const QUOTES = ['The best way to learn Linux is to use it every day.', 'Talk is cheap. Show me the code. - Linus Torvalds', 'Everything is a file.', 'With great power comes great responsibility: think before you sudo.', 'There is no place like 127.0.0.1.', 'To iterate is human, to recurse divine.'];
  def('fortune', async (c) => c.out(QUOTES[Math.floor(Math.random() * QUOTES.length)] + '\n'), { pkg: 'fortune-mod' });
  def('neofetch', async (c) => {
    const sh = c.sh;
    const logo = ['      .--.      ', '     |o_o |     ', '     |:_/ |     ', '    //   \\ \\    ', '   (|     | )   ', "  /'\\_   _/`\\   ", '  \\___)=(___/   '];
    const info = [`${sh.user}@linux-school`, '-'.repeat(sh.user.length + 13), 'OS: Ubuntu 24.04.1 LTS x86_64', 'Host: Virtual Machine', 'Kernel: 6.8.0-45-generic', 'Uptime: 3 days, 2 hours', `Packages: ${sh.installed.size + 300} (dpkg)`, 'Shell: bash 5.2.21', 'CPU: Virtual CPU @ 2.60GHz (2)', 'Memory: 1232MiB / 3951MiB'];
    const n = Math.max(logo.length, info.length);
    for (let i = 0; i < n; i++) c.out(`\x1b[33m${(logo[i] || ' '.repeat(16)).padEnd(18)}\x1b[0m${i === 0 ? '\x1b[1;32m' + info[i] + '\x1b[0m' : info[i] || ''}\n`);
  }, { pkg: 'neofetch' });
  def('ifconfig', async (c) => {
    c.out('eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 192.168.1.10  netmask 255.255.255.0  broadcast 192.168.1.255\n        ether 02:42:ac:11:00:02  txqueuelen 0  (Ethernet)\n\nlo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n        inet 127.0.0.1  netmask 255.0.0.0\n        loop  txqueuelen 1000  (Local Loopback)\n');
  }, { pkg: 'net-tools' });

  /* ---- apt ---- */
  function aptCmd(name) {
    return async (c, args) => {
      const sh = c.sh;
      const g = U.getopts(name, c, args.map((a) => (a === '-y' ? '-y' : a)), 'yqsfd', '', { yes: 'y', 'assume-yes': 'y', installed: 'i' });
      if (!g) return 100;
      const { o, rest } = g;
      const sub = rest[0];
      const pk = rest.slice(1);
      if (!sub) {
        c.out(`${name} 2.7.14 (amd64)\nUsage: ${name} [options] command\n\nMost used commands:\n  list - list packages based on package names\n  search - search in package descriptions\n  show - show package details\n  install - install packages\n  remove - remove packages\n  update - update list of available packages\n  upgrade - upgrade the system by installing/upgrading packages\n`);
        return 0;
      }
      const need = (what) => {
        if (sh.eu() === 'root') return false;
        if (what === 'update') c.err('Reading package lists... Done\nE: Could not open lock file /var/lib/apt/lists/lock - open (13: Permission denied)\nE: Unable to lock directory /var/lib/apt/lists/\nW: Problem unlinking the file /var/cache/apt/pkgcache.bin - RemoveCaches (13: Permission denied)\n');
        else c.err('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?\n');
        return true;
      };
      switch (sub) {
        case 'update':
          if (need('update')) return 100;
          c.out('Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease\nGet:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]\nGet:3 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]\nFetched 252 kB in 1s (310 kB/s)\nReading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nAll packages are up to date.\n');
          return 0;
        case 'upgrade':
        case 'full-upgrade':
        case 'dist-upgrade':
          if (need()) return 100;
          c.out('Reading package lists... Done\nBuilding dependency tree... Done\nCalculating upgrade... Done\n0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\n');
          return 0;
        case 'autoremove':
        case 'clean':
        case 'autoclean':
          if (need()) return 100;
          c.out('Reading package lists... Done\nBuilding dependency tree... Done\n0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\n');
          return 0;
        case 'install':
        case 'reinstall': {
          if (!pk.length) {
            c.err('E: No packages specified\n');
            return 100;
          }
          if (need()) return 100;
          const todo = [];
          for (const p of pk) {
            if (!LX.PKGS[p] && !LX.DEFAULT_PKGS.includes(p)) {
              c.err(`E: Unable to locate package ${p}\n`);
              return 100;
            }
            if (sh.installed.has(p)) c.out(`${p} is already the newest version (${(LX.PKGS[p] || { ver: '1.0' }).ver}).\n`);
            else todo.push(p);
          }
          if (!todo.length) {
            c.out('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\n');
            return 0;
          }
          const kb = todo.reduce((s, p) => s + LX.PKGS[p].size, 0);
          c.out(`Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nThe following NEW packages will be installed:\n  ${todo.join(' ')}\n0 upgraded, ${todo.length} newly installed, 0 to remove and 0 not upgraded.\nNeed to get ${kb} kB of archives.\nAfter this operation, ${kb * 3} kB of additional disk space will be used.\n`);
          if (!o.y) {
            const a = await U.ask(c, 'Do you want to continue? [Y/n] ');
            if (a !== '' && !/^y/i.test(a)) {
              c.out('Abort.\n');
              return 1;
            }
          }
          todo.forEach((p, i) => c.out(`Get:${i + 1} http://archive.ubuntu.com/ubuntu noble/universe amd64 ${p} amd64 ${LX.PKGS[p].ver} [${LX.PKGS[p].size} kB]\n`));
          c.out(`Fetched ${kb} kB in 0s (${kb * 5} kB/s)\n`);
          for (const p of todo) {
            c.out(`Selecting previously unselected package ${p}.\n(Reading database ... 71523 files and directories currently installed.)\nPreparing to unpack .../${p}_${LX.PKGS[p].ver}_amd64.deb ...\nUnpacking ${p} (${LX.PKGS[p].ver}) ...\nSetting up ${p} (${LX.PKGS[p].ver}) ...\n`);
            sh.installed.add(p);
            LX.PKGS[p].bins.forEach((b) => sh.addBinary(b));
            if (p === 'vim') {
              sh.addBinary('vim');
            }
            if (LX.PKGS[p].service) {
              sh.services[p] = { desc: LX.PKGS[p].service.desc, active: true, enabled: true, pid: 900 + Math.floor(Math.random() * 90), proc: LX.PKGS[p].service.proc, since: Date.now() };
              if (p === 'nginx') {
                sh.fs.mkdirp('/var/www/html', { owner: 'root', group: 'root' });
                sh.services[p].pid = 880;
              }
            }
            if (sh.onInstall) sh.onInstall(p, LX.PKGS[p]);
          }
          c.out('Processing triggers for man-db (2.12.0-4build2) ...\n');
          return 0;
        }
        case 'remove':
        case 'purge': {
          if (need()) return 100;
          for (const p of pk) {
            if (!sh.installed.has(p) || !LX.PKGS[p]) {
              c.err(`Package '${p}' is not installed, so not removed\n`);
              continue;
            }
            if (!o.y && sh.hooks.readLine) {
              c.out(`Reading package lists... Done\nThe following packages will be REMOVED:\n  ${p}\n0 upgraded, 0 newly installed, 1 to remove and 0 not upgraded.\nAfter this operation, ${LX.PKGS[p].size * 3} kB disk space will be freed.\n`);
              const a = await U.ask(c, 'Do you want to continue? [Y/n] ');
              if (a !== '' && !/^y/i.test(a)) {
                c.out('Abort.\n');
                return 1;
              }
            }
            c.out(`Removing ${p} (${LX.PKGS[p].ver}) ...\n`);
            sh.installed.delete(p);
            LX.PKGS[p].bins.forEach((b) => sh.removeBinary(b));
            if (sh.onRemove) sh.onRemove(p);
            if (sh.services[p]) delete sh.services[p];
          }
          return 0;
        }
        case 'search': {
          const q = (pk[0] || '').toLowerCase();
          c.out('Sorting... Done\nFull Text Search... Done\n');
          for (const [k, p] of Object.entries(LX.PKGS)) if (k.includes(q) || p.desc.toLowerCase().includes(q)) c.out(`\x1b[32m${k}\x1b[0m/noble ${p.ver} amd64${sh.installed.has(k) ? ' [installed]' : ''}\n  ${p.desc}\n\n`);
          return 0;
        }
        case 'show':
        case 'info': {
          const p = LX.PKGS[pk[0]];
          if (!p) {
            c.err(`E: No packages found\n`);
            return 100;
          }
          c.out(`Package: ${pk[0]}\nVersion: ${p.ver}\nPriority: optional\nSection: universe/utils\nMaintainer: Ubuntu Developers\nInstalled-Size: ${p.size * 3} kB\nDownload-Size: ${p.size} kB\nDescription: ${p.desc}\n`);
          return 0;
        }
        case 'list': {
          c.out('Listing... Done\n');
          const only = o.i || args.includes('--installed');
          for (const [k, p] of Object.entries(LX.PKGS)) if (!only || sh.installed.has(k)) c.out(`${k}/noble ${p.ver} amd64${sh.installed.has(k) ? ' [installed]' : ''}\n`);
          if (only) for (const k of LX.DEFAULT_PKGS) if (!LX.PKGS[k]) c.out(`${k}/noble,now 1.0 amd64 [installed]\n`);
          return 0;
        }
      }
      c.err(`E: Invalid operation ${sub}\n`);
      return 100;
    };
  }
  def('apt', aptCmd('apt'));
  def('apt-get', aptCmd('apt-get'));
  def('dpkg', async (c, args) => {
    if (args.includes('-l')) {
      c.out('Desired=Unknown/Install/Remove/Purge/Hold\n| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend\n|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)\n||/ Name           Version            Architecture Description\n+++-==============-==================-============-=================================\n');
      for (const k of [...c.sh.installed].sort()) c.out(`ii  ${k.padEnd(14)} ${(LX.pkgVer ? LX.pkgVer(c.sh, k) : '1.0-1').padEnd(18)} amd64        ${(LX.PKGS[k] || { desc: 'core system package' }).desc}\n`);
      return 0;
    }
    if (args[0] === '-s' || args[0] === '-L') return c.out('dpkg: (sandbox) try  apt show <package>\n');
    c.err('dpkg: need an action option\n');
    return 2;
  });

  /* ============ network ============ */
  const HOSTS = { localhost: '127.0.0.1', 'linux-school': '192.168.1.10', 'google.com': '142.250.183.14', 'www.google.com': '142.250.183.14', 'example.com': '93.184.215.14', 'www.example.com': '93.184.215.14', 'github.com': '140.82.121.4', 'api.github.com': '140.82.121.6', 'wikipedia.org': '208.80.154.224', 'ubuntu.com': '185.125.190.20', 'httpbin.org': '3.211.79.7', 'jsonplaceholder.typicode.com': '104.21.40.9', 'ifconfig.me': '34.160.111.145', 'demo-server': '192.168.1.20' };
  function resolve(h) {
    if (LX.curSh && LX.curSh.resolveHost) return LX.curSh.resolveHost(h);
    if (HOSTS[h]) return HOSTS[h];
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) && h.split('.').every((x) => +x < 256)) return h;
    return null;
  }
  def('ping', async (c, args) => {
    const sh = c.sh;
    const g = U.getopts('ping', c, args, 'qnv', 'cWwi', {});
    if (!g) return 2;
    const host = g.rest[0];
    if (!host) {
      c.err('ping: usage error: Destination address required\n');
      return 2;
    }
    const ip = resolve(host);
    if (!ip) {
      c.err(`ping: ${host}: ${LX.resolveMsg ? LX.resolveMsg(sh) : 'Name or service not known'}\n`);
      return 2;
    }
    if (sh.netUp && !sh.ownIps().includes(ip) && !sh.netUp()) {
      c.err('ping: connect: Network is unreachable\n');
      return 2;
    }
    let max = g.o.c ? +g.o.c : sh.fast ? 4 : Infinity;
    const local = ip.startsWith('127.');
    c.out(`PING ${host} (${ip}) 56(84) bytes of data.\n`);
    let sent = 0;
    const times = [];
    const summary = () => {
      const loss = sent ? 0 : 0;
      const mn = Math.min(...times);
      const mx = Math.max(...times);
      const avg = times.reduce((a, b) => a + b, 0) / (times.length || 1);
      c.out(`\n--- ${host} ping statistics ---\n${sent} packets transmitted, ${times.length} received, ${loss}% packet loss, time ${(sent - 1) * 1001}ms\nrtt min/avg/max/mdev = ${mn.toFixed(3)}/${avg.toFixed(3)}/${mx.toFixed(3)}/${((mx - mn) / 2).toFixed(3)} ms\n`);
    };
    try {
      while (sent < max) {
        sent++;
        const t = local ? 0.02 + Math.random() * 0.05 : ip.startsWith('192.168') ? 0.4 + Math.random() : 18 + Math.random() * 22;
        times.push(t);
        c.out(`64 bytes from ${host === ip ? ip : host + ' (' + ip + ')'}: icmp_seq=${sent} ttl=${local ? 64 : 56} time=${local ? t.toFixed(3) : t.toFixed(1)} ms\n`);
        if (sent < max) await sh.waitMs(g.o.i ? +g.o.i * 1000 : 1000);
      }
    } catch (e) {
      if (!(e instanceof AbortSig)) throw e;
      sh.aborted = false;
    }
    summary();
    return 0;
  });
  const EXAMPLE_HTML = '<!doctype html>\n<html>\n<head>\n    <title>Example Domain</title>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n</head>\n\n<body>\n<div>\n    <h1>Example Domain</h1>\n    <p>This domain is for use in illustrative examples in documents. You may use this\n    domain in literature without prior coordination or asking for permission.</p>\n    <p><a href="https://www.iana.org/domains/example">More information...</a></p>\n</div>\n</body>\n</html>\n';
  const NGINX_HTML = '<!DOCTYPE html>\n<html>\n<head>\n<title>Welcome to nginx!</title>\n</head>\n<body>\n<h1>Welcome to nginx!</h1>\n<p>If you see this page, the nginx web server is successfully installed and working.</p>\n<p><em>Thank you for using nginx.</em></p>\n</body>\n</html>\n';
  function fetchUrl(sh, raw) {
    let u = raw;
    if (!/^[a-z]+:\/\//i.test(u)) u = 'http://' + u;
    let m = /^([a-z]+):\/\/([^/:]+)(?::(\d+))?(\/[^?#]*)?(\?[^#]*)?/i.exec(u);
    if (!m) return { err: 3, msg: `curl: (3) URL rejected: Malformed input to a URL function` };
    const host = m[2].toLowerCase();
    const port = m[3] ? +m[3] : m[1] === 'https' ? 443 : 80;
    const path = m[4] || '/';
    const ip = resolve(host);
    if (!ip) return { err: 6, msg: `curl: (6) Could not resolve host: ${host}` };
    if (host === 'localhost' || ip.startsWith('127.') || host === 'linux-school') {
      if (port === 80 && sh.services.nginx && sh.services.nginx.active) return { status: 200, ct: 'text/html', body: NGINX_HTML, host, ip, port, path, server: 'nginx/1.24.0 (Ubuntu)' };
      return { err: 7, msg: `curl: (7) Failed to connect to ${host} port ${port} after 0 ms: Couldn't connect to server` };
    }
    let body;
    let ct = 'text/html; charset=UTF-8';
    if (/example\.com$/.test(host)) body = EXAMPLE_HTML;
    else if (host === 'api.github.com' && path === '/zen') (body = 'Keep it logically awesome.\n'), (ct = 'text/plain');
    else if (host === 'ifconfig.me') (body = '203.0.113.42'), (ct = 'text/plain');
    else if (host === 'jsonplaceholder.typicode.com') (body = '{\n  "userId": 1,\n  "id": 1,\n  "title": "delectus aut autem",\n  "completed": false\n}\n'), (ct = 'application/json');
    else if (host === 'httpbin.org') (body = '{\n  "args": {},\n  "origin": "203.0.113.42",\n  "url": "https://httpbin.org/get"\n}\n'), (ct = 'application/json');
    else body = `<html><head><title>${host}</title></head><body><h1>${host}</h1><p>(sandbox page)</p></body></html>\n`;
    return { status: 200, ct, body, host, ip, port, path, server: 'ECS (dcb/7F83)' };
  }
  def('curl', async (c, args) => {
    const sh = c.sh;
    const g = U.getopts('curl', c, args, 'sSIiLOkvf', 'oXdHuA', { silent: 's', head: 'I', output: 'o', location: 'L', 'remote-name': 'O', include: 'i', request: 'X', header: 'H', data: 'd', fail: 'f' });
    if (!g) return 2;
    const { o, rest } = g;
    if (!rest.length) {
      c.err("curl: try 'curl --help' or 'curl --manual' for more information\n");
      return 2;
    }
    let st = 0;
    for (const url of rest) {
      const r = fetchUrl(sh, url);
      if (r.err) {
        if (!(o.s && !o.S)) c.err(r.msg + '\n');
        st = r.err;
        continue;
      }
      const hdrs = `HTTP/1.1 200 OK\r\nServer: ${r.server}\r\nContent-Type: ${r.ct}\r\nContent-Length: ${r.body.length}\r\nDate: ${new Date().toUTCString()}\r\n\r\n`;
      if (o.I) {
        c.out(hdrs.replace(/\r/g, ''));
        continue;
      }
      let out = (o.i ? hdrs.replace(/\r/g, '') : '') + r.body;
      if (o.o || o.O) {
        const fname = o.o || base(r.path) || 'index.html';
        try {
          sh.writeFile(c.abs(fname), r.body, false);
        } catch (e) {
          if (!(e instanceof FsErr)) throw e;
          c.err(`curl: (23) Failure writing output to destination, passed ${r.body.length} returned 0\n`);
          st = 23;
          continue;
        }
        if (!o.s) c.err(`  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current\n                                 Dload  Upload   Total   Spent    Left  Speed\n100 ${String(r.body.length).padStart(5)}  100 ${String(r.body.length).padStart(5)}    0     0   ${String(r.body.length * 6).padStart(5)}      0 --:--:-- --:--:-- --:--:--  ${r.body.length * 6}\n`);
        continue;
      }
      c.out(out);
    }
    return st;
  });
  def('wget', async (c, args) => {
    const sh = c.sh;
    const g = U.getopts('wget', c, args, 'qcN', 'O', { output: 'O', quiet: 'q' });
    if (!g) return 2;
    const url = g.rest[0];
    if (!url) {
      c.err('wget: missing URL\nUsage: wget [OPTION]... [URL]...\n');
      return 1;
    }
    const r = fetchUrl(sh, url);
    const full = /^[a-z]+:\/\//.test(url) ? url : 'http://' + url;
    if (r.err) {
      if (r.err === 6) c.err(`--${U.strftime('%F %T', new Date())}--  ${full}\nResolving ${url.replace(/^https?:\/\//, '').split('/')[0]}... failed: Name or service not known.\nwget: unable to resolve host address ‘${url.replace(/^https?:\/\//, '').split('/')[0]}’\n`);
      else c.err(`--${U.strftime('%F %T', new Date())}--  ${full}\nConnecting to ${r.host}:${r.port}... failed: Connection refused.\n`);
      return 4;
    }
    const fname = g.o.O || (base(r.path) && base(r.path).includes('.') ? base(r.path) : 'index.html');
    try {
      sh.writeFile(c.abs(fname), r.body, false);
    } catch (e) {
      if (!(e instanceof FsErr)) throw e;
      c.err(`${fname}: ${U.errTxt(e)}\n\nCannot write to ‘${fname}’ (${U.errTxt(e)}).\n`);
      return 3;
    }
    if (!g.o.q) c.out(`--${U.strftime('%F %T', new Date())}--  ${full}\nResolving ${r.host} (${r.host})... ${r.ip}\nConnecting to ${r.host} (${r.host})|${r.ip}|:${r.port}... connected.\nHTTP request sent, awaiting response... 200 OK\nLength: ${r.body.length} (${U.human(r.body.length)}) [${r.ct.split(';')[0]}]\nSaving to: ‘${fname}’\n\n${fname.padEnd(20)}100%[===================>]  ${U.human(r.body.length).padStart(6)}  --.-KB/s    in 0s\n\n${U.strftime('%F %T', new Date())} (45.2 MB/s) - ‘${fname}’ saved [${r.body.length}/${r.body.length}]\n\n`);
    return 0;
  });
  def('ip', async (c, args) => {
    const brief = args.includes('-br') || args.includes('-brief') || args.includes('-b');
    const sub = args.filter((a) => !a.startsWith('-'))[0] || 'addr';
    if (/^a(ddr(ess)?)?$/.test(sub)) {
      if (brief) return c.out('lo               UNKNOWN        127.0.0.1/8 ::1/128\neth0             UP             192.168.1.10/24\n');
      return c.out('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n    inet 127.0.0.1/8 scope host lo\n       valid_lft forever preferred_lft forever\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000\n    link/ether 02:42:ac:11:00:02 brd ff:ff:ff:ff:ff:ff\n    inet 192.168.1.10/24 brd 192.168.1.255 scope global dynamic eth0\n       valid_lft 85123sec preferred_lft 85123sec\n');
    }
    if (/^r(oute)?$/.test(sub)) return c.out('default via 192.168.1.1 dev eth0 proto dhcp src 192.168.1.10 metric 100\n192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.10 metric 100\n');
    if (/^l(ink)?$/.test(sub)) return c.out('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP mode DEFAULT group default qlen 1000\n    link/ether 02:42:ac:11:00:02 brd ff:ff:ff:ff:ff:ff\n');
    c.err(`Object "${sub}" is unknown, try "ip help".\n`);
    return 1;
  });
  function listening(sh) {
    const l = [['tcp', '0.0.0.0', 22, 'sshd', 412], ['tcp', '127.0.0.53', 53, 'systemd-resolve', 301], ['udp', '127.0.0.53', 53, 'systemd-resolve', 301]];
    if (sh.services.nginx && sh.services.nginx.active) l.splice(1, 0, ['tcp', '0.0.0.0', 80, 'nginx', 880]);
    return l;
  }
  def('ss', async (c, args) => {
    const f = args.join(' ');
    const showP = /p/.test(f.replace(/--\w+/g, '')) && /-\w*p/.test(f);
    c.out(`Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess\n`);
    for (const [proto, ip, port, proc, pid] of listening(c.sh)) {
      if (/-\w*t/.test(f) && !/-\w*u/.test(f) && proto !== 'tcp') continue;
      if (/-\w*u/.test(f) && !/-\w*t/.test(f) && proto !== 'udp') continue;
      c.out(`${proto.padEnd(6)} ${(proto === 'udp' ? 'UNCONN' : 'LISTEN').padEnd(6)} ${'0'.padEnd(6)} ${(proto === 'udp' ? '0' : '128').padEnd(6)} ${(ip + ':' + port).padEnd(19)} ${'0.0.0.0:*'.padEnd(18)}${showP && c.sh.eu() === 'root' ? `users:(("${proc}",pid=${pid},fd=3))` : ''}\n`);
    }
    return 0;
  });
  def('netstat', async (c, args) => {
    c.out('Active Internet connections (only servers)\nProto Recv-Q Send-Q Local Address           Foreign Address         State\n');
    for (const [proto, ip, port] of listening(c.sh)) if (proto === 'tcp') c.out(`tcp        0      0 ${(ip + ':' + port).padEnd(23)} 0.0.0.0:*               LISTEN\n`);
  }, { pkg: 'net-tools' });
  def('nslookup', async (c, args) => {
    const h = args.find((a) => !a.startsWith('-'));
    if (!h) return 0;
    const ip = resolve(h);
    if (!ip || h === ip) {
      c.out(`Server:\t\t127.0.0.53\nAddress:\t127.0.0.53#53\n\n** server can't find ${h}: NXDOMAIN\n\n`);
      return 1;
    }
    c.out(`Server:\t\t127.0.0.53\nAddress:\t127.0.0.53#53\n\nNon-authoritative answer:\nName:\t${h}\nAddress: ${ip}\n\n`);
  });
  def('dig', async (c, args) => {
    const h = args.find((a) => !a.startsWith('-') && !a.startsWith('+') && !a.startsWith('@'));
    const ip = h && resolve(h);
    c.out(`; <<>> DiG 9.18 <<>> ${h}\n;; ANSWER SECTION:\n${ip ? `${h}.\t\t300\tIN\tA\t${ip}\n` : ''}\n;; Query time: 12 msec\n`);
  }, { pkg: 'dnsutils' });
  def('ssh', async (c, args) => {
    const sh = c.sh;
    const target = args.filter((a) => !a.startsWith('-'))[0];
    if (!target) {
      c.err('usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-B bind_interface] user@host\n');
      return 255;
    }
    const [user, host] = target.includes('@') ? target.split('@') : [sh.user, target];
    const ip = resolve(host);
    if (!ip) {
      c.err(`ssh: Could not resolve hostname ${host}: Name or service not known\n`);
      return 255;
    }
    if (host !== 'demo-server' && host !== 'localhost') {
      c.err(`ssh: connect to host ${host} port 22: Connection timed out\n`);
      return 255;
    }
    c.out(`The authenticity of host '${host} (${ip})' can't be established.\nED25519 key fingerprint is SHA256:Qk3y0xTz9tqf2eE0b6c1R0l3v4Ew+Y8k2m1n0pQrStU.\nThis key is not known by any other names.\n`);
    const a = await U.ask(c, 'Are you sure you want to continue connecting (yes/no/[fingerprint])? ');
    if (!/^y/i.test(a)) {
      c.err('Host key verification failed.\n');
      return 255;
    }
    c.out(`Warning: Permanently added '${host}' (ED25519) to the list of known hosts.\n`);
    if (sh.hooks.readLine) {
      await sh.hooks.readLine(`${user}@${host}'s password: `, { secret: true });
      sh.checkAbort();
    }
    c.out(`Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)\n\nLast login: ${U.strftime('%a %b %e %H:%M:%S %Y', new Date(Date.now() - 86400000))} from 192.168.1.5\n${user}@${host}:~$ \x1b[2m(This is a demo: a real ssh would now give you a shell on that other computer.)\x1b[0m\nlogout\nConnection to ${host} closed.\n`);
    return 0;
  });
  def('scp', async (c, args) => {
    const rest = args.filter((a) => !a.startsWith('-'));
    if (rest.length < 2) {
      c.err('usage: scp [-346BCpqrTv] [-c cipher] source ... target\n');
      return 1;
    }
    const src = rest[0];
    const isRemote = (s) => s.includes(':');
    if (isRemote(src) && !isRemote(rest[1])) {
      c.err(`ssh: Could not resolve hostname ${src.split(':')[0].split('@').pop()}: Name or service not known\n`);
      return 255;
    }
    const n = c.sh.fs.lookup(c.abs(src));
    if (!n) {
      c.err(`scp: ${src}: No such file or directory\n`);
      return 1;
    }
    c.out(`${base(src).padEnd(28)}100% ${String(VFS.size(n)).padStart(6)}   1.2MB/s   00:00\n`);
    return 0;
  });
})();
