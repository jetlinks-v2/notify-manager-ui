const routerModules = import.meta.glob('./views/**/index.vue')


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
                    name: '详情信息',
                    component: () => import('./views/Config/Detail/index.vue')
                }
            ]
        },
        'notice/Template': {
            children: [
                {
                    code: 'Detail',
                    url: '/Detail/:id',
                    name: '详情信息',
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
