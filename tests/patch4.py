def patch(p, pairs):
    s=open(p).read()
    for a,b in pairs:
        assert a in s, (p, a[:70])
        s=s.replace(a,b,1)
    open(p,'w').write(s)
patch('js/cmds-files.js',[
("entries.push({ name: k, node: d.n.kids[k] });","entries.push({ name: k, node: d.n.kids[k], abs: VFS.norm(k, d.abs) });"),
("else files.push({ name: t, node: n });","else files.push({ name: t, node: n, abs });"),
])
patch('js/cmds-sys.js',[
("""    if (!sh.users[sh.user].groups.includes('sudo') && sh.user !== 'root') {
      c.err(`${sh.user} is not in the sudoers file.\\n`);
      return 1;
    }""","""    if (!(LX.sudoOk ? LX.sudoOk(sh, null) : sh.users[sh.user].groups.includes('sudo') || sh.user === 'root')) {
      c.err(`${sh.user} is not in the sudoers file.\\n`);
      if (sh.logEvent) sh.logEvent('sudo', 4, `${sh.user} : user NOT in sudoers ; TTY=pts/0 ; PWD=${sh.cwd} ; USER=root ; COMMAND=${rest.join(' ')}`, { ident: 'sudo', auth: true });
      return 1;
    }"""),
("""    if (o.l) {
      c.out(`Matching Defaults""","""    if (o.l && LX.sudoList) {
      LX.sudoList(c);
      return 0;
    }
    if (o.l) {
      c.out(`Matching Defaults"""),
("""    if (!(await authenticate(c))) {""","""    if (rest.length && LX.sudoOk && !LX.sudoOk(sh, rest)) {
      c.err(`Sorry, user ${sh.user} is not allowed to execute '${rest.join(' ')}' as root on linux-school.\\n`);
      if (sh.logEvent) sh.logEvent('sudo', 4, `${sh.user} : command not allowed ; TTY=pts/0 ; PWD=${sh.cwd} ; USER=root ; COMMAND=${rest.join(' ')}`, { ident: 'sudo', auth: true });
      return 1;
    }
    if (!(await authenticate(c))) {"""),
("""    if (o.v) return 0;
    const target = o.u || 'root';""","""    if (o.v) return 0;
    const target = o.u || 'root';
    if (sh.logEvent && rest.length) sh.logEvent('sudo', 6, `${sh.user} : TTY=pts/0 ; PWD=${sh.cwd} ; USER=${target} ; COMMAND=${rest.join(' ')}`, { ident: 'sudo', auth: true });"""),
("""    if (Date.now() < (sh.sudoUntil || 0)) return true;""","""    if (Date.now() < (sh.sudoUntil || 0)) return true;
    if (LX.sudoNoPass && LX.sudoNoPass(sh)) return true;"""),
])
patch('js/sim-core.js',[
("""      if (only && words[0] === 'sleep' && parseFloat(words[1]) >= 3) {
        this.jobs.push({ id, pid, cmd: src, state: 'Running', proc: 'sleep ' + words[1] });""","""      const longJob = LX.bgLong ? LX.bgLong(words, src) : words[0] === 'sleep' && parseFloat(words[1]) >= 3 ? { proc: 'sleep ' + words[1], cpu: 0, memKiB: 0 } : null;
      if (only && longJob) {
        this.jobs.push({ id, pid, cmd: src, state: 'Running', proc: longJob.proc, cpu: longJob.cpu || 0, memKiB: longJob.memKiB || 0, nice: 0 });"""),
])
# lsattr rewrite
s=open('js/ext-sys1.js').read()
i=s.index("  def('lsattr'")
j=s.index("  /* ---------- SELinux")
new="""  def('lsattr', async (c, args) => {
    const targets = args.filter((a) => !a.startsWith('-'));
    const fmt = (a) => ['s', 'u', 'S', 'D', 'i', 'a', 'A', 'd'].map((ch) => (a.includes(ch) ? ch : '-')).join('') + '-------------'.slice(0, 5);
    for (const f of targets.length ? targets : ['.']) {
      const n = c.sh.fs.lookup(c.abs(f));
      if (!n) {
        c.err(`lsattr: No such file or directory while trying to stat ${f}\\n`);
        continue;
      }
      if (n.t === 'd' && !args.includes('-d')) {
        for (const [name, node] of Object.entries(n.kids).sort()) {
          if (name.startsWith('.') && !args.includes('-a')) continue;
          c.out(`${fmt(node.attrs || '')} ${f === '.' ? './' + name : f.replace(/\\/$/, '') + '/' + name}\\n`);
        }
      } else c.out(`${fmt(n.attrs || '')} ${f}\\n`);
    }
  });

"""
s=s[:i]+new+s[j:]
open('js/ext-sys1.js','w').write(s)
print('ok4')
