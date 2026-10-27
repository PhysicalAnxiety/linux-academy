(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'search',
    no: 6,
    key: 'grep',
    mins: 25,
    title: T('Finding and Searching', 'Dhoondhna aur search karna'),
    blurb: T('find looks for files. grep looks inside files. Together they find any needle in any haystack.', 'find files dhoondhta hai. grep files ke andar dhoondhta hai. Dono mil kar kisi bhi bhusse mein se sui nikaal lete hain.'),
    blocks: [
      BIG(
        'There are two kinds of searching. **find** answers "where is the file called...?" by looking at names, types and sizes. **grep** answers "which lines contain the word...?" by reading inside files.',
        'Search do tarah ki hoti hai. **find** jawab deta hai "wo file kahan hai jiska naam...?" naam, type aur size dekh kar. **grep** jawab deta hai "kin lines mein ye shabd hai...?" files ke andar padh kar.'
      ),
      STORY('Your library has a thousand books. find is the librarian who finds the book by its title or colour. grep is the friend who flips through the pages and shows every sentence that mentions the word "dragon".', 'Tumhari library mein hazaar kitabein hain. find wo librarian hai jo kitab ko uske title ya rang se dhoondhta hai. grep wo dost hai jo panne palat kar har wo vakya dikhata hai jisme "dragon" shabd hai.'),
      H('grep: search inside files', 'grep: files ke andar search'),
      ANAT([
        ['grep', 'cmd', 'search for lines', 'lines dhoondho'],
        ['ERROR', 'arg', 'the word (pattern) to look for', 'jo shabd (pattern) dhoondhna hai'],
        ['server.log', 'arg', 'the file to search in', 'jis file mein dhoondhna hai'],
      ]),
      CMD('grep ERROR server.log', 'Prints only the lines that contain the word ERROR. Capital letters matter!', 'Sirf wo lines print karta hai jisme ERROR shabd hai. Bade akshar matter karte hain!'),
      TABLE(
        [
          ['grep -i banana fruits.txt', 'ignore upper or lower case (finds Banana too)', 'chhote-bade akshar ignore karo (Banana bhi milega)'],
          ['grep -n ERROR server.log', 'show line numbers', 'line numbers dikhao'],
          ['grep -c INFO server.log', 'just count the matching lines', 'sirf matching lines gino'],
          ['grep -v INFO server.log', 'invert: show lines that do NOT match', 'ulta: wo lines dikhao jo match NAHI karti'],
          ['grep -w is notes.txt', 'whole word only', 'sirf poora shabd'],
          ['grep -r Linux .', 'search every file in a folder and below', 'folder aur uske neeche ki har file mein search karo'],
          ['grep -rn Pasta Documents', 'recursive, with file name and line number', 'recursive, file ke naam aur line number ke saath'],
        ],
        'What it does',
        'Ye kya karta hai',
        true
      ),
      TRY('Hunt in the log file:', 'Log file mein shikaar karo:', ['grep WARN server.log', 'grep -c ERROR server.log', 'grep -n "logged in" server.log', 'grep -i -n banana fruits.txt']),
      TIP('Put the pattern in quotes when it has spaces: `grep "logged in" server.log`. Quotes keep it as one piece.', 'Pattern mein spaces hon to quotes lagao: `grep "logged in" server.log`. Quotes use ek tukde ki tarah rakhte hain.'),
      FUN('grep stands for "global regular expression print". Regular expressions are a tiny language for patterns: `grep "^2026"` finds lines that START with 2026, `grep "failed$"` finds lines that END with failed.', 'grep ka matlab "global regular expression print". Regular expressions pattern likhne ki ek chhoti bhasha hai: `grep "^2026"` wo lines dhoondhta hai jo 2026 se SHURU hoti hain, `grep "failed$"` wo jo failed par KHATAM hoti hain.'),
      CMD('grep "^2026-10-26 09:0" server.log', 'The ^ means "at the start of the line". This shows everything logged between 09:00 and 09:09.', '^ ka matlab "line ke shuru mein". Ye 09:00 se 09:09 ke beech ka sab kuch dikhata hai.'),
      H('find: search for files', 'find: files dhoondho'),
      ANAT([
        ['find', 'cmd', 'look for files', 'files dhoondho'],
        ['Documents', 'arg', 'start looking here (and in every folder below)', 'yahan se dhoondhna shuru karo (aur neeche ke har folder mein)'],
        ['-name', 'opt', 'the test: match the file name', 'test: file ke naam se match karo'],
        ["'*.txt'", 'arg', 'the pattern. Quotes stop the shell from expanding the star first.', 'pattern. Quotes shell ko star pehle expand karne se rokte hain.'],
      ]),
      CMD("find Documents -name '*.txt'", 'Finds every .txt file inside Documents, even deep inside other folders.', 'Documents ke andar har .txt file dhoondhta hai, doosre folders ke andar gehraai mein bhi.'),
      TABLE([
        ["find . -name '*.jpg'", 'all .jpg files from here down', 'yahan se neeche ki saari .jpg files'],
        ["find ~ -iname 'READ*'", 'ignore case, name starts with READ', 'case ignore, naam READ se shuru'],
        ['find . -type d', 'directories only (-type f for files)', 'sirf directories (files ke liye -type f)'],
        ['find ~ -size +1M', 'bigger than 1 megabyte', '1 megabyte se bade'],
        ['find . -empty', 'empty files and folders', 'khali files aur folders'],
        ['find . -mtime -1', 'changed in the last day', 'pichle ek din mein badle'],
        ["find playground -name '*.txt' -exec wc -l {} \\;", 'run a command on every match', 'har match par ek command chalao'],
      ], 'What it does', 'Ye kya karta hai', true),
      TRY('Explore with find:', 'find se khoj karo:', ["find ~ -name '*.jpg'", 'find ~ -type d -name "rec*"', 'find ~ -size +1M']),
      WARN('Quote the pattern after -name. Without quotes the shell may replace *.txt with the files in the current folder before find even starts, which gives confusing results.', '-name ke baad pattern ko quotes mein rakho. Bina quotes ke shell *.txt ko current folder ki files se badal sakta hai find ke shuru hone se pehle, jisse ulte-seedhe results milte hain.'),
      H('Quick locators: which and whereis', 'Jaldi dhoondhne wale: which aur whereis'),
      CMD('which grep', 'Where does a command live?', 'Command kahan rehti hai?'),
      THINK('when would you use find and when grep?', 'find kab use karoge aur grep kab?', 'Use find when you know something about the FILE (name, size, date). Use grep when you know something about the TEXT inside the file.', 'find tab use karo jab FILE ke baare mein kuch pata ho (naam, size, date). grep tab jab file ke andar ke TEXT ke baare mein kuch pata ho.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['grep word file', 'lines containing word', 'word wali lines'],
        ['grep -i / -n / -c / -v', 'ignore case / number / count / invert', 'case ignore / number / ginti / ulta'],
        ['grep -r word dir', 'search inside a folder tree', 'folder ke ped mein search'],
        ['find dir -name pattern', 'files by name', 'naam se files'],
        ['find dir -type f|d', 'only files or only directories', 'sirf files ya sirf directories'],
        ['find dir -size +1M', 'files by size', 'size se files'],
      ]),
    ],
    missions: [
      M('search-m1', 'Catch the errors', 'Errors pakdo', 'Show only the lines of server.log that contain ERROR. You should see 5 lines.', 'server.log ki sirf wo lines dikhao jisme ERROR hai. 5 lines dikhni chahiye.', 'grep ERROR server.log', 'grep ERROR server.log', (sh) => sh.log.some((r) => /^\s*grep\b/.test(r.cmd) && /ERROR/.test(r.cmd) && r.out.trim().split('\n').length === 5), ['grep ERROR server.log']),
      M('search-m2', 'Count the logins', 'Logins gino', 'How many INFO lines are in server.log? Make grep count them for you (12).', 'server.log mein kitni INFO lines hain? grep se ginwao (12).', 'Use the -c option.', '-c option use karo.', (sh) => sh.log.some((r) => /^\s*grep\b/.test(r.cmd) && /INFO/.test(r.cmd) && r.out.trim() === '12'), ['grep -c INFO server.log']),
      M('search-m3', 'Recipe hunt', 'Recipe ki khoj', 'Use find to list every .txt file inside the Documents folder. You should see pizza.txt among them.', 'find se Documents folder ke andar ki har .txt file list karo. Unme pizza.txt dikhni chahiye.', "find Documents -name '*.txt'", "find Documents -name '*.txt'", (sh) => sh.log.some((r) => /^\s*find\b/.test(r.cmd) && r.out.includes('pizza.txt') && r.out.includes('homework.txt')), ["find Documents -name '*.txt'"]),
    ],
    quiz: [
      mcq(1, 'What does grep do?', 'grep kya karta hai?', ['Searches for text inside files', 'Copies files', 'Changes folders', 'Shows the date'], 0, 'grep prints the lines that match a pattern.', 'grep pattern se match karne wali lines print karta hai.'),
      mcq(2, 'Which command searches for FILES by name?', 'Kaun si command naam se FILES dhoondhti hai?', ['grep', 'find', 'cat', 'echo'], 1, 'find looks at names, types, sizes and dates of files.', 'find files ke naam, type, size aur date dekhta hai.'),
      mcq(3, 'What does the -i option of grep do?', 'grep ke -i option ka kya kaam hai?', ['Shows line numbers', 'Ignores upper and lower case', 'Inverts the match', 'Counts lines'], 1, '-i means ignore case, so banana matches Banana.', '-i ka matlab ignore case, to banana, Banana se bhi match hota hai.'),
      cmd(4, 'Show the lines of server.log that contain WARN.', 'server.log ki wo lines dikhao jisme WARN hai.', { verify: (sh, r, c) => /^\s*grep\b/.test(c) && r.out.trim().split('\n').length === 3 && /WARN/.test(r.out), sample: 'grep WARN server.log', hintEn: 'grep pattern file', hintHi: 'grep pattern file' }, 'There are three WARN lines in the log.', 'Log mein teen WARN lines hain.'),
      cmd(5, 'Count how many lines of server.log contain the word User. Print only the number.', 'server.log ki kitni lines mein User shabd hai gino. Sirf number print ho.', { verify: (sh, r, c) => r.out.trim() === '6' && /^\s*grep\b/.test(c), sample: 'grep -c User server.log', hintEn: 'One grep option counts instead of printing.', hintHi: 'grep ka ek option print karne ki jagah ginta hai.' }, 'grep -c prints how many lines matched: 6.', 'grep -c batata hai kitni lines match hui: 6.'),
      cmd(6, 'Find banana in fruits.txt ignoring case, with line numbers. You should see both banana and Banana.', 'fruits.txt mein banana case ignore karke line numbers ke saath dhoondho. banana aur Banana dono dikhne chahiye.', { verify: (sh, r, c) => /^\s*grep\b/.test(c) && r.out.includes('2:banana') && r.out.includes('9:Banana'), sample: 'grep -in banana fruits.txt', alt: ['grep -ni banana fruits.txt', 'grep -i -n banana fruits.txt'], hintEn: 'Two options: i and n.', hintHi: 'Do options: i aur n.' }, '-i ignores case, -n adds line numbers.', '-i case ignore karta hai, -n line numbers jodta hai.'),
      mcq(7, 'What does  find . -type d  list?', ' find . -type d  kya list karta hai?', ['Only files', 'Only directories', 'Only deleted files', 'Only hidden files'], 1, '-type d means directories, -type f means regular files.', '-type d matlab directories, -type f matlab normal files.'),
      cmd(8, 'Find every .jpg file anywhere under your home folder (~).', 'Apne home folder (~) ke neeche kahin bhi saari .jpg files dhoondho.', { verify: (sh, r, c) => /^\s*find\b/.test(c) && ['beach.jpg', 'sunset.jpg', 'photo1.jpg'].every((n) => r.out.includes(n)), sample: "find ~ -name '*.jpg'", alt: ["find . -name '*.jpg'", 'find ~ -name "*.jpg"', "find /home -name '*.jpg'"], hintEn: 'find, where to start, -name and a pattern.', hintHi: 'find, kahan se shuru, -name aur ek pattern.' }, "-name '*.jpg' matches every name ending in .jpg.", "-name '*.jpg' har wo naam match karta hai jo .jpg par khatam hota hai."),
      cmd(9, 'Show every line of server.log that does NOT contain INFO.', 'server.log ki har wo line dikhao jisme INFO NAHI hai.', { verify: (sh, r, c) => /^\s*grep\b/.test(c) && r.out.trim().split('\n').length === 8 && !r.out.includes('INFO'), sample: 'grep -v INFO server.log', hintEn: 'Invert the match.', hintHi: 'Match ko ulta karo.' }, '-v inverts the match: it shows the 3 WARN and 5 ERROR lines.', '-v match ulta karta hai: ye 3 WARN aur 5 ERROR lines dikhata hai.'),
      cmd(10, 'Boss level: search every file under Documents for the word Pasta. Show the file name and the line number in the result.', 'Boss level: Documents ke neeche ki har file mein Pasta shabd dhoondho. Result mein file ka naam aur line number dikhna chahiye.', { verify: (sh, r, c) => /^\s*grep\b/.test(c) && /pasta\.txt:1:Pasta/.test(r.out), sample: 'grep -rn Pasta Documents', alt: ['grep -nr Pasta Documents', 'grep -rn Pasta ~/Documents', 'grep -r -n Pasta Documents'], hintEn: 'Recursive and number options together.', hintHi: 'Recursive aur number options saath mein.' }, '-r walks through folders and -n adds line numbers; with several files grep also prints the file name.', '-r folders mein ghoomta hai aur -n line numbers jodta hai; kai files hon to grep file ka naam bhi print karta hai.'),
    ],
  });
})();
