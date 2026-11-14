import { getModuleRoutesMap } from '@jetlinks-web/utils'
import { moduleRegistry } from '@jetlinks-web-core/utils/module-registry'
import registerSetting from './register'
import { name } from './package.json'

const routerModules = import.meta.glob('./views/**/index.vue')

const getAsyncRoutesMap = () => getModuleRoutesMap(routerModules)

const getExtraRoutesMap = () => ({})

const getComponents = () => ({})

const getCoreRouteOverrides = () => []

// 与产品列表一致，由项目布局提供唯一的内容面板。
const getContentPanelOverrides = () => ({})

const register = () => {
  moduleRegistry.register(name, registerSetting)
}

export default {
  getAsyncRoutesMap,
  getExtraRoutesMap,
  getComponents,
  getCoreRouteOverrides,
  getContentPanelOverrides,
  register
}
