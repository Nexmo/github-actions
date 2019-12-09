const { Toolkit } = require('actions-toolkit')
const yaml = require('yaml');
const fs = require('fs');

const nonDocumentationPattern = new RegExp([
  ".*\/(use-cases|tutorials)[\/|\.md].*" // Slash if there's something after, or .md if it's a file
].join('|'));

// Run your GitHub Action!
Toolkit.run(async tools => {

  // Cache any common variables we need
  const action = tools.context.payload.action;
  const baseSha = tools.context.payload.pull_request.base.sha;
  const headSha = tools.context.payload.pull_request.head.sha;
  const owner = tools.context.payload.repository.owner.login;
  const repo = tools.context.payload.repository.name;

  // Make sure that we're operating on a pull_request and that it's either a opened or synchronize event. If not, neutral exit
  let expectedActions = ['opened', 'synchronize'];
  if (expectedActions.indexOf(action) === -1) {
    tools.exit.neutral(`Expected one of: ${expectedActions.join(', ')} - got '${action}'`);
  }

  // if payload.body contains #no-redirect-check

  // Fetch the changes between head and base
  tools.log.info(`Base: ${baseSha}`);
  tools.log.info(`Head: ${headSha}`);

  tools.log.pending('Load commit differences');
  const changes = await tools.github.repos.compareCommits({
    owner,
    repo,
    base: baseSha,
    head: headSha
  });
  tools.log.complete('Load commit differences');

  // If any of the file statuses are renamed, check the previous_filename and build up a list
  tools.log.pending('Looking for renamed and removed files');
  let changedFiles = [];
  for (let file of changes.data.files) {
    let from, to;
    if (file.status == 'renamed') {
      if (file.previous_filename.substr(0, 14) != '_documentation') {
        tools.log.warn(`Ignorning renamed file not in _documentation folder: ${file.previous_filename}`);
        continue;
      }

      if (!fileBecameTabbedFolder(file.previous_filename, tools)) {
        changedFiles.push({
          from: file.previous_filename,
          to: pathToUrl(file.filename),
        });
      }
    }

    if (file.status == 'removed') {
      if (file.filename.substr(0, 14) != '_documentation') {
        tools.log.warn(`Ignorning deleted file not in _documentation folder: ${file.filename}`);
        continue;
      }

      if (!fileBecameTabbedFolder(file.filename, tools)) {
        changedFiles.push({
          from: file.filename,
          to: 'MISSING'
        });
      }
    }
  }
  tools.log.complete('Looking for renamed and removed files');

  if (changedFiles.length) {
    tools.log.pending('Loading redirects files');
    let redirects = yaml.parse(tools.getFile('config/redirects.yml'));
    let stitchRedirects = yaml.parse(tools.getFile('config/stitch-redirects.yml'));
    Object.assign(redirects, stitchRedirects);

    tools.log.complete('Loading redirects files');

    // Check if each rename/removal has an entry. If not, push in to array
    tools.log.pending('Checking if redirects exist');
    const errors = [];
    const foundRedirects = {};
    for (let change of changedFiles) {
      if (!redirects[pathToUrl(change.from)]) {
        errors.push(`"${pathToUrl(change.from)}": "${change.to}"`);
      } else {
        foundRedirects[change.from] = redirects[pathToUrl(change.from)];
      }
    }
    tools.log.complete('Checking if redirects exist');

    // If there is a redirect, make sure that the new destination exists
    for (let f in foundRedirects) {
      let path = `${tools.workspace}/_documentation/${getLocaleFromPath(f)}${foundRedirects[f]}.md`

      let missing = true;

      // If the file exists on disk the redirect is valid
      if (fs.existsSync(path)) {
        missing = false;
      }

      // Or if it matches one of our pre-approved routes
      if (path.match(nonDocumentationPattern)) {
        missing = false;
      }

      // If not, add an error
      if (missing) {
        errors.push(`Specified redirect could not be found: ${path}`)
      }
    }

    // If we have any entries without a redirect, fail the build
    if (errors.length) {
      tools.exit.failure(`Missing redirects: \n\n${errors.join("\n")}`)
    } else {
      tools.exit.success('No missing redirects');
    }
  } else {
    // Otherwise it's successful
    tools.exit.success('No missing redirects');
  }
}, { event: 'pull_request' })

function getLocaleFromPath(path) {
  return path.substr(15, 2);
}

function pathToUrl(path) {
    return path.substr(17).slice(0, -3);
}

function fileBecameTabbedFolder(filename, tools) {
    // Remove the last segment the try and load the config file
    filename = filename.slice(0, filename.lastIndexOf('/'));
    filename += "/.config.yml"
    try {
        const config = yaml.parse(tools.getFile(filename));
        return config.tabbed;
    } catch (e){
        // File didn't exist, or it wasn't YAML. Either way, it's not a
        // tabbed folder
        return false;
    }
}
