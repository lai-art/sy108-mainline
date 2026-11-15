SCAN_DEPS := ../source.mk
SY108_RECIPE_DIR := $(dir $(realpath $(lastword $(MAKEFILE_LIST))))
include $(TOPDIR)/rules.mk
PKG_NAME:=luci-theme-mwrt
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0
SY108_SOURCE_PATHS := packages/luci-theme-mwrt
include $(SY108_RECIPE_DIR)../source.mk
include $(INCLUDE_DIR)/package.mk

Build/Prepare = $(call SY108/Prepare,$(PKG_BUILD_DIR))

# Empty on purpose — do NOT delete this block.
#
# include/package.mk ships a default Build/Compile that runs
#   $(MAKE) -C $(PKG_BUILD_DIR)/
# This package is pure resources (ucode templates + css/js); SY108/Prepare lays
# the sources out under $(PKG_BUILD_DIR)/packages/luci-theme-mwrt/ and leaves no
# Makefile at the root of $(PKG_BUILD_DIR). Without this override make dies with
# "No targets specified and no makefile found", which is exactly how run #71
# failed. The other two themes in this repo (aurora, outline) never hit it
# because their po/ directories force a real Build/Compile (po2lmo).
define Build/Compile
endef

define Package/luci-theme-mwrt
  SECTION:=luci
  CATEGORY:=LuCI
  TITLE:=luci-theme-mwrt for LuCI
  DEPENDS:=+luci-base +rpcd-mod-ucode +ucode-mod-fs +ucode-mod-uci +uclient-fetch +jsonfilter
endef

define Package/luci-theme-mwrt/install
	$(CP) $(PKG_BUILD_DIR)/packages/luci-theme-mwrt/root/. $(1)/
endef

$(eval $(call BuildPackage,luci-theme-mwrt))
