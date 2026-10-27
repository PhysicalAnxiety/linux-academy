/* Linux Academy: systemd, journal, timers, boot/reboot, kernel, sysctl, performance tools */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS, Shell, AbortSig } = LX;
  const U = LX.U;
  const P = Shell.prototype;
  LX.initHooks = LX.initHooks || [];
  const needRoot = (c, msg) => {
    if (c.sh.eu() === 'root') return false;
    c.err(msg);
    return true;
  };
  const fmtDate = (ms, f) => U.strftime(f || '%a %F %H:%M:%S %Z', new Date(ms));
  const ago = (ms) => {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return s <= 5 ? 'a moment ago' : `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)} days ago`;
  };
  const left = (ms) => {
    const s = Math.max(0, Math.round((ms - Date.now()) / 1000));
    if (s < 60) return `${s}s left`;
    if (s < 3600) return `${Math.floor(s / 60)}min left`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}min left`;
    return `${Math.floor(s / 86400)} days left`;
  };

  /* ---------- unit files ---------- */
  const UNITS = {
    'ssh.service': '[Unit]\nDescription=OpenBSD Secure Shell server\nDocumentation=man:sshd(8) man:sshd_config(5)\nAfter=network.target auditd.service\n\n[Service]\nEnvironmentFile=-/etc/default/ssh\nExecStartPre=/usr/sbin/sshd -t\nExecStart=/usr/sbin/sshd -D $SSHD_OPTS\nExecReload=/usr/sbin/sshd -t\nExecReload=/bin/kill -HUP $MAINPID\nKillMode=process\nRestart=on-failure\nRestartPreventExitStatus=255\nType=notify\n\n[Install]\nWantedBy=multi-user.target\nAlias=sshd.service\n',
    'cron.service': '[Unit]\nDescription=Regular background program processing daemon\nDocumentation=man:cron(8)\nAfter=remote-fs.target nss-user-lookup.target\n\n[Service]\nExecStart=/usr/sbin/cron -f -P\nIgnoreSIGPIPE=false\nKillMode=process\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n',
    'nginx.service': '[Unit]\nDescription=A high performance web server and a reverse proxy server\nDocumentation=man:nginx(8)\nAfter=network-online.target remote-fs.target nss-lookup.target\nWants=network-online.target\n\n[Service]\nType=forking\nPIDFile=/run/nginx.pid\nExecStartPre=/usr/sbin/nginx -t -q -g \'daemon on; master_process on;\'\nExecStart=/usr/sbin/nginx -g \'daemon on; master_process on;\'\nExecReload=/usr/sbin/nginx -g \'daemon on; master_process on;\' -s reload\nExecStop=-/sbin/start-stop-daemon --quiet --stop --retry QUIT/5 --pidfile /run/nginx.pid\nTimeoutStopSec=5\nKillMode=mixed\n\n[Install]\nWantedBy=multi-user.target\n',
    'logrotate.timer': '[Unit]\nDescription=Daily rotation of log files\n\n[Timer]\nOnCalendar=daily\nAccuracySec=1h\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n',
    'apt-daily.timer': '[Unit]\nDescription=Daily apt download activities\n\n[Timer]\nOnCalendar=*-*-* 6,18:00\nRandomizedDelaySec=12h\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n',
    'fstrim.timer': '[Unit]\nDescription=Discard unused blocks once a week\n\n[Timer]\nOnCalendar=weekly\nAccuracySec=1h\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n',
    'man-db.timer': '[Unit]\nDescription=Daily man-db regeneration\n\n[Timer]\nOnCalendar=daily\nAccuracySec=12h\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n',
  };
  const BUILTIN_SVC = { ssh: { desc: 'OpenBSD Secure Shell server', pid: 412, proc: 'sshd', cmd: '/usr/sbin/sshd -D' }, cron: { desc: 'Regular background program processing daemon', pid: 530, proc: 'cron', cmd: '/usr/sbin/cron -f -P' } };
  function parseIni(text) {
    const out = {};
    let sec = null;
    for (const raw of text.split('\n')) {
      const l = raw.trim();
      if (!l || l.startsWith('#') || l.startsWith(';')) continue;
      const m = /^\[(.+)\]$/.exec(l);
      if (m) {
        sec = m[1];
        out[sec] = out[sec] || {};
        continue;
      }
      const i = l.indexOf('=');
      if (i > 0 && sec) {
        const k = l.slice(0, i).trim();
        const v = l.slice(i + 1).trim();
        out[sec][k] = out[sec][k] !== undefined && /^(ExecStart|Environment|After|Wants|WantedBy|ExecStartPre)$/.test(k) ? out[sec][k] + '\n' + v : v;
      }
    }
    return out;
  }
  LX.parseIni = parseIni;

  LX.initHooks.push((sh) => {
    sh.hostname = 'linux-school';
    LX.tz = LX.tz || 'Asia/Kolkata';
    sh.defaultTarget = 'graphical.target';
    sh.timers = {};
    sh.atJobs = [];
    sh.modules = ['ext4', 'mbcache', 'jbd2', 'crc32c_generic', 'xfs', 'libcrc32c', 'vfat', 'fat', 'overlay', 'loop', 'dm_mod', 'ip_tables', 'x_tables', 'iptable_filter', 'virtio_net', 'virtio_blk', 'nf_conntrack', 'nf_defrag_ipv4'];
    sh.unitMtime = {};
    sh.fs.mkdirp('/usr/lib/systemd/system', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/etc/systemd/system/multi-user.target.wants', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/etc/systemd/system/timers.target.wants', { owner: 'root', group: 'root' });
    for (const [n, c] of Object.entries(UNITS)) {
      if (n === 'nginx.service') continue;
      sh.fs.put('/usr/lib/systemd/system/' + n, c, { owner: 'root', group: 'root', mtime: Date.now() - 20 * 86400000 });
    }
    for (const [name, b] of Object.entries(BUILTIN_SVC)) sh.services[name] = Object.assign({ unit: `/usr/lib/systemd/system/${name}.service`, active: true, enabled: true, since: sh.startTime }, b, { cpu: 0, memKiB: 4200 });
    for (const t of ['logrotate', 'apt-daily', 'fstrim', 'man-db']) sh.timers[t + '.timer'] = { unit: `/usr/lib/systemd/system/${t}.timer`, enabled: true, active: true, last: Date.now() - 14 * 3600000 };
    sh.fs.mkdirp('/etc/modules-load.d', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/etc/modprobe.d', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/etc/sysctl.d', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/sysctl.conf', '#\n# /etc/sysctl.conf - Configuration file for setting system variables\n# See /etc/sysctl.d/ for additional system variables.\n#\n#net.ipv4.ip_forward=1\n', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/modprobe.d/blacklist.conf', '# This file lists modules that will not be loaded automatically.\nblacklist pcspkr\n', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/timezone', 'Asia/Kolkata\n', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/machine-id', 'c4f1d7e8a3b24d6f9e0a1b2c3d4e5f60\n', { owner: 'root', group: 'root', mode: 0o444 });
    sh.fs.put('/etc/crontab', '# /etc/crontab: system-wide crontab\nSHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n\n# m h dom mon dow user  command\n17 *\t* * *\troot    cd / && run-parts --report /etc/cron.hourly\n25 6\t* * *\troot\ttest -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.daily; }\n47 6\t* * 7\troot\ttest -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.weekly; }\n', { owner: 'root', group: 'root' });
    for (const d of ['hourly', 'daily', 'weekly', 'monthly']) sh.fs.mkdirp('/etc/cron.' + d, { owner: 'root', group: 'root' });
    sh.fs.put('/etc/cron.daily/logrotate', '#!/bin/sh\n/usr/sbin/logrotate /etc/logrotate.conf\n', { owner: 'root', group: 'root', mode: 0o755 });
    sh.fs.mkdirp('/etc/cron.d', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/var/spool/cron/crontabs', { owner: 'root', group: 'crontab', mode: 0o1730 });
    sh.fs.put('/etc/logrotate.conf', '# see "man logrotate" for details\nweekly\nsu root adm\nrotate 4\ncreate\n#compress\ninclude /etc/logrotate.d\n', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/etc/logrotate.d', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/logrotate.d/rsyslog', '/var/log/syslog\n{\n\trotate 7\n\tdaily\n\tmissingok\n\tnotifempty\n\tdelaycompress\n\tcompress\n\tpostrotate\n\t\t/usr/lib/rsyslog/rsyslog-rotate\n\tendscript\n}\n', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/etc/default', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/default/grub', '# If you change this file, run \'update-grub\' afterwards to update /boot/grub/grub.cfg.\nGRUB_DEFAULT=0\nGRUB_TIMEOUT_STYLE=hidden\nGRUB_TIMEOUT=0\nGRUB_DISTRIBUTOR=`lsb_release -i -s 2> /dev/null || echo Debian`\nGRUB_CMDLINE_LINUX_DEFAULT="quiet splash"\nGRUB_CMDLINE_LINUX=""\n', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/boot/grub', { owner: 'root', group: 'root' });
    sh.fs.put('/boot/grub/grub.cfg', '# DO NOT EDIT THIS FILE\n# It is automatically generated by grub-mkconfig using templates\n# from /etc/grub.d and settings from /etc/default/grub\nmenuentry \'Ubuntu\' --class ubuntu {\n\tlinux\t/boot/vmlinuz-6.8.0-45-generic root=UUID=6f1a2c3e ro quiet splash\n\tinitrd\t/boot/initrd.img-6.8.0-45-generic\n}\n', { owner: 'root', group: 'root' });
    sh.fs.put('/boot/initrd.img-6.8.0-45-generic', '', { owner: 'root', group: 'root', bin: true, size: 62000000 });
    sh.fs.put('/boot/vmlinuz-6.8.0-45-generic', '', { owner: 'root', group: 'root', bin: true, size: 14500000 });
    // boot-time journal
    const t0 = sh.startTime;
    const j = (dt, unit, prio, msg, ident, pid) => sh.journal.push({ t: t0 + dt, unit, prio, msg, ident: ident || unit, pid: pid || 0, boot: sh.bootId });
    j(0, 'kernel', 6, 'Linux version 6.8.0-45-generic (buildd@lcy02-amd64-020) #45-Ubuntu SMP PREEMPT_DYNAMIC', 'kernel');
    j(10, 'kernel', 6, 'Command line: BOOT_IMAGE=/boot/vmlinuz-6.8.0-45-generic root=UUID=6f1a2c3e ro quiet splash', 'kernel');
    j(900, 'kernel', 6, 'EXT4-fs (sda1): mounted filesystem with ordered data mode. Quota mode: none.', 'kernel');
    j(2100, 'systemd', 6, 'systemd 255.4-1ubuntu8 running in system mode', 'systemd', 1);
    j(3300, 'systemd', 6, 'Started cron.service - Regular background program processing daemon.', 'systemd', 1);
    j(3320, 'cron.service', 6, '(CRON) INFO (pidfile fd = 3)', 'cron', 530);
    j(3900, 'systemd', 6, 'Started ssh.service - OpenBSD Secure Shell server.', 'systemd', 1);
    j(3950, 'ssh.service', 6, 'Server listening on 0.0.0.0 port 22.', 'sshd', 412);
    j(3960, 'ssh.service', 6, 'Server listening on :: port 22.', 'sshd', 412);
    j(5200, 'ssh.service', 6, 'Accepted password for learner from 192.168.1.5 port 52244 ssh2', 'sshd', 1190);
    j(5300, 'systemd-logind', 6, 'New session 3 of user learner.', 'systemd-logind', 601);
    j(8000, 'kernel', 3, 'blk_update_request: I/O error, dev sdb, sector 2048 op 0x0:(READ) flags 0x80700 phys_seg 1 prio class 2', 'kernel');
    j(120000, 'cron.service', 6, 'pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)', 'CRON', 701);
    j(3600000, 'sudo', 6, 'learner : TTY=pts/0 ; PWD=/home/learner ; USER=root ; COMMAND=/usr/bin/apt update', 'sudo', 1250);
    j(3600500, 'sudo', 6, 'pam_unix(sudo:session): session opened for user root(uid=0) by learner(uid=1000)', 'sudo', 1250);
    sh.journalPersist = false;
    sh.fs.put('/var/log/journal/.keep', '', { owner: 'root', group: 'root' });
    delete sh.fs.lookup('/var/log/journal').kids['.keep'];
    delete sh.fs.lookup('/var/log').kids.journal;
  });

  /* ---------- unit loading ---------- */
  P.unitPath = function (name) {
    for (const d of ['/etc/systemd/system', '/usr/lib/systemd/system', '/lib/systemd/system']) {
      const n = this.fs.lookup(`${d}/${name}`, false);
      if (n && n.t === 'f') return `${d}/${name}`;
      if (n && n.t === 'l' && n.target === '/dev/null') return 'masked';
    }
    return null;
  };
  P.loadUnit = function (name) {
    // returns service object or null
    const unit = name.endsWith('.service') || name.endsWith('.timer') ? name : name + '.service';
    const base = unit.replace(/\.(service|timer)$/, '');
    const path = this.unitPath(unit);
    if (!path) return null;
    if (path === 'masked') return { masked: true, name: base };
    const isTimer = unit.endsWith('.timer');
    const store = isTimer ? this.timers : this.services;
    const key = isTimer ? unit : base;
    const file = this.fs.lookup(path);
    const ini = parseIni(file.content || '');
    let o = store[key];
    if (!o) {
      o = store[key] = { active: false, enabled: false };
    }
    o.unit = path;
    o.ini = ini;
    o.desc = (ini.Unit && ini.Unit.Description) || key;
    o.mtimeLoaded = this.unitMtime[unit] = file.mtime;
    const od = this.fs.lookup(`/etc/systemd/system/${unit}.d/override.conf`);
    if (od) {
      const ov = parseIni(od.content || '');
      for (const [sec, kv] of Object.entries(ov)) ini[sec] = Object.assign(ini[sec] || {}, kv);
    }
    if (!isTimer && !o.pid) {
      const es = ((ini.Service || {}).ExecStart || '').split('\n').pop();
      o.cmd = es.replace(/^[-@+!]+/, '');
      o.proc = VFS.base(o.cmd.split(/\s+/)[0] || key);
    }
    const wants = this.fs.lookup(`/etc/systemd/system/${(ini.Install || {}).WantedBy || 'multi-user.target'}.wants/${unit}`, false);
    if (wants) o.enabled = true;
    return o;
  };
  P.unitStale = function (name, o) {
    const unit = name.endsWith('.timer') || name.endsWith('.service') ? name : name + '.service';
    const n = o && o.unit && this.fs.lookup(o.unit);
    const od = this.fs.lookup(`/etc/systemd/system/${unit}.d/override.conf`);
    const m = Math.max(n ? n.mtime : 0, od ? od.mtime : 0);
    return !!(o && o.mtimeLoaded && m > o.mtimeLoaded + 1 && m > (this.lastReload || 0));
  };
  P.newPid = function () {
    return this.nextPid++;
  };
  P.startService = async function (name, c) {
    const sh = this;
    let o = sh.services[name];
    if (!o || (o.unit && sh.unitStale(name, o) && false)) o = sh.loadUnit(name);
    if (!o) return { ok: false, msg: `Unit ${name}.service not found.` };
    const ini = o.ini || {};
    const svc = ini.Service || {};
    const unitName = `${name}.service`;
    sh.logEvent('systemd', 6, `Starting ${unitName} - ${o.desc}...`, { ident: 'systemd', pid: 1 });
    o.failed = false;
    o.result = null;
    if (o.builtin !== false && BUILTIN_SVC[name] && !(sh.serviceHooks && sh.serviceHooks[name])) {
      o.active = true;
      o.since = Date.now();
      o.pid = o.pid || BUILTIN_SVC[name].pid;
      sh.logEvent('systemd', 6, `Started ${unitName} - ${o.desc}.`, { ident: 'systemd', pid: 1 });
      return { ok: true };
    }
    if (sh.serviceHooks && sh.serviceHooks[name]) {
      const r = sh.serviceHooks && sh.serviceHooks[name] ? await sh.serviceHooks[name](c, 'start') : { ok: true };
      if (!r.ok) {
        o.active = false;
        o.failed = true;
        o.result = 'exit-code';
        o.exitCode = r.code || 1;
        o.failTime = Date.now();
        sh.logEvent('systemd', 3, `${unitName}: Failed with result 'exit-code'.`, { ident: 'systemd', pid: 1 });
        sh.logEvent('systemd', 3, `Failed to start ${unitName} - ${o.desc}.`, { ident: 'systemd', pid: 1 });
        return { ok: false, msg: 'Job for ' + unitName + ' failed because the control process exited with error code.\nSee "systemctl status ' + unitName + '" and "journalctl -xeu ' + unitName + '" for details.' };
      }
      o.active = true;
      o.since = Date.now();
      o.pid = o.pid || (BUILTIN_SVC[name] ? BUILTIN_SVC[name].pid : 880);
      sh.logEvent('systemd', 6, `Started ${unitName} - ${o.desc}.`, { ident: 'systemd', pid: 1 });
      return { ok: true };
    }
    // custom unit: run ExecStart
    const es = (svc.ExecStart || '').split('\n').pop().replace(/^[-@+!]+/, '');
    if (!es) {
      o.failed = true;
      o.result = 'exit-code';
      sh.logEvent('systemd', 3, `${unitName}: Service has no ExecStart=, ExecStop=, or SuccessAction=. Refusing.`, { ident: 'systemd', pid: 1 });
      return { ok: false, msg: `Job for ${unitName} failed because the unit configuration is invalid.` };
    }
    const argv = es.split(/\s+/);
    const pid = sh.newPid();
    const exe = argv[0];
    const en = sh.fs.lookup(exe.startsWith('/') ? exe : '/usr/bin/' + exe);
    const fail = (code, status, msg) => {
      o.active = false;
      o.failed = true;
      o.result = 'exit-code';
      o.exitCode = status;
      o.exitMode = code;
      o.failTime = Date.now();
      o.pid = pid;
      if (msg) sh.logEvent(unitName, 3, msg, { ident: 'systemd', pid: 1 });
      sh.logEvent('systemd', 3, `${unitName}: Main process exited, code=${code}, status=${status}`, { ident: 'systemd', pid: 1 });
      sh.logEvent('systemd', 3, `${unitName}: Failed with result 'exit-code'.`, { ident: 'systemd', pid: 1 });
      sh.logEvent('systemd', 3, `Failed to start ${unitName} - ${o.desc}.`, { ident: 'systemd', pid: 1 });
      return { ok: false, msg: `Job for ${unitName} failed because the control process exited with error code.\nSee "systemctl status ${unitName}" and "journalctl -xeu ${unitName}" for details.` };
    };
    if (!en || en.t !== 'f') return fail('exited', '203/EXEC', `${unitName}: Failed at step EXEC spawning ${exe}: No such file or directory`);
    if (!(en.mode & 0o111)) return fail('exited', '203/EXEC', `${unitName}: Failed at step EXEC spawning ${exe}: Permission denied`);
    const long = (LX.bgLong ? LX.bgLong(argv, es) : null) || (en.content && /sleep\s+(\d{3,}|infinity)|while\s+(true|:)|tail\s+-f|http\.server|nc\s+-l/.test(en.content) ? { cpu: /while\s+(true|:)/.test(en.content) && !/sleep/.test(en.content) ? 99 : 0, memKiB: 2800 } : null);
    const runAs = svc.User || 'root';
    const prev = sh._eu;
    sh._eu = runAs;
    let res;
    const prevFast = sh.fast;
    if (long) {
      sh.loopMax = 4;
      sh.loopGuard = 0;
      sh.fast = true;
    }
    try {
      res = await sh.runCapture(argv.slice(), '');
    } finally {
      sh._eu = prev;
      if (long) {
        sh.loopMax = 0;
        sh.loopGuard = 0;
        sh.fast = prevFast;
      }
    }
    for (const line of (res.out + res.err).split('\n').filter(Boolean)) sh.logEvent(unitName, 6, line, { ident: VFS.base(exe), pid });
    if (res.code !== 0) return fail('exited', String(res.code), null);
    const type = svc.Type || 'simple';
    if (type === 'oneshot' || (!long && type !== 'simple') || (!long && type === 'simple')) {
      o.active = false;
      o.since = Date.now();
      o.pid = pid;
      o.finished = Date.now();
      o.result = 'success';
      sh.logEvent('systemd', 6, `${unitName}: Deactivated successfully.`, { ident: 'systemd', pid: 1 });
      sh.logEvent('systemd', 6, `Finished ${unitName} - ${o.desc}.`, { ident: 'systemd', pid: 1 });
      return { ok: true };
    }
    o.active = true;
    o.since = Date.now();
    o.pid = pid;
    o.cpu = (long && long.cpu) || 0;
    o.memKiB = (long && long.memKiB) || 3000;
    sh.logEvent('systemd', 6, `Started ${unitName} - ${o.desc}.`, { ident: 'systemd', pid: 1 });
    return { ok: true };
  };
  P.stopService = function (name) {
    const o = this.services[name];
    if (!o) return false;
    o.active = false;
    o.pid = BUILTIN_SVC[name] ? BUILTIN_SVC[name].pid : o.pid;
    this.logEvent('systemd', 6, `Stopping ${name}.service - ${o.desc}...`, { ident: 'systemd', pid: 1 });
    this.logEvent('systemd', 6, `Stopped ${name}.service - ${o.desc}.`, { ident: 'systemd', pid: 1 });
    return true;
  };

  /* ---------- systemctl ---------- */
  const svcName = (n) => (n || '').replace(/\.service$/, '');
  const statusText = (sh, name, o, isTimer) => {
    const unit = isTimer ? name : `${name}.service`;
    const dot = o.active ? '\x1b[1;32m●\x1b[0m' : o.failed ? '\x1b[1;31m×\x1b[0m' : '○';
    const enabledTxt = o.masked ? 'masked' : o.enabled ? 'enabled' : 'disabled';
    let out = `${dot} ${unit} - ${o.desc}\n     Loaded: loaded (${o.unit}; ${enabledTxt}; preset: enabled)\n`;
    if (o.active) out += `     Active: \x1b[1;32mactive (${isTimer ? 'waiting' : o.oneshot ? 'exited' : 'running'})\x1b[0m since ${fmtDate(o.since || sh.startTime)}; ${ago(o.since || sh.startTime)}\n`;
    else if (o.failed) out += `     Active: \x1b[1;31mfailed\x1b[0m (Result: ${o.result || 'exit-code'}) since ${fmtDate(o.failTime || Date.now())}; ${ago(o.failTime || Date.now())}\n`;
    else out += `     Active: inactive (dead)${o.finished ? ` since ${fmtDate(o.finished)}; ${ago(o.finished)}` : ''}\n`;
    const doc = o.ini && o.ini.Unit && o.ini.Unit.Documentation;
    if (doc) out += `       Docs: ${doc}\n`;
    const svc = (o.ini || {}).Service || {};
    if (!isTimer && (o.active || o.failed || o.finished) && svc.ExecStart) out += `    Process: ${o.pid} ExecStart=${svc.ExecStart.split('\n').pop()} (code=${o.exitMode || 'exited'}, status=${o.exitCode !== undefined ? o.exitCode : '0/SUCCESS'})\n`;
    if (!isTimer && o.active) out += `   Main PID: ${o.pid} (${o.proc})\n      Tasks: ${name === 'nginx' ? 3 : 1} (limit: 4600)\n     Memory: ${(((o.memKiB || 3200) / 1024)).toFixed(1)}M\n        CPU: ${12 + (o.pid % 60)}ms\n     CGroup: /system.slice/${unit}\n             └─${o.pid} ${o.cmd || o.proc}\n`;
    if (isTimer) out += `    Trigger: ${nextElapse(sh, o) ? fmtDate(nextElapse(sh, o)) + '; ' + left(nextElapse(sh, o)) : 'n/a'}\n  Triggers: ● ${(o.ini && o.ini.Timer && o.ini.Timer.Unit) || unit.replace('.timer', '.service')}\n`;
    const lines = sh.journal.filter((e) => e.unit === unit || (e.ident === 'systemd' && e.msg.includes(unit))).slice(-8);
    if (lines.length) out += '\n' + lines.map((e) => `${fmtDate(e.t, '%b %e %H:%M:%S')} ${sh.hostname} ${e.ident}[${e.pid || 1}]: ${e.msg}`).join('\n') + '\n';
    if (sh.unitStale(name, o)) out += `\nWarning: The unit file, source configuration file or drop-ins of ${unit} changed on disk. Run 'systemctl daemon-reload' to reload units.\n`;
    return out;
  };
  async function systemctl(c, args) {
    const sh = c.sh;
    const flags = args.filter((a) => a.startsWith('-'));
    const pos = args.filter((a) => !a.startsWith('-'));
    const sub = pos[0];
    const noPager = true;
    const typeF = (flags.find((f) => f.startsWith('--type=')) || '').split('=')[1];
    const stateF = (flags.find((f) => f.startsWith('--state=')) || '').split('=')[1];
    const all = flags.includes('--all') || flags.includes('-a');
    if (!sub || sub === 'list-units' || flags.includes('--failed')) {
      const failedOnly = flags.includes('--failed') || stateF === 'failed';
      const rows = Object.entries(sh.services).filter(([n, o]) => (all || o.active || o.failed || failedOnly) && (!failedOnly || o.failed) && (!stateF || stateF === 'failed' || (stateF === 'running' && o.active)));
      c.out('  UNIT                 LOAD   ACTIVE SUB     DESCRIPTION\n');
      for (const [n, o] of rows) c.out(`${o.failed ? '\x1b[1;31m●\x1b[0m' : ' '} ${(n + '.service').padEnd(20)} loaded ${(o.active ? 'active' : o.failed ? 'failed' : 'inactive').padEnd(6)} ${(o.active ? 'running' : o.failed ? 'failed' : 'dead').padEnd(7)} ${o.desc}\n`);
      c.out(`\nLOAD   = Reflects whether the unit definition was properly loaded.\nACTIVE = The high-level unit activation state, i.e. generalization of SUB.\nSUB    = The low-level unit activation state, values depend on unit type.\n\n${rows.length} loaded units listed.\n`);
      return 0;
    }
    if (sub === 'list-unit-files') {
      c.out('UNIT FILE                 STATE   PRESET\n');
      const names = new Set();
      for (const d of ['/usr/lib/systemd/system', '/etc/systemd/system']) {
        const dn = sh.fs.lookup(d);
        if (dn) Object.keys(dn.kids).filter((k) => /\.(service|timer)$/.test(k) && (!typeF || k.endsWith('.' + typeF))).forEach((k) => names.add(k));
      }
      for (const n of [...names].sort()) {
        const o = n.endsWith('.timer') ? sh.timers[n] : sh.services[n.replace('.service', '')];
        c.out(`${n.padEnd(25)} ${(o && o.enabled ? 'enabled' : 'disabled').padEnd(7)} enabled\n`);
      }
      return 0;
    }
    if (sub === 'list-timers') {
      c.out('NEXT                        LEFT          LAST                        PASSED       UNIT                 ACTIVATES\n');
      const rows = Object.entries(sh.timers).filter(([, o]) => o.active).map(([n, o]) => ({ n, o, next: nextElapse(sh, o) })).sort((a, b) => (a.next || 1e15) - (b.next || 1e15));
      for (const r of rows) c.out(`${r.next ? fmtDate(r.next).padEnd(27) : 'n/a'.padEnd(27)} ${r.next ? left(r.next).padEnd(13) : 'n/a'.padEnd(13)} ${r.o.last ? fmtDate(r.o.last).padEnd(27) : 'n/a'.padEnd(27)} ${r.o.last ? ago(r.o.last).padEnd(12) : 'n/a'.padEnd(12)} ${r.n.padEnd(20)} ${((r.o.ini && r.o.ini.Timer && r.o.ini.Timer.Unit) || r.n.replace('.timer', '.service'))}\n`);
      c.out(`\n${rows.length} timers listed.\n`);
      return 0;
    }
    if (sub === 'daemon-reload') {
      if (needRoot(c, 'Failed to reload daemon: Interactive authentication required.\n')) return 1;
      sh.lastReload = Date.now();
      sh.lastDaemonReload = Date.now();
      for (const k of Object.keys(sh.services)) if (sh.services[k].unit) sh.loadUnit(k);
      for (const k of Object.keys(sh.timers)) sh.loadUnit(k);
      return 0;
    }
    if (sub === 'get-default') {
      c.out(sh.defaultTarget + '\n');
      return 0;
    }
    if (sub === 'set-default') {
      if (needRoot(c, 'Failed to set default target: Interactive authentication required.\n')) return 1;
      const t = pos[1];
      if (!/\.target$/.test(t || '') || !['graphical.target', 'multi-user.target', 'rescue.target', 'emergency.target'].includes(t)) {
        c.err(`Failed to set default target: Unit ${t} not found.\n`);
        return 1;
      }
      c.out(`Removed "/etc/systemd/system/default.target".\nCreated symlink /etc/systemd/system/default.target → /usr/lib/systemd/system/${t}.\n`);
      sh.defaultTarget = t;
      return 0;
    }
    if (sub === 'isolate' || sub === 'rescue' || sub === 'emergency') {
      if (needRoot(c, 'Failed to start ' + (pos[1] || 'rescue.target') + ': Interactive authentication required.\n')) return 1;
      c.out(`\x1b[2m(In a real machine your session would end and the system would switch to ${pos[1] || sub + '.target'}. The sandbox keeps the window open.)\x1b[0m\n`);
      return 0;
    }
    if (sub === 'reboot' || sub === 'poweroff' || sub === 'halt') return sh.dispatch([sub === 'reboot' ? 'reboot' : 'poweroff'], c.io);
    if (sub === 'reset-failed') {
      for (const o of Object.values(sh.services)) o.failed = false;
      return 0;
    }
    if (sub === 'show') {
      const n = svcName(pos[1]);
      const o = sh.services[n] || sh.loadUnit(n);
      if (!o) {
        c.err(`Unit ${n}.service could not be found.\n`);
        return 1;
      }
      const pI = args.indexOf('-p');
      const want = pI >= 0 ? args[pI + 1].split(',') : null;
      const props = { Id: n + '.service', Description: o.desc, ActiveState: o.active ? 'active' : o.failed ? 'failed' : 'inactive', SubState: o.active ? 'running' : 'dead', UnitFileState: o.enabled ? 'enabled' : 'disabled', MainPID: String(o.active ? o.pid : 0), FragmentPath: o.unit || '', Restart: ((o.ini || {}).Service || {}).Restart || 'no', ExecStart: ((o.ini || {}).Service || {}).ExecStart || '' };
      for (const [k, v] of Object.entries(props)) if (!want || want.includes(k)) c.out(want && want.length === 1 && flags.includes('--value') ? v + '\n' : `${k}=${v}\n`);
      return 0;
    }
    const target = pos[1];
    if (!target) {
      c.err('Too few arguments.\n');
      return 1;
    }
    const isTimer = target.endsWith('.timer');
    const name = isTimer ? target : svcName(target);
    let o = isTimer ? sh.timers[name] : sh.services[name];
    if (!o) o = sh.loadUnit(target);
    if (!o) {
      c.err(sub === 'status' || sub === 'cat' ? `Unit ${target.includes('.') ? target : target + '.service'} could not be found.\n` : `Failed to ${sub} ${target.includes('.') ? target : target + '.service'}: Unit ${target.includes('.') ? target : target + '.service'} not found.\n`);
      return sub === 'status' ? 4 : 5;
    }
    if (o.masked) {
      if (sub === 'status') {
        c.out(`○ ${name}.service\n     Loaded: masked (Reason: Unit ${name}.service is masked.)\n     Active: inactive (dead)\n`);
        return 3;
      }
      if (sub === 'unmask') {
        if (needRoot(c, 'Failed to unmask unit: Interactive authentication required.\n')) return 1;
        const dn = sh.fs.lookup('/etc/systemd/system');
        delete dn.kids[`${name}.service`];
        c.out(`Removed "/etc/systemd/system/${name}.service".\n`);
        return 0;
      }
      c.err(`Failed to ${sub} ${name}.service: Unit ${name}.service is masked.\n`);
      return 1;
    }
    switch (sub) {
      case 'status': {
        c.out(statusText(sh, isTimer ? name : name, o, isTimer));
        return o.active ? 0 : o.failed ? 3 : 3;
      }
      case 'cat': {
        const f = sh.fs.lookup(o.unit);
        c.out(`# ${o.unit}\n${f.content}`);
        const od = sh.fs.lookup(`/etc/systemd/system/${name}.service.d/override.conf`);
        if (od) c.out(`\n# /etc/systemd/system/${name}.service.d/override.conf\n${od.content}`);
        return 0;
      }
      case 'is-active':
        c.out(o.active ? 'active\n' : o.failed ? 'failed\n' : 'inactive\n');
        return o.active ? 0 : 3;
      case 'is-failed':
        c.out(o.failed ? 'failed\n' : o.active ? 'active\n' : 'inactive\n');
        return o.failed ? 0 : 1;
      case 'is-enabled':
        c.out(o.enabled ? 'enabled\n' : 'disabled\n');
        return o.enabled ? 0 : 1;
      case 'edit': {
        if (needRoot(c, 'Failed to edit: Interactive authentication required.\n')) return 1;
        if (!sh.hooks.edit) return 1;
        const p = `/etc/systemd/system/${name}.service.d/override.conf`;
        const ex = sh.fs.lookup(p);
        const res = await sh.hooks.edit({ name: 'nano', path: p, content: ex ? ex.content : '### Editing /etc/systemd/system/' + name + '.service.d/override.conf\n### Anything between here and the comment below will become the contents of the drop-in file\n\n[Service]\n\n### Edits below this comment will be discarded\n', readonly: false });
        if (res !== null && res !== undefined) {
          sh.fs.mkdirp(`/etc/systemd/system/${name}.service.d`, { owner: 'root', group: 'root' });
          sh.fs.put(p, res, { owner: 'root', group: 'root' });
          sh.lastReload = Date.now();
          sh.loadUnit(name);
        }
        return 0;
      }
      case 'mask': {
        if (needRoot(c, `Failed to mask unit: Interactive authentication required.\n`)) return 1;
        const dn = sh.fs.mkdirp('/etc/systemd/system', {});
        dn.kids[`${name}.service`] = sh.fs.mk('l', { target: '/dev/null', owner: 'root', group: 'root', mode: 0o777 });
        o.active = false;
        c.out(`Created symlink /etc/systemd/system/${name}.service → /dev/null.\n`);
        return 0;
      }
      case 'unmask':
        return 0;
      case 'start':
      case 'restart':
      case 'reload':
      case 'try-restart':
      case 'stop':
      case 'enable':
      case 'disable':
      case 'kill': {
        if (sh.eu() !== 'root') {
          c.err(`Failed to ${sub} ${isTimer ? name : name + '.service'}: Interactive authentication required.\nSee system logs and 'systemctl status ${isTimer ? name : name + '.service'}' for details.\n`);
          return 1;
        }
        const nowFlag = flags.includes('--now');
        if (sub === 'enable' || sub === 'disable') {
          const wb = (o.ini && o.ini.Install && o.ini.Install.WantedBy) || 'multi-user.target';
          const dirp = `/etc/systemd/system/${wb}.wants`;
          if (sub === 'enable') {
            if (!o.ini || !o.ini.Install) {
              c.err(`The unit files have no installation config (WantedBy=, RequiredBy=, UpheldBy=,\nAlso=, or Alias= settings in the [Install] section, and DefaultInstance= for\ntemplate units). This means they are not meant to be enabled or disabled using systemctl.\n`);
              return 0;
            }
            sh.fs.mkdirp(dirp, { owner: 'root', group: 'root' }).kids[isTimer ? name : name + '.service'] = sh.fs.mk('l', { target: o.unit, owner: 'root', group: 'root', mode: 0o777 });
            o.enabled = true;
            if (BUILTIN_SVC[name] || name === 'nginx') c.out(`Synchronizing state of ${name}.service with SysV service script with /usr/lib/systemd/systemd-sysv-install.\nExecuting: /usr/lib/systemd/systemd-sysv-install enable ${name}\n`);
            c.out(`Created symlink ${dirp}/${isTimer ? name : name + '.service'} → ${o.unit}.\n`);
            if (nowFlag) return await systemctl(c, ['start', target]);
          } else {
            const dn = sh.fs.lookup(dirp);
            if (dn) delete dn.kids[isTimer ? name : name + '.service'];
            o.enabled = false;
            c.out(`Removed "${dirp}/${isTimer ? name : name + '.service'}".\n`);
            if (nowFlag) return await systemctl(c, ['stop', target]);
          }
          return 0;
        }
        if (isTimer) {
          if (sub === 'start' || sub === 'restart') {
            o.active = true;
            sh.logEvent('systemd', 6, `Started ${name} - ${o.desc}.`, { ident: 'systemd', pid: 1 });
          } else if (sub === 'stop') o.active = false;
          return 0;
        }
        if (sub === 'stop' || sub === 'kill') {
          if (!o.active && sub === 'stop') return 0;
          sh.stopService(name);
          if (sh.serviceHooks && sh.serviceHooks[name]) await sh.serviceHooks[name](c, 'stop');
          return 0;
        }
        if (sub === 'try-restart' && !o.active) return 0;
        if (sub === 'reload' && sh.serviceHooks && sh.serviceHooks[name]) {
          const r = await sh.serviceHooks[name](c, 'reload');
          if (!r.ok) {
            c.err(`Job for ${name}.service failed.\nSee "systemctl status ${name}.service" and "journalctl -xeu ${name}.service" for details.\n`);
            return 1;
          }
          return 0;
        }
        if (sub === 'restart' && o.active) {
          sh.stopService(name);
          if (sh.serviceHooks && sh.serviceHooks[name]) await sh.serviceHooks[name](c, 'stop');
        }
        const r = await sh.startService(name, c);
        if (!r.ok) {
          c.err(r.msg + '\n');
          return 1;
        }
        return 0;
      }
    }
    c.err(`Unknown command verb '${sub}'.\n`);
    return 1;
  }
  def('systemctl', systemctl);
  def('service', async (c, args) => {
    if (args[0] === '--status-all') {
      for (const [n, o] of Object.entries(c.sh.services)) c.out(` [ ${o.active ? '+' : '-'} ]  ${n}\n`);
      return 0;
    }
    if (args.length < 2) {
      c.err('Usage: service < option > | --status-all | [ service_name [ command | --full-restart ] ]\n');
      return 1;
    }
    return systemctl(c, [args[1], args[0]]);
  });
  def('systemd-analyze', async (c, args) => {
    const sh = c.sh;
    const sub = args[0];
    if (!sub) {
      c.out('Startup finished in 3.482s (kernel) + 9.521s (userspace) = 13.003s \ngraphical.target reached after 9.380s in userspace.\n');
      return 0;
    }
    if (sub === 'blame') {
      ['4.210s cloud-init-local.service', '2.771s apt-daily-upgrade.service', '1.903s dev-sda1.device', '1.221s snapd.seeded.service', '0.842s ssh.service', '0.512s cron.service', '0.301s networkd-dispatcher.service'].forEach((l) => c.out(l.padStart(9 + 0) + '\n'));
      return 0;
    }
    if (sub === 'critical-chain') {
      c.out('The time when unit became active or started is printed after the "@" character.\nThe time the unit took to start is printed after the "+" character.\n\ngraphical.target @9.380s\n└─multi-user.target @9.379s\n  └─ssh.service @8.402s +0.842s\n    └─network.target @8.399s\n');
      return 0;
    }
    if (sub === 'calendar') {
      const expr = args.slice(1).filter((a) => !a.startsWith('-')).join(' ');
      const norm = normalizeCal(expr);
      if (!norm) {
        c.err(`Failed to parse calendar specification '${expr}': Invalid argument\n`);
        return 1;
      }
      const iter = +((args.find((a) => a.startsWith('--iterations=')) || '=1').split('=')[1]);
      let from = Date.now();
      c.out(`  Original form: ${expr}\nNormalized form: ${norm}\n`);
      for (let i = 0; i < iter; i++) {
        const nx = calNext(norm, from);
        if (!nx) {
          c.out('    Next elapse: never\n');
          break;
        }
        c.out(`${i ? '                 ' : '    Next elapse: '}${fmtDate(nx)}\n${i ? '' : `       (in UTC): ${U.strftime('%a %F %H:%M:%S UTC', new Date(nx), true)}\n       From now: ${left(nx)}\n`}`);
        from = nx;
      }
      return 0;
    }
    c.err(`Unknown command '${sub}'.\n`);
    return 1;
  });

  /* ---------- calendar parsing ---------- */
  const SHORT = { minutely: '*-*-* *:*:00', hourly: '*-*-* *:00:00', daily: '*-*-* 00:00:00', weekly: 'Mon *-*-* 00:00:00', monthly: '*-*-01 00:00:00', yearly: '*-01-01 00:00:00', annually: '*-01-01 00:00:00' };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function normalizeCal(expr) {
    expr = (expr || '').trim();
    if (SHORT[expr]) return SHORT[expr];
    let dow = '';
    let date = '*-*-*';
    let time = '00:00:00';
    for (const tk of expr.split(/\s+/)) {
      if (/^[A-Za-z]{3}/.test(tk) && !tk.includes('-') && !tk.includes(':')) dow = tk;
      else if (tk.includes('-')) date = tk.split('-').length === 2 ? '*-' + tk : tk;
      else if (tk.includes(':')) time = tk.split(':').length === 2 ? tk + ':00' : tk;
      else return null;
    }
    if (!/^[\d*/,.\-]+$/.test(date.replace(/-/g, ''))) {
      if (!/^[\d*,/.-]+$/.test(date)) return null;
    }
    return (dow ? dow + ' ' : '') + date + ' ' + time;
  }
  function fieldMatch(spec, v) {
    if (spec === '*') return true;
    return spec.split(',').some((p) => {
      let m;
      if ((m = /^\*\/(\d+)$/.exec(p))) return v % +m[1] === 0;
      if ((m = /^(\d+)\.\.(\d+)$/.exec(p))) return v >= +m[1] && v <= +m[2];
      if ((m = /^(\d+)\/(\d+)$/.exec(p))) return v >= +m[1] && (v - +m[1]) % +m[2] === 0;
      return +p === v;
    });
  }
  function calNext(norm, from) {
    const parts = norm.split(' ');
    const dowSpec = parts.length === 3 ? parts[0] : null;
    const [y, mo, d] = parts[parts.length - 2].split('-');
    const [h, mi, s] = parts[parts.length - 1].split(':');
    let t = new Date(Math.ceil((from + 1000) / 1000) * 1000);
    const limit = from + 400 * 86400000;
    // minute-wise scan for matching, then handle seconds spec (assume fixed)
    t.setSeconds(0, 0);
    if (t.getTime() <= from) t = new Date(t.getTime() + 60000);
    for (let ms = t.getTime(); ms < limit; ms += 60000) {
      const dt = LX.zdate(ms);
      if (!fieldMatch(h, dt.getHours()) || !fieldMatch(mi, dt.getMinutes())) continue;
      if (!fieldMatch(d, dt.getDate()) || !fieldMatch(mo, dt.getMonth() + 1) || (y !== '*' && !fieldMatch(y, dt.getFullYear()))) continue;
      if (dowSpec) {
        const names = dowSpec.split(',').flatMap((x) => {
          const r = /^(\w{3})\.\.(\w{3})$/.exec(x);
          if (r) {
            const a = DOW.indexOf(r[1]);
            const b = DOW.indexOf(r[2]);
            return DOW.slice(a, b + 1);
          }
          return [x.slice(0, 3)];
        });
        if (!names.includes(DOW[dt.getDay()])) continue;
      }
      const sec = s === '*' || s === '00' ? 0 : parseInt(s, 10) || 0;
      return ms + sec * 1000;
    }
    return null;
  }
  function nextElapse(sh, o) {
    const t = (o.ini && o.ini.Timer) || {};
    const times = [];
    if (t.OnCalendar) for (const e of t.OnCalendar.split('\n')) {
      const n = normalizeCal(e);
      const nx = n && calNext(n, Date.now());
      if (nx) times.push(nx);
    }
    if (t.OnBootSec) times.push(sh.startTime + parseSpan(t.OnBootSec));
    if (t.OnActiveSec) times.push((o.since || Date.now()) + parseSpan(t.OnActiveSec));
    if (t.OnUnitActiveSec) times.push((o.last || Date.now()) + parseSpan(t.OnUnitActiveSec));
    const fut = times.filter((x) => x > Date.now() - 1);
    return fut.length ? Math.min(...fut) : null;
  }
  LX.timerNext = nextElapse;
  LX.calNormalize = normalizeCal;
  LX.calNext = calNext;
  function parseSpan(s) {
    let total = 0;
    for (const m of String(s).matchAll(/(\d+)\s*(s|sec|m|min|h|hr|d|w)?/g)) total += +m[1] * { s: 1, sec: 1, m: 60, min: 60, h: 3600, hr: 3600, d: 86400, w: 604800, undefined: 1 }[m[2]] * 1000;
    return total;
  }

  /* ---------- journalctl / logger ---------- */
  const PRIO = { emerg: 0, alert: 1, crit: 2, err: 3, error: 3, warning: 4, warn: 4, notice: 5, info: 6, debug: 7 };
  const parseSince = (s) => {
    if (!s) return 0;
    const now = Date.now();
    if (s === 'today') return new Date().setHours(0, 0, 0, 0);
    if (s === 'yesterday') return new Date().setHours(0, 0, 0, 0) - 86400000;
    if (s === 'now') return now;
    let m = /^(\d+)\s*(second|sec|s|minute|min|m|hour|hr|h|day|d)s?\s+ago$/.exec(s.trim());
    if (m) return now - +m[1] * { second: 1000, sec: 1000, s: 1000, minute: 60000, min: 60000, m: 60000, hour: 3600000, hr: 3600000, h: 3600000, day: 86400000, d: 86400000 }[m[2]];
    m = /^-(\d+)\s*(h|min|m|d)$/.exec(s);
    if (m) return now - +m[1] * { h: 3600000, min: 60000, m: 60000, d: 86400000 }[m[2]];
    const d = new Date(s);
    return isNaN(d) ? 0 : d.getTime();
  };
  def('journalctl', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root' && !sh.users[sh.eu()].groups.some((g) => ['adm', 'systemd-journal', 'sudo'].includes(g))) {
      c.out('Hint: You are currently not seeing messages from other users and the system.\n      Users in groups \'adm\', \'systemd-journal\' can see all messages.\n      Pass -q to turn off this notice.\n');
    }
    const g = (k) => {
      const i = args.findIndex((a) => a === k || a.startsWith(k + '='));
      if (i < 0) return undefined;
      return args[i].includes('=') ? args[i].split('=').slice(1).join('=') : args[i + 1];
    };
    if (args.includes('--disk-usage')) return c.out(`Archived and active journals take up ${sh.journalPersist ? '16.0M' : '8.0M'} in the file system.\n`);
    if (args.some((a) => a.startsWith('--vacuum'))) {
      if (needRoot(c, 'Failed to vacuum: Permission denied\n')) return 1;
      c.out('Vacuuming done, freed 0B of archived journals from /var/log/journal.\n');
      return 0;
    }
    if (args.includes('--list-boots')) {
      for (let b = sh.bootId; b >= 1; b--) {
        if (b < sh.bootId && !sh.journalPersist) continue;
        c.out(`${String(b - sh.bootId).padStart(3)} ${'a1b2c3d4e5f6'.slice(0, 8)}${b}00000000000000000000 ${fmtDate(sh.startTime - (sh.bootId - b) * 86400000, '%a %F %H:%M:%S %Z')}—${fmtDate(Date.now())}\n`);
      }
      return 0;
    }
    let ents = sh.journal.slice();
    const unit = g('-u') || g('--unit');
    if (unit) {
      const u = unit.includes('.') ? unit : unit + '.service';
      ents = ents.filter((e) => e.unit === u || (e.ident === 'systemd' && e.msg.includes(u)));
    }
    const ident = g('-t') || g('--identifier');
    if (ident) ents = ents.filter((e) => e.ident === ident);
    const pI = g('-p') || g('--priority');
    if (pI !== undefined) {
      const pr = /^\d$/.test(pI) ? +pI : PRIO[pI.split('..')[0]];
      ents = ents.filter((e) => e.prio <= pr);
    }
    if (args.includes('-k') || args.includes('--dmesg')) ents = ents.filter((e) => e.unit === 'kernel');
    const bI = args.findIndex((a) => a === '-b' || a.startsWith('--boot'));
    if (bI >= 0) {
      const v = args[bI].includes('=') ? args[bI].split('=')[1] : /^-?\d+$/.test(args[bI + 1] || '') ? args[bI + 1] : '0';
      const want = sh.bootId + +v;
      if (want < 1 || (want < sh.bootId && !sh.journalPersist)) {
        c.err('Specified boot ID or offset cannot be resolved: no persistent journal (create /var/log/journal and restart systemd-journald to keep logs across reboots)\n');
        return 1;
      }
      ents = ents.filter((e) => e.boot === want);
    }
    const since = parseSince(g('--since') || g('-S'));
    const until = g('--until') || g('-U');
    if (since) ents = ents.filter((e) => e.t >= since);
    if (until) ents = ents.filter((e) => e.t <= parseSince(until));
    if (g('--grep') || g('-g')) {
      const re = new RegExp(g('--grep') || g('-g'), 'i');
      ents = ents.filter((e) => re.test(e.msg));
    }
    const nI = g('-n') || g('--lines');
    if (nI !== undefined && nI !== 'all') ents = ents.slice(-parseInt(nI, 10));
    else if (args.includes('-f') && !args.includes('-n')) ents = ents.slice(-10);
    if (args.includes('-r') || args.includes('--reverse')) ents.reverse();
    const cat = (g('-o') || g('--output')) === 'cat';
    const json = (g('-o') || g('--output')) === 'json';
    if (!ents.length) {
      c.out('-- No entries --\n');
      return 0;
    }
    for (const e of ents) {
      if (cat) c.out(e.msg + '\n');
      else if (json) c.out(JSON.stringify({ MESSAGE: e.msg, PRIORITY: String(e.prio), SYSLOG_IDENTIFIER: e.ident, _PID: String(e.pid || 0), __REALTIME_TIMESTAMP: String(e.t * 1000) }) + '\n');
      else c.out(`${fmtDate(e.t, '%b %e %H:%M:%S')} ${sh.hostname} ${e.ident}${e.pid ? '[' + e.pid + ']' : ''}: ${e.prio <= 3 ? '\x1b[1;31m' + e.msg + '\x1b[0m' : e.msg}\n`);
    }
    if (args.includes('-f') && c.tty) {
      c.out('\x1b[2m-- (journalctl -f keeps waiting for new messages: press Ctrl+C to stop) --\x1b[0m\n');
      await sh.waitMs(1e9);
    }
    return 0;
  });
  def('logger', async (c, args) => {
    const sh = c.sh;
    let tag = 'learner';
    let prio = 5;
    const msg = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-t') tag = args[++i];
      else if (args[i] === '-p') prio = PRIO[(args[++i] || '').split('.').pop()] ?? 5;
      else if (!args[i].startsWith('-')) msg.push(args[i]);
    }
    sh.logEvent(tag, prio, msg.join(' ') || (await c.slurp()).trim(), { ident: tag, pid: 1300 });
    return 0;
  });

  /* ---------- reboot / shutdown ---------- */
  P.doReboot = async function (c, kind) {
    const sh = this;
    c.out(`\nBroadcast message from root@${sh.hostname} (pts/0) (${U.strftime('%a %b %e %H:%M:%S %Y', new Date())}):\n\nThe system will ${kind === 'reboot' ? 'reboot' : 'power off'} now!\n\n`);
    await sh.waitMs(500);
    c.out('[ \x1b[32m OK \x1b[0m ] Stopped target Multi-User System.\n[ \x1b[32m OK \x1b[0m ] Stopped OpenBSD Secure Shell server.\n[ \x1b[32m OK \x1b[0m ] Unmounted /data.\n[ \x1b[32m OK \x1b[0m ] Reached target Reboot.\n');
    await sh.waitMs(500);
    sh.reboot();
    c.out('\n\x1b[1mLinux Academy sandbox restarted.\x1b[0m \x1b[2mUptime is back to zero. Files are kept. Anything that lived only in memory (temporary mounts, running jobs, temporary settings) is gone, just like on a real machine.\x1b[0m\n');
  };
  P.reboot = function () {
    const sh = this;
    sh.jobs = [];
    sh.user = 'learner';
    sh._eu = null;
    sh.userStack = [];
    sh.cwd = '/home/learner';
    sh.startTime = Date.now();
    sh.bootId++;
    sh.sudoUntil = 0;
    if (!sh.fs.lookup('/var/log/journal')) sh.journal = [];
    else sh.journalPersist = true;
    sh.journal = sh.journal.filter((e) => e.boot === sh.bootId || sh.journalPersist);
    sh.vars = { HOME: '/home/learner', USER: 'learner', LOGNAME: 'learner', SHELL: '/bin/bash', PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'en_US.UTF-8', TERM: 'xterm-256color', EDITOR: 'nano', OLDPWD: '' };
    sh.aliases = { ll: 'ls -alF', la: 'ls -A', l: 'ls -CF' };
    sh.funcs = {};
    sh.arrays = {};
    sh.localStack = [];
    // /tmp is cleaned
    const tmp = sh.fs.lookup('/tmp');
    if (tmp) tmp.kids = {};
    sh.rebuildMounts();
    // services: enabled ones start
    for (const [n, o] of Object.entries(sh.services)) {
      o.failed = false;
      o.active = !!o.enabled && !o.masked;
      if (o.active) o.since = Date.now();
    }
    for (const [n, o] of Object.entries(sh.timers)) o.active = !!o.enabled;
    // sysctl: persisted values
    sh.sysctl = Object.assign({}, sh.sysctlPersist);
    for (const p of ['/etc/sysctl.conf', ...Object.keys((sh.fs.lookup('/etc/sysctl.d') || { kids: {} }).kids).map((k) => '/etc/sysctl.d/' + k)]) {
      const f = sh.fs.lookup(p);
      if (f && f.t === 'f') for (const l of (f.content || '').split('\n')) {
        const m = /^\s*([\w.-]+)\s*=\s*(.+?)\s*$/.exec(l);
        if (m && !l.trim().startsWith('#') && sh.sysctl[m[1]] !== undefined) sh.sysctl[m[1]] = m[2];
      }
    }
    // modules
    sh.modules = ['ext4', 'mbcache', 'jbd2', 'crc32c_generic', 'xfs', 'libcrc32c', 'vfat', 'fat', 'overlay', 'loop', 'dm_mod', 'ip_tables', 'x_tables', 'iptable_filter', 'virtio_net', 'virtio_blk', 'nf_conntrack', 'nf_defrag_ipv4'];
    const ml = sh.fs.lookup('/etc/modules-load.d');
    for (const f of Object.values(ml ? ml.kids : {})) for (const l of (f.content || '').split('\n')) if (l.trim() && !l.startsWith('#') && !sh.modules.includes(l.trim()) && MODINFO[l.trim()]) sh.modules.push(l.trim());
    sh.hostname = (((sh.fs.lookup('/etc/hostname') || {}).content) || 'linux-school').trim();
    (sh.rebootHooks || []).forEach((h) => h(sh));
    sh.logEvent('kernel', 6, 'Linux version 6.8.0-45-generic (buildd@lcy02-amd64-020) #45-Ubuntu SMP PREEMPT_DYNAMIC', { ident: 'kernel' });
    for (const [n, o] of Object.entries(sh.services)) if (o.active) {
      if (!BUILTIN_SVC[n] && n !== 'nginx') sh.startService(n, { out: () => {}, err: () => {}, io: {} });
      else sh.logEvent('systemd', 6, `Started ${n}.service - ${o.desc}.`, { ident: 'systemd', pid: 1 });
    }
  };
  const powerCmd = (kind) => async (c, args) => {
    const sh = c.sh;
    const flags = args.filter((a) => a.startsWith('-'));
    if (sh.eu() !== 'root') {
      c.err(`Failed to set wall message, ignoring: Interactive authentication required.\nFailed to ${kind === 'reboot' ? 'reboot' : 'power off'} system via logind: Interactive authentication required.\nFailed to open initctl fifo: Permission denied\nFailed to talk to init daemon.\n`);
      return 1;
    }
    if (flags.includes('-c')) {
      sh.pendingShutdown = null;
      c.out('\x1b[2mShutdown cancelled.\x1b[0m\n');
      return 0;
    }
    await sh.doReboot(c, kind);
    return 0;
  };
  def('reboot', powerCmd('reboot'));
  def('poweroff', powerCmd('poweroff'));
  def('halt', powerCmd('poweroff'));
  def('shutdown', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root') {
      c.err('Failed to set wall message, ignoring: Interactive authentication required.\nFailed to power off system via logind: Interactive authentication required.\nFailed to open initctl fifo: Permission denied\nFailed to talk to init daemon.\n');
      return 1;
    }
    if (args.includes('-c')) {
      sh.pendingShutdown = null;
      c.out('\x1b[2mShutdown cancelled.\x1b[0m\n');
      return 0;
    }
    const when = args.find((a) => /^(now|\+\d+|\d{1,2}:\d{2})$/.test(a)) || '+1';
    const reboot = args.includes('-r');
    if (when === 'now' || when === '+0') {
      await sh.doReboot(c, reboot ? 'reboot' : 'poweroff');
      return 0;
    }
    const mins = /^\+(\d+)$/.test(when) ? +when.slice(1) : 1;
    sh.pendingShutdown = { at: Date.now() + mins * 60000, reboot };
    c.out(`Shutdown scheduled for ${fmtDate(Date.now() + mins * 60000)}, use 'shutdown -c' to cancel.\n`);
    return 0;
  });
  def('telinit', async (c, args) => c.sh.dispatch(args[0] === '6' ? ['reboot'] : args[0] === '0' ? ['poweroff'] : ['true'], c.io));
  def('init', async (c, args) => c.sh.dispatch(args[0] === '6' ? ['reboot'] : args[0] === '0' ? ['poweroff'] : ['true'], c.io));
  def('update-grub', async (c) => {
    if (needRoot(c, 'Sorry, user learner is not allowed...\n'.replace(/.*/, 'update-grub: You must be root to run this command.\n'))) return 1;
    c.out('Sourcing file `/etc/default/grub\'\nGenerating grub configuration file ...\nFound linux image: /boot/vmlinuz-6.8.0-45-generic\nFound initrd image: /boot/initrd.img-6.8.0-45-generic\nWarning: os-prober will not be executed to detect other bootable partitions.\ndone\n');
    const f = c.sh.fs.lookup('/boot/grub/grub.cfg');
    const d = c.sh.fs.lookup('/etc/default/grub').content;
    const cmd = (/GRUB_CMDLINE_LINUX_DEFAULT="([^"]*)"/.exec(d) || [0, ''])[1];
    f.content = f.content.replace(/ro .*$/m, 'ro ' + cmd);
  });
  c_alias('grub-mkconfig', 'update-grub');
  c_alias('grub2-mkconfig', 'update-grub');
  function c_alias(a, b) {
    def(a, async (c, args) => LX.cmds[b].run(c, args));
  }

  /* ---------- kernel, hardware ---------- */
  const MODINFO = {
    dummy: { desc: 'Dummy netdevice driver which discards all packets sent to it', dep: '' },
    loop: { desc: 'Loopback device support', dep: '' },
    nfs: { desc: 'NFS client support', dep: 'nfs_acl,lockd,sunrpc' },
    nfsd: { desc: 'In-kernel NFS server', dep: 'sunrpc,lockd' },
    tun: { desc: 'Universal TUN/TAP device driver', dep: '' },
    veth: { desc: 'Virtual Ethernet Tunnel', dep: '' },
    bridge: { desc: 'Ethernet bridge driver', dep: 'stp,llc' },
    br_netfilter: { desc: 'Linux ethernet netfilter firewall bridge', dep: 'bridge' },
    overlay: { desc: 'Overlay filesystem', dep: '' },
    raid1: { desc: 'RAID1 (mirroring) personality for MD', dep: 'md_mod' },
    kvm: { desc: 'Kernel-based Virtual Machine', dep: '' },
    usb_storage: { desc: 'USB Mass Storage driver for Linux', dep: 'scsi_mod' },
    xfs: { desc: 'SGI XFS filesystem', dep: 'libcrc32c' },
    ext4: { desc: 'Fourth Extended Filesystem', dep: 'mbcache,jbd2' },
    vfat: { desc: 'VFAT filesystem support', dep: 'fat' },
    pcspkr: { desc: 'PC Speaker beeper driver', dep: '' },
  };
  def('lsmod', async (c) => {
    c.out('Module                  Size  Used by\n');
    c.sh.modules.slice().reverse().forEach((m, i) => c.out(`${m.padEnd(23)} ${String(16384 + ((m.length * 7919) % 90000)).padStart(6)}  ${m === 'jbd2' || m === 'mbcache' ? 1 : 0}${m === 'ext4' ? ' ' : ''}\n`));
  });
  def('modinfo', async (c, args) => {
    const m = args.find((a) => !a.startsWith('-'));
    const i = MODINFO[m] || (c.sh.modules.includes(m) ? { desc: m + ' kernel module', dep: '' } : null);
    if (!i) {
      c.err(`modinfo: ERROR: Module ${m} not found.\n`);
      return 1;
    }
    c.out(`filename:       /lib/modules/6.8.0-45-generic/kernel/${m}.ko.zst\ndescription:    ${i.desc}\nlicense:        GPL\ndepends:        ${i.dep}\nname:           ${m}\nvermagic:       6.8.0-45-generic SMP preempt mod_unload modversions\n`);
  });
  def('modprobe', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root') {
      c.err(`modprobe: ERROR: could not insert '${args.find((a) => !a.startsWith('-'))}': Operation not permitted\n`);
      return 1;
    }
    const rm = args.includes('-r');
    const m = args.find((a) => !a.startsWith('-'));
    if (rm) {
      if (['ext4', 'jbd2', 'mbcache', 'dm_mod', 'ip_tables'].includes(m)) {
        c.err(`modprobe: FATAL: Module ${m} is in use.\n`);
        return 1;
      }
      sh.modules = sh.modules.filter((x) => x !== m);
      return 0;
    }
    if (!MODINFO[m] && !sh.modules.includes(m)) {
      c.err(`modprobe: FATAL: Module ${m} not found in directory /lib/modules/6.8.0-45-generic\n`);
      return 1;
    }
    const bl = (sh.fs.lookup('/etc/modprobe.d/blacklist.conf') || {}).content || '';
    if (!sh.modules.includes(m)) {
      sh.modules.push(m);
      sh.logEvent('kernel', 6, `${m}: module loaded`, { ident: 'kernel' });
    }
    return 0;
  });
  def('rmmod', async (c, args) => c.sh.dispatch(['modprobe', '-r', ...args], c.io));
  def('lspci', async (c, args) => {
    const lines = ['00:00.0 Host bridge: Intel Corporation 440FX - 82441FX PMC [Natoma] (rev 02)', '00:01.0 ISA bridge: Intel Corporation 82371SB PIIX3 ISA [Natoma/Triton II]', '00:01.1 IDE interface: Intel Corporation 82371SB PIIX3 IDE [Natoma/Triton II]', '00:02.0 VGA compatible controller: Red Hat, Inc. Virtio 1.0 GPU (rev 01)', '00:03.0 Ethernet controller: Red Hat, Inc. Virtio 1.0 network device (rev 01)', '00:04.0 SCSI storage controller: Red Hat, Inc. Virtio 1.0 block device (rev 01)'];
    if (args.includes('-k')) lines.forEach((l, i) => c.out(l + '\n' + (i >= 3 ? `\tKernel driver in use: ${['virtio-pci', 'virtio-pci', 'virtio-pci'][i - 3]}\n\tKernel modules: ${['virtio_gpu', 'virtio_net', 'virtio_blk'][i - 3]}\n` : '')));
    else c.out(lines.join('\n') + '\n');
  });
  def('lsusb', async (c) => c.out('Bus 001 Device 001: ID 1d6b:0001 Linux Foundation 1.1 root hub\nBus 002 Device 001: ID 1d6b:0002 Linux Foundation 2.0 root hub\n'));
  def('lscpu', async (c) => c.out('Architecture:             x86_64\n  CPU op-mode(s):         32-bit, 64-bit\n  Address sizes:          46 bits physical, 48 bits virtual\n  Byte Order:             Little Endian\nCPU(s):                   2\n  On-line CPU(s) list:    0,1\nVendor ID:                GenuineIntel\n  Model name:             Intel(R) Xeon(R) CPU @ 2.60GHz\n    Thread(s) per core:   1\n    Core(s) per socket:   2\n    Socket(s):            1\nVirtualization features:\n  Hypervisor vendor:      KVM\n  Virtualization type:    full\nCaches (sum of all):\n  L1d:                    64 KiB (2 instances)\n  L2:                     8 MiB (2 instances)\n'));
  def('lshw', async (c) => {
    if (needRoot(c, 'WARNING: you should run this program as super-user.\n')) return 1;
    c.out('H/W path        Device     Class       Description\n=====================================================\n                              system      Standard PC (i440FX + PIIX, 1996)\n/0                            bus         Motherboard\n/0/0                          memory      4GiB System memory\n/0/1                          processor   Intel(R) Xeon(R) CPU @ 2.60GHz\n/0/100/3        eth0       network     Virtio 1.0 network device\n/0/100/4        /dev/sda   disk        25GB Virtual disk\n');
  });
  def('dmidecode', async (c) => {
    if (needRoot(c, '/sys/firmware/dmi/tables/smbios_entry_point: Permission denied\n')) return 1;
    c.out('# dmidecode 3.5\nGetting SMBIOS data from sysfs.\nSMBIOS 2.8 present.\n\nHandle 0x0100, DMI type 1, 27 bytes\nSystem Information\n\tManufacturer: QEMU\n\tProduct Name: Standard PC (i440FX + PIIX, 1996)\n\tVersion: pc-i440fx-8.2\n');
  });
  def('dmesg', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root' && sh.sysctl['kernel.dmesg_restrict'] === '1') {
      c.err('dmesg: read kernel buffer failed: Operation not permitted\n');
      return 1;
    }
    const lvl = (args.find((a) => a.startsWith('--level=')) || '').split('=')[1];
    let ents = sh.journal.filter((e) => e.unit === 'kernel');
    if (lvl) ents = ents.filter((e) => e.prio <= (PRIO[lvl.split(',')[0]] ?? 7) || lvl.split(',').some((x) => PRIO[x] === e.prio));
    const T = args.includes('-T') || args.includes('--ctime');
    for (const e of ents) c.out(`${T ? '[' + fmtDate(e.t, '%a %b %e %H:%M:%S %Y') + ']' : '[' + ((e.t - sh.startTime) / 1000).toFixed(6).padStart(12) + ']'} ${e.msg}\n`);
  });
  def('hostnamectl', async (c, args) => {
    const sh = c.sh;
    const sub = args[0];
    if (sub === 'set-hostname' || (sub === 'hostname' && args[1])) {
      if (needRoot(c, 'Could not set static hostname: Interactive authentication required.\n')) return 1;
      const h = args[1];
      if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(h || '')) {
        c.err(`Could not set hostname: Invalid hostname '${h}'\n`);
        return 1;
      }
      sh.hostname = h;
      sh.fs.lookup('/etc/hostname').content = h + '\n';
      sh.logEvent('systemd-hostnamed', 6, `Hostname set to <${h}> (static)`, { ident: 'systemd-hostnamed' });
      return 0;
    }
    c.out(` Static hostname: ${sh.hostname}\n       Icon name: computer-vm\n         Chassis: vm 🖴\n      Machine ID: c4f1d7e8a3b24d6f9e0a1b2c3d4e5f60\n         Boot ID: ${'9a8b7c6d5e4f'}${sh.bootId}3a2b1c0d\n  Virtualization: kvm\nOperating System: Ubuntu 24.04.1 LTS\n          Kernel: Linux 6.8.0-45-generic\n    Architecture: x86-64\n`.replace(' 🖴', ''));
  });
  LX.setTz = (tz) => (LX.tz = tz);
  def('timedatectl', async (c, args) => {
    const sh = c.sh;
    const sub = args[0];
    if (sub === 'set-timezone') {
      if (needRoot(c, 'Failed to set time zone: Interactive authentication required.\n')) return 1;
      try {
        new Intl.DateTimeFormat('en', { timeZone: args[1] });
      } catch (e) {
        c.err(`Failed to set time zone: Invalid time zone '${args[1]}'\n`);
        return 1;
      }
      LX.tz = args[1];
      sh.fs.lookup('/etc/timezone').content = args[1] + '\n';
      return 0;
    }
    if (sub === 'set-ntp') {
      if (needRoot(c, 'Failed to set ntp: Interactive authentication required.\n')) return 1;
      sh.ntp = /^(true|yes|1)$/.test(args[1]);
      return 0;
    }
    if (sub === 'list-timezones') {
      ['Africa/Cairo', 'America/New_York', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'Europe/Paris', 'UTC'].forEach((z) => c.out(z + '\n'));
      return 0;
    }
    const d = new Date();
    const tz = LX.tz || 'Asia/Kolkata';
    c.out(`               Local time: ${U.strftime('%a %F %H:%M:%S %Z', d)}\n           Universal time: ${U.strftime('%a %F %H:%M:%S UTC', d, true)}\n                 RTC time: ${U.strftime('%a %F %H:%M:%S', d, true)}\n                Time zone: ${tz} (${U.strftime('%Z, %z', d)})\nSystem clock synchronized: ${sh.ntp === false ? 'no' : 'yes'}\n              NTP service: ${sh.ntp === false ? 'inactive' : 'active'}\n          RTC in local TZ: no\n`);
  });
  def('localectl', async (c) => c.out('   System Locale: LANG=en_US.UTF-8\n       VC Keymap: n/a\n      X11 Layout: us\n'));
  def('loginctl', async (c, args) => {
    if (args[0] === 'list-users') return c.out(' UID USER    LINGER STATE  \n1000 learner no     active\n\n1 users listed.\n');
    c.out(`SESSION  UID USER    SEAT TTY  \n      3 1000 ${c.sh.user.padEnd(7)} -    pts/0\n\n1 sessions listed.\n`);
  });
  def('chronyc', async (c, args) => {
    if (args[0] === 'tracking') return c.out('Reference ID    : A9FEA97B (169.254.169.123)\nStratum         : 4\nRef time (UTC)  : ' + U.strftime('%a %b %e %H:%M:%S %Y', new Date(), true) + '\nSystem time     : 0.000012345 seconds fast of NTP time\nLast offset     : +0.000004321 seconds\nLeap status     : Normal\n');
    c.out('MS Name/IP address         Stratum Poll Reach LastRx Last sample               \n===============================================================================\n^* ntp.example.net                2   6   377    23   -112us[ -131us] +/-   14ms\n');
  }, { pkg: 'chrony' });
  def('sysctl', async (c, args) => {
    const sh = c.sh;
    const flags = args.filter((a) => a.startsWith('-'));
    const pos = args.filter((a) => !a.startsWith('-'));
    if (flags.includes('-a') || (!pos.length && !flags.includes('-p') && !flags.includes('--system'))) {
      Object.keys(sh.sysctl).sort().forEach((k) => c.out(`${k} = ${sh.sysctl[k]}\n`));
      return 0;
    }
    if (flags.includes('-p') || flags.includes('--system')) {
      if (needRoot(c, 'sysctl: permission denied on key\n')) return 1;
      const files = pos.length ? pos.map((p) => c.abs(p)) : ['/etc/sysctl.conf', ...Object.keys((sh.fs.lookup('/etc/sysctl.d') || { kids: {} }).kids).sort().map((k) => '/etc/sysctl.d/' + k)];
      for (const f of files) {
        const n = sh.fs.lookup(f);
        if (!n) {
          c.err(`sysctl: cannot open "${f}": No such file or directory\n`);
          continue;
        }
        if (flags.includes('--system')) c.out(`* Applying ${f} ...\n`);
        for (const l of (n.content || '').split('\n')) {
          const m = /^\s*([\w.-]+)\s*=\s*(.+?)\s*$/.exec(l);
          if (m && !l.trim().startsWith('#')) {
            if (sh.sysctl[m[1]] === undefined) {
              c.err(`sysctl: cannot stat /proc/sys/${m[1].replace(/\./g, '/')}: No such file or directory\n`);
              continue;
            }
            sh.sysctl[m[1]] = m[2];
            c.out(`${m[1]} = ${m[2]}\n`);
          }
        }
      }
      return 0;
    }
    for (const a of pos) {
      const w = /^([\w.-]+)=(.*)$/.exec(a);
      if (w) {
        if (sh.eu() !== 'root') {
          c.err(`sysctl: permission denied on key '${w[1]}'\n`);
          return 1;
        }
        if (sh.sysctl[w[1]] === undefined) {
          c.err(`sysctl: cannot stat /proc/sys/${w[1].replace(/\./g, '/')}: No such file or directory\n`);
          return 1;
        }
        sh.sysctl[w[1]] = w[2];
        c.out(flags.includes('-q') ? '' : `${w[1]} = ${w[2]}\n`);
      } else {
        if (sh.sysctl[a] === undefined) {
          c.err(`sysctl: cannot stat /proc/sys/${a.replace(/\./g, '/')}: No such file or directory\n`);
          return 1;
        }
        c.out(flags.includes('-n') ? sh.sysctl[a] + '\n' : `${a} = ${sh.sysctl[a]}\n`);
      }
    }
    return 0;
  });

  /* ---------- processes: unified list, ps/top/vmstat/etc ---------- */
  P.procList = function () {
    const sh = this;
    const list = [
      { pid: 1, ppid: 0, user: 'root', cmd: '/sbin/init splash', tty: '?', stat: 'Ss', cpu: 0.0, mem: 0.3, nice: 0 },
      { pid: 2, ppid: 0, user: 'root', cmd: '[kthreadd]', tty: '?', stat: 'S', cpu: 0, mem: 0, nice: 0 },
      { pid: 301, ppid: 1, user: 'root', cmd: '/lib/systemd/systemd-journald', tty: '?', stat: 'Ss', cpu: 0, mem: 0.4, nice: 0 },
      { pid: 601, ppid: 1, user: 'root', cmd: '/lib/systemd/systemd-logind', tty: '?', stat: 'Ss', cpu: 0, mem: 0.1, nice: 0 },
      { pid: 688, ppid: 1, user: 'syslog', cmd: '/usr/sbin/rsyslogd -n -iNONE', tty: '?', stat: 'Ssl', cpu: 0, mem: 0.1, nice: 0 },
    ];
    for (const [n, o] of Object.entries(sh.services)) {
      if (!o.active) continue;
      const cmd = BUILTIN_SVC[n] ? BUILTIN_SVC[n].cmd : n === 'nginx' ? 'nginx: master process /usr/sbin/nginx' : o.cmd || n;
      list.push({ pid: o.pid, ppid: 1, user: n === 'nginx' ? 'root' : ((o.ini && o.ini.Service && o.ini.Service.User) || 'root'), cmd, tty: '?', stat: 'Ss', cpu: o.cpu || 0, mem: (o.memKiB || 3000) / 40467, nice: 0, svc: n });
      if (n === 'nginx') list.push({ pid: o.pid + 1, ppid: o.pid, user: 'www-data', cmd: 'nginx: worker process', tty: '?', stat: 'S', cpu: 0, mem: 0.1, nice: 0, svc: n });
    }
    list.push({ pid: 1189, ppid: 1, user: sh.user, cmd: '-bash', tty: 'pts/0', stat: 'Ss', cpu: 0.0, mem: 0.2, nice: 0, mine: true, name: 'bash' });
    for (const j of sh.jobs) list.push({ pid: j.pid, ppid: 1189, user: sh.user, cmd: j.proc || j.cmd, tty: 'pts/0', stat: j.state === 'Stopped' ? 'T' : j.cpu > 5 ? 'R' : 'S', cpu: j.cpu || 0, mem: (j.memKiB || 0) / 40467, nice: j.nice || 0, mine: true, job: j, name: (j.proc || j.cmd).split(' ')[0] });
    for (const x of sh.extraProcs || []) list.push(x);
    return list;
  };
  const psCols = { pid: (p) => String(p.pid), ppid: (p) => String(p.ppid), user: (p) => p.user, comm: (p) => VFS.base(p.cmd.split(' ')[0]).replace(/^-/, ''), cmd: (p) => p.cmd, args: (p) => p.cmd, '%cpu': (p) => p.cpu.toFixed(1), '%mem': (p) => p.mem.toFixed(1), ni: (p) => String(p.nice), stat: (p) => p.stat, tty: (p) => p.tty, rss: (p) => String(Math.round(p.mem * 40467)), vsz: (p) => String(Math.round(p.mem * 40467 * 4 + 12000)), nice: (p) => String(p.nice), pri: (p) => String(20 + p.nice), uid: (p) => String((LX.shUsers && LX.shUsers[p.user]) || 0), time: () => '00:00:00', start: () => '08:00', lstart: () => 'Mon Oct 26 08:00:00 2026', etime: () => '03:25:10' };
  const PSHEAD = { pid: 'PID', ppid: 'PPID', user: 'USER', comm: 'COMMAND', cmd: 'CMD', args: 'COMMAND', '%cpu': '%CPU', '%mem': '%MEM', ni: 'NI', stat: 'STAT', tty: 'TT', rss: 'RSS', vsz: 'VSZ', nice: 'NI', pri: 'PRI', time: 'TIME', start: 'START', etime: 'ELAPSED', uid: 'UID' };
  psCols.pcpu = psCols['%cpu'];
  psCols.pmem = psCols['%mem'];
  psCols.c = psCols['%cpu'];
  psCols.rssize = psCols.rss;
  psCols.vsize = psCols.vsz;
  psCols.ucmd = psCols.comm;
  psCols.cputime = psCols.time;
  psCols.label = () => 'unconfined';
  Object.assign(PSHEAD, { pcpu: '%CPU', pmem: '%MEM', c: 'C', rssize: 'RSS', vsize: 'VSZ', ucmd: 'CMD', cputime: 'TIME', label: 'LABEL' });
  def('ps', async (c, args) => {
    const sh = c.sh;
    const all = sh.procList();
    const me = { pid: sh.nextPid++, ppid: 1189, user: sh.user, cmd: 'ps' + (args.length ? ' ' + args.join(' ') : ''), tty: 'pts/0', stat: 'R+', cpu: 0, mem: 0, nice: 0, mine: true, name: 'ps' };
    all.push(me);
    const f = args.join(' ');
    let rows = all;
    let oI = args.findIndex((a) => a === '-o' || a === '-eo' || a === 'o' || a.startsWith('-o') && a.length > 2 && !a.startsWith('-ou'));
    let cols = null;
    const g = (k) => {
      const i = args.findIndex((a) => a === k || a.startsWith(k + '='));
      if (i < 0) return undefined;
      return args[i].includes('=') ? args[i].split('=')[1] : args[i + 1];
    };
    const ocols = g('-o') || g('-eo') || g('o');
    if (ocols) cols = ocols.split(',').map((x) => x.trim().toLowerCase());
    if (!/aux|\bax\b|-ax|-e\b|-ef|-A|-eo|-ax/.test(f) && !/-u\b|-C\b|-p\b/.test(f)) rows = all.filter((p) => p.mine);
    const pI = g('-p');
    if (pI) rows = all.filter((p) => pI.split(',').includes(String(p.pid)));
    const uI = g('-u') || g('-U');
    if (uI) rows = all.filter((p) => p.user === uI);
    const CI = g('-C');
    if (CI) rows = all.filter((p) => VFS.base(p.cmd.split(' ')[0]).replace(/^-/, '') === CI || (p.name || '') === CI);
    const sort = g('--sort');
    if (sort) {
      const key = sort.replace(/^[-+]/, '').toLowerCase();
      const desc = sort.startsWith('-');
      const fn = psCols[key] || psCols.pid;
      rows = rows.slice().sort((a, b) => {
        const x = parseFloat(fn(a));
        const y = parseFloat(fn(b));
        const r = !isNaN(x) && !isNaN(y) ? x - y : fn(a).localeCompare(fn(b));
        return desc ? -r : r;
      });
    }
    const fmtRow = (cs, p, head) => cs.map((k, i) => (i === cs.length - 1 && !['pid', 'ppid', '%cpu', '%mem', 'rss', 'vsz', 'ni', 'pri'].includes(k) ? (head ? PSHEAD[k] : psCols[k](p)) : (head ? PSHEAD[k] : psCols[k](p)).padStart(['pid', 'ppid'].includes(k) ? 7 : ['%cpu', '%mem'].includes(k) ? 5 : k === 'user' ? 8 : 4))).join(' ');
    if (cols) {
      const ok = cols.filter((k) => psCols[k]);
      if (ok.length) {
        const noHead = /\bh\b/.test(f) || args.includes('--no-headers') || cols.some((x) => x.includes('='));
        if (!noHead) c.out(fmtRow(ok, null, true) + '\n');
        rows.forEach((p) => c.out(fmtRow(ok, p, false) + '\n'));
        return 0;
      }
    }
    if (/aux|\bau\b|-ax|\bax\b/.test(f)) {
      c.out('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n');
      for (const p of rows) c.out(`${p.user.padEnd(8).slice(0, 8)} ${String(p.pid).padStart(6)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${String(Math.round(p.mem * 40467 * 4 + 12000)).padStart(6)} ${String(Math.round(p.mem * 40467) + 2000).padStart(5)} ${p.tty.padEnd(8)} ${p.stat.padEnd(4)} 08:00   0:00 ${p.cmd}\n`);
    } else if (/-ef|-e\b|-A|-u\b|-C\b|-p\b/.test(f) && !/^-p/.test(f) || /-ef/.test(f)) {
      c.out('UID          PID    PPID  C STIME TTY          TIME CMD\n');
      for (const p of rows) c.out(`${p.user.padEnd(8).slice(0, 8)} ${String(p.pid).padStart(7)} ${String(p.ppid).padStart(7)}  ${Math.round(p.cpu)} 08:00 ${p.tty.padEnd(8)} 00:00:00 ${p.cmd}\n`);
    } else {
      c.out('    PID TTY          TIME CMD\n');
      for (const p of rows) c.out(`${String(p.pid).padStart(7)} ${p.tty.padEnd(8)} 00:00:00 ${p.name || VFS.base(p.cmd.split(' ')[0]).replace(/^-/, '')}\n`);
    }
    return 0;
  });
  def('pidof', async (c, args) => {
    const hit = c.sh.procList().filter((p) => VFS.base(p.cmd.split(' ')[0]).replace(/^-/, '') === args[0] || p.name === args[0]);
    if (!hit.length) return 1;
    c.out(hit.map((p) => p.pid).join(' ') + '\n');
  });
  def('pstree', async (c) => {
    const l = c.sh.procList();
    c.out('systemd─┬─cron\n        ├─rsyslogd\n        ├─sshd───sshd───sshd───bash─┬─' + (l.find((p) => p.job) ? l.find((p) => p.job).cmd.split(' ')[0] : 'pstree') + '\n        │' + ' '.repeat(23) + '└─pstree\n        └─systemd-journal\n');
  });
  const topFrame = (c, args, name) => {
    const sh = c.sh;
    const si = LX.sysinfo(sh);
    const all = sh.procList().slice().sort((a, b) => b.cpu - a.cpu || b.mem - a.mem);
    const batch = args.includes('-b');
    const t = U.strftime('%H:%M:%S', new Date());
    const up = Math.floor((Date.now() - sh.startTime) / 60000);
    c.out(`${name} - ${t} up ${Math.floor(up / 1440)} days, ${Math.floor((up % 1440) / 60)}:${String(up % 60).padStart(2, '0')},  1 user,  load average: ${si.load.map((x) => x.toFixed(2)).join(', ')}\n`);
    c.out(`Tasks: ${String(all.length + 70).padStart(3)} total,   ${1 + sh.jobs.filter((j) => j.cpu > 5).length} running, ${String(all.length + 69).padStart(3)} sleeping,   ${sh.jobs.filter((j) => j.state === 'Stopped').length} stopped,   0 zombie\n`);
    const us = Math.min(99, 1.3 + si.hog * 45);
    c.out(`%Cpu(s): ${us.toFixed(1).padStart(4)} us,  0.7 sy,  0.0 ni, ${Math.max(0, 98 - us).toFixed(1).padStart(4)} id,  0.2 wa,  0.0 hi,  0.0 si,  0.0 st\n`);
    c.out(`MiB Mem :   ${(si.memTotal / 1024).toFixed(1)} total,   ${((si.memTotal - si.memUsed - 1261424) / 1024).toFixed(1)} free,   ${(si.memUsed / 1024).toFixed(1)} used,   1231.9 buff/cache\nMiB Swap:   ${(sh.swapTotal() / 1024).toFixed(1)} total,   ${(sh.swapTotal() / 1024).toFixed(1)} free,      0.0 used.   ${((si.memTotal - si.memUsed) / 1024).toFixed(1)} avail Mem \n\n`);
    c.out('    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n');
    for (const p of all.slice(0, 12)) c.out(`${String(p.pid).padStart(7)} ${p.user.padEnd(9).slice(0, 9)} ${String(20 + p.nice).padStart(2)} ${String(p.nice).padStart(3)} ${String(Math.round(p.mem * 40467 * 4 + 12000)).padStart(7)} ${String(Math.round(p.mem * 40467) + 2000).padStart(6)} ${String(2000).padStart(6)} ${p.stat[0]} ${p.cpu.toFixed(1).padStart(5)} ${p.mem.toFixed(1).padStart(5)}   0:00.${String((p.pid % 90) + 10)} ${VFS.base(p.cmd.split(' ')[0]).replace(/^-/, '').replace(/:$/, '')}\n`);
    if (!batch) c.out('\n\x1b[2m(One snapshot. Real ' + name + ' refreshes every 3 seconds. Keys: P sort by CPU, M by memory, k kill, q quit.)\x1b[0m\n');
  };
  def('top', async (c, args) => topFrame(c, args, 'top'));
  def('htop', async (c, args) => topFrame(c, args, 'htop'), { pkg: 'htop' });
  def('vmstat', async (c, args) => {
    const si = LX.sysinfo(c.sh);
    const n = +(args.filter((a) => /^\d+$/.test(a))[1] || 1);
    c.out('procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----\n r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st\n');
    for (let i = 0; i < n; i++) {
      const us = Math.round(1 + si.hog * 45);
      c.out(`${String(1 + Math.round(si.hog)).padStart(2)}  0      0 ${String(Math.max(100000, si.memTotal - si.memUsed - 1261424)).padStart(7)}  94280 1167144    0    0    21    38  ${String(120 + Math.round(si.hog * 200)).padStart(3)}  250 ${String(us).padStart(2)}  1 ${String(Math.max(0, 98 - us)).padStart(2)}  0  0\n`);
      if (i < n - 1) await c.sh.waitMs(1000);
    }
  });
  def('iostat', async (c) => {
    c.out(`Linux 6.8.0-45-generic (${c.sh.hostname}) \t${U.strftime('%m/%d/%Y', new Date())} \t_x86_64_\t(2 CPU)\n\navg-cpu:  %user   %nice %system %iowait  %steal   %idle\n           1.30    0.00    0.70    0.20    0.00   97.80\n\nDevice            tps    kB_read/s    kB_wrtn/s    kB_dscd/s    kB_read    kB_wrtn    kB_dscd\nsda               2.10        45.20        12.80         0.00     912345     258000          0\n`);
  }, { pkg: 'sysstat' });
  def('sar', async (c, args) => {
    c.out(`Linux 6.8.0-45-generic (${c.sh.hostname}) \t${U.strftime('%m/%d/%Y', new Date())} \t_x86_64_\t(2 CPU)\n\n${U.strftime('%H:%M:%S', new Date())}        CPU     %user     %nice   %system   %iowait    %steal     %idle\n${U.strftime('%H:%M:%S', new Date())}        all      1.30      0.00      0.70      0.20      0.00     97.80\nAverage:        all      1.30      0.00      0.70      0.20      0.00     97.80\n`);
  }, { pkg: 'sysstat' });
  def('mpstat', async (c) => c.out('Linux 6.8.0-45-generic \t_x86_64_\t(2 CPU)\n\nCPU    %usr   %nice    %sys %iowait    %irq   %soft  %steal  %guest  %gnice   %idle\nall    1.30    0.00    0.70    0.20    0.00    0.00    0.00    0.00    0.00   97.80\n'), { pkg: 'sysstat' });
  def('lsof', async (c, args) => {
    const sh = c.sh;
    const head = 'COMMAND   PID     USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\n';
    const iI = args.findIndex((a) => a === '-i' || a.startsWith('-i'));
    const pI = args.indexOf('-p');
    c.out(head);
    if (iI >= 0) {
      const spec = args[iI].length > 2 ? args[iI].slice(2) : args[iI + 1] || '';
      const ports = (sh.listeners ? Object.entries(sh.listeners) : []).map(([port, l]) => ({ port: +port, proc: l.proc, pid: l.pid, user: l.user || 'root' }));
      ports.push({ port: 22, proc: 'sshd', pid: 412, user: 'root' });
      for (const p of ports) if (!spec || spec.replace(/^[^:]*:/, '') === String(p.port) || spec === 'TCP' || spec === 'tcp') c.out(`${p.proc.padEnd(9)} ${String(p.pid).padEnd(7)} ${p.user.padEnd(8)} ${String(6)}u  IPv4  ${24000 + p.port}      0t0  TCP *:${p.port} (LISTEN)\n`);
      return 0;
    }
    const pid = pI >= 0 ? +args[pI + 1] : null;
    for (const p of sh.procList().filter((x) => !pid || x.pid === pid).slice(0, 8)) c.out(`${VFS.base(p.cmd.split(' ')[0]).replace(/^-/, '').slice(0, 9).padEnd(9)} ${String(p.pid).padEnd(7)} ${p.user.padEnd(8)} cwd    DIR    8,1     4096    2 /\n`);
    return 0;
  });
  def('fuser', async (c, args) => {
    const t = args.find((a) => !a.startsWith('-'));
    if (/^\d+\/tcp$/.test(t || '')) {
      const port = t.split('/')[0];
      const l = c.sh.listeners && c.sh.listeners[port];
      if (l) c.out(`${t}:  ${String(l.pid).padStart(8)}\n`);
      return l ? 0 : 1;
    }
    return 1;
  });
  def('nice', async (c, args) => {
    let n = 10;
    let i = 0;
    if (args[0] === '-n') {
      n = +args[1];
      i = 2;
    } else if (/^-\d+$/.test(args[0] || '')) {
      n = +args[0].slice(1);
      i = 1;
    } else if (!args.length) return c.out('0\n');
    if (n < 0 && c.sh.eu() !== 'root') {
      c.err(`nice: cannot set niceness: Permission denied\n`);
      return 1;
    }
    c.sh.niceNext = n;
    try {
      return await c.sh.dispatch(args.slice(i), c.io);
    } finally {
      c.sh.niceNext = 0;
    }
  });
  def('renice', async (c, args) => {
    const sh = c.sh;
    const nI = args.indexOf('-n');
    const n = nI >= 0 ? +args[nI + 1] : +args[0];
    const pI = args.indexOf('-p');
    const pid = pI >= 0 ? +args[pI + 1] : +args[args.length - 1];
    const p = sh.procList().find((x) => x.pid === pid);
    if (!p) {
      c.err(`renice: failed to get priority for ${pid} (process ID): No such process\n`);
      return 1;
    }
    if (sh.eu() !== 'root' && (p.user !== sh.eu() || n < p.nice)) {
      c.err(`renice: failed to set priority for ${pid} (process ID): ${p.user !== sh.eu() ? 'Operation not permitted' : 'Permission denied'}\n`);
      return 1;
    }
    c.out(`${pid} (process ID) old priority ${p.nice}, new priority ${n}\n`);
    if (p.job) p.job.nice = n;
    return 0;
  });
  def('ionice', async (c, args) => {
    if (!args.length) return c.out('none: prio 4\n');
    const i = args.findIndex((a) => !a.startsWith('-') && !/^\d+$/.test(a));
    return i >= 0 ? c.sh.dispatch(args.slice(i), c.io) : 0;
  });
  def('watch', async (c, args) => {
    const sh = c.sh;
    let n = 2;
    let i = 0;
    while (args[i] && args[i].startsWith('-')) {
      if (args[i] === '-n') n = +args[++i];
      i++;
    }
    const cmd = args.slice(i);
    if (!cmd.length) {
      c.err('watch: no command\n');
      return 1;
    }
    const frames = sh.fast || !c.tty ? 1 : 40;
    for (let f = 0; f < frames; f++) {
      if (f && sh.hooks.clear) sh.hooks.clear();
      c.out(`Every ${n.toFixed(1)}s: ${cmd.join(' ')}`.padEnd(40) + `${sh.hostname}: ${U.strftime('%a %b %e %H:%M:%S %Y', new Date())}\n\n`);
      await sh.dispatch(cmd, c.io);
      if (frames > 1) {
        c.out('\n\x1b[2m(watch repeats every ' + n + 's. Press Ctrl+C to stop.)\x1b[0m\n');
        await sh.waitMs(n * 1000);
      }
    }
    return 0;
  });
  def('stress', async (c, args) => {
    c.out('stress: info: [1] dispatching hogs: 2 cpu, 0 io, 0 vm, 0 hdd\n');
    await c.sh.waitMs(Math.min(+(args[args.indexOf('--timeout') + 1] || 1), 5) * 1000);
    c.out('stress: info: [1] successful run completed in ' + (args[args.indexOf('--timeout') + 1] || 1) + 's\n');
  }, { pkg: 'stress' });
  def('tuned-adm', async (c, args) => {
    const sh = c.sh;
    sh.tuned = sh.tuned || 'virtual-guest';
    const sub = args[0];
    if (sub === 'list') return c.out('Available profiles:\n- accelerator-performance     - Throughput performance based tuning with disabled higher latency STOP states\n- balanced                    - General non-specialized tuned profile\n- latency-performance         - Optimize for deterministic performance at the cost of increased power consumption\n- network-latency             - Optimize for deterministic performance at the cost of increased power consumption, focused on low latency network performance\n- powersave                   - Optimize for low power consumption\n- throughput-performance      - Broadly applicable tuning that provides excellent performance across a variety of common server workloads\n- virtual-guest               - Optimize for running inside a virtual guest\nCurrent active profile: ' + sh.tuned + '\n');
    if (sub === 'active') return c.out('Current active profile: ' + sh.tuned + '\n');
    if (sub === 'recommend') return c.out('virtual-guest\n');
    if (sub === 'profile') {
      if (needRoot(c, 'Cannot talk to TuneD daemon via DBus. Is TuneD daemon running?\n')) return 1;
      sh.tuned = args[1];
      return 0;
    }
    c.err('usage: tuned-adm [-h] [--debug] [--asynchronous] [--timeout TIMEOUT] {list,active,off,profile,recommend,verify} ...\n');
    return 2;
  }, { pkg: 'tuned' });

  /* ---------- at ---------- */
  def('at', async (c, args) => {
    const sh = c.sh;
    if (c.args.includes('-l')) return LX.cmds.atq.run(c, []);
    const when = args.filter((a) => !a.startsWith('-')).join(' ');
    if (!when) {
      c.err('Garbled time\n');
      return 1;
    }
    const m = /^now\s*\+\s*(\d+)\s*(minute|min|hour|day)s?$/.exec(when);
    const t = m ? Date.now() + +m[1] * { minute: 60000, min: 60000, hour: 3600000, day: 86400000 }[m[2]] : Date.now() + 3600000;
    const body = await c.slurp();
    c.err('warning: commands will be executed using /bin/sh\n');
    const id = (sh.atJobs.length ? Math.max(...sh.atJobs.map((j) => j.id)) : 0) + 1;
    sh.atJobs.push({ id, t, cmd: body.trim(), user: sh.eu() });
    c.out(`job ${id} at ${U.strftime('%a %b %e %H:%M:%S %Y', new Date(t))}\n`);
  }, { pkg: 'at' });
  def('atq', async (c) => {
    c.sh.atJobs.forEach((j) => c.out(`${j.id}\t${U.strftime('%a %b %e %H:%M:%S %Y', new Date(j.t))} a ${j.user}\n`));
  }, { pkg: 'at' });
  def('atrm', async (c, args) => {
    c.sh.atJobs = c.sh.atJobs.filter((j) => !args.includes(String(j.id)));
  }, { pkg: 'at' });

  /* ---------- bg job classification ---------- */
  LX.bgLong = function (words, src) {
    const w0 = words[0];
    if (w0 === 'sleep' && parseFloat(words[1]) >= 3) return { proc: 'sleep ' + words[1], cpu: 0, memKiB: 0 };
    if (w0 === 'yes') return { proc: 'yes', cpu: 99.7, memKiB: 800 };
    if (w0 === 'stress' || w0 === 'stress-ng') {
      const cpus = +(words[words.indexOf('--cpu') + 1] || 1) || 1;
      const vm = words.includes('--vm') ? 1 : 0;
      return { proc: w0 + ' ' + words.slice(1).join(' '), cpu: cpus * 98, memKiB: vm ? 524288 : 1200 };
    }
    if (w0 === 'dd' && /if=\/dev\/zero/.test(src) && /of=\/dev\/null/.test(src)) return { proc: 'dd', cpu: 82, memKiB: 900 };
    if (w0 === 'cat' && /\/dev\/(zero|urandom)/.test(src)) return { proc: 'cat', cpu: 90, memKiB: 700 };
    if (/^\s*(while|for)\b.*\b(true|:)\b/.test(src) || (/^(sh|bash)$/.test(w0) && /while\s+true/.test(src))) return { proc: 'bash', cpu: 99.5, memKiB: 3000 };
    if (w0 === 'python3' && words.includes('http.server')) return { proc: 'python3 -m http.server ' + (words[words.indexOf('http.server') + 1] || '8000'), cpu: 0.2, memKiB: 14000 };
    if (w0 === 'tail' && words.includes('-f')) return { proc: 'tail -f', cpu: 0, memKiB: 700 };
    if (w0 === 'ping' && !words.includes('-c')) return { proc: 'ping ' + words[words.length - 1], cpu: 0, memKiB: 1200 };
    if (w0 === 'nc' && words.includes('-l')) return { proc: 'nc ' + words.slice(1).join(' '), cpu: 0, memKiB: 800 };
    return null;
  };

  P.onInstall = function (p, pk) {
    if (!pk.service) return;
    const name = pk.service.name || p;
    const unit = `${name}.service`;
    const text = UNITS[unit] || `[Unit]\nDescription=${pk.service.desc}\nAfter=network.target\n\n[Service]\nType=simple\nExecStart=/usr/sbin/${pk.service.proc}\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n`;
    this.fs.put('/usr/lib/systemd/system/' + unit, text, { owner: 'root', group: 'root' });
    const keep = this.services[name] || {};
    const o = this.loadUnit(name);
    o.enabled = true;
    o.active = keep.active !== undefined ? keep.active : false;
    o.pid = keep.pid || o.pid || 900 + Math.floor(Math.random() * 90);
    o.proc = keep.proc || o.proc;
    o.since = keep.since;
    this.fs.mkdirp('/etc/systemd/system/multi-user.target.wants', { owner: 'root', group: 'root' }).kids[unit] = this.fs.mk('l', { target: '/usr/lib/systemd/system/' + unit, owner: 'root', group: 'root', mode: 0o777 });
    if (o.active) this.logEvent('systemd', 6, `Started ${unit} - ${o.desc}.`, { ident: 'systemd', pid: 1 });
  };
  P.onRemove = function (p) {
    const name = (LX.PKGS[p] && LX.PKGS[p].service && LX.PKGS[p].service.name) || p;
    const d = this.fs.lookup('/usr/lib/systemd/system');
    if (d) delete d.kids[name + '.service'];
    const w = this.fs.lookup('/etc/systemd/system/multi-user.target.wants');
    if (w) delete w.kids[name + '.service'];
    delete this.services[name];
  };
  LX.UNITS = UNITS;

  def('uptime', async (c, args) => {
    const sh = c.sh;
    const si = LX.sysinfo(sh);
    const ms = Date.now() - sh.startTime;
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (args.includes('-p')) return c.out(`up ${d} day${d === 1 ? '' : 's'}, ${h} hour${h === 1 ? '' : 's'}, ${m} minute${m === 1 ? '' : 's'}\n`);
    if (args.includes('-s')) return c.out(U.strftime('%F %H:%M:%S', new Date(sh.startTime)) + '\n');
    c.out(` ${U.strftime('%H:%M:%S', new Date())} up ${d} day${d === 1 ? '' : 's'}, ${h}:${String(m).padStart(2, '0')},  1 user,  load average: ${si.load.map((x) => x.toFixed(2)).join(', ')}\n`);
  });
})();
