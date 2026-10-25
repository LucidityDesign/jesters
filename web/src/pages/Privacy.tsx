import { marked } from "marked";
import policy from "../../../docs/privacy-policy.md?raw";
import { Link } from "../router";
import { t } from "../i18n";

// The policy is our own Markdown file from the repository, so rendering it as HTML is safe.
const html = marked.parse(policy, { async: false });

export function Privacy() {
  return (
    <main className="privacy">
      <p>
        <Link to="/">← Jesters</Link>
      </p>
      <article dangerouslySetInnerHTML={{ __html: html }} />
      <p>
        <Link to="/">{t("Back to your games")}</Link>
      </p>
    </main>
  );
}
