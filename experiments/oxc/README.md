# Oxc compiler experiment

**Decision.** Pursue Oxc for build-time JSX lowering while retaining Aster’s slot emitter. Keep the candidate opt-in until opening-tag comment compatibility and source-map coverage are resolved. Browser parser selection remains open.

The baseline is Aster 1.0.0 at `bb2208b`. Both variants let Vite+ strip TypeScript first. The candidate then calls the installed Vite+ Oxc parser, walks JSX and export declarations, and reuses Aster’s template, binding, and island metadata emitters. The interactive editor continues to use the current browser compiler. There are no new package dependencies.

## Evidence

| Check                   | Result on Windows, Node 24.22.1, Vite+ 1.8.0                                                                                                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Differential output     | 19 of 20 compiler examples and lesson snippets emitted byte-identical JavaScript. Oxc rejected the existing opening-tag comment fixture. Ordinary JSX child comments worked.                                                                                                                               |
| Nested default argument | The baseline missed the exported arrow component in `export const Save = (label = getLabel()) => …`. Oxc recognized it and emitted its owner reference.                                                                                                                                                    |
| Composed Vite map       | In the original typed TSX fixture, the title and child expressions begin at zero-based columns 22 and 39 on line index 1. The candidate recovered both positions, including the offset after an emoji. The baseline mapped both to line index 0, column 0.                                                 |
| Integration             | With the candidate enabled, all 41 Node and 19 Chromium tests passed. Direct unit tests importing the baseline compiler still exercise that implementation. The differential harness tests the candidate separately.                                                                                       |
| Production build        | Eight warm, alternating builds per variant after warm-up gave medians of 60.0 ms for baseline and 61.9 ms for Oxc. The ranges overlapped. This sample covers the repository playground.                                                                                                                    |
| Production playground   | Both builds loaded the first lesson, processed a counter click, and recompiled an editor change in Chromium. The chunk containing the editor compiler was 8,587 bytes gzipped for both. Median observed time to the first preview button was about 60 ms for both over five fresh pages each on localhost. |

## Adoption criteria

The opening-tag syntax `<p {/* note */}>` has an explicit direct-compiler test. Choose a compatibility implementation or a documented migration before changing the default. The candidate maps selected JSX expression starts. A production map should also cover copied JavaScript, bindings, and multiline expressions. Add differential fixtures for both compiler entry points before maintaining a native build parser and a separate browser parser. A shared browser parser would require its own delivery-size and startup measurements.

## Reproduce

From the repository root, with the pinned dependencies and Playwright Chromium installed, run these PowerShell commands. The evaluation script selects each compiler internally.

```powershell
node experiments/oxc/evaluate.mjs
node experiments/oxc/playground.mjs
$env:ASTER_EXPERIMENT_OXC = '1'
npm test -- --run
npm run build
Remove-Item Env:ASTER_EXPERIMENT_OXC
```
