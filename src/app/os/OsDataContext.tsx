'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { DEMO_OS_DATA } from './osData';
import type { OsData } from './osData';

export type { OsData } from './osData';
export { DEMO_OS_DATA } from './osData';

const OsDataContext = createContext<OsData>(DEMO_OS_DATA);

export function OsDataProvider({ value, children }: { value: OsData; children: ReactNode }) {
  return <OsDataContext.Provider value={value}>{children}</OsDataContext.Provider>;
}

export function useOsData(): OsData {
  return useContext(OsDataContext);
}
