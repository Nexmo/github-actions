# Station Check Documentation Changes

This action checks if there were any changes to documentation markdown files in a push to the master branch.

## Usage

Add the following to `.github/main.workflow`:

```
workflow "Check Docs Changes" {
  resolves = ["check-docs-changes"]
  on = "pull_request"
}

action "check-docs-changes" {
  uses = "nexmo/github-actions/check-docs-changes@master"
  secrets = [
    "GITHUB_TOKEN"
  ]
}
```

## Configuration

None required. This action is designed to work specifically with instances of [Station](https://github.com/nexmo/station)
