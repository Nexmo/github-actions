# NDP Check Redirects

When deleting/renaming content on Nexmo Developer, sometimes we forget to add redirects to replacement content and customers get a 404 on their saved links. This action fails the build when it detects a rename without a redirect added

> This action only checks the `_documentation` folder. It does not currently work for tutorials or use cases

## Usage

Add the following to `.github/workflows/check-redirects.yml`:

```yaml
name: Check Redirects
on:
  pull_request:
    types: [opened, synchronize]
jobs:
  check-redirects:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@master
      - name: check-redirects
        uses: nexmo/github-actions/ndp-check-redirects@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Configuration

None required. This action is designed to work specifically with [Nexmo Developer](https://github.com/nexmo/nexmo-developer)

## How it works

- Fetch the changes between the branch you're merging in to and the current PR branch
- Build a list of renamed and removed files in the `_documentation` folder
- Load the redirects files
- For each renamed or removed file, check that there is an entry in the redirects file
- If not, fail the build
