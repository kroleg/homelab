"""Own only the proxy namespace's dedicated table; degrade to proxy-only on failure."""
import json
from pathlib import Path
import signal
import subprocess as sp
import time

TABLE = "homelab_zapret2"
OWNER = "homelab-owned-proxy-zapret2-v1"
QUEUE = 24080
STOP = False
ENGINE = None


def run(args, **kw):
    return sp.run(args, check=True, **kw)


def cleanup():
    result = sp.run(["nft", "-j", "list", "table", "inet", TABLE], capture_output=True, text=True)
    if result.returncode:
        return
    tables = [v["table"] for v in json.loads(result.stdout)["nftables"] if "table" in v]
    # nft 1.0.6 omits table comments from JSON, but preserves them in text.
    text = sp.check_output(["nft", "list", "table", "inet", TABLE], text=True)
    owned = any(line.strip() == 'comment "' + OWNER + '"' for line in text.splitlines()[:4])
    if len(tables) != 1 or not owned:
        raise RuntimeError("refusing to delete a table without our ownership comment")
    run(["nft", "delete", "table", "inet", TABLE])


def stop(_sig, _frame):
    global STOP
    STOP = True


def queue_state():
    path = Path("/proc/net/netfilter/nfnetlink_queue")
    if path.exists():
        for line in path.read_text().splitlines():
            fields = line.split()
            if fields[0] == str(QUEUE):
                return {"pending": int(fields[2])}
    return None


def engine_stopped():
    if ENGINE.poll() is not None:
        return True
    try:
        state = Path(f"/proc/{ENGINE.pid}/stat").read_text().split(") ")[1][0]
    except FileNotFoundError:
        return True
    return state in ("T", "t", "Z", "X")


def install():
    rules = f"""
table inet {TABLE} {{
  comment "{OWNER}"
  chain generated {{
    type filter hook output priority -401; policy accept;
    meta mark & 0x40000000 != 0 counter notrack
  }}
  chain outbound {{
    type filter hook output priority mangle; policy accept;
    meta mark & 0x40000000 != 0 return
    oifname != "eth0" return
    meta skuid != 1080 return
    ip daddr {{ 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/3 }} return
    meta nfproto != ipv4 return
    tcp dport 443 ct direction original ct mark set ct mark | 0x20000000
    tcp dport 443 ct mark & 0x20000000 != 0 ct original packets 1-12 counter queue num {QUEUE} bypass
  }}
  chain inbound {{
    type filter hook prerouting priority filter; policy accept;
    meta mark & 0x40000000 != 0 return
    iifname "eth0" ct direction reply ct mark & 0x20000000 != 0 tcp sport 443 ct reply packets 1-12 counter queue num {QUEUE} bypass
  }}
}}
"""
    run(["nft", "-c", "-f", "-"], input=rules, text=True)
    run(["nft", "-f", "-"], input=rules, text=True)


def status(value):
    Path("/run/zapret-status").write_text(value + "\n")
    print(value, flush=True)


def main():
    global ENGINE
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    status("starting")
    # Fail before installing anything if namespace or conntrack accounting differs.
    addrs = json.loads(sp.check_output(["ip", "-j", "-4", "addr", "show", "eth0"]))
    if not any(a["local"] == "192.168.1.250" for a in addrs[0]["addr_info"]):
        raise RuntimeError("unexpected namespace: proxy address missing")
    if Path("/proc/sys/net/netfilter/nf_conntrack_acct").read_text().strip() != "1":
        raise RuntimeError("namespace conntrack accounting must be enabled")
    if queue_state() is not None:
        raise RuntimeError("NFQUEUE 24080 is already occupied")
    args = [s.strip() for s in Path("/config/engine.args").read_text().splitlines()
            if s.strip() and not s.lstrip().startswith("#")]
    allowed = ("--debug=", "--filter-tcp=", "--filter-l7=", "--payload=")
    strategies = ("fake", "multidisorder")
    for arg in args:
        if arg.startswith("--lua-desync="):
            if arg.split("=", 1)[1].split(":", 1)[0] not in strategies:
                raise ValueError("unreviewed Lua strategy")
        elif not arg.startswith(allowed):
            raise ValueError("unreviewed engine argument: " + arg)
        if "\x00" in arg:
            raise ValueError("NUL in engine argument")
    base = ["nfqws2", "--qnum=" + str(QUEUE), "--uid=1081:1081", "--fwmark=0x40000000",
            "--lua-init=@/opt/zapret2/lua/zapret-lib.lua",
            "--lua-init=@/opt/zapret2/lua/zapret-antidpi.lua"]
    run(base + args + ["--dry-run"])
    cleanup()
    ENGINE = sp.Popen(base + args)
    try:
        for _ in range(50):
            if STOP:
                return
            if ENGINE.poll() is not None:
                raise RuntimeError("nfqws2 exited before binding queue")
            if queue_state() is not None:
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("nfqws2 did not bind queue")
        install()
        status("active")
        pending_since = None
        while not STOP:
            queue = queue_state()
            if queue is not None and queue["pending"]:
                pending_since = pending_since if pending_since is not None else time.monotonic()
            else:
                pending_since = None
            # A continuously backed-up queue for five seconds is unsafe even
            # when its process is alive. Prefer proxy-only operation to stalling.
            stalled = pending_since is not None and time.monotonic() - pending_since >= 5
            failed = engine_stopped() or queue is None or stalled
            if failed:
                cleanup()
                status("degraded: proxy-only; restart sidecar to retry")
                if ENGINE.poll() is None:
                    ENGINE.kill()
                while not STOP:
                    time.sleep(0.25)
                break
            time.sleep(0.25)
    finally:
        try:
            cleanup()
        finally:
            if ENGINE and ENGINE.poll() is None:
                ENGINE.terminate()
                try:
                    ENGINE.wait(timeout=3)
                except sp.TimeoutExpired:
                    ENGINE.kill()
        status("stopped: proxy-only")


if __name__ == "__main__":
    main()
