# SY108 外置 USB Wi-Fi：BL-M7921AU1（MT7921AU）

状态：文件已改好，**未编译、未推送**。无线与 USB Host 是同一个改动切片，必须一起
进镜像（见 §6），不能只上其中一个。

## 0. 角色分工（先明确，避免歧义）

```
        ┌─ 上行 WAN ─────────┐          ┌─ 用户接入 ──────────┐
手机 ⇄ 5G 蜂窝 (wwan0)  ⇄  SY108  ⇄  MT7921AU (phy0-ap0) ⇄ 手机/笔记本
        └─ 网络来源 ─────────┘          └─ Wi-Fi 信号提供者 ──┘
```

- **5G 蜂窝 = 网络来源**。`network.wan`（`proto udx` → `wwan0`）是唯一上行，是整
  机能不能上网的命脉。
- **MT7921AU = AP（接入点）**。它不是上行网卡、不负责拨号，只负责把 Wi-Fi 发给
  手机/笔记本。USB 口工作在 **host 模式**，这块卡就是被 host 枚举的从设备。
- 本文档里如果不特别说明，"5G" 一律指 **Wi-Fi 的 5GHz 频段**；蜂窝那一侧写成
  "5G 蜂窝"或"蜂窝上行"。

## 1. 这块卡是什么，能不能被识别

| 项 | 值 |
|---|---|
| 型号 | BL-M7921AU1（LB-LINK / 必联，**LGA 贴片模组** 27×17.8×2.5 mm，59 pin + 3 个 IPEX，不是插卡） |
| 芯片 | MediaTek **MT7921AUN**（MT7921AU 系列） |
| 射频 | **三频 2T2R 802.11ax：2.4 / 5 / 6GHz** + BT5.2；2.4G 574Mbps、5G/6G HE80 **1201Mbps** |
| 接口 | USB **3.0**（SuperSpeed，兼容 USB2.0）；BT 可走 USB（默认）或 UART |
| 供电 | DC 3.3V±0.2V，**平均最大 1.2A / 峰值 1.8A**（手册 §6.2.2） |
| 尺寸/温度 | 27.0×17.8×2.5 mm；工作温度 **-20~+70℃** |
| USB ID | `0e8d:7961`（厂商页未公布，按 MT7921AUN 平台通用值，需上机 `lsusb` 确认） |

**能识别，且不需要任何 quirk**。内核 `14658d97` 的
`drivers/net/wireless/mediatek/mt76/mt7921/usb.c:15-33` 设备表就有这一条：

```c
{ USB_DEVICE_AND_INTERFACE_INFO(0x0e8d, 0x7961, 0xff, 0xff, 0xff),
  .driver_info = (kernel_ulong_t)MT7921_FIRMWARE_WM },
```

同表另外 5 条：`0e8d:7902`(MT7902)、`3574:6211`(Comfast CF-952AX)、
`0846:9060`(Netgear A8000)、`0846:9065`(Netgear A7500)、`35bc:0107`(TP-Link TXE50UH)。
全部按 `VID+PID+接口 0xff/0xff/0xff`（vendor-specific）匹配。

⚠️ **上机前必须先确认不是 BL-M8832AU1**：同厂还有一个 BL-M8832AU1 = Realtek
RTL8832AU，尺寸 27×17.8×2.4 mm、同样 USB3/2T2R/1200 Mbps、只少了蓝牙，型号差一个
数字。`lsusb` 看到 `0bda:` 开头就是 Realtek，本文全部不适用。

识别链路（从插上到出现 wlan）：

```
插入 → USB 枚举 → MODALIAS=usb:v0E8Dp7961...icFFiscFFipFF
  → udev/kmod 按 modules.alias 加载 mt7921u（本方案是内建，无需加载）
  → mt7921u_probe() → usb_reset_device()
  → request_firmware(mediatek/WIFI_RAM_CODE_MT7961_1.bin)    ← 解析 offload 能力
  → request_firmware(mediatek/WIFI_MT7961_patch_mcu_1_2_hdr.bin)  ← ROM patch
  → request_firmware(mediatek/WIFI_RAM_CODE_MT7961_1.bin)    ← WM RAM + CLC
  → ieee80211 phy0 注册 → wlan0
```

### 1.1 数据手册复核（V1.0.1.2，Rev 1.2 / 2024-07-15）

> **更正**：此前按供应商"产品描述"页判定"这是双频卡、没有 6GHz"，**是错的**。
> 手册 V1.2 明确写了 6G，且 Rev 历史第 3 条就是 `1.2 Added 6G specification
> 2024-07-15`——那段产品描述是 V1.0/1.1 时代的旧文案，没有跟着更新。

| 手册原文 | 位置 | 含义 |
|---|---|---|
| `Operating Frequency: 2.4~2.4835GHz、5.15~5.85GHz or 5.925~7.125GHz` | §1.1 | 三频，含 6GHz |
| `Support 2.4GHz, 5GHz, 6GHz Triple-band channels` | §1.1 | 同上 |
| `Support Triple-band 2T2R mode with 20/40/80MHz` | §1.1 | 三频都是 2T2R |
| `Support DBDC (2.4G 1T1R + 5G / 6GHz 1T1R)` | §1.1 | **DBDC 是"拆链"**，各 1T1R |
| §4.3 6G 射频表：Ch1~Ch233、TX 18.5dBm@MCS0、RX -84dBm@HE80 MCS0 | §4.3 | 6G 是实测过的，不是笔误 |
| `Bluetooth Core Specification v5.2/4.2/2.1` | §1.3 | 推广段写 BT5.3 才是错的 |

所以定性：**MT7921AU = Wi-Fi 6E 三频芯片**（同门 ALFA AWUS036AXML 也是这颗）。

但 6GHz 在中国**用不了**：regdb 把 5925–7125 标成 `NO-OUTDOOR, NO-IR`，且这段频率
国内已划给 IMT，hostapd 起不来。三频里实际可用仍是 2.4/5。

### 1.2 载板、供电、天线（比驱动更容易翻车的地方）

模块是**焊在载板上的 LGA**，不是 USB 网卡。买回来直接插是不可能的，载板必须满足：

| 项 | 要求 | 依据 | 不满足的后果 |
|---|---|---|---|
| **供电方式** | **3.3V 独立外供，不走 USB VBUS**（用户已定） | 本方案 | 见 §1.3 |
| 3.3V 轨 | buck，**RMS ≥1.2A、峰值 ≥1.8A**，纹波 <80mV | §6.2.2 | TX 突发掉压 → 掉卡/复位循环 |
| 线损 | 3.3V±0.2V 只有 **±6%**；1.8A 走 50mΩ 就掉 90mV | §1.3 + 欧姆定律 | 模块端电压跌破 3.1V，随机复位 |
| USB 走线 | **SS 差分对 90Ω±5%**（要 800Mbps 就必须接）；只跑 330Mbps 可只接 D+/D- | §6.2.4 B/C | 只走 USB2 → 吞吐封顶 **330Mbps** |
| **共地** | 外供 GND 与 SY108 GND 必须同地，且回流路径短 | USB 协议要求 | 不共地 → SS 训练失败、随机掉枚举 |
| **VBUS 引脚** | **悬空，不要灌 5V** | 见 §1.3 | 原设计是 device 口，VBUS 大概率接了充电 IC，反灌会触发充电逻辑 |
| 天线 | 2×IPEX(MHF-1)；ANT0/ANT1 隔离 ≥17dB(2.4G)、≥20dB(5–6G) | §6.2.1 | MIMO 退化，速率掉一半 |
| strap | Pin24 内部弱上拉 = USB 5G 模式，**载板别拉低** | §2.1 pin24 | 退到 2.5G 模式，吞吐再减半 |
| 散热 | 环境 -20~+70℃ | §1.3 | 壳内密闭 + 蜂窝模组，夏天车内易超 |

外供之后，"5V 带不动 1.8A"这条风险消失；剩下最容易翻车的是**线损/共地**和
**USB 只走 2.0**——前者表现为随机掉卡，后者表现为"能上网但测速上不去"。

### 1.3 外供电接法（VBUS 不参与）

**软件侧不需要任何改动**，理由（都在内核 `14658d97`）：

| 事实 | 位置 | 含义 |
|---|---|---|
| host 模式只调 `otg_set_vbus(usb2_phy->otg, true)`，而 `usb1_phy` 是 SS PHY、没有 OTG 回调 | `dwc3/core.c:246-251` | 这个调用是空操作 |
| `usb1_dwc3` 没有 `vbus-supply`，也没有 `extcon` | `udx710.dtsi:742-754` | 驱动没有"等 VBUS 有效"的路径 |
| `sprd,pamu3-offload` 只影响 **gadget/SIPA 的 DMA offload**，且已在 `900-usb-host.patch` 里摘掉 | `dwc3/core.c:2379`、`sprd-pamu3.c` | 与 host 侧供电判断无关 |

也就是说 host 只看**数据线上的终端/上拉**：模块自已有 3.3V，D+ 上拉和 SS 终端一直在，
主机不需要 VBUS 就能发现设备。

接线清单（载板 → 模块）：

| 信号 | 模块脚 | 说明 |
|---|---|---|
| 3.3V / GND | 21 / 10,13,18… | 外供，2A 能力，模块旁放 220µF + 10µF + 1µF |
| D+ / D- | 19 / 20 | USB2，必须接（枚举的兜底通道） |
| SSTX± / SSRX± | 14-17 | USB3，要 800Mbps 就接；不接可悬空，自动回落 USB2 |
| Reset | 22 | **建议 RC 上电复位**（10k 上拉 + 100nF，≥1ms）+ 留一个可控点 |
| VBUS | — | **不接** |

三条容易忽略的：

1. **外电常驻时 SY108 重启不会给模块断电**。模块固件卡死只能靠 pin22 硬复位，
   所以复位脚一定要留，别只靠 USB port reset。
2. **别让模块比 SY108 先上电太久**。SY108 的 USB PHY 断电时，模块 D+ 上拉会经 ESD
   二极管往 PHY 域倒灌（约 2mA，不致命但会让 PHY 处于半供电）。做法：外供 3.3V 由
   SY108 的一个 GPIO 控制负载开关使能，或至少同开同关。
3. **USB3 不是必须**。蜂窝上行实际多在 100–300Mbps，USB2 的 330Mbps 够用；只有想在
   局域网内跑满 1201Mbps PHY（多客户端互传、内网测速）才值得布 SS 四根线。

## 2. 驱动：只保留 MT7921 一条链

内核侧（`integration/openwrt/target/linux/sprd/udx710/config-7.3`）：

```c
CONFIG_WIRELESS=y
CONFIG_WLAN=y
CONFIG_WLAN_VENDOR_MEDIATEK=y
CONFIG_RFKILL=y
CONFIG_CFG80211=y
CONFIG_CFG80211_WEXT=y
CONFIG_MAC80211=y
CONFIG_MT76_CORE=y
CONFIG_MT76_USB=y
CONFIG_MT76_CONNAC_LIB=y
CONFIG_MT792x_LIB=y
CONFIG_MT792x_USB=y
CONFIG_MT7921_COMMON=y
CONFIG_MT7921U=y
CONFIG_PAGE_POOL=y
```

选择说明：

- **用内核自带的 mt76，不用 OpenWrt 的 `kmod-mt7921u` 包**。内核源码树里
  `drivers/net/wireless/mediatek/mt76/` 与 7.3 完全同步；OpenWrt 的 mt76 是独立
  out-of-tree 源码包，要额外下载且版本与内核不对应。
- **全部 `=y`（内建），不是 `=m`**。内建驱动在 rootfs 挂载前就 probe，所以固件必须
  内嵌（§3）；模块方案则要把固件放进 rootfs。两条路线不能混。
- 只开 MT7921 一条链：相比历史 patch 的"通吃"配置删掉了 rtw88 全部 17 行、
  mt76x0/x2 6 行、mt7615/7663 3 行、mt7925 2 行，以及 24 个无关固件。

### 2.1 顺带编进去的两块有线网卡（RTL8153B / AX88179）

口变成 host 之后能插的不止 WiFi 卡，所以这两族一直留在 `config-7.3` 里（各自 `=y` 内建，
不需要 `kmod-usb-net-*` 包）：

| 芯片 | 内核符号 | USB ID | 说明 |
|---|---|---|---|
| RTL8152/8153/**8153B**/8155/8156/8157 | `CONFIG_USB_RTL8152=y` | `0bda:8153` | 8153 与 8153B **同一个 ID**，靠运行时探测 MAC 版本区分（`r8152.c` 的 `RTL_GIGA_MAC_VER_4x`），不需要额外配置 |
| AX88179 | `CONFIG_USB_NET_AX88179_178A=y` | `0b95:1790` | 走 usbnet 框架，需要 `CONFIG_USB_USBNET=y`（select MII） |
| AX88178A | 同上 | `0b95:178a` | 同一个驱动 |
| AX88179**A** | **没有专用支持** | — | 本内核树 `ax88179_178a.c` 的设备表只有上面两个 ID，源码里连 "88179A" 字样都没有；这颗料通常以 **CDC-NCM** 形态枚举 |

最后一行是本次补的：`CONFIG_USB_NET_CDC_NCM=y` + `CONFIG_USB_NET_CDCETHER=y`。它同时覆盖
NCM 形态的 4G/5G 模块，代价只有几十 KB。**原来那行注释写"0x1790 覆盖 AX88179A"是错的**，
已改掉——如果买的是"A"版而它又跑在 ASIX 私有模式（`ff/ff/00`），那它会被
`ax88179_178a` 绑上但用的是 AX88179 的初始化序列，可能需要换 NCM 模式的固件开关。

插上之后的行为要说清楚：

- 网卡会枚举成 `eth1` / `eth2`，**不会自动进 `br-usb`**。`br-usb` 是 `bridge_empty=1` 的
  空桥，host 模式下只有 `phy0-ap0` 一个成员。要拿它当上行，就新建一个 interface 绑 `eth1`
  再挂 `wan` 区；要当 LAN 口，就 `uci add_list network.usbmgmt_device.ports=eth1`。
- **WiFi 卡 + 有线卡同时用必须过 hub**。只有一个 host 口。
- 只接了 D+/D- 的话，两张卡共享 USB2 的 330Mbps，千兆网卡也只能跑三百多。
- 判据：`lsusb -t` 看 driver 列是 `r8152` 还是 `ax88179_178a`；`ip -br link` 看 `eth1` 是否
  `UP`；`dmesg | grep -iE "r8152|ax88179"` 看有没有 PHY 协商失败。

## 3. 固件：内嵌进内核，不落 rootfs

`config-7.3`：

```c
CONFIG_EXTRA_FIRMWARE="mediatek/WIFI_RAM_CODE_MT7961_1.bin mediatek/WIFI_MT7961_patch_mcu_1_2_hdr.bin regulatory.db"
CONFIG_EXTRA_FIRMWARE_DIR="/project/integration/openwrt/firmware"
```

文件实际在 `integration/openwrt/firmware/`（含 `README.md` 记来源与许可）：

| 文件 | 大小 | 来源 |
|---|---:|---|
| `mediatek/WIFI_RAM_CODE_MT7961_1.bin` | 792036 | linux-firmware `mediatek/` |
| `mediatek/WIFI_MT7961_patch_mcu_1_2_hdr.bin` | 92192 | linux-firmware `mediatek/` |
| `regulatory.db` | 4896 | wireless-regdb |

三个关键点：

1. **名字不是 `mt7921_wm.bin` 那一套**。`mt7921_wm.bin` / `mt7921_rom_patch.bin` /
   `mt7921_wa.bin` 是 MT7915/7981/7986 等 AP 芯片的命名，linux-firmware 根本没这些
   文件。MT7921 只有上表两个，且**不加载独立 WA 固件**（`mt792x_core.c` 里传 NULL）。
2. **`/project` 是容器内的仓库挂载点**（`tools/lib/workspace.py:56` 把项目 bind 到
   `/project`，只读）。固件放在仓库里、用绝对路径引用，好处是
   `manifests/kernel.json` 和内核归档 sha256 **完全不用动**。
3. **签名校验必须关**：`CONFIG_CFG80211_REQUIRE_SIGNED_REGDB` 是 not set。它只在
   `CFG80211_CERTIFICATION_ONUS`（依赖 `CONFIG_EXPERT`）时才有提示项，否则强默认
   `y`；而 `certs/` 里没有 wireless-regdb 公钥，一旦要求签名，内嵌的
   `regulatory.db` 会被丢弃，退回 world regdomain。`config-7.3` 第 24 行已有
   `CONFIG_EXPERT=y`，这条链才成立。

## 4. 网络挂载：线路

```
无线客户端 / 手机 (DHCP 192.168.9.2-21)
   │  802.11ax 5GHz, HE80, ch149
   ▼
phy0-ap0  (hostapd, SSID SY108)
   │  netifd 按 wifi-iface.network=usbmgmt 把它加进桥
   ▼
br-usb    192.168.9.1/24   (bridge_empty=1，没有 NCM 口时依然存在)
   │  dnsmasq: dhcp.usbmgmt (start=2 limit=20, 1h)，下发网关 3 + DNS 6
   │  firewall zone usbmgmt: input ACCEPT / output ACCEPT / forward REJECT
   ▼  forwarding usbmgmt → wan，wan 区 masq=1 + mtu_fix=1
network.wan (proto=udx) → wwan0 → 蜂窝 5G
```

### 4.1 改动前 → 改动后

上行一点没变，变的只是"客户端怎么进来"：

| 段 | 改动前（`5eb262b`） | 改动后（本切片） |
|---|---|---|
| USB 口角色 | device（`dr_mode="peripheral"`） | **host**（`900-usb-host.patch`，只改 main dts） |
| 口上挂什么 | gadget NCM → `uncm0` | MT7921AU → `phy0` |
| 管理入口 | 插电脑，`192.168.9.x` 开网页 | **手机连 Wi-Fi**，`192.168.9.x` 开网页 |
| `br-usb` 成员 | `uncm0` | `phy0-ap0`（没有 `uncm0`） |
| 无线 | 无（内核里一行 wifi 配置都没有） | 5GHz AP，首启自动生成 `/etc/config/wireless` |
| 上游 DNS | 空 → dnsmasq 没有 forwarder | `223.5.5.5` / `119.29.29.29` |
| Recovery | peripheral + NCM 有线口 | **没动**，仍是 peripheral + NCM |

注意 `lan`：`board.json` 里的 `lan`（`uncm0` / `proto=none`）只是给 LuCI 端口面板看的占位，
`/etc/config/network` 里**没给它地址和 DHCP**——这就是 AP 必须挂 `usbmgmt` 而不是 `lan`
的原因。

| 项 | 值 | 定义位置 |
|---|---|---|
| 无线名称 | **SY108** | `packages/udx-runtime/files/etc/board.d/03-sy108-wifi` |
| 加密/密码 | **psk2 / 12345678**（出厂默认，首登后应修改） | 同上 |
| 频段 | **默认 5GHz（HE80，ch149）**；运行时可切 2.4GHz，见 §4.2 | `03-sy108-wifi`（首启默认）+ `udx-wifi-band`（运行时） |
| 国家码 | CN | 同上 |
| 挂载网络 | **usbmgmt** | 同上（写 `wlan.defaults.network`） |
| 管理地址 | **192.168.9.1/24** | `packages/udx-usb/files/etc/uci-defaults/90-udx-usb` |
| DHCP 池 | 192.168.9.2 – 192.168.9.21 | 同上 |

**为什么不挂 `lan`**：这块板的 `lan` 是 `uncm0` + `proto=none` 的占位，没有地址也
没有 DHCP，AP 挂上去客户端拿不到 IP。二选一要么整体改名（要动
90-udx-usb/95-udx-usb-wan/gadget.sh/management_ready.c/boot-state.c 一大串），要么给
`mac80211.uc` 打一行补丁读 `board.wlan.defaults.network`。选了后者。

### 4.2 频段：一个 AP、默认 5GHz、可随时切换

**为什么是 5GHz，而不是双频**：MT7921AU 的 2T2R 射频与基带**硬件层面**确实能
分链做 DBDC，但 Linux 侧的限制不在射频，而在**驱动对外声明的接口组合表**。
`mt792x_core.c`（内核 7.3，`14658d97`）一共只注册**一个 wiphy**：

| 表 | 位置 | `num_different_channels` | AP 上限 |
|---|---|---|---|
| `if_comb`（无 CNM 固件时的唯一表） | `mt792x_core.c:22` | **1** | **1**（`if_limits:11-20`） |
| `if_comb_chanctx_base[0]`（CNM+MCC） | `:98-105` | 2 | **0（组合里根本没有 `IFTYPE_AP`）** |
| `if_comb_chanctx_base[1]`（CNM+SCC） | `:106-113` | 1 | **1** |

分工要说清楚：**手册 §1.1 的 DBDC 是硬件能力**（2.4G 1T1R + 5G/6G 1T1R，拆链）；
**Linux 侧唯一的双信道组合只放开 `STA`/`P2P_CLIENT`/`P2P_GO`**（就是"连着热点
再开热点"的手机场景），`IFTYPE_AP` 一次都没出现在里面。只要用到 AP，就必然落到
单信道组合、且 `AP <= 1`。所以**同一时刻只能起一个 AP、锁在一个信道**，2.4G + 5G
双 AP 并发在驱动层面被直接拒绝（mac80211 的 `ieee80211_check_combinations`
返回 `-EBUSY`）。

顺带一个常被忽略的账：即便真用上 DBDC，每条链只剩 1T1R，HE80 只有 **600Mbps**
（不是 1201）——2T2R 的 1201 只在单频段独占两条链时才有。

对照：真双频的 MT7915 是 `dbdc_support` + `mt7915_register_ext_phy()`（`mt7915/init.c:722`）
**注册两个 wiphy**，每个 wiphy 各自 `num_different_channels = 1`——靠"两个 phy"
而不是"一个 phy 两个信道"实现双频并发。mt7921 目录里没有任何 `register_ext_phy`。
上游 `mac80211.uc` 也是"一个 radio 只生成一个 wifi-device"，取 `bands_order`
里第一个存在的 band。

想验证不用猜：上机后 `iw phy | grep -A8 "valid interface combinations"`，
会看到 `#{ AP } <= 1 ... #channels <= 1`。这条命令比任何宣传页都准。

**真要"2.4G + 5G 两个 SSID 同时广播"，只有两条路**：

1. **加第二块 USB 网卡**（推荐，改动最小）：MT7921AU 出 5GHz，另插一块纯 2.4G
   的便宜卡（MT7601U / RTL8188EU，十几块钱）出 2.4GHz。两块卡 = 两个独立
   wiphy = 两个 `wifi-device`，OpenWrt 原生支持，`iw` 组合表互不影响。
   SY108 只有一个 USB host 口，需要 hub（HOST 模式下可以）。
2. **换 AP 专用芯片**：MT7915/MT7916 这类真 DBDC（两个 phy）。但它们是 PCIe，
   SY108 没有对外 PCIe，**这条路在本板不通**。

第二条路的细节值得写清楚，因为**上了第二块卡以后，现在的配置基本不用改**：
`mac80211.uc` 对**每个 radio 各取一次** `filter(bands_order, b => radio.bands[b])[0]`。

| 卡的组合 | radio0 | radio1 | 结果 |
|---|---|---|---|
| MT7921AU（双频）+ 纯 2.4G 卡 | 双频 → 取 `5G` | 只有 2.4 → 取 `2G` | **自动分成 5G / 2G，正好双频并发** |
| 两块都是双频卡 | 5G | 5G（`[0]` 的副作用） | 两个 radio 抢同一频段，第二个用 `UDX_WIFI_RADIO=radio1 udx-wifi-band 2g` 切走 |

所以**没有额外的代码要写**：`03-sy108-wifi` 已经给两个 band 都钉了信道
（`2g` = 6，`5g` = 149），哪块卡落到哪个 band 都是确定值，不会去跑 ACS。
唯一要做的是插 hub、插第二块卡，然后 `wifi config && wifi up` 看是不是起了两个
`wifi-device`。

不要试图改 `if_comb` 硬凑两个 AP：固件侧的 MCC 调度不支持 AP 跨信道，改了会
表现为 beacon 丢、扫描失败、吞吐塌，比现在的单 AP 更糟。

**默认取 5GHz 的理由**：上行就是 5G 蜂窝，HE80 2×2 是 **1201 Mbps** PHY，2.4G 就算
开 HT40 也只有 **573.5 Mbps**、实际多是 HE20（287 Mbps），会成为整条链路的瓶颈。
`bands_order` 写成 `[ "5G", "2G" ]`，报不出 5G 的卡自动回落 2.4G。

**这个默认不是锁定。** 上游 `mac80211.uc` 的 band 选择只在**首次生成**
`/etc/config/wireless` 时跑一次：它用 `radio_exists()` 按 path/phy/macaddr 判断
radio 是否已存在，存在就整段 `continue`，**一个字段都不改**。所以首启之后 band 完全
由配置文件决定，落在 overlay 里，重启保留。

切换方式（三选一，都持久化）：

| 方式 | 操作 | 注意 |
|---|---|---|
| **脚本（推荐）** | `udx-wifi-band 2g` / `udx-wifi-band 5g` | 同时改 band + channel + htmode |
| LuCI | 网络 → 无线 → radio0 → 编辑 → Band 选 2.4 GHz，**Width 同时改成 20 MHz** | 只改 Band 不改 Width，HE80 在 2.4G 起不来 |
| uci | `uci set wireless.radio0.band=2g`<br>`uci set wireless.radio0.channel=6`<br>`uci set wireless.radio0.htmode=HE20`<br>`uci commit wireless; wifi reload` | 三行缺一不可 |

**为什么需要一个脚本**：band 不是孤立属性，它和另外两项强耦合，只改 band 会得到一份
起不来的配置——

| 项 | 耦合关系 | 只改 band 的后果 |
|---|---|---|
| `channel` | 149 不是 2.4G 信道，6 也不是 5G 信道 | hostapd 拒绝启动，SSID 消失 |
| `htmode` | 2.4G 最大 40MHz，而默认是 HE80 | hostapd 报非法带宽，AP 起不来 |

`udx-wifi-band` 做的就是这三件事一起动：切 2g 时把宽度降到 20（保留 HE/VHT/HT 代次）
并把信道换到 6，切 5g 时换到 149；如果当前信道在目标频段本来就合法就保留不动。
执行前会把旧值写到 `/etc/udx-wifi-band.prev`，**改坏了 `udx-wifi-band --rollback`
一条命令回退**。

```sh
root@SY108:~# udx-wifi-band
radio    radio0
band     5g
channel  149
htmode   HE80
country  CN

root@SY108:~# udx-wifi-band 2g
applying band=2g channel=6 htmode=HE20
radio reloaded; the SSID returns in a few seconds (check: iw dev)
previous setting saved in /etc/udx-wifi-band.prev (undo: udx-wifi-band --rollback)
```

也支持指定信道：`udx-wifi-band 2g 11`、`udx-wifi-band 5g 36`（36 属于非 DFS，
149 之外另一个常用值）。超出 1-14 / 32-177 会被拒绝。

⚠️ `wifi reload` 会重启射频，**走这块 AP 的 SSH 会断开**。只有无线一条路时别盲切；
出问题从串口控制台或 Recovery 里跑 `--rollback`。

**6GHz 不提供，脚本直接拒绝 `6g` 参数**：手册 §4.3 有完整 6G 规格，驱动也会按固件
上报的 `MT_NIC_CAP_6G`（`mt7921/mcu.c:622`）注册 6GHz band，但国内 5925–7125 已划
给 IMT，regdb 标 `NO-OUTDOOR, NO-IR`，hostapd 根本起不来。`070` 把 `bands_order` 写
成 `[5G,2G]` 主要是为这个——不排除的话首启可能挑到 6G 直接失败。

**关于 ch149**：`channel=auto` 会走 ACS，可能选到 DFS 信道，然后卡在 60 秒 CAC 里不
出 SSID——在随身设备上表现为"Wi-Fi 是坏的"。149 属于 5725-5850，是中国非 DFS 里可
用功率最宽的一段，所以 5G 默认钉 149、2.4G 默认钉 6。这两条只影响**首启生成**，之后
由脚本或你手选的信道说了算。

**代价要说清楚**：5G 穿透差。手册 §4.2/§4.1 的灵敏度差 5dB 左右（HE80 MCS0 5G
-86dBm vs 2.4G HE20 MCS0 -91dBm），隔一堵墙 5G 就掉到低 MCS。壳装在口袋里、手机
在旁边时 5G 没问题；隔墙场景反而不如 2.4G——那就 `udx-wifi-band 2g`。

**上网需要三件事同时成立**（`95-udx-usb-wan` 只在生产根 + `network.wan.proto=udx`
时生效）：

1. **转发**：给 `wan` 区加 `masq=1` + `mtu_fix=1`，加 `usbmgmt → wan` forwarding；
2. **网关/DNS 下发**：删掉 90-udx-usb 里那两个"空" `dhcp_option 3/6`。它们是
   管理口时代的刻意抑制（不发网关，避免直连的笔记本被抢默认路由），但手机
   拿到这样的租约就只会在本地打转；
3. **上游 DNS**：`proto udx` 不给 netifd 任何 resolver（SIPA 链路没有 DHCP 租约
   可带 option 6，`proto/udx.sh` 里也没有任何 DNS 代码），`resolv.conf.auto`
   因此没有 WAN DNS，dnsmasq 起来后没有 forwarder。本次在
   `95-udx-usb-wan` 里补了：未配置 `dhcp.@dnsmasq[0].server` 时固定
   `223.5.5.5` + `119.29.29.29`。

缺任何一条的症状都很像：手机连上了、拿到 192.168.9.x、能 ping 192.168.9.1，
但打不开网页。缺 1/2 是"出不去"，缺 3 是"域名解析全失败"。

Recovery 里没有 `network.wan`（proto=udx），所以 AP 只提供本地管理，不通外网。

## 5. 首启怎么自动配好

```
/etc/board.d/03-sy108-wifi          ← 本次新增
  → /etc/board.json  wlan.defaults = { country: CN, network: usbmgmt,
        ssids: { "2g": {ssid:SY108, psk2, 12345678},
                 "5g": {ssid:SY108, psk2, 12345678, channel:149} } }
  → /etc/init.d/boot 调 /sbin/wifi config
  → wifi-scripts 的 /lib/wifi/mac80211.uc 生成 /etc/config/wireless
      · bands_order=[5G,2G] 取第一个存在的 band，一个 radio 只生成一个 wifi-device
      · wlan.defaults 非空 → wireless.default_radio0.disabled=0（否则默认 disabled=1）
      · 070 补丁让 wifi-iface.network 取到 usbmgmt，而不是写死 lan
      · 070 补丁让 channel 取 ssids.<band>.channel（149 而不是 auto/ACS）
  → hostapd 起 phy0-ap0，netifd 把它桥进 br-usb
```

不需要额外的 `wifi up` 服务，也不需要任何 hotplug 脚本。

## 6. host-only 的连锁改动（和无线是同一个切片）

USB 口从"device（NCM 管理网）"改成"host（接 WiFi 卡）"，会牵动四处：

| 位置 | 改动 | 不改会怎样 |
|---|---|---|
| `patches-7.3/900-usb-host.patch`（新增） | main 的 `udx710-sy108.dts` 里 `&usb1_dwc3` 加 `dr_mode="host"`，去掉 `sprd,pamu3-offload` | 口仍是 device，WiFi 卡根本不会枚举 |
| `.github/workflows/build-firmware.yml` | DTB 校验按 profile 区分：main 要 `host`、recovery 要 `peripheral`，禁止两者同时出现 | 旧校验强制 `peripheral`，main 直接红 |
| `packages/udx-upgrade/src/boot-state.c` | `boot_management_ready()` 加 host-only 分支：无 UDC 时按"SSH 或 80+443 或 usbmgmt 就绪"判定 | `boot_accept` 永远失败 → 重试 24 次后 trial 到期 → watchdog 回退 Recovery（历史上踩过一次，见 §10.4 回退） |
| `packages/udx-usb/files/etc/init.d/udx-usb` | 无 `/sys/class/udc/29100000.usb` 时 `start/stop` 直接返回 0 | 服务每次启动都失败，br-usb 是否起来变得不确定 |

`dr_mode` 写在共用的 `udx710-sy108.dtsi` 里，**只在 main 的 dts 覆盖，不动 dtsi**：
recovery 也是 include 这个 dtsi 的，改 dtsi 会把 recovery 一起变成 host，它的有线
管理口就没了——那是刷坏之后的最后一条命。

## 7. 与 Recovery 的边界

| | main | recovery |
|---|---|---|
| USB 角色 | **host**（`dr_mode="host"`） | **peripheral**（dtsi 默认，未改） |
| 接入通道 | Wi-Fi AP → br-usb 192.168.9.1（手机上网） | USB NCM 有线口（插电脑） |
| 无线驱动 | 内建（`MT7921U=y`） | **也编进去了**，但没有 XHCI，永远用不上 |
| 定位 | 日常使用 | 刷坏了救回来 |

这是有意的不对称：main 把唯一的 USB 口让给 WiFi 卡，recovery 保留有线口。如果希望
recovery 也能无线管理，需要把 `config-recovery`、recovery 的 dts 角色、以及
recovery rootfs 的 WiFi 包一起改——那是另一个切片，没有一起做。

**一个必须说清楚的细节：recovery 的配置是"叠加"在 `config-7.3` 上的，不是替换。**
`integration/openwrt/target/linux/sprd/Makefile:11-13` 只在 `CONFIG_SY108_RECOVERY=y`
时把 `config-recovery` **追加**进 `LINUX_KCONFIG_LIST`，所以 `config-7.3` 里的
`CFG80211` / `MAC80211` / `MT76_*` / `MT7921U` 和那三条 `CONFIG_EXTRA_FIRMWARE` 会被
recovery 一起继承。`config-recovery` 关掉的是 USB 存储/网络/音频、`SCSI`、`SIPA`、
`PAMU3`、`PPP` 这一类——**没有一条碰无线栈**。

也就是说：**recovery 内核里躺着整条 802.11 栈和约 870 KB 固件，但口是 gadget，永远枚举不到
这块卡**。这只是镜像体积/解压时间的代价，不影响功能（recovery 照样走有线 NCM）。

想省掉的话，在 `config-recovery` 加两行就够：

```c
# CONFIG_CFG80211 is not set
CONFIG_EXTRA_FIRMWARE=""
```

`MT7921U` 及其下游符号会因为 `CFG80211` 不可用被 kconfig 自动丢弃，**不要**再逐个写
`# CONFIG_MT792x_USB is not set`——那些符号在 recovery 的上下文里已经不存在，写了只会
在配置合并时刷一堆 warning。这两行本次**没有加**：它属于独立可回退的小切片，要单独跑一次
recovery profile 才能证明确实省下来了，不塞进这个已经很大的切片里。

## 8. 上机验证清单

```sh
# 1. 卡是不是 MT7921（不是 RTL8832），链路是不是真的 USB3
lsusb                       # 期望 0e8d:7961 MediaTek Inc. Wireless_Device
lsusb -t                    # 期望 5000M（USB3）；480M 说明只走了 USB2.0，吞吐封顶 330Mbps
#    外供电 + VBUS 悬空时，出现不了设备先看：
#    dmesg | grep -i dwc3    # 期望有 "dwc3 ... host" 初始化，无 VBUS 相关报错

# 2. 驱动有没有上、固件有没有读到
dmesg | grep -i mt7921      # 期望 HW/SW Version + WM Firmware Version，无 "failed with error -2"
dmesg | grep -iE "reset|over-?current|disconnect"   # 有反复 reset = 供电带不动（峰值 1.8A）
iw dev                      # 期望 phy0-ap0
ls /sys/class/ieee80211/    # 期望 phy0
iw reg get                  # 期望 country CN
iw phy | grep -A8 "valid interface combinations"    # 期望 AP<=1、#channels<=1（判据）

# 3. AP 起来了没
wifi status
uci show wireless | grep -E "ssid|network|disabled|band"
ubus call network.interface.usbmgmt status | grep -E "up|device|address"

# 4. 桥和地址对不对
brctl show br-usb           # 期望有 phy0-ap0
ip -4 addr show br-usb      # 期望 192.168.9.1/24

# 5. 端到端
#   手机连 SY108 / 12345678 → 应拿到 192.168.9.x，网关和 DNS 都是 192.168.9.1
#   手机浏览器打开 http://192.168.9.1（管理页）
#   手机打开任意 https 站点（验证转发 + NAT + 上游 DNS 三段都通）
#   壳上验证：nslookup www.baidu.com 192.168.9.1   # 应能解析
```

## 9. 风险

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| 手上其实是 BL-M8832AU1（RTL8832AU） | 中 | 全部方案不适用 | 先 `lsusb`，见 `0bda:` 立即停 |
| **模块是 LGA 贴片，不是插卡** | 确定 | 没载板就等于没网卡 | 载板要求见 §1.2 |
| **外供 3.3V 线损过大（±0.2V 只有 ±6%）** | 中 | TX 突发掉压 → 掉卡/复位循环，日志像"驱动崩了" | 2A 能力 + 粗线/短走线 + 模块旁 220µF；上机 `dmesg` 看有没有 `usb ... reset` 循环 |
| **外供与 SY108 未共地** | 中 | SS 训练失败、随机掉枚举 | 单点共地，USB 线里的 GND 必须接 |
| **VBUS 引脚被灌 5V** | 中 | 原设计是 device 口，可能触发充电 IC | VBUS 悬空，见 §1.3 |
| 外电常驻 → 模块与 SY108 不同步上电 | 中 | 模块死机无法靠 USB 复位恢复；PHY 掉电时轻微倒灌 | Reset 脚留 RC + 可控点；最好用 GPIO 控负载开关同开同关 |
| **只走 USB2.0 的 D+/D-** | 中 | 吞吐封顶 330Mbps（蜂窝实际速率通常够用） | 要跑满就接 SSTX±/SSRX±；上机 `lsusb -t` 看 `5000M` 还是 `480M` |
| `CONFIG_EXTRA_FIRMWARE` 里文件缺失 | 低 | 内核编译**硬失败**（不是警告） | 文件已入库，`integration/openwrt/firmware/` 随仓库走 |
| `wpad-mbedtls` / `luci-proto-wireless` 包名与 pinned feed 不符 | 低 | CI 的 `Verify requested packages survived defconfig` 会红 | 该步骤就是为此设计的，红了看包名再改 |
| host-only 后 WiFi 起不来 → 失联 | 中 | 只能靠 recovery 有线口 | boot-state 的 host-only 分支仍要求 22/80/443 有监听，起不来会回退 Recovery |
| 驱动组合表 `AP <= 1` + 用到 AP 时必须单信道，做不到 2.4G+5G 双 AP 并发（硬件 2T2R 有 DBDC 能力，但 MCC 组合不含 AP） | 确定 | 同一时刻只能服务一个频段；老设备（仅 2.4G）要手工切 | 默认 5G、`udx-wifi-band 2g` 随时切（持久化）；要真双频需第二块 USB 网卡；见 §4.2 |
| 5GHz 覆盖小于 2.4G（灵敏度差约 5dB） | 中 | 隔墙信号弱、掉低 MCS | `udx-wifi-band 2g` 切到 2.4G，同时改 channel/htmode，重启 wifi 生效，无需重编 |
| 只用 `uci set band=2g` 单改一项 | 中 | channel/htmode 与频段不匹配，hostapd 拒绝启动、SSID 消失 | 用 `udx-wifi-band`（三项一起改），或按 §4.2 的三行 uci 全写 |
| 6GHz 被驱动注册、`bands_order` 又没排除 | 低 | 首启挑到 6G，hostapd 起不来（国内 NO-IR） | `070` 已把 `bands_order` 写成 `[5G,2G]`，这条是它的主要作用 |
| 蜂窝不提供 DNS 导致域名解析失败 | 高（已修） | 能连能 ping，打不开网页 | `95-udx-usb-wan` 固定 `223.5.5.5`/`119.29.29.29` |
| 内建驱动 + 内嵌固件使内核镜像变大 | 确定 | boot.bin 变大 | 已从 24 个固件裁到 3 个；不够再改模块方案 |
| 未编译验证 | — | 首次 CI 可能暴露 config 符号/包名问题 | 先跑一次 main 单 profile，不要直接 `both` |
| 未上机验证 5GHz AP | — | ch149 的可用功率/DFS 行为需实测 | §8 清单里加 `iw reg get` + `iw dev info` |

## 10. 本切片动过的所有文件

13 项，全部服务于"唯一的 USB 口改成 host + 一块 MT7921AU 出 AP"。**没有一项是顺手改的**，
每一项都能单独说出"不改会怎样"。

| # | 文件 | 类型 | 改了什么 | 不改会怎样 |
|---|---|---|---|---|
| 1 | `target/linux/sprd/patches-7.3/900-usb-host.patch` | 新增 | main dts 的 `&usb1_dwc3`：`dr_mode="host"`，注释掉 `sprd,pamu3-offload` | 口还是 device，卡根本不枚举 |
| 2 | `target/linux/sprd/udx710/config-7.3` | 改 | 打开 802.11 + mt76 单链、DWC3 改 host、`CONFIG_EXTRA_FIRMWARE` 内嵌固件、关 regdb 签名校验；有线网卡（8153B / AX88179）保持内建并补上 CDC-NCM | 没驱动 / 没固件 / regdb 被签名校验丢掉 |
| 3 | `integration/openwrt/firmware/` | 新增 | 2 个 MT7961 固件 + `regulatory.db` + `README.md` | 内核编译**硬失败**（文件缺失） |
| 4 | `configs/openwrt-main.config` | 改 | `wpad-mbedtls` / `wifi-scripts` / `iw` / `luci-proto-wireless` / `DRIVER_11AC_SUPPORT` / `DRIVER_11AX_SUPPORT` / `KERNEL_PAGE_POOL`；显式不装 `wireless-regdb`、`kmod-mt7921-firmware` | 有 phy 没 hostapd；或多一份用不上的 rootfs 固件 |
| 5 | `integration/openwrt/patches/070-wifi-default-network.patch` + `series` | 新增 | `bands_order=[5G,2G]`、`channel` 读 `board.json`、`wifi-iface.network` 读 `wlan.defaults.network` | 首启挑 6G/DFS 起不来；AP 挂到没地址的 `lan` |
| 6 | `packages/udx-runtime/files/etc/board.d/03-sy108-wifi` | 新增 | 写 `/etc/board.json` 的 `wlan.defaults`（SSID/密码/CN/usbmgmt/5G ch149、2.4G ch6） | 首启不生成 `/etc/config/wireless` |
| 7 | `packages/udx-usb/files/etc/init.d/udx-usb` | 改 | 无 UDC 时 `start/stop` 直接 `return 0` | 服务每次启动都失败，br-usb 起没起变得不确定 |
| 8 | `packages/udx-upgrade/src/boot-state.c` | 改 | `boot_management_ready()` 加 host-only 分支 | trial 永不过 → 回退 Recovery |
| 9 | `.github/workflows/build-firmware.yml` | 改 | DTB 校验按 profile：main 要 `host`、recovery 要 `peripheral`，禁止并存 | 旧校验强制 `peripheral`，main 直接红 |
| 10 | `packages/udx-runtime/files/etc/uci-defaults/95-udx-usb-wan` | 改 | dnsmasq 没配 `server` 时补 `223.5.5.5` / `119.29.29.29` | 能连、能 ping、打不开网页 |
| 11 | `docs/wifi-mt7921au.md` | 新增 | 本文 | — |
| 12 | `docs/host-wifi/` | 新增 | 历史补丁归档 + 不许 apply 的说明 | 后来者会拿旧补丁硬套 |
| 13 | `packages/udx-runtime/files/usr/sbin/udx-wifi-band` | 新增 | 运行时切频段：`2g` / `5g` / `--rollback`，band + channel + htmode 三项同步改，旧值存 `/etc/udx-wifi-band.prev` | 只能手敲 uci，漏改 channel/htmode 会让 hostapd 起不来；改坏没有一键回退 |

### 10.1 建议的提交拆分

一项一 commit 会让"编译级原子"碎掉（1/2/3 缺一不可），所以按**能独立成立的最小单元**拆：

| 提交 | 含 | 主题 |
|---|---|---|
| 1 | 1 + 2 + 3 | `kernel: build in MT7921U and embed its firmware` |
| 2 | 4 + 5 + 6 + 13 | `openwrt: ship hostapd/wifi-scripts with a default AP config` |
| 3 | 7 + 8 | `usb: survive host-only builds without a UDC` |
| 4 | 9 | `ci: verify the USB role per profile` |
| 5 | 10 | `runtime: pin public resolvers when the udx proto provides none` |
| 6 | 11 + 12 | `docs: external USB Wi-Fi bring-up` |

### 10.2 推送前 1 分钟自检

CI 一轮 50 分钟，下面几条能在本地把"必红"的先挡掉（都实测跑通过）：

```sh
cd sy108-mainline

# 1) 内嵌固件一个都不能少 —— 少一个内核编译硬失败
for f in $(sed -n 's/^CONFIG_EXTRA_FIRMWARE="\(.*\)"$/\1/p' \
        integration/openwrt/target/linux/sprd/udx710/config-7.3); do
	test -f "integration/openwrt/firmware/$f" && echo "ok   $f" || echo "MISS $f"
done

# 2) series 里每个补丁都要真的有文件
for p in $(grep -v '^#' integration/openwrt/series | grep -v '^$'); do
	test -f "integration/openwrt/patches/$p" && echo "ok   $p" || echo "MISS $p"
done

# 3) 内核补丁在位
test -f integration/openwrt/target/linux/sprd/patches-7.3/900-usb-host.patch && echo "ok   900"

# 4) 四个脚本语法 + 可执行位
for f in packages/udx-runtime/files/etc/board.d/03-sy108-wifi \
         packages/udx-runtime/files/usr/sbin/udx-wifi-band \
         packages/udx-usb/files/etc/init.d/udx-usb \
         packages/udx-runtime/files/etc/uci-defaults/95-udx-usb-wan; do
	sh -n "$f" && echo "ok   $f"
done
test -x packages/udx-runtime/files/usr/sbin/udx-wifi-band && echo "ok   udx-wifi-band +x"

# 5) workflow YAML 能解析
python -c "import yaml;yaml.safe_load(open('.github/workflows/build-firmware.yml',encoding='utf-8'));print('yaml ok')"

# 6) 新脚本必须进仓库时带可执行位（Windows 上 core.fileMode=false 会丢）
git ls-files -s packages/udx-runtime/files/usr/sbin/udx-wifi-band |
	grep -q '^100755' && echo "ok   mode 100755" ||
	echo "WARN: 不是 100755（未跟踪也会落到这里）→ git update-index --chmod=+x <file>"
```

`boot-state.c` 编不了（要 libubus 与交叉工具链），只能靠 CI；那 14 行改写只用了
`access()`（`<unistd.h>` 已在）与已有的两个 helper，语义见下：

```c
if (access("/sys/class/udc/29100000.usb", F_OK)) {   /* 0 = 存在 → 取反是"不存在" */
	if (management_listener(22) ||                    /* 0 = 在监听 */
	    (management_listener(80) && management_listener(443)) ||
	    management_network_ready())                   /* 0 = 就绪 */
		return -1;                                    /* 非 0 = 不通过 */
	return 0;
}
```

两个 helper 都是"**0 = 好**"，所以整段读作"三项至少成立一项，否则判失败"。

### 10.3 CI 会替你验什么，不会验什么

| CI 会验 | CI 不会验 |
|---|---|
| 内核配置符号真的生效（`... survived defconfig`） | hostapd 能不能起 |
| 产物 DTB 里 `dr_mode` 是 `host` / `peripheral` | 固件能不能被 probe（`request_firmware` 成败） |
| 内核补丁在缓存的树里被重放（改了 `patches-7.3/` 会丢缓存） | `iw phy` 组合表是不是 `AP<=1` |
| 请求的包在 defconfig 里没被丢 | DNS 能不能解析、手机能不能上网 |
| 内核编译通过 | 卡的真假（RTL8832 冒充） |

右边四行**只有上机才知道**，§8 那张清单就是为它们写的。**CI 绿不等于 Wi-Fi 能用。**

### 10.4 回退

**这一片必须"同进同退"**：host 模式与无线是一体的。只退无线、不退 USB 角色，结果是
既没有 NCM 有线口、也没有 AP——设备只剩 recovery 可进。所以：

| 想退到哪 | 怎么做 | 结果 |
|---|---|---|
| 回到改动前（推荐） | 刷上一版 `sysupgrade.bin`，或 `git revert` 那 6 个提交后重编 | 一切照旧，有线管理口回来 |
| 只改回 USB 角色 | 删 `patches-7.3/900-usb-host.patch`，`config-7.3` 里 DWC3 三行恢复成 `GADGET=y` | 回到 device 模式；无线包留着也不会有 AP，但管理口复活——**这是救砖路径** |
| 只关无线（不推荐） | 从 `configs/openwrt-main.config` 去掉 `wpad-mbedtls`/`wifi-scripts` | 口仍是 host，没有任何管理入口，等于自断退路 |

`patches-7.3/` 下的 `001`（Type-C 检测）与 `002`（USB3 LPM）与本次无关，不要一起动；
它们的来龙去脉见 [已验证改动](verified-changes.md)。
