---
name: chinese-faculty-homepage-scraper
description: Scrape structured academic profile information from Chinese university faculty homepages and fill application forms (申报表/汇总表/推荐表). Use when the user provides a faculty homepage URL and needs to extract info for a grant application, mentor nomination, or collaborator profile.
---

# Chinese Faculty Homepage Scraper & Form Filler

## When to Use
User provides a Chinese university faculty homepage URL (`.shu.edu.cn`, `.csu.edu.cn`, etc.) and needs structured profile data to fill an academic form — 导师推荐表, 申报汇总表, 专家信息表, or any grant/application form requiring external collaborator information.

## Key Insight
Chinese university faculty pages use a common CMS template (Visual SiteBuilder / 站群系统). The HTML structure is predictable: personal info in a left sidebar, content in a right panel. Most key fields are extractable with simple curl + text processing. **Birth year is almost never on these pages** — always flag it as missing.

## Steps

### 1. Fetch the homepage
```bash
curl -sL --connect-timeout 10 --max-time 15 "URL" \
  -H "User-Agent: Mozilla/5.0 (Linux x86_64) AppleWebKit/537.36"
```
The `-L` follows redirects; the User-Agent avoids bot blocking.

### 2. Extract structured fields
Strip HTML tags first: `sed 's/<[^>]*>//g'` then grep for key Chinese field names:

| Search Pattern | Typical Label | What It Yields |
|---------------|--------------|----------------|
| `教授.*博导` | Job title line | 教授/博导/硕导 |
| `职务：` | Position | 所长/主任/负责人 |
| `毕业院校：` | Alma mater | PhD granting institution |
| `办公地点：` | Office | Campus building |
| `Email:` | Contact | Academic email |
| `主持.*国家` | Grants | NSFC grants, total funding |
| `SCI.*论文.*[0-9]+余篇` | Publications | Paper count |
| `发明专利.*[0-9]+` | Patents | Patent count |
| `担任.*学会` | Academic service | Society positions |
| `获.*奖` | Awards | Named awards |
| `主要研究` | Research direction | Core research area |
| `[0-9]{4}年获.*学士` | Education timeline | Degree years (indirect age estimate) |

### 3. Map to form fields
Parse the extracted text into the target form's field structure. Always cross-reference against what you already know from memory.

### 4. Flag gaps explicitly
- **Birth year**: Almost never on homepage → ask user
- **Exact grant titles**: Usually summarized → ask user if precision needed
- **Representative papers**: Page may have a separate publications section → check nav links

### 5. Fill the form
Present as a filled table with explicit ⚠️ markers for missing/unconfirmed fields.

## Common Pitfalls
- Don't use browser tools — Chinese university sites are often lightweight HTML, browser overhead is unnecessary
- The page title `<title>` often contains the full unit name — extract it
- Meta description may contain keyword tags that are more structured than the body text
- If the page has `_sitegray` scripts, it's a Visual SiteBuilder template — the structure is highly predictable
- For `.shu.edu.cn` specifically: personal info in `class="teacherjj"` div, content in `class="content"` div

## Example: 蒋皆恢 (Shanghai University)
- URL: `https://jiangjiehui.shu.edu.cn/`
- Unit: 上海大学通信与信息工程学院
- Title: 教授 博士生导师 硕士生导师
- Position: 上海大学生物医学工程研究所所长
- PhD: 荷兰代尔夫特理工大学 (2012)
- BA/MA: 上海大学 (2004/2007)
- Research: PET/MRI智能医学影像分析, 阿尔茨海默病/帕金森病早期诊疗
- Grants: NSFC面上/青年/重点国合 + 国家科技创新2030重大专项课题, 累计1500余万
- Publications: SCI 140余篇
- Patents: 20余项
- Birth year: NOT on homepage
