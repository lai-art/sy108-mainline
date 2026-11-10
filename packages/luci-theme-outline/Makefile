SCAN_DEPS := ../source.mk
SY108_RECIPE_DIR := $(dir $(realpath $(lastword $(MAKEFILE_LIST))))
include $(TOPDIR)/rules.mk
PKG_NAME:=luci-theme-outline
PKG_VERSION:=1.3.1
PKG_RELEASE:=20261102
PKG_LICENSE:=Apache-2.0
SY108_SOURCE_PATHS := packages/luci-theme-outline
include $(SY108_RECIPE_DIR)../source.mk
include $(INCLUDE_DIR)/package.mk

Build/Prepare = $(call SY108/Prepare,$(PKG_BUILD_DIR))

define Package/luci-theme-outline
  SECTION:=luci
  CATEGORY:=LuCI
  TITLE:=luci-theme-outline for LuCI
  DEPENDS:=+luci-base +rpcd-mod-ucode +ucode-mod-fs +ucode-mod-uci +uclient-fetch +jsonfilter
endef

define Build/Compile
	po2lmo $(PKG_BUILD_DIR)/packages/luci-theme-outline/po/zh_Hans/luci-theme-outline.po $(PKG_BUILD_DIR)/luci-theme-outline.zh-cn.lmo
endef

define Package/luci-theme-outline/install
	$(CP) $(PKG_BUILD_DIR)/packages/luci-theme-outline/root/. $(1)/
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/luci-theme-outline.zh-cn.lmo $(1)/usr/lib/lua/luci/i18n/
endef

$(eval $(call BuildPackage,luci-theme-outline))
