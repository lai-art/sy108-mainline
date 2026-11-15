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

import { readfile, writefile, lsdir, statvfs } from 'fs';
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

function _temp_max() {
	/* 不用固定编号 0..15 遍历：真机 thermal_zone 编号不保证连续，
	   而且 /sys/class/thermal 在部分内核里是符号链接，直接 lsdir 最稳。
	   zl 是结构化的 {name,temp}（devpop k=tmp 的温度浮层用），
	   seen 是 "zone=温度" 字符串（debug 快照用），两份数据同源。 */
	let max = 0, seen = [], zl = [];
	for (let name in (lsdir('/sys/class/thermal') ?? [])) {
		if (!match(name, /^thermal_zone\d+$/)) continue;
		let v = _int(_rd('/sys/class/thermal/' + name + '/temp'), 0);
		if (v > 1000) v = int(v / 1000);
		push(seen, name + '=' + v);
		push(zl, { name: name, temp: v });
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
	return { raw: st, serving: (length(cells) > 0) ? cells[0] : null };
}

/* 归一化的蜂窝信号视图：给 devinfo / devpop(信号卡) / topo_data / wan_get 共用。
 * 全部字段做了缺省兜底：模组没起来 / 没 SIM / 没小区数据时返回 null 字段，
 * 前端按 null 渲染「--」，绝不能让字符串键缺失。 */
function _cell_signal() {
	let c = _cell();
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
		mode: st.mode ?? null
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

/* /tmp/dhcp.leases → [{ip,mac,name,band}]，拓扑与「在线设备」浮层共用。
 * 租约格式: "<expiry> <mac> <ip> <hostname> <clientid>"，hostname 可能带空格吗？
 * dnsmasq 会转义空格为 \x20，所以第 4 段就是完整主机名。 */
function _leases() {
	let out = [];
	for (let line in split(_rd('/tmp/dhcp.leases'), '\n')) {
		let f = split(trim(line), /[ \t]+/);
		if (f == null || length(f) < 4) continue;
		if (!match(f[2], /^\d+\.\d+\.\d+\.\d+$/)) continue;
		push(out, { ip: f[2], mac: f[1], name: f[3], vendor: '', band: 'wired', type: 'wired' });
	}
	return out;
}

/* 存储分区：/proc/mounts 里挑四个有意义的挂载点 × statvfs。
 * 数值统一折算成 KB（前端 sz() 按 KB 起算）。 */
function _parts() {
	let out = [];
	for (let line in split(_rd('/proc/mounts'), '\n')) {
		let f = split(trim(line), /\s+/);
		if (f == null || length(f) < 3) continue;
		let mp = f[1], fst = f[2];
		if (mp != '/' && mp != '/overlay' && mp != '/rom' && mp != '/boot') continue;
		let v = null;
		try { v = statvfs(mp); } catch (e) { v = null; }
		if (type(v) != 'object') continue;
		let fr = _int(v.frsize ?? v.bsize, 1024);
		if (fr <= 0) fr = 1024;
		let total = _int(v.blocks, 0) * fr;
		let free = _int(v.bavail, 0) * fr;
		if (total <= 0) continue;
		let used = total - free;
		push(out, {
			fs: fst,
			mount: mp,
			total: int(total / 1024),
			used: int(used / 1024),
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
		http.write_json({ zones: t.zones });
	} else if (k == 'storage') {
		http.write_json({ parts: _parts() });
	} else if (k == 'conns') {
		http.write_json(_conns());
	} else {
		http.write_json({});
	}
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
 *   cell{plmn,operator,rat,module{model}}              plmn=46000 → 运营商配色/名称
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
		model: 'tr3000',
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
			rsrp: cell.rsrp,
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
	redirect_wizard: redirect_wizard,
	redirect_ota: redirect_ota,
	network_mwrt_assurance_status: network_mwrt_assurance_status,
	modem_topo_data: modem_topo_data,
	modem_lan_get: modem_lan_get,
	modem_lan_set: modem_lan_set,
	modem_wan_get: modem_wan_get,

	/* 只读，暂返回空对象 */
	fancontrol_memfree: _empty,
	fancontrol_modem_ctrl: _empty,
	modem_audio_state: _empty,
	modem_audio_wave: _empty,
	modem_camframe: _empty,
	modem_simslots: _empty,
	modem_simstat: _empty,
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
	modeminfo_cellx: function() {
		/* supported:false 会让「签约速率/载波聚合/附近小区」三块整段不渲染，
		   这是 mwrt 前端自带的降级路径，比硬凑数据安全 */
		http.prepare_content('application/json; charset=UTF-8');
		http.write_json({ supported: false });
	},

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
