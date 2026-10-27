(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, JOB, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  const KEYGEN = 'ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -q';
  const cfgOn = (sh, key, val) => new RegExp('^\\s*' + key + '\\s+' + val + '\\s*$', 'mi').test(LX.cat(sh, '/etc/ssh/sshd_config'));

  LX.topics.push({
    id: 'ssh',
    part: 3,
    no: 25,
    key: 'ssh',
    mins: 50,
    title: T('SSH in Depth: Keys, Config, Tunnels and Hardening', 'SSH gehrai mein: Keys, Config, Tunnels aur Hardening'),
    blurb: T('The tool you will use every single day: log in to servers with keys instead of passwords, copy files, use shortcuts, tunnel through firewalls and lock the SSH server down.', 'Wo tool jo tum roz use karoge: passwords ke bajay keys se servers mein login, files copy, shortcuts, firewalls ke paar tunnel aur SSH server ko lock down karna.'),
    blocks: [
      BIG(
        '**SSH** (Secure Shell) gives you an encrypted command line on another machine. Nearly every Linux server in the world is managed through it, and it is also the most attacked service on the internet (you saw the guessing robots in the logs lesson). So a good admin does two things: uses **keys** instead of passwords, and **hardens** the SSH server.',
        '**SSH** (Secure Shell) doosri machine par encrypted command line deta hai. Duniya ka lagbhag har Linux server isse chalaya jata hai, aur ye internet par sabse zyada attack hone wali service bhi hai (logs lesson mein guessing robots dekhe the). Isliye achha admin do kaam karta hai: passwords ke bajay **keys** use karta hai, aur SSH server ko **harden** karta hai.'
      ),
      STORY('A password is a secret word you say at the door; anyone who overhears it can say it too. A key pair is like a special lock and key. You put a lock (the PUBLIC key) on the server door and anyone may look at the lock. You keep the only key (the PRIVATE key) at home. The server tests the door with a puzzle that only the real key can solve, and your key never travels over the network.', 'Password darwaze par bola jane wala gupt shabd hai; jo sun le wo bhi bol sakta hai. Key pair khaas taale aur chaabi jaisa hai. Server ke darwaze par taala (PUBLIC key) laga do, taale ko koi bhi dekh sakta hai. Chaabi (PRIVATE key) sirf tumhare ghar rehti hai. Server darwaze ko ek paheli se aazmata hai jo sirf asli chaabi hal kar sakti hai, aur tumhari chaabi network par kabhi nahi jati.'),
      H('First connection', 'Pehla connection'),
      CMD(['ssh learner@demo-server hostname', 'cat ~/.ssh/known_hosts'], 'The first time, SSH shows the server\'s fingerprint and asks you to trust it (yes). It is saved in ~/.ssh/known_hosts. Next time a CHANGED fingerprint raises a loud warning: either the server was reinstalled or someone is impersonating it. ("hostname" after the address is the command to run; without it you get a shell.)', 'Pehli baar SSH server ka fingerprint dikhata hai aur bharosa karne ko kehta hai (yes). Ye ~/.ssh/known_hosts mein save hota hai. Agli baar BADLA hua fingerprint zor ka warning deta hai: ya server dobara install hua ya koi uska naqal kar raha hai. (Address ke baad "hostname" chalane wali command hai; uske bina shell milta hai.)'),
      PRE(`ssh   learner  @  demo-server   hostname
 |      |           |        |           |
 |      |           |        |           +-- optional: ONE command to run, then disconnect
 |      |           |        +-------------- host name or IP address
 |      |           +----------------------- "at"
 |      +----------------------------------- user name on the REMOTE machine
 +------------------------------------------ the program`),
      H('Keys: generate, install, use', 'Keys: banao, lagao, use karo'),
      CMD([KEYGEN, 'ls -l ~/.ssh', 'cat ~/.ssh/id_ed25519.pub'], 'ed25519 is the modern key type (rsa 4096 is the older safe choice). Two files appear: id_ed25519 is PRIVATE (mode 600, never share, never email, never put in git) and id_ed25519.pub is PUBLIC (safe to share). A passphrase on the private key is a good idea on real laptops; here we use -N "" to keep exercises quick.', 'ed25519 modern key type hai (rsa 4096 purana safe vikalp). Do files banti hain: id_ed25519 PRIVATE hai (mode 600, kabhi share nahi, email nahi, git mein nahi) aur id_ed25519.pub PUBLIC hai (share karna safe). Asli laptops par private key par passphrase achha idea hai; yahan -N "" se exercises tez rakhte hain.'),
      CMD(['ssh-copy-id learner@demo-server', 'ssh learner@demo-server "whoami; hostname"'], 'ssh-copy-id appends your public key to ~/.ssh/authorized_keys on the server (it asks for your password this one last time). After that, no password.', 'ssh-copy-id tumhari public key server ke ~/.ssh/authorized_keys mein jodta hai (ye aakhri baar password puchta hai). Uske baad password nahi.'),
      TABLE(
        [
          ['~/.ssh/id_ed25519', 'your PRIVATE key. mode 600.', 'tumhari PRIVATE key. mode 600.'],
          ['~/.ssh/id_ed25519.pub', 'your public key. This is what you give out.', 'tumhari public key. Ye tum doge.'],
          ['~/.ssh/authorized_keys', 'on the SERVER: public keys allowed to log in as this user', 'SERVER par: is user ke roop mein login ki ijazat wali public keys'],
          ['~/.ssh/known_hosts', 'on the CLIENT: fingerprints of servers you trust', 'CLIENT par: tumhare bharose ke servers ke fingerprints'],
          ['~/.ssh/config', 'on the CLIENT: shortcuts and per-host settings', 'CLIENT par: shortcuts aur har host ki settings'],
        ],
        'File',
        'File'
      ),
      WARN('SSH is strict about permissions, on purpose. On the server ~/.ssh must be 700 and authorized_keys 600 and owned by the user, otherwise the key is silently ignored and you are asked for a password. If key login "does not work", check permissions first.', 'SSH permissions ke baare mein jaanbujhkar sakht hai. Server par ~/.ssh 700 aur authorized_keys 600 aur user ke owned honi chahiye, warna key chupchap ignore hoti hai aur password puchha jata hai. Key login "kaam nahi karta" to pehle permissions check karo.'),
      H('Try it on this very machine', 'Isi machine par try karo'),
      P('The sandbox runs its own SSH server, so you can practise the server side too. Create a user, install your public key in the server-side files, and break and fix the permissions.', 'Sandbox apna SSH server chalata hai, isliye server side bhi practice kar sakte ho. User banao, apni public key server-side files mein lagao, aur permissions todo aur theek karo.'),
      CMD(['sudo useradd -m -s /bin/bash bob', 'sudo mkdir -p /home/bob/.ssh', 'sudo cp ~/.ssh/id_ed25519.pub /home/bob/.ssh/authorized_keys', 'sudo chown -R bob:bob /home/bob/.ssh', 'sudo chmod 700 /home/bob/.ssh', 'sudo chmod 600 /home/bob/.ssh/authorized_keys', 'ssh bob@localhost whoami'], 'This is exactly what ssh-copy-id automates. Now bob can be reached with your key.', 'Yehi ssh-copy-id automate karta hai. Ab bob tak tumhari key se pahuncha ja sakta hai.'),
      CMD(['sudo chmod 666 /home/bob/.ssh/authorized_keys', 'ssh bob@localhost whoami', 'sudo journalctl -u ssh -n 2 --no-pager', 'sudo chmod 600 /home/bob/.ssh/authorized_keys'], 'Permission too open: the key is refused. The server log says why ("Authentication refused: bad ownership or modes"). Always read the SERVER log when keys fail.', 'Permission zyada khuli: key mana ho jati hai. Server log batata hai kyun ("Authentication refused: bad ownership or modes"). Keys fail hon to hamesha SERVER log padho.'),
      H('~/.ssh/config: shortcuts', '~/.ssh/config: shortcuts'),
      PRE(`Host web
    HostName web01.lab.local
    User learner
    Port 22
    IdentityFile ~/.ssh/id_ed25519

Host *
    ServerAliveInterval 60`),
      CMD(['printf "Host web\\n    HostName web01.lab.local\\n    User learner\\n    Port 22\\n    IdentityFile ~/.ssh/id_ed25519\\n" > ~/.ssh/config', 'chmod 600 ~/.ssh/config', 'ssh web hostname'], 'Now `ssh web` replaces a long command. The same alias works for scp, rsync and ansible.', 'Ab `ssh web` lambi command ki jagah leta hai. Wahi alias scp, rsync aur ansible ke saath bhi chalta hai.'),
      H('Copy files: scp, rsync, sftp', 'Files copy karo: scp, rsync, sftp'),
      TABLE(
        [
          ['scp file.txt web:/tmp/', 'copy a local file to the server', 'local file server par copy karo'],
          ['scp web:/etc/hostname ./', 'copy a server file to here', 'server ki file yahan copy karo'],
          ['scp -r folder web:/tmp/', 'copy a folder (recursive)', 'folder copy karo (recursive)'],
          ['rsync -avz folder/ web:/backup/', 'smart copy: only the changed parts, compressed. Use this for bigger jobs.', 'smart copy: sirf badle hue hisse, compressed. Bade kaam ke liye ye use karo.'],
          ['sftp web', 'an interactive file-transfer prompt (get, put, ls)', 'interactive file-transfer prompt (get, put, ls)'],
        ],
        'Command',
        'Command'
      ),
      CMD(['scp notes.txt web:/tmp/', 'ssh web "ls -l /tmp/notes.txt"', 'scp web:/etc/hostname ./web-hostname.txt', 'cat web-hostname.txt'], 'Copy there and back. (With -P PORT scp takes a custom port; note the capital P, unlike ssh -p.)', 'Wahan aur wapas copy. (-P PORT se scp custom port leta hai; capital P dhyan do, ssh -p ke ulat.)'),
      H('The agent and jump hosts', 'Agent aur jump hosts'),
      P('If your private key has a passphrase, typing it for every connection gets old. The **ssh-agent** keeps unlocked keys in memory for the session. Many companies also hide servers behind one **bastion** (jump) host: you pass through it with `-J`.', 'Private key par passphrase ho to har connection par type karna thaka deta hai. **ssh-agent** session ke liye unlocked keys memory mein rakhta hai. Kai companies servers ko ek **bastion** (jump) host ke peeche chhupati hain: tum `-J` se uske through jate ho.'),
      CMD(['eval $(ssh-agent)', 'ssh-add ~/.ssh/id_ed25519', 'ssh-add -l'], 'Start the agent, add the key, list what it holds.', 'Agent shuru karo, key jodo, dekho usme kya hai.'),
      PRE(`# one line, or put ProxyJump bastion in ~/.ssh/config
ssh -J ops@bastion.example.org learner@db01`),
      H('Tunnels: reach what the firewall hides', 'Tunnels: jo firewall chhupata hai wahan pahuncho'),
      TABLE(
        [
          ['ssh -L 8080:localhost:80 web', 'LOCAL forward: my port 8080 leads to port 80 as seen FROM the server. Handy to view an internal web page.', 'LOCAL forward: mera port 8080 server ki taraf se dikhne wale port 80 tak le jata hai. Internal web page dekhne ke liye.'],
          ['ssh -L 5432:db01:5432 bastion', 'reach a database that only the bastion can see', 'wo database jo sirf bastion dekh sakta hai'],
          ['ssh -R 9000:localhost:3000 server', 'REMOTE forward: expose my local port 3000 on the server\'s port 9000', 'REMOTE forward: mera local port 3000 server ke port 9000 par dikhao'],
          ['ssh -D 1080 server', 'a SOCKS proxy through the server', 'server ke through SOCKS proxy'],
        ],
        'Tunnel',
        'Tunnel'
      ),
      H('Harden the SSH server', 'SSH server ko harden karo'),
      TABLE(
        [
          ['PermitRootLogin no', 'nobody logs in directly as root; people log in as themselves and use sudo', 'koi seedha root nahi banta; log apne naam se login karke sudo use karte hain'],
          ['PasswordAuthentication no', 'keys only. Ends password guessing for good. FIRST make sure your key works!', 'sirf keys. Password guessing hamesha ke liye khatam. PEHLE pakka karo ki tumhari key chalti hai!'],
          ['AllowUsers alice bob', 'only these users may log in at all', 'sirf ye users login kar sakte hain'],
          ['MaxAuthTries 3', 'fewer guesses per connection', 'har connection par kam guesses'],
          ['Port 2222', 'move off 22: cuts log noise, but is obscurity, not security. Update the firewall too!', '22 se hatao: log noise kam, par ye chhupna hai, security nahi. Firewall bhi badlo!'],
          ['ClientAliveInterval 300', 'drop dead connections', 'mari hui connections giraao'],
        ],
        '/etc/ssh/sshd_config',
        '/etc/ssh/sshd_config'
      ),
      STEPS([
        ['Edit the file (as root): `sudo nano /etc/ssh/sshd_config`. Or use a drop-in in /etc/ssh/sshd_config.d/.', 'File edit karo (root se): `sudo nano /etc/ssh/sshd_config`. Ya /etc/ssh/sshd_config.d/ mein drop-in use karo.'],
        ['TEST it: `sudo sshd -t` prints nothing if all is well, or the error and the line number.', 'TEST karo: `sudo sshd -t` sab theek ho to kuch print nahi karta, warna error aur line number.'],
        ['Apply with `sudo systemctl reload ssh`. Your current session survives a reload, so you can fix mistakes. KEEP IT OPEN and test a second login from another terminal before you close it.', '`sudo systemctl reload ssh` se lagao. Tumhara current session reload se bachta hai, to galtiyan theek kar sakte ho. USE KHULA RAKHO aur band karne se pehle doosre terminal se doosra login test karo.'],
      ]),
      CMD(['sudo sed -i "s/^#\\?PermitRootLogin.*/PermitRootLogin no/" /etc/ssh/sshd_config', 'sudo sed -i "s/^#\\?PasswordAuthentication.*/PasswordAuthentication no/" /etc/ssh/sshd_config', 'sudo grep -E "^(PermitRootLogin|PasswordAuthentication)" /etc/ssh/sshd_config', 'sudo sshd -t && echo "config OK"', 'sudo systemctl reload ssh'], 'Two key changes, then test, then reload.', 'Do mukhya badlav, phir test, phir reload.'),
      CMD(['echo "Foo bar" | sudo tee -a /etc/ssh/sshd_config', 'sudo sshd -t', 'sudo systemctl restart ssh', 'systemctl is-active ssh'], 'What a typo does: sshd -t reports the bad line, and a restart would FAIL and leave NO SSH server at all. This is why you test before you restart.', 'Typo kya karta hai: sshd -t kharab line batata hai, aur restart FAIL hota aur SSH server HI nahi bachta. Isi liye restart se pehle test karte ho.'),
      CMD(['sudo sed -i "/^Foo bar/d" /etc/ssh/sshd_config', 'sudo sshd -t && sudo systemctl restart ssh', 'systemctl is-active ssh'], 'Remove the bad line and the service is back.', 'Kharab line hatao aur service wapas.'),
      H('When login fails: the checklist', 'Login fail ho to: checklist'),
      TABLE(
        [
          ['Permission denied (publickey)', 'the server wants a key and none of yours is accepted: key not installed, wrong user, bad permissions, or key file not found. Run `ssh -v` and read the server log.', 'server key chahta hai aur tumhari koi accept nahi: key lagi nahi, galat user, galat permissions, ya key file nahi mili. `ssh -v` chalao aur server log padho.'],
          ['Connection refused', 'sshd is not running or listens on another port. `systemctl status ssh`, `ss -tlnp`.', 'sshd chal nahi raha ya doosre port par hai. `systemctl status ssh`, `ss -tlnp`.'],
          ['Connection timed out', 'a firewall drops port 22, the host is down, or the route is wrong (the networking lessons).', 'firewall port 22 drop kar raha hai, host down hai, ya route galat hai (networking lessons).'],
          ['WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED', 'the server\'s key differs from known_hosts (reinstall? attack?). If you are SURE it was reinstalled: `ssh-keygen -R hostname`.', 'server ki key known_hosts se alag hai (reinstall? attack?). Pakka ho ki reinstall hua to: `ssh-keygen -R hostname`.'],
          ['Too many authentication failures', 'the agent offered many keys; use `-o IdentitiesOnly=yes -i KEY`', 'agent ne bahut keys pesh ki; `-o IdentitiesOnly=yes -i KEY` use karo'],
        ],
        'Message',
        'Message'
      ),
      CMD(['ssh -v learner@demo-server true 2>&1 | head -n 6', 'ssh nobody@localhost 2>&1 | tail -n 2', 'sudo journalctl -u ssh -n 3 --no-pager'], '`-v` (add more v for more detail) shows every step the client takes; the server journal shows what it refused and why.', '`-v` (aur v jodo to zyada detail) client ka har step dikhata hai; server journal dikhata hai usne kya mana kiya aur kyun.'),
      JOB('Hardening checklist for a first week: keys only, no root login, a firewall that allows 22 only from where you work, fail2ban or similar for repeated failures, and everyone with their OWN account (never share a login). Say "I never edit sshd_config without sshd -t and a second session open" in an interview and you will get a smile.', 'Pehle hafte ki hardening checklist: sirf keys, root login nahi, firewall jo 22 sirf wahan se allow kare jahan se kaam hota hai, baar-baar failure ke liye fail2ban jaisa kuch, aur sabka APNA account (login kabhi share nahi). Interview mein kaho "main sshd -t aur doosra session khule bina sshd_config kabhi edit nahi karta" aur muskurahat milegi.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['ssh user@host [command]', 'log in / run one command', 'login / ek command chalao'],
        ['ssh-keygen -t ed25519; ssh-copy-id user@host', 'key login in two steps', 'do steps mein key login'],
        ['~/.ssh: 700, authorized_keys & private key: 600', 'the permission rule', 'permission ka niyam'],
        ['Host alias in ~/.ssh/config', 'shortcuts', 'shortcuts'],
        ['scp / rsync -avz / ssh -J / ssh -L', 'copy / smart copy / jump / tunnel', 'copy / smart copy / jump / tunnel'],
        ['sshd -t; systemctl reload ssh', 'safe server changes', 'safe server badlav'],
        ['ssh -v; journalctl -u ssh', 'debug a failed login', 'fail login debug karo'],
        ['ssh-keygen -R host', 'forget a changed host key', 'badli host key bhoolo'],
      ]),
    ],
    missions: [
      M('ssh-m1', 'Passwordless login', 'Bina password ka login', 'Create an ed25519 key pair (no passphrase, default location ~/.ssh/id_ed25519) and install the public key on demo-server with ssh-copy-id. Then run a command there to prove it works.', 'ed25519 key pair banao (bina passphrase, default jagah ~/.ssh/id_ed25519) aur ssh-copy-id se public key demo-server par lagao. Phir wahan ek command chalakar saabit karo.', 'ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519, ssh-copy-id learner@demo-server, ssh learner@demo-server hostname', 'ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519, ssh-copy-id learner@demo-server, ssh learner@demo-server hostname', (sh) => { const pub = LX.cat(sh, '~/.ssh/id_ed25519.pub').trim().split(' ').slice(0, 2).join(' '); const keys = ((sh.remoteAuth || {})['demo-server'] || {}).learner || []; return !!pub && keys.includes(pub) && sh.log.some((r) => /ssh\s+(learner@)?demo-server\s+\S+/.test(r.cmd) && r.code === 0 && /demo-server/.test(r.out)); }, [KEYGEN, 'ssh-copy-id learner@demo-server', 'ssh learner@demo-server hostname']),
      M('ssh-m2', 'A shortcut called web', 'web naam ka shortcut', 'Create ~/.ssh/config with a host called web that points to web01.lab.local as user learner. Then run  ssh web hostname  successfully. (Do mission 1 first so that a key exists.)', '~/.ssh/config banao jisme web naam ka host web01.lab.local ko user learner ke roop mein point kare. Phir  ssh web hostname  safalta se chalao. (Pehle mission 1 karo taaki key maujood ho.)', 'Host web / HostName web01.lab.local / User learner, indented lines', 'Host web / HostName web01.lab.local / User learner, indent wali lines', (sh) => /^Host web\s*$/m.test(LX.cat(sh, '~/.ssh/config')) && /HostName web01\.lab\.local/.test(LX.cat(sh, '~/.ssh/config')) && sh.log.some((r) => /ssh\s+web\s+hostname/.test(r.cmd) && r.code === 0 && /web01/.test(r.out)), [KEYGEN, 'ssh-copy-id learner@web01.lab.local', 'printf "Host web\\n    HostName web01.lab.local\\n    User learner\\n" > ~/.ssh/config', 'chmod 600 ~/.ssh/config', 'ssh web hostname']),
      M('ssh-m3', 'Lock the front door', 'Samne ka darwaza lock karo', 'Harden this machine\'s SSH server: set PermitRootLogin no and PasswordAuthentication no in /etc/ssh/sshd_config, check the file with sshd -t, and reload the ssh service.', 'Is machine ka SSH server harden karo: /etc/ssh/sshd_config mein PermitRootLogin no aur PasswordAuthentication no set karo, file ko sshd -t se check karo, aur ssh service reload karo.', 'sed -i the two settings, then sudo sshd -t, then sudo systemctl reload ssh', 'do settings sed -i se, phir sudo sshd -t, phir sudo systemctl reload ssh', (sh) => cfgOn(sh, 'PermitRootLogin', 'no') && cfgOn(sh, 'PasswordAuthentication', 'no') && sh.log.some((r) => /sshd -t/.test(r.cmd) && r.code === 0) && sh.log.some((r) => /systemctl (reload|restart) ssh/.test(r.cmd) && r.code === 0), ['sudo sed -i "s/^#\\?PermitRootLogin.*/PermitRootLogin no/" /etc/ssh/sshd_config', 'sudo sed -i "s/^#\\?PasswordAuthentication.*/PasswordAuthentication no/" /etc/ssh/sshd_config', 'sudo sshd -t', 'sudo systemctl reload ssh']),
    ],
    quiz: [
      mcq(1, 'Which key file must you NEVER share?', 'Kaunsi key file kabhi share NAHI karni chahiye?', ['id_ed25519.pub', 'id_ed25519', 'known_hosts', 'authorized_keys'], 1, 'The file without .pub is the private key.', '.pub ke bina wali file private key hai.'),
      mcq(2, 'Where does the SERVER keep the public keys that may log in as a user?', 'SERVER wo public keys kahan rakhta hai jo kisi user ke roop mein login kar sakti hain?', ['~/.ssh/known_hosts', '~/.ssh/authorized_keys', '/etc/passwd', '~/.ssh/config'], 1, 'authorized_keys on the server side; known_hosts is the client memory of servers.', 'authorized_keys server side par; known_hosts client ki servers ki yaaddasht hai.'),
      cmd(3, 'Generate an ed25519 key pair at the default location with an empty passphrase, quietly.', 'Default jagah par khaali passphrase ke saath ed25519 key pair banao, chupchap.', { verify: (sh) => !!sh.fs.lookup(sh.abs('~/.ssh/id_ed25519')) && !!sh.fs.lookup(sh.abs('~/.ssh/id_ed25519.pub')), sample: KEYGEN, alt: ['ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""'], wrong: ['ssh-keygen -t ed25519 -f ~/.ssh/other -N ""'], hintEn: 'ssh-keygen -t TYPE -f FILE -N PASSPHRASE', hintHi: 'ssh-keygen -t TYPE -f FILE -N PASSPHRASE' }, '-N "" sets an empty passphrase.', '-N "" khaali passphrase set karta hai.'),
      cmd(4, 'Run the command  uptime  on demo-server as learner with one ssh command (a key is already installed).', 'Ek ssh command se demo-server par learner ke roop mein  uptime  chalao (key pehle se lagi hai).', { setup: [KEYGEN, 'ssh-copy-id learner@demo-server'], verify: (sh, r, c) => /ssh/.test(c) && /load average/.test(r.out), sample: 'ssh learner@demo-server uptime', alt: ['ssh demo-server uptime'], wrong: ['uptime'], hintEn: 'ssh user@host command', hintHi: 'ssh user@host command' }, 'Everything after the host is run remotely.', 'Host ke baad sab kuch remote par chalta hai.'),
      cmd(5, 'Copy the local file notes.txt to /tmp on the host demo-server.', 'Local file notes.txt ko host demo-server ke /tmp mein copy karo.', { setup: [KEYGEN, 'ssh-copy-id learner@demo-server'], verify: (sh) => !!LX.hostShell(sh, 'demo-server').fs.lookup('/tmp/notes.txt'), sample: 'scp notes.txt learner@demo-server:/tmp/', alt: ['scp notes.txt demo-server:/tmp'], wrong: ['cp notes.txt /tmp'], hintEn: 'scp source user@host:destination', hintHi: 'scp source user@host:destination' }, 'scp copies over ssh.', 'scp ssh ke upar copy karta hai.'),
      mcq(6, 'The correct permissions on the SERVER for ~/.ssh and authorized_keys are...', 'SERVER par ~/.ssh aur authorized_keys ki sahi permissions hain...', ['777 and 777', '700 and 600', '644 and 644', '600 and 700'], 1, 'Directory 700, file 600, owned by the user.', 'Directory 700, file 600, user ke owned.'),
      cmd(7, 'Check the SSH server configuration file for syntax errors.', 'SSH server configuration file mein syntax errors check karo.', { verify: (sh, r, c) => /sshd -t/.test(c) && r.code === 0, sample: 'sudo sshd -t', wrong: ['sshd'], hintEn: 'sshd has a test flag.', hintHi: 'sshd ka test flag hota hai.' }, 'sshd -t prints nothing when the file is fine.', 'File theek ho to sshd -t kuch print nahi karta.'),
      cmd(8, 'In /etc/ssh/sshd_config make sure the line PermitRootLogin no is active (replace the commented/default line with sed).', '/etc/ssh/sshd_config mein dhyan rakho ki PermitRootLogin no line active ho (commented/default line ko sed se badlo).', { verify: (sh) => cfgOn(sh, 'PermitRootLogin', 'no'), sample: 'sudo sed -i "s/^#\\?PermitRootLogin.*/PermitRootLogin no/" /etc/ssh/sshd_config', alt: ["sudo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config"], wrong: ['sed -i "s/PermitRootLogin/x/" /etc/ssh/sshd_config'], hintEn: 'sed -i on the config file, as root.', hintHi: 'Config file par sed -i, root se.' }, 'The line is commented out by default; the regex matches both forms.', 'Line default mein commented hoti hai; regex dono roop match karta hai.'),
      mcq(9, 'You see "WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!" for a server you KNOW was reinstalled. How do you clear the old fingerprint?', 'Ek server ke liye "WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!" dikhta hai jise tum JAANTE ho ki reinstall hua. Purana fingerprint kaise hatate ho?', ['rm -rf ~/.ssh', 'ssh-keygen -R servername', 'ssh-add -D', 'reboot'], 1, 'ssh-keygen -R removes that host from known_hosts.', 'ssh-keygen -R us host ko known_hosts se hata deta hai.'),
      cmd(10, 'Boss level: make demo-server reachable by the alias  prod  by writing a ~/.ssh/config entry (HostName demo-server, User learner), then prove it with  ssh prod hostname  in the same line. A key is installed already.', 'Boss level: ~/.ssh/config entry likhkar (HostName demo-server, User learner) demo-server ko alias  prod  se reachable banao, phir usi line mein  ssh prod hostname  se saabit karo. Key pehle se lagi hai.', { setup: [KEYGEN, 'ssh-copy-id learner@demo-server'], verify: (sh, r) => /^Host prod\s*$/m.test(LX.cat(sh, '~/.ssh/config')) && r.out.trim().endsWith('demo-server'), sample: 'printf "Host prod\\n    HostName demo-server\\n    User learner\\n" > ~/.ssh/config && chmod 600 ~/.ssh/config && ssh prod hostname', wrong: ['ssh demo-server hostname'], hintEn: 'printf the three lines into ~/.ssh/config, chmod 600, ssh prod hostname.', hintHi: 'Teen lines ~/.ssh/config mein printf, chmod 600, ssh prod hostname.' }, 'Host defines the alias, HostName the real address.', 'Host alias tay karta hai, HostName asli address.'),
    ],
  });
})();
