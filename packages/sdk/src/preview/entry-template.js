/**
 * Preview 入口模板
 * 此文件由 Vite 插件动态生成，用于启动插件预览
 * __PLUGIN_COMPONENT_PATH__ 会被替换为实际的组件路径
 */
import { startPreview } from 'translime-sdk/preview';
import PluginComponent from '__PLUGIN_COMPONENT_PATH__';

startPreview(PluginComponent);
