# Auto-raise Github PRs on commit to master

We use submodules for some of our projects to allow for a single soure of truth. Keeping our main project up to date with these changes can be quite painful. This action runs on `push` to a repo's master branch, and updates the submodule in another repo automatically and raises a pull request

## Example Usage

Add the following to `.github/workflows/update-submodule.yml`:

```yaml
name: Update Submodule
on:
  push:
    branches:
      - master
jobs:
  build:
    name: Update Submodule
    runs-on: ubuntu-latest
    steps:
      - uses: nexmo/github-actions/submodule-auto-pr@master
        env:
          GH_ADMIN_TOKEN: ${{ secrets.GH_ADMIN_TOKEN }}
          PR_ACTIVE_BRANCH: master
          PR_BRANCH_NAME: automated-oas-update
          PR_SUBMODULE_PATH: _open_api/api_specs
          PR_TARGET_BRANCH: master
          PR_TARGET_ORG: nexmo
          PR_TARGET_REPO: nexmo-developer
          PR_TITLE: API Specification Update
```

## Configuration

- `GH_ADMIN_TOKEN` - a custom github token to use to make API requests. The default `GITHUB_TOKEN` provided is scoped to the current repo, and we want to change other repos
- `PR_TARGET_ORG` - the name of the organisation that owns the repo that a PR will be created on
- `PR_TARGET_REPO` - the name of the repo that a PR will be created on
- `PR_SUBMODULE_PATH` - the path to the submodule that needs updating
- `PR_BRANCH_NAME` - the name of the branch to create when updating submodules
- `PR_TITLE` - the title to use for the PR. This will also be your commit message
- `PR_TARGET_BRANCH` - the branch that we want to merge our PR in to
- `PR_ACTIVE_BRANCH` - check if the push was to this branch before continuing (usually `master`)

## How it works

### In the repo that uses this action

- Someone commits to the default branch in a repo that uses this action

### In `PR_TARGET_REPO`

- Create `PR_BRANCH_NAME` if it does not already exist
- Create a commit with the new submodule SHA
  - If `PR_BRANCH_NAME` is created, a new commit is added on top of the latest commit on the default branch
  - If `PR_BRANCH_NAME` only contains a single commit, a new commit will be force pushed with the new submodule commit
  - If there is more than 1 commit, the new submodule will be added as a new commit to the existing tree
- Create a PR named `PR_TITLE` if there is not currently a PR open for `PR_BRANCH_NAME`
- Assign the PR to the person that merged the commit to the default branch
