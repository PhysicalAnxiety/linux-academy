/* Linux Academy: text-processing commands */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS } = LX;
  const U = LX.U;

  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  const POSIX = { alpha: 'a-zA-Z', digit: '0-9', alnum: 'a-zA-Z0-9', upper: 'A-Z', lower: 'a-z', space: '\\s', punct: '!-\\/:-@\\[-`{-~', blank: ' \\t', xdigit: '0-9a-fA-F' };

  /** POSIX BRE/ERE -> JS regex source */
  U.convertRegex = function (p, ere) {
    let out = '';
    for (let i = 0; i < p.length; i++) {
      const ch = p[i];
      if (ch === '\\') {
        const n = p[++i];
        if (n === undefined) out += '\\\\';
        else if ('(){}|+?'.includes(n)) out += ere ? '\\' + n : n;
        else if (n === '<' || n === '>') out += '\\b';
        else if ('wWsSbBd'.includes(n) || /[1-9]/.test(n)) out += '\\' + n;
        else out += escRe(n);
      } else if (ch === '[') {
        let j = i + 1;
        if (p[j] === '^') j++;
        if (p[j] === ']') j++;
        while (j < p.length && p[j] !== ']') {
          if (p[j] === '[' && p[j + 1] === ':') {
            const k = p.indexOf(':]', j);
            if (k > 0) j = k + 1;
          }
          j++;
        }
        if (j >= p.length) {
          out += '\\[';
          continue;
        }
        let cls = p.slice(i + 1, j).replace(/\[:(\w+):\]/g, (m, nm) => POSIX[nm] || '');
        let neg = '';
        if (cls[0] === '^') {
          neg = '^';
          cls = cls.slice(1);
        }
        out += '[' + neg + cls.replace(/\\(?![sdw])/g, '\\\\').replace(/\]/g, '\\]') + ']';
        i = j;
      } else if (!ere && '(){}|+?'.includes(ch)) out += '\\' + ch;
      else out += ch;
    }
    return out;
  };
  U.makeRegex = function (pat, mode, ci, word, flags) {
    let src = mode === 'F' ? escRe(pat) : U.convertRegex(pat, mode === 'E');
    if (word) src = '(?<![\\w])(?:' + src + ')(?![\\w])';
    return new RegExp(src, (ci ? 'i' : '') + (flags || ''));
  };

  /* ---------- echo / printf ---------- */
  function unescape(s, stop) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== '\\') {
        out += s[i];
        continue;
      }
      const n = s[++i];
      if (n === 'n') out += '\n';
      else if (n === 't') out += '\t';
      else if (n === 'r') out += '\r';
      else if (n === '\\') out += '\\';
      else if (n === 'a') out += '\x07';
      else if (n === 'e' || n === 'E') out += '\x1b';
      else if (n === 'c') {
        stop.stopped = true;
        return out;
      } else if (n === '0' || n === 'x') {
        const m = (n === 'x' ? /^[0-9a-fA-F]{1,2}/ : /^[0-7]{0,3}/).exec(s.slice(i + 1));
        out += String.fromCharCode(parseInt(m && m[0] ? m[0] : '0', n === 'x' ? 16 : 8));
        i += m ? m[0].length : 0;
      } else out += '\\' + (n === undefined ? '' : n);
    }
    return out;
  }
  def(
    'echo',
    async (c, args) => {
      let nl = true;
      let esc = false;
      let i = 0;
      for (; i < args.length; i++) {
        const a = args[i];
        if (/^-[neE]+$/.test(a)) {
          if (a.includes('n')) nl = false;
          if (a.includes('e')) esc = true;
          if (a.includes('E')) esc = false;
        } else break;
      }
      let text = args.slice(i).join(' ');
      if (esc) {
        const st = {};
        text = unescape(text, st);
        if (st.stopped) nl = false;
      }
      c.out(text + (nl ? '\n' : ''));
    },
    { builtin: true, bin: true }
  );
  def(
    'printf',
    async (c, args) => {
      if (!args.length) {
        c.err('printf: usage: printf [-v var] format [arguments]\n');
        return 2;
      }
      const fmt = args[0];
      const vals = args.slice(1);
      let vi = 0;
      let out = '';
      const once = () => {
        let consumed = false;
        const st = {};
        const f = unescape(fmt, st);
        const re = /%([-+ 0#]*)(\d+)?(?:\.(\d+))?([sdiufxXocb%])/g;
        let last = 0;
        let m;
        let piece = '';
        while ((m = re.exec(f))) {
          piece += f.slice(last, m.index);
          last = re.lastIndex;
          const [, fl, w, pr, ty] = m;
          if (ty === '%') {
            piece += '%';
            continue;
          }
          const v = vi < vals.length ? vals[vi++] : undefined;
          consumed = true;
          let s;
          if (ty === 's' || ty === 'b') s = v === undefined ? '' : String(v);
          else if (ty === 'c') s = v === undefined ? '' : String(v)[0];
          else if (ty === 'd' || ty === 'i' || ty === 'u') s = String(parseInt(v, 10) || 0);
          else if (ty === 'f') s = (parseFloat(v) || 0).toFixed(pr === undefined ? 6 : +pr);
          else if (ty === 'x') s = (parseInt(v, 10) || 0).toString(16);
          else if (ty === 'X') s = (parseInt(v, 10) || 0).toString(16).toUpperCase();
          else s = (parseInt(v, 10) || 0).toString(8);
          if (pr !== undefined && ty === 's') s = s.slice(0, +pr);
          if (w) s = fl.includes('-') ? s.padEnd(+w) : fl.includes('0') && ty !== 's' ? s.padStart(+w, '0') : s.padStart(+w);
          piece += s;
        }
        piece += f.slice(last);
        out += piece;
        return consumed;
      };
      const used = once();
      while (used && vi < vals.length) once();
      c.out(out);
    },
    { builtin: true, bin: true }
  );

  /* ---------- grep ---------- */
  def('grep', async (c, args) => {
    const g = U.getopts('grep', c, args, 'ivnclLrRwEFGoqhHsx', 'eAmBCf', { 'ignore-case': 'i', 'invert-match': 'v', 'line-number': 'n', count: 'c', recursive: 'r', 'word-regexp': 'w', 'extended-regexp': 'E', 'fixed-strings': 'F', 'only-matching': 'o', quiet: 'q', regexp: 'e', 'files-with-matches': 'l', 'after-context': 'A', 'before-context': 'B', context: 'C', color: '#', 'max-count': 'm', 'no-filename': 'h', 'with-filename': 'H', 'files-without-match': 'L' });
    if (!g) return 2;
    const { o } = g;
    let rest = g.rest;
    const sh = c.sh;
    // -e may appear multiple times: re-scan
    const pats = [];
    for (let i = 0; i < args.length; i++) if (args[i] === '-e' && args[i + 1] !== undefined) pats.push(args[i + 1]);
    if (!pats.length) {
      if (o.e !== undefined) pats.push(o.e);
      else {
        if (!rest.length) {
          c.err("Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n");
          return 2;
        }
        pats.push(rest[0]);
        rest = rest.slice(1);
      }
    } else rest = rest.filter((r) => !pats.includes(r) || false);
    const mode = o.F ? 'F' : o.E ? 'E' : 'G';
    let re;
    try {
      re = new RegExp(pats.map((p) => '(?:' + U.makeRegex(p, mode, o.i, o.w).source + ')').join('|'), (o.i ? 'i' : '') + 'g');
      if (o.x) re = new RegExp('^(?:' + re.source + ')$', o.i ? 'i' : 'g');
    } catch (e) {
      c.err('grep: Unmatched ( or \\(\n');
      return 2;
    }
    const color = c.tty && !args.includes('--color=never') && !o.q;
    const after = +(o.A || o.C || 0);
    const before = +(o.B || o.C || 0);
    const maxc = o.m ? +o.m : Infinity;
    const recursive = o.r || o.R;
    let files = rest;
    if (!files.length && recursive) files = ['.'];
    const expanded = [];
    let st = 1;
    let err = 0;
    for (const f of files) {
      const abs = c.abs(f);
      const n = sh.fs.lookup(abs);
      if (n && n.t === 'd') {
        if (recursive) sh.fs.walk(abs, (p, nd) => nd.t === 'f' && expanded.push(f === '.' ? p.replace(abs + '/', '').replace(/^/, '') : f.replace(/\/$/, '') + p.slice(abs.length)));
        else {
          if (!o.s) c.err(`grep: ${f}: Is a directory\n`);
          err = 2;
        }
      } else expanded.push(f);
    }
    if (recursive && files.length === 1 && files[0] === '.') {
      for (let i = 0; i < expanded.length; i++) expanded[i] = expanded[i];
    }
    const multi = (expanded.length > 1 || recursive) && !o.h || o.H;
    const input = [];
    if (!expanded.length) input.push({ name: '(standard input)', text: await c.slurp() });
    else
      for (const f of expanded) {
        try {
          const n = sh.fs.lookup(c.abs(f));
          if (n && n.bin) {
            input.push({ name: f, text: '', bin: true });
            continue;
          }
          input.push({ name: f, text: f === '-' ? await c.slurp() : sh.readFile(c.abs(f)) });
        } catch (e) {
          if (!(e instanceof FsErr)) throw e;
          if (!o.s) c.err(`grep: ${f}: ${U.errTxt(e)}\n`);
          err = 2;
        }
      }
    const hl = (line) => (color ? line.replace(re, (m) => (m ? `\x1b[01;31m${m}\x1b[0m` : m)) : line);
    for (const f of input) {
      const lines = U.lines(f.text);
      let count = 0;
      const lastPrinted = { i: -1 };
      const prefix = (ln, sep) => (multi ? (color ? `\x1b[35m${f.name}\x1b[0m\x1b[36m${sep}\x1b[0m` : f.name + sep) : '') + (o.n ? (color ? `\x1b[32m${ln}\x1b[0m\x1b[36m${sep}\x1b[0m` : ln + sep) : '');
      const matchIdx = [];
      lines.forEach((l, i) => {
        re.lastIndex = 0;
        const hit = re.test(l);
        re.lastIndex = 0;
        if (hit !== !!o.v && matchIdx.length < maxc) matchIdx.push(i);
      });
      count = matchIdx.length;
      if (count) st = 0;
      if (o.q) {
        if (count) return 0;
        continue;
      }
      if (o.l) {
        if (count) c.out((color ? `\x1b[35m${f.name}\x1b[0m` : f.name) + '\n');
        continue;
      }
      if (o.L) {
        if (!count) c.out(f.name + '\n');
        continue;
      }
      if (o.c) {
        c.out((multi ? f.name + ':' : '') + count + '\n');
        continue;
      }
      const printed = new Set();
      let prev = -2;
      for (const i of matchIdx) {
        const from = Math.max(0, i - before);
        if ((before || after) && prev >= 0 && from > prev + 1) c.out('--\n');
        for (let k = from; k <= i; k++) {
          if (printed.has(k)) continue;
          printed.add(k);
          if (k === i) {
            if (o.o) {
              re.lastIndex = 0;
              let mm;
              while ((mm = re.exec(lines[k])) && mm[0]) c.out(prefix(k + 1, ':') + (color ? `\x1b[01;31m${mm[0]}\x1b[0m` : mm[0]) + '\n');
            } else c.out(prefix(k + 1, ':') + (o.v ? lines[k] : hl(lines[k])) + '\n');
          } else c.out(prefix(k + 1, '-') + lines[k] + '\n');
        }
        for (let k = i + 1; k <= Math.min(lines.length - 1, i + after); k++) {
          if (matchIdx.includes(k) || printed.has(k)) continue;
          printed.add(k);
          c.out(prefix(k + 1, '-') + lines[k] + '\n');
        }
        prev = Math.max(i + after, i);
      }
    }
    return err || st;
  });

  /* ---------- sort / uniq / cut / tr / tee / xargs ---------- */
  const coll = new Intl.Collator('en');
  def('sort', async (c, args) => {
    const g = U.getopts('sort', c, args, 'rnufbhMcR', 'ktoT', { reverse: 'r', numeric: 'n', unique: 'u', 'ignore-case': 'f', 'field-separator': 't', key: 'k', output: 'o', 'human-numeric-sort': 'h' });
    if (!g) return 2;
    const { o, rest } = g;
    let text = '';
    const st = await U.readSources(c, rest, 'sort', (t) => (text += t.endsWith('\n') || !t ? t : t + '\n'));
    let lines = U.lines(text);
    const sep = o.t;
    let keyNum = o.n;
    let keyRev = false;
    let keyN = null;
    if (o.k) {
      const m = /^(\d+)(?:,(\d+))?([nrf]*)/.exec(o.k);
      if (m) {
        keyN = +m[1];
        if (m[3].includes('n')) keyNum = true;
        if (m[3].includes('r')) keyRev = true;
      }
    }
    const keyOf = (l) => {
      if (keyN === null) return l;
      const f = sep ? l.split(sep) : l.trim().split(/\s+/);
      return f.slice(keyN - 1).join(sep || ' ');
    };
    const hnum = (s) => {
      const m = /^\s*([\d.]+)\s*([KMGT]?)/i.exec(s);
      return m ? parseFloat(m[1]) * ({ '': 1, K: 1e3, M: 1e6, G: 1e9, T: 1e12 }[m[2].toUpperCase()]) : 0;
    };
    const cmp = (a, b) => {
      let x = keyOf(a);
      let y = keyOf(b);
      let r;
      if (keyNum) {
        const nx = parseFloat(x) || 0;
        const ny = parseFloat(y) || 0;
        r = nx - ny;
      } else if (o.h) r = hnum(x) - hnum(y);
      else {
        if (o.f) {
          x = x.toLowerCase();
          y = y.toLowerCase();
        }
        r = coll.compare(x, y);
      }
      if (r === 0 && !o.u) r = a < b ? -1 : a > b ? 1 : 0;
      return keyRev ? -r : r;
    };
    lines.sort(cmp);
    if (o.r) lines.reverse();
    if (o.u) lines = lines.filter((l, i) => i === 0 || cmp(lines[i - 1], l) !== 0);
    const outText = lines.length ? lines.join('\n') + '\n' : '';
    if (o.o) {
      try {
        c.sh.writeFile(c.abs(o.o), outText, false);
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`sort: open failed: ${o.o}: ${U.errTxt(e)}\n`);
        return 2;
      }
    } else c.out(outText);
    return st;
  });
  def('uniq', async (c, args) => {
    const g = U.getopts('uniq', c, args, 'cduiD', '', { count: 'c', 'repeated': 'd', unique: 'u', 'ignore-case': 'i' });
    if (!g) return 1;
    const { o, rest } = g;
    const text = rest.length ? '' : await c.slurp();
    let all = text;
    if (rest.length) {
      const st = await U.readSources(c, [rest[0]], 'uniq', (t) => (all = t));
      if (st) return st;
    }
    const groups = [];
    for (const l of U.lines(all)) {
      const k = o.i ? l.toLowerCase() : l;
      const last = groups[groups.length - 1];
      if (last && last.k === k) last.n++;
      else groups.push({ k, l, n: 1 });
    }
    for (const gp of groups) {
      if (o.d && gp.n < 2) continue;
      if (o.u && gp.n > 1) continue;
      c.out((o.c ? String(gp.n).padStart(7) + ' ' : '') + gp.l + '\n');
    }
    return 0;
  });
  function ranges(spec, max) {
    const set = new Set();
    for (const part of spec.split(',')) {
      const m = /^(\d*)(-?)(\d*)$/.exec(part);
      if (!m) return null;
      const a = m[1] ? +m[1] : 1;
      const b = m[2] ? (m[3] ? +m[3] : max) : a;
      for (let i = a; i <= b; i++) set.add(i);
    }
    return set;
  }
  def('cut', async (c, args) => {
    const g = U.getopts('cut', c, args, 's', 'dfcb', { delimiter: 'd', fields: 'f', characters: 'c', 'only-delimited': 's' });
    if (!g) return 1;
    const { o, rest } = g;
    if (!o.f && !o.c && !o.b) {
      c.err("cut: you must specify a list of bytes, characters, or fields\nTry 'cut --help' for more information.\n");
      return 1;
    }
    const delim = o.d !== undefined ? o.d : '\t';
    return await U.readSources(c, rest, 'cut', (text) => {
      for (const l of U.lines(text)) {
        if (o.f) {
          if (!l.includes(delim)) {
            if (!o.s) c.out(l + '\n');
            continue;
          }
          const parts = l.split(delim);
          const set = ranges(o.f, parts.length);
          c.out(parts.filter((_, i) => set.has(i + 1)).join(delim) + '\n');
        } else {
          const chars = [...l];
          const set = ranges(o.c || o.b, chars.length);
          c.out(chars.filter((_, i) => set.has(i + 1)).join('') + '\n');
        }
      }
    });
  });
  function expandSet(s) {
    s = s.replace(/\[:(\w+):\]/g, (m, n) => ({ lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digit: '0123456789', space: ' \t\n', alpha: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', alnum: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', punct: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~' }[n] || ''));
    s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    let out = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i + 1] === '-' && i + 2 < s.length) {
        for (let k = s.charCodeAt(i); k <= s.charCodeAt(i + 2); k++) out += String.fromCharCode(k);
        i += 2;
      } else out += s[i];
    }
    return out;
  }
  def('tr', async (c, args) => {
    const g = U.getopts('tr', c, args, 'dsc', '', { delete: 'd', 'squeeze-repeats': 's' });
    if (!g) return 1;
    const { o, rest } = g;
    if (!rest.length) {
      c.err("tr: missing operand\nTry 'tr --help' for more information.\n");
      return 1;
    }
    const text = await c.slurp();
    const s1 = expandSet(rest[0]);
    const s2 = rest[1] !== undefined ? expandSet(rest[1]) : '';
    let out = '';
    let prev = null;
    for (const ch of text) {
      let r = ch;
      const inSet = o.c ? !s1.includes(ch) : s1.includes(ch);
      if (o.d) {
        if (inSet) continue;
      } else if (inSet && s2) {
        r = o.c ? s2[s2.length - 1] : s2[Math.min(s1.indexOf(ch), s2.length - 1)];
      }
      if (o.s && inSet && prev === r) continue;
      out += r;
      prev = inSet ? r : null;
    }
    c.out(out);
    return 0;
  });
  def('tee', async (c, args) => {
    const g = U.getopts('tee', c, args, 'ai', '', { append: 'a' });
    if (!g) return 1;
    const text = await c.slurp();
    c.out(text);
    let st = 0;
    for (const f of g.rest) {
      try {
        c.sh.writeFile(c.abs(f), text, !!g.o.a);
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`tee: ${f}: ${U.errTxt(e)}\n`);
        st = 1;
      }
    }
    return st;
  });
  def('xargs', async (c, args) => {
    const g = U.getopts('xargs', c, args, 'rt0', 'nIL', {}, false, true);
    if (!g) return 1;
    const { o, rest } = g;
    const text = await c.slurp();
    const cmd = rest.length ? rest : ['echo'];
    let items = o[0] || o.null ? text.split('\0').filter(Boolean) : (text.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((s) => s.replace(/^["']|["']$/g, ''));
    if (o.I) items = U.lines(text);
    if (!items.length && o.r) return 0;
    const run = async (argv) => {
      if (o.t) c.err(argv.join(' ') + '\n');
      await c.sh.dispatch(argv, { stdin: '', stdout: c.out, stderr: c.err, tty: false });
    };
    if (o.I) {
      for (const it of items) await run(cmd.map((a) => a.split(o.I).join(it)));
    } else if (o.n) {
      for (let i = 0; i < items.length; i += +o.n) await run(cmd.concat(items.slice(i, i + +o.n)));
    } else await run(cmd.concat(items));
    return 0;
  });
  def('seq', async (c, args) => {
    const nums = args.filter((a) => !a.startsWith('-') || /^-\d/.test(a)).map(Number);
    if (!nums.length || nums.some(isNaN)) {
      c.err(nums.length ? `seq: invalid floating point argument: '${args[0]}'\n` : "seq: missing operand\nTry 'seq --help' for more information.\n");
      return 1;
    }
    let [a, b, s] = nums.length === 1 ? [1, nums[0], 1] : nums.length === 2 ? [nums[0], nums[1], 1] : nums;
    if (!s) return 1;
    let out = '';
    for (let v = a, n = 0; s > 0 ? v <= b : v >= b; v += s) {
      out += v + '\n';
      if (++n > 10000) break;
    }
    c.out(out);
  });
  def('yes', async (c, args) => {
    const t = (args.join(' ') || 'y') + '\n';
    if (!c.tty) {
      c.out(t.repeat(500));
      return 0;
    }
    for (;;) {
      c.out(t.repeat(20));
      await c.sh.waitMs(30);
      if (c.sh.fast) return 0;
    }
  });
  def('nl', async (c, args) => {
    let n = 0;
    return await U.readSources(c, args.filter((a) => !a.startsWith('-')), 'nl', (t) => U.lines(t).forEach((l) => c.out(l === '' ? '\n' : `${String(++n).padStart(6)}\t${l}\n`)));
  });

  /* ---------- sed ---------- */
  def('sed', async (c, args) => {
    const g = U.getopts('sed', c, args, 'nEriz', 'es', { quiet: 'n', silent: 'n', expression: 'e', 'regexp-extended': 'E', 'in-place': 'i' });
    if (!g) return 1;
    const { o } = g;
    let rest = g.rest;
    const scripts = [];
    for (let i = 0; i < args.length; i++) if (args[i] === '-e') scripts.push(args[i + 1]);
    if (!scripts.length) {
      if (!rest.length) {
        c.err('Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...\n');
        return 1;
      }
      scripts.push(rest[0]);
      rest = rest.slice(1);
    } else rest = rest.filter((r) => !scripts.includes(r));
    // parse
    const cmds = [];
    for (const sc of scripts) {
      const splitSed = (str) => {
        const outp = [];
        let cur = '';
        let i2 = 0;
        const addrRe = /^(\d+|\$|\/(?:[^/\\]|\\.)*\/)(?:,(\d+|\$|\/(?:[^/\\]|\\.)*\/))?\s*!?/;
        while (i2 <= str.length) {
          const rest2 = str.slice(i2);
          if (cur.trim() === '') {
            const am = addrRe.exec(rest2);
            const after = am ? rest2.slice(am[0].length) : rest2;
            const cmc = after[0];
            if ((cmc === 's' || cmc === 'y') && after[1] && !/[\s\n;]/.test(after[1])) {
              const dl = after[1];
              let j = 2;
              let seen = 0;
              while (j < after.length && seen < (cmc === 's' ? 2 : 2)) { if (after[j] === '\\') j += 2; else { if (after[j] === dl) seen++; j++; } }
              while (j < after.length && after[j] !== ';' && after[j] !== '\n') j++;
              const chunk = rest2.slice(0, (am ? am[0].length : 0) + j);
              outp.push(chunk);
              i2 += chunk.length + 1;
              cur = '';
              continue;
            }
            if (cmc === 'a' || cmc === 'i' || cmc === 'c') {
              const e = rest2.indexOf('\n');
              const chunk = e < 0 ? rest2 : rest2.slice(0, e);
              outp.push(chunk);
              i2 += chunk.length + 1;
              continue;
            }
          }
          if (i2 >= str.length) break;
          const ch = str[i2];
          if (ch === '\n' || (ch === ';' && !/\{[^}]*$/.test(cur))) { outp.push(cur); cur = ''; } else cur += ch;
          i2++;
        }
        if (cur.trim()) outp.push(cur);
        return outp;
      };
      for (const part of splitSed(sc)) {
        let t = part.trim();
        if (!t) continue;
        let a1 = null;
        let a2 = null;
        const addr = /^(\d+|\$|\/(?:[^/\\]|\\.)*\/)(?:,(\d+|\$|\/(?:[^/\\]|\\.)*\/))?\s*/.exec(t);
        const parseAddr = (a) => (a === null ? null : a === '$' ? { last: true } : a[0] === '/' ? { re: U.makeRegex(a.slice(1, -1), o.E ? 'E' : 'G', false) } : { n: +a });
        if (addr) {
          a1 = parseAddr(addr[1]);
          a2 = parseAddr(addr[2] || null);
          t = t.slice(addr[0].length);
        }
        const cm = t[0];
        if (cm === 's') {
          const d = t[1];
          const segs = [];
          let cur = '';
          let i = 2;
          for (; i < t.length && segs.length < 2; i++) {
            if (t[i] === '\\' && t[i + 1] === d) {
              cur += d;
              i++;
            } else if (t[i] === '\\') {
              cur += t[i] + t[i + 1];
              i++;
            } else if (t[i] === d) {
              segs.push(cur);
              cur = '';
            } else cur += t[i];
          }
          const flags = t.slice(i);
          let re;
          try {
            re = U.makeRegex(segs[0], o.E ? 'E' : 'G', flags.includes('i'), false, flags.includes('g') ? 'g' : '');
          } catch (e) {
            c.err(`sed: -e expression #1, char ${t.length}: unterminated \`s' command\n`);
            return 1;
          }
          cmds.push({ a1, a2, cm: 's', re, rep: segs[1] || '', p: flags.includes('p') });
        } else if (cm === 'd' || cm === 'p' || cm === 'q') cmds.push({ a1, a2, cm });
        else if (cm === 'i' || cm === 'a' || cm === 'c') cmds.push({ a1, a2, cm, text: t.slice(1).replace(/^\\?\s*/, '').replace(/\\(.)/g, '$1') });
        else if (cm === 'y') {
          const d = t[1];
          const parts = t.slice(2).split(d);
          if (parts.length < 2 || parts[0].length !== parts[1].length) { c.err(`sed: -e expression #1, char ${part.length}: strings for \`y' command are different lengths\n`); return 1; }
          cmds.push({ a1, a2, cm, from: parts[0], to: parts[1] });
        } else {
          c.err(`sed: -e expression #1, char ${part.length}: unknown command: \`${cm}'\n`);
          return 1;
        }
      }
    }
    const process = (text) => {
      const lines = U.lines(text);
      let out = '';
      let inRange = new Map();
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let deleted = false;
        let quit = false;
        const after = [];
        for (const cd of cmds) {
          const test = (a) => (a.last ? i === lines.length - 1 : a.n !== undefined ? i + 1 === a.n : a.re.test(line));
          let match = true;
          if (cd.a1 && !cd.a2) match = test(cd.a1);
          else if (cd.a1 && cd.a2) {
            if (inRange.get(cd)) {
              match = true;
              if (test(cd.a2)) inRange.set(cd, false);
            } else if (test(cd.a1)) {
              match = true;
              if (!(cd.a2.n !== undefined && cd.a2.n <= i + 1)) inRange.set(cd, true);
            } else match = false;
          }
          if (!match) continue;
          if (cd.cm === 'd') {
            deleted = true;
            break;
          }
          if (cd.cm === 'i') out += cd.text + '\n';
          if (cd.cm === 'a') after.push(cd.text);
          if (cd.cm === 'c') { out += cd.text + '\n'; deleted = true; break; }
          if (cd.cm === 'y') line = [...line].map((ch) => { const k = cd.from.indexOf(ch); return k >= 0 ? cd.to[k] : ch; }).join('');
          if (cd.cm === 'p') out += line + '\n';
          if (cd.cm === 'q') quit = true;
          if (cd.cm === 's') {
            const before = line;
            line = line.replace(cd.re, (...m) => {
              const groups = m.slice(0, -2).filter((x) => typeof x === 'string');
              return cd.rep.replace(/\\(\d)|&|\\n|\\&/g, (t, d) => (t === '&' ? groups[0] : t === '\\n' ? '\n' : t === '\\&' ? '&' : groups[+d] || ''));
            });
            if (cd.p && line !== before) out += line + '\n';
          }
        }
        if (!deleted && !o.n) out += line + '\n';
        for (const t2 of after) out += t2 + '\n';
        if (quit) break;
      }
      return out;
    };
    if (o.i) {
      for (const f of rest) {
        try {
          c.sh.writeFile(c.abs(f), process(c.sh.readFile(c.abs(f))), false);
        } catch (e) {
          if (!(e instanceof FsErr)) throw e;
          c.err(`sed: can't read ${f}: ${U.errTxt(e)}\n`);
          return 2;
        }
      }
      return 0;
    }
    return await U.readSources(c, rest, 'sed', (t) => c.out(process(t)));
  });

  /* ---------- awk (small subset, transpiled to JS) ---------- */
  function awkToJs(prog) {
    // tokenizer
    const toks = [];
    let i = 0;
    const s = prog;
    const prevIsValue = () => {
      const t = toks[toks.length - 1];
      return t && (t.k === 'num' || t.k === 'str' || t.k === 'id' || t.v === ')' || t.v === ']' || t.k === 'field');
    };
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) {
        if (ch === '\n') toks.push({ k: 'op', v: ';' });
        i++;
        continue;
      }
      if (ch === '#') {
        while (i < s.length && s[i] !== '\n') i++;
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        let str = '';
        while (j < s.length && s[j] !== '"') {
          if (s[j] === '\\') {
            const n = s[++j];
            str += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          } else str += s[j];
          j++;
        }
        toks.push({ k: 'str', v: JSON.stringify(str) });
        i = j + 1;
        continue;
      }
      if (ch === '/' && !prevIsValue()) {
        let j = i + 1;
        while (j < s.length && s[j] !== '/') {
          if (s[j] === '\\') j++;
          j++;
        }
        toks.push({ k: 're', v: s.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
      const num = /^\d+(\.\d+)?/.exec(s.slice(i));
      if (num) {
        toks.push({ k: 'num', v: num[0] });
        i += num[0].length;
        continue;
      }
      const id = /^[A-Za-z_]\w*/.exec(s.slice(i));
      if (id) {
        toks.push({ k: 'id', v: id[0] });
        i += id[0].length;
        continue;
      }
      const op = /^(\+\+|--|\+=|-=|\*=|\/=|==|!=|<=|>=|&&|\|\||!~|[-+*\/%<>=!~?:,;(){}\[\]$])/.exec(s.slice(i));
      if (op) {
        toks.push({ k: 'op', v: op[0] });
        i += op[0].length;
        continue;
      }
      throw new Error('syntax error at source line 1');
    }
    // emit js
    let out = '';
    const KW = ['if', 'else', 'while', 'for', 'in', 'BEGIN', 'END', 'print', 'printf', 'NR', 'NF', 'length', 'substr', 'toupper', 'tolower', 'int', 'sqrt', 'index'];
    const rules = [];
    let p = 0;
    const T = () => toks[p];
    function expr(stop) {
      // returns js string until a token in stop at depth 0
      let js = '';
      let depth = 0;
      let prevVal = false;
      while (p < toks.length) {
        const t = toks[p];
        if (depth === 0 && t.k === 'op' && stop.includes(t.v)) break;
        if (t.k === 'op' && (t.v === '(' || t.v === '[')) depth++;
        if (t.k === 'op' && (t.v === ')' || t.v === ']')) {
          if (depth === 0) break;
          depth--;
        }
        let piece;
        let isVal = false;
        let startsVal = false;
        if (t.k === 'num') {
          piece = t.v;
          isVal = startsVal = true;
        } else if (t.k === 'str') {
          piece = t.v;
          isVal = startsVal = true;
        } else if (t.k === 're') {
          const prev = toks[p - 1];
          piece = prev && (prev.v === '~' || prev.v === '!~') ? `/${t.v}/` : `(/${t.v}/.test(F(0))?1:0)`;
          isVal = startsVal = true;
        } else if (t.k === 'id') {
          startsVal = true;
          isVal = true;
          const nx = toks[p + 1];
          if (t.v === 'NR' || t.v === 'NF') piece = t.v;
          else if (['length', 'substr', 'toupper', 'tolower', 'int', 'sqrt', 'index'].includes(t.v)) {
            piece = '$$' + t.v;
            isVal = false;
          } else if (nx && nx.v === '[') piece = 'A.' + t.v;
          else piece = 'V.' + t.v;
        } else if (t.v === '$') {
          piece = 'F(';
          p++;
          // operand of $
          const nt = toks[p];
          let inner;
          if (nt.v === '(') {
            p++;
            inner = '(' + expr([')']) + ')';
            // p at ')'
          } else if (nt.k === 'id' && (nt.v === 'NF' || nt.v === 'NR')) inner = nt.v;
          else if (nt.k === 'id') inner = 'V.' + nt.v;
          else inner = nt.v;
          if (prevVal) js += '+""+';
          js += 'F(' + inner + ')';
          prevVal = true;
          p++;
          continue;
        } else if (t.v === '~') piece = '=~';
        else if (t.v === '!~') piece = '!=~';
        else if (t.v === '(') {
          piece = '(';
          startsVal = true;
        } else if (t.v === '!') {
          piece = '!';
          startsVal = true;
        } else piece = t.v;
        if (piece.startsWith('$$')) {
          piece = piece.slice(2) === 'length' ? 'LEN' : piece.slice(2) === 'substr' ? 'SUBSTR' : piece.slice(2) === 'index' ? 'INDEX' : piece.slice(2) === 'toupper' ? 'UP' : piece.slice(2) === 'tolower' ? 'LOW' : piece.slice(2) === 'int' ? 'INT' : 'Math.sqrt';
          startsVal = true;
          if (toks[p + 1] && toks[p + 1].v !== '(') {
            piece += '(F(0))';
            isVal = true;
          }
        }
        if (piece === '=~' || piece === '!=~') {
          // a ~ /re/  => M(a,/re/)  (handled by post-process)
        }
        if (prevVal && startsVal && !(t.k === 'op' && t.v === '(' && toks[p - 1] && toks[p - 1].k === 'id')) js += '+""+';
        js += piece;
        prevVal = isVal || t.v === ')' || t.v === ']';
        if (t.k === 'op' && !(t.v === ')' || t.v === ']')) prevVal = false;
        p++;
      }
      // a =~ /re/  -> M(a, /re/)
      js = js.replace(/([^\s=!&|(,]+(?:\([^()]*\))?(?:\[[^\]]*\])?)\s*(!?)=~\s*(\/(?:[^/\\]|\\.)*\/|"[^"]*")/g, (m, a, neg, re) => `${neg ? '!' : ''}M(${a},${re})`);
      return js;
    }
    function stmt() {
      const t = T();
      if (!t) return '';
      if (t.v === '{') {
        p++;
        let b = '{';
        while (T() && T().v !== '}') b += stmt();
        p++;
        return b + '}';
      }
      if (t.v === ';') {
        p++;
        return '';
      }
      if (t.k === 'id' && (t.v === 'print' || t.v === 'printf')) {
        p++;
        const args = [];
        while (T() && !(T().v === ';' || T().v === '}')) {
          args.push(expr([',', ';', '}']));
          if (T() && T().v === ',') p++;
        }
        if (t.v === 'print') return `P([${args.length ? args.join(',') : 'F(0)'}]);`;
        return `PF([${args.join(',')}]);`;
      }
      if (t.k === 'id' && t.v === 'if') {
        p += 2;
        const cond = expr([')']);
        p++;
        let body = stmt();
        let els = '';
        while (T() && T().v === ';') p++;
        if (T() && T().k === 'id' && T().v === 'else') {
          p++;
          els = ' else ' + stmt();
        }
        return `if(${cond}) ${body || ';'}${els}`;
      }
      if (t.k === 'id' && t.v === 'for') {
        p += 2;
        if (toks[p + 1] && toks[p + 1].v === 'in') {
          const v = toks[p].v;
          const arr = toks[p + 2].v;
          p += 4;
          return `for(V.${v} of Object.keys(A.${arr})) ${stmt()}`;
        }
        const a = expr([';']);
        p++;
        const b = expr([';']);
        p++;
        const cc = expr([')']);
        p++;
        return `for(${a};${b};${cc}) ${stmt()}`;
      }
      if (t.k === 'id' && t.v === 'while') {
        p += 2;
        const cond = expr([')']);
        p++;
        return `while(${cond}) ${stmt()}`;
      }
      const e = expr([';', '}']);
      if (T() && T().v === ';') p++;
      return e + ';';
    }
    // rules
    while (p < toks.length) {
      while (T() && T().v === ';') p++;
      if (!T()) break;
      let kind = 'main';
      let cond = null;
      if (T().k === 'id' && (T().v === 'BEGIN' || T().v === 'END')) {
        kind = T().v;
        p++;
      } else if (T().v !== '{') cond = expr(['{']);
      let body;
      if (T() && T().v === '{') body = stmt();
      else body = '{P([F(0)]);}';
      rules.push({ kind, cond, body });
    }
    for (const r of rules) {
      if (r.kind === 'BEGIN') out += `BEGIN.push(()=>${r.body});\n`;
      else if (r.kind === 'END') out += `END.push(()=>${r.body});\n`;
      else out += `MAIN.push(()=>{ if(${r.cond ? '(' + r.cond + ')' : 'true'}) ${r.body} });\n`;
    }
    return out;
  }
  def('awk', async (c, args) => {
    let FS = null;
    const rest = args.slice();
    const vars = {};
    for (let i = 0; i < rest.length; ) {
      if (rest[i] === '-F') {
        FS = rest[i + 1];
        rest.splice(i, 2);
      } else if (rest[i].startsWith('-F')) {
        FS = rest[i].slice(2);
        rest.splice(i, 1);
      } else if (rest[i] === '-v') {
        const [k, v] = rest[i + 1].split(/=(.*)/s);
        vars[k] = v;
        rest.splice(i, 2);
      } else i++;
    }
    if (!rest.length) {
      c.err('usage: awk [-F fs][-v var=value] [prog | -f progfile][file ...]\n');
      return 2;
    }
    const prog = rest.shift();
    let js;
    try {
      js = awkToJs(prog);
    } catch (e) {
      c.err(`awk: ${e.message}\n`);
      return 2;
    }
    const mkProxy = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : 0) });
    const V = mkProxy();
    Object.assign(V, vars);
    const A = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (t[k] = mkProxy())) });
    let cur = [''];
    const sepRe = FS === null || FS === ' ' ? /\s+/ : FS.length === 1 ? new RegExp(escRe(FS)) : new RegExp(FS);
    const num = (x) => (typeof x === 'string' && /^\s*[+-]?\d+(\.\d+)?\s*$/.test(x) ? parseFloat(x) : x);
    const F = (n) => {
      n = Number(n);
      return num(cur[n] === undefined ? '' : cur[n]);
    };
    let outBuf = '';
    const P = (a) => (outBuf += a.map((x) => (typeof x === 'number' && !Number.isInteger(x) ? String(+x.toFixed(6)) : String(x))).join(V.OFS === 0 ? ' ' : V.OFS) + '\n');
    const PF = (a) => {
      const f = a[0];
      const vals = a.slice(1);
      let vi = 0;
      outBuf += unescape(String(f), {}).replace(/%([-+ 0]*)(\d+)?(?:\.(\d+))?([sdifc%])/g, (m, fl, w, pr, ty) => {
        if (ty === '%') return '%';
        const v = vals[vi++];
        let s = ty === 's' ? String(v) : ty === 'c' ? String(v)[0] : ty === 'f' ? Number(v).toFixed(pr === undefined ? 6 : +pr) : String(Math.trunc(Number(v)));
        if (w) s = fl.includes('-') ? s.padEnd(+w) : s.padStart(+w);
        return s;
      });
    };
    const M = (a, re) => (re instanceof RegExp ? re : new RegExp(String(re))).test(String(a));
    const LEN = (x) => String(x === undefined ? '' : x).length;
    const SUBSTR = (s, a, b) => String(s).substr(a - 1, b === undefined ? undefined : b);
    const INDEX = (s, t) => String(s).indexOf(t) + 1;
    const UP = (s) => String(s).toUpperCase();
    const LOW = (s) => String(s).toLowerCase();
    const INT = (x) => Math.trunc(Number(x));
    const BEGIN = [];
    const MAIN = [];
    const END = [];
    let NR = 0;
    let NF = 0;
    try {
      // eslint-disable-next-line no-new-func
      new Function('BEGIN', 'MAIN', 'END', 'V', 'A', 'F', 'P', 'PF', 'M', 'LEN', 'SUBSTR', 'INDEX', 'UP', 'LOW', 'INT', 'with(this){' + js.replace(/\bNR\b/g, 'this.NR').replace(/\bNF\b/g, 'this.NF') + '}').call(
        {
          get NR() {
            return NR;
          },
          get NF() {
            return NF;
          },
        },
        BEGIN,
        MAIN,
        END,
        V,
        A,
        F,
        P,
        PF,
        M,
        LEN,
        SUBSTR,
        INDEX,
        UP,
        LOW,
        INT
      );
    } catch (e) {
      c.err('awk: syntax error at source line 1\n');
      return 2;
    }
    const ctx = {
      get NR() {
        return NR;
      },
      get NF() {
        return NF;
      },
    };
    // rebuild functions with proper NR/NF binding (simple: re-run with closures)
    const NRNF = { NR: 0, NF: 0 };
    const jsb = js.replace(/\bNR\b/g, 'NRNF.NR').replace(/\bNF\b/g, 'NRNF.NF');
    BEGIN.length = MAIN.length = END.length = 0;
    try {
      new Function('BEGIN', 'MAIN', 'END', 'V', 'A', 'F', 'P', 'PF', 'M', 'LEN', 'SUBSTR', 'INDEX', 'UP', 'LOW', 'INT', 'NRNF', jsb)(BEGIN, MAIN, END, V, A, F, P, PF, M, LEN, SUBSTR, INDEX, UP, LOW, INT, NRNF);
    } catch (e) {
      c.err('awk: syntax error at source line 1\n');
      return 2;
    }
    try {
      BEGIN.forEach((f) => f());
      const st = await U.readSources(c, rest, 'awk', (text) => {
        for (const line of U.lines(text)) {
          NRNF.NR++;
          cur = [line].concat(line.trim() === '' ? [] : FS === null || FS === ' ' ? line.trim().split(sepRe) : line.split(sepRe));
          NRNF.NF = cur.length - 1;
          MAIN.forEach((f) => f());
        }
      });
      END.forEach((f) => f());
      c.out(outBuf);
      return st;
    } catch (e) {
      c.out(outBuf);
      c.err('awk: runtime error: ' + e.message + '\n');
      return 2;
    }
  });

  /* ---------- diff ---------- */
  def('diff', async (c, args) => {
    const files = args.filter((a) => !a.startsWith('-'));
    if (files.length < 2) {
      c.err("diff: missing operand after 'diff'\n");
      return 2;
    }
    let a;
    let b;
    try {
      a = U.lines(c.sh.readFile(c.abs(files[0])));
      b = U.lines(c.sh.readFile(c.abs(files[1])));
    } catch (e) {
      if (!(e instanceof FsErr)) throw e;
      c.err(`diff: ${e.path.replace(c.sh.cwd + '/', '')}: ${U.errTxt(e)}\n`);
      return 2;
    }
    const n = a.length;
    const m = b.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0;
    let j = 0;
    let out = '';
    const rng = (s, e) => (e - s <= 1 ? String(s + 1) : `${s + 1},${e}`);
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) {
        i++;
        j++;
        continue;
      }
      const si = i;
      const sj = j;
      const del = [];
      const add = [];
      while ((i < n || j < m) && !(i < n && j < m && a[i] === b[j])) {
        if (j >= m || (i < n && L[i + 1][j] >= L[i][j + 1])) del.push(a[i++]);
        else add.push(b[j++]);
      }
      const kind = del.length && add.length ? 'c' : del.length ? 'd' : 'a';
      out += (kind === 'a' ? si : rng(si, si + del.length)) + kind + (kind === 'd' ? sj : rng(sj, sj + add.length)) + '\n';
      del.forEach((l) => (out += '< ' + l + '\n'));
      if (kind === 'c') out += '---\n';
      add.forEach((l) => (out += '> ' + l + '\n'));
    }
    c.out(out);
    return out ? 1 : 0;
  });

  /* ---------- date / sleep / bc / expr ---------- */
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /** wall-clock view of an instant in the machine's time zone (LX.tz), independent of the browser's zone */
  const zfmt = {};
  LX.zdate = (ms) => {
    const tz = LX.tz || 'UTC';
    const f = zfmt[tz] || (zfmt[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' }));
    const p = {};
    f.formatToParts(new Date(ms)).forEach((x) => (p[x.type] = x.value));
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    return { getFullYear: () => +p.year, getMonth: () => +p.month - 1, getDate: () => +p.day, getDay: () => dow, getHours: () => +p.hour, getMinutes: () => +p.minute, getSeconds: () => +p.second, getTime: () => ms };
  };
  /** epoch milliseconds for a wall-clock time in LX.tz */
  LX.zmake = (y, mo, d, h, mi, s) => {
    const want = Date.UTC(y, mo, d, h || 0, mi || 0, s || 0);
    let guess = want;
    for (let i = 0; i < 3; i++) {
      const z = LX.zdate(guess);
      guess += want - Date.UTC(z.getFullYear(), z.getMonth(), z.getDate(), z.getHours(), z.getMinutes(), z.getSeconds());
    }
    return guess;
  };
  U.strftime = function (fmt, d, utc) {
    const p2 = (n) => String(n).padStart(2, '0');
    let g = (k) => (utc ? d['getUTC' + k]() : d['get' + k]());
    if (!utc && LX.tz) {
      try {
        const parts = {};
        new Intl.DateTimeFormat('en-US', { timeZone: LX.tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' }).formatToParts(d).forEach((p) => (parts[p.type] = p.value));
        const map = { FullYear: +parts.year, Month: +parts.month - 1, Date: +parts.day, Hours: +parts.hour, Minutes: +parts.minute, Seconds: +parts.second, Day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday) };
        g = (k) => map[k];
      } catch (e) {}
    }
    let tz = 'UTC';
    if (!utc) {
      try {
        tz = new Intl.DateTimeFormat('en', Object.assign({ timeZoneName: 'short' }, LX.tz ? { timeZone: LX.tz } : {})).formatToParts(d).find((x) => x.type === 'timeZoneName').value;
      } catch (e) {}
      const odd = { 'GMT+5:30': 'IST', 'GMT+1': 'CET', 'GMT+2': 'CEST', 'GMT+9': 'JST', 'GMT-5': 'EST', 'GMT-4': 'EDT', 'GMT-8': 'PST', 'GMT-7': 'PDT', 'GMT': 'UTC' };
      if (odd[tz]) tz = odd[tz];
    }
    return fmt.replace(/%([a-zA-Z%])/g, (m, k) => {
      switch (k) {
        case 'Y': return String(g('FullYear'));
        case 'y': return p2(g('FullYear') % 100);
        case 'm': return p2(g('Month') + 1);
        case 'd': return p2(g('Date'));
        case 'e': return String(g('Date')).padStart(2, ' ');
        case 'H': return p2(g('Hours'));
        case 'I': return p2(g('Hours') % 12 || 12);
        case 'M': return p2(g('Minutes'));
        case 'S': return p2(g('Seconds'));
        case 'p': return g('Hours') < 12 ? 'AM' : 'PM';
        case 'A': return DAYS[g('Day')];
        case 'a': return DAYS[g('Day')].slice(0, 3);
        case 'B': return MONTHS[g('Month')];
        case 'b': case 'h': return MONTHS[g('Month')].slice(0, 3);
        case 'j': return String(Math.floor((d - new Date(g('FullYear'), 0, 0)) / 86400000)).padStart(3, '0');
        case 'F': return `${g('FullYear')}-${p2(g('Month') + 1)}-${p2(g('Date'))}`;
        case 'T': return `${p2(g('Hours'))}:${p2(g('Minutes'))}:${p2(g('Seconds'))}`;
        case 'D': return `${p2(g('Month') + 1)}/${p2(g('Date'))}/${p2(g('FullYear') % 100)}`;
        case 'Z': return tz;
        case 'z': {
          if (utc) return '+0000';
          const off = Math.round((Date.UTC(g('FullYear'), g('Month'), g('Date'), g('Hours'), g('Minutes'), g('Seconds')) - Math.floor(d / 1000) * 1000) / 60000);
          return (off >= 0 ? '+' : '-') + String(Math.floor(Math.abs(off) / 60)).padStart(2, '0') + String(Math.abs(off) % 60).padStart(2, '0');
        }
        case 's': return String(Math.floor(d / 1000));
        case 'u': return String(g('Day') || 7);
        case 'n': return '\n';
        case 't': return '\t';
        case '%': return '%';
        default: return m;
      }
    });
  };
  def('date', async (c, args) => {
    const utc = args.includes('-u') || args.includes('--utc');
    const f = args.find((a) => a.startsWith('+'));
    const d = new Date();
    c.out(U.strftime(f ? f.slice(1) : '%a %b %e %H:%M:%S %Z %Y', d, utc) + '\n');
  });
  def('sleep', async (c, args) => {
    if (!args.length) {
      c.err("sleep: missing operand\nTry 'sleep --help' for more information.\n");
      return 1;
    }
    let total = 0;
    for (const a of args) {
      const m = /^(\d+(?:\.\d+)?)([smhd]?)$/.exec(a);
      if (!m) {
        c.err(`sleep: invalid time interval '${a}'\nTry 'sleep --help' for more information.\n`);
        return 1;
      }
      total += +m[1] * { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
    }
    await c.sh.waitMs(Math.min(total, 4) * 1000);
  });
  def(
    'bc',
    async (c, args) => {
      const text = await c.slurp();
      for (const l of U.lines(text)) {
        if (/^\s*(quit|scale=.*)\s*$/.test(l)) continue;
        try {
          const e = l.replace(/\^/g, '**').replace(/[^0-9+\-*/%().\s]/g, (ch) => {
            throw new Error('x');
          });
          const v = Function('"use strict";return (' + e + ')')();
          c.out((Number.isInteger(v) ? String(v) : String(+v.toFixed(args.includes('-l') ? 20 : 0))) + '\n');
        } catch (er) {
          c.err('(standard_in) 1: syntax error\n');
        }
      }
    },
    { pkg: 'bc' }
  );
  def('expr', async (c, args) => {
    const e = args.join(' ');
    try {
      c.out(c.sh.arith(e.replace(/\\/g, '')) + '\n');
      return Number(c.sh.arith(e)) === 0 ? 1 : 0;
    } catch (er) {
      c.err('expr: syntax error\n');
      return 2;
    }
  });
})();
