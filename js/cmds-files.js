/* Linux Academy: file and directory commands */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS, cmpName } = LX;
  const U = (LX.U = {});

  /* ---------- shared helpers ---------- */
  U.getopts = function (name, c, args, bool, val, long, numeric, stop) {
    const o = {};
    const rest = [];
    val = val || '';
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--') {
        rest.push(...args.slice(i + 1));
        break;
      }
      if (a.startsWith('--')) {
        const eq = a.indexOf('=');
        const k = eq < 0 ? a.slice(2) : a.slice(2, eq);
        const m = long && long[k];
        if (!m) {
          c.err(`${name}: unrecognized option '--${k}'\nTry '${name} --help' for more information.\n`);
          return null;
        }
        if (val.includes(m)) o[m] = eq < 0 ? args[++i] : a.slice(eq + 1);
        else o[m] = true;
        continue;
      }
      if (a.length > 1 && a[0] === '-') {
        if (numeric && /^-\d+$/.test(a)) {
          o.n = a.slice(1);
          continue;
        }
        for (let j = 1; j < a.length; j++) {
          const ch = a[j];
          if (val.includes(ch)) {
            o[ch] = j + 1 < a.length ? a.slice(j + 1) : args[++i];
            break;
          }
          if (bool.includes(ch)) o[ch] = true;
          else {
            c.err(`${name}: invalid option -- '${ch}'\nTry '${name} --help' for more information.\n`);
            return null;
          }
        }
        continue;
      }
      if (stop) {
        rest.push(...args.slice(i));
        break;
      }
      rest.push(a);
    }
    return { o, rest };
  };
  U.human = function (n) {
    if (n < 1024) return String(n);
    const u = ['K', 'M', 'G', 'T'];
    let i = -1;
    do {
      n /= 1024;
      i++;
    } while (n >= 1024 && i < 3);
    return (n < 10 ? Math.ceil(n * 10) / 10 : Math.ceil(n)).toString().replace(/^(\d+)$/, (m) => (n < 10 ? m + '.0' : m)) + u[i];
  };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  U.lsDate = function (ms) {
    const d = new Date(ms);
    const dd = String(d.getDate()).padStart(2, ' ');
    if (Date.now() - ms < 182 * 86400000 && ms <= Date.now() + 3600000) return `${MON[d.getMonth()]} ${dd} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${MON[d.getMonth()]} ${dd}  ${d.getFullYear()}`;
  };
  U.permStr = function (n) {
    const t = n.t === 'd' ? 'd' : n.t === 'l' ? 'l' : n.t === 'c' ? 'c' : '-';
    let m = n.mode;
    if (n.acl && LX.VFS && LX.VFS.aclMaskOf) m = (m & ~0o070) | (LX.VFS.aclMaskOf(n) << 3);
    const tri = (sh, sp, ch) => ((m >> sh) & 4 ? 'r' : '-') + ((m >> sh) & 2 ? 'w' : '-') + (sp ? ((m >> sh) & 1 ? ch : ch.toUpperCase()) : (m >> sh) & 1 ? 'x' : '-');
    return t + tri(6, m & 0o4000, 's') + tri(3, m & 0o2000, 's') + tri(0, m & 0o1000, 't') + (n.acl ? '+' : '');
  };
  U.ask = async function (c, prompt) {
    const sh = c.sh;
    if (!sh.hooks.readLine) return 'y';
    const a = await sh.hooks.readLine(prompt);
    sh.checkAbort();
    return a == null ? '' : a;
  };
  U.fmtCols = function (items, width) {
    // items: [{plain, colored}] arranged column-major like ls
    if (!items.length) return '';
    const maxw = Math.max(...items.map((i) => i.plain.length)) + 2;
    let ncols = Math.max(1, Math.floor(width / maxw));
    let nrows = Math.ceil(items.length / ncols);
    ncols = Math.ceil(items.length / nrows);
    const lines = [];
    for (let r = 0; r < nrows; r++) {
      let line = '';
      for (let k = 0; k < ncols; k++) {
        const it = items[k * nrows + r];
        if (!it) continue;
        const last = (k + 1) * nrows + r >= items.length;
        line += it.colored + (last ? '' : ' '.repeat(maxw - it.plain.length));
      }
      lines.push(line);
    }
    return lines.join('\n') + '\n';
  };
  U.errTxt = (e) => FsErr.msg[e.code] || e.message;
  const base = VFS.base;
  const dirname = VFS.dirname;

  /* ---------- navigation ---------- */
  def(
    'pwd',
    async (c) => {
      c.out(c.sh.cwd + '\n');
    },
    { builtin: true, bin: true }
  );

  def(
    'cd',
    async (c, args) => {
      const sh = c.sh;
      let t = args.filter((a) => a !== '--' && !/^-[LP]$/.test(a))[0];
      if (t === undefined || t === '~') t = sh.home();
      let showNew = false;
      if (t === '-') {
        if (!sh.vars.OLDPWD) {
          c.err('bash: cd: OLDPWD not set\n');
          return 1;
        }
        t = sh.vars.OLDPWD;
        showNew = true;
      }
      const abs = sh.abs(t);
      const n = sh.fs.lookup(abs);
      if (!n) {
        c.err(`bash: cd: ${args[0] || t}: No such file or directory\n`);
        return 1;
      }
      if (n.t !== 'd') {
        c.err(`bash: cd: ${args[0] || t}: Not a directory\n`);
        return 1;
      }
      if (!sh.can(n, 1)) {
        c.err(`bash: cd: ${args[0] || t}: Permission denied\n`);
        return 1;
      }
      sh.vars.OLDPWD = sh.cwd;
      sh.cwd = abs;
      sh.vars.PWD = abs;
      if (showNew) c.out(abs + '\n');
      return 0;
    },
    { builtin: true }
  );

  /* ---------- ls ---------- */
  function colorCode(name, n) {
    if (n.t === 'd') return n.mode & 0o1000 && n.mode & 2 ? '30;42' : '01;34';
    if (n.t === 'l') return '01;36';
    if (n.t === 'c') return '40;33;01';
    if (n.mode & 0o111) return '01;32';
    if (/\.(tar|gz|tgz|zip|bz2|xz)$/.test(name) || n.archive) return '01;31';
    if (/\.(jpe?g|png|gif|mp4|svg)$/.test(name)) return '01;35';
    if (/\.(mp3|wav|ogg)$/.test(name)) return '00;36';
    return null;
  }
  U.colorName = (name, n, color) => {
    const code = color ? colorCode(name, n) : null;
    return code ? `\x1b[${code}m${name}\x1b[0m` : name;
  };

  def('ls', async (c, args) => {
    const g = U.getopts('ls', c, args, 'lahAtrSR1dFCfinZ#', '', { all: 'a', 'almost-all': 'A', 'human-readable': 'h', reverse: 'r', recursive: 'R', color: '#', 'group-directories-first': '#', directory: 'd' });
    if (!g) return 2;
    const { o, rest } = g;
    const sh = c.sh;
    const color = c.tty && !args.includes('--color=never');
    let status = 0;
    const decorate = (e) => {
      let ind = '';
      if (o.F) ind = e.node.t === 'd' ? '/' : e.node.t === 'l' ? '@' : e.node.mode & 0o111 ? '*' : '';
      return { plain: e.name + ind, colored: U.colorName(e.name, e.node, color) + ind };
    };
    const format = (entries) => {
      if (!entries.length) return '';
      if (o.l) {
        const rows = entries.map((e) => {
          const n = e.node;
          const nl = n.t === 'd' ? 2 + Object.values(n.kids).filter((k) => k.t === 'd').length : n.nlink || 1;
          const size = o.h ? U.human(VFS.size(n)) : String(VFS.size(n));
          const d = decorate(e);
          let nm = d.colored;
          if (n.t === 'l') nm += ' -> ' + n.target;
          return [U.permStr(n), String(nl), n.owner, n.group, size, U.lsDate(n.mtime), (o.i ? LX.ino(n) + ' ' : '') + (o.Z ? (LX.ctxOf ? LX.ctxOf(sh, n, e.abs || sh.abs(e.name)) : '?') + ' ' : '') + nm];
        });
        const w = [1, 2, 3, 4].map((i) => Math.max(...rows.map((r) => r[i].length)));
        return rows.map((r) => `${r[0]} ${r[1].padStart(w[0])} ${r[2].padEnd(w[1])} ${r[3].padEnd(w[2])} ${r[4].padStart(w[3])} ${r[5]} ${r[6]}`).join('\n') + '\n';
      }
      const items = entries.map(decorate);
      if (o.i || o.Z) items.forEach((it, k) => { const pre = (o.i ? LX.ino(entries[k].node) + ' ' : '') + (o.Z ? LX.ctxOf(sh, entries[k].node, entries[k].abs || sh.abs(entries[k].name)) + ' ' : ''); it.plain = pre + it.plain; it.colored = pre + it.colored; });
      if (c.tty && !o['1']) return U.fmtCols(items, sh.cols);
      return items.map((i) => i.colored).join('\n') + '\n';
    };
    const sortEntries = (list) => {
      if (o.f) return list;
      list.sort((a, b) => cmpName(a.name, b.name));
      if (o.S) list.sort((a, b) => VFS.size(b.node) - VFS.size(a.node));
      if (o.t) list.sort((a, b) => b.node.mtime - a.node.mtime);
      if (o.r) list.reverse();
      return list;
    };
    const targets = rest.length ? rest : ['.'];
    const files = [];
    const dirs = [];
    for (const t of targets) {
      const abs = sh.abs(t);
      const n = sh.fs.lookup(abs, !(o.l || o.F));
      if (!n) {
        c.err(`ls: cannot access '${t}': No such file or directory\n`);
        status = 2;
        continue;
      }
      if (n.t === 'd' && !o.d) dirs.push({ t, abs, n });
      else files.push({ name: t, node: n, abs });
    }
    if (files.length) c.out(format(sortEntries(files)));
    const listDir = (d, header, first) => {
      if (!sh.can(d.n, 4)) {
        c.err(`ls: cannot open directory '${d.t}': Permission denied\n`);
        status = 2;
        return [];
      }
      if (header) c.out((first ? '' : '\n') + d.t + ':\n');
      const entries = [];
      const all = o.a || o.f;
      if (all) {
        entries.push({ name: '.', node: d.n });
        const par = sh.fs.lookup(VFS.dirname(d.abs));
        entries.push({ name: '..', node: par || d.n });
      }
      for (const k of Object.keys(d.n.kids)) {
        if (k.startsWith('.') && !all && !o.A) continue;
        entries.push({ name: k, node: d.n.kids[k], abs: VFS.norm(k, d.abs) });
      }
      sortEntries(entries);
      if (o.l) {
        const blocks = entries.reduce((s, e) => s + (e.node.t === 'd' ? 4 : Math.ceil(VFS.size(e.node) / 4096) * 4), 0);
        c.out(`total ${blocks}\n`);
      }
      c.out(format(entries));
      return entries;
    };
    const multi = targets.length > 1 || o.R;
    let first = !files.length;
    const walk = (d) => {
      const entries = listDir(d, multi, first);
      first = false;
      if (o.R) {
        for (const e of entries) {
          if (e.name === '.' || e.name === '..' || e.node.t !== 'd') continue;
          walk({ t: (d.t === '/' ? '' : d.t.replace(/\/$/, '')) + '/' + e.name, abs: VFS.norm(e.name, d.abs), n: e.node });
        }
      }
    };
    for (const d of dirs) walk(d);
    return status;
  });

  def(
    'tree',
    async (c, args) => {
      const g = U.getopts('tree', c, args, 'adL', 'L', {});
      if (!g) return 2;
      const { o, rest } = g;
      const sh = c.sh;
      const maxd = o.L ? +o.L : Infinity;
      const t = rest[0] || '.';
      const root = sh.stat(t);
      if (!root) {
        c.out(`${t} [error opening dir]\n\n0 directories, 0 files\n`);
        return 2;
      }
      let nd = 0;
      let nf = 0;
      c.out(U.colorName(t, root, c.tty) + '\n');
      const rec = (n, prefix, depth) => {
        if (n.t !== 'd' || depth >= maxd) return;
        const names = Object.keys(n.kids)
          .filter((k) => o.a || !k.startsWith('.'))
          .filter((k) => !o.d || n.kids[k].t === 'd')
          .sort(cmpName);
        names.forEach((k, i) => {
          const kid = n.kids[k];
          const last = i === names.length - 1;
          c.out(prefix + (last ? '└── ' : '├── ') + U.colorName(k, kid, c.tty) + (kid.t === 'l' ? ' -> ' + kid.target : '') + '\n');
          if (kid.t === 'd') {
            nd++;
            rec(kid, prefix + (last ? '    ' : '│   '), depth + 1);
          } else nf++;
        });
      };
      rec(root, '', 0);
      c.out(`\n${nd} director${nd === 1 ? 'y' : 'ies'}${o.d ? '' : `, ${nf} file${nf === 1 ? '' : 's'}`}\n`);
      return 0;
    },
    { pkg: 'tree' }
  );

  /* ---------- create / delete ---------- */
  def('mkdir', async (c, args) => {
    const g = U.getopts('mkdir', c, args, 'pv', 'm', { parents: 'p', verbose: 'v', mode: 'm' });
    if (!g) return 1;
    const { o, rest } = g;
    if (!rest.length) {
      c.err("mkdir: missing operand\nTry 'mkdir --help' for more information.\n");
      return 1;
    }
    let st = 0;
    for (const p of rest) {
      const abs = c.abs(p);
      try {
        if (o.p) {
          const parts = abs.split('/').filter(Boolean);
          let cur = '';
          for (const part of parts) {
            cur += '/' + part;
            const ex = c.sh.fs.lookup(cur);
            if (ex) {
              if (ex.t !== 'd') throw new FsErr('ENOTDIR', cur);
              continue;
            }
            c.sh.mkdir(cur);
            if (o.v) c.out(`mkdir: created directory '${cur === abs ? p : cur.slice(1)}'\n`);
          }
        } else {
          c.sh.mkdir(abs);
          if (o.v) c.out(`mkdir: created directory '${p}'\n`);
        }
        if (o.m) {
          const n = c.sh.fs.lookup(abs);
          n.mode = parseInt(o.m, 8);
        }
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`mkdir: cannot create directory '${p}': ${U.errTxt(e)}\n`);
        st = 1;
      }
    }
    return st;
  });

  def('rmdir', async (c, args) => {
    const rest = args.filter((a) => !a.startsWith('-'));
    if (!rest.length) {
      c.err("rmdir: missing operand\nTry 'rmdir --help' for more information.\n");
      return 1;
    }
    let st = 0;
    for (const p of rest) {
      const abs = c.abs(p);
      const n = c.sh.fs.lookup(abs, false);
      let msg = null;
      if (!n) msg = 'No such file or directory';
      else if (n.t !== 'd') msg = 'Not a directory';
      else if (Object.keys(n.kids).length) msg = 'Directory not empty';
      if (!msg) {
        try {
          c.sh.unlink(abs);
        } catch (e) {
          if (!(e instanceof FsErr)) throw e;
          msg = U.errTxt(e);
        }
      }
      if (msg) {
        c.err(`rmdir: failed to remove '${p}': ${msg}\n`);
        st = 1;
      }
    }
    return st;
  });

  def('touch', async (c, args) => {
    const g = U.getopts('touch', c, args, 'acm', 'dtr', {});
    if (!g) return 1;
    if (!g.rest.length) {
      c.err("touch: missing file operand\nTry 'touch --help' for more information.\n");
      return 1;
    }
    let st = 0;
    for (const p of g.rest) {
      const abs = c.abs(p);
      const n = c.sh.fs.lookup(abs);
      try {
        if (n) {
          if (!c.sh.can(n, 2) && c.sh.eu() !== 'root' && n.owner !== c.sh.eu()) throw new FsErr('EACCES', abs);
          n.mtime = Date.now();
        } else if (!g.o.c) c.sh.writeFile(abs, '', false);
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`touch: cannot touch '${p}': ${U.errTxt(e)}\n`);
        st = 1;
      }
    }
    return st;
  });

  async function copyMove(c, args, isMove) {
    const nm = isMove ? 'mv' : 'cp';
    const g = U.getopts(nm, c, args, isMove ? 'vinf' : 'rRavinfupP', '', { archive: 'a', preserve: 'p', recursive: 'r', verbose: 'v', interactive: 'i', 'no-clobber': 'n', force: 'f' });
    if (!g) return 1;
    const { o, rest } = g;
    const sh = c.sh;
    const rec = o.r || o.R || o.a;
    if (rest.length < 2) {
      c.err(rest.length ? `${nm}: missing destination file operand after '${rest[0]}'\nTry '${nm} --help' for more information.\n` : `${nm}: missing file operand\nTry '${nm} --help' for more information.\n`);
      return 1;
    }
    const dst = rest[rest.length - 1];
    const srcs = rest.slice(0, -1);
    const dAbs = c.abs(dst);
    const dn = sh.fs.lookup(dAbs);
    const dstIsDir = dn && dn.t === 'd';
    if (srcs.length > 1 && !dstIsDir) {
      c.err(`${nm}: target '${dst}' is not a directory\n`);
      return 1;
    }
    let st = 0;
    for (const s of srcs) {
      const sAbs = c.abs(s);
      const sn = sh.fs.lookup(sAbs, false);
      if (!sn) {
        c.err(`${nm}: cannot stat '${s}': No such file or directory\n`);
        st = 1;
        continue;
      }
      if (!isMove && sn.t === 'd' && !rec) {
        c.err(`cp: -r not specified; omitting directory '${s}'\n`);
        st = 1;
        continue;
      }
      const target = dstIsDir ? dAbs.replace(/\/$/, '') + '/' + base(sAbs) : dAbs;
      const shown = dstIsDir ? dst.replace(/\/$/, '') + '/' + base(sAbs) : dst;
      if (target === sAbs) {
        c.err(`${nm}: '${s}' and '${shown}' are the same file\n`);
        st = 1;
        continue;
      }
      if (sn.t === 'd' && (target + '/').startsWith(sAbs + '/')) {
        c.err(isMove ? `mv: cannot move '${s}' to a subdirectory of itself, '${shown}'\n` : `cp: cannot copy a directory, '${s}', into itself, '${shown}'\n`);
        st = 1;
        continue;
      }
      const ex = sh.fs.lookup(target, false);
      if (ex && o.n) continue;
      if (ex && ex.t === 'd' && sn.t !== 'd') {
        c.err(`${nm}: cannot overwrite directory '${shown}' with non-directory\n`);
        st = 1;
        continue;
      }
      if (ex && o.i) {
        const a = await U.ask(c, `${nm}: overwrite '${shown}'? `);
        if (!/^y/i.test(a)) continue;
      }
      try {
        if (isMove) {
          if (ex && ex.t === 'd' && Object.keys(ex.kids).length) throw new FsErr('ENOTEMPTY', target);
          sh.moveNode(sAbs, target);
          if (o.v) c.out(`renamed '${s}' -> '${shown}'\n`);
        } else {
          sh.copyNode(sAbs, target, rec, !!(o.a || o.p || o.preserve));
          if (o.v) c.out(`'${s}' -> '${shown}'\n`);
        }
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        if (e.code === 'ENOTEMPTY') c.err(`mv: cannot move '${s}' to '${shown}': Directory not empty\n`);
        else if (e.code === 'ENOENT') c.err(`${nm}: cannot ${isMove ? 'move' : 'create regular file'} ${isMove ? `'${s}' to ` : ''}'${shown}': No such file or directory\n`);
        else if (e.code === 'EACCES') c.err(isMove ? `mv: cannot move '${s}' to '${shown}': Permission denied\n` : `cp: cannot ${e.path === sAbs ? "open '" + s : "create regular file '" + shown}': Permission denied\n`);
        else c.err(`${nm}: ${s}: ${U.errTxt(e)}\n`);
        st = 1;
      }
    }
    return st;
  }
  def('cp', (c, a) => copyMove(c, a, false));
  def('mv', (c, a) => copyMove(c, a, true));

  def('rm', async (c, args) => {
    const g = U.getopts('rm', c, args, 'rRfivd', '', { recursive: 'r', force: 'f', interactive: 'i', verbose: 'v', dir: 'd', 'no-preserve-root': 'P' });
    if (!g) return 1;
    const { o, rest } = g;
    const sh = c.sh;
    const rec = o.r || o.R;
    if (!rest.length) {
      if (o.f) return 0;
      c.err("rm: missing operand\nTry 'rm --help' for more information.\n");
      return 1;
    }
    let st = 0;
    const rmOne = async (abs, shown, top) => {
      const n = sh.fs.lookup(abs, false);
      if (!n) {
        if (!o.f) {
          c.err(`rm: cannot remove '${shown}': No such file or directory\n`);
          st = 1;
        }
        return;
      }
      if (n.t === 'd') {
        if (!rec && !(o.d && !Object.keys(n.kids).length)) {
          c.err(`rm: cannot remove '${shown}': Is a directory\n`);
          st = 1;
          return;
        }
        if (o.i && Object.keys(n.kids).length) {
          const a = await U.ask(c, `rm: descend into directory '${shown}'? `);
          if (!/^y/i.test(a)) return;
        }
        for (const k of Object.keys(n.kids).sort()) await rmOne(abs.replace(/\/$/, '') + '/' + k, shown.replace(/\/$/, '') + '/' + k, false);
        if (Object.keys(n.kids).length) return;
        if (o.i) {
          const a = await U.ask(c, `rm: remove directory '${shown}'? `);
          if (!/^y/i.test(a)) return;
        }
      } else if (o.i) {
        const a = await U.ask(c, `rm: remove ${n.size === 0 || (n.content === '' && !n.bin) ? 'regular empty file' : 'regular file'} '${shown}'? `);
        if (!/^y/i.test(a)) return;
      } else if (!o.f && !sh.can(n, 2) && n.t === 'f' && sh.eu() !== 'root') {
        const a = await U.ask(c, `rm: remove write-protected regular file '${shown}'? `);
        if (!/^y/i.test(a)) return;
      }
      try {
        sh.unlink(abs);
        if (o.v) c.out(`removed ${n.t === 'd' ? "directory " : ''}'${shown}'\n`);
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`rm: cannot remove '${shown}': ${U.errTxt(e)}\n`);
        st = 1;
      }
    };
    for (const p of rest) {
      const abs = c.abs(p);
      if (abs === '/' && rec) {
        c.err("rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe\n");
        st = 1;
        continue;
      }
      if (base(p) === '.' || base(p) === '..') {
        c.err(`rm: refusing to remove '.' or '..' directory: skipping '${p}'\n`);
        st = 1;
        continue;
      }
      await rmOne(abs, p, true);
    }
    return st;
  });

  def('ln', async (c, args) => {
    const g = U.getopts('ln', c, args, 'sfv', '', { symbolic: 's', force: 'f' });
    if (!g) return 1;
    const { o, rest } = g;
    if (rest.length < 2) {
      c.err("ln: missing file operand\nTry 'ln --help' for more information.\n");
      return 1;
    }
    const [target, link] = rest;
    let lAbs = c.abs(link);
    const ld = c.sh.fs.lookup(lAbs);
    if (ld && ld.t === 'd') lAbs += '/' + base(target);
    if (c.sh.fs.lookup(lAbs, false) && !o.f) {
      c.err(`ln: failed to create ${o.s ? 'symbolic' : 'hard'} link '${link}': File exists\n`);
      return 1;
    }
    try {
      const pd = c.sh.parentFor(lAbs, 2);
      if (o.s) pd.kids[base(lAbs)] = c.sh.fs.mk('l', { target, owner: c.sh.eu(), mode: 0o777 });
      else {
        const tn = c.sh.fs.lookup(c.abs(target));
        if (!tn) {
          c.err(`ln: failed to access '${target}': No such file or directory\n`);
          return 1;
        }
        pd.kids[base(lAbs)] = c.sh.fs.clone(tn);
      }
    } catch (e) {
      if (!(e instanceof FsErr)) throw e;
      c.err(`ln: failed to create link '${link}': ${U.errTxt(e)}\n`);
      return 1;
    }
    return 0;
  });

  /* ---------- reading ---------- */
  const GARBLE = '\u0089PNG\r\n\u001a\n\u0000\u0000\u0000\rIHDR\u0000\u0000\u0003 \u0000\u0000\u0002X\u0008\u0006\u0000\u0000\u0000ìó\u0098¡\u0000\u0000 \u0000IDATx\u009cíÝÍ\u008aãH\u0016\u0000à';
  async function readSources(c, files, cmd, each) {
    let st = 0;
    if (!files.length) {
      await each(await c.slurp(), null);
      return 0;
    }
    for (const f of files) {
      if (f === '-') {
        await each(await c.slurp(), '-');
        continue;
      }
      const abs = c.abs(f);
      try {
        const n = c.sh.fs.lookup(abs);
        if (n && n.bin && n.t === 'f' && c.sh.can(n, 4)) {
          await each(GARBLE + '\n', f, true);
          continue;
        }
        await each(c.sh.readFile(abs), f);
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`${cmd}: ${f}: ${U.errTxt(e)}\n`);
        st = 1;
      }
    }
    return st;
  }
  U.readSources = readSources;
  U.lines = (t) => {
    if (t === '') return [];
    const l = t.split('\n');
    if (l[l.length - 1] === '') l.pop();
    return l;
  };

  def('cat', async (c, args) => {
    const g = U.getopts('cat', c, args, 'nbAEsT', '', { number: 'n' });
    if (!g) return 1;
    const { o, rest } = g;
    let ln = 0;
    return await readSources(c, rest, 'cat', (text) => {
      if (!o.n && !o.b && !o.E) return c.out(text);
      const ls = text.split('\n');
      const endNl = ls[ls.length - 1] === '';
      if (endNl) ls.pop();
      c.out(ls.map((l) => (o.b && l === '' ? '' : o.n || o.b ? `${String(++ln).padStart(6)}\t${l}` : l) + (o.E ? '$' : '')).join('\n') + (endNl ? '\n' : ''));
    });
  });
  def('tac', async (c, args) => {
    return await readSources(c, args, 'tac', (text) => c.out(U.lines(text).reverse().join('\n') + '\n'));
  });
  def('rev', async (c, args) => {
    return await readSources(c, args, 'rev', (text) => c.out(U.lines(text).map((l) => [...l].reverse().join('')).join('\n') + '\n'));
  });
  for (const nm of ['less', 'more']) {
    def(nm, async (c, args) => {
      const st = await readSources(c, args.filter((a) => !a.startsWith('-')), nm, (text, f) => {
        c.out(text.endsWith('\n') || !text ? text : text + '\n');
      });
      if (c.tty) c.out(`\x1b[7m(END) — in a real terminal this opens a viewer: Space = next page, / = search, q = quit\x1b[0m\n`);
      return st;
    });
  }

  def('head', async (c, args) => ht(c, args, true));
  def('tail', async (c, args) => ht(c, args, false));
  async function ht(c, args, isHead) {
    const nm = isHead ? 'head' : 'tail';
    const g = U.getopts(nm, c, args, 'qvf', 'nc', { lines: 'n', bytes: 'c', follow: 'f' }, true);
    if (!g) return 1;
    const { o, rest } = g;
    let nstr = o.n !== undefined ? String(o.n) : '10';
    const plus = !isHead && nstr.startsWith('+');
    const n = parseInt(nstr.replace('+', ''), 10);
    if (isNaN(n)) {
      c.err(`${nm}: invalid number of lines: '${o.n}'\n`);
      return 1;
    }
    const multi = rest.length > 1 && !o.q;
    let first = true;
    const st = await readSources(c, rest, nm, (text, f) => {
      if (multi || o.v) {
        c.out(`${first ? '' : '\n'}==> ${f} <==\n`);
        first = false;
      }
      if (o.c) {
        const k = parseInt(o.c, 10);
        return c.out(isHead ? text.slice(0, k) : text.slice(-k));
      }
      const ls = U.lines(text);
      let sel;
      if (isHead) sel = n >= 0 ? ls.slice(0, n) : ls.slice(0, n);
      else sel = plus ? ls.slice(n - 1) : ls.slice(-n || ls.length);
      if (!isHead && n === 0 && !plus) sel = [];
      if (sel.length) c.out(sel.join('\n') + '\n');
    });
    if (!isHead && o.f && c.tty) {
      c.out('\x1b[2m(tail -f keeps watching the file for new lines. Press Ctrl+C to stop.)\x1b[0m\n');
      await c.sh.waitMs(1e9);
    }
    return st;
  }

  def('wc', async (c, args) => {
    const g = U.getopts('wc', c, args, 'lwcm', '', { lines: 'l', words: 'w', bytes: 'c', chars: 'm' });
    if (!g) return 1;
    const { o, rest } = g;
    const any = o.l || o.w || o.c || o.m;
    const cols = any ? ['l', 'w', o.m ? 'm' : 'c'].filter((k) => o[k] || (k === 'c' && o.m && false)) : ['l', 'w', 'c'];
    if (o.m && !cols.includes('m')) cols.push('m');
    const rows = [];
    const tot = { l: 0, w: 0, c: 0, m: 0 };
    const st = await readSources(c, rest, 'wc', (text, f, bin) => {
      const r = { l: (text.match(/\n/g) || []).length, w: (text.trim() ? text.trim().split(/\s+/).length : 0), c: new TextEncoder().encode(text).length, m: [...text].length, f };
      for (const k of 'lwcm') tot[k] += r[k];
      rows.push(r);
    });
    if (rest.length > 1) rows.push(Object.assign({}, tot, { f: 'total' }));
    const width = cols.length === 1 && rows.length === 1 ? 0 : String(Math.max(...rows.map((r) => Math.max(...cols.map((k) => r[k]))), 0)).length;
    for (const r of rows) c.out(cols.map((k) => String(r[k]).padStart(width)).join(' ') + (r.f ? ' ' + r.f : '') + '\n');
    return st;
  });

  def('file', async (c, args) => {
    const rest = args.filter((a) => !a.startsWith('-'));
    if (!rest.length) {
      c.err("Usage: file [OPTION...] [FILE...]\nTry `file --help' for more information.\n");
      return 1;
    }
    for (const f of rest) {
      const n = c.sh.fs.lookup(c.abs(f), false);
      let d;
      if (!n) d = 'cannot open `' + f + "' (No such file or directory)";
      else if (n.t === 'd') d = 'directory';
      else if (n.t === 'l') d = `symbolic link to ${n.target}`;
      else if (n.t === 'c') d = 'character special (1/3)';
      else if (n.exe) d = 'ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked';
      else if (n.archive) d = n.archive.kind === 'zip' ? 'Zip archive data, at least v2.0 to extract' : n.archive.comp === 'bz2' ? 'bzip2 compressed data, block size = 900k' : n.archive.comp === 'xz' ? 'XZ compressed data, checksum CRC64' : n.archive.gz ? 'gzip compressed data, from Unix' : 'POSIX tar archive (GNU)';
      else if (n.bin) d = /\.jpe?g$/i.test(f) ? 'JPEG image data, JFIF standard 1.01' : /\.png$/i.test(f) ? 'PNG image data, 800 x 600, 8-bit/color RGBA, non-interlaced' : /\.mp3$/i.test(f) ? 'Audio file with ID3 version 2.4.0, contains: MPEG ADTS, layer III' : /\.mp4$/i.test(f) ? 'ISO Media, MP4 v2' : 'data';
      else if (!n.content) d = 'empty';
      else if (/^#!.*(ba)?sh/.test(n.content)) d = 'Bourne-Again shell script, ASCII text executable';
      else if (/^#!.*python/.test(n.content) || /\.py$/.test(f)) d = 'Python script, ASCII text executable';
      else if (/<html|<!DOCTYPE html/i.test(n.content)) d = 'HTML document, ASCII text';
      else if (/[^\x00-\x7f]/.test(n.content)) d = 'Unicode text, UTF-8 text';
      else d = 'ASCII text';
      c.out(`${f}: ${d}\n`);
    }
    return 0;
  });

  def('stat', async (c, args) => {
    let fmt = null;
    let nl = true;
    const rest = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-c' || a === '--format') fmt = args[++i];
      else if (a === '--printf') { fmt = args[++i]; nl = false; }
      else if (a.startsWith('--format=')) fmt = a.slice(9);
      else if (a.startsWith('--printf=')) { fmt = a.slice(9); nl = false; }
      else if (!a.startsWith('-')) rest.push(a);
    }
    let st = 0;
    for (const f of rest) {
      if (fmt !== null) {
        const n = c.sh.fs.lookup(c.abs(f), false);
        if (!n) {
          c.err(`stat: cannot statx '${f}': No such file or directory\n`);
          st = 1;
          continue;
        }
        const sz = VFS.size(n);
        const us = c.sh.users[n.owner];
        const kind = n.t === 'd' ? 'directory' : n.t === 'l' ? 'symbolic link' : sz === 0 ? 'regular empty file' : 'regular file';
        const ts = (ms) => U.strftime('%F %H:%M:%S.000000000 %z', new Date(ms));
        const map = { n: f, N: n.t === 'l' ? `'${f}' -> '${n.target}'` : `'${f}'`, a: (n.mode & 0o7777).toString(8), A: U.permStr(n).replace('+', ''), U: n.owner, G: n.group, u: String(us ? us.uid : 0), g: String(c.sh.gidOf ? c.sh.gidOf(n.group) : 0), s: String(sz), F: kind, i: String(LX.ino(n)), h: String(n.t === 'd' ? 2 : n.nlink || 1), y: ts(n.mtime), Y: String(Math.floor(n.mtime / 1000)), x: ts(n.mtime), z: ts(n.mtime), w: '-', b: String(n.t === 'd' ? 8 : Math.ceil(sz / 4096) * 8), B: '512', d: '2049', t: '8', T: '1', '%': '%' };
        let outS = fmt.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/%([nNaAUGugsFihyYxzwbBdtT%])/g, (m, k) => map[k]);
        c.out(outS + (nl ? '\n' : ''));
        continue;
      }
      const n = c.sh.fs.lookup(c.abs(f), false);
      if (!n) {
        c.err(`stat: cannot statx '${f}': No such file or directory\n`);
        st = 1;
        continue;
      }
      const sz = VFS.size(n);
      const kind = n.t === 'd' ? 'directory' : n.t === 'l' ? 'symbolic link' : sz === 0 ? 'regular empty file' : 'regular file';
      const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '000000 +0000').replace(/\.\d{3}000000/, '.000000000');
      c.out(`  File: ${f}\n  Size: ${String(sz).padEnd(10)}\tBlocks: ${String(n.t === 'd' ? 8 : Math.ceil(sz / 4096) * 8).padEnd(10)} IO Block: 4096   ${kind}\nDevice: 801h/2049d\tInode: ${LX.ino(n)}       Links: ${n.t === 'd' ? 2 : n.nlink || 1}\nAccess: (${(n.mode & 0o7777).toString(8).padStart(4, '0')}/${U.permStr(n)})  Uid: (${String(c.sh.users[n.owner] ? c.sh.users[n.owner].uid : 0).padStart(4)}/${n.owner.padStart(8)})   Gid: (${String(c.sh.users[n.group] ? c.sh.users[n.group].gid : 0).padStart(4)}/${n.group.padStart(8)})\nAccess: ${iso(n.mtime)}\nModify: ${iso(n.mtime)}\nChange: ${iso(n.mtime)}\n Birth: -\n`);
    }
    return st;
  });

  def('du', async (c, args) => {
    const g = U.getopts('du', c, args, 'hsacxkmL', 'd', { 'human-readable': 'h', summarize: 's', 'max-depth': 'd', 'one-file-system': 'x' });
    if (!g) return 1;
    const { o, rest } = g;
    const maxd = o.s ? 0 : o.d !== undefined ? +o.d : Infinity;
    const fmt = (kb) => (o.h ? U.human(kb * 1024) : String(kb));
    const blocks = (n) => (n.t === 'd' ? 4 : Math.max(0, Math.ceil(VFS.size(n) / 4096) * 4));
    let st = 0;
    let grand = 0;
    for (const t of rest.length ? rest : ['.']) {
      const root = c.sh.fs.lookup(c.abs(t));
      if (!root) {
        c.err(`du: cannot access '${t}': No such file or directory\n`);
        st = 1;
        continue;
      }
      const rec = (n, shown, depth) => {
        let total = blocks(n);
        if (n.t === 'd') {
          for (const k of Object.keys(n.kids).sort()) total += rec(n.kids[k], shown.replace(/\/$/, '') + '/' + k, depth + 1);
        }
        if ((n.t === 'd' && depth <= maxd) || (o.a && depth <= maxd) || depth === 0) c.out(`${fmt(total)}\t${shown}\n`);
        return total;
      };
      grand += rec(root, t, 0);
    }
    if (o.c) c.out(`${fmt(grand)}\ttotal\n`);
    return st;
  });

  U.expandHome = (c, p) => p;
  def('basename', async (c, args) => {
    if (!args.length) {
      c.err("basename: missing operand\nTry 'basename --help' for more information.\n");
      return 1;
    }
    let b = args[0].replace(/\/+$/, '');
    b = b.slice(b.lastIndexOf('/') + 1) || '/';
    if (args[1] && b.endsWith(args[1]) && b !== args[1]) b = b.slice(0, -args[1].length);
    c.out(b + '\n');
  });
  def('dirname', async (c, args) => {
    for (const a of args) {
      const t = a.replace(/\/+$/, '');
      const i = t.lastIndexOf('/');
      c.out((i < 0 ? '.' : i === 0 ? '/' : t.slice(0, i)) + '\n');
    }
  });
  def('realpath', async (c, args) => {
    for (const a of args.filter((x) => !x.startsWith('-'))) c.out(c.abs(a) + '\n');
  });

  /* ---------- permissions ---------- */
  function parseMode(spec, n) {
    if (/^[0-7]{1,4}$/.test(spec)) {
      const v = parseInt(spec, 8);
      // GNU chmod keeps setuid/setgid on a directory unless 4+ digits are given
      return n.t === 'd' && spec.length <= 3 ? (v & 0o777) | (n.mode & 0o7000) : v;
    }
    let mode = n.mode & 0o7777;
    for (const clause of spec.split(',')) {
      const m = /^([ugoa]*)([-+=])([rwxXst]*)$/.exec(clause);
      if (!m) return null;
      let who = m[1] || 'a';
      if (who.includes('a')) who = 'ugo';
      let bits = 0;
      for (const ch of m[3]) {
        if (ch === 'r') bits |= 4;
        else if (ch === 'w') bits |= 2;
        else if (ch === 'x') bits |= 1;
        else if (ch === 'X' && (n.t === 'd' || mode & 0o111)) bits |= 1;
      }
      let apply = 0;
      let special = 0;
      if (who.includes('u')) {
        apply |= bits << 6;
        if (m[3].includes('s')) special |= 0o4000;
      }
      if (who.includes('g')) {
        apply |= bits << 3;
        if (m[3].includes('s')) special |= 0o2000;
      }
      if (who.includes('o')) {
        apply |= bits;
        if (m[3].includes('t')) special |= 0o1000;
      }
      apply |= special;
      if (m[2] === '+') mode |= apply;
      else if (m[2] === '-') mode &= ~apply;
      else {
        let mask = 0;
        if (who.includes('u')) mask |= 0o700;
        if (who.includes('g')) mask |= 0o070;
        if (who.includes('o')) mask |= 0o007;
        mode = (mode & ~mask) | apply;
      }
    }
    return mode;
  }
  def('chmod', async (c, args) => {
    const g = U.getopts('chmod', c, args.map((a) => (/^-[rwxXst]/.test(a) && !/^-[Rvcf]+$/.test(a) ? ' ' + a : a)), 'Rvcf', '', { recursive: 'R', verbose: 'v' });
    if (!g) return 1;
    const rest = g.rest.map((a) => a.replace(/^ /, ''));
    const { o } = g;
    if (rest.length < 2) {
      c.err(rest.length ? `chmod: missing operand after '${rest[0]}'\nTry 'chmod --help' for more information.\n` : "chmod: missing operand\nTry 'chmod --help' for more information.\n");
      return 1;
    }
    const spec = rest[0];
    let st = 0;
    const apply = (n, shown) => {
      if (c.sh.eu() !== 'root' && n.owner !== c.sh.eu()) {
        c.err(`chmod: changing permissions of '${shown}': Operation not permitted\n`);
        st = 1;
        return;
      }
      const m = parseMode(spec, n);
      if (m === null) {
        c.err(`chmod: invalid mode: '${spec}'\nTry 'chmod --help' for more information.\n`);
        st = 1;
        return false;
      }
      const old = n.mode;
      n.mode = m;
      if (o.v) c.out(`mode of '${shown}' changed from ${(old & 0o7777).toString(8).padStart(4, '0')} (${U.permStr(Object.assign({}, n, { mode: old })).slice(1)}) to ${(m & 0o7777).toString(8).padStart(4, '0')} (${U.permStr(n).slice(1)})\n`);
    };
    for (const f of rest.slice(1)) {
      const abs = c.abs(f);
      const n = c.sh.fs.lookup(abs);
      if (!n) {
        c.err(`chmod: cannot access '${f}': No such file or directory\n`);
        st = 1;
        continue;
      }
      if (apply(n, f) === false) return 1;
      if (o.R) c.sh.fs.walk(abs, (p, node) => p !== abs && apply(node, p));
    }
    return st;
  });
  async function chown(c, args, isGrp) {
    const nm = isGrp ? 'chgrp' : 'chown';
    const g = U.getopts(nm, c, args, 'Rv', '', { recursive: 'R' });
    if (!g) return 1;
    const { o, rest } = g;
    if (rest.length < 2) {
      c.err(`${nm}: missing operand${rest.length ? " after '" + rest[0] + "'" : ''}\nTry '${nm} --help' for more information.\n`);
      return 1;
    }
    let [owner, group] = isGrp ? [null, rest[0]] : rest[0].split(':');
    if (owner === '') owner = null;
    if (owner && !c.sh.users[owner]) {
      c.err(`${nm}: invalid user: '${rest[0]}'\n`);
      return 1;
    }
    const groups = new Set(['root', 'adm', 'sudo', 'users', 'www-data', 'shadow', ...Object.keys(c.sh.users)]);
    if (group && !(c.sh.groupExists ? c.sh.groupExists(group) : groups.has(group))) {
      c.err(`${nm}: invalid group: '${rest[0]}'\n`);
      return 1;
    }
    let st = 0;
    const apply = (n, shown) => {
      if (c.sh.eu() !== 'root' && !(isGrp && n.owner === c.sh.eu() && c.sh.groupsOf(c.sh.eu()).includes(group))) {
        c.err(`${nm}: changing ownership of '${shown}': Operation not permitted\n`);
        st = 1;
        return;
      }
      if (owner) n.owner = owner;
      if (group) n.group = group;
    };
    for (const f of rest.slice(1)) {
      const abs = c.abs(f);
      const n = c.sh.fs.lookup(abs);
      if (!n) {
        c.err(`${nm}: cannot access '${f}': No such file or directory\n`);
        st = 1;
        continue;
      }
      apply(n, f);
      if (o.R) c.sh.fs.walk(abs, (p, node) => p !== abs && apply(node, p));
    }
    return st;
  }
  def('chown', (c, a) => chown(c, a, false));
  def('chgrp', (c, a) => chown(c, a, true));
  def(
    'umask',
    async (c, args) => {
      if (!args.length) c.out(c.sh.umask.toString(8).padStart(4, '0') + '\n');
      else c.sh.umask = parseInt(args[0], 8) || 0;
    },
    { builtin: true }
  );

  /* ---------- find ---------- */
  def('find', async (c, args) => {
    const sh = c.sh;
    const paths = [];
    let i = 0;
    while (i < args.length && !args[i].startsWith('-') && args[i] !== '!' && args[i] !== '(') paths.push(args[i++]);
    const toks = args.slice(i);
    let p = 0;
    let maxdepth = Infinity;
    let mindepth = 0;
    let hasAction = false;
    const execs = [];
    const bad = (m) => {
      throw new Error(m);
    };
    const need = (nm) => {
      if (p >= toks.length) bad(`find: missing argument to \`${nm}'`);
      return toks[p++];
    };
    function primary() {
      const t = toks[p++];
      if (t === '(' || t === '\\(') {
        const e = parseOr();
        if (toks[p] === ')' || toks[p] === '\\)') p++;
        return e;
      }
      switch (t) {
        case '-name':
        case '-iname': {
          const re = new RegExp(LX.globToRegex(need(t)).source, t === '-iname' ? 'is' : 's');
          return (n, path) => re.test(base(path) || path);
        }
        case '-type': {
          const ty = need(t);
          return (n) => (ty === 'f' ? n.t === 'f' : ty === 'd' ? n.t === 'd' : ty === 'l' ? n.t === 'l' : false);
        }
        case '-empty':
          return (n) => (n.t === 'd' ? !Object.keys(n.kids).length : n.t === 'f' && !n.bin && !n.content);
        case '-size': {
          const s = need(t);
          const m = /^([+-]?)(\d+)([ckMGb]?)$/.exec(s);
          if (!m) bad(`find: invalid argument \`${s}' to \`-size'`);
          const unit = { c: 1, k: 1024, M: 1048576, G: 1073741824, b: 512, '': 512 }[m[3]];
          return (n) => {
            const u = Math.ceil(VFS.size(n) / unit);
            return m[1] === '+' ? u > +m[2] : m[1] === '-' ? u < +m[2] : u === +m[2];
          };
        }
        case '-mtime':
        case '-mmin': {
          const s = need(t);
          const m = /^([+-]?)(\d+)$/.exec(s);
          const unit = t === '-mtime' ? 86400000 : 60000;
          return (n) => {
            const age = Math.floor((Date.now() - n.mtime) / unit);
            return m[1] === '+' ? age > +m[2] : m[1] === '-' ? age < +m[2] : age === +m[2];
          };
        }
        case '-user': {
          const u = need(t);
          return (n) => n.owner === u;
        }
        case '-perm': {
          const s = need(t);
          const all = s.startsWith('-');
          const any = s.startsWith('/');
          const v = parseInt(s.replace(/^[-/]/, ''), 8);
          return (n) => (all ? (n.mode & v) === v : any ? (n.mode & v) !== 0 : (n.mode & 0o7777) === v);
        }
        case '-newer': {
          const f = sh.fs.lookup(c.abs(need(t)));
          return (n) => !!f && n.mtime > f.mtime;
        }
        case '-inum': {
          const v = +need(t);
          return (n) => LX.ino(n) === v;
        }
        case '-links': {
          const v = +need(t);
          return (n) => (n.nlink || 1) === v;
        }
        case '-group': {
          const gname = need(t);
          return (n) => n.group === gname;
        }
        case '-xdev':
        case '-mount':
        case '-noleaf':
          return () => true;
        case '-maxdepth':
          maxdepth = +need(t);
          return () => true;
        case '-mindepth':
          mindepth = +need(t);
          return () => true;
        case '-print':
          hasAction = true;
          return (n, path) => (c.out(path + '\n'), true);
        case '-print0':
          hasAction = true;
          return (n, path) => (c.out(path + '\0'), true);
        case '-delete':
          hasAction = true;
          return (n, path) => {
            try {
              sh.unlink(c.abs(path));
            } catch (e) {
              if (e instanceof FsErr) c.err(`find: cannot delete '${path}': ${U.errTxt(e)}\n`);
              else throw e;
            }
            return true;
          };
        case '-exec':
        case '-ok': {
          hasAction = true;
          const cmd = [];
          while (p < toks.length && toks[p] !== ';' && toks[p] !== '+') cmd.push(toks[p++]);
          if (p >= toks.length) bad("find: missing argument to `-exec'");
          const plus = toks[p++] === '+';
          const rec = { cmd, plus, paths: [] };
          execs.push(rec);
          return (n, path) => {
            if (plus) rec.paths.push(path);
            else rec.queue = (rec.queue || []).concat([path]);
            return true;
          };
        }
        default:
          bad(`find: unknown predicate \`${t}'`);
      }
    }
    function parseNot() {
      if (toks[p] === '!' || toks[p] === '-not') {
        p++;
        const e = parseNot();
        return (n, pa) => !e(n, pa);
      }
      return primary();
    }
    function parseAnd() {
      let l = parseNot();
      while (p < toks.length && toks[p] !== '-o' && toks[p] !== ')' && toks[p] !== '\\)') {
        if (toks[p] === '-a') p++;
        const r = parseNot();
        const ll = l;
        l = (n, pa) => ll(n, pa) && r(n, pa);
      }
      return l;
    }
    function parseOr() {
      let l = parseAnd();
      while (toks[p] === '-o') {
        p++;
        const r = parseAnd();
        const ll = l;
        l = (n, pa) => ll(n, pa) || r(n, pa);
      }
      return l;
    }
    let expr;
    try {
      expr = toks.length ? parseOr() : () => true;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('find:')) {
        c.err(e.message + '\n');
        return 1;
      }
      throw e;
    }
    let st = 0;
    for (const start of paths.length ? paths : ['.']) {
      const root = sh.fs.lookup(c.abs(start));
      if (!root) {
        c.err(`find: '${start}': No such file or directory\n`);
        st = 1;
        continue;
      }
      const rec = (n, path, depth) => {
        if (depth >= mindepth && depth <= maxdepth) {
          if (expr(n, path) && !hasAction) c.out(path + '\n');
        }
        if (n.t === 'd' && depth < maxdepth) {
          if (!sh.can(n, 4)) {
            c.err(`find: '${path}': Permission denied\n`);
            st = 1;
            return;
          }
          for (const k of Object.keys(n.kids).sort(cmpName)) rec(n.kids[k], path.replace(/\/$/, '') + '/' + k, depth + 1);
        }
      };
      rec(root, start, 0);
    }
    for (const e of execs) {
      const run = async (list) => {
        const argv = [];
        for (const a of e.cmd) {
          if (a === '{}') argv.push(...list);
          else argv.push(a.replace(/\{\}/g, list[0]));
        }
        await sh.dispatch(argv, { stdin: '', stdout: c.out, stderr: c.err, tty: false });
      };
      if (e.plus) {
        if (e.paths.length) await run(e.paths);
      } else for (const pth of e.queue || []) await run([pth]);
    }
    return st;
  });

  /* ---------- archives ---------- */
  function collect(sh, abs, shown, items) {
    const n = sh.fs.lookup(abs, false);
    if (!n) return false;
    const cl = sh.fs.clone(n);
    if (cl.kids) delete cl.kids;
    items.push({ path: shown.replace(/^\/+/, ''), node: cl });
    if (n.t === 'd') for (const k of Object.keys(n.kids).sort()) collect(sh, abs.replace(/\/$/, '') + '/' + k, shown.replace(/\/$/, '') + '/' + k, items);
    return true;
  }
  U.archiveSize = (items, gz) => {
    const raw = items.reduce((s, i) => s + 512 + VFS.size(i.node), 0);
    const tar = Math.ceil(raw / 10240) * 10240;
    return gz ? Math.max(120, Math.round(tar * 0.35)) : tar;
  };
  function extract(c, items, destAbs, verbose, cmd) {
    const sh = c.sh;
    for (const it of items) {
      const target = VFS.norm(it.path, destAbs);
      try {
        const pd = sh.fs.lookup(VFS.dirname(target));
        if (!pd) sh.fs.mkdirp(VFS.dirname(target), { owner: sh.eu(), group: 'learner' });
        if (it.node.t === 'd') {
          if (!sh.fs.lookup(target)) {
            sh.parentFor(target, 2);
            sh.fs.mkdirp(target, { owner: sh.eu(), group: sh.users[sh.eu()].groups[0], mode: it.node.mode });
          }
        } else {
          sh.parentFor(target, 2);
          const nn = sh.fs.clone(it.node);
          nn.owner = sh.eu();
          nn.group = sh.users[sh.eu()].groups[0];
          sh.fs.lookup(VFS.dirname(target)).kids[base(target)] = nn;
        }
        if (verbose) c.out(cmd === 'unzip' ? `  inflating: ${it.path}\n` : it.path + (it.node.t === 'd' ? '/' : '') + '\n');
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`${cmd}: ${it.path}: Cannot open: ${U.errTxt(e)}\n`);
      }
    }
  }
  def('tar', async (c, args) => {
    const sh = c.sh;
    const a = args.slice();
    let flags = '';
    let archive = null;
    let dir = null;
    const members = [];
    if (a[0] && !a[0].startsWith('-')) a[0] = '-' + a[0];
    for (let i = 0; i < a.length; i++) {
      const t = a[i];
      if (t === '-C') dir = a[++i];
      else if (t === '-f' || t.startsWith('--file')) archive = t.includes('=') ? t.split('=')[1] : a[++i];
      else if (t.startsWith('-') && !t.startsWith('--')) {
        for (let j = 1; j < t.length; j++) {
          const ch = t[j];
          if (ch === 'f') {
            archive = a[++i];
            flags += 'f';
          } else if (ch === 'C') dir = a[++i];
          else flags += ch;
        }
      } else if (t === '--gzip') flags += 'z';
      else if (t === '--bzip2') flags += 'j';
      else if (t === '--xz') flags += 'J';
      else members.push(t);
    }
    const mode = ['c', 'x', 't'].find((m) => flags.includes(m));
    if (!mode) {
      c.err("tar: You must specify one of the '-Acdtrux', '--delete' or '--test-label' options\nTry 'tar --help' or 'tar --usage' for more information.\n");
      return 2;
    }
    if (!archive) {
      c.err('tar: Refusing to read archive contents from terminal (missing -f option?)\ntar: Error is not recoverable: exiting now\n');
      return 2;
    }
    const verbose = flags.includes('v');
    const aAbs = c.abs(archive);
    try {
      if (mode === 'c') {
        if (!members.length) {
          c.err('tar: Cowardly refusing to create an empty archive\nTry \'tar --help\' or \'tar --usage\' for more information.\n');
          return 2;
        }
        const items = [];
        let st = 0;
        for (const m of members) {
          if (m.startsWith('/')) c.err("tar: Removing leading `/' from member names\n");
          if (!collect(sh, c.abs(m), m, items)) {
            c.err(`tar: ${m}: Cannot stat: No such file or directory\n`);
            st = 2;
          }
        }
        if (verbose) for (const it of items) c.out(it.path + (it.node.t === 'd' ? '/' : '') + '\n');
        const comp = flags.includes('z') ? 'gz' : flags.includes('j') ? 'bz2' : flags.includes('J') ? 'xz' : /\.(bz2|tbz2?)$/.test(archive) && flags.includes('a') ? 'bz2' : /\.(xz|txz)$/.test(archive) && flags.includes('a') ? 'xz' : /\.(gz|tgz)$/.test(archive) && flags.includes('a') ? 'gz' : null;
        const gz = !!comp;
        sh.writeFile(aAbs, '', false);
        const an = sh.fs.lookup(aAbs);
        an.archive = { kind: 'tar', gz, comp, items };
        an.size = U.archiveSize(items, gz);
        if (st) c.err('tar: Exiting with failure status due to previous errors\n');
        return st;
      }
      const an = sh.fs.lookup(aAbs);
      if (!an) {
        c.err(`tar: ${archive}: Cannot open: No such file or directory\ntar: Error is not recoverable: exiting now\n`);
        return 2;
      }
      if (!an.archive) {
        c.err('\ngzip: stdin: not in gzip format\ntar: Child returned status 1\ntar: Error is not recoverable: exiting now\n');
        return 2;
      }
      const want = flags.includes('z') ? 'gz' : flags.includes('j') ? 'bz2' : flags.includes('J') ? 'xz' : null;
      const have = an.archive.comp || (an.archive.gz ? 'gz' : null);
      if (want && want !== have) {
        const tool = { gz: ['gzip', 'not in gzip format'], bz2: ['bzip2', 'data integrity error when decompressing.\n\tIt is possible that the compressed file(s) have become corrupted.'], xz: ['xz', 'File format not recognized'] }[want];
        c.err(want === 'bz2' ? '\nbzip2: (stdin) is not a bzip2 file.\ntar: Child returned status 2\ntar: Error is not recoverable: exiting now\n' : want === 'xz' ? 'xz: (stdin): File format not recognized\ntar: Child returned status 1\ntar: Error is not recoverable: exiting now\n' : '\ngzip: stdin: not in gzip format\ntar: Child returned status 1\ntar: Error is not recoverable: exiting now\n');
        return 2;
      }
      if (mode === 't') {
        for (const it of an.archive.items) c.out(it.path + (it.node.t === 'd' ? '/' : '') + '\n');
        return 0;
      }
      extract(c, an.archive.items, dir ? c.abs(dir) : sh.cwd, verbose, 'tar');
      return 0;
    } catch (e) {
      if (!(e instanceof FsErr)) throw e;
      c.err(`tar: ${archive}: Cannot open: ${U.errTxt(e)}\ntar: Error is not recoverable: exiting now\n`);
      return 2;
    }
  });
  def('gzip', async (c, args) => {
    const g = U.getopts('gzip', c, args, 'dkv1', '', { decompress: 'd', keep: 'k' });
    if (!g) return 1;
    const { o, rest } = g;
    let st = 0;
    for (const f of rest) {
      const abs = c.abs(f);
      const n = c.sh.fs.lookup(abs);
      if (!n) {
        c.err(`gzip: ${f}: No such file or directory\n`);
        st = 1;
        continue;
      }
      if (o.d) {
        if (!f.endsWith('.gz') || !n.archive || n.archive.kind !== 'gz') {
          c.err(`gzip: ${f}: unknown suffix -- ignored\n`);
          st = 1;
          continue;
        }
        const orig = n.archive.items[0];
        const target = abs.replace(/\.gz$/, '');
        c.sh.fs.lookup(VFS.dirname(abs)).kids[base(target)] = c.sh.fs.clone(orig.node);
        if (!o.k) c.sh.unlink(abs);
      } else {
        if (n.t === 'd') {
          c.err(`gzip: ${f} is a directory -- ignored\n`);
          st = 1;
          continue;
        }
        const items = [{ path: base(abs), node: c.sh.fs.clone(n) }];
        const gn = c.sh.newFile({});
        gn.archive = { kind: 'gz', gz: true, items };
        gn.size = Math.max(60, Math.round(VFS.size(n) * 0.4) + 20);
        c.sh.fs.lookup(VFS.dirname(abs)).kids[base(abs) + '.gz'] = gn;
        if (!o.k) c.sh.unlink(abs);
      }
    }
    return st;
  });
  def('gunzip', (c, args) => LX.cmds.gzip.run(c, ['-d', ...args]));
  def(
    'zip',
    async (c, args) => {
      const g = U.getopts('zip', c, args, 'rqv', '', {});
      if (!g) return 1;
      const [out, ...members] = g.rest;
      if (!out || !members.length) {
        c.err('zip error: Nothing to do!\n');
        return 12;
      }
      const items = [];
      for (const m of members) {
        if (!collect(c.sh, c.abs(m), m, items)) c.err(`\tzip warning: name not matched: ${m}\n`);
      }
      if (!items.length) {
        c.err('\nzip error: Nothing to do!\n');
        return 12;
      }
      const target = out.endsWith('.zip') ? out : out + '.zip';
      try {
        c.sh.writeFile(c.abs(target), '', false);
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`zip error: Could not create output file (${U.errTxt(e)})\n`);
        return 15;
      }
      const an = c.sh.fs.lookup(c.abs(target));
      an.archive = { kind: 'zip', gz: true, items };
      an.size = Math.max(150, Math.round(U.archiveSize(items, true) * 0.9));
      if (!g.o.q) for (const it of items) c.out(`  adding: ${it.path}${it.node.t === 'd' ? '/' : ''} (${it.node.t === 'd' ? 'stored 0%' : 'deflated 38%'})\n`);
      return 0;
    },
    { pkg: 'zip' }
  );
  def(
    'unzip',
    async (c, args) => {
      let dir = null;
      const rest = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-d') dir = args[++i];
        else if (!args[i].startsWith('-')) rest.push(args[i]);
      }
      if (!rest.length) {
        c.err('UnZip 6.00 of 20 April 2009. Usage: unzip [-d exdir] file[.zip]\n');
        return 1;
      }
      const f = rest[0];
      const n = c.sh.fs.lookup(c.abs(f)) || c.sh.fs.lookup(c.abs(f + '.zip'));
      if (!n) {
        c.err(`unzip:  cannot find or open ${f}, ${f}.zip or ${f}.ZIP.\n`);
        return 9;
      }
      if (!n.archive || n.archive.kind !== 'zip') {
        c.err(`  End-of-central-directory signature not found.  ${f} is not a zip file.\n`);
        return 9;
      }
      c.out(`Archive:  ${f}\n`);
      extract(c, n.archive.items, dir ? c.abs(dir) : c.sh.cwd, true, 'unzip');
      return 0;
    },
    { pkg: 'unzip' }
  );
})();
