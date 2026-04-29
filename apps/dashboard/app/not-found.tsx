export default function NotFound() {
  return (
    <main className="min-h-screen bg-ink px-5 py-10 text-text lg:px-8">
      <div className="mx-auto w-full max-w-[960px] rounded-lg border border-line bg-panel p-6 shadow-control">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">The requested route does not exist in the Bastion dashboard.</p>
      </div>
    </main>
  );
}