import { Component } from 'vue';

export interface Config {
  get(key: string, defaultValue?: any): any;
  set(key: string, value: any): void;
}

export interface MainStore {
  config: Config;
}

/**
 * 获取主程序 Store (仅在主进程环境可用)
 */
export function getMainStore(): MainStore | null;

/**
 * 获取插件配置代理
 * @param pluginId 插件 ID
 */
export function usePluginConfig(pluginId: string): Config;

/**
 * 获取 IPC 工具 (仅在渲染进程环境可用)
 */
export function useIpc(): any;

/**
 * 获取 Vuetify 实例
 */
export function useVuetify(): any;

/**
 * 获取所有 Vuetify 组件
 */
export function useComponents(): Record<string, any>;

/**
 * 助手函数：获取 Electron 提供的对话框 API
 */
export function useDialog(): any;

/**
 * 获取 Shell API
 */
export function useShell(): any;

// 声明 Vuetify 组件为全局变量，以便在代码中直接使用并获得提示
declare global {
  const VApp: Component;
  const VAppBar: Component;
  const VAppBarNavIcon: Component;
  const VAppBarTitle: Component;
  const VAlert: Component;
  const VAlertTitle: Component;
  const VAutocomplete: Component;
  const VAvatar: Component;
  const VBadge: Component;
  const VBanner: Component;
  const VBannerActions: Component;
  const VBannerText: Component;
  const VBottomNavigation: Component;
  const VBottomSheet: Component;
  const VBreadcrumbs: Component;
  const VBreadcrumbsItem: Component;
  const VBreadcrumbsDivider: Component;
  const VBtn: Component;
  const VBtnGroup: Component;
  const VBtnToggle: Component;
  const VCalendar: Component;
  const VCard: Component;
  const VCardActions: Component;
  const VCardItem: Component;
  const VCardSubtitle: Component;
  const VCardText: Component;
  const VCardTitle: Component;
  const VCarousel: Component;
  const VCarouselItem: Component;
  const VCheckbox: Component;
  const VCheckboxBtn: Component;
  const VChip: Component;
  const VChipGroup: Component;
  const VCode: Component;
  const VColorPicker: Component;
  const VCombobox: Component;
  const VConfirmEdit: Component;
  const VCounter: Component;
  const VDataIterator: Component;
  const VDataTable: Component;
  const VDataTableHeader: Component;
  const VDataTableRow: Component;
  const VDataTableFooter: Component;
  const VDatePicker: Component;
  const VDatePickerControls: Component;
  const VDatePickerHeader: Component;
  const VDatePickerMonth: Component;
  const VDatePickerMonths: Component;
  const VDatePickerYears: Component;
  const VDefaultsProvider: Component;
  const VDialog: Component;
  const VDivider: Component;
  const VEmptyState: Component;
  const VExpansionPanels: Component;
  const VExpansionPanel: Component;
  const VExpansionPanelText: Component;
  const VExpansionPanelTitle: Component;
  const VFab: Component;
  const VField: Component;
  const VFieldLabel: Component;
  const VFileInput: Component;
  const VFooter: Component;
  const VForm: Component;
  const VContainer: Component;
  const VRow: Component;
  const VCol: Component;
  const VSpacer: Component;
  const VHover: Component;
  const VIcon: Component;
  const VImg: Component;
  const VInfiniteScroll: Component;
  const VInput: Component;
  const VItemGroup: Component;
  const VItem: Component;
  const VKbd: Component;
  const VLabel: Component;
  const VLayout: Component;
  const VLayoutItem: Component;
  const VLazy: Component;
  const VList: Component;
  const VListGroup: Component;
  const VListImg: Component;
  const VListItem: Component;
  const VListItemAction: Component;
  const VListItemMedia: Component;
  const VListItemSubtitle: Component;
  const VListItemTitle: Component;
  const VListSubheader: Component;
  const VLocaleProvider: Component;
  const VMain: Component;
  const VMenu: Component;
  const VMessages: Component;
  const VNavigationDrawer: Component;
  const VNoSsr: Component;
  const VNumberInput: Component;
  const VOtpInput: Component;
  const VOverlay: Component;
  const VPagination: Component;
  const VParallax: Component;
  const VProgressCircular: Component;
  const VProgressLinear: Component;
  const VRadio: Component;
  const VRadioGroup: Component;
  const VRangeSlider: Component;
  const VRating: Component;
  const VResponsive: Component;
  const VSelect: Component;
  const VSelectionControl: Component;
  const VSelectionControlGroup: Component;
  const VSheet: Component;
  const VSkeletonLoader: Component;
  const VSlideGroup: Component;
  const VSlideGroupItem: Component;
  const VSlider: Component;
  const VSnackbar: Component;
  const VSparkline: Component;
  const VSpeedDial: Component;
  const VStepper: Component;
  const VStepperActions: Component;
  const VStepperHeader: Component;
  const VStepperItem: Component;
  const VStepperWindow: Component;
  const VStepperWindowItem: Component;
  const VSwitch: Component;
  const VSystemBar: Component;
  const VTabs: Component;
  const VTab: Component;
  const VTable: Component;
  const VTextarea: Component;
  const VTextField: Component;
  const VThemeProvider: Component;
  const VTimeline: Component;
  const VTimelineItem: Component;
  const VTimePicker: Component;
  const VToolbar: Component;
  const VToolbarItems: Component;
  const VToolbarTitle: Component;
  const VTooltip: Component;
  const VTreeview: Component;
  const VValidation: Component;
  const VVirtualScroll: Component;
  const VWindow: Component;
  const VWindowItem: Component;
}
