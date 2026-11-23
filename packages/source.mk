# SPDX-License-Identifier: GPL-2.0-only
# Prepare only this package's local sources; OpenWrt tracks their changes.
SY108_PACKAGE_DIR:=$(realpath $(dir $(lastword $(MAKEFILE_LIST))))
SY108_PROJECT_DIR:=$(realpath $(SY108_PACKAGE_DIR)/..)
# CI tag 构建显式传 SY108_BUILD_ID=<tag 名>，避免 git describe 在同一 commit
# 有多个 tag 时挑到旧 tag（实测 v2026.11.23 被 describe 成 v2026.11.19-14-g…）。
# 分支构建 / 本地构建传 auto（或没传），仍用 describe。
ifeq ($(SY108_BUILD_ID),auto)
  SY108_BUILD_ID:=$(shell git -C $(SY108_PROJECT_DIR) describe --always --dirty)
else ifeq ($(SY108_BUILD_ID),)
  SY108_BUILD_ID:=$(shell git -C $(SY108_PROJECT_DIR) describe --always --dirty)
endif
PKG_FILE_DEPENDS += $(addprefix $(SY108_PROJECT_DIR)/,$(SY108_SOURCE_PATHS))

define SY108/Prepare
	$(INSTALL_DIR) $(1)
	set -e; $(foreach path,$(SY108_SOURCE_PATHS),$(INSTALL_DIR) $(1)/$(dir $(path)); rsync -a --exclude=.DS_Store --exclude=__pycache__ --exclude='*.pyc' --exclude='*.pyo' --exclude=.git $(SY108_PROJECT_DIR)/$(path) $(1)/$(dir $(path));)
endef
