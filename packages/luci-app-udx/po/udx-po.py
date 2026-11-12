#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""维护 luci-app-udx 翻译目录的 helper。

背景（为什么需要这个脚本）
    LuCI 前端的 ``_()`` 是翻译函数。xgettext 只能抽取「字面量」调用 ``_('text')``，
    但 udx.js 和 view/udx/*.js 里有大量「查表翻译」——可翻译字符串先存在常量表里，
    渲染时用 ``_(table[key].text)`` / ``_(table[key].label)`` 之类的方式查翻译。
    xgettext 看不到这些字符串，因此：

      * 直接 xgettext 生成的 .pot 会漏掉这些 msgid；
      * 用 msgmerge 更新 .po 时，这些 msgid 会被当作 obsolete 删掉。

    一旦丢失，中文界面就会回退显示英文原文。所以这些 msgid 必须「手工维护」：
    本脚本内置一份固定清单 LOOKUP_MSGS，并校验 po/templates/udx.pot 与
    po/zh_Hans/udx.po 是否完整。任何时候重新生成 .pot 后，跑一次 check 即可发现缺失。

用法
    python3 udx-po.py check     # 校验 .pot 和 .po 是否包含全部 lookup msgid
    python3 udx-po.py list      # 按来源分组打印固定清单

约定
    * 在源码里新增/改名/删除任何「查表翻译」的字符串时，必须同步改这里的
      LOOKUP_MSGS，再跑 ``python3 udx-po.py check`` 确认两个目录文件都齐全。
    * 不要用 msgmerge「清理」.pot 里这些条目，它们是有意保留的。
"""

import os
import re
import sys

# ---------------------------------------------------------------------------
# 固定清单：所有「查表翻译」的可翻译字符串，按来源分组。msgid 即英文原文。
# ---------------------------------------------------------------------------
LOOKUP_MSGS = {
    "signal levels (udx.js SIGNAL_LEVELS[].label)": [
        "Excellent",
        "Good",
        "Fair",
        "Poor",
        "Bad",
    ],
    "modem states (udx.js STATE_TEXT)": [
        "Data connection established",
        "Data connection closed",
        "Modem state unknown, refresh to confirm",
        "SIM card unavailable, waiting for a card",
        "Radio is off, waiting for it to be enabled",
        "Searching for network",
        "Waiting for packet attachment",
        "Connecting",
    ],
    "qci/5qi (udx.js QCI_TABLE[].text, dedup)": [
        "Conversational voice (VoLTE)",
        "Conversational video",
        "Real-time gaming",
        "Non-conversational video",
        "IMS signalling",
        "Buffered streaming video, TCP",
        "Voice, video and interactive gaming",
        "Default bearer, best effort",
        "Mission-critical push to talk",
        "Non-mission-critical push to talk",
        "Mission-critical video",
        "Mission-critical signalling",
        "Mission-critical data",
        "V2X messages",
        "Low-latency eMBB",
        "Low-latency eMBB, TCP",
        "Discrete automation",
        "Intelligent transport systems",
    ],
    "stop reasons (udx.js STOP_REASONS[].text)": [
        "Stopped by you",
        "Stopped, the data cap for this run was reached",
        "Finished, the planned duration elapsed",
        "Aborted, the device got too hot",
        "Interrupted, the mobile network went away",
        "The test failed",
    ],
    "network modes (network.js MODE_TITLE)": [
        "5G / 4G automatic (SA + NSA)",
        "5G SA only",
        "5G NSA",
        "4G LTE only",
        "5G / 4G / 3G / 2G automatic",
    ],
    "connect steps (network.js STEPS[].title)": [
        "Connection policy",
        "Radio state",
        "SIM slot",
        "Network mode",
        "Data connection",
    ],
    "operator brands (BRANDS)": [
        "China Mobile",
        "China Unicom",
        "China Telecom",
        "China Broadnet",
    ],
    "network tabs (network.js TABS[].title)": [
        "Connection",
        "Bands and cells",
        "Operators",
        "APN",
        "Speed test",
        "Data burn",
    ],
    "sim states (sim.js SIM_STATE[].text)": [
        "Ready",
        "Reading the card",
        "No card",
        "Card blocked",
        "Card error",
    ],
    "expression fallbacks": [
        "State changed",
    ],
}

# 脚本所在目录 = po/，模板与译文相对它定位。
_PO_DIR = os.path.dirname(os.path.abspath(__file__))
_POT_PATH = os.path.join(_PO_DIR, "templates", "udx.pot")
_PO_PATH = os.path.join(_PO_DIR, "zh_Hans", "udx.po")


def _all_msgs():
    """返回固定清单里的所有 msgid（去重，保序）。"""
    seen = set()
    out = []
    for msgs in LOOKUP_MSGS.values():
        for m in msgs:
            if m not in seen:
                seen.add(m)
                out.append(m)
    return out


def _extract_msgids(path):
    """提取 PO/POT 文件里所有 msgid（只取单行 msgid，跳过 header 的空 msgid）。"""
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as fh:
        text = fh.read()
    # 单行 msgid "..."；header 的 msgid "" 会被过滤掉。
    ids = re.findall(r'^msgid "([^"]*)"\s*$', text, flags=re.MULTILINE)
    return [i for i in ids if i]


def cmd_list():
    total = 0
    for group, msgs in LOOKUP_MSGS.items():
        print("[%s]" % group)
        for m in msgs:
            print("  %s" % m)
        total += len(msgs)
    print("")
    print("total: %d msgids (dedup: %d)" % (total, len(_all_msgs())))


def cmd_check():
    ok = True
    required = _all_msgs()
    for label, path in (("udx.pot", _POT_PATH), ("udx.po", _PO_PATH)):
        ids = _extract_msgids(path)
        if ids is None:
            print("MISSING FILE: %s" % path)
            ok = False
            continue
        id_set = set(ids)
        missing = [m for m in required if m not in id_set]
        if missing:
            ok = False
            print("%s is missing %d lookup msgid(s):" % (label, len(missing)))
            for m in missing:
                print("  - %s" % m)
        else:
            print("%s: OK (%d lookup msgids present)" % (label, len(required)))
    if not ok:
        print("")
        print("Run 'python3 udx-po.py list' to see the full fixed list, then")
        print("restore the missing entries into the catalog by hand.")
        return 1
    print("")
    print("all lookup msgids present.")
    return 0


def main(argv):
    if not argv or argv[0] in ("check",):
        return cmd_check()
    if argv[0] == "list":
        cmd_list()
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
