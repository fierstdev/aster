# Aster 1.0 release checklist

## Verify the candidate

- Confirm the library version is `1.0.0` and the generated starter requests `^1.0.0`.
- Review the changes since `v1.0.0-alpha.4` and date the 1.0 changelog entry when cutting the release.
- Run the release checks from a clean checkout with the Node version in `.node-version`.

```bash
vp install
npm exec -- playwright install chromium firefox webkit
vp check
vp test --run
vp build
vp pack
npm pack --dry-run
npm run test:package
```

The package smoke test installs the tarball in a temporary directory and runs its CLI. Chromium, Firefox, and WebKit check the generated app in development and production, a server-rendered island on its first click, and Astro hydration, slots, and client navigation.

## Publish the verified commit

1. Confirm GitHub CI passes for the release commit. Check that the `npm-publish` environment has the intended reviewers and that npm's trusted publisher matches the repository, environment, and `publish.yml` workflow.
2. Create the version tag on that commit when the release is approved. Pushing the tag starts the npm publish workflow.

```bash
git tag -a v1.0.0 -m "Aster v1.0.0"
git push origin v1.0.0
```

3. Approve the protected environment, then verify the npm version, `latest` dist-tag, and provenance. The workflow assigns prereleases to `next`.
