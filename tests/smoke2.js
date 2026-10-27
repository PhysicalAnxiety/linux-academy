const LX = require('./load.js');
async function run(sh, line) {
  let out = '';
  await sh.run(line, { stdout: (s) => (out += s), stderr: (s) => (out += s) });
  return LX.stripAnsi(out);
}
(async () => {
  const sh = new LX.Shell({ fast: true });
  const list = [
    'sudo apt install tree -y', 'tree -L 1 ~/projects', 'ls -l /', 'cat /etc/passwd | head -3', 'sudo cat /etc/shadow | head -2',
    'cat > /root/x', 'sudo echo hi > /root/y', 'echo hi | sudo tee /root/y', 'sudo cat /root/y',
    'cat <<EOF',
    'greet() { echo "Hello, $1!"; }; greet Ravi',
    'if [ -f poem.txt ]; then echo yes; else echo no; fi',
    'n=0; while [ $n -lt 3 ]; do echo "n=$n"; n=$((n+1)); done',
    'for f in *.txt; do echo "$f: $(wc -l < $f)"; done',
    'echo "echo hi from script" > s.sh; ./s.sh; chmod +x s.sh; ./s.sh',
    'printf "%s is %d years\\n" Ravi 12',
    'mkdir d1 && cp -r d1 d2 && ls -d d*',
    'rm -r d1 d2; rm nothere', 'rm -rf /', 'cd /root', 'cd /nope', 'ls -ld /tmp /root',
    'tar -czvf docs.tar.gz Documents && ls -lh docs.tar.gz && tar -tf docs.tar.gz | head -3',
    'mkdir ex && tar -xzf docs.tar.gz -C ex && ls ex',
    'ping -c 2 example.com', 'ping -c 1 nosuch.invalid', 'curl localhost', 'sudo systemctl start nginx; curl -s localhost | head -3',
    'systemctl status ssh', 'ss -tuln',
    'ls | wc -l', 'history | tail -3', '!!', 'cat nothere.txt 2>/dev/null; echo done', 'cat nothere.txt 2>&1 | head -1',
    'alias hi="echo hello"; hi', 'type ls cd hi', 'which ls', 'export FOO=bar; env | grep FOO', 'echo $HOME ${USER} ${FOO:-none} ${#FOO}',
    'find . -type d -name "rec*"', 'find ~ -name "*.log" -exec wc -l {} \;', 'grep -rn "Linux" . | head -3', 'grep -i -c banana fruits.txt',
    'cp poem.txt /root/', 'mv poem.txt poem2.txt && ls poem*', 'touch -- -weird', 'ls -1 | head -2',
    'useradd bob', 'sudo useradd -m bob && tail -1 /etc/passwd', 'su - bob', 'sudo -i', 'whoami', 'exit', 'whoami',
    'echo $((10/3)) $((2**8)) $((7%4))', 'seq 1 5 | paste', 'echo abc | tr a-z A-Z', 'uniq -c animals.txt | head -2',
    'diff poem2.txt notes.txt | head -3', 'stat notes.txt | head -3', 'file poem2.txt Pictures/cat.png Documents', 'du -sh Pictures', 'basename /a/b/c.txt .txt',
  ];
  for (const l of list) {
    console.log('$ ' + l);
    try { console.log(await run(sh, l)); } catch (e) { console.log('!! EXC', e.stack); }
  }
})();
