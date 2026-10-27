const LX = require('./load.js');
async function run(sh, line) {
  let out = '';
  await sh.run(line, { stdout: (s) => (out += s), stderr: (s) => (out += s) });
  return LX.stripAnsi(out);
}
(async () => {
  const sh = new LX.Shell({ fast: true });
  const tests = [
    'sudo apt install -y nginx > /dev/null; curl -s localhost | head -3; curl -I localhost | head -3; ss -tuln | grep 80',
    'sudo ufw status; sudo ufw allow 22/tcp; sudo ufw default deny incoming; sudo ufw enable; sudo ufw status',
    'curl -s localhost | head -1; curl -s http://192.168.1.10 | head -1',
    'sudo ufw allow 80/tcp; curl -s http://192.168.1.10 | head -1; sudo ufw status numbered',
    'sudo ufw disable; sudo bash -c \'echo "server { listn 80; }" > /etc/nginx/conf.d/bad.conf\'; sudo nginx -t; sudo systemctl reload nginx; systemctl is-active nginx',
    'sudo rm /etc/nginx/conf.d/bad.conf; sudo nginx -t; sudo mkdir -p /srv/site; echo "<h1>My site</h1>" | sudo tee /srv/site/index.html >/dev/null; printf "server {\\n listen 8080;\\n server_name site.local;\\n root /srv/site;\\n}\\n" | sudo tee /etc/nginx/conf.d/site.conf > /dev/null; sudo systemctl reload nginx; curl -s localhost:8080',
    'sudo chown -R root:root /srv/site; sudo chmod 700 /srv/site; curl -s -o /dev/null -w "%{http_code}\\n" localhost:8080; sudo chmod 755 /srv/site; curl -s -o /dev/null -w "%{http_code}\\n" localhost:8080; sudo tail -2 /var/log/nginx/error.log',
    'echo "127.0.0.1 site.local" | sudo tee -a /etc/hosts >/dev/null; curl -s site.local:8080; ping -c1 site.local | head -2',
    'ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" | head -3; ls -l ~/.ssh; cat ~/.ssh/id_ed25519.pub | cut -c1-30',
    'ssh-copy-id learner@demo-server | tail -4; ssh learner@demo-server hostname',
    'sudo useradd -m -s /bin/bash bob; ssh bob@localhost whoami',
    'sudo mkdir -p /home/bob/.ssh; sudo cp ~/.ssh/id_ed25519.pub /home/bob/.ssh/authorized_keys; sudo chown -R bob:bob /home/bob/.ssh; sudo chmod 700 /home/bob/.ssh; sudo chmod 600 /home/bob/.ssh/authorized_keys; ssh bob@localhost whoami',
    'sudo sed -i "s/^#PasswordAuthentication yes/PasswordAuthentication no/" /etc/ssh/sshd_config; grep Password /etc/ssh/sshd_config; sudo sshd -t && echo cfg-ok; sudo systemctl restart ssh; sudo useradd -m eve; ssh eve@localhost',
    'echo "Foo bar" | sudo tee -a /etc/ssh/sshd_config >/dev/null; sudo sshd -t; sudo systemctl restart ssh; systemctl is-active ssh; journalctl -u ssh -n 2',
    'python3 -m http.server 9000 & sleep 0; curl -s localhost:9000 | head -4; kill %1; curl -s localhost:9000',
    'ip addr | head -3; sudo ip link set eth0 down; ping -c1 example.com; sudo ip link set eth0 up; ping -c1 example.com | head -2',
    'sudo sh -c "echo nameserver 10.255.255.1 > /etc/resolv.conf"; ping -c1 example.com; nslookup example.com | head -2; sudo sh -c "echo nameserver 8.8.8.8 > /etc/resolv.conf"; ping -c1 example.com | head -2',
    'sudo apt install -y ipcalc >/dev/null; ipcalc 192.168.10.37/26',
  ];
  for (const t of tests) {
    console.log('$ ' + t.split('\n')[0].slice(0, 160));
    try {
      console.log(await run(sh, t));
    } catch (e) {
      console.log('!! ' + e.stack);
    }
  }
})();
