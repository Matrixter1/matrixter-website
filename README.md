# matrixter-website
## Journal publishing

The existing CMS writes Markdown in `_posts`. With Node 18 or later, run `npm ci` followed by `npm run build` at the repository root. This renders the homepage cards, article directories and sitemap from the same source. Front matter uses the fields in `admin/config.yml`. Keep the filename slug stable when editing an article so incoming links keep working. When retiring a post, also remove its generated HTML file and decide where its old URL should lead.

Static outputs are committed so a branch preview can serve them directly. Before enabling CMS edits after release, confirm the existing Netlify build runs this command (append it to any existing build steps), using the current publish directory. Verify by changing a post in a preview and confirming the article, index and metadata all update. Do not change the CMS production branch or publish-directory settings for local testing.
