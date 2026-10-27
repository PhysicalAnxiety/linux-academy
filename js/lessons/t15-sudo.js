(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, JOB, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'sudo',
    part: 2,
    no: 15,
    key: 'sudo',
    mins: 30,
    title: T('sudo and Privilege', 'sudo aur Privilege'),
    blurb: T('Give people exactly the power they need and no more. Write safe sudoers rules, read the audit trail and avoid the classic lock-out.', 'Logon ko bas utni hi taakat do jitni chahiye. Safe sudoers rules likho, audit trail padho aur classic lock-out se bacho.'),
    blocks: [
      BIG(
        'Logging in as root all day is like driving with no seatbelt. Real teams use **sudo**: each person logs in as THEMSELVES and borrows root power for one command at a time. sudo also writes every use into a log, so you can answer the question "who ran that command?". This lesson shows how to decide **who may run what**.',
        'Poora din root ban kar kaam karna bina seatbelt gaadi chalane jaisa hai. Real teams **sudo** use karti hain: har insaan APNE naam se login karta hai aur ek command ke liye root ki taakat udhaar leta hai. sudo har use ko log mein bhi likhta hai, to "wo command kisne chalayi?" ka jawab mil jata hai. Ye lesson batata hai ki **kaun kya chala sakta hai** kaise tay hota hai.'
      ),
      STORY('A bank vault. The manager does not carry a master key in their pocket all day. Staff sign a register, the guard lets them in for ONE task, and the register records who entered and when. sudo is the guard and the register. The rules for who may enter which room live in a file called **sudoers**.', 'Bank ka vault. Manager poore din jeb mein master key nahi rakhta. Staff register mein sign karta hai, guard ek KAAM ke liye andar jaane deta hai, aur register likhta hai kaun kab ghusa. sudo guard bhi hai aur register bhi. Kaun kis kamre mein ja sakta hai ye rules **sudoers** file mein hote hain.'),
      H('sudo vs su', 'sudo aur su'),
      TABLE(
        [
          ['sudo command', 'run ONE command with extra power, using YOUR password. Logged.', 'EK command extra taakat se chalao, TUMHARE password se. Log hota hai.'],
          ['sudo -i', 'open a root login shell (when you need many root commands). Still logged as you.', 'root login shell kholo (jab kai root commands chahiye). Phir bhi tumhare naam se log hota hai.'],
          ['sudo -u bob command', 'run a command as another user (not necessarily root)', 'doosre user ki tarah command chalao (root zaroori nahi)'],
          ['su - ', 'become root by knowing the ROOT password. Many servers have no root password at all.', 'ROOT password jaan kar root bano. Kai servers par root password hota hi nahi.'],
        ],
        'Command',
        'Command'
      ),
      JOB('On Ubuntu the root account has no usable password on purpose. You get root power only through sudo. On Red Hat family systems the same idea uses a group called **wheel** instead of **sudo**. Both appear in interviews.', 'Ubuntu par root account ka password jaanbujhkar nahi hota. Root power sirf sudo se milti hai. Red Hat family par yehi idea **wheel** naam ke group se chalta hai, **sudo** se nahi. Dono interviews mein aate hain.'),
      CMD(['id', 'sudo -l'], 'Why can you use sudo? Because your user is in the sudo group, and the sudoers file says members of that group may run anything. sudo -l lists what YOU may do.', 'Tum sudo kyun use kar sakte ho? Kyunki tumhara user sudo group mein hai, aur sudoers file kehti hai us group ke members kuch bhi chala sakte hain. sudo -l batata hai TUM kya kar sakte ho.'),
      H('The sudoers rule: who where=(as whom) what', 'Sudoers rule: kaun kahan=(kis roop mein) kya'),
      ANAT([
        ['ben', 'cmd', 'WHO: a user (use %groupname for a group)', 'KAUN: ek user (group ke liye %groupname)'],
        ['ALL', 'opt', 'WHERE: on which computers (almost always ALL)', 'KAHAN: kin computers par (lagbhag hamesha ALL)'],
        ['=(ALL)', 'op', 'AS WHOM: which users ben may become', 'KIS ROOP MEIN: ben kin users ban sakta hai'],
        ['NOPASSWD:', 'opt', 'optional tag: no password needed', 'optional tag: password nahi chahiye'],
        ['/usr/bin/systemctl restart nginx', 'arg', 'WHAT: the exact command, with its full path', 'KYA: exact command, poore path ke saath'],
      ]),
      PRE(`ben   ALL=(ALL)   NOPASSWD: /usr/bin/systemctl restart nginx
%ops  ALL=(ALL:ALL) ALL                      <- everyone in group "ops" may do anything
alice ALL=(ALL)   /usr/bin/apt update, /usr/bin/apt upgrade   <- a short list`),
      WARN('Commands in sudoers MUST be written with their full path (/usr/bin/systemctl, not systemctl). A rule with only a command name is a syntax error. And if there are no arguments in the rule, ANY arguments are allowed: `/usr/bin/systemctl` lets ben stop, disable or mask ANY service, which is far too much.', 'Sudoers mein commands poore path ke saath likhni HI padti hain (/usr/bin/systemctl, sirf systemctl nahi). Sirf command naam wala rule syntax error hai. Aur agar rule mein arguments nahi hain to KOI BHI arguments allowed hain: `/usr/bin/systemctl` se ben KOI BHI service stop, disable ya mask kar sakta hai, jo bahut zyada hai.'),
      H('Edit sudoers safely', 'Sudoers ko safely edit karo'),
      P('Never open /etc/sudoers with a normal editor. A single typo makes sudo refuse to work for EVERYONE, and then nobody can fix it with sudo. Two safe habits:', '/etc/sudoers ko kabhi normal editor se mat kholo. Ek typo se sudo SABKE liye kaam karna band kar deta hai, aur phir sudo se koi ise theek nahi kar sakta. Do safe aadatein:'),
      STEPS([
        ['Use **visudo**. It opens the file in your editor, checks the syntax when you save and refuses a broken file.', '**visudo** use karo. Ye file ko tumhare editor mein kholta hai, save par syntax check karta hai aur kharab file ko mana kar deta hai.'],
        ['Put your own rules in a small file in **/etc/sudoers.d/** instead of changing the main file. Name it without a dot, set mode **0440**, and check it with `visudo -cf`.', 'Apne rules main file badalne ke bajay **/etc/sudoers.d/** ki chhoti file mein rakho. Naam mein dot nahi, mode **0440**, aur `visudo -cf` se check karo.'],
      ]),
      CMD(['sudo useradd -m ben', 'sudo apt install -y nginx > /dev/null', 'echo "ben ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx" | sudo tee /etc/sudoers.d/ben', 'sudo chmod 440 /etc/sudoers.d/ben', 'sudo visudo -c'], 'Create a rule that lets ben restart nginx and nothing else. visudo -c checks every sudoers file.', 'Aisa rule banao jisse ben sirf nginx restart kar sake. visudo -c har sudoers file check karta hai.'),
      CMD(['sudo -l -U ben', 'su - ben -c "sudo -n systemctl restart nginx; echo exit code: $?"', 'su - ben -c "sudo -n systemctl stop nginx; echo exit code: $?"'], 'Test it AS ben. Restart works, stop is refused. (-n means "never ask for a password", handy in scripts.)', 'ben ban kar test karo. Restart chalta hai, stop mana hai. (-n matlab "password kabhi mat maango", scripts mein kaam ka.)'),
      H('The classic disaster, and how to avoid it', 'Classic musibat aur usse bachna'),
      P('Let us break things on purpose. A rule with a command name but no path is a syntax error:', 'Chalo jaanbujhkar kharab karte hain. Sirf command naam wala rule (bina path) syntax error hai:'),
      CMD(['echo "ben ALL=(ALL) NOPASSWD: systemctl" | sudo tee /etc/sudoers.d/oops', 'sudo whoami'], 'Now sudo refuses to run for everyone, because it cannot trust its rules.', 'Ab sudo sabke liye chalna band kar deta hai, kyunki wo apne rules par bharosa nahi kar sakta.'),
      CMD(['su -c "rm /etc/sudoers.d/oops"', 'sudo whoami'], 'Recovery: you need ANOTHER way to be root (su with the root password, a root console, or rescue mode). Remove the bad file and sudo returns.', 'Recovery: root banne ka KOI AUR tareeka chahiye (root password ke saath su, root console ya rescue mode). Kharab file hatao aur sudo wapas aa jata hai.'),
      TIP('The safe workflow: write the rule into a file in /tmp, check it with `sudo visudo -cf /tmp/myrule`, and only then copy it into /etc/sudoers.d/. A broken file never reaches the live folder.', 'Safe tareeka: rule ko /tmp ki file mein likho, `sudo visudo -cf /tmp/myrule` se check karo, tabhi use /etc/sudoers.d/ mein copy karo. Kharab file live folder tak pahunchti hi nahi.'),
      H('The redirect trap', 'Redirect ka jaal'),
      CMD(['sudo echo "Authorized users only" > /etc/motd', 'echo "Authorized users only" | sudo tee -a /etc/motd', 'tail -n 2 /etc/motd'], 'The first line fails with Permission denied: the > redirect is done by YOUR shell, before sudo even starts. tee runs under sudo, so it can write. -a appends instead of overwriting.', 'Pehli line Permission denied deti hai: > redirect TUMHARA shell karta hai, sudo shuru hone se pehle. tee sudo ke andar chalta hai, isliye likh sakta hai. -a overwrite ke bajay append karta hai.'),
      H('The audit trail', 'Audit trail'),
      P('Every sudo use is logged: on Ubuntu in /var/log/auth.log, on Red Hat family in /var/log/secure, and in the journal. This is how a security team answers "who deleted that file at 3 a.m.?"', 'Har sudo use log hota hai: Ubuntu par /var/log/auth.log mein, Red Hat family par /var/log/secure mein, aur journal mein. Isi se security team jawab deti hai "raat 3 baje wo file kisne delete ki?"'),
      CMD(['sudo grep sudo /var/log/auth.log | tail -n 3', 'sudo journalctl -t sudo -n 3 --no-pager'], 'You see WHO ran WHAT, from which directory, as which user.', 'Dikhta hai KISNE KYA chalaya, kis directory se, kis user ke roop mein.'),
      TABLE(
        [
          ['sudo -k', 'forget my cached password right now (sudo asks again)', 'abhi mera cached password bhool jao (sudo phir puchega)'],
          ['sudo -v', 'refresh the cache without running a command', 'bina command chalaye cache refresh karo'],
          ['sudo !!', 'run the previous command again with sudo (when you forgot)', 'pichli command sudo ke saath dobara chalao (jab bhool gaye the)'],
          ['sudoedit /etc/hosts', 'edit a root file with YOUR editor in a safe temp copy', 'root ki file ko TUMHARE editor se safe temp copy mein edit karo'],
        ],
        'Handy options',
        'Kaam ke options'
      ),
      THINK('why is NOPASSWD: ALL a bad idea for a normal user?', 'normal user ke liye NOPASSWD: ALL kyun kharab idea hai?', 'Anything that runs as that user (a hacked browser, a malicious script, a stolen SSH key) instantly gets full root with no password. Passwordless sudo is for narrow, specific commands (a deploy script, a restart), not for ALL.', 'Jo bhi us user ke roop mein chale (hack hua browser, bura script, chori hui SSH key) use turant bina password ke poora root mil jata hai. Passwordless sudo chhote, khaas commands ke liye hai (deploy script, restart), ALL ke liye nahi.'),
      JOB('Principle of least privilege is the sentence interviewers want to hear. Give each person and each program the smallest power that lets them do their job, and log everything.', 'Least privilege ka principle wo line hai jo interviewers sunna chahte hain. Har insaan aur har program ko wo sabse chhoti taakat do jisse unka kaam chale, aur sab log karo.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['sudo -l', 'what may I run?', 'main kya chala sakta hoon?'],
        ['visudo / visudo -c / visudo -cf FILE', 'edit safely / check all / check one file', 'safely edit / sab check / ek file check'],
        ['/etc/sudoers.d/NAME (0440)', 'put custom rules here', 'apne rules yahan rakho'],
        ['user ALL=(ALL) NOPASSWD: /full/path arg', 'rule shape', 'rule ka shape'],
        ['%group ALL=(ALL) ALL', 'give a whole group sudo', 'poore group ko sudo do'],
        ['sudo -u user cmd', 'run as another user', 'doosre user ki tarah chalao'],
        ['... | sudo tee file', 'write to a root-owned file', 'root ki file mein likho'],
        ['/var/log/auth.log', 'the sudo audit trail', 'sudo ka audit trail'],
      ]),
    ],
    missions: [
      M('sudo-m1', 'Restart-only rule', 'Sirf restart wala rule', 'User ben may restart nginx but do nothing else with systemctl. Create ben, install nginx and write /etc/sudoers.d/ben with the full-path rule  ben ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx , mode 440.', 'User ben nginx restart kar sake par systemctl se aur kuch nahi. ben banao, nginx install karo aur /etc/sudoers.d/ben mein poore path wala rule  ben ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx  likho, mode 440.', 'Use echo ... | sudo tee /etc/sudoers.d/ben, then sudo chmod 440 on it.', 'echo ... | sudo tee /etc/sudoers.d/ben, phir uspar sudo chmod 440.', (sh) => { const f = sh.fs.lookup('/etc/sudoers.d/ben'); return !!f && (f.mode & 0o777) === 0o440 && /ben\s+ALL=\(ALL\)\s+NOPASSWD:\s*\/usr\/bin\/systemctl restart nginx/.test(f.content) && !LX.sudoersProblems(sh).length; }, ['sudo useradd -m ben', 'sudo apt install -y nginx', 'echo "ben ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx" | sudo tee /etc/sudoers.d/ben', 'sudo chmod 440 /etc/sudoers.d/ben']),
      M('sudo-m2', 'Add a banner (the right way)', 'Banner jodo (sahi tareeke se)', 'Append the line  Authorized users only  to the END of /etc/motd, using sudo tee -a so it really works.', '/etc/motd ke ANT mein  Authorized users only  line jodo, sudo tee -a use karke taaki sach mein kaam kare.', 'echo "..." | sudo tee -a /etc/motd', 'echo "..." | sudo tee -a /etc/motd', (sh) => /Authorized users only/.test(LX.cat(sh, '/etc/motd')), ['echo "Authorized users only" | sudo tee -a /etc/motd']),
      M('sudo-m3', 'Read the audit trail', 'Audit trail padho', 'Use sudo to run one command, then look in the log for sudo\'s own records. Show the lines that contain COMMAND= from /var/log/auth.log.', 'sudo se ek command chalao, phir log mein sudo ke apne records dekho. /var/log/auth.log se COMMAND= wali lines dikhao.', 'sudo grep COMMAND /var/log/auth.log', 'sudo grep COMMAND /var/log/auth.log', (sh) => sh.log.some((r) => /auth\.log/.test(r.cmd) && /COMMAND=/.test(r.out)), ['sudo whoami', 'sudo grep COMMAND /var/log/auth.log']),
    ],
    quiz: [
      mcq(1, 'What does sudo let you do?', 'sudo tumhe kya karne deta hai?', ['Delete your account', 'Run a command with another user\'s (usually root\'s) power', 'Switch to a different computer', 'Speed up commands'], 1, 'sudo = "superuser do": borrow power for one command.', 'sudo = "superuser do": ek command ke liye taakat udhaar lo.'),
      mcq(2, 'Why is `sudo echo hi > /etc/motd` denied when you are not root?', '`sudo echo hi > /etc/motd` root na hone par kyun mana hota hai?', ['echo is not allowed under sudo', 'The > redirect is done by your own shell, not by sudo', '/etc/motd does not exist', 'sudo needs two passwords'], 1, 'The shell opens the file for writing BEFORE sudo runs. Use `| sudo tee file` instead.', 'Shell file ko sudo chalne se PEHLE likhne ke liye kholta hai. Iske bajay `| sudo tee file` use karo.'),
      cmd(3, 'Show which commands your user may run with sudo.', 'Dikhao ki tumhara user sudo se kaun se commands chala sakta hai.', { verify: (sh, r) => /may run the following commands/.test(r.out), sample: 'sudo -l', wrong: ['sudo'], hintEn: 'It is the list option, a lowercase L.', hintHi: 'Ye list option hai, chhota L.' }, 'sudo -l prints the rules that apply to you.', 'sudo -l tumhare liye lagu rules print karta hai.'),
      mcq(4, 'Which command should you use to edit /etc/sudoers?', '/etc/sudoers edit karne ke liye kaunsi command use karni chahiye?', ['nano /etc/sudoers', 'vim /etc/sudoers', 'sudo visudo', 'cat >> /etc/sudoers'], 2, 'visudo checks the syntax before saving, so a typo cannot lock everyone out.', 'visudo save se pehle syntax check karta hai, isliye typo sabko bahar nahi kar sakti.'),
      cmd(5, 'Check the syntax of ALL sudoers files (the main file and /etc/sudoers.d) in one command.', 'Saari sudoers files (main file aur /etc/sudoers.d) ka syntax ek command mein check karo.', { verify: (sh, r) => /\/etc\/sudoers: parsed OK/.test(r.out), sample: 'sudo visudo -c', alt: ['sudo visudo --check'], wrong: ['visudo -c'], hintEn: 'visudo has a check-only flag.', hintHi: 'visudo ka check-only flag hota hai.' }, 'visudo -c only checks; it does not open an editor.', 'visudo -c sirf check karta hai; editor nahi kholta.'),
      cmd(6, 'Append the line  Welcome to the server  to the end of /etc/motd (it needs root).', '/etc/motd ke ant mein  Welcome to the server  line jodo (root chahiye).', { verify: (sh) => /Welcome to the server\n?$/.test(LX.cat(sh, '/etc/motd')), sample: 'echo "Welcome to the server" | sudo tee -a /etc/motd', alt: ["echo 'Welcome to the server' | sudo tee -a /etc/motd", 'sudo sh -c \'echo "Welcome to the server" >> /etc/motd\''], wrong: ['sudo echo "Welcome to the server" >> /etc/motd'], hintEn: 'Pipe into sudo tee with the append flag.', hintHi: 'Append flag ke saath sudo tee mein pipe karo.' }, 'tee -a appends, and it runs with root power.', 'tee -a append karta hai, aur root power se chalta hai.'),
      cmd(7, 'Create user dev, then write a sudoers drop-in /etc/sudoers.d/dev that lets dev run only  /usr/bin/apt update  without a password. Make it mode 440.', 'User dev banao, phir sudoers drop-in /etc/sudoers.d/dev likho jo dev ko bina password sirf  /usr/bin/apt update  chalane de. Mode 440 karo.', { setup: ['sudo useradd -m dev'], verify: (sh) => { const f = sh.fs.lookup('/etc/sudoers.d/dev'); return !!f && (f.mode & 0o777) === 0o440 && /^dev\s+ALL=\(ALL\)\s+NOPASSWD:\s*\/usr\/bin\/apt update\s*$/m.test(f.content) && !LX.sudoersProblems(sh).length; }, sample: 'echo "dev ALL=(ALL) NOPASSWD: /usr/bin/apt update" | sudo tee /etc/sudoers.d/dev && sudo chmod 440 /etc/sudoers.d/dev', alt: ['echo "dev ALL=(ALL) NOPASSWD: /usr/bin/apt update" | sudo tee /etc/sudoers.d/dev; sudo chmod 0440 /etc/sudoers.d/dev'], wrong: ['echo "dev ALL=(ALL) NOPASSWD: apt update" | sudo tee /etc/sudoers.d/dev && sudo chmod 440 /etc/sudoers.d/dev'], hintEn: 'Full path to apt, tee into /etc/sudoers.d/dev, then chmod 440.', hintHi: 'apt ka poora path, /etc/sudoers.d/dev mein tee, phir chmod 440.' }, 'Full command path, drop-in file, mode 0440.', 'Poora command path, drop-in file, mode 0440.'),
      mcq(8, 'A sudoers rule says  carol ALL=(ALL) /usr/bin/systemctl . What can carol do?', 'Sudoers rule hai  carol ALL=(ALL) /usr/bin/systemctl . Carol kya kar sakti hai?', ['Only list services', 'Run systemctl with ANY arguments as root', 'Run only systemctl restart', 'Nothing, the rule is invalid'], 1, 'With no arguments written in the rule, all arguments are allowed. To limit it, write the exact arguments.', 'Rule mein arguments na likhe hon to saare arguments allowed hote hain. Limit karne ke liye exact arguments likho.'),
      cmd(9, 'A bad sudoers file has locked everyone out of sudo. Fix it by removing /etc/sudoers.d/oops using su (the root account).', 'Kharab sudoers file ne sabko sudo se bahar kar diya. su (root account) se /etc/sudoers.d/oops hata kar theek karo.', { setup: ['echo "x ALL=(ALL) NOPASSWD: systemctl" | sudo tee /etc/sudoers.d/oops'], verify: (sh) => !sh.fs.lookup('/etc/sudoers.d/oops'), sample: 'su -c "rm /etc/sudoers.d/oops"', alt: ['su - root -c "rm -f /etc/sudoers.d/oops"'], wrong: ['sudo rm /etc/sudoers.d/oops'], hintEn: 'sudo is broken, so use a different way to run one command as root.', hintHi: 'sudo toot gaya hai, isliye root ki tarah ek command chalane ka doosra tareeka use karo.' }, 'su -c runs one command as root without needing sudo.', 'su -c sudo ke bina root ki tarah ek command chalata hai.'),
      cmd(10, 'Boss level: run  whoami  as the user ben (not root) using sudo, so the output is ben.', 'Boss level: sudo se  whoami  ko user ben (root nahi) ki tarah chalao, output ben aana chahiye.', { setup: ['sudo useradd -m ben'], verify: (sh, r) => r.out.trim() === 'ben', sample: 'sudo -u ben whoami', alt: ['sudo --user=ben whoami'], wrong: ['sudo whoami'], hintEn: 'sudo has a flag to choose the user.', hintHi: 'sudo ka user chunne ka flag hota hai.' }, 'sudo -u picks the user to run as.', 'sudo -u wo user chunta hai jiski tarah chalana hai.'),
    ],
  });
})();
