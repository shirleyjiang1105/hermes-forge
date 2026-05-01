---
name: chinese-academic-abbreviation-check
title: Chinese Academic Abbreviation Convention Check
description: >
  Scan a Chinese academic document for English abbreviations and verify that every abbreviation
  has its Chinese full name declared on first occurrence, following the 中文全称（Abbr）convention.
  Use when the user asks to check 缩写/术语规范/英文缩写/中英文对照 in a Chinese paper, proposal,
  research plan, or thesis.
version: 1.0.0
author: Hermes
license: MIT
metadata:
  hermes:
    tags: [Chinese, Academic Writing, Abbreviations, Formatting, Polishing]
    category: research
---

# Chinese Academic Abbreviation Convention Check

## When to Use
- User asks to check "缩写需要先声明全拼"
- User asks to verify 英文缩写 are expanded on first use
- User mentions 术语规范 / 中英文对照 / 缩写格式 in a Chinese academic document
- Polishing a Chinese paper, proposal, research plan, or thesis before submission
- Any Chinese academic text that mixes English abbreviations with Chinese prose

## The Rule
In Chinese academic writing, every English abbreviation MUST have its Chinese full name declared on **first occurrence only**. Subsequent uses can use the abbreviation alone.

**Correct patterns** (first use):
- `人工智能（AI）` — Chinese full name followed by abbreviation in parentheses
- `正性负性情绪量表[PANAS]` — Chinese full name followed by abbreviation in brackets
- `应用程序编程接口（API）` — full Chinese expansion, not just transliteration

**Incorrect** (first use without expansion):
- `AI 对话系统` → should be `人工智能（AI）对话系统`
- `使用 PANAS 量表` → should be `使用正性负性情绪量表（PANAS）`

**Product names are exempt**: Android, iOS, ChatGPT, GPT-4, Claude, Windows, Git, SQLite — these are proper nouns, not abbreviations requiring expansion. Similarly, journal names (JAMA, JMIR) and conference acronyms (AAAI, ICWSM) in reference lists are exempt.

**Statistical notation is exempt**: p-values, n (sample size), d (effect size), SD, SE, CI — these are universal symbols, not domain abbreviations.

**Already-expanded later uses are fine**: Once `人工智能（AI）` appears, all subsequent `AI` uses are correct without re-expansion.

## Procedure

### Step 1: Scan the document
Read the full document. Identify every English abbreviation in the body text (not just reference list). Common candidates include:
- Domain terms: AI, LLM, NLP, CBT, DBT, RCT
- Scale/instrument names: PHQ-9, GAD-7, PANAS, SUS, BDI
- Technical terms: API, HTTP, SQL, JSON, CSV, IDE, GUI, UI/UX
- Generic: APP (should be 应用程序), OS (should be 操作系统)

### Step 2: Trace first occurrence
For each abbreviation found, locate its **first** occurrence in the document body. Check if a Chinese expansion appears at or immediately before this first use.

### Step 3: Identify violations
List every abbreviation where the first occurrence lacks a Chinese expansion. Note the line number.

### Step 4: Fix with targeted patches
For each violation, insert the Chinese full name at the first occurrence, using the pattern that fits the context:
- `中文（Abbr）` — most common, preferred for general terms
- `中文[Abbr]` — for scale/instrument names (matches academic convention)
- `中文（English Full, Abbr）` — when the abbreviation derives from English (e.g., `系统可用性量表（System Usability Scale, SUS）`)

Use `patch` tool with unique `old_string` for each fix. After all patches, verify by reading the affected sections.

### Step 5: Verify no regressions
Re-scan the fixed document to confirm:
- All abbreviations now have first-use expansion
- No duplicate expansions introduced
- Subsequent uses of the same abbreviation remain untouched (they should stay as-is)

## Pitfalls

- **Don't expand in the reference list**: References like `[5] Fitzpatrick K K, ... JMIR Mental Health...` contain journal abbreviations that are correct as-is. Only body text is in scope.
- **Flowcharts and ASCII diagrams need expansion too**: When abbreviations appear inside markdown code blocks used for flowcharts (like DMN/ECN/SN/SMN/VN, ROC/AUC, LASSO), they still need first-use expansion. Expand them in the body text before they appear in the diagram, or expand them inline in the diagram labels if space permits. The same rule applies: first occurrence anywhere in the document, including diagrams.
- **Pattern for technical terms with both Chinese and English**: Use `中文全称（English Full Name, Abbr）` when the English full name clarifies the abbreviation's origin. Example: `曲线下面积（Area Under the Curve, AUC）` not just `曲线下面积（AUC）`.
- **Don't expand product names**: Git, Android, iOS, ChatGPT are proper names, not abbreviations.
- **Watch for multi-abbreviation sentences**: A single sentence may introduce multiple abbreviations (e.g., "含 PANAS 简版量表 + SUS 系统可用性量表"). Each needs its own expansion.
- **Check the title separately**: The document title (课题名称) is often treated as a standalone element. If it contains abbreviations, expand them there too.
- **Statistical abbreviations**: p, n, d, SD are universal — don't expand these.
- **Chinese-context "abbreviations" like 大模型 (for 大语言模型)**: If already spelled out once, subsequent shorthand is acceptable. This skill focuses on English abbreviations in Chinese text.

## Examples from Practice

| Found | Context | Fixed |
|-------|---------|-------|
| `AI 对话系统` (first use) | Body text | `人工智能（AI）对话系统` |
| `心理健康类 APP` (first use) | Body text | `心理健康类应用程序（APP）` |
| `PHQ-9 降幅` (first use) | Literature review | `患者健康问卷抑郁量表[PHQ-9]降幅` |
| `简版 PANAS 量表` (first use) | Hypothesis section | `简版正性负性情绪量表[PANAS]` |
| `HTTP → 大模型 API` (first use) | Technical table | `超文本传输协议（HTTP）→ 大模型 API` |
| `Android Studio IDE` (first use) | Equipment section | `Android Studio 集成开发环境（IDE）` |

## See Also
- `chinese-academic-reference-integrity`：参考文献真实性验证 + 正文↔列表一一对应检查。建议在缩写检查之后运行，构成中文学术文档「终审双件套」。
