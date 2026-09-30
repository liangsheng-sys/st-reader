# 本地目录联接安装（只由人类执行）

T40 后 `link-to-my-st.cmd` 将真实 ST 的 `data\default-user\extensions\st-reader` 联接到 **`E:\st-reader` 仓库根**，不复制文件。目标已存在时停止，绝不覆盖。

已有安装必须重做一次：
1. 关闭真实 ST 的网页和启动黑窗口。
2. 在资源管理器打开 `E:\st-reader\install`，先双击 **unlink-from-my-st.cmd**，看到“已移除联接”或“联接不存在”以及 `Exit code: 0`。
3. 再双击 **link-to-my-st.cmd**，确认“扩展位置”为 `E:\st-reader`，看到“目录联接已建立”和 `Exit code: 0`。
4. 重启真实 ST，扩展面板确认“阅读器 (ST Reader) 0.1.0”，点顶栏书本检查入口。

卸载只允许删除指向 `E:\st-reader` 或迁移前 `E:\st-reader\extension` 的那一个联接（旧目标不存在也可）；普通目录或其他目标会被拒绝，不递归删除、不创建父目录。脚本文件必须放在一起，不要只复制 cmd 到桌面。出错时保留完整输出，见 [操作手册](../docs/SETUP_WINDOWS.md) §3。

AI 不得执行此目录的安装/卸载入口，也不得读写真实 SillyTavern 的 data 目录。`dev/install.test.mjs` 仅注入内存 fs 替身检查操作序列。
