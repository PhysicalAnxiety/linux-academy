(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, JOB, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  const KEY = 'curl -fsSL https://repo.acme.example/acme.gpg | sudo gpg --dearmor -o /etc/apt/keyrings/acme.gpg';
  const LIST = 'echo "deb [signed-by=/etc/apt/keyrings/acme.gpg] https://repo.acme.example/apt stable main" | sudo tee /etc/apt/sources.list.d/acme.list';
  const REPO = [KEY, LIST, 'sudo apt update', 'sudo apt install -y acme-cli', 'acme --version'];
  const SRC = ['sudo apt install -y build-essential', 'mkdir -p ~/src', 'cd ~/src', 'wget -q https://dl.acme.example/src/hello-2.1.tar.gz', 'tar xzf hello-2.1.tar.gz', 'cd hello-2.1', './configure --prefix=/usr/local', 'make', 'sudo make install', 'hello'];
  const HOLD = ['sudo apt update', 'sudo apt-mark hold curl', 'sudo apt upgrade -y', 'apt list --upgradable'];

  LX.topics.push({
    id: 'packages-adv',
    part: 3,
    no: 27,
    key: 'packages',
    mins: 55,
    title: T('Package Management in Depth: apt, dpkg, dnf, Repositories and Building from Source', 'Package Management gehrai mein: apt, dpkg, dnf, Repositories aur Source se Build'),
    blurb: T('Install, upgrade, hold, inspect and remove software like a pro: find which package owns a file, add a third-party repository safely with signing keys, work with .deb and .rpm, and compile a program from source.', 'Software pro ki tarah install, upgrade, hold, inspect aur remove karo: pata karo file kis package ki hai, third-party repository ko signing keys ke saath safely jodo, .deb aur .rpm sambhalo, aur source se program compile karo.'),
    blocks: [
      BIG(
        'On a server you almost never download a program from a web page and double-click it. Software comes from **repositories** (trusted online shelves) and a **package manager** installs it, keeps a list of what is installed, upgrades everything in one command and can remove it cleanly. This is also how security patches reach your machine, so it is core admin work.',
        'Server par tum kabhi kisi web page se program download karke double-click nahi karte. Software **repositories** (bharosemand online shelves) se aata hai aur **package manager** use install karta hai, yaad rakhta hai kya installed hai, ek command mein sab upgrade karta hai aur saaf tareeke se hata sakta hai. Security patches bhi isi raaste se tumhari machine tak aate hain, isliye ye core admin kaam hai.'
      ),
      STORY('A library with a librarian. The **repository** is the library, the **package** is a book, the **apt** librarian knows every book, which ones you borrowed (installed) and which new editions arrived. Low-level **dpkg** is the person who physically puts one book on your shelf but cannot go and fetch the other books it needs. **apt update** only refreshes the catalogue; **apt upgrade** goes and swaps your old editions for new ones.', 'Librarian wali library. **Repository** library hai, **package** kitaab hai, **apt** librarian har kitaab jaanta hai, tumne kaun si udhaar li (installed) aur kaun si nayi edition aayi. Low-level **dpkg** wo vyakti hai jo ek kitaab tumhari shelf par rakh deta hai par baaki zaroori kitaabein lene nahi ja sakta. **apt update** sirf catalogue refresh karta hai; **apt upgrade** jaake purani editions nayi se badalta hai.'),
      H('Two families, same ideas', 'Do families, wahi ideas'),
      P('Linux distributions come in two big package families. Debian, Ubuntu and Mint use **.deb** files with **apt** and **dpkg**. Red Hat, Rocky, Alma, CentOS Stream and Fedora use **.rpm** files with **dnf** (older: yum) and **rpm**. Jobs ask for both, so learn the pairs.', 'Linux distributions ki do badi package families hain. Debian, Ubuntu aur Mint **.deb** files ke saath **apt** aur **dpkg** use karte hain. Red Hat, Rocky, Alma, CentOS Stream aur Fedora **.rpm** files ke saath **dnf** (purana: yum) aur **rpm** use karte hain. Jobs dono maangti hain, isliye jodiyan seekho.'),
      TABLE(
        [
          ['apt update  |  dnf makecache', 'refresh the list of available packages', 'available packages ki list refresh karo'],
          ['apt upgrade  |  dnf upgrade', 'install all newer versions', 'saare naye versions install karo'],
          ['apt install X  |  dnf install X', 'install a package (plus what it needs)', 'package (aur uski zarooratein) install karo'],
          ['apt remove X  |  dnf remove X', 'remove it', 'hata do'],
          ['apt search WORD  |  dnf search WORD', 'search names and descriptions', 'naam aur description mein dhundo'],
          ['apt show X  |  dnf info X', 'details of a package', 'package ki details'],
          ['dpkg -S /path  |  rpm -qf /path', 'WHICH package owns this file?', 'ye file KIS package ki hai?'],
          ['dpkg -L X  |  rpm -ql X', 'which files does the package contain?', 'package mein kaun si files hain?'],
          ['dpkg -l  |  rpm -qa', 'list everything installed', 'jo kuch installed hai uski list'],
          ['/var/log/apt/history.log  |  dnf history', 'what was installed or changed, and when', 'kya kab install ya badla'],
          ['/etc/apt/sources.list.d/  |  /etc/yum.repos.d/', 'where the repositories are configured', 'repositories yahan configure hoti hain'],
        ],
        'Debian / Ubuntu  |  Red Hat',
        'Debian / Ubuntu  |  Red Hat'
      ),
      H('apt every day', 'apt roz ka'),
      CMD(['sudo apt update', 'apt list --upgradable', 'apt policy curl', 'apt show curl | head -n 6'], 'update only reads the catalogue. Then you can look: which packages have newer versions, what version of curl is installed and which is the candidate (what apt would install).', 'update sirf catalogue padhta hai. Phir dekh sakte ho: kin packages ke naye versions hain, curl ka kaun sa version installed hai aur candidate (apt kya install karega) kaun sa.'),
      PRE(`curl:
  Installed: 8.5.0-2ubuntu10.3      <- what you have now
  Candidate: 8.5.0-2ubuntu10.4      <- what apt would install
  Version table:
     8.5.0-2ubuntu10.4 500          <- 500 = priority, then the repository it comes from
        500 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages`),
      CMD(['sudo apt install -y htop', 'which htop', 'sudo apt remove -y htop', 'which htop'], 'install, check, remove. -y answers "yes" to the question so scripts do not wait.', 'install, check, remove. -y sawal ka "haan" jawab deta hai taaki scripts ruke nahi.'),
      TABLE(
        [
          ['apt remove X', 'removes the program but KEEPS its config files (/etc/...) in case you come back', 'program hataata hai par config files (/etc/...) RAKHTA hai, agar wapas aao'],
          ['apt purge X', 'removes the program AND its config files', 'program AUR uski config files dono hataata hai'],
          ['apt autoremove', 'removes libraries that were installed only as dependencies and nobody needs now', 'wo libraries hataata hai jo sirf dependency ke roop mein aayi thi aur ab kisi ko nahi chahiye'],
          ['apt clean', 'empties the download cache in /var/cache/apt (frees disk)', 'download cache /var/cache/apt khali karta hai (disk khali)'],
        ],
        'Command',
        'Command'
      ),
      TIP('Before a big change, do a **dry run** with `-s`: apt prints what it WOULD do ("Inst" = install, "Remv" = remove) and changes nothing. It does not even need root. It is the package version of "measure twice, cut once".', 'Badi change se pehle `-s` se **dry run** karo: apt batata hai wo KYA karega ("Inst" = install, "Remv" = remove) aur kuch nahi badalta. Root bhi nahi chahiye. Ye "do baar naapo, ek baar kaato" ka package version hai.'),
      CMD(['apt -s install htop', 'apt -s upgrade | grep -c ^Inst'], 'See exactly what would happen; count the packages that would be upgraded.', 'Dekho kya hoga; kitne packages upgrade honge gino.'),
      H('Holding a package back', 'Package ko rok kar rakhna'),
      P('Sometimes a new version breaks something (a database that must stay on version 15, a kernel a driver needs). You can **hold** a package: upgrades skip it and say it was "kept back". Release the hold when you are ready.', 'Kabhi naya version kuch tod deta hai (database jo version 15 par rehna chahiye, kernel jo driver ko chahiye). Package ko **hold** kar sakte ho: upgrades usse chhod dete hain aur "kept back" kehte hain. Taiyar ho to hold hata do.'),
      CMD(['sudo apt-mark hold curl', 'apt-mark showhold', 'sudo apt upgrade -y', 'apt list --upgradable', 'sudo apt-mark unhold curl'], 'The upgrade installs everything except curl, which stays upgradable until you unhold it.', 'Upgrade curl ko chhodkar sab install karta hai, curl tab tak upgradable rehta hai jab tak unhold na karo.'),
      WARN('A held package silently stays old, and that can mean an unpatched security hole. Keep a note of why something is held, and review holds regularly with `apt-mark showhold`.', 'Hold kiya hua package chupchap purana rehta hai, aur iska matlab unpatched security hole ho sakta hai. Likh kar rakho kyun hold hai, aur `apt-mark showhold` se holds ka review karte raho.'),
      H('What happened on this machine? History', 'Is machine par kya hua? History'),
      CMD(['sudo apt install -y tree', 'tail -n 6 /var/log/apt/history.log', 'grep " install " /var/log/dpkg.log | tail -n 2'], 'apt keeps a diary. history.log says who ran which command and what changed; dpkg.log has one line per package action. Use them when someone asks "who installed this, and when?".', 'apt diary rakhta hai. history.log batata hai kisne kaun si command chalayi aur kya badla; dpkg.log mein har package action ki ek line hai. Jab koi pooche "ye kisne aur kab install kiya?" tab use karo.'),
      H('Which package does this file belong to?', 'Ye file kis package ki hai?'),
      CMD(['dpkg -S /usr/bin/curl', 'dpkg -L curl', 'dpkg -l curl', 'dpkg -S /etc/ssh/sshd_config'], '-S searches by file ("who owns it?"), -L lists a package\'s files, -l shows the install state. Perfect when you meet an unknown file or must find which package to reinstall.', '-S file se dhundta hai ("kiska hai?"), -L package ki files dikhata hai, -l install state. Anjaan file mile ya pata karna ho kaun sa package reinstall karna hai to perfect.'),
      CMD(['sudo apt install -y --reinstall curl'], 'Reinstall restores the files of a package that were damaged or deleted by accident.', 'Reinstall package ki wo files wapas laata hai jo galti se kharab ya delete ho gayin.'),
      H('Repositories and trust', 'Repositories aur bharosa'),
      P('Ubuntu knows where to download from because of lists in `/etc/apt/sources.list` and `/etc/apt/sources.list.d/*.list`. Sometimes the software you need (a database, a vendor tool) is not in the Ubuntu repositories, so the vendor runs its own. You then add three things: the **key** (to prove the packages are really from the vendor), a **source line**, and run **apt update**.', 'Ubuntu ko pata hai kahan se download karna hai kyunki `/etc/apt/sources.list` aur `/etc/apt/sources.list.d/*.list` mein lists hain. Kabhi tumhe jo software chahiye (database, vendor tool) Ubuntu repositories mein nahi hota, to vendor apni repository chalata hai. Tab teen cheezein jodte ho: **key** (saabit karne ke liye ki packages sach mein vendor ke hain), ek **source line**, aur **apt update** chalate ho.'),
      ANAT([
        ['deb', 'cmd', 'binary packages (deb-src would be source code)', 'binary packages (deb-src source code hota)'],
        ['[signed-by=/etc/apt/keyrings/acme.gpg]', 'opt', 'ONLY this key may sign this repository', 'SIRF ye key is repository ko sign kar sakti hai'],
        ['https://repo.acme.example/apt', 'arg', 'the repository address', 'repository ka address'],
        ['stable', 'arg', 'the "suite" (like a release name)', '"suite" (release ke naam jaisa)'],
        ['main', 'arg', 'the component (section) to use', 'use karne wala component (section)'],
      ]),
      STEPS([
        ['Download the vendor key and convert it to the binary format apt wants: `curl -fsSL URL | sudo gpg --dearmor -o /etc/apt/keyrings/NAME.gpg`', 'Vendor ki key download karo aur apt ke binary format mein badlo: `curl -fsSL URL | sudo gpg --dearmor -o /etc/apt/keyrings/NAME.gpg`'],
        ['Write the source line into `/etc/apt/sources.list.d/NAME.list` and point `signed-by` at the key.', 'Source line `/etc/apt/sources.list.d/NAME.list` mein likho aur `signed-by` ko key par point karo.'],
        ['`sudo apt update` and read it: the new repository must say `Get:`, not `Err:`.', '`sudo apt update` chalao aur padho: nayi repository `Get:` kahe, `Err:` nahi.'],
        ['`apt policy PACKAGE` shows the candidate comes from the new repository. Then install.', '`apt policy PACKAGE` dikhata hai candidate nayi repository se hai. Phir install karo.'],
      ]),
      CMD(['sudo apt install -y acme-cli'], 'Before the repository exists apt knows nothing about the package.', 'Repository jodne se pehle apt ko package ka kuch pata nahi.'),
      CMD([LIST, 'sudo apt update'], 'We added the source line but NOT the key. apt refuses the repository: NO_PUBKEY means "I cannot verify who signed this".', 'Source line jodi par key NAHI. apt repository mana karta hai: NO_PUBKEY matlab "mujhe pata nahi ye kisne sign kiya".'),
      CMD([KEY, 'gpg --show-keys /etc/apt/keyrings/acme.gpg', 'sudo apt update', 'apt policy acme-cli'], 'With the key in place apt update succeeds and the new package appears with its repository as the source.', 'Key lagne par apt update chalta hai aur naya package apni repository ke source ke saath dikhta hai.'),
      CMD(['sudo apt install -y acme-cli', 'acme --version', 'apt show acme-cli | head -n 6'], 'Installed from the third-party repository, and it will be upgraded together with the rest of the system from now on.', 'Third-party repository se install hua, aur ab baaki system ke saath hi upgrade hoga.'),
      WARN('Adding a repository means you trust its owner to run code as root on every upgrade. Add only vendors you trust, from their official documentation, with `signed-by` set. Be very suspicious of the one-liner `curl ... | sudo bash` from a random blog: it runs unknown code as root with no record in the package database.', 'Repository jodne ka matlab hai tum uske maalik par bharosa karte ho ki wo har upgrade par root ke roop mein code chalaye. Sirf bharosemand vendors ko jodo, unke official documentation se, `signed-by` set karke. Kisi random blog ke `curl ... | sudo bash` one-liner se bahut hoshiyar raho: wo anjaan code root se chalata hai aur package database mein koi record nahi.'),
      JOB('A very common interview question: "apt update says NO_PUBKEY (or the repository is not signed), what do you do?" Answer: the key for that repository is missing or in the wrong format; fetch the vendor key, dearmor it into /etc/apt/keyrings, reference it with signed-by in the source file, run apt update again. Do NOT disable signature checks.', 'Bahut common interview question: "apt update NO_PUBKEY (ya repository is not signed) kehta hai, kya karoge?" Jawab: us repository ki key gayab ya galat format mein hai; vendor ki key lo, /etc/apt/keyrings mein dearmor karo, source file mein signed-by se reference do, apt update dobara chalao. Signature checks band NAHI karna.'),
      H('A single .deb file', 'Ek akeli .deb file'),
      P('Sometimes you only get a file such as `tool_2.0_amd64.deb`. **dpkg -i** installs it, but dpkg does not fetch missing dependencies; `apt install ./file.deb` does both. You can also peek inside before installing.', 'Kabhi sirf `tool_2.0_amd64.deb` jaisi file milti hai. **dpkg -i** use install karta hai, par dpkg missing dependencies nahi laata; `apt install ./file.deb` dono karta hai. Install se pehle andar jhaank bhi sakte ho.'),
      CMD(['cd /tmp', 'apt download tree', 'ls -l tree_*.deb', 'dpkg -I tree_*.deb | head -n 6', 'dpkg -c tree_*.deb', 'sudo dpkg -i tree_*.deb', 'tree --version | head -n 1', 'sudo dpkg -r tree'], 'download the package without installing it (-I = info, -c = contents), install it with dpkg -i and remove it with dpkg -r.', 'Package install kiye bina download karo (-I = info, -c = contents), dpkg -i se install karo aur dpkg -r se hatao.'),
      H('The Red Hat side: dnf and rpm', 'Red Hat ki taraf: dnf aur rpm'),
      P('On Rocky, Alma, RHEL or Fedora the ideas are identical, only the words change. The repositories are in `/etc/yum.repos.d/*.repo`, packages are `.rpm` files and **dnf** is the apt of that world. Practice the pairs here; the sandbox understands both families.', 'Rocky, Alma, RHEL ya Fedora par ideas wahi hain, sirf shabd badalte hain. Repositories `/etc/yum.repos.d/*.repo` mein hain, packages `.rpm` files hain aur **dnf** us duniya ka apt hai. Jodiyan yahan practice karo; sandbox dono families samajhta hai.'),
      CMD(['sudo dnf install -y tree', 'rpm -q tree', 'rpm -qi tree', 'rpm -ql tree', 'rpm -qf /usr/bin/tree', 'dnf info tree', 'dnf history', 'dnf repolist'], 'rpm -q* asks the local database (installed things), dnf talks to the repositories. -qf is the rpm version of dpkg -S.', 'rpm -q* local database se poochta hai (installed cheezein), dnf repositories se baat karta hai. -qf, dpkg -S ka rpm version hai.'),
      H('Building from source (tar.gz, configure, make)', 'Source se build (tar.gz, configure, make)'),
      P('If a program has no package, you can download its source code and compile it. The classic recipe is three steps: **./configure** (check your machine and write build settings), **make** (compile) and **make install** (copy the result into place). Install by hand into **/usr/local**, which is reserved for software you built yourself, so it never collides with packages.', 'Agar kisi program ka package nahi hai, to uska source code download karke compile kar sakte ho. Classic recipe teen steps: **./configure** (machine check karo aur build settings likho), **make** (compile) aur **make install** (result ko jagah par copy). Haath se **/usr/local** mein install karo, jo khud build kiye software ke liye reserved hai, taaki packages se takraye nahi.'),
      CMD(['sudo apt install -y build-essential', 'mkdir -p ~/src', 'cd ~/src', 'wget -q https://dl.acme.example/src/hello-2.1.tar.gz', 'tar tzf hello-2.1.tar.gz', 'tar xzf hello-2.1.tar.gz', 'cd hello-2.1', 'cat README'], 'build-essential brings gcc and make. Always read the README (or INSTALL) of the source first.', 'build-essential gcc aur make laata hai. Source ka README (ya INSTALL) hamesha pehle padho.'),
      CMD(['./configure --prefix=/usr/local', 'make', './hello', 'sudo make install', 'which hello', 'hello'], 'configure checked for gcc and make and wrote config.mk, make compiled the program, make install copied it to /usr/local/bin. Compare to a package: nothing recorded it in dpkg, so apt does not know it exists.', 'configure ne gcc aur make check kiye aur config.mk likha, make ne program compile kiya, make install ne /usr/local/bin mein copy kiya. Package se compare karo: dpkg mein iska koi record nahi, apt ko iska pata nahi.'),
      CMD(['dpkg -S /usr/local/bin/hello', 'sudo make uninstall', 'which hello'], 'A hand-built program is not owned by any package, so only the Makefile can remove it. Keep the source folder if you want to uninstall later!', 'Haath se bana program kisi package ka nahi, isliye sirf Makefile hata sakta hai. Baad mein uninstall karna ho to source folder rakho!'),
      TABLE(
        [
          ['configure: error: no acceptable C compiler found', 'install the build tools: sudo apt install build-essential', 'build tools install karo: sudo apt install build-essential'],
          ['fatal error: foo.h: No such file or directory', 'a development library is missing: install the foo-dev package (apt install libfoo-dev)', 'development library gayab: foo-dev package install karo (apt install libfoo-dev)'],
          ['make: *** No targets specified and no makefile found', 'you are in the wrong folder, or configure was not run', 'galat folder mein ho, ya configure nahi chalaya'],
          ['make install: Permission denied', 'writing to /usr/local needs root: sudo make install (but build as a normal user)', '/usr/local mein likhne ko root chahiye: sudo make install (par build normal user se)'],
        ],
        'Error',
        'Error'
      ),
      H('snap, flatpak and pip: other sources', 'snap, flatpak aur pip: doosre sources'),
      TABLE(
        [
          ['snap install X', 'Canonical\'s universal packages; bundle their own libraries, update themselves, run sandboxed', 'Canonical ke universal packages; apni libraries saath, khud update, sandbox mein'],
          ['flatpak install X', 'the same idea from the desktop world, common on Fedora', 'wahi idea desktop duniya se, Fedora par common'],
          ['pip install X', 'Python libraries. On modern systems pip refuses system-wide installs ("externally-managed-environment"): use a virtual environment (python lesson)', 'Python libraries. Naye systems par pip system-wide install mana karta hai ("externally-managed-environment"): virtual environment use karo (python lesson)'],
        ],
        'Tool',
        'Tool'
      ),
      THINK('A colleague says "I installed nginx with `sudo make install` last year, now apt install nginx behaves strangely." Why is it risky to have the same software from source AND from a package?', 'Ek colleague kehta hai "maine pichle saal `sudo make install` se nginx lagaya tha, ab apt install nginx ajeeb behave kar raha hai." Ek hi software source AUR package dono se hona risky kyun hai?', 'Two copies (/usr/local/bin/nginx and /usr/sbin/nginx) can fight over ports, config and which one runs when you type the name; and the hand-built one never gets security updates. Pick one source per program.', 'Do copies (/usr/local/bin/nginx aur /usr/sbin/nginx) port, config aur naam type karne par kaun chale is par lad sakti hain; aur haath se bana wala kabhi security updates nahi paata. Har program ke liye ek hi source chuno.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['sudo apt update && sudo apt upgrade', 'the routine patch run', 'routine patch run'],
        ['apt policy X / apt show X', 'versions, repository, details', 'versions, repository, details'],
        ['apt -s install X', 'dry run: change nothing', 'dry run: kuch nahi badlega'],
        ['sudo apt-mark hold X / unhold X / showhold', 'freeze a package', 'package ko freeze karo'],
        ['dpkg -S FILE / dpkg -L PKG', 'owner of a file / files of a package', 'file ka maalik / package ki files'],
        ['tail /var/log/apt/history.log', 'who changed what, when', 'kisne kya kab badla'],
        ['NO_PUBKEY -> gpg --dearmor into /etc/apt/keyrings + signed-by', 'repository key problem', 'repository key ki problem'],
        ['rpm -qf FILE / dnf history / dnf info X', 'Red Hat equivalents', 'Red Hat ke equivalents'],
        ['./configure && make && sudo make install', 'source build (into /usr/local)', 'source build (/usr/local mein)'],
      ]),
    ],
    missions: [
      M('pkg-m1', 'Hold a package and upgrade the rest', 'Ek package hold karo, baaki upgrade', 'Refresh the package lists, put curl on hold, run the upgrade so that the other packages get patched, and check that curl is still listed as upgradable.', 'Package lists refresh karo, curl ko hold karo, upgrade chalao taaki baaki packages patch hon, aur dekho ki curl ab bhi upgradable dikh raha hai.', 'apt update, apt-mark hold curl, apt upgrade -y, apt list --upgradable', 'apt update, apt-mark hold curl, apt upgrade -y, apt list --upgradable', (sh) => sh.aptHold && sh.aptHold.has('curl') && (sh.pendingUpdates || []).some((p) => p.name === 'curl') && !(sh.pendingUpdates || []).some((p) => p.name === 'openssl'), HOLD),
      M('pkg-m2', 'Add a third-party repository the safe way', 'Third-party repository safe tareeke se jodo', 'Install acme-cli from the vendor repository https://repo.acme.example/apt (suite stable, component main). The key is at https://repo.acme.example/acme.gpg and must be stored as a binary keyring in /etc/apt/keyrings/acme.gpg and referenced with signed-by from /etc/apt/sources.list.d/acme.list. Run acme --version at the end.', 'Vendor repository https://repo.acme.example/apt (suite stable, component main) se acme-cli install karo. Key https://repo.acme.example/acme.gpg par hai aur binary keyring ke roop mein /etc/apt/keyrings/acme.gpg mein rakhni hai, aur /etc/apt/sources.list.d/acme.list se signed-by ke saath reference deni hai. End mein acme --version chalao.', 'curl | gpg --dearmor -o, echo deb [signed-by=...] | tee, apt update, apt install', 'curl | gpg --dearmor -o, echo deb [signed-by=...] | tee, apt update, apt install', (sh) => sh.installed.has('acme-cli') && /signed-by=\/etc\/apt\/keyrings\/acme\.gpg/.test(LX.cat(sh, '/etc/apt/sources.list.d/acme.list')) && sh.log.some((r) => /acme --version/.test(r.cmd) && /acme 2\.4\.0/.test(r.out)), REPO),
      M('pkg-m3', 'Compile and install from source', 'Source se compile aur install karo', 'Download https://dl.acme.example/src/hello-2.1.tar.gz into ~/src, unpack it, build it with ./configure --prefix=/usr/local, make and sudo make install, then run hello.', 'https://dl.acme.example/src/hello-2.1.tar.gz ko ~/src mein download karo, kholo, ./configure --prefix=/usr/local, make aur sudo make install se build karo, phir hello chalao.', 'wget, tar xzf, cd, ./configure, make, sudo make install, hello (build-essential first!)', 'wget, tar xzf, cd, ./configure, make, sudo make install, hello (pehle build-essential!)', (sh) => !!sh.fs.lookup('/usr/local/bin/hello') && sh.log.some((r) => /^hello\b/.test(r.cmd.trim()) && /source build/.test(r.out)), SRC),
    ],
    quiz: [
      mcq(1, 'Which command only refreshes the list of available packages and installs nothing?', 'Kaun si command sirf available packages ki list refresh karti hai aur kuch install nahi karti?', ['apt upgrade', 'apt update', 'apt install', 'apt autoremove'], 1, 'update = read the catalogue. upgrade = install the newer versions.', 'update = catalogue padho. upgrade = naye versions install karo.'),
      mcq(2, 'A package is delivered as a .rpm file. Which tools belong to it?', 'Ek package .rpm file ke roop mein aata hai. Kaun se tools uske hain?', ['apt and dpkg', 'dnf and rpm', 'snap and pip', 'make and gcc'], 1, '.rpm is the Red Hat family: dnf (high level) and rpm (low level). apt and dpkg belong to .deb.', '.rpm Red Hat family hai: dnf (high level) aur rpm (low level). apt aur dpkg .deb ke hain.'),
      cmd(3, 'Show the details (version, maintainer, description) of the package curl.', 'Package curl ki details (version, maintainer, description) dikhao.', { verify: (sh, r) => /^Package: curl/m.test(r.out) && /Version:/.test(r.out), sample: 'apt show curl', alt: ['apt-cache show curl'], wrong: ['apt search curl'], hintEn: 'apt has a show subcommand.', hintHi: 'apt ka show subcommand hota hai.' }, 'apt show prints the package record.', 'apt show package ka record print karta hai.'),
      cmd(4, 'Which package does the file /usr/bin/curl belong to?', 'File /usr/bin/curl kis package ki hai?', { verify: (sh, r) => /^curl: \/usr\/bin\/curl/m.test(r.out), sample: 'dpkg -S /usr/bin/curl', alt: ['dpkg --search /usr/bin/curl'], wrong: ['dpkg -L curl'], hintEn: 'dpkg -S searches by file.', hintHi: 'dpkg -S file se dhundta hai.' }, 'dpkg -S path prints "package: path".', 'dpkg -S path "package: path" print karta hai.'),
      cmd(5, 'List only the packages that have a newer version available (run the list you need; the catalogue is already fresh).', 'Sirf wo packages list karo jinka naya version available hai (catalogue pehle se fresh hai).', { setup: ['sudo apt update'], verify: (sh, r) => /upgradable from/.test(r.out) && /curl/.test(r.out), sample: 'apt list --upgradable', alt: ['apt list --upgradeable'], wrong: ['apt list --installed'], hintEn: 'apt list takes a flag with the word "upgradable".', hintHi: 'apt list ek flag leta hai jisme "upgradable" shabd hai.' }, 'The Inst/upgradable list is how you see pending patches.', 'Ye list pending patches dekhne ka tareeka hai.'),
      cmd(6, 'Simulate installing htop WITHOUT installing it (a dry run).', 'htop install karne ka simulation karo, install KIYE BINA (dry run).', { verify: (sh, r) => /^Inst htop/m.test(r.out) && !sh.installed.has('htop'), sample: 'apt -s install htop', alt: ['apt-get -s install htop', 'apt install -s htop', 'apt install --dry-run htop'], wrong: ['sudo apt install htop'], hintEn: 'The simulate flag is -s.', hintHi: 'Simulate flag -s hai.' }, '-s prints Inst/Conf lines and changes nothing.', '-s Inst/Conf lines print karta hai aur kuch nahi badalta.'),
      cmd(7, 'Put the package openssh-server on hold so that upgrades skip it.', 'Package openssh-server ko hold karo taaki upgrades usse chhod dein.', { verify: (sh) => sh.aptHold && sh.aptHold.has('openssh-server'), sample: 'sudo apt-mark hold openssh-server', wrong: ['apt-mark hold openssh-server'], hintEn: 'The tool is apt-mark and it needs root.', hintHi: 'Tool apt-mark hai aur root chahiye.' }, 'apt-mark hold freezes the version until unhold.', 'apt-mark hold unhold hone tak version freeze rakhta hai.'),
      cmd(8, 'Somebody installed tree a minute ago. Show the last 6 lines of apt\'s history log to see what exactly was run.', 'Kisi ne abhi tree install kiya. apt ke history log ki aakhri 6 lines dikhao taaki pata chale exactly kya chala.', { setup: ['sudo apt install -y tree'], verify: (sh, r) => /Commandline: apt install -y tree/.test(r.out), sample: 'tail -n 6 /var/log/apt/history.log', alt: ['tail -6 /var/log/apt/history.log', 'sudo tail -n 6 /var/log/apt/history.log'], wrong: ['cat /var/log/dpkg.log'], hintEn: 'The file is /var/log/apt/history.log', hintHi: 'File /var/log/apt/history.log hai' }, 'history.log keeps Commandline, who requested it and what was installed.', 'history.log mein Commandline, kisne maanga aur kya install hua rehta hai.'),
      mcq(9, '`sudo apt update` ends with "NO_PUBKEY ... The repository is not signed". What is the correct fix?', '`sudo apt update` "NO_PUBKEY ... The repository is not signed" par khatam hota hai. Sahi fix kya hai?', ['Delete /var/lib/apt and retry', 'Add the vendor\'s signing key (dearmored) to /etc/apt/keyrings and reference it with signed-by', 'Add [trusted=yes] to the source line so the checks stop', 'Reinstall apt'], 1, 'The key is missing or in the wrong format. [trusted=yes] switches off the safety check and is a bad habit.', 'Key gayab ya galat format mein hai. [trusted=yes] safety check band karta hai aur buri aadat hai.'),
      cmd(10, 'Boss level: you are in ~/src with hello-2.1.tar.gz already downloaded (build tools installed). Unpack it, enter the folder and run its configure script so that it would install into /opt/hello.', 'Boss level: tum ~/src mein ho, hello-2.1.tar.gz download ho chuka hai (build tools installed). Use kholo, folder mein jao aur configure script aise chalao ki wo /opt/hello mein install ho.', { setup: ['sudo apt install -y build-essential', 'mkdir -p ~/src', 'cd ~/src', 'wget -q https://dl.acme.example/src/hello-2.1.tar.gz'], verify: (sh) => /PREFIX = \/opt\/hello/.test(LX.cat(sh, sh.fs.lookup(sh.cwd + '/config.mk') ? sh.cwd + '/config.mk' : '/home/learner/src/hello-2.1/config.mk')), sample: 'tar xzf hello-2.1.tar.gz && cd hello-2.1 && ./configure --prefix=/opt/hello', alt: ['tar xzf hello-2.1.tar.gz; cd hello-2.1; ./configure --prefix=/opt/hello'], wrong: ['tar xzf hello-2.1.tar.gz'], hintEn: 'tar xzf, cd into the folder, then ./configure --prefix=...', hintHi: 'tar xzf, folder mein cd, phir ./configure --prefix=...' }, 'configure writes the prefix into config.mk, which make install then uses.', 'configure prefix ko config.mk mein likhta hai, jise make install use karta hai.'),
    ],
  });
})();
