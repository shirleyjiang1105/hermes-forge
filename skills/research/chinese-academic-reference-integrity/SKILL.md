---
name: chinese-academic-reference-integrity
title: Chinese Academic Document Reference Integrity Check
description: >
  Verify that every reference in a Chinese academic document (论文/申报书/研究计划书/开题报告)
  is a real, verifiable publication, and that in-text citations match reference list entries
  one-to-one. Use when the user is finalizing a Chinese academic document, has found a suspicious
  reference, or asks to verify 参考文献/引用完整性/文献真实性.
version: 1.0.0
author: Hermes
metadata:
  hermes:
    tags: [Chinese, Academic Writing, References, Citations, Integrity, Verification]
    category: research
---

# Chinese Academic Document Reference Integrity Check

## When to Use
- User is finalizing a Chinese academic document before submission
- User finds or suspects a fake/nonexistent reference
- User asks to "检查参考文献" / "验证引用" / "文献查证"
- After adding or replacing any reference — always cross-check body↔list
- As part of a "final polish" workflow for 申报书/研究计划书/开题报告/毕业论文

## The Rule (Red Line)
**Every reference must be a real, verifiable publication.** Fabricating references — even one — is an absolute red line that can destroy the user's academic credibility. If a real replacement cannot be found, remove the citation entirely rather than invent one.

Additionally, in-text citations and reference list entries must match one-to-one:
- Every `[N]` in the body must have a corresponding entry in the reference list
- Every entry in the reference list must be cited at least once in the body
- No "ghost citations" (cited in body, missing from list) or "orphan references" (in list, never cited)

## Procedure

### Step 1: Extract all in-text citations
Scan the body text for all citation markers: `作者（年份）`, `Author et al. (年份)`, `[N]` format.
Build a set: `{citation_key_1, citation_key_2, ...}`

### Step 2: Extract all reference list entries
Parse the reference list (usually at document end, under 参考文献) for all `[N]` entries.
Build a set: `{ref_key_1, ref_key_2, ...}`

### Step 3: Cross-check
- **Ghost citations**: in `body_set` but not in `ref_set` → must add to reference list or remove from body
- **Orphan references**: in `ref_set` but not in `body_set` → must cite in body or remove from list
- **Mismatched numbering**: if using `[N]` format, verify sequential numbering

### Step 4: Verify authenticity
For every reference in the list, check that it is a real, verifiable publication:
- **Preferred**: find a DOI, CNKI link, or Google Scholar entry
- **Minimum**: the author names, title, journal, year, volume, pages must form a coherent and plausible citation
- **Red flags**: generic author names (Zhang Y, Li X, Wang M), impossibly perfect alignment with the user's thesis, anything that looks "too convenient"

### Step 5: Report findings
Present a table:

| 引用 | 状态 | 说明 |
|------|------|------|
| [8] 潘亚楠... | ✅ 真实 | CNKI可查 |
| [9] Zhang... | ❌ 虚构 | 无法验证 → 已替换为Cheng(2017) |

### Step 6: Fix violations
- For fake references: search for real alternatives on the same topic. If none found, remove the citation and adjust the body text.
- For ghost/orphan: add or remove as appropriate. Renumber if needed.
- After all fixes, re-run Step 3 to confirm zero violations.

## Pitfalls
- **Don't trust your training data**: LLM training data contains many plausible-sounding but fabricated citations. If you "remember" a paper, verify it before using it.
- **Chinese names can be tricky**: "李明" and "王强" are extremely common and often appear in fabricated citations. Be extra suspicious of generic author names.
- **Conference papers vs journal papers**: ICWSM, AAAI, ACL are real venues but the specific paper may not exist. Verify the title, not just the venue.
- **ArXiv preprint ≠ published**: An arXiv ID is better than nothing but still requires verification that the preprint actually exists.
- **Reference format doesn't guarantee existence**: A well-formatted citation in proper GB/T 7714 or APA format proves nothing about whether the paper is real.
- **Never silently remove a user's real reference**: If the user provided the reference themselves (e.g., from CNKI), it's likely real. Only flag references that you or previous turns introduced.

## Relationship to Other Skills
- `chinese-academic-abbreviation-check`: Run abbreviation check separately. The two skills address orthogonal concerns.
- `research-paper-writing`: That skill targets English ML conference papers; this skill targets Chinese academic documents across all disciplines.
