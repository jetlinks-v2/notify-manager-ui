<template>
    <div style="margin-right: 38px;">
      <div style="display: flex; justify-content: flex-end">
        <RadioGroup v-model:value="value">
          <Radio.Button value="text">{{ $t('Log.index.017262-9') }}</Radio.Button>
          <Radio.Button value="json">Json</Radio.Button>
        </RadioGroup>
      </div>
      <div style="max-height: 400px; overflow-y: auto">
        <template v-if="value === 'json'">
          <JsonViewer :value="context" :expanded="true" :expandDepth="4"></JsonViewer>
        </template>
        <div v-else style="height: 180px;padding: 20px 0">
          <p v-if="!!detailData.notifyMessage">{{ detailData.notifyMessage }}</p>
          <Empty v-else />
        </div>
      </div>
    </div>
</template>

<script lang="ts" setup>
import { JsonViewer } from 'vue3-json-viewer';
import templateApi from '../../../../api/template';
import i18n from "@/locales";
import {Radio, RadioGroup} from 'ant-design-vue'
import {Empty} from '@jetlinks-web/components'

const props = defineProps({
    data: Object
})
const emits = defineEmits(['close'])
const typeObj = {
    weixin: 'wechat',
    dingTalk: 'dingtalk',
};
const $t = i18n.global.t
/**
 * 查看用户名
 */
const userList = ref([])
const departmentList = ref([])
const detailData = ref();
const context = ref()
const value = ref('text')
/**
 * 改变部门和用户
 */
const replaceData = async (data: any) => {
    detailData.value = data
    context.value = data.context
    if (context.value.detailJson) {
        context.value.detailJson = context.value.detailJson.replace(/\\\"/g, '\"')
    }
    if (context.value.hasOwnProperty('userIdList') || context.value.hasOwnProperty('toUser')) {
        templateApi.getUser(
            typeObj[detailData.value.notifyType],
            detailData.value.notifierId,
        ).then((res: any) => {
            if (res.status === 200) {
                userList.value = res.result
                userList.value.forEach((item: any) => {
                    item.id === context.value?.userIdList ? context.value.userIdList = item.name : ''
                    item.id === context.value?.toUser ? context.value.toUser = item.name : ''
                })
            }
        })
    }
    if (context.value.hasOwnProperty('departmentIdList')) {
        templateApi.getDept(typeObj[detailData.value.notifyType],
            detailData.value.notifierId).then((res: any) => {
                if (res.status === 200) {
                    departmentList.value = res.result
                    departmentList.value.forEach((item: any) => {
                        item.id === context.value.departmentIdList ? context.value.departmentIdList = item.name : ''
                    })
                }
            })
    }
}
replaceData(props.data)
</script>
<style lang="less" scoped>
:deep(.ant-modal-confirm-content){
  margin-left: 0 !important;
}
</style>
