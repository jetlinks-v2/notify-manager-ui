import { computed, reactive, ref, type Ref } from 'vue'
import { messageNotificationApi, type MessageNotificationApi } from '../../../../../api/notice/messageNotification'
import {
  classifyNotificationFailure, findNotificationChannel, notificationEnumValue, NotificationRequestError,
  type NotificationChannel, type NotificationConfigMetadata, type NotificationLoadState, type NotifierConfig,
} from '../../shared'

/** Keep the backend provider directory, one config snapshot and template schemas in the page scope. */
export function useTemplateCatalog(permitted: Ref<boolean>, channelId: Ref<string>, api: MessageNotificationApi = messageNotificationApi) {
  const channels = ref<NotificationChannel[]>([])
  const catalogState = ref<NotificationLoadState>('idle')
  const allConfigs = ref<NotifierConfig[]>([])
  const snapshotState = ref<NotificationLoadState>('idle')
  const schemas = reactive(new Map<string, NotificationConfigMetadata | undefined>())
  const schemaStates = reactive(new Map<string, NotificationLoadState>())
  const schemaRequests = new Map<string, Promise<void>>()
  let revision = 0
  let configRevision = 0
  let catalogRequest: Promise<void> | undefined
  let configRequest: Promise<void> | undefined
  let catalogAttempted = false
  let configsAttempted = false

  const configs = computed(() => {
    const channel = findNotificationChannel(channelId.value, channels.value)
    return channel ? allConfigs.value.filter(item => notificationEnumValue(item.type) === channel.type
      && notificationEnumValue(item.provider) === channel.provider) : []
  })
  const configState = computed<NotificationLoadState>(() => snapshotState.value === 'ready' || snapshotState.value === 'empty'
    ? configs.value.length ? 'ready' : 'empty' : snapshotState.value)
  const metadata = computed(() => schemas.get(channelId.value))
  const metadataState = computed<NotificationLoadState>(() => schemaStates.get(channelId.value) ?? 'idle')

  /** A directory retry never substitutes the fixed presentation catalog for failed backend reads. */
  function loadCatalog(): Promise<void> {
    if (catalogRequest) return catalogRequest
    if (!permitted.value) { clear(); return Promise.resolve() }
    if (catalogAttempted) return Promise.resolve()
    catalogAttempted = true
    const version = ++revision
    catalogState.value = 'loading'
    const request = (async () => {
      try {
        const types = await api.queryTypes()
        const results = await Promise.allSettled(types.map(async type => ({ type, providers: await api.queryProviders(type.id) })))
        if (version !== revision || !permitted.value) return
        const groups = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
        channels.value = groups.flatMap(({ type, providers }) => providers.map(provider => {
          const id = `${type.id}:${provider.id}`
          const known = findNotificationChannel(id)
          return {
            id, type: type.id, provider: provider.id, labelKey: known?.labelKey ?? '',
            group: known?.group ?? 'integration', secretFields: known?.secretFields ?? [],
            name: type.name === provider.name ? type.name || type.id : `${type.name || type.id} · ${provider.name || provider.id}`,
            typeName: type.name || type.id, providerName: provider.name || provider.id,
            description: provider.description || type.description,
          }
        }))
        // A failed type keeps its error visible without hiding channels from successful sibling types.
        const failure = results.find(result => result.status === 'rejected')
        catalogState.value = failure?.status === 'rejected' ? classifyNotificationFailure(failure.reason)
          : channels.value.length ? 'ready' : 'empty'
      } catch (error) {
        if (version === revision) { channels.value = []; catalogState.value = classifyNotificationFailure(error) }
      }
    })().finally(() => { if (catalogRequest === request) catalogRequest = undefined })
    catalogRequest = request
    return request
  }

  /** Reuse the complete permission-filtered snapshot across channel changes; explicit refresh replaces it. */
  function loadConfigs(force = false): Promise<void> {
    if (!permitted.value) { clear(); return Promise.resolve() }
    if (configRequest) return configRequest
    if (!force && configsAttempted) return Promise.resolve()
    configsAttempted = true
    const version = ++configRevision
    snapshotState.value = 'loading'
    const request = api.queryAllConfigs().then(result => {
      if (version !== configRevision || !permitted.value) return
      allConfigs.value = result
      snapshotState.value = result.length ? 'ready' : 'empty'
    }).catch(error => {
      if (version === configRevision) { allConfigs.value = []; snapshotState.value = classifyNotificationFailure(error) }
    }).finally(() => { if (configRequest === request) configRequest = undefined })
    configRequest = request
    return request
  }

  /** Empty schemas are successful results; failures stay separate from channel/template existence. */
  function loadMetadata(channel: NotificationChannel): Promise<void> {
    if (!permitted.value) return Promise.resolve()
    if (schemas.has(channel.id)) return Promise.resolve()
    const pending = schemaRequests.get(channel.id)
    if (pending) return pending
    const version = revision
    schemaStates.set(channel.id, 'loading')
    const request = api.getTemplateMetadata(channel.type, channel.provider).then(result => {
      if (version !== revision || !permitted.value) return
      schemas.set(channel.id, result)
      schemaStates.set(channel.id, 'ready')
    }).catch(error => {
      if (version === revision) schemaStates.set(channel.id, classifyNotificationFailure(error))
    }).finally(() => { if (schemaRequests.get(channel.id) === request) schemaRequests.delete(channel.id) })
    schemaRequests.set(channel.id, request)
    return request
  }

  /** Invalidate scope-bound snapshots before a revoked permission or component disposal can receive late data. */
  function clear() {
    ++revision; ++configRevision
    catalogRequest = undefined; configRequest = undefined; catalogAttempted = false; configsAttempted = false
    channels.value = []; allConfigs.value = []; schemas.clear(); schemaStates.clear(); schemaRequests.clear()
    catalogState.value = permitted.value ? 'idle' : 'forbidden'
    snapshotState.value = permitted.value ? 'idle' : 'forbidden'
  }

  /** Consumers must not load a default for an unresolved directory or an unknown provider. */
  function requireChannel(id: string): NotificationChannel {
    const channel = findNotificationChannel(id, channels.value)
    if (!channel) throw new NotificationRequestError(catalogState.value === 'forbidden' ? 'forbidden'
      : catalogState.value === 'error' ? 'error' : 'unavailable')
    return channel
  }

  return { channels, catalogState, configs, configState, metadata, metadataState,
    loadCatalog, loadConfigs, loadMetadata, clear, requireChannel }
}
