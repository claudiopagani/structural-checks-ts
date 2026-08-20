# Release procedure

`structural-checks-ts` follows Semantic Versioning. During `0.x`, PATCH releases contain bug fixes
with no intended public API break. MINOR releases may add functionality and may make deliberate,
documented public-contract revisions while the library matures.

## One-time publication of 0.1.0

npm Trusted Publishing can be configured only after the package exists. A maintainer must therefore
bootstrap `0.1.0` interactively. These steps have not been executed by this repository-preparation
change.

```sh
git status --short
npm run release:verify
git push origin master
git tag -a v0.1.0 -m "structural-checks-ts 0.1.0"
git push origin v0.1.0
git checkout --detach v0.1.0
test "$(node --print "require('./package.json').version")" = "0.1.0"
npm login
npm run release:verify
npm publish --access public
npm view structural-checks-ts@0.1.0 name version dist.tarball --json
```

Use the maintainer account with two-factor authentication and complete any interactive one-time
password challenge. The tag must point to the already-reviewed release commit; do not version-bump
or modify files from detached HEAD.

After the package exists, install npm 11.15 or newer and configure the exact GitHub workflow as its
trusted publisher:

```sh
npm install --global 'npm@^11.15.0'
npm trust github structural-checks-ts --file publish.yml --repo claudiopagani/structural-checks-ts --allow-publish
```

The equivalent npm website settings are: GitHub owner `claudiopagani`, repository
`structural-checks-ts`, workflow `publish.yml`, and allowed action `npm publish`. Verify a trusted
release before restricting traditional token publishing according to npm security guidance. The
workflow deliberately contains no long-lived npm token.

## Subsequent 0.x releases

1. Update `package.json`, `package-lock.json`, and this changelog to the same version.
2. Run `npm run release:verify`, inspect `npm pack --dry-run --json`, and review the complete diff.
3. Commit the release, push it, create and push the matching annotated `vX.Y.Z` tag.
4. Publish a GitHub Release for that exact tag.
5. Let `.github/workflows/publish.yml` verify the tag, rebuild, test, and publish through npm
   Trusted Publishing; then verify with `npm view structural-checks-ts@X.Y.Z`.

npm staged publishing may be adopted later as an optional human-approval hardening step. It is not
required by the current release workflow.
