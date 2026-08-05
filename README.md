# notice-center-ui

通知中心独立前端模块，承接消息模板与通知渠道配置页。

- 菜单入口：`/notice`，默认进入 `/notice/template`
- 页面入口：`views/notice/template/index.vue`、`views/notice/channel/index.vue`
- 接口封装：`api/notice-center.ts`
- 后端接口：`/notify/channel/**`、`/notifier/config/**`、`/notifier/**`

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

## 模板树状态开关

- 目标：左侧模板树的告警类型节点展示首字头像、启用状态和即时启停开关，渠道子节点继续展示渠道图标。
- 影响范围：`views/notice/template/components/TemplateTree.vue`、`views/notice/template/hooks/useNoticeTemplateCenter.ts`、`views/notice/template/hooks/noticeTemplateModel.ts`、`api/notice-center.ts`。
- 实现入口：告警类型节点的 `a-switch` 调用 `/notify/channel/{providerId}/enable` 或 `/notify/channel/{providerId}/disable`，完成后刷新树并恢复当前选中。
- 不做：不为渠道子节点增加状态开关，不新增二次确认弹窗。
- 验证：执行下方构建命令；页面手工确认父节点首字头像、子节点 Icon、状态 Badge 和开关点击不触发树选中。当前验证结果：`pnpm.cmd --filter jetlinks-web-core build -- --module-name notice-center-ui` 已通过，页面手工验证待联调环境执行。

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
