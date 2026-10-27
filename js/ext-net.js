/* Linux Academy: networking extension (YAML, DNS, ip state, netplan, firewalls, HTTP client, listeners) */
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

  /* ---------- tiny YAML ---------- */
  function scalar(s) {
    s = s.trim();
    if (s === '' || s === '~' || s === 'null') return null;
    if (/^(true|True|yes)$/.test(s)) return true;
    if (/^(false|False|no)$/.test(s)) return false;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
    if (/^".*"$/.test(s)) return s.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    if (/^'.*'$/.test(s)) return s.slice(1, -1);
    if (s.startsWith('[') && s.endsWith(']')) return splitTop(s.slice(1, -1)).filter((x) => x.trim() !== '').map(scalar);
    if (s.startsWith('{') && s.endsWith('}')) {
      const o = {};
      for (const part of splitTop(s.slice(1, -1))) {
        const i = part.indexOf(':');
        if (i > 0) o[part.slice(0, i).trim()] = scalar(part.slice(i + 1));
      }
      return o;
    }
    return s;
  }
  function splitTop(s) {
    const out = [];
    let depth = 0;
    let cur = '';
    let q = null;
    for (const ch of s) {
      if (q) {
        cur += ch;
        if (ch === q) q = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        q = ch;
        cur += ch;
      } else if (ch === '[' || ch === '{') {
        depth++;
        cur += ch;
      } else if (ch === ']' || ch === '}') {
        depth--;
        cur += ch;
      } else if (ch === ',' && depth === 0) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  }
  LX.yaml = {
    parse(text) {
      const raw = String(text).replace(/\t/g, '  ').split('\n');
      const lines = [];
      raw.forEach((l, no) => {
        if (/^---\s*$/.test(l) || /^\.\.\.\s*$/.test(l)) return;
        const stripped = l.replace(/(^|\s)#.*$/, '$1');
        if (!stripped.trim()) return;
        lines.push({ indent: stripped.match(/^ */)[0].length, text: stripped.trim(), no: no + 1 });
      });
      let i = 0;
      const err = (m, ln) => {
        const e = new Error(m);
        e.line = ln;
        throw e;
      };
      function block(indent) {
        if (i >= lines.length) return null;
        if (lines[i].text.startsWith('- ') || lines[i].text === '-') return list(indent);
        return map(indent);
      }
      function value(rest, indent, ln) {
        if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
          const buf = [];
          let bi = null;
          while (i < lines.length && lines[i].indent > indent) {
            if (bi === null) bi = lines[i].indent;
            buf.push(' '.repeat(lines[i].indent - bi) + lines[i].text);
            i++;
          }
          return rest[0] === '|' ? buf.join('\n') + (rest.endsWith('-') ? '' : '\n') : buf.join(' ') + (rest.endsWith('-') ? '' : '\n');
        }
        if (rest === '') {
          if (i < lines.length && (lines[i].indent > indent || (lines[i].indent === indent && lines[i].text.startsWith('- ')))) return block(lines[i].indent);
          return null;
        }
        return scalar(rest);
      }
      function map(indent) {
        const o = {};
        while (i < lines.length && lines[i].indent === indent && !lines[i].text.startsWith('- ')) {
          const l = lines[i];
          const m = /^("[^"]*"|'[^']*'|[^:]+?)\s*:(?:\s+(.*)|)$/.exec(l.text);
          if (!m) err(`mapping values are not allowed here`, l.no);
          i++;
          o[m[1].replace(/^["']|["']$/g, '')] = value(m[2] === undefined ? '' : m[2], indent, l.no);
        }
        if (i < lines.length && lines[i].indent > indent) err('bad indentation of a mapping entry', lines[i].no);
        return o;
      }
      function list(indent) {
        const a = [];
        while (i < lines.length && lines[i].indent === indent && (lines[i].text.startsWith('- ') || lines[i].text === '-')) {
          const l = lines[i];
          const rest = l.text === '-' ? '' : l.text.slice(2);
          if (/^("[^"]*"|'[^']*'|[\w.-]+)\s*:(\s|$)/.test(rest) && !rest.startsWith('{') && !rest.startsWith('[')) {
            // inline mapping start: treat remainder as a mapping line indented by 2
            lines[i] = { indent: indent + 2, text: rest, no: l.no };
            a.push(map(indent + 2));
          } else {
            i++;
            a.push(value(rest, indent, l.no));
          }
        }
        return a;
      }
      if (!lines.length) return null;
      const r = block(lines[0].indent);
      if (i < lines.length) err('did not find expected <document start>', lines[i].no);
      return r;
    },
    dump(v, ind) {
      ind = ind || 0;
      const pad = ' '.repeat(ind);
      if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? pad + '-\n' + LX.yaml.dump(x, ind + 2) : pad + '- ' + x + '\n')).join('');
      return Object.entries(v)
        .map(([k, x]) => (x && typeof x === 'object' ? pad + k + ':\n' + LX.yaml.dump(x, ind + 2) : pad + k + ': ' + x + '\n'))
        .join('');
    },
  };

  /* ---------- IP helpers ---------- */
  const ip2n = (ip) => ip.split('.').reduce((a, b) => a * 256 + +b, 0);
  const n2ip = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  const maskOf = (p) => (p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0);
  const validIp = (s) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s) && s.split('.').every((x) => +x < 256);
  LX.ip = { ip2n, n2ip, maskOf, validIp };
  const bin = (n) => [0, 1, 2, 3].map((i) => ((n >>> (24 - i * 8)) & 255).toString(2).padStart(8, '0')).join('.');
  def('ipcalc', async (c, args) => {
    const a = args.find((x) => !x.startsWith('-')) || '';
    const m = /^(\d+\.\d+\.\d+\.\d+)(?:\/(\d+)|\s+(\d+\.\d+\.\d+\.\d+))?$/.exec(a);
    if (!m || !validIp(m[1])) {
      c.err(`ipcalc: bad IPv4 address: ${a}\n`);
      return 1;
    }
    let p = m[2] !== undefined ? +m[2] : 24;
    if (m[3]) p = ip2n(m[3]).toString(2).replace(/0/g, '').length;
    if (p > 32) {
      c.err('ipcalc: bad netmask\n');
      return 1;
    }
    const ip = ip2n(m[1]);
    const mask = maskOf(p);
    const net = (ip & mask) >>> 0;
    const bc = (net | (~mask >>> 0)) >>> 0;
    const hosts = p >= 31 ? Math.pow(2, 32 - p) : Math.pow(2, 32 - p) - 2;
    const cls = ip >>> 24 < 128 ? 'A' : ip >>> 24 < 192 ? 'B' : ip >>> 24 < 224 ? 'C' : 'D/E';
    const priv = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(m[1]) ? ', Private Internet' : '';
    const fmtb = (n, sp) => {
      const s = bin(n).replace(/\./g, '');
      return s.slice(0, 8) + '.' + s.slice(8, 16) + '.' + s.slice(16, 24) + '.' + s.slice(24).padStart(8, '0');
    };
    const sp = (n) => {
      const s = bin(n).split('.').join('');
      const parts = [s.slice(0, 8), s.slice(8, 16), s.slice(16, 24), s.slice(24)];
      const idx = Math.floor(p / 8);
      const within = p % 8;
      const joined = parts.join('.');
      const pos = p + Math.floor((p - 1) / 8) + (p % 8 === 0 ? 0 : 1) - (p === 0 ? 0 : 0);
      return joined.slice(0, p + Math.floor(p / 8) - (p % 8 === 0 && p > 0 ? 1 : 0)) + ' ' + joined.slice(p + Math.floor(p / 8) - (p % 8 === 0 && p > 0 ? 1 : 0)).replace(/^\./, '');
    };
    const l = (k, v, b) => c.out(`${k.padEnd(10)} ${v.padEnd(19)} ${sp(b)}\n`);
    l('Address:', n2ip(ip), ip);
    l('Netmask:', `${n2ip(mask)} = ${p}`, mask);
    l('Wildcard:', n2ip(~mask >>> 0), ~mask >>> 0);
    c.out('=>\n');
    l('Network:', `${n2ip(net)}/${p}`, net);
    if (p < 31) {
      l('HostMin:', n2ip(net + 1), net + 1);
      l('HostMax:', n2ip(bc - 1), bc - 1);
    }
    l('Broadcast:', n2ip(bc), bc);
    c.out(`Hosts/Net: ${hosts}${' '.repeat(Math.max(1, 19 - String(hosts).length))}Class ${cls}${priv}\n`);
  }, { pkg: 'ipcalc' });

  /* ---------- state ---------- */
  const VALID_NS = ['127.0.0.53', '127.0.0.1', '8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1', '9.9.9.9', '192.168.1.1'];
  LX.DNS = { 'example.com': '93.184.215.14', 'www.example.com': '93.184.215.14', 'google.com': '142.250.183.14', 'www.google.com': '142.250.183.14', 'github.com': '140.82.121.4', 'api.github.com': '140.82.121.6', 'wikipedia.org': '208.80.154.224', 'ubuntu.com': '185.125.190.20', 'httpbin.org': '3.211.79.7', 'jsonplaceholder.typicode.com': '104.21.40.9', 'ifconfig.me': '34.160.111.145', 'demo-server': '192.168.1.20', 'db01': '192.168.1.21', 'web01.lab.local': '192.168.1.30', 'bastion.example.org': '203.0.113.10', 'archive.ubuntu.com': '91.189.91.83', 'registry.docker.io': '3.220.1.1' };
  LX.initHooks.push((sh) => {
    sh.net = { ifaces: { lo: { up: true, ips: ['127.0.0.1/8'], mac: '00:00:00:00:00:00', mtu: 65536 }, eth0: { up: true, ips: ['192.168.1.10/24'], mac: '02:42:ac:11:00:02', mtu: 1500, dhcp: true } }, routes: [{ dst: 'default', via: '192.168.1.1', dev: 'eth0' }] };
    sh.netPersist = JSON.parse(JSON.stringify(sh.net));
    sh.listeners = {};
    sh.serviceHooks = sh.serviceHooks || {};
    sh.fw = { ufw: { enabled: false, defIn: 'deny', defOut: 'allow', rules: [], logging: 'low' }, ipt: { INPUT: { policy: 'ACCEPT', rules: [] }, FORWARD: { policy: 'ACCEPT', rules: [] }, OUTPUT: { policy: 'ACCEPT', rules: [] } }, fwd: { zone: 'public', runtime: { services: ['ssh', 'dhcpv6-client'], ports: [] }, permanent: { services: ['ssh', 'dhcpv6-client'], ports: [] } } };
    sh.fs.mkdirp('/etc', {});
    const hostsTxt = '127.0.0.1\tlocalhost\n127.0.1.1\tlinux-school\n\n# The following lines are desirable for IPv6 capable hosts\n::1     ip6-localhost ip6-loopback\nfe00::0 ip6-localnet\nff00::0 ip6-mcastprefix\n';
    sh.fs.put('/etc/hosts', hostsTxt, { owner: 'root', group: 'root', mtime: Date.now() - 20 * 86400000 });
    sh.fs.put('/etc/resolv.conf', '# This is /run/systemd/resolve/stub-resolv.conf managed by man:systemd-resolved(8).\nnameserver 127.0.0.53\noptions edns0 trust-ad\nsearch localdomain\n', { owner: 'root', group: 'root', mode: 0o644 });
    sh.fs.put('/etc/nsswitch.conf', 'passwd:         files systemd\ngroup:          files systemd\nshadow:         files systemd\nhosts:          files mdns4_minimal [NOTFOUND=return] dns\nnetworks:       files\nprotocols:      db files\nservices:       db files\n', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/etc/netplan', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/netplan/50-cloud-init.yaml', '# This file is generated from information provided by the datasource.\nnetwork:\n    version: 2\n    ethernets:\n        eth0:\n            dhcp4: true\n', { owner: 'root', group: 'root', mode: 0o600 });
    sh.fs.put('/etc/services', 'ssh\t\t22/tcp\nsmtp\t\t25/tcp\ndomain\t\t53/udp\nhttp\t\t80/tcp\nhttps\t\t443/tcp\nmysql\t\t3306/tcp\npostgresql\t5432/tcp\n', { owner: 'root', group: 'root' });
    sh.rebootHooks = sh.rebootHooks || [];
    sh.rebootHooks.push((s) => {
      s.net = JSON.parse(JSON.stringify(s.netPersist));
      s.listeners = {};
      s.fw.ipt = { INPUT: { policy: 'ACCEPT', rules: [] }, FORWARD: { policy: 'ACCEPT', rules: [] }, OUTPUT: { policy: 'ACCEPT', rules: [] } };
      s.fw.fwd.runtime = JSON.parse(JSON.stringify(s.fw.fwd.permanent));
      for (const n of Object.keys(s.serviceHooks)) if (s.services[n] && s.services[n].active) s.serviceHooks[n]({ out() {}, err() {}, io: {} }, 'start');
    });
  });
  LX.resolveMsg = (sh) => (sh.dnsDown && sh.dnsDown() ? 'Temporary failure in name resolution' : 'Name or service not known');
  P.dnsServers = function () {
    const n = this.fs.lookup('/etc/resolv.conf');
    return ((n && n.content) || '')
      .split('\n')
      .map((l) => /^\s*nameserver\s+(\S+)/.exec(l))
      .filter(Boolean)
      .map((m) => m[1]);
  };
  P.dnsDown = function () {
    const ns = this.dnsServers();
    if (!ns.length) return true;
    return !ns.some((x) => VALID_NS.includes(x)) || !this.netUp();
  };
  P.ownIps = function () {
    const out = [];
    for (const i of Object.values(this.net.ifaces)) if (i.up) for (const a of i.ips) out.push(a.split('/')[0]);
    return out;
  };
  P.netUp = function () {
    const e = this.net.ifaces.eth0;
    return !!(e && e.up && e.ips.length && this.net.routes.some((r) => r.dst === 'default'));
  };
  P.hostsEntries = function () {
    const n = this.fs.lookup('/etc/hosts');
    const m = {};
    for (const l of ((n && n.content) || '').split('\n')) {
      const t = l.replace(/#.*$/, '').trim();
      if (!t) continue;
      const [ip, ...names] = t.split(/\s+/);
      for (const nm of names) if (!(nm in m)) m[nm] = ip;
    }
    return m;
  };
  P.resolveHost = function (h) {
    if (!h) return null;
    if (validIp(h)) return h;
    const hosts = this.hostsEntries();
    if (hosts[h]) return hosts[h];
    if (h === this.hostname || h === 'localhost') return '127.0.0.1';
    if (this.dnsDown()) return null;
    const domain = ((this.fs.lookup('/etc/resolv.conf') || {}).content || '').match(/^search\s+(\S+)/m);
    if (LX.DNS[h]) return LX.DNS[h];
    if (this.dnsExtra && this.dnsExtra[h]) return this.dnsExtra[h];
    if (domain && LX.DNS[h + '.' + domain[1]]) return LX.DNS[h + '.' + domain[1]];
    return null;
  };

  /* ---------- ip / ifconfig / route ---------- */
  const brd = (cidr) => {
    const [ip, p] = cidr.split('/');
    const mask = maskOf(+p);
    return n2ip(((ip2n(ip) & mask) | (~mask >>> 0)) >>> 0);
  };
  const ifIndex = (sh, name) => Object.keys(sh.net.ifaces).indexOf(name) + 1;
  def('ip', async (c, args) => {
    const sh = c.sh;
    const opts = args.filter((a) => a.startsWith('-'));
    const rest = args.filter((a) => !a.startsWith('-'));
    const brief = opts.some((o) => /^-(br|brief|b)/.test(o));
    const obj = rest[0] || 'addr';
    const act = rest[1];
    const net = sh.net;
    const dev = (k) => {
      const i = rest.indexOf(k);
      return i >= 0 ? rest[i + 1] : null;
    };
    if (/^a(ddr(ess)?)?$/.test(obj)) {
      if (act === 'add' || act === 'del') {
        if (needRoot(c, 'RTNETLINK answers: Operation not permitted\n')) return 2;
        const cidr = rest[2];
        const d = dev('dev');
        if (!net.ifaces[d]) {
          c.err(`Cannot find device "${d}"\n`);
          return 1;
        }
        if (!/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(cidr || '') || !validIp(cidr.split('/')[0])) {
          c.err(`Error: any valid prefix is expected rather than "${cidr}".\n`);
          return 1;
        }
        if (act === 'add') {
          if (net.ifaces[d].ips.includes(cidr)) {
            c.err('RTNETLINK answers: File exists\n');
            return 2;
          }
          net.ifaces[d].ips.push(cidr);
        } else {
          const i = net.ifaces[d].ips.indexOf(cidr);
          if (i < 0) {
            c.err('RTNETLINK answers: Cannot assign requested address\n');
            return 2;
          }
          net.ifaces[d].ips.splice(i, 1);
        }
        return 0;
      }
      const only = act && act !== 'show' ? act : rest[2] === 'dev' || act === 'show' ? dev('dev') || null : null;
      const target = dev('dev') || (act && net.ifaces[act] ? act : null);
      for (const [name, i] of Object.entries(net.ifaces)) {
        if (target && name !== target) continue;
        if (brief) {
          c.out(`${name.padEnd(16)} ${(name === 'lo' ? 'UNKNOWN' : i.up ? 'UP' : 'DOWN').padEnd(14)} ${i.ips.join(' ')}\n`);
          continue;
        }
        c.out(`${ifIndex(sh, name)}: ${name}: <${name === 'lo' ? 'LOOPBACK' : 'BROADCAST,MULTICAST'}${i.up ? ',UP,LOWER_UP' : ''}> mtu ${i.mtu} qdisc ${name === 'lo' ? 'noqueue' : 'fq_codel'} state ${name === 'lo' ? 'UNKNOWN' : i.up ? 'UP' : 'DOWN'} group default qlen 1000\n    link/${name === 'lo' ? 'loopback' : 'ether'} ${i.mac} brd ${name === 'lo' ? '00:00:00:00:00:00' : 'ff:ff:ff:ff:ff:ff'}\n`);
        i.ips.forEach((a, k) => c.out(`    inet ${a}${name === 'lo' ? '' : ` brd ${brd(a)}`} scope ${name === 'lo' ? 'host' : 'global'}${k > 0 ? ' secondary' : name === 'eth0' && i.dhcp ? ' dynamic' : ''} ${name}\n       valid_lft ${i.dhcp && k === 0 && name !== 'lo' ? '85123sec' : 'forever'} preferred_lft ${i.dhcp && k === 0 && name !== 'lo' ? '85123sec' : 'forever'}\n`));
      }
      return 0;
    }
    if (/^l(ink)?$/.test(obj)) {
      if (act === 'set') {
        if (needRoot(c, 'RTNETLINK answers: Operation not permitted\n')) return 2;
        const d = rest[2];
        if (!net.ifaces[d]) {
          c.err(`Cannot find device "${d}"\n`);
          return 1;
        }
        if (rest.includes('up')) net.ifaces[d].up = true;
        if (rest.includes('down')) net.ifaces[d].up = false;
        return 0;
      }
      if (act === 'add') {
        if (needRoot(c, 'RTNETLINK answers: Operation not permitted\n')) return 2;
        const nm = rest[2];
        if (!sh.modules.includes('dummy') && rest.includes('dummy')) {
          c.err('Error: Unknown device type.\n');
          return 1;
        }
        net.ifaces[nm] = { up: false, ips: [], mac: '3a:4f:' + Math.random().toString(16).slice(2, 10).replace(/(..)(..)(..)(..)/, '$1:$2:$3:$4'), mtu: 1500 };
        return 0;
      }
      for (const [name, i] of Object.entries(net.ifaces)) {
        if (brief) c.out(`${name.padEnd(16)} ${(name === 'lo' ? 'UNKNOWN' : i.up ? 'UP' : 'DOWN').padEnd(14)} ${i.mac} <${name === 'lo' ? 'LOOPBACK' : 'BROADCAST,MULTICAST'}${i.up ? ',UP,LOWER_UP' : ''}>\n`);
        else c.out(`${ifIndex(sh, name)}: ${name}: <${name === 'lo' ? 'LOOPBACK' : 'BROADCAST,MULTICAST'}${i.up ? ',UP,LOWER_UP' : ''}> mtu ${i.mtu} qdisc ${name === 'lo' ? 'noqueue' : 'fq_codel'} state ${name === 'lo' ? 'UNKNOWN' : i.up ? 'UP' : 'DOWN'} mode DEFAULT group default qlen 1000\n    link/${name === 'lo' ? 'loopback' : 'ether'} ${i.mac} brd ${name === 'lo' ? '00:00:00:00:00:00' : 'ff:ff:ff:ff:ff:ff'}\n`);
      }
      return 0;
    }
    if (/^r(oute)?$/.test(obj)) {
      if (act === 'add' || act === 'del' || act === 'delete') {
        if (needRoot(c, 'RTNETLINK answers: Operation not permitted\n')) return 2;
        const dst = rest[2];
        if (act === 'add') {
          const via = rest[rest.indexOf('via') + 1];
          const d = dev('dev') || 'eth0';
          if (via && !validIp(via)) {
            c.err(`Error: inet address is expected rather than "${via}".\n`);
            return 1;
          }
          if (net.routes.some((r) => r.dst === dst)) {
            c.err('RTNETLINK answers: File exists\n');
            return 2;
          }
          net.routes.push({ dst, via, dev: d });
        } else {
          const i = net.routes.findIndex((r) => r.dst === dst);
          if (i < 0) {
            c.err('RTNETLINK answers: No such process\n');
            return 2;
          }
          net.routes.splice(i, 1);
        }
        return 0;
      }
      const e = net.ifaces.eth0;
      for (const r of net.routes) c.out(`${r.dst}${r.via ? ' via ' + r.via : ''} dev ${r.dev}${r.dst === 'default' ? ' proto dhcp src 192.168.1.10 metric 100' : ''}\n`);
      for (const a of e.ips) {
        const [ip, p] = a.split('/');
        c.out(`${n2ip((ip2n(ip) & maskOf(+p)) >>> 0)}/${p} dev eth0 proto kernel scope link src ${ip} metric 100\n`);
      }
      return 0;
    }
    if (/^n(eigh)?$/.test(obj)) {
      c.out('192.168.1.1 dev eth0 lladdr 02:42:ac:11:00:01 REACHABLE\n192.168.1.20 dev eth0 lladdr 02:42:ac:11:00:14 STALE\n');
      return 0;
    }
    c.err(`Object "${obj}" is unknown, try "ip help".\n`);
    return 1;
  });
  def('ifconfig', async (c) => {
    const sh = c.sh;
    for (const [name, i] of Object.entries(sh.net.ifaces)) {
      const first = i.ips[0];
      c.out(`${name}: flags=${name === 'lo' ? 73 : i.up ? 4163 : 4098}<${i.up ? 'UP,' : ''}${name === 'lo' ? 'LOOPBACK' : 'BROADCAST,MULTICAST'}${i.up ? ',RUNNING' : ''}>  mtu ${i.mtu}\n`);
      if (first) c.out(`        inet ${first.split('/')[0]}  netmask ${n2ip(maskOf(+first.split('/')[1]))}${name === 'lo' ? '' : '  broadcast ' + brd(first)}\n`);
      c.out(name === 'lo' ? '        loop  txqueuelen 1000  (Local Loopback)\n\n' : `        ether ${i.mac}  txqueuelen 0  (Ethernet)\n\n`);
    }
  }, { pkg: 'net-tools' });
  def('route', async (c, args) => {
    c.out('Kernel IP routing table\nDestination     Gateway         Genmask         Flags Metric Ref    Use Iface\n');
    for (const r of c.sh.net.routes) c.out(`${(r.dst === 'default' ? '0.0.0.0' : r.dst.split('/')[0]).padEnd(15)} ${(r.via || '0.0.0.0').padEnd(15)} ${(r.dst === 'default' ? '0.0.0.0' : n2ip(maskOf(+(r.dst.split('/')[1] || 32)))).padEnd(15)} UG    100    0        0 ${r.dev}\n`);
    c.out('192.168.1.0     0.0.0.0         255.255.255.0   U     100    0        0 eth0\n');
  }, { pkg: 'net-tools' });
  def('arp', async (c) => c.out('Address                  HWtype  HWaddress           Flags Mask            Iface\n_gateway                 ether   02:42:ac:11:00:01   C                     eth0\n192.168.1.20             ether   02:42:ac:11:00:14   C                     eth0\n'), { pkg: 'net-tools' });
  def('hostname', async (c, args) => {
    const sh = c.sh;
    if (args.includes('-I') || args.includes('-i')) return c.out(sh.ownIps().filter((x) => !x.startsWith('127.')).join(' ') + ' \n');
    if (args.includes('-f')) return c.out(sh.hostname + '.localdomain\n');
    const nm = args.find((x) => !x.startsWith('-'));
    if (nm) {
      if (sh.eu() !== 'root') {
        c.err('hostname: you must be root to change the host name\n');
        return 1;
      }
      sh.hostname = nm;
      return 0;
    }
    c.out(sh.hostname + '\n');
  });

  /* ---------- netplan / nmcli ---------- */
  def('netplan', async (c, args) => {
    const sh = c.sh;
    const sub = args[0];
    if (!sub) {
      c.out('usage: /usr/sbin/netplan  [-h] [--debug] ...\n\nCommands:\n  apply    Apply current netplan configuration to running system\n  try      Test a netplan configuration with automatic rollback\n  get      Get a setting by specifying a nested key like "ethernets.eth0.addresses", or "all"\n  generate Generate backend specific configuration files from /etc/netplan/*.yaml\n  status   Show current network status\n');
      return 0;
    }
    const dir = sh.fs.lookup('/etc/netplan');
    const files = Object.keys(dir.kids).filter((k) => k.endsWith('.yaml')).sort();
    const load = () => {
      let merged = { network: { ethernets: {} } };
      for (const f of files) {
        const n = dir.kids[f];
        if (n.mode & 0o044) c.err(`** (generate:${sh.nextPid}): WARNING: Permissions for /etc/netplan/${f} are too open. Netplan configuration should NOT be accessible by others.\n`);
        let y;
        try {
          y = LX.yaml.parse(n.content);
        } catch (e) {
          c.err(`/etc/netplan/${f}:${e.line || 1}:1: Error in network definition: ${e.message}\n`);
          return null;
        }
        if (y && y.network && y.network.ethernets) Object.assign(merged.network.ethernets, y.network.ethernets);
      }
      return merged;
    };
    if (sub === 'generate' || sub === 'apply' || sub === 'try') {
      if (needRoot(c, 'Please run this command as root.\n'.replace('Please run this command as root.', 'WARNING: need root to apply netplan configuration\n'))) return 1;
      const cfg = load();
      if (!cfg) return 1;
      if (sub === 'generate') return 0;
      for (const [name, e] of Object.entries(cfg.network.ethernets)) {
        if (!sh.net.ifaces[name]) {
          c.err(`Cannot find unique matching interface for ${name}\n`);
          continue;
        }
        const ifc = sh.net.ifaces[name];
        if (e.dhcp4 === true) {
          ifc.ips = ['192.168.1.10/24'];
          ifc.dhcp = true;
          sh.net.routes = sh.net.routes.filter((r) => r.dst !== 'default');
          sh.net.routes.push({ dst: 'default', via: '192.168.1.1', dev: name });
        } else {
          ifc.dhcp = false;
          ifc.ips = (e.addresses || []).map(String);
          sh.net.routes = sh.net.routes.filter((r) => r.dst !== 'default' || r.dev !== name);
          const gw = e.gateway4 || (e.routes || []).find((r) => r.to === 'default' || r.to === '0.0.0.0/0');
          if (e.gateway4) sh.net.routes.push({ dst: 'default', via: e.gateway4, dev: name });
          else if (gw && gw.via) sh.net.routes.push({ dst: 'default', via: gw.via, dev: name });
        }
        if (e.nameservers && e.nameservers.addresses) {
          const rc = sh.fs.lookup('/etc/resolv.conf');
          rc.content = '# generated by netplan\n' + e.nameservers.addresses.map((a) => 'nameserver ' + a).join('\n') + '\nsearch localdomain\n';
        }
        ifc.up = true;
      }
      sh.netPersist = JSON.parse(JSON.stringify(sh.net));
      return 0;
    }
    if (sub === 'get') {
      const cfg = load();
      c.out(LX.yaml.dump((cfg && cfg.network) || {}));
      return 0;
    }
    if (sub === 'status') {
      c.out('     Online state: online\n    DNS Addresses: 127.0.0.53 (stub)\n\n●  1: lo ethernet UNKNOWN/UP (unmanaged)\n●  2: eth0 ethernet UP (networkd: eth0)\n');
      return 0;
    }
    c.err(`netplan: error: argument : invalid choice: '${sub}'\n`);
    return 2;
  });
  def('nmcli', async (c, args) => {
    const sh = c.sh;
    sh.nm = sh.nm || { 'Wired connection 1': { dev: 'eth0', method: 'auto', addr: '', gw: '', dns: '' } };
    const a = args.slice();
    const obj = a[0] || 'general';
    const sub = a[1];
    if (/^d(ev(ice)?)?$/.test(obj)) {
      c.out('DEVICE  TYPE      STATE                   CONNECTION         \neth0    ethernet  connected               Wired connection 1 \nlo      loopback  connected (externally)  lo                 \n');
      return 0;
    }
    if (/^c(on(nection)?)?$/.test(obj)) {
      if (!sub || sub === 'show') {
        if (a[2]) {
          const k = sh.nm[a[2]];
          if (!k) {
            c.err(`Error: ${a[2]} - no such connection profile.\n`);
            return 10;
          }
          c.out(`connection.id:                          ${a[2]}\nconnection.interface-name:              ${k.dev}\nipv4.method:                            ${k.method}\nipv4.addresses:                         ${k.addr || '--'}\nipv4.gateway:                           ${k.gw || '--'}\nipv4.dns:                               ${k.dns || '--'}\nGENERAL.STATE:                          activated\n`);
          return 0;
        }
        c.out('NAME                UUID                                  TYPE      DEVICE \nWired connection 1  3c9d1f0e-aaaa-4bbb-8ccc-1d2e3f4a5b6c  ethernet  eth0   \nlo                  8f7e6d5c-bbbb-4ccc-9ddd-0a1b2c3d4e5f  loopback  lo     \n');
        return 0;
      }
      if (sub === 'modify' || sub === 'mod') {
        if (needRoot(c, 'Error: Failed to modify connection \'' + a[2] + '\': Insufficient privileges\n')) return 1;
        const k = sh.nm[a[2]];
        if (!k) {
          c.err(`Error: unknown connection '${a[2]}'.\n`);
          return 10;
        }
        for (let i = 3; i < a.length; i += 2) {
          const key = a[i];
          const v = a[i + 1];
          if (/^\+?ipv4\.addresses$/.test(key)) k.addr = v;
          else if (key === 'ipv4.gateway') k.gw = v;
          else if (/^\+?ipv4\.dns$/.test(key)) k.dns = v;
          else if (key === 'ipv4.method') k.method = v;
          else if (key === 'connection.autoconnect') k.auto = v;
          else {
            c.err(`Error: invalid or not allowed setting '${key}'.\n`);
            return 2;
          }
        }
        return 0;
      }
      if (sub === 'up' || sub === 'reload') {
        if (needRoot(c, 'Error: Connection activation failed: Not authorized\n')) return 1;
        const k = sh.nm[a[2]] || sh.nm['Wired connection 1'];
        const ifc = sh.net.ifaces[k.dev];
        if (k.method === 'manual' && k.addr) {
          ifc.ips = k.addr.split(',');
          ifc.dhcp = false;
          sh.net.routes = sh.net.routes.filter((r) => r.dst !== 'default');
          if (k.gw) sh.net.routes.push({ dst: 'default', via: k.gw, dev: k.dev });
        } else if (k.method === 'auto') {
          ifc.ips = ['192.168.1.10/24'];
          ifc.dhcp = true;
        }
        if (k.dns) sh.fs.lookup('/etc/resolv.conf').content = '# Generated by NetworkManager\n' + k.dns.split(/[ ,]/).filter(Boolean).map((d) => 'nameserver ' + d).join('\n') + '\n';
        sh.netPersist = JSON.parse(JSON.stringify(sh.net));
        c.out('Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/2)\n');
        return 0;
      }
    }
    if (obj === 'general' || obj === 'g') {
      if (sub === 'hostname') return c.out(sh.hostname + '\n');
      c.out('STATE      CONNECTIVITY  WIFI-HW  WIFI     WWAN-HW  WWAN    \nconnected  full          enabled  enabled  enabled  enabled \n');
      return 0;
    }
    c.err(`Error: argument '${obj}' not understood. Try passing --help instead.\n`);
    return 2;
  }, { pkg: 'network-manager' });

  /* ---------- listeners / ss / netstat ---------- */
  P.listening = function () {
    const rows = [];
    const ssh = this.services.ssh;
    if (ssh && ssh.active) rows.push({ proto: 'tcp', addr: '0.0.0.0', port: (this.sshdCfg && this.sshdCfg.Port) || 22, proc: 'sshd', pid: 412, user: 'root' });
    rows.push({ proto: 'udp', addr: '127.0.0.53', port: 53, proc: 'systemd-resolve', pid: 301, user: 'systemd-resolve' });
    rows.push({ proto: 'tcp', addr: '127.0.0.53', port: 53, proc: 'systemd-resolve', pid: 301, user: 'systemd-resolve' });
    for (const [p, l] of Object.entries(this.listeners)) rows.push({ proto: l.proto || 'tcp', addr: l.addr || '0.0.0.0', port: +p, proc: l.proc, pid: l.pid, user: l.user || 'root' });
    return rows.sort((a, b) => a.port - b.port);
  };
  const ssImpl = (netstat) => async (c, args) => {
    const sh = c.sh;
    const f = args.filter((a) => a.startsWith('-')).join('');
    const showP = /p/.test(f);
    const rows = sh.listening().filter((r) => !(/t/.test(f) && !/u/.test(f) && r.proto !== 'tcp') && !(/u/.test(f) && !/t/.test(f) && r.proto !== 'udp'));
    if (netstat) {
      c.out('Active Internet connections (only servers)\nProto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name\n');
      for (const r of rows) c.out(`${(r.proto).padEnd(5)} ${'0'.padStart(6)} ${'0'.padStart(6)} ${(r.addr + ':' + r.port).padEnd(23)} ${'0.0.0.0:*'.padEnd(23)} ${r.proto === 'tcp' ? 'LISTEN'.padEnd(11) : ''.padEnd(11)} ${showP && sh.eu() === 'root' ? r.pid + '/' + r.proc : '-'}\n`);
      return 0;
    }
    c.out('Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess\n');
    for (const r of rows) c.out(`${r.proto.padEnd(6)} ${(r.proto === 'udp' ? 'UNCONN' : 'LISTEN').padEnd(6)} ${'0'.padEnd(6)} ${(r.proto === 'udp' ? '0' : '4096').padEnd(6)} ${(r.addr + ':' + r.port).padEnd(19)} ${'0.0.0.0:*'.padEnd(18)}${showP && sh.eu() === 'root' ? `users:(("${r.proc}",pid=${r.pid},fd=3))` : ''}\n`);
    return 0;
  };
  def('ss', ssImpl(false));
  def('netstat', ssImpl(true), { pkg: 'net-tools' });
  def('nc', async (c, args) => {
    const sh = c.sh;
    const flags = args.filter((a) => /^-[a-zA-Z]+$/.test(a)).join('');
    const pos = args.filter((a) => !/^-[a-zA-Z]+$/.test(a));
    if (/l/.test(flags)) {
      const port = +pos[pos.length - 1];
      c.out(`\x1b[2m(nc would listen on port ${port} and print what clients send. Press Ctrl+C to stop.)\x1b[0m\n`);
      await sh.waitMs(1e9);
      return 0;
    }
    const [host, port] = pos;
    const ip = sh.resolveHost(host);
    if (!ip) {
      c.err(`nc: getaddrinfo for host "${host}" port ${port}: ${LX.resolveMsg(sh)}\n`);
      return 1;
    }
    const r = LX.portState(sh, ip, +port);
    if (/z/.test(flags)) {
      if (r === 'open') {
        c.out(/v/.test(flags) ? `Connection to ${host} ${port} port [tcp/*] succeeded!\n` : '');
        return 0;
      }
      if (r === 'refused') c.err(/v/.test(flags) ? `nc: connect to ${host} port ${port} (tcp) failed: Connection refused\n` : '');
      else c.err(/v/.test(flags) ? `nc: connect to ${host} port ${port} (tcp) timed out: Operation now in progress\n` : '');
      return 1;
    }
    if (r !== 'open') {
      c.err(`nc: connect to ${host} port ${port} (tcp) failed: Connection refused\n`);
      return 1;
    }
    c.out('\x1b[2m(connected: in a real terminal what you type is sent to the other side)\x1b[0m\n');
    return 0;
  });
  def('nmap', async (c, args) => {
    const sh = c.sh;
    const host = args.filter((a) => !a.startsWith('-')).pop() || 'localhost';
    const ip = sh.resolveHost(host);
    if (!ip) {
      c.err(`Failed to resolve "${host}".\nWARNING: No targets were specified, so 0 hosts scanned.\n`);
      return 1;
    }
    c.out(`Starting Nmap 7.94 ( https://nmap.org ) at ${U.strftime('%F %H:%M %Z', new Date())}\nNmap scan report for ${host}${host !== ip ? ' (' + ip + ')' : ''}\nHost is up (0.00012s latency).\n`);
    const own = sh.ownIps().includes(ip);
    const ports = own ? sh.listening().filter((r) => r.proto === 'tcp' && r.addr !== '127.0.0.53').map((r) => r.port) : ip === '192.168.1.20' ? [22] : [80, 443];
    c.out(`Not shown: ${1000 - ports.length} closed tcp ports (conn-refused)\nPORT    STATE SERVICE\n`);
    for (const p of ports) {
      const st = own && !sh.ownIps().includes('127.0.0.1') ? 'open' : LX.portState(sh, ip, p);
      if (st === 'open') c.out(`${(p + '/tcp').padEnd(7)} open  ${({ 22: 'ssh', 80: 'http', 443: 'https', 3306: 'mysql', 8080: 'http-proxy' })[p] || 'unknown'}\n`);
    }
    c.out('\nNmap done: 1 IP address (1 host up) scanned in 0.05 seconds\n');
    c.out('\x1b[2mOnly scan machines you own or have written permission to test.\x1b[0m\n');
  }, { pkg: 'nmap' });
  def('traceroute', async (c, args) => {
    const sh = c.sh;
    const host = args.find((a) => !a.startsWith('-'));
    const ip = sh.resolveHost(host);
    if (!ip) {
      c.err(`${host}: ${LX.resolveMsg(sh)}\nCannot handle "host" cmdline arg \`${host}' on position 1 (argc 1)\n`);
      return 2;
    }
    c.out(`traceroute to ${host} (${ip}), 30 hops max, 60 byte packets\n`);
    const hops = sh.ownIps().includes(ip) ? [[ip, 0.05]] : [['_gateway (192.168.1.1)', 0.45], ['10.20.0.1 (10.20.0.1)', 3.1], ['172.16.5.9 (172.16.5.9)', 8.7], ['203.0.113.1 (203.0.113.1)', 14.2], [`${host} (${ip})`, 22.4]];
    hops.forEach((h, i) => c.out(`${String(i + 1).padStart(2)}  ${h[0]}  ${h[1].toFixed(3)} ms  ${(h[1] * 1.05).toFixed(3)} ms  ${(h[1] * 0.97).toFixed(3)} ms\n`));
  }, { pkg: 'traceroute' });
  def('tcpdump', async (c, args) => {
    if (needRoot(c, 'tcpdump: eth0: You don\'t have permission to perform this capture on that device\n(socket: Operation not permitted)\n')) return 1;
    const t = U.strftime('%H:%M:%S', new Date());
    c.out(`tcpdump: verbose output suppressed, use -v[v]... for full protocol decode\nlistening on eth0, link-type EN10MB (Ethernet), snapshot length 262144 bytes\n${t}.104233 IP 192.168.1.5.52244 > 192.168.1.10.22: Flags [P.], seq 1:37, ack 1, win 501, length 36\n${t}.104810 IP 192.168.1.10.22 > 192.168.1.5.52244: Flags [P.], seq 1:37, ack 37, win 501, length 36\n${t}.105002 IP 192.168.1.5.52244 > 192.168.1.10.22: Flags [.], ack 37, win 501, length 0\n3 packets captured\n3 packets received by filter\n0 packets dropped by kernel\n`);
  }, { pkg: 'tcpdump' });
  def('nslookup', async (c, args) => {
    const sh = c.sh;
    const h = args.find((a) => !a.startsWith('-'));
    if (!h) return 0;
    const ns = sh.dnsServers()[0] || '';
    if (sh.dnsDown()) {
      c.out(';; communications error to ' + (ns || '127.0.0.53') + '#53: timed out\n;; no servers could be reached\n\n');
      return 1;
    }
    const ip = sh.resolveHost(h);
    if (!ip || h === ip) {
      c.out(`Server:\t\t${ns}\nAddress:\t${ns}#53\n\n** server can't find ${h}: NXDOMAIN\n\n`);
      return 1;
    }
    c.out(`Server:\t\t${ns}\nAddress:\t${ns}#53\n\nNon-authoritative answer:\nName:\t${h}\nAddress: ${ip}\n\n`);
  });
  def('dig', async (c, args) => {
    const sh = c.sh;
    const h = args.find((a) => !a.startsWith('-') && !a.startsWith('+') && !a.startsWith('@'));
    const type = args.find((a) => /^(A|AAAA|MX|NS|TXT|CNAME|SOA)$/.test(a)) || 'A';
    const short = args.includes('+short');
    const ip = sh.resolveHost(h);
    if (sh.dnsDown()) {
      c.out(`;; communications error to ${sh.dnsServers()[0] || '127.0.0.53'}#53: timed out\n;; no servers could be reached\n`);
      return 9;
    }
    if (short) {
      if (type === 'A' && ip) c.out(ip + '\n');
      else if (type === 'MX') c.out('10 mail.' + h + '.\n');
      else if (type === 'NS') c.out('ns1.' + h + '.\nns2.' + h + '.\n');
      else if (type === 'TXT') c.out('"v=spf1 -all"\n');
      return 0;
    }
    c.out(`\n; <<>> DiG 9.18.28-0ubuntu0.24.04.1-Ubuntu <<>> ${h} ${type}\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: ${ip ? 'NOERROR' : 'NXDOMAIN'}, id: 41763\n;; flags: qr rd ra; QUERY: 1, ANSWER: ${ip && type === 'A' ? 1 : 0}, AUTHORITY: 0, ADDITIONAL: 1\n\n;; QUESTION SECTION:\n;${h}.\t\t\tIN\t${type}\n\n${ip && type === 'A' ? `;; ANSWER SECTION:\n${h}.\t\t300\tIN\tA\t${ip}\n\n` : ''};; Query time: 12 msec\n;; SERVER: ${sh.dnsServers()[0] || '127.0.0.53'}#53(${sh.dnsServers()[0] || '127.0.0.53'}) (UDP)\n;; MSG SIZE  rcvd: 56\n\n`);
  }, { pkg: 'dnsutils' });
  def('host', async (c, args) => {
    const h = args[0];
    const ip = c.sh.resolveHost(h);
    if (c.sh.dnsDown()) {
      c.out(';; communications error to ' + (c.sh.dnsServers()[0] || '127.0.0.53') + '#53: timed out\n;; no servers could be reached\n');
      return 1;
    }
    if (!ip) {
      c.out(`Host ${h} not found: 3(NXDOMAIN)\n`);
      return 1;
    }
    c.out(`${h} has address ${ip}\n`);
  }, { pkg: 'dnsutils' });

  /* ---------- firewalls ---------- */
  const SERVICES = { ssh: 22, http: 80, https: 443, smtp: 25, domain: 53, dns: 53, mysql: 3306, postgresql: 5432, 'nginx full': [80, 443], 'nginx http': 80, 'nginx https': 443, openssh: 22, ftp: 21, 'apache': 80, 'apache full': [80, 443], nfs: 2049 };
  const portsOf = (spec) => {
    const s = String(spec).toLowerCase();
    if (s.includes(',')) {
      const pr = /\/(tcp|udp)$/.exec(s);
      const all = s.replace(/\/(tcp|udp)$/, '').split(',').map((x) => portsOf(x + (pr ? '/' + pr[1] : '')));
      return all.some((x) => !x) ? null : all.flat();
    }
    if (SERVICES[s] !== undefined) return [].concat(SERVICES[s]).map((p) => ({ port: p, proto: 'tcp' }));
    const m = /^(\d+)(?::(\d+))?(?:\/(tcp|udp))?$/.exec(s);
    if (!m) return null;
    return [{ port: +m[1], port2: m[2] ? +m[2] : undefined, proto: m[3] || 'any' }];
  };
  /** decide for incoming traffic: 'ACCEPT' | 'DROP' | 'REJECT' */
  LX.fwDecision = function (sh, port, proto, loopback, src) {
    proto = proto || 'tcp';
    const ipt = sh.fw.ipt.INPUT;
    for (const r of ipt.rules) {
      if (r.iface === 'lo' && !loopback) continue;
      if (r.iface && r.iface !== 'lo' && loopback) continue;
      if (r.state) continue;
      if (r.proto && r.proto !== 'all' && r.proto !== proto) continue;
      if (r.dport && !(r.dport === port || (r.dport2 && port >= r.dport && port <= r.dport2))) continue;
      if (r.src && r.src !== src) continue;
      return r.action;
    }
    if (loopback) return 'ACCEPT';
    if (sh.fw.ufw.enabled) {
      for (const r of sh.fw.ufw.rules) {
        if (r.dir === 'out') continue;
        const hit = r.port === port || (r.port2 && port >= r.port && port <= r.port2);
        if (hit && (r.proto === 'any' || r.proto === proto) && (!r.from || r.from === 'Anywhere' || r.from === src || (r.from.includes('/') && src && cidrHas(r.from, src)))) return r.action === 'allow' || r.action === 'limit' ? 'ACCEPT' : r.action === 'reject' ? 'REJECT' : 'DROP';
      }
      return sh.fw.ufw.defIn === 'allow' ? 'ACCEPT' : sh.fw.ufw.defIn === 'reject' ? 'REJECT' : 'DROP';
    }
    if (sh.services.firewalld && sh.services.firewalld.active) {
      const rt = sh.fw.fwd.runtime;
      const allowed = rt.ports.some((p) => +p.split('/')[0] === port) || rt.services.some((s) => [].concat(SERVICES[s] || []).includes(port));
      return allowed ? 'ACCEPT' : 'REJECT';
    }
    return ipt.policy === 'ACCEPT' ? 'ACCEPT' : ipt.policy === 'DROP' ? 'DROP' : 'REJECT';
  };
  function cidrHas(cidr, ip) {
    const [b, p] = cidr.split('/');
    const mask = maskOf(+p);
    return (ip2n(ip) & mask) >>> 0 === (ip2n(b) & mask) >>> 0;
  }
  /** state of a tcp port as seen from `ip`: open | refused | filtered | unreachable */
  LX.portState = function (sh, ip, port) {
    const own = sh.ownIps().includes(ip);
    if (!own) {
      if (!sh.netUp()) return 'unreachable';
      const remote = { '192.168.1.20': [22], '192.168.1.21': [22, 3306], '192.168.1.30': [22, 80] };
      if (remote[ip]) return remote[ip].includes(port) ? 'open' : 'refused';
      return [80, 443].includes(port) ? 'open' : 'refused';
    }
    const loop = ip.startsWith('127.');
    const dec = LX.fwDecision(sh, port, 'tcp', loop, loop ? '127.0.0.1' : '192.168.1.5');
    if (dec === 'DROP') return 'filtered';
    const has = sh.listening().some((r) => r.port === port && r.proto === 'tcp');
    if (dec === 'REJECT') return 'refused';
    return has ? 'open' : 'refused';
  };
  const ufwRuleText = (r) => {
    const to = r.port2 ? `${r.port}:${r.port2}` : String(r.port);
    const t = r.proto === 'any' ? to : `${to}/${r.proto}`;
    return { to: r.label || t, from: r.from || 'Anywhere' };
  };
  def('ufw', async (c, args) => {
    const sh = c.sh;
    const u = sh.fw.ufw;
    if (!sh.installed.has('ufw')) {
      c.err("Command 'ufw' not found, but can be installed with:\n\nsudo apt install ufw\n\n");
      return 127;
    }
    const forced = args.includes('--force');
    args = args.filter((a) => a !== '--force');
    if (forced) args.push('--force');
    const sub = args[0];
    const need = () => (sh.eu() === 'root' ? false : (c.err('ERROR: You need to be root to run this script\n'), true));
    if (sub === 'status') {
      if (need()) return 1;
      if (!u.enabled) return c.out('Status: inactive\n');
      const verbose = args.includes('verbose');
      const numbered = args.includes('numbered');
      c.out(`Status: active\n${verbose ? `Logging: on (${u.logging})\nDefault: ${u.defIn} (incoming), ${u.defOut} (outgoing), disabled (routed)\nNew profiles: skip\n` : ''}\n`);
      const rows = [];
      u.rules.forEach((r, i) => {
        const x = ufwRuleText(r);
        rows.push([(numbered ? `[${String(i + 1).padStart(2)}] ` : '') + x.to, r.action.toUpperCase() + (r.dir === 'out' ? ' OUT' : ' IN').replace(' IN', verbose ? ' IN' : ''), x.from]);
      });
      const w0 = Math.max(26, ...rows.map((r) => r[0].length + 2));
      c.out('To'.padEnd(w0) + 'Action'.padEnd(12) + 'From\n' + '--'.padEnd(w0) + '------'.padEnd(12) + '----\n');
      rows.forEach((r) => c.out(r[0].padEnd(w0) + r[1].padEnd(12) + r[2] + '\n'));
      return 0;
    }
    if (need()) return 1;
    switch (sub) {
      case 'enable': {
        if (!args.includes('--force') && sh.hooks.readLine) {
          const a = await sh.hooks.readLine('Command may disrupt existing ssh connections. Proceed with operation (y|n)? ');
          if (!/^y/i.test(a || '')) {
            c.out('Aborted\n');
            return 0;
          }
        } else if (!sh.hooks.readLine) c.out('Command may disrupt existing ssh connections. Proceed with operation (y|n)? y\n');
        u.enabled = true;
        c.out('Firewall is active and enabled on system startup\n');
        return 0;
      }
      case 'disable':
        u.enabled = false;
        c.out('Firewall stopped and disabled on system startup\n');
        return 0;
      case 'reset':
        sh.fw.ufw = { enabled: false, defIn: 'deny', defOut: 'allow', rules: [], logging: 'low' };
        c.out('Resetting all rules to installed defaults. Proceed with operation (y|n)? y\nBacking up \'user.rules\' to \'/etc/ufw/user.rules.20261026_140000\'\nFirewall stopped and disabled on system startup\n');
        return 0;
      case 'reload':
        c.out('Firewall reloaded\n');
        return 0;
      case 'logging':
        u.logging = args[1] === 'off' ? 'off' : args[1] || 'low';
        c.out('Logging ' + (args[1] === 'off' ? 'disabled' : 'enabled') + '\n');
        return 0;
      case 'default': {
        const act = args[1];
        const dir = args[2] || 'incoming';
        if (!['allow', 'deny', 'reject'].includes(act)) {
          c.err('ERROR: Invalid default policy\n');
          return 1;
        }
        if (dir === 'incoming') u.defIn = act;
        else u.defOut = act;
        c.out(`Default ${dir} policy changed to '${act}'\n(be sure to update your rules accordingly)\n`);
        return 0;
      }
      case 'app':
        c.out('Available applications:\n  Nginx Full\n  Nginx HTTP\n  Nginx HTTPS\n  OpenSSH\n');
        return 0;
      case 'delete': {
        const spec = args.slice(1);
        if (/^\d+$/.test(spec[0])) {
          const i = +spec[0] - 1;
          if (!u.rules[i]) {
            c.err('ERROR: Could not delete non-existent rule\n');
            return 1;
          }
          u.rules.splice(i, 1);
          c.out('Rule deleted\n');
          return 0;
        }
        const act = spec[0];
        const ps = portsOf(spec[1] || '');
        const i = u.rules.findIndex((r) => r.action === act && ps && ps.some((p) => p.port === r.port));
        if (i < 0) {
          c.err('Could not delete non-existent rule\n');
          return 0;
        }
        u.rules.splice(i, 1);
        c.out('Rule deleted\n');
        return 0;
      }
      case 'allow':
      case 'deny':
      case 'reject':
      case 'limit': {
        let rest = args.slice(1);
        let dir = 'in';
        if (rest[0] === 'in' || rest[0] === 'out') dir = rest.shift();
        let from = 'Anywhere';
        const fi = rest.indexOf('from');
        let portSpec = rest[0];
        if (fi >= 0) {
          from = rest[fi + 1];
          const pi = rest.indexOf('port');
          const prI = rest.indexOf('proto');
          portSpec = pi >= 0 ? rest[pi + 1] + (prI >= 0 && rest[prI + 1] ? '/' + rest[prI + 1] : '') : 'any';
        }
        if (portSpec === 'any' || !portSpec) {
          u.rules.push({ action: sub, dir, port: 0, proto: 'any', from, label: 'Anywhere' });
          c.out('Rule added\n');
          return 0;
        }
        const ps = portsOf(portSpec);
        if (!ps) {
          c.err(`ERROR: Could not find a profile matching '${portSpec}'\n`);
          return 1;
        }
        const lbl = /^[A-Za-z]/.test(portSpec) && SERVICES[portSpec.toLowerCase()] === undefined ? null : /^[A-Za-z]/.test(portSpec) ? portSpec : null;
        for (const p of ps) {
          if (u.rules.some((r) => r.port === p.port && r.proto === p.proto && r.action === sub && r.from === from)) {
            c.out('Skipping adding existing rule\n');
            continue;
          }
          u.rules.push({ action: sub, dir, port: p.port, port2: p.port2, proto: p.proto, from, label: lbl && ps.length === 1 ? lbl : null });
          c.out('Rule added\n');
          c.out('Rule added (v6)\n');
        }
        return 0;
      }
    }
    c.err(`ERROR: Invalid syntax\n\nUsage: ufw COMMAND\n`);
    return 1;
  }, { pkg: 'ufw' });
  const parseIpt = (a) => {
    const r = { proto: null, dport: null, src: null, iface: null, action: null, state: null, text: '' };
    for (let i = 0; i < a.length; i++) {
      const t = a[i];
      if (t === '-p' || t === '--protocol') r.proto = a[++i];
      else if (t === '--dport' || t === '--destination-port') {
        const v = a[++i];
        if (v.includes(':')) [r.dport, r.dport2] = v.split(':').map(Number);
        else r.dport = +v;
      } else if (t === '-s' || t === '--source') r.src = a[++i].replace(/\/32$/, '');
      else if (t === '-i') r.iface = a[++i];
      else if (t === '-j') r.action = a[++i];
      else if (t === '--state' || t === '--ctstate') r.state = a[++i];
      else if (t === '-m') i++;
    }
    r.text = a.join(' ');
    return r;
  };
  def('iptables', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root') {
      c.err('iptables v1.8.10 (nf_tables): Could not fetch rule set generation id: Permission denied (you must be root)\n');
      return 4;
    }
    const f = sh.fw.ipt;
    let i = 0;
    let table = 'filter';
    if (args[0] === '-t') {
      table = args[1];
      i = 2;
    }
    const op = args[i];
    const chain = args[i + 1];
    if (op === '-L' || op === '-S' || op === '-n' || op === '-nL' || op === '-vnL' || op === '-L,' || (op && /^-[a-zA-Z]*L/.test(op))) {
      const numeric = args.some((a) => /^-[a-z]*n/.test(a));
      const ln = args.includes('--line-numbers');
      const chains = chain && !chain.startsWith('-') ? [chain] : ['INPUT', 'FORWARD', 'OUTPUT'];
      if (table === 'nat') {
        c.out('Chain PREROUTING (policy ACCEPT)\ntarget     prot opt source               destination         \n\nChain INPUT (policy ACCEPT)\ntarget     prot opt source               destination         \n\nChain OUTPUT (policy ACCEPT)\ntarget     prot opt source               destination         \n\nChain POSTROUTING (policy ACCEPT)\ntarget     prot opt source               destination         \n');
        return 0;
      }
      for (const ch of chains) {
        if (!f[ch]) {
          c.err(`iptables: No chain/target/match by that name.\n`);
          return 1;
        }
        c.out(`Chain ${ch} (policy ${f[ch].policy})\n${ln ? 'num  ' : ''}target     prot opt source               destination         \n`);
        f[ch].rules.forEach((r, k) => c.out(`${ln ? String(k + 1).padEnd(5) : ''}${(r.action || '').padEnd(10)} ${(r.proto || 'all').padEnd(4)} --  ${(r.src || (numeric ? '0.0.0.0/0' : 'anywhere')).padEnd(20)} ${(numeric ? '0.0.0.0/0' : 'anywhere').padEnd(20)}${r.dport ? ' ' + (r.proto || 'tcp') + ' dpt:' + r.dport : ''}${r.state ? ' state ' + r.state : ''}\n`));
        c.out('\n');
      }
      return 0;
    }
    if (op === '-F') {
      (chain ? [chain] : Object.keys(f)).forEach((ch) => f[ch] && (f[ch].rules = []));
      return 0;
    }
    if (op === '-P') {
      if (!f[chain] || !['ACCEPT', 'DROP'].includes(args[i + 2])) {
        c.err('iptables: Bad policy name.\n');
        return 2;
      }
      f[chain].policy = args[i + 2];
      return 0;
    }
    if (op === '-A' || op === '-I') {
      if (!f[chain]) {
        c.err(`iptables: No chain/target/match by that name.\n`);
        return 1;
      }
      const rest = args.slice(i + 2);
      const pos = op === '-I' && /^\d+$/.test(rest[0]) ? +rest.shift() - 1 : 0;
      const r = parseIpt(rest);
      if (!r.action) {
        c.err('iptables v1.8.10 (nf_tables): Bad argument; a target (-j) is required here\n');
        return 2;
      }
      if (!['ACCEPT', 'DROP', 'REJECT', 'LOG'].includes(r.action)) {
        c.err(`iptables v1.8.10 (nf_tables): Couldn't load target \`${r.action}':No such file or directory\n`);
        return 2;
      }
      if (op === '-A') f[chain].rules.push(r);
      else f[chain].rules.splice(pos, 0, r);
      return 0;
    }
    if (op === '-D') {
      const n = args[i + 2];
      if (/^\d+$/.test(n || '')) {
        if (!f[chain].rules[+n - 1]) {
          c.err('iptables: Index of deletion too big.\n');
          return 1;
        }
        f[chain].rules.splice(+n - 1, 1);
        return 0;
      }
      const r = parseIpt(args.slice(i + 2));
      const k = f[chain].rules.findIndex((x) => x.proto === r.proto && x.dport === r.dport && x.action === r.action && x.src === r.src);
      if (k < 0) {
        c.err('iptables: Bad rule (does a matching rule exist in that chain?).\n');
        return 1;
      }
      f[chain].rules.splice(k, 1);
      return 0;
    }
    c.err('iptables v1.8.10 (nf_tables): no command specified\nTry `iptables -h\' or \'iptables --help\' for more information.\n');
    return 2;
  });
  def('iptables-save', async (c) => {
    if (needRoot(c, 'iptables-save: Permission denied (you must be root)\n')) return 1;
    const f = c.sh.fw.ipt;
    c.out('# Generated by iptables-save v1.8.10 (nf_tables)\n*filter\n');
    for (const ch of ['INPUT', 'FORWARD', 'OUTPUT']) c.out(`:${ch} ${f[ch].policy} [0:0]\n`);
    for (const ch of ['INPUT', 'FORWARD', 'OUTPUT']) f[ch].rules.forEach((r) => c.out(`-A ${ch} ${r.text}\n`));
    c.out('COMMIT\n');
  });
  def('nft', async (c, args) => {
    if (needRoot(c, 'Operation not permitted (you must be root)\n')) return 1;
    const f = c.sh.fw;
    c.out('table inet filter {\n\tchain input {\n\t\ttype filter hook input priority filter; policy ' + (f.ipt.INPUT.policy === 'DROP' || (f.ufw.enabled && f.ufw.defIn !== 'allow') ? 'drop' : 'accept') + ';\n\t\tiif "lo" accept\n');
    for (const r of f.ipt.INPUT.rules) if (r.dport) c.out(`\t\ttcp dport ${r.dport} ${(r.action || '').toLowerCase()}\n`);
    if (f.ufw.enabled) for (const r of f.ufw.rules) c.out(`\t\ttcp dport ${r.port} ${r.action === 'allow' ? 'accept' : 'drop'}\n`);
    c.out('\t}\n\tchain forward {\n\t\ttype filter hook forward priority filter; policy accept;\n\t}\n}\n');
  }, { pkg: 'nftables' });
  def('firewall-cmd', async (c, args) => {
    const sh = c.sh;
    const fw = sh.fw.fwd;
    if (!sh.installed.has('firewalld')) {
      c.err("Command 'firewall-cmd' not found, but can be installed with:\n\nsudo apt install firewalld\n\n");
      return 127;
    }
    const svc = sh.services.firewalld;
    if (args.includes('--state')) {
      if (!svc || !svc.active) {
        c.err('not running\n');
        return 252;
      }
      return c.out('running\n');
    }
    if (!svc || !svc.active) {
      c.err('FirewallD is not running\n');
      return 252;
    }
    const perm = args.includes('--permanent');
    const set = perm ? fw.permanent : fw.runtime;
    let st = 0;
    const mutate = args.some((a) => /^--(add|remove)-/.test(a));
    if (mutate && sh.eu() !== 'root') {
      c.err('Authorization failed.\n    Make sure polkit agent is running or run the application as superuser.\n');
      return 2;
    }
    for (const a of args) {
      let m;
      if (a === '--get-default-zone') c.out(fw.zone + '\n');
      else if (a === '--get-active-zones') c.out(`${fw.zone}\n  interfaces: eth0\n`);
      else if (a === '--list-services') c.out(set.services.join(' ') + '\n');
      else if (a === '--list-ports') c.out(set.ports.join(' ') + '\n');
      else if (a === '--list-all') c.out(`${fw.zone}${perm ? '' : ' (active)'}\n  target: default\n  icmp-block-inversion: no\n  interfaces: eth0\n  sources: \n  services: ${set.services.join(' ')}\n  ports: ${set.ports.join(' ')}\n  protocols: \n  forward: yes\n  masquerade: no\n  forward-ports: \n  source-ports: \n  icmp-blocks: \n  rich rules: \n`);
      else if ((m = /^--add-service=(.+)$/.exec(a))) {
        if (!SERVICES[m[1]] && !['dhcpv6-client', 'cockpit'].includes(m[1])) {
          c.err(`Error: INVALID_SERVICE: '${m[1]}' not among existing services\n`);
          return 101;
        }
        if (!set.services.includes(m[1])) set.services.push(m[1]);
        c.out('success\n');
      } else if ((m = /^--remove-service=(.+)$/.exec(a))) {
        set.services = set.services.filter((x) => x !== m[1]);
        c.out('success\n');
      } else if ((m = /^--add-port=(.+)$/.exec(a))) {
        if (!/^\d+(-\d+)?\/(tcp|udp)$/.test(m[1])) {
          c.err(`Error: INVALID_PORT: ${m[1]}\n`);
          return 102;
        }
        if (!set.ports.includes(m[1])) set.ports.push(m[1]);
        c.out('success\n');
      } else if ((m = /^--remove-port=(.+)$/.exec(a))) {
        set.ports = set.ports.filter((x) => x !== m[1]);
        c.out('success\n');
      } else if ((m = /^--query-service=(.+)$/.exec(a))) {
        c.out(set.services.includes(m[1]) ? 'yes\n' : 'no\n');
        st = set.services.includes(m[1]) ? 0 : 1;
      } else if (a === '--reload') {
        fw.runtime = JSON.parse(JSON.stringify(fw.permanent));
        c.out('success\n');
      } else if (a === '--runtime-to-permanent') {
        fw.permanent = JSON.parse(JSON.stringify(fw.runtime));
        c.out('success\n');
      }
    }
    return st;
  }, { pkg: 'firewalld' });

  /* ---------- HTTP client ---------- */
  const EXAMPLE = '<!doctype html>\n<html>\n<head>\n    <title>Example Domain</title>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n</head>\n\n<body>\n<div>\n    <h1>Example Domain</h1>\n    <p>This domain is for use in illustrative examples in documents. You may use this\n    domain in literature without prior coordination or asking for permission.</p>\n    <p><a href="https://www.iana.org/domains/example">More information...</a></p>\n</div>\n</body>\n</html>\n';
  const REASON = { 200: 'OK', 201: 'Created', 301: 'Moved Permanently', 302: 'Found', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable' };
  LX.REASON = REASON;
  /** Perform a simulated HTTP request. Returns {status, headers, body} or {err, msg} */
  LX.httpRequest = async function (sh, o) {
    const ip = sh.resolveHost(o.host);
    if (!ip) return { err: 6, msg: `Could not resolve host: ${o.host}` };
    const own = sh.ownIps().includes(ip);
    const port = o.port;
    if (!own) {
      if (!sh.netUp()) return { err: 7, msg: `Failed to connect to ${o.host} port ${port} after 0 ms: Network is unreachable` };
      const known = { 'example.com': 1, 'www.example.com': 1, 'api.github.com': 1, 'ifconfig.me': 1, 'jsonplaceholder.typicode.com': 1, 'httpbin.org': 1, 'github.com': 1, 'google.com': 1, 'www.google.com': 1, 'ubuntu.com': 1, 'wikipedia.org': 1, 'archive.ubuntu.com': 1 };
      const st = LX.portState(sh, ip, port);
      if (st === 'refused') return { err: 7, msg: `Failed to connect to ${o.host} port ${port} after 12 ms: Connection refused` };
      let body;
      let ct = 'text/html; charset=UTF-8';
      const h = o.host;
      if (/example\.com$/.test(h)) body = EXAMPLE;
      else if (h === 'api.github.com' && o.path === '/zen') (body = 'Keep it logically awesome.\n'), (ct = 'text/plain');
      else if (h === 'ifconfig.me') (body = '203.0.113.42'), (ct = 'text/plain');
      else if (h === 'jsonplaceholder.typicode.com') (body = '{\n  "userId": 1,\n  "id": 1,\n  "title": "delectus aut autem",\n  "completed": false\n}\n'), (ct = 'application/json');
      else if (h === 'httpbin.org') (body = `{\n  "args": {},\n  "headers": {"Host": "httpbin.org"},\n  "origin": "203.0.113.42",\n  "url": "https://httpbin.org${o.path}"\n}\n`), (ct = 'application/json');
      else if (ip === '192.168.1.20' || ip === '192.168.1.30') body = `<html><body><h1>${h}</h1><p>Hello from ${h}</p></body></html>\n`;
      else body = `<html><head><title>${h}</title></head><body><h1>${h}</h1><p>(sandbox page)</p></body></html>\n`;
      if (o.scheme === 'https' || port === 443) { /* ok */ }
      return { status: 200, headers: { 'Content-Type': ct, Server: 'ECS (dcb/7F83)', Date: new Date().toUTCString() }, body, ip };
    }
    const loop = ip.startsWith('127.');
    const dec = LX.fwDecision(sh, port, 'tcp', loop, loop ? '127.0.0.1' : '192.168.1.5');
    if (dec === 'DROP') return { err: 28, msg: `Failed to connect to ${o.host} port ${port} after 130000 ms: Timeout was reached` };
    if (dec === 'REJECT') return { err: 7, msg: `Failed to connect to ${o.host} port ${port} after 0 ms: Couldn't connect to server` };
    const l = sh.listeners[port];
    if (!l || !l.handler) return { err: 7, msg: `Failed to connect to ${o.host} port ${port} after 0 ms: Couldn't connect to server` };
    if ((o.scheme === 'https') !== !!l.tls) {
      if (o.scheme === 'https' && !l.tls) return { err: 35, msg: 'OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to ' + o.host + ':' + port };
      if (l.tls && o.scheme !== 'https') return { status: 400, headers: { Server: l.server || 'nginx', 'Content-Type': 'text/html' }, body: '<html><head><title>400 The plain HTTP request was sent to HTTPS port</title></head>\n<body><center><h1>400 Bad Request</h1></center><center>The plain HTTP request was sent to HTTPS port</center></body></html>\n' };
    }
    if (l.tls && o.scheme === 'https' && !o.insecure && !(sh.trustedCerts || []).includes(l.certId)) return { err: 60, msg: 'SSL certificate problem: self-signed certificate\nMore details here: https://curl.se/docs/sslcerts.html' };
    return await l.handler({ method: o.method || 'GET', path: o.path, host: o.hostHeader || o.host, headers: o.headers || {}, body: o.body || '', port, ip, ua: o.ua || 'curl/8.5.0' });
  };
  const parseUrl = (raw) => {
    let u = raw;
    if (!/^[a-z]+:\/\//i.test(u)) u = 'http://' + u;
    const m = /^([a-z]+):\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^/:?#]+)(?::(\d+))?(\/[^?#]*)?(\?[^#]*)?/i.exec(u);
    if (!m) return null;
    return { scheme: m[1].toLowerCase(), host: m[2].toLowerCase(), port: m[3] ? +m[3] : m[1].toLowerCase() === 'https' ? 443 : 80, path: (m[4] || '/') + (m[5] || '') };
  };
  def('curl', async (c, args) => {
    const sh = c.sh;
    const vals = ['-o', '-X', '-d', '-H', '-u', '-A', '-w', '--connect-timeout', '-m', '--max-time', '--resolve', '--data', '--header', '--request', '-e', '--output', '--user-agent', '--write-out', '-T'];
    const o = {};
    const urls = [];
    const headers = {};
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (vals.includes(a)) {
        const v = args[++i];
        if (a === '-H' || a === '--header') {
          const k = v.indexOf(':');
          headers[v.slice(0, k).trim()] = v.slice(k + 1).trim();
        } else o[a.replace(/^-+/, '')] = v;
      } else if (/^-[a-zA-Z]{2,}$/.test(a)) for (const ch of a.slice(1)) o[ch] = true;
      else if (a.startsWith('--')) o[a.slice(2)] = true;
      else if (a.startsWith('-')) o[a.slice(1)] = true;
      else urls.push(a);
    }
    if (!urls.length) {
      c.err("curl: try 'curl --help' or 'curl --manual' for more information\n");
      return 2;
    }
    const silent = o.s || o.silent;
    let st = 0;
    for (const url of urls) {
      const u = parseUrl(url);
      if (!u) {
        if (!silent || o.S) c.err('curl: (3) URL rejected: Malformed input to a URL function\n');
        st = 3;
        continue;
      }
      let r;
      let redirects = 0;
      let cur = u;
      const verbose = o.v;
      if (verbose) c.out(`*   Trying ${sh.resolveHost(cur.host) || '?'}:${cur.port}...\n`);
      for (;;) {
        r = await LX.httpRequest(sh, { host: cur.host, port: cur.port, path: cur.path, scheme: cur.scheme, method: o.X || o.request || (o.d || o.data ? 'POST' : o.I || o.head ? 'HEAD' : 'GET'), headers, hostHeader: headers.Host || cur.host, body: o.d || o.data || '', insecure: o.k || o.insecure, ua: o.A });
        if (!r.err && [301, 302].includes(r.status) && (o.L || o.location) && redirects < 5) {
          const loc = r.headers.Location;
          const nu = parseUrl(/^https?:/.test(loc) ? loc : `${cur.scheme}://${cur.host}${loc}`);
          if (!nu) break;
          cur = nu;
          redirects++;
          continue;
        }
        break;
      }
      if (verbose) {
        if (r.err) c.out(r.err === 7 ? `* connect to ${sh.resolveHost(cur.host) || cur.host} port ${cur.port} failed: Connection refused\n* Failed to connect to ${cur.host} port ${cur.port} after 0 ms: Couldn't connect to server\n* Closing connection\n` : r.err === 6 ? `* Could not resolve host: ${cur.host}\n* Closing connection\n` : '');
        else c.out(`* Connected to ${cur.host} (${sh.resolveHost(cur.host)}) port ${cur.port}\n> ${o.X || o.request || (o.d || o.data ? 'POST' : o.I || o.head ? 'HEAD' : 'GET')} ${cur.path} HTTP/1.1\n> Host: ${headers.Host || cur.host}\n> User-Agent: curl/8.5.0\n> Accept: */*\n>\n`);
      }
      if (r.err) {
        if (!silent || o.S) c.err(`curl: (${r.err}) ${r.msg}\n`);
        st = r.err;
        continue;
      }
      if (o.f && r.status >= 400) {
        if (!silent || o.S) c.err(`curl: (22) The requested URL returned error: ${r.status}\n`);
        st = 22;
        continue;
      }
      const len = (r.body || '').length;
      const hdrs = `HTTP/1.1 ${r.status} ${REASON[r.status] || ''}\r\n` + Object.entries(Object.assign({ 'Content-Length': String(len) }, r.headers)).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n';
      if (verbose) c.out(`< HTTP/1.1 ${r.status} ${REASON[r.status] || ''}\n` + Object.entries(r.headers).map(([k, v]) => `< ${k}: ${v}\n`).join('') + '<\n');
      if (o.I || o.head) {
        c.out(hdrs.replace(/\r/g, ''));
        continue;
      }
      let out = (o.i || o.include ? hdrs.replace(/\r/g, '') : '') + (r.body || '');
      const dest = o.o || o.output || (o.O ? VFS.base(cur.path) || 'index.html' : null);
      if (dest && dest !== '/dev/null') {
        try {
          sh.writeFile(c.abs(dest), r.body || '', false);
        } catch (e) {
          if (!(e instanceof FsErr)) throw e;
          c.err(`curl: (23) Failure writing output to destination, passed ${len} returned 0\n`);
          st = 23;
          continue;
        }
        if (!silent) c.err(`  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current\n                                 Dload  Upload   Total   Spent    Left  Speed\n100 ${String(len).padStart(5)}  100 ${String(len).padStart(5)}    0     0   ${String(len * 6).padStart(5)}      0 --:--:-- --:--:-- --:--:--  ${len * 6}\n`);
      } else if (!dest) c.out(out);
      const w = o.w || o['write-out'];
      if (w) c.out(String(w).replace(/%\{http_code\}/g, String(r.status)).replace(/%\{size_download\}/g, String(len)).replace(/\\n/g, '\n'));
    }
    return st;
  });
  def('wget', async (c, args) => {
    const sh = c.sh;
    const vals = ['-O', '--output-document', '-P', '--header'];
    const o = {};
    const urls = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (vals.includes(a)) o[a.replace(/^-+/, '')] = args[++i];
      else if (/^--(output-document|directory-prefix)=/.test(a)) o[a.startsWith('--out') ? 'O' : 'P'] = a.split('=').slice(1).join('=');
      else if (a === '--quiet') o.q = true;
      else if (a.startsWith('-') && !a.startsWith('--') && a.length > 1) {
        for (let k = 1; k < a.length; k++) {
          const ch = a[k];
          if (ch === 'O' || ch === 'P') { o[ch] = a.slice(k + 1) || args[++i]; break; }
          o[ch] = true;
        }
      } else if (a.startsWith('-')) continue;
      else urls.push(a);
    }
    if (!urls.length) {
      c.err('wget: missing URL\nUsage: wget [OPTION]... [URL]...\n');
      return 1;
    }
    const url = urls[0];
    const u = parseUrl(url);
    const full = /^[a-z]+:\/\//.test(url) ? url : 'http://' + url;
    const ts = () => U.strftime('%F %T', new Date());
    if (!u) {
      c.err(`${url}: Invalid host name.\n`);
      return 1;
    }
    const r = await LX.httpRequest(sh, { host: u.host, port: u.port, path: u.path, scheme: u.scheme, insecure: true, ua: 'Wget/1.21.4' });
    if (r.err) {
      if (r.err === 6) c.err(`--${ts()}--  ${full}\nResolving ${u.host} (${u.host})... failed: ${LX.resolveMsg(sh)}.\nwget: unable to resolve host address ‘${u.host}’\n`);
      else c.err(`--${ts()}--  ${full}\nConnecting to ${u.host}:${u.port}... failed: Connection ${r.err === 28 ? 'timed out' : 'refused'}.\n`);
      return 4;
    }
    if (r.status >= 400) {
      c.err(`--${ts()}--  ${full}\nHTTP request sent, awaiting response... ${r.status} ${REASON[r.status]}\n${ts()} ERROR ${r.status}: ${REASON[r.status]}.\n`);
      return 8;
    }
    if (o.O === '-') {
      c.out(r.body);
      return 0;
    }
    const fname = o.O || o['output-document'] || (VFS.base(u.path.split('?')[0]) && VFS.base(u.path.split('?')[0]).includes('.') ? VFS.base(u.path.split('?')[0]) : 'index.html');
    const dir = o.P ? c.abs(o.P) : sh.cwd;
    try {
      sh.writeFile(fname.startsWith('/') ? fname : dir + '/' + fname, r.body, false);
    } catch (e) {
      if (!(e instanceof FsErr)) throw e;
      c.err(`${fname}: ${U.errTxt(e)}\n\nCannot write to ‘${fname}’ (${U.errTxt(e)}).\n`);
      return 3;
    }
    if (!o.q) c.out(`--${ts()}--  ${full}\nResolving ${u.host} (${u.host})... ${r.ip}\nConnecting to ${u.host} (${u.host})|${r.ip}|:${u.port}... connected.\nHTTP request sent, awaiting response... 200 OK\nLength: ${r.body.length} (${U.human(r.body.length)}) [${(r.headers['Content-Type'] || 'text/html').split(';')[0]}]\nSaving to: ‘${fname}’\n\n${fname.padEnd(20)}100%[===================>]  ${U.human(r.body.length).padStart(6)}  --.-KB/s    in 0s\n\n${ts()} (45.2 MB/s) - ‘${fname}’ saved [${r.body.length}/${r.body.length}]\n\n`);
    return 0;
  });
})();
