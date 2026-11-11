import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { transformSync } from 'esbuild'
import { createServer } from 'vite'
import * as vue from 'vue'
import { parse } from 'vue/compiler-sfc'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const ui = resolve(root, '../..')
const core = resolve(ui, 'jetlinks-web-core/src')
const utilityPath = require.resolve('@jetlinks-web/utils')
const calls = []
const cache = new Map()
const dependencies = {
  vue,
  '@jetlinks-web/core': { request: new Proxy({}, { get: (_, method) => (...args) => { calls.push([method, ...args]); throw new Error('Unexpected platform I/O') } }) },
  '@jetlinks-web-core/utils/module-registry': { moduleRegistry: { register: (...args) => calls.push(['register', ...args]) } },
  '@jetlinks-web-core/router': {},
  // Keep unrelated announcement menus in the local runtime context without loading request/storage I/O.
  '@jetlinks-web-core/utils/project-runtime': { isProjectRuntime: () => true },
  '@jetlinks-web-core/utils/request-context': { isFromCloud: () => false },
  'ant-design-vue': { message: {} },
  'jsencrypt/bin/jsencrypt.min.js': { __esModule: true, default: function UnusedEncryption() {} },
  'pubsub-js': { __esModule: true, default: {} },
  '@vueuse/core': { isClient: false, isIOS: false },
}
const storage = { getItem: () => null }
const translated = { global: { t: key => key } }

function evaluate(source, filename) {
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', define: { 'import.meta.env': '{}' } })
  const module = { exports: {} }
  const imports = name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    if (name === '@jetlinks-web/utils') return load(utilityPath)
    if (name === '@jetlinks-web-core/locales' || name.endsWith('/locales/index.ts')) return { __esModule: true, default: translated }
    if (name.endsWith('/utils/module-registry.ts')) return dependencies['@jetlinks-web-core/utils/module-registry']
    if (name === './register' || name === '/register.ts') return { __esModule: true, default: {} }
    if (/Announcement\/register(?:\.ts)?$/.test(name)) return { getRegisterComponents: () => ({}) }
    if (name.endsWith('.less')) return {}
    if (name.endsWith('/menuBadge') || name.endsWith('/menuBadge.ts')) return { isComingSoonMenuMeta: () => false }
    if (name.endsWith('/menuLocale') || name.endsWith('/menuLocale.ts')) return { getMenuLocaleText: item => item.name }
    if (name === '@jetlinks-web-core/utils/consts') return { langKey: 'language', isSubApp: false, OpenMicroApp: false, USER_CENTER_MENU_CODE: 'account/center' }
    if (name.startsWith('@jetlinks-web-core/')) return load(resolve(core, `${name.slice('@jetlinks-web-core/'.length)}.ts`))
    if (name.startsWith('.') || name.startsWith('/')) {
      let path = name.startsWith('/@fs/') ? name.slice(4) : name.startsWith('/') ? resolve(root, name.slice(1)) : resolve(dirname(filename), name)
      path = path.replace(/\?import$/, '')
      // Isolate unrelated modules' registrations and menus while executing this module and the real core assembly.
      if (/\/modules\/[^/]+\/index\.ts$/.test(path)) {
        return { default: path === resolve(root, 'index.ts') ? moduleDefinition : { priority: path.includes('/authentication-manager-ui/') ? -100 : 0 } }
      }
      if (/\/modules\/[^/]+\/baseMenu\.ts$/.test(path) && path !== resolve(root, 'baseMenu.ts') && !path.includes('/authentication-manager-ui/')) return { default: () => [] }
      if (!/\.(?:ts|mjs|json)$/.test(path)) path = existsSync(`${path}.ts`) ? `${path}.ts` : resolve(path, 'index.ts')
      return load(path)
    }
    return createRequire(filename)(name)
  }
  new Function('require', 'module', 'exports', 'localStorage', 'navigator', 'console', code)(imports, module, module.exports, storage, { language: 'en' }, { log() {} })
  return module.exports
}
function load(filename) {
  if (cache.has(filename)) return cache.get(filename)
  const value = filename.endsWith('.json') ? JSON.parse(readFileSync(filename, 'utf8')) : evaluate(readFileSync(filename, 'utf8'), filename)
  cache.set(filename, value)
  return value
}
const definition = load(resolve(root, 'baseMenu.ts')).default
const shared = load(resolve(root, 'views/system/MessageNotification/shared/index.ts'))
const { handleAuthMenu } = load(resolve(core, 'utils/menuMeta.ts'))
const { handleMenus } = load(resolve(core, 'utils/menu.ts'))
const { channelConfigFields } = load(resolve(root, 'views/system/MessageNotification/Channels/channelSchema.ts'))
const find = (code, menus) => menus.flatMap(menu => [menu, ...flatten(menu.children || [])]).find(menu => menu.code === code)
const flatten = menus => menus.flatMap(menu => [menu, ...flatten(menu.children || [])])
const cloneMenuTree = menus => menus.map(menu => ({ ...menu, buttons: menu.buttons?.map(button => ({ ...button })), children: menu.children ? cloneMenuTree(menu.children) : menu.children }))
const backendActions = permissions => [...new Set(permissions.flatMap(({ permission, actions }) => actions.map(action => `${permission}:${action}`)))].sort()
const notificationCode = page => `system/MessageNotification/${page}`

// Vite performs the production import.meta.glob transform. Unrelated registration and I/O stay inert.
const server = await createServer({
  configFile: false, root, logLevel: 'silent',
  resolve: { alias: { '@jetlinks-web-core': core } },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, preTransformRequests: false, watch: null, fs: { allow: [ui] } },
})
let moduleDefinition
let assembledMenus
try {
  const transformed = await server.transformRequest('/index.ts')
  assert.ok(transformed)
  assert.ok(!transformed.code.includes('import.meta.glob'))
  moduleDefinition = evaluate(transformed.code, resolve(root, 'index.ts')).default
  const moduleLoader = await server.transformRequest(`/@fs${resolve(core, 'utils/modules.ts')}`)
  assert.ok(moduleLoader)
  assert.ok(!moduleLoader.code.includes('import.meta.glob'))
  assert.ok(moduleLoader.code.includes('/notify-manager-ui/index.ts'))
  assert.ok(moduleLoader.code.includes('/notify-manager-ui/baseMenu.ts'))
  dependencies['@jetlinks-web-core/utils/modules'] = evaluate(moduleLoader.code, resolve(core, 'utils/modules.ts'))
  assembledMenus = load(resolve(core, 'views/init-home/data/index.ts')).default()
} finally { await server.close() }

test('real baseMenu transformation exposes one independent iot group with notify-manager module identity', () => {
  const menus = definition()
  const group = find('system/MessageNotification', menus)
  assert.ok(find('system', menus).children.includes(group))
  assert.equal(group.owner, 'iot')
  assert.equal(group.children.length, 3)
  assert.deepEqual(group.permissions, [])
  const modulePackage = load(resolve(root, 'package.json'))
  const packageName = modulePackage.id || modulePackage.name
  for (const menu of [group, ...group.children]) {
    assert.equal(menu.runtime, true)
    assert.equal(menu.owner, 'iot')
    assert.equal(menu.options.appName, packageName)
    for (const language of ['zh', 'en', 'ja']) assert.ok(menu.i18nMessages.name[language])
  }
  for (const permissions of Object.values(shared.notificationPermissions)) {
    const [code] = permissions.query.split(':')
    const menu = find(code, menus)
    assert.ok(menu)
    assert.deepEqual(menu.buttons.map(button => `${menu.code}:${button.id}`).sort(), Object.values(permissions).sort())
  }
})

test('verified notifier and template backend declarations keep read, save, delete and send actions separate', () => {
  const expected = {
    Channels: {
      showPage: ['notifier'], page: ['notifier:query'],
      buttons: {
        query: ['notifier:query'],
        add: ['notifier:query', 'notifier:save'],
        update: ['notifier:query', 'notifier:save'],
        delete: ['notifier:delete', 'notifier:query'],
        action: ['notifier:query', 'notifier:send', 'template:query'],
      },
    },
    Templates: {
      showPage: ['template'], page: ['notifier:query', 'template:query'],
      buttons: {
        query: ['notifier:query', 'template:query'],
        add: ['notifier:query', 'template:query', 'template:save'],
        update: ['notifier:query', 'template:query', 'template:save'],
        delete: ['notifier:query', 'template:delete', 'template:query'],
        action: ['notifier:query', 'notifier:send', 'template:query'],
      },
    },
    Records: {
      showPage: ['notifier'], page: ['notifier:query'],
      buttons: { query: ['notifier:query'] },
    },
  }
  for (const [page, contract] of Object.entries(expected)) {
    const menu = find(notificationCode(page), definition())
    assert.deepEqual(menu.showPage, contract.showPage)
    assert.deepEqual(backendActions(menu.permissions), contract.page)
    assert.deepEqual(Object.fromEntries(menu.buttons.map(button => [button.id, backendActions(button.permissions)])), contract.buttons)
    assert.ok(menu.permissions.every(({ actions }) => actions.every(action => action === 'query')))
    assert.ok([menu, ...menu.buttons].every(({ permissions }) => permissions.every(({ permission }) => ['notifier', 'template'].includes(permission))))
  }
  assert.equal(shared.notificationCapabilities.history.query, true)
  assert.deepEqual(calls, [])
})

test('selected read, edit and trial menu declarations preserve frontend action IDs without extra backend mutations', () => {
  const selected = (page, actions) => {
    const menu = structuredClone(find(notificationCode(page), definition()))
    menu.buttons = menu.buttons.filter(button => actions.includes(button.id))
    let frontend
    handleAuthMenu([menu], (code, ids) => { frontend = ids.map(id => `${code}:${id}`).sort() })
    return { frontend, backend: backendActions([...menu.permissions, ...menu.buttons.flatMap(button => button.permissions)]) }
  }
  const cases = [
    ['Channels', ['query'], ['notifier:query']],
    ['Templates', ['query'], ['notifier:query', 'template:query']],
    ['Records', ['query'], ['notifier:query']],
    ['Channels', ['query', 'update'], ['notifier:query', 'notifier:save']],
    ['Templates', ['query', 'update'], ['notifier:query', 'template:query', 'template:save']],
    ['Channels', ['query', 'action'], ['notifier:query', 'notifier:send', 'template:query']],
  ]
  for (const [page, actions, backend] of cases) {
    assert.deepEqual(selected(page, actions), {
      frontend: actions.map(action => `${notificationCode(page)}:${action}`).sort(), backend,
    })
  }
  assert.deepEqual(calls, [])
})

test('core generates menu button permissions from the same action IDs without enabling history mutations', () => {
  const permissions = {}
  handleAuthMenu(definition(), (code, actions) => { permissions[code] = actions.map(action => `${code}:${action}`) })
  for (const value of Object.values(shared.notificationPermissions)) {
    const [code] = value.query.split(':')
    assert.deepEqual(permissions[code].sort(), Object.values(value).sort())
  }
  assert.deepEqual(permissions['system/MessageNotification/Records'], ['system/MessageNotification/Records:query'])
  assert.deepEqual(calls, [])
})

test('the actual Vite route glob finds all new pages and keeps the existing subscription pages and registration', () => {
  const routes = moduleDefinition.getAsyncRoutesMap()
  for (const code of ['Channels', 'Templates', 'Records'].map(page => `system/MessageNotification/${page}`)) {
    assert.equal(typeof routes[code], 'function')
    assert.equal(moduleDefinition.getContentPanelOverrides()[code], undefined)
    assert.ok(find(code, definition()))
  }
  for (const code of ['notice/template', 'notice/channel']) assert.equal(typeof routes[code], 'function')
  assert.equal(typeof moduleDefinition.register, 'function')
  assert.deepEqual(calls, [])
})

test('real core module glob and BaseMenuData aggregation retain the system parent and entire existing Notify menu tree', () => {
  const menus = definition()
  const system = find('system', assembledMenus)
  const group = find('system/MessageNotification', assembledMenus)
  const authenticationMenus = load(resolve(ui, 'modules/authentication-manager-ui/baseMenu.ts')).default()
  assert.equal(system.id, find('system', authenticationMenus).id)
  assert.equal(system.name, find('system', authenticationMenus).name)
  assert.ok(system.children.includes(group))
  assert.equal(group.owner, 'iot')
  assert.equal(group.children.length, 3)
  const normalized = ({ children, ...item }) => ({ ...item, ...(children?.length ? { children: children.map(normalized) } : {}) })
  assert.deepEqual(normalized(find('alarm-center', assembledMenus)), normalized(find('alarm-center', menus)))
  assert.ok(find('Notify', assembledMenus))
  for (const code of ['notice/template', 'notice/channel']) {
    const before = find(code, menus)
    const after = find(code, assembledMenus)
    assert.deepEqual(after.permissions, before.permissions)
    assert.deepEqual(after.assetTypes, before.assetTypes)
  }
  assert.deepEqual(calls, [])
})

test('actual core route generation connects all three runtime pages and their exact authButtons', () => {
  const routes = moduleDefinition.getAsyncRoutesMap()
  const result = handleMenus(assembledMenus, moduleDefinition.getExtraRoutesMap(), routes)
  for (const actions of Object.values(shared.notificationPermissions)) {
    const [code] = actions.query.split(':')
    const menu = find(code, assembledMenus)
    const route = flatten(result.menuRoutes).find(item => item.name === code)
    assert.ok(route)
    assert.equal(route.path, menu.url)
    assert.equal(typeof route.component, 'function')
    assert.equal(result.menuMap.get(code).path, menu.url)
    assert.deepEqual(result.authButtons[code].sort(), Object.values(actions).map(value => value.split(':').at(-1)).sort())
  }
  assert.deepEqual(result.authButtons['system/MessageNotification/Records'], ['query'])
  assert.deepEqual(calls, [])
})

test('the actual initialization filter follows resource availability for none, notifier, template and both resources', () => {
  // Execute the owning SFC's pure filter without mounting or invoking its initialization code.
  const filename = resolve(core, 'views/init-home/Menu/index.vue')
  const source = parse(readFileSync(filename, 'utf8'), { filename }).descriptor.scriptSetup.content
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const statement = ast.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === 'filterMenuByPermission'))
  assert.ok(statement)
  const { filterMenuByPermission } = evaluate(`export ${statement.getText(ast)}`, filename)
  const group = find('system/MessageNotification', assembledMenus)
  for (const resources of [[], ['unrelated-policy']]) assert.equal(find('system/MessageNotification', filterMenuByPermission(resources, cloneMenuTree(assembledMenus), true)), undefined)
  for (const [resources, pages] of [
    [['notifier'], ['Channels', 'Records']],
    [['template'], ['Templates']],
    [['notifier', 'template'], ['Channels', 'Templates', 'Records']],
  ]) {
    const allowed = filterMenuByPermission(resources, [structuredClone(group)], true)
    assert.equal(allowed.length, 1)
    assert.equal(allowed[0].owner, 'iot')
    assert.deepEqual(allowed[0].children.map(menu => menu.code), pages.map(notificationCode))
    for (const menu of allowed[0].children) {
      const source = find(menu.code, definition())
      assert.deepEqual(menu.buttons, source.buttons)
      assert.deepEqual(menu.permissions, source.permissions)
    }
  }
  // This core filter uses resource IDs, including any-match button checks. It does not authorize individual actions or require every dependency.
  const templateOnly = filterMenuByPermission(['template'], [structuredClone(group)], true)[0].children[0]
  assert.ok(templateOnly.permissions.some(({ permission }) => permission === 'notifier'))
  assert.ok(templateOnly.buttons.find(button => button.id === 'action').permissions.some(({ permission, actions }) => permission === 'notifier' && actions.includes('send')))
  assert.deepEqual(calls, [])
})

test('all three locales resolve literal and catalog-driven page keys through the actual runtime i18n', () => {
  const languages = ['zh', 'en', 'ja']
  const locales = Object.fromEntries(languages.map(language => [language, load(resolve(root, `locales/lang/${language}.json`))]))
  const keys = language => Object.keys(locales[language]).filter(key => key.startsWith('messageNotification.')).sort()
  assert.deepEqual(keys('en'), keys('zh'))
  assert.deepEqual(keys('ja'), keys('zh'))
  const required = new Set()
  const directory = resolve(root, 'views/system/MessageNotification')
  for (const path of readdirSync(directory, { recursive: true }).filter(path => /\.(?:vue|ts)$/.test(path))) {
    for (const match of readFileSync(resolve(directory, path), 'utf8').matchAll(/['"](messageNotification\.[\w.]+)['"]/g)) if (!match[1].endsWith('.')) required.add(match[1])
  }
  for (const channel of shared.notificationChannels) {
    required.add(channel.labelKey)
    required.add(`messageNotification.channels.help.${channel.type}`)
    required.add(`messageNotification.channels.groups.${channel.group}`)
    required.add(`messageNotification.records.type.${channel.type}`)
  }
  for (const fields of Object.values(channelConfigFields)) for (const field of fields) required.add(`messageNotification.channels.fields.${field.key}`)
  for (const state of shared.notificationStates) required.add(`messageNotification.records.state.${state}`)
  for (const state of ['unavailable', 'forbidden', 'error']) {
    required.add(`messageNotification.state.${state}`)
    required.add(`messageNotification.records.feedback.${state}`)
    required.add(`messageNotification.records.feedback.${state}Description`)
  }
  const { createRuntimeI18n } = load(resolve(core, 'locales/create.ts'))
  const i18n = createRuntimeI18n(Object.fromEntries(languages.map(language => [`./lang/${language}.json`, { default: locales[language] }])))
  for (const language of languages) {
    i18n.global.locale.value = language
    for (const key of required) assert.ok(Object.hasOwn(locales[language], key), `${language}: ${key}`)
    for (const key of keys(language)) assert.notEqual(i18n.global.t(key, { fields: 'required', name: 'Example', page: 2 }), key)
  }
})

test('channel-to-template navigation resolves an installed route and preserves actual identifiers and filters', () => {
  const target = shared.notificationNavigationTarget('templates', { channel: 'email:embedded', configId: 'smtp/custom', templateId: 'template-one' })
  const routes = moduleDefinition.getAsyncRoutesMap()
  assert.equal(typeof routes[target.name], 'function')
  assert.ok(find(target.name, definition()))
  const query = shared.notificationQuery({ channel: 'email:embedded', configId: 'smtp/custom', templateId: 'template-one' }, { q: 'existing-filter', projectId: 'current-project' })
  assert.equal(query.configId, 'smtp/custom')
  assert.equal(query.templateId, 'template-one')
  assert.equal(query.q, 'existing-filter')
  assert.equal(query.projectId, 'current-project')
  assert.deepEqual(calls, [])
})
