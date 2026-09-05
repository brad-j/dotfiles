import assert from "node:assert/strict";
import test from "node:test";
import { assessSshCommand } from "../lib/ssh-policy.ts";

const inspections = [
  "pveversion --verbose",
  "qm list",
  "qm status 101",
  "qm config 101",
  "qm showcmd 101",
  "pct list",
  "pct config 101",
  "pvesh get /nodes/think-1/status --output-format json",
  'journalctl -u pvedaemon --since "1 hour ago" --no-pager -n 100',
  "journalctl --unit=pvedaemon --lines=100 --boot=0",
  "systemctl status pvedaemon.service --no-pager",
  "systemctl list-timers --all --no-pager",
  "hostname",
  "id -u",
  "uname -a",
  "uptime",
  "free -h",
  "df -hT",
  "lsblk -f",
  "lscpu",
  "ps aux",
  "ss -lntup",
  "ip route show",
];

for (const remote of inspections) {
  test(`allows inspection: ${remote}`, () => {
    assert.equal(assessSshCommand(`ssh think-1 '${remote}'`), "read-only");
  });
}

test("accepts direct absolute SSH, known targets, and narrowly allowed connection options", () => {
  for (const target of ["think-1", "think-2", "root@192.168.3.160", "root@192.168.3.148"]) {
    assert.equal(assessSshCommand(`/usr/bin/ssh -o BatchMode=yes -o ConnectTimeout=5 ${target} 'qm list'`), "read-only");
  }
  assert.equal(assessSshCommand(' ssh "think-1" "qm list" '), "read-only");
  assert.equal(assessSshCommand("ssh think-1 qm list"), "read-only");
});

const mutations = [
  "qm stop 101",
  "pct destroy 101",
  "hostname changed-name",
  "hostname -F /tmp/name",
  "journalctl --vacuum-time=1s",
  "journalctl --rotate",
  "journalctl --flush",
  "journalctl --setup-keys",
  "journalctl --no-pager --vacuum-size=1M",
  "ss -K dst 127.0.0.1",
  "systemctl restart pvedaemon",
  "systemctl status --root=/tmp/tree",
  "ip route show flush",
  "pvesh create /nodes/think-1/qemu",
  "pvesm status",
];

for (const remote of mutations) {
  test(`requires approval: ${remote}`, () => {
    assert.equal(assessSshCommand(`ssh think-1 '${remote}'`), "approval");
    assert.equal(assessSshCommand(`/usr/bin/ssh think-1 '${remote}'`), "approval");
  });
}

test("requires approval for unknown, malformed, and interactive commands", () => {
  for (const remote of ["", "qm list --unknown", "qm status", "qm status 101 extra", "journalctl -n", "journalctl --lines=all", "journalctl --since=--rotate", "test -f /tmp/file", "constructor", "hostname anything", "qm\tlist"]) {
    assert.equal(assessSshCommand(`ssh think-1 '${remote}'`), "approval", remote);
  }
  assert.equal(assessSshCommand("ssh think-1"), "approval");
  assert.equal(assessSshCommand("ssh think-1 'qm list"), "approval");
});

test("requires approval for wrappers, unknown targets, client options, and alternate clients", () => {
  for (const command of [
    "env ssh think-1 'qm list'",
    "command ssh think-1 'qm list'",
    "sudo /usr/bin/ssh think-1 'qm list'",
    "/tmp/ssh think-1 'qm list'",
    "ssh other-host 'qm list'",
    "ssh -l root think-1 'qm list'",
    "ssh -o ProxyCommand=helper think-1 'qm list'",
    "ssh -o PermitLocalCommand=yes -o LocalCommand=helper think-1 'qm list'",
    "ssh -F /tmp/config think-1 'qm list'",
    "ssh -L 8080:localhost:80 think-1 'qm list'",
    "ssh -tt think-1 'qm list'",
    "scp /tmp/file think-1:/tmp/file",
    "sftp think-1",
    's""sh think-1 "qm stop 101"',
    "s\\sh think-1 'qm stop 101'",
  ]) {
    assert.equal(assessSshCommand(command), "approval", command);
  }
});

test("never auto-approves compound shell syntax or expansions", () => {
  for (const command of [
    "ssh think-1 'qm list; qm stop 101'",
    "ssh think-1 'qm list' && touch /tmp/marker",
    "echo ok; ssh think-1 'qm list'",
    "ssh think-1 'qm list'\nssh think-2 'qm stop 101'",
    "ssh think-1 'qm list' > /tmp/output",
    "ssh think-1 '$(hostname)'",
    'ssh think-1 "`hostname`"',
    "ssh think-1 'qm list | sh'",
    "ssh think-1 'systemctl status *'",
    "ssh think-1 'hostname' < /tmp/input",
    "ssh think-1 $'qm list'",
  ]) {
    assert.equal(assessSshCommand(command), "approval", command);
  }
});

test("sensitive-path protection also covers wrapped and compound SSH commands", () => {
  for (const command of [
    "ssh think-1 'cat /etc/pve/priv/token.cfg'",
    "/usr/bin/ssh think-1 'cat /etc/pve/priv/token.cfg'",
    "env ssh think-1 'cat /root/.ssh/config'",
    "ssh other-host 'cat private-server.pem'",
    "ssh think-1 'qm list'; cat /tmp/server.key",
    "scp think-1:/etc/pve/priv/token.cfg /tmp/output",
  ]) {
    assert.equal(assessSshCommand(command), "sensitive", command);
  }
});

test("leaves ordinary local commands to the other platform policies", () => {
  for (const command of ["git status --short", "pnpm test", "ls", "python3 report.py"]) {
    assert.equal(assessSshCommand(command), "unrelated");
  }
});
