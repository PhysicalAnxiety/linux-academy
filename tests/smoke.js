const LX = require('./load.js');
async function run(sh, line) {
  let out = '';
  const rec = await sh.run(line, { stdout: (s) => (out += s), stderr: (s) => (out += s) });
  return LX.stripAnsi(out);
}
(async () => {
  const sh = new LX.Shell({ fast: true });
  const cmds = process.argv.slice(2);
  const list = cmds.length ? cmds : [
    'pwd', 'ls', 'ls -la', 'cd Documents && pwd', 'cd .. ; ls -l', 'echo hello world', 'cat poem.txt', 'head -n 2 server.log',
    'grep ERROR server.log', 'grep -c INFO server.log', 'sort -n numbers.txt | head -3', 'sort animals.txt | uniq -c | sort -rn',
    'cut -d, -f2 students.csv', 'mkdir -p a/b/c && ls a/b', 'touch x.txt && ls x.txt', 'echo hi > t.txt; cat t.txt',
    'for i in 1 2 3; do echo n$i; done', 'x=5; echo $((x*2))', 'ls /nonexistent', 'cat /etc/shadow', 'whoami', 'id',
    'wc -l server.log', 'find . -name "*.txt" | head', 'tree -L 1', 'sudo apt install tree -y', 'tree -L 1',
    'chmod 600 poem.txt; ls -l poem.txt', 'ps', 'sleep 100 &', 'jobs', 'echo "a b" | awk \'{print $2}\'',
    "awk -F, '$5>85 {print $2}' students.csv", "sed 's/cat/dog/g' animals.txt | head -2", 'man ls | head -5', 'ls --help | head -3',
    'foo', 'df -h | head -2', 'echo {a,b}{1,2}', 'ls *.txt', 'date +%Y', 'curl -s example.com | head -3',
  ];
  for (const l of list) {
    console.log('$ ' + l);
    try { console.log(await run(sh, l)); } catch (e) { console.log('!! EXC', e.stack); }
  }
})();
