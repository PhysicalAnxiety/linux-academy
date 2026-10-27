/* Linux Academy: make, a tiny C compiler front, install, dnf/rpm, snap, flatpak, dpkg extras */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS } = LX;
  const U = LX.U;
  const sub = (c, line, io) => c.sh.runSource(line, io || { stdin: '', stdout: c.out, stderr: c.err, tty: false });

  /* ========== make ========== */
  function parseMakefile(text, vars0) {
    const vars = Object.assign({ CC: 'cc', CXX: 'g++', RM: 'rm -f', MAKE: 'make', CFLAGS: '', LDFLAGS: '' }, vars0 || {});
    const rules = [];
    const phony = new Set();
    let first = null;
    const lines = text.replace(/\\\n\s*/g, ' ').split('\n');
    const rawLines = text.split('\n');
    let cur = null;
    const expand = (s, auto) => {
      for (let i = 0; i < 12 && /\$[({]|\$[@<^*]/.test(s); i++) {
        s = s.replace(/\$\(([A-Za-z_][\w]*)\)|\$\{([A-Za-z_]\w*)\}/g, (m, a, b) => ((a || b) in vars ? vars[a || b] : ''));
        s = s.replace(/\$\(wildcard ([^)]*)\)/g, (m, g) => g.trim().split(/\s+/).join(' '));
        if (auto) s = s.replace(/\$@/g, auto.t).replace(/\$</g, auto.d[0] || '').replace(/\$\^/g, auto.d.join(' ')).replace(/\$\*/g, auto.stem || '');
      }
      return s.replace(/\$\$/g, '$');
    };
    lines.forEach((raw, idx) => {
      if (/^\t/.test(raw)) {
        if (cur) cur.recipe.push({ text: raw.replace(/^\t/, ''), line: idx + 1 });
        return;
      }
      const line = raw.replace(/(^|\s)#.*$/, '').trimEnd();
      if (!line.trim()) return;
      let m;
      if ((m = /^\s*([A-Za-z_][\w.]*)\s*(:=|\+=|\?=|=)\s*(.*)$/.exec(line))) {
        const [, k, op, v] = m;
        if (op === '+=') vars[k] = (vars[k] ? vars[k] + ' ' : '') + v;
        else if (op === '?=') { if (!(k in vars)) vars[k] = v; }
        else vars[k] = op === ':=' ? expand(v) : v;
        cur = null;
        return;
      }
      if ((m = /^([^:=]+?)\s*:\s*([^=]*)$/.exec(line)) && !/^\s*(ifeq|ifneq|define|endef|include)\b/.test(line)) {
        const targets = expand(m[1]).split(/\s+/).filter(Boolean);
        const parts = expand(m[2]).split('|')[0];
        const deps = parts.split(/\s+/).filter(Boolean);
        if (targets[0] === '.PHONY') { deps.forEach((d) => phony.add(d)); cur = null; return; }
        if (targets[0].startsWith('.') && !targets[0].includes('/') && /^\.[A-Z_]+$/.test(targets[0])) { cur = null; return; }
        cur = { targets, deps, recipe: [], line: idx + 1 };
        rules.push(cur);
        if (!first && !targets[0].includes('%')) first = targets[0];
        return;
      }
      cur = null;
    });
    return { vars, rules, phony, first, expand };
  }
  def(
    'make',
    async (c, args) => {
      const sh = c.sh;
      let file = null;
      let dir = null;
      let dry = false;
      let silent = false;
      const goals = [];
      const cmdVars = {};
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-f' || a === '--file') file = args[++i];
        else if (a === '-C') dir = args[++i];
        else if (a === '-n' || a === '--just-print' || a === '--dry-run') dry = true;
        else if (a === '-s' || a === '--silent') silent = true;
        else if (/^-j\d*$/.test(a) || a === '-k' || a === '-B' || a === '-w') continue;
        else if (/^[A-Za-z_]\w*=/.test(a)) cmdVars[a.split('=')[0]] = a.slice(a.indexOf('=') + 1);
        else if (!a.startsWith('-')) goals.push(a);
      }
      const base = dir ? c.abs(dir) : sh.cwd;
      if (dir) c.out(`make: Entering directory '${base}'\n`);
      const cand = file ? [file] : ['GNUmakefile', 'makefile', 'Makefile'];
      const mf = cand.find((f) => sh.fs.lookup(VFS.norm(f, base)));
      if (!mf) {
        if (goals.length && sh.fs.lookup(VFS.norm(goals[0] + '.c', base))) {
          // implicit rule
        } else {
          c.err(file ? `make: ${file}: No such file or directory\nmake: *** No rule to make target '${file}'.  Stop.\n` : `make: *** No targets specified and no makefile found.  Stop.\n`);
          return 2;
        }
      }
      const mk = mf ? parseMakefile(sh.readFile(VFS.norm(mf, base)), cmdVars) : parseMakefile('', cmdVars);
      Object.assign(mk.vars, cmdVars);
      const built = new Set();
      const mtime = (p) => { const n = sh.fs.lookup(VFS.norm(p, base)); return n ? n.mtime || 0 : -1; };
      const exists = (p) => !!sh.fs.lookup(VFS.norm(p, base));
      const findRule = (t) => {
        const explicit = mk.rules.filter((r) => r.targets.includes(t));
        if (explicit.length) {
          const withRecipe = explicit.find((r) => r.recipe.length) || explicit[0];
          return { rule: withRecipe, deps: [...new Set(explicit.flatMap((r) => r.deps))], stem: null };
        }
        for (const r of mk.rules) for (const pt of r.targets) {
          if (!pt.includes('%')) continue;
          const re = new RegExp('^' + pt.replace(/[.+^${}()|\\]/g, '\\$&').replace('%', '(.+)') + '$');
          const mm = re.exec(t);
          if (mm) {
            const deps = r.deps.map((d) => d.replace('%', mm[1]));
            if (deps.every((d) => exists(d))) return { rule: r, deps, stem: mm[1] };
          }
        }
        return null;
      };
      let ran = 0;
      let st = 0;
      const build = async (t, needed, top) => {
        if (built.has(t)) return 0;
        built.add(t);
        const f = findRule(t);
        if (!f) {
          if (exists(t)) return 0;
          if (/^[\w.-]+$/.test(t) && exists(t + '.c')) {
            // built-in implicit rule: foo from foo.c
            const cmd = `${mk.vars.CC} ${mk.vars.CFLAGS} ${mk.vars.LDFLAGS} ${t}.c -o ${t}`.replace(/\s+/g, ' ').replace('cc ', 'cc     ').replace(' -o', '   -o');
            c.out(cmd + '\n');
            if (!dry) { const r = await sub(c, `${mk.vars.CC} ${t}.c -o ${t}`, { stdin: '', stdout: c.out, stderr: c.err, tty: false }); if (r) { c.err(`make: *** [<builtin>: ${t}] Error ${r}\n`); return 2; } }
            ran++;
            return 0;
          }
          c.err(`make: *** No rule to make target '${t}'${needed ? `, needed by '${needed}'` : ''}.  Stop.\n`);
          return 2;
        }
        for (const d of f.deps) {
          const r = await build(d, t, false);
          if (r) return r;
        }
        const phony = mk.phony.has(t);
        const tm = mtime(t);
        const stale = phony || tm < 0 || f.deps.some((d) => mtime(d) >= tm);
        if (!stale) {
          if (top && !ran) c.out(`make: '${t}' is up to date.\n`);
          return 0;
        }
        if (!f.rule.recipe.length) {
          if (top && !ran) c.out(`make: Nothing to be done for '${t}'.\n`);
          return 0;
        }
        const auto = { t, d: f.deps, stem: f.stem };
        for (const rc of f.rule.recipe) {
          let cmd = mk.expand(rc.text, auto);
          let quiet = silent;
          let ignore = false;
          while (/^[@\-+]/.test(cmd)) { if (cmd[0] === '@') quiet = true; if (cmd[0] === '-') ignore = true; cmd = cmd.slice(1); }
          if (!quiet || dry) c.out(cmd + '\n');
          if (dry) continue;
          const r = await sub(c, cmd, { stdin: '', stdout: c.out, stderr: c.err, tty: false });
          ran++;
          if (r && !ignore) {
            c.err(`make: *** [${mf || 'Makefile'}:${rc.line}: ${t}] Error ${r}\n`);
            return 2;
          }
        }
        return 0;
      };
      const targets = goals.length ? goals : mk.first ? [mk.first] : [];
      if (!targets.length) {
        c.err('make: *** No targets.  Stop.\n');
        return 2;
      }
      for (const t of targets) {
        st = await build(t, null, true);
        if (st) break;
      }
      if (dir) c.out(`make: Leaving directory '${base}'\n`);
      return st;
    },
    { pkg: 'make' }
  );

  /* ========== gcc (heuristic C front) ========== */
  const LIBC = new Set('printf puts putchar scanf fprintf sprintf snprintf malloc calloc realloc free strlen strcpy strncpy strcmp strncmp strcat atoi atof exit fopen fclose fgets fputs fread fwrite getchar sleep usleep rand srand time abs memset memcpy getenv system perror main if while for switch return sizeof'.split(' '));
  const LIBM = new Set(['sqrt', 'pow', 'sin', 'cos', 'floor', 'ceil', 'fabs', 'log', 'exp']);
  let progSeq = 1;
  function evalExpr(expr, vars, funcs, ctx) {
    let e = expr.trim();
    e = e.replace(/\bargc\b/g, String(ctx.argc));
    e = e.replace(/\bargv\[(\d+)\]/g, (m, i) => JSON.stringify(ctx.argv[+i] === undefined ? '(null)' : ctx.argv[+i]));
    e = e.replace(/\b(\w+)\s*\(([^()]*)\)/g, (m, fn, a) => {
      if (funcs[fn]) {
        const argv = a.split(',').map((x) => evalExpr(x, vars, funcs, ctx));
        const f = funcs[fn];
        const v2 = {};
        f.params.forEach((p, i) => (v2[p] = argv[i]));
        const ret = /return\s+([^;]+);/.exec(f.body);
        return ret ? String(evalExpr(ret[1], v2, funcs, ctx)) : '0';
      }
      if (fn === 'strlen') return String(String(evalExpr(a, vars, funcs, ctx)).length);
      if (fn === 'sqrt') return String(Math.sqrt(evalExpr(a, vars, funcs, ctx)));
      if (fn === 'atoi') return String(parseInt(evalExpr(a, vars, funcs, ctx), 10) || 0);
      return m;
    });
    e = e.replace(/"(?:[^"\\]|\\.)*"|\b[A-Za-z_]\w*\b/g, (id) => (id[0] === '"' ? id : id in vars ? JSON.stringify(vars[id]) : id));
    try {
      // eslint-disable-next-line no-new-func
      const v = Function('"use strict";return (' + e + ')')();
      return typeof v === 'number' && /\//.test(expr) && !/\./.test(expr) && !/(float|double)/.test(ctx.kind || '') ? Math.trunc(v) : v;
    } catch (err) {
      if (globalThis.DEBUG_C) console.error('evalExpr', JSON.stringify(expr), '=>', e, err.message);
      return 0;
    }
  }
  function cFormat(fmt, args) {
    let i = 0;
    return fmt.replace(/%([-+ 0#]*)(\d+)?(?:\.(\d+))?(l|ll|h|z)?([dioxXucsfeEgGp%])/g, (m, fl, w, p, l, t) => {
      if (t === '%') return '%';
      const v = args[i++];
      let s;
      if (t === 'd' || t === 'i' || t === 'u') s = String(Math.trunc(Number(v)));
      else if (t === 's') s = String(v);
      else if (t === 'c') s = typeof v === 'number' ? String.fromCharCode(v) : String(v);
      else if (t === 'f') s = Number(v).toFixed(p === undefined ? 6 : +p);
      else if (t === 'x') s = Math.trunc(Number(v)).toString(16);
      else if (t === 'X') s = Math.trunc(Number(v)).toString(16).toUpperCase();
      else if (t === 'o') s = Math.trunc(Number(v)).toString(8);
      else if (t === 'e') s = Number(v).toExponential(p === undefined ? 6 : +p).replace(/e([+-])(\d)$/, 'e$10$2');
      else if (t === 'g') s = String(+Number(v).toPrecision(p === undefined ? 6 : +p));
      else s = '0x7ffd4c2a1b3c';
      if (p !== undefined && t === 's') s = s.slice(0, +p);
      if (w && s.length < +w) s = fl.includes('-') ? s.padEnd(+w) : fl.includes('0') && t !== 's' ? s.padStart(+w, '0') : s.padStart(+w);
      return s;
    });
  }
  const cUnescape = (s) => s.replace(/\\(n|t|r|0|\\|"|')/g, (m, e) => ({ n: '\n', t: '\t', r: '\r', 0: '\0', '\\': '\\', '"': '"', "'": "'" }[e]));
  function splitArgs(s) {
    const out = [];
    let d = 0;
    let q = false;
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '"' && s[i - 1] !== '\\') q = !q;
      if (!q && '(['.includes(ch)) d++;
      if (!q && ')]'.includes(ch)) d--;
      if (!q && d === 0 && ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
  }
  function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  }
  function collectFunctions(src) {
    const funcs = {};
    const re = /^[ \t]*(?:static\s+)?(?:unsigned\s+)?(?:int|void|char|float|double|long|short)\s*\*?\s*(\w+)\s*\(([^;{)]*)\)\s*\{/gm;
    let m;
    while ((m = re.exec(src))) {
      let d = 1;
      let j = re.lastIndex;
      while (j < src.length && d) { if (src[j] === '{') d++; else if (src[j] === '}') d--; j++; }
      funcs[m[1]] = { params: m[2].split(',').map((p) => (/(\w+)\s*(\[\])?\s*$/.exec(p.trim()) || [])[1]).filter(Boolean), body: src.slice(re.lastIndex, j - 1), sig: m[2] };
    }
    return funcs;
  }
  function runBody(body, vars, funcs, ctx, out) {
    const stmts = [];
    // tokenise statements and blocks at top level
    let i = 0;
    const s = body;
    const readBlock = (j) => { let d = 1; let k = j; while (k < s.length && d) { if (s[k] === '{') d++; else if (s[k] === '}') d--; k++; } return [s.slice(j, k - 1), k]; };
    while (i < s.length) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (i >= s.length) break;
      const rest = s.slice(i);
      let m;
      if ((m = /^for\s*\(\s*(?:int\s+)?(\w+)\s*=\s*([^;]+);\s*([^;]+);\s*([^)]+)\)\s*/.exec(rest))) {
        i += m[0].length;
        let blk;
        if (s[i] === '{') { const [b, k] = readBlock(i + 1); blk = b; i = k; } else { const e = s.indexOf(';', i); blk = s.slice(i, e + 1); i = e + 1; }
        vars[m[1]] = evalExpr(m[2], vars, funcs, ctx);
        let guard = 0;
        while (evalExpr(m[3], vars, funcs, ctx) && guard++ < 10000) {
          const r = runBody(blk, vars, funcs, ctx, out);
          if (r && r.ret !== undefined) return r;
          const inc = m[4].trim();
          if (/\+\+$/.test(inc)) vars[m[1]]++; else if (/--$/.test(inc)) vars[m[1]]--; else { const im = /(\w+)\s*([+\-*]?=)\s*(.+)/.exec(inc); if (im) vars[im[1]] = im[2] === '=' ? evalExpr(im[3], vars, funcs, ctx) : evalExpr(`${im[1]} ${im[2][0]} (${im[3]})`, vars, funcs, ctx); }
        }
        continue;
      }
      if ((m = /^while\s*\(([^)]*)\)\s*\{/.exec(rest))) {
        i += m[0].length;
        const [b, k] = readBlock(i);
        i = k;
        let guard = 0;
        while (evalExpr(m[1], vars, funcs, ctx) && guard++ < 10000) { const r = runBody(b, vars, funcs, ctx, out); if (r && r.ret !== undefined) return r; }
        continue;
      }
      if ((m = /^if\s*\(([^)]*)\)\s*\{/.exec(rest))) {
        i += m[0].length;
        const [b, k] = readBlock(i);
        i = k;
        let elseBlk = null;
        const em = /^\s*else\s*\{/.exec(s.slice(i));
        if (em) { const [b2, k2] = readBlock(i + em[0].length); elseBlk = b2; i = k2; }
        const cond = evalExpr(m[1], vars, funcs, ctx);
        const r = cond ? runBody(b, vars, funcs, ctx, out) : elseBlk ? runBody(elseBlk, vars, funcs, ctx, out) : null;
        if (r && r.ret !== undefined) return r;
        continue;
      }
      const e = s.indexOf(';', i);
      if (e < 0) break;
      const st = s.slice(i, e).trim();
      i = e + 1;
      if ((m = /^printf\s*\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,(.*))?\)$/s.exec(st))) {
        const args = m[2] ? splitArgs(m[2]).map((a) => evalExpr(a, vars, funcs, ctx)) : [];
        out.push(cFormat(cUnescape(m[1]), args));
      } else if ((m = /^puts\s*\(\s*"((?:[^"\\]|\\.)*)"\s*\)$/.exec(st))) out.push(cUnescape(m[1]) + '\n');
      else if ((m = /^putchar\s*\(\s*'(.)'\s*\)$/.exec(st))) out.push(m[1]);
      else if ((m = /^return\s*(.*)$/.exec(st))) return { ret: m[1] ? evalExpr(m[1], vars, funcs, ctx) : 0 };
      else if ((m = /^(?:const\s+)?(?:unsigned\s+)?(int|long|short|float|double|char)\s+(\*?)(\w+)(?:\[\d*\])?\s*(?:=\s*(.+))?$/s.exec(st))) {
        ctx.kind = m[1];
        vars[m[3]] = m[4] !== undefined ? (/^"/.test(m[4].trim()) ? cUnescape(m[4].trim().slice(1, -1)) : evalExpr(m[4], vars, funcs, ctx)) : 0;
        if (m[1] === 'int' || m[1] === 'long') vars[m[3]] = typeof vars[m[3]] === 'number' ? Math.trunc(vars[m[3]]) : vars[m[3]];
      } else if ((m = /^(\w+)\s*([+\-*\/]?=)\s*(.+)$/s.exec(st))) vars[m[1]] = m[2] === '=' ? evalExpr(m[3], vars, funcs, ctx) : evalExpr(`${m[1]} ${m[2][0]} (${m[3]})`, vars, funcs, ctx);
      else if ((m = /^(\w+)(\+\+|--)$/.exec(st))) vars[m[1]] += m[2] === '++' ? 1 : -1;
    }
    return null;
  }
  function compileUnit(c, file, text, opts) {
    const src = stripComments(text);
    const errs = [];
    const warns = [];
    const lines = text.split('\n');
    // balanced braces
    const open = (src.match(/\{/g) || []).length;
    const close = (src.match(/\}/g) || []).length;
    if (open > close) errs.push(`${file}:${lines.length}:1: error: expected declaration or statement at end of input`);
    if (close > open) errs.push(`${file}:${lines.length}:1: error: expected declaration specifiers or '...' before '}' token`);
    // missing semicolons
    let inFn = false;
    let depth = 0;
    const fnName = (/(\w+)\s*\([^;{)]*\)\s*\{/.exec(src) || [])[1] || 'main';
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].replace(/\/\/.*$/, '');
      const t = raw.trim();
      for (const ch of raw) { if (ch === '{') depth++; if (ch === '}') depth--; }
      if (depth > 0 && t && !/[;{},\\]$/.test(t) && !/^(#|\/\*|\*|else|\))/.test(t) && /^(printf|puts|return|int|char|float|double|long|\w+\s*=|\w+\+\+|\w+\()/.test(t) && !/^(if|for|while|switch)\b/.test(t)) {
        let nx = '';
        for (let j = i + 1; j < lines.length; j++) { if (lines[j].trim()) { nx = lines[j].trim(); break; } }
        const tok = (/^[A-Za-z_]\w*|^[^\s\w]/.exec(nx) || ['}'])[0];
        errs.push({ line: i + 1, col: raw.length + 1, msg: `error: expected ';' before '${tok}'` });
      }
    }
    // undeclared identifiers (printf without stdio)
    const usesPrintf = /\b(printf|puts|scanf|fopen|fgets)\s*\(/.test(src);
    if (usesPrintf && !/#\s*include\s*<stdio\.h>/.test(src)) {
      const idx = lines.findIndex((l) => /\b(printf|puts)\s*\(/.test(l));
      const fn = (/\b(printf|puts|scanf|fopen|fgets)\s*\(/.exec(src) || [])[1];
      warns.push({ line: idx + 1, col: Math.max(1, lines[idx].indexOf(fn) + 1), msg: `warning: implicit declaration of function '${fn}' [-Wimplicit-function-declaration]`, note: `note: include '<stdio.h>' or provide a declaration of '${fn}'` });
    }
    if (/\bstrlen|strcpy|strcmp\b/.test(src) && !/#\s*include\s*<string\.h>/.test(src)) {
      const fn = (/\b(strlen|strcpy|strcmp)\b/.exec(src) || [])[1];
      const idx = lines.findIndex((l) => l.includes(fn));
      warns.push({ line: idx + 1, col: lines[idx].indexOf(fn) + 1, msg: `warning: implicit declaration of function '${fn}' [-Wimplicit-function-declaration]`, note: `note: include '<string.h>' or provide a declaration of '${fn}'` });
    }
    if (opts.wall) {
      const m = /^\s*int\s+(\w+)\s*;/m.exec(src);
      if (m) { const idx = lines.findIndex((l) => new RegExp('\\bint\\s+' + m[1] + '\\s*;').test(l)); const used = new RegExp('\\b' + m[1] + '\\b', 'g'); if ((src.match(used) || []).length === 1) warns.push({ line: idx + 1, col: lines[idx].indexOf(m[1]) + 1, msg: `warning: unused variable '${m[1]}' [-Wunused-variable]` }); }
    }
    return { src, errs, warns, funcs: collectFunctions(src) };
  }
  def(
    'gcc',
    async (c, args) => {
      const sh = c.sh;
      const prog = c.name;
      let out = null;
      let compileOnly = false;
      let wall = false;
      let wantMath = false;
      const inputs = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-o') out = args[++i];
        else if (a === '-c') compileOnly = true;
        else if (a === '-Wall' || a === '-Wextra') wall = true;
        else if (a === '-lm') wantMath = true;
        else if (a === '--version') {
          c.out(`${prog === 'g++' || prog === 'c++' ? 'g++' : 'gcc'} (Ubuntu 13.3.0-6ubuntu2~24.04) 13.3.0\nCopyright (C) 2023 Free Software Foundation, Inc.\nThis is free software; see the source for copying conditions.  There is NO\nwarranty; not even for MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.\n\n`);
          return 0;
        }
        else if (a === '-v') return c.out('Using built-in specs.\ngcc version 13.3.0 (Ubuntu 13.3.0-6ubuntu2~24.04)\n');
        else if (a.startsWith('-')) continue;
        else inputs.push(a);
      }
      if (!inputs.length) {
        c.err(`${prog}: fatal error: no input files\ncompilation terminated.\n`);
        return 1;
      }
      const units = [];
      let failed = false;
      for (const f of inputs) {
        const abs = c.abs(f);
        const n = sh.fs.lookup(abs);
        if (!n) {
          c.err(`${prog}: error: ${f}: No such file or directory\n`);
          failed = true;
          continue;
        }
        if (/\.o$/.test(f)) { units.push({ file: f, obj: n.cobj }); continue; }
        if (!/\.(c|cpp|cc)$/.test(f)) { c.err(`${prog}: error: ${f}: file format not recognized; treating as linker script\n`); failed = true; continue; }
        const u = compileUnit(c, f, sh.readFile(abs), { wall });
        const fn = /(\w+)\s*\([^;{)]*\)\s*\{/.exec(u.src);
        const show = (it, kind) => {
          if (typeof it === 'string') { c.err(it + '\n'); return; }
          const ln = (sh.readFile(abs).split('\n')[it.line - 1] || '');
          c.err(`${f}:${it.line}:${it.col}: ${it.msg}\n ${String(it.line).padStart(3)} | ${ln}\n     | ${' '.repeat(Math.max(0, it.col - 1))}^\n`);
          if (it.note) c.err(`${f}:${it.line}:${it.col}: ${it.note}\n`);
        };
        if (u.errs.length || u.warns.length) c.err(`${f}: In function '${fn ? fn[1] : 'main'}':\n`);
        u.warns.forEach((w) => show(w));
        u.errs.forEach((e) => show(e));
        if (u.errs.length) failed = true;
        units.push({ file: f, u });
      }
      if (failed) return 1;
      if (compileOnly) {
        for (const un of units) {
          if (!un.u) continue;
          const oname = out && inputs.length === 1 ? out : un.file.replace(/\.[^.]+$/, '.o');
          sh.writeFile(c.abs(oname), '\x7fELF', false);
          const on = sh.fs.lookup(c.abs(oname));
          on.bin = true;
          on.size = 1600 + (sh.readFile(c.abs(un.file)).length % 900);
          on.cobj = { src: un.u.src, funcs: un.u.funcs };
        }
        return 0;
      }
      // link
      const allSrc = units.map((un) => (un.u ? un.u.src : un.obj ? un.obj.src : '')).join('\n');
      const funcs = Object.assign({}, ...units.map((un) => (un.u ? un.u.funcs : un.obj ? un.obj.funcs : {})));
      if (!funcs.main) {
        c.err("/usr/bin/ld: /usr/lib/gcc/x86_64-linux-gnu/13/../../../x86_64-linux-gnu/Scrt1.o: in function `_start':\n(.text+0x1b): undefined reference to `main'\ncollect2: error: ld returned 1 exit status\n");
        return 1;
      }
      const called = new Set();
      const re = /\b([A-Za-z_]\w*)\s*\(/g;
      let m;
      const bodyAll = Object.values(funcs).map((f) => f.body).join('\n');
      while ((m = re.exec(bodyAll))) called.add(m[1]);
      for (const fn of called) {
        if (funcs[fn] || LIBC.has(fn) || /^(if|for|while|switch|sizeof)$/.test(fn)) continue;
        if (LIBM.has(fn)) { if (!wantMath) { c.err(`/usr/bin/ld: /tmp/cc8Qx1Zf.o: in function \`main':\n${inputs[0]}:(.text+0x2f): undefined reference to \`${fn}'\ncollect2: error: ld returned 1 exit status\n`); return 1; } continue; }
        c.err(`/usr/bin/ld: /tmp/cc8Qx1Zf.o: in function \`main':\n${inputs[0]}:(.text+0x2f): undefined reference to \`${fn}'\ncollect2: error: ld returned 1 exit status\n`);
        return 1;
      }
      const target = out || 'a.out';
      const id = '__prog_' + progSeq++;
      LX.cmds[id] = { name: id, run: async (cc, a) => {
        const lines = [];
        const ctx = { argc: a.length + 1, argv: [target.startsWith('/') ? target : './' + target, ...a], kind: 'int' };
        const mainF = funcs.main;
        const r = runBody(mainF.body, {}, funcs, ctx, lines);
        cc.out(lines.join(''));
        return r && typeof r.ret === 'number' ? r.ret & 255 : 0;
      } };
      try {
        sh.writeFile(c.abs(target), '\x7fELF', false);
        const tn = sh.fs.lookup(c.abs(target));
        tn.exe = id;
        tn.bin = false;
        tn.mode = 0o755 & ~sh.umask | 0o111;
        tn.size = 15960 + allSrc.length;
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`/usr/bin/ld: cannot open output file ${target}: ${U.errTxt(e)}\ncollect2: error: ld returned 1 exit status\n`);
        return 1;
      }
      return 0;
    },
    { pkg: 'gcc' }
  );
  ['cc', 'g++', 'c++'].forEach((n) => def(n, (c, a) => LX.cmds.gcc.run(c, a), { pkg: 'gcc' }));
  def('ld', async (c) => c.err('ld: no input files\n'), { pkg: 'binutils' });

  /* ========== install(1) ========== */
  def('install', async (c, args) => {
    const sh = c.sh;
    let mode = null;
    let owner = null;
    let group = null;
    let dirs = false;
    const pos = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-m') mode = args[++i];
      else if (a === '-o') owner = args[++i];
      else if (a === '-g') group = args[++i];
      else if (a === '-d') dirs = true;
      else if (a === '-v' || a === '-D' || a === '-p' || a === '-s') continue;
      else if (a.startsWith('--mode=')) mode = a.slice(7);
      else if (!a.startsWith('-')) pos.push(a);
    }
    const q = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
    if (dirs) {
      for (const d of pos) {
        const r = await sub(c, `mkdir -p ${q(d)}${mode ? ` && chmod ${mode} ${q(d)}` : ''}`);
        if (r) return r;
      }
      return 0;
    }
    if (pos.length < 2) {
      c.err("install: missing destination file operand after '" + (pos[0] || '') + "'\nTry 'install --help' for more information.\n");
      return 1;
    }
    const dest = pos[pos.length - 1];
    for (const s of pos.slice(0, -1)) {
      const dn = sh.fs.lookup(c.abs(dest));
      const target = dn && dn.t === 'd' ? dest.replace(/\/$/, '') + '/' + VFS.base(s) : dest;
      let r = await sub(c, `cp ${q(s)} ${q(target)}`);
      if (r) return r;
      r = await sub(c, `chmod ${mode || '755'} ${q(target)}`);
      if (r) return r;
      if (owner || group) { r = await sub(c, `chown ${owner || ''}${group ? ':' + group : ''} ${q(target)}`); if (r) return r; }
    }
    return 0;
  });

  /* ========== dnf / yum / rpm ========== */
  const RPM = { vim: 'vim-enhanced', dnsutils: 'bind-utils', 'net-tools': 'net-tools', 'openssh-server': 'openssh-server', 'fortune-mod': 'fortune-mod' };
  const rpmName = (p) => RPM[p] || p;
  const fromRpmName = (n) => Object.keys(RPM).find((k) => RPM[k] === n) || n;
  const rver = (p) => (LX.PKGS[p] ? LX.PKGS[p].ver.replace(/^\d+:/, '').replace(/-[\w.+~]+$/, '') + '-1.el10' : '1.0-1.el10');
  const nvra = (p) => `${rpmName(p)}-${rver(p)}.x86_64`;
  const pkgInfo = (p) => LX.PKGS[p] || { ver: '1.0-1', desc: 'core system package', size: 100, bins: [] };
  const dnfHeader = (c) => c.out(`Last metadata expiration check: 0:23:04 ago on ${U.strftime('%a %d %b %Y %I:%M:%S %p %Z', new Date())}.\n`);
  const installPkgDirect = (sh, p) => {
    sh.installed.add(p);
    (pkgInfo(p).bins || []).forEach((b) => sh.addBinary(b));
    if (LX.PKGS[p] && LX.PKGS[p].service) sh.services[p] = { desc: LX.PKGS[p].service.desc, active: true, enabled: true, pid: 900 + Math.floor(Math.random() * 90), proc: LX.PKGS[p].service.proc, since: Date.now() };
    if (sh.onInstall && LX.PKGS[p]) sh.onInstall(p, LX.PKGS[p]);
  };
  const dnf = async (c, args) => {
    const sh = c.sh;
    const prog = c.name;
    const o = {};
    const rest = [];
    for (const a of args) { if (/^-[a-zA-Z]+$/.test(a)) for (const ch of a.slice(1)) o[ch] = true; else if (a.startsWith('--')) o[a.slice(2)] = true; else rest.push(a); }
    const sub0 = rest[0];
    const names = rest.slice(1);
    if (o.version) return c.out(prog === 'yum' ? '4.20.0\n' : '4.20.0\n  Installed: dnf-0:4.20.0-1.el10.noarch at Mon 20 Oct 2026 08:00:00 AM IST\n'), 0;
    if (!sub0) { c.err('usage: dnf [options] COMMAND\n\nList of Main Commands:\n\nautoremove  check-update  clean  group  history  info  install  list  makecache  provides  reinstall  remove  repolist  search  update  upgrade\n'); return 1; }
    const root = sh.eu() === 'root';
    const needRoot = () => { if (!root) { c.err('Error: This command has to be run with superuser privileges (under the root user on most systems).\n'); return true; } return false; };
    const online = sh.netUp ? sh.netUp() : true;
    const repoFail = () => { c.err('Errors during downloading metadata for repository \'baseos\':\n  - Curl error (6): Could not resolve host for https://mirror.stream.centos.org/10-stream/BaseOS/x86_64/os/repodata/repomd.xml [Could not resolve host: mirror.stream.centos.org]\nError: Failed to download metadata for repo \'baseos\': Cannot download repomd.xml: Cannot download repodata/repomd.xml: All mirrors were tried\n'); return 1; };
    switch (sub0) {
      case 'install': case 'reinstall': case 'remove': case 'erase': case 'autoremove': {
        if (needRoot()) return 1;
        if (sub0 === 'autoremove') { dnfHeader(c); c.out('Dependencies resolved.\nNothing to do.\nComplete!\n'); return 0; }
        if (!names.length) { c.err('Error: Need a list of packages\n'); return 1; }
        const isRemove = sub0 === 'remove' || sub0 === 'erase';
        if (!isRemove && !online) return repoFail();
        const real = names.map(fromRpmName);
        const todo = [];
        for (let i = 0; i < names.length; i++) {
          const p = real[i];
          if (isRemove) {
            if (!sh.installed.has(p) || !LX.PKGS[p]) { c.err(`No match for argument: ${names[i]}\n`); continue; }
            todo.push(p);
          } else {
            if (!LX.PKGS[p] && !LX.DEFAULT_PKGS.includes(p)) { dnfHeader(c); c.err(`No match for argument: ${names[i]}\nError: Unable to find a match: ${names[i]}\n`); return 1; }
            if (sh.installed.has(p) && sub0 === 'install') { dnfHeader(c); c.out(`Package ${nvra(p)} is already installed.\nDependencies resolved.\nNothing to do.\nComplete!\n`); continue; }
            todo.push(p);
          }
        }
        if (!todo.length) { if (isRemove) { c.err('Error: No packages marked for removal.\n'); return 1; } return 0; }
        dnfHeader(c);
        const kb = todo.reduce((s, p) => s + pkgInfo(p).size, 0);
        const verb = isRemove ? 'Removing' : sub0 === 'reinstall' ? 'Reinstalling' : 'Installing';
        c.out(`Dependencies resolved.\n${'='.repeat(80)}\n Package${' '.repeat(18)}Architecture   Version               Repository         Size\n${'='.repeat(80)}\n${verb}:\n`);
        todo.forEach((p) => c.out(` ${rpmName(p).padEnd(25)} x86_64         ${rver(p).padEnd(21)} appstream     ${String(pkgInfo(p).size).padStart(6)} k\n`));
        c.out(`\nTransaction Summary\n${'='.repeat(80)}\n${isRemove ? 'Remove' : 'Install'}  ${todo.length} Package${todo.length > 1 ? 's' : ''}\n\n${isRemove ? '' : `Total download size: ${kb} k\n`}${isRemove ? 'Freed' : 'Installed'} size: ${kb * 3} k\n`);
        if (!o.y) {
          const a = await U.ask(c, 'Is this ok [y/N]: ');
          if (!/^y/i.test(a)) { c.out('Operation aborted.\n'); return 1; }
        }
        if (!isRemove) c.out('Downloading Packages:\n' + todo.map((p) => `${nvra(p)}.rpm`.padEnd(48) + `1.2 MB/s | ${String(pkgInfo(p).size).padStart(3)} kB     00:00\n`).join('') + `${'-'.repeat(80)}\nTotal                                           170 kB/s | ${kb} kB     00:00\n`);
        c.out('Running transaction check\nTransaction check succeeded.\nRunning transaction test\nTransaction test succeeded.\nRunning transaction\n');
        todo.forEach((p, i) => {
          const pad = (l) => l.padEnd(76) + `${i + 1}/${todo.length}\n`;
          if (i === 0) c.out('  Preparing        :'.padEnd(76) + `1/1\n`);
          c.out(pad(`  ${isRemove ? 'Erasing         ' : 'Installing       '}: ${nvra(p)}`) + pad(`  Running scriptlet: ${nvra(p)}`));
          if (isRemove) { sh.installed.delete(p); (pkgInfo(p).bins || []).forEach((b) => sh.removeBinary(b)); if (sh.onRemove) sh.onRemove(p); if (sh.services[p]) delete sh.services[p]; } else installPkgDirect(sh, p);
        });
        c.out(`\n${isRemove ? 'Removed' : 'Installed'}:\n${todo.map((p) => '  ' + nvra(p)).join('\n')}\n\nComplete!\n`);
        return 0;
      }
      case 'update': case 'upgrade': case 'check-update': case 'check-upgrade': {
        if (sub0.startsWith('check')) { if (!online) return repoFail(); dnfHeader(c); if (sh.pendingUpdates && sh.pendingUpdates.length) { sh.pendingUpdates.forEach((u) => c.out(`${u.name.padEnd(32)}${u.to.padEnd(24)}baseos\n`)); return 100; } return 0; }
        if (needRoot()) return 1;
        if (!online) return repoFail();
        dnfHeader(c);
        if (!sh.pendingUpdates || !sh.pendingUpdates.length) { c.out('Dependencies resolved.\nNothing to do.\nComplete!\n'); return 0; }
        c.out(`Dependencies resolved.\n${'='.repeat(80)}\nUpgrading:\n${sh.pendingUpdates.map((u) => ` ${u.name.padEnd(24)} x86_64   ${u.to.padEnd(20)} baseos      1.2 M`).join('\n')}\n\nTransaction Summary\n${'='.repeat(80)}\nUpgrade  ${sh.pendingUpdates.length} Packages\n\n`);
        if (!o.y) { const a = await U.ask(c, 'Is this ok [y/N]: '); if (!/^y/i.test(a)) { c.out('Operation aborted.\n'); return 1; } }
        c.out('Running transaction\n' + sh.pendingUpdates.map((u, i) => `  Upgrading        : ${u.name}-${u.to}.x86_64    ${i + 1}/${sh.pendingUpdates.length}`).join('\n') + '\n\nUpgraded:\n' + sh.pendingUpdates.map((u) => `  ${u.name}-${u.to}.x86_64`).join('\n') + '\n\nComplete!\n');
        sh.pendingUpdates = [];
        return 0;
      }
      case 'search': {
        if (!online) return repoFail();
        dnfHeader(c);
        const q = (names[0] || '').toLowerCase();
        const hits = Object.entries(LX.PKGS).filter(([k, p]) => k.includes(q) || p.desc.toLowerCase().includes(q));
        if (!hits.length) { c.err(`No matches found.\n`); return 1; }
        c.out(`${'='.repeat(20)} Name & Summary Matched: ${q} ${'='.repeat(20)}\n`);
        hits.forEach(([k, p]) => c.out(`${(rpmName(k) + '.x86_64').padEnd(30)} : ${p.desc}\n`));
        return 0;
      }
      case 'info': {
        const p = fromRpmName(names[0] || '');
        if (!LX.PKGS[p] && !LX.DEFAULT_PKGS.includes(p)) { c.err(`Error: No matching Packages to list\n`); return 1; }
        dnfHeader(c);
        const i = pkgInfo(p);
        c.out(`${sh.installed.has(p) ? 'Installed' : 'Available'} Packages\nName         : ${rpmName(p)}\nVersion      : ${rver(p).split('-')[0]}\nRelease      : ${rver(p).split('-')[1]}\nArchitecture : x86_64\nSize         : ${i.size * 3} k\nSource       : ${rpmName(p)}-${rver(p)}.src.rpm\nRepository   : ${sh.installed.has(p) ? '@System' : 'appstream'}\nSummary      : ${i.desc}\nURL          : https://example.org/${p}\nLicense      : GPL-2.0-or-later\nDescription  : ${i.desc}\n`);
        return 0;
      }
      case 'list': {
        dnfHeader(c);
        const which = names[0] || 'all';
        const inst = [...sh.installed].filter((p) => LX.PKGS[p] || LX.DEFAULT_PKGS.includes(p));
        const avail = Object.keys(LX.PKGS).filter((p) => !sh.installed.has(p));
        if (which === 'installed' || which === 'all') { c.out('Installed Packages\n'); inst.sort().forEach((p) => c.out(`${(rpmName(p) + '.x86_64').padEnd(36)}${rver(p).padEnd(26)}@System\n`)); }
        if (which === 'available' || which === 'all') { c.out('Available Packages\n'); avail.sort().forEach((p) => c.out(`${(rpmName(p) + '.x86_64').padEnd(36)}${rver(p).padEnd(26)}appstream\n`)); }
        return 0;
      }
      case 'repolist': case 'repoinfo': {
        if (!online && false) return repoFail();
        c.out('repo id                      repo name\nappstream                    CentOS Stream 10 - AppStream\nbaseos                       CentOS Stream 10 - BaseOS\nextras-common                CentOS Stream 10 - Extras packages\n');
        return 0;
      }
      case 'provides': case 'whatprovides': {
        const f = names[0] || '';
        const hit = Object.entries(LX.PKGS).find(([k, p]) => (p.bins || []).some((b) => f.endsWith('/' + b) || f === b));
        if (!hit) { c.err('Error: No Matches found\n'); return 1; }
        dnfHeader(c);
        c.out(`${nvra(hit[0])} : ${hit[1].desc}\nRepo        : appstream\nMatched from:\nFilename    : /usr/bin/${hit[1].bins[0]}\n`);
        return 0;
      }
      case 'history': {
        c.out('ID     | Command line                                       | Date and time    | Action(s)      | Altered\n' + '-'.repeat(95) + '\n     3 | install -y tree                                    | 2026-10-26 22:40 | Install        |    1   \n     2 | update -y                                          | 2026-10-24 09:10 | I, U           |   14 EE\n     1 |                                                    | 2026-10-20 08:00 | Install        |  420 EE\n');
        return 0;
      }
      case 'clean': c.out('18 files removed\n'); return 0;
      case 'makecache': if (!online) return repoFail(); c.out('Metadata cache created.\n'); return 0;
      case 'group': case 'groupinstall': c.out('Available Environment Groups:\n   Server with GUI\n   Server\n   Minimal Install\nInstalled Environment Groups:\n   Minimal Install\nAvailable Groups:\n   Development Tools\n   Network Servers\n   System Tools\n'); return 0;
      case 'config-manager': case 'module': c.out('(not needed for this exercise)\n'); return 0;
    }
    c.err(`No such command: ${sub0}. Please use /usr/bin/${prog} --help\nIt could also be a DNF plugin command, try: "dnf install 'dnf-command(${sub0})'"\n`);
    return 1;
  };
  def('dnf', dnf);
  def('yum', dnf);
  def('rpm', async (c, args) => {
    const sh = c.sh;
    const o = args.filter((a) => a.startsWith('-')).join('');
    const rest = args.filter((a) => !a.startsWith('-'));
    const inst = [...sh.installed].filter((p) => (LX.PKGS[p] || LX.DEFAULT_PKGS.includes(p)) && !['apt', 'dpkg', 'dnsutils-lite', 'make', 'gcc'].includes(p));
    if (/a/.test(o) && /q/.test(o)) { inst.sort().forEach((p) => c.out(nvra(p) + '\n')); return 0; }
    if (/^-?-?V$|--version/.test(args[0] || '')) return c.out('RPM version 4.19.1.1\n'), 0;
    if (/q/.test(o) && /f/.test(o)) {
      const f = rest[0] || '';
      const hit = Object.entries(LX.PKGS).find(([k, p]) => sh.installed.has(k) && (p.bins || []).some((b) => f.endsWith('/' + b)));
      if (!hit) { c.out(`file ${f} is not owned by any package\n`); return 1; }
      c.out(nvra(hit[0]) + '\n');
      return 0;
    }
    if (/q/.test(o)) {
      let st = 0;
      for (const n of rest) {
        const p = fromRpmName(n);
        if (!sh.installed.has(p) || !(LX.PKGS[p] || LX.DEFAULT_PKGS.includes(p))) { c.out(`package ${n} is not installed\n`); st = 1; continue; }
        if (/i/.test(o)) { const i = pkgInfo(p); c.out(`Name        : ${rpmName(p)}\nVersion     : ${rver(p).split('-')[0]}\nRelease     : ${rver(p).split('-')[1]}\nArchitecture: x86_64\nInstall Date: ${U.strftime('%a %d %b %Y %I:%M:%S %p %Z', new Date())}\nSize        : ${i.size * 3000}\nLicense     : GPLv2+\nSignature   : RSA/SHA256, Mon 14 Sep 2026, Key ID 05b555b38483c65d\nSummary     : ${i.desc}\nDescription :\n${i.desc}\n`); }
        else if (/l/.test(o)) { (pkgInfo(p).bins || []).forEach((b) => c.out(`/usr/bin/${b}\n`)); c.out(`/usr/share/doc/${rpmName(p)}/README\n`); }
        else c.out(nvra(p) + '\n');
      }
      return st;
    }
    if (/[iUF]/.test(o)) {
      for (const f of rest) { if (!sh.fs.lookup(c.abs(f))) { c.err(`error: open of ${f} failed: No such file or directory\n`); return 1; } c.err(`error: ${f}: not an rpm package (or package manifest)\n`); return 1; }
      c.err('rpm: no arguments given for install\n'); return 1;
    }
    if (/e/.test(o)) {
      if (sh.eu() !== 'root') { c.err('error: can\'t create transaction lock on /var/lib/rpm/.rpm.lock (Permission denied)\n'); return 1; }
      for (const n of rest) { const p = fromRpmName(n); if (!sh.installed.has(p)) { c.err(`error: package ${n} is not installed\n`); return 1; } sh.installed.delete(p); (pkgInfo(p).bins || []).forEach((b) => sh.removeBinary(b)); }
      return 0;
    }
    c.err('Usage: rpm [OPTION...]\n');
    return 1;
  });

  /* ========== dpkg extras ========== */
  const origDpkg = LX.cmds.dpkg && LX.cmds.dpkg.run;
  def('dpkg', async (c, args) => {
    const sh = c.sh;
    const p = args.find((a) => !a.startsWith('-') && a !== args[0]) || (args[1] || '');
    if (args[0] === '-L') {
      const pk = LX.PKGS[p] || (LX.DEFAULT_PKGS.includes(p) ? { bins: [p] } : null);
      if (!pk || !sh.installed.has(p)) { c.err(`dpkg-query: package '${p}' is not installed\nUse dpkg --info (= dpkg-deb --info) to examine archive files.\n`); return 1; }
      c.out('/.\n/usr\n/usr/bin\n' + (pk.bins || []).map((b) => `/usr/bin/${b}\n`).join('') + `/usr/share\n/usr/share/doc\n/usr/share/doc/${p}\n`);
      return 0;
    }
    if (args[0] === '-S') {
      const f = args[1] || '';
      const hit = Object.entries(LX.PKGS).find(([k, q]) => sh.installed.has(k) && (q.bins || []).some((b) => f.endsWith('/' + b)));
      if (hit) return c.out(`${hit[0]}: ${f}\n`), 0;
      const core = { ls: 'coreutils', cat: 'coreutils', cp: 'coreutils', grep: 'grep', sed: 'sed', bash: 'bash', sudo: 'sudo', tar: 'tar', find: 'findutils' }[VFS.base(f)];
      if (core) return c.out(`${core}: ${f}\n`), 0;
      c.err(`dpkg-query: no path found matching pattern ${f}\n`);
      return 1;
    }
    if (args[0] === '-s') {
      const pk = LX.PKGS[p];
      if (!sh.installed.has(p)) { c.err(`dpkg-query: package '${p}' is not installed and no information is available\nUse dpkg --info (= dpkg-deb --info) to examine archive files.\n`); return 1; }
      c.out(`Package: ${p}\nStatus: install ok installed\nPriority: optional\nSection: utils\nInstalled-Size: ${pk ? pk.size * 3 : 100}\nMaintainer: Ubuntu Developers <ubuntu-devel-discuss@lists.ubuntu.com>\nArchitecture: amd64\nVersion: ${LX.pkgVer ? LX.pkgVer(sh, p) : '1.0-1'}\nDescription: ${pk ? pk.desc : 'core package'}\n`);
      return 0;
    }
    if (args[0] === '--get-selections') { [...sh.installed].sort().forEach((k) => c.out(`${k.padEnd(40)}install\n`)); return 0; }
    if (args[0] === '-i' || args[0] === '--install') {
      if (sh.eu() !== 'root') { c.err('dpkg: error: requested operation requires superuser privilege\n'); return 2; }
      const f = args[1];
      if (!f || !sh.fs.lookup(c.abs(f))) { c.err(`dpkg: error: cannot access archive '${f || ''}': No such file or directory\n`); return 2; }
      c.err(`dpkg: error: ${f} is not a Debian format archive\n`);
      return 2;
    }
    if (args[0] === '-l' && args[1]) {
      const q = args[1];
      if (!sh.installed.has(q)) { c.err(`dpkg-query: no packages found matching ${q}\n`); return 1; }
      c.out(`Desired=Unknown/Install/Remove/Purge/Hold\n| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend\n|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)\n||/ Name           Version            Architecture Description\n+++-==============-==================-============-=================================\nii  ${q.padEnd(14)} ${(LX.pkgVer ? LX.pkgVer(sh, q) : '1.0-1').padEnd(18)} amd64        ${(LX.PKGS[q] || { desc: 'core package' }).desc}\n`);
      return 0;
    }
    return origDpkg ? origDpkg(c, args) : 2;
  });
  def('dpkg-query', (c, a) => LX.cmds.dpkg.run(c, a.map((x) => (x === '-W' ? '-l' : x))));

  /* ========== snap / flatpak (tiny) ========== */
  def('snap', async (c, args) => {
    const sh = c.sh;
    sh.snaps = sh.snaps || new Map([['core22', '1612'], ['snapd', '21759'], ['lxd', '29631']]);
    const a = args[0];
    if (a === 'list') {
      c.out('Name    Version   Rev    Tracking       Publisher   Notes\n');
      for (const [n, r] of sh.snaps) c.out(`${n.padEnd(7)} ${'1.0'.padEnd(9)} ${r.padEnd(6)} latest/stable  canonical✓  ${n === 'core22' || n === 'snapd' ? 'base' : '-'}\n`);
      return 0;
    }
    if (a === 'install' || a === 'remove') {
      if (sh.eu() !== 'root') { c.err(`error: access denied (try with sudo)\n`); return 1; }
      const n = args.slice(1).find((x) => !x.startsWith('-'));
      if (a === 'install') {
        if (!sh.netUp()) { c.err(`error: cannot install "${n}": cannot communicate with server: Post "https://api.snapcraft.io/v2/snaps/refresh": dial tcp: lookup api.snapcraft.io: Temporary failure in name resolution\n`); return 1; }
        if (!['hello-world', 'htop', 'btop', 'code', 'vlc', 'docker', 'kubectl', 'node'].includes(n)) { c.err(`error: snap "${n}" not found\n`); return 1; }
        c.out(`${n} 1.0 from Canonical✓ installed\n`);
        sh.snaps.set(n, '29');
      } else { if (!sh.snaps.has(n)) { c.err(`error: snap "${n}" is not installed\n`); return 1; } sh.snaps.delete(n); c.out(`${n} removed\n`); }
      return 0;
    }
    if (a === 'find') { c.out('Name         Version  Publisher   Notes  Summary\nhello-world  6.4      canonical✓  -      The \'hello-world\' of snaps\nhtop         3.3.0    maxiberta   -      Interactive processes viewer\n'); return 0; }
    if (a === 'version') return c.out('snap    2.63\nsnapd   2.63\nseries  16\nubuntu  24.04\nkernel  6.8.0-45-generic\n'), 0;
    c.out('Usage: snap <command> [<options>...]\n\nCommands: install, list, remove, find, refresh, info, version\n');
    return 0;
  });
  def('flatpak', async (c, args) => {
    const sh = c.sh;
    sh.flat = sh.flat || { remotes: [], apps: [] };
    const a = args[0];
    if (a === 'remote-add') {
      if (sh.eu() !== 'root' && !args.includes('--user')) { c.err('error: Flatpak system operation Configure not allowed for user\n'); return 1; }
      const name = args.filter((x) => !x.startsWith('-'))[1];
      if (!sh.flat.remotes.includes(name)) sh.flat.remotes.push(name);
      return 0;
    }
    if (a === 'remotes') { sh.flat.remotes.forEach((r) => c.out(`${r.padEnd(10)} system\n`)); return 0; }
    if (a === 'install') {
      const pos = args.slice(1).filter((x) => !x.startsWith('-'));
      if (!sh.flat.remotes.length) { c.err('error: No remote refs found for \'' + pos.join(' ') + '\'\n'); return 1; }
      const app = pos[pos.length - 1];
      c.out(`Looking for matches…\nInstalling ${app}…\nInstallation complete.\n`);
      sh.flat.apps.push(app);
      return 0;
    }
    if (a === 'list') { c.out('Name  Application ID  Version  Branch  Installation\n'); sh.flat.apps.forEach((x) => c.out(`${x.split('.').pop().padEnd(5)} ${x.padEnd(15)} 1.0      stable  system\n`)); return 0; }
    if (a === 'uninstall') { sh.flat.apps = sh.flat.apps.filter((x) => x !== args[1]); c.out('Uninstall complete.\n'); return 0; }
    if (a === 'run') { const x = args[1]; if (!sh.flat.apps.includes(x)) { c.err(`error: app/${x}/x86_64/master not installed\n`); return 1; } c.out(`(${x} started — graphical apps need a desktop, which this sandbox does not have)\n`); return 0; }
    c.out('Usage: flatpak [OPTION…] COMMAND\n\nBuiltin Commands:\n install, uninstall, list, remote-add, remotes, run\n');
    return 0;
  }, { pkg: 'flatpak' });

  Object.assign(LX.PKGS, {
    make: { ver: '4.3-4.1build2', desc: 'utility for directing compilation', size: 180, bins: [] },
    gcc: { ver: '4:13.2.0-7ubuntu1', desc: 'GNU C compiler', size: 5000, bins: [] },
    'build-essential': { ver: '12.10ubuntu1', desc: 'Informational list of build-essential packages', size: 7, bins: [] },
    binutils: { ver: '2.42-4ubuntu2', desc: 'GNU assembler, linker and binary utilities', size: 3500, bins: [] },
    flatpak: { ver: '1.14.6-1', desc: 'Application deployment framework for desktop apps', size: 1400, bins: ['flatpak'] },
    rsync: { ver: '3.2.7-1ubuntu1', desc: 'fast, versatile, remote (and local) file-copying tool', size: 439, bins: [] },
  });
  const origInstalled = LX.DEFAULT_PKGS;
  for (const k of ['rsync', 'bzip2', 'xz-utils', 'dpkg']) if (!origInstalled.includes(k)) origInstalled.push(k);
  const gi = origInstalled.indexOf('git');
  if (gi >= 0) origInstalled.splice(gi, 1);
  // build-essential pulls in gcc + make
  const P = LX.Shell.prototype;
  const prevInstall = P.onInstall;
  LX.initHooks.push((sh) => {
    const prior = sh.onInstall;
    sh.onInstall = (p, meta) => {
      if (p === 'build-essential') ['gcc', 'make', 'binutils'].forEach((x) => { sh.installed.add(x); ['gcc', 'cc', 'g++', 'c++', 'make', 'ld'].forEach((b) => sh.addBinary(b)); });
      if (p === 'gcc') ['gcc', 'cc', 'g++', 'c++', 'ld'].forEach((b) => sh.addBinary(b));
      if (p === 'make') sh.addBinary('make');
      if (p === 'git') sh.addBinary('git');
      if (prior) prior.call(sh, p, meta);
    };
  });
})();
