export function Status({ id, value }) {
  return (
    <span id={id} className={`status ${value.kind}`}>
      {value.text}
    </span>
  );
}
