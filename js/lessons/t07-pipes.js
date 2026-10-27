(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'pipes',
    no: 7,
    key: '|',
    mins: 30,
    title: T('Pipes and Redirection', 'Pipes aur Redirection'),
    blurb: T('The big secret of Linux: small commands that you snap together like LEGO to do huge jobs.', 'Linux ka bada raaz: chhoti commands jinhe LEGO ki tarah jod kar bade kaam hote hain.'),
    blocks: [
      BIG(
        'Every command has **three pipes** attached to it: **stdin** (where input comes in), **stdout** (where normal output goes out) and **stderr** (where error messages go out). Normally stdin is your keyboard and stdout and stderr are your screen. **Redirection** and **pipes** let you reconnect them.',
        'Har command ke saath **teen pipes** jude hote hain: **stdin** (jahan se input aata hai), **stdout** (jahan normal output jata hai) aur **stderr** (jahan error messages jate hain). Normally stdin tumhara keyboard hai aur stdout aur stderr tumhari screen. **Redirection** aur **pipes** inhe dobara jodne dete hain.'
      ),
      STORY('Think of a water pipe in a factory. A tap pours water in one end. You can fill a bucket at the other end (redirect to a file), or connect the pipe to a filter and then to a second tap (pipe into another command). Small machines, joined with pipes, make a big factory.', 'Ek factory ka paani ka pipe socho. Ek taraf tonti se paani aata hai. Doosri taraf tum balti bhar sakte ho (file mein redirect), ya pipe ko filter se aur phir doosri tonti se jod sakte ho (doosri command mein pipe). Chhoti machines pipes se judkar bada factory banati hain.'),
      PRE(`keyboard --> [ command ] --> screen      (normal output, stdout)
                    |
                    +----------> screen      (errors, stderr)

command A | command B      A's output becomes B's input
command  > file            output goes into a file (replace)
command >> file            output is added to a file
command  < file            input is read from a file
command 2> file            only the errors go into a file`),
      H('Redirection: output into files', 'Redirection: output files mein'),
      CMD(['ls Documents > list.txt', 'cat list.txt'], 'Nothing prints on screen: the output went into list.txt instead.', 'Screen par kuch print nahi hua: output list.txt mein chala gaya.'),
      CMD(['ls /nonexistent 2> problems.txt', 'cat problems.txt'], '2> catches only the error messages. The screen stays clean and the complaint is saved.', '2> sirf error messages pakadta hai. Screen saaf rehti hai aur shikayat save ho jati hai.'),
      CMD('ls /nonexistent 2> /dev/null', '/dev/null is a black hole. Anything sent there disappears. Great for hiding noisy errors.', '/dev/null ek black hole hai. Wahan bheja gaya sab kuch gayab ho jata hai. Shor machane wale errors chhupane ke liye badhiya.'),
      CMD('wc -l < server.log', 'The < arrow feeds a file into the command as input. Compare with wc -l server.log: no file name in the answer!', '< arrow file ko command mein input bana kar deta hai. wc -l server.log se compare karo: jawab mein file ka naam nahi!'),
      H('Pipes: the vertical bar |', 'Pipes: seedhi line |'),
      P('The pipe symbol **|** (usually above the Enter key) sends the output of the command on its left straight into the command on its right.', 'Pipe ka nishaan **|** (aksar Enter key ke upar) apni baayein taraf wali command ka output seedha daayein taraf wali command mein bhej deta hai.'),
      ANAT([
        ['ls', 'cmd', 'produces a list of names', 'naamon ki list banata hai'],
        ['|', 'op', 'pipe: hand that list to the next command', 'pipe: ye list agli command ko do'],
        ['wc -l', 'cmd', 'counts lines, so it counts how many items', 'lines ginta hai, yaani kitne items hain'],
      ]),
      CMD('ls | wc -l', 'How many things are in this folder?', 'Is folder mein kitni cheezein hain?'),
      CMD('grep ERROR server.log | wc -l', 'Find the error lines, then count them.', 'Error wali lines dhoondho, phir unhe gino.'),
      H('The toolbox for pipes', 'Pipes ka toolbox'),
      TABLE(
        [
          ['sort file', 'sort lines alphabetically (-n numbers, -r reverse, -u unique)', 'lines ko alphabet ke hisaab se sort karo (-n numbers, -r ulta, -u unique)'],
          ['uniq', 'remove NEIGHBOURING duplicates (-c counts them). Sort first!', 'PAAS-PAAS ke duplicates hatao (-c ginta hai). Pehle sort karo!'],
          ['cut -d, -f2 file', 'take column 2 when columns are split by commas', 'jab columns comma se alag hon to column 2 lo'],
          ['head / tail', 'keep only the first / last lines', 'sirf pehli / aakhri lines rakho'],
          ['tr a-z A-Z', 'translate letters, e.g. make UPPERCASE', 'akshar badlo, jaise UPPERCASE banao'],
          ['tee file', 'show output AND save a copy into file', 'output dikhao AUR file mein copy save karo'],
          ['xargs cmd', 'turn incoming lines into arguments of cmd', 'aati hui lines ko cmd ke arguments banao'],
        ],
        'Tool',
        'Tool'
      ),
      TRY('Warm up with the single tools:', 'Pehle akele tools se warm up karo:', ['sort animals.txt', 'sort -n numbers.txt', 'cut -d, -f2 students.csv', 'echo hello | tr a-z A-Z']),
      H('Build a pipeline: which animal is most common?', 'Pipeline banao: sabse zyada kaun sa janwar hai?'),
      P('Let us solve a real puzzle by snapping tools together. animals.txt has one animal per line, with repeats. Build the answer one step at a time and run each step.', 'Ek asli paheli tools jod kar solve karte hain. animals.txt mein har line mein ek janwar hai, repeat ke saath. Jawab ek-ek step karke banao aur har step chalao.'),
      STEPS([
        ['`sort animals.txt` puts the same animals next to each other.', '`sort animals.txt` ek jaise janwaron ko paas-paas la deta hai.'],
        ['`| uniq -c` collapses neighbours and counts them.', '`| uniq -c` paas-paas walon ko ek karta hai aur ginta hai.'],
        ['`| sort -rn` sorts by that number, biggest first.', '`| sort -rn` us number se sort karta hai, sabse bada pehle.'],
        ['`| head -n 3` keeps the top three.', '`| head -n 3` top teen rakhta hai.'],
      ]),
      CMD('sort animals.txt | uniq -c | sort -rn | head -n 3', 'The whole pipeline: four small tools, one clear answer.', 'Poori pipeline: chaar chhote tools, ek saaf jawab.'),
      WARN('uniq only removes duplicates that sit NEXT to each other. If you forget to sort first, the answer will be wrong without any error message.', 'uniq sirf wahi duplicates hatata hai jo EK-DOOSRE KE PAAS hon. Pehle sort karna bhool gaye to jawab galat hoga aur koi error bhi nahi aayega.'),
      H('Chaining commands: && || ;', 'Commands ko jodna: && || ;'),
      TABLE([
        ['cmd1 ; cmd2', 'run cmd1, then cmd2, no matter what', 'cmd1 chalao, phir cmd2, chahe kuch bhi ho'],
        ['cmd1 && cmd2', 'run cmd2 ONLY IF cmd1 worked', 'cmd2 TABHI chalao jab cmd1 kaamyab ho'],
        ['cmd1 || cmd2', 'run cmd2 ONLY IF cmd1 failed', 'cmd2 TABHI chalao jab cmd1 fail ho'],
      ]),
      CMD('mkdir backup && echo "Folder created" || echo "Could not create folder"', 'Run it twice. The second time mkdir fails (the folder exists), so the || part runs.', 'Do baar chalao. Doosri baar mkdir fail hota hai (folder pehle se hai), to || wala hissa chalta hai.'),
      H('A quick peek at sed and awk', 'sed aur awk par ek jhalak'),
      P('Two more power tools you will meet often. **sed** edits text as it flows by. **awk** splits each line into columns called $1, $2, and so on.', 'Do aur power tools jo tumhe aksar milenge. **sed** behte hue text ko edit karta hai. **awk** har line ko columns mein todta hai jinhe $1, $2 waghera kehte hain.'),
      CMD("sed 's/cat/dog/g' animals.txt", 'Replace every cat with dog. The file itself is not changed, only what flows out.', 'Har cat ko dog se badlo. File khud nahi badalti, sirf jo bahar behta hai wo badalta hai.'),
      CMD("awk -F, '{print $2, $5}' students.csv", 'Print column 2 (name) and 5 (marks) of every row. -F, says the columns are split by commas.', 'Har row ka column 2 (naam) aur 5 (marks) print karo. -F, kehta hai ki columns comma se alag hain.'),
      CMD("awk -F, '$5 > 85 {print $2}' students.csv", 'Names of students with marks above 85.', 'Un students ke naam jinke marks 85 se upar hain.'),
      THINK('what is the difference between  ls > a.txt  and  ls | a.txt ?', ' ls > a.txt  aur  ls | a.txt  mein kya fark hai?', 'The arrow sends output into a FILE. The pipe sends output into another COMMAND. a.txt is not a command, so the second one fails.', 'Arrow output ko FILE mein bhejta hai. Pipe output ko doosri COMMAND mein bhejta hai. a.txt koi command nahi hai, isliye doosri line fail ho jati hai.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['cmd > file', 'output into file (replace)', 'output file mein (badal do)'],
        ['cmd >> file', 'output added to file', 'output file mein jodo'],
        ['cmd < file', 'file as input', 'file ko input banao'],
        ['cmd 2> file', 'errors into file', 'errors file mein'],
        ['cmd1 | cmd2', 'output of 1 is input of 2', '1 ka output 2 ka input'],
        ['sort | uniq -c', 'count duplicates', 'duplicates gino'],
        ['cmd1 && cmd2', 'cmd2 only if cmd1 worked', 'cmd2 tabhi jab cmd1 chale'],
      ]),
    ],
    missions: [
      M('pipes-m1', 'Top animal', 'Sabse zyada janwar', 'Build the pipeline that prints the single most common animal in animals.txt with its count.', 'Wo pipeline banao jo animals.txt ka sabse zyada aane wala janwar uski ginti ke saath print kare.', 'sort animals.txt | uniq -c | sort -rn | head -n 1', 'sort animals.txt | uniq -c | sort -rn | head -n 1', (sh, last) => !!last && /\|/.test(last.cmd) && /\buniq\b/.test(last.cmd) && /^\s*3 (dog|cat)\s*$/.test(last.out.trim()), ['sort animals.txt | uniq -c | sort -rn | head -n 1']),
      M('pipes-m2', 'Save the errors', 'Errors save karo', 'Save all the ERROR lines of server.log into a new file called errors.txt (it should have 5 lines).', 'server.log ki saari ERROR lines errors.txt naam ki nayi file mein save karo (usme 5 lines hone chahiye).', 'grep ERROR server.log > errors.txt', 'grep ERROR server.log > errors.txt', (sh) => sh.isFile('~/errors.txt') && sh.cat('~/errors.txt').trim().split('\n').length === 5 && /ERROR/.test(sh.cat('~/errors.txt')), ['grep ERROR server.log > errors.txt']),
      M('pipes-m3', 'Which cities?', 'Kaun se shehar?', 'List each city from students.csv only once, sorted. Use cut to take the city column (4th, comma separated), then sort and uniq.', 'students.csv ke har shehar ko sirf ek baar, sort karke list karo. cut se city column (4th, comma wala) lo, phir sort aur uniq lagao.', "cut -d, -f4 students.csv | sort | uniq", "cut -d, -f4 students.csv | sort | uniq", (sh, last) => !!last && /cut/.test(last.cmd) && /sort/.test(last.cmd) && /\|/.test(last.cmd) && /Jaipur/.test(last.out) && last.out.split('\n').filter((l) => l === 'Delhi').length === 1, ['cut -d, -f4 students.csv | sort | uniq']),
    ],
    quiz: [
      mcq(1, 'What does the pipe symbol | do?', 'Pipe nishaan | kya karta hai?', ['Sends the output of one command into another', 'Deletes a file', 'Starts a comment', 'Closes the terminal'], 0, 'A pipe connects stdout of the left command to stdin of the right one.', 'Pipe baayein command ke stdout ko daayein command ke stdin se jodta hai.'),
      mcq(2, 'What does a single arrow  >  do?', 'Akela arrow  >  kya karta hai?', ['Appends to a file', 'Writes output into a file, replacing it', 'Reads a file', 'Counts lines'], 1, '> replaces the file. Use >> to append.', '> file ko badal deta hai. Jodne ke liye >> use karo.'),
      mcq(3, 'Which symbol redirects only the ERROR messages (stderr) into a file?', 'Kaun sa symbol sirf ERROR messages (stderr) ko file mein bhejta hai?', ['>', '>>', '2>', '<'], 2, '2> redirects stream number 2, which is stderr.', '2> stream number 2 ko redirect karta hai, jo stderr hai.'),
      cmd(4, 'Print the numbers in numbers.txt sorted from smallest to biggest (as numbers, not as text).', 'numbers.txt ke numbers chhote se bade tak sort karke print karo (text nahi, number ki tarah).', { verify: (sh, r, c) => r.out.trim().split('\n').join(',') === '1,5,7,8,10,16,23,42' && /^\s*sort\b/.test(c), sample: 'sort -n numbers.txt', wrong: ['sort numbers.txt'], hintEn: 'Plain sort treats 10 as smaller than 5 (text order). One option fixes it.', hintHi: 'Seedha sort 10 ko 5 se chhota maanta hai (text order). Ek option isse theek karta hai.' }, '-n sorts numerically so 5 comes before 10.', '-n number ke hisaab se sort karta hai, isliye 5, 10 se pehle aata hai.'),
      cmd(5, 'Save the list of files in the Documents folder into a file called list.txt.', 'Documents folder ki files ki list list.txt naam ki file mein save karo.', { verify: (sh) => sh.isFile('list.txt') && sh.cat('list.txt').includes('homework.txt'), sample: 'ls Documents > list.txt', hintEn: 'ls and the arrow.', hintHi: 'ls aur arrow.' }, '> sends the ls output into list.txt.', '> ls ka output list.txt mein bhej deta hai.'),
      cmd(6, 'Using a pipe, count how many items are in your home folder. Print only the number.', 'Pipe se apne home folder mein kitne items hain gino. Sirf number print ho.', { verify: (sh, r, c) => /\|/.test(c) && /wc/.test(c) && r.out.trim() === String(sh.ls('.').filter((n) => !n.startsWith('.')).length), sample: 'ls | wc -l', hintEn: 'ls lists, wc -l counts.', hintHi: 'ls list karta hai, wc -l ginta hai.' }, 'ls prints one name per line when piped, and wc -l counts the lines.', 'Pipe hone par ls har line mein ek naam print karta hai, aur wc -l lines ginta hai.'),
      cmd(7, 'Print each animal of animals.txt exactly once, in alphabetical order.', 'animals.txt ka har janwar theek ek baar, alphabet ke order mein print karo.', { verify: (sh, r) => r.out.trim().split('\n').join(',') === 'cat,dog,elephant,lion,monkey,tiger,zebra', sample: 'sort animals.txt | uniq', alt: ['sort -u animals.txt'], hintEn: 'sort, then remove duplicates.', hintHi: 'sort karo, phir duplicates hatao.' }, 'After sorting, duplicates are neighbours, so uniq can remove them. sort -u does both at once.', 'Sort ke baad duplicates paas-paas aa jate hain, to uniq unhe hata sakta hai. sort -u dono ek saath karta hai.'),
      cmd(8, 'Run  ls /nonexistent  but send the error message into a file called err.txt, so nothing appears on screen.', ' ls /nonexistent  chalao par error message err.txt file mein bhej do, screen par kuch na aaye.', { verify: (sh, r) => sh.isFile('err.txt') && /No such file/.test(sh.cat('err.txt')) && r.all.trim() === '', sample: 'ls /nonexistent 2> err.txt', wrong: ['ls /nonexistent > err.txt'], hintEn: 'Errors travel on stream number 2.', hintHi: 'Errors stream number 2 par chalte hain.' }, 'With a plain > the error would still print, because it is not on stdout.', 'Seedhe > se error phir bhi print hota, kyunki wo stdout par nahi hota.'),
      cmd(9, 'Count how many ERROR lines server.log has, using a pipe. Print only the number.', 'Pipe se server.log mein kitni ERROR lines hain gino. Sirf number print ho.', { verify: (sh, r, c) => r.out.trim() === '5' && /\|/.test(c), sample: 'grep ERROR server.log | wc -l', hintEn: 'Find the lines, then count them.', hintHi: 'Lines dhoondho, phir unhe gino.' }, 'grep finds the five error lines and wc -l counts them.', 'grep paanch error lines dhoondhta hai aur wc -l unhe ginta hai.'),
      cmd(10, 'Boss level: show the 3 most common animals in animals.txt with their counts, most common first.', 'Boss level: animals.txt ke 3 sabse common janwar unki ginti ke saath dikhao, sabse common pehle.', { verify: (sh, r, c) => /\|/.test(c) && r.out.trim().split('\n').length === 3 && /^\s*3 /.test(r.out.trim().split('\n')[0]) && /^\s*2 elephant/.test(r.out.trim().split('\n')[2]), sample: 'sort animals.txt | uniq -c | sort -rn | head -n 3', alt: ['sort animals.txt | uniq -c | sort -nr | head -3'], hintEn: 'sort, uniq -c, sort -rn, head.', hintHi: 'sort, uniq -c, sort -rn, head.' }, 'Sorting groups equal lines, uniq -c counts them, sort -rn ranks by the count and head keeps three.', 'Sort barabar lines ko saath laata hai, uniq -c ginta hai, sort -rn ginti se rank karta hai aur head teen rakhta hai.'),
    ],
  });
})();
