/* Linux Academy: backup tooling. tar through pipes (tar czf - | ssh host "cat > f"), GNU incremental tar (--listed-incremental),
   a complete rsync (local and over "ssh", --delete, --link-dest snapshots, --stats, -n) */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS } = LX;
  const U = LX.U;
  const P = LX.Shell.prototype;

  /* ---------- archives travel through pipes as tokens ---------- */
  LX.tarStreams = LX.tarStreams || {};
  let seq = 0;
  const PRE = '\u0000TARSTREAM:';
  const tokenOf = (a) => {
    if (!a.sid) a.sid = ++seq;
    LX.tarStreams[a.sid] = a;
    return `${PRE}${a.sid}\u0000`;
  };
  const archiveOf = (s) => {
    const m = /^\u0000TARSTREAM:(\d+)\u0000/.exec(s || '');
    return m ? LX.tarStreams[+m[1]] : null;
  };
  const origRead = P.readFile;
  P.readFile = function (abs) {
    const n = this.fs.lookup(abs);
    if (n && n.t === 'f' && n.archive && this.can(n, 4)) return tokenOf(n.archive);
    return origRead.call(this, abs);
  };
  const origWrite = P.writeFile;
  P.writeFile = function (abs, data, append) {
    const r = origWrite.call(this, abs, data, append);
    if (typeof data === 'string' && data.startsWith(PRE)) {
      const a = archiveOf(data);
      const n = this.fs.lookup(abs);
      if (a && n) {
        n.archive = a;
        n.bin = true;
        n.size = U.archiveSize(a.items, a.gz);
      }
    }
    return r;
  };
  // never dump a token on a terminal
  const origCat = LX.cmds.cat.run;
  def('cat', async (c, args) => {
    if (c.io.tty && c.io.stdout) {
      const hit = args.filter((a) => !a.startsWith('-')).some((a) => {
        const n = c.sh.fs.lookup(c.abs(a));
        return n && n.archive;
      });
      if (hit) {
        c.out('\u001f\u008b\b\u0000\u0000\u0000\u0000\u0000\u0000\u0003íÕÍ\u008a(binary archive data: not printable)\n');
        return 0;
      }
    }
    return origCat(c, args);
  }, { builtin: false, bin: true });

  /* ---------- tar: streams and incremental backups ---------- */
  const globRe2 = (g) => new RegExp('^' + g.replace(/[.+^$()|\\{}]/g, '\\$&').replace(/\*\*/g, '\u0002').replace(/\*/g, '.*').replace(/\?/g, '[^/]').replace(/\u0002/g, '.*') + '$');
  const origTar = LX.cmds.tar.run;
  const hashNode = (n) => {
    const s = typeof n.content === 'string' ? n.content : '';
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return VFS.size(n) + ':' + h;
  };
  def('tar', async (c, args0) => {
    const sh = c.sh;
    let args = args0.slice();
    // incremental options
    let snar = null;
    let level0 = false;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.startsWith('--listed-incremental=')) { snar = a.split('=')[1]; args.splice(i--, 1); }
      else if (a === '--listed-incremental' || a === '-g') { snar = args[i + 1]; args.splice(i, 2); i--; }
      else if (a.startsWith('--level=')) { level0 = a.split('=')[1] === '0'; args.splice(i--, 1); }
    }
    // --exclude / --exclude-from
    const excludes = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.startsWith('--exclude=')) { excludes.push(a.slice(10)); args.splice(i--, 1); }
      else if (a === '--exclude') { excludes.push(args[i + 1]); args.splice(i, 2); i--; }
      else if (a.startsWith('--exclude-from=') || a === '-X' || a === '--exclude-from') {
        const f = a.includes('=') ? a.split('=')[1] : args[i + 1];
        if (!a.includes('=')) args.splice(i, 2); else args.splice(i, 1);
        i--;
        try { sh.readFile(c.abs(f)).split('\n').filter(Boolean).forEach((x) => excludes.push(x)); } catch (e) { c.err(`tar: ${f}: Cannot open: No such file or directory\ntar: Error is not recoverable: exiting now\n`); return 2; }
      }
    }
    // find the archive argument and whether it is "-" (stdout / stdin)
    let fIdx = -1;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-f' || a === '--file') { fIdx = i + 1; break; }
      if (/^-?[a-zA-Z]+$/.test(a) && i === 0 && a.includes('f') && !a.startsWith('--')) { fIdx = i + 1; break; }
      if (/^-[a-zA-Z]*f[a-zA-Z]*$/.test(a)) { fIdx = i + 1; break; }
      if (a.startsWith('--file=')) { fIdx = -2 - i; break; }
    }
    const cluster = args.find((a) => /^-?[a-zA-Z]{1,12}$/.test(a) && !a.startsWith('--')) || '';
    const mode = args.includes('--create') || /c/.test(cluster) && !args.includes('--extract') ? 'c' : args.includes('--extract') || /x/.test(cluster) ? 'x' : args.includes('--list') || /t/.test(cluster) ? 't' : '';
    let tmp = null;
    let streamOut = false;
    if (fIdx < 0 && (mode === 'x' || mode === 't') && typeof c.io.stdin === 'string' && archiveOf(c.io.stdin)) {
      if (/^-?[a-zA-Z]+$/.test(args[0])) {
        args = [args[0] + 'f', '-'].concat(args.slice(1));
        fIdx = 1;
      }
    }
    if (fIdx >= 0 && args[fIdx] === '-') {
      tmp = `/tmp/.tarstream-${++seq}`;
      if (mode === 'c') {
        args[fIdx] = tmp;
        streamOut = true;
      } else {
        const stdin = typeof c.io.stdin === 'string' ? c.io.stdin : await c.slurp();
        const a = archiveOf(stdin);
        if (!a) { c.err('tar: This does not look like a tar archive\ntar: Exiting with failure status due to previous errors\n'); return 2; }
        try {
          sh.fs.mkdirp('/tmp', { owner: 'root', group: 'root', mode: 0o1777 });
          sh.writeFile(tmp, '', false);
          const tn = sh.fs.lookup(tmp);
          tn.archive = a;
          tn.bin = true;
        } catch (e) { /* ignore */ }
        args[fIdx] = tmp;
      }
    }
    // extracting named members only
    if ((mode === 'x') && fIdx >= 0) {
      const members = [];
      const rest = [];
      for (let i = 0; i < args.length; i++) {
        if (i === fIdx || /^-/.test(args[i]) && i !== 0) { if (args[i] === '-C' || args[i] === '--directory') { rest.push(args[i], args[++i]); } else if (/^--(directory)=/.test(args[i]) || /^-/.test(args[i]) || i === fIdx) rest.push(args[i]); continue; }
        if (i === 0) { rest.push(args[i]); continue; }
        if (args[i - 1] === '-C' || args[i - 1] === '--directory') continue;
        members.push(args[i]);
      }
      if (members.length) {
        const srcAbs = c.abs(args[fIdx]);
        const sn = sh.fs.lookup(srcAbs);
        if (sn && sn.archive) {
          const keep = sn.archive.items.filter((it) => members.some((mb) => { const m2 = mb.replace(/\/$/, ''); return it.path === m2 || it.path.startsWith(m2 + '/') || it.path === mb; }));
          if (!keep.length) { c.err(`tar: ${members[0]}: Not found in archive\ntar: Exiting with failure status due to previous errors\n`); return 2; }
          // also keep the parent directories of the chosen members
          const dirs = sn.archive.items.filter((it) => it.node.t === 'd' && keep.some((k) => k.path.startsWith(it.path.replace(/\/$/, '') + '/')));
          const selPath = `/tmp/.tarsel-${++seq}`;
          sh.fs.mkdirp('/tmp', { owner: 'root', group: 'root', mode: 0o1777 });
          sh.writeFile(selPath, '', false);
          const tn = sh.fs.lookup(selPath);
          tn.archive = Object.assign({}, sn.archive, { items: dirs.concat(keep), sid: undefined });
          tn.bin = true;
          args = rest.filter((x, i) => i !== fIdx);
          args.splice(fIdx, 0, selPath);
          tmp = tmp || selPath;
        }
      }
    }
    const archivePath = fIdx >= 0 ? args[fIdx] : null;
    const abs = archivePath ? c.abs(archivePath) : null;
    // for incremental creation, remember what existed before
    let prevMap = null;
    if (mode === 'c' && snar) {
      const sn = sh.fs.lookup(c.abs(snar));
      if (sn && !level0 && (sn.content || '').startsWith('GNU tar-')) {
        try { prevMap = JSON.parse(sn.content.split('\n').slice(1).join('\n') || '{}'); } catch (e) { prevMap = null; }
      }
    }
    const st = await origTar(c, args);
    if (mode === 'c' && excludes.length && abs && !st) {
      const an0 = sh.fs.lookup(abs);
      if (an0 && an0.archive) {
        const rx = excludes.map((e) => globRe2(e.replace(/\/$/, '')));
        const hit = (p) => {
          const parts = p.replace(/\/$/, '').split('/');
          for (let n = 1; n <= parts.length; n++) {
            const pre = parts.slice(0, n);
            for (let k = 0; k < pre.length; k++) if (rx.some((r) => r.test(pre.slice(k).join('/')))) return true;
          }
          return false;
        };
        an0.archive.items = an0.archive.items.filter((it) => !hit(it.path));
        an0.size = U.archiveSize(an0.archive.items, an0.archive.gz);
      }
    }
    if (mode === 'c' && snar && abs && !st) {
      const an = sh.fs.lookup(abs);
      if (an && an.archive) {
        const all = an.archive.items;
        const map = {};
        all.forEach((it) => { if (it.node.t !== 'd') map[it.path] = hashNode(it.node); });
        if (prevMap) {
          an.archive.items = all.filter((it) => it.node.t === 'd' ? true : prevMap[it.path] !== map[it.path]);
          // keep directories only when something below them (or they themselves) changed
          an.archive.level = 1;
        }
        an.size = U.archiveSize(an.archive.items, an.archive.gz);
        sh.writeFile(c.abs(snar), `GNU tar-1.35-2\n${JSON.stringify(map)}`, false);
      }
    }
    if (streamOut && !st) {
      const an = sh.fs.lookup(abs);
      if (an && an.archive) c.out(tokenOf(an.archive));
    }
    if (tmp) {
      const pd = sh.fs.lookup('/tmp');
      if (pd) delete pd.kids[VFS.base(tmp)];
    }
    return st;
  });

  /* ---------- rsync ---------- */
  const isRemoteSpec = (s) => /^([\w.-]+@)?[\w.-]+:/.test(s) && !s.startsWith('/') && !s.startsWith('.');
  const globRe = (g) => new RegExp('^' + g.replace(/[.+^$()|\\{}]/g, '\\$&').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0002/g, '.*') + '$');
  const human = (n) => (n >= 1073741824 ? (n / 1073741824).toFixed(2) + 'G' : n >= 1048576 ? (n / 1048576).toFixed(2) + 'M' : n >= 1024 ? (n / 1024).toFixed(2) + 'K' : String(n));
  const num = (n) => Number(n).toLocaleString('en-US');
  def('rsync', async (c, args) => {
    const sh = c.sh;
    const longOpts = { valued: ['--exclude', '--include', '--link-dest', '--backup-dir', '--bwlimit', '--files-from', '--exclude-from', '--delete-after', '-e', '--rsh', '--max-size', '--min-size', '--timeout', '--log-file'] };
    const opt = { exclude: [], include: [] };
    const pos = [];
    const letters = new Set();
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--exclude' || a === '--include') opt[a.slice(2)].push(args[++i]);
      else if (a.startsWith('--exclude=')) opt.exclude.push(a.slice(10));
      else if (a.startsWith('--include=')) opt.include.push(a.slice(10));
      else if (a === '--link-dest') opt.linkDest = args[++i];
      else if (a.startsWith('--link-dest=')) opt.linkDest = a.slice(12);
      else if (a === '-e' || a === '--rsh') i++;
      else if (a.startsWith('--')) {
        const k = a.replace(/^--/, '').split('=')[0];
        if (['bwlimit', 'backup-dir', 'max-size', 'min-size', 'timeout', 'log-file', 'files-from', 'exclude-from'].includes(k) && !a.includes('=')) i++;
        opt[k] = true;
      } else if (/^-[a-zA-Z]+$/.test(a)) for (const ch of a.slice(1)) letters.add(ch);
      else pos.push(a);
    }
    if (letters.has('a')) ['r', 'l', 'p', 't', 'g', 'o'].forEach((x) => letters.add(x));
    if (letters.has('P')) { opt.progress = true; opt.partial = true; }
    const dry = letters.has('n') || opt['dry-run'];
    const verbose = letters.has('v') || opt.verbose;
    const itemize = letters.has('i') || opt['itemize-changes'];
    const quiet = letters.has('q') || opt.quiet;
    const recursive = letters.has('r');
    const del = opt.delete || opt['delete-after'] || opt['delete-before'] || opt['delete-during'];
    const preserveTime = letters.has('t');
    const checksum = letters.has('c') || opt.checksum;
    if (pos.length < 2) {
      c.err('Usage: rsync [OPTION]... SRC [SRC]... DEST\n  or   rsync [OPTION]... SRC [SRC]... [USER@]HOST:DEST\n  or   rsync [OPTION]... [USER@]HOST:SRC [DEST]\nThe ssh-agent... see the rsync(1) man page for full options\n');
      return 1;
    }
    // endpoints
    const endpoint = (spec) => {
      if (!isRemoteSpec(spec)) return { sh, user: sh.eu(), path: c.abs(spec), raw: spec, remote: false, host: null };
      const i = spec.indexOf(':');
      const left = spec.slice(0, i);
      const user = left.includes('@') ? left.split('@')[0] : sh.user;
      const host = left.includes('@') ? left.split('@')[1] : left;
      const ip = sh.resolveHost(host);
      if (!ip) return { err: `ssh: Could not resolve hostname ${host}: ${LX.resolveMsg ? LX.resolveMsg(sh) : 'Name or service not known'}\nrsync: connection unexpectedly closed (0 bytes received so far) [Receiver]\nrsync error: unexplained error (code 255) at io.c(231) [Receiver=3.2.7]\n` };
      if (!sh.netUp() && !sh.ownIps().includes(ip)) return { err: `ssh: connect to host ${host} port 22: Network is unreachable\nrsync: connection unexpectedly closed (0 bytes received so far) [Receiver]\nrsync error: unexplained error (code 255) at io.c(231) [Receiver=3.2.7]\n` };
      const local = sh.ownIps().includes(ip) || host === 'localhost' || host === sh.hostname;
      const T = local ? sh : LX.hostShell(sh, host);
      const home = (T.users[user] || T.users.learner || { home: '/home/learner' }).home;
      let p = spec.slice(i + 1);
      p = p.startsWith('/') ? p : VFS.norm(p || '.', home);
      return { sh: T, user: T.users[user] ? user : 'learner', path: p, raw: spec, remote: true, host };
    };
    const dst = endpoint(pos[pos.length - 1]);
    if (dst.err) { c.err(dst.err); return 255; }
    const srcs = pos.slice(0, -1).map(endpoint);
    for (const s of srcs) if (s.err) { c.err(s.err); return 255; }
    const dFS = dst.sh.fs;
    const dUser = dst.user;
    const dGroup = (dst.sh.users[dUser] || { groups: ['learner'] }).groups[0];
    const out = [];
    let nFiles = 0;
    let nDirs = 0;
    let created = 0;
    let transferred = 0;
    let bytesSent = 0;
    let totalSize = 0;
    let deleted = 0;
    let err23 = false;
    const excluded = (rel, isDir) => {
      const base = VFS.base(rel.replace(/\/$/, ''));
      for (const e of opt.exclude) {
        const dirOnly = e.endsWith('/');
        const pat = e.replace(/\/$/, '');
        if (dirOnly && !isDir) continue;
        if (pat.startsWith('/') ? globRe(pat.slice(1)).test(rel.replace(/\/$/, '')) : globRe(pat).test(base) || globRe(pat).test(rel.replace(/\/$/, ''))) {
          if (opt.include.some((inc) => globRe(inc.replace(/\/$/, '')).test(base))) return false;
          return true;
        }
      }
      return false;
    };
    const linkBase = opt.linkDest ? (opt.linkDest.startsWith('/') ? opt.linkDest : VFS.norm(opt.linkDest, c.sh.cwd)) : null;
    const copyOne = (sNode, rel, dstAbs, srcRoot) => {
      // returns 'new' | 'changed' | 'same' | 'linked'
      const ex = dFS.lookup(dstAbs);
      const size = VFS.size(sNode);
      totalSize += size;
      nFiles++;
      let same = false;
      if (ex && ex.t !== 'd') {
        same = checksum ? ex.content === sNode.content : VFS.size(ex) === size && (!preserveTime || Math.abs((ex.mtime || 0) - (sNode.mtime || 0)) < 2000 || ex.content === sNode.content && !letters.has('t'));
        if (same && !checksum && letters.has('t') && Math.abs((ex.mtime || 0) - (sNode.mtime || 0)) >= 2000) same = false;
      }
      if (same) return 'same';
      if (!ex && linkBase) {
        const base = dFS.lookup(VFS.norm(rel, linkBase));
        if (base && base.t === 'f' && VFS.size(base) === size && base.content === sNode.content && (!preserveTime || Math.abs((base.mtime || 0) - (sNode.mtime || 0)) < 2000)) {
          if (!dry) {
            dFS.mkdirp(VFS.dirname(dstAbs), { owner: dUser, group: dGroup });
            base.nlink = (base.nlink || 1) + 1;
            LX.ino && LX.ino(base);
            dFS.lookup(VFS.dirname(dstAbs)).kids[VFS.base(dstAbs)] = base;
          }
          return 'linked';
        }
      }
      if (!dry) {
        dFS.mkdirp(VFS.dirname(dstAbs), { owner: dUser, group: dGroup });
        const nn = dFS.clone(sNode);
        delete nn.ino;
        nn.nlink = 1;
        nn.owner = dUser;
        nn.group = dGroup;
        if (preserveTime) nn.mtime = sNode.mtime;
        else nn.mtime = Date.now();
        if (!letters.has('p')) nn.mode = sNode.mode & ~(dst.sh.umask || 0o022);
        dFS.lookup(VFS.dirname(dstAbs)).kids[VFS.base(dstAbs)] = nn;
      }
      bytesSent += size;
      transferred++;
      return ex ? 'changed' : 'new';
    };
    const dstRootEnsure = (abs) => {
      if (!dry && !dFS.lookup(abs)) dFS.mkdirp(abs, { owner: dUser, group: dGroup });
    };
    let first = true;
    for (const s of srcs) {
      const sFS = s.sh.fs;
      const sn = sFS.lookup(s.path.replace(/\/$/, '') || '/');
      if (!sn) {
        c.err(`rsync: [sender] link_stat "${s.path}" failed: No such file or directory (2)\n`);
        err23 = true;
        continue;
      }
      // the right permission check on the source: reading a file you may not read
      const contents = s.raw.endsWith('/');
      if (sn.t === 'd' && !recursive) {
        c.err(`skipping directory ${s.raw.replace(/\/$/, '') || '.'}\n`);
        continue;
      }
      let dstBase = dst.path;
      const dn = dFS.lookup(dst.path);
      const dstIsDir = (dn && dn.t === 'd') || pos[pos.length - 1].endsWith('/') || srcs.length > 1;
      if (sn.t === 'd') {
        if (!contents) dstBase = dst.path.replace(/\/$/, '') + '/' + VFS.base(s.path.replace(/\/$/, ''));
        dstRootEnsure(dstBase);
        if (!dFS.lookup(dstBase) && !dry) { /* created above */ }
        const walk = (node, rel, dAbs) => {
          const names = Object.keys(node.kids).sort();
          for (const k of names) {
            const kid = node.kids[k];
            const r = rel ? rel + '/' + k : k;
            const isDir = kid.t === 'd';
            if (excluded(r, isDir)) continue;
            const target = dAbs + '/' + k;
            if (isDir) {
              nDirs++;
              const exd = dFS.lookup(target);
              if (!exd) {
                created++;
                out.push({ k: 'dir', rel: r + '/', st: 'new' });
                if (!dry) dFS.mkdirp(target, { owner: dUser, group: dGroup, mode: kid.mode });
              }
              walk(kid, r, target);
            } else if (kid.t === 'l') {
              nFiles++;
              if (!dFS.lookup(target) && !dry) { dFS.mkdirp(dAbs, { owner: dUser, group: dGroup }); dFS.lookup(dAbs).kids[k] = dFS.clone(kid); }
            } else {
              const res = copyOne(kid, r, target, s.path);
              if (res === 'new') created++;
              if (res === 'new' || res === 'changed') out.push({ k: 'file', rel: r, st: res, size: VFS.size(kid) });
              if (res === 'linked') created++;
            }
          }
        };
        if (first || true) out.push({ k: 'dir', rel: './', st: dFS.lookup(dstBase) && !dry ? 'same' : 'same', hidden: true });
        walk(sn, '', dstBase);
        if (del && s.sh) {
          const ddn = dFS.lookup(dstBase);
          const srcNames = (nn, rel, set) => {
            for (const k of Object.keys(nn.kids)) {
              const r = rel ? rel + '/' + k : k;
              set.add(r);
              if (nn.kids[k].t === 'd') srcNames(nn.kids[k], r, set);
            }
            return set;
          };
          const keep = srcNames(sn, '', new Set());
          const rec = (n, rel) => {
            for (const k of Object.keys(n.kids)) {
              const r = rel ? rel + '/' + k : k;
              if (!keep.has(r) && !excluded(r, n.kids[k].t === 'd')) {
                out.push({ k: 'del', rel: r });
                deleted++;
                if (!dry) delete n.kids[k];
              } else if (n.kids[k].t === 'd') rec(n.kids[k], r);
            }
          };
          if (ddn) rec(ddn, '');
        }
      } else {
        const rel = VFS.base(s.path);
        const target = dstIsDir ? dst.path.replace(/\/$/, '') + '/' + rel : dst.path;
        if (!excluded(rel, false)) {
          if (dstIsDir) dstRootEnsure(dst.path.replace(/\/$/, ''));
          const res = copyOne(sn, rel, target, s.path);
          if (res === 'new') created++;
          if (res === 'new' || res === 'changed') out.push({ k: 'file', rel, st: res, size: VFS.size(sn) });
        }
      }
      if (opt['remove-source-files'] && !dry && sn.t !== 'd') {
        const pd = sFS.lookup(VFS.dirname(s.path));
        if (pd) delete pd.kids[VFS.base(s.path)];
      }
      first = false;
    }
    const sentBytes = bytesSent + 60 * (transferred + 1) + 100;
    const recvBytes = 35 * (transferred + 1) + 20;
    const show = verbose || itemize || opt.progress || opt.stats || (dry && verbose);
    if (!quiet && show) {
      c.out('sending incremental file list\n');
      for (const o of out) {
        if (o.k === 'del') c.out(itemize ? `*deleting   ${o.rel}\n` : `deleting ${o.rel}\n`);
        else if (o.k === 'dir' && o.hidden) { if (verbose || itemize) c.out(itemize ? '.d..t...... ./\n' : './\n'); }
        else if (itemize) c.out(`${o.k === 'dir' ? 'cd+++++++++' : o.st === 'new' ? '>f+++++++++' : '>f.st......'} ${o.rel}\n`);
        else if (verbose || opt.progress) {
          c.out(o.rel + '\n');
          if (opt.progress && o.k === 'file') c.out(`${String(num(o.size)).padStart(15)} 100%    ${(o.size / 1024 / 2).toFixed(2)}kB/s    0:00:00 (xfr#${out.indexOf(o) + 1}, to-chk=0/${nFiles + nDirs})\n`);
        }
      }
      if (opt.stats) {
        c.out(`\nNumber of files: ${nFiles + nDirs} (reg: ${nFiles}, dir: ${nDirs})\nNumber of created files: ${created} (reg: ${Math.max(0, created - out.filter((o) => o.k === 'dir' && !o.hidden).length)}, dir: ${out.filter((o) => o.k === 'dir' && !o.hidden).length})\nNumber of deleted files: ${deleted}\nNumber of regular files transferred: ${transferred}\nTotal file size: ${num(totalSize)} bytes\nTotal transferred file size: ${num(bytesSent)} bytes\nLiteral data: ${num(bytesSent)} bytes\nMatched data: 0 bytes\nFile list size: 0\nFile list generation time: 0.001 seconds\nFile list transfer time: 0.000 seconds\nTotal bytes sent: ${num(sentBytes)}\nTotal bytes received: ${num(recvBytes)}\n`);
      }
      const hum = letters.has('h');
      const f = (n) => (hum ? human(n) : num(n));
      c.out(`\nsent ${f(sentBytes)} bytes  received ${f(recvBytes)} bytes  ${hum ? human(Math.round((sentBytes + recvBytes) / 0.3)) : num(Math.round((sentBytes + recvBytes) / 0.3)) + '.00'} bytes/sec\ntotal size is ${f(totalSize)}  speedup is ${(totalSize / Math.max(1, sentBytes + recvBytes)).toFixed(2)}${dry ? ' (DRY RUN)' : ''}\n`);
    }
    if (err23) {
      c.err('rsync error: some files/attrs were not transferred (see previous errors) (code 23) at main.c(1338) [sender=3.2.7]\n');
      return 23;
    }
    return 0;
  }, { pkg: 'rsync' });

  /* ---------- touch -d / -t / -r ---------- */
  const origTouch = LX.cmds.touch.run;
  def('touch', async (c, args) => {
    const sh = c.sh;
    let when = null;
    const files = [];
    let noCreate = false;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-d' || a === '--date') { when = LX.parseDateStr(args[++i], Date.now()); if (when === null) { c.err(`touch: invalid date format '${args[i]}'\n`); return 1; } }
      else if (a.startsWith('--date=')) { when = LX.parseDateStr(a.slice(7), Date.now()); if (when === null) { c.err(`touch: invalid date format '${a.slice(7)}'\n`); return 1; } }
      else if (a === '-t') {
        const m = /^(?:(\d{2})?(\d{2}))?(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d{2}))?$/.exec(args[++i] || '');
        if (!m) { c.err(`touch: invalid date format '${args[i]}'\n`); return 1; }
        const y = m[2] ? (m[1] ? +m[1] * 100 + +m[2] : +m[2] < 69 ? 2000 + +m[2] : 1900 + +m[2]) : new Date().getFullYear();
        when = LX.zmake ? LX.zmake(y, +m[3] - 1, +m[4], +m[5], +m[6], m[7] ? +m[7] : 0) : new Date(y, +m[3] - 1, +m[4], +m[5], +m[6]).getTime();
      } else if (a === '-r' || a === '--reference') {
        const rn = sh.fs.lookup(c.abs(args[++i]));
        if (!rn) { c.err(`touch: failed to get attributes of '${args[i]}': No such file or directory\n`); return 1; }
        when = rn.mtime;
      } else if (a === '-c' || a === '--no-create') noCreate = true;
      else if (/^-[acm]+$/.test(a)) { if (a.includes('c')) noCreate = true; }
      else files.push(a);
    }
    if (when === null) return origTouch(c, args);
    if (!files.length) { c.err("touch: missing file operand\nTry 'touch --help' for more information.\n"); return 1; }
    let st = 0;
    for (const f of files) {
      const abs = c.abs(f);
      try {
        let n = sh.fs.lookup(abs);
        if (!n && !noCreate) { sh.writeFile(abs, '', false); n = sh.fs.lookup(abs); }
        if (n) { n.mtime = when; n.atime = when; }
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`touch: cannot touch '${f}': ${U.errTxt(e)}\n`);
        st = 1;
      }
    }
    return st;
  });
})();
