/* Linux Academy: system extension 1 (users, groups, sudoers, links, ACLs, attributes, SELinux, /proc, journal) */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS, Shell } = LX;
  const U = LX.U;
  const P = Shell.prototype;
  LX.initHooks = LX.initHooks || [];

  /* ---------- inodes ---------- */
  let INO = 131100;
  LX.ino = (n) => n.ino || (n.ino = (INO += 37));

  /* ---------- journal / logs ---------- */
  P.logEvent = function (unit, prio, msg, o) {
    o = o || {};
    const t = Date.now();
    this.journal.push({ t, unit, prio, msg, ident: o.ident || unit, pid: o.pid || 0, boot: this.bootId });
    if (this.journal.length > 2000) this.journal.shift();
    const line = `${U.strftime('%b %e %H:%M:%S', new Date(t))} linux-school ${o.ident || unit}${o.pid ? '[' + o.pid + ']' : ''}: ${msg}\n`;
    const append = (path) => {
      const n = this.fs.lookup(path);
      if (n) n.content = (n.content || '') + line;
    };
    append('/var/log/syslog');
    if (o.auth) append('/var/log/auth.log');
  };

  /* ---------- users / groups ---------- */
  const BASEGID = { root: 0, daemon: 1, adm: 4, sudo: 27, shadow: 42, 'www-data': 33, users: 100 };
  P.gidOf = function (g) {
    if (BASEGID[g] !== undefined) return BASEGID[g];
    if (this.users[g] && g === this.users[g].groups[0]) return this.users[g].gid;
    if (this.extraGroups[g] !== undefined) return this.extraGroups[g];
    return 999;
  };
  P.groupExists = function (g) {
    return BASEGID[g] !== undefined || this.extraGroups[g] !== undefined || (this.users[g] && this.users[g].groups[0] === g);
  };
  P.nextUid = function (system) {
    let u = system ? 998 : 1001;
    const used = new Set([...Object.values(this.users).map((x) => x.uid), ...Object.values(this.users).map((x) => x.gid), ...Object.values(this.extraGroups)]);
    while (used.has(u)) u += system ? -1 : 1;
    return u;
  };
  P.writePasswd = function () {
    const sys = [
      ['root', 0, 0, 'root', '/root', '/bin/bash'],
      ['daemon', 1, 1, 'daemon', '/usr/sbin', '/usr/sbin/nologin'],
      ['bin', 2, 2, 'bin', '/bin', '/usr/sbin/nologin'],
      ['sys', 3, 3, 'sys', '/dev', '/usr/sbin/nologin'],
      ['www-data', 33, 33, 'www-data', '/var/www', '/usr/sbin/nologin'],
      ['nobody', 65534, 65534, 'nobody', '/nonexistent', '/usr/sbin/nologin'],
      ['sshd', 110, 65534, '', '/run/sshd', '/usr/sbin/nologin'],
    ];
    const lines = sys.filter((s) => s[0] !== 'root').map((s) => `${s[0]}:x:${s[1]}:${s[2]}:${s[3]}:${s[4]}:${s[5]}`);
    const out = ['root:x:0:0:root:/root:/bin/bash', ...lines];
    for (const [n, u] of Object.entries(this.users)) if (n !== 'root') out.push(`${n}:x:${u.uid}:${u.gid}:${u.gecos || ''}${u.gecos ? ',,,' : ''}:${u.home}:${u.shell || '/bin/bash'}`);
    const g = ['root:x:0:', 'daemon:x:1:', 'adm:x:4:learner', 'shadow:x:42:', 'www-data:x:33:', 'users:x:100:' + this.membersOf('users').join(',')];
    g.splice(3, 0, 'sudo:x:27:' + this.membersOf('sudo').join(','));
    for (const [n, u] of Object.entries(this.users)) if (n !== 'root') g.push(`${n}:x:${u.gid}:${this.membersOf(n).join(',')}`);
    for (const [n, gid] of Object.entries(this.extraGroups)) g.push(`${n}:x:${gid}:${this.membersOf(n).join(',')}`);
    const days = (ms) => Math.floor(ms / 86400000);
    const sh = [];
    for (const [n, u] of Object.entries(this.users)) {
      const hash = (u.locked ? '!' : '') + (u.hasPass === false ? '*' : '$y$j9T$' + btoa(n + 'salt').replace(/=/g, '') + '$' + (u.pwTag || 'Kq3yXQ'));
      sh.push(`${n}:${hash}:${u.pwdLast !== undefined ? u.pwdLast : days(Date.now() - 3 * 86400000)}:${u.minDays !== undefined ? u.minDays : 0}:${u.maxDays !== undefined ? u.maxDays : 99999}:${u.warnDays !== undefined ? u.warnDays : 7}:${u.inactive !== undefined ? u.inactive : ''}:${u.expire !== undefined ? u.expire : ''}:`);
    }
    const pf = this.fs.lookup('/etc/passwd');
    if (pf) pf.content = out.join('\n') + '\n';
    const gf = this.fs.lookup('/etc/group');
    if (gf) gf.content = g.join('\n') + '\n';
    const sf = this.fs.lookup('/etc/shadow');
    if (sf) sf.content = sh.join('\n') + '\n';
  };
  P.membersOf = function (g) {
    return Object.entries(this.users)
      .filter(([n, u]) => u.groups.includes(g) && u.groups[0] !== g)
      .map(([n]) => n);
  };

  LX.initHooks.push((sh) => {
    sh.extraGroups = {};
    sh.journal = [];
    sh.bootId = 1;
    sh.groupsGidSeed = 1001;
    sh.writePasswd();
  });

  const needRoot = (c, msg) => {
    if (c.sh.eu() === 'root') return false;
    c.err(msg);
    return true;
  };
  const parseOptsLoose = (args, withVal) => {
    const o = {};
    const rest = [];
    const LONG = { '--lock': '-L', '--unlock': '-U', '--expire': '-e', '--system': '-r', '--shell': '-s', '--create-home': '-m', '--comment': '-c', '--home-dir': '-d', '--home': '-d', '--gid': '-g', '--groups': '-G', '--append': '-a', '--uid': '-u', '--delete': '-d', '--remove': '-r', '--maxdays': '-M', '--mindays': '-m', '--warndays': '-W', '--inactive': '-I', '--expiredate': '-E', '--lastday': '-d', '--list': '-l', '--status': '-S', '--force': '-f', '--no-create-home': '-M' };
    args = args.flatMap((a) => {
      const eq = /^(--[\w-]+)=(.*)$/.exec(a);
      const key = eq ? eq[1] : a;
      const m = LONG[key];
      if (m && a.startsWith('--')) return eq ? [m, eq[2]] : [m];
      return [a];
    });
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) {
        const k = a.replace(/^-+/, '');
        if (withVal.includes(a) || withVal.includes(k)) o[k] = args[++i];
        else if (a.startsWith('--')) o[k] = true;
        else {
          for (let q = 0; q < k.length; q++) {
            const ch = k[q];
            if (withVal.includes('-' + ch)) {
              o[ch] = q + 1 < k.length ? k.slice(q + 1) : args[++i];
              break;
            }
            o[ch] = true;
          }
        }
      } else rest.push(a);
    }
    return { o, rest };
  };

  def('groupadd', async (c, args) => {
    if (needRoot(c, 'groupadd: Permission denied.\ngroupadd: cannot lock /etc/group; try again later.\n')) return 10;
    const { o, rest } = parseOptsLoose(args, ['-g']);
    const name = rest[0];
    if (!name) {
      c.err('Usage: groupadd [options] GROUP\n');
      return 2;
    }
    if (c.sh.groupExists(name)) {
      c.err(`groupadd: group '${name}' already exists\n`);
      return 9;
    }
    c.sh.extraGroups[name] = o.g ? +o.g : c.sh.nextUid();
    c.sh.writePasswd();
    c.sh.logEvent('groupadd', 6, `new group: name=${name}, GID=${c.sh.extraGroups[name]}`, { ident: 'groupadd', auth: true });
    return 0;
  });
  def('groupdel', async (c, args) => {
    if (needRoot(c, 'groupdel: Permission denied.\ngroupdel: cannot lock /etc/group; try again later.\n')) return 10;
    const name = args[0];
    if (!c.sh.extraGroups[name]) {
      c.err(`groupdel: group '${name}' does not exist\n`);
      return 6;
    }
    delete c.sh.extraGroups[name];
    for (const u of Object.values(c.sh.users)) u.groups = u.groups.filter((g) => g !== name);
    c.sh.writePasswd();
    return 0;
  });
  def('groupmod', async (c, args) => {
    if (needRoot(c, 'groupmod: Permission denied.\n')) return 10;
    const { o, rest } = parseOptsLoose(args, ['-n', '-g']);
    const g = rest[0];
    if (!c.sh.extraGroups[g]) {
      c.err(`groupmod: group '${g}' does not exist\n`);
      return 6;
    }
    if (o.g) c.sh.extraGroups[g] = +o.g;
    if (o.n) {
      c.sh.extraGroups[o.n] = c.sh.extraGroups[g];
      delete c.sh.extraGroups[g];
      for (const u of Object.values(c.sh.users)) u.groups = u.groups.map((x) => (x === g ? o.n : x));
    }
    c.sh.writePasswd();
    return 0;
  });
  def('gpasswd', async (c, args) => {
    const { o, rest } = parseOptsLoose(args, ['-a', '-d']);
    const sh = c.sh;
    if (needRoot(c, 'gpasswd: Permission denied.\n')) return 1;
    const g = rest[0];
    if (!sh.groupExists(g)) {
      c.err(`gpasswd: group '${g}' does not exist\n`);
      return 3;
    }
    if (o.a) {
      if (!sh.users[o.a]) {
        c.err(`gpasswd: user '${o.a}' does not exist\n`);
        return 3;
      }
      if (!sh.users[o.a].groups.includes(g)) sh.users[o.a].groups.push(g);
      c.out(`Adding user ${o.a} to group ${g}\n`);
    } else if (o.d) {
      sh.users[o.d].groups = sh.users[o.d].groups.filter((x) => x !== g);
      c.out(`Removing user ${o.d} from group ${g}\n`);
    }
    sh.writePasswd();
    return 0;
  });
  const mkUserFull = (sh, name, o) => {
    const uid = o.u ? +o.u : sh.nextUid(!!o.r);
    const primary = o.g && sh.groupExists(o.g) ? o.g : name;
    const groups = [primary];
    if (primary === name) sh.extraGroups[name] === undefined;
    for (const g of (o.G || '').split(',').filter(Boolean)) if (!groups.includes(g)) groups.push(g);
    const home = o.d || '/home/' + name;
    sh.users[name] = { uid, gid: primary === name ? uid : sh.gidOf(primary), home, groups, gecos: o.c || '', shell: o.s || (o.r ? '/usr/sbin/nologin' : '/bin/sh'), hasPass: false, pwdLast: Math.floor(Date.now() / 86400000) };
    if (o.m) {
      sh.fs.mkdirp(home, { owner: name, group: primary, mode: 0o755 });
      const hn = sh.fs.lookup(home);
      for (const f of ['.bashrc', '.profile', '.bash_logout']) hn.kids[f] = sh.fs.mk('f', { owner: name, group: primary, content: f === '.bashrc' ? '# ~/.bashrc\n' : '# ' + f + '\n' });
    }
    sh.writePasswd();
  };
  def('useradd', async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, 'useradd: Permission denied.\nuseradd: cannot lock /etc/passwd; try again later.\n')) return 1;
    const { o, rest } = parseOptsLoose(args, ['-s', '-d', '-g', '-G', '-c', '-u', '-e', '-k', '-p']);
    const name = rest[0];
    if (!name) {
      c.err('Usage: useradd [options] LOGIN\n');
      return 2;
    }
    if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(name)) {
      c.err(`useradd: invalid user name '${name}'\n`);
      return 3;
    }
    if (sh.users[name]) {
      c.err(`useradd: user '${name}' already exists\n`);
      return 9;
    }
    for (const g of (o.G || '').split(',').filter(Boolean)) if (!sh.groupExists(g)) {
      c.err(`useradd: group '${g}' does not exist\n`);
      return 6;
    }
    if (o.g && !sh.groupExists(o.g)) {
      c.err(`useradd: group '${o.g}' does not exist\n`);
      return 6;
    }
    mkUserFull(sh, name, o);
    if (o.e) sh.users[name].expire = Math.floor(new Date(o.e).getTime() / 86400000);
    sh.logEvent('useradd', 6, `new user: name=${name}, UID=${sh.users[name].uid}, GID=${sh.users[name].gid}, home=${sh.users[name].home}, shell=${sh.users[name].shell}`, { ident: 'useradd', auth: true });
    return 0;
  });
  def('adduser', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root') {
      c.err('adduser: Only root may add a user or group to the system.\n');
      return 1;
    }
    const names = args.filter((a) => !a.startsWith('-'));
    const name = names[0];
    if (!name) {
      c.err('adduser: Only one or two names allowed.\n');
      return 1;
    }
    if (names.length === 2 && sh.users[name]) {
      if (!sh.groupExists(names[1])) {
        c.err(`fatal: The group \`${names[1]}' does not exist.\n`);
        return 1;
      }
      if (!sh.users[name].groups.includes(names[1])) sh.users[name].groups.push(names[1]);
      sh.writePasswd();
      c.out(`info: Adding user \`${name}' to group \`${names[1]}' ...\n`);
      return 0;
    }
    if (sh.users[name]) {
      c.err(`fatal: The user \`${name}' already exists.\n`);
      return 1;
    }
    mkUserFull(sh, name, { m: true, s: '/bin/bash', G: 'users' });
    const u = sh.users[name];
    c.out(`info: Adding user \`${name}' ...\ninfo: Selecting UID/GID from range 1000 to 59999 ...\ninfo: Adding new group \`${name}' (${u.gid}) ...\ninfo: Adding new user \`${name}' (${u.uid}) with group \`${name} (${u.gid})' ...\ninfo: Creating home directory \`${u.home}' ...\ninfo: Copying files from \`/etc/skel' ...\n(sandbox: the password questions are skipped)\ninfo: Adding new user \`${name}' to supplemental / extra groups \`users' ...\n`);
    sh.users[name].hasPass = true;
    sh.writePasswd();
    return 0;
  });
  def('userdel', async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, 'userdel: Permission denied.\nuserdel: cannot lock /etc/passwd; try again later.\n')) return 1;
    const { o, rest } = parseOptsLoose(args, []);
    const name = rest[0];
    if (!name || !sh.users[name]) {
      c.err(`userdel: user '${name}' does not exist\n`);
      return 6;
    }
    if (['root', 'learner'].includes(name)) {
      c.err(`userdel: user ${name} is currently used by process 1189\n`);
      return 8;
    }
    if (o.r) {
      const h = sh.fs.lookup(VFS.dirname(sh.users[name].home));
      if (h) delete h.kids[VFS.base(sh.users[name].home)];
    }
    delete sh.users[name];
    sh.writePasswd();
    sh.logEvent('userdel', 6, `delete user '${name}'`, { ident: 'userdel', auth: true });
    return 0;
  });
  def('usermod', async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, 'usermod: Permission denied.\nusermod: cannot lock /etc/passwd; try again later.\n')) return 1;
    const { o, rest } = parseOptsLoose(args, ['-s', '-d', '-g', '-G', '-c', '-l', '-e', '-u']);
    const name = rest[rest.length - 1];
    const u = sh.users[name];
    if (!u) {
      c.err(`usermod: user '${name}' does not exist\n`);
      return 6;
    }
    const append = !!o.a;
    if (o.G !== undefined) {
      const gs = o.G.split(',').filter(Boolean);
      for (const g of gs) if (!sh.groupExists(g)) {
        c.err(`usermod: group '${g}' does not exist\n`);
        return 6;
      }
      u.groups = append ? [...new Set([...u.groups, ...gs])] : [u.groups[0], ...gs.filter((g) => g !== u.groups[0])];
    }
    if (o.s) u.shell = o.s;
    if (o.c) u.gecos = o.c;
    if (o.d) {
      u.home = o.d;
      if (o.m) {
        sh.fs.mkdirp(o.d, { owner: name, group: u.groups[0] });
      }
    }
    if (o.L) u.locked = true;
    if (o.U) u.locked = false;
    if (o.e) u.expire = o.e === '' ? undefined : Math.floor(new Date(o.e).getTime() / 86400000);
    if (o.g) u.gid = sh.gidOf(o.g), (u.groups[0] = o.g);
    if (o.l) {
      sh.users[o.l] = u;
      delete sh.users[name];
    }
    sh.writePasswd();
    return 0;
  });
  def('passwd', async (c, args) => {
    const sh = c.sh;
    const { o, rest } = parseOptsLoose(args, []);
    const who = rest[0] || sh.eu();
    const u = sh.users[who];
    if (!u) {
      c.err(`passwd: user '${who}' does not exist\n`);
      return 1;
    }
    if (who !== sh.eu() && sh.eu() !== 'root') {
      c.err(`passwd: You may not view or modify password information for ${who}.\n`);
      return 1;
    }
    if (o.S) {
      c.out(`${who} ${u.locked ? 'L' : u.hasPass === false ? 'NP' : 'P'} ${U.strftime('%m/%d/%Y', new Date(Math.max(0, (u.pwdLast || 20000)) * 86400000))} ${u.minDays || 0} ${u.maxDays !== undefined ? u.maxDays : 99999} ${u.warnDays !== undefined ? u.warnDays : 7} ${u.inactive !== undefined ? u.inactive : -1}\n`);
      return 0;
    }
    if (sh.eu() !== 'root' && (o.l || o.u || o.d || o.e)) {
      c.err('passwd: Permission denied.\n');
      return 1;
    }
    if (o.l) {
      u.locked = true;
      sh.writePasswd();
      c.out(`passwd: password expiry information changed.\n`);
      return 0;
    }
    if (o.u) {
      u.locked = false;
      sh.writePasswd();
      c.out('passwd: password expiry information changed.\n');
      return 0;
    }
    if (o.d) {
      u.hasPass = false;
      sh.writePasswd();
      c.out('passwd: password expiry information changed.\n');
      return 0;
    }
    if (o.e) {
      u.pwdLast = 0;
      sh.writePasswd();
      c.out(`passwd: password expiry information changed.\n`);
      return 0;
    }
    if (!sh.hooks.readLine) {
      c.out(`passwd: password updated successfully\n`);
      u.hasPass = true;
      return 0;
    }
    c.out(`Changing password for ${who}.\n`);
    if (sh.eu() !== 'root') {
      const cur = await sh.hooks.readLine('Current password: ', { secret: true });
      sh.checkAbort();
      if (cur === null) return 1;
    }
    const a = await sh.hooks.readLine(sh.eu() === 'root' ? `New password: ` : 'New password: ', { secret: true });
    sh.checkAbort();
    const b = await sh.hooks.readLine('Retype new password: ', { secret: true });
    sh.checkAbort();
    if (a !== b) {
      c.err('Sorry, passwords do not match.\npasswd: Authentication token manipulation error\npasswd: password unchanged\n');
      return 10;
    }
    if (a && a.length < 6 && sh.eu() !== 'root') c.out('BAD PASSWORD: The password is shorter than 8 characters (sandbox accepts it anyway)\n');
    u.hasPass = true;
    u.pwdLast = Math.floor(Date.now() / 86400000);
    { let h1 = 5381; let h2 = 52711; for (const ch of String(a)) { h1 = ((h1 << 5) + h1 + ch.charCodeAt(0)) >>> 0; h2 = ((h2 * 33) ^ ch.charCodeAt(0)) >>> 0; } u.pwTag = (h1.toString(36) + h2.toString(36) + 'Kq3yXQ').slice(0, 22); }
    sh.writePasswd();
    c.out('passwd: password updated successfully\n');
    sh.logEvent('passwd', 6, `pam_unix(passwd:chauthtok): password changed for ${who}`, { ident: 'passwd', auth: true });
    return 0;
  });
  def('chage', async (c, args) => {
    const sh = c.sh;
    const { o, rest } = parseOptsLoose(args, ['-M', '-m', '-W', '-E', '-I', '-d']);
    const who = rest[0];
    const u = sh.users[who];
    if (!u) {
      c.err(`chage: user '${who}' does not exist\n`);
      return 1;
    }
    if (o.l) {
      if (sh.eu() !== 'root' && who !== sh.eu()) {
        c.err(`chage: Permission denied\n`);
        return 1;
      }
      const last = (u.pwdLast || 20000) * 86400000;
      const fmt = (ms) => U.strftime('%b %d, %Y', new Date(ms));
      const max = u.maxDays !== undefined ? u.maxDays : 99999;
      c.out(`Last password change\t\t\t\t\t: ${fmt(last)}\nPassword expires\t\t\t\t\t: ${max >= 99999 ? 'never' : fmt(last + max * 86400000)}\nPassword inactive\t\t\t\t\t: ${u.inactive !== undefined ? u.inactive + ' days' : 'never'}\nAccount expires\t\t\t\t\t\t: ${u.expire !== undefined ? fmt(u.expire * 86400000) : 'never'}\nMinimum number of days between password change\t\t: ${u.minDays || 0}\nMaximum number of days between password change\t\t: ${max}\nNumber of days of warning before password expires\t: ${u.warnDays !== undefined ? u.warnDays : 7}\n`);
      return 0;
    }
    if (sh.eu() !== 'root') {
      c.err('chage: Permission denied\n');
      return 1;
    }
    if (o.M !== undefined) u.maxDays = +o.M;
    if (o.m !== undefined) u.minDays = +o.m;
    if (o.W !== undefined) u.warnDays = +o.W;
    if (o.I !== undefined) u.inactive = +o.I;
    if (o.E !== undefined) u.expire = o.E === '-1' ? undefined : Math.floor(new Date(o.E).getTime() / 86400000);
    if (o.d !== undefined) u.pwdLast = o.d === '0' ? 0 : Math.floor(new Date(o.d).getTime() / 86400000);
    sh.writePasswd();
    return 0;
  });
  def('id', async (c, args) => {
    const sh = c.sh;
    const name = args.find((a) => !a.startsWith('-')) || sh.eu();
    const u = sh.users[name];
    if (!u) {
      c.err(`id: ‘${name}’: no such user\n`);
      return 1;
    }
    if (args.includes('-u')) return c.out((args.includes('-n') ? name : u.uid) + '\n');
    if (args.includes('-un')) return c.out(name + '\n');
    if (args.includes('-g')) return c.out((args.includes('-n') ? u.groups[0] : u.gid) + '\n');
    if (args.includes('-gn')) return c.out(u.groups[0] + '\n');
    if (args.includes('-Gn') || (args.includes('-G') && args.includes('-n'))) return c.out(u.groups.join(' ') + '\n');
    if (args.includes('-G')) return c.out(u.groups.map((g) => sh.gidOf(g)).join(' ') + '\n');
    if (args.includes('-Z')) return c.out('unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023\n');
    c.out(`uid=${u.uid}(${name}) gid=${u.gid}(${u.groups[0]}) groups=${u.groups.map((g) => `${sh.gidOf(g)}(${g})`).join(',')}\n`);
  });
  def('groups', async (c, args) => {
    const name = args[0] || c.sh.eu();
    const u = c.sh.users[name];
    if (!u) {
      c.err(`groups: ‘${name}’: no such user\n`);
      return 1;
    }
    c.out((args[0] ? name + ' : ' : '') + u.groups.join(' ') + '\n');
  });
  def('newgrp', async (c, args) => {
    const g = args[0];
    if (!g || !c.sh.users[c.sh.eu()].groups.includes(g)) {
      c.err(`newgrp: failed to crypt password with previous salt: Invalid argument\n`);
      return 1;
    }
    c.out(`\x1b[2m(newgrp would start a shell with ${g} as the active group)\x1b[0m\n`);
  });
  def('getent', async (c, args) => {
    const [db, key] = args;
    const sh = c.sh;
    const file = { passwd: '/etc/passwd', group: '/etc/group', shadow: '/etc/shadow', hosts: '/etc/hosts' }[db];
    if (!file) {
      c.err(`Unknown database: ${db}\n`);
      return 1;
    }
    if (db === 'hosts') {
      const h = sh.resolveHost ? sh.resolveHost(key) : null;
      if (key && h) c.out(`${h.padEnd(15)} ${key}\n`);
      return key && !h ? 2 : 0;
    }
    if (db === 'shadow' && sh.eu() !== 'root') return 2;
    const lines = U.lines(sh.fs.lookup(file).content || '');
    const sel = key ? lines.filter((l) => l.split(':')[0] === key || l.split(':')[2] === key) : lines;
    sel.forEach((l) => c.out(l + '\n'));
    return sel.length || !key ? 0 : 2;
  });
  def('last', async (c, args) => {
    const sh = c.sh;
    const nI = args.indexOf('-n');
    const n = args.find((a) => /^-\d+$/.test(a)) || (nI >= 0 && /^\d+$/.test(args[nI + 1] || '') ? '-' + args[nI + 1] : null);
    const rows = [
      `${sh.user.padEnd(9)}pts/0        192.168.1.5      ${U.strftime('%a %b %e %H:%M', new Date(Date.now() - 3600000))}   still logged in`,
      `${sh.user.padEnd(9)}pts/0        192.168.1.5      ${U.strftime('%a %b %e %H:%M', new Date(Date.now() - 90000000))} - ${U.strftime('%H:%M', new Date(Date.now() - 86000000))}  (00:23)`,
      `reboot   system boot  6.8.0-45-generic ${U.strftime('%a %b %e %H:%M', new Date(sh.startTime))}   still running`,
      '',
      `wtmp begins ${U.strftime('%a %b %e %H:%M:%S %Y', new Date(Date.now() - 20 * 86400000))}`,
    ];
    c.out((n ? rows.slice(0, +n.slice(1)) : rows).join('\n') + '\n');
  });
  def('lastb', async (c) => {
    if (needRoot(c, 'lastb: cannot open /var/log/btmp: Permission denied\n')) return 1;
    c.out('root     ssh:notty    203.0.113.77     ' + U.strftime('%a %b %e %H:%M', new Date(Date.now() - 7200000)) + ' - ' + U.strftime('%H:%M', new Date(Date.now() - 7190000)) + '  (00:00)\n\nbtmp begins ' + U.strftime('%a %b %e %H:%M:%S %Y', new Date(Date.now() - 86400000)) + '\n');
  });
  def('lastlog', async (c) => {
    c.out('Username         Port     From             Latest\n');
    for (const n of Object.keys(c.sh.users)) c.out(`${n.padEnd(16)} ${n === c.sh.user ? 'pts/0    192.168.1.5      ' + U.strftime('%a %b %e %H:%M:%S %z %Y', new Date()) : '                                 **Never logged in**'}\n`);
  });
  def('w', async (c) => {
    c.out(` ${U.strftime('%H:%M:%S', new Date())} up 3 days,  2:11,  1 user,  load average: 0.08, 0.03, 0.01\nUSER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT\n${c.sh.user.padEnd(8)} pts/0    192.168.1.5      ${U.strftime('%H:%M', new Date(Date.now() - 3600000))}    0.00s  0.05s  0.00s w\n`);
  });

  /* ---------- sudoers ---------- */
  const SUDOERS_DEFAULT = '# This file MUST be edited with the \'visudo\' command as root.\nDefaults\tenv_reset\nDefaults\tmail_badpass\nDefaults\tsecure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\n\n# User privilege specification\nroot\tALL=(ALL:ALL) ALL\n\n# Members of the admin group may gain root privileges\n%admin ALL=(ALL) ALL\n\n# Allow members of group sudo to execute any command\n%sudo\tALL=(ALL:ALL) ALL\n\n@includedir /etc/sudoers.d\n';
  LX.parseSudoers = function (sh) {
    const rules = [];
    const read = (p) => {
      const n = sh.fs.lookup(p);
      return n && n.t === 'f' ? n.content || '' : '';
    };
    let text = read('/etc/sudoers');
    const dir = sh.fs.lookup('/etc/sudoers.d');
    if (dir && dir.kids) for (const k of Object.keys(dir.kids).sort()) if (!k.includes('.') && dir.kids[k].t === 'f') text += '\n' + dir.kids[k].content;
    for (const raw of text.split('\n')) {
      const l = raw.trim();
      if (!l || l.startsWith('#') || /^(Defaults|@include|Cmnd_Alias|User_Alias|Host_Alias)/.test(l)) continue;
      const m = /^(%?[A-Za-z0-9_.-]+)\s+(\S+?)\s*=\s*(?:\(([^)]*)\)\s*)?(.*)$/.exec(l);
      if (!m) continue;
      let cmds = m[4].trim();
      let nopass = false;
      cmds = cmds.replace(/NOPASSWD:\s*/g, () => ((nopass = true), '')).replace(/PASSWD:\s*/g, '');
      rules.push({ who: m[1], host: m[2], runas: m[3] || 'ALL', cmds: cmds.split(',').map((x) => x.trim()), nopass });
    }
    return rules;
  };
  LX.sudoRulesFor = (sh, user) => {
    const u = sh.users[user];
    if (!u) return [];
    return LX.parseSudoers(sh).filter((r) => r.who === user || (r.who.startsWith('%') && u.groups.includes(r.who.slice(1))));
  };
  LX.sudoOk = function (sh, argv) {
    if (sh.user === 'root') return true;
    const rules = LX.sudoRulesFor(sh, sh.user);
    if (!rules.length) return false;
    if (!argv || !argv.length) return true;
    const first = argv[0];
    return rules.some((r) => r.cmds.some((cm) => {
      if (cm === 'ALL') return true;
      const parts = cm.split(/\s+/);
      const bin = parts[0];
      if (!(bin === first || bin === '/usr/bin/' + first || bin === '/usr/sbin/' + first || bin === '/bin/' + first || VFS.base(bin) === first)) return false;
      if (parts.length === 1) return true; // no arguments given in the rule: any arguments are fine
      const want = parts.slice(1).join(' ').replace(/^"|"$/g, '');
      if (want === '') return argv.length === 1;
      return LX.globToRegex(want).test(argv.slice(1).join(' '));
    }));
  };
  LX.sudoNoPass = (sh) => LX.sudoRulesFor(sh, sh.user).some((r) => r.nopass);
  LX.sudoList = function (c, who) {
    const sh = c.sh;
    who = who || sh.user;
    const rules = LX.sudoRulesFor(sh, who);
    c.out(`Matching Defaults entries for ${sh.user} on linux-school:\n    env_reset, mail_badpass,\n    secure_path=/usr/local/sbin\\:/usr/local/bin\\:/usr/sbin\\:/usr/bin\\:/sbin\\:/bin\n\n`);
    if (!rules.length) c.out(`User ${who} is not allowed to run sudo on linux-school.\n`);
    else {
      c.out(`User ${who} may run the following commands on linux-school:\n`);
      for (const r of rules) c.out(`    (${r.runas}) ${r.nopass ? 'NOPASSWD: ' : ''}${r.cmds.join(', ')}\n`);
    }
  };
  def('visudo', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root') {
      c.err('visudo: /etc/sudoers: Permission denied\n');
      return 1;
    }
    const fi = args.findIndex((a) => a === '-f' || a === '-cf' || a === '-fc' || a === '--file');
    const f = fi >= 0 ? sh.abs(args[fi + 1]) : '/etc/sudoers';
    if (args.includes('-c') || args.includes('-cf') || args.includes('-fc') || args.includes('--check')) {
      const one = (file, text) => {
        const bad = checkSudoers(text);
        c.out(bad ? `>>> ${file}: syntax error near line ${bad} <<<\nparse error in ${file} near line ${bad}\n` : `${file}: parsed OK\n`);
        return bad ? 1 : 0;
      };
      if (fi >= 0) {
        const fn = sh.fs.lookup(f);
        if (!fn) { c.err(`visudo: unable to open ${f}: No such file or directory\n`); return 1; }
        return one(f, fn.content || '');
      }
      let st = 0;
      for (const x of LX.sudoersFiles(sh)) st = one(x.file, sh.readFile(x.file)) || st;
      return st;
    }
    const n = sh.fs.lookup(f);
    const content = n ? n.content : '';
    if (!sh.hooks.edit) {
      c.err('visudo: needs the browser editor\n');
      return 1;
    }
    let res = await sh.hooks.edit({ name: 'nano', path: f, content, readonly: false });
    while (res !== null && res !== undefined) {
      const bad = checkSudoers(res);
      if (!bad) break;
      c.out(`>>> ${f}: syntax error near line ${bad} <<<\nWhat now? (visudo would ask: e = edit again, x = exit without saving, Q = save anyway)\n`);
      res = await sh.hooks.edit({ name: 'nano', path: f, content: res, readonly: false });
    }
    if (res !== null && res !== undefined) {
      if (n) {
        n.content = res;
        n.mtime = Date.now();
      } else sh.fs.put(f, res, { owner: 'root', group: 'root', mode: 0o440 });
      c.out(`\x1b[2m${f}: parsed OK\x1b[0m\n`);
    }
    return 0;
  });
  function checkSudoers(text) {
    const lines = text.replace(/\\\n/g, ' ').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l || (l.startsWith('#') && !/^#\s*(include|includedir)\b/.test(l) ) || /^(#|@)(include|includedir)\b/.test(l) || /^(Defaults)\b/.test(l)) continue;
      if (/^(Cmnd_Alias|User_Alias|Host_Alias|Runas_Alias)\s+[A-Z][A-Z0-9_]*\s*=\s*\S/.test(l)) continue;
      const m = /^(!?[%+]?[\w.#-]+|ALL)\s+([\w.,!*-]+)\s*=\s*(\([^)]*\)\s*)?(.+)$/.exec(l);
      if (!m) return i + 1;
      const cmds = m[4].split(/,(?![^"]*")/).map((x) => x.trim().replace(/^((NOPASSWD|PASSWD|SETENV|NOSETENV|NOEXEC|EXEC|LOG_INPUT|LOG_OUTPUT):\s*)+/, ''));
      for (const cm of cmds) if (!/^(!?\/\S*(\s.*)?|ALL|!ALL|sudoedit(\s.*)?|[A-Z][A-Z0-9_]*)$/.test(cm)) return i + 1;
    }
    return 0;
  }
  /** every sudoers file that sudo reads, with its first syntax error (0 = fine) */
  LX.sudoersFiles = function (sh) {
    const files = [];
    const main = sh.fs.lookup('/etc/sudoers');
    if (main && main.t === 'f') files.push(['/etc/sudoers', main.content || '']);
    const dir = sh.fs.lookup('/etc/sudoers.d');
    if (dir && dir.kids) for (const k of Object.keys(dir.kids).sort()) if (!k.includes('.') && !k.endsWith('~') && dir.kids[k].t === 'f') files.push(['/etc/sudoers.d/' + k, dir.kids[k].content || '']);
    return files.map(([f, t]) => ({ file: f, bad: checkSudoers(t) }));
  };
  LX.sudoersProblems = (sh) => LX.sudoersFiles(sh).filter((x) => x.bad);
  LX.initHooks.push((sh) => {
    sh.fs.put('/etc/sudoers', SUDOERS_DEFAULT, { owner: 'root', group: 'root', mode: 0o440 });
    sh.fs.mkdirp('/etc/sudoers.d', { owner: 'root', group: 'root', mode: 0o750 });
    sh.fs.put('/etc/sudoers.d/README', '# sudoers.d: drop-in files go here. Edit them with: sudo visudo -f /etc/sudoers.d/NAME\n', { owner: 'root', group: 'root', mode: 0o440 });
    sh.fs.put('/etc/login.defs', 'MAIL_DIR\t/var/mail\nPASS_MAX_DAYS\t99999\nPASS_MIN_DAYS\t0\nPASS_WARN_AGE\t7\nUID_MIN\t1000\nUID_MAX\t60000\nUMASK\t022\nENCRYPT_METHOD\tYESCRYPT\n', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/etc/skel', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/skel/.bashrc', '# ~/.bashrc: executed by bash for non-login shells.\n', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/skel/.profile', '# ~/.profile\n', { owner: 'root', group: 'root' });
  });

  /* ---------- links ---------- */
  def('ln', async (c, args) => {
    const g = U.getopts('ln', c, args, 'sfvn', '', { symbolic: 's', force: 'f' });
    if (!g) return 1;
    const { o, rest } = g;
    const sh = c.sh;
    if (rest.length < 1 || (rest.length < 2 && !o.s)) {
      c.err(rest.length ? `ln: missing destination file operand after '${rest[0]}'\nTry 'ln --help' for more information.\n` : "ln: missing file operand\nTry 'ln --help' for more information.\n");
      return 1;
    }
    const target = rest[0];
    const link = rest[1] || VFS.base(target);
    let lAbs = c.abs(link);
    const ld = sh.fs.lookup(lAbs);
    if (ld && ld.t === 'd') lAbs += '/' + VFS.base(target);
    if (sh.fs.lookup(lAbs, false)) {
      if (!o.f) {
        c.err(`ln: failed to create ${o.s ? 'symbolic' : 'hard'} link '${link}': File exists\n`);
        return 1;
      }
      try {
        sh.unlink(lAbs);
      } catch (e) {}
    }
    try {
      const pd = sh.parentFor(lAbs, 2);
      if (o.s) pd.kids[VFS.base(lAbs)] = sh.fs.mk('l', { target, owner: sh.eu(), group: sh.users[sh.eu()].groups[0], mode: 0o777 });
      else {
        const tn = sh.fs.lookup(c.abs(target));
        if (!tn) {
          c.err(`ln: failed to access '${target}': No such file or directory\n`);
          return 1;
        }
        if (tn.t === 'd') {
          c.err(`ln: ${target}: hard link not allowed for directory\n`);
          return 1;
        }
        tn.nlink = (tn.nlink || 1) + 1;
        LX.ino(tn);
        pd.kids[VFS.base(lAbs)] = tn;
      }
    } catch (e) {
      if (!(e instanceof FsErr)) throw e;
      c.err(`ln: failed to create link '${link}': ${U.errTxt(e)}\n`);
      return 1;
    }
    if (o.v) c.out(`'${link}' ${o.s ? '->' : '=>'} '${target}'\n`);
    return 0;
  });
  def('readlink', async (c, args) => {
    const f = args.includes('-f');
    const rest = args.filter((a) => !a.startsWith('-'));
    let st = 0;
    for (const p of rest) {
      const n = c.sh.fs.lookup(c.abs(p), false);
      if (f) {
        c.out(realPath(c.sh, c.abs(p)) + '\n');
      } else if (n && n.t === 'l') c.out(n.target + '\n');
      else st = 1;
    }
    return st;
  });
  function realPath(sh, abs, depth) {
    depth = depth || 0;
    const parts = abs.split('/').filter(Boolean);
    let cur = '';
    for (let i = 0; i < parts.length; i++) {
      cur += '/' + parts[i];
      const n = sh.fs.lookup(cur, false);
      if (n && n.t === 'l' && depth < 10) return realPath(sh, VFS.norm(n.target, VFS.dirname(cur)) + (i < parts.length - 1 ? '/' + parts.slice(i + 1).join('/') : ''), depth + 1);
    }
    return cur || '/';
  }
  def('namei', async (c, args) => {
    const p = args.find((a) => !a.startsWith('-'));
    c.out(`f: ${p}\n`);
    const parts = c.abs(p).split('/').filter(Boolean);
    let cur = '';
    c.out(' d /\n');
    for (const part of parts) {
      cur += '/' + part;
      const n = c.sh.fs.lookup(cur, false);
      c.out(` ${n ? U.permStr(n) : '??????????'} ${n ? n.owner.padEnd(8) + n.group.padEnd(8) : ''}${part}${n && n.t === 'l' ? ' -> ' + n.target : ''}\n`);
    }
  });

  /* ---------- ACLs ---------- */
  const permStr3 = (p) => (p & 4 ? 'r' : '-') + (p & 2 ? 'w' : '-') + (p & 1 ? 'x' : '-');
  const parsePerm = (s) => ((s.includes('r') ? 4 : 0) | (s.includes('w') ? 2 : 0) | (s.includes('x') ? 1 : 0)) || (/^[0-7]$/.test(s) ? +s : 0);
  def('setfacl', async (c, args) => {
    const sh = c.sh;
    const { o, rest } = parseOptsLoose(args, ['-m', '-x', '-M']);
    let st = 0;
    for (const f of rest) {
      const abs = c.abs(f);
      const n = sh.fs.lookup(abs);
      if (!n) {
        c.err(`setfacl: ${f}: No such file or directory\n`);
        st = 1;
        continue;
      }
      if (sh.eu() !== 'root' && n.owner !== sh.eu()) {
        c.err(`setfacl: ${f}: Operation not permitted\n`);
        st = 1;
        continue;
      }
      const apply = (node) => {
        if (o.b) {
          delete node.acl;
          delete node.aclMask;
        }
        if (o.m) {
          node.acl = node.acl || [];
          for (const ent of o.m.split(',')) {
            const m = /^(d:)?(u|g|m|o|user|group|mask|other):([^:]*):?(.*)$/.exec(ent);
            if (!m) {
              c.err(`setfacl: Option -m: Invalid argument near character 1\n`);
              st = 1;
              continue;
            }
            const t = m[2][0];
            let perm = m[4] !== '' ? m[4] : m[3];
            let name = m[4] !== '' ? m[3] : '';
            if (t === 'm') {
              node.aclMask = parsePerm(perm);
              continue;
            }
            if (t === 'u' && !name) {
              node.mode = (node.mode & ~0o700) | (parsePerm(perm) << 6);
              continue;
            }
            if (t === 'g' && !name) {
              node.mode = (node.mode & ~0o070) | (parsePerm(perm) << 3);
              continue;
            }
            if (t === 'o') {
              node.mode = (node.mode & ~0o007) | parsePerm(perm);
              continue;
            }
            if (m[1]) {
              node.defAcl = node.defAcl || [];
              node.defAcl = node.defAcl.filter((e) => !(e.t === t && e.n === name));
              node.defAcl.push({ t, n: name, p: parsePerm(perm) });
              continue;
            }
            if (t === 'u' && !sh.users[name]) {
              c.err(`setfacl: Option -m: Invalid argument near character ${ent.indexOf(name) + 1}\n`);
              st = 1;
              continue;
            }
            node.acl = node.acl.filter((e) => !(e.t === t && e.n === name));
            node.acl.push({ t, n: name, p: parsePerm(perm) });
          }
        }
        if (o.x) {
          node.acl = (node.acl || []).filter((e) => !o.x.split(',').some((x) => x === `${e.t}:${e.n}` || x === `${e.t === 'u' ? 'user' : 'group'}:${e.n}`));
        }
        if (node.acl && !node.acl.length) delete node.acl;
        node.mtime = node.mtime;
      };
      apply(n);
      if (o.R) sh.fs.walk(abs, (p, nd) => p !== abs && apply(nd));
    }
    return st;
  });
  def('getfacl', async (c, args) => {
    const sh = c.sh;
    let st = 0;
    for (const f of args.filter((a) => !a.startsWith('-'))) {
      const n = sh.fs.lookup(c.abs(f));
      if (!n) {
        c.err(`getfacl: ${f}: No such file or directory\n`);
        st = 1;
        continue;
      }
      c.out(`# file: ${f.replace(/^\//, '')}\n# owner: ${n.owner}\n# group: ${n.group}\n`);
      if (n.mode & 0o7000) c.out(`# flags: ${n.mode & 0o4000 ? 's' : '-'}${n.mode & 0o2000 ? 's' : '-'}${n.mode & 0o1000 ? 't' : '-'}\n`);
      c.out(`user::${permStr3((n.mode >> 6) & 7)}\n`);
      const mk = n.acl ? LX.VFS.aclMaskOf(n) : 7;
      const eff = (p) => (n.acl && (p & ~mk) ? '\t\t#effective:' + permStr3(p & mk) : '');
      for (const e of (n.acl || []).filter((e) => e.t === 'u')) c.out(`user:${e.n}:${permStr3(e.p)}${eff(e.p)}\n`);
      c.out(`group::${permStr3((n.mode >> 3) & 7)}${eff((n.mode >> 3) & 7)}\n`);
      for (const e of (n.acl || []).filter((e) => e.t === 'g')) c.out(`group:${e.n}:${permStr3(e.p)}${eff(e.p)}\n`);
      if (n.acl) c.out(`mask::${permStr3(mk)}\n`);
      c.out(`other::${permStr3(n.mode & 7)}\n`);
      for (const e of n.defAcl || []) c.out(`default:${e.t === 'u' ? 'user' : 'group'}:${e.n}:${permStr3(e.p)}\n`);
      c.out('\n');
    }
    return st;
  });

  /* ---------- attributes ---------- */
  def('chattr', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root') {
      c.err(`chattr: Operation not permitted while setting flags on ${args[args.length - 1]}\n`);
      return 1;
    }
    const mode = args.find((a) => /^[-+=][aAcCdDeijsStTu]+$/.test(a));
    const files = args.filter((a) => a !== mode && !a.startsWith('-') || (a !== mode && /^-R$/.test(a) && false));
    if (!mode) {
      c.err('Usage: chattr [-pRVf] [-+=aAcCdDeijAlTsSu] [-v version] files...\n');
      return 1;
    }
    for (const f of files.filter((x) => x !== '-R')) {
      const n = sh.fs.lookup(c.abs(f));
      if (!n) {
        c.err(`chattr: No such file or directory while trying to stat ${f}\n`);
        continue;
      }
      let a = n.attrs || '';
      const flags = mode.slice(1);
      if (mode[0] === '+') for (const ch of flags) if (!a.includes(ch)) a += ch;
      else if (mode[0] === '-') for (const ch of flags) a = a.replace(ch, '');
      else a = flags;
      n.attrs = a;
    }
    return 0;
  });
  def('lsattr', async (c, args) => {
    const targets = args.filter((a) => !a.startsWith('-'));
    const fmt = (a) => ['s', 'u', 'S', 'D', 'i', 'a', 'A', 'd'].map((ch) => (a.includes(ch) ? ch : '-')).join('') + '-------------'.slice(0, 5);
    for (const f of targets.length ? targets : ['.']) {
      const n = c.sh.fs.lookup(c.abs(f));
      if (!n) {
        c.err(`lsattr: No such file or directory while trying to stat ${f}\n`);
        continue;
      }
      if (n.t === 'd' && !args.includes('-d')) {
        for (const [name, node] of Object.entries(n.kids).sort()) {
          if (name.startsWith('.') && !args.includes('-a')) continue;
          c.out(`${fmt(node.attrs || '')} ${f === '.' ? './' + name : f.replace(/\/$/, '') + '/' + name}\n`);
        }
      } else c.out(`${fmt(n.attrs || '')} ${f}\n`);
    }
  });

  /* ---------- SELinux (simulated, RHEL style) ---------- */
  LX.initHooks.push((sh) => {
    sh.selinux = { mode: 'permissive', configMode: 'permissive', bools: { httpd_enable_homedirs: false, httpd_can_network_connect: false, httpd_can_sendmail: false, ftpd_anon_write: false, samba_enable_home_dirs: false, allow_ssh_pam: true }, ports: { http_port_t: [80, 81, 443, 8008, 8009, 8080, 8443, 9000], ssh_port_t: [22], mysqld_port_t: [3306], postgresql_port_t: [5432] }, fcontexts: [], denials: [] };
    sh.fs.mkdirp('/etc/selinux', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/selinux/config', '# This file controls the state of SELinux on the system.\n# SELINUX= can take one of these three values:\n#     enforcing - SELinux security policy is enforced.\n#     permissive - SELinux prints warnings instead of enforcing.\n#     disabled - No SELinux policy is loaded.\nSELINUX=permissive\nSELINUXTYPE=targeted\n', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/var/log/audit', { owner: 'root', group: 'root', mode: 0o700 });
    sh.fs.put('/var/log/audit/audit.log', '', { owner: 'root', group: 'root', mode: 0o600 });
  });
  LX.ctxOf = function (sh, node, abs) {
    if (node.ctx) return node.ctx;
    for (const fc of sh.selinux.fcontexts) if (new RegExp('^' + fc.re.replace(/\(\/\.\*\)\?/g, '(/.*)?') + '$').test(abs)) return `system_u:object_r:${fc.type}:s0`;
    const rules = [[/^\/var\/www(\/|$)/, 'httpd_sys_content_t'], [/^\/home\/[^/]+(\/|$)/, 'user_home_t'], [/^\/home$/, 'home_root_t'], [/^\/etc(\/|$)/, 'etc_t'], [/^\/tmp(\/|$)/, 'tmp_t'], [/^\/var\/log(\/|$)/, 'var_log_t'], [/^\/(usr\/)?s?bin(\/|$)/, 'bin_t'], [/^\/root(\/|$)/, 'admin_home_t'], [/^\/dev(\/|$)/, 'device_t'], [/^\/proc(\/|$)/, 'proc_t'], [/^\/var\/lib(\/|$)/, 'var_lib_t'], [/^\/srv(\/|$)/, 'var_t'], [/^\/boot(\/|$)/, 'boot_t'], [/^\/$/, 'root_t']];
    for (const [re, t] of rules) if (re.test(abs)) return `${abs.startsWith('/home/') ? 'unconfined_u' : 'system_u'}:object_r:${t}:s0`;
    return 'system_u:object_r:default_t:s0';
  };
  const needSe = (c) => c.sh.selinux;
  def('getenforce', async (c) => c.out(({ enforcing: 'Enforcing', permissive: 'Permissive', disabled: 'Disabled' })[c.sh.selinux.mode] + '\n'));
  def('setenforce', async (c, args) => {
    if (needRoot(c, 'setenforce: SELinux is disabled\n'.replace('SELinux is disabled', 'you must be root to change the mode'))) return 1;
    const v = (args[0] || '').toLowerCase();
    if (['1', 'enforcing'].includes(v)) c.sh.selinux.mode = 'enforcing';
    else if (['0', 'permissive'].includes(v)) c.sh.selinux.mode = 'permissive';
    else {
      c.err('usage:  setenforce [ Enforcing | Permissive | 1 | 0 ]\n');
      return 1;
    }
    c.sh.logEvent('kernel', 5, `SELinux:  enforcing mode set to ${c.sh.selinux.mode}`, { ident: 'audit' });
    return 0;
  });
  def('sestatus', async (c) => {
    const s = c.sh.selinux;
    c.out(`SELinux status:                 enabled\nSELinuxfs mount:                /sys/fs/selinux\nSELinux root directory:         /etc/selinux\nLoaded policy name:             targeted\nCurrent mode:                   ${s.mode}\nMode from config file:          ${s.configMode}\nPolicy MLS status:              enabled\nPolicy deny_unknown status:     allowed\nMax kernel policy version:      33\n`);
  });
  def('chcon', async (c, args) => {
    if (needRoot(c, 'chcon: failed to change context: Operation not permitted\n')) return 1;
    const { o, rest } = parseOptsLoose(args, ['-t', '-u', '-r', '--reference']);
    for (const f of rest) {
      const abs = c.abs(f);
      const n = c.sh.fs.lookup(abs);
      if (!n) {
        c.err(`chcon: cannot access '${f}': No such file or directory\n`);
        return 1;
      }
      const cur = LX.ctxOf(c.sh, n, abs).split(':');
      if (o.t) cur[2] = o.t;
      n.ctx = cur.join(':');
      if (o.R) c.sh.fs.walk(abs, (p, nd) => p !== abs && (nd.ctx = cur.join(':')));
    }
    return 0;
  });
  def('restorecon', async (c, args) => {
    const { o, rest } = parseOptsLoose(args, []);
    for (const f of rest) {
      const abs = c.abs(f);
      const n = c.sh.fs.lookup(abs);
      if (!n) {
        c.err(`restorecon: Could not stat ${f}\n`);
        return 1;
      }
      const fix = (node, p) => {
        const had = node.ctx;
        delete node.ctx;
        const def = LX.ctxOf(c.sh, node, p);
        if (had && had !== def && o.v) c.out(`Relabeled ${p} from ${had} to ${def}\n`);
      };
      fix(n, abs);
      if (o.R) c.sh.fs.walk(abs, (p, nd) => p !== abs && fix(nd, p));
    }
    return 0;
  });
  def('semanage', async (c, args) => {
    if (needRoot(c, 'ValueError: SELinux policy management requires root. Try sudo.\n')) return 1;
    const s = c.sh.selinux;
    const sub = args[0];
    const { o, rest } = parseOptsLoose(args.slice(1), ['-t', '-p']);
    if (sub === 'port') {
      if (o.l) {
        c.out('SELinux Port Type              Proto    Port Number\n');
        for (const [t, ports] of Object.entries(s.ports)) c.out(`${t.padEnd(30)} tcp      ${ports.join(', ')}\n`);
        return 0;
      }
      if (o.a) {
        const port = +rest[0];
        if (!s.ports[o.t]) s.ports[o.t] = [];
        if (s.ports[o.t].includes(port)) {
          c.err(`ValueError: Port tcp/${port} already defined\n`);
          return 1;
        }
        s.ports[o.t].push(port);
        return 0;
      }
    }
    if (sub === 'fcontext') {
      if (o.l) {
        s.fcontexts.forEach((f) => c.out(`${f.re.padEnd(40)} all files          system_u:object_r:${f.type}:s0\n`));
        return 0;
      }
      if (o.a) {
        s.fcontexts.push({ re: rest[0], type: o.t });
        return 0;
      }
    }
    if (sub === 'boolean' && o.l) {
      c.out('SELinux boolean                State  Default Description\n');
      for (const [k, v] of Object.entries(s.bools)) c.out(`${k.padEnd(30)} (${v ? 'on ' : 'off'}  ,  ${v ? 'on ' : 'off'})  ${k.replace(/_/g, ' ')}\n`);
      return 0;
    }
    c.err('usage: semanage {login|user|port|interface|module|node|fcontext|boolean|permissive|dontaudit} ...\n');
    return 1;
  });
  def('getsebool', async (c, args) => {
    const b = c.sh.selinux.bools;
    const names = args.includes('-a') ? Object.keys(b) : args.filter((a) => !a.startsWith('-'));
    for (const n of names) {
      if (b[n] === undefined) {
        c.err(`getsebool:  SELinux boolean ${n} does not exist.\n`);
        return 1;
      }
      c.out(`${n} --> ${b[n] ? 'on' : 'off'}\n`);
    }
  });
  def('setsebool', async (c, args) => {
    if (needRoot(c, 'Could not change active booleans. Please try as root.\n')) return 1;
    const rest = args.filter((a) => !a.startsWith('-'));
    const [k, v] = rest.length === 1 && rest[0].includes('=') ? rest[0].split('=') : rest;
    if (c.sh.selinux.bools[k] === undefined) {
      c.err(`Boolean ${k} is not defined\n`);
      return 1;
    }
    c.sh.selinux.bools[k] = ['on', '1', 'true'].includes(v);
    return 0;
  });
  def('matchpathcon', async (c, args) => {
    for (const f of args.filter((a) => !a.startsWith('-'))) {
      const abs = c.abs(f);
      const n = c.sh.fs.lookup(abs) || {};
      const nn = Object.assign({}, n);
      delete nn.ctx;
      c.out(`${abs}\t${LX.ctxOf(c.sh, nn, abs)}\n`);
    }
  });
  def('aa-status', async (c) => {
    if (needRoot(c, 'You need to be root to run this program.\n')) return 1;
    c.out('apparmor module is loaded.\n12 profiles are loaded.\n12 profiles are in enforce mode.\n   /usr/bin/man\n   /usr/sbin/cups-browsed\n   lsb_release\n   nvidia_modprobe\n0 profiles are in complain mode.\n0 processes have profiles defined.\n');
  });

  /* ---------- dynamic /proc ---------- */
  LX.sysinfo = function (sh) {
    const hog = (sh.jobs || []).reduce((s, j) => s + (j.cpu || 0), 0);
    const load1 = Math.round((0.08 + hog / 100) * 100) / 100;
    const memUsedKiB = 1262340 + (sh.jobs || []).reduce((s, j) => s + (j.memKiB || 0), 0);
    return { load: [load1, Math.round(load1 * 0.8 * 100) / 100, Math.round(load1 * 0.5 * 100) / 100], memTotal: 4046772, memUsed: Math.min(memUsedKiB, 4000000), cores: 2, hog };
  };
  LX.procRead = function (sh, abs) {
    const si = LX.sysinfo(sh);
    const up = (Date.now() - sh.startTime) / 1000;
    if (abs === '/proc/uptime') return `${up.toFixed(2)} ${(up * 1.9).toFixed(2)}\n`;
    if (abs === '/proc/loadavg') return `${si.load.join(' ')} 1/${180 + (sh.jobs || []).length} ${sh.nextPid}\n`;
    if (abs === '/proc/meminfo') {
      const free = si.memTotal - si.memUsed - 1261424;
      const swapT = sh.swapTotal ? sh.swapTotal() : 2097148;
      return `MemTotal:        ${si.memTotal} kB\nMemFree:         ${Math.max(100000, free)} kB\nMemAvailable:    ${Math.max(200000, si.memTotal - si.memUsed)} kB\nBuffers:           94280 kB\nCached:          1167144 kB\nSwapTotal:       ${swapT} kB\nSwapFree:        ${swapT} kB\n`;
    }
    if (abs === '/proc/version') return 'Linux version 6.8.0-45-generic (buildd@lcy02-amd64-020) (x86_64-linux-gnu-gcc-13 (Ubuntu 13.2.0-23ubuntu4) 13.2.0, GNU ld (GNU Binutils for Ubuntu) 2.42) #45-Ubuntu SMP PREEMPT_DYNAMIC Fri Aug 30 12:02:04 UTC 2024\n';
    if (abs === '/proc/cmdline') return 'BOOT_IMAGE=/boot/vmlinuz-6.8.0-45-generic root=UUID=6f1a2c3e-91d4-4b7a-8c0e-3d5f7a9b1c2d ro quiet splash\n';
    if (abs === '/proc/mounts' || abs === '/proc/self/mounts') return (sh.mountsTable ? sh.mountsTable() : []).map((m) => `${m.dev} ${m.target} ${m.fs} ${m.opts} 0 0`).join('\n') + '\n';
    if (abs === '/proc/swaps') return sh.swapTable ? sh.swapTable() : 'Filename\t\t\t\tType\t\tSize\t\tUsed\t\tPriority\n';
    if (abs === '/proc/partitions') return sh.partitionsTable ? sh.partitionsTable() : '';
    if (abs === '/proc/mdstat') return sh.mdstat ? sh.mdstat() : 'Personalities :\nunused devices: <none>\n';
    if (abs === '/proc/modules') return (sh.modules || []).map((m) => `${m} 16384 0 - Live 0x0000000000000000`).join('\n') + '\n';
    if (abs === '/proc/filesystems') return 'nodev\tsysfs\nnodev\ttmpfs\nnodev\tproc\nnodev\tdevtmpfs\nnodev\toverlay\n\text4\n\txfs\n\tvfat\nnodev\tnfs\n';
    if (abs === '/proc/net/dev') return 'Inter-|   Receive                                                |  Transmit\n face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n    lo:  184320    1420    0    0    0     0          0         0   184320    1420    0    0    0     0       0          0\n  eth0: 5242880   38210    0    0    0     0          0         0  1048576   21003    0    0    0     0       0          0\n';
    let m;
    if ((m = /^\/proc\/sys\/(.+)$/.exec(abs))) {
      const key = m[1].replace(/\//g, '.');
      const v = sh.sysctl && sh.sysctl[key];
      return v === undefined ? null : v + '\n';
    }
    if ((m = /^\/proc\/(\d+)\/(status|cmdline)$/.exec(abs))) {
      const p = (sh.procList ? sh.procList() : []).find((x) => x.pid === +m[1]);
      if (!p) return null;
      return m[2] === 'cmdline' ? p.cmd.replace(/ /g, '\0') + '\0' : `Name:\t${p.cmd.split(' ')[0].replace(/^.*\//, '').replace(/^-/, '')}\nState:\t${p.stat && p.stat[0] === 'T' ? 'T (stopped)' : 'S (sleeping)'}\nPid:\t${p.pid}\nPPid:\t${p.ppid}\nUid:\t${(sh.users[p.user] || { uid: 0 }).uid}\n`;
    }
    return null;
  };
  LX.procWrite = function (sh, abs, data) {
    const m = /^\/proc\/sys\/(.+)$/.exec(abs);
    if (!m) return false;
    if (sh.eu() !== 'root') throw new FsErr('EACCES', abs);
    const key = m[1].replace(/\//g, '.');
    if (sh.sysctl && sh.sysctl[key] !== undefined) {
      sh.sysctl[key] = data.trim();
      return true;
    }
    throw new FsErr('ENOENT', abs);
  };
  LX.initHooks.push((sh) => {
    sh.sysctl = { 'kernel.hostname': 'linux-school', 'kernel.ostype': 'Linux', 'kernel.osrelease': '6.8.0-45-generic', 'kernel.pid_max': '4194304', 'kernel.dmesg_restrict': '1', 'vm.swappiness': '60', 'vm.overcommit_memory': '0', 'vm.dirty_ratio': '20', 'net.ipv4.ip_forward': '0', 'net.ipv4.tcp_syncookies': '1', 'net.ipv6.conf.all.disable_ipv6': '0', 'fs.file-max': '9223372036854775807', 'net.core.somaxconn': '4096' };
    sh.sysctlPersist = Object.assign({}, sh.sysctl);
    const mk = (p) => {
      if (!sh.fs.lookup(p)) sh.fs.put(p, '', { owner: 'root', group: 'root', dyn: true, size: 0 });
    };
    ['uptime', 'loadavg', 'version', 'cmdline', 'mounts', 'swaps', 'partitions', 'mdstat', 'modules', 'filesystems', 'net/dev'].forEach((f) => mk('/proc/' + f));
    for (const k of Object.keys(sh.sysctl)) mk('/proc/sys/' + k.replace(/\./g, '/'));
    for (const pid of [1, 412, 530, 1189]) {
      sh.fs.mkdirp('/proc/' + pid, { owner: 'root', group: 'root' });
      mk(`/proc/${pid}/status`);
      mk(`/proc/${pid}/cmdline`);
    }
    const mi = sh.fs.lookup('/proc/meminfo');
    mi.dyn = true;
  });
})();
