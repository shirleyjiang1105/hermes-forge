---
name: chinese-academic-defense-ppt
description: Convert Chinese academic project applications (申报书/课题申请书/教改项目书) into polished defense presentation PPTs. Use when the user shares a .docx application and needs a presentation for committee review, project defense, or colleague briefing.
---

# Chinese Academic Defense PPT Generator

## When to Use

- User shares a Chinese academic application document (申报书/课题申请书/docx) and asks to generate a PPT
- User says "汇报PPT", "答辩PPT", "给XX用", or references a defense/presentation
- The document follows standard Chinese academic application structure (课程基本情况, 团队, 建设目标, 建设内容, 特色创新, 进度安排, 预期成果)

## Workflow

### 1. Extract Content

Use python-docx or zipfile+XML to extract text from the .docx:

```python
import zipfile, xml.etree.ElementTree as ET
z = zipfile.ZipFile("申报书.docx")
xml = z.read("word/document.xml")
tree = ET.fromstring(xml)
ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
for p in tree.iter(f"{{{ns}}}p"):
    texts = [t.text for t in p.iter(f"{{{ns}}}t") if t.text]
    if texts: print("".join(texts))
```

### 2. Map Sections to Slides

Standard mapping for Chinese academic applications:

| Application Section | PPT Slide | Notes |
|---------------------|-----------|-------|
| 封面信息 | Slide 1: Title | Course/project name, presenter, institution, date |
| 课程/项目基本情况 | Slide 2: Overview | Key stats (credits, hours, audience, existing foundation) |
| 团队情况 | Slide 3: Team | Card layout, one per member, highlight roles |
| 已有基础 | Slide 4: Foundation | 2×2 or 4-column cards, existing resources |
| 建设目标 | Slide 5: Objectives | Numbered goals with metrics, "痛点→方案" structure |
| 建设内容 | Slide 6-7: Content | Split across 2 slides if >3 items |
| 特色与创新 | Slide 8: Innovations | 2×3 grid with numbered badges |
| 进度安排 | Slide 9: Timeline | Horizontal timeline with 4 phases + deliverables |
| 预期成果 | Slide 10: Outcomes | Numbered list with accent bars |
| — | Slide 11: Thank you | Presenter name, institution |

### 3. Design Principles

**Color Selection**: Match the topic. For Chinese cultural topics, consider red+gold+cream; for medical/technical, cool blues+white; for education, warm+professional. Never default to generic blue.

**Typography**: Use `Microsoft YaHei` for body, `STZhongsong` or `Georgia` for accent/title emphasis. Body 11-12pt, section headers 16pt, slide titles 24pt.

**Card Pattern** (most common layout element):
```javascript
function addCard(slide, x, y, w, h, title, bodyLines, opts = {}) {
  slide.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: C.cardBg }, shadow: makeShadow() });
  if (opts.accentColor) {
    slide.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.05, h, fill: { color: opts.accentColor } });
  }
  slide.addText(title, { x: x+0.2, y: y+0.08, w: w-0.4, h: 0.35, fontSize: 13, color: C.primary, bold: true });
  slide.addText(bodyLines, { x: x+0.2, y: y+0.42, w: w-0.4, h: h-0.5, fontSize: 11, color: C.text });
}
```

**Section Title Pattern** (on every content slide):
```javascript
slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.08, h: 5.625, fill: { color: C.primary } });
slide.addText(title, { x: 0.6, y: 0.3, w: 8.8, h: 0.6, fontSize: 24, color: C.primary, bold: true });
```

**Shadow Helper**: Wrap in factory function — never reuse shadow objects:
```javascript
const makeShadow = () => ({ type: "outer", blur: 4, offset: 2, angle: 135, color: "000000", opacity: 0.08 });
```

### 4. Content QA

```bash
python3 -m markitdown output.pptx | grep -iE "xxxx|lorem|ipsum"
```

If LibreOffice available, convert to images for visual QA:
```bash
soffice --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
```

## Pitfalls

- **NEVER use `#` prefix with hex colors** — causes file corruption
- **NEVER reuse option objects** — PptxGenJS mutates in-place. Use factory functions.
- **Always `breakLine: true`** between array text items or they run together
- **Don't use `lineSpacing` with bullets** — use `paraSpacingBefore/After` instead
- **Set `margin: 0`** on text boxes that need to align with shapes
- **Chinese fonts**: `Microsoft YaHei` is safe default; `STZhongsong` for classical/formal headers

## Dependencies

- `npm install pptxgenjs` — PPT generation
- `pip install "markitdown[pptx]"` — content extraction and QA
- LibreOffice + poppler — visual QA (optional)
