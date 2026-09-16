# Phase 1 — Foundation: Canonical Data + Confirm Profile

Goal: one DB of record, clean Resume vs Profile split, dead-simple onboarding.

## 1. Fix split-brain (do first)
- API DB stays canonical for product: Candidate/Profile, Original Resume, Parsed Resume, Tailored Resume, Jobs, Applications, Usage.
- Resume-agent keeps processing infra but must write through API or same schema — no second truth for "current resume".
- Decision to lock: API `ResumeFile/Extraction/Profile` + agent `Resume/Variant/IR/Artifact/CompileJob` merge into single ownership model. No dual answers.

## 2. Resume vs Profile (separate concepts)
Resume = raw document:
`file, parsed_content, sections, experience[], education[], projects[], skills[], version`

Profile = operational subset used for matching:
```
totalExperience
seniority
skills[]
preferredRoles[]
preferredLocations[]
workMode
industries[] (optional)
```
Do NOT match on `totalExperience` alone. Same 3 years with React/TS vs Python/Django = different job universe.

## 3. Onboarding (resume bootstraps profile)
```
Signup/Login → Upload Resume → Processing → "Here's what we understood" → Edit/Confirm → Dashboard
```
- No 7-step wizard. No manual `Years: ___ Skills: ___` when agent already knows.
- Confirm screen must show: Experience, Primary roles, Skills, Preferred location, Seniority + [Confirm profile] / [Edit].
- Only after confirm does job discovery unlock. This is the contract:
`Resume Agent → Candidate Profile → Job Agent → Match → Tailor → Apply`
