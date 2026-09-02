import { expect, test } from './fixtures/electronApp';

const PLUGIN_ID = 'translime-plugin-style-contract';
const LEGACY_PLUGIN_ID = 'translime-plugin-legacy-style-contract';

test.describe('插件样式作用域 (Plugin Style Scope E2E)', () => {
  test('动态插件样式只影响插件根节点内的内容', async ({ electronContext }) => {
    const { page } = electronContext;
    const result = await page.evaluate((pluginId) => {
      const hostProbe = document.createElement('div');
      hostProbe.className = 'plugin-style-probe plugin-media-probe';

      const pluginRoot = document.createElement('div');
      pluginRoot.className = 'plugin-ui-loader';
      pluginRoot.dataset.pluginId = pluginId;

      const pluginProbe = document.createElement('div');
      pluginProbe.className = 'plugin-style-probe';
      const mediaProbe = document.createElement('div');
      mediaProbe.className = 'plugin-media-probe';
      pluginRoot.append(pluginProbe, mediaProbe);
      document.body.append(hostProbe, pluginRoot);

      const styleElement = document.createElement('style');
      styleElement.dataset.translimePluginId = pluginId;
      styleElement.textContent = `
        @layer plugin-contract {
          :root, :host {
            --plugin-scope-root: isolated;
          }

          html, body {
            --plugin-scope-document-root: document-root;
          }

          body .plugin-style-probe {
            --plugin-scope-body: relative;
            color: rgb(12, 34, 56);
          }

          @media (min-width: 0px) {
            .plugin-media-probe {
              --plugin-scope-media: active;
            }
          }
        }
      `;
      document.head.appendChild(styleElement);

      const pluginStyles = getComputedStyle(pluginProbe);
      const hostStyles = getComputedStyle(hostProbe);
      const processedCss = styleElement.textContent;
      const rootSelector = `.plugin-ui-loader[data-plugin-id="${pluginId}"]`;

      const values = {
        pluginRoot: getComputedStyle(pluginRoot).getPropertyValue('--plugin-scope-root').trim(),
        pluginDocumentRoot: getComputedStyle(pluginRoot).getPropertyValue('--plugin-scope-document-root').trim(),
        pluginInheritedRoot: pluginStyles.getPropertyValue('--plugin-scope-root').trim(),
        pluginBodyPrefix: pluginStyles.getPropertyValue('--plugin-scope-body').trim(),
        pluginMedia: getComputedStyle(mediaProbe).getPropertyValue('--plugin-scope-media').trim(),
        pluginColor: pluginStyles.color,
        hostBodyPrefix: hostStyles.getPropertyValue('--plugin-scope-body').trim(),
        hostDocumentRoot: hostStyles.getPropertyValue('--plugin-scope-document-root').trim(),
        hostMedia: hostStyles.getPropertyValue('--plugin-scope-media').trim(),
        hostColor: hostStyles.color,
        hasScope: processedCss.includes('@scope'),
        hasNestedLayer: processedCss.includes('@layer plugin-contract'),
        hasMediaRule: processedCss.includes('@media (min-width: 0px)'),
        hasSelectorPrefix: processedCss.includes(`${rootSelector} .plugin-style-probe`),
      };

      styleElement.remove();
      hostProbe.remove();
      pluginRoot.remove();

      return values;
    }, PLUGIN_ID);

    expect(result.pluginRoot).toBe('isolated');
    expect(result.pluginDocumentRoot).toBe('document-root');
    expect(result.pluginInheritedRoot).toBe('isolated');
    expect(result.pluginBodyPrefix).toBe('relative');
    expect(result.pluginMedia).toBe('active');
    expect(result.pluginColor).toBe('rgb(12, 34, 56)');
    expect(result.hostBodyPrefix).toBe('');
    expect(result.hostDocumentRoot).toBe('');
    expect(result.hostMedia).toBe('');
    expect(result.hostColor).not.toBe('rgb(12, 34, 56)');
    expect(result.hasScope).toBe(true);
    expect(result.hasNestedLayer).toBe(true);
    expect(result.hasMediaRule).toBe(true);
    expect(result.hasSelectorPrefix).toBe(false);
  });

  test('兼容带 data-plugin-style-id 的旧版插件样式产物', async ({ electronContext }) => {
    const { page } = electronContext;
    const result = await page.evaluate((pluginId) => {
      const pluginRoot = document.createElement('div');
      pluginRoot.className = 'plugin-ui-loader';
      pluginRoot.dataset.pluginId = pluginId;

      const probe = document.createElement('div');
      probe.className = 'legacy-style-probe';
      pluginRoot.append(probe);
      document.body.append(pluginRoot);

      const styleElement = document.createElement('style');
      styleElement.dataset.translimePluginId = pluginId;
      styleElement.dataset.pluginStyleId = pluginId;
      styleElement.textContent = `.plugin-ui-loader[data-plugin-id="${pluginId}"] .legacy-style-probe {
        --legacy-plugin-style: available;
      }`;
      document.head.appendChild(styleElement);

      const resultValues = {
        value: getComputedStyle(probe).getPropertyValue('--legacy-plugin-style').trim(),
        hasScope: styleElement.textContent.includes('@scope'),
        hasPluginLayer: styleElement.textContent.includes('@layer translime-plugin'),
      };

      styleElement.remove();
      pluginRoot.remove();

      return resultValues;
    }, LEGACY_PLUGIN_ID);

    expect(result.value).toBe('available');
    expect(result.hasScope).toBe(false);
    expect(result.hasPluginLayer).toBe(true);
  });
});
