/* Linux Academy: docker + docker compose simulator (containers are mini sandboxes) */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS } = LX;
  const U = LX.U;
  const P = LX.Shell.prototype;

  const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  const q = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : "'" + s.replace(/'/g, "'\\''") + "'");

  const NGINX_PAGE = '<!DOCTYPE html>\n<html>\n<head>\n<title>Welcome to nginx!</title>\n<style>\nhtml { color-scheme: light dark; }\nbody { width: 35em; margin: 0 auto;\nfont-family: Tahoma, Verdana, Arial, sans-serif; }\n</style>\n</head>\n<body>\n<h1>Welcome to nginx!</h1>\n<p>If you see this page, the nginx web server is successfully installed and\nworking. Further configuration is required.</p>\n\n<p>For online documentation and support please refer to\n<a href="http://nginx.org/">nginx.org</a>.<br/>\nCommercial support is available at\n<a href="http://nginx.com/">nginx.com</a>.</p>\n\n<p><em>Thank you for using nginx.</em></p>\n</body>\n</html>\n';
  const CAT = {
    'hello-world': { size: '13.3kB', mb: 0.01, kind: 'hello', tags: ['latest'], layers: 1 },
    ubuntu: { size: '78.1MB', mb: 78.1, kind: 'os', os: 'ubuntu', tags: ['latest', '24.04', '22.04', '20.04'], cmd: ['bash'], layers: 1 },
    debian: { size: '117MB', mb: 117, kind: 'os', os: 'debian', tags: ['latest', 'bookworm', '12'], cmd: ['bash'], layers: 1 },
    alpine: { size: '8.83MB', mb: 8.8, kind: 'os', os: 'alpine', tags: ['latest', '3.20', '3.19'], cmd: ['/bin/sh'], layers: 1 },
    busybox: { size: '4.26MB', mb: 4.3, kind: 'os', os: 'busybox', tags: ['latest', '1.36'], cmd: ['sh'], layers: 1 },
    nginx: { size: '192MB', mb: 192, kind: 'nginx', tags: ['latest', '1.27', 'alpine', 'stable'], cmd: ['nginx', '-g', 'daemon off;'], expose: [80], layers: 6 },
    httpd: { size: '148MB', mb: 148, kind: 'httpd', tags: ['latest', '2.4'], cmd: ['httpd-foreground'], expose: [80], layers: 5 },
    python: { size: '1.02GB', mb: 1020, kind: 'os', os: 'debian', tags: ['latest', '3.12', '3.12-slim', '3.11', 'slim'], cmd: ['python3'], layers: 7 },
    node: { size: '1.1GB', mb: 1100, kind: 'os', os: 'debian', tags: ['latest', '20', '22', '20-alpine'], cmd: ['node'], layers: 7 },
    redis: { size: '117MB', mb: 117, kind: 'redis', tags: ['latest', '7', '7-alpine'], cmd: ['redis-server'], expose: [6379], layers: 6 },
    mysql: { size: '586MB', mb: 586, kind: 'mysql', tags: ['latest', '8.0', '8.4'], cmd: ['mysqld'], expose: [3306], layers: 10 },
    postgres: { size: '434MB', mb: 434, kind: 'pg', tags: ['latest', '16', '15'], cmd: ['postgres'], expose: [5432], layers: 12 },
  };

  const D = (sh) => sh.docker || (sh.docker = { images: [], containers: [], volumes: new Map(), networks: new Map([['bridge', { driver: 'bridge', subnet: '172.17.0.0/16', gw: '172.17.0.1', next: 2, id: hex(12) }], ['host', { driver: 'host', id: hex(12) }], ['none', { driver: 'null', id: hex(12) }]]), nets: 0, cache: new Set(), ipSeq: 0 });

  /* ---------- registry ---------- */
  function parseRef(ref) {
    let r = ref.replace(/^docker\.io\/(library\/)?/, '');
    let tag = 'latest';
    const m = /^(.*?)(?::([\w.-]+))?$/.exec(r);
    r = m[1];
    if (m[2]) tag = m[2];
    return { repo: r, tag };
  }
  const findImage = (sh, ref) => {
    const { repo, tag } = parseRef(ref);
    return D(sh).images.find((i) => i.repo === repo && i.tag === tag) || D(sh).images.find((i) => i.id.startsWith(ref));
  };
  const addImage = (sh, rec) => {
    const d = D(sh);
    const ex = d.images.find((i) => i.repo === rec.repo && i.tag === rec.tag);
    if (ex) d.images.splice(d.images.indexOf(ex), 1);
    d.images.unshift(rec);
    return rec;
  };
  const dockerOk = (c) => {
    const sh = c.sh;
    if (!sh.installed.has('docker.io')) {
      c.err('Command \'docker\' not found, but can be installed with:\n\nsudo apt install docker.io   # version 24.0.7-0ubuntu4.1, or\nsudo apt install podman-docker  # version 4.9.3+ds1-1ubuntu0.2\n\n');
      return 127;
    }
    const svc = sh.services.docker;
    if (sh.eu() !== 'root' && !sh.groupsOf(sh.eu()).includes('docker')) {
      if (svc && svc.active) {
        c.err('permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/containers/json": dial unix /var/run/docker.sock: connect: permission denied\n');
        return 1;
      }
    }
    if (!svc || !svc.active) {
      c.err('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n');
      return 1;
    }
    return 0;
  };
  async function pull(c, ref, quiet) {
    const sh = c.sh;
    const { repo, tag } = parseRef(ref);
    const cat = CAT[repo];
    if (!sh.netUp()) {
      c.err(`Error response from daemon: Get "https://registry-1.docker.io/v2/": dial tcp: lookup registry-1.docker.io on 127.0.0.53:53: server misbehaving\n`);
      return null;
    }
    if (!cat) {
      c.err(`Error response from daemon: pull access denied for ${repo}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied\n`);
      return null;
    }
    if (!cat.tags.includes(tag)) {
      c.err(`Error response from daemon: manifest for ${repo}:${tag} not found: manifest unknown: manifest unknown\n`);
      return null;
    }
    const ex = findImage(sh, repo + ':' + tag);
    if (!quiet) {
      if (!/:/.test(ref)) c.out('Using default tag: latest\n');
      c.out(`${tag}: Pulling from library/${repo}\n`);
      if (ex) c.out(`Digest: sha256:${ex.digest}\nStatus: Image is up to date for ${repo}:${tag}\ndocker.io/library/${repo}:${tag}\n`);
      else {
        for (let i = 0; i < cat.layers; i++) c.out(`${hex(12)}: Pull complete\n`);
      }
    }
    if (ex) return ex;
    const rec = addImage(sh, { repo, tag, id: hex(12), size: cat.size, mb: cat.mb, created: Date.now() - 12 * 86400000, base: repo, cat, ops: [], cmd: cat.cmd || [], entry: [], expose: cat.expose || [], env: {}, workdir: '', digest: hex(64) });
    if (!quiet) c.out(`Digest: sha256:${rec.digest}\nStatus: Downloaded newer image for ${repo}:${tag}\ndocker.io/library/${repo}:${tag}\n`);
    return rec;
  }

  /* ---------- container shell ---------- */
  function makeShell(sh, img, ct) {
    const cs = new LX.Shell({ fast: true });
    cs.user = 'root';
    cs._eu = null;
    cs.cwd = '/';
    cs.hostname = ct.id.slice(0, 12);
    cs.vars.HOME = '/root';
    cs.vars.USER = 'root';
    cs.vars.HOSTNAME = ct.id.slice(0, 12);
    cs.isContainer = true;
    cs.users.learner && delete cs.users.learner;
    for (const dpath of ['/root', '/home', '/srv', '/mnt', '/media']) { const dn = cs.fs.lookup(dpath); if (dn && dn.kids) dn.kids = {}; }
    cs.fs.mkdirp('/root', { owner: 'root', group: 'root' });
    cs.vars.PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
    const base = img.cat || CAT[img.base] || {};
    const osrel = { ubuntu: 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.1 LTS (Noble Numbat)"\nID=ubuntu\nID_LIKE=debian\n', debian: 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nID=debian\n', alpine: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.20.3\nPRETTY_NAME="Alpine Linux v3.20"\nHOME_URL="https://alpinelinux.org/"\n', busybox: '' }[base.os || 'ubuntu'];
    if (osrel) cs.writeFile('/etc/os-release', osrel, false);
    if (base.kind === 'nginx') {
      cs.fs.mkdirp('/usr/share/nginx/html', { owner: 'root', group: 'root' });
      cs.writeFile('/usr/share/nginx/html/index.html', NGINX_PAGE, false);
      cs.writeFile('/usr/share/nginx/html/50x.html', '<html><body><h1>An error occurred.</h1></body></html>\n', false);
      cs.fs.mkdirp('/etc/nginx/conf.d', { owner: 'root', group: 'root' });
      cs.writeFile('/etc/nginx/conf.d/default.conf', 'server {\n    listen       80;\n    server_name  localhost;\n    location / {\n        root   /usr/share/nginx/html;\n        index  index.html index.htm;\n    }\n}\n', false);
    }
    if (base.kind === 'httpd') {
      cs.fs.mkdirp('/usr/local/apache2/htdocs', { owner: 'root', group: 'root' });
      cs.writeFile('/usr/local/apache2/htdocs/index.html', '<html><body><h1>It works!</h1></body></html>\n', false);
    }
    return cs;
  }
  async function applyOps(c, cs, img) {
    const quiet = { stdin: '', stdout: () => {}, stderr: () => {}, tty: false };
    for (const op of img.ops) {
      if (op.t === 'env') Object.assign(cs.vars, op.env);
      else if (op.t === 'workdir') { cs.fs.mkdirp(op.dir, { owner: 'root', group: 'root' }); cs.cwd = op.dir; }
      else if (op.t === 'copy') {
        const dest = op.dest.startsWith('/') ? op.dest : VFS.norm(op.dest, cs.cwd);
        for (const f of op.files) {
          const target = op.files.length > 1 || op.dest.endsWith('/') || (cs.fs.lookup(dest) && cs.fs.lookup(dest).t === 'd') ? dest.replace(/\/$/, '') + '/' + f.name : dest;
          cs.fs.mkdirp(VFS.dirname(target), { owner: 'root', group: 'root' });
          const par = cs.fs.lookup(VFS.dirname(target));
          par.kids[VFS.base(target)] = cs.fs.clone(f.node);
          par.kids[VFS.base(target)].owner = 'root';
          par.kids[VFS.base(target)].group = 'root';
        }
      } else if (op.t === 'run') await cs.runSource(op.cmd, quiet);
    }
    if (img.workdir) { cs.fs.mkdirp(img.workdir, { owner: 'root', group: 'root' }); cs.cwd = img.workdir; }
  }

  /* container servers */
  function startServer(sh, ct) {
    const cs = ct.cs;
    const base = (ct.img.cat || CAT[ct.img.base] || {}).kind;
    const log = (s) => { ct.logs += s; };
    const serve = (root, name, port) => {
      cs.listeners[port] = {
        proto: 'tcp', proc: name, pid: 1, user: 'root',
        handler: async (req) => {
          const pth = decodeURIComponent(req.path.split('?')[0]);
          let abs = root + (pth === '/' ? '/index.html' : pth);
          let n = cs.fs.lookup(abs);
          if (n && n.t === 'd') { abs = abs.replace(/\/$/, '') + '/index.html'; n = cs.fs.lookup(abs); }
          const ts = U.strftime('%d/%b/%Y:%H:%M:%S +0000', new Date());
          const status = n && n.t === 'f' ? 200 : 404;
          const body = status === 200 ? cs.readFile(abs) : '<html>\n<head><title>404 Not Found</title></head>\n<body>\n<center><h1>404 Not Found</h1></center>\n<hr><center>nginx/1.27.2</center>\n</body>\n</html>\n';
          log(name === 'nginx' ? `${req.clientIp || '172.17.0.1'} - - [${ts}] "${req.method} ${req.path} HTTP/1.1" ${status} ${body.length} "-" "${req.ua || 'curl/8.5.0'}" "-"\n` : `${req.clientIp || '172.17.0.1'} - - [${ts}] "${req.method} ${req.path} HTTP/1.1" ${status} ${body.length}\n`);
          return { status, headers: { Server: name === 'nginx' ? 'nginx/1.27.2' : 'Apache/2.4.62 (Unix)', 'Content-Type': 'text/html' }, body };
        },
      };
    };
    if (base === 'nginx') {
      serve('/usr/share/nginx/html', 'nginx', 80);
      log('/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration\n/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/\n/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh\n10-listen-on-ipv6-by-default.sh: info: Getting the checksum of /etc/nginx/conf.d/default.conf\n/docker-entrypoint.sh: Configuration complete; ready for start up\n2026/10/27 03:20:01 [notice] 1#1: nginx/1.27.2\n2026/10/27 03:20:01 [notice] 1#1: start worker processes\n');
    } else if (base === 'httpd') {
      serve('/usr/local/apache2/htdocs', 'httpd', 80);
      log('AH00558: httpd: Could not reliably determine the server\'s fully qualified domain name, using 172.17.0.2. Set the \'ServerName\' directive globally to suppress this message\n[Tue Oct 27 03:20:01.123456 2026] [mpm_event:notice] [pid 1:tid 1] AH00489: Apache/2.4.62 (Unix) configured -- resuming normal operations\n');
    } else if (base === 'redis') {
      cs.listeners[6379] = { proto: 'tcp', proc: 'redis-server', pid: 1, user: 'root', handler: async () => ({ status: 200, headers: {}, body: '-ERR wrong number of arguments\r\n' }) };
      log('1:C 27 Oct 2026 03:20:01.000 # oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo\n1:M 27 Oct 2026 03:20:01.010 * Ready to accept connections tcp\n');
    }
  }
  const nextIp = (sh, netName) => {
    const n = D(sh).networks.get(netName);
    if (!n || !n.subnet) return '127.0.0.1';
    const base = n.subnet.split('/')[0].split('.').slice(0, 3).join('.');
    return base + '.' + n.next++;
  };
  function syncHosts(sh, netName) {
    const d = D(sh);
    const peers = d.containers.filter((x) => x.running && x.net === netName && x.cs);
    const user = netName !== 'bridge';
    for (const a of peers) {
      let hosts = '127.0.0.1\tlocalhost\n::1\tlocalhost ip6-localhost ip6-loopback\n' + `${a.ip}\t${a.id.slice(0, 12)}\n`;
      if (user) for (const b of peers) if (b !== a) hosts += `${b.ip}\t${b.name}${b.alias ? ' ' + b.alias : ''}\n`;
      a.cs.writeFile('/etc/hosts', hosts, false);
      a.cs.ownIpList = [a.ip, '127.0.0.1'];
    }
  }
  function publish(sh, ct, c) {
    for (const [hp, cp] of ct.ports) {
      if (sh.listeners[hp]) {
        ct.running = false;
        throw new Error(`Bind for 0.0.0.0:${hp} failed: port is already allocated`);
      }
    }
    for (const [hp, cp] of ct.ports) {
      sh.listeners[hp] = { proto: 'tcp', proc: 'docker-proxy', pid: 3000 + hp % 1000, user: 'root', dockerOf: ct, handler: async (req) => {
        const l = ct.cs && ct.cs.listeners[cp];
        if (!ct.running || !l) return { status: 502, headers: {}, body: '' };
        return await l.handler(Object.assign({}, req, { port: cp, clientIp: '172.17.0.1' }));
      } };
    }
  }
  function unpublish(sh, ct) {
    for (const [hp] of ct.ports) if (sh.listeners[hp] && sh.listeners[hp].dockerOf === ct) delete sh.listeners[hp];
  }
  async function startContainer(c, ct) {
    const sh = c.sh;
    const d = D(sh);
    if (ct.running) return;
    ct.cs = ct.cs || makeShell(sh, ct.img, ct);
    if (!ct.prepared) {
      await applyOps(c, ct.cs, ct.img);
      Object.assign(ct.cs.vars, ct.env);
      for (const [host, dest] of ct.binds) {
        const hn = host.startsWith('/') ? sh.fs.lookup(host) : null;
        let node;
        if (host.startsWith('/')) {
          if (!hn) sh.fs.mkdirp(host, { owner: 'root', group: 'root' });
          node = sh.fs.lookup(host);
        } else {
          if (!d.volumes.has(host)) d.volumes.set(host, { node: sh.fs.mk('d', { owner: 'root', group: 'root' }), created: Date.now(), driver: 'local' });
          node = d.volumes.get(host).node;
        }
        cs_mount(ct.cs, dest, node);
      }
      if (ct.workdir) { ct.cs.fs.mkdirp(ct.workdir, { owner: 'root', group: 'root' }); ct.cs.cwd = ct.workdir; }
      ct.prepared = true;
    }
    const net = d.networks.get(ct.net);
    if (!ct.ip) ct.ip = ct.net === 'host' ? '192.168.1.10' : nextIp(sh, ct.net);
    ct.running = true;
    ct.exited = null;
    ct.cs.ownIps = () => [ct.ip, '127.0.0.1'];
    syncHosts(sh, ct.net);
    try { publish(sh, ct, c); } catch (e) { ct.running = false; throw e; }
    ct.startedAt = Date.now();
    startServer(sh, ct);
    if (ct.cmdline) {
      const bg = ct.detached || ct.img.expose.length;
      const io = { stdin: '', stdout: (s) => (ct.logs += s), stderr: (s) => (ct.logs += s), tty: false };
      const kind = (ct.img.cat || CAT[ct.img.base] || {}).kind;
      if (!['nginx', 'httpd', 'redis'].includes(kind) || ct.userCmd) {
        const line = ct.cmdline;
        if (bg && /http\.server|\bsleep\b|tail -f|while true|node |nc -l|flask|uvicorn|gunicorn/.test(line)) {
          ct.cs.runSource(line + ' &', io).catch(() => {});
        } else {
          const st = await ct.cs.runSource(line, io);
          if (!(bg && /^(bash|sh|\/bin\/sh|\/bin\/bash)$/.test(line.trim()))) { ct.running = false; ct.exited = st; unpublish(sh, ct); syncHosts(sh, ct.net); ct.finished = Date.now(); }
        }
      }
    }
  }
  function cs_mount(cs, dest, node) {
    cs.fs.mkdirp(VFS.dirname(dest), { owner: 'root', group: 'root' });
    cs.fs.lookup(VFS.dirname(dest)).kids[VFS.base(dest)] = node;
  }
  function stopContainer(sh, ct, code) {
    if (!ct.running) return;
    ct.running = false;
    ct.exited = code === undefined ? 0 : code;
    ct.finished = Date.now();
    unpublish(sh, ct);
    syncHosts(sh, ct.net);
    if (ct.cs) for (const k of Object.keys(ct.cs.listeners)) if (ct.cs.listeners[k].proc !== 'nginx' && ct.cs.listeners[k].proc !== 'httpd') delete ct.cs.listeners[k];
  }

  /* attach (interactive session inside the container) */
  async function attach(c, ct, shellCmd, stopOnExit) {
    const sh = c.sh;
    if (!sh.hooks.readLine) { return await ct.cs.runSource(shellCmd, c.io); }
    const KEEP = new Set(['hooks', 'aborted', 'history', 'log', 'last', 'errSink', 'fast', 'cols', 'notices', 'status', 'loopGuard', 'startTime']);
    const saved = {};
    for (const k of Object.keys(sh)) saved[k] = sh[k];
    const cs = ct.cs;
    cs.userStack = [];
    for (const k of Object.keys(cs)) if (!KEEP.has(k)) sh[k] = cs[k];
    sh.userStack = [];
    sh.userStack.push({
      user: saved.user, cwd: saved.cwd,
      restore: () => {
        for (const k of Object.keys(cs)) if (!KEEP.has(k)) cs[k] = sh[k];
        for (const k of Object.keys(saved)) if (!KEEP.has(k)) sh[k] = saved[k];
        sh.user = saved.user;
        if (stopOnExit) stopContainer(sh, ct, 0);
      },
    });
    c.out(`\x1b[2m(You are now inside container ${ct.name}. Type exit to come back to the host.)\x1b[0m\n`);
    return 0;
  }

  /* ---------- container records ---------- */
  const nameGen = () => { const a = ['quirky', 'brave', 'happy', 'clever', 'eager', 'gentle', 'jolly', 'lucid']; const b = ['turing', 'hopper', 'ritchie', 'lovelace', 'torvalds', 'knuth', 'thompson', 'curie']; return a[Math.floor(Math.random() * a.length)] + '_' + b[Math.floor(Math.random() * b.length)]; };
  const ago = (ms) => { const s = Math.floor((Date.now() - ms) / 1000); if (s < 5) return 'Less than a second'; if (s < 60) return `${s} seconds`; if (s < 3600) return `${Math.floor(s / 60)} minute${s >= 120 ? 's' : ''}`; if (s < 86400) return `${Math.floor(s / 3600)} hour${s >= 7200 ? 's' : ''}`; return `${Math.floor(s / 86400)} day${s >= 172800 ? 's' : ''}`; };
  const statusOf = (ct) => (ct.running ? `Up ${ago(ct.startedAt)}` : ct.created && !ct.startedAt ? 'Created' : `Exited (${ct.exited}) ${ago(ct.finished || Date.now())} ago`);
  const findCt = (sh, ref) => D(sh).containers.find((x) => x.name === ref || x.id === ref || x.id.startsWith(ref));
  const portsStr = (ct) => (ct.running ? [...ct.ports].map(([h, cp]) => `0.0.0.0:${h}->${cp}/tcp, [::]:${h}->${cp}/tcp`).join(', ') + (!ct.ports.length ? ct.img.expose.map((e) => `${e}/tcp`).join(', ') : '') : '');
  const cmdShown = (ct) => { const t = ct.shown || ct.cmdline || ct.img.entry.concat(ct.img.cmd).join(' ') || ''; return '"' + t.slice(0, 20) + (t.length > 20 ? '…' : '') + '"'; };

  const tbl = (rows) => {
    const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)) + 3);
    return rows.map((r) => r.map((x, i) => (i === r.length - 1 ? String(x) : String(x).padEnd(w[i]))).join('') + '\n').join('');
  };
  function hello() {
    return '\nHello from Docker!\nThis message shows that your installation appears to be working correctly.\n\nTo generate this message, Docker took the following steps:\n 1. The Docker client contacted the Docker daemon.\n 2. The Docker daemon pulled the "hello-world" image from the Docker Hub.\n    (amd64)\n 3. The Docker daemon created a new container from that image which runs the\n    executable that produces the output you are currently reading.\n 4. The Docker daemon streamed that output to the Docker client, which sent it\n    to your terminal.\n\nTo try something more ambitious, you can run an Ubuntu container with:\n $ docker run -it ubuntu bash\n\nShare images, automate workflows, and more with a free Docker ID:\n https://hub.docker.com/\n\nFor more examples and ideas, visit:\n https://docs.docker.com/get-started/\n\n';
  }

  async function createContainer(c, imgRef, args, o) {
    const sh = c.sh;
    const d = D(sh);
    let img = findImage(sh, imgRef);
    if (!img) {
      const { repo, tag } = parseRef(imgRef);
      c.err(`Unable to find image '${repo}:${tag}' locally\n`);
      img = await pull(c, imgRef, false);
      if (!img) return null;
    }
    const name = o.name || nameGen();
    if (d.containers.some((x) => x.name === name)) {
      c.err(`docker: Error response from daemon: Conflict. The container name "/${name}" is already in use by container "${d.containers.find((x) => x.name === name).id}". You have to remove (or rename) that container to be able to reuse that name.\nSee 'docker run --help'.\n`);
      return null;
    }
    const kind = (img.cat || CAT[img.base] || {}).kind;
    const ct = { id: hex(64), name, img, env: Object.assign({}, img.env, o.env || {}), ports: o.ports || [], binds: o.binds || [], net: o.net || 'bridge', detached: !!o.d, running: false, logs: '', created: Date.now(), workdir: o.workdir || '', rm: !!o.rm, restart: o.restart || 'no', alias: o.alias, mem: (() => { const m = /^(\d+)([kmg]?)b?$/i.exec(o.memory || o.m || ''); return m ? +m[1] * ({ '': 1, k: 1024, m: 1048576, g: 1073741824 }[m[2].toLowerCase()]) : 0; })() };
    ct.userCmd = args.length > 0;
    ct.cmdline = args.length ? args.map(q).join(' ') : img.entry.concat(img.cmd).map(q).join(' ');
    if (!args.length && img.cmdShell) ct.cmdline = img.cmdShell;
    if (!d.networks.has(ct.net)) { c.err(`docker: Error response from daemon: network ${ct.net} not found.\n`); return null; }
    ct.kind = kind;
    d.containers.unshift(ct);
    return ct;
  }

  function parseRunArgs(args) {
    const o = { ports: [], binds: [], env: {} };
    let i = 0;
    for (; i < args.length; i++) {
      const a = args[i];
      if (!a.startsWith('-')) break;
      const val = () => args[++i];
      if (a === '-d' || a === '--detach') o.d = true;
      else if (a === '-it' || a === '-ti') { o.i = true; o.t = true; }
      else if (a === '-i' || a === '--interactive') o.i = true;
      else if (a === '-t' || a === '--tty') o.t = true;
      else if (a === '--rm') o.rm = true;
      else if (a === '--name') o.name = val();
      else if (a.startsWith('--name=')) o.name = a.slice(7);
      else if (a === '-p' || a === '--publish') { const p = val(); const m = /^(?:[\d.]+:)?(\d+):(\d+)(?:\/\w+)?$/.exec(p); if (m) o.ports.push([+m[1], +m[2]]); else o.badPort = p; }
      else if (a === '-P') o.P = true;
      else if (a === '-v' || a === '--volume') { const v = val().split(':'); o.binds.push([v[0], v[1], v[2]]); }
      else if (a === '-e' || a === '--env') { const e = val(); const k = e.split('=')[0]; o.env[k] = e.includes('=') ? e.slice(e.indexOf('=') + 1) : ''; }
      else if (a === '--network' || a === '--net') o.net = val();
      else if (a === '--network-alias') o.alias = val();
      else if (a === '-w' || a === '--workdir') o.workdir = val();
      else if (a === '--restart') o.restart = val();
      else if (a === '-u' || a === '--user' || a === '-m' || a === '--memory' || a === '--cpus' || a === '--hostname' || a === '-h' || a === '--entrypoint' || a === '--env-file' || a === '-l' || a === '--label') o[a.replace(/^-+/, '')] = val();
      else if (a.startsWith('-')) continue;
    }
    return { o, image: args[i], rest: args.slice(i + 1) };
  }

  /* ---------- docker command ---------- */
  def('docker', async (c, args) => {
    const sh = c.sh;
    const d0 = args[0];
    if (!sh.installed.has('docker.io') && d0 !== '--version') return dockerOk(c);
    if (d0 === '--version' || d0 === '-v') return c.out('Docker version 27.3.1, build ce12230\n'), 0;
    if (!d0 || d0 === '--help' || d0 === 'help') {
      c.out('Usage:  docker [OPTIONS] COMMAND\n\nA self-sufficient runtime for containers\n\nCommon Commands:\n  run         Create and run a new container from an image\n  exec        Execute a command in a running container\n  ps          List containers\n  build       Build an image from a Dockerfile\n  pull        Download an image from a registry\n  push        Upload an image to a registry\n  images      List images\n  login       Authenticate to a registry\n  logout      Log out from a registry\n  search      Search Docker Hub for images\n  version     Show the Docker version information\n  info        Display system-wide information\n\nManagement Commands:\n  container   Manage containers\n  image       Manage images\n  network     Manage networks\n  volume      Manage volumes\n  system      Manage Docker\n  compose     Docker Compose\n\nRun \'docker COMMAND --help\' for more information on a command.\n');
      return 0;
    }
    let rc = dockerOk(c);
    if (rc) return rc;
    const d = D(sh);
    let sub = d0;
    let rest = args.slice(1);
    // management command aliases: docker container ls, docker image ls ...
    const MGMT = { container: { ls: 'ps', list: 'ps', ps: 'ps', run: 'run', rm: 'rm', stop: 'stop', start: 'start', logs: 'logs', exec: 'exec', inspect: 'inspect', prune: 'container-prune', restart: 'restart', kill: 'kill' }, image: { ls: 'images', list: 'images', rm: 'rmi', pull: 'pull', prune: 'image-prune', build: 'build', inspect: 'inspect', tag: 'tag', push: 'push', history: 'history' }, system: { df: 'system-df', prune: 'system-prune', info: 'info' } };
    if (MGMT[sub] && rest[0] && MGMT[sub][rest[0]]) { sub = MGMT[sub][rest[0]]; rest = rest.slice(1); }
    const flagsOf = (a) => a.filter((x) => x.startsWith('-'));
    const posOf = (a) => a.filter((x) => !x.startsWith('-'));
    switch (sub) {
      case 'version': c.out('Client: Docker Engine - Community\n Version:           27.3.1\n API version:       1.47\n Go version:        go1.22.7\n OS/Arch:           linux/amd64\n\nServer: Docker Engine - Community\n Engine:\n  Version:          27.3.1\n  API version:      1.47 (minimum version 1.24)\n  OS/Arch:          linux/amd64\n'); return 0;
      case 'info': c.out(`Client: Docker Engine - Community\n Version:    27.3.1\n Context:    default\n\nServer:\n Containers: ${d.containers.length}\n  Running: ${d.containers.filter((x) => x.running).length}\n  Paused: 0\n  Stopped: ${d.containers.filter((x) => !x.running).length}\n Images: ${d.images.length}\n Server Version: 27.3.1\n Storage Driver: overlay2\n Cgroup Driver: systemd\n Cgroup Version: 2\n Default Runtime: runc\n Kernel Version: 6.8.0-45-generic\n Operating System: Ubuntu 24.04.1 LTS\n Docker Root Dir: /var/lib/docker\n`); return 0;
      case 'pull': {
        const ref = posOf(rest)[0];
        if (!ref) { c.err('docker: "docker pull" requires exactly 1 argument.\nSee \'docker pull --help\'.\n'); return 1; }
        return (await pull(c, ref, false)) ? 0 : 1;
      }
      case 'search': { c.out('NAME       DESCRIPTION                                     STARS   OFFICIAL\nnginx      Official build of Nginx.                        20000   [OK]\nubuntu     Ubuntu is a Debian-based Linux operating sys…   17000   [OK]\n'); return 0; }
      case 'images': case 'image-ls': {
        const quiet = flagsOf(rest).includes('-q');
        if (quiet) { d.images.forEach((i) => c.out(i.id + '\n')); return 0; }
        c.out(tbl([['REPOSITORY', 'TAG', 'IMAGE ID', 'CREATED', 'SIZE']].concat(d.images.map((i) => [i.repo, i.tag, i.id, ago(i.created) + ' ago', i.size]))));
        return 0;
      }
      case 'ps': {
        const f = flagsOf(rest);
        const all = f.some((x) => x === '-a' || x === '--all' || x === '-aq' || x === '-qa');
        const quiet = f.some((x) => x === '-q' || x === '-aq' || x === '-qa');
        const fmtI = rest.indexOf('--format');
        const list = d.containers.filter((x) => all || x.running);
        if (quiet) { list.forEach((x) => c.out(x.id.slice(0, 12) + '\n')); return 0; }
        if (fmtI >= 0 || rest.some((x) => x.startsWith('--format='))) {
          let tpl = fmtI >= 0 ? rest[fmtI + 1] : rest.find((x) => x.startsWith('--format=')).slice(9);
          const isTable = /^table\s*/.test(tpl);
          tpl = tpl.replace(/^table\s*/, '').replace(/\\t/g, '\t');
          const fill = (x) => tpl.replace(/\{\{\.Names\}\}/g, x.name).replace(/\{\{\.ID\}\}/g, x.id.slice(0, 12)).replace(/\{\{\.Image\}\}/g, x.img.repo + ':' + x.img.tag).replace(/\{\{\.Status\}\}/g, statusOf(x)).replace(/\{\{\.Ports\}\}/g, portsStr(x)).replace(/\{\{\.State\}\}/g, x.running ? 'running' : 'exited').replace(/\{\{\.Command\}\}/g, cmdShown(x)).replace(/\{\{\.CreatedAt\}\}/g, new Date(x.created).toISOString());
          if (isTable) {
            const head = tpl.replace(/\{\{\.Names\}\}/g, 'NAMES').replace(/\{\{\.ID\}\}/g, 'CONTAINER ID').replace(/\{\{\.Image\}\}/g, 'IMAGE').replace(/\{\{\.Status\}\}/g, 'STATUS').replace(/\{\{\.Ports\}\}/g, 'PORTS').replace(/\{\{\.State\}\}/g, 'STATE').replace(/\{\{\.Command\}\}/g, 'COMMAND').replace(/\{\{\.CreatedAt\}\}/g, 'CREATED AT');
            const rows = [head.split('\t')].concat(list.map((x) => fill(x).split('\t')));
            const w = rows[0].map((_, k) => Math.max(...rows.map((r) => (r[k] || '').length)) + 3);
            rows.forEach((r) => c.out(r.map((v, k) => (k < r.length - 1 ? v.padEnd(w[k]) : v)).join('') + '\n'));
          } else list.forEach((x) => c.out(fill(x) + '\n'));
          return 0;
        }
        c.out(tbl([['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES']].concat(list.map((x) => [x.id.slice(0, 12), x.img.repo + (x.img.tag === 'latest' ? '' : ':' + x.img.tag), cmdShown(x), ago(x.created) + ' ago', statusOf(x), portsStr(x), x.name]))));
        return 0;
      }
      case 'run': case 'create': {
        const { o, image, rest: cmd } = parseRunArgs(rest);
        if (!image) { c.err('docker: "docker run" requires at least 1 argument.\nSee \'docker run --help\'.\n\nUsage:  docker run [OPTIONS] IMAGE [COMMAND] [ARG...]\n'); return 125; }
        if (o.badPort) { c.err(`docker: invalid containerPort: ${o.badPort}.\nSee 'docker run --help'.\n`); return 125; }
        const ct = await createContainer(c, image, o.entrypoint ? [o.entrypoint, ...cmd] : cmd, o);
        if (!ct) return 125;
        if (o.hostname) ct.hostname = o.hostname;
        if (sub === 'create') { c.out(ct.id + '\n'); return 0; }
        const kind = ct.kind;
        if (kind === 'hello' && !cmd.length) { ct.logs = hello(); c.out(ct.logs); ct.exited = 0; ct.finished = Date.now(); ct.startedAt = Date.now(); if (o.rm) d.containers.splice(d.containers.indexOf(ct), 1); return 0; }
        if (kind === 'mysql' && !ct.env.MYSQL_ROOT_PASSWORD && !ct.env.MYSQL_ALLOW_EMPTY_PASSWORD && !ct.env.MYSQL_RANDOM_ROOT_PASSWORD) {
          const msg = '2026-10-27 03:20:01+00:00 [Note] [Entrypoint]: Entrypoint script for MySQL Server 8.4.3-1.el9 started.\n2026-10-27 03:20:01+00:00 [ERROR] [Entrypoint]: Database is uninitialized and password option is not specified\n    You need to specify one of the following as an environment variable:\n    - MYSQL_ROOT_PASSWORD\n    - MYSQL_ALLOW_EMPTY_PASSWORD\n    - MYSQL_RANDOM_ROOT_PASSWORD\n';
          ct.logs = msg; ct.exited = 1; ct.finished = Date.now(); ct.startedAt = Date.now();
          if (!o.d) c.err(msg); else c.out(ct.id + '\n');
          return o.d ? 0 : 1;
        }
        if (kind === 'pg' && !ct.env.POSTGRES_PASSWORD) {
          const msg = 'Error: Database is uninitialized and superuser password is not specified.\n       You must specify POSTGRES_PASSWORD to a non-empty value for the\n       superuser. For example, "-e POSTGRES_PASSWORD=password" on "docker run".\n';
          ct.logs = msg; ct.exited = 1; ct.finished = Date.now(); ct.startedAt = Date.now();
          if (!o.d) c.err(msg); else c.out(ct.id + '\n');
          return o.d ? 0 : 1;
        }
        if (kind === 'mysql' || kind === 'pg') { ct.logs = `${kind === 'mysql' ? '[Note] [Entrypoint]: Entrypoint script for MySQL Server started.' : 'The files belonging to this database system will be owned by user "postgres".'}\n${kind === 'mysql' ? 'mysqld: ready for connections. Version: 8.4.3  socket: \'/var/run/mysqld/mysqld.sock\'  port: 3306' : 'database system is ready to accept connections'}\n`; ct.cmdline = ''; }
        const isShellCmd = cmd.length ? (cmd.length === 1 && /^(bash|sh|ash|\/bin\/bash|\/bin\/sh)$/.test(cmd[0])) : kind === 'os' && /^(bash|sh|\/bin\/sh)$/.test(ct.img.cmd[0] || '');
        const wantShell = isShellCmd && !!(o.i && o.t);
        ct.shown = ct.cmdline;
        try {
          if (wantShell) ct.cmdline = '';
          await startContainer(c, ct);
        } catch (e) {
          c.err(`docker: Error response from daemon: driver failed programming external connectivity on endpoint ${ct.name} (${hex(64)}): ${e.message}.\n`);
          return 125;
        }
        if (o.d) { c.out(ct.id + '\n'); return 0; }
        if (wantShell) {
          const r = await attach(c, ct, ct.shown, true);
          return r;
        }
        if (ct.running && !o.d) {
          // foreground server: stream logs until Ctrl-C
          c.out(ct.logs);
          try { await sh.waitMs(1e9); } catch (e) { if (!(e instanceof LX.AbortSig)) throw e; sh.aborted = false; }
          stopContainer(sh, ct, 130);
        } else if (ct.logs && ct.kind !== 'hello') c.out(ct.logs);
        const code = ct.exited || 0;
        if (o.rm) d.containers.splice(d.containers.indexOf(ct), 1);
        return code;
      }
      case 'start': case 'restart': {
        let st = 0;
        for (const ref of posOf(rest)) {
          const ct = findCt(sh, ref);
          if (!ct) { c.err(`Error response from daemon: No such container: ${ref}\n`); st = 1; continue; }
          if (sub === 'restart') stopContainer(sh, ct, 0);
          try { await startContainer(c, ct); c.out(ref + '\n'); } catch (e) { c.err(`Error response from daemon: driver failed programming external connectivity on endpoint ${ct.name}: ${e.message}\nError: failed to start containers: ${ct.name}\n`); st = 1; }
        }
        return st;
      }
      case 'stop': case 'kill': {
        let st = 0;
        for (const ref of posOf(rest.filter((x, i) => !(rest[i - 1] === '-t' || rest[i - 1] === '--time' || rest[i - 1] === '-s')))) {
          const ct = findCt(sh, ref);
          if (!ct) { c.err(`Error response from daemon: No such container: ${ref}\n`); st = 1; continue; }
          stopContainer(sh, ct, sub === 'kill' ? 137 : 0);
          c.out(ref + '\n');
        }
        return st;
      }
      case 'rm': {
        const force = flagsOf(rest).some((f) => /^-[a-z]*f/.test(f) || f === '--force');
        let st = 0;
        for (const ref of posOf(rest)) {
          const ct = findCt(sh, ref);
          if (!ct) { c.err(`Error response from daemon: No such container: ${ref}\n`); st = 1; continue; }
          if (ct.running && !force) { c.err(`Error response from daemon: cannot remove container "/${ct.name}": container is running: stop the container before removing or force remove\n`); st = 1; continue; }
          stopContainer(sh, ct, 137);
          d.containers.splice(d.containers.indexOf(ct), 1);
          c.out(ref + '\n');
        }
        return st;
      }
      case 'container-prune': { const gone = d.containers.filter((x) => !x.running); d.containers = d.containers.filter((x) => x.running); c.out(`Deleted Containers:\n${gone.map((x) => x.id).join('\n')}\n\nTotal reclaimed space: 0B\n`); return 0; }
      case 'rmi': {
        let st = 0;
        for (const ref of posOf(rest)) {
          const img = findImage(sh, ref);
          if (!img) { c.err(`Error response from daemon: No such image: ${ref}\n`); st = 1; continue; }
          const used = d.containers.find((x) => x.img === img);
          if (used && !flagsOf(rest).includes('-f')) { c.err(`Error response from daemon: conflict: unable to remove repository reference "${ref}" (must force) - container ${used.id.slice(0, 12)} is using its referenced image ${img.id}\n`); st = 1; continue; }
          d.images.splice(d.images.indexOf(img), 1);
          c.out(`Untagged: ${img.repo}:${img.tag}\nDeleted: sha256:${img.digest || hex(64)}\n`);
        }
        return st;
      }
      case 'image-prune': c.out('Total reclaimed space: 0B\n'); return 0;
      case 'logs': {
        const ref = posOf(rest.filter((x, i) => rest[i - 1] !== '--tail' && rest[i - 1] !== '-n' && rest[i - 1] !== '--since'))[0];
        const ct = findCt(sh, ref);
        if (!ct) { c.err(`Error response from daemon: No such container: ${ref}\n`); return 1; }
        let text = ct.logs;
        const ti = rest.indexOf('--tail');
        if (ti >= 0) { const ls = text.split('\n'); if (ls[ls.length - 1] === '') ls.pop(); text = ls.slice(-rest[ti + 1]).join('\n') + '\n'; }
        c.out(text);
        if (flagsOf(rest).some((f) => f === '-f' || f === '--follow') && ct.running) {
          let seen = ct.logs.length;
          try {
            for (;;) { await sh.waitMs(500); if (ct.logs.length > seen) { c.out(ct.logs.slice(seen)); seen = ct.logs.length; } }
          } catch (e) { if (!(e instanceof LX.AbortSig)) throw e; sh.aborted = false; }
        }
        return 0;
      }
      case 'exec': {
        const f = flagsOf(rest.slice(0, rest.findIndex((x) => !x.startsWith('-') && !['-e', '-w', '-u'].includes(rest[rest.indexOf(x) - 1]))));
        const iIdx = rest.findIndex((x, i) => !x.startsWith('-') && !['-e', '-w', '-u', '--env', '--workdir', '--user'].includes(rest[i - 1]));
        const ref = rest[iIdx];
        const cmd = rest.slice(iIdx + 1);
        const ct = findCt(sh, ref);
        if (!ct) { c.err(`Error response from daemon: No such container: ${ref}\n`); return 1; }
        if (!ct.running) { c.err(`Error response from daemon: container ${ct.id} is not running\n`); return 1; }
        if (!cmd.length) { c.err('docker: "docker exec" requires at least 2 arguments.\n'); return 1; }
        const interactive = rest.slice(0, iIdx).some((x) => /^-[a-z]*[it]/.test(x) && !x.startsWith('--'));
        if (interactive && cmd.length === 1 && /^(bash|sh|ash|\/bin\/bash|\/bin\/sh)$/.test(cmd[0])) return await attach(c, ct, cmd[0], false);
        const line = cmd.map(q).join(' ');
        const ei = rest.indexOf('-e');
        const saveVars = Object.assign({}, ct.cs.vars);
        if (ei >= 0 && ei < iIdx) { const kv = rest[ei + 1].split('='); ct.cs.vars[kv[0]] = kv.slice(1).join('='); }
        const code = await ct.cs.runSource(line, { stdin: '', stdout: c.out, stderr: c.err, tty: false });
        ct.cs.vars = saveVars;
        return code;
      }
      case 'top': { const ct = findCt(sh, rest[0]); if (!ct) { c.err(`Error response from daemon: No such container: ${rest[0]}\n`); return 1; } c.out('UID    PID    PPID   C    STIME   TTY   TIME       CMD\nroot   31022  31001  0    03:20   ?     00:00:00   ' + (ct.cmdline || 'nginx: master process nginx -g daemon off;') + '\n'); return 0; }
      case 'stats': { c.out('CONTAINER ID   NAME             CPU %     MEM USAGE / LIMIT     MEM %     NET I/O       BLOCK I/O   PIDS\n'); d.containers.filter((x) => x.running).forEach((x) => c.out(`${x.id.slice(0, 12)}   ${x.name.padEnd(16)} 0.00%     3.5MiB / 1.9GiB       0.18%     1.2kB / 0B    0B / 0B     3\n`)); return 0; }
      case 'port': { const ct = findCt(sh, rest[0]); if (!ct) { c.err(`Error response from daemon: No such container: ${rest[0]}\n`); return 1; } ct.ports.forEach(([h, cp]) => c.out(`${cp}/tcp -> 0.0.0.0:${h}\n${cp}/tcp -> [::]:${h}\n`)); return 0; }
      case 'inspect': {
        const ref = posOf(rest.filter((x, i) => rest[i - 1] !== '--format' && rest[i - 1] !== '-f'))[0];
        const ct = findCt(sh, ref);
        const img = !ct && findImage(sh, ref);
        if (!ct && !img) { c.err(`Error: No such object: ${ref}\n`); return 1; }
        const fi = Math.max(rest.indexOf('--format'), rest.indexOf('-f'));
        if (ct) {
          const obj = { Id: ct.id, Created: new Date(ct.created).toISOString(), Path: (ct.cmdline || '').split(' ')[0], Args: (ct.cmdline || '').split(' ').slice(1), State: { Status: ct.running ? 'running' : ct.startedAt ? 'exited' : 'created', Running: ct.running, Pid: ct.running ? 31022 : 0, ExitCode: ct.exited || 0, StartedAt: ct.startedAt ? new Date(ct.startedAt).toISOString() : '0001-01-01T00:00:00Z' }, Image: 'sha256:' + ct.img.digest, Name: '/' + ct.name, RestartCount: 0, HostConfig: { NetworkMode: ct.net, PortBindings: Object.fromEntries(ct.ports.map(([h, cp]) => [cp + '/tcp', [{ HostIp: '', HostPort: String(h) }]])), RestartPolicy: { Name: ct.restart }, Memory: ct.mem || 0 }, Mounts: ct.binds.map(([s, dd]) => ({ Type: s.startsWith('/') ? 'bind' : 'volume', Source: s, Destination: dd })), Config: { Hostname: ct.id.slice(0, 12), Env: Object.entries(ct.env).map(([k, v]) => `${k}=${v}`).concat(['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin']), Cmd: (ct.cmdline || '').split(' '), Image: ct.img.repo + ':' + ct.img.tag }, NetworkSettings: { IPAddress: ct.net === 'bridge' ? ct.ip || '' : '', Gateway: ct.net === 'bridge' ? '172.17.0.1' : '', Networks: { [ct.net]: { IPAddress: ct.ip || '', Gateway: (d.networks.get(ct.net) || {}).gw || '' } }, Ports: Object.fromEntries(ct.ports.map(([h, cp]) => [cp + '/tcp', [{ HostIp: '0.0.0.0', HostPort: String(h) }]])) } };
          if (fi >= 0) {
            const fmt = rest[fi + 1];
            const get = (path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);
            const out = fmt.replace(/\{\{\s*\.([\w.]+)\s*\}\}/g, (m, p) => { const v = get(p); return typeof v === 'object' ? JSON.stringify(v) : String(v); }).replace(/\{\{\s*range[^}]*\}\}.*?\{\{end\}\}/g, (m) => (obj.NetworkSettings.IPAddress));
            c.out(out + '\n');
            return 0;
          }
          c.out(JSON.stringify([obj], null, 4) + '\n');
        } else c.out(JSON.stringify([{ Id: 'sha256:' + img.digest, RepoTags: [img.repo + ':' + img.tag], Created: new Date(img.created).toISOString(), Architecture: 'amd64', Os: 'linux', Size: Math.round(img.mb * 1e6), Config: { Cmd: img.cmd, ExposedPorts: Object.fromEntries(img.expose.map((e) => [e + '/tcp', {}])) } }], null, 4) + '\n');
        return 0;
      }
      case 'cp': {
        const [a, b] = rest.filter((x) => !x.startsWith('-'));
        const fromCt = a.includes(':') ? findCt(sh, a.split(':')[0]) : null;
        const toCt = b.includes(':') ? findCt(sh, b.split(':')[0]) : null;
        const src = fromCt ? { shell: fromCt.cs, path: a.split(':')[1] } : { shell: sh, path: c.abs(a) };
        const dst = toCt ? { shell: toCt.cs, path: b.split(':')[1] } : { shell: sh, path: c.abs(b) };
        const sn = src.shell.fs.lookup(src.path);
        if (!sn) { c.err(`Error response from daemon: Could not find the file ${src.path} in container ${fromCt ? fromCt.name : ''}\n`); return 1; }
        let tgt = dst.path;
        const dn = dst.shell.fs.lookup(tgt);
        if (dn && dn.t === 'd') tgt = tgt.replace(/\/$/, '') + '/' + VFS.base(src.path);
        dst.shell.fs.mkdirp(VFS.dirname(tgt), { owner: 'root', group: 'root' });
        dst.shell.fs.lookup(VFS.dirname(tgt)).kids[VFS.base(tgt)] = dst.shell.fs.clone(sn);
        c.out(`Successfully copied ${VFS.size(sn)}B to ${b}\n`);
        return 0;
      }
      case 'rename': { const ct = findCt(sh, rest[0]); if (!ct) { c.err(`Error response from daemon: No such container: ${rest[0]}\n`); return 1; } ct.name = rest[1]; return 0; }
      case 'commit': {
        const pos = posOf(rest.filter((x, i) => rest[i - 1] !== '-m' && rest[i - 1] !== '-a'));
        const ct = findCt(sh, pos[0]);
        if (!ct) { c.err(`Error response from daemon: No such container: ${pos[0]}\n`); return 1; }
        const { repo, tag } = parseRef(pos[1] || 'committed:latest');
        const rec = addImage(sh, Object.assign({}, ct.img, { repo, tag, id: hex(12), digest: hex(64), created: Date.now(), mb: ct.img.mb + 5, size: (ct.img.mb + 5).toFixed(0) + 'MB', ops: ct.img.ops.concat([{ t: 'snapshot' }]), snapshot: ct.cs.fs.clone(ct.cs.fs.lookup('/')) }));
        c.out('sha256:' + rec.digest + '\n');
        return 0;
      }
      case 'tag': {
        if (rest.length < 2) { c.err('"docker tag" requires exactly 2 arguments.\nSee \'docker tag --help\'.\n\nUsage:  docker tag SOURCE_IMAGE[:TAG] TARGET_IMAGE[:TAG]\n'); return 1; }
        const src = findImage(sh, rest[0]);
        if (!src) { c.err(`Error response from daemon: No such image: ${rest[0]}\n`); return 1; }
        const { repo, tag } = parseRef(rest[1]);
        addImage(sh, Object.assign({}, src, { repo, tag }));
        return 0;
      }
      case 'push': {
        const { repo } = parseRef(rest[0] || '');
        if (!sh.dockerLoggedIn) { c.out(`Using default tag: latest\nThe push refers to repository [docker.io/${repo}]\n`); c.err('denied: requested access to the resource is denied\n'); return 1; }
        c.out(`The push refers to repository [docker.io/${repo}]\nlatest: digest: sha256:${hex(64)} size: 1570\n`);
        return 0;
      }
      case 'login': { c.out('Log in with your Docker ID or email address to push and pull images from Docker Hub.\n\x1b[2m(Logging in needs a real Docker Hub account, which this sandbox does not have.)\x1b[0m\n'); c.err('Error response from daemon: Get "https://registry-1.docker.io/v2/": unauthorized: incorrect username or password\n'); return 1; }
      case 'history': { const img = findImage(sh, rest[0]); if (!img) { c.err(`Error response from daemon: No such image: ${rest[0]}\n`); return 1; } c.out('IMAGE          CREATED       CREATED BY                                      SIZE      COMMENT\n' + `${img.id}   12 days ago   CMD ["${(img.cmd[0] || 'bash')}"]                                    0B        buildkit.dockerfile.v0\n<missing>      12 days ago   /bin/sh -c #(nop) ADD file in /               ${img.size}   \n`); return 0; }
      case 'system-df': { c.out(`TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE\nImages          ${d.images.length}         ${d.containers.length}         ${d.images.reduce((s, i) => s + i.mb, 0).toFixed(0)}MB     0B (0%)\nContainers      ${d.containers.length}         ${d.containers.filter((x) => x.running).length}         0B        0B\nLocal Volumes   ${d.volumes.size}         0         0B        0B\n`); return 0; }
      case 'system-prune': { d.containers = d.containers.filter((x) => x.running); c.out('Deleted Containers:\n\nTotal reclaimed space: 0B\n'); return 0; }
      case 'network': {
        const a = rest[0];
        if (a === 'ls') { c.out(tbl([['NETWORK ID', 'NAME', 'DRIVER', 'SCOPE']].concat([...d.networks].map(([n, v]) => [v.id, n, v.driver, 'local'])))); return 0; }
        if (a === 'create') { const n = posOf(rest.slice(1)).pop(); if (d.networks.has(n)) { c.err(`Error response from daemon: network with name ${n} already exists\n`); return 1; } d.nets++; const id = hex(12); d.networks.set(n, { driver: 'bridge', subnet: `172.${17 + d.nets}.0.0/16`, gw: `172.${17 + d.nets}.0.1`, next: 2, id }); c.out(hex(64) + '\n'); return 0; }
        if (a === 'rm') { for (const n of rest.slice(1)) { if (!d.networks.has(n)) { c.err(`Error response from daemon: network ${n} not found\n`); return 1; } if (d.containers.some((x) => x.net === n && x.running)) { c.err(`Error response from daemon: error while removing network: network ${n} id ${d.networks.get(n).id} has active endpoints\n`); return 1; } d.networks.delete(n); c.out(n + '\n'); } return 0; }
        if (a === 'inspect') { const n = d.networks.get(rest[1]); if (!n) { c.err(`Error: No such network: ${rest[1]}\n`); return 1; } c.out(JSON.stringify([{ Name: rest[1], Id: n.id, Driver: n.driver, IPAM: { Config: [{ Subnet: n.subnet, Gateway: n.gw }] }, Containers: Object.fromEntries(d.containers.filter((x) => x.net === rest[1] && x.running).map((x) => [x.id, { Name: x.name, IPv4Address: x.ip + '/16' }])) }], null, 4) + '\n'); return 0; }
        if (a === 'connect') { const ct = findCt(sh, rest[2]); if (ct) { ct.net = rest[1]; ct.ip = nextIp(sh, rest[1]); syncHosts(sh, rest[1]); } return 0; }
        c.err('Usage:  docker network COMMAND\n');
        return 1;
      }
      case 'volume': {
        const a = rest[0];
        if (a === 'ls') { c.out('DRIVER    VOLUME NAME\n'); [...d.volumes].forEach(([n]) => c.out(`local     ${n}\n`)); return 0; }
        if (a === 'create') { const n = rest[1] || hex(64); d.volumes.set(n, { node: sh.fs.mk('d', { owner: 'root', group: 'root' }), created: Date.now(), driver: 'local' }); c.out(n + '\n'); return 0; }
        if (a === 'rm') { for (const n of rest.slice(1)) { if (!d.volumes.has(n)) { c.err(`Error response from daemon: get ${n}: no such volume\n`); return 1; } d.volumes.delete(n); c.out(n + '\n'); } return 0; }
        if (a === 'inspect') { const v = d.volumes.get(rest[1]); if (!v) { c.err(`Error response from daemon: get ${rest[1]}: no such volume\n`); return 1; } c.out(JSON.stringify([{ CreatedAt: new Date(v.created).toISOString(), Driver: 'local', Mountpoint: `/var/lib/docker/volumes/${rest[1]}/_data`, Name: rest[1], Scope: 'local' }], null, 4) + '\n'); return 0; }
        c.err('Usage:  docker volume COMMAND\n');
        return 1;
      }
      case 'build': return await build(c, rest);
      case 'compose': return await compose(c, rest);
    }
    c.err(`docker: '${sub}' is not a docker command.\nSee 'docker --help'\n`);
    return 1;
  }, { pkg: 'docker.io' });

  /* ---------- build ---------- */
  async function build(c, rest) {
    const sh = c.sh;
    const d = D(sh);
    let tag = null;
    let file = 'Dockerfile';
    const pos = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '-t' || rest[i] === '--tag') tag = rest[++i];
      else if (rest[i] === '-f' || rest[i] === '--file') file = rest[++i];
      else if (rest[i].startsWith('--tag=')) tag = rest[i].slice(6);
      else if (rest[i].startsWith('--build-arg') || rest[i] === '--no-cache' || rest[i] === '--pull') continue;
      else if (!rest[i].startsWith('-')) pos.push(rest[i]);
    }
    const ctx = c.abs(pos[0] || '.');
    if (!pos.length) { c.err('docker: \'docker buildx build\' requires 1 argument\n\nUsage:  docker buildx build [OPTIONS] PATH | URL | -\n\nRun \'docker buildx build --help\' for more information\n'); return 1; }
    const dfAbs = VFS.norm(file, file.startsWith('/') ? '/' : ctx);
    const dn = sh.fs.lookup(dfAbs);
    if (!dn) { c.err(`ERROR: failed to solve: failed to read dockerfile: open ${file}: no such file or directory\n`); return 1; }
    const lines = sh.readFile(dfAbs).replace(/\\\n\s*/g, ' ').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    const steps = [];
    for (const l of lines) {
      const m = /^(\w+)\s+(.*)$/.exec(l);
      if (!m) { c.err(`ERROR: failed to solve: dockerfile parse error on line ${lines.indexOf(l) + 1}: unknown instruction: ${l}\n`); return 1; }
      steps.push([m[1].toUpperCase(), m[2]]);
    }
    if (!steps.length || steps[0][0] !== 'FROM') { c.err('ERROR: failed to solve: the Dockerfile cannot be empty\n'); return 1; }
    const t0 = Date.now();
    const baseRef = steps[0][1].split(/\s+/)[0];
    let base = findImage(sh, baseRef);
    const out = [];
    out.push(' => [internal] load build definition from ' + file + '                       0.0s', ` => => transferring dockerfile: ${sh.readFile(dfAbs).length}B                          0.0s`);
    if (!base) {
      const { repo, tag: tg } = parseRef(baseRef);
      if (!CAT[repo] || !CAT[repo].tags.includes(tg)) {
        c.err(`[+] Building 0.9s (2/2) FINISHED\n => ERROR [internal] load metadata for docker.io/library/${repo}:${tg}  0.8s\n------\n > [internal] load metadata for docker.io/library/${repo}:${tg}:\n------\nERROR: failed to solve: ${repo}:${tg}: failed to resolve source metadata for docker.io/library/${repo}:${tg}: docker.io/library/${repo}:${tg}: not found\n`);
        return 1;
      }
      if (!sh.netUp()) { c.err('ERROR: failed to solve: failed to fetch anonymous token: Get "https://auth.docker.io/token": dial tcp: lookup auth.docker.io: Temporary failure in name resolution\n'); return 1; }
      base = await pull(c, baseRef, true);
    }
    out.push(` => [internal] load metadata for docker.io/library/${base.repo}:${base.tag}      0.4s`, ' => [internal] load .dockerignore                                       0.0s');
    const body = steps.slice(1).filter((s) => ['RUN', 'COPY', 'ADD'].includes(s[0]));
    const img = { repo: 'x', tag: 'latest', id: hex(12), digest: hex(64), created: Date.now(), base: base.base, cat: base.cat, mb: base.mb, ops: base.ops.slice(), cmd: base.cmd.slice(), entry: base.entry.slice(), expose: base.expose.slice(), env: Object.assign({}, base.env), workdir: base.workdir, cmdShell: null };
    let n = 0;
    const total = body.length;
    out.push(` => [1/${total + 1}] FROM docker.io/library/${base.repo}:${base.tag}@sha256:${base.digest.slice(0, 12)}…       0.0s`);
    let prefix = base.digest;
    let allCached = true;
    for (const [ins, arg] of steps.slice(1)) {
      if (ins === 'ENV') { const kv = arg.includes('=') ? arg.split(/\s+/).map((p) => p.split('=')) : [arg.split(/\s+/)]; const env = {}; kv.forEach(([k, ...v]) => (env[k] = v.join('=').replace(/^"|"$/g, ''))); Object.assign(img.env, env); img.ops.push({ t: 'env', env }); }
      else if (ins === 'WORKDIR') { img.ops.push({ t: 'workdir', dir: arg }); img.workdir = arg; }
      else if (ins === 'EXPOSE') img.expose = arg.split(/\s+/).map((p) => parseInt(p, 10));
      else if (ins === 'CMD') { try { img.cmd = JSON.parse(arg); img.cmdShell = null; } catch (e) { img.cmd = ['/bin/sh', '-c', arg]; img.cmdShell = arg; } }
      else if (ins === 'ENTRYPOINT') { try { img.entry = JSON.parse(arg); } catch (e) { img.entry = ['/bin/sh', '-c', arg]; } }
      else if (ins === 'RUN' || ins === 'COPY' || ins === 'ADD') {
        n++;
        const key = prefix + '|' + ins + ' ' + arg;
        let extra = '';
        if (ins === 'RUN') {
          const cs = makeShell(sh, img, { id: hex(64) });
          await applyOps(c, cs, img);
          let ob = '';
          cs.workdir = img.workdir;
          const st = await cs.runSource(arg, { stdin: '', stdout: (s) => (ob += s), stderr: (s) => (ob += s), tty: false });
          if (st !== 0) {
            c.err(`[+] Building ${((Date.now() - t0) / 1000 + 1.1).toFixed(1)}s (${n + 3}/${total + 4})\n${out.join('\n')}\n => ERROR [${n + 1}/${total + 1}] RUN ${arg}                                 0.4s\n------\n > [${n + 1}/${total + 1}] RUN ${arg}:\n${ob.split('\n').filter(Boolean).slice(-6).map((l) => '#' + (n + 5) + ' 0.3 ' + l).join('\n')}\n------\nDockerfile:${lines.indexOf(ins + ' ' + arg) + 1}\n--------------------\n  ${String(lines.indexOf(ins + ' ' + arg) + 1).padStart(3)} | ${ins} ${arg}\n--------------------\nERROR: failed to solve: process "/bin/sh -c ${arg}" did not complete successfully: exit code: ${st}\n`);
            return 1;
          }
          img.ops.push({ t: 'run', cmd: arg });
          if (/apt(-get)? install|dnf install|pip install/.test(arg)) img.mb += 60;
        } else {
          const parts = arg.split(/\s+/).filter((x) => !x.startsWith('--'));
          const dest = parts.pop();
          const files = [];
          for (const s of parts) {
            const sabs = VFS.norm(s, ctx);
            const sn = sh.fs.lookup(sabs);
            if (!sn) { c.err(`[+] Building 0.4s (4/5)\nERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref: "/${s}": not found\n`); return 1; }
            if (sn.t === 'd') for (const k of Object.keys(sn.kids)) files.push({ name: k, node: sh.fs.clone(sn.kids[k]) });
            else files.push({ name: VFS.base(sabs), node: sh.fs.clone(sn) });
          }
          img.ops.push({ t: 'copy', dest, files });
          extra = '';
        }
        const cached = d.cache.has(key + '|' + (ins === 'COPY' || ins === 'ADD' ? files_sig(img.ops[img.ops.length - 1]) : ''));
        d.cache.add(key + '|' + (ins === 'COPY' || ins === 'ADD' ? files_sig(img.ops[img.ops.length - 1]) : ''));
        if (!cached) allCached = false;
        prefix = key;
        out.push(` => ${cached ? 'CACHED' : ''} [${n + 1}/${total + 1}] ${ins} ${arg.slice(0, 60)}                          ${cached ? '0.0s' : ins === 'RUN' ? '1.7s' : '0.0s'}`);
      }
    }
    img.mb = Math.round(img.mb * 10) / 10;
    img.size = img.mb >= 1000 ? (img.mb / 1000).toFixed(2) + 'GB' : img.mb.toFixed(img.mb < 10 ? 2 : 0) + 'MB';
    const ref = tag ? parseRef(tag) : { repo: '<none>', tag: '<none>' };
    img.repo = ref.repo;
    img.tag = ref.tag;
    addImage(sh, img);
    out.push(' => exporting to image                                                   0.1s', ' => => exporting layers                                                  0.1s', ` => => writing image sha256:${img.digest.slice(0, 12)}…                       0.0s`, ` => => naming to docker.io/library/${ref.repo}:${ref.tag}                   0.0s`);
    c.err(`[+] Building ${((Date.now() - t0) / 1000 + 1.4).toFixed(1)}s (${out.length - 4}/${out.length - 4}) FINISHED                          docker:default\n${out.join('\n')}\n`);
    return 0;
  }
  const files_sig = (op) => op.files.map((f) => f.name + ':' + (f.node.content || '').length + ':' + hashStr(f.node.content || '')).join(',');
  const hashStr = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };

  /* ---------- compose ---------- */
  async function compose(c, rest) {
    const sh = c.sh;
    const d = D(sh);
    if (!sh.installed.has('docker-compose-v2')) { c.err("docker: 'compose' is not a docker command.\nSee 'docker --help'\n"); return 1; }
    let file = null;
    const args = [];
    for (let i = 0; i < rest.length; i++) { if (rest[i] === '-f' || rest[i] === '--file') file = rest[++i]; else if (rest[i] === '-p' || rest[i] === '--project-name') i++; else args.push(rest[i]); }
    const f = file || ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'].find((x) => sh.fs.lookup(VFS.norm(x, sh.cwd)));
    if (!f) { c.err('no configuration file provided: not found\n'); return 1; }
    let y;
    try { y = LX.yaml.parse(sh.readFile(VFS.norm(f, sh.cwd))); } catch (e) { c.err(`yaml: ${e.message}\n`); return 1; }
    if (!y || !y.services) { c.err('services must be a mapping\n'); return 15; }
    const project = VFS.base(VFS.norm('.', sh.cwd)).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const net = project + '_default';
    const svcs = Object.keys(y.services);
    const act = args[0];
    const ctOf = (s) => d.containers.find((x) => x.name === `${project}-${s}-1`);
    const order = (() => { const seen = []; const visit = (s) => { if (seen.includes(s)) return; const dep = (y.services[s] || {}).depends_on; const names = Array.isArray(dep) ? dep : dep && typeof dep === 'object' ? Object.keys(dep) : []; names.forEach(visit); seen.push(s); }; svcs.forEach(visit); return seen; })();
    if (act === 'config') { c.out(LX.yaml.dump({ name: project, services: y.services })); return 0; }
    if (act === 'ps' || act === 'ls') {
      const all = args.includes('-a');
      c.out(tbl([['NAME', 'IMAGE', 'COMMAND', 'SERVICE', 'CREATED', 'STATUS', 'PORTS']].concat(svcs.map((s) => ctOf(s)).filter((ct) => ct && (all || ct.running)).map((ct) => [ct.name, ct.img.repo + ':' + ct.img.tag, cmdShown(ct), ct.alias, ago(ct.created) + ' ago', statusOf(ct), portsStr(ct)]))));
      return 0;
    }
    if (act === 'up') {
      const lines = [];
      if (!d.networks.has(net)) { d.nets++; d.networks.set(net, { driver: 'bridge', subnet: `172.${17 + d.nets}.0.0/16`, gw: `172.${17 + d.nets}.0.1`, next: 2, id: hex(12) }); lines.push(` ✔ Network ${net}   Created   0.1s`); }
      for (const s of order) {
        const spec = y.services[s] || {};
        let img;
        if (spec.build) {
          const ctxDir = typeof spec.build === 'string' ? spec.build : spec.build.context || '.';
          const bo = await build(Object.assign({}, c, { err: () => {} }), ['-t', `${project}-${s}`, ctxDir]);
          if (bo) { c.err(`failed to solve: build of service ${s} failed\n`); return 1; }
          img = findImage(sh, `${project}-${s}`);
        } else {
          img = findImage(sh, spec.image || '');
          if (!img) { img = await pull(Object.assign({}, c, { out: () => {} }), spec.image || '', true); if (!img) { c.err(`pull access denied for ${spec.image}, repository does not exist or may require 'docker login'\n`); return 1; } }
        }
        let ct = ctOf(s);
        if (!ct) {
          const env = {};
          const e = spec.environment;
          if (Array.isArray(e)) e.forEach((x) => { const k = String(x).split('='); env[k[0]] = k.slice(1).join('='); }); else if (e) Object.assign(env, e);
          const ports = (spec.ports || []).map((p) => { const m = /(?:[\d.]+:)?(\d+):(\d+)/.exec(String(p)); return m ? [+m[1], +m[2]] : null; }).filter(Boolean);
          const binds = (spec.volumes || []).map((v) => String(v).split(':')).map((v) => [v[0].startsWith('.') ? VFS.norm(v[0], sh.cwd) : v[0], v[1]]);
          ct = { id: hex(64), name: `${project}-${s}-1`, img, env: Object.assign({}, img.env, env), ports, binds, net, detached: true, running: false, logs: '', created: Date.now(), workdir: '', restart: spec.restart || 'no', alias: s };
          ct.userCmd = !!spec.command;
          ct.cmdline = spec.command ? (Array.isArray(spec.command) ? spec.command.map(q).join(' ') : String(spec.command)) : img.entry.concat(img.cmd).map(q).join(' ');
          ct.kind = (img.cat || CAT[img.base] || {}).kind;
          d.containers.unshift(ct);
          for (const [k, vol] of binds.map((b) => [b[0], b[1]])) if (!k.startsWith('/') && !d.volumes.has(k)) d.volumes.set(k, { node: sh.fs.mk('d', { owner: 'root', group: 'root' }), created: Date.now(), driver: 'local' });
        }
        if (!ct.running) {
          try {
            if (ct.kind === 'mysql' && !ct.env.MYSQL_ROOT_PASSWORD) { ct.logs = '[ERROR] [Entrypoint]: Database is uninitialized and password option is not specified\n'; ct.exited = 1; ct.startedAt = Date.now(); ct.finished = Date.now(); lines.push(` ✘ Container ${ct.name}   Error`); continue; }
            if (ct.kind === 'mysql' || ct.kind === 'pg') { ct.cmdline = ''; ct.logs = 'ready for connections\n'; }
            await startContainer(c, ct);
            lines.push(` ✔ Container ${ct.name}   Created   0.1s`, ` ✔ Container ${ct.name}   Started   0.4s`);
          } catch (err) { c.err(`Error response from daemon: ${err.message}\n`); return 1; }
        }
      }
      c.out(`[+] Running ${lines.length}/${lines.length}\n${lines.join('\n')}\n`);
      if (!args.includes('-d') && !args.includes('--detach')) {
        c.out(`Attaching to ${svcs.map((s) => `${project}-${s}-1`).join(', ')}\n`);
        for (const s of svcs) { const ct = ctOf(s); if (ct && ct.logs) ct.logs.split('\n').filter(Boolean).forEach((l) => c.out(`${ct.name}  | ${l}\n`)); }
        try { await sh.waitMs(1e9); } catch (e) { if (!(e instanceof LX.AbortSig)) throw e; sh.aborted = false; c.out('\nGracefully stopping... (press Ctrl+C again to force)\n'); }
      }
      return 0;
    }
    if (act === 'down' || act === 'stop') {
      const lines = [];
      for (const s of order.slice().reverse()) { const ct = ctOf(s); if (!ct) continue; stopContainer(sh, ct, 0); if (act === 'down') d.containers.splice(d.containers.indexOf(ct), 1); lines.push(` ✔ Container ${ct.name}   ${act === 'down' ? 'Removed' : 'Stopped'}   0.2s`); }
      if (act === 'down' && d.networks.has(net)) { d.networks.delete(net); lines.push(` ✔ Network ${net}   Removed   0.1s`); }
      c.out(`[+] Running ${lines.length}/${lines.length}\n${lines.join('\n')}\n`);
      return 0;
    }
    if (act === 'start' || act === 'restart') { for (const s of svcs) { const ct = ctOf(s); if (ct) { if (act === 'restart') stopContainer(sh, ct, 0); await startContainer(c, ct); c.out(` ✔ Container ${ct.name}   Started\n`); } } return 0; }
    if (act === 'logs') { const only = args.slice(1).filter((x) => !x.startsWith('-')); for (const s of svcs) { if (only.length && !only.includes(s)) continue; const ct = ctOf(s); if (ct) ct.logs.split('\n').filter(Boolean).forEach((l) => c.out(`${ct.name.padEnd(18)}| ${l}\n`)); } return 0; }
    if (act === 'exec') { const s = args.filter((x) => !x.startsWith('-'))[1]; const ct = ctOf(s); if (!ct || !ct.running) { c.err(`service "${s}" is not running\n`); return 1; } const i = args.indexOf(s); return await LX.cmds.docker.run(c, ['exec', ...args.slice(1, i), ct.name, ...args.slice(i + 1)]); }
    if (act === 'build' || act === 'pull') { c.out('[+] Building 0.0s\n'); return 0; }
    c.err(`unknown docker command: "compose ${act || ''}"\n`);
    return 1;
  }

  /* host reaches containers by IP; containers reach peers by IP */
  const origHttp = LX.httpRequest;
  LX.httpRequest = async function (sh, o) {
    const ip = sh.resolveHost ? sh.resolveHost(o.host) : null;
    if (ip) {
      const hostSh = sh.isContainer ? null : sh;
      const d = (hostSh || LX.curHost || sh).docker;
      const all = d ? d.containers : [];
      const peer = all.find((x) => x.running && x.ip === ip && x.cs !== sh && x.net !== 'host');
      if (peer && !(sh.isContainer && peer.net !== (sh.dockerNet || peer.net))) {
        const l = peer.cs.listeners[o.port];
        if (!l) return { err: 7, msg: `Failed to connect to ${o.host} port ${o.port} after 0 ms: Couldn't connect to server` };
        return await l.handler({ method: o.method || 'GET', path: o.path, host: o.hostHeader || o.host, headers: o.headers || {}, body: o.body || '', port: o.port, ip, ua: o.ua || 'curl/8.5.0', clientIp: '172.17.0.1' });
      }
    }
    return await origHttp(sh, o);
  };
  // containers need to find the host Shell that owns the docker state
  const origInvoke = P.invoke;
  P.invoke = function (def2, name, args, io) {
    if (!this.isContainer) LX.curHost = this;
    return origInvoke.call(this, def2, name, args, io);
  };
  Object.assign(LX.PKGS, {
    'docker.io': { ver: '24.0.7-0ubuntu4.1', desc: 'Linux container runtime', size: 29000, bins: ['docker'], service: { desc: 'Docker Application Container Engine', proc: 'dockerd' } },
    'docker-compose-v2': { ver: '2.24.6-0ubuntu1', desc: 'tool for running multi-container applications', size: 8000, bins: [] },
    'docker-compose': { ver: '1.29.2-6', desc: 'Define and run multi-container applications with Docker', size: 1200, bins: [] },
  });
  LX.initHooks.push((sh) => {
    const prior = sh.onInstall;
    sh.onInstall = (p, meta) => {
      if (p === 'docker.io') {
        if (sh.services['docker.io']) { sh.services.docker = sh.services['docker.io']; delete sh.services['docker.io']; sh.services.docker.proc = 'dockerd'; }
        sh.extraGroups.docker = 999;
        sh.writePasswd();
      }
      if (prior) prior.call(sh, p, meta);
    };
    sh.rebootHooks = sh.rebootHooks || [];
  });
})();
