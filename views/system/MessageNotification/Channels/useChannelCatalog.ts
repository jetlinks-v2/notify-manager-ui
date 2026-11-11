import { computed, reactive, ref, shallowRef, type Ref } from 'vue'
import { messageNotificationApi, type MessageNotificationApi } from '../../../../api/notice/messageNotification'
import {
  classifyNotificationFailure, findNotificationChannel, notificationEnumValue,
  type NotificationChannel, type NotificationConfigMetadata, type NotificationLoadState,
  type NotificationProvider, type NotifierConfig,
} from '../shared'
import { channelDefinition, type ChannelDefinition } from './configuration/channelMetadata'

/** Page-scoped backend catalog. Partial provider failures and failed config queries stay explicit. */
export function useChannelCatalog(permitted: Ref<boolean>, api: MessageNotificationApi = messageNotificationApi) {
  const types = shallowRef<NotificationProvider[]>([])
  const providers = reactive(new Map<string, NotificationProvider[]>())
  const providerStates = reactive(new Map<string, NotificationLoadState>())
  const state = ref<NotificationLoadState>('idle')
  const configs = shallowRef<NotifierConfig[]>([])
  const configState = ref<NotificationLoadState>('idle')
  const metadata = reactive(new Map<string, NotificationConfigMetadata>())
  const pendingMetadata = new Map<string, Promise<ChannelDefinition>>()
  let revision = 0
  let configRevision = 0
  let configRequest: Promise<NotifierConfig[]> | undefined

  const channels = computed<NotificationChannel[]>(() => types.value.flatMap(type => (providers.get(type.id) ?? []).map(provider => {
    const id = `${type.id}:${provider.id}`
    const known = findNotificationChannel(id)
    return {
      id, type: type.id, provider: provider.id,
      labelKey: known?.labelKey ?? '', group: known?.group ?? 'integration',
      secretFields: known?.secretFields ?? [],
      multipleConfigurations: known?.multipleConfigurations,
      typeName: type.name || type.id, providerName: provider.name || provider.id,
      name: type.name === provider.name ? type.name || type.id : `${type.name || type.id} · ${provider.name || provider.id}`,
      // Metadata updates must not rebuild navigation while a channel switch is still resolving.
      description: provider.description || type.description,
    }
  })))

  /** Reuse one batch read for tree statuses and the active provider; a rejection never becomes []. */
  function loadConfigs(force = false): Promise<NotifierConfig[]> {
    if (!permitted.value) return Promise.reject(new Error('forbidden'))
    if (configRequest) return configRequest
    if (!force && configState.value === 'ready') return Promise.resolve(configs.value)
    const version = ++configRevision
    configState.value = 'loading'
    const request = api.queryAllConfigs().then(result => {
      if (version === configRevision && permitted.value) { configs.value = result; configState.value = 'ready' }
      return result
    }).catch(error => {
      if (version === configRevision) { configs.value = []; configState.value = classifyNotificationFailure(error) }
      throw error
    }).finally(() => { if (configRequest === request) configRequest = undefined })
    configRequest = request
    return request
  }

  /** A failed type retains its own retry entry without concealing successfully loaded siblings. */
  async function loadProviders(type: string, version = revision) {
    if (!permitted.value) return
    providerStates.set(type, 'loading')
    try {
      const result = await api.queryProviders(type)
      if (version !== revision || !permitted.value) return
      providers.set(type, result)
      providerStates.set(type, result.length ? 'ready' : 'empty')
    } catch (error) {
      if (version === revision) providerStates.set(type, classifyNotificationFailure(error))
    }
  }

  /** Clear identity-scoped data and invalidate all late responses before rebuilding the directory. */
  async function reload() {
    const version = ++revision
    ++configRevision
    configRequest = undefined
    types.value = []; providers.clear(); providerStates.clear(); metadata.clear(); pendingMetadata.clear(); configs.value = []
    state.value = permitted.value ? 'loading' : 'forbidden'
    configState.value = permitted.value ? 'idle' : 'forbidden'
    if (!permitted.value) return
    try {
      const result = await api.queryTypes()
      if (version !== revision || !permitted.value) return
      types.value = result
      await Promise.all(result.map(type => loadProviders(type.id, version)))
      if (version !== revision) return
      state.value = result.length ? 'ready' : 'empty'
    } catch (error) {
      if (version === revision) state.value = classifyNotificationFailure(error)
    }
  }

  /** Cache only metadata, never credentials; failed loads remain retryable and late loads are ignored. */
  function loadDefinition(channel: NotificationChannel): Promise<ChannelDefinition> {
    const cached = metadata.get(channel.id)
    if (cached) return Promise.resolve(channelDefinition(channel, cached))
    const pending = pendingMetadata.get(channel.id)
    if (pending) return pending
    const version = revision
    const request = api.getConfigMetadata(channel.type, channel.provider).then(result => {
      if (version !== revision || !permitted.value) throw new Error('stale-metadata')
      metadata.set(channel.id, result)
      return channelDefinition(channel, result)
    }).finally(() => { if (pendingMetadata.get(channel.id) === request) pendingMetadata.delete(channel.id) })
    pendingMetadata.set(channel.id, request)
    return request
  }

  function count(channel: NotificationChannel): number | undefined {
    return configState.value === 'ready' ? configs.value.filter(item => notificationEnumValue(item.type) === channel.type && notificationEnumValue(item.provider) === channel.provider).length : undefined
  }

  return { types, channels, state, providers, providerStates, configs, configState, reload, loadProviders, loadConfigs, loadDefinition, count }
}
