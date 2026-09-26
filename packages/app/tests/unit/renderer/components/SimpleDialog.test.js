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
      'mat-dialog': {
        template: '<div class="mat-dialog-stub">{{ title }}<slot name="title" /><slot /><slot name="actions" /></div>',
        props: ['modelValue', 'title', 'width'],
      },
      'mat-btn': {
        template: '<button class="mat-btn-stub" @click="$emit(\'click\')"><slot /></button>',
      },
      'mat-progress': true,
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

    expect(wrapper.find('.simple-dialog-frame').exists()).toBe(true);
    expect(wrapper.text()).toContain('Test Title');
    expect(wrapper.text()).toContain('Test Content');
  });

  it('关闭按钮应该调用 pop', async () => {
    const store = useDialogStore();
    store.append({ content: 'Test Content' });
    const spyPop = vi.spyOn(store, 'pop');

    const wrapper = mount(SimpleDialog, globalStubs);
    const closeBtn = wrapper.find('.mat-btn-stub');
    await closeBtn.trigger('click');

    expect(spyPop).toHaveBeenCalled();
  });

  it('应该渲染 Loader', async () => {
    const store = useDialogStore();
    store.loader = true;

    const wrapper = mount(SimpleDialog, globalStubs);

    expect(wrapper.find('.loader-wrapper').exists()).toBe(true);
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
    const btns = wrapper.findAll('.mat-btn-stub');

    await btns[1].trigger('click');

    await expect(p).resolves.toBeUndefined();
  });
});
