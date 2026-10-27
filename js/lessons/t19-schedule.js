(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, JOB, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  const TIMER_SETUP = [
    'printf "#!/bin/bash\\necho backup done at $(date +%T)\\n" | sudo tee /usr/local/bin/mybackup.sh > /dev/null',
    'sudo chmod +x /usr/local/bin/mybackup.sh',
    'printf "[Unit]\\nDescription=My backup\\n\\n[Service]\\nType=oneshot\\nExecStart=/usr/local/bin/mybackup.sh\\n" | sudo tee /etc/systemd/system/mybackup.service > /dev/null',
  ];

  LX.topics.push({
    id: 'schedule',
    part: 2,
    no: 19,
    key: 'crontab',
    mins: 40,
    title: T('Scheduling: cron, at and systemd timers', 'Scheduling: cron, at aur systemd timers'),
    blurb: T('Run jobs while you sleep. Learn the five cron fields, the traps that make cron jobs silently fail, one-off at jobs and modern systemd timers. Includes a time machine so you do not wait a night.', 'Jab tum so rahe ho tab jobs chalao. Paanch cron fields, wo jaal jinse cron jobs chupchap fail hote hain, ek-baar ke at jobs aur modern systemd timers seekho. Time machine bhi hai taaki raat bhar intezaar na karo.'),
    blocks: [
      BIG(
        'Backups at 2 a.m., log cleanups every week, a report every Monday: nobody wants to type these by hand. Linux has three schedulers: **cron** (repeating jobs, the classic), **at** (run something ONCE, later) and **systemd timers** (the modern way, with logs and dependencies).',
        'Raat 2 baje backup, har hafte log safai, har Monday report: koi ye haath se type nahi karna chahta. Linux mein teen schedulers hain: **cron** (baar-baar chalne wale jobs, classic), **at** (kuch ek BAAR, baad mein chalao) aur **systemd timers** (modern tareeka, logs aur dependencies ke saath).'
      ),
      STORY('Cron is like a very punctual alarm clock that has a list of chores. Every minute it looks at the clock and asks "is there a chore for this minute?". It does the chore, but it does not talk to you: if a chore fails, you hear nothing unless you set up a way to find out. That silence is the number one source of cron trouble.', 'Cron ek bahut samay ka pakka alarm clock hai jiske paas kaamon ki list hai. Har minute wo ghadi dekhta hai aur puchta hai "is minute ka koi kaam hai?". Kaam kar deta hai, par tumse baat nahi karta: kaam fail ho to tumhe kuch sunai nahi deta jab tak pata karne ka tareeka na lagao. Ye khamoshi cron ki sabse badi musibat hai.'),
      H('The time machine (sandbox only)', 'Time machine (sirf sandbox mein)'),
      WARN('A real server just waits. In this sandbox the command `timewarp` (it is NOT a real Linux command) jumps the clock forward so your jobs fire. `timewarp 5m` skips 5 minutes, `timewarp 1d` a day. Use it in every exercise below. `date` shows the new time.', 'Asli server bas intezaar karta hai. Is sandbox mein `timewarp` command (ye asli Linux command NAHI hai) ghadi aage kar deti hai taaki tumhare jobs chal sakein. `timewarp 5m` 5 minute chhodta hai, `timewarp 1d` ek din. Neeche har exercise mein use karo. `date` naya time dikhata hai.'),
      CMD(['date', 'timewarp 2m', 'date'], 'Try it: the clock moves forward two minutes.', 'Try karo: ghadi do minute aage chali jati hai.'),
      H('cron: the five fields', 'cron: paanch fields'),
      PRE(`  .---------------- minute        (0 - 59)
  |  .------------- hour          (0 - 23)
  |  |  .---------- day of month  (1 - 31)
  |  |  |  .------- month         (1 - 12 or jan..dec)
  |  |  |  |  .---- day of week   (0 - 7, 0 and 7 are Sunday, or sun..sat)
  |  |  |  |  |
  *  *  *  *  *   command to run`),
      TABLE(
        [
          ['* * * * *', 'every minute', 'har minute'],
          ['*/15 * * * *', 'every 15 minutes (*/n = every n)', 'har 15 minute (*/n = har n)'],
          ['30 2 * * *', 'every day at 02:30', 'roz 02:30 par'],
          ['0 9 * * 1-5', 'at 09:00 Monday to Friday (1-5 is a range)', 'Monday se Friday 09:00 par (1-5 range hai)'],
          ['0 0 1 * *', 'at midnight on the 1st of every month', 'har mahine ki 1 tarikh ko aadhi raat'],
          ['0 6,18 * * *', 'at 06:00 and 18:00 (a list)', '06:00 aur 18:00 par (list)'],
          ['@reboot  /  @daily  /  @hourly', 'shortcuts: once at boot / 0 0 * * * / 0 * * * *', 'shortcuts: boot par ek baar / 0 0 * * * / 0 * * * *'],
        ],
        'Schedule',
        'Schedule'
      ),
      THINK('what does "0 */4 * * *" mean?', '"0 */4 * * *" ka matlab kya hai?', 'Minute 0 of every 4th hour: at 00:00, 04:00, 08:00, 12:00, 16:00 and 20:00, every day.', 'Har 4th ghante ka minute 0: roz 00:00, 04:00, 08:00, 12:00, 16:00 aur 20:00 par.'),
      TIP('If you are unsure about a schedule, paste it into the site crontab.guru in a real browser. Nobody remembers every cron pattern, but everyone double-checks.', 'Schedule par shak ho to real browser mein crontab.guru par paste karke dekho. Har cron pattern kisi ko yaad nahi rehta, par sab dobara check karte hain.'),
      H('Your own crontab', 'Tumhara apna crontab'),
      TABLE(
        [
          ['crontab -l', 'list your jobs', 'apne jobs list karo'],
          ['crontab -e', 'edit them (opens your editor, then checks the syntax when you save)', 'unhe edit karo (editor kholta hai, save par syntax check karta hai)'],
          ['crontab -r', 'REMOVE all your jobs (no confirmation, careful!)', 'tumhare SAARE jobs hatao (confirmation nahi, dhyan se!)'],
          ['sudo crontab -u asha -l', 'look at somebody else\'s crontab', 'kisi aur ka crontab dekho'],
        ],
        'Command',
        'Command'
      ),
      CMD(['(crontab -l 2>/dev/null; echo "* * * * * date >> /tmp/clock.log") | crontab -', 'crontab -l', 'timewarp 3m', 'cat /tmp/clock.log'], 'A quick way to add a job from a script: print the old crontab, add a line, feed it back with crontab - . Then jump three minutes and see the file grow.', 'Script se job jodne ka tez tareeka: purana crontab print karo, ek line jodo, crontab - se wapas do. Phir teen minute aage jao aur file badhti dekho.'),
      H('Why cron jobs fail silently: the four classic traps', 'Cron jobs chupchap fail kyun hote hain: chaar classic jaal'),
      TABLE(
        [
          ['1. Tiny PATH', 'cron runs with PATH=/usr/bin:/bin only. A tool in /usr/local/bin is "not found". Use FULL paths in cron lines.', 'cron sirf PATH=/usr/bin:/bin ke saath chalta hai. /usr/local/bin ka tool "not found" aata hai. Cron lines mein POORE paths use karo.'],
          ['2. The % sign', 'In a crontab line an unescaped % means "newline". `date +%F` breaks. Write `date +\\%F`.', 'Crontab line mein bina escape wala % ka matlab "newline". `date +%F` toot jata hai. `date +\\%F` likho.'],
          ['3. No output and no errors', 'cron mails the output to you (and nobody reads that mailbox). Redirect: `>> /var/log/job.log 2>&1`.', 'cron output tumhe mail karta hai (aur wo mailbox koi nahi padhta). Redirect karo: `>> /var/log/job.log 2>&1`.'],
          ['4. Different environment', 'No .bashrc, no variables, HOME may differ, SHELL is /bin/sh. Scripts that work in your terminal can fail here.', '.bashrc nahi, variables nahi, HOME alag ho sakta hai, SHELL /bin/sh hai. Tumhare terminal mein chalne wali scripts yahan fail ho sakti hain.'],
        ],
        'Trap',
        'Jaal'
      ),
      CMD(['(crontab -l; echo "* * * * * date +%F >> /tmp/today.txt") | crontab -', 'timewarp 2m', 'ls /tmp/today.txt', 'mail'], 'Trap 2 live: the % breaks the command, so no file appears and cron mailed the error to you. mail shows the message.', 'Jaal 2 live: % ne command tod di, isliye file nahi bani aur cron ne error tumhe mail kiya. mail message dikhata hai.'),
      CMD(['crontab -r', 'echo \'0 3 * * * /usr/bin/date +\\%F >> /tmp/today.txt 2>&1\' | crontab -', 'crontab -l'], 'The fixed version: escaped %, full path, output redirected including errors.', 'Theek version: escaped %, poora path, errors samet output redirect.'),
      TIP('Always write cron jobs as a SCRIPT that you can run by hand first, and make the crontab line only `/home/you/backup.sh >> /var/log/backup.log 2>&1`. Test the script manually; then cron has nothing mysterious left to do.', 'Cron jobs hamesha ek SCRIPT ki tarah likho jo pehle haath se chal sake, aur crontab line sirf `/home/you/backup.sh >> /var/log/backup.log 2>&1` rakho. Script haath se test karo; phir cron ke paas koi rahasya nahi bachta.'),
      H('System-wide jobs', 'System-wide jobs'),
      TABLE(
        [
          ['/etc/crontab', 'the system crontab. It has an extra 6th column: the USER to run as.', 'system crontab. Isme ek extra 6th column hai: kis USER se chalana hai.'],
          ['/etc/cron.d/NAME', 'drop-in files for packages and admins (same format as /etc/crontab, with the user column)', 'packages aur admins ke drop-in files (/etc/crontab jaisa format, user column ke saath)'],
          ['/etc/cron.hourly, daily, weekly, monthly', 'drop any executable script in a folder and it runs on that schedule. No time syntax at all.', 'kisi folder mein koi executable script daalo aur wo us schedule par chalegi. Time syntax bilkul nahi.'],
          ['/etc/cron.allow, /etc/cron.deny', 'who may use crontab at all', 'kaun crontab use kar sakta hai'],
        ],
        'Place',
        'Jagah'
      ),
      CMD(['cat /etc/crontab | tail -n 6', 'ls /etc/cron.daily'], 'See how the daily, weekly and monthly folders are triggered by lines in /etc/crontab.', 'Dekho daily, weekly aur monthly folders /etc/crontab ki lines se kaise chalte hain.'),
      CMD(['printf "#!/bin/sh\\necho cleaned up >> /tmp/daily.log\\n" | sudo tee /etc/cron.daily/cleanup > /dev/null', 'sudo chmod +x /etc/cron.daily/cleanup', 'sudo timewarp 1d', 'cat /tmp/daily.log'], 'A job without any cron syntax: just a script in /etc/cron.daily (note: no dot in the file name, or run-parts skips it!).', 'Bina cron syntax ka job: bas /etc/cron.daily mein ek script (dhyan: file naam mein dot nahi, warna run-parts chhod deta hai!).'),
      H('at: do it once, later', 'at: ek baar, baad mein'),
      P('**at** is for one-off jobs: "shut down the test server at 6 p.m.", "run this report in an hour". It needs the at package and the atd service.', '**at** ek-baar ke jobs ke liye hai: "test server shaam 6 baje band karo", "ye report ek ghante mein chalao". Ise at package aur atd service chahiye.'),
      CMD(['sudo apt install -y at', 'echo "echo hello from the future > /tmp/at-demo.txt" | at now + 5 minutes', 'atq', 'timewarp 6m', 'cat /tmp/at-demo.txt', 'atq'], 'Schedule, list (atq), jump ahead, and see the result. The queue is empty afterwards because at jobs run only once.', 'Schedule karo, list karo (atq), aage jao aur result dekho. Baad mein queue khali hai kyunki at jobs sirf ek baar chalte hain.'),
      TABLE(
        [
          ['at 17:30', 'today at 17:30 (or tomorrow if it has passed)', 'aaj 17:30 par (ya nikal gaya to kal)'],
          ['at now + 2 hours', 'relative time (minutes, hours, days, weeks)', 'relative time (minutes, hours, days, weeks)'],
          ['at 9am tomorrow', 'a natural phrase', 'ek natural phrase'],
          ['atq', 'list queued jobs', 'queued jobs list karo'],
          ['atrm 3', 'delete job number 3', 'job number 3 delete karo'],
        ],
        'Command',
        'Command'
      ),
      H('systemd timers: the modern way', 'systemd timers: modern tareeka'),
      P('A timer is a pair of unit files: a **.service** that does the work and a **.timer** that says WHEN. Timers have big advantages: output goes to the journal, you can see them with `systemctl list-timers`, they can wait for dependencies, and `Persistent=true` runs a job that was missed while the machine was off.', 'Timer unit files ki jodi hai: ek **.service** jo kaam karti hai aur ek **.timer** jo batata hai KAB. Timers ke bade fayde hain: output journal mein jata hai, `systemctl list-timers` se dikhte hain, dependencies ka intezaar kar sakte hain, aur `Persistent=true` wo job chalata hai jo machine band hone par chhoot gaya tha.'),
      TABLE(
        [
          ['cron: 30 2 * * *', 'systemd: OnCalendar=*-*-* 02:30:00', 'systemd: OnCalendar=*-*-* 02:30:00'],
          ['cron: */15 * * * *', 'systemd: OnCalendar=*:0/15', 'systemd: OnCalendar=*:0/15'],
          ['cron: 0 9 * * 1-5', 'systemd: OnCalendar=Mon..Fri *-*-* 09:00:00', 'systemd: OnCalendar=Mon..Fri *-*-* 09:00:00'],
          ['(no cron equivalent)', 'OnBootSec=10min  (10 minutes after boot)', 'OnBootSec=10min  (boot ke 10 minute baad)'],
          ['(no cron equivalent)', 'OnUnitActiveSec=1h  (1 hour after the job last ran)', 'OnUnitActiveSec=1h  (job ke aakhri baar chalne ke 1 ghante baad)'],
        ],
        'Cron is like',
        'Cron aisa hai'
      ),
      CMD('systemd-analyze calendar "Mon..Fri *-*-* 09:00:00"', 'Test an OnCalendar expression before you trust it: it prints the normalized form and the next time it will fire.', 'Bharosa karne se pehle OnCalendar expression test karo: ye normalized form aur agla fire hone ka time print karta hai.'),
      CMD(['systemctl list-timers --all | head -n 6'], 'Every timer on the machine, when it fires next and when it ran last. (apt, logrotate and man-db all use timers.)', 'Machine ka har timer, agla kab chalega aur aakhri baar kab chala. (apt, logrotate aur man-db sab timers use karte hain.)'),
      P('Let us build one. First the work (the service, type oneshot because it finishes), then the timer.', 'Chalo ek banate hain. Pehle kaam (service, oneshot type kyunki khatam ho jati hai), phir timer.'),
      CMD(TIMER_SETUP, 'The script and the service. Test the service on its own first: `sudo systemctl start mybackup`.', 'Script aur service. Pehle service ko akele test karo: `sudo systemctl start mybackup`.'),
      CMD(['printf "[Unit]\\nDescription=Run my backup every 15 minutes\\n\\n[Timer]\\nOnCalendar=*:0/15\\nPersistent=true\\n\\n[Install]\\nWantedBy=timers.target\\n" | sudo tee /etc/systemd/system/mybackup.timer > /dev/null', 'sudo systemctl daemon-reload', 'sudo systemctl enable --now mybackup.timer', 'systemctl list-timers | grep mybackup', 'timewarp 31m', 'journalctl -u mybackup.service --no-pager | tail -n 4'], 'Note the trick: you enable the TIMER, not the service. Then the journal proves that it ran.', 'Trick dekho: TIMER enable karte ho, service nahi. Phir journal saabit karta hai ki wo chala.'),
      JOB('When to choose what? **cron** for quick, simple recurring jobs, especially on older systems. **systemd timers** when you want logs in the journal, dependencies, or missed-run catch-up. **at** for one-offs. Many new servers use timers for everything. Be ready to explain both.', 'Kab kya chunein? **cron** tez, simple, baar-baar wale jobs ke liye, khaaskar purane systems par. **systemd timers** jab journal mein logs, dependencies ya missed-run catch-up chahiye. **at** ek-baar ke liye. Kai naye servers sab kuch timers se karte hain. Dono samjhane ke liye taiyar raho.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['crontab -e / -l / -r', 'edit / list / remove my jobs', 'mere jobs edit / list / remove'],
        ['m h dom mon dow  command', 'cron line (system files add a user column)', 'cron line (system files mein user column jodte hain)'],
        ['\\%  and full paths  and  >> log 2>&1', 'the three habits of working cron jobs', 'kaam karne wale cron jobs ki teen aadatein'],
        ['at TIME  /  atq  /  atrm N', 'one-off jobs', 'ek-baar ke jobs'],
        ['OnCalendar= / OnBootSec=', 'timer schedule keys', 'timer schedule keys'],
        ['systemctl list-timers', 'see timers', 'timers dekho'],
        ['systemd-analyze calendar "..."', 'test a timer expression', 'timer expression test karo'],
        ['timewarp 10m  (sandbox only)', 'jump the clock', 'ghadi aage karo'],
      ]),
    ],
    missions: [
      M('sched-m1', 'The 2:30 backup', '2:30 ka backup', 'Add a cron job to YOUR crontab that runs /usr/local/bin/backup.sh every day at 02:30 and appends all output (including errors) to /var/log/backup.log. Use a full path and the right redirect.', 'APNE crontab mein cron job jodo jo roz 02:30 par /usr/local/bin/backup.sh chalaye aur saara output (errors samet) /var/log/backup.log mein append kare. Poora path aur sahi redirect use karo.', 'The line is: 30 2 * * * /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1', 'Line hai: 30 2 * * * /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1', (sh) => /^30 2 \* \* \* \/usr\/local\/bin\/backup\.sh\s*>>\s*\/var\/log\/backup\.log\s+2>&1\s*$/m.test(LX.cat(sh, '/var/spool/cron/crontabs/learner')), ['echo "30 2 * * * /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" | crontab -']),
      M('sched-m2', 'A job from the future', 'Bhavishya ka job', 'Install at, schedule a one-off job that writes the word done into /tmp/future.txt five minutes from now, then use timewarp so that it actually runs.', 'at install karo, ek ek-baar ka job schedule karo jo paanch minute baad /tmp/future.txt mein done likhe, phir timewarp se use sach mein chalao.', 'sudo apt install -y at; echo "echo done > /tmp/future.txt" | at now + 5 minutes; timewarp 6m', 'sudo apt install -y at; echo "echo done > /tmp/future.txt" | at now + 5 minutes; timewarp 6m', (sh) => /done/.test(LX.cat(sh, '/tmp/future.txt')), ['sudo apt install -y at', 'echo "echo done > /tmp/future.txt" | at now + 5 minutes', 'timewarp 6m']),
      M('sched-m3', 'A modern timer', 'Ek modern timer', 'Build the timer mybackup.timer (OnCalendar=*:0/15) for the service mybackup.service (it is created by the lesson commands; create it again if needed) and enable it with --now so it shows up in systemctl list-timers.', 'Service mybackup.service ke liye timer mybackup.timer (OnCalendar=*:0/15) banao (lesson ke commands ise banate hain; zaroorat ho to dobara banao) aur --now se enable karo taaki wo systemctl list-timers mein dikhe.', 'Create the .timer file with tee, daemon-reload, then systemctl enable --now mybackup.timer', '.timer file tee se banao, daemon-reload, phir systemctl enable --now mybackup.timer', (sh) => { const t = sh.timers['mybackup.timer']; return !!t && t.active === true && t.enabled === true; }, TIMER_SETUP.concat(['printf "[Unit]\\nDescription=Run my backup\\n\\n[Timer]\\nOnCalendar=*:0/15\\nPersistent=true\\n\\n[Install]\\nWantedBy=timers.target\\n" | sudo tee /etc/systemd/system/mybackup.timer > /dev/null', 'sudo systemctl daemon-reload', 'sudo systemctl enable --now mybackup.timer'])),
    ],
    quiz: [
      mcq(1, 'In a crontab line, the FIRST field is...', 'Crontab line ka PEHLA field hai...', ['hour', 'minute', 'day of month', 'command'], 1, 'minute, hour, day of month, month, day of week, then the command.', 'minute, hour, day of month, month, day of week, phir command.'),
      mcq(2, 'What does "*/10 * * * *" mean?', '"*/10 * * * *" ka matlab?', ['Every 10 hours', 'Every 10 minutes', 'At minute 10 only', 'Every 10 days'], 1, '*/10 in the minute field is every 10 minutes.', 'Minute field mein */10 matlab har 10 minute.'),
      cmd(3, 'Install this crontab line for your user: run /home/learner/clean.sh every day at 06:15.', 'Apne user ke liye ye crontab line install karo: /home/learner/clean.sh roz 06:15 par chalao.', { verify: (sh) => /^15 6 \* \* \* \/home\/learner\/clean\.sh\s*$/m.test(LX.cat(sh, '/var/spool/cron/crontabs/learner')), sample: 'echo "15 6 * * * /home/learner/clean.sh" | crontab -', alt: ['(crontab -l 2>/dev/null; echo "15 6 * * * /home/learner/clean.sh") | crontab -'], wrong: ['echo "6 15 * * * /home/learner/clean.sh" | crontab -'], hintEn: 'minute 15, hour 6.', hintHi: 'minute 15, hour 6.' }, '15 6 * * * = minute 15 of hour 6.', '15 6 * * * = hour 6 ka minute 15.'),
      mcq(3 + 1, 'A cron job calls `mytool` which lives in /usr/local/bin. It works in your terminal but fails in cron with "not found". Why?', 'Cron job `mytool` bulata hai jo /usr/local/bin mein hai. Terminal mein chalta hai par cron mein "not found" aata hai. Kyun?', ['cron is broken', 'cron uses a very short PATH (/usr/bin:/bin)', 'mytool needs sudo', 'the clock is wrong'], 1, 'Cron\'s PATH is tiny. Use the full path /usr/local/bin/mytool.', 'Cron ka PATH bahut chhota hai. Poora path /usr/local/bin/mytool use karo.'),
      cmd(5, 'Show your own crontab.', 'Apna crontab dikhao.', { setup: ['echo "0 1 * * * echo hi" | crontab -'], verify: (sh, r) => /0 1 \* \* \* echo hi/.test(r.out), sample: 'crontab -l', wrong: ['crontab -r'], hintEn: 'It is the list flag.', hintHi: 'Ye list flag hai.' }, 'crontab -l lists.', 'crontab -l list karta hai.'),
      mcq(6, 'In a crontab line, why does `date +%F` fail?', 'Crontab line mein `date +%F` kyun fail hota hai?', ['date is not allowed', '% is special: it must be written \\%', 'F is not a format', 'cron cannot run date'], 1, 'An unescaped % ends the command and turns the rest into input. Write \\%F.', 'Bina escape wala % command khatam karke baaki ko input bana deta hai. \\%F likho.'),
      cmd(7, 'Schedule the command "touch /tmp/ran.txt" to run 10 minutes from now with at (install at first if needed).', 'Command "touch /tmp/ran.txt" ko at se 10 minute baad chalane ke liye schedule karo (zaroorat ho to pehle at install karo).', { verify: (sh) => (sh.atJobs || []).some((j) => /touch \/tmp\/ran\.txt/.test(j.cmd)), setup: ['sudo apt install -y at'], sample: 'echo "touch /tmp/ran.txt" | at now + 10 minutes', alt: ['echo "touch /tmp/ran.txt" | at now + 10 min'], wrong: ['touch /tmp/ran.txt'], hintEn: 'Pipe the command into at with a relative time.', hintHi: 'Command ko relative time ke saath at mein pipe karo.' }, 'at reads the command from standard input.', 'at command ko standard input se padhta hai.'),
      cmd(8, 'Make /tmp/tick.txt receive the word tick every minute through a cron job, then jump 3 minutes forward in time, in a single line.', 'Cron job se /tmp/tick.txt mein har minute tick likhwao, phir ek hi line mein time mein 3 minute aage jao.', { verify: (sh) => (LX.cat(sh, '/tmp/tick.txt').match(/tick/g) || []).length >= 3, sample: 'echo "* * * * * echo tick >> /tmp/tick.txt" | crontab - && timewarp 3m', alt: ['(crontab -l 2>/dev/null; echo "* * * * * echo tick >> /tmp/tick.txt") | crontab -; timewarp 3m'], wrong: ['timewarp 3m'], hintEn: 'Install a * * * * * line, then timewarp.', hintHi: '* * * * * line install karo, phir timewarp.' }, 'Every minute means three runs in three minutes.', 'Har minute matlab teen minute mein teen run.'),
      cmd(9, 'Check when the expression "*-*-* 04:30:00" fires next, using systemd.', 'systemd se check karo ki expression "*-*-* 04:30:00" agla kab fire hogi.', { verify: (sh, r) => /Normalized form: \*-\*-\* 04:30:00/.test(r.out) && /Next elapse/.test(r.out), sample: 'systemd-analyze calendar "*-*-* 04:30:00"', alt: ["systemd-analyze calendar '*-*-* 04:30:00'"], wrong: ['systemctl list-timers'], hintEn: 'systemd-analyze has a calendar subcommand.', hintHi: 'systemd-analyze ka calendar subcommand hota hai.' }, 'systemd-analyze calendar checks OnCalendar syntax.', 'systemd-analyze calendar OnCalendar syntax check karta hai.'),
      cmd(10, 'Boss level: in one line create a script /usr/local/bin/stamp.sh that appends the text stamp to /tmp/stamp.log, make it executable, put it in /etc/cron.hourly, and jump 2 hours forward so the hourly job runs.', 'Boss level: ek line mein /usr/local/bin/stamp.sh script banao jo /tmp/stamp.log mein stamp text append kare, use executable banao, /etc/cron.hourly mein rakho aur 2 ghante aage jao taaki hourly job chale.', { verify: (sh) => /stamp/.test(LX.cat(sh, '/tmp/stamp.log')), sample: 'printf "#!/bin/sh\\necho stamp >> /tmp/stamp.log\\n" | sudo tee /etc/cron.hourly/stamp > /dev/null && sudo chmod +x /etc/cron.hourly/stamp && sudo timewarp 2h', wrong: ['sudo timewarp 2h'], hintEn: 'Write the script directly into /etc/cron.hourly (no dot in its name), chmod +x, timewarp 2h.', hintHi: 'Script seedha /etc/cron.hourly mein likho (naam mein dot nahi), chmod +x, timewarp 2h.' }, 'Scripts dropped in /etc/cron.hourly are run by the :17 job of /etc/crontab.', '/etc/cron.hourly ki scripts /etc/crontab ka :17 wala job chalata hai.'),
    ],
  });
})();
