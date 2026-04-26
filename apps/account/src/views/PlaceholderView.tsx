export const PlaceholderView = ({
  title,
  blurb,
}: {
  title: string;
  blurb: string;
}) => (
  <div className="acct-placeholder">
    <span className="acct-placeholder-tag">FUTURE STAGE</span>
    <h2>{title}</h2>
    <p>{blurb}</p>
  </div>
);
