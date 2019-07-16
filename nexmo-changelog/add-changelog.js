const { Toolkit } = require("actions-toolkit");
const fetch = require("node-fetch");

const tools = new Toolkit();

(async () => {

    if (tools.context.event !== "release") {
        console.log("Not a release. Skipping");
        process.exit(0);
    }

    if (tools.context.payload.action !== "published") {
        console.log(`Release status is not 'published'. Got '${tools.context.payload.action}'`);
        process.exit(0);
    }

    const release = tools.context.payload.release;
    const repoName = tools.context.payload.repository.name;

    // Use the title from the release, plus anything set in the environment
    let title = release.name;
    if (process.env.CHANGELOG_RELEASE_TITLE) {
        title = process.env.CHANGELOG_RELEASE_TITLE + ' ' + title;
    }

    // Then the content
    let content = release.body;

    // Sometimes we don't want to link to the release (e.g. if it's a private repo)
    if (!process.env.CHANGELOG_DISABLE_REPO_LINK) {
        content += "\n\n[" + release.html_url + "]("+release.html_url+")";
    }

    let category = (process.env.CHANGELOG_CATEGORY || 'General');
    let subcategory = (process.env.CHANGELOG_SUBCATEGORY || 'N/A');

    // Any prereleases go in to a beta category
    if (release.prerelease) {
        category += ' - Beta';
    }

    await addChangelogEntry(category, subcategory, title, content);
})();

function addChangelogEntry(category, subcategory, title, content) {
    return new Promise(async (resolve) => {
        let body = {
            title,
            content,
            category,
            subcategory,
        };

        let resp = await fetch(`https://nexmo-changelog.herokuapp.com/api/entry`, {
            method: "POST",
            body: JSON.stringify(body),
            headers: {
                Authorization: `Bearer ${process.env.CHANGELOG_AUTH_TOKEN}`,
                "Content-Type": "application/json; charset=UTF-8"
            }
        });

        if (resp.status == 201) {
            tools.exit.success('Changelog added');
        }

        tools.exit.failure('Error adding changelog: ' + resp.status);
    });
}
