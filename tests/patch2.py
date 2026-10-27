p='js/sim-core.js'
s=open(p).read()
def rep(a,b,cnt=1):
    global s
    assert a in s, a[:90]
    s=s.replace(a,b,cnt)

# parseList: ;; terminator
rep("""        if (t.t === 'w' && stop.some((k) => isKw(t, k))) break;
        if (isOp(t, ')')) {""","""        if (t.t === 'w' && stop.some((k) => isKw(t, k))) break;
        if (isOp(t, ';;') && stop.includes(';;')) break;
        if (isOp(t, ')')) {""")
rep("} else if (nx && nx.t !== 'nl' && !isOp(nx, ';') && !(nx.t === 'w' && stop.some((k) => isKw(nx, k))) && !isOp(nx, ')')) {","} else if (nx && nx.t !== 'nl' && !isOp(nx, ';') && !isOp(nx, ';;') && !(nx.t === 'w' && stop.some((k) => isKw(nx, k))) && !isOp(nx, ')')) {")

# parseCommand additions: before RESERVED check
rep("""      if (RESERVED.some((k) => isKw(t, k))) throw unexpected(t);
      if (isKw(t, 'if')) {""","""      if (t.t === 'arith') {
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
      if (isKw(t, 'if')) {""")
# C-style for
rep("""        const nm = toks[p];
        if (!nm) throw new Incomplete();
        if (nm.t !== 'w') throw unexpected(nm);""","""        const nm = toks[p];
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
        if (nm.t !== 'w') throw unexpected(nm);""")
# parseSimple assignments
rep("""          if (words.length === 0 && f.q === 'n' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(f.s)) {
            const eq = f.s.indexOf('=');
            const segs = [{ q: 'n', s: f.s.slice(eq + 1) }].concat(t.segs.slice(1));
            assigns.push({ name: f.s.slice(0, eq), segs });
            p++;
            continue;
          }""","""          const am = f.q === 'n' ? /^([A-Za-z_][A-Za-z0-9_]*)(?:\\[([^\\]]*)\\])?(\\+?)=/.exec(f.s) : null;
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
          }""")

# applyRedirs: heredoc & here-string
rep("""        const target = (await this.expandWord(r.segs, { split: false, glob: false }))[0] || '';
        const abs = this.abs(target);""","""        if (r.v === '<<') {
          stdin = r.hd.quoted ? r.hd.body : await this.scanJoin(r.hd.body);
          continue;
        }
        const target = (await this.expandWord(r.segs, { split: false, glob: false }))[0] || '';
        if (r.v === '<<<') {
          stdin = target + '\\n';
          continue;
        }
        const abs = this.abs(target);""")

# execCmd: if/while cond wrapping and new node types
rep("""            for (const c of node.conds) {
              if ((await this.execList(c.cond, io2)) === 0) return await this.execList(c.body, io2);
            }""","""            for (const c of node.conds) {
              if ((await this.cond(() => this.execList(c.cond, io2))) === 0) return await this.execList(c.body, io2);
            }""")
rep("const c = await this.execList(node.cond, io2);","const c = await this.cond(() => this.execList(node.cond, io2));")
rep("""          case 'group':""","""          case 'arith': {
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
                io.stderr('bash: [[: ' + e.message + '\\n');
                return 2;
              }
              throw e;
            }
          }
          case 'case': {
            const w = (await this.expandWord(node.word, { split: false, glob: false }))[0] ?? '';
            for (const cl of node.clauses) {
              for (const ps of cl.pats) {
                const pat = (await this.expandWord(ps, { split: false, glob: false }))[0] ?? '';
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
              if (++this.loopGuard > 3000) throw new CmdErr('loop limit reached (sandbox safety stop)');
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
          case 'group':""")

# execSimple assignments
rep("""      const assigns = [];
      for (const a of node.assigns) assigns.push([a.name, (await this.expandWord(a.segs, { split: false, glob: false }))[0] || '']);
      if (argv.length === 0) {
        for (const [k, v] of assigns) this.setVar(k, v);
        if (node.redirs.length) await this.applyRedirs(node.redirs, io);
        return 0;
      }""","""      const assigns = [];
      const ops = [];
      for (const a of node.assigns) {
        if (a.arr) {
          const items = [];
          for (const w of a.arr) items.push(...(await this.expandWord(w)));
          ops.push({ a, items });
        } else {
          const v = (await this.expandWord(a.segs, { split: false, glob: false }))[0] || '';
          ops.push({ a, v });
          if (!a.idx && !a.append) assigns.push([a.name, v]);
        }
      }
      if (argv.length === 0) {
        for (const o of ops) this.applyAssign(o);
        if (node.redirs.length) await this.applyRedirs(node.redirs, io);
        return 0;
      }""")

# execAndOr / execPipe
rep("""    async execAndOr(n, io) {
      let st = await this.execPipe(n.first, io);
      this.status = st;
      for (const r of n.rest) {
        if (r.op === '&&' ? st === 0 : st !== 0) {
          st = await this.execPipe(r.p, io);
          this.status = st;
        }
      }
      return st;
    }""","""    async cond(fn) {
      this.condDepth++;
      try {
        return await fn();
      } finally {
        this.condDepth--;
      }
    }
    async execAndOr(n, io) {
      const exempt = n.rest.length > 0;
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
      if (st !== 0 && last && this.opts.e && this.condDepth === 0) throw new ExitSig(st);
      return st;
    }""")
rep("""      let input = io.stdin;
      let st = 0;
      for (let k = 0; k < n.cmds.length; k++) {
        const last = k === n.cmds.length - 1;
        let buf = '';
        const sub = { stdin: input, stdout: last ? io.stdout : (s) => (buf += s), stderr: io.stderr, tty: last ? io.tty : false };
        st = await this.execCmd(n.cmds[k], sub);
        input = buf;
      }
      return n.neg ? (st ? 0 : 1) : st;""","""      let input = io.stdin;
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
      return n.neg ? (st ? 0 : 1) : st;""")

# arithmetic with assignment, arrays
rep("""    arith(expr) {
      return String(arithEval(expr, (n) => this.getVar(n)));
    }""","""    arithPure(expr) {
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
        if ((m = /^([A-Za-z_]\\w*)\\s*(\\+\\+|--)$/.exec(e))) {
          const v = Number(this.getVar(m[1]) || 0);
          this.setVar(m[1], String(v + (m[2] === '++' ? 1 : -1)));
          last = String(v);
        } else if ((m = /^(\\+\\+|--)\\s*([A-Za-z_]\\w*)$/.exec(e))) {
          const v = Number(this.getVar(m[2]) || 0) + (m[1] === '++' ? 1 : -1);
          this.setVar(m[2], String(v));
          last = String(v);
        } else if ((m = /^([A-Za-z_]\\w*)\\s*(\\*\\*=|\\+=|-=|\\*=|\\/=|%=|=)\\s*(.+)$/.exec(e)) && !/^=/.test(m[3])) {
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
          this.arrays[a.name][a.idx] = o.v;
        } else {
          if (!Array.isArray(this.arrays[a.name])) this.arrays[a.name] = [];
          this.arrays[a.name][Number(this.arithPure(a.idx))] = o.v;
        }
        return;
      }
      if (a.append) this.setVar(a.name, (this.getVar(a.name) || '') + o.v);
      else this.setVar(a.name, o.v);
    }""")
# constructor fields
rep("      this.loopGuard = 0;\n      this.writePasswd();","      this.loopGuard = 0;\n      this.arrays = {};\n      this.assoc = new Set();\n      this.opts = { e: false, u: false, x: false, pipefail: false };\n      this.traps = {};\n      this.condDepth = 0;\n      this.writePasswd();")
# getVar arrays fallback
rep("      return this.vars[name];\n    }\n    setVar(name, val) {","      if (this.arrays[name] !== undefined) return Array.isArray(this.arrays[name]) ? this.arrays[name][0] : this.arrays[name]['0'];\n      return this.vars[name];\n    }\n    setVar(name, val) {")
# unbound var
rep("""            const v = this.getVar(m[1]);
            out.push({ s: v === undefined ? '' : String(v), x: true });""","""            const v = this.getVar(m[1]);
            if (v === undefined && this.opts.u && !/^[?#@*$!]$/.test(m[1])) throw new CmdErr(`${m[1]}: unbound variable`);
            out.push({ s: v === undefined ? '' : String(v), x: true });""")
# paramExp arrays
rep("""    async paramExp(inner) {""","""    async paramExp(inner) {
      let m0;
      if ((m0 = /^#([A-Za-z_]\\w*)\\[[@*]\\]$/.exec(inner))) return String(this.arrayValues(m0[1]).length);
      if ((m0 = /^!([A-Za-z_]\\w*)\\[[@*]\\]$/.exec(inner))) return this.arrayKeys(m0[1]).join(' ');
      if ((m0 = /^([A-Za-z_]\\w*)\\[([^\\]]+)\\]$/.exec(inner))) {
        if (m0[2] === '@' || m0[2] === '*') return this.arrayValues(m0[1]).join(' ');
        const key = this.assoc.has(m0[1]) ? await this.scanJoin(m0[2]) : m0[2];
        const v = this.arrayGet(m0[1], key);
        return v === undefined ? '' : String(v);
      }""")
# expandWord special cases
rep("""      for (const sg of braceExpand(segs)) {
        const fields = [];""","""      for (const sg of braceExpand(segs)) {
        if (sg.length === 1 && sg[0].q === 'd') {
          const ds = sg[0].s;
          let mm;
          if (ds === '$@' || ds === '$*') {
            const fr = this.argStack[this.argStack.length - 1];
            if (ds === '$*') out.push(fr ? fr.args.join(' ') : '');
            else out.push(...(fr ? fr.args : []));
            continue;
          }
          if ((mm = /^\\$\\{([A-Za-z_]\\w*)\\[@\\]\\}$/.exec(ds))) {
            out.push(...this.arrayValues(mm[1]));
            continue;
          }
          if ((mm = /^\\$\\{!([A-Za-z_]\\w*)\\[@\\]\\}$/.exec(ds))) {
            out.push(...this.arrayKeys(mm[1]));
            continue;
          }
        }
        const fields = [];""")
# trap on script exit
rep("""      } catch (e) {
        if (e instanceof ExitSig) return e.code;
        throw e;
      } finally {
        this.argStack.pop();
      }
    }
    async callFunc""","""      } catch (e) {
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
    async callFunc""")
# xtrace
rep("""      const w0 = node.words[0];
      if (w0 && w0.length === 1""","""      if (this.opts.x) io.stderr('+ ' + argv.join(' ') + '\\n');
      const w0 = node.words[0];
      if (w0 && w0.length === 1""")
open(p,'w').write(s)
print('ok2')
