# luci-app-udx-home

SY108 的「首页」——把 mwrt 固件的 `admin/modeminfo` 概览页移植过来。

## 1. 来源与结构

原页面是 mwrt 固件里的 `/usr/lib/lua/luci/view/zmode/modem_info.htm`（734,729 B），
由 `modem.lua:6` 注册：

```lua
entry({"admin", "modeminfo"}, template("zmode/modem_info"), _("首页"), 2).dependent = false
```

拆解结果（总 645,715 字符）：

| 部分 | 字符 | 去向 |
|---|---|---|
| 内联 `<style>` | 285,081 | `mwrt-home.css`（零 Lua 插值，原样搬） |
| 内联 `<script>` 14 块 | 308,359 | `mwrt-home.js`（55 处插值已替换为常量，残留 0） |
| HTML 骨架 | 52,252 | `template/udx_home/index.ut`（36 个 Lua 块已转 ucode） |

**关键判断依据**：Lua 只占 6,822 字符（1.06%），且基本都是 `build_url()` 生成接口地址。
98.9% 是纯静态 CSS/JS，所以移植方式是「拆静态 + 换接口层」，不是重写页面。

## 2. 为什么用 `template` 而不是 `view`

SY108 的 LuCI 25.12.6 常规做法是 `menu.d` 里 `"type": "view"` + 前端 JS（`view.extend`）。
但本页面是 52 KB 的服务端渲染 HTML 骨架，转成前端 `E()` 调用不现实。

已核实 SY108 镜像里的 `dispatcher.uc` 支持 `case 'template':`：

```ucode
case 'template':
    if (runtime.is_ucode_template(action.path))
        runtime.render(action.path, {});      // .ut 优先走 ucode
    else
        render_action(() => { runtime.call('luci.dispatcher', 'render_lua_template', action.path); });
```

所以 `menu.d` 里用 `{"type":"template","path":"udx_home/index"}`，
模板落在 `/usr/share/ucode/luci/template/udx_home/index.ut`。

## 3. 接口层：当前全部是空实现

原页面调用 42 个 mwrt 私有后端（`admin/fancontrol/*`、`admin/modem/*`、`admin/display/*`），
SY108 一个都没有。`controller/udx_home.uc` 注册了同名路由，**全部返回空 JSON**：

- 只读接口（19 个）→ `{ json: {} }`
- 写/控制接口（20 个）→ `{ json: { ok: false, unsupported: true } }`
- 通配兜底（`/fancontrol/*`、`/mwrtrepair/*`、`devimg_*/*`）→ `{ json: {} }`

**这样做的目的**：前端 `XHR.get` 拿到合法 JSON 而不是 404/HTML，轮询不会中断，
页面骨架、动画、3D 图、猫都能正常渲染，数字位显示默认值。

**尚未接线的数据**（需逐个实现，来源已勘察）：

| 数据 | SY108 可取处 |
|---|---|
| CPU / 内存 / 负载 | `/proc/stat`、`/proc/meminfo`、`/proc/loadavg` |
| 温度 | `udx.status` 的 `thermal` 字段（`device.c:311`，已除 1000） |
| WAN/LAN 速率 | `/proc/net/dev` + netifd |
| 蜂窝信号 / SIM | `udx.cellular.status` |
| 出口 IP | WAN 接口地址 |
| 在线设备 / 连接数 | DHCP leases、`/proc/net/nf_conntrack` |

**永远不会有对应实现的**（mwrt 硬件/平台特性，本移植明确不做）：

- `admin/display/*`（NV3007 屏、亮度）——SY108 无此屏，`screen_ok=false` 已让整块不渲染
- `admin/modem/audio_*`（音频播放/麦克风）——无此硬件
- `admin/modem/camframe|camstart|camstop`（摄像头）——无此硬件
- HNAT 硬件加速卡片——MTK 特性，展锐平台没有（用户明确不要）

## 4. 资源清单

| 文件 | 大小 | 说明 |
|---|---|---|
| `www/luci-static/mwrt/mwrt-home.css` | 318,856 | 首页样式（UTF-8，285,081 字符） |
| `www/luci-static/resources/mwrt-home.js` | 353,825 | 首页主逻辑（306,884 字符） |
| `www/luci-static/resources/mwrt-topo.js` | 107,208 | 网络拓扑 |
| `www/luci-static/resources/mwrt-topo-art.js` | 89,560 | 拓扑绘制库 |
| `www/luci-static/resources/mwrt-catcage.js` | 87,505 | 猫笼逻辑 |
| `www/luci-static/resources/mwrt-cat-art.js` | 263,552 | 猫绘制库（与主题包内同名文件重复一份，为解除对主题包的依赖） |
| `www/luci-static/resources/mwrt-notice.js` | 52,487 | 通知 |
| `www/luci-static/resources/mwrt-portsw.js` | 61,497 | 网口 WAN/LAN 切换 |
| `www/luci-static/resources/mwrt-wizard-launch.js` | 4,144 | 向导启动 |
| `www/luci-static/router3d/tr3000.png` | 192,623 | 3D 整机图 |
| `www/fontawesome/` | 243,286 | FontAwesome 6（CSS + 3 个 woff2），SY108 原本没有，首页用了 58 种图标 |

整包约 1.84 MB。

## 5. 已知限制

- **3D 图是 Cudy TR3000 的外形**（用户决定先这样，后续换 SY108 实物图）。换图只需替换
  `router3d/tr3000.png` 并保持文件名，或改 `index.ut` 里的 `dev_img`。
- **数据全空**：所有接口返回空对象，界面数字位显示默认值。不是 bug，是当前阶段。
- **未真机验证**：模板语法、资源路径、接口路由均只做了静态核对。
- **`admin/modeminfo` 占用了 order 2 的一级菜单位**，与 mwrt 一致。若与现有菜单冲突需调整。
