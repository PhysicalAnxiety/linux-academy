/* Linux Academy: SSH (keys, sshd_config, sessions), nginx, Apache, http.server, tmux */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS, Shell } = LX;
  const U = LX.U;
  const P = Shell.prototype;
  LX.initHooks = LX.initHooks || [];
  const needRoot = (c, msg) => {
    if (c.sh.eu() === 'root') return false;
    c.err(msg);
    return true;
  };
  const rnd = (n, set) => Array.from({ length: n }, () => (set || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')[Math.floor(Math.random() * (set ? set.length : 62))]).join('');

  /* ======================= SSH ======================= */
  const SSHD_DEFAULT = '# This is the sshd server system-wide configuration file.  See\n# sshd_config(5) for more information.\n\nInclude /etc/ssh/sshd_config.d/*.conf\n\n#Port 22\n#AddressFamily any\n#ListenAddress 0.0.0.0\n\n#PermitRootLogin prohibit-password\n#StrictModes yes\n#MaxAuthTries 6\n\n#PubkeyAuthentication yes\n\n#PasswordAuthentication yes\n#PermitEmptyPasswords no\n\nKbdInteractiveAuthentication no\nUsePAM yes\nX11Forwarding yes\nPrintMotd no\nAcceptEnv LANG LC_*\nSubsystem\tsftp\t/usr/lib/openssh/sftp-server\n';
  const SSHD_KEYS = ['port', 'addressfamily', 'listenaddress', 'permitrootlogin', 'strictmodes', 'maxauthtries', 'pubkeyauthentication', 'passwordauthentication', 'permitemptypasswords', 'kbdinteractiveauthentication', 'usepam', 'x11forwarding', 'printmotd', 'acceptenv', 'subsystem', 'allowusers', 'denyusers', 'allowgroups', 'denygroups', 'logingracetime', 'clientaliveinterval', 'clientalivecountmax', 'banner', 'allowtcpforwarding', 'authorizedkeysfile', 'hostkey', 'loglevel', 'maxsessions', 'protocol', 'include', 'macs', 'ciphers', 'kexalgorithms', 'permittunnel', 'gatewayports', 'usedns', 'tcpkeepalive', 'printlastlog', 'ignorerhosts', 'hostbasedauthentication', 'challengeresponseauthentication', 'match', 'chrootdirectory', 'forcecommand', 'passwordauthentication'];
  function parseSshd(sh) {
    const n = sh.fs.lookup('/etc/ssh/sshd_config');
    const cfg = { Port: 22, PermitRootLogin: 'prohibit-password', PasswordAuthentication: 'yes', PubkeyAuthentication: 'yes', MaxAuthTries: 6, StrictModes: 'yes', PermitEmptyPasswords: 'no', X11Forwarding: 'yes', AllowUsers: null, UsePAM: 'yes' };
    const lines = ((n && n.content) || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l || l.startsWith('#')) continue;
      const m = /^(\S+)\s+(.*)$/.exec(l);
      if (!m) return { err: `/etc/ssh/sshd_config line ${i + 1}: missing argument.` };
      const key = m[1].toLowerCase();
      if (!SSHD_KEYS.includes(key)) return { err: `/etc/ssh/sshd_config line ${i + 1}: Bad configuration option: ${m[1]}` };
      const canon = { port: 'Port', permitrootlogin: 'PermitRootLogin', passwordauthentication: 'PasswordAuthentication', pubkeyauthentication: 'PubkeyAuthentication', maxauthtries: 'MaxAuthTries', strictmodes: 'StrictModes', permitemptypasswords: 'PermitEmptyPasswords', x11forwarding: 'X11Forwarding', allowusers: 'AllowUsers', denyusers: 'DenyUsers', usepam: 'UsePAM', clientaliveinterval: 'ClientAliveInterval', logingracetime: 'LoginGraceTime', allowtcpforwarding: 'AllowTcpForwarding' }[key];
      if (!canon) continue;
      let v = m[2].trim();
      if (canon === 'Port') {
        if (!/^\d+$/.test(v) || +v > 65535) return { err: `/etc/ssh/sshd_config line ${i + 1}: Badly formatted port number.` };
        v = +v;
      } else if (['PermitRootLogin', 'PasswordAuthentication', 'PubkeyAuthentication', 'X11Forwarding', 'PermitEmptyPasswords', 'StrictModes', 'UsePAM'].includes(canon)) {
        const ok = canon === 'PermitRootLogin' ? ['yes', 'no', 'prohibit-password', 'without-password', 'forced-commands-only'] : ['yes', 'no'];
        if (!ok.includes(v.toLowerCase())) return { err: `/etc/ssh/sshd_config line ${i + 1}: Bad yes/no argument: ${v}` };
        v = v.toLowerCase();
      } else if (canon === 'MaxAuthTries') v = +v;
      cfg[canon] = v;
    }
    return { cfg };
  }
  LX.initHooks.push((sh) => {
    sh.fs.mkdirp('/etc/ssh/sshd_config.d', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/ssh/sshd_config', SSHD_DEFAULT, { owner: 'root', group: 'root', mode: 0o644 });
    sh.fs.put('/etc/ssh/ssh_config', 'Include /etc/ssh/ssh_config.d/*.conf\n\nHost *\n    SendEnv LANG LC_*\n    HashKnownHosts yes\n    GSSAPIAuthentication yes\n', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/ssh/ssh_host_ed25519_key.pub', 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHostKeyDemo root@linux-school\n', { owner: 'root', group: 'root' });
    sh.sshdCfg = parseSshd(sh).cfg;
    sh.remoteAuth = { 'demo-server': { learner: [] }, db01: { learner: [] }, 'web01.lab.local': { learner: [] }, 'bastion.example.org': { learner: [] } };
    sh.tmuxSessions = [];
    sh.serviceHooks.ssh = async (c, action) => {
      if (action === 'stop') {
        sh.sshdCfg = null;
        return { ok: true };
      }
      const r = parseSshd(sh);
      if (r.err) {
        sh.logEvent('ssh.service', 3, r.err, { ident: 'sshd', pid: 2201 });
        sh.logEvent('ssh.service', 3, 'sshd: terminating, 1 bad configuration options', { ident: 'sshd', pid: 2201 });
        sh.logEvent('ssh.service', 3, 'ssh.service: Control process exited, code=exited, status=255/EXCEPTION', { ident: 'systemd', pid: 1 });
        return { ok: false, code: 255 };
      }
      const port = r.cfg.Port;
      if (sh.listeners[port]) {
        sh.logEvent('ssh.service', 3, `error: Bind to port ${port} on 0.0.0.0 failed: Address already in use.`, { ident: 'sshd', pid: 2201 });
        return { ok: false, code: 255 };
      }
      sh.sshdCfg = r.cfg;
      sh.logEvent('ssh.service', 6, `Server listening on 0.0.0.0 port ${port}.`, { ident: 'sshd', pid: 412 });
      return { ok: true };
    };
  });
  def('sshd', async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, 'sshd re-exec requires execution with an absolute path\n')) return 1;
    const r = parseSshd(sh);
    if (args.includes('-t')) {
      if (r.err) {
        c.err(r.err + '\n');
        return 255;
      }
      return 0;
    }
    if (args.includes('-T')) {
      if (r.err) {
        c.err(r.err + '\n');
        return 255;
      }
      for (const [k, v] of Object.entries(r.cfg)) if (v !== null) c.out(`${k.toLowerCase()} ${v}\n`);
      return 0;
    }
    c.out('\x1b[2m(Start the server with: sudo systemctl start ssh)\x1b[0m\n');
  });

  const pubOf = (sh, path) => {
    const n = sh.fs.lookup(path.endsWith('.pub') ? path : path + '.pub');
    return n && n.t === 'f' ? n.content.trim() : null;
  };
  const home = (sh, user) => (sh.users[user] || {}).home || '/home/' + user;
  const randomart = (type, bits) => `+--[${type} ${bits}]--+\n|       .o+=*+o.   |\n|      . =oo+ +.   |\n|       . *+oB .   |\n|        + =O.o    |\n|       S ooE*     |\n|        . ++.o    |\n|         . =+.    |\n|          ..o.    |\n|            ..    |\n+----[SHA256]-----+\n`;
  def('ssh-keygen', async (c, args) => {
    const sh = c.sh;
    const g = (k) => {
      const i = args.indexOf(k);
      return i >= 0 ? args[i + 1] : undefined;
    };
    const home0 = home(sh, sh.eu());
    if (args.includes('-R')) {
      const kh = sh.fs.lookup(home0 + '/.ssh/known_hosts');
      const host = g('-R');
      if (kh) {
        const before = kh.content;
        kh.content = before.split('\n').filter((l) => !l.startsWith(host + ' ')).join('\n');
        c.out(`# Host ${host} found: line 1\n${home0}/.ssh/known_hosts updated.\nOriginal contents retained as ${home0}/.ssh/known_hosts.old\n`);
      } else c.out(`${home0}/.ssh/known_hosts not found\n`);
      return 0;
    }
    if (args.includes('-l')) {
      const f = g('-f') || home0 + '/.ssh/id_ed25519.pub';
      const pub = pubOf(sh, sh.abs(f));
      if (!pub) {
        c.err(`${f}: No such file or directory\n`);
        return 1;
      }
      c.out(`256 SHA256:${rnd(43)} ${pub.split(' ').slice(2).join(' ')} (${pub.startsWith('ssh-ed25519') ? 'ED25519' : 'RSA'})\n`);
      return 0;
    }
    if (args.includes('-y')) {
      const f = g('-f');
      const pub = f && pubOf(sh, sh.abs(f));
      if (!pub) return 1;
      c.out(pub + '\n');
      return 0;
    }
    const type = g('-t') || 'rsa';
    if (!['rsa', 'ed25519', 'ecdsa', 'dsa'].includes(type)) {
      c.err(`unknown key type ${type}\n`);
      return 1;
    }
    const bits = type === 'ed25519' ? 256 : +(g('-b') || 3072);
    const defPath = `${home0}/.ssh/id_${type}`;
    c.out(`Generating public/private ${type} key pair.\n`);
    let path = g('-f');
    if (!path) {
      if (c.io.stdin !== null && c.io.stdin !== undefined || sh.hooks.readLine) {
        const a = sh.hooks.readLine && (c.io.stdin === null || c.io.stdin === undefined) ? await sh.hooks.readLine(`Enter file in which to save the key (${defPath}): `) : (c.out(`Enter file in which to save the key (${defPath}): `), (c.io.stdin || '').split('\n').shift());
        sh.checkAbort();
        path = a && a.trim() ? sh.abs(a.trim()) : defPath;
      } else path = defPath;
    } else path = sh.abs(path);
    let pass = g('-N');
    const existing = sh.fs.lookup(path);
    if (existing) {
      c.out(`${path} already exists.\n`);
      if (sh.hooks.readLine) {
        const a = await sh.hooks.readLine('Overwrite (y/n)? ');
        if (!/^y/i.test(a || '')) return 1;
      } else return 1;
    }
    if (pass === undefined && sh.hooks.readLine) {
      pass = await sh.hooks.readLine('Enter passphrase (empty for no passphrase): ', { secret: true });
      const p2 = await sh.hooks.readLine('Enter same passphrase again: ', { secret: true });
      if (pass !== p2) {
        c.err('Passphrases do not match.  Try again.\n');
        return 1;
      }
    }
    const dir = VFS.dirname(path);
    try {
      if (!sh.fs.lookup(dir)) {
        sh.fs.mkdirp(dir, { owner: sh.eu(), group: sh.users[sh.eu()].groups[0], mode: 0o700 });
      }
      const comment = g('-C') || `${sh.eu()}@${sh.hostname}`;
      const keyType = { ed25519: 'ssh-ed25519', rsa: 'ssh-rsa', ecdsa: 'ecdsa-sha2-nistp256', dsa: 'ssh-dss' }[type];
      const body = type === 'ed25519' ? 'AAAAC3NzaC1lZDI1NTE5AAAAI' + rnd(43) : 'AAAAB3NzaC1yc2EAAAADAQABAAABgQ' + rnd(120);
      const priv = `-----BEGIN OPENSSH PRIVATE KEY-----\n${rnd(64)}\n${rnd(64)}\n${rnd(64)}\n${rnd(32)}\n-----END OPENSSH PRIVATE KEY-----\n`;
      sh.fs.put(path, priv, { owner: sh.eu(), group: sh.users[sh.eu()].groups[0], mode: 0o600, passphrase: pass || '' });
      sh.fs.put(path + '.pub', `${keyType} ${body} ${comment}\n`, { owner: sh.eu(), group: sh.users[sh.eu()].groups[0], mode: 0o644 });
    } catch (e) {
      if (!(e instanceof FsErr)) throw e;
      c.err(`Saving key "${path}" failed: ${U.errTxt(e)}\n`);
      return 1;
    }
    c.out(`Your identification has been saved in ${path}\nYour public key has been saved in ${path}.pub\nThe key fingerprint is:\nSHA256:${rnd(43)} ${g('-C') || sh.eu() + '@' + sh.hostname}\nThe key's randomart image is:\n${randomart(type.toUpperCase(), bits)}`);
    return 0;
  });
  def('ssh-agent', async (c) => c.out('SSH_AUTH_SOCK=/tmp/ssh-XXXXXXaBcD/agent.1204; export SSH_AUTH_SOCK;\nSSH_AGENT_PID=1205; export SSH_AGENT_PID;\necho Agent pid 1205;\n'));
  def('ssh-add', async (c, args) => {
    if (args.includes('-l')) return c.out(c.sh.agentKeys && c.sh.agentKeys.length ? c.sh.agentKeys.map((k) => '256 SHA256:' + rnd(43) + ' ' + k + ' (ED25519)').join('\n') + '\n' : 'The agent has no identities.\n'), c.sh.agentKeys && c.sh.agentKeys.length ? 0 : 1;
    const f = args.find((a) => !a.startsWith('-')) || home(c.sh, c.sh.eu()) + '/.ssh/id_ed25519';
    const n = c.sh.fs.lookup(c.abs(f));
    if (!n) {
      c.err(`${f}: No such file or directory\n`);
      return 1;
    }
    c.sh.agentKeys = (c.sh.agentKeys || []).concat([c.abs(f)]);
    c.out(`Identity added: ${c.abs(f)} (${pubOf(c.sh, c.abs(f)) ? pubOf(c.sh, c.abs(f)).split(' ').pop() : ''})\n`);
  });
  const keyUsable = (c, path) => {
    const sh = c.sh;
    const n = sh.fs.lookup(path);
    if (!n) return false;
    if (n.mode & 0o077) {
      c.err(`@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @\n@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\nPermissions 0${(n.mode & 0o777).toString(8)} for '${path}' are too open.\nIt is required that your private key files are NOT accessible by others.\nThis private key will be ignored.\nLoad key "${path}": bad permissions\n`);
      return false;
    }
    return true;
  };
  const knownHost = async (c, host, ip) => {
    const sh = c.sh;
    const kh = home(sh, sh.user) + '/.ssh/known_hosts';
    const n = sh.fs.lookup(kh);
    if (n && n.content.split('\n').some((l) => l.startsWith(host + ' ') || l.startsWith(ip + ' '))) return true;
    c.out(`The authenticity of host '${host} (${ip})' can't be established.\nED25519 key fingerprint is SHA256:Qk3y0xTz9tqf2eE0b6c1R0l3v4Ew+Y8k2m1n0pQrStU.\nThis key is not known by any other names.\n`);
    const a = await U.ask(c, 'Are you sure you want to continue connecting (yes/no/[fingerprint])? ');
    if (!/^y/i.test(a)) {
      c.err('Host key verification failed.\n');
      return false;
    }
    c.out(`Warning: Permanently added '${host}' (ED25519) to the list of known hosts.\n`);
    try {
      sh.fs.mkdirp(home(sh, sh.user) + '/.ssh', { owner: sh.user, group: sh.users[sh.user].groups[0], mode: 0o700 });
      sh.writeFile(kh, (n ? n.content : '') + `${host} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHostKeyDemo\n`, false);
    } catch (e) {}
    return true;
  };
  const sshConfigFor = (sh, alias) => {
    const n = sh.fs.lookup(home(sh, sh.user) + '/.ssh/config');
    const res = {};
    if (!n) return res;
    let cur = false;
    for (const l of n.content.split('\n')) {
      const m = /^\s*(\S+)\s+(.+?)\s*$/.exec(l);
      if (!m || l.trim().startsWith('#')) continue;
      if (/^host$/i.test(m[1])) cur = m[2].split(/\s+/).some((p) => p === alias || p === '*' || (p.includes('*') && new RegExp('^' + p.replace(/\*/g, '.*') + '$').test(alias)));
      else if (cur && !(m[1].toLowerCase() in res)) res[m[1].toLowerCase()] = m[2];
    }
    return res;
  };
  const REMOTES = { 'demo-server': '192.168.1.20', db01: '192.168.1.21', 'web01.lab.local': '192.168.1.30', 'bastion.example.org': '203.0.113.10' };
  /** a persistent mini machine for each remote host (shared by ssh, scp and ansible) */
  LX.hostShell = function (sh, canon) {
    sh.hostShells = sh.hostShells || {};
    if (!sh.hostShells[canon]) {
      const T = new LX.Shell({ fast: true });
      T.hostname = canon.split('.')[0];
      T.isRemote = true;
      const hn = T.fs.lookup('/home/learner');
      hn.kids = {};
      T.fs.put('/home/learner/notes.txt', `notes on ${T.hostname}\n`, { owner: 'learner', group: 'learner' });
      T.fs.put('/home/learner/backup.sh', '#!/bin/bash\necho "backing up..."\n', { owner: 'learner', group: 'learner', mode: 0o755 });
      T.fs.mkdirp('/home/learner/data', { owner: 'learner', group: 'learner' });
      T.fs.put('/etc/hostname', T.hostname + '\n', { owner: 'root', group: 'root' });
      sh.hostShells[canon] = T;
    }
    return sh.hostShells[canon];
  };
  async function remoteCmd(c, host, user, cmd) {
    const sh = c.sh;
    const T = LX.hostShell(sh, host);
    const prev = { user: T.user, eu: T._eu, cwd: T.cwd };
    let out = '';
    T.user = T.users[user] ? user : 'learner';
    T._eu = null;
    T.cwd = T.users[T.user].home;
    try {
      sh.lastRemoteStatus = await T.runSource(cmd, { stdin: typeof c.io.stdin === 'string' ? c.io.stdin : '', stdout: (x) => { out += x; }, stderr: (x) => { out += x; }, tty: false });
    } finally {
      T.user = prev.user;
      T._eu = prev.eu;
      T.cwd = prev.cwd;
    }
    return out;
  }
  const localHost = (sh, host) => host === 'localhost' || host === sh.hostname || sh.ownIps().includes(host) || host === '::1';
  def('ssh', async (c, args) => {
    const sh = c.sh;
    const opts = {};
    const pos = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (['-i', '-p', '-l', '-L', '-R', '-D', '-J', '-F'].includes(a)) opts[a] = args[++i];
      else if (a === '-o') {
        const [k, v] = args[++i].split('=');
        opts[k] = v;
      } else if (a.startsWith('-') && a.length > 1) opts[a] = true;
      else {
        pos.push(...args.slice(i));
        break;
      }
    }
    if (!pos.length) {
      c.err('usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-B bind_interface] [-b bind_address] [-c cipher_spec] [-D [bind_address:]port] [-E log_file] [-F configfile] [-I pkcs11] [-i identity_file] [-J destination] [-L address] [-l login_name] [-o option] [-p port] [-R address] [-W host:port] destination [command [argument ...]]\n');
      return 255;
    }
    let dest = pos[0];
    const remote = pos.slice(1).join(' ');
    let user = opts['-l'] || sh.user;
    let host = dest;
    if (dest.includes('@')) [user, host] = [dest.split('@')[0], dest.split('@').slice(1).join('@')];
    const cfg = sshConfigFor(sh, host);
    if (cfg.hostname) host = cfg.hostname;
    if (cfg.user && !dest.includes('@') && !opts['-l']) user = cfg.user;
    const port = +(opts['-p'] || cfg.port || 22);
    const idFile = opts['-i'] || (cfg.identityfile ? cfg.identityfile.replace(/^~/, home(sh, sh.user)) : null);
    const ip = sh.resolveHost(host);
    if (!ip) {
      c.err(`ssh: Could not resolve hostname ${host}: ${LX.resolveMsg(sh)}\n`);
      return 255;
    }
    if (opts['-L']) c.out(`\x1b[2m(Tunnel ${opts['-L']}: local port forwarding is set up while the connection stays open.)\x1b[0m\n`);
    const own = localHost(sh, host) || sh.ownIps().includes(ip);
    // identities to try
    const ids = [];
    if (idFile) ids.push(sh.abs(idFile));
    else for (const t of ['id_ed25519', 'id_rsa', 'id_ecdsa']) if (sh.fs.lookup(home(sh, sh.user) + '/.ssh/' + t)) ids.push(home(sh, sh.user) + '/.ssh/' + t);
    const pubs = ids.filter((p) => keyUsable(c, p)).map((p) => ({ path: p, pub: pubOf(sh, p) })).filter((x) => x.pub);
    if (own) {
      const st = LX.portState(sh, ip, port);
      if (st === 'filtered') {
        c.err(`ssh: connect to host ${host} port ${port}: Connection timed out\n`);
        return 255;
      }
      const listening = sh.sshdCfg && sh.services.ssh && sh.services.ssh.active && sh.sshdCfg.Port === port;
      if (st === 'refused' || !listening) {
        c.err(`ssh: connect to host ${host} port ${port}: Connection refused\n`);
        return 255;
      }
      if (!(await knownHost(c, host, ip))) return 255;
      const cf = sh.sshdCfg;
      const target = sh.users[user];
      const fail = (methods) => {
        sh.logEvent('ssh.service', 5, `Failed password for ${target ? '' : 'invalid user '}${user} from 192.168.1.5 port 5${Math.floor(Math.random() * 9000 + 1000)} ssh2`, { ident: 'sshd', pid: 2300, auth: true });
        c.err(`${user}@${host}: Permission denied (${methods}).\n`);
        return 255;
      };
      const methods = [cf.PubkeyAuthentication === 'yes' ? 'publickey' : null, cf.PasswordAuthentication === 'yes' ? 'password' : null].filter(Boolean).join(',') || 'publickey';
      if (!target || (cf.AllowUsers && !cf.AllowUsers.split(/\s+/).includes(user)) || (cf.DenyUsers && cf.DenyUsers.split(/\s+/).includes(user))) return fail(methods);
      if (user === 'root' && cf.PermitRootLogin === 'no') return fail(methods);
      let authed = false;
      let how = '';
      if (cf.PubkeyAuthentication === 'yes' && pubs.length) {
        const ak = sh.fs.lookup(home(sh, user) + '/.ssh/authorized_keys');
        const sd = sh.fs.lookup(home(sh, user) + '/.ssh');
        const okPerms = !cf.StrictModes || cf.StrictModes === 'no' || (sd && !(sd.mode & 0o022) && ak && !(ak.mode & 0o022) && ak.owner === user);
        if (ak && pubs.some((p) => ak.content.split('\n').some((l) => l.trim() && l.trim().split(' ').slice(0, 2).join(' ') === p.pub.split(' ').slice(0, 2).join(' ')))) {
          if (okPerms) {
            authed = true;
            how = 'publickey';
          } else sh.logEvent('ssh.service', 3, `Authentication refused: bad ownership or modes for ${sd && (sd.mode & 0o022) ? 'directory ' + home(sh, user) + '/.ssh' : 'file ' + home(sh, user) + '/.ssh/authorized_keys'}`, { ident: 'sshd', pid: 2300, auth: true });
        }
      }
      if (!authed && cf.PasswordAuthentication === 'yes' && !(user === 'root' && cf.PermitRootLogin !== 'yes')) {
        let ok = true;
        const lockedUser = target.locked;
        for (let t = 0; t < Math.min(3, cf.MaxAuthTries); t++) {
          const pw = sh.hooks.readLine ? await sh.hooks.readLine(`${user}@${host}'s password: `, { secret: true }) : 'x';
          sh.checkAbort();
          if (pw === null) return 255;
          if (pw !== '' && !lockedUser) {
            authed = true;
            how = 'password';
            break;
          }
          c.err('Permission denied, please try again.\n');
        }
        if (!authed) return fail(methods);
      }
      if (!authed) return fail(methods);
      sh.logEvent('ssh.service', 6, `Accepted ${how} for ${user} from 192.168.1.5 port 5${Math.floor(Math.random() * 9000 + 1000)} ssh2`, { ident: 'sshd', pid: 2310, auth: true });
      if (remote) {
        const prev = sh._eu;
        sh._eu = user;
        try {
          return await sh.runSource(remote, c.io);
        } finally {
          sh._eu = prev;
        }
      }
      sh.userStack.push({ user: sh.user, cwd: sh.cwd });
      sh.user = user;
      sh._eu = null;
      sh.cwd = home(sh, user);
      c.out(`Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)\n\nLast login: ${U.strftime('%a %b %e %H:%M:%S %Y', new Date(Date.now() - 86400000))} from 192.168.1.5\n\x1b[2m(You are now logged in as ${user} on this machine over SSH. Type exit to return.)\x1b[0m\n`);
      return 0;
    }
    // remote canned hosts
    if (!REMOTES[host] && !Object.values(REMOTES).includes(host)) {
      c.err(`ssh: connect to host ${host} port ${port}: Connection timed out\n`);
      return 255;
    }
    const hn = Object.keys(REMOTES).find((k) => k === host || REMOTES[k] === host) || host;
    const st = LX.portState(sh, ip, port === 22 ? 22 : port);
    if (!sh.netUp()) {
      c.err(`ssh: connect to host ${host} port ${port}: Network is unreachable\n`);
      return 255;
    }
    if (port !== (hn === 'bastion.example.org' ? 2222 : 22)) {
      c.err(`ssh: connect to host ${host} port ${port}: Connection refused\n`);
      return 255;
    }
    if (!(await knownHost(c, host, ip))) return 255;
    const auth = (sh.remoteAuth[hn] = sh.remoteAuth[hn] || {});
    const keys = (auth[user] = auth[user] || []);
    const hasKey = pubs.some((p) => keys.includes(p.pub.split(' ').slice(0, 2).join(' ')));
    if (!hasKey) {
      if (hn === 'bastion.example.org') {
        c.err(`${user}@${host}: Permission denied (publickey).\n`);
        return 255;
      }
      if (sh.hooks.readLine) {
        const pw = await sh.hooks.readLine(`${user}@${host}'s password: `, { secret: true });
        sh.checkAbort();
        if (!pw) {
          c.err(`${user}@${host}: Permission denied (publickey,password).\n`);
          return 255;
        }
      }
    }
    if (remote) {
      c.out(await remoteCmd(c, hn, user, remote));
      return sh.lastRemoteStatus || 0;
    }
    c.out(`Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)\n\nLast login: ${U.strftime('%a %b %e %H:%M:%S %Y', new Date(Date.now() - 86400000))} from 192.168.1.5\n${user}@${hn.split('.')[0]}:~$ \x1b[2m(demo: a real ssh would give you a live shell on ${hn}. Try  ssh ${user}@${host} hostname  to run one command on it.)\x1b[0m\nlogout\nConnection to ${host} closed.\n`);
    return 0;
  });
  def('ssh-copy-id', async (c, args) => {
    const sh = c.sh;
    const iI = args.indexOf('-i');
    const dest = args.filter((a, i) => !a.startsWith('-') && (iI < 0 || i !== iI + 1)).pop();
    if (!dest) {
      c.err('Usage: /usr/bin/ssh-copy-id [-h|-?|-f|-n|-s] [-i [identity_file]] [-p port] [-F alternative ssh_config file] [[-o <ssh -o options>] ...] [user@]hostname\n');
      return 1;
    }
    const idf = iI >= 0 ? sh.abs(args[iI + 1]) : home(sh, sh.user) + '/.ssh/id_ed25519.pub';
    const pub = pubOf(sh, idf);
    if (!pub) {
      c.err(`/usr/bin/ssh-copy-id: ERROR: No identities found\n`);
      return 1;
    }
    c.out(`/usr/bin/ssh-copy-id: INFO: Source of key(s) to be installed: "${idf.endsWith('.pub') ? idf : idf + '.pub'}"\n`);
    let [user, host] = dest.includes('@') ? dest.split('@') : [sh.user, dest];
    const ip = sh.resolveHost(host);
    if (!ip) {
      c.err(`ssh: Could not resolve hostname ${host}: ${LX.resolveMsg(sh)}\n`);
      return 255;
    }
    if (!(await knownHost(c, host, ip))) return 255;
    c.out('/usr/bin/ssh-copy-id: INFO: attempting to log in with the new key(s), to filter out any that are already installed\n/usr/bin/ssh-copy-id: INFO: 1 key(s) remain to be installed -- if you are prompted now it is to install the new keys\n');
    if (sh.hooks.readLine) {
      const pw = await sh.hooks.readLine(`${user}@${host}'s password: `, { secret: true });
      sh.checkAbort();
      if (!pw) {
        c.err('Permission denied (publickey,password).\n');
        return 1;
      }
    }
    const key = pub.split(' ').slice(0, 2).join(' ');
    if (localHost(sh, host)) {
      const u = sh.users[user];
      if (!u) {
        c.err(`Permission denied (publickey,password).\n`);
        return 1;
      }
      const d = home(sh, user) + '/.ssh';
      if (!sh.fs.lookup(d)) sh.fs.mkdirp(d, { owner: user, group: u.groups[0], mode: 0o700 });
      const ak = sh.fs.lookup(d + '/authorized_keys');
      if (ak) ak.content += pub + '\n';
      else sh.fs.put(d + '/authorized_keys', pub + '\n', { owner: user, group: u.groups[0], mode: 0o600 });
    } else {
      const hn = Object.keys(REMOTES).find((k) => k === host || REMOTES[k] === host);
      if (!hn) {
        c.err(`ssh: connect to host ${host} port 22: Connection timed out\n`);
        return 255;
      }
      const arr = (sh.remoteAuth[hn][user] = sh.remoteAuth[hn][user] || []);
      if (!arr.includes(key)) arr.push(key);
    }
    c.out(`\nNumber of key(s) added: 1\n\nNow try logging into the machine, with:   "ssh '${dest}'"\nand check to make sure that only the key(s) you wanted were added.\n\n`);
    return 0;
  });
  def('scp', async (c, args) => {
    const sh = c.sh;
    const rest = args.filter((a) => !a.startsWith('-'));
    if (rest.length < 2) {
      c.err('usage: scp [-346ABCOpqRrsTv] [-c cipher] [-F ssh_config] [-i identity_file] [-J destination] [-l limit] [-o ssh_option] [-P port] [-S program] source ... target\n');
      return 1;
    }
    const isRemote = (s) => /^[^/]*:/.test(s);
    const [src, dst] = [rest[0], rest[rest.length - 1]];
    const split = (s) => {
      const i = s.indexOf(':');
      const left = s.slice(0, i);
      let user = left.includes('@') ? left.split('@')[0] : sh.user;
      let host = left.includes('@') ? left.split('@')[1] : left;
      const cfg = sshConfigFor(sh, host);
      if (cfg.hostname) host = cfg.hostname;
      if (cfg.user && !left.includes('@')) user = cfg.user;
      return { user, host, path: s.slice(i + 1) };
    };
    if (isRemote(src) && isRemote(dst)) {
      c.err('scp: remote to remote copies need -3 in this sandbox\n');
      return 1;
    }
    const r = split(isRemote(dst) ? dst : src);
    const ip = sh.resolveHost(r.host);
    if (!ip) {
      c.err(`ssh: Could not resolve hostname ${r.host}: ${LX.resolveMsg(sh)}\nscp: Connection closed\n`);
      return 255;
    }
    if (!localHost(sh, r.host) && !sh.netUp()) {
      c.err(`ssh: connect to host ${r.host} port 22: Network is unreachable\nscp: Connection closed\n`);
      return 255;
    }
    if (localHost(sh, r.host)) {
      const st = LX.portState(sh, ip, 22);
      if (st !== 'open') {
        c.err(`ssh: connect to host ${r.host} port 22: Connection ${st === 'filtered' ? 'timed out' : 'refused'}\nscp: Connection closed\n`);
        return 255;
      }
    }
    if (!(await knownHost(c, r.host, ip))) return 255;
    const local = isRemote(dst) ? src : dst;
    if (isRemote(dst)) {
      const n = sh.fs.lookup(c.abs(local));
      if (!n) {
        c.err(`scp: ${local}: No such file or directory\n`);
        return 1;
      }
      if (localHost(sh, r.host)) {
        const prev = sh._eu;
        sh._eu = r.user;
        try {
          let target = r.path.startsWith('/') ? r.path : home(sh, r.user) + '/' + r.path;
          const tn = sh.fs.lookup(target);
          if (tn && tn.t === 'd') target += '/' + VFS.base(local);
          sh.copyNode(c.abs(local), target, args.includes('-r'));
        } catch (e) {
          if (!(e instanceof FsErr)) throw e;
          c.err(`scp: ${r.path}: ${U.errTxt(e)}\n`);
          return 1;
        } finally {
          sh._eu = prev;
        }
      }
      else {
        const hn = Object.keys(REMOTES).find((k) => k === r.host || REMOTES[k] === r.host);
        if (hn) {
          const T = LX.hostShell(sh, hn);
          const rh = T.users[r.user] ? T.users[r.user].home : '/home/learner';
          let target = r.path === '' ? rh : r.path.startsWith('/') ? r.path : rh + '/' + r.path;
          const tn = T.fs.lookup(target);
          if (tn && tn.t === 'd') target = target.replace(/\/$/, '') + '/' + VFS.base(local);
          try {
            T.fs.mkdirp(VFS.dirname(target), { owner: r.user, group: r.user });
            T.fs.lookup(VFS.dirname(target)).kids[VFS.base(target)] = T.fs.clone(n);
            const cp = T.fs.lookup(target);
            cp.owner = T.users[r.user] ? r.user : 'learner';
            cp.group = cp.owner;
          } catch (e) {
            if (!(e instanceof FsErr)) throw e;
            c.err(`scp: ${r.path}: ${U.errTxt(e)}\n`);
            return 1;
          }
        }
      }
      c.out(`${VFS.base(local).padEnd(40)}100% ${String(VFS.size(n)).padStart(6)}   1.2MB/s   00:00\n`);
    } else {
      const hn = Object.keys(REMOTES).find((k) => k === r.host || REMOTES[k] === r.host);
      const dest = c.abs(local.endsWith('/') || (sh.fs.lookup(c.abs(local)) || {}).t === 'd' ? local.replace(/\/$/, '') + '/' + VFS.base(r.path) : local);
      if (hn) {
        const T = LX.hostShell(sh, hn);
        const rh = T.users[r.user] ? T.users[r.user].home : '/home/learner';
        const from = r.path.startsWith('/') ? r.path : rh + '/' + r.path;
        const fn = T.fs.lookup(from);
        if (!fn) {
          c.err(`scp: ${r.path}: No such file or directory\n`);
          return 1;
        }
        try {
          sh.fs.mkdirp(VFS.dirname(dest), { owner: sh.eu(), group: sh.eu() });
          sh.fs.lookup(VFS.dirname(dest)).kids[VFS.base(dest)] = sh.fs.clone(fn);
          const cp = sh.fs.lookup(dest);
          cp.owner = sh.eu();
          cp.group = sh.users[sh.eu()].groups[0];
        } catch (e) {
          if (!(e instanceof FsErr)) throw e;
          c.err(`scp: ${local}: ${U.errTxt(e)}\n`);
          return 1;
        }
        c.out(`${VFS.base(r.path).padEnd(40)}100% ${String(VFS.size(fn)).padStart(6)}   0.1MB/s   00:00\n`);
      } else {
        sh.writeFile(dest, `(copied from ${r.host}:${r.path})\n`, false);
        c.out(`${VFS.base(r.path).padEnd(40)}100%   32     0.1MB/s   00:00\n`);
      }
    }
    return 0;
  });
  def('sftp', async (c, args) => {
    c.out(`Connected to ${args.filter((a) => !a.startsWith('-')).pop() || 'host'}.\n\x1b[2m(sftp gives an interactive file-transfer prompt: ls, get, put, bye. Not available in this sandbox. Use scp for single files.)\x1b[0m\n`);
  });
  def('tmux', async (c, args) => {
    const sh = c.sh;
    const sub = args[0];
    if (!sub || sub === 'new' || sub === 'new-session') {
      const nI = args.indexOf('-s');
      const name = nI >= 0 ? args[nI + 1] : String(sh.tmuxSessions.length);
      sh.tmuxSessions.push({ name, windows: 1, created: Date.now(), attached: !args.includes('-d') });
      if (!args.includes('-d')) c.out('\x1b[2m[a tmux session would fill your terminal now. Detach with Ctrl+b then d; reattach later with: tmux attach -t ' + name + ']\x1b[0m\n');
      return 0;
    }
    if (sub === 'ls' || sub === 'list-sessions') {
      if (!sh.tmuxSessions.length) {
        c.err('no server running on /tmp/tmux-1000/default\n');
        return 1;
      }
      sh.tmuxSessions.forEach((s) => c.out(`${s.name}: ${s.windows} windows (created ${U.strftime('%a %b %e %H:%M:%S %Y', new Date(s.created))})${s.attached ? ' (attached)' : ''}\n`));
      return 0;
    }
    if (sub === 'attach' || sub === 'a') {
      const nm = args[args.indexOf('-t') + 1];
      if (!sh.tmuxSessions.find((s) => !nm || s.name === nm)) {
        c.err(`can't find session: ${nm || '0'}\n`);
        return 1;
      }
      c.out('\x1b[2m[reattached: your programs kept running while you were away]\x1b[0m\n');
      return 0;
    }
    if (sub === 'kill-session') {
      const nm = args[args.indexOf('-t') + 1];
      sh.tmuxSessions = sh.tmuxSessions.filter((s) => s.name !== nm);
      return 0;
    }
    c.err(`unknown command: ${sub}\n`);
    return 1;
  }, { pkg: 'tmux' });
  def('screen', async (c, args) => c.out('\x1b[2m(screen works like tmux: screen -S name, Ctrl+a d to detach, screen -r to return.)\x1b[0m\n'), { pkg: 'screen' });

  /* ======================= nginx ======================= */
  const NGINX_DIRS = ['events', 'http', 'server', 'location', 'worker_processes', 'worker_connections', 'include', 'default_type', 'sendfile', 'tcp_nopush', 'tcp_nodelay', 'keepalive_timeout', 'types_hash_max_size', 'server_tokens', 'ssl_protocols', 'ssl_prefer_server_ciphers', 'access_log', 'error_log', 'gzip', 'listen', 'server_name', 'root', 'index', 'try_files', 'proxy_pass', 'proxy_set_header', 'return', 'rewrite', 'alias', 'autoindex', 'ssl_certificate', 'ssl_certificate_key', 'ssl_ciphers', 'ssl_session_cache', 'ssl_session_timeout', 'error_page', 'add_header', 'client_max_body_size', 'upstream', 'proxy_read_timeout', 'proxy_connect_timeout', 'allow', 'deny', 'auth_basic', 'auth_basic_user_file', 'user', 'pid', 'if', 'fastcgi_pass', 'fastcgi_param', 'expires', 'log_format', 'charset', 'limit_req', 'limit_req_zone', 'proxy_http_version', 'real_ip_header', 'set', 'internal', 'mime_types', 'gzip_types', 'gzip_vary', 'gzip_proxied', 'gzip_comp_level', 'gzip_buffers', 'gzip_http_version', 'server_names_hash_bucket_size', 'worker_rlimit_nofile', 'multi_accept', 'ssl', 'http2', 'include'];
  function nginxLex(text, file) {
    const toks = [];
    let line = 1;
    for (let i = 0; i < text.length; ) {
      const ch = text[i];
      if (ch === '\n') {
        line++;
        i++;
      } else if (/\s/.test(ch)) i++;
      else if (ch === '#') {
        while (i < text.length && text[i] !== '\n') i++;
      } else if (ch === '{' || ch === '}' || ch === ';') {
        toks.push({ t: ch, line, file });
        i++;
      } else if (ch === '"' || ch === "'") {
        let j = i + 1;
        while (j < text.length && text[j] !== ch) j++;
        toks.push({ t: 'w', v: text.slice(i + 1, j), line, file });
        i = j + 1;
      } else {
        let j = i;
        while (j < text.length && !/[\s{};]/.test(text[j])) j++;
        toks.push({ t: 'w', v: text.slice(i, j), line, file });
        i = j;
      }
    }
    return toks;
  }
  function nginxParse(sh, file, depth) {
    depth = depth || 0;
    const n = sh.fs.lookup(file);
    if (!n) return { err: `nginx: [emerg] open() "${file}" failed (2: No such file or directory)` };
    const toks = nginxLex(n.content || '', file);
    let p = 0;
    const parseBlock = (top) => {
      const dirs = [];
      while (p < toks.length) {
        const t = toks[p];
        if (t.t === '}') {
          if (top) return { err: `nginx: [emerg] unexpected "}" in ${t.file}:${t.line}` };
          p++;
          return { dirs };
        }
        if (t.t === ';' || t.t === '{') return { err: `nginx: [emerg] unexpected "${t.t}" in ${t.file}:${t.line}` };
        const name = t.v;
        const args = [];
        p++;
        while (p < toks.length && toks[p].t === 'w') args.push(toks[p++].v);
        const end = toks[p];
        if (!end) return { err: `nginx: [emerg] unexpected end of file, expecting ";" or "}" in ${t.file}:${t.line}` };
        if (!NGINX_DIRS.includes(name)) return { err: `nginx: [emerg] unknown directive "${name}" in ${t.file}:${t.line}` };
        if (end.t === '}') return { err: `nginx: [emerg] directive "${name}" is not terminated by ";" in ${t.file}:${t.line}` };
        if (end.t === ';') {
          p++;
          if (name === 'include' && depth < 4) {
            const pat = args[0];
            const dirp = VFS.dirname(pat.startsWith('/') ? pat : '/etc/nginx/' + pat);
            const re = LX.globToRegex(VFS.base(pat));
            const d = sh.fs.lookup(dirp);
            for (const k of d ? Object.keys(d.kids).sort() : []) if (re.test(k) && k !== 'mime.types') {
              const r = nginxParse(sh, dirp + '/' + k, depth + 1);
              if (r.err) return r;
              dirs.push(...r.dirs);
            }
            continue;
          }
          if (name === 'listen') { const bad = args.slice(1).find((x) => !/^(ssl|http2|quic|default_server|reuseport|proxy_protocol|deferred|bind|ipv6only=\w+|backlog=\d+|rcvbuf=\w+|sndbuf=\w+|fastopen=\d+|so_keepalive=\S+|setfib=\d+|accept_filter=\w+)$/.test(x)); if (bad) return { err: `nginx: [emerg] invalid parameter "${bad}" in ${t.file}:${t.line}` }; }
          if (['listen', 'root', 'server_name', 'proxy_pass', 'return', 'index', 'try_files'].includes(name) && !args.length) return { err: `nginx: [emerg] invalid number of arguments in "${name}" directive in ${t.file}:${t.line}` };
          dirs.push({ name, args, line: t.line, file: t.file });
        } else {
          p++;
          const b = parseBlock(false);
          if (b.err) return b;
          dirs.push({ name, args, block: b.dirs, line: t.line, file: t.file });
        }
      }
      if (!top) return { err: `nginx: [emerg] unexpected end of file, expecting "}" in ${file}:${toks.length ? toks[toks.length - 1].line : 1}` };
      return { dirs };
    };
    return parseBlock(true);
  }
  const nginxTop = (sh) => {
    // top-level file contains events/http blocks; parse and unwrap
    const r = nginxParse(sh, '/etc/nginx/nginx.conf', 0);
    if (r.err) return r;
    return r;
  };
  function nginxCheck(sh) {
    const r = (function () {
      const n = sh.fs.lookup('/etc/nginx/nginx.conf');
      if (!n) return { err: 'nginx: [emerg] open() "/etc/nginx/nginx.conf" failed (2: No such file or directory)' };
      // wrap to allow top-level termination quirks
      const toks = nginxLex(n.content, '/etc/nginx/nginx.conf');
      let depth = 0;
      for (const t of toks) {
        if (t.t === '{') depth++;
        if (t.t === '}') {
          depth--;
          if (depth < 0) return { err: `nginx: [emerg] unexpected "}" in /etc/nginx/nginx.conf:${t.line}` };
        }
      }
      return nginxParse(sh, '/etc/nginx/nginx.conf', 0);
    })();
    if (r.err) {
      // an include'd file can have unexpected } at its top level
      return r;
    }
    const http = r.dirs.find((d) => d.name === 'http');
    if (!http) return { err: 'nginx: [emerg] no "http" section in configuration' , dirs: r.dirs };
    const servers = [];
    const walkServers = (dirs) => {
      for (const d of dirs) if (d.name === 'server' && d.block) servers.push(d);
    };
    walkServers(http.block);
    // ssl cert checks
    for (const s of servers) {
      const crt = s.block.find((d) => d.name === 'ssl_certificate');
      const key = s.block.find((d) => d.name === 'ssl_certificate_key');
      for (const [d, kind] of [[crt, 'certificate'], [key, 'certificate key']]) {
        if (!d) continue;
        const f = sh.fs.lookup(d.args[0]);
        if (!f) return { err: `nginx: [emerg] cannot load ${kind} "${d.args[0]}": BIO_new_file() failed (SSL: error:80000002:system library::No such file or directory:calling fopen(${d.args[0]}, r) error:10000080:BIO routines::no such file)` };
      }
      if (s.block.some((d) => d.name === 'listen' && d.args.includes('ssl')) && !crt) return { err: `nginx: [emerg] no "ssl_certificate" is defined for the "listen ... ssl" directive in ${s.file}:${s.line}` };
    }
    return { dirs: r.dirs, http, servers };
  }
  const dget = (dirs, name) => (dirs.find((d) => d.name === name) || {}).args;
  function nginxApply(sh) {
    const r = nginxCheck(sh);
    if (r.err) return r;
    const conf = { servers: [] };
    for (const s of r.servers) {
      const listens = s.block.filter((d) => d.name === 'listen').map((d) => {
        const spec = d.args[0];
        const m = /^(?:(\[?[\d.:a-f*]+\]?):)?(\d+)$/.exec(spec);
        return { port: m ? +m[2] : 80, ssl: d.args.includes('ssl'), def: d.args.includes('default_server') };
      });
      if (!listens.length) listens.push({ port: 80, ssl: false });
      const locs = s.block.filter((d) => d.name === 'location' && d.block).map((d) => {
        let mod = 'prefix';
        let path = d.args[0];
        if (d.args[0] === '=') (mod = 'exact'), (path = d.args[1]);
        else if (d.args[0] === '~' || d.args[0] === '~*') (mod = 'regex'), (path = d.args[1]);
        else if (d.args[0] === '^~') (mod = 'prefix'), (path = d.args[1]);
        return { mod, path, dirs: d.block, ci: d.args[0] === '~*' };
      });
      conf.servers.push({ listens, names: (dget(s.block, 'server_name') || ['_']).filter(Boolean), root: (dget(s.block, 'root') || ['/var/www/html'])[0], index: dget(s.block, 'index') || ['index.html', 'index.htm'], dirs: s.block, locs, cert: (dget(s.block, 'ssl_certificate') || [null])[0] });
    }
    // bind check
    const ports = new Set();
    for (const s of conf.servers) for (const l of s.listens) ports.add(l.port);
    for (const port of ports) {
      const ex = sh.listeners[port];
      if (ex && ex.proc !== 'nginx') return { err: `nginx: [emerg] bind() to 0.0.0.0:${port} failed (98: Address already in use)` };
      if (LX.selinuxPortCheck && !LX.selinuxPortCheck(sh, port, 'nginx', 'httpd_t', 'http_port_t')) return { err: `nginx: [emerg] bind() to 0.0.0.0:${port} failed (13: Permission denied)` };
    }
    sh.nginxConf = conf;
    for (const [p, l] of Object.entries(sh.listeners)) if (l.proc === 'nginx') delete sh.listeners[p];
    for (const port of ports) {
      const tls = conf.servers.some((s) => s.listens.some((l) => l.port === port && l.ssl));
      const certSrv = conf.servers.find((s) => s.listens.some((l) => l.port === port && l.ssl));
      sh.listeners[port] = { proto: 'tcp', proc: 'nginx', pid: 880, user: 'root', tls, certId: certSrv && certSrv.cert, server: 'nginx/1.24.0 (Ubuntu)', handler: (req) => nginxHandle(sh, req) };
    }
    return { ok: true };
  }
  function accessLog(sh, file, req, status, bytes, ua) {
    const n = sh.fs.lookup(file);
    if (!n) return;
    const remote = req.ip && req.ip.startsWith('127.') ? '127.0.0.1' : '192.168.1.5';
    n.content += `${remote} - - [${U.strftime('%d/%b/%Y:%H:%M:%S %z', new Date())}] "${req.method} ${req.path} HTTP/1.1" ${status} ${bytes} "-" "${req.ua || ua || 'curl/8.5.0'}"\n`;
  }
  function errLog(sh, file, level, msg, req) {
    const n = sh.fs.lookup(file);
    if (n) n.content += `${U.strftime('%Y/%m/%d %H:%M:%S', new Date())} [${level}] 881#881: *1 ${msg}, client: ${req.ip && req.ip.startsWith('127.') ? '127.0.0.1' : '192.168.1.5'}, server: ${req.host}, request: "${req.method} ${req.path} HTTP/1.1", host: "${req.host}"\n`;
  }
  const ERR_PAGES = (code, server) => `<html>\r\n<head><title>${code} ${LX.REASON[code]}</title></head>\r\n<body>\r\n<center><h1>${code} ${LX.REASON[code]}</h1></center>\r\n<hr><center>${server}</center>\r\n</body>\r\n</html>\r\n`;
  const mime = (p) => (/\.html?$/.test(p) ? 'text/html' : /\.css$/.test(p) ? 'text/css' : /\.js$/.test(p) ? 'application/javascript' : /\.json$/.test(p) ? 'application/json' : /\.(png|jpe?g|gif)$/.test(p) ? 'image/' + p.split('.').pop() : /\.txt$/.test(p) ? 'text/plain' : 'application/octet-stream');
  function serveFile(sh, root, uriPath, indexes, opts) {
    // returns {status, body, ct, err}
    const clean = uriPath.split('?')[0].replace(/\.\.\//g, '');
    const full = VFS.norm('.' + clean, root.startsWith('/') ? root : '/' + root);
    const user = opts.user;
    const groups = sh.groupsOf(user);
    // traverse permission
    const parts = full.split('/').filter(Boolean);
    let cur = '';
    for (let i = 0; i < parts.length - 1; i++) {
      cur += '/' + parts[i];
      const dn = sh.fs.lookup(cur);
      if (dn && dn.t === 'd' && !VFS.can(dn, user, groups, 1)) return { status: 403, why: `13: Permission denied`, path: full };
    }
    let n = sh.fs.lookup(full);
    let path = full;
    if (n && n.t === 'd') {
      if (!VFS.can(n, user, groups, 1)) return { status: 403, why: '13: Permission denied', path: full };
      if (!clean.endsWith('/') && clean !== '') return { status: 301, loc: clean + '/' };
      const idx = indexes.find((i) => sh.fs.lookup(full + '/' + i));
      if (idx) {
        path = full + '/' + idx;
        n = sh.fs.lookup(path);
      } else if (opts.autoindex) {
        return { status: 200, ct: 'text/html', body: `<html><head><title>Index of ${clean}</title></head><body><h1>Index of ${clean}</h1><hr><pre>${Object.keys(n.kids).sort().map((k) => `<a href="${k}">${k}</a>`).join('\n')}</pre><hr></body></html>\n` };
      } else return { status: 403, why: `directory index of "${full}/" is forbidden`, path: full, plain: true };
    }
    if (!n) return { status: 404, why: `2: No such file or directory`, path: full };
    if (!VFS.can(n, user, groups, 4)) return { status: 403, why: '13: Permission denied', path };
    if (sh.selinux && sh.selinux.mode !== 'disabled' && opts.selinux) {
      const ctx = LX.ctxOf(sh, n, path);
      if (!/httpd_sys_(content|rw_content|ra_content)_t|httpd_user_content_t|httpd_sys_script_exec_t/.test(ctx)) {
        const enforcing = sh.selinux.mode === 'enforcing';
        if (LX.avc) LX.avc(sh, { perm: 'read', comm: opts.comm, name: VFS.base(path), tctx: ctx, tclass: 'file', ino: LX.ino ? LX.ino(n) : 1, enforcing });
        if (enforcing) return { status: 403, why: '13: Permission denied (SELinux)', path };
      }
    }
    return { status: 200, ct: mime(path), body: n.bin ? '[binary data]' : n.content || '' };
  }
  async function nginxHandle(sh, req) {
    const conf = sh.nginxConf;
    const SERVER = 'nginx/1.24.0 (Ubuntu)';
    const hostName = (req.host || '').split(':')[0].toLowerCase();
    const cand = conf.servers.filter((s) => s.listens.some((l) => l.port === req.port));
    let srv = cand.find((s) => s.names.some((n) => n.toLowerCase() === hostName)) || cand.find((s) => s.names.some((n) => n.startsWith('*.') && hostName.endsWith(n.slice(1)))) || cand.find((s) => s.listens.some((l) => l.port === req.port && l.def)) || cand[0];
    if (!srv) return { status: 404, headers: { Server: SERVER }, body: ERR_PAGES(404, 'nginx') };
    const pth = req.path.split('?')[0];
    let loc = srv.locs.find((l) => l.mod === 'exact' && l.path === pth);
    if (!loc) {
      const pre = srv.locs.filter((l) => l.mod === 'prefix' && pth.startsWith(l.path)).sort((a, b) => b.path.length - a.path.length)[0];
      const rx = srv.locs.find((l) => l.mod === 'regex' && new RegExp(l.path, l.ci ? 'i' : '').test(pth));
      loc = rx || pre;
    }
    const dirs = loc ? loc.dirs : [];
    const all = (name) => dget(dirs, name) || dget(srv.dirs, name);
    const accessFile = (dget(srv.dirs, 'access_log') || ['/var/log/nginx/access.log'])[0];
    const finish = (status, body, headers, why) => {
      accessLog(sh, accessFile === 'off' ? null : '/var/log/nginx/access.log', req, status, (body || '').length);
      if (why) errLog(sh, '/var/log/nginx/error.log', status === 404 ? 'error' : status === 502 ? 'error' : 'error', why, req);
      return { status, headers: Object.assign({ Server: SERVER, 'Content-Type': 'text/html' }, headers || {}), body };
    };
    const ret = dget(srv.dirs, 'return') || dget(dirs, 'return');
    if (ret) {
      const code = +ret[0];
      if (code >= 300 && code < 400) return finish(code, ERR_PAGES(code, 'nginx'), { Location: ret[1].replace('$request_uri', req.path).replace('$host', hostName) });
      return finish(code, (ret[1] || '') + (ret[1] ? '\n' : ''), { 'Content-Type': 'text/plain' });
    }
    const pp = dget(dirs, 'proxy_pass');
    if (pp) {
      const m = /^https?:\/\/([^:/]+)(?::(\d+))?(\/.*)?$/.exec(pp[0]);
      if (!m) return finish(500, ERR_PAGES(500, 'nginx'), {}, 'invalid proxy_pass');
      const up = m[1] === 'localhost' || m[1] === '127.0.0.1' ? sh.listeners[+(m[2] || 80)] : null;
      if (LX.selinuxConnectCheck && up && up.handler && !LX.selinuxConnectCheck(sh, +(m[2] || 80), 'nginx', 'httpd_t')) return finish(502, ERR_PAGES(502, 'nginx'), {}, `connect() to ${m[1] === 'localhost' ? '127.0.0.1' : m[1]}:${m[2] || 80} failed (13: Permission denied) while connecting to upstream, upstream: "${pp[0]}${req.path}"`);
      if (!up || !up.handler || up.proc === 'nginx' && +(m[2] || 80) === req.port) return finish(502, ERR_PAGES(502, 'nginx'), {}, `connect() failed (111: Connection refused) while connecting to upstream, upstream: "${pp[0]}${req.path}"`);
      const res = await up.handler({ method: req.method, path: m[3] !== undefined && loc && loc.mod === 'prefix' ? m[3].replace(/\/$/, '') + '/' + pth.slice(loc.path.length).replace(/^\//, '') + (req.path.includes('?') ? req.path.slice(req.path.indexOf('?')) : '') : req.path, host: m[1], headers: req.headers, body: req.body, port: +(m[2] || 80), ip: '127.0.0.1', ua: req.ua });
      return finish(res.status, res.body, Object.assign({}, res.headers, { Server: SERVER }));
    }
    const root = (all('root') || ['/var/www/html'])[0];
    const aliasD = dget(dirs, 'alias');
    const idx = all('index') || ['index.html', 'index.htm'];
    const auto = (dget(dirs, 'autoindex') || dget(srv.dirs, 'autoindex') || ['off'])[0] === 'on';
    const tf = dget(dirs, 'try_files');
    let uri = pth;
    let effRoot = root;
    if (aliasD && loc) {
      effRoot = aliasD[0];
      uri = '/' + pth.slice(loc.path.length);
    }
    if (tf && !aliasD) {
      for (const t of tf) {
        if (t.startsWith('=')) return finish(+t.slice(1), ERR_PAGES(+t.slice(1), 'nginx'), {}, `open() "${VFS.norm('.' + pth, root)}" failed (2: No such file or directory)`);
        const p2 = t.replace('$uri', pth).replace('$uri/', pth + '/');
        if (sh.fs.lookup(VFS.norm('.' + p2.split('?')[0], root))) {
          uri = p2.startsWith('/') ? p2 : '/' + p2;
          break;
        }
        if (t === tf[tf.length - 1] && t.startsWith('/')) uri = t;
      }
    }
    const r = serveFile(sh, effRoot, uri, idx, { autoindex: auto, user: 'www-data', selinux: true, comm: 'nginx' });
    if (r.status === 301) return finish(301, ERR_PAGES(301, 'nginx'), { Location: `http://${req.host}${r.loc}` });
    if (r.status === 200) return finish(200, r.body, { 'Content-Type': r.ct });
    return finish(r.status, ERR_PAGES(r.status, 'nginx'), {}, r.status === 404 ? `open() "${r.path}" failed (${r.why})` : r.plain ? r.why : `open() "${r.path}" failed (${r.why})`);
  }
  const NGINX_CONF = 'user www-data;\nworker_processes auto;\npid /run/nginx.pid;\nerror_log /var/log/nginx/error.log;\ninclude /etc/nginx/modules-enabled/*.conf;\n\nevents {\n\tworker_connections 768;\n}\n\nhttp {\n\tsendfile on;\n\ttcp_nopush on;\n\ttypes_hash_max_size 2048;\n\n\tinclude /etc/nginx/mime.types;\n\tdefault_type application/octet-stream;\n\n\taccess_log /var/log/nginx/access.log;\n\n\tgzip on;\n\n\tinclude /etc/nginx/conf.d/*.conf;\n\tinclude /etc/nginx/sites-enabled/*;\n}\n';
  const NGINX_DEFAULT = '##\n# Default server configuration\n##\nserver {\n\tlisten 80 default_server;\n\tlisten [::]:80 default_server;\n\n\troot /var/www/html;\n\n\t# Add index.php to the list if you are using PHP\n\tindex index.html index.htm index.nginx-debian.html;\n\n\tserver_name _;\n\n\tlocation / {\n\t\t# First attempt to serve request as file, then\n\t\t# as directory, then fall back to displaying a 404.\n\t\ttry_files $uri $uri/ =404;\n\t}\n}\n';
  const WELCOME = '<!DOCTYPE html>\n<html>\n<head>\n<title>Welcome to nginx!</title>\n</head>\n<body>\n<h1>Welcome to nginx!</h1>\n<p>If you see this page, the nginx web server is successfully installed and\nworking. Further configuration is required.</p>\n<p><em>Thank you for using nginx.</em></p>\n</body>\n</html>\n';
  function setupNginx(sh) {
    const o = { owner: 'root', group: 'root' };
    sh.fs.put('/etc/nginx/nginx.conf', NGINX_CONF, o);
    sh.fs.put('/etc/nginx/mime.types', 'types {\n    text/html html htm;\n    text/css css;\n}\n', o);
    sh.fs.mkdirp('/etc/nginx/conf.d', o);
    sh.fs.mkdirp('/etc/nginx/modules-enabled', o);
    sh.fs.mkdirp('/etc/nginx/sites-available', o);
    sh.fs.mkdirp('/etc/nginx/sites-enabled', o);
    sh.fs.put('/etc/nginx/sites-available/default', NGINX_DEFAULT, o);
    sh.fs.lookup('/etc/nginx/sites-enabled').kids.default = sh.fs.mk('l', { target: '/etc/nginx/sites-available/default', owner: 'root', group: 'root', mode: 0o777 });
    sh.fs.mkdirp('/var/www/html', o);
    sh.fs.put('/var/www/html/index.nginx-debian.html', WELCOME, Object.assign({ mode: 0o644 }, o));
    sh.fs.mkdirp('/var/log/nginx', { owner: 'www-data', group: 'adm', mode: 0o755 });
    sh.fs.put('/var/log/nginx/access.log', '', { owner: 'www-data', group: 'adm', mode: 0o640 });
    sh.fs.put('/var/log/nginx/error.log', '', { owner: 'www-data', group: 'adm', mode: 0o640 });
    const s = sh.services.nginx;
    if (s && s.active) nginxApply(sh);
  }
  LX.initHooks.push((sh) => {
    sh.serviceHooks.nginx = async (c, action) => {
      if (action === 'stop') {
        for (const [p, l] of Object.entries(sh.listeners)) if (l.proc === 'nginx') delete sh.listeners[p];
        return { ok: true };
      }
      const r = nginxApply(sh);
      if (r.err) {
        sh.logEvent('nginx.service', 3, r.err.replace(/^nginx: /, ''), { ident: 'nginx', pid: 2401 });
        if (c.err) c.err(r.err + '\n');
        return { ok: false, code: 1 };
      }
      return { ok: true };
    };
  });
  const prevInstall = P.onInstall;
  P.onInstall = function (p, pk) {
    prevInstall.call(this, p, pk);
    if (p === 'nginx') setupNginx(this);
    if (p === 'apache2') setupApache(this);
  };
  def('nginx', async (c, args) => {
    const sh = c.sh;
    if (args.includes('-v')) return c.err('nginx version: nginx/1.24.0 (Ubuntu)\n');
    if (args.includes('-V')) return c.err('nginx version: nginx/1.24.0 (Ubuntu)\nbuilt with OpenSSL 3.0.13 30 Jan 2024\n');
    if (needRoot(c, 'nginx: [alert] could not open error log file: open() "/var/log/nginx/error.log" failed (13: Permission denied)\nnginx: [warn] the "user" directive makes sense only if the master process runs with super-user privileges, ignored in /etc/nginx/nginx.conf:1\nnginx: [emerg] open() "/run/nginx.pid" failed (13: Permission denied)\n')) return 1;
    if (args.includes('-t') || args.includes('-T')) {
      const r = nginxCheck(sh);
      if (r.err) {
        c.err(r.err + '\nnginx: configuration file /etc/nginx/nginx.conf test failed\n');
        return 1;
      }
      c.err('nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful\n');
      if (args.includes('-T')) c.out(sh.fs.lookup('/etc/nginx/nginx.conf').content);
      return 0;
    }
    const si = args.indexOf('-s');
    if (si >= 0) {
      const act = args[si + 1];
      if (act === 'reload') return (await sh.dispatch(['systemctl', 'reload', 'nginx'], c.io));
      if (act === 'stop' || act === 'quit') return (await sh.dispatch(['systemctl', 'stop', 'nginx'], c.io));
    }
    return (await sh.dispatch(['systemctl', 'start', 'nginx'], c.io));
  }, { pkg: 'nginx' });

  /* ======================= Apache ======================= */
  function setupApache(sh) {
    const o = { owner: 'root', group: 'root' };
    sh.fs.mkdirp('/etc/apache2/sites-available', o);
    sh.fs.mkdirp('/etc/apache2/sites-enabled', o);
    sh.fs.mkdirp('/etc/apache2/mods-enabled', o);
    sh.fs.put('/etc/apache2/apache2.conf', 'DefaultRuntimeDir ${APACHE_RUN_DIR}\nPidFile ${APACHE_PID_FILE}\nTimeout 300\nKeepAlive On\nUser ${APACHE_RUN_USER}\nGroup ${APACHE_RUN_GROUP}\nErrorLog ${APACHE_LOG_DIR}/error.log\nLogLevel warn\nIncludeOptional mods-enabled/*.load\nInclude ports.conf\nIncludeOptional sites-enabled/*.conf\n', o);
    sh.fs.put('/etc/apache2/ports.conf', 'Listen 80\n\n<IfModule ssl_module>\n\tListen 443\n</IfModule>\n', o);
    sh.fs.put('/etc/apache2/sites-available/000-default.conf', '<VirtualHost *:80>\n\tServerAdmin webmaster@localhost\n\tDocumentRoot /var/www/html\n\tErrorLog ${APACHE_LOG_DIR}/error.log\n\tCustomLog ${APACHE_LOG_DIR}/access.log combined\n</VirtualHost>\n', o);
    sh.fs.lookup('/etc/apache2/sites-enabled').kids['000-default.conf'] = sh.fs.mk('l', { target: '../sites-available/000-default.conf', owner: 'root', group: 'root', mode: 0o777 });
    sh.fs.mkdirp('/var/www/html', o);
    sh.fs.put('/var/www/html/index.html', '<html><body><h1>Apache2 Ubuntu Default Page</h1><p>It works!</p></body></html>\n', Object.assign({ mode: 0o644 }, o));
    sh.fs.mkdirp('/var/log/apache2', { owner: 'root', group: 'adm', mode: 0o750 });
    sh.fs.put('/var/log/apache2/access.log', '', { owner: 'root', group: 'adm', mode: 0o640 });
    sh.fs.put('/var/log/apache2/error.log', '', { owner: 'root', group: 'adm', mode: 0o640 });
    const s = sh.services.apache2;
    if (s) {
      s.active = false;
      sh.serviceHooks.apache2({ out() {}, err() {} }, 'start').then((r) => {
        s.active = r.ok;
      });
    }
  }
  const APACHE_DIRS = ['serveradmin', 'documentroot', 'servername', 'serveralias', 'errorlog', 'customlog', 'loglevel', 'directoryindex', 'options', 'allowoverride', 'require', 'redirect', 'rewriteengine', 'rewriterule', 'listen', 'timeout', 'keepalive', 'user', 'group', 'pidfile', 'defaultruntimedir', 'include', 'includeoptional', 'loadmodule', 'proxypass', 'proxypassreverse', 'header', 'sslengine', 'sslcertificatefile', 'sslcertificatekeyfile', 'errordocument', 'alias', 'addtype'];
  function apacheParse(sh) {
    const ports = [];
    const pf = sh.fs.lookup('/etc/apache2/ports.conf');
    for (const l of ((pf && pf.content) || '').split('\n')) {
      const m = /^\s*Listen\s+(\d+)/.exec(l);
      if (m) ports.push(+m[1]);
    }
    const vhosts = [];
    const dir = sh.fs.lookup('/etc/apache2/sites-enabled');
    for (const k of dir ? Object.keys(dir.kids).sort() : []) {
      const f = sh.fs.lookup('/etc/apache2/sites-enabled/' + k);
      if (!f) return { err: `AH00526: Syntax error on line 1 of /etc/apache2/sites-enabled/${k}:\nbad link` };
      const lines = f.content.split('\n');
      let cur = null;
      const stack = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (!l || l.startsWith('#')) continue;
        let m = /^<VirtualHost\s+([^>]+)>$/i.exec(l);
        if (m) {
          cur = { addr: m[1], dirs: {}, file: k };
          stack.push('VirtualHost');
          continue;
        }
        m = /^<(Directory|Location|IfModule|Files)\s*[^>]*>$/i.exec(l);
        if (m) {
          stack.push(m[1]);
          continue;
        }
        m = /^<\/(\w+)>$/.exec(l);
        if (m) {
          const top = stack.pop();
          if (!top || top.toLowerCase() !== m[1].toLowerCase()) return { err: `AH00526: Syntax error on line ${i + 1} of /etc/apache2/sites-enabled/${k}:\n</${m[1]}> without matching <${m[1]}> section` };
          if (m[1].toLowerCase() === 'virtualhost') {
            vhosts.push(cur);
            cur = null;
          }
          continue;
        }
        const w = l.split(/\s+/);
        if (!APACHE_DIRS.includes(w[0].toLowerCase())) return { err: `AH00526: Syntax error on line ${i + 1} of /etc/apache2/sites-enabled/${k}:\nInvalid command '${w[0]}', perhaps misspelled or defined by a module not included in the server configuration` };
        if (cur) cur.dirs[w[0].toLowerCase()] = w.slice(1).join(' ');
      }
      if (stack.length) return { err: `AH00526: Syntax error on line ${lines.length} of /etc/apache2/sites-enabled/${k}:\n<${stack[stack.length - 1]}> directive missing closing '>'` };
    }
    return { ports: ports.length ? ports : [80], vhosts };
  }
  LX.initHooks.push((sh) => {
    sh.serviceHooks.apache2 = async (c, action) => {
      if (action === 'stop') {
        for (const [p, l] of Object.entries(sh.listeners)) if (l.proc === 'apache2') delete sh.listeners[p];
        return { ok: true };
      }
      const r = apacheParse(sh);
      if (r.err) {
        sh.logEvent('apache2.service', 3, r.err.split('\n')[0], { ident: 'apachectl', pid: 2501 });
        return { ok: false, code: 1 };
      }
      for (const port of r.ports) {
        const ex = sh.listeners[port];
        if (ex && ex.proc !== 'apache2') {
          sh.logEvent('apache2.service', 3, `(98)Address already in use: AH00072: make_sock: could not bind to address [::]:${port}`, { ident: 'apachectl', pid: 2501 });
          return { ok: false, code: 1 };
        }
      }
      for (const [p, l] of Object.entries(sh.listeners)) if (l.proc === 'apache2') delete sh.listeners[p];
      for (const port of r.ports) {
        sh.listeners[port] = { proto: 'tcp', proc: 'apache2', pid: 910, user: 'root', server: 'Apache/2.4.58 (Ubuntu)', handler: async (req) => apacheHandle(sh, req, r) };
      }
      return { ok: true };
    };
  });
  function apacheHandle(sh, req, cfg) {
    const SERVER = 'Apache/2.4.58 (Ubuntu)';
    const hostName = (req.host || '').split(':')[0].toLowerCase();
    const vh = cfg.vhosts.filter((v) => new RegExp(':(\\*|' + req.port + ')$').test(v.addr) || v.addr === '*');
    const v = vh.find((x) => (x.dirs.servername || '').toLowerCase() === hostName || (x.dirs.serveralias || '').toLowerCase().split(/\s+/).includes(hostName)) || vh[0];
    const log = (st, len) => {
      const n = sh.fs.lookup('/var/log/apache2/access.log');
      if (n) n.content += `${req.ip && req.ip.startsWith('127.') ? '127.0.0.1' : '192.168.1.5'} - - [${U.strftime('%d/%b/%Y:%H:%M:%S %z', new Date())}] "${req.method} ${req.path} HTTP/1.1" ${st} ${len} "-" "${req.ua || 'curl/8.5.0'}"\n`;
    };
    const page = (code) => `<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">\n<html><head>\n<title>${code} ${LX.REASON[code]}</title>\n</head><body>\n<h1>${LX.REASON[code]}</h1>\n<hr>\n<address>${SERVER} Server at ${req.host} Port ${req.port}</address>\n</body></html>\n`;
    if (!v) {
      log(404, 0);
      return { status: 404, headers: { Server: SERVER, 'Content-Type': 'text/html' }, body: page(404) };
    }
    const root = v.dirs.documentroot || '/var/www/html';
    const r = serveFile(sh, root, req.path, (v.dirs.directoryindex || 'index.html').split(/\s+/), { autoindex: false, user: 'www-data', selinux: true, comm: 'httpd' });
    if (r.status === 200) {
      log(200, r.body.length);
      return { status: 200, headers: { Server: SERVER, 'Content-Type': r.ct }, body: r.body };
    }
    const er = sh.fs.lookup('/var/log/apache2/error.log');
    if (er) er.content += `[${U.strftime('%a %b %d %H:%M:%S.000000 %Y', new Date())}] [core:error] [pid 910] [client 127.0.0.1:50000] AH00128: File does not exist: ${r.path || root + req.path}\n`;
    log(r.status, 0);
    return { status: r.status === 301 ? 301 : r.status, headers: { Server: SERVER, 'Content-Type': 'text/html', Location: r.loc }, body: page(r.status === 301 ? 301 : r.status) };
  }
  const apachectl = async (c, args) => {
    const sh = c.sh;
    if (args.includes('configtest') || args.includes('-t')) {
      const r = apacheParse(sh);
      if (r.err) {
        c.err(r.err + '\nAction \'configtest\' failed.\nThe Apache error log may have more information.\n');
        return 1;
      }
      c.err('Syntax OK\n');
      return 0;
    }
    if (['start', 'stop', 'restart', 'graceful'].includes(args[0])) return sh.dispatch(['systemctl', args[0] === 'graceful' ? 'reload' : args[0], 'apache2'], c.io);
    if (args.includes('-v')) return c.out('Server version: Apache/2.4.58 (Ubuntu)\n');
    c.out('Usage: apache2ctl start|stop|restart|configtest\n');
  };
  def('apache2ctl', apachectl, { pkg: 'apache2' });
  def('apachectl', apachectl, { pkg: 'apache2' });
  def('apache2', apachectl, { pkg: 'apache2' });
  const a2 = (kind, enable) => async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, `ERROR: This script needs root rights. Try running it with sudo.\n`.replace('This script', 'Your user does not have permission; this command')) ) return 1;
    const name = args[0];
    if (kind === 'mod') {
      c.out(`Enabling module ${name}.\nTo activate the new configuration, you need to run:\n  systemctl restart apache2\n`);
      return 0;
    }
    const av = sh.fs.lookup('/etc/apache2/sites-available/' + (name.endsWith('.conf') ? name : name + '.conf'));
    if (enable && !av) {
      c.err(`ERROR: Site ${name} does not exist!\n`);
      return 1;
    }
    const f = name.endsWith('.conf') ? name : name + '.conf';
    const en = sh.fs.lookup('/etc/apache2/sites-enabled');
    if (enable) en.kids[f] = sh.fs.mk('l', { target: '../sites-available/' + f, owner: 'root', group: 'root', mode: 0o777 });
    else delete en.kids[f];
    c.out(`${enable ? 'Enabling' : 'Disabling'} site ${name}.\nTo activate the new configuration, you need to run:\n  systemctl reload apache2\n`);
    return 0;
  };
  def('a2ensite', a2('site', true), { pkg: 'apache2' });
  def('a2dissite', a2('site', false), { pkg: 'apache2' });
  def('a2enmod', a2('mod', true), { pkg: 'apache2' });

  /* ======================= python http.server ======================= */
  function dirHandler(sh, dir) {
    return async (req) => {
      const SERVER = 'SimpleHTTP/0.6 Python/3.12.3';
      const path = decodeURIComponent(req.path.split('?')[0]);
      const full = VFS.norm('.' + path, dir);
      let n = sh.fs.lookup(full);
      let full2 = full;
      if (n && n.t === 'd') for (const ix of ['index.html', 'index.htm']) if (n.kids[ix] && n.kids[ix].t === 'f') { n = n.kids[ix]; full2 = full.replace(/\/$/, '') + '/' + ix; break; }
      const hdr = { Server: SERVER, 'Content-Type': 'text/html; charset=utf-8' };
      if (!n) return { status: 404, headers: hdr, body: `<!DOCTYPE HTML>\n<html lang="en">\n    <head><meta charset="utf-8"><title>Error response</title></head>\n    <body>\n        <h1>Error response</h1>\n        <p>Error code: 404</p>\n        <p>Message: File not found.</p>\n    </body>\n</html>\n` };
      if (n.t === 'd') {
        const names = Object.keys(n.kids).filter((k) => !k.startsWith('.')).sort();
        return { status: 200, headers: hdr, body: `<!DOCTYPE HTML>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Directory listing for ${path}</title>\n</head>\n<body>\n<h1>Directory listing for ${path}</h1>\n<hr>\n<ul>\n${names.map((k) => `<li><a href="${k}${n.kids[k].t === 'd' ? '/' : ''}">${k}${n.kids[k].t === 'd' ? '/' : ''}</a></li>`).join('\n')}\n</ul>\n<hr>\n</body>\n</html>\n` };
      }
      return { status: 200, headers: Object.assign({}, hdr, { 'Content-Type': mime(full2) }), body: n.bin ? '[binary data]' : n.content || '' };
    };
  }
  LX.onBgStart = (sh, job, words) => {
    if (words[0] === 'python3' && words.includes('http.server')) {
      const port = +(words[words.indexOf('http.server') + 1] && /^\d+$/.test(words[words.indexOf('http.server') + 1]) ? words[words.indexOf('http.server') + 1] : 8000);
      if (sh.listeners[port]) return;
      const di = words.indexOf('--directory');
      const dir = di >= 0 ? sh.abs(words[di + 1]) : sh.cwd;
      job.port = port;
      sh.listeners[port] = { proto: 'tcp', proc: 'python3', pid: job.pid, user: sh.user, handler: dirHandler(sh, dir) };
    }
  };
  const origPy = LX.cmds.python3.run;
  def('python3', async (c, args) => {
    const sh = c.sh;
    const mi = args.indexOf('-m');
    if (mi >= 0 && args[mi + 1] === 'http.server') {
      const pa = args[mi + 2];
      const port = pa && /^\d+$/.test(pa) ? +pa : 8000;
      if (sh.listeners[port]) {
        c.err(`Traceback (most recent call last):\n  File "<frozen runpy>", line 198, in _run_module_as_main\nOSError: [Errno 98] Address already in use\n`);
        return 1;
      }
      const di = args.indexOf('--directory');
      sh.listeners[port] = { proto: 'tcp', proc: 'python3', pid: sh.nextPid++, user: sh.user, handler: dirHandler(sh, di >= 0 ? sh.abs(args[di + 1]) : sh.cwd) };
      c.out(`Serving HTTP on 0.0.0.0 port ${port} (http://0.0.0.0:${port}/) ...\n`);
      try {
        await sh.waitMs(1e9);
      } catch (e) {
        if (!(e instanceof LX.AbortSig)) throw e;
        delete sh.listeners[port];
        c.out('\nKeyboard interrupt received, exiting.\n');
        sh.aborted = false;
      }
      delete sh.listeners[port];
      return 0;
    }
    return origPy(c, args);
  });

  LX.PKGS = LX.PKGS || {};
  Object.assign(LX.PKGS, {
    apache2: { ver: '2.4.58-1ubuntu8.4', desc: 'Apache HTTP Server', size: 1360, bins: ['apache2ctl', 'apachectl', 'apache2', 'a2ensite', 'a2dissite', 'a2enmod'], service: { desc: 'The Apache HTTP Server', proc: 'apache2' } },
    ufw: { ver: '0.36.2-6', desc: 'program for managing a Netfilter firewall', size: 169, bins: ['ufw'] },
    firewalld: { ver: '2.1.1-1', desc: 'Dynamic Firewall Manager', size: 810, bins: ['firewall-cmd'], service: { desc: 'firewalld - dynamic firewall daemon', proc: 'firewalld' } },
    tcpdump: { ver: '4.99.4-3ubuntu4', desc: 'command-line network traffic analyzer', size: 490, bins: ['tcpdump'] },
    nmap: { ver: '7.94+git20230807.3be01efb1+dfsg-3build2', desc: 'The Network Mapper', size: 1800, bins: ['nmap'] },
    traceroute: { ver: '1:2.1.5-1', desc: 'Traces the route taken by packets over an IPv4/IPv6 network', size: 50, bins: ['traceroute'] },
    ipcalc: { ver: '0.51-1', desc: 'parameter calculator for IPv4 addresses', size: 18, bins: ['ipcalc'] },
    'network-manager': { ver: '1.46.0-1ubuntu2', desc: 'network management framework (daemon and userspace tools)', size: 2900, bins: ['nmcli'], service: { desc: 'Network Manager', proc: 'NetworkManager' } },
    sysstat: { ver: '12.6.1-2', desc: 'system performance tools for Linux', size: 560, bins: ['iostat', 'sar', 'mpstat'] },
    stress: { ver: '1.0.7-1', desc: 'tool to impose load on and stress test systems', size: 20, bins: ['stress'] },
    at: { ver: '3.2.5-2ubuntu3', desc: 'Delayed job execution and batch processing', size: 60, bins: ['at', 'atq', 'atrm'], service: { desc: 'Deferred execution scheduler', proc: 'atd' } },
    tuned: { ver: '2.22.1-1', desc: 'Daemon that performs system tuning', size: 400, bins: ['tuned-adm'], service: { desc: 'Dynamic System Tuning Daemon', proc: 'tuned' } },
    chrony: { ver: '4.5-1ubuntu4', desc: 'Versatile implementation of the Network Time Protocol', size: 320, bins: ['chronyc'], service: { desc: 'chrony, an NTP client/server', proc: 'chronyd' } },
    nftables: { ver: '1.0.9-1build1', desc: 'Program to control packet filtering rules by Netfilter project', size: 70, bins: ['nft'] },
    screen: { ver: '4.9.1-1build1', desc: 'terminal multiplexer with VT100/ANSI terminal emulation', size: 600, bins: ['screen'] },
  });
  for (const p of ['ufw', 'nftables']) if (!LX.DEFAULT_PKGS.includes(p)) LX.DEFAULT_PKGS.push(p);
  LX.cmds.tmux.pkg = 'tmux';
})();
