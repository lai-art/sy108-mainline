# 已验证改动记录

本文件记录在作者基线之上、**已在真机验证通过**并被接受进主线的改动。每条写明：改了什么、为什么、拿什么证明、怎么退。

- 设计说明见[架构与接口](architecture.md)，构建维护见[构建维护](build.md)，未完成项见 README「现状、已知限制与待办」。
- 验证环境：Soyealink SY108（UDX710），单台样机；主机 Windows + 原生 USB 3.0 口。
- 记录时主线 HEAD：`3faacf5`；对应发布 tag：`v2026.11.10-usb3-lpm`。

## 变更清单

按合入顺序。除最后一条外，全部在 `v2026.11.10-usb3-lpm` 之前的验证周期内完成。

| 提交 | 改动 | 性质 | 真机验证 | 回退 |
|---|---|---|---|---|
| `a5fc683` | USB gadget 增加 `rndis` / `rndis-software` / `ecm` 三档，共五档 profile | 功能补齐 | RNDIS 实测可用；ECM 已适配但**连通性未实测** | 删除对应档位分支，恢复三档 |
| `91ec7fd` | `view/udx/hardware.js` 改名 `hardware2.js` | 绕开 LuCI 静态资源 `?v=` 缓存 | 改后下拉选项立即可见 | 改回原名（旧缓存会复现） |
| `eaf897c` | 新增 `001-sy108-typec-detection.patch`，启用 SC2730 Type-C 控制器与驱动 | **仅观测**，不改行为 | 驱动加载正常，IRQ 计数恒 0；`cmdline` 与 `uptime` 无变化 | 删除该 patch 重新构建 |
| `2294051` | CI：目标内核补丁变更时丢弃缓存的内核树 | 构建基础设施 | 补丁变更后内核确实重放 | 删除该 step |
| `6cc222c` | 内核补丁从 `udx710/patches-7.3/` 移到 `sprd/patches-7.3/` | 构建修正 | 移动前补丁从未被应用，移动后生效 | — |
| `d2088c6` | 去掉 `TYPEC_SC27XX` 的 `select TYPEC` | 修 Kconfig 依赖环 | 构建通过 | — |
| `3faacf5` | 新增 `002-sy108-usb3-lpm-disable.patch`：USB1 关闭 U1/U2 进入 | **缺陷修复** | 见下节 | 删除该 patch 重新构建，或刷回 `d2088c6` 产物 |

## 1. USB 网络协议扩展（`a5fc683`）

**背景**：作者 README 写明「USB 网络目前仅做了 CDC-NCM 支持；RNDIS 与 CDC-ECM 因个人无使用需求暂未适配」。核查后确认内核侧已齐备（`config-7.3` 里 `CONFIG_USB_CONFIGFS_{RNDIS,ECM}=y`，`f_rndis` 具备 `ifname`/`host_addr`/MS OS 描述符，`f_ecm` 具备 `ifname`/`host_addr`），缺口全在用户态。

**改动**：`gadget.sh` 的 `g_profile()` 扩为五档，每协议独立 PID（`0x0105` NCM / `0x0106` RNDIS / `0x0107` ECM，ACM 再 +16）；网卡名恒为 `uncm0`，桥与防火墙不随档位变化。不碰内核、不动 DTS、不改试启动时序判据。

**验证**：RNDIS 档在 Windows 上枚举为 `USB\VID_1D6B&PID_0106`，产品串含 `rndis management`，取得租约 `192.168.66.17`，管理面可访问，实测下行 38.8 Mbps / 上行 8.2 Mbps / 时延 59 ms。

**边界（勿过度声称）**：`ecm` 档只验证了「配置能建起来」，**未做连通性实测**。此外三者中只有 NCM 写 `max_segment_size=1514` 与 WINNCM 描述符；RNDIS 写 `pamu3` 与 MS OS 描述符；ECM 除 `ifname`/`dev_addr`/`host_addr` 外什么都不写——`f_ecm` 没有这些属性，写了会 `ENOENT` 导致整个 gadget 建不起来。

## 2. Type-C 检测（`eaf897c`，补丁 001）

**目的**：不是为了让 Type-C 能切角色，而是把「能不能」这件事变成可测量的。移植 `sc27xx-typec.c`，只做状态检测上报。

**验证结论（也是 OTG 的终证）**：IRQ 计数恒 0、无 partner；`0x384 MODE=0x20d6`（DRP）、`0x39c STATUS=0x09`（TOGGLE_SLEEP）、`0x3e0 DBG1=0x100`（CC 无对端）——**CC 线未接到 SC2730**，角色切换在硬件层就不可行，不需要再写软件方案。

**为什么留在主线**：只注册检测、不参与切换，行为零变更；留着可作为后续排障的观测点。若确认无用，删除 `001-*.patch` 与 `config-7.3` 对应四行即可。

## 3. SuperSpeed 链路滑入 U1/U2（`3faacf5`，补丁 002）

**现象**：USB 3.0 连线下能进后台，但 `link_state` 反复停在 U1/U2，RTT 3 ms ~ 2338 ms、丢包 8%~100%；同一设备换 USB 2.0 线则 1 ms / 0% 丢。

**归因**：不是线材，也不是 PHY 参数。`current_speed` 始终 `super-speed`（训练成功过），问题在训练完成后空闲滑入 U1/U2 回不来。BOS 里 U1/U2 退出延迟报的是驱动默认值 `0x0A`(10 µs) / `0x1FF`(511 µs)，主机据此判定设备支持 U1/U2 并持续下发 `SET_FEATURE(U1/U2_ENABLE)`。

**修复**（`+25 行`、仅 2 个 `.dtsi`、零 C 代码）：

- `&usb1_dwc3` 增 `snps,dis-u1-entry-quirk` / `snps,dis-u2-entry-quirk`；
- 清掉 `udx710.dtsi` 上无任何驱动解析的死属性 `snps,usb3-u1u2-disable`。

**生效机制（三层，对锁定内核 `14658d97` 逐点核实）**

| 层 | 位置 | 效果 |
|---|---|---|
| 描述符 | `drivers/usb/dwc3/gadget.c:3313/3319` → `composite.c` | BOS 的 `bU1devExitLat`/`bU2DevExitLat` 报 0（按规范即「不支持 U1/U2」） |
| 控制传输 | `drivers/usb/dwc3/ep0.c:426/450` | 主机 `SET_FEATURE(U1/U2_ENABLE)` 直接返回 `-EINVAL` |
| 控制器策略位 | `drivers/usb/dwc3/ep0.c:685/687` | `SET_CONFIGURATION` 不再置 `DCTL.ACCEPTU1ENA(BIT9)` / `ACCEPTU2ENA(BIT11)` |

第三层是控制器侧硬件门控。所以**若刷后仍然进 U1/U2，正确结论是「新 DTB 没生效」，而不是「主机无视 BOS」**——不要再去写第二个 PHY/寄存器补丁。

**验证**

| 指标 | 修复前 | 修复后 |
|---|---|---|
| `link_state` ×15 | U1 / U2 / U2 … | 全 U0 |
| `current_speed` | super-speed | super-speed（未降速） |
| `GDBGLTSSM` | 两个值来回跳 | 单值稳定 |
| `ping` ×12 | 8%~100% 丢、3~2338 ms | 0% 丢、全 1 ms |
| TCP 建连 22 / 80 | 1~10 s | 0.0017 s / 0.0012 s |
| HTTP TTFB | 3~9 s | 0.0015 s |
| SSH 建连 | 22~34 s | 0.164 s |

运行时旁证：`/sys/firmware/devicetree/base/soc/ipa-bus/usb3@29100000/usb@29100000/` 下存在两个 quirk 属性，`snps,usb3-u1u2-disable` 全树不存在。

**代价（这是取舍，不是缺陷）**：对主机宣告不支持 U1/U2，空闲链路功耗略升，严格 USB-IF 合规上是取舍项。**不要把它当通用优化推广到别的板卡。**

**副作用说明**：USB0（`usb3@21400000`）节点也带上了这对 quirk。本板 USB0 wrapper 与 `usb0_phy` 全 `disabled`，无功能影响；将来若有板级变体启用 USB0，会继承该策略。

**未验**：SS 吞吐绝对值未测。`iperf3` 已在镜像中，但此前丢包状态下测出的吞吐不作数，需在稳定基线上重测并同时记录 CPU 各核占用、`scaling_cur_freq`、DDR 频率。

## 4. 单独复用补丁 002

```sh
cd linux-udx710
git checkout 14658d97220a06e34976d703e167073462390c78
git apply --check -p1 /path/to/002-sy108-usb3-lpm-disable.patch
git apply -p1        /path/to/002-sy108-usb3-lpm-disable.patch
```

注意事项：

- 两个 hunk 分别落在 `udx710-sy108.dtsi` 与 `udx710.dtsi`，与 001 的区域不重叠，**没有先后依赖**。
- 属性是布尔属性，只写名字、不写值。
- 只改 DTS 不重编 DTB 等于没改；`out/openwrt-build` 有缓存时需先删除 `build_dir/target-*/linux-sprd_udx710`（见[构建维护](build.md#板级内核补丁)）。
- 构建后必须确认产物 DTB 带上了这两个属性——CI 已内置该校验，本地可手工 `grep -ac snps,dis-u1-entry-quirk out/images/main/board.dtb`（期望 2）。

## 5. 不要误读的几件事

1. **镜像不可复现**：同一提交两次构建，`sysupgrade.bin` 字节数相同但 SHA-256 不同（`4b135929…` / `7c8e7848…`）。差异全部落在 rootfs 打包元数据（`mksquashfs` inode 与表偏移），`build.json` 逐字节相同、`board.dtb` 哈希相同、内核区相同。**不要把哈希当镜像身份**，需要逐字节同版时以具体 CI run 的 artifact 为准。
2. **`GDBGLTSSM` 不是状态名判据**：内核对该寄存器没有位域解析，外部工具给出的 `Recovery`/`SS.Inactive` 归类不可靠。硬判据是 `DSTS` 的 `USBLNKST`（bit[21:18]，U0=0）+ `link_state` 读数 + 行为指标。
3. **`snps,usb3-u1u2-disable` 是死属性**：全树无任何解析代码，写了也不生效。已删除，不要重新引入。
4. **Recovery 是启动系统，不是链路状态**：LTSSM 里的 `Recovery` 与本项目试启动回退的 Recovery 无关。
