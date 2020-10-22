const { Toolkit } = require('actions-toolkit')
const core = require('@actions/core')
const documentationPattern = new RegExp("documentation|tutorials|use-cases")

// Run your GitHub Action!
Toolkit.run(async tools => {

  // Cache any common variables we need
  const action = tools.context.payload.action;
  const baseSha = tools.context.payload.before;
  const headSha = tools.context.payload.after;
  const owner = tools.context.payload.repository.owner.login;
  const repo = tools.context.payload.repository.name;

  const changes = await tools.github.repos.compareCommits({
    owner,
    repo,
    base: baseSha,
    head: headSha
  });
  tools.log.complete('Load file differences');

  let changedFiles = [];
  for (let file of changes.data.files) {
    if (file.blob_url.search(documentationPattern) && file.filename.split(".")[1] == "md") {
      if (file.status == 'removed') {
        tools.log.warn("Ignoring removed file");
        continue;
      }

      changedFiles.push(file.filename)
    }
  }

  console.log(changedFiles)
  core.setOutput('CHANGEDFILES', changedFiles)
  
  if (changedFiles.length) {
    changedFiles
    tools.exit.success('Finished with results of changed docs files')
  } else {
    tools.exit.success('There were no changed files for the query')
  }
});

