/* Linux Academy: a small Python 3 interpreter (subset), venv and pip */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS } = LX;
  const U = LX.U;
  const P = LX.Shell.prototype;

  /* ---------- value model ---------- */
  class F { constructor(v) { this.v = v; } }
  class PyErr extends Error { constructor(type, msg) { super(msg); this.pytype = type; this.pymsg = msg === undefined ? '' : msg; } }
  class Ret { constructor(v) { this.v = v; } }
  class Brk {}
  class Cont {}
  class PyExit { constructor(code) { this.code = code; } }
  class Tuple extends Array {}
  const tup = (a) => { const t = new Tuple(); a.forEach((x) => t.push(x)); return t; };
  class PyFunc { constructor(name, params, body, closure) { this.name = name; this.params = params; this.body = body; this.closure = closure; } }
  class PyClass { constructor(name, bases, attrs) { this.name = name; this.bases = bases; this.attrs = attrs; } }
  class PyInst { constructor(cls) { this.cls = cls; this.attrs = new Map(); } }
  class PyIterator { constructor(list) { this.list = list; this.pos = 0; } }
  class PyProp { constructor(fget) { this.fget = fget; this.fset = null; } }
  class PyStatic { constructor(fn) { this.fn = fn; } }
  class PyCM { constructor(fn) { this.fn = fn; } }
  class Bound { constructor(fn, self) { this.fn = fn; this.self = self; } }
  class Mod { constructor(name, attrs) { this.name = name; this.attrs = attrs; } }
  const bi = (fn, name) => { fn.__bi = true; fn.pyname = name; return fn; };
  const isF = (x) => x instanceof F;
  const isInt = (x) => typeof x === 'number';
  const nv = (x) => (isF(x) ? x.v : typeof x === 'boolean' ? (x ? 1 : 0) : x);
  const isNum = (x) => typeof x === 'number' || isF(x) || typeof x === 'boolean';
  const E = (t, m) => new PyErr(t, m);
  const typeName = (x) => (x === null ? 'NoneType' : typeof x === 'boolean' ? 'bool' : isInt(x) ? 'int' : isF(x) ? 'float' : typeof x === 'string' ? 'str' : x instanceof Tuple ? 'tuple' : Array.isArray(x) ? 'list' : x instanceof Map ? 'dict' : x instanceof Set ? 'set' : x instanceof PyInst ? x.cls.name : x instanceof PyFunc || x && x.__bi ? 'function' : x instanceof PyClass ? 'type' : x instanceof Mod ? 'module' : 'object');

  const fmtFloat = (v) => {
    if (Number.isNaN(v)) return 'nan';
    if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
    if (Number.isInteger(v) && Math.abs(v) < 1e16) return v.toFixed(1);
    let s = String(v);
    const m = /^(-?[\d.]+)e([+-])(\d+)$/.exec(s);
    if (m) s = m[1] + 'e' + m[2] + (m[3].length < 2 ? '0' + m[3] : m[3]);
    return s;
  };
  const reprStr = (s) => {
    const q = s.includes("'") && !s.includes('"') ? '"' : "'";
    return q + s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r').split(q).join('\\' + q) + q;
  };
  let CALL = null; // set by interpreter: async call(fn,args,kw)
  async function repr(x) {
    if (x === null || x === undefined) return 'None';
    if (x === true) return 'True';
    if (x === false) return 'False';
    if (isInt(x)) return String(x);
    if (isF(x)) return fmtFloat(x.v);
    if (typeof x === 'string') return reprStr(x);
    if (x instanceof Tuple) return x.length === 1 ? '(' + (await repr(x[0])) + ',)' : '(' + (await Promise.all(x.map(repr))).join(', ') + ')';
    if (Array.isArray(x)) return '[' + (await Promise.all(x.map(repr))).join(', ') + ']';
    if (x instanceof Map) return '{' + (await Promise.all([...x].map(async ([k, v]) => (await repr(k)) + ': ' + (await repr(v))))).join(', ') + '}';
    if (x instanceof Set) return x.size ? '{' + (await Promise.all([...x].map(repr))).join(', ') + '}' : 'set()';
    if (x instanceof PyInst) {
      const r = findAttr(x.cls, '__repr__');
      if (r) return await CALL(new Bound(r, x), [], []);
      return `<__main__.${x.cls.name} object at 0x7f3a1c2b5d90>`;
    }
    if (x instanceof PyFunc) return `<function ${x.name} at 0x7f3a1c2b5e50>`;
    if (x instanceof PyClass) return `<class '__main__.${x.name}'>`;
    if (x instanceof Mod) return `<module '${x.name}'>`;
    if (x && x.pyrepr) return x.pyrepr;
    if (x && x.__bi) return `<built-in function ${x.pyname || 'fn'}>`;
    return String(x);
  }
  async function str(x) {
    if (typeof x === 'string') return x;
    if (x instanceof PyInst) {
      const s = findAttr(x.cls, '__str__');
      if (s) return await CALL(new Bound(s, x), [], []);
      if (x.attrs.has('args')) { const a = x.attrs.get('args'); return a.length === 1 ? await str(a[0]) : a.length ? await repr(a) : ''; }
    }
    if (x instanceof PyErr) return x.pymsg;
    return await repr(x);
  }
  const findAttr = (cls, n) => {
    if (cls.attrs.has(n)) return cls.attrs.get(n);
    for (const b of cls.bases) {
      const r = findAttr(b, n);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  const truthy = (x) => !(x === null || x === undefined || x === false || x === 0 || x === '' || (isF(x) && x.v === 0) || (Array.isArray(x) && !x.length) || ((x instanceof Map || x instanceof Set) && !x.size));
  const eq = (a, b) => {
    if (isNum(a) && isNum(b)) return nv(a) === nv(b);
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => eq(x, b[i])) && (a instanceof Tuple) === (b instanceof Tuple);
    if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([k, v]) => b.has(k) && eq(v, b.get(k)));
    if (a instanceof Set && b instanceof Set) return a.size === b.size && [...a].every((x) => b.has(x));
    return a === b;
  };
  const cmpv = (a, b) => {
    if (isNum(a) && isNum(b)) return nv(a) - nv(b);
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const c = cmpv(a[i], b[i]);
        if (c) return c;
      }
      return a.length - b.length;
    }
    throw E('TypeError', `'<' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`);
  };
  const hkey = (k) => (k instanceof Tuple ? 'T' + JSON.stringify(k) : k);
  const mkMap = (pairs) => new Map(pairs);

  /* ---------- lexer ---------- */
  const OPS = ['**=', '//=', '>>=', '<<=', '...', '==', '!=', '<=', '>=', '->', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '//', '<<', '>>', ':=', '+', '-', '*', '/', '%', '&', '|', '^', '~', '<', '>', '(', ')', '[', ']', '{', '}', ',', ':', '.', ';', '=', '@'];
  function unescape(s) {
    return s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[\\'"abfnrtv0\n])/g, (m, e) => {
      if (e[0] === 'x' || e[0] === 'u') return String.fromCharCode(parseInt(e.slice(1), 16));
      return { '\\': '\\', "'": "'", '"': '"', a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', 0: '\0', '\n': '' }[e];
    });
  }
  function lex(src) {
    const T = [];
    let i = 0;
    let line = 1;
    let depth = 0;
    let bol = true;
    const ind = [0];
    const n = src.length;
    const push = (t, v, x) => T.push(Object.assign({ t, v, line }, x));
    while (i < n) {
      if (bol && depth === 0) {
        let j = i;
        let col = 0;
        while (j < n && (src[j] === ' ' || src[j] === '\t')) col += src[j++] === '\t' ? 8 : 1;
        if (j >= n) break;
        if (src[j] === '\n' || src[j] === '#' || src[j] === '\r') {
          while (j < n && src[j] !== '\n') j++;
          i = j + 1;
          line++;
          continue;
        }
        i = j;
        if (col > ind[ind.length - 1]) {
          ind.push(col);
          push('INDENT');
        } else {
          while (col < ind[ind.length - 1]) {
            ind.pop();
            push('DEDENT');
          }
          if (col !== ind[ind.length - 1]) throw E('IndentationError', 'unindent does not match any outer indentation level');
        }
        bol = false;
      }
      const ch = src[i];
      if (ch === '\n') {
        if (depth === 0) {
          push('NL');
          bol = true;
        }
        line++;
        i++;
        continue;
      }
      if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
      if (ch === '#') { while (i < n && src[i] !== '\n') i++; continue; }
      if (ch === '\\' && src[i + 1] === '\n') { i += 2; line++; continue; }
      const sm = /^([rRbBfFuU]{0,2})('''|"""|'|")/.exec(src.slice(i, i + 5));
      if (sm) {
        const pre = sm[1].toLowerCase();
        const q = sm[2];
        let j = i + sm[0].length;
        let body = '';
        for (;;) {
          if (j >= n) throw E('SyntaxError', 'unterminated string literal');
          if (src.startsWith(q, j)) { j += q.length; break; }
          if (src[j] === '\\' && !pre.includes('r')) { body += src[j] + src[j + 1]; j += 2; continue; }
          if (src[j] === '\n') { if (q.length === 1) throw E('SyntaxError', `unterminated string literal (detected at line ${line})`); line++; }
          body += src[j++];
        }
        push('STR', pre.includes('r') ? body : unescape(body), { f: pre.includes('f') });
        i = j;
        continue;
      }
      const nm = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)/.exec(src.slice(i, i + 40));
      if (nm && (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] || '')))) {
        const s = nm[1].replace(/_/g, '');
        push('NUM', /^0[xXbBoO]/.test(s) ? parseInt(s.slice(2), { x: 16, b: 2, o: 8 }[s[1].toLowerCase()]) : /[.eE]/.test(s) ? new F(parseFloat(s)) : parseInt(s, 10));
        i += nm[1].length;
        continue;
      }
      const id = /^[A-Za-z_ -￿][\w -￿]*/.exec(src.slice(i, i + 80));
      if (id) { push('NAME', id[0]); i += id[0].length; continue; }
      const op = OPS.find((o) => src.startsWith(o, i));
      if (!op) throw E('SyntaxError', `invalid character '${ch}'`);
      if ('([{'.includes(op)) depth++;
      if (')]}'.includes(op)) depth--;
      push('OP', op);
      i += op.length;
    }
    if (T.length && T[T.length - 1].t !== 'NL') push('NL');
    while (ind.length > 1) { ind.pop(); push('DEDENT'); }
    push('EOF');
    return T;
  }

  /* ---------- parser ---------- */
  const KW = new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']);
  function parse(src) {
    const T = lex(src);
    let p = 0;
    const peek = () => T[p];
    const syn = (m) => E('SyntaxError', m || 'invalid syntax');
    const isOp = (v) => T[p].t === 'OP' && T[p].v === v;
    const isKw = (v) => T[p].t === 'NAME' && T[p].v === v;
    const eatOp = (v) => (isOp(v) ? (p++, true) : false);
    const eatKw = (v) => (isKw(v) ? (p++, true) : false);
    const needOp = (v) => { if (!eatOp(v)) throw syn(); };
    const needKw = (v) => { if (!eatKw(v)) throw syn(); };
    const name = () => { if (T[p].t !== 'NAME' || KW.has(T[p].v)) throw syn(); return T[p++].v; };

    function block() {
      needOp(':');
      if (T[p].t !== 'NL') {
        const s = simpleLine();
        return s;
      }
      p++;
      if (T[p].t !== 'INDENT') throw E('IndentationError', 'expected an indented block');
      p++;
      const out = [];
      while (T[p].t !== 'DEDENT' && T[p].t !== 'EOF') out.push(...stmt());
      if (T[p].t === 'DEDENT') p++;
      return out;
    }
    function simpleLine() {
      const out = [simple()];
      while (eatOp(';')) { if (T[p].t === 'NL') break; out.push(simple()); }
      if (T[p].t === 'NL') p++;
      else if (T[p].t !== 'EOF') throw syn();
      return out;
    }
    function stmt() {
      const t = T[p];
      const line = t.line;
      if (t.t === 'OP' && t.v === '@') {
        const decs = [];
        while (isOp('@')) { p++; decs.push(expr()); if (T[p].t === 'NL') p++; }
        const inner = stmt();
        return [{ k: 'decorated', decs, inner: inner[0], line }];
      }
      if (t.t === 'NAME') {
        switch (t.v) {
          case 'if': {
            p++;
            const tests = [];
            const c = expr();
            tests.push([c, block()]);
            let orelse = [];
            for (;;) {
              if (isKw('elif')) { p++; const c2 = expr(); tests.push([c2, block()]); } else if (isKw('else')) { p++; orelse = block(); break; } else break;
            }
            return [{ k: 'if', tests, orelse, line }];
          }
          case 'while': { p++; const cond = expr(); const body = block(); let orelse = []; if (eatKw('else')) orelse = block(); return [{ k: 'while', cond, body, orelse, line }]; }
          case 'for': { p++; const target = targetList(); needKw('in'); const iter = exprList(); const body = block(); let orelse = []; if (eatKw('else')) orelse = block(); return [{ k: 'for', target, iter, body, orelse, line }]; }
          case 'def': {
            p++;
            const nm = name();
            needOp('(');
            const params = parseParams(')');
            needOp(')');
            if (eatOp('->')) expr();
            return [{ k: 'def', name: nm, params, body: block(), line }];
          }
          case 'class': {
            p++;
            const nm = name();
            let bases = [];
            if (eatOp('(')) { while (!isOp(')')) { bases.push(expr()); if (!eatOp(',')) break; } needOp(')'); }
            return [{ k: 'class', name: nm, bases, body: block(), line }];
          }
          case 'try': {
            p++;
            const body = block();
            const handlers = [];
            let orelse = [];
            let fin = [];
            while (isKw('except')) {
              p++;
              let type = null;
              let nm = null;
              if (!isOp(':')) { type = expr(); if (eatKw('as')) nm = name(); }
              handlers.push({ type, name: nm, body: block() });
            }
            if (eatKw('else')) orelse = block();
            if (eatKw('finally')) fin = block();
            if (!handlers.length && !fin.length) throw syn("expected 'except' or 'finally' block");
            return [{ k: 'try', body, handlers, orelse, fin, line }];
          }
          case 'with': {
            p++;
            const items = [];
            do {
              const e = expr();
              let tg = null;
              if (eatKw('as')) tg = targetOne();
              items.push([e, tg]);
            } while (eatOp(','));
            return [{ k: 'with', items, body: block(), line }];
          }
        }
      }
      if (t.t === 'INDENT') throw E('IndentationError', 'unexpected indent');
      return simpleLine();
    }
    function parseParams(end) {
      const params = [];
      while (!isOp(end)) {
        if (eatOp('**')) params.push({ name: name(), kw: true });
        else if (eatOp('*')) { if (isOp(',')) { p++; continue; } params.push({ name: name(), star: true }); }
        else {
          const nm = name();
          if (end === ')' && eatOp(':')) expr();
          let d;
          if (eatOp('=')) d = exprNoTuple();
          params.push({ name: nm, def: d });
        }
        if (!eatOp(',')) break;
      }
      return params;
    }
    function targetOne() { return postfix(); }
    function targetList() {
      const first = bitor();
      if (isOp(',')) { const items = [first]; while (eatOp(',')) { if (isKw('in')) break; items.push(bitor()); } return { k: 'tuple', items }; }
      return first;
    }
    function simple() {
      const t = T[p];
      const line = t.line;
      if (t.t === 'NAME') {
        switch (t.v) {
          case 'pass': p++; return { k: 'pass', line };
          case 'break': p++; return { k: 'break', line };
          case 'continue': p++; return { k: 'continue', line };
          case 'return': { p++; let v = null; if (T[p].t !== 'NL' && !isOp(';')) v = exprList(); return { k: 'return', v, line }; }
          case 'raise': { p++; let e = null; if (T[p].t !== 'NL') e = expr(); if (eatKw('from')) expr(); return { k: 'raise', e, line }; }
          case 'global': case 'nonlocal': { p++; const names = [name()]; while (eatOp(',')) names.push(name()); return { k: 'global', names, line }; }
          case 'assert': { p++; const c = expr(); let m = null; if (eatOp(',')) m = expr(); return { k: 'assert', c, m, line }; }
          case 'del': { p++; const ts = [postfix()]; while (eatOp(',')) ts.push(postfix()); return { k: 'del', ts, line }; }
          case 'import': {
            p++;
            const names = [];
            do { let m = name(); while (eatOp('.')) m += '.' + name(); let al = null; if (eatKw('as')) al = name(); names.push([m, al]); } while (eatOp(','));
            return { k: 'import', names, line };
          }
          case 'from': {
            p++;
            let m = name();
            while (eatOp('.')) m += '.' + name();
            needKw('import');
            const names = [];
            const par = eatOp('(');
            if (eatOp('*')) names.push(['*', null]);
            else do { const nm = name(); let al = null; if (eatKw('as')) al = name(); names.push([nm, al]); } while (eatOp(',') && !(par && isOp(')')));
            if (par) needOp(')');
            return { k: 'from', mod: m, names, line };
          }
        }
      }
      const e = exprList();
      if (isOp('=')) {
        const targets = [e];
        let value;
        while (eatOp('=')) { value = exprList(); if (isOp('=')) targets.push(value); }
        return { k: 'assign', targets, value, line };
      }
      const aug = T[p].t === 'OP' && /^(\*\*|\/\/|>>|<<|[-+*/%&|^@])=$/.exec(T[p].v);
      if (aug) { p++; return { k: 'aug', op: aug[1], target: e, value: exprList(), line }; }
      if (isOp(':') && e.k === 'name') { p++; expr(); let v = null; if (eatOp('=')) v = exprList(); return v ? { k: 'assign', targets: [e], value: v, line } : { k: 'pass', line }; }
      return { k: 'expr', e, line };
    }
    function exprList() {
      const first = starOr();
      if (isOp(',')) {
        const items = [first];
        while (eatOp(',')) { if (endOfList()) break; items.push(starOr()); }
        return { k: 'tuple', items };
      }
      return first;
    }
    const endOfList = () => T[p].t === 'NL' || T[p].t === 'EOF' || (T[p].t === 'OP' && [')', ']', '}', '=', ':', ';'].includes(T[p].v)) || (T[p].t === 'NAME' && T[p].v === 'in');
    function starOr() { if (eatOp('*')) return { k: 'star', e: bitor() }; return expr(); }
    const exprNoTuple = () => expr();
    function expr() {
      if (isKw('lambda')) {
        p++;
        const params = parseParams(':');
        needOp(':');
        return { k: 'lambda', params, body: expr() };
      }
      const e = orTest();
      if (isKw('if')) {
        p++;
        const test = orTest();
        needKw('else');
        return { k: 'ifexp', test, body: e, orelse: expr() };
      }
      if (isOp(':=') && e.k === 'name') { p++; return { k: 'walrus', name: e.id, e: expr() }; }
      return e;
    }
    function orTest() { let l = andTest(); while (isKw('or')) { p++; l = { k: 'bool', op: 'or', l, r: andTest() }; } return l; }
    function andTest() { let l = notTest(); while (isKw('and')) { p++; l = { k: 'bool', op: 'and', l, r: notTest() }; } return l; }
    function notTest() { if (isKw('not')) { p++; return { k: 'unary', op: 'not', e: notTest() }; } return comparison(); }
    function comparison() {
      const first = bitor();
      const ops = [];
      for (;;) {
        let op = null;
        if (T[p].t === 'OP' && ['==', '!=', '<', '>', '<=', '>='].includes(T[p].v)) op = T[p++].v;
        else if (isKw('in')) { p++; op = 'in'; }
        else if (isKw('not') && T[p + 1].t === 'NAME' && T[p + 1].v === 'in') { p += 2; op = 'not in'; }
        else if (isKw('is')) { p++; op = eatKw('not') ? 'is not' : 'is'; }
        if (!op) break;
        ops.push([op, bitor()]);
      }
      return ops.length ? { k: 'cmp', first, ops } : first;
    }
    const binLevel = (next, ops) => () => {
      let l = next();
      while (T[p].t === 'OP' && ops.includes(T[p].v)) { const op = T[p++].v; l = { k: 'bin', op, l, r: next() }; }
      return l;
    };
    function unary() {
      if (T[p].t === 'OP' && ['-', '+', '~'].includes(T[p].v)) { const op = T[p++].v; return { k: 'unary', op, e: unary() }; }
      return power();
    }
    function power() {
      const b = postfix();
      if (eatOp('**')) return { k: 'bin', op: '**', l: b, r: unary() };
      return b;
    }
    const term = binLevel(unary, ['*', '/', '//', '%', '@']);
    const arith = binLevel(term, ['+', '-']);
    const shift = binLevel(arith, ['<<', '>>']);
    const bitand = binLevel(shift, ['&']);
    const bitxor = binLevel(bitand, ['^']);
    function bitor() { let l = bitxor(); while (isOp('|')) { p++; l = { k: 'bin', op: '|', l, r: bitxor() }; } return l; }
    function postfix() {
      let e = atom();
      for (;;) {
        if (eatOp('.')) e = { k: 'attr', e, name: T[p++].v };
        else if (isOp('(')) {
          p++;
          const args = [];
          const kwargs = [];
          while (!isOp(')')) {
            if (eatOp('**')) kwargs.push([null, expr()]);
            else if (eatOp('*')) args.push({ k: 'star', e: expr() });
            else if (T[p].t === 'NAME' && T[p + 1].t === 'OP' && T[p + 1].v === '=' ) { const nm = T[p].v; p += 2; kwargs.push([nm, expr()]); }
            else {
              const a = expr();
              if (isKw('for')) args.push({ k: 'gen', elt: a, gens: compFor() });
              else args.push(a);
            }
            if (!eatOp(',')) break;
          }
          needOp(')');
          e = { k: 'call', fn: e, args, kwargs, line: T[p - 1].line };
        } else if (isOp('[')) {
          p++;
          const parts = [];
          do {
            if (isOp(']')) break;
            let lo = null;
            let hi = null;
            let step = null;
            let slice = false;
            if (!isOp(':')) lo = expr();
            if (eatOp(':')) { slice = true; if (!isOp(':') && !isOp(']') && !isOp(',')) hi = expr(); if (eatOp(':')) { if (!isOp(']')) step = expr(); } }
            parts.push(slice ? { k: 'slice', lo, hi, step } : lo);
          } while (eatOp(','));
          needOp(']');
          e = { k: 'sub', e, idx: parts.length === 1 ? parts[0] : { k: 'tuple', items: parts } };
        } else break;
      }
      return e;
    }
    function compFor() {
      const gens = [];
      while (isKw('for')) {
        p++;
        const target = targetList();
        needKw('in');
        const iter = orTest();
        const ifs = [];
        while (isKw('if')) { p++; ifs.push(orTest()); }
        gens.push({ target, iter, ifs });
      }
      return gens;
    }
    function fstring(s) {
      const parts = [];
      let lit = '';
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '{') {
          if (s[i + 1] === '{') { lit += '{'; i++; continue; }
          let d = 1;
          let j = i + 1;
          let q = null;
          while (j < s.length && d) {
            const c2 = s[j];
            if (q) { if (c2 === q) q = null; } else if (c2 === '"' || c2 === "'") q = c2; else if ('{[('.includes(c2)) d++; else if ('}])'.includes(c2)) d--;
            j++;
          }
          let inner = s.slice(i + 1, j - 1);
          let spec = '';
          let conv = '';
          let depth = 0;
          let cut = -1;
          for (let k = 0; k < inner.length; k++) {
            const c3 = inner[k];
            if ('([{'.includes(c3)) depth++;
            else if (')]}'.includes(c3)) depth--;
            else if (c3 === "'" || c3 === '"') { const e2 = inner.indexOf(c3, k + 1); k = e2 < 0 ? inner.length : e2; }
            else if (depth === 0 && c3 === '!' && inner[k + 1] !== '=') { conv = inner[k + 1]; cut = cut < 0 ? k : cut; inner = inner.slice(0, k) + '\u0001' + inner.slice(k + 2); }
            else if (depth === 0 && c3 === ':') { spec = inner.slice(k + 1); inner = inner.slice(0, k); break; }
          }
          inner = inner.replace('\u0001', '');
          if (inner.endsWith('=')) { lit += inner; inner = inner.slice(0, -1); }
          const sub = parse('(' + inner.trim() + ')\n');
          parts.push(lit);
          lit = '';
          parts.push({ e: sub[0].e, conv, spec: spec.includes('{') ? fstring(spec) : spec });
          i = j - 1;
        } else if (ch === '}') { lit += '}'; if (s[i + 1] === '}') i++; } else lit += ch;
      }
      parts.push(lit);
      return parts;
    }
    function atom() {
      const t = T[p];
      if (t.t === 'NUM') { p++; return { k: 'num', v: t.v }; }
      if (t.t === 'STR') {
        let v = '';
        let parts = null;
        while (T[p].t === 'STR') {
          const s = T[p++];
          if (s.f) { parts = (parts || (v ? [v] : [])).concat(fstring(s.v)); } else if (parts) parts.push(s.v); else v += s.v;
        }
        return parts ? { k: 'fstr', parts } : { k: 'str', v };
      }
      if (t.t === 'NAME') {
        if (t.v === 'True') { p++; return { k: 'const', v: true }; }
        if (t.v === 'False') { p++; return { k: 'const', v: false }; }
        if (t.v === 'None') { p++; return { k: 'const', v: null }; }
        if (KW.has(t.v)) throw syn();
        p++;
        return { k: 'name', id: t.v, line: t.line };
      }
      if (t.t === 'OP') {
        if (t.v === '(') {
          p++;
          if (eatOp(')')) return { k: 'tuple', items: [] };
          const first = starOr();
          if (isKw('for')) { const gens = compFor(); needOp(')'); return { k: 'gen', elt: first, gens }; }
          if (isOp(',')) {
            const items = [first];
            while (eatOp(',')) { if (isOp(')')) break; items.push(starOr()); }
            needOp(')');
            return { k: 'tuple', items };
          }
          needOp(')');
          return { k: 'paren', e: first };
        }
        if (t.v === '[') {
          p++;
          if (eatOp(']')) return { k: 'list', items: [] };
          const first = starOr();
          if (isKw('for')) { const gens = compFor(); needOp(']'); return { k: 'listcomp', elt: first, gens }; }
          const items = [first];
          while (eatOp(',')) { if (isOp(']')) break; items.push(starOr()); }
          needOp(']');
          return { k: 'list', items };
        }
        if (t.v === '{') {
          p++;
          if (eatOp('}')) return { k: 'dict', items: [] };
          if (eatOp('**')) { const items = [[null, bitor()]]; while (eatOp(',')) { if (isOp('}')) break; if (eatOp('**')) items.push([null, bitor()]); else { const k2 = expr(); needOp(':'); items.push([k2, expr()]); } } needOp('}'); return { k: 'dict', items }; }
          const first = starOr();
          if (eatOp(':')) {
            const v = expr();
            if (isKw('for')) { const gens = compFor(); needOp('}'); return { k: 'dictcomp', key: first, val: v, gens }; }
            const items = [[first, v]];
            while (eatOp(',')) { if (isOp('}')) break; if (eatOp('**')) items.push([null, bitor()]); else { const k2 = expr(); needOp(':'); items.push([k2, expr()]); } }
            needOp('}');
            return { k: 'dict', items };
          }
          if (isKw('for')) { const gens = compFor(); needOp('}'); return { k: 'setcomp', elt: first, gens }; }
          const items = [first];
          while (eatOp(',')) { if (isOp('}')) break; items.push(starOr()); }
          needOp('}');
          return { k: 'set', items };
        }
        if (t.v === '...') { p++; return { k: 'const', v: null }; }
      }
      throw syn();
    }
    const body = [];
    while (T[p].t !== 'EOF') {
      if (T[p].t === 'NL') { p++; continue; }
      body.push(...stmt());
    }
    return body;
  }

  /* ---------- interpreter ---------- */
  class Env {
    constructor(parent, isFn) { this.vars = new Map(); this.parent = parent; this.isFn = isFn; this.glob = new Set(); }
    root() { let e = this; while (e.parent) e = e.parent; return e; }
    get(n) {
      for (let e = this; e; e = e.parent) if (e.vars.has(n) && !(e.isClass && e !== this)) return e.vars.get(n);
      return undefined;
    }
    has(n) { for (let e = this; e; e = e.parent) if (e.vars.has(n)) return true; return false; }
    set(n, v) {
      if (this.glob.has(n)) this.root().vars.set(n, v);
      else this.vars.set(n, v);
    }
  }

  function makeInterp(c, filename, argv) {
    const sh = c.sh;
    const out = (s) => c.out(s);
    const root = new Env(null, false);
    let curLine = 0;
    const tb = [];
    const toKey = (x) => hkey(x);
    async function iter(x) {
      if (x instanceof PyIterator) { const r = x.list.slice(x.pos); x.pos = x.list.length; return r; }
      if (Array.isArray(x)) return x.slice();
      if (typeof x === 'string') return [...x];
      if (x instanceof Map) return [...x.keys()];
      if (x instanceof Set) return [...x];
      if (x instanceof PyFile) return x.lines();
      if (x instanceof PyInst) {
        const it = findAttr(x.cls, '__iter__');
        if (it) { const r = []; const o = await call(new Bound(it, x), [], []); if (o instanceof PyIterator) return o.list.slice(o.pos); if (Array.isArray(o)) return o.slice(); const nx = findAttr(o.cls, '__next__'); for (;;) { try { r.push(await call(new Bound(nx, o), [], [])); } catch (e) { if (e instanceof PyErr && e.pytype === 'StopIteration') break; throw e; } } return r; }
      }
      throw E('TypeError', `'${typeName(x)}' object is not iterable`);
    }
    class PyFile {
      constructor(path, mode, text) { this.path = path; this.mode = mode; this.buf = text; this.pos = 0; this.closed = false; this.w = ''; this.pyrepr = `<_io.TextIOWrapper name='${path}' mode='${mode}' encoding='UTF-8'>`; }
      lines() { const r = []; const s = this.buf.slice(this.pos); this.pos = this.buf.length; const re = /[^\n]*\n|[^\n]+$/g; let m; while ((m = re.exec(s))) r.push(m[0]); return r; }
    }
    const fsErr = (e, path) => {
      if (!(e instanceof FsErr)) return e;
      const m = { ENOENT: ['FileNotFoundError', 2, 'No such file or directory'], EACCES: ['PermissionError', 13, 'Permission denied'], EISDIR: ['IsADirectoryError', 21, 'Is a directory'], EEXIST: ['FileExistsError', 17, 'File exists'], ENOTDIR: ['NotADirectoryError', 20, 'Not a directory'] }[e.code] || ['OSError', 5, U.errTxt(e)];
      return E(m[0], `[Errno ${m[1]}] ${m[2]}: '${path}'`);
    };
    const toArgs = (a) => a;

    /* ----- formatting ----- */
    async function formatSpec(v, spec) {
      if (!spec) return await str(v);
      const m = /^(?:(.)?([<>^=]))?([+\- ])?(#)?(0)?(\d+)?(,|_)?(?:\.(\d+))?([bcdeEfFgGnosxX%])?$/.exec(spec);
      if (!m) throw E('ValueError', 'Invalid format specifier');
      let [, fill, align, sign, alt, zero, width, comma, prec, type] = m;
      let s;
      const num = isNum(v) && typeof v !== 'string';
      if (type === undefined && prec !== undefined && num && isInt(v)) throw E('ValueError', "Precision not allowed in integer format specifier");
      if (num || type) {
        let x = nv(v);
        if (type === 'f' || type === 'F' || (type === undefined && prec !== undefined)) s = Math.abs(x).toFixed(prec === undefined ? 6 : +prec);
        else if (type === '%') s = (Math.abs(x) * 100).toFixed(prec === undefined ? 6 : +prec) + '%';
        else if (type === 'e' || type === 'E') { s = Math.abs(x).toExponential(prec === undefined ? 6 : +prec).replace(/e([+-])(\d)$/, 'e$10$2'); if (type === 'E') s = s.toUpperCase(); }
        else if (type === 'x') s = Math.abs(x).toString(16);
        else if (type === 'X') s = Math.abs(x).toString(16).toUpperCase();
        else if (type === 'b') s = Math.abs(x).toString(2);
        else if (type === 'o') s = Math.abs(x).toString(8);
        else if (type === 's') s = await str(v);
        else if (type === 'g' || type === 'G') s = String(+Math.abs(x).toPrecision(prec === undefined ? 6 : +prec));
        else s = isF(v) ? fmtFloat(Math.abs(x)) : String(Math.abs(x));
        if (type !== 's') {
          if (comma) s = s.replace(/^(\d+)/, (d) => d.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
          const neg = x < 0 || Object.is(x, -0);
          const pre = neg ? '-' : sign === '+' ? '+' : sign === ' ' ? ' ' : '';
          if (zero && width && !align) { s = pre + s.padStart(+width - pre.length, '0'); } else s = pre + s;
        }
      } else s = await str(v);
      if (prec !== undefined && typeof v === 'string') s = s.slice(0, +prec);
      if (width && s.length < +width) {
        const w = +width;
        const a = align || (num ? '>' : '<');
        const f = fill || ' ';
        const padN = w - s.length;
        if (a === '<') s += f.repeat(padN);
        else if (a === '>') s = f.repeat(padN) + s;
        else if (a === '^') s = f.repeat(Math.floor(padN / 2)) + s + f.repeat(Math.ceil(padN / 2));
        else if (a === '=') s = s[0].match(/[+\- ]/) ? s[0] + f.repeat(padN) + s.slice(1) : f.repeat(padN) + s;
      }
      return s;
    }
    async function pctFormat(fmt, args) {
      const a = args instanceof Tuple ? args : [args];
      let i = 0;
      let res = '';
      const re = /%(?:\((\w+)\))?([-+ #0]*)(\d+|\*)?(?:\.(\d+))?([sdifrxXeEgGco%])/g;
      let last = 0;
      let m;
      while ((m = re.exec(fmt))) {
        res += fmt.slice(last, m.index);
        last = re.lastIndex;
        if (m[5] === '%') { res += '%'; continue; }
        let v = m[1] ? args.get(m[1]) : a[i++];
        if (v === undefined) throw E('TypeError', 'not enough arguments for format string');
        let s;
        const t = m[5];
        if (t === 's') s = await str(v);
        else if (t === 'r') s = await repr(v);
        else if (t === 'd' || t === 'i') s = String(Math.trunc(nv(v)));
        else if (t === 'f') s = nv(v).toFixed(m[4] === undefined ? 6 : +m[4]);
        else if (t === 'x') s = Math.trunc(nv(v)).toString(16);
        else if (t === 'X') s = Math.trunc(nv(v)).toString(16).toUpperCase();
        else if (t === 'c') s = typeof v === 'string' ? v : String.fromCharCode(v);
        else if (t === 'e' || t === 'E') s = nv(v).toExponential(m[4] === undefined ? 6 : +m[4]).replace(/e([+-])(\d)$/, 'e$10$2');
        else s = String(nv(v));
        if (m[4] !== undefined && t === 's') s = s.slice(0, +m[4]);
        const w = m[3] ? +m[3] : 0;
        if (s.length < w) s = m[2].includes('-') ? s.padEnd(w) : m[2].includes('0') && t !== 's' ? s.padStart(w, '0') : s.padStart(w);
        else if (m[2].includes('+') && nv(v) >= 0 && t !== 's') s = '+' + s;
        res += s;
      }
      return res + fmt.slice(last);
    }
    async function strFormat(fmt, args, kw) {
      let auto = 0;
      let res = '';
      for (let i = 0; i < fmt.length; i++) {
        const ch = fmt[i];
        if (ch === '{') {
          if (fmt[i + 1] === '{') { res += '{'; i++; continue; }
          const j = fmt.indexOf('}', i);
          const inner = fmt.slice(i + 1, j);
          const mm = /^([^:!]*)(?:!([rs]))?(?::(.*))?$/.exec(inner);
          let key = mm[1];
          let v;
          const base = key.split(/[.[]/)[0];
          if (base === '') { v = args[auto++]; } else if (/^\d+$/.test(base)) v = args[+base]; else { if (!kw.has(base)) throw E('KeyError', reprStr(base)); v = kw.get(base); }
          if (v === undefined) throw E('IndexError', 'Replacement index ' + (auto - 1) + ' out of range for positional args tuple');
          const rest = key.slice(base.length);
          if (rest) { const am = /\.(\w+)|\[(\w+)\]/g; let mm2; while ((mm2 = am.exec(rest))) v = mm2[1] ? await getAttr(v, mm2[1]) : await subscript(v, /^\d+$/.test(mm2[2]) ? +mm2[2] : mm2[2]); }
          if (mm[2] === 'r') v = await repr(v);
          res += await formatSpec(v, mm[3] || '');
          i = j;
        } else if (ch === '}') { res += '}'; if (fmt[i + 1] === '}') i++; } else res += ch;
      }
      return res;
    }

    /* ----- operators ----- */
    async function binop(op, a, b) {
      if (a instanceof PyInst) {
        const nm = { '+': '__add__', '-': '__sub__', '*': '__mul__', '/': '__truediv__', '==': '__eq__' }[op];
        const f = nm && findAttr(a.cls, nm);
        if (f) return await call(new Bound(f, a), [b], []);
      }
      if (op === '+') {
        if (isNum(a) && isNum(b)) return isF(a) || isF(b) ? new F(nv(a) + nv(b)) : nv(a) + nv(b);
        if (typeof a === 'string' && typeof b === 'string') return a + b;
        if (Array.isArray(a) && Array.isArray(b)) { const r = a.concat(b); return a instanceof Tuple ? tup(r) : r; }
        throw E('TypeError', `unsupported operand type(s) for +: '${typeName(a)}' and '${typeName(b)}'` + (typeof a === 'string' && isNum(b) ? '' : ''));
      }
      if (op === '*') {
        if (isNum(a) && isNum(b)) return isF(a) || isF(b) ? new F(nv(a) * nv(b)) : nv(a) * nv(b);
        if (typeof a === 'string' && isInt(b)) return a.repeat(Math.max(0, b));
        if (typeof b === 'string' && isInt(a)) return b.repeat(Math.max(0, a));
        if (Array.isArray(a) && isInt(b)) { let r = []; for (let i = 0; i < b; i++) r = r.concat(a); return r; }
        throw E('TypeError', `unsupported operand type(s) for *: '${typeName(a)}' and '${typeName(b)}'`);
      }
      if (op === '%' && typeof a === 'string') return await pctFormat(a, b);
      if (op === '|' && a instanceof Set) return new Set([...a, ...b]);
      if (op === '&' && a instanceof Set) return new Set([...a].filter((x) => b.has(x)));
      if (op === '-' && a instanceof Set) return new Set([...a].filter((x) => !b.has(x)));
      if (op === '|' && a instanceof Map) return new Map([...a, ...b]);
      if (!isNum(a) || !isNum(b)) throw E('TypeError', `unsupported operand type(s) for ${op}: '${typeName(a)}' and '${typeName(b)}'`);
      const x = nv(a);
      const y = nv(b);
      const fl = isF(a) || isF(b);
      switch (op) {
        case '-': return fl ? new F(x - y) : x - y;
        case '/': if (y === 0) throw E('ZeroDivisionError', 'division by zero'); return new F(x / y);
        case '//': if (y === 0) throw E('ZeroDivisionError', fl ? 'float floor division by zero' : 'integer division or modulo by zero'); return fl ? new F(Math.floor(x / y)) : Math.floor(x / y);
        case '%': if (y === 0) throw E('ZeroDivisionError', fl ? 'float modulo' : 'integer modulo by zero'); { const r = ((x % y) + y) % y; return fl ? new F(r) : r; }
        case '**': { const r = Math.pow(x, y); return fl || y < 0 ? new F(r) : r; }
        case '&': return x & y;
        case '|': return x | y;
        case '^': return x ^ y;
        case '<<': return x * Math.pow(2, y);
        case '>>': return Math.floor(x / Math.pow(2, y));
      }
      throw E('TypeError', 'unsupported operand');
    }
    async function contains(coll, x) {
      if (typeof coll === 'string') { if (typeof x !== 'string') throw E('TypeError', "'in <string>' requires string as left operand, not " + typeName(x)); return coll.includes(x); }
      if (Array.isArray(coll)) return coll.some((y) => eq(x, y));
      if (coll instanceof Map) return coll.has(toKey(x));
      if (coll instanceof Set) return coll.has(toKey(x));
      throw E('TypeError', `argument of type '${typeName(coll)}' is not iterable`);
    }
    async function subscript(o, idx) {
      if (idx && idx.isSlice === true) {
        const len = o.length;
        let { lo, hi, step } = idx;
        step = step === null || step === undefined ? 1 : step;
        const norm = (v, d) => (v === null || v === undefined ? d : v < 0 ? Math.max(step < 0 ? -1 : 0, len + v) : Math.min(v, step < 0 ? len - 1 : len));
        const a = norm(lo, step > 0 ? 0 : len - 1);
        const b = norm(hi, step > 0 ? len : -1);
        const res = [];
        if (step > 0) for (let i = a; i < b; i += step) res.push(o[i]);
        else for (let i = a; i > b; i += step) res.push(o[i]);
        return typeof o === 'string' ? res.join('') : o instanceof Tuple ? tup(res) : res;
      }
      if (typeof o === 'string' || Array.isArray(o)) {
        if (!isInt(idx)) throw E('TypeError', `${typeName(o) === 'str' ? 'string' : typeName(o)} indices must be integers, not '${typeName(idx)}'`);
        const i = idx < 0 ? o.length + idx : idx;
        if (i < 0 || i >= o.length) throw E('IndexError', `${typeName(o) === 'str' ? 'string' : typeName(o) + ' '}index out of range`.replace('list index out of range', 'list index out of range').replace('tuple index', 'tuple index'));
        return o[i];
      }
      if (o instanceof Map) {
        const k = toKey(idx);
        if (!o.has(k)) {
          if (o.__counter) return 0;
          if (o.__factory) { const dv = await call(o.__factory, [], []); o.set(k, dv); return dv; }
          throw E('KeyError', await repr(idx));
        }
        return o.get(k);
      }
      if (o instanceof PyInst) {
        const f = findAttr(o.cls, '__getitem__');
        if (f) return await call(new Bound(f, o), [idx], []);
      }
      throw E('TypeError', `'${typeName(o)}' object is not subscriptable`);
    }
    function sliceObj(lo, hi, step) { return { isSlice: true, lo, hi, step }; }

    /* ----- attribute access ----- */
    async function getAttr(o, name) {
      if (name === '__name__' && (o instanceof PyClass || o instanceof PyFunc || (o && o.__bi))) return o.name || o.pyname;
      if (name === '__doc__' && o instanceof PyFunc) return null;
      if (name === '__class__' && o instanceof PyInst) return o.cls;
      if (name === '__dict__' && o instanceof PyInst) return new Map(o.attrs);
      if (o instanceof Mod) {
        if (!(name in o.attrs)) throw E('AttributeError', `module '${o.name}' has no attribute '${name}'`);
        return o.attrs[name];
      }
      if (o instanceof PyInst) {
        if (o.attrs.has(name)) return o.attrs.get(name);
        const f = findAttr(o.cls, name);
        if (f instanceof PyProp) return await call(f.fget, [o], []);
        if (f instanceof PyStatic) return f.fn;
        if (f instanceof PyCM) return new Bound(f.fn, o.cls);
        if (f !== undefined) return f instanceof PyFunc ? new Bound(f, o) : f;
        throw E('AttributeError', `'${o.cls.name}' object has no attribute '${name}'`);
      }
      if (o instanceof PyClass) {
        const f = findAttr(o, name);
        if (f instanceof PyStatic) return f.fn;
        if (f instanceof PyCM) return new Bound(f.fn, o);
        if (f !== undefined) return f;
        throw E('AttributeError', `type object '${o.name}' has no attribute '${name}'`);
      }
      if (o instanceof PyProp) {
        if (name === 'setter') return bi((a) => { o.fset = a[0]; return o; });
        if (name === 'getter') return bi((a) => { o.fget = a[0]; return o; });
      }
      if (o instanceof PyErr) {
        if (name === 'args') return tup([o.pymsg]);
        if (name === 'errno') return 2;
        if (name === 'strerror') return o.pymsg;
      }
      const m = methods(o, name);
      if (m) return m;
      if (o && o.pyattrs && name in o.pyattrs) return o.pyattrs[name];
      throw E('AttributeError', `'${typeName(o)}' object has no attribute '${name}'`);
    }
    const M = (fn) => bi(fn);
    function methods(o, n) {
      if (typeof o === 'string') {
        const s = o;
        const t = {
          upper: () => s.toUpperCase(), lower: () => s.toLowerCase(), title: () => s.toLowerCase().replace(/\b[a-z]/g, (x) => x.toUpperCase()), capitalize: () => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(), swapcase: () => [...s].map((x) => (x === x.toUpperCase() ? x.toLowerCase() : x.toUpperCase())).join(''),
          strip: (a) => (a[0] ? s.replace(new RegExp('^[' + a[0].replace(/[\]\\^-]/g, '\\$&') + ']+|[' + a[0].replace(/[\]\\^-]/g, '\\$&') + ']+$', 'g'), '') : s.trim()),
          lstrip: (a) => (a[0] ? s.replace(new RegExp('^[' + a[0].replace(/[\]\\^-]/g, '\\$&') + ']+'), '') : s.trimStart()),
          rstrip: (a) => (a[0] ? s.replace(new RegExp('[' + a[0].replace(/[\]\\^-]/g, '\\$&') + ']+$'), '') : s.trimEnd()),
          split: (a, kw) => { const sep = a[0] === undefined ? (kw.get('sep') === undefined ? null : kw.get('sep')) : a[0]; const mx = a[1] === undefined ? (kw.has('maxsplit') ? kw.get('maxsplit') : -1) : a[1]; if (sep === null) { const parts = s.trim().split(/\s+/).filter((x) => x !== ''); if (mx >= 0 && parts.length > mx + 1) { const head = parts.slice(0, mx); const tail = s.trim().replace(new RegExp('^(?:\\S+\\s+){' + mx + '}'), ''); return head.concat([tail]); } return parts; } if (mx < 0) return s.split(sep); const parts = s.split(sep); return parts.slice(0, mx).concat(parts.length > mx ? [parts.slice(mx).join(sep)] : []); },
          rsplit: (a) => { const sep = a[0]; const mx = a[1] === undefined ? -1 : a[1]; const parts = s.split(sep === undefined || sep === null ? /\s+/ : sep); if (mx < 0 || parts.length <= mx + 1) return parts; return [parts.slice(0, parts.length - mx).join(sep)].concat(parts.slice(parts.length - mx)); },
          splitlines: () => s.split('\n').filter((x, i, arr) => !(i === arr.length - 1 && x === '')),
          join: async (a) => { const items = await iter(a[0]); for (const x of items) if (typeof x !== 'string') throw E('TypeError', `sequence item ${items.indexOf(x)}: expected str instance, ${typeName(x)} found`); return items.join(s); },
          replace: (a) => (a[2] !== undefined ? a[0].split(a[0]).length && (() => { let c2 = 0; return s.split(a[0]).reduce((acc, part, i) => (i === 0 ? part : (c2++ < a[2] ? a[1] : a[0]) + part), ''); })() : s.split(a[0]).join(a[1])),
          startswith: (a) => (Array.isArray(a[0]) ? a[0].some((x) => s.startsWith(x)) : s.startsWith(a[0])), endswith: (a) => (Array.isArray(a[0]) ? a[0].some((x) => s.endsWith(x)) : s.endsWith(a[0])),
          find: (a) => s.indexOf(a[0], a[1] || 0), rfind: (a) => s.lastIndexOf(a[0]), index: (a) => { const i = s.indexOf(a[0]); if (i < 0) throw E('ValueError', 'substring not found'); return i; }, count: (a) => (a[0] === '' ? s.length + 1 : s.split(a[0]).length - 1),
          format: async (a, kw) => await strFormat(s, a, kw), isdigit: () => /^\d+$/.test(s), isnumeric: () => /^\d+$/.test(s), isalpha: () => /^[A-Za-z]+$/.test(s), isalnum: () => /^[A-Za-z0-9]+$/.test(s), isspace: () => /^\s+$/.test(s), isupper: () => s !== '' && s === s.toUpperCase() && s !== s.toLowerCase(), islower: () => s !== '' && s === s.toLowerCase() && s !== s.toUpperCase(),
          zfill: (a) => (s[0] === '-' ? '-' + s.slice(1).padStart(a[0] - 1, '0') : s.padStart(a[0], '0')), center: (a) => { const w = a[0]; const f = a[1] || ' '; const tot = Math.max(0, w - s.length); const l = Math.floor(tot / 2) + (tot % 2 && w % 2 ? 1 : 0); return f.repeat(tot - l) .length >= 0 ? f.repeat(l) + s + f.repeat(tot - l) : s; }, ljust: (a) => s.padEnd(a[0], a[1] || ' '), rjust: (a) => s.padStart(a[0], a[1] || ' '),
          partition: (a) => { const i = s.indexOf(a[0]); return i < 0 ? tup([s, '', '']) : tup([s.slice(0, i), a[0], s.slice(i + a[0].length)]); }, encode: () => s, decode: () => s, removeprefix: (a) => (s.startsWith(a[0]) ? s.slice(a[0].length) : s), removesuffix: (a) => (a[0] && s.endsWith(a[0]) ? s.slice(0, -a[0].length) : s),
        };
        return t[n] ? M(t[n]) : null;
      }
      if (Array.isArray(o) && !(o instanceof Tuple)) {
        const L = o;
        const t = {
          append: (a) => { L.push(a[0]); return null; }, extend: async (a) => { L.push(...(await iter(a[0]))); return null; }, insert: (a) => { L.splice(a[0] < 0 ? Math.max(0, L.length + a[0]) : a[0], 0, a[1]); return null; },
          pop: (a) => { if (!L.length) throw E('IndexError', 'pop from empty list'); const i = a[0] === undefined ? L.length - 1 : a[0] < 0 ? L.length + a[0] : a[0]; if (i < 0 || i >= L.length) throw E('IndexError', 'pop index out of range'); return L.splice(i, 1)[0]; },
          remove: (a) => { const i = L.findIndex((x) => eq(x, a[0])); if (i < 0) throw E('ValueError', 'list.remove(x): x not in list'); L.splice(i, 1); return null; },
          index: (a) => { const i = L.findIndex((x) => eq(x, a[0])); if (i < 0) throw E('ValueError', `${typeof a[0] === 'string' ? reprStr(a[0]) : a[0]} is not in list`); return i; }, count: (a) => L.filter((x) => eq(x, a[0])).length,
          sort: async (a, kw) => { await sortList(L, kw.get('key'), truthy(kw.get('reverse'))); return null; }, reverse: () => { L.reverse(); return null; }, copy: () => L.slice(), clear: () => { L.length = 0; return null; },
        };
        return t[n] ? M(t[n]) : null;
      }
      if (o instanceof Tuple) {
        const t = { index: (a) => o.findIndex((x) => eq(x, a[0])), count: (a) => o.filter((x) => eq(x, a[0])).length };
        return t[n] ? M(t[n]) : null;
      }
      if (o instanceof Map) {
        const t = {
          get: (a) => (o.has(toKey(a[0])) ? o.get(toKey(a[0])) : a[1] === undefined ? null : a[1]), keys: () => [...o.keys()], values: () => [...o.values()], items: () => [...o].map(([k, v]) => tup([k, v])),
          update: async (a, kw) => { if (a[0] instanceof Map) a[0].forEach((v, k) => o.set(k, v)); else if (a[0]) for (const kv of a[0]) o.set(toKey(kv[0]), kv[1]); kw.forEach((v, k) => o.set(k, v)); return null; },
          pop: (a) => { const k = toKey(a[0]); if (o.has(k)) { const v = o.get(k); o.delete(k); return v; } if (a.length > 1) return a[1]; throw E('KeyError', reprStr(String(a[0]))); },
          setdefault: (a) => { const k = toKey(a[0]); if (!o.has(k)) o.set(k, a[1] === undefined ? null : a[1]); return o.get(k); }, copy: () => { const cp = new Map(o); cp.__counter = o.__counter; cp.__factory = o.__factory; return cp; }, clear: () => { o.clear(); return null; },
        };
        if (o.__counter) {
          t.most_common = (a) => { const arr = [...o].sort((x, y) => y[1] - x[1]).map(([k, v]) => tup([k, v])); return a.length && a[0] !== null ? arr.slice(0, a[0]) : arr; };
          t.total = () => [...o.values()].reduce((x, y) => x + y, 0);
          t.elements = () => [...o].flatMap(([k, v]) => Array(Math.max(0, v)).fill(k));
          t.update = async (a) => { if (a[0] instanceof Map) a[0].forEach((v, k) => o.set(k, (o.get(k) || 0) + v)); else if (a[0]) for (const x of await iter(a[0])) o.set(toKey(x), (o.get(toKey(x)) || 0) + 1); return null; };
          t.subtract = async (a) => { if (a[0] instanceof Map) a[0].forEach((v, k) => o.set(k, (o.get(k) || 0) - v)); else if (a[0]) for (const x of await iter(a[0])) o.set(toKey(x), (o.get(toKey(x)) || 0) - 1); return null; };
        }
        return t[n] ? M(t[n]) : null;
      }
      if (o instanceof Set) {
        const t = { add: (a) => { o.add(toKey(a[0])); return null; }, remove: (a) => { if (!o.delete(toKey(a[0]))) throw E('KeyError', reprStr(String(a[0]))); return null; }, discard: (a) => { o.delete(toKey(a[0])); return null; }, union: async (a) => new Set([...o, ...(await iter(a[0]))]), intersection: async (a) => { const b = new Set(await iter(a[0])); return new Set([...o].filter((x) => b.has(x))); }, difference: async (a) => { const b = new Set(await iter(a[0])); return new Set([...o].filter((x) => !b.has(x))); }, issubset: (a) => [...o].every((x) => a[0].has(x)), copy: () => new Set(o), pop: () => { const v = o.values().next().value; o.delete(v); return v; } };
        return t[n] ? M(t[n]) : null;
      }
      if (o instanceof PyFile) {
        const t = {
          read: () => { const s = o.buf.slice(o.pos); o.pos = o.buf.length; return s; }, readline: () => { const i = o.buf.indexOf('\n', o.pos); const s = i < 0 ? o.buf.slice(o.pos) : o.buf.slice(o.pos, i + 1); o.pos += s.length; return s; }, readlines: () => o.lines(),
          write: (a) => { if (!/[wa+x]/.test(o.mode)) throw E('io.UnsupportedOperation', 'not writable'); o.w += a[0]; return a[0].length; }, writelines: async (a) => { o.w += (await iter(a[0])).join(''); return null; }, close: () => { closeFile(o); return null; }, flush: () => null,
        };
        return t[n] ? M(t[n]) : null;
      }
      if (isF(o)) { const t = { is_integer: () => Number.isInteger(o.v) }; return t[n] ? M(t[n]) : null; }
      if (isInt(o)) { const t = { bit_length: () => o.toString(2).length }; return t[n] ? M(t[n]) : null; }
      return null;
    }
    function closeFile(f) {
      if (f.closed) return;
      f.closed = true;
      if (/[wax+]/.test(f.mode) && f.w !== '' || /w/.test(f.mode)) sh.writeFile(f.abs, f.w, f.mode.includes('a'));
    }
    async function sortList(L, key, rev) {
      const keyed = [];
      for (const x of L) keyed.push([key ? await call(key, [x], []) : x, x]);
      keyed.sort((a, b) => cmpv(a[0], b[0]));
      if (rev) keyed.reverse();
      keyed.forEach((k, i) => (L[i] = k[1]));
    }

    /* ----- calling ----- */
    async function call(fn, args, kwargs) {
      if (fn && fn.__bi) {
        const kw = kwargs instanceof Map ? kwargs : new Map(kwargs);
        return await fn(args, kw);
      }
      if (fn instanceof Bound) return await call(fn.fn, [fn.self, ...args], kwargs);
      if (fn instanceof PyFunc) {
        const env = new Env(fn.closure, true);
        const kw = new Map(kwargs instanceof Map ? kwargs : kwargs);
        let ai = 0;
        for (const prm of fn.params) {
          if (prm.star) { env.vars.set(prm.name, tup(args.slice(ai))); ai = args.length; }
          else if (prm.kw) { env.vars.set(prm.name, new Map(kw)); kw.clear(); }
          else if (ai < args.length) env.vars.set(prm.name, args[ai++]);
          else if (kw.has(prm.name)) { env.vars.set(prm.name, kw.get(prm.name)); kw.delete(prm.name); }
          else if (prm.def !== undefined) env.vars.set(prm.name, prm.defVal !== undefined ? prm.defVal : (prm.defVal = await ev(prm.def, fn.closure)));
          else throw E('TypeError', `${fn.name}() missing 1 required positional argument: '${prm.name}'`);
        }
        if (ai < args.length) throw E('TypeError', `${fn.name}() takes ${fn.params.filter((q) => !q.star && !q.kw).length} positional argument${fn.params.length === 1 ? '' : 's'} but ${args.length} ${args.length === 1 ? 'was' : 'were'} given`);
        if (kw.size && !fn.params.some((q) => q.kw)) throw E('TypeError', `${fn.name}() got an unexpected keyword argument '${[...kw.keys()][0]}'`);
        if (tb.length > 120) throw E('RecursionError', 'maximum recursion depth exceeded');
        tb.push({ name: fn.name, line: curLine });
        try {
          if (fn.isLambda) return await ev(fn.body, env);
          const r = await run(fn.body, env);
          return r instanceof Ret ? r.v : null;
        } catch (e) {
          if (e instanceof PyErr || e instanceof PyInst) (e.fnNames = e.fnNames || []).push(fn.name);
          throw e;
        } finally { tb.pop(); }
      }
      if (fn instanceof PyClass) {
        const inst = new PyInst(fn);
        const init = findAttr(fn, '__init__');
        if (init) await call(init, [inst, ...args], kwargs);
        else if (fn.excBase) { inst.attrs.set('args', tup(args)); }
        return inst;
      }
      throw E('TypeError', `'${typeName(fn)}' object is not callable`);
    }
    CALL = call;

    /* ----- evaluation ----- */
    async function ev(n, env) {
      switch (n.k) {
        case 'num': return n.v;
        case 'str': return n.v;
        case 'const': return n.v;
        case 'paren': return await ev(n.e, env);
        case 'fstr': {
          let r = '';
          for (const part of n.parts) {
            if (typeof part === 'string') r += part;
            else {
              let v = await ev(part.e, env);
              if (part.conv === 'r') v = await repr(v);
              else if (part.conv === 's') v = await str(v);
              const spec = Array.isArray(part.spec) ? await evFstrParts(part.spec, env) : part.spec;
              r += await formatSpec(v, spec);
            }
          }
          return r;
        }
        case 'name': {
          const v = env.get(n.id);
          if (v !== undefined) return v;
          if (n.id in BUILTINS) return BUILTINS[n.id];
          throw E('NameError', `name '${n.id}' is not defined`);
        }
        case 'walrus': { const v = await ev(n.e, env); env.set(n.name, v); return v; }
        case 'list': { const r = []; for (const it of n.items) { if (it.k === 'star') r.push(...(await iter(await ev(it.e, env)))); else r.push(await ev(it, env)); } return r; }
        case 'tuple': { const r = []; for (const it of n.items) { if (it.k === 'star') r.push(...(await iter(await ev(it.e, env)))); else r.push(await ev(it, env)); } return tup(r); }
        case 'set': { const r = new Set(); for (const it of n.items) r.add(toKey(await ev(it, env))); return r; }
        case 'dict': { const m = new Map(); for (const [k, v] of n.items) { if (k === null) { (await ev(v, env)).forEach((x, y) => m.set(y, x)); } else m.set(toKey(await ev(k, env)), await ev(v, env)); } return m; }
        case 'listcomp': case 'gen': case 'setcomp': {
          const r = [];
          await comp(n.gens, 0, new Env(env, true), async (e2) => r.push(await ev(n.elt, e2)));
          return n.k === 'setcomp' ? new Set(r.map(toKey)) : r;
        }
        case 'dictcomp': { const m = new Map(); await comp(n.gens, 0, new Env(env, true), async (e2) => m.set(toKey(await ev(n.key, e2)), await ev(n.val, e2))); return m; }
        case 'lambda': { const f = new PyFunc('<lambda>', n.params, n.body, env); f.isLambda = true; return f; }
        case 'ifexp': return truthy(await ev(n.test, env)) ? await ev(n.body, env) : await ev(n.orelse, env);
        case 'bool': { const l = await ev(n.l, env); return n.op === 'and' ? (truthy(l) ? await ev(n.r, env) : l) : truthy(l) ? l : await ev(n.r, env); }
        case 'unary': {
          const v = await ev(n.e, env);
          if (n.op === 'not') return !truthy(v);
          if (!isNum(v)) throw E('TypeError', `bad operand type for unary ${n.op}: '${typeName(v)}'`);
          if (n.op === '-') return isF(v) ? new F(-v.v) : -nv(v);
          if (n.op === '~') return ~nv(v);
          return v;
        }
        case 'bin': return await binop(n.op, await ev(n.l, env), await ev(n.r, env));
        case 'cmp': {
          let l = await ev(n.first, env);
          for (const [op, re] of n.ops) {
            const r = await ev(re, env);
            let ok;
            switch (op) {
              case '==': ok = l instanceof PyInst && findAttr(l.cls, '__eq__') ? truthy(await call(new Bound(findAttr(l.cls, '__eq__'), l), [r], [])) : eq(l, r); break;
              case '!=': ok = !eq(l, r); break;
              case '<': ok = cmpv(l, r) < 0; break;
              case '>': ok = cmpv(l, r) > 0; break;
              case '<=': ok = cmpv(l, r) <= 0; break;
              case '>=': ok = cmpv(l, r) >= 0; break;
              case 'in': ok = await contains(r, l); break;
              case 'not in': ok = !(await contains(r, l)); break;
              case 'is': ok = l === r || (l === null && r === null); break;
              case 'is not': ok = !(l === r); break;
            }
            if (!ok) return false;
            l = r;
          }
          return true;
        }
        case 'attr': return await getAttr(await ev(n.e, env), n.name);
        case 'sub': {
          const o = await ev(n.e, env);
          let idx;
          if (n.idx.k === 'slice') idx = sliceObj(n.idx.lo && (await ev(n.idx.lo, env)), n.idx.hi && (await ev(n.idx.hi, env)), n.idx.step && (await ev(n.idx.step, env)));
          else idx = await ev(n.idx, env);
          return await subscript(o, idx);
        }
        case 'call': {
          const fn = await ev(n.fn, env);
          const args = [];
          for (const a of n.args) { if (a.k === 'star') args.push(...(await iter(await ev(a.e, env)))); else args.push(await ev(a, env)); }
          const kw = new Map();
          for (const [k, v] of n.kwargs) { if (k === null) (await ev(v, env)).forEach((x, y) => kw.set(y, x)); else kw.set(k, await ev(v, env)); }
          curLine = n.line || curLine;
          try {
            return await call(fn, args, kw);
          } catch (e) {
            if ((e instanceof PyErr || e instanceof PyInst) && (e.fnNames || []).length > (e.callLines || []).length) (e.callLines = e.callLines || []).push(n.line);
            throw e;
          }
        }
      }
      throw E('SyntaxError', 'unsupported expression ' + n.k);
    }
    async function evFstrParts(parts, env) {
      let r = '';
      for (const part of parts) r += typeof part === 'string' ? part : await formatSpec(await ev(part.e, env), part.spec);
      return r;
    }
    async function comp(gens, i, env, fn) {
      if (i === gens.length) return await fn(env);
      const g = gens[i];
      for (const x of await iter(await ev(g.iter, env))) {
        await assign(g.target, x, env);
        let ok = true;
        for (const c2 of g.ifs) if (!truthy(await ev(c2, env))) { ok = false; break; }
        if (ok) await comp(gens, i + 1, env, fn);
      }
    }
    async function assign(t, v, env) {
      switch (t.k) {
        case 'name': env.set(t.id, v); return;
        case 'tuple': case 'list': {
          const items = await iter(v);
          const si = t.items.findIndex((x) => x.k === 'star');
          if (si < 0 && items.length !== t.items.length) throw E('ValueError', items.length > t.items.length ? `too many values to unpack (expected ${t.items.length})` : `not enough values to unpack (expected ${t.items.length}, got ${items.length})`);
          if (si < 0) for (let i = 0; i < t.items.length; i++) await assign(t.items[i], items[i], env);
          else {
            const after = t.items.length - si - 1;
            for (let i = 0; i < si; i++) await assign(t.items[i], items[i], env);
            await assign(t.items[si].e, items.slice(si, items.length - after), env);
            for (let i = 0; i < after; i++) await assign(t.items[si + 1 + i], items[items.length - after + i], env);
          }
          return;
        }
        case 'sub': {
          const o = await ev(t.e, env);
          const idx = await ev(t.idx, env);
          if (o instanceof Map) o.set(toKey(idx), v);
          else if (Array.isArray(o) && !(o instanceof Tuple)) { const i = idx < 0 ? o.length + idx : idx; if (!isInt(idx) || i < 0 || i >= o.length) throw E('IndexError', 'list assignment index out of range'); o[i] = v; }
          else if (o instanceof PyInst && findAttr(o.cls, '__setitem__')) await call(new Bound(findAttr(o.cls, '__setitem__'), o), [idx, v], []);
          else throw E('TypeError', `'${typeName(o)}' object does not support item assignment`);
          return;
        }
        case 'attr': {
          const o = await ev(t.e, env);
          if (o instanceof PyInst) {
            const pf = findAttr(o.cls, t.name);
            if (pf instanceof PyProp) { if (!pf.fset) throw E('AttributeError', `property '${t.name}' of '${o.cls.name}' object has no setter`); await call(pf.fset, [o, v], []); } else o.attrs.set(t.name, v);
          } else if (o instanceof PyClass) o.attrs.set(t.name, v);
          else throw E('AttributeError', `'${typeName(o)}' object attribute '${t.name}' is read-only`);
          return;
        }
        case 'star': await assign(t.e, v, env); return;
        case 'paren': await assign(t.e, v, env); return;
      }
      throw E('SyntaxError', 'cannot assign to expression');
    }
    async function run(stmts, env) {
      for (const s of stmts) {
        const r = await exec(s, env);
        if (r) return r;
      }
      return null;
    }
    const excMatch = (err, typeVal) => {
      if (typeVal instanceof Tuple) return typeVal.some((x) => excMatch(err, x));
      const name = typeVal instanceof PyClass ? typeVal.name : typeVal && typeVal.pyname;
      if (name === 'Exception' || name === 'BaseException') return true;
      if (err instanceof PyInst) { for (let k = err.cls; k; k = k.bases[0]) if (k === typeVal) return true; return false; }
      const chain = { FileNotFoundError: ['OSError'], PermissionError: ['OSError'], IsADirectoryError: ['OSError'], FileExistsError: ['OSError'], KeyError: ['LookupError'], IndexError: ['LookupError'], ZeroDivisionError: ['ArithmeticError'], ModuleNotFoundError: ['ImportError'] };
      return err.pytype === name || (chain[err.pytype] || []).includes(name);
    };
    const toPyErr = (e) => {
      if (e instanceof PyInst) return e;
      return e;
    };
    async function exec(s, env) {
      curLine = s.line || curLine;
      try {
        return await exec1(s, env);
      } catch (e) {
        if ((e instanceof PyErr || e instanceof PyInst) && !e.line) { try { e.line = s.line; } catch (x) {} }
        throw e;
      }
    }
    async function exec1(s, env) {
      switch (s.k) {
        case 'expr': { const v = await ev(s.e, env); if (replMode && v !== null && v !== undefined && env === root) out((await repr(v)) + '\n'); return null; }
        case 'pass': return null;
        case 'assign': { const v = await ev(s.value, env); for (const t of s.targets) await assign(t, v, env); return null; }
        case 'aug': {
          const cur = await ev(s.target, env);
          const v = await ev(s.value, env);
          let r;
          if (s.op === '+' && Array.isArray(cur) && !(cur instanceof Tuple)) { cur.push(...(await iter(v))); r = cur; } else r = await binop(s.op, cur, v);
          await assign(s.target, r, env);
          return null;
        }
        case 'if': {
          for (const [c2, body] of s.tests) if (truthy(await ev(c2, env))) return await run(body, env);
          return await run(s.orelse, env);
        }
        case 'while': {
          let guard = 0;
          while (truthy(await ev(s.cond, env))) {
            if (++guard > 200000) throw E('RuntimeError', 'loop limit reached in this sandbox');
            if (guard % 500 === 0) sh.checkAbort();
            const r = await run(s.body, env);
            if (r instanceof Brk) return null;
            if (r instanceof Ret) return r;
          }
          return await run(s.orelse, env);
        }
        case 'for': {
          const items = await iter(await ev(s.iter, env));
          let n = 0;
          for (const x of items) {
            if (++n % 500 === 0) sh.checkAbort();
            await assign(s.target, x, env);
            const r = await run(s.body, env);
            if (r instanceof Brk) return null;
            if (r instanceof Ret) return r;
          }
          return await run(s.orelse, env);
        }
        case 'break': return new Brk();
        case 'continue': return new Cont();
        case 'return': return new Ret(s.v ? await ev(s.v, env) : null);
        case 'global': s.names.forEach((nm) => env.glob.add(nm)); return null;
        case 'decorated': {
          const dvs = [];
          for (const d of s.decs) dvs.push(await ev(d, env));
          await exec(s.inner, env);
          const nm = s.inner.name;
          let v = env.vars.get(nm);
          for (const dv of dvs.reverse()) v = await call(dv, [v], []);
          env.set(nm, v);
          return null;
        }
        case 'def': { env.set(s.name, new PyFunc(s.name, s.params, s.body, env)); return null; }
        case 'class': {
          const bases = [];
          for (const b of s.bases) bases.push(await ev(b, env));
          const cenv = new Env(env, false);
          cenv.isClass = true;
          await run(s.body, cenv);
          const cls = new PyClass(s.name, bases.filter((b) => b instanceof PyClass), cenv.vars);
          cls.excBase = bases.some((b) => b && (b.excName || b.excBase));
          env.set(s.name, cls);
          return null;
        }
        case 'import': {
          for (const [m, al] of s.names) {
            const mod = await importMod(m);
            env.set(al || m.split('.')[0], al ? mod : await importMod(m.split('.')[0]));
          }
          return null;
        }
        case 'from': {
          const mod = await importMod(s.mod);
          for (const [nm, al] of s.names) {
            if (nm === '*') { for (const k of Object.keys(mod.attrs)) env.set(k, mod.attrs[k]); continue; }
            if (!(nm in mod.attrs)) throw E('ImportError', `cannot import name '${nm}' from '${s.mod}'`);
            env.set(al || nm, mod.attrs[nm]);
          }
          return null;
        }
        case 'raise': {
          if (!s.e) throw lastExc || E('RuntimeError', 'No active exception to reraise');
          const v = await ev(s.e, env);
          if (v instanceof PyErr) throw v;
          if (v instanceof PyInst) throw v;
          if (v && v.excName) throw E(v.excName, '');
          if (v instanceof PyClass) throw await call(v, [], []);
          throw E('TypeError', 'exceptions must derive from BaseException');
        }
        case 'assert': if (!truthy(await ev(s.c, env))) throw E('AssertionError', s.m ? await str(await ev(s.m, env)) : ''); return null;
        case 'del': { for (const t of s.ts) { if (t.k === 'name') env.vars.delete(t.id); else if (t.k === 'sub') { const o = await ev(t.e, env); const i = await ev(t.idx, env); if (o instanceof Map) { if (!o.delete(toKey(i))) throw E('KeyError', await repr(i)); } else o.splice(i < 0 ? o.length + i : i, 1); } } return null; }
        case 'try': {
          let res = null;
          try {
            try {
              res = await run(s.body, env);
              if (!res && s.orelse.length) res = await run(s.orelse, env);
            } catch (e) {
              if (e instanceof PyExit || e instanceof LX.AbortSig || !(e instanceof PyErr || e instanceof PyInst || e instanceof RangeError || e instanceof FsErr)) throw e;
              let err = e;
              if (e instanceof RangeError) err = E('RecursionError', 'maximum recursion depth exceeded');
              if (e instanceof FsErr) err = fsErr(e, '?');
              let handled = false;
              for (const h of s.handlers) {
                const tv = h.type ? await ev(h.type, env) : null;
                if (!h.type || excMatch(err, tv)) {
                  if (h.name) env.set(h.name, err);
                  lastExc = err;
                  res = await run(h.body, env);
                  handled = true;
                  break;
                }
              }
              if (!handled) throw e;
            }
          } finally {
            if (s.fin.length) { const r2 = await run(s.fin, env); if (r2) res = r2; }
          }
          return res;
        }
        case 'with': {
          const opened = [];
          try {
            for (const [e, tg] of s.items) {
              const v = await ev(e, env);
              opened.push(v);
              if (tg) await assign(tg, v, env);
            }
            return await run(s.body, env);
          } finally {
            for (const v of opened) if (v instanceof PyFile) closeFile(v);
          }
        }
      }
      throw E('SyntaxError', 'unsupported statement');
    }
    let lastExc = null;
    let replMode = false;
    const openFiles = [];

    /* ----- builtins ----- */
    const exc = (name) => { const f = bi(async (a) => { const e = E(name, a.length ? await str(a[0]) : ''); return e; }, name); f.pyname = name; f.excName = name; return f; };
    const BUILTINS = {};
    const defb = (name, fn) => (BUILTINS[name] = bi(fn, name));
    defb('eval', async (a) => { const ast = parse(String(a[0]).trim()); if (!ast.length || ast[0].k !== 'expr') throw E('SyntaxError', 'invalid syntax'); return await ev(ast[0].e, root); });
    defb('iter', async (a) => new PyIterator(await iter(a[0])));
    defb('next', (a) => { const it = a[0]; if (!(it instanceof PyIterator)) throw E('TypeError', `'${typeName(it)}' object is not an iterator`); if (it.pos < it.list.length) return it.list[it.pos++]; if (a.length > 1) return a[1]; throw E('StopIteration', ''); });
    defb('hash', (a) => { let h = 0; const sx = JSON.stringify(a[0]) || String(a[0]); for (let i = 0; i < sx.length; i++) h = (Math.imul(h, 31) + sx.charCodeAt(i)) | 0; return h; });
    defb('issubclass', (a) => { const base = (c1, c2) => c1 === c2 || (c1 instanceof PyClass && c1.bases.some((b) => base(b, c2))); const ts = a[1] instanceof Tuple ? a[1] : [a[1]]; return ts.some((t) => base(a[0], t) || (a[0] && t && a[0].pyname && a[0].pyname === t.pyname) || (a[0] && a[0].pyname === 'bool' && t && t.pyname === 'int')); });
    defb('frozenset', async (a) => new Set(a.length ? await iter(a[0]) : []));
    defb('bytes', async (a) => (typeof a[0] === 'string' ? a[0] : Array.isArray(a[0]) ? String.fromCharCode(...a[0]) : ''));
    defb('bytearray', async (a) => (typeof a[0] === 'string' ? a[0] : ''));
    defb('dir', (a) => { const o = a[0]; let names = []; if (o instanceof Mod) names = Object.keys(o.attrs); else if (o instanceof PyInst) names = [...o.attrs.keys(), ...(function w(c) { return [...c.attrs.keys(), ...c.bases.flatMap(w)]; })(o.cls)]; else if (o instanceof PyClass) names = [...o.attrs.keys()]; return [...new Set(names)].sort(); });
    defb('vars', (a) => (a[0] instanceof PyInst ? new Map(a[0].attrs) : new Map()));
    defb('setattr', async (a) => { const o = a[0]; if (o instanceof PyInst) { const pf = findAttr(o.cls, a[1]); if (pf instanceof PyProp && pf.fset) await call(pf.fset, [o, a[2]], []); else o.attrs.set(a[1], a[2]); } else if (o instanceof PyClass) o.attrs.set(a[1], a[2]); else throw E('AttributeError', `'${typeName(o)}' object attribute '${a[1]}' is read-only`); return null; });
    defb('delattr', (a) => { if (a[0] instanceof PyInst) a[0].attrs.delete(a[1]); return null; });
    defb('property', (a) => new PyProp(a[0]));
    defb('staticmethod', (a) => new PyStatic(a[0]));
    defb('classmethod', (a) => new PyCM(a[0]));
    defb('print', async (a, kw) => {
      const sep = kw.has('sep') && kw.get('sep') !== null ? kw.get('sep') : ' ';
      const end = kw.has('end') && kw.get('end') !== null ? kw.get('end') : '\n';
      const strs = [];
      for (const x of a) strs.push(await str(x));
      const text = strs.join(sep) + end;
      const f = kw.get('file');
      if (f && f.isErr) c.err(text); else out(text);
      return null;
    });
    defb('len', async (a) => { const x = a[0]; if (typeof x === 'string' || Array.isArray(x)) return x.length; if (x instanceof Map || x instanceof Set) return x.size; if (x instanceof PyInst && findAttr(x.cls, '__len__')) return await call(new Bound(findAttr(x.cls, '__len__'), x), [], []); throw E('TypeError', `object of type '${typeName(x)}' has no len()`); });
    defb('range', (a) => { let [s, e, st] = a.length === 1 ? [0, a[0], 1] : [a[0], a[1], a[2] === undefined ? 1 : a[2]]; if (st === 0) throw E('ValueError', 'range() arg 3 must not be zero'); const r = []; if (Math.abs((e - s) / st) > 2e6) throw E('MemoryError', ''); if (st > 0) for (let i = s; i < e; i += st) r.push(i); else for (let i = s; i > e; i += st) r.push(i); return r; });
    defb('int', async (a) => { const x = a[0]; if (x === undefined) return 0; if (typeof x === 'string') { const b = a[1] || 10; const t = x.trim().replace(/_/g, ''); if (!(b === 10 ? /^[+-]?\d+$/ : b === 16 ? /^[+-]?(0x)?[0-9a-fA-F]+$/ : /^[+-]?[0-9a-zA-Z]+$/).test(t)) throw E('ValueError', `invalid literal for int() with base ${b}: ${reprStr(x)}`); return parseInt(t, b); } if (isNum(x)) return Math.trunc(nv(x)); throw E('TypeError', `int() argument must be a string, a bytes-like object or a real number, not '${typeName(x)}'`); });
    defb('float', (a) => { const x = a[0]; if (x === undefined) return new F(0); if (typeof x === 'string') { const t = x.trim(); if (/^[+-]?(inf|infinity)$/i.test(t)) return new F(t[0] === '-' ? -Infinity : Infinity); if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) throw E('ValueError', `could not convert string to float: ${reprStr(x)}`); return new F(parseFloat(t)); } return new F(nv(x)); });
    defb('str', async (a) => (a.length ? await str(a[0]) : ''));
    defb('repr', async (a) => await repr(a[0]));
    defb('bool', (a) => truthy(a[0]));
    defb('list', async (a) => (a.length ? await iter(a[0]) : []));
    defb('tuple', async (a) => tup(a.length ? await iter(a[0]) : []));
    defb('set', async (a) => new Set(a.length ? (await iter(a[0])).map(toKey) : []));
    defb('dict', async (a, kw) => { const m = new Map(); if (a[0] instanceof Map) a[0].forEach((v, k) => m.set(k, v)); else if (a[0]) for (const kv of await iter(a[0])) m.set(toKey(kv[0]), kv[1]); kw.forEach((v, k) => m.set(k, v)); return m; });
    defb('sorted', async (a, kw) => { const L = await iter(a[0]); await sortList(L, kw.get('key'), truthy(kw.get('reverse'))); return L; });
    defb('reversed', async (a) => (await iter(a[0])).reverse());
    defb('enumerate', async (a, kw) => (await iter(a[0])).map((x, i) => tup([i + (a[1] || kw.get('start') || 0), x])));
    defb('zip', async (a) => { const ls = []; for (const x of a) ls.push(await iter(x)); const n = Math.min(...ls.map((l) => l.length)); const r = []; for (let i = 0; i < n; i++) r.push(tup(ls.map((l) => l[i]))); return r; });
    defb('map', async (a) => { const ls = []; for (const x of a.slice(1)) ls.push(await iter(x)); const r = []; for (let i = 0; i < Math.min(...ls.map((l) => l.length)); i++) r.push(await call(a[0], ls.map((l) => l[i]), [])); return r; });
    defb('filter', async (a) => { const r = []; for (const x of await iter(a[1])) if (truthy(a[0] === null ? x : await call(a[0], [x], []))) r.push(x); return r; });
    defb('sum', async (a) => { let s = a[1] === undefined ? 0 : a[1]; for (const x of await iter(a[0])) s = await binop('+', s, x); return s; });
    const mm = (name, sign) => defb(name, async (a, kw) => { const L = a.length === 1 ? await iter(a[0]) : a; if (!L.length) { if (kw.has('default')) return kw.get('default'); throw E('ValueError', `${name}() iterable argument is empty`); } let best = L[0]; let bk = kw.get('key') ? await call(kw.get('key'), [best], []) : best; for (const x of L.slice(1)) { const k = kw.get('key') ? await call(kw.get('key'), [x], []) : x; if (sign * cmpv(k, bk) > 0) { best = x; bk = k; } } return best; });
    mm('max', 1); mm('min', -1);
    defb('abs', (a) => (isF(a[0]) ? new F(Math.abs(a[0].v)) : Math.abs(nv(a[0]))));
    defb('round', (a) => { const x = nv(a[0]); if (a[1] === undefined || a[1] === null) { const f = Math.floor(x); const d = x - f; return d === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(x); } return new F(+x.toFixed(a[1])); });
    defb('input', async (a) => { if (a.length) out(await str(a[0])); if (typeof c.stdin === 'string' && c.stdin !== '') { const i = stdinBuf.indexOf('\n'); if (stdinBuf === '') throw E('EOFError', 'EOF when reading a line'); const l = i < 0 ? stdinBuf : stdinBuf.slice(0, i); stdinBuf = i < 0 ? '' : stdinBuf.slice(i + 1); return l; } const l = sh.hooks.readLine ? await sh.hooks.readLine('') : null; sh.checkAbort(); if (l === null || l === undefined) throw E('EOFError', 'EOF when reading a line'); return l; });
    defb('isinstance', (a) => { const t = a[1]; const names = (t instanceof Tuple ? t : [t]).map((x) => (x instanceof PyClass ? x : x && x.pyname)); const tn = typeName(a[0]); if (a[0] instanceof PyInst) return (t instanceof Tuple ? t : [t]).some((x) => { for (let k = a[0].cls; k; k = k.bases[0]) if (k === x) return true; return false; }); return names.includes(tn) || (names.includes('int') && typeof a[0] === 'boolean') || (names.includes('float') && isF(a[0])); });
    defb('type', (a) => { const n = typeName(a[0]); const f = bi(() => null, n); f.pyrepr = `<class '${n}'>`; return a[0] instanceof PyInst ? a[0].cls : f; });
    defb('chr', (a) => String.fromCharCode(a[0])); defb('ord', (a) => a[0].charCodeAt(0));
    defb('hex', (a) => (a[0] < 0 ? '-0x' + (-a[0]).toString(16) : '0x' + a[0].toString(16))); defb('bin', (a) => '0b' + a[0].toString(2)); defb('oct', (a) => '0o' + a[0].toString(8));
    defb('any', async (a) => { for (const x of await iter(a[0])) if (truthy(x)) return true; return false; });
    defb('all', async (a) => { for (const x of await iter(a[0])) if (!truthy(x)) return false; return true; });
    defb('divmod', (a) => tup([Math.floor(nv(a[0]) / nv(a[1])), ((nv(a[0]) % nv(a[1])) + nv(a[1])) % nv(a[1])]));
    defb('pow', (a) => binop('**', a[0], a[1]));
    defb('format', async (a) => await formatSpec(a[0], a[1] || ''));
    defb('hasattr', async (a) => { try { await getAttr(a[0], a[1]); return true; } catch (e) { return false; } });
    defb('getattr', async (a) => { try { return await getAttr(a[0], a[1]); } catch (e) { if (a.length > 2) return a[2]; throw e; } });
    defb('callable', (a) => a[0] instanceof PyFunc || a[0] instanceof Bound || a[0] instanceof PyClass || !!(a[0] && a[0].__bi));
    defb('id', () => 140234567890);
    defb('exit', (a) => { throw new PyExit(a.length ? (isInt(a[0]) ? a[0] : 1) : 0); }); BUILTINS.quit = BUILTINS.exit;
    defb('open', (a, kw) => {
      const path = a[0] instanceof PyInst && a[0].attrs.has('_p') ? a[0].attrs.get('_p') : a[0];
      const mode = a[1] || kw.get('mode') || 'r';
      const abs = c.abs(path);
      try {
        let text = '';
        if (/r/.test(mode) || /[a+]/.test(mode) && sh.fs.lookup(abs)) {
          const n = sh.fs.lookup(abs);
          if (!n) { if (/r/.test(mode)) throw E('FileNotFoundError', `[Errno 2] No such file or directory: '${path}'`); } else if (n.t === 'd') throw E('IsADirectoryError', `[Errno 21] Is a directory: '${path}'`);
          else { if (!sh.can(n, 4) && /r/.test(mode)) throw E('PermissionError', `[Errno 13] Permission denied: '${path}'`); text = sh.readFile(abs); }
        }
        if (/[wa]/.test(mode)) { const par = sh.fs.lookup(VFS.dirname(abs)); if (!par) throw E('FileNotFoundError', `[Errno 2] No such file or directory: '${path}'`); sh.writeFile(abs, /a/.test(mode) ? '' : '', /a/.test(mode)); }
        const f = new PyFile(path, mode, /a/.test(mode) ? '' : text);
        f.abs = abs;
        openFiles.push(f);
        return f;
      } catch (e) { throw fsErr(e, path); }
    });
    ['Exception', 'BaseException', 'ValueError', 'TypeError', 'KeyError', 'IndexError', 'ZeroDivisionError', 'FileNotFoundError', 'PermissionError', 'OSError', 'RuntimeError', 'NameError', 'AttributeError', 'ImportError', 'ModuleNotFoundError', 'AssertionError', 'StopIteration', 'KeyboardInterrupt', 'NotImplementedError', 'IsADirectoryError', 'FileExistsError', 'ArithmeticError', 'LookupError', 'EOFError', 'RecursionError', 'SystemExit', 'UnicodeDecodeError', 'TimeoutError', 'ConnectionError'].forEach((n) => { BUILTINS[n] = exc(n); });
    BUILTINS.None = null;
    BUILTINS.__name__ = '__main__';
    BUILTINS.__file__ = filename;
    BUILTINS.object = new PyClass('object', [], new Map());

    /* ----- modules ----- */
    let stdinBuf = typeof c.stdin === 'string' ? c.stdin : '';
    const CP = (args, stdout, stderr, rc) => { const o = new PyInst(new PyClass('CompletedProcess', [], new Map())); o.attrs.set('args', args); o.attrs.set('stdout', stdout); o.attrs.set('stderr', stderr); o.attrs.set('returncode', rc); return o; };
    const modCache = {};
    async function importMod(name) {
      if (modCache[name]) return modCache[name];
      const venv = sh.vars.VIRTUAL_ENV;
      const sp = (venv ? venv : '/usr/lib/python3/dist-packages') + (venv ? '/lib/python3.12/site-packages' : '');
      const mods = {
        os: () => new Mod('os', {
          getcwd: bi(() => sh.cwd), listdir: bi((a) => { const n = sh.fs.lookup(c.abs(a[0] || '.')); if (!n) throw E('FileNotFoundError', `[Errno 2] No such file or directory: '${a[0]}'`); if (n.t !== 'd') throw E('NotADirectoryError', `[Errno 20] Not a directory: '${a[0]}'`); if (!sh.can(n, 4)) throw E('PermissionError', `[Errno 13] Permission denied: '${a[0]}'`); return Object.keys(n.kids).sort(); }),
          getenv: bi((a) => (a[0] in sh.vars ? sh.vars[a[0]] : a[1] === undefined ? null : a[1])), getpid: bi(() => 4242), getlogin: bi(() => sh.user), cpu_count: bi(() => 2), sep: '/', linesep: '\n', name: 'posix',
          environ: (() => { const m = new Map(); for (const k of sh.exported) if (k in sh.vars) m.set(k, sh.vars[k]); return m; })(),
          makedirs: bi((a, kw) => { try { const ex = sh.fs.lookup(c.abs(a[0])); if (ex && !truthy(a[1] === undefined ? kw.get('exist_ok') : a[1])) throw E('FileExistsError', `[Errno 17] File exists: '${a[0]}'`); sh.fs.mkdirp(c.abs(a[0]), { owner: sh.eu(), group: sh.users[sh.eu()].groups[0] }); } catch (e) { throw fsErr(e, a[0]); } return null; }),
          mkdir: bi((a) => { if (sh.fs.lookup(c.abs(a[0]))) throw E('FileExistsError', `[Errno 17] File exists: '${a[0]}'`); try { sh.mkdirOne ? sh.mkdirOne(c.abs(a[0])) : sh.fs.mkdirp(c.abs(a[0]), { owner: sh.eu(), group: sh.users[sh.eu()].groups[0] }); } catch (e) { throw fsErr(e, a[0]); } return null; }),
          remove: bi((a) => { if (!sh.fs.lookup(c.abs(a[0]))) throw E('FileNotFoundError', `[Errno 2] No such file or directory: '${a[0]}'`); try { sh.unlink(c.abs(a[0])); } catch (e) { throw fsErr(e, a[0]); } return null; }),
          system: bi(async (a) => { let b = ''; const st = await sh.runSource(a[0], { stdin: '', stdout: (s) => out(s), stderr: (s) => c.err(s), tty: false }); return st * 256; }),
          path: new Mod('os.path', {
            exists: bi((a) => !!sh.fs.lookup(c.abs(a[0]))), isfile: bi((a) => { const n = sh.fs.lookup(c.abs(a[0])); return !!n && n.t === 'f'; }), isdir: bi((a) => { const n = sh.fs.lookup(c.abs(a[0])); return !!n && n.t === 'd'; }),
            join: bi((a) => a.reduce((x, y) => (y.startsWith('/') ? y : x === '' ? y : x.endsWith('/') ? x + y : x + '/' + y), '')), basename: bi((a) => VFS.base(a[0])), dirname: bi((a) => (VFS.dirname(a[0]) === '/' && !a[0].startsWith('/') ? '' : VFS.dirname(a[0]))), abspath: bi((a) => c.abs(a[0])), expanduser: bi((a) => a[0].replace(/^~/, sh.users[sh.user].home)),
            getsize: bi((a) => { const n = sh.fs.lookup(c.abs(a[0])); if (!n) throw E('FileNotFoundError', `[Errno 2] No such file or directory: '${a[0]}'`); return VFS.size(n); }),
            splitext: bi((a) => { const m = /^(.*?)(\.[^./]*)?$/.exec(a[0]); return tup([m[1], m[2] || '']); }),
          }),
        }),
        sys: () => new Mod('sys', { argv, exit: bi((a) => { if (typeof a[0] === 'string') { c.err(a[0] + '\n'); throw new PyExit(1); } throw new PyExit(a.length && a[0] !== null ? (isInt(a[0]) ? a[0] : 1) : 0); }), version: '3.12.3 (main, Jun 18 2025, 17:59:45) [GCC 13.3.0]', platform: 'linux', executable: '/usr/bin/python3', path: ['', '/usr/lib/python312.zip'], stdout: new Mod('stdout', { write: bi((a) => { out(a[0]); return a[0].length; }), flush: bi(() => null) }), stderr: Object.assign(new Mod('stderr', { write: bi((a) => { c.err(a[0]); return a[0].length; }), flush: bi(() => null) }), { isErr: true }), stdin: new Mod('stdin', { read: bi(() => { const s = stdinBuf; stdinBuf = ''; return s; }), readline: bi(() => { const i = stdinBuf.indexOf('\n'); const l = i < 0 ? stdinBuf : stdinBuf.slice(0, i + 1); stdinBuf = stdinBuf.slice(l.length); return l; }), readlines: bi(() => { const r = stdinBuf.split(/(?<=\n)/).filter(Boolean); stdinBuf = ''; return r; }) }), maxsize: 9223372036854775807, version_info: tup([3, 12, 3]) }),
        time: () => new Mod('time', { sleep: bi(async (a) => { await sh.waitMs(Math.min(nv(a[0]) * 1000, 3000)); return null; }), time: bi(() => new F(Date.now() / 1000)), strftime: bi((a) => U.strftime(a[0], new Date())), perf_counter: bi(() => new F(performance.now() / 1000)), localtime: bi(() => tup([2026, 10, 27, 3, 0, 0, 1, 300, 0])) }),
        math: () => new Mod('math', { pi: new F(Math.PI), e: new F(Math.E), sqrt: bi((a) => { if (nv(a[0]) < 0) throw E('ValueError', 'math domain error'); return new F(Math.sqrt(nv(a[0]))); }), floor: bi((a) => Math.floor(nv(a[0]))), ceil: bi((a) => Math.ceil(nv(a[0]))), pow: bi((a) => new F(Math.pow(nv(a[0]), nv(a[1])))), log: bi((a) => new F(a[1] ? Math.log(nv(a[0])) / Math.log(nv(a[1])) : Math.log(nv(a[0])))), log2: bi((a) => new F(Math.log2(nv(a[0])))), log10: bi((a) => new F(Math.log10(nv(a[0])))), sin: bi((a) => new F(Math.sin(nv(a[0])))), cos: bi((a) => new F(Math.cos(nv(a[0])))), factorial: bi((a) => { let r = 1; for (let i = 2; i <= a[0]; i++) r *= i; return r; }), gcd: bi((a) => { let x = Math.abs(a[0]); let y = Math.abs(a[1]); while (y) [x, y] = [y, x % y]; return x; }), isqrt: bi((a) => Math.floor(Math.sqrt(a[0]))), inf: new F(Infinity) }),
        random: () => new Mod('random', { randint: bi((a) => a[0] + Math.floor(Math.random() * (a[1] - a[0] + 1))), random: bi(() => new F(Math.random())), choice: bi((a) => a[0][Math.floor(Math.random() * a[0].length)]), shuffle: bi((a) => { for (let i = a[0].length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[0][i], a[0][j]] = [a[0][j], a[0][i]]; } return null; }), seed: bi(() => null) }),
        json: () => new Mod('json', { dumps: bi(async (a, kw) => { const ind = kw.get('indent'); const conv = async (x) => (x instanceof Map ? Object.fromEntries(await Promise.all([...x].map(async ([k, v]) => [k, await conv(v)]))) : Array.isArray(x) ? await Promise.all(x.map(conv)) : isF(x) ? { __f: x.v } : x); const js = JSON.stringify(await conv(a[0]), null, ind === null || ind === undefined ? undefined : ind); return (ind == null ? js.replace(/([,:])(?=(?:[^"]*"[^"]*")*[^"]*$)/g, '$1 ') : js).replace(/\{"__f":(-?[\d.e+-]+)\}/g, (m, v) => fmtFloat(+v)).replace(/\{"__f":(-?[\d.e+-]+)\}/g, '$1'); }), loads: bi((a) => { let v; try { v = JSON.parse(a[0]); } catch (e) { throw E('json.decoder.JSONDecodeError', `${e.message.replace(/^.*?: /, '')}`); } const cv = (x) => (x === null ? null : Array.isArray(x) ? x.map(cv) : typeof x === 'object' ? new Map(Object.entries(x).map(([k, y]) => [k, cv(y)])) : typeof x === 'number' && !Number.isInteger(x) ? new F(x) : x); return cv(v); }), load: bi((a) => { const t = a[0].buf; let v; try { v = JSON.parse(t); } catch (e) { throw E('json.decoder.JSONDecodeError', e.message); } const cv = (x) => (x === null ? null : Array.isArray(x) ? x.map(cv) : typeof x === 'object' ? new Map(Object.entries(x).map(([k, y]) => [k, cv(y)])) : typeof x === 'number' && !Number.isInteger(x) ? new F(x) : x); return cv(v); }) }),
        subprocess: () => new Mod('subprocess', {
          PIPE: -1, STDOUT: -2, DEVNULL: -3,
          CalledProcessError: exc('CalledProcessError'),
          run: bi(async (a, kw) => {
            const cmd = a[0];
            const shell = truthy(kw.get('shell'));
            const line = Array.isArray(cmd) ? (shell ? cmd.join(' ') : cmd.map((x) => (/^[\w@%+=:,./-]+$/.test(x) ? x : "'" + x.replace(/'/g, "'\\''") + "'")).join(' ')) : cmd;
            let so = '';
            let se = '';
            const capture = truthy(kw.get('capture_output')) || kw.get('stdout') === -1;
            const st = await sh.runSource(line, { stdin: kw.get('input') || '', stdout: (s) => (capture ? (so += s) : out(s)), stderr: (s) => (capture || kw.get('stderr') === -1 ? (se += s) : c.err(s)), tty: false });
            if (truthy(kw.get('check')) && st !== 0) { const e = E('subprocess.CalledProcessError', `Command '${line}' returned non-zero exit status ${st}.`); throw e; }
            return CP(cmd, capture ? so : null, capture || kw.get('stderr') === -1 ? se : null, st);
          }),
          check_output: bi(async (a, kw) => { let so = ''; const cmd = a[0]; const line = Array.isArray(cmd) ? cmd.join(' ') : cmd; const st = await sh.runSource(line, { stdin: '', stdout: (s) => (so += s), stderr: (s) => c.err(s), tty: false }); if (st !== 0) throw E('subprocess.CalledProcessError', `Command '${line}' returned non-zero exit status ${st}.`); return so; }),
          call: bi(async (a) => { const cmd = a[0]; return await sh.runSource(Array.isArray(cmd) ? cmd.join(' ') : cmd, { stdin: '', stdout: out, stderr: (s) => c.err(s), tty: false }); }),
        }),
        shutil: () => new Mod('shutil', { which: bi((a) => { for (const d of sh.vars.PATH.split(':')) { const n = sh.fs.lookup(d + '/' + a[0]); if (n) return d + '/' + a[0]; } return null; }), copy: bi(async (a) => { await sh.runSource(`cp '${a[0]}' '${a[1]}'`, { stdin: '', stdout: out, stderr: (s) => c.err(s) }); return a[1]; }), rmtree: bi(async (a) => { await sh.runSource(`rm -rf '${a[0]}'`, { stdin: '', stdout: out, stderr: (s) => c.err(s) }); return null; }), disk_usage: bi(() => tup([21474836480, 8589934592, 12884901888])) }),
        platform: () => new Mod('platform', { system: bi(() => 'Linux'), node: bi(() => sh.hostname || 'linux-school'), release: bi(() => '6.8.0-45-generic'), machine: bi(() => 'x86_64'), python_version: bi(() => '3.12.3') }),
        socket: () => new Mod('socket', { gethostname: bi(() => sh.hostname || 'linux-school'), gethostbyname: bi((a) => { const ip = sh.resolveHost(a[0]); if (!ip) throw E('socket.gaierror', '[Errno -2] Name or service not known'); return ip; }) }),
        datetime: () => { const mk = (d) => { const o = new PyInst(new PyClass('datetime', [], new Map())); o.attrs.set('year', d.getFullYear()); o.attrs.set('month', d.getMonth() + 1); o.attrs.set('day', d.getDate()); o.attrs.set('hour', d.getHours()); o.attrs.set('minute', d.getMinutes()); o.attrs.set('second', d.getSeconds()); o.attrs.set('strftime', bi((a) => U.strftime(a[0], d))); o.attrs.set('isoformat', bi(() => d.toISOString().slice(0, 19))); o.attrs.set('__str__', bi(() => U.strftime('%F %H:%M:%S', d))); o.cls.attrs.set('__str__', new PyFunc('__str__', [{ name: 'self' }], [], root)); o.pyrepr = U.strftime('%F %H:%M:%S', d); return o; }; const cls = new Mod('datetime.datetime', { now: bi(() => mk(new Date())) }); return new Mod('datetime', { datetime: cls, date: cls, timedelta: bi(() => 0) }); },
        re: () => {
          const flagStr = (f) => (f & 2 ? 'i' : '') + (f & 8 ? 'm' : '') + (f & 16 ? 's' : '');
          const conv = (p) => p.replace(/\(\?P<(\w+)>/g, '(?<$1>').replace(/\(\?P=(\w+)\)/g, '\\k<$1>').replace(/\\Z/g, '$').replace(/\\A/g, '^');
          const mkRx = (p, f, extra) => new RegExp(conv(String(p)), flagStr(f || 0) + (extra || ''));
          const mkm = (m) => {
            if (!m) return null;
            const o = new PyInst(new PyClass('Match', [], new Map()));
            const grp = (k) => { const v = typeof k === 'string' ? (m.groups || {})[k] : m[k]; if (typeof k === 'number' && k >= m.length) throw E('IndexError', 'no such group'); return v === undefined ? null : v; };
            o.attrs.set('group', bi((a) => (a.length === 0 ? m[0] : a.length === 1 ? grp(a[0]) : tup(a.map(grp)))));
            o.attrs.set('groups', bi(() => tup(m.slice(1).map((x) => (x === undefined ? null : x)))));
            o.attrs.set('start', bi(() => m.index));
            o.attrs.set('end', bi(() => m.index + m[0].length));
            o.attrs.set('span', bi(() => tup([m.index, m.index + m[0].length])));
            o.attrs.set('groupdict', bi(() => new Map(Object.entries(m.groups || {}))));
            o.attrs.set('__getitem__', bi((a) => grp(a[0])));
            o.pyrepr = `<re.Match object; span=(${m.index}, ${m.index + m[0].length}), match=${reprStr(m[0])}>`;
            return o;
          };
          const first = (p, f, text, anchor) => {
            const src = anchor === 'start' ? '^(?:' + conv(String(p)) + ')' : anchor === 'full' ? '^(?:' + conv(String(p)) + ')$' : conv(String(p));
            return new RegExp(src, flagStr(f || 0)).exec(text);
          };
          const fa = (p, f, text) => [...text.matchAll(mkRx(p, f, 'g'))].map((m) => (m.length > 2 ? tup(m.slice(1).map((x) => (x === undefined ? '' : x))) : m.length === 2 ? (m[1] === undefined ? '' : m[1]) : m[0]));
          const fi = (p, f, text) => [...text.matchAll(mkRx(p, f, 'g'))].map(mkm);
          const subImpl = async (p, repl, text, count, f) => {
            let n = 0;
            const re = mkRx(p, f, 'g');
            let out2 = '';
            let last = 0;
            let m;
            while ((m = re.exec(text)) !== null) {
              if (count && n >= count) break;
              out2 += text.slice(last, m.index);
              if (typeof repl === 'string') out2 += repl.replace(/\\(\d+)/g, (_, d) => m[+d] || '').replace(/\\g<(\w+)>/g, (_, nm) => (m.groups || {})[nm] || m[+nm] || '').replace(/\\n/g, '\n');
              else out2 += String(await call(repl, [mkm(m)], []));
              last = m.index + m[0].length;
              n++;
              if (m[0] === '') re.lastIndex++;
            }
            return [out2 + text.slice(last), n];
          };
          const splitImpl = (p, text, maxsplit, f) => { const parts = []; const re = mkRx(p, f, 'g'); let last = 0; let m; let k = 0; while ((m = re.exec(text)) !== null) { if (maxsplit && k >= maxsplit) break; if (m[0] === '') { re.lastIndex++; continue; } parts.push(text.slice(last, m.index), ...m.slice(1).filter((x) => x !== undefined)); last = m.index + m[0].length; k++; } parts.push(text.slice(last)); return parts; };
          const fl = (kw) => (kw && kw.get ? kw.get('flags') || 0 : 0);
          return new Mod('re', {
            IGNORECASE: 2, I: 2, MULTILINE: 8, M: 8, DOTALL: 16, S: 16, VERBOSE: 64, X: 64,
            escape: bi((a) => String(a[0]).replace(/[^A-Za-z0-9_]/g, (ch) => '\\' + ch)),
            match: bi((a, kw) => mkm(first(a[0], a[2] || fl(kw), a[1], 'start'))),
            fullmatch: bi((a, kw) => mkm(first(a[0], a[2] || fl(kw), a[1], 'full'))),
            search: bi((a, kw) => mkm(first(a[0], a[2] || fl(kw), a[1]))),
            findall: bi((a, kw) => fa(a[0], a[2] || fl(kw), a[1])),
            finditer: bi((a, kw) => fi(a[0], a[2] || fl(kw), a[1])),
            sub: bi(async (a, kw) => (await subImpl(a[0], a[1], a[2], a[3] || (kw && kw.get('count')) || 0, a[4] || fl(kw)))[0]),
            subn: bi(async (a, kw) => tup(await subImpl(a[0], a[1], a[2], a[3] || 0, a[4] || fl(kw)))),
            split: bi((a, kw) => splitImpl(a[0], a[1], a[2] || (kw && kw.get('maxsplit')) || 0, a[3] || fl(kw))),
            compile: bi((a) => {
              const o = new PyInst(new PyClass('Pattern', [], new Map()));
              const f = a[1] || 0;
              const p = a[0];
              o.attrs.set('pattern', String(p));
              o.attrs.set('match', bi((b) => mkm(first(p, f, b[0], 'start'))));
              o.attrs.set('fullmatch', bi((b) => mkm(first(p, f, b[0], 'full'))));
              o.attrs.set('search', bi((b) => mkm(first(p, f, b[0]))));
              o.attrs.set('findall', bi((b) => fa(p, f, b[0])));
              o.attrs.set('finditer', bi((b) => fi(p, f, b[0])));
              o.attrs.set('sub', bi(async (b) => (await subImpl(p, b[0], b[1], b[2] || 0, f))[0]));
              o.attrs.set('split', bi((b) => splitImpl(p, b[0], b[1] || 0, f)));
              return o;
            }),
          });
        },        collections: () => new Mod('collections', { Counter: bi(async (a) => { const m = new Map(); m.__counter = true; if (a[0] instanceof Map) a[0].forEach((v, k) => m.set(k, v)); else for (const x of a[0] ? await iter(a[0]) : []) m.set(toKey(x), (m.get(toKey(x)) || 0) + 1); return m; }), defaultdict: bi((a) => { const m = new Map(); m.__factory = a[0] || null; return m; }), OrderedDict: bi(() => new Map()) }),
        argparse: null,
        pathlib: null,
        getpass: () => new Mod('getpass', { getuser: bi(() => sh.user), getpass: bi(async (a) => (sh.hooks.readLine ? await sh.hooks.readLine(a[0] || 'Password: ', { secret: true }) : '')) }),
        'os.path': () => importMod('os').then((m) => m.attrs.path),
      };
      // extra os / shutil functions
      const sysq = (x) => "'" + String(x).replace(/'/g, "'\\''") + "'";
      const shRun = async (cmd) => { let er = ''; const st = await sh.runSource(cmd, { stdin: '', stdout: () => {}, stderr: (t) => (er += t), tty: false }); return [st, er]; };
      const statObj = (n) => { const o = new PyInst(new PyClass('stat_result', [], new Map())); o.attrs.set('st_size', VFS.size(n)); o.attrs.set('st_mode', (n.t === 'd' ? 0o40000 : n.t === 'l' ? 0o120000 : 0o100000) | n.mode); o.attrs.set('st_mtime', new F((n.mtime || Date.now()) / 1000)); o.attrs.set('st_uid', (sh.users[n.owner] || { uid: 0 }).uid); o.attrs.set('st_gid', 1000); o.attrs.set('st_nlink', 1); return o; };
      const jsonBase = mods.json;
      mods.json = () => {
        const m = jsonBase();
        m.attrs.dump = bi(async (a, kw) => { const txt = await m.attrs.dumps([a[0]], kw); await call(await getAttr(a[1], 'write'), [txt], new Map()); return null; });
        return m;
      };
      const osBase = mods.os;
      mods.os = () => {
        const m = osBase();
        const miss = (p) => E('FileNotFoundError', `[Errno 2] No such file or directory: '${p}'`);
        Object.assign(m.attrs, {
          rename: bi(async (a) => { const [st, er] = await shRun(`mv ${sysq(a[0])} ${sysq(a[1])}`); if (st) throw miss(a[0]); return null; }),
          replace: bi(async (a) => { const [st] = await shRun(`mv ${sysq(a[0])} ${sysq(a[1])}`); if (st) throw miss(a[0]); return null; }),
          rmdir: bi(async (a) => { const [st, er] = await shRun(`rmdir ${sysq(a[0])}`); if (st) throw E(/not empty/.test(er) ? 'OSError' : 'FileNotFoundError', /not empty/.test(er) ? `[Errno 39] Directory not empty: '${a[0]}'` : `[Errno 2] No such file or directory: '${a[0]}'`); return null; }),
          unlink: m.attrs.remove,
          chmod: bi(async (a) => { await shRun(`chmod ${(a[1] & 0o7777).toString(8)} ${sysq(a[0])}`); return null; }),
          chdir: bi((a) => { const n = sh.fs.lookup(c.abs(a[0])); if (!n) throw miss(a[0]); if (n.t !== 'd') throw E('NotADirectoryError', `[Errno 20] Not a directory: '${a[0]}'`); sh.cwd = c.abs(a[0]); return null; }),
          getuid: bi(() => (sh.users[sh.user] || { uid: 1000 }).uid), geteuid: bi(() => (sh.users[sh.eu()] || { uid: 1000 }).uid),
          stat: bi((a) => { const n = sh.fs.lookup(c.abs(a[0])); if (!n) throw miss(a[0]); return statObj(n); }),
          walk: bi((a) => {
            const out2 = [];
            const rec = (dir) => {
              const n = sh.fs.lookup(c.abs(dir));
              if (!n || n.t !== 'd') return;
              const names = Object.keys(n.kids).sort();
              const dirs = names.filter((k) => { const kn = n.kids[k]; return kn.t === 'd'; });
              const files = names.filter((k) => n.kids[k].t !== 'd');
              out2.push(tup([dir, dirs.slice(), files]));
              for (const d of dirs) rec((dir.endsWith('/') ? dir : dir + '/') + d);
            };
            rec(a[0]);
            return out2;
          }),
          kill: bi(() => null), uname: bi(() => tup(['Linux', sh.hostname || 'linux-school', '6.8.0-45-generic', '#45-Ubuntu SMP', 'x86_64'])),
        });
        const pm = m.attrs.path;
        Object.assign(pm.attrs, {
          getmtime: bi((a) => { const n = sh.fs.lookup(c.abs(a[0])); if (!n) throw miss(a[0]); return new F((n.mtime || Date.now()) / 1000); }),
          islink: bi((a) => { const n = sh.fs.lookup(c.abs(a[0]), false); return !!n && n.t === 'l'; }),
          lexists: bi((a) => !!sh.fs.lookup(c.abs(a[0]), false)),
          isabs: bi((a) => String(a[0]).startsWith('/')),
          split: bi((a) => { const p = String(a[0]); const i = p.lastIndexOf('/'); return tup(i < 0 ? ['', p] : [i === 0 ? '/' : p.slice(0, i), p.slice(i + 1)]); }),
          normpath: bi((a) => VFS.norm(String(a[0]) || '.', '/').replace(/^\/$/, '/') || '.'),
          realpath: pm.attrs.abspath,
          relpath: bi((a) => { const base = c.abs(a[1] || sh.cwd).split('/').filter(Boolean); const p = c.abs(a[0]).split('/').filter(Boolean); let i = 0; while (i < base.length && i < p.length && base[i] === p[i]) i++; return [...base.slice(i).map(() => '..'), ...p.slice(i)].join('/') || '.'; }),
          sep: '/',
        });
        return m;
      };
      const shBase = mods.shutil;
      mods.shutil = () => {
        const m = shBase();
        Object.assign(m.attrs, {
          copy2: m.attrs.copy,
          copyfile: m.attrs.copy,
          copytree: bi(async (a) => { const [st, er] = await shRun(`cp -r ${sysq(a[0])} ${sysq(a[1])}`); if (st) throw E('FileNotFoundError', `[Errno 2] No such file or directory: '${a[0]}'`); return a[1]; }),
          move: bi(async (a) => { const [st] = await shRun(`mv ${sysq(a[0])} ${sysq(a[1])}`); if (st) throw E('FileNotFoundError', `[Errno 2] No such file or directory: '${a[0]}'`); return a[1]; }),
        });
        return m;
      };
      mods.hashlib = () => {
        const mk = (algo, label) => bi((a) => {
          const o = new PyInst(new PyClass('hash', [], new Map()));
          let data = a.length && a[0] !== null ? String(a[0]) : '';
          o.attrs.set('name', label);
          o.attrs.set('hexdigest', bi(async () => LX.digest(algo, data)));
          o.attrs.set('update', bi((b) => { data += String(b[0]); return null; }));
          return o;
        });
        return new Mod('hashlib', { sha256: mk('SHA-256', 'sha256'), sha1: mk('SHA-1', 'sha1'), sha512: mk('SHA-512', 'sha512'), sha384: mk('SHA-384', 'sha384'), md5: mk('md5', 'md5'), new: bi((a) => ({ sha256: mk('SHA-256'), sha1: mk('SHA-1'), sha512: mk('SHA-512'), md5: mk('md5') }[a[0]] || mk('SHA-256'))(a.slice(1))) });
      };
      mods.base64 = () => new Mod('base64', {
        b64encode: bi((a) => btoa(unescape(encodeURIComponent(String(a[0]))))),
        b64decode: bi((a) => { try { return decodeURIComponent(escape(atob(String(a[0])))); } catch (e) { throw E('binascii.Error', 'Incorrect padding'); } }),
      });
      mods.uuid = () => new Mod('uuid', { uuid4: bi(() => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => { const r = Math.floor(Math.random() * 16); return (ch === 'x' ? r : (r & 3) | 8).toString(16); })) });
      const urlMod = () => {
        const parseM = new Mod('urllib.parse', {
          quote: bi((a) => encodeURIComponent(String(a[0])).replace(/%2F/g, '/')), quote_plus: bi((a) => encodeURIComponent(String(a[0])).replace(/%20/g, '+')), unquote: bi((a) => decodeURIComponent(String(a[0]))),
          urlencode: bi((a) => (a[0] instanceof Map ? [...a[0]] : a[0]).map(([k, v]) => encodeURIComponent(String(k)) + '=' + encodeURIComponent(String(v))).join('&')),
        });
        const reqM = new Mod('urllib.request', {
          urlopen: bi(async (a) => {
            const u = typeof a[0] === 'string' ? a[0] : String(a[0]);
            const r = await LX.httpRequest(sh, urlParts(u));
            if (r.err) throw E('urllib.error.URLError', `<urlopen error [Errno -2] Name or service not known>`);
            if (r.status >= 400) throw E('urllib.error.HTTPError', `HTTP Error ${r.status}: ${r.status === 404 ? 'Not Found' : 'Error'}`);
            const o = new PyInst(new PyClass('HTTPResponse', [], new Map()));
            o.attrs.set('status', r.status);
            o.attrs.set('read', bi(() => r.body || ''));
            o.attrs.set('getcode', bi(() => r.status));
            o.attrs.set('close', bi(() => null));
            o.attrs.set('__enter__', bi(() => o));
            o.attrs.set('__exit__', bi(() => false));
            return o;
          }),
        });
        return { parseM, reqM };
      };
      mods.urllib = () => { const { parseM, reqM } = urlMod(); return new Mod('urllib', { request: reqM, parse: parseM }); };
      mods['urllib.request'] = () => urlMod().reqM;
      mods['urllib.parse'] = () => urlMod().parseM;
      const colBase = mods.collections;
      mods.collections = async () => {
        const m = await colBase();
        if (!('namedtuple' in m.attrs)) {
          const menv = new Env(root, false);
          await run(parse(LX.pyLib._collections_extra), menv);
          m.attrs.namedtuple = menv.vars.get('namedtuple');
        }
        return m;
      };
      if (!mods[name] && LX.pyLib && LX.pyLib[name]) {
        const menv = new Env(root, false);
        await run(parse(LX.pyLib[name]), menv);
        const attrs = {};
        for (const [k, v] of menv.vars) attrs[k] = v;
        const lm = new Mod(name, attrs);
        modCache[name] = lm;
        return lm;
      }
      if (mods[name]) { const m = await mods[name](); modCache[name] = m; return m; }
      // pip-installed (venv) package?
      const top = name.split('.')[0];
      const dist = sh.fs.lookup(sp + '/' + top);
      if (dist) {
        const m = new Mod(top, { __version__: '1.0', __name__: top, get: bi(() => { throw E('ConnectionError', 'sandbox has no real internet'); }) });
        if (top === 'requests') m.attrs.get = bi(async (a) => { const r = await LX.httpRequest(sh, urlParts(a[0])); const o = new PyInst(new PyClass('Response', [], new Map())); o.attrs.set('status_code', r.status); o.attrs.set('text', r.body || ''); o.attrs.set('ok', r.status < 400); o.attrs.set('json', bi(() => mods.json().attrs.loads.call(null, [r.body], new Map()))); o.attrs.set('raise_for_status', bi(() => { if (r.status >= 400) throw E('requests.exceptions.HTTPError', `${r.status} Error for url: ${a[0]}`); return null; })); return o; });
        modCache[name] = m;
        return m;
      }
      throw E('ModuleNotFoundError', `No module named '${name}'`);
    }
    const urlParts = (u) => { const m = /^(https?):\/\/([^/:]+)(?::(\d+))?(\/.*)?$/.exec(u) || []; return { host: m[2], port: +(m[3] || (m[1] === 'https' ? 443 : 80)), path: m[4] || '/', scheme: m[1], hostHeader: m[2], ua: 'python-requests/2.31.0' }; };
    return {
      async runModule(src, isRepl) {
        replMode = !!isRepl;
        const ast = parse(src);
        const d0 = ast[0];
        root.vars.set('__doc__', d0 && d0.k === 'expr' && d0.e && d0.e.k === 'str' ? d0.e.v : null);
        return await run(ast, root);
      },
      root,
      async replLine(src) { replMode = true; const ast = parse(src); return await run(ast, root); },
      repr,
      argvSet: (a) => { argv.length = 0; argv.push(...a); },
      line: () => curLine,
      closeAll: () => openFiles.forEach(closeFile),
    };
  }

  /* ---------- python3 command ---------- */
  const origPy = LX.cmds.python3.run;
  const fmtTb = (e, filename, src, interp) => {
    const name = e instanceof PyInst ? e.cls.name : e.pytype;
    const msg = e instanceof PyInst ? (e.attrs.has('args') && e.attrs.get('args').length ? String(e.attrs.get('args')[0]) : '') : e.pymsg;
    const lines = (e.callLines || []).slice().reverse().concat([e.line || interp.line()]);
    const names = ['<module>'].concat((e.fnNames || []).slice().reverse());
    const srcL = src.split('\n');
    let o = 'Traceback (most recent call last):\n';
    lines.forEach((ln, i) => {
      o += `  File "${filename}", line ${ln}, in ${names[i] || '<module>'}\n`;
      if (filename !== '<stdin>' && filename !== '<string>' && srcL[ln - 1] !== undefined) o += `    ${srcL[ln - 1].trim()}\n`;
    });
    return o + (msg !== '' ? `${name}: ${msg}` : name) + '\n';
  };
  async function execPy(c, src, filename, argv) {
    const interp = makeInterp(c, filename, argv);
    try {
      await interp.runModule(src, false);
      interp.closeAll();
      return 0;
    } catch (e) {
      interp.closeAll();
      if (e instanceof PyExit) return e.code;
      if (e instanceof PyErr && ['SyntaxError', 'IndentationError'].includes(e.pytype)) {
        c.err(`  File "${filename}", line ${e.line || 1}\n    ${(src.split('\n')[(e.line || 1) - 1] || '').trim()}\n${e.pytype}: ${e.pymsg}\n`);
        return 1;
      }
      if (e instanceof PyErr || e instanceof PyInst) {
        c.err(fmtTb(e, filename, src, interp));
        return 1;
      }
      if (e instanceof FsErr) { c.err(`Traceback (most recent call last):\n  File "${filename}", line ${interp.line()}, in <module>\nOSError: ${U.errTxt(e)}\n`); return 1; }
      throw e;
    }
  }

  /* ---- the python3 command ---- */
  def('python3', async (c, args) => {
    const sh = c.sh;
    const A = args.slice();
    if (A[0] === '--version' || A[0] === '-V') return c.out('Python 3.12.3\n');
    const mi = A.indexOf('-m');
    if (mi === 0 || (mi > 0 && A.slice(0, mi).every((x) => x.startsWith('-')))) {
      const mod = A[mi + 1];
      if (mod === 'venv') return await venvCmd(c, A.slice(mi + 2));
      if (mod === 'pip') return await pipCmd(c, A.slice(mi + 2), 'python3 -m pip');
      if (mod === 'json.tool') {
        const txt = await c.slurp();
        try { c.out(JSON.stringify(JSON.parse(txt), null, 4) + '\n'); return 0; } catch (e) { c.err('Expecting value: line 1 column 1 (char 0)\n'); return 1; }
      }
      if (mod === 'http.server' || mod === 'ensurepip') return await origPy(c, A);
      if (mod === 'this') return c.out('The Zen of Python, by Tim Peters\n\nBeautiful is better than ugly.\nExplicit is better than implicit.\nSimple is better than complex.\nComplex is better than complicated.\nFlat is better than nested.\nSparse is better than dense.\nReadability counts.\n');
      c.err(`/usr/bin/python3: No module named ${mod}\n`);
      return 1;
    }
    const ci = A.indexOf('-c');
    if (ci >= 0) return await execPy(c, A[ci + 1] || '', '<string>', ['-c', ...A.slice(ci + 2)]);
    const f = A.find((a) => !a.startsWith('-'));
    if (f && f !== '-') {
      const abs = c.abs(f);
      const n = sh.fs.lookup(abs);
      if (!n) { c.err(`python3: can't open file '${abs}': [Errno 2] No such file or directory\n`); return 2; }
      if (n.t === 'd') { c.err(`python3: can't find '__main__' module in '${abs}'\n`); return 1; }
      if (!sh.can(n, 4)) { c.err(`python3: can't open file '${abs}': [Errno 13] Permission denied\n`); return 2; }
      return await execPy(c, sh.readFile(abs), abs, [f, ...A.slice(A.indexOf(f) + 1)]);
    }
    if (c.stdin !== null && c.stdin !== undefined && c.stdin !== '' || A[0] === '-') { const s = await c.slurp(); return await execPy(c, s, '<stdin>', ['-']); }
    // REPL
    if (!sh.hooks.readLine) { c.out('Python 3.12.3 (main) [GCC 13.3.0] on linux\n'); return 0; }
    c.out('Python 3.12.3 (main, Jun 18 2025, 17:59:45) [GCC 13.3.0] on linux\nType "help", "copyright", "credits" or "license" for more information.\n');
    const I = makeInterp(c, '<stdin>', []);
    I.argvSet(['']);
    for (;;) {
      let line = await sh.hooks.readLine('>>> ');
      sh.checkAbort();
      if (line === null || line === undefined) { c.out('\n'); return 0; }
      let src = line;
      if (/:\s*$/.test(line) || /^\s*@/.test(line)) {
        for (;;) {
          const more = await sh.hooks.readLine('... ');
          sh.checkAbort();
          if (more === null || more === undefined || more.trim() === '') break;
          src += '\n' + more;
        }
        src += '\n';
      }
      if (/^(exit|quit)\(\)$/.test(src.trim()) || /^(exit|quit)$/.test(src.trim())) return 0;
      try {
        await I.replLine(src + '\n');
      } catch (e) {
        if (e instanceof PyExit) return e.code;
        if (e instanceof PyErr || e instanceof PyInst) {
          const name = e instanceof PyInst ? e.cls.name : e.pytype;
          const msg = e instanceof PyInst ? '' : e.pymsg;
          c.err(`Traceback (most recent call last):\n  File "<stdin>", line 1, in <module>\n${msg !== '' ? name + ': ' + msg : name}\n`);
        } else if (e instanceof FsErr) c.err(`OSError: ${U.errTxt(e)}\n`);
        else throw e;
      }
    }
  });
  LX.cmds.python = Object.assign({}, LX.cmds.python3, { name: 'python' });
  def('python3.12', (c, a) => LX.cmds.python3.run(c, a));

  /* run executable python scripts via shebang */
  const origExec = P.execNode;
  P.execNode = async function (n, name, args, io) {
    if (n.t === 'f' && typeof n.content === 'string' && /^#!.*python/.test(n.content) && this.can(n, 1) && this.can(n, 4)) return await this.invoke(LX.cmds.python3, 'python3', [name, ...args], io);
    return await origExec.call(this, n, name, args, io);
  };

  /* ---------- venv + pip ---------- */
  const PIP = {
    requests: ['2.32.3', 'Python HTTP for Humans.', ['urllib3', 'idna', 'certifi', 'charset-normalizer']],
    flask: ['3.0.3', 'A simple framework for building complex web applications.', ['werkzeug', 'jinja2', 'click', 'itsdangerous', 'blinker']],
    numpy: ['2.1.1', 'Fundamental package for array computing in Python', []],
    pandas: ['2.2.3', 'Powerful data structures for data analysis, time series, and statistics', ['numpy', 'python-dateutil', 'pytz']],
    pyyaml: ['6.0.2', 'YAML parser and emitter for Python', []],
    boto3: ['1.35.30', 'The AWS SDK for Python', ['botocore', 'jmespath', 's3transfer']],
    psutil: ['6.0.0', 'Cross-platform lib for process and system monitoring in Python.', []],
    paramiko: ['3.5.0', 'SSH2 protocol library', ['cryptography', 'bcrypt', 'pynacl']],
    ansible: ['10.4.0', 'Radically simple IT automation', ['ansible-core']],
    pytest: ['8.3.3', 'pytest: simple powerful testing with Python', ['iniconfig', 'packaging', 'pluggy']],
    black: ['24.8.0', 'The uncompromising code formatter.', ['click']],
  };
  const pipRoot = (sh) => (sh.vars.VIRTUAL_ENV ? sh.vars.VIRTUAL_ENV + '/lib/python3.12/site-packages' : null);
  async function venvCmd(c, args) {
    const sh = c.sh;
    const dir = args.filter((a) => !a.startsWith('-'))[0];
    if (!dir) { c.err('usage: venv [-h] [--system-site-packages] [--symlinks | --copies] [--clear] [--upgrade] [--without-pip] [--prompt PROMPT] [--upgrade-deps] ENV_DIR [ENV_DIR ...]\nvenv: error: the following arguments are required: ENV_DIR\n'); return 2; }
    if (!sh.installed.has('python3-venv')) {
      c.err(`The virtual environment was not created successfully because ensurepip is not\navailable.  On Debian/Ubuntu systems, you need to install the python3-venv\npackage using the following command.\n\n    apt install python3.12-venv\n\nYou may need to use sudo with that command.  After installing the python3-venv\npackage, recreate your virtual environment.\n\nFailed Creating virtual environment\n`);
      return 1;
    }
    const abs = c.abs(dir);
    const name = VFS.base(abs);
    try {
      const mk = (p) => sh.fs.mkdirp(p, { owner: sh.eu(), group: sh.users[sh.eu()].groups[0] });
      ['bin', 'include', 'lib/python3.12/site-packages'].forEach((d) => mk(abs + '/' + d));
      sh.writeFile(abs + '/pyvenv.cfg', `home = /usr/bin\ninclude-system-site-packages = false\nversion = 3.12.3\nexecutable = /usr/bin/python3.12\ncommand = /usr/bin/python3 -m venv ${abs}\n`, false);
      const act = `# This file must be used with "source bin/activate" *from bash*\n# You cannot run it directly\n\ndeactivate () {\n    if [ -n "\${_OLD_VIRTUAL_PATH:-}" ] ; then\n        PATH="\${_OLD_VIRTUAL_PATH:-}"\n        export PATH\n        unset _OLD_VIRTUAL_PATH\n    fi\n    if [ -n "\${_OLD_VIRTUAL_PS1:-}" ] ; then\n        PS1="\${_OLD_VIRTUAL_PS1:-}"\n        export PS1\n        unset _OLD_VIRTUAL_PS1\n    fi\n    unset VIRTUAL_ENV\n    unset VIRTUAL_ENV_PROMPT\n    unset -f deactivate\n}\n\nVIRTUAL_ENV=${abs}\nexport VIRTUAL_ENV\n\n_OLD_VIRTUAL_PATH="$PATH"\nPATH="$VIRTUAL_ENV/bin:$PATH"\nexport PATH\n\n_OLD_VIRTUAL_PS1="\${PS1:-}"\nPS1="(${name}) \${PS1:-}"\nexport PS1\nVIRTUAL_ENV_PROMPT="(${name}) "\nexport VIRTUAL_ENV_PROMPT\n`;
      sh.writeFile(abs + '/bin/activate', act, false);
      for (const b of ['python', 'python3', 'python3.12']) sh.fs.lookup(abs + '/bin').kids[b] = sh.fs.mk('l', { owner: sh.eu(), group: sh.users[sh.eu()].groups[0], target: '/usr/bin/python3', mode: 0o777 });
      for (const b of ['pip', 'pip3']) sh.fs.lookup(abs + '/bin').kids[b] = sh.fs.mk('f', { owner: sh.eu(), group: sh.users[sh.eu()].groups[0], mode: 0o755, exe: 'pip' });
      for (const p of ['pip-24.0']) mk(abs + '/lib/python3.12/site-packages/' + p.replace('-', '-') + '.dist-info');
      mk(abs + '/lib/python3.12/site-packages/pip');
    } catch (e) {
      if (!(e instanceof FsErr)) throw e;
      c.err(`Error: [Errno 13] Permission denied: '${abs}'\n`);
      return 1;
    }
    return 0;
  }
  const norm = (n) => n.toLowerCase().replace(/_/g, '-');
  function installed(sh) {
    const sp = pipRoot(sh);
    const base = sp ? [] : [];
    const res = new Map();
    if (sp) {
      const d = sh.fs.lookup(sp);
      if (d) for (const k of Object.keys(d.kids)) { const m = /^(.+?)-([\d.]+)\.dist-info$/.exec(k); if (m) res.set(norm(m[1]), m[2]); }
    } else {
      const d = sh.sysPip || (sh.sysPip = new Map());
      d.forEach((v, k) => res.set(k, v));
    }
    return res;
  }
  async function pipCmd(c, args, label) {
    const sh = c.sh;
    const sub = args[0];
    const sp = pipRoot(sh);
    if (!sub || sub === 'help') { c.out('\nUsage:   \n  pip <command> [options]\n\nCommands:\n  install                     Install packages.\n  uninstall                   Uninstall packages.\n  freeze                      Output installed packages in requirements format.\n  list                        List installed packages.\n  show                        Show information about installed packages.\n  check                       Verify installed packages have compatible dependencies.\n'); return 0; }
    if (sub === '--version') return c.out(`pip 24.0 from ${sp ? sp : '/usr/lib/python3/dist-packages'}/pip (python 3.12)\n`);
    const inst = installed(sh);
    if (sub === 'install') {
      const reqI = args.indexOf('-r');
      let names = args.slice(1).filter((a, i) => !a.startsWith('-') && !(reqI >= 0 && i === reqI));
      if (reqI >= 0) {
        const n = sh.fs.lookup(c.abs(args[reqI + 1]));
        if (!n) { c.err(`ERROR: Could not open requirements file: [Errno 2] No such file or directory: '${args[reqI + 1]}'\n`); return 1; }
        names = (n.content || '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      }
      if (!names.length) { c.err('ERROR: You must give at least one requirement to install (see "pip help install")\n'); return 1; }
      if (!sp && !args.includes('--break-system-packages') && !args.includes('--user')) {
        c.err(`error: externally-managed-environment\n\n× This environment is externally managed\n╰─> To install Python packages system-wide, try apt install\n    python3-xyz, where xyz is the package you are trying to\n    install.\n    \n    If you wish to install a non-Debian-packaged Python package,\n    create a virtual environment using python3 -m venv path/to/venv.\n    Then use path/to/venv/bin/python and path/to/venv/bin/pip. Make\n    sure you have python3-full installed.\n    \n    If you wish to install a non-Debian packaged Python application,\n    it may be easiest to use pipx install xyz, which will manage a\n    virtual environment for you. Make sure you have pipx installed.\n    \n    See /usr/share/doc/python3.12/README.venv for more information.\n\nnote: If you believe this is a mistake, please contact your Python installation or OS distribution provider. You can override this, at the risk of breaking your Python installation or OS, by passing --break-system-packages.\nhint: See PEP 668 for the detailed specification.\n`);
        return 1;
      }
      if (!sh.netUp()) {
        for (const nm of names.slice(0, 1)) c.err(`WARNING: Retrying (Retry(total=4, connect=None, read=None, redirect=None, status=None)) after connection broken by 'NewConnectionError(\"<pip._vendor.urllib3.connection.HTTPSConnection object at 0x7f1c2b>: Failed to establish a new connection: [Errno -3] Temporary failure in name resolution\")': /simple/${norm(nm.split(/[=<>~]/)[0])}/\nERROR: Could not find a version that satisfies the requirement ${nm} (from versions: none)\nERROR: No matching distribution found for ${nm}\n`);
        return 1;
      }
      const added = [];
      for (const spec of names) {
        const m = /^([A-Za-z0-9_.-]+)(?:==([\w.]+))?/.exec(spec);
        const nm = norm(m[1]);
        if (!PIP[nm]) { c.err(`ERROR: Could not find a version that satisfies the requirement ${spec} (from versions: none)\nERROR: No matching distribution found for ${spec}\n`); return 1; }
        if (inst.has(nm) && !args.includes('--upgrade') && !args.includes('-U') && !m[2]) { c.out(`Requirement already satisfied: ${nm} in ${sp || '/usr/lib/python3/dist-packages'} (${inst.get(nm)})\n`); continue; }
        const ver = m[2] || PIP[nm][0];
        const DV = { urllib3: '2.2.3', idna: '3.10', certifi: '2024.8.30', 'charset-normalizer': '3.3.2', werkzeug: '3.0.4', jinja2: '3.1.4', click: '8.1.7', itsdangerous: '2.2.0', blinker: '1.8.2', 'python-dateutil': '2.9.0', pytz: '2024.2', numpy: '2.1.1', botocore: '1.35.30', jmespath: '1.0.1', s3transfer: '0.10.2', cryptography: '43.0.1', bcrypt: '4.2.0', pynacl: '1.5.0', 'ansible-core': '2.17.4', iniconfig: '2.0.0', packaging: '24.1', pluggy: '1.5.0' };
        const deps = PIP[nm][2].filter((d) => !inst.has(d));
        c.out(`Collecting ${spec}\n  Downloading ${nm.replace(/-/g, '_')}-${ver}-py3-none-any.whl (${60 + nm.length * 7} kB)\n`);
        for (const d of deps) c.out(`Collecting ${d}\n  Downloading ${d.replace(/-/g, '_')}-${DV[d] || '1.0'}-py3-none-any.whl (${20 + d.length * 5} kB)\n`);
        added.push([nm, ver], ...deps.map((d) => [d, DV[d] || '1.0']));
        for (const [dn, dv] of [[nm, ver], ...deps.map((d) => [d, DV[d] || '1.0'])]) {
          const root = sp || (sh.users[sh.user].home + '/.local/lib/python3.12/site-packages');
          sh.fs.mkdirp(root + '/' + dn.replace(/-/g, '_'), { owner: sh.eu(), group: sh.users[sh.eu()].groups[0] });
          sh.fs.mkdirp(root + `/${dn.replace(/-/g, '_')}-${dv}.dist-info`, { owner: sh.eu(), group: sh.users[sh.eu()].groups[0] });
          if (!sp) (sh.sysPip || (sh.sysPip = new Map())).set(dn, dv);
        }
      }
      if (added.length) c.out(`Installing collected packages: ${added.map((a) => a[0]).reverse().join(', ')}\nSuccessfully installed ${added.map((a) => a[0] + '-' + a[1]).reverse().join(' ')}\n`);
      return 0;
    }
    if (sub === 'uninstall') {
      const names = args.slice(1).filter((a) => !a.startsWith('-'));
      for (const nm of names.map(norm)) {
        if (!inst.has(nm)) { c.err(`WARNING: Skipping ${nm} as it is not installed.\n`); continue; }
        c.out(`Found existing installation: ${nm} ${inst.get(nm)}\nUninstalling ${nm}-${inst.get(nm)}:\n  Successfully uninstalled ${nm}-${inst.get(nm)}\n`);
        const root = sp || (sh.users[sh.user].home + '/.local/lib/python3.12/site-packages');
        const d = sh.fs.lookup(root);
        if (d) { delete d.kids[nm.replace(/-/g, '_')]; delete d.kids[`${nm.replace(/-/g, '_')}-${inst.get(nm)}.dist-info`]; }
        if (sh.sysPip) sh.sysPip.delete(nm);
      }
      return 0;
    }
    if (sub === 'list') {
      const all = new Map([['pip', '24.0'], ...(sp ? [['setuptools', '69.5.1']] : [['setuptools', '68.1.2'], ['wheel', '0.42.0']]), ...inst]);
      const w = Math.max(7, ...[...all.keys()].map((k) => k.length));
      c.out(`${'Package'.padEnd(w)} Version\n${'-'.repeat(w)} -------\n`);
      [...all].sort().forEach(([k, v]) => c.out(`${k.padEnd(w)} ${v}\n`));
      return 0;
    }
    if (sub === 'freeze') { [...inst].sort().forEach(([k, v]) => c.out(`${k}==${v}\n`)); return 0; }
    if (sub === 'show') {
      const nm = norm(args[1] || '');
      if (!inst.has(nm)) { c.err(`WARNING: Package(s) not found: ${nm}\n`); return 1; }
      c.out(`Name: ${nm}\nVersion: ${inst.get(nm)}\nSummary: ${PIP[nm] ? PIP[nm][1] : ''}\nHome-page: https://pypi.org/project/${nm}/\nAuthor: PyPI contributors\nLocation: ${sp}\nRequires: ${PIP[nm] ? PIP[nm][2].join(', ') : ''}\nRequired-by: \n`);
      return 0;
    }
    c.err(`ERROR: unknown command "${sub}"\n`);
    return 1;
  }
  def('pip', (c, a) => pipCmd(c, a, 'pip'), { pkg: 'python3-pip' });
  def('pip3', (c, a) => pipCmd(c, a, 'pip3'), { pkg: 'python3-pip' });
  Object.assign(LX.PKGS, {
    'python3-pip': { ver: '24.0+dfsg-1ubuntu1', desc: 'Python package installer', size: 1318, bins: ['pip', 'pip3'] },
    'python3-venv': { ver: '3.12.3-0ubuntu2', desc: 'venv module for Python 3 (default python3 version)', size: 5, bins: [] },
    'python3-full': { ver: '3.12.3-0ubuntu2', desc: 'Python 3 full installation', size: 1, bins: [] },
    pipx: { ver: '1.4.3-1', desc: 'execute binaries from Python packages in isolated environments', size: 100, bins: ['pipx'] },
  });
  /* pip inside a venv works without the system package */
  const origDispatch = P.dispatch;
  P.dispatch = async function (argv, io) {
    if ((argv[0] === 'pip' || argv[0] === 'pip3') && this.vars.VIRTUAL_ENV && this.fs.lookup(this.vars.VIRTUAL_ENV + '/bin/pip')) return await this.invoke({ run: (c, a) => pipCmd(c, a, 'pip') }, argv[0], argv.slice(1), io);
    return await origDispatch.call(this, argv, io);
  };
})();
