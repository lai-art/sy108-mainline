"""Offline self-test for the USB-Ethernet-as-LAN-port scripts.

Mocks uci / readlink / logger / ubus so the hotplug and uci-defaults scripts
can be exercised on a developer machine (no OpenWrt target, no root, no
kernel uevents). Run from anywhere:

    python3 tools/check/selftest-usb-lan.py

The important assertions are the NEGATIVE ones: the cellular uplink wwan0 and
the Wi-Fi AP netdev phy0-ap0 are USB devices too and must never be bridged
into the LAN.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
HOTPLUG = os.path.join(REPO, "packages/udx-runtime/files/etc/hotplug.d/net/50-udx-usb-lan")
UCI_DEF = os.path.join(REPO, "packages/udx-runtime/files/etc/uci-defaults/96-udx-usb-lan")

root = tempfile.mkdtemp(prefix="udxlan-")
bin_dir = os.path.join(root, "bin")
os.makedirs(bin_dir)

MOCK_UCI = '''#!/usr/bin/env python3
import json, os, sys
state = os.environ["MOCK_STATE"]
d = json.load(open(state))
a = [x for x in sys.argv[1:] if x != "-q"]
cmd = a[0]
if cmd == "get":
    v = d.get(a[1])
    if v is None:
        sys.exit(1)
    print("\\n".join(v) if isinstance(v, list) else v)
elif cmd == "show":
    print("network.loopback=interface")
    print("network.usbmgmt=interface")
    print("network.usbmgmt_device=device")
    print("network.wan=interface")
elif cmd == "add_list":
    key, val = a[1].split("=", 1)
    d.setdefault(key, [])
    if val not in d[key]:
        d[key].append(val)
    json.dump(d, open(state, "w"))
    open(os.environ["MOCK_CALLS"], "a").write("add_list " + a[1] + "\\n")
elif cmd == "commit":
    open(os.environ["MOCK_CALLS"], "a").write("commit " + a[1] + "\\n")
'''

MOCK_READLINK = '''#!/usr/bin/env python3
import os, sys
drv = os.environ.get("MOCK_DRV", "")
iface = os.environ.get("MOCK_IFACE", "")
p = sys.argv[-1].replace("\\\\", "/")
if drv and iface and p.endswith("/net/" + iface + "/device/driver"):
    print("/sys/bus/usb/drivers/" + drv)
    sys.exit(0)
sys.exit(1)
'''

MOCK_NOOP = "#!/bin/sh\nexit 0\n"

for name, body in [
    ("uci", MOCK_UCI), ("readlink", MOCK_READLINK),
    ("logger", MOCK_NOOP), ("ubus", MOCK_NOOP),
]:
    p = os.path.join(bin_dir, name)
    with open(p, "w", newline="\n") as f:
        f.write(body)
    os.chmod(p, 0o755)

for label, path in [("hotplug", HOTPLUG), ("uci-defaults", UCI_DEF)]:
    r = subprocess.run(["sh", "-n", path], capture_output=True, text=True)
    print("sh -n %-12s %s" % (label, "OK" if r.returncode == 0 else r.stderr.strip()))

# label, iface, driver, ACTION, existing ports, expect add_list, expected iface, extra env
CASES = [
    ("RTL8153B 进 LAN",      "eth0",     "r8152",        "add",    ["uncm0"],         True,  "eth0", {}),
    ("AX88179 进 LAN",      "eth1",     "ax88179_178a", "add",    ["uncm0"],         True,  "eth1", {}),
    ("AX88179A CDC-NCM",    "eth0",     "cdc_ncm",      "add",    ["uncm0"],         True,  "eth0", {}),
    ("CDC-Ether",           "usb0",     "cdc_ether",    "add",    ["uncm0"],         True,  "usb0", {}),
    ("ASIX 其它型号",        "eth2",     "asix",         "add",    ["uncm0"],         True,  "eth2", {}),
    ("蜂窝 wwan0 必须排除",   "wwan0",    "sipa",         "add",    ["uncm0"],         False, None,  {}),
    ("WiFi AP 必须排除",     "phy0-ap0", "mt7921u",      "add",    ["uncm0"],         False, None,  {}),
    ("端口已存在不重复",      "eth0",     "r8152",        "add",    ["uncm0","eth0"],  False, None,  {}),
    ("拔掉不处理",           "eth0",     "r8152",        "remove", ["uncm0"],         False, None,  {}),
    ("无 driver 链接",       "eth0",     "",             "add",    ["uncm0"],         False, None,  {}),
    ("未知驱动",             "eth0",     "rtl8150",      "add",    ["uncm0"],         False, None,  {}),
    ("开机早 ubus 不可用",   "eth0",     "r8152",        "add",    ["uncm0"],         True,  "eth0", {}),
    ("仅 DEVICENAME 可用",   "eth3",     "r8152",        "add",    ["uncm0"],         True,  "eth3",
        {"__drop": ["INTERFACE"], "DEVICENAME": "eth3"}),
    ("INTERFACE 优先",       "eth0",     "r8152",        "add",    ["uncm0"],         True,  "eth0",
        {"DEVICENAME": "bogus"}),
]


def new_state(idx, ports):
    state = os.path.join(root, "state%d.json" % idx)
    calls = os.path.join(root, "calls%d.txt" % idx)
    with open(state, "w") as f:
        json.dump({
            "network.usbmgmt.device": "br-usb",
            "network.usbmgmt_device.name": "br-usb",
            "network.usbmgmt_device.ports": ports,
        }, f)
    open(calls, "w").close()
    return state, calls


def run_hotplug(idx, label, iface, drv, action, ports, expect_add, expect_iface, extra):
    state, calls = new_state(idx, ports)
    sysfs = os.path.join(root, "sys%d" % idx)
    os.makedirs(os.path.join(sysfs, "net", iface, "device"), exist_ok=True)
    env = dict(os.environ)
    env.update({
        "PATH": bin_dir + os.pathsep + os.environ["PATH"],
        "ACTION": action, "INTERFACE": iface,
        "UDX_SYSFS_NET": os.path.join(sysfs, "net"),
        "MOCK_STATE": state, "MOCK_CALLS": calls,
        "MOCK_DRV": drv, "MOCK_IFACE": iface,
    })
    for k in extra.get("__drop", []):
        env.pop(k, None)
    for k, v in extra.items():
        if k != "__drop":
            env[k] = v
    r = subprocess.run(["sh", HOTPLUG], env=env, capture_output=True, text=True)
    out = open(calls).read()
    got = [l for l in out.splitlines() if l.startswith("add_list ")]
    ok = (bool(got) == expect_add)
    if expect_add and got:
        ok = ok and got[0] == "add_list network.usbmgmt_device.ports=" + expect_iface
    if expect_add:
        ok = ok and "commit network" in out
    if r.returncode != 0:
        ok = False
    return ok, (r.stdout + r.stderr).strip(), out.strip().replace("\n", " | ")


fail = 0
print("\n-- hotplug --")
for i, c in enumerate(CASES):
    ok, err, calls = run_hotplug(i, *c)
    print(("  PASS  " if ok else "  FAIL  ") + c[0].ljust(24) + ("  " + calls if calls else ""))
    if not ok:
        fail += 1
        if err:
            print("         stderr:", err[:200])

print("\n-- uci-defaults --")
rootflag = os.path.join(root, "root-marker")
open(rootflag, "w").write("OpenWrt production root\n")
state, calls = new_state(90, ["uncm0"])
env = dict(os.environ)
env.update({
    "PATH": bin_dir + os.pathsep + os.environ["PATH"],
    "UDX_ROOT_FLAG": rootflag,
    "MOCK_STATE": state, "MOCK_CALLS": calls,
})
r = subprocess.run(["sh", UCI_DEF], env=env, capture_output=True, text=True)
out = open(calls).read()
expected = ["add_list network.usbmgmt_device.ports=" + p for p in ("eth0", "eth1", "eth2", "usb0")]
got = [l for l in out.splitlines() if l.startswith("add_list ")]
ok = got == expected and "commit network" in out and r.returncode == 0
print(("  PASS  " if ok else "  FAIL  ") + "首启预写 4 个端口".ljust(24)
      + ("  " + out.strip().replace("\n", " | ") if out else ""))
if not ok:
    fail += 1
    print("         stderr:", (r.stdout + r.stderr).strip()[:200])

open(calls, "w").close()
r = subprocess.run(["sh", UCI_DEF], env=env, capture_output=True, text=True)
out = open(calls).read()
ok = out == "" and r.returncode == 0
print(("  PASS  " if ok else "  FAIL  ") + "重跑幂等（无重复写）".ljust(24))
if not ok:
    fail += 1
    print("         stderr:", (r.stdout + r.stderr).strip()[:200])

total = len(CASES) + 2
shutil.rmtree(root, ignore_errors=True)
print("\n%d/%d passed" % (total - fail, total))
sys.exit(1 if fail else 0)
