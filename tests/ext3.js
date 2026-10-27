const LX = require('./load.js');
async function run(sh, line) { let out=''; await sh.run(line,{stdout:s=>out+=s,stderr:s=>out+=s}); return LX.stripAnsi(out); }
(async()=>{
  const sh = new LX.Shell({fast:true});
  const tests = [
   'systemctl status ssh | head -6',
   'journalctl -u ssh -n 3',
   'journalctl -p err --no-pager | tail -2',
   'cat > hello.sh <<EOF\n#!/bin/bash\necho "hello from service"\nsleep 1000\nEOF\nchmod +x hello.sh; pwd',
   'printf "[Unit]\\nDescription=Hello demo\\n\\n[Service]\\nExecStart=/home/learner/hello.sh\\nRestart=on-failure\\n\\n[Install]\\nWantedBy=multi-user.target\\n" | sudo tee /etc/systemd/system/hello.service >/dev/null; sudo systemctl daemon-reload; sudo systemctl start hello; systemctl status hello | head -8',
   'sudo systemctl enable hello; systemctl is-enabled hello; journalctl -u hello -n 3',
   'sudo chmod -x hello.sh; sudo systemctl restart hello; systemctl status hello | head -9; systemctl --failed | head -3',
   'sudo chmod +x hello.sh; sudo systemctl restart hello; systemctl is-active hello',
   'systemctl list-timers | head -4; systemd-analyze calendar "Mon..Fri *-*-* 02:30" | head -4',
   'sudo mkdir -p /data; sudo mkfs.ext4 /dev/sdb >/dev/null 2>&1; sudo mount /dev/sdb /data && df -h /data | tail -1; sudo reboot | tail -2; df -h | grep data; systemctl is-active hello; uptime',
   'ps aux --sort=-%cpu | head -3; yes > /dev/null & sleep 0; ps -eo pid,%cpu,cmd --sort=-%cpu | head -3; uptime; top -b | head -4',
   'sudo sysctl -w vm.swappiness=10; sysctl vm.swappiness; sudo reboot > /dev/null; sysctl vm.swappiness',
   'hostnamectl set-hostname web01; hostnamectl | head -2; sudo hostnamectl set-hostname web01; hostname',
   'lsmod | head -3; sudo modprobe dummy; lsmod | head -2; lscpu | head -2; dmesg | head -2; sudo dmesg | head -2',
  ];
  for (const t of tests) { console.log('$ '+t.split('\n')[0]); try { console.log(await run(sh,t)); } catch(e){ console.log('!! '+e.stack); } }
})();
