const { Toolkit } = require("actions-toolkit");
const Octokit = require("@octokit/rest");
const semver = require("semver");

Toolkit.run(async tools => {
  const requiredActiveBranch =
    process.env.OAS_RELEASE_ACTIVE_BRANCH || "master";

  tools.log.info(`Running on ${tools.context.ref}`);
  if (tools.context.ref != `refs/heads/${requiredActiveBranch}`) {
    tools.exit.neutral(
      `Expected refs/heads/${requiredActiveBranch}, got ${tools.context.ref}. Stopping execution`
    );
    return;
  }

  tools.log.info(`Correct branch found, generating release`);

  // Overwrite the access token to be one with more permissions
  tools.github = new Octokit({ auth: process.env.GH_ADMIN_TOKEN });

  // Cache some commonly used variables from the event
  const owner = tools.context.payload.repository.owner.name;
  const repo = tools.context.payload.repository.name;
  const commit_sha = tools.context.payload.after;

  // Generate a diff from the last tag to work out which files have been
  // updated, and how many of those are OAS documents. We assume that it's
  // an OAS document if it contains a `version:` line

  tools.log.debug(`Fetching latest tag commit hash`);

  let latestRelease = await tools.github.repos.listReleases({
    owner,
    repo,
    per_page: 1,
    page: 1
  });

  const before = latestRelease.data[0].target_commitish;

  tools.log.debug(`Latest tag commit hash: ${before}`);

  tools.log.debug(`Generating diff since that commit`);
  tools.log.debug(`From: ${before}`);
  tools.log.debug(`To: ${commit_sha}`);
  const commit = await tools.github.repos.compareCommits({
    owner,
    repo,
    head: commit_sha,
    base: before,
    mediaType: {
      format: ["diff"]
    }
  });
  tools.log.debug(`Diff generated. Extracting changed versions`);

  // Grab the from and to versions
  let versionChanges = {};
  let currentFile = "";

  commit.data.split("\n").forEach(line => {
    // Pull out the header
    // We have to use +++ b/ as if files are created, a/ doesn't exist
    if (line.substr(0, 6) == "+++ b/") {
      currentFile = line.substr(6);
      versionChanges[currentFile] = {};
    }

    if (line.substr(0, 11) == "-  version:") {
      versionChanges[currentFile].from = line.substr(11).trim();
    }
    if (line.substr(0, 11) == "+  version:") {
      versionChanges[currentFile].to = line.substr(11).trim();
    }
  });

  tools.log.debug(`Version changes extracted`);

  // Filter down to just .yml files
  versionChanges = Object.keys(versionChanges)
    .filter(key => key.match(/\.yml$/))
    .reduce((obj, key) => {
      if (Object.keys(versionChanges[key]).length) {
        obj[key] = versionChanges[key];
      }
      return obj;
    }, {});

  let changedOasFilesCount = Object.keys(versionChanges).length;

  // Case 1: No versions were updated. Exit as it could be a README update etc
  if (changedOasFilesCount === 0) {
    tools.exit.success("No version change detected. Exiting");
    return;
  }

  // Case 2: Multiple specifications were updated. Error!
  // If there are multiple changed versions we need to add a
  // changelog entry manually
  if (changedOasFilesCount > 1) {
    tools.exit.failure(
      `Multiple changes detected in a single commit. Manual changelog required: ${Object.keys(
        versionChanges
      ).join(", ")}`
    );
    return;
  }

  // What API did we update, and which versions are involved?
  let updatedApiName = Object.keys(versionChanges)[0];
  // Strip off the definitions/ leader and the suffix (including .v2 etc)
  let humanApiName = updatedApiName.split(".")[0].replace("definitions/", "");

  let fromVersion = versionChanges[updatedApiName].from;
  let toVersion = versionChanges[updatedApiName].to;

  // If it's a new OAS doc there is no previous version
  fromVersion = fromVersion || "0.0.0";

  if (fromVersion && !toVersion) {
    tools.exit.failure("The version key is missing in the new commit");
    return;
  }

  // Make sure the version number went upwards
  if (semver.gt(fromVersion, toVersion)) {
    tools.exit.failure(
      `New version is less than the old version. ${fromVersion} -> ${toVersion}`
    );
    return;
  }

  tools.log.debug(
    `${updatedApiName} has changed ${fromVersion} -> ${toVersion}`
  );

  tools.log.debug(`Fetching PR that the commit was part of`);
  // If the version field was removed, error
  // Which PR was this commit a part of? We need the description from it
  let pr = await tools.github.repos.listPullRequestsAssociatedWithCommit({
    owner,
    repo,
    commit_sha
  });

  if (!pr.data[0]) {
    tools.exit.failure("There seems to be a change without a PR. Exiting");
    return;
  }

  let prBody = pr.data[0].body;

  const stringsToRemove = [
    "# Description\r\n\r\n",
    "# Checklist\r\n\r\n- [x] version number incremented (in the `info` section of the spec)"
  ];

  for (let str of stringsToRemove) {
    prBody = prBody.replace(str, "");
  }

  prBody = prBody.trim();

  tools.log.debug(`Generating release information`);

  // Generate our release notes
  let tagName = `${humanApiName}-${toVersion}`;
  let titleApiName =
    humanApiName.charAt(0).toUpperCase() + humanApiName.slice(1);
  let releaseTitle = `${titleApiName} API v${toVersion}`;
  let releaseNotes = prBody;

  tools.log.info("Tag: " + tagName);
  tools.log.info("Commit: " + commit_sha);
  tools.log.info("Release Title: " + releaseTitle);
  tools.log.info("Release Notes: " + releaseNotes);

  try {
    let release = await tools.github.repos.createRelease({
      owner,
      repo,
      name: releaseTitle,
      body: releaseNotes,
      tag_name: tagName,
      target_commitish: commit_sha
    });

    tools.exit.success("Release created");
  } catch (e) {
    tools.exit.failure(
      `Error creating release. Does '${releaseTitle}' already exist?`
    );
    return;
  }
});
