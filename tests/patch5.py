def patch(p, pairs):
    s=open(p).read()
    for a,b in pairs:
        assert a in s, (p, a[:70])
        s=s.replace(a,b,1)
    open(p,'w').write(s)
patch('js/ext-sys1.js',[
("""      if (a.startsWith('-') && a.length > 1 && !/^-\\d/.test(a)) {
        const k = a.replace(/^-+/, '');
        if (withVal.includes(a) || withVal.includes(k)) o[k] = args[++i];
        else {
          for (const ch of k.length > 1 && !a.startsWith('--') ? k : [k]) o[ch] = true;
        }
      } else rest.push(a);""","""      if (a.startsWith('-') && a.length > 1 && !/^-\\d/.test(a)) {
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
      } else rest.push(a);"""),
("const hash = u.hasPass === false ? '*' : (u.locked ? '!' : '') + '$y$j9T$' + btoa(n + 'salt').replace(/=/g, '') + '$Kq3yXQ';","const hash = (u.locked ? '!' : '') + (u.hasPass === false ? '*' : '$y$j9T$' + btoa(n + 'salt').replace(/=/g, '') + '$Kq3yXQ');"),
("""  P.nextUid = function () {
    let u = 1001;
    const used = new Set(Object.values(this.users).map((x) => x.uid));
    while (used.has(u)) u++;
    return u;
  };""","""  P.nextUid = function () {
    let u = 1001;
    const used = new Set([...Object.values(this.users).map((x) => x.uid), ...Object.values(this.users).map((x) => x.gid), ...Object.values(this.extraGroups)]);
    while (used.has(u)) u++;
    return u;
  };"""),
("c.sh.extraGroups[name] = o.g ? +o.g : c.sh.groupsGidSeed++;","c.sh.extraGroups[name] = o.g ? +o.g : c.sh.nextUid();"),
("""      if (f) {
        const real = c.sh.fs.lookup(c.abs(p)) ? realPath(c.sh, c.abs(p)) : null;
        if (real) c.out(real + '\\n');
        else st = 1;""","""      if (f) {
        c.out(realPath(c.sh, c.abs(p)) + '\\n');"""),
("LX.sudoList = function (c) {\n    const sh = c.sh;\n    const rules = LX.sudoRulesFor(sh, sh.user);","LX.sudoList = function (c, who) {\n    const sh = c.sh;\n    who = who || sh.user;\n    const rules = LX.sudoRulesFor(sh, who);"),
("if (!rules.length) c.out(`User ${sh.user} is not allowed to run sudo on linux-school.\\n`);","if (!rules.length) c.out(`User ${who} is not allowed to run sudo on linux-school.\\n`);"),
("c.out(`User ${sh.user} may run the following commands on linux-school:\\n`);","c.out(`User ${who} may run the following commands on linux-school:\\n`);"),
])
patch('js/cmds-sys.js',[
("const g = U.getopts('sudo', c, args, 'isEkvlH', 'u', { user: 'u' }, false, true);","const g = U.getopts('sudo', c, args, 'isEkvlH', 'uU', { user: 'u' }, false, true);"),
("      LX.sudoList(c);\n      return 0;","      LX.sudoList(c, o.U);\n      return 0;"),
])
patch('js/sim-core.js',[
("""            else if (!this.fs.lookup(abs)) this.writeFile(abs, '', false);
            else if (this.fs.lookup(abs).t === 'd') throw new FsErr('EISDIR', abs);""","""            else if (!this.fs.lookup(abs)) this.writeFile(abs, '', false);
            else if (this.fs.lookup(abs).t === 'd') throw new FsErr('EISDIR', abs);
            else if (this.fs.lookup(abs).attrs && this.fs.lookup(abs).attrs.includes('i')) throw new FsErr('EPERM', abs);"""),
])
print('ok5')
