<template>
  <a-input-group compact>
    <a-input v-model:value="_value" disabled style="width: calc(100% - 65px)"/>
    <a-button type="primary" @click="visible = true">选择</a-button>
  </a-input-group>
  <Modal v-if="visible" :value="toUser" :name="_value" :configId="configId" @save="handleSave" @close="visible = false" />
</template>

<script setup lang="ts">
import {useI18n} from "vue-i18n";
import Modal from './Modal.vue'

const {t: $t} = useI18n();
type Emits = {
  (e: 'update:toUser', data: string | undefined): void;
  (e: 'update:toUserName', data: string | undefined): void;
};
type Props = {
  toUser: string | undefined;
  toUserName: string | undefined;
  configId: string | undefined;
};

const emit = defineEmits<Emits>();

const props = defineProps<Props>();
const _value = ref()
const visible = ref(false)

watch(() => props.toUserName, (val) => {
  _value.value = val || props.toUser
}, {
  immediate: true
})

const handleSave = (dt) => {
  visible.value = false
  _value.value = dt.name
  emit('update:toUser', dt.id)
  emit('update:toUserName', dt.name)
}
</script>

<style lang="less" scoped>

</style>
