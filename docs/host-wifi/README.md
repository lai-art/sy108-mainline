# 归档：HOST 模式 + 外置 USB 无线（**只归档，不应用**）

> 本目录的 `.patch` 是历史工作区快照，**不参与构建，也不要 `git apply`**。
> 现行实现是 `integration/openwrt/target/linux/sprd/patches-7.3/900-usb-host.patch`、
> `integration/openwrt/patches/070-wifi-default-network.patch` 与
> `target/linux/sprd/udx710/config-7.3`，方案说明见 [../wifi-mt7921au.md](../wifi-mt7921au.md)。

保留它们只为两件事：一是"上一轮试过什么、为什么没成"有据可查；二是里面确有可复用的
片段（`pamu3-offload` 的注释方式、`udx-usb` 的无 UDC 判断都源自这里）。**读可以，抄要
逐行核，apply 不行。**

## 文件

| 文件 | 规模 | 是什么 |
|---|---:|---|
| `0001-wifi-host.patch` | 3.8 KB / 4 文件 | 最早一版 HOST 改造：USB 口改 host + 打开 rtw88 与 mt76 全家桶 |
| `sy108-mainline-0266f72-code.patch` | 20 KB / 17 文件 | 上一轮会话工作区相对上游 `0266f72` 的 diff（只含代码） |
| `sy108-mainline-0266f72-complete.patch` | 218 KB / 51 文件 | 同上，另含文档、`.pre-nvsize` 备份文件与 `CHANGES-vs-upstream.md` |

后两个是 `git diff` 的**工作区整体快照**，不是可评审的补丁集：里面有会话中途的备份文件
（`nv_vendor.c.pre-nvsize`），也包含它们自己那版的 `070` / `900` 补丁文件。

## 为什么不能直接 apply

| # | 问题 | 证据 |
|---|---|---|
| 1 | `dr_mode="host"` 写进**共用的** `udx710-sy108.dtsi`，recovery 一起变 host | `0001-wifi-host.patch` 最后一个 hunk 改 dtsi；同时把 `config-recovery` 的 `CONFIG_USB_DWC3_HOST` 打开、gadget 关掉 → recovery 丢有线保命口 |
| 2 | 内建驱动却**没有内嵌固件**（`CONFIG_EXTRA_FIRMWARE` 出现 0 次） | 内建驱动在 rootfs 挂载前 `request_firmware`，必然 `failed with error -2`，phy 不会注册 |
| 3 | `CONFIG_CFG80211_REQUIRE_SIGNED_REGDB=n` 是无效写法 | kconfig 只认 `# CONFIG_X is not set`；而且这段开了 `CFG80211_CERTIFICATION_ONUS=y` 却没开 `CONFIG_EXPERT`，该符号无 prompt、`REQUIRE_SIGNED_REGDB` 强默认 `y`，内嵌 regdb 会被签名校验丢掉 |
| 4 | 只有内核、没有用户态 | 三个文件里都没有 `wpad` / `wifi-scripts` / `iw`，有 `phy0` 也没有 hostapd |
| 5 | 驱动面是"全家桶" | `RTW88_*` 17 行 + mt76 全系（含 `MT7925U`、`MT7663U`、`MT76x0U`、`MT76x2U`），目标卡只有一个 |
| 6 | 归档里有**同名不同内容**的补丁 | 归档那版 `070-wifi-default-network.patch` 是 `bands_order = [ "2G" ]`（锁死 2.4G、无 5G、无 channel 覆盖），与仓库现行版本不同 |
| 7 | `-code` / `-complete` apply 会把整个工作区改回去 | 17 / 51 个文件，包含备份文件与文档，等于回滚上一轮全部改动 |

## 与现行实现的对照

| 主题 | 归档写法 | 现行做法 | 为什么改 |
|---|---|---|---|
| dts 改哪里 | 共用 `dtsi` | 只改 main 的 `udx710-sy108.dts` | recovery 要保住 peripheral |
| recovery 角色 | 也改 host | 保持 `peripheral` | 有线口是刷坏后最后一条命 |
| 驱动范围 | rtw88 + mt76 全系 | 只留 MT7921 一条链 | 目标卡唯一，砍镜像体积与固件面 |
| 固件 | 不内嵌 | `CONFIG_EXTRA_FIRMWARE` 嵌 2 个 MT7961 + regdb | 内建驱动在 rootfs 之前 probe |
| 用户态 | 无 | `wpad-mbedtls` / `wifi-scripts` / `iw` / `luci-proto-wireless` | 没 hostapd 就没 AP |
| 频段 | `bands_order=[ "2G" ]` | `[ "5G", "2G" ]` + 固定 `ch149` | 上行是 5G 蜂窝；避开 ACS 撞 DFS 的 60 s CAC |
| 网络挂载 | `board.wlan.defaults.network` | 同思路，保留 | 这块板的 `lan` 是没地址的占位 |
| `pamu3-offload` | `//` 注释掉 | 同样注释掉 | 该属性只影响 gadget/SIPA 的 DMA offload |

## 真要复用某个片段

不要 apply，按文件手工比对：

```sh
# 1) 先看它想改哪个文件、改了什么（不落盘）
grep -n '^diff --git\|^--- \|^+++ ' docs/host-wifi/0001-wifi-host.patch

# 2) 把某个 hunk 单独抽出来看（例：只抽 config-7.3 那段）
awk '/^--- a\/integration\/openwrt\/target\/linux\/sprd\/udx710\/config-7.3/,/^--- a\/integration\/openwrt\/target\/linux\/sprd\/udx710\/config-recovery/' \
    docs/host-wifi/0001-wifi-host.patch | head -60

# 3) 确认仓库现状与它的基线是否还一致（几乎一定不一致）
git diff --stat -- integration/openwrt/target/linux/sprd/
```

判据很简单：**归档里的行号与当前 `config-7.3` 对不上**（它从 `@@ -389` 开始，当前文件
那一段已经在 430 行之后），所以任何 `git apply` 都会失败。失败是好事，别去 `-C1` 硬凑。
