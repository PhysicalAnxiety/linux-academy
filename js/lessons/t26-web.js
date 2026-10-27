(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, JOB, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  const SITE = (name, root, extra) => `server {\\n    listen 80;\\n    server_name ${name};\\n    root ${root};\\n    index index.html;\\n${extra || ''}}\\n`;
  const M1 = [
    'sudo apt install -y nginx',
    'sudo mkdir -p /var/www/blog',
    'echo "<h1>Hello Blog</h1>" | sudo tee /var/www/blog/index.html',
    `printf "${SITE('blog.local', '/var/www/blog')}" | sudo tee /etc/nginx/sites-available/blog`,
    'sudo ln -s /etc/nginx/sites-available/blog /etc/nginx/sites-enabled/blog',
    'sudo nginx -t',
    'sudo systemctl reload nginx',
    'echo "127.0.0.1 blog.local" | sudo tee -a /etc/hosts',
    'curl -s http://blog.local',
  ];
  const LAB403 = [
    'sudo apt install -y nginx',
    'sudo mkdir -p /var/www/vault',
    'echo "<h1>Secret page</h1>" | sudo tee /var/www/vault/index.html',
    `printf "${SITE('vault.local', '/var/www/vault')}" | sudo tee /etc/nginx/conf.d/vault.conf`,
    'sudo chmod 700 /var/www/vault',
    'sudo chown root:root /var/www/vault',
    'sudo chmod 600 /var/www/vault/index.html',
    'sudo chown root:root /var/www/vault/index.html',
    'sudo systemctl reload nginx',
    'echo "127.0.0.1 vault.local" | sudo tee -a /etc/hosts',
  ];
  const TLS = [
    'sudo apt install -y nginx',
    'sudo mkdir -p /var/www/shop',
    'echo "<h1>secure shop</h1>" | sudo tee /var/www/shop/index.html',
    'sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/ssl/private/shop.key -out /etc/ssl/certs/shop.crt -subj "/CN=shop.local"',
    'printf "server {\\n    listen 443 ssl;\\n    server_name shop.local;\\n    ssl_certificate /etc/ssl/certs/shop.crt;\\n    ssl_certificate_key /etc/ssl/private/shop.key;\\n    root /var/www/shop;\\n}\\nserver {\\n    listen 80;\\n    server_name shop.local;\\n    return 301 https://\\$host\\$request_uri;\\n}\\n" | sudo tee /etc/nginx/conf.d/shop.conf',
    'sudo nginx -t',
    'sudo systemctl reload nginx',
    'echo "127.0.0.1 shop.local" | sudo tee -a /etc/hosts',
    'curl -sk https://shop.local',
  ];

  LX.topics.push({
    id: 'web',
    part: 3,
    no: 26,
    key: 'nginx',
    mins: 55,
    title: T('Running a Web Server: nginx, Virtual Hosts, Proxy and HTTPS', 'Web Server chalana: nginx, Virtual Hosts, Proxy aur HTTPS'),
    blurb: T('Serve websites like a real admin: install nginx, host several sites on one server, put an app behind a reverse proxy, turn on HTTPS and diagnose 403, 404 and 502 errors.', 'Asli admin ki tarah websites serve karo: nginx install karo, ek server par kai sites chalao, app ko reverse proxy ke peeche rakho, HTTPS chalu karo aur 403, 404, 502 errors diagnose karo.'),
    blocks: [
      BIG(
        'A **web server** is a program that listens on port 80 or 443 and answers HTTP requests with files or with the output of another program. Hosting websites and applications is the daily bread of Linux servers, so you must be able to install one, configure it, put HTTPS on it and read its logs. We use **nginx**, the most popular choice; Apache works on the same ideas.',
        '**Web server** ek program hai jo port 80 ya 443 par sunta hai aur HTTP requests ka jawab files se ya kisi aur program ke output se deta hai. Websites aur applications host karna Linux servers ki roji-roti hai, isliye tumhe ek install, configure, usme HTTPS lagana aur uske logs padhna aana chahiye. Hum **nginx** use karte hain, sabse popular vikalp; Apache bhi inhi ideas par chalta hai.'
      ),
      STORY('A restaurant with several dining rooms. The front desk (nginx) greets each guest and asks "which restaurant did you book?". That is the **server_name** / Host header. The guest is taken to the right room (a **server block** or **virtual host**), where a waiter either brings a dish from the shelf (a static file) or phones the kitchen in the back (a **reverse proxy** to an application) and brings that.', 'Kai dining rooms wala restaurant. Front desk (nginx) har guest ka swagat karta hai aur puchta hai "aapne kaun sa restaurant book kiya?". Wo **server_name** / Host header hai. Guest ko sahi kamre (**server block** ya **virtual host**) mein le jate hain, jahan waiter ya shelf se dish laata hai (static file) ya peeche kitchen ko phone karta hai (application ko **reverse proxy**) aur wahi laata hai.'),
      H('HTTP in 60 seconds', '60 second mein HTTP'),
      P('A browser (or curl) sends a **request**: a method (GET to read, POST to send data), a path and headers such as **Host**. The server answers with a **status code**, headers and a body. The status code is the first thing an admin reads.', 'Browser (ya curl) ek **request** bhejta hai: method (GET padhne ke liye, POST data bhejne ke liye), path aur **Host** jaise headers. Server **status code**, headers aur body se jawab deta hai. Admin sabse pehle status code padhta hai.'),
      TABLE(
        [
          ['200 OK', 'worked', 'chal gaya'],
          ['301 / 302', 'redirect: look at the Location header', 'redirect: Location header dekho'],
          ['403 Forbidden', 'the server found it but may not show it: FILE PERMISSIONS (or SELinux / allow-deny rules)', 'server ko mila par dikha nahi sakta: FILE PERMISSIONS (ya SELinux / allow-deny rules)'],
          ['404 Not Found', 'wrong path or file missing: check root and the file name', 'galat path ya file gayab: root aur file naam check karo'],
          ['500 Internal Server Error', 'the application crashed: read the APPLICATION log', 'application crash: APPLICATION ka log padho'],
          ['502 Bad Gateway', 'nginx could not reach the backend app behind it: is the app running, on the right port?', 'nginx peeche ke backend app tak nahi pahunch paya: app chal raha hai, sahi port par?'],
          ['503 Service Unavailable', 'overloaded or in maintenance', 'overloaded ya maintenance mein'],
        ],
        'Status',
        'Status'
      ),
      H('Install and look around', 'Install karo aur dekho'),
      CMD(['sudo apt install -y nginx', 'systemctl is-active nginx', 'curl -I localhost', 'curl -s localhost | head -n 5'], 'The package installs, starts and enables the service. The default welcome page proves it works. -I asks for the headers only.', 'Package install, start aur enable karta hai. Default welcome page saabit karti hai ki chal raha hai. -I sirf headers maangta hai.'),
      TABLE(
        [
          ['/etc/nginx/nginx.conf', 'the main file (global settings, includes the others)', 'main file (global settings, baaki ko include karti hai)'],
          ['/etc/nginx/sites-available/', 'all your site definitions (Debian/Ubuntu style)', 'tumhari saari site definitions (Debian/Ubuntu style)'],
          ['/etc/nginx/sites-enabled/', 'symlinks to the sites that are ON', 'jo sites ON hain unke symlinks'],
          ['/etc/nginx/conf.d/*.conf', 'drop-in files (Red Hat style, also works on Ubuntu)', 'drop-in files (Red Hat style, Ubuntu par bhi chalte hain)'],
          ['/var/www/html', 'the default document root', 'default document root'],
          ['/var/log/nginx/access.log, error.log', 'who asked for what / what went wrong', 'kisne kya maanga / kya galat hua'],
        ],
        'Path',
        'Path'
      ),
      H('A virtual host in 8 lines', '8 lines mein virtual host'),
      ANAT([
        ['listen 80;', 'cmd', 'the port to listen on', 'kis port par sunna hai'],
        ['server_name blog.local;', 'opt', 'which Host name this block answers for', 'ye block kis Host naam ke liye jawab deta hai'],
        ['root /var/www/blog;', 'arg', 'the folder with the website files', 'website files wala folder'],
        ['index index.html;', 'arg', 'the file to show for the folder URL /', 'folder URL / par kaun si file dikhani hai'],
        ['location /images/ { ... }', 'op', 'rules for URLs that start with /images/', '/images/ se shuru hone wale URLs ke rules'],
      ]),
      STEPS([
        ['Create the folder and a page: `sudo mkdir -p /var/www/blog` and put an index.html in it.', 'Folder aur page banao: `sudo mkdir -p /var/www/blog` aur usme index.html rakho.'],
        ['Write the server block in `/etc/nginx/sites-available/blog`, and enable it with a symlink into sites-enabled.', '`/etc/nginx/sites-available/blog` mein server block likho, aur sites-enabled mein symlink se enable karo.'],
        ['ALWAYS test: `sudo nginx -t`. Only if it says "test is successful": `sudo systemctl reload nginx`.', 'HAMESHA test karo: `sudo nginx -t`. "test is successful" kahe tabhi: `sudo systemctl reload nginx`.'],
        ['Point a name at this machine (here with /etc/hosts) and test with curl.', 'Naam is machine par point karo (yahan /etc/hosts se) aur curl se test karo.'],
      ]),
      CMD(['sudo mkdir -p /var/www/blog', 'echo "<h1>Hello Blog</h1>" | sudo tee /var/www/blog/index.html', `printf "${SITE('blog.local', '/var/www/blog')}" | sudo tee /etc/nginx/sites-available/blog`, 'sudo ln -s /etc/nginx/sites-available/blog /etc/nginx/sites-enabled/blog', 'sudo nginx -t', 'sudo systemctl reload nginx'], 'The site exists and is switched on. reload re-reads the config WITHOUT dropping connections (restart would).', 'Site hai aur chalu ho gayi. reload config dobara padhta hai connections TOOTE BINA (restart tod deta).'),
      CMD(['echo "127.0.0.1 blog.local" | sudo tee -a /etc/hosts', 'curl -s http://blog.local', 'curl -s -H "Host: nothing.example" localhost | head -n 3'], 'curl blog.local gets the blog. A request with another Host name falls to the default site. That is name-based virtual hosting: one IP, many sites.', 'curl blog.local blog deta hai. Doosre Host naam ki request default site par jati hai. Ye name-based virtual hosting hai: ek IP, kai sites.'),
      CMD(['sudo nginx -t', 'echo "server { listn 80; }" | sudo tee /etc/nginx/conf.d/typo.conf', 'sudo nginx -t', 'sudo rm /etc/nginx/conf.d/typo.conf', 'sudo nginx -t'], 'What the test is for: a typo is caught with a file name and line number BEFORE you touch the running server.', 'Test kis liye hai: typo file naam aur line number ke saath PEHLE pakdi jati hai, chalte server ko chhue bina.'),
      H('Logs tell the story', 'Logs kahani sunate hain'),
      CMD(['curl -s -o /dev/null -w "%{http_code}\\n" http://blog.local/missing', 'sudo tail -n 2 /var/log/nginx/access.log', 'sudo tail -n 1 /var/log/nginx/error.log'], 'A 404 appears in the access log with the status, and the error log explains it (open() ... failed No such file). Read error.log when the status code is not enough.', '404 access log mein status ke saath aata hai, aur error log samjhata hai (open() ... failed No such file). Status code kaafi na ho to error.log padho.'),
      PRE(`127.0.0.1 - - [27/Oct/2026:04:45:57 +0530] "GET /missing HTTP/1.1" 404 146 "-" "curl/8.5.0"
 client      user [   time    ]   request line         status bytes referer user-agent`),
      CMD('sudo awk \'{print $9}\' /var/log/nginx/access.log | sort | uniq -c | sort -rn', 'A classic one-liner: count the status codes. A pile of 5xx means trouble; a pile of 404 from one IP may be a scanner.', 'Classic one-liner: status codes gino. 5xx ka dher matlab museebat; ek IP se 404 ka dher scanner ho sakta hai.'),
      H('Reverse proxy: put an application behind nginx', 'Reverse proxy: application ko nginx ke peeche rakho'),
      P('Real applications (Python, Node, Java) listen on a private port such as 5000 and are not meant to face the internet. nginx stands in front: it handles HTTPS, static files and slow clients and **proxies** the rest with `proxy_pass`.', 'Asli applications (Python, Node, Java) 5000 jaise private port par sunti hain aur internet ke saamne aane ke liye nahi bani. nginx saamne khada hota hai: HTTPS, static files aur dheemi clients sambhalta hai aur baaki `proxy_pass` se **proxy** karta hai.'),
      PRE(`location /api/ {
    proxy_pass http://127.0.0.1:5000/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
}`),
      CMD(['printf "server {\\n    listen 80;\\n    server_name shop.local;\\n    location /api/ { proxy_pass http://127.0.0.1:5000/; }\\n}\\n" | sudo tee /etc/nginx/conf.d/shop.conf', 'sudo nginx -t && sudo systemctl reload nginx', 'echo "127.0.0.1 shop.local" | sudo tee -a /etc/hosts', 'curl -s -o /dev/null -w "%{http_code}\\n" http://shop.local/api/'], 'Nothing runs on port 5000 yet, so nginx answers 502 Bad Gateway: the proxy works, the backend is missing.', 'Port 5000 par abhi kuch nahi chal raha, isliye nginx 502 Bad Gateway deta hai: proxy theek hai, backend gayab.'),
      CMD(['echo "backend says hi" > /tmp/index.html', 'python3 -m http.server 5000 --directory /tmp &', 'curl -s http://shop.local/api/', 'sudo tail -n 1 /var/log/nginx/error.log'], 'Start the "application" (a tiny Python web server) and the same URL works. When the backend is down again, the error log says "connect() failed (111: Connection refused) while connecting to upstream".', '"Application" (chhota Python web server) chalao aur wahi URL chalta hai. Backend phir band ho to error log kehta hai "connect() failed (111: Connection refused) while connecting to upstream".'),
      CMD(['kill %1', 'curl -s -o /dev/null -w "%{http_code}\\n" http://shop.local/api/', 'sudo rm /etc/nginx/conf.d/shop.conf', 'sudo systemctl reload nginx'], 'Stop the backend: 502 again. Then clean up.', 'Backend band karo: phir 502. Phir safai.'),
      H('HTTPS: encryption and trust', 'HTTPS: encryption aur bharosa'),
      P('HTTPS wraps HTTP in TLS. Two things come out of it: **encryption** (nobody on the wire can read or change the traffic) and **identity** (the certificate proves the server really is shop.example.com, signed by an authority your browser trusts). A certificate needs a private key and a public certificate file.', 'HTTPS, HTTP ko TLS mein lapet deta hai. Do cheezein milti hain: **encryption** (taar par koi traffic padh ya badal nahi sakta) aur **pehchaan** (certificate saabit karta hai ki server sach mein shop.example.com hai, ek aisi authority ne sign kiya jis par browser bharosa karta hai). Certificate ko private key aur public certificate file chahiye.'),
      TABLE(
        [
          ['Self-signed certificate', 'you sign it yourself: encrypted, but browsers warn "not trusted". Fine for tests and internal tools.', 'tum khud sign karte ho: encrypted, par browsers "not trusted" warning dete hain. Test aur internal tools ke liye theek.'],
          ['Let\'s Encrypt (certbot)', 'FREE trusted certificates that renew automatically every 60-90 days. The normal choice for public sites.', 'MUFT trusted certificates jo har 60-90 din mein apne aap renew hote hain. Public sites ke liye aam vikalp.'],
          ['Company CA', 'an internal authority: your company installs its root certificate on all machines', 'internal authority: company apna root certificate saari machines par lagati hai'],
        ],
        'Kind',
        'Kism'
      ),
      CMD(['sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/ssl/private/shop.key -out /etc/ssl/certs/shop.crt -subj "/CN=shop.local"', 'sudo ls -l /etc/ssl/private/shop.key', 'sudo openssl x509 -in /etc/ssl/certs/shop.crt -noout -subject -dates'], 'One command makes a key and a self-signed certificate valid for a year. The private key is readable by root only.', 'Ek command key aur ek saal ke liye valid self-signed certificate banati hai. Private key sirf root padh sakta hai.'),
      CMD(['sudo mkdir -p /var/www/shop', 'echo "<h1>secure shop</h1>" | sudo tee /var/www/shop/index.html', 'printf "server {\\n    listen 443 ssl;\\n    server_name shop.local;\\n    ssl_certificate /etc/ssl/certs/shop.crt;\\n    ssl_certificate_key /etc/ssl/private/shop.key;\\n    root /var/www/shop;\\n}\\nserver {\\n    listen 80;\\n    server_name shop.local;\\n    return 301 https://\\$host\\$request_uri;\\n}\\n" | sudo tee /etc/nginx/conf.d/shop.conf', 'sudo nginx -t', 'sudo systemctl reload nginx'], 'The HTTPS server plus a second block that redirects every http:// request to https:// (301).', 'HTTPS server aur ek doosra block jo har http:// request ko https:// par redirect (301) karta hai.'),
      CMD(['curl -sI http://shop.local | head -n 1', 'curl https://shop.local', 'curl -k https://shop.local', 'sudo ss -tlnp | grep nginx'], 'Without -k curl refuses the self-signed certificate (error 60: the identity check works!). -k means "I know, continue" and is only for tests. Port 443 is now open.', '-k ke bina curl self-signed certificate mana karta hai (error 60: pehchaan ki jaanch kaam karti hai!). -k matlab "mujhe pata hai, aage badho" aur sirf tests ke liye. Port 443 ab khula hai.'),
      CMD(['echo | openssl s_client -connect shop.local:443 2>/dev/null | head -n 8'], 'openssl s_client is the TLS microscope: subject, issuer, protocol. Use it to debug certificate problems.', 'openssl s_client TLS ka microscope hai: subject, issuer, protocol. Certificate problems debug karne ke liye.'),
      WARN('Certificates EXPIRE. An expired certificate takes a site down for everybody with an ugly warning, and it is the number one avoidable outage. Know when yours expires: `openssl x509 -enddate -noout -in cert.pem`, and make sure renewal is automated (certbot installs a systemd timer for it).', 'Certificates EXPIRE hote hain. Expired certificate site ko sabke liye gandi warning ke saath down kar deta hai, aur ye sabse zyada taali ja sakne wali outage hai. Pata rakho tumhara kab expire hota hai: `openssl x509 -enddate -noout -in cert.pem`, aur renewal automated ho (certbot iske liye systemd timer lagata hai).'),
      JOB('On a real server with a public name you would run `sudo apt install certbot python3-certbot-nginx` and `sudo certbot --nginx -d example.com`. It proves you own the name, writes the certificate, edits the nginx config and sets up renewal. Mention "Let\'s Encrypt with certbot and auto-renewal" and interviewers relax.', 'Public naam wale asli server par tum `sudo apt install certbot python3-certbot-nginx` aur `sudo certbot --nginx -d example.com` chalaoge. Ye saabit karta hai ki naam tumhara hai, certificate likhta hai, nginx config edit karta hai aur renewal set karta hai. "Let\'s Encrypt with certbot aur auto-renewal" kaho aur interviewers aaram se baith jate hain.'),
      H('Debug lab: 403 Forbidden', 'Debug lab: 403 Forbidden'),
      CMD(LAB403, 'Prepare a broken site: the files exist but the folder is private to root (this is what the Practice lab loads for you).', 'Kharab site taiyar karo: files hain par folder sirf root ka hai (Practice lab tumhare liye yehi load karta hai).'),
      CMD(['curl -s -o /dev/null -w "%{http_code}\\n" http://vault.local', 'sudo tail -n 1 /var/log/nginx/error.log', 'ls -ld /var/www/vault', 'ps -o user= -C nginx | sort -u'], 'The error log says "Permission denied" opening the file. nginx workers run as www-data, who cannot enter a 700 folder owned by root.', 'Error log file kholte waqt "Permission denied" kehta hai. nginx workers www-data ke roop mein chalte hain, jo root ke 700 folder mein nahi ja sakta.'),
      CMD(['sudo chmod 755 /var/www/vault', 'sudo chmod 644 /var/www/vault/index.html', 'curl -s http://vault.local'], 'Fix: others need x on the folder and r on the file. (On Red Hat systems also think of SELinux, a later lesson.)', 'Fix: doosron ko folder par x aur file par r chahiye. (Red Hat systems par SELinux bhi socho, aage ka lesson.)'),
      H('Apache in one minute', 'Apache ek minute mein'),
      TABLE(
        [
          ['apache2 (Debian) / httpd (Red Hat)', 'the package and service names', 'package aur service ke naam'],
          ['/etc/apache2/sites-available/*.conf', 'virtual hosts: <VirtualHost *:80> with ServerName and DocumentRoot', 'virtual hosts: ServerName aur DocumentRoot ke saath <VirtualHost *:80>'],
          ['a2ensite NAME / a2dissite NAME', 'enable / disable a site (Debian helper for the symlink)', 'site enable / disable (symlink ke liye Debian helper)'],
          ['a2enmod rewrite', 'enable a module', 'module enable karo'],
          ['apache2ctl configtest', 'the Apache version of nginx -t', 'nginx -t ka Apache version'],
        ],
        'Apache',
        'Apache'
      ),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['nginx -t && systemctl reload nginx', 'the safe way to apply changes', 'badlav lagane ka safe tareeka'],
        ['curl -I URL / curl -v URL / curl -H "Host: x" IP', 'poke a site', 'site ko kuredo'],
        ['tail -f /var/log/nginx/error.log', 'watch errors live', 'errors live dekho'],
        ['403 -> permissions   404 -> path   502 -> backend', 'what the code points to', 'code kis taraf ishara karta hai'],
        ['proxy_pass http://127.0.0.1:PORT/;', 'reverse proxy', 'reverse proxy'],
        ['openssl req -x509 -nodes -newkey rsa:2048 ...', 'self-signed cert', 'self-signed cert'],
        ['openssl x509 -enddate -noout -in FILE', 'when does it expire?', 'kab expire hota hai?'],
        ['ss -tlnp | grep :80', 'who owns port 80?', 'port 80 kiska hai?'],
      ]),
    ],
    missions: [
      M('web-m1', 'Host your own site', 'Apni site host karo', 'Install nginx and publish a site for the name blog.local: the page /var/www/blog/index.html contains Hello Blog, the server block lives in sites-available, is enabled with a symlink, the config tests OK, nginx is reloaded, and curl http://blog.local shows the page (add blog.local to /etc/hosts).', 'nginx install karo aur naam blog.local ke liye site publish karo: page /var/www/blog/index.html mein Hello Blog hai, server block sites-available mein hai, symlink se enabled hai, config test OK hai, nginx reload hua hai, aur curl http://blog.local page dikhata hai (blog.local ko /etc/hosts mein jodo).', 'Follow the 4 steps from the lesson and finish with curl -s http://blog.local', 'Lesson ke 4 steps follow karo aur curl -s http://blog.local se khatam karo', (sh) => !!sh.fs.lookup('/etc/nginx/sites-enabled/blog') && sh.log.some((r) => /curl/.test(r.cmd) && /blog\.local/.test(r.cmd) && /Hello Blog/.test(r.out)), M1),
      M('web-m2', 'Lab: 403 Forbidden', 'Lab: 403 Forbidden', 'The site vault.local answers 403 Forbidden although the file exists. Find the cause in the error log and fix the permissions so that curl http://vault.local shows the Secret page. (Use the lab button.)', 'Site vault.local 403 Forbidden deti hai jabki file maujood hai. Error log mein wajah dhundo aur permissions theek karo taaki curl http://vault.local Secret page dikhaye. (Lab button use karo.)', 'The folder is 700 root:root. Give others x on the folder (755) and r on the file (644).', 'Folder 700 root:root hai. Folder par doosron ko x (755) aur file par r (644) do.', (sh) => sh.log.some((r) => /curl/.test(r.cmd) && /vault\.local/.test(r.cmd) && /Secret page/.test(r.out)), LAB403.concat(['curl -s -o /dev/null -w "%{http_code}\\n" http://vault.local', 'sudo chmod 755 /var/www/vault', 'sudo chmod 644 /var/www/vault/index.html', 'curl -s http://vault.local']), { lab: { setup: LAB403, en: 'a web server that answers 403 for the vault.local site.', hi: 'ek web server jo vault.local site ke liye 403 deta hai.' }, testSolve: LAB403.concat(['curl -s -o /dev/null -w "%{http_code}\\n" http://vault.local', 'sudo chmod 755 /var/www/vault', 'sudo chmod 644 /var/www/vault/index.html', 'curl -s http://vault.local']) }),
      M('web-m3', 'Turn on HTTPS', 'HTTPS chalu karo', 'For shop.local: create a self-signed certificate and key, make nginx listen on 443 ssl with it, redirect http to https with a 301, reload, and show the page with curl -k https://shop.local.', 'shop.local ke liye: self-signed certificate aur key banao, nginx ko uske saath 443 ssl par sunwao, http ko https par 301 se redirect karo, reload karo, aur curl -k https://shop.local se page dikhao.', 'openssl req -x509 ..., two server blocks, nginx -t, reload, curl -k', 'openssl req -x509 ..., do server blocks, nginx -t, reload, curl -k', (sh) => !!sh.listeners[443] && sh.log.some((r) => /curl .*-\w*k/.test(r.cmd) && /https:\/\/shop\.local/.test(r.cmd) && /secure shop/.test(r.out)) && /return 301 https/.test(LX.cat(sh, '/etc/nginx/conf.d/shop.conf')), TLS),
    ],
    quiz: [
      mcq(1, 'A browser gets "502 Bad Gateway" from your nginx. What is the most likely problem?', 'Browser ko tumhare nginx se "502 Bad Gateway" milta hai. Sabse sambhavit problem?', ['The disk is full', 'The backend application behind the proxy is down or on the wrong port', 'File permissions are wrong', 'DNS is broken'], 1, '502 = nginx is fine, but the upstream it proxies to did not answer.', '502 = nginx theek hai, par jis upstream ko proxy karta hai usne jawab nahi diya.'),
      mcq(2, 'The file exists but the browser shows 403 Forbidden. What do you check first?', 'File maujood hai par browser 403 Forbidden dikhata hai. Pehle kya check karte ho?', ['The DNS record', 'The file and folder permissions for the nginx user (www-data)', 'The system clock', 'The cable'], 1, '403 = found but not allowed to read. Check x on every folder of the path and r on the file.', '403 = mila par padhne ki ijazat nahi. Path ke har folder par x aur file par r check karo.'),
      cmd(3, 'Test the nginx configuration for syntax errors without touching the running server.', 'Chalte server ko chhue bina nginx configuration ka syntax check karo.', { setup: ['sudo apt install -y nginx'], verify: (sh, r) => /test is successful/.test(r.all), sample: 'sudo nginx -t', wrong: ['sudo nginx'], hintEn: 'nginx has a -t flag.', hintHi: 'nginx ka -t flag hota hai.' }, 'nginx -t parses all config files and reports the first problem.', 'nginx -t saari config files parse karke pehli problem batata hai.'),
      cmd(4, 'Show ONLY the HTTP response headers of the local web server (nginx is installed).', 'Local web server ke SIRF HTTP response headers dikhao (nginx installed hai).', { setup: ['sudo apt install -y nginx'], verify: (sh, r) => /^HTTP\/1\.1 200 OK/m.test(r.out) && !/Welcome to nginx/.test(r.out), sample: 'curl -I localhost', alt: ['curl -sI http://localhost', 'curl --head localhost'], wrong: ['curl localhost'], hintEn: 'curl with the head flag, capital I.', hintHi: 'curl ke saath head flag, capital I.' }, '-I sends a HEAD request and prints only headers.', '-I HEAD request bhejta hai aur sirf headers print karta hai.'),
      cmd(5, 'Print only the HTTP status code (a number) of http://localhost/nothing-here.', 'http://localhost/nothing-here ka sirf HTTP status code (ek number) print karo.', { setup: ['sudo apt install -y nginx'], verify: (sh, r) => r.out.trim() === '404', sample: 'curl -s -o /dev/null -w "%{http_code}\\n" http://localhost/nothing-here', alt: ["curl -s -o /dev/null -w '%{http_code}' http://localhost/nothing-here"], wrong: ['curl -s http://localhost/nothing-here'], hintEn: 'Discard the body with -o /dev/null and print with -w "%{http_code}".', hintHi: 'Body -o /dev/null se phenko aur -w "%{http_code}" se print karo.' }, 'The -w format string lets curl print any detail of the response.', '-w format string curl ko response ki koi bhi detail print karne deti hai.'),
      cmd(6, 'List which nginx sites are currently ENABLED, with long format so you can see the symlinks.', 'Dikhao kaun si nginx sites abhi ENABLED hain, long format mein taaki symlinks dikhen.', { setup: ['sudo apt install -y nginx'], verify: (sh, r) => /default/.test(r.out), sample: 'ls -l /etc/nginx/sites-enabled', alt: ['ls /etc/nginx/sites-enabled'], wrong: ['ls /etc/nginx/sites-available/nothing'], hintEn: 'The enabled sites are symlinks in sites-enabled.', hintHi: 'Enabled sites sites-enabled mein symlinks hain.' }, 'sites-enabled holds symlinks to the sites that are on.', 'sites-enabled mein chalu sites ke symlinks hote hain.'),
      cmd(7, 'Count how many log lines each status code has in /var/log/nginx/access.log (biggest first). Three requests have been made already.', '/var/log/nginx/access.log mein har status code ki kitni lines hain gino (bada pehle). Teen requests ho chuki hain.', { setup: ['sudo apt install -y nginx', 'curl -s localhost', 'curl -s localhost/x', 'curl -s localhost/y'], verify: (sh, r) => /^\s*2\s+404\s*$/m.test(r.out) && /^\s*1\s+200\s*$/m.test(r.out), sample: "sudo awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn", alt: ["sudo cut -d' ' -f9 /var/log/nginx/access.log | sort | uniq -c | sort -nr"], wrong: ['sudo cat /var/log/nginx/access.log'], hintEn: 'The status code is field 9 of each line.', hintHi: 'Status code har line ka field 9 hai.' }, 'awk picks the field, sort | uniq -c counts it.', 'awk field chunta hai, sort | uniq -c ginta hai.'),
      mcq(8, 'You run `curl https://myserver` against a server with a self-signed certificate and get "SSL certificate problem". What does `curl -k` do?', 'Self-signed certificate wale server par `curl https://myserver` chalate ho aur "SSL certificate problem" milta hai. `curl -k` kya karta hai?', ['Fixes the certificate', 'Skips the certificate verification (OK for tests only)', 'Encrypts better', 'Keeps the connection alive'], 1, '-k is --insecure: encryption still happens but the identity check is skipped.', '-k --insecure hai: encryption hota hai par pehchaan ki jaanch chhodi jati hai.'),
      cmd(9, 'Show only the expiry date of the certificate /etc/ssl/certs/web.crt (it exists).', 'Certificate /etc/ssl/certs/web.crt (maujood hai) ki sirf expiry date dikhao.', { setup: ['sudo openssl req -x509 -nodes -days 30 -newkey rsa:2048 -keyout /etc/ssl/private/web.key -out /etc/ssl/certs/web.crt -subj "/CN=web.local"'], verify: (sh, r) => /^notAfter=/m.test(r.out) && !/subject/.test(r.out), sample: 'sudo openssl x509 -enddate -noout -in /etc/ssl/certs/web.crt', alt: ['openssl x509 -noout -enddate -in /etc/ssl/certs/web.crt'], wrong: ['sudo openssl x509 -subject -noout -in /etc/ssl/certs/web.crt'], hintEn: 'openssl x509 with -enddate -noout -in FILE', hintHi: 'openssl x509, -enddate -noout -in FILE ke saath' }, '-enddate prints notAfter, the expiry.', '-enddate notAfter, yaani expiry print karta hai.'),
      cmd(10, 'Boss level: start a small backend on port 5000 (python3 -m http.server in the background, serving /tmp) and print only its HTTP status code.', 'Boss level: port 5000 par chhota backend chalao (background mein python3 -m http.server, /tmp serve kare) aur sirf uska HTTP status code print karo.', { verify: (sh, r) => !!sh.listeners[5000] && /^200\s*$/m.test(r.out), sample: 'python3 -m http.server 5000 --directory /tmp & sleep 0; curl -s -o /dev/null -w "%{http_code}\\n" localhost:5000', alt: ['python3 -m http.server 5000 --directory /tmp & curl -s -o /dev/null -w "%{http_code}\\n" localhost:5000'], wrong: ['curl -s -o /dev/null -w "%{http_code}\\n" localhost:5000'], hintEn: 'Start the server with & then curl -w "%{http_code}" it.', hintHi: 'Server & se chalao phir curl -w "%{http_code}" karo.' }, 'A backend must be running before the proxy can reach it.', 'Proxy ke pahunchne se pehle backend chalna chahiye.'),
    ],
  });
})();
