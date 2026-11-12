export default function PublicLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <header className="border-b px-6 py-4">
        <span className="font-semibold">Dra. Eloísa Paiva</span>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="border-t px-6 py-4 text-sm text-zinc-600 dark:text-zinc-400">
        Consultório odontológico em Belo Horizonte
      </footer>
    </>
  );
}
