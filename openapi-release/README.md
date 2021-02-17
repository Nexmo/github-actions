# Release OpenAPI on Push

Whenever we make a change to an OpenAPI document we'd like Github to tag a release. This can be used by people watching the repo, but also as a hook for other Github actions.

## Usage

Add the following to `.github/workflows/openapi-release:

```yaml
name: OpenAPI Release
on:
  push:
    branches:
      - main
jobs:
  releaseOAS:
    name: Release OAS
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@master
      - name: Release OAS
        uses: nexmo/github-actions/openapi-release@main
        env:
          GH_ADMIN_TOKEN: ${{ secrets.GH_ADMIN_TOKEN }}
```

## Configuration

- `GH_ADMIN_TOKEN` - a custom GitHub token to use to make API requests. This is needed if the Github action creates a release, it doesn't trigger the release event for actions
- `OAS_RELEASE_ACTIVE_BRANCH` - check if the push was to this branch before continuing (usually `main`)

## How it works

> This action relies on your pull request merge strategy being `Squash and Merge`

- Fetch the latest release for the repo
- Generate diff between HEAD and since the release commit
- Extract changed versions from all OpenAPI documents
- Ensure that the version number increased
- Fetch the PR that the commit belonged to
- For each changed specification, tag a new release in the format `<name>-<version>` where the release notes body is taken from the PR body
