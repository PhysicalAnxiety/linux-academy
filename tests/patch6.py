def patch(p, pairs):
    s=open(p).read()
    for a,b in pairs:
        assert a in s, (p, a[:70])
        s=s.replace(a,b,1)
    open(p,'w').write(s)
patch('js/sim-core.js',[
("return `\\x1b[01;32m${u}@linux-school\\x1b[00m:","return `\\x1b[01;32m${u}@${this.hostname || 'linux-school'}\\x1b[00m:"),
("          return 'linux-school';\n        case 'SECONDS':","          return this.hostname || 'linux-school';\n        case 'SECONDS':"),
("this.jobs.push({ id, pid, cmd: src, state: 'Running', proc: longJob.proc, cpu: longJob.cpu || 0, memKiB: longJob.memKiB || 0, nice: 0 });","this.jobs.push({ id, pid, cmd: src, state: 'Running', proc: longJob.proc, cpu: longJob.cpu || 0, memKiB: longJob.memKiB || 0, nice: this.niceNext || 0 });\n        if (LX.onBgStart) LX.onBgStart(this, this.jobs[this.jobs.length - 1], words);"),
])
patch('js/cmds-sys.js',[
("  function procs(sh) {\n","  function procs(sh) {\n    if (sh.procList) return sh.procList();\n"),
("            sh.installed.add(p);\n            LX.PKGS[p].bins.forEach((b) => sh.addBinary(b));","            sh.installed.add(p);\n            LX.PKGS[p].bins.forEach((b) => sh.addBinary(b));\n            if (sh.onInstall) sh.onInstall(p, LX.PKGS[p]);"),
("            if (sh.services[p]) delete sh.services[p];","            if (sh.onRemove) sh.onRemove(p);\n            if (sh.services[p]) delete sh.services[p];"),
("    c.out('linux-school\\n');\n  });\n  def('uname'","    c.out((c.sh.hostname || 'linux-school') + '\\n');\n  });\n  def('uname'"),
("const parts = { s: 'Linux', n: 'linux-school',","const parts = { s: 'Linux', n: c.sh.hostname || 'linux-school',"),
])
s=open('js/cmds-sys.js').read()
# apt remove: bins removal fine. hostname setter
a="""  def('hostname', async (c, args) => {
    if (args.includes('-I') || args.includes('-i')) return c.out('192.168.1.10 \\n');"""
assert a in s
s=s.replace(a,a+"""
    const nm = args.find((x) => !x.startsWith('-'));
    if (nm) {
      if (c.sh.eu() !== 'root') {
        c.err('hostname: you must be root to change the host name\\n');
        return 1;
      }
      c.sh.hostname = nm;
      return 0;
    }""",1)
open('js/cmds-sys.js','w').write(s)
# strftime tz
s=open('js/cmds-text.js').read()
a="""    const g = (k) => (utc ? d['getUTC' + k]() : d['get' + k]());
    let tz = 'UTC';
    if (!utc) {"""
assert a in s
s=s.replace(a,"""    let g = (k) => (utc ? d['getUTC' + k]() : d['get' + k]());
    if (!utc && LX.tz) {
      try {
        const parts = {};
        new Intl.DateTimeFormat('en-US', { timeZone: LX.tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' }).formatToParts(d).forEach((p) => (parts[p.type] = p.value));
        const map = { FullYear: +parts.year, Month: +parts.month - 1, Date: +parts.day, Hours: +parts.hour, Minutes: +parts.minute, Seconds: +parts.second, Day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday) };
        g = (k) => map[k];
      } catch (e) {}
    }
    let tz = 'UTC';
    if (!utc) {""",1)
s=s.replace("tz = new Intl.DateTimeFormat('en', { timeZoneName: 'short' }).formatToParts(d).find((x) => x.type === 'timeZoneName').value;","tz = new Intl.DateTimeFormat('en', Object.assign({ timeZoneName: 'short' }, LX.tz ? { timeZone: LX.tz } : {})).formatToParts(d).find((x) => x.type === 'timeZoneName').value;",1)
s=s.replace("case 'Z': return tz;","case 'Z': return tz;\n        case 'z': return /^[A-Z]{3,4}$/.test(tz) ? (-d.getTimezoneOffset() >= 0 ? '+' : '-') + String(Math.floor(Math.abs(d.getTimezoneOffset()) / 60)).padStart(2, '0') + String(Math.abs(d.getTimezoneOffset()) % 60).padStart(2, '0') : '+0000';",1)
open('js/cmds-text.js','w').write(s)
print('ok6')
