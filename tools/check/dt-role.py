#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
"""Verify the fixed USB role stored in a compiled SY108 device tree.

The old check was `strings "$dtb" | grep -qx 'host'`. It cannot tell which node
carries dr_mode, it says nothing useful when the property is missing outright,
and it cannot distinguish a main tree from a recovery tree - a swapped
board.dtb passes it silently. Parse the FDT instead: boot_layout.fdt_props is
already the parser the capsule and boot-ABI checks use, so this adds no new
dependency.
"""
from pathlib import Path
import argparse
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from boot_layout import fdt_props

TARGET = {"main": "openwrt", "recovery": "recovery"}


def text(value):
    return value.rstrip(b"\0").decode("utf-8", "replace")


def usb_tokens(blob):
    """Return raw printable runs that mention a role, for failure diagnosis.

    The old check grepped `strings` output for the exact word, so when it failed
    there was no way to tell "property missing" from "value spelled differently"
    or "wrong dtb". Listing the raw runs answers that in one look.
    """
    tokens = []
    run = bytearray()
    for byte in blob + b"\0":
        if 32 <= byte < 127:
            run.append(byte)
            continue
        if len(run) >= 4:
            token = run.decode("ascii", "replace")
            if token.startswith(("host", "periph", "otg", "usb-role")):
                tokens.append(token)
        run.clear()
    return sorted(set(tokens))


p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--profile", choices=("main", "recovery"), required=True)
p.add_argument("--expect", choices=("host", "peripheral"), required=True)
p.add_argument("dtb", type=Path)
a = p.parse_args()

blob = a.dtb.read_bytes()
try:
    nodes = fdt_props(blob)
except ValueError as error:
    print(f"dtb          {a.dtb} ({len(blob)} bytes)")
    print(f"::error::{a.dtb} is not a usable FDT: {error}")
    raw = usb_tokens(blob)
    print(f"role strings found: {raw if raw else '<none>'}")
    raise SystemExit(1)

roles = {path: text(props["dr_mode"]) for path, props in nodes.items() if "dr_mode" in props}
chosen = nodes.get("/chosen", {})
target = text(chosen["udx,boot-target"]) if "udx,boot-target" in chosen else "<absent>"

print(f"dtb          {a.dtb} ({len(blob)} bytes)")
print(f"profile      {a.profile} (expects boot-target {TARGET[a.profile]})")
print(f"boot-target  {target}")
for path in sorted(roles):
    print(f"dr_mode      {roles[path]:<12} {path or '/'}")
print(f"role strings found: {usb_tokens(blob) or '<none>'}")

fail = []
if target != TARGET[a.profile]:
    fail.append(
        f"boot-target is {target!r}, expected {TARGET[a.profile]!r} - "
        "the wrong board.dtb was packaged for this profile"
    )
if not roles:
    fail.append("no dr_mode property anywhere in the tree - the DWC3 node or the patch is missing")
else:
    distinct = sorted(set(roles.values()))
    if len(distinct) != 1:
        fail.append(f"mixed dr_mode values {distinct} - a role switch crept back in")
    elif distinct[0] != a.expect:
        fail.append(f"dr_mode is {distinct[0]!r}, expected {a.expect!r}")

for reason in fail:
    print(f"::error::{reason}")
if fail:
    raise SystemExit(1)
print(f"ok: fixed {a.expect} role")
