---
name: zotero-literature-management
description: Set up Zotero with Zotfile + cloud sync for multi-domain researchers. Design folder structures, tag taxonomies, and daily workflows. Use when a researcher needs to organize their literature across multiple research areas, or when setting up Zotero for the first time.
---

# Zotero Literature Management

## When to Use
User is a researcher (academic, grad student, or independent) who needs to set up or reorganize their Zotero library. Triggers: "organize my papers", "set up Zotero", "literature management workflow", "how to use Zotero for multiple research areas", or any mention of Zotero + PDF management.

## Architecture
```
Zotero (local)           ← metadata + tags + notes
    │
    ├── Zotero Sync       → cloud (300MB free, metadata only — NOT PDFs)
    │
    └── Zotfile plugin    → auto-rename PDFs → move to cloud-synced folder
                              │
                              ▼
                         OneDrive/Dropbox/Google Drive
                              │
                              ▼
                         All devices have PDFs
```

**Key insight**: Never sync PDF attachments through Zotero's cloud (fills up the 300MB). Use Zotfile to store PDFs in a cloud-synced folder, and Zotero sync for metadata only.

## Steps

### 1. Install Zotfile
- Download from https://zotfile.com
- Zotero → Tools → Add-ons → gear → Install Add-on From File
- Restart Zotero

### 2. Configure Zotfile
Zotero → Tools → Zotfile Preferences:

| Setting | Value |
|---------|-------|
| Location of Files | Custom Location → `C:\Users\...\OneDrive\Zotero_Papers` |
| Subfolder | `/%c` (mirrors Zotero collection structure) |
| Rename Format | `{%a_}{%y_}{%t}` → `Smith_2023_Thyroid_Cancer.pdf` |
| Auto-rename | ✅ Enable |

### 3. Configure Zotero Sync
Zotero → Edit → Settings → Sync:
- ✅ Sync automatically
- ✅ Sync full-text content
- ❌ **UNCHECK** "Sync attachment files in My Library" (OneDrive handles this)

### 4. Design folder structure
Interview the researcher about their domains first. Then build a structure around their actual research areas and projects — never use a generic template.

**Pattern**: One top-level folder per research domain, with sub-folders for active projects, specific methods, or paper stages.

```
📚 My Library
├── 🔬 Domain_A/
│   ├── _Active_Project_X/
│   ├── _Grant_Application_2026/
│   └── Methods/
├── 🧠 Domain_B/
├── 🎓 Teaching/
├── 📢 Outreach/
└── 📥 _Inbox/          ← ALL new papers land here first
```

Prefix with numbers for sort order if preferred: `01_Domain_A`, `02_Domain_B`.
### 5. Design tag taxonomy

Tags are cross-cutting — a paper in any folder can be tagged for retrieval across domains.

**Required tag categories**:
| Category | Examples |
|----------|----------|
| Method | `method:fMRI`, `method:GNN`, `method:EEG` |
| Status | `to-read`, `reading`, `done`, `citable` |
| Domain flag | `project:Grant2026`, `course:HCI101` |
| Modality | `modality:PET`, `modality:DTI`, `modality:eye-tracking` |

Keep tag names consistent. Use `:` as a namespace separator.

### 6. Reading depth tiers

Not all zones require the same reading depth. Assign each zone a tier and match note-taking style:

| Tier | Depth | Note Template | Zones |
|------|-------|---------------|-------|
| 🔴 Deep | Full paper + detailed notes | "Method + Sample + What this means for my project" | Core research |
| 🟡 Medium | Abstract + figures + one-sentence takeaway | "Method + Usable insight" | Adjacent research, teaching |
| 🟢 Light | Store and tag, read when needed | Keywords only | Outreach, side projects |

**Iron rule for notes**: Write in your own words. "This paper used ComBat on 3 cohorts — directly applicable to my ABIDE data" is infinitely more useful a year later than a pasted abstract.

### 7. Browser capture
Install **Zotero Connector** (Chrome/Edge/Firefox). One click on any paper page (PubMed, Google Scholar, journal sites, CNKI) captures metadata + PDF if available.

### 8. Daily workflow
```
See paper → Zotero Connector click → lands in _Inbox
                                          │
                                Weekly: clear _Inbox
                                          │
                          Drag to correct folder
                          Add 2+ tags (status + method minimum)
                          Right-click → Manage Attachments → Rename and Move
                                          │
                                PDF lands in OneDrive folder
                                OneDrive syncs to cloud
```

**Iron rule**: _Inbox must be cleared weekly. An overflowing inbox is a broken system.

### 9. Writing integration
Zotero's Word plugin (installed automatically) handles citations. Switch citation style per document (APA, GB/T 7714, journal-specific). Insert bibliography with one click.

## Multi-device setup
| Device | Software | Sees |
|--------|----------|------|
| Office PC | Zotero + Zotfile + OneDrive | Everything (main) |
| Laptop | Zotero + OneDrive | Metadata via sync, PDFs via OneDrive |
| Phone | Zotero app + OneDrive app | Metadata on-the-go, PDFs viewable |
| Any browser | zotero.org | Metadata only |

## Multi-repository split
When a researcher has many domains (>5), split literature into separate Git repos by theme cluster. Each repo gets its own Zotero collection tree, README, and independent sync. This keeps repos focused and avoids a single monolithic Zotero export.

**Pattern**: 2-3 repos maximum. Group domains by natural affinity (e.g., all neuro/medical in one, all education/tools in another).

Each repo contains:
```
repo-name/
├── README.md          # lists zones in this repo
├── config/            # Zotero structure, Zotfile config
├── docs/              # workflow, zone descriptions
└── templates/         # inbox cleanup checklist, reading notes
```

## Common Pitfalls
- **Don't sync PDFs through Zotero** — use Zotfile + cloud storage instead
- **Don't skip clearing _Inbox** — it grows exponentially
- **Don't over-tag** — 2-3 tags per paper is enough; add more later if needed
- **Zotfile renames only when you trigger it** — use "Rename and Move" or enable auto-rename
- **OneDrive path must be consistent across machines** — same absolute path or use symbolic links
- **Don't split beyond 3 repos** — more repos means more weekly Inbox clearing overhead
