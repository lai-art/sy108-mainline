/* OTA 下载线路测速（独立模块，避免与 udx_home.uc 并发改同一文件）。
 *
 * 用户 2026-11-24：有更新时弹出下载浮窗，三个加速节点后面要显示各自
 * 耗时，一眼看出哪个快。这个接口串行探测四条线路（直连 + 三节点），
 * 每条用 curl 取 release API 的开头 1KB，检查 HTTP 码并解析 JSON 里
 * 是否有 tag_name（githubproxy.cc 会回自己的首页 HTML，HTTP 200 但不是
 * 有效响应，必须挡掉）。
 *
 * 注意 ucode 的 system() 不返回 stdout，只能让 shell 把结果 -o 落文件，
 * 再用 readfile() 读回来；每次尝试前必须删掉临时文件，否则 curl 解析
 * 失败时可能读到上一轮的残留结果（假成功）。
 */
import { readfile, writefile } from 'fs';

const API = 'https://api.github.com/repos/lai-art/sy108-mainline/releases/latest';

const NODES = [
	{ key: 'direct',         url: '' },
	{ key: 'gh-proxy.com',   url: 'https://gh-proxy.com/' },
	{ key: 'ghproxy.net',    url: 'https://ghproxy.net/' },
	{ key: 'githubproxy.cc', url: 'https://githubproxy.cc/' }
];

function _rd(path) {
	return readfile(path) ?? '';
}

/* 正文落 .out，-w 的元数据重定向到 .meta。之前把 -o 和 -w 写进同一个
 * 文件，-o 只装正文，%{http_code} 进了 stdout 又被丢弃，读到的是空串 → int()=NaN。 */
const PROBE_OUT = '/tmp/.udx-ota-probe.out';
const PROBE_META = '/tmp/.udx-ota-probe.meta';

function probe_one(node) {
	let target = node.url + API;
	let cmd = sprintf(
		"rm -f %s %s; curl -sS -L -m 6 " +
		  "-H 'Accept: application/vnd.github+json' -H 'User-Agent: sy108-ota' " +
		  "-o %s -w '%%{http_code} %%{time_total}' '%s' > %s 2>/dev/null",
		PROBE_OUT, PROBE_META, PROBE_OUT, target, PROBE_META);
	try { system(cmd); } catch (e) { }

	let meta = trim(_rd(PROBE_META));
	let parts = split(meta, ' ');
	let code = (length(parts) > 0) ? int(parts[0]) : 0;
	let ms = 0;
	if (length(parts) > 1) {
		/* curl 的 %{time_total} 是 "1.234567" 这种小数秒字符串。ucode 没有
		 * number()，int("1.234") 也不行；用 split('.') 取整数和小数前三位
		 * 自己拼出毫秒整数：1.234567 -> 1234。 */
		let d = split(parts[1], '.');
		if (length(d) > 0) {
			let frac = (length(d) > 1) ? substr(sprintf('%s000', d[1]), 0, 3) : '000';
			ms = int(d[0]) * 1000 + int(frac);
		}
	}
	let ok = false, note = null;
	let body = _rd(PROBE_OUT);
	if (code == 200) {
		let j = null;
		try { j = json(body); } catch (e) { j = null; }
		if (type(j) == 'object' && j?.tag_name != null)
			ok = true;
		else
			note = '返回非JSON';
	} else if (code == 0) {
		note = '连接失败';
	} else {
		note = sprintf('HTTP %d', code);
	}

	return { code: code, ms: ms, ok: ok, note: note };
}

function ota_probe() {
	http.prepare_content('application/json; charset=UTF-8');
	let results = {};
	let best = null, best_ms = 0;

	for (let n in NODES) {
		let r = probe_one(n);
		results[n.key] = r;
		if (r.ok && (best == null || r.ms < best_ms)) {
			best = n.key;
			best_ms = r.ms;
		}
	}

	try { system(sprintf('rm -f %s %s', PROBE_OUT, PROBE_META)); } catch (e) { }

	http.write_json({ ok: true, results: results, best: best });
}

return {
	ota_probe: ota_probe
};
