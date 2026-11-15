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

import { readfile, writefile, lsdir } from 'fs';

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
	   而且 /sys/class/thermal 在部分内核里是符号链接，直接 lsdir 最稳。 */
	let max = 0, seen = [];
	for (let name in (lsdir('/sys/class/thermal') ?? [])) {
		if (!match(name, /^thermal_zone\d+$/)) continue;
		let v = _int(_rd('/sys/class/thermal/' + name + '/temp'), 0);
		if (v > 1000) v = int(v / 1000);
		push(seen, name + '=' + v);
		if (v > max) max = v;
	}
	return { max: max, seen: seen };
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
		'默认网关': wan_gw,
		'LAN_IP': lan_ip,
		'DNS服务器': join(' ', dns),
		'WAN接口': wan_dev,

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
	redirect_wizard: redirect_wizard,
	redirect_ota: redirect_ota,

	/* 只读，暂返回空对象 */
	fancontrol_devpop: _empty,
	fancontrol_memfree: _empty,
	fancontrol_modem_ctrl: _empty,
	modem_audio_state: _empty,
	modem_audio_wave: _empty,
	modem_camframe: _empty,
	modem_lan_get: _empty,
	modem_simslots: _empty,
	modem_simstat: _empty,
	modem_topo_data: _empty,
	modem_wan_get: _empty,
	modem_wifi_get: _empty,
	modem_wlbridge_status: _empty,
	display_status: _empty,
	network_mwrt_assurance_status: _empty,

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
	modem_lan_set: _unsupported,
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
