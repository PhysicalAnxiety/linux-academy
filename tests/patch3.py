import re
def patch(p, pairs):
    s=open(p).read()
    for a,b in pairs:
        assert a in s, (p, a[:70])
        s=s.replace(a,b,1)
    open(p,'w').write(s)

patch('js/sim-core.js', [
("      this.writePasswd();\n      this.installBinaries();","      this.extraGroups = {};\n      this.installBinaries();\n      (LX.initHooks || []).forEach((h) => h(this));"),
("""      if (n.t === 'c') return '';
      if (!this.can(n, 4)) throw new FsErr('EACCES', abs);
      if (n.archive) return '[archive data]';
      return n.content || '';""","""      if (n.t === 'c') return n.dev && LX.devRead ? LX.devRead(n.dev) : '';
      if (!this.can(n, 4)) throw new FsErr('EACCES', abs);
      if (n.dyn) {
        const d = LX.procRead(this, abs);
        if (d !== null && d !== undefined) return d;
      }
      if (n.archive) return '[archive data]';
      return n.content || '';"""),
("""      if (n) {
        if (n.t === 'd') throw new FsErr('EISDIR', abs);
        if (n.t === 'c') return;
        if (!this.can(n, 2)) throw new FsErr('EACCES', abs);
        n.content = append ? (n.content || '') + data : data;""","""      if (n) {
        if (n.t === 'd') throw new FsErr('EISDIR', abs);
        if (n.t === 'c') return;
        if (!this.can(n, 2)) throw new FsErr('EACCES', abs);
        if (n.attrs && (n.attrs.includes('i') || (n.attrs.includes('a') && !append))) throw new FsErr('EPERM', abs);
        if (abs.startsWith('/proc/sys/') && LX.procWrite && LX.procWrite(this, abs, data)) return;
        n.content = append ? (n.content || '') + data : data;"""),
("      pd.kids[VFS.base(abs)] = this.newFile({ content: data });","      pd.kids[VFS.base(abs)] = this.newFile(Object.assign({ content: data }, pd.mode & 0o2000 ? { group: pd.group } : {}));"),
("      pd.kids[VFS.base(abs)] = this.fs.mk('d', { owner: this.eu(), group: this.users[this.eu()].groups[0], mode: 0o777 & ~this.umask });","      pd.kids[VFS.base(abs)] = this.fs.mk('d', { owner: this.eu(), group: pd.mode & 0o2000 ? pd.group : this.users[this.eu()].groups[0], mode: (0o777 & ~this.umask) | (pd.mode & 0o2000) });"),
("""      delete pd.kids[VFS.base(abs)];
      pd.mtime = Date.now();
    }
    copyNode""","""      if (n.attrs && (n.attrs.includes('i') || n.attrs.includes('a'))) throw new FsErr('EPERM', abs);
      if (n.nlink > 1) n.nlink--;
      delete pd.kids[VFS.base(abs)];
      pd.mtime = Date.now();
    }
    copyNode"""),
("""      const fix = (x) => {
        x.owner = this.eu();""","""      const fix = (x) => {
        delete x.nlink;
        delete x.ino;
        delete x.attrs;
        x.owner = this.eu();"""),
])

# VFS ACL
patch('js/sim-fs.js', [
("""      let shift = 0;
      if (node.owner === user) shift = 6;
      else if (groups.includes(node.group)) shift = 3;
      return ((node.mode >> shift) & bit) !== 0;""","""      let shift = 0;
      if (node.owner === user) shift = 6;
      else {
        if (node.acl) {
          const mask = node.aclMask !== undefined ? node.aclMask : 7;
          const ue = node.acl.find((e) => e.t === 'u' && e.n === user);
          if (ue) return ((ue.p & mask) & bit) !== 0;
          const ge = node.acl.filter((e) => e.t === 'g' && groups.includes(e.n));
          const owning = groups.includes(node.group);
          if (ge.length || owning) return (owning && (((node.mode >> 3) & mask) & bit) !== 0) || ge.some((e) => ((e.p & mask) & bit) !== 0);
        }
        if (groups.includes(node.group)) shift = 3;
      }
      return ((node.mode >> shift) & bit) !== 0;"""),
])

# cmds-files: permStr '+', ls nlink/-i/-Z, stat, find -inum
s=open('js/cmds-files.js').read()
a="    return t + tri(6, m & 0o4000, 's') + tri(3, m & 0o2000, 's') + tri(0, m & 0o1000, 't');"
assert a in s
s=s.replace(a,"    return t + tri(6, m & 0o4000, 's') + tri(3, m & 0o2000, 's') + tri(0, m & 0o1000, 't') + (n.acl ? '+' : '');",1)
a="const nl = n.t === 'd' ? 2 + Object.values(n.kids).filter((k) => k.t === 'd').length : 1;"
assert a in s
s=s.replace(a,"const nl = n.t === 'd' ? 2 + Object.values(n.kids).filter((k) => k.t === 'd').length : n.nlink || 1;",1)
a="return [U.permStr(n), String(nl), n.owner, n.group, size, U.lsDate(n.mtime), nm];"
assert a in s
s=s.replace(a,"return [U.permStr(n), String(nl), n.owner, n.group, size, U.lsDate(n.mtime), (o.i ? LX.ino(n) + ' ' : '') + (o.Z ? (LX.ctxOf ? LX.ctxOf(sh, n, e.abs || sh.abs(e.name)) : '?') + ' ' : '') + nm];",1)
s=s.replace("const g = U.getopts('ls', c, args, 'lahAtrSR1dFCfin#', '',","const g = U.getopts('ls', c, args, 'lahAtrSR1dFCfinZ#', '',",1)
a="      const items = entries.map(decorate);"
assert a in s
s=s.replace(a,"      const items = entries.map(decorate);\n      if (o.i || o.Z) items.forEach((it, k) => { const pre = (o.i ? LX.ino(entries[k].node) + ' ' : '') + (o.Z ? LX.ctxOf(sh, entries[k].node, entries[k].abs || sh.abs(entries[k].name)) + ' ' : ''); it.plain = pre + it.plain; it.colored = pre + it.colored; });",1)
# stat inode
a="Inode: ${131000 + f.length * 37}       Links: ${n.t === 'd' ? 2 : 1}"
assert a in s
s=s.replace(a,"Inode: ${LX.ino(n)}       Links: ${n.t === 'd' ? 2 : n.nlink || 1}",1)
# find -inum / -links
a="        case '-maxdepth':"
assert a in s
s=s.replace(a,"""        case '-inum': {
          const v = +need(t);
          return (n) => LX.ino(n) === v;
        }
        case '-links': {
          const v = +need(t);
          return (n) => (n.nlink || 1) === v;
        }
        case '-group': {
          const gname = need(t);
          return (n) => n.group === gname;
        }
        case '-maxdepth':""",1)
open('js/cmds-files.js','w').write(s)
print('ok3')
