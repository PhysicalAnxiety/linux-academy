const LX = require('./load.js');
async function run(sh, line) {
  let out = '';
  await sh.run(line, { stdout: (s) => (out += s), stderr: (s) => (out += s) });
  return LX.stripAnsi(out);
}
(async () => {
  const sh = new LX.Shell({ fast: true });
  const tests = [
    'lsblk',
    'sudo fdisk -l /dev/sdb',
    'printf "g\\nn\\n\\n\\n+4G\\nn\\n\\n\\n\\nw\\n" | sudo fdisk /dev/sdb',
    'lsblk /dev/sdb',
    'sudo mkfs.ext4 -L data /dev/sdb1 | head -4',
    'sudo mkdir /data; sudo mount /dev/sdb1 /data; df -h /data; lsblk -f | grep sdb',
    'sudo touch /data/hello; ls /data; sudo umount /data; ls /data; sudo mount /dev/sdb1 /data; ls /data',
    'blkid /dev/sdb1; sudo blkid /dev/sdb1',
    'sudo mkfs.xfs /dev/sdb2; sudo mkdir /xfs; sudo mount -t xfs /dev/sdb2 /xfs; df -hT | tail -3',
    'sudo mount /dev/sdc /mnt',
    'sudo umount /xfs; sudo mount /dev/sdz1 /mnt',
    'sudo pvcreate /dev/sdc /dev/sdd; sudo vgcreate vg0 /dev/sdc /dev/sdd; sudo lvcreate -L 3G -n web vg0; sudo pvs; sudo vgs; sudo lvs',
    'sudo mkfs.ext4 /dev/vg0/web >/dev/null; sudo mkdir /web; sudo mount /dev/vg0/web /web; df -h /web | tail -1; sudo lvextend -L +2G -r /dev/vg0/web; df -h /web | tail -1; lsblk | tail -6',
    'sudo dd if=/dev/zero of=/swapfile bs=1M count=512; sudo chmod 600 /swapfile; sudo mkswap /swapfile; sudo swapon /swapfile; swapon --show; free -m | tail -1',
    'echo "UUID=$(sudo blkid -s UUID -o value /dev/sdb1 2>/dev/null) /data ext4 defaults 0 2" | head -1',
    'sudo apt install -y mdadm >/dev/null; sudo mdadm --create /dev/md0 --level=1 --raid-devices=2 /dev/sdd /dev/sdc; cat /proc/mdstat',
    'cat /proc/mounts | tail -3; findmnt | head -4',
    'sudo apt install -y nfs-common > /dev/null; showmount -e demo-server; sudo mkdir /mnt/nfs; sudo mount -t nfs demo-server:/export/share /mnt/nfs; ls /mnt/nfs; df -h /mnt/nfs | tail -1',
  ];
  for (const t of tests) {
    console.log('$ ' + t.split('\n')[0]);
    try {
      console.log(await run(sh, t));
    } catch (e) {
      console.log('!! ' + e.stack);
    }
  }
})();
