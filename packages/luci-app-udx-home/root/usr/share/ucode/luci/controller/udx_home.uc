'use strict';

/* luci-app-udx-home —— 「首页」(admin/modeminfo) 的全部后端接口。
 *
 * 这些接口原本是 mwrt 的 Lua controller（admin/fancontrol/*、admin/modem/*、admin/display/*），
 * SY108 没有 Lua 运行时，也无法直接复用它们的实现，因此在这里重建。
 *
 * 当前阶段：界面优先。所有接口先返回空对象，让前端 JS 拿到合法 JSON 而不报错，
 * 页面骨架、动画、3D 图、猫都能正常渲染，数字位显示为默认值/「--」。
 * 后续逐个替换为真实实现（数据来源：/proc、/sys、udx.status / udx.cellular.status 等 ubus 对象）。
 *
 * 返回格式遵循 LuCI ucode 的 action 协议：return { json: <对象> }。
 */

/* ---------- 只读查询 ---------- */
function fancontrol_devinfo() {
	return { json: {} };
}

function fancontrol_devpop() {
	return { json: {} };
}

function fancontrol_memfree() {
	return { json: {} };
}

function fancontrol_modem_ctrl() {
	return { json: {} };
}

function modem_audio_state() {
	return { json: {} };
}

function modem_audio_wave() {
	return { json: {} };
}

function modem_camframe() {
	return { json: {} };
}

function modem_lan_get() {
	return { json: {} };
}

function modem_modem_present() {
	return { json: {} };
}

function modem_simslots() {
	return { json: {} };
}

function modem_simstat() {
	return { json: {} };
}

function modem_topo_data() {
	return { json: {} };
}

function modem_wan_get() {
	return { json: {} };
}

function modem_wifi_get() {
	return { json: {} };
}

function modem_wlbridge_status() {
	return { json: {} };
}

function modem_qmodem_get_modem_cfg() {
	return { json: {} };
}

function modeminfo_cellx() {
	return { json: {} };
}

function display_status() {
	return { json: {} };
}

function network_mwrt_assurance_status() {
	return { json: {} };
}

/* ---------- 写入/控制（当前均为空实现，前端调用不会 404） ---------- */
function fancontrol_fanswj() {
	return { json: { ok: false, unsupported: true } };
}

function modem_audio_ctl() {
	return { json: { ok: false, unsupported: true } };
}

function modem_audio_del() {
	return { json: { ok: false, unsupported: true } };
}

function modem_audio_mic() {
	return { json: { ok: false, unsupported: true } };
}

function modem_audio_mute() {
	return { json: { ok: false, unsupported: true } };
}

function modem_audio_play() {
	return { json: { ok: false, unsupported: true } };
}

function modem_audio_upload() {
	return { json: { ok: false, unsupported: true } };
}

function modem_audio_vol() {
	return { json: { ok: false, unsupported: true } };
}

function modem_camstart() {
	return { json: { ok: false, unsupported: true } };
}

function modem_camstop() {
	return { json: { ok: false, unsupported: true } };
}

function modem_lan_set() {
	return { json: { ok: false, unsupported: true } };
}

function modem_simset() {
	return { json: { ok: false, unsupported: true } };
}

function modem_wan_set() {
	return { json: { ok: false, unsupported: true } };
}

function modem_wifi_set() {
	return { json: { ok: false, unsupported: true } };
}

function modem_wlbridge_join() {
	return { json: { ok: false, unsupported: true } };
}

function modem_wlbridge_leave() {
	return { json: { ok: false, unsupported: true } };
}

function modem_wlbridge_scan() {
	return { json: { ok: false, unsupported: true } };
}

function display_set_screen() {
	return { json: { ok: false, unsupported: true } };
}

function display_set_brightness() {
	return { json: { ok: false, unsupported: true } };
}

function display_screenshot() {
	return { json: { ok: false, unsupported: true } };
}

/* ---------- 通配入口 ---------- */
/* 前端用 'fancontrol 基址 + /<action>' 的形式调用（如 /fancontrol/fan、/fancontrol/swj），
   这里统一兜底，返回空对象，避免 404 打断前端轮询。 */
function fancontrol_wildcard() {
	return { json: {} };
}

function mwrtrepair_wildcard() {
	return { json: {} };
}

function devimg_upload() {
	return { json: { ok: false, unsupported: true } };
}

function devimg_reset() {
	return { json: { ok: false, unsupported: true } };
}
