const LX = require('./load.js');
(async () => {
  const sh = new LX.Shell({ fast: true });
  sh.hooks.readLine = async (p, o) => (o && o.secret ? 'pw' : null);
  for (const t of [
    'sudo apt install -y strace plocate >/dev/null; strace cat /etc/hostname 2>&1 | head -8; strace -e trace=openat cat nofile 2>&1 | tail -3',
    'sudo updatedb; locate passwd | head -3; locate -c .conf',
    'cal 10 2026; timeout 2 sleep 5; echo rc=$?; echo hello | xxd; echo hello | hexdump -C | head -2; mktemp; mktemp -d',
    'printf "line1\\nline2\\nline3\\n" > a.txt; printf "line1\\nCHANGED\\nline3\\n" > b.txt; diff -u a.txt b.txt > ch.patch; patch a.txt < ch.patch; cat a.txt',
    'sudo bash -c "printf \'/var/log/app.log {\\n    rotate 3\\n    size 1\\n    compress\\n    missingok\\n}\\n\' > /etc/logrotate.d/app; echo data > /var/log/app.log; logrotate -f /etc/logrotate.d/app; ls /var/log | grep app"',
    'logrotate -d /etc/logrotate.d/app',
    'egrep -c "a|b" a.txt; apt-cache policy tree; wall hello team',
  ]) {
    let out = '';
    await sh.run(t, { stdout: (s) => { out += s; }, stderr: (s) => { out += s; } });
    console.log('$ ' + t.slice(0, 140) + '\n' + LX.stripAnsi(out));
  }
})();
