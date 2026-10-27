(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, JOB, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'logs',
    part: 2,
    no: 18,
    key: 'journalctl',
    mins: 40,
    title: T('Logs: journald, syslog and logrotate', 'Logs: journald, syslog aur logrotate'),
    blurb: T('Logs are the black box of a server. Read them with journalctl and grep, find an attacker in auth.log, and stop logs from eating the disk.', 'Logs server ka black box hain. journalctl aur grep se padho, auth.log mein attacker pakdo, aur logs ko disk khane se roko.'),
    blocks: [
      BIG(
        'When something goes wrong at 3 a.m., the **logs** are your witness. Every service, the kernel and the login system write short messages with a time, a source and a severity. A good admin does not guess: they read the log. This lesson teaches the two logging worlds on Linux (**journald** and the classic **/var/log text files**), how to filter them quickly, and how **logrotate** keeps them from filling the disk.',
        'Raat 3 baje kuch kharab ho to **logs** tumhare gawah hain. Har service, kernel aur login system time, source aur severity ke saath chhote messages likhte hain. Achha admin andaza nahi lagata: wo log padhta hai. Ye lesson Linux ki do logging duniyayein sikhata hai (**journald** aur purani **/var/log text files**), unhe tezi se filter kaise karte hain, aur **logrotate** unhe disk bharne se kaise rokta hai.'
      ),
      STORY('A ship has a captain\'s log. Every event is written down: "08:00 left port", "11:42 engine trouble", "11:50 engine fixed". Later, if something sinks, investigators read the log from the end backwards. Linux logs are the same: time first, then who wrote it, then what happened.', 'Jahaz ka captain\'s log hota hai. Har ghatna likhi jati hai: "08:00 bandargah chhoda", "11:42 engine mein dikkat", "11:50 engine theek". Baad mein kuch dube to investigators log ko end se peeche padhte hain. Linux logs bhi aise hi hain: pehle time, phir kisne likha, phir kya hua.'),
      H('Two places logs live', 'Logs do jagah rehte hain'),
      TABLE(
        [
          ['journalctl', 'systemd\'s journal: one binary database for EVERYTHING (services, kernel, login). Query it with filters.', 'systemd ka journal: SAB kuch (services, kernel, login) ka ek binary database. Filters se query karo.'],
          ['/var/log/syslog, auth.log, kern.log', 'plain text files written by rsyslog (Debian/Ubuntu). Use grep, tail, less on them.', 'rsyslog ke likhe plain text files (Debian/Ubuntu). Inpar grep, tail, less chalao.'],
          ['/var/log/secure, /var/log/messages', 'the Red Hat family names for auth.log and syslog', 'auth.log aur syslog ke Red Hat family wale naam'],
          ['/var/log/nginx/, /var/log/apache2/', 'each big program may keep its own folder of logs', 'har bade program ka apna logs ka folder ho sakta hai'],
        ],
        'Where',
        'Kahan'
      ),
      CMD('ls -l /var/log', 'The classic folder. Most files here are readable only by root and the adm group, so you often need sudo.', 'Classic folder. Yahan ki zyadatar files sirf root aur adm group padh sakta hai, isliye aksar sudo chahiye.'),
      H('journalctl: filter, do not scroll', 'journalctl: filter karo, scroll mat karo'),
      TABLE(
        [
          ['journalctl -n 20', 'the last 20 lines', 'aakhri 20 lines'],
          ['journalctl -u ssh', 'only messages from the ssh service (-u = unit)', 'sirf ssh service ke messages (-u = unit)'],
          ['journalctl -f', 'follow live, like tail -f. Ctrl+C to stop.', 'live follow, tail -f jaisa. Rokne ko Ctrl+C.'],
          ['journalctl -p err', 'only errors and worse (priority)', 'sirf errors aur usse bure (priority)'],
          ['journalctl -b', 'this boot only (-b -1 = the previous boot)', 'sirf is boot ka (-b -1 = pichla boot)'],
          ['journalctl --since "1 hour ago"', 'time window (also --until, "yesterday", "2026-10-26 09:00")', 'time window (--until, "yesterday", "2026-10-26 09:00" bhi)'],
          ['journalctl -k', 'kernel messages only (same as dmesg)', 'sirf kernel messages (dmesg jaisa)'],
          ['journalctl -t sudo', 'by identifier (the program name that wrote it)', 'identifier se (jis program ne likha uska naam)'],
          ['journalctl -o json-pretty -n 1', 'show all fields of an entry as JSON', 'ek entry ke saare fields JSON mein dikhao'],
          ['journalctl --disk-usage', 'how big is the journal', 'journal kitna bada hai'],
        ],
        'Command',
        'Command'
      ),
      TIP('Filters combine. `journalctl -u ssh -p warning --since today` means "warnings or worse from ssh since midnight". Add `--no-pager` when you pipe the output into grep.', 'Filters jud sakte hain. `journalctl -u ssh -p warning --since today` matlab "ssh ke warning ya usse bure messages aadhi raat se". Output ko grep mein pipe karte waqt `--no-pager` lagao.'),
      CMD(['sudo journalctl -n 5 --no-pager', 'sudo journalctl -u ssh --no-pager | tail -n 4', 'sudo journalctl -p err --no-pager | head -n 3', 'sudo journalctl -k --no-pager | head -n 3'], 'A first tour: recent entries, one service, errors only, and the kernel.', 'Pehla daura: haal ki entries, ek service, sirf errors aur kernel.'),
      H('The severity ladder', 'Severity ki seedhi'),
      PRE(`0 emerg   system is unusable          3 err      error conditions
1 alert   act immediately             4 warning  warning
2 crit    critical                    5 notice   normal but significant
                                      6 info     information
                                      7 debug    debugging noise

-p err   shows 0..3         -p warning   shows 0..4`),
      H('The text files: grep is your friend', 'Text files: grep tumhara dost'),
      CMD(['sudo tail -n 5 /var/log/auth.log', 'sudo grep "Failed password" /var/log/auth.log | head -n 3'], 'auth.log records every login try. These "Failed password" lines are real-looking attack traffic, a guessing robot trying passwords.', 'auth.log har login koshish likhta hai. Ye "Failed password" lines asli jaisa attack traffic hain, ek guessing robot passwords aazma raha hai.'),
      H('Who is attacking me? Build a pipeline', 'Mujhpar hamla kaun kar raha hai? Pipeline banao'),
      P('Combine the tools you already know: grep to pick the lines, awk to cut out the IP address, sort and uniq -c to count, and sort -rn to put the worst offender first.', 'Jo tools tum jaante ho unhe jodo: grep se lines chuno, awk se IP address kaato, sort aur uniq -c se gino, aur sort -rn se sabse bura upar rakho.'),
      PRE(`Oct 27 01:52:37 linux-school sshd[2100]: Failed password for root from 203.0.113.77 port 40000 ssh2
                                                                 ^^^^^^^^^^^^ this is field NF-3 (counting from the END)`),
      CMD('sudo grep "Failed password" /var/log/auth.log | awk \'{print $(NF-3)}\' | sort | uniq -c | sort -rn | head -n 5', 'Count failed logins per source IP. The top line is your attacker. ($NF is the last field, so $(NF-3) is the IP.) A security engineer runs this on day one.', 'Source IP ke hisaab se fail logins gino. Sabse upar wali line tumhara attacker hai. ($NF aakhri field hai, to $(NF-3) IP hai.) Security engineer ye pehle din chalata hai.'),
      CMD('sudo grep "Failed password" /var/log/auth.log | grep -v COMMAND | wc -l', 'How many failed attempts in total? (Our own grep command shows up in the log too, which is why we filter COMMAND.)', 'Total kitni fail koshishein? (Hamari apni grep command bhi log mein aati hai, isliye COMMAND filter karte hain.)'),
      H('Writing your own log lines', 'Apni log lines likhna'),
      P('Scripts should log too, so you can see what they did. **logger** sends a message to the system log.', 'Scripts ko bhi log likhna chahiye, taaki dikhe unhone kya kiya. **logger** system log mein message bhejta hai.'),
      CMD(['logger -t backup -p user.notice "nightly backup started"', 'sudo journalctl -t backup -n 2 --no-pager'], '-t sets the tag (who is talking), -p the severity. Now your own script shows up next to every other service in the journal.', '-t tag set karta hai (kaun bol raha hai), -p severity. Ab tumhari apni script journal mein baaki services ke saath dikhti hai.'),
      H('Logs grow forever: logrotate', 'Logs hamesha badhte hain: logrotate'),
      P('A busy server writes gigabytes of logs. If nobody trims them, one day the disk is full and the server falls over. **logrotate** runs every night, renames the current log to .1, compresses older ones, deletes the oldest, and starts a fresh file.', 'Busy server gigabytes ke logs likhta hai. Koi unhe na kaate to ek din disk bhar jati hai aur server gir jata hai. **logrotate** roz raat chalta hai, current log ka naam .1 kar deta hai, purane compress karta hai, sabse purana delete karta hai, aur nayi file shuru karta hai.'),
      PRE(`app.log        <- today (being written)
app.log.1      <- yesterday
app.log.2.gz   <- compressed
app.log.3.gz
(older ones are deleted)`),
      CMD(['cat /etc/logrotate.conf', 'ls /etc/logrotate.d'], 'The main file sets defaults; each application drops its own small file in /etc/logrotate.d/.', 'Main file defaults set karti hai; har application /etc/logrotate.d/ mein apni chhoti file rakhti hai.'),
      ANAT([
        ['/var/log/myapp/*.log', 'cmd', 'which files this rule is about (wildcards allowed)', 'ye rule kin files ke liye hai (wildcards chalte hain)'],
        ['weekly', 'opt', 'rotate once a week (daily, monthly, or size 100M)', 'hafte mein ek baar rotate (daily, monthly ya size 100M)'],
        ['rotate 4', 'opt', 'keep four old copies', 'chaar purani copies rakho'],
        ['compress', 'opt', 'gzip the old ones', 'purani ko gzip karo'],
        ['missingok / notifempty', 'opt', 'no error if the file is missing; skip empty files', 'file na ho to error nahi; khali files chhodo'],
      ]),
      CMD(['sudo mkdir -p /var/log/myapp', 'echo "line one" | sudo tee /var/log/myapp/app.log', 'printf "/var/log/myapp/*.log {\\n    weekly\\n    rotate 4\\n    compress\\n    missingok\\n    notifempty\\n}\\n" | sudo tee /etc/logrotate.d/myapp', 'sudo logrotate -d /etc/logrotate.d/myapp'], 'Write a rule and test it safely with -d (debug: shows what WOULD happen, changes nothing).', 'Rule likho aur -d se safely test karo (debug: dikhata hai kya HOGA, kuch badalta nahi).'),
      CMD(['sudo logrotate -f /etc/logrotate.d/myapp', 'ls -l /var/log/myapp'], '-f forces a rotation right now. See the new empty app.log and the compressed copy.', '-f abhi rotation force karta hai. Nayi khali app.log aur compress ki hui copy dekho.'),
      WARN('A logrotate rule that never runs, or a program that keeps writing to a deleted file, is a classic way for a disk to fill up. If `df -h` says the disk is full but `du` cannot find the files, a deleted-but-open log is a prime suspect (`lsof | grep deleted`). You will practise this in the storage lessons.', 'Aisa logrotate rule jo kabhi na chale, ya program jo delete ki hui file mein likhta rahe, disk bharne ka classic tareeka hai. Agar `df -h` kehta hai disk full hai par `du` ko files nahi milti, to deleted-lekin-khuli log sabse bada shak hai (`lsof | grep deleted`). Storage lessons mein ye practice karoge.'),
      H('Journal size and the kernel ring buffer', 'Journal ka size aur kernel ring buffer'),
      CMD(['sudo journalctl --disk-usage', 'sudo journalctl --vacuum-time=7d', 'sudo dmesg | head -n 3'], 'The journal can also be trimmed (vacuum by age or size). dmesg shows the kernel\'s own messages: hardware, disks, drivers.', 'Journal bhi chhota kiya ja sakta hai (age ya size se vacuum). dmesg kernel ke apne messages dikhata hai: hardware, disks, drivers.'),
      JOB('The interview answer to "a server is slow or a service died, what do you do?" always starts with logs: `systemctl status`, `journalctl -u X -n 100`, `journalctl -p err -b`, and `dmesg -T | tail` for hardware or out-of-memory kills. Say those four out loud and you sound like someone who has done it.', '"Server slow hai ya service mar gayi, kya karoge?" ka interview jawab hamesha logs se shuru hota hai: `systemctl status`, `journalctl -u X -n 100`, `journalctl -p err -b`, aur hardware ya out-of-memory kills ke liye `dmesg -T | tail`. Ye chaaron zor se bolo aur tum aise lagoge jisne ye kiya hai.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['journalctl -u X -n 50 --no-pager', 'last 50 lines of a service', 'service ki aakhri 50 lines'],
        ['journalctl -p err -b', 'errors since boot', 'boot ke baad se errors'],
        ['journalctl --since "1 hour ago" -f', 'live from an hour ago', 'ek ghante pehle se live'],
        ['tail -f /var/log/syslog', 'follow a text log', 'text log follow karo'],
        ['grep -i error file | sort | uniq -c | sort -rn', 'most common errors', 'sabse common errors'],
        ['logger -t tag "msg"', 'write to the log', 'log mein likho'],
        ['logrotate -d FILE / -f FILE', 'test / force rotation', 'rotation test / force'],
        ['dmesg -T', 'kernel messages with real times', 'asli time ke saath kernel messages'],
      ]),
    ],
    missions: [
      M('logs-m1', 'Catch the intruder', 'Ghuspaithiye ko pakdo', 'Count the failed SSH password attempts per IP address in /var/log/auth.log, with the biggest number first. Use grep, awk, sort and uniq -c.', '/var/log/auth.log mein har IP address ke hisaab se fail SSH password koshishein gino, sabse bada number pehle. grep, awk, sort aur uniq -c use karo.', 'sudo grep "Failed password" /var/log/auth.log | awk \'{print $(NF-3)}\' | sort | uniq -c | sort -rn', 'sudo grep "Failed password" /var/log/auth.log | awk \'{print $(NF-3)}\' | sort | uniq -c | sort -rn', (sh) => sh.log.some((r) => /Failed password/.test(r.cmd) && /uniq -c/.test(r.cmd) && /sort -rn|sort -nr|sort -r/.test(r.cmd) && /203\.0\.113\.77/.test(r.out)), ['sudo grep "Failed password" /var/log/auth.log | awk \'{print $(NF-3)}\' | sort | uniq -c | sort -rn | head -n 3']),
      M('logs-m2', 'Leave a note in the journal', 'Journal mein note chhodo', 'Use logger to write the message "mission accomplished" with the tag academy, then read it back with journalctl.', 'logger se tag academy ke saath "mission accomplished" message likho, phir journalctl se wapas padho.', 'logger -t academy "mission accomplished", then sudo journalctl -t academy', 'logger -t academy "mission accomplished", phir sudo journalctl -t academy', (sh) => sh.log.some((r) => /^\s*(sudo\s+)?journalctl\b.*-t\s+academy/.test(r.cmd) && /mission accomplished/.test(r.out)), ['logger -t academy "mission accomplished"', 'sudo journalctl -t academy --no-pager']),
      M('logs-m3', 'Stop the disk filling up', 'Disk bharne se roko', 'Create the logrotate rule /etc/logrotate.d/webapp for /var/log/webapp/*.log: rotate weekly, keep 8 copies, compress, missingok and notifempty.', '/var/log/webapp/*.log ke liye logrotate rule /etc/logrotate.d/webapp banao: weekly rotate, 8 copies rakho, compress, missingok aur notifempty.', 'Use printf or echo with sudo tee to write the block, as in the lesson.', 'Lesson ki tarah block likhne ke liye sudo tee ke saath printf ya echo use karo.', (sh) => { const t = LX.cat(sh, '/etc/logrotate.d/webapp'); return /\/var\/log\/webapp\/\*\.log/.test(t) && /weekly/.test(t) && /rotate 8/.test(t) && /compress/.test(t) && /missingok/.test(t) && /notifempty/.test(t); }, ['printf "/var/log/webapp/*.log {\\n    weekly\\n    rotate 8\\n    compress\\n    missingok\\n    notifempty\\n}\\n" | sudo tee /etc/logrotate.d/webapp']),
    ],
    quiz: [
      mcq(1, 'Which command lets you read the systemd journal?', 'systemd journal padhne ke liye kaunsi command hai?', ['journalctl', 'logread', 'syslogctl', 'journal'], 0, 'journalctl queries the journal.', 'journalctl journal ko query karta hai.'),
      cmd(2, 'Show only the last 3 journal lines (no pager).', 'Sirf journal ki aakhri 3 lines dikhao (pager nahi).', { verify: (sh, r, c) => /journalctl/.test(c) && /-n\s*3|--lines[= ]3/.test(c) && r.out.trim().split('\n').length === 3, sample: 'sudo journalctl -n 3 --no-pager', alt: ['sudo journalctl --lines=3 --no-pager'], wrong: ['sudo journalctl --no-pager'], hintEn: 'journalctl has a flag to limit the number of lines.', hintHi: 'journalctl mein lines ginti limit karne ka flag hai.' }, '-n N limits the output to N lines.', '-n N output ko N lines tak limit karta hai.'),
      mcq(3, 'You want ONLY messages from the sshd service. Which option?', 'Tumhe SIRF sshd service ke messages chahiye. Kaunsa option?', ['journalctl -u ssh', 'journalctl -p ssh', 'journalctl -k ssh', 'journalctl --only ssh'], 0, '-u picks a unit (service).', '-u unit (service) chunta hai.'),
      cmd(4, 'Show the kernel messages of the journal, only the first 2 lines.', 'Journal ke kernel messages dikhao, sirf pehli 2 lines.', { verify: (sh, r, c) => /-k|--dmesg/.test(c) && /kernel/.test(r.out) && r.out.trim().split('\n').length === 2, sample: 'sudo journalctl -k --no-pager | head -n 2', alt: ['sudo journalctl --dmesg --no-pager | head -2'], wrong: ['sudo journalctl --no-pager | head -n 2'], hintEn: '-k means kernel.', hintHi: '-k matlab kernel.' }, '-k (kernel) limits the journal to kernel messages.', '-k (kernel) journal ko kernel messages tak limit karta hai.'),
      cmd(5, 'Count how many "Failed password" lines are in /var/log/auth.log (just the number).', '/var/log/auth.log mein kitni "Failed password" lines hain (sirf number).', { verify: (sh, r) => /^\d+$/.test(r.out.trim()) && +r.out.trim() >= 13, sample: 'sudo grep -c "Failed password" /var/log/auth.log', alt: ['sudo grep "Failed password" /var/log/auth.log | wc -l'], wrong: ['sudo cat /var/log/auth.log'], hintEn: 'grep has a count flag.', hintHi: 'grep ka count flag hota hai.' }, 'grep -c prints the number of matching lines.', 'grep -c match hone wali lines ki ginti print karta hai.'),
      mcq(6, 'Which severity is MORE serious: warning or err?', 'Kaunsi severity ZYADA gambhir hai: warning ya err?', ['warning', 'err (error)', 'They are the same', 'info'], 1, 'The lower the number the worse: err is 3, warning is 4.', 'Number jitna chhota utna bura: err 3 hai, warning 4.'),
      cmd(7, 'Write the message "disk check done" into the system log with the tag diskcheck.', 'System log mein "disk check done" message tag diskcheck ke saath likho.', { verify: (sh) => sh.journal.some((e) => /disk check done/.test(e.msg) && (e.ident === 'diskcheck')), sample: 'logger -t diskcheck "disk check done"', alt: ['logger -t diskcheck disk check done'], wrong: ['logger "disk check done"'], hintEn: 'logger -t TAG message', hintHi: 'logger -t TAG message' }, 'logger -t sets the tag so you can filter on it later.', 'logger -t tag set karta hai taaki baad mein filter kar sako.'),
      cmd(8, 'Show which source IP made the most failed SSH logins: print only the single top line of the count list.', 'Dikhao kis source IP ne sabse zyada fail SSH logins kiye: count list ki sirf sabse upar wali ek line print karo.', { verify: (sh, r) => /^\s*\d+\s+203\.0\.113\.77\s*$/.test(r.out.trim()), sample: 'sudo grep "Failed password" /var/log/auth.log | awk \'{print $(NF-3)}\' | sort | uniq -c | sort -rn | head -n 1', alt: ['sudo grep "Failed password" /var/log/auth.log | grep -v COMMAND | awk \'{print $(NF-3)}\' | sort | uniq -c | sort -nr | head -1'], wrong: ['sudo grep "Failed password" /var/log/auth.log | wc -l'], hintEn: 'grep, awk the IP, sort, uniq -c, sort -rn, head -n 1.', hintHi: 'grep, awk se IP, sort, uniq -c, sort -rn, head -n 1.' }, 'uniq -c counts, sort -rn puts the biggest first, head -n 1 keeps one line.', 'uniq -c ginta hai, sort -rn bada pehle rakhta hai, head -n 1 ek line rakhta hai.'),
      cmd(9, 'Test the logrotate config /etc/logrotate.d/rsyslog in debug mode (it must not change anything).', 'logrotate config /etc/logrotate.d/rsyslog ko debug mode mein test karo (kuch badalna nahi chahiye).', { verify: (sh, r, c) => /-d|--debug/.test(c) && /reading config file|rotating pattern/.test(r.out), sample: 'sudo logrotate -d /etc/logrotate.d/rsyslog', alt: ['sudo logrotate --debug /etc/logrotate.d/rsyslog'], wrong: ['sudo logrotate -f /etc/logrotate.d/rsyslog'], hintEn: 'logrotate with a flag that only pretends.', hintHi: 'logrotate ka wo flag jo sirf dikhawa karta hai.' }, '-d shows what would happen without doing it.', '-d bina kiye dikhata hai ki kya hoga.'),
      cmd(10, 'Boss level: create /var/log/shop/app.log with some text, write a logrotate rule for it (daily, rotate 3, compress, missingok) into /etc/logrotate.d/shop, then force a rotation. Do it all in one line.', 'Boss level: kuch text ke saath /var/log/shop/app.log banao, uske liye logrotate rule (daily, rotate 3, compress, missingok) /etc/logrotate.d/shop mein likho, phir rotation force karo. Sab ek line mein.', { verify: (sh) => !!sh.fs.lookup('/var/log/shop/app.log.1.gz') && /rotate 3/.test(LX.cat(sh, '/etc/logrotate.d/shop')) && /daily/.test(LX.cat(sh, '/etc/logrotate.d/shop')), sample: 'sudo mkdir -p /var/log/shop && echo data | sudo tee /var/log/shop/app.log > /dev/null && printf "/var/log/shop/app.log {\\n    daily\\n    rotate 3\\n    compress\\n    missingok\\n}\\n" | sudo tee /etc/logrotate.d/shop > /dev/null && sudo logrotate -f /etc/logrotate.d/shop', wrong: ['sudo mkdir -p /var/log/shop'], hintEn: 'mkdir, tee the log, tee the rule, logrotate -f, all joined by &&.', hintHi: 'mkdir, log tee, rule tee, logrotate -f, sab && se jude.' }, 'The rotated copy app.log.1.gz appears once the rule is forced.', 'Rule force karne par rotate ki hui copy app.log.1.gz dikhti hai.'),
    ],
  });
})();
