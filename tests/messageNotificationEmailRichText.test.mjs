import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import test, { after } from 'node:test'
import { transformSync } from 'esbuild'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { renderToString } from 'vue/server-renderer'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '../views/system/MessageNotification/Templates')
const window = new JSDOM('').window
after(() => window.close())

function createLoader(purifier = createDOMPurify(window)) {
  const cache = new Map()
  const dependencies = {
    vue, dompurify: purifier,
    'vue-i18n': { useI18n: () => ({ t: key => key }) },
    '@notify-manager-ui/api/notice-center': {}, '@jetlinks-web/core': { request: {} },
  }
  return function load(filename) {
    if (cache.has(filename)) return cache.get(filename)
    let source = readFileSync(filename, 'utf8')
    if (filename.endsWith('.vue')) source = compileScript(parse(source, { filename }).descriptor, { id: filename, inlineTemplate: true }).content
    const { code } = transformSync(source, { loader: 'ts', format: 'cjs' })
    const module = { exports: {} }
    const imports = name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name]
      if (name.startsWith('.')) {
        let path = resolve(dirname(filename), name)
        if (!/\.(ts|vue)$/.test(path)) path = existsSync(`${path}.ts`) ? `${path}.ts` : resolve(path, 'index.ts')
        return load(path)
      }
      return require(name)
    }
    new Function('require', 'module', 'exports', code)(imports, module, module.exports)
    cache.set(filename, module.exports)
    return module.exports
  }
}

const load = createLoader()
const { toEmailBodyHtml, hasEmailBodyContent, isEmailImageSource, normalizeEmailImageSource, sanitizeEmailPreview } = load(resolve(root, 'definition/emailTemplateContent.ts'))
const { createTemplateDraft, buildTemplatePayload } = load(resolve(root, 'model.ts'))
const { useTemplatePreview } = load(resolve(root, 'hooks/useTemplatePreview.ts'))
const EmailPreview = load(resolve(root, 'components/channels/EmailTemplatePreview.vue')).default

async function renderEmail(preview) {
  const app = vue.createSSRApp({ render: () => vue.h(EmailPreview, { preview }) })
  app.component('AIcon', { setup: () => () => vue.h('span') })
  return renderToString(app)
}

test('legacy email text escapes literal markup and preserves LF, CRLF, CR and blank lines', () => {
  assert.equal(toEmailBodyHtml('设备 <温度> & "告警"\'\r\n第二行\n\n第三行\r结束'),
    '设备 &lt;温度&gt; &amp; &quot;告警&quot;&#39;<br>第二行<br><br>第三行<br>结束')
  assert.equal(toEmailBodyHtml('1 < 2 且 3 > 2'), '1 &lt; 2 且 3 &gt; 2')
})

test('existing email HTML and variable tokens remain unchanged for persistence', () => {
  const html = '<p><strong>${deviceName}</strong></p>\n<p>第二段<br>第三行</p>'
  assert.equal(toEmailBodyHtml(html), html)
  assert.equal(toEmailBodyHtml('<table><tr><td>告警</td></tr></table>'), '<table><tr><td>告警</td></tr></table>')
})

test('rich text required validation rejects empty paragraphs without a browser DOM', () => {
  for (const value of ['', ' \n ', '<p><br></p>', '<p>&nbsp;</p><p> \n </p>', '<p>&#160;&#xA0;\u200b</p>', '<p><!-- placeholder --></p>']) {
    assert.equal(hasEmailBodyContent(value), false, value)
  }
  for (const value of ['告警', '<设备>', '<p>${message}</p>', '<ul><li>告警内容</li></ul>', '<p>&lt;温度&gt;</p>']) {
    assert.equal(hasEmailBodyContent(value), true, value)
  }
  const withoutDom = createLoader(createDOMPurify)(resolve(root, 'definition/emailTemplateContent.ts'))
  assert.equal(withoutDom.toEmailBodyHtml('第一行\n第二行'), '第一行<br>第二行')
  assert.equal(withoutDom.hasEmailBodyContent('<p><br></p>'), false)
  assert.equal(withoutDom.sanitizeEmailPreview('<p onclick="bad()">内容</p>'), '&lt;p onclick=&quot;bad()&quot;&gt;内容&lt;/p&gt;')
})

test('real DOMPurify keeps formatting, safe links and images while removing executable markup', () => {
  const output = sanitizeEmailPreview('<h2>告警</h2><p><strong>严重</strong><em>设备 A</em><u>状态</u><s>旧值</s><br>换行</p>'
    + '<blockquote>说明</blockquote><ul><li>事项</li></ul><pre><code>code</code></pre>'
    + '<a href="https://example.test/detail" title="详情">详情</a><a href="mailto:test@example.test">联系</a>'
    + '<script>attack()</script><style>body{background:url(https://tracker.test/style)}</style>'
    + '<img src="https://files.test/uploaded.png" width="640" height="480" alt="告警截图" title="现场截图" onerror="attack()"><iframe src="https://tracker.test/frame">frame</iframe>'
    + '<svg><script>attack()</script></svg><p style="background:url(https://tracker.test/bg)" onclick="attack()">正文</p>'
    + '<a href="javascript:attack()">危险链接</a><a href="data:text/html,test">数据链接</a>')
  assert.match(output, /<h2>告警<\/h2>/)
  assert.match(output, /<strong>严重<\/strong><em>设备 A<\/em><u>状态<\/u><s>旧值<\/s><br>换行/)
  assert.match(output, /<blockquote>说明<\/blockquote><ul><li>事项<\/li><\/ul>/)
  assert.match(output, /<pre><code>code<\/code><\/pre>/)
  assert.match(output, /href="https:\/\/example.test\/detail"/)
  assert.match(output, /href="mailto:test@example.test"/)
  const container = window.document.createElement('div')
  container.innerHTML = output
  const image = container.querySelector('img')
  assert.equal(image.getAttribute('src'), 'https://files.test/uploaded.png')
  assert.equal(image.getAttribute('width'), '640')
  assert.equal(image.getAttribute('height'), '480')
  assert.equal(image.getAttribute('alt'), '告警截图')
  assert.equal(image.getAttribute('title'), '现场截图')
  assert.match(output, /<a>危险链接<\/a><a>数据链接<\/a>/)
  assert.doesNotMatch(output, /script|style=|onclick|onerror|<style|<iframe|<svg|tracker\.test|javascript:|data:/i)
})

test('email preview renders formatting and sanitizes substituted variable values last', async () => {
  const draft = createTemplateDraft({ id: 'stored', name: '邮件', type: 'email', provider: 'embedded',
    template: { subject: '<b>主题</b>', text: '<p>设备：<strong>${name}</strong></p><p>${payload}</p>',
      attachments: [{ name: '<img src=x onerror=attack()>.txt', location: 'file://attachment' }] },
    variableDefinitions: [
      { id: 'name', name: '设备名称', defaultValue: '设备 A' },
      { id: 'payload', name: '消息内容', defaultValue: '<img src="javascript:attack()" onerror="attack()"><script>attack()</script><a href="javascript:attack()">变量内容</a>' },
    ] })
  const scope = vue.effectScope()
  const preview = scope.run(() => useTemplatePreview({ draft }))
  const html = await renderEmail(preview)
  assert.match(html, /<p>设备：<strong>设备 A<\/strong><\/p><p><a>变量内容<\/a><\/p>/)
  assert.match(html, /&lt;b&gt;主题&lt;\/b&gt;/)
  assert.match(html, /&lt;img src=x onerror=attack\(\)&gt;\.txt/)
  assert.doesNotMatch(html, /<script|<img|href="javascript:|tracker\.test/)
  assert.equal(draft.text, '<p>设备：<strong>${name}</strong></p><p>${payload}</p>')
  scope.stop()
})

test('image sources accept uploaded HTTP URLs, same-origin paths and real template variables only', () => {
  for (const value of ['https://files.test/uploaded.png', 'http://files.test/photo.jpg?token=read', '/file/static/one.png',
    '${detail.imageUrl}', 'https://files.test/${detail.fileId}.png', 'https://${detail.cdnHost}/photo.png', '/file/${detail.fileId}/image']) {
    assert.equal(isEmailImageSource(value), true, value)
  }
  for (const value of ['', 'data:image/png;base64,AAAA', 'data:image/svg+xml,<svg/>', 'blob:https://files.test/id',
    'javascript:attack()', 'file:///private/image.png', 'svg:photo', '//outside.test/photo.png', '/\\outside.test/photo.png',
    'photo.png', 'https://files.test/photo.svg', '/file/photo.SVG?token=read', 'https://files.test/photo.%73vg',
    '${scheme}://outside.test/photo.png', '${baseUrl}/photo.png', '${}', '${detail. imageUrl}', '${nested${value}}']) {
    assert.equal(isEmailImageSource(value), false, value)
  }
  assert.equal(isEmailImageSource('${detail.imageUrl}', false), false)
  assert.equal(isEmailImageSource('https://files.test/${detail.fileId}.png', false), false)
  assert.equal(isEmailImageSource('/file/one.png', false), true)
})

test('new image sources normalize root paths and HTTP schemes without encoding template variables', () => {
  assert.equal(normalizeEmailImageSource('/file/uploaded.png?accessKey=read', 'https://console.example/workspace/'),
    'https://console.example/file/uploaded.png?accessKey=read')
  assert.equal(normalizeEmailImageSource('/file/${detail.fileId}.png?key=${detail.accessKey}', 'http://localhost:9200/'),
    'http://localhost:9200/file/${detail.fileId}.png?key=${detail.accessKey}')
  assert.equal(normalizeEmailImageSource('HTTPS://files.example/${detail.fileId}.png', 'https://console.example'),
    'https://files.example/${detail.fileId}.png')
  assert.equal(normalizeEmailImageSource('HTTP://files.example/uploaded.png', 'https://console.example'), 'http://files.example/uploaded.png')
  assert.equal(normalizeEmailImageSource('${detail.imageUrl}', 'https://console.example'), '${detail.imageUrl}')
  assert.equal(normalizeEmailImageSource('//files.example/image.png', 'https://console.example'), '')
  assert.equal(normalizeEmailImageSource('/file/image.png', 'file:///private/'), '')
})

test('image-only bodies are valid and saving preserves original image variable tokens', () => {
  for (const value of ['<p><img src="https://files.test/one.png"></p>', '<img src="/file/one.png">',
    '<p><img src="${detail.imageUrl}"></p>', '<img src="https://files.test/${detail.fileId}.png">']) {
    assert.equal(hasEmailBodyContent(value), true, value)
    const draft = createTemplateDraft({ id: 'stored', name: '图片邮件', type: 'email', provider: 'embedded',
      template: { subject: '现场截图', text: value } })
    assert.equal(buildTemplatePayload(draft).template.text, value)
  }
  for (const value of ['<img>', '<img alt="截图">', '<img alt=\'src="https://files.test/one.png"\'>',
    '<img src="javascript:attack()">', '<img alt=" > " src="javascript:attack()">', '<img src="https://files.test/one.svg">',
    '<img src="data:image/png;base64,AAAA">', '<img src="//outside.test/one.png">',
    '<img src="${scheme}://outside.test/one.png">', '<!-- <img src="https://files.test/one.png"> -->',
    '<script><img src="https://files.test/one.png"></script>']) {
    assert.equal(hasEmailBodyContent(value), false, value)
  }
})

test('image preview resolves variables before sanitizing and never renders unresolved or unsafe sources', async () => {
  const original = '<p><img src="${detail.imageUrl}" alt="现场截图"></p><p><img src="/file/${detail.fileId}.png"></p>'
  const draft = vue.reactive(createTemplateDraft({ id: 'stored', name: '图片邮件', type: 'email', provider: 'embedded',
    template: { subject: '现场截图', text: original }, variableDefinitions: [
      { id: 'detail.imageUrl', name: '截图', defaultValue: 'https://files.test/uploaded.png' },
      { id: 'detail.fileId', name: '文件', defaultValue: 'file-1' },
    ] }))
  const scope = vue.effectScope()
  const preview = scope.run(() => useTemplatePreview({ draft }))
  const html = await renderEmail(preview)
  assert.match(html, /<img src="https:\/\/files.test\/uploaded.png" alt="现场截图">/)
  assert.match(html, /<img src="\/file\/file-1.png">/)
  assert.equal(draft.text, original)
  assert.equal(buildTemplatePayload(draft).template.text, original)
  draft.variables[0].defaultValue = 'javascript:attack()'
  draft.variables[1].defaultValue = '${stillUnknown}'
  assert.doesNotMatch(await renderEmail(preview), /<img|javascript:|stillUnknown/)
  const unresolved = sanitizeEmailPreview('<p><img src="${unknown}"></p><img src="/file/${unknown}.png">')
  assert.doesNotMatch(unresolved, /<img|\$\{/)
  for (const value of ['data:image/png;base64,AAAA', 'blob:https://files.test/id', 'file:///image.png',
    '//outside.test/one.png', '/\\outside.test/one.png', 'https://files.test/one.svg']) {
    assert.doesNotMatch(sanitizeEmailPreview(`<img src="${value}">`), /<img/)
  }
  scope.stop()
})

test('real Quill semantic HTML keeps ordered, bullet and checklist meaning without general data attributes', async () => {
  const globals = ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'Text', 'DOMParser', 'MutationObserver']
  const previous = new Map(globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  try {
    for (const name of globals) Object.defineProperty(globalThis, name, { value: name === 'window' ? window : window[name], configurable: true })
    const { default: Quill } = await import('quill')
    const container = window.document.createElement('div')
    window.document.body.append(container)
    const editor = new Quill(container)
    editor.setContents([
      { insert: '有序事项' }, { insert: '\n', attributes: { list: 'ordered' } },
      { insert: '无序事项' }, { insert: '\n', attributes: { list: 'bullet' } },
      { insert: '完成事项' }, { insert: '\n', attributes: { list: 'checked' } },
      { insert: '待办事项' }, { insert: '\n', attributes: { list: 'unchecked' } },
    ])
    const semantic = editor.getSemanticHTML()
    assert.equal(semantic, '<ol><li>有序事项</li></ol><ul><li>无序事项</li></ul><ul><li data-list="checked">完成事项</li></ul><ul><li data-list="unchecked">待办事项</li></ul>')
    assert.equal(sanitizeEmailPreview(semantic), semantic)
    assert.equal(sanitizeEmailPreview('<ul data-list="checked"><li data-list="invented" data-private="x">事项</li></ul>'), '<ul><li>事项</li></ul>')
    editor.scroll.observer.disconnect()
    container.remove()
  } finally {
    for (const name of globals) {
      const descriptor = previous.get(name)
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  }
  const source = readFileSync(resolve(root, 'components/channels/EmailTemplatePreview.vue'), 'utf8')
  assert.match(source, /:deep\(img\)\s*\{[^}]*max-width:\s*100%;[^}]*height:\s*auto/)
  assert.match(source, /data-list='checked'/)
  assert.match(source, /data-list='unchecked'/)
})

test('email preview preserves saved plain text line breaks and follows draft edits', async () => {
  const draft = vue.reactive(createTemplateDraft({ id: 'stored', name: '邮件', type: 'email', provider: 'embedded',
    template: { subject: '告警', text: '第一行\r\n第二行\n\n第三行' } }))
  const scope = vue.effectScope()
  const preview = scope.run(() => useTemplatePreview({ draft }))
  assert.match(await renderEmail(preview), /第一行<br>第二行<br><br>第三行/)
  draft.text = '<p>更新后的<strong>正文</strong></p>'
  assert.match(await renderEmail(preview), /<p>更新后的<strong>正文<\/strong><\/p>/)
  scope.stop()
})
