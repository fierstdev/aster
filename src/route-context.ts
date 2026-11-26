export const routeContext = {
  id: Symbol.for('aster.router.context'),
  defaultValue: null as { url: string; params: Record<string, string> } | null,
};
