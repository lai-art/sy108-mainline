'use strict';

/* luci-app-udx-home —— 「首页」(admin/modeminfo) 的后端接口
 *
 * 这些接口原本是 mwrt 的 Lua controller（admin/fancontrol/*、admin/modem/*），
 * SY108 没有 Lua 运行时，也无法直接复用它们的实现，因此在这里重建。
 *
 * 协议：函数内直接 http.write_json()，不返回值。
 *   （dispatcher 的 render_action 是 `http.output(render(fn))`，函数返回 undefined
 *     时不会再追加输出。参考同固件 /usr/share/ucode/luci/controller/admin/index.uc
 *     里的 action_menu 写法。）
 *
 * 字段名刻意保持 mwrt 的中文键（"CPU占用"、"剩余内存百分比"…），
 * 因为前端 mwrt-home.js 就是按这些中文键取值的，换成英文会全部失效。
 *
 * 数据来源（SY108）：
 *   /proc/stat /proc/meminfo /proc/loadavg          CPU、内存、负载
 *   /proc/cpuinfo /proc/sys/kernel/hostname         核心数、主机名
 *   /etc/openwrt_release /proc/version              固件、内核版本
 *   /sys/class/thermal/thermal_zone*                温度（真机 10 路，取最高）
 *   /sys/class/net/<wan>/statistics/                WAN 累计收发字节
 *   ubus network.interface dump                     WAN/LAN 地址、DNS、在线时长
 */

import { readfile, writefile, lsdir, popen, stat } from 'fs';
import { cursor } from 'uci';

/* ---------- 小工具 ---------- */

function _int(v, dflt) {
	let n = +v;
	return ((type(n) == 'int' || type(n) == 'double') && n == n) ? n : (dflt ?? 0);
}

function _rd(path) {
	return readfile(path) ?? '';
}

/* 字节 -> "1.15G" / "300M" / "12K"，与 mwrt 展示口径一致 */
function _bytes(n) {
	n = _int(n, 0);
	if (n >= 1073741824) return sprintf('%.2fG', n / 1073741824);
	if (n >= 1048576)    return sprintf('%.0fM', n / 1048576);
	if (n >= 1024)       return sprintf('%.0fK', n / 1024);
	return sprintf('%d', n);
}

/* 秒 -> "3d 4h" / "5h 12m" / "42m" */
function _dur(s) {
	s = _int(s, 0);
	let d = int(s / 86400), h = int((s % 86400) / 3600), m = int((s % 3600) / 60);
	if (d > 0) return sprintf('%dd %dh', d, h);
	if (h > 0) return sprintf('%dh %dm', h, m);
	return sprintf('%dm', m);
}

function _meminfo_kb(key) {
	/* 不用 new RegExp(..., 'm')：ucode 的多行标志行为与 PCRE 不完全一致，
	   而且 /proc/meminfo 的键顺序会随内核版本变。逐行比对最稳。 */
	for (let line in split(_rd('/proc/meminfo'), '\n')) {
		let m = match(line, /^([A-Za-z_()0-9]+):\s+(\d+)/);
		if (m && m[1] == key) return _int(m[2], 0);
	}
	return 0;
}

/* 温区类型 → 中文名。SY108 每个温区的 type 文件就是 DT 里写的字符串：
   apcpu0/apcpu1=AP 两大核、cluster0=CPU 集群、nrcp=5G 基带基带处理器、soc=主 SoC、
   pa/pa5g=功放、board=主板；ank0/ank1 是展锐的 ANK 子系统，没有公认中文名，
   保持原名透出，不硬编一个可能是错的翻译（用户 2026-11-19 反馈「温度中文名没有同步过来」，
   此前浮层上十行全是 thermal_zone0..9）。 */
const THERMAL_NAMES = {
	'apcpu0-thermal':   'CPU0',
	'apcpu1-thermal':   'CPU1',
	'cluster0-thermal': 'CPU 集群',
	'nrcp-thermal':     '5G 基带',
	'soc-thermal':      'SoC',
	'pa-thermal':       '功放 PA',
	'pa5g-thermal':     '5G 功放',
	'board-thermal':    '主板',
	'ank0-thermal':     'ANK0',
	'ank1-thermal':     'ANK1'
};

/* 「这条固件有没有无线能力」——注意不是「现在有没有无线网卡」：
   HOST 线（wifi-host 分支）用户明确要求温度浮层里的 WiFi 行一直在，即使没插网卡。
   判断依据不能看驱动 .ko：HOST 的 MT7921U 是**编进内核**的（config-7.3 里
   CONFIG_MT7921U=y），rootfs 里根本没有 mt7921u.ko —— 按 .ko 判断会永远 false
   （2026-11-19 用户追问「是不是识别到网卡还是要 wifi」时才发现写错了）。
   改用 HOST 线独有的用户态组件做标记（两条线的 config 差异就只有这三个包）：
     wifi-scripts → /sbin/wifi      wpad-mbedtls → /usr/sbin/wpad      iw → /usr/sbin/iw
   最后再兜一层运行时 phy：主线插 USB 网卡时 /sys/class/ieee80211 也会出现。 */
function _wifi_line() {
	for (let p in ['/sbin/wifi', '/usr/sbin/iw', '/usr/sbin/wpad'])
		if (stat(p) != null) return true;
	return (length(lsdir('/sys/class/ieee80211') ?? []) > 0);
}

function _temp_max() {
	/* 不用固定编号 0..15 遍历：真机 thermal_zone 编号不保证连续，
	   而且 /sys/class/thermal 在部分内核里是符号链接，直接 lsdir 最稳。
	   zl 是结构化的 {name,label,type,temp}（devpop k=tmp 的温度浮层用），
	   seen 是 "zone=温度" 字符串（debug 快照用），两份数据同源。 */
	let max = 0, seen = [], zl = [];
	for (let name in (lsdir('/sys/class/thermal') ?? [])) {
		if (!match(name, /^thermal_zone\d+$/)) continue;
		let v = _int(_rd('/sys/class/thermal/' + name + '/temp'), 0);
		if (v > 1000) v = int(v / 1000);
		let t = trim(_rd('/sys/class/thermal/' + name + '/type'));
		push(seen, name + '=' + v + '(' + t + ')');
		push(zl, {
			name: name,
			type: t,
			label: (t != '') ? (THERMAL_NAMES[t] ?? t) : name,
			temp: v
		});
		if (v > max) max = v;
	}
	return { max: max, seen: seen, zones: zl };
}

function _cpu_cores() {
	let n = 0;
	for (let line in split(_rd('/proc/cpuinfo'), '\n'))
		if (match(line, /^processor\s*:/)) n++;
	return (n > 0) ? n : 1;
}

/* ---------- CPU 采样（两次差值） ---------- */
/* 首页每 2 秒轮询一次。第一次调用没有基线，返回 null（前端显示 "--"），
   第二次起用差值算真实占用。状态落在 /tmp，重启即失效，符合预期。 */

const CPU_STATE = '/tmp/.udx-home-cpu.json';

function _cpu_read() {
	let lines = split(_rd('/proc/stat'), '\n');
	let all = null, cores = [];

	for (let line in lines) {
		let m = match(line, /^cpu(\d*)\s+(.+)$/);
		if (!m) continue;

		let f = map(split(trim(m[2]), /\s+/), x => _int(x, 0));
		/* 0=user 1=nice 2=system 3=idle 4=iowait 5=irq 6=softirq 7=steal */
		let idle = (f[3] ?? 0) + (f[4] ?? 0);
		let total = 0;
		for (let i = 0; i < 8; i++) total += (f[i] ?? 0);

		if (m[1] == '') all = { total: total, idle: idle };
		else cores[_int(m[1], 0)] = { total: total, idle: idle };
	}

	return { all: all, cores: cores };
}

function _cpu_usage() {
	let cur = _cpu_read();
	if (!cur.all) return { total: null, cores: [] };

	let prev = null;
	try { prev = json(_rd(CPU_STATE)); } catch (e) { prev = null; }
	try { writefile(CPU_STATE, sprintf('%J', cur)); } catch (e) { }

	if (!prev || !prev.all) return { total: null, cores: [] };

	let dt = cur.all.total - prev.all.total;
	let di = cur.all.idle - prev.all.idle;
	let total = (dt > 0) ? int((dt - di) * 100 / dt) : null;

	let out = [];
	for (let i = 0; i < length(cur.cores); i++) {
		let c = cur.cores[i];
		let p = (prev.cores != null) ? prev.cores[i] : null;
		if (!c || !p) continue;
		let cdt = c.total - p.total;
		let cdi = c.idle - p.idle;
		push(out, { id: i, usage: (cdt > 0) ? (cdt - cdi) * 100 / cdt : 0 });
	}

	return { total: total, cores: out };
}

/* ---------- 网络（ubus network.interface dump） ---------- */
/* dump 的返回是 { "interface": [ {"interface":"wan", ...}, ... ] }，
   不是以接口名为键的对象——按名字直接取会拿到 null，这点容易写错。 */

function _iface_list() {
	let dump = null;
	try { dump = ubus.call('network.interface', 'dump') ?? null; }
	catch (e) { dump = null; }
	return (dump?.interface != null) ? dump.interface : [];
}

function _find_iface(name) {
	let list = _iface_list();
	for (let ifc in list)
		if (ifc?.interface == name) return ifc;
	return null;
}

function _first_ipv4(ifc) {
	for (let a in (ifc?.['ipv4-address'] ?? []))
		if (a?.address) return a.address;
	return '';
}

/* ---------- 蜂窝（ubus udx.cellular status） ----------
 * udx-cellulard 持有缓存快照（snapshot_age ~1.8s），2 秒一次的轮询打不动它。
 * 真机数据（2026-11-15 采集）：可用信号在 cells[0].rsrp/rsrq/sinr；
 * signal.csq = 99 是 AT 的「未知」占位值，绝不能当信号强度展示。
 */

function _cell() {
	let st = null;
	try { st = ubus.call('udx.cellular', 'status'); } catch (e) { st = null; }
	if (type(st) != 'object') return null;
	let cells = (type(st.cells) == 'array' && length(st.cells) > 0) ? st.cells : [];
	/* 2026-11-16 真机实锤：EN-DC 下 cells[0] 可能是 NR 邻区（serving=false 的 n28 测量值），
	   信号/频段必须取驻留小区（serving=true），找不到才退回 cells[0] */
	let serving = null;
	for (let i = 0; i < length(cells); i++) {
		if (cells[i]?.serving === true) { serving = cells[i]; break; }
	}
	return { raw: st, serving: (serving != null) ? serving : ((length(cells) > 0) ? cells[0] : null) };
}

/* 归一化的蜂窝信号视图：给 devinfo / devpop(信号卡) / topo_data / wan_get 共用。
 * 全部字段做了缺省兜底：模组没起来 / 没 SIM / 没小区数据时返回 null 字段，
 * 前端按 null 渲染「--」，绝不能让字符串键缺失。 */
function _cell_signal(c) {
	/* c 可选：调用方已经 _cell() 过一次就传进来，省一次 ubus 往返。
	   不传（老调用点）就是 null，自己取。注意 ucode 没有 undefined 这个字面量，
	   写 c === undefined 会直接炸 "access to undeclared variable"。 */
	if (c == null) c = _cell();
	if (c == null) return null;
	let st = c.raw;
	let s = c.serving ?? null;

	let rat = s?.rat ?? null;
	let rat_txt = null;
	if (rat == 'nr') {
		/* nr_registration.registered = SA 在网；没有 nr_registration 的注册态则按 NSA */
		let nr = st.nr_registration ?? null;
		rat_txt = (nr?.registered === true) ? '5G SA' : '5G NSA';
	} else if (rat == 'lte') {
		rat_txt = '4G';
	} else if (rat == 'wcdma') {
		rat_txt = '3G';
	} else if (rat != null) {
		/* 未知 RAT 名：剥掉非字母数字再透出，避免奇怪字符进 JSON */
		rat_txt = replace(rat, /[^A-Za-z0-9]/g, '');
	}

	let brand = st.operator?.brand ?? '';
	let opname = (brand == 'china_mobile') ? '中国移动'
	          : (brand == 'china_unicom') ? '中国联通'
	          : (brand == 'china_telecom') ? '中国电信'
	          : (brand == 'cbn') ? '中国广电'
	          : (st.operator?.name ?? '');

	let active = (st.state == 'pdp_active' && st.pdp_state == 'active');
	let sim_state = st.sim?.state ?? null;
	let state_txt = active ? '在线'
	              : (sim_state == 'READY') ? '未连接'
	              : (sim_state != null) ? '无 SIM'
	              : '模组未就绪';

	return {
		active: active,
		state: state_txt,
		operator: opname,
		plmn: st.operator?.name ?? '',
		rat: rat,
		rat_txt: rat_txt,
		band: s?.band ?? null,
		arfcn: s?.arfcn ?? null,
		pci: s?.pci ?? null,
		rsrp: s?.rsrp ?? null,
		rsrq: s?.rsrq ?? null,
		sinr: s?.sinr ?? null,
		tac: s?.tac ?? st.registration?.tac ?? null,
		cell_id: s?.cell_id ?? null,
		apn: st.data_session?.network_apn ?? null,
		ip: st.data_session?.ipv4 ?? null,
		mode: st.mode ?? null,
		/* 11-22: 首页「签约速率 / 等级」卡。qos 是 udx.cellular status 里的真承载信息：
		   ambr_downlink_kbps / ambr_uplink_kbps = 签约上下行（本设备 500000/100000），
		   qci + kind(5qi/qci) = 承载等级（本设备 qci=8, kind=5qi）。
		   字段全做兜底，缺失时前端按 null 显示 '--'，不误报硬件问题。 */
		qos: (function() {
			let q = st.qos ?? null;
			if (q == null) return null;
			return {
				down_kbps: q.ambr_downlink_kbps ?? q.downlink_kbps ?? null,
				up_kbps: q.ambr_uplink_kbps ?? q.uplink_kbps ?? null,
				qci: q.qci ?? null,
				kind: q.kind ?? 'qci',
				gbr_down: q.gbr_downlink_kbps ?? null,
				gbr_up: q.gbr_uplink_kbps ?? null
			};
		})()
	};
}

/* 上/下行速率：对 /sys/class/net/<dev>/statistics 做两次差值，状态落 /tmp。
 * 第一次调用没有基线 → bps 给 null，topo.js 的 fmtRate(null) 渲染 '—'。 */
const RATE_STATE = '/tmp/.udx-topo-rate.json';

function _rate_bps(dev) {
	let rx = _int(_rd(sprintf('/sys/class/net/%s/statistics/rx_bytes', dev)), 0);
	let tx = _int(_rd(sprintf('/sys/class/net/%s/statistics/tx_bytes', dev)), 0);
	let now = time();
	let prev = null;
	try { prev = json(_rd(RATE_STATE)); } catch (e) { prev = null; }
	try { writefile(RATE_STATE, sprintf('%J', { t: now, rx: rx, tx: tx })); } catch (e) { }

	if (prev == null || type(prev) != 'object') return { rx_bps: null, tx_bps: null, rx: rx, tx: tx };
	let pt = _int(prev.t, 0);
	let prx = _int(prev.rx, 0);
	let ptx = _int(prev.tx, 0);
	if (pt <= 0 || now <= pt || rx < prx || tx < ptx)
		return { rx_bps: null, tx_bps: null, rx: rx, tx: tx };
	let dt = now - pt;
	return { rx_bps: (rx - prx) * 8.0 / dt, tx_bps: (tx - ptx) * 8.0 / dt, rx: rx, tx: tx };
}

/* 执行一条 shell（重启 network/dnsmasq 用）。ucode core 的 system() 若不存在
 * （极老的运行时），退回 procd 事件，至少 network.reload 能生效。 */
function _run(cmd) {
	let ok = false;
	try { system(cmd); ok = true; } catch (e) { ok = false; }
	if (!ok) {
		try { ubus.call('service', 'event', { type: 'network.reload' }); } catch (e) { }
	}
}

/* 在 /etc/config/dhcp 里找服务 br-usb 的那段：
 * 1) .type=dhcp 且 option interface == usbmgmt（interface 也可能是 list，都要认）；
 * 2) 退而求其次按段名 'lan'（OpenWrt 惯例）；
 * 找不到返回 null —— lan_get 的 DHCP 表单给默认值，lan_set 跳过 DHCP 部分。 */
function _dhcp_sec(c) {
	let secs = c.get_all('dhcp') ?? null;
	if (type(secs) != 'object') return null;
	for (let name, s in secs) {
		if (s?.['.type'] != 'dhcp') continue;
		let itf = s?.interface ?? null;
		if (type(itf) == 'array') {
			for (let x in itf) if (x == 'usbmgmt') return name;
		} else if (itf == 'usbmgmt') {
			return name;
		}
	}
	return (type(secs.lan) == 'object' && secs.lan?.['.type'] == 'dhcp') ? 'lan' : null;
}

/* ---------- devpop 弹窗的五个数据源 ----------
 * 前端 MRT_POP 的 fetchK() 在浮窗打开期间每 3 秒拉一次 devpop?k=<名>。
 * 注意响应必须是带真实键的对象而不是 {}——前端以 p 为真值判断「已拿到」，
 * {} 会走进渲染分支然后各字段 undefined，比直接不给更糟（假成功）。
 * 契约全部从 mwrt-home.js 的 rCpuTop/rCli/rStorage/rConns/rTmp 反推。 */

/* /tmp/dhcp.leases + /proc/net/arp → [{ip,mac,name,band}]，拓扑与「在线设备」浮层共用。
 * 只数租约会漏掉静态地址设备——本机 PC 就是 USB 直连、可能不走 DHCP
 * （用户 2026-11-16 指出「下挂设备应该有本机」）。所以再并上 br-usb 的
 * ARP 邻居：/proc/net/arp 列为 IP / HW type / Flags / HW address / Mask / Device，
 * Flags=0x0 是 INCOMPLETE 要跳过；按 MAC 小写去重，租约优先（有主机名）。
 * 租约格式: "<expiry> <mac> <ip> <hostname> <clientid>"，dnsmasq 会把
 * 主机名里的空格转义成 \x20，所以第 4 段就是完整主机名。 */
function _leases() {
	let out = [];
	let seen = {};
	for (let line in split(_rd('/tmp/dhcp.leases'), '\n')) {
		let f = split(trim(line), /[ \t]+/);
		if (f == null || length(f) < 4) continue;
		if (!match(f[2], /^\d+\.\d+\.\d+\.\d+$/)) continue;
		let mac = lc(f[1]);
		if (!match(mac, /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) continue;
		seen[mac] = 1;
		push(out, { ip: f[2], mac: f[1], name: f[3], vendor: '', band: 'wired', type: 'wired' });
	}
	for (let line in split(_rd('/proc/net/arp'), '\n')) {
		let f = split(trim(line), /\s+/);
		if (f == null || length(f) < 6) continue;
		if (f[5] != 'br-usb') continue;
		if (f[2] == '0x0') continue;
		let ip = f[0], mac = lc(f[3]);
		if (!match(ip, /^\d+\.\d+\.\d+\.\d+$/)) continue;
		if (!match(mac, /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) continue;
		if (seen[mac]) continue;
		seen[mac] = 1;
		push(out, { ip: ip, mac: f[3], name: '', vendor: '', band: 'wired', type: 'wired' });
	}
	return out;
}

/* 存储分区：popen df -k 读四个挂载点，按 used 从大到小。
 * 绝不用 statvfs —— 本设备的 ucode-mod-fs 没有这个导出（真机
 * "Module does not export statvfs"，import 阶段就炸，整个控制器
 * 所有路由 500，2026-11-16 刷 #82 后实测）。popen 在 fs 模块里
 * 存在（真机验证），busybox df 输出按空白切列直接解析。 */
function _parts() {
	let out = [];
	let txt = '';
	let p = null;
	try {
		p = popen('df -k / /overlay /rom /boot 2>/dev/null', 'r');
		if (p != null) txt = p.read('all') ?? '';
	} catch (e) { txt = ''; }
	if (p != null) { try { p.close(); } catch (e) { } }
	if (txt == '') return out;

	for (let line in split(txt, '\n')) {
		let f = split(trim(line), /\s+/);
		/* 合法行至少 6 列：Filesystem 1K-blocks Used Available Use% Mounted-on；
		   表头与 "df: /boot: can't find mount point" 这类行都不到 6 列 */
		if (f == null || length(f) < 6) continue;
		if (f[0] == 'Filesystem') continue;
		let total = _int(f[1], 0);
		let used = _int(f[2], 0);
		let mp = f[length(f) - 1];
		if (mp != '/' && mp != '/overlay' && mp != '/rom' && mp != '/boot') continue;
		if (total <= 0) continue;
		push(out, {
			fs: f[0],
			mount: mp,
			total: total,
			used: used,
			pct: int(used * 100 / total)
		});
	}
	/* 按 used 从大到小（前端注释明说这个顺序），数量最多 4 个，插排足够 */
	let sorted = [];
	for (let x in out) {
		let lo = [], hi = [];
		for (let y in sorted) {
			if (y.used >= x.used) push(lo, y);
			else push(hi, y);
		}
		sorted = lo;
		push(sorted, x);
		for (let y in hi) push(sorted, y);
	}
	return sorted;
}

/* CPU 占用 TOP：两次 /proc/<pid>/stat 快相差 1 秒（前端文案写死「间隔 1 秒」）。
 * HZ=100 时差值 tick 数 ≈ 该进程这 1 秒的 CPU 百分比。 */
function _proc_sample() {
	let out = {};
	for (let name in (lsdir('/proc') ?? [])) {
		if (!match(name, /^[0-9]+$/)) continue;
		let st = _rd('/proc/' + name + '/stat');
		/* comm 里可能含 ')'（内核不转义），comm 又是全行唯一的括号字段，
		   所以从【最后一个】')' 之后取 state 起的字段才稳。 */
		let i = rindex(st, ')');
		if (i == null || i < 0) continue;
		let rest = split(substr(st, i + 2), ' ');   /* 从 state 字段起 */
		if (rest == null || length(rest) < 13) continue;
		out[name] = _int(rest[11], 0) + _int(rest[12], 0);   /* utime + stime */
	}
	return out;
}

function _cpu_top() {
	let s1 = _proc_sample();
	try { sleep(1); } catch (e) { }   /* sleep 不可用时差值为 0 → 空列表，前端显示「暂无进程数据」 */
	let s2 = _proc_sample();
	let procs = [];
	for (let pid, c2 in s2) {
		let d = c2 - (s1[pid] ?? 0);
		if (d <= 0) continue;
		let comm = trim(_rd('/proc/' + pid + '/comm'));
		if (!comm) continue;
		push(procs, { idx: length(procs), pid: pid, cmd: comm, cpu: d });
	}
	let top = [];
	for (let n = 0; n < 8; n++) {
		let best = null;
		for (let p in procs) {
			if (best == null || p.cpu > best.cpu) best = p;
		}
		if (best == null) break;
		push(top, { pid: best.pid, cmd: best.cmd, cpu: best.cpu });
		let rest = [];
		for (let p in procs) if (p.idx != best.idx) push(rest, p);
		procs = rest;
	}
	return {
		loadavg: trim(_rd('/proc/loadavg')),
		procs: top
	};
}

/* 活动连接 TOP5：/proc/net/nf_conntrack 按「对端公网 IP」聚合。
 * 模块没加载（文件不存在）时给 {total:0,top:[]}，前端显示「暂无外部连接」。 */
function _conns() {
	let txt = _rd('/proc/net/nf_conntrack');
	let total = 0;
	let agg = {};
	if (txt != '') {
		for (let line in split(txt, '\n')) {
			if (trim(line) == '') continue;
			total++;
			let srcs = [], port = null;
			for (let tk in split(line, ' ')) {
				if (match(tk, /^src=/)) push(srcs, substr(tk, 4));
				else if (match(tk, /^dport=/) && port == null) port = substr(tk, 6);
			}
			let pub = null;
			for (let s in srcs) {
				/* ucode 的 index() 找不到时返回 -1 而不是 null，必须按 >=0 判 */
				if (index(s, ':') >= 0) continue;   /* IPv6 记录不进 TOP5（按 IPv4 公网聚合） */
				if (match(s, /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.)/)) continue;
				pub = s;
				break;
			}
			if (pub == null && length(srcs) > 0) pub = srcs[0];
			if (pub == null) continue;
			let key = pub + ':' + (port ?? '');
			agg[key] = _int(agg[key], 0) + 1;
		}
	}
	let top = [];
	for (let n = 0; n < 5; n++) {
		let bk = null;
		for (let k, v in agg) {
			if (bk == null || v > agg[bk]) bk = k;
		}
		if (bk == null) break;
		let ci = index(bk, ':');
		let ip = (ci > 0) ? substr(bk, 0, ci) : bk;
		let port = (ci > 0) ? substr(bk, ci + 1) : '';
		push(top, { ip: ip, port: port, count: agg[bk] });
		delete agg[bk];
	}
	return { total: total, top: top };
}

/* ---------- 输出助手 ---------- */

function _empty() {
	http.prepare_content('application/json; charset=UTF-8');
	http.write_json({});
}

function _unsupported() {
	http.prepare_content('application/json; charset=UTF-8');
	http.write_json({ ok: false, unsupported: true });
}

/* ---------- 接口：devinfo（2 秒轮询，首页数字位主要来源） ---------- */

function devinfo() {
	let usage = _cpu_usage();
	let cores = _cpu_cores();

	let wan = _find_iface('wan');
	let wan_up = (wan?.up === true);
	let wan_dev = wan?.l3_device ?? wan?.device ?? 'wwan0';
	let wan_ip = wan ? _first_ipv4(wan) : '';
	let wan_proto = wan?.proto ?? 'none';
	let wan_uptime = _int(wan?.uptime, 0);

	let wan_gw = '';
	for (let r in (wan?.route ?? []))
		if (r?.target == '0.0.0.0' && r?.nexthop) { wan_gw = r.nexthop; break; }

	let dns = (wan?.['dns-server'] != null) ? wan['dns-server'] : [];

	/* LAN = 管理口那一侧：优先按 device 名 br-usb 找，找不到再退回 lan 接口 */
	let lan_ip = '';
	for (let ifc in _iface_list()) {
		let dev = ifc?.l3_device ?? ifc?.device ?? '';
		if (dev == 'br-usb' || ifc?.interface == 'lan') {
			lan_ip = _first_ipv4(ifc);
			if (lan_ip) break;
		}
	}

	let tmp = _temp_max();
	let mem_total = _meminfo_kb('MemTotal');
	let mem_avail = _meminfo_kb('MemAvailable');
	let swap_total = _meminfo_kb('SwapTotal');
	let swap_free  = _meminfo_kb('SwapFree');
	let mem_remain_pct = (mem_total > 0) ? int(mem_avail * 100 / mem_total) : 0;

	let rx = _int(_rd(sprintf('/sys/class/net/%s/statistics/rx_bytes', wan_dev)), 0);
	let tx = _int(_rd(sprintf('/sys/class/net/%s/statistics/tx_bytes', wan_dev)), 0);

	let load1 = split(trim(_rd('/proc/loadavg')) + ' ', ' ')[0] ?? '0';

	/* 蜂窝状态：devinfo 是 assurance 四键的数据源（首页 gw() 每 2 秒拉一次） */
	let cell = _cell_signal();
	let gw_txt = wan_gw;
	/* 蜂窝点对点链路没有网关 IP（route 是 scope link 直连，nexthop=0.0.0.0），
	   显示 "0.0.0.0" 会让人以为出错了；真机口径就是「直连」。 */
	if (gw_txt == '' || gw_txt == '0.0.0.0') gw_txt = '直连';

	let rel = _rd('/etc/openwrt_release');
	let fwm = match(rel, /DISTRIB_DESCRIPTION='([^']*)'/);
	let fwv = fwm ? fwm[1] : trim(_rd('/etc/openwrt_version'));
	let kvm = match(_rd('/proc/version'), /Linux version (\S+)/);

	/* 诊断快照：设备不在开发机网络里，出问题时靠这个文件定位，
	   比让用户开 F12 看接口响应省事。每次 devinfo 调用覆盖一次。 */
	try {
		writefile('/tmp/udx-home-debug.json', sprintf('%J', {
			ts: time(),
			mem: { total: mem_total, avail: mem_avail, swap_total: swap_total, swap_free: swap_free,
			       remain_pct: mem_remain_pct },
			temp: { max: tmp.max, zones: tmp.seen },
			cpu: { cores: cores, usage_total: usage.total, per_core: length(usage.cores), sample: usage.cores },
			load1: load1,
			wan: { up: wan_up, dev: wan_dev, proto: wan_proto, ip: wan_ip, gw: wan_gw,
			       dns: dns, uptime: wan_uptime, route_cnt: length(wan?.route ?? []) },
			lan_ip: lan_ip,
			ifaces: map(_iface_list(), x => x?.interface),
			traffic: { rx: rx, tx: tx },
			cell: cell,
			rel: { fw: fwv, kvm: kvm ? kvm[1] : null }
		}, '\n'));
	} catch (e) { }

	http.prepare_content('application/json; charset=UTF-8');
	http.write_json({
		'设备型号': 'SY108',
		'主机名': trim(_rd('/proc/sys/kernel/hostname')),
		'固件版本': fwv,
		'内核版本': kvm ? kvm[1] : '--',
		'CPU型号': 'UDX710 (ARMv8)',
		'CPU核心数': sprintf('%d', cores),

		/* 无无线硬件：留空键。前端据此把 #wifi-wrap 换成
		   「当前设备未检测到无线网卡硬件」空态（mwrt 原版行为，用户已确认保留） */
		'2.4G无线信号名称': '',
		'5G无线信号名称': '',

		'WAN状态': wan_up ? '已连接' : '未连接',
		'WAN协议': wan_proto,
		'WAN_IP': wan_ip,
		'WAN在线时长': _dur(wan_uptime),
		'默认网关': gw_txt,
		'LAN_IP': lan_ip,
		'DNS服务器': join(' ', dns),
		'WAN接口': wan_dev,

		/* 首页连接状态区的四个键（mwrt-home.js gw() 直读 devinfo）。
		   「在线/Online」会点亮状态点，其余值都是灰点。
		   SY108 没有有线 WAN（br-usb 是管理口），宽带恒为「未配置」。 */
		'宽带接口状态': '未配置',
		'蜂窝接口状态': (cell != null) ? cell.state : '模组未就绪',
		'当前网关': gw_txt,
		'当前物理接口': wan_dev,

		/* 格式化文本给 #f-rx / #f-tx；字节数给流量曲线，必须是纯数字（前端 parseInt） */
		'WAN下行流量': _bytes(rx),
		'WAN上行流量': _bytes(tx),
		'WAN下行字节': rx,
		'WAN上行字节': tx,

		'CPU占用': (usage.total ?? 0),
		'剩余内存百分比': mem_remain_pct,

		/* 虚拟内存：SY108 内核未开 zram，只给 swap；total=0 时前端不画内环 */
		'虚拟内存': {
			total: swap_total,
			used: (swap_total > swap_free) ? (swap_total - swap_free) : 0,
			disk_used: 0, zram_total: 0, zram_used: 0, zram_mem: 0, disk_total: 0
		},

		'WiFi温度': null,
		'设备温度': tmp.max,

		/* SY108 无 PWM（CONFIG_PWM is not set）、无风扇。给 null 让前端风扇卡
		   显示 "--"；滑块本身无效，属已知的「卡片留着但不可用」 */
		'风扇转速百分比': null,
		'风扇PWM': null,
		'风扇模式': null,

		'CPU各核': usage.cores,
		'系统负载': load1,
		'物理内存': { total: mem_total, avail: mem_avail }
	});
}

/* ---------- devpop：首页磁贴弹窗的取数端点 ----------
 * 前端两处消费 k=hnat：右栏磁贴（5 秒一轮）和 MRT_POP 详情（弹窗开着时 3 秒一轮）。
 * SY108 没有 turboacc/HNAT（MTK 特性），k=hnat 改回蜂窝信号——
 * 前端磁贴已同步改成「信号强度」，键为 rsrp/rsrq/sinr/rat_txt/band 等。
 * 其余 k 按前端契约给真实数据（给 {} 会被当「已拿到」渲染出一片 undefined）。 */

function fancontrol_devpop() {
	let k = http.formvalue('k');
	http.prepare_content('application/json; charset=UTF-8');
	if (k == 'hnat') {
		let s = _cell_signal();
		http.write_json((s != null) ? s : { noready: true });
	} else if (k == 'cputop') {
		http.write_json(_cpu_top());
	} else if (k == 'clients') {
		http.write_json({ clients: _leases() });
	} else if (k == 'tmp') {
		let t = _temp_max();
		/* wifi_hw：「这条固件有没有无线能力」，不是「现在插没插网卡」。
		   主线没编无线驱动 → false，前端不渲染 WiFi 那行；
		   HOST 线编了 kmod-mt7921u → 恒 true，即使没插网卡那行也在（用户明确要求）。 */
		http.write_json({ zones: t.zones, wifi_hw: _wifi_line() });
	} else if (k == 'storage') {
		http.write_json({ parts: _parts() });
	} else if (k == 'conns') {
		http.write_json(_conns());
	} else {
		http.write_json({});
	}
}

/* ---------- s144 屏保：配置读写（从 mwrt 移植，存 /etc/config/outline 的 screensaver 段） ----------
 * mwrt 原版把屏保开关/时长放在 /etc/config/mwrt 的 ndis.showtime，后端 msgct 吐出来，
 * 前端 footer.htm 的 idle overlay 轮询。SY108 没有那个配置包，改存 luci-theme-outline
 * 自带的 /etc/config/outline（已有 appearance/updates 等段），新增 screensaver 段：
 *   config screensaver 'screensaver'
 *       option enabled '1'
 *       option showtime '30'     (秒；0/缺失=关闭)
 * 默认关闭，用户不设置就不会触发屏保——不打扰默认体验。 */
function fancontrol_msgct() {
	http.prepare_content('application/json; charset=UTF-8');
	let c = cursor();
	let en = c.get('outline', 'screensaver', 'enabled');
	let st = c.get('outline', 'screensaver', 'showtime');
	let enabled = (en === '1' || en === 1);
	let secs = _int(st, 0);
	if (!enabled || secs < 6) secs = 0;   /* <6 秒不当作开启，避免误触 */
	http.write_json({ showtime: secs, enabled: (secs > 0) });
}

function fancontrol_screensaver_set() {
	http.prepare_content('application/json; charset=UTF-8');
	let en = http.formvalue('enabled');
	let st = http.formvalue('showtime');
	let enabled = (en === '1' || en === 'true' || en === 1 || en === true);
	let secs = _int(st, 30);
	/* 允许 6~3600 秒；0 表示关闭（此时 enabled 强制 false）。
	   注意 ucode 没有 JS 的 Math 全局，手写 clamp，别用 Math.max/min。 */
	if (secs !== 0) {
		if (secs < 6) secs = 6;
		if (secs > 3600) secs = 3600;
	}
	let c = cursor();
	c.set('outline', 'screensaver', 'screensaver');   /* 确保段存在 */
	c.set('outline', 'screensaver', 'enabled', (enabled && secs > 0) ? '1' : '0');
	c.set('outline', 'screensaver', 'showtime', '' + secs);
	c.commit('outline');
	http.write_json({ ok: true, enabled: (enabled && secs > 0), showtime: (enabled && secs > 0) ? secs : 0 });
}

/* ---------- modem_ctrl：首页底部「蜂窝模组 / SIM卡信息 / 基站信息」三张卡 ----------
 * mwrt 原版这三块吃的是 AT 口模组：/usr/bin/mwrt-cellinfo 写盘 + generic.sh 吐的 key/value 表。
 * SY108 的模组是 UDX710 —— 模组自己就是主控，这台机器上没有 AT 口（也没有 mwrt-cellinfo），
 * 老链路永远是空表，前端 mwrt-home.js:1804 的空态分支于是误报「此设备未安装蜂窝模组」，
 * 而模组其实一直在网（2026-11-19 用户截图反馈）。
 *
 * 修法：直接读 ubus udx.cellular status，翻译成 mwrt 那份 {key, full_name, value, class} 表。
 * 前端渲染逻辑一行不改 —— 它本来就是按 class 把条目归进三张卡、按 key 找具体字段。
 * 字段名不能随意改，对应关系：
 *   基本信息  : name/manufacturer/revision/mode/connect_status/operator → 卡片抬头与 tags
 *   SIM卡信息 : status/卡槽/ICCID/IMSI/IMEI
 *   基站信息 : Band/ARFCN/PCI/Cell ID/TAC 走上排格子，RSRP/RSRQ/SINR 走下面信号条
 */
function fancontrol_modem_ctrl() {
	http.prepare_content('application/json; charset=UTF-8');

	let c = _cell();
	let sig = _cell_signal(c);
	let raw = (c != null) ? c.raw : null;

	let out = [];
	let add = function(k, n, v, cls) {
		if (v == null) return;
		let t = '' + v;
		/* 前端 okVal() 同样把空串/'--' 当无效；这里先挡掉，卡片上就不会出现一行横杠 */
		if (t == '' || t == '--' || t == 'null') return;
		push(out, { key: k, full_name: n, value: t, class: cls, class_origin: cls, type: 'text' });
	};

	let B = '基本信息', S = 'SIM卡信息', C = '基站信息';

	/* 模组身份三件套照写不误：哪怕蜂窝服务没起来，卡片也只会显示「链路断开 / 无 SIM」，
	   而不是「未安装蜂窝模组」—— 那才是 2026-11-19 用户指的那个错。 */
	add('name', '模组型号', 'UDX710', B);
	add('manufacturer', '制造商', 'UNISOC 紫光展锐', B);
	add('connect_status', '连接状态', (sig != null && sig.active === true) ? 'Yes' : 'No', B);

	if (sig == null) { http.write_json(out); return; }

	/* mode 必须是 "5G SA"/"5G NSA"/"4G LTE" 这种前端认得的写法，
	   heroUp() 的制式徽章和 isNR(频段加 n 前缀) 都按它判断 */
	add('mode', '网络模式', sig.rat_txt, B);
	/* operator 会被 heroUp 拿去匹配运营商名和 logo（/移动|联通|电信|广电/），
	   写 '中国移动' 这种中文名最稳，别写成 PLMN */
	add('operator', '互联网服务提供商', sig.operator, B);
	add('apn', 'APN', sig.apn, B);
	add('ip', '蜂窝 IP', sig.ip, B);

	/* SIM：iccid/imsi/imei 在 status 顶层，卡状态在 sim.state。
	   前端 /status|状态/ 命中后按 /ready/ 点亮绿点，所以这里原样透出 READY */
	add('status', '状态', raw?.sim?.state, S);
	add('iccid', 'ICCID', raw?.iccid, S);
	add('imsi', 'IMSI', raw?.imsi, S);
	add('imei', 'IMEI', raw?.imei, S);

	/* 驻留小区。key 用 'NR-ARFCN' 而不是 'ARFCN' —— 前端正则 ^NR.?ARFCN$ 能直接对上，
	   频段值已是 'n41' 这种带制式前缀的写法，不会再被加一次前缀 */
	add('Band', '频段', sig.band, C);
	add('NR-ARFCN', '频点', sig.arfcn, C);
	add('PCI', '物理小区', sig.pci, C);
	add('Cell ID', '小区ID', sig.cell_id, C);
	add('TAC', '区位码', sig.tac, C);
	add('RSRP', 'RSRP', sig.rsrp, C);
	add('RSRQ', 'RSRQ', sig.rsrq, C);
	add('SINR', 'SINR', sig.sinr, C);

	http.write_json(out);
}

/* ---------- cellx：首页「附近小区」卡 ----------
 * mwrt 原版这里给的是 MT5700 的富信息快照（签约速率 AMBR / 载波聚合 CA / 邻区表），
 * 由 /usr/bin/mwrt-cellinfo 生成，SY108 没有这个工具。
 * 之前整块返回 { supported:false }，前端 cxNbHtml() 一进门就 return ''，
 * 「附近小区」磁贴于是永远灰着不能点（2026-11-19 用户反馈）。
 *
 * 现在：supported 仍为 false —— 签约速率 / 载波聚合这两块 SY108 确实没有数据，
 * 让前端按原样隐藏；但 neighbours 用 udx.cellular status 的 cells[] 真填上，
 * 前端那边已经把「有没有邻区」和「supported」解耦（cxNbHtml 只看 neighbours）。
 * 字段名按 cxNbHtml 的读法：rat 要大写 'NR'/'LTE'，频点字段叫 earfcn（不是 arfcn）。
 */
function modeminfo_cellx() {
	http.prepare_content('application/json; charset=UTF-8');

	let c = _cell();
	let nb = [];
	let serv = null;

	if (c != null) {
		let cells = c.raw?.cells;
		if (type(cells) == 'array') {
			for (let x in cells) {
				/* serving 那个小区是「基站信息 · 主服务小区」卡的主角，不重复列进邻区表 */
				if (x?.serving === true) continue;
				if (x?.pci == null && x?.rsrp == null) continue;
				push(nb, {
					rat: (x?.rat == 'nr') ? 'NR' : (x?.rat == 'lte') ? 'LTE' : (x?.rat ?? '--'),
					/* 11-22: 带上频段，前端「附近小区」卡/表格显示 n41 / n28 徽章，
					   不用再从 ARFCN 心算。band 来自 cells[].band，服务小区是模组直报
					   （band_source=modem），邻区多为 arfcn-inferred，两者都是真机数据。 */
					band: x?.band ?? null,
					earfcn: x?.arfcn ?? null,
					pci: x?.pci ?? null,
					rsrp: x?.rsrp ?? null,
					rsrq: x?.rsrq ?? null,
					sinr: x?.sinr ?? null
				});
			}
		}
		/* 前端用 serving.arfcn 标「同频邻区」，serving.band 给卡片标题标注当前驻留频段 */
		if (c.serving?.arfcn != null) serv = { arfcn: c.serving.arfcn, band: c.serving.band ?? null };
	}

	http.write_json({
		supported: false,
		serving: serv,
		neighbours: nb,
		age: (c != null && c.raw?.snapshot_age_seconds != null) ? int(c.raw.snapshot_age_seconds) : null
	});
}

/* ---------- simstat：首页 hero「卡槽 SIM」那一格 ----------
 * 原来这里是 _empty，前端 simIsGood() 永远不成立 → 这一格常显「未读到卡槽」
 * （用户 2026-11-19 截图）。SY108 的卡槽权威源是 udx.cellular status 的 physical_sim：
 *   {physical_slot_count:3, slots:[{slot:0,name:"SIM 1"},…], slot:0, ...}
 * 注意 slot 是 0 基，而前端 simIsGood() 用 `d.slot` 做真值判断（0 会被当没读到），
 * 所以这里 +1 转成 1 基再给。code 只有 AT 模组才有（决定要不要显示「SIM卡号码」那行），
 * SY108 拿不到号码 → 给 0，前端就不渲染那一行，不编造。
 */
function modem_simstat() {
	http.prepare_content('application/json; charset=UTF-8');
	let c = _cell();
	if (c == null) {
		http.write_json({ busy: false, slot: 0, text: '蜂窝服务不可用', code: 0 });
		return;
	}
	let ps = c.raw?.physical_sim ?? null;
	let slot = (ps?.slot != null) ? (ps.slot + 1) : null;
	let name = null;
	if (ps?.slots != null && slot != null) {
		for (let s in ps.slots) {
			if (s?.slot != null && (s.slot + 1) == slot) { name = s.name ?? null; break; }
		}
	}
	let sim = c.raw?.sim?.state ?? null;
	let text = (sim == 'READY') ? 'SIM卡正常工作'
	         : (sim != null) ? ('SIM卡' + sim)
	         : 'SIM卡状态未知';
	http.write_json({
		busy: false,
		slot: slot,
		name: name,
		text: text,
		code: 0,
		slot_count: ps?.physical_slot_count ?? null,
		iccid: c.raw?.iccid ?? null,
		errors: c.raw?.info_errors ?? null
	});
}

/* ---------- 首页快捷磁贴「锁频设置 / 短信管理」浮窗的数据面 ----------
 * 用户要求这两个磁贴别再整页跳转到 admin/udx/network、admin/udx/sms，改成和
 * 无线设置/附近小区一样弹浮窗。浮窗是首页自己的 DOM，拿不到 LuCI 视图里的
 * rpc（那些是 require('rpc') 的模块作用域），所以在这里做一层薄的 ubus 转发。
 */
function modem_band_get() {
	http.prepare_content('application/json; charset=UTF-8');
	let c = _cell();
	if (c == null) { http.write_json({ ok: false, error: '蜂窝服务不可用' }); return; }
	let st = c.raw, lim = st.band_limits ?? {}, bc = st.band_choices ?? {};
	let pick = function(rat) {
		let r = lim[rat] ?? {};
		/* supported_bands 是模组真实支持的（band_choices 是理论全集，含本机不支持的 n5/n8 等），
		   优先用它，免得用户勾一个根本锁不上的频段 */
		let sup = (type(r.supported_bands) == 'array' && length(r.supported_bands) > 0)
		        ? r.supported_bands
		        : ((type(bc[rat]) == 'array') ? bc[rat] : []);
		return {
			unrestricted: (r.unrestricted != false),
			bands: (type(r.bands) == 'array') ? r.bands : [],
			supported: sup
		};
	};
	http.write_json({
		ok: true,
		mode: st.mode ?? null,
		rat: c.serving?.rat ?? null,
		band: c.serving?.band ?? null,
		pci: c.serving?.pci ?? null,
		lte: pick('lte'),
		nr: pick('nr')
	});
}

/* 频段列表只收 n41 / B3 这种写法，别的一律丢掉 —— 这几个值最终会进 ubus 参数 */
function _band_list(name) {
	let raw = http.formvalue(name) ?? '';
	let out = [];
	for (let b in split(raw, ',')) {
		let t = trim(b);
		if (match(t, /^[Bn][0-9]{1,3}$/)) push(out, t);
	}
	return out;
}

/* band_lock / unlock 都是异步 operation（band_lock 的官方超时给到 8 分钟，
   切频段时链路会断一下）。这里最多阻塞 4 秒看结果：complete 就报成功，
   还在跑就回 pending，前端提示「已下发，正在切换」并稍后自己再读一次状态。 */
function _op_wait(reply, tries) {
	if (type(reply) != 'object') return { ok: false, error: '模组无响应' };
	if (reply.accepted != true) return { ok: false, error: reply.error ?? '指令被拒绝' };
	let ref = { id: reply.operation_id, boot_id: reply.boot_id, broker_id: reply.broker_id };
	let res = { ok: false, state: reply.state ?? 'queued' };
	for (let i = 0; i < tries; i++) {
		sleep(400);
		let row = ubus.call('udx.cellular', 'operation_status', ref);
		if (type(row) != 'object') break;
		if (row.state != null) res.state = row.state;
		if (row.state != 'queued' && row.state != 'running') {
			res.ok = (row.state == 'complete');
			if (row.error != null) res.error = row.error;
			/* sms_delete_batch 的逐条结果在 items 里（{deleted, error}），原样带出去 */
			if (row.items != null) res.items = row.items;
			break;
		}
	}
	if (res.state == 'queued' || res.state == 'running') res.pending = true;
	return res;
}

/* ---------- s145 网络设置浮窗：读取/修改网络模式与 APN ----------
 * 原「设置向导」跳转到移动网络整页；这里把向导里对 SY108 有意义的几步
 * （网络模式 / SA-NSA / APN）做成首页浮窗。数据全部来自 udx.cellular status，
 * 写入走 ubus 的 network_mode / apn 方法（network_mode_write_supported=true 已实测）。 */
function modem_netcfg_get() {
	http.prepare_content('application/json; charset=UTF-8');
	let c = _cell();
	if (c == null) { http.write_json({ ok: false, error: '蜂窝服务不可用' }); return; }
	let st = c.raw;
	http.write_json({
		ok: true,
		write_supported: (st.network_mode_write_supported === true),
		mode: st.mode ?? null,
		mode_choices: st.mode_choices ?? {},
		nr_capability: st.nr_capability ?? null,
		apn: (st.data_session?.network_apn ?? st.profile?.apn ?? ''),
		pdp_type: st.profile?.pdp_type ?? 'IPV4V6',
		apn_mode: st.apn_mode ?? null,
		active: (st.state == 'pdp_active' && st.pdp_state == 'active')
	});
}

/* 改网络模式会让链路重拨（几秒断网），所以前端要二次确认；
   后端只做白名单校验：模式必须在模组上报的 mode_choices 里，SA/NSA 必须在 nr_capability.choices 里。 */
function modem_netcfg_set() {
	http.prepare_content('application/json; charset=UTF-8');
	let c = _cell();
	if (c == null) { http.write_json({ ok: false, error: '蜂窝服务不可用' }); return; }
	let st = c.raw;
	let mode = trim(http.formvalue('mode') ?? '');
	let nr = trim(http.formvalue('nr_capability') ?? '');
	let apn = trim(http.formvalue('apn') ?? '');
	let pdp = trim(http.formvalue('pdp_type') ?? '');
	let did = '';

	if (mode != '' || nr != '') {
		if (st.network_mode_write_supported !== true) {
			http.write_json({ ok: false, error: '本机模组不支持修改网络模式' }); return;
		}
		let mc = st.mode_choices ?? {};
		let nc = (st.nr_capability?.choices ?? {});
		/* mode 与 nr_capability 可以只改一个：另一个沿用模组当前值 */
		if (mode != '' && mc[mode] == null) { http.write_json({ ok: false, error: '未知的网络模式' }); return; }
		if (nr != '' && nc[nr] == null) { http.write_json({ ok: false, error: '未知的 SA/NSA 模式' }); return; }
		let args = {};
		if (mode != '') args.mode = mode;
		if (nr != '') args.nr_capability = nr;
		let reply = ubus.call('udx.cellular', 'network_mode', args);
		did = 'network_mode';
		if (type(reply) != 'object' || reply.accepted != true) {
			http.write_json({ ok: false, error: (type(reply) == 'object' && reply.error) ? reply.error : '模组拒绝修改网络模式', op: did }); return;
		}
		/* network_mode 是异步 operation，等一会儿看是否完成 */
		let res = _op_wait(reply, 8);
		http.write_json({ ok: res.ok, error: res.error, pending: !!res.pending, op: did });
		return;
	}

	if (apn != '' || pdp != '') {
		/* APN 允许 1-63 字符，只允许常见的可见字符，防注入 */
		if (apn != '' && !match(apn, /^[A-Za-z0-9._\-~]{1,63}$/)) {
			http.write_json({ ok: false, error: 'APN 只能包含字母、数字和 . _ - ~' }); return;
		}
		if (pdp != '' && !match(pdp, /^(IP|IPV4|IPV6|IPV4V6)$/)) {
			http.write_json({ ok: false, error: 'IP 类型不合法' }); return;
		}
		let args = {};
		if (apn != '') args.apn = apn;
		if (pdp != '') args.pdp_type = pdp;
		let reply = ubus.call('udx.cellular', 'apn', args);
		if (type(reply) != 'object' || reply.accepted != true) {
			http.write_json({ ok: false, error: (type(reply) == 'object' && reply.error) ? reply.error : '模组拒绝修改 APN', op: 'apn' }); return;
		}
		let res = _op_wait(reply, 8);
		http.write_json({ ok: res.ok, error: res.error, pending: !!res.pending, op: 'apn' });
		return;
	}

	http.write_json({ ok: false, error: '没有要修改的项目' });
}

function modem_band_set() {
	http.prepare_content('application/json; charset=UTF-8');
	let clear = ((http.formvalue('clear') ?? '') == '1');
	let reply = clear
		? ubus.call('udx.cellular', 'unlock', { scope: 'bands' })
		: ubus.call('udx.cellular', 'band_lock', { lte: _band_list('lte'), nr: _band_list('nr') });
	http.write_json(_op_wait(reply, 10));
}

function modem_sms_list() {
	http.prepare_content('application/json; charset=UTF-8');
	let st = ubus.call('udx.cellular', 'sms_status');
	/* 冷启动第一次读经常是 "Not sampled yet"（模组还没被采样过）：
	   触发一次 sms_refresh 再读，最多等 3 秒 */
	if (type(st) != 'object' || st.available == false) {
		ubus.call('udx.cellular', 'sms_refresh');
		for (let i = 0; i < 6; i++) {
			sleep(500);
			st = ubus.call('udx.cellular', 'sms_status');
			if (type(st) == 'object' && st.available != false && type(st.messages) == 'array') break;
		}
	}
	let msgs = (type(st) == 'object' && type(st.messages) == 'array') ? st.messages : [];
	let out = [], n = 0;
	for (let m in msgs) {
		if (n >= 12) break;              /* 首页浮窗只放最近 12 条，全量在短信页 */
		/* index + pdu_sha256 是删除时要回传的两项（见 sms_delete_batch）。
		   index 会因为新短信进来而挪位，所以删的时候必须连 sha 一起校验，不能只给 index。 */
		push(out, {
			peer: m?.peer ?? m?.number ?? '',
			time: m?.timestamp ?? '',
			text: m?.text ?? '',
			kind: m?.kind ?? '',
			index: m?.index ?? null,
			sha: m?.pdu_sha256 ?? null
		});
		n++;
	}
	http.write_json({
		ok: true,
		total: length(msgs),
		messages: out,
		error: (type(st) == 'object') ? (st.error ?? null) : '模组无响应'
	});
}

/* 删除首页浮窗里勾中的短信。前端把每行拼成 "index:sha256" 用逗号传来，
 * 这里做一次白名单式校验（数字 + 64 位十六进制）才交给 ubus —— 这几个值最终
 * 会变成删除参数，不能让任意字符串过去。
 * 一次最多 12 条（浮窗上限），sms_delete_batch 本身支持 50 条一批。 */
function modem_sms_del() {
	http.prepare_content('application/json; charset=UTF-8');
	let raw = http.formvalue('items') ?? '';
	let items = [];
	for (let it in split(raw, ',')) {
		let t = split(trim(it), ':');
		if (length(t) == 2 && match(t[0], /^[0-9]{1,6}$/) && match(t[1], /^[0-9a-f]{64}$/))
			push(items, { index: int(t[0]), pdu_sha256: t[1] });
	}
	if (length(items) == 0) {
		http.write_json({ ok: false, error: '没有选中短信' });
		return;
	}
	let res = _op_wait(ubus.call('udx.cellular', 'sms_delete_batch', { items: items }), 10);
	/* operation 完成 ≠ 每条都删掉了：模组可能因为 index/sha 对不上而拒掉个别条目。
	   逐条统计，别让前端把「一条没删」也报成成功。 */
	if (type(res.items) == 'array') {
		let okn = 0, why = null;
		for (let it in res.items) {
			if (it?.deleted === true) okn++;
			else if (why == null) why = it?.error ?? '未删除';
		}
		res.deleted = okn;
		res.failed = length(res.items) - okn;
		if (okn > 0) res.ok = true;
		else if (res.pending != true) { res.ok = false; res.error = why ?? '删除失败'; }
	}
	http.write_json(res);
}

/* ---------- ota_check：首页「检查更新」 ----------
 * mwrt 原版走 rpcd 的 luci.mwrt-ota（它自己的更新服务器），SY108 没有这个对象，
 * 点「检查更新」必然 reject → 弹一句「检查失败」（用户 2026-11-19 反馈点了没反应）。
 *
 * 改成查 GitHub Releases：CI 的 release job 在打 tag 时会把 sysupgrade.bin /
 * SHA256SUMS / build.json 挂到 release 上，所以 releases/latest 就是「线上最新构建」
 * 的权威来源；仓库是公开的，不需要 token。设备侧实测 curl + CA 都可用。
 *
 * 只负责「查」。下载与刷机仍走「关于本机 → NEW → 系统升级页」那条 LuCI 标准路径，
 * 有哈希校验、有 boot_accept 回滚兜底 —— 不在首页直接触发 sysupgrade。
 */
function _ota_local() {
	return trim(_rd('/etc/udx-system-build'));
}

/* 'sy108-v2026.11.19-hotfix-s138' → 'v2026.11.19-hotfix-s138' */
function _ota_tag(s) {
	let m = match(s, /(v[0-9]{4}\.[0-9]{2}\.[0-9]{2}[A-Za-z0-9._-]*)/);
	return m ? m[1] : s;
}

/* 'v2026.11.19-…' → '2026-11-19'；取不到日期返回 null */
function _ota_date(s) {
	let m = match(s, /v([0-9]{4})\.([0-9]{2})\.([0-9]{2})/);
	return m ? sprintf('%s-%s-%s', m[1], m[2], m[3]) : null;
}

function ota_check() {
	http.prepare_content('application/json; charset=UTF-8');

	let cachef = '/tmp/.udx-ota.json';
	let now = time();
	let what = http.formvalue('what') ?? 'check';

	let cached = null;
	try { cached = json(_rd(cachef)); } catch (e) { cached = null; }

	/* what=latest：开首页时那次只读调用。6 小时内的缓存直接用，别每开一次首页就打一次 GitHub */
	if (what == 'latest' && type(cached) == 'object' && cached?.t != null && (now - cached.t) < 21600) {
		http.write_json(cached.d);
		return;
	}

	/* 取 JSON 用 system + -o 落临时文件，不要用 popen 直接读：
	   实测本机 ucode 的 popen 给 curl 时管道会被提前关掉，curl 报
	   "Failure writing output to destination"、读到 0 字节。system 是本文件里
	   已经在用的方式（_run），稳。 */
	let tmpf = '/tmp/.udx-ota-rel.json';
	let cmd = "curl -sS -m 10 -H 'Accept: application/vnd.github+json' "
	        + "-H 'User-Agent: sy108-ota' -o " + tmpf + " "
	        + "https://api.github.com/repos/lai-art/sy108-mainline/releases/latest 2>/dev/null";
	try { system(cmd); } catch (e) { }
	let raw = _rd(tmpf);

	let rel = null;
	try { rel = json(raw); } catch (e) { rel = null; }
	if (type(rel) != 'object' || rel?.tag_name == null) {
		http.write_json({ ok: false, error: 'nonet', local: _ota_local() });
		return;
	}

	let local = _ota_local(), ltag = _ota_tag(local), rtag = rel.tag_name;
	let ld = _ota_date(ltag), rd = _ota_date(rtag);

	/* 先按 commit 判：CI 构建时本地没有 refs/tags/<新 tag>（见 .github/workflows 里
	   fetch-tags 那段），`git describe` 于是退回「旧 tag + 提交数 + g<sha>」，
	   版本戳会是 "sy108-v2026.11.10-usb3-lpm-58-gbd174b7" 这种。
	   只看日期就会把「已经是最新的这一版」判成有新版本
	   （2026-11-19 刷完 v2026.11.19 后实测 update:true，就是这个假阳性）。
	   所以：本地戳里能抠出 -g<sha> 就查一次该 tag 指向的 commit，前缀对得上 = 已是最新。
	   抠不出来（手工热修戳）再退回日期比较。 */
	let lsha = null;
	let sm = match(local, /-g([0-9a-f]{7,40})/);
	if (sm) lsha = sm[1];

	let update = null;
	let rsha = null;
	if (lsha != null) {
		let cf = '/tmp/.udx-ota-commit.json';
		system(sprintf("curl -sS -m 8 -H 'Accept: application/vnd.github+json' "
		             + "-H 'User-Agent: sy108-ota' -o %s "
		             + "https://api.github.com/repos/lai-art/sy108-mainline/commits/%s 2>/dev/null",
		               cf, rtag));
		let cm = null;
		try { cm = json(_rd(cf)); } catch (e) { cm = null; }
		if (type(cm) == 'object' && cm?.sha != null) {
			rsha = cm.sha;
			if (index(rsha, lsha) == 0) update = false;   /* 本地 sha 是线上 sha 的前缀 → 同一提交 */
		}
	}
	/* s152: sha 对不上(或本地根本没有 sha)时，按日期判方向，绝不再默认"有更新"。
	   以前是 `update = (index(rsha, lsha) != 0)` —— 只要 sha 不一致就判有新版：
	     · 设备跑 main 分支 CI 产物(v2026.11.19-6-gf1a6253) 去比 latest(v2026.11.19)
	       → sha 必然不同 → 弹「发现新固件 v2026.11.19」，点下去其实是从 11-22 降回 11-19。
	   现在：线上日期更新 → 有更新；同一日期或本地更晚 → 已是最新(用户 11-23 明确要求
	   「当前已是最新就显示最新」，不要绕成"不可比较")。 */
	if (update == null) {
		if (ld != null && rd != null) {
			update = (rd > ld);
		} else if (rtag == ltag) {
			update = false;
		}
	}

	let out = {
		ok: true,
		update: update,
		version: rtag,
		local: local,
		local_tag: ltag,
		url: rel.html_url ?? null,
		published: rel.published_at ?? null,
		local_sha: lsha,
		remote_sha: rsha,
		asset: null,
		size: null
	};
	if (type(rel.assets) == 'array') {
		for (let a in rel.assets) {
			if (a?.name == 'sysupgrade.bin') {
				out.asset = a.browser_download_url ?? null;
				out.size = a.size ?? null;
			} else if (a?.name == 'SHA256SUMS') {
				out.sums = a.browser_download_url ?? null;
			}
		}
	}

	writefile(cachef, sprintf('%J', { t: now, d: out }));
	http.write_json(out);
}

/* ---------- 在线更新：下载 / 进度 / 校验 / 刷机 ----------
 * 用户 2026-11-19 定的流程：有更新 → 首页「检查更新」旁边冒出下载按钮 →
 * 下载（自动）→ sha256 自动校验 → **用户手动确认**才 sysupgrade。
 *
 * 四个接口分工：
 *   ota_download  起一个后台 curl 拉 sysupgrade.bin + SHA256SUMS，立刻返回
 *   ota_progress  读 /tmp 里那份文件的大小算进度（总大小来自 release 的 asset.size）
 *   ota_verify    大小 + sha256 双重校验，不通过不给升级
 *   ota_install   再校验一遍（防御性），然后后台 sysupgrade
 *
 * 下载地址只认服务端缓存里的那份 asset —— 前端传 URL 一概不接受，避免被当成
 * "拿任意地址往设备里写文件"的口子。
 * 镜像放 /tmp（tmpfs，实测 99M 可用，sysupgrade.bin 约 21M），重启即清。
 */
const OTA_BIN = '/tmp/.udx-ota.bin';
const OTA_RC  = '/tmp/.udx-ota.rc';
const OTA_SUM = '/tmp/.udx-ota.sums';
const OTA_SHA = '/tmp/.udx-ota.sha';
const OTA_START = '/tmp/.udx-ota.start';

function _ota_cached() {
	let d = null;
	try { d = json(_rd('/tmp/.udx-ota.json')); } catch (e) { d = null; }
	return (type(d) == 'object' && type(d.d) == 'object') ? d.d : null;
}

/* GitHub 下载加速节点。国内很多网络访问不了 github.com（本机这张卡就是），
 * 但 api.github.com 通，所以「检查更新」能查到、「下载」却拉不动。
 * 做法同 SimAdmin 的 OTA 页：把 github 地址拼在加速节点后面。
 *   白名单三个内置节点；自定义只收 http(s) URL 且字符集受限 —— 这个值会被拼进
 *   shell 命令，必须挡住引号/分号/空格，否则等于开一个命令注入口子。
 * 返回 '' 表示直连（也用于"用户填了非法地址就退回直连"）。 */
function _ota_accel() {
	let a = trim(http.formvalue('accel') ?? '');
	if (a == '') return '';
	if (a == 'https://gh-proxy.com/' || a == 'https://ghproxy.net/' || a == 'https://githubproxy.cc/')
		return a;
	if (length(a) > 200) return '';
	if (!match(a, /^https?:\/\/[A-Za-z0-9._~:\/\[\]-]+$/)) return '';
	return match(a, /\/$/) ? a : (a + '/');
}

function ota_download() {
	http.prepare_content('application/json; charset=UTF-8');
	let d = _ota_cached();
	if (d == null || d?.asset == null) {
		http.write_json({ ok: false, error: 'noasset' });
		return;
	}
	/* 加速只影响下载地址，不改变"拿哪一份"的判断 */
	let acc = _ota_accel();
	system(sprintf('rm -f %s %s %s %s', OTA_BIN, OTA_RC, OTA_SUM, OTA_SHA));
	writefile(OTA_START, '' + time());
	/* 两件事都丢后台，请求立刻返回：
	     ① 拉 SHA256SUMS（很小，但要跟镜像一起在后台做 —— 同步拉过一次，GitHub 慢的时候
	        整个请求会被拖到超时）
	     ② 拉 sysupgrade.bin
	   -L 不能省：release 的下载地址是 302 到 objects.githubusercontent.com，
	   不带 -L 存下来的是那个跳转页，不是固件。 */
	let sums = (d?.sums != null) ? sprintf('curl -sSL -m 60 -o %s "%s%s"; ', OTA_SUM, acc, d.sums) : '';
	/* -m 600：真连不上时别让 curl 挂半小时，10 分钟够慢速下完 21MB */
	system(sprintf("sh -c '%scurl -sSL -m 600 -o %s \"%s%s\"; echo $? > %s' >/dev/null 2>&1 &",
	               sums, OTA_BIN, acc, d.asset, OTA_RC));
	http.write_json({ ok: true, total: d.size ?? 0 });
}

function ota_progress() {
	http.prepare_content('application/json; charset=UTF-8');
	let d = _ota_cached();
	let total = _int(d?.size, 0);
	let st = stat(OTA_BIN);
	let got = (st != null) ? _int(st.size, 0) : 0;
	let rc = trim(_rd(OTA_RC));
	let state = 'idle';
	if (got > 0) state = 'running';
	if (rc != '') {
		state = (rc == '0') ? 'done' : 'error';
		/* curl 退出码 0 但字节数不够 = 被截断，按失败算 */
		if (state == 'done' && total > 0 && got < total) state = 'error';
	}
	/* 40 秒一个字节都没下来 = 这条路走不通（实测本机 github.com 被网络屏蔽，
	   curl 会一直挂在 -m 600 上）。别让前端对着 0% 干等，直接当超时报错。 */
	let t0 = _int(_rd(OTA_START), 0);
	if (state == 'running' && got == 0 && t0 > 0 && (time() - t0) > 40) {
		state = 'error';
		rc = '28';
	}
	http.write_json({ ok: true, state: state, got: got, total: total, rc: rc });
}

/* 从 SHA256SUMS 里取 sysupgrade.bin 那一行的期望哈希 */
function _ota_want() {
	let sums = _rd(OTA_SUM);
	for (let line in split(sums, '\n')) {
		if (index(line, 'sysupgrade.bin') < 0) continue;
		let m = match(line, /^([0-9a-f]{64})/);
		if (m) return m[1];
	}
	return null;
}

function _ota_have() {
	system(sprintf('sha256sum %s > %s 2>/dev/null', OTA_BIN, OTA_SHA));
	let m = match(trim(_rd(OTA_SHA)), /^([0-9a-f]{64})/);
	return m ? m[1] : null;
}

function ota_verify() {
	http.prepare_content('application/json; charset=UTF-8');
	let d = _ota_cached();
	let total = _int(d?.size, 0), st = stat(OTA_BIN);
	let got = (st != null) ? _int(st.size, 0) : 0;
	if (got == 0) { http.write_json({ ok: false, error: 'nobin' }); return; }
	if (total > 0 && got != total) {
		http.write_json({ ok: false, error: 'size', got: got, total: total });
		return;
	}
	let want = _ota_want();
	if (want == null) { http.write_json({ ok: false, error: 'nosums' }); return; }
	let have = _ota_have();
	if (have == null || have != want) {
		http.write_json({ ok: false, error: 'sha', want: want, have: have });
		return;
	}
	http.write_json({ ok: true, sha: have, size: got });
}

function ota_install() {
	http.prepare_content('application/json; charset=UTF-8');
	let d = _ota_cached();
	if (d == null) { http.write_json({ ok: false, error: 'nocache' }); return; }

	/* 刷机前再校验一遍：下载完到用户点确认之间，文件仍可能被写坏 */
	let total = _int(d?.size, 0), st = stat(OTA_BIN);
	let got = (st != null) ? _int(st.size, 0) : 0;
	if (got == 0) { http.write_json({ ok: false, error: 'nobin' }); return; }
	if (total > 0 && got != total) { http.write_json({ ok: false, error: 'size', got: got, total: total }); return; }
	let want = _ota_want(), have = _ota_have();
	if (want == null) { http.write_json({ ok: false, error: 'nosums' }); return; }
	if (have == null || have != want) { http.write_json({ ok: false, error: 'sha', want: want, have: have }); return; }

	/* 先让响应带回去，2 秒后再动 sysupgrade —— 否则浏览器拿不到 "已开始升级"。
	   不带 -n：保留 /etc/config（网络/APN 都在这），和 LuCI 里点升级的行为一致。
	   刷完由 boot_accept 兜底：起不来会自动回滚到 recovery。 */
	system(sprintf("sh -c 'sleep 2; sysupgrade %s' >/dev/null 2>&1 &", OTA_BIN));
	http.write_json({ ok: true, installing: true, sha: have });
}

/* ---------- mwrt_assurance_status：首页连接状态区（gw()） ----------
 * 前端只取四个中文键，值含「在线/Online」时点亮状态点。 */

function network_mwrt_assurance_status() {
	let cell = _cell_signal();
	http.prepare_content('application/json; charset=UTF-8');
	http.write_json({
		'宽带接口状态': '未配置',
		'蜂窝接口状态': (cell != null) ? cell.state : '模组未就绪',
		'当前网关': '直连',
		'当前物理接口': 'wwan0'
	});
}

/* ---------- topo_data：网络拓扑（mwrt-topo.js） ----------
 * 契约从 mwrt-topo.js 反推（2026-11-15，键全集核对过）：
 *   egress{kind,dev,ip,gw,proto,rtt_ms,rx_bps,tx_bps}  kind='cell' → 基站链路
 *   cell{plmn,operator,rat,band,arfcn,pci,cell_id,rsrp,rsrq,sinr,state,apn,ip,module{model}}
 *                                                      plmn=46000 → 运营商配色/名称；
 *                                                      2026-11-16 补齐塔/本设备面板要用的全部字段
 *   lan{ip,mask,ssid24,ch24,w24}  counts{wired,wifi,total}
 *   ports[{name,role,up,speed}]   speed=null → fmtMbps(null)='—'，比 -1 安全
 *   clients[{ip,mac,name,vendor,type}]  type='wifi' 归无线组，其余有线
 *   uplink_wifi=null  usb{nic:null,tether:null}  model='tr3000'（3D 图沿用） */

function modem_topo_data() {
	let wan = _find_iface('wan');
	let wan_up = (wan?.up === true);
	let wan_ip = wan ? _first_ipv4(wan) : '';
	let cell = _cell_signal();
	let up = (cell != null && cell.active === true);
	let r = _rate_bps('wwan0');

	/* 租约 → 拓扑终端节点（与「在线设备」浮层同源） */
	let clients = _leases();

	let lan_ip = '';
	for (let ifc in _iface_list()) {
		let dev = ifc?.l3_device ?? ifc?.device ?? '';
		if (dev == 'br-usb' || ifc?.interface == 'usbmgmt') {
			lan_ip = _first_ipv4(ifc);
			if (lan_ip) break;
		}
	}

	http.prepare_content('application/json; charset=UTF-8');
	http.write_json({
		/* 本设备就是 5G 模组 UDX710（用户 2026-11-16 确认）：
		   拓扑「本设备」节点用模组工艺图 + UDX710 名（mwrt-topo.js artFor 按
		   'udx710' 走 module5g，modelName 兜底大写正好显示 UDX710） */
		model: 'udx710',
		egress: {
			kind: up ? 'cell' : 'none',
			dev: 'wwan0',
			ip: wan_ip,
			gw: null,
			proto: 'udx',
			rtt_ms: null,
			rx_bps: r.rx_bps,
			tx_bps: r.tx_bps
		},
		cell: (cell != null) ? {
			plmn: cell.plmn,
			operator: cell.operator,
			rat: cell.rat_txt,
			band: cell.band,
			/* 2026-11-16：塔面板的 ARFCN/PCI/小区 ID、RSRQ/SINR 与「本设备」面板的
			   模组分区都从这里取，缺一个前端就渲染「—」（cell_id/tac 由
			   _cell_signal() 从 registration 兜底，cells[] 里没有这两个键） */
			arfcn: cell.arfcn,
			pci: cell.pci,
			cell_id: cell.cell_id,
			tac: cell.tac,
			rsrp: cell.rsrp,
			rsrq: cell.rsrq,
			sinr: cell.sinr,
			state: cell.state,
			apn: cell.apn,
			ip: cell.ip,
			module: { model: 'UDX710' }
		} : null,
		uplink_wifi: null,
		usb: { nic: null, tether: null },
		lan: { ip: lan_ip, mask: 24, ssid24: null, ch24: null, w24: null },
		counts: { wired: length(clients), wifi: 0, total: length(clients) },
		ports: [
			{ name: 'wwan0', role: 'WAN', up: wan_up, speed: null },
			{ name: 'br-usb', role: 'LAN', up: true, speed: null }
		],
		clients: clients
	});
}

/* ---------- wan_get：WAN 口设置弹窗（pcWanOpen） ----------
 * SY108 的 WAN 就是蜂窝模组，没有 PPPoE/DHCP/静态可配。
 * 返回 cellular:true，前端据此渲染只读信息 + 「前往移动网络」，
 * 不再进宽带拨号表单（那个表单在本机必然保存失败）。 */

function modem_wan_get() {
	let cell = _cell_signal();
	http.prepare_content('application/json; charset=UTF-8');
	if (cell == null) {
		http.write_json({ ok: false, error: '蜂窝服务不可用' });
		return;
	}
	http.write_json({
		ok: true,
		cellular: true,
		device: 'wwan0',
		state: cell.state,
		operator: cell.operator,
		plmn: cell.plmn,
		rat: cell.rat_txt,
		band: cell.band,
		apn: cell.apn,
		ip: cell.ip,
		rsrp: cell.rsrp,
		rsrq: cell.rsrq,
		sinr: cell.sinr
	});
}

/* ---------- lan_get / lan_set：LAN 口设置弹窗（pcLanOpen/Save） ----------
 * LAN = br-usb（usbmgmt 接口）。地址读 uci network.usbmgmt，拿不到（没提交过
 * 或配置段名不同）退回 ubus 运行时值；DHCP 参数找服务 usbmgmt 的 dhcp 段，
 * 找不到就按 OpenWrt 惯例落 'lan' 段，还没有则 DHCP 部分给默认值。
 * lan_set 由前端 pcPost 发（application/x-www-form-urlencoded），
 * http.formvalue 兼收 GET/POST 表单；menu.d 对该路由声明了 post:true。 */

function modem_lan_get() {
	let c = cursor();
	let ipaddr = c.get('network', 'usbmgmt', 'ipaddr') ?? '';
	let netmask = c.get('network', 'usbmgmt', 'netmask') ?? '255.255.255.0';

	/* uci 里没有 → 用运行时地址兜底（设备此刻一定在 192.168.9.1 上被访问） */
	if (!ipaddr || type(ipaddr) != 'string') {
		for (let ifc in _iface_list()) {
			let dev = ifc?.l3_device ?? ifc?.device ?? '';
			if (dev == 'br-usb' || ifc?.interface == 'usbmgmt') {
				let a = (ifc?.['ipv4-address'] ?? [])[0] ?? null;
				if (a?.address) {
					ipaddr = a.address;
					let bits = _int(a.mask, 24);
					let m = 0;
					for (let i = 0; i < bits && i < 32; i++) m |= (1 << (31 - i));
					netmask = sprintf('%d.%d.%d.%d',
						(m >> 24) & 255, (m >> 16) & 255, (m >> 8) & 255, m & 255);
					break;
				}
			}
		}
	}

	let sec = _dhcp_sec(c);
	let dsec = (sec != null) ? (c.get_all('dhcp', sec) ?? {}) : {};
	let ignore = (dsec.ignore == '1' || dsec.ignore == 1);

	http.prepare_content('application/json; charset=UTF-8');
	http.write_json({
		ok: true,
		device: 'br-usb',
		ipaddr: ipaddr,
		netmask: (type(netmask) == 'string') ? netmask : '255.255.255.0',
		dhcp: sec != null ? !ignore : true,
		start: sprintf('%d', _int(dsec.start, 100)),
		limit: sprintf('%d', _int(dsec.limit, 150)),
		leasetime: (type(dsec.leasetime) == 'string' && dsec.leasetime != '') ? dsec.leasetime : '12h'
	});
}

function modem_lan_set() {
	let ipaddr = trim(http.formvalue('ipaddr') ?? '');
	let netmask = trim(http.formvalue('netmask') ?? '');
	let dhcp_on = (http.formvalue('dhcp') == '1');
	let start = trim(http.formvalue('start') ?? '');
	let limit = trim(http.formvalue('limit') ?? '');
	let leasetime = trim(http.formvalue('leasetime') ?? '');

	http.prepare_content('application/json; charset=UTF-8');

	/* 服务端再校一遍（前端校过一次）：点分四段 + 每段 0..255 */
	let re_ip = /^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}$/;
	if (!match(ipaddr, re_ip) || !match(netmask, re_ip)) {
		http.write_json({ ok: false, error: 'IP 地址或子网掩码格式不正确' });
		return;
	}
	/* 掩码必须是合法的连续 1：防手滑把 255.0.255.0 这类写进去，netifd 会拒 */
	let m = 0;
	let okm = true;
	let parts = split(netmask, '.');
	for (let x in parts) {
		m = (m << 8) | _int(x, 0);
	}
	for (let i = 0; i < 32; i++) {
		let bit = (m >> (31 - i)) & 1;
		if (bit == 0) { okm = ((m & ((1 << (32 - i)) - 1)) == 0); break; }
	}
	if (m == 0) okm = false;   /* 0.0.0.0 非法掩码（1<<32 在 32 位下回绕，上面的循环判不出来） */
	if (!okm) {
		http.write_json({ ok: false, error: '子网掩码必须是连续的（例如 255.255.255.0）' });
		return;
	}

	let c = cursor();
	c.set('network', 'usbmgmt', 'ipaddr', ipaddr);
	c.set('network', 'usbmgmt', 'netmask', netmask);
	c.set('network', 'usbmgmt', 'proto', 'static');
	c.commit('network');

	let sec = _dhcp_sec(c);
	if (sec != null) {
		c.set('dhcp', sec, 'ignore', dhcp_on ? '0' : '1');
		if (match(start, /^\d+$/) && _int(start, 0) < 255) c.set('dhcp', sec, 'start', start);
		if (match(limit, /^\d+$/) && _int(limit, 0) > 0 && _int(limit, 0) <= 4096) c.set('dhcp', sec, 'limit', limit);
		if (match(leasetime, /^\d+[smhd]?$/)) c.set('dhcp', sec, 'leasetime', leasetime);
		c.commit('dhcp');
	}

	/* 重载：改了地址必须 reload network；动了 DHCP 再重启 dnsmasq。
	   两个都丢后台，响应立即返回，前端有「正在应用」遮罩。 */
	_run('/etc/init.d/network reload >/dev/null 2>&1 &');
	if (sec != null) _run('/etc/init.d/dnsmasq restart >/dev/null 2>&1 &');

	http.write_json({
		ok: true,
		ipaddr: ipaddr,
		netmask: netmask,
		dhcp: dhcp_on,
		dhcp_applied: (sec != null)
	});
}

/* ---------- 导出 ---------- */
/* 每个 key 对应 menu.d 里的一条 "type":"function" 路由。
 * 名称规则：路径 admin/x/y -> x_y（斜杠换下划线）。 */

/* mwrt 有两个页面 SY108 没有：设置向导（admin/system/mwrt_wizard）与 OTA
   （admin/system/ota）。首页模板里的链接和历史书签会点到它们，不注册就是
   整页 404。这里注册成重定向，落到 SY108 真实存在的页面上，比留个死链好。

   - 向导 -> 首页（SY108 没有首次配置向导，配置都在「移动网络」六个页签里）
   - OTA  -> 系统升级（LuCI 标准页 admin/system/flash） */
function redirect_wizard() {
	http.redirect(dispatcher.build_url('admin', 'modeminfo'));
}

function redirect_ota() {
	http.redirect(dispatcher.build_url('admin', 'system', 'flash'));
}

return {
	/* 已实现 */
	fancontrol_devinfo: devinfo,
	fancontrol_devpop: fancontrol_devpop,
	/* s144 屏保：配置读取 + 设置（移植 mwrt 的 msgct，存 outline 配置） */
	fancontrol_msgct: fancontrol_msgct,
	fancontrol_screensaver_set: fancontrol_screensaver_set,
	/* 2026-11-19: 原来是 _empty，首页「蜂窝模组/SIM/基站」三张卡因此误报未插模组 */
	fancontrol_modem_ctrl: fancontrol_modem_ctrl,
	/* 首页浮窗：锁频设置 / 短信管理（用户要求不跳转，改成弹窗） */
	modem_band_get: modem_band_get,
	modem_band_set: modem_band_set,
	/* s145 网络设置浮窗：网络模式 / SA-NSA / APN 的读写 */
	modem_netcfg_get: modem_netcfg_get,
	modem_netcfg_set: modem_netcfg_set,
	modem_sms_list: modem_sms_list,
	modem_sms_del: modem_sms_del,
	/* 首页「检查更新」：查 GitHub Releases（原来是 rpcd luci.mwrt-ota，SY108 没有） */
	ota_check: ota_check,
	/* 在线更新：下载 → 进度 → 校验 → 手动确认刷机 */
	ota_download: ota_download,
	ota_progress: ota_progress,
	ota_verify: ota_verify,
	ota_install: ota_install,
	redirect_wizard: redirect_wizard,
	redirect_ota: redirect_ota,
	network_mwrt_assurance_status: network_mwrt_assurance_status,
	modem_topo_data: modem_topo_data,
	modem_lan_get: modem_lan_get,
	modem_lan_set: modem_lan_set,
	modem_wan_get: modem_wan_get,

	/* 只读，暂返回空对象 */
	fancontrol_memfree: _empty,
	modem_audio_state: _empty,
	modem_audio_wave: _empty,
	modem_camframe: _empty,
	modem_simslots: _empty,
	modem_simstat: modem_simstat,
	modem_wifi_get: _empty,
	modem_wlbridge_status: _empty,
	display_status: _empty,

	/* 只读，按 SY108 实际情况给固定值 */
	modem_modem_present: function() {
		http.prepare_content('application/json; charset=UTF-8');
		http.write_json({ present: true });
	},
	modem_qmodem_get_modem_cfg: function() {
		/* 没有 cfgs 数组时前端不重建模组下拉，后续 modem_ctrl 的 cfg 为空；
		   大多数情况能吃默认模组，可接受 */
		http.prepare_content('application/json; charset=UTF-8');
		http.write_json({ cfgs: [] });
	},
	modeminfo_cellx: modeminfo_cellx,

	/* 写入/控制，一律不可用 */
	fancontrol_fanswj: _unsupported,
	modem_audio_ctl: _unsupported,
	modem_audio_del: _unsupported,
	modem_audio_mic: _unsupported,
	modem_audio_mute: _unsupported,
	modem_audio_play: _unsupported,
	modem_audio_upload: _unsupported,
	modem_audio_vol: _unsupported,
	modem_camstart: _unsupported,
	modem_camstop: _unsupported,
	modem_simset: _unsupported,
	modem_wan_set: _unsupported,
	modem_wifi_set: _unsupported,
	modem_wlbridge_join: _unsupported,
	modem_wlbridge_leave: _unsupported,
	modem_wlbridge_scan: _unsupported,
	display_set_screen: _unsupported,
	display_set_brightness: _unsupported,
	display_screenshot: _unsupported,

	/* 通配兜底 */
	fancontrol_wildcard: _empty,
	mwrtrepair_wildcard: _empty,
	devimg_upload: _unsupported,
	devimg_reset: _unsupported
};
