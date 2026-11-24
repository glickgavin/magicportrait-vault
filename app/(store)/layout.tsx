/** The open store (docs/open-store.md): its own route group, so the customer pages' layout and checks don't apply. */
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
