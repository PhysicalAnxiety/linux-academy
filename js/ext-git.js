/* Linux Academy: a small but faithful git simulator, plus rsync and extra compressors */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS, Shell } = LX;
  const U = LX.U;
  LX.initHooks = LX.initHooks || [];

  const hash40 = (s) => (LX.md5(s) + LX.md5(s + '#2')).slice(0, 40);
  const GITHUB_SAMPLE = 'https://github.com/linux-academy/hello-world.git';

  LX.initHooks.push((sh) => {
    sh.remotes = {};
    const t = Date.now() - 20 * 86400000;
    const mk = (parents, tree, msg, dt) => {
      const c = { parents, tree, msg, author: 'Ravi Kumar', email: 'ravi@example.com', date: t + dt };
      c.id = hash40(JSON.stringify([parents, tree, msg, dt]));
      return c;
    };
    const c1 = mk([], { 'README.md': '# hello-world\n\nA tiny demo repository.\n' }, 'Initial commit', 0);
    const c2 = mk([c1.id], { 'README.md': '# hello-world\n\nA tiny demo repository.\n', 'hello.sh': '#!/bin/bash\necho "Hello, world!"\n' }, 'Add hello script', 86400000);
    const c3 = mk([c2.id], { 'README.md': '# hello-world\n\nA tiny demo repository.\n\nRun ./hello.sh to say hello.\n', 'hello.sh': '#!/bin/bash\necho "Hello, world!"\n' }, 'Document how to run the script', 2 * 86400000);
    sh.remotes[GITHUB_SAMPLE] = { commits: { [c1.id]: c1, [c2.id]: c2, [c3.id]: c3 }, branches: { main: c3.id }, tags: {} };
  });

  /* ---------- helpers ---------- */
  const findRepo = (sh, from) => {
    let cur = from || sh.cwd;
    for (;;) {
      const n = sh.fs.lookup(cur + '/.git');
      if (n && n.t === 'd' && n.git) return { root: cur, dir: n, g: n.git };
      if (cur === '/') return null;
      cur = VFS.dirname(cur);
    }
  };
  const headId = (g) => (g.HEAD.startsWith('ref:') ? g.branches[g.HEAD.slice(5)] : g.HEAD);
  const branchName = (g) => (g.HEAD.startsWith('ref:') ? g.HEAD.slice(5) : null);
  const treeOf = (g, id) => (id && g.commits[id] ? g.commits[id].tree : {});
  const short = (id) => (id || '').slice(0, 7);
  function ignorePatterns(sh, root) {
    const f = sh.fs.lookup(root + '/.gitignore');
    return f ? (f.content || '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [];
  }
  const ignored = (pats, path) => pats.some((p) => {
    const q = p.replace(/\/$/, '');
    if (p.endsWith('/')) return path.split('/').some((seg, i, a) => i < a.length - 1 && seg === q);
    const re = LX.globToRegex(q.replace(/^\//, ''));
    return re.test(path) || path.split('/').some((seg) => re.test(seg));
  });
  function workFiles(sh, repo) {
    const out = {};
    const pats = ignorePatterns(sh, repo.root);
    const rec = (dir, prefix) => {
      const n = sh.fs.lookup(dir);
      if (!n || n.t !== 'd') return;
      for (const k of Object.keys(n.kids).sort()) {
        if (k === '.git') continue;
        const p = prefix + k;
        const kid = n.kids[k];
        if (kid.t === 'd') rec(dir + '/' + k, p + '/');
        else if (kid.t === 'f') out[p] = { content: kid.content || '', mode: kid.mode };
      }
    };
    rec(repo.root, '');
    return { files: out, pats };
  }
  const writeWork = (sh, repo, path, content, mode) => {
    const abs = repo.root + '/' + path;
    sh.fs.mkdirp(VFS.dirname(abs), { owner: sh.eu(), group: sh.users[sh.eu()].groups[0] });
    const ex = sh.fs.lookup(abs);
    if (ex) {
      ex.content = content;
      ex.mtime = Date.now();
    } else sh.fs.put(abs, content, { owner: sh.eu(), group: sh.users[sh.eu()].groups[0], mode: mode || 0o644 });
  };
  const rmWork = (sh, repo, path) => {
    const abs = repo.root + '/' + path;
    const d = sh.fs.lookup(VFS.dirname(abs));
    if (d) delete d.kids[VFS.base(abs)];
    // prune empty dirs
    let dir = VFS.dirname(abs);
    while (dir.length > repo.root.length) {
      const dn = sh.fs.lookup(dir);
      if (dn && !Object.keys(dn.kids).length) {
        delete sh.fs.lookup(VFS.dirname(dir)).kids[VFS.base(dir)];
        dir = VFS.dirname(dir);
      } else break;
    }
  };

  /* ---------- diff ---------- */
  function lcsOps(a, b) {
    const n = a.length;
    const m = b.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) {
        ops.push([' ', a[i]]);
        i++;
        j++;
      } else if (j >= m || (i < n && L[i + 1][j] >= L[i][j + 1])) {
        ops.push(['-', a[i++]]);
      } else ops.push(['+', b[j++]]);
    }
    return ops;
  }
  const splitLines = (t) => (t === '' ? [] : t.replace(/\n$/, '').split('\n'));
  function unified(path, oldT, newT, oldMode) {
    const a = splitLines(oldT || '');
    const b = splitLines(newT || '');
    const ops = lcsOps(a, b);
    if (!ops.some((o) => o[0] !== ' ')) return '';
    let out = `diff --git a/${path} b/${path}\n`;
    if (oldT === null) out += `new file mode 100644\nindex 0000000..${hash40(newT).slice(0, 7)}\n--- /dev/null\n+++ b/${path}\n`;
    else if (newT === null) out += `deleted file mode 100644\nindex ${hash40(oldT).slice(0, 7)}..0000000\n--- a/${path}\n+++ /dev/null\n`;
    else out += `index ${hash40(oldT).slice(0, 7)}..${hash40(newT).slice(0, 7)} 100644\n--- a/${path}\n+++ b/${path}\n`;
    // hunks with 3 lines context
    const idxs = ops.map((o, i) => (o[0] !== ' ' ? i : -1)).filter((i) => i >= 0);
    let h = 0;
    while (h < idxs.length) {
      let start = Math.max(0, idxs[h] - 3);
      let end = idxs[h];
      let k = h;
      while (k + 1 < idxs.length && idxs[k + 1] - end <= 6) {
        k++;
        end = idxs[k];
      }
      end = Math.min(ops.length - 1, end + 3);
      let oa = 0;
      let ob = 0;
      for (let i = 0; i < start; i++) {
        if (ops[i][0] !== '+') oa++;
        if (ops[i][0] !== '-') ob++;
      }
      const seg = ops.slice(start, end + 1);
      const la = seg.filter((o) => o[0] !== '+').length;
      const lb = seg.filter((o) => o[0] !== '-').length;
      const rng = (st, n) => (n === 1 ? `${st}` : `${st},${n}`);
      out += `@@ -${rng(la ? oa + 1 : oa, la)} +${rng(lb ? ob + 1 : ob, lb)} @@\n` + seg.map((o) => o[0] + o[1]).join('\n') + '\n';
      h = k + 1;
    }
    return out;
  }
  LX.unifiedHunks = (oldT, newT, ctx) => {
    const ops = lcsOps(splitLines(oldT || ''), splitLines(newT || ''));
    const C = ctx === undefined ? 3 : ctx;
    const idxs = ops.map((o, i) => (o[0] !== ' ' ? i : -1)).filter((i) => i >= 0);
    let out = '';
    let h = 0;
    while (h < idxs.length) {
      const start = Math.max(0, idxs[h] - C);
      let end = idxs[h];
      let k = h;
      while (k + 1 < idxs.length && idxs[k + 1] - end <= 2 * C) { k++; end = idxs[k]; }
      end = Math.min(ops.length - 1, end + C);
      let oa = 0;
      let ob = 0;
      for (let i = 0; i < start; i++) { if (ops[i][0] !== '+') oa++; if (ops[i][0] !== '-') ob++; }
      const seg = ops.slice(start, end + 1);
      const la = seg.filter((o) => o[0] !== '+').length;
      const lb = seg.filter((o) => o[0] !== '-').length;
      const rng = (st, n) => (n === 1 ? `${st}` : `${st},${n}`);
      out += `@@ -${rng(la ? oa + 1 : oa, la)} +${rng(lb ? ob + 1 : ob, lb)} @@\n` + seg.map((o) => o[0] + o[1]).join('\n') + '\n';
      h = k + 1;
    }
    return out;
  };
  function diffTrees(a, b, only) {
    let out = '';
    const paths = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const p of paths) {
      if (only && !only.includes(p)) continue;
      const x = p in a ? a[p] : null;
      const y = p in b ? b[p] : null;
      if (x !== y) out += unified(p, x, y);
    }
    return out;
  }
  const statLine = (a, b) => {
    let files = 0;
    let ins = 0;
    let del = 0;
    const rows = [];
    for (const p of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const x = p in a ? a[p] : null;
      const y = p in b ? b[p] : null;
      if (x === y) continue;
      files++;
      const ops = lcsOps(splitLines(x || ''), splitLines(y || ''));
      const i = ops.filter((o) => o[0] === '+').length;
      const d = ops.filter((o) => o[0] === '-').length;
      ins += i;
      del += d;
      rows.push(` ${p} | ${i + d} ${'+'.repeat(Math.min(i, 20))}${'-'.repeat(Math.min(d, 20))}`);
    }
    return { rows, summary: ` ${files} file${files === 1 ? '' : 's'} changed${ins ? `, ${ins} insertion${ins === 1 ? '' : 's'}(+)` : ''}${del ? `, ${del} deletion${del === 1 ? '' : 's'}(-)` : ''}` };
  };

  /* ---------- 3-way line merge ---------- */
  function regions(base, other) {
    // returns list of {s,e,lines} replacing base[s..e) with lines
    const ops = lcsOps(base, other);
    const out = [];
    let bi = 0;
    let cur = null;
    for (const [t, line] of ops) {
      if (t === ' ') {
        if (cur) out.push(cur), (cur = null);
        bi++;
      } else if (t === '-') {
        if (!cur) cur = { s: bi, e: bi, lines: [] };
        cur.e = ++bi;
      } else {
        if (!cur) cur = { s: bi, e: bi, lines: [] };
        cur.lines.push(line);
      }
    }
    if (cur) out.push(cur);
    return out;
  }
  function merge3(base, ours, theirs, oursName, theirsName) {
    const A = regions(base, ours);
    const B = regions(base, theirs);
    const out = [];
    let conflict = false;
    let pos = 0;
    let i = 0;
    let j = 0;
    const overlap = (x, y) => x.s < y.e && y.s < x.e || x.s === y.s;
    while (i < A.length || j < B.length) {
      const a = A[i];
      const b = B[j];
      let next;
      if (a && b && overlap(a, b)) {
        const s = Math.min(a.s, b.s);
        const e = Math.max(a.e, b.e);
        out.push(...base.slice(pos, s));
        if (JSON.stringify(a.lines) === JSON.stringify(b.lines) && a.s === b.s && a.e === b.e) out.push(...a.lines);
        else {
          conflict = true;
          const ob = base.slice(s, e);
          const aLines = [...base.slice(s, a.s), ...a.lines, ...base.slice(a.e, e)];
          const bLines = [...base.slice(s, b.s), ...b.lines, ...base.slice(b.e, e)];
          out.push(`<<<<<<< ${oursName}`, ...aLines, '=======', ...bLines, `>>>>>>> ${theirsName}`);
        }
        pos = e;
        i++;
        j++;
        continue;
      }
      next = !b || (a && a.s <= b.s) ? ['a', a] : ['b', b];
      out.push(...base.slice(pos, next[1].s), ...next[1].lines);
      pos = next[1].e;
      if (next[0] === 'a') i++;
      else j++;
    }
    out.push(...base.slice(pos));
    return { text: out.length ? out.join('\n') + '\n' : '', conflict };
  }

  /* ---------- git command ---------- */
  const ancestors = (g, id) => {
    const seen = new Set();
    const st = [id];
    while (st.length) {
      const x = st.pop();
      if (!x || seen.has(x) || !g.commits[x]) continue;
      seen.add(x);
      g.commits[x].parents.forEach((p) => st.push(p));
    }
    return seen;
  };
  const mergeBase = (g, a, b) => {
    const A = ancestors(g, a);
    const q = [b];
    const seen = new Set();
    while (q.length) {
      const x = q.shift();
      if (A.has(x)) return x;
      if (seen.has(x) || !g.commits[x]) continue;
      seen.add(x);
      q.push(...g.commits[x].parents);
    }
    return null;
  };
  const resolveRev = (g, rev) => {
    if (!rev) return headId(g);
    let m = /^(.+?)(?:~(\d+)|\^)?$/.exec(rev);
    let base = rev;
    let n = 0;
    if ((m = /^(.+?)~(\d+)$/.exec(rev))) {
      base = m[1];
      n = +m[2];
    } else if ((m = /^(.+)\^$/.exec(rev))) {
      base = m[1];
      n = 1;
    }
    let id = base === 'HEAD' ? headId(g) : g.branches[base] || g.tags[base] || (g.remoteRefs && g.remoteRefs[base]) || Object.keys(g.commits).find((k) => k.startsWith(base));
    for (let i = 0; i < n && id; i++) id = g.commits[id].parents[0];
    return id && g.commits[id] ? id : null;
  };
  const gitConfigGet = (sh, repo, key) => {
    const read = (path) => {
      const n = sh.fs.lookup(path);
      if (!n) return null;
      let sec = '';
      const vals = {};
      for (const l of (n.content || '').split('\n')) {
        const mm = /^\[(\w+)(?: "([^"]+)")?\]$/.exec(l.trim());
        if (mm) sec = mm[1] + (mm[2] ? '.' + mm[2] : '');
        else {
          const kv = /^\s*([\w-]+)\s*=\s*(.*)$/.exec(l);
          if (kv) vals[sec + '.' + kv[1]] = kv[2];
        }
      }
      return vals;
    };
    const home = sh.users[sh.eu()].home;
    const loc = repo ? Object.assign({}, repo.g.config) : {};
    const glob = read(home + '/.gitconfig') || {};
    return key in loc ? loc[key] : glob[key];
  };
  const identity = (sh, repo) => ({ name: gitConfigGet(sh, repo, 'user.name'), email: gitConfigGet(sh, repo, 'user.email') });
  function checkoutTree(sh, repo, oldTree, newTree) {
    const g = repo.g;
    for (const p of Object.keys(oldTree)) if (!(p in newTree)) rmWork(sh, repo, p);
    for (const [p, c] of Object.entries(newTree)) writeWork(sh, repo, p, c);
    g.index = Object.assign({}, newTree);
  }
  const statusParts = (sh, repo) => {
    const g = repo.g;
    const head = treeOf(g, headId(g));
    const { files, pats } = workFiles(sh, repo);
    const staged = [];
    const unstaged = [];
    const untracked = [];
    for (const p of [...new Set([...Object.keys(head), ...Object.keys(g.index)])].sort()) {
      if (!(p in head) && p in g.index) staged.push(['new file', p]);
      else if (p in head && !(p in g.index)) staged.push(['deleted', p]);
      else if (head[p] !== g.index[p]) staged.push(['modified', p]);
    }
    for (const p of Object.keys(g.index).sort()) {
      if (!(p in files)) unstaged.push(['deleted', p]);
      else if (files[p].content !== g.index[p]) unstaged.push(['modified', p]);
    }
    for (const p of Object.keys(files).sort()) if (!(p in g.index) && !ignored(pats, p)) untracked.push(p);
    return { head, files, staged, unstaged, untracked, pats };
  };
  const commitLine = (g, id, o) => {
    const c = g.commits[id];
    const refs = [];
    if (headId(g) === id) refs.push(branchName(g) ? `HEAD -> ${branchName(g)}` : 'HEAD');
    for (const [b, bid] of Object.entries(g.branches)) if (bid === id && b !== branchName(g)) refs.push(b);
    for (const [t, tid] of Object.entries(g.tags)) if (tid === id) refs.push('tag: ' + t);
    if (g.remoteRefs) for (const [r, rid] of Object.entries(g.remoteRefs)) if (rid === id) refs.push(r);
    return { c, refs };
  };

  def('git', async (c, args) => {
    const sh = c.sh;
    const sub = args[0];
    const rest = args.slice(1);
    const flag = (f) => rest.includes(f);
    const val = (f) => {
      const i = rest.indexOf(f);
      return i >= 0 ? rest[i + 1] : undefined;
    };
    const positional = rest.filter((a, i) => !a.startsWith('-') && !(rest[i - 1] && ['-m', '-b', '-c', '-n', '-d', '-u'].includes(rest[i - 1])));
    if (!sub || sub === '--version') {
      if (!sub) c.out('usage: git [-v | --version] [-h | --help] [-C <path>] [-c <name>=<value>]\n           <command> [<args>]\n\nstart a working area: clone, init\nwork on the current change: add, mv, restore, rm\nexamine the history and state: log, show, status, diff\ngrow, mark and tweak your history: branch, commit, merge, rebase, reset, switch, tag\ncollaborate: fetch, pull, push\n');
      else c.out('git version 2.43.0\n');
      return sub ? 0 : 1;
    }
    if (sub === 'init') {
      const dirArg = positional[0];
      const bare = flag('--bare');
      const dir = dirArg ? c.abs(dirArg) : sh.cwd;
      const bi = val('-b') || val('--initial-branch') || gitConfigGet(sh, null, 'init.defaultBranch');
      try {
        sh.fs.mkdirp(dir, { owner: sh.eu(), group: sh.users[sh.eu()].groups[0] });
        const gd = bare ? dir : dir + '/.git';
        const again = sh.fs.lookup(gd) && sh.fs.lookup(gd).git;
        const node = sh.fs.mkdirp(gd, { owner: sh.eu(), group: sh.users[sh.eu()].groups[0] });
        const branch = bi || 'master';
        if (!again) {
          node.git = { HEAD: 'ref: ' + branch, branches: {}, commits: {}, tags: {}, index: {}, stash: [], config: {}, remotes: {}, bare, merge: null };
          ['HEAD', 'config', 'description'].forEach((f) => (node.kids[f] = sh.fs.mk('f', { owner: sh.eu(), group: sh.users[sh.eu()].groups[0], content: f === 'HEAD' ? `ref: refs/heads/${branch}\n` : '' })));
          ['objects', 'refs', 'hooks', 'info'].forEach((f) => (node.kids[f] = sh.fs.mk('d', { owner: sh.eu(), group: sh.users[sh.eu()].groups[0] })));
        }
        if (!bi && !again) c.err("hint: Using 'master' as the name for the initial branch. This default branch name\nhint: is subject to change. To configure the initial branch name to use in all\nhint: of your new repositories, which will suppress this warning, call:\nhint:\nhint: \tgit config --global init.defaultBranch <name>\nhint:\nhint: Names commonly chosen instead of 'master' are 'main', 'trunk' and\nhint: 'development'. The just-created branch can be renamed via this command:\nhint:\nhint: \tgit branch -m <name>\n");
        c.out(`${again ? 'Reinitialized existing' : 'Initialized empty'} Git repository in ${gd}/\n`);
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`fatal: cannot mkdir ${dirArg}: ${U.errTxt(e)}\n`);
        return 128;
      }
      return 0;
    }
    if (sub === 'config') {
      const home = sh.users[sh.eu()].home;
      const glob = flag('--global');
      const repo = findRepo(sh);
      if (flag('--list') || flag('-l')) {
        const n = sh.fs.lookup(home + '/.gitconfig');
        const txt = (n && n.content) || '';
        let sec = '';
        for (const l of txt.split('\n')) {
          const mm = /^\[(\w+)\]$/.exec(l.trim());
          if (mm) sec = mm[1];
          else if (/=/.test(l)) c.out(sec + '.' + l.trim().replace(/\s*=\s*/, '=') + '\n');
        }
        if (repo) for (const [k, v] of Object.entries(repo.g.config)) c.out(`${k}=${v}\n`);
        return 0;
      }
      const kv = positional;
      if (kv.length === 1) {
        const v = gitConfigGet(sh, repo, kv[0]);
        if (v === undefined) return 1;
        c.out(v + '\n');
        return 0;
      }
      if (kv.length >= 2) {
        const [key, value] = kv;
        if (glob) {
          const [sec, name] = [key.split('.')[0], key.split('.').slice(1).join('.')];
          const n = sh.fs.lookup(home + '/.gitconfig');
          let txt = (n && n.content) || '';
          const re = new RegExp(`(\\[${sec}\\][^\\[]*?)\\n\\t${name} = .*`);
          if (re.test(txt)) txt = txt.replace(re, `$1\n\t${name} = ${value}`);
          else if (new RegExp(`\\[${sec}\\]`).test(txt)) txt = txt.replace(`[${sec}]\n`, `[${sec}]\n\t${name} = ${value}\n`);
          else txt += `[${sec}]\n\t${name} = ${value}\n`;
          sh.writeFile(home + '/.gitconfig', txt, false);
        } else {
          if (!repo) {
            c.err('fatal: not in a git directory\n');
            return 128;
          }
          repo.g.config[key] = value;
        }
        return 0;
      }
      c.err('usage: git config [<options>]\n');
      return 129;
    }
    if (sub === 'clone') {
      const url = positional[0];
      if (!url) {
        c.err('fatal: You must specify a repository to clone.\n');
        return 129;
      }
      const name = positional[1] || VFS.base(url).replace(/\.git$/, '');
      const remote = sh.remotes[url];
      c.out(`Cloning into '${name}'...\n`);
      if (!remote) {
        if (/^https?:\/\//.test(url) && !sh.netUp()) {
          c.err(`fatal: unable to access '${url}/': Could not resolve host: ${url.split('/')[2]}\n`);
          return 128;
        }
        c.err(`remote: Repository not found.\nfatal: repository '${url}/' not found\n`);
        return 128;
      }
      const dir = c.abs(name);
      if (sh.fs.lookup(dir) && Object.keys(sh.fs.lookup(dir).kids || {}).length) {
        c.err(`fatal: destination path '${name}' already exists and is not an empty directory.\n`);
        return 128;
      }
      await sh.dispatch(['git', 'init', '-b', Object.keys(remote.branches)[0] || 'main', '--quiet-internal', dir], { stdin: '', stdout: () => {}, stderr: () => {}, tty: false });
      const node = sh.fs.lookup(dir + '/.git');
      const g = node.git;
      g.commits = JSON.parse(JSON.stringify(remote.commits));
      const def0 = Object.keys(remote.branches)[0];
      g.branches[def0] = remote.branches[def0];
      g.HEAD = 'ref: ' + def0;
      g.remotes.origin = url;
      g.remoteRefs = {};
      for (const [b, id] of Object.entries(remote.branches)) g.remoteRefs['origin/' + b] = id;
      g.tracking = { [def0]: 'origin/' + def0 };
      const repo = { root: dir, g, dir: node };
      checkoutTree(sh, repo, {}, treeOf(g, g.branches[def0]));
      c.out(`remote: Enumerating objects: ${Object.keys(g.commits).length * 3}, done.\nremote: Total ${Object.keys(g.commits).length * 3} (delta 0), reused 0 (delta 0), pack-reused ${Object.keys(g.commits).length * 3}\nReceiving objects: 100% (${Object.keys(g.commits).length * 3}/${Object.keys(g.commits).length * 3}), done.\n`);
      return 0;
    }
    const repo = findRepo(sh);
    if (!repo) {
      c.err('fatal: not a git repository (or any of the parent directories): .git\n');
      return 128;
    }
    const g = repo.g;
    switch (sub) {
      case 'status': {
        const s = statusParts(sh, repo);
        const bn = branchName(g);
        c.out(bn ? `On branch ${bn}\n` : `HEAD detached at ${short(headId(g))}\n`);
        if (g.tracking && g.tracking[bn] && g.remoteRefs) {
          const up = g.remoteRefs[g.tracking[bn]];
          const mine = g.branches[bn];
          if (up === mine) c.out(`Your branch is up to date with '${g.tracking[bn]}'.\n\n`);
          else if (up && ancestors(g, mine).has(up)) c.out(`Your branch is ahead of '${g.tracking[bn]}' by ${[...ancestors(g, mine)].filter((x) => !ancestors(g, up).has(x)).length} commit(s).\n  (use "git push" to publish your local commits)\n\n`);
          else if (up) c.out(`Your branch is behind '${g.tracking[bn]}'.\n  (use "git pull" to update your local branch)\n\n`);
        }
        if (!headId(g)) c.out('\nNo commits yet\n\n');
        if (g.merge) {
          c.out('You have unmerged paths.\n  (fix conflicts and run "git commit")\n  (use "git merge --abort" to abort the merge)\n\n');
          if (g.merge.conflicts.length) {
            c.out('Unmerged paths:\n  (use "git add <file>..." to mark resolution)\n');
            g.merge.conflicts.forEach((p) => c.out(`\t\x1b[31mboth modified:   ${p}\x1b[0m\n`));
            c.out('\n');
          }
        }
        const unconflicted = s.staged;
        if (unconflicted.length) {
          c.out('Changes to be committed:\n  (use "git restore --staged <file>..." to unstage)\n');
          unconflicted.forEach(([k, p]) => c.out(`\t\x1b[32m${(k + ':').padEnd(12)} ${p}\x1b[0m\n`));
          c.out('\n');
        }
        const uns = s.unstaged.filter(([, p]) => !(g.merge && g.merge.conflicts.includes(p)));
        if (uns.length) {
          c.out('Changes not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n  (use "git restore <file>..." to discard changes in working directory)\n');
          uns.forEach(([k, p]) => c.out(`\t\x1b[31m${(k + ':').padEnd(12)} ${p}\x1b[0m\n`));
          c.out('\n');
        }
        if (s.untracked.length) {
          c.out('Untracked files:\n  (use "git add <file>..." to include in what will be committed)\n');
          s.untracked.forEach((p) => c.out(`\t\x1b[31m${p}\x1b[0m\n`));
          c.out('\n');
        }
        if (!unconflicted.length && !uns.length && !s.untracked.length && !g.merge) c.out(headId(g) ? 'nothing to commit, working tree clean\n' : 'nothing to commit (create/copy files and use "git add" to track)\n');
        else if (!unconflicted.length && !g.merge) c.out(s.untracked.length && !uns.length ? 'nothing added to commit but untracked files present (use "git add" to track)\n' : 'no changes added to commit (use "git add" and/or "git commit -a")\n');
        return 0;
      }
      case 'add': {
        const targets = positional.length ? positional : [];
        if (!targets.length) {
          c.out('Nothing specified, nothing added.\nhint: Maybe you wanted to say \'git add .\'?\n');
          return 0;
        }
        const { files, pats } = workFiles(sh, repo);
        for (const t of targets) {
          const abs = c.abs(t);
          const rel = abs === repo.root ? '' : abs.slice(repo.root.length + 1);
          const hit = Object.keys(files).filter((p) => rel === '' || p === rel || p.startsWith(rel + '/'));
          const del = Object.keys(g.index).filter((p) => !(p in files) && (rel === '' || p === rel || p.startsWith(rel + '/')));
          if (!hit.length && !del.length) {
            c.err(`fatal: pathspec '${t}' did not match any files\n`);
            return 128;
          }
          for (const p of hit) {
            if (ignored(pats, p) && !flag('-f')) {
              c.err(`The following paths are ignored by one of your .gitignore files:\n${p}\nhint: Use -f if you really want to add them.\n`);
              continue;
            }
            g.index[p] = files[p].content;
            if (g.merge) g.merge.conflicts = g.merge.conflicts.filter((x) => x !== p);
          }
          for (const p of del) delete g.index[p];
        }
        if (flag('-A') || flag('--all') || flag('-u')) {
          for (const p of Object.keys(g.index)) if (!(p in files)) delete g.index[p];
        }
        return 0;
      }
      case 'commit': {
        const id = identity(sh, repo);
        if (!id.name || !id.email) {
          c.err(`Author identity unknown\n\n*** Please tell me who you are.\n\nRun\n\n  git config --global user.email "you@example.com"\n  git config --global user.name "Your Name"\n\nto set your account's default identity.\nOmit --global to set the identity only in this repository.\n\nfatal: unable to auto-detect email address (got '${sh.user}@${sh.hostname}.(none)')\n`);
          return 128;
        }
        if (flag('-a') || flag('-am') || rest.some((a) => /^-[a-z]*a[a-z]*$/.test(a) && a !== '--amend')) {
          const { files } = workFiles(sh, repo);
          for (const p of Object.keys(g.index)) {
            if (!(p in files)) delete g.index[p];
            else g.index[p] = files[p].content;
          }
        }
        let msg = val('-m');
        const mI = rest.findIndex((a) => /^-[a-z]*m$/.test(a) && a !== '-m');
        if (msg === undefined && mI >= 0) msg = rest[mI + 1];
        const mm = rest.find((a) => a.startsWith('--message='));
        if (mm) msg = mm.slice(10);
        const head = headId(g);
        const headTree = treeOf(g, head);
        const amend = flag('--amend');
        if (g.merge && g.merge.conflicts.length) {
          c.err('error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use \'git add/rm <file>\'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.\n');
          return 128;
        }
        if (!amend && !g.merge && JSON.stringify(headTree) === JSON.stringify(g.index)) {
          return (await sh.dispatch(['git', 'status'], c.io)), 1;
        }
        if (msg === undefined) {
          if (g.merge) msg = `Merge branch '${g.merge.branch}'`;
          else if (amend) msg = g.commits[head].msg;
          else if (sh.hooks.edit) {
            const r = await sh.hooks.edit({ name: 'nano', path: '.git/COMMIT_EDITMSG', content: '\n# Please enter the commit message for your changes. Lines starting\n# with \'#\' will be ignored, and an empty message aborts the commit.\n', readonly: false });
            msg = (r || '').split('\n').filter((l) => !l.startsWith('#')).join('\n').trim();
            if (!msg) {
              c.err('Aborting commit due to empty commit message.\n');
              return 1;
            }
          } else {
            c.err('Aborting commit due to empty commit message.\n');
            return 1;
          }
        }
        const parents = amend ? g.commits[head].parents.slice() : head ? [head] : [];
        if (g.merge) parents.push(g.merge.theirs);
        const commit = { parents, tree: Object.assign({}, g.index), msg, author: id.name, email: id.email, date: Date.now() };
        commit.id = hash40(JSON.stringify([parents, commit.tree, msg, commit.date, Math.random()]));
        g.commits[commit.id] = commit;
        const bn = branchName(g);
        if (bn) g.branches[bn] = commit.id;
        else g.HEAD = commit.id;
        g.merge = null;
        const st = statLine(amend ? treeOf(g, parents[0]) : headTree, commit.tree);
        if (rest.some((a) => a === '--quiet' || /^-[a-z]*q/.test(a))) return 0;
        c.out(`[${bn || 'detached HEAD'} ${!head ? '(root-commit) ' : ''}${short(commit.id)}] ${msg.split('\n')[0]}\n${st.summary}\n`);
        for (const p of Object.keys(commit.tree)) if (!(p in headTree)) c.out(` create mode 100644 ${p}\n`);
        for (const p of Object.keys(headTree)) if (!(p in commit.tree)) c.out(` delete mode 100644 ${p}\n`);
        return 0;
      }
      case 'log': {
        const n = val('-n') || (rest.find((a) => /^-\d+$/.test(a)) || '').slice(1);
        const oneline = flag('--oneline');
        const graph = flag('--graph');
        let id = headId(g);
        if (!id) {
          c.err(`fatal: your current branch '${branchName(g)}' does not have any commits yet\n`);
          return 128;
        }
        const startRev = positional[0];
        if (startRev && !startRev.includes('..')) id = resolveRev(g, startRev) || id;
        let ids;
        if (flag('--all')) ids = Object.values(g.commits);
        else {
          const seen = [];
          const q = [id];
          const vis = new Set();
          while (q.length) {
            const x = q.shift();
            if (!x || vis.has(x)) continue;
            vis.add(x);
            seen.push(g.commits[x]);
            q.push(...g.commits[x].parents);
          }
          ids = seen;
        }
        ids = ids.sort((a, b) => b.date - a.date);
        if (n) ids = ids.slice(0, +n);
        for (const cm of ids) {
          const { refs } = commitLine(g, cm.id);
          if (oneline) c.out(`${graph ? '* ' : ''}\x1b[33m${short(cm.id)}\x1b[0m${refs.length ? ` \x1b[33m(\x1b[0m${refs.join(', ')}\x1b[33m)\x1b[0m` : ''} ${cm.msg.split('\n')[0]}\n`);
          else c.out(`\x1b[33mcommit ${cm.id}${refs.length ? ' (' + refs.join(', ') + ')' : ''}\x1b[0m\n${cm.parents.length > 1 ? `Merge: ${cm.parents.map(short).join(' ')}\n` : ''}Author: ${cm.author} <${cm.email}>\nDate:   ${U.strftime('%a %b %e %H:%M:%S %Y %z', new Date(cm.date))}\n\n    ${cm.msg.split('\n').join('\n    ')}\n\n`);
        }
        return 0;
      }
      case 'diff': {
        const s = statusParts(sh, repo);
        let out;
        const revs = positional.filter((p) => resolveRev(g, p.split('..')[0]));
        if (revs.length === 2 || (revs[0] && revs[0].includes('..'))) {
          const [a, b] = revs[0].includes('..') ? revs[0].split('..') : revs;
          out = diffTrees(treeOf(g, resolveRev(g, a)), treeOf(g, resolveRev(g, b)));
        } else if (flag('--staged') || flag('--cached')) out = diffTrees(s.head, g.index);
        else {
          const wt = {};
          for (const p of Object.keys(g.index)) if (p in s.files) wt[p] = s.files[p].content;
          const paths = positional.filter((p) => !resolveRev(g, p)).map((p) => c.abs(p).slice(repo.root.length + 1));
          out = diffTrees(g.index, wt, paths.length ? paths : null);
          if (flag('--stat')) {
            const st = statLine(g.index, wt);
            c.out(st.rows.join('\n') + (st.rows.length ? '\n' : '') + st.summary + '\n');
            return 0;
          }
        }
        c.out(out.replace(/^(\+[^+].*|\+)$/gm, '\x1b[32m$1\x1b[0m').replace(/^(-[^-].*|-)$/gm, '\x1b[31m$1\x1b[0m').replace(/^(@@.*)$/gm, '\x1b[36m$1\x1b[0m'));
        return 0;
      }
      case 'show': {
        const id = resolveRev(g, positional[0] || 'HEAD');
        if (!id) {
          c.err(`fatal: ambiguous argument '${positional[0]}': unknown revision or path not in the working tree.\n`);
          return 128;
        }
        const cm = g.commits[id];
        c.out(`\x1b[33mcommit ${id}\x1b[0m\nAuthor: ${cm.author} <${cm.email}>\nDate:   ${U.strftime('%a %b %e %H:%M:%S %Y %z', new Date(cm.date))}\n\n    ${cm.msg}\n\n${diffTrees(treeOf(g, cm.parents[0]), cm.tree)}`);
        return 0;
      }
      case 'branch': {
        const names = positional;
        if (flag('-d') || flag('-D')) {
          const b = val('-d') || val('-D');
          if (!(b in g.branches)) {
            c.err(`error: branch '${b}' not found.\n`);
            return 1;
          }
          if (b === branchName(g)) {
            c.err(`error: Cannot delete branch '${b}' checked out at '${repo.root}'\n`);
            return 1;
          }
          if (flag('-d') && !ancestors(g, headId(g)).has(g.branches[b])) {
            c.err(`error: the branch '${b}' is not fully merged.\nIf you are sure you want to delete it, run 'git branch -D ${b}'.\n`);
            return 1;
          }
          c.out(`Deleted branch ${b} (was ${short(g.branches[b])}).\n`);
          delete g.branches[b];
          return 0;
        }
        if (flag('-m')) {
          const nn = names[names.length - 1];
          const old = names.length > 1 ? names[0] : branchName(g);
          g.branches[nn] = g.branches[old];
          delete g.branches[old];
          if (branchName(g) === old) g.HEAD = 'ref: ' + nn;
          return 0;
        }
        if (names.length) {
          if (!headId(g)) {
            c.err('fatal: not a valid object name: \'' + branchName(g) + '\'\n');
            return 128;
          }
          if (names[0] in g.branches) {
            c.err(`fatal: a branch named '${names[0]}' already exists\n`);
            return 128;
          }
          g.branches[names[0]] = headId(g);
          return 0;
        }
        for (const b of Object.keys(g.branches).sort()) c.out(`${b === branchName(g) ? '* \x1b[32m' + b + '\x1b[0m' : '  ' + b}\n`);
        if (flag('-a') || flag('-r')) for (const r of Object.keys(g.remoteRefs || {})) c.out(`  \x1b[31mremotes/${r}\x1b[0m\n`);
        return 0;
      }
      case 'checkout':
      case 'switch': {
        const create = flag('-b') || flag('-c') || flag('-B') || flag('--create');
        const target = val('-b') || val('-c') || val('-B') || positional[0];
        if (sub === 'checkout' && rest.includes('--')) {
          const paths = rest.slice(rest.indexOf('--') + 1);
          for (const p of paths) {
            const rel = c.abs(p).slice(repo.root.length + 1);
            if (!(rel in g.index)) {
              c.err(`error: pathspec '${p}' did not match any file(s) known to git\n`);
              return 1;
            }
            writeWork(sh, repo, rel, g.index[rel]);
          }
          return 0;
        }
        if (!target) {
          c.err(sub === 'switch' ? 'fatal: missing branch or commit argument\n' : '');
          return 128;
        }
        const s = statusParts(sh, repo);
        if (create) {
          if (target in g.branches && !flag('-B')) {
            c.err(`fatal: a branch named '${target}' already exists\n`);
            return 128;
          }
          g.branches[target] = headId(g);
          g.HEAD = 'ref: ' + target;
          c.out(`Switched to a new branch '${target}'\n`);
          return 0;
        }
        let id = g.branches[target];
        let detach = false;
        if (!id) {
          if (sub === 'switch' && !flag('--detach')) {
            c.err(`fatal: invalid reference: ${target}\n`);
            return 128;
          }
          id = resolveRev(g, target);
          detach = true;
          if (!id) {
            if (g.remoteRefs && g.remoteRefs['origin/' + target]) {
              g.branches[target] = g.remoteRefs['origin/' + target];
              id = g.branches[target];
              detach = false;
              g.tracking = Object.assign(g.tracking || {}, { [target]: 'origin/' + target });
            } else {
              c.err(`error: pathspec '${target}' did not match any file(s) known to git\n`);
              return 1;
            }
          }
        }
        const oldTree = s.head;
        const newTree = treeOf(g, id);
        const clash = s.unstaged.map((x) => x[1]).concat(s.staged.map((x) => x[1])).filter((p) => (oldTree[p] !== newTree[p]) && !(g.merge));
        if (clash.length) {
          c.err(`error: Your local changes to the following files would be overwritten by checkout:\n${clash.map((p) => '\t' + p).join('\n')}\nPlease commit your changes or stash them before you switch branches.\nAborting\n`);
          return 1;
        }
        if (g.HEAD === 'ref: ' + target) {
          c.out(`Already on '${target}'\n`);
          return 0;
        }
        checkoutTree(sh, repo, oldTree, newTree);
        g.HEAD = detach ? id : 'ref: ' + target;
        c.out(detach ? `Note: switching to '${target}'.\n\nYou are in 'detached HEAD' state.\nHEAD is now at ${short(id)} ${g.commits[id].msg.split('\n')[0]}\n` : `Switched to branch '${target}'\n`);
        return 0;
      }
      case 'merge': {
        if (flag('--abort')) {
          if (!g.merge) {
            c.err('fatal: There is no merge to abort (MERGE_HEAD missing).\n');
            return 128;
          }
          checkoutTree(sh, repo, treeOf(g, headId(g)), treeOf(g, headId(g)));
          g.merge = null;
          return 0;
        }
        const target = positional[0];
        const tid = g.branches[target] || resolveRev(g, target);
        if (!tid) {
          c.err(`merge: ${target} - not something we can merge\n`);
          return 1;
        }
        const head = headId(g);
        if (ancestors(g, head).has(tid)) {
          c.out('Already up to date.\n');
          return 0;
        }
        const s = statusParts(sh, repo);
        if (s.staged.length || s.unstaged.length) {
          c.err('error: Your local changes to the following files would be overwritten by merge:\n' + [...s.staged, ...s.unstaged].map((x) => '\t' + x[1]).join('\n') + '\nPlease commit your changes or stash them before you merge.\nAborting\n');
          return 1;
        }
        const bn = branchName(g);
        if (ancestors(g, tid).has(head) && !flag('--no-ff')) {
          const st = statLine(treeOf(g, head), treeOf(g, tid));
          c.out(`Updating ${short(head)}..${short(tid)}\nFast-forward\n${st.rows.join('\n')}\n${st.summary}\n`);
          checkoutTree(sh, repo, treeOf(g, head), treeOf(g, tid));
          if (bn) g.branches[bn] = tid;
          else g.HEAD = tid;
          return 0;
        }
        const base = mergeBase(g, head, tid);
        const B = treeOf(g, base);
        const O = treeOf(g, head);
        const T = treeOf(g, tid);
        const result = {};
        const conflicts = [];
        for (const p of [...new Set([...Object.keys(B), ...Object.keys(O), ...Object.keys(T)])].sort()) {
          const b0 = p in B ? B[p] : null;
          const o0 = p in O ? O[p] : null;
          const t0 = p in T ? T[p] : null;
          if (o0 === t0) {
            if (o0 !== null) result[p] = o0;
          } else if (o0 === b0) {
            if (t0 !== null) result[p] = t0;
          } else if (t0 === b0) {
            if (o0 !== null) result[p] = o0;
          } else if (o0 !== null && t0 !== null) {
            c.out(`Auto-merging ${p}\n`);
            const m = merge3(splitLines(b0 || ''), splitLines(o0), splitLines(t0), 'HEAD', target);
            result[p] = m.text;
            if (m.conflict) {
              conflicts.push(p);
              c.out(`CONFLICT (content): Merge conflict in ${p}\n`);
            }
          } else {
            conflicts.push(p);
            c.out(`CONFLICT (modify/delete): ${p} deleted in one branch and modified in the other.\n`);
            result[p] = o0 !== null ? o0 : t0;
          }
        }
        for (const [p, ct] of Object.entries(result)) writeWork(sh, repo, p, ct);
        for (const p of Object.keys(O)) if (!(p in result)) rmWork(sh, repo, p);
        if (conflicts.length) {
          g.index = Object.assign({}, O);
          for (const p of Object.keys(result)) if (!conflicts.includes(p)) g.index[p] = result[p];
          g.merge = { branch: target, theirs: tid, conflicts };
          c.out('Automatic merge failed; fix conflicts and then commit the result.\n');
          return 1;
        }
        g.index = Object.assign({}, result);
        const id = identity(sh, repo);
        const commit = { parents: [head, tid], tree: Object.assign({}, result), msg: `Merge branch '${target}'`, author: id.name || 'Learner', email: id.email || 'learner@example.com', date: Date.now() };
        commit.id = hash40(JSON.stringify(commit) + Math.random());
        g.commits[commit.id] = commit;
        if (bn) g.branches[bn] = commit.id;
        c.out("Merge made by the 'ort' strategy.\n" + statLine(O, result).rows.join('\n') + '\n' + statLine(O, result).summary + '\n');
        return 0;
      }
      case 'restore': {
        const staged = flag('--staged') || flag('-S');
        for (const p of positional) {
          const abs = c.abs(p);
          const rel = abs === repo.root ? '' : abs.slice(repo.root.length + 1);
          const s = statusParts(sh, repo);
          const paths = [...new Set([...Object.keys(g.index), ...Object.keys(s.head), ...Object.keys(s.files)])].filter((x) => rel === '' || x === rel || x.startsWith(rel + '/'));
          if (!paths.length) {
            c.err(`error: pathspec '${p}' did not match any file(s) known to git\n`);
            return 1;
          }
          for (const x of paths) {
            if (staged) {
              if (x in s.head) g.index[x] = s.head[x];
              else delete g.index[x];
            } else if (x in g.index) writeWork(sh, repo, x, g.index[x]);
          }
        }
        return 0;
      }
      case 'reset': {
        const mode = flag('--hard') ? 'hard' : flag('--soft') ? 'soft' : 'mixed';
        const rev = positional.find((p) => resolveRev(g, p));
        const files = positional.filter((p) => p !== rev);
        if (files.length && !flag('--hard')) {
          const head = treeOf(g, headId(g));
          for (const p of files) {
            const rel = c.abs(p).slice(repo.root.length + 1);
            if (rel in head) g.index[rel] = head[rel];
            else delete g.index[rel];
          }
          return 0;
        }
        const id = rev ? resolveRev(g, rev) : headId(g);
        if (!id) {
          c.err(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.\n`);
          return 128;
        }
        const bn = branchName(g);
        if (bn) g.branches[bn] = id;
        else g.HEAD = id;
        if (mode !== 'soft') {
          if (mode === 'hard') checkoutTree(sh, repo, workFiles(sh, repo).files ? Object.fromEntries(Object.entries(workFiles(sh, repo).files).map(([k, v]) => [k, v.content])) : {}, treeOf(g, id));
          else g.index = Object.assign({}, treeOf(g, id));
        }
        if (mode === 'hard') c.out(`HEAD is now at ${short(id)} ${g.commits[id].msg.split('\n')[0]}\n`);
        else if (mode === 'mixed') {
          const s = statusParts(sh, repo);
          if (s.unstaged.length) c.out('Unstaged changes after reset:\n' + s.unstaged.map((x) => `${x[0] === 'deleted' ? 'D' : 'M'}\t${x[1]}`).join('\n') + '\n');
        }
        return 0;
      }
      case 'rm': {
        for (const p of positional) {
          const rel = c.abs(p).slice(repo.root.length + 1);
          if (!(rel in g.index)) {
            c.err(`fatal: pathspec '${p}' did not match any files\n`);
            return 128;
          }
          delete g.index[rel];
          if (!flag('--cached')) rmWork(sh, repo, rel);
          c.out(`rm '${rel}'\n`);
        }
        return 0;
      }
      case 'mv': {
        const [a, b] = positional.map((p) => c.abs(p).slice(repo.root.length + 1));
        if (!(a in g.index)) {
          c.err(`fatal: not under version control, source=${a}, destination=${b}\n`);
          return 128;
        }
        g.index[b] = g.index[a];
        delete g.index[a];
        writeWork(sh, repo, b, g.index[b]);
        rmWork(sh, repo, a);
        return 0;
      }
      case 'tag': {
        if (!positional.length) {
          Object.keys(g.tags).sort().forEach((t) => c.out(t + '\n'));
          return 0;
        }
        if (flag('-d')) {
          delete g.tags[val('-d')];
          return 0;
        }
        const t = positional[0];
        if (t in g.tags) {
          c.err(`fatal: tag '${t}' already exists\n`);
          return 128;
        }
        g.tags[t] = resolveRev(g, positional[1]) || headId(g);
        return 0;
      }
      case 'stash': {
        const act = positional[0] || 'push';
        if (act === 'list') {
          g.stash.forEach((s, i) => c.out(`stash@{${i}}: WIP on ${branchName(g)}: ${short(headId(g))} ${s.msg}\n`));
          return 0;
        }
        if (act === 'pop' || act === 'apply') {
          const s = act === 'pop' ? g.stash.shift() : g.stash[0];
          if (!s) {
            c.err('No stash entries found.\n');
            return 1;
          }
          for (const [p, ct] of Object.entries(s.files)) {
            writeWork(sh, repo, p, ct);
          }
          c.out(`${act === 'pop' ? 'Dropped refs/stash@{0}\n' : ''}`);
          return 0;
        }
        const s = statusParts(sh, repo);
        const mods = s.unstaged.filter((x) => x[0] === 'modified').map((x) => x[1]).concat(s.staged.filter((x) => x[0] !== 'deleted').map((x) => x[1]));
        if (!mods.length) {
          c.out('No local changes to save\n');
          return 0;
        }
        const files = {};
        mods.forEach((p) => (files[p] = s.files[p].content));
        g.stash.unshift({ files, msg: (g.commits[headId(g)] || { msg: '' }).msg.split('\n')[0] });
        for (const p of mods) {
          if (p in s.head) writeWork(sh, repo, p, s.head[p]);
          else rmWork(sh, repo, p);
        }
        g.index = Object.assign({}, s.head);
        c.out(`Saved working directory and index state WIP on ${branchName(g)}: ${short(headId(g))} ${(g.commits[headId(g)] || { msg: '' }).msg.split('\n')[0]}\n`);
        return 0;
      }
      case 'ls-files':
        Object.keys(g.index).sort().forEach((p) => c.out(p + '\n'));
        return 0;
      case 'rev-parse': {
        if (flag('--show-toplevel')) return c.out(repo.root + '\n'), 0;
        if (flag('--abbrev-ref')) return c.out((branchName(g) || 'HEAD') + '\n'), 0;
        const id = resolveRev(g, positional[0] || 'HEAD');
        if (!id) return 128;
        c.out((flag('--short') ? short(id) : id) + '\n');
        return 0;
      }
      case 'revert': {
        const id = resolveRev(g, positional[0] || 'HEAD');
        const cm = g.commits[id];
        const cur = treeOf(g, headId(g));
        const par = treeOf(g, cm.parents[0]);
        const nt = Object.assign({}, cur);
        for (const p of new Set([...Object.keys(cm.tree), ...Object.keys(par)])) if (cm.tree[p] !== par[p]) {
          if (p in par) nt[p] = par[p];
          else delete nt[p];
        }
        const idn = identity(sh, repo);
        const commit = { parents: [headId(g)], tree: nt, msg: `Revert "${cm.msg.split('\n')[0]}"\n\nThis reverts commit ${id}.`, author: idn.name || 'Learner', email: idn.email || 'l@example.com', date: Date.now() };
        commit.id = hash40(JSON.stringify(commit) + Math.random());
        g.commits[commit.id] = commit;
        const bn = branchName(g);
        checkoutTree(sh, repo, cur, nt);
        if (bn) g.branches[bn] = commit.id;
        c.out(`[${bn} ${short(commit.id)}] Revert "${cm.msg.split('\n')[0]}"\n`);
        return 0;
      }
      case 'clean': {
        const s = statusParts(sh, repo);
        if (!flag('-f') && !flag('-n')) {
          c.err('fatal: clean.requireForce defaults to true and neither -i, -n, nor -f given; refusing to clean\n');
          return 128;
        }
        s.untracked.forEach((p) => {
          c.out(`${flag('-n') ? 'Would remove' : 'Removing'} ${p}\n`);
          if (!flag('-n')) rmWork(sh, repo, p);
        });
        return 0;
      }
      case 'remote': {
        if (positional[0] === 'add') {
          if (g.remotes[positional[1]]) {
            c.err(`error: remote ${positional[1]} already exists.\n`);
            return 3;
          }
          g.remotes[positional[1]] = positional[2];
          return 0;
        }
        if (positional[0] === 'remove' || positional[0] === 'rm') {
          delete g.remotes[positional[1]];
          return 0;
        }
        for (const [n, u] of Object.entries(g.remotes)) c.out(flag('-v') ? `${n}\t${u} (fetch)\n${n}\t${u} (push)\n` : n + '\n');
        return 0;
      }
      case 'push':
      case 'fetch':
      case 'pull': {
        const rname = positional[0] || 'origin';
        const url = g.remotes[rname];
        if (!url) {
          c.err(sub === 'push' ? "fatal: No configured push destination.\nEither specify the URL from the command-line or configure a remote repository using\n\n    git remote add <name> <url>\n\nand then push using the remote name\n\n    git push <name>\n" : 'fatal: No remote repository specified.  Please, specify either a URL or a\nremote name from which new revisions should be fetched.\n');
          return 128;
        }
        if (/^https?:|^git@/.test(url) && !sh.netUp()) {
          c.err(`fatal: unable to access '${url}/': Could not resolve host: ${(url.split('/')[2] || '').replace(/^git@/, '')}\n`);
          return 128;
        }
        let r = sh.remotes[url];
        const bn = branchName(g);
        if (sub === 'push') {
          if (!r) {
            if (/^https?:\/\/github\.com\/linux-academy\//.test(url)) {
              c.err(`remote: Permission to ${url.replace('https://github.com/', '').replace('.git', '')}.git denied to ${sh.user}.\nfatal: unable to access '${url}/': The requested URL returned error: 403\n`);
              return 128;
            }
            r = sh.remotes[url] = { commits: {}, branches: {}, tags: {} };
          }
          const branch = positional[1] || bn;
          const id = g.branches[branch];
          if (!id) {
            c.err(`error: src refspec ${branch} does not match any\nerror: failed to push some refs to '${url}'\n`);
            return 1;
          }
          const remoteHead = r.branches[branch];
          if (remoteHead && !ancestors(g, id).has(remoteHead) && !flag('--force') && !flag('-f')) {
            c.err(`To ${url}\n ! [rejected]        ${branch} -> ${branch} (fetch first)\nerror: failed to push some refs to '${url}'\nhint: Updates were rejected because the remote contains work that you do not\nhint: have locally. This is usually caused by another repository pushing to\nhint: the same ref. If you want to integrate the remote changes, use\nhint: 'git pull' before pushing again.\n`);
            return 1;
          }
          const n = ancestors(g, id).size;
          Object.assign(r.commits, JSON.parse(JSON.stringify(Object.fromEntries([...ancestors(g, id)].map((x) => [x, g.commits[x]])))));
          r.branches[branch] = id;
          Object.assign(r.tags, g.tags);
          g.remoteRefs = g.remoteRefs || {};
          g.remoteRefs[rname + '/' + branch] = id;
          c.out(`Enumerating objects: ${n * 3}, done.\nCounting objects: 100% (${n * 3}/${n * 3}), done.\nWriting objects: 100% (${n * 3}/${n * 3}), ${n * 214} bytes | ${n * 214}.00 KiB/s, done.\nTotal ${n * 3} (delta 0), reused 0 (delta 0), pack-reused 0\nTo ${url}\n ${remoteHead ? short(remoteHead) + '..' + short(id) : '* [new branch]'}      ${branch} -> ${branch}\n`);
          if (flag('-u') || flag('--set-upstream')) {
            g.tracking = Object.assign(g.tracking || {}, { [branch]: `${rname}/${branch}` });
            c.out(`branch '${branch}' set up to track '${rname}/${branch}'.\n`);
          }
          return 0;
        }
        if (!r) {
          c.err(`fatal: '${url}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n`);
          return 128;
        }
        Object.assign(g.commits, JSON.parse(JSON.stringify(r.commits)));
        g.remoteRefs = g.remoteRefs || {};
        for (const [b, id] of Object.entries(r.branches)) g.remoteRefs[`${rname}/${b}`] = id;
        c.out(sub === 'fetch' ? `From ${url}\n` : '');
        if (sub === 'pull') {
          const up = g.remoteRefs[`${rname}/${bn}`];
          if (!up) {
            c.out('Already up to date.\n');
            return 0;
          }
          return await sh.dispatch(['git', 'merge', `${rname}/${bn}`.replace(/^/, '')], c.io);
        }
        return 0;
      }
    }
    c.err(`git: '${sub}' is not a git command. See 'git --help'.\n`);
    return 1;
  }, { pkg: 'git' });
  // `git init --quiet-internal` helper: silence
  const gitRun = LX.cmds.git.run;
  def('git', async (c, args) => {
    if (args.includes('--quiet-internal')) {
      const a2 = args.filter((x) => x !== '--quiet-internal');
      const c2 = Object.assign({}, c, { out: () => {}, err: () => {} });
      return gitRun(c2, a2);
    }
    return gitRun(c, args);
  }, { pkg: 'git' });
  LX.gitInternals = { findRepo, headId, branchName, treeOf, short, ignorePatterns, ignored, workFiles, writeWork, rmWork, lcsOps, splitLines, unified, diffTrees, statLine, regions, merge3, ancestors, mergeBase, resolveRev, gitConfigGet, identity, checkoutTree, statusParts, commitLine, hash40 };

  /* ---------- rsync ---------- */
  def('rsync', async (c, args) => {
    const sh = c.sh;
    const flags = args.filter((a) => a.startsWith('-'));
    const pos = args.filter((a, i) => !a.startsWith('-') && !['--exclude', '-e'].includes(args[i - 1]));
    const excl = [];
    args.forEach((a, i) => {
      if (a === '--exclude') excl.push(args[i + 1]);
      else if (a.startsWith('--exclude=')) excl.push(a.slice(10));
    });
    const dry = flags.some((f) => f === '-n' || f === '--dry-run' || /^-[a-z]*n[a-z]*$/.test(f));
    const del = flags.includes('--delete');
    const verbose = flags.some((f) => /^-[a-zA-Z]*v/.test(f)) || flags.includes('--verbose');
    const archive = flags.some((f) => /^-[a-zA-Z]*a/.test(f));
    const recursive = archive || flags.some((f) => /^-[a-zA-Z]*r/.test(f));
    if (pos.length < 2) {
      c.err('Usage: rsync [OPTION]... SRC [SRC]... DEST\n');
      return 1;
    }
    const src = pos[0];
    const dst = pos[pos.length - 1];
    const isRem = (s) => /^[^/]*:/.test(s) && !s.startsWith('/') && !s.startsWith('.');
    if (isRem(src) || isRem(dst)) {
      const r = isRem(dst) ? dst : src;
      const host = r.split(':')[0].split('@').pop();
      const ip = sh.resolveHost(host);
      if (!ip) {
        c.err(`ssh: Could not resolve hostname ${host}: ${LX.resolveMsg(sh)}\nrsync: connection unexpectedly closed (0 bytes received so far) [Receiver]\nrsync error: unexplained error (code 255) at io.c(231) [Receiver=3.2.7]\n`);
        return 255;
      }
      const n = sh.fs.lookup(c.abs(isRem(dst) ? src : dst));
      c.out(`sending incremental file list\n${verbose ? (n ? VFS.base(c.abs(src)) + '\n' : '') : ''}\nsent 1,204 bytes  received 35 bytes  826.00 bytes/sec\ntotal size is 987  speedup is 0.80\n`);
      return 0;
    }
    const srcAbs = c.abs(src);
    const sn = sh.fs.lookup(srcAbs);
    if (!sn) {
      c.err(`rsync: [sender] link_stat "${srcAbs}" failed: No such file or directory (2)\nrsync error: some files/attrs were not transferred (see previous errors) (code 23) at main.c(1338) [sender=3.2.7]\n`);
      return 23;
    }
    const contents = src.endsWith('/');
    let dstAbs = c.abs(dst);
    if (!contents && sn.t === 'd') dstAbs += '/' + VFS.base(srcAbs);
    if (sn.t === 'd' && !recursive) {
      c.err(`skipping directory ${src}\n`);
      return 0;
    }
    const list = [];
    const walk = (n, rel) => {
      if (n.t === 'd') {
        list.push({ rel: rel + '/', n });
        for (const k of Object.keys(n.kids).sort()) walk(n.kids[k], rel ? rel + '/' + k : k);
      } else list.push({ rel, n });
    };
    if (sn.t === 'd') {
      list.push({ rel: '.', n: sn, dir: true });
      for (const k of Object.keys(sn.kids).sort()) walk(sn.kids[k], k);
    } else list.push({ rel: VFS.base(srcAbs), n: sn });
    const transferred = [];
    let bytes = 0;
    let total = 0;
    try {
      if (!dry) sh.fs.mkdirp(dstAbs, { owner: sh.eu(), group: sh.users[sh.eu()].groups[0] });
      for (const it of list) {
        if (excl.some((e) => LX.globToRegex(e).test(VFS.base(it.rel.replace(/\/$/, ''))))) continue;
        if (it.dir) continue;
        const target = sn.t === 'd' ? dstAbs + '/' + it.rel : dstAbs.endsWith('/') || (sh.fs.lookup(dstAbs) && sh.fs.lookup(dstAbs).t === 'd') ? dstAbs + '/' + it.rel : dstAbs;
        const ex = sh.fs.lookup(target);
        if (it.rel.endsWith('/')) {
          if (!ex) {
            transferred.push(it.rel);
            if (!dry) sh.fs.mkdirp(target, { owner: sh.eu(), group: sh.users[sh.eu()].groups[0] });
          }
          continue;
        }
        const size = VFS.size(it.n);
        total += size;
        if (ex && VFS.size(ex) === size && (ex.content === it.n.content) && (!archive || Math.abs(ex.mtime - it.n.mtime) < 2000)) continue;
        transferred.push(it.rel);
        bytes += size;
        if (!dry) {
          sh.fs.mkdirp(VFS.dirname(target), { owner: sh.eu(), group: sh.users[sh.eu()].groups[0] });
          const nn = sh.fs.clone(it.n);
          nn.owner = sh.eu();
          nn.group = sh.users[sh.eu()].groups[0];
          if (archive) nn.mtime = it.n.mtime;
          sh.fs.lookup(VFS.dirname(target)).kids[VFS.base(target)] = nn;
        }
      }
      const deleted = [];
      if (del && sn.t === 'd') {
        const dn = sh.fs.lookup(dstAbs);
        const srcNames = new Set(list.map((l) => l.rel.replace(/\/$/, '')));
        const rec = (n, rel) => {
          for (const k of Object.keys(n.kids)) {
            const r = rel ? rel + '/' + k : k;
            if (!srcNames.has(r)) {
              deleted.push(r);
              if (!dry) delete n.kids[k];
            } else if (n.kids[k].t === 'd') rec(n.kids[k], r);
          }
        };
        if (dn) rec(dn, '');
      }
      c.out('sending incremental file list\n');
      if (verbose || dry) {
        if (transferred.length || list.some((l) => l.dir && !sh.fs.lookup(dstAbs + '/x'))) c.out('');
        transferred.forEach((p) => c.out(p + '\n'));
        deleted.forEach((p) => c.out(`deleting ${p}\n`));
      }
      c.out(`\nsent ${(bytes + 120 * transferred.length + 100).toLocaleString('en-US')} bytes  received ${(35 * (transferred.length + 1)).toLocaleString('en-US')} bytes  ${(2100 + bytes).toLocaleString('en-US')}.00 bytes/sec\ntotal size is ${total.toLocaleString('en-US')}  speedup is ${(total / Math.max(1, bytes + 150)).toFixed(2)}${dry ? ' (DRY RUN)' : ''}\n`);
    } catch (e) {
      if (!(e instanceof FsErr)) throw e;
      c.err(`rsync: mkdir "${dstAbs}" failed: ${U.errTxt(e)} (13)\nrsync error: error in file IO (code 11) at main.c(675)\n`);
      return 11;
    }
    return 0;
  });

  /* ---------- extra compressors ---------- */
  const comp = (suffix, label) => async (c, args) => {
    const flags = args.filter((a) => a.startsWith('-'));
    const dec = flags.includes('-d') || flags.includes('--decompress');
    const keep = flags.includes('-k');
    let st = 0;
    for (const f of args.filter((a) => !a.startsWith('-'))) {
      const abs = c.abs(f);
      const n = c.sh.fs.lookup(abs);
      if (!n) {
        c.err(`${label}: ${f}: No such file or directory\n`);
        st = 1;
        continue;
      }
      if (dec) {
        if (!f.endsWith(suffix) || !n.archive || n.archive.kind !== 'gz') {
          c.err(`${label}: ${f}: unknown suffix -- ignored\n`);
          st = 1;
          continue;
        }
        c.sh.fs.lookup(VFS.dirname(abs)).kids[VFS.base(abs.slice(0, -suffix.length))] = c.sh.fs.clone(n.archive.items[0].node);
        if (!keep) c.sh.unlink(abs);
      } else {
        const gn = c.sh.newFile({});
        gn.archive = { kind: 'gz', gz: true, comp: suffix === '.bz2' ? 'bz2' : 'xz', items: [{ path: VFS.base(abs), node: c.sh.fs.clone(n) }] };
        gn.size = Math.max(60, Math.round(VFS.size(n) * 0.35) + 20);
        c.sh.fs.lookup(VFS.dirname(abs)).kids[VFS.base(abs) + suffix] = gn;
        if (!keep) c.sh.unlink(abs);
      }
    }
    return st;
  };
  def('bzip2', comp('.bz2', 'bzip2'));
  def('bunzip2', (c, a) => comp('.bz2', 'bunzip2')(c, ['-d', ...a]));
  def('xz', comp('.xz', 'xz'));
  def('unxz', (c, a) => comp('.xz', 'unxz')(c, ['-d', ...a]));
  def('zcat', async (c, args) => {
    for (const f of args) {
      const n = c.sh.fs.lookup(c.abs(f));
      if (n && n.archive) c.out(n.archive.items[0].node.content || '');
    }
  });
  LX.PKGS = LX.PKGS || {};
  Object.assign(LX.PKGS, { git: { ver: '1:2.43.0-1ubuntu7.1', desc: 'fast, scalable, distributed revision control system', size: 3680, bins: ['git'] } });
  if (!LX.DEFAULT_PKGS.includes('rsync')) LX.DEFAULT_PKGS.push('rsync', 'bzip2', 'xz-utils', 'git');
})();
