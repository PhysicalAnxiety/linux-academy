/* Linux Academy: man pages and --help text for the sandbox */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const H = (LX.HELP = {});
  const add = (name, n, s, d, o, e) => (H[name] = { n, s, d, o: o || [], e: e || [] });

  add('ls', 'list directory contents', 'ls [OPTION]... [FILE]...', 'List information about the FILEs (the current directory by default).', [['-a, --all', 'do not ignore entries starting with .'], ['-A, --almost-all', 'like -a but skip . and ..'], ['-l', 'use a long listing format'], ['-h, --human-readable', 'with -l, print sizes like 1K 234M 2G'], ['-t', 'sort by modification time, newest first'], ['-S', 'sort by file size, largest first'], ['-r, --reverse', 'reverse order while sorting'], ['-R, --recursive', 'list subdirectories recursively'], ['-d, --directory', 'list directories themselves, not their contents'], ['-1', 'list one file per line'], ['-F', 'append indicator (one of */=>@|) to entries']], [['ls -la', 'long listing including hidden files'], ['ls -lh ~/Downloads', 'human-readable sizes']]);
  add('cd', 'change the working directory', 'cd [DIR]', 'Change the current directory to DIR. With no DIR, go to your home directory. cd - goes back to the previous directory.', [], [['cd ~/Documents', 'go to Documents in your home'], ['cd ..', 'go up one level']]);
  add('pwd', 'print name of current/working directory', 'pwd [OPTION]...', 'Print the full filename of the current working directory.');
  add('mkdir', 'make directories', 'mkdir [OPTION]... DIRECTORY...', 'Create the DIRECTORY(ies), if they do not already exist.', [['-p, --parents', 'make parent directories as needed, no error if existing'], ['-v, --verbose', 'print a message for each created directory'], ['-m, --mode=MODE', 'set file mode (as in chmod)']], [['mkdir -p a/b/c', 'create nested folders in one go']]);
  add('rmdir', 'remove empty directories', 'rmdir [OPTION]... DIRECTORY...', 'Remove the DIRECTORY(ies), if they are empty.');
  add('touch', 'change file timestamps (or create empty files)', 'touch [OPTION]... FILE...', 'Update the access and modification times of each FILE to the current time. A FILE that does not exist is created empty.', [['-c, --no-create', 'do not create any files']], [['touch a.txt b.txt', 'create two empty files']]);
  add('cp', 'copy files and directories', 'cp [OPTION]... SOURCE... DEST', 'Copy SOURCE to DEST, or multiple SOURCE(s) to a directory.', [['-r, -R, --recursive', 'copy directories recursively'], ['-i, --interactive', 'prompt before overwrite'], ['-n, --no-clobber', 'do not overwrite an existing file'], ['-v, --verbose', 'explain what is being done']], [['cp notes.txt backup.txt', 'copy a file'], ['cp -r photos photos_backup', 'copy a folder']]);
  add('mv', 'move (rename) files', 'mv [OPTION]... SOURCE... DEST', 'Rename SOURCE to DEST, or move SOURCE(s) to DIRECTORY.', [['-i, --interactive', 'prompt before overwrite'], ['-n, --no-clobber', 'do not overwrite an existing file'], ['-v, --verbose', 'explain what is being done']], [['mv old.txt new.txt', 'rename a file'], ['mv a.txt ~/Documents/', 'move a file']]);
  add('rm', 'remove files or directories', 'rm [OPTION]... [FILE]...', 'Remove (unlink) the FILE(s). There is no recycle bin: removed files are gone for good.', [['-f, --force', 'ignore nonexistent files, never prompt'], ['-i', 'prompt before every removal'], ['-r, -R, --recursive', 'remove directories and their contents recursively'], ['-v, --verbose', 'explain what is being done'], ['-d, --dir', 'remove empty directories']], [['rm -i file.txt', 'ask first'], ['rm -r old_folder', 'delete a folder and everything inside']]);
  add('ln', 'make links between files', 'ln [OPTION]... TARGET LINK_NAME', 'Create a link to TARGET with the name LINK_NAME. Use -s for a symbolic (soft) link, like a shortcut.', [['-s, --symbolic', 'make symbolic links instead of hard links'], ['-f, --force', 'remove existing destination files']], [['ln -s /var/log logs', 'make a shortcut called logs']]);
  add('cat', 'concatenate files and print on the standard output', 'cat [OPTION]... [FILE]...', 'Concatenate FILE(s) to standard output. With no FILE, read standard input.', [['-n, --number', 'number all output lines'], ['-b', 'number nonempty output lines'], ['-E', 'display $ at end of each line']], [['cat notes.txt', 'show a file'], ['cat a.txt b.txt > all.txt', 'join two files']]);
  add('less', 'view a file one screen at a time', 'less [OPTION]... FILE', 'A pager: scroll through a file. Space = next page, b = back, /word = search, q = quit.');
  add('more', 'view a file one screen at a time', 'more [OPTION]... FILE', 'A simple pager. Space = next page, q = quit.');
  add('head', 'output the first part of files', 'head [OPTION]... [FILE]...', 'Print the first 10 lines of each FILE to standard output.', [['-n, --lines=NUM', 'print the first NUM lines'], ['-c, --bytes=NUM', 'print the first NUM bytes']], [['head -n 3 server.log', 'first three lines']]);
  add('tail', 'output the last part of files', 'tail [OPTION]... [FILE]...', 'Print the last 10 lines of each FILE to standard output.', [['-n, --lines=NUM', 'output the last NUM lines'], ['-f, --follow', 'keep the file open and print new lines as they appear']], [['tail -n 5 server.log', 'last five lines'], ['tail -f server.log', 'watch a log live']]);
  add('wc', 'print newline, word, and byte counts for each file', 'wc [OPTION]... [FILE]...', 'Print newline, word, and byte counts for each FILE.', [['-l, --lines', 'print the newline counts'], ['-w, --words', 'print the word counts'], ['-c, --bytes', 'print the byte counts'], ['-m, --chars', 'print the character counts']], [['wc -l notes.txt', 'count lines']]);
  add('echo', 'display a line of text', 'echo [-neE] [STRING]...', 'Echo the STRING(s) to standard output.', [['-n', 'do not output the trailing newline'], ['-e', 'enable interpretation of backslash escapes like \\n and \\t']], [['echo "Hello" > hi.txt', 'write text into a file']]);
  add('printf', 'format and print data', 'printf FORMAT [ARGUMENT]...', 'Print ARGUMENT(s) according to FORMAT, like the C function printf.', [], [['printf "%s is %d\\n" Ravi 12', 'Ravi is 12']]);
  add('nano', 'small and friendly text editor', 'nano [OPTIONS] [[+LINE] FILE]...', 'Edit text files in the terminal. Ctrl+O saves ("Write Out"), Ctrl+X exits.');
  add('vim', 'Vi IMproved, a programmer\'s text editor', 'vim [options] [file ..]', 'A powerful modal editor. In this sandbox it opens the same simple editor as nano.');
  add('grep', 'print lines that match patterns', 'grep [OPTION]... PATTERNS [FILE]...', 'Search for PATTERNS in each FILE. Prints every line that contains a match.', [['-i, --ignore-case', 'ignore case distinctions'], ['-v, --invert-match', 'select non-matching lines'], ['-n, --line-number', 'print line number with output lines'], ['-c, --count', 'print only a count of matching lines'], ['-r, --recursive', 'read all files under each directory'], ['-w, --word-regexp', 'match only whole words'], ['-E, --extended-regexp', 'PATTERNS are extended regular expressions'], ['-l, --files-with-matches', 'print only names of files with matches'], ['-o, --only-matching', 'show only the matching part'], ['-A NUM', 'print NUM lines of trailing context'], ['-B NUM', 'print NUM lines of leading context'], ['-C NUM', 'print NUM lines of context']], [['grep ERROR server.log', 'lines with ERROR'], ['grep -rn "TODO" .', 'search a whole folder']]);
  add('find', 'search for files in a directory hierarchy', 'find [-H] [-L] [starting-point...] [expression]', 'Walk the file tree from each starting point and evaluate the expression for every file.', [['-name PATTERN', 'file name matches the shell pattern (case sensitive)'], ['-iname PATTERN', 'like -name but ignores case'], ['-type f|d|l', 'file, directory or symbolic link'], ['-size [+-]N[ckMG]', 'file uses more (+) or less (-) than N units'], ['-empty', 'file or directory is empty'], ['-mtime [+-]N', 'modified N days ago'], ['-maxdepth N', 'descend at most N levels'], ['-exec CMD {} \\;', 'run CMD on each match'], ['-delete', 'delete matched files']], [['find . -name "*.txt"', 'every .txt file here and below'], ['find ~ -type d -name "rec*"', 'folders starting with rec']]);
  add('sort', 'sort lines of text files', 'sort [OPTION]... [FILE]...', 'Write sorted concatenation of all FILE(s) to standard output.', [['-r, --reverse', 'reverse the result of comparisons'], ['-n, --numeric-sort', 'compare according to string numerical value'], ['-u, --unique', 'output only the first of equal lines'], ['-f, --ignore-case', 'fold lower case to upper case'], ['-k, --key=KEYDEF', 'sort via a key, e.g. -k2'], ['-t, --field-separator=SEP', 'use SEP instead of blank to field splitting']], [['sort -n numbers.txt', 'sort numbers properly'], ['sort -t, -k5 -n students.csv', 'sort a CSV by the 5th column']]);
  add('uniq', 'report or omit repeated lines', 'uniq [OPTION]... [INPUT]', 'Filter adjacent matching lines. Tip: sort first, because only neighbouring duplicates are noticed.', [['-c, --count', 'prefix lines by the number of occurrences'], ['-d, --repeated', 'only print duplicate lines'], ['-u, --unique', 'only print unique lines'], ['-i, --ignore-case', 'ignore differences in case']], [['sort animals.txt | uniq -c', 'count each animal']]);
  add('cut', 'remove sections from each line of files', 'cut OPTION... [FILE]...', 'Print selected parts of lines from each FILE.', [['-d, --delimiter=DELIM', 'use DELIM instead of TAB for field delimiter'], ['-f, --fields=LIST', 'select only these fields'], ['-c, --characters=LIST', 'select only these characters']], [['cut -d, -f2 students.csv', 'second column of a CSV']]);
  add('tr', 'translate or delete characters', 'tr [OPTION]... SET1 [SET2]', 'Translate, squeeze, and/or delete characters from standard input.', [['-d, --delete', 'delete characters in SET1'], ['-s, --squeeze-repeats', 'squeeze repeated characters']], [['echo hello | tr a-z A-Z', 'HELLO']]);
  add('tee', 'read from standard input and write to standard output and files', 'tee [OPTION]... [FILE]...', 'Copy standard input to each FILE, and also to standard output.', [['-a, --append', 'append to the given FILEs, do not overwrite']], [['ls | tee list.txt', 'show and save at the same time']]);
  add('xargs', 'build and execute command lines from standard input', 'xargs [OPTION]... COMMAND [INITIAL-ARGS]...', 'Run COMMAND with arguments taken from standard input.', [['-n NUM', 'use at most NUM arguments per command line'], ['-I REPLACE', 'replace REPLACE in the command with each input line']], [['find . -name "*.log" | xargs wc -l', 'count lines in each log']]);
  add('sed', 'stream editor for filtering and transforming text', 'sed [OPTION]... {script} [input-file]...', 'Apply an editing script to each line. The most common script is s/old/new/ (substitute).', [['-n', 'suppress automatic printing'], ['-i', 'edit files in place'], ['-E', 'use extended regular expressions']], [["sed 's/cat/dog/g' animals.txt", 'replace every cat with dog'], ["sed -n '2,4p' notes.txt", 'print only lines 2 to 4']]);
  add('awk', 'pattern scanning and text processing language', "awk [-F fs] 'program' [file ...]", 'Split every line into fields ($1, $2, ...) and run actions on them.', [['-F fs', 'use fs as the field separator']], [["awk -F, '{print $2}' students.csv", 'print the name column'], ["awk -F, '$5 > 80' students.csv", 'rows where marks are above 80']]);
  add('diff', 'compare files line by line', 'diff [OPTION]... FILES', 'Compare FILES line by line. Lines starting with < are from the first file, > from the second.');
  add('file', 'determine file type', 'file [OPTION...] [FILE...]', 'Look at each FILE and tell what kind of data it holds.');
  add('stat', 'display file or file system status', 'stat [OPTION]... FILE...', 'Display detailed information: size, permissions, owner, timestamps.');
  add('du', 'estimate file space usage', 'du [OPTION]... [FILE]...', 'Summarize disk usage of the set of FILEs, recursively for directories.', [['-h, --human-readable', 'print sizes in human readable format (K, M, G)'], ['-s, --summarize', 'display only a total for each argument'], ['-a, --all', 'write counts for all files, not just directories'], ['-d, --max-depth=N', 'print totals only N levels deep']], [['du -sh ~/Downloads', 'how big is Downloads?']]);
  add('df', 'report file system disk space usage', 'df [OPTION]... [FILE]...', 'Show how much disk space is used and available on each file system.', [['-h, --human-readable', 'print sizes in powers of 1024 (e.g., 1023M)']], [['df -h', 'readable disk usage']]);
  add('free', 'display amount of free and used memory in the system', 'free [options]', 'Show how much RAM and swap is used and free.', [['-h, --human', 'show human-readable output'], ['-m', 'display the amount of memory in mebibytes']]);
  add('chmod', 'change file mode bits', 'chmod [OPTION]... MODE[,MODE]... FILE...', 'Change the permissions of each FILE to MODE. MODE can be numbers like 755 or symbols like u+x.', [['-R, --recursive', 'change files and directories recursively'], ['-v, --verbose', 'output a diagnostic for every file processed']], [['chmod +x script.sh', 'make a script runnable'], ['chmod 600 secret.txt', 'only the owner can read and write'], ['chmod u=rwx,g=rx,o= file', 'symbolic form']]);
  add('chown', 'change file owner and group', 'chown [OPTION]... [OWNER][:[GROUP]] FILE...', 'Change the owner and/or group of each FILE. Usually needs sudo.', [['-R, --recursive', 'operate on files and directories recursively']], [['sudo chown bob:bob file.txt', 'give the file to bob']]);
  add('chgrp', 'change group ownership', 'chgrp [OPTION]... GROUP FILE...', 'Change the group of each FILE to GROUP.');
  add('umask', 'set file mode creation mask', 'umask [mode]', 'Show or set which permission bits are removed from newly created files.');
  add('sudo', 'execute a command as another user', 'sudo [-u user] command', 'Run a command with the privileges of the superuser (root) or another user.', [['-u user', 'run the command as user instead of root'], ['-i', 'run a login shell as root'], ['-l', 'list the commands you may run']], [['sudo apt update', 'refresh the package list']]);
  add('su', 'change user ID or become superuser', 'su [options] [-] [user]', 'Start a shell as another user. Type exit to come back.');
  add('whoami', 'print effective user name', 'whoami', 'Print the user name associated with the current effective user ID.');
  add('id', 'print real and effective user and group IDs', 'id [OPTION]... [USER]', 'Print user and group information for the specified USER, or the current user.');
  add('groups', 'print the groups a user is in', 'groups [OPTION]... [USERNAME]...', 'Print group memberships for each USERNAME or the current process.');
  add('useradd', 'create a new user', 'useradd [options] LOGIN', 'Create a new user account. Needs root.', [['-m', 'create the user\'s home directory']], [['sudo useradd -m asha', 'add user asha with a home folder']]);
  add('ps', 'report a snapshot of the current processes', 'ps [options]', 'Display information about running processes.', [['aux', 'every process, with owner and CPU/memory use'], ['-ef', 'every process, full format']], [['ps aux', 'see everything running']]);
  add('top', 'display Linux processes', 'top [options]', 'A live view of the processes using the most CPU and memory. Press q to quit.');
  add('kill', 'send a signal to a process', 'kill [-s sigspec | -sigspec] pid | jobspec', 'Send a signal (default TERM, "please stop") to a process.', [['-9, -KILL', 'force it to stop immediately'], ['-l', 'list signal names']], [['kill 4001', 'ask process 4001 to stop'], ['kill -9 4001', 'force-stop it']]);
  add('killall', 'kill processes by name', 'killall [-signal] name...', 'Send a signal to all processes running the named command.');
  add('pkill', 'signal processes based on name', 'pkill [-signal] pattern', 'Send a signal to processes whose name matches the pattern.');
  add('pgrep', 'look up processes based on name', 'pgrep [options] pattern', 'Print the process IDs of processes whose name matches the pattern.', [['-l', 'also print the process name']]);
  add('jobs', 'display status of jobs', 'jobs [-l]', 'List background and stopped jobs of the current shell.');
  add('fg', 'move job to the foreground', 'fg [job_spec]', 'Bring a background or stopped job back to the foreground.');
  add('bg', 'move jobs to the background', 'bg [job_spec]', 'Resume a stopped job in the background.');
  add('sleep', 'delay for a specified amount of time', 'sleep NUMBER[SUFFIX]...', 'Pause for NUMBER seconds. SUFFIX may be s, m, h or d.', [], [['sleep 30 &', 'sleep in the background']]);
  add('systemctl', 'control the systemd system and service manager', 'systemctl [OPTIONS...] COMMAND [UNIT...]', 'Start, stop, enable and inspect services.', [['status UNIT', 'show whether a service is running'], ['start|stop|restart UNIT', 'control a service (needs sudo)'], ['enable|disable UNIT', 'start or not start at boot']], [['systemctl status ssh', 'is SSH running?']]);
  add('apt', 'command-line interface for package management', 'apt [options] command', 'Install, remove and search software packages. Most commands need sudo.', [['update', 'download the latest package lists'], ['upgrade', 'install newer versions of installed packages'], ['install PKG', 'install a package'], ['remove PKG', 'remove a package'], ['search WORD', 'search package descriptions'], ['show PKG', 'show details about a package']], [['sudo apt install tree', 'install the tree command']]);
  add('tar', 'an archiving utility', 'tar [OPTION...] [FILE]...', 'Create, list or extract archives (tarballs).', [['-c', 'create a new archive'], ['-x', 'extract files from an archive'], ['-t', 'list the contents of an archive'], ['-z', 'filter through gzip (.tar.gz)'], ['-v', 'verbosely list files processed'], ['-f ARCHIVE', 'use this archive file'], ['-C DIR', 'change to DIR before extracting']], [['tar -czvf pics.tar.gz Pictures', 'pack a folder'], ['tar -xzvf pics.tar.gz', 'unpack it']]);
  add('gzip', 'compress or expand files', 'gzip [OPTION]... [FILE]...', 'Compress FILEs (adds .gz). Use -d (or gunzip) to decompress.', [['-d, --decompress', 'decompress'], ['-k, --keep', 'keep the original file']]);
  add('gunzip', 'decompress files', 'gunzip [OPTION]... [FILE]...', 'Uncompress .gz files.');
  add('zip', 'package and compress (archive) files', 'zip [options] zipfile files...', 'Create a .zip archive.', [['-r', 'travel the directory structure recursively']]);
  add('unzip', 'list, test and extract compressed files in a ZIP archive', 'unzip [options] file[.zip]', 'Extract a .zip archive.', [['-d DIR', 'extract into DIR']]);
  add('ping', 'send ICMP ECHO_REQUEST to network hosts', 'ping [options] destination', 'Check whether another computer is reachable and how long a round trip takes. Press Ctrl+C to stop.', [['-c COUNT', 'stop after sending COUNT packets']], [['ping -c 4 example.com', 'send exactly four pings']]);
  add('curl', 'transfer a URL', 'curl [options] [URL...]', 'Fetch data from a URL and print it.', [['-s', 'silent mode'], ['-I', 'show only response headers'], ['-i', 'include response headers'], ['-o FILE', 'write output to FILE'], ['-O', 'save with the remote file name'], ['-L', 'follow redirects']], [['curl example.com', 'show the page'], ['curl -o page.html example.com', 'save it']]);
  add('wget', 'the non-interactive network downloader', 'wget [option]... [URL]...', 'Download files from the web.', [['-O FILE', 'write output to FILE'], ['-q', 'quiet']]);
  add('ip', 'show / manipulate routing, network devices', 'ip [ OPTIONS ] OBJECT { COMMAND }', 'Inspect network interfaces and routes.', [['addr', 'show IP addresses'], ['route', 'show the routing table'], ['link', 'show network interfaces']], [['ip addr', 'what is my IP?']]);
  add('ss', 'another utility to investigate sockets', 'ss [options]', 'Show network connections and listening ports.', [['-t', 'TCP sockets'], ['-u', 'UDP sockets'], ['-l', 'listening sockets only'], ['-n', 'numbers instead of names'], ['-p', 'show the process (needs sudo)']], [['ss -tuln', 'which ports are open?']]);
  add('nslookup', 'query Internet name servers interactively', 'nslookup [name]', 'Look up the IP address behind a domain name.');
  add('ssh', 'OpenSSH remote login client', 'ssh [options] [user@]hostname', 'Log in to another computer securely.');
  add('scp', 'OpenSSH secure file copy', 'scp [options] source ... target', 'Copy files between computers over SSH.');
  add('man', 'an interface to the system reference manuals', 'man [section] page', 'Display the manual page for a command. Press q to leave.');
  add('which', 'locate a command', 'which [-a] filename ...', 'Print the full path of the executable that would run.');
  add('whereis', 'locate the binary, source, and manual page files for a command', 'whereis name...', 'Show where a command, its manual page, and sources live.');
  add('type', 'display information about command type', 'type [-t] name', 'Tell whether a name is an alias, builtin, function or program.');
  add('alias', 'define or display aliases', 'alias [name[=value] ...]', 'Create a short nickname for a longer command.', [], [["alias ll='ls -la'", 'then type ll']]);
  add('history', 'display or manipulate the history list', 'history [n]', 'Show the commands you typed before. Use !N to re-run number N, !! for the last one.', [['-c', 'clear the history']]);
  add('export', 'set the export attribute for variables', 'export [name[=value] ...]', 'Mark variables so that programs started from the shell can see them.');
  add('env', 'run a program in a modified environment', 'env [NAME=VALUE]... [COMMAND]', 'Print the environment variables, or run a command with extra ones.');
  add('read', 'read a line from standard input', 'read [-p prompt] [name ...]', 'Read a line and store the words in variables.');
  add('source', 'execute commands from a file in the current shell', 'source filename', 'Read and run commands from a file, like running it here and now.');
  add('bash', 'GNU Bourne-Again SHell', 'bash [options] [file]', 'Run the shell, or run a script file with it.', [['-c STRING', 'run commands from STRING']]);
  add('date', 'print or set the system date and time', 'date [OPTION]... [+FORMAT]', 'Display the current time in the given FORMAT.', [['+%Y-%m-%d', 'year-month-day'], ['+%H:%M:%S', 'hours:minutes:seconds']], [['date +%F', 'e.g. 2026-10-26']]);
  add('uname', 'print system information', 'uname [OPTION]...', 'Print certain system information. With no OPTION, same as -s.', [['-a', 'print all information'], ['-r', 'kernel release']]);
  add('uptime', 'tell how long the system has been running', 'uptime [options]', 'Show current time, how long the system has been up and the load average.');
  add('hostname', 'show or set the system\'s host name', 'hostname [-I]', 'Show the computer\'s name. -I shows its IP address.');
  add('clear', 'clear the terminal screen', 'clear', 'Clear the screen. You can also press Ctrl+L.');
  add('tree', 'list contents of directories in a tree-like format', 'tree [-ad] [-L level] [directory ...]', 'Draw a directory as a tree.', [['-a', 'show hidden files'], ['-d', 'directories only'], ['-L N', 'descend only N levels deep']]);
  add('seq', 'print a sequence of numbers', 'seq [OPTION]... LAST', 'Print numbers from FIRST to LAST in steps of INCREMENT.', [], [['seq 1 5', '1 2 3 4 5']]);
  add('basename', 'strip directory and suffix from filenames', 'basename NAME [SUFFIX]', 'Print NAME with any leading directory components removed.');
  add('dirname', 'strip last component from file name', 'dirname NAME', 'Print NAME with its last component removed.');
  add('crontab', 'maintain crontab files for individual users', 'crontab [-e | -l | -r]', 'Schedule commands to run automatically at set times.', [['-e', 'edit your crontab'], ['-l', 'list your crontab'], ['-r', 'remove your crontab']], [['crontab -e', 'add a scheduled job']]);
  add('test', 'check file types and compare values', 'test EXPRESSION', 'Exit with status 0 (true) or 1 (false) depending on EXPRESSION. [ EXPRESSION ] is the same.', [['-f FILE', 'FILE exists and is a regular file'], ['-d FILE', 'FILE exists and is a directory'], ['-e FILE', 'FILE exists'], ['-z STRING', 'STRING is empty'], ['A -eq B', 'numbers are equal (also -ne -lt -gt -le -ge)']]);
  add('cowsay', 'configurable speaking cow', 'cowsay [text]', 'A cow that says what you tell it.');

  LX.helpText = function (name) {
    const h = H[name];
    if (!h) return '';
    let out = `Usage: ${h.s}\n${h.d}\n`;
    if (h.o.length) {
      out += '\n';
      const w = Math.min(28, Math.max(...h.o.map((x) => x[0].length)) + 4);
      for (const [f, t] of h.o) out += '  ' + f.padEnd(w) + t + '\n';
    }
    if (h.e.length) {
      out += '\nExamples:\n';
      for (const [e, t] of h.e) out += `  ${e}\n      ${t}\n`;
    }
    return out;
  };
  LX.manPage = function (name) {
    const h = H[name];
    const T = name.toUpperCase();
    const head = `${T}(1)`.padEnd(30) + 'User Commands'.padEnd(30) + `${T}(1)`;
    let out = `${head}\n\nNAME\n       ${name} - ${h.n}\n\nSYNOPSIS\n       ${h.s}\n\nDESCRIPTION\n       ${h.d}\n`;
    if (h.o.length) {
      out += '\nOPTIONS\n';
      for (const [f, t] of h.o) out += `       ${f}\n              ${t}\n\n`;
    }
    if (h.e.length) {
      out += '\nEXAMPLES\n';
      for (const [e, t] of h.e) out += `       ${e}\n              ${t}\n\n`;
    }
    out += `\n${' '.repeat(30)}Linux Academy${' '.repeat(26)}${T}(1)\n`;
    return out;
  };
})();
