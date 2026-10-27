const LX = require('./load.js');
async function run(sh, line) { let out=''; await sh.run(line,{stdout:s=>out+=s,stderr:s=>out+=s}); return LX.stripAnsi(out); }
(async()=>{
  const sh = new LX.Shell({fast:true});
  const tests = [
   'ln poem.txt poem.hard; ln -s poem.txt poem.soft; ls -li poem*; echo more >> poem.hard; cat poem.txt | tail -1; stat poem.txt | head -3',
   'rm poem.txt; ls -l poem.hard poem.soft; cat poem.soft',
   'sudo groupadd devs; sudo useradd -m -G devs -s /bin/bash asha; id asha; getent group devs; tail -1 /etc/passwd',
   'sudo usermod -aG sudo asha; groups asha; sudo chage -M 90 -W 14 asha; sudo chage -l asha | head -4',
   'sudo passwd -l asha; sudo passwd -S asha; sudo grep asha /etc/shadow',
   'mkdir share; sudo setfacl -m u:asha:rw share; getfacl share; ls -ld share',
   'touch ro.txt; sudo chattr +i ro.txt; echo x >> ro.txt; rm ro.txt; lsattr ro.txt; sudo chattr -i ro.txt; rm ro.txt && echo removed',
   'getenforce; ls -Z /var/www /etc/hostname 2>&1 | head -3; sudo setenforce 0; getenforce; sestatus | head -3',
   'cat /proc/loadavg; head -3 /proc/meminfo; cat /proc/sys/vm/swappiness; sudo sh -c "echo 10 > /proc/sys/vm/swappiness"; cat /proc/sys/vm/swappiness',
   'sudo -l',
   'echo "asha ALL=(ALL) NOPASSWD: /usr/bin/systemctl" | sudo tee /etc/sudoers.d/asha > /dev/null; sudo -l -U asha 2>&1 | tail -2',
   'readlink -f poem.soft; readlink poem.soft',
  ];
  for (const t of tests) { console.log('$ '+t.split('\n')[0]); try { console.log(await run(sh,t)); } catch(e){ console.log('!! '+e.stack); } }
})();
