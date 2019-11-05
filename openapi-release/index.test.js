const { Toolkit } = require("actions-toolkit");
const nock = require("nock");

process.env.GITHUB_WORKFLOW = "test";
process.env.GITHUB_ACTION = "openapi-release";
process.env.GITHUB_ACTOR = "nexmodev";
process.env.GITHUB_REPOSITORY = "nexmo/api-specification";
process.env.GITHUB_EVENT_NAME = "push";
process.env.GITHUB_EVENT_PATH = __dirname + "/fixtures/push-to-master.json";
process.env.GITHUB_WORKSPACE = "/tmp";
process.env.GITHUB_SHA = "abc123";

describe("OAS Release Action", () => {
  let action, tools;

  // Mock Toolkit.run to define `action` so we can call it
  Toolkit.run = jest.fn(actionFn => {
    action = actionFn;
  });
  // Load up our entrypoint file
  require(".");

  beforeEach(() => {
    tools = new Toolkit();
    tools.context.ref = "refs/heads/master";
    tools.log.debug = jest.fn();
    tools.log.info = jest.fn();
  });

  describe("Ensure that we're on the correct branch", () => {
    it("default branch (master)", () => {
      tools.exit.neutral = jest.fn();
      tools.context.ref = "refs/heads/other-branch";
      action(tools);
      expect(tools.exit.neutral).toHaveBeenCalledWith(
        `Expected refs/heads/master, got ${tools.context.ref}. Stopping execution`
      );
    });

    it("environment set branch (env-set-branch)", () => {
      tools.exit.neutral = jest.fn();
      process.env.OAS_RELEASE_ACTIVE_BRANCH = "env-set-branch";
      action(tools);
      expect(tools.exit.neutral).toHaveBeenCalledWith(
        `Expected refs/heads/env-set-branch, got ${tools.context.ref}. Stopping execution`
      );
      process.env.OAS_RELEASE_ACTIVE_BRANCH = "";
    });
  });

  describe("Change detection", () => {
    it("exits with files with no version changes", async () => {
      let owner = tools.context.payload.repository.owner.name;
      let repo = tools.context.payload.repository.name;

      mockReleases(repo, owner);

      mockCommitDiff(
        repo,
        owner,
        `--- README.md	2019-11-05 18:02:01.000000000 +0000
+++ README.md	2019-11-05 18:02:14.000000000 +0000
@@ -1 +1 @@
-This is the first line
+This is the changed line`
      );

      tools.exit.success = jest.fn();
      await action(tools);
      expect(tools.exit.success).toHaveBeenCalledWith(
        "No version change detected. Exiting"
      );
    });

    it("fails with changes in multiple files", async () => {
      let owner = tools.context.payload.repository.owner.name;
      let repo = tools.context.payload.repository.name;

      mockReleases(repo, owner);

      // Were there multiple version changes? Yes!
      mockCommitDiff(
        repo,
        owner,
        `
diff --git a/definitions/redact.yml b/definitions/redact.yml
index c2f8631..a55f4fb 100644
--- a/definitions/redact.yml
+++ b/definitions/redact.yml
@@ -1,7 +1,7 @@
 ---
 openapi: "3.0.0"
 info:
-  version: 1.0.2
+  version: 1.0.3
   title: "Redact API"
   description: This is a redact description
   contact:
diff --git a/definitions/reports.yml b/definitions/reports.yml
index ad8ad0b..780f370 100644
--- a/definitions/reports.yml
+++ b/definitions/reports.yml
@@ -1,6 +1,6 @@
 openapi: "3.0.0"
 info:
-  version: 2.0.3
+  version: 2.0.4
   title: Reports API
   description: This is a reports description
`
      );

      // If so, let's exit
      tools.exit.failure = jest.fn();
      await action(tools);
      expect(tools.exit.failure).toHaveBeenCalledWith(
        `Multiple changes detected in a single commit. Manual changelog required: definitions/redact.yml, definitions/reports.yml`
      );
    });

    it("passes with a single version update, but the version was removed", async () => {
      let owner = tools.context.payload.repository.owner.name;
      let repo = tools.context.payload.repository.name;

      mockReleases(repo, owner);

      mockCommitDiff(
        repo,
        owner,
        `
diff --git a/definitions/numbers.yml b/definitions/numbers.yml
index f8bfcaf..5a703fc 100644
--- a/definitions/numbers.yml
+++ b/definitions/numbers.yml
@@ -1,7 +1,6 @@
 openapi: 3.0.0
 info:
   title: Numbers API
-  version: 1.0.9
   description: This is a numbers description
`
      );

      tools.exit.failure = jest.fn();
      await action(tools);
      expect(tools.exit.failure).toHaveBeenCalledWith(
        `The version key is missing in the new commit`
      );
    });

    it("passes with a single version update, but the version went down", async () => {
      let owner = tools.context.payload.repository.owner.name;
      let repo = tools.context.payload.repository.name;

      mockReleases(repo, owner);

      mockCommitDiff(
        repo,
        owner,
        `
diff --git a/definitions/numbers.yml b/definitions/numbers.yml
index f8bfcaf..5a703fc 100644
--- a/definitions/numbers.yml
+++ b/definitions/numbers.yml
@@ -1,7 +1,6 @@
 openapi: 3.0.0
 info:
   title: Numbers API
-  version: 1.0.10
+  version: 1.0.9
   description: This is a numbers description
`
      );

      tools.exit.failure = jest.fn();
      await action(tools);
      expect(tools.exit.failure).toHaveBeenCalledWith(
        `New version is less than the old version. 1.0.10 -> 1.0.9`
      );
    });

    it("valid update but no PR", async () => {
      let owner = tools.context.payload.repository.owner.name;
      let repo = tools.context.payload.repository.name;

      mockReleases(repo, owner);

      mockCommitDiff(
        repo,
        owner,
        `
diff --git a/definitions/numbers.yml b/definitions/numbers.yml
index f8bfcaf..5a703fc 100644
--- a/definitions/numbers.yml
+++ b/definitions/numbers.yml
@@ -1,7 +1,6 @@
 openapi: 3.0.0
 info:
   title: Numbers API
-  version: 1.0.9
+  version: 1.0.10
   description: This is a numbers description
`
      );

      // No PRs for this commit
      mockPrsForCommit(repo, owner, []);

      tools.exit.failure = jest.fn();
      await action(tools);
      expect(tools.exit.failure).toHaveBeenCalledWith(
        `There seems to be a change without a PR. Exiting`
      );
    });

    it("is a new API and creates a release", async () => {
      let owner = tools.context.payload.repository.owner.name;
      let repo = tools.context.payload.repository.name;

      mockReleases(repo, owner);

      mockCommitDiff(
        repo,
        owner,
        `
diff --git a/definitions/test.yml b/definitions/test.yml
new file mode 100644
index 0000000..5a703fc
--- /dev/null
+++ b/definitions/test.yml
@@ -0,0 +1,5 @@
+openapi: 3.0.0
+info:
+  title: Test API
+  version: 1.0.10
+  description: This is a description
`
      );

      mockPrsForCommit(repo, owner);

      let releaseBody = {
        name: "Test API v1.0.10",
        body:
          "Numbers API has new filters to make it easier to find numbers that are (or are not!) associated with applications\r\n" +
          "\r\n" +
          "# New \r\n" +
          "\r\n" +
          "Added new `has_application` and `application_id` filters to the Numbers API",
        tag_name: "test-1.0.10",
        target_commitish: "34e6b602668b883822364f3f5b87c3940269dcf3"
      };

      mockSuccessfulRelease(repo, owner, releaseBody);
      tools.exit.success = jest.fn();
      await action(tools);
      expect(tools.exit.success).toHaveBeenCalledWith(`Release created`);
    });

    it("valid update with PR creates a release", async () => {
      let owner = tools.context.payload.repository.owner.name;
      let repo = tools.context.payload.repository.name;

      mockReleases(repo, owner);

      mockCommitDiff(
        repo,
        owner,
        `
diff --git a/definitions/numbers.yml b/definitions/numbers.yml
index f8bfcaf..5a703fc 100644
--- a/definitions/numbers.yml
+++ b/definitions/numbers.yml
@@ -1,7 +1,6 @@
 openapi: 3.0.0
 info:
   title: Numbers API
-  version: 1.0.9
+  version: 1.0.10
   description: This is a numbers description
`
      );

      mockPrsForCommit(repo, owner);

      let releaseBody = {
        name: "Numbers API v1.0.10",
        body:
          "Numbers API has new filters to make it easier to find numbers that are (or are not!) associated with applications\r\n" +
          "\r\n" +
          "# New \r\n" +
          "\r\n" +
          "Added new `has_application` and `application_id` filters to the Numbers API",
        tag_name: "numbers-1.0.10",
        target_commitish: "34e6b602668b883822364f3f5b87c3940269dcf3"
      };
      mockSuccessfulRelease(repo, owner, releaseBody);
      tools.exit.success = jest.fn();
      await action(tools);
      expect(tools.exit.success).toHaveBeenCalledWith(`Release created`);
    });

    it("duplicate release fails", async () => {
      let owner = tools.context.payload.repository.owner.name;
      let repo = tools.context.payload.repository.name;

      mockReleases(repo, owner);

      mockCommitDiff(
        repo,
        owner,
        `
diff --git a/definitions/numbers.yml b/definitions/numbers.yml
index f8bfcaf..5a703fc 100644
--- a/definitions/numbers.yml
+++ b/definitions/numbers.yml
@@ -1,7 +1,6 @@
 openapi: 3.0.0
 info:
   title: Numbers API
-  version: 1.0.9
+  version: 1.0.10
   description: This is a numbers description
`
      );

      mockPrsForCommit(repo, owner);

      // Mock the release request and make it fail
      nock("https://api.github.com")
        .post(`/repos/${owner}/${repo}/releases`)
        .reply(400);

      tools.exit.failure = jest.fn();
      await action(tools);
      expect(tools.exit.failure).toHaveBeenCalledWith(
        `Error creating release. Does 'Numbers API v1.0.10' already exist?`
      );
    });
  });
});

function mockReleases(repo, owner) {
  nock("https://api.github.com")
    .get(`/repos/${owner}/${repo}/releases?per_page=1&page=1`)
    .reply(200, [
      { target_commitish: "3bf644c4094ae5016b68bc554c3d53121e7276bd" }
    ]);
}

function mockPrsForCommit(repo, owner, body) {
  body = body || [
    {
      body:
        "# Description\r\n\r\nNumbers API has new filters to make it easier to find numbers that are (or are not!) associated with applications\r\n\r\n# New \r\n\r\nAdded new `has_application` and `application_id` filters to the Numbers API\r\n\r\n# Checklist\r\n\r\n- [x] version number incremented (in the `info` section of the spec)\r\n"
    }
  ];

  nock("https://api.github.com")
    .get(
      `/repos/${owner}/${repo}/commits/34e6b602668b883822364f3f5b87c3940269dcf3/pulls`
    )
    .reply(200, body);
}

function mockSuccessfulRelease(repo, owner, releaseBody) {
  nock("https://api.github.com")
    .post(`/repos/${owner}/${repo}/releases`, releaseBody)
    .reply(200);
}

function mockCommitDiff(repo, owner, body) {
  nock("https://api.github.com")
    .get(
      `/repos/${owner}/${repo}/compare/3bf644c4094ae5016b68bc554c3d53121e7276bd...34e6b602668b883822364f3f5b87c3940269dcf3`
    )
    .reply(200, body);
}
