# ADR 记录说明

本目录用于记录本仓库的长期架构决策（Architecture Decision Records）。ADR 记录"为什么这样选择"，与描述现状的 [ARCHITECTURE.md](../ARCHITECTURE.md) 互补：架构文档说明当前系统如何组成，ADR 说明形成这些选择时的背景与取舍。

## 何时创建

- 出现新的长期架构选择，且存在明显取舍时。
- 决策已经生效、需要为后人保留背景与理由时。
- 修复、局部样式调整和没有长期取舍的重构通常不需要 ADR。

## 文件命名

- 文件名使用 `NNNN-short-title.md`，编号单调递增（0001、0002、...）。
- `NNNN` 为四位数字，`short-title` 为小写单词、以连字符分隔。

## 状态

- `proposed`：已提出、尚未生效。
- `active`：当前生效。
- `superseded`：已被更新的 ADR 替代。
- `retired`：不再适用且无替代。

一份 ADR 只记录一个长期决策。ADR 生效后保留历史；改变决策时创建新 ADR，并在"替代"字段标注被替代的 ADR。

## 模板

~~~markdown
# NNNN — 决策标题

- 状态: proposed
- 日期: YYYY-MM-DD
- 替代: 无

## 背景

促成决策的背景、约束和作用力。

## 决策

明确写出选择。

## 考虑的方案

列出主要候选方案及取舍。

## 影响

记录正面影响、代价和重新评估条件。
~~~

## 创建

仓库内置 ADR 创建脚本 `.agents/adr/create_adr.py`，从仓库根目录运行，保证编号、命名与模板一致：

```text
python .agents/adr/create_adr.py . "<决策标题>" --slug <slug> --context "<背景>" --decision "<决策>" --option "<候选方案A>" --option "<候选方案B>" --consequence "<影响>"
```

- 中文标题必须显式提供 `--slug`（小写 ASCII 单词、连字符分隔）。
- 默认状态为 `proposed`；决策已生效时传入 `--status active`。
- 替代已有 ADR 时传入 `--supersedes NNNN`，被替代的 ADR 必须已存在。
- 不确定参数效果时可先加 `--dry-run` 预览，不会写入文件。

本仓库当前没有历史 ADR；首次记录决策时从 `0001` 开始编号。
