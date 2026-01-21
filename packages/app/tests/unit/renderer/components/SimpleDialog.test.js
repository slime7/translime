import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SimpleDialog from '@/components/SimpleDialog.vue';
import useDialogStore from '@/store/dialogStore';

const globalStubs = {
  global: {
    stubs: {
      'v-dialog': {
        template: '<div class="v-dialog-stub"><slot /></div>',
        props: ['modelValue'],
      },
      'v-card': { template: '<div class="v-card-stub"><slot /></div>' },
      'v-card-title': { template: '<div class="v-card-title-stub"><slot /></div>' },
      'v-card-text': { template: '<div class="v-card-text-stub"><slot /></div>' },
      'v-card-actions': { template: '<div class="v-card-actions-stub"><slot /></div>' },
      'v-btn': {
        template: '<button class="v-btn-stub" @click="$emit(\'click\')"><slot /></button>',
      },
      'v-spacer': true,
      'v-progress-circular': true,
      'v-sheet': { template: '<div class="v-sheet-stub"><slot /></div>' },
    },
  },
};

describe('SimpleDialog.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('应该渲染对话框列表', async () => {
    const store = useDialogStore();
    store.append({ content: 'Test Content', title: 'Test Title' });

    const wrapper = mount(SimpleDialog, globalStubs);

    expect(wrapper.find('.simple-dialog').exists()).toBe(true);
    expect(wrapper.text()).toContain('Test Title');
  });

  it('关闭按钮应该调用 pop', async () => {
    const store = useDialogStore();
    store.append({ content: 'Test Content' });
    const spyPop = vi.spyOn(store, 'pop');

    const wrapper = mount(SimpleDialog, globalStubs);
    const closeBtn = wrapper.find('.v-btn-stub');
    await closeBtn.trigger('click');

    expect(spyPop).toHaveBeenCalled();
  });

  it('应该渲染 Loader', async () => {
    const store = useDialogStore();
    store.loader = true;

    const wrapper = mount(SimpleDialog, globalStubs);

    const loaderDialog = wrapper.findAll('.v-dialog-stub').filter((w) => w.attributes('class')?.includes('loader'));
    expect(loaderDialog.length).toBeGreaterThan(0);
  });

  it('应该渲染确认框', async () => {
    const store = useDialogStore();
    store.showConfirm({ title: 'Confirm Me', content: 'Sure?' });

    const wrapper = mount(SimpleDialog, globalStubs);

    expect(wrapper.text()).toContain('Confirm Me');
    expect(wrapper.text()).toContain('Sure?');
  });

  it('确认框点击按钮应该触发 resolve/reject', async () => {
    const store = useDialogStore();
    const p = store.showConfirm({ title: 'Confirm', content: 'Content' });

    const wrapper = mount(SimpleDialog, globalStubs);
    // 0: Cancel, 1: Confirm based on template
    const btns = wrapper.findAll('.v-btn-stub');

    await btns[1].trigger('click');

    await expect(p).resolves.toBeUndefined();
  });
});
