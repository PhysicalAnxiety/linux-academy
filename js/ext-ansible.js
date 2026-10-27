/* Linux Academy: Ansible simulator (inventory, ad-hoc, playbooks) */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS } = LX;
  const U = LX.U;

  const REMOTE_OK = ['demo-server', 'db01', 'web01.lab.local'];
  const stars = (s) => s + ' ' + '*'.repeat(Math.max(3, 79 - s.length - 1));
  const A = (sh) => sh.ans || (sh.ans = { shells: {} });
  const strip = (m) => String(m).replace(/^ansible\.(builtin|posix)\./, '');
  const jstr = (v) => JSON.stringify(v, null, 4);
  const q = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : "'" + String(s).replace(/'/g, "'\\''") + "'");

  /* ---------- inventory ---------- */
  function parseInventory(text, isYaml) {
    const inv = { hosts: {}, groups: { all: { hosts: [], children: [], vars: {} }, ungrouped: { hosts: [], children: [], vars: {} } } };
    const addHost = (name, vars, grp) => {
      inv.hosts[name] = Object.assign(inv.hosts[name] || {}, vars);
      const g = inv.groups[grp] || (inv.groups[grp] = { hosts: [], children: [], vars: {} });
      if (!g.hosts.includes(name)) g.hosts.push(name);
    };
    if (isYaml) {
      const y = LX.yaml.parse(text) || {};
      const walk = (name, node) => {
        const g = inv.groups[name] || (inv.groups[name] = { hosts: [], children: [], vars: {} });
        if (node && node.vars) Object.assign(g.vars, node.vars);
        if (node && node.hosts) for (const [h, v] of Object.entries(node.hosts)) addHost(h, v || {}, name);
        if (node && node.children) for (const [cn, cv] of Object.entries(node.children)) { g.children.push(cn); walk(cn, cv); }
      };
      for (const [n, node] of Object.entries(y)) walk(n, node);
    } else {
      let cur = 'ungrouped';
      let mode = 'hosts';
      for (const raw of text.split('\n')) {
        const l = raw.replace(/\s+#.*$/, '').trim();
        if (!l || l.startsWith('#') || l.startsWith(';')) continue;
        let m;
        if ((m = /^\[([\w.-]+)(?::(vars|children))?\]$/.exec(l))) {
          cur = m[1];
          mode = m[2] || 'hosts';
          inv.groups[cur] = inv.groups[cur] || { hosts: [], children: [], vars: {} };
          continue;
        }
        if (mode === 'vars') { const kv = /^([\w.-]+)\s*=\s*(.*)$/.exec(l); if (kv) inv.groups[cur].vars[kv[1]] = kv[2].replace(/^["']|["']$/g, ''); continue; }
        if (mode === 'children') { inv.groups[cur].children.push(l); inv.groups[l] = inv.groups[l] || { hosts: [], children: [], vars: {} }; continue; }
        const parts = l.split(/\s+/);
        const vars = {};
        parts.slice(1).forEach((p) => { const kv = /^([\w.-]+)=(.*)$/.exec(p); if (kv) vars[kv[1]] = kv[2].replace(/^["']|["']$/g, ''); });
        const rng = /^(.*)\[(\d+):(\d+)\](.*)$/.exec(parts[0]);
        if (rng) for (let i = +rng[2]; i <= +rng[3]; i++) addHost(rng[1] + String(i).padStart(rng[2].length, '0') + rng[4], vars, cur);
        else addHost(parts[0], vars, cur);
      }
    }
    const members = (g, seen = new Set()) => {
      if (seen.has(g) || !inv.groups[g]) return [];
      seen.add(g);
      return [...new Set(inv.groups[g].hosts.concat(...inv.groups[g].children.map((c) => members(c, seen))))];
    };
    inv.members = members;
    inv.groups.all.children = Object.keys(inv.groups).filter((g) => g !== 'all' && !Object.values(inv.groups).some((x) => x.children.includes(g)));
    inv.groups.all.hosts = Object.keys(inv.hosts);
    return inv;
  }
  function loadInventory(c, path) {
    const sh = c.sh;
    let p = path;
    if (!p) {
      const cfg = sh.fs.lookup(sh.cwd + '/ansible.cfg') || sh.fs.lookup('/etc/ansible/ansible.cfg');
      const m = cfg && /^\s*inventory\s*=\s*(\S+)/m.exec(cfg.content || '');
      p = m ? m[1] : '/etc/ansible/hosts';
    }
    const abs = c.abs(p);
    const n = sh.fs.lookup(abs);
    if (!n) return { err: `[WARNING]: Unable to parse ${abs} as an inventory source\n`, inv: null, path: abs };
    if (n.t === 'd') {
      const merged = parseInventory('', false);
      return { inv: merged, path: abs };
    }
    const text = sh.readFile(abs);
    try {
      const inv = parseInventory(text, /\.ya?ml$/.test(abs) || /^\s*(all|[\w-]+):\s*$/m.test(text) && !/^\[/m.test(text));
      // group_vars/ and host_vars/ next to the inventory and in the current folder
      for (const dir of [...new Set([VFS.dirname(abs), sh.cwd])]) {
        const load = (kind, name) => {
          for (const cand of [`${dir}/${kind}/${name}.yml`, `${dir}/${kind}/${name}.yaml`, `${dir}/${kind}/${name}`]) {
            const fn = sh.fs.lookup(cand);
            if (fn && fn.t === 'f') { try { const t = sh.readFile(cand); if (!t.startsWith('$ANSIBLE_VAULT')) return LX.yaml.parse(t) || {}; } catch (e) { /* ignore */ } }
            if (fn && fn.t === 'd') return Object.assign({}, ...Object.keys(fn.kids || {}).sort().map((k) => { try { return LX.yaml.parse(sh.readFile(`${cand}/${k}`)) || {}; } catch (e) { return {}; } }));
          }
          return null;
        };
        for (const gn of Object.keys(inv.groups)) { const gv = load('group_vars', gn); if (gv) Object.assign(inv.groups[gn].vars, gv); }
        for (const hn of Object.keys(inv.hosts)) { const hv = load('host_vars', hn); if (hv) Object.assign(inv.hosts[hn], hv); }
      }
      return { inv, path: abs };
    } catch (e) {
      return { err: `[WARNING]: * Failed to parse ${abs} with yaml plugin: ${e.message}\n`, inv: null, path: abs };
    }
  }
  function matchHosts(inv, pattern) {
    const res = [];
    for (const part of String(pattern).split(/[:,]/)) {
      const neg = part.startsWith('!');
      const name = part.replace(/^[!&]/, '');
      let hs = [];
      if (name === 'all' || name === '*') hs = Object.keys(inv.hosts);
      else if (inv.groups[name]) hs = inv.members(name);
      else if (/[*?]/.test(name)) { const re = LX.globToRegex(name); hs = Object.keys(inv.hosts).filter((h) => re.test(h)); }
      else if (inv.hosts[name]) hs = [name];
      else if (name === 'localhost') hs = ['localhost'];
      if (neg) hs.forEach((h) => { const i = res.indexOf(h); if (i >= 0) res.splice(i, 1); });
      else if (part.startsWith('&')) { for (let i = res.length - 1; i >= 0; i--) if (!hs.includes(res[i])) res.splice(i, 1); }
      else hs.forEach((h) => !res.includes(h) && res.push(h));
    }
    return res;
  }
  function hostVars(inv, h) {
    const v = {};
    for (const [gn, g] of Object.entries(inv.groups)) if (gn === 'all' || inv.members(gn).includes(h)) Object.assign(v, g.vars);
    Object.assign(v, inv.hosts[h] || {});
    return v;
  }

  /* ---------- targets ---------- */
  function target(c, host, hv, become, userOverride) {
    const sh = c.sh;
    const local = host === 'localhost' || hv.ansible_connection === 'local' || host === '127.0.0.1';
    if (local) return { ok: true, T: sh, local: true, user: sh.user };
    const user = userOverride || hv.ansible_user || sh.user;
    const addr = hv.ansible_host || host;
    if (!sh.resolveHost(addr)) return { ok: false, msg: `Failed to connect to the host via ssh: ssh: Could not resolve hostname ${addr}: ${LX.resolveMsg ? LX.resolveMsg(sh) : 'Name or service not known'}` };
    if (!sh.netUp()) return { ok: false, msg: `Failed to connect to the host via ssh: ssh: connect to host ${addr} port 22: Network is unreachable` };
    const canon = REMOTE_OK.find((r) => r === host || r === addr);
    if (!canon) return { ok: false, msg: `Failed to connect to the host via ssh: ssh: connect to host ${addr} port 22: Connection timed out` };
    const home = sh.users[sh.user].home;
    const pubs = ['id_ed25519', 'id_rsa', 'id_ecdsa'].map((k) => sh.fs.lookup(`${home}/.ssh/${k}.pub`)).filter(Boolean).map((n) => n.content.trim().split(' ').slice(0, 2).join(' '));
    const keys = ((sh.remoteAuth || {})[canon] || {})[user] || [];
    if (!pubs.some((p) => keys.includes(p))) return { ok: false, msg: `Failed to connect to the host via ssh: ${user}@${addr}: Permission denied (publickey,password).` };
    return { ok: true, T: LX.hostShell(sh, canon), local: false, user };
  }
  async function sudoRun(T, become, fn) {
    const prev = T._eu;
    if (become) T._eu = 'root';
    try { return await fn(); } finally { T._eu = prev; }
  }
  const catchFs = (T, e, what) => {
    if (e instanceof FsErr) return { failed: true, msg: `${what}: ${U.errTxt(e)}` };
    throw e;
  };

  /* ---------- templating ---------- */
  function lookup(scope, path) {
    return path.split('.').reduce((a, k) => (a === undefined || a === null ? undefined : a[k]), scope);
  }
  function evalJ(expr, scope) {
    const parts = expr.split(/\|(?!\|)/).map((x) => x.trim());
    let src = parts[0];
    let v;
    if (/^['"].*['"]$/.test(src)) v = src.slice(1, -1);
    else if (/^-?\d+(\.\d+)?$/.test(src)) v = +src;
    else if (/^(true|True)$/.test(src)) v = true;
    else if (/^(false|False)$/.test(src)) v = false;
    else if (/^[\w.[\]'"]+$/.test(src)) v = lookup(scope, src.replace(/\[['"]?([\w-]+)['"]?\]/g, '.$1'));
    else v = evalCond(src, scope);
    for (const f of parts.slice(1)) {
      const m = /^(\w+)(?:\((.*)\))?$/.exec(f);
      if (!m) continue;
      const arg = m[2] !== undefined ? evalJ(m[2].replace(/^\s+|\s+$/g, ''), scope) : undefined;
      switch (m[1]) {
        case 'default': case 'd': if (v === undefined || v === null || v === '') v = arg; break;
        case 'upper': v = String(v).toUpperCase(); break;
        case 'lower': v = String(v).toLowerCase(); break;
        case 'title': v = String(v).replace(/\b\w/g, (x) => x.toUpperCase()); break;
        case 'length': case 'count': v = v == null ? 0 : v.length; break;
        case 'join': v = Array.isArray(v) ? v.join(arg === undefined ? '' : arg) : v; break;
        case 'int': v = parseInt(v, 10) || 0; break;
        case 'string': v = String(v); break;
        case 'trim': v = String(v).trim(); break;
        case 'first': v = v && v[0]; break;
        case 'last': v = v && v[v.length - 1]; break;
        case 'bool': v = v === true || /^(yes|true|1|on)$/i.test(String(v)); break;
        case 'basename': v = VFS.base(String(v)); break;
        case 'to_json': v = JSON.stringify(v); break;
        case 'regex_replace': break;
        default: break;
      }
    }
    return v;
  }
  function render(val, scope) {
    if (typeof val === 'string') {
      const whole = /^\{\{\s*(.*?)\s*\}\}$/.exec(val);
      if (whole && !val.slice(2).includes('{{')) { const r = evalJ(whole[1], scope); if (r === undefined) throw new Error(`'${whole[1].split(/[|.]/)[0].trim()}' is undefined`); return r; }
      return val.replace(/\{\{\s*(.*?)\s*\}\}/g, (m, e) => { const r = evalJ(e, scope); if (r === undefined) throw new Error(`'${e.split(/[|.]/)[0].trim()}' is undefined`); return typeof r === 'object' ? JSON.stringify(r) : String(r); });
    }
    if (Array.isArray(val)) return val.map((x) => render(x, scope));
    if (val && typeof val === 'object') return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, render(v, scope)]));
    return val;
  }
  function evalCond(expr, scope) {
    let e = String(expr).trim();
    const strs = [];
    e = e.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (m) => { strs.push(m); return `\u0000${strs.length - 1}\u0000`; });
    e = e.replace(/\bis not defined\b/g, '=== undefined').replace(/\bis defined\b/g, '!== undefined').replace(/\bis (not )?(changed|failed|succeeded|success|skipped)\b/g, (m, n, w) => `.__is_${w}() === ${n ? 'false' : 'true'}`)
      .replace(/\band\b/g, '&&').replace(/\bor\b/g, '||').replace(/\bnot\b/g, '!').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null')
      .replace(/\b(\w+) not in ([\w.]+)/g, '!__in($1, $2)').replace(/(\u0000\d+\u0000|[\w.]+) in ([\w.\[\],\u0000 ]+?)(?=\s*(&&|\|\||\)|$))/g, '__in($1, $2)');
    e = e.replace(/\u0000(\d+)\u0000/g, (m, i) => strs[+i]);
    const bare = e.match(/^[\w.]+$/);
    // eslint-disable-next-line no-new-func
    const fn = new Function('scope', '__in', `with (scope) { try { return (${e}); } catch (err) { if (err instanceof ReferenceError) return undefined; throw err; } }`);
    const wrapScope = new Proxy(scope, { has: (t, k) => k !== '__in' && k !== 'undefined' && typeof k === 'string' && !(k in globalThis && !(k in t)), get: (t, k) => (k === Symbol.unscopables ? undefined : t[k]) });
    const r = fn(wrapScope, (a, b) => (typeof b === 'string' ? b.includes(a) : Array.isArray(b) ? b.includes(a) : b && typeof b === 'object' ? a in b : false));
    return bare && r === undefined ? undefined : r;
  }
  const truthy = (r) => r !== undefined && r !== null && r !== false && r !== 0 && r !== '' && !(typeof r === 'string' && /^(false|no|0)$/i.test(r));

  /* ---------- modules: each returns {changed, apply?, ...result} ---------- */
  const MODULES = {
    ping: async () => ({ changed: false, ping: 'pong' }),
    debug: async (args) => (args.var !== undefined ? { changed: false, __debug: { [args.var]: args.__value } } : { changed: false, msg: args.msg === undefined ? 'Hello world!' : args.msg }),
    set_fact: async (args, ctx) => { Object.assign(ctx.facts, args); return { changed: false, ansible_facts: args }; },
    fail: async (args) => ({ failed: true, msg: args.msg || 'Failed as requested from task' }),
    assert: async (args, ctx) => { const th = [].concat(args.that); for (const t of th) if (!truthy(evalCond(t, ctx.scope))) return { failed: true, assertion: t, evaluated_to: false, msg: args.fail_msg || 'Assertion failed' }; return { changed: false, msg: args.success_msg || 'All assertions passed' }; },
    pause: async () => ({ changed: false }),
    setup: async (args, ctx) => ({ changed: false, ansible_facts: ctx.factsOf() }),
    stat: async (args, ctx) => { const T = ctx.T; const n = T.fs.lookup(T.abs ? VFS.norm(args.path, T.cwd) : args.path); const st = { exists: !!n }; if (n) Object.assign(st, { isdir: n.t === 'd', isreg: n.t === 'f', size: VFS.size(n), mode: '0' + (n.mode & 0o777).toString(8), pw_name: n.owner, gr_name: n.group }); return { changed: false, stat: st }; },
    command: async (args, ctx) => cmdMod(args, ctx, false),
    shell: async (args, ctx) => cmdMod(args, ctx, true),
    raw: async (args, ctx) => cmdMod(args, ctx, true),
    apt: async (args, ctx) => pkgMod(args, ctx),
    package: async (args, ctx) => pkgMod(args, ctx),
    dnf: async (args, ctx) => pkgMod(args, ctx),
    yum: async (args, ctx) => pkgMod(args, ctx),
    copy: async (args, ctx) => {
      const T = ctx.T;
      const dest = args.dest;
      let content = args.content;
      if (content === undefined) {
        const cands = [args.src, 'files/' + args.src, VFS.norm(args.src || '', ctx.base)].filter(Boolean).map((p) => VFS.norm(p, ctx.base));
        const sn = cands.map((p) => ctx.sh.fs.lookup(p)).find(Boolean);
        if (!sn) return { failed: true, msg: `Could not find or access '${args.src}' on the Ansible Controller.` };
        content = ctx.sh.readFile(cands.find((p) => ctx.sh.fs.lookup(p)));
      }
      return fileWrite(T, ctx, dest, content, args, 'copy');
    },
    template: async (args, ctx) => {
      const cands = [args.src, 'templates/' + args.src].map((p) => VFS.norm(p, ctx.base));
      const sp = cands.find((p) => ctx.sh.fs.lookup(p));
      if (!sp) return { failed: true, msg: `Could not find or access '${args.src}' on the Ansible Controller.` };
      let text = ctx.sh.readFile(sp);
      try {
        text = text.replace(/\{%-?\s*if (.*?)\s*-?%\}([\s\S]*?)(?:\{%-?\s*else\s*-?%\}([\s\S]*?))?\{%-?\s*endif\s*-?%\}\n?/g, (m, cnd, a, b) => (truthy(evalCond(cnd, ctx.scope)) ? a.replace(/^\n/, '') : (b || '').replace(/^\n/, '')));
        text = text.replace(/\{%-?\s*for (\w+) in (.*?)\s*-?%\}([\s\S]*?)\{%-?\s*endfor\s*-?%\}\n?/g, (m, v, lst, body) => (evalJ(lst, ctx.scope) || []).map((it) => render(body.replace(/^\n/, ''), Object.assign({}, ctx.scope, { [v]: it }))).join(''));
        text = render(text, ctx.scope);
      } catch (e) { return { failed: true, msg: `AnsibleUndefinedVariable: ${e.message}` }; }
      return fileWrite(ctx.T, ctx, args.dest, text, args, 'template');
    },
    file: async (args, ctx) => {
      const T = ctx.T;
      const p = args.path || args.dest;
      const st = args.state || 'file';
      const n = T.fs.lookup(p);
      const chg = { changed: false, path: p };
      const want = (m) => (m === undefined ? null : parseInt(String(m).replace(/^0o/, ''), 8));
      if (st === 'absent') {
        if (!n) return chg;
        return { changed: true, path: p, state: 'absent', apply: async () => { await T.runSource(`rm -rf ${q(p)}`, quiet()); } };
      }
      if (st === 'directory') {
        const plan = { changed: !n, path: p, state: 'directory' };
        plan.apply = async () => { if (!n) { const r = await T.runSource(`mkdir -p ${q(p)}`, quiet()); if (r) throw new Error(`There was an issue creating ${p} as requested: [Errno 13] Permission denied: '${p}'`); } await attrs(T, p, args); };
        if (n && (modeDiff(n, args) || ownDiff(n, args))) plan.changed = true;
        return plan;
      }
      if (st === 'touch') return { changed: true, path: p, state: 'touch', apply: async () => { const r = await T.runSource(`touch ${q(p)}`, quiet()); if (r) throw new Error(`Permission denied: '${p}'`); await attrs(T, p, args); } };
      if (st === 'link') { const ex = n && n.t === 'l' && n.target === args.src; return { changed: !ex, dest: p, src: args.src, apply: async () => { await T.runSource(`ln -sfn ${q(args.src)} ${q(p)}`, quiet()); } }; }
      if (!n) return { failed: true, msg: `file (${p}) is absent, use state=touch or state=directory`, path: p };
      const ch = modeDiff(n, args) || ownDiff(n, args);
      return { changed: ch, path: p, apply: async () => { await attrs(T, p, args); } };
    },
    lineinfile: async (args, ctx) => {
      const T = ctx.T;
      const p = args.path || args.dest;
      const n = T.fs.lookup(p);
      if (!n && !args.create) return { failed: true, msg: `Destination ${p} does not exist !`, rc: 257 };
      const text = n ? T.readFile(p) : '';
      const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n');
      const st = args.state || 'present';
      const re = args.regexp ? new RegExp(args.regexp) : null;
      let out = lines.slice();
      let changed = false;
      if (st === 'absent') {
        out = lines.filter((l) => !(re ? re.test(l) : l === args.line));
        changed = out.length !== lines.length;
      } else {
        const idx = re ? lines.findIndex((l) => re.test(l)) : lines.indexOf(args.line);
        if (idx >= 0) { if (lines[idx] !== args.line) { out[idx] = args.line; changed = true; } } else { if (args.insertafter && /^\^?/.test(args.insertafter)) { const ai = lines.findIndex((l) => new RegExp(args.insertafter).test(l)); if (ai >= 0) out.splice(ai + 1, 0, args.line); else out.push(args.line); } else out.push(args.line); changed = true; }
      }
      return { changed, msg: changed ? (st === 'absent' ? 'line removed' : idxMsg(lines, args)) : '', apply: async () => { try { T.writeFile(p, out.join('\n') + (out.length ? '\n' : ''), false); } catch (e) { throw new Error(`Destination ${p} not writable`); } } };
    },
    service: async (args, ctx) => svcMod(args, ctx),
    systemd: async (args, ctx) => svcMod(args, ctx),
    user: async (args, ctx) => {
      const T = ctx.T;
      const nm = args.name;
      const ex = T.users[nm];
      const st = args.state || 'present';
      if (st === 'absent') return { changed: !!ex, name: nm, state: 'absent', apply: async () => { await T.runSource(`userdel -r ${q(nm)}`, quiet()); } };
      const plan = { changed: !ex, name: nm, shell: args.shell || '/bin/bash', uid: ex ? ex.uid : 1001, home: args.home || `/home/${nm}` };
      const grp = args.groups ? [].concat(args.groups).join(',').split(',') : [];
      if (ex && grp.some((g) => !ex.groups.includes(g))) plan.changed = true;
      plan.apply = async () => {
        if (!ex) { const r = await T.runSource(`useradd ${args.create_home === false ? '' : '-m '}-s ${q(args.shell || '/bin/bash')} ${grp.length ? '-G ' + grp.join(',') + ' ' : ''}${q(nm)}`, quiet()); if (r) throw new Error(`useradd failed (rc=${r})`); } else if (grp.length) await T.runSource(`usermod -aG ${grp.join(',')} ${q(nm)}`, quiet());
      };
      return plan;
    },
    group: async (args, ctx) => { const T = ctx.T; const ex = !!(T.extraGroups[args.name] || T.users[args.name]); return { changed: !ex && (args.state || 'present') !== 'absent', name: args.name, apply: async () => { await T.runSource(`groupadd ${q(args.name)}`, quiet()); } }; },
    git: async (args, ctx) => { const T = ctx.T; const ex = T.fs.lookup(args.dest + '/.git'); return { changed: !ex, apply: async () => { if (!T.installed.has('git')) throw new Error('Failed to find required executable "git" in paths: /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'); const r = await T.runSource(`git clone ${q(args.repo)} ${q(args.dest)}`, quiet()); if (r) throw new Error(`Failed to clone ${args.repo}`); } }; },
    cron: async (args, ctx) => ({ changed: true, apply: async () => {} }),
    apt_repository: async () => ({ changed: true, apply: async () => {} }),
    get_url: async (args, ctx) => ({ changed: true, dest: args.dest, apply: async () => { const r = await ctx.T.runSource(`wget -q -O ${q(args.dest)} ${q(args.url)}`, quiet()); if (r) throw new Error('Request failed'); } }),
    uri: async (args, ctx) => { const r = await LX.httpRequest(ctx.T, (() => { const m = /^(https?):\/\/([^/:]+)(?::(\d+))?(\/.*)?$/.exec(args.url) || []; return { host: m[2], port: +(m[3] || (m[1] === 'https' ? 443 : 80)), path: m[4] || '/', scheme: m[1], method: args.method || 'GET', ua: 'ansible-httpget' }; })()); if (r.err) return { failed: true, status: -1, msg: `Status code was -1 and not [200]: Request failed: <urlopen error ${r.msg}>`, url: args.url }; return { changed: false, status: r.status, content: r.body, url: args.url }; },
    wait_for: async () => ({ changed: false, elapsed: 0 }),
    reboot: async () => ({ changed: true, rebooted: true, elapsed: 30 }),
    include_vars: async () => ({ changed: false }),
  };
  const quiet = () => ({ stdin: '', stdout: () => {}, stderr: () => {}, tty: false });
  const idxMsg = () => 'line added';
  const modeDiff = (n, a) => a.mode !== undefined && (n.mode & 0o7777) !== parseInt(String(a.mode).replace(/^0o/, ''), 8);
  const ownDiff = (n, a) => (a.owner && n.owner !== a.owner) || (a.group && n.group !== a.group);
  async function attrs(T, p, a) {
    if (a.mode !== undefined) await T.runSource(`chmod ${String(a.mode).padStart(4, '0')} ${q(p)}`, quiet());
    if (a.owner || a.group) await T.runSource(`chown ${a.owner || ''}${a.group ? ':' + a.group : ''} ${q(p)}`, quiet());
  }
  function fileWrite(T, ctx, dest, content, args, kind) {
    const n = T.fs.lookup(dest);
    const target = n && n.t === 'd' ? dest.replace(/\/$/, '') + '/' + VFS.base(args.src || 'file') : dest;
    const t2 = T.fs.lookup(target);
    const same = t2 && t2.t === 'f' && T.readFile(target) === content;
    const ch = !same || (t2 && (modeDiff(t2, args) || ownDiff(t2, args)));
    return { changed: !!ch, dest: target, checksum: hashS(content), size: content.length, mode: args.mode || '0644', owner: args.owner || 'root', state: 'file', apply: async () => {
      const par = T.fs.lookup(VFS.dirname(target));
      if (!par) throw Object.assign(new Error(`Destination directory ${VFS.dirname(target)} does not exist`), { failMsg: true });
      try { T.writeFile(target, content, false); } catch (e) { if (e instanceof FsErr) throw new Error(`Destination ${VFS.dirname(target)} not writable`); throw e; }
      await attrs(T, target, args);
    } };
  }
  const hashS = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0').repeat(5); };
  async function cmdMod(args, ctx, isShell) {
    const T = ctx.T;
    const cmd = args.cmd || args._raw_params || (Array.isArray(args.argv) ? args.argv.map(q).join(' ') : '');
    if (!cmd) return { failed: true, msg: 'no command given', rc: 256 };
    if (args.creates && T.fs.lookup(args.creates)) return { changed: false, msg: `skipped, since ${args.creates} exists`, rc: 0, stdout: `skipped, since ${args.creates} exists`, skipped: true };
    if (args.removes && !T.fs.lookup(args.removes)) return { changed: false, msg: `skipped, since ${args.removes} does not exist`, rc: 0, skipped: true };
    return { changed: true, __run: true, apply: async (r) => {
      let so = '';
      let se = '';
      const prevCwd = T.cwd;
      if (args.chdir) T.cwd = args.chdir;
      const line = !isShell ? cmd.split(/\s+/).map(q).join(' ') : cmd;
      const rc = await T.runSource(line, { stdin: '', stdout: (s) => (so += s), stderr: (s) => (se += s), tty: false });
      T.cwd = prevCwd;
      Object.assign(r, { rc, stdout: so.replace(/\n$/, ''), stderr: se.replace(/\n$/, ''), cmd, delta: '0:00:00.004', stdout_lines: so.replace(/\n$/, '').split('\n'), stderr_lines: se ? se.replace(/\n$/, '').split('\n') : [] });
      if (rc !== 0) { r.failed = true; r.msg = 'non-zero return code'; }
    } };
  }
  async function pkgMod(args, ctx) {
    const T = ctx.T;
    const names = [].concat(args.name || args.pkg || []).join(',').split(',').map((x) => x.trim()).filter(Boolean);
    const st = args.state || 'present';
    if (!names.length && args.update_cache) return { changed: false, cache_updated: true, apply: async () => {} };
    for (const n of names) if (st !== 'absent' && !LX.PKGS[n] && !LX.DEFAULT_PKGS.includes(n)) return { failed: true, msg: `No package matching '${n}' is available` };
    const todo = names.filter((n) => (st === 'absent' ? T.installed.has(n) : !T.installed.has(n)));
    return { changed: todo.length > 0, cache_updated: !!args.update_cache, apply: async () => {
      for (const n of todo) {
        let out = '';
        const rc = await T.runSource(`apt ${st === 'absent' ? 'remove' : 'install'} -y ${q(n)}`, { stdin: '', stdout: (s) => (out += s), stderr: (s) => (out += s), tty: false });
        if (rc) throw new Error(`'/usr/bin/apt-get ${st === 'absent' ? 'remove' : 'install'} ${n}' failed: E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)`);
      }
    } };
  }
  async function svcMod(args, ctx) {
    const T = ctx.T;
    const nm = args.name;
    const svc = T.services[nm];
    if (!svc) return { failed: true, msg: `Could not find the requested service ${nm}: host` };
    const st = args.state;
    const enabled = args.enabled;
    let ch = false;
    if ((st === 'started' && !svc.active) || (st === 'stopped' && svc.active) || st === 'restarted' || st === 'reloaded') ch = true;
    if (enabled !== undefined && !!svc.enabled !== truthy(enabled)) ch = true;
    return { changed: ch, name: nm, state: st, enabled: enabled, status: { ActiveState: svc.active ? 'active' : 'inactive' }, apply: async () => {
      if (st === 'started') await T.runSource(`systemctl start ${nm}`, quiet());
      else if (st === 'stopped') await T.runSource(`systemctl stop ${nm}`, quiet());
      else if (st === 'restarted') await T.runSource(`systemctl restart ${nm}`, quiet());
      else if (st === 'reloaded') await T.runSource(`systemctl reload ${nm}`, quiet());
      if (enabled !== undefined) await T.runSource(`systemctl ${truthy(enabled) ? 'enable' : 'disable'} ${nm}`, quiet());
    } };
  }

  /* ---------- runner ---------- */
  function factsOf(sh, host, T) {
    return { ansible_hostname: T.hostname.split('.')[0], ansible_fqdn: T.hostname, ansible_nodename: T.hostname, ansible_os_family: 'Debian', ansible_distribution: 'Ubuntu', ansible_distribution_version: '24.04', ansible_distribution_release: 'noble', ansible_architecture: 'x86_64', ansible_kernel: '6.8.0-45-generic', ansible_processor_vcpus: 2, ansible_memtotal_mb: 1987, ansible_user_id: T._eu || T.user, ansible_default_ipv4: { address: host === 'localhost' ? '192.168.1.10' : sh.resolveHost(host) || '192.168.1.20', interface: 'eth0' }, ansible_pkg_mgr: 'apt', ansible_service_mgr: 'systemd', ansible_python_version: '3.12.3' };
  }
  const parseKv = (s) => {
    const o = {};
    const re = /([\w]+)=("[^"]*"|'[^']*'|\S+)/g;
    let m;
    let last = 0;
    while ((m = re.exec(s))) { o[m[1]] = m[2].replace(/^["']|["']$/g, ''); last = re.lastIndex; }
    if (!Object.keys(o).length) return { _raw_params: s };
    return o;
  };
  const coerce = (v) => (v === 'yes' || v === 'true' || v === 'True' ? true : v === 'no' || v === 'false' || v === 'False' ? false : v);

  async function execTask(c, host, tinfo, task, scope, ctx, check) {
    const sh = c.sh;
    const modKey = Object.keys(task).find((k) => !['name', 'when', 'loop', 'with_items', 'register', 'notify', 'tags', 'become', 'become_user', 'ignore_errors', 'changed_when', 'failed_when', 'vars', 'environment', 'args', 'loop_control', 'delegate_to', 'no_log', 'retries', 'delay', 'until', 'check_mode', 'diff', 'listen', 'become_method', 'run_once', 'throttle', 'block', 'rescue', 'always', '__base', 'any_errors_fatal', 'ignore_unreachable', 'timeout'].includes(k));
    const mod = modKey ? strip(modKey) : null;
    const items = task.loop !== undefined ? render(task.loop, scope) : task.with_items !== undefined ? render([].concat(task.with_items), scope) : [undefined];
    const results = [];
    let anyChanged = false;
    let anyFailed = false;
    let skippedAll = true;
    const lines = [];
    for (const item of items) {
      const sc = Object.assign({}, scope, item !== undefined ? { item } : {});
      if (task.when !== undefined) {
        let ok = true;
        try { ok = [].concat(task.when).every((w) => truthy(typeof w === 'boolean' ? w : evalCond(render(String(w).replace(/^\{\{|\}\}$/g, ''), sc) === undefined ? w : w, sc))); } catch (e) { ok = false; }
        if (!ok) { results.push({ skipped: true, item }); lines.push(`skipping: [${host}]${item !== undefined ? ` => (item=${typeof item === 'object' ? JSON.stringify(item) : item})` : ''}`); continue; }
      }
      skippedAll = false;
      let r;
      try {
        let margs = task[modKey];
        if (typeof margs === 'string') margs = mod === 'command' || mod === 'shell' || mod === 'raw' ? { cmd: margs } : mod === 'debug' ? { msg: margs } : parseKv(margs);
        margs = Object.assign({}, margs || {}, task.args || {});
        if (mod === 'debug' && margs.var !== undefined) margs.__value = lookup(sc, margs.var);
        margs = render(margs, sc);
        Object.keys(margs).forEach((k) => { if (typeof margs[k] === 'string' && k !== 'content' && k !== 'line') margs[k] = coerce(margs[k]); });
        if (margs._raw_params && (mod === 'command' || mod === 'shell')) margs.cmd = margs._raw_params;
        const fn = MODULES[mod];
        if (!fn) {
          r = { failed: true, msg: `couldn't resolve module/action '${modKey}'. This often indicates a misspelling, missing collection, or incorrect module path.` };
        } else {
          const cx = Object.assign({}, ctx, { scope: sc, T: tinfo.T, factsOf: () => factsOf(sh, host, tinfo.T) });
          const become = truthy(task.become !== undefined ? task.become : ctx.become);
          r = await sudoRun(tinfo.T, become, async () => {
            let res = await fn(margs, cx);
            if (res && res.apply && !check) {
              try { await res.apply(res); } catch (e) { if (e instanceof FsErr) res = { failed: true, msg: U.errTxt(e) }; else if (e instanceof Error && !(e instanceof LX.AbortSig)) res = { failed: true, msg: e.message }; else throw e; }
            }
            if (res) delete res.apply;
            return res;
          });
          if (!tinfo.local && !(r && r.failed) && tinfo.user !== 'root' && !truthy(task.become !== undefined ? task.become : ctx.become) && ['apt', 'package', 'service', 'systemd', 'user', 'group'].includes(mod) && r && r.changed && !check) { /* real run would have failed on permissions; handled in apply */ }
        }
      } catch (e) {
        r = { failed: true, msg: /undefined/.test(e.message) ? `The task includes an option with an undefined variable. The error was: ${e.message}` : e.message };
      }
      if (task.changed_when !== undefined && r && !r.failed) r.changed = truthy(evalCond(String(task.changed_when), Object.assign({}, sc, { result: r })) ?? false) || (typeof task.changed_when === 'boolean' && task.changed_when);
      if (task.failed_when !== undefined && r) { const fw = typeof task.failed_when === 'boolean' ? task.failed_when : truthy(evalCond(String(task.failed_when), Object.assign({}, sc, { [task.register || 'result']: r, result: r }))); r.failed = fw; if (fw && !r.msg) r.msg = 'Failed because of failed_when'; }
      r.item = item;
      results.push(r);
      if (r.failed) anyFailed = true;
      if (r.changed) anyChanged = true;
      const tag = r.failed ? 'FAILED' : null;
      const itemTxt = item !== undefined ? ` => (item=${typeof item === 'object' ? JSON.stringify(item) : item})` : '';
      if (r.failed) {
        const copy = Object.assign({}, r);
        delete copy.item;
        delete copy.failed;
        lines.push(`${task.ignore_errors ? 'failed' : 'fatal'}: [${host}]: FAILED!${itemTxt ? itemTxt.replace(' =>', ' =>') : ''} => ${JSON.stringify(Object.assign({ changed: false }, copy.msg ? { msg: copy.msg } : {}, copy.rc !== undefined ? { rc: copy.rc } : {}))}`);
        if (copy.stdout || copy.stderr) lines.push(`${JSON.stringify({ stderr: copy.stderr, stdout: copy.stdout })}`.replace(/^/, '').slice(0, 0));
      } else if (mod === 'debug') {
        const body = r.__debug ? r.__debug : { msg: r.msg };
        lines.push(`ok: [${host}]${itemTxt ? itemTxt + ' =>' : ' =>'} ${jstr(body)}`.replace('=> =>', '=>'));
      } else lines.push(`${r.changed ? 'changed' : 'ok'}: [${host}]${itemTxt}`);
    }
    const final = items.length === 1 && items[0] === undefined ? results[0] : { results, changed: anyChanged, failed: anyFailed };
    if (task.register) scope[task.register] = final;
    if (task.register && final) {
      final.__is_changed = () => !!final.changed;
      final.__is_failed = () => !!final.failed;
      final.__is_succeeded = final.__is_success = () => !final.failed;
      final.__is_skipped = () => !!final.skipped;
    }
    return { lines, changed: anyChanged, failed: anyFailed && !truthy(task.ignore_errors), failedRaw: anyFailed, skipped: skippedAll, notify: anyChanged ? [].concat(task.notify || []) : [], unreachable: false, mod };
  }

  /* ---------- vault (a teaching cipher, NOT real encryption) ---------- */
  const VAULT_HDR = '$ANSIBLE_VAULT;1.1;AES256';
  const pwHash = (pw) => { let h = 5381; for (let i = 0; i < pw.length; i++) h = ((h * 33) ^ pw.charCodeAt(i)) >>> 0; return h; };
  const vaultEnc = (text, pw) => {
    const tag = pwHash(pw).toString(16).padStart(8, '0');
    const bytes = Array.from(unescape(encodeURIComponent(tag + ':' + text)), (ch) => ch.charCodeAt(0));
    let seed = pwHash(pw + 'salt') || 1;
    const hex = bytes.map((b) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return ((b ^ (seed >>> 16)) & 255).toString(16).padStart(2, '0'); }).join('');
    return VAULT_HDR + '\n' + (hex.match(/.{1,80}/g) || []).join('\n') + '\n';
  };
  const isVault = (text) => typeof text === 'string' && text.startsWith('$ANSIBLE_VAULT;');
  const vaultDec = (text, pw) => {
    const hex = text.split('\n').slice(1).join('').trim();
    let seed = pwHash(pw + 'salt') || 1;
    const bytes = (hex.match(/../g) || []).map((h) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (parseInt(h, 16) ^ (seed >>> 16)) & 255; });
    let out;
    try { out = decodeURIComponent(escape(String.fromCharCode(...bytes))); } catch (e) { return null; }
    const tag = pwHash(pw).toString(16).padStart(8, '0');
    return out.startsWith(tag + ':') ? out.slice(9) : null;
  };
  /** the vault password from --vault-password-file / --ask-vault-pass; asks lazily */
  async function vaultPassword(c, o, prompt) {
    const sh = c.sh;
    if (o.vaultPw !== undefined) return o.vaultPw;
    if (o.vaultFile) {
      const n = sh.fs.lookup(c.abs(o.vaultFile));
      if (!n) { c.err(`[ERROR]: The vault password file ${o.vaultFile} was not found\n`); return null; }
      o.vaultPw = sh.readFile(c.abs(o.vaultFile)).split('\n')[0];
      return o.vaultPw;
    }
    if (o.askVault && sh.hooks.readLine) { o.vaultPw = await sh.hooks.readLine(prompt || 'Vault password: ', { secret: true }); return o.vaultPw; }
    return null;
  }
  async function readVarsFile(c, path, o) {
    const sh = c.sh;
    const abs = c.abs(path);
    if (!sh.fs.lookup(abs)) throw new Error(`Could not find or access '${path}'`);
    let text = sh.readFile(abs);
    if (isVault(text)) {
      const pw = await vaultPassword(c, o);
      if (pw === null || pw === undefined) throw new Error('Attempting to decrypt but no vault secrets found');
      const d = vaultDec(text, pw);
      if (d === null) throw new Error('Decryption failed (no vault secrets were found that could decrypt)');
      text = d;
    }
    return LX.yaml.parse(text) || {};
  }
  const parseVaultOpts = (args) => {
    const o = {};
    const rest = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--vault-password-file' || a === '--vault-pass-file') o.vaultFile = args[++i];
      else if (a.startsWith('--vault-password-file=')) o.vaultFile = a.split('=')[1];
      else if (a === '--ask-vault-pass' || a === '--ask-vault-password' || a === '-J') o.askVault = true;
      else if (a === '--vault-id') { const v = args[++i] || ''; if (/@prompt$/.test(v)) o.askVault = true; else if (v.includes('@')) o.vaultFile = v.split('@')[1]; else o.vaultFile = v; }
      else if (a === '--name') o.name = args[++i];
      else rest.push(a);
    }
    return { o, rest };
  };

  async function runPlaybook(c, file, opts) {
    const sh = c.sh;
    const abs = c.abs(file);
    const n = sh.fs.lookup(abs);
    if (!n) { c.err(`[ERROR]: the playbook: ${file} could not be found\n`); return 1; }
    let plays;
    try { plays = LX.yaml.parse(sh.readFile(abs)); } catch (e) {
      c.err(`[ERROR]: We were unable to read either as JSON nor YAML, these are the errors we got from each:\nJSON: Expecting value: line 1 column 1 (char 0)\n\nSyntax Error while loading YAML.\n  ${e.message}\n\nThe error appears to be in '${abs}': line ${e.line || 1}, column 1, but may\nbe elsewhere in the file depending on the exact syntax problem.\n`);
      return 4;
    }
    if (!Array.isArray(plays)) { c.err('[ERROR]: A playbook must be a list of plays, got a dict instead\n'); return 4; }
    const base = VFS.dirname(abs);
    for (const ef of opts.extraFiles || []) {
      try { Object.assign(opts.extra, await readVarsFile(c, ef, opts)); } catch (e) { c.err(`[ERROR]: ${e.message}\n`); return 1; }
    }
    const li = loadInventory(c, opts.inventory);
    let inv = li.inv;
    if (!inv) { if (li.err) c.err(li.err + '[WARNING]: No inventory was parsed, only implicit localhost is available\n'); inv = parseInventory('', false); }
    if (opts.syntax) { c.out(`\nplaybook: ${file}\n`); return 0; }
    const recap = {};
    const dead = new Set();
    let status = 0;
    for (const play of plays) {
      if (!play.hosts) { c.err(`[ERROR]: 'hosts' is required but was not set\n`); return 4; }
      const patt = render(String(play.hosts), {});
      let hosts = matchHosts(inv, patt);
      if (opts.limit) hosts = hosts.filter((h) => matchHosts(inv, opts.limit).includes(h));
      if (!hosts.length) {
        if (patt === 'localhost') hosts = ['localhost'];
        else { c.err(`[WARNING]: Could not match supplied host pattern, ignoring: ${patt}\n`); c.out(`\n${stars(`PLAY [${play.name || patt}]`)}\nskipping: no hosts matched\n`); continue; }
      }
      if (opts.listHosts) { c.out(`\nplaybook: ${file}\n\n  play #1 (${patt}): ${play.name || patt}\tTAGS: []\n    pattern: ['${patt}']\n    hosts (${hosts.length}):\n${hosts.map((h) => '      ' + h).join('\n')}\n`); continue; }
      if (opts.listTasks) { c.out(`\nplaybook: ${file}\n\n  play #1 (${patt}): ${play.name || patt}\tTAGS: []\n    tasks:\n${(play.tasks || []).map((t) => `      ${t.name || Object.keys(t)[0]}\tTAGS: [${[].concat(t.tags || []).join(', ')}]`).join('\n')}\n`); continue; }
      c.out(`\n${stars(`PLAY [${play.name || patt}]`)}\n`);
      const tinfos = {};
      const scopes = {};
      const pvars = Object.assign({}, play.vars || {});
      for (const vf of [].concat(play.vars_files || [])) {
        try { Object.assign(pvars, await readVarsFile(c, VFS.norm(render(String(vf), pvars), base), opts)); } catch (e) { c.err(`[ERROR]: ${e.message}\n`); return 1; }
      }
      // roles: <playbook dir>/roles/NAME/{tasks,handlers,defaults,vars,templates,files}
      const roleTasks = [];
      const roleHandlers = [];
      for (const rr of play.roles || []) {
        const rname = typeof rr === 'string' ? rr : rr.role || rr.name;
        const rdir = VFS.norm('roles/' + rname, base);
        if (!sh.fs.lookup(rdir)) { c.err(`[ERROR]: the role '${rname}' was not found in ${base}/roles:${base}\n\nThe error appears to be in '${abs}'.\n`); return 1; }
        const ld = (p) => { const n = sh.fs.lookup(rdir + '/' + p); if (!n) return null; try { return LX.yaml.parse(sh.readFile(rdir + '/' + p)); } catch (e) { return null; } };
        Object.assign(pvars, ld('defaults/main.yml') || {}, typeof rr === 'object' ? rr.vars || {} : {}, ld('vars/main.yml') || {});
        for (const t of ld('tasks/main.yml') || []) roleTasks.push(Object.assign({}, t, { __base: rdir, tags: [].concat(t.tags || [], rname, typeof rr === 'object' ? rr.tags || [] : []) }));
        for (const h of ld('handlers/main.yml') || []) roleHandlers.push(Object.assign({}, h, { __base: rdir }));
      }
      Object.assign(pvars, opts.extra || {});
      const gather = play.gather_facts !== false && play.gather_facts !== 'no';
      const pendingHandlers = {};
      const runTaskAll = async (title, task, isHandler) => {
        const nm = task.name || (Object.keys(task).find((k) => !['name', 'when', 'loop', 'with_items', 'register', 'notify', 'tags', 'become', 'become_user', 'ignore_errors', 'changed_when', 'failed_when', 'vars', 'environment', 'args', 'loop_control', 'delegate_to', 'no_log', 'retries', 'delay', 'until', 'check_mode', 'diff', 'listen', '__base'].includes(k)) || title);
        c.out(`\n${stars(`${isHandler ? 'RUNNING HANDLER' : 'TASK'} [${nm}]`)}\n`);
        for (const h of hosts) {
          if (dead.has(h)) continue;
          recap[h] = recap[h] || { ok: 0, changed: 0, unreachable: 0, failed: 0, skipped: 0, rescued: 0, ignored: 0 };
          const ti = tinfos[h];
          if (!ti.ok) { c.out(`fatal: [${h}]: UNREACHABLE! => ${JSON.stringify({ changed: false, msg: ti.msg, unreachable: true })}\n`); recap[h].unreachable++; dead.add(h); status = 4; continue; }
          const scope = scopes[h];
          const ctx = { sh, base: task.__base || base, become: play.become, facts: scope, factsOf: () => factsOf(sh, h, ti.T) };
          if (task.vars) Object.assign(scope, render(task.vars, scope));
          const r = await execTask(c, h, ti, task, scope, ctx, opts.check);
          r.lines.forEach((l) => c.out(l + '\n'));
          if (r.skipped) recap[h].skipped++;
          else if (r.failed) { recap[h].failed++; status = 2; dead.add(h); }
          else { recap[h].ok++; if (r.changed) recap[h].changed++; if (r.failedRaw) recap[h].ignored++; }
          r.notify.forEach((nname) => { (pendingHandlers[nname] = pendingHandlers[nname] || new Set()).add(h); });
        }
      };
      for (const h of hosts) {
        const hv = Object.assign({}, hostVars(inv, h), opts.userOverride ? { ansible_user: opts.userOverride } : {});
        tinfos[h] = target(c, h, hv, play.become, opts.userOverride);
        scopes[h] = Object.assign({ inventory_hostname: h, groups: Object.fromEntries(Object.keys(inv.groups).map((g) => [g, inv.members(g)])) }, hv, pvars);
        for (const [k, v] of Object.entries(scopes[h])) if (typeof v === 'string') { try { scopes[h][k] = coerce(v); } catch (e) { /* ignore */ } }
      }
      if (gather) {
        c.out(`\n${stars('TASK [Gathering Facts]')}\n`);
        for (const h of hosts) {
          recap[h] = recap[h] || { ok: 0, changed: 0, unreachable: 0, failed: 0, skipped: 0, rescued: 0, ignored: 0 };
          const ti = tinfos[h];
          if (!ti.ok) { c.out(`fatal: [${h}]: UNREACHABLE! => ${JSON.stringify({ changed: false, msg: ti.msg, unreachable: true })}\n`); recap[h].unreachable++; dead.add(h); status = 4; continue; }
          Object.assign(scopes[h], factsOf(sh, h, ti.T), { ansible_facts: factsOf(sh, h, ti.T) });
          recap[h].ok++;
          c.out(`ok: [${h}]\n`);
        }
      }
      const tags = opts.tags;
      const wanted = (t) => !(tags && !(tags.some((x) => [].concat(t.tags || []).includes(x)))) && !(opts.skipTags && opts.skipTags.some((x) => [].concat(t.tags || []).includes(x)));
      const runList = async (list, tbase) => {
        for (const t of list) {
          if (t.include_tasks || t.import_tasks) {
            const fn = render(String(t.include_tasks || t.import_tasks), pvars);
            const fa = VFS.norm(fn, tbase || base);
            let sub;
            try { sub = LX.yaml.parse(sh.readFile(fa)) || []; } catch (e) { c.err(`[ERROR]: Could not find or access '${fn}'\n`); status = 2; return; }
            await runList(sub.map((x) => Object.assign({ __base: t.__base }, x)), tbase);
            continue;
          }
          if (t.block) {
            if (!wanted(t) && !(t.block || []).some(wanted)) continue;
            const before = new Set(dead);
            const stBefore = status;
            await runList(t.block.map((x) => Object.assign({ __base: t.__base }, x)), tbase);
            const failedNow = [...dead].filter((h) => !before.has(h));
            if (failedNow.length && t.rescue) {
              for (const h of failedNow) { dead.delete(h); recap[h].failed--; recap[h].rescued++; }
              status = stBefore;
              const keep = hosts;
              hosts = hosts.filter((x) => failedNow.includes(x));
              await runList(t.rescue.map((x) => Object.assign({ __base: t.__base }, x)), tbase);
              hosts = keep;
            }
            if (t.always) await runList(t.always.map((x) => Object.assign({ __base: t.__base }, x)), tbase);
            continue;
          }
          if (!wanted(t)) continue;
          await runTaskAll('task', t, false);
        }
      };
      await runList([].concat(play.pre_tasks || [], roleTasks, play.tasks || [], play.post_tasks || []), base);
      const handlers = (play.handlers || []).concat(roleHandlers);
      for (const hd of handlers) {
        const names = [hd.name].concat(hd.listen || []);
        const notified = names.map((x) => pendingHandlers[x]).filter(Boolean);
        if (!notified.length) continue;
        const who = new Set(notified.flatMap((s) => [...s]));
        const saveHosts = hosts.slice();
        hosts = hosts.filter((x) => who.has(x));
        await runTaskAll(hd.name, hd, true);
        hosts = saveHosts;
      }
    }
    if (opts.listHosts || opts.listTasks) return 0;
    c.out(`\n${stars('PLAY RECAP')}\n`);
    for (const [h, r] of Object.entries(recap)) c.out(`${h.padEnd(27)}: ok=${String(r.ok).padEnd(4)} changed=${String(r.changed).padEnd(4)} unreachable=${String(r.unreachable).padEnd(4)} failed=${String(r.failed).padEnd(4)} skipped=${String(r.skipped).padEnd(4)} rescued=${r.rescued}    ignored=${r.ignored}   \n`);
    c.out('\n');
    return status;
  }

  /* ---------- commands ---------- */
  def('ansible-playbook', async (c, args) => {
    const o = { extra: {} };
    const files = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-i' || a === '--inventory') o.inventory = args[++i];
      else if (a === '-e' || a === '--extra-vars') { const kv = args[++i]; if (kv.startsWith('@')) { (o.extraFiles = o.extraFiles || []).push(kv.slice(1)); } else if (kv.startsWith('{')) { try { Object.assign(o.extra, JSON.parse(kv)); } catch (e) { /* ignore */ } } else Object.assign(o.extra, Object.fromEntries(Object.entries(parseKv(kv)).map(([k, v]) => [k, coerce(v)]))); }
      else if (a === '--vault-password-file' || a === '--vault-pass-file') o.vaultFile = args[++i];
      else if (a === '--ask-vault-pass' || a === '--ask-vault-password' || a === '-J') o.askVault = true;
      else if (a === '--vault-id') { const v = args[++i] || ''; if (/@prompt$/.test(v)) o.askVault = true; else o.vaultFile = v.split('@').pop(); }
      else if (a === '-l' || a === '--limit') o.limit = args[++i];
      else if (a === '-u' || a === '--user') o.userOverride = args[++i];
      else if (a === '-C' || a === '--check') o.check = true;
      else if (a === '--syntax-check') o.syntax = true;
      else if (a === '--list-hosts') o.listHosts = true;
      else if (a === '--list-tasks') o.listTasks = true;
      else if (a === '-t' || a === '--tags') o.tags = args[++i].split(',');
      else if (a === '--skip-tags') o.skipTags = args[++i].split(',');
      else if (a === '--version') return c.out('ansible-playbook [core 2.17.4]\n'), 0;
      else if (/^-[vD]+$/.test(a) || a === '-K' || a === '--ask-become-pass' || a === '-b' || a === '--become') continue;
      else if (!a.startsWith('-')) files.push(a);
    }
    if (!files.length) { c.err('usage: ansible-playbook [-h] [--version] [-v] [-k] [--private-key PRIVATE_KEY_FILE] [-u REMOTE_USER] [-c CONNECTION] [-T TIMEOUT] [-i INVENTORY] [-l SUBSET] [-e EXTRA_VARS] [--syntax-check] [-C] playbook [playbook ...]\nansible-playbook: error: the following arguments are required: playbook\n'); return 2; }
    let st = 0;
    for (const f of files) st = (await runPlaybook(c, f, o)) || st;
    return st;
  }, { pkg: 'ansible' });

  def('ansible', async (c, args) => {
    const sh = c.sh;
    const o = {};
    const pos = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-i' || a === '--inventory') o.inventory = args[++i];
      else if (a === '-m' || a === '--module-name') o.module = args[++i];
      else if (a === '-a' || a === '--args') o.args = args[++i];
      else if (a === '-u' || a === '--user') o.user = args[++i];
      else if (a === '-e' || a === '--extra-vars') args[++i];
      else if (a === '-b' || a === '--become') o.become = true;
      else if (a === '-C' || a === '--check') o.check = true;
      else if (a === '--list-hosts') o.listHosts = true;
      else if (a === '-o' || a === '--one-line') o.oneline = true;
      else if (a === '-f' || a === '--forks' || a === '-T' || a === '--timeout' || a === '-l' || a === '--limit') { if (a === '-l' || a === '--limit') o.limit = args[++i]; else i++; }
      else if (a === '--version') return c.out('ansible [core 2.17.4]\n  config file = /etc/ansible/ansible.cfg\n  configured module search path = [\'/home/learner/.ansible/plugins/modules\', \'/usr/share/ansible/plugins/modules\']\n  ansible python module location = /usr/lib/python3/dist-packages/ansible\n  ansible collection location = /home/learner/.ansible/collections:/usr/share/ansible/collections\n  executable location = /usr/bin/ansible\n  python version = 3.12.3 (main, Jun 18 2025, 17:59:45) [GCC 13.3.0] (/usr/bin/python3)\n  jinja version = 3.1.2\n  libyaml = True\n'), 0;
      else if (/^-[vK]+$/.test(a) || a === '-k' || a === '--ask-pass' || a === '-K') continue;
      else if (!a.startsWith('-')) pos.push(a);
    }
    if (!pos.length) { c.err('usage: ansible [-h] [--version] [-v] [-b] [-m MODULE_NAME] [-a MODULE_ARGS] [-i INVENTORY] [-u REMOTE_USER] pattern\nansible: error: the following arguments are required: host-pattern\n'); return 2; }
    const li = loadInventory(c, o.inventory);
    let inv = li.inv;
    if (!inv) { c.err((li.err || '') + '[WARNING]: No inventory was parsed, only implicit localhost is available\n'); inv = parseInventory('', false); }
    let hosts = matchHosts(inv, pos[0]);
    if (o.limit) hosts = hosts.filter((h) => matchHosts(inv, o.limit).includes(h));
    const out = o.oneline ? (t) => c.out(t.trim().replace(/\s*\n\s*/g, ' ') + '\n') : (t) => c.out(t);
    if (o.listHosts) { c.out(`  hosts (${hosts.length}):\n${hosts.map((h) => '    ' + h).join('\n')}\n`); return 0; }
    if (!hosts.length) { c.err(`[WARNING]: Could not match supplied host pattern, ignoring: ${pos[0]}\n`); c.err('ERROR! Specified inventory, host pattern and/or --limit leaves us without hosts to target.\n'); return 1; }
    const mod = strip(o.module || 'command');
    let margs;
    if (mod === 'command' || mod === 'shell' || mod === 'raw') margs = { cmd: o.args || '' };
    else margs = Object.fromEntries(Object.entries(o.args ? parseKv(o.args) : {}).map(([k, v]) => [k, coerce(v)]));
    if (!o.module && !o.args) { c.err("ERROR! No argument passed to command module\n"); return 1; }
    let status = 0;
    for (const h of hosts) {
      const hv = Object.assign({}, hostVars(inv, h), o.user ? { ansible_user: o.user } : {});
      const ti = target(c, h, hv, o.become, o.user);
      if (!ti.ok) { out(`${h} | UNREACHABLE! => ${jstr({ changed: false, msg: ti.msg, unreachable: true })}\n`); status = 4; continue; }
      const fn = MODULES[mod];
      if (!fn) { out(`${h} | FAILED! => ${jstr({ changed: false, msg: `no module named '${mod}'` })}\n`); status = 2; continue; }
      if (mod === 'debug' && margs.var !== undefined) margs.__value = hv[margs.var] !== undefined ? hv[margs.var] : 'VARIABLE IS NOT DEFINED!';
      const ctx = { sh, base: sh.cwd, become: o.become, facts: {}, scope: Object.assign({}, hv), T: ti.T, factsOf: () => factsOf(sh, h, ti.T) };
      let res = await sudoRun(ti.T, o.become, async () => {
        let r = await fn(margs, ctx);
        if (r && r.apply && !o.check) { try { await r.apply(r); } catch (e) { if (e instanceof FsErr) r = { failed: true, msg: U.errTxt(e) }; else if (e instanceof Error && !(e instanceof LX.AbortSig)) r = { failed: true, msg: e.message }; else throw e; } }
        if (r) delete r.apply;
        return r;
      });
      if (res.failed) {
        const cp = Object.assign({}, res);
        delete cp.failed;
        if ((mod === 'command' || mod === 'shell') && cp.rc !== undefined) out(`${h} | FAILED | rc=${cp.rc} >>\n${cp.stdout || ''}${cp.stderr ? (cp.stdout ? '\n' : '') + cp.stderr : ''}\nnon-zero return code\n`);
        else out(`${h} | FAILED! => ${jstr(Object.assign({ changed: false }, cp))}\n`);
        status = 2;
      } else if ((mod === 'command' || mod === 'shell' || mod === 'raw') && res.rc !== undefined) out(`${h} | ${res.changed ? 'CHANGED' : 'SUCCESS'} | rc=${res.rc} >>\n${res.stdout}\n`);
      else if (mod === 'setup') out(`${h} | SUCCESS => ${jstr({ ansible_facts: Object.assign({ discovered_interpreter_python: '/usr/bin/python3' }, res.ansible_facts), changed: false })}\n`);
      else {
        const body = Object.assign({}, res);
        delete body.item;
        delete body.__run;
        out(`${h} | ${res.changed ? 'CHANGED' : 'SUCCESS'} => ${jstr(Object.assign({ ansible_facts: { discovered_interpreter_python: '/usr/bin/python3' } }, mod === 'ping' ? {} : {}, { changed: !!res.changed }, Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'changed'))))}\n`);
      }
    }
    return status;
  }, { pkg: 'ansible' });

  def('ansible-inventory', async (c, args) => {
    const i = args.indexOf('-i');
    const li = loadInventory(c, i >= 0 ? args[i + 1] : null);
    if (!li.inv) { c.err((li.err || '') + '[WARNING]: No inventory was parsed, only implicit localhost is available\n'); return 0; }
    const inv = li.inv;
    if (args.includes('--graph')) {
      const draw = (g, pre) => {
        c.out(`${pre}|--@${g}:\n`);
        inv.groups[g].children.forEach((ch) => draw(ch, pre + '|  '));
        inv.groups[g].hosts.forEach((h) => c.out(`${pre}|  |--${h}\n`));
      };
      c.out('@all:\n');
      const top = inv.groups.all.children.slice();
      if (inv.groups.ungrouped.hosts.length && !top.includes('ungrouped')) top.push('ungrouped');
      top.forEach((g) => draw(g, '  '));
      return 0;
    }
    if (args.includes('--list') || args.includes('--host')) {
      const out = { _meta: { hostvars: Object.fromEntries(Object.keys(inv.hosts).map((h) => [h, inv.hosts[h]])) }, all: { children: ['ungrouped'].concat(inv.groups.all.children.filter((g) => g !== 'ungrouped')) } };
      for (const [g, v] of Object.entries(inv.groups)) if (g !== 'all') out[g] = Object.assign({}, v.hosts.length ? { hosts: v.hosts } : {}, v.children.length ? { children: v.children } : {});
      c.out(jstr(out) + '\n');
      return 0;
    }
    c.err('usage: ansible-inventory [options] [host|group]\n');
    return 1;
  }, { pkg: 'ansible' });
  def('ansible-galaxy', async (c, args) => {
    const sh = c.sh;
    const sub = args[0];
    if (sub === 'init' || (sub === 'role' && args[1] === 'init')) {
      const name = args.slice(sub === 'role' ? 2 : 1).find((a) => !a.startsWith('-'));
      if (!name) { c.err('usage: ansible-galaxy role init [-h] [--init-path INIT_PATH] [--offline] role_name\n'); return 2; }
      const root = c.abs(name);
      if (sh.fs.lookup(root)) { c.err(`[ERROR]: - the directory ${name} already exists. You can use --force to re-initialize this directory,\nhowever it will reset any main.yml files that may have\nbeen modified there already.\n`); return 1; }
      for (const d of ['tasks', 'handlers', 'defaults', 'vars', 'templates', 'files', 'meta', 'tests']) sh.fs.mkdirp ? sh.fs.mkdirp(root + '/' + d) : sh.mkdirp(root + '/' + d);
      for (const [f, ct] of [['tasks/main.yml', '---\n# tasks file for ' + name + '\n'], ['handlers/main.yml', '---\n# handlers file for ' + name + '\n'], ['defaults/main.yml', '---\n# defaults file for ' + name + '\n'], ['vars/main.yml', '---\n# vars file for ' + name + '\n'], ['meta/main.yml', 'galaxy_info:\n  author: your name\n  description: your role description\n  license: MIT\n  min_ansible_version: "2.1"\ndependencies: []\n'], ['README.md', 'Role Name\n=========\n\nA brief description of the role goes here.\n']]) sh.writeFile(root + '/' + f, ct, false);
      c.out(`- Role ${name} was created successfully\n`);
      return 0;
    }
    c.err('[WARNING]: sandbox has no real internet, so ansible-galaxy cannot download roles or collections here.\n');
    return 1;
  }, { pkg: 'ansible' });
  def('ansible-doc', async (c, args) => { const m = strip(args.find((a) => !a.startsWith('-')) || ''); if (!MODULES[m]) { c.err(`[WARNING]: module ${m} not found in:\n`); return 1; } c.out(`> ANSIBLE.BUILTIN.${m.toUpperCase()}    (/usr/lib/python3/dist-packages/ansible/modules/${m}.py)\n\n  (documentation for the "${m}" module; the real command shows every option.)\n`); return 0; }, { pkg: 'ansible' });
  def('ansible-vault', async (c, args) => {
    const sh = c.sh;
    const sub = args[0];
    const { o, rest } = parseVaultOpts(args.slice(1));
    const files = rest.filter((a) => !a.startsWith('-'));
    if (!sub || sub === '--help' || sub === '-h') { c.out('usage: ansible-vault [-h] [--version] [-v] {create,decrypt,edit,view,encrypt,encrypt_string,rekey} ...\n\nencryption/decryption utility for Ansible data files\n'); return 0; }
    const newPw = async () => {
      if (o.vaultFile) return vaultPassword(c, o);
      if (!sh.hooks.readLine) {
        const line = c.io.stdin ? c.io.stdin.split('\n')[0] : null;
        if (line === null) { c.err('ERROR! Vault password prompt failed: no input available (use --vault-password-file)\n'); return null; }
        return line;
      }
      const a = await sh.hooks.readLine('New Vault password: ', { secret: true });
      const b = await sh.hooks.readLine('Confirm New Vault password: ', { secret: true });
      if (a !== b) { c.err('ERROR! Passwords do not match\n'); return null; }
      if (!a) { c.err('ERROR! Vault password cannot be empty\n'); return null; }
      return a;
    };
    const curPw = async () => {
      if (o.vaultFile) return vaultPassword(c, o);
      if (!sh.hooks.readLine) {
        const line = c.io.stdin ? c.io.stdin.split('\n')[0] : null;
        return line;
      }
      return await sh.hooks.readLine('Vault password: ', { secret: true });
    };
    const need = () => { if (!files.length) { c.err('ERROR! The following arguments are required: args\n'); return false; } return true; };
    if (sub === 'encrypt_string') {
      const text = files[0];
      if (text === undefined) { c.err('ERROR! Reading plaintext input from stdin is not supported in the sandbox: pass the string as an argument\n'); return 1; }
      const pw = await newPw();
      if (pw === null) return 1;
      const body = vaultEnc(text, pw).trimEnd().split('\n').map((l) => '          ' + l).join('\n');
      c.out(`${o.name ? o.name + ': ' : ''}!vault |\n${body}\n`);
      c.err('Encryption successful\n');
      return 0;
    }
    if (!need()) return 2;
    const f = files[0];
    const abs = c.abs(f);
    if (sub === 'create') {
      if (sh.fs.lookup(abs)) { c.err(`ERROR! The file ${f} already exists. Use "edit" to modify existing files.\n`); return 1; }
      const pw = await newPw();
      if (pw === null) return 1;
      let text = '';
      if (sh.hooks.edit) { const r = await sh.hooks.edit({ name: 'vi', path: f, content: '', readonly: false }); if (r === null || r === undefined) { c.err('ERROR! Editor aborted\n'); return 1; } text = r; }
      else text = c.io.stdin || '';
      sh.writeFile(abs, vaultEnc(text, pw), false);
      c.err('Encryption successful\n');
      return 0;
    }
    const n = sh.fs.lookup(abs);
    if (!n) { c.err(`ERROR! the file ${f} does not exist\n`); return 1; }
    const text = sh.readFile(abs);
    if (sub === 'encrypt') {
      if (isVault(text)) { c.err('ERROR! input is already encrypted\n'); return 1; }
      const pw = await newPw();
      if (pw === null) return 1;
      sh.writeFile(abs, vaultEnc(text, pw), false);
      c.err('Encryption successful\n');
      return 0;
    }
    if (!isVault(text)) { c.err(`ERROR! input is not vault encrypted data for ${f}\n`); return 1; }
    const pw = await curPw();
    const plain = pw === null || pw === undefined ? null : vaultDec(text, pw);
    if (plain === null) { c.err('ERROR! Decryption failed (no vault secrets were found that could decrypt)\n'); return 1; }
    if (sub === 'view') { c.out(plain); return 0; }
    if (sub === 'decrypt') { sh.writeFile(abs, plain, false); c.err('Decryption successful\n'); return 0; }
    if (sub === 'edit') {
      if (!sh.hooks.edit) { c.err('ERROR! The editor only opens in the browser terminal; use decrypt, edit, encrypt instead\n'); return 1; }
      const r = await sh.hooks.edit({ name: 'vi', path: f, content: plain, readonly: false });
      if (r !== null && r !== undefined) sh.writeFile(abs, vaultEnc(r, pw), false);
      return 0;
    }
    if (sub === 'rekey') {
      const np = await newPw();
      if (np === null) return 1;
      sh.writeFile(abs, vaultEnc(plain, np), false);
      c.err('Rekey successful\n');
      return 0;
    }
    c.err(`ERROR! argument action: invalid choice: '${sub}'\n`);
    return 2;
  }, { pkg: 'ansible' });

  def('sshpass', async (c, args) => {
    const sh = c.sh;
    let pass = null;
    let i = 0;
    for (; i < args.length; i++) {
      if (args[i] === '-p') pass = args[++i];
      else if (args[i].startsWith('-p') && args[i].length > 2) pass = args[i].slice(2);
      else if (args[i] === '-e') pass = sh.getVar('SSHPASS');
      else if (args[i] === '-f') pass = (sh.fs.lookup(c.abs(args[++i])) ? sh.readFile(c.abs(args[i])) : '').split('\n')[0];
      else break;
    }
    if (pass === null || i >= args.length) { c.err('Usage: sshpass [-f|-d|-p|-e] command parameters\n   -p password   Provide password as argument (security unwise)\n'); return 1; }
    const prev = sh.hooks.readLine;
    sh.hooks.readLine = async (p) => (/password/i.test(p) ? pass : /yes\/no/.test(p) ? 'yes' : '');
    try {
      return await sh.run(args.slice(i).map(q).join(' '), { stdin: c.io.stdin, stdout: (t) => c.out(t), stderr: (t) => c.err(t), tty: false });
    } finally {
      sh.hooks.readLine = prev;
    }
  }, { pkg: 'sshpass' });

  Object.assign(LX.PKGS, {
    sshpass: { ver: '1.09-1', desc: 'Non-interactive ssh password auth', size: 25, bins: ['sshpass'] },
    ansible: { ver: '9.2.0+dfsg-0ubuntu5', desc: 'Configuration management, deployment, and task execution system', size: 20000, bins: ['ansible', 'ansible-playbook', 'ansible-inventory', 'ansible-galaxy', 'ansible-doc', 'ansible-vault'] },
  });
  LX.initHooks.push((sh) => {
    const prior = sh.onInstall;
    sh.onInstall = (p, meta) => {
      if (p === 'ansible') {
        sh.fs.mkdirp('/etc/ansible', { owner: 'root', group: 'root' });
        sh.writeFile('/etc/ansible/hosts', '# This is the default ansible \'hosts\' file.\n#\n# It should live in /etc/ansible/hosts\n#\n#   - Comments begin with the \'#\' character\n#   - Blank lines are ignored\n#   - Groups of hosts are delimited by [header] elements\n#   - You can enter hostnames or ip addresses\n#   - A hostname/ip can be a member of multiple groups\n\n# Ex 1: Ungrouped hosts, specify before any group headers:\n\n## green.example.com\n## blue.example.com\n## 192.168.100.1\n## 192.168.100.10\n\n# Ex 2: A collection of hosts belonging to the \'webservers\' group:\n\n## [webservers]\n## alpha.example.org\n## beta.example.org\n', false);
        sh.writeFile('/etc/ansible/ansible.cfg', '[defaults]\n#inventory      = /etc/ansible/hosts\n', false);
      }
      if (prior) prior.call(sh, p, meta);
    };
  });
})();
