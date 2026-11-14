/** API 业务失败不能被默认值吞成空配置或保存成功。 */
export function assertNoticeResponse(response: unknown): asserts response is Record<string, unknown> {
  if (!response || typeof response !== 'object'
    || ('success' in response && response.success === false)
    || ('status' in response && typeof response.status === 'number' && response.status >= 400)) {
    throw new Error('Notification request failed')
  }
}
