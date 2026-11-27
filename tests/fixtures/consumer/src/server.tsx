import { renderDocument, streamResponse, type RevivalManifest } from '@fierst/aster/ssr';
import { Panel, List, Check, Routed, Composition, activate, NativeForm } from './Panel';
import { Router } from '@fierst/aster/router';

export async function formDocuments(manifest: RevivalManifest, nonce: string) {
  const options = { manifest, nonce, importmap: {} };
  async function* Deferred() {
    yield <b>Loading</b>;
    await Promise.resolve();
    yield <b>Stream complete</b>;
  }
  return {
    ssr: renderDocument(<NativeForm />, options),
    stream: await streamResponse(
      <>
        <NativeForm />
        <Deferred />
      </>,
      options,
    ).text(),
  };
}

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
