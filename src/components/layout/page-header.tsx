import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

interface PageHeader {
  title: string;
  description?: string;
}

interface ContextValue {
  header: PageHeader | null;
  setHeader: (header: PageHeader | null) => void;
}

const PageHeaderContext = createContext<ContextValue>({ header: null, setHeader: () => {} });

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<PageHeader | null>(null);
  const value = useMemo(() => ({ header, setHeader }), [header]);
  return <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>;
}

export function usePageHeaderValue() {
  return useContext(PageHeaderContext).header;
}

export function usePageHeader(header: PageHeader | null) {
  const { setHeader } = useContext(PageHeaderContext);
  const title = header?.title;
  const description = header?.description;

  useEffect(() => {
    setHeader(title ? { title, description } : null);
    return () => setHeader(null);
  }, [title, description, setHeader]);
}
