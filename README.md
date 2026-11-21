# notify-manager-ui

运行时消息通知模块，承接通知渠道、消息模板与通知记录。

- 菜单入口：`/system/notification/{channels,templates,records}`
- 页面入口：`views/system/MessageNotification/{Channels,Templates,Records}/index.vue`
- 接口封装：`api/notice/messageNotification.ts`；旧页面及 `api/notice-center.ts` 保留兼容使用
- 后端接口：`/notifier/config/**`、`/notifier/template/**`、`/notify/channel/**`、`/notify/history/**`、`/notifier/**`

消息模板的通用变量为顶层 `message`、`notifyTime`；后端 Provider 声明的业务字段统一归入 `detail.*`，可用变量区按完整表达式去重。设备告警的产品、属性、显示值、单位及事件文案取决于属性通知上下文，悬停可查看字段适用说明；`detail.relieveTime` 仅在设备告警解除模板中推荐。告警发生预览不生成解除时间，也不为旧的无前缀详情表达式编造示例。既有模板正文、变量格式与声明保持原文，旧表达式需在编辑器中替换为正确变量并保存。

场景模板固定使用 `detail.sceneId`、`detail.sceneName`、`detail.triggerType`；多条件场景的实际触发方式由后端提供，前端样例仅用于展示，不会写入保存参数。

## 消息渠道图文说明与常驻编辑

企业微信渠道 `weixin:corpMessage` 的右侧说明按 `CorpID`、`Secret`、`AgentId` 排列。`Channels/configuration/channelHelpGuides.ts` 提供 AgentId 获取路径和企业微信自建应用截图。聚焦 `Channels/templateSetup/ChannelTemplateSetup.vue` 的 AgentId 输入框时，桌面滚动到对应章节，窄屏高亮该章节。渠道载荷保留已有扩展配置和未修改的已知密钥。AgentId 的填写和保存参见 [企业微信消息模板自动生成](#企业微信消息模板自动生成)。

AgentId 说明验证（2026-11-19）：模块目录执行 `node --test tests/messageNotification*.test.mjs`，397 项通过。沿用本节浏览器命令运行 `channelHelp.mjs` 和 `TRIAL_SETTINGS_ONLY=1` 的 `trials.mjs`，各 7 组通过，覆盖三语文案、图片预览、桌面聚焦定位、390px 布局和已保存 Secret。实际渠道页已只读确认新增章节。生产构建、定向样式、三语 783 个消息通知键及 `git diff --check` 通过。类型检查仍为相同的 195 项既有诊断，修复基线后重跑下文类型检查命令。

双字段修复验证（2026-11-17）：在模块目录运行 `node --test tests/messageNotificationChannels.test.mjs tests/messageNotificationTrial.test.mjs tests/messageNotificationContracts.test.mjs`，109/109 通过，覆盖旧/新元数据、新建与更新、密钥及历史字段保留。按下述浏览器命令运行 `channelHelp.mjs` 和 `trials.mjs`（`SMOKE_OUTPUT=/tmp/jetlinks-corp-fields/{help,trials}`），8 + 11 组通过，覆盖三语双字段、原图、聚焦定位、保存、试发入口和窄屏；页面错误与业务网络请求为 0。三语资源检查及 `git diff --check` 通过，无独立 lint 脚本。按下述构建命令输出到 `/tmp/jetlinks-corp-fields/build`，模块构建通过（44.02 秒）；类型检查前后均为 196 条诊断，忽略行列无新增或移除，完整类型检查仍未通过，既有问题修复后需重跑下述 `vue-tsc` 命令。日志位于 `/tmp/jetlinks-corp-fields-*.log`，截图与报告位于 `/tmp/jetlinks-corp-fields/`。真实账号保存与消息投递未验证。

右侧说明面板精简：移除面板顶部“配置说明”标题与“收起”按钮，正文常驻展示；同步清理收起状态及事件，保留字段聚焦定位和等宽布局。实现入口为 `Channels/configuration/ChannelHelp.vue`、`Channels/index.vue` 与 `Channels/useChannelsPage.ts`，模块目录执行 `node --test tests/messageNotificationChannels.test.mjs`，61/61 通过；按下述浏览器命令复验 `channelHelp.mjs` 与 `robotSigning.mjs`，16/16 组通过，页面错误与真实业务请求为 0。定向样式检查及 `git diff --check` 通过；按下述构建命令将输出目录改为 `/tmp/jetlinks-channel-help/body-only/build`，模块构建通过（39.64 秒）。类型检查仍为 196 条既有诊断，忽略行列后无新增或移除。报告、截图及日志位于 `/tmp/jetlinks-channel-help/body-only/` 与 `/tmp/jetlinks-channel-help/body-only-*.log`；工作区无独立 lint 脚本。

运行时消息渠道的桌面配置工作区扣除间距后，表单与图文说明各占 50%，分别滚动，1024px 及以下上下排列。主页面始终显示表单控件，保存后仍可继续编辑，字段底部辅助文案归入右侧说明；校验错误、必填标记及凭据占位提示继续显示。底部仅提供整表“保存”。输入和失焦只改草稿，保留权限、凭据保护、提交锁与未保存离开提醒。钉钉群机器人只调整主页面列表 / 说明布局，编辑弹窗保持原样。

底栏仅保存的复验：`Channels/index.vue` 移除“撤销修改”，浏览器夹具通过离开确认丢弃未保存草稿。`smoke.mjs` 10 组、`channelHelp.mjs` 8 组、`emailSmtp.mjs` 5 组、`trials.mjs` 10 组全部通过，覆盖唯一保存按钮的桌面 / 窄屏左对齐与可达性、提交锁、保存失败重试、离开确认和凭据保护；页面错误及真实业务请求为 0。报告与截图位于 `/tmp/jetlinks-channel-help/save-only/`；下述单元、机器人弹窗及类型检查复用前序验证证据。

页头按钮调整历史（右侧当前已常驻展示）：已删除 `Channels/index.vue` 页头的“配置说明”按钮，沿用右侧说明默认展开与收起行为；收起后重新进入页面可恢复默认展开。同步调整已有浏览器夹具，`channelHelp.mjs` 8 组、`robotSigning.mjs` 8 组、`trials.mjs` 10 组通过，覆盖八类渠道、机器人列表及空状态、三语与窄屏按钮移除、说明展示与收起恢复。机器人首次运行末尾发生开发服务模块初始化错误，单独复跑通过；最终报告无页面错误或真实业务请求。按下述命令验证：模块构建通过（35.75 秒），定向样式检查与 `git diff --check` 通过，无独立 lint 脚本；类型检查前后均为 196 条既有诊断，无新增或移除，完整类型检查仍未通过。证据位于 `/var/folders/kd/xy867r053zj3phhskmvc8vx40000gn/T/jetlinks-remove-channel-help-222bf69k/`；未操作真实渠道配置或发送消息。

八类说明恢复自历史提交 `c5f0050645057ba0385296e32c9ac4731a9190f0`，11 张配置说明截图引用自 `assets/notice/doc/`，图片预留比例并支持预览。补充钉钉 AgentId、邮件端口 / 加密方式等说明，修正旧 SMTP 与地域描述；邮箱供应商认证提示随当前地址显示在右侧。中英日文案同步。未知提供商保留元数据说明。说明聚焦联动使用实际字段键和稳定段落 ID，仅显式聚焦时滚动右栏并高亮；输入与手动阅读不反复滚动，重复聚焦可重新定位，窄屏仅高亮。

实现入口：`views/system/MessageNotification/Channels/configuration/` 的 `channelHelpGuides.ts`、`channelHelpImages.ts`、`channelHelp.ts`、`ChannelHelp.vue` 与 `useChannelHelpNavigation.ts` 承载文档及导航；`Channels/index.vue`、`ChannelConfiguration.vue`、`useChannelConfiguration.ts`、`useChannelWorkspace.ts` 和 `useChannelsPage.ts` 接入布局、常驻编辑及整表提交。新增 / 修改权限复用 auth store 的响应式检查，已打开的表单在权限撤销后立即锁定。不修改共享组件、后端接口、保存载荷、消息模板或试发业务规则。

验证（2026-11-17）：模块目录运行 `node --test tests/messageNotificationChannels.test.mjs tests/messageNotificationContracts.test.mjs tests/messageNotificationTrial.test.mjs`，108/108 通过。`tests/messageNotificationBrowser/` 下 `channelHelp.mjs` 8 组、`smoke.mjs` 10 组、`robotSigning.mjs` 8 组、`emailSmtp.mjs` 5 组、`trials.mjs` 10 组均通过，共 41 组；覆盖八类说明和原图、字段定位 / 重复聚焦 / 不抢滚动、三语、1280 / 1440 / 1920px 等宽与 390px 窄屏、保存与草稿丢弃 / 失败重试 / 凭据、权限撤销、机器人弹窗和试发。浏览器均使用内存夹具，页面错误及真实业务请求为 0。

复验浏览器：从模块目录执行 `SMOKE_CHANNELS_ONLY=1 SMOKE_PLAYWRIGHT_MODULE="$PWD/../../../ui/node_modules/playwright" SMOKE_OUTPUT=/tmp/jetlinks-channel-help/<脚本名> node tests/messageNotificationBrowser/<脚本名>.mjs`，分别代入上述五个脚本名；默认使用已有 9200 开发服务。报告和截图均位于 `/tmp/jetlinks-channel-help/`。

质量验证：在 `runtime-ui/` 执行 `node ../ui/scripts/check-ui-style.mjs --files modules/notify-manager-ui/views/system/MessageNotification/Channels/index.vue modules/notify-manager-ui/views/system/MessageNotification/Channels/ChannelConfiguration.vue modules/notify-manager-ui/views/system/MessageNotification/Channels/configuration/ChannelHelp.vue` 通过，三语 JSON / 文案键及模块 `git diff --check` 通过；工作区无独立 lint 脚本。在 `runtime-ui/jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/jetlinks-channel-help/save-only/build -- --module-name notify-manager-ui` 通过（35.59 秒），保留既有构建告警。

完整类型检查仍未通过：在 `runtime-ui/` 执行 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`，修改前后均为 196 条既有诊断，忽略行列比较无新增或移除；修复基线问题后需重跑。类型日志为 `/tmp/jetlinks-channel-help/types-{before,final}.log`。本轮未写入真实渠道配置或发送通知，真实服务商账号与投递仍需环境联调。

## 企业微信消息模板自动生成

交付复核（2026-11-19）：渠道模板联动与站内信补齐通过 `codex/channel-template-setup-2.20` 交付，基于最新 `origin/2.20` 的 `8a3b155`，包含远端通知记录默认“全部”的修复。模块目录执行 `node --test tests/messageNotification*.test.mjs`，397/397 通过；6 个变更 Vue 的 script/template/style 编译和定向样式门禁、14 个测试脚本语法检查、三语各 1167 个键（其中消息通知各 783 个）一致性及差异空白检查通过，相关 Vue 均少于 300 行。在 `runtime-ui/jetlinks-web-core` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notify-channel-template-pr-2.20-build -- --module-name notify-manager-ui`，生产构建通过（11,339 个模块，54.60 秒），保留既有分块告警。在 `runtime-ui` 执行 `node --max_old_space_size=8192 node_modules/vue-tsc/bin/vue-tsc.js --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`，仍有 195 条既有诊断，统一执行目录与行列号后和 AgentId 说明阶段日志完全一致，完整类型检查未通过。复用下文渠道创建、站内信补齐、模板页启停、导航、图文说明与窄屏的浏览器夹具证据；真实账号保存、服务商投递仍待环境联调。工作区无独立 lint 脚本。

在「消息通知 / 通知渠道」完成企业微信（`weixin:corpMessage`）配置后，运行时前端为「消息模板」目录里的每个业务补齐一份企业微信模板，归属 `runtime-ui/modules/notify-manager-ui`。已保存的渠道也可直接执行「补齐消息模板」。

1. 在 `views/system/MessageNotification/Channels/` 添加必填的企业微信 AgentId，与企业 ID、Secret 一次保存。AgentId 保存到 `configuration.alarmTemplateDefaults.agentId`，已有配置可从历史 `configuration.agentId` 回显。接收部门、用户、标签和内容细节在消息模板中编辑。
2. 保存成功后，从 `GET /notify/channel/all-for-save` 读取当前账号可管理的消息类型。设备告警、场景联动、设备告警解除、系统公告及其他有专用定义的类型复用 `Templates/definition/templateDefaults.ts`。扩展类型使用通用通知正文变量 `${message}`，每份模板均带入当前 `configId` 和 AgentId。新建企业微信绑定默认启用。已有类型使用单渠道保存接口，首次落库使用聚合保存，将消息类型设为启用并提交 `defaultSubscribed: false`，个人订阅由用户勾选。
3. 补齐前复查消息类型与微信绑定，跳过已有绑定。保存响应确认状态为启用后计入创建成功。表单反馈模板创建、跳过和失败，结果不明时停止本轮写入，重试从重新校对已保存配置和消息类型目录开始。
4. 消息模板页统一通过页头「启用 / 禁用」管理消息类型。企业微信模板可编辑内容，保存时沿用已有渠道绑定的状态。个人中心从 `/notify/channel/all` 获取已启用且可访问的消息类型和渠道绑定，按需引导用户绑定微信接收账号。

现有保存接口采用更新式保存，跨会话的读写期间仍可能发生竞态，不同业务也可能部分成功。

运行时前端复用 `views/system/MessageNotification/Channels/templateSetup/` 的模板表单和补齐流程，`Channels/wechat/templateDefaults.ts` 读取既有企业微信 AgentId。`Templates/index.vue` 使用页头消息类型启停，模板保存由 `Templates/useTemplateWorkspace.ts` 和 `Templates/workspace/businessTemplates.ts` 组装现有绑定。已打开的模板页在渠道保存成功后刷新消息类型目录与无修改的默认草稿。

模块目录执行 `node --test tests/messageNotification*.test.mjs`，397 项通过。用 `SMOKE_CHROMIUM_CHANNEL=chrome SMOKE_BASE_URL=http://127.0.0.1:9201 SMOKE_PLAYWRIGHT_MODULE="$PWD/../../../ui/node_modules/playwright" node tests/messageNotificationBrowser/wechatTemplates.mjs` 通过桌面和 390px 窄屏验证，覆盖四项默认启用、补齐缺失项、页头启停、移除独立开关及正文保存回显。同样运行 `tests/messageNotificationBrowser/navigation.mjs`，10 项通过，页面错误和业务网络请求均为 0。

在 `runtime-ui/jetlinks-web-core/` 执行 `node --test src/views/account/center/{personalCenterFlows,notificationSettingsView}.test.mjs`，65 项通过。定向夹具验证微信渠道可用后可勾选，完成对应接收账号绑定后保存订阅。「系统公告」实际页面只读核对页头操作和企业微信预览，启停、保存与订阅使用隔离数据验证。

定向样式门禁、三语 781 个消息通知键一致性、模块生产构建和 `git diff --check` 通过。工作区无独立 lint 脚本。在 `runtime-ui/` 执行 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`，修改前后均为同样的 195 项既有诊断。完整类型检查仍受这些诊断影响，修复后可重跑同一命令。

### 站内信渠道

首次保存消息类型时，`Channels/templateSetup/fillMessageTemplates.ts` 和 `Templates/useTemplateWorkspace.ts` 通过 `/notify/channel/providers` 确认站内信可用，再将启用的站内信渠道和当前外部模板一并提交给聚合保存接口。`api/notice/messageNotification.ts` 验证返回的站内信绑定及状态，内置站内信无需模板。

已保存的消息类型缺少站内信时，具备编辑权限的用户可在模板页头点「补齐站内信」。`Templates/hooks/useTemplateBusinessDirectory.ts` 写入前回读对应类型，遇到已有渠道（含禁用）或默认站内信时直接同步页面。确认缺失后通过 `PATCH /notify/channel/{providerId}` 保存一条渠道，回读确认后提示成功。个人中心按服务端返回的可用渠道开放勾选，用户可将站内信加入个人订阅。

沿用上文命令，通知模块 199 项、个人中心 65 项测试通过。隔离浏览器覆盖首次聚合保存、存量补齐回显、微信绑定和 390px 窄屏，导航 8 项通过。定向订阅验证覆盖补齐后可勾选及与原微信订阅一起保存。在本地「设备告警解除」模板页确认了入口，渠道保存和订阅使用隔离数据验证。

定向样式检查、三语 783 个消息通知键及 `git diff --check` 通过。按下文 Vite 命令构建 `notify-manager-ui` 通过，保留既有分块告警。模块类型检查前后均为同样的 195 项既有诊断，基线修复后可重跑上文命令。

## 邮件、钉钉与 Webhook 随渠道创建消息模板

保存邮件、钉钉工作通知、钉钉群机器人或 Webhook 渠道后，运行时前端按当前账号可管理的消息类型目录逐项创建模板，并绑定刚保存的渠道配置。邮件、钉钉工作通知和 Webhook 采用各消息类型的内置文案或请求体，内容在消息模板页编辑。

| 渠道 | 渠道保存时的模板参数 |
| --- | --- |
| 邮件 | 保存 SMTP 渠道配置，系统填入该消息类型的默认主题和正文。 |
| 钉钉工作通知 | 保存渠道表单中的必填 AgentId，系统填入该消息类型的默认正文。 |
| 钉钉群机器人 | 在机器人配置弹窗选择消息类型，默认 Markdown。链接消息需填写跳转地址。保存时自动写入标题 `${topic}` 和正文 `${message}`。 |
| Webhook | 配置接收地址和请求头。系统填入默认 JSON 请求体，请求示例和编辑入口统一到消息模板页。 |

`Channels/useChannelsPage.ts` 和 `Channels/robot/useRobotConfigurations.ts` 将保存后的当前渠道交给 `Channels/templateSetup/useChannelTemplateSetup.ts`。`Channels/templateSetup/templateDefaults.ts` 按消息类型组装邮件、钉钉工作通知和 Webhook 模板，扩展类型使用通用通知变量。钉钉工作通知从 `configuration.agentId` 取值，群机器人在 `configuration.messageTemplateDefaults` 中保存消息类型、默认标题与正文以及链接消息的跳转地址。自动补齐群机器人模板时使用通用通知变量，纯文本消息只带正文。企业微信沿用 `configuration.alarmTemplateDefaults.agentId` 和历史 AgentId 读取规则。

`Channels/templateSetup/fillMessageTemplates.ts` 回读当前渠道和消息类型目录，通过现有单渠道和聚合接口创建缺失的模板。新绑定默认启用，首次创建类型时处理内置站内信，个人订阅由用户勾选。工作通知与群机器人共用每个类型的一条 `notifier-dingTalk` 绑定。已有绑定优先，模板页可显式调整绑定的钉钉配置。渠道和模板分别保存，遇到部分成功可在渠道页或机器人行菜单用「补齐消息模板」重试缺失项。

模块目录执行 `node --test tests/messageNotification*.test.mjs`，401 项通过。使用 9201 开发服务运行 `tests/messageNotificationBrowser/{channelTemplates,robotSigning}.mjs`，通过隔离数据验证标题和正文隐藏、自动写入默认值、链接地址必填、模板生成和 390px 布局。

脚本语法检查、`git diff --check` 和模块生产构建通过。工作区无独立 lint 脚本。模块类型检查改动前后均报告 197 条既有诊断，复验使用上文的 `vue-tsc` 命令。

### 钉钉工作通知接收人选择

运行时消息模板的「接收部门」和「接收用户」使用可搜索的多选下拉框。沿用模板绑定的钉钉配置，由 `api/notice-center.ts` 调用已有的部门列表和用户列表接口，部门包括子部门，用户可独立选择。`views/notice/template/hooks/useNoticeTemplateEditorOptions.ts` 管理远程选项，`views/notice/template/components/TemplateFieldRenderer.vue` 复用 Ant Design Vue 下拉框。保存字段沿用 `departmentIdList` 和 `userIdList` 的逗号分隔 ID 格式，历史选值在通讯录缺少对应条目时按原 ID 回显。

模块目录执行 `node --test tests/messageNotification*.test.mjs`，399 项通过。隔离浏览器的 `tests/messageNotificationBrowser/channelTemplates.mjs` 验证按绑定配置查询、子部门搜索、用户选项加载失败后重试、历史值回显和多选保存与清空，`wechatTemplates.mjs` 的企业微信模板回归通过。两个变更组件的定向样式检查、中英日文案键校验、`git diff --check` 和模块生产构建通过。工作区无独立 lint 脚本。`vue-tsc` 从 195 条诊断降至 194 条，剩余均为既有诊断。基线修复后，在 `runtime-ui/` 执行 `node --max_old_space_size=8192 node_modules/vue-tsc/bin/vue-tsc.js --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 复验。

本地「系统公告」模板已确认两个下拉框发起查询，当前绑定的钉钉应用返回 `60011`，需在钉钉开放平台开通相应的通讯录查询权限后重新打开下拉框验证真实选项。

## 微信渠道入口

「消息模板」页在 `Templates/hooks/useTemplateCatalog.ts` 复用 `shared/catalog.ts` 的服务商入口规则。导航中的「微信」直接打开工作通知（`weixin:corpMessage`）。显式指向服务号的旧业务模板链接沿用不可用提示。

模板入口验证（2026-11-19）：模块目录执行 `node --test tests/messageNotification*.test.mjs`，397 项通过。隔离浏览器的 `navigation.mjs` 10 项及 `wechatTemplates.mjs` 通过，覆盖双服务商响应、工作通知直达、服务号旧链接、钉钉切换与 390px 布局。本地「设备告警解除」模板页已确认企业微信导航和已保存模板预览。脚本语法、`git diff --check` 和模块生产构建通过，工作区无独立 lint 脚本。`vue-tsc` 改动前后均为相同的 195 项既有诊断，基线修复后重跑上文类型检查命令。

`views/system/MessageNotification/Channels/` 已过滤不支持的 `weixin:officialMessage`，微信只显示一级“微信”，点击打开 `weixin:corpMessage`。旧服务号链接在企业微信可用时跳转到该渠道并清除原配置 ID，保留其他查询条件；企业微信不可用时沿用不可用状态，不选中其他渠道。实现入口为 `useChannelCatalog.ts` 和 `useChannelsPage.ts`，中英日导航文案使用 `messageNotification.channels.wechat`。后端、业务模板、通知记录和历史配置数据不变。

验证（2026-11-17）：模块目录执行 `node --test tests/messageNotificationChannels.test.mjs tests/messageNotificationContracts.test.mjs`，90/90 通过。沿用上文浏览器命令，`trials.mjs` 增加 `TRIAL_SETTINGS_ONLY=1`，与 `channelHelp.mjs` 分别通过 7 组检查；覆盖三语一级节点、点击切换、旧链接清除服务号配置 ID、窄屏隐藏选项与七类渠道说明，页面错误和真实业务请求均为 0。沿用上文构建命令，模块构建通过（24.95 秒，保留既有分块告警）；`vue-tsc` 前后均为 196 条既有诊断，忽略行列后无新增或移除，待修复既有问题后重跑上文类型命令。无独立 lint 脚本，三语资源及 `git diff --check` 通过。证据位于 `/tmp/jetlinks-wechat-nav/` 和 `/tmp/jetlinks-wechat-nav-*.log`；实际后端保存与消息投递未验证。

### 历史服务号配置说明（入口已屏蔽）

`views/system/MessageNotification/Channels/` 的微信服务号配置页仅展示服务端配置字段，已移除渠道测试入口、测试模板和样例参数设置；沿用现有配置表单与说明面板，中英日说明同步。参考线上 `https://doc.jetlinks.cn/` 的微信服务号配置说明（`doc.WeixinApp.707693-*`），介绍 AppID、AppSecret 以及“微信公众平台 → 设置与开发 → 基本配置”的获取路径。保留已有配置值、业务消息模板和其他渠道能力，服务号调整不改变后端接口或配置数据；统一试发沿用既有发送接口，并移除渠道试发按钮对业务模板查询权限的依赖。

实现入口：`Channels/testing/channelTestConfig.ts` 不再为服务号注入测试字段，`channelTestAdapter.ts` 移除服务号试发适配；`useChannelsPage.ts` 和 `index.vue` 按适配器能力显示试发入口。`configuration/channelHelp.ts` 定义服务号专属指引，并将 AppId / AppSecret 编辑定位到对应步骤；三语资源位于 `locales/lang/{zh,en,ja}.json`。历史 `configuration.testTemplate` 保留在保存数据中，不参与服务号配置校验，不影响业务模板。

验证（2026-11-12，以下命令从 `runtime-ui/` 执行）：`node --test modules/notify-manager-ui/tests/messageNotificationChannels.test.mjs modules/notify-manager-ui/tests/messageNotificationTrial.test.mjs` 58/58 通过；`SMOKE_PLAYWRIGHT_MODULE="$PWD/../ui/node_modules/playwright" SMOKE_OUTPUT=/tmp/weixin-official-browser node modules/notify-manager-ui/tests/messageNotificationBrowser/trials.mjs` 通过，覆盖三语、390px 窄屏隐藏测试入口及参数、说明展示、其他七类渠道试发，以及历史参数保留的单元回归。浏览器使用内存夹具，页面错误和业务网络请求均为空；截图与报告位于 `/tmp/weixin-official-browser/`。

`node ../ui/scripts/check-ui-style.mjs --files modules/notify-manager-ui/views/system/MessageNotification/Channels/index.vue` 与模块 `git diff --check` 通过；在 `jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/weixin-official-build -- --module-name notify-manager-ui` 通过（30.60 秒），保留既有构建警告。`./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 改动前后均为 213 项既有诊断，忽略行列后新增 0、移除 0；完整类型检查尚未通过，既有问题修复后重跑。工作区无独立 lint 脚本；日志前缀 `/tmp/weixin-official-`。真实账号保存与服务号业务消息投递未验证，未发送真实消息。

提交范围验证（2026-11-12）：从当前分支 HEAD 提取仅含服务号调整及必要统一试发前置改造的副本验证。渠道、试发、接口和菜单检查共 93 项：修正 AgentId 的旧断言后，渠道 39/39 复验通过，其余 54 项已通过；日志 `/tmp/weixin-submit-tests.log`、`/tmp/weixin-submit-channels-final.log`。在 `jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/weixin-submit-build -- --module-name notify-manager-ui`，模块构建通过（17.96 秒），四个变更 Vue 文件通过定向样式检查，工作区无独立 lint 脚本。`./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 与 HEAD 基线均为 213 项既有诊断，无新增或移除，完整类型检查尚未通过；修复既有问题后需重跑。日志前缀 `/tmp/weixin-submit-`。

工作区页面的 Playwright 内存夹具验证已通过：七类渠道试发、微信服务号隐藏测试入口和参数、中英日说明及 390px 窄屏均符合预期，无页面错误或业务网络请求，报告 `/tmp/weixin-official-browser/report.json`。独立副本的浏览器复验在 Vite 预构建依赖初始化阶段被 `isFunction is not a function` 阻断，未进入页面断言；报告 `/tmp/weixin-submit-browser/report.json`。修复隔离开发环境后，使用 `SMOKE_PLAYWRIGHT_MODULE=/Volumes/SSD/work/jetlinks/cloud.jetlinks/ui/node_modules/playwright SMOKE_BASE_URL=http://127.0.0.1:19201 node tests/messageNotificationBrowser/trials.mjs` 重跑候选页面验证。未发送真实消息，真实账号授权与服务商投递仍需测试账号联调。

## 钉钉机器人可选加签

### 群机器人弹窗与列表

实现提交：`8dc19ca`；配置说明与按钮修正：`48553f4`（本地 `2.20`）；未推送。

`/system/notification/channels?channel=dingTalk:dingTalkRobotWebHook` 使用紧凑机器人列表，每行展示名称、脱敏 Webhook 地址、「测试」和「更多」。更多菜单提供「编辑」和「补齐消息模板」。右侧标题保留“添加群机器人”入口，无数据复用 `CloudEmpty`。列表与空状态均常驻显示图文说明侧栏；页头“配置说明”按钮、侧栏标题和“收起”按钮已移除。窄屏沿用单列布局。

配置说明与按钮修正（2026-11-13）：`Channels/index.vue` 复用同一个 `ChannelHelp` 和说明按钮，机器人列表及空状态恢复说明侧栏；`messageNotification.channels.robot.add` 提供“添加群机器人”的中英日文案。沿用下方命令验证：`robotSigning.mjs` 8 组、渠道 `smoke.mjs` 10 组通过，覆盖默认展开、收起 / 重开、空列表、添加弹窗和三语 390px 布局，浏览器无页面错误或业务请求；定向样式检查 1 个 Vue 文件、三语资源及 `git diff --check` 通过。模块构建通过（23.59 秒，保留既有告警）；类型检查仍为 195 项既有诊断，无新增或移除，完整类型检查尚未通过，无独立 lint 脚本。报告与截图位于 `/tmp/jetlinks-robot-help/`，命令日志前缀 `/tmp/jetlinks-robot-help-`；未操作真实配置或发送真实消息。

添加 / 编辑弹窗提供名称、Webhook 地址以及消息模板默认配置。编辑时从当前机器人配置回填 Webhook 地址，输入框默认遮挡完整地址，点击小眼睛可查看。留空保存会保留已保存的地址，列表和占位提示继续显示脱敏地址。取消会丢弃当前弹窗草稿，失败会保留输入，保存成功后关闭并刷新列表。刷新失败时只重试读取。保存时保留历史加签密钥。接口仅返回掩码且无法安全保留凭据时，弹窗提示后阻止更新。

`Channels/channelSchema.ts` 从当前记录初始化地址草稿，`Channels/robot/RobotConfigurationModal.vue` 提供地址的遮挡和显隐。模块目录执行 `node --test tests/messageNotification*.test.mjs`，401 项通过。沿用下文命令运行 `robotSigning.mjs`、`smoke.mjs`，分别通过 9 组和 10 组。使用相同浏览器环境运行 `channelTemplates.mjs`，通过钉钉机器人新增和模板联动验证。本地机器人配置已只读核对地址回显。定向样式检查和模块构建通过。`vue-tsc` 仍有 195 条既有诊断，本次回显改动未引入新诊断，修复基线后按下文命令复验。

实现入口为 `views/system/MessageNotification/Channels/robot/`：`RobotConfigurationList.vue` 负责行展示和操作事件，`RobotConfigurationModal.vue` 负责两字段表单，`useRobotConfigurations.ts` 负责弹窗生命周期、权限与逐行操作，`robotPresentation.ts` 负责 URL 脱敏。`Channels/index.vue`、`useChannelsPage.ts` 接入机器人分支；`useChannelWorkspace.ts` 复用现有读写、校验与凭据合并，增加按草稿标识取消，并在选择配置后等待地址栏导航完成，避免路由监听误关闭测试弹窗。测试、编辑和删除始终使用点击行的配置 ID，删除确认展示机器人名称；切换渠道、外部配置深链接或权限失效会释放对应弹窗草稿。新增 Vue 文件均低于 300 行，中英日文案沿用模块资源。

验证（2026-11-13）：渠道、契约、试发与装配集成共 116/116 通过，覆盖取消新建、历史密钥保留、失败重试、按行目标、权限和异步选择、外部深链接、导航完成时序与保存后刷新失败。`robotSigning.mjs` 的 7 组浏览器检查通过，覆盖两字段新增 / 编辑、名称和 URL 校验、逐行测试 / 删除、脱敏、三语和 390px 布局、旧元数据及权限；`smoke.mjs` 的渠道回归 10 组通过。浏览器使用内存夹具，页面错误和业务网络请求均为空，未写入真实通知配置或发送真实消息。模块类型检查前后均为 195 项既有诊断，无新增或移除；完整类型检查尚未通过，工作区没有独立 lint 脚本。三个变更 Vue 文件的定向样式检查、中英日机器人文案键一致性和 `git diff --check` 通过；统一试发浏览器回归 10 组通过，最终模块构建通过（20.78 秒），保留既有大 chunk、CSS 等构建警告。

复验命令（从 `runtime-ui/` 执行）：

```sh
node --test modules/notify-manager-ui/tests/messageNotification{Channels,Contracts,Trial,Integration}.test.mjs
SMOKE_PLAYWRIGHT_MODULE="$PWD/../ui/node_modules/playwright" node modules/notify-manager-ui/tests/messageNotificationBrowser/robotSigning.mjs
SMOKE_CHANNELS_ONLY=1 SMOKE_PLAYWRIGHT_MODULE="$PWD/../ui/node_modules/playwright" node modules/notify-manager-ui/tests/messageNotificationBrowser/smoke.mjs
SMOKE_PLAYWRIGHT_MODULE="$PWD/../ui/node_modules/playwright" node modules/notify-manager-ui/tests/messageNotificationBrowser/trials.mjs
node ../ui/scripts/check-ui-style.mjs --files modules/notify-manager-ui/views/system/MessageNotification/Channels/index.vue modules/notify-manager-ui/views/system/MessageNotification/Channels/robot/RobotConfigurationList.vue modules/notify-manager-ui/views/system/MessageNotification/Channels/robot/RobotConfigurationModal.vue
./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json
```

模块构建从 `runtime-ui/jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/jetlinks-robot-dialog/build -- --module-name notify-manager-ui`。日志、浏览器报告和截图位于 `/tmp/jetlinks-robot-dialog/`；真实账号授权与钉钉服务商投递仍需联调。

### 现有加签兼容行为

实现提交：前端 `7eba75d`（本地 `2.20`），后端 `8444cd9ee`；后端评审见 [PR #1717](https://github.com/jetlinks-v2/jetlinks-components/pull/1717)（目标 `2.20`，草稿，待恢复 Maven 私服访问后验证）。

当前暂时屏蔽钉钉机器人的加签密钥输入与清除入口，即使服务端元数据声明 `secret` 也不显示。`Channels/robot/RobotConfigurationModal.vue` 只展示名称和 Webhook 地址，通用表单 `Channels/useChannelConfiguration.ts` 仍过滤机器人 `secret`；保留已保存密钥、元数据能力与密钥合并逻辑，修改 Webhook 时继续保留原密钥，邮件、短信等渠道不受影响。后续恢复入口时仍以服务端元数据声明为前提。

`views/system/MessageNotification/shared/configuration.ts` 通过字段策略区分可选密钥和明确清除意图，不硬编码钉钉判断；原本没有可选密钥的配置允许修改。掩码密钥无法安全回传，当前入口屏蔽期间继续拒绝此类配置的普通更新，避免丢失已存密钥。清除使用 `configuration.secret: ""`，前端意图标记不进入 API，配置 ID 间不复用密钥。后端 owning module 为 `modules/jetlinks-components/notify-component/notify-dingtalk`，先升级通知服务再发布前端；不修改 `ui/` 或增加数据库列。

本次屏蔽验证（2026-11-11）：`node --test tests/messageNotification{Channels,Contracts,Integration}.test.mjs` 在独立提交候选通过 77/77，当前工作区通过 78/78；沿用下述 Playwright 命令验证 6 组场景，有 / 无 secret 元数据、机器人切换与三语均隐藏入口，修改 Webhook 保留密钥，无业务网络请求。沿用下述构建命令通过（20.97 秒），类型检查仍为原有 213 项诊断，无新增或消失；无独立 lint 脚本，`git diff --check` 通过。本轮日志与页面截图位于 `/tmp/dingtalk-secret-hidden/`。

加签能力实现时的验证（2026-11-11，命令从 `runtime-ui/` 执行；下述显示与清除交互为屏蔽前结果）：

- `node --test --test-name-pattern='signing|robot|optional credential|clear intent|SMTP|SMS|secrets|secret|credential' modules/notify-manager-ui/tests/messageNotification{Channels,Contracts}.test.mjs`：22/22 通过，覆盖新增不填、补填、更换、留空、清除、取消 / 失败、掩码值、配置切换及邮件 / 短信凭据保护。
- `node --test modules/notify-manager-ui/tests/messageNotification{Channels,Contracts,Integration}.test.mjs`：提交前按当前分支 HEAD 分离出仅包含钉钉加签的候选版本，77/77 通过；日志 `/tmp/dingtalk-sign-delivery/frontend-tests.log`。其他渠道的未提交改动保留在原工作区。
- `SMOKE_PLAYWRIGHT_MODULE="$PWD/../ui/node_modules/playwright" node modules/notify-manager-ui/tests/messageNotificationBrowser/robotSigning.mjs`：使用本工作区已安装的 Playwright 和已有 9200 Vite 服务。隔离内存接口验证 9 组场景，包括字段编辑、失败重试、掩码清除、机器人隔离、旧后端、三语及 390px 确认框；通过，无页面错误或业务网络请求。报告与截图 `/tmp/dingtalk-sign-browser/`。
- `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`：仍为改动前的 213 条既有错误，按文件 / 错误码 / 消息对比无新增。日志 `/tmp/dingtalk-sign-types-final.log`，全量类型检查尚未通过。
- 从 `jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/dingtalk-sign-build -- --module-name notify-manager-ui`：通过；保留现有 CSS、chunk 大小、构建配置及浏览器映射数据警告。`node ../ui/scripts/check-ui-style.mjs --files modules/notify-manager-ui/views/system/MessageNotification/Channels/ChannelConfiguration.vue` 和变更文件 `git diff --check` 通过。

不发送真实钉钉消息。后端编译 / 测试仍被私服 401 阻断，详见通知组件 README；恢复依赖后先验证并部署通知服务，再发布前端。无密钥历史机器人无需迁移，真实机器人发送另行验收。

## 通知渠道统一试发

钉钉群机器人试发由 `views/system/MessageNotification/Channels/testing/channelTestAdapter.ts` 构造临时文本模板，通过 `POST /notifier/{configId}/_send` 发送至当前配置的群。普通群消息省略 `template.template.at`，因为通知服务在收到 `at` 时需要同时读取手机号和用户 ID 两个名单。

群机器人试发验证（2026-11-19）通过模块的 401 项测试和 `tests/messageNotificationBrowser/trials.mjs` 的 12 组隔离浏览器回归，确认从列表点击「测试」后的请求省略 `at`。模块生产构建、测试脚本语法和 `git diff --check` 通过，工作区无独立 lint 脚本。下文的 `vue-tsc` 命令在改动前后均报告相同的 195 条既有诊断。浏览器验证使用模拟发送接口，实际群投递待联调。

运行时通知渠道页通过 `Channels/useChannelsPage.ts` 统一判断试发入口。企业微信试发在 `Channels/testing/channelTestAdapter.ts` 读取已保存的 AgentId，优先使用 `configuration.alarmTemplateDefaults.agentId`，兼容旧渠道的 `configuration.agentId`。缺少有效值时，测试弹窗引导补齐 AgentId。普通渠道页头移除清除菜单，群机器人行菜单提供编辑和补齐模板。

钉钉工作通知和企业微信的「其他接收人」复用当前渠道配置的通讯录接口，在 `Channels/testing/ChannelTestModal.vue` 中按名称或 ID 搜索并单选。`Channels/testing/useChannelTest.ts` 在进入该选项时加载成员，查询失败后可重新加载，按现有试发契约提交所选成员 ID。

本地钉钉和企业微信试发弹窗均已成功加载实际通讯录。模块目录运行 `node --test tests/messageNotification*.test.mjs`，400 项通过。隔离浏览器 `tests/messageNotificationBrowser/trials.mjs` 的 12 组验证通过，覆盖两个渠道的成员搜索与试发载荷、查询失败后重新加载和其他试发渠道回归。定向样式检查、三语资源校验、`git diff --check` 和模块生产构建通过。`vue-tsc` 剩余 194 条既有诊断，修复基线后按上文的模块类型检查命令复验。

渠道操作验证（2026-11-19）：模块目录运行 `node --test tests/messageNotification*.test.mjs`，397 项通过。用下文浏览器环境运行 `trials.mjs`、`robotSigning.mjs` 和开启 `SMOKE_CHANNELS_ONLY=1` 的 `smoke.mjs`，分别通过 11、8、10 组。`channelTemplates.mjs` 复验通过。隔离浏览器覆盖新版和历史 AgentId、缺项引导、各渠道页头操作、群机器人菜单和 390px 布局。本地企业微信页只读确认试发按钮显示。定向样式、三语 773 个消息通知键、`git diff --check` 和模块生产构建通过。类型检查改动前后均为相同的 195 条既有诊断，修复基线后重跑下文类型检查命令。

### 修复计划：试发复用已有消息模板（待确认，未实施）

目标：所有已有“发送测试消息”入口的渠道统一增加消息模板下拉选择，复用用户选择的已有消息模板，仅临时填写本次接收人和模板变量；渠道不再维护或依赖另一套 `configuration.testTemplate`。该问题属于 M 级单模块交互改造，owning module 为 `runtime-ui/modules/notify-manager-ui`。下文原有试发行为仍代表当前实现，本计划确认并实施后回写同一节。

- 范围：`Channels/testing/` 的弹窗、状态与参数组装，`Channels/useChannelsPage.ts` 的权限及跳转，`Channels/channelSchema.ts`、`Channels/configuration/channelMetadata.ts` 的测试字段注入和校验，以及相关三语文案、测试与本节说明。覆盖邮件、阿里云短信、阿里云语音、钉钉工作通知、企业微信、钉钉群机器人和 Webhook 七类现有适配器，全部先选消息模板，再发送测试。
- 边界：仅修改运行时通知模块。复用现有模板查询、详情和发送接口；不新增测试渠道、测试模板实体、后端接口或存储字段，不修改运营端 `ui/`。群机器人和 Webhook 沿用现有固定发送目标，微信服务号及未支持提供商不因本次调整新增测试入口；不通过本次修复自动扩大角色授权，不清理线上历史配置。

实施步骤：

1. 所有支持试发的渠道打开弹窗后，按当前 `configId`、`type`、`provider` 查询有权读取的已保存消息模板，提供必选的模板下拉框，支持检索和分页。明确选择模板后读取详情及变量定义；不默认选择列表首项，不跨渠道账号取模板，也不使用页面预览中的未保存默认内容。
2. 复用 `api/notice/messageNotification.ts` 的 `queryTemplates`、`getSendTemplate` 以及模块现有模板归一化、变量类型与校验规则。邮件标题 / 正文、工作通知 / 机器人内容、Webhook 请求内容、语音类型与模板编号、短信签名等均来自所选模板；按渠道展示摘要及变量输入，不再回退到前端内置测试文案。兼容已有 `ttsCode` 及缺省 TTS 类型，无法判定或缺少真实模板信息时指向消息模板编辑入口。
3. 对需要指定接收人的渠道，沿用 `ChannelTestModal.vue` 的“发给自己 / 其他接收人”交互；群机器人和 Webhook 展示当前渠道的固定目标，不增加个人接收人输入。模板为空时提示“暂无可用消息模板”，有权限者可进入消息模板页配置并返回刷新；加载失败、无权读取和确实为空分别反馈。关闭、换模板、换渠道或权限失效时清空本次参数并忽略旧请求返回值；发送期间防重复提交。
4. `channelTestAdapter.ts` 从所选模板构造独立的本次发送载荷，使用已有 `sendInline`（`POST /notifier/{configId}/_send`）。模板内容、供应商编号与变量定义沿用实际数据；个人接收人由本次明确输入覆盖，群或请求地址按当前渠道固定目标约束。按提供商清除可能恢复旧接收人、切换目标应用 / 地址或扩大广播范围的模板字段、变量默认值与表达式，不继承业务订阅关系。只在用户点击发送时发请求，不保存或修改源模板、渠道配置。
5. 移除语音、短信对 `configuration.testTemplate` 的读取、必填检查、字段注入和“回渠道补齐模板”的跳转。清理无调用方的专用测试设置编辑代码与文案。历史 `testTemplate` 作为已有配置原样保留，但不再影响试发和普通渠道保存，也不自动迁成业务模板。
6. 所有试发入口同时检查渠道读取、发送及现有模板查询权限；权限不足时明确提示原因，不将其当成“没有模板”，也不修改菜单权限映射自动授予读取能力。模板查询继续使用现有资产权限过滤，发送前复核当前渠道和所选模板身份、参数及权限。

风险与待确认点：方案范围已按用户补充统一到七类现有试发适配器。邮件等原先可不选模板的快捷试发也将要求已有消息模板；只有渠道试发权限的账号还需已有的模板查询权限。当前工作区没有 `notify-manager` 控制器源码，现有前端接口和已检查的语音 / 短信 provider 是本方案证据；实施时需逐类核对实际模板详情响应、资产权限、固定目标及发送载荷兼容性。真实供应商投递需要测试账号联调，不将内存夹具通过等同于真实发送成功。

验证计划（尚未执行）：

- 覆盖七类渠道均展示并必选模板、发送内容来自所选模板，以及“渠道无 `testTemplate`、已有合法消息模板即可试发”的原始场景；覆盖 TTS / 语音文件、短信签名与变量、旧 `ttsCode`、模板缺失 / 删除 / 无权、多个渠道账号隔离、个人接收人覆盖、机器人群与 Webhook 地址不被模板替换、参数类型校验、请求迟到、重复提交和源模板不变。回归未支持渠道的入口策略及普通配置保存。
- 从 `runtime-ui/` 执行 `node --test modules/notify-manager-ui/tests/messageNotification{Channels,Trial,Contracts,Integration,Templates}.test.mjs`，更新并运行模块内 `tests/messageNotificationBrowser/trials.mjs`，覆盖中英日和 390px 窄屏。浏览器夹具记录发送请求，断言无渠道 / 模板写入请求。
- 从 `runtime-ui/` 执行 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`，区分既有诊断与本次新增问题；对改动 Vue 文件执行 `node ../ui/scripts/check-ui-style.mjs --files <改动文件>`。模块没有独立 lint 脚本。
- 从 `runtime-ui/jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notification-template-trial-build -- --module-name notify-manager-ui`，并执行 `git diff --check`。实施后的结果和未验证项回填本节。

### 当前实现与已有验证

阿里云语音页保留顶部“发送测试消息”，仅隐藏配置表单中的“渠道测试”分组、测试模板及样例参数编辑。试发读取已保存的 `configuration.testTemplate`，沿用统一弹窗和发送接口；缺少模板类型、模板编号或样例参数无效时提示缺项并禁止发送。编辑地域、AccessKey 等字段时原样保留历史测试配置，不要求补齐隐藏字段。

本次 S 级修复已落实（2026-11-13）：仅在 `runtime-ui/modules/notify-manager-ui` 恢复 `Channels/testing/channelTestAdapter.ts` 的 `voice:aliyun` 适配，在 `channelTestConfig.ts` 恢复发送前校验但不注册语音配置编辑能力；`useChannelConfiguration.ts` 同时过滤服务端可能返回的语音 `testTemplate` 字段。复用当前页面和弹窗，不修改后端接口、业务模板、权限、运营端 `ui/` 或测试设置编辑组件。

恢复验证（2026-11-13）：模块内执行 `node --test tests/messageNotificationChannels.test.mjs tests/messageNotificationTrial.test.mjs`，65/65 通过，覆盖 TTS / 语音文件参数、无效模板拦截、接收人保护、隐藏字段及普通保存保留历史值。执行 `SMOKE_PLAYWRIGHT_MODULE="$PWD/../../../ui/node_modules/playwright" SMOKE_OUTPUT=/tmp/voice-trial-restore-browser node tests/messageNotificationBrowser/trials.mjs`，10 组浏览器验证通过，包含七类渠道试发、语音三语查看 / 编辑隐藏设置、保存凭据保留模板、390px 窄屏其他接收人试发、缺少模板禁发；报告页面错误与业务网络请求均为空。测试仅使用内存夹具，未拨打真实电话，真实账号与服务商投递仍需联调。

从 `runtime-ui/jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/voice-trial-restore-build -- --module-name notify-manager-ui`，构建通过（21.70 秒），保留既有构建告警。工作区无独立 lint 脚本；从 `runtime-ui/` 执行 `node ../ui/scripts/check-ui-style.mjs --files modules/notify-manager-ui/views/system/MessageNotification/Channels/index.vue modules/notify-manager-ui/views/system/MessageNotification/Channels/ChannelConfiguration.vue modules/notify-manager-ui/views/system/MessageNotification/Channels/testing/ChannelTestModal.vue`，关联页面样式门禁通过；模块 `git diff --check` 通过。`./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 修改前后均为 195 项既有诊断，按文件、错误码和消息比较无新增或移除；完整类型检查尚未通过，修复既有错误后需重跑。日志前缀 `/tmp/voice-trial-restore-`。

语音入口移除的历史验证（2026-11-12，入口行为已由上文恢复方案替代）：模块内运行 `node --test tests/messageNotificationChannels.test.mjs tests/messageNotificationTrial.test.mjs`，57/57 通过；定向样式门禁和 `git diff --check` 通过，工作区无独立 lint 脚本。从 `jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notification-voice-remove-final-build -- --module-name notify-manager-ui`，构建通过（29.74 秒，保留既有构建告警）。在 `runtime-ui/` 执行 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`，修改前后均为 213 项既有诊断，无新增或移除；修复既有问题后需重跑。构建后仅删除三语简介中的试发提示，JSON 解析与实际 i18n 加载检查通过。

浏览器使用隔离内存夹具：模块内执行 `SMOKE_PLAYWRIGHT_MODULE="$PWD/../../../ui/node_modules/playwright" node tests/messageNotificationBrowser/trials.mjs`，完整回归通过，覆盖六类支持渠道、语音和服务号隐藏入口、历史值保留、短信参数保存、三语及 390px 窄屏。简介调整后以 `TRIAL_SETTINGS_ONLY=1` 复验相关页面通过，页面错误与业务网络请求均为空；日志前缀 `/tmp/notification-voice-remove-final-`，最终截图与报告位于 `/tmp/notification-voice-remove-copy-browser/`。未修改真实配置或发送通知，真实后端投递不在本次验证范围。

统一入口为 `Channels/testing/ChannelTestModal.vue` 与 `useChannelTest.ts`。邮件、钉钉工作通知 / 群机器人、企业微信、阿里云短信 / 语音、Webhook 共用「发一条测试 · 渠道名称」弹窗、发送锁定、失败重试及结果反馈。普通渠道常驻编辑，群机器人通过逐行菜单编辑。

- 默认发给自己，可选择其他单个接收人；校验邮箱、手机或渠道成员 ID / OpenID，禁止列表和广播目标。本人邮箱沿用主邮箱身份、首个邮箱身份、资料邮箱的优先级；手机读取账号资料；第三方绑定必须同时匹配 `type_provider` 与当前通知器 ID。加载失败支持重试，与确实未绑定分开显示。群机器人 / Webhook 直接使用当前配置的群 / 地址。
- 邮件、钉钉、企业微信、机器人和 Webhook 使用固定测试消息，系统名称读取 `useSystemStore().layout.title`。短信和语音只读渠道中保存的服务商测试模板和样例参数，提示实际内容以服务商模板为准。
- `channelTestAdapter.ts` 集中管理七类提供商的配置条件、接收人规则及内联参数。发送仅调用 `POST /notifier/{configId}/_send`，参数为 `{ template, context }`，不查询或写入业务模板；Webhook 页面的业务模板导航保持独立。微信服务号及未支持的提供商不显示渠道试发入口。
- 只允许已保存、无未保存修改且具有渠道查询 / 发送权限的配置试发。弹窗使用保存值的快照；发送期间锁定重复操作，失败保留输入。关闭、配置切换、保存值刷新、权限变化或组件卸载后忽略过期响应。缺配置时等待测试弹窗关闭，再进入整表编辑并联动对应帮助步骤。成功仅表示「已提交，请检查接收端」。

短信和语音配置页不再展示或编辑“渠道测试”区域；已有 `configuration.testTemplate` 继续原样保留。顶部“发送测试消息”的入口、参数读取及发送逻辑保持不变，试发弹窗不编辑配置、不选择业务模板、不输入 JSON。

| 提供商 | 保存路径与字段 |
| --- | --- |
| 钉钉工作通知 | 取 `configuration.agentId`，写入试发的内联模板。 |
| 企业微信 | 优先取 `configuration.alarmTemplateDefaults.agentId`，兼容历史 `configuration.agentId`，写入试发的内联模板。 |
| 阿里云短信 | `configuration.testTemplate`：`signName`、`code`、`parameters` |
| 阿里云语音 | `configuration.testTemplate`：`templateType`（`tts` / `voice`）、`templateCode`、可选 `calledShowNumbers`、`parameters` |

`parameters` 为 `{ name, value }[]`；无变量时可省略或为空数组，有变量时名称唯一、值非空，禁止覆盖接收人或路由字段。旧配置可以缺少这些设置，仍可读取和编辑；缺少试发条件时禁用发送并列出缺项。测试设置不改变业务模板规则或历史模板数据，无后端接口 / 数据库变更。仅修改 `runtime-ui/modules/notify-manager-ui`，保留工作区既有变更，不修改运营端 `ui/`。

验证（2026-11-11，以下命令除构建外从 `runtime-ui/` 执行）：

- `node --test modules/notify-manager-ui/tests/messageNotification*.test.mjs`：当前工作区 **178/178 通过**。覆盖八类提供商参数、单接收人限制、内联模板与业务模板隔离、账号与绑定接口、缺配置、失败重试、重复发送、保存快照、权限变化和迟到响应；日志 `/tmp/channel-unified-tests-final.log`。
- `SMOKE_PLAYWRIGHT_MODULE="$PWD/../ui/node_modules/playwright" node modules/notify-manager-ui/tests/messageNotificationBrowser/trials.mjs`：通过。逐渠道检查统一弹窗、更多菜单无“管理模板”、无模板查询权限仍可试发；覆盖邮箱 / 手机 / 绑定的未绑定及加载失败、接收人校验、发送中锁定、失败保留、配置切换与权限失效、缺配置跳转、保存失败重试、AgentId / 三类服务商设置保存回显、中英日及 390px 窄屏。夹具只操作内存，业务网络请求被拦截；报告无页面错误、无实际业务请求，见 `/tmp/channel-unified-browser/report.json`。测试夹具屏蔽 Vite 热更新 WebSocket，避免工作区并行构建重载页面。
- `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`：改动前后均 **213 条既有诊断**，按文件 / 错误码 / 消息忽略行号比较，新增 0、移除 0。完整类型检查尚未通过；日志 `/tmp/channel-unified-types-{before,final}.log`，对比 `/tmp/channel-unified-type-comparison.json`。既有问题修复后重跑此命令。
- 在 `runtime-ui/jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/channel-unified-build -- --module-name notify-manager-ui`：通过（20.91 秒）。保留既有 CSS、chunk 大小、混合导入、构建配置及浏览器映射数据告警；日志 `/tmp/channel-unified-build.log`。
- 工作区未提供独立 lint 脚本。四个变更 Vue 文件通过 `node ../ui/scripts/check-ui-style.mjs --files ...` 定向样式检查；SFC 编译包含在上述测试中，中英日试发资源各 45 个键且集合相同，`git diff --check` 通过。

桌面与窄屏效果分别保存于 `/Users/chris/.codex/visualizations/2026/11/11/01a1caf2-46b7-7033-8c9d-72f5c997225a/notification-channel-test.png`、同目录 `notification-channel-test-mobile.png`。未发送真实消息，实际 SMTP / 服务商投递与真实账号授权仍需使用测试账号联调；接口受理不代表实际送达。

## 邮件内置模板与清除反馈

邮件试发使用统一弹窗。本节记录模板编辑页的内置内容和移除入口前的清除配置交互。当前操作参见 [通知渠道统一试发](#通知渠道统一试发)。
实施方案已落实：

- `shared/builtinEmailTemplates.ts` 保留 10 个业务提供商的邮件默认内容、变量和预览样例，供 `Templates/hooks/useTemplateEditor.ts` 的新建邮件草稿选择。样例只用于预览，不成为变量默认值或保存 payload；`builtinKey` 仅为草稿内存标记。渠道统一试发不使用这些业务模板。
- 清除配置继续走 `requestRemove → deleteOpen → remove` 二次确认。420px 居中 Modal 显示“清除{渠道}的配置？”及影响说明，取消 / Esc 不写入，遮罩不能确认，确认按钮为红色“清除”。各渠道说明已按原型补齐：邮件、短信、语音说明停止通知及个人通知设置对应列置灰；企业微信、钉钉追加重新建立成员对应的说明；Webhook 说明停止当前配置推送并保留模板请求体；钉钉群机器人说明停止当前配置发群消息，群内机器人需另行移除。存在多份历史配置时只说明当前配置的影响，明确其他配置保留；未知提供商沿用通用说明。标题及正文使用通知方式名称，不把服务商名称作为个人设置列名。
- 原型的企业微信 / 钉钉清除动作还会级联清除成员对应和群机器人，当前 `Channels/useChannelWorkspace.ts#deleteConfig` 只删除所选通知配置，群机器人是独立配置。本次 S 级调整保持已确认的删除语义，弹窗明确“重新配置后，需要重新建立成员对应；独立配置的群机器人保留。”。说明派生位于 `Channels/useChannelsPage.ts`，展示位于 `Channels/index.vue`，中英日资源同步；`tests/messageNotificationBrowser/main.mjs` 的 `?clearMessages` 提供七类渠道的隔离内存夹具。
- 删除失败由 `messageNotificationState.ts#notificationFailureMessage` 穿透 `NotificationRequestError.original` 提取后端 `message`，在 `useChannelsPage.ts` 中通过 `onlyMessage` 显示。顶部 `entry.failure` Alert 及对应状态已删除，失败保留配置；整份保存失败同步使用消息提示，字段错误和成功后刷新失败的重试区保留。配置写请求使用平台 `hiddenError` 防止全局重复通知；无后端文案时保留本地化兜底。中英日文案同步。

复用边界：本次落实邮件共享默认定义、模板新建时的引用以及邮件测试；下方完整模板改造方案中的按业务无定制默认展示、单通道保存、首次主题创建、其他六类提供商默认 schema 和恢复默认等工作不属于本次交付，不应据此认定完整模板持久化改造已完成。现有已保存模板不会被内置内容自动覆盖。

历史验证（2026-11-11，邮件旧试发组件现已替换，当前验收见统一试发一节）：

- 在 `runtime-ui/` 执行 `node --test modules/notify-manager-ui/tests/messageNotification{Channels,Contracts,Integration,Templates}.test.mjs`，104/104 通过，覆盖后端原始错误消息、删除失败保留、内置模板与编辑器同源、无持久化模板试发、收件人校验、邮箱读取失败 / 未绑定、样例不入保存、锁定与迟到响应、现有企业微信流程。
- `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 改动前后均为 213 项既有诊断，忽略行号比较无变化；尚未全绿。工作区无独立 lint 脚本，三个变更 Vue 文件的定向样式门禁、语言资源编译和 `git diff --check` 通过。
- 在 `runtime-ui/jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notification-email-test-build -- --module-name notify-manager-ui`，构建通过（35.34 秒），保留既有构建告警。日志为 `/tmp/notification-email-{tests-final,types-before,types-after,style,build}.log`。
- 9200 隔离浏览器实测模板切换及预览、本人 / 其他邮箱、格式校验、发送中锁定、受理结果、失败保留后重试、读取失败与未绑定区分，以及 390px 窄屏无横向溢出。清除失败实测仅出现“当前通知配置已绑定模板，不可删除”的顶部消息，配置保留且内容区域无错误 Alert。隔离夹具只操作内存；真实邮件渠道默认入口已只读验证新弹窗和本人未绑定状态。原链接的配置 ID 当前未在列表内，实际默认配置 ID 为 `2100867959833513984`。未发送真实邮件、未删除真实配置。
- 截图：`/Users/chris/.codex/visualizations/2026/11/11/01a1ca88-588d-7d61-93de-d71cbbda4257/notification-email-test.jpg` 与同目录 `notification-delete-message.jpg`。

剩余验证：真实 SMTP 投递、实际账号权限矩阵及清除后的个人通知设置联动未执行，仍需测试账号联调；类型基线修复后重跑上述类型检查命令。

各渠道清除说明补齐验证（2026-11-11，已完成）：在 `runtime-ui/` 执行 `node --test modules/notify-manager-ui/tests/messageNotification{Channels,Contracts,Integration,Wechat}.test.mjs`，94/94 通过；模块类型检查改动前后均为 213 项既有诊断，忽略行列后新增 0、移除 0，尚未全绿。在 `runtime-ui/jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/channel-clear-copy-build-final -- --module-name notify-manager-ui`，构建通过（25.39 秒）。`Channels/index.vue` 的 SFC script / template / styles 编译、中英日消息通知键一致性（各 421 个）及 `git diff --check` 通过；无独立 lint 脚本，不记为完整 lint 通过。

隔离浏览器逐项核对企业微信、钉钉、邮件、短信、语音、Webhook、钉钉群机器人及多份历史 SMTP 配置的弹窗说明；390px 窄屏无横向溢出，取消按钮可操作，夹具错误日志为空。全部弹窗均取消，未删除真实或夹具配置；真实删除及个人通知设置联动仍沿用上述待验证边界。日志为 `/tmp/channel-clear-copy-tests.log`、`/tmp/channel-clear-copy-types-{before,final}.log`、`/tmp/channel-clear-copy-build-final.log`；截图为 `/tmp/channel-clear-wechat-final.png` 和 `/tmp/channel-clear-wechat-narrow.png`。

## 系统通知模板原型对齐

### 业务启停入口与默认开启

目标：消息模板页恢复业务（如设备告警）的启停入口，但不放进左侧目录树；新业务默认开启，避免首次使用的管理员不知道要手动启用，导致个人中心无法订阅、站内信收不到该类告警。入口位置按用户确认（2026-11-13）放在“更多”菜单，状态显示在标题行，禁用不加二次确认。owning module `runtime-ui/modules/notify-manager-ui`。

- 更多菜单：`views/system/MessageNotification/Templates/index.vue` 在业务模式下于“恢复默认”后增加“启用 / 禁用”项，按 `businessEnabled` 切换文案与图标，禁用条件沿用 `!canManage || busy`，点击直接调用 `toggleBusiness`。菜单中的“刷新”项已在业务 / 独立模板两种模式下移除，独立模板模式仍保留“新增模板”，菜单不会为空；`reload` 及目录、加载失败提示里的“刷新 / 重试”按钮保留。
- 状态标签：标题行 `DetailHeader#titleExtra` 在“默认 / 已保存 / 未配置”标签旁增加 `a-tag.message-templates__business-state`，仅业务模式显示“已启用”（`color="success"`）/“已禁用”（默认色），`title` 分别带出 `businessEnabled` / `businessDisabled` 长说明（未启用时为“业务未启用，个人中心暂不可订阅”）。
- 启停反馈：`Templates/hooks/useTemplatePage.ts#toggleBusiness` 在接口成功且目录回读到唯一真实记录（`businessActionState === 'ready'`）后提示 `onlyMessage(..., 'success')`；失败仍走既有 `businessActionState` 错误提示，不出现成功提示。
- 首次保存默认启用：`Templates/useTemplateWorkspace.ts#saveBusiness` 对 `id == null` 的占位业务首次保存时，载荷主题级 `provider.state` 改为 `enabled`；`api/notice/messageNotification.ts#saveBusinessTemplates` 注释同步。渠道级 `channel.state` 的保留逻辑（`workspace/businessTemplates.ts#buildBusinessTemplateItem`）不变。
- 文案：`messageNotification.templates.enableBusiness` / `disableBusiness` 仅被本页与浏览器夹具使用，直接改值为“启用 / 禁用”（Enable / Disable、有効化 / 無効化）；新增 `businessStateEnabled`、`businessStateDisabled`（标签短文案）及 `enableBusinessSucceeded`、`disableBusinessSucceeded`（成功提示）。中英日各 1092 个键一致，其中 `messageNotification.*` 各 708 个，无重复键。
- 测试：`tests/messageNotificationBusinessWorkspace.test.mjs`、`tests/messageNotificationTemplates.test.mjs` 的首次保存断言改为 `provider.state === 'enabled'` 并断言保存后 `businessEnabled` 为真；启用用例补成功提示断言；新增“菜单禁用直接停用、失败无成功提示”用例。`tests/messageNotificationBrowser/navigation.mjs` 原先点击已移除的“启用业务”按钮，改为经“更多”菜单启用 / 禁用，并核对状态标签文案、`title`、成功色和菜单中无“刷新”。
- 不做：不改左树，不改 `ui/`、后端、菜单与权限映射、core，不调整渠道级 `state` 开关，不在页面加载时自动批量调用启用接口，不发送真实通知。

验证（2026-11-14，命令在 `runtime-ui/` 执行，日志前缀 `/tmp/notification-business-toggle-`）：

- `node --test modules/notify-manager-ui/tests/messageNotification*.test.mjs`：368/368 通过（`-node-test.log`）。
- `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`：改动前后均为 195 条既有诊断，忽略行列号对比新增 0、移除 0（`-tsc-before.log` / `-tsc-after.log`）；完整类型检查仍未通过，需修复既有问题后重跑。
- `node ../ui/scripts/check-ui-style.mjs --files modules/notify-manager-ui/views/system/MessageNotification/Templates/index.vue` 通过；模块 `git diff --check` 通过。
- 在 `jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notification-business-toggle-build -- --module-name notify-manager-ui`：构建通过（22.87 秒，保留既有 chunk / CSS 告警，`-build.log`）。
- 浏览器（9200 内存夹具，所有 XHR 被拦截）：业务模式菜单为“恢复默认 / 启用”，标签“默认 / 已禁用”；独立模板模式菜单仅“新增模板”且无状态标签。`navigation.mjs` 中经菜单启用后路由采用 `actual-scene`、标签变为“已启用”并带成功色，再经菜单禁用后标签恢复“已禁用”，`setBusinessEnabled` 调用依次为 `true`、`false`。截图 `/tmp/notification-business-toggle-browser/{business,standalone}-menu.png`，日志 `-browser-navigation.log`。
- 未通过 / 未验证：`navigation.mjs` 在本节步骤之后的既有步骤失败，按 `getByRole('button', { name: '阿里云短信', exact: true })` 查找渠道按钮超时——渠道导航按钮的可访问名称已是“名称 · 状态”，与本次改动无关，未修改；该脚本其后的步骤本次未执行。未调用真实后端写入或发送通知。

剩余风险：后端 `notify-manager`（`/notify/channel/**` 属主）源码不在当前工作区，无法核实或修改。从未保存过模板的占位业务在后端默认是什么状态、启用后是否自带站内信渠道、`defaultSubscribed` / `defaultNotifyChannels` 的取值都取决于后端。本次前端只保证“首次保存即启用”和“入口可见、可一键启用”；“没人进过这个页面也默认开启”需在后端处理。首次保存若后端忽略载荷中的 `state`，以后端返回的主题记录为准。

Commit：`79bbbea`（本地 `2.20`，未推送）。提交快照验证（2026-11-16）：提交只包含本节改动，不含工作区内其他未提交改动；将提交内容导出到 `runtime-ui/` 下的临时目录运行同一组测试，356/359 通过，失败的 3 项为 `messageNotificationIntegration.test.mjs` 中读取真实 `modules/` 目录的菜单 / 路由聚合用例，临时目录不在 `modules/` 下，判断与导出位置有关而非本次改动；这 3 项在工作区原位置通过。日志 `/tmp/notification-business-toggle-commit-snapshot-test.log`。

合规告警默认模板使用 `${detail.sourceName}`，邮件和即时消息以「来源」显示，预览使用同一个变量。默认 Webhook JSON 的 `channel` 键也取该变量。默认模板、模板编辑和 Webhook 的 70 项定向测试通过。

### 业务节点联动与模板预览

交付复核（2026-11-18）：以 `origin/2.20` 的 `f5f4eb5` 为基线，使用 `codex/notification-template-variable-editing-2.20` 交付。模块根目录执行 `node --test tests/messageNotification*.test.mjs`，384/384 通过；15 个改动或新增 Vue 的 script/template/style 编译、16 个文件的定向样式门禁、中英日各 1096 个语言键一致性及 `git diff --check` 通过，相关 Vue 均少于 300 行。复用 `/tmp/notify-variable-panel-build-final.log` 的最终模块构建（9,373 个模块、42.45 秒）及 `/tmp/notify-variable-panel-types-final.log` 的类型记录，所覆盖生产源码未再修改；类型日志与变量编辑前基线归一化行列号后完全一致，仍为 195 条既有诊断。完整类型检查尚未通过，真实通知后端保存 / 发送及系统输入法联调仍待验收；重跑命令与边界见下文。

变量名称显示：`Templates/variables/catalog.ts` 为变量面板与编辑器合并接口、预置及草稿变量后，优先通过声明的 `i18nName` 或 `noticeTemplateModel.ts#getRecommendedVariables` 的字段国际化键解析当前语言名称；旧模板缺少名称或名称为变量 key 时也能显示翻译，未知字段沿用已有名称或 key。`api/notice/messageNotificationTypes.ts` 补齐已有可选 `i18nName` 的类型。名称解析只用于展示，变量 ID、插入表达式、草稿元数据和保存载荷保持原值，复用已有语言资源；全渠道编辑接入见下节。

名称验证（2026-11-17）：真实 9201 页面确认告警类型、告警源、产品 ID、属性名称等显示中文；真实组件的 SSR 验证覆盖中英日切换、旧声明覆盖、未知字段回退及草稿 / 保存载荷不变。模板、业务工作区与默认模板回归 95/95 通过，命令为 `node --test modules/notify-manager-ui/tests/messageNotification{Templates,BusinessWorkspace,PrototypeDefaults}.test.mjs`。模块构建通过（45.90 秒，沿用本节 Vite 命令，输出 `/tmp/notify-variable-names-build`），`git diff --check` 通过。类型检查 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 修改前后均为 195 项既有诊断，无新增或移除，修复既有错误后需重跑；工作区无独立 lint 脚本，本次未修改 Vue 或样式。浏览器未修改正文、保存配置或发送通知；完整保存仍沿用既有接口契约验证。日志前缀 `/tmp/notify-variable-names-`。

#### 全渠道模板变量以中文标签编辑

模板编辑时，已知变量统一显示为与变量面板一致的蓝色 `{中文名称}`；保存和重新读取始终保留原始 `${变量ID}`。范围仅为 `runtime-ui/modules/notify-manager-ui`：邮件主题 / 富文本正文 / 图片地址 / 附件引用，钉钉工作通知 / 群机器人，企业微信，语音，短信，Webhook JSON，以及动态提供商的字符串字段和通用 JSON。短信审核原文仍为只读，缺少名称的自定义变量显示其 key。不修改后端、接口、数据库、渠道配置、权限、路由或运营端 `ui/`。

变量面板调整（2026-11-18）：精简面板标题、让长变量列表不带走编辑器 / 预览，并补齐历史无前缀变量的已知示例。owning module 仍为本模块，9200 Vite 进程运行于 `runtime-ui/jetlinks-web-core`。

1. `components/TemplateVariablePanel.vue` 将操作说明放在标题右侧，使用现有 `--fs-12` 字号；窄栏允许自然换行，标题与内部滚动列表分开。
2. `Templates/index.vue` 通过 Spin 的 `wrapper-class-name` 约束编辑区可用高度，桌面编辑器、变量与 `components/TemplatePreview.vue` 的画布各自滚动；两栏 / 单栏保留响应式排列，变量面板最高 28rem，保存栏继续可见。单栏容器规则放在两栏媒体规则之后，避免窄容器被覆盖为两栏；查看态仍沿用原有布局。
3. `hooks/useTemplatePreview.ts#variableExample` 为面板与预览统一解析示例，优先使用非空显式 mock，再读取当前业务的原 ID / `detail.` 示例，最后使用非空默认值；保留 0、false 及变量声明的日期 / 数值格式。`useTemplateVariablePanel.ts` 对仅在可用目录、尚未插入草稿的变量同样使用该入口；未知字段或当前业务没有提供示例的解除时间显示“—”。示例仅用于展示，变量 ID、默认值、草稿和保存载荷不改写，复用原语言资源。

验证：`node --test tests/messageNotification{TemplatePresentation,VariableEditing,Templates,PrototypeDefaults}.test.mjs` 在模块根目录执行，105/105 通过；新增用例覆盖尚未插入的无前缀变量、日期 / 数值格式、空示例回退、0 / false、显式 mock 优先级和保存载荷不变。三个改动 Vue 的定向样式检查及 `git diff --check` 通过，无独立 lint 脚本；沿用下文类型命令，改动前后均为 195 项既有诊断，忽略行列后无新增或移除，完整类型检查仍需修复既有问题后重跑。模块生产构建通过（42.45 秒，输出 `/tmp/notify-variable-panel-build`，保留既有大 chunk 告警）。日志前缀 `/tmp/notify-variable-panel-`。

真实 9200 页面验证：1543×898 下变量列表从顶部滚到底（scrollTop 702），外层详情 scrollTop 保持 0，编辑器 / 预览与保存栏均可见，说明字体为 12px 且与标题同行；1304 宽度为两栏、700 宽度为单栏，变量面板高度均为 448px。滚动后在正文指定光标处插入蓝色中文变量，节点 title 仍为原 `${detail.alarmConfigName}`；撤销后正文与加载内容完全一致、保存按钮重新禁用，图片面板可正常打开 / 关闭。结束时退出编辑并清除临时视口设置，未保存真实配置或发送通知。截图：`/Users/fuhao/.codex/visualizations/2026/11/17/01a1e913-30e7-7972-a924-db07180ae4a2/notification-variable-panel.jpg`。

实现入口：

- `Templates/variables/catalog.ts`：面板与编辑器共用名称解析，按 ID 合并声明与目录，复用现有中英日翻译；展示名称不写回草稿。目录上下文局限于当前模板编辑器。
- `variables/quillVariables.ts`：复用模块已有 Quill 2.0.3 的局部 registry 和自定义 embed，节点携带完整原始表达式。同名变量按原 ID 区分，不能通过中文反查。复制 / 剪切输出原表达式，粘贴和手动输入完整表达式后恢复变量节点。
- `variables/TemplateVariableInput.vue` 与 `useTemplateVariableInput.ts`：共用单行 / 多行输入，保留光标、整体删除、撤销重做、中文组合输入、原始表达式长度校验及禁用 / 只读约束。草稿仅承载原表达式字符串；进入编辑、切换语言不会改变保存基线，撤销到加载内容会恢复原始换行编码。
- `variables/TemplateProviderField.vue`：通过原 `views/notice/template/components/TemplateFieldRenderer.vue` 的可选 `text-input` slot 接入文本字段，旧调用方继续使用原控件。`components/TemplateEditor.vue` 为各渠道及动态文本字段提供同一目录与光标上下文；钉钉 / 企业微信标题、正文仍合并到原供应商 message 字段。
- `hooks/useEmailRichTextEditor.ts`：变量节点的语义 HTML 只输出原表达式；保留邮件格式、列表、链接、图片及异步上传选区，编辑专用 span / data 属性不进入保存值。撤销回到加载文档时保留原始 HTML / 纯文本，并保留重做记录。附件及语音 / 短信变量引用使用 `variables/TemplateVariableText.vue` 展示。

验证（2026-11-17）：相关消息通知回归 382 项分批验证通过，包含真实 Vue / Quill 挂载、各渠道载荷、同名不同 ID、未知变量、旧模板回显、中英日切换、光标插入、整体删除、复制粘贴、撤销重做、中文组合事件、JSON 转义、长度边界和只读约束；最终编辑 / 渠道切片 75 项与模板切片 52 项通过，其余切片沿用本轮有效验证结果。模块生产构建通过（39.04 秒，保留既有大 chunk 告警，`-build-final.log`），13 个改动 Vue 的定向样式门禁（`-style-final.log`）、中英日语言键一致性及 `git diff --check` 通过。无独立 lint 脚本；完整 `vue-tsc` 修改前后均有 195 项既有诊断，忽略行列后无新增或移除（`-types-before.log` / `-types-final.log`），需修复既有错误后重跑。

浏览器已验证真实 9201 邮件主题 / 正文蓝色中文变量、指定位置插入、Backspace 整体删除及恢复原文后保存按钮禁用，验证后取消编辑，未保存真实通知配置或发送消息。隔离浏览器夹具已完成邮件插入 → 保存 → 重新编辑：名称仍显示中文、节点 title 保留 `${detail.levelText}`，再次进入编辑无脏状态；钉钉工作通知 / 群机器人、语音、企业微信、短信和 Webhook JSON 的变量回显正常。测试覆盖组合输入事件，尚未以真实操作系统输入法及真实通知后端进行联调。

可复现命令（从 `runtime-ui/` 执行）：`node --test modules/notify-manager-ui/tests/messageNotification*.test.mjs`；定向编辑回归为 `node --test modules/notify-manager-ui/tests/messageNotification{VariableEditing,EmailEditor,EmailRichText,VariableAttachments}.test.mjs`。类型命令为 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`。在 `jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notify-variable-editor-build -- --module-name notify-manager-ui`。日志前缀 `/tmp/notify-variable-editor-`；真实页面截图 `/Users/fuhao/.codex/visualizations/2026/11/17/01a1e913-30e7-7972-a924-db07180ae4a2/notification-variable-editing.jpg`。

渠道模板配置平铺（2026-11-13）：`Templates/components/channels/{DingTalk,Wechat,Voice,Sms}TemplateEditor.vue` 已移除“更多模板字段 / 发送选项”的折叠包装，将原有配置字段直接放在标题、正文或服务商模板内容之前；`components/TemplateEditor.vue` 的缺绑定必要选择项也前移到渠道编辑器之前。字段值、必填 / 禁用条件、远程选项及变量插入沿用现有实现，邮件和 Webhook 已平铺，无须增加配置项；不恢复已移除的通用“更多设置”。

平铺验证：从 `runtime-ui/` 执行 `node --test modules/notify-manager-ui/tests/messageNotification{Templates,BusinessWorkspace,TemplatePresentation,VoiceVisual,SmsVisual,DingTalkVisual,WechatVisual}.test.mjs`，113/113 通过；上述 5 个 Vue 文件的定向样式检查及模块 `git diff --check` 通过。沿用本节构建命令、输出至 `/tmp/notification-template-flat-fields-build`，构建通过（1 分 28 秒，保留既有 chunk 告警）；沿用类型命令仍有 194 条既有诊断，对比上一轮基线忽略行列后新增 0、移除 0，完整类型检查尚未通过，修复既有问题后重跑。模块无独立 lint 脚本。浏览器在独立临时标签中核对语音、企业微信、钉钉工作 / 群消息及短信，配置先于正文显示且无渠道折叠项，未修改字段、保存真实配置或发送消息。语音截图：`/Users/fuhao/.codex/visualizations/2026/11/11/01a1caae-7901-7753-a763-5ff87ae35585/notification-template-flat-fields.jpg`；日志前缀 `/tmp/notification-template-flat-fields-`。

统一移除模板“更多设置”（2026-11-13）：`Templates/components/TemplateEditor.vue` 已删除各渠道通用折叠区、固定配置及变量定义的常驻编辑入口，`hooks/useTemplateEditor.ts` 清理对应的配置清空方法；保留已有 `configId`、渠道绑定、变量元数据和正文插入时的自动登记。缺少有效渠道绑定时沿用必要的配置选择，多配置不自动任选；不修改后端或各渠道正文编辑字段，实际服务商字段保留并按本节“渠道模板配置平铺”展示。

本次验证：`node --test modules/notify-manager-ui/tests/messageNotificationTemplates.test.mjs` 51/51 通过；`node --test modules/notify-manager-ui/tests/messageNotificationBusinessWorkspace.test.mjs modules/notify-manager-ui/tests/messageNotificationTemplatePresentation.test.mjs` 52/52 通过，覆盖各渠道已绑定、空绑定与失效绑定、渲染不改草稿及单渠道保存。`node ../ui/scripts/check-ui-style.mjs --files modules/notify-manager-ui/views/system/MessageNotification/Templates/components/TemplateEditor.vue` 和模块 `git diff --check` 通过；模块无独立 lint 脚本。沿用本节构建命令、输出至 `/tmp/notification-remove-template-settings-build`，构建通过（2 分 10 秒，保留既有 chunk 告警）。沿用本节类型命令检查仍有 194 条诊断，对比最新 `/tmp/notification-style-types-after.log` 忽略行列后无新增或移除，完整类型检查尚未通过，既有问题修复后重跑。企业微信真实页面进入编辑后确认折叠区已移除，未修改正文、保存真实配置或发送通知。验证日志前缀 `/tmp/notification-remove-template-settings-`。

基于最新 `2.20`（`6dfceb8`）的交付验证：消息通知回归按有效切片覆盖 337 项，其中最终渠道回归 40/40 通过，其余 297 项沿用本轮联合回归成功结果；内置模板校验同时保证草稿保留原文、保存正文转换 HTML 换行。模块构建通过（1 分 2 秒），6 个变更 Vue 的 SFC 编译和定向样式检查、浏览器夹具语法及 `git diff --check` 通过；中英日各 1030 个键一致，其中消息通知各 646 个。模块类型检查未通过，共 213 条诊断：原有 211 条，加上远端基线已有的 `useTemplatePage.ts` 对当前 core `useNotificationConfigNavigation` 的两处调用签名不匹配；本次不修改 core，需同步 core 契约后重跑本节类型命令。日志前缀 `/tmp/notify-email-delivery-`。

模板保存反馈：`Templates/index.vue` 已移除保存成功的页面横幅，`hooks/useTemplatePage.ts` 删除对应 `saved` 状态，保存及路由同步完成后使用 `onlyMessage(t('messageNotification.templates.saved'), 'success')`。保留失败反馈、草稿和路由同步逻辑。现有模板回归 36/36 通过，覆盖保存失败无成功提示、首次保存和已有模板保存成功提示；页面样式门禁通过，模块构建通过（1 分 13 秒，保留既有 chunk 告警）。类型检查仍有 211 条既有诊断，忽略行号后与上一轮基线一致，无新增；模块没有独立 lint 脚本。本轮未调用真实保存接口。

邮件变量附件（2026-11-12）：`components/AttachmentEditor.vue` 与 `hooks/useTemplateAttachments.ts` 保留普通文件上传，并提供真实变量选择、附件文件名及“作为附件 / 插入正文”操作。保存沿用 `template.attachments[].{name,location}`；变量地址保留 `${变量ID}`，成功操作后通过 `useTemplateEditor.ts` 的 `registerVariable` 登记真实变量元数据，不写入预览样例。变量附件支持编辑、取消、删除，与上传附件共用 5 个数量限制及重名检查；正文图片不占附件数，上传并发、禁用、草稿切换和迟到结果均有隔离。`useEmailRichTextEditor.ts` 的 `insertAttachmentImage` 复用 Quill 正文选区插入变量图片；附件名仅在预览时替换样例。`components/TemplateEditor.vue` 已移除邮件“更多设置”，保留历史发送配置、接收对象与变量声明；缺少有效发送配置时仍显示必要的配置选择项。不改后端、左侧目录或其他前端工作区。

本轮验证：消息通知回归 275/275 通过，模块构建通过（53.20 秒，保留既有 chunk 告警），3 个变更 Vue 文件的样式门禁通过；类型检查仍有 211 条既有诊断，对比 Quill 基线无新增，不能视为类型检查通过。中 / 英 / 日各 467 个消息通知键保持一致。浏览器内存夹具已验证变量附件添加、编辑取消、正文指定位置插图、普通上传与变量附件共存、单渠道保存回显及预览；真实页面仅只读检查，未保存真实通知配置或发送邮件。截图：`/Users/fuhao/.codex/visualizations/2026/11/11/01a1caae-7901-7753-a763-5ff87ae35585/notification-variable-attachments.jpg`。真实文件服务及收件端效果尚待联调。

邮件正文使用 Quill 2.0.3，`components/channels/EmailTemplateEditor.vue` 保留现有格式工具栏，`hooks/useEmailRichTextEditor.ts` 管理真实选区、语义 HTML、5120 长度、禁用与生命周期。四个 Tiptap 依赖已移除，不新增 Vue 实例。进入编辑不改写历史纯文本 / HTML；用户修改后写入语义 HTML，保留列表类型与换行。草稿重置会清空撤销历史及图片选区，其他渠道与单渠道保存契约保持不变。

正文图片支持按钮选择上传、粘贴 / 拖放，接受小于 2 MB 的 JPG / PNG / GIF / WebP。`hooks/useEmailTemplateImages.ts` 复用 core `createFileUploadCustomRequest()`（`/file/upload?options=publicAccess`）与 `getFileDownloadUrl()`，成功后将真实可访问的绝对地址按光标插入正文，不保存 base64。上传期间保留原文，保存与渠道 / 业务切换沿用原有锁；附件和正文图片上传状态按来源聚合，任一仍在上传就不能提前解锁。上传失败、权限变化、切换草稿或卸载后的迟到结果不写入正文；异步选区随正文变化调整，多图按序插入。

图片地址也支持 `${imageUrl}` 或固定 HTTP(S) / 根路径中嵌入变量。在图片地址输入框聚焦后，点击变量面板插入到该输入框的光标位置；保存保留变量表达式。手工根路径在插入时按当前站点补全绝对地址，HTTP(S) 协议统一小写，变量 token 不进行 URL 编码；不批量改写历史图片。后端先对整个 HTML 替换变量，再处理图片，因此完整图片变量的实际值须为完整 HTTP(S) 地址。编辑器中的变量图片以原始地址占位并提供悬停提示，避免请求尚未解析的地址；右侧预览先替换样例，再用 DOMPurify 净化 HTML 和校验最终图片 URL，显示合法图片，移除未解析或危险地址。不新增后端未提供的图片变量，变量值仍由实际业务提供。

后端邮件提供商固定按 HTML 发送。`definition/emailTemplateContent.ts` 统一纯文本转义、换行、空正文 / 仅图片正文判断、图片地址校验及安全预览；`model.ts#buildTemplatePayload` 在保存边界转换旧纯文本，既有 HTML 保留，预览样例不进入保存。仅含合法图片或图片变量的正文也可保存。旧纯文本需保存后才会按转换后的 HTML 发送，本次不批量改写真实配置。

Quill 验证（2026-11-12）：统一消息通知回归 **254/254 通过**，其中真实 Quill 编辑器 17 项、图片上传 12 项、HTML / 图片净化 11 项。覆盖格式、列表语义、光标变量、Enter 后静默选区、挂载不脏、外部重置 / 撤销隔离、长度、禁用、图片变量保存回显、地址规范化和选区移动；上传覆盖 MIME / 大小、真实 URL、失败 / 并发 / 迟到结果、多图书签及附件状态聚合。最终模块构建通过（54.09 秒，保留既有分块告警），两个 Vue 文件定向样式门禁及 `git diff --check` 通过，三语各 448 个消息通知键一致。模块 `vue-tsc` 仍为 211 条既有诊断，相比单文件默认模板版本按文件 / 错误码 / 消息忽略行号后无新增或移除，不能视为类型检查通过。日志前缀 `/tmp/notification-quill-`，命令沿用下文；工作区无独立 lint 脚本。

浏览器在 9200 隔离内存夹具验证 Enter 后图片插入新段、上传期间保存 / 渠道锁定、图片地址输入框点击变量后弹层保持可操作、变量图片占位和右侧样例图实际加载（自然宽度 320）、保存后重新编辑仍保留图片 URL 与 `${imageUrl}`，重新进入编辑没有产生无关草稿修改。截图为 `/Users/fuhao/.codex/visualizations/2026/11/11/01a1caae-7901-7753-a763-5ff87ae35585/notification-quill-images.jpg`。上传和保存仅写入夹具内存，真实文件服务权限 / URL 可达性及实际邮件收件端待测试环境联调，本次未写入真实通知配置或发送通知。

依赖声明位于本模块 `package.json`，锁版本位于运行时工作区 `pnpm-lock.yaml`。完整工作区安装仍受已有 `patchedDependencies` 引用的补丁文件缺失影响；本次保持原配置，隔离安装并定向更新锁。所有 29 个 importer 的依赖闭包核验完整，移除仅上轮新增且当前不可达的 Tiptap 依赖项，Quill 离线冻结锁验证通过。完整安装需补齐原补丁文件后重跑 `pnpm install --frozen-lockfile`。

本模块独立 PR 不包含父仓锁文件；父工程接入该版本时须同步 `modules/notify-manager-ui` importer 的 `dompurify@3.4.17`、`quill@2.0.3`、`jsdom@26.1.0` 及依赖闭包，再验证冻结锁安装。

默认模板唯一维护入口为 `views/system/MessageNotification/Templates/definition/templateDefaults.ts`，统一定义六类通知的默认文案、业务 / 渠道正文结构、预览样例和真实字段适配；已移除分散的 `prototypeMessages.ts`、`prototypeContent.ts` 和 `prototypePreviewExamples.ts`。修改默认内容只更新该文件，默认生成、恢复默认及预览继续使用原有导出；后端已保存模板仍优先读取，界面语言不重写已有草稿。验证（2026-11-12）：六类业务、七个真实 provider 共 42 组模板以及变量 / 预览样例在合并前后逐字一致；统一回归 213/213、模块构建（1 分 3 秒）及 `git diff --check` 通过。类型检查仍有 211 条既有诊断，相比渠道状态版本无新增或移除。本次没有修改 Vue 或样式，沿用渠道状态版本的定向样式验证；页面与保存入口未变化，未重复浏览器操作或写入真实配置。验证命令沿用下文，日志前缀 `/tmp/notification-template-single-file-`。

渠道导航文案由 `shared/catalog.ts` 统一解析。`Channels/useChannelsPage.ts` 与 `Templates/hooks/useTemplateChannelNavigation.ts` 在一级导航使用渠道类型名，在钉钉子项使用「群机器人」「工作通知」。缺少类型翻译时使用接口的类型名。窄屏下拉沿用渠道树文案，平铺的多提供商选项显示类型和提供商名称。

顶部 `TemplateChannelNavigation.vue` 使用 `a-button-group` 和 `a-badge`。`hooks/useTemplateCatalog.ts` 从当前权限可见的配置快照派生 `channelConfigurationStates`，按实际类型和提供商判断，已配置显示绿点，未配置显示灰点。钉钉或微信任一子提供商已配置时，大类显示绿点。读取中和失败使用中性灰点和独立提示。渠道配置变更后刷新快照，切换渠道复用快照。

本地 9200 已对照两页的六个一级渠道名。通知模块 398 项单测、`tests/messageNotificationBrowser/navigation.mjs` 11 组隔离浏览器回归、模块生产构建、定向样式检查及三语资源键检查通过。浏览器回归覆盖中英日导航和 390px 渠道下拉。工作区无独立 lint 脚本。`vue-tsc` 仍有相同的 195 条既有诊断，修复基线后重跑下文类型检查命令。

渠道状态验证（2026-11-12）：统一消息通知回归 **213/213 通过**，新增覆盖精确 type/provider 及枚举值匹配、跨渠道快照复用、机器人分组、响应式刷新和读取失败状态；模块构建通过（55.09 秒），两个变更 Vue 文件定向样式检查及 `git diff --check` 通过。模块 `vue-tsc` 仍为 211 条既有诊断，相比上次按文件 / 错误码 / 消息忽略行号后无新增或移除，不能视为类型检查通过。9200 登录页已验证真实 `ant-btn-group`、六类渠道状态点、语音切换及选中态，1212px 视口无页面横向溢出；当前账号可见六类渠道均有配置，均显示绿点，未配置及失败状态由自动回归覆盖。沿用下文验证命令，日志前缀 `/tmp/notification-template-channel-status-`，截图 `notification-template-channel-status.jpg` 与下文效果图在同一目录；未写入真实配置或发送通知。

截图样式已对齐用户提供的邮件、钉钉、企业微信、语音、短信、Webhook 共 12 张查看 / 编辑截图。六类渠道分别由 `components/channels/` 下的独立编辑、预览组件承载。编辑区采用内容表单、可用变量、实时预览三栏，复用 `TemplateVariablePanel.vue` 和 `TemplatePhoneFrame.vue`，按工作区实际宽度收为两栏或单栏。顶部 `TemplateChannelNavigation.vue` 将钉钉、微信按大类组织，选择项使用后端实际提供商 ID。动态目录、权限、草稿与保存契约沿用下文约定。

模板样式统一：字体调整仅限 `views/system/MessageNotification/Templates/` 内，模板文本继承项目与组件库默认字号，清理模板局部字号覆盖；图标尺寸与用户编写的邮件富文本格式保持各自语义。`Templates/components/channels/EmailTemplateEditor.vue` 的 Quill 容器通过 `font: inherit` 沿用项目字体，避免回退到编辑器自带字号。模板查看态由 `Templates/index.vue` 的内容容器、`components/TemplatePreview.vue` 的预览容器和画布逐层分配剩余高度，填满工作区，内容超长时在详情区滚动；保留编辑态分栏及底部操作栏。渠道、记录、弹窗和共享样式中的越界字号调整已精确撤回，其他功能修改保留；不修改接口、数据或权限。

原样式验证（2026-11-13，范围纠正前）：27 个 Vue 文件的模板及脚本与修改前一致，定向样式门禁与 `git diff --check` 通过；在 `runtime-ui/jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notification-style-build -- --module-name notify-manager-ui` 构建通过（57.53 秒，保留既有构建警告）。在 `runtime-ui/` 执行 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`，修改前后均为 194 项既有诊断，无新增或移除；完整类型检查未通过，修复既有问题后需重跑，当前没有独立 lint 脚本。日志前缀 `/tmp/notification-style-`。

字体范围纠正验证（2026-11-13）：精确恢复 `Channels/` 下 7 个 Vue、`Records/components/RecordDetail.vue` 和 `shared/layout.css` 的 20 条字号声明及一条空样式规则；这 9 个文件与 HEAD 一致且不再有未提交差异，快照校验确认其余 24 个已修改文件内容未变。8 个恢复 Vue 的 SFC / 样式编译、定向样式门禁和 `git diff --check` 通过；沿用上述构建命令、输出至 `/tmp/notification-font-scope-build`，构建通过（50.11 秒，保留既有 chunk 告警）。本轮只恢复 CSS，脚本与类型契约无变化，类型结果沿用最近的 194 条既有诊断；完整类型检查仍需修复既有问题后重跑。恢复清单与保护校验记录为 `/tmp/notification-font-scope-restoration.json`，构建日志为 `/tmp/notification-font-scope-build.log`。

交付复核（2026-11-13）：当前模板回归 51/51、菜单集成回归 10/10 通过，20 个变更 Vue 的 SFC / 脚本 / 样式编译及附件区、模板页的定向样式检查通过，`git diff --check` 通过。沿用上述构建命令、输出至 `/tmp/notify-template-delivery-build`，最终模块构建通过（1 分 48 秒，保留既有 chunk 告警）；完整类型检查仍有 194 项既有诊断，对比字段平铺验证记录忽略行列后无新增或移除，修复既有问题后需重跑。日志前缀 `/tmp/notify-template-delivery-`；模块没有独立 lint 脚本，本轮未重新执行真实页面交互验证。

9200 实际页面验证：1511×898 下六类渠道预览底边均与详情区底边对齐，无横向溢出，正文及渠道标签为项目默认 14px；邮件富文本编辑器继承 14px，底部操作栏可见，1024×768 下单栏编辑无横向溢出。390px 视口仍被项目固定侧栏挤压，内容区只剩 94px，未通过手机布局验收；本次未调整共享壳层，也未逐一打开渠道弹窗和记录详情进行视觉回归。验证仅切换页面与查看编辑布局，未保存模板或发送通知。

消息模板入口为 `views/system/MessageNotification/Templates/index.vue`，owning module 为 `runtime-ui/modules/notify-manager-ui`。`TemplateDirectory.vue` 以分类和可选业务两级展示目录。已绑定和待配置的业务均可选择，设备告警与设备告警解除各有独立节点。首次进入默认选择树中的首个业务，显式业务或 templateId 深链优先。

`Templates/templateDirectoryModel.ts` 按后端 `provider` 匹配消息类型，在目录中按以下顺序展示。

| 分类 | 组内顺序 |
| --- | --- |
| 物联告警 | 设备告警 → 设备告警解除 → 场景联动 → 设备透传消息解析异常 |
| 视联告警 | 合规告警 → 安全告警 |
| 系统消息 | 系统公告 → 系统运行异常 |

扩展业务使用接口返回的分组和组内顺序，排在上述三组之后。后端可见业务决定哪些分类显示。节点身份和模板绑定使用实际记录。

目录排列验证（2026-11-19）：模块目录执行 `node --test tests/messageNotification*.test.mjs`，397 项通过。隔离浏览器 `navigation.mjs` 通过 10 组检查，覆盖业务深链、模板选中、渠道切换与目录重试。本地 9200 页面已核对三组 8 项的实际顺序。脚本语法、三语资源、`git diff --check` 和生产构建通过。`vue-tsc` 改动前后为相同的 195 项既有诊断，修复基线后可重跑下述类型检查命令。

分类验证（2026-11-17）：`tests/messageNotificationTemplates.test.mjs` 52/52 通过，覆盖旧接口分组、固定顺序、空分类隐藏、未配置业务入口、原业务身份与绑定、扩展业务、搜索和独立选择；BusinessWorkspace / PrototypeDefaults 43/43 沿用上轮未受影响的证据。模块生产构建通过（1 分 2 秒，保留既有 chunk 告警），命令沿用上文并输出至 `/tmp/notify-template-empty-groups-build`；`vue-tsc` 对比分类调整前的基线仍为 195 项既有诊断，新增 / 移除均为 0，完整类型检查未通过，修复既有问题后需重跑。模块没有独立 lint 脚本；本次无 Vue / CSS 修改，复用前轮样式门禁，`git diff --check` 通过，三语沿用前轮各 1096 个键一致的结果。真实 9201 页面已确认空的视联分类隐藏，物联 / 系统分类及其业务仍可见，保持原解除业务选中；分类搜索与切换沿用前轮页面验证及本轮回归。日志前缀 `/tmp/notify-template-empty-groups-`，截图 `notification-template-hide-empty-categories.jpg` 位于本轮可视化输出目录。

右侧以当前业务与渠道为上下文，优先展示已保存模板；确实未配置时使用原型 `shared/notify.js` 的默认文案，按后端真实变量适配。原型未覆盖的业务或提供商保留入口，显示未配置并允许按实际字段编辑。邮件使用单封邮件卡及附件列表，钉钉 / 微信使用手机消息卡片，语音使用来电界面及播报原文，短信使用手机气泡及字数，Webhook 使用 HTTP 请求卡及请求体，其他提供商展示字段摘要。编辑与预览实时联动；变量点击插入当前光标位置，预览样例不进入保存值；邮件仅渲染净化后的 HTML，其他渠道继续按文本或有限 Markdown 展示。

默认模板保存状态：`Templates/index.vue` 复用 `isDefault`（有预置内容且尚未持久化），仅在标题旁显示“默认模板 · 未保存”标签。预览 / 编辑区不展示黄色提醒横幅及“编辑并保存”按钮，保存入口沿用原有“编辑”与底部“保存模板”。保存成功后随真实持久化状态切换为已保存，取消编辑或尚未保存时仍显示未保存标签；已保存模板和恢复默认的已有模板沿用原有反馈。横幅专用的中英日文案已清理。

状态展示验证（2026-11-17）：移除横幅后，页面 SFC 编译、单文件样式门禁、模块构建（46.44 秒，保留既有 chunk 告警）及 `git diff --check` 通过，三语各 1096 个键一致，无残留横幅文案引用。模板回归沿用上一轮 52/52，业务保存状态沿用 BusinessWorkspace 首次保存回归；本轮仅删除展示节点及文案，脚本 / 类型未变，未重复运行 `vue-tsc`，上一轮仍有 195 项既有诊断，完整类型检查尚未通过，既有错误修复后需重跑本节类型命令。模块没有独立 lint 脚本。真实 9201 场景联动语音模板已确认横幅和按钮移除、标题未保存标签保留；未保存真实配置。日志前缀 `/tmp/notify-default-label-only-`，截图 `notification-default-label-only.jpg` 位于本轮可视化输出目录。

钉钉工作通知、企业微信的标题 / 正文表单由真实 `message` 的首行 / 余文适配，保存仍合回原字段，进入编辑不改动原值。短信保留真实服务商模板编号、签名远程选择和只读审核原文；短信 / 语音的变量对应表仅展示现有引用，实际发送参数仍由业务 `channel.channelConfiguration.variables` 提供，不新增后端未支持的变量映射字段。Webhook 保留 `contextAsBody` 模式，历史对象请求体的文本读取与变量插入统一使用格式化 JSON，进入编辑不改写原数据；请求地址预览隐藏账号、查询参数和片段，不展示虚构签名头。截图中的站内信、服务商演示参数和后端不可用变量不新增为业务能力。

#### 实现入口与接口

- `templateDirectoryModel.ts`、`hooks/useTemplateDirectory.ts`、`hooks/useTemplatePage.ts`：业务选择、默认选择、路由、查看 / 编辑状态和操作编排。
- `useTemplateWorkspace.ts`、`workspace/`：按业务及渠道隔离草稿、真实读写、保存身份迁移、迟到响应隔离；`hooks/useTemplateCatalog.ts`：动态目录、模板字段及精确提供商配置。
- `definition/`：原型默认文案、真实变量及独立预览样例；`components/TemplateEditor.vue`、`hooks/useTemplateProviderEditor.ts` 复用旧 `views/notice/template/` 的真实供应商字段与远程选项；`TemplatePreview.vue` 分发渠道预览。`hooks/useTemplateMessageEditor.ts` 适配消息首行 / 正文及光标插入；`hooks/useTemplateVariablePanel.ts` 提供通用 / 当前业务变量和展示样例。
- 渠道由 `GET /notifier/config/types`、`GET /notifier/config/type/{type}/providers` 查询，模板字段来自 `GET /notifier/template/{type}/{provider}/config/metadata`；合法空元数据不视为不支持。目录部分失败保留成功的渠道并提供重试，配置查询失败不解释为未配置。
- 业务目录继续使用 `GET /notify/channel/all-for-save`；已有主题通过 `GET /notify/channel/{实际主题id}/{channelProvider}/_query-with-template` 与 `PUT .../_save-with-template` 读写 `{ channel, template }`。未绑定的独立 templateId 深链兼容原模板 CRUD，不自动绑定业务。

#### 业务入口与个人订阅联动

- `hooks/useTemplateBusinessNavigation.ts` 同时识别 `business`、`topicProvider`、`channelProvider` 与 AI 告警会话参数，优先按实际记录 ID 定位。相同业务代码对应多个资产范围时要求选择具体记录；业务缺失、无权或绑定丢失不回退到其他模板。渠道入口的 `businessSelection=first-alarm` 只在首次落地使用，随后固定实际告警身份。
- 页头「启用 / 禁用」调用 `/notify/channel/{业务标识或实际ID}/enable` 或 `disable`。启用占位业务后刷新目录并采用唯一的真实记录 ID，保留编辑草稿。占位业务首次保存即创建启用业务。编辑模板时，保存沿用已有的渠道状态、订阅人关系变量和渠道授权。
- 历史独立模板可作为当前业务的内容来源，`useTemplateWorkspace.ts#importTemplate` 保留当前托管目标 ID，不覆盖历史源记录。新建独立邮件仍可选择 `shared/builtinEmailTemplates.ts` 中的内置内容，预览样例和 `builtinKey` 不进入保存载荷。
- 只读账号可以查询独立模板，但不请求要求保存权限的 `/notify/channel/all-for-save`。个人中心沿用 `/notify/channel/all` 与个人订阅接口判断可用性，表头“去配置”按真实业务记录导航；模板菜单新增 / 编辑动作保留 `notify-channel:query/save` 映射。部署后需要同步菜单并刷新角色登录态。
- 缺少发送配置时通过 core 的 `useNotificationConfigNavigation` 在独立标签打开渠道配置，返回后只刷新配置候选并保留模板草稿。原 AI 告警会话仅在对应业务模板保存成功后收到回传；独立模板保存不会触发该回传。

#### 保存与草稿约定

只保存当前业务、当前渠道。切换渠道保留各渠道草稿；切换业务或离页时有修改则确认放弃或继续编辑。取消编辑只还原当前渠道；恢复默认只替换当前草稿，保存后生效，取消保留原配置。保存及上传期间阻止渠道 / 业务路由切换，保存失败保留输入。无配置仍可查看和编辑，保存须选择可读且 type/provider 精确匹配的真实配置。

业务目录 `id == null` 时，首次保存复用 `PUT /notify/channel/{业务provider}/_save-with-templates`，只发送当前一项 `{channel, template}`，主题以 `enabled` 创建，不传伪造主题 ID，不另行调用 enable。成功后接收实际 `provider.id`，后续改用单渠道接口；保留渠道 state、grant、接收人变量及其他渠道绑定。钉钉企业消息与机器人共用后端 `notifier-dingTalk`，保存另一提供商会替换该绑定。

受控资产下首次创建不按业务代码幂等；超时、网关错误或成功但未返回有效身份时，结果视为未知并锁住重复保存，必须刷新目录核对后再操作。并发首次创建及资产 Scope 仍受既有服务端能力限制。业务不存在 / 无权、配置不可读、绑定模板丢失和确实未配置分别反馈，不将失败降为默认内容。业务目录仍受现有 `/all-for-save` 权限约束，后端权限扩展不在本次范围。

本轮只改运行时前端、必要 API 封装、默认定义、三语、测试及本 README；不改左树视觉与层级，不改后端、菜单或 `ui/`，不自动启用业务，不发送真实通知。原型 `file://` 被浏览器安全策略拦截，文案与交互依据 HTML 及 `shared/notify.js` 静态核对；实际应用使用 9200 页面与隔离内存夹具验证。

#### 验证

合并验证（2026-11-12）：通知模块测试 268/268 通过，补充内置邮件预览断言后模板测试 49/49 通过；20 个 Vue 文件的样式检查通过，模块构建通过（22.80 秒）。类型检查仍为 213 项既有诊断，按文件、错误码和消息对比无新增。渠道试发浏览器回归通过，语音与服务号测试入口保持隐藏；其余浏览器场景未完整重跑，真实部署写入及供应商投递仍待联调。验证日志位于 `/tmp/notify-merge-20261112/`。

在 `runtime-ui/` 运行 `node --test modules/notify-manager-ui/tests/messageNotification*.test.mjs`；类型检查为 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`。在 `runtime-ui/jetlinks-web-core/` 运行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/system-notification-template-visual-build -- --module-name notify-manager-ui`。工作区无独立 lint 脚本，使用 `node ../ui/scripts/check-ui-style.mjs --files` 检查变更 Vue 文件，并执行 `git diff --check`。

验证结果（2026-11-11）：全部 `messageNotification*.test.mjs` 测试 **207/207 通过**，覆盖动态目录、默认业务、业务 / 渠道草稿、六类渠道组件、真实字段适配、变量光标插入与安全预览、Webhook 对象 / 字符串请求体插入、单渠道保存、首次 disabled 创建和实际 ID 回写、配置深链、默认恢复、读取 / 保存失败、超时重复保存锁、权限及迟到响应。模块最终构建通过（1 分 4 秒），保留既有 CSS / 分块告警；22 个 Vue 文件定向样式门禁、SFC 编译及 `git diff --check` 通过。中英日各 807 个键一致，其中 `messageNotification.*` 各 424 个。模块 `vue-tsc` 仍为 211 条既有诊断，相比业务模板联动版本按文件 / 错误码 / 消息忽略行号后新增 0、移除 0，不能视为类型检查通过；既有诊断修复后重跑本节命令。当前日志前缀 `/tmp/notification-template-visual-`，业务保存契约的前次证据为 `/tmp/notification-template-business-`。

浏览器通过隔离内存夹具验证首业务、无模板业务、告警解除、各已知渠道预览、后端新增提供商的元数据编辑与预览、变量插入实时渲染、渠道草稿保留、业务切换确认、仅取消当前草稿、首次保存、恢复默认及取消、无配置提示、读取失败与重试。本次追加六类渠道查看 / 编辑外观、钉钉标题光标插入与实时手机预览、短信审核原文只读和 Webhook JSON 两态核对；1280px 视口下页面 `clientWidth/scrollWidth` 均为 1280px，编辑工作区无横向溢出。实际 9200 登录页已完成 templateId 深链及后端动态提供商只读回显核查，未保存真实配置或发送通知。当前效果截图为 `/Users/fuhao/.codex/visualizations/2026/11/11/01a1caae-7901-7753-a763-5ff87ae35585/notification-template-channel-styles.jpg`。本轮不认定 390px 窄屏视觉验收通过。真实后端写入、资产作用域、完整权限矩阵及供应商远程选项仍需测试环境联调。

## 消息通知三页迁移（contract-v1）

### 消息模板目录

`views/system/MessageNotification/Templates/components/TemplateDirectory.vue` 使用 Ant Design Vue `a-tree`，按上节的物联告警、视联告警、系统消息排列业务节点。扩展业务按接口 `type.id/name` 分组，设备告警与设备告警解除使用各自的 `channelConfiguration.templateId` 关联当前渠道模板。可通过目录选择业务，或通过 templateId 深链访问独立模板。

`templateDirectoryModel.ts` 负责分组、绑定与搜索路径。`hooks/useTemplateDirectory.ts` 管理展开、搜索和选中。分组默认展开，搜索自动展开命中的分类，清空搜索时恢复原展开状态。`hooks/useTemplateBusinessDirectory.ts` 通过 `messageNotificationApi.queryTemplateDirectory` 读取 `GET /notify/channel/all-for-save`，具备刷新、权限和卸载后的迟到响应保护。目录读取失败显示可重试提示。业务模板读写使用上节的业务单渠道和首次聚合接口，独立模板深链使用 `/notifier/template`。


### 通知记录全局查询

`views/system/MessageNotification/Records/presentation.ts#historyTableCells` 为列表生成展示值，空白和单独的横线视为缺省。缺省接收人显示“未指定接收人”，缺省原因显示“无异常”。缺省时间、发送内容和状态复用“未上报”，缺省渠道复用“未配置”。

缺省文案验证（2026-11-19）：本地 9201 的两页通知记录均无单独横线占位，接收人和原因显示对应文案。隔离页面确认已上报的失败原因正常显示。记录、集成、邮件富文本及模板展示测试共 70 项通过。三语资源、定向样式检查及模块构建通过。模块类型检查的 195 项既有诊断与修改前一致，修复基线后重跑下方类型检查命令。

详情抽屉标题为“详情”，旁边显示发送状态。`views/system/MessageNotification/Records/useRecordDetail.ts` 按邮件渠道识别历史正文并复用模板预览的 HTML 净化规则，兼容纯文本邮件的换行。`views/system/MessageNotification/Records/components/RecordDetail.vue` 渲染净化后的正文，并以文本块展示其他渠道的正文和失败原因。

详情渲染验证（2026-11-19）：本地 9201 页面已核对标题、状态标签、邮件分段和企业微信纯文本。模块目录执行 `node --test tests/messageNotificationRecords.test.mjs tests/messageNotificationIntegration.test.mjs tests/messageNotificationEmailRichText.test.mjs`，41 项通过。中英日标题资源、定向样式检查和模块生产构建通过。工作区没有独立 lint 脚本。模块类型检查的 195 项既有诊断与修改前一致，修复基线后在 `runtime-ui/` 重跑 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`。

列表与摘要验证（2026-11-19）：本地 9201 页面已确认邮件行单行省略、悬浮文案及点击打开完整正文，摘要显示四项。运行记录、集成、邮件富文本和模板展示测试（`node --test tests/messageNotification{Records,Integration,EmailRichText,TemplatePresentation}.test.mjs`），69 项通过。中英日通知记录翻译键、定向样式检查和模块构建通过。类型检查仍报修改前的同一批 195 项诊断，重跑命令见上段。

通知记录列表不展示“业务类型”列。`Records/useRecordsPage.ts` 定义列表列，`Records/index.vue` 已移除对应插槽，横向滚动宽度从 1420 缩减至 1300；筛选、详情、导出与接口字段沿用现有行为，owning module 为 `runtime-ui/modules/notify-manager-ui`。

详情字段与列表共用文案：`Records/useRecordDetail.ts` 的通知渠道使用 `messageNotification.records.field.channel`，`Records/components/RecordDetail.vue` 的发送内容使用 `messageNotification.records.field.notifyMessage`，发送时间与接收人继续复用表格字段键。详情摘要已移除“关联对象”，同步删除不再使用的三语文案键；接口字段、模板名称查询及跳转沿用现有实现。

失败原因展示：本模块 `Records/useRecordDetail.ts#contentSections` 在发送状态为 `error`（兼容枚举对象）时，在发送内容后追加“失败原因”，优先显示 `errorMessage`，缺省使用 `errorType`，均缺失时显示“未上报”。`Records/components/RecordDetail.vue` 共用内容区块渲染，中英日同步标题；成功、重试中和取消状态均不展示失败原因。

邮件必填项提示：列表与详情通过 `Records/presentation.ts` 将邮件通知器的模板必填校验提示展示为当前语言的文案。仅转换该条已知错误；其他诊断、原始记录和 CSV 导出保持原样。 记录与集成测试（`node --test tests/messageNotification{Records,Integration}.test.mjs`）32 项通过，覆盖列表文案、详情渲染和未知错误保留；中英日资源检查及模块构建通过。模块无独立 lint 脚本；类型检查仍为修改前的 197 项诊断，无新增，重跑命令见上文。

失败原因验证（2026-11-17）：下方记录页 / 集成命令 30/30 通过，现有详情用例覆盖错误信息优先级、多行内容、错误类型回退、原因缺失、枚举对象和状态切换。浏览器隔离夹具确认失败原因紧随发送内容，切换成功记录后不展示；定向样式、模块构建（22.67 秒）、三语键一致性（各 1152 项）和 `git diff --check` 通过。类型检查与前次基线同为 196 条既有诊断，忽略行列后完全一致；修复既有问题后需重跑下方类型命令。日志前缀 `/tmp/notification-records-failure-reason-`；真实后端及完整登录页面仍待联调。

详情调整验证（2026-11-17）：沿用下方记录页 / 集成命令，30/30 通过，覆盖摘要字段、发送内容标题、关联对象不展示及模板查询 / 跳转；定向样式检查、模块构建（26.24 秒）、三语键一致性（各 1151 项）和 `git diff --check` 通过。浏览器隔离夹具确认“通知渠道 / 发送内容”与表格一致，且不显示“关联对象”。类型检查与前次基线同为 196 条既有诊断，忽略行列后完全一致；完整类型检查仍未通过，待修复后重跑下方命令。日志前缀 `/tmp/notification-records-detail-labels-`，真实后端及完整登录页面仍待联调。

列调整验证（2026-11-17）：模块目录执行 `node --test tests/messageNotificationRecords.test.mjs tests/messageNotificationIntegration.test.mjs`，30/30 通过；定向样式检查、模块构建（25.47 秒）与 `git diff --check` 通过。浏览器隔离夹具确认表头已移除“业务类型”，其余七列及失败记录正常显示。类型检查前后均为 196 条既有诊断，忽略行列后完全一致，无新增；完整类型检查尚未通过，修复既有问题后重跑 `runtime-ui/` 下的 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`。工作区无独立 lint 脚本；构建与样式命令沿用上文，日志前缀 `/tmp/notification-records-remove-biz-type-`。真实后端及完整登录页面未联调，可通过 `pnpm dev` 在 `/system/notification/records` 复核。

数量展示调整：`Records/useRecordsPage.ts` 将全部与各状态的数量缺省值统一为 0，`Records/index.vue` 已移除统计失败重试入口及对应三语文案，沿用统计请求与列表反馈。验证（2026-11-11）：records / integration 测试 28/28、单文件定向样式门禁及模块构建（25.49 秒）通过；模块 `vue-tsc` 仍有 235 项既有诊断，对比前次验证新增 0、移除 0，既有问题修复后需重跑。模块没有独立 lint 脚本，`git diff --check` 通过，中英日各 305 个消息通知键一致。命令沿用下方验证段，当前日志为 `/tmp/notification-records-count-display-{tests,types,build}.log`。

已对齐原型中现有后端可支持的记录交互，owning module 为 `runtime-ui/modules/notify-manager-ui`。未指定状态时默认选中“全部”，列表查询不添加状态条件（`Records/useNotificationRecords.ts`）；链接中显式指定的状态及其他筛选条件仍然生效。重复点击当前状态切换为全部，显式 `state=all` 在刷新后保持。沿用 ConditionFilter、SwitchGroup、j-pro-table 与产品列表样式，展示渠道图标、失败原因，支持跨页勾选 / 清除和“导出已选” CSV。`Records/index.vue` 的发送内容列使用可点击的单行预览，超出列宽显示省略号，悬浮显示全文。邮件复用模板预览的 HTML 净化规则并保留行内格式，段落与换行合并为分隔空格，链接和图片以文字及替代文本预览。点击或使用键盘可打开完整详情。本次展示修复已用 `history=long` 浏览器夹具验证长文本省略和详情全文；记录页测试 18/18、定向样式检查及构建（24.49 秒）通过，类型检查仍为 235 项既有诊断，无新增。日志 `/tmp/notification-records-ellipsis-{tests,types,build}.log`。内容与操作列均可打开历史详情，关闭恢复入口焦点；详情摘要由 `Records/useRecordDetail.ts` 提供，分两列显示发送时间、通知渠道、接收人和消息模板，下方展示发送内容。打开详情时，在具备模板查询权限的前提下，用历史 `templateId` 调用现有 `messageNotificationApi.getTemplate`，显示对应模板的当前 `name`，点击仍携带原 ID 跳转。模板未配置显示“未配置”；有 ID 但名称查询失败、已删除或无权读取时显示“未上报”，不回退显示 ID。加载期间显示“加载中”；切换记录、关闭抽屉、权限变化或卸载会使旧响应失效。模板名称来自当前配置，发送内容来自历史记录。名称查询验证：records / integration 测试 30/30 通过，覆盖名称展示、按原 ID 跳转、关闭 / 权限 / 卸载 / 记录切换的旧响应失效及删除 / 错配 / 空名称回退；定向样式检查、模块构建（26.85 秒）和 `git diff --check` 通过，类型检查仍为 235 项既有诊断，无新增。浏览器确认显示“设备告警邮件”并打开对应 `template-alarm`；日志 `/tmp/notification-records-template-name-{tests,types,build}.log`。缺失上报数据统一显示“未上报”，缺失渠道或模板显示“未配置”，发送内容缺失仍展示占位；移除 ID 明细及原始模板 / 变量 / 结果快照区块。表格发送状态列宽为 100，发送内容列吸收剩余宽度，避免表格分配空余空间时放大状态列。验证（2026-11-11）：records / integration 测试 28/28、单文件定向样式门禁、模块构建及 `git diff --check` 通过；类型检查仍为 235 项既有诊断，新增 0、移除 0。日志 `/tmp/notification-records-detail-fields-{tests,types-final,build}.log`。浏览器验证字段顺序、空值占位、详情全文、模板链接实际跳转、发送状态表头实测 100px，以及 390px 窄屏无页面横向溢出；页面错误日志为空。中英日各 306 个消息通知键一致。

默认状态验证：下方记录页 / 集成测试 30/30 通过；Playwright `tests/messageNotificationBrowser/smoke.mjs` 的记录页 8 组检查全部通过，确认首屏选中“全部”、首次查询无状态条件、切换状态与查看详情正常。完整浏览器脚本随后停在消息模板目录的节点数量断言（实际 0，预期 2），未验证真实登录流程。通知模块构建（26.55 秒）、定向样式检查和 `git diff --check` 通过；无独立 lint 脚本。类型检查与修改前完全一致，仍有 196 条既有诊断，待基线修复后重跑下方 `vue-tsc` 命令。

接口契约：`api/notice/messageNotification.ts#queryHistory` 对接 `POST /notify/history/_query`；`countHistory` 对接 `POST /notify/history/_agg`。聚合请求使用 `AggregationQueryParam` 的 `columns`（`COUNT(id)`）、`groupBy`（state）和 `filter`。当前部署的聚合接口只支持 SSE；`Accept: application/json` 返回 406，因此明确请求 `text/event-stream` 并由 `notificationHistoryCounts.ts#readHistoryCounts` 解析有限数据流。解析支持 CRLF、BOM、注释、多行 data 和错误事件，拒绝无效 / 重复计数；统计未返回、加载中或失败时，界面数量统一缺省显示 0。列表与统计均使用平台认证及后端历史资产过滤，权限仍为 `notifier/query`，未修改菜单或后端。

状态与数据边界：`Records/recordQuery.ts#notificationHistoryAdapter` 是可注入的生产适配器；`useHistoryCounts.ts` 保留内容、接收人、时间与渠道 / 配置 / 模板范围，统计时去掉状态和分页，翻页 / 切换状态不重复统计。列表和统计各自使用 AbortSignal 与代际校验，防止旧响应覆盖；统计失败不影响正常列表；记录页不提供统计失败提示或重试入口，实际计数返回后正常展示。`useHistorySelection.ts` 在翻页时保存已选快照，筛选或权限变化后清空；仅导出已选记录的完整内容，保留中文、引号和换行，并转义电子表格公式前缀。

后端限制：`NotifyState` 只有 `success/error/retrying/cancel`，不将取消改称“没发”。`NotifyHistory` 没有重试次数；`NotifierController` 现有发送接口会创建新通知，不能充当保留历史身份、权限、幂等和审计语义的重发。失败详情的重发按钮因此仍禁用并说明暂不支持，未增加批量重发。存储保留策略尚无 30 天契约，页面按服务可见历史查询，不加固定保留承诺。

验证（2026-11-11）：`node --test tests/messageNotification*.test.mjs` 94/94 通过；针对真实 SSE 契约完成最终修复后复跑 contracts / records / integration，46/46 通过，其他未变更回归沿用前次证据。日志 `/tmp/notification-records-complete-tests-{all,final}.log`。`pnpm exec vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 修改前后均为 235 项既有诊断，按文件、错误码及信息对比新增 0、移除 0，日志 `/tmp/notification-records-complete-types-{before,final}.log`；既有错误修复后仍需重跑。core 下 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notification-records-complete-build-final -- --module-name notify-manager-ui` 通过（23.72 秒），保留既有告警，日志 `/tmp/notification-records-complete-build-final.log`。两个变更 Vue 文件的定向样式门禁及模块 `git diff --check` 通过；模块没有独立 lint 脚本。该轮验证时中英日各 306 个 `messageNotification.*` 键一致；移除统计重试文案后为 305 个。

历史页面验证（2026-11-11）：9200 真实登录态的发送失败筛选正常，聚合修复后显示全部 184、成功 56、失败 128、重试中 0、已取消 0。隔离夹具检查跨页勾选，下载并读取 CSV，确认只包含两页已选的两条记录；检查历史全文 / 原因、对应模板和渠道跳转。390px 窄屏抽屉宽 358px、右边界为 390px，无页面横向溢出；表格允许内部滚动。未发送真实通知或写入真实业务数据，完整账号权限矩阵仍待环境验收。本地原型浏览器预览受策略限制，对照依据为原 HTML 的 `recRow/recTable/recDrawer/recSeg/recBulk` 与事件源码。

### 企业微信试发与成员对应

#### 成员摘要与自动保存（2026-11-13，已实现）

`/system/notification/channels?channel=weixin:corpMessage` 的成员摘要、外部自动匹配与管理抽屉已按确认方案调整，owning module 为 `runtime-ui/modules/notify-manager-ui`。本节的自动匹配与筛选行为继续沿用；平台用户行与部门成员树以“按部门选择企微成员”一节为准。历史方案中的对应方式后端持久化仍未实施。

1. `Channels/members/WechatMembersSummary.vue` 与 `Channels/index.vue` 参考图 1，将真实的“已对应 / 总人数、未对应、已失效”放在紧凑描边摘要栏左侧，失效数量用语义色强调，“自动匹配”和“管理对应”右对齐，窄屏允许换行。最新统计按平台用户计数，与抽屉行及状态保持一致；现有接口只提供成员绑定和企微部门树，没有部门对应关系，暂不展示无法核实的“部门已对应 / 总数”。
2. `Channels/members/useWechatMembers.ts` 与 `Channels/useChannelsPage.ts` 复用同一自动匹配规则及保存流程：外部按钮完成匹配后直接保存，无需打开抽屉；loading 从开始匹配持续到绑定保存及汇总回读结束，期间禁止重复提交及冲突操作。抽屉内继续支持匹配后检查、手动调整和统一保存。保持手机号 / 邮箱唯一匹配、已有绑定与手动选择保护、写前冲突检查和请求失效保护；没有新匹配不发送空保存，失败提供可见反馈，写成功但回读失败时仅重试读取。
3. `WechatMembersDrawer.vue`、`useWechatMembersDrawer.ts` 及 `wechatMemberFilters.ts` 复用 `@jetlinks-web-core/components/ConditionFilter`，以字段 schema 承载成员、平台用户、联系方式、部门及对应状态查询。使用组件原始 `terms` 在已完整加载的成员快照上筛选，支持大小写不敏感文本匹配、部门子树与 AND / OR 分组；快捷状态共用同一条件模型，数量仅排除状态条件计算。状态使用 `a-button-group`，按图 2 的设备列表样例展示“全部 / 已对应 / 未对应 / 已失效”、数量、状态点和选中态。每次打开抽屉，`Channels/members/useWechatMembers.ts` 清空筛选条件并默认选中「全部」，显示所有对应状态的用户。筛选变更后回到第一页。移除常驻“刷新成员”按钮，仅在读取失败或冲突反馈中提供“重新读取”，外部保存成功但回读失败时不再提示未保存的手动草稿。
4. `locales/lang/{zh,en,ja}.json` 同步新的操作说明、无新增匹配及恢复文案；`tests/messageNotificationWechat.test.mjs` 和 `tests/messageNotificationBrowser/wechatMembers.mjs` 覆盖保存与筛选流程。展示组件仅承载布局与事件，异步编排和筛选由 hook / 纯函数负责，修改的 Vue 文件均未超过 300 行。

2026-11-19 在本地 9201 页面确认首次打开及切换「已对应」后重开均选中「全部」，筛选框为空，列表显示 20 位用户。模块目录执行 `node --test tests/messageNotification{Wechat,WechatVisual,Channels,Integration}.test.mjs`，105 项通过。模块生产构建与 `git diff --check` 通过，模块未配置独立 lint 脚本。在 `runtime-ui/` 执行 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`，修改前后均有相同的 195 条既有诊断，待基线修复后重跑同一命令。

边界：仅修改运行时通知模块，沿用现有接口、权限和手机号 / 邮箱唯一匹配；未增加部门对应业务、姓名兜底匹配或截图示例数据，运营端、后端及其他通知渠道行为保持原范围。

验证结果：在 `runtime-ui/` 执行 `node --test modules/notify-manager-ui/tests/messageNotificationWechat.test.mjs modules/notify-manager-ui/tests/messageNotificationChannels.test.mjs modules/notify-manager-ui/tests/messageNotificationIntegration.test.mjs`，92/92 通过，覆盖直接匹配保存、全过程 busy、无新增结果、保存失败与回读失败、重复点击、权限与配置切换、条件筛选 / 状态计数 / 分页重置。三处 Vue 的样式门禁、三语 698 个通知键一致性及 `git diff --check` 通过；本模块没有独立 lint 脚本，不据此宣称完整 lint 通过。

模块目录执行 `SMOKE_PLAYWRIGHT_MODULE=../../../ui/node_modules/playwright node tests/messageNotificationBrowser/wechatMembers.mjs`（可按本机 Playwright 安装位置替换环境变量），7 组浏览器验收通过：真实组件下的 loading / 禁用与直接保存、core 搜索及按钮组联动、抽屉预览后保存、失败重试、回读失败仅重读、无新增结果不写入与权限禁用。1440px 桌面及中英日 390px 抽屉验证通过，表格与状态组内部滚动可达，页面无横向溢出，浏览器异常与外部请求均为 0；截图和报告位于 `/tmp/wechat-members-browser/`。所有写入仅作用于内存夹具，未改真实成员关系；真实账号的权限矩阵及后端保存联调仍需通过开发服务的原页面验收。

在 `runtime-ui/` 执行 `pnpm exec vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`，修改前后均为 195 条既有诊断（忽略行号后无新增或移除），完整类型检查尚未通过，修复既有诊断后需重跑。在 `runtime-ui/jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/wechat-members-build-final -- --module-name notify-manager-ui` Vue 编译与模块生产构建通过（19.40 秒，保留既有分块体积等构建告警），最终日志为 `/tmp/wechat-members-build-final.log`；定向测试与类型日志为 `/tmp/wechat-members-{tests-final,types-before,types-final}.log`。未执行提交或推送。

操作栏选择弹层（2026-11-13，已实现）：`WechatMembersDrawer.vue` 的“平台用户”列始终以文本展示姓名和账号。操作栏继续使用 Ant Popover，弹层内容已由下节的企微部门成员树替代原平台用户列表；选择后关闭，点击外部或 Escape 可收起。已保存关系通过确认解除，尚未保存的选择可以清除；统一保存期间关闭弹层并禁用操作。

本次验证：`node --test tests/messageNotificationWechat.test.mjs` 23/23 通过；上述浏览器脚本扩充为 9 组并全部通过，新增操作栏锚定、文本列不出现控件、姓名 / 账号搜索及空结果、清除草稿、切换行、外部点击 / Escape、保存期间禁用与 390px 弹层边界检查。浏览器异常与外部请求均为 0，写入仍仅使用内存夹具；截图和报告在 `/tmp/wechat-picker-browser/`。Vue 样式门禁、三语 699 个通知键一致性和 `git diff --check` 通过；模块仍无独立 lint 脚本。沿用上述类型检查命令，195 条既有诊断无新增或移除，完整类型检查仍待既有问题修复。模块生产构建使用上述命令将 `--outDir` 替换为 `/tmp/wechat-picker-build`，23.52 秒通过，保留既有构建告警。日志为 `/tmp/wechat-picker-{tests,types,build,browser}.log`；真实后端保存联调尚未执行。

#### 按部门选择企微成员（2026-11-13，已实现）

抽屉以平台用户为行，依次展示“平台用户、企业微信成员、对应方式、对应状态、操作”；平台用户列保持文本，操作栏“选择成员 / 更换”打开“部门 → 子部门 → 企微成员”树。汇总、快捷状态与分页按平台用户计数；没有对应的用户也完整展示，失效平台用户的历史绑定保留只读行及解除入口。外部自动匹配直接保存、抽屉草稿统一保存与写前冲突检查继续沿用。

`Channels/members/WechatMembersDrawer.vue` / `useWechatMembersDrawer.ts` 使用 core `AutoTree` 承载成员单选；`wechatMemberTree.ts` 根据现有部门树和成员 `department` 字段组树，支持姓名、部门、手机号及已有邮箱 / ID 搜索。搜索部门显示其子树，搜索成员保留并展开祖先，清空恢复；部门不可绑定。多部门成员在各所属部门显示但共用成员身份、占用状态及选中态，部门人数按成员去重。没有可见部门的成员归入“未分组成员”，空结果显示空态。弹层有独立高度约束，展开后使用虚拟树内部滚动，适配窄屏。

`useWechatMembers.ts`、`wechatMemberMatching.ts` 的草稿改为“平台用户 ID → 企微成员 ID”，`wechatMemberFilters.ts` 同步用户与成员字段筛选。已保存和其他行待保存的成员均不可重复选择；旧成员在更换保存完成前保持占用，保存后释放。同一用户更换成员携带原绑定 ID 调用现有 `_bind`，回读后仍只有一条关系，不增加前端先解绑请求。接口契约已核对 `modules/authentication-manager/src/main/java/org/jetlinks/pro/auth/web/ThirdPartyUserController.java#bind` 与 `entity/ThirdPartyUserBindEntity.java#generateId`，后端按 type/provider/user 生成绑定身份。本次仅修改运行时通知模块，未改后端、运营端、匹配规则、权限或历史对应方式持久化。

验证结果：在模块目录执行 `node --test tests/messageNotificationWechat.test.mjs tests/messageNotificationChannels.test.mjs tests/messageNotificationIntegration.test.mjs`，95/95 通过，覆盖平台用户全集、原绑定替换与重新加载、手动保护、占用释放、失效关系、树路径 / 搜索 / 多部门去重 / 无部门兜底及原有自动保存与异常恢复。`SMOKE_PLAYWRIGHT_MODULE=/Volumes/SSD/work/jetlinks/cloud.jetlinks/ui/node_modules/playwright SMOKE_OUTPUT=/tmp/wechat-tree-browser node tests/messageNotificationBrowser/wechatMembers.mjs` 的 9 组验收通过，包含部门展开与内部滚轮、搜索三类字段、单选 / 清除 / 更换、保存期间禁用、390px 树弹层和中英日抽屉；浏览器异常及外部请求均为 0。全部写入仅作用于内存夹具，真实账号权限和后端写入联调仍待环境验收。

在 `runtime-ui/` 执行 `node ../ui/scripts/check-ui-style.mjs --files modules/notify-manager-ui/views/system/MessageNotification/Channels/members/WechatMembersDrawer.vue` 通过，三语 704 个通知键一致，`git diff --check` 通过；模块无独立 lint 脚本。`pnpm exec vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 仍为 195 条既有诊断，忽略行号后无新增或移除，完整类型检查尚未通过。在 core 目录执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/wechat-tree-build-final -- --module-name notify-manager-ui` 构建通过（25.41 秒，保留既有构建告警）。日志为 `/tmp/wechat-tree-{tests,types-final,build-final,browser}.log`，截图与报告在 `/tmp/wechat-tree-browser/`。


#### 管理对应抽屉优化计划（2026-11-12，待确认）

目标：按本轮五项要求调整企业微信“管理对应”抽屉：复用 core 搜索组件；表头依次为“平台用户、企业微信成员、对应方式、状态、操作”；独立封装成员选择；移除常驻“刷新成员”；对应方式区分“自动匹配”和“手动”。本计划确认实施后，替代下文历史版本中“企微成员为行、选择平台用户”的交互约定。

范围与分级：`localhost:9200` 的开发服务实际来自 `runtime-ui/jetlinks-web-core`，前端 owning module 为 `runtime-ui/modules/notify-manager-ui`。推荐方案同时补齐 `modules/authentication-manager` 的既有第三方绑定接口元数据，按 L 级前后端契约变更确认后实施。当前仅记录计划，尚未修改实现。

页面风格（用户已指定设备列表作为参照）：抽屉继续使用 `JlDrawerShell`，内容采用当前设备列表的检索与表格布局。代码参照为 `runtime-ui/modules/device-manager-ui/views/device/list/unified/index.vue` 与 `views/device/list/components/IotDeviceAssetSearchBar.vue`，以当前源码和用户截图为准。目标用户是维护通知接收关系的管理员，第一任务是从平台用户集合中筛选并选择 / 更换企业微信成员，成功标准是可检索、可辨别状态与对应方式、可完成保存及解除。

- 顶部工具栏采用设备列表的同排布局：左侧 `ConditionFilter` 自适应占宽，右侧为带状态点和数量的“全部 / 已对应 / 未对应 / 已失效”按钮组，最右侧放“自动匹配”主按钮。窄屏自动换行，汇总及必要说明保持紧凑，不重复放置自动匹配按钮。
- 表格复用设备列表当前使用的 Ant Design Vue `a-table`，调整原抽屉的 `size="small"`，沿用设备页的默认行距、浅色表头、行分隔线和悬停样式；严格保留指定五列。姓名与已有账号 / 部门信息采用主次两行，缺失信息不编造；没有详情动作的名称不伪装为可点击链接。
- 状态复用设备页的 `j-badge-status` 与语义色；操作列固定在右侧，以 `TableActions` 保留“选择成员 / 更换”常用入口，解除放在更多面板并保留确认。独立成员选择器锚定行操作按钮弹出。
- 表格区域独立滚动，底部分页右对齐，包含总条数、页码和每页条数；保存 / 关闭继续放在抽屉固定底栏。搜索、分页、操作弹层与底栏在窄屏保持可达。
- 只借鉴列表密度和公共组件组合，不引入设备接入、批量操作、勾选列或设备侧栏，也不跨业务模块导入私有组件。新增样式限定在成员抽屉，采用当前主题与间距 token。

实施步骤与文件职责：

1. `Channels/members/useWechatMembers.ts` 以平台用户构建行与汇总，保留不可解析的历史绑定以便解除；`wechatMemberMatching.ts` 继续负责唯一匹配、冲突检测和提交转换。选择、更换以平台用户为入口，避免同一企微成员被重复占用，保留自动匹配不覆盖已有关系或手动选择的约束。
2. `WechatMembersDrawer.vue` 和 `useWechatMembersDrawer.ts` 接入 `@jetlinks-web-core/components/ConditionFilter`，用统一条件模型承载平台用户、企业微信成员、企微部门、对应方式及状态；快捷状态与条件联动，筛选后重置分页。按要求保留五列，未对应显示“选择成员”，已对应显示“更换”，解除入口收进更多操作并保留确认。删除常驻“刷新成员”，加载失败或冲突后的恢复入口放到对应反馈区。
3. 新增局部 `WechatMemberPicker.vue` 及 `useWechatMemberPicker.ts`，使用现有 Ant Design Vue Popover / Tree 组成独立成员选择器：按企微部门展示，支持姓名、部门、手机号搜索，展示已选与占用状态；展示组件通过 props / emits 交互，请求和保存仍由工作区 hook 负责。新增与修改 Vue 文件控制在 300 行以内。
4. 对应方式仅使用 `automatic` / `manual` 两种值，分别展示“自动匹配”与“手动”；待保存提示与对应状态分开。现有 `api/notice/wechatMembers.ts` 和后端 `ThirdPartyBindUserInfo` 均未传递来源，`ThirdPartyUserController` 查询及保存也未映射来源。推荐增加可选 `mappingMethod`，映射至 `ThirdPartyUserBindEntity.others` 的专用键，保持旧请求兼容，不增加表字段；更换与解除后正确更新或清理来源。无来源的历史绑定及未对应行显示“—”，不根据联系方式反推曾经采用的方式，也不把历史关系统一标成手动。
5. `Channels/useChannelsPage.ts`、`Channels/index.vue` 与 `WechatMembersSummary.vue` 同步模型和事件；更新 `locales/lang/{zh,en,ja}.json`、现有成员测试与浏览器夹具。完成后回填本节，并同步后端原始说明及仓库文档索引。

范围之外：不修改运营端 `ui/`、其他通知渠道、菜单权限、通知发送流程或数据库结构；不增加部门对应功能、姓名兜底匹配或截图中的示例数据。继续沿用当前手机号 / 邮箱唯一匹配和暂存后统一保存；不将截图中的说明文字视为新增业务规则。

风险与确认点：设备列表风格已由用户明确指定；上一轮关于对应方式持久化所需最小后端兼容扩展的确认仍待回复。旧绑定没有可靠来源，无法补推自动或手动；新前端须配套更新后端，否则来源无法跨重新加载保留。移除刷新按钮后仍需保证加载失败、并发冲突与写后读取失败可恢复。现有工作区有未提交改动，实施应在其基础上局部修改。

验证计划：复用 `tests/messageNotificationWechat.test.mjs` 和 channels / integration 回归，重点验证平台用户为行、未对应用户完整展示、条件与计数、独立选择器搜索 / 部门树 / 占用禁用、更换 / 解除、手动保护、对应方式保存后重载、旧数据兼容、异常恢复和跨配置迟到响应。浏览器使用现有隔离夹具验证桌面与 390px 窄屏；真实页面只读核验。前端在 `runtime-ui/` 执行 `node --test modules/notify-manager-ui/tests/messageNotificationWechat.test.mjs modules/notify-manager-ui/tests/messageNotificationChannels.test.mjs modules/notify-manager-ui/tests/messageNotificationIntegration.test.mjs`、`pnpm exec vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`，比较既有类型诊断，并执行模块构建 `pnpm -F jetlinks-web-core build -- --module-name notify-manager-ui`。当前工作区无独立 lint 脚本，采用 Vue 编译、样式 token 检查与 `git diff --check`，不宣称完整 lint 通过；后端补充绑定元数据写入 / 读取、旧载荷与既有调用方兼容测试及模块编译，执行命令待按该模块现有测试入口确定。以上实现验证尚未执行，结果待确认实施后回填。

AgentId 与说明栏调整（2026-11-11，已实现）：企业微信渠道增加应用 ID（AgentId），支持新建、回显和就地保存；发送及绑定授权 URL 优先读取渠道 AgentId，未填写的历史渠道继续使用模板值。模板 AgentId 可选，缺少渠道与模板值时在发送前拒绝。右侧配置说明在已保存及新建渠道均默认展开，保留按渠道手动收起。实现位于 `Channels/channelSchema.ts`、`configuration/channelMetadata.ts`、`useChannelsPage.ts`、`useChannelSend.ts` 与旧模板表单 / 接收人 hook，以及后端 `WechatCorpProperties.resolveAgentId`、`WechatCorpNotifier.send` 和 `WechatCorpNotifierController.getUserBindingUrl`。前端为旧元数据补齐已实现的 AgentId 契约，不生成字段值；部署必须同时更新 `notify-wechat`，旧后端不会消费渠道 AgentId。发送只修改独立请求体，不写入或迁移历史模板。

AgentId 验证：在 `runtime-ui/` 执行 `node --test modules/notify-manager-ui/tests/messageNotification*.test.mjs`，当前工作区 144/144 通过，覆盖渠道 AgentId 试发、旧模板回退、旧元数据补字段与保存回显、模板接收人选择、说明默认展开和手动选择保留。执行 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`，前后同为 213 项既有诊断，忽略行号后新增 0、移除 0；类型检查未全绿。`ChannelSendDrawer.vue` 的脚本 / 模板 / 样式编译、三语通知键一致性（当前各 417 个）、夹具脚本语法及 `git diff --check` 通过，无独立 lint 脚本。在 `runtime-ui/jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/wechat-agentid-build-final -- --module-name notify-manager-ui`，最终构建通过（29.54 秒），保留既有 chunk / CSS 等告警。日志前缀 `/tmp/wechat-agentid-`。

AgentId 浏览器复核：9200 实际企业微信页已显示新字段和默认展开的右侧说明，仅只读检查。隔离夹具验证新建字段、已保存字段就地修改与回显、无模板 AgentId 时使用渠道值完成试发确认、手动收起 / 展开，以及 390px 下页面无横向溢出。截图 `/tmp/wechat-agentid-channel.png`、`/tmp/wechat-agentid-mobile.png`；未修改真实配置、对应关系或发送真实通知。后端新增 `WechatChannelAgentIdTest`，Maven wrapper 定向测试在编译前仍被父工程依赖缺失及私服 401 阻断；恢复依赖后执行后端组件 README 中的命令，再将更新后的 `notify-wechat` 加载至运行时通知服务并验证真实应用发送。

原型交互约定（2026-11-11）：在配置正文增加“成员对应”汇总及“自动匹配”“管理对应”两个入口；打开管理抽屉只读取已有关系，当时默认筛选未对应，自动建议改为显式点击生成。抽屉复用同一汇总、搜索、部门筛选、状态分段和分页，行内选择 / 更换平台用户，解除仍单独确认。沿用已确认的企微成员列表和手机号 / 邮箱唯一匹配、暂存后统一保存及 `bind` 权限；不引入原型的姓名兜底、即时落库、部门对应或新后端接口。新增失效关系展示仅指当前可见数据无法解析对应对象，不推断对象已删除。修改只在 `Channels/members/`、页面装配、三语文案和测试；验证显式匹配、手动保护、筛选计数、失败 / 迟到响应、权限、桌面 / 窄屏，并对比模块类型诊断及构建。原型依据为本地 `消息通知.html` 的 `mapSec/mapDrawer/mapUsers/mapAuto`，浏览器策略不允许直接打开该 `file://`。

本轮原型交互验证：通知回归 135/135 通过，最终 channels / wechat / integration 定向回归 64/64 通过；覆盖汇总只读、显式匹配、手动选择及清除保护、搜索 / 状态计数、失效对应的解除、关闭重开、跨配置迟到响应，以及原有保存失败 / 并发冲突保护。模块类型检查前后同为 213 项既有诊断，忽略行号后新增 0、移除 0；最终模块构建通过（25.09 秒），三个 Vue 文件的 SFC / 样式编译及颜色 token 检查通过，中英日各 377 个通知键一致，`git diff --check` 通过；没有独立 lint 脚本，不记为完整 lint。命令沿用本节和下方验证入口，日志 `/tmp/wechat-mapping-{tests-final,tests-focused,types-before,types-final,style,build-final}.log`。

浏览器复核：9200 实际企业微信配置页显示“成员对应”汇总及“自动匹配”“管理对应”双入口，只进行了读取。隔离夹具验证默认未对应且无隐式建议、显式匹配、行内选择 / 更换、确认解除、保存后汇总联动、保存失败重试、放弃预览及无 bind 权限禁用；390px 下抽屉宽 358px，页面无横向溢出、表格内部滚动、保存按钮可达。截图 `/tmp/wechat-mapping-channel.jpg`、`/tmp/wechat-mapping-desktop.jpg`、`/tmp/wechat-mapping-mobile.jpg`。保留原定企微成员为行、选择平台用户的管理方向；原型的部门对应、按姓名兜底和即时写入不在本轮范围。未修改真实对应关系或发送通知，后端依赖与角色矩阵的既有待验证项保持如下。

此阶段的运行时通知渠道支持企业微信已保存模板试发和成员对应。配置保存 CorpID / AgentId / Secret 并提供获取说明，AgentId 优先取渠道值，未填写的历史渠道回退到模板值。回调 URL、Token、EncodingAESKey 与真实出口 IP 当时仅提供获取说明。当前页的试发与操作项参见 [通知渠道统一试发](#通知渠道统一试发)。

试发选择当前渠道和配置兼容的已保存模板，通过 `/notifier/template/{id}/detail` 获取完整变量定义，再调用 `/notifier/{configId}/{templateId}/_send`。企业微信要求渠道或历史模板中存在 AgentId，且 toUser / toParty / toTag 中至少一类接收人有效，不要求邮件 sendTo；邮件接收人与动态附件校验保持可用。没有兼容模板时提供模板配置入口，失败保留输入，成功仅表示请求已提交。

成员抽屉由 `views/system/MessageNotification/Channels/members/` 承载，复用企微部门树、全部成员和第三方绑定接口；`api/notice/wechatMembers.ts` 完整分页读取 `/user/detail/_query`，`notify-wechat` 的 `CorpUser` 透传可选 mobile / email / bizMail（映射上游 biz_mail）。渠道页预加载成员汇总，打开管理抽屉只展示已有关系；点击“自动匹配”才生成建议：清理手机号格式字符、邮箱首尾空白并忽略大小写，不猜测国际区号，不使用姓名或 ID 兜底；仅接受唯一且无冲突的结果。已有关系优先，同配置内平台用户不能重复分配；没有可用联系方式、重复或冲突时手动选择，暂不对应的成员可留空。

自动建议和手动修改先暂存，通过原 `_bind` 接口统一保存；修改携带原绑定 ID，解除使用单独确认及原 `_unbind`。写前重读并比较完整绑定快照，发现变化要求重新同步；这是客户端乐观冲突检查，并非服务端原子比较更新。写成功但刷新失败时禁用再次写入，要求重新读取。关闭、配置切换、权限丢失和卸载使迟到请求失效，不恢复旧预览。

入口及权限位于 `Channels/index.vue`、`useChannelsPage.ts`、`views/system/MessageNotification/shared/catalog.ts` 和 `baseMenu.json`；独立 `bind` 按钮映射 `notifier/query`、`user/query`、`user-third-party-manager/query,save`，沿用服务端权限和资产边界。未保存、修改中、提交中或无权限时禁用对应入口。发布时必须让运行时通知服务加载更新的 `notify-wechat`，并同步新增按钮及角色授权。成员联系方式以企业微信实际返回为准，缺失时仍可手动对应；不新增用户、部门同步或回调服务，不迁移历史模板，不修改运营端 `ui/`。

验证（2026-11-11）：通知回归 131/131 通过；修正试发空白收件人校验和模板通用文案后，channels / wechat / integration 定向复跑 60/60 通过。模块 `vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 保持 213 项既有诊断，按文件、错误码与信息比较新增 0、移除 0，尚未全绿；修复既有错误后需重跑。模块构建通过（29.00 秒，保留已有构建告警），3 个变更 Vue 文件的定向样式检查、浏览器夹具语法检查和 `git diff --check` 通过；模块没有独立 lint 脚本；中英日各 356 个 messageNotification 键一致，最终文案 JSON 解析通过。测试覆盖唯一匹配、重复与冲突、分页、已有关系保护、修改解除、保存失败、权限和迟到响应，日志为 `/tmp/wechat-channel-tests-{stage,final}.log`、`/tmp/wechat-channel-types-{before,final}.log`、`/tmp/wechat-channel-build-final.log`。

隔离浏览器完成模板变量及确认试发、自动建议 / 手动保存、已有关系修改 / 解除、失败重试、无同步权限禁用、“清除配置”危险链接及确认反馈（hover 颜色由 rgb(255, 77, 79) 变为 rgb(255, 120, 117)）；1280px 桌面和 390px 窄屏抽屉可用，窄屏表格内部横向滚动可达操作列，浏览器错误日志为空。所有发送、绑定和配置清除仅操作测试夹具内存，真实服务商发送和完整角色权限矩阵仍待联调。截图为 `/tmp/wechat-members-desktop.jpg`、`/tmp/wechat-members-mobile.jpg`。

后端新增 `CorpUserContractTest` 覆盖实际 WebClient 联系方式反序列化、缺字段兼容和跨部门成员去重；定向测试及编译尚未执行成功：缺少 `org.jetlinks.pro:jetlinks-parent:2.20.0-SNAPSHOT`，私服返回 401。恢复 Maven 依赖访问后，在工作区根目录执行 `mvn -f modules/jetlinks-components/notify-component/notify-wechat/pom.xml -Dtest=CorpUserContractTest,WechatMessageTemplateTest,WechatNotifierProviderTest test`（包含编译），详细阻塞见 `/tmp/wechat-channel-backend-tests-online.log`。

### Webhook 渠道表单

`Channels/index.vue` 的 Webhook 渠道表单用于配置接收地址和 HTTP 请求头。保存成功后按本模块的[模板自动生成规则](#邮件钉钉与-webhook-随渠道创建消息模板)补齐模板。请求体的编辑和预览位于消息模板页，渠道表单已移除本地请求示例。

使用 `tests/messageNotificationBrowser/webhook.mjs` 验证新建和已有渠道的地址回显、请求头凭据保留、模板权限及 390px 布局。模板创建和请求体由 `tests/messageNotificationBrowser/channelTemplates.mjs` 验证。

### 已配置渠道回显与整表编辑

邮件服务商与 SMTP 选择（2026-11-13）：仅调整本模块邮件渠道表单。“常用邮箱”使用腾讯、阿里、网易、微软、其他五项 `a-segmented`，同品牌个人邮箱、企业邮箱和云邮件推送合并分组。前四组使用可搜索 SMTP 单选，选项与选中值显示“地址(产品 / 地域)”，括号及其中说明使用次级文字颜色；其他使用 `a-auto-complete`，候选沿用同样格式，仅含其余品牌并允许自定义输入。地址与说明均支持搜索。中英日的五项分段在 390px 下完整显示，不改变页面壳层。

实现提交：`e4f5623`（`feat(通知渠道): 按邮箱品牌选择 SMTP 服务地址`）。

选项排版复核：106/106 定向测试、5 组 SMTP 浏览器场景、定向样式检查与模块构建（25.54 秒）通过；内存夹具确认地址在前，括号及说明在下拉和选中值中均使用次级文字颜色，说明文字可搜索。中英日和 390px 验证通过，类型检查仍为 195 条既有诊断，归一化比较无新增或移除。验证产物前缀 `/tmp/notification-smtp-option-`。

`Channels/configuration/emailSmtpCatalog.ts` 集中维护 34 个公开地址：腾讯 6、阿里 15、网易 5、微软 4、其他 4；只记录 SMTP，不混入 POP / IMAP / MX。腾讯包括 QQ / Foxmail、企业邮及海外、SES 三个站点；阿里包括个人邮、企业邮通用 / 信创 / 香港 / 兼容及国际站、DirectMail 当前地域和仍支持的旧址；网易包括 163 / 126 / yeah、企业邮通用 / 杭州；微软包括 Exchange Online、世纪互联、Outlook.com、Azure Communication Services；其他为 Gmail、Yahoo、iCloud、飞书。网易 VIP 等尚未取得可靠参数的产品不猜测地址，仍可自定义输入。

目录依据：

- 腾讯：[企业邮客户端配置](https://kf.qq.com/faq/161223ume6vM161223uYJfQr.html)、[SES SMTP](https://cloud.tencent.cn/document/product/1288/65750)。
- 阿里：[个人邮箱](https://help.aliyun.com/zh/enterprise-email/user-guide/what-is-the-address-of-the-client-protocol-server-of-alibaba-mail-personal-edition)、[企业邮箱端口与地址](https://help.aliyun.com/zh/enterprise-email/user-guide/what-is-the-port-number-and-server-address-of-alibaba-mail)、[国际站点](https://www.alibabacloud.com/help/en/enterprise-email/user-guide/what-is-the-port-number-and-server-address-of-alibaba-mail)、[DirectMail](https://help.aliyun.com/zh/direct-mail/smtp-service-address-1)。DirectMail 原悉尼旧址按官方说明保留兼容，不当作新增地域。
- 网易：个人邮箱沿用官方客户端配置资料；企业邮杭州地址参考[西安工业大学信息技术中心的网易企业邮箱配置](https://nic.xatu.edu.cn/info/10403/192081.htm)。不把未经核验的 VIP 或海外地址补入目录。
- 微软：[世纪互联端点](https://learn.microsoft.com/en-us/microsoft-365/enterprise/urls-and-ip-address-ranges-21vianet?view=o365-worldwide)、[Outlook.com SMTP](https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040)。世纪互联使用专门端点文档中的 `smtp.partner.outlook.cn`，不采用部分旧客户端说明中的 `smtp.office365.cn`。

`Channels/configuration/useEmailSmtpSettings.ts` 管理品牌识别、候选筛选和连接参数联动，`Channels/useChannelConfiguration.ts` / `ChannelConfiguration.vue` 通过既有 `InlineEditForm` 自定义插槽接入。打开配置只识别品牌，不改写原始大小写、空白、端口或加密属性；切换品牌保留属于该品牌的地址，否则采用原有企业邮默认值。切换其他保留当前输入，但不将前四组地址加回候选。自定义输入只修改地址，即使输入已知品牌地址也保持“其他”编辑状态；明确选择候选才填入默认端口与加密方式。保存后依据实际地址回显品牌，分组不进入 payload；取消恢复已保存配置。禁用、只读和提交期间阻止联动写入。保留账号、密码、其他 SMTP 属性与既有加密切换对自定义端口的保护。

接口与边界：继续使用 `host`、`port`、`properties` 和既有整表创建 / 更新接口；不增加后端字段、不修改共享表单、运营端 `ui/` 或试发流程。三语提示说明 Outlook.com / Hotmail 要求 OAuth2，而当前表单不提供 OAuth2 授权；预设地址不代表新增认证能力或已验证实际投递。

验证：从模块目录执行 `node --test tests/messageNotificationChannels.test.mjs tests/messageNotificationContracts.test.mjs tests/messageNotificationTrial.test.mjs`，98/98 通过，覆盖多品牌 / 地域、语言资源、旧值回显、候选排除、自定义输入、参数联动、取消 / 保存 / 失败、凭据保留和锁定。既有 `tests/messageNotificationBrowser/smoke.mjs`（`SMOKE_CHANNELS_ONLY=1`）10 项与新增 `tests/messageNotificationBrowser/emailSmtp.mjs` 5 组浏览器断言通过，使用 `SMOKE_PLAYWRIGHT_MODULE="$PWD/../../../ui/node_modules/playwright"` 和本机 9200 服务；全部业务操作由内存夹具提供，无页面错误和真实业务请求。覆盖中英日、390px、明确选择和输入的差异、取消、保存失败后重试及保存后的品牌回显。

质量检查：从 `runtime-ui/` 执行 `node ../ui/scripts/check-ui-style.mjs --files modules/notify-manager-ui/views/system/MessageNotification/Channels/ChannelConfiguration.vue` 通过；三语 JSON / SMTP 文案键及 `git diff --check` 通过，修改的 Vue 文件低于 300 行。`./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 修改前后均为 195 条既有诊断，忽略行列比较无新增 / 移除；完整类型检查仍未通过，需修复基线后重跑。工作区无独立 lint 脚本。在 `runtime-ui/jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notification-smtp-build -- --module-name notify-manager-ui` 通过（21.43 秒），保留既有分块等构建告警。日志前缀 `/tmp/notification-smtp-`；浏览器报告及截图位于 `/tmp/notification-smtp-browser/` 与 `/tmp/notification-smtp-smoke/`。未保存真实配置或发送邮件，各供应商账号认证及实际投递仍需测试环境联调。

渠道表单精简：短信顶部“发送测试消息”保持原样；短信的“渠道测试”区和邮件的“SMTP 扩展属性”在新建、查看及编辑时均移除，已有配置值继续保留；邮件预设和加密方式仍通过内部 `properties` 联动。群机器人空配置先显示“添加”入口，点击后打开两字段弹窗；已有配置以紧凑列表逐行展示并支持新增，详见上方“群机器人弹窗与列表”。机器人更多菜单中的编辑按钮铺满菜单项宽度；普通渠道常驻编辑。实现范围为本模块的 `Channels/index.vue`、表单适配和 workspace，配套更新说明文案及现有内存夹具；验证字段可见性、历史值保留、群机器人新增/删除/草稿隔离、权限和窄屏菜单。

精简验证：渠道 / 试发 / 契约定向测试 90/90 通过，`smoke.mjs`（`SMOKE_CHANNELS_ONLY=1`）10 项和 `trials.mjs` 9 项通过。内存夹具覆盖新建/查看/编辑字段移除、短信凭据保存后原有试发正常、邮件加密联动、群机器人显式添加及清除后回到空态、权限限制、编辑按钮右侧空白点击和 390px 布局；无页面错误或真实配置写入。定向样式检查、三语资源键与 JSON、`git diff --check` 和生产构建通过（24.28 秒）；模块类型检查仍有 193 项既有诊断，无新增或移除，无独立 lint 脚本。验证命令沿用下方质量检查，日志及浏览器报告前缀为 `/tmp/notification-form-cleanup-`。

整表编辑：当前行为以上方“消息渠道图文说明与常驻编辑”为准。普通渠道使用 `InlineEditForm` 的 form 模式，直接修改并在左下角保存；机器人继续使用弹窗。`Channels/useChannelWorkspace.ts` 按配置保存草稿，`useChannelsPage.ts` 编排保存反馈及测试补全定位，表单适配负责元数据与输入类型。下列 2026-11-12 验证记录为原先显式编辑模式的历史结果。

菜单图标补充验证：定向样式检查、`git diff --check` 和生产构建通过（23.90 秒）；类型检查仍为 193 项既有诊断，无新增或移除，工作区无独立 lint 脚本。内存夹具核对 1440px / 390px 菜单图标、按钮可访问名称与布局通过，无页面错误或配置写入；报告为 `/tmp/notification-menu-icons-browser/report.json`。

整表编辑验证（2026-11-12）：模块目录执行 `node --test tests/messageNotificationChannels.test.mjs tests/messageNotificationTrial.test.mjs tests/messageNotificationContracts.test.mjs`，88/88 通过，覆盖只读渲染、整表提交、取消还原、失败/权限/提交锁定、跨配置草稿、SMTP 联动、动态字段和凭据保留。既有 `tests/messageNotificationBrowser/` 的 `smoke.mjs`（设置 `SMOKE_CHANNELS_ONLY=1`）、`trials.mjs`、`webhook.mjs`、`robotSigning.mjs` 均通过；八类渠道统一编辑/取消，中英日按钮、下拉和复合控件零自动写入、短信测试配置补全、左下角按钮、390px 布局、无更新权限及失败重试均已覆盖。浏览器使用 `SMOKE_PLAYWRIGHT_MODULE="$PWD/../../../ui/node_modules/playwright"` 和现有 9200 Vite 服务，接口均由内存夹具提供，无页面错误；未写入真实配置或发送真实通知。报告位于 `/tmp/notification-whole-edit-{browser,trials,webhook,robot}/report.json`。

质量检查：在 `runtime-ui/` 执行 `node ../ui/scripts/check-ui-style.mjs --files modules/notify-manager-ui/views/system/MessageNotification/Channels/index.vue modules/notify-manager-ui/views/system/MessageNotification/Channels/ChannelConfiguration.vue` 通过；两个 Vue 文件均低于 300 行，中英日 JSON 与模块 `git diff --check` 通过。`./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 前后均为 193 项既有诊断，忽略行列后新增 0、移除 0，完整类型检查仍待基线问题修复后重跑。工作区无独立 lint 脚本。在 `runtime-ui/jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notification-whole-edit-build -- --module-name notify-manager-ui` 通过（34.21 秒），保留既有构建警告。日志前缀 `/tmp/notification-whole-edit-`；真实服务商投递与完整账号权限矩阵仍需环境联调。


语音提示（当前已迁移到右侧文档）：`views/system/MessageNotification/Channels/useChannelConfiguration.ts` 通过 `InlineEditForm` 展示当前阿里云服务商及凭据字段，相关地域和 AccessKey 说明集中在右侧图文文档；`locales/lang/{zh,en,ja}.json` 同步调整语音简介及“服务商与 AccessKey”分组标题。保留地域选择，地域提示复用既有“阿里云服务地域。”译文；凭据保护、保存与接口契约保持不变。

语音提示验证（2026-11-11）：`node --test tests/messageNotificationChannels.test.mjs tests/messageNotificationContracts.test.mjs` 59/59 通过，模块构建通过（35.74 秒，保留既有构建告警），三语消息通知键一致且 `git diff --check` 通过。模块类型检查前后均为 213 项既有诊断，无新增或移除；待既有诊断修复后在 `runtime-ui/` 重跑 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`。工作区无独立 lint 脚本，本次未修改 Vue 模板或样式。9200 登录态已核对各项提示在对应字段下显示，未保存真实配置或发送通知。日志前缀 `/tmp/notification-voice-hints-`。

底部操作栏（2026-11-11 历史，当前常驻编辑底栏同样仅保留“保存”）：当时 `Channels/index.vue` 的新配置底栏仅保留左对齐的“保存”，移除“撤销修改”和底栏未保存提示；`useChannelsPage.ts` 清理仅用于旧底栏对齐的派生值。保存权限、校验、草稿与离开提醒保持原有行为。验证（2026-11-11）：渠道 / 契约回归 58/58、单文件样式门禁、模块构建（26.14 秒）和 `git diff --check` 通过；类型检查仍为上一轮相同的 213 项既有诊断，无新增或移除，待修复后重跑下方类型命令。工作区无独立 lint 脚本。9200 钉钉渠道页实测输入前后保存按钮均与表单左边缘对齐，“撤销修改”按钮数量为 0；测试输入已清空，未保存真实配置。日志前缀 `/tmp/notification-footer-`。

地域选择：`Channels/channelSchema.ts` 为阿里云语音和短信的 `regionId` 复用旧版 `views/notice/channel/hooks/noticeChannelModel.ts` 中的 28 个地域选项，经 `configuration/channelMetadata.ts` 和 `useChannelConfiguration.ts` 接入现有下拉编辑器及中英日翻译。后端仍返回字符串类型时也使用下拉列表，显示地域名称，保存字符串地域 ID；接口、必填规则及其他配置保持原有行为。

地域选择验证（2026-11-11）：`node --test tests/messageNotificationChannels.test.mjs tests/messageNotificationContracts.test.mjs` 58/58 通过，模块构建通过（29.74 秒，保留既有构建告警），三语地域键和 `git diff --check` 通过。模块类型检查前后均为 213 项既有诊断，无新增或移除；修复既有诊断后需在 `runtime-ui/` 重跑 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`。工作区无独立 lint 脚本，本次未修改 Vue 模板或样式。实际 9200 语音页下拉及中文选项已验证；隔离夹具中首次选择杭州并保存、已配置回显、改选北京自动保存均通过，页面无错误日志。未向真实后端保存凭据或发送通知，真实服务商连通性不在本次验证范围。日志前缀 `/tmp/notification-aliyun-region-`。

分组详情和整表保存覆盖动态后端目录中的全部提供商。公共表单为 `runtime-ui/jetlinks-web-core/src/components/InlineEditForm/`，通过 core 根入口或目录公开入口导出；API、事件、插槽和示例见组件 README。通知模块通过 `Channels/useChannelConfiguration.ts` / `ChannelConfiguration.vue` 映射业务元数据，`useChannelWorkspace.ts` 承载草稿、校验与提交，`useChannelsPage.ts` / `index.vue` 管理操作入口。

已有配置直接展示表单。`Channels/channelSchema.ts` 从当前配置详情初始化密码字段和 Webhook 请求头值。`Channels/ChannelConfiguration.vue` 和 `Channels/ConfigurationPairs.vue` 使用 Ant Design 密码框默认遮挡，有编辑权限时可点小眼睛查看。留空保留已知凭据，服务端仅返回掩码时需要重新输入。

回显验证（2026-11-19）在模块目录运行 `node --test tests/messageNotification*.test.mjs`，400 项通过。沿用上文的浏览器复验命令运行 `channelHelp.mjs`、`smoke.mjs`、`webhook.mjs`、`robotSigning.mjs`，共 31 组通过，覆盖多渠道回显、显隐切换、留空保存、权限撤销和机器人弹窗。本地企业微信配置已只读核对 Secret 回显。两个变更组件的定向样式检查和模块生产构建通过。工作区无独立 lint 脚本。模块 `vue-tsc` 前后均为同样的 195 条既有诊断，修复基线后按上文命令复验。

固有只读字段保持只读，短信“渠道测试”和邮件“SMTP 扩展属性”均不显示。本页不接入字段自动 submit，失焦、Enter、选择下拉及元数据控件完成事件均不保存。底栏仅提供保存；整表校验后仅调用一次既有创建或更新接口，成功仍保持表单，失败保留输入。已有配置无修改时禁用保存，提交期间锁定输入、重复保存和配置切换。群机器人继续由“添加 / 编辑”入口开启独立弹窗，在弹窗右下角添加 / 保存并支持取消。

非机器人渠道每个 `type/provider` 只提供一套配置入口：没有配置选择器和新增入口，已存在记录时 workspace 也禁止创建第二套。机器人由 `shared/catalog.ts` 的 `multipleConfigurations` 标记，动态目录继承该展示能力；当前后端机器人提供商为 `dingTalk:dingTalkRobotWebHook`，以多行列表及新增 / 编辑弹窗管理多套配置，保留自动重名编号和删除。未知提供商默认单套，不影响动态渠道或字段发现。历史重复数据不自动删除：默认进入后端第一条，仍兼容明确配置 ID 的原有跳转，防止已引用模板错绑。此限制作用于本页面，不新增后端唯一约束或执行历史数据迁移。

整表提交只包含当前配置的草稿，不夹带其他渠道的修改。单配置渠道切换时保留各自草稿及编辑状态；机器人弹窗关闭或被外部渠道 / 配置切换替换时丢弃对应草稿，离开页面仍沿用未保存提醒。保存成功后即使列表读取失败，也只重试读取，不重复写入；权限丢失后清理的配置不会被迟到响应恢复。密码与 HTTP 请求头保持掩码、空值保留及禁止提交掩码的规则；无法安全保留的凭据要求重新输入，校验涉及暂时隐藏的字段时展示表单级错误，避免无反馈。元数据新增字段和未编辑参数保留。状态显示“已配置”，不推断服务可用性；单配置渠道的名称与 ID 仅在内部继续用于保存和关联；机器人名称在列表和弹窗中展示，ID 继续仅用于内部关联。

配置信息移除验证（2026-11-11）：渠道测试 37/37、单文件定向样式检查、模块构建（24.34 秒）和 `git diff --check` 通过；模块类型检查保持 235 项既有诊断，无新增或移除，工作区无独立 lint 脚本。隔离浏览器确认邮件仅展示“邮箱服务商”“发件账号”，没有配置名称或 ID 区块，页面错误日志为空。日志前缀 `/tmp/notification-remove-config-information-`；未操作真实配置。

邮件品牌与 SMTP 候选按本节“邮件服务商与 SMTP 选择”维护：选择地址更新连接参数，手动输入保留原有参数，点击整表保存时才提交。加密切换仅联动原方式的标准端口，自定义端口和其他 SMTP 参数保留。说明在新建及已有配置均默认展开，并记住当前页面中各渠道的开关选择；字段聚焦联动相关步骤。宽屏左右排列，窄屏上下排列。

边界：企业微信成员对应及试发已按上节接入；未增加部门对应、出口 IP 查询、回调服务器或 Webhook 签名。企业微信 AgentId 由渠道提供，兼容历史模板；其他提供商的 AgentId、短信签名等仍归模板。未知提供商不跳转到不兼容模板，运营端 `ui/` 未修改。

验证（2026-11-11）：`node --test tests/messageNotification*.test.mjs` 106/106，通过单配置限制、历史 ID 兼容、机器人多套与自动命名、首次草稿、凭据保护和失败恢复回归；core `node --test tests/inlineEditForm.test.mjs` 8/8，包含复合控件焦点边界、失焦重试和卸载后的待执行失焦失效。core 独立严格类型检查通过；模块类型检查仍为 235 项既有诊断，新增 0、移除 0。3 个 Vue 文件定向样式门禁通过；工作区无独立 lint 脚本。模块构建通过（25.45 秒，保留既有 CSS 注释与大体积 chunk 告警），core 与模块 `git diff --check` 通过。最终日志前缀 `/tmp/notification-inline-followup-`。

历史浏览器验证（2026-11-11，单项编辑时期）：非机器人无选择 / 新增入口，字段失焦保存与失败后再次失焦重试，编辑区无保存 / 取消按钮；SMTP 属性内部切换保持编辑，离开后保存并可重新读回；机器人可创建第二套并自动编号。回显下拉文字与图标垂直中心偏差为 0，标签 / 提示浅于字段值。既有首次必填、未知提供商 false / 0 / 掩码、多配置 ID 跳转、说明联动及窄屏证据沿用前次未改变逻辑，并补充本轮 390px 回显核对：scrollWidth 为 390px、无配置选择器、下拉对齐保持一致，浏览器错误日志为空。`tests/messageNotificationBrowser/smoke.mjs` 已同步且语法检查通过，本轮未执行完整脚本，浏览器交互通过 CUA 完成。没有修改真实配置或发送通知；完整账号权限矩阵和真实服务商连通性未验证。

底部反馈调整验证（2026-11-11）：channels / contracts 测试 57/57、core 测试 8/8 及独立严格类型检查通过；模块类型检查仍为 235 项既有诊断，与上一轮归一化行号后对比无新增或移除。`InlineEditField.vue` 定向样式检查、模块构建（25.62 秒，保留既有告警）及两处仓库 `git diff --check` 通过；工作区无独立 lint 脚本。隔离夹具增加可选 `writeDelay`，CUA 实测保存中显示 Select 原生加载图标，失败后保留 STARTTLS 输入和控件红框、底部反馈节点为 0，再次失焦重试成功，页面错误日志为空。仅写入夹具内存，未修改真实配置或发送通知；未改动交互沿用上一轮验证，完整 smoke 脚本未重复运行。日志前缀 `/tmp/notification-inline-feedback-`，失败与加载截图为 `/tmp/notification-inline-feedback.png`、`/tmp/notification-inline-feedback-loading.png`。

### 全部后端渠道首次配置

历史多配置展示修复（当前新增与选择入口以本页上节单配置规则为准）：进入已有配置的渠道时默认打开后端列表第一条，之后优先恢复上次选择或新增草稿；带配置 ID 的跳转仍精确匹配，失效链接不自动展示其他记录。改动限定 `Channels/useChannelWorkspace.ts` 的初始选择与相关回归，保留手动切换、凭据保护和现有保存流程。2026-11-11 验证：channels / contracts 50/50 通过，覆盖默认选择、路由同步、选择记忆、草稿保留、失效链接及被删除的记忆记录；9200 真实登录态确认邮件两项配置均可回显，进入邮件自动选中第一条，密码空显且保存保持禁用，未写入配置或发送通知。模块 `vue-tsc` 前后均为 235 项既有诊断，新增 0、移除 0；模块构建通过（28.80 秒），`git diff --check` 通过。无独立 lint 脚本，本次未修改 Vue / CSS；浏览器 smoke 断言已同步并通过语法检查，本轮未执行完整脚本。日志 `/tmp/notification-config-selection-{tests,types-before,types-final,build}.log`。

2026-11-11 已修复首次配置误报失败：真实部署的 `ConfigMetadata.properties` 使用 `property/type`，页面此前只接受 `id/valueType`，导致 HTTP 200 被误判为失败。`api/notice/notificationConfigMetadata.ts` 在 API 边界统一转换字段及嵌套类型，保留约束、默认值、描述与旧结构兼容。已核对后端 `HttpWebHookNotifierProvider` 默认返回空元数据，仅对成功响应且元数据为空的 `webhook:http`，按真实 `HttpWebHookProperties` 补充 `url` 和 `headers`；未知提供商、错误响应及损坏结构仍显示失败。`configuration/channelMetadata.ts` 同时保护后端描述为字符串的已知凭据字段，包括微信服务号的 `secret`。

本次修复验证：模块测试 98/98 通过；加强真实响应结构与空元数据回归后，contracts / channels 49/49 通过。模块 `vue-tsc` 修改前后均为 235 项既有诊断，按文件与诊断内容对照新增 0、移除 0；模块构建通过（35.11 秒），保留既有构建告警。命令沿用下方测试、类型检查与构建入口，日志 `/tmp/notification-metadata-fix-{tests-final,focused-final,types-before,types-final,build-final}.log`。工作区无独立 lint 脚本；本次未修改 Vue / CSS，未重复样式门禁，`git diff --check` 通过。

真实页面只读验收：9200 登录态核对后端全部 8 个提供商（阿里云短信、钉钉机器人 / 工作通知、企业微信 / 微信服务号、Webhook、阿里云语音、邮件），首次配置表单均正常加载；邮件保留两项已有配置与新增入口，微信服务号凭据使用密码输入。未保存真实通知配置或发送通知。短信修复截图为 `/tmp/notification-metadata-fix-sms.png`；完整账号权限矩阵仍待环境验收。

目标与已确认边界：通知渠道页以 `/notifier/config/types`、`/notifier/config/type/{type}/providers` 及 `/notifier/config/{type}/{provider}/metadata` 为目录与配置字段来源，后端返回哪些可配置提供商就展示哪些。未配置时直接展示分组表单、渠道状态、默认展开的右侧配置说明与保存操作；标识和名称自动生成。机器人保留多配置，其他渠道采用单配置入口；保留权限、密钥、草稿保护，不新增后端能力，不调整模板 / 记录页业务流程。

实施入口：`views/system/MessageNotification/Channels/` 承载动态目录、元数据表单、首次草稿和专属说明；`api/notice/messageNotification.ts` 与类型提供现有接口的类型化封装；`shared/` 的目录、导航和凭据工具增加可注入的渠道上下文，其他页面保持兼容。渠道类型不再受六类字符串联合约束；既有七种定义只作为展示增强，未知类型 / 提供商由后端名称、字段和描述生成界面。中英日资源同步更新。

已实现：`useChannelCatalog.ts` 加载类型 / 提供商目录、批量配置快照与元数据，类型失败独立重试，配置查询失败不产生未配置状态。`configuration/channelMetadata.ts`、`channelSchema.ts` 与 `ChannelConfiguration.vue` 按元数据保留全部字段，既有渠道提供分组、凭据与校验增强；`configuration/ChannelHelp.vue` 提供常驻说明正文。`useChannelWorkspace.ts` 为每个新草稿生成一次 32 位随机标识，名称由渠道 / 提供商名称组成并在重名时追加序号；默认值不计脏，首次保存可触发校验。切换、重置和保存失败保留草稿身份；已成功写入但刷新失败时只重试读取，已有配置不自动改名。

兼容约束：邮件快捷填充与加密选项映射实际 SMTP 参数并保留扩展项；企业微信 AgentId 按上节增加渠道配置并保留历史模板回退，其他提供商的 AgentId、短信签名等不移入渠道配置。不生成原型中的演示 IP、回调地址或不受支持的参数。未知提供商的凭据依据元数据识别，保留已知渠道的凭据补充定义及 HTTP header 保护。仅对现有支持渠道提供模板跳转与试发。目录或配置查询失败不解释为未配置，单类型失败可独立重试。

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
| 通知渠道：选择并维护一项通知配置 | 15rem 渠道导航与右侧配置工作区共用一个连续面板；移除独立页面标题及左右卡片；配置选择器限制合理宽度，与新增等操作组成紧凑工具栏 | 机器人保留多配置选择；其他渠道直接展示单套配置；主页面表单常驻编辑并整表保存，右侧图文说明与表单等宽并按字段定位；机器人保留列表与弹窗 |
| 消息模板：查找模板并编辑、预览 | 当前布局以上方“系统通知模板原型对齐”为准：15rem 可折叠模板目录，右侧标题操作、渠道切换与效果预览；恢复默认 / 刷新收纳到更多菜单 | 默认查看，显式编辑；保留变量、附件、草稿与保存能力，长表单独立滚动，窄屏使用模板选择器 |
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

#### 旧菜单退役与个人中心入口统一

`baseMenu.json` 已移除 `/alarms/notify/template`、`/alarms/notify/delivery` 及因此为空的本模块 `alarm-center/Notify` 菜单贡献；其他模块的告警中心保持原有聚合。新入口统一为 `/system/notification/{channels,templates,records}`，旧页面源码保留。

- 接口：新旧渠道页共用 `/notifier/config/_query/no-paging`、`POST/PATCH /notifier/config` 以及提供商 / 元数据接口，读写同一批配置。旧页使用 `/notify/channel/providers` 订阅通道目录和内联模板试发，新页使用 `/notifier/config/types` 通知器类型及已有模板 ID 试发。
- 个人中心：当前已按上方“业务模板绑定与个人订阅联动”调整为模板管理入口，沿用原表头位置与布局。唯一业务携带真实记录 ID，多记录要求用户选择；模板页确认缺少发送配置后再进入 Channels。`/notify/channel/all` 仍决定个人可订阅渠道，渠道凭证保存不等于完成业务模板绑定或个人订阅。
- 其他入口：`authentication-manager-ui/visDashboard/Base/shared/navigation.ts`、`rule-engine-manager-ui/visDashboard/AlarmCenter/hooks/useAlarmQuickStart.ts`、core `src/hooks/useNotificationConfigNavigation.ts` 与 `jetlinks-ai-ui/views/visual-alarm-preview/components/VisualAlarmRuleDialog.vue` 已迁移到新菜单代码。按新菜单判断访问权限，保留原业务表单草稿、打开独立标签及返回刷新。
- 模板业务定位：`Templates/hooks/useTemplateBusinessNavigation.ts` 接收原 `topicProvider/channelProvider/aiAlarmType` 上下文，用业务目录的真实 `templateId` 读取实际提供商后进入新页；资产范围不唯一、缺少绑定、目录 / 模板查询失败不回退其他业务的首条模板。已有深链及各模板草稿保留；成功保存与原 AI 告警实际绑定的模板才发出原会话的跨标签刷新消息，失败或保存其他模板不回传。
- 边界：仅修改 `runtime-ui/`，未改后端或运营端，不删除通知器 / 模板 / 订阅数据。无业务模板绑定时明确提示“尚未绑定”；本次不实现上方完整内置模板方案中的首次业务创建 / 绑定能力。业务目录仍沿用 `/notify/channel/all-for-save` 的功能和资产授权，新菜单原有权限映射保持不变，真实角色可读性需部署联调。已初始化环境必须同步服务端菜单及角色授权并刷新登录态；本次未对服务端执行菜单初始化或授权写入。

验证（2026-11-11）：菜单 / 契约 / 渠道 / 模板、个人中心和相关业务入口定向回归 188/188 通过；新增浏览器导航回归 6 项通过，覆盖精确配置、阿里云语音、业务子模板、未绑定提示、失败重试及成功保存回传，页面异常与真实业务请求均为 0。AI 告警浏览器回归通过，覆盖新菜单导航、接收人草稿保留、权限切换、返回刷新及按会话隔离的保存通知；夹具已跟随当前接收人下拉交互更新。模板页定向样式门禁与各 owning repository 差异检查通过。完整运行时构建通过（3 分 10 秒），输出 `/tmp/notification-menu-build`；最后补充配置 ID 查询的加载 / 失败重试后，渠道回归 37/37、导航浏览器 6 项及最终通知模块构建（30.76 秒）再次通过，模块输出 `/tmp/notification-menu-module-build`。保留既有大 chunk、静态资源与 `User.vue` 分块循环依赖警告。模块类型检查前后均为 213 项既有诊断，core 前后均为 532 项，忽略行号后无新增或移除；工作区未配置独立 lint 脚本，不能记为全量 lint / 类型检查通过。真实后端及角色权限矩阵仍待部署验收。

在 `runtime-ui/` 复验本次入口的命令：

```sh
node --test modules/notify-manager-ui/tests/messageNotification{Contracts,Integration,Templates,Channels}.test.mjs jetlinks-web-core/src/views/account/center/{personalCenterFlows,notificationSettingsView}.test.mjs jetlinks-web-core/tests/notificationConfigNavigation.test.mjs modules/rule-engine-manager-ui/tests/{sceneNotificationFlow,alarmDashboard}.test.mjs modules/authentication-manager-ui/tests/saasWelcome.test.mjs modules/jetlinks-ai-ui/tests/jet11Notification.test.mjs
SMOKE_PLAYWRIGHT_MODULE=/Volumes/SSD/work/jetlinks/cloud.jetlinks/ui/node_modules/playwright node modules/notify-manager-ui/tests/messageNotificationBrowser/navigation.mjs
PLAYWRIGHT_MODULE=/Volumes/SSD/work/jetlinks/cloud.jetlinks/ui/node_modules/playwright JET11_NOTIFY_BRIDGE=/Volumes/SSD/work/jetlinks/cloud.jetlinks/runtime-ui/modules/notify-manager-ui/views/notice/template/hooks/visualAlarmTemplateBridge.ts node modules/jetlinks-ai-ui/tests/jet11Notification.browser.mjs
./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json
./node_modules/.bin/vue-tsc --noEmit --pretty false -p jetlinks-web-core/tsconfig.json
```

URL 简化：按用户要求，将本模块消息通知菜单组及三个子页的 URL 统一为 `/system/notification` 与 `/system/notification/{channels,templates,records}`；保持菜单 ID、路由代码和权限标识。验证：JSON 解析、四条路径映射、现有菜单 / 路由集成测试 10/10、`git diff --check` 通过；本次仅修改静态 URL 和文档，未重复 lint / 类型检查 / 构建。已初始化环境需同步菜单 URL 并刷新页面，本次不写入服务端菜单。

开发环境页面加载：运行中的 Vite 服务若在新增页面后仍缓存旧的 `import.meta.glob` 路由表，可能出现菜单可见但页面空白。应检查实际服务返回的本模块 `index.ts` 路由清单，并触发入口更新（在 `runtime-ui/` 下执行 `touch modules/notify-manager-ui/index.ts`）或重启 Vite 服务，再刷新浏览器。迁移时触发入口更新后，在 9200 登录态直接访问并刷新模板页和记录页均可渲染；记录页当前已接入全局查询。

目标与 owning module：用户已确认将通知渠道、消息模板、通知记录从 `ui/modules/authentication-manager-ui` 迁入运行时 `runtime-ui/modules/notify-manager-ui`。保留 `views/system/MessageNotification/` 路径、`contract-v1` 类型 / API 签名、真实 ID、路由与前端动作标识；新独立 `system/MessageNotification` 菜单组归属 `iot`，后端权限沿用已核实的 `notifier` / `template` 映射。

迁移时的范围之外：保留既有告警中心 `Notify`、`views/notice/template` / `channel`、订阅型接口及权限 / 资产配置；保留目标已有未提交文件。历史 HTTP 查询在迁移阶段暂缓，现已按“通知记录全局查询”接入；不修改 core / 后端，不启动或停止用户服务，不执行真实菜单初始化、授权或通知发送。源目录只在目标集成验收后移除本轮新增内容，不恢复或覆盖其他改动。

实施顺序：A 核对目标 core 后复制 shared / API 并冻结公共边界；A / B / C 分别迁移渠道 / 模板 / 记录，全部请求、状态编排和副作用抽入 hook / service，组件负责渲染与事件委托。A 保留目标模块注册并统一整合菜单、三语 `messageNotification.*` 文案和本节；主代理完成集成、类型基线对照及构建验收后再清理源内容。组件最多五层、单文件不超过 300 行，优先使用本地 core 能力。

验证：复跑公共契约、渠道 / 模板 / 记录与实际模块装配集成；确认新菜单初始化资源筛选、旧菜单完整树和旧注册不变；检查三语键、core 组件属性、草稿 / 密钥 / 附件 / 预览 / 抽屉交互与窄屏滚动。执行定向样式门禁、目标模块类型检查并对照迁移前诊断、模块构建和必要聚合构建。现有类型错误与新增问题分开记录，环境联调和历史查询接入限制完成后回填本节。

当前状态：公共基础与三页已迁入目标，菜单 / 三语 / 模块入口已整合；源模块迁移时新增代码、菜单、语言键及文档已清理，只保留其原有改动。迁移验收见下文历史记录；当前历史全局查询已接入并完成真实页面只读验证，类型检查与完整权限矩阵的限制见对应验证段。

| 页面 | 目标入口与 core 复用 | 已实现范围 |
| --- | --- | --- |
| 通知渠道 | `views/system/MessageNotification/Channels/`；`EqualHeightColumns`、`InlineEditForm`、`StatusPill`、`JlDrawerShell` | 真实配置查询 / 选择 / 新增 / 编辑 / 保存 / 清除，非机器人单套回显、机器人多套切换；邮件及企业微信已有模板试发、企业微信成员预览匹配与绑定维护；渠道导航、草稿隔离、失败恢复与离开提醒 |
| 消息模板 | `views/system/MessageNotification/Templates/`；`SwitchGroup`、`FileUpload`、`StickyActionBar` | 实际模板目录及记录查询 / 新增 / 编辑 / 保存；一次保存一个 ID；变量光标插入、明确的示例预览及真实附件引用 |
| 通知记录 | `views/system/MessageNotification/Records/`；`ConditionFilter`、`j-pro-table`、`TableActions`、`JlDrawerShell` | 全局历史查询、分状态 SSE 聚合、真实字段与条件 / 状态 / 分页、内容详情 / 对应配置与模板跳转、跨页选择及 CSV 导出；保留请求取消、竞争保护与隔离测试注入 |

`index.ts` 保留目标模块原有 `register`、异步路由 glob 和其他导出；三页现通过空的 `getContentPanelOverrides` 使用平台默认面板，页面内部不重复套面板。页面路由代码维持 `system/MessageNotification/{Channels,Templates,Records}`，URL 为 `/system/notification/{channels,templates,records}`；`baseMenu.ts` 仍统一添加 `runtime: true` 与 `options.appName: 'notify-manager'`。新增菜单贡献通过 core 真实 `getModulesMenu` 和 `init-home/data#mergeTrees` 合入既有 `system` 父路径。新组与三页归属 `iot`；初次迁移时保留的 `alarm-center/Notify` 子树现已按上方“旧菜单退役与个人中心入口统一”移除。

运行时约束已落实：渠道页面编排由 `useChannelsPage` 承载，配置字段、键值编辑和抽屉焦点分别在 `useChannelConfiguration`、`useConfigurationPairs`、`useChannelSendDrawer`；模板 / 记录同样将请求、路由、状态与副作用放入各页 hook / service。组件只声明视图、props 和事件委托，复杂视图状态合并为局部 model；无新增超过 300 行的 Vue 文件，组件层级不超过五层。`EqualHeightColumns` 使用 15rem 左栏、1fr 右栏和组件默认间距，平台 `ContentPanel` 内通过 flex 与 `min-height:0` 管理独立滚动，窄屏使用选择器。

公共边界位于 `api/notice/messageNotification{Types,State,}.ts` 与 `views/system/MessageNotification/shared/`，与迁移源 `contract-v1` 签名一致。渠道 catalog 统一七个已核实类型 / provider，未知提供商不借用其他编辑器；配置 / 模板使用实际 ID，不建立七类业务模板持久化关系。配置使用 `/notifier/config/**`，模板使用 `/notifier/template/**`，试发使用 `/notifier/{configId}/{templateId}/_send`。mutation 返回 unknown，成功后以已知 ID 刷新，不猜测返回的新 ID。

公共消费入口：`messageNotificationTypes.ts` 定义配置、模板、历史记录、分页、查询、邮件参数 / 附件 / 变量；`messageNotification.ts#messageNotificationApi` 提供 `queryConfigs/getConfig/createConfig/updateConfig/deleteConfig`、`queryTemplates/getTemplate/getSendTemplate/createTemplate/updateTemplate/deleteTemplate`、`queryHistory(query, signal)`、`countHistory(filter, signal)` 与 `send(configId, templateId, variables)`。查询校验并归一化分页，写入方法仅在响应 success 后更新已保存状态，历史聚合单独解析已核实的 SSE 响应；401/403 单独归为无权限，网络或格式失败不冒充空结果。`shared/index.ts` 统一导出 catalog、导航、密钥适配、状态与配置刷新事件，禁止页面自行维护另一份渠道或 ID 映射。

共享导航键为 `channel/configId/templateId/state`，路由保留查询与选择。编辑草稿和密钥只留在页面内存。密码与 Webhook 请求头的回显及保留规则见[已配置渠道回显与整表编辑](#已配置渠道回显与整表编辑)。保存失败保留输入，已成功保存但刷新失败不重复新增；刷新事件只携带白名单 ID / 渠道 / 动作，不带凭据。试发支持邮件和企业微信参数，要求实际兼容模板、所需变量 / 接收人及邮件附件参数、权限和显式确认，发送期间固定上下文。

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

业务模板绑定现已按上节落地；仍暂缓：完整业务默认内容 / 恢复默认、站内信模板、部门对应、未知提供商试发、邮件和企业微信之外的渠道试发、历史重试、30 天保留、出口 IP 与回调参数来源。

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

旧 `notice/template` 单通道查询需要 `notify-channel:query` 与 `template:query`。新消息模板菜单 `system/MessageNotification/Templates` 的新增 / 编辑动作映射 `notify-channel:query/save`、`template:query/save` 与 `notifier:query`；查询动作只保留独立模板和通知器查询，不授予保存权限，也不请求 `/all-for-save`。业务绑定与只读路径见上方“业务入口与个人订阅联动”。既有环境需同步菜单、更新角色授权并刷新登录态后再验收；静态配置修改不会更新已登录账号权限。

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
