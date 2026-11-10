# USB3 SuperSpeed 链路偶发不稳：`usb1_dwc3` 缺少主线 U1/U2 禁用 quirk（含实测与已验证补丁）

> **存档说明**：本仓库 GitHub Issues 已关闭，因此该上游 issue 稿以文档形式归档于此。
> 正式提交上游 `jason-liu-4980/linux-udx710` 前请确认 §1 环境表中的提交号。
> 修复已在本仓库落地：`integration/openwrt/target/linux/sprd/patches-7.3/002-sy108-usb3-lpm-disable.patch`（`3faacf5`），
> 记录见 [`verified-changes.md`](verified-changes.md)，补丁机制见 [`build.md`](build.md#板级内核补丁)。

> 建议提交到 `jason-liu-4980/linux-udx710`（设备树所在仓库）；同步说明可集成进 `sy108-mainline` 的 `integration/openwrt/target/linux/sprd/patches-7.3/`。
> 本文所有数字均来自一台 SY108 的实测，测试方法与边界见文末。
>
> **修订说明（相对初稿 4 处改动，均按 `14658d97` 源码复核）**
> 1. §4/§8：初稿的「描述符级软禁用」「未做硬件级门禁」**不准确**。该 quirk 是四层生效，其中 `DCTL.INITU*/ACCEPTU*` 属控制器寄存器级门控。按「软禁用」表述会让人误以为要在 PHY 侧补 `GUSB3PIPECTL` 补丁（§6 第 4 条已相应改写）。
> 2. §4：初稿的「必须在 001 之后」改为「文件名排序自然在后，内容上无依赖」——实测干净树上单独应用同样成功。
> 3. §3：补上驱动默认退出延迟的具体值（`0x0A`/`0x1FF`），便于对照 BOS 描述符。
> 4. §5：补充「同一提交重建后 `sysupgrade.bin` 哈希会变」，避免复现时误判。

## 1. 环境

| 项 | 值 |
|---|---|
| 硬件 | SY108 / UDX710 CPE，PMIC SC2730 |
| 系统 | 主线 Linux 7.3.0 aarch64 + OpenWrt 25.12.5 r33051-f5dae5ece4 |
| 内核源 | `jason-liu-4980/linux-udx710@14658d97220a06e34976d703e167073462390c78`（`manifests/kernel.json` 锁定） |
| USB | UDC `29100000.usb` = `dwc3-gadget` + `udx-usb` configfs gadget，`profile=ncm`（PAM U3 卸载）；USB0 `21400000` 在板级 disabled |
| 主机 | Windows 11，`UsbNcm Host Device`，USB3 数据线 |
| 工具 | iperf3 3.20（设备端与主机端同版本，cJSON 1.7.15） |

README 里提到「USB 3.0 SuperSpeed 链路偶发不稳，目前尚不确定是测试线材/转接头问题还是 PHY/链路参数仍需微调」。下面给出可复现的定位结果：主因是设备树漏配，不是线材。

## 2. 现象（修复前）

3.0 线能识别、能协商到 `super-speed`，但后台/SSH 极慢或间歇不通；换回 2.0 线同一台设备立刻正常（1ms、0% 丢包）。

| 指标 | 修复前 |
|---|---|
| `current_speed` / `state` | `super-speed` / `configured` |
| `link_state` 连续采样 | 恒为 `U1`/`U2`（12 次 U1→U2，另有 15 次全 U1） |
| `GDBGLTSSM` | `0x40410042` ↔ `0x40810042` 来回跳 |
| ping | 丢包 8%~100%，RTT 3ms~2338ms |
| TCP 22 / 80 | 1~10s，或超时 |
| SSH 建连 | 22~34s |
| HTTP TTFB | 3~9s |
| 设备负载 | `loadavg 0.20`，CPU 空闲 |

主机侧伴随 `Kernel-PnP 1010`（USB 设备反复 surprise removal）、`NDIS 10400`、`Tcpip 4207`；关闭 Windows「USB 选择性暂停」无效，`echo U0 > link_state` 被 `-EINVAL` 拒绝，写 `Recovery` 虽返回 0 但链路仍停在 U1、没有重训。

## 3. 源码定位

1. **`arch/arm64/boot/dts/sprd/udx710.dtsi` 两路 USB 不对称**：USB0 `usb@21400000` 的 dwc3 子节点带 `snps,usb3-u1u2-disable;`，而实际启用的 USB1 `usb1_dwc3: usb@29100000` **没有任何 U1/U2 禁用属性**。
2. **`arch/arm64/boot/dts/sprd/udx710-sy108.dtsi`** 里 `&usb1_dwc3` 只有 `dr_mode = "peripheral";`；`udx710-sy108-recovery.dts` 也未补 LPM 属性（只 disable 了 `pamu3`），所以切 Recovery / `ncm-software` 无法规避。
3. **`snps,usb3-u1u2-disable` 是主线不认识的死属性**：来自高通/安卓下游 4.14 内核（绑定文档「disable U1U2 low power modes in Superspeed mode」）。主线 7.3 `drivers/usb/dwc3/core.c` 的 `dwc3_get_properties()` 读的是 `snps,dis-u1-entry-quirk`、`snps,dis-u2-entry-quirk`、`snps,usb3_lpm_capable`；glue `dwc3-of-simple.c` 只读 `dr_mode`/clocks/reset/phy，也不解析该属性；展锐原厂 `sprd-linux/ud710_bsp` 的 `kernel4.14/drivers/usb/dwc3/core.c` 里没有 `usb3_u1u2_disable` 字段，反而默认 `u1u2_enable = true`。
4. 于是主线 gadget 侧照常声明非零 `bU1devExitLat` / `bU2DevExitLat`（驱动默认值 `DWC3_DEFAULT_U1_DEV_EXIT_LAT = 0x0A`，即 ≤10 µs；`DWC3_DEFAULT_U2_DEV_EXIT_LAT = 0x1FF`，即 ≤511 µs，见 `drivers/usb/dwc3/gadget.h:59/62`），主机据此判定设备支持 LPM 并下发 `SET_FEATURE(U1_ENABLE/U2_ENABLE)`，链路一空闲就进 U1/U2，每个包都要先唤醒 —— 与 RTT 抖动、丢包、握手被放大完全吻合。U1/U2 是 USB3 链路层状态，USB2.0 线不受影响，这也解释了「2.0 线正常」。
5. **另一处独立问题（本次未改）**：`drivers/phy/sprd/phy-sprd-orca-usb.c` 只有上电/解复位，没有 USB3 链路训练、LFPS、TX swing / de-emphasis tuning（文件头自述 "no undocumented tuning"）；`orca_usb0_glb[]`（GLB `0x9c`/`0xb4`）只有 PHY0 有，`orca_usb1_data` 不含 `.glb`。该序列的注释来源是原厂内核二进制反汇编，公开 BSP 源码里没有 PHY1 对应值，**没有可复现来源，不建议照搬 PHY0 数值**。

## 4. 已验证的修复

板级 DTS 最小改动（不动 SoC 通用 dtsi 的其它内容，不改 C 代码、不改寄存器、不改 `kernel.json`）：

```diff
--- a/arch/arm64/boot/dts/sprd/udx710-sy108.dtsi
+++ b/arch/arm64/boot/dts/sprd/udx710-sy108.dtsi
@@ -70,6 +70,8 @@
 
 &usb1_dwc3 {
 	dr_mode = "peripheral";
+	snps,dis-u1-entry-quirk;
+	snps,dis-u2-entry-quirk;
 };
 
 #include "udx710-sy108-firmware.dtsi"
--- a/arch/arm64/boot/dts/sprd/udx710.dtsi
+++ b/arch/arm64/boot/dts/sprd/udx710.dtsi
@@ -719,7 +719,8 @@
 					phys = <&usb0_phy &usb0_phy>;
 					phy-names = "usb2-phy", "usb3-phy";
 					phy_type = "utmi_wide";
-					snps,usb3-u1u2-disable;
+					snps,dis-u1-entry-quirk;
+					snps,dis-u2-entry-quirk;
 					snps,dis_u3_susphy_quirk;
 					snps,dis_u2_susphy_quirk;
 					snps,overlap_check_quirk;
```

这两个 quirk 由 `core.c:1898/1900` 的 `dwc3_get_properties()` 读入（`device_property_read_bool`，布尔属性，无需取值），随后**四层同时生效**，不是只有描述符：

| 层 | 位置（`14658d97`） | 效果 |
|---|---|---|
| BOS 描述符 | `gadget.c:3313/3319` → `composite.c` | `bU1devExitLat`/`bU2DevExitLat` 报 0，主机据此不再启用 LPM |
| 控制传输 | `ep0.c:415–438`（`dwc3_ep0_handle_u1/u2`） | 主机 `SET_FEATURE(U1_ENABLE/U2_ENABLE)` 直接返回 `-EINVAL` |
| 设备发起位 | 同上，`DCTL.INITU1ENA(BIT10)/INITU2ENA(BIT12)` | 因提前返回，这两位永远不会被置位 |
| 设备接受位 | `ep0.c:672–691`（`SET_CONFIGURATION`） | `DCTL.ACCEPTU1ENA(BIT9)/ACCEPTU2ENA(BIT11)` 只在 quirk 缺失时才置位，此时保持 0 |

后两层是 DWC3 控制器寄存器（`DCTL`）级的门控，**不需要主机配合**：即便主机无视 BOS 强行使能，设备侧既不会发起也不会接受 U1/U2 进入。这一点在排障时很关键——若刷入后仍然观察到 U1/U2，正确结论是「新 DTB 没有真正生效」，而不是「主机无视 BOS」。

编译/集成方式：作为 `002-sy108-usb3-lpm-disable.patch` 放进 `sy108-mainline` 的 `integration/openwrt/target/linux/sprd/patches-7.3/`（OpenWrt 对该目录下的 `*.patch` 按文件名字典序全量应用，`002-` 自然排在 `001-` 之后；两者 hunk 区域分别在 `udx710.dtsi` 的 `@@ -719` 与 `udx710-sy108.dtsi` 的 `@@ -70`，与 001 的 `@@ -249` 及 MFD/Kconfig 段不重叠，**内容上没有依赖**，实测在干净树上单独应用也成功）。注意该目录**不能**靠 `integration/openwrt/series` 登记，那里只管 OpenWrt 源码树的板级补丁。

## 5. 修复后实测

**补丁确实进固件**：commit `3faacf5` 新增 25 行（blob `17d146c…`）；CI run `42799471297` 两个构建 job 全 success，且「Drop cached kernel when target patches change」已执行；`board.dtb` 里 USB1/USB0 两个节点各带两个 quirk（FDT 解析，布尔属性 len=0），死属性全树 0 处；该 DTB 逐字节嵌在 `sysupgrade.bin` 偏移 7,143,936。刷机后运行时 `/sys/firmware/devicetree/base/soc/ipa-bus/usb3@29100000/usb@29100000/` 下可直接看到两个 quirk 文件。

> **复现提示**：同一提交重新构建时 `sysupgrade.bin` 的 SHA-256 会变（`mksquashfs` 打包元数据不同，字节数一致：本次两次构建均为 20,869,370 B，哈希分别为 `4b135929…` / `7c8e7848…`），但 `build.json` 与 `board.dtb` 逐字节相同（`board.dtb` 均为 58,486 B / `c498fe2f…`）。**核对补丁是否生效请以 `board.dtb` 或运行时设备树为准，不要比对 `sysupgrade.bin` 哈希。**

**链路与响应**

| 指标 | 修复后 |
|---|---|
| `current_speed` / `state` | `super-speed` / `configured`（未降速） |
| `link_state` ×15 | **全 `U0`** |
| `GDBGLTSSM` | `0x40008042`（不再跳变） |
| ping 12 包 | 0% 丢，全 1ms |
| TCP 22 / 80 | 0.0017s / 0.0012s |
| HTTP TTFB | 0.0015s |
| SSH 建连 | 0.164s |

**iperf3 3.20 吞吐（3.0 线，U0）**

| 测试 | 吞吐 | 稳定性 | 设备 CPU |
|---|---|---|---|
| TCP 单流 8s 主机→设备 | 2.279 Gbps | 2.165–2.324 Gbps/秒 | 57% |
| TCP 单流 8s 设备→主机 | 1.216 Gbps | 1.208–1.220 Gbps/秒 | 67% |
| TCP 4 流 8s 主机→设备 | 2.063 Gbps | 1.933–2.191 | 64% |
| TCP 4 流 8s 设备→主机 | 1.700 Gbps | 1.655–1.717 | 74% |
| TCP 单流 **30s** 设备→主机 | 1.198 Gbps | 1.181–1.214（10 个 3s 区间），`retrans=0` | 69% |
| TCP 8 流 10s 主机→设备 | 1.870 Gbps | 1.824–1.957 | 61% |
| TCP 8 流 10s 设备→主机 | 1.700 Gbps | 1.673–1.701 | 81% |
| UDP 800M 5s 主机→设备 | 0.799 Gbps | 丢包 0.360%，jitter 0.1521 ms | 27% |
| UDP 800M 5s 设备→主机 | 0.589 Gbps | 丢包 0%，jitter 0.0134 ms | 91% |

设备→主机方向 1.198–1.700 Gbps 与 README「USB3.0 SS 约 1.2–1.8 Gbps」一致；30 秒长测无衰减，每秒曲线几乎水平。设备 CPU 57–92%，印证「SS 满速会占用大量 CPU」。设备为 2 核 `schedutil`（256–1352 MHz），测试期间采样到 1014/1352 MHz 两档，空闲回落到 256 MHz；加流到 8 条并不能提速（`dev→host` 仍 1.700 Gbps），说明瓶颈在设备侧 CPU 而非链路。UDP 目标 2G 的主机→设备方向客户端会饿死控制连接而超时，降到 800M 可正常测量，属测试配置限制，非链路故障。

## 6. 建议

1. 在 `udx710-sy108.dtsi` 的 `&usb1_dwc3` 补 `snps,dis-u1-entry-quirk;` / `snps,dis-u2-entry-quirk;`（本补丁）。
2. 把 USB0 上主线不解析的 `snps,usb3-u1u2-disable` 换成同样的两个 quirk，避免继续误导。
3. PHY1 的 GLB 初始化与 TX swing / de-emphasis / LFPS tuning 作为**独立后续改动**处理，需要原厂 BSP 头文件数值或寄存器来源；不建议把 PHY0 的 `0x9c`/`0xb4` 照搬（两者 MMIO 基址不同：`ssphy0@634d0000` vs `ssphy@634e0000`）。主线现成的 `snps,lfps-filter-quirk`、`snps,rx-detect-poll-quirk`、`snps,tx-de-emphasis-quirk` 比自写 undocumented 值更干净。
4. 不建议再补 PHY 层 `GUSB3PIPECTL` 的硬件禁止：由 §4 表格可见，`SET_FEATURE` 已被拒绝、`DCTL.INITU*/ACCEPTU*` 四位恒为 0，主机即使无视 BOS 也无法让设备进入 U1/U2。若将来要做「U1/U2 开启 vs 关闭」的功耗对照实验，才需要反向的开关（例如把该 quirk 做成可选属性），那不是本 bug 的修复范围。
5. README 里那句「尚不确定是线材还是 PHY 参数」可更新为：主因已定位为设备树漏配；线材/信号完整性仍建议排除，但不是本现象的根因。

## 7. 复现与验收命令

```sh
# 修复前/后对比
cat /sys/class/udc/29100000.usb/current_speed
for i in $(seq 1 20); do cat /sys/kernel/debug/usb/29100000.usb/link_state; sleep 0.3; done
grep -E 'GDBGLTSSM|DSTS' /sys/kernel/debug/usb/29100000.usb/regdump
ping -c 12 <host-side-usb-ip>

# 运行时确认补丁生效
ls /sys/firmware/devicetree/base/soc/ipa-bus/usb3@29100000/usb@29100000/ | grep -E 'dis-u[12]-entry-quirk'

# 吞吐（设备端）
iperf3 -s -D --pidfile /tmp/iperf3-server.pid
# 主机端（iperf3 3.20）
iperf3 -c <device-ip> -J -t 30 -i 3 -R
iperf3 -c <device-ip> -J -t 10 -P 8
iperf3 -c <device-ip> -J -u -b 800M -t 5
```

注意：`link_state` debugfs 只接受 `SS.Disabled` / `Rx.Detect` / `SS.Inactive` / `Recovery` / `Compliance` / `Loopback`，写 `U0` 会返回 `-EINVAL`；这里的 `Recovery` 是 LTSSM 状态，与项目的 Recovery 启动系统无关。

## 8. 边界与未验证

- 仅一台 SY108、一条 USB3 线、一台 Windows 主机；未在其它线材、主机口、批次或其它 UDX710 机型上验证。
- 两个 quirk 覆盖描述符、控制传输与控制器 `DCTL` 策略位四层（见 §4 表），**未**做 PHY 层（`GUSB3PIPECTL`）设置，按代码路径推断也不必要；「主机无视 BOS」这一情形没有真实样本可测（手头只有一台 Windows 主机，且它在 BOS 报 0 后就不再生效），故该分支属代码推断而非实测。
- CPU 调频只做了只读采样（69 个样本，1014/1352 MHz 两档），**没有改 governor 做对照**，因此不能把某一组吞吐差异归因到具体频率。
- 2.0 线当时只测了 SSH 加密通道（约 94.5 Mbps），没有 iperf3 裸测基线，不与上面的 Gbps 数字直接比较。
- 未测 USB Host 模式、`usb3_lpm_capable` 属性交互、UDP 极限带宽与长时间（>30s）稳定性。
- 设备侧 `dmesg` 无 LTSSM 日志、`/sys/fs/pstore` 不存在、串口未接，因此没有链路训练过程记录；结论基于 `link_state`/`GDBGLTSSM` 寄存器快照、DTS 源码与修复前后对照。
