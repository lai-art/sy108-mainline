# luci-theme-mwrt

SY108 自研主题包（打包与集成骨架）。主题名 `Mwrt`，media = `/luci-static/mwrt`。

## 1. 包内容与目录树

```
packages/luci-theme-mwrt/
├── Makefile                          OpenWrt 包配方
├── README.md                         本文件
├── FEATURES.md                      16 个 mwrt 功能的移植状态表
└── root/
    ├── etc/uci-defaults/
    │   └── 99_luci-theme-mwrt       注册主题 + mediaurlbase
    ├── usr/share/ucode/luci/template/themes/mwrt/
    │   ├── header.ut                580 行，全站头模板（含静态资源接线）
    │   ├── footer.ut                页脚 / 菜单渲染
    │   └── sysauth.ut               登录页
    ├── www/luci-static/resources/    公共资源目录（L.require 解析处）
    │   ├── menu-mwrt.js             22,654 B，导航渲染（含 Ctrl+K 面板）
    │   └── router-mwrt.js           15,771 B，前端路由 + 页面切换
    └── www/luci-static/mwrt/
        ├── main.css                 185,262 B，aurora 原版 main.css（逐字节相同）
        ├── mwrt-chrome.css          205,598 B，mwrt 皮肤层（全站）
        ├── mwrt-buttons.css         按钮悬停态（从 full.css 抽出）
        ├── mwrt-sidebar.css         侧边栏深色皮肤（映射到 aurora 变量）
        ├── mwrt-boot.js             75,896 B，深色模式 + 功能 DOM 生成
        ├── mwrt-login.css / .js     登录页独立样式与脚本
        ├── mwrt-cat-art.js          263,552 B，首页猫图
        ├── mwrt-unlock.js           39,690 B
        ├── fonts/                   Lato woff2 + @font-face
        ├── images/                  logo / svg / favicon / PWA 图标
        └── patches/                 10 个按页面加载的微调（合计 12 KB）
```

- `Makefile`：`PKG_NAME=luci-theme-mwrt`、`PKG_VERSION=1.0.0`；`DEPENDS` 与 `packages/luci-theme-aurora/Makefile:18` 一致，另加 `ucode-mod-fs`（header.ut 用 `readfile`/`lsdir`）与 `jsonfilter`。本包无 po 翻译文件，故不含 `po2lmo` 段。
- `root/etc/uci-defaults/99_luci-theme-mwrt`：首次安装时注册 `luci.themes.Mwrt=/luci-static/mwrt` 与 `luci.main.mediaurlbase=/luci-static/mwrt`，并写入 6 项 `mwrt.theme.*` 默认值；`PKG_UPGRADE=1` 时整段跳过，不覆盖用户已选主题。
  **必须用 `99_` 前缀，不能改成 `30_`**：`/etc/uci-defaults/` 的脚本在首启时按**字典序**依次执行、执行完即删除，三个主题都写 `luci.main.mediaurlbase`，**最后执行的赢**。用 `30_` 时顺序是 `30_luci-theme-aurora` < `30_luci-theme-mwrt` < `30_luci-theme-outline`，outline 会盖掉 mwrt，新刷的机器开机还是 outline。`99_` 排在全部 `30_` 之后（也排在 `99-sy108-ports` 之后，因为 `-`(0x2D) < `_`(0x5F)）。此结论经 run #72 的 rootfs 实测验证：三个主题脚本确实位于第 11/12/13 条，顺序如上述。
- `README.md`：本文件。

## 2. 构建系统如何扫描到本包（已核实，非推测）

`integration/openwrt/feeds.conf` 全文只有 5 行 `src-git`（`integration/openwrt/feeds.conf:1-5`），**没有** `src-link`；业务仓库 `packages/` 不由该文件静态注册。实际注册链路：

| 步骤 | 文件:行号 | 原文 / 作用 |
|---|---|---|
| 业务仓库以只读 bind mount 挂到容器 `/project` | `tools/lib/workspace.py:56` | `--mount type=bind,source={PROJECT},target=/project,readonly`（`PROJECT` 定义于 `tools/lib/workspace.py:7`） |
| 构建树 `feeds.conf` 追加本地 feed | `tools/bootstrap.py:70` | `(tree / 'feeds.conf').write_text((integration / 'feeds.conf').read_text() + '\nsrc-link sy108 /project/packages\n')` → 把 `packages/` 注册为名为 `sy108` 的 feed，feed 路径 `/project/packages` |
| 索引全部 feed | `tools/bootstrap.py:72` | `./scripts/feeds update -a` |
| 安装（symlink）全部包 | `tools/bootstrap.py:73` | `./scripts/feeds install -a` |
| 清除 `tmp/` 增量扫描状态，强制重扫 | `tools/bootstrap.py:74-92` | 跨 `:77-80` 的注释（去行首 `# ` 并拼接）`a package newly added under packages/ is invisible to Kconfig: its CONFIG_PACKAGE_<name>=y line is silently dropped`；删除 `tmp/.packageinfo`、`tmp/.packagedeps`、`tmp/.config-package.in`、`tmp/.config-feeds.in` 与 `tmp/info` |
| 复制 profile config 并生成 Kconfig 符号 | `tools/build/firmware.py:44-45` | `shutil.copyfile(PROJECT / f'configs/openwrt-{a.profile}.config', tree / '.config')`；`run(['make', 'defconfig', *common])` |
| 容器内 feed 落地路径（旁证） | `tools/build/firmware.py:50` | `package/feeds/sy108/sy108-image/host/compile` |
| CI 缓存与包存活校验 | `.github/workflows/build-firmware.yml:105`、`:185-202` | `:105` 缓存 key 原文 `key: sy108-v3-${{ matrix.profile }}-${{ hashFiles('manifests/*.json', 'integration/openwrt/**', 'integration/openwrt/target/linux/sprd/patches-7.3/*.patch', 'packages/**', 'configs/**', 'tools/**') }}`（含 `packages/**`）；`:191-199` 的 `Verify requested packages survived defconfig` 逐个比对 `CONFIG_PACKAGE_*=y` |

### `SCAN_DEPS` 与 `SY108_SOURCE_PATHS` 的作用（已核实）

- 本包 `Makefile:1` `SCAN_DEPS := ../source.mk`（仿 `packages/luci-theme-aurora/Makefile:1`）：OpenWrt 扫描该 Makefile 时把 `../source.mk` 一并纳入依赖。
- 本包 `Makefile:8` `SY108_SOURCE_PATHS := packages/luci-theme-mwrt` 与 `Makefile:9` `include $(SY108_RECIPE_DIR)../source.mk`（仿 `packages/luci-theme-aurora/Makefile:8-9`）。
- `packages/source.mk:6` `PKG_FILE_DEPENDS += $(addprefix $(SY108_PROJECT_DIR)/,$(SY108_SOURCE_PATHS))`：把该路径登记为包文件依赖（`SY108_PROJECT_DIR` 定义于 `packages/source.mk:4`）。
- `packages/source.mk:8-11` `define SY108/Prepare`、`:10` `rsync -a ... $(SY108_PROJECT_DIR)/$(path) $(1)/$(dir $(path))`：在 `Build/Prepare`（本包 `Makefile:12` `$(call SY108/Prepare,$(PKG_BUILD_DIR))`）时把业务仓库的 `packages/luci-theme-mwrt` 复制进 `PKG_BUILD_DIR`，供 `Package/.../install` 的 `$(CP)` 取用。

## 3. 静态资源加载接线（已验收）

### 3.1 加载点

| 资源 | 模板位置 | 形式 | 门控 |
|---|---|---|---|
| `mwrt-chrome.css` | `header.ut:199` | `<link>`，紧跟 `main.css` 之后 | `!blank_page`（在 `{% else %}` 分支内） |
| `mwrt-buttons.css` | `header.ut:209` | `<link>`，此后 | 同上 |
| `mwrt-sidebar.css` | `header.ut:211` | `<link>`，再后 | `!blank_page` **且** `nav_type == 'sidebar'` |
| `mwrt-boot.js` | `header.ut:265` | `<script>`，**无 `defer`**，`<body>` 内第一个 | `!blank_page` |

顺序语义（照抄原固件 `install-aurora-skin.sh` 的设计意图）：`main.css` → `mwrt-chrome.css`（皮肤层）→ `mwrt-buttons.css`（悬停态）→ 按页面 `patches/*.css`（单页微调，最后加载以覆盖通用皮肤）。

### 3.2 为什么这三个文件不放 `patches/`

SY108 的 `header.ut:31-45` 采用**按需加载**：扫 `/www${media}/patches` 目录，文件名（去扩展名）必须命中 `ctx.request_path` 的某级前缀（`seg_prefixes`）才会输出；不命中就静默跳过，无告警。

`patches/` 里现存的 10 个文件都符合这个命名规则（如 `admin-dashboard.css` → 命中路径 `admin/dashboard`），合计仅 12,179 B，其中 6 个对应的插件（qmodem / openclash / diskman / filemanager）SY108 未安装，永不会命中但保留无损。

而 `mwrt-chrome.css` 与 `mwrt-boot.js` 是**全站**皮肤与启动脚本，没有任何页面前缀能覆盖它们，放进 `patches/` 永远不会被加载。故移到 `mwrt/` 根目录，由 `header.ut` 显式输出。

### 3.3 为什么不加载 `mwrt-aurora-full.css`（143,594 B）

该表是「在 argon 上叠加 aurora 样式」的产物，577 条选择器里 **552 条（95.7%）与 `main.css` 逐条重复**——本主题本身就是 aurora 派生，整份加载纯属冗余。独有内容只有 5 组按钮悬停态（`main.css` 里没有任何 `.cbi-button:hover` 规则），已抽成 `mwrt-buttons.css` 单独提供。原文件未纳入包内。

### 3.4 皮肤层的生效面（实测）

`mwrt-chrome.css` 共 688 个规则块：

- **504 条永不命中** —— 选择器指向 argon 专有 DOM（`.main-left` / `.main-right` / `.sidenav` / `.slide-menu` / `.main-menu` / `.nav-bar` / `.userbox`）。已核实这些类在 aurora 的 `main.css` 里**零定义**，本主题模板也不输出，故静默失效，无副作用。
  其中 **205 条是侧边栏规则**（`.main-left` 相关，86 条含配色）。选定 `sidebar` 形态后，这批规则对应的 aurora DOM 是 `.sidebar-panel`，对不上。补救方式不是重写 205 条，而是用 `mwrt-sidebar.css` 覆盖 aurora 侧边栏消费的那 10 个 CSS 变量（`--bg` / `--text` / `--text-muted` / `--text-subtle` / `--hairline` / `--hover-faint` / `--brand` 系列），作用域限定在 `.sidebar-panel-inner`，已核实这些正是 `main.css` 里 `.sidebar-panel-inner` / `.sidebar-head` / `.sidebar-footer` / `.nav-row` 的取值来源。
- **184 条会命中**，其中 42 条涉及布局属性且带 `!important`。逐条核查后全部安全：
  - 绝大多数是 mwrt 自有 DOM 的样式（`#mwrt-about-btn`、`#mwrt-theme-fab`、`.mwrt-tb-ic`）与通用控件统一（`h1`/`h2`/`.cbi-tabmenu`/`#maincontent td`）。`mwrt-boot.js:761,768,1038` 确实会创建这些元素，属**必需**。
  - `html.mwrt-bd-*`（3 条）与 `#mwrt-sb-toggle`（5 条）是旧版遗留死选择器：`mwrt-bd-` 在脚本中零引用（外框改为内联 `setProperty`），`#mwrt-sb-toggle` 无人创建。
  - `body:has(> .main > .main-left)` 那组外框规则（5px padding + 圆角卡片）有 `:has()` 守卫，aurora 无 `.main-left`，**永不匹配**。
  - `mwrt-capsule` 只在用户手动选「胶囊主题」时由 `mwrt-boot.js:234` 加类，默认不加。
  - **唯一已知缺陷**：`body[data-page="admin-status-iptables"]` 与 `admin-network-wireless` 两组规则硬编码浅色（`#fbfcfe` / `#2a3444` / `#f3f6fa`），深色模式下这两页会是白底。

### 3.5 登录页不加载皮肤层与 boot.js

`sysauth.ut` 走 `blank_page` 分支，只引 `mwrt-login.css` / `mwrt-login.js`。这与原固件行为一致——原固件的注入点在**全局** `header.ut`，而登录页由主题自己的 `sysauth.ut` 渲染、不经过全局模板，天然不加载。注意两套深色偏好键互不相通：登录页用 `localStorage 'mwrt-theme'`，后台 `header.ut:108-117` 仍用 `localStorage 'aurora.theme'`。

### 3.6 主题切换按钮的落点（已核实）

`mwrt-boot.js:753-772` 的 `setupThemeBtn()` 尝试三处插入：

1. `#indicators` 的父节点 → **命中**（`header.ut:295` 有 `<div id="indicators">`，位于 `<header>` 内）
2. `document.body` 下追加 `#mwrt-theme-fab` → 总是创建
3. `.main .main-left` → 不命中（aurora 无此元素）

配合 `mwrt-chrome.css:2703-2730` 的响应式规则：`≥769px` 隐藏 header 内那枚、显示悬浮钮；`≤768px` 反之。**两种尺寸各恰好一枚，无重复无缺失。**

### 3.7 导航模块解耦（`menu-mwrt` / `router-mwrt`）

`footer.ut:37` 的 `L.require('menu-aurora')` 是**整个导航菜单的渲染入口**——`renderSidebar` / `renderMainMenu` / `renderPalette` / `syncRoute` 全在里面。原样保留会形成对 `luci-theme-aurora` 包的**隐性依赖**：只要哪天不装 aurora，菜单就渲染不出来。

处理方式：把 aurora 的两个模块复制进本包、改名后装到公共资源目录 `/www/luci-static/resources/`，`footer.ut` 改 `L.require('menu-mwrt')`。

| 文件 | 改动 |
|---|---|
| `router-mwrt.js` | **内容一字未改**（已核实文件内零 `aurora`/`device` 引用，纯通用路由逻辑） |
| `menu-mwrt.js` | 4 个存储键 + 1 组值域：`aurora.paletteRecents`→`mwrt.paletteRecents`、`aurora.nav`→`mwrt.nav`、`aurora.sidebarCollapsed`→`mwrt.sidebarCollapsed`、`localStorage "aurora.theme"\|\|"device"`→`"mwrt-theme"\|\|"light"`、palette 三档 `["device",…]`→`["auto",…]` |

因为文件名不同，与 aurora 包装到同一目录**不冲突**（`menu-aurora.js` 与 `menu-mwrt.js` 并存）。`window.auroraCrumb` 这个函数名保持原样——它定义在本包 `header.ut:363`，两边一致即可。

配套统一了三个模板侧存储键：`mwrt.nav`（sessionStorage，导航预渲染缓存）、`mwrt.toolbarCollapsed`、`mwrt.sidebarCollapsed`。**关键点**：`menu-mwrt.js` 写 `mwrt.nav`，模板 `header.ut:117/376` 若仍读写 `aurora.nav`，缓存就会永远 miss、预渲染失效。

### 3.8 功能 JS 的接线状态（2 搬入 / 14 未搬）

已搬入包内的两个 mwrt 功能脚本，**均未接线**，原因不同：

| 脚本 | 状态 | 原因（已核实） |
|---|---|---|
| `mwrt-unlock.js` 39,690 B | **不能接线** | `:26` `var URL_ = me.getAttribute('data-url')`，无值即 `return`（no-op）。该 URL 指向 mwrt 私有后端 `fancontrol.lua` 的 `action_Outofnetwork`（`:8`/`:330`），SY108 无此后端，无处可取 URL。属 L3 后端依赖。 |
| `mwrt-cat-art.js` 263,552 B | **待用库** | 文件头自述「纯绘制函数，不碰 DOM」，导出 `window.MwrtCatArt`。它是被 `mwrt-catcage.js`（未搬）调用的美术库，本身不需要接线。全包检索无任何调用方。 |

## 4. 如何启用

1. 往 `configs/openwrt-main.config` 加入一行：

   ```
   CONFIG_PACKAGE_luci-theme-mwrt=y
   ```

   参考位置：现有两个主题在 `configs/openwrt-main.config:24-25`（`CONFIG_PACKAGE_luci-theme-outline=y`、`CONFIG_PACKAGE_luci-theme-aurora=y`）；新包符号当前在 `configs/` 下 0 命中。
2. `tools/build/firmware.py:44` 把该 profile config 复制为构建树 `.config`，`make defconfig`（`:45`）按第 2 节链路扫描生成 `CONFIG_PACKAGE_luci-theme-mwrt`；`tools/bootstrap.py:70-73` 的 `src-link sy108` feed 使新 Makefile 被 `feeds update -a` / `feeds install -a` 索引并 symlink。
3. 新增本包会改变 `.github/workflows/build-firmware.yml:105` 缓存 key 中的 `packages/**` 哈希，触发缓存失效与重新扫描；`tools/bootstrap.py:74-92` 额外清除 `tmp/` 扫描状态，避免 `CONFIG_PACKAGE_luci-theme-mwrt=y` 被旧索引丢弃。

**当前 `configs/` 未做任何改动**（`git -c http.sslBackend=schannel status --short configs/` 输出为空）。

## 5. 如何回退

- 构建侧：从 `configs/openwrt-main.config` 删除 `CONFIG_PACKAGE_luci-theme-mwrt=y` 这一行。
- 设备侧（运行时切回 Aurora）：

  ```sh
  uci set luci.main.mediaurlbase=/luci-static/aurora && uci commit luci
  ```

  `luci.main.mediaurlbase` 的现有取值来源：`packages/luci-theme-aurora/root/etc/uci-defaults/30_luci-theme-aurora:7`、`packages/luci-theme-outline/root/etc/uci-defaults/30_luci-theme-outline:9`。

## 6. 已知限制

- **L3 后端功能未落地**：16 个 mwrt 功能 JS 里已搬 2 个（cat-art、unlock），其余 14 个依赖 mwrt 私有 ubus/rpcd 方法，见 `FEATURES.md`。
- **`nav_type` 已定为 `sidebar`**（`uci-defaults` 写入 `mwrt.theme.nav_type=sidebar`，模板 fallback 同为 `sidebar`）。侧边栏深色皮肤由 `mwrt-sidebar.css` 以变量覆盖方式提供，**未经真机验证**——变量消费点是按 `main.css` 反推的，实际观感需刷机确认。
- **`header.ut:20` 已改读 `uci.get_all('mwrt','theme')`**，`uci-defaults` 同步写入 6 项默认值（`nav_type=sidebar`、`toolbar_enabled=0`、`logo_svg`、`favicon_ico`、`pwa_apple_touch`、`icon_cache_version`）。`toolbar_item` 列表仍为空（无对应 UCI 段），故工具条默认关闭；令牌覆盖样式与背景 preload 需另配 `mwrt.theme.*` 变量才渲染。
- **深色偏好键已统一**到 `localStorage 'mwrt-theme'`（值域 `light|dark|auto`），登录页与后台共用一套；`header.ut` 额外监听 boot.js 派发的同名 `CustomEvent`，点悬浮钮时手机端三档切换器高亮会同步。
- **两个页面的深色模式缺陷**：`admin/status/iptables` 与 `admin/network/wireless` 的 patch 硬编码浅色。
- **14 个功能 JS 未搬**：见 `FEATURES.md`（16 个里已搬 2 个）。已搬两个的接线障碍详见 §3.8。
- **未真机验证**：模板语法、资源路径、皮肤冲突均只做了静态核对。

## 7. 状态

**「当前未加 config、未构建、未刷机、未推送」**
