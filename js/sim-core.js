/* Linux Academy: bash-like parser, expander and interpreter */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { VFS, FsErr } = LX;

  class Incomplete extends Error {}
  class SyntaxErr extends Error {}
  class CmdErr extends Error {}
  class DaemonLoop extends Error {}
  LX.DaemonLoop = DaemonLoop;
  class ExitSig {
    constructor(code) {
      this.code = code;
    }
  }
  class LoopSig {
    constructor(kind, n) {
      this.kind = kind;
      this.n = n;
    }
  }
  class RetSig {
    constructor(code) {
      this.code = code;
    }
  }
  class AbortSig {
    constructor(sig) {
      this.sig = sig || 'INT';
    }
  }
  Object.assign(LX, { Incomplete, SyntaxErr, CmdErr, ExitSig, LoopSig, RetSig, AbortSig });

  /* ------------ registry ------------ */
  LX.cmds = {};
  LX.def = function (names, run, o) {
    for (const n of [].concat(names)) LX.cmds[n] = Object.assign({ name: n, run }, o || {});
  };

  /* ------------ helpers ------------ */
  const escRe = (c) => c.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  function globSrc(pat) {
    let re = '';
    for (let i = 0; i < pat.length; i++) {
      const c = pat[i];
      if (c === '\\') re += escRe(pat[++i] || '\\');
      else if (c === '*') re += '.*';
      else if (c === '?') re += '.';
      else if (c === '[') {
        const j = pat.indexOf(']', i + 2);
        if (j < 0) {
          re += '\\[';
          continue;
        }
        let cls = pat.slice(i + 1, j);
        if (cls[0] === '!') cls = '^' + cls.slice(1);
        re += '[' + cls.replace(/\\/g, '\\\\') + ']';
        i = j;
      } else re += escRe(c);
    }
    return re;
  }
  const globToRegex = (pat) => new RegExp('^' + globSrc(pat) + '$', 's');
  LX.globToRegex = globToRegex;
  function cmpName(a, b) {
    const x = a.replace(/^\./, '').toLowerCase();
    const y = b.replace(/^\./, '').toLowerCase();
    if (x < y) return -1;
    if (x > y) return 1;
    return a < b ? 1 : a > b ? -1 : 0;
  }
  LX.cmpName = cmpName;
  LX.stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

  /* ------------ tokenizer ------------ */
  function scanParen(src, i) {
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      const c = src[j];
      if (c === '\\') {
        j++;
        continue;
      }
      if (c === "'") {
        const k = src.indexOf("'", j + 1);
        if (k < 0) throw new Incomplete();
        j = k;
        continue;
      }
      if (c === '"') {
        j++;
        while (j < src.length && src[j] !== '"') {
          if (src[j] === '\\') j++;
          j++;
        }
        if (j >= src.length) throw new Incomplete();
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) return j;
      }
    }
    throw new Incomplete();
  }
  function scanBrace(src, i) {
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') {
        depth--;
        if (depth === 0) return j;
      }
    }
    throw new Incomplete();
  }

  function tokenize(src) {
    const toks = [];
    const pending = [];
    let segs = [];
    let ws = 0;
    let i = 0;
    const n = src.length;
    const add = (s, q) => {
      if (!segs.length) ws = i;
      const l = segs[segs.length - 1];
      if (l && l.q === q) l.s += s;
      else segs.push({ q, s });
    };
    const end = () => {
      if (segs.length) {
        toks.push({ t: 'w', segs, s: ws, e: i });
        segs = [];
      }
    };
    while (i < n) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\r') {
        end();
        i++;
        continue;
      }
      if (c === '\n') {
        end();
        toks.push({ t: 'nl', s: i, e: i + 1 });
        i++;
        while (pending.length) {
          const hd = pending.shift();
          const lines = [];
          let found = false;
          while (i <= n) {
            let j = src.indexOf('\n', i);
            const hasNl = j >= 0;
            if (!hasNl) j = n;
            let line = src.slice(i, j);
            i = hasNl ? j + 1 : n + 1;
            const cmp = hd.strip ? line.replace(/^\t+/, '') : line;
            if (cmp === hd.delim) {
              found = true;
              break;
            }
            lines.push(hd.strip ? cmp : line);
            if (!hasNl) break;
          }
          if (!found) throw new Incomplete();
          hd.body = lines.length ? lines.join('\n') + '\n' : '';
        }
        continue;
      }
      if (c === '#' && !segs.length) {
        while (i < n && src[i] !== '\n') i++;
        continue;
      }
      if (c === '\\') {
        if (i + 1 >= n) throw new Incomplete();
        if (src[i + 1] === '\n') {
          i += 2;
          continue;
        }
        add(src[i + 1], 's');
        i += 2;
        continue;
      }
      if (c === "'") {
        const j = src.indexOf("'", i + 1);
        if (j < 0) throw new Incomplete();
        add(src.slice(i + 1, j), 's');
        i = j + 1;
        continue;
      }
      if (c === '"') {
        let j = i + 1;
        let buf = '';
        if (!segs.length) ws = i;
        let started = false;
        for (;;) {
          if (j >= n) throw new Incomplete();
          const d = src[j];
          if (d === '"') break;
          if (d === '\\' && j + 1 < n && '$"\\`\n'.includes(src[j + 1])) {
            if (buf) {
              add(buf, 'd');
              buf = '';
            }
            if (src[j + 1] !== '\n') add(src[j + 1], 's');
            j += 2;
            started = true;
            continue;
          }
          if (d === '$' && src[j + 1] === '(') {
            const k = scanParen(src, j + 1);
            buf += src.slice(j, k + 1);
            j = k + 1;
            continue;
          }
          if (d === '$' && src[j + 1] === '{') {
            const k = scanBrace(src, j + 1);
            buf += src.slice(j, k + 1);
            j = k + 1;
            continue;
          }
          if (d === '`') {
            const k = src.indexOf('`', j + 1);
            if (k < 0) throw new Incomplete();
            buf += src.slice(j, k + 1);
            j = k + 1;
            continue;
          }
          buf += d;
          j++;
        }
        add(buf, 'd');
        i = j + 1;
        continue;
      }
      if (c === '$' && src[i + 1] === '(') {
        const j = scanParen(src, i + 1);
        add(src.slice(i, j + 1), 'n');
        i = j + 1;
        continue;
      }
      if (c === '$' && src[i + 1] === '{') {
        const j = scanBrace(src, i + 1);
        add(src.slice(i, j + 1), 'n');
        i = j + 1;
        continue;
      }
      if (c === '`') {
        const j = src.indexOf('`', i + 1);
        if (j < 0) throw new Incomplete();
        add(src.slice(i, j + 1), 'n');
        i = j + 1;
        continue;
      }
      if ((c === '<' || c === '>') && src[i + 1] === '(' && (!segs.length || segs.every((x) => x.q === 'n'))) {
        const j = scanParen(src, i + 1);
        add(src.slice(i, j + 1), 'n');
        i = j + 1;
        continue;
      }
      if (c === '<' && src[i + 1] === '<') {
        end();
        if (src[i + 2] === '<') {
          toks.push({ t: 'op', v: '<<<', s: i, e: i + 3, fd: 0 });
          i += 3;
          continue;
        }
        let j = i + 2;
        let strip = false;
        if (src[j] === '-') {
          strip = true;
          j++;
        }
        while (src[j] === ' ' || src[j] === '\t') j++;
        const m = /^(['"]?)([^\s;|&<>()'"]+)\1/.exec(src.slice(j));
        if (!m) throw new SyntaxErr("syntax error near unexpected token `newline'");
        const hd = { delim: m[2], quoted: m[1] !== '', strip, body: null };
        pending.push(hd);
        toks.push({ t: 'op', v: '<<', s: i, e: j + m[0].length, fd: 0, hd });
        i = j + m[0].length;
        continue;
      }
      if (c === '(' && src[i + 1] === '(' && !segs.length) {
        const lt = toks[toks.length - 1];
        const KW = ['for', 'if', 'while', 'until', 'then', 'do', 'else', 'elif'];
        const okPrev = !lt || lt.t === 'nl' || (lt.t === 'op' && lt.v !== ')') || (lt.t === 'w' && lt.segs.length === 1 && KW.includes(lt.segs[0].s));
        if (okPrev) {
          const j = scanParen(src, i);
          if (src[j - 1] === ')') {
            toks.push({ t: 'arith', expr: src.slice(i + 2, j - 1), s: i, e: j + 1 });
            i = j + 1;
            continue;
          }
        }
      }
      if ('|&;<>()'.includes(c)) {
        let fd = null;
        if ((c === '>' || c === '<') && segs.length === 1 && segs[0].q === 'n' && /^\d{1,3}$/.test(segs[0].s)) {
          fd = +segs[0].s;
          ws = ws;
          segs = [];
        } else end();
        const s0 = fd !== null ? i - 1 : i;
        let v = c;
        const nx = src[i + 1];
        let to;
        if (c === '|' && nx === '|') v = '||';
        else if (c === '&' && nx === '&') v = '&&';
        else if (c === '&' && nx === '>') v = '&>';
        else if (c === '>' && nx === '>') v = '>>';
        else if (c === '>' && nx === '&' && /\d/.test(src[i + 2] || '')) {
          v = '>&';
          to = +src[i + 2];
        } else if (c === ';' && nx === ';') v = ';;';
        i += v.length === 2 ? 2 : 1;
        if (v === '>&') i++;
        const tk = { t: 'op', v, s: s0, e: i };
        if (fd !== null) tk.fd = fd;
        else if (v === '>' || v === '>>') tk.fd = 1;
        else if (v === '<') tk.fd = 0;
        if (to !== undefined) {
          tk.to = to;
          tk.fd = tk.fd == null ? 1 : tk.fd;
        }
        toks.push(tk);
        continue;
      }
      add(c, 'n');
      i++;
    }
    end();
    return toks;
  }
  LX.tokenize = tokenize;

  /* ------------ parser ------------ */
  const RESERVED = ['then', 'elif', 'else', 'fi', 'do', 'done', 'esac', '}'];
  function parse(toks, src) {
    let p = 0;
    const isOp = (t, v) => t && t.t === 'op' && t.v === v;
    const isKw = (t, kw) => t && t.t === 'w' && t.segs.length === 1 && t.segs[0].q === 'n' && t.segs[0].s === kw;
    const unexpected = (t) => {
      const txt = !t ? 'newline' : t.t === 'op' ? t.v : t.t === 'nl' ? 'newline' : t.segs.map((s) => s.s).join('');
      return new SyntaxErr(`syntax error near unexpected token \`${txt}'`);
    };
    const skipNl = () => {
      while (toks[p] && toks[p].t === 'nl') p++;
    };
    const expectKw = (k) => {
      if (!toks[p]) throw new Incomplete();
      if (!isKw(toks[p], k)) throw unexpected(toks[p]);
      p++;
    };
    const isRedirTok = (t) => t && t.t === 'op' && ['>', '>>', '<', '&>', '>&', '<<', '<<<'].includes(t.v);

    function parseList(stop) {
      const items = [];
      for (;;) {
        while (toks[p] && (toks[p].t === 'nl' || isOp(toks[p], ';'))) p++;
        const t = toks[p];
        if (!t) {
          if (stop.length) throw new Incomplete();
          break;
        }
        if (t.t === 'w' && stop.some((k) => isKw(t, k))) break;
        if (isOp(t, ';;') && stop.includes(';;')) break;
        if (isOp(t, ')')) {
          if (stop.length === 0 && items.length === 0) throw unexpected(t);
          break;
        }
        const node = parseAndOr();
        let bg = false;
        const nx = toks[p];
        if (isOp(nx, '&')) {
          bg = true;
          p++;
        } else if (nx && nx.t !== 'nl' && !isOp(nx, ';') && !isOp(nx, ';;') && !(nx.t === 'w' && stop.some((k) => isKw(nx, k))) && !isOp(nx, ')')) {
          throw unexpected(nx);
        }
        items.push({ node, bg });
      }
      return { type: 'list', items };
    }
    function parseAndOr() {
      const first = parsePipeline();
      const rest = [];
      while (isOp(toks[p], '&&') || isOp(toks[p], '||')) {
        const op = toks[p].v;
        p++;
        skipNl();
        rest.push({ op, p: parsePipeline() });
      }
      return { type: 'andor', first, rest };
    }
    function parsePipeline() {
      if (!toks[p]) throw new Incomplete();
      const st = toks[p];
      let neg = false;
      if (isKw(toks[p], '!')) {
        neg = true;
        p++;
      }
      const cmds = [parseCommand()];
      while (isOp(toks[p], '|')) {
        p++;
        skipNl();
        cmds.push(parseCommand());
      }
      return { type: 'pipe', neg, cmds, src: src.slice(st.s, toks[p - 1].e) };
    }
    function parseRedirs(into) {
      while (isRedirTok(toks[p])) {
        const t = toks[p++];
        if (t.v === '<<') {
          into.push({ v: '<<', fd: 0, hd: t.hd });
          continue;
        }
        if (t.v === '>&') {
          into.push({ v: '>&', fd: t.fd, to: t.to });
          continue;
        }
        const w = toks[p];
        if (!w) throw new Incomplete();
        if (w.t !== 'w') throw unexpected(w);
        p++;
        into.push({ v: t.v, fd: t.fd, segs: w.segs });
      }
    }
    function parseCommand() {
      const t = toks[p];
      if (!t) throw new Incomplete();
      if (t.t === 'nl') throw unexpected(t);
      if (t.t === 'op') {
        if (t.v === '(') {
          p++;
          const body = parseList([]);
          if (!isOp(toks[p], ')')) {
            if (!toks[p]) throw new Incomplete();
            throw unexpected(toks[p]);
          }
          p++;
          const node = { type: 'group', sub: true, body, redirs: [] };
          parseRedirs(node.redirs);
          return node;
        }
        if (!isRedirTok(t)) throw unexpected(t);
        return parseSimple();
      }
      if (t.t === 'arith') {
        p++;
        const node = { type: 'arith', expr: t.expr, redirs: [] };
        parseRedirs(node.redirs);
        return node;
      }
      if (RESERVED.some((k) => isKw(t, k))) throw unexpected(t);
      if (isKw(t, 'case')) {
        p++;
        const w = toks[p++];
        if (!w) throw new Incomplete();
        if (w.t !== 'w') throw unexpected(w);
        skipNl();
        expectKw('in');
        const clauses = [];
        for (;;) {
          while (toks[p] && (toks[p].t === 'nl' || isOp(toks[p], ';'))) p++;
          if (!toks[p]) throw new Incomplete();
          if (isKw(toks[p], 'esac')) {
            p++;
            break;
          }
          if (isOp(toks[p], '(')) p++;
          const pats = [];
          for (;;) {
            const pt = toks[p++];
            if (!pt) throw new Incomplete();
            if (pt.t !== 'w') throw unexpected(pt);
            pats.push(pt.segs);
            if (isOp(toks[p], '|')) {
              p++;
              continue;
            }
            break;
          }
          if (!isOp(toks[p], ')')) {
            if (!toks[p]) throw new Incomplete();
            throw unexpected(toks[p]);
          }
          p++;
          const body = parseList([';;', 'esac']);
          if (isOp(toks[p], ';;')) p++;
          clauses.push({ pats, body });
        }
        const node = { type: 'case', word: w.segs, clauses, redirs: [] };
        parseRedirs(node.redirs);
        return node;
      }
      if (isKw(t, '[[')) {
        p++;
        const args = [];
        let prev = null;
        for (;;) {
          const x = toks[p];
          if (!x) throw new Incomplete();
          if (x.t === 'nl') {
            p++;
            continue;
          }
          if (isKw(x, ']]')) {
            p++;
            break;
          }
          const segs = x.t === 'w' ? x.segs : [{ q: 'n', s: x.v }];
          if (prev && prev.e === x.s && x.t !== 'nl') args[args.length - 1] = args[args.length - 1].concat(segs);
          else args.push(segs);
          prev = x;
          p++;
        }
        const node = { type: 'dbl', args, redirs: [] };
        parseRedirs(node.redirs);
        return node;
      }
      if (isKw(t, 'if')) {
        p++;
        const conds = [];
        let els = null;
        let cond = parseList(['then']);
        expectKw('then');
        let body = parseList(['elif', 'else', 'fi']);
        conds.push({ cond, body });
        while (isKw(toks[p], 'elif')) {
          p++;
          cond = parseList(['then']);
          expectKw('then');
          body = parseList(['elif', 'else', 'fi']);
          conds.push({ cond, body });
        }
        if (isKw(toks[p], 'else')) {
          p++;
          els = parseList(['fi']);
        }
        expectKw('fi');
        const node = { type: 'if', conds, els, redirs: [] };
        parseRedirs(node.redirs);
        return node;
      }
      if (isKw(t, 'for')) {
        p++;
        const nm = toks[p];
        if (!nm) throw new Incomplete();
        if (nm.t === 'arith') {
          p++;
          while (toks[p] && (toks[p].t === 'nl' || isOp(toks[p], ';'))) p++;
          expectKw('do');
          const body = parseList(['done']);
          expectKw('done');
          const node = { type: 'cfor', expr: nm.expr, body, redirs: [] };
          parseRedirs(node.redirs);
          return node;
        }
        if (nm.t !== 'w') throw unexpected(nm);
        p++;
        const name = nm.segs.map((s) => s.s).join('');
        let words = null;
        while (toks[p] && toks[p].t === 'nl') p++;
        if (isKw(toks[p], 'in')) {
          p++;
          words = [];
          while (toks[p] && toks[p].t === 'w') words.push(toks[p++].segs);
        }
        while (toks[p] && (toks[p].t === 'nl' || isOp(toks[p], ';'))) p++;
        expectKw('do');
        const body = parseList(['done']);
        expectKw('done');
        const node = { type: 'for', name, words, body, redirs: [] };
        parseRedirs(node.redirs);
        return node;
      }
      if (isKw(t, 'while') || isKw(t, 'until')) {
        const until = isKw(t, 'until');
        p++;
        const cond = parseList(['do']);
        expectKw('do');
        const body = parseList(['done']);
        expectKw('done');
        const node = { type: 'while', until, cond, body, redirs: [] };
        parseRedirs(node.redirs);
        return node;
      }
      if (isKw(t, '{')) {
        p++;
        const body = parseList(['}']);
        expectKw('}');
        const node = { type: 'group', body, redirs: [] };
        parseRedirs(node.redirs);
        return node;
      }
      if (isKw(t, 'function')) {
        p++;
        const nm = toks[p++];
        if (!nm) throw new Incomplete();
        if (isOp(toks[p], '(') && isOp(toks[p + 1], ')')) p += 2;
        skipNl();
        return { type: 'func', name: nm.segs.map((s) => s.s).join(''), body: parseCommand() };
      }
      if (t.t === 'w' && isOp(toks[p + 1], '(') && isOp(toks[p + 2], ')') && t.segs.length === 1 && /^[A-Za-z_][\w-]*$/.test(t.segs[0].s)) {
        p += 3;
        skipNl();
        return { type: 'func', name: t.segs[0].s, body: parseCommand() };
      }
      return parseSimple();
    }
    function parseSimple() {
      const startTok = toks[p];
      const words = [];
      const assigns = [];
      const redirs = [];
      for (;;) {
        const t = toks[p];
        if (!t) break;
        if (t.t === 'w') {
          const f = t.segs[0];
          const am = f.q === 'n' ? /^([A-Za-z_][A-Za-z0-9_]*)(?:\[([^\]]*)\])?(\+?)=/.exec(f.s) : null;
          if (words.length === 0 && am) {
            const rest0 = f.s.slice(am[0].length);
            if (rest0 === '' && t.segs.length === 1 && isOp(toks[p + 1], '(') && toks[p + 1].s === t.e) {
              p += 2;
              const items = [];
              while (toks[p] && !isOp(toks[p], ')')) {
                if (toks[p].t === 'nl') {
                  p++;
                  continue;
                }
                if (toks[p].t !== 'w') throw unexpected(toks[p]);
                items.push(toks[p++].segs);
              }
              if (!toks[p]) throw new Incomplete();
              p++;
              assigns.push({ name: am[1], arr: items, append: !!am[3] });
              continue;
            }
            const segs = [{ q: 'n', s: rest0 }].concat(t.segs.slice(1));
            assigns.push({ name: am[1], idx: am[2], append: !!am[3], segs });
            p++;
            continue;
          }
          words.push(t.segs);
          p++;
          continue;
        }
        if (isRedirTok(t)) {
          parseRedirs(redirs);
          continue;
        }
        break;
      }
      if (!words.length && !assigns.length && !redirs.length) throw unexpected(toks[p]);
      return { type: 'simple', words, assigns, redirs, ln: startTok && src ? src.slice(0, startTok.s).split('\n').length : 0 };
    }
    const ast = parseList([]);
    if (p < toks.length) throw unexpected(toks[p]);
    return ast;
  }
  LX.parse = (src) => parse(tokenize(src), src);

  /* ------------ brace expansion ------------ */
  function findBrace(s) {
    for (let st = s.indexOf('{'); st >= 0; st = s.indexOf('{', st + 1)) {
      if (st > 0 && s[st - 1] === '$') continue;
      let depth = 0;
      let end = -1;
      for (let j = st; j < s.length; j++) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') {
          depth--;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      if (end < 0) continue;
      const inner = s.slice(st + 1, end);
      const r = /^(-?\d+|[a-zA-Z])\.\.(-?\d+|[a-zA-Z])$/.exec(inner);
      if (r) {
        const items = [];
        if (/\d/.test(r[1]) && /\d/.test(r[2])) {
          const a = +r[1];
          const b = +r[2];
          const w = /^-?0\d/.test(r[1]) ? r[1].replace('-', '').length : 0;
          for (let v = a; a <= b ? v <= b : v >= b; v += a <= b ? 1 : -1) items.push(w ? String(v).padStart(w, '0') : String(v));
        } else {
          const a = r[1].charCodeAt(0);
          const b = r[2].charCodeAt(0);
          for (let v = a; a <= b ? v <= b : v >= b; v += a <= b ? 1 : -1) items.push(String.fromCharCode(v));
        }
        return { start: st, end, items };
      }
      const items = [];
      let d = 0;
      let cur = '';
      for (const ch of inner) {
        if (ch === '{') d++;
        if (ch === '}') d--;
        if (ch === ',' && d === 0) {
          items.push(cur);
          cur = '';
        } else cur += ch;
      }
      items.push(cur);
      if (items.length > 1) return { start: st, end, items };
    }
    return null;
  }
  function braceExpand(segs) {
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].q !== 'n') continue;
      const s = segs[i].s;
      const r = findBrace(s);
      if (!r) continue;
      const res = [];
      for (const it of r.items) {
        const ns = segs.slice(0, i).concat([{ q: 'n', s: s.slice(0, r.start) + it + s.slice(r.end + 1) }], segs.slice(i + 1));
        res.push(...braceExpand(ns));
      }
      return res;
    }
    return [segs];
  }

  /* ------------ arithmetic ------------ */
  function arithEval(expr, getVar) {
    const toks = [];
    const re = /\s*(\d+|[A-Za-z_]\w*|\*\*|<=|>=|==|!=|&&|\|\||[-+*\/%()<>!])/gy;
    let m;
    let last = 0;
    while ((m = re.exec(expr))) {
      toks.push(m[1]);
      last = re.lastIndex;
    }
    if (expr.slice(last).trim()) throw new CmdErr(`${expr.trim()}: syntax error: operand expected`);
    let i = 0;
    const val = (t) => {
      const v = parseInt(getVar(t), 10);
      return isNaN(v) ? 0 : v;
    };
    const prim = () => {
      const t = toks[i++];
      if (t === undefined) throw new CmdErr(`${expr.trim()}: syntax error: operand expected`);
      if (t === '(') {
        const v = or();
        i++;
        return v;
      }
      if (t === '-') return -prim();
      if (t === '+') return prim();
      if (t === '!') return prim() ? 0 : 1;
      if (/^\d/.test(t)) return +t;
      if (/^[A-Za-z_]/.test(t)) return val(t);
      throw new CmdErr(`${expr.trim()}: syntax error: operand expected`);
    };
    const pow = () => {
      const b = prim();
      if (toks[i] === '**') {
        i++;
        return Math.pow(b, pow());
      }
      return b;
    };
    const mul = () => {
      let v = pow();
      while (['*', '/', '%'].includes(toks[i])) {
        const o = toks[i++];
        const r = pow();
        if (o === '*') v *= r;
        else {
          if (r === 0) throw new CmdErr('division by 0 (error token is "' + r + '")');
          v = o === '/' ? Math.trunc(v / r) : v % r;
        }
      }
      return v;
    };
    const add = () => {
      let v = mul();
      while (toks[i] === '+' || toks[i] === '-') v = toks[i++] === '+' ? v + mul() : v - mul();
      return v;
    };
    const cmp = () => {
      let v = add();
      while (['<', '>', '<=', '>=', '==', '!='].includes(toks[i])) {
        const o = toks[i++];
        const r = add();
        v = +(o === '<' ? v < r : o === '>' ? v > r : o === '<=' ? v <= r : o === '>=' ? v >= r : o === '==' ? v === r : v !== r);
      }
      return v;
    };
    const and = () => {
      let v = cmp();
      while (toks[i] === '&&') {
        i++;
        const r = cmp();
        v = v && r ? 1 : 0;
      }
      return v;
    };
    const or = () => {
      let v = and();
      while (toks[i] === '||') {
        i++;
        const r = and();
        v = v || r ? 1 : 0;
      }
      return v;
    };
    if (!toks.length) return 0;
    const r = or();
    if (i < toks.length) throw new CmdErr(`${expr.trim()}: syntax error in expression`);
    return r;
  }

  /* ------------ the shell ------------ */
  const SYSTEM_USERS = [
    ['root', 0, 0, 'root', '/root'],
    ['daemon', 1, 1, 'daemon', '/usr/sbin'],
    ['bin', 2, 2, 'bin', '/bin'],
    ['sys', 3, 3, 'sys', '/dev'],
    ['www-data', 33, 33, 'www-data', '/var/www'],
    ['nobody', 65534, 65534, 'nobody', '/nonexistent'],
    ['sshd', 110, 65534, '', '/run/sshd'],
  ];

  class Shell {
    constructor(opts) {
      opts = opts || {};
      this.fs = LX.makeFS();
      this.users = {
        root: { uid: 0, gid: 0, home: '/root', groups: ['root'], gecos: 'root' },
        learner: { uid: 1000, gid: 1000, home: '/home/learner', groups: ['learner', 'sudo', 'users'], gecos: 'Linux Learner' },
      };
      this.user = 'learner';
      this._eu = null;
      this.userStack = [];
      this.cwd = '/home/learner';
      this.vars = { HOME: '/home/learner', USER: 'learner', LOGNAME: 'learner', SHELL: '/bin/bash', PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'en_US.UTF-8', TERM: 'xterm-256color', EDITOR: 'nano', OLDPWD: '' };
      this.exported = new Set(['HOME', 'USER', 'LOGNAME', 'SHELL', 'PATH', 'LANG', 'TERM', 'EDITOR', 'OLDPWD']);
      this.aliases = { ll: 'ls -alF', la: 'ls -A', l: 'ls -CF' };
      this.funcs = {};
      this.history = [];
      this.log = [];
      this.jobs = [];
      this.nextJob = 1;
      this.nextPid = 4001;
      this.argStack = [];
      this.localStack = [];
      this.installed = new Set(LX.DEFAULT_PKGS || []);
      this.services = { ssh: { desc: 'OpenBSD Secure Shell server', active: true, enabled: true, pid: 412, proc: 'sshd' }, cron: { desc: 'Regular background program processing daemon', active: true, enabled: true, pid: 530, proc: 'cron' } };
      this.cols = 80;
      this.fast = !!opts.fast;
      this.hooks = {};
      this.notices = [];
      this.status = 0;
      this.aborted = false;
      this.umask = 0o022;
      this.startTime = Date.now() - 3 * 86400000 - 8000000;
      this.errSink = () => {};
      this.loopGuard = 0;
      this.arrays = {};
      this.assoc = new Set();
      this.opts = { e: false, u: false, x: false, pipefail: false };
      this.traps = {};
      this.condDepth = 0;
      this.extraGroups = {};
      this.installBinaries();
      (LX.initHooks || []).forEach((h) => h(this));
    }

    /* --- users / identity --- */
    eu() {
      return this._eu || this.user;
    }
    home() {
      return this.users[this.user].home;
    }
    groupsOf(u) {
      return (this.users[u] || { groups: [] }).groups;
    }
    writePasswd() {
      const lines = SYSTEM_USERS.map((u) => `${u[0]}:x:${u[1]}:${u[2]}:${u[3]}:${u[4]}:/usr/sbin/nologin`);
      lines[0] = 'root:x:0:0:root:/root:/bin/bash';
      for (const [n, u] of Object.entries(this.users)) if (n !== 'root') lines.push(`${n}:x:${u.uid}:${u.gid}:${u.gecos},,,:${u.home}:/bin/bash`);
      const g = ['root:x:0:', 'daemon:x:1:', 'adm:x:4:learner', 'sudo:x:27:learner', 'users:x:100:'];
      for (const [n, u] of Object.entries(this.users)) if (n !== 'root') g.push(`${n}:x:${u.gid}:`);
      const pf = this.fs.lookup('/etc/passwd');
      if (pf) pf.content = lines.join('\n') + '\n';
      const gf = this.fs.lookup('/etc/group');
      if (gf) gf.content = g.join('\n') + '\n';
    }
    installBinaries() {
      for (const [name, d] of Object.entries(LX.cmds)) {
        if (d.pkg && !this.installed.has(d.pkg)) continue;
        if (d.builtin && !d.bin) continue;
        this.addBinary(name);
      }
    }
    addBinary(name) {
      const dir = this.fs.lookup('/usr/bin');
      if (!dir.kids[name]) dir.kids[name] = this.fs.mk('f', { owner: 'root', group: 'root', mode: 0o755, exe: name, size: 24000 + ((name.length * 7919) % 90000), mtime: Date.now() - 9 * 86400000 });
    }
    removeBinary(name) {
      delete this.fs.lookup('/usr/bin').kids[name];
    }

    /* --- paths and files --- */
    abs(p) {
      if (p === '~' || p.startsWith('~/')) p = this.home() + p.slice(1);
      return VFS.norm(p, this.cwd);
    }
    stat(p, follow = true) {
      return this.fs.lookup(this.abs(p), follow);
    }
    exists(p) {
      return !!this.stat(p);
    }
    isDir(p) {
      const n = this.stat(p);
      return !!n && n.t === 'd';
    }
    isFile(p) {
      const n = this.stat(p);
      return !!n && n.t === 'f';
    }
    cat(p) {
      const n = this.stat(p);
      return n && n.t === 'f' ? n.content || '' : null;
    }
    modeOf(p) {
      const n = this.stat(p);
      return n ? (n.mode & 0o7777).toString(8).padStart(3, '0') : null;
    }
    ownerOf(p) {
      const n = this.stat(p);
      return n ? n.owner : null;
    }
    ls(p) {
      const n = this.stat(p || '.');
      return n && n.t === 'd' ? Object.keys(n.kids).sort(cmpName) : [];
    }
    can(n, bit) {
      return VFS.can(n, this.eu(), this.groupsOf(this.eu()), bit);
    }
    readFile(abs) {
      const n = this.fs.lookup(abs);
      if (!n) throw new FsErr('ENOENT', abs);
      if (n.t === 'd') throw new FsErr('EISDIR', abs);
      if (n.t === 'c') return n.dev && LX.devRead ? LX.devRead(n.dev) : '';
      if (!this.can(n, 4)) throw new FsErr('EACCES', abs);
      if (n.dyn) {
        const d = LX.procRead(this, abs);
        if (d !== null && d !== undefined) return d;
      }
      if (n.archive) return '[archive data]';
      return n.content || '';
    }
    parentFor(abs, bit) {
      const pd = this.fs.lookup(VFS.dirname(abs));
      if (!pd) throw new FsErr('ENOENT', abs);
      if (pd.t !== 'd') throw new FsErr('ENOTDIR', abs);
      if (!this.can(pd, bit)) throw new FsErr('EACCES', abs);
      return pd;
    }
    newFile(extra) {
      return this.fs.mk('f', Object.assign({ owner: this.eu(), group: this.users[this.eu()].groups[0], mode: 0o666 & ~this.umask }, extra));
    }
    writeFile(abs, data, append) {
      const n = this.fs.lookup(abs);
      if (n) {
        if (n.t === 'd') throw new FsErr('EISDIR', abs);
        if (n.t === 'c') return;
        if (!this.can(n, 2)) throw new FsErr('EACCES', abs);
        if (n.attrs && (n.attrs.includes('i') || (n.attrs.includes('a') && !append))) throw new FsErr('EPERM', abs);
        if (abs.startsWith('/proc/sys/') && LX.procWrite && LX.procWrite(this, abs, data)) return;
        n.content = append ? (n.content || '') + data : data;
        delete n.bin;
        delete n.size;
        delete n.archive;
        n.mtime = Date.now();
        return;
      }
      const pd = this.parentFor(abs, 2);
      pd.kids[VFS.base(abs)] = this.newFile(Object.assign({ content: data }, pd.mode & 0o2000 ? { group: pd.group } : {}));
      pd.mtime = Date.now();
    }
    mkdir(abs) {
      if (this.fs.lookup(abs, false)) throw new FsErr('EEXIST', abs);
      const pd = this.parentFor(abs, 2);
      pd.kids[VFS.base(abs)] = this.fs.mk('d', { owner: this.eu(), group: pd.mode & 0o2000 ? pd.group : this.users[this.eu()].groups[0], mode: (0o777 & ~this.umask) | (pd.mode & 0o2000) });
      pd.mtime = Date.now();
    }
    unlink(abs) {
      const n = this.fs.lookup(abs, false);
      if (!n) throw new FsErr('ENOENT', abs);
      const pd = this.parentFor(abs, 2);
      if (pd.mode & 0o1000 && this.eu() !== 'root' && n.owner !== this.eu() && pd.owner !== this.eu()) throw new FsErr('EPERM', abs);
      if (n.attrs && (n.attrs.includes('i') || n.attrs.includes('a'))) throw new FsErr('EPERM', abs);
      if (n.nlink > 1) n.nlink--;
      delete pd.kids[VFS.base(abs)];
      pd.mtime = Date.now();
    }
    copyNode(src, dst, recursive, preserve) {
      const n = this.fs.lookup(src);
      if (n.t === 'd' && !recursive) throw new FsErr('EISDIR', src);
      if (n.t !== 'd' && !this.can(n, 4)) throw new FsErr('EACCES', src);
      const pd = this.parentFor(dst, 2);
      const clone = this.fs.clone(n);
      const fix = (x) => {
        delete x.nlink;
        delete x.ino;
        delete x.attrs;
        if (!(preserve && this.eu() === 'root')) {
          x.owner = this.eu();
          x.group = this.users[this.eu()].groups[0];
        }
        if (!preserve) x.mtime = Date.now();
        if (x.kids) Object.values(x.kids).forEach(fix);
      };
      fix(clone);
      pd.kids[VFS.base(dst)] = clone;
    }
    moveNode(src, dst) {
      const n = this.fs.lookup(src, false);
      const spd = this.parentFor(src, 2);
      const dpd = this.parentFor(dst, 2);
      delete spd.kids[VFS.base(src)];
      dpd.kids[VFS.base(dst)] = n;
      n.mtime = Date.now();
    }
    fsError(e, name, who) {
      if (e instanceof FsErr) return `${who}: ${name === undefined ? e.path : name}: ${FsErr.msg[e.code]}`;
      throw e;
    }

    /* --- variables --- */
    getVar(name) {
      if (name === 'BASH_VERSION') return '5.2.21(1)-release';
      if (/^\d+$/.test(name)) {
        const fr = this.argStack[this.argStack.length - 1];
        if (name === '0') {
          let k = this.argStack.length - 1;
          while (k > 0 && this.argStack[k].func) k--;
          return this.argStack[k] ? this.argStack[k].name : 'bash';
        }
        return fr ? fr.args[+name - 1] : undefined;
      }
      switch (name) {
        case '?':
          return String(this.status);
        case '#': {
          const fr = this.argStack[this.argStack.length - 1];
          return String(fr ? fr.args.length : 0);
        }
        case '@':
        case '*': {
          const fr = this.argStack[this.argStack.length - 1];
          return fr ? fr.args.join(' ') : '';
        }
        case '$':
          return '1204';
        case '!':
          return String(this.nextPid - 1);
        case 'RANDOM':
          return String(Math.floor(Math.random() * 32768));
        case 'UID':
        case 'EUID':
          return String(this.users[this.eu()].uid);
        case 'PWD':
          return this.cwd;
        case 'HOSTNAME':
          return this.hostname || 'linux-school';
        case 'SECONDS':
          return String(Math.floor((Date.now() - this.startTime) / 1000) % 1000);
        case 'PPID':
          return '1';
      }
      for (let i = this.localStack.length - 1; i >= 0; i--) if (name in this.localStack[i]) return this.localStack[i][name];
      if (this.arrays[name] !== undefined) return Array.isArray(this.arrays[name]) ? this.arrays[name][0] : this.arrays[name]['0'];
      return this.vars[name];
    }
    setVar(name, val) {
      if (this.readonly && this.readonly.has(name)) throw new CmdErr(`${name}: readonly variable`);
      for (let i = this.localStack.length - 1; i >= 0; i--)
        if (name in this.localStack[i]) {
          this.localStack[i][name] = val;
          return;
        }
      this.vars[name] = val;
    }
    arithPure(expr) {
      return String(arithEval(expr, (n) => this.getVar(n)));
    }
    arith(expr) {
      return this.arithAssign(expr);
    }
    arithAssign(expr) {
      let last = '0';
      for (const part of String(expr).split(',')) {
        const e = part.trim();
        if (!e) continue;
        let m;
        if ((m = /^([A-Za-z_]\w*)\s*(\+\+|--)$/.exec(e))) {
          const v = Number(this.getVar(m[1]) || 0);
          this.setVar(m[1], String(v + (m[2] === '++' ? 1 : -1)));
          last = String(v);
        } else if ((m = /^(\+\+|--)\s*([A-Za-z_]\w*)$/.exec(e))) {
          const v = Number(this.getVar(m[2]) || 0) + (m[1] === '++' ? 1 : -1);
          this.setVar(m[2], String(v));
          last = String(v);
        } else if ((m = /^([A-Za-z_]\w*)\s*(\*\*=|\+=|-=|\*=|\/=|%=|=)\s*(.+)$/.exec(e)) && !/^=/.test(m[3])) {
          const rhs = Number(this.arithPure(m[3]));
          const cur = Number(this.getVar(m[1]) || 0);
          const op = m[2];
          const v = op === '=' ? rhs : op === '+=' ? cur + rhs : op === '-=' ? cur - rhs : op === '*=' ? cur * rhs : op === '/=' ? Math.trunc(cur / rhs) : op === '%=' ? cur % rhs : Math.pow(cur, rhs);
          this.setVar(m[1], String(v));
          last = String(v);
        } else last = this.arithPure(e);
      }
      return last;
    }
    arrayValues(name) {
      const a = this.arrays[name];
      if (!a) return this.vars[name] !== undefined ? [this.vars[name]] : [];
      return Array.isArray(a) ? a.filter((x) => x !== undefined) : Object.values(a);
    }
    arrayKeys(name) {
      const a = this.arrays[name];
      if (!a) return [];
      return Array.isArray(a) ? a.map((x, i) => (x === undefined ? null : String(i))).filter((x) => x !== null) : Object.keys(a);
    }
    arrayGet(name, key) {
      const a = this.arrays[name];
      if (!a) return key === '0' ? this.vars[name] : undefined;
      if (!Array.isArray(a)) return a[key];
      const i = Number(this.arithPure(key));
      return a[i < 0 ? a.length + i : i];
    }
    applyAssign(o) {
      const a = o.a;
      if (a.arr) {
        if (this.assoc.has(a.name)) {
          const obj = a.append && this.arrays[a.name] ? this.arrays[a.name] : {};
          for (let i = 0; i + 1 < o.items.length; i += 2) obj[o.items[i]] = o.items[i + 1];
          this.arrays[a.name] = obj;
        } else if (a.append) this.arrays[a.name] = (Array.isArray(this.arrays[a.name]) ? this.arrays[a.name] : this.vars[a.name] !== undefined ? [this.vars[a.name]] : []).concat(o.items);
        else this.arrays[a.name] = o.items.slice();
        return;
      }
      if (a.idx !== undefined) {
        if (this.assoc.has(a.name)) {
          if (!this.arrays[a.name]) this.arrays[a.name] = {};
          this.arrays[a.name][o.idxExp !== undefined ? o.idxExp : a.idx] = o.v;
        } else {
          if (!Array.isArray(this.arrays[a.name])) this.arrays[a.name] = [];
          this.arrays[a.name][Number(this.arithPure(a.idx))] = o.v;
        }
        return;
      }
      if (a.append) this.setVar(a.name, (this.getVar(a.name) || '') + o.v);
      else this.setVar(a.name, o.v);
    }

    /* --- expansion --- */
    async scanJoin(text) {
      return (await this.scan(text, true)).map((x) => x.s).join('');
    }
    async scan(text, inDq) {
      const out = [];
      let lit = '';
      const flush = () => {
        if (lit) {
          out.push({ s: lit, x: false });
          lit = '';
        }
      };
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '$') {
          const nx = text[i + 1];
          if (nx === '(') {
            const j = scanParen(text, i + 1);
            flush();
            if (text[i + 2] === '(' && text[j - 1] === ')') {
              out.push({ s: this.arith(await this.scanJoin(text.slice(i + 3, j - 1))), x: true });
            } else out.push({ s: (await this.capture(text.slice(i + 2, j))).replace(/\n+$/, ''), x: true });
            i = j;
            continue;
          }
          if (nx === '{') {
            const j = scanBrace(text, i + 1);
            flush();
            out.push({ s: await this.paramExp(text.slice(i + 2, j)), x: true });
            i = j;
            continue;
          }
          const m = /^([A-Za-z_][A-Za-z0-9_]*|[0-9]|[?#@*$!])/.exec(text.slice(i + 1));
          if (m) {
            flush();
            const v = this.getVar(m[1]);
            if (v === undefined && this.opts.u && !/^[?#@*$!]$/.test(m[1])) throw new CmdErr(`${m[1]}: unbound variable`);
            out.push({ s: v === undefined ? '' : String(v), x: true });
            i += m[0].length;
            continue;
          }
          lit += '$';
          continue;
        }
        if ((c === '<' || c === '>') && text[i + 1] === '(' && !inDq && (i === 0 || /[\s=:]/.test(text[i - 1]))) {
          const j = scanParen(text, i + 1);
          flush();
          if (c === '>') throw new CmdErr('process substitution >(...) is not supported in this sandbox');
          const body = await this.capture(text.slice(i + 2, j));
          this.psubSeq = (this.psubSeq || 0) + 1;
          const path = `/dev/fd/${62 + this.psubSeq}`;
          this.fs.mkdirp('/dev/fd', { owner: 'root', group: 'root', mode: 0o755 });
          this.fs.put(path, body, { owner: this.eu(), group: this.eu(), mode: 0o600 });
          (this.psubFiles = this.psubFiles || []).push(path);
          out.push({ s: path, x: false });
          i = j;
          continue;
        }
        if (c === '`') {
          const j = text.indexOf('`', i + 1);
          flush();
          out.push({ s: (await this.capture(text.slice(i + 1, j))).replace(/\n+$/, ''), x: true });
          i = j;
          continue;
        }
        lit += c;
      }
      flush();
      return out;
    }
    async paramExp(inner) {
      let m0;
      if ((m0 = /^#([A-Za-z_]\w*)\[[@*]\]$/.exec(inner))) return String(this.arrayValues(m0[1]).length);
      if ((m0 = /^!([A-Za-z_]\w*)\[[@*]\]$/.exec(inner))) return this.arrayKeys(m0[1]).join(' ');
      if ((m0 = /^([A-Za-z_]\w*)\[[@*]\]:\s*(-?\d+)(?::\s*(\d+))?$/.exec(inner))) {
        const vals = this.arrayValues(m0[1]);
        const off = +m0[2] < 0 ? Math.max(0, vals.length + +m0[2]) : +m0[2];
        return (m0[3] !== undefined ? vals.slice(off, off + +m0[3]) : vals.slice(off)).join(' ');
      }
      if ((m0 = /^([A-Za-z_]\w*)\[(-\d+)\]$/.exec(inner)) && !this.assoc.has(m0[1])) {
        const vals = this.arrayValues(m0[1]);
        const v = vals[vals.length + +m0[2]];
        return v === undefined ? '' : String(v);
      }
      if ((m0 = /^([A-Za-z_]\w*)\[([^\]@*][^\]]*)\]((?::?[-+?=]|##?|%%?|\/|\^\^?|,,?).*)$/s.exec(inner))) {
        const key = this.assoc.has(m0[1]) ? await this.scanJoin(m0[2]) : m0[2];
        const ev = this.arrayGet(m0[1], key);
        const had = Object.prototype.hasOwnProperty.call(this.vars, '__AEL');
        const prevV = this.vars.__AEL;
        if (ev === undefined) delete this.vars.__AEL;
        else this.vars.__AEL = String(ev);
        try {
          return await this.paramExp('__AEL' + m0[3]);
        } finally {
          if (had) this.vars.__AEL = prevV;
          else delete this.vars.__AEL;
        }
      }
      if ((m0 = /^([A-Za-z_]\w*)\[([^\]]+)\]$/.exec(inner))) {
        if (m0[2] === '@' || m0[2] === '*') return this.arrayValues(m0[1]).join(' ');
        const key = this.assoc.has(m0[1]) ? await this.scanJoin(m0[2]) : m0[2];
        const v = this.arrayGet(m0[1], key);
        return v === undefined ? '' : String(v);
      }
      if (/^#[A-Za-z_]\w*$/.test(inner)) return String((this.getVar(inner.slice(1)) || '').length);
      const m = /^([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[?#@*$])(.*)$/s.exec(inner);
      if (!m) return '';
      const name = m[1];
      const rest = m[2];
      const val = this.getVar(name);
      if (rest === '') return val === undefined ? '' : val;
      const s = val === undefined ? '' : String(val);
      let mm;
      if ((mm = /^(:?)([-=+?])(.*)$/s.exec(rest))) {
        const word = await this.scanJoin(mm[3]);
        const unset = val === undefined || (mm[1] && val === '');
        if (mm[2] === '-') return unset ? word : val;
        if (mm[2] === '=') {
          if (unset) {
            this.setVar(name, word);
            return word;
          }
          return val;
        }
        if (mm[2] === '+') return unset ? '' : word;
        if (unset) throw new CmdErr(`${name}: ${word || 'parameter null or not set'}`);
        return val;
      }
      if ((mm = /^(##|#|%%|%)(.*)$/s.exec(rest))) {
        const re = globToRegex(await this.scanJoin(mm[2]));
        const op = mm[1];
        if (op[0] === '#') {
          if (op === '#') {
            for (let k = 0; k <= s.length; k++) if (re.test(s.slice(0, k))) return s.slice(k);
          } else for (let k = s.length; k >= 0; k--) if (re.test(s.slice(0, k))) return s.slice(k);
        } else if (op === '%') {
          for (let k = s.length; k >= 0; k--) if (re.test(s.slice(k))) return s.slice(0, k);
        } else for (let k = 0; k <= s.length; k++) if (re.test(s.slice(k))) return s.slice(0, k);
        return s;
      }
      if ((mm = /^(\/\/?)([^/]*)(?:\/(.*))?$/s.exec(rest))) {
        const re = new RegExp(globSrc(await this.scanJoin(mm[2])), mm[1] === '//' ? 'g' : '');
        return s.replace(re, await this.scanJoin(mm[3] || ''));
      }
      if (rest === '^^') return s.toUpperCase();
      if (rest === ',,') return s.toLowerCase();
      if (rest === '^') return s.charAt(0).toUpperCase() + s.slice(1);
      if ((mm = /^:\s*(-?\d+)(?::\s*(\d+))?$/.exec(rest))) {
        const off = +mm[1] < 0 ? Math.max(0, s.length + +mm[1]) : +mm[1];
        return mm[2] !== undefined ? s.substr(off, +mm[2]) : s.slice(off);
      }
      return s;
    }
    async capture(src) {
      let buf = '';
      const io = { stdin: null, stdout: (s) => (buf += s), stderr: this.errSink, tty: false };
      const sn = this.snap();
      try {
        const st = await this.runSource(src, io);
        this.lastSubStatus = st;
      } catch (e) {
        if (e instanceof ExitSig) return buf;
        throw e;
      } finally {
        const st2 = this.status;
        this.restoreSnap(sn);
        this.status = st2;
      }
      return buf;
    }
    async expandWord(segs, o) {
      o = o || {};
      const split = o.split !== false;
      const doGlob = o.glob !== false;
      const out = [];
      for (const sg of braceExpand(segs)) {
        if (sg.length === 1 && sg[0].q === 'd') {
          const ds = sg[0].s;
          let mm;
          if (ds === '$@' || ds === '$*') {
            const fr = this.argStack[this.argStack.length - 1];
            if (ds === '$*') out.push(fr ? fr.args.join(' ') : '');
            else out.push(...(fr ? fr.args : []));
            continue;
          }
          if ((mm = /^\$\{([A-Za-z_]\w*)\[@\]\}$/.exec(ds))) {
            out.push(...this.arrayValues(mm[1]));
            continue;
          }
          if ((mm = /^\$\{!([A-Za-z_]\w*)\[@\]\}$/.exec(ds))) {
            out.push(...this.arrayKeys(mm[1]));
            continue;
          }
        }
        const fields = [];
        let cur = null;
        const push = (s, lit) => {
          if (!cur) cur = { parts: [] };
          cur.parts.push({ s, lit });
        };
        const endField = () => {
          if (cur) {
            fields.push(cur);
            cur = null;
          }
        };
        for (let k = 0; k < sg.length; k++) {
          const g = sg[k];
          if (g.q === 's') push(g.s, true);
          else if (g.q === 'd') push(await this.scanJoin(g.s), true);
          else {
            let text = g.s;
            if (k === 0 && text[0] === '~') {
              const m = /^~([A-Za-z0-9_-]*)(?=\/|$)/.exec(text);
              if (m) {
                const home = m[1] === '' ? this.home() : this.users[m[1]] ? this.users[m[1]].home : null;
                if (home) {
                  push(home, true);
                  text = text.slice(m[0].length);
                }
              }
            }
            for (const pc of await this.scan(text, false)) {
              if (!pc.x) {
                if (pc.s !== '') push(pc.s, false);
                continue;
              }
              if (!split) {
                push(pc.s, false);
                continue;
              }
              const parts = pc.s.split(/[ \t\n]+/);
              for (let q = 0; q < parts.length; q++) {
                if (q > 0) endField();
                if (parts[q] !== '') push(parts[q], false);
              }
            }
          }
        }
        endField();
        for (const f of fields) {
          const str = f.parts.map((p) => p.s).join('');
          if (doGlob && f.parts.some((p) => !p.lit && /[*?[]/.test(p.s))) {
            const pat = f.parts.map((p) => (p.lit ? p.s.replace(/[*?[\]\\]/g, '\\$&') : p.s)).join('');
            const m = this.glob(pat);
            if (m.length) {
              out.push(...m);
              continue;
            }
          }
          out.push(str);
        }
      }
      return out;
    }
    glob(pattern) {
      const absolute = pattern.startsWith('/');
      const wantDir = pattern.endsWith('/');
      const segs = pattern.split('/').filter(Boolean);
      const join = (b, n) => (b === '' ? n : b.endsWith('/') ? b + n : b + '/' + n);
      let results = [absolute ? '/' : ''];
      for (let si = 0; si < segs.length; si++) {
        const seg = segs[si];
        const last = si === segs.length - 1;
        const next = [];
        const meta = /(^|[^\\])[*?[]/.test(seg);
        for (const base of results) {
          if (!meta) {
            const lit = seg.replace(/\\(.)/g, '$1');
            const full = join(base, lit);
            if (this.fs.lookup(this.abs(full))) next.push(full);
            continue;
          }
          const d = this.fs.lookup(this.abs(base || '.'));
          if (!d || d.t !== 'd') continue;
          const re = globToRegex(seg);
          for (const name of Object.keys(d.kids).sort(cmpName)) {
            if (name.startsWith('.') && !seg.startsWith('.')) continue;
            if (!re.test(name)) continue;
            if (!last && d.kids[name].t !== 'd' && d.kids[name].t !== 'l') continue;
            next.push(join(base, name));
          }
        }
        results = next;
      }
      if (wantDir) return results.filter((r) => this.isDir(r)).map((r) => r + '/');
      return results;
    }

    /* --- running --- */
    checkAbort() {
      if (this.aborted) {
        const s = this.aborted;
        throw new AbortSig(s === true ? 'INT' : s);
      }
    }
    async waitMs(ms) {
      if (this.fast) return;
      const end = Date.now() + ms;
      while (Date.now() < end) {
        this.checkAbort();
        await new Promise((r) => setTimeout(r, Math.min(60, end - Date.now())));
      }
      this.checkAbort();
    }
    prompt() {
      const u = this.user;
      const home = this.users[u].home;
      let wd = this.cwd;
      if (wd === home) wd = '~';
      else if (wd.startsWith(home + '/')) wd = '~' + wd.slice(home.length);
      return `\x1b[01;32m${u}@${this.hostname || 'linux-school'}\x1b[00m:\x1b[01;34m${wd}\x1b[00m${u === 'root' ? '#' : '$'} `;
    }
    takeNotices() {
      const n = this.notices.join('');
      this.notices = [];
      return n;
    }
    isComplete(text) {
      try {
        LX.parse(text);
        return true;
      } catch (e) {
        if (e instanceof Incomplete) return false;
        return true;
      }
    }
    historyExpand(line) {
      if (!line.includes('!')) return line;
      let changed = false;
      const out = line.replace(/(^|[^\\'{])!(!|\$|-?\d+|[A-Za-z][^\s;|&]*)/g, (m, pre, tok) => {
        let rep = null;
        const h = this.history;
        if (tok === '!') rep = h[h.length - 1];
        else if (tok === '$') rep = ((h[h.length - 1] || '').trim().split(/\s+/).pop() || '');
        else if (/^-?\d+$/.test(tok)) rep = tok[0] === '-' ? h[h.length + +tok] : h[+tok - 1];
        else rep = [...h].reverse().find((x) => x.startsWith(tok));
        if (rep === undefined || rep === null) throw new CmdErr(`!${tok}: event not found`);
        changed = true;
        return pre + rep;
      });
      this.expandedFrom = changed ? out : null;
      return out;
    }
    /** Run one line typed at the prompt. io = {stdout, stderr} */
    async run(line, io) {
      this.aborted = false;
      this.loopGuard = 0;
      this.expandedFrom = null;
      const rec = { cmd: line, raw: line, out: '', err: '', all: '', code: 0 };
      let outCount = 0;
      const guard = (s) => {
        outCount += s.length;
        if (outCount > 150000) {
          this.aborted = true;
          this.checkAbort();
        }
      };
      const w = {
        stdin: null,
        tty: true,
        stdout: (s) => {
          rec.out += s;
          rec.all += s;
          guard(s);
          io.stdout(s);
        },
        stderr: (s) => {
          rec.err += s;
          rec.all += s;
          io.stderr(s);
        },
      };
      this.errSink = w.stderr;
      try {
        try {
          line = this.historyExpand(line);
        } catch (e) {
          if (e instanceof CmdErr) {
            w.stderr('bash: ' + e.message + '\n');
            rec.code = 1;
            this.status = 1;
            return rec;
          }
          throw e;
        }
        if (this.expandedFrom) w.stdout(line + '\n');
        if (line.trim()) this.history.push(line);
        rec.cmd = line;
        let st = await this.runSource(line, w);
        this.status = rec.code = st;
      } catch (e) {
        if (e instanceof AbortSig) {
          rec.code = this.status = e.sig === 'TSTP' ? 148 : 130;
        } else if (e instanceof RetSig) {
          w.stderr("bash: return: can only `return' from a function or sourced script\n");
          rec.code = this.status = 2;
        } else if (e instanceof LoopSig) {
          w.stderr("bash: break: only meaningful in a `for', `while', or `until' loop\n");
          rec.code = this.status = 0;
        } else if (e instanceof ExitSig) {
          if (this.userStack.length) {
            const prev = this.userStack.pop();
            if (prev.restore) prev.restore();
            this.user = prev.user;
            this.cwd = prev.cwd;
            w.stdout('exit\n');
          } else if (this.recovery && LX.recoveryExit) await LX.recoveryExit(this, w);
          else w.stdout('\x1b[2mlogout (this sandbox window stays open so you can keep practicing)\x1b[0m\n');
          rec.code = this.status = e.code;
        } else throw e;
      } finally {
        this.aborted = false;
        this._eu = null;
        if (this.psubFiles && this.psubFiles.length) {
          const fd = this.fs.lookup('/dev/fd');
          for (const f of this.psubFiles) if (fd) delete fd.kids[VFS.base(f)];
          this.psubFiles = [];
          this.psubSeq = 0;
        }
      }
      rec.out = LX.stripAnsi(rec.out);
      rec.all = LX.stripAnsi(rec.all);
      this.log.push(rec);
      this.last = rec;
      return rec;
    }
    async runSource(src, io) {
      let ast;
      try {
        ast = LX.parse(src);
      } catch (e) {
        if (e instanceof SyntaxErr) {
          io.stderr('bash: ' + e.message + '\n');
          return 2;
        }
        if (e instanceof Incomplete) {
          io.stderr('bash: syntax error: unexpected end of file\n');
          return 2;
        }
        throw e;
      }
      return await this.execList(ast, io);
    }
    async execList(list, io) {
      let st = this.status;
      for (const it of list.items) {
        this.checkAbort();
        if (it.bg) st = await this.execBg(it.node, io);
        else st = await this.execAndOr(it.node, io);
        this.status = st;
      }
      return st;
    }
    async cond(fn) {
      this.condDepth++;
      try {
        return await fn();
      } finally {
        this.condDepth--;
      }
    }
    async execAndOr(n, io) {
      const exempt = n.rest.length > 0;
      this.ignoredFail = false;
      let st = exempt ? await this.cond(() => this.execPipe(n.first, io)) : await this.execPipe(n.first, io);
      this.status = st;
      let last = !exempt;
      for (let k = 0; k < n.rest.length; k++) {
        const r = n.rest[k];
        if (r.op === '&&' ? st === 0 : st !== 0) {
          const isLast = k === n.rest.length - 1;
          st = isLast ? await this.execPipe(r.p, io) : await this.cond(() => this.execPipe(r.p, io));
          this.status = st;
          last = isLast;
        }
      }
      if (st !== 0 && last && this.condDepth === 0 && !this.ignoredFail && this.traps.ERR && !this.inErrTrap) {
        this.inErrTrap = true;
        try {
          await this.runSource(this.traps.ERR, io);
        } finally {
          this.inErrTrap = false;
        }
      }
      if (st !== 0 && last && this.opts.e && this.condDepth === 0 && !this.ignoredFail) throw new ExitSig(st);
      if (st !== 0 && !last) this.ignoredFail = true;
      else if (st === 0) this.ignoredFail = false;
      return st;
    }
    async execPipe(n, io) {
      if (n.cmds.length === 1) {
        const st = await this.execCmd(n.cmds[0], io);
        return n.neg ? (st ? 0 : 1) : st;
      }
      let input = io.stdin;
      let st = 0;
      const sts = [];
      for (let k = 0; k < n.cmds.length; k++) {
        const last = k === n.cmds.length - 1;
        let buf = '';
        const sub = { stdin: input, stdout: last ? io.stdout : (s) => (buf += s), stderr: io.stderr, tty: last ? io.tty : false };
        st = await this.execCmd(n.cmds[k], sub);
        sts.push(st);
        input = buf;
      }
      if (this.opts.pipefail) {
        const nz = [...sts].reverse().find((x) => x !== 0);
        if (nz !== undefined) st = nz;
      }
      return n.neg ? (st ? 0 : 1) : st;
    }
    async execBg(node, io) {
      const pipe = node.first;
      const only = !node.rest.length;
      const c0 = pipe.cmds[0];
      let words = [];
      if (c0.type === 'simple') for (const w of c0.words) words.push(...(await this.expandWord(w)));
      const src = pipe.src.trim();
      const id = this.nextJob++;
      const pid = this.nextPid++;
      const longJob = LX.bgLong ? LX.bgLong(words, src) : words[0] === 'sleep' && parseFloat(words[1]) >= 3 ? { proc: 'sleep ' + words[1], cpu: 0, memKiB: 0 } : null;
      if (only && longJob) {
        this.jobs.push({ id, pid, cmd: src, state: 'Running', proc: longJob.proc, cpu: longJob.cpu || 0, memKiB: longJob.memKiB || 0, nice: this.niceNext || 0 });
        if (LX.onBgStart) LX.onBgStart(this, this.jobs[this.jobs.length - 1], words);
        io.stdout(`[${id}] ${pid}\n`);
        return 0;
      }
      io.stdout(`[${id}] ${pid}\n`);
      const st = await this.execAndOr(node, io);
      this.notices.push(`[${id}]+  Done                    ${src}\n`);
      return 0 * st;
    }
    async applyRedirs(redirs, io) {
      let stdin = io.stdin;
      let out = io.stdout;
      let err = io.stderr;
      let tty = io.tty;
      for (const r of redirs) {
        if (r.v === '>&') {
          if (r.fd === 2 && r.to === 1) err = out;
          else if (r.fd === 1 && r.to === 2) {
            out = err;
            tty = false;
          }
          continue;
        }
        if (r.v === '<<') {
          stdin = r.hd.quoted ? r.hd.body : await this.scanJoin(r.hd.body);
          continue;
        }
        const target = (await this.expandWord(r.segs, { split: false, glob: false }))[0] || '';
        if (r.v === '<<<') {
          stdin = target + '\n';
          continue;
        }
        const abs = this.abs(target);
        try {
          if (r.v === '<') {
            stdin = this.readFile(abs);
            continue;
          }
          let w;
          if (abs === '/dev/null') w = () => {};
          else {
            if (r.v === '>' || r.v === '&>') this.writeFile(abs, '', false);
            else if (!this.fs.lookup(abs)) this.writeFile(abs, '', false);
            else if (this.fs.lookup(abs).t === 'd') throw new FsErr('EISDIR', abs);
            else if (this.fs.lookup(abs).attrs && this.fs.lookup(abs).attrs.includes('i')) throw new FsErr('EPERM', abs);
            else if (!this.can(this.fs.lookup(abs), 2)) throw new FsErr('EACCES', abs);
            w = (s) => this.writeFile(abs, s, true);
          }
          if (r.v === '&>') {
            out = w;
            err = w;
            tty = false;
          } else if (r.fd === 2) err = w;
          else {
            out = w;
            tty = false;
          }
        } catch (e) {
          if (e instanceof FsErr) throw new CmdErr(`${target}: ${FsErr.msg[e.code]}`);
          throw e;
        }
      }
      return { stdin, stdout: out, stderr: err, tty };
    }
    async execCmd(node, io) {
      try {
        let io2 = io;
        if (node.redirs && node.redirs.length) io2 = await this.applyRedirs(node.redirs, io);
        switch (node.type) {
          case 'simple':
            return await this.execSimple(node, io2);
          case 'if':
            for (const c of node.conds) {
              if ((await this.cond(() => this.execList(c.cond, io2))) === 0) return await this.execList(c.body, io2);
            }
            return node.els ? await this.execList(node.els, io2) : 0;
          case 'for': {
            let items;
            if (node.words === null) items = (this.argStack[this.argStack.length - 1] || { args: [] }).args;
            else {
              items = [];
              for (const w of node.words) items.push(...(await this.expandWord(w)));
            }
            let st = 0;
            for (const it of items) {
              this.checkAbort();
              if (++this.loopGuard > (this.loopMax || 3000)) this.tripLoop();
              this.setVar(node.name, it);
              try {
                st = await this.execList(node.body, io2);
              } catch (e) {
                if (e instanceof LoopSig) {
                  if (e.n > 1) {
                    e.n--;
                    throw e;
                  }
                  if (e.kind === 'break') break;
                  continue;
                }
                throw e;
              }
            }
            return st;
          }
          case 'while': {
            let st = 0;
            for (;;) {
              this.checkAbort();
              if (++this.loopGuard > (this.loopMax || 3000)) this.tripLoop();
              const c = await this.cond(() => this.execList(node.cond, io2));
              if (node.until ? c === 0 : c !== 0) break;
              try {
                st = await this.execList(node.body, io2);
              } catch (e) {
                if (e instanceof LoopSig) {
                  if (e.n > 1) {
                    e.n--;
                    throw e;
                  }
                  if (e.kind === 'break') break;
                  continue;
                }
                throw e;
              }
              if (!this.fast) await new Promise((r) => setTimeout(r, 0));
            }
            return st;
          }
          case 'arith': {
            const v = this.arithAssign(node.expr);
            return Number(v) !== 0 ? 0 : 1;
          }
          case 'dbl': {
            const args = [];
            const globs = [];
            for (const a of node.args) {
              args.push((await this.expandWord(a, { split: false, glob: false }))[0] ?? '');
              globs.push(a.some((g) => g.q === 'n' && /[*?[]/.test(g.s)));
            }
            try {
              return LX.evalTest(this, args, true, globs) ? 0 : 1;
            } catch (e) {
              if (e instanceof CmdErr) {
                io.stderr('bash: [[: ' + e.message + '\n');
                return 2;
              }
              throw e;
            }
          }
          case 'case': {
            const w = (await this.expandWord(node.word, { split: false, glob: false }))[0] ?? '';
            for (const cl of node.clauses) {
              for (const ps of cl.pats) {
                let pat = '';
                for (const sg of ps) {
                  const part = (await this.expandWord([sg], { split: false, glob: false }))[0] ?? '';
                  pat += sg.q === 'n' ? part : part.replace(/[*?[\]\\]/g, '\\$&');
                }
                if (globToRegex(pat).test(w)) return await this.execList(cl.body, io2);
              }
            }
            return 0;
          }
          case 'cfor': {
            const [init, cnd, step] = node.expr.split(';').map((x) => x.trim());
            if (init) this.arithAssign(init);
            let st = 0;
            for (;;) {
              this.checkAbort();
              if (++this.loopGuard > (this.loopMax || 3000)) this.tripLoop();
              if (cnd && Number(this.arithAssign(cnd)) === 0) break;
              try {
                st = await this.execList(node.body, io2);
              } catch (e) {
                if (e instanceof LoopSig) {
                  if (e.n > 1) {
                    e.n--;
                    throw e;
                  }
                  if (e.kind === 'break') break;
                } else throw e;
              }
              if (step) this.arithAssign(step);
            }
            return st;
          }
          case 'group': {
            if (!node.sub) return await this.execList(node.body, io2);
            const sn = this.snap();
            try {
              return await this.execList(node.body, io2);
            } finally {
              this.restoreSnap(sn);
            }
          }
          case 'func':
            this.funcs[node.name] = node.body;
            return 0;
        }
        return 0;
      } catch (e) {
        if (e instanceof CmdErr) {
          io.stderr('bash: ' + e.message + '\n');
          return 1;
        }
        throw e;
      }
    }
    async execSimple(node, io) {
      this.checkAbort();
      if (node.ln) this.vars.LINENO = String(node.ln);
      let argv = [];
      for (const w of node.words) argv.push(...(await this.expandWord(w)));
      const assigns = [];
      const ops = [];
      for (const a of node.assigns) {
        if (a.arr) {
          const items = [];
          for (const w of a.arr) items.push(...(await this.expandWord(w)));
          ops.push({ a, items });
        } else {
          const v = (await this.expandWord(a.segs, { split: false, glob: false }))[0] || '';
          const o2 = { a, v };
          if (a.idx !== undefined && this.assoc.has(a.name)) o2.idxExp = await this.scanJoin(a.idx);
          ops.push(o2);
          if (!a.idx && !a.append) assigns.push([a.name, v]);
        }
      }
      if (argv.length === 0) {
        for (const o of ops) this.applyAssign(o);
        if (node.redirs.length) await this.applyRedirs(node.redirs, io);
        return 0;
      }
      if (this.opts.x) io.stderr('+ ' + argv.join(' ') + '\n');
      const w0 = node.words[0];
      if (w0 && w0.length === 1 && w0[0].q === 'n' && this.aliases[argv[0]]) {
        const exp = [];
        for (const t of tokenize(this.aliases[argv[0]]).filter((t) => t.t === 'w')) exp.push(...(await this.expandWord(t.segs)));
        argv = exp.concat(argv.slice(1));
      }
      const saved = assigns.map(([k]) => [k, this.vars[k]]);
      for (const [k, v] of assigns) this.vars[k] = v;
      try {
        const io2 = node.redirs.length ? await this.applyRedirs(node.redirs, io) : io;
        return await this.dispatch(argv, io2);
      } finally {
        for (const [k, v] of saved) {
          if (v === undefined) delete this.vars[k];
          else this.vars[k] = v;
        }
      }
    }
    hasBinary(name) {
      for (const d of (this.vars.PATH || '').split(':')) {
        if (!d) continue;
        const n = this.fs.lookup(this.abs(d + '/' + name));
        if (n && n.t === 'f') return true;
      }
      return false;
    }
    async dispatch(argv, io) {
      const name = argv[0];
      const args = argv.slice(1);
      this.checkAbort();
      if (name === undefined) return 0;
      if (this.funcs[name]) return await this.callFunc(name, args, io);
      const def = LX.cmds[name];
      if (def && !name.includes('/')) {
        if (def.builtin || (!def.pkg || this.installed.has(def.pkg)) && this.hasBinary(name)) return await this.invoke(def, name, args, io);
        if (def.pkg && !this.installed.has(def.pkg)) {
          io.stderr(`Command '${name}' not found, but can be installed with:\n\nsudo apt install ${def.pkg}\n\n`);
          return 127;
        }
        io.stderr(`bash: ${name}: command not found\n`);
        return 127;
      }
      if (name.includes('/')) return await this.execPath(name, args, io);
      if (this.hasBinary(name)) {
        for (const d of this.vars.PATH.split(':')) {
          const n = this.fs.lookup(this.abs(d + '/' + name));
          if (n && n.t === 'f') return await this.execNode(n, name, args, io);
        }
      }
      io.stderr(`${name}: command not found\n`);
      return 127;
    }
    async invoke(def, name, args, io) {
      const sh = this;
      LX.curSh = this;
      const c = {
        sh,
        name,
        args,
        stdin: io.stdin,
        tty: !!io.tty,
        io,
        out: (s) => io.stdout(s),
        err: (s) => io.stderr(s),
        abs: (p) => sh.abs(p),
        async slurp() {
          if (io.stdin !== null && io.stdin !== undefined) return io.stdin;
          let buf = '';
          for (;;) {
            sh.checkAbort();
            const l = sh.hooks.readLine ? await sh.hooks.readLine('') : null;
            if (l === null || l === undefined) break;
            buf += l + '\n';
          }
          sh.checkAbort();
          return buf;
        },
      };
      if (args[0] === '--help' && LX.HELP && LX.HELP[name] && !['echo', 'printf', 'test', '[', '[['].includes(name)) {
        io.stdout(LX.helpText(name));
        return 0;
      }
      try {
        const r = await def.run(c, args);
        return typeof r === 'number' ? r : 0;
      } catch (e) {
        if (e instanceof FsErr) {
          io.stderr(`${name}: ${e.path}: ${FsErr.msg[e.code]}\n`);
          return 1;
        }
        throw e;
      }
    }
    async execPath(name, args, io) {
      const abs = this.abs(name);
      const n = this.fs.lookup(abs);
      if (!n) {
        io.stderr(`bash: ${name}: No such file or directory\n`);
        return 127;
      }
      if (n.t === 'd') {
        io.stderr(`bash: ${name}: Is a directory\n`);
        return 126;
      }
      return await this.execNode(n, name, args, io);
    }
    async execNode(n, name, args, io) {
      if (!this.can(n, 1) || n.t !== 'f') {
        io.stderr(`bash: ${name}: Permission denied\n`);
        return 126;
      }
      if (n.exe && LX.cmds[n.exe]) return await this.invoke(LX.cmds[n.exe], n.exe, args, io);
      if (n.bin || n.archive) {
        io.stderr(`bash: ${name}: cannot execute binary file: Exec format error\n`);
        return 126;
      }
      return await this.runScript(n.content || '', args, io, name);
    }
    snap() {
      return { vars: { ...this.vars }, arrays: JSON.parse(JSON.stringify(this.arrays)), assoc: new Set(this.assoc), funcs: { ...this.funcs }, cwd: this.cwd, opts: { ...this.opts }, traps: { ...this.traps }, aliases: { ...this.aliases }, exported: new Set(this.exported), readonly: this.readonly ? new Set(this.readonly) : null };
    }
    restoreSnap(s) {
      Object.assign(this, s);
    }
    async runScript(text, args, io, name, keep) {
      if (keep) return await this.runScriptInner(text, args, io, name);
      const s = this.snap();
      try {
        return await this.runScriptInner(text, args, io, name);
      } finally {
        this.restoreSnap(s);
      }
    }
    async runScriptInner(text, args, io, name) {
      this.argStack.push({ args, name });
      this.vars.OPTIND = '1';
      this._optsub = 1;
      try {
        let ast;
        try {
          ast = LX.parse(text.replace(/^#!.*\n/, '\n'));
        } catch (e) {
          if (e instanceof SyntaxErr || e instanceof Incomplete) {
            io.stderr(`${name}: ${e instanceof Incomplete ? 'syntax error: unexpected end of file' : e.message}\n`);
            return 2;
          }
          throw e;
        }
        return await this.execList(ast, io);
      } catch (e) {
        if (e instanceof ExitSig) return e.code;
        throw e;
      } finally {
        if (this.traps.EXIT) {
          const t = this.traps.EXIT;
          delete this.traps.EXIT;
          try {
            await this.runSource(t, io);
          } catch (e2) {
            if (!(e2 instanceof ExitSig)) throw e2;
          }
        }
        this.argStack.pop();
      }
    }
    async callFunc(name, args, io) {
      this.argStack.push({ args, name, func: true });
      this.localStack.push({});
      try {
        return await this.execCmd(this.funcs[name], io);
      } catch (e) {
        if (e instanceof RetSig) return e.code;
        throw e;
      } finally {
        this.argStack.pop();
        this.localStack.pop();
      }
    }
    tripLoop() {
      if (this.loopMax) throw new DaemonLoop('daemon');
      throw new CmdErr('loop limit reached (sandbox safety stop). Real shells would keep going; press Ctrl+C there!');
    }
    /** Run argv and capture output (used by xargs, find -exec, ...) */
    async runCapture(argv, stdin) {
      let out = '';
      let err = '';
      const io = { stdin: stdin === undefined ? '' : stdin, stdout: (s) => (out += s), stderr: (s) => (err += s), tty: false };
      let code;
      try {
        code = await this.dispatch(argv, io);
      } catch (e) {
        if (e instanceof DaemonLoop) return { out, err, code: 0, daemon: true };
        throw e;
      }
      return { out, err, code };
    }

    /* --- tab completion --- */
    completions(line) {
      const m = /([^\s|;&()]*)$/.exec(line);
      const word = m[1];
      const start = line.length - word.length;
      const before = line.slice(0, start);
      const cmdPos = /^\s*$/.test(before) || /[|;&(]\s*$/.test(before);
      let opts = [];
      if (cmdPos && !word.includes('/')) {
        const set = new Set([...Object.keys(this.aliases), ...Object.keys(this.funcs)]);
        for (const [n, d] of Object.entries(LX.cmds)) if (d.builtin || (!d.pkg || this.installed.has(d.pkg))) set.add(n);
        ['if', 'for', 'while', 'then', 'fi', 'do', 'done'].forEach((k) => set.add(k));
        opts = [...set].filter((n) => n.startsWith(word) && !/^[[.:]/.test(n)).sort();
        if (opts.length === 1) opts[0] += ' ';
        return { start, options: opts };
      }
      const slash = word.lastIndexOf('/');
      const dirPart = word.slice(0, slash + 1);
      const base = word.slice(slash + 1);
      const d = this.stat(dirPart || '.');
      if (d && d.t === 'd') {
        const dirsOnly = /(^|\s)cd\s+[^\s]*$/.test(before + word);
        for (const k of Object.keys(d.kids).sort(cmpName)) {
          if (!k.startsWith(base)) continue;
          if (k.startsWith('.') && !base.startsWith('.')) continue;
          const kid = d.kids[k];
          const isD = kid.t === 'd' || (kid.t === 'l' && this.isDir((dirPart || './') + k));
          if (dirsOnly && !isD) continue;
          opts.push(dirPart + k.replace(/ /g, '\\ ') + (isD ? '/' : ' '));
        }
      }
      return { start, options: opts };
    }
  }
  LX.Shell = Shell;
})();
