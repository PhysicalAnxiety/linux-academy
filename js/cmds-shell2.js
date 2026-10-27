/* Linux Academy: advanced shell builtins (test, set, trap, getopts, declare, ...) */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, VFS, CmdErr } = LX;
  const U = LX.U;

  /** Evaluate test / [ / [[ expressions. a = string tokens, dbl = [[ ]] mode, globs = per-token "unquoted glob" flags */
  LX.evalTest = function (sh, a, dbl, globs) {
    globs = globs || [];
    let p = 0;
    const un = (op, x) => {
      const n = sh.stat(x);
      switch (op) {
        case '-e': return !!n;
        case '-f': return !!n && n.t === 'f';
        case '-d': return !!n && n.t === 'd';
        case '-L':
        case '-h': return !!sh.stat(x, false) && sh.stat(x, false).t === 'l';
        case '-r': return !!n && sh.can(n, 4);
        case '-w': return !!n && sh.can(n, 2);
        case '-x': return !!n && sh.can(n, 1);
        case '-s': return !!n && VFS.size(n) > 0;
        case '-z': return x === '';
        case '-n': return x !== '';
        case '-v': return sh.getVar(x) !== undefined;
        case '-b': return !!n && n.blk === true;
        case '-c': return !!n && n.t === 'c';
        case '-O': return !!n && n.owner === sh.eu();
      }
      throw new CmdErr('unary operator expected');
    };
    const bin = (x, op, y, gl) => {
      const nx = parseInt(x, 10);
      const ny = parseInt(y, 10);
      switch (op) {
        case '=':
        case '==': return dbl && gl ? LX.globToRegex(y).test(x) : x === y;
        case '!=': return dbl && gl ? !LX.globToRegex(y).test(x) : x !== y;
        case '<': return x < y;
        case '>': return x > y;
        case '-eq': return nx === ny;
        case '-ne': return nx !== ny;
        case '-lt': return nx < ny;
        case '-le': return nx <= ny;
        case '-gt': return nx > ny;
        case '-ge': return nx >= ny;
        case '-nt': { const a1 = sh.stat(x); const b1 = sh.stat(y); return !!a1 && (!b1 || a1.mtime > b1.mtime); }
        case '-ot': { const a1 = sh.stat(x); const b1 = sh.stat(y); return !!b1 && (!a1 || a1.mtime < b1.mtime); }
        case '=~': {
          let re;
          try {
            re = new RegExp(LX.U.convertRegex ? LX.U.convertRegex(y, true) : y);
          } catch (e) {
            throw new CmdErr('invalid regular expression');
          }
          const m = re.exec(x);
          if (m) sh.arrays.BASH_REMATCH = Array.from(m).map((v) => (v === undefined ? '' : v));
          return !!m;
        }
      }
      throw new CmdErr(`${op}: binary operator expected`);
    };
    const isBin = (t) => ['=', '==', '!=', '<', '>', '-eq', '-ne', '-lt', '-le', '-gt', '-ge', '=~', '-nt', '-ot'].includes(t);
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
      if (a[p + 1] !== undefined && isBin(a[p + 1]) && a[p + 2] !== undefined) {
        const r = bin(a[p], a[p + 1], a[p + 2], globs[p + 2]);
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
      while (a[p] === '-a' || (dbl && a[p] === '&&')) {
        p++;
        const r = prim();
        v = v && r;
      }
      return v;
    }
    function or() {
      let v = and();
      while (a[p] === '-o' || (dbl && a[p] === '||')) {
        p++;
        const r = and();
        v = v || r;
      }
      return v;
    }
    return a.length ? or() : false;
  };

  for (const nm of ['test', '[']) {
    def(
      nm,
      async (c, args) => {
        const a = args.slice();
        if (nm === '[') {
          if (a[a.length - 1] !== ']') {
            c.err("bash: [: missing `]'\n");
            return 2;
          }
          a.pop();
        }
        try {
          return LX.evalTest(c.sh, a, false) ? 0 : 1;
        } catch (e) {
          if (e instanceof CmdErr) {
            c.err(`bash: ${nm}: ${e.message}\n`);
            return 2;
          }
          throw e;
        }
      },
      { builtin: true, bin: true }
    );
  }

  /* ---- set / trap / getopts / declare ---- */
  def(
    'set',
    async (c, args) => {
      const sh = c.sh;
      if (!args.length) {
        for (const [k, v] of Object.entries(sh.vars)) c.out(`${k}=${v}\n`);
        return 0;
      }
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--') {
          if (!sh.argStack.length) sh.argStack.push({ args: [], name: 'bash' });
          const fr = sh.argStack[sh.argStack.length - 1];
          if (fr) fr.args = args.slice(i + 1);
          break;
        }
        if (a === '-o' || a === '+o') {
          const name = args[++i];
          if (!name) {
            for (const [k, v] of Object.entries({ errexit: sh.opts.e, nounset: sh.opts.u, xtrace: sh.opts.x, pipefail: sh.opts.pipefail })) c.out(`${k.padEnd(15)}${v ? 'on' : 'off'}\n`);
            continue;
          }
          const key = { errexit: 'e', nounset: 'u', xtrace: 'x', pipefail: 'pipefail' }[name];
          if (key) sh.opts[key] = a === '-o';
          continue;
        }
        const m = /^([-+])([a-zA-Z]+)$/.exec(a);
        if (m) {
          for (const ch of m[2]) {
            if (ch === 'o') {
              const name = args[++i];
              const key = { errexit: 'e', nounset: 'u', xtrace: 'x', pipefail: 'pipefail' }[name];
              if (key) sh.opts[key] = m[1] === '-';
            } else if ('eux'.includes(ch)) sh.opts[ch] = m[1] === '-';
          }
        } else {
          if (!sh.argStack.length) sh.argStack.push({ args: [], name: 'bash' });
          const fr = sh.argStack[sh.argStack.length - 1];
          if (fr) fr.args = args.slice(i);
          break;
        }
      }
      return 0;
    },
    { builtin: true }
  );
  def(
    'trap',
    async (c, args) => {
      const sh = c.sh;
      if (!args.length || args[0] === '-p') {
        for (const [k, v] of Object.entries(sh.traps)) c.out(`trap -- '${v}' ${k}\n`);
        return 0;
      }
      const [action, ...sigs] = args;
      for (const s of sigs) {
        const k = s.replace(/^SIG/, '').toUpperCase().replace(/^0$/, 'EXIT');
        if (action === '-') delete sh.traps[k];
        else sh.traps[k] = action;
      }
      return 0;
    },
    { builtin: true }
  );
  def(
    'getopts',
    async (c, args) => {
      const sh = c.sh;
      const [spec, name, ...rest] = args;
      if (!spec || !name) {
        c.err('bash: getopts: usage: getopts optstring name [arg ...]\n');
        return 2;
      }
      const fr = sh.argStack[sh.argStack.length - 1];
      const params = rest.length ? rest : fr ? fr.args : [];
      let idx = Number(sh.getVar('OPTIND') || 1);
      const silent = spec[0] === ':';
      const sp = silent ? spec.slice(1) : spec;
      const word = params[idx - 1];
      if (word === undefined || word === '-' || !word.startsWith('-')) return 1;
      if (word === '--') {
        sh.setVar('OPTIND', String(idx + 1));
        return 1;
      }
      let sub = sh._optsub || 1;
      const ch = word[sub];
      const pos = sp.indexOf(ch);
      const advance = () => {
        if (sub + 1 >= word.length) {
          idx++;
          sub = 1;
        } else sub++;
      };
      if (pos < 0) {
        advance();
        sh.setVar(name, '?');
        if (silent) sh.setVar('OPTARG', ch);
        else c.err(`${fr ? fr.name : 'bash'}: illegal option -- ${ch}\n`);
      } else if (sp[pos + 1] === ':') {
        const restWord = word.slice(sub + 1);
        if (restWord) {
          sh.setVar('OPTARG', restWord);
          idx++;
          sub = 1;
          sh.setVar(name, ch);
        } else if (params[idx] !== undefined) {
          sh.setVar('OPTARG', params[idx]);
          idx += 2;
          sub = 1;
          sh.setVar(name, ch);
        } else {
          idx++;
          sub = 1;
          if (silent) {
            sh.setVar(name, ':');
            sh.setVar('OPTARG', ch);
          } else {
            sh.setVar(name, '?');
            c.err(`${fr ? fr.name : 'bash'}: option requires an argument -- ${ch}\n`);
          }
        }
      } else {
        advance();
        sh.setVar(name, ch);
        sh.setVar('OPTARG', '');
      }
      sh._optsub = sub;
      sh.setVar('OPTIND', String(idx));
      return 0;
    },
    { builtin: true }
  );
  const declare = async (c, args) => {
    const sh = c.sh;
    let assoc = false;
    let arr = false;
    let ro = false;
    let exp = false;
    let print = false;
    const names = [];
    for (const a of args) {
      if (/^-[aArxip]+$/.test(a)) {
        if (a.includes('A')) assoc = true;
        if (a.includes('a')) arr = true;
        if (a.includes('r')) ro = true;
        if (a.includes('x')) exp = true;
        if (a.includes('p')) print = true;
      } else names.push(a);
    }
    if (print || !names.length) {
      for (const [k, v] of Object.entries(sh.arrays)) c.out(`declare -${Array.isArray(v) ? 'a' : 'A'} ${k}=(${Array.isArray(v) ? v.map((x, i) => `[${i}]="${x}"`).join(' ') : Object.entries(v).map(([a, b]) => `[${a}]="${b}"`).join(' ')})\n`);
      for (const [k, v] of Object.entries(sh.vars)) if (!names.length || names.includes(k)) c.out(`declare -- ${k}="${v}"\n`);
      return 0;
    }
    for (const n of names) {
      const [k, v] = n.split(/=(.*)/s);
      if (assoc) {
        sh.assoc.add(k);
        if (!sh.arrays[k]) sh.arrays[k] = {};
      } else if (arr) {
        if (!sh.arrays[k]) sh.arrays[k] = [];
      } else if (v !== undefined) {
        const top = sh.localStack[sh.localStack.length - 1];
        if (top) top[k] = v;
        else sh.setVar(k, v);
      }
      if (exp) sh.exported.add(k);
      if (ro) {
        if (!sh.readonly) sh.readonly = new Set();
        sh.readonly.add(k);
      }
    }
    return 0;
  };
  def('declare', declare, { builtin: true });
  def('typeset', declare, { builtin: true });
  def(
    'readonly',
    async (c, args) => {
      const sh = c.sh;
      if (!sh.readonly) sh.readonly = new Set();
      for (const a of args) {
        if (a.startsWith('-')) continue;
        const [k, v] = a.split(/=(.*)/s);
        if (v !== undefined) sh.setVar(k, v);
        sh.readonly.add(k);
      }
      return 0;
    },
    { builtin: true }
  );
  const mapfile = async (c, args) => {
    const names = args.filter((a) => !a.startsWith('-'));
    const text = await c.slurp();
    c.sh.arrays[names[0] || 'MAPFILE'] = U.lines(text);
    return 0;
  };
  def('mapfile', mapfile, { builtin: true });
  def('readarray', mapfile, { builtin: true });
  def(
    'shopt',
    async () => 0,
    { builtin: true }
  );
  def(
    'ulimit',
    async (c, args) => {
      const sh = c.sh;
      sh.limits = sh.limits || { n: 1024, u: 15690, s: 8192, f: 'unlimited', t: 'unlimited' };
      if (args[0] === '-a')
        return c.out(`real-time non-blocking time  (microseconds, -R) unlimited\ncore file size              (blocks, -c) 0\nfile size                   (blocks, -f) ${sh.limits.f}\nopen files                          (-n) ${sh.limits.n}\nstack size                  (kbytes, -s) ${sh.limits.s}\nmax user processes                  (-u) ${sh.limits.u}\n`);
      const flag = (args[0] || '-f').replace('-', '');
      if (args[1] !== undefined) {
        if (c.sh.eu() !== 'root' && Number(args[1]) > Number(sh.limits[flag])) {
          c.err('bash: ulimit: ' + (flag === 'n' ? 'open files' : 'limit') + ': cannot modify limit: Operation not permitted\n');
          return 1;
        }
        sh.limits[flag] = args[1];
        return 0;
      }
      c.out(String(sh.limits[flag] ?? 'unlimited') + '\n');
    },
    { builtin: true }
  );
  def(
    'time',
    async (c, args) => {
      if (!args.length) return 0;
      const t0 = Date.now();
      const st = await c.sh.dispatch(args, c.io);
      const ms = Math.max(2, Date.now() - t0);
      c.err(`\nreal\t0m${(ms / 1000).toFixed(3)}s\nuser\t0m${(ms / 2000).toFixed(3)}s\nsys\t0m${(ms / 4000).toFixed(3)}s\n`);
      return st;
    },
    { builtin: true }
  );
  def(
    'disown',
    async (c, args) => {
      const sh = c.sh;
      const spec = args[0];
      sh.jobs = spec && /^%\d+$/.test(spec) ? sh.jobs.filter((j) => j.id !== +spec.slice(1)) : sh.jobs.slice(0, -1);
      return 0;
    },
    { builtin: true }
  );
  const origPrintf = LX.cmds.printf.run;
  def(
    'printf',
    async (c, args) => {
      if (args[0] === '-v' && args[1]) {
        let out = '';
        const c2 = Object.assign({}, c, { out: (s) => (out += s) });
        const st = await origPrintf(c2, args.slice(2));
        c.sh.setVar(args[1], out);
        return st;
      }
      return origPrintf(c, args);
    },
    { builtin: true, bin: true }
  );

  /* more text tools */
  def('paste', async (c, args) => {
    const g = U.getopts('paste', c, args, 's', 'd', {});
    if (!g) return 1;
    const delim = g.o.d || '\t';
    const cols = [];
    for (const f of g.rest.length ? g.rest : ['-']) {
      try {
        cols.push(U.lines(f === '-' ? await c.slurp() : c.sh.readFile(c.abs(f))));
      } catch (e) {
        c.err(`paste: ${f}: No such file or directory\n`);
        return 1;
      }
    }
    if (g.o.s) cols.forEach((col) => c.out(col.join(delim) + '\n'));
    else {
      const n = Math.max(...cols.map((x) => x.length));
      for (let i = 0; i < n; i++) c.out(cols.map((col) => col[i] || '').join(delim) + '\n');
    }
  });
  def('column', async (c, args) => {
    const g = U.getopts('column', c, args, 't', 'sdo', {});
    if (!g) return 1;
    const text = g.rest.length ? c.sh.readFile(c.abs(g.rest[0])) : await c.slurp();
    const rows = U.lines(text).map((l) => (g.o.s ? l.split(new RegExp('[' + g.o.s.replace(/[\]\\^-]/g, '\\$&') + ']')) : l.trim().split(/\s+/)));
    if (!g.o.t) return c.out(rows.map((r) => r.join(' ')).join('\n') + '\n');
    const w = [];
    rows.forEach((r) => r.forEach((x, i) => (w[i] = Math.max(w[i] || 0, x.length))));
    for (const r of rows) c.out(r.map((x, i) => (i === r.length - 1 ? x : x.padEnd(w[i] + 2))).join('') + '\n');
  });
  def('join', async (c, args) => {
    const files = args.filter((a) => !a.startsWith('-'));
    const a = U.lines(c.sh.readFile(c.abs(files[0]))).map((l) => l.split(/\s+/));
    const b = U.lines(c.sh.readFile(c.abs(files[1]))).map((l) => l.split(/\s+/));
    for (const x of a) for (const y of b) if (x[0] === y[0]) c.out([x[0], ...x.slice(1), ...y.slice(1)].join(' ') + '\n');
  });
  def('comm', async (c, args) => {
    const flags = args.filter((a) => /^-[123]+$/.test(a)).join('');
    const files = args.filter((a) => !/^-[123]+$/.test(a));
    const a = U.lines(c.sh.readFile(c.abs(files[0])));
    const b = U.lines(c.sh.readFile(c.abs(files[1])));
    const set = new Set([...a, ...b]);
    for (const l of [...set].sort()) {
      const ia = a.includes(l);
      const ib = b.includes(l);
      const col = ia && ib ? 3 : ia ? 1 : 2;
      if (flags.includes(String(col))) continue;
      const tabs = '\t'.repeat(col - 1 - [...Array(col - 1).keys()].filter((k) => flags.includes(String(k + 1))).length);
      c.out(tabs + l + '\n');
    }
  });
  def('shuf', async (c, args) => {
    const g = U.getopts('shuf', c, args, 'e', 'n', {});
    let lines = g.rest.length && !g.o.e ? U.lines(c.sh.readFile(c.abs(g.rest[0]))) : g.o.e ? g.rest : U.lines(await c.slurp());
    lines = lines.slice();
    for (let i = lines.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lines[i], lines[j]] = [lines[j], lines[i]];
    }
    c.out((g.o.n ? lines.slice(0, +g.o.n) : lines).join('\n') + '\n');
  });
  def('cmp', async (c, args) => {
    const a = c.sh.readFile(c.abs(args[0]));
    const b = c.sh.readFile(c.abs(args[1]));
    if (a === b) return 0;
    let i = 0;
    while (a[i] === b[i]) i++;
    c.out(`${args[0]} ${args[1]} differ: byte ${i + 1}, line ${a.slice(0, i).split('\n').length}\n`);
    return 1;
  });
  def('fold', async (c, args) => {
    const g = U.getopts('fold', c, args, 's', 'w', {});
    const w = +(g.o.w || 80);
    for (const l of U.lines(g.rest.length ? c.sh.readFile(c.abs(g.rest[0])) : await c.slurp())) for (let i = 0; i < Math.max(1, l.length); i += w) c.out(l.slice(i, i + w) + '\n');
  });
  def('expand', async (c, args) => {
    c.out((await c.slurp()).replace(/\t/g, '        '));
  });
  def('split', async (c, args) => {
    const g = U.getopts('split', c, args, '', 'l', {});
    const lines = U.lines(c.sh.readFile(c.abs(g.rest[0])));
    const n = +(g.o.l || 1000);
    const prefix = g.rest[1] || 'x';
    for (let i = 0, k = 0; i < lines.length; i += n, k++) c.sh.writeFile(c.abs(prefix + String.fromCharCode(97 + Math.floor(k / 26)) + String.fromCharCode(97 + (k % 26))), lines.slice(i, i + n).join('\n') + '\n', false);
  });
  def('base64', async (c, args) => {
    const dec = args.includes('-d') || args.includes('--decode');
    const f = args.find((a) => !a.startsWith('-'));
    const text = f ? c.sh.readFile(c.abs(f)) : await c.slurp();
    try {
      if (dec) c.out(typeof Buffer !== 'undefined' ? Buffer.from(text.trim(), 'base64').toString('utf8') : decodeURIComponent(escape(atob(text.trim()))));
      else {
        const b = typeof Buffer !== 'undefined' ? Buffer.from(text, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(text)));
        c.out(b.replace(/(.{76})/g, '$1\n') + '\n');
      }
    } catch (e) {
      c.err('base64: invalid input\n');
      return 1;
    }
  });
})();
