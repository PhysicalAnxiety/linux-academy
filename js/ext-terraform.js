/* Linux Academy: a small Terraform. Real HCL syntax, init / validate / fmt / plan / apply / destroy / output / state / show.
   Providers in the sandbox: local (local_file), random (random_pet, random_password, random_id), null (null_resource + local-exec)
   and "sandbox" (sandbox_server, sandbox_bucket: a pretend cloud). */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS } = LX;
  const U = LX.U;

  const b64dec = (t) => { try { return decodeURIComponent(escape(atob(t))); } catch (e) { return ''; } };
  const hexB64 = (h, url) => { const bin = (h.match(/../g) || []).map((x) => String.fromCharCode(parseInt(x, 16))).join(''); const b = btoa(bin); return url ? b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b; };
  const UNK = { unknown: true };
  const isUnk = (v) => v === UNK;
  const hasUnk = (v) => isUnk(v) || (Array.isArray(v) && v.some(hasUnk)) || (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).some(hasUnk));

  /* ============ HCL: tokenizer ============ */
  class HclErr extends Error {
    constructor(msg, line, summary) { super(msg); this.line = line; this.summary = summary || 'Invalid expression'; }
  }
  function tokenize(src, line0 = 1) {
    const toks = [];
    let i = 0;
    let line = line0;
    const n = src.length;
    const push = (t, v, extra) => toks.push(Object.assign({ t, v, line }, extra || {}));
    while (i < n) {
      const c = src[i];
      if (c === '\n') { push('nl', '\n'); line++; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '#' || (c === '/' && src[i + 1] === '/')) { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const chunk = src.slice(i, e < 0 ? n : e + 2); line += (chunk.match(/\n/g) || []).length; i = e < 0 ? n : e + 2; continue; }
      if (c === '"') {
        let j = i + 1;
        const parts = [];
        let cur = '';
        while (j < n && src[j] !== '"') {
          if (src[j] === '\n') throw new HclErr('Unterminated template string', line, 'Invalid multi-line string');
          if (src[j] === '\\') { const e = src[j + 1]; cur += e === 'n' ? '\n' : e === 't' ? '\t' : e === '"' ? '"' : e === '\\' ? '\\' : '\\' + e; j += 2; continue; }
          if (src[j] === '$' && src[j + 1] === '{') {
            let depth = 1;
            let k = j + 2;
            while (k < n && depth) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; k++; }
            if (cur) parts.push(cur);
            cur = '';
            parts.push({ expr: src.slice(j + 2, k - 1), line });
            j = k;
            continue;
          }
          if (src[j] === '$' && src[j + 1] === '$' && src[j + 2] === '{') { cur += '${'; j += 3; continue; }
          cur += src[j++];
        }
        if (j >= n) throw new HclErr('Unterminated template string', line, 'Invalid multi-line string');
        if (cur || !parts.length) parts.push(cur);
        push('tpl', parts);
        i = j + 1;
        continue;
      }
      if (c === '<' && src[i + 1] === '<') {
        const m = /^<<(-?)([A-Za-z_][\w]*)\n/.exec(src.slice(i));
        if (m) {
          const marker = m[2];
          let j = i + m[0].length;
          const lines = [];
          let found = false;
          const startLine = line;
          line++;
          while (j <= n) {
            const e = src.indexOf('\n', j);
            const ln = src.slice(j, e < 0 ? n : e);
            if (ln.trim() === marker) { found = true; j = e < 0 ? n : e; break; }
            lines.push(ln);
            line++;
            if (e < 0) break;
            j = e + 1;
          }
          if (!found) throw new HclErr('Unterminated heredoc', startLine, 'Unterminated heredoc');
          let body = lines;
          if (m[1] === '-') { const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length), Infinity); body = lines.map((l) => l.slice(ind === Infinity ? 0 : ind)); }
          const text = body.join('\n') + (body.length ? '\n' : '');
          const parts = [];
          let cur = '';
          for (let k = 0; k < text.length; k++) {
            if (text[k] === '$' && text[k + 1] === '{') { let d = 1; let q = k + 2; while (q < text.length && d) { if (text[q] === '{') d++; else if (text[q] === '}') d--; q++; } if (cur) parts.push(cur); cur = ''; parts.push({ expr: text.slice(k + 2, q - 1), line: startLine }); k = q - 1; } else cur += text[k];
          }
          if (cur || !parts.length) parts.push(cur);
          toks.push({ t: 'tpl', v: parts, line: startLine });
          i = j;
          continue;
        }
      }
      if (/[0-9]/.test(c)) { const m = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i)); push('num', +m[0]); i += m[0].length; continue; }
      if (/[A-Za-z_]/.test(c)) { const m = /^[A-Za-z_][\w-]*/.exec(src.slice(i)); let w = m[0]; while (w.endsWith('-')) w = w.slice(0, -1); push('id', w); i += w.length; continue; }
      const three = src.slice(i, i + 3);
      const two = src.slice(i, i + 2);
      if (three === '...') { push('op', '...'); i += 3; continue; }
      if (['==', '!=', '<=', '>=', '&&', '||', '=>', '?:'].includes(two)) { push('op', two); i += 2; continue; }
      if ('{}[]()=,:.?+-*/%<>!'.includes(c)) { push('op', c); i++; continue; }
      throw new HclErr(`Invalid character; this character is not used in the language: ${c}`, line, 'Invalid character');
    }
    push('eof', null);
    return toks;
  }

  /* ============ HCL: parser ============ */
  function parseHcl(src) {
    const T = tokenize(src);
    let p = 0;
    const peek = () => T[p];
    const isOp = (v) => T[p].t === 'op' && T[p].v === v;
    const skipNl = () => { while (T[p].t === 'nl') p++; };
    const err = (msg, summary) => new HclErr(msg, T[p].line, summary || 'Argument or block definition required');

    function parseExprSrc(text, line) { const sub = tokenize(text, line); return parseExprFrom(sub); }
    function parseExprFrom(Tk) {
      let q = 0;
      const pk = () => Tk[q];
      const op = (v) => Tk[q].t === 'op' && Tk[q].v === v;
      const snl = () => { while (Tk[q].t === 'nl') q++; };
      const fail = (m) => new HclErr(m, Tk[q].line, 'Invalid expression');
      function cond() {
        const c = or();
        if (op('?')) { q++; snl(); const a = cond(); snl(); if (!op(':')) throw fail('Missing colon in conditional'); q++; snl(); const b = cond(); return { k: 'cond', c, a, b }; }
        return c;
      }
      function or() { let l = and(); while (op('||')) { q++; snl(); l = { k: 'bin', o: '||', l, r: and() }; } return l; }
      function and() { let l = eq(); while (op('&&')) { q++; snl(); l = { k: 'bin', o: '&&', l, r: eq() }; } return l; }
      function eq() { let l = rel(); while (op('==') || op('!=')) { const o = Tk[q++].v; l = { k: 'bin', o, l, r: rel() }; } return l; }
      function rel() { let l = add(); while (op('<') || op('>') || op('<=') || op('>=')) { const o = Tk[q++].v; l = { k: 'bin', o, l, r: add() }; } return l; }
      function add() { let l = mul(); while (op('+') || op('-')) { const o = Tk[q++].v; l = { k: 'bin', o, l, r: mul() }; } return l; }
      function mul() { let l = unary(); while (op('*') || op('/') || op('%')) { const o = Tk[q++].v; l = { k: 'bin', o, l, r: unary() }; } return l; }
      function unary() { if (op('!')) { q++; return { k: 'not', e: unary() }; } if (op('-')) { q++; return { k: 'neg', e: unary() }; } return post(); }
      function post() {
        let e = primary();
        for (;;) {
          if (op('.')) {
            q++;
            if (pk().t === 'id') { e = { k: 'attr', e, name: Tk[q++].v }; continue; }
            if (pk().t === 'num') { e = { k: 'idx', e, i: { k: 'lit', v: Tk[q++].v } }; continue; }
            if (op('*')) { q++; e = { k: 'splat', e }; continue; }
            throw fail('Invalid attribute name');
          }
          if (op('[')) { q++; snl(); if (op('*')) { q++; snl(); if (!op(']')) throw fail('Expected ]'); q++; e = { k: 'splat', e }; continue; } const i = cond(); snl(); if (!op(']')) throw fail('Missing close bracket on index'); q++; e = { k: 'idx', e, i }; continue; }
          break;
        }
        return e;
      }
      function primary() {
        const t = pk();
        if (t.t === 'num') { q++; return { k: 'lit', v: t.v }; }
        if (t.t === 'tpl') { q++; return { k: 'tpl', parts: t.v.map((x) => (typeof x === 'string' ? x : parseExprSrc(x.expr, x.line))) }; }
        if (t.t === 'id') {
          if (t.v === 'true') { q++; return { k: 'lit', v: true }; }
          if (t.v === 'false') { q++; return { k: 'lit', v: false }; }
          if (t.v === 'null') { q++; return { k: 'lit', v: null }; }
          q++;
          if (op('(')) {
            q++;
            snl();
            const args = [];
            while (!op(')')) { args.push(cond()); snl(); if (op(',')) { q++; snl(); } else break; }
            if (!op(')')) throw fail('Missing close parenthesis');
            q++;
            return { k: 'call', name: t.v, args, line: t.line };
          }
          return { k: 'ref', name: t.v, line: t.line };
        }
        if (op('(')) { q++; snl(); const e = cond(); snl(); if (!op(')')) throw fail('Missing close parenthesis'); q++; return e; }
        if (op('[')) {
          q++;
          snl();
          if (pk().t === 'id' && pk().v === 'for') {
            q++;
            const v1 = Tk[q++].v;
            let v2 = null;
            if (op(',')) { q++; v2 = Tk[q++].v; }
            if (!(pk().t === 'id' && pk().v === 'in')) throw fail('Expected in');
            q++;
            const coll = cond();
            if (!op(':')) throw fail('Expected colon');
            q++;
            const body = cond();
            let ifc = null;
            if (pk().t === 'id' && pk().v === 'if') { q++; ifc = cond(); }
            snl();
            if (!op(']')) throw fail('Expected ]');
            q++;
            return { k: 'for', v1, v2, coll, body, ifc };
          }
          const items = [];
          while (!op(']')) { items.push(cond()); snl(); if (op(',')) { q++; snl(); } else break; }
          if (!op(']')) throw fail('Missing close bracket on list');
          q++;
          return { k: 'list', items };
        }
        if (op('{')) {
          q++;
          snl();
          const ents = [];
          while (!op('}')) {
            let key;
            if (pk().t === 'id') { key = { k: 'lit', v: Tk[q++].v }; } else if (pk().t === 'tpl') { key = primary(); } else if (op('(')) { q++; key = cond(); if (!op(')')) throw fail('Expected )'); q++; } else throw fail('Invalid object key');
            if (op('=') || op(':')) q++; else throw fail('Missing key/value separator');
            snl();
            const val = cond();
            ents.push([key, val]);
            if (op(',')) q++;
            snl();
          }
          q++;
          return { k: 'obj', ents };
        }
        throw fail(`Invalid expression: ${t.t === 'eof' ? 'unexpected end of file' : t.t === 'nl' ? 'expected an expression but found an invalid expression terminator' : 'unexpected ' + JSON.stringify(t.v)}`);
      }
      const e = cond();
      if (Tk[q].t !== 'eof' && Tk[q].t !== 'nl') throw fail('Extra characters after expression');
      return e;
    }

    function parseBody(top) {
      const items = [];
      for (;;) {
        skipNl();
        if (T[p].t === 'eof') { if (!top) throw err('Unclosed configuration block', 'Unclosed configuration block'); break; }
        if (isOp('}')) { if (top) throw err('Unbalanced closing brace', 'Unbalanced closing brace'); p++; break; }
        const t = T[p];
        if (t.t !== 'id') throw err(`Argument or block definition required. An argument or block definition is required here.`);
        p++;
        if (isOp('=')) {
          p++;
          // expression spans tokens until newline at depth 0
          const start = p;
          let depth = 0;
          while (T[p].t !== 'eof') {
            if (T[p].t === 'op' && '{[('.includes(T[p].v)) depth++;
            else if (T[p].t === 'op' && '}])'.includes(T[p].v)) { if (depth === 0) break; depth--; }
            else if (T[p].t === 'nl' && depth === 0) break;
            p++;
          }
          const slice = T.slice(start, p).concat([{ t: 'eof', v: null, line: T[p].line }]);
          if (slice.length === 1) throw new HclErr('Expected an expression', t.line, 'Missing expression');
          items.push({ kind: 'attr', name: t.v, expr: parseExprFrom(slice), line: t.line });
          continue;
        }
        const labels = [];
        while (T[p].t === 'tpl' || (T[p].t === 'id' && !(T[p + 1] && T[p + 1].t === 'op' && T[p + 1].v === '='))) {
          if (T[p].t === 'tpl') labels.push(T[p].v.join('')); else labels.push(T[p].v);
          p++;
        }
        if (!isOp('{')) throw new HclErr('Expected an opening brace to start this block', T[p].line, 'Invalid block definition');
        p++;
        const body = parseBody(false);
        items.push({ kind: 'block', type: t.v, labels, body, line: t.line });
      }
      return items;
    }
    return parseBody(true);
  }

  /* ============ Expression evaluation ============ */
  const num = (x) => (typeof x === 'number' ? x : typeof x === 'string' && x !== '' && !Number.isNaN(+x) ? +x : x);
  const str = (v) => (v === null ? '' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v));
  function fmtPrintf(f, args) {
    let i = 0;
    return f.replace(/%(-?\d*)([sdvfq%t])/g, (m, w, k) => {
      if (k === '%') return '%';
      const a = args[i++];
      let s = k === 'q' ? JSON.stringify(String(a)) : k === 'f' ? Number(a).toFixed(6) : k === 'd' ? String(Math.trunc(Number(a))) : str(a);
      const wd = parseInt(w, 10);
      if (wd) s = w.startsWith('-') ? s.padEnd(-wd) : s.padStart(wd, w.startsWith('0') && k !== 's' ? '0' : ' ');
      return s;
    });
  }
  const FUNCS = {
    upper: (a) => str(a[0]).toUpperCase(), lower: (a) => str(a[0]).toLowerCase(), title: (a) => str(a[0]).replace(/\b\w/g, (x) => x.toUpperCase()),
    length: (a) => (a[0] && typeof a[0] === 'object' && !Array.isArray(a[0]) ? Object.keys(a[0]).length : a[0].length), format: (a) => fmtPrintf(str(a[0]), a.slice(1)),
    join: (a) => a[1].map(str).join(a[0]), split: (a) => str(a[1]).split(a[0]), concat: (a) => [].concat(...a), contains: (a) => a[0].includes(a[1]),
    lookup: (a) => (a[0] && a[1] in a[0] ? a[0][a[1]] : a.length > 2 ? a[2] : (() => { throw new HclErr(`Invalid function argument: lookup failed to find key "${a[1]}"`, 0, 'Error in function call'); })()),
    element: (a) => a[0][a[1] % a[0].length], keys: (a) => Object.keys(a[0]).sort(), values: (a) => Object.keys(a[0]).sort().map((k) => a[0][k]), merge: (a) => Object.assign({}, ...a),
    tostring: (a) => str(a[0]), tonumber: (a) => num(a[0]), tolist: (a) => [...a[0]], toset: (a) => [...new Set(a[0])].sort(), tomap: (a) => a[0], replace: (a) => str(a[0]).split(a[1]).join(a[2]),
    trimspace: (a) => str(a[0]).trim(), substr: (a) => str(a[0]).substr(a[1], a[2] < 0 ? undefined : a[2]), min: (a) => Math.min(...a.flat()), max: (a) => Math.max(...a.flat()), abs: (a) => Math.abs(a[0]),
    ceil: (a) => Math.ceil(a[0]), floor: (a) => Math.floor(a[0]), coalesce: (a) => a.find((x) => x !== null && x !== '' && x !== undefined), sort: (a) => [...a[0]].sort(), reverse: (a) => [...a[0]].reverse(),
    range: (a) => { const [s, e] = a.length === 1 ? [0, a[0]] : a; return Array.from({ length: Math.max(0, e - s) }, (_, i) => s + i); }, flatten: (a) => a[0].flat(Infinity), distinct: (a) => [...new Set(a[0])],
    jsonencode: (a) => JSON.stringify(a[0]), jsondecode: (a) => JSON.parse(a[0]), basename: (a) => VFS.base(str(a[0])), dirname: (a) => VFS.dirname(str(a[0])), md5: (a) => LX.md5(str(a[0])),
    startswith: (a) => str(a[0]).startsWith(a[1]), endswith: (a) => str(a[0]).endsWith(a[1]), regex: (a) => { const m = new RegExp(a[0]).exec(str(a[1])); if (!m) throw new HclErr('Invalid function argument: pattern did not match any part of the given string', 0, 'Error in function call'); return m[0]; },
    can: (a) => a[0] !== undefined, try: (a) => a[0], timestamp: () => new Date().toISOString().replace(/\.\d+Z$/, 'Z'), formatdate: (a) => a[1],
  };
  function evalExpr(e, ctx) {
    switch (e.k) {
      case 'lit': return e.v;
      case 'tpl': {
        let out = '';
        for (const p of e.parts) {
          if (typeof p === 'string') { out += p; continue; }
          const v = evalExpr(p, ctx);
          if (isUnk(v) || hasUnk(v)) return UNK;
          out += str(v);
        }
        return out;
      }
      case 'ref': return resolveRoot(e, ctx);
      case 'attr': {
        const b = evalExpr(e.e, ctx);
        if (isUnk(b)) return UNK;
        if (b === null || typeof b !== 'object') throw new HclErr(`Unsupported attribute; This value does not have any attributes.`, e.line || 0, 'Unsupported attribute');
        if (Array.isArray(b)) return b.map((x) => (x && typeof x === 'object' ? x[e.name] : undefined));
        if (!(e.name in b)) {
          if (b.__unknownRest) return UNK;
          throw new HclErr(`This object does not have an attribute named "${e.name}".`, e.line || 0, 'Unsupported attribute');
        }
        return b[e.name];
      }
      case 'idx': {
        const b = evalExpr(e.e, ctx);
        const i = evalExpr(e.i, ctx);
        if (isUnk(b) || isUnk(i)) return UNK;
        if (Array.isArray(b)) { if (i < 0 || i >= b.length) throw new HclErr(`Invalid index; The given key does not identify an element in this collection value: the given index is greater than or equal to the length of the collection.`, 0, 'Invalid index'); return b[i]; }
        if (b && typeof b === 'object') { if (!(i in b)) throw new HclErr(`Invalid index; The given key does not identify an element in this collection value.`, 0, 'Invalid index'); return b[i]; }
        throw new HclErr('Invalid index; This value does not support indexing.', 0, 'Invalid index');
      }
      case 'splat': { const b = evalExpr(e.e, ctx); if (isUnk(b)) return UNK; return Array.isArray(b) ? b : b === null ? [] : [b]; }
      case 'list': { const r = e.items.map((x) => evalExpr(x, ctx)); return r; }
      case 'obj': { const o = {}; for (const [k, v] of e.ents) { const kk = evalExpr(k, ctx); o[str(kk)] = evalExpr(v, ctx); } return o; }
      case 'cond': { const c = evalExpr(e.c, ctx); if (isUnk(c)) return UNK; return c ? evalExpr(e.a, ctx) : evalExpr(e.b, ctx); }
      case 'not': { const v = evalExpr(e.e, ctx); return isUnk(v) ? UNK : !v; }
      case 'neg': { const v = evalExpr(e.e, ctx); return isUnk(v) ? UNK : -v; }
      case 'bin': {
        const l = evalExpr(e.l, ctx);
        if (e.o === '&&' && l === false) return false;
        if (e.o === '||' && l === true) return true;
        const r = evalExpr(e.r, ctx);
        if (isUnk(l) || isUnk(r)) return UNK;
        switch (e.o) {
          case '+': return typeof l === 'number' && typeof r === 'number' ? l + r : num(l) + num(r);
          case '-': return num(l) - num(r);
          case '*': return num(l) * num(r);
          case '/': return num(l) / num(r);
          case '%': return num(l) % num(r);
          case '==': return JSON.stringify(l) === JSON.stringify(r);
          case '!=': return JSON.stringify(l) !== JSON.stringify(r);
          case '<': return l < r;
          case '>': return l > r;
          case '<=': return l <= r;
          case '>=': return l >= r;
          case '&&': return !!l && !!r;
          case '||': return !!l || !!r;
        }
        return null;
      }
      case 'call': {
        const fn = FUNCS[e.name] || (e.name === 'file' ? (a) => { const n = ctx.sh.fs.lookup(VFS.norm(str(a[0]), ctx.cwd)); if (!n || n.t !== 'f') throw new HclErr(`Invalid function argument: Invalid value for "path" parameter: no file exists at ${a[0]}; this function works only with files that are distributed as part of the configuration source code.`, e.line, 'Error in function call'); return ctx.sh.readFile(VFS.norm(str(a[0]), ctx.cwd)); } : null);
        if (!fn) throw new HclErr(`Call to unknown function; There is no function named "${e.name}".`, e.line, 'Call to unknown function');
        const args = e.args.map((a) => evalExpr(a, ctx));
        if (args.some(hasUnk)) return UNK;
        try { return fn(args); } catch (x) { if (x instanceof HclErr) { x.line = x.line || e.line; throw x; } throw new HclErr(`Invalid function argument: ${x.message}`, e.line, 'Error in function call'); }
      }
      case 'for': {
        const coll = evalExpr(e.coll, ctx);
        if (isUnk(coll)) return UNK;
        const entries = Array.isArray(coll) ? coll.map((v, i) => [i, v]) : Object.entries(coll || {});
        const out = [];
        for (const [k, v] of entries) {
          const sub = Object.assign({}, ctx, { loc: Object.assign({}, ctx.loc || {}, e.v2 ? { [e.v1]: k, [e.v2]: v } : { [e.v1]: v }) });
          if (e.ifc && !evalExpr(e.ifc, sub)) continue;
          out.push(evalExpr(e.body, sub));
        }
        return out;
      }
    }
    return null;
  }
  function resolveRoot(e, ctx) {
    const nm = e.name;
    if (ctx.loc && nm in ctx.loc) return ctx.loc[nm];
    if (nm === 'var') return ctx.varsObj();
    if (nm === 'local') return ctx.localsObj();
    if (nm === 'count' && ctx.count) return ctx.count;
    if (nm === 'each' && ctx.each) return ctx.each;
    if (nm === 'path') return { module: ctx.cwd, root: ctx.cwd, cwd: ctx.cwd };
    if (nm === 'terraform') return { workspace: 'default' };
    if (ctx.resourceTypes.has(nm)) return ctx.typeObj(nm);
    throw new HclErr(`Reference to undeclared resource; A managed resource "${nm}" has not been declared in the root module.`, e.line, 'Reference to undeclared resource');
  }
  // static references (for ordering and validation)
  function refsOf(e, out) {
    if (!e || typeof e !== 'object') return out;
    if (e.k === 'attr' || e.k === 'idx') {
      // collect chains like aws.x.y
      const chain = [];
      let cur = e;
      while (cur && (cur.k === 'attr' || cur.k === 'idx')) { if (cur.k === 'attr') chain.unshift(cur.name); if (cur.k === 'idx') refsOf(cur.i, out); cur = cur.e; }
      if (cur && cur.k === 'ref') out.push({ root: cur.name, chain, line: cur.line });
      else refsOf(cur, out);
      return out;
    }
    if (e.k === 'ref') { out.push({ root: e.name, chain: [], line: e.line }); return out; }
    for (const key of ['e', 'l', 'r', 'c', 'a', 'b', 'coll', 'body', 'ifc']) if (e[key]) refsOf(e[key], out);
    if (e.args) e.args.forEach((x) => refsOf(x, out));
    if (e.items) e.items.forEach((x) => refsOf(x, out));
    if (e.parts) e.parts.forEach((x) => typeof x !== 'string' && refsOf(x, out));
    if (e.ents) e.ents.forEach(([k, v]) => { refsOf(k, out); refsOf(v, out); });
    return out;
  }

  /* ============ providers (resource types) ============ */
  const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  const sha1ish = (s) => (LX.md5(s) + LX.md5('x' + s)).slice(0, 40);
  const PET_A = ['rich', 'happy', 'brave', 'calm', 'eager', 'fancy', 'gentle', 'jolly', 'kind', 'lucky'];
  const PET_B = ['panda', 'otter', 'falcon', 'lemur', 'heron', 'badger', 'gecko', 'ibex', 'koala', 'newt'];
  const TYPES = {
    local_file: {
      provider: 'hashicorp/local', required: ['filename'], optional: ['content', 'content_base64', 'file_permission', 'directory_permission', 'source', 'sensitive_content'], forceNew: ['filename', 'content', 'content_base64', 'file_permission', 'directory_permission', 'source'], defaults: { file_permission: '0777', directory_permission: '0777' },
      computed: ['id', 'content_md5', 'content_sha1', 'content_sha256', 'content_base64sha256'],
      create: (R, a) => { const content = a.content !== undefined ? a.content : a.content_base64 ? b64dec(a.content_base64) : ''; const path = VFS.norm(a.filename, R.cwd); R.sh.fs.mkdirp(VFS.dirname(path), {}); R.sh.writeFile(path, content, false); const nd = R.sh.fs.lookup(path); nd.mode = parseInt(a.file_permission, 8) & 0o7777; return { id: sha1ish(content), content_md5: LX.md5(content), content_sha1: sha1ish(content), content_sha256: LX.md5('s' + content) + LX.md5('t' + content), content_base64sha256: hexB64(LX.md5('s' + content)) }; },
      destroy: (R, st) => { try { const path = VFS.norm(st.filename, R.cwd); if (R.sh.fs.lookup(path)) R.sh.fs.unlink ? R.sh.fs.unlink(path) : R.sh.fs.rm(path); } catch (e) { /* ignore */ } },
      refresh: (R, st) => { const path = VFS.norm(st.filename, R.cwd); const n = R.sh.fs.lookup(path); if (!n || n.t !== 'f') return null; return Object.assign({}, st, { content: R.sh.readFile(path) }); },
    },
    random_pet: { provider: 'hashicorp/random', required: [], optional: ['length', 'separator', 'prefix', 'keepers'], forceNew: ['length', 'separator', 'prefix', 'keepers'], defaults: { length: 2, separator: '-' }, computed: ['id'], create: (R, a) => { const w = []; for (let i = 0; i < a.length; i++) w.push(i === a.length - 1 ? PET_B[Math.floor(Math.random() * 10)] : PET_A[Math.floor(Math.random() * 10)]); if (a.prefix) w.unshift(a.prefix); return { id: w.join(a.separator) }; } },
    random_id: { provider: 'hashicorp/random', required: ['byte_length'], optional: ['prefix', 'keepers'], forceNew: ['byte_length', 'prefix', 'keepers'], defaults: {}, computed: ['id', 'hex', 'b64_std', 'b64_url', 'dec'], create: (R, a) => { const h = hex(a.byte_length * 2); return { id: hexB64(h, true), hex: h, b64_std: hexB64(h), b64_url: hexB64(h, true), dec: String(parseInt(h.slice(0, 12), 16)) }; } },
    random_password: { provider: 'hashicorp/random', required: ['length'], optional: ['special', 'upper', 'lower', 'numeric', 'min_special', 'override_special', 'keepers'], forceNew: ['length', 'special', 'upper', 'lower', 'numeric', 'keepers'], defaults: { special: true, upper: true, lower: true, numeric: true }, computed: ['id', 'result', 'bcrypt_hash'], sensitive: ['result', 'bcrypt_hash'], create: (R, a) => { let pool = ''; if (a.lower) pool += 'abcdefghijkmnopqrstuvwxyz'; if (a.upper) pool += 'ABCDEFGHJKLMNPQRSTUVWXYZ'; if (a.numeric) pool += '23456789'; if (a.special) pool += a.override_special || '!#$%&*()-_=+[]{}<>:?'; let r = ''; for (let i = 0; i < a.length; i++) r += pool[Math.floor(Math.random() * pool.length)]; return { id: 'none', result: r, bcrypt_hash: '$2a$10$' + hex(53) }; } },
    null_resource: { provider: 'hashicorp/null', required: [], optional: ['triggers'], forceNew: ['triggers'], defaults: {}, computed: ['id'], create: () => ({ id: String(Math.floor(Math.random() * 9e18)) }) },
    sandbox_server: {
      provider: 'acme/sandbox', required: ['name', 'image'], optional: ['size', 'region', 'tags', 'user_data'], forceNew: ['name', 'image', 'region', 'user_data'], defaults: { size: 'small', region: 'ap-south-1' }, computed: ['id', 'private_ip', 'public_ip', 'state'],
      validate: { size: (v) => ['small', 'medium', 'large'].includes(v) || `Invalid value for size: "${v}" is not valid; must be one of: small, medium, large.` },
      create: (R, a) => { const n = Math.floor(Math.random() * 200) + 20; const rec = { id: 'srv-' + hex(8), private_ip: '10.0.1.' + n, public_ip: '203.0.113.' + (n + 1), state: 'running' }; R.sh.cloud = R.sh.cloud || { servers: {}, buckets: {} }; R.sh.cloud.servers[rec.id] = Object.assign({ name: a.name }, a, rec); return rec; },
      update: (R, st, a) => { const s = R.sh.cloud && R.sh.cloud.servers[st.id]; if (s) Object.assign(s, a); return {}; },
      destroy: (R, st) => { if (R.sh.cloud) delete R.sh.cloud.servers[st.id]; },
    },
    sandbox_bucket: {
      provider: 'acme/sandbox', required: ['name'], optional: ['versioning', 'tags'], forceNew: ['name'], defaults: { versioning: false }, computed: ['id', 'arn'],
      create: (R, a) => { R.sh.cloud = R.sh.cloud || { servers: {}, buckets: {} }; R.sh.cloud.buckets[a.name] = { versioning: a.versioning }; return { id: a.name, arn: 'arn:sandbox:s3:::' + a.name }; },
      update: (R, st, a) => { if (R.sh.cloud && R.sh.cloud.buckets[st.name]) Object.assign(R.sh.cloud.buckets[st.name], { versioning: a.versioning }); return {}; },
      destroy: (R, st) => { if (R.sh.cloud) delete R.sh.cloud.buckets[st.name]; },
    },
  };
  TYPES.local_sensitive_file = Object.assign({}, TYPES.local_file, { sensitive: ['content'] });
  const providerOf = (type) => (TYPES[type] || {}).provider || null;
  const PROVIDER_VERSIONS = { 'hashicorp/local': '2.5.1', 'hashicorp/random': '3.6.2', 'hashicorp/null': '3.2.2', 'acme/sandbox': '1.4.0' };

  /* ============ config loading ============ */
  function loadConfig(c) {
    const sh = c.sh;
    const dir = sh.cwd;
    const d = sh.fs.lookup(dir);
    const files = Object.keys(d.kids || {}).filter((k) => k.endsWith('.tf') && d.kids[k].t === 'f').sort();
    const cfg = { files, variables: {}, locals: {}, resources: {}, outputs: {}, providers: new Set(), reqProviders: {}, order: [] };
    if (!files.length) return { err: 'nofiles', cfg };
    for (const f of files) {
      let items;
      const text = sh.readFile(dir + '/' + f);
      try { items = parseHcl(text); } catch (e) {
        if (e instanceof HclErr) return { err: 'parse', file: f, text, e, cfg };
        throw e;
      }
      for (const it of items) {
        if (it.kind === 'attr') return { err: 'parse', file: f, text, e: new HclErr('Unexpected attribute; An attribute named "' + it.name + '" is not expected here.', it.line, 'Unsupported argument'), cfg };
        if (it.type === 'variable') cfg.variables[it.labels[0]] = { name: it.labels[0], body: it.body, file: f, line: it.line };
        else if (it.type === 'locals') { for (const b of it.body) if (b.kind === 'attr') cfg.locals[b.name] = { expr: b.expr, file: f, line: b.line }; }
        else if (it.type === 'resource') { const key = it.labels.join('.'); cfg.resources[key] = { type: it.labels[0], name: it.labels[1], body: it.body, file: f, line: it.line }; cfg.order.push(key); }
        else if (it.type === 'output') cfg.outputs[it.labels[0]] = { name: it.labels[0], body: it.body, file: f, line: it.line };
        else if (it.type === 'provider') cfg.providers.add(it.labels[0]);
        else if (it.type === 'terraform') { for (const b of it.body) if (b.kind === 'block' && b.type === 'required_providers') for (const a of b.body) if (a.kind === 'attr') cfg.reqProviders[a.name] = a.expr; }
      }
    }
    return { cfg };
  }
  function printErr(c, file, text, e, summaryOverride) {
    const lines = text ? text.split('\n') : [];
    const ln = e.line || 0;
    let out = `\n╷\n│ Error: ${summaryOverride || e.summary}\n│ \n`;
    if (ln && lines[ln - 1] !== undefined) out += `│   on ${file} line ${ln}:\n│  ${String(ln).padStart(2)}: ${lines[ln - 1]}\n│ \n`;
    const msg = String(e.message).replace(/^[^;]*; /, (m) => (m.length < 60 ? '' : m));
    out += msg.split('\n').map((l) => '│ ' + l).join('\n') + '\n╵\n';
    c.err(out);
  }

  /* ============ the engine ============ */
  const attrBody = (body) => { const o = {}; for (const b of body) if (b.kind === 'attr') o[b.name] = b; return o; };
  const blocksOf = (body, type) => body.filter((b) => b.kind === 'block' && b.type === type);

  function stateFile(c) { return VFS.norm('terraform.tfstate', c.sh.cwd); }
  function loadState(c) {
    const n = c.sh.fs.lookup(stateFile(c));
    if (!n) return { serial: 0, lineage: hex(8) + '-' + hex(4) + '-' + hex(4) + '-' + hex(4) + '-' + hex(12), res: {}, outputs: {} };
    try {
      const j = JSON.parse(c.sh.readFile(stateFile(c)));
      const res = {};
      for (const r of j.resources || []) for (const inst of r.instances || []) { const key = inst.index_key === undefined ? '' : inst.index_key; const addr = `${r.type}.${r.name}` + (key === '' ? '' : typeof key === 'number' ? `[${key}]` : `["${key}"]`); res[addr] = { type: r.type, name: r.name, key, attrs: inst.attributes, deps: inst.dependencies || [] }; }
      return { serial: j.serial || 1, lineage: j.lineage, res, outputs: j.outputs || {} };
    } catch (e) { return { serial: 0, lineage: hex(8), res: {}, outputs: {} }; }
  }
  function saveState(c, st) {
    st.serial++;
    const by = {};
    for (const [addr, r] of Object.entries(st.res)) { const k = r.type + '.' + r.name; (by[k] = by[k] || { mode: 'managed', type: r.type, name: r.name, provider: `provider["registry.terraform.io/${providerOf(r.type) || 'hashicorp/null'}"]`, instances: [] }).instances.push(Object.assign({ schema_version: 0 }, r.key === '' ? {} : { index_key: r.key }, { attributes: r.attrs, sensitive_attributes: [] })); }
    const j = { version: 4, terraform_version: '1.9.5', serial: st.serial, lineage: st.lineage, outputs: st.outputs, resources: Object.values(by), check_results: null };
    c.sh.writeFile(stateFile(c), JSON.stringify(j, null, 2) + '\n', false);
  }

  function makeCtx(c, cfg, varVals, stateRes, planned) {
    const sh = c.sh;
    const ctx = {
      sh, cwd: sh.cwd, loc: null, count: null, each: null,
      resourceTypes: new Set(Object.values(cfg.resources).map((r) => r.type)),
      varsObj: () => varVals,
      localsObj: () => {
        const o = {};
        for (const [k, l] of Object.entries(cfg.locals)) {
          Object.defineProperty(o, k, { enumerable: true, get: () => { if (l.__busy) throw new HclErr(`Cycle: local.${k}`, l.line, 'Cycle error'); l.__busy = true; try { return evalExpr(l.expr, ctx); } finally { l.__busy = false; } } });
        }
        return o;
      },
      typeObj: (type) => {
        const o = {};
        for (const r of Object.values(cfg.resources)) {
          if (r.type !== type) continue;
          const addrBase = `${r.type}.${r.name}`;
          const insts = Object.entries(planned).filter(([a]) => a === addrBase || a.startsWith(addrBase + '['));
          if (!insts.length) { o[r.name] = { __unknownRest: true }; continue; }
          const multi = insts.some(([a]) => a.includes('['));
          if (!multi) o[r.name] = insts[0][1].after;
          else if (insts.every(([a]) => /\[\d+\]$/.test(a))) o[r.name] = insts.sort((x, y) => +/\[(\d+)\]$/.exec(x[0])[1] - +/\[(\d+)\]$/.exec(y[0])[1]).map(([, v]) => v.after);
          else o[r.name] = Object.fromEntries(insts.map(([a, v]) => [/\["(.*)"\]$/.exec(a)[1], v.after]));
        }
        return o;
      },
    };
    return ctx;
  }

  async function resolveVars(c, cfg, opts) {
    const sh = c.sh;
    const vals = {};
    const sens = new Set();
    const given = Object.assign({}, opts.varFileVals || {});
    for (const [k, v] of Object.entries(sh.vars)) if (k.startsWith('TF_VAR_')) given[k.slice(7)] = v;
    Object.assign(given, opts.cliVars || {});
    for (const [name, v] of Object.entries(cfg.variables)) {
      const ab = attrBody(v.body);
      let val;
      if (name in given) { val = given[name]; const ty = ab.type ? ab.type.expr : null; if (ty && ty.k === 'ref' && ty.name === 'number' && typeof val === 'string') val = +val; if (ty && ty.k === 'ref' && ty.name === 'bool' && typeof val === 'string') val = val === 'true'; if (ty && ty.k === 'call' && typeof val === 'string' && /^[\[{]/.test(val.trim())) { try { val = JSON.parse(val); } catch (e) { /* keep string */ } } }
      else if (ab.default) val = evalExpr(ab.default.expr, makeCtx(c, cfg, {}, {}, {}));
      else if (sh.hooks && sh.hooks.readLine && !opts.noInput) {
        const desc = ab.description ? evalExpr(ab.description.expr, { sh, cwd: sh.cwd, resourceTypes: new Set() }) : null;
        c.out(`var.${name}\n${desc ? '  ' + desc + '\n' : ''}\n`);
        val = await sh.hooks.readLine('  Enter a value: ');
        if (ab.type && ab.type.expr.k === 'ref' && ab.type.expr.name === 'number') val = +val;
      } else { return { err: `\n╷\n│ Error: No value for required variable\n│ \n│   on ${v.file} line ${v.line}:\n│    ${v.line}: variable "${name}" {\n│ \n│ The root module input variable "${name}" is not set, and has no default\n│ value. Use a -var or -var-file command line argument to provide a value for\n│ this variable.\n╵\n` }; }
      // validation blocks
      for (const vb of blocksOf(v.body, 'validation')) {
        const vab = attrBody(vb.body);
        if (vab.condition) {
          const ok = evalExpr(vab.condition.expr, Object.assign(makeCtx(c, cfg, {}, {}, {}), { loc: { [name]: val }, varsObj: () => Object.assign({}, vals, { [name]: val }) }));
          if (ok === false) { const msg = vab.error_message ? evalExpr(vab.error_message.expr, { sh, cwd: sh.cwd, resourceTypes: new Set() }) : 'Invalid value'; return { err: `\n╷\n│ Error: Invalid value for variable\n│ \n│   on ${v.file} line ${v.line}:\n│    ${v.line}: variable "${name}" {\n│     │ var.${name} is ${JSON.stringify(val)}\n│ \n│ ${msg}\n│ \n│ This was checked by the validation rule at ${v.file}:${vb.line}.\n╵\n` }; }
        }
      }
      vals[name] = val;
      if (ab.sensitive && ab.sensitive.expr.v === true) sens.add(name);
    }
    for (const k of Object.keys(given)) if (!(k in cfg.variables) && opts.cliVars && k in opts.cliVars) { return { err: `\n╷\n│ Error: Value for undeclared variable\n│ \n│ A variable named "${k}" was assigned on the command line, but the root module does not declare a variable of that name. To use this value, add a "variable" block to the configuration.\n╵\n` }; }
    return { vals, sens };
  }

  const keyOf = (k) => (k === '' ? '' : typeof k === 'number' ? `[${k}]` : `["${k}"]`);
  // evaluate one resource block into concrete attributes (for each instance); `planned` holds the already-evaluated others
  function evalResource(c, cfg, r, varVals, planned, stateRes) {
    const ctx0 = makeCtx(c, cfg, varVals, stateRes, planned);
    const ab = attrBody(r.body);
    const T = TYPES[r.type];
    // instances: count / for_each
    let keys = [''];
    let mode = 'single';
    if (ab.count) { const n = evalExpr(ab.count.expr, ctx0); if (isUnk(n)) throw new HclErr('Invalid count argument; The "count" value depends on resource attributes that cannot be determined until apply.', ab.count.line, 'Invalid count argument'); keys = Array.from({ length: n }, (_, i) => i); mode = 'count'; }
    else if (ab.for_each) { const fe = evalExpr(ab.for_each.expr, ctx0); if (isUnk(fe)) throw new HclErr('Invalid for_each argument; The "for_each" map includes keys derived from resource attributes that cannot be determined until apply.', ab.for_each.line, 'Invalid for_each argument'); keys = Array.isArray(fe) ? fe.map(String) : Object.keys(fe); mode = 'each'; r.__fe = fe; }
    const out = [];
    for (const key of keys) {
      const ctx = Object.assign({}, ctx0);
      if (mode === 'count') ctx.count = { index: key };
      if (mode === 'each') ctx.each = { key, value: Array.isArray(r.__fe) ? key : r.__fe[key] };
      const attrs = {};
      for (const [name, b] of Object.entries(ab)) {
        if (['count', 'for_each', 'depends_on', 'provider', 'lifecycle'].includes(name)) continue;
        attrs[name] = evalExpr(b.expr, ctx);
      }
      out.push({ key, attrs });
    }
    return out;
  }

  function schemaCheck(c, cfg, r) {
    const T = TYPES[r.type];
    if (!T) return { msg: `\n╷\n│ Error: Invalid resource type\n│ \n│   on ${r.file} line ${r.line}, in resource "${r.type}" "${r.name}":\n│    ${r.line}: resource "${r.type}" "${r.name}" {\n│ \n│ The provider ${r.type.split('_')[0] === 'sandbox' ? 'acme/sandbox' : 'hashicorp/' + r.type.split('_')[0]} does not support resource type "${r.type}".\n╵\n`, file: r.file };
    const ab = attrBody(r.body);
    for (const req of T.required) if (!(req in ab)) return { msg: `\n╷\n│ Error: Missing required argument\n│ \n│   on ${r.file} line ${r.line}, in resource "${r.type}" "${r.name}":\n│    ${r.line}: resource "${r.type}" "${r.name}" {\n│ \n│ The argument "${req}" is required, but no definition was found.\n╵\n` };
    for (const [name, b] of Object.entries(ab)) {
      if (['count', 'for_each', 'depends_on', 'provider', 'lifecycle'].includes(name)) continue;
      if (!T.required.includes(name) && !T.optional.includes(name)) return { msg: `\n╷\n│ Error: Unsupported argument\n│ \n│   on ${r.file} line ${b.line}, in resource "${r.type}" "${r.name}":\n│    ${b.line}: ${name} = ...\n│ \n│ An argument named "${name}" is not expected here.\n╵\n` };
    }
    return null;
  }
  function refCheck(c, cfg, r) {
    const refs = [];
    for (const b of r.body) if (b.kind === 'attr') refsOf(b.expr, refs);
    for (const rf of refs) {
      if (rf.root === 'var' && rf.chain[0] && !(rf.chain[0] in cfg.variables)) return { msg: `\n╷\n│ Error: Reference to undeclared input variable\n│ \n│   on ${r.file} line ${rf.line}, in resource "${r.type}" "${r.name}":\n│    ${rf.line}: ... var.${rf.chain[0]}\n│ \n│ An input variable with the name "${rf.chain[0]}" has not been declared. This\n│ variable can be declared with a variable "${rf.chain[0]}" {} block.\n╵\n` };
      if (rf.root === 'local' && rf.chain[0] && !(rf.chain[0] in cfg.locals)) return { msg: `\n╷\n│ Error: Reference to undeclared local value\n│ \n│   on ${r.file} line ${rf.line}, in resource "${r.type}" "${r.name}":\n│ \n│ A local value with the name "${rf.chain[0]}" has not been declared.\n╵\n` };
      if (cfg.resources[`${rf.root}.${rf.chain[0]}`] === undefined && TYPES[rf.root] && rf.chain[0]) return { msg: `\n╷\n│ Error: Reference to undeclared resource\n│ \n│   on ${r.file} line ${rf.line}, in resource "${r.type}" "${r.name}":\n│ \n│ A managed resource "${rf.root}" "${rf.chain[0]}" has not been declared in the root module.\n╵\n` };
    }
    return null;
  }
  function depsOf(cfg, r) {
    const refs = [];
    for (const b of r.body) if (b.kind === 'attr') refsOf(b.expr, refs);
    const dep = new Set();
    for (const rf of refs) if (TYPES[rf.root] && rf.chain[0] && cfg.resources[`${rf.root}.${rf.chain[0]}`]) dep.add(`${rf.root}.${rf.chain[0]}`);
    const dp = r.body.find((b) => b.kind === 'attr' && b.name === 'depends_on');
    if (dp) { const rr = []; refsOf(dp.expr, rr); for (const rf of rr) if (cfg.resources[`${rf.root}.${rf.chain[0]}`]) dep.add(`${rf.root}.${rf.chain[0]}`); }
    return [...dep];
  }
  function topo(cfg) {
    const order = [];
    const seen = {};
    const visit = (k, stack) => {
      if (seen[k] === 2) return;
      if (seen[k] === 1) throw new HclErr(`Cycle: ${[...stack, k].join(' -> ')}`, 0, 'Cycle');
      seen[k] = 1;
      for (const d of depsOf(cfg, cfg.resources[k])) visit(d, [...stack, k]);
      seen[k] = 2;
      order.push(k);
    };
    for (const k of cfg.order) visit(k, []);
    return order;
  }

  /* value printing */
  const fmtScalar = (v) => (v === null ? 'null' : typeof v === 'string' ? JSON.stringify(v) : String(v));
  function fmtVal(v, ind) {
    if (isUnk(v)) return '(known after apply)';
    if (Array.isArray(v)) { if (!v.length) return '[]'; return '[\n' + v.map((x) => ' '.repeat(ind + 2) + fmtVal(x, ind + 2) + ',').join('\n') + '\n' + ' '.repeat(ind) + ']'; }
    if (v && typeof v === 'object') { const ks = Object.keys(v); if (!ks.length) return '{}'; const w = Math.max(...ks.map((k) => k.length)); return '{\n' + ks.map((k) => ' '.repeat(ind + 2) + (/^[A-Za-z_][\w-]*$/.test(k) ? k : JSON.stringify(k)).padEnd(w) + ' = ' + fmtVal(v[k], ind + 2)).join('\n') + '\n' + ' '.repeat(ind) + '}'; }
    return fmtScalar(v);
  }
  const eqv = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /* plan */
  async function makePlan(c, cfg, varVals, state, opts) {
    const sh = c.sh;
    const order = topo(cfg);
    const planned = {};
    const actions = [];
    const targetOk = (addr) => !opts.targets || opts.targets.some((t) => addr === t || addr.startsWith(t + '[') || (opts.targets.includes(addr)));
    const live = Object.assign({}, state.res);
    // refresh: drift from the real world
    const refreshLines = [];
    for (const [addr, s] of Object.entries(live)) {
      const T = TYPES[s.type];
      if (T && T.refresh) { const nr = T.refresh({ sh, cwd: sh.cwd }, s.attrs); if (nr === null) { delete live[addr]; } else live[addr] = Object.assign({}, s, { attrs: nr }); }
      refreshLines.push(`${addr}: Refreshing state... [id=${(s.attrs && s.attrs.id) || ''}]`);
    }
    const destroyAll = !!opts.destroy;
    const wanted = new Set();
    for (const k of order) {
      const r = cfg.resources[k];
      if (destroyAll) break;
      const instances = evalResource(c, cfg, r, varVals, planned, live);
      const T = TYPES[r.type];
      for (const { key, attrs } of instances) {
        const addr = `${r.type}.${r.name}${keyOf(key)}`;
        wanted.add(addr);
        const cfgAttrs = {};
        for (const nm of Object.keys(T.defaults || {})) if (!(nm in attrs)) cfgAttrs[nm] = T.defaults[nm];
        Object.assign(cfgAttrs, attrs);
        if (T.validate) for (const [nm, fn] of Object.entries(T.validate)) if (nm in cfgAttrs && !isUnk(cfgAttrs[nm])) { const ok = fn(cfgAttrs[nm]); if (ok !== true) throw new HclErr(ok, r.line, 'Invalid value for argument'); }
        const old = live[addr];
        const comp = {};
        for (const nm of T.computed) comp[nm] = UNK;
        let action = 'create';
        let forces = [];
        let changed = [];
        let after;
        if (old && !(opts.replace && opts.replace.includes(addr))) {
          for (const nm of new Set([...Object.keys(cfgAttrs)])) {
            if (isUnk(cfgAttrs[nm])) { if (T.forceNew.includes(nm) && old.attrs[nm] === undefined) forces.push(nm); else changed.push(nm); continue; }
            if (!eqv(old.attrs[nm], cfgAttrs[nm]) && !(old.attrs[nm] === undefined && cfgAttrs[nm] === null)) { if (T.forceNew.includes(nm)) forces.push(nm); else changed.push(nm); }
          }
          if (forces.length) { action = 'replace'; after = Object.assign({}, cfgAttrs, comp); }
          else if (changed.length) { action = 'update'; after = Object.assign({}, old.attrs, cfgAttrs); }
          else { action = 'noop'; after = Object.assign({}, old.attrs); }
        } else {
          if (old) { action = 'replace'; forces = ['(replace requested)']; }
          after = Object.assign({}, cfgAttrs, comp);
        }
        const lc = blocksOf(r.body, 'lifecycle')[0];
        if (lc && (action === 'replace') && attrBody(lc.body).prevent_destroy && attrBody(lc.body).prevent_destroy.expr.v === true) throw new HclErr(`Instance cannot be destroyed; Resource ${addr} has lifecycle.prevent_destroy set, but the plan calls for this resource to be destroyed.`, r.line, 'Instance cannot be destroyed');
        planned[addr] = { after, action };
        actions.push({ addr, type: r.type, name: r.name, key, action, before: old ? old.attrs : null, after, forces, changed, cfgAttrs, rkey: k });
      }
    }
    // destroys: in state but not wanted (or everything on destroy)
    for (const [addr, s] of Object.entries(live)) {
      if (destroyAll || !wanted.has(addr)) {
        if (!targetOk(addr) && opts.targets) continue;
        actions.push({ addr, type: s.type, name: s.name, key: s.key, action: 'delete', before: s.attrs, after: null, forces: [], changed: [], cfgAttrs: {} });
      }
    }
    return { actions, live, refreshLines, planned, order };
  }

  function attrsToShow(T, type) { return T; }
  function renderPlan(c, plan, cfg, varSens, destroyMode) {
    const A = plan.actions.filter((a) => a.action !== 'noop').sort((x, y) => (x.addr < y.addr ? -1 : x.addr > y.addr ? 1 : 0));
    if (!A.length) return '';
    const sym = { create: '+', update: '~', delete: '-', replace: '-/+' };
    const used = new Set(A.map((a) => a.action));
    let out = 'Terraform used the selected providers to generate the following execution plan. Resource actions are indicated with the following symbols:\n';
    if (used.has('create')) out += '  + create\n';
    if (used.has('update')) out += '  ~ update in-place\n';
    if (used.has('delete')) out += '  - destroy\n';
    if (used.has('replace')) out += '-/+ destroy and then create replacement\n';
    out += '\nTerraform will perform the following actions:\n';
    for (const a of A) {
      const T = TYPES[a.type] || {};
      const sens = new Set(T.sensitive || []);
      const hd = { create: 'will be created', update: 'will be updated in-place', delete: 'will be destroyed', replace: 'must be replaced' }[a.action];
      out += `\n  # ${a.addr} ${hd}\n`;
      out += `  ${sym[a.action].padEnd(a.action === 'replace' ? 3 : 1)} resource "${a.type}" "${a.name}" {\n`;
      const names = new Set([...Object.keys(a.after || {}), ...Object.keys(a.before || {})]);
      const list = [...names].filter((nm) => !String(nm).startsWith('__')).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
      const w = Math.max(...list.map((x) => x.length), 1);
      let hidden = 0;
      const pad = '      ';
      for (const nm of list) {
        const b = a.before ? a.before[nm] : undefined;
        const f = a.after ? a.after[nm] : undefined;
        const markObj = (txt, mk) => { if (!mk || !txt.startsWith('{\n')) return txt; const ls = txt.split('\n'); return ls.map((l, i) => (i === 0 || i === ls.length - 1 ? l : l.slice(0, 8) + mk + ' ' + l.slice(10))).join('\n'); };
        const show = (v, mk) => (v === undefined ? 'null' : isUnk(v) ? '(known after apply)' : sens.has(nm) ? '(sensitive value)' : markObj(fmtVal(v, 8), mk));
        if (a.action === 'create') { if (f === undefined || f === null) continue; out += `${pad}+ ${nm.padEnd(w)} = ${show(f, '+')}\n`; }
        else if (a.action === 'delete') { if (b === undefined || b === null) continue; out += `${pad}- ${nm.padEnd(w)} = ${sens.has(nm) ? '(sensitive value)' : markObj(fmtVal(b, 8), '-')} -> null\n`; }
        else if (a.action === 'update') {
          if (a.changed.includes(nm)) out += `${pad}~ ${nm.padEnd(w)} = ${show(b)} -> ${show(f)}\n`;
          else if (nm === 'id') out += `${pad}  ${nm.padEnd(w)} = ${show(b)}\n`;
          else hidden++;
        } else if (a.action === 'replace') {
          if (a.forces.includes(nm)) out += `${pad}~ ${nm.padEnd(w)} = ${show(b)} -> ${show(f)} # forces replacement\n`;
          else if (isUnk(f) && b !== undefined) out += `${pad}~ ${nm.padEnd(w)} = ${show(b)} -> (known after apply)\n`;
          else if (!eqv(b, f)) out += `${pad}~ ${nm.padEnd(w)} = ${show(b)} -> ${show(f)}\n`;
          else hidden++;
        }
      }
      if (hidden) out += `        # (${hidden} unchanged attribute${hidden === 1 ? '' : 's'} hidden)\n`;
      out += '    }\n';
    }
    const cnt = (x) => A.filter((a) => a.action === x).length;
    const add = cnt('create') + cnt('replace');
    const chg = cnt('update');
    const del = cnt('delete') + cnt('replace');
    out += `\nPlan: ${add} to add, ${chg} to change, ${del} to destroy.\n`;
    return out;
  }

  async function runProvisioners(c, cfg, rkey, addr, attrsIfAny) {
    const r = cfg.resources[rkey];
    if (!r) return 0;
    for (const pb of blocksOf(r.body, 'provisioner')) {
      if (pb.labels[0] !== 'local-exec') continue;
      const ab = attrBody(pb.body);
      const cmdv = ab.command ? evalExpr(ab.command.expr, attrsIfAny.ctx) : '';
      c.out(`${addr} (local-exec): Executing: ["/bin/sh" "-c" ${JSON.stringify(cmdv)}]\n`);
      let outp = '';
      const st = await c.sh.runSource(cmdv, { stdin: '', stdout: (x) => (outp += x), stderr: (x) => (outp += x), tty: false });
      outp.split('\n').filter((l, i, arr) => !(i === arr.length - 1 && l === '')).forEach((l) => c.out(`${addr} (local-exec): ${l}\n`));
      if (st) { c.err(`\n╷\n│ Error: local-exec provisioner error\n│ \n│   with ${addr},\n│ \n│ Error running command '${cmdv}': exit status ${st}. Output: ${outp.trim()}\n╵\n`); return st; }
    }
    return 0;
  }

  async function doApply(c, cfg, varVals, state, plan, opts) {
    const sh = c.sh;
    const R = { sh, cwd: sh.cwd };
    const A = plan.actions.filter((a) => a.action !== 'noop');
    const order = plan.order;
    const idx = (a) => (a.rkey ? order.indexOf(a.rkey) : -1);
    const destroys = A.filter((a) => a.action === 'delete' || a.action === 'replace').sort((x, y) => idx(y) - idx(x));
    const creates = A.filter((a) => a.action === 'create' || a.action === 'replace' || a.action === 'update').sort((x, y) => idx(x) - idx(y));
    let added = 0; let changed = 0; let destroyed = 0;
    const doneAttrs = {};
    // destroy first (reverse order)
    for (const a of destroys) {
      const T = TYPES[a.type];
      c.out(`${a.addr}: Destroying... [id=${a.before.id}]\n`);
      if (T.destroy) T.destroy(R, a.before);
      delete state.res[a.addr];
      c.out(`${a.addr}: Destruction complete after 0s\n`);
      destroyed++;
    }
    // create / update in dependency order, re-evaluating with real values
    const real = {};
    for (const [addr, s] of Object.entries(state.res)) real[addr] = { after: s.attrs, action: 'noop' };
    for (const k of order) {
      const r = cfg.resources[k];
      if (!r) continue;
      const mine = creates.filter((a) => a.rkey === k);
      if (!mine.length) continue;
      const insts = evalResource(c, cfg, r, varVals, real, state.res);
      for (const a of mine) {
        const T = TYPES[a.type];
        const inst = insts.find((x) => x.key === a.key);
        const attrs = {};
        for (const nm of Object.keys(T.defaults || {})) attrs[nm] = T.defaults[nm];
        Object.assign(attrs, inst.attrs);
        for (const v of Object.values(attrs)) if (isUnk(v)) { c.err('\n╷\n│ Error: Provider produced inconsistent result: an attribute value was still unknown during apply\n╵\n'); return 1; }
        if (a.action === 'update') {
          c.out(`${a.addr}: Modifying... [id=${a.before.id}]\n`);
          const extra = T.update ? T.update(R, a.before, attrs) : {};
          state.res[a.addr] = { type: a.type, name: a.name, key: a.key, attrs: Object.assign({}, a.before, attrs, extra) };
          c.out(`${a.addr}: Modifications complete after 0s [id=${a.before.id}]\n`);
          changed++;
        } else {
          c.out(`${a.addr}: Creating...\n`);
          let comp;
          try { comp = T.create(R, attrs); } catch (e) { if (e instanceof FsErr) { c.err(`\n╷\n│ Error: ${a.type} create failed\n│ \n│   with ${a.addr},\n│ \n│ ${U.errTxt(e)}\n╵\n`); saveState(c, state); return 1; } throw e; }
          const stAttrs = Object.assign({}, attrs, comp);
          state.res[a.addr] = { type: a.type, name: a.name, key: a.key, attrs: stAttrs };
          real[a.addr] = { after: stAttrs, action: 'create' };
          const ctx = makeCtx(c, cfg, varVals, state.res, real);
          const rc = await runProvisioners(c, cfg, k, a.addr, { ctx: Object.assign(ctx, { loc: { self: stAttrs } }) });
          if (rc) { saveState(c, state); return 1; }
          c.out(`${a.addr}: Creation complete after 0s [id=${comp.id !== undefined ? comp.id : ''}]\n`);
          added++;
        }
        real[a.addr] = { after: state.res[a.addr].attrs, action: a.action };
      }
    }
    // outputs
    const ctx = makeCtx(c, cfg, varVals, state.res, Object.fromEntries(Object.entries(state.res).map(([ad, s]) => [ad, { after: s.attrs, action: 'noop' }])));
    state.outputs = {};
    for (const [nm, o] of Object.entries(cfg.outputs)) {
      const ab = attrBody(o.body);
      let v;
      try { v = ab.value ? evalExpr(ab.value.expr, ctx) : null; } catch (e) { if (e instanceof HclErr) { printErr(c, o.file, '', e); return 1; } throw e; }
      state.outputs[nm] = { value: v, type: typeof v === 'string' ? 'string' : typeof v === 'number' ? 'number' : Array.isArray(v) ? ['tuple', []] : typeof v === 'boolean' ? 'bool' : ['object', {}], sensitive: !!(ab.sensitive && ab.sensitive.expr.v === true) };
    }
    if (opts.destroy) state.outputs = {};
    saveState(c, state);
    if (opts.destroy) { c.out(`\nDestroy complete! Resources: ${destroyed} destroyed.\n`); return 0; }
    c.out(`\nApply complete! Resources: ${added} added, ${changed} changed, ${destroyed} destroyed.\n`);
    printOutputs(c, state, true);
    return 0;
  }
  function printOutputs(c, state, header) {
    const ks = Object.keys(state.outputs).sort();
    if (!ks.length) return;
    if (header) c.out('\nOutputs:\n\n');
    for (const k of ks) { const o = state.outputs[k]; c.out(`${k} = ${o.sensitive ? '<sensitive>' : fmtVal(o.value, 0)}\n`); }
  }

  /* fmt */
  function formatHcl(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const out = [];
    let depth = 0;
    for (let i = 0; i < lines.length; i++) {
      let l = lines[i].trim();
      if (l === '') { out.push(''); continue; }
      const closes = /^[}\])]/.test(l);
      if (closes) depth = Math.max(0, depth - 1);
      out.push('  '.repeat(depth) + l.replace(/\s*=\s*/, (m, off) => (l.slice(0, off).includes('"') && !/^[\w-]+\s*$/.test(l.slice(0, off)) ? m : ' = ')).replace(/^([\w-]+)\s*=\s*/, '$1 = '));
      const opens = (l.match(/[{[(]/g) || []).length - (l.match(/[}\])]/g) || []).length;
      // do not count characters inside strings
      const stripped = l.replace(/"([^"\\]|\\.)*"/g, '""');
      const o2 = (stripped.match(/[{[(]/g) || []).length - (stripped.match(/[}\])]/g) || []).length;
      depth += closes ? o2 + 1 : o2;
      depth = Math.max(0, depth);
    }
    // align '=' in runs of single-line attributes
    const res = out.slice();
    let i = 0;
    while (i < res.length) {
      const m = /^(\s*)([\w-]+) = (.*)$/.exec(res[i]);
      if (!m || /[{[(]\s*$/.test(res[i])) { i++; continue; }
      let j = i;
      const grp = [];
      while (j < res.length) {
        const mm = /^(\s*)([\w-]+) = (.*)$/.exec(res[j]);
        if (!mm || mm[1] !== m[1] || /[{[(]\s*$/.test(res[j])) break;
        grp.push(mm);
        j++;
      }
      const w = Math.max(...grp.map((g) => g[2].length));
      grp.forEach((g, k) => { res[i + k] = `${g[1]}${g[2].padEnd(w)} = ${g[3]}`; });
      i = j;
    }
    return res.join('\n').replace(/\n+$/, '') + '\n';
  }

  /* the command */
  def('terraform', async (c, args) => {
    const sh = c.sh;
    const sub = args[0];
    const rest = args.slice(1);
    const has = (f) => rest.includes(f);
    const flagVal = (n) => { const a = rest.find((x) => x.startsWith(n + '=')); if (a) return a.slice(n.length + 1); const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : null; };
    if (!sub || sub === '-help' || sub === '--help') { c.out('Usage: terraform [global options] <subcommand> [args]\n\nMain commands:\n  init          Prepare your working directory for other commands\n  validate      Check whether the configuration is valid\n  plan          Show changes required by the current configuration\n  apply         Create or update infrastructure\n  destroy       Destroy previously-created infrastructure\n\nAll other commands:\n  fmt           Reformat your configuration in the standard style\n  output        Show output values from your root module\n  show          Show the current state or a saved plan\n  state         Advanced state management\n  version       Show the current Terraform version\n'); return 0; }
    if (sub === 'version' || sub === '-version' || sub === '--version') { c.out('Terraform v1.9.5\non linux_amd64\n'); return 0; }
    if (!['init', 'validate', 'fmt', 'plan', 'apply', 'destroy', 'output', 'show', 'state', 'refresh', 'providers', 'workspace', 'taint', 'untaint'].includes(sub)) { c.err(`Terraform has no command named "${sub}".\n\nTo see all of Terraform's top-level commands, run:\n  terraform -help\n`); return 1; }
    if (sub === 'workspace') { c.out(rest[0] === 'show' ? 'default\n' : '* default\n'); return 0; }
    const L = loadConfig(c);
    if (sub === 'fmt') {
      const d = sh.fs.lookup(sh.cwd);
      const files = Object.keys(d.kids || {}).filter((k) => k.endsWith('.tf')).sort();
      const changed = [];
      for (const f of files) { const t = sh.readFile(sh.cwd + '/' + f); const nt = formatHcl(t); if (nt !== t) { changed.push(f); if (!has('-check')) sh.writeFile(sh.cwd + '/' + f, nt, false); } }
      changed.forEach((f) => c.out(f + '\n'));
      return has('-check') && changed.length ? 3 : 0;
    }
    if (L.err === 'nofiles' && sub !== 'state' && sub !== 'output' && sub !== 'show') { c.err('\n╷\n│ Error: No configuration files\n│ \n│ Plan requires configuration to be present. Planning without a configuration would mark everything for destruction, which is normally not what is desired. If you would like to destroy everything, run plan with the -destroy option. Otherwise, create a Terraform configuration file (.tf file) and try again.\n╵\n'); return 1; }
    if (L.err === 'parse') { printErr(c, L.file, L.text, L.e); return 1; }
    const cfg = L.cfg;
    const tfDir = sh.fs.lookup(sh.cwd + '/.terraform');
    const lock = sh.fs.lookup(sh.cwd + '/.terraform.lock.hcl');
    const neededProviders = () => {
      const s = new Set();
      for (const r of Object.values(cfg.resources)) { const p = providerOf(r.type); if (p) s.add(p); }
      return [...s].sort();
    };

    if (sub === 'init') {
      if (L.err === 'nofiles') { c.err('Terraform initialized in an empty directory!\n\nThe directory has no Terraform configuration files. You may begin working\nwith Terraform immediately by creating Terraform configuration files.\n'); return 0; }
      if (!sh.netUp()) { c.err('\nInitializing the backend...\n\nInitializing provider plugins...\n- Finding latest version of hashicorp/local...\n╷\n│ Error: Failed to query available provider packages\n│ \n│ Could not retrieve the list of available versions for provider hashicorp/local: could not connect to registry.terraform.io: Failed to request discovery document: Get "https://registry.terraform.io/.well-known/terraform.json": dial tcp: lookup registry.terraform.io: no such host\n╵\n'); return 1; }
      const provs = neededProviders();
      for (const r of Object.values(cfg.resources)) { const e = schemaCheck(c, cfg, { ...r, body: [] }); if (e && !TYPES[r.type]) { c.err(e.msg.replace('Invalid resource type', 'Invalid resource type')); return 1; } }
      c.out('\nInitializing the backend...\n\nInitializing provider plugins...\n');
      for (const p of provs) c.out(`- Finding latest version of ${p}...\n`);
      for (const p of provs) c.out(`- Installing ${p} v${PROVIDER_VERSIONS[p]}...\n- Installed ${p} v${PROVIDER_VERSIONS[p]} (signed by ${p.startsWith('acme') ? 'a third party' : 'HashiCorp'})\n`);
      sh.fs.mkdirp(sh.cwd + '/.terraform/providers', {});
      const lk = provs.map((p) => `provider "registry.terraform.io/${p}" {\n  version     = "${PROVIDER_VERSIONS[p]}"\n  constraints = "${PROVIDER_VERSIONS[p]}"\n  hashes = [\n    "h1:${hex(8)}${hex(20)}=",\n  ]\n}\n`).join('\n');
      sh.writeFile(sh.cwd + '/.terraform.lock.hcl', '# This file is maintained automatically by "terraform init".\n# Manual edits may be lost in future updates.\n\n' + lk, false);
      sh.writeFile(sh.cwd + '/.terraform/terraform.tfstate', '{"version":3}\n', false);
      c.out('\nTerraform has created a lock file .terraform.lock.hcl to record the provider\nselections it made above. Include this file in your version control repository\nso that Terraform can guarantee to make the same selections by default when\nyou run "terraform init" in the future.\n\nTerraform has been successfully initialized!\n\nYou may now begin working with Terraform. Try running "terraform plan" to see\nany changes that are required for your infrastructure. All Terraform commands\nshould now work.\n\nIf you ever set or change modules or backend configuration for Terraform,\nrerun this command to reinitialize your working directory. If you forget, other\ncommands will detect it and remind you to do so if necessary.\n');
      return 0;
    }
    if (sub === 'providers') { c.out('\nProviders required by configuration:\n.\n' + neededProviders().map((p) => `└── provider[registry.terraform.io/${p}]\n`).join('')); return 0; }
    if (sub === 'state' || sub === 'show' || sub === 'output') {
      const st = loadState(c);
      if (sub === 'state') {
        const act = rest[0];
        if (act === 'list') { Object.keys(st.res).sort().forEach((a) => c.out(a + '\n')); return 0; }
        if (act === 'show') { const a = st.res[rest[1]]; if (!a) { c.err(`No instance found for the given address!\n\nThis command requires that the address references one specific instance.\n`); return 1; } c.out(`# ${rest[1]}:\nresource "${a.type}" "${a.name}" {\n${Object.keys(a.attrs).sort().map((k) => `    ${k} = ${fmtVal(a.attrs[k], 4)}`).join('\n')}\n}\n`); return 0; }
        if (act === 'rm') { const a = rest[1]; if (!st.res[a]) { c.err(`No matching objects found.\n`); return 1; } delete st.res[a]; saveState(c, st); c.out(`Removed ${a}\nSuccessfully removed 1 resource instance(s).\n`); return 0; }
        c.err('Usage: terraform [global options] state <subcommand> [options] [args]\n'); return 1;
      }
      if (sub === 'show') {
        const keys = Object.keys(st.res).sort();
        if (!keys.length) { c.out('The state file is empty. No resources are represented.\n'); return 0; }
        for (const k of keys) { const a = st.res[k]; const T = TYPES[a.type] || {}; c.out(`# ${k}:\nresource "${a.type}" "${a.name}" {\n${Object.keys(a.attrs).sort().map((n) => `    ${n} = ${(T.sensitive || []).includes(n) ? '(sensitive value)' : fmtVal(a.attrs[n], 4)}`).join('\n')}\n}\n\n`); }
        return 0;
      }
      // output
      const names = rest.filter((a) => !a.startsWith('-'));
      if (!Object.keys(st.outputs).length) { c.err('╷\n│ Warning: No outputs found\n│ \n│ The state file either has no outputs defined, or all the defined outputs are empty. Please define an output in your configuration with the `output` keyword and run `terraform refresh` for it to become available. If you are using interpolation, please verify the interpolated value is not empty. You can use the `terraform console` command to assist.\n╵\n'); return has('-json') ? 0 : 0; }
      if (names.length) {
        const o = st.outputs[names[0]];
        if (!o) { c.err(`╷\n│ Error: Output "${names[0]}" not found\n│ \n│ The output variable requested could not be found in the state file. If you recently added this to your configuration, be sure to run \`terraform apply\`, since the state won't be updated with new output variables until that command is run.\n╵\n`); return 1; }
        if (has('-json')) c.out(JSON.stringify(o.value, null, 2) + '\n');
        else if (has('-raw')) c.out(String(o.value));
        else c.out((o.sensitive ? '<sensitive>' : fmtVal(o.value, 0)) + '\n');
        return 0;
      }
      if (has('-json')) { c.out(JSON.stringify(Object.fromEntries(Object.entries(st.outputs).map(([k, o]) => [k, { sensitive: o.sensitive, type: o.type, value: o.value }])), null, 2) + '\n'); return 0; }
      printOutputs(c, st, false);
      return 0;
    }

    // validate / plan / apply / destroy / refresh need initialised providers
    if (sub !== 'validate') {
      const prov = neededProviders();
      if (prov.length && (!lock || !tfDir)) {
        c.err(`\n╷\n│ Error: Inconsistent dependency lock file\n│ \n│ The following dependency selections recorded in the lock file are inconsistent with the current configuration:\n${prov.map((p) => `│   - provider registry.terraform.io/${p}: required by this configuration but no version is selected\n`).join('')}│ \n│ To make the initial dependency selections that will initialize the dependency lock file, run:\n│   terraform init\n╵\n`);
        return 1;
      }
    }
    // static validation
    for (const r of Object.values(cfg.resources)) {
      const e1 = schemaCheck(c, cfg, r) || refCheck(c, cfg, r);
      if (e1) { c.err(e1.msg); return 1; }
    }
    for (const o of Object.values(cfg.outputs)) { const rr = []; for (const b of o.body) if (b.kind === 'attr') refsOf(b.expr, rr); for (const rf of rr) if (rf.root === 'var' && rf.chain[0] && !(rf.chain[0] in cfg.variables)) { c.err(`\n╷\n│ Error: Reference to undeclared input variable\n│ \n│   on ${o.file} line ${rf.line}, in output "${o.name}":\n│ \n│ An input variable with the name "${rf.chain[0]}" has not been declared.\n╵\n`); return 1; } }
    try { topo(cfg); } catch (e) { if (e instanceof HclErr) { c.err(`\n╷\n│ Error: ${e.summary}\n│ \n│ ${e.message}\n╵\n`); return 1; } throw e; }
    if (sub === 'validate') {
      if (!has('-json')) c.out('Success! The configuration is valid.\n\n');
      else c.out('{\n  "format_version": "1.0",\n  "valid": true,\n  "error_count": 0,\n  "warning_count": 0,\n  "diagnostics": []\n}\n');
      return 0;
    }

    // variables
    const opts = { cliVars: {}, varFileVals: {}, destroy: sub === 'destroy' || has('-destroy'), targets: null, replace: null, noInput: flagVal('-input') === 'false' };
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '-var') { const kv = rest[++i] || ''; const eq = kv.indexOf('='); opts.cliVars[kv.slice(0, eq)] = kv.slice(eq + 1); }
      else if (rest[i].startsWith('-var=')) { const kv = rest[i].slice(5); const eq = kv.indexOf('='); opts.cliVars[kv.slice(0, eq)] = kv.slice(eq + 1); }
      else if (rest[i] === '-target' || rest[i].startsWith('-target=')) (opts.targets = opts.targets || []).push(rest[i] === '-target' ? rest[++i] : rest[i].slice(8));
      else if (rest[i] === '-replace' || rest[i].startsWith('-replace=')) (opts.replace = opts.replace || []).push(rest[i] === '-replace' ? rest[++i] : rest[i].slice(9));
    }
    const vfiles = [];
    if (sh.fs.lookup(sh.cwd + '/terraform.tfvars')) vfiles.push('terraform.tfvars');
    const d = sh.fs.lookup(sh.cwd);
    Object.keys(d.kids || {}).filter((k) => k.endsWith('.auto.tfvars')).sort().forEach((k) => vfiles.push(k));
    rest.forEach((x, i) => { if (x.startsWith('-var-file=')) vfiles.push(x.slice(10)); else if (x === '-var-file') vfiles.push(rest[i + 1]); });
    for (const vf of vfiles) {
      const n = sh.fs.lookup(VFS.norm(vf, sh.cwd));
      if (!n) { c.err(`\n╷\n│ Error: Failed to read variables file\n│ \n│ Given variables file ${vf} does not exist.\n╵\n`); return 1; }
      try { for (const it of parseHcl(sh.readFile(VFS.norm(vf, sh.cwd)))) if (it.kind === 'attr') opts.varFileVals[it.name] = evalExpr(it.expr, { sh, cwd: sh.cwd, resourceTypes: new Set() }); } catch (e) { if (e instanceof HclErr) { printErr(c, vf, sh.readFile(VFS.norm(vf, sh.cwd)), e); return 1; } throw e; }
    }
    let rv;
    try { rv = await resolveVars(c, cfg, opts); } catch (e) { if (e instanceof HclErr) { c.err(`\n╷\n│ Error: ${e.summary}\n│ \n│ ${e.message}\n╵\n`); return 1; } throw e; }
    if (rv.err) { c.err(rv.err); return 1; }
    const state = loadState(c);
    let plan;
    try { plan = await makePlan(c, cfg, rv.vals, state, opts); } catch (e) {
      if (e instanceof HclErr) {
        const r = Object.values(cfg.resources).find((x) => x.line === e.line) || null;
        const file = r ? r.file : cfg.files[0];
        c.err(`\n╷\n│ Error: ${e.summary}\n│ \n${e.line ? `│   on ${file} line ${e.line}:\n│ \n` : ''}│ ${String(e.message).replace(/^[^;]*; /, '').split('\n').join('\n│ ')}\n╵\n`);
        return 1;
      }
      throw e;
    }
    plan.refreshLines.forEach((l) => c.out(l + '\n'));
    // output changes
    const text = renderPlan(c, plan, cfg, rv.sens, opts.destroy);
    const A = plan.actions.filter((a) => a.action !== 'noop');
    if (sub === 'refresh') { for (const [addr, s] of Object.entries(plan.live)) state.res[addr] = s; for (const a of Object.keys(state.res)) if (!plan.live[a]) delete state.res[a]; saveState(c, state); c.out('\n'); return 0; }
    if (!A.length) {
      c.out(`\nNo changes. Your infrastructure matches the configuration.\n\nTerraform has compared your real infrastructure against your configuration\nand found no differences, so no changes are needed.\n`);
      if (sub === 'apply' || sub === 'destroy') c.out(`\nApply complete! Resources: 0 added, 0 changed, 0 destroyed.\n`);
      return 0;
    }
    c.out('\n' + text);
    if (sub === 'plan') { if (!has('-detailed-exitcode')) c.out(`\n────────────────────────────────────────────────────────────────────────────\n\nNote: You didn't use the -out option to save this plan, so Terraform can't guarantee to take exactly these actions if you run "terraform apply" now.\n`); return has('-detailed-exitcode') ? 2 : 0; }
    // apply / destroy: ask
    if (!has('-auto-approve')) {
      if (!sh.hooks.readLine) { c.err('\n╷\n│ Error: Apply requires approval\n│ \n│ Use -auto-approve when there is no terminal to answer the prompt.\n╵\n'); return 1; }
      if (opts.destroy) c.out('\nDo you really want to destroy all resources?\n  Terraform will destroy all your managed infrastructure, as shown above.\n  There is no undo. Only \'yes\' will be accepted to confirm.\n\n');
      else c.out('\nDo you want to perform these actions?\n  Terraform will perform the actions described above.\n  Only \'yes\' will be accepted to approve.\n\n');
      const ans = await sh.hooks.readLine('  Enter a value: ');
      if (String(ans).trim() !== 'yes') { c.out(opts.destroy ? '\nDestroy cancelled.\n' : '\nApply cancelled.\n'); return 1; }
    }
    c.out('\n');
    return await doApply(c, cfg, rv.vals, state, plan, opts);
  }, { pkg: 'terraform' });

  Object.assign(LX.PKGS, { terraform: { ver: '1.9.5-1', desc: 'Infrastructure as code tool (HashiCorp). In real life: add the HashiCorp apt repository first', size: 26000, bins: ['terraform'] } });
  LX.hcl = { parse: parseHcl, format: formatHcl };
})();
