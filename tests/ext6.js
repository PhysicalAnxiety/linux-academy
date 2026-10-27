const LX = require('./load.js');
async function run(sh, line) {
  let out = '';
  await sh.run(line, { stdout: (s) => (out += s), stderr: (s) => (out += s) });
  return LX.stripAnsi(out);
}
(async () => {
  const sh = new LX.Shell({ fast: true });
  const tests = [
    'sudo apt install -y auditd >/dev/null; sudo auditctl -w /etc/passwd -p wa -k pw; sudo auditctl -l; sudo useradd zed; sudo ausearch -k pw | head -4',
    'mkdir -p proj/sub; echo a > proj/a.txt; echo b > proj/sub/b.txt; rsync -av proj/ backup/; rsync -av proj/ backup/; echo c > proj/c.txt; rsync -av --delete proj/ backup/; rm proj/a.txt; rsync -avn --delete proj/ backup/',
    'echo hi > f.txt; bzip2 f.txt; ls f.txt*; bunzip2 f.txt.bz2; ls f.txt*; xz f.txt; ls f.txt*; xz -d f.txt.xz; cat f.txt; date; date +%z',
    'git init -b main r >/dev/null; cd r; git config user.name A; git config user.email a@b; echo 1 > x; git add x; git commit -qm one; echo 2 >> x; git stash; cat x; git stash pop; cat x; git commit -am two -q; git reset --hard HEAD~1; cat x; git log --oneline; git tag v1; git tag',
  ];
  for (const t of tests) {
    console.log('$ ' + t.split('\n')[0].slice(0, 200));
    try { console.log(await run(sh, t)); } catch (e) { console.log('!! ' + e.stack); }
  }
})();
