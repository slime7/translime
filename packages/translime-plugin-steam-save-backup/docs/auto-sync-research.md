# 存档自动同步（远程备份）调查报告

> 目标：为本插件（translime-plugin-steam-save-backup）设计"本地备份 ↔ 远程位置"的自动同步能力。**远程端是单一可靠源（single source of truth）**：多台本地设备都与远程对账同步，正确同步后每台本地都持有完整的最新存档集合——即对标 Steam Cloud 的多设备体验。远程位置包括 Google Drive、SMB/NAS、WebDAV、S3 兼容存储等，优先选择有**维护中开源库**支撑的方案。

## 1. 现状盘点

插件当前的备份模型（`src/utils/backup.js`）：

- 备份根目录：`<自定义位置或 文档目录>/TranslimeSteamBackups/<gameId>/<时间戳目录>/`
- 每次备份包含 `info.json`（schemaVersion 2，含 gameId/gameName/sources/backupTime/note）与 `data_N/` 数据目录
- 备份是 **只追加（append-only）的版本化目录树**：目录名即版本号（时间戳），内容不覆盖不删除；唯一例外是 `updateBackupNote` 会回写 `info.json` 的 `note` 字段

这个模型对多端同步极其友好：**备份目录不可变 + 目录名全局唯一（时间戳）**，多台设备各自产生的备份天然是"集合合并"关系而不是"编辑冲突"关系。同步问题从通用的三方合并退化为集合对账（reconciliation）。

## 2. 需求模型（对标 Steam Cloud）

| 能力 | Steam Cloud 的做法 | 本插件的对应设计 |
| --- | --- | --- |
| 拓扑 | 云端为中心，多设备各自与云端同步 | **一致**：远程是唯一可靠源，本地互不直连 |
| 收敛目标 | 各设备最终一致 | 同步完成后：本地 ⊇ 远端 且 远端 ⊇ 本地（两端集合相同） |
| 触发时机 | 存档变化 + 游戏退出 | 备份动作完成后推送；宿主启动/插件激活时自动对账；手动"立即同步"；可选定时 |
| 冲突处理 | 两份都保留，用户选择 | 目录不可变 ⇒ 天然合并；同名目录内容不一致时保留两份（§4.3） |
| 删除传播 | 云端删除即全局删除 | 清理由远端主导并记录墓碑（tombstone），本地跟随，防复活（§4.4） |
| 状态可见 | 云图标 | 每游戏同步状态：已同步 / 待上传 / 待下载 / 离线排队 / 错误 |
| 离线容忍 | 联网后补传 | 串行同步队列 + 指数退避；离线时本地照常备份，恢复后补对账 |

明确非目标：不监听同步游戏运行目录（文件锁与写入竞态多）；不做本地之间直连（P2P）；`note` 备注 v1 视为本地元数据不参与同步（见 §4.5）。

## 3. 候选远程通道与开源库（2026-10 维护状态核实）

### 3.1 方案总览

| 方案 | 覆盖后端 | 依赖库/工具 | 维护状态（2026-10） | 集成方式 | 评价 |
| --- | --- | --- | --- | --- | --- |
| A. OS 挂载（SMB/NAS） | SMB / NFS / 挂载盘 | 无（OS 内置） | 操作系统能力，无过期风险 | UNC 路径（`\\NAS\share`）或挂载点当本地目录读写 | **MVP 首选**，零依赖；NAS 就是"远程可靠源"的常见形态 |
| B. rclone 引擎 | Google Drive、OneDrive、S3、WebDAV、SMB、SFTP 等 40+ 后端 | [rclone](https://rclone.org/changelog)（Go，MIT，单二进制） | 活跃：v1.75.1（2026-09），2026 年内多次安全修复 | `spawn` 子进程，配置文件放插件 userData | **推荐主引擎**：一次集成覆盖全部云后端，OAuth 由 rclone 官方 client 承担 |
| C. WebDAV 内建 | 坚果云、Nextcloud、Alist、群晖等 | [`webdav`](https://github.com/perry-mitchell/webdav-client)（npm，TypeScript） | 活跃：webdav 5.10.0（2026 年中发布），CI 正常 | 纯 Node 依赖 | "免外部二进制"的轻量通道，NAS/WebDAV 服务用户面广 |
| D. Google Drive 内建 | Google Drive | [`googleapis`](https://github.com/googleapis/google-api-nodejs-client)（Google 官方） | 官方持续维护，Drive v3 为当前 API | OAuth 2.0 桌面流程 | 依赖大；OAuth client secret 分发是硬伤（§5） |
| E. S3 兼容内建 | AWS S3、R2、B2、MinIO | [`@aws-sdk/client-s3`](https://www.npmjs.com/package/@aws-sdk/client-s3)（AWS 官方） | 官方持续维护 | 标准三件套配置 | 面向进阶用户，成本几乎为零 |
| F. 备份型工具 | rclone 后端 + 自有仓库 | [restic](https://github.com/restic/restic) / [Kopia](https://kopia.io)（Go） | 均活跃（2026 年社区主流选项） | 子进程调用 | 加密/去重/保留开箱即用；私有仓库格式牺牲"拿走即用"，且与"远程目录即可靠源"的透明模型相悖 |
| G. 持续镜像 | 设备到设备 | [Syncthing](https://syncthing.net) | 活跃（定位为同步工具） | REST API | 设备间镜像可作可选适配器，但绕过"远程单一可靠源"拓扑，不推荐默认 |

### 3.2 Node SMB 库专项结论（为什么 SMB 走挂载而不是 JS 库）

- 老牌 `smb2`（marsaud 原版）已长期无维护，社区公认的延续 fork 是 **`@node-smb/marsaud-smb2`**（Node-SMB org），另有 `@greatnxy/smb`、`@miguel-cagide/smb2` 等小众 fork
- 结论：**不内置 JS SMB 客户端**。理由：
  1. Windows（主要平台）自带 SMB 客户端，UNC + Windows 凭据管理器的认证体验远好于插件自管账号密码；
  2. 主进程访问 UNC/映射盘与普通目录一致，现有复制逻辑零改动；
  3. JS SMB fork 单点维护风险高，断护即安全负债。
- 插件侧只需：目录选择允许 UNC 路径、同步前可达性探测（`fs.stat` 带超时）、掉线时给出明确"远程不可达"状态并排队。

### 3.3 方案 B（rclone）集成要点

- 分发：官方发布 Windows/Linux amd64 单二进制，MIT 许可允许随包分发；也可首次使用时下载到 userData（校验官方 sha256），避免安装包膨胀
- 认证：`rclone config create` + `rclone authorize "drive"` 本地回调完成 OAuth，token 存插件 userData 下的 rclone 配置——插件不内嵌任何 client secret（相对方案 D 的决定性优势）
- 对账语义：远端清单用 `rclone lsf -R --files-only` 或 `rclone lsjson`；上传 `rclone copy`、下载 `rclone copy`（双向都只增不删）；清理用 `rclone delete` + 本地墓碑记录，**不用 bisync**（bisync 为通用双向编辑设计，目录数据库状态文件反而是负担，我们的对账协议只需要清单比对）
- 进度：单目录量级（存档通常 < 100MB）直接等待进程退出即可，`--use-json-log` 可取进度

## 4. 同步协议设计（远程 = 单一可靠源）

### 4.1 数据约定

1. **备份目录不可变**：`<gameId>/<timestamp>/` 上传后不再修改（`note` 除外，见 4.5）。目录名即幂等键。
2. **目录完整性以 `info.json` 收尾**：上传时最后写 `info.json`；接收端把"缺 info.json"的远端目录视为传输中断的残留，忽略或清理。
3. **清单（manifest）实时从远端列举获得**，不在远端维护额外索引文件——SMB/挂载盘方案下"目录列表"本身就是清单，云后端用 `lsjson`。

### 4.2 对账流程（每台本地独立执行，远程无逻辑）

```
syncOne(gameId):
  1. remoteSet  = 列举 remote:<root>/<gameId>/ 下的有效目录（以 info.json 判定有效）
  2. localSet   = 列举本地 <backupRoot>/<gameId>/
  3. upload     = localSet - remoteSet        → 逐目录上传（目录名幂等，重复上传=覆盖同内容，安全）
  4. download   = remoteSet - localSet - tombstones → 逐目录下载
  5. verify     = localSet ∩ remoteSet 中 info.json 哈希不一致的（罕见）→ 各自保留一份（改名 <timestamp>-<machineId>）
  6. 回写 UI 状态；全部游戏对账完后触发远端清理（可选，4.4）
```

- **两台机器各自新建备份** → 两个不同时间戳目录 → 上传后双方下次对账都拿到对方目录。这就是"确保每个本地都是最新"的收敛机制，无需任何合并逻辑。
- **同名目录冲突**（时钟回拨/两机同秒各建一份）：概率极低；以 info.json 中的内容摘要判定，不一致则双份保留（§4.1 第 1 条保证两份都是合法备份）。
- 并发上传同一目录：目录名幂等 + info.json 最后写 ⇒ 最坏情况是半个目录被另一个完整目录覆盖，校验可发现并重传。

### 4.3 机器标识

每台本地生成 `machineId`（随机 UUID，存插件 userData），用于：
- 冲突副本改名后缀（4.2 第 5 步）；
- 上传目录的 info.json 附带 `createdBy`，UI 可展示"这份备份来自哪台机器"；
- 排查"哪台设备没同步"。

### 4.4 清理与墓碑（防止复活）

保留策略（如"远端保留最近 N 份"）由**远端主导**执行，但必须防"老本地把已清理目录再传回来"：

- 远端删除目录时在同游戏目录写 `translime-tombstones.json`（记录被删目录名 + 删除时间）；
- 本地对账时先拉墓碑：本地存在墓碑中的目录 → 删除本地副本；上传阶段跳过墓碑中的目录；
- 墓碑定期收敛（超过最老本地最后同步时间的墓碑可清除）。
- v1 保守替代：先只做"远端超配额提示 + 手动清理"，把自动清理放到第二阶段。

### 4.5 note 备注的处理

`updateBackupNote` 回写 info.json，破坏不可变假设。v1 决策：**note 不参与同步**（本地元数据），同步比对时忽略 note 字段差异。v2 可把备注迁移到远端单独的 `notes.json`（按 backup id 索引，最后写入者胜），让备注跨设备可见。

## 5. 关键风险与对策

| 风险 | 说明 | 对策 |
| --- | --- | --- |
| Google Drive OAuth 凭据分发 | 桌面应用内嵌 OAuth client 的 secret 本质公开；个人项目还需 Google 审核 | 默认走 rclone（官方 client 已解决）；内建 googleapis 时引导用户自建 GCP 项目 |
| rclone 二进制分发 | 体积（+30–50MB）与杀软误报 | 按需下载 + 官方 sha256 校验，或文档引导自装后填路径 |
| 老本地复活已删数据 | 离线数月的设备重新上线 | 墓碑协议（§4.4）；v1 用保守手动清理规避 |
| 游戏运行中还原冲突 | 远端取回覆盖本地时游戏可能正在写盘 | 还原前确认对话框；检测到游戏进程/Acf 更新时间过近时警告 |
| NAS 掉线/慢盘 | 同步卡死主进程 | 探测超时 + 串行队列 + 可取消；不在 `pluginDidLoad` 阻塞同步 |
| 两端同时写 | 多台本地同时上传不同目录 | 目录级幂等，无锁需要；同一目录并发由 info.json 收尾 + 校验兜底 |
| 隐私 | 备份含玩家数据 | 通道只指向用户自己配置的后端，不做中转；可选第二阶段引入 restic/Kopia 加密仓库作为加密适配器 |

## 6. 建议路线

1. **MVP**：SyncQueue + 对账协议 + LocalPathEngine（任意目录/UNC 挂载盘）——覆盖 NAS 与第二块盘用户，远程即可靠源，零新依赖；
2. **第二阶段**：RcloneEngine——接入 Google Drive / OneDrive / S3 / WebDAV 等全部云后端；UI 增加"远程目标"设置卡（后端类型、路径、保留策略、立即同步按钮、每游戏同步状态列）；
3. **可选第三阶段**：WebdavEngine（`webdav` npm 免二进制通道）、自动清理 + 墓碑协议、跨设备备注（notes.json）、"启动游戏前先同步"钩子；
4. **不推荐**：内建 googleapis OAuth、JS SMB 客户端、bisync/通用双向同步引擎、本地 P2P 直连。

## 7. 参考链接

- rclone changelog / releases：https://rclone.org/changelog 、https://github.com/rclone/rclone/releases
- webdav 客户端（npm `webdav`）：https://github.com/perry-mitchell/webdav-client
- googleapis 官方 Node 客户端：https://github.com/googleapis/google-api-nodejs-client
- Google Drive Node 快速开始：https://developers.google.com/workspace/drive/api/quickstart/nodejs
- SMB Node fork（@node-smb/marsaud-smb2）：https://github.com/Node-SMB/marsaud-smb2
- restic：https://github.com/restic/restic ；Kopia：https://kopia.io
- Syncthing：https://syncthing.net
- 2026 备份工具对比（Kopia/restic/Borg/Duplicacy）：https://stackharbor.com/en/knowledge-base/restic-borg-kopia-duplicacy-comparison
