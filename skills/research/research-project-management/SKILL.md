---
name: research-project-management
description: Build a research project management system — reusable grant application modules, collaborator databases, application timelines, and project tracking. Use when a multi-domain researcher needs to speed up grant application startup time by pre-organizing people, reusable text blocks, and deadlines.
---

# Research Project Management

## When to Use
User is a multi-domain researcher who frequently writes grant applications and wants to reduce cold-start time. Triggers: "speed up project applications", "manage my grants", "organize my collaborators", "reuse grant text", "application boilerplate", "project tracking across research areas", or any mention of needing to manage multiple projects, people, and deadlines.

## Architecture
```
research-mgmt/
├── projects/           # Per-zone project folders with index.md
│   ├── 01_ZoneA/
│   │   ├── index.md   # lists all projects in this zone with status
│   │   └── Grant2026/ # specific application folder
│   └── ...
├── collaborators/      # People database
│   ├── collaborators.yaml   # by person, by expertise, by project
│   └── by_expertise.md      # quick-lookup by skill
├── modules/            # Reusable text blocks (THE core asset)
│   ├── 技术路线/
│   ├── 创新点/
│   ├── 可行性分析/
│   ├── 研究基础/
│   ├── 预期成果/
│   └── 经费预算/
├── templates/          # Blank application skeletons by funder type
│   ├── 国自然/
│   ├── 教育部/
│   ├── 智库/
│   ├── 大创/
│   └── 科普/
├── timeline/           # Annual application calendar
│   └── YYYY_applications.yaml
└── archive/            # Completed/abandoned projects
```

## Key Insight
The goal is to go from "open a blank Word document" to "splice existing modules". Pre-written, pre-vetted text blocks are the single biggest time-saver.

## Steps

### 1. Interview for complete research portfolio
Before building anything, map ALL the researcher's domains, projects, collaborators, and application history. Ask:
- What research areas? (list all, even dormant ones)
- What grants have you applied for? (funded and unfunded)
- Who are your collaborators and what are their exact expertise tags?
- What sections do you rewrite every time?
- What's your annual application calendar?

### 2. Create project index files
Each research zone gets a `projects/XX_Zone/index.md` with a table:
```markdown
| Project | Funder | Status | Year | Folder |
|---------|--------|--------|------|--------|
| ASD脑梯度 | 国自然面上 | ✍️ Writing | 2026 | `国自然2026_ASD/` |
```

Statuses: ✅ Funded | ✍️ Writing | 📋 Planned | ❌ Rejected | 🔄 In progress

### 3. Build the collaborator database
`collaborators/collaborators.yaml` with THREE indexes:
- **By person**: name, role, unit, expertise list, projects, notes
- **By expertise**: reverse lookup (expertise → list of people)
- **By project**: project → team members

This eliminates the "who worked on this last time?" friction.

### 4. Write reusable modules (the core asset)
Each module file contains pre-written text blocks organized by research zone. When writing a new application, the researcher copies the relevant module and adjusts parameters.

**Module file structure**:
```markdown
# 技术路线模块库

## 模块1：多模态MRI分析（脑影像用）
### 数据预处理
- [pre-written steps with tool names and parameters]
### 指标计算
- [specific metrics per modality]
### 分析策略
- [statistical methods, corrections]

## 模块2：便携EEG筛查（EEG筛查用）
...
```

Each module should be specific enough to be useful but generic enough to be reusable. Include tool names, parameter values, and reasoning.

**Module categories to create**:
| Module | Content |
|--------|---------|
| 技术路线 | Per-method pipeline descriptions (MRI, EEG, GNN, Meta, etc.) |
| 创新点 | Per-zone innovation statements ready to paste |
| 可行性分析 | Generic feasibility + per-zone specifics |
| 研究基础 | Publications list, funded projects, equipment, team |
| 预期成果 | Papers, patents, students, social impact per zone |
| 经费预算 | Budget templates per funder type with line items |

### 5. Create funder templates
Blank application skeletons organized by funder type (国自然, 教育部, 智库, 大创, 科普). These are the structural scaffolding — section headers, required subsections, and placeholder prompts. The actual content comes from modules.

### 6. Build the application timeline
`timeline/YYYY_applications.yaml` tracks:
```yaml
- deadline: 2026-03
  funder: 国自然面上
  zone: 01脑影像
  project: ASD脑梯度
  status: ✍️ Writing
```

Also note annual recurring deadlines (国自然 Jan-Mar, 教育部 Mar-May, etc.) as reminders even without a specific project assigned yet.

### 7. Proposal format adaptation (跨基金体例转换)

When adapting the same research content between Chinese funding bodies, the differences are NOT cosmetic — each funder has distinct rhetorical and structural conventions. Common adaptation paths:

**教育部课题 → 国家社科基金**:

| Dimension | 教育部课题 | 国家社科基金 |
|-----------|-----------|-------------|
| Structure | Problem → Solution → Tech | 选题依据→研究内容→思路方法→创新之处→预期成果→研究基础 |
| Language | Technical, implementation-focused | Theoretical, academic density |
| Lit review | Scattered in background | Structured by research stream with 述评 (commentary on gaps) |
| Innovation | Embedded in text | Condensed into triad: 学术思想—学术观点—研究方法 |
| Outputs | General description | Explicit CSSCI count, phased deliverables |
| Tone | Project report style | Scholarly discourse |

**Transformation rules**:
1. **Don't discard** — Original content becomes source material; nothing is wasted
2. **Restructure first** — Remap sections to the target format; identify what's missing (usually: lit review, phased outputs)
3. **Add the literature review** — Organize by research streams (3-4 directions), each with representative citations + critical gap identification
4. **Translate language** — "We built X" → "本研究构建了X"; "The system does Y" → "该框架实现了Y的理论表征"
5. **Abstract innovations** — Extract from implementation details into theoretical contributions; use the 思想-观点-方法 triad
6. **Specify outputs concretely** — CSSCI 3-5 papers, monograph 1, report 1, toolkit — no vague "series of papers"
7. **De-technicalize** — Move code listings, tool names, and implementation specifics to 研究基础 (as "completed prototypes")
8. **Strip all PII** — 活页 must contain zero identifying information (name, institution, prior specific grants)

**教育部协同创新专项 (双主持人制)**:

This is a distinct sub-format from general 教育部课题. Key features:
- **双主持人制**: 第一主持人（高校）+ 第二主持人（中小学/教研机构），两人均签字+单位盖章
- **选题指南四位代码**: Must match the call's 选题指南 exactly. Scan the guide for the code whose description best maps to the project's technical core. For EEG+AI+classroom-tool projects, 0208 (人工智能辅助科学教学工具) is the default match; 0108 (AI赋能科学教育) works for 重点课题.
- **Mixed review audience**: The panel often includes school principals (may have research training), district 教研员 (care about practicality), and frontline teachers (care about classroom burden). Write to satisfy all three — theoretical rigor for the principal, practical impact for the 教研员, low-friction deployment for teachers.
- **Team table with explicit roles**: Every member listed in the 团队成员表 must have a one-sentence role description (分工) that makes sense to all three audience types. The principal and 教研员 are team members, not external reviewers.
- **成果 requirements**: 一般课题 must deliver 研究报告1份 + 课程资源包1套 (教案+课件+实验指导手册) — this is more concrete than 社科基金's "系列论文"
- **Summary (摘要)**: 400字 cap, placed before the main body, must be a self-contained microcosm of the entire proposal
- **Title-code alignment**: The title MUST contain key nouns from the selected 选题指南 code's description. For 0208, that means "工具" and "课堂应用" must appear (code title = "人工智能辅助科学教学工具设计与课堂应用"). Missing these keywords is a fast track to rejection — reviewers scan for code-title alignment in the first 5 seconds. If the code says "工具" and your title only says "研究", you're already off-target.
- **Title reviewer psychology**: A title must hook three different reviewer types simultaneously — professors scan for theoretical novelty words (多模态/认知/模型), 教研员 scan for practical impact words (课堂/教学/工具), teachers scan for low-burden signals (轻量/不增加负担). The optimal title distributes one hook per reviewer type.
- **Buzzword avoidance**: Terms like "人工智能辅助" have become desensitized ("烂大街") from overuse. Prefer specific technical descriptors ("多模态感知", "脑电与视觉计算") over generic AI buzzwords. Specificity signals genuine technical depth.

### 10. Methodological upgrades that reviewers notice

When adapting a proposal, these structural additions significantly improve perceived rigor without changing the core research question:

- **三臂实验设计 (three-arm design)**: Always consider whether a two-arm design (experiment + control) can be upgraded to three arms by adding a 无穿戴对照组 (no-wearable control). This controls for Hawthorne effect (the wearable device itself changing behavior). Reviewers in education/psychology panels recognize this as a methodological sophistication signal.

- **离线定位声明 (offline vs real-time positioning)**: If the system involves physiological data collection (EEG, eye tracking), explicitly state whether analysis is offline/post-hoc or real-time. A vague description invites reviewers to attack feasibility. Pattern: "本研究的定位为离线分析与事后教学策略优化，而非课堂实时干预系统。实时闭环干预将作为本研究产出基础上的后续探索方向。"

- **推论边界限定 (inference boundary)**: Explicitly limit external validity claims. Pattern: "研究发现的推论范围限定于同质化教学情境（同一学校、同一年级、同一学科内容），不做跨校、跨区域或跨学段的外推。"

- **预警阈值规则 (threshold quantification)**: When using within-subject baseline normalization, specify the exact statistical rules rather than vague descriptions. Pattern: "θ/α比值在个体静息态均值μ±1σ范围内为流畅区；超出μ+1σ且持续10秒以上为吃力区；超出μ+2σ且持续30秒以上为停滞区。"

- **小样本策略 (small-sample strategy)**: If N < 15, address the limitation proactively with a specific fallback (transfer learning from prior datasets, feature engineering for cross-subject generalization).

- **可解释性分析 (interpretability)**: When ML classifiers drive pedagogical decisions, explicitly mention interpretability techniques (SHAP, LIME) to address the "black box → teacher trust" gap.

- **教师人工决策声明 (teacher-mediated intervention)**: If interventions are part of the design, clarify whether they are system-triggered or teacher-mediated. Teacher-mediated is more ecologically valid and avoids "AI replacing teacher judgment" pushback. Pattern: "所有教学支持策略均由教师基于课后多模态分析报告人工决策实施，暂不涉及自动化的实时干预系统。"

### 11. Matching project to direction code when the approach shifts

When the collaborator (especially the teacher co-PI) changes the core pedagogical approach, re-check the code match:

- **微视频路线 (single-session video)**: Maps to 0208 (人工智能辅助科学教学工具). Focus is on building a tool that works during one class period.
- **长作业链路线 (multi-week homework chain)**: Maps to 0204 (跨学科主题学习实施路径探索). Focus shifts from "we built a tool" to "we designed an implementation pathway with embedded assessment."

The trigger: if the teacher says "我们不是只看一段视频，而是一个持续2-4周的长作业", the narrative must pivot from tool-centric to pathway-centric.

### 12. Merging multiple AI-drafted versions

When the user provides drafts from multiple prior AI conversations (Gemini, DeepSeek, Kimi, etc.), the merge protocol is:

1. **Identify non-negotiable upgrades in the current version** — things the newer draft added that the older one lacks (e.g., 脑电微状态, PLV功能连接, 认知数字孪生, 教研闭环)
2. **Identify methodological strengths in the older version** — typically the result of multiple rounds of simulated expert review (e.g., 三臂设计, 阈值规则, 推论边界, 可解释性)
3. **Merge don't replace** — the goal is "两个版本的叠加优势", not choosing one over the other
4. **Preserve the code alignment** — the older version may not have been written for a specific 选题指南 code; the current version's code choice (0204, 0208, 0108) must survive the merge
5. **Don't downgrade** — if the current version has a stronger theoretical framework (数字孪生) or methodological depth (微状态), those are not sacrificed in favor of the older version's simplicity

**When to use each version**:
- 教育部版: For internal team alignment, technical appendix, or re-adapting to other tech-focused funders
- 社科基金版: For 国家社科基金, 教育部人文社科 (similar structure), provincial社科基金

### 8. The application workflow (what the user actually does)
```
Receive call for proposals →
  1. Open projects/XX_Zone/index.md → find last version
  2. Open collaborators/collaborators.yaml → assemble team by expertise
  3. Pull modules: 技术路线 + 创新点 + 可行性 + 经费
  4. Open templates/ for funder-specific skeleton
  5. Splice → add new content → submit
```

## Design Principles
- **Modules over templates**: reusable text blocks are more valuable than empty skeletons
- **Three indexes for collaborators**: by person, by expertise, by project — different questions need different lookups
- **Separate literature from projects**: Zotero repos manage papers; research-mgmt manages people, money, and deadlines
- **Archive, don't delete**: rejected applications are source material for the next attempt

### 9. Team structure diagram for grant proposals

When the proposal has a multi-institution collaborative team (高校 + 中小学 + 教研), generate a clean SVG team structure diagram. The diagram makes the collaboration structure visible at a glance — critical for reviewers evaluating whether the partnership is substantive or nominal.

**Pattern**: "四方双向合作共同体"
- Left column: 高校双核心 (第一主持人 + 院长/教授)
- Center: 交汇场景 (the specific teaching/research context where both sides meet)
- Right column: 中学双核心 (第二主持人 + 校长)
- Bottom bar: 区教研员 as independent quality node, spanning both sides
- Bottom flow strip: 问题→方案→验证→推广 cycle

**Color scheme**: University side = blue (#eff6ff / #2563eb), Middle school side = green (#ecfdf5 / #059669), Intersection = amber (#fef3c7 / #f59e0b), Researcher = purple (#f5f3ff / #7c3aed). White background for embedding in documents.

**Two output formats**:
- `.svg`: Pure vector, embeddable in Markdown (`![](diagram.svg)`)
- `.html`: Standalone browser view for screenshots into PPT

**Key rule**: Use `[姓名]` / `[院长]` / `[校长]` placeholders — never expose real names in files that could leak. Each person box shows: role tag (第一主持人/核心成员/独立第三方), name placeholder, institution + title, and one-line role description.

### 13. Proposal final-polish checklist

When the technical content is settled, these small structural edits significantly improve readability for reviewers who may only scan:

- **摘要三段式**: Break a monolithic summary paragraph into **问题 / 方法 / 交付** three labeled segments. Reviewers skim the summary first — make each segment self-contained.
- **团队介绍合并**: If a proposal has both a "团队组成" section and a "团队特色" section that overlap, merge them into one "团队组成与特色" section.
- **时间表用实际月份**: Replace "第1-3月" style timeline with actual calendar months tied to the academic calendar.
- **课题类别核对**: Always double-check "重点课题" vs "一般项目" — the single most common copy-paste error in Chinese grant applications.

## Common Pitfalls
- **Don't mix this with literature management repos** — literature goes in Zotero repos, project management goes here
- **Don't write generic modules** — each must be specific enough to be immediately useful for a real application
- **Keep collaborator DB updated** — stale contact info is worse than no contact info
- **One index.md per zone** — if a zone has no projects yet, the index.md still exists with "no active projects"
- **Application calendar must include annual reminders** — not just specific projects, but recurring funder cycles
