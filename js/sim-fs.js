/* Linux Academy: virtual filesystem for the in-browser sandbox */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const DAY = 86400000;

  class FsErr extends Error {
    constructor(code, path) {
      super(code);
      this.code = code;
      this.path = path;
    }
  }
  FsErr.msg = {
    ENOENT: 'No such file or directory',
    EACCES: 'Permission denied',
    EEXIST: 'File exists',
    ENOTDIR: 'Not a directory',
    EISDIR: 'Is a directory',
    ENOTEMPTY: 'Directory not empty',
    EPERM: 'Operation not permitted',
    EINVAL: 'Invalid argument',
    ENOSPC: 'No space left on device',
    EROFS: 'Read-only file system',
  };

  class VFS {
    constructor() {
      this.root = this.mk('d', { owner: 'root', group: 'root' });
    }
    mk(t, o) {
      const n = { t, mode: t === 'd' ? 0o755 : 0o644, owner: 'learner', group: 'learner', mtime: Date.now() };
      if (t === 'd') n.kids = {};
      return Object.assign(n, o || {});
    }
    static norm(p, cwd) {
      if (!p.startsWith('/')) p = (cwd || '/') + '/' + p;
      const out = [];
      for (const s of p.split('/')) {
        if (!s || s === '.') continue;
        if (s === '..') out.pop();
        else out.push(s);
      }
      return '/' + out.join('/');
    }
    static dirname(abs) {
      const i = abs.lastIndexOf('/');
      return i <= 0 ? '/' : abs.slice(0, i);
    }
    static base(abs) {
      return abs.slice(abs.lastIndexOf('/') + 1);
    }
    lookup(abs, follow = true, depth = 0) {
      if (depth > 10) return null;
      const parts = abs.split('/').filter(Boolean);
      let n = this.root;
      let path = '';
      for (let i = 0; i < parts.length; i++) {
        if (n.t !== 'd') return null;
        let c = n.kids[parts[i]];
        if (!c) return null;
        if (c.t === 'l' && (follow || i < parts.length - 1)) {
          const tp = VFS.norm(c.target, path || '/');
          c = this.lookup(tp, true, depth + 1);
          if (!c) return null;
          path = tp;
        } else path += '/' + parts[i];
        n = c;
      }
      return n;
    }
    // builder helpers (no permission checks)
    mkdirp(abs, o) {
      let n = this.root;
      for (const p of abs.split('/').filter(Boolean)) {
        if (!n.kids[p]) n.kids[p] = this.mk('d', o);
        n = n.kids[p];
      }
      return n;
    }
    put(abs, content, o) {
      const dir = this.mkdirp(VFS.dirname(abs), o && o.dirOpts);
      const f = this.mk('f', Object.assign({ content: content == null ? '' : content }, o));
      delete f.dirOpts;
      dir.kids[VFS.base(abs)] = f;
      return f;
    }
    link(abs, target, o) {
      const dir = this.mkdirp(VFS.dirname(abs));
      dir.kids[VFS.base(abs)] = this.mk('l', Object.assign({ target, mode: 0o777 }, o));
    }
    /** ACL mask: set explicitly, or the union of the group class (like the kernel does) */
    static aclMaskOf(node) {
      if (node.aclMask !== undefined) return node.aclMask;
      return (node.acl || []).reduce((m, e) => m | e.p, (node.mode >> 3) & 7);
    }
    // permission test: bit 4=r 2=w 1=x
    static can(node, user, groups, bit) {
      if (user === 'root') return bit !== 1 || node.t === 'd' || (node.mode & 0o111) !== 0;
      let shift = 0;
      if (node.owner === user) shift = 6;
      else {
        if (node.acl) {
          const mask = VFS.aclMaskOf(node);
          const ue = node.acl.find((e) => e.t === 'u' && e.n === user);
          if (ue) return ((ue.p & mask) & bit) !== 0;
          const ge = node.acl.filter((e) => e.t === 'g' && groups.includes(e.n));
          const owning = groups.includes(node.group);
          if (ge.length || owning) return (owning && (((node.mode >> 3) & mask) & bit) !== 0) || ge.some((e) => ((e.p & mask) & bit) !== 0);
        }
        if (groups.includes(node.group)) shift = 3;
      }
      return ((node.mode >> shift) & bit) !== 0;
    }
    static size(n) {
      if (n.t === 'd') return 4096;
      if (n.t === 'l') return n.target.length;
      if (n.size != null) return n.size;
      return new TextEncoder().encode(n.content || '').length;
    }
    walk(abs, fn) {
      const n = this.lookup(abs, false);
      if (!n) return;
      const rec = (p, node) => {
        fn(p, node);
        if (node.t === 'd') for (const k of Object.keys(node.kids).sort()) rec((p === '/' ? '' : p) + '/' + k, node.kids[k]);
      };
      rec(abs, n);
    }
    clone(node) {
      return JSON.parse(JSON.stringify(node));
    }
  }

  LX.FsErr = FsErr;
  LX.VFS = VFS;

  /* ---------- default world ---------- */
  LX.makeFS = function () {
    const fs = new VFS();
    const T = Date.now();
    const ago = (d, h) => T - d * DAY - (h || 0) * 3600000;
    const H = '/home/learner';
    const f = (p, c, o) => fs.put(p, c, Object.assign({ mtime: ago(3, 2) }, o));
    const bin = (p, size, o) => fs.put(p, '', Object.assign({ bin: true, size, mtime: ago(9, 1) }, o));
    const dir = (p, o) => fs.mkdirp(p, o);

    ['/etc', '/var', '/var/log', '/var/www', '/usr', '/usr/lib', '/usr/sbin', '/usr/share', '/usr/local', '/usr/local/bin', '/opt', '/mnt', '/media', '/srv', '/boot', '/sys', '/proc', '/dev', '/home'].forEach((p) =>
      dir(p, { owner: 'root', group: 'root', mtime: ago(40) })
    );
    dir('/usr/bin', { owner: 'root', group: 'root', mtime: ago(5) });
    dir('/tmp', { owner: 'root', group: 'root', mode: 0o1777 });
    dir('/root', { owner: 'root', group: 'root', mode: 0o700 });
    fs.link('/bin', 'usr/bin', { owner: 'root', group: 'root' });
    fs.link('/sbin', 'usr/sbin', { owner: 'root', group: 'root' });
    fs.link('/lib', 'usr/lib', { owner: 'root', group: 'root' });

    const sys = { owner: 'root', group: 'root', mtime: ago(20) };
    f('/etc/hostname', 'linux-school\n', sys);
    f('/etc/hosts', '127.0.0.1\tlocalhost\n127.0.1.1\tlinux-school\n::1\t\tlocalhost ip6-localhost\n', sys);
    f('/etc/os-release', 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.1 LTS (Noble Numbat)"\nID=ubuntu\nID_LIKE=debian\nHOME_URL="https://www.ubuntu.com/"\n', sys);
    f('/etc/shells', '/bin/sh\n/bin/bash\n', sys);
    f('/etc/motd', 'Welcome to the Linux Academy sandbox!\n', sys);
    f('/etc/shadow', 'root:!:20000:0:99999:7:::\nlearner:$y$j9T$notarealhash:20000:0:99999:7:::\n', Object.assign({}, sys, { mode: 0o640, group: 'shadow' }));
    f('/etc/passwd', '', sys); // filled by shell
    f('/etc/group', '', sys);
    f('/var/log/syslog', 'Oct 26 08:00:01 linux-school systemd[1]: Started Daily apt download activities.\nOct 26 08:01:12 linux-school sshd[412]: Server listening on 0.0.0.0 port 22.\nOct 26 08:05:44 linux-school CRON[701]: (root) CMD (command -v debian-sa1)\nOct 26 09:00:00 linux-school systemd[1]: Started Session 3 of User learner.\n', Object.assign({}, sys, { group: 'adm' }));
    f('/var/log/auth.log', 'Oct 26 08:01:30 linux-school sshd[430]: Accepted password for learner from 192.168.1.5\nOct 26 08:02:02 linux-school sudo: learner : TTY=pts/0 ; COMMAND=/usr/bin/apt update\n', Object.assign({}, sys, { mode: 0o640, group: 'adm' }));
    f('/var/log/dpkg.log', '2026-10-20 10:00:01 status installed bash 5.2.21\n2026-10-20 10:00:02 status installed coreutils 9.4\n', Object.assign({}, sys, { group: 'adm' }));
    f('/root/root_secret.txt', 'Only the administrator (root) may read this.\n', { owner: 'root', group: 'root', mode: 0o600 });
    f('/proc/cpuinfo', 'processor\t: 0\nmodel name\t: Virtual CPU @ 2.60GHz\ncpu cores\t: 2\nprocessor\t: 1\nmodel name\t: Virtual CPU @ 2.60GHz\ncpu cores\t: 2\n', sys);
    f('/proc/meminfo', 'MemTotal:        4046772 kB\nMemFree:         1523008 kB\nMemAvailable:    2690112 kB\nSwapTotal:       2097148 kB\n', sys);
    f('/boot/vmlinuz', '', Object.assign({}, sys, { bin: true, size: 14500000 }));
    fs.put('/dev/null', '', { t: 'c', owner: 'root', group: 'root', mode: 0o666 });
    fs.lookup('/dev/null').t = 'c';
    f('/usr/share/readme.txt', 'Shared files live here.\n', sys);
    f('/opt/README', 'Optional third-party software lives in /opt.\n', sys);

    // ---- home ----
    dir(H);
    dir(H + '/Desktop', { mtime: ago(12) });
    dir(H + '/Documents', { mtime: ago(2) });
    dir(H + '/Downloads', { mtime: ago(1) });
    dir(H + '/Pictures', { mtime: ago(6) });
    dir(H + '/Music', { mtime: ago(8) });
    dir(H + '/playground', { mtime: ago(1) });
    dir(H + '/projects', { mtime: ago(4) });
    dir(H + '/.config', { mtime: ago(30) });

    f(H + '/.bashrc', "# ~/.bashrc: runs every time you open a terminal\nalias ll='ls -alF'\nexport EDITOR=nano\n", { mtime: ago(30) });
    f(H + '/.profile', '# ~/.profile: login settings\n', { mtime: ago(30) });
    f(H + '/.config/settings.conf', 'theme=dark\nfont_size=14\n', { mtime: ago(30) });
    f(H + '/.secret', 'You found the hidden treasure!\nThe secret word is: PENGUIN\n', { mtime: ago(10) });
    f(H + '/poem.txt', 'Roses are red,\nViolets are blue,\nLinux is awesome,\nAnd so are you!\n', { mtime: ago(5) });
    f(H + '/animals.txt', 'dog\ncat\nelephant\ndog\ntiger\ncat\nlion\ndog\nzebra\nelephant\nmonkey\ncat\n', { mtime: ago(5) });
    f(H + '/fruits.txt', 'apple\nbanana\ncherry\nmango\norange\ngrapes\npapaya\nguava\nBanana\n', { mtime: ago(5) });
    f(H + '/numbers.txt', '10\n5\n23\n8\n42\n1\n16\n7\n', { mtime: ago(5) });
    f(H + '/notes.txt', 'Linux notes\n-----------\n1. Linux is free and open source.\n2. The Linux mascot is a penguin named Tux.\n3. The terminal is powerful.\n4. Practice makes perfect.\n', { mtime: ago(2) });
    f(H + '/todo.txt', 'buy milk\nfinish homework\nfeed the cat\nlearn linux\nplay cricket\n', { mtime: ago(1) });
    f(
      H + '/students.csv',
      'id,name,age,city,marks\n1,Aarav,12,Delhi,88\n2,Diya,11,Mumbai,92\n3,Kabir,12,Pune,75\n4,Meera,13,Delhi,81\n5,Rohan,11,Jaipur,67\n6,Sara,12,Mumbai,95\n7,Vihaan,13,Pune,59\n8,Anaya,11,Delhi,90\n',
      { mtime: ago(4) }
    );
    f(
      H + '/server.log',
      [
        '2026-10-26 09:00:01 INFO  Server started on port 8080',
        '2026-10-26 09:00:05 INFO  User aarav logged in',
        '2026-10-26 09:01:12 WARN  Disk usage at 81%',
        '2026-10-26 09:02:44 ERROR Database connection failed',
        '2026-10-26 09:02:50 INFO  Retrying connection (1/3)',
        '2026-10-26 09:02:55 ERROR Database connection failed',
        '2026-10-26 09:03:10 INFO  Database connected',
        '2026-10-26 09:05:31 INFO  User diya logged in',
        '2026-10-26 09:07:02 WARN  Slow response: 2.4s',
        '2026-10-26 09:10:18 INFO  User kabir logged in',
        '2026-10-26 09:12:45 ERROR File not found: /images/logo.png',
        '2026-10-26 09:15:00 INFO  Backup completed',
        '2026-10-26 09:21:09 INFO  User meera logged in',
        '2026-10-26 09:30:00 WARN  Memory usage at 76%',
        '2026-10-26 09:41:37 ERROR Timeout while sending email',
        '2026-10-26 09:45:00 INFO  User aarav logged out',
        '2026-10-26 10:00:00 INFO  Health check OK',
        '2026-10-26 10:05:23 INFO  User sara logged in',
        '2026-10-26 10:12:00 ERROR Payment service unavailable',
        '2026-10-26 10:30:00 INFO  Server heartbeat',
      ].join('\n') + '\n',
      { mtime: ago(0, 3) }
    );

    f(H + '/Documents/report.md', '# Science Report\n\nPlants need sunlight, water and air.\n\n## Experiment\nWe put one plant in the dark.\nIt did not grow well.\n', { mtime: ago(2) });
    f(H + '/Documents/homework.txt', 'Maths: page 42, questions 1 to 10\nScience: draw the water cycle\nEnglish: write 5 lines on my pet\n', { mtime: ago(2) });
    dir(H + '/Documents/recipes', { mtime: ago(7) });
    f(H + '/Documents/recipes/pizza.txt', 'Pizza\n-----\nbase, tomato sauce, cheese, vegetables.\nBake for 15 minutes.\n', { mtime: ago(7) });
    f(H + '/Documents/recipes/pasta.txt', 'Pasta\n-----\nBoil pasta, add sauce, add cheese.\n', { mtime: ago(7) });
    f(H + '/Documents/recipes/lassi.txt', 'Sweet Lassi\n-----------\ncurd, sugar, ice, a pinch of cardamom. Blend it!\n', { mtime: ago(7) });

    bin(H + '/Downloads/photo1.jpg', 2411724);
    bin(H + '/Downloads/song.mp3', 4834120);
    bin(H + '/Downloads/movie.mp4', 734003200);
    f(H + '/Downloads/old_notes.txt', 'These notes are old. You may delete them.\n', { mtime: ago(60) });
    f(H + '/Downloads/data.csv', 'x,y\n1,2\n3,4\n', { mtime: ago(1) });
    f(H + '/Downloads/installer.sh', '#!/bin/bash\necho "Installing... done!"\n', { mtime: ago(1) });

    bin(H + '/Pictures/cat.png', 183204);
    bin(H + '/Pictures/dog.png', 201330);
    bin(H + '/Pictures/sunset.jpg', 1320044);
    dir(H + '/Pictures/holiday');
    bin(H + '/Pictures/holiday/beach.jpg', 2210000);
    bin(H + '/Pictures/holiday/mountain.jpg', 2877000);
    bin(H + '/Music/track1.mp3', 3900000);
    bin(H + '/Music/track2.mp3', 4100000);

    for (const n of ['a.txt', 'b.txt', 'c.txt']) f(H + '/playground/' + n, 'I am ' + n + '\n', { mtime: ago(1) });
    f(H + '/playground/old.log', 'old log data\n', { mtime: ago(1) });

    f(H + '/projects/hello.sh', '#!/bin/bash\necho "Hello from my first script!"\n', { mtime: ago(4) });
    f(H + '/projects/website/index.html', '<!DOCTYPE html>\n<html>\n  <head><title>My Page</title></head>\n  <body>\n    <h1>Hello, world!</h1>\n  </body>\n</html>\n', { mtime: ago(4) });
    f(H + '/projects/website/style.css', 'body { background: lightblue; }\nh1 { color: navy; }\n', { mtime: ago(4) });
    f(H + '/projects/website/script.js', 'console.log("hello from JavaScript");\n', { mtime: ago(4) });
    f(H + '/projects/python-demo/app.py', 'print("Hello from Python")\n', { mtime: ago(4) });

    return fs;
  };
})();
