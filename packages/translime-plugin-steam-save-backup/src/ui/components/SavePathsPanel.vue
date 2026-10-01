<template>
  <!-- 组件整体位于 mat-dialog 内（Teleport 到宿主 @scope 隔离范围之外），样式必须内联 -->
  <mat-expansion-panel
    v-if="savePaths.length"
    style="margin-bottom: 8px"
    :split="false"
    :title="`检测到存档路径 (${savePaths.length} 个)`"
  >
    <div
      v-for="(pathInfo, index) in savePaths"
      :key="`${pathInfo.absolutePath || 'unknown'}-${index}`"
      style="margin-bottom: 16px; font-size: .875rem; word-break: break-all"
    >
      <div style="display: flex; align-items: center; margin-bottom: 4px; font-weight: 700">
        <mat-chip
          variant="assist"
          color="primary"
          style="margin-right: 8px"
        >
          路径 {{ index + 1 }}（{{ pathInfo.label }}）
        </mat-chip>

        <span style="color: var(--mat-sys-color-on-surface)">
          {{ pathInfo.absolutePath || '未探测到有效路径' }}
        </span>
      </div>

      <div style="margin-left: 16px; padding-left: 12px; border-left: 1px solid color-mix(in srgb, var(--mat-sys-color-outline) 40%, transparent)">
        <div
          v-for="file in pathInfo.files"
          :key="file"
          style="display: flex; align-items: center; padding: 2px 0; color: var(--mat-sys-color-on-surface-variant)"
        >
          <mat-icon
            icon="description"
            style="margin-right: 4px; font-size: 14px; color: var(--mat-sys-color-outline)"
          />
          {{ file }}
        </div>
      </div>
    </div>
  </mat-expansion-panel>
</template>

<script setup>
import { computed } from 'vue';
import { normalizeSaveSource } from '../../utils/save-sources';

const props = defineProps({
  game: {
    type: Object,
    default: null,
  },
});

const savePaths = computed(() => {
  if (Array.isArray(props.game?.saveSources)) {
    return props.game.saveSources.map((source, index) => {
      const normalizedSource = normalizeSaveSource(source, index);
      return {
        absolutePath: normalizedSource.absolutePath,
        relativePath: normalizedSource.relativePath,
        files: normalizedSource.files,
        label: normalizedSource.label,
      };
    });
  }

  return props.game?.savePaths || [];
});
</script>
