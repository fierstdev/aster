import { renderDocument, type RevivalManifest } from '@fierst/aster/ssr';
import { Panel, List, Check, Routed } from './Panel';
import { Router } from '@fierst/aster/router';

export function page(manifest: RevivalManifest) {
  return renderDocument(
    <>
      <Panel label="SSR">Child label</Panel>
      <List />
      <Check />
      <Router routes={[{ path: '/users/:id', component: Routed }]} url="/users/one?tab=info" />
    </>,
    { manifest },
  );
}
