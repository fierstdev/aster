import { renderDocument, type RevivalManifest } from '@fierst/aster/ssr';
import { Panel, List, Check, Routed, Composition, activate } from './Panel';
import { Router } from '@fierst/aster/router';

export function page(manifest: RevivalManifest) {
  return renderDocument(
    <>
      <Panel label="SSR">Child label</Panel>
      <List />
      <Check />
      <Panel label="Outer">
        <strong>Nested markup</strong>
        <button onClick={activate}>Exported callback</button>
        <Panel label="Inner" />
      </Panel>
      <Composition label="Captured" />
      <Router routes={[{ path: '/users/:id', component: Routed }]} url="/users/one?tab=info" />
    </>,
    { manifest },
  );
}
