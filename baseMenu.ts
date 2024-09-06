export default [
    {
        code: 'iot',
        name: '物联网',
        owner: 'iot',
        id: '9c21f88182e7cc75cbdfa8e4b7844272',
        url: '/iot',
        icon: 'icon-wulianwang',
        sortIndex: 1,
        permissions: [],
        children: [
            {
                code: 'notice',
                name: '通知管理',
                owner: 'iot',
                //parentId: '1',
                id: 'b27e972543cdc5da5730b6d4b9b537b1',
                url: '/iot/notice',
                icon: 'icon-tongzhiguanli',
                sortIndex: 2,
                showPage: ['template', 'notifier'],
                permissions: [],
                children: [
                    {
                        code: 'notice/Config',
                        name: '通知配置',
                        owner: 'iot',
                        //parentId: '1',
                        id: '09bcab0a6a1f0796075254a453139287',
                        url: '/iot/notice/Config',
                        icon: 'icon-tongzhiguanli',
                        sortIndex: 1,
                        showPage: ['notifier'],
                        permissions: [{ permission: 'notifier', actions: ['query', 'save', 'delete', 'send'] }],
                        buttons: [
                            {
                                id: 'bind',
                                name: '同步用户',
                                permissions: [
                                    {
                                        permission: 'add',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'notifier',
                                        actions: ['save'],
                                    },
                                    {
                                        permission: 'user-third-party-manager',
                                        actions: ['query', 'save'],
                                    },
                                    {
                                        permission: 'user',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'view',
                                name: '查看',
                                permissions: [
                                    {
                                        permission: 'notifier',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'log',
                                name: '通知记录',
                                permissions: [
                                    {
                                        permission: 'notifier',
                                        actions: ['query'],
                                    },
                                    // {
                                    //   permission: 'template',
                                    //   actions: ['query'],
                                    // },
                                ],
                            },
                            {
                                id: 'debug',
                                name: '调试',
                                permissions: [
                                    {
                                        permission: 'add',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'notifier',
                                        actions: ['query', 'send'],
                                    },
                                    {
                                        permission: 'template',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'export',
                                name: '导出',
                                permissions: [
                                    {
                                        permission: 'notifier',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'import',
                                name: '导入',
                                permissions: [
                                    {
                                        permission: 'notifier',
                                        actions: ['query', 'save'],
                                    },
                                ],
                            },
                            {
                                id: 'delete',
                                name: '删除',
                                permissions: [
                                    {
                                        permission: 'notifier',
                                        actions: ['query', 'delete'],
                                    },
                                ],
                            },
                            {
                                id: 'update',
                                name: '编辑',
                                permissions: [
                                    {
                                        permission: 'notifier',
                                        actions: ['query', 'save'],
                                    },
                                ],
                            },
                            {
                                id: 'add',
                                name: '新增',
                                permissions: [
                                    {
                                        permission: 'notifier',
                                        actions: ['query', 'save'],
                                    },
                                ],
                            },
                        ],
                        accessSupport: { text: "支持", value: "support" },
                        supportDataAccess: true,
                        assetType: 'notifyConfig'
                    },
                    {
                        code: 'notice/Template',
                        name: '通知模板',
                        owner: 'iot',
                        //parentId: '1',
                        id: '705b82c807fa18360bf62a2b35f454e9',
                        url: '/iot/notice/Template',
                        icon: 'icon-tongzhiguanli',
                        sortIndex: 2,
                        showPage: ['template'],
                        permissions: [
                            {
                                permission: 'template',
                                actions: ['query'],
                            },
                            {
                                permission: 'notifier',
                                actions: ['query', 'send'],
                            },
                        ],
                        buttons: [
                            {
                                id: 'view',
                                name: '查看',
                                permissions: [
                                    {
                                        permission: 'template',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'log',
                                name: '通知记录',
                                permissions: [
                                    {
                                        permission: 'template',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'debug',
                                name: '调试',
                                permissions: [
                                    {
                                        permission: 'notifier',
                                        actions: ['query', 'send'],
                                    },
                                    {
                                        permission: 'template',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'add',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'export',
                                name: '导出',
                                permissions: [
                                    {
                                        permission: 'template',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'import',
                                name: '导入',
                                permissions: [
                                    {
                                        permission: 'template',
                                        actions: ['query', 'save'],
                                    },
                                ],
                            },
                            {
                                id: 'delete',
                                name: '删除',
                                permissions: [
                                    {
                                        permission: 'template',
                                        actions: ['query', 'delete'],
                                    },
                                ],
                            },
                            {
                                id: 'update',
                                name: '编辑',
                                permissions: [
                                    {
                                        permission: 'notifier',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'template',
                                        actions: ['save'],
                                    },
                                ],
                            },
                            {
                                id: 'add',
                                name: '新增',
                                permissions: [
                                    {
                                        permission: 'notifier',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'template',
                                        actions: ['save'],
                                    },
                                ],
                            },
                        ],
                        accessSupport: { text: "支持", value: "support" },
                        assetType: 'notifyTemplate',
                        supportDataAccess: true
                    },
                ],
            },
        ],
    },
]
