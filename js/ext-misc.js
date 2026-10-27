/* Linux Academy: smaller tools that real admin work uses (strace, logrotate, locate, hexdump, cal, patch, timeout ...) */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS } = LX;
  const U = LX.U;
  const q = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : "'" + String(s).replace(/'/g, "'\\''") + "'");
  const sub = (c, line, io) => c.sh.runSource(line, io || c.io);

  def('egrep', (c, a) => LX.cmds.grep.run(c, ['-E', ...a]));
  def('fgrep', (c, a) => LX.cmds.grep.run(c, ['-F', ...a]));
  def('dash', (c, a) => LX.cmds.sh.run(c, a));

  /* ---------- diff -u ---------- */
  const origDiff = LX.cmds.diff.run;
  def('diff', async (c, args) => {
    const uI = args.findIndex((a) => a === '-u' || /^-U\d+$/.test(a) || a === '--unified');
    if (uI < 0 || !LX.unifiedHunks) return origDiff(c, args);
    const files = args.filter((a) => !a.startsWith('-'));
    if (files.length !== 2) return origDiff(c, args);
    const sh = c.sh;
    const [a, b] = files;
    const na = sh.fs.lookup(c.abs(a));
    const nb = sh.fs.lookup(c.abs(b));
    if (!na || !nb) { c.err(`diff: ${!na ? a : b}: No such file or directory\n`); return 2; }
    if (na.t === 'd' || nb.t === 'd') return origDiff(c, args);
    const ctxN = /^-U(\d+)$/.test(args[uI]) ? +args[uI].slice(2) : 3;
    const body = LX.unifiedHunks(sh.readFile(c.abs(a)), sh.readFile(c.abs(b)), ctxN);
    if (!body) return 0;
    const ts = (n) => U.strftime('%F %H:%M:%S.000000000 %z', new Date(n.mtime || Date.now()));
    c.out(`--- ${a}\t${ts(na)}\n+++ ${b}\t${ts(nb)}\n${body}`);
    return 1;
  });

  /* ---------- systemctl extras: targets, dependencies, transient units ---------- */
  const TARGETS = [['basic.target', 'Basic System'], ['cloud-init.target', 'Cloud-init target'], ['cryptsetup.target', 'Local Encrypted Volumes'], ['getty.target', 'Login Prompts'], ['graphical.target', 'Graphical Interface'], ['local-fs.target', 'Local File Systems'], ['multi-user.target', 'Multi-User System'], ['network-online.target', 'Network is Online'], ['network.target', 'Network'], ['nss-user-lookup.target', 'User and Group Name Lookups'], ['paths.target', 'Path Units'], ['remote-fs.target', 'Remote File Systems'], ['slices.target', 'Slice Units'], ['sockets.target', 'Socket Units'], ['sysinit.target', 'System Initialization'], ['time-sync.target', 'System Time Synchronized'], ['timers.target', 'Timer Units']];
  const origSystemctl = LX.cmds.systemctl.run;
  const sysctl = async (c, args) => {
    const sh = c.sh;
    const pos = args.filter((a) => !a.startsWith('-'));
    const sub = pos[0];
    const typeArg = (args.find((a) => /^--type=/.test(a)) || '').slice(7) || (args.indexOf('-t') >= 0 ? args[args.indexOf('-t') + 1] : '');
    const defTarget = () => (sh.defaultTarget || 'graphical.target');
    if (sub === 'is-system-running') { c.out('running\n'); return 0; }
    if (sub === 'list-jobs') { c.out('No jobs running.\n'); return 0; }
    if (sub === 'list-sockets') { c.out('LISTEN                          UNIT                         ACTIVATES\n/run/dbus/system_bus_socket     dbus.socket                  dbus.service\n/run/systemd/journal/socket     systemd-journald.socket      systemd-journald.service\n/run/udev/control               systemd-udevd-control.socket systemd-udevd.service\n\n3 sockets listed.\n'); return 0; }
    if ((sub === 'list-units' || sub === undefined) && typeArg === 'target') {
      c.out('  UNIT                   LOAD   ACTIVE SUB    DESCRIPTION\n');
      TARGETS.filter((t) => t[0] !== 'graphical.target' || defTarget() === 'graphical.target').forEach((t) => c.out(`  ${t[0].padEnd(22)} loaded active active ${t[1]}\n`));
      c.out(`\nLOAD   = Reflects whether the unit definition was properly loaded.\nACTIVE = The high-level unit activation state, i.e. generalization of SUB.\nSUB    = The low-level unit activation state, values depend on unit type.\n\n${TARGETS.length} loaded units listed.\n`);
      return 0;
    }
    if (sub === 'list-dependencies') {
      let unit = pos[1] || 'default.target';
      if (unit === 'default.target') unit = defTarget();
      if (!/\.target$/.test(unit) && !sh.services[unit.replace(/\.service$/, '')]) { c.err(`Failed to get properties: Unit ${unit} not found.\n`); return 1; }
      c.out(`${unit}\n`);
      const svcs = Object.keys(sh.services).filter((n) => sh.services[n].enabled && !sh.services[n].masked).sort();
      const lines = [];
      if (unit === 'graphical.target') lines.push(['multi-user.target', true], ['systemd-update-utmp-runlevel.service', true]);
      else if (unit === 'multi-user.target') { svcs.forEach((n) => lines.push([n + '.service', !!sh.services[n].active])); lines.push(['basic.target', true], ['getty.target', true], ['network-online.target', true]); }
      else if (unit === 'basic.target') lines.push(['sysinit.target', true], ['sockets.target', true], ['timers.target', true], ['paths.target', true]);
      else if (/\.service$/.test(unit)) lines.push(['system.slice', true], ['sysinit.target', true], ['network.target', true]);
      else lines.push(['sysinit.target', true]);
      lines.forEach((l, i) => c.out(`${l[1] ? '\x1b[32m●\x1b[0m' : '○'} ${i === lines.length - 1 ? '└─' : '├─'}${l[0]}\n`));
      return 0;
    }
    if (sub === 'status' && /\.target$/.test(pos[1] || '')) {
      const t = TARGETS.find((x) => x[0] === pos[1]);
      if (!t) { c.out(`Unit ${pos[1]} could not be found.\n`); return 4; }
      c.out(`\x1b[1;32m●\x1b[0m ${t[0]} - ${t[1]}\n     Loaded: loaded (/usr/lib/systemd/system/${t[0]}; static)\n     Active: \x1b[1;32mactive\x1b[0m since ${U.strftime('%a %F %H:%M:%S %Z', new Date(sh.startTime))}; 3 days ago\n       Docs: man:systemd.special(7)\n`);
      return 0;
    }
    if (sub === 'set-default' && pos[1]) {
      if (!TARGETS.some((t) => t[0] === pos[1]) && !/^(rescue|emergency|poweroff|reboot)\.target$/.test(pos[1])) { c.err(`Failed to set default target: Unit file ${pos[1]} does not exist.\n`); return 1; }
      if (sh.eu() !== 'root') { c.err('Failed to set default target: Interactive authentication required.\n'); return 1; }
      sh.defaultTarget = pos[1];
      c.out(`Removed "/etc/systemd/system/default.target".\nCreated symlink /etc/systemd/system/default.target → /usr/lib/systemd/system/${pos[1]}.\n`);
      return 0;
    }
    if (sub === 'get-default') { c.out(defTarget() + '\n'); return 0; }
    return origSystemctl(c, args);
  };
  def('systemctl', sysctl);
  def('systemd-run', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root') { c.err('Failed to start transient service unit: Interactive authentication required.\n'); return 1; }
    const opts = args.filter((a) => a.startsWith('--'));
    const cmdline = args.filter((a) => !a.startsWith('--'));
    const id = 'run-r' + Math.floor(Math.random() * 90000 + 10000);
    const timer = opts.find((o) => /^--on-/.test(o));
    if (timer) {
      c.out(`Running timer as unit: ${id}.timer\nWill run service as unit: ${id}.service\n`);
      sh.transientTimers = (sh.transientTimers || []).concat([{ id, timer, cmd: cmdline.join(' ') }]);
      return 0;
    }
    c.out(`Running as unit: ${id}.service\n`);
    return await sh.runSource(cmdline.join(' '), c.io);
  });

  /* ---------- a disk that really fills up ---------- */
  const P0 = LX.Shell.prototype;
  const SKIP = new Set(['/proc', '/sys', '/dev', '/run']);
  P0.rootBytes = function () {
    const mounted = new Set((this.mounts || []).map((m) => m.target).filter((t) => t !== '/'));
    let t = 0;
    const rec = (n, path) => {
      if (SKIP.has(path) || mounted.has(path)) return;
      if (n.t === 'd') {
        t += 4096;
        for (const k of Object.keys(n.kids)) rec(n.kids[k], (path === '/' ? '' : path) + '/' + k);
      } else if (n.t === 'f') t += VFS.size(n);
    };
    rec(this.fs.lookup('/'), '/');
    return t;
  };
  const origRows = P0.dfRows;
  P0.dfRows = function () {
    const rows = origRows.call(this);
    const root = rows.find((r) => r.target === '/');
    if (root && this.rootSeed !== undefined) {
      root.rawUsed = Math.max(0, root.used + (this.rootBytes() - this.rootSeed));
      root.used = Math.min(root.size, root.rawUsed);
    }
    return rows;
  };
  P0.freeBytesAt = function (abs) {
    const rows = this.dfRows().filter((r) => r.target === '/' || abs === r.target || abs.startsWith(r.target + '/')).sort((a, b) => b.target.length - a.target.length);
    return rows.length ? rows[0].size - (rows[0].rawUsed !== undefined ? rows[0].rawUsed : rows[0].used) : Infinity;
  };
  const origWF = P0.writeFile;
  P0.writeFile = function (abs, data, append) {
    if (this.mounts && this.mounts.some((m) => /(^|,)ro(,|$)/.test(m.opts)) && !/^\/(dev|proc|sys|run)(\/|$)/.test(abs)) {
      const m = this.mounts.filter((x) => x.target === '/' || abs === x.target || abs.startsWith(x.target + '/')).sort((a, b) => b.target.length - a.target.length)[0];
      if (m && /(^|,)ro(,|$)/.test(m.opts)) throw new FsErr('EROFS', abs);
    }
    if (this.spaceWatch && data && this.freeBytesAt(abs) <= 0) throw new FsErr('ENOSPC', abs);
    return origWF.call(this, abs, data, append);
  };
  LX.initHooks.push((sh) => {
    sh.rootSeed = sh.rootBytes();
  });
  const wrapAlloc = (name, targets) => {
    const orig = LX.cmds[name].run;
    def(name, async (c, args) => {
      const rc = await orig(c, args);
      if (rc) return rc;
      for (const t of targets(args)) {
        const abs = c.abs(t);
        const n = c.sh.fs.lookup(abs);
        if (!n || n.t !== 'f') continue;
        if (VFS.size(n) >= 100 * 1048576) c.sh.spaceWatch = true;
        const free = c.sh.freeBytesAt(abs);
        if (free < 0) {
          if (name === 'dd') {
            n.size = Math.max(0, VFS.size(n) + free);
            c.err(`dd: error writing '${t}': No space left on device\n`);
            return 1;
          }
          c.sh.unlink(abs);
          c.err(name === 'fallocate' ? 'fallocate: fallocate failed: No space left on device\n' : `truncate: failed to truncate '${t}' at ${args[args.indexOf('-s') + 1]} bytes: No space left on device\n`);
          return 1;
        }
      }
      return rc;
    });
  };
  wrapAlloc('fallocate', (a) => [a[a.length - 1]]);
  wrapAlloc('truncate', (a) => [a[a.length - 1]]);
  wrapAlloc('dd', (a) => a.filter((x) => x.startsWith('of=')).map((x) => x.slice(3)));


  /* ---------- ip route get ---------- */
  const ip2n = (ip) => ip.split('.').reduce((a, o) => ((a << 8) + +o) >>> 0, 0);
  const maskOfBits = (p) => (p === 0 ? 0 : (~0 << (32 - p)) >>> 0);
  const origIp = LX.cmds.ip.run;
  def('ip', async (c, args) => {
    const flat = args.filter((a) => !/^-\d$|^-4$|^-6$|^-br$|^-c$|^-s$|^-o$/.test(a));
    if (/^r(oute)?$/.test(flat[0] || '') && flat[1] === 'get' && flat[2]) {
      const sh = c.sh;
      const dest = flat[2];
      const ifc = sh.net.ifaces.eth0;
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(dest)) { c.err(`Error: any valid prefix is expected rather than "${dest}".\n`); return 1; }
      if (sh.ownIps().includes(dest)) { c.out(`local ${dest} dev lo src ${dest} uid ${sh.users[sh.eu()].uid} \n    cache <local> \n`); return 0; }
      const src = (ifc.ips[0] || '').split('/')[0];
      if (ifc.up) {
        for (const a of ifc.ips) {
          const [ip, pfx] = a.split('/');
          if ((ip2n(dest) & maskOfBits(+pfx)) >>> 0 === (ip2n(ip) & maskOfBits(+pfx)) >>> 0) { c.out(`${dest} dev eth0 src ${ip} uid ${sh.users[sh.eu()].uid} \n    cache \n`); return 0; }
        }
        let best = null;
        for (const r of sh.net.routes) {
          if (r.dst === 'default') { if (!best) best = r; continue; }
          const [net, pfx] = r.dst.split('/');
          if ((ip2n(dest) & maskOfBits(+pfx)) >>> 0 === (ip2n(net) & maskOfBits(+pfx)) >>> 0 && (!best || best.dst === 'default' || +pfx > +best.dst.split('/')[1])) best = r;
        }
        if (best) { c.out(`${dest} via ${best.via} dev ${best.dev} src ${src} uid ${sh.users[sh.eu()].uid} \n    cache \n`); return 0; }
      }
      c.err('RTNETLINK answers: Network is unreachable\n');
      return 2;
    }
    // filtering: ip addr show [dev] IFACE, ip route show default / dev IFACE
    const objI = flat.findIndex((a) => /^(a|addr|address|l|link|r|route)$/.test(a));
    const obj = objI >= 0 ? flat[objI] : '';
    const after = flat.slice(objI + 1).filter((a) => a !== 'show' && a !== 'list' && a !== 'dev');
    const wantFam = args.includes('-4') ? 4 : args.includes('-6') ? 6 : 0;
    const verbTok = flat[objI + 1];
    if (obj && (after.length || wantFam) && (!verbTok || ['show', 'list', 'ls', 'dev'].includes(verbTok))) {
      let buf = '';
      const rc = await origIp(Object.assign({}, c, { out: (x) => { buf += x; } }), args.filter((a) => a !== '-4' && a !== '-6' && !after.includes(a) && a !== 'dev'));
      if (rc) { c.out(buf); return rc; }
      const brief = args.some((a) => /^-br/.test(a) || a === '-brief');
      let outTxt = buf;
      if (/^(a|addr|address|l|link)$/.test(obj) && after.length) {
        const ifn = after[0];
        if (!Object.keys(c.sh.net.ifaces).includes(ifn)) { c.err(`Device "${ifn}" does not exist.\n`); return 1; }
        if (brief) outTxt = buf.split('\n').filter((l) => l.startsWith(ifn + ' ')).join('\n') + '\n';
        else outTxt = buf.split(/(?=^\d+: )/m).filter((b) => new RegExp('^\\d+: ' + ifn + ':').test(b)).join('');
      } else if (/^(r|route)$/.test(obj) && after.length) {
        const f = after[0];
        outTxt = buf.split('\n').filter((l) => (f === 'default' ? l.startsWith('default') : /^\d/.test(f) ? l.startsWith(f) : l.includes(' dev ' + f + ' '))).join('\n') + '\n';
      }
      if (wantFam === 4) outTxt = outTxt.split('\n').filter((l) => !/inet6|link\/ether.*fe80|fe80::/.test(l)).join('\n');
      if (wantFam === 6) outTxt = outTxt.split('\n').filter((l) => /^\d+:|inet6|valid_lft/.test(l)).join('\n');
      c.out(outTxt.replace(/\n\n+$/, '\n'));
      return 0;
    }
    if (/^(l|link)$/.test(obj) && flat[objI + 1] === 'set' && flat[objI + 2] === 'dev') {
      const k = args.indexOf('dev');
      return origIp(c, args.filter((a, i) => i !== k));
    }
    return origIp(c, args);
  });

  /* ---------- dig / host / resolvectl ---------- */
  const rdns = (sh, ip) => { const e = Object.entries(LX.DNS || {}).find(([, v]) => v === ip); return e ? e[0] : null; };
  const recs = (h, type) => ({ A: null, AAAA: ['2606:2800:21f:cb07:6820:80da:af6b:8b2c'], MX: [`10 mail.${h}.`, `20 mail2.${h}.`], NS: [`ns1.${h}.`, `ns2.${h}.`], TXT: ['"v=spf1 include:_spf.' + h + ' -all"'], CNAME: [], SOA: [`ns1.${h}. admin.${h}. 2026102701 7200 3600 1209600 3600`], PTR: [] }[type]);
  def('dig', async (c, args) => {
    const sh = c.sh;
    let type = null;
    let name = null;
    let server = null;
    let rev = false;
    const words = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-t') type = args[++i];
      else if (a === '-x') { rev = true; name = args[++i]; type = 'PTR'; } else if (a.startsWith('@')) server = a.slice(1);
      else if (!a.startsWith('-') && !a.startsWith('+')) words.push(a);
    }
    if (!rev) {
      const types = words.filter((w) => /^(A|AAAA|MX|NS|TXT|CNAME|SOA|PTR|ANY)$/i.test(w));
      const names = words.filter((w) => !types.includes(w));
      name = names[0] || types[0] || null;
      if (names.length && types.length) type = types[0];
    }
    type = (type || 'A').toUpperCase();
    const short = args.includes('+short');
    const srv = server || (sh.dnsServers && sh.dnsServers()[0]) || '127.0.0.53';
    if (!name) { c.out(`\n; <<>> DiG 9.18.28-0ubuntu0.24.04.1-Ubuntu <<>>\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 3355\n;; QUESTION SECTION:\n;.\t\t\tIN\tNS\n`); return 0; }
    if (!server && sh.dnsDown()) { c.out(`;; communications error to ${srv}#53: timed out\n;; communications error to ${srv}#53: timed out\n;; no servers could be reached\n`); return 9; }
    let answers = [];
    let qname = name;
    if (rev) {
      qname = name.split('.').reverse().join('.') + '.in-addr.arpa';
      const h = rdns(sh, name);
      if (h) answers = [h + '.'];
    } else {
      const ip = (server && (LX.DNS[name] || (sh.dnsExtra && sh.dnsExtra[name]))) || sh.resolveHost(name);
      if (type === 'A' && ip && !/^\d/.test(name)) answers = [ip];
      else if (type === 'A' && ip) answers = [];
      else if (ip) answers = recs(name, type) || [];
    }
    if (short) { answers.forEach((x) => c.out(x + '\n')); return 0; }
    const status = answers.length || (type !== 'A' && sh.resolveHost(name)) ? 'NOERROR' : 'NXDOMAIN';
    const qn = qname.replace(/\.$/, '') + '.';
    const ttl = 300;
    let o = `\n; <<>> DiG 9.18.28-0ubuntu0.24.04.1-Ubuntu <<>> ${args.filter((x) => !x.startsWith('+')).join(' ')}\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: ${status}, id: ${Math.floor(Math.random() * 60000)}\n;; flags: qr rd ra; QUERY: 1, ANSWER: ${answers.length}, AUTHORITY: 0, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; QUESTION SECTION:\n;${qn}\t\t\tIN\t${type}\n\n`;
    if (answers.length) o += ';; ANSWER SECTION:\n' + answers.map((x) => `${qn}\t\t${ttl}\tIN\t${type}\t${x}`).join('\n') + '\n\n';
    o += `;; Query time: ${5 + Math.floor(Math.random() * 25)} msec\n;; SERVER: ${srv}#53(${srv}) (UDP)\n;; WHEN: ${U.strftime('%a %b %e %H:%M:%S %Z %Y', new Date())}\n;; MSG SIZE  rcvd: ${56 + answers.length * 16}\n\n`;
    c.out(o);
    return status === 'NOERROR' ? 0 : 0;
  }, { pkg: 'dnsutils' });
  def('host', async (c, args) => {
    const sh = c.sh;
    let type = null;
    const pos = [];
    for (let i = 0; i < args.length; i++) { if (args[i] === '-t') type = args[++i].toUpperCase(); else if (!args[i].startsWith('-')) pos.push(args[i]); }
    const h = pos[0];
    if (!h) { c.out('Usage: host [-aCdilrTvVw] [-c class] [-N ndots] [-t type] [-W time]\n            [-R number] [-m flag] [-p port] hostname [server]\n'); return 1; }
    if (sh.dnsDown()) { c.out(';; communications error to ' + ((sh.dnsServers && sh.dnsServers()[0]) || '127.0.0.53') + '#53: timed out\n;; no servers could be reached\n'); return 1; }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
      const n = rdns(sh, h);
      if (!n) { c.out(`Host ${h.split('.').reverse().join('.')}.in-addr.arpa. not found: 3(NXDOMAIN)\n`); return 1; }
      c.out(`${h.split('.').reverse().join('.')}.in-addr.arpa domain name pointer ${n}.\n`);
      return 0;
    }
    const ip = sh.resolveHost(h);
    if (!ip) { c.out(`Host ${h} not found: 3(NXDOMAIN)\n`); return 1; }
    if (type && type !== 'A') { const r = recs(h, type) || []; const label = { MX: 'mail is handled by', NS: 'name server', TXT: 'descriptive text', AAAA: 'has IPv6 address', SOA: 'has SOA record' }[type] || 'has ' + type + ' record'; r.forEach((x) => c.out(`${h} ${label} ${x}\n`)); return 0; }
    c.out(`${h} has address ${ip}\n`);
    if (/^[a-z]/.test(h)) { c.out(`${h} has IPv6 address 2606:2800:21f:cb07:6820:80da:af6b:8b2c\n${h} mail is handled by 10 mail.${h}.\n`); }
    return 0;
  }, { pkg: 'dnsutils' });
  const resolvectl = async (c, args) => {
    const sh = c.sh;
    const sub = args[0] || 'status';
    const servers = (sh.dnsServers && sh.dnsServers()) || ['10.0.2.3'];
    if (sub === 'status') {
      c.out(`Global\n         Protocols: -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported\n  resolv.conf mode: stub\n\nLink 2 (eth0)\n    Current Scopes: DNS\n         Protocols: +DefaultRoute -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported\nCurrent DNS Server: ${servers[0]}\n       DNS Servers: ${servers.join(' ')}\n        DNS Domain: localdomain\n`);
      return 0;
    }
    if (sub === 'query') {
      const h = args[1];
      if (sh.dnsDown()) { c.err(`${h}: resolve call failed: Temporary failure in name resolution\n`); return 1; }
      const ip = sh.resolveHost(h);
      if (!ip) { c.err(`${h}: resolve call failed: 'example' not found\n`.replace("'example'", `'${h}'`)); return 1; }
      c.out(`${h}: ${ip}                       -- link: eth0\n\n-- Information acquired via protocol DNS in 11.3ms.\n-- Data is authenticated: no; Data was acquired via local or encrypted transport: no\n-- Data from: network\n`);
      return 0;
    }
    if (sub === 'flush-caches') return 0;
    if (sub === 'statistics') { c.out('DNSSEC supported by current servers: no\n\nTransactions\nCurrent Transactions: 0\n  Total Transactions: 214\n\nCache\n  Current Cache Size: 12\n          Cache Hits: 87\n        Cache Misses: 127\n'); return 0; }
    c.err(`Unknown command verb '${sub}'.\n`);
    return 1;
  };
  def('resolvectl', resolvectl);
  def('systemd-resolve', resolvectl);

  def('mountpoint', async (c, args) => {
    const sh = c.sh;
    const quiet = args.includes('-q');
    const p = args.filter((a) => !a.startsWith('-'))[0];
    if (!p) { c.err('Usage:\n mountpoint [-q] [-d] [-x] <directory|device>\n'); return 1; }
    const abs = c.abs(p);
    if (!sh.fs.lookup(abs)) { c.err(`mountpoint: ${p}: No such file or directory\n`); return 1; }
    const is = (sh.mounts || []).some((m) => m.target === abs || (abs === '/' && m.target === '/'));
    if (!quiet) c.out(`${p} is ${is ? '' : 'not '}a mountpoint\n`);
    return is ? 0 : 1;
  });

  /* ---------- locate ---------- */
  def('updatedb', async (c) => {
    const sh = c.sh;
    if (sh.eu() !== 'root') { c.err('updatedb: can not open a temporary file for `/var/lib/plocate/plocate.db\'\n'); return 1; }
    const all = [];
    const walk = (n, p) => { all.push(p || '/'); if (n.t === 'd') for (const k of Object.keys(n.kids).sort()) if (!['proc', 'sys', 'dev', 'run'].includes(k) || p !== '') walk(n.kids[k], (p === '/' ? '' : p) + '/' + k); };
    walk(sh.fs.lookup('/'), '');
    sh.locateDb = all;
    sh.fs.mkdirp('/var/lib/plocate', { owner: 'root', group: 'root' });
    sh.writeFile('/var/lib/plocate/plocate.db', '\0plocate', false);
    return 0;
  }, { pkg: 'plocate' });
  def('locate', async (c, args) => {
    const sh = c.sh;
    if (!sh.locateDb) { c.err("locate: can not stat () `/var/lib/plocate/plocate.db': No such file or directory\n"); return 1; }
    const pats = args.filter((a) => !a.startsWith('-'));
    const ci = args.includes('-i');
    const cnt = args.includes('-c');
    if (!pats.length) { c.err('locate: no pattern to search for specified\n'); return 1; }
    const res = sh.locateDb.filter((p) => pats.some((x) => (/[*?[]/.test(x) ? LX.globToRegex('*' + x + '*') : new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ci ? 'i' : '')).test(ci ? p : p)) && sh.fs.lookup(p) && sh.can(sh.fs.lookup(VFS.dirname(p)) || sh.fs.lookup('/'), 1));
    if (cnt) { c.out(res.length + '\n'); return 0; }
    res.forEach((p) => c.out(p + '\n'));
    return res.length ? 0 : 1;
  }, { pkg: 'plocate' });
  Object.assign(LX.PKGS, {
    dnsutils: { ver: '1:9.18.28-0ubuntu0.24.04.1', desc: 'Transitional package for bind9-dnsutils', size: 2, bins: ['dig', 'host', 'nslookup'] },
    acl: { ver: '2.3.2-1build1', desc: 'access control list utilities', size: 80, bins: [] },
    attr: { ver: '1:2.5.2-1build1', desc: 'utilities for manipulating filesystem extended attributes', size: 40, bins: [] },
    plocate: { ver: '1.1.19-1build1', desc: 'much faster locate', size: 140, bins: ['locate', 'updatedb'] },
    strace: { ver: '6.8-0ubuntu2', desc: 'System call tracer', size: 1700, bins: ['strace'] },
    ltrace: { ver: '0.7.3-6.1ubuntu9', desc: 'Tracks runtime library calls in dynamically linked programs', size: 260, bins: [] },
    logrotate: { ver: '3.21.0-2build1', desc: 'Log rotation utility', size: 79, bins: ['logrotate'] },
    'software-properties-common': { ver: '0.99.49', desc: 'manage the repositories that you install software from', size: 190, bins: ['add-apt-repository'] },
    bsdmainutils: { ver: '12.1.8', desc: 'collection of more utilities from FreeBSD', size: 20, bins: [] },
  });
  for (const k of ['logrotate', 'acl', 'attr']) if (LX.DEFAULT_PKGS.indexOf(k) < 0) LX.DEFAULT_PKGS.push(k);

  /* ---------- strace ---------- */
  def('strace', async (c, args) => {
    const sh = c.sh;
    const e = args.indexOf('-e');
    const filter = e >= 0 ? (args[e + 1] || '').replace(/^trace=/, '').split(',') : null;
    const sum = args.includes('-c');
    const rest = args.filter((a, i) => !a.startsWith('-') && !(e >= 0 && i === e + 1) && !(args[i - 1] === '-o' || args[i - 1] === '-p'));
    if (!rest.length) { c.err('strace: must have PROG [ARGS] or -p PID\nTry \'strace -h\' for more information.\n'); return 1; }
    const prog = rest[0];
    const pargs = rest.slice(1);
    let out = '';
    let err = '';
    const st = await sh.dispatch(rest, { stdin: c.stdin, stdout: (s) => { out += s; }, stderr: (s) => { err += s; }, tty: false });
    const lines = [];
    const path = (sh.vars.PATH.split(':').map((d) => d + '/' + prog).find((p) => sh.fs.lookup(p)) || '/usr/bin/' + prog);
    const want = (n) => !filter || filter.includes(n) || filter.includes('all') || (filter.includes('file') && ['execve', 'openat', 'stat', 'newfstatat'].includes(n));
    if (want('execve')) lines.push(`execve("${path}", [${rest.map((x) => JSON.stringify(x)).join(', ')}], 0x7ffd3b2c4e60 /* 32 vars */) = 0`);
    if (!filter) lines.push('brk(NULL)                               = 0x55f1c5d3a000', 'mmap(NULL, 8192, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7f6a3c2f9000');
    if (want('openat')) lines.push('openat(AT_FDCWD, "/etc/ld.so.cache", O_RDONLY|O_CLOEXEC) = 3', 'openat(AT_FDCWD, "/lib/x86_64-linux-gnu/libc.so.6", O_RDONLY|O_CLOEXEC) = 3');
    let fd = 3;
    for (const a of pargs.filter((x) => !x.startsWith('-'))) {
      const abs = c.abs(a);
      const n = sh.fs.lookup(abs);
      if (!/^(echo|printf|sleep|true|false|seq|date|whoami|id|uname|hostname|uptime)$/.test(prog)) {
        if (!n) { if (want('openat')) lines.push(`openat(AT_FDCWD, "${a}", O_RDONLY) = -1 ENOENT (No such file or directory)`); } else if (n.t === 'f' && !sh.can(n, 4)) { if (want('openat')) lines.push(`openat(AT_FDCWD, "${a}", O_RDONLY) = -1 EACCES (Permission denied)`); } else {
          if (want('openat')) lines.push(`openat(AT_FDCWD, "${a}", O_RDONLY) = ${++fd}`);
          if (want('read') && n.t === 'f') lines.push(`read(${fd}, ${JSON.stringify((n.content || '').slice(0, 30))}${(n.content || '').length > 30 ? '...' : ''}, 131072) = ${(n.content || '').length}`);
        }
      }
    }
    if (out && want('write')) lines.push(`write(1, ${JSON.stringify(out.slice(0, 30))}${out.length > 30 ? '...' : ''}, ${out.length}) = ${out.length}`);
    if (want('exit_group')) lines.push(`exit_group(${st}) = ?`, `+++ exited with ${st} +++`);
    if (sum) {
      c.out(out);
      c.err('% time     seconds  usecs/call     calls    errors syscall\n------ ----------- ----------- --------- --------- ----------------\n 35.00    0.000091          18         5           read\n 25.00    0.000065          13         5           write\n 20.00    0.000052          10         5           openat\n 20.00    0.000052           9         6         1 mmap\n------ ----------- ----------- --------- --------- ----------------\n100.00    0.000260           9        21         1 total\n');
      return st;
    }
    c.err(lines.join('\n') + '\n');
    c.out(out);
    if (err) c.err(err);
    return st;
  }, { pkg: 'strace' });
  def('ltrace', async (c) => { c.err('ltrace: (sandbox) library-call tracing is only shown on a real machine; try strace instead.\n'); return 1; }, { pkg: 'ltrace' });
  def('ldd', async (c, args) => {
    for (const f of args.filter((a) => !a.startsWith('-'))) {
      const n = c.sh.fs.lookup(c.abs(f));
      if (!n) { c.err(`ldd: ${f}: No such file or directory\n`); return 1; }
      if (n.exe) c.out(`\tlinux-vdso.so.1 (0x00007ffd5b9f2000)\n\tlibc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007f2b8c000000)\n\t/lib64/ld-linux-x86-64.so.2 (0x00007f2b8c3e2000)\n`);
      else c.out('\tnot a dynamic executable\n');
    }
    return 0;
  });

  /* ---------- logrotate ---------- */
  function parseLogrotate(sh, files) {
    const blocks = [];
    const globalOpts = {};
    for (const f of files) {
      const n = sh.fs.lookup(f);
      if (!n) continue;
      const text = sh.readFile(f);
      const re = /([^\n{]+?)\s*\{([^}]*)\}/g;
      let m;
      const rest = text.replace(re, (all, paths, body) => {
        const opts = {};
        for (const l of body.split('\n').map((x) => x.trim()).filter((x) => x && !x.startsWith('#'))) {
          const [k, ...v] = l.split(/\s+/);
          opts[k] = v.length ? v.join(' ') : true;
        }
        blocks.push({ paths: paths.trim().split(/\s+/), opts, file: f });
        return '';
      });
      for (const l of rest.split('\n').map((x) => x.trim()).filter((x) => x && !x.startsWith('#') && !x.startsWith('include'))) { const [k, ...v] = l.split(/\s+/); globalOpts[k] = v.length ? v.join(' ') : true; }
    }
    return { blocks, globalOpts };
  }
  def('logrotate', async (c, args) => {
    const sh = c.sh;
    const debug = args.includes('-d') || args.includes('--debug');
    const force = args.includes('-f') || args.includes('--force');
    const cfgs = args.filter((a) => !a.startsWith('-'));
    if (!cfgs.length) { c.err('logrotate 3.21.0 - Copyright (C) 1995-2001 Red Hat, Inc.\n\nUsage: logrotate [OPTION...] <configfile>\n'); return 1; }
    if (sh.eu() !== 'root' && !debug) { c.err('error: error creating state file /var/lib/logrotate/status: Permission denied\n'); return 1; }
    const files = [];
    for (const cf of cfgs) {
      const n = sh.fs.lookup(c.abs(cf));
      if (!n) { c.err(`error: Failed to open config file '${cf}': No such file or directory\n`); return 1; }
      if (n.t === 'd') for (const k of Object.keys(n.kids).sort()) files.push(c.abs(cf) + '/' + k);
      else files.push(c.abs(cf));
    }
    const { blocks, globalOpts } = parseLogrotate(sh, files);
    if (debug) c.out(`warning: logrotate in debug mode does nothing except printing debug messages!  Consider using verbose mode (-v) instead if this is not what you want.\n\nreading config file ${cfgs[0]}\n`);
    for (const b of blocks) {
      const o = Object.assign({}, globalOpts, b.opts);
      for (const pat of b.paths) {
        const targets = [];
        if (/[*?]/.test(pat)) { const d = sh.fs.lookup(VFS.dirname(pat)); if (d && d.kids) for (const k of Object.keys(d.kids)) if (LX.globToRegex(VFS.base(pat)).test(k)) targets.push(VFS.dirname(pat) + '/' + k); } else targets.push(pat);
        for (const t of targets) {
          const n = sh.fs.lookup(t);
          if (!n) { if (!o.missingok) c.err(`error: stat of ${t} failed: No such file or directory\n`); else if (debug) c.out(`\nrotating pattern: ${pat}  ${o.weekly ? 'weekly' : o.daily ? 'daily' : 'monthly'} (${o.rotate || 4} rotations)\nlog ${t} does not exist -- skipping\n`); continue; }
          if (o.notifempty && !n.content) { if (debug) c.out(`  log does not need rotating (log is empty)\n`); continue; }
          const keep = +(o.rotate || 4);
          const sz = o.size ? o.size : null;
          const need = force || (sz ? VFS.size(n) >= parseSize(sz) : true);
          if (debug) c.out(`\nrotating pattern: ${pat}  ${force ? 'forced from command line' : o.weekly ? 'weekly' : o.daily ? 'daily' : 'monthly'} (${keep} rotations)\nempty log files are ${o.notifempty ? 'not ' : ''}rotated, old logs are removed\nconsidering log ${t}\n  log needs rotating\nrotating log ${t}, log->rotateCount is ${keep}\ndateext suffix '-${U.strftime('%Y%m%d', new Date())}'\n${o.compress ? 'compressing log with: /bin/gzip\n' : ''}`);
          if (debug || !need) continue;
          const gz = o.compress ? '.gz' : '';
          // shift old logs
          const old = (i) => t + '.' + i + (o.compress && (i > 1 || !o.delaycompress) ? '.gz' : '');
          for (let i = keep; i >= 1; i--) {
            const from = sh.fs.lookup(t + '.' + i + '.gz') ? t + '.' + i + '.gz' : t + '.' + i;
            const fn = sh.fs.lookup(from);
            if (!fn) continue;
            if (i === keep) { sh.unlink(from); continue; }
            const dest = t + '.' + (i + 1) + (o.compress && i + 1 > (o.delaycompress ? 1 : 0) ? '.gz' : '');
            await sub(c, `mv ${q(from)} ${q(dest)}`, quiet());
            if (o.compress && !dest.endsWith('.gz') && false) await sub(c, `gzip ${q(dest)}`, quiet());
          }
          await sub(c, `cp ${q(t)} ${q(t + '.1')}`, quiet());
          if (o.compress && !o.delaycompress) { await sub(c, `rm -f ${q(t + '.1.gz')}`, quiet()); await sub(c, `gzip ${q(t + '.1')}`, quiet()); }
          if (o.copytruncate) sh.writeFile(t, '', false);
          else {
            sh.writeFile(t, '', false);
            if (o.create) { const parts = String(o.create).split(/\s+/); const m = parts[0] && /^[0-7]{3,4}$/.test(parts[0]) ? parts[0] : null; if (m) await sub(c, `chmod ${m} ${q(t)}`, quiet()); if (parts[1]) await sub(c, `chown ${parts[1]}${parts[2] ? ':' + parts[2] : ''} ${q(t)}`, quiet()); }
          }
        }
      }
    }
    if (debug) c.out('\n');
    return 0;
  }, { pkg: 'logrotate' });
  const parseSize = (s) => { const m = /^(\d+)([kKmMgG]?)/.exec(String(s)); return m ? +m[1] * ({ '': 1, k: 1024, m: 1048576, g: 1073741824 }[m[2].toLowerCase()]) : 0; };
  const quiet = () => ({ stdin: '', stdout: () => {}, stderr: () => {}, tty: false });

  /* ---------- timeout / sync / flock / stty / tput ---------- */
  def('timeout', async (c, args) => {
    const rest = args.filter((a) => !a.startsWith('-') || /^-\d/.test(a));
    const dur = rest[0];
    const m = /^(\d+(?:\.\d+)?)([smhd]?)$/.exec(dur || '');
    if (!m) { c.err(`timeout: invalid time interval '${dur || ''}'\nTry 'timeout --help' for more information.\n`); return 125; }
    const secs = +m[1] * { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
    const cmd = rest.slice(1);
    if (!cmd.length) { c.err("timeout: missing operand after '" + dur + "'\nTry 'timeout --help' for more information.\n"); return 125; }
    if (cmd[0] === 'sleep') {
      const sl = parseFloat(cmd[1]);
      if (sl > secs) { await c.sh.waitMs(Math.min(secs, 3) * 1000); return 124; }
    }
    if (/^(ping|tail|python3|nc|yes|watch)$/.test(cmd[0]) && (cmd[0] === 'ping' ? !cmd.includes('-c') : cmd[0] === 'tail' ? cmd.includes('-f') : cmd[0] === 'yes' || cmd[0] === 'watch')) {
      const t = c.sh.dispatch(cmd, c.io);
      const timer = new Promise((r) => setTimeout(() => r('timeout'), Math.min(secs, 3) * (c.sh.fast ? 20 : 1000)));
      const r = await Promise.race([t, timer]);
      if (r === 'timeout') { c.sh.aborted = true; try { await t; } catch (e) { /* abort */ } c.sh.aborted = false; return 124; }
      return r;
    }
    return await c.sh.dispatch(cmd, c.io);
  });
  def('sync', async () => 0);
  def('flock', async (c, args) => { const r = args.filter((a) => !a.startsWith('-')); if (r.length < 2) { c.err('flock: bad usage\n'); return 64; } const idx = args.indexOf('-c'); if (idx >= 0) return await sub(c, args[idx + 1]); return await c.sh.dispatch(r.slice(1), c.io); });
  def('stty', async (c, args) => { if (args[0] === 'size') c.out('24 80\n'); else if (args[0] === '-a') c.out('speed 38400 baud; rows 24; columns 80; line = 0;\n'); else if (args[0] === '-echo' || args[0] === 'echo' || args[0] === 'sane') return 0; return 0; });
  def('tput', async (c, args) => { const a = args[0]; if (a === 'cols') c.out(c.sh.cols + '\n'); else if (a === 'lines') c.out('24\n'); else if (a === 'clear') c.out('\x1b[H\x1b[2J'); else if (a === 'bold') c.out('\x1b[1m'); else if (a === 'sgr0') c.out('\x1b[0m'); else if (a === 'setaf') c.out(`\x1b[3${args[1]}m`); else if (a === 'colors') c.out('256\n'); return 0; });
  def('runlevel', async (c) => c.out('N 5\n'));

  /* ---------- cal ---------- */
  def('cal', async (c, args) => {
    const nums = args.filter((a) => /^\d+$/.test(a)).map(Number);
    const now = new Date();
    let month = now.getMonth() + 1;
    let year = now.getFullYear();
    if (nums.length === 1) year = nums[0];
    if (nums.length === 2) { month = nums[0]; year = nums[1]; }
    const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const head = `${MN[month - 1]} ${year}`;
    c.out(' '.repeat(Math.max(0, Math.floor((20 - head.length) / 2))) + head + '\n');
    c.out('Su Mo Tu We Th Fr Sa\n');
    const first = new Date(year, month - 1, 1).getDay();
    const days = new Date(year, month, 0).getDate();
    let line = '   '.repeat(first);
    for (let d = 1; d <= days; d++) {
      const today = d === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear();
      line += (today ? `\x1b[7m${String(d).padStart(2)}\x1b[0m` : String(d).padStart(2)) + ((first + d) % 7 === 0 ? '\n' : ' ');
      if (d === days && (first + d) % 7 !== 0) line = line.replace(/ $/, '') + '\n';
    }
    c.out(line);
    return 0;
  });

  /* ---------- hexdump / xxd / od / strings / mktemp ---------- */
  async function readInput(c, files) {
    if (files.length) { const n = c.sh.fs.lookup(c.abs(files[0])); if (!n) { c.err(`${c.name}: ${files[0]}: No such file or directory\n`); return null; } return c.sh.readFile(c.abs(files[0])); }
    return await c.slurp();
  }
  const hex2 = (n) => n.toString(16).padStart(2, '0');
  def('xxd', async (c, args) => {
    const files = args.filter((a) => !a.startsWith('-'));
    const t = await readInput(c, files);
    if (t === null) return 1;
    const bytes = [...new TextEncoder().encode(t)];
    for (let i = 0; i < bytes.length; i += 16) {
      const row = bytes.slice(i, i + 16);
      let hx = '';
      for (let j = 0; j < 16; j += 2) hx += (row[j] !== undefined ? hex2(row[j]) : '  ') + (row[j + 1] !== undefined ? hex2(row[j + 1]) : '  ') + ' ';
      c.out(`${i.toString(16).padStart(8, '0')}: ${hx} ${row.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('')}\n`);
    }
    return 0;
  });
  def('hexdump', async (c, args) => {
    const files = args.filter((a) => !a.startsWith('-'));
    const t = await readInput(c, files);
    if (t === null) return 1;
    const bytes = [...new TextEncoder().encode(t)];
    const canon = args.includes('-C');
    for (let i = 0; i < bytes.length; i += 16) {
      const row = bytes.slice(i, i + 16);
      if (canon) c.out(`${i.toString(16).padStart(8, '0')}  ${row.slice(0, 8).map(hex2).join(' ').padEnd(23)}  ${row.slice(8).map(hex2).join(' ').padEnd(23)}  |${row.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('')}|\n`);
      else { let l = i.toString(16).padStart(7, '0'); for (let j = 0; j < row.length; j += 2) l += ' ' + (row[j + 1] !== undefined ? hex2(row[j + 1]) : '00') + hex2(row[j]); c.out(l + '\n'); }
    }
    c.out(bytes.length.toString(16).padStart(canon ? 8 : 7, '0') + '\n');
    return 0;
  });
  def('od', async (c, args) => {
    const files = args.filter((a) => !a.startsWith('-'));
    const t = await readInput(c, files);
    if (t === null) return 1;
    const bytes = [...new TextEncoder().encode(t)];
    const chars = args.includes('-c') || args.includes('-An') && false;
    const aN = args.some((a) => /^-A/.test(a)) && args.join('').includes('-An');
    for (let i = 0; i < bytes.length; i += 16) {
      const row = bytes.slice(i, i + 16);
      const body = args.includes('-c') ? row.map((b) => (b === 10 ? ' \\n' : b === 9 ? ' \\t' : b >= 32 && b < 127 ? '  ' + String.fromCharCode(b) : ' ' + b.toString(8).padStart(3, '0')).slice(-4)).join('') : row.map((b) => ' ' + b.toString(8).padStart(3, '0')).join('');
      c.out(`${aN ? '' : i.toString(8).padStart(7, '0')}${body}\n`);
    }
    if (!aN) c.out(bytes.length.toString(8).padStart(7, '0') + '\n');
    return 0;
  });
  def('strings', async (c, args) => {
    const t = await readInput(c, args.filter((a) => !a.startsWith('-')));
    if (t === null) return 1;
    (t.match(/[ -~]{4,}/g) || []).forEach((s) => c.out(s + '\n'));
    return 0;
  });
  def('mktemp', async (c, args) => {
    const sh = c.sh;
    const dir = args.includes('-d');
    const tmpl = args.find((a) => !a.startsWith('-')) || '/tmp/tmp.XXXXXXXXXX';
    const rnd = () => Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)]).join('');
    const p = tmpl.replace(/X+$/, (m) => rnd().slice(0, m.length));
    const abs = c.abs(p);
    try {
      if (dir) { sh.fs.mkdirp(abs, { owner: sh.eu(), group: sh.users[sh.eu()].groups[0], mode: 0o700 }); const n = sh.fs.lookup(abs); n.mode = 0o700; } else { sh.writeFile(abs, '', false); sh.fs.lookup(abs).mode = 0o600; }
    } catch (e) { if (!(e instanceof FsErr)) throw e; c.err(`mktemp: failed to create ${dir ? 'directory' : 'file'} via template '${tmpl}': ${U.errTxt(e)}\n`); return 1; }
    c.out(p + '\n');
    return 0;
  });

  /* ---------- patch ---------- */
  def('patch', async (c, args) => {
    const sh = c.sh;
    const iI = args.indexOf('-i');
    const strip = (args.find((a) => /^-p\d+$/.test(a)) || '-p0').slice(2);
    const explicit = args.filter((a, i) => !a.startsWith('-') && args[i - 1] !== '-i')[0];
    const text = iI >= 0 ? sh.readFile(c.abs(args[iI + 1])) : await c.slurp();
    const files = text.split(/^diff --git /m).slice(1);
    const chunks = files.length ? files : text.split(/^--- /m).slice(1).map((x) => '--- ' + x);
    if (!chunks.length) { c.err('patch: **** Only garbage was found in the patch input.\n'); return 2; }
    let rc = 0;
    for (const ch of chunks) {
      const pm = /^\+\+\+ (\S+)/m.exec(ch);
      if (!pm) continue;
      const path = pm[1] === '/dev/null' ? (/^--- (\S+)/m.exec(ch) || [])[1] : pm[1];
      const rel = explicit || path.split('/').slice(+strip).join('/');
      const abs = c.abs(rel);
      const exists = sh.fs.lookup(abs);
      let lines = exists ? sh.readFile(abs).replace(/\n$/, '').split('\n') : [];
      if (exists && sh.readFile(abs) === '') lines = [];
      const hunks = ch.split(/^@@ .*@@.*$/m).slice(1);
      const heads = [...ch.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)];
      let offset = 0;
      let ok = true;
      hunks.forEach((h, i) => {
        const hl = h.split('\n').filter((l, j, a) => !(j === a.length - 1 && l === ''));
        const oldL = hl.filter((l) => l[0] === ' ' || l[0] === '-').map((l) => l.slice(1));
        const newL = hl.filter((l) => l[0] === ' ' || l[0] === '+').map((l) => l.slice(1));
        let start = +heads[i][1] - 1 + offset;
        if (+heads[i][2] === 0) start = +heads[i][1];
        const at = (s) => oldL.every((l, k) => lines[s + k] === l);
        let pos = at(start) ? start : -1;
        for (let d = 1; pos < 0 && d < 30; d++) { if (at(start + d)) pos = start + d; else if (start - d >= 0 && at(start - d)) pos = start - d; }
        if (pos < 0 && oldL.length === 0) pos = Math.max(0, start);
        if (pos < 0) { ok = false; c.out(`Hunk #${i + 1} FAILED at ${start + 1}.\n`); return; }
        lines.splice(pos, oldL.length, ...newL);
        offset += newL.length - oldL.length;
      });
      if (!ok) { c.out(`1 out of ${hunks.length} hunk${hunks.length > 1 ? 's' : ''} FAILED -- saving rejects to file ${rel}.rej\n`); rc = 1; continue; }
      if (!exists) c.out(`patching file ${rel}\n`); else c.out(`patching file ${rel}\n`);
      try { sh.writeFile(abs, lines.length ? lines.join('\n') + '\n' : '', false); } catch (e) { if (!(e instanceof FsErr)) throw e; c.err(`patch: **** can't create file ${rel}: ${U.errTxt(e)}\n`); rc = 1; }
    }
    return rc;
  });

  /* ---------- apt-cache / add-apt-repository ---------- */
  def('apt-cache', async (c, args) => {
    const sh = c.sh;
    const a = args[0];
    const p = args[1];
    if (a === 'policy') {
      const pk = LX.PKGS[p];
      if (!pk && !LX.DEFAULT_PKGS.includes(p)) { c.err(`N: Unable to locate package ${p}\n`); return 0; }
      c.out(`${p}:\n  Installed: ${sh.installed.has(p) ? (pk || { ver: '1.0' }).ver : '(none)'}\n  Candidate: ${(pk || { ver: '1.0' }).ver}\n  Version table:\n ${sh.installed.has(p) ? '***' : '   '} ${(pk || { ver: '1.0' }).ver} 500\n        500 http://archive.ubuntu.com/ubuntu noble/universe amd64 Packages\n        100 /var/lib/dpkg/status\n`);
      return 0;
    }
    if (a === 'search' || a === 'show' || a === 'depends' || a === 'madison') return await sh.dispatch(['apt', a === 'search' ? 'search' : 'show', p || ''], c.io);
    c.err('Usage: apt-cache [options] command\n');
    return 1;
  });
  def('add-apt-repository', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root') { c.err('add-apt-repository: error: must run as root\n'); return 1; }
    const r = args.find((a) => !a.startsWith('-'));
    if (!r) { c.err('Usage: add-apt-repository [options] repository\n'); return 1; }
    if (!sh.netUp()) { c.err(`Cannot add PPA: 'ppa:${r.replace(/^ppa:/, '')}'.\nPlease check that the PPA name or format is correct.\n`); return 1; }
    const name = r.replace(/^ppa:/, '').replace(/\//g, '-');
    c.out(`Repository: 'deb https://ppa.launchpadcontent.net/${r.replace(/^ppa:/, '')}/ubuntu/ noble main'\nDescription:\nA community repository.\nMore info: https://launchpad.net/~${r.replace(/^ppa:/, '').split('/')[0]}\nAdding repository.\n${args.includes('-y') || args.includes('--yes') ? '' : 'Press [ENTER] to continue or Ctrl-c to cancel.\n'}Adding deb entry to /etc/apt/sources.list.d/${name}-noble.list\nAdding disabled deb-src entry to /etc/apt/sources.list.d/${name}-noble.list\nAdding key to /etc/apt/keyrings/${name}-noble.gpg with fingerprint 3A4F6B2C91D8E057\nGet:1 https://ppa.launchpadcontent.net/${r.replace(/^ppa:/, '')}/ubuntu noble InRelease [18.1 kB]\nFetched 18.1 kB in 1s (21.0 kB/s)\nReading package lists... Done\n`);
    sh.writeFile(`/etc/apt/sources.list.d/${name}-noble.list`, `deb https://ppa.launchpadcontent.net/${r.replace(/^ppa:/, '')}/ubuntu/ noble main\n`, false);
    return 0;
  }, { pkg: 'software-properties-common' });

  /* ---------- wall / write / mesg ---------- */
  def('wall', async (c, args) => {
    const msg = args.length ? args.join(' ') : await c.slurp();
    c.out(`\nBroadcast message from ${c.sh.user}@${c.sh.hostname || 'linux-school'} (pts/0) (${U.strftime('%a %b %e %H:%M:%S %Y', new Date())}):\n\n${msg.replace(/\n$/, '')}\n\n`);
    return 0;
  });
  def('write', async (c, args) => { c.err(`write: ${args[0] || 'user'} is not logged in\n`); return 1; });
  def('mesg', async (c, args) => { if (!args.length) c.out('is y\n'); return 0; });
})();
