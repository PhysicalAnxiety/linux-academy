(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, JOB, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'netbasics',
    part: 3,
    no: 22,
    key: 'ip addr',
    mins: 45,
    title: T('Networking Fundamentals: IP, Subnets, Ports, DNS', 'Networking ke Buniyadi Concepts: IP, Subnets, Ports, DNS'),
    blurb: T('How computers find each other: IP addresses, subnet masks and CIDR, gateways, ports, and how DNS turns names into numbers. Learn to read your machine\'s network in 10 seconds.', 'Computers ek doosre ko kaise dhundte hain: IP addresses, subnet masks aur CIDR, gateways, ports, aur DNS naam ko number mein kaise badalta hai. Apni machine ka network 10 second mein padhna seekho.'),
    blocks: [
      BIG(
        'Almost every server job touches the network: a website that will not load, an SSH login that times out, a database nobody can reach. To fix those you need a clear mental picture of five things: the **IP address** (where a machine lives), the **subnet** (its neighbourhood), the **gateway** (the door to the outside), the **port** (which program on that machine) and **DNS** (the phone book that turns names into addresses).',
        'Lagbhag har server ke kaam mein network aata hai: website load nahi ho rahi, SSH login time out ho raha hai, database tak koi nahi pahunch pa raha. Inhe theek karne ke liye paanch cheezon ki saaf tasveer dimaag mein chahiye: **IP address** (machine kahan rehti hai), **subnet** (uska mohalla), **gateway** (bahar ka darwaza), **port** (us machine par kaun sa program) aur **DNS** (phone book jo naam ko address mein badalti hai).'
      ),
      STORY('Sending a letter. The IP address is the house address. The subnet is your colony: letters inside the colony go door to door. Anything for another city goes to the colony\'s post office, the gateway. The port is the flat or department number inside the building: the same house (computer) can run a web shop on flat 80 and a mail desk on flat 25. DNS is the phone book: you know the shop is called "example.com", the phone book tells you its house address.', 'Chitthi bhejna. IP address ghar ka pata hai. Subnet tumhari colony hai: colony ke andar chitthiyaan ghar-ghar jati hain. Doosre sheher ki cheez colony ke post office, yaani gateway, ke paas jati hai. Port building ke andar flat ya department number hai: ek hi ghar (computer) flat 80 par web shop aur flat 25 par mail desk chala sakta hai. DNS phone book hai: tumhe pata hai dukaan ka naam "example.com" hai, phone book uska ghar ka pata batati hai.'),
      H('Look at your machine\'s network', 'Apni machine ka network dekho'),
      CMD(['ip -br addr', 'ip route', 'cat /etc/resolv.conf'], 'Three commands, the whole picture: your addresses, where traffic goes, and which DNS server answers name questions. `ip` replaced the old ifconfig and route.', 'Teen commands, poori tasveer: tumhare addresses, traffic kahan jata hai, aur naam ke sawaal ka jawab kaun si DNS server deta hai. `ip` ne purane ifconfig aur route ki jagah li.'),
      ANAT([
        ['eth0', 'cmd', 'the network interface (the "plug"). lo is the loopback, a private plug to yourself.', 'network interface (plug). lo loopback hai, apne aap tak ka private plug.'],
        ['UP', 'opt', 'link state: UP means the cable/link is working', 'link state: UP matlab cable/link kaam kar raha hai'],
        ['192.168.1.10/24', 'arg', 'the IP address and its prefix length (the subnet size, see below)', 'IP address aur uska prefix length (subnet ka size, neeche dekho)'],
        ['default via 192.168.1.1', 'op', 'the gateway: anything not in my subnet goes here', 'gateway: jo mere subnet mein nahi wo yahan jata hai'],
      ]),
      H('IPv4 addresses and the /24 mystery', 'IPv4 addresses aur /24 ka raaz'),
      P('An IPv4 address is four numbers from 0 to 255 (four bytes, 32 bits). The number after the slash, the **prefix length**, says how many of those 32 bits identify the **network**; the rest identify the **host** inside it. So `/24` means "the first 24 bits (the first three numbers) are the network".', 'IPv4 address 0 se 255 ke chaar numbers hain (chaar bytes, 32 bits). Slash ke baad ka number, **prefix length**, batata hai ki in 32 bits mein kitne **network** pehchante hain; baaki uske andar ka **host** pehchante hain. To `/24` matlab "pehle 24 bits (pehle teen numbers) network hain".'),
      PRE(`192.168.1.10/24
   network part        host part
 192 . 168 . 1   .   10          <- the first three numbers name the network
 11000000.10101000.00000001 . 00001010
 \\______ 24 bits (network) ______/ \\_ 8 bits (host) _/

 Same network: 192.168.1.1 ... 192.168.1.254   (direct, no gateway needed)
 Different network: 192.168.2.5 or 8.8.8.8      (goes via the gateway)`),
      TABLE(
        [
          ['/8', '16,777,214 hosts   (255.0.0.0)', 'bahut bada (255.0.0.0)'],
          ['/16', '65,534 hosts   (255.255.0.0)', '65,534 hosts (255.255.0.0)'],
          ['/24', '254 hosts   (255.255.255.0)  the classic home or office LAN', '254 hosts (255.255.255.0) classic ghar ya office LAN'],
          ['/25', '126 hosts', '126 hosts'],
          ['/26', '62 hosts', '62 hosts'],
          ['/27', '30 hosts', '30 hosts'],
          ['/28', '14 hosts', '14 hosts'],
          ['/30', '2 hosts: point-to-point links', '2 hosts: point-to-point links'],
        ],
        'Prefix',
        'Prefix'
      ),
      TIP('The trick: hosts = 2^(32 - prefix) - 2. The minus 2 is because the first address names the network itself and the last one is the broadcast address. /27 gives 2^5 - 2 = 30. Do this sum in your head in an interview and people nod.', 'Trick: hosts = 2^(32 - prefix) - 2. Minus 2 isliye ki pehla address network ka naam hai aur aakhri broadcast address. /27 se 2^5 - 2 = 30. Interview mein ye hisaab dimaag mein karo to log sar hilate hain.'),
      CMD(['sudo apt install -y ipcalc', 'ipcalc 192.168.10.37/26'], 'ipcalc does the sum for you: network address, broadcast, first and last usable host. Here 192.168.10.37/26 lives in 192.168.10.0 - 192.168.10.63.', 'ipcalc hisaab tumhare liye karta hai: network address, broadcast, pehla aur aakhri usable host. Yahan 192.168.10.37/26 192.168.10.0 - 192.168.10.63 mein rehta hai.'),
      H('Private and special addresses', 'Private aur khaas addresses'),
      TABLE(
        [
          ['10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16', 'PRIVATE ranges (RFC 1918): used inside homes, offices and clouds, never routed on the public internet', 'PRIVATE ranges (RFC 1918): ghar, office aur cloud ke andar, public internet par route nahi hote'],
          ['127.0.0.1  (localhost)', 'loopback: "this very machine". Used to test a service locally.', 'loopback: "ye hi machine". Service ko local test karne ke liye.'],
          ['169.254.0.0/16', 'link-local: what a machine gives itself when DHCP failed. Seeing it = network problem.', 'link-local: DHCP fail hone par machine khud ko ye deti hai. Ye dikhe = network problem.'],
          ['0.0.0.0', 'any address (a server "listening on 0.0.0.0" accepts connections on every interface)', 'koi bhi address (server "0.0.0.0 par listen" kare to har interface par connection leta hai)'],
        ],
        'Address',
        'Address'
      ),
      THINK('is 172.20.5.9 a private address?', 'kya 172.20.5.9 private address hai?', 'Yes. The private 172 range is 172.16.0.0 to 172.31.255.255, and 20 is inside 16..31. (172.32.x.x would be public.)', 'Haan. Private 172 range 172.16.0.0 se 172.31.255.255 hai, aur 20, 16..31 ke andar hai. (172.32.x.x public hota.)'),
      FUN('IPv6 fixes the shortage of IPv4 addresses with 128-bit addresses like `2606:2800:21f:cb07::1`. fe80:: addresses are link-local, `::1` is localhost, and a `/64` is the standard size of a subnet. You do not need to calculate in IPv6 for a first job, but you must recognise it.', 'IPv6 IPv4 addresses ki kami ko 128-bit addresses se theek karta hai, jaise `2606:2800:21f:cb07::1`. fe80:: addresses link-local hain, `::1` localhost hai, aur `/64` subnet ka standard size hai. Pehli naukri mein IPv6 ka hisaab nahi chahiye, par pehchanna zaroor aana chahiye.'),
      H('Ports: which program?', 'Ports: kaun sa program?'),
      P('An IP address gets a packet to the right MACHINE; a **port** (0 to 65535) gets it to the right PROGRAM on that machine. A server **listens** on a port and clients connect to it. **TCP** is reliable (like a phone call: connect, talk, hang up) and **UDP** is fire-and-forget (like postcards, used by DNS and video).', 'IP address packet ko sahi MACHINE tak pahunchata hai; **port** (0 se 65535) use us machine ke sahi PROGRAM tak. Server ek port par **listen** karta hai aur clients usse connect hote hain. **TCP** bharosemand hai (phone call jaisa: connect, baat, band) aur **UDP** fire-and-forget hai (postcards jaisa, DNS aur video use karte hain).'),
      TABLE(
        [
          ['22 / tcp', 'SSH: secure remote login', 'SSH: secure remote login'],
          ['80 / tcp  and  443 / tcp', 'HTTP and HTTPS: websites', 'HTTP aur HTTPS: websites'],
          ['53 / udp+tcp', 'DNS: names to addresses', 'DNS: naam se address'],
          ['25 / tcp  (587, 465)', 'SMTP: sending mail', 'SMTP: mail bhejna'],
          ['3306 / tcp', 'MySQL / MariaDB', 'MySQL / MariaDB'],
          ['5432 / tcp', 'PostgreSQL', 'PostgreSQL'],
          ['6379 / tcp', 'Redis', 'Redis'],
          ['123 / udp', 'NTP: time synchronisation', 'NTP: time synchronisation'],
          ['3389 / tcp', 'RDP: Windows remote desktop', 'RDP: Windows remote desktop'],
        ],
        'Port',
        'Port'
      ),
      CMD(['ss -tuln', 'grep -w ssh /etc/services', 'grep -w https /etc/services'], 'ss shows listening sockets: -t TCP, -u UDP, -l listening, -n numbers instead of names. Which programs listen on this machine? /etc/services is the list of well-known port names.', 'ss listening sockets dikhata hai: -t TCP, -u UDP, -l listening, -n naam ki jagah numbers. Is machine par kaun se programs listen kar rahe hain? /etc/services jaane-pehchane port naamon ki list hai.'),
      CMD(['sudo ss -tulpn'], 'Add -p (and sudo) to see WHICH process owns each port. First question on any "service not reachable" problem: is anything even listening?', '-p jodo (aur sudo) to dekho har port kis PROCESS ka hai. Har "service reachable nahi" problem ka pehla sawaal: kya koi listen bhi kar raha hai?'),
      H('DNS: from name to number', 'DNS: naam se number'),
      P('Computers talk in numbers; people use names. When you type example.com the machine does a **lookup**. The order is set in /etc/nsswitch.conf: first the local file **/etc/hosts**, then DNS servers listed in **/etc/resolv.conf**.', 'Computers numbers mein baat karte hain; log naam use karte hain. Tum example.com type karte ho to machine **lookup** karti hai. Order /etc/nsswitch.conf mein tay hota hai: pehle local file **/etc/hosts**, phir **/etc/resolv.conf** mein likhi DNS servers.'),
      CMD(['grep ^hosts /etc/nsswitch.conf', 'cat /etc/hosts', 'getent hosts example.com'], 'getent resolves a name the SAME way programs do (hosts file first, then DNS), so it is the honest test. dig and nslookup talk to DNS directly and skip /etc/hosts.', 'getent naam ko WAISE hi resolve karta hai jaise programs karte hain (pehle hosts file, phir DNS), isliye wo imaandar test hai. dig aur nslookup seedha DNS se baat karte hain aur /etc/hosts chhod dete hain.'),
      TABLE(
        [
          ['A', 'name to IPv4 address', 'naam se IPv4 address'],
          ['AAAA', 'name to IPv6 address', 'naam se IPv6 address'],
          ['CNAME', 'alias: this name is another name', 'alias: ye naam kisi aur naam ka hai'],
          ['MX', 'which servers receive mail for the domain', 'domain ki mail kaun se servers lete hain'],
          ['NS', 'which servers are the authority for the domain', 'domain ke liye authority kaun se servers hain'],
          ['TXT', 'free text: SPF, domain verification', 'free text: SPF, domain verification'],
          ['PTR', 'reverse lookup: address to name', 'reverse lookup: address se naam'],
        ],
        'Record',
        'Record'
      ),
      CMD(['sudo apt install -y dnsutils', 'dig example.com +short', 'dig MX example.com +short', 'dig example.com', 'dig -x 93.184.215.14 +short', 'host example.com'], 'dig is the admin\'s DNS microscope: +short prints only the answer; the full output shows the question, the answer, the TTL (how long to cache) and which server answered.', 'dig admin ka DNS microscope hai: +short sirf jawab print karta hai; poora output sawaal, jawab, TTL (kitni der cache) aur kis server ne jawab diya dikhata hai.'),
      CMD(['dig @8.8.8.8 example.com +short', 'nslookup example.com', 'resolvectl status | head -n 8'], 'Ask a specific DNS server with @server. resolvectl shows what systemd-resolved is using on modern Ubuntu.', '@server se kisi khaas DNS server se pucho. resolvectl dikhata hai ki modern Ubuntu par systemd-resolved kya use kar raha hai.'),
      TIP('/etc/hosts is the quickest way to test: map a name to an IP on one machine only, for example `192.168.1.50 intranet.local`, without touching DNS. Also the classic trick to test a website on a new server before the real DNS change.', '/etc/hosts test karne ka sabse tez tareeka hai: sirf ek machine par naam ko IP se jodo, jaise `192.168.1.50 intranet.local`, DNS ko chhue bina. Asli DNS badalne se pehle nayi server par website test karne ka classic trick bhi.'),
      H('The layers in one picture (a classic interview question)', 'Layers ek tasveer mein (classic interview sawaal)'),
      TABLE(
        [
          ['Application', 'HTTP, DNS, SSH, SMTP: what the programs say', 'curl, dig, ssh, telnet/nc'],
          ['Transport', 'TCP / UDP and ports: who gets the data and how reliably', 'ss, nc, nmap'],
          ['Internet', 'IP addresses and routing: how to reach another network', 'ip addr, ip route, ping, traceroute'],
          ['Link', 'Ethernet / Wi-Fi, MAC addresses: the physical hop', 'ip link, ip neigh, arp'],
        ],
        'Layer',
        'Layer'
      ),
      JOB('A junior who can say "I check the layers bottom-up: link, IP, gateway, DNS, port, then the app" sounds like someone who has debugged real outages. The next lesson turns that sentence into a routine you can run on any machine.', 'Jo junior kehta hai "main layers neeche se upar check karta hoon: link, IP, gateway, DNS, port, phir app" wo aisa lagta hai jisne asli outages debug kiye hain. Agla lesson us vaakya ko ek routine banata hai jo kisi bhi machine par chalega.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['ip -br addr / ip route / ip neigh', 'addresses, routes, neighbours', 'addresses, routes, padosi'],
        ['hostname -I', 'just my IP addresses', 'sirf mere IP addresses'],
        ['ss -tulpn', 'who listens on which port', 'kaun kis port par listen kar raha hai'],
        ['getent hosts NAME', 'resolve like programs do', 'programs jaise resolve karo'],
        ['dig NAME [TYPE] +short', 'DNS query', 'DNS query'],
        ['cat /etc/resolv.conf /etc/hosts', 'resolver settings', 'resolver settings'],
        ['ipcalc IP/PREFIX', 'subnet sums', 'subnet ka hisaab'],
        ['hosts = 2^(32-prefix) - 2', 'the sum to remember', 'yaad rakhne wala hisaab'],
      ]),
    ],
    missions: [
      M('nb-m1', 'Read your own network', 'Apna network padho', 'Save your machine\'s IPv4 address (just the address, no /24) into the file ~/myip.txt and the default gateway address into ~/gw.txt, using ip and awk/cut instead of typing them.', 'Apni machine ka IPv4 address (sirf address, /24 nahi) ~/myip.txt mein aur default gateway address ~/gw.txt mein save karo, type karne ke bajay ip aur awk/cut se.', 'ip -4 -br addr show eth0 | awk \'{print $3}\' | cut -d/ -f1 > myip.txt   and   ip route | awk \'/default/ {print $3}\' > gw.txt', 'ip -4 -br addr show eth0 | awk \'{print $3}\' | cut -d/ -f1 > myip.txt   aur   ip route | awk \'/default/ {print $3}\' > gw.txt', (sh) => LX.cat(sh, '~/myip.txt').trim() === '192.168.1.10' && LX.cat(sh, '~/gw.txt').trim() === '192.168.1.1', ["ip -4 -br addr show eth0 | awk '{print $3}' | cut -d/ -f1 > myip.txt", "ip route | awk '/default/ {print $3}' > gw.txt"]),
      M('nb-m2', 'Your own phone book', 'Tumhari apni phone book', 'Add an entry to /etc/hosts that maps the name intranet.local to 192.168.1.50, then prove that it resolves with getent hosts.', '/etc/hosts mein intranet.local ko 192.168.1.50 se jodne wali entry daalo, phir getent hosts se saabit karo ki wo resolve hoti hai.', 'echo "192.168.1.50 intranet.local" | sudo tee -a /etc/hosts, then getent hosts intranet.local', 'echo "192.168.1.50 intranet.local" | sudo tee -a /etc/hosts, phir getent hosts intranet.local', (sh) => /^192\.168\.1\.50\s+intranet\.local/m.test(LX.cat(sh, '/etc/hosts')) && sh.log.some((r) => /getent hosts intranet\.local/.test(r.cmd) && /192\.168\.1\.50/.test(r.out)), ['echo "192.168.1.50 intranet.local" | sudo tee -a /etc/hosts', 'getent hosts intranet.local']),
      M('nb-m3', 'DNS detective', 'DNS detective', 'Install dnsutils and save only the IPv4 address of example.com, found with dig +short, into ~/example-ip.txt.', 'dnsutils install karo aur example.com ka sirf IPv4 address, dig +short se nikalkar, ~/example-ip.txt mein save karo.', 'sudo apt install -y dnsutils; dig example.com +short > example-ip.txt', 'sudo apt install -y dnsutils; dig example.com +short > example-ip.txt', (sh) => LX.cat(sh, '~/example-ip.txt').trim() === '93.184.215.14', ['sudo apt install -y dnsutils', 'dig example.com +short > example-ip.txt']),
    ],
    quiz: [
      mcq(1, 'What is the loopback address that always means "this machine"?', 'Wo loopback address kaunsa hai jo hamesha "ye machine" ka matlab rakhta hai?', ['192.168.1.1', '127.0.0.1', '0.0.0.0', '10.0.0.1'], 1, '127.0.0.1 (localhost) is the machine itself.', '127.0.0.1 (localhost) machine khud hai.'),
      mcq(2, 'Which of these is a PRIVATE address?', 'Inmein se kaunsa PRIVATE address hai?', ['8.8.8.8', '192.168.45.7', '93.184.215.14', '172.32.0.1'], 1, '192.168.0.0/16 is private. 172.32.x.x is outside the private 172.16-172.31 range.', '192.168.0.0/16 private hai. 172.32.x.x private 172.16-172.31 range ke bahar hai.'),
      mcq(3, 'How many usable host addresses does a /27 network have?', '/27 network mein kitne usable host addresses hote hain?', ['27', '30', '32', '62'], 1, '2^(32-27) - 2 = 32 - 2 = 30.', '2^(32-27) - 2 = 32 - 2 = 30.'),
      cmd(4, 'Show your IP addresses in the short table format.', 'Apne IP addresses short table format mein dikhao.', { verify: (sh, r) => /eth0\s+UP\s+192\.168\.1\.10\/24/.test(r.out), sample: 'ip -br addr', alt: ['ip -brief address', 'ip -br a'], wrong: ['ip route'], hintEn: 'ip with the -br (brief) flag and addr.', hintHi: 'ip, -br (brief) flag aur addr.' }, '-br gives one compact line per interface.', '-br har interface ki ek compact line deta hai.'),
      cmd(5, 'Print ONLY your default gateway address (just the number) using ip and awk.', 'ip aur awk se SIRF apna default gateway address (bas number) print karo.', { verify: (sh, r) => r.out.trim() === '192.168.1.1', sample: "ip route | awk '/default/ {print $3}'", alt: ['ip route show default | awk \'{print $3}\'', "ip -4 route | grep default | cut -d' ' -f3"], wrong: ['ip route'], hintEn: 'The default line looks like: default via 192.168.1.1 dev eth0 ... so you want the 3rd word.', hintHi: 'Default line aisi dikhti hai: default via 192.168.1.1 dev eth0 ... to tumhe 3rd shabd chahiye.' }, 'Field 3 of the default route line is the gateway.', 'Default route line ka field 3 gateway hai.'),
      mcq(6, 'Which port does HTTPS use by default?', 'HTTPS default mein kaunsa port use karta hai?', ['21', '25', '443', '8080'], 2, 'HTTPS = 443, HTTP = 80.', 'HTTPS = 443, HTTP = 80.'),
      cmd(7, 'List all LISTENING TCP and UDP sockets with numeric ports.', 'Saare LISTENING TCP aur UDP sockets numeric ports ke saath list karo.', { verify: (sh, r, c) => /:22\b/.test(r.out) && /\bss\s+(-\w+\s+)*-\w*l/.test(c) && /\bss\s+(-\w+\s+)*-\w*n/.test(c), sample: 'ss -tuln', alt: ['ss -ltun', 'sudo ss -tulpn'], wrong: ['ss'], hintEn: 'ss with t, u, l, n flags.', hintHi: 'ss ke saath t, u, l, n flags.' }, 't = TCP, u = UDP, l = listening, n = numeric.', 't = TCP, u = UDP, l = listening, n = numeric.'),
      cmd(8, 'Make the name wiki.local point to 10.1.2.3 on this machine only.', 'Naam wiki.local ko sirf is machine par 10.1.2.3 par point karao.', { verify: (sh) => /^10\.1\.2\.3\s+wiki\.local/m.test(LX.cat(sh, '/etc/hosts')) && sh.resolveHost('wiki.local') === '10.1.2.3', sample: 'echo "10.1.2.3 wiki.local" | sudo tee -a /etc/hosts', alt: ['sudo sh -c \'echo "10.1.2.3 wiki.local" >> /etc/hosts\''], wrong: ['echo "10.1.2.3 wiki.local" > /etc/hosts'], hintEn: 'Append a line to /etc/hosts as root.', hintHi: 'Root ban kar /etc/hosts mein ek line append karo.' }, '/etc/hosts is read before DNS.', '/etc/hosts DNS se pehle padhi jati hai.'),
      cmd(9, 'Find the mail servers (MX records) of example.com using dig, showing only the answer lines. Install dnsutils first if needed.', 'dig se example.com ke mail servers (MX records) dhundo, sirf jawab ki lines dikhao. Zaroorat ho to pehle dnsutils install karo.', { setup: ['sudo apt install -y dnsutils'], verify: (sh, r) => /^10 mail\.example\.com\.$/m.test(r.out) && !/DiG/.test(r.out), sample: 'dig MX example.com +short', alt: ['dig example.com MX +short', 'dig -t MX example.com +short'], wrong: ['dig example.com +short'], hintEn: 'dig, the record type MX, the domain, and +short.', hintHi: 'dig, record type MX, domain aur +short.' }, 'MX records say who receives mail; +short hides the decoration.', 'MX records batate hain mail kaun leta hai; +short sajawat chhupata hai.'),
      cmd(10, 'Boss level: which subnet does 192.168.10.37/26 belong to? Use ipcalc (install it first, in the same line) and show only the Network line.', 'Boss level: 192.168.10.37/26 kis subnet ka hai? ipcalc use karo (usi line mein pehle install karo) aur sirf Network wali line dikhao.', { verify: (sh, r) => /192\.168\.10\.0\/26/.test(r.out) && r.out.trim().split('\n').length === 1, sample: 'sudo apt install -y ipcalc >/dev/null && ipcalc 192.168.10.37/26 | grep Network', alt: ['sudo apt install -y ipcalc > /dev/null; ipcalc 192.168.10.37/26 | grep -i network'], wrong: ['sudo apt install -y ipcalc'], hintEn: 'Install quietly, run ipcalc, grep for Network.', hintHi: 'Chupchap install, ipcalc chalao, Network ke liye grep.' }, '192.168.10.37 is inside the /26 block that starts at 192.168.10.0.', '192.168.10.37 us /26 block mein hai jo 192.168.10.0 se shuru hota hai.'),
    ],
  });
})();
