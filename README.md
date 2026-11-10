# notice-center-ui

通知中心独立前端模块，承接消息模板与通知渠道配置页。

- 菜单入口：`/notice`，默认进入 `/notice/template`
- 页面入口：`views/notice/template/index.vue`、`views/notice/channel/index.vue`
- 接口封装：`api/notice-center.ts`
- 后端接口：`/notify/channel/**`、`/notifier/config/**`、`/notifier/**`

## 消息通知三页迁移（contract-v1）

### 产品列表风格对齐

- 结论：消息通知三页已按用户指定的 `http://localhost:9200/#/resources/devices/products` 及其源码统一页面布局。owning module 为 `runtime-ui/modules/notify-manager-ui`，仅调整本模块的展示层与验证夹具。
- 已核实差异：2026-11-10 在 9200 登录态查看产品页、渠道页、模板目录及编辑态、记录页。产品页使用连续白底面板、15rem 可折叠左栏、细分隔线、紧凑工具栏与标准表头；通知页额外叠加独立 `PageHeader` 卡片和左右 `ContentPanel`，模板渠道切换悬在面板外，记录表格存在额外内边距。
- 风格事实源：`runtime-ui/modules/device-manager-ui/views/device/Product/index.vue`、同目录 `components/ProductCategoryTree.vue`；复用当前 core 的 `FullPage`、`EqualHeightColumns`、`ConditionFilter`、`TableActions`、`CloudEmpty`、`StickyActionBar`。已核对组件注册、`ContentPanel/README.md` 和 `EqualHeightColumns/README.md`；不复制产品模块的业务组件或私有样式。

| 页面与首要任务 | 确定的布局方案 | 操作与状态 |
| --- | --- | --- |
| 通知渠道：选择并维护一项通知配置 | 15rem 渠道导航与右侧配置工作区共用一个连续面板；移除独立页面标题及左右卡片；配置选择器限制合理宽度，与新增等操作组成紧凑工具栏 | 保留多配置选择、草稿状态、轻量编辑、试发抽屉及底部保存 / 重置；帮助信息仍贴近配置内容 |
| 消息模板：查找模板并编辑、预览 | 渠道切换、刷新与新增并入面板内顶部工具栏；下方为 15rem 可折叠模板目录和编辑 / 预览区；目录搜索、选中样式、文字主次与产品分类栏对齐 | 保留现有就地编辑、变量插入、附件、预览与保存流程；预览作为内容分区，长表单独立滚动，窄屏保留选择器与上下排布 |
| 通知记录：筛选并查看发送结果 | 单一连续面板；`ConditionFilter`、状态筛选和操作组成紧凑工具栏；使用无额外内边距的 `j-pro-table`，对齐表头、状态标签、固定操作列与分页 | 保留查询不可用、权限不足、加载、错误及空态，继续使用详情抽屉；不为视觉补齐虚构记录或数量 |

- 实施范围：三页 `index.vue` 及必要的展示子组件 / 页面 hook；`index.ts#getContentPanelOverrides` 恢复三页使用项目默认面板，页面内部移除重复面板并使用透明 `FullPage`；相关装配测试、浏览器测试和本节同步更新。新增或调整的文案沿用中英日 i18n，组件保持现有职责边界。
- 范围之外：不改 `ui/`、产品参考页、core 公共组件、后端、菜单 URL / 权限、API / 数据结构或业务流程；不执行菜单初始化、真实通知发送或业务数据写入；不接入此前暂缓的历史查询。保留现有未提交内容及草稿、密钥、附件保护。
- 实现入口：`index.ts#getContentPanelOverrides` 返回空配置，由平台提供唯一的 `ContentPanel`；三页 `index.vue` 使用透明 `FullPage` 和 `shared/layout.css`。渠道及模板左栏统一 15rem，复用 `EqualHeightColumns` 的默认间距、分隔线与折叠；渠道工具栏关联操作保留原可见条件。模板目录和表单独立滚动，`StickyActionBar position="inline"` 占据独立底行，预览用细分隔线划分。记录工具栏进入 `j-pro-table#headerLeftRender`，使用 `pro-table__no-padding`、`j-badge-status` 与有可访问名称的图标详情按钮，保留服务端状态文字。
- 本轮验证（2026-11-10）：`node --test modules/notify-manager-ui/tests/messageNotification*.test.mjs` 通过 73/73；实际菜单与 core 装配仍执行生产源码，测试环境显式隔离其他模块的请求和运行时上下文。定向样式检查通过 6 个变更文件，`git diff --check` 通过；工作区无独立 lint 脚本，未将样式检查记为完整 lint。
- 类型检查：模块 `vue-tsc --noEmit --pretty false -p modules/notify-manager-ui/tsconfig.json` 仍返回 235 项既有诊断；与本轮修改前按文件、诊断代码及信息对比，新增 0、移除 0。日志为 `/tmp/notification-product-style-typecheck-before.log` 和 `/tmp/notification-product-style-typecheck-final.log`；类型检查尚未全绿，既有问题需要单独处理。
- 构建：通知模块构建通过（26.86 秒），日志 `/tmp/notification-product-style-build-final.log`；沿用已有依赖，以 16 GB 堆上限执行 Vite 模块构建，输出至 `/tmp/notification-product-style-build-final`，保留既有构建警告。本轮未重复全量 runtime 构建。
- 浏览器验证：在 9200 真实登录态只读检查渠道空态 / 已保存配置、模板目录 / 真实模板编辑态和记录不可用态，三页均只有一个内容面板，桌面无页面横向溢出；渠道与模板侧栏宽度为 240px，保存栏可见。另通过浏览器操作现有隔离夹具，检查 1440px 桌面和 390px 窄屏、折叠 / 展开、渠道与模板保存、草稿切换、长表单滚动、记录筛选及详情关闭后的焦点返回。记录表格在窄屏内部横向滚动。保存操作仅写入夹具内存；真实服务未保存、删除或发送通知。本轮没有重新执行下文历史 `smoke.mjs` 27 项自动回归。
- 剩余限制：生产历史查询仍不可用，非空记录、筛选、分页和抽屉通过单元测试及隔离数据验证；真实账号权限矩阵、业务写入和发送接口不在本次视觉验收范围。
- 技能状态：已使用安装的 `jetlinks-web` 页面分型、业务参考和组件来源规则；按共享仓库 `master/jetlinks-web-style` 自动安装返回 `Skill path not found`。当前 `jetlinks-web` 已包含相应规则，本次以其和用户指定产品页的当前实现为依据。

### 迁移边界与既有实现

URL 简化：按用户要求，将本模块消息通知菜单组及三个子页的 URL 统一为 `/system/notification` 与 `/system/notification/{channels,templates,records}`；保持菜单 ID、路由代码和权限标识。验证：JSON 解析、四条路径映射、现有菜单 / 路由集成测试 10/10、`git diff --check` 通过；本次仅修改静态 URL 和文档，未重复 lint / 类型检查 / 构建。已初始化环境需同步菜单 URL 并刷新页面，本次不写入服务端菜单。

开发环境页面加载：运行中的 Vite 服务若在新增页面后仍缓存旧的 `import.meta.glob` 路由表，可能出现菜单可见但页面空白。应检查实际服务返回的本模块 `index.ts` 路由清单，并触发入口更新（在 `runtime-ui/` 下执行 `touch modules/notify-manager-ui/index.ts`）或重启 Vite 服务，再刷新浏览器。本次触发入口更新后，在 9200 登录态直接访问并刷新模板页和记录页均可渲染。记录页仍按既定范围显示查询不可用。

目标与 owning module：用户已确认将通知渠道、消息模板、通知记录从 `ui/modules/authentication-manager-ui` 迁入运行时 `runtime-ui/modules/notify-manager-ui`。保留 `views/system/MessageNotification/` 路径、`contract-v1` 类型 / API 签名、真实 ID、路由与前端动作标识；新独立 `system/MessageNotification` 菜单组归属 `iot`，后端权限沿用已核实的 `notifier` / `template` 映射。

范围之外：保留既有告警中心 `Notify`、`views/notice/template` / `channel`、订阅型接口及权限 / 资产配置；保留目标已有未提交文件。历史 HTTP 查询继续关闭，不修改 core / 后端，不启动或停止用户服务，不执行真实菜单初始化、授权或通知发送。源目录只在目标集成验收后移除本轮新增内容，不恢复或覆盖其他改动。

实施顺序：A 核对目标 core 后复制 shared / API 并冻结公共边界；A / B / C 分别迁移渠道 / 模板 / 记录，全部请求、状态编排和副作用抽入 hook / service，组件负责渲染与事件委托。A 保留目标模块注册并统一整合菜单、三语 `messageNotification.*` 文案和本节；主代理完成集成、类型基线对照及构建验收后再清理源内容。组件最多五层、单文件不超过 300 行，优先使用本地 core 能力。

验证：复跑公共契约、渠道 / 模板 / 记录与实际模块装配集成；确认新菜单初始化资源筛选、旧菜单完整树和旧注册不变；检查三语键、core 组件属性、草稿 / 密钥 / 附件 / 预览 / 抽屉交互与窄屏滚动。执行定向样式门禁、目标模块类型检查并对照迁移前诊断、模块构建和必要聚合构建。现有类型错误与新增问题分开记录，环境联调和历史查询接入限制完成后回填本节。

当前状态：公共基础与三页已迁入目标，菜单 / 三语 / 模块入口已整合；源模块本轮新增代码、菜单、语言键及文档已清理，只保留其原有改动。统一测试、样式、最终浏览器回归、模块及全量构建通过；类型检查仍受既有 core 问题限制，环境联调和历史查询接入保留为后续工作。

| 页面 | 目标入口与 core 复用 | 已实现范围 |
| --- | --- | --- |
| 通知渠道 | `views/system/MessageNotification/Channels/`；`EqualHeightColumns`、`Editable`、`StatusPill`、`JlDrawerShell` | 真实配置查询 / 选择 / 新增 / 编辑 / 保存 / 删除，多配置显式选择；邮件参数与已有模板试发校验；渠道导航、草稿隔离、失败恢复与离开提醒 |
| 消息模板 | `views/system/MessageNotification/Templates/`；`SwitchGroup`、`FileUpload`、`StickyActionBar` | 实际模板目录及记录查询 / 新增 / 编辑 / 保存；一次保存一个 ID；变量光标插入、明确的示例预览及真实附件引用 |
| 通知记录 | `views/system/MessageNotification/Records/`；`ConditionFilter`、`j-pro-table`、`TableActions`、`JlDrawerShell` | 真实 `NotifyHistory` 字段、条件 / 状态 / 分页 / 详情及请求竞争保护；生产查询适配仍关闭，交互通过依赖注入测试 |

`index.ts` 保留目标模块原有 `register`、异步路由 glob 和其他导出；三页现通过空的 `getContentPanelOverrides` 使用平台默认面板，页面内部不重复套面板。页面路由代码维持 `system/MessageNotification/{Channels,Templates,Records}`，URL 为 `/system/notification/{channels,templates,records}`；`baseMenu.ts` 仍统一添加 `runtime: true` 与 `options.appName: 'notify-manager'`。新增菜单贡献通过 core 真实 `getModulesMenu` 和 `init-home/data#mergeTrees` 合入既有 `system` 父路径。新组与三页归属 `iot`，既有 `alarm-center/Notify` 子树、`notify-channel` 权限与 `notifyConfig/notifySubscriberProvider` 资产配置完整保留。

运行时约束已落实：渠道页面编排由 `useChannelsPage` 承载，配置字段、键值编辑和抽屉焦点分别在 `useChannelConfiguration`、`useConfigurationPairs`、`useChannelSendDrawer`；模板 / 记录同样将请求、路由、状态与副作用放入各页 hook / service。组件只声明视图、props 和事件委托，复杂视图状态合并为局部 model；无新增超过 300 行的 Vue 文件，组件层级不超过五层。`EqualHeightColumns` 使用 15rem 左栏、1fr 右栏和组件默认间距，平台 `ContentPanel` 内通过 flex 与 `min-height:0` 管理独立滚动，窄屏使用选择器。

公共边界位于 `api/notice/messageNotification{Types,State,}.ts` 与 `views/system/MessageNotification/shared/`，与迁移源 `contract-v1` 签名一致。渠道 catalog 统一七个已核实类型 / provider，未知提供商不借用其他编辑器；配置 / 模板使用实际 ID，不建立七类业务模板持久化关系。配置使用 `/notifier/config/**`，模板使用 `/notifier/template/**`，试发使用 `/notifier/{configId}/{templateId}/_send`。mutation 返回 unknown，成功后以已知 ID 刷新，不猜测返回的新 ID。

公共消费入口：`messageNotificationTypes.ts` 定义配置、模板、历史记录、分页、查询、邮件参数 / 附件 / 变量；`messageNotification.ts#messageNotificationApi` 提供 `queryConfigs/getConfig/createConfig/updateConfig/deleteConfig`、`queryTemplates/getTemplate/createTemplate/updateTemplate/deleteTemplate` 与 `send(configId, templateId, variables)`。查询校验并归一化分页，其他方法仅在响应 success 后更新已保存状态；401/403 单独归为无权限，网络或格式失败不冒充空结果。`shared/index.ts` 统一导出 catalog、导航、密钥适配、状态与配置刷新事件，禁止页面自行维护另一份渠道或 ID 映射。

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
| 记录页面、`query` | `notifier/query`，生产历史查询能力仍关闭 |

渠道 / 记录 `showPage` 为 `notifier`，模板为 `template`。core 初始化过滤按资源 ID 任一匹配保留叶子与按钮，不替代账号 action / 资产范围授权：无通知资源时移除新组，仅 `notifier` 时保留渠道 / 记录，仅 `template` 时保留模板候选，同时提供两项资源时保留三页。模板实际读取配置，需要 `notifier/query`；渠道试发保留前端 `Templates:query` 检查。菜单声明可在支持这些资源的环境同步或初始化并配置功能授权与资产范围，本轮不执行环境写入。

历史 HTTP 源码已核实：上述固定提交的 `NotifyHistoryController` 使用类级 `/notify/history` 与 `@NotifierResource`，全局 `POST /_query` 返回 `NotifyHistory` 分页，通过 `AssetsHolder.injectQueryParam` 按保存的 `notifyConfig` bindings 注入资产范围。方法没有显式 `@QueryAction`，菜单沿用既有 `notifier/query` 查询映射；前端 facade 尚未接入历史查询，部署版本及真实服务联调待后续。历史状态为 `success/error/retrying/cancel`，详情展示服务端发送内容与快照，不按当前模板重算；不可用时不显示伪造零计数，不启用重发 / 导出，不承诺 30 天保留。

附件上传遵循独立环境权限：core `FileUpload` 使用 `/file/upload`，后端 `FileManagerController` 要求登录；`FileProperties` 开启权限校验时另需 `file-manager/upload-any` 或 `upload-<suffix>`（默认未启用）。新模板菜单不自动授予任意上传权限，不复制旧 `file/upload-static`，不改资产授权模型。模拟数据只在测试中，不进入生产请求回退。

已实现并接入：目标渠道配置 CRUD、模板真实记录编辑、变量预览 / 附件、菜单后端权限声明与中英日各 202 个 `messageNotification.*` 键。所有原语言键保留。

已实现结构但受接入限制：记录页的真实字段、筛选、分页与详情；HTTP 查询仍关闭。真实账号授权、配置 / 模板服务与发送接口联调未执行。

本轮暂缓：七类业务模板绑定 / 恢复默认、站内信模板、成员写入及自动匹配、未知提供商、非邮件试发、历史 HTTP 接入 / 计数 / 重试 / 导出、30 天保留、出口 IP 与回调参数来源。

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
