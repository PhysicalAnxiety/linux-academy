/* Linux Academy: git, second half. short status, add -A, a real log, show, blame, rebase (also -i), cherry-pick, reflog, shortlog, describe,
   remotes that are folders or SSH hosts (bare repos), clone/push/pull/fetch, remote show, hooks, archive */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS } = LX;
  const U = LX.U;
  const I = LX.gitInternals;
  const { findRepo, headId, branchName, treeOf, short, workFiles, writeWork, rmWork, lcsOps, splitLines, diffTrees, statLine, merge3, ancestors, mergeBase, resolveRev, identity, checkoutTree, statusParts, commitLine, hash40, gitConfigGet } = I;
  const GITHUB_SAMPLE = 'https://github.com/linux-academy/hello-world.git';

  // git must exist on the machines we ssh to
  const origHostShell = LX.hostShell;
  LX.hostShell = function (sh, canon) {
    const T = origHostShell(sh, canon);
    if (!T.installed.has('git')) {
      T.installed.add('git');
      T.addBinary('git');
    }
    return T;
  };

  const orig = LX.cmds.git.run;
  const findBare = (sh) => {
    let cur = sh.cwd;
    for (;;) {
      const n = sh.fs.lookup(cur);
      if (n && n.git && n.git.bare) return { root: cur, dir: n, g: n.git, bare: true };
      if (cur === '/') return null;
      cur = VFS.dirname(cur);
    }
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const dateShort = (ms) => U.strftime('%F', new Date(ms));
  const firstLine = (m) => m.split('\n')[0];

  /* ---------- reflog bookkeeping ---------- */
  const note = (g, id, text) => {
    g.reflog = g.reflog || [];
    g.reflog.unshift({ id, text });
  };

  /* ---------- remotes: canned, folders, ssh hosts ---------- */
  function normalizeUrl(url) {
    if (/github\.com[:/]linux-academy\/hello-world(\.git)?$/.test(url)) return GITHUB_SAMPLE;
    return url;
  }
  /** returns {r: refsObject(commits,branches,tags), kind, bare, node?, sh?} or {err, code} */
  function resolveRemote(c, urlRaw) {
    const sh = c.sh;
    const url = normalizeUrl(urlRaw);
    if (sh.remotes[url]) return { r: sh.remotes[url], kind: 'canned', url };
    let host = null;
    let path = null;
    let m;
    if ((m = /^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?(\/.*)$/.exec(url))) [host, path] = [m[1], m[2]];
    else if ((m = /^(?:[\w.-]+@)?([\w.-]+):(.+)$/.exec(url)) && !url.startsWith('/') && !url.startsWith('.') && !/^[a-z]+:\/\//.test(url)) [host, path] = [m[1], m[2]];
    if (host) {
      const ip = sh.resolveHost(host);
      if (!ip) return { err: `ssh: Could not resolve hostname ${host}: ${LX.resolveMsg ? LX.resolveMsg(sh) : 'Name or service not known'}\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.\n`, code: 128 };
      if (!sh.ownIps().includes(ip) && !sh.netUp()) return { err: `ssh: connect to host ${host} port 22: Network is unreachable\nfatal: Could not read from remote repository.\n`, code: 128 };
      const local = sh.ownIps().includes(ip) || host === 'localhost' || host === sh.hostname;
      const T = local ? sh : LX.hostShell(sh, host);
      const home = (T.users[sh.user] || T.users.learner || { home: '/home/learner' }).home;
      const abs = path.startsWith('/') ? path : VFS.norm(path.replace(/^~\//, ''), home);
      return finishLocal(T, abs, url, true);
    }
    if (/^https?:\/\//.test(url)) {
      if (!sh.netUp()) return { err: `fatal: unable to access '${url}/': Could not resolve host: ${url.split('/')[2]}\n`, code: 128 };
      return { err: `remote: Repository not found.\nfatal: repository '${url}/' not found\n`, code: 128 };
    }
    const p = url.replace(/^file:\/\//, '');
    const abs = p.startsWith('~') ? p.replace(/^~/, sh.users[sh.eu()].home) : VFS.norm(p, sh.cwd);
    return finishLocal(sh, abs, url, false);
  }
  function finishLocal(T, abs, url, viaSsh) {
    let node = T.fs.lookup(abs);
    if (node && node.git && node.git.bare) return { r: node.git, kind: 'bare', url, bare: true, T };
    if (node && node.kids && node.kids['.git'] && node.kids['.git'].git) return { r: node.kids['.git'].git, kind: 'work', url, bare: false, T };
    const q = T.fs.lookup(abs + '.git');
    if (!node && q && q.git && q.git.bare) return { r: q.git, kind: 'bare', url, bare: true, T };
    return { err: `fatal: '${abs}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.\n`, code: 128 };
  }
  const refsOf = (r) => ({ commits: r.commits, branches: r.branches, tags: r.tags });

  /* ---------- tree three-way apply (used by rebase and cherry-pick) ---------- */
  function apply3(baseTree, curTree, theirTree, ours, theirs) {
    const result = {};
    const conflicts = [];
    for (const p of [...new Set([...Object.keys(baseTree), ...Object.keys(curTree), ...Object.keys(theirTree)])].sort()) {
      const b0 = p in baseTree ? baseTree[p] : null;
      const o0 = p in curTree ? curTree[p] : null;
      const t0 = p in theirTree ? theirTree[p] : null;
      if (o0 === t0) { if (o0 !== null) result[p] = o0; }
      else if (o0 === b0) { if (t0 !== null) result[p] = t0; }
      else if (t0 === b0) { if (o0 !== null) result[p] = o0; }
      else if (o0 !== null && t0 !== null) {
        const m = merge3(splitLines(b0 || ''), splitLines(o0), splitLines(t0), ours, theirs);
        result[p] = m.text;
        if (m.conflict) conflicts.push(p);
      } else {
        conflicts.push(p);
        result[p] = o0 !== null ? o0 : t0;
      }
    }
    return { tree: result, conflicts };
  }
  const mkCommit = (g, parents, tree, msg, author, email) => {
    const cm = { parents, tree, msg, author, email, date: Date.now() };
    cm.id = hash40(JSON.stringify([parents, tree, msg, cm.date, Math.random()]));
    g.commits[cm.id] = cm;
    return cm;
  };

  /* ---------- log ---------- */
  const fmtRel = (ms) => {
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return `${s} seconds ago`;
    if (s < 3600) return `${Math.floor(s / 60)} minutes ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
    if (s < 86400 * 60) return `${Math.floor(s / 86400)} days ago`;
    return `${Math.floor(s / (86400 * 30))} months ago`;
  };
  const expandFormat = (fmt, g, cm, dateFmt) => {
    const refs = commitLine(g, cm.id).refs;
    const dt = dateFmt === 'short' ? dateShort(cm.date) : dateFmt === 'iso' ? U.strftime('%F %T %z', new Date(cm.date)) : dateFmt === 'relative' ? fmtRel(cm.date) : U.strftime('%a %b %e %H:%M:%S %Y %z', new Date(cm.date));
    return fmt.replace(/%(H|h|an|ae|ad|ar|as|s|b|B|d|D|cn|ce|cd|P|p|T|n|%|aI|ai)/g, (m, k) => ({ H: cm.id, h: short(cm.id), an: cm.author, ae: cm.email, ad: dt, ar: fmtRel(cm.date), as: dateShort(cm.date), s: firstLine(cm.msg), b: cm.msg.split('\n').slice(1).join('\n').trim(), B: cm.msg, d: refs.length ? ' (' + refs.join(', ') + ')' : '', D: refs.join(', '), cn: cm.author, ce: cm.email, cd: dt, P: cm.parents.join(' '), p: cm.parents.map(short).join(' '), T: '', n: '\n', '%': '%', aI: U.strftime('%FT%T%:z', new Date(cm.date)), ai: U.strftime('%F %T %z', new Date(cm.date)) }[k]));
  };
  const parseSince = (s) => {
    if (!s) return null;
    if (LX.parseDateStr) {
      const t = LX.parseDateStr(s.replace(/\./g, ' '), Date.now());
      if (t !== null && t !== undefined) return t;
    }
    const t2 = new Date(s).getTime();
    return Number.isNaN(t2) ? null : t2;
  };
  function logCmd(c, g, repo, args) {
    const opt = { n: null, oneline: false, graph: false, all: false, stat: false, patch: false, nameOnly: false, nameStatus: false, reverse: false, noMerges: false, merges: false, firstParent: false, date: null, format: null, author: null, grep: null, since: null, until: null };
    const pos = [];
    let dd = -1;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (dd >= 0) { pos.push(a); continue; }
      if (a === '--') { dd = i; continue; }
      if (a === '--oneline') opt.oneline = true;
      else if (a === '--graph') opt.graph = true;
      else if (a === '--all') opt.all = true;
      else if (a === '--stat') opt.stat = true;
      else if (a === '-p' || a === '--patch') opt.patch = true;
      else if (a === '--name-only') opt.nameOnly = true;
      else if (a === '--name-status') opt.nameStatus = true;
      else if (a === '--reverse') opt.reverse = true;
      else if (a === '--no-merges') opt.noMerges = true;
      else if (a === '--merges') opt.merges = true;
      else if (a === '--first-parent') opt.firstParent = true;
      else if (a === '--decorate' || a === '--no-decorate' || a === '--abbrev-commit') continue;
      else if (a === '-n' || a === '--max-count') opt.n = +args[++i];
      else if (/^-\d+$/.test(a)) opt.n = +a.slice(1);
      else if (/^--max-count=/.test(a)) opt.n = +a.split('=')[1];
      else if (/^--author=/.test(a)) opt.author = a.split('=').slice(1).join('=');
      else if (a === '--author') opt.author = args[++i];
      else if (/^--grep=/.test(a)) opt.grep = a.split('=').slice(1).join('=');
      else if (/^--(since|after)=/.test(a)) opt.since = a.split('=').slice(1).join('=');
      else if (/^--(until|before)=/.test(a)) opt.until = a.split('=').slice(1).join('=');
      else if (/^--(since|after)$/.test(a)) opt.since = args[++i];
      else if (/^--date=/.test(a)) opt.date = a.split('=')[1];
      else if (/^--(pretty|format)=/.test(a)) {
        const v = a.split('=').slice(1).join('=');
        if (/^oneline$/.test(v)) opt.oneline = true;
        else if (/^(short|medium|full|fuller)$/.test(v)) continue;
        else opt.format = v.replace(/^(tformat|format):/, '');
      } else if (a.startsWith('-')) continue;
      else pos.push(a);
    }
    let startIds = [];
    let excludeIds = [];
    const revs = dd >= 0 ? pos.slice(0, 0) : pos.filter((p) => !repo.root || !c.sh.fs.lookup(c.abs(p)) || resolveRev(g, p.split('..')[0]));
    const paths = dd >= 0 ? pos.map((p) => c.abs(p).slice(repo.root.length + 1)) : pos.filter((p) => !revs.includes(p)).map((p) => c.abs(p).slice(repo.root.length + 1));
    for (const r of revs) {
      let m;
      if ((m = /^(.*)\.\.(.*)$/.exec(r))) {
        const a = resolveRev(g, m[1] || 'HEAD');
        const b = resolveRev(g, m[2] || 'HEAD');
        if (!a || !b) { c.err(`fatal: ambiguous argument '${r}': unknown revision or path not in the working tree.\n`); return 128; }
        excludeIds.push(a);
        startIds.push(b);
      } else {
        const id = resolveRev(g, r);
        if (!id) { c.err(`fatal: ambiguous argument '${r}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'\n`); return 128; }
        startIds.push(id);
      }
    }
    if (!startIds.length && !opt.all) {
      if (!headId(g)) { c.err(`fatal: your current branch '${branchName(g)}' does not have any commits yet\n`); return 128; }
      startIds.push(headId(g));
    }
    let set;
    if (opt.all) set = new Set(Object.keys(g.commits));
    else {
      set = new Set();
      for (const s of startIds) {
        if (opt.firstParent) {
          let x = s;
          while (x && g.commits[x]) { set.add(x); x = g.commits[x].parents[0]; }
        } else for (const x of ancestors(g, s)) set.add(x);
      }
    }
    for (const e of excludeIds) for (const x of ancestors(g, e)) set.delete(x);
    // newest first, but never a parent before all of its children
    const pending = new Set(set);
    const kidsLeft = {};
    for (const id of set) kidsLeft[id] = 0;
    for (const id of set) for (const p of g.commits[id].parents) if (set.has(p)) kidsLeft[p]++;
    let list = [];
    while (pending.size) {
      const ready = [...pending].filter((id) => kidsLeft[id] === 0).map((id) => g.commits[id]).sort((x, y) => y.date - x.date);
      const cm = ready[0] || g.commits[[...pending][0]];
      pending.delete(cm.id);
      list.push(cm);
      for (const p of cm.parents) if (set.has(p)) kidsLeft[p]--;
    }
    if (opt.noMerges) list = list.filter((cm) => cm.parents.length < 2);
    if (opt.merges) list = list.filter((cm) => cm.parents.length > 1);
    if (opt.author) list = list.filter((cm) => new RegExp(opt.author, 'i').test(cm.author + ' <' + cm.email + '>'));
    if (opt.grep) list = list.filter((cm) => new RegExp(opt.grep, 'i').test(cm.msg));
    const since = parseSince(opt.since);
    const until = parseSince(opt.until);
    if (since !== null) list = list.filter((cm) => cm.date >= since);
    if (until !== null) list = list.filter((cm) => cm.date <= until);
    if (paths.length) {
      list = list.filter((cm) => {
        const par = treeOf(g, cm.parents[0]);
        return paths.some((p) => [...new Set([...Object.keys(cm.tree), ...Object.keys(par)])].some((x) => (x === p || x.startsWith(p + '/')) && cm.tree[x] !== par[x]));
      });
    }
    if (opt.reverse) list.reverse();
    if (opt.n) list = list.slice(0, opt.n);
    // graph lanes
    const lanes = [];
    const gfx = [];
    const graphLine = (cm) => {
      let i = lanes.indexOf(cm.id);
      if (i < 0) { lanes.push(cm.id); i = lanes.length - 1; }
      const merge = cm.parents.length > 1;
      const before = lanes.slice();
      const pad = (cols, width) => cols.join(' ').padEnd(width, ' ');
      const rows = [];
      const after = lanes.slice();
      if (cm.parents.length === 0) after.splice(i, 1);
      else {
        after[i] = cm.parents[0];
        for (const p of cm.parents.slice(1)) if (!after.includes(p)) after.splice(i + 1 + (cm.parents.indexOf(p) - 1), 0, p);
      }
      const colsNow = before.map((_, k) => (k === i ? '*' : '|'));
      const width = Math.max(before.length, after.length) * 2;
      rows.push(pad(colsNow, merge ? width : before.length * 2));
      if (merge) {
        const conn = [];
        for (let k = 0; k < after.length; k++) conn.push(k < i ? '|' : k === i ? '|' : '\\');
        rows.push({ conn: conn.slice(0, after.length).join('').replace(/\s+$/, '') });
      }
      // collapse lanes that point to the same commit
      const seen = {};
      const collapse = [];
      for (let k = 0; k < after.length; k++) {
        if (seen[after[k]] !== undefined && after[k]) collapse.push(k);
        else seen[after[k]] = k;
      }
      lanes.length = 0;
      lanes.push(...after);
      if (collapse.length) {
        const k = collapse[0];
        const conn = lanes.map((_, j) => (j < k ? '|' : j === k ? '/' : ' '));
        rows.push({ conn: conn.map((x) => x.trim()).join('').replace(/\s+$/, '') });
        lanes.splice(k, 1);
      }
      return rows;
    };
    const out = [];
    for (const cm of list) {
      const refs = commitLine(g, cm.id).refs;
      const rows = opt.graph ? graphLine(cm) : null;
      const gp = rows ? rows[0] : '';
      let body;
      if (opt.format !== null) body = expandFormat(opt.format, g, cm, opt.date);
      else if (opt.oneline) body = `\x1b[33m${short(cm.id)}\x1b[0m${refs.length ? ` \x1b[33m(\x1b[0m${refs.join(', ')}\x1b[33m)\x1b[0m` : ''} ${firstLine(cm.msg)}`;
      else {
        const dt = opt.date === 'short' ? dateShort(cm.date) : opt.date === 'iso' ? U.strftime('%F %T %z', new Date(cm.date)) : opt.date === 'relative' ? fmtRel(cm.date) : U.strftime('%a %b %e %H:%M:%S %Y %z', new Date(cm.date));
        body = `\x1b[33mcommit ${cm.id}${refs.length ? ' (' + refs.join(', ') + ')' : ''}\x1b[0m\n${cm.parents.length > 1 ? `Merge: ${cm.parents.map(short).join(' ')}\n` : ''}Author: ${cm.author} <${cm.email}>\nDate:   ${dt}\n\n    ${cm.msg.split('\n').join('\n    ')}\n`;
        const par = treeOf(g, cm.parents[0]);
        if (opt.stat) { const st = statLine(par, cm.tree); body += '\n' + st.rows.join('\n') + (st.rows.length ? '\n' : '') + st.summary + '\n'; }
        if (opt.nameOnly) body += '\n' + [...new Set([...Object.keys(cm.tree), ...Object.keys(par)])].filter((p) => cm.tree[p] !== par[p]).sort().join('\n') + '\n';
        if (opt.nameStatus) body += '\n' + [...new Set([...Object.keys(cm.tree), ...Object.keys(par)])].filter((p) => cm.tree[p] !== par[p]).sort().map((p) => `${!(p in par) ? 'A' : !(p in cm.tree) ? 'D' : 'M'}\t${p}`).join('\n') + '\n';
        if (opt.patch) body += '\n' + diffTrees(par, cm.tree);
        body += '\n';
      }
      if (opt.graph) {
        const lines = body.replace(/\n$/, '').split('\n');
        out.push(gp.replace(/\s+$/, '') + (cm.parents.length > 1 ? '  ' : '') + (lines[0] ? ' ' : '') + lines[0]);
        const cont = ' '.repeat(Math.max(2, gp.length - gp.replace(/\s+$/, '').length)) ;
        const bar = lines.length > 1 ? gp.replace(/\*/g, '|').replace(/\s+$/, '') : '';
        for (const l of lines.slice(1)) out.push(bar + ' ' + l);
        for (const r of rows.slice(1)) out.push(r.conn);
      } else out.push(opt.oneline || opt.format !== null ? body : body.replace(/\n$/, '') + (opt.oneline ? '' : ''));
    }
    if (list.length) c.out(out.join('\n') + '\n');
    return 0;
  }

  /* ---------- blame ---------- */
  function blame(c, g, repo, args) {
    const file = args.filter((a) => !a.startsWith('-')).pop();
    if (!file) { c.err('usage: git blame [<options>] [<rev-opts>] [<rev>] [--] <file>\n'); return 129; }
    const rel = c.abs(file).slice(repo.root.length + 1);
    const head = headId(g);
    if (!head || !(rel in treeOf(g, head))) { c.err(`fatal: no such path ${file} in HEAD\n`); return 128; }
    const chain = [];
    let x = head;
    while (x && g.commits[x]) { chain.unshift(g.commits[x]); x = g.commits[x].parents[0]; }
    let owner = [];
    let prev = [];
    for (const cm of chain) {
      if (!(rel in cm.tree)) { prev = []; owner = []; continue; }
      const cur = splitLines(cm.tree[rel]);
      const ops = lcsOps(prev, cur);
      const next = [];
      let pi = 0;
      for (const [t] of ops) {
        if (t === ' ') next.push(owner[pi++]);
        else if (t === '-') pi++;
        else next.push(cm);
      }
      prev = cur;
      owner = next;
    }
    const lines = splitLines(treeOf(g, head)[rel]);
    const nameW = Math.max(...owner.map((o) => o.author.length));
    const root = chain[0];
    owner.forEach((cm, i) => {
      const h = cm === root ? '^' + cm.id.slice(0, 7) : cm.id.slice(0, 8);
      c.out(`${h} (${cm.author.padEnd(nameW)} ${U.strftime('%F %T %z', new Date(cm.date))} ${String(i + 1).padStart(String(lines.length).length)}) ${lines[i]}\n`);
    });
    return 0;
  }

  /* ---------- rebase ---------- */
  function finishRebase(sh, repo, c, g, st) {
    const branch = st.branch;
    g.branches[branch] = st.tip;
    g.HEAD = 'ref: ' + branch;
    g.rebase = null;
    note(g, st.tip, `rebase (finish): returning to refs/heads/${branch}`);
  }
  async function rebaseReplay(c, repo, g, st) {
    const sh = c.sh;
    while (st.todo.length) {
      const cm = st.todo[0];
      const par = treeOf(g, cm.parents[0]);
      const cur = treeOf(g, st.tip);
      const res = apply3(par, cur, cm.tree, 'HEAD', `${short(cm.id)} (${firstLine(cm.msg)})`);
      for (const p of res.conflicts) if (cur[p] !== undefined || res.tree[p] !== undefined) c.out(`Auto-merging ${p}\nCONFLICT (content): Merge conflict in ${p}\n`);
      if (res.conflicts.length) {
        for (const [p, ct] of Object.entries(res.tree)) writeWork(sh, repo, p, ct);
        for (const p of Object.keys(cur)) if (!(p in res.tree)) rmWork(sh, repo, p);
        g.index = Object.assign({}, cur);
        for (const p of Object.keys(res.tree)) if (!res.conflicts.includes(p)) g.index[p] = res.tree[p];
        g.merge = { branch: short(cm.id), theirs: cm.id, conflicts: res.conflicts.slice() };
        st.conflicts = res.conflicts;
        st.cur = cm;
        st.curTree = res.tree;
        g.rebase = st;
        c.err(`error: could not apply ${short(cm.id)}... ${firstLine(cm.msg)}\nhint: Resolve all conflicts manually, mark them as resolved with\nhint: "git add/rm <conflicted_files>", then run "git rebase --continue".\nhint: You can instead skip this commit: run "git rebase --skip".\nhint: To abort and get back to the state before "git rebase", run "git rebase --abort".\nCould not apply ${short(cm.id)}... ${firstLine(cm.msg)}\n`);
        return 1;
      }
      st.todo.shift();
      if (st.squashNext && st.squashNext[cm.id]) {
        // squash/fixup into the previous rewritten commit
        const prevC = g.commits[st.tip];
        const mode = st.squashNext[cm.id];
        const newMsg = mode === 'fixup' ? prevC.msg : prevC.msg + '\n\n' + cm.msg;
        const nc = mkCommit(g, prevC.parents.slice(), res.tree, st.squashMsg && st.squashMsg[cm.id] !== undefined ? st.squashMsg[cm.id] : newMsg, prevC.author, prevC.email);
        st.tip = nc.id;
      } else {
        const nm = st.reword && st.reword[cm.id] !== undefined ? st.reword[cm.id] : cm.msg;
        const nc = mkCommit(g, [st.tip], res.tree, nm, cm.author, cm.email);
        st.tip = nc.id;
      }
      g.HEAD = st.tip;
    }
    const finalTree = treeOf(g, st.tip);
    const oldTree = Object.fromEntries(Object.entries(workFiles(sh, repo).files).map(([k, v]) => [k, v.content]));
    checkoutTree(sh, repo, oldTree, finalTree);
    finishRebase(sh, repo, c, g, st);
    c.out(`Successfully rebased and updated refs/heads/${st.branch}.\n`);
    return 0;
  }
  async function rebaseCmd(c, g, repo, args) {
    const sh = c.sh;
    if (args.includes('--abort')) {
      if (!g.rebase) { c.err('fatal: No rebase in progress?\n'); return 128; }
      const st = g.rebase;
      g.HEAD = 'ref: ' + st.branch;
      checkoutTree(sh, repo, Object.fromEntries(Object.entries(workFiles(sh, repo).files).map(([k, v]) => [k, v.content])), treeOf(g, g.branches[st.branch]));
      g.rebase = null;
      g.merge = null;
      return 0;
    }
    if (args.includes('--continue') || args.includes('--skip')) {
      if (!g.rebase) { c.err('fatal: No rebase in progress?\n'); return 128; }
      const st = g.rebase;
      if (args.includes('--skip')) {
        st.todo.shift();
        g.merge = null;
        checkoutTree(sh, repo, {}, treeOf(g, st.tip));
        g.rebase = null;
      } else {
        if (g.merge && g.merge.conflicts.length) {
          c.err(`${g.merge.conflicts[0]}: needs merge\nYou must edit all merge conflicts and then\nmark them as resolved using git add\n`);
          return 1;
        }
        const unresolved = st.conflicts.filter((p) => { const wf = workFiles(sh, repo).files[p]; return wf && /^<<<<<<< /m.test(wf.content); });
        if (unresolved.length) { c.err(`${unresolved[0]}: needs merge\nerror: you must edit all merge conflicts and then\nmark them as resolved using git add\n`); return 1; }
        g.merge = null;
        const cm = st.cur;
        const nc = mkCommit(g, [st.tip], Object.assign({}, g.index), cm.msg, cm.author, cm.email);
        st.tip = nc.id;
        g.HEAD = nc.id;
        st.todo.shift();
        g.rebase = null;
      }
      return await rebaseReplay(c, repo, g, st);
    }
    if (g.rebase) { c.err('fatal: It seems that there is already a rebase-merge directory, and\nI wonder if you are in the middle of another rebase.  If that is the\ncase, please try\n\tgit rebase (--continue | --abort | --skip)\n'); return 128; }
    const interactive = args.includes('-i') || args.includes('--interactive');
    const pos = args.filter((a) => !a.startsWith('-'));
    const bn = branchName(g);
    if (!bn) { c.err('fatal: You are not currently on a branch.\n'); return 128; }
    const s = statusParts(sh, repo);
    if (s.unstaged.length) { c.err('error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.\n'); return 1; }
    if (s.staged.length) { c.err('error: cannot rebase: Your index contains uncommitted changes.\nerror: Please commit or stash them.\n'); return 1; }
    const head = headId(g);
    let upstream;
    if (interactive) {
      const u = pos[0] || 'HEAD~1';
      upstream = resolveRev(g, u);
    } else upstream = resolveRev(g, pos[0] || (g.tracking && g.tracking[bn]) || '');
    if (!upstream) { c.err(`fatal: invalid upstream '${pos[0] || ''}'\n`); return 128; }
    const base = mergeBase(g, head, upstream);
    // commits to replay, oldest first (first-parent chain, merges skipped)
    const chain = [];
    let x = head;
    while (x && x !== base && g.commits[x]) { if (g.commits[x].parents.length < 2) chain.unshift(g.commits[x]); x = g.commits[x].parents[0]; }
    if (!interactive) {
      if (ancestors(g, head).has(upstream) && base === upstream) { c.out(`Current branch ${bn} is up to date.\n`); return 0; }
      if (base === head) {
        checkoutTree(sh, repo, treeOf(g, head), treeOf(g, upstream));
        g.branches[bn] = upstream;
        note(g, upstream, `rebase (finish): returning to refs/heads/${bn}`);
        c.out(`Successfully rebased and updated refs/heads/${bn}.\n`);
        return 0;
      }
    }
    let todo = chain;
    let squashNext = {};
    let reword = {};
    if (interactive) {
      const lines = chain.map((cm) => `pick ${short(cm.id)} ${firstLine(cm.msg)}`);
      const text = lines.join('\n') + '\n\n# Rebase onto ' + short(upstream) + ' (' + chain.length + ' command' + (chain.length === 1 ? '' : 's') + ')\n#\n# Commands:\n# p, pick <commit> = use commit\n# r, reword <commit> = use commit, but edit the commit message\n# s, squash <commit> = use commit, but meld into previous commit\n# f, fixup <commit> = like "squash", but discard this commit\'s log message\n# d, drop <commit> = remove commit\n#\n# If you remove a line here THAT COMMIT WILL BE LOST.\n';
      let edited = text;
      const seqEd = sh.getVar('GIT_SEQUENCE_EDITOR');
      if (seqEd) {
        const tf = '/tmp/git-rebase-todo';
        sh.writeFile(tf, text, false);
        await sh.run(`${seqEd} ${tf}`, { stdin: '', stdout: (t) => c.out(t), stderr: (t) => c.err(t), tty: false });
        edited = LX.cat(sh, tf);
      } else if (sh.hooks && sh.hooks.edit) {
        const r = await sh.hooks.edit({ name: 'nano', path: '.git/rebase-merge/git-rebase-todo', content: text, readonly: false });
        if (r === null || r === undefined) { c.err('error: there was a problem with the editor\n'); return 1; }
        edited = r;
      } else if (sh.gitTodo) edited = sh.gitTodo(text);
      const plan = edited.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => /^(\w+)\s+([0-9a-f]+)/.exec(l)).filter(Boolean);
      if (!plan.length) { c.out('Nothing to do\n'); return 0; }
      todo = [];
      for (const [, cmd, id] of plan) {
        const cm = chain.find((x) => x.id.startsWith(id));
        if (!cm) { c.err(`error: invalid line: ${cmd} ${id}\n`); return 1; }
        const k = { p: 'pick', pick: 'pick', r: 'reword', reword: 'reword', s: 'squash', squash: 'squash', f: 'fixup', fixup: 'fixup', d: 'drop', drop: 'drop', e: 'pick', edit: 'pick' }[cmd];
        if (!k) { c.err(`error: invalid command '${cmd}'\n`); return 1; }
        if (k === 'drop') continue;
        if ((k === 'squash' || k === 'fixup') && !todo.length) { c.err(`error: cannot '${k}' without a previous commit\n`); return 1; }
        if (k === 'squash' || k === 'fixup') squashNext[cm.id] = k;
        if (k === 'reword' && sh.hooks && sh.hooks.edit) {
          const r = await sh.hooks.edit({ name: 'nano', path: '.git/COMMIT_EDITMSG', content: cm.msg + '\n\n# Please enter the commit message for your changes.\n', readonly: false });
          reword[cm.id] = (r || cm.msg).split('\n').filter((l) => !l.startsWith('#')).join('\n').trim();
        }
        todo.push(cm);
      }
    }
    note(g, head, `rebase (start): checkout ${pos[0] || 'upstream'}`);
    const st = { branch: bn, tip: upstream, todo: todo.slice(), orig: head, squashNext, reword, onto: upstream };
    g.HEAD = upstream;
    // squashing needs the previous commit to exist when the squashed one is replayed: handled in rebaseReplay
    return await rebaseReplay(c, repo, g, st);
  }

  /* ---------- cherry-pick ---------- */
  async function cherryPick(c, g, repo, args) {
    const sh = c.sh;
    if (args.includes('--abort')) {
      if (!g.cherry) { c.err('error: no cherry-pick or revert in progress\n'); return 128; }
      checkoutTree(sh, repo, Object.fromEntries(Object.entries(workFiles(sh, repo).files).map(([k, v]) => [k, v.content])), treeOf(g, headId(g)));
      g.cherry = null;
      g.merge = null;
      return 0;
    }
    const bn = branchName(g);
    const finish = (cm, tree) => {
      const nc = mkCommit(g, [headId(g)], tree, cm.msg, cm.author, cm.email);
      if (bn) g.branches[bn] = nc.id;
      else g.HEAD = nc.id;
      note(g, nc.id, `cherry-pick: ${firstLine(cm.msg)}`);
      return nc;
    };
    if (args.includes('--continue')) {
      if (!g.cherry) { c.err('error: no cherry-pick or revert in progress\n'); return 128; }
      const unresolved = g.merge ? g.merge.conflicts : [];
      if (unresolved.length) { c.err(`error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nfatal: cherry-pick failed\n`); return 128; }
      g.merge = null;
      const cm = g.cherry.cm;
      const nc = finish(cm, Object.assign({}, g.index));
      g.cherry = null;
      c.out(`[${bn || 'detached HEAD'} ${short(nc.id)}] ${firstLine(cm.msg)}\n Date: ${U.strftime('%a %b %e %H:%M:%S %Y %z', new Date(cm.date))}\n`);
      return 0;
    }
    const revs = args.filter((a) => !a.startsWith('-'));
    if (!revs.length) { c.err('fatal: You must specify a commit to cherry-pick\n'); return 128; }
    const s = statusParts(sh, repo);
    if (s.unstaged.length || s.staged.length) { c.err('error: your local changes would be overwritten by cherry-pick.\nhint: commit your changes or stash them to proceed.\nfatal: cherry-pick failed\n'); return 128; }
    for (const r of revs) {
      const id = resolveRev(g, r);
      if (!id) { c.err(`fatal: bad revision '${r}'\n`); return 128; }
      const cm = g.commits[id];
      const cur = treeOf(g, headId(g));
      const res = apply3(treeOf(g, cm.parents[0]), cur, cm.tree, 'HEAD', `${short(id)} (${firstLine(cm.msg)})`);
      for (const [p, ct] of Object.entries(res.tree)) writeWork(sh, repo, p, ct);
      for (const p of Object.keys(cur)) if (!(p in res.tree)) rmWork(sh, repo, p);
      if (res.conflicts.length) {
        g.index = Object.assign({}, cur);
        for (const p of Object.keys(res.tree)) if (!res.conflicts.includes(p)) g.index[p] = res.tree[p];
        g.cherry = { cm, conflicts: res.conflicts };
        g.merge = { branch: short(cm.id), theirs: cm.id, conflicts: res.conflicts.slice() };
        res.conflicts.forEach((p) => c.out(`Auto-merging ${p}\nCONFLICT (content): Merge conflict in ${p}\n`));
        c.err(`error: could not apply ${short(id)}... ${firstLine(cm.msg)}\nhint: After resolving the conflicts, mark them with\nhint: "git add/rm <pathspec>", then run\nhint: "git cherry-pick --continue".\nhint: You can instead skip this commit with "git cherry-pick --skip".\nhint: To abort and get back to the state before "git cherry-pick",\nhint: run "git cherry-pick --abort".\n`);
        return 1;
      }
      g.index = Object.assign({}, res.tree);
      const nc = finish(cm, res.tree);
      const st = statLine(cur, res.tree);
      c.out(`[${bn || 'detached HEAD'} ${short(nc.id)}] ${firstLine(cm.msg)}\n Author: ${cm.author} <${cm.email}>\n Date: ${U.strftime('%a %b %e %H:%M:%S %Y %z', new Date(cm.date))}\n${st.summary}\n`);
    }
    return 0;
  }

  /* ---------- the command ---------- */
  def('git', async (c, args0) => {
    const sh = c.sh;
    let args = args0.slice();
    // global options: -C path, -c k=v
    let prevCwd = null;
    while (args[0] && (args[0] === '-C' || args[0] === '-c' || /^--no-pager$/.test(args[0]))) {
      if (args[0] === '-C') { prevCwd = prevCwd || sh.cwd; sh.cwd = c.abs(args[1]); args = args.slice(2); }
      else if (args[0] === '-c') args = args.slice(2);
      else args = args.slice(1);
    }
    try {
      return await run(c, args);
    } finally {
      if (prevCwd) sh.cwd = prevCwd;
    }
  }, { pkg: 'git' });

  async function run(c, args) {
    const sh = c.sh;
    if (args[0] === 'checkout' || args[0] === 'switch') args = args.map((a) => (/^-q[bBc]$/.test(a) ? '-' + a[2] : a)).filter((a) => a !== '-q' && a !== '--quiet');
    if (args.some((a) => /@\{\d+\}/.test(a))) {
      const r0 = findRepo(sh);
      if (r0 && r0.g.reflog) args = args.map((a) => a.replace(/^(HEAD)?@\{(\d+)\}/, (m, h, n) => (r0.g.reflog[+n] ? r0.g.reflog[+n].id : m)));
    }
    const sub = args[0];
    if (['clone', 'push', 'pull', 'fetch'].includes(sub) && (args.includes('-q') || args.includes('--quiet'))) {
      const keep = (t) => t.split('\n').filter((l) => /^(fatal|error|hint|warning| ?!|remote: error|CONFLICT|Auto-merging)/.test(l)).map((l) => l + '\n').join('');
      const oc = c;
      c = Object.assign({}, oc, { out: (t) => { const k = keep(t); if (k) oc.out(k); }, err: (t) => { const k = keep(t); if (k) oc.err(k); } });
      args = args.filter((a) => a !== '-q' && a !== '--quiet');
      return run(c, args);
    }
    const rest = args.slice(1);
    const has = (f) => rest.includes(f);
    const repo = sub && !['init', 'clone', 'config', '--version', 'help'].includes(sub) ? findRepo(sh) || findBare(sh) : null;
    const g = repo && repo.g;
    const needRepo = () => {
      c.err('fatal: not a git repository (or any of the parent directories): .git\n');
      return 128;
    };
    // record HEAD movement in the reflog after commands that move it
    const tracked = ['commit', 'checkout', 'switch', 'merge', 'reset', 'revert', 'pull', 'stash'];
    const before = g ? headId(g) : null;
    const beforeBranch = g ? branchName(g) : null;
    const done = (st) => {
      if (g && tracked.includes(sub)) {
        const after = headId(g);
        if (after && after !== before) {
          const cm = g.commits[after];
          const text = sub === 'commit' ? `commit${before ? '' : ' (initial)'}${rest.includes('--amend') ? ' (amend)' : ''}: ${firstLine(cm.msg)}` : sub === 'checkout' || sub === 'switch' ? `checkout: moving from ${beforeBranch || short(before)} to ${branchName(g) || short(after)}` : sub === 'merge' || sub === 'pull' ? (cm.parents.length > 1 ? `${sub}: Merge made by the 'ort' strategy.` : `${sub}: Fast-forward`) : sub === 'reset' ? `reset: moving to ${rest.find((a) => !a.startsWith('-')) || 'HEAD'}` : `${sub}: ${firstLine(cm.msg)}`;
          note(g, after, text);
        } else if (after && sub === 'checkout' && beforeBranch !== branchName(g)) note(g, after, `checkout: moving from ${beforeBranch} to ${branchName(g)}`);
      }
      return st;
    };

    /* ----- subcommands handled here ----- */
    if (sub === 'status' && g && (has('-s') || has('--short') || has('--porcelain') || has('-sb') || has('-bs') || has('-b'))) {
      const s = statusParts(sh, repo);
      const bn = branchName(g);
      if (has('-b') || has('-sb') || has('-bs') || has('--branch')) {
        let extra = '';
        if (g.tracking && g.tracking[bn] && g.remoteRefs) {
          const up = g.remoteRefs[g.tracking[bn]];
          const mine = g.branches[bn];
          if (up && mine) {
            const ahead = [...ancestors(g, mine)].filter((x) => !ancestors(g, up).has(x)).length;
            const behind = [...ancestors(g, up)].filter((x) => !ancestors(g, mine).has(x)).length;
            extra = '...' + g.tracking[bn] + (ahead || behind ? ` [${[ahead ? 'ahead ' + ahead : '', behind ? 'behind ' + behind : ''].filter(Boolean).join(', ')}]` : '');
          }
        }
        c.out(`## ${bn || 'HEAD (no branch)'}${!headId(g) ? ' No commits yet on ' + bn : ''}${extra}\n`);
      }
      const rows = new Map();
      const code = { 'new file': 'A', modified: 'M', deleted: 'D' };
      s.staged.forEach(([k, p]) => rows.set(p, [code[k], ' ']));
      s.unstaged.forEach(([k, p]) => { const r = rows.get(p) || [' ', ' ']; r[1] = code[k]; rows.set(p, r); });
      [...rows.keys()].sort().forEach((p) => c.out(`${rows.get(p).join('')} ${p}\n`));
      s.untracked.forEach((p) => c.out(`?? ${p}\n`));
      return 0;
    }
    if (sub === 'status' && g && g.rebase) {
      await orig(Object.assign({}, c, { out: (t) => c.out(t.replace(/\(fix conflicts and run "git commit"\)\n\s+\(use "git merge --abort" to abort the merge\)\n/, '(fix conflicts and run "git rebase --continue")\n').replace(/^(HEAD detached at [0-9a-f]+\n)/, `$1You are currently rebasing branch '${g.rebase.branch}' on '${short(g.rebase.onto)}'.\n  (fix conflicts and then run "git rebase --continue")\n  (use "git rebase --skip" to skip this patch)\n  (use "git rebase --abort" to check out the original branch)\n`)) }), args);
      return 0;
    }
    if (sub === 'add' && g && (has('-A') || has('--all') || has('-u') || has('--update')) && !rest.some((a) => !a.startsWith('-'))) {
      const { files } = workFiles(sh, repo);
      if (has('-u') || has('--update')) {
        for (const p of Object.keys(g.index)) {
          if (!(p in files)) delete g.index[p];
          else g.index[p] = files[p].content;
        }
        return 0;
      }
      return orig(c, ['add', '-A', '.']);
    }
    if (sub === 'init' && (has('-q') || has('--quiet'))) return orig(Object.assign({}, c, { out: () => {}, err: () => {} }), args);
    if (sub === 'stash' && g) {
      const act = rest[0] && !rest[0].startsWith('-') ? rest[0] : 'push';
      const label = (e) => (e.custom ? `On ${e.branch}: ${e.custom}` : `WIP on ${e.branch || branchName(g)}: ${short(e.base || headId(g))} ${e.msg}`);
      const idxArg = rest.find((a) => /^stash@\{\d+\}$/.test(a));
      const ix = idxArg ? +/\d+/.exec(idxArg)[0] : 0;
      if (act === 'list') { g.stash.forEach((e, i) => c.out(`stash@{${i}}: ${label(e)}\n`)); return 0; }
      if (act === 'clear') { g.stash.length = 0; return 0; }
      if (act === 'drop') {
        if (!g.stash[ix]) { c.err(`error: ${idxArg || 'stash@{0}'} is not a valid reference\n`); return 1; }
        g.stash.splice(ix, 1);
        c.out(`Dropped stash@{${ix}} (${hash40('stash' + ix + Date.now())})\n`);
        return 0;
      }
      if (act === 'show') {
        const e = g.stash[ix];
        if (!e) { c.err('error: No stash entries found.\n'); return 1; }
        const head = treeOf(g, headId(g));
        const after = Object.assign({}, head, e.files);
        if (has('-p') || has('--patch')) c.out(diffTrees(head, after));
        else { const st = statLine(head, after); c.out(st.rows.join('\n') + '\n' + st.summary + '\n'); }
        return 0;
      }
      if (act === 'pop' || act === 'apply') {
        const e = g.stash[ix];
        if (!e) { c.err('No stash entries found.\n'); return 1; }
        const cur = workFiles(sh, repo).files;
        const head = treeOf(g, headId(g));
        const conflicts = Object.keys(e.files).filter((p) => cur[p] && p in head && cur[p].content !== head[p] && cur[p].content !== e.files[p]);
        if (conflicts.length) { c.err(`error: Your local changes to the following files would be overwritten by merge:\n\t${conflicts.join('\n\t')}\nPlease commit your changes or stash them before you merge.\nAborting\n`); return 1; }
        for (const [p, ct] of Object.entries(e.files)) writeWork(sh, repo, p, ct);
        await orig(c, ['status']);
        if (act === 'pop') { g.stash.splice(ix, 1); c.out(`Dropped stash@{${ix}} (${hash40('stash' + ix + Date.now())})\n`); }
        return 0;
      }
      if (act === 'branch') {
        const nb = rest[1];
        const e = g.stash[0];
        if (!nb || !e) { c.err('error: No stash entries found.\n'); return 1; }
        g.branches[nb] = headId(g);
        g.HEAD = 'ref: ' + nb;
        for (const [p, ct] of Object.entries(e.files)) writeWork(sh, repo, p, ct);
        g.stash.shift();
        c.out(`Switched to a new branch '${nb}'\n`);
        return 0;
      }
      // push / save
      const mi = rest.findIndex((a) => a === '-m' || a === '-m' || a === 'save');
      const custom = rest.includes('-m') ? rest[rest.indexOf('-m') + 1] : act === 'save' ? rest.slice(1).filter((a) => !a.startsWith('-')).join(' ') : '';
      const withU = has('-u') || has('--include-untracked');
      const bn = branchName(g);
      const sBefore = statusParts(sh, repo);
      const extra = withU ? sBefore.untracked.filter((p) => !p.endsWith('/')) : [];
      for (const p of extra) { g.index[p] = workFiles(sh, repo).files[p].content; }
      const nBefore = g.stash.length;
      const buf = [];
      const r = await orig(Object.assign({}, c, { out: (t) => buf.push(t) }), ['stash']);
      if (g.stash.length > nBefore) {
        const e = g.stash[0];
        e.branch = bn;
        e.base = headId(g);
        if (custom) e.custom = custom;
        for (const p of extra) { e.files[p] = e.files[p] !== undefined ? e.files[p] : g.index[p]; delete g.index[p]; rmWork(sh, repo, p); }
        c.out(`Saved working directory and index state ${label(e)}\n`);
      } else c.out(buf.join(''));
      return r;
    }
    if (g && sub === 'revert' && !has('--abort') && !has('--continue')) {
      const bad = rest.filter((a) => !a.startsWith('-')).find((a) => !resolveRev(g, a));
      if (bad) { c.err(`fatal: bad revision '${bad}'\n`); return 128; }
    }
    if (g && sub === 'reset') {
      const bad = rest.filter((a) => !a.startsWith('-') && /[~^@]|^HEAD$/.test(a)).find((a) => !resolveRev(g, a));
      if (bad) { c.err(`fatal: ambiguous argument '${bad}': unknown revision or path not in the working tree.\n`); return 128; }
    }
    if (sub === 'log') {
      if (!g) return needRepo();
      return logCmd(c, g, repo, rest);
    }
    if (sub === 'show' && g) {
      const revArg = rest.find((a) => !a.startsWith('-')) || 'HEAD';
      const m = /^(.+?):(.+)$/.exec(revArg);
      if (m) {
        const id = resolveRev(g, m[1]);
        const t = id && treeOf(g, id)[m[2]];
        if (t === undefined) { c.err(`fatal: path '${m[2]}' does not exist in '${m[1]}'\n`); return 128; }
        c.out(t);
        return 0;
      }
      const id = resolveRev(g, revArg);
      if (!id) { c.err(`fatal: ambiguous argument '${revArg}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'\n`); return 128; }
      const tagOnly = revArg in g.tags && g.tagMsgs && g.tagMsgs[revArg];
      if (has('--stat') || has('--name-only') || has('--name-status') || has('-s') || has('--no-patch') || has('--oneline') || has('--pretty=oneline') || rest.some((a) => /^--(pretty|format)=/.test(a))) {
        const a2 = ['-1', id].concat(rest.filter((a) => a !== revArg));
        return logCmd(c, g, repo, has('--no-patch') || has('-s') ? a2 : a2);
      }
      if (tagOnly) { const tm = g.tagMsgs[revArg]; c.out(`tag ${revArg}\nTagger: ${tm.tagger}\nDate:   ${U.strftime('%a %b %e %H:%M:%S %Y %z', new Date(tm.date))}\n\n${tm.msg}\n\n`); }
      return orig(c, ['show', id]);
    }
    if (repo && repo.bare && !['log', 'branch', 'show', 'tag', 'shortlog', 'describe', 'rev-parse', 'reflog', 'remote', 'config', 'stash'].includes(sub)) {
      c.err('fatal: this operation must be run in a work tree\n');
      return 128;
    }
    if (sub === 'blame') {
      if (!g) return needRepo();
      return blame(c, g, repo, rest);
    }
    if (sub === 'rebase') {
      if (!g) return needRepo();
      const r = await rebaseCmd(c, g, repo, rest);
      return r;
    }
    if (sub === 'cherry-pick') {
      if (!g) return needRepo();
      return done(await cherryPick(c, g, repo, rest));
    }
    if (sub === 'reflog') {
      if (!g) return needRepo();
      const list = g.reflog || [];
      const n = (rest.find((a) => /^-\d+$/.test(a)) || '').slice(1);
      list.slice(0, n ? +n : undefined).forEach((e, i) => c.out(`\x1b[33m${short(e.id)}\x1b[0m HEAD@{${i}}: ${e.text}\n`));
      return 0;
    }
    if (sub === 'shortlog') {
      if (!g) return needRepo();
      const counts = {};
      const ids = headId(g) ? [...ancestors(g, headId(g))] : [];
      ids.forEach((id) => { const cm = g.commits[id]; counts[cm.author] = (counts[cm.author] || []).concat(firstLine(cm.msg)); });
      const entries = Object.entries(counts).sort((a, b) => (rest.some((x) => /n/.test(x) && x.startsWith('-')) ? b[1].length - a[1].length : a[0].localeCompare(b[0])));
      if (rest.some((x) => /^-[a-z]*s/.test(x))) entries.forEach(([n, l]) => c.out(`${String(l.length).padStart(6)}\t${n}\n`));
      else entries.forEach(([n, l]) => c.out(`${n} (${l.length}):\n${l.map((x) => '      ' + x).join('\n')}\n\n`));
      return 0;
    }
    if (sub === 'describe') {
      if (!g) return needRepo();
      let x = headId(g);
      let n = 0;
      const byId = {};
      for (const [t, id] of Object.entries(g.tags)) byId[id] = t;
      while (x && !(x in byId)) { x = g.commits[x].parents[0]; n++; }
      if (!x) { c.err('fatal: No names found, cannot describe anything.\n'); return 128; }
      c.out(n === 0 ? byId[x] + '\n' : `${byId[x]}-${n}-g${short(headId(g))}\n`);
      return 0;
    }
    if (sub === 'tag' && g && (has('-a') || has('-m') || has('-l') || has('-n') || has('--list'))) {
      if (has('-l') || has('--list') || has('-n')) {
        const pat = rest.find((a) => !a.startsWith('-'));
        const re = pat ? LX.globToRegex(pat) : null;
        Object.keys(g.tags).sort().filter((t) => !re || re.test(t)).forEach((t) => c.out(has('-n') ? `${t.padEnd(15)} ${firstLine(g.commits[g.tags[t]].msg)}\n` : t + '\n'));
        return 0;
      }
      const mi = rest.indexOf('-m');
      const name = rest.find((a, i) => !a.startsWith('-') && rest[i - 1] !== '-m');
      if (!name) { c.err('fatal: tag name required\n'); return 128; }
      if (name in g.tags) { c.err(`fatal: tag '${name}' already exists\n`); return 128; }
      const idn = identity(sh, repo);
      const tgt = rest.filter((a, i) => !a.startsWith('-') && rest[i - 1] !== '-m' && a !== name)[0];
      g.tags[name] = (tgt && resolveRev(g, tgt)) || headId(g);
      g.tagMsgs = g.tagMsgs || {};
      g.tagMsgs[name] = { msg: mi >= 0 ? rest[mi + 1] : '', tagger: `${idn.name || 'Learner'} <${idn.email || 'l@example.com'}>`, date: Date.now() };
      return 0;
    }
    if (sub === 'branch' && g && (repo.bare || has('-vv') || has('-v') || has('-r') || has('-a') || has('--merged') || has('--no-merged') || has('-M') || has('--show-current') || has('--list'))) {
      if (has('--show-current')) { c.out((branchName(g) || '') + '\n'); return 0; }
      if (has('-M')) { const names = rest.filter((a) => !a.startsWith('-')); const nn = names[names.length - 1]; const old = names.length > 1 ? names[0] : branchName(g); g.branches[nn] = g.branches[old]; if (nn !== old) delete g.branches[old]; if (branchName(g) === old) g.HEAD = 'ref: ' + nn; return 0; }
      const remotesOnly = has('-r');
      const showLocal = !remotesOnly;
      const showRemote = has('-r') || has('-a');
      let names = Object.keys(g.branches).sort();
      if (has('--merged') || has('--no-merged')) {
        const target = rest.find((a) => !a.startsWith('-')) || 'HEAD';
        const tid = resolveRev(g, target);
        const anc = ancestors(g, tid);
        names = names.filter((b) => (has('--merged') ? anc.has(g.branches[b]) : !anc.has(g.branches[b])));
      }
      if (showLocal) names.forEach((b) => {
        const id = g.branches[b];
        const cur = b === branchName(g);
        let line = `${cur ? '* \x1b[32m' + b + '\x1b[0m' : '  ' + b}`;
        if (has('-v') || has('-vv')) {
          const up = g.tracking && g.tracking[b];
          let trk = '';
          if (has('-vv') && up) {
            const uid = g.remoteRefs && g.remoteRefs[up];
            const ahead = uid ? [...ancestors(g, id)].filter((x) => !ancestors(g, uid).has(x)).length : 0;
            const behind = uid ? [...ancestors(g, uid)].filter((x) => !ancestors(g, id).has(x)).length : 0;
            trk = ` [${up}${ahead || behind ? ': ' + [ahead ? 'ahead ' + ahead : '', behind ? 'behind ' + behind : ''].filter(Boolean).join(', ') : ''}]`;
          }
          line += ` ${short(id)}${trk} ${firstLine(g.commits[id].msg)}`;
        }
        c.out(line + '\n');
      });
      if (showRemote) Object.keys(g.remoteRefs || {}).sort().forEach((r) => c.out(`  \x1b[31m${has('-a') ? 'remotes/' : ''}${r}\x1b[0m${has('-v') ? ' ' + short(g.remoteRefs[r]) + ' ' + firstLine(g.commits[g.remoteRefs[r]].msg) : ''}\n`));
      return 0;
    }
    if (sub === 'diff' && g && (has('--name-only') || has('--name-status'))) {
      const revs = rest.filter((a) => !a.startsWith('-') && resolveRev(g, a.split('..')[0]));
      let a;
      let b;
      const s = statusParts(sh, repo);
      if (revs.length === 2) [a, b] = [treeOf(g, resolveRev(g, revs[0])), treeOf(g, resolveRev(g, revs[1]))];
      else if (revs.length === 1 && revs[0].includes('..')) { const [x, y] = revs[0].split('..'); [a, b] = [treeOf(g, resolveRev(g, x)), treeOf(g, resolveRev(g, y))]; }
      else if (has('--staged') || has('--cached')) [a, b] = [s.head, g.index];
      else {
        const { files } = workFiles(sh, repo);
        a = revs.length === 1 ? treeOf(g, resolveRev(g, revs[0])) : g.index;
        b = {};
        for (const p of new Set([...Object.keys(a), ...Object.keys(g.index)])) if (p in files) b[p] = files[p].content;
      }
      for (const p of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) if (a[p] !== b[p]) c.out(has('--name-status') ? `${!(p in a) ? 'A' : !(p in b) ? 'D' : 'M'}\t${p}\n` : p + '\n');
      return 0;
    }
    if (sub === 'archive' && g) {
      const oI = rest.findIndex((a) => a === '-o' || a === '--output');
      const out = oI >= 0 ? rest[oI + 1] : null;
      const rev = rest.find((a, i) => !a.startsWith('-') && i !== oI + 1) || 'HEAD';
      const id = resolveRev(g, rev);
      if (!id) { c.err(`fatal: not a valid object name: ${rev}\n`); return 128; }
      if (!out) { c.err('fatal: (sandbox) please use -o FILE\n'); return 128; }
      const items = Object.entries(treeOf(g, id)).sort().map(([p, ct]) => ({ path: p, node: sh.fs.mk('f', { content: ct, mode: 0o644 }) }));
      const gz = /\.(tgz|tar\.gz)$/.test(out) || has('--format=tar.gz');
      sh.writeFile(c.abs(out), '', false);
      const an = sh.fs.lookup(c.abs(out));
      an.archive = { kind: 'tar', gz, comp: gz ? 'gz' : null, items };
      an.size = U.archiveSize(items, gz);
      an.bin = true;
      return 0;
    }
    if (sub === 'commit' && g && !rest.some((a) => /^(-[a-zA-Z]*[mFCc]|--message|--file|--no-edit|--reuse-message|--allow-empty-message)/.test(a)) && sh.hooks && sh.hooks.edit) {
      const prevMsg = has('--amend') && headId(g) ? g.commits[headId(g)].msg : '';
      const s0 = statusParts(sh, repo);
      const tmpl = `${prevMsg}\n# Please enter the commit message for your changes. Lines starting\n# with '#' will be ignored, and an empty message aborts the commit.\n#\n# On branch ${branchName(g)}\n${s0.staged.map(([k, p]) => `#\t${k}:   ${p}`).join('\n')}\n`;
      const r = await sh.hooks.edit({ name: 'nano', path: '.git/COMMIT_EDITMSG', content: tmpl, readonly: false });
      const msg = (r || '').split('\n').filter((l) => !l.startsWith('#')).join('\n').trim();
      if (!msg) { c.err('Aborting commit due to empty commit message.\n'); return 1; }
      return run(c, ['commit', '-m', msg].concat(rest.filter((a) => a !== '-m')));
    }
    if (sub === 'commit' && g && has('--allow-empty') && rest.includes('-m') && !statusParts(sh, repo).staged.length) {
      const msg = rest[rest.indexOf('-m') + 1];
      const idn = identity(sh, repo);
      const hd = headId(g);
      const nc = mkCommit(g, hd ? [hd] : [], Object.assign({}, g.index), msg, idn.name || 'Learner', idn.email || 'learner@example.com');
      if (branchName(g)) g.branches[branchName(g)] = nc.id; else g.HEAD = nc.id;
      note(g, nc.id, `commit: ${msg}`);
      c.out(`[${branchName(g) || 'detached HEAD'} ${short(nc.id)}] ${msg}\n`);
      return 0;
    }
    if (sub === 'commit' && g) {
      // client-side hooks
      const hook = sh.fs.lookup(repo.root + '/.git/hooks/pre-commit');
      if (hook && hook.t === 'f' && (hook.mode & 0o111) && !has('--no-verify') && !has('-n')) {
        const prevCwd = sh.cwd;
        sh.cwd = repo.root;
        let out = '';
        const st = await sh.dispatch([repo.root + '/.git/hooks/pre-commit'], { stdin: '', stdout: (s) => (out += s), stderr: (s) => (out += s), tty: false });
        sh.cwd = prevCwd;
        if (out) c.out(out);
        if (st) { c.err('error: pre-commit hook failed (add --no-verify to bypass)\n'); return 1; }
      }
      const r = await orig(c, args);
      const msgHook = sh.fs.lookup(repo.root + '/.git/hooks/post-commit');
      if (!r && msgHook && (msgHook.mode & 0o111)) await sh.dispatch([repo.root + '/.git/hooks/post-commit'], c.io);
      return done(r);
    }

    /* ----- remote handling ----- */
    if (sub === 'remote' && g) {
      const act = rest.find((a) => !a.startsWith('-'));
      if (act === 'show') {
        const name = rest.filter((a) => !a.startsWith('-'))[1] || 'origin';
        const url = g.remotes[name];
        if (!url) { c.err(`fatal: '${name}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n`); return 128; }
        const rr = resolveRemote(c, url);
        if (rr.err) { c.err(rr.err); return rr.code; }
        const heads = Object.keys(rr.r.branches);
        const def0 = heads.includes('main') ? 'main' : heads[0];
        c.out(`* remote ${name}\n  Fetch URL: ${url}\n  Push  URL: ${url}\n  HEAD branch: ${def0 || '(unknown)'}\n  Remote branch${heads.length === 1 ? '' : 'es'}:\n${heads.map((b) => `    ${b.padEnd(8)} tracked`).join('\n')}\n`);
        const bn = branchName(g);
        if (g.tracking && g.tracking[bn]) c.out(`  Local branch configured for 'git pull':\n    ${bn} merges with remote ${g.tracking[bn].replace(name + '/', '')}\n  Local ref configured for 'git push':\n    ${bn} pushes to ${bn} (${g.remoteRefs && g.remoteRefs[name + '/' + bn] === g.branches[bn] ? 'up to date' : 'local out of date'})\n`);
        return 0;
      }
      if (act === 'set-url') { const [, name, url] = rest.filter((a) => !a.startsWith('-')); if (!g.remotes[name]) { c.err(`error: No such remote '${name}'\n`); return 2; } g.remotes[name] = url; return 0; }
      if (act === 'get-url') { const name = rest.filter((a) => !a.startsWith('-'))[1]; if (!g.remotes[name]) { c.err(`error: No such remote '${name}'\n`); return 2; } c.out(g.remotes[name] + '\n'); return 0; }
      if (act === 'rename') {
        const [, from, to] = rest.filter((a) => !a.startsWith('-'));
        if (!g.remotes[from]) { c.err(`error: No such remote: '${from}'\n`); return 2; }
        g.remotes[to] = g.remotes[from];
        delete g.remotes[from];
        for (const k of Object.keys(g.remoteRefs || {})) if (k.startsWith(from + '/')) { g.remoteRefs[to + k.slice(from.length)] = g.remoteRefs[k]; delete g.remoteRefs[k]; }
        for (const [b, t] of Object.entries(g.tracking || {})) if (t.startsWith(from + '/')) g.tracking[b] = to + t.slice(from.length);
        return 0;
      }
      if (act === 'prune' || act === 'update') return 0;
      return orig(c, args);
    }
    if (sub === 'ls-remote') {
      const url = rest.filter((a) => !a.startsWith('-'))[0] || (g && g.remotes.origin);
      const rr = resolveRemote(c, g && g.remotes[url] ? g.remotes[url] : url);
      if (rr.err) { c.err(rr.err); return rr.code; }
      const hs = Object.keys(rr.r.branches);
      if (hs.length) c.out(`${rr.r.branches[hs[0]]}\tHEAD\n`);
      hs.forEach((b) => c.out(`${rr.r.branches[b]}\trefs/heads/${b}\n`));
      Object.keys(rr.r.tags).forEach((t) => c.out(`${rr.r.tags[t]}\trefs/tags/${t}\n`));
      return 0;
    }
    if (sub === 'clone') {
      const pos = rest.filter((a, i) => !a.startsWith('-') && !['-b', '--branch', '--depth'].includes(rest[i - 1]));
      const url = pos[0];
      if (!url) { c.err('fatal: You must specify a repository to clone.\n'); return 129; }
      const name = pos[1] || VFS.base(url.replace(/\/+$/, '')).replace(/\.git$/, '').replace(/^.*:/, '');
      const rr = resolveRemote(c, url);
      if (rr.err) { c.out(`Cloning into '${name}'...\n`); c.err(rr.err); return rr.code; }
      if (rr.kind === 'canned') return orig(c, args);
      const dir = c.abs(name);
      if (sh.fs.lookup(dir) && Object.keys(sh.fs.lookup(dir).kids || {}).length) { c.err(`fatal: destination path '${name}' already exists and is not an empty directory.\n`); return 128; }
      c.out(`Cloning into '${name}'...\n`);
      const r = rr.r;
      const heads = Object.keys(r.branches);
      const wantB = rest.includes('-b') ? rest[rest.indexOf('-b') + 1] : rest.includes('--branch') ? rest[rest.indexOf('--branch') + 1] : null;
      const def0 = wantB || (heads.includes('main') ? 'main' : heads[0]) || (r.HEAD || 'ref: main').replace('ref: ', '');
      await sh.dispatch(['git', 'init', '-b', def0, '--quiet-internal', dir], { stdin: '', stdout: () => {}, stderr: () => {}, tty: false });
      const node = sh.fs.lookup(dir + '/.git');
      const lg = node.git;
      lg.remotes.origin = rr.kind === 'canned' || /^[a-z]+:\/\//.test(url) || /^[\w.-]+@?[\w.-]*:/.test(url) ? url : (rr.T && rr.T !== sh ? url : c.abs(url.replace(/^~/, sh.users[sh.eu()].home)));
      lg.remoteRefs = {};
      lg.commits = clone(r.commits);
      lg.tags = clone(r.tags || {});
      for (const [b, id] of Object.entries(r.branches)) lg.remoteRefs['origin/' + b] = id;
      if (!heads.length) {
        c.err('warning: You appear to have cloned an empty repository.\n');
        lg.tracking = {};
      } else {
        if (wantB && !r.branches[wantB]) { c.err(`warning: Remote branch ${wantB} not found in upstream origin\n`); return 128; }
        lg.branches[def0] = r.branches[def0];
        lg.tracking = { [def0]: 'origin/' + def0 };
        checkoutTree(sh, { root: dir, g: lg, dir: node }, {}, treeOf(lg, lg.branches[def0]));
        const n = Object.keys(lg.commits).length;
        c.err(`remote: Enumerating objects: ${n * 3}, done.\nremote: Counting objects: 100% (${n * 3}/${n * 3}), done.\nremote: Total ${n * 3} (delta 0), reused 0 (delta 0), pack-reused 0\n`);
        c.out(`Receiving objects: 100% (${n * 3}/${n * 3}), done.\n`);
      }
      return 0;
    }
    if (g && (sub === 'push' || sub === 'fetch' || sub === 'pull')) {
      const flags = rest.filter((a) => a.startsWith('-'));
      const pos = rest.filter((a) => !a.startsWith('-'));
      const bn = branchName(g);
      const rname = pos[0] && g.remotes[pos[0]] ? pos[0] : pos[0] && /[:/@.]/.test(pos[0]) && !g.remotes[pos[0]] ? null : (g.tracking && g.tracking[bn] ? g.tracking[bn].split('/')[0] : 'origin');
      const url = rname ? g.remotes[rname] : pos[0];
      if (!url) {
        c.err(sub === 'push' ? 'fatal: No configured push destination.\nEither specify the URL from the command-line or configure a remote repository using\n\n    git remote add <name> <url>\n\nand then push using the remote name\n\n    git push <name>\n' : 'fatal: No remote repository specified.  Please, specify either a URL or a\nremote name from which new revisions should be fetched.\n');
        return 128;
      }
      const rr = resolveRemote(c, url);
      if (rr.err && !(sub === 'push' && /^https?:/.test(url) && /github\.com\/linux-academy\//.test(url))) { c.err(rr.err); return rr.code; }
      if (sub === 'push') {
        if (/^https?:\/\/github\.com\/linux-academy\//.test(normalizeUrl(url))) {
          c.err(`remote: Permission to ${normalizeUrl(url).replace('https://github.com/', '').replace('.git', '')}.git denied to ${sh.user}.\nfatal: unable to access '${normalizeUrl(url)}/': The requested URL returned error: 403\n`);
          return 128;
        }
        const r = rr.r;
        // --tags / --delete / refspecs
        if (flags.includes('--tags')) {
          Object.assign(r.commits, clone(Object.fromEntries(Object.values(g.tags).flatMap((t) => [...ancestors(g, t)]).map((x) => [x, g.commits[x]]))));
          let n = 0;
          for (const [t, id] of Object.entries(g.tags)) if (r.tags[t] !== id) { r.tags[t] = id; c.out(`To ${url}\n * [new tag]         ${t} -> ${t}\n`); n++; }
          if (!n) c.err('Everything up-to-date\n');
          return 0;
        }
        let branch = pos[rname ? 1 : 0];
        if (flags.includes('--delete') || flags.includes('-d') || (branch && branch.startsWith(':'))) {
          const b = (branch || '').replace(/^:/, '') || pos[pos.length - 1];
          if (!(b in r.branches)) { c.err(`error: unable to delete '${b}': remote ref does not exist\nerror: failed to push some refs to '${url}'\n`); return 1; }
          delete r.branches[b];
          if (g.remoteRefs) delete g.remoteRefs[`${rname}/${b}`];
          c.out(`To ${url}\n - [deleted]         ${b}\n`);
          return 0;
        }
        let src = branch;
        let dst = branch;
        if (branch && branch.includes(':')) [src, dst] = branch.split(':');
        if (!branch) {
          if (!bn) { c.err('fatal: You are not currently on a branch.\n'); return 128; }
          const trk = g.tracking && g.tracking[bn];
          if (!trk && !flags.includes('-u') && !flags.includes('--set-upstream')) {
            c.err(`fatal: The current branch ${bn} has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push --set-upstream ${rname || 'origin'} ${bn}\n\nTo have this happen automatically for branches without a tracking\nupstream, see 'push.autoSetupRemote' in 'git help config'.\n\n`);
            return 128;
          }
          src = dst = bn;
        }
        const id = g.branches[src] || resolveRev(g, src);
        if (!id) { c.err(`error: src refspec ${src} does not match any\nerror: failed to push some refs to '${url}'\n`); return 1; }
        if (rr.kind === 'work' && branchName(rr.r) === dst) {
          c.err(`remote: error: refusing to update checked out branch: refs/heads/${dst}\nremote: error: By default, updating the current branch in a non-bare repository\nremote: is denied, because it will make the index and work tree inconsistent\nremote: with what you pushed, and will require 'git reset --hard' to match\nremote: the work tree to HEAD.\nTo ${url}\n ! [remote rejected] ${src} -> ${dst} (branch is currently checked out)\nerror: failed to push some refs to '${url}'\n`);
          return 1;
        }
        const remoteHead = r.branches[dst];
        if (remoteHead && !ancestors(g, id).has(remoteHead) && !flags.includes('--force') && !flags.includes('-f') && !flags.includes('--force-with-lease')) {
          c.err(`To ${url}\n ! [rejected]        ${src} -> ${dst} (${g.commits[remoteHead] ? 'non-fast-forward' : 'fetch first'})\nerror: failed to push some refs to '${url}'\nhint: Updates were rejected because the remote contains work that you do not\nhint: have locally. This is usually caused by another repository pushing to\nhint: the same ref. If you want to integrate the remote changes, use\nhint: 'git pull' before pushing again.\nhint: See the 'Note about fast-forwards' in 'git push --help' for details.\n`);
          return 1;
        }
        if (remoteHead === id) { c.err('Everything up-to-date\n'); return 0; }
        const toSend = [...ancestors(g, id)].filter((x) => !r.commits[x]);
        const n = toSend.length;
        for (const x of ancestors(g, id)) if (!r.commits[x]) r.commits[x] = clone(g.commits[x]);
        r.branches[dst] = id;
        for (const [t, tid] of Object.entries(g.tags)) if (ancestors(g, id).has(tid) && !(t in r.tags)) { r.tags[t] = tid; }
        g.remoteRefs = g.remoteRefs || {};
        g.remoteRefs[`${rname || 'origin'}/${dst}`] = id;
        // a hook on the server side
        const hook = rr.T && rr.T.fs.lookup(((rr.T.fs.lookup(rr.url) || {}).t ? rr.url : '') + '/hooks/post-receive');
        c.err(`Enumerating objects: ${n * 3 + 2}, done.\nCounting objects: 100% (${n * 3 + 2}/${n * 3 + 2}), done.\nWriting objects: 100% (${n * 3 + 2}/${n * 3 + 2}), ${n * 214} bytes | ${n * 214}.00 KiB/s, done.\nTotal ${n * 3 + 2} (delta 0), reused 0 (delta 0), pack-reused 0\nTo ${url}\n ${remoteHead ? short(remoteHead) + '..' + short(id) : '* [new branch]'}      ${src} -> ${dst}\n`);
        if (flags.includes('-u') || flags.includes('--set-upstream')) {
          g.tracking = Object.assign(g.tracking || {}, { [src]: `${rname || 'origin'}/${dst}` });
          c.err(`branch '${src}' set up to track '${rname || 'origin'}/${dst}'.\n`);
        }
        // a push to a working-copy-less repo triggers hooks/post-receive if present
        return 0;
      }
      // fetch / pull
      if (rr.kind === 'canned') return orig(c, args);
      const r = rr.r;
      g.remoteRefs = g.remoteRefs || {};
      const nm = rname || 'origin';
      const lines = [];
      for (const x of Object.keys(r.commits)) if (!g.commits[x]) g.commits[x] = clone(r.commits[x]);
      for (const [b, id] of Object.entries(r.branches)) {
        const old = g.remoteRefs[`${nm}/${b}`];
        if (old !== id) lines.push(old ? `   ${short(old)}..${short(id)}  ${b.padEnd(10)} -> ${nm}/${b}` : ` * [new branch]      ${b.padEnd(10)} -> ${nm}/${b}`);
        g.remoteRefs[`${nm}/${b}`] = id;
      }
      for (const [t, id] of Object.entries(r.tags || {})) if (!(t in g.tags)) { g.tags[t] = id; lines.push(` * [new tag]         ${t.padEnd(10)} -> ${t}`); }
      if (lines.length) c.err(`remote: Enumerating objects: ${lines.length * 3}, done.\nremote: Total ${lines.length * 3} (delta 0), reused 0 (delta 0), pack-reused 0\nUnpacking objects: 100% (${lines.length * 3}/${lines.length * 3}), done.\nFrom ${url}\n${lines.join('\n')}\n`);
      if (sub === 'fetch') return 0;
      const target = pos[rname ? 1 : 0] || (g.tracking && g.tracking[bn] ? g.tracking[bn].split('/').slice(1).join('/') : bn);
      const up = g.remoteRefs[`${nm}/${target}`];
      if (!bn) { c.err('You are not currently on a branch.\n'); return 1; }
      if (!up) {
        if (!(g.tracking && g.tracking[bn])) c.err(`There is no tracking information for the current branch.\nPlease specify which branch you want to merge with.\nSee git-pull(1) for details.\n\n    git pull <remote> <branch>\n\nIf you wish to set tracking information for this branch you can do so with:\n\n    git branch --set-upstream-to=${nm}/<branch> ${bn}\n\n`);
        else c.err(`fatal: couldn't find remote ref ${target}\n`);
        return 1;
      }
      if (!headId(g)) {
        // pulling into an empty repository
        g.branches[bn] = up;
        checkoutTree(sh, repo, {}, treeOf(g, up));
        g.tracking = Object.assign(g.tracking || {}, { [bn]: `${nm}/${target}` });
        return 0;
      }
      if (flags.includes('--rebase') || flags.includes('-r')) return done(await rebaseCmd(c, g, repo, [`${nm}/${target}`]));
      if (ancestors(g, headId(g)).has(up)) { c.out('Already up to date.\n'); return 0; }
      const rcode = await orig(Object.assign({}, c), ['merge', `${nm}/${target}`]);
      return done(rcode);
    }
    if (sub === 'config' && g === null) {
      if (rest.includes('--unset') || rest.includes('--unset-all')) {
        const key = rest.find((a) => !a.startsWith('-'));
        const repo2 = findRepo(sh);
        if (repo2 && !rest.includes('--global')) delete repo2.g.config[key];
        return 0;
      }
    }
    return done(await orig(c, args));
  }
})();
