import { Fragment } from "preact";
import { CREDITS, LINKS } from "../../content/about";

export const CreditsList = () => (
  <dl className="credits">
    {CREDITS.map(c => (
      <Fragment key={c.role}>
        <dt>{c.role}</dt>
        <dd>{c.who}</dd>
      </Fragment>
    ))}
  </dl>
);

const ALL_LINKS = [...LINKS, { label: 'Level editor', url: 'editor.html' }].filter(l => l.url);

export const LinksList = () => (
  <div className="links">
    {ALL_LINKS.map(l => {
      const external = /^https?:/.test(l.url);
      return (
        <a key={l.url} href={l.url} target={external ? '_blank' : undefined} rel={external ? 'noopener' : undefined}>
          {l.label}
        </a>
      );
    })}
  </div>
);
