---
name: chinese-academic-docx
description: Convert Chinese academic paper drafts (Markdown) into properly formatted DOCX for journal submission. Handles 黑体/宋体/楷体 fonts, A4 layout, section hierarchy from MD parsing, abstract/keyword styling, and GB/T 7714 references. Use when the user has an MD paper draft and needs a submission-ready Word file for Chinese education or medical journals.
triggers:
  - converting Chinese paper from MD to DOCX
  - generating Word version of a Chinese academic manuscript
  - formatting paper for Chinese journal submission
  - user says "生成word版" or "转成word" for a Chinese paper
  - preparing 初稿/终稿 DOCX for 中国医学教育技术 / 电化教育研究 / etc.
tools: execute_code, write_file, read_file
---

# Chinese Academic Paper MD → DOCX Conversion

## When to use
When the user has a Chinese academic paper in Markdown (or wants to generate one) and needs a properly formatted .docx file ready for journal submission. Target journals include 《中国医学教育技术》《电化教育研究》《医学教育研究与实践》《中华医学教育杂志》etc.

## Font conventions for Chinese academic journals

| Element | Chinese font | English font | Size (pt) | Bold |
|---------|-------------|-------------|-----------|------|
| Paper title | 黑体 | Times New Roman | 18 | Yes |
| Subtitle | 黑体 | Times New Roman | 14 | No |
| Authors | 仿宋 | Times New Roman | 12 | No |
| Affiliation | 楷体 | Times New Roman | 9 | No |
| Abstract label [摘 要] | 黑体 | Times New Roman | 9 | Yes |
| Abstract body | 楷体 | Times New Roman | 9 | No |
| Keywords label [关键词] | 黑体 | Times New Roman | 9 | Yes |
| Keywords body | 楷体 | Times New Roman | 9 | No |
| Section heading (一、引言) | 黑体 | Times New Roman | 14 | Yes |
| Subsection heading (3.1) | 黑体 | Times New Roman | 12 | Yes |
| Body text | 宋体 | Times New Roman | 10.5 | No |
| References | 宋体 | Times New Roman | 9 | No |

## Page setup
- A4: 21cm × 29.7cm
- All margins: 2.5cm
- Line spacing: 1.5× for body, 1.25× for references
- Body paragraphs: first-line indent 0.74cm (2 Chinese characters)

## MD structure expected
```markdown
# Title
## Subtitle
Authors
(Affiliation)
### [摘 要]
abstract text
### [关键词]
keywords
### 一、引言
body text
#### 3.1 Subsection
body text
### 参考文献
[1] ref text
```

## Implementation

Use python-docx with the following pattern. Key points:
- Font setting requires both `run.font.name` (for English) and `run._element.rPr.rFonts.set(qn('w:eastAsia'), cn_name)` (for Chinese)
- Section headings are detected by `### 一、` through `### 七、` patterns
- Body paragraphs are grouped (consecutive non-empty lines form one paragraph) before rendering
- `**bold**` markers in MD are stripped during DOCX generation (not rendered as bold by default; manual post-processing if needed)

```python
from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
import re, os

doc = Document()
for section in doc.sections:
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.5)

def sf(run, cn, en, sz, bold=False):
    """Set both CJK and Latin fonts on a run"""
    run.font.size = Pt(sz)
    run.bold = bold
    run.font.name = en
    run._element.rPr.rFonts.set(qn('w:eastAsia'), cn)

def ap(text, cn='宋体', en='Times New Roman', sz=10.5, bold=False, align=None, sa=Pt(6), fi=None):
    """Add a paragraph with font settings"""
    p = doc.add_paragraph()
    if align is not None:
        p.alignment = align
    p.paragraph_format.space_after = sa
    p.paragraph_format.line_spacing = 1.5
    if fi:
        p.paragraph_format.first_line_indent = fi
    r = p.add_run(text)
    sf(r, cn, en, sz, bold)
    return p

# --- Parse MD into sections ---
with open(md_path, 'r') as f:
    content = f.read()

body_start = content.find('### 一、')
body_end = content.find('### 参考文献')
if body_end == -1:
    body_end = len(content)
body = content[body_start:body_end]

sections = re.split(r'\n(?=### )', body)
for sec in sections:
    lines = sec.strip().split('\n')
    header = lines[0].strip().lstrip('#').strip()
    ap(header, '黑体', sz=14, bold=True, sa=Pt(6))
    
    # Group remaining lines into paragraphs (blank lines = paragraph break)
    para_lines = []
    for line in lines[1:]:
        stripped = line.strip()
        if not stripped or stripped.startswith('---'):
            if para_lines:
                text = ' '.join(para_lines).replace('**', '')
                ap(text, '宋体', sz=10.5, fi=Cm(0.74), sa=Pt(3))
                para_lines = []
            continue
        if stripped.startswith('#### '):
            if para_lines:
                text = ' '.join(para_lines).replace('**', '')
                ap(text, '宋体', sz=10.5, fi=Cm(0.74), sa=Pt(3))
                para_lines = []
            ap(stripped.lstrip('#').strip(), '黑体', sz=12, bold=True, sa=Pt(4))
            continue
        para_lines.append(stripped)
    
    if para_lines:
        text = ' '.join(para_lines).replace('**', '')
        ap(text, '宋体', sz=10.5, fi=Cm(0.74), sa=Pt(3))

# --- References ---
ap('参考文献', '黑体', sz=14, bold=True, sa=Pt(6))
for ref in refs_list:
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.25
    p.paragraph_format.space_after = Pt(1)
    r = p.add_run(ref)
    sf(r, '宋体', 'Times New Roman', 9)

doc.save(output_path)
```

## Pitfalls
- `python-docx` font setting is counterintuitive: `run.font.name` sets Latin font, `rPr.rFonts.set(qn('w:eastAsia'), ...)` sets CJK font. Both must be set.
- If `Noto Sans CJK SC` or `Noto Serif CJK SC` fonts are installed, those can substitute for 黑体/宋体/楷体 if the system lacks them.
- MD paragraph grouping: consecutive non-empty lines = one paragraph. Blank lines separate paragraphs. Don't join lines that should remain separate.
- First-line indent uses `Cm(0.74)` which is approximately 2 full-width Chinese characters at 10.5pt.
- Section parsing regex `\n(?=### )` only matches headings at the start of a line with `### ` prefix.
- The generated DOCX is for review/edit — the user should verify formatting (especially bold markers `**` which are stripped not rendered) before submission.
