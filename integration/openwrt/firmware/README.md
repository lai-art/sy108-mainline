# Firmware embedded into the kernel image

`config-7.3` embeds these blobs through `CONFIG_EXTRA_FIRMWARE`, so they are
compiled into the kernel instead of being loaded from the rootfs. The mt76
driver is built in (`CONFIG_MT7921U=y`) and requests its firmware during probe,
which happens before the squashfs root is mounted — a rootfs copy would come too
late.

Recovery inherits the setting, because `config-recovery` is *appended* to
`LINUX_KCONFIG_LIST` rather than replacing `config-7.3` (see
`target/linux/sprd/Makefile`). Recovery keeps `CONFIG_USB_DWC3_GADGET=y`, so the
card can never enumerate there and the blobs are dead weight of roughly 870 KB.
Adding `# CONFIG_CFG80211 is not set` and `CONFIG_EXTRA_FIRMWARE=""` to
`config-recovery` would drop them; that is deliberately left to its own change,
since it needs a recovery build to prove the saving.

`CONFIG_EXTRA_FIRMWARE_DIR` points at `/project/integration/openwrt/firmware`,
i.e. this directory as bind-mounted into the build container. See
`tools/lib/workspace.py`. Keeping the blobs outside the kernel source tree means
`manifests/kernel.json` and the kernel archive sha256 stay untouched.

## mediatek/ — MT7921AU (BL-M7921AU1)

| File | Size | Source |
|---|---:|---|
| `WIFI_RAM_CODE_MT7961_1.bin` | 792036 | linux-firmware `mediatek/` |
| `WIFI_MT7961_patch_mcu_1_2_hdr.bin` | 92192 | linux-firmware `mediatek/` |

These are the only two files the MT7921U driver reads
(`mt792x.h`: `MT7921_FIRMWARE_WM` / `MT7921_ROM_PATCH`). The `1a` variants are
the MT7920 flavour, and the MT7925 / rtw88 blobs are not used, so they are
deliberately not carried.

Upstream: <https://git.kernel.org/pub/scm/linux/kernel/git/firmware/linux-firmware.git/tree/mediatek>
Licence: proprietary MediaTek firmware, redistributed under
`LICENCE.mediatek` from linux-firmware.

## regulatory.db

Regulatory database, built from wireless-regdb. `regulatory.db.p7s` is not
carried because `CONFIG_CFG80211_REQUIRE_SIGNED_REGDB` is off — with the
signature check disabled cfg80211 never requests the detached signature, and an
unused file in `CONFIG_EXTRA_FIRMWARE` would only fail the build if it went
missing.

Upstream: <https://git.kernel.org/pub/scm/linux/kernel/git/sforshee/wireless-regdb.git>
Licence: ISC (see the upstream `LICENCE` file).
