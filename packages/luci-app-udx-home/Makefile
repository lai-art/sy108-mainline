SCAN_DEPS := ../source.mk
SY108_RECIPE_DIR := $(dir $(realpath $(lastword $(MAKEFILE_LIST))))
include $(TOPDIR)/rules.mk
PKG_NAME:=luci-app-udx-home
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0
SY108_SOURCE_PATHS := packages/luci-app-udx-home
include $(SY108_RECIPE_DIR)../source.mk
include $(INCLUDE_DIR)/package.mk

Build/Prepare = $(call SY108/Prepare,$(PKG_BUILD_DIR))

# Empty on purpose — do NOT delete this block.
#
# include/package.mk ships a default Build/Compile that runs
#   $(MAKE) -C $(PKG_BUILD_DIR)/
# This package is pure resources (ucode template/controller + css/js/png);
# SY108/Prepare lays the sources out under $(PKG_BUILD_DIR)/packages/<name>/
# and leaves no Makefile at the root of $(PKG_BUILD_DIR), so the default
# implementation would die with "No targets specified and no makefile found".
# This is exactly how run #71 failed for luci-theme-mwrt. See
# 经验与踩坑记录.md 坑 23.
define Build/Compile
endef

define Package/luci-app-udx-home
  SECTION:=luci
  CATEGORY:=LuCI
  TITLE:=SY108 mwrt-style home overview page
  DEPENDS:=+luci-base +rpcd-mod-ucode +ucode-mod-fs +ucode-mod-uci +jsonfilter
endef

define Package/luci-app-udx-home/install
	$(CP) $(PKG_BUILD_DIR)/packages/luci-app-udx-home/root/. $(1)/
endef

$(eval $(call BuildPackage,luci-app-udx-home))
