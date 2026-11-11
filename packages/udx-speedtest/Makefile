SCAN_DEPS := ../source.mk
SY108_RECIPE_DIR := $(dir $(realpath $(lastword $(MAKEFILE_LIST))))
include $(TOPDIR)/rules.mk
PKG_NAME:=udx-speedtest
PKG_VERSION:=1.0
PKG_RELEASE:=1
PKG_LICENSE:=GPL-2.0-only
SY108_SOURCE_PATHS := packages/udx-speedtest
include $(SY108_RECIPE_DIR)../source.mk
include $(INCLUDE_DIR)/package.mk

Build/Prepare = $(call SY108/Prepare,$(PKG_BUILD_DIR))

define Package/udx-speedtest
  SECTION:=net
  CATEGORY:=Network
  TITLE:=SY108 on-device download runner for the speed test and traffic burner tabs
  DEPENDS:=+libjson-c +libubox +libubus +libblobmsg-json +libuci +curl +procd
endef

define Package/udx-speedtest/conffiles
/etc/config/udx-speedtest
endef

define Build/Compile
	$(TARGET_CC) $(TARGET_CPPFLAGS) $(TARGET_CFLAGS) -std=c11 -Wall -Wextra \
	 $(PKG_BUILD_DIR)/packages/udx-speedtest/src/speedtestd.c \
	 $(TARGET_LDFLAGS) -lubus -lubox -lblobmsg_json -ljson-c -luci -lm \
	 -o $(PKG_BUILD_DIR)/udx-speedtestd
endef

define Package/udx-speedtest/install
	$(INSTALL_DIR) $(1)/usr/sbin $(1)/etc/init.d $(1)/etc/config
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/udx-speedtestd $(1)/usr/sbin/
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/packages/udx-speedtest/files/etc/init.d/udx-speedtest $(1)/etc/init.d/
	$(INSTALL_CONF) $(PKG_BUILD_DIR)/packages/udx-speedtest/files/etc/config/udx-speedtest $(1)/etc/config/
endef
$(eval $(call BuildPackage,udx-speedtest))
