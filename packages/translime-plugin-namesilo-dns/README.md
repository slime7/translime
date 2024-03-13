# template translime plugin

translime 插件模板项目。

## 使用

复制模板项目并安装依赖：

```bash
npx degit translime/template-translime-plugin translime-plugin-<plugin name>
cd translime-plugin-<plugin name>
yarn
```

修改`package.json`中的`name`为插件名称，按需修改其他属性。

打包插件：

```bash
yarn build
```

## plugin 字段

### title

插件名称，会在面板中展示，当不设置时取`package.json`中的`name`。

```
"title": "插件名称"
```

### author

插件作者，会在面板中展示，当不设置时取`package.json`中的`author`。

```
"author": "作者"
```

### link

链接到作者按钮的链接，默认是空字符。

```
"link": "https://example.com"
```

### description

插件描述，会在面板中展示，当不设置时取`package.json`中的`description`。

```
"description": "插件描述"
```

### icon

插件图标，不设置时会显示为默认图片。

```
"icon": "./src/icon.png"
```

### ui

插件界面组件模式，和`windowUrl`最多选其一。

```
"ui": "dist/ui.umd.js"
```

### windowUrl

插件界面 html 模式，和`ui`最多选其一。

```
"windowUrl": "dist/ui/index.html"
```
