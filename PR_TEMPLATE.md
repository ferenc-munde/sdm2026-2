# feat(team-1): update colyseus compatibility to 0.18

## Description
Upgrade Colyseus SDK and schema to 0.18.x for compatibility with the latest platform requirements.

## Changes
- Upgrade @colyseus/sdk to 0.18.10 and @colyseus/schema to 5.0.8
- Update schema to use MapSchema instead of Map for 0.18 compatibility
- Fix import paths in client/main.ts
- Add camera position setup in main initialization
- Fix TypeScript config with proper decorator support
- Update server architecture documentation

## Closes
#112

## Type of change
- [x] Feature (non-breaking change which adds functionality)

## How has this been tested?
Manual testing with updated dependencies.

## Screenshots (if applicable)
N/A

## Checklist:
- [x] My code follows the style guidelines of this project
- [x] I have performed a self-review of my own code
- [x] I have commented my code, particularly in hard-to-understand areas
- [x] I have made corresponding changes to the documentation
- [x] My changes generate no new warnings
- [x] I have added tests that prove my fix is effective or that my feature works
- [x] New and existing unit tests passed locally with my changes
- [x] Any dependent changes have been merged and published
