# notice-center-ui

通知中心独立前端模块，承接消息模板与通知渠道配置页。

- 菜单入口：`/notice`，默认进入 `/notice/template`
- 页面入口：`views/notice/template/index.vue`、`views/notice/channel/index.vue`
- 接口封装：`api/notice-center.ts`
- 后端接口：`/notify/channel/**`、`/notifier/config/**`、`/notifier/**`

## 微信服务号配置说明

`views/system/MessageNotification/Channels/` 的微信服务号配置页仅展示服务端配置字段，已移除渠道测试入口、测试模板和样例参数设置；沿用现有配置表单与说明面板，中英日说明同步。参考线上 `https://doc.jetlinks.cn/` 的微信服务号配置说明（`doc.WeixinApp.707693-*`），介绍 AppID、AppSecret 以及“微信公众平台 → 设置与开发 → 基本配置”的获取路径。保留已有配置值、业务消息模板和其他渠道能力，服务号调整不改变后端接口或配置数据；统一试发沿用既有发送接口，并移除渠道试发按钮对业务模板查询权限的依赖。

实现入口：`Channels/testing/channelTestConfig.ts` 不再为服务号注入测试字段，`channelTestAdapter.ts` 移除服务号试发适配；`useChannelsPage.ts` 和 `index.vue` 按适配器能力显示试发入口。`configuration/channelHelp.ts` 定义服务号专属指引，并将 AppId / AppSecret 编辑定位到对应步骤；三语资源位于 `locales/lang/{zh,en,ja}.json`。历史 `configuration.testTemplate` 保留在保存数据中，不参与服务号配置校验，不影响业务模板。

## 通知渠道统一试发

统一入口为 `Channels/testing/ChannelTestModal.vue` 与 `useChannelTest.ts`。邮件、钉钉工作通知 / 群机器人、企业微信、阿里云短信 / 语音、Webhook 共用「发一条测试 · 渠道名称」弹窗、发送锁定、失败重试及结果反馈。渠道更多菜单仅保留删除配置，独立模板页面保持原有行为。

- 默认发给自己，可选择其他单个接收人；校验邮箱、手机或渠道成员 ID，禁止列表和广播目标。本人邮箱沿用主邮箱身份、首个邮箱身份、资料邮箱的优先级；手机读取账号资料；第三方绑定必须同时匹配 `type_provider` 与当前通知器 ID。加载失败支持重试，与确实未绑定分开显示。群机器人 / Webhook 直接使用当前配置的群 / 地址。
- 邮件、钉钉、企业微信、机器人和 Webhook 使用固定测试消息，系统名称读取 `useSystemStore().layout.title`。短信、语音只读渠道中保存的服务商测试模板和样例参数，提示实际内容以服务商模板为准。
- `channelTestAdapter.ts` 集中管理七类提供商的配置条件、接收人规则及内联参数。发送仅调用 `POST /notifier/{configId}/_send`，参数为 `{ template, context }`，不查询或写入业务模板；微信服务号及未支持的提供商不显示渠道试发入口。
- 只允许已保存、无未保存修改且具有渠道查询 / 发送权限的配置试发。弹窗使用保存值的快照；发送期间锁定重复操作，失败保留输入。关闭、配置切换、保存值刷新、权限变化或组件卸载后忽略过期响应。缺配置时引导到对应编辑字段，等待弹窗关闭及焦点恢复后再打开编辑器。成功仅表示「已提交，请检查接收端」。

新增设置通过现有渠道保存接口持久化；`ChannelTestSettings.vue` 以具名字段和参数键值行编辑，试发弹窗不编辑配置、不选择业务模板、不输入 JSON。

| 提供商 | 保存路径与字段 |
| --- | --- |
| 钉钉工作通知 / 企业微信 | `configuration.agentId`；企微复用已有字段，钉钉补充同名字段，试发显式传入内联模板 |
| 阿里云短信 | `configuration.testTemplate`：`signName`、`code`、`parameters` |
| 阿里云语音 | `configuration.testTemplate`：`templateType`（`tts` / `voice`）、`templateCode`、可选 `calledShowNumbers`、`parameters` |

`parameters` 为 `{ name, value }[]`；无变量时可省略或为空数组，有变量时名称唯一、值非空，禁止覆盖接收人或路由字段。旧配置可以缺少这些设置，仍可读取和编辑；缺少试发条件时禁用发送并列出缺项。测试设置不改变业务模板规则或历史模板数据，无后端接口 / 数据库变更。仅修改 `runtime-ui/modules/notify-manager-ui`，保留工作区既有变更，不修改运营端 `ui/`。

提交范围验证（2026-11-12）：从当前分支 HEAD 提取仅含服务号调整及必要统一试发前置改造的副本验证。渠道、试发、接口和菜单检查共 93 项：修正 AgentId 的旧断言后，渠道 39/39 复验通过，其余 54 项已通过；日志 `/tmp/weixin-submit-tests.log`、`/tmp/weixin-submit-channels-final.log`。在 `jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/weixin-submit-build -- --module-name notify-manager-ui`，模块构建通过（17.96 秒），四个变更 Vue 文件通过定向样式检查，工作区无独立 lint 脚本。`./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 与 HEAD 基线均为 213 项既有诊断，无新增或移除，完整类型检查尚未通过；修复既有问题后需重跑。日志前缀 `/tmp/weixin-submit-`。

工作区页面的 Playwright 内存夹具验证已通过：七类渠道试发、微信服务号隐藏测试入口和参数、中英日说明及 390px 窄屏均符合预期，无页面错误或业务网络请求，报告 `/tmp/weixin-official-browser/report.json`。独立副本的浏览器复验在 Vite 预构建依赖初始化阶段被 `isFunction is not a function` 阻断，未进入页面断言；报告 `/tmp/weixin-submit-browser/report.json`。修复隔离开发环境后，使用 `SMOKE_PLAYWRIGHT_MODULE=/Volumes/SSD/work/jetlinks/cloud.jetlinks/ui/node_modules/playwright SMOKE_BASE_URL=http://127.0.0.1:19201 node tests/messageNotificationBrowser/trials.mjs` 重跑候选页面验证。未发送真实消息，真实账号授权与服务商投递仍需测试账号联调。

## 钉钉机器人可选加签

实现提交：前端 `7eba75d`（本地 `2.20`），后端 `8444cd9ee`；后端评审见 [PR #1717](https://github.com/jetlinks-v2/jetlinks-components/pull/1717)（目标 `2.20`，草稿，待恢复 Maven 私服访问后验证）。

当前暂时屏蔽钉钉机器人的加签密钥输入与清除入口，即使服务端元数据声明 `secret` 也不显示。仅在 `Channels/useChannelConfiguration.ts` 的显示字段中过滤机器人 `secret`；保留已保存密钥、元数据能力与密钥合并逻辑，修改 Webhook 时继续保留原密钥，邮件、短信等渠道不受影响。后续恢复入口时仍以服务端元数据声明为前提。

`views/system/MessageNotification/shared/configuration.ts` 通过字段策略区分可选密钥和明确清除意图，不硬编码钉钉判断；原本没有可选密钥的配置允许修改。掩码密钥无法安全回传，当前入口屏蔽期间继续拒绝此类配置的普通更新，避免丢失已存密钥。清除使用 `configuration.secret: ""`，前端意图标记不进入 API，配置 ID 间不复用密钥。后端 owning module 为 `modules/jetlinks-components/notify-component/notify-dingtalk`，先升级通知服务再发布前端；不修改 `ui/` 或增加数据库列。

本次屏蔽验证（2026-11-11）：`node --test tests/messageNotification{Channels,Contracts,Integration}.test.mjs` 在独立提交候选通过 77/77，当前工作区通过 78/78；沿用下述 Playwright 命令验证 6 组场景，有 / 无 secret 元数据、机器人切换与三语均隐藏入口，修改 Webhook 保留密钥，无业务网络请求。沿用下述构建命令通过（20.97 秒），类型检查仍为原有 213 项诊断，无新增或消失；无独立 lint 脚本，`git diff --check` 通过。本轮日志与页面截图位于 `/tmp/dingtalk-secret-hidden/`。

加签能力实现时的验证（2026-11-11，命令从 `runtime-ui/` 执行；下述显示与清除交互为屏蔽前结果）：

- `node --test --test-name-pattern='signing|robot|optional credential|clear intent|SMTP|SMS|secrets|secret|credential' modules/notify-manager-ui/tests/messageNotification{Channels,Contracts}.test.mjs`：22/22 通过，覆盖新增不填、补填、更换、留空、清除、取消 / 失败、掩码值、配置切换及邮件 / 短信凭据保护。
- `node --test modules/notify-manager-ui/tests/messageNotification{Channels,Contracts,Integration}.test.mjs`：提交前按当前分支 HEAD 分离出仅包含钉钉加签的候选版本，77/77 通过；日志 `/tmp/dingtalk-sign-delivery/frontend-tests.log`。其他渠道的未提交改动保留在原工作区。
- `SMOKE_PLAYWRIGHT_MODULE="$PWD/../ui/node_modules/playwright" node modules/notify-manager-ui/tests/messageNotificationBrowser/robotSigning.mjs`：使用本工作区已安装的 Playwright 和已有 9200 Vite 服务。隔离内存接口验证 9 组场景，包括字段编辑、失败重试、掩码清除、机器人隔离、旧后端、三语及 390px 确认框；通过，无页面错误或业务网络请求。报告与截图 `/tmp/dingtalk-sign-browser/`。
- `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`：仍为改动前的 213 条既有错误，按文件 / 错误码 / 消息对比无新增。日志 `/tmp/dingtalk-sign-types-final.log`，全量类型检查尚未通过。
- 从 `jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/dingtalk-sign-build -- --module-name notify-manager-ui`：通过；保留现有 CSS、chunk 大小、构建配置及浏览器映射数据警告。`node ../ui/scripts/check-ui-style.mjs --files modules/notify-manager-ui/views/system/MessageNotification/Channels/ChannelConfiguration.vue` 和变更文件 `git diff --check` 通过。

不发送真实钉钉消息。后端编译 / 测试仍被私服 401 阻断，详见通知组件 README；恢复依赖后先验证并部署通知服务，再发布前端。无密钥历史机器人无需迁移，真实机器人发送另行验收。


## 系统通知模板原型对齐

- 左侧树按设备空间树参考图对齐（局部修正）：保留 `TemplateDirectory.vue` 的 `a-tree`，开启 `showLine` 并复用 core `src/style/components.less` 的 32px 行高、24px 层级缩进、浅灰虚线、左侧加减展开按钮及浅蓝圆角选中态，移除原局部覆盖，补充蓝色节点图标。分组与业务父节点均可展开 / 收起，搜索临时展开、清空恢复、深链展开祖先的规则保持一致；只调整模板目录及其 hook，不改接口、模板绑定或参考设备页，不添加设备数量。验证（2026-11-11）：模板 / 契约 / 装配测试 57/57 通过，增加分组折叠、搜索恢复与深链展开祖先的断言；模块构建通过（26.89 秒），`git diff --check` 通过。类型检查前后同为 213 项既有诊断，忽略行号后无变化；工作区无独立 lint 脚本。9200 实际页面只读核对树样式，隔离夹具实测 32px 行高、24px 缩进、虚线、浅蓝选中态、分组及业务节点展开 / 收起、搜索父链与清除恢复、子模板切换，夹具页面错误日志为空。未改真实数据；完整权限矩阵及长名称截断未重新验证。命令沿用本节，日志前缀 `/tmp/notification-template-tree-style-`，效果截图 `/Users/chris/.codex/visualizations/2026/11/11/01a1c9a2-4dad-76d3-a623-440d663cda60/notification-template-tree-style.jpg`；既有类型诊断修复后重跑类型检查。
- 底部预览变量区：按原型移除 `Templates/components/TemplatePreview.vue` 底部的“预览变量”折叠表单及对应文案、样式；保留编辑器变量插入和自动示例渲染，示例不进入保存 payload。同步既有浏览器用例；本次为局部展示修正，不实施下方完整改造方案。验证（2026-11-11）：模板 / 契约 / 装配回归 57/57、模块构建（34.77 秒）、浏览器脚本语法检查及 `git diff --check` 通过；中英日各 318 个消息通知键一致。类型检查前后均为 213 项既有诊断，忽略行号后完全一致；无独立 lint 脚本，未声称完整 lint 通过。9200 实际页面查看 / 编辑态均无底部变量预览表单，自动示例和编辑器插入按钮仍正常；未保存真实数据。日志前缀 `/tmp/notification-template-preview-footer-`，截图 `/Users/chris/.codex/visualizations/2026/11/11/01a1c9a2-4dad-76d3-a623-440d663cda60/notification-template-preview-no-footer.jpg`。既有浏览器 smoke 脚本已更新自动示例断言，但未执行其中其他页面的全量流程；类型诊断修复后重跑本节类型检查命令。
- 左侧目录局部修正：`Templates/components/TemplateDirectory.vue` 改用 Ant Design Vue `a-tree`，`Templates/templateDirectoryModel.ts` 只组织业务目录，不再追加“其他模板”及“设备告警 · 邮件”这类未绑定模板节点；同步调整目录 hook 和既有回归断言。保留真实绑定、多模板绑定子项、告警解除层级、搜索、展开与深链，不删除模板数据，不修改接口、保存或菜单。验证（2026-11-11）：模板 / 契约 / 装配回归 57/57、单文件样式门禁、模块构建（21.78 秒）及 `git diff --check` 通过；模块类型检查前后均为 213 项既有诊断，新增 0、移除 0，工作区无独立 lint 脚本。实际 9200 页面已确认无“其他模板”及未绑定模板节点，搜索保留父链，清除搜索恢复折叠状态，告警子级可展开 / 收起，原 templateId 深链仍展示原模板。日志前缀 `/tmp/notification-template-atree-`；既有类型错误修复后重跑下方类型检查命令。
- 侧栏容器以设备列表 `IotDeviceScopeSidebar.vue` 为样式锚点：沿用 `EqualHeightColumns` 的 15rem 左列，透明底色、不另加内边距，搜索与树之间使用 `var(--space-4)`。移除通知模板页额外叠加的灰底和上下 16px / 左右 12px 内边距，保留现有业务分组与子级。
- 目录修正：复用现有 `GET /notify/channel/all-for-save` 的业务类型、名称及 `channels[].channelConfiguration.templateId`，以实际模板 ID 关联当前渠道模板；树样式按本节设备空间树参考图统一为蓝色图标、层级虚线、左侧加减号与浅蓝选中态。设备告警与告警解除仅作展示层父子排列，仍读写各自独立模板；其他业务类型由接口决定，未关联模板不再追加到左侧业务目录。补充搜索保留父链、展开收起、权限 / 失败回退与子级详情联动验证。
- 已确认目标：仅优化 `/system/notification/templates` 前端，对接现有接口能力。owning module 为 `runtime-ui/modules/notify-manager-ui`，入口 `views/system/MessageNotification/Templates/index.vue`。保留独立模板、type/provider 渠道查询、templateId 深链和现有权限，不改告警模板页、后端或菜单，业务分类和绑定只读取现有目录；不新增跨渠道业务模板关联、站内信及默认模板等当前契约未提供的能力。
- 当前行为：左侧按现有业务分组及真实模板绑定组织目录，右侧为标题 / 说明 / 编辑及更多操作、渠道切换、浅底效果预览。进入渠道时自动预览首条实际模板，显式 templateId 深链优先；已有模板默认只读，右上角编辑进入现有表单，新建直接进入编辑。保存成功返回预览，取消仅放弃当前草稿，切换继续保留各 ID 的草稿；重复点击当前渠道保留选择。邮件展示摘要与正文预览，其他渠道保留完整模板内容预览；示例自动用于预览，不单独展示底部变量输入区，不进入保存 payload。
- 实施入口与复用：`index.vue` 组合 `FullPage`、`EqualHeightColumns`、core `DetailHeader`、`SwitchGroup`、Ant Design Vue 菜单 / 按钮；沿用 `TemplateDirectory.vue` / `a-tree`、`TemplateEditor.vue`、附件与变量组件、`StickyActionBar` 和 `JlConfirmDialog`。`hooks/useTemplatePage.ts` 编排查看 / 编辑及动作状态，`TemplatePreview.vue` / `hooks/useTemplatePreview.ts` 负责纯展示预览；继续复用 `useTemplateWorkspace.ts` 的真实模板查询、保存、按 ID 草稿与迟到响应保护。目录额外读取已有 `/notify/channel/all-for-save`，无后端修改。
- 实现边界：页面状态归属 `useTemplatePage.ts`，预览派生归属 `useTemplatePreview.ts`，请求继续使用原 API；无新增基础组件。取消新模板删除本地草稿，取消已有模板只重读当前 ID；无修改时退出编辑无需确认。有未保存修改时继续复用确认框，其他模板草稿仍由原页面离开守卫保护。
- 风险边界：渠道切换仍是切换独立模板集合；不以相同模板名称推断跨渠道关联。保留新增后返回 ID 未知、保存失败、权限不足、旧响应和未保存草稿处理。预览仅展示文本，不执行 HTML，不发送通知。
- 验证命令：在 `runtime-ui/` 运行 `node --test modules/notify-manager-ui/tests/messageNotificationTemplates.test.mjs modules/notify-manager-ui/tests/messageNotificationContracts.test.mjs modules/notify-manager-ui/tests/messageNotificationIntegration.test.mjs`，并用 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 对比改动前诊断。在 `runtime-ui/jetlinks-web-core/` 运行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/system-notification-template-prototype-build -- --module-name notify-manager-ui`。工作区无独立 lint 脚本，补充定向样式 / 编译检查及 `git diff --check`；浏览器验证目录 / 渠道、查看 / 编辑 / 取消 / 保存、变量、附件、深链、长内容与窄屏，写入使用隔离夹具。
- 验证结果（2026-11-11）：模板 / 公共契约 / 装配测试 53/53 通过，覆盖新增的默认预览、深链、重复渠道选择、编辑 / 取消、跨模板草稿、保存失败重试及只读权限。两个变更 Vue 文件的定向样式门禁和 `git diff --check` 通过；模块构建通过（20.34 秒），保留既有 chunk / CSS / 输出配置告警。模块类型检查仍为改动前相同的 235 项诊断，忽略行号比较新增 0、移除 0，不能记为类型检查通过。日志为 `/tmp/system-notification-template-{tests-final,style,types-before,types-final,build-final}.log`。
- 浏览器验证：现有隔离夹具在 9200 完成 22 项检查，覆盖七个渠道、目录搜索 / 折叠、查看 / 编辑 / 取消 / 保存、新建取消、示例变量隔离、深链、详情失败重试、无权限、长标题 / 正文 / 附件、390px 窄屏及英日文显示；保存按钮可操作且可达，无页面异常及真实业务 / 外网请求。截图与报告位于 `/tmp/system-notification-template-browser/`。`tests/messageNotificationBrowser/smoke.mjs` 已适配查看 / 编辑切换和折叠变量，未执行其中其他页面的全量流程；本次未做真实账号与后端写入联调，发布前使用测试模板复核保存及附件上传。既有类型诊断修复后重跑上方类型命令。

- 目录与容器修正验证（2026-11-11）：模板 / 契约 / 装配测试 57/57 通过，包含业务分组、独立告警解除 ID、搜索父链、展开状态及目录迟到响应；最后的容器调整仅删除额外背景 / 内边距并对齐间距，复用这批行为证据。最终两个 Vue 文件样式门禁、`git diff --check` 和模块构建（22.20 秒）通过。类型检查仍为相同的 235 项既有诊断，无新增；中英日各 321 个消息通知键一致。日志前缀 `/tmp/notification-template-directory-`。
- 浏览器补充验证：隔离夹具验证子级选择、展开 / 收起、搜索保留父链、父子草稿独立及子模板保存、目录失败时独立模板可访问与重试恢复。最终侧栏实测宽 240px、额外内边距 0、透明底色、搜索与树间距 16px，与设备列表容器约定一致；子级详情正常。截图为 `/Users/chris/.codex/visualizations/2026/11/11/01a1c86d-f002-7a91-b4ee-782b6c5aa8de/system-notification-template-directory.jpg`。目录接口未做真实账号联调，仍需在目标部署复核业务目录读取权限及已有模板绑定。

### 前端内置通知模板改造方案

本节为待实施的模板改造方案。当前范围：左侧使用 `a-tree` 展示业务目录；现有七个外部渠道的默认内容、可用变量、示例值与表单由前端内置，后端保存用户修改。图 1 定义渠道未配置提示，图 2 定义内容表单、变量面板、实时预览的编辑模式。站内信已按用户要求从模板改造中移除；不提供站内信模板入口、默认定义或编辑保存能力，现有站内信发送、收件箱及已读功能保持原样。本节替代此前包含站内信的方案，运行代码尚未按本节实施。

#### 目标、归属与范围

- 前端 owning module：`runtime-ui/modules/notify-manager-ui`；入口 `views/system/MessageNotification/Templates/index.vue`。保留现有 `a-tree`、业务分组、告警解除子级、真实模板深链和草稿保护。
- 外部模板持久化继续复用独立仓库 `jetlinks-v2/notify-manager` 的现有能力，由 `runtime/notify-service/pom.xml` 引用。后端工作只涉及下述外部模板首次保存、业务绑定及查询权限的契约缺口；是否需要补实现，以实施前核对为准。当前聚合工作区未检出其源码，需要修改时在独立 checkout 中完成。
- 本次只覆盖运行时通知模板，不复制到 `ui/`，不调整业务告警判定、订阅对象、接收人策略或默认启停，不自动写入全部默认模板，不发送真实测试通知，不删除现有独立模板。旧告警模板页仅在共享函数和接口影响处做兼容调整，不同步改版。
- 撤销原站内信模板的后端读写、权限扩展、发送渲染、延迟入箱快照及数据库字段升级计划；不修改 `notification_inbox` 或 `notification_intent`。

#### 一、存储与模板身份

| 数据 | 落点 | 约定 |
| --- | --- | --- |
| 默认内容、表单、变量清单、预览样例 | 前端模板定义 | 按业务类型 + 渠道提供商内置，样例不进入真实发送参数 |
| 用户保存的外部渠道模板 | `notify_template` | 复用现有表，不新建模板表 |
| 业务主题及资产范围 | `notify_subscriber_provider` | 复用现有主题记录与资产绑定 |
| 主题下的渠道和模板关联 | `notify_subscriber_channel.channelConfiguration.templateId` | 保留真实 notifierId / configId 关联 |

模板 ID 复用现有规则：`channelId = md5(providerId + "||" + channelProvider)`，`templateId = stpl_ + channelId`。其中 providerId 是具体业务主题配置记录的 ID，而不是泛指 `alarm-device` 等业务类型。设备告警、告警解除及不同资产范围分别关联自己的模板，重复保存更新同一记录。

前端默认定义按业务类型复用；实际草稿和保存按“具体主题 + 通道 + 外部提供商 / 精确配置”隔离。现有后端每个主题、channelProvider 只有一项托管模板，因此同一个 `notifier-dingTalk` 下的企业应用与机器人代表该通道绑定的提供商选择；界面展示两种表单不等于增加两个后端订阅通道。保存切换提供商必须明确更新所选绑定，不能将同类型渠道的其他配置默认为已绑定或已配置。

#### 二、读取、首次保存与恢复默认

复用现有单通道接口：

- `GET /notify/channel/{providerId}/{channelProvider}/_query-with-template`
- `PUT /notify/channel/{providerId}/{channelProvider}/_save-with-template`

请求继续采用 `{ channel, template }`，响应返回真实 channel、providerId、templateId 和归一化模板。保存路径使用现有事务边界，模板与通道关联同时成功或同时回滚；只更新当前渠道的模板相关字段，保留已有 state、grant、接收人变量和主题设置，不以页面提交的旧快照覆盖其他配置。

当前核对的单通道保存要求主题已存在，而目录可能返回尚未持久化的业务类型。首次保存需补齐此契约：已有主题使用具体记录 ID；未持久化项使用目录中的已注册业务类型标识，经当前 holder 的业务支持范围校验后，复用 provider 创建与绑定能力，在同一事务中创建主题、当前渠道和模板，返回实际 ID。不能通过“启用业务”接口顺便创建，也不能因编辑模板自动开启此前禁用的业务。再次保存按返回的实际 ID 操作；并发首次保存需验证主题解析和保存的幂等性，避免产生两套绑定。

查询必须区分：合法业务确实无定制、已有定制、读取失败、无权限、已绑定模板缺失。仅明确无定制时展示内置默认；读取失败、无权限和绑定损坏不能降为默认未配置。无模板的 GET 不创建数据。已有模板定制优先于前端默认，升级前端不会覆盖库内定制。

“恢复默认”将当前前端默认写入本地草稿，点击保存后仍写回同一模板记录，不删除通道或改变启停；取消恢复原已保存内容。保存过的默认内容作为当时版本保留，后续前端默认变动不隐式覆盖它。界面分别表达“尚未保存 / 已保存”与“内容是否等于当前默认”，不以是否有 templateId 判断内容是否默认。

外部渠道继续要求合法 configId。建议无配置时允许预览和编辑草稿，显示图 1 的警示及“去配置”，配置完成后回到原业务和草稿保存；不放宽通知配置的权限契约。仅打开模板页面不改变实际发送；保存后的模板由现有外部通知发送链路使用，不新增发送渲染系统。

#### 三、接口和权限边界

- 复用业务主题与外部通知配置的 AssetsHolder 权限，继续校验旧、新 configId 的读取 / 保存权限和提供商匹配。稳定 ID、实际主题归属和渠道关联必须一致，不能借用其他作用域的 templateId。
- 目录需满足业务读取权限，避免只读用户依赖 `/all-for-save`。模板菜单核对 `template:query/save` 与单通道所需 `notify-channel:query/save` 的映射，编辑仍受资产权限约束。
- 如需补齐首次主题保存或只读目录能力，集中在现有业务通道入口完成；不另建保存接口体系，不改站内信通道及其权限分支。已有 `/notifier/template` 外部模板 CRUD 继续沿用现有语义。
- 模板定义、payload、接口字段、渠道提供商和变量值域必须一致；示例值不作为默认发送变量，供应商签名、模板编号和凭据使用真实配置。

#### 四、前端页面与代码职责

- 默认定义：提供业务标识、渠道、默认字段、变量、样例、编辑 schema 与前端预览适配。复用 `views/notice/template/hooks/noticeTemplateFormModel.ts`、`noticeTemplateModel.ts`、`noticeAlarmPreview.ts`，按职责组织共享能力；未知业务仅使用已核实的通用变量，不根据名称猜测专属字段。各业务模块自行注册定义的方式属于此前提出的组织建议，尚未落实注册接口。
- 渠道范围：邮件、钉钉企业应用、钉钉机器人、企业微信、语音、短信、Webhook，共七个入口；站内信不进入模板渠道目录，保留现有 `internalInboxTemplate: false`。
- 业务选择：`templateDirectoryModel.ts` / `hooks/useTemplateDirectory.ts` 以业务为主键，业务无已保存模板也可选择和预览；切换渠道保持业务，左侧不出现“设备告警 · 邮件”这类独立模板节点。
- 状态：`hooks/useTemplatePage.ts` 编排选中业务 / 渠道、预览 / 编辑和路由；`useTemplateWorkspace.ts` 管理按业务与渠道隔离的草稿、真实请求、版本和迟到响应保护。旧 templateId / configId 深链通过真实绑定解析，已有未绑定独立模板深链仍可读写，不把它自动绑定到某业务。
- 预览模式：显示业务标题、说明、模板保存状态和当前渠道样式；确实缺配置时显示图 1 警示和“去配置”，业务禁用或未订阅状态仍如实展示，编辑不代表已启用发送。底部不展示独立的“预览变量”区，示例值由前端模板定义自动提供。
- 编辑模式：内容字段、可用变量、实时预览三栏；变量点击插入当前输入框的光标 / 选区，日期和可选变量预览与后端语义一致。邮件为主题 / 正文 / 附件，其他渠道使用真实供应商 schema；短信 / 语音签名及供应商模板编号不能从样例伪造。Webhook 按实际结构保留适用的结构化编辑器，不将所有非邮件渠道降为通用 JSON 文本框。
- 组件：继续复用 FullPage、EqualHeightColumns、DetailHeader、SwitchGroup、a-tree、a-alert、附件上传、StickyActionBar 和确认框；请求不入展示组件，Vue 单文件不超过 300 行。新增文案遵循中英日 i18n，窄屏转分区显示并保证保存操作可达。
- 保存、取消和恢复默认均只针对当前草稿；保存失败保留输入，跨业务切换保留各自草稿，路由跳转配置时保留恢复位置。不得以保存模板修改业务接收人或发送测试消息。

#### 五、实施顺序与验收

1. 核对外部渠道单通道读写、首次创建和只读目录契约，确认必要的后端与菜单权限补齐范围；不开展站内信模板或数据库结构改造。
2. 建立前端默认模板定义，接通业务选择、单通道保存、首次保存后的 ID 回写及深链，保留其他页面调用兼容。
3. 落实图 1 预览与图 2 编辑布局，接通变量、恢复默认、草稿保护、配置跳转和三语；同步 owning README 和根 docs/plans 索引。
4. 完成前端及必要接口验证。若外部模板接口有补齐，先交付对应后端能力再交付前端；本方案不包含站内信快照字段升级或历史消息迁移。

| 验收场景 | 必须观察到的结果 |
| --- | --- |
| 无模板 / 已定制 / 读取失败 / 无权限 | 正确区分状态，只有确实无定制才展示默认 |
| 两种业务 / 两个资产范围 | 模板 ID 与绑定隔离，不能跨范围查询、覆盖或借用 templateId |
| 首次保存、重复保存、事务失败 | 一套有效主题 / 通道绑定，失败不留下半条关联，不重写其他渠道 |
| 图 1、图 2、七个渠道、旧深链 | 业务选择稳定，表单及 payload 正确，变量光标插入、取消 / 恢复 / 失败重试和草稿隔离有效 |
| 外部渠道无配置 | 警示准确，去配置后回到原草稿，真实 configId 与提供商匹配 |
| 模板目录与请求范围 | 没有站内信模板入口，不生成或保存站内信模板 |
| 变量、预览及真实 payload | 示例值不进入发送上下文，变量路径和格式一致 |

前端在 `runtime-ui/` 运行 `node --test modules/notify-manager-ui/tests/messageNotificationTemplates.test.mjs modules/notify-manager-ui/tests/messageNotificationContracts.test.mjs modules/notify-manager-ui/tests/messageNotificationIntegration.test.mjs`，扩展有关用例并回归受共享函数影响的旧 notice/template 页面。类型检查使用 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 对照实施前基线；模块构建沿用 core 下 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/system-notification-template-builtin-build -- --module-name notify-manager-ui`。工作区无独立 lint 脚本，执行定向样式检查与 `git diff --check`，不将其表述为完整 lint 通过。浏览器使用隔离夹具验证七个渠道、权限、两种布局、窄屏、中英日文及失败恢复。

若补齐外部模板后端契约，在 notify-manager 根执行 `mvn test` 与 `mvn -DskipTests compile`，验证事务、AssetsHolder allow / deny 和首次保存；安装改动依赖后执行 `mvn -f runtime/notify-service/pom.xml -DskipTests package`。未改后端时不要求为此重复构建通知服务。

证据与限制：外部模板静态契约核对基于 `jetlinks-v2/notify-manager` 提交 `09d3deac0fb96e2eaae37e4aca4a662be5e4f52d` 的 NotifySubscriberTemplateConfigService、NotifierTemplateController 和 NotifySubscriberProviderService；实施前需复核目标版本。当前模板目录仅有七个外部渠道，`internalInboxTemplate` 为 false，站内信模板尚未实现，因此本次按用户要求仅收缩方案及索引，无需回退运行代码。本次文档 `git diff --check` 通过，未执行功能测试或构建，未改变业务数据。

## 消息通知三页迁移（contract-v1）

### 消息模板目录

`views/system/MessageNotification/Templates/components/TemplateDirectory.vue` 直接使用 Ant Design Vue `a-tree`，以现有业务目录的 `type.id/name` 显示灰色分组标题、普通业务行和缩进子级，选中项采用白底描边与主题色文字。设备告警和告警解除依据已有 provider 标识作原型中的展示层嵌套，仍使用各自 `channelConfiguration.templateId` 关联当前渠道独立模板；不按名称猜测绑定，不合并父子模板或草稿。目录只展示业务类型及其真实绑定；未绑定业务的模板不生成“其他模板”分组或独立节点，已有 templateId 深链仍可访问原模板。当前渠道没有绑定的业务显示提示且不选择其他模板代替。

`templateDirectoryModel.ts` 负责真实分组 / 绑定与搜索保留父链；`hooks/useTemplateDirectory.ts` 管理展开、搜索和选中。分组默认展开，设备告警可展开 / 收起；搜索子项自动展开祖先，清空搜索保留原展开状态，显式选中子模板时展开其父级。`hooks/useTemplateBusinessDirectory.ts` 通过 `messageNotificationApi.queryTemplateDirectory` 读取已有 `GET /notify/channel/all-for-save`，具备刷新、权限和卸载后的迟到响应保护；目录读取失败显示可重试提示；左侧不回退拼接独立模板，已通过深链打开的模板仍可操作。目录状态只影响展示，查询 / 编辑 / 保存继续沿用 `/notifier/template` 接口。


### 通知记录全局查询

数量展示调整：`Records/useRecordsPage.ts` 将全部与各状态的数量缺省值统一为 0，`Records/index.vue` 已移除统计失败重试入口及对应三语文案，沿用统计请求与列表反馈。验证（2026-11-11）：records / integration 测试 28/28、单文件定向样式门禁及模块构建（25.49 秒）通过；模块 `vue-tsc` 仍有 235 项既有诊断，对比前次验证新增 0、移除 0，既有问题修复后需重跑。模块没有独立 lint 脚本，`git diff --check` 通过，中英日各 305 个消息通知键一致。命令沿用下方验证段，当前日志为 `/tmp/notification-records-count-display-{tests,types,build}.log`。

已对齐原型中现有后端可支持的记录交互，owning module 为 `runtime-ui/modules/notify-manager-ui`。默认进入发送失败；重复点击当前状态切换为全部，显式 `state=all` 在刷新后保持。沿用 ConditionFilter、SwitchGroup、j-pro-table 与产品列表样式，增加业务类型、渠道图标、失败原因、跨页勾选 / 清除和“导出已选” CSV。发送内容在列表中保持单行，超出列宽显示省略号，悬浮保留全文；省略样式直接作用于内容按钮内的文本节点，沿用点击与键盘打开详情。本次展示修复已用 `history=long` 浏览器夹具验证长文本省略和详情全文；记录页测试 18/18、定向样式检查及构建（24.49 秒）通过，类型检查仍为 235 项既有诊断，无新增。日志 `/tmp/notification-records-ellipsis-{tests,types,build}.log`。内容与操作列均可打开历史详情，关闭恢复入口焦点；详情以内容和状态为标题，固定采用两列摘要：发送时间、通知类型、渠道、接收人、关联对象、消息模板、重试次数，下方展示发出的内容。`Records/useRecordDetail.ts` 的通知类型使用 `bizType`，关联对象使用 `bizId`，接收人使用 `receiver`。打开详情时，在具备模板查询权限的前提下，用历史 `templateId` 调用现有 `messageNotificationApi.getTemplate`，显示对应模板的当前 `name`，点击仍携带原 ID 跳转。模板未配置显示“未配置”；有 ID 但名称查询失败、已删除或无权读取时显示“未上报”，不回退显示 ID。加载期间显示“加载中”；切换记录、关闭抽屉、权限变化或卸载会使旧响应失效。模板名称属于当前配置元数据，不覆盖历史发送内容；姓名、关联对象名称与重试次数仍只使用已有历史契约。名称查询验证：records / integration 测试 30/30 通过，覆盖名称展示、按原 ID 跳转、关闭 / 权限 / 卸载 / 记录切换的旧响应失效及删除 / 错配 / 空名称回退；定向样式检查、模块构建（26.85 秒）和 `git diff --check` 通过，类型检查仍为 235 项既有诊断，无新增。浏览器确认显示“设备告警邮件”并打开对应 `template-alarm`；日志 `/tmp/notification-records-template-name-{tests,types,build}.log`。缺失上报数据统一显示“未上报”，缺失渠道或模板显示“未配置”，发送内容缺失仍展示占位；移除 ID 明细及原始模板 / 变量 / 结果快照区块。表格发送状态列宽为 100，发送内容列吸收剩余宽度，避免表格分配空余空间时放大状态列。验证（2026-11-11）：records / integration 测试 28/28、单文件定向样式门禁、模块构建及 `git diff --check` 通过；类型检查仍为 235 项既有诊断，新增 0、移除 0。日志 `/tmp/notification-records-detail-fields-{tests,types-final,build}.log`。浏览器验证字段顺序、空值占位、详情全文、模板链接实际跳转、发送状态表头实测 100px，以及 390px 窄屏无页面横向溢出；页面错误日志为空。中英日各 306 个消息通知键一致。

接口契约：`api/notice/messageNotification.ts#queryHistory` 对接 `POST /notify/history/_query`；`countHistory` 对接 `POST /notify/history/_agg`。聚合请求使用 `AggregationQueryParam` 的 `columns`（`COUNT(id)`）、`groupBy`（state）和 `filter`。当前部署的聚合接口只支持 SSE；`Accept: application/json` 返回 406，因此明确请求 `text/event-stream` 并由 `notificationHistoryCounts.ts#readHistoryCounts` 解析有限数据流。解析支持 CRLF、BOM、注释、多行 data 和错误事件，拒绝无效 / 重复计数；统计未返回、加载中或失败时，界面数量统一缺省显示 0。列表与统计均使用平台认证及后端历史资产过滤，权限仍为 `notifier/query`，未修改菜单或后端。

状态与数据边界：`Records/recordQuery.ts#notificationHistoryAdapter` 是可注入的生产适配器；`useHistoryCounts.ts` 保留内容、接收人、时间与渠道 / 配置 / 模板范围，统计时去掉状态和分页，翻页 / 切换状态不重复统计。列表和统计各自使用 AbortSignal 与代际校验，防止旧响应覆盖；统计失败不影响正常列表；记录页不提供统计失败提示或重试入口，实际计数返回后正常展示。`useHistorySelection.ts` 在翻页时保存已选快照，筛选或权限变化后清空；仅导出已选记录的完整内容，保留中文、引号和换行，并转义电子表格公式前缀。

后端限制：`NotifyState` 只有 `success/error/retrying/cancel`，不将取消改称“没发”。`NotifyHistory` 没有重试次数；`NotifierController` 现有发送接口会创建新通知，不能充当保留历史身份、权限、幂等和审计语义的重发。失败详情的重发按钮因此仍禁用并说明暂不支持，未增加批量重发。存储保留策略尚无 30 天契约，页面按服务可见历史查询，不加固定保留承诺。

验证（2026-11-11）：`node --test tests/messageNotification*.test.mjs` 94/94 通过；针对真实 SSE 契约完成最终修复后复跑 contracts / records / integration，46/46 通过，其他未变更回归沿用前次证据。日志 `/tmp/notification-records-complete-tests-{all,final}.log`。`pnpm exec vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 修改前后均为 235 项既有诊断，按文件、错误码及信息对比新增 0、移除 0，日志 `/tmp/notification-records-complete-types-{before,final}.log`；既有错误修复后仍需重跑。core 下 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notification-records-complete-build-final -- --module-name notify-manager-ui` 通过（23.72 秒），保留既有告警，日志 `/tmp/notification-records-complete-build-final.log`。两个变更 Vue 文件的定向样式门禁及模块 `git diff --check` 通过；模块没有独立 lint 脚本。该轮验证时中英日各 306 个 `messageNotification.*` 键一致；移除统计重试文案后为 305 个。

页面验证：9200 真实登录态默认失败列表正常，聚合修复后显示全部 184、成功 56、失败 128、重试中 0、已取消 0。隔离夹具检查跨页勾选，下载并读取 CSV，确认只包含两页已选的两条记录；检查历史全文 / 原因、对应模板和渠道跳转。390px 窄屏抽屉宽 358px、右边界为 390px，无页面横向溢出；表格允许内部滚动。未发送真实通知或写入真实业务数据，完整账号权限矩阵仍待环境验收。本地原型浏览器预览受策略限制，对照依据为原 HTML 的 `recRow/recTable/recDrawer/recSeg/recBulk` 与事件源码。

### 已配置渠道回显与就地保存

底部操作栏：`Channels/index.vue` 的新配置底栏仅保留左对齐的“保存”，移除“撤销修改”和底栏未保存提示；`useChannelsPage.ts` 清理仅用于旧底栏对齐的派生值。保存权限、校验、草稿与离开提醒保持原有行为。验证（2026-11-11）：渠道 / 契约回归 58/58、单文件样式门禁、模块构建（26.14 秒）和 `git diff --check` 通过；类型检查仍为上一轮相同的 213 项既有诊断，无新增或移除，待修复后重跑下方类型命令。工作区无独立 lint 脚本。9200 钉钉渠道页实测输入前后保存按钮均与表单左边缘对齐，“撤销修改”按钮数量为 0；测试输入已清空，未保存真实配置。日志前缀 `/tmp/notification-footer-`。

地域选择：`Channels/channelSchema.ts` 为阿里云语音和短信的 `regionId` 复用旧版 `views/notice/channel/hooks/noticeChannelModel.ts` 中的 28 个地域选项，经 `configuration/channelMetadata.ts` 和 `useChannelConfiguration.ts` 接入现有下拉编辑器及中英日翻译。后端仍返回字符串类型时也使用下拉列表，显示地域名称，保存字符串地域 ID；接口、必填规则及其他配置保持原有行为。

地域选择验证（2026-11-11）：`node --test tests/messageNotificationChannels.test.mjs tests/messageNotificationContracts.test.mjs` 58/58 通过，模块构建通过（29.74 秒，保留既有构建告警），三语地域键和 `git diff --check` 通过。模块类型检查前后均为 213 项既有诊断，无新增或移除；修复既有诊断后需在 `runtime-ui/` 重跑 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`。工作区无独立 lint 脚本，本次未修改 Vue 模板或样式。实际 9200 语音页下拉及中文选项已验证；隔离夹具中首次选择杭州并保存、已配置回显、改选北京自动保存均通过，页面无错误日志。未向真实后端保存凭据或发送通知，真实服务商连通性不在本次验证范围。日志前缀 `/tmp/notification-aliyun-region-`。

分组详情和单项保存覆盖动态后端目录中的全部提供商。公共表单为 `runtime-ui/jetlinks-web-core/src/components/InlineEditForm/`，通过 core 根入口或目录公开入口导出；API、事件、插槽和示例见组件 README。通知模块通过 `Channels/useChannelConfiguration.ts` / `ChannelConfiguration.vue` 映射业务元数据，`useChannelWorkspace.ts` 承载草稿、校验与提交，`useChannelsPage.ts` / `index.vue` 管理操作入口。

已有配置先展示已保存值，点击当前字段编辑；文本、密码、数字和多行文本失焦保存，普通单行字段也支持 Enter，选项选择后提交，Esc 放弃当前编辑，无变化不请求。字段没有保存 / 取消按钮；详情态移除字段底部的失败和加载文案，保存失败保留输入及控件错误状态，重新聚焦后离开可重试。下拉保存中使用 Select 自带 loading，其他控件保持提交锁定；首次填写仍保留必填等校验提示。请求头与 SMTP 扩展参数在焦点离开整个编辑区域时整体提交，区域内切换不请求；元数据弹窗沿用自身完成事件提交，避免开启浮层就误保存。首次配置继续保留分组输入、草稿与底部保存，已有配置没有常驻整页保存栏。回显下拉文本和右侧图标水平居中，详情 label 与提示使用较浅文字色。

非机器人渠道每个 `type/provider` 只提供一套配置入口：没有配置选择器和新增入口，已存在记录时 workspace 也禁止创建第二套。机器人由 `shared/catalog.ts` 的 `multipleConfigurations` 标记，动态目录继承该展示能力；当前后端机器人提供商为 `dingTalk:dingTalkRobotWebHook`，保留选择、增加、自动重名编号和删除。未知提供商默认单套，不影响动态渠道或字段发现。历史重复数据不自动删除：默认进入后端第一条，仍兼容明确配置 ID 的原有跳转，防止已引用模板错绑。此限制作用于本页面，不新增后端唯一约束或执行历史数据迁移。

单项提交只把本次字段或关联字段合并到已保存快照，不夹带其他失败编辑；写入成功后的读取失败只重试读取。保存期间锁定配置选择和其他字段；权限丢失后清理的配置不会被迟到的创建、更新或删除响应恢复。密码与 HTTP 请求头保持掩码、空值保留及禁止提交掩码的规则；不能安全保留的凭据明确要求重输。元数据新增字段和未编辑参数均保留。状态显示“已配置”，不推断服务可用性；按原型移除各渠道表单额外的“配置信息”分组、配置名称编辑及配置 ID 折叠展示，名称与 ID 仅在内部继续用于保存和关联。删除入口在更多菜单内，经独立弹窗确认。

配置信息移除验证（2026-11-11）：渠道测试 37/37、单文件定向样式检查、模块构建（24.34 秒）和 `git diff --check` 通过；模块类型检查保持 235 项既有诊断，无新增或移除，工作区无独立 lint 脚本。隔离浏览器确认邮件仅展示“邮箱服务商”“发件账号”，没有配置名称或 ID 区块，页面错误日志为空。日志前缀 `/tmp/notification-remove-config-information-`；未操作真实配置。

邮件预设一次提交服务器、端口和加密属性；选择“其他 / 自定义”打开服务器编辑，不伪造保存。加密切换仅联动原方式的标准端口，自定义端口和其他 SMTP 参数保留。说明在首次配置默认展开、已有配置默认收起，并记住当前页面中的开关选择；字段聚焦联动相关步骤。宽屏左右排列，窄屏上下排列。

边界：未增加原型中无后端支持的成员 / 部门对应、出口 IP、回调服务器或 Webhook 签名，不增加非邮件试发。AgentId、短信签名等模板字段仍归模板；未知提供商不跳转到不兼容模板。模板、记录页业务流程和运营端 `ui/` 未因本轮表单修改而改变。

验证（2026-11-11）：`node --test tests/messageNotification*.test.mjs` 106/106，通过单配置限制、历史 ID 兼容、机器人多套与自动命名、首次草稿、凭据保护和失败恢复回归；core `node --test tests/inlineEditForm.test.mjs` 8/8，包含复合控件焦点边界、失焦重试和卸载后的待执行失焦失效。core 独立严格类型检查通过；模块类型检查仍为 235 项既有诊断，新增 0、移除 0。3 个 Vue 文件定向样式门禁通过；工作区无独立 lint 脚本。模块构建通过（25.45 秒，保留既有 CSS 注释与大体积 chunk 告警），core 与模块 `git diff --check` 通过。最终日志前缀 `/tmp/notification-inline-followup-`。

浏览器通过隔离内存夹具验证：非机器人无选择 / 新增入口，字段失焦保存与失败后再次失焦重试，编辑区无保存 / 取消按钮；SMTP 属性内部切换保持编辑，离开后保存并可重新读回；机器人可创建第二套并自动编号。回显下拉文字与图标垂直中心偏差为 0，标签 / 提示浅于字段值。既有首次必填、未知提供商 false / 0 / 掩码、多配置 ID 跳转、说明联动及窄屏证据沿用前次未改变逻辑，并补充本轮 390px 回显核对：scrollWidth 为 390px、无配置选择器、下拉对齐保持一致，浏览器错误日志为空。`tests/messageNotificationBrowser/smoke.mjs` 已同步且语法检查通过，本轮未执行完整脚本，浏览器交互通过 CUA 完成。没有修改真实配置或发送通知；完整账号权限矩阵和真实服务商连通性未验证。

底部反馈调整验证（2026-11-11）：channels / contracts 测试 57/57、core 测试 8/8 及独立严格类型检查通过；模块类型检查仍为 235 项既有诊断，与上一轮归一化行号后对比无新增或移除。`InlineEditField.vue` 定向样式检查、模块构建（25.62 秒，保留既有告警）及两处仓库 `git diff --check` 通过；工作区无独立 lint 脚本。隔离夹具增加可选 `writeDelay`，CUA 实测保存中显示 Select 原生加载图标，失败后保留 STARTTLS 输入和控件红框、底部反馈节点为 0，再次失焦重试成功，页面错误日志为空。仅写入夹具内存，未修改真实配置或发送通知；未改动交互沿用上一轮验证，完整 smoke 脚本未重复运行。日志前缀 `/tmp/notification-inline-feedback-`，失败与加载截图为 `/tmp/notification-inline-feedback.png`、`/tmp/notification-inline-feedback-loading.png`。

### 全部后端渠道首次配置

历史多配置展示修复（当前新增与选择入口以本页上节单配置规则为准）：进入已有配置的渠道时默认打开后端列表第一条，之后优先恢复上次选择或新增草稿；带配置 ID 的跳转仍精确匹配，失效链接不自动展示其他记录。改动限定 `Channels/useChannelWorkspace.ts` 的初始选择与相关回归，保留手动切换、凭据保护和现有保存流程。2026-11-11 验证：channels / contracts 50/50 通过，覆盖默认选择、路由同步、选择记忆、草稿保留、失效链接及被删除的记忆记录；9200 真实登录态确认邮件两项配置均可回显，进入邮件自动选中第一条，密码空显且保存保持禁用，未写入配置或发送通知。模块 `vue-tsc` 前后均为 235 项既有诊断，新增 0、移除 0；模块构建通过（28.80 秒），`git diff --check` 通过。无独立 lint 脚本，本次未修改 Vue / CSS；浏览器 smoke 断言已同步并通过语法检查，本轮未执行完整脚本。日志 `/tmp/notification-config-selection-{tests,types-before,types-final,build}.log`。

2026-11-11 已修复首次配置误报失败：真实部署的 `ConfigMetadata.properties` 使用 `property/type`，页面此前只接受 `id/valueType`，导致 HTTP 200 被误判为失败。`api/notice/notificationConfigMetadata.ts` 在 API 边界统一转换字段及嵌套类型，保留约束、默认值、描述与旧结构兼容。已核对后端 `HttpWebHookNotifierProvider` 默认返回空元数据，仅对成功响应且元数据为空的 `webhook:http`，按真实 `HttpWebHookProperties` 补充 `url` 和 `headers`；未知提供商、错误响应及损坏结构仍显示失败。`configuration/channelMetadata.ts` 同时保护后端描述为字符串的已知凭据字段，包括微信服务号的 `secret`。

本次修复验证：模块测试 98/98 通过；加强真实响应结构与空元数据回归后，contracts / channels 49/49 通过。模块 `vue-tsc` 修改前后均为 235 项既有诊断，按文件与诊断内容对照新增 0、移除 0；模块构建通过（35.11 秒），保留既有构建告警。命令沿用下方测试、类型检查与构建入口，日志 `/tmp/notification-metadata-fix-{tests-final,focused-final,types-before,types-final,build-final}.log`。工作区无独立 lint 脚本；本次未修改 Vue / CSS，未重复样式门禁，`git diff --check` 通过。

真实页面只读验收：9200 登录态核对后端全部 8 个提供商（阿里云短信、钉钉机器人 / 工作通知、企业微信 / 微信服务号、Webhook、阿里云语音、邮件），首次配置表单均正常加载；邮件保留两项已有配置与新增入口，微信服务号凭据使用密码输入。未保存真实通知配置或发送通知。短信修复截图为 `/tmp/notification-metadata-fix-sms.png`；完整账号权限矩阵仍待环境验收。

目标与已确认边界：通知渠道页以 `/notifier/config/types`、`/notifier/config/type/{type}/providers` 及 `/notifier/config/{type}/{provider}/metadata` 为目录与配置字段来源，后端返回哪些可配置提供商就展示哪些。未配置时直接展示分组表单、渠道状态、默认展开的右侧配置说明与保存操作；标识和名称自动生成。机器人保留多配置，其他渠道采用单配置入口；保留权限、密钥、草稿保护，不新增后端能力，不调整模板 / 记录页业务流程。

实施入口：`views/system/MessageNotification/Channels/` 承载动态目录、元数据表单、首次草稿和专属说明；`api/notice/messageNotification.ts` 与类型提供现有接口的类型化封装；`shared/` 的目录、导航和凭据工具增加可注入的渠道上下文，其他页面保持兼容。渠道类型不再受六类字符串联合约束；既有七种定义只作为展示增强，未知类型 / 提供商由后端名称、字段和描述生成界面。中英日资源同步更新。

已实现：`useChannelCatalog.ts` 加载类型 / 提供商目录、批量配置快照与元数据，类型失败独立重试，配置查询失败不产生未配置状态。`configuration/channelMetadata.ts`、`channelSchema.ts` 与 `ChannelConfiguration.vue` 按元数据保留全部字段，既有渠道提供分组、凭据与校验增强；`configuration/ChannelHelp.vue` 提供默认展开、可收起的说明。`useChannelWorkspace.ts` 为每个新草稿生成一次 32 位随机标识，名称由渠道 / 提供商名称组成并在重名时追加序号；默认值不计脏，首次保存可触发校验。切换、重置和保存失败保留草稿身份；已成功写入但刷新失败时只重试读取，已有配置不自动改名。

兼容约束：邮件快捷填充与加密选项映射实际 SMTP 参数并保留扩展项；AgentId、短信签名等模板字段不移入渠道配置；不生成原型中的演示 IP、回调地址或不受支持的参数。未知提供商的凭据依据元数据识别，保留已知渠道的凭据补充定义及 HTTP header 保护。仅对现有支持渠道提供模板跳转与试发。目录或配置查询失败不解释为未配置，单类型失败可独立重试。

验证（2026-11-10）：在 `runtime-ui/` 执行 `node --test modules/notify-manager-ui/tests/messageNotification*.test.mjs`，88/88 通过，其中渠道 29 项，覆盖目录增减、同类型多个提供商、未知字段与默认值、部分失败 / 权限变化、生成身份 / 重名、必填校验、保存失败 / 写后读取失败、草稿切换与凭据保护；API 契约另覆盖异常目录、元数据及配置响应。日志 `/tmp/notification-first-config-tests-final.log`。中英日各 299 个 `messageNotification.*` 键一致。

类型与构建：`pnpm exec vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 仍返回 235 项既有诊断，与修改前按文件、错误码与消息对照，新增 0、移除 0；日志 `/tmp/notification-first-config-typecheck-{before,final}.log`，既有诊断修复后需重跑。core 下执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notification-first-config-build -- --module-name notify-manager-ui` 通过（24.88 秒），日志 `/tmp/notification-first-config-build.log`，保留现有输出配置、CSS 注释、分块与浏览器基线数据告警。3 个变更 Vue 文件的 `check-ui-style.mjs --files` 定向样式检查及 `git diff --check` 通过；工作区无独立 lint 脚本，不能记为完整 lint 通过。

浏览器：通过现有 `tests/messageNotificationBrowser/` 隔离夹具逐项检查邮件、钉钉应用 / 机器人、企微、短信、语音、Webhook 和新增类型的两个提供商；验证分组与说明、SMTP 快捷填充 / 加密、首次空白校验、说明收起 / 展开、切换草稿、未知提供商保存与凭据空显、已有多配置选择 / 编辑 / 删除、首次保存失败后的重试、查询 / 元数据失败后的重试、无新增 / 无查询权限。桌面及 390px 窄屏布局通过，窄屏也保留单类型失败重试入口；最终页面错误日志为空。截图在 `/tmp/notification-first-config-browser/`。保存、删除仅发生于夹具内存，未写入真实通知配置或发送通知；真实部署的提供商元数据与完整权限矩阵仍需环境验收。

参考限制：原型已通过本地 HTML / CSS / 交互源码核对；浏览器安全策略不允许打开该 `file://`，没有进行原型截图对照。`jetlinks-web-style` 在共享仓库中不存在，采用已安装 `jetlinks-web` 的页面分型与风格规则。

### 通知渠道导航

以下保留既有树样式调整记录；当前目录来源与首次配置行为以上节“全部后端渠道首次配置”为准。

`/system/notification/channels` 的导航以邮件、钉钉、企业微信为一级入口，保留短信、语音、Webhook。钉钉下设工作通知、群机器人，企业微信下设当前支持的工作通知；子级沿用 catalog 的实际 type/provider ID。按用户指定的设备空间树调整为 core `AutoTree`：名称搜索、层级连接线、加减展开按钮和整行选中态，图标继续复用 core `assets/notice` 的旧通知配置图片。实现限定在 `views/system/MessageNotification/Channels/index.vue`（树与图片）与 `useChannelsPage.ts`（树数据、搜索、展开和选择），标签由中英日语言资源提供。大类点击仅切换展开状态，叶子选择进入实际配置；搜索父类保留其子级，搜索子级保留祖先并展开，清空恢复完整树且保留当前选择。不改变请求、权限、表单或其他页面，两个源文件分别为 108、127 行。

验证：`node --test modules/notify-manager-ui/tests/messageNotificationChannels.test.mjs` 19/19 通过；在 core 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notification-tree-build-final -- --module-name notify-manager-ui` 通过（29.43 秒），保留分块等构建告警。`pnpm exec vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 与上一版相比仍有 235 条既有诊断，忽略行号后完全一致，本次无新增错误；修复既有诊断后需重跑。模块与 runtime 工作区未配置独立 lint / 样式门禁脚本，`git diff --check` 通过。浏览器使用现有隔离夹具验证了图片和层级线、大类折叠、父类与子级搜索、自动展开、无匹配空态、清空恢复与选择保留、钉钉群机器人及企微工作通知切换、高亮和返回邮件。真实后端与完整登录页面待通过 `pnpm dev` 复核，本次未发送通知或修改业务数据。

### 产品列表风格对齐

- 结论：消息通知三页已按用户指定的 `http://localhost:9200/#/resources/devices/products` 及其源码统一页面布局。owning module 为 `runtime-ui/modules/notify-manager-ui`，仅调整本模块的展示层与验证夹具。
- 已核实差异：2026-11-10 在 9200 登录态查看产品页、渠道页、模板目录及编辑态、记录页。产品页使用连续白底面板、15rem 可折叠左栏、细分隔线、紧凑工具栏与标准表头；通知页额外叠加独立 `PageHeader` 卡片和左右 `ContentPanel`，模板渠道切换悬在面板外，记录表格存在额外内边距。
- 风格事实源：`runtime-ui/modules/device-manager-ui/views/device/Product/index.vue`、同目录 `components/ProductCategoryTree.vue`；复用当前 core 的 `FullPage`、`EqualHeightColumns`、`ConditionFilter`、`TableActions`、`CloudEmpty`、`StickyActionBar`。已核对组件注册、`ContentPanel/README.md` 和 `EqualHeightColumns/README.md`；不复制产品模块的业务组件或私有样式。

| 页面与首要任务 | 确定的布局方案 | 操作与状态 |
| --- | --- | --- |
| 通知渠道：选择并维护一项通知配置 | 15rem 渠道导航与右侧配置工作区共用一个连续面板；移除独立页面标题及左右卡片；配置选择器限制合理宽度，与新增等操作组成紧凑工具栏 | 机器人保留多配置选择；其他渠道直接展示单套配置；已有配置失焦保存，首次配置保留底部保存；帮助信息仍贴近配置内容 |
| 消息模板：查找模板并编辑、预览 | 当前布局以上方“系统通知模板原型对齐”为准：15rem 可折叠模板目录，右侧标题操作、渠道切换与效果预览；新增 / 刷新收纳到更多菜单 | 默认查看，显式编辑；保留变量、附件、草稿与保存能力，长表单独立滚动，窄屏使用模板选择器 |
| 通知记录：筛选并查看发送结果 | 单一连续面板；`ConditionFilter`、状态筛选和操作组成紧凑工具栏；使用无额外内边距的 `j-pro-table`，对齐表头、状态标签、固定操作列与分页 | 保留查询不可用、权限不足、加载、错误及空态，继续使用详情抽屉；不为视觉补齐虚构记录或数量 |

- 实施范围：三页 `index.vue` 及必要的展示子组件 / 页面 hook；`index.ts#getContentPanelOverrides` 恢复三页使用项目默认面板，页面内部移除重复面板并使用透明 `FullPage`；相关装配测试、浏览器测试和本节同步更新。新增或调整的文案沿用中英日 i18n，组件保持现有职责边界。
- 范围之外：不改 `ui/`、产品参考页、core 公共组件、后端、菜单 URL / 权限、API / 数据结构或业务流程；不执行菜单初始化、真实通知发送或业务数据写入；不接入此前暂缓的历史查询。保留现有未提交内容及草稿、密钥、附件保护。
- 实现入口：`index.ts#getContentPanelOverrides` 返回空配置，由平台提供唯一的 `ContentPanel`；三页 `index.vue` 使用透明 `FullPage` 和 `shared/layout.css`。渠道及模板左栏统一 15rem，复用 `EqualHeightColumns` 的默认间距、分隔线与折叠；渠道工具栏关联操作保留原可见条件。模板目录和表单独立滚动，`StickyActionBar position="inline"` 占据独立底行，预览用细分隔线划分。记录工具栏进入 `j-pro-table#headerLeftRender`，使用 `pro-table__no-padding`、`j-badge-status` 与有可访问名称的图标详情按钮，保留服务端状态文字。
- 本轮验证（2026-11-10）：`node --test modules/notify-manager-ui/tests/messageNotification*.test.mjs` 通过 73/73；实际菜单与 core 装配仍执行生产源码，测试环境显式隔离其他模块的请求和运行时上下文。定向样式检查通过 6 个变更文件，`git diff --check` 通过；工作区无独立 lint 脚本，未将样式检查记为完整 lint。
- 类型检查：模块 `vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 仍返回 235 项既有诊断；与本轮修改前按文件、诊断代码及信息对比，新增 0、移除 0。日志为 `/tmp/notification-product-style-typecheck-before.log` 和 `/tmp/notification-product-style-typecheck-final.log`；类型检查尚未全绿，既有问题需要单独处理。
- 构建：通知模块构建通过（26.86 秒），日志 `/tmp/notification-product-style-build-final.log`；沿用已有依赖，以 16 GB 堆上限执行 Vite 模块构建，输出至 `/tmp/notification-product-style-build-final`，保留既有构建警告。本轮未重复全量 runtime 构建。
- 浏览器验证：在 9200 真实登录态只读检查渠道空态 / 已保存配置、模板目录 / 真实模板编辑态和记录不可用态，三页均只有一个内容面板，桌面无页面横向溢出；渠道与模板侧栏宽度为 240px，保存栏可见。另通过浏览器操作现有隔离夹具，检查 1440px 桌面和 390px 窄屏、折叠 / 展开、渠道与模板保存、草稿切换、长表单滚动、记录筛选及详情关闭后的焦点返回。记录表格在窄屏内部横向滚动。保存操作仅写入夹具内存；真实服务未保存、删除或发送通知。本轮没有重新执行下文历史 `smoke.mjs` 27 项自动回归。
- 视觉验收时的限制：当时历史查询未接入，非空记录、筛选、分页和抽屉通过单元测试及隔离数据验证；当前接入与实测结果见“通知记录全局查询”。真实账号权限矩阵、业务写入和发送接口不在该次视觉验收范围。
- 技能状态：已使用安装的 `jetlinks-web` 页面分型、业务参考和组件来源规则；按共享仓库 `master/jetlinks-web-style` 自动安装返回 `Skill path not found`。当前 `jetlinks-web` 已包含相应规则，本次以其和用户指定产品页的当前实现为依据。

### 迁移边界与既有实现

URL 简化：按用户要求，将本模块消息通知菜单组及三个子页的 URL 统一为 `/system/notification` 与 `/system/notification/{channels,templates,records}`；保持菜单 ID、路由代码和权限标识。验证：JSON 解析、四条路径映射、现有菜单 / 路由集成测试 10/10、`git diff --check` 通过；本次仅修改静态 URL 和文档，未重复 lint / 类型检查 / 构建。已初始化环境需同步菜单 URL 并刷新页面，本次不写入服务端菜单。

开发环境页面加载：运行中的 Vite 服务若在新增页面后仍缓存旧的 `import.meta.glob` 路由表，可能出现菜单可见但页面空白。应检查实际服务返回的本模块 `index.ts` 路由清单，并触发入口更新（在 `runtime-ui/` 下执行 `touch modules/notify-manager-ui/index.ts`）或重启 Vite 服务，再刷新浏览器。迁移时触发入口更新后，在 9200 登录态直接访问并刷新模板页和记录页均可渲染；记录页当前已接入全局查询。

目标与 owning module：用户已确认将通知渠道、消息模板、通知记录从 `ui/modules/authentication-manager-ui` 迁入运行时 `runtime-ui/modules/notify-manager-ui`。保留 `views/system/MessageNotification/` 路径、`contract-v1` 类型 / API 签名、真实 ID、路由与前端动作标识；新独立 `system/MessageNotification` 菜单组归属 `iot`，后端权限沿用已核实的 `notifier` / `template` 映射。

迁移时的范围之外：保留既有告警中心 `Notify`、`views/notice/template` / `channel`、订阅型接口及权限 / 资产配置；保留目标已有未提交文件。历史 HTTP 查询在迁移阶段暂缓，现已按“通知记录全局查询”接入；不修改 core / 后端，不启动或停止用户服务，不执行真实菜单初始化、授权或通知发送。源目录只在目标集成验收后移除本轮新增内容，不恢复或覆盖其他改动。

实施顺序：A 核对目标 core 后复制 shared / API 并冻结公共边界；A / B / C 分别迁移渠道 / 模板 / 记录，全部请求、状态编排和副作用抽入 hook / service，组件负责渲染与事件委托。A 保留目标模块注册并统一整合菜单、三语 `messageNotification.*` 文案和本节；主代理完成集成、类型基线对照及构建验收后再清理源内容。组件最多五层、单文件不超过 300 行，优先使用本地 core 能力。

验证：复跑公共契约、渠道 / 模板 / 记录与实际模块装配集成；确认新菜单初始化资源筛选、旧菜单完整树和旧注册不变；检查三语键、core 组件属性、草稿 / 密钥 / 附件 / 预览 / 抽屉交互与窄屏滚动。执行定向样式门禁、目标模块类型检查并对照迁移前诊断、模块构建和必要聚合构建。现有类型错误与新增问题分开记录，环境联调和历史查询接入限制完成后回填本节。

当前状态：公共基础与三页已迁入目标，菜单 / 三语 / 模块入口已整合；源模块迁移时新增代码、菜单、语言键及文档已清理，只保留其原有改动。迁移验收见下文历史记录；当前历史全局查询已接入并完成真实页面只读验证，类型检查与完整权限矩阵的限制见对应验证段。

| 页面 | 目标入口与 core 复用 | 已实现范围 |
| --- | --- | --- |
| 通知渠道 | `views/system/MessageNotification/Channels/`；`EqualHeightColumns`、`InlineEditForm`、`StatusPill`、`JlDrawerShell` | 真实配置查询 / 选择 / 新增 / 编辑 / 保存 / 删除，非机器人单套回显、机器人多套切换；邮件参数与已有模板试发校验；渠道导航、草稿隔离、失败恢复与离开提醒 |
| 消息模板 | `views/system/MessageNotification/Templates/`；`SwitchGroup`、`FileUpload`、`StickyActionBar` | 实际模板目录及记录查询 / 新增 / 编辑 / 保存；一次保存一个 ID；变量光标插入、明确的示例预览及真实附件引用 |
| 通知记录 | `views/system/MessageNotification/Records/`；`ConditionFilter`、`j-pro-table`、`TableActions`、`JlDrawerShell` | 全局历史查询、分状态 SSE 聚合、真实字段与条件 / 状态 / 分页、内容详情 / 对应配置与模板跳转、跨页选择及 CSV 导出；保留请求取消、竞争保护与隔离测试注入 |

`index.ts` 保留目标模块原有 `register`、异步路由 glob 和其他导出；三页现通过空的 `getContentPanelOverrides` 使用平台默认面板，页面内部不重复套面板。页面路由代码维持 `system/MessageNotification/{Channels,Templates,Records}`，URL 为 `/system/notification/{channels,templates,records}`；`baseMenu.ts` 仍统一添加 `runtime: true` 与 `options.appName: 'notify-manager'`。新增菜单贡献通过 core 真实 `getModulesMenu` 和 `init-home/data#mergeTrees` 合入既有 `system` 父路径。新组与三页归属 `iot`，既有 `alarm-center/Notify` 子树、`notify-channel` 权限与 `notifyConfig/notifySubscriberProvider` 资产配置完整保留。

运行时约束已落实：渠道页面编排由 `useChannelsPage` 承载，配置字段、键值编辑和抽屉焦点分别在 `useChannelConfiguration`、`useConfigurationPairs`、`useChannelSendDrawer`；模板 / 记录同样将请求、路由、状态与副作用放入各页 hook / service。组件只声明视图、props 和事件委托，复杂视图状态合并为局部 model；无新增超过 300 行的 Vue 文件，组件层级不超过五层。`EqualHeightColumns` 使用 15rem 左栏、1fr 右栏和组件默认间距，平台 `ContentPanel` 内通过 flex 与 `min-height:0` 管理独立滚动，窄屏使用选择器。

公共边界位于 `api/notice/messageNotification{Types,State,}.ts` 与 `views/system/MessageNotification/shared/`，与迁移源 `contract-v1` 签名一致。渠道 catalog 统一七个已核实类型 / provider，未知提供商不借用其他编辑器；配置 / 模板使用实际 ID，不建立七类业务模板持久化关系。配置使用 `/notifier/config/**`，模板使用 `/notifier/template/**`，试发使用 `/notifier/{configId}/{templateId}/_send`。mutation 返回 unknown，成功后以已知 ID 刷新，不猜测返回的新 ID。

公共消费入口：`messageNotificationTypes.ts` 定义配置、模板、历史记录、分页、查询、邮件参数 / 附件 / 变量；`messageNotification.ts#messageNotificationApi` 提供 `queryConfigs/getConfig/createConfig/updateConfig/deleteConfig`、`queryTemplates/getTemplate/createTemplate/updateTemplate/deleteTemplate`、`queryHistory(query, signal)`、`countHistory(filter, signal)` 与 `send(configId, templateId, variables)`。查询校验并归一化分页，写入方法仅在响应 success 后更新已保存状态，历史聚合单独解析已核实的 SSE 响应；401/403 单独归为无权限，网络或格式失败不冒充空结果。`shared/index.ts` 统一导出 catalog、导航、密钥适配、状态与配置刷新事件，禁止页面自行维护另一份渠道或 ID 映射。

共享导航键为 `channel/configId/templateId/state`，路由保留查询与选择，编辑草稿只留页面内存；密钥不写浏览器持久存储。读取凭据后编辑输入为空，空值不作为清空，掩码不会提交；旧凭据缺失或只有掩码时须重输。HTTP header 值同样按凭据保护。保存失败保留输入，已成功保存但刷新失败不重复新增；刷新事件只携带白名单 ID / 渠道 / 动作，不带凭据。试发只支持本轮核实的邮件参数，要求实际兼容模板、所需变量 / 接收人与附件参数、权限和显式确认，发送期间固定上下文。

后端权限依据：已只读核对 `jetlinks-v2/notify-manager` 的 `2.20` 固定提交 `09d3deac0fb96e2eaae37e4aca4a662be5e4f52d`。该仓库 `src/main/java/org/jetlinks/pro/notify/manager/web/` 下的 `NotifierConfigController` 使用 `/notifier/config`、`@NotifierResource`、`AssetsHolderCrudController`；`NotifierTemplateController` 使用 `/notifier/template`、资源 `template`、`CorrelatesAssetsHolderCrudController`；`NotifierController` 的模板 ID 发送方法显式声明 `send` 动作。workspace 的 `notify-core/NotifierResource` 将通知资源定义为 `notifier`，既有后端 UI resource fixture 交叉确认 `query/save/delete/send`。

| 页面 / 前端动作 | 后端资源 / 动作 |
| --- | --- |
| 渠道页面、`query` | `notifier/query` |
| 渠道 `add`、`update` | `notifier/query,save` |
| 渠道 `delete` | `notifier/query,delete` |
| 渠道 `action`、模板预留 `action` | `notifier/query,send` + `template/query` |
| 模板页面、`query` | `template/query` + `notifier/query` |
| 模板 `add`、`update` | `template/query,save` + `notifier/query` |
| 模板 `delete` | `template/query,delete` + `notifier/query` |
| 记录页面、`query` | `notifier/query`，全局历史查询由后端按资产范围过滤 |

渠道 / 记录 `showPage` 为 `notifier`，模板为 `template`。core 初始化过滤按资源 ID 任一匹配保留叶子与按钮，不替代账号 action / 资产范围授权：无通知资源时移除新组，仅 `notifier` 时保留渠道 / 记录，仅 `template` 时保留模板候选，同时提供两项资源时保留三页。模板实际读取配置，需要 `notifier/query`；渠道试发保留前端 `Templates:query` 检查。菜单声明可在支持这些资源的环境同步或初始化并配置功能授权与资产范围，本轮不执行环境写入。

历史 HTTP 源码已核实：上述固定提交的 `NotifyHistoryController` 使用类级 `/notify/history` 与 `@NotifierResource`，全局 `POST /_query` 返回 `NotifyHistory` 分页，通过 `AssetsHolder.injectQueryParam` 按保存的 `notifyConfig` bindings 注入资产范围。方法没有显式 `@QueryAction`，菜单沿用既有 `notifier/query` 查询映射；前端 `messageNotificationApi.queryHistory(query, signal)` 已接入并在 9200 登录态读取真实历史。历史状态为 `success/error/retrying/cancel`，详情展示服务端发送内容与固定摘要字段，不按当前模板重算；统计不可用时界面数量缺省显示 0；已支持已选记录本地导出，重发仍未启用，不承诺 30 天保留。

附件上传遵循独立环境权限：core `FileUpload` 使用 `/file/upload`，后端 `FileManagerController` 要求登录；`FileProperties` 开启权限校验时另需 `file-manager/upload-any` 或 `upload-<suffix>`（默认未启用）。新模板菜单不自动授予任意上传权限，不复制旧 `file/upload-static`，不改资产授权模型。模拟数据只在测试中，不进入生产请求回退。

已实现并接入：目标渠道配置 CRUD、模板真实记录编辑、变量预览 / 附件、菜单后端权限声明与中英日各 202 个 `messageNotification.*` 键。所有原语言键保留。

记录页已接入全局 HTTP 查询，真实字段、状态筛选、分页与详情已在登录环境验证。真实账号完整授权矩阵与发送接口联调仍待环境验收。

本轮暂缓：七类业务模板绑定 / 恢复默认、站内信模板、成员写入及自动匹配、未知提供商、非邮件试发、历史重试、30 天保留、出口 IP 与回调参数来源。

### 迁移时的验证记录（历史）

以下为此前迁移阶段的验收记录，本轮风格调整结果以上文为准。

统一测试 73/73 通过：公共契约 14、渠道 19、模板 19、记录 11、公共装配集成 10。集成测试执行真实目标 `baseMenu.ts`、Vite 模块 glob、core `getModulesMenu` / `mergeTrees` / `handleMenus` / `authButtons` 与初始化过滤，隔离无关模块注册及网络 I/O；三语解析使用实际 runtime i18n。12 个 Vue 文件定向样式检查通过；旧菜单完整树与原中英日各 383 个语言键保持不变，目标 4 个原有未提交文件 SHA256 与迁移前一致。源 `authentication-manager-ui` 仅余原有 README“应用管理缺省状态”改动，源 `git diff --check` 通过。

最终 FileUpload 专用入口版本的隔离浏览器回归 27/27 通过（退出码 0），页面异常 0、业务 / 外网请求尝试 0，共 11 张最终截图，报告 `/tmp/message-notification-runtime-browser/report.json`。覆盖渠道保存与密钥保护、真实滚轮后的保存按钮可达、模板窄屏工作区、草稿切换、变量光标插入、保存失败恢复、离开提醒及记录详情抽屉焦点返回；测试注入仅位于 `tests/messageNotificationBrowser/`，不进入生产请求回退。并行构建期间有一次页面加载 6 秒超时、未进入断言，单独记录于 `/tmp/message-notification-runtime-browser-load-timeout.json`；构建后预热并沿用原超时阈值复跑通过，无生产代码改动。

迁移时已在真实 Chrome 9200 只读验证：进入初始化页的菜单预览，展开“系统设置 → 消息通知”，三页名称、代码与当时的 URL 均显示；没有点击确定、初始化或授权。当前 URL 已按上文简化，路径映射通过菜单 / 路由集成检查验证。真实账号功能权限、资产范围和配置 / 模板 / 发送接口联调仍待环境验收，本轮未发送通知。

在 `runtime-ui/` 可重跑以下已执行的测试与浏览器检查。浏览器使用现有 `127.0.0.1:9200` Vite 服务，允许通过 `SMOKE_BASE_URL` / `SMOKE_OUTPUT` 指定地址与输出目录；`SMOKE_PLAYWRIGHT_MODULE` 只引用本机已安装的 Playwright，不安装或改动运行时依赖。

```sh
node --test modules/notify-manager-ui/tests/messageNotification*.test.mjs
SMOKE_PLAYWRIGHT_MODULE=/Volumes/SSD/work/jetlinks/cloud.jetlinks/ui/node_modules/playwright node modules/notify-manager-ui/tests/messageNotificationBrowser/smoke.mjs
```

最终模块类型检查未通过（退出码 2）：迁移前 234 项，迁移后 235 项，新增 1、移除 0；新增项为已有 `jetlinks-web-core/src/components/Upload/File/index.vue:60` 的 `PreviewGroupPreview` 不接受 `minScale`（TS2353），由实际复用 FileUpload 引入，新迁移通知代码无诊断。模板已改用专用 FileUpload 入口，避免总组件 barrel 扩大无关类型覆盖；本轮不修改 core。日志 `/tmp/message-notification-runtime-typecheck-final.log`。在 `runtime-ui/` 复跑 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`，仍需解决既有类型问题后再次验收。

样式检查实际使用 `runtime-ui/` 下的 `node ../ui/scripts/check-ui-style.mjs --files <modules/notify-manager-ui/views/system/MessageNotification/ 下12个Vue相对路径>`；工作区没有独立 lint 脚本，不能将定向样式检查记为完整 lint 通过。

最终模块构建通过（退出码 0，8,378 个模块，21.98 秒），日志 `/tmp/message-notification-runtime-module-build-final.log`；全量 runtime 构建通过（退出码 0，30,360 个模块，3 分 3 秒），日志 `/tmp/message-notification-runtime-full-build-final.log`。全量首轮 8 GB 堆上限曾不足，最终两项统一以 16 GB 上限执行；在 `runtime-ui/jetlinks-web-core/` 重跑命令如下，不修改依赖或 lock 文件。

```sh
node --max_old_space_size=16384 --max-semi-space-size=64 ../node_modules/vite/bin/vite.js build -- --module-name notify-manager-ui
node --max_old_space_size=16384 --max-semi-space-size=64 ../node_modules/vite/bin/vite.js build
```

构建保留既有的大 chunk、`User.vue` 重导出循环依赖、静态 assets 无法在 build-time 解析等警告；另提示 visualization player 未构建、部署后导出能力不可用。这些不是本次通知模块构建失败，但仍属于现有部署限制。

## 待接入的通知模板辅助代码

`views/notice/template/components/TemplateTypeList.vue`、`views/notice/template/hooks/useTemplateDetail.ts` 和 `views/notice/hooks/{noticeResponse,useNoticeDraftGuard}.ts` 属于原有通知模板模块，当前仅纳入版本管理，尚未接入页面或 API 调用，不改变现有页面行为。详情 hook 内部引用草稿保护 hook，但现有 `TemplateDetail.vue` 仍使用自身编辑逻辑，类型列表与响应校验也没有调用方。

后续接入前需补齐中英日 `NoticeCenter.draft.{title,description,discard,keep}` 文案，并验证离开确认、切换选择及保存期间草稿保护。当前 `TemplateTypeList.vue` 定向样式检查通过，四个文件与上轮模块类型检查时内容一致、没有自身诊断；模块类型检查仍受 235 项既有诊断限制。上轮构建通过不代表这些未引用代码已经完成运行时验收。

## 消息模板查询权限

`baseMenu.json` 的消息模板菜单及查看、编辑按钮补充 `notify-channel:query`，编辑按钮同时补充 `template:query`，对齐后端单通道与聚合模板查询同时要求两项查询权限的契约，保留现有保存权限。范围仅限运行时前端菜单，不修改后端及运营端。验证：JSON 解析、菜单及按钮权限映射检查、`git diff --check` 均通过；本次仅修改静态菜单与说明，未执行 lint/typecheck/build。既有环境需同步菜单、更新角色授权并刷新登录态后，再验证模板查询；配置文件修改不会直接更新已登录账号权限，运行时授权生效情况待验证。

## 视觉告警跳转与跨标签刷新

- 目标：告警规则引导可按当前 AI 告警类型打开消息模板并定位对应节点，模板保存成功后安全通知原页刷新；保留草稿和权限边界，不自动保存或启用渠道。
- 实现入口：`views/notice/template/index.vue`、`views/notice/template/hooks/useNoticeTemplateCenter.ts`；告警原页在 `jetlinks-ai-ui/views/visual-alarm-preview/components/VisualAlarmRuleDialog.vue`。仅通过同源、限定消息的公开交互连接两个模块。
- 验证：告警类型定位、不可见提示、保存成功/失败通知、跨页消息隔离及并发刷新有自动化测试覆盖；测试员在 9101 登录态验证安全/合规模板保存后原页面自动刷新并保留草稿。无需修改后端；完整构建未执行，模块类型检查因其他路径诊断未通过。
## 通知渠道查询

- `api/notice-center.ts`、`views/notice/channel/hooks/useNoticeChannelCenter.ts` 使用标准 `/notifier/config/_query/no-paging` 与 `type in (...)` 一次读取当前权限的配置并按类型分组，避免逐类型请求及每类 50 条截断。切换渠道复用页面快照；保存后只刷新受影响类型，重新加载页面时替换全部快照。权限范围继续由后端判定。
- 元数据由统一详情入口加载，合并相同类型与服务商的进行中请求；过期响应不能回填表单，保存期间切换选择也不会覆盖新草稿。缓存仅在当前页面内有效。
- 验证：`node --test modules/notify-manager-ui/views/notice/channel/hooks/useNoticeChannelCenter.test.mjs` 通过 11 项回归；模块构建通过，浏览器实测首屏配置列表请求 1 次、短信→邮件→短信切换新增 0 次。模块 `vue-tsc` 仍有 229 项既有错误，与 HEAD 基线一致，无新增诊断；工作区无 lint 脚本或 ESLint 可执行文件。构建/类型检查需加 `--config.verify-deps-before-run=false` 使用现有依赖，避免 pnpm 11 自动重装依赖。

## 消息模板测试

- 目标：模板详情页支持测试已保存模板，只发送后端已持久化的模板版本。
- 影响范围：`views/notice/template/`，复用 `api/notice-center.ts` 的 `sendNotifierTest_api`。
- 实现入口：模板内容区的发送预览按钮触发测试，`useNoticeTemplateCenter` 透传测试状态，测试编排放在模板测试 hook 中。
- 不做：不测试未保存编辑内容，不使用通知渠道页的内联模板发送接口，不新增测试参数弹窗。
- 验证：执行下方构建命令，并手工确认请求路径为 `/notifier/{configId}/{templateId}/_send`。当前验证结果：`pnpm.cmd --filter jetlinks-web-core build -- --module-name notice-center-ui` 已通过。

## 消息模板保存回显

- 目标：模板保存后详情区立即回显后端已保存内容，并保持当前告警类型与渠道选中状态。
- 影响范围：`views/notice/template/hooks/useNoticeTemplateCenter.ts`、`views/notice/template/hooks/noticeTemplateModel.ts`。
- 实现入口：保存成功后恢复当前选中节点并强制重新查询 `_query-with-templates`；“使用的变量”只从模板 subject/message 的 `${变量}` 引用解析。
- 不做：不展示渠道可用变量全集，不把 `variableDefinitions` 当作“使用的变量”来源，不改后端接口。
- 验证：保存含 `${deviceName}`、`${triggerTime}` 的模板后只显示这两个变量；删除变量后为空。当前验证结果：`pnpm.cmd --filter jetlinks-web-core build -- --module-name notice-center-ui` 已通过，页面手工验证待联调环境执行。

## 消息模板变量名称展示

- 目标：所有通知渠道的模板详情在展示标题和正文时，将 `${detail.targetType}` 这类占位符显示为“告警类型”这类变量名称。
- 影响范围：`views/notice/template/hooks/useTemplatePreviewSegments.ts`、`views/notice/template/components/TemplateEchoGrid.vue`，同时覆盖模板预览与“模板内容”等只读字段。
- 长内容：只读字段最多展示 3 行，超出后显示省略号；仅在实际溢出时，鼠标悬停显示完整内容。
- 不做：不改变模板保存值、变量插入/复制内容、变量表格或后端接口；缺少名称时保留原占位符，避免丢失变量识别信息。
- 验证：使用 Node 22.18.0 执行 `pnpm --filter jetlinks-web-core build -- --module-name notify-manager-ui` 已通过，9200 开发服务已返回变量名称转换、3 行省略和溢出 Tooltip 配置；构建仅保留现有 CSS `//` 注释、大 chunk 等警告。

## 消息模板渠道参数编辑

- 目标：消息模板详情右侧按通知方式和服务商展示对应模板参数，字段与 `notify-manager-ui/views/Template/Detail/` 的模板表单保持一致。
- 影响范围：`views/notice/template/`、`locales/lang/zh.json`、`locales/lang/en.json`。
- 实现入口：`views/notice/template/hooks/noticeTemplateFormModel.ts` 负责渠道 provider 解析、默认模板、变量提取、提交归一化和回显字段；`TemplateDetail.vue` 负责详情编排；`TemplateContentSection.vue` 及局部子组件负责表单、变量列表和只读回显。
- 不做：不编辑模板名称和绑定通知配置，不引入 `officialMessage` 到正常渠道选择，不修改通知管理模块、运行端前端或后端接口。
- 验证：执行下方构建命令；页面手工确认钉钉、企业微信、邮件、语音、短信、Webhook 的字段、变量列表、保存回显和测试入口。当前验证结果：`pnpm.cmd --filter jetlinks-web-core build -- --module-name notice-center-ui` 已通过，页面手工验证待联调环境执行。

## 消息模板远程选项联动

- 目标：模板编辑区复用当前渠道已绑定的通知配置，短信模板、短信签名、短信接收人和企业微信部门 / 用户 / 标签通过远程选项选择。
- 影响范围：`views/notice/template/`、`api/notice-center.ts`、`locales/lang/zh.json`、`locales/lang/en.json`。
- 实现入口：`views/notice/template/hooks/useNoticeTemplateEditorOptions.ts` 负责按 `template.configId || channel.notifierConfig.id` 加载远程选项；`TemplateContentSection.vue` 合并字段状态；`TemplateFieldRenderer.vue` 只渲染通用 select / tree-select / remote-select。
- 不做：不在模板编辑区新增通知配置下拉，不修改保存 payload 字段，不修改后端接口；短信收信人选择平台用户后仍提交到 `template.phoneNumber`。
- 验证：执行下方构建命令；页面手工确认短信选择模板后回填并解锁模板内容，短信收信人提交手机号，企业微信填入 AgentId 后可选部门、用户和标签。当前验证结果：`pnpm.cmd --filter jetlinks-web-core build -- --module-name notice-center-ui` 已通过，页面手工验证待联调环境执行。

## 企业微信部门树回显

- 目标：已保存的企业微信接收部门在树选择器中只显示真实部门名称，不重复生成裸的部门 ID。
- 实现入口：`views/notice/template/hooks/noticeTemplateRemoteOptions.ts` 的 `findOptionByValue` 递归解析部门树；编辑态只有树中确实不存在当前值时才补充回显选项，只读详情卡片也使用真实部门名称。
- 不做：不修改企业微信部门接口、模板保存字段或后端部门树结构。
- 验证：覆盖嵌套部门 ID 的回显场景，并执行下方前端构建命令。

## 模板树默认展开

初次加载仅展开首个通知类型，其余默认收起；手动展开／收起后，重新查询保留仍存在的展开节点。搜索继续临时展开匹配节点，清除搜索后回到用户原来的展开状态，不调整类型启停或模板选中规则。实现入口为 views/notice/template/hooks/useNoticeTemplateCenter.ts，使用已有 TemplateTree 的展开回传。

验证：useNoticeChannelCenter.test.mjs 共 18 项通过，包括首次空结果后再加载、首分类展开、手动展开及全部收起、刷新移除失效节点；原模板查询、保存、权限和并发回归同时通过。未执行模块构建或全量类型检查，实际页面搜索与展开的联动仍需人工回归。

## 模板树状态开关

- 目标：左侧模板树的告警类型节点展示首字头像、启用状态和即时启停开关，渠道子节点继续展示渠道图标。
- 影响范围：`views/notice/template/components/TemplateTree.vue`、`views/notice/template/hooks/useNoticeTemplateCenter.ts`、`views/notice/template/hooks/noticeTemplateModel.ts`、`api/notice-center.ts`。
- 实现入口：告警类型节点的 `a-switch` 调用 `/notify/channel/{providerId}/enable` 或 `/notify/channel/{providerId}/disable`，完成后刷新树并恢复当前选中。
- 禁用态：父告警类型禁用时，树数据将状态传给其渠道子节点；父子节点文字、渠道图标及状态徽标使用 `--jet-theme-text-disabled`，开关保持可操作。只调整模板树展示，不改变选中、接口或状态切换行为。
- 不做：不为渠道子节点增加状态开关，不新增二次确认弹窗。
- 验证：`pnpm --filter jetlinks-web-core build -- --module-name notify-manager-ui` 已通过；本地页面中已禁用的告警类型及全部渠道子节点文字、SVG 图标、状态徽标颜色均为 `--jet-theme-text-disabled`，开关仍可操作。恢复启用的切换过程未实测；`pnpm exec vue-tsc --noEmit --project modules/notify-manager-ui/tsconfig.json` 仍受现有全局与模块类型错误阻断，当前工作区无 lint 脚本或 ESLint 可执行文件。

## 消息模板渠道变量保存

- 目标：模板保存时自动补齐 `channelConfiguration.variables`，避免请求体只提交 `{}`。
- 影响范围：`views/notice/template/hooks/noticeTemplatePayload.ts`、`views/notice/template/hooks/noticeTemplateChannelVariables.ts`。
- 实现入口：保存 payload 构造阶段根据 `channelProvider` 和模板 `variableDefinitions` 生成 NoticeRule 同款 `subscriber` 接收人映射，并保留已有显式变量配置优先级。
- 不做：不新增变量配置 UI，不修改后端接口，不改运行时前端参考实现。
- 验证：`CI=true pnpm --filter jetlinks-web-core build -- --module-name notice-center-ui` 已通过，构建输出仍有既有 CSS `//` 注释和大 chunk 警告；`./node_modules/.bin/vue-tsc --noEmit --project modules/notice-center-ui/tsconfig.json` 仍被既有 `jetlinks-web-core` 与 notice-center 类型错误阻断。

验证命令：

```bash
pnpm.cmd --filter jetlinks-web-core build -- --module-name notice-center-ui
```
