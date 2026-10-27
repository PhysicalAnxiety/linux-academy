const LX = require('./load.js');
async function run(sh, line) {
  let out = '';
  await sh.run(line, { stdout: (s) => (out += s), stderr: (s) => (out += s) });
  return LX.stripAnsi(out);
}
(async () => {
  const sh = new LX.Shell({ fast: true });
  const tests = [
    'echo hello > a.txt; sha256sum a.txt | tee sums.txt; sha256sum -c sums.txt; echo x >> a.txt; sha256sum -c sums.txt; md5sum a.txt',
    'openssl rand -hex 8 | wc -c; openssl req -x509 -newkey rsa:2048 -nodes -keyout k.pem -out c.pem -subj "/CN=example.com" -days 30 2>&1 | head -3; ls; openssl x509 -in c.pem -noout -subject -dates',
    'echo secret > s.txt; gpg -c --batch --passphrase pw s.txt; ls s.txt*; ',
    'sudo apt install -y fail2ban >/dev/null; sudo systemctl status fail2ban | head -3; sudo fail2ban-client status',
    'apt list --upgradable 2>/dev/null | head -3; sudo apt upgrade -y | tail -2',
    'sudo auditctl -w /etc/passwd -p wa -k pw; sudo auditctl -l; sudo useradd zed; sudo ausearch -k pw | head -4',
    'sudo lastb | head -3; sudo grep -c "Failed password" /var/log/auth.log',
    'git --version; git config --global user.name "Learner"; git config --global user.email l@x.com; mkdir proj && cd proj && git init -b main && echo hi > a.txt && git status && git add a.txt && git commit -m "first" && git log --oneline',
    'cd proj; echo more >> a.txt; git diff; git add -A; git commit -m second; git branch feat; git switch feat; echo f > f.txt; git add .; git commit -m feat1; git switch main; echo m >> a.txt; git commit -am m1; git merge feat; git log --oneline --graph',
    'cd proj; git switch -c c1; echo one > c.txt; git add c.txt; git commit -m c1 >/dev/null; git switch main; echo two > c.txt; git add c.txt; git commit -m c2 >/dev/null; git merge c1; cat c.txt; git status | head -5',
    'cd proj; printf "resolved\\n" > c.txt; git add c.txt; git commit -m merged; git log --oneline | head -3; git status',
    'cd ~; git clone https://github.com/linux-academy/hello-world.git; cd hello-world; ls; git log --oneline; git remote -v; git status',
    'cd ~/hello-world; echo "# change" >> README.md; git commit -am "doc"; git push; git status | head -3',
    'rsync -av proj/ backup/ | tail -4; rsync -av proj/ backup/ | tail -3; bzip2 a.txt; ls a.txt*; bunzip2 a.txt.bz2; ls a.txt*',
  ];
  for (const t of tests) {
    console.log('$ ' + t.split('\n')[0].slice(0, 200));
    try { console.log(await run(sh, t)); } catch (e) { console.log('!! ' + e.stack); }
  }
})();
