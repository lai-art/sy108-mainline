# luci-theme-mwrt 功能裁剪落地与映射说明（W4）

## 0. 范围与口径

- 主题名：`mwrt`；新包根：`sy108-mainline/packages/luci-theme-mwrt/`。
- 本轮新增文件共 3 个：`root/www/luci-static/mwrt/mwrt-cat-art.js`、`root/www/luci-static/mwrt/mwrt-unlock.js`、`FEATURES.md`。包内其余文件（Makefile / README / uci-defaults / header.ut / footer.ut / patches / fonts / images / css）由其他单元负责，本文件不改动。
- 源目录 `RES = out/ui-port/src/UI主题移植包/rootfs/www/luci-static/resources/`。U1 的 `out/ui-port/reports/01-source-audit.md:21` 记录：ZIP 移植包以解包后的目录 `src/UI主题移植包/` 形式存在，其清单由 `out/ui-port/zip-manifest.json` 承载；`zip-manifest.json` 中 `www/luci-static/resources/mwrt-cat-art.js` 与 `www/luci-static/resources/mwrt-unlock.js` 的 size / sha256 与 `RES/` 下磁盘文件实测一致。
- 两个 JS 为原样复制，未做任何改写；`cmp` 逐字节相同，`node --check` 退出码均为 0。
- 状态规则按事实：本轮只有 2 个文件标「已搬」，其余 14 个一律标「未搬」。
- 依赖事实复用 `out/ui-port/reports/05-feature-map.md` 与 `05-feature-map.json`（16 条 `source_evidence` 已逐条校验路径与行号）。

## 1. 本轮落地文件（2 个）

- `root/www/luci-static/mwrt/mwrt-cat-art.js`
  - 字节数：263552
  - sha256：`07fb20dd189a8610d2c590dcd9473d5df70dd0b7797ed9be24d59f5e51020a8c`
  - 源：`RES/mwrt-cat-art.js`；`zip-manifest.json` 同名条目 size 263552 / sha256 完全相同
  - `node --check`：退出码 0
  - 依据：`RES/mwrt-cat-art.js:3`（「全部是"给我一个 ctx 和状态，我画一帧"的纯绘制函数」）、`:4`（「ES5，无依赖，不碰 DOM」）；`05-feature-map.json` 中该条 `ubus_objects` / `ubus_methods` / `urls` / `cgi_paths` 均为空数组
- `root/www/luci-static/mwrt/mwrt-unlock.js`
  - 字节数：39690
  - sha256：`bd20bdc16ac41c4583cdbd61efbe7f5752b9332c17c1df248c8423050740e70f`
  - 源：`RES/mwrt-unlock.js`；`zip-manifest.json` 同名条目 size 39690 / sha256 完全相同
  - `node --check`：退出码 0
  - 依据：`RES/mwrt-unlock.js:8`（注释「后端(fancontrol.lua action_Outofnetwork)本地直接解锁」）、`:9`（注释「POST + LuCI token」）、`:26`（`data-url` 读取）、`:339` / `:363`（`xhr.open('POST', URL_, true)`）；`05-feature-map.json` 中该条 `ubus_objects` / `ubus_methods` 均为空数组，`urls` 为注入式 `URL_ (data-url 属性注入)`

## 2. `mwrt-unlock.js` 的宿主前提（`data-url`）

`mwrt-unlock.js` 不硬编码 ubus 对象 / RPC / CGI 路径。源码中后端地址由**调用方 DOM 元素（即脚本标签自身）的 `data-url` 属性**在运行时提供：

- `RES/mwrt-unlock.js:25`：`var me = document.currentScript;` —— 宿主元素取 `document.currentScript`，即加载本文件的那个 `<script>` 标签。
- `RES/mwrt-unlock.js:26`：`var URL_ = (me && me.getAttribute('data-url')) || '';` —— 属性名为 **`data-url`**，值存入 `URL_`。
- `RES/mwrt-unlock.js:27`：`if (!URL_) return;` —— 属性缺失或为空时立即 return，脚本不注册键盘监听、不创建弹窗、不发出任何请求（no-op）。
- `RES/mwrt-unlock.js:338` / `:339`（`unlockNow()`）：`new XMLHttpRequest()` / `xhr.open('POST', URL_, true)`；`:337` 请求体 `token=...&set=unlock`。
- `RES/mwrt-unlock.js:362` / `:363`（`send()`）：`new XMLHttpRequest()` / `xhr.open('POST', URL_, true)`；`:358` 请求体 `token=...&set=<口令>`。
- `RES/mwrt-unlock.js:344` / `:369`：响应解析 `JSON.parse(xhr.responseText).resdd`，`:345` 判定 `res === 'yes'`。
- `RES/mwrt-unlock.js:336` / `:357`：token 取自 `window.L.env.token`；`:340` / `:364`：`Content-Type: application/x-www-form-urlencoded`。
- `RES/mwrt-unlock.js:8` 注释指向后端 `fancontrol.lua action_Outofnetwork`；`05-feature-map.md` §1.2 记录该 URL 在源码内无硬编码具体路径。

宿主侧提供的内容（由 `footer.ut` / 注入脚本一侧渲染，本文件不改动）：

- 在加载 `mwrt-unlock.js` 的 `<script>` 标签上写入 `data-url="<后端解锁端点 URL>"`，端点须接受 POST、带 LuCI token、返回含 `resdd` 字段的 JSON。
- 页面提供 `window.L.env.token`（`RES/mwrt-unlock.js:336`、`:357`）。
- 本包当前 `root/usr/share/ucode/luci/template/themes/mwrt/footer.ut` 与 `header.ut` 中未检出 `data-url` / `mwrt-unlock` 注入行（本次 Grep 检索范围：`sy108-mainline/packages/luci-theme-mwrt/`，命中的 `data-url` 仅来自本次复制进来的 `mwrt-unlock.js:26`）。

## 3. 16 个 JS 移植状态表

`RES` 前缀定义见 §0。表中「后端依赖」列按 ubus 对象名或「无」填写；走 LuCI controller CGI 的文件 ubus 对象为「无」，其 CGI 依赖写在「依据」列与 §4。

| 文件名 | 字节数 | 后端依赖（ubus 对象或「无」） | 本轮状态 | 依据（路径:行号） |
|---|---|---|---|---|
| `mwrt-aurora-boot.js` | 77279 | `system` | 未搬 | `RES/mwrt-aurora-boot.js:891`（`system.board`；另 CGI `fancontrol/catshow_on` `:287`、`mwrtfun/refresh` `:1326`） |
| `mwrt-cat-art.js` | 263552 | 无 | 已搬 | `RES/mwrt-cat-art.js:3`（纯绘制函数，无接口调用行） |
| `mwrt-catcage.js` | 87873 | 无 | 未搬 | `RES/mwrt-catcage.js:1567`（CGI `admin/modem/unlock_state`） |
| `mwrt-disclaimer.js` | 8312 | 无 | 未搬 | `RES/mwrt-disclaimer.js:4`（CGI `admin/mwrtdisclaimer/accept`） |
| `mwrt-notice.js` | 52487 | `luci`, `luci.mwrt-notice` | 未搬 | `RES/mwrt-notice.js:958`（`luci.mwrt-notice.list`） |
| `mwrt-ota-notify.js` | 2715 | `luci.mwrt-ota` | 未搬 | `RES/mwrt-ota-notify.js:21`（`luci.mwrt-ota.latest`） |
| `mwrt-phone.js` | 63953 | 无 | 未搬 | `RES/mwrt-phone.js:802`（CGI `admin/modem/phone_*`） |
| `mwrt-portsw.js` | 61497 | 无 | 未搬 | `RES/mwrt-portsw.js:36`（CGI `admin/modem/port_*`、`usbnic_*`） |
| `mwrt-topo-art.js` | 89560 | 无 | 未搬 | `RES/mwrt-topo-art.js:305`（静态资源 `/luci-static/router3d/*.png`） |
| `mwrt-topo.js` | 107208 | 无 | 未搬 | `RES/mwrt-topo.js:1212`（CGI `admin/modem/topo_data`） |
| `mwrt-unlock.js` | 39690 | 无 | 已搬 | `RES/mwrt-unlock.js:26`（`data-url` 运行时注入） |
| `mwrt-wizard-launch.js` | 4144 | 无 | 未搬 | `RES/mwrt-wizard-launch.js:43`（`L.require('mwrt.wizard')`，无 rpcd 对象） |
| `mwrt/wizard.js` | 69395 | `mwrt-wizard`, `luci` | 未搬 | `RES/mwrt/wizard.js:56`（`mwrt-wizard.status` 等 8 方法） |
| `view/mwrt/leds.js` | 12281 | `luci` | 未搬 | `RES/view/mwrt/leds.js:17`（`luci.getLEDs`） |
| `view/mwrt/ota.js` | 24764 | `luci.mwrt-ota` | 未搬 | `RES/view/mwrt/ota.js:20`（`luci.mwrt-ota.*` 11 方法） |
| `view/mwrt/wizard.js` | 2171 | 无 | 未搬 | `RES/view/mwrt/wizard.js:4`（view 壳，无 rpcd 对象） |

状态计数：已搬 2 个（`mwrt-cat-art.js`、`mwrt-unlock.js`），未搬 14 个。

## 4. 14 项未搬项各自依赖的 rpcd 对象 / CGI 端点

逐项列出源码中出现的后端依赖名与行号，作为「未搬」状态的依据。

- `mwrt-aurora-boot.js`：`system.board`（`RES/mwrt-aurora-boot.js:891`、`:1431`）；CGI `/cgi-bin/luci/admin/fancontrol/catshow_on`（`:287`）、`/cgi-bin/luci/admin/mwrtfun/refresh`（`:1326`）；`/ubus/` 代理（`:875`、`:1416`）。
- `mwrt-catcage.js`：`luci.controller.modem` 的 `/cgi-bin/luci/admin/modem/unlock_state`（`RES/mwrt-catcage.js:1565`、`:1567`、`:1572`）；`data-state` 注入（`:37`）。
- `mwrt-disclaimer.js`：`luci.controller.mwrtdisclaimer` 的 `/admin/mwrtdisclaimer/accept`（`RES/mwrt-disclaimer.js:4`、`:5`）。
- `mwrt-notice.js`：rpcd 对象 `luci.mwrt-notice.list`（`RES/mwrt-notice.js:958`）、`luci.setLocaltime`（`:929`）；`data-ack` 注入的 `ACK_URL`（`:50`、`:265`）；`base + '/luci.js'` 的 HEAD 请求（`:925`）。
- `mwrt-ota-notify.js`：rpcd 对象 `luci.mwrt-ota.latest`（`RES/mwrt-ota-notify.js:21`）。
- `mwrt-phone.js`：`luci.controller.modem` 的 `admin/modem/phone_state`（GET，`RES/mwrt-phone.js:1050`）、`phone_dial`（`:815`）、`phone_answer`（`:829`）、`phone_hangup`（`:841`），POST 拼接于 `:802`。
- `mwrt-portsw.js`：`luci.controller.modem` 的 `port_get` / `port_set`（`RES/mwrt-portsw.js:36`）、`port_probe` / `port_probe_ignore`（`:37`）、`usbnic_state` / `usbnic_set` / `usbnic_ignore`（`:38`）；`data-base` 注入（`:33`）。
- `mwrt-topo-art.js`：静态资源 `/luci-static/router3d/<key>.png`（`RES/mwrt-topo-art.js:305`、`:321`）；无 rpcd 对象、无 XHR / fetch 数据调用行。
- `mwrt-topo.js`：`luci.controller.modem` 的 `/cgi-bin/luci/admin/modem/topo_data`（`RES/mwrt-topo.js:1212`、`:1258`-`:1259`）。
- `mwrt-wizard-launch.js`：前端模块 `mwrt.wizard`（`RES/mwrt-wizard-launch.js:31`、`:43`）与页面路由 `admin/system/mwrt_wizard`（`:49`）；无 rpcd 对象、无 CGI 数据调用行；本轮仅搬 2 个指定文件。
- `mwrt/wizard.js`：rpcd 对象 `mwrt-wizard.status` / `modem` / `apply` / `markdone` / `bootsw` / `led`（`RES/mwrt/wizard.js:56`-`:62`）、`luci.setPassword`（`:65`）、`luci.getTimezones`（`:66`）；手搓 jsonrpc `mwrt-wizard.led`（`:1347`）经 `rpc.getBaseURL()` 的 sendBeacon（`:1355`）；LuCI `uci.*` 框架调用（`:81`、`:302`、`:1538`、`:1568`-`:1624`）。
- `view/mwrt/leds.js`：`luci.getLEDs`（`RES/view/mwrt/leds.js:16`-`:18`）；`L.Request.get` 加载原版 leds view 源码（`:44`、`:47`）；`/usr/bin/mwrt-ledsched`（`:22`）；`uci.load('mwrt_led')`（`:201`）。
- `view/mwrt/ota.js`：rpcd 对象 `luci.mwrt-ota` 的 `info` / `latest` / `check` / `download` / `progress` / `cancel` / `verify` / `test` / `upgrade` / `keep_probe` / `set_auto`（`RES/view/mwrt/ota.js:20`-`:30`）。
- `view/mwrt/wizard.js`：前端模块 `mwrt.wizard`（`RES/view/mwrt/wizard.js:4`、`wizard.open()` `:36`、`:40`）；无 rpcd 对象、无 CGI 数据调用行；本轮仅搬 2 个指定文件。

## 5. L3 后续所需后端

本节只陈述 14 项未搬功能在源码中出现的后端依赖名、以及 SY108 侧现有 ACL 白名单中出现的对象名，不含判断性表述。

**mwrt 侧 4 个 rpcd 插件及声明方法**（`RP = out/ui-port/src/UI主题移植包/rootfs/usr/libexec/rpcd/`，行号见 `05-feature-map.md` §2.1-2.4）：

- `RP/luci.mwrt-notice`（`#!/bin/sh`，1197 行）：`list`、`reboot_gate`（`list)` `:1184`-`:1188`，`call)` `:1192`-`:1193`）。
- `RP/luci.mwrt-ota`（`#!/bin/sh`，811 行）：`info`、`check`、`latest`、`download`、`progress`、`cancel`、`verify`、`test`、`upgrade`、`keep_probe`、`set_auto`（`list)` `:735`-`:745`，`call)` `:752`-`:775`）；命令行分支 `flash` / `flash-dry` / `cron` / `board`（`:779`-`:808`）。
- `RP/luci.turboacc`（`#!/usr/bin/env lua`，155 行）：`getSystemFeatures`、`getFastPathStat`、`getFullConeStat`、`getTCPCCAStat`、`getMTKPPEStat`（`local methods` `:16`，各项 `:17`、`:33`、`:55`、`:68`、`:75`）。
- `RP/mwrt-wizard`（`#!/bin/sh`，894 行）：`status`、`modem`、`slot`、`led`、`nros`、`bootsw`、`apply`、`markdone`（`list)` `:842`-`:850`，`call)` `:860`-`:886`）。

**mwrt 侧 `luci` 对象下出现的方法名**：`luci.setLocaltime`（`RES/mwrt-notice.js:929`）、`luci.setPassword` / `luci.getTimezones`（`RES/mwrt/wizard.js:65`、`:66`）、`luci.getLEDs`（`RES/view/mwrt/leds.js:18`）。

**mwrt 侧 LuCI controller CGI 端点**（非 rpcd 插件）：`admin/modem/*`（`unlock_state`、`topo_data`、`phone_*`、`port_*`、`usbnic_*`）、`admin/mwrtdisclaimer/accept`、`admin/fancontrol/catshow_on`、`admin/mwrtfun/refresh`；对应 controller 文件 `mwrtdisclaimer.lua`（`rootfs/usr/lib/lua/luci/controller/mwrtdisclaimer.lua:13`、`:17`、`:18`）。

**SY108 侧现有 ACL 白名单**（3 份文件，`find sy108-mainline/packages -path "*/rpcd/acl.d/*.json"` 实测；`out/ui-port/reports/02-target-arch.md` §3 与 `05-feature-map.md` §3.5 已复核）：

- `sy108-mainline/packages/luci-app-udx/root/usr/share/rpcd/acl.d/luci-app-udx.json`
  - `read.ubus` `:5`-`:32`：`udx`（`status`、`frequency_status`，`:6`-`:9`）、`system`（`info`、`board`，`:10`-`:13`）、`udx.cellular`（6 项，`:14`-`:21`）、`network.interface.wan`（`status`，`:22`-`:24`）、`network.interface.wan6`（`status`，`:25`-`:27`）、`udx.speedtest`（`status`、`nodes`，`:28`-`:31`）；`read.uci` `["udx-usb"]`（`:33`-`:35`）。
  - `write.ubus` `:38`-`:105`：`udx`（`usb`、`frequency_apply`，`:39`-`:42`）、`udx.cellular`（56 项，`:43`-`:100`）、`udx.speedtest`（`start`、`stop`，`:101`-`:104`）；`write.uci` `["udx-usb"]`（`:106`-`:108`）。
- `sy108-mainline/packages/luci-app-sy108-system/root/usr/share/rpcd/acl.d/sy108-system.json`：`read.ubus.file` `["read","stat"]`（`:13`-`:18`）、`write.ubus.file` `["exec"]`（`:32`-`:36`）。
- `sy108-mainline/packages/luci-theme-outline/root/usr/share/rpcd/acl.d/luci-theme-outline.json`：`read.ubus.luci.outline` `["get_state","job_status","brand_list"]`（`:7`）、`write.ubus.luci.outline` `["activate","job_start","brand_upload","set_auto_update"]`（`:13`-`:18`）。

**名称并列**（只列两侧出现的名字）：

- `system.board`：mwrt 侧 `RES/mwrt-aurora-boot.js:891`、`:1431`；SY108 侧 `luci-app-udx.json:12`、`udx.js:9`。
- `udx.speedtest`：mwrt 侧 4 个 rpcd 插件与 16 个 JS 中未出现；SY108 侧 `luci-app-udx.json:28`-`:31`、`:101`-`:104` 与 `speedtestd.c:1266`-`:1272`、`:1303`。
- `udx.cellular` / `udx` / `network.interface.wan` / `network.interface.wan6`：mwrt 侧 4 个 rpcd 插件与 16 个 JS 中未出现；SY108 侧 `luci-app-udx.json:6`-`:9`、`:14`-`:27`、`:39`-`:42`、`:43`-`:100`。
- `luci.mwrt-notice` / `luci.mwrt-ota` / `mwrt-wizard` / `luci.getLEDs` / `luci.setPassword` / `luci.getTimezones` / `luci.setLocaltime`：mwrt 侧源码中出现的私有对象名；在 SY108 上述 3 份 ACL 白名单中未出现。
- `admin/modem/*`、`admin/mwrtdisclaimer/*`、`admin/fancontrol/*`、`admin/mwrtfun/*`：mwrt 侧 LuCI controller CGI 路径；SY108 侧 3 份 ACL 白名单为 ubus / file / uci 粒度，未出现这些 CGI 路径。
- SY108 侧 ubus 对象由 C 守护进程注册（`udx-cellular/src/native/service.c:675`、`:676`、`:626`；`udx-speedtest/src/speedtestd.c:1272`、`:1276`、`:1303`）与 `udx-device/src/device.c:27`-`:30` 的 rpcd 适配器方法表（`frequency_status` / `frequency_apply` / `status` / `usb`）提供；`sy108-mainline/packages/` 下 `usr/libexec/rpcd/` 路径本次 `find` 未检出插件脚本文件。

## 6. 安全审查项（逐字检索事实）

主控独立逐字检索（`grep -rniE` 覆盖 `rootfs/usr/libexec/rpcd/`、`controller/`、`www/.../*.js` 与固件解出的 `out/ui-port/fw/`）的四条结果。`RES` / `RP` 前缀见 §0、§5；下列行号均来自本次 `grep -rn` / `sed -n` 实读。

1. **disclaimer_unlock 字符串在 mwrt 源码中 0 命中，该说法为未经证实的回报，已被主控独立检索推翻。** `grep -rn "disclaimer_unlock" out/` 的命中仅：`out/ui-port/10-verdict.md:58`（裁决文档「被推翻的说法」段，标注来源为 U5 第一轮回报）、`:62`（裁决文档「0 命中 / 循环引用」段），以及 `05-feature-map.md` 与本文档的记录行；`RP/` 4 个 rpcd 脚本、`RES/` 16 个 JS、`rootfs/usr/lib/lua/luci/controller/*.lua`、`out/ui-port/fw/`（285 个文件）均无该字符串。该 `disclaimer_unlock=1` 分支在 mwrt 源码中不存在；`out/ui-port/10-verdict.md` 为裁决文档而非 mwrt 源码，本节不将其作为源码证据。
2. `lp` 在 `RP/mwrt-wizard` 中 0 命中（`grep -nE "\blp\b"` 无输出）；在 `RES/mwrt-cat-art.js:144`、`:150`、`:151`、`:154`、`:155`、`:1146` 为绘图低通变量：`G.lp = 0`（`:144`）、`G.lp += G.lv * h`（`:150`）、`G.lp = clamp(G.lp, -9, 9)`（`:151`）、`LG.v = G.lp`（`:154`）、`return G.lp`（`:155`）、`ctx.__mwcV2.lp`（`:1146`）。
3. `tom_modem` 仅见于 `RP/mwrt-wizard:9`、`:737` 的注释（`:9`「会触发真实 AT 流量 -> tom_modem 堆积 -> PID 耗尽 -> Web 502 + SSH 失联」、`:737`「自己发 AT 就是 tom_modem 泄漏的起点」）；`RP/luci.mwrt-notice` 全文 0 命中 `tom_modem`、`ttyUSB`、`/dev/tty`、`串口`、`serial`。`RP/luci.mwrt-notice` 实际读取 sysfs 与 `/tmp` 文件：`:105`（`/proc/uptime`）、`:116`（`$d/idVendor` + `$d/idProduct`）、`:126`-`:127`（`/usr/lib/os-release`）、`:290`（`/sys/class/net/eth*`）、`:53`（`SIMLOCK=/tmp/rm520n.lock`）、`:54`（`SIMSTAT=/tmp/simcardstat`）、`:55`（`OTA_LATEST=/tmp/mwrt-ota/latest.json`）、`:77`（`WLB_EVENT=/tmp/mwrt-wlbridge.event`）。
4. 源码中实际存在的相关业务接口行：
   - `rootfs/usr/lib/lua/luci/controller/mwrtdisclaimer.lua:13`（`local FLAG = "/usr/bin/disclaimer.conf"`）、`:17`（`entry({"admin","mwrtdisclaimer","accept"}, call("action_accept"))`）、`:18`（`entry({"admin","mwrtdisclaimer","status"}, call("action_status"))`）。
   - `RP/mwrt-wizard:796`-`:803`（apply 分支）：`:796`（`uci -q set mwrt.wizard.done=1`）、`:798`（`uci -q set WTMmodem.wizard.done=1`）、`:803`（`date +%s > "$APPLIED_MARK"`）。
   - `RP/mwrt-wizard:821`-`:831`（`method_markdone()`）：`:823`（`case "$v" in 0|1`）、`:826`（`uci -q set mwrt.wizard.done="$v"`）、`:828`（`WTMmodem.wizard.done="$v"`）、`:831`（`[ "$v" = "0" ] && rm -f "$APPLIED_MARK" 2>/dev/null`）。

**这些逻辑未搬入本包。** 本轮搬入的 2 个文件为 `mwrt-cat-art.js` 与 `mwrt-unlock.js`（§1）；`mwrt-wizard`、`luci.mwrt-notice`、`mwrtdisclaimer.lua` 及其余 JS 均为「未搬」（§3、§4）。

## 7. 验收自检

- 3 文件存在：`root/www/luci-static/mwrt/mwrt-cat-art.js`（263552 B）、`root/www/luci-static/mwrt/mwrt-unlock.js`（39690 B）、`FEATURES.md`。
- 两个 JS 与 `RES/` 源 `cmp` 逐字节相同，sha256 与 `zip-manifest.json` 同名条目一致。
- `node --check` 两个 JS 退出码均为 0。
- §3 表格数据行 16 行（不含表头与分隔行）；已搬 2 / 未搬 14。
- 四个字符串：`data-url`（§2）、`disclaimer_unlock`（§6，同节含「0 命中」「不存在」，裁决文档描述句引用已移除）、`tom_modem`（§6）、`udx.speedtest`（§5）。
- 禁用词检索命中 0。
