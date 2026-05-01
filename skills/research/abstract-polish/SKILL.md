---
name: abstract-polish
description: 中文学术摘要→高质量英文学术摘要翻译与润色。按IMRaD/结构化摘要格式，适配SCI/SSCI期刊标准（250-350词）。触发词：摘要/英文摘要/abstract/翻译摘要。
trigger_keywords:
  - 摘要
  - 英文摘要
  - abstract
  - 翻译摘要
  - 摘要润色
  - 中译英摘要
---

# 英文摘要润色

## 触发条件
用户说"帮我翻摘要"、"英文摘要"、"abstract翻译"、"摘要润色"时加载。

## Step 1：确认摘要类型

| 类型 | 适用 | 结构 |
|------|------|------|
| IMRaD结构化 | SCI/SSCI期刊 | Background→Methods→Results→Discussion/Conclusion |
| 中文结构化 | 中文期刊英文摘要 | 目的→方法→结果→结论 |
| 一段式 | 部分SSCI/会议 | 一段连续文字，按IMRaD顺序 |
| 特定期刊 | 用户指定 | 按目标期刊Author Guidelines |

## Step 2：中→英翻译规范

### 词数限制
- 先询问目标期刊或会议的字数上限（SCI通常250-350词）
- 翻译后自动统计词数，超标则在不减内容的前提下精简

### 质量标准
| 维度 | 标准 |
|------|------|
| **客观性** | 不用"I/We"开头的句子（部分SSCI期刊除外→询问用户） |
| **时态** | Background用现在时；Methods和Results用过去时；Conclusion用现在时 |
| **语态** | 主动优先（"We examined"优于"It was examined"） |
| **密度** | 每句话含信息，删除空洞修饰语 |
| **术语** | 统一全文术语，首次缩写定义全称 |
| **数据** | 保留原文所有数字、p值、效应量 |

### 输出格式

```markdown
## 英文摘要

### 目标期刊：XXX | 词数：XXX/XXX

**英文摘要：**

[翻译后的完整摘要]

### 逐句对照

| 中文原文 | 英文翻译 | 修改理由 |
|---------|---------|---------|
| 本研究旨在... | This study aimed to... | 时态：过去时 |
| 结果表明... | The results indicated that... | 客观表达 |

### 需确认
- [术语] "认知负荷"译为 cognitive load ✓ 还是 mental workload？
- [数据] 原文中的p=0.03，是否有误？（建议核查原始数据）
```

## Step 3：已有英文摘要的润色

如果用户提供的是已有的英文摘要：

1. 检查IMRaD结构完整性（缺的部分标注）
2. 检查时态一致性
3. 检查是否包含所有必要要素：
   - □ 研究背景/目的（Why）
   - □ 研究设计/方法（How）
   - □ 核心结果（What found）
   - □ 结论/意义（So what）
4. 给出润色版本+修改说明

## Step 4：从正文自动提取摘要

如果用户提供论文全文而非摘要，可以：
1. 从Introduction提取Background（2-3句）
2. 从Methods提取Methods（3-4句）
3. 从Results提取Results（4-5句，选最关键的）
4. 从Discussion提取Conclusion（2-3句）
5. 组装成完整摘要

用户确认后翻译为英文。

## 注意事项
- 摘要不引用参考文献（除非目标期刊明确允许）
- 摘要中的缩写即使是第一次出现也必须定义（摘要是独立阅读的）
- 结论句不要过度推广——"provides preliminary evidence" 优于 "proves"
