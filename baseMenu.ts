import baseMenu from './baseMenu.json'
import p from './package.json'

type MenuItem = {
  children?: MenuItem[]
  options?: Record<string, unknown>
  [key: string]: unknown
}

const handleMenu = (menus: MenuItem[]): MenuItem[] => menus.map(item => ({
  ...item,
  children: item.children ? handleMenu(item.children) : undefined,
  options: { appName: p.id || p.name, ...item.options },
  runtime: true
}))

export default () => {
  return handleMenu(baseMenu)
}
