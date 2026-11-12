# notify-manager-ui

运行时消息通知模块，承接通知渠道、消息模板与通知记录。

- 菜单入口：`/system/notification/{channels,templates,records}`
- 页面入口：`views/system/MessageNotification/{Channels,Templates,Records}/index.vue`
- 接口封装：`api/notice/messageNotification.ts`；旧页面及 `api/notice-center.ts` 保留兼容使用
- 后端接口：`/notifier/config/**`、`/notifier/template/**`、`/notify/channel/**`、`/notify/history/**`、`/notifier/**`

## 微信服务号配置说明

`views/system/MessageNotification/Channels/` 的微信服务号配置页仅展示服务端配置字段，已移除渠道测试入口、测试模板和样例参数设置；沿用现有配置表单与说明面板，中英日说明同步。参考线上 `https://doc.jetlinks.cn/` 的微信服务号配置说明（`doc.WeixinApp.707693-*`），介绍 AppID、AppSecret 以及“微信公众平台 → 设置与开发 → 基本配置”的获取路径。保留已有配置值、业务消息模板和其他渠道能力，服务号调整不改变后端接口或配置数据；统一试发沿用既有发送接口，并移除渠道试发按钮对业务模板查询权限的依赖。

实现入口：`Channels/testing/channelTestConfig.ts` 不再为服务号注入测试字段，`channelTestAdapter.ts` 移除服务号试发适配；`useChannelsPage.ts` 和 `index.vue` 按适配器能力显示试发入口。`configuration/channelHelp.ts` 定义服务号专属指引，并将 AppId / AppSecret 编辑定位到对应步骤；三语资源位于 `locales/lang/{zh,en,ja}.json`。历史 `configuration.testTemplate` 保留在保存数据中，不参与服务号配置校验，不影响业务模板。

验证（2026-11-12，以下命令从 `runtime-ui/` 执行）：`node --test modules/notify-manager-ui/tests/messageNotificationChannels.test.mjs modules/notify-manager-ui/tests/messageNotificationTrial.test.mjs` 58/58 通过；`SMOKE_PLAYWRIGHT_MODULE="$PWD/../ui/node_modules/playwright" SMOKE_OUTPUT=/tmp/weixin-official-browser node modules/notify-manager-ui/tests/messageNotificationBrowser/trials.mjs` 通过，覆盖三语、390px 窄屏隐藏测试入口及参数、说明展示、其他七类渠道试发，以及历史参数保留的单元回归。浏览器使用内存夹具，页面错误和业务网络请求均为空；截图与报告位于 `/tmp/weixin-official-browser/`。

`node ../ui/scripts/check-ui-style.mjs --files modules/notify-manager-ui/views/system/MessageNotification/Channels/index.vue` 与模块 `git diff --check` 通过；在 `jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/weixin-official-build -- --module-name notify-manager-ui` 通过（30.60 秒），保留既有构建警告。`./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 改动前后均为 213 项既有诊断，忽略行列后新增 0、移除 0；完整类型检查尚未通过，既有问题修复后重跑。工作区无独立 lint 脚本；日志前缀 `/tmp/weixin-official-`。真实账号保存与服务号业务消息投递未验证，未发送真实消息。

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

## 通知渠道统一试发

阿里云语音页不提供渠道测试分组、测试模板 / 样例参数或顶部试发入口。`Channels/testing/channelTestConfig.ts`、`channelTestAdapter.ts` 不注册 `voice:aliyun` 测试能力，`ChannelTestSettings.vue` 与 `useChannelTestSettings.ts` 已清理语音专用编辑逻辑；`locales/lang/{zh,en,ja}.json` 同步移除简介中的试发说明。沿用当前配置表单，保留地域、AccessKey 凭据、历史保存值及业务消息模板；后端接口与其他渠道行为不变。

语音入口移除验证（2026-11-12）：模块内运行 `node --test tests/messageNotificationChannels.test.mjs tests/messageNotificationTrial.test.mjs`，57/57 通过；定向样式门禁和 `git diff --check` 通过，工作区无独立 lint 脚本。从 `jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notification-voice-remove-final-build -- --module-name notify-manager-ui`，构建通过（29.74 秒，保留既有构建告警）。在 `runtime-ui/` 执行 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`，修改前后均为 213 项既有诊断，无新增或移除；修复既有问题后需重跑。构建后仅删除三语简介中的试发提示，JSON 解析与实际 i18n 加载检查通过。

浏览器使用隔离内存夹具：模块内执行 `SMOKE_PLAYWRIGHT_MODULE="$PWD/../../../ui/node_modules/playwright" node tests/messageNotificationBrowser/trials.mjs`，完整回归通过，覆盖六类支持渠道、语音和服务号隐藏入口、历史值保留、短信参数保存、三语及 390px 窄屏。简介调整后以 `TRIAL_SETTINGS_ONLY=1` 复验相关页面通过，页面错误与业务网络请求均为空；日志前缀 `/tmp/notification-voice-remove-final-`，最终截图与报告位于 `/tmp/notification-voice-remove-copy-browser/`。未修改真实配置或发送通知，真实后端投递不在本次验证范围。

统一入口为 `Channels/testing/ChannelTestModal.vue` 与 `useChannelTest.ts`。邮件、钉钉工作通知 / 群机器人、企业微信、阿里云短信、Webhook 共用「发一条测试 · 渠道名称」弹窗、发送锁定、失败重试及结果反馈。渠道更多菜单依次提供编辑和清除配置，独立模板页面及其内置邮件内容继续保留。

- 默认发给自己，可选择其他单个接收人；校验邮箱、手机或渠道成员 ID / OpenID，禁止列表和广播目标。本人邮箱沿用主邮箱身份、首个邮箱身份、资料邮箱的优先级；手机读取账号资料；第三方绑定必须同时匹配 `type_provider` 与当前通知器 ID。加载失败支持重试，与确实未绑定分开显示。群机器人 / Webhook 直接使用当前配置的群 / 地址。
- 邮件、钉钉、企业微信、机器人和 Webhook 使用固定测试消息，系统名称读取 `useSystemStore().layout.title`。短信只读渠道中保存的服务商测试模板和样例参数，提示实际内容以服务商模板为准。
- `channelTestAdapter.ts` 集中管理六类提供商的配置条件、接收人规则及内联参数。发送仅调用 `POST /notifier/{configId}/_send`，参数为 `{ template, context }`，不查询或写入业务模板；Webhook 页面的业务模板导航保持独立。阿里云语音、微信服务号及未支持的提供商不显示渠道试发入口。
- 只允许已保存、无未保存修改且具有渠道查询 / 发送权限的配置试发。弹窗使用保存值的快照；发送期间锁定重复操作，失败保留输入。关闭、配置切换、保存值刷新、权限变化或组件卸载后忽略过期响应。缺配置时等待测试弹窗关闭，再进入整表编辑并联动对应帮助步骤。成功仅表示「已提交，请检查接收端」。

短信配置页不再展示或编辑“渠道测试”区域；已有 `configuration.testTemplate` 继续原样保留。顶部“发送测试消息”的入口、参数读取及发送逻辑保持不变，试发弹窗不编辑配置、不选择业务模板、不输入 JSON。

| 提供商 | 保存路径与字段 |
| --- | --- |
| 钉钉工作通知 / 企业微信 | `configuration.agentId`；企微复用已有字段，钉钉补充同名字段，试发显式传入内联模板 |
| 阿里云短信 | `configuration.testTemplate`：`signName`、`code`、`parameters` |

`parameters` 为 `{ name, value }[]`；无变量时可省略或为空数组，有变量时名称唯一、值非空，禁止覆盖接收人或路由字段。旧配置可以缺少这些设置，仍可读取和编辑；缺少试发条件时禁用发送并列出缺项。测试设置不改变业务模板规则或历史模板数据，无后端接口 / 数据库变更。仅修改 `runtime-ui/modules/notify-manager-ui`，保留工作区既有变更，不修改运营端 `ui/`。

验证（2026-11-11，以下命令除构建外从 `runtime-ui/` 执行）：

- `node --test modules/notify-manager-ui/tests/messageNotification*.test.mjs`：当前工作区 **178/178 通过**。覆盖八类提供商参数、单接收人限制、内联模板与业务模板隔离、账号与绑定接口、缺配置、失败重试、重复发送、保存快照、权限变化和迟到响应；日志 `/tmp/channel-unified-tests-final.log`。
- `SMOKE_PLAYWRIGHT_MODULE="$PWD/../ui/node_modules/playwright" node modules/notify-manager-ui/tests/messageNotificationBrowser/trials.mjs`：通过。逐渠道检查统一弹窗、更多菜单无“管理模板”、无模板查询权限仍可试发；覆盖邮箱 / 手机 / 绑定的未绑定及加载失败、接收人校验、发送中锁定、失败保留、配置切换与权限失效、缺配置跳转、保存失败重试、AgentId / 三类服务商设置保存回显、中英日及 390px 窄屏。夹具只操作内存，业务网络请求被拦截；报告无页面错误、无实际业务请求，见 `/tmp/channel-unified-browser/report.json`。测试夹具屏蔽 Vite 热更新 WebSocket，避免工作区并行构建重载页面。
- `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`：改动前后均 **213 条既有诊断**，按文件 / 错误码 / 消息忽略行号比较，新增 0、移除 0。完整类型检查尚未通过；日志 `/tmp/channel-unified-types-{before,final}.log`，对比 `/tmp/channel-unified-type-comparison.json`。既有问题修复后重跑此命令。
- 在 `runtime-ui/jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/channel-unified-build -- --module-name notify-manager-ui`：通过（20.91 秒）。保留既有 CSS、chunk 大小、混合导入、构建配置及浏览器映射数据告警；日志 `/tmp/channel-unified-build.log`。
- 工作区未提供独立 lint 脚本。四个变更 Vue 文件通过 `node ../ui/scripts/check-ui-style.mjs --files ...` 定向样式检查；SFC 编译包含在上述测试中，中英日试发资源各 45 个键且集合相同，`git diff --check` 通过。

桌面与窄屏效果分别保存于 `/Users/chris/.codex/visualizations/2026/11/11/01a1caf2-46b7-7033-8c9d-72f5c997225a/notification-channel-test.png`、同目录 `notification-channel-test-mobile.png`。未发送真实消息，实际 SMTP / 服务商投递与真实账号授权仍需使用测试账号联调；接口受理不代表实际送达。

## 邮件内置模板与清除反馈

邮件试发已由上节统一方案替代；本节保留模板编辑页内置内容和清除反馈的规则及历史验证依据。
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

### 业务节点联动与模板预览

截图样式已对齐用户提供的邮件、钉钉、企业微信、语音、短信、Webhook 共 12 张查看 / 编辑截图。六类渠道分别由 `components/channels/` 下的独立编辑、预览组件承载；编辑区采用内容表单、可用变量、实时预览三栏，复用 `TemplateVariablePanel.vue` 和 `TemplatePhoneFrame.vue`，按工作区实际宽度收为两栏或单栏。顶部 `TemplateChannelNavigation.vue` 将钉钉、企业微信按大类组织，子项仍使用后端真实 provider。动态目录、权限、草稿与保存契约沿用下文约定。

消息模板入口为 `views/system/MessageNotification/Templates/index.vue`，owning module 为 `runtime-ui/modules/notify-manager-ui`。页面沿用左侧 `TemplateDirectory.vue` 的树结构、样式、搜索和展开规则，所有非文件夹业务节点均可选择，包括尚未绑定模板的业务；首次进入默认选择树中的首个业务，显式业务 / templateId 深链优先。设备告警和告警解除仍是独立业务及模板，展示层保持父子排列。

右侧以当前业务与渠道为上下文，优先展示已保存模板；确实未配置时使用原型 `shared/notify.js` 的默认文案，按后端真实变量适配。原型未覆盖的业务或提供商保留入口，显示未配置并允许按实际字段编辑。邮件使用单封邮件卡及附件列表，钉钉 / 微信使用手机消息卡片，语音使用来电界面及播报原文，短信使用手机气泡及字数，Webhook 使用 HTTP 请求卡及请求体，其他提供商展示字段摘要。编辑与预览实时联动；变量点击插入当前光标位置，预览样例不进入保存值，不执行模板中的 HTML。

钉钉工作通知、企业微信的标题 / 正文表单由真实 `message` 的首行 / 余文适配，保存仍合回原字段，进入编辑不改动原值。短信保留真实服务商模板编号、签名远程选择和只读审核原文；短信 / 语音的变量对应表仅展示现有引用，实际发送参数仍由业务 `channel.channelConfiguration.variables` 提供，不新增后端未支持的变量映射字段。Webhook 保留 `contextAsBody` 模式，历史对象请求体的文本读取与变量插入统一使用格式化 JSON，进入编辑不改写原数据；请求地址预览隐藏账号、查询参数和片段，不展示虚构签名头。截图中的站内信、服务商演示参数和后端不可用变量不新增为业务能力。

#### 实现入口与接口

- `templateDirectoryModel.ts`、`hooks/useTemplateDirectory.ts`、`hooks/useTemplatePage.ts`：业务选择、默认选择、路由、查看 / 编辑状态和操作编排。
- `useTemplateWorkspace.ts`、`workspace/`：按业务及渠道隔离草稿、真实读写、保存身份迁移、迟到响应隔离；`hooks/useTemplateCatalog.ts`：动态目录、模板字段及精确提供商配置。
- `definition/`：原型默认文案、真实变量及独立预览样例；`components/TemplateEditor.vue`、`hooks/useTemplateProviderEditor.ts` 复用旧 `views/notice/template/` 的真实供应商字段与远程选项；`TemplatePreview.vue` 分发渠道预览。`hooks/useTemplateMessageEditor.ts` 适配消息首行 / 正文及光标插入；`hooks/useTemplateVariablePanel.ts` 提供通用 / 当前业务变量和展示样例。
- 渠道由 `GET /notifier/config/types`、`GET /notifier/config/type/{type}/providers` 查询，模板字段来自 `GET /notifier/template/{type}/{provider}/config/metadata`；合法空元数据不视为不支持。目录部分失败保留成功的渠道并提供重试，配置查询失败不解释为未配置。
- 业务目录继续使用 `GET /notify/channel/all-for-save`；已有主题通过 `GET /notify/channel/{实际主题id}/{channelProvider}/_query-with-template` 与 `PUT .../_save-with-template` 读写 `{ channel, template }`。未绑定的独立 templateId 深链兼容原模板 CRUD，不自动绑定业务。

#### 业务入口与个人订阅联动

- `hooks/useTemplateBusinessNavigation.ts` 同时识别 `business`、`topicProvider`、`channelProvider` 与 AI 告警会话参数，优先按实际记录 ID 定位。相同业务代码对应多个资产范围时要求选择具体记录；业务缺失、无权或绑定丢失不回退到其他模板。渠道入口的 `businessSelection=first-alarm` 只在首次落地使用，随后固定实际告警身份。
- 模板保存与业务启停分离。首次保存可创建停用业务；“启用业务 / 停用业务”继续显式调用 `/notify/channel/{业务标识或实际ID}/enable`、`disable`。启用占位业务后刷新目录并采用唯一的真实记录 ID，保留编辑草稿。编辑时可单独调整渠道状态，取消恢复原状态；订阅人关系变量、渠道授权与兄弟绑定继续保留。
- 历史独立模板可作为当前业务的内容来源，`useTemplateWorkspace.ts#importTemplate` 保留当前托管目标 ID，不覆盖历史源记录。新建独立邮件仍可选择 `shared/builtinEmailTemplates.ts` 中的内置内容，预览样例和 `builtinKey` 不进入保存载荷。
- 只读账号可以查询独立模板，但不请求要求保存权限的 `/notify/channel/all-for-save`。个人中心沿用 `/notify/channel/all` 与个人订阅接口判断可用性，表头“去配置”按真实业务记录导航；模板菜单新增 / 编辑动作保留 `notify-channel:query/save` 映射。部署后需要同步菜单并刷新角色登录态。
- 缺少发送配置时通过 core 的 `useNotificationConfigNavigation` 在独立标签打开渠道配置，返回后只刷新配置候选并保留模板草稿。原 AI 告警会话仅在对应业务模板保存成功后收到回传；独立模板保存不会触发该回传。

#### 保存与草稿约定

只保存当前业务、当前渠道。切换渠道保留各渠道草稿；切换业务或离页时有修改则确认放弃或继续编辑。取消编辑只还原当前渠道；恢复默认只替换当前草稿，保存后生效，取消保留原配置。保存及上传期间阻止渠道 / 业务路由切换，保存失败保留输入。无配置仍可查看和编辑，保存须选择可读且 type/provider 精确匹配的真实配置。

业务目录 `id == null` 时，首次保存复用 `PUT /notify/channel/{业务provider}/_save-with-templates`，只发送当前一项 `{channel, template}`，主题保持 `disabled`，不传伪造主题 ID，不调用 enable。成功后接收实际 `provider.id`，后续改用单渠道接口；保留渠道 state、grant、接收人变量及其他渠道绑定。钉钉企业消息与机器人共用后端 `notifier-dingTalk`，保存另一提供商会替换该绑定。

受控资产下首次创建不按业务代码幂等；超时、网关错误或成功但未返回有效身份时，结果视为未知并锁住重复保存，必须刷新目录核对后再操作。并发首次创建及资产 Scope 仍受既有服务端能力限制。业务不存在 / 无权、配置不可读、绑定模板丢失和确实未配置分别反馈，不将失败降为默认内容。业务目录仍受现有 `/all-for-save` 权限约束，后端权限扩展不在本次范围。

本轮只改运行时前端、必要 API 封装、默认定义、三语、测试及本 README；不改左树视觉与层级，不改后端、菜单或 `ui/`，不自动启用业务，不发送真实通知。原型 `file://` 被浏览器安全策略拦截，文案与交互依据 HTML 及 `shared/notify.js` 静态核对；实际应用使用 9200 页面与隔离内存夹具验证。

#### 验证

合并验证（2026-11-12）：通知模块测试 268/268 通过，补充内置邮件预览断言后模板测试 49/49 通过；20 个 Vue 文件的样式检查通过，模块构建通过（22.80 秒）。类型检查仍为 213 项既有诊断，按文件、错误码和消息对比无新增。渠道试发浏览器回归通过，语音与服务号测试入口保持隐藏；其余浏览器场景未完整重跑，真实部署写入及供应商投递仍待联调。验证日志位于 `/tmp/notify-merge-20261112/`。

在 `runtime-ui/` 运行 `node --test modules/notify-manager-ui/tests/messageNotification*.test.mjs`；类型检查为 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`。在 `runtime-ui/jetlinks-web-core/` 运行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/system-notification-template-visual-build -- --module-name notify-manager-ui`。工作区无独立 lint 脚本，使用 `node ../ui/scripts/check-ui-style.mjs --files` 检查变更 Vue 文件，并执行 `git diff --check`。

验证结果（2026-11-11）：全部 `messageNotification*.test.mjs` 测试 **207/207 通过**，覆盖动态目录、默认业务、业务 / 渠道草稿、六类渠道组件、真实字段适配、变量光标插入与安全预览、Webhook 对象 / 字符串请求体插入、单渠道保存、首次 disabled 创建和实际 ID 回写、配置深链、默认恢复、读取 / 保存失败、超时重复保存锁、权限及迟到响应。模块最终构建通过（1 分 4 秒），保留既有 CSS / 分块告警；22 个 Vue 文件定向样式门禁、SFC 编译及 `git diff --check` 通过。中英日各 807 个键一致，其中 `messageNotification.*` 各 424 个。模块 `vue-tsc` 仍为 211 条既有诊断，相比业务模板联动版本按文件 / 错误码 / 消息忽略行号后新增 0、移除 0，不能视为类型检查通过；既有诊断修复后重跑本节命令。当前日志前缀 `/tmp/notification-template-visual-`，业务保存契约的前次证据为 `/tmp/notification-template-business-`。

浏览器通过隔离内存夹具验证首业务、无模板业务、告警解除、各已知渠道预览、后端新增提供商的元数据编辑与预览、变量插入实时渲染、渠道草稿保留、业务切换确认、仅取消当前草稿、首次保存、恢复默认及取消、无配置提示、读取失败与重试。本次追加六类渠道查看 / 编辑外观、钉钉标题光标插入与实时手机预览、短信审核原文只读和 Webhook JSON 两态核对；1280px 视口下页面 `clientWidth/scrollWidth` 均为 1280px，编辑工作区无横向溢出。实际 9200 登录页已完成 templateId 深链及后端动态提供商只读回显核查，未保存真实配置或发送通知。当前效果截图为 `/Users/fuhao/.codex/visualizations/2026/11/11/01a1caae-7901-7753-a763-5ff87ae35585/notification-template-channel-styles.jpg`。本轮不认定 390px 窄屏视觉验收通过。真实后端写入、资产作用域、完整权限矩阵及供应商远程选项仍需测试环境联调。

## 消息通知三页迁移（contract-v1）

### 消息模板目录

`views/system/MessageNotification/Templates/components/TemplateDirectory.vue` 直接使用 Ant Design Vue `a-tree`，以现有业务目录的 `type.id/name` 显示灰色分组标题、普通业务行和缩进子级，选中项沿用浅蓝圆角背景与主题色文字。设备告警和告警解除依据已有 provider 标识作原型中的展示层嵌套，仍使用各自 `channelConfiguration.templateId` 关联当前渠道独立模板；不按名称猜测绑定，不合并父子模板或草稿。目录只展示业务类型及其真实绑定；未绑定业务的模板不生成“其他模板”分组或独立节点，已有 templateId 深链仍可访问原模板。当前渠道没有绑定的业务仍可选择，按上节约定展示默认或未配置，不选择其他业务模板代替。

`templateDirectoryModel.ts` 负责真实分组 / 绑定与搜索保留父链；`hooks/useTemplateDirectory.ts` 管理展开、搜索和选中。分组默认展开，设备告警可展开 / 收起；搜索子项自动展开祖先，清空搜索保留原展开状态，显式选中子模板时展开其父级。`hooks/useTemplateBusinessDirectory.ts` 通过 `messageNotificationApi.queryTemplateDirectory` 读取已有 `GET /notify/channel/all-for-save`，具备刷新、权限和卸载后的迟到响应保护；目录读取失败显示可重试提示；左侧不回退拼接独立模板，已通过深链打开的模板仍可操作。业务模板读写使用上节的业务单渠道 / 首次聚合接口；未绑定独立模板深链继续沿用 `/notifier/template` 接口。


### 通知记录全局查询

数量展示调整：`Records/useRecordsPage.ts` 将全部与各状态的数量缺省值统一为 0，`Records/index.vue` 已移除统计失败重试入口及对应三语文案，沿用统计请求与列表反馈。验证（2026-11-11）：records / integration 测试 28/28、单文件定向样式门禁及模块构建（25.49 秒）通过；模块 `vue-tsc` 仍有 235 项既有诊断，对比前次验证新增 0、移除 0，既有问题修复后需重跑。模块没有独立 lint 脚本，`git diff --check` 通过，中英日各 305 个消息通知键一致。命令沿用下方验证段，当前日志为 `/tmp/notification-records-count-display-{tests,types,build}.log`。

已对齐原型中现有后端可支持的记录交互，owning module 为 `runtime-ui/modules/notify-manager-ui`。默认进入发送失败；重复点击当前状态切换为全部，显式 `state=all` 在刷新后保持。沿用 ConditionFilter、SwitchGroup、j-pro-table 与产品列表样式，增加业务类型、渠道图标、失败原因、跨页勾选 / 清除和“导出已选” CSV。发送内容在列表中保持单行，超出列宽显示省略号，悬浮保留全文；省略样式直接作用于内容按钮内的文本节点，沿用点击与键盘打开详情。本次展示修复已用 `history=long` 浏览器夹具验证长文本省略和详情全文；记录页测试 18/18、定向样式检查及构建（24.49 秒）通过，类型检查仍为 235 项既有诊断，无新增。日志 `/tmp/notification-records-ellipsis-{tests,types,build}.log`。内容与操作列均可打开历史详情，关闭恢复入口焦点；详情以内容和状态为标题，固定采用两列摘要：发送时间、通知类型、渠道、接收人、关联对象、消息模板、重试次数，下方展示发出的内容。`Records/useRecordDetail.ts` 的通知类型使用 `bizType`，关联对象使用 `bizId`，接收人使用 `receiver`。打开详情时，在具备模板查询权限的前提下，用历史 `templateId` 调用现有 `messageNotificationApi.getTemplate`，显示对应模板的当前 `name`，点击仍携带原 ID 跳转。模板未配置显示“未配置”；有 ID 但名称查询失败、已删除或无权读取时显示“未上报”，不回退显示 ID。加载期间显示“加载中”；切换记录、关闭抽屉、权限变化或卸载会使旧响应失效。模板名称属于当前配置元数据，不覆盖历史发送内容；姓名、关联对象名称与重试次数仍只使用已有历史契约。名称查询验证：records / integration 测试 30/30 通过，覆盖名称展示、按原 ID 跳转、关闭 / 权限 / 卸载 / 记录切换的旧响应失效及删除 / 错配 / 空名称回退；定向样式检查、模块构建（26.85 秒）和 `git diff --check` 通过，类型检查仍为 235 项既有诊断，无新增。浏览器确认显示“设备告警邮件”并打开对应 `template-alarm`；日志 `/tmp/notification-records-template-name-{tests,types,build}.log`。缺失上报数据统一显示“未上报”，缺失渠道或模板显示“未配置”，发送内容缺失仍展示占位；移除 ID 明细及原始模板 / 变量 / 结果快照区块。表格发送状态列宽为 100，发送内容列吸收剩余宽度，避免表格分配空余空间时放大状态列。验证（2026-11-11）：records / integration 测试 28/28、单文件定向样式门禁、模块构建及 `git diff --check` 通过；类型检查仍为 235 项既有诊断，新增 0、移除 0。日志 `/tmp/notification-records-detail-fields-{tests,types-final,build}.log`。浏览器验证字段顺序、空值占位、详情全文、模板链接实际跳转、发送状态表头实测 100px，以及 390px 窄屏无页面横向溢出；页面错误日志为空。中英日各 306 个消息通知键一致。

接口契约：`api/notice/messageNotification.ts#queryHistory` 对接 `POST /notify/history/_query`；`countHistory` 对接 `POST /notify/history/_agg`。聚合请求使用 `AggregationQueryParam` 的 `columns`（`COUNT(id)`）、`groupBy`（state）和 `filter`。当前部署的聚合接口只支持 SSE；`Accept: application/json` 返回 406，因此明确请求 `text/event-stream` 并由 `notificationHistoryCounts.ts#readHistoryCounts` 解析有限数据流。解析支持 CRLF、BOM、注释、多行 data 和错误事件，拒绝无效 / 重复计数；统计未返回、加载中或失败时，界面数量统一缺省显示 0。列表与统计均使用平台认证及后端历史资产过滤，权限仍为 `notifier/query`，未修改菜单或后端。

状态与数据边界：`Records/recordQuery.ts#notificationHistoryAdapter` 是可注入的生产适配器；`useHistoryCounts.ts` 保留内容、接收人、时间与渠道 / 配置 / 模板范围，统计时去掉状态和分页，翻页 / 切换状态不重复统计。列表和统计各自使用 AbortSignal 与代际校验，防止旧响应覆盖；统计失败不影响正常列表；记录页不提供统计失败提示或重试入口，实际计数返回后正常展示。`useHistorySelection.ts` 在翻页时保存已选快照，筛选或权限变化后清空；仅导出已选记录的完整内容，保留中文、引号和换行，并转义电子表格公式前缀。

后端限制：`NotifyState` 只有 `success/error/retrying/cancel`，不将取消改称“没发”。`NotifyHistory` 没有重试次数；`NotifierController` 现有发送接口会创建新通知，不能充当保留历史身份、权限、幂等和审计语义的重发。失败详情的重发按钮因此仍禁用并说明暂不支持，未增加批量重发。存储保留策略尚无 30 天契约，页面按服务可见历史查询，不加固定保留承诺。

验证（2026-11-11）：`node --test tests/messageNotification*.test.mjs` 94/94 通过；针对真实 SSE 契约完成最终修复后复跑 contracts / records / integration，46/46 通过，其他未变更回归沿用前次证据。日志 `/tmp/notification-records-complete-tests-{all,final}.log`。`pnpm exec vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 修改前后均为 235 项既有诊断，按文件、错误码及信息对比新增 0、移除 0，日志 `/tmp/notification-records-complete-types-{before,final}.log`；既有错误修复后仍需重跑。core 下 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notification-records-complete-build-final -- --module-name notify-manager-ui` 通过（23.72 秒），保留既有告警，日志 `/tmp/notification-records-complete-build-final.log`。两个变更 Vue 文件的定向样式门禁及模块 `git diff --check` 通过；模块没有独立 lint 脚本。该轮验证时中英日各 306 个 `messageNotification.*` 键一致；移除统计重试文案后为 305 个。

页面验证：9200 真实登录态默认失败列表正常，聚合修复后显示全部 184、成功 56、失败 128、重试中 0、已取消 0。隔离夹具检查跨页勾选，下载并读取 CSV，确认只包含两页已选的两条记录；检查历史全文 / 原因、对应模板和渠道跳转。390px 窄屏抽屉宽 358px、右边界为 390px，无页面横向溢出；表格允许内部滚动。未发送真实通知或写入真实业务数据，完整账号权限矩阵仍待环境验收。本地原型浏览器预览受策略限制，对照依据为原 HTML 的 `recRow/recTable/recDrawer/recSeg/recBulk` 与事件源码。

### 企业微信试发与成员对应

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

原型交互约定（2026-11-11，已按用户本轮要求实现）：在配置正文增加“成员对应”汇总及“自动匹配”“管理对应”两个入口；打开管理抽屉只读取已有关系，默认筛选未对应，自动建议改为显式点击生成。抽屉复用同一汇总、搜索、部门筛选、状态分段和分页，行内选择 / 更换平台用户，解除仍单独确认。沿用已确认的企微成员列表和手机号 / 邮箱唯一匹配、暂存后统一保存及 `bind` 权限；不引入原型的姓名兜底、即时落库、部门对应或新后端接口。新增失效关系展示仅指当前可见数据无法解析对应对象，不推断对象已删除。修改只在 `Channels/members/`、页面装配、三语文案和测试；验证显式匹配、手动保护、筛选计数、失败 / 迟到响应、权限、桌面 / 窄屏，并对比模块类型诊断及构建。原型依据为本地 `消息通知.html` 的 `mapSec/mapDrawer/mapUsers/mapAuto`，浏览器策略不允许直接打开该 `file://`。

本轮原型交互验证：通知回归 135/135 通过，最终 channels / wechat / integration 定向回归 64/64 通过；覆盖汇总只读、显式匹配、手动选择及清除保护、搜索 / 状态计数、失效对应的解除、关闭重开、跨配置迟到响应，以及原有保存失败 / 并发冲突保护。模块类型检查前后同为 213 项既有诊断，忽略行号后新增 0、移除 0；最终模块构建通过（25.09 秒），三个 Vue 文件的 SFC / 样式编译及颜色 token 检查通过，中英日各 377 个通知键一致，`git diff --check` 通过；没有独立 lint 脚本，不记为完整 lint。命令沿用本节和下方验证入口，日志 `/tmp/wechat-mapping-{tests-final,tests-focused,types-before,types-final,style,build-final}.log`。

浏览器复核：9200 实际企业微信配置页显示“成员对应”汇总及“自动匹配”“管理对应”双入口，只进行了读取。隔离夹具验证默认未对应且无隐式建议、显式匹配、行内选择 / 更换、确认解除、保存后汇总联动、保存失败重试、放弃预览及无 bind 权限禁用；390px 下抽屉宽 358px，页面无横向溢出、表格内部滚动、保存按钮可达。截图 `/tmp/wechat-mapping-channel.jpg`、`/tmp/wechat-mapping-desktop.jpg`、`/tmp/wechat-mapping-mobile.jpg`。保留原定企微成员为行、选择平台用户的管理方向；原型的部门对应、按姓名兜底和即时写入不在本轮范围。未修改真实对应关系或发送通知，后端依赖与角色矩阵的既有待验证项保持如下。

运行时通知渠道支持企业微信已保存模板试发和成员对应。配置保存 CorpID / AgentId / Secret 并提供获取说明，AgentId 优先取渠道值，未填写的历史渠道回退到模板值；回调 URL、Token、EncodingAESKey 与真实出口 IP 仅说明获取或支持边界，不生成占位值。全部渠道的删除入口改为危险链接“清除配置”，沿用原删除接口及独立确认弹窗，中英日文案一致。

试发选择当前渠道和配置兼容的已保存模板，通过 `/notifier/template/{id}/detail` 获取完整变量定义，再调用 `/notifier/{configId}/{templateId}/_send`。企业微信要求渠道或历史模板中存在 AgentId，且 toUser / toParty / toTag 中至少一类接收人有效，不要求邮件 sendTo；邮件接收人与动态附件校验保持可用。没有兼容模板时提供模板配置入口，失败保留输入，成功仅表示请求已提交。

成员抽屉由 `views/system/MessageNotification/Channels/members/` 承载，复用企微部门树、全部成员和第三方绑定接口；`api/notice/wechatMembers.ts` 完整分页读取 `/user/detail/_query`，`notify-wechat` 的 `CorpUser` 透传可选 mobile / email / bizMail（映射上游 biz_mail）。渠道页预加载成员汇总，打开管理抽屉只展示已有关系；点击“自动匹配”才生成建议：清理手机号格式字符、邮箱首尾空白并忽略大小写，不猜测国际区号，不使用姓名或 ID 兜底；仅接受唯一且无冲突的结果。已有关系优先，同配置内平台用户不能重复分配；没有可用联系方式、重复或冲突时手动选择，暂不对应的成员可留空。

自动建议和手动修改先暂存，通过原 `_bind` 接口统一保存；修改携带原绑定 ID，解除使用单独确认及原 `_unbind`。写前重读并比较完整绑定快照，发现变化要求重新同步；这是客户端乐观冲突检查，并非服务端原子比较更新。写成功但刷新失败时禁用再次写入，要求重新读取。关闭、配置切换、权限丢失和卸载使迟到请求失效，不恢复旧预览。

入口及权限位于 `Channels/index.vue`、`useChannelsPage.ts`、`views/system/MessageNotification/shared/catalog.ts` 和 `baseMenu.json`；独立 `bind` 按钮映射 `notifier/query`、`user/query`、`user-third-party-manager/query,save`，沿用服务端权限和资产边界。未保存、修改中、提交中或无权限时禁用对应入口。发布时必须让运行时通知服务加载更新的 `notify-wechat`，并同步新增按钮及角色授权。成员联系方式以企业微信实际返回为准，缺失时仍可手动对应；不新增用户、部门同步或回调服务，不迁移历史模板，不修改运营端 `ui/`。

验证（2026-11-11）：通知回归 131/131 通过；修正试发空白收件人校验和模板通用文案后，channels / wechat / integration 定向复跑 60/60 通过。模块 `vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 保持 213 项既有诊断，按文件、错误码与信息比较新增 0、移除 0，尚未全绿；修复既有错误后需重跑。模块构建通过（29.00 秒，保留已有构建告警），3 个变更 Vue 文件的定向样式检查、浏览器夹具语法检查和 `git diff --check` 通过；模块没有独立 lint 脚本；中英日各 356 个 messageNotification 键一致，最终文案 JSON 解析通过。测试覆盖唯一匹配、重复与冲突、分页、已有关系保护、修改解除、保存失败、权限和迟到响应，日志为 `/tmp/wechat-channel-tests-{stage,final}.log`、`/tmp/wechat-channel-types-{before,final}.log`、`/tmp/wechat-channel-build-final.log`。

隔离浏览器完成模板变量及确认试发、自动建议 / 手动保存、已有关系修改 / 解除、失败重试、无同步权限禁用、“清除配置”危险链接及确认反馈（hover 颜色由 rgb(255, 77, 79) 变为 rgb(255, 120, 117)）；1280px 桌面和 390px 窄屏抽屉可用，窄屏表格内部横向滚动可达操作列，浏览器错误日志为空。所有发送、绑定和配置清除仅操作测试夹具内存，真实服务商发送和完整角色权限矩阵仍待联调。截图为 `/tmp/wechat-members-desktop.jpg`、`/tmp/wechat-members-mobile.jpg`。

后端新增 `CorpUserContractTest` 覆盖实际 WebClient 联系方式反序列化、缺字段兼容和跨部门成员去重；定向测试及编译尚未执行成功：缺少 `org.jetlinks.pro:jetlinks-parent:2.20.0-SNAPSHOT`，私服返回 401。恢复 Maven 依赖访问后，在工作区根目录执行 `mvn -f modules/jetlinks-components/notify-component/notify-wechat/pom.xml -Dtest=CorpUserContractTest,WechatMessageTemplateTest,WechatNotifierProviderTest test`（包含编译），详细阻塞见 `/tmp/wechat-channel-backend-tests-online.log`。

### Webhook 原型对齐

运行时 `runtime-ui/modules/notify-manager-ui` 的 Webhook 渠道页直接展示本地请求示例，不查询或选择已保存消息模板，不以模板是否存在作为显示条件；超时和签名暂不加入。标题为 Webhook，接收地址继续就地保存，请求头沿用已有配置能力。请求示例下方的额外提示、消息模板配置说明及跳转入口全部移除，仅保留示例和复制操作。

`Channels/webhook/requestPreview.ts`、`useWebhookPreview.ts` 和 `WebhookRequestPreview.vue` 复用本地告警样例与 core `CodeBlock` 生成 POST / JSON 示例，显示及复制均遮蔽已配置的请求头值。已有配置使用保存值，新配置使用当前输入或地址占位；示例不作为实际发送正文。`Channels/useChannelsPage.ts` 仅装配本地示例；请求示例区不再提供模板导航。渠道页不预读模板或告警目录，也不修改真实模板、配置及发送通知。

验证（2026-11-12）：请求示例下方的模板说明、入口及对应事件、权限和三语文案已移除。Webhook / channels / contracts / integration 回归 81/81 通过，两处 Vue 编译、定向样式检查、三语资源一致性及差异空白检查通过。隔离浏览器脚本 `tests/messageNotificationBrowser/webhook.mjs` 的 5 组检查通过，确认无模板说明和入口、零模板查询、复制与地址保存正常、新配置正常显示及 390px 布局正常，页面错误为空。日志前缀 `/tmp/webhook-remove-template-link-`，未操作真实配置或发送通知。本次删除未重跑全量类型检查和生产构建，下方保留上一轮基线。

三处 Vue 定向样式检查、三语资源键一致性及 `git diff --check` 通过；模块无独立 lint 脚本。模块构建通过（28.67 秒，保留既有构建告警），命令为 core 目录下 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/webhook-example-build -- --module-name notify-manager-ui`。类型检查修改前后均为 213 项既有诊断，按文件、错误码及信息比较无新增或移除；待既有问题修复后，在 `runtime-ui/` 重跑 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`。日志前缀 `/tmp/webhook-example-`。

### 已配置渠道回显与整表编辑

渠道表单精简：短信顶部“发送测试消息”保持原样；短信的“渠道测试”区和邮件的“SMTP 扩展属性”在新建、查看及编辑时均移除，已有配置值继续保留；邮件预设和加密方式仍通过内部 `properties` 联动。群机器人空配置先显示“添加”入口，点击后创建草稿，已有配置继续支持多套选择与新增。更多菜单中的编辑按钮铺满菜单项宽度。实现范围为本模块的 `Channels/index.vue`、表单适配和 workspace，配套更新说明文案及现有内存夹具；验证字段可见性、历史值保留、群机器人新增/删除/草稿隔离、权限和窄屏菜单。

精简验证：渠道 / 试发 / 契约定向测试 90/90 通过，`smoke.mjs`（`SMOKE_CHANNELS_ONLY=1`）10 项和 `trials.mjs` 9 项通过。内存夹具覆盖新建/查看/编辑字段移除、短信凭据保存后原有试发正常、邮件加密联动、群机器人显式添加及清除后回到空态、权限限制、编辑按钮右侧空白点击和 390px 布局；无页面错误或真实配置写入。定向样式检查、三语资源键与 JSON、`git diff --check` 和生产构建通过（24.28 秒）；模块类型检查仍有 193 项既有诊断，无新增或移除，无独立 lint 脚本。验证命令沿用下方质量检查，日志及浏览器报告前缀为 `/tmp/notification-form-cleanup-`。

整表编辑（2026-11-12）：所有渠道的已有配置默认只读，更多菜单在“清除配置”上方提供“编辑”，受配置更新权限控制；点击后全部可修改字段进入编辑态，左下角出现“取消 / 保存”。`Channels/useChannelWorkspace.ts` 按配置保存编辑状态和草稿，`useChannelsPage.ts` 编排入口、保存反馈及测试补全配置，`ChannelConfiguration.vue` 通过 `useChannelConfiguration.ts` 映射只读字段和整表输入。复用 `InlineEditForm` 的 form/detail 模式及 `StickyActionBar`，不改变共享组件、后端接口或运营端 `ui/`。`Channels/index.vue` 中试发、编辑和清除配置按钮分别使用 `SendOutlined`、`EditOutlined` 和 `DeleteOutlined`，图标不改变按钮的可访问名称；“编辑”使用模块中英日资源。

菜单图标补充验证：定向样式检查、`git diff --check` 和生产构建通过（23.90 秒）；类型检查仍为 193 项既有诊断，无新增或移除，工作区无独立 lint 脚本。内存夹具核对 1440px / 390px 菜单图标、按钮可访问名称与布局通过，无页面错误或配置写入；报告为 `/tmp/notification-menu-icons-browser/report.json`。

整表编辑验证（2026-11-12）：模块目录执行 `node --test tests/messageNotificationChannels.test.mjs tests/messageNotificationTrial.test.mjs tests/messageNotificationContracts.test.mjs`，88/88 通过，覆盖只读渲染、整表提交、取消还原、失败/权限/提交锁定、跨配置草稿、SMTP 联动、动态字段和凭据保留。既有 `tests/messageNotificationBrowser/` 的 `smoke.mjs`（设置 `SMOKE_CHANNELS_ONLY=1`）、`trials.mjs`、`webhook.mjs`、`robotSigning.mjs` 均通过；八类渠道统一编辑/取消，中英日按钮、下拉和复合控件零自动写入、短信测试配置补全、左下角按钮、390px 布局、无更新权限及失败重试均已覆盖。浏览器使用 `SMOKE_PLAYWRIGHT_MODULE="$PWD/../../../ui/node_modules/playwright"` 和现有 9200 Vite 服务，接口均由内存夹具提供，无页面错误；未写入真实配置或发送真实通知。报告位于 `/tmp/notification-whole-edit-{browser,trials,webhook,robot}/report.json`。

质量检查：在 `runtime-ui/` 执行 `node ../ui/scripts/check-ui-style.mjs --files modules/notify-manager-ui/views/system/MessageNotification/Channels/index.vue modules/notify-manager-ui/views/system/MessageNotification/Channels/ChannelConfiguration.vue` 通过；两个 Vue 文件均低于 300 行，中英日 JSON 与模块 `git diff --check` 通过。`./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 前后均为 193 项既有诊断，忽略行列后新增 0、移除 0，完整类型检查仍待基线问题修复后重跑。工作区无独立 lint 脚本。在 `runtime-ui/jetlinks-web-core/` 执行 `node --max_old_space_size=16384 ../node_modules/vite/bin/vite.js build --outDir /tmp/notification-whole-edit-build -- --module-name notify-manager-ui` 通过（34.21 秒），保留既有构建警告。日志前缀 `/tmp/notification-whole-edit-`；真实服务商投递与完整账号权限矩阵仍需环境联调。


语音提示对齐（S）：`views/system/MessageNotification/Channels/useChannelConfiguration.ts` 复用 `InlineEditForm` 的字段提示与只读字段，展示当前阿里云服务商，按原型补充服务商、AccessKey ID 和 AccessKey Secret 的提示；`locales/lang/{zh,en,ja}.json` 同步调整语音简介及“服务商与 AccessKey”分组标题。保留地域选择，地域提示复用既有“阿里云服务地域。”译文；凭据保护、保存与接口契约保持不变。

语音提示验证（2026-11-11）：`node --test tests/messageNotificationChannels.test.mjs tests/messageNotificationContracts.test.mjs` 59/59 通过，模块构建通过（35.74 秒，保留既有构建告警），三语消息通知键一致且 `git diff --check` 通过。模块类型检查前后均为 213 项既有诊断，无新增或移除；待既有诊断修复后在 `runtime-ui/` 重跑 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`。工作区无独立 lint 脚本，本次未修改 Vue 模板或样式。9200 登录态已核对各项提示在对应字段下显示，未保存真实配置或发送通知。日志前缀 `/tmp/notification-voice-hints-`。

底部操作栏：`Channels/index.vue` 的新配置底栏仅保留左对齐的“保存”，移除“撤销修改”和底栏未保存提示；`useChannelsPage.ts` 清理仅用于旧底栏对齐的派生值。保存权限、校验、草稿与离开提醒保持原有行为。验证（2026-11-11）：渠道 / 契约回归 58/58、单文件样式门禁、模块构建（26.14 秒）和 `git diff --check` 通过；类型检查仍为上一轮相同的 213 项既有诊断，无新增或移除，待修复后重跑下方类型命令。工作区无独立 lint 脚本。9200 钉钉渠道页实测输入前后保存按钮均与表单左边缘对齐，“撤销修改”按钮数量为 0；测试输入已清空，未保存真实配置。日志前缀 `/tmp/notification-footer-`。

地域选择：`Channels/channelSchema.ts` 为阿里云语音和短信的 `regionId` 复用旧版 `views/notice/channel/hooks/noticeChannelModel.ts` 中的 28 个地域选项，经 `configuration/channelMetadata.ts` 和 `useChannelConfiguration.ts` 接入现有下拉编辑器及中英日翻译。后端仍返回字符串类型时也使用下拉列表，显示地域名称，保存字符串地域 ID；接口、必填规则及其他配置保持原有行为。

地域选择验证（2026-11-11）：`node --test tests/messageNotificationChannels.test.mjs tests/messageNotificationContracts.test.mjs` 58/58 通过，模块构建通过（29.74 秒，保留既有构建告警），三语地域键和 `git diff --check` 通过。模块类型检查前后均为 213 项既有诊断，无新增或移除；修复既有诊断后需在 `runtime-ui/` 重跑 `./node_modules/.bin/vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json`。工作区无独立 lint 脚本，本次未修改 Vue 模板或样式。实际 9200 语音页下拉及中文选项已验证；隔离夹具中首次选择杭州并保存、已配置回显、改选北京自动保存均通过，页面无错误日志。未向真实后端保存凭据或发送通知，真实服务商连通性不在本次验证范围。日志前缀 `/tmp/notification-aliyun-region-`。

分组详情和整表保存覆盖动态后端目录中的全部提供商。公共表单为 `runtime-ui/jetlinks-web-core/src/components/InlineEditForm/`，通过 core 根入口或目录公开入口导出；API、事件、插槽和示例见组件 README。通知模块通过 `Channels/useChannelConfiguration.ts` / `ChannelConfiguration.vue` 映射业务元数据，`useChannelWorkspace.ts` 承载草稿、校验与提交，`useChannelsPage.ts` / `index.vue` 管理操作入口。

已有配置展示保存值和凭据掩码，字段自身不响应点击或键盘进入编辑；“编辑”同时展开所有可见的普通字段和请求头，服务商等固有只读字段保持只读；短信“渠道测试”和邮件“SMTP 扩展属性”均不显示。本页不接入字段 submit，失焦、Enter、选择下拉及元数据控件完成事件均不保存。取消仅还原当前配置快照和校验错误，退出编辑，不发送请求；保存整表校验后仅调用一次既有创建或更新接口，成功回到只读，失败保留输入。无修改时禁用保存，提交期间锁定取消、重复保存和配置切换。单配置渠道首次进入时直接填写，群机器人首次填写由“添加”入口开启；新建配置在左下角保存，不增加取消入口。

非机器人渠道每个 `type/provider` 只提供一套配置入口：没有配置选择器和新增入口，已存在记录时 workspace 也禁止创建第二套。机器人由 `shared/catalog.ts` 的 `multipleConfigurations` 标记，动态目录继承该展示能力；当前后端机器人提供商为 `dingTalk:dingTalkRobotWebHook`，保留选择、增加、自动重名编号和删除。未知提供商默认单套，不影响动态渠道或字段发现。历史重复数据不自动删除：默认进入后端第一条，仍兼容明确配置 ID 的原有跳转，防止已引用模板错绑。此限制作用于本页面，不新增后端唯一约束或执行历史数据迁移。

整表提交只包含当前配置的草稿，不夹带其他渠道的修改。切换渠道或机器人配置时保留各自草稿及编辑状态；离开页面沿用未保存提醒。保存成功后即使列表读取失败，也只重试读取，不重复写入；权限丢失后清理的配置不会被迟到响应恢复。密码与 HTTP 请求头保持掩码、空值保留及禁止提交掩码的规则；无法安全保留的凭据要求重新输入，校验涉及暂时隐藏的字段时展示表单级错误，避免无反馈。元数据新增字段和未编辑参数保留。状态显示“已配置”，不推断服务可用性；配置名称与 ID 仅在内部继续用于保存和关联。清除配置仍经独立弹窗确认。

配置信息移除验证（2026-11-11）：渠道测试 37/37、单文件定向样式检查、模块构建（24.34 秒）和 `git diff --check` 通过；模块类型检查保持 235 项既有诊断，无新增或移除，工作区无独立 lint 脚本。隔离浏览器确认邮件仅展示“邮箱服务商”“发件账号”，没有配置名称或 ID 区块，页面错误日志为空。日志前缀 `/tmp/notification-remove-config-information-`；未操作真实配置。

邮件预设同时更新草稿中的服务器、端口和加密属性，点击整表保存时才提交；选择“其他 / 自定义”允许手动填写服务器，不发起保存。加密切换仅联动原方式的标准端口，自定义端口和其他 SMTP 参数保留。说明在新建及已有配置均默认展开，并记住当前页面中各渠道的开关选择；字段聚焦联动相关步骤。宽屏左右排列，窄屏上下排列。

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

已实现：`useChannelCatalog.ts` 加载类型 / 提供商目录、批量配置快照与元数据，类型失败独立重试，配置查询失败不产生未配置状态。`configuration/channelMetadata.ts`、`channelSchema.ts` 与 `ChannelConfiguration.vue` 按元数据保留全部字段，既有渠道提供分组、凭据与校验增强；`configuration/ChannelHelp.vue` 提供默认展开、可收起的说明。`useChannelWorkspace.ts` 为每个新草稿生成一次 32 位随机标识，名称由渠道 / 提供商名称组成并在重名时追加序号；默认值不计脏，首次保存可触发校验。切换、重置和保存失败保留草稿身份；已成功写入但刷新失败时只重试读取，已有配置不自动改名。

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
| 通知渠道：选择并维护一项通知配置 | 15rem 渠道导航与右侧配置工作区共用一个连续面板；移除独立页面标题及左右卡片；配置选择器限制合理宽度，与新增等操作组成紧凑工具栏 | 机器人保留多配置选择；其他渠道直接展示单套配置；已有配置通过更多菜单整表编辑并保存/取消，首次配置保留底部保存；帮助信息仍贴近配置内容 |
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

共享导航键为 `channel/configId/templateId/state`，路由保留查询与选择，编辑草稿只留页面内存；密钥不写浏览器持久存储。读取凭据后编辑输入为空，空值不作为清空，掩码不会提交；旧凭据缺失或只有掩码时须重输。HTTP header 值同样按凭据保护。保存失败保留输入，已成功保存但刷新失败不重复新增；刷新事件只携带白名单 ID / 渠道 / 动作，不带凭据。试发支持邮件和企业微信参数，要求实际兼容模板、所需变量 / 接收人及邮件附件参数、权限和显式确认，发送期间固定上下文。

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
