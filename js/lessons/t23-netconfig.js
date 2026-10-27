(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, JOB, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  const LAB_LINK = ['sudo ip link set eth0 down'];
  const LAB_DNS = ['sudo sh -c "echo nameserver 10.255.255.1 > /etc/resolv.conf"'];
  const LAB_ROUTE = ['sudo ip route del default'];

  LX.topics.push({
    id: 'netconfig',
    part: 3,
    no: 23,
    key: 'netplan',
    mins: 50,
    title: T('Configuring and Troubleshooting the Network', 'Network configure aur troubleshoot karna'),
    blurb: T('Set a static IP the right way (netplan and NetworkManager), add routes, name your host, then learn the bottom-up routine that finds any network fault in two minutes. Includes three broken-network labs.', 'Static IP sahi tareeke se lagao (netplan aur NetworkManager), routes jodo, host ko naam do, phir wo bottom-up routine seekho jo kisi bhi network fault ko do minute mein pakadti hai. Teen kharab-network labs shamil.'),
    blocks: [
      BIG(
        'Two skills in one lesson. First, **configure**: give a server a fixed address, gateway and DNS that survive a reboot. Second, **troubleshoot**: when somebody says "the server is not reachable", follow a fixed ladder from the cable up to the application instead of guessing. The second skill is what gets you hired.',
        'Ek lesson mein do skills. Pehli, **configure**: server ko aisa fixed address, gateway aur DNS do jo reboot ke baad bhi rahe. Doosri, **troubleshoot**: jab koi kahe "server reachable nahi hai", andaza lagane ke bajay cable se application tak ek tay seedhi par chalo. Doosri skill hi tumhe naukri dilati hai.'
      ),
      H('Temporary changes with ip', 'ip se asthayi badlav'),
      P('The `ip` command changes the live network instantly. These changes vanish at the next reboot, so they are perfect for testing and emergency fixes.', '`ip` command live network turant badalti hai. Ye badlav agle reboot par chale jate hain, isliye testing aur emergency fixes ke liye perfect hain.'),
      TABLE(
        [
          ['sudo ip addr add 192.168.1.50/24 dev eth0', 'add a second address', 'doosra address jodo'],
          ['sudo ip addr del 192.168.1.50/24 dev eth0', 'remove it', 'ise hatao'],
          ['sudo ip link set eth0 down  /  up', 'switch the interface off / on', 'interface band / chalu'],
          ['sudo ip route add 10.10.0.0/16 via 192.168.1.1', 'add a static route: for 10.10.x.x use this gateway', 'static route jodo: 10.10.x.x ke liye ye gateway'],
          ['sudo ip route add default via 192.168.1.1', 'set the default gateway', 'default gateway lagao'],
          ['sudo ip route del default', 'remove it (the internet vanishes!)', 'ise hatao (internet gayab!)'],
          ['ip route get 8.8.8.8', 'which route/interface will THIS destination use?', 'ye destination kaun sa route/interface use karega?'],
        ],
        'Command',
        'Command'
      ),
      CMD(['sudo ip addr add 192.168.1.50/24 dev eth0', 'ip -br addr', 'ping -c 1 192.168.1.50', 'sudo ip addr del 192.168.1.50/24 dev eth0', 'ip route get 8.8.8.8'], 'Add, test, remove. ip route get is a favourite: it answers "how would I reach this?" exactly like the kernel decides.', 'Jodo, test karo, hatao. ip route get ek favourite hai: ye bilkul kernel ki tarah jawab deta hai "main ye kaise pahunchunga?".'),
      H('Permanent settings: netplan (Ubuntu)', 'Permanent settings: netplan (Ubuntu)'),
      P('Ubuntu Server stores network settings in YAML files in /etc/netplan/. You edit the file, check it, and apply it. The golden rule of YAML: **indent with spaces, never tabs**, and keep the indentation exact.', 'Ubuntu Server network settings /etc/netplan/ ki YAML files mein rakhta hai. File edit karo, check karo aur apply karo. YAML ka sunehra niyam: **spaces se indent karo, tabs se kabhi nahi**, aur indentation bilkul sahi rakho.'),
      CMD('sudo cat /etc/netplan/50-cloud-init.yaml', 'The default: DHCP gives the address automatically.', 'Default: DHCP address apne aap deta hai.'),
      PRE(`network:
  version: 2
  ethernets:
    eth0:
      dhcp4: false
      addresses:
        - 192.168.1.10/24          <- the static address (with prefix)
      routes:
        - to: default
          via: 192.168.1.1         <- the gateway
      nameservers:
        addresses: [1.1.1.1, 8.8.8.8]   <- DNS servers`),
      STEPS([
        ['Write the file: `sudo nano /etc/netplan/60-static.yaml` (permissions must not be world-readable: `sudo chmod 600`).', 'File likho: `sudo nano /etc/netplan/60-static.yaml` (permissions world-readable nahi honi chahiye: `sudo chmod 600`).'],
        ['`sudo netplan try` applies it for 2 minutes and rolls back by itself if you do not confirm. This saves you when a wrong IP would lock you out of an SSH session!', '`sudo netplan try` ise 2 minute ke liye lagata hai aur tum confirm na karo to apne aap wapas kar deta hai. Galat IP tumhe SSH session se bahar kar de to ye bachata hai!'],
        ['`sudo netplan apply` makes it final.', '`sudo netplan apply` ise final karta hai.'],
      ]),
      CMD(['sudo netplan get', 'sudo netplan status | head -n 5'], 'netplan get shows the merged configuration; netplan status shows what the network service really did.', 'netplan get merged configuration dikhata hai; netplan status dikhata hai ki network service ne asal mein kya kiya.'),
      WARN('Changing the IP of a server while you are connected to it over SSH can cut your own branch. Always use `netplan try`, or have console access (cloud web console or a person at the machine) before you change a remote server\'s network settings.', 'Jis server se SSH se jude ho uska IP badalna apni hi daal kaat sakta hai. Hamesha `netplan try` use karo, ya remote server ke network settings badalne se pehle console access (cloud web console ya machine ke paas koi insaan) rakho.'),
      H('Permanent settings: NetworkManager (Red Hat family)', 'Permanent settings: NetworkManager (Red Hat family)'),
      P('RHEL, Rocky and Fedora use **NetworkManager**, controlled with **nmcli**. It works with named connections instead of YAML files.', 'RHEL, Rocky aur Fedora **NetworkManager** use karte hain, jo **nmcli** se chalta hai. YAML files ke bajay named connections se kaam karta hai.'),
      TABLE(
        [
          ['nmcli device status', 'list interfaces and their state', 'interfaces aur unki state list karo'],
          ['nmcli connection show', 'list the saved connections', 'saved connections list karo'],
          ['nmcli con mod "Wired connection 1" ipv4.method manual ipv4.addresses 192.168.1.60/24 ipv4.gateway 192.168.1.1 ipv4.dns 8.8.8.8', 'make it static', 'ise static banao'],
          ['nmcli con up "Wired connection 1"', 'apply the change (re-activate the connection)', 'badlav lagao (connection dobara activate karo)'],
        ],
        'nmcli',
        'nmcli'
      ),
      P('Both tools write the same kind of result: an address, a gateway and DNS servers. Learn the ideas once and you can work on either family.', 'Dono tools ek jaisa result likhte hain: address, gateway aur DNS servers. Ideas ek baar seekho aur dono family par kaam kar sakte ho.'),
      H('Names: hostname and /etc/hosts', 'Naam: hostname aur /etc/hosts'),
      CMD(['hostnamectl', 'sudo hostnamectl set-hostname web01', 'hostname', 'sudo sed -i "s/linux-school/web01/" /etc/hosts', 'cat /etc/hosts | head -n 3'], 'A good hostname tells you what the machine does (web01, db02, bastion). hostnamectl makes it permanent; also fix the 127.0.1.1 line in /etc/hosts so the machine can find itself.', 'Achha hostname batata hai machine kya karti hai (web01, db02, bastion). hostnamectl ise permanent karta hai; /etc/hosts ki 127.0.1.1 line bhi theek karo taaki machine khud ko dhundh sake.'),
      H('The troubleshooting ladder: bottom up', 'Troubleshooting ki seedhi: neeche se upar'),
      P('When something "cannot connect", do NOT start with the application. Climb one rung at a time. The first rung that fails tells you where the problem lives.', 'Jab kuch "connect nahi ho raha" to application se shuru MAT karo. Ek ek seedhi chadho. Pehli seedhi jo fail ho wahi batati hai ki problem kahan hai.'),
      TABLE(
        [
          ['1. Link', 'ip -br link   (is eth0 UP?)', 'cable, interface down, virtual NIC missing'],
          ['2. Address', 'ip -br addr   (do I have an IP?)', 'DHCP failed (169.254.x.x), wrong static IP'],
          ['3. Gateway', 'ping -c1 GATEWAY   (ip route)', 'no default route, wrong gateway, wrong subnet'],
          ['4. Internet by IP', 'ping -c1 8.8.8.8', 'upstream router/ISP problem, firewall blocks ICMP'],
          ['5. DNS', 'ping -c1 example.com   (dig)', 'bad /etc/resolv.conf, DNS server down'],
          ['6. Port', 'nc -zv HOST 443   /   curl -v URL', 'service stopped, wrong port, FIREWALL, wrong bind address'],
          ['7. Application', 'logs: journalctl -u SERVICE', 'config error, permissions, crash'],
        ],
        'Rung',
        'Seedhi'
      ),
      TABLE(
        [
          ['Name or service not known / Temporary failure in name resolution', 'DNS is the problem (rung 5)', 'DNS ki problem (seedhi 5)'],
          ['Network is unreachable', 'no route to that network: no default gateway or link down (rungs 1-3)', 'us network ka route nahi: default gateway nahi ya link down (seedhi 1-3)'],
          ['Connection refused', 'the host answered but NOTHING is listening on that port (rung 6: service down)', 'host ne jawab diya par us port par KUCH listen nahi kar raha (seedhi 6: service down)'],
          ['Connection timed out', 'no answer at all: usually a FIREWALL dropping packets, or the host is down/unreachable', 'koi jawab nahi: aksar FIREWALL packets drop kar raha hai, ya host down/unreachable'],
          ['No route to host', 'the local network cannot find the machine (ARP failed, wrong subnet)', 'local network machine dhundh nahi paata (ARP fail, galat subnet)'],
        ],
        'The error says',
        'Error kehta hai'
      ),
      THINK('"Connection refused" versus "Connection timed out": which one blames the firewall?', '"Connection refused" aur "Connection timed out" mein se kaun firewall ko dosh deta hai?', 'Timed out. A firewall that silently drops packets (DROP) makes the client wait until it gives up. A refused connection means the machine itself answered "nobody here", so the network and firewall are fine and the SERVICE is the problem.', 'Timed out. Firewall jo chupchap packets drop karta hai (DROP) client ko intezaar karwata hai jab tak wo haar na maan le. Refused connection ka matlab machine ne khud jawab diya "yahan koi nahi", to network aur firewall theek hain aur SERVICE problem hai.'),
      H('Lab 1: the interface is down', 'Lab 1: interface down hai'),
      CMD(['sudo ip link set eth0 down', 'ping -c 1 192.168.1.1', 'curl -m 3 example.com', 'ip -br link'], 'Symptom: "Network is unreachable" for everything, even the gateway. Rung 1: eth0 shows DOWN.', 'Lakshan: har cheez ke liye "Network is unreachable", gateway tak ke liye bhi. Seedhi 1: eth0 DOWN dikhta hai.'),
      CMD(['sudo ip link set eth0 up', 'ping -c 1 8.8.8.8'], 'Fix: bring the link up.', 'Fix: link up karo.'),
      H('Lab 2: DNS is broken', 'Lab 2: DNS toota hua hai'),
      CMD(['sudo sh -c "echo nameserver 10.255.255.1 > /etc/resolv.conf"', 'ping -c 1 8.8.8.8', 'ping -c 1 example.com', 'getent hosts example.com'], 'Symptom: ping by IP works, ping by name fails with "Temporary failure in name resolution". Rungs 1-4 are fine and rung 5 fails: classic DNS fault.', 'Lakshan: IP se ping chalta hai, naam se "Temporary failure in name resolution" ke saath fail. Seedhi 1-4 theek hain aur seedhi 5 fail: classic DNS fault.'),
      CMD(['sudo sh -c "echo nameserver 8.8.8.8 > /etc/resolv.conf"', 'ping -c 1 example.com'], 'Fix: point to a working DNS server. (On Ubuntu /etc/resolv.conf is managed by systemd-resolved, so the permanent fix is in netplan nameservers, but the test shows the idea.)', 'Fix: kaam karte DNS server ki taraf point karo. (Ubuntu par /etc/resolv.conf systemd-resolved sambhalta hai, isliye permanent fix netplan nameservers mein hai, par test idea dikhata hai.)'),
      H('Lab 3: no default route', 'Lab 3: default route nahi hai'),
      CMD(['sudo ip route del default', 'ping -c 1 192.168.1.1', 'ping -c 1 8.8.8.8', 'ip route get 8.8.8.8'], 'Symptom: the local gateway answers, but everything beyond says "Network is unreachable". Rung 3-4: no way out.', 'Lakshan: local gateway jawab deta hai, par uske aage sab "Network is unreachable". Seedhi 3-4: bahar jaane ka raasta nahi.'),
      CMD(['sudo ip route add default via 192.168.1.1', 'ping -c 1 8.8.8.8'], 'Fix: restore the default gateway.', 'Fix: default gateway wapas lagao.'),
      H('Lab 4: the service port', 'Lab 4: service ka port'),
      CMD(['sudo apt install -y nginx > /dev/null', 'nc -zv localhost 80', 'sudo systemctl stop nginx', 'nc -zv localhost 80', 'curl -I localhost', 'sudo systemctl start nginx', 'curl -sI localhost | head -n 1'], 'Open: succeeded. Stopped: "Connection refused" (rung 6, the service is down). Start it and it works again. A firewall block would have said timed out instead; that is the next lesson.', 'Open: succeeded. Stopped: "Connection refused" (seedhi 6, service down). Start karo to phir chalta hai. Firewall block hota to timed out kehta; wo agla lesson hai.'),
      H('Packet-level tools', 'Packet-level tools'),
      TABLE(
        [
          ['nc -zv HOST PORT', 'is the port open? (z = just test, v = say what happened)', 'kya port khula hai? (z = bas test, v = batao kya hua)'],
          ['curl -v http://HOST:PORT/', 'talk HTTP and watch every step', 'HTTP bolo aur har step dekho'],
          ['traceroute example.com  /  tracepath', 'every router hop on the way (where does it stop?)', 'raaste ka har router hop (kahan ruk jata hai?)'],
          ['sudo tcpdump -i eth0 -n port 53', 'watch the actual packets for DNS (the final truth)', 'DNS ke asli packets dekho (aakhri sach)'],
          ['sudo nmap -p 22,80,443 HOST', 'scan which ports are open. Only on machines you own or are allowed to test!', 'kaun se ports khule hain scan karo. Sirf apni ya test ki ijazat wali machines par!'],
          ['ss -s', 'summary of socket counts', 'sockets ki ginti ka saar'],
        ],
        'Tool',
        'Tool'
      ),
      CMD(['sudo apt install -y tcpdump nmap > /dev/null', 'sudo tcpdump -i eth0 -c 3 -n', 'sudo nmap -p 22,80,443 localhost'], 'tcpdump -c 3 captures three packets and stops. nmap shows the state of each port.', 'tcpdump -c 3 teen packets capture karke ruk jata hai. nmap har port ki state dikhata hai.'),
      JOB('A calm routine beats cleverness. Write the ladder on a sticky note: link, IP, gateway, internet, DNS, port, app. When a ticket says "website down" you will check each rung out loud and find the broken one in two minutes, then say what you found in the ticket. That habit is what seniors notice.', 'Shaant routine hoshiyari se behtar hai. Seedhi sticky note par likh lo: link, IP, gateway, internet, DNS, port, app. Ticket mein "website down" likha ho to tum har seedhi zor se check karoge aur do minute mein toota hua hissa dhundh loge, phir ticket mein likhoge kya mila. Seniors ye aadat notice karte hain.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['ip -br link / ip -br addr / ip route', 'rungs 1-3', 'seedhi 1-3'],
        ['ping -c1 GW / ping -c1 8.8.8.8 / ping -c1 NAME', 'rungs 3-5', 'seedhi 3-5'],
        ['nc -zv HOST PORT / curl -v URL', 'rung 6', 'seedhi 6'],
        ['journalctl -u SERVICE', 'rung 7', 'seedhi 7'],
        ['ip route get X', 'which way will X go?', 'X kis raaste jayega?'],
        ['netplan try / apply, nmcli con mod/up', 'permanent config', 'permanent config'],
        ['hostnamectl set-hostname X', 'permanent hostname', 'permanent hostname'],
        ['traceroute / tcpdump / nmap', 'when ping is not enough', 'jab ping kaafi nahi'],
      ]),
    ],
    missions: [
      M('nc-m1', 'Lab: the link is down', 'Lab: link down hai', 'Everything says "Network is unreachable". Find out why and bring the network back, so that ping -c 1 8.8.8.8 works. (Use the lab button.)', 'Har cheez "Network is unreachable" kehti hai. Pata lagao kyun aur network wapas lao, taaki ping -c 1 8.8.8.8 chale. (Lab button use karo.)', 'ip -br link shows eth0 DOWN. Bring it up with ip link set.', 'ip -br link mein eth0 DOWN dikhega. ip link set se up karo.', (sh) => sh.net.ifaces.eth0.up === true && sh.log.some((r) => /ping .*8\.8\.8\.8/.test(r.cmd) && r.code === 0), LAB_LINK.concat(['sudo ip link set eth0 up', 'ping -c 1 8.8.8.8']), { lab: { setup: LAB_LINK, en: 'a server whose network interface was switched off.', hi: 'ek server jiska network interface band kar diya gaya hai.' }, testSolve: LAB_LINK.concat(['sudo ip link set eth0 up', 'ping -c 1 8.8.8.8']) }),
      M('nc-m2', 'Lab: names do not work', 'Lab: naam kaam nahi karte', 'ping 8.8.8.8 works but ping example.com says "Temporary failure in name resolution". Repair the DNS settings so that ping -c 1 example.com works. (Use the lab button.)', 'ping 8.8.8.8 chalta hai par ping example.com "Temporary failure in name resolution" kehta hai. DNS settings theek karo taaki ping -c 1 example.com chale. (Lab button use karo.)', 'cat /etc/resolv.conf shows a dead nameserver. Write nameserver 8.8.8.8 into it with sudo.', 'cat /etc/resolv.conf mein mara hua nameserver dikhega. sudo se usme nameserver 8.8.8.8 likho.', (sh) => !sh.dnsDown() && !!sh.resolveHost('example.com') && sh.log.some((r) => /ping .*example\.com/.test(r.cmd) && r.code === 0), LAB_DNS.concat(['sudo sh -c "echo nameserver 8.8.8.8 > /etc/resolv.conf"', 'ping -c 1 example.com']), { lab: { setup: LAB_DNS, en: 'a server whose DNS server address is dead.', hi: 'ek server jiske DNS server ka address mara hua hai.' }, testSolve: LAB_DNS.concat(['sudo sh -c "echo nameserver 8.8.8.8 > /etc/resolv.conf"', 'ping -c 1 example.com']) }),
      M('nc-m3', 'Lab: the way out is missing', 'Lab: bahar jaane ka raasta gayab', 'The gateway answers ping but nothing beyond it is reachable. Restore the default route (the gateway is 192.168.1.1) so that ping -c 1 8.8.8.8 works. (Use the lab button.)', 'Gateway ping ka jawab deta hai par uske aage kuch reachable nahi. Default route wapas lagao (gateway 192.168.1.1 hai) taaki ping -c 1 8.8.8.8 chale. (Lab button use karo.)', 'ip route shows no default line. Add it with ip route add default via 192.168.1.1.', 'ip route mein default line nahi hai. ip route add default via 192.168.1.1 se jodo.', (sh) => sh.net.routes.some((r) => r.dst === 'default' && r.via === '192.168.1.1') && sh.log.some((r) => /ping .*8\.8\.8\.8/.test(r.cmd) && r.code === 0), LAB_ROUTE.concat(['sudo ip route add default via 192.168.1.1', 'ping -c 1 8.8.8.8']), { lab: { setup: LAB_ROUTE, en: 'a server that lost its default gateway.', hi: 'ek server jisne apna default gateway kho diya.' }, testSolve: LAB_ROUTE.concat(['sudo ip route add default via 192.168.1.1', 'ping -c 1 8.8.8.8']) }),
    ],
    quiz: [
      mcq(1, '`ping 8.8.8.8` works but `ping example.com` fails. Which layer is the likely culprit?', '`ping 8.8.8.8` chalta hai par `ping example.com` fail hota hai. Sabse sambhavit galat layer kaunsi?', ['The cable', 'DNS', 'The gateway', 'The web server'], 1, 'The network reaches the internet by IP, so name resolution (DNS) is what is broken.', 'Network IP se internet tak pahunchta hai, isliye naam resolution (DNS) toota hai.'),
      mcq(2, 'A connection to a port fails with "Connection refused". What does that tell you?', 'Ek port ka connection "Connection refused" ke saath fail hota hai. Ye kya batata hai?', ['A firewall silently drops the packets', 'The machine answered, but no program listens on that port', 'DNS is broken', 'The cable is unplugged'], 1, 'Refused = the host replied "nothing here". Check that the service is running and on the right port.', 'Refused = host ne jawab diya "yahan kuch nahi". Check karo service chal rahi hai aur sahi port par hai.'),
      cmd(3, 'Check which route the kernel will use to reach 8.8.8.8.', 'Check karo kernel 8.8.8.8 tak pahunchne ke liye kaun sa route use karega.', { verify: (sh, r) => /8\.8\.8\.8 via 192\.168\.1\.1 dev eth0/.test(r.out), sample: 'ip route get 8.8.8.8', wrong: ['ip route'], hintEn: 'ip route, a verb that asks about one destination.', hintHi: 'ip route, ek verb jo ek destination ke baare mein puchta hai.' }, 'ip route get answers like the kernel does.', 'ip route get kernel ki tarah jawab deta hai.'),
      cmd(4, 'Test if TCP port 22 is open on localhost without sending any data (verbose).', 'Bina data bheje check karo ki localhost par TCP port 22 khula hai (verbose).', { verify: (sh, r) => /succeeded/.test(r.out + r.all) && /22/.test(r.all), sample: 'nc -zv localhost 22', alt: ['nc -vz localhost 22'], wrong: ['nc localhost 22'], hintEn: 'nc with -z (zero I/O scan) and -v.', hintHi: 'nc ke saath -z (zero I/O scan) aur -v.' }, 'nc -zv checks a port and says succeeded or failed.', 'nc -zv port check karta hai aur succeeded ya failed batata hai.'),
      cmd(5, 'Give this machine the permanent-style hostname db01 (with the right tool).', 'Is machine ko permanent hostname db01 do (sahi tool se).', { verify: (sh) => sh.hostname === 'db01', sample: 'sudo hostnamectl set-hostname db01', alt: ['sudo hostnamectl hostname db01'], wrong: ['hostname db01'], hintEn: 'hostnamectl with set-hostname.', hintHi: 'hostnamectl, set-hostname ke saath.' }, 'hostnamectl set-hostname writes /etc/hostname so it survives reboot.', 'hostnamectl set-hostname /etc/hostname likhta hai isliye reboot ke baad rehta hai.'),
      cmd(6, 'LAB: the interface is down. Bring eth0 back up.', 'LAB: interface down hai. eth0 ko wapas up karo.', { setup: LAB_LINK, verify: (sh) => sh.net.ifaces.eth0.up === true, sample: 'sudo ip link set eth0 up', alt: ['sudo ip link set dev eth0 up'], wrong: ['ip -br link'], hintEn: 'ip link set ... up', hintHi: 'ip link set ... up' }, 'ip link set eth0 up switches the interface on.', 'ip link set eth0 up interface chalu karta hai.'),
      cmd(7, 'LAB: names do not resolve (ping by IP works). Fix /etc/resolv.conf so it uses the nameserver 1.1.1.1.', 'LAB: naam resolve nahi hote (IP se ping chalta hai). /etc/resolv.conf theek karo taaki wo nameserver 1.1.1.1 use kare.', { setup: LAB_DNS, verify: (sh) => !sh.dnsDown() && /nameserver 1\.1\.1\.1/.test(LX.cat(sh, '/etc/resolv.conf')), sample: 'sudo sh -c "echo nameserver 1.1.1.1 > /etc/resolv.conf"', alt: ['echo "nameserver 1.1.1.1" | sudo tee /etc/resolv.conf'], wrong: ['echo "nameserver 1.1.1.1" > /etc/resolv.conf'], hintEn: 'Overwrite the file as root (remember the redirect trap from the sudo lesson).', hintHi: 'File root ban kar overwrite karo (sudo lesson ka redirect jaal yaad rakho).' }, 'A dead nameserver means every name lookup fails.', 'Mara hua nameserver matlab har naam lookup fail.'),
      cmd(8, 'LAB: the default route is missing. Add it back through the gateway 192.168.1.1.', 'LAB: default route gayab hai. Use gateway 192.168.1.1 ke through wapas jodo.', { setup: LAB_ROUTE, verify: (sh) => sh.net.routes.some((r) => r.dst === 'default' && r.via === '192.168.1.1'), sample: 'sudo ip route add default via 192.168.1.1', alt: ['sudo ip route add default via 192.168.1.1 dev eth0'], wrong: ['ip route'], hintEn: 'ip route add default via GATEWAY', hintHi: 'ip route add default via GATEWAY' }, 'The default route is where all non-local traffic goes.', 'Default route wo hai jahan saara non-local traffic jata hai.'),
      mcq(9, 'You must change the IP address of a remote server you are logged into over SSH. Which netplan command protects you from locking yourself out?', 'Tumhe SSH se jude hue remote server ka IP badalna hai. Kaunsi netplan command tumhe khud ko bahar karne se bachati hai?', ['netplan apply', 'netplan try', 'netplan generate', 'netplan get'], 1, 'netplan try rolls back automatically if you do not confirm within the timeout.', 'netplan try timeout mein confirm na karo to apne aap rollback kar deta hai.'),
      cmd(10, 'Boss level: LAB with TWO faults (DNS is dead AND the default route is missing). Fix both and prove it with one ping by NAME in the same line.', 'Boss level: LAB mein DO kharabiyaan (DNS mara hua AUR default route gayab). Dono theek karo aur usi line mein NAAM se ek ping se saabit karo.', { setup: LAB_DNS.concat(LAB_ROUTE), verify: (sh, r) => !sh.dnsDown() && sh.net.routes.some((x) => x.dst === 'default') && /1 received/.test(r.out), sample: 'sudo ip route add default via 192.168.1.1 && sudo sh -c "echo nameserver 8.8.8.8 > /etc/resolv.conf" && ping -c 1 example.com', alt: ['sudo sh -c "echo nameserver 8.8.8.8 > /etc/resolv.conf"; sudo ip route add default via 192.168.1.1; ping -c 1 example.com'], wrong: ['ping -c 1 example.com'], hintEn: 'Two fixes joined by && then the ping.', hintHi: 'Do fixes && se jude, phir ping.' }, 'The ladder: route first (rung 3), then DNS (rung 5), then test.', 'Seedhi: pehle route (seedhi 3), phir DNS (seedhi 5), phir test.'),
    ],
  });
})();
