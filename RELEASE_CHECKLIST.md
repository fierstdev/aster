# Aster Public Release Checklist

Follow this sequence for the very first public release of `@fierst/aster` (and `@fierst/ui`) to npm, GitHub, and Cloudflare.

---

## 1. Repository & Package Metadata
- [ ] Confirm your GitHub organization/repo URL and update `repository.url`, `homepage`, `bugs.url` in `package.json` and owner handle (`@fierstdev`) in `.github/CODEOWNERS` so they match your real GitHub repository **exactly** (case-sensitive—required for npm OIDC Trusted Publishing provenance verification).
- [ ] Choose your initial public version in `package.json` and `template/package.json` (e.g. `1.0.0-alpha.1` or `0.1.0`).

## 2. Local Release Gate & External Tarball Smoke Tests
```bash
vp install
vp dlx playwright install chromium
vp check
vp test
vp pack
vp build
npm pack --dry-run
```
- [ ] Run `npm pack` to produce `fierst-aster-*.tgz`.
- [ ] Install the local `.tgz` into a throwaway folder outside this repo scaffolded via `node bin/create.mjs /tmp/aster-smoke`, verify `vp dev`, `vp build`, and `dist/aster-manifest.json`.
- [ ] Test `@fierst/aster/astro` inside a fresh Astro project with `client:visible`, `client:only="aster"`, named slots, and `<ClientRouter />`.

## 3. One-Time npm Bootstrap & OIDC Trusted Publishing Lock-Down
1. **Bootstrap the package name once locally** using interactive hardware/app 2FA:
   ```bash
   vp pack
   npm publish --access public --tag next
   ```
   *(npm requires the package record to exist before you can attach a Trusted Publisher.)*
2. **Create the protected GitHub Environment:**
   - In GitHub repo *Settings → Environments*, create **`npm-publish`**.
   - Enable **Required reviewers** (add yourself) and restrict deployment branches/tags to `v*`.
3. **Bind Trusted Publisher on `npmjs.com`:**
   - Open your package on `npmjs.com` → *Settings → Trusted Publisher → GitHub Actions*.
   - Enter exact **Organization/User**, **Repository**, **Workflow filename** (`publish.yml`), and **Environment name** (`npm-publish`).
   - Run your first OIDC publish within 48 hours so the pending binding activates.
4. **Lock down publishing access on `npmjs.com`:**
   - Under *Settings → Publishing access*, select **"Require two-factor authentication and disallow tokens"**.
   - Revoke any legacy automation tokens on your npm account.
5. **Enable GitHub Tag Protection:**
   - Under *Settings → Rules → Rulesets*, protect `refs/tags/v*` so only maintainers can push release tags.

## 4. Cut & Publish a Release via Tag
```bash
git tag -a v1.0.0-alpha.1 -m "Aster v1.0.0-alpha.1"
git push origin v1.0.0-alpha.1
```
- Approve the `npm-publish` environment prompt in GitHub Actions.
- Verify the green **Provenance** badge appears on `https://www.npmjs.com/package/@fierst/aster`.

## 5. Deploy Public Sites
- [ ] Deploy `aster.fierst.dev` (with `/learn`, full 37-file docs from `fierst-aster-docs-v1.zip`, and `/llms.txt` at site root) to Cloudflare Pages / Workers.
- [ ] Deploy `ui.fierst.dev` (`@fierst/ui`, serving `public/r/*.json` with `Access-Control-Allow-Origin: *`).
