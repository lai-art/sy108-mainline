# 分支说明：`wifi-host` = SY108 无线网卡版

本仓库同时维护两条产品线，**代码隔离在两个分支上，各自独立构建、产物互不影响**。
本文件只存在于 `wifi-host` 分支，`main` 上没有。

| | `main`（主线） | `wifi-host`（本分支，无线网卡版） |
|---|---|---|
| 定位 | 插电脑当网卡用，有线管理 | 自己发 Wi-Fi，手机连上来上网 |
| USB 口角色 | `peripheral`（device / gadget） | `host` |
| 口上挂什么 | `uncm0`（CDC-NCM），进 `br-usb` | MT7921AU 无线网卡 → `phy0` → `phy0-ap0` |
| 管理入口 | 网线插电脑，`http://192.168.9.1` | 手机连 SSID `SY108`（密码 `12345678`），同一地址 |
| 无线能力 | 无（内核里没有 802.11 栈） | Wi-Fi 6，默认 5GHz / ch149，可切 2.4GHz |
| 上行 | 5G 蜂窝 `wwan0`（两者相同） | 5G 蜂窝 `wwan0`（两者相同） |
| Recovery 镜像 | `peripheral` + 有线 NCM | **完全一样**，不受本分支影响 |

上行链路两版一致：`wwan0 → zone wan (masq) → br-usb → 客户端`。本分支只是把
"客户端怎么进来"从 USB 线换成了 Wi-Fi。

## 产物在哪

GitHub Actions → `build-firmware` → 按分支筛选 `wifi-host` → 该 run 的 artifacts：

- `sy108-main` → 里面的 `sysupgrade.bin` 就是无线网卡版，刷这个
- `sy108-recovery` → `boot-recovery.bin` / `rootfs.cpio.gz`，与主线同源

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
