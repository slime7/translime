# HDR capture

轻松获取 HDR 截图

## 跨插件事件 (Libs)

本插件通过 `libs` 导出截图完成事件，其他插件可通过 `pluginInterop` 订阅。

### capture-complete

截图保存或复制到剪贴板后触发。

**回调参数**: `{ path: string|null, hdrPath: string|null, type: 'save'|'copy' }`

| 字段 | 类型 | 说明 |
|------|------|------|
| `path` | `string \| null` | 保存时为文件完整路径，复制到剪贴板时为 `null` |
| `hdrPath` | `string \| null` | HDR 原始文件路径（EXR 或 fallback），未开启或保存失败时为 `null` |
| `type` | `'save' \| 'copy'` | `'save'` 保存到文件，`'copy'` 复制到剪贴板 |

**使用示例**:

```javascript
import { usePluginInterop } from 'translime-sdk';

const interop = usePluginInterop();
const hdrApi = interop.getExports('translime-plugin-hdr-capture');
if (hdrApi) {
  hdrApi.onCaptureComplete(({ path, hdrPath, type }) => {
    console.log(`截图完成: type=${type}, path=${path}, hdrPath=${hdrPath}`);
  });
}
```

**API**:

- `onCaptureComplete(fn)`: 注册截图完成事件监听。
- `offCaptureComplete(fn)`: 移除截图完成事件监听。
