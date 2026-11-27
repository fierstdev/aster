export function Badge(props: { label: string; count: number }) {
  return <span title={props.label}>🪴 {props.count}</span>;
}
