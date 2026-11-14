# 分支说明：`wifi-host` = SY108 无线网卡版

本仓库同时维护两条产品线，**代码隔离在两个分支上，各自独立构建、产物互不影响**。
本文件只存在于 `wifi-host` 分支，`main` 上没有。

| | `main`（主线） | `wifi-host`（本分支，无线网卡版） |
|---|---|---|
| 定位 | 插电脑当网卡用，有线管理 | 自己当网关，客户端从 Wi-Fi 或有线口进来上网 |
| USB 口角色 | `peripheral`（device / gadget） | `host` |
| 口上挂什么 | `uncm0`（CDC-NCM），进 `br-usb` | MT7921AU（无线）**或** RTL8153B / AX88179（有线），二选一，不会同时插 |
| 管理入口 | 网线插电脑，`http://192.168.9.1` | 手机连 SSID `SY108`（密码 `12345678`），**或** 电脑插 RJ45，都是 `http://192.168.9.1` |
| 无线能力 | 无（内核里没有 802.11 栈） | Wi-Fi 6，默认 5GHz / ch149，可切 2.4GHz |
| 上行 | 5G 蜂窝 `wwan0`（两者相同） | 5G 蜂窝 `wwan0`（两者相同） |
| Recovery 镜像 | `peripheral` + 有线 NCM | **完全一样**，不受本分支影响 |

上行链路两版一致：`wwan0 → zone wan (masq) → br-usb → 客户端`。本分支把"客户端怎么
进来"从 USB gadget 线换成了 **LAN 侧接入端口**：MT7921AU 出 Wi-Fi，8153B/88179 出 RJ45，
插谁谁自动进 `br-usb`（预写端口 + netifd 占位，见 `96-udx-usb-lan`）。**三者都不是 WAN**，
上行永远只有蜂窝。

## 产物在哪（命名与主线严格分离）

两个版本 zip 内的文件名完全一样（`sysupgrade.bin` / `boot.bin` / `rootfs.squashfs` …），
放在同一个下载目录会**互相覆盖、刷错固件**。所以从 workflow 顶层用
`ARTIFACT_PREFIX` 按分支推导身份：

| | `main`（主线） | `wifi-host`（HOST 版） |
|---|---|---|
| workflow 变量 | `sy108` | `SY108-HOST` |
| CI artifact | `sy108-main` / `sy108-recovery` | `SY108-HOST-main` / `SY108-HOST-recovery` |
| 本地 zip | `sy108-main-*.zip` | `SY108-HOST-run64-main.zip` 等 |
| 刷机文件 | `sysupgrade.bin` | `SY108-HOST-sysupgrade.bin`（`flash/` 副本） |

**zip 内的标准文件名故意不改**：`SHA256SUMS`、LuCI 刷机流程和 U-Boot capsule 都依赖它们，
改名会让校验和工具链失效。区分靠四层：artifact 名、zip 名、`SY108-HOST.txt` 标识文件、
以及 `flash/` 里带 HOST 前缀的刷机副本。`flash/SHA256SUMS-HOST` 覆盖这些副本。

`release` job 的下载路径和发布清单都用同一个 `ARTIFACT_PREFIX`，不会因改名漏改而挂。
tag 触发时 `ref_name` 是 tag 名，因此 release 保持主线 `sy108` 身份——release 是主线通道，
tag 只在 `main` 上打。

> **生效边界**：run #64 是在本次命名改动**之前**构建的，它的 artifact 仍叫
> `sy108-main` / `sy108-recovery`；本地取回后已手动按 HOST 规则重命名。
> **下一次推送起**，CI 直接产出 `SY108-HOST-*`。

`build.json` 里的 `component_commit` 指向本分支的提交，可以和主线的产物区分开。
release 仍然只在打 `v*` tag 时发布，**推本分支不会覆盖主线的 release**。

## 两版怎么互切

两版共用同一套 UBI 卷布局（`boot` / `rootfs` / `rootfs_data`），所以是**同一个系统
换内核和 rootfs**，不是双系统并存：

```sh
# 刷成无线网卡版
sysupgrade -n /tmp/sysupgrade-wifi.bin
# 改回有线 NCM 版
sysupgrade -n /tmp/sysupgrade-main.bin
```

也可以直接在 LuCI 的「系统 → 备份/刷写固件」里选文件刷。overlay 会被 `-n` 清掉，
配置不跨版本保留。

## 上机自检（无线版）

```sh
lsusb                       # 期望 0e8d:7961；如果 0bda: 开头，是 RTL8832AU，方案不适用
dmesg | grep -i mt7921      # 期望有 Firmware Version，且没有 "failed with error -2"
iw dev                      # 期望 phy0-ap0
iw phy | grep -A5 "valid interface combinations"   # AP <= 1、#channels <= 1
iw reg get                  # 期望 country CN
```

切换频段：`udx-wifi-band 2g` / `udx-wifi-band 5g` / `udx-wifi-band --rollback`。

## 上机自检（有线接入，插 8153B / 88179 时）

```sh
lsusb                          # 期望 0bda:8153 或 0b95:1790 / 0b95:178a
ip -br link                    # 期望 eth0（或 usb0）UP
ip link show master br-usb     # 有线口必须出现在桥成员里
logread | grep udx-usb-lan     # 只有名字非 eth0..usb0 时才会有补写记录
cat /sys/class/net/eth0/carrier # 1 = 网线对端有链路
```

电脑从 RJ45 应拿到 `192.168.9.x`，网关/DNS `192.168.9.1`，并经 `wwan0` 蜂窝上网。
`wwan0` 绝不能出现在 `br-usb` 的成员里。

完整方案见 [`docs/wifi-mt7921au.md`](docs/wifi-mt7921au.md)。

## 合并回主线的注意事项

做过两处兼容处理，所以合并时不会因为"主线没有 900 补丁"而误报：

1. CI 的 DTB 角色校验已改成**按树推导**（recovery 恒 `peripheral`；`main` 只有在
   `patches-7.3/900-usb-host.patch` 存在时才是 `host`）。合并后如果主线上没有这个
   补丁，校验会自动期望 `peripheral`，不会红。
2. `.github/workflows/build-firmware.yml` 的 `push.branches` 里带了 `wifi-host`。
   合并时若主线不再需要这个分支名，删掉即可，其余逻辑通用。

真正需要人工判断的是产品决策：**主线要不要也变成 host**。如果不要，就保持两个
分支并存，别把本分支 merge 回 `main`，只按需 cherry-pick 与无线无关的修复。
