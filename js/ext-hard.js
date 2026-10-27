/* Linux Academy: hardening extras: kernel (sysctl) defaults, nmap, openssl dgst on stdin, lynis that reacts to your changes, auditd rule files, fail2ban helpers */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS } = LX;
  const U = LX.U;
  const P = LX.Shell.prototype;

  /* ---------- sysctl keys that hardening guides talk about ---------- */
  const SYSCTL = { 'net.ipv4.conf.all.rp_filter': '2', 'net.ipv4.conf.default.rp_filter': '2', 'net.ipv4.conf.all.accept_redirects': '1', 'net.ipv4.conf.default.accept_redirects': '1', 'net.ipv4.conf.all.send_redirects': '1', 'net.ipv4.conf.all.accept_source_route': '0', 'net.ipv4.conf.all.log_martians': '0', 'net.ipv4.icmp_echo_ignore_broadcasts': '1', 'net.ipv4.icmp_ignore_bogus_error_responses': '1', 'kernel.randomize_va_space': '2', 'kernel.kptr_restrict': '1', 'kernel.yama.ptrace_scope': '1', 'fs.suid_dumpable': '2', 'fs.protected_hardlinks': '1', 'fs.protected_symlinks': '1', 'net.ipv6.conf.all.accept_ra': '1' };
  LX.initHooks.push((sh) => {
    Object.assign(sh.sysctl, SYSCTL);
    if (sh.sysctlPersist) Object.assign(sh.sysctlPersist, SYSCTL);
    sh.fs.mkdirp('/etc/audit/rules.d', { owner: 'root', group: 'root', mode: 0o750 });
    if (!sh.fs.lookup('/var/tmp')) sh.fs.mkdirp('/var/tmp', { owner: 'root', group: 'root', mode: 0o1777 });
  });

  /* ---------- openssl dgst reading standard input ---------- */
  const origSsl = LX.cmds.openssl.run;
  def('openssl', async (c, args) => {
    if (args[0] === 'dgst' || /^(sha1|sha256|sha512|md5)$/.test(args[0] || '')) {
      const algoFlag = args[0] === 'dgst' ? args.find((a) => /^-(md5|sha1|sha256|sha512)$/.test(a)) : '-' + args[0];
      const files = args.slice(1).filter((a) => !a.startsWith('-'));
      if (algoFlag && algoFlag !== '-md5' && !files.length) {
        const algo = algoFlag.slice(1);
        const h = await LX.digest({ sha1: 'SHA-1', sha256: 'SHA-256', sha512: 'SHA-512' }[algo], await c.slurp());
        const label = algo === 'sha1' ? 'SHA1' : algo.toUpperCase().replace('SHA', 'SHA2-');
        c.out(args.includes('-r') ? `${h} *stdin\n` : `${label}(stdin)= ${h}\n`);
        return 0;
      }
      if (args[0] !== 'dgst') return origSsl(c, ['dgst', algoFlag || '-sha256', ...files]);
    }
    return origSsl(c, args);
  });

  /* ---------- nmap: what does the outside world see? ---------- */
  const SERVICES = { 21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'domain', 80: 'http', 110: 'pop3', 111: 'rpcbind', 143: 'imap', 443: 'https', 445: 'microsoft-ds', 631: 'ipp', 873: 'rsync', 3000: 'ppp', 3306: 'mysql', 5000: 'upnp', 5432: 'postgresql', 6379: 'redis', 8000: 'http-alt', 8080: 'http-proxy', 8443: 'https-alt' };
  const TOP = [21, 22, 23, 25, 53, 80, 110, 111, 143, 443, 445, 631, 873, 3306, 5432, 6379, 8000, 8080, 8443];
  def('nmap', async (c, args) => {
    const sh = c.sh;
    const pI = args.findIndex((a) => a === '-p');
    const pSpec = pI >= 0 ? args[pI + 1] : (args.find((a) => /^-p./.test(a)) || '').slice(2);
    const target = args.filter((a, i) => !a.startsWith('-') && i !== pI + 1 || (pI < 0 && !a.startsWith('-'))).filter((a) => a !== pSpec).pop();
    const ts = U.strftime('%F %H:%M %Z', new Date());
    if (!target) {
      c.err('WARNING: No targets were specified, so 0 hosts scanned.\n');
      c.out(`Starting Nmap 7.94SVN ( https://nmap.org ) at ${ts}\nNmap done: 0 IP addresses (0 hosts up) scanned in 0.03 seconds\n`);
      return 0;
    }
    const ip = sh.resolveHost(target);
    c.out(`Starting Nmap 7.94SVN ( https://nmap.org ) at ${ts}\n`);
    if (!ip) {
      c.err(`Failed to resolve "${target}".\nWARNING: No targets were specified, so 0 hosts scanned.\n`);
      c.out('Nmap done: 0 IP addresses (0 hosts up) scanned in 0.03 seconds\n');
      return 0;
    }
    if (!sh.netUp() && !sh.ownIps().includes(ip)) {
      c.out('Note: Host seems down. If it is really up, but blocking our ping probes, try -Pn\nNmap done: 1 IP address (0 hosts up) scanned in 3.05 seconds\n');
      return 0;
    }
    let ports;
    let total;
    if (pSpec && pSpec !== '-') {
      ports = [];
      for (const part of pSpec.split(',')) {
        const m = /^(\d+)-(\d+)$/.exec(part);
        if (m) for (let p = +m[1]; p <= Math.min(+m[2], +m[1] + 5000); p++) ports.push(p);
        else if (/^\d+$/.test(part)) ports.push(+part);
      }
      total = ports.length;
    } else {
      const own = sh.ownIps().includes(ip);
      const listening = own ? sh.listening().filter((r) => r.proto === 'tcp').map((r) => r.port) : [];
      ports = [...new Set([...TOP, ...listening])].sort((a, b) => a - b);
      total = args.includes('-F') ? 100 : 1000;
    }
    const major = LX.portState(sh, ip, 9999) === 'filtered' ? 'filtered' : 'refused';
    const rows = [];
    let hidden = Math.max(0, total - ports.length);
    for (const p of ports) {
      const st = LX.portState(sh, ip, p);
      const norm = st === 'open' ? 'open' : st === 'filtered' ? 'filtered' : 'closed';
      if ((norm === 'filtered' && major === 'filtered') || (norm === 'closed' && major === 'refused')) hidden++;
      else rows.push([p, norm]);
    }
    const name = target === ip ? ip : `${target} (${ip})`;
    c.out(`Nmap scan report for ${name}\nHost is up (0.00012s latency).\n`);
    if (!rows.length) c.out(`All ${hidden} scanned ports on ${name} are in ignored states.\nNot shown: ${hidden} ${major === 'filtered' ? 'filtered tcp ports (no-response)' : 'closed tcp ports (conn-refused)'}\n`);
    else {
      if (hidden) c.out(`Not shown: ${hidden} ${major === 'filtered' ? 'filtered tcp ports (no-response)' : 'closed tcp ports (conn-refused)'}\n`);
      c.out('PORT      STATE    SERVICE\n');
      rows.forEach(([p, st]) => c.out(`${(p + '/tcp').padEnd(9)} ${st.padEnd(8)} ${SERVICES[p] || 'unknown'}\n`));
    }
    c.out(`\nNmap done: 1 IP address (1 host up) scanned in ${(0.05 + ports.length / 4000).toFixed(2)} seconds\n`);
    return 0;
  }, { pkg: 'nmap' });
  LX.PKGS.nmap = { ver: '7.94+git20230807.3be01efb1+dfsg-3build2', desc: 'The Network Mapper', size: 1900, bins: ['nmap'] };
  LX.PKGS['unattended-upgrades'].service = { desc: 'Unattended Upgrades Shutdown', proc: 'unattended-upgr' };

  /* ---------- unattended-upgrades configuration helpers ---------- */
  def('dpkg-reconfigure', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root') {
      c.err('dpkg-reconfigure: you must be root\n');
      return 1;
    }
    const p = args.filter((a) => !a.startsWith('-')).pop();
    if (!p || !sh.installed.has(p)) {
      c.err(`dpkg-reconfigure: ${p || 'package'} is not installed\n`);
      return 1;
    }
    if (p === 'unattended-upgrades') {
      sh.writeFile('/etc/apt/apt.conf.d/20auto-upgrades', 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n', false);
      c.out('(sandbox) answered "Yes" to: Automatically download and install stable updates?\n');
    }
    return 0;
  });
  LX.initHooks.push((sh) => {
    sh.fs.put('/etc/apt/apt.conf.d/50unattended-upgrades', '// Automatically upgrade packages from these (origin:archive) pairs\nUnattended-Upgrade::Allowed-Origins {\n        "${distro_id}:${distro_codename}";\n        "${distro_id}:${distro_codename}-security";\n        "${distro_id}ESMApps:${distro_codename}-apps-security";\n//      "${distro_id}:${distro_codename}-updates";\n};\n\nUnattended-Upgrade::Remove-Unused-Dependencies "false";\nUnattended-Upgrade::Automatic-Reboot "false";\n', { owner: 'root', group: 'root' });
  });

  /* ---------- lynis that reacts to your changes ---------- */
  const sshOn = (sh, key, val) => new RegExp('^\\s*' + key + '\\s+' + val + '\\s*$', 'mi').test((sh.fs.lookup('/etc/ssh/sshd_config') || {}).content || '');
  def('lynis', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root') {
      c.err('This script needs root permissions (sudo lynis audit system)\n');
      return 1;
    }
    if (args[0] === 'show' && args[1] === 'version') return c.out('3.0.9\n');
    if (args[0] !== 'audit') {
      c.out('Lynis 3.0.9\n\nUsage: lynis audit system\n');
      return 0;
    }
    const checks = [
      ['SSH-7440', 'Consider hardening SSH configuration (PermitRootLogin no)', sshOn(sh, 'PermitRootLogin', 'no'), 4, '  - OpenSSH option: PermitRootLogin'],
      ['SSH-7441', 'Consider hardening SSH configuration (PasswordAuthentication no)', sshOn(sh, 'PasswordAuthentication', 'no'), 4, '  - OpenSSH option: PasswordAuthentication'],
      ['FIRE-4590', 'Enable a host based firewall (ufw enable)', sh.fw && sh.fw.ufw.enabled, 6, '  - Checking host based firewall'],
      ['DEB-0880', 'Install fail2ban to ban brute-force attackers', sh.installed.has('fail2ban'), 5, '  - Checking presence of fail2ban'],
      ['ACCT-9628', 'Install and use auditd to record security-relevant events', sh.installed.has('auditd'), 4, '  - Checking for audit daemon'],
      ['DEB-0831', 'Install unattended-upgrades for automatic security patches', sh.installed.has('unattended-upgrades'), 4, '  - Checking automatic security updates'],
      ['KRNL-6000', 'Set net.ipv4.conf.all.rp_filter = 1 and accept_redirects = 0 (sysctl)', sh.sysctl['net.ipv4.conf.all.rp_filter'] === '1' && sh.sysctl['net.ipv4.conf.all.accept_redirects'] === '0', 4, '  - Checking sysctl network settings'],
      ['AUTH-9286', 'Configure maximum password age (PASS_MAX_DAYS 90 in /etc/login.defs)', /^PASS_MAX_DAYS\s+(\d+)/m.test((sh.fs.lookup('/etc/login.defs') || {}).content || '') && +/^PASS_MAX_DAYS\s+(\d+)/m.exec(sh.fs.lookup('/etc/login.defs').content)[1] <= 365, 3, '  - Checking password aging'],
    ];
    const score = 52 + checks.reduce((s, k) => s + (k[2] ? k[3] : 0), 0);
    let out = '[ Lynis 3.0.9 ]\n\n  Performing system audit...\n\n[+] Services and software\n';
    out += checks.map((k) => `${k[4].padEnd(50)}[ ${k[2] ? 'OK' : 'SUGGESTION'} ]`).join('\n') + '\n';
    const miss = checks.filter((k) => !k[2]);
    out += `\n  Hardening index : ${score} [${'#'.repeat(Math.round(score / 5)).padEnd(20)}]\n  Tests performed : 238\n\n`;
    if (miss.length) out += `  Suggestions (${miss.length}):\n` + miss.map((k) => `  * ${k[1]} [${k[0]}]`).join('\n') + '\n';
    else out += '  No suggestions: nice work!\n';
    c.out(out);
    return 0;
  }, { pkg: 'lynis' });

  /* ---------- auditd rule files ---------- */
  def('augenrules', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root') {
      c.err('You must be root to run this program.\n');
      return 1;
    }
    const d = sh.fs.lookup('/etc/audit/rules.d');
    let n = 0;
    sh.auditRules = [];
    const lines = [];
    for (const k of Object.keys((d && d.kids) || {}).sort()) {
      if (!k.endsWith('.rules')) continue;
      for (const l of ((d.kids[k].content) || '').split('\n')) {
        const m = /^\s*-w\s+(\S+)(?:\s+-p\s+(\S+))?(?:\s+-k\s+(\S+))?/.exec(l);
        if (m) {
          sh.auditRules.push({ path: m[1], perms: m[2] || 'rwxa', key: m[3] || '(null)' });
          n++;
        }
        if (l.trim() && !l.trim().startsWith('#')) lines.push(l);
      }
    }
    sh.writeFile('/etc/audit/audit.rules', '## This file is automatically generated from /etc/audit/rules.d\n' + lines.join('\n') + '\n', false);
    if (args.includes('--load')) c.out(`/sbin/augenrules: No change\nNo rules\nenabled 1\nfailure 1\npid 612\nrate_limit 0\nbacklog_limit 8192\nlost 0\nbacklog 0\nenabled 1\nfailure 1\npid 612\nrate_limit 0\nbacklog_limit 8192\nlost 0\nbacklog 0\n`.replace('No rules\n', n ? '' : 'No rules\n'));
    else c.out(`${n} rules\n`);
    return 0;
  }, { pkg: 'auditd' });
  LX.PKGS.auditd.bins = ['auditctl', 'ausearch', 'aureport', 'augenrules'];
  const origOn = P.onInstall;
  P.onInstall = function (p, pk) {
    origOn.call(this, p, pk);
    this.serviceHooks = this.serviceHooks || {};
    if (pk && pk.service && !this.serviceHooks[p]) {
      const sh = this;
      if (p === 'fail2ban') {
        this.serviceHooks[p] = async () => {
          const jl = (sh.fs.lookup('/etc/fail2ban/jail.local') || {}).content || '';
          const bad = jl.split('\n').findIndex((l) => l.trim() && !/^\s*[#;]/.test(l) && !/^\s*\[[^\]]+\]\s*$/.test(l) && !/^[\w.-]+\s*[=:]/.test(l.trim()) && !/^\s/.test(l));
          if (bad >= 0) {
            sh.logEvent('fail2ban.service', 3, `ERROR Failed during configuration: Bad value substitution: option in jail.local line ${bad + 1}: '${jl.split('\n')[bad].trim()}'`, { ident: 'fail2ban-server' });
            return { ok: false, code: 255 };
          }
          sh.logEvent('fail2ban.service', 6, 'Server ready', { ident: 'fail2ban-server' });
          return { ok: true };
        };
      } else this.serviceHooks[p] = async () => ({ ok: true });
    }
    if (p === 'unattended-upgrades') {
      this.fs.mkdirp('/var/log/unattended-upgrades', { owner: 'root', group: 'adm' });
      this.fs.put('/var/log/unattended-upgrades/unattended-upgrades.log', U.strftime('%F %T', new Date()) + ',412 INFO Starting unattended upgrades script\n' + U.strftime('%F %T', new Date()) + ',413 INFO Allowed origins are: o=Ubuntu,a=noble, o=Ubuntu,a=noble-security\n' + U.strftime('%F %T', new Date()) + ',990 INFO No packages found that can be upgraded unattended and no pending auto-removals\n', { owner: 'root', group: 'adm', mode: 0o640 });
    }
    if (p === 'auditd') {
      this.fs.put('/etc/audit/auditd.conf', 'log_file = /var/log/audit/audit.log\nmax_log_file = 8\nnum_logs = 5\n', { owner: 'root', group: 'root', mode: 0o640 });
      this.fs.mkdirp('/etc/audit/rules.d', { owner: 'root', group: 'root', mode: 0o750 });
      this.fs.put('/etc/audit/rules.d/audit.rules', '## First rule - delete all\n-D\n\n## Increase the buffers to survive stress events.\n-b 8192\n', { owner: 'root', group: 'root', mode: 0o640 });
    }
  };

  /* ---------- fail2ban helpers ---------- */
  const origF2b = LX.cmds['fail2ban-client'].run;
  def('fail2ban-client', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() === 'root' && sh.services.fail2ban && sh.services.fail2ban.active) {
      if (args[0] === 'ping') return c.out('Server replied: pong\n'), 0;
      if (args[0] === 'reload') return c.out('OK\n'), 0;
      if (args[0] === '--version' || args[0] === '-V') return c.out('Fail2Ban v1.0.2\n'), 0;
      if (args[0] === 'status' && args[1] && args[1] !== 'sshd') {
        c.err(`Sorry but the jail '${args[1]}' does not exist\n`);
        return 255;
      }
    }
    return origF2b(c, args);
  }, { pkg: 'fail2ban' });

  /* ---------- ss -s ---------- */
  const origSs = LX.cmds.ss.run;
  def('ss', async (c, args) => {
    if (args.includes('-s') || args.includes('--summary')) {
      const l = c.sh.listening ? c.sh.listening() : [];
      const tcp = l.filter((r) => r.proto === 'tcp').length;
      const udp = l.filter((r) => r.proto === 'udp').length;
      c.out(`Total: ${190 + tcp}\nTCP:   ${tcp + 1} (estab 1, closed 0, orphaned 0, timewait 0)\n\nTransport Total     IP        IPv6\nRAW\t  1         0         1\nUDP\t  ${udp}         ${udp}         0\nTCP\t  ${tcp + 1}         ${tcp + 1}         0\nINET\t  ${tcp + udp + 2}         ${tcp + udp + 1}         1\nFRAG\t  0         0         0\n`);
      return 0;
    }
    return origSs(c, args);
  });
})();
