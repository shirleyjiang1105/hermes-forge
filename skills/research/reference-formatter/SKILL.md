---
name: reference-formatter
description: 参考文献自动格式化——从原始文献信息（DOI/标题/作者/期刊/年份）生成目标期刊格式。支持GB/T 7714、APA 7th、Vancouver、IEEE等。输入杂乱信息，输出规范格式。触发词：参考文献/格式化/调格式/reference/GB/T 7714/APA。
trigger_keywords:
  - 参考文献
  - 格式化
  - 调格式
  - 引用格式
  - reference
  - GB/T 7714
  - APA
  - Vancouver
  - 参考文献列表
---

# 参考文献格式化

## 触发条件
用户说"格式化参考文献"、"调引用格式"、"GB/T 7714"、"APA格式"时加载。

## Step 1：确认格式和目标

询问用户：
1. 目标格式：GB/T 7714-2015（中文期刊）| APA 7th | Vancouver | IEEE | 目标期刊指定的其他格式
2. 输入来源：用户粘贴文献信息 | 从已有文档提取 | 从DOI自动获取
3. 输出位置：替换原文 | 新建文件

## Step 2：格式模板

### GB/T 7714-2015（中文期刊通用）
```
期刊论文：
[序号] 作者. 题名[J]. 刊名, 年, 卷(期): 起页-止页.
例：[1] 张三, 李四. 便携式脑电在认知负荷评估中的应用[J]. 现代教育技术, 2025, 35(3): 45-52.

专著：
[序号] 作者. 书名[M]. 出版地: 出版社, 年.
例：[2] Sweller J, Ayres P, Kalyuga S. Cognitive Load Theory[M]. New York: Springer, 2011.

学位论文：
[序号] 作者. 题名[D]. 保存地: 保存单位, 年.

会议论文：
[序号] 作者. 题名[C]//会议录名. 出版地: 出版社, 年: 起页-止页.

电子文献（含DOI）：
[序号] 作者. 题名[J/OL]. 刊名, 年, 卷(期): 起页-止页[引用日期]. DOI.
```

### APA 7th（英文SSCI/SCI期刊通用）
```
期刊论文：
Author, A. A., & Author, B. B. (Year). Title of article. Title of Periodical, Volume(Issue), pp-pp. https://doi.org/xxxxx

专著：
Author, A. A. (Year). Title of work. Publisher.

书籍章节：
Author, A. A. (Year). Title of chapter. In E. Editor (Ed.), Title of book (pp. xx-xx). Publisher.
```

### Vancouver（医学期刊通用）
```
期刊论文：
[1] Author AA, Author BB. Title of article. Abbreviated Journal Name. Year;Volume(Issue):Pages.
例：[1] So WKY, Wong SWH, Mak JN, Chan RHM. An evaluation of mental workload with frontal EEG. PLoS One. 2017;12(4):e0174949.

页码范围缩写规则：1234-1245 → 1234-45
```

### IEEE（工程/计算机）
```
期刊论文：
[1] A. A. Author and B. B. Author, "Title of paper," Abbrev. Journal Name, vol. x, no. x, pp. xxx-xxx, Month. Year.
```

## Step 3：从DOI自动获取文献信息

如果用户提供DOI列表，用PubMed/EU API获取完整信息后格式化：

```
输入：10.3390/s25206446
获取：作者、标题、期刊、年份、卷期、页码
输出：目标格式的引用条目
```

实现方法：
```bash
curl -s "https://api.crossref.org/works/DOI" | python3 -c "import json,sys; d=json.load(sys.stdin)['message']; print(...)"
```

## Step 4：输出

```markdown
## 参考文献格式化结果

### 目标格式：GB/T 7714-2015
### 共 N 条

[1] Lekati E, Dimitrakopoulos G N, Lazaros K, et al. Wearable EEG sensor analysis for cognitive profiling in educational contexts[J]. Sensors, 2025, 25(20): 6446.

[2] Sáiz-Manzanares M C, Ortega-Renuncio R, Marticorena-Sánchez R. Processing and analysis of portable EEG data for cognitive load assessment in neurotypical university students[J]. Frontiers in Human Neuroscience, 2026, 20: 1737723.

...

### 问题条目（无法格式化）
| 条目 | 原因 | 缺少信息 |
|------|------|---------|
| 第5条 | 缺卷期号 | 需用户补充 |
```

## 注意事项
- 中文作者姓在前名在后，英文作者按规定处理（APA: 姓, 名缩写）
- 多于3个作者：GB/T 7714用"等"，APA用"et al."
- DOI优先——任何格式都建议附DOI
- 页码缩写规则（如1234-1245→1234-45）因格式而异，注意区分
