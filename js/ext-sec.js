/* Linux Academy: security tooling (hashes, openssl, gpg, auditd, fail2ban, capabilities, updates, PAM files) */
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
  const rnd = (n, set) => Array.from({ length: n }, () => (set || 'abcdef0123456789')[Math.floor(Math.random() * (set ? set.length : 16))]).join('');

  /* ---------- hashing ---------- */
  function md5(str) {
    const bytes = new TextEncoder().encode(str);
    const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
    const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    const len = bytes.length;
    const padLen = (((len + 8) >> 6) + 1) << 6;
    const buf = new Uint8Array(padLen);
    buf.set(bytes);
    buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(padLen - 8, (len * 8) >>> 0, true);
    dv.setUint32(padLen - 4, Math.floor((len * 8) / 4294967296), true);
    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;
    for (let o = 0; o < padLen; o += 64) {
      const M = Array.from({ length: 16 }, (_, i) => dv.getUint32(o + i * 4, true));
      let A = a0;
      let B = b0;
      let C = c0;
      let D = d0;
      for (let i = 0; i < 64; i++) {
        let F;
        let g;
        if (i < 16) {
          F = (B & C) | (~B & D);
          g = i;
        } else if (i < 32) {
          F = (D & B) | (~D & C);
          g = (5 * i + 1) % 16;
        } else if (i < 48) {
          F = B ^ C ^ D;
          g = (3 * i + 5) % 16;
        } else {
          F = C ^ (B | ~D);
          g = (7 * i) % 16;
        }
        F = (F + A + K[i] + M[g]) >>> 0;
        A = D;
        D = C;
        C = B;
        B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
      }
      a0 = (a0 + A) >>> 0;
      b0 = (b0 + B) >>> 0;
      c0 = (c0 + C) >>> 0;
      d0 = (d0 + D) >>> 0;
    }
    return [a0, b0, c0, d0].map((x) => [0, 8, 16, 24].map((s) => ((x >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('');
  }
  LX.md5 = md5;
  async function digest(algo, text) {
    if (algo === 'md5') return md5(text);
    const buf = await globalThis.crypto.subtle.digest(algo, new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  LX.digest = digest;
  const sums = { md5sum: 'md5', sha1sum: 'SHA-1', sha256sum: 'SHA-256', sha384sum: 'SHA-384', sha512sum: 'SHA-512' };
  for (const [name, algo] of Object.entries(sums)) {
    def(name, async (c, args) => {
      const check = args.includes('-c') || args.includes('--check');
      const files = args.filter((a) => !a.startsWith('-'));
      let st = 0;
      if (check) {
        let bad = 0;
        let total = 0;
        for (const f of files) {
          let lines;
          try {
            lines = U.lines(c.sh.readFile(c.abs(f)));
          } catch (e) {
            c.err(`${name}: ${f}: No such file or directory\n`);
            return 1;
          }
          for (const l of lines) {
            const m = /^([0-9a-f]+)\s+\*?(.+)$/.exec(l);
            if (!m) continue;
            total++;
            let text;
            try {
              text = c.sh.readFile(c.abs(m[2]));
            } catch (e) {
              c.out(`${m[2]}: FAILED open or read\n`);
              bad++;
              continue;
            }
            const h = await digest(algo, text);
            if (h === m[1]) c.out(`${m[2]}: OK\n`);
            else {
              c.out(`${m[2]}: FAILED\n`);
              bad++;
            }
          }
        }
        if (bad) c.err(`${name}: WARNING: ${bad} computed checksum${bad > 1 ? 's' : ''} did NOT match\n`);
        return bad ? 1 : 0;
      }
      if (!files.length) {
        c.out(`${await digest(algo, await c.slurp())}  -\n`);
        return 0;
      }
      for (const f of files) {
        try {
          const n = c.sh.fs.lookup(c.abs(f));
          if (n && n.t === 'd') {
            c.err(`${name}: ${f}: Is a directory\n`);
            st = 1;
            continue;
          }
          c.out(`${await digest(algo, c.sh.readFile(c.abs(f)))}  ${f}\n`);
        } catch (e) {
          if (!(e instanceof FsErr)) throw e;
          c.err(`${name}: ${f}: ${U.errTxt(e)}\n`);
          st = 1;
        }
      }
      return st;
    });
  }
  def('cksum', async (c, args) => {
    for (const f of args) c.out(`${parseInt((await digest('md5', c.sh.readFile(c.abs(f)))).slice(0, 8), 16)} ${c.sh.readFile(c.abs(f)).length} ${f}\n`);
  });
  def('uuidgen', async (c) => c.out('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, () => rnd(1)) + '\n'));
  def('shred', async (c, args) => {
    for (const f of args.filter((a) => !a.startsWith('-'))) {
      try {
        c.sh.writeFile(c.abs(f), rnd(20, 'abcdefghijklmnop'), false);
        if (args.includes('-u')) c.sh.unlink(c.abs(f));
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`shred: ${f}: ${U.errTxt(e)}\n`);
        return 1;
      }
    }
  });

  /* ---------- openssl ---------- */
  const b64 = (t) => (typeof Buffer !== 'undefined' ? Buffer.from(t, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(t))));
  const PEM = (label, body) => `-----BEGIN ${label}-----\n${body.replace(/(.{64})/g, '$1\n').replace(/\n$/, '')}\n-----END ${label}-----\n`;
  def('openssl', async (c, args) => {
    const sh = c.sh;
    const sub = args[0];
    const g = (k) => {
      const i = args.indexOf(k);
      return i >= 0 ? args[i + 1] : undefined;
    };
    if (sub === 's_client') {
      const cI = args.indexOf('-connect');
      const target = cI >= 0 ? args[cI + 1] : args[1];
      const [host, portS] = String(target || '').split(':');
      const port = +portS || 443;
      const ip = sh.resolveHost(host);
      if (!ip) { c.err(`s_client: Name or service not known: ${host}\n`); return 1; }
      const st = LX.portState ? LX.portState(sh, ip, port) : 'open';
      if (st === 'refused') { c.err(`${host}:${port}:  connect:errno=111\n40E7B2E5A57F0000:error:8000006F:system library:BIO_connect:Connection refused:../crypto/bio/bio_sock2.c:114:calling connect()\nconnect:errno=111\n`); return 1; }
      if (st !== 'open') { c.err('connect: Connection timed out\nconnect:errno=110\n'); return 1; }
      const l = sh.listeners[port];
      if (l && !l.tls && ip.startsWith('127.') || (l && !l.tls)) { c.err('CONNECTED(00000003)\n40E7B2E5A57F0000:error:0A00010B:SSL routines:ssl3_get_record:wrong version number:../ssl/record/ssl3_record.c:354:\n---\nno peer certificate available\n---\nSSL handshake has read 5 bytes and written 295 bytes\n'); return 1; }
      c.out(`CONNECTED(00000003)\ndepth=0 CN = ${host}\nverify error:num=18:self-signed certificate\nverify return:1\ndepth=0 CN = ${host}\nverify return:1\n---\nCertificate chain\n 0 s:CN = ${host}\n   i:CN = ${host}\n   a:PKEY: rsaEncryption, 2048 (bit); sigalg: RSA-SHA256\n---\nServer certificate\n-----BEGIN CERTIFICATE-----\nMIIDCTCCAfGgAwIBAgIUR9sandboxCertificateDemoDataOnly0wDQYJKoZIhvcN\n-----END CERTIFICATE-----\nsubject=CN = ${host}\nissuer=CN = ${host}\n---\nSSL handshake has read 1342 bytes and written 405 bytes\nVerification error: self-signed certificate\n---\nNew, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384\nProtocol: TLSv1.3\n`);
      return 0;
    }
    if (sub === 'version') return c.out('OpenSSL 3.0.13 30 Jan 2024 (Library: OpenSSL 3.0.13 30 Jan 2024)\n');
    if (sub === 'rand') {
      const n = +args[args.length - 1] || 16;
      if (args.includes('-hex')) return c.out(rnd(n * 2) + '\n');
      if (args.includes('-base64')) return c.out(b64(rnd(n)) .slice(0, Math.ceil((n * 4) / 3)) + '\n');
      return c.out(rnd(n) + '\n');
    }
    if (sub === 'dgst') {
      const algo = (args.find((a) => /^-(md5|sha1|sha256|sha512)$/.test(a)) || '-sha256').slice(1);
      const f = args[args.length - 1];
      try {
        const h = await digest(algo === 'md5' ? 'md5' : { sha1: 'SHA-1', sha256: 'SHA-256', sha512: 'SHA-512' }[algo], sh.readFile(c.abs(f)));
        c.out(`${algo.toUpperCase().replace('SHA', 'SHA2-').replace('SHA2-1', 'SHA1')}(${f})= ${h}\n`);
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`Could not open file or uri for loading file ${f}\n`);
        return 1;
      }
      return 0;
    }
    if (sub === 'passwd') {
      const pw = args[args.length - 1];
      c.out(`$6$${rnd(8)}$${b64(pw + 'salt').replace(/=/g, '').slice(0, 40)}\n`);
      return 0;
    }
    if (sub === 'genrsa') {
      const out = g('-out');
      const bits = +args[args.length - 1] || 2048;
      const pem = PEM('PRIVATE KEY', b64(rnd(bits / 4)));
      if (out) sh.writeFile(c.abs(out), pem, false);
      else c.out(pem);
      if (out) sh.fs.lookup(c.abs(out)).mode = 0o600;
      return 0;
    }
    if (sub === 'req') {
      const subj = g('-subj') || '/CN=localhost';
      const cn = (/CN=([^/]+)/.exec(subj) || [0, 'localhost'])[1];
      const days = +(g('-days') || 30);
      const keyOut = g('-keyout');
      const out = g('-out');
      if (args.includes('-x509') || args.includes('-newkey')) {
        if (!keyOut || !out) {
          c.err('req: need -keyout and -out in this sandbox\n');
          return 1;
        }
        const cert = PEM('CERTIFICATE', b64(JSON.stringify({ subj, cn })) + rnd(300));
        try {
          sh.writeFile(c.abs(keyOut), PEM('PRIVATE KEY', rnd(500)), false);
          sh.fs.lookup(c.abs(keyOut)).mode = 0o600;
          sh.writeFile(c.abs(out), cert, false);
          const cn2 = sh.fs.lookup(c.abs(out));
          cn2.certMeta = { subject: subj, cn, notBefore: Date.now(), notAfter: Date.now() + days * 86400000, selfSigned: true, id: c.abs(out) };
        } catch (e) {
          if (!(e instanceof FsErr)) throw e;
          c.err(`Can't open ${keyOut} for writing, ${U.errTxt(e)}\n`);
          return 1;
        }
        c.err('.+++++++++++++++++++++++++++++++++++++++++++++++++++*...+++++\n-----\n');
        return 0;
      }
      c.err('req: unsupported options in this sandbox\n');
      return 1;
    }
    if (sub === 'x509') {
      const f = g('-in');
      const n = f && sh.fs.lookup(c.abs(f));
      if (!n || !n.certMeta) {
        c.err(`Could not read certificate from ${f}\nUnable to load certificate\n`);
        return 1;
      }
      const m = n.certMeta;
      const fmt = (ms) => U.strftime('%b %e %H:%M:%S %Y GMT', new Date(ms), true);
      if (args.includes('-subject')) c.out(`subject=${m.subject.replace(/^\//, '').replace(/\//g, ', ')}\n`.replace('subject=CN', 'subject=CN = ').replace('= =', '=').replace('CN = =', 'CN ='));
      if (args.includes('-issuer')) c.out(`issuer=${m.subject.replace(/^\//, '').replace(/\//g, ', ')}\n`.replace('issuer=CN', 'issuer=CN = '));
      if (args.includes('-dates')) c.out(`notBefore=${fmt(m.notBefore)}\nnotAfter=${fmt(m.notAfter)}\n`);
      if (args.includes('-enddate')) c.out(`notAfter=${fmt(m.notAfter)}\n`);
      if (!args.includes('-noout')) c.out(n.content);
      return 0;
    }
    if (sub === 'enc') {
      const dec = args.includes('-d');
      const pass = (g('-pass') || '').replace(/^pass:/, '');
      const inF = g('-in');
      const out = g('-out');
      try {
        const src = sh.fs.lookup(c.abs(inF));
        if (!src) throw new FsErr('ENOENT', inF);
        if (dec) {
          if (!src.enc) {
            c.err('error reading input file\n');
            return 1;
          }
          if (src.enc.pass !== pass) {
            c.err('bad decrypt\n40E7C8D4:error:1C800064:Provider routines:ossl_cipher_unpadblock:bad decrypt:../providers/implementations/ciphers/ciphercommon_block.c:124:\n');
            return 1;
          }
          if (out) sh.writeFile(c.abs(out), src.enc.plain, false);
          else c.out(src.enc.plain);
        } else {
          const plain = sh.readFile(c.abs(inF));
          if (out) {
            sh.writeFile(c.abs(out), 'Salted__' + b64(rnd(8) + plain.split('').reverse().join('')) + '\n', false);
            sh.fs.lookup(c.abs(out)).enc = { pass, plain };
          } else c.out('Salted__' + b64(rnd(8) + plain.split('').reverse().join('')) + '\n');
        }
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`Can't open ${inF}: ${U.errTxt(e)}\n`);
        return 1;
      }
      return 0;
    }
    c.err(`Invalid command '${sub || ''}'; type "help" for a list.\n`);
    return 1;
  });

  /* ---------- gpg ---------- */
  def('gpg', async (c, args) => {
    const sh = c.sh;
    sh.gpgKeys = sh.gpgKeys || [];
    const g = (k) => {
      const i = args.indexOf(k);
      return i >= 0 ? args[i + 1] : undefined;
    };
    if (args.includes('--list-keys') || args.includes('-k') || args.includes('--list-secret-keys')) {
      if (!sh.gpgKeys.length) return 0;
      c.out(`/home/${sh.eu()}/.gnupg/pubring.kbx\n------------------------------\n`);
      sh.gpgKeys.forEach((k) => c.out(`pub   ed25519 ${U.strftime('%F', new Date(k.t))} [SC]\n      ${k.fpr}\nuid           [ultimate] ${k.uid}\nsub   cv25519 ${U.strftime('%F', new Date(k.t))} [E]\n\n`));
      return 0;
    }
    if (args.includes('--quick-gen-key') || args.includes('--quick-generate-key')) {
      const uid = args[args.findIndex((a) => a.startsWith('--quick-')) + 1];
      sh.gpgKeys.push({ uid, fpr: rnd(40).toUpperCase(), t: Date.now() });
      sh.fs.mkdirp(`/home/${sh.eu()}/.gnupg`, { owner: sh.eu(), group: sh.users[sh.eu()].groups[0], mode: 0o700 });
      c.err(`gpg: key ${rnd(16).toUpperCase()} marked as ultimately trusted\ngpg: revocation certificate stored as '/home/${sh.eu()}/.gnupg/openpgp-revocs.d/${rnd(40).toUpperCase()}.rev'\n`);
      return 0;
    }
    const passArg = g('--passphrase');
    const ask = async (prompt) => {
      if (passArg !== undefined) return passArg;
      if (!sh.hooks.readLine) return 'x';
      const v = await sh.hooks.readLine(prompt, { secret: true });
      sh.checkAbort();
      return v;
    };
    if (args.includes('-c') || args.includes('--symmetric')) {
      const f = args.filter((a) => !a.startsWith('-') && a !== passArg).pop();
      try {
        const plain = sh.readFile(c.abs(f));
        const p1 = await ask('Enter passphrase: ');
        if (passArg === undefined && sh.hooks.readLine) {
          const p2 = await ask('Repeat passphrase: ');
          if (p1 !== p2) {
            c.err('gpg: passphrase not correctly repeated; try again\n');
            return 2;
          }
        }
        const out = f + (args.includes('--armor') || args.includes('-a') ? '.asc' : '.gpg');
        sh.writeFile(c.abs(out), '\u0085\u0003\u000e\u0003' + b64(plain).split('').reverse().join(''), false);
        sh.fs.lookup(c.abs(out)).gpg = { pass: p1, plain };
        sh.fs.lookup(c.abs(out)).bin = true;
        sh.fs.lookup(c.abs(out)).size = plain.length + 80;
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`gpg: can't open '${f}': ${U.errTxt(e)}\n`);
        return 2;
      }
      return 0;
    }
    if (args.includes('-e') || args.includes('--encrypt')) {
      const r = g('-r') || g('--recipient');
      const f = args.filter((a) => !a.startsWith('-') && a !== r).pop();
      const key = sh.gpgKeys.find((k) => k.uid.includes(r || '\0'));
      if (!key) {
        c.err(`gpg: ${r}: skipped: No public key\ngpg: ${f}: encryption failed: No public key\n`);
        return 2;
      }
      const plain = sh.readFile(c.abs(f));
      sh.writeFile(c.abs(f + '.gpg'), '(encrypted)', false);
      const n = sh.fs.lookup(c.abs(f + '.gpg'));
      n.gpg = { key: key.fpr, plain };
      n.bin = true;
      n.size = plain.length + 120;
      return 0;
    }
    if (args.includes('-d') || args.includes('--decrypt')) {
      const f = args.filter((a) => !a.startsWith('-') && a !== passArg).pop();
      const n = sh.fs.lookup(c.abs(f));
      if (!n || !n.gpg) {
        c.err(`gpg: no valid OpenPGP data found.\ngpg: decrypt_message failed: Unknown system error\n`);
        return 2;
      }
      if (n.gpg.key) {
        if (!sh.gpgKeys.find((k) => k.fpr === n.gpg.key)) {
          c.err('gpg: decryption failed: No secret key\n');
          return 2;
        }
        c.err('gpg: encrypted with cv25519 key\n');
        c.out(n.gpg.plain);
        return 0;
      }
      const p = await ask('Enter passphrase: ');
      if (p !== n.gpg.pass) {
        c.err('gpg: decryption failed: Bad session key\n');
        return 2;
      }
      c.err('gpg: AES256.CFB encrypted data\ngpg: encrypted with 1 passphrase\n');
      c.out(n.gpg.plain);
      return 0;
    }
    c.err('gpg: WARNING: no command supplied.  Trying to guess what you mean ...\n');
    return 2;
  });

  /* ---------- auditd ---------- */
  LX.initHooks.push((sh) => {
    sh.auditRules = [];
    sh.auditEvents = [];
    sh.fs.mkdirp('/etc/audit/rules.d', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/audit/auditd.conf', 'log_file = /var/log/audit/audit.log\nmax_log_file = 8\nnum_logs = 5\n', { owner: 'root', group: 'root' });
    // PAM / security config
    const o = { owner: 'root', group: 'root' };
    sh.fs.mkdirp('/etc/pam.d', o);
    sh.fs.mkdirp('/etc/security', o);
    sh.fs.put('/etc/pam.d/common-password', '# /etc/pam.d/common-password - password-related modules common to all services\npassword\t[success=1 default=ignore]\tpam_unix.so obscure yescrypt\npassword\trequisite\t\t\tpam_deny.so\npassword\trequired\t\t\tpam_permit.so\n', o);
    sh.fs.put('/etc/pam.d/common-auth', 'auth\t[success=1 default=ignore]\tpam_unix.so nullok\nauth\trequisite\t\t\tpam_deny.so\nauth\trequired\t\t\tpam_permit.so\n', o);
    sh.fs.put('/etc/pam.d/sshd', '@include common-auth\naccount    required     pam_nologin.so\n@include common-account\n@include common-session\n@include common-password\n', o);
    sh.fs.put('/etc/pam.d/sudo', 'session    required   pam_env.so readenv=1 user_readenv=0\n@include common-auth\n@include common-account\n@include common-session-noninteractive\n', o);
    sh.fs.put('/etc/security/limits.conf', '# /etc/security/limits.conf\n#\n#<domain>      <type>  <item>         <value>\n#\n#*               soft    core            0\n#@student        hard    nproc           20\n', o);
    sh.fs.put('/etc/security/pwquality.conf', '# minlen = 8\n# minclass = 0\n# dcredit = 0\n', o);
    sh.fs.mkdirp('/etc/ldap', o);
    sh.fs.put('/etc/ldap/ldap.conf', '#\n# LDAP Defaults\n#\n#BASE\tdc=example,dc=com\n#URI\tldap://ldap.example.com ldap://ldap-provider.example.com:666\n', o);
    sh.fs.put('/etc/krb5.conf', '[libdefaults]\n\tdefault_realm = EXAMPLE.COM\n\n[realms]\n\tEXAMPLE.COM = {\n\t\tkdc = kerberos.example.com\n\t\tadmin_server = kerberos.example.com\n\t}\n', o);
    sh.fs.mkdirp('/etc/apt/apt.conf.d', o);
    sh.fs.put('/etc/apt/apt.conf.d/20auto-upgrades', 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n', o);
    sh.fs.put('/etc/apt/sources.list', 'deb http://archive.ubuntu.com/ubuntu noble main restricted universe\ndeb http://archive.ubuntu.com/ubuntu noble-updates main restricted universe\ndeb http://security.ubuntu.com/ubuntu noble-security main restricted universe\n', o);
    // seed failed login attempts
    const lines = [];
    const now = Date.now();
    for (let i = 0; i < 9; i++) lines.push(`${U.strftime('%b %e %H:%M:%S', new Date(now - 7200000 + i * 20000))} linux-school sshd[${2100 + i}]: Failed password for root from 203.0.113.77 port ${40000 + i * 13} ssh2`);
    for (let i = 0; i < 3; i++) lines.push(`${U.strftime('%b %e %H:%M:%S', new Date(now - 3600000 + i * 30000))} linux-school sshd[${2200 + i}]: Failed password for invalid user admin from 198.51.100.23 port ${51000 + i * 7} ssh2`);
    const al = sh.fs.lookup('/var/log/auth.log');
    al.content += lines.join('\n') + '\n';
    for (let i = 0; i < 9; i++) sh.journal.push({ t: now - 7200000 + i * 20000, unit: 'ssh.service', prio: 5, msg: `Failed password for root from 203.0.113.77 port ${40000 + i * 13} ssh2`, ident: 'sshd', pid: 2100 + i, boot: sh.bootId });
    // setuid / sgid / sticky bits and capabilities
    const bits = { '/usr/bin/passwd': 0o4755, '/usr/bin/sudo': 0o4755, '/usr/bin/su': 0o4755, '/usr/bin/mount': 0o4755, '/usr/bin/umount': 0o4755, '/usr/bin/chsh': 0o4755, '/usr/bin/newgrp': 0o4755, '/usr/bin/gpasswd': 0o4755, '/usr/bin/crontab': 0o2755, '/usr/bin/wall': 0o2755 };
    for (const [p, m] of Object.entries(bits)) {
      const n = sh.fs.lookup(p);
      if (n) n.mode = m;
    }
    sh.pendingUpdates = [
      { name: 'openssl', from: '3.0.13-0ubuntu3.2', to: '3.0.13-0ubuntu3.4', repo: 'noble-security' },
      { name: 'libssl3t64', from: '3.0.13-0ubuntu3.2', to: '3.0.13-0ubuntu3.4', repo: 'noble-security' },
      { name: 'linux-image-generic', from: '6.8.0.45.47', to: '6.8.0.48.50', repo: 'noble-updates' },
      { name: 'openssh-server', from: '1:9.6p1-3ubuntu13.4', to: '1:9.6p1-3ubuntu13.5', repo: 'noble-security' },
      { name: 'curl', from: '8.5.0-2ubuntu10.3', to: '8.5.0-2ubuntu10.4', repo: 'noble-updates' },
    ];
  });
  const origWrite = P.writeFile;
  P.writeFile = function (abs, data, append) {
    const r = origWrite.call(this, abs, data, append);
    if (this.auditRules && this.auditRules.length) this.auditHit(abs, 'w');
    return r;
  };
  const origPw = P.writePasswd;
  P.writePasswd = function () {
    const r = origPw.apply(this, arguments);
    if (this.auditRules && this.auditRules.length && this.auditEvents) for (const f of ['/etc/passwd', '/etc/group', '/etc/shadow']) this.auditHit(f, 'w');
    return r;
  };
  P.auditHit = function (abs, perm) {
    for (const r of this.auditRules) {
      if (abs === r.path || abs.startsWith(r.path + '/')) {
        if (r.perms.includes(perm) || (perm === 'w' && r.perms.includes('a'))) this.auditEvents.push({ t: Date.now(), key: r.key, path: abs, perm, user: this.eu() === 'root' ? 'root' : this.user, comm: 'bash' });
      }
    }
  };
  def('auditctl', async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, 'You must be root to run this program.\n')) return 1;
    if (args.includes('-l')) {
      if (!sh.auditRules.length) return c.out('No rules\n');
      sh.auditRules.forEach((r) => c.out(`-w ${r.path} -p ${r.perms} -k ${r.key}\n`));
      return 0;
    }
    if (args.includes('-D')) {
      sh.auditRules = [];
      c.out('No rules\n');
      return 0;
    }
    if (args.includes('-s')) return c.out('enabled 1\nfailure 1\npid 612\nrate_limit 0\nbacklog_limit 8192\nlost 0\nbacklog 0\n');
    const wI = args.indexOf('-w');
    if (wI >= 0) {
      const p = args.indexOf('-p');
      const k = args.indexOf('-k');
      sh.auditRules.push({ path: c.abs(args[wI + 1]), perms: p >= 0 ? args[p + 1] : 'rwxa', key: k >= 0 ? args[k + 1] : '(null)' });
      return 0;
    }
    c.err('Usage: auditctl [options]\n');
    return 1;
  }, { pkg: 'auditd' });
  def('ausearch', async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, 'You must be root to run this program.\n')) return 1;
    const kI = args.indexOf('-k');
    const fI = args.indexOf('-f');
    let ev = sh.auditEvents;
    if (kI >= 0) ev = ev.filter((e) => e.key === args[kI + 1]);
    if (fI >= 0) ev = ev.filter((e) => e.path === c.abs(args[fI + 1]));
    if (!ev.length) {
      c.out('<no matches>\n');
      return 1;
    }
    for (const e of ev) {
      const ts = Math.floor(e.t / 1000);
      c.out(`----\ntime->${U.strftime('%a %b %e %H:%M:%S %Y', new Date(e.t))}\ntype=PATH msg=audit(${ts}.201:${ts % 1000}): item=0 name="${e.path}" inode=131075 dev=08:01 mode=0100644 ouid=0 ogid=0 nametype=NORMAL\ntype=SYSCALL msg=audit(${ts}.201:${ts % 1000}): arch=c000003e syscall=257 success=yes exit=3 auid=1000 uid=${e.user === 'root' ? 0 : 1000} comm="${e.comm}" exe="/usr/bin/${e.comm}" key="${e.key}"\n`);
    }
    return 0;
  }, { pkg: 'auditd' });
  def('aureport', async (c) => {
    c.out(`\nSummary Report\n======================\nRange of time in logs: ${U.strftime('%m/%d/%Y %H:%M:%S', new Date(Date.now() - 86400000))} - ${U.strftime('%m/%d/%Y %H:%M:%S', new Date())}\nNumber of events: ${c.sh.auditEvents.length}\nNumber of failed logins: 0\nNumber of authentications: 14\n`);
  }, { pkg: 'auditd' });

  /* ---------- fail2ban ---------- */
  def('fail2ban-client', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root') {
      c.err("ERROR: Permission denied to socket: /var/run/fail2ban/fail2ban.sock, (you must be root)\n");
      return 255;
    }
    const svc = sh.services.fail2ban;
    if (!svc || !svc.active) {
      c.err('ERROR: Unable to contact server. Is it running?\n');
      return 255;
    }
    sh.f2b = sh.f2b || { banned: new Set(), unbanned: new Set() };
    const jl = (sh.fs.lookup('/etc/fail2ban/jail.local') || {}).content || '';
    const maxretry = +((/maxretry\s*=\s*(\d+)/.exec(jl) || [0, 5])[1]);
    const bantime = (/bantime\s*=\s*(\S+)/.exec(jl) || [0, '10m'])[1];
    const attempts = {};
    for (const l of U.lines(sh.fs.lookup('/var/log/auth.log').content || '')) {
      const m = /Failed password for (?:invalid user )?\S+ from (\S+)/.exec(l);
      if (m) attempts[m[1]] = (attempts[m[1]] || 0) + 1;
    }
    const banned = new Set([...Object.keys(attempts).filter((ip) => attempts[ip] >= maxretry && !sh.f2b.unbanned.has(ip)), ...sh.f2b.banned]);
    const totalFailed = Object.values(attempts).reduce((a, b) => a + b, 0);
    if (!args.length || args[0] === 'status' && !args[1]) {
      c.out('Status\n|- Number of jail:\t1\n`- Jail list:\tsshd\n');
      return 0;
    }
    if (args[0] === 'status' && args[1] === 'sshd') {
      c.out(`Status for the jail: sshd\n|- Filter\n|  |- Currently failed:\t${Math.min(2, totalFailed)}\n|  |- Total failed:\t${totalFailed}\n|  \`- File list:\t/var/log/auth.log\n\`- Actions\n   |- Currently banned:\t${banned.size}\n   |- Total banned:\t${banned.size}\n   \`- Banned IP list:\t${[...banned].join(' ')}\n`);
      return 0;
    }
    if (args[0] === 'set' && args[2] === 'banip') {
      sh.f2b.banned.add(args[3]);
      sh.f2b.unbanned.delete(args[3]);
      c.out('1\n');
      return 0;
    }
    if (args[0] === 'set' && args[2] === 'unbanip') {
      sh.f2b.banned.delete(args[3]);
      sh.f2b.unbanned.add(args[3]);
      c.out('1\n');
      return 0;
    }
    if (args[0] === 'get' && args[2] === 'maxretry') return c.out(maxretry + '\n');
    if (args[0] === 'get' && args[2] === 'bantime') return c.out(bantime + '\n');
    c.err('Usage: fail2ban-client [OPTIONS] <COMMAND>\n');
    return 255;
  }, { pkg: 'fail2ban' });
  def('faillock', async (c, args) => {
    const u = args[args.indexOf('--user') + 1];
    if (args.includes('--reset')) return 0;
    c.out(`${u || c.sh.user}:\nWhen                Type  Source                                           Valid\n`);
  });

  /* ---------- capabilities ---------- */
  def('setcap', async (c, args) => {
    if (needRoot(c, 'unable to set CAP_SETFCAP effective capability: Operation not permitted\n')) return 1;
    const f = args[args.length - 1];
    const n = c.sh.fs.lookup(c.abs(f));
    if (!n) {
      c.err(`Failed to set capabilities on file '${f}': No such file or directory\n`);
      return 1;
    }
    if (args[0] === '-r') delete n.caps;
    else n.caps = args[0].replace(/=\+?ep?$/, '').replace(/=.*$/, '') + '=ep';
    return 0;
  });
  def('getcap', async (c, args) => {
    const rec = args.includes('-r');
    const targets = args.filter((a) => !a.startsWith('-'));
    for (const t of targets.length ? targets : ['.']) {
      const abs = c.abs(t);
      const n = c.sh.fs.lookup(abs);
      if (!n) continue;
      if (rec && n.t === 'd') c.sh.fs.walk(abs, (p, nd) => nd.caps && c.out(`${p} ${nd.caps}\n`));
      else if (n.caps) c.out(`${abs} ${n.caps}\n`);
    }
  });

  /* ---------- pending updates / apt wrappers ---------- */
  for (const nm of ['apt', 'apt-get']) {
    const orig = LX.cmds[nm].run;
    def(nm, async (c, args) => {
      const sh = c.sh;
      const sub = args.filter((a) => !a.startsWith('-'))[0];
      const pend = sh.pendingUpdates || [];
      if (sub === 'list' && args.includes('--upgradable')) {
        c.out('Listing... Done\n');
        pend.forEach((p) => c.out(`${p.name}/${p.repo} ${p.to} amd64 [upgradable from: ${p.from}]\n`));
        return 0;
      }
      if (sub === 'update') {
        let buf = '';
        const c2 = Object.assign({}, c, { out: (s) => (buf += s), io: Object.assign({}, c.io, { stdout: (s) => (buf += s) }) });
        const st = await orig(c2, args);
        if (st) return st;
        c.out(buf.replace('All packages are up to date.', pend.length ? `${pend.length} packages can be upgraded. Run 'apt list --upgradable' to see them.` : 'All packages are up to date.'));
        return 0;
      }
      if (['upgrade', 'full-upgrade', 'dist-upgrade'].includes(sub) && pend.length) {
        if (sh.eu() !== 'root') {
          c.err('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?\n');
          return 100;
        }
        c.out(`Reading package lists... Done\nBuilding dependency tree... Done\nCalculating upgrade... Done\nThe following packages will be upgraded:\n  ${pend.map((p) => p.name).join(' ')}\n${pend.length} upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\nNeed to get 38.1 MB of archives.\n`);
        if (!args.some((a) => /^-\w*y/.test(a)) && sh.hooks.readLine) {
          const a = await U.ask(c, 'Do you want to continue? [Y/n] ');
          if (a !== '' && !/^y/i.test(a)) return c.out('Abort.\n'), 1;
        }
        pend.forEach((p) => c.out(`Preparing to unpack .../${p.name}_${p.to}_amd64.deb ...\nUnpacking ${p.name} (${p.to}) over (${p.from}) ...\nSetting up ${p.name} (${p.to}) ...\n`));
        sh.logEvent('apt', 6, `Upgraded ${pend.length} packages`, { ident: 'apt' });
        sh.pendingUpdates = [];
        return 0;
      }
      return orig(c, args);
    });
  }
  def('unattended-upgrade', async (c, args) => {
    if (needRoot(c, 'unattended-upgrade: This command must be run as root.\n')) return 1;
    c.out(`Initial blacklist: \nInitial whitelist (not strict): \nStarting unattended upgrades script\nAllowed origins are: o=Ubuntu,a=noble, o=Ubuntu,a=noble-security\n${args.includes('--dry-run') ? 'Packages that would be upgraded: ' + (c.sh.pendingUpdates || []).filter((p) => /security/.test(p.repo)).map((p) => p.name).join(' ') + '\n' : 'Packages that will be upgraded: ' + (c.sh.pendingUpdates || []).filter((p) => /security/.test(p.repo)).map((p) => p.name).join(' ') + '\n'}`);
  }, { pkg: 'unattended-upgrades' });
  def('lynis', async (c, args) => {
    if (needRoot(c, 'This script needs root permissions (sudo lynis audit system)\n')) return 1;
    c.out('[ Lynis 3.1.1 ]\n\n  Performing system audit...\n\n[+] Boot and services\n  - Checking for password protection on GRUB      [ WARNING ]\n  - Check running services (systemctl)            [ DONE ]\n[+] SSH Support\n  - Checking SSH config                           [ FOUND ]\n    - OpenSSH option: PermitRootLogin             [ SUGGESTION ]\n    - OpenSSH option: PasswordAuthentication      [ SUGGESTION ]\n[+] Firewall\n  - Checking host based firewall                  [ ACTIVE ]\n\n  Hardening index : 64 [############        ]\n  Tests performed : 238\n\n  Suggestions (4):\n  * Consider hardening SSH configuration [SSH-7440]\n  * Install a PAM module for password strength testing [AUTH-9262]\n  * Enable process accounting [ACCT-9622]\n  * Install and use auditd [ACCT-9628]\n');
  }, { pkg: 'lynis' });
  def('certbot', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root') {
      c.err('Error: Root is required to run certbot.\n');
      return 1;
    }
    if (args[0] === 'certificates') {
      const d = sh.fs.lookup('/etc/letsencrypt/live');
      c.out(d && Object.keys(d.kids).length ? 'Found the following certs:\n' + Object.keys(d.kids).map((k) => `  Certificate Name: ${k}\n    Domains: ${k}\n    Expiry Date: ${U.strftime('%F', new Date(Date.now() + 89 * 86400000))} (VALID: 89 days)\n    Certificate Path: /etc/letsencrypt/live/${k}/fullchain.pem\n`).join('') : 'No certificates found.\n');
      return 0;
    }
    if (args.includes('renew')) return c.out('Saving debug log to /var/log/letsencrypt/letsencrypt.log\n\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\nProcessing /etc/letsencrypt/renewal/example.com.conf\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\nCert not due for renewal, but simulating renewal for dry run\nCongratulations, all simulated renewals succeeded\n'), 0;
    const dI = args.indexOf('-d');
    const dom = dI >= 0 ? args[dI + 1] : null;
    if (!dom) {
      c.err('No domains specified. Use -d example.com\n');
      return 1;
    }
    const dir = `/etc/letsencrypt/live/${dom}`;
    sh.fs.mkdirp(dir, { owner: 'root', group: 'root', mode: 0o755 });
    sh.fs.put(dir + '/fullchain.pem', PEM('CERTIFICATE', rnd(400)), { owner: 'root', group: 'root', certMeta: { subject: '/CN=' + dom, notBefore: Date.now(), notAfter: Date.now() + 90 * 86400000, id: dir + '/fullchain.pem' } });
    sh.fs.put(dir + '/privkey.pem', PEM('PRIVATE KEY', rnd(400)), { owner: 'root', group: 'root', mode: 0o600 });
    c.out(`Saving debug log to /var/log/letsencrypt/letsencrypt.log\nRequesting a certificate for ${dom}\n\nSuccessfully received certificate.\nCertificate is saved at: ${dir}/fullchain.pem\nKey is saved at:         ${dir}/privkey.pem\nThis certificate expires on ${U.strftime('%F', new Date(Date.now() + 90 * 86400000))}.\nCertbot has set up a scheduled task to automatically renew this certificate in the background.\n`);
    return 0;
  }, { pkg: 'certbot' });
  Object.assign(LX.PKGS, {
    fail2ban: { ver: '1.0.2-3ubuntu0.1', desc: 'ban hosts that cause multiple authentication errors', size: 450, bins: ['fail2ban-client'], service: { desc: 'Fail2Ban Service', proc: 'fail2ban-server' } },
    auditd: { ver: '1:3.1.2-2.1build1', desc: 'User space tools for security auditing', size: 270, bins: ['auditctl', 'ausearch', 'aureport'], service: { desc: 'Security Auditing Service', proc: 'auditd' } },
    lynis: { ver: '3.0.9-1', desc: 'security auditing tool for Unix based systems', size: 330, bins: ['lynis'] },
    certbot: { ver: '2.9.0-1', desc: 'automatically configure HTTPS using Let\'s Encrypt', size: 120, bins: ['certbot'] },
    'unattended-upgrades': { ver: '2.9.1+nmu4ubuntu1', desc: 'automatic installation of security upgrades', size: 90, bins: ['unattended-upgrade'] },
  });
  const origInstall = P.onInstall;
  P.onInstall = function (p, pk) {
    origInstall.call(this, p, pk);
    if (p === 'fail2ban') {
      this.fs.mkdirp('/etc/fail2ban', { owner: 'root', group: 'root' });
      this.fs.put('/etc/fail2ban/jail.conf', '[DEFAULT]\nbantime  = 10m\nfindtime  = 10m\nmaxretry = 5\n\n[sshd]\nenabled = true\n', { owner: 'root', group: 'root' });
    }
    if (p === 'auditd') this.fs.mkdirp('/var/log/audit', { owner: 'root', group: 'root', mode: 0o700 });
  };
})();
