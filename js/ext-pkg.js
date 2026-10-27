/* Linux Academy: package management in depth: holds, dry runs, history logs, third-party repos + signing keys, .deb files, source tarballs */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS } = LX;
  const U = LX.U;
  const P = LX.Shell.prototype;

  /* ---------- versions of the base packages ---------- */
  const VERS = { bash: '5.2.21-2ubuntu4', coreutils: '9.4-3ubuntu6', grep: '3.11-4build1', sed: '4.9-2build1', gawk: '1:5.2.1-2build3', findutils: '4.9.0-5build1', tar: '1.35+dfsg-3build1', gzip: '1.12-1ubuntu3', nano: '7.2-2build1', curl: '8.5.0-2ubuntu10.3', wget: '1.21.4-1ubuntu4.1', python3: '3.12.3-0ubuntu2', 'openssh-client': '1:9.6p1-3ubuntu13.4', procps: '2:4.0.4-4ubuntu3', 'iputils-ping': '3:20240117-1build1', sudo: '1.9.15p5-3ubuntu5', apt: '2.7.14build2', 'util-linux': '2.39.3-9ubuntu6', cron: '3.0pl1-184ubuntu2', less: '590-2ubuntu2', 'man-db': '2.12.0-4build2', passwd: '1:4.13+dfsg1-4ubuntu3', diffutils: '1:3.10-1build1', openssl: '3.0.13-0ubuntu3.2', libssl3t64: '3.0.13-0ubuntu3.2', 'openssh-server': '1:9.6p1-3ubuntu13.4', 'linux-image-generic': '6.8.0.45.47' };
  const DESCS = { bash: 'GNU Bourne Again SHell', coreutils: 'GNU core utilities', grep: 'GNU grep, egrep and fgrep', sed: 'GNU stream editor for filtering/transforming text', gawk: 'GNU awk, a pattern scanning and processing language', findutils: 'utilities for finding files--find, xargs', tar: 'GNU version of the tar archiving utility', gzip: 'GNU compression utilities', nano: 'small, friendly text editor inspired by Pico', curl: 'command line tool for transferring data with URL syntax', wget: 'retrieves files from the web', python3: 'interactive high-level object-oriented language (default python3 version)', 'openssh-client': 'secure shell (SSH) client, for secure access to remote machines', procps: '/proc file system utilities', 'iputils-ping': 'Tools to test the reachability of network hosts', sudo: 'Provide limited super user privileges to specific users', apt: 'commandline package manager', 'util-linux': 'miscellaneous system utilities', cron: 'process scheduling daemon', less: 'pager program similar to more', 'man-db': 'tools for reading manual pages', passwd: 'change and administer password and group data', diffutils: 'File comparison utilities', openssl: 'Secure Sockets Layer toolkit - cryptographic utility', libssl3t64: 'Secure Sockets Layer toolkit - shared libraries', 'openssh-server': 'secure shell (SSH) server, for secure access from remote machines', 'linux-image-generic': 'Generic Linux kernel image' };
  const pending = (sh) => sh.pendingUpdates || [];
  LX.pkgVer = (sh, p) => {
    if (sh.pkgVers && sh.pkgVers[p]) return sh.pkgVers[p];
    const pd = pending(sh).find((x) => x.name === p);
    if (pd) return pd.from;
    return (LX.PKGS[p] && LX.PKGS[p].ver) || VERS[p] || '1.0-1';
  };
  const candVer = (sh, p) => {
    const pd = pending(sh).find((x) => x.name === p);
    return pd ? pd.to : LX.pkgVer(sh, p);
  };
  const known = (p) => !!(LX.PKGS[p] || LX.DEFAULT_PKGS.includes(p) || VERS[p]);

  /* ---------- the sandbox "internet": third-party repo, keys, source tarball ---------- */
  Object.assign(LX.DNS, { 'repo.acme.example': '203.0.113.50', 'dl.acme.example': '203.0.113.51', 'ppa.launchpadcontent.net': '185.125.190.80', 'download.docker.com': '18.155.68.12', 'dead.repo.example': '203.0.113.99' });
  delete LX.DNS['dead.repo.example'];
  const ACME_KEY = '-----BEGIN PGP PUBLIC KEY BLOCK-----\nComment: ACME Packaging <pkg@acme.example>\n\nmQINBGXoQz4BEADK3m9v7Zr2N0h2QZ1f2yVq0m8nWc6l3o0Xk7bT5pQe1uJd4RsA\nFh9x2yQpLw0cZ3vN8mTqU6aYb1dK5eH7jGi0oPrS4tVwXz2nCfLm9qB3uE6yAh1k\n=Q7xz\n-----END PGP PUBLIC KEY BLOCK-----\n';
  const ACME_FPR = '9A4F6B2C91D8E0574F8E2A91C7D3B605A1B2C3D4';
  const SRC_FILES = {
    'hello-2.1/README': 'hello 2.1 - a tiny demo program\n\nBuild and install:\n    ./configure --prefix=/usr/local\n    make\n    sudo make install\n\nRemove again:\n    sudo make uninstall\n',
    'hello-2.1/hello.c': '#include <stdio.h>\n\nint main(void)\n{\n    printf("Hello from source build 2.1!\\n");\n    return 0;\n}\n',
    'hello-2.1/Makefile': '-include config.mk\nPREFIX ?= /usr/local\n\nhello: hello.c\n\tgcc -o hello hello.c\n\ninstall: hello\n\tinstall -d $(PREFIX)/bin\n\tinstall -m 755 hello $(PREFIX)/bin/hello\n\nuninstall:\n\trm -f $(PREFIX)/bin/hello\n\nclean:\n\trm -f hello config.mk\n',
    'hello-2.1/configure': '#!/bin/sh\n# tiny configure script\nPREFIX=/usr/local\nfor arg in "$@"; do\n  case "$arg" in\n    --prefix=*) PREFIX="${arg#--prefix=}" ;;\n  esac\ndone\nif command -v gcc >/dev/null 2>&1; then\n  echo "checking for gcc... yes"\nelse\n  echo "checking for gcc... no"\n  echo "configure: error: no acceptable C compiler found in \\$PATH" >&2\n  exit 1\nfi\nif command -v make >/dev/null 2>&1; then\n  echo "checking for make... yes"\nelse\n  echo "checking for make... no"\n  echo "configure: error: make is required" >&2\n  exit 1\nfi\necho "PREFIX = $PREFIX" > config.mk\necho "configure: creating config.mk"\necho "configure: done. Now run: make"\n',
  };
  const buildSrcItems = (sh) => {
    const items = [{ path: 'hello-2.1', node: sh.fs.mk('d', { mode: 0o755 }) }];
    for (const [p, content] of Object.entries(SRC_FILES)) items.push({ path: p, node: sh.fs.mk('f', { content, mode: /configure$/.test(p) ? 0o755 : 0o644 }) });
    return items;
  };
  const DOWNLOADS = { 'dl.acme.example/src/hello-2.1.tar.gz': { size: 14200, items: buildSrcItems }, 'ftp.gnu.org/gnu/hello/hello-2.1.tar.gz': { size: 14200, items: buildSrcItems } };
  LX.DNS['ftp.gnu.org'] = '209.51.188.20';
  const origHttp = LX.httpRequest;
  LX.httpRequest = async function (sh, o) {
    const ip = sh.resolveHost ? sh.resolveHost(o.host) : null;
    const key = o.host + (o.path || '/').split('?')[0];
    if (ip && !sh.ownIps().includes(ip) && (/^(repo|dl)\.acme\.example$/.test(o.host) || DOWNLOADS[key])) {
      if (!sh.netUp()) return { err: 7, msg: `Failed to connect to ${o.host} port ${o.port} after 0 ms: Network is unreachable` };
      const hd = { 'Content-Type': 'text/plain', Server: 'nginx', Date: new Date().toUTCString() };
      if (key === 'repo.acme.example/acme.gpg' || key === 'repo.acme.example/acme.asc') return { status: 200, headers: hd, body: ACME_KEY, ip };
      if (LX.WEBTEXT && LX.WEBTEXT[key]) return { status: 200, headers: Object.assign({}, hd, { 'Content-Type': 'text/x-shellscript' }), body: LX.WEBTEXT[key], ip };
      if (DOWNLOADS[key]) return { status: 200, headers: Object.assign({}, hd, { 'Content-Type': 'application/gzip' }), body: '\x1f\x8b(binary data)', ip, download: key };
      if (o.host === 'repo.acme.example' && (o.path === '/' || o.path === '/apt/')) return { status: 200, headers: Object.assign({}, hd, { 'Content-Type': 'text/html' }), body: '<html><body><h1>ACME package repository</h1><p>Key: <a href="/acme.gpg">acme.gpg</a></p></body></html>\n', ip };
      return { status: 404, headers: Object.assign({}, hd, { 'Content-Type': 'text/html' }), body: '<html><head><title>404 Not Found</title></head><body><center><h1>404 Not Found</h1></center><hr><center>nginx</center></body></html>\n', ip };
    }
    return origHttp(sh, o);
  };
  // after wget/curl saved a known tarball, turn the file into a real archive that tar can open
  const attachArchive = (c, urls, fileOf) => {
    for (const u of urls) {
      const m = /^(?:https?:\/\/)?([^/]+)(\/[^?#]*)/.exec(u);
      if (!m) continue;
      const dl = DOWNLOADS[m[1] + m[2]];
      if (!dl) continue;
      const name = fileOf(m[2]);
      const n = c.sh.fs.lookup(name.startsWith('/') ? name : c.sh.cwd + '/' + name);
      if (n && !n.archive) {
        n.archive = { kind: 'tar', gz: true, comp: 'gz', items: dl.items(c.sh) };
        n.size = dl.size;
        n.bin = true;
      }
    }
  };
  for (const nm of ['wget', 'curl']) {
    const orig = LX.cmds[nm].run;
    def(nm, async (c, args) => {
      const st = await orig(c, args);
      if (st === 0) {
        const urls = args.filter((a) => /^(https?:\/\/)?[\w.-]+\/.*\.tar\.gz/.test(a));
        const oi = args.findIndex((a) => a === '-O' || a === '-o' || a === '--output');
        const hasO = nm === 'curl' && args.some((a) => a === '-O' || /^-\w*O\w*$/.test(a));
        const pi = args.indexOf('-P');
        attachArchive(c, urls, (p) => {
          const base = VFS.base(p);
          if (nm === 'wget') return (oi >= 0 && args[oi] === '-O' ? args[oi + 1] : null) || (pi >= 0 ? args[pi + 1] + '/' + base : base);
          if (oi >= 0 && args[oi] !== '-O') return args[oi + 1];
          return hasO ? base : base;
        });
      }
      return st;
    });
  }

  /* ---------- gpg --dearmor / --show-keys (for apt repository keys) ---------- */
  const origGpg = LX.cmds.gpg.run;
  def('gpg', async (c, args) => {
    const sh = c.sh;
    const isArmor = (s) => /BEGIN PGP PUBLIC KEY BLOCK/.test(s);
    if (args.includes('--dearmor') || args.includes('--enarmor')) {
      const oi = args.findIndex((a) => a === '-o' || a === '--output');
      const outF = oi >= 0 ? args[oi + 1] : null;
      const inF = args.filter((a, i) => !a.startsWith('-') && i !== oi + 1).pop();
      let text;
      try {
        text = inF ? sh.readFile(c.abs(inF)) : await c.slurp();
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`gpg: can't open '${inF}': ${U.errTxt(e)}\n`);
        return 2;
      }
      if (!isArmor(text)) {
        c.err('gpg: no valid OpenPGP data found.\ngpg: dearmoring failed: Unknown system error\n');
        return 2;
      }
      if (!outF) {
        c.out('\u0099\u0002\r\u0004eèC>\u0001\u0010(binary key data)\n');
        return 0;
      }
      if (sh.fs.lookup(c.abs(outF)) && !args.includes('--yes')) {
        c.err(`File '${outF}' exists. Overwrite? (y/N) \ngpg: dearmoring failed: File exists\n`);
        return 2;
      }
      try {
        sh.writeFile(c.abs(outF), '\u0099\u0002\r\u0004eèC>\u0001\u0010(binary key data)', false);
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`gpg: can't create '${outF}': ${U.errTxt(e)}\ngpg: dearmoring failed: ${U.errTxt(e)}\n`);
        return 2;
      }
      const n = sh.fs.lookup(c.abs(outF));
      n.bin = true;
      n.size = 1580;
      if (/ACME Packaging/.test(text)) n.pgpKey = 'acme';
      return 0;
    }
    if (args.includes('--show-keys') || args.includes('--list-packets') || args.includes('--import-options')) {
      const f = args.filter((a) => !a.startsWith('-')).pop();
      let n = f && sh.fs.lookup(c.abs(f));
      if (!n && !f) {
        const t = await c.slurp();
        n = { content: t, pgpKey: /ACME Packaging/.test(t) ? 'acme' : null };
      }
      if (!n || (!n.pgpKey && !(n.content && isArmor(n.content)))) {
        c.err(`gpg: no valid OpenPGP data found.\n`);
        return 2;
      }
      const acme = n.pgpKey === 'acme' || /ACME Packaging/.test(n.content || '');
      c.out(`pub   rsa4096 2024-03-01 [SC]\n      ${acme ? ACME_FPR : '0000000000000000000000000000000000000000'}\nuid                      ${acme ? 'ACME Packaging <pkg@acme.example>' : 'unknown'}\nsub   rsa4096 2024-03-01 [E]\n`);
      return 0;
    }
    return origGpg(c, args);
  });
  // the armored key saved with curl -o also counts as a key (extension .asc)
  const keyState = (sh, path) => {
    const n = sh.fs.lookup(path);
    if (!n || n.t === 'd') return 'missing';
    const armored = /BEGIN PGP PUBLIC KEY BLOCK/.test(n.content || '');
    if (n.pgpKey === 'acme') return 'ok';
    if (armored && /ACME Packaging/.test(n.content || '')) return /\.asc$/.test(path) ? 'ok' : 'armored';
    return 'ok-other';
  };

  /* ---------- apt sources ---------- */
  const readSources = (sh) => {
    const out = [];
    const files = ['/etc/apt/sources.list'];
    const d = sh.fs.lookup('/etc/apt/sources.list.d');
    if (d && d.kids) for (const k of Object.keys(d.kids).sort()) if (/\.(list|sources)$/.test(k)) files.push('/etc/apt/sources.list.d/' + k);
    for (const f of files) {
      let txt = '';
      try {
        txt = sh.readFile(f);
      } catch (e) {
        continue;
      }
      if (f.endsWith('.sources')) {
        for (const blk of txt.split(/\n\s*\n/)) {
          const g = (k) => {
            const m = new RegExp('^' + k + ':\\s*(.+)$', 'mi').exec(blk);
            return m ? m[1].trim() : null;
          };
          const uri = g('URIs');
          if (uri && /deb/.test(g('Types') || '') && !/Enabled:\s*no/i.test(blk)) out.push({ file: f, url: uri.split(/\s+/)[0], suite: (g('Suites') || 'stable').split(/\s+/)[0], comp: g('Components') || 'main', signedBy: g('Signed-By') });
        }
        continue;
      }
      for (const raw of txt.split('\n')) {
        const l = raw.replace(/#.*$/, '').trim();
        const m = /^deb(\s+\[([^\]]*)\])?\s+(\S+)\s+(\S+)\s*(.*)$/.exec(l);
        if (!m) continue;
        const opts = m[2] || '';
        const sb = /signed-by=(\S+)/.exec(opts);
        out.push({ file: f, url: m[3], suite: m[4], comp: m[5] || '', signedBy: sb ? sb[1] : null, opts });
      }
    }
    return out;
  };
  const isUbuntuRepo = (u) => /(archive|security|ports)\.ubuntu\.com/.test(u);
  /** probe third-party repos; returns {lines, errors, warns, enabled:Set} */
  const probeRepos = (sh, startN) => {
    const lines = [];
    const errs = [];
    const warns = [];
    const enabled = new Set();
    let n = startN;
    for (const s of readSources(sh)) {
      if (isUbuntuRepo(s.url)) continue;
      const host = (/^[a-z]+:\/\/([^/:]+)/i.exec(s.url) || [])[1] || '';
      const rel = `${s.url} ${s.suite}`;
      n++;
      if (!sh.resolveHost(host)) {
        lines.push(`Err:${n} ${rel} InRelease\n  Temporary failure resolving '${host}'`);
        warns.push(`W: Failed to fetch ${s.url}/dists/${s.suite}/InRelease  Temporary failure resolving '${host}'`);
        continue;
      }
      if (!sh.netUp()) {
        lines.push(`Err:${n} ${rel} InRelease\n  Network is unreachable`);
        warns.push(`W: Failed to fetch ${s.url}/dists/${s.suite}/InRelease  Network is unreachable`);
        continue;
      }
      const isAcme = host === 'repo.acme.example';
      const isKnownGood = isAcme || /ppa\.launchpadcontent\.net|download\.docker\.com/.test(host);
      if (!isKnownGood) {
        lines.push(`Ign:${n} ${rel} InRelease\nErr:${n} ${rel} Release\n  404  Not Found [IP: ${sh.resolveHost(host)} 443]`);
        errs.push(`E: The repository '${rel} Release' does not have a Release file.`, `N: Updating from such a repository can't be done securely, and is therefore disabled by default.`, 'N: See apt-secure(8) manpage for repository creation and user configuration details.');
        continue;
      }
      // signing key check
      let keyProblem = null;
      if (s.signedBy) {
        const st = keyState(sh, s.signedBy);
        if (st === 'missing') keyProblem = `no such file ${s.signedBy}`;
        else if (st === 'armored' && isAcme) keyProblem = 'armored';
      } else if (isAcme) {
        const d = sh.fs.lookup('/etc/apt/trusted.gpg.d');
        const ok = d && Object.values(d.kids || {}).some((k) => k.pgpKey === 'acme');
        if (!ok) keyProblem = 'nokey';
      }
      if (keyProblem === 'armored' || keyProblem === 'nokey' || (keyProblem && isAcme)) {
        lines.push(`Get:${n} ${rel} InRelease [3,412 B]\nErr:${n} ${rel} InRelease\n  The following signatures couldn't be verified because the public key is not available: NO_PUBKEY ${ACME_FPR.slice(-16)}`);
        errs.push(`W: GPG error: ${rel} InRelease: The following signatures couldn't be verified because the public key is not available: NO_PUBKEY ${ACME_FPR.slice(-16)}`, `E: The repository '${rel} InRelease' is not signed.`, `N: Updating from such a repository can't be done securely, and is therefore disabled by default.`, 'N: See apt-secure(8) manpage for repository creation and user configuration details.');
        continue;
      }
      if (keyProblem) {
        lines.push(`Err:${n} ${rel} InRelease\n  Could not open ${s.signedBy}`);
        errs.push(`E: The repository '${rel} InRelease' is not signed.`);
        continue;
      }
      lines.push(`Get:${n} ${rel} InRelease [3,412 B]\nGet:${n + 1} ${s.url} ${s.suite}/${(s.comp || 'main').split(/\s+/)[0]} amd64 Packages [1,208 B]`);
      n++;
      enabled.add(isAcme ? 'acme' : host);
    }
    return { lines, errs, warns, enabled };
  };
  LX.PKGS['acme-cli'] = { ver: '2.4.0-1', desc: 'ACME command line client (from the ACME repository)', size: 1250, bins: ['acme'], repo: 'acme' };
  def('acme', async (c, args) => {
    if (args[0] === '--version' || args[0] === 'version') return c.out('acme 2.4.0 (build 7f3a9c1)\n');
    c.out('acme - ACME command line client 2.4.0\nUsage: acme [version|status|help]\n');
    return 0;
  }, { pkg: 'acme-cli' });
  const repoAvailable = (sh, p) => {
    const pk = LX.PKGS[p];
    return !pk || !pk.repo || (sh.aptRepos && sh.aptRepos.has(pk.repo)) || sh.installed.has(p);
  };
  const hideUnavailable = async (sh, fn) => {
    const saved = {};
    for (const [k, v] of Object.entries(LX.PKGS)) if (v.repo && !repoAvailable(sh, k)) saved[k] = v;
    for (const k of Object.keys(saved)) delete LX.PKGS[k];
    try {
      return await fn();
    } finally {
      Object.assign(LX.PKGS, saved);
    }
  };

  /* ---------- history logs ---------- */
  const stamp = (d) => U.strftime('%F  %T', d);
  const logPkgChange = (sh, cmdline, before, after, upg, kind) => {
    const inst = [...after].filter((p) => !before.has(p) && known(p));
    const rem = [...before].filter((p) => !after.has(p));
    const up = upg || [];
    if (!inst.length && !rem.length && !up.length) return;
    const now = new Date();
    const who = sh.user || 'learner';
    const uid = (sh.users && sh.users[who] && sh.users[who].uid) || 1000;
    const fmt = (p, v) => `${p}:amd64 (${v})`;
    let h = `Start-Date: ${stamp(now)}\nCommandline: ${cmdline}\nRequested-By: ${who} (${uid})\n`;
    if (inst.length) h += `Install: ${inst.map((p) => fmt(p, LX.pkgVer(sh, p))).join(', ')}\n`;
    if (up.length) h += `Upgrade: ${up.map((u) => fmt(u.name, `${u.from}, ${u.to}`)).join(', ')}\n`;
    if (rem.length) h += `${kind === 'purge' ? 'Purge' : 'Remove'}: ${rem.map((p) => fmt(p, LX.pkgVer(sh, p))).join(', ')}\n`;
    h += `End-Date: ${stamp(new Date())}\n\n`;
    const d = U.strftime('%F %T', now);
    let dl = '';
    for (const p of inst) dl += `${d} install ${p}:amd64 <none> ${LX.pkgVer(sh, p)}\n${d} status installed ${p}:amd64 ${LX.pkgVer(sh, p)}\n`;
    for (const u of up) dl += `${d} upgrade ${u.name}:amd64 ${u.from} ${u.to}\n${d} status installed ${u.name}:amd64 ${u.to}\n`;
    for (const p of rem) dl += `${d} remove ${p}:amd64 ${LX.pkgVer(sh, p)} <none>\n${d} status not-installed ${p}:amd64 <none>\n`;
    sh.writeFile('/var/log/apt/history.log', h, true);
    sh.writeFile('/var/log/dpkg.log', dl, true);
  };
  LX.initHooks.push((sh) => {
    sh.fs.mkdirp('/etc/apt/sources.list.d', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/etc/apt/keyrings', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/etc/apt/trusted.gpg.d', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/var/log/apt', { owner: 'root', group: 'adm' });
    sh.fs.put('/var/log/apt/history.log', 'Start-Date: 2026-10-20  08:00:12\nCommandline: apt-get install -y openssh-server sudo curl\nRequested-By: ubuntu (1000)\nInstall: openssh-server:amd64 (1:9.6p1-3ubuntu13.4), sudo:amd64 (1.9.15p5-3ubuntu5), curl:amd64 (8.5.0-2ubuntu10.3)\nEnd-Date: 2026-10-20  08:00:41\n\n', { owner: 'root', group: 'adm', mode: 0o644 });
    sh.aptHold = new Set();
    sh.aptRepos = new Set();
    sh.pkgVers = {};
  });

  /* ---------- apt wrapper ---------- */
  const PEND_DESC = { openssl: 'Secure Sockets Layer toolkit', libssl3t64: 'Secure Sockets Layer toolkit - shared libraries' };
  for (const nm of ['apt', 'apt-get']) {
    const orig = LX.cmds[nm].run;
    def(nm, async (c, args) => {
      const sh = c.sh;
      if (!sh.aptHold) sh.aptHold = new Set();
      if (!sh.aptRepos) sh.aptRepos = new Set();
      const isRoot = sh.eu() === 'root';
      args = args.map((a) => (a === '--upgradeable' ? '--upgradable' : a));
      const reinstall = args.includes('--reinstall');
      const sim = args.some((a) => a === '-s' || a === '--simulate' || a === '--dry-run' || a === '--just-print' || a === '--recon' || a === '--no-act');
      const allowHeld = args.includes('--allow-change-held-packages');
      args = args.filter((a) => !['--reinstall', '--simulate', '--dry-run', '--just-print', '--recon', '--no-act', '--allow-change-held-packages'].includes(a) && a !== '-s');
      const flagless = args.filter((a) => !a.startsWith('-'));
      let sub = flagless[0];
      const pk = flagless.slice(1);
      if (sub === 'reinstall') {
        sub = 'install';
        args = args.map((a) => (a === 'reinstall' ? 'install' : a));
      }
      const before = new Set(sh.installed);
      const pendBefore = pending(sh).slice();
      const cmdline = `${nm} ${args.join(' ')}`;
      const hold = sh.aptHold;
      const snapRepo = () => (sh.aptRepos = sh.aptRepos || new Set());
      snapRepo();

      /* unknown-name check for repo-only packages */
      if (['install', 'show', 'info', 'download', 'policy'].includes(sub)) {
        for (const p of pk) {
          const nmOnly = p.split('=')[0];
          if (LX.PKGS[nmOnly] && LX.PKGS[nmOnly].repo && !repoAvailable(sh, nmOnly)) {
            if (sub === 'install' && !isRoot && !sim) break;
            c.err(sub === 'show' || sub === 'info' ? 'E: No packages found\n' : `E: Unable to locate package ${nmOnly}\n`);
            if (sub === 'install') {
              /* real apt prints the same when no list contains it */
            }
            return 100;
          }
        }
      }

      /* ---- simulation ---- */
      if (sim && ['install', 'upgrade', 'full-upgrade', 'dist-upgrade', 'remove', 'purge', 'autoremove'].includes(sub)) {
        const hdr = 'NOTE: This is only a simulation!\n      apt needs root privileges for real execution.\n      Keep also in mind that locking is deactivated,\n      so don\'t depend on the relevance to the real current situation!\nReading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\n';
        if (sub === 'install') {
          const todo = [];
          for (const p of pk) {
            const q = p.split('=')[0];
            if (!known(q)) {
              c.err(`E: Unable to locate package ${q}\n`);
              return 100;
            }
            if (!sh.installed.has(q) || reinstall) todo.push(q);
          }
          if (!todo.length) return c.out(hdr + `${pk[0]} is already the newest version (${LX.pkgVer(sh, pk[0])}).\n0 upgraded, 0 newly installed, 0 to remove and ${pending(sh).length} not upgraded.\n`), 0;
          const fresh = todo.filter((p) => !sh.installed.has(p));
          c.out(hdr + (fresh.length ? `The following NEW packages will be installed:\n  ${fresh.join(' ')}\n` : '') + `0 upgraded, ${fresh.length} newly installed, ${reinstall ? todo.length - fresh.length : 0} reinstalled, 0 to remove and ${pending(sh).length} not upgraded.\n`);
          todo.forEach((p) => c.out(`Inst ${p} (${(LX.PKGS[p] || {}).ver || candVer(sh, p)} Ubuntu:24.04/noble [amd64])\n`));
          todo.forEach((p) => c.out(`Conf ${p} (${(LX.PKGS[p] || {}).ver || candVer(sh, p)} Ubuntu:24.04/noble [amd64])\n`));
          return 0;
        }
        if (['upgrade', 'full-upgrade', 'dist-upgrade'].includes(sub)) {
          const pend = pending(sh).filter((x) => !hold.has(x.name));
          const kept = pending(sh).filter((x) => hold.has(x.name));
          c.out(hdr + (kept.length ? `The following packages have been kept back:\n  ${kept.map((x) => x.name).join(' ')}\n` : '') + (pend.length ? `The following packages will be upgraded:\n  ${pend.map((x) => x.name).join(' ')}\n` : '') + `${pend.length} upgraded, 0 newly installed, 0 to remove and ${kept.length} not upgraded.\n`);
          pend.forEach((x) => c.out(`Inst ${x.name} [${x.from}] (${x.to} Ubuntu:24.04/${x.repo} [amd64])\n`));
          pend.forEach((x) => c.out(`Conf ${x.name} (${x.to} Ubuntu:24.04/${x.repo} [amd64])\n`));
          return 0;
        }
        const rem = pk.filter((p) => sh.installed.has(p));
        c.out(hdr + (rem.length ? `The following packages will be REMOVED:\n  ${rem.join(' ')}\n` : '') + `0 upgraded, 0 newly installed, ${rem.length} to remove and ${pending(sh).length} not upgraded.\n`);
        rem.forEach((p) => c.out(`Remv ${p} [${LX.pkgVer(sh, p)}]\n`));
        return 0;
      }

      /* ---- show / policy for base packages ---- */
      if ((sub === 'show' || sub === 'info') && pk[0] && !LX.PKGS[pk[0]] && known(pk[0])) {
        const p = pk[0];
        c.out(`Package: ${p}\nVersion: ${LX.pkgVer(sh, p)}\nPriority: ${['bash', 'coreutils', 'sudo', 'apt', 'util-linux', 'grep', 'sed', 'tar', 'gzip', 'passwd', 'findutils', 'diffutils'].includes(p) ? 'required' : 'optional'}\nSection: ${p === 'python3' ? 'python' : p === 'curl' || p === 'wget' ? 'web' : 'utils'}\nOrigin: Ubuntu\nMaintainer: Ubuntu Developers <ubuntu-devel-discuss@lists.ubuntu.com>\nBugs: https://bugs.launchpad.net/ubuntu/+filebug\nInstalled-Size: ${300 + p.length * 40} kB\nHomepage: https://packages.ubuntu.com/noble/${p}\nTask: ubuntu-server\nDescription: ${DESCS[p] || 'core system package'}\nApt-Manual-Installed: yes\nApt-Sources: http://archive.ubuntu.com/ubuntu noble/main amd64 Packages\n`);
        return 0;
      }
      if ((sub === 'show' || sub === 'info') && pk[0] && LX.PKGS[pk[0]]) {
        const p = pk[0];
        const q = LX.PKGS[p];
        c.out(`Package: ${p}\nVersion: ${q.ver}\nPriority: optional\nSection: ${q.repo ? 'misc' : 'universe/utils'}\nOrigin: ${q.repo ? 'ACME' : 'Ubuntu'}\nMaintainer: ${q.repo ? 'ACME Packaging <pkg@acme.example>' : 'Ubuntu Developers <ubuntu-devel-discuss@lists.ubuntu.com>'}\nInstalled-Size: ${q.size * 3} kB\n${q.service ? 'Depends: libc6 (>= 2.34), libssl3t64 (>= 3.0.0)\n' : ''}Download-Size: ${q.size} kB\nAPT-Sources: ${q.repo ? 'https://repo.acme.example/apt stable/main amd64 Packages' : 'http://archive.ubuntu.com/ubuntu noble/universe amd64 Packages'}\nDescription: ${q.desc}\n`);
        return 0;
      }
      if (sub === 'policy') {
        return LX.cmds['apt-cache'].run(c, ['policy', ...pk]);
      }
      if (sub === 'download') {
        const p = (pk[0] || '').split('=')[0];
        if (!p) { c.err('E: Must specify at least one package to download\n'); return 100; }
        if (!known(p) && !(LX.PKGS[p])) { c.err(`E: Unable to locate package ${p}\n`); return 100; }
        if (!sh.netUp()) { c.err(`Err:1 http://archive.ubuntu.com/ubuntu noble/universe amd64 ${p} amd64 ${candVer(sh, p)}\n  Temporary failure resolving 'archive.ubuntu.com'\nE: Failed to fetch http://archive.ubuntu.com/ubuntu/pool/universe/${p[0]}/${p}/${p}_${candVer(sh, p)}_amd64.deb  Temporary failure resolving 'archive.ubuntu.com'\n`); return 100; }
        const ver = candVer(sh, p);
        const fname = `${p}_${ver.replace(/^\d+:/, '')}_amd64.deb`;
        const kb = (LX.PKGS[p] && LX.PKGS[p].size) || 120;
        try {
          sh.writeFile(sh.cwd + '/' + fname, '!<arch>\ndebian-binary   2.0\n', false);
        } catch (e) {
          if (!(e instanceof FsErr)) throw e;
          c.err(`E: Can't create ${fname}: ${U.errTxt(e)}\n`);
          return 100;
        }
        const n = sh.fs.lookup(sh.cwd + '/' + fname);
        n.debPkg = p;
        n.bin = true;
        n.size = kb * 1024;
        c.out(`Get:1 http://archive.ubuntu.com/ubuntu noble/universe amd64 ${p} amd64 ${ver} [${kb} kB]\nFetched ${kb} kB in 0s (${kb * 5} kB/s)\n`);
        return 0;
      }
      if (sub === 'list' || sub === 'search') {
        if (args.includes('--manual-installed')) {
          c.out('Listing... Done\n');
          [...LX.DEFAULT_PKGS.filter((p) => sh.installed.has(p) || true), ...(sh.aptManual || [])].filter((p, i, a) => a.indexOf(p) === i && sh.installed.has(p)).sort().forEach((p) => c.out(`${p}/noble ${LX.pkgVer(sh, p)} amd64 [installed]\n`));
          return 0;
        }
        const r = await hideUnavailable(sh, () => orig(c, args));
        return r;
      }

      /* ---- remove on held packages ---- */
      if ((sub === 'remove' || sub === 'purge') && pk.some((p) => hold.has(p)) && !allowHeld) {
        if (!isRoot) { c.err('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?\n'); return 100; }
        c.out('Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\n');
        c.err('E: Held packages were changed and -y was used without --allow-change-held-packages.\n');
        return 100;
      }

      /* ---- update: also probe third-party repos ---- */
      if (sub === 'update') {
        if (!isRoot) return orig(c, args);
        let buf = '';
        const c2 = Object.assign({}, c, { out: (s) => (buf += s), io: Object.assign({}, c.io, { stdout: (s) => (buf += s) }) });
        const st = await orig(c2, args);
        if (st) {
          c.out(buf);
          return st;
        }
        const pr = probeRepos(sh, 3);
        sh.aptRepos = pr.enabled;
        // splice the extra repo lines in before the "Fetched" summary
        const extra = pr.lines.length ? pr.lines.join('\n') + '\n' : '';
        let outText = buf.replace(/(Fetched )/, extra + '$1');
        if (pr.warns.length && !pr.errs.length) outText += pr.warns.join('\n') + '\nW: Some index files failed to download. They have been ignored, or old ones used instead.\n';
        c.out(outText);
        if (pr.errs.length) {
          c.err(pr.warns.concat(pr.errs).join('\n') + '\n');
          return 100;
        }
        return 0;
      }

      /* ---- upgrade honours holds ---- */
      if (['upgrade', 'full-upgrade', 'dist-upgrade'].includes(sub) && hold.size && isRoot) {
        const held = pending(sh).filter((x) => hold.has(x.name));
        const free = pending(sh).filter((x) => !hold.has(x.name));
        if (held.length) {
          sh.pendingUpdates = free;
          let buf = '';
          const c2 = Object.assign({}, c, { out: (s) => (buf += s), io: Object.assign({}, c.io, { stdout: (s) => (buf += s) }) });
          const st = await orig(c2, args);
          sh.pendingUpdates = (sh.pendingUpdates || []).concat(held);
          const kept = `The following packages have been kept back:\n  ${held.map((x) => x.name).join(' ')}\n`;
          let t = buf.replace(/(\d+ upgraded, \d+ newly installed, \d+ to remove and )\d+( not upgraded\.)/, `$1${held.length}$2`);
          if (/The following packages will be upgraded:/.test(t)) t = t.replace(/(The following packages will be upgraded:)/, kept + '$1');
          else t = t.replace(/(\d+ upgraded, \d+ newly)/, kept + '$1');
          c.out(t);
          if (!st) {
            const done = pendBefore.filter((x) => !hold.has(x.name));
            done.forEach((x) => (sh.pkgVers[x.name] = x.to));
            logPkgChange(sh, cmdline, before, new Set(sh.installed), done, 'upgrade');
          }
          return st;
        }
      }

      /* ---- reinstall ---- */
      if (sub === 'install' && reinstall && isRoot) {
        const names = pk.map((p) => p.split('=')[0]);
        const todo = names.filter((p) => sh.installed.has(p) && known(p));
        if (todo.length) {
          c.out('Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\n' + `0 upgraded, 0 newly installed, ${todo.length} reinstalled, 0 to remove and ${pending(sh).length} not upgraded.\n`);
          todo.forEach((p) => c.out(`Preparing to unpack .../${p}_${LX.pkgVer(sh, p)}_amd64.deb ...\nUnpacking ${p} (${LX.pkgVer(sh, p)}) over (${LX.pkgVer(sh, p)}) ...\nSetting up ${p} (${LX.pkgVer(sh, p)}) ...\n`));
          sh.logEvent && sh.logEvent('apt', 6, `Reinstalled ${todo.join(' ')}`, { ident: 'apt' });
          sh.writeFile('/var/log/apt/history.log', `Start-Date: ${stamp(new Date())}\nCommandline: ${cmdline}\nRequested-By: ${sh.user} (1000)\nReinstall: ${todo.map((p) => `${p}:amd64 (${LX.pkgVer(sh, p)})`).join(', ')}\nEnd-Date: ${stamp(new Date())}\n\n`, true);
          return 0;
        }
      }
      if (sub === 'install' && !isRoot) return orig(c, args);

      /* ---- default: run, then log what changed ---- */
      const r = await orig(c, args);
      if (!r && ['install', 'remove', 'purge', 'upgrade', 'full-upgrade', 'dist-upgrade', 'autoremove'].includes(sub)) {
        const after = new Set(sh.installed);
        const up = ['upgrade', 'full-upgrade', 'dist-upgrade'].includes(sub) ? pendBefore.filter((x) => !pending(sh).some((y) => y.name === x.name)) : [];
        up.forEach((x) => (sh.pkgVers[x.name] = x.to));
        if (sub === 'install') {
          sh.aptManual = sh.aptManual || new Set();
          pk.forEach((p) => after.has(p) && sh.aptManual.add(p.split('=')[0]));
        }
        if (isRoot) logPkgChange(sh, cmdline, before, after, up, sub);
      }
      return r;
    });
  }

  /* ---------- apt-cache policy / madison ---------- */
  const origCache = LX.cmds['apt-cache'].run;
  def('apt-cache', async (c, args) => {
    const sh = c.sh;
    if (args[0] === 'policy') {
      const pk = args.slice(1).filter((a) => !a.startsWith('-'));
      if (!pk.length) {
        c.out('Package files:\n 100 /var/lib/dpkg/status\n     release a=now\n 500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages\n     release v=24.04,o=Ubuntu,a=noble-security,n=noble,l=Ubuntu,c=main,b=amd64\n     origin security.ubuntu.com\n 500 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages\n     release v=24.04,o=Ubuntu,a=noble-updates,n=noble,l=Ubuntu,c=main,b=amd64\n     origin archive.ubuntu.com\n 500 http://archive.ubuntu.com/ubuntu noble/main amd64 Packages\n     release v=24.04,o=Ubuntu,a=noble,n=noble,l=Ubuntu,c=main,b=amd64\n     origin archive.ubuntu.com\nPinned packages:\n');
        return 0;
      }
      for (const p of pk) {
        if (!known(p) && !LX.PKGS[p]) {
          c.err(`N: Unable to locate package ${p}\n`);
          continue;
        }
        if (LX.PKGS[p] && LX.PKGS[p].repo && !repoAvailable(sh, p)) {
          c.err(`N: Unable to locate package ${p}\n`);
          continue;
        }
        const inst = sh.installed.has(p) || !!pending(sh).find((x) => x.name === p) || !!(sh.pkgVers && sh.pkgVers[p]);
        const cur = LX.pkgVer(sh, p);
        const pd = pending(sh).find((x) => x.name === p);
        const cand = pd ? pd.to : (LX.PKGS[p] ? LX.PKGS[p].ver : cur);
        const origin = LX.PKGS[p] && LX.PKGS[p].repo ? '500 https://repo.acme.example/apt stable/main amd64 Packages' : '500 http://archive.ubuntu.com/ubuntu noble/main amd64 Packages';
        let t = `${p}:\n  Installed: ${inst ? cur : '(none)'}\n  Candidate: ${cand}\n  Version table:\n`;
        if (pd) {
          t += `     ${pd.to} 500\n        500 http://archive.ubuntu.com/ubuntu ${pd.repo}/main amd64 Packages\n ${inst ? '***' : '   '} ${pd.from} 500\n        ${origin}\n        100 /var/lib/dpkg/status\n`;
        } else {
          t += ` ${inst ? '***' : '   '} ${cand} 500\n        ${origin}\n${inst ? '        100 /var/lib/dpkg/status\n' : ''}`;
        }
        if (sh.aptHold && sh.aptHold.has(p)) t = t.replace(/Candidate:/, 'Candidate:');
        c.out(t);
      }
      return 0;
    }
    if (args[0] === 'madison') {
      const p = args[1];
      if (!known(p)) return 0;
      c.out(` ${p} | ${candVer(sh, p)} | http://archive.ubuntu.com/ubuntu noble/main amd64 Packages\n`);
      return 0;
    }
    return origCache(c, args);
  });

  /* ---------- apt-mark ---------- */
  def('apt-mark', async (c, args) => {
    const sh = c.sh;
    sh.aptHold = sh.aptHold || new Set();
    sh.aptManual = sh.aptManual || new Set();
    const rest = args.filter((a) => !a.startsWith('-'));
    const sub = rest[0];
    const pk = rest.slice(1);
    if (!sub) {
      c.out('Usage: apt-mark [options] {auto|manual} packages...\n       apt-mark [options] {minimize-manual|showauto|showmanual|showhold} [packages...]\n       apt-mark [options] {hold|unhold} packages...\n');
      return 0;
    }
    const lock = () => {
      if (sh.eu() !== 'root') {
        c.err('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?\n');
        return true;
      }
      return false;
    };
    switch (sub) {
      case 'hold':
      case 'unhold': {
        if (!pk.length) { c.err('E: No packages specified\n'); return 100; }
        if (lock()) return 100;
        for (const p of pk) {
          if (!sh.installed.has(p) && !known(p)) { c.err(`E: Unable to locate package ${p}\n`); return 100; }
          if (sub === 'hold') {
            if (sh.aptHold.has(p)) c.out(`${p} was already set on hold.\n`);
            else { sh.aptHold.add(p); c.out(`${p} set on hold.\n`); }
          } else if (sh.aptHold.has(p)) { sh.aptHold.delete(p); c.out(`Canceled hold on ${p}.\n`); }
          else c.out(`${p} was not on hold.\n`);
        }
        return 0;
      }
      case 'showhold':
        [...sh.aptHold].sort().forEach((p) => c.out(p + '\n'));
        return 0;
      case 'showmanual':
        LX.DEFAULT_PKGS.concat([...sh.aptManual]).filter((p, i, a) => a.indexOf(p) === i && sh.installed.has(p)).sort().forEach((p) => c.out(p + '\n'));
        return 0;
      case 'showauto':
        return 0;
      case 'manual':
      case 'auto':
        if (lock()) return 100;
        pk.forEach((p) => { if (sub === 'manual') sh.aptManual.add(p); else sh.aptManual.delete(p); c.out(`${p} set to ${sub === 'manual' ? 'manually' : 'automatically'} installed.\n`); });
        return 0;
    }
    c.err(`E: Invalid operation ${sub}\n`);
    return 100;
  }, { builtin: false });

  /* ---------- dpkg additions ---------- */
  const CORE_FILES = { ls: 'coreutils', cat: 'coreutils', cp: 'coreutils', mv: 'coreutils', rm: 'coreutils', mkdir: 'coreutils', chmod: 'coreutils', chown: 'coreutils', echo: 'coreutils', date: 'coreutils', head: 'coreutils', tail: 'coreutils', sort: 'coreutils', uniq: 'coreutils', wc: 'coreutils', cut: 'coreutils', id: 'coreutils', whoami: 'coreutils', sleep: 'coreutils', df: 'coreutils', du: 'coreutils', ln: 'coreutils', touch: 'coreutils', grep: 'grep', egrep: 'grep', sed: 'sed', awk: 'gawk', gawk: 'gawk', bash: 'bash', sh: 'dash', tar: 'tar', gzip: 'gzip', gunzip: 'gzip', find: 'findutils', xargs: 'findutils', nano: 'nano', curl: 'curl', wget: 'wget', python3: 'python3.12', ssh: 'openssh-client', scp: 'openssh-client', ping: 'iputils-ping', ps: 'procps', top: 'procps', free: 'procps', kill: 'procps', sudo: 'sudo', apt: 'apt', 'apt-get': 'apt', dpkg: 'dpkg', mount: 'mount', less: 'less', man: 'man-db', passwd: 'passwd', diff: 'diffutils', su: 'login', login: 'login', sshd: 'openssh-server', crontab: 'cron', cron: 'cron' };
  const CORE_PATHS = { '/etc/ssh/sshd_config': 'openssh-server', '/etc/ssh/ssh_config': 'openssh-client', '/etc/passwd': 'base-passwd', '/etc/group': 'base-passwd', '/etc/shadow': 'passwd', '/etc/sudoers': 'sudo', '/etc/nginx/nginx.conf': 'nginx-common', '/etc/hosts': 'netbase', '/etc/crontab': 'cron', '/etc/fstab': 'base-files', '/etc/os-release': 'base-files', '/etc/apt/sources.list': 'apt' };
  LX.ownerPkg = (sh, f) => {
    if (CORE_PATHS[f]) return CORE_PATHS[f];
    const hit = Object.entries(LX.PKGS).find(([k, q]) => sh.installed.has(k) && (q.bins || []).some((b) => f.endsWith('/' + b)));
    if (hit) return hit[0];
    const m = /^(?:\/usr)?\/(?:s?bin)\/([^/]+)$/.exec(f);
    if (m && CORE_FILES[m[1]]) return CORE_FILES[m[1]];
    return null;
  };
  const origDpkg = LX.cmds.dpkg.run;
  def('dpkg', async (c, args) => {
    const sh = c.sh;
    if (args[0] === '-S' || args[0] === '--search') {
      for (const f of args.slice(1)) {
        const p = LX.ownerPkg(sh, f);
        if (!p) { c.err(`dpkg-query: no path found matching pattern ${f}\n`); return 1; }
        c.out(`${p}: ${f}\n`);
      }
      return 0;
    }
    if (args[0] === '--list') args = ['-l'].concat(args.slice(1));
    if (args[0] === '-l' && args[1] && /[*?]/.test(args[1])) {
      const re = new RegExp('^' + args[1].replace(/[.+^$()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      const names = [...sh.installed].filter((k) => re.test(k)).sort();
      if (!names.length) { c.err(`dpkg-query: no packages found matching ${args[1]}\n`); return 1; }
      c.out('Desired=Unknown/Install/Remove/Purge/Hold\n| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend\n|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)\n||/ Name           Version            Architecture Description\n+++-==============-==================-============-=================================\n');
      names.forEach((k) => c.out(`ii  ${k.padEnd(14)} ${LX.pkgVer(sh, k).padEnd(18)} amd64        ${(LX.PKGS[k] || { desc: DESCS[k] || 'package' }).desc}\n`));
      return 0;
    }
    if (args[0] === '--get-selections') {
      [...sh.installed].sort().forEach((k) => c.out(`${k.padEnd(40)}${sh.aptHold && sh.aptHold.has(k) ? 'hold' : 'install'}\n`));
      return 0;
    }
    if (args[0] === '-I' || args[0] === '--info' || args[0] === '-c' || args[0] === '--contents') {
      const f = args[1];
      const n = f && sh.fs.lookup(c.abs(f));
      if (!n) { c.err(`dpkg-deb: error: failed to read archive '${f || ''}': No such file or directory\n`); return 2; }
      if (!n.debPkg) { c.err(`dpkg-deb: error: '${f}' is not a Debian format archive\n`); return 2; }
      const p = n.debPkg;
      if (args[0] === '-c' || args[0] === '--contents') {
        c.out(`drwxr-xr-x root/root         0 2026-03-01 10:00 ./\ndrwxr-xr-x root/root         0 2026-03-01 10:00 ./usr/\ndrwxr-xr-x root/root         0 2026-03-01 10:00 ./usr/bin/\n${((LX.PKGS[p] || {}).bins || [p]).map((b) => `-rwxr-xr-x root/root     48120 2026-03-01 10:00 ./usr/bin/${b}\n`).join('')}`);
        return 0;
      }
      c.out(` new Debian package, version 2.0.\n size ${n.size} bytes: control archive=812 bytes.\n Package: ${p}\n Version: ${candVer(sh, p)}\n Architecture: amd64\n Maintainer: ${(LX.PKGS[p] || {}).repo ? 'ACME Packaging <pkg@acme.example>' : 'Ubuntu Developers <ubuntu-devel-discuss@lists.ubuntu.com>'}\n Section: utils\n Priority: optional\n Description: ${(LX.PKGS[p] || { desc: DESCS[p] || 'package' }).desc || DESCS[p]}\n`);
      return 0;
    }
    if (args[0] === '-i' || args[0] === '--install') {
      const f = args[1];
      if (sh.eu() !== 'root') { c.err('dpkg: error: requested operation requires superuser privilege\n'); return 2; }
      const n = f && sh.fs.lookup(c.abs(f));
      if (!n) { c.err(`dpkg: error: cannot access archive '${f || ''}': No such file or directory\n`); return 2; }
      if (!n.debPkg) { c.err(`dpkg-deb: error: '${f}' is not a Debian format archive\ndpkg: error processing archive ${f} (--install):\n dpkg-deb --control subprocess returned error exit status 2\nErrors were encountered while processing:\n ${f}\n`); return 1; }
      const p = n.debPkg;
      const before = new Set(sh.installed);
      const ver = candVer(sh, p);
      const pd = pending(sh).find((x) => x.name === p);
      c.out(`${sh.installed.has(p) ? '' : `Selecting previously unselected package ${p}.\n(Reading database ... 71523 files and directories currently installed.)\n`}Preparing to unpack ${VFS.base(f)} ...\nUnpacking ${p} (${ver})${sh.installed.has(p) ? ` over (${LX.pkgVer(sh, p)})` : ''} ...\nSetting up ${p} (${ver}) ...\n`);
      sh.installed.add(p);
      ((LX.PKGS[p] || {}).bins || []).forEach((b) => sh.addBinary(b));
      if (LX.PKGS[p] && LX.PKGS[p].service) sh.services[p] = { desc: LX.PKGS[p].service.desc, active: true, enabled: true, pid: 900 + Math.floor(Math.random() * 90), proc: LX.PKGS[p].service.proc, since: Date.now() };
      if (sh.onInstall && LX.PKGS[p]) sh.onInstall(p, LX.PKGS[p]);
      if (pd) {
        sh.pkgVers[p] = pd.to;
        sh.pendingUpdates = pending(sh).filter((x) => x.name !== p);
        logPkgChange(sh, `dpkg -i ${f}`, before, new Set(sh.installed), [pd], 'upgrade');
      } else logPkgChange(sh, `dpkg -i ${f}`, before, new Set(sh.installed), [], 'install');
      return 0;
    }
    if (args[0] === '-r' || args[0] === '--remove' || args[0] === '-P' || args[0] === '--purge') {
      if (sh.eu() !== 'root') { c.err('dpkg: error: requested operation requires superuser privilege\n'); return 2; }
      for (const p of args.slice(1)) {
        if (!sh.installed.has(p)) { c.err(`dpkg: warning: ignoring request to remove ${p} which isn't installed\n`); continue; }
        if (LX.DEFAULT_PKGS.includes(p) && !LX.PKGS[p]) { c.err(`dpkg: error processing package ${p} (--remove):\n dependency problems - not removing\n`); return 1; }
        const before = new Set(sh.installed);
        const v = LX.pkgVer(sh, p);
        c.out(`(Reading database ... 71523 files and directories currently installed.)\nRemoving ${p} (${v}) ...\n`);
        sh.installed.delete(p);
        ((LX.PKGS[p] || {}).bins || []).forEach((b) => sh.removeBinary(b));
        if (sh.onRemove) sh.onRemove(p);
        if (sh.services[p]) delete sh.services[p];
        sh.pkgVers && delete sh.pkgVers[p];
        logPkgChange(sh, `dpkg ${args[0]} ${p}`, before, new Set(sh.installed), [], /^(-P|--purge)/.test(args[0]) ? 'purge' : 'remove');
      }
      return 0;
    }
    if (args[0] === '--configure' || args[0] === '--audit' || args[0] === '-C') {
      if (args[0] !== '--configure') return 0;
      if (sh.eu() !== 'root') { c.err('dpkg: error: requested operation requires superuser privilege\n'); return 2; }
      return 0;
    }
    if (args[0] === '--version') { c.out('Debian \'dpkg\' package management program version 1.22.6 (amd64).\n'); return 0; }
    return origDpkg(c, args);
  });
  def('dpkg-deb', async (c, args) => LX.cmds.dpkg.run(c, args.map((a) => (a === '--info' ? '-I' : a === '--contents' ? '-c' : a))));

  /* ---------- rpm -qf / dnf provides for base packages ---------- */
  const origRpm = LX.cmds.rpm.run;
  const rpmNameOf = (p) => ({ vim: 'vim-enhanced', dnsutils: 'bind-utils', 'openssh-client': 'openssh-clients', 'iputils-ping': 'iputils', 'python3.12': 'python3', 'nginx-common': 'nginx-core' }[p] || p);
  def('rpm', async (c, args) => {
    const sh = c.sh;
    const o = args.filter((a) => a.startsWith('-')).join('');
    const rest = args.filter((a) => !a.startsWith('-'));
    if (/q/.test(o) && /f/.test(o) && rest[0]) {
      const p = LX.ownerPkg(sh, rest[0]);
      if (p) { c.out(`${rpmNameOf(p)}-${((LX.PKGS[p] ? LX.PKGS[p].ver : '1.0').replace(/^\d+:/, '').replace(/-[\w.+~]+$/, '') || '1.0')}-1.el10.x86_64\n`); return 0; }
    }
    return origRpm(c, args);
  });
})();
