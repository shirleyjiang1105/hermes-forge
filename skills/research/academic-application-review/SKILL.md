---
name: academic-application-review
title: Academic Application毒舌Review
description: >
  Systematic harsh critique of Chinese academic applications (项目申报书/课题申请书/基金申请书)
  against specific submission standards. Identifies fatal flaws, content gaps, format errors,
  and produces prioritized fix recommendations with concrete rewrite examples. Use when the user
  sends an application document and asks for 毒舌/评审/审稿/挑刺 review.
version: 1.0.0
category: research
---

# Academic Application 毒舌 Review

## When to Use

User says:
- "毒舌模式"/"毒舌评审"/"毒舌地告诉我差距"
- "帮我看看这个申报书哪里有问题"
- "依据标准评审这个项目"
- "用审稿人视角挑刺"

The user wants brutal honesty, not polite suggestions. They need to know what will get them rejected.

## Review Framework

Apply all five lenses. Skip none.

### Lens 1: 🔴 Fatal Flaws (will cause desk reject)

- **Contradictory data**: same field has two conflicting values (e.g., checkbox says both "是" and "否")
- **Truncated content**: text visibly cuts off mid-sentence — the application was submitted incomplete
- **Wrong submission channel**: content doesn't match the program's stated requirements
- **Missing required section**: a mandatory field/section is blank
- **Timeline errors**: dates that are impossible (duplicate time periods, end before start, etc.)
- **Plagiarism or fabricated references**: references that don't exist

### Lens 2: 🟠 Content Substance (the ideas themselves)

- **Boilerplate bingo**: generic phrases that could apply to ANY application in this field. "培养高素质人才" "提升创新能力" — these are filler, not content.
- **Buzzword stacking without substance**: throwing in every hot tech term (AI, 大数据, 数字孪生, 元宇宙, VR, 3D打印) without explaining how ANY of them specifically solves a problem in THIS context.
- **Missing necessity argument**: the application doesn't explain WHY this approach is needed. Why AI? Why not traditional methods? What's the irreplaceable value?
- **Vague goals**: objectives that can't be measured or verified. "提升教学质量" is not a goal. "将学生服饰断代识别准确率从65%提升至85%" is a goal.

### Lens 3: 🟡 Format & Convention Violations

- **Abbreviation rule**: English abbreviations without Chinese full name on first use (see `chinese-academic-abbreviation-check` skill)
- **Security leaks**: passwords, internal URLs, personal phone numbers exposed in the document
- **Inconsistent formatting**: mixed checkbox symbols, inconsistent indentation, font/table chaos
- **Text overflow**: paragraphs truncated because they exceed cell/field limits

### Lens 4: 🟢 Team & Feasibility

- **Ghost team members**: people listed whose role is purely administrative, with no connection to the project's actual work
- **Single point of failure**: only one person doing all the core work
- **Unrealistic timeline**: more tasks than humanly possible in the stated timeframe

### Lens 5: ⚪ Competitive Positioning

- **Why this, not that?**: the application doesn't distinguish itself from other submissions the reviewer will read in the same batch
- **Missing unique selling point**: what's the ONE thing that makes this application stand out?

## Output Format

For each issue found, use this template:

```
### 🔴/🟠/🟡 Issue N: [One-line diagnosis]

[2-3 sentences explaining why this is a problem, from the reviewer's perspective]

**Fix**: [Concrete rewrite or action]
```

Then end with a priority table:

| # | 等级 | 问题 | 修改 |
|---|:---:|------|------|

## After the Review: Upgraded Rewrite

When the user asks you to **generate a complete improved version** based on your critique, or to **learn from an exemplar** before rewriting:

1. **If an exemplar is provided** (user sends their own successful application as a model): extract the core writing techniques that made the exemplar strong — named mechanisms (自创术语), quantified baselines, concrete partners, multi-stakeholder evaluation metrics, research-to-teaching pipeline narrative. Apply these techniques systematically to the target document.

2. **On rewrite, transform every critique into a fix**: each 🔴 issue becomes a correction, each 🟠 issue becomes a rewritten paragraph with concrete specifics replacing vague boilerplate, each 🟡 issue becomes a format fix.

3. **Mark all fixes visibly** in the improved version so the user can see what changed (e.g., "🔴原版复选框矛盾已修正").

4. **Export to Word by default** — users typically download and share these.

## Common Exemplar-to-Target Upgrade Patterns

When learning from a strong exemplar to upgrade a weak application:

| Exemplar Strength | How to Transplant |
|------------------|-------------------|
| "已有科研成果→教学化转化" narrative | Replace "I plan to build" with "I already have X, now I'm upgrading to Y" backed by real data |
| Self-coined mechanism names (e.g., "医工对称驱动") | Invent specific mechanism names for the target's features instead of generic terms like "知识图谱" |
| Concrete evaluation metric (e.g., "基层诊疗效率") | Define a measurable core KPI for the target (e.g., "断代辨识准确率") |
| Named partner organizations | Replace "相关企业/医院" with actual named entities |
| Multi-stakeholder evaluation (四方评价) | Name all evaluation participants explicitly |

## Do NOT Do

- Do NOT be polite or soften critiques. The user explicitly asked for毒舌.
- Do NOT say "overall this is good but..." — that defeats the purpose.
- Do NOT skip any lens. Even if a lens has no issues, briefly note it.
- Do NOT make vague suggestions like "improve the writing." Give exact rewrites.
- Do NOT leave the user with just a critique. If they ask for a full rewrite, generate the complete document.

## Related Skills

- `chinese-academic-abbreviation-check`: Always run this as a sub-check during the review (Lens 3). Users frequently ask for abbreviation fixes as a separate task after the main review.
- `chinese-academic-reference-integrity`: Check reference integrity if the application includes a reference list.
