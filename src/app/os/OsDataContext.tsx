'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { getTopImprovements, findSkill } from './playerProfile';
import type { Skill, SkillCategory } from './playerProfile';
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

export function useTopImprovements(count: number): { label: string; seasonalChange: number }[] {
  const { skillCategories } = useOsData();
  return getTopImprovements(skillCategories, count);
}

export function useFindSkill(skillId: string): { skill: Skill; category: SkillCategory } | null {
  const { skillCategories } = useOsData();
  return findSkill(skillCategories, skillId);
}
