const routerModules = import.meta.glob('./views/**/index.vue')
import i18n from "@/locales";

const getAsyncRoutesMap = () => {
    const modules = {}
    Object.keys(routerModules).forEach(item => {
        const code = item.replace('./views/', '').replace('/index.vue', '')
        const key = `notice/${code}`
        modules[key] = routerModules[item]
    })

    return modules
}

const getExtraRoutesMap = () => {
    return {
        'notice/Config': {
            children: [
                {
                    code: 'Detail',
                    url: '/Detail/:id',
                    name: i18n.global.t('notify-manager-ui.index.301452-0'),
                    component: () => import('./views/Config/Detail/index.vue')
                }
            ]
        },
        'notice/Template': {
            children: [
                {
                    code: 'Detail',
                    url: '/Detail/:id',
                    name: i18n.global.t('notify-manager-ui.index.301452-0'),
                    component: () => import('./views/Template/Detail/index.vue')
                }
            ]
        }
    }
}

export default {
    getAsyncRoutesMap,
    getExtraRoutesMap
}
